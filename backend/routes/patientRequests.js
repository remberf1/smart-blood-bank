const express = require("express");
const router = express.Router();
const PatientRequest = require("../models/PatientRequest");
const Inventory = require("../models/Inventory");
const { allocateBlood } = require("../services/allocationService");
const { auth } = require("../middleware/auth");
const { allowRoles } = require("../middleware/roles");

// ------------------- Public (no authentication) -------------------
// Create a new request (supports advance scheduling)
router.post("/", async (req, res) => {
  try {
    const { resourceType, bloodGroup, scheduledTime, ...rest } = req.body;
    if (resourceType === "blood" && !bloodGroup) {
      return res.status(400).json({ error: "Blood group required for blood requests" });
    }

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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

// ------------------- Hospital admin (authentication required) -------------------
// Get all requests for a specific hospital (admin only)
router.get("/hospital/:hospitalId", auth, async (req, res) => {
  try {
    const requests = await PatientRequest.find({ preferredHospitalId: req.params.hospitalId })
      .sort({ scheduledTime: 1, createdAt: 1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update delivery status (approved, in-transit, delivered, cancelled)
router.put("/:id/status", auth, allowRoles("admin", "superadmin"), async (req, res) => {
  try {
    const { deliveryStatus } = req.body;

    const request = await PatientRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ error: "Request not found" });

    // Deduct stock exactly once, on the transition into 'delivered'.
    // Atomic guarded decrement prevents negative stock and races.
    if (
      deliveryStatus === "delivered" &&
      request.deliveryStatus !== "delivered" &&
      request.resourceType === "blood" &&
      request.allocatedHospitalId
    ) {
      const deducted = await Inventory.findOneAndUpdate(
        {
          hospitalId: request.allocatedHospitalId,
          resourceType: "blood",
          bloodGroup: request.bloodGroup,
          units: { $gte: request.units },
        },
        { $inc: { units: -request.units }, $set: { lastUpdatedAt: Date.now() } },
        { new: true }
      );
      if (!deducted) {
        return res.status(409).json({
          error: "Allocated hospital no longer has enough stock to fulfill this request",
        });
      }
    }

    request.deliveryStatus = deliveryStatus;
    request.updatedAt = Date.now();
    if (deliveryStatus === "approved") request.approvedAt = Date.now();
    if (deliveryStatus === "in-transit") request.inTransitAt = Date.now();
    if (deliveryStatus === "delivered") request.deliveredAt = Date.now();

    await request.save();
    res.json(request);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Keep the old PUT /:requestId for general updates (if needed)
router.put("/:requestId", auth, async (req, res) => {
  try {
    const request = await PatientRequest.findByIdAndUpdate(req.params.requestId, req.body, { new: true });
    if (!request) return res.status(404).json({ error: "Request not found" });
    res.json(request);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;