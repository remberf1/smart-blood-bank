const express = require("express");
const router = express.Router();
const PatientRequest = require("../models/PatientRequest");
const Inventory = require("../models/Inventory");
const { allocateBlood, allocateOxygen } = require("../services/allocationService");
const { consumeForDelivery } = require("../services/inventoryService");
const { notifyRequestStatus } = require("../services/notificationService");
const { auth } = require("../middleware/auth");
const { allowRoles, canAccessHospital } = require("../middleware/roles");
const { validate } = require("../middleware/validate");
const { patientRequestSchema } = require("../validators/schemas");
const { logAudit } = require("../services/auditService");

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
    if (resourceType === "oxygen") allocateOxygen().catch(console.error);
    res.status(201).json({ message: "Request received", requestId: request._id, request });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// Track requests by phone number or reference ID (for patients/families).
// Matches on last 10 digits for phone, or hex reference for ID.
router.get("/track/:query", async (req, res) => {
  try {
    const raw = String(req.params.query || "").trim();
    const digits = raw.replace(/\D/g, "");

    const mongoose = require('mongoose');
    if (mongoose.Types.ObjectId.isValid(raw) && raw.length === 24) {
      const single = await PatientRequest.findById(raw)
        .populate("preferredHospitalId", "name address contactPhone location")
        .populate("allocatedHospitalId", "name address contactPhone location");
      return res.json(single ? [single] : []);
    }

    if (/^[a-fA-F0-9]{4,24}$/.test(raw) && digits.length < 7) {
      const allRecent = await PatientRequest.find().sort({ createdAt: -1 }).limit(100)
        .populate("preferredHospitalId", "name address contactPhone location")
        .populate("allocatedHospitalId", "name address contactPhone location");
      const matched = allRecent.filter(r => r._id.toString().toLowerCase().endsWith(raw.toLowerCase()));
      return res.json(matched);
    }

    const filter =
      digits.length >= 10
        ? { contactPhone: new RegExp(digits.slice(-10) + "$") }
        : { contactPhone: raw };
    const requests = await PatientRequest.find(filter)
      .populate("preferredHospitalId", "name address contactPhone location")
      .populate("allocatedHospitalId", "name address contactPhone location")
      .sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// Patient self-service cancellation (unauthenticated, secured by matching contact phone)
router.post("/:id/cancel", async (req, res) => {
  try {
    const { phone, reason } = req.body;
    if (!phone) return res.status(400).json({ error: "Contact phone is required to verify identity" });

    const request = await PatientRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ error: "Request not found" });

    // Validate phone matches contactPhone on the record (matches on last 10 digits)
    const reqDigits = String(request.contactPhone || "").replace(/\D/g, "");
    const inDigits = String(phone || "").replace(/\D/g, "");
    const match =
      reqDigits === inDigits ||
      (reqDigits.length >= 10 && inDigits.length >= 10 && reqDigits.slice(-10) === inDigits.slice(-10));

    if (!match) {
      return res.status(403).json({ error: "Phone number does not match the record for this request" });
    }

    if (request.deliveryStatus === "cancelled") {
      return res.status(400).json({ error: "This request has already been cancelled" });
    }
    if (request.deliveryStatus === "in-transit" || request.deliveryStatus === "delivered") {
      return res.status(400).json({
        error: `Cannot cancel: request is already ${request.deliveryStatus}. Please contact the hospital directly.`,
      });
    }

    const previousStatus = request.deliveryStatus;
    request.deliveryStatus = "cancelled";
    request.cancellationReason = reason || "Cancelled by patient / requester";
    request.cancelledAt = new Date();
    request.updatedAt = new Date();
    await request.save();

    // Re-run allocation engine to release any reserved stock to other waiting patients immediately
    if (request.resourceType === "blood") allocateBlood().catch(console.error);
    if (request.resourceType === "oxygen") allocateOxygen().catch(console.error);

    notifyRequestStatus(request).catch(() => {});
    logAudit(
      { name: request.patientName || "Patient", role: "public", email: request.email },
      "patient-request.cancel",
      {
        entity: "PatientRequest",
        entityId: request._id,
        summary: `Patient cancelled ${request.resourceType} request (was ${previousStatus})`,
      }
    );

    res.json({ message: "Request cancelled successfully", request });
  } catch (err) {
    console.error("Patient cancel error:", err);
    res.status(500).json({ error: "Internal server error" });
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
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) {
        const d = new Date(req.query.to);
        d.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = d;
      }
    }
    if (req.user.role !== "superadmin") {
      if (req.query.scope === "unassigned") {
        filter.allocatedHospitalId = null;
        filter.deliveryStatus = "pending";
      } else if (req.query.scope === "my-hospital") {
        filter.$or = [
          { allocatedHospitalId: req.user.hospitalId },
          { preferredHospitalId: req.user.hospitalId },
        ];
      } else {
        // Hospital staff see own hospital's requests + available unassigned requests they can claim
        filter.$or = [
          { allocatedHospitalId: req.user.hospitalId },
          { preferredHospitalId: req.user.hospitalId },
          { allocatedHospitalId: null, deliveryStatus: "pending" },
        ];
      }
    } else if (req.query.scope === "unassigned") {
      filter.allocatedHospitalId = null;
      filter.deliveryStatus = "pending";
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
router.put("/:id/status", auth, allowRoles("admin", "superadmin", "staff"), async (req, res) => {
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

    const isOxygenDelivery =
      deliveryStatus === "delivered" &&
      request.deliveryStatus !== "delivered" &&
      request.resourceType === "oxygen";

    if (isBloodDelivery) {
      const result = await consumeForDelivery(request); // consumes + marks delivered + saves
      if (!result.ok) {
        return res.status(409).json({
          error: `Allocated hospital no longer has enough non-expired stock (short ${result.shortfall} unit(s))`,
        });
      }
    } else if (isOxygenDelivery) {
      const targetHospitalId = request.allocatedHospitalId || request.preferredHospitalId;
      if (targetHospitalId) {
        const inv = await Inventory.findOne({
          hospitalId: targetHospitalId,
          resourceType: "oxygen",
        });
        if (!inv || inv.oxygenCylinderCount < request.units) {
          return res.status(409).json({
            error: `Hospital only has ${inv?.oxygenCylinderCount || 0} oxygen cylinder(s) in stock (requested: ${request.units})`,
          });
        }
        inv.oxygenCylinderCount = Math.max(0, inv.oxygenCylinderCount - request.units);
        inv.lastUpdatedAt = Date.now();
        await inv.save();
      }
      request.deliveryStatus = deliveryStatus;
      request.updatedAt = Date.now();
      request.deliveredAt = Date.now();
      await request.save();
    } else {
      request.deliveryStatus = deliveryStatus;
      request.updatedAt = Date.now();
      if (deliveryStatus === "approved") request.approvedAt = Date.now();
      if (deliveryStatus === "in-transit") request.inTransitAt = Date.now();
      if (deliveryStatus === "delivered") request.deliveredAt = Date.now();
      if (deliveryStatus === "cancelled") {
        request.cancelledAt = Date.now();
        if (req.body.reason) request.cancellationReason = req.body.reason;
        if (request.resourceType === "blood") allocateBlood().catch(console.error);
        if (request.resourceType === "oxygen") allocateOxygen().catch(console.error);
      }
      await request.save();
    }

    // Best-effort: notify the patient when the status actually changed.
    if (deliveryStatus !== previousStatus) {
      notifyRequestStatus(request).catch(() => {});
      logAudit(req.user, 'patient-request.status', {
        entity: 'PatientRequest', entityId: request._id,
        summary: `${request.resourceType}${request.bloodGroup ? ` ${request.bloodGroup}` : ''} → ${deliveryStatus}`,
      });
    }

    res.json(request);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// Assign (or claim) a fulfilling hospital for a request. Superadmin may assign
// any hospital; an admin/staff may claim it for their own hospital. Moves a
// pending request to 'approved'.
router.post("/:id/assign", auth, allowRoles("admin", "superadmin", "staff"), async (req, res) => {
  try {
    const hospitalId = req.user.role === "superadmin" ? (req.body.hospitalId || req.user.hospitalId) : req.user.hospitalId;
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
    logAudit(req.user, 'patient-request.assign', {
      entity: 'PatientRequest', entityId: request._id, hospitalId,
      summary: `Assigned request ${request._id} to hospital ${hospitalId}`,
    });
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