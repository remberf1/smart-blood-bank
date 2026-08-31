const express = require("express");
const router = express.Router();
const PatientRequest = require("../models/PatientRequest");
const { allocateBlood } = require("../services/allocationService");
const { consumeForDelivery } = require("../services/inventoryService");
const { notifyRequestStatus } = require("../services/notificationService");
const { auth } = require("../middleware/auth");
const { allowRoles, canAccessHospital } = require("../middleware/roles");
const { validate } = require("../middleware/validate");
const { patientRequestSchema } = require("../validators/schemas");

// ------------------- Public (no authentication) -------------------
// Create a new request (supports advance scheduling)
router.post("/", validate(patientRequestSchema), async (req, res) => {
  try {
    const { resourceType, bloodGroup, scheduledTime, ...rest } = req.body;

    const request = new PatientRequest({
      resourceType,
      bloodGroup,
      scheduledTime: scheduledTime ? new Date(scheduledTime) : undefined,
      deliveryStatus: "pending",
      ...rest
    });
    await request.save();
    if (resourceType === "blood") allocateBlood().catch(console.error);
    res.status(201).json({ message: "Request received", requestId: request._id, request });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// Track requests by phone number (for patients/families)
router.get("/track/:phone", async (req, res) => {
  try {
    const requests = await PatientRequest.find({ contactPhone: req.params.phone })
      .populate("preferredHospitalId", "name address contactPhone")
      .sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------- Hospital admin (authentication required) -------------------
// List patient requests (admin/staff = own hospital; superadmin = all).
// Query: ?status=&page=&limit=&hospitalId= (hospitalId superadmin-only).
router.get("/", auth, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const skip = (page - 1) * limit;

    // A hospital user with no hospital sees nothing (avoid an unscoped query).
    if (req.user.role !== "superadmin" && !req.user.hospitalId) {
      return res.json({ data: [], page, limit, total: 0, totalPages: 1 });
    }

    const filter = {};
    if (req.query.status) filter.deliveryStatus = req.query.status;
    if (req.user.role !== "superadmin") {
      filter.$or = [
        { allocatedHospitalId: req.user.hospitalId },
        { preferredHospitalId: req.user.hospitalId },
      ];
    } else if (req.query.hospitalId) {
      filter.$or = [
        { allocatedHospitalId: req.query.hospitalId },
        { preferredHospitalId: req.query.hospitalId },
      ];
    }

    const [data, total] = await Promise.all([
      PatientRequest.find(filter)
        .populate("preferredHospitalId", "name")
        .populate("allocatedHospitalId", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      PatientRequest.countDocuments(filter),
    ]);

    res.json({ data, page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all requests for a specific hospital (own hospital or superadmin)
router.get("/hospital/:hospitalId", auth, async (req, res) => {
  try {
    if (!canAccessHospital(req.user, req.params.hospitalId)) {
      return res.status(403).json({ error: "You can only view your own hospital's requests" });
    }
    const requests = await PatientRequest.find({ preferredHospitalId: req.params.hospitalId })
      .sort({ scheduledTime: 1, createdAt: 1 });
    res.json(requests);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// Traceability: which batches/donors fulfilled a request (own hospital or superadmin)
router.get("/:id/trace", auth, async (req, res) => {
  try {
    const request = await PatientRequest.findById(req.params.id)
      .populate("fulfilledBatches.donorId", "name bloodGroup phone")
      .populate("fulfilledBatches.batchId", "collectionDate expiryDate source");
    if (!request) return res.status(404).json({ error: "Request not found" });

    const scopeHospitalId = request.allocatedHospitalId || request.preferredHospitalId;
    if (!canAccessHospital(req.user, scopeHospitalId)) {
      return res.status(403).json({ error: "You can only trace your own hospital's requests" });
    }

    res.json({
      requestId: request._id,
      patientName: request.patientName,
      bloodGroup: request.bloodGroup,
      units: request.units,
      deliveryStatus: request.deliveryStatus,
      deliveredAt: request.deliveredAt,
      fulfilledBatches: request.fulfilledBatches,
    });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// Update delivery status (approved, in-transit, delivered, cancelled)
router.put("/:id/status", auth, allowRoles("admin", "superadmin"), async (req, res) => {
  try {
    const { deliveryStatus } = req.body;

    const request = await PatientRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ error: "Request not found" });
    const previousStatus = request.deliveryStatus;

    // Only the fulfilling/preferred hospital (or superadmin) may drive status.
    const scopeHospitalId = request.allocatedHospitalId || request.preferredHospitalId;
    if (!canAccessHospital(req.user, scopeHospitalId)) {
      return res.status(403).json({ error: "You can only update your own hospital's requests" });
    }

    // Delivering a blood request atomically consumes FEFO stock AND marks the
    // request delivered (transaction) — no oversell, no double-consume on retry.
    const isBloodDelivery =
      deliveryStatus === "delivered" &&
      request.deliveryStatus !== "delivered" &&
      request.resourceType === "blood" &&
      request.allocatedHospitalId;

    if (isBloodDelivery) {
      const result = await consumeForDelivery(request); // consumes + marks delivered + saves
      if (!result.ok) {
        return res.status(409).json({
          error: `Allocated hospital no longer has enough non-expired stock (short ${result.shortfall} unit(s))`,
        });
      }
    } else {
      request.deliveryStatus = deliveryStatus;
      request.updatedAt = Date.now();
      if (deliveryStatus === "approved") request.approvedAt = Date.now();
      if (deliveryStatus === "in-transit") request.inTransitAt = Date.now();
      if (deliveryStatus === "delivered") request.deliveredAt = Date.now();
      await request.save();
    }

    // Best-effort: notify the patient when the status actually changed.
    if (deliveryStatus !== previousStatus) {
      notifyRequestStatus(request).catch(() => {});
    }

    res.json(request);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// Assign (or claim) a fulfilling hospital for a request. Superadmin may assign
// any hospital; an admin/staff may claim it for their own hospital. Moves a
// pending request to 'approved'.
router.post("/:id/assign", auth, allowRoles("admin", "superadmin"), async (req, res) => {
  try {
    const { hospitalId } = req.body;
    if (!hospitalId) return res.status(400).json({ error: "hospitalId is required" });
    if (!canAccessHospital(req.user, hospitalId)) {
      return res.status(403).json({ error: "You can only assign requests to your own hospital" });
    }
    const request = await PatientRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ error: "Request not found" });

    request.allocatedHospitalId = hospitalId;
    if (request.deliveryStatus === "pending") {
      request.deliveryStatus = "approved";
      request.approvedAt = Date.now();
    }
    request.updatedAt = Date.now();
    await request.save();
    notifyRequestStatus(request).catch(() => {});
    res.json(request);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// General update (admin/superadmin, own hospital only)
router.put("/:requestId", auth, allowRoles("admin", "superadmin"), async (req, res) => {
  try {
    const request = await PatientRequest.findById(req.params.requestId);
    if (!request) return res.status(404).json({ error: "Request not found" });

    const scopeHospitalId = request.allocatedHospitalId || request.preferredHospitalId;
    if (!canAccessHospital(req.user, scopeHospitalId)) {
      return res.status(403).json({ error: "You can only update your own hospital's requests" });
    }

    // Don't allow moving a request to another hospital via this generic update.
    const { preferredHospitalId, allocatedHospitalId, ...safeUpdate } = req.body;
    Object.assign(request, safeUpdate, { updatedAt: Date.now() });
    await request.save();
    res.json(request);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;