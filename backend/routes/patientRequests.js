const express = require("express");
const router = express.Router();
const PatientRequest = require("../models/PatientRequest");
const SOSRequest = require("../models/SOSRequest");
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
// Create a new request (supports advance scheduling & doctor identity governance)
router.post("/", validate(patientRequestSchema), async (req, res) => {
  try {
    const { resourceType, bloodGroup, scheduledTime, referenceId, doctorPin, doctorRef, source, ...rest } = req.body;

    // Doctor Verification Logic
    let resolvedDoctorRef = doctorRef || {};
    let resolvedSource = source || 'web_form';

    // 1. Check if authenticated user header / token is passed
    const authHeader = req.headers.authorization;
    let authUser = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const jwt = require('jsonwebtoken');
        const token = authHeader.split(' ')[1];
        authUser = jwt.verify(token, process.env.JWT_SECRET);
      } catch (e) {}
    }

    const cleanPin = (doctorPin || '').trim().toUpperCase();
    const isDoctorPinValid = cleanPin === 'DOC-2026' || cleanPin.startsWith('DOC-') || cleanPin.startsWith('HOSP-');

    // Superadmin is a technical role and cannot auto-verify as a clinician.
    // Only facility-bound hospital staff/admin qualify for dashboard auto-verification.
    if (authUser && (authUser.role === 'admin' || authUser.role === 'staff') && authUser.hospitalId) {
      resolvedDoctorRef = {
        id: authUser._id,
        name: resolvedDoctorRef.name || rest.doctorName || authUser.name,
        phone: resolvedDoctorRef.phone || rest.doctorPhone,
        hospitalAffiliation: resolvedDoctorRef.hospitalAffiliation || rest.destinationFacility,
        verificationStatus: 'verified_id',
      };
      resolvedSource = resolvedSource === 'web_form' ? 'dashboard_requisition' : resolvedSource;
    } else if (isDoctorPinValid) {
      resolvedDoctorRef = {
        name: resolvedDoctorRef.name || rest.doctorName || 'Attending Physician',
        phone: resolvedDoctorRef.phone || rest.doctorPhone,
        hospitalAffiliation: resolvedDoctorRef.hospitalAffiliation || rest.destinationFacility || 'Hospital',
        verificationStatus: 'verified_id',
      };
    } else if (resolvedDoctorRef.phone || rest.doctorPhone) {
      resolvedDoctorRef = {
        name: resolvedDoctorRef.name || rest.doctorName || 'Attending Physician',
        phone: resolvedDoctorRef.phone || rest.doctorPhone,
        hospitalAffiliation: resolvedDoctorRef.hospitalAffiliation || rest.destinationFacility,
        verificationStatus: 'phone_only',
      };
    } else {
      resolvedDoctorRef = {
        name: resolvedDoctorRef.name || rest.doctorName || 'Attending Physician',
        phone: resolvedDoctorRef.phone || rest.doctorPhone || rest.contactPhone,
        verificationStatus: 'unverified',
      };
    }

    // Generate a human-friendly clinical reference ID (e.g. SBB-4A7F2) if not provided
    const genRef = referenceId || `SBB-${Math.random().toString(16).substring(2, 7).toUpperCase()}`;

    const request = new PatientRequest({
      resourceType,
      bloodGroup,
      referenceId: genRef,
      scheduledTime: scheduledTime ? new Date(scheduledTime) : undefined,
      deliveryStatus: "pending",
      doctorRef: resolvedDoctorRef,
      source: resolvedSource,
      ...rest
    });
    await request.save();
    if (resourceType === "blood") allocateBlood().catch(console.error);
    if (resourceType === "oxygen") allocateOxygen().catch(console.error);
    res.status(201).json({ message: "Clinical requisition received", requestId: request._id, referenceId: genRef, request });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper to format SOS request for public tracking (sanitizes sensitive data)
function formatSosForTracking(sos) {
  return {
    _id: sos._id,
    type: 'sos',
    referenceId: sos.referenceId || `SOS-${sos._id.toString().slice(-6).toUpperCase()}`,
    tier: sos.tier,
    bloodGroup: sos.bloodGroup,
    componentNeeded: sos.componentNeeded || 'WHOLE_BLOOD',
    radiusKm: sos.radiusKm,
    status: sos.status,
    hospitalTriageStatus: sos.hospitalTriageStatus,
    hospitalName: sos.hospitalName || 'Emergency Referral Hospital',
    doctorName: sos.doctorName,
    doctorPhone: sos.doctorPhone ? sos.doctorPhone.slice(-4).padStart(sos.doctorPhone.length, '*') : undefined,
    userPhoneMasked: sos.userPhone ? sos.userPhone.slice(-4).padStart(sos.userPhone.length, '*') : undefined,
    userLocation: sos.userLocation,
    donorsAlertedCount: sos.donorsAlerted ? sos.donorsAlerted.length : 0,
    donorsAvailableCount: sos.donorsResponded ? sos.donorsResponded.filter((r) => r.response === 'yes').length : 0,
    donorsDeclinedCount: sos.donorsResponded ? sos.donorsResponded.filter((r) => r.response === 'no').length : 0,
    createdAt: sos.createdAt,
  };
}

// Track requests by phone number or reference ID (supports both SBB- requisitions & SOS- emergency alerts).
router.get("/track/:query", async (req, res) => {
  try {
    const raw = String(req.params.query || "").trim();
    const digits = raw.replace(/\D/g, "");
    const mongoose = require('mongoose');

    // 1. Phone number lookup (matches last 10 digits across BOTH PatientRequest and SOSRequest)
    if (digits.length >= 10) {
      const last10 = digits.slice(-10);
      const [patientReqs, sosReqs] = await Promise.all([
        PatientRequest.find({ contactPhone: new RegExp(last10 + "$") })
          .populate("preferredHospitalId", "name address contactPhone location")
          .populate("allocatedHospitalId", "name address contactPhone location")
          .sort({ createdAt: -1 }),
        SOSRequest.find({
          $or: [
            { userPhone: new RegExp(last10 + "$") },
            { doctorPhone: new RegExp(last10 + "$") },
          ],
        }).sort({ createdAt: -1 }),
      ]);

      const formattedSos = sosReqs.map(formatSosForTracking);
      return res.json([...patientReqs, ...formattedSos]);
    }

    // 2. Direct match for Emergency SOS by reference ID (e.g. SOS-J41DD or J41DD)
    const cleanSosRef = raw.replace(/^SOS-/i, '').trim();
    const isSosFormat = raw.toUpperCase().startsWith('SOS-') || (/^[A-Za-z0-9]{4,8}$/.test(raw) && !raw.toUpperCase().startsWith('SBB-'));

    if (isSosFormat) {
      const sosMatch = await SOSRequest.findOne({
        $or: [
          { referenceId: new RegExp('^' + cleanSosRef + '$|^SOS-' + cleanSosRef + '$', 'i') },
          ...(raw.length === 24 && mongoose.Types.ObjectId.isValid(raw) ? [{ _id: raw }] : [])
        ]
      });

      if (sosMatch) {
        // Privacy Guardrail: Require matching phone number to access emergency patient tracking
        const phoneParam = req.query.phone ? String(req.query.phone).replace(/\D/g, "") : "";
        if (!phoneParam || phoneParam.length < 7) {
          return res.status(200).json({
            requiresPhone: true,
            referenceId: sosMatch.referenceId,
            type: 'sos',
            message: "For emergency SOS privacy, please enter the phone number associated with this SOS ID.",
          });
        }

        const sosDigits = String(sosMatch.userPhone || sosMatch.doctorPhone || "").replace(/\D/g, "");
        const match =
          sosDigits === phoneParam ||
          (sosDigits.length >= 10 && phoneParam.length >= 10 && sosDigits.slice(-10) === phoneParam.slice(-10)) ||
          sosDigits.endsWith(phoneParam.slice(-7));

        if (!match) {
          return res.status(403).json({
            error: "The phone number entered does not match the emergency contact on file for this SOS ID.",
          });
        }

        return res.json([formatSosForTracking(sosMatch)]);
      }
    }

    // 3. Direct match for Standard Clinical Requisitions by referenceId (e.g. SBB-4A7F2 or 4A7F2)
    const cleanSbbRef = raw.replace(/^SBB-/i, '').trim();
    const byRef = await PatientRequest.find({
      referenceId: new RegExp('^' + cleanSbbRef + '$|^SBB-' + cleanSbbRef + '$', 'i')
    })
      .populate("preferredHospitalId", "name address contactPhone location")
      .populate("allocatedHospitalId", "name address contactPhone location");
    if (byRef.length > 0) return res.json(byRef);

    // 4. ObjectId lookup for PatientRequest
    if (mongoose.Types.ObjectId.isValid(raw) && raw.length === 24) {
      const single = await PatientRequest.findById(raw)
        .populate("preferredHospitalId", "name address contactPhone location")
        .populate("allocatedHospitalId", "name address contactPhone location");
      if (single) return res.json([single]);
    }

    // 5. Hex tail lookup
    if (/^[a-fA-F0-9]{4,24}$/.test(raw) && digits.length < 7) {
      const allRecent = await PatientRequest.find().sort({ createdAt: -1 }).limit(100)
        .populate("preferredHospitalId", "name address contactPhone location")
        .populate("allocatedHospitalId", "name address contactPhone location");
      const matched = allRecent.filter(r =>
        r._id.toString().toLowerCase().endsWith(raw.toLowerCase()) ||
        (r.referenceId && r.referenceId.toLowerCase().includes(raw.toLowerCase()))
      );
      if (matched.length > 0) return res.json(matched);
    }

    // 6. Direct contactPhone lookup fallback
    const filter = digits.length >= 7
      ? { contactPhone: new RegExp(digits.slice(-7) + "$") }
      : { contactPhone: raw };
    const requests = await PatientRequest.find(filter)
      .populate("preferredHospitalId", "name address contactPhone location")
      .populate("allocatedHospitalId", "name address contactPhone location")
      .sort({ createdAt: -1 });

    return res.json(requests);
  } catch (err) {
    console.error("Tracking query error:", err);
    res.status(500).json({ error: 'Could not complete request lookup. Please check reference ID or phone number.' });
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
    request.cancellation = {
      reason: req.body.reason || "other",
      cancelledByRole: "patient",
      notes: req.body.notes || req.body.reason || "Cancelled by patient / requester",
      cancelledAt: new Date(),
    };
    request.consequences = {
      allocatedUnitsReleased: true,
      sosBroadcastStopped: true,
      familyNotified: true,
    };
    request.cancellationReason = request.cancellation.reason;
    request.cancelledAt = request.cancellation.cancelledAt;
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

    // Both the fulfilling/supplying hospital (allocatedHospitalId) AND the requesting/receiving hospital (preferredHospitalId)
    // have legitimate authority to participate in the lifecycle.
    const isSupplier = request.allocatedHospitalId && canAccessHospital(req.user, request.allocatedHospitalId);
    const isReceiver = request.preferredHospitalId && canAccessHospital(req.user, request.preferredHospitalId);
    const isSuper = req.user.role === "superadmin";

    if (!isSupplier && !isReceiver && !isSuper) {
      return res.status(403).json({ error: "You can only update requests involving your hospital" });
    }

    // Separation of Duties: Super Admin cannot issue or deliver clinical blood/oxygen units.
    // Physical unit delivery must be confirmed by hospital clinical/lab staff.
    if (deliveryStatus === "delivered" && req.user.role === "superadmin") {
      return res.status(403).json({
        error: "Separation of Duties violation: Super Admin cannot issue or deliver clinical blood units. Blood issuance must be confirmed by hospital clinical/lab staff.",
      });
    }

    // When moving to 'approved' or 'in-transit', if no supplier is allocated yet,
    // auto-assign the acting user's hospital if they are the preferred hospital (intra-hospital fulfillment).
    if ((deliveryStatus === "approved" || deliveryStatus === "in-transit") && !request.allocatedHospitalId) {
      if (request.preferredHospitalId && canAccessHospital(req.user, request.preferredHospitalId)) {
        request.allocatedHospitalId = request.preferredHospitalId;
      }
    }

    // Delivering a blood request atomically consumes FEFO stock AND marks the
    // request delivered (transaction) — no oversell, no double-consume on retry.
    if (deliveryStatus === "delivered" && request.deliveryStatus !== "delivered") {
      if (request.resourceType === "blood") {
        // Ensure a supplying hospital is allocated.
        if (!request.allocatedHospitalId) {
          if (request.preferredHospitalId && canAccessHospital(req.user, request.preferredHospitalId)) {
            request.allocatedHospitalId = request.preferredHospitalId;
          } else {
            return res.status(400).json({
              error: "Cannot mark as delivered: Blood requisition has not been allocated to a supplying blood bank. Please assign or claim the requisition first.",
            });
          }
        }

        const result = await consumeForDelivery(request); // consumes + marks delivered + saves
        if (!result.ok) {
          return res.status(409).json({
            error: result.error || `Supplying hospital no longer has enough non-expired stock (short ${result.shortfall || 0} unit(s))`,
          });
        }
      } else if (request.resourceType === "oxygen") {
        const targetHospitalId = request.allocatedHospitalId || request.preferredHospitalId;
        if (!targetHospitalId) {
          return res.status(400).json({ error: "Cannot deliver oxygen without an assigned supplying hospital" });
        }
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
        request.deliveryStatus = deliveryStatus;
        request.updatedAt = Date.now();
        request.deliveredAt = Date.now();
        await request.save();
      }
    } else {
      request.deliveryStatus = deliveryStatus;
      request.updatedAt = Date.now();
      if (deliveryStatus === "approved") request.approvedAt = Date.now();
      if (deliveryStatus === "in-transit") request.inTransitAt = Date.now();
      if (deliveryStatus === "delivered") request.deliveredAt = Date.now();
      if (deliveryStatus === "cancelled") {
        const cReason = req.body.cancellationReason || req.body.reason || "other";
        request.cancellation = {
          reason: cReason,
          cancelledBy: req.user._id,
          cancelledByRole: req.user.role || "admin",
          notes: req.body.notes || req.body.reason || "Cancelled by hospital staff / administrator",
          cancelledAt: new Date(),
        };
        request.consequences = {
          allocatedUnitsReleased: true,
          sosBroadcastStopped: true,
          familyNotified: true,
        };
        request.cancellationReason = cReason;
        request.cancelledAt = request.cancellation.cancelledAt;
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