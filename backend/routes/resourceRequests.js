const express = require('express');
const router = express.Router();
const ResourceRequest = require('../models/ResourceRequest');
const Inventory = require('../models/Inventory');
const { auth } = require('../middleware/auth');
const { allowRoles } = require('../middleware/roles');
const { validate } = require('../middleware/validate');
const { resourceRequestSchema } = require('../validators/schemas');
const { logAudit } = require('../services/auditService');
const { addBloodUnits, removeBloodUnits } = require('../services/inventoryService');
const { allocateBlood, allocateOxygen } = require('../services/allocationService');

// Create a request (hospital admin & staff)
router.post('/', auth, allowRoles('admin', 'superadmin', 'staff'), validate(resourceRequestSchema), async (req, res) => {
  try {
    const { supplyingHospitalId, resourceType, bloodGroup, componentType, units, notes } = req.body;
    // Admin/staff request on behalf of their own hospital; superadmin must say
    // which hospital is requesting.
    const requestingHospitalId = req.user.hospitalId || req.body.requestingHospitalId;
    if (!requestingHospitalId) {
      return res.status(400).json({ error: 'Select which hospital is requesting.' });
    }
    if (requestingHospitalId.toString() === supplyingHospitalId?.toString()) {
      return res.status(400).json({ error: 'A hospital cannot request from itself.' });
    }

    const cType = componentType || 'PACKED_RED_CELLS';

    // Verify supplying hospital actually has enough unreserved stock
    if (resourceType === 'blood') {
      const inventory = await Inventory.findOne({
        hospitalId: supplyingHospitalId,
        resourceType: 'blood',
        bloodGroup,
        componentType: cType,
      });
      const available = Math.max(0, (inventory?.units || 0) - (inventory?.reservedUnits || 0));
      if (!inventory || available < units) {
        return res.status(400).json({
          error: `Supplying hospital does not have enough available blood stock (${available} units available, ${inventory?.reservedUnits || 0} reserved)`,
        });
      }
    } else if (resourceType === 'oxygen') {
      const inventory = await Inventory.findOne({
        hospitalId: supplyingHospitalId,
        resourceType: 'oxygen',
      });
      const available = Math.max(0, (inventory?.oxygenCylinderCount || 0) - (inventory?.reservedUnits || 0));
      if (!inventory || available < units) {
        return res.status(400).json({
          error: `Supplying hospital does not have enough available oxygen cylinders (${available} available, ${inventory?.reservedUnits || 0} reserved)`,
        });
      }
    }

    const request = new ResourceRequest({
      requestingHospitalId,
      supplyingHospitalId,
      resourceType,
      bloodGroup: resourceType === 'blood' ? bloodGroup : undefined,
      componentType: resourceType === 'blood' ? cType : undefined,
      units,
      notes,
    });
    await request.save();

    res.status(201).json(request);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// Requests to act on as the supplier. Superadmin sees the whole network (their
// oversight table); everyone else sees requests addressed to their hospital.
router.get('/incoming', auth, async (req, res) => {
  try {
    const filter = req.user.role === 'superadmin' ? {} : { supplyingHospitalId: req.user.hospitalId };
    const requests = await ResourceRequest.find(filter)
      .populate('requestingHospitalId', 'name contactPhone address')
      .populate('supplyingHospitalId', 'name contactPhone address')
      .populate('dispatchedBy', 'name role')
      .populate('receivedBy', 'name role')
      .sort({ requestedAt: -1 });
    res.json(requests);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// Requests I made. Superadmin acts from the network table above, so this is
// empty for them (avoids showing every request twice).
router.get('/outgoing', auth, async (req, res) => {
  try {
    if (req.user.role === 'superadmin') return res.json([]);
    const requests = await ResourceRequest.find({ requestingHospitalId: req.user.hospitalId })
      .populate('supplyingHospitalId', 'name contactPhone address')
      .populate('dispatchedBy', 'name role')
      .populate('receivedBy', 'name role')
      .sort({ requestedAt: -1 });
    res.json(requests);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// Step 1 -> 2: Approve or decline a request (supplying hospital admin)
// On approval: Blood moves from Available to Reserved at supplying hospital.
// Total physical units is NOT deducted yet (blood is still in the building).
router.put('/:id/respond', auth, allowRoles('admin', 'superadmin'), async (req, res) => {
  try {
    const { status } = req.body; // 'approved' or 'declined'
    const request = await ResourceRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    const isSuper = req.user.role === 'superadmin';
    if (!isSuper && request.supplyingHospitalId.toString() !== req.user.hospitalId?.toString()) {
      return res.status(403).json({ error: 'Not authorized to respond to this request' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Request already processed' });
    }

    if (status === 'approved') {
      if (request.resourceType === 'blood') {
        const inventory = await Inventory.findOne({
          hospitalId: request.supplyingHospitalId,
          resourceType: 'blood',
          bloodGroup: request.bloodGroup,
          componentType: request.componentType || 'PACKED_RED_CELLS',
        });
        const available = Math.max(0, (inventory?.units || 0) - (inventory?.reservedUnits || 0));
        if (!inventory || available < request.units) {
          return res.status(400).json({
            error: `Insufficient available stock to approve. Available: ${available}, Requested: ${request.units}`,
          });
        }
        // Move units from Available to Reserved; physical units stays unchanged!
        inventory.reservedUnits = (inventory.reservedUnits || 0) + request.units;
        inventory.lastUpdatedAt = Date.now();
        await inventory.save();
      } else {
        const inventory = await Inventory.findOne({
          hospitalId: request.supplyingHospitalId,
          resourceType: 'oxygen',
        });
        if (inventory) {
          inventory.reservedUnits = (inventory.reservedUnits || 0) + request.units;
          inventory.lastUpdatedAt = Date.now();
          await inventory.save();
        }
      }
    }

    request.status = status;
    request.respondedAt = Date.now();
    request.respondedBy = req.user._id;
    await request.save();

    logAudit(req.user, 'resource-request.respond', {
      entity: 'ResourceRequest', entityId: request._id,
      summary: status === 'approved'
        ? `Request approved. Reserved ${request.units}u ${request.bloodGroup || request.resourceType} for requesting hospital (physical inventory intact).`
        : `Request declined (${request.units}u ${request.bloodGroup || request.resourceType}).`,
    });

    res.json(request);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// Step 2 -> 3: Packed & Dispatched to courier (supplying hospital lab tech / staff)
// System Action: Units move from "Reserved" to "In-Transit".
// Officially deducted from supplying hospital physical inventory as it physically leaves the building.
router.put('/:id/dispatch', auth, allowRoles('admin', 'superadmin', 'staff'), async (req, res) => {
  try {
    const request = await ResourceRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    const isSuper = req.user.role === 'superadmin';
    if (!isSuper && request.supplyingHospitalId.toString() !== req.user.hospitalId?.toString()) {
      return res.status(403).json({ error: 'Not authorized to dispatch this request. Only supplying facility staff can hand over blood.' });
    }
    if (request.status !== 'approved') {
      return res.status(400).json({ error: `Cannot dispatch request with status '${request.status}'. Request must be in 'approved' (reserved) status.` });
    }

    const { courierName, trackingNumber, coldBoxSealNumber, notes } = req.body;

    // Release reservation and deduct from physical inventory
    if (request.resourceType === 'blood') {
      const inventory = await Inventory.findOne({
        hospitalId: request.supplyingHospitalId,
        resourceType: 'blood',
        bloodGroup: request.bloodGroup,
        componentType: request.componentType || 'PACKED_RED_CELLS',
      });
      if (inventory) {
        inventory.reservedUnits = Math.max(0, (inventory.reservedUnits || 0) - request.units);
        await inventory.save();
      }

      // Officially deduct physical units via FEFO (blood physically leaves the facility)
      const shortfall = await removeBloodUnits({
        hospitalId: request.supplyingHospitalId,
        bloodGroup: request.bloodGroup,
        componentType: request.componentType || 'PACKED_RED_CELLS',
        units: request.units,
      });
      if (shortfall > 0) {
        console.warn(`Shortfall of ${shortfall} units while physically dispatching blood transfer.`);
      }
    } else {
      const inventory = await Inventory.findOne({
        hospitalId: request.supplyingHospitalId,
        resourceType: 'oxygen',
      });
      if (inventory) {
        inventory.reservedUnits = Math.max(0, (inventory.reservedUnits || 0) - request.units);
        inventory.oxygenCylinderCount = Math.max(0, (inventory.oxygenCylinderCount || 0) - request.units);
        inventory.lastUpdatedAt = Date.now();
        await inventory.save();
      }
    }

    request.status = 'dispatched';
    request.dispatchedAt = Date.now();
    request.dispatchedBy = req.user._id;
    if (courierName) request.courierName = courierName;
    if (trackingNumber) request.trackingNumber = trackingNumber;
    if (coldBoxSealNumber) request.coldBoxSealNumber = coldBoxSealNumber;
    if (notes) request.dispatchNotes = notes;
    await request.save();

    logAudit(req.user, 'resource-request.dispatch', {
      entity: 'ResourceRequest',
      entityId: request._id,
      summary: `Dispatched ${request.units}u ${request.bloodGroup || request.resourceType} into courier transit. Deducted from supplying hospital physical ledger. Courier: ${courierName || 'Unassigned'}`,
    });

    res.json(request);
  } catch (err) {
    console.error('Error dispatching resource request:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Step 3 -> 4: Delivered / Completed (requesting hospital confirms receipt)
// System Action: Units are added to requesting hospital ledger.
router.put('/:id/complete', auth, async (req, res) => {
  try {
    const request = await ResourceRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    const isSuper = req.user.role === 'superadmin';
    if (!isSuper && request.requestingHospitalId.toString() !== req.user.hospitalId?.toString()) {
      return res.status(403).json({ error: 'Not authorized to confirm receipt for this request' });
    }
    // Must be dispatched (or approved for backwards compatibility)
    if (request.status !== 'dispatched' && request.status !== 'approved') {
      return res.status(400).json({ error: `Cannot complete request with status '${request.status}'. Request must be dispatched / in-transit.` });
    }

    // If completing directly from approved (legacy fallback), deduct from supplier if not already deducted
    if (request.status === 'approved') {
      if (request.resourceType === 'blood') {
        const inv = await Inventory.findOne({
          hospitalId: request.supplyingHospitalId,
          resourceType: 'blood',
          bloodGroup: request.bloodGroup,
          componentType: request.componentType || 'PACKED_RED_CELLS',
        });
        if (inv) {
          inv.reservedUnits = Math.max(0, (inv.reservedUnits || 0) - request.units);
          await inv.save();
        }
        await removeBloodUnits({
          hospitalId: request.supplyingHospitalId,
          bloodGroup: request.bloodGroup,
          componentType: request.componentType || 'PACKED_RED_CELLS',
          units: request.units,
        });
      }
    }

    request.status = 'completed';
    request.completedAt = Date.now();
    request.receivedBy = req.user._id;
    if (req.body.notes) request.receivedNotes = req.body.notes;
    if (req.body.temperatureOnArrival != null) request.temperatureOnArrival = Number(req.body.temperatureOnArrival);
    request.intakeVerified = true;
    await request.save();

    logAudit(req.user, 'resource-request.complete', {
      entity: 'ResourceRequest', entityId: request._id,
      summary: `Received and intake confirmed for ${request.units}u ${request.bloodGroup || request.resourceType}. Added to requesting hospital inventory.`,
    });

    // Increase requesting hospital's inventory
    if (request.resourceType === 'blood') {
      await addBloodUnits({
        hospitalId: request.requestingHospitalId,
        bloodGroup: request.bloodGroup,
        componentType: request.componentType || 'PACKED_RED_CELLS',
        units: request.units,
        source: 'manual',
      });
      allocateBlood().catch(console.error);
    } else {
      let inventory = await Inventory.findOne({
        hospitalId: request.requestingHospitalId,
        resourceType: 'oxygen',
      });
      if (inventory) {
        inventory.oxygenCylinderCount = (inventory.oxygenCylinderCount || 0) + request.units;
        inventory.lastUpdatedAt = Date.now();
        await inventory.save();
      } else {
        inventory = new Inventory({
          hospitalId: request.requestingHospitalId,
          resourceType: 'oxygen',
          oxygenCylinderCount: request.units,
          oxygenFillStatus: 'full',
          units: 0,
        });
        await inventory.save();
      }
      allocateOxygen().catch(console.error);
    }
    res.json(request);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// Cancel a request (requesting hospital or superadmin; or supplying if not yet dispatched)
// If request was approved (reserved), releases the reservation back to available.
router.put('/:id/cancel', auth, async (req, res) => {
  try {
    const request = await ResourceRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    const isSuper = req.user.role === 'superadmin';
    const isRequester = request.requestingHospitalId.toString() === req.user.hospitalId?.toString();
    const isSupplier = request.supplyingHospitalId.toString() === req.user.hospitalId?.toString();

    if (!isSuper && !isRequester && !isSupplier) {
      return res.status(403).json({ error: 'Not authorized to cancel this request' });
    }

    if (request.status === 'dispatched' || request.status === 'completed') {
      return res.status(400).json({
        error: 'Cannot cancel request after physical dispatch. Blood has already physically left the supplying facility.',
      });
    }

    if (request.status === 'cancelled') {
      return res.status(400).json({ error: 'Request is already cancelled.' });
    }

    // If it was approved, release the reserved units back to available!
    if (request.status === 'approved') {
      if (request.resourceType === 'blood') {
        const inventory = await Inventory.findOne({
          hospitalId: request.supplyingHospitalId,
          resourceType: 'blood',
          bloodGroup: request.bloodGroup,
          componentType: request.componentType || 'PACKED_RED_CELLS',
        });
        if (inventory) {
          inventory.reservedUnits = Math.max(0, (inventory.reservedUnits || 0) - request.units);
          inventory.lastUpdatedAt = Date.now();
          await inventory.save();
        }
      } else {
        const inventory = await Inventory.findOne({
          hospitalId: request.supplyingHospitalId,
          resourceType: 'oxygen',
        });
        if (inventory) {
          inventory.reservedUnits = Math.max(0, (inventory.reservedUnits || 0) - request.units);
          inventory.lastUpdatedAt = Date.now();
          await inventory.save();
        }
      }
    }

    request.status = 'cancelled';
    request.cancelledAt = Date.now();
    await request.save();

    logAudit(req.user, 'resource-request.cancel', {
      entity: 'ResourceRequest',
      entityId: request._id,
      summary: `Cancelled request for ${request.units}u ${request.bloodGroup || request.resourceType}. Released active reservations back to available stock.`,
    });

    res.json(request);
  } catch (err) {
    console.error('Error cancelling request:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;