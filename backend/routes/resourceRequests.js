const express = require('express');
const router = express.Router();
const ResourceRequest = require('../models/ResourceRequest');
const Inventory = require('../models/Inventory');
const { auth } = require('../middleware/auth');
const { allowRoles } = require('../middleware/roles');
const { validate } = require('../middleware/validate');
const { resourceRequestSchema } = require('../validators/schemas');
// const { sendWhatsAppMessage } = require('../services/whatsappService'); // optional

// Create a request (hospital admin only)
router.post('/', auth, allowRoles('admin', 'superadmin'), validate(resourceRequestSchema), async (req, res) => {
  try {
    const { supplyingHospitalId, resourceType, bloodGroup, units, notes } = req.body;
    // Admin/staff request on behalf of their own hospital; superadmin must say
    // which hospital is requesting.
    const requestingHospitalId = req.user.hospitalId || req.body.requestingHospitalId;
    if (!requestingHospitalId) {
      return res.status(400).json({ error: 'Select which hospital is requesting.' });
    }
    if (requestingHospitalId.toString() === supplyingHospitalId?.toString()) {
      return res.status(400).json({ error: 'A hospital cannot request from itself.' });
    }

    // Optional: check if supplying hospital actually has enough stock
    const inventory = await Inventory.findOne({
      hospitalId: supplyingHospitalId,
      resourceType,
      bloodGroup,
      units: { $gte: units }
    });
    if (!inventory) {
      return res.status(400).json({ error: 'Supplying hospital does not have enough stock' });
    }

    const request = new ResourceRequest({
      requestingHospitalId,
      supplyingHospitalId,
      resourceType,
      bloodGroup,
      units,
      notes,
    });
    await request.save();

    // Optional: send WhatsApp notification to supplying hospital admin
    // (you'll need to fetch the admin's phone from User model where role='admin' and hospitalId=supplyingHospitalId)

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
      .populate('requestingHospitalId', 'name contactPhone')
      .populate('supplyingHospitalId', 'name contactPhone')
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
      .populate('supplyingHospitalId', 'name contactPhone')
      .sort({ requestedAt: -1 });
    res.json(requests);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// Approve or decline a request (supplying hospital admin)
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

    request.status = status;
    request.respondedAt = Date.now();
    await request.save();

    // If approved, automatically deduct from supplying hospital's inventory
    if (status === 'approved') {
      const inventory = await Inventory.findOne({
        hospitalId: request.supplyingHospitalId,
        resourceType: request.resourceType,
        bloodGroup: request.bloodGroup,
      });
      if (inventory) {
        inventory.units -= request.units;
        await inventory.save();
      }
      // Optionally, add to requesting hospital's inventory? Usually the requesting hospital receives the physical units, so you might want to increase their stock.
      // But better to let the requesting hospital manually add after delivery. Or automate both.
    }

    res.json(request);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark request as completed (requesting hospital after receiving)
router.put('/:id/complete', auth, async (req, res) => {
  try {
    const request = await ResourceRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    const isSuper = req.user.role === 'superadmin';
    if (!isSuper && request.requestingHospitalId.toString() !== req.user.hospitalId?.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (request.status !== 'approved') {
      return res.status(400).json({ error: 'Only approved requests can be completed' });
    }
    request.status = 'completed';
    request.completedAt = Date.now();
    await request.save();

    // Increase requesting hospital's inventory
    let inventory = await Inventory.findOne({
      hospitalId: request.requestingHospitalId,
      resourceType: request.resourceType,
      bloodGroup: request.bloodGroup,
    });
    if (inventory) {
      inventory.units += request.units;
      await inventory.save();
    } else {
      // create new inventory record
      inventory = new Inventory({
        hospitalId: request.requestingHospitalId,
        resourceType: request.resourceType,
        bloodGroup: request.bloodGroup,
        units: request.units,
      });
      await inventory.save();
    }
    res.json(request);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;