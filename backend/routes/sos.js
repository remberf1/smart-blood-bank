const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const SOSRequest = require('../models/SOSRequest');
const { auth, isAdmin } = require('../middleware/auth');
const { allowRoles } = require('../middleware/roles');
const { triggerSOS, verifyAndBroadcastSOS } = require('../services/sosService');
const { formatNigerianPhone } = require('../utils/phone');
const { logAudit } = require('../services/auditService');

// Public emergency trigger — tightly rate-limited to prevent donor-alert spam.
const sosTriggerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many SOS requests. Please call your nearest hospital directly.' },
});

// POST /api/sos/trigger  (public) — raise an emergency.
// Tier 1 (Clinical): Valid Doctor PIN (DOC-) or Facility Code (HOSP-) broadcasts immediately to donors.
// Tier 2 (Public): Bystanders without code route immediately to the nearest hospital triage/ambulance.
router.post('/trigger', sosTriggerLimiter, async (req, res) => {
  try {
    const { bloodGroup, lat, lon, phone, authCode, doctorName, doctorPhone, hospitalName } = req.body;
    const VALID = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
    if (!VALID.includes(bloodGroup)) {
      return res.status(400).json({ error: 'Select a valid blood group.' });
    }
    if (lat == null || lon == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lon))) {
      return res.status(400).json({ error: 'Your location is required to find nearby donors or emergency hospital.' });
    }
    if (!phone || typeof phone !== 'string' || !phone.trim()) {
      return res.status(400).json({ error: 'Please enter your phone number so emergency teams can reach you.' });
    }
    const formattedPhone = formatNigerianPhone(phone);
    if (!formattedPhone) {
      return res.status(400).json({ error: 'Invalid phone number. Please enter a valid Nigerian number (e.g., 08012345678 or +2348012345678).' });
    }

    const cleanAuth = (authCode || '').trim().toUpperCase();
    const isClinical = cleanAuth === 'DOC-2026' || cleanAuth.startsWith('DOC-') || cleanAuth.startsWith('HOSP-');
    const tier = isClinical ? 'clinical' : 'public';

    const result = await triggerSOS(bloodGroup, Number(lat), Number(lon), formattedPhone, 15, {
      tier,
      authCode: isClinical ? cleanAuth : undefined,
      doctorName: doctorName || (cleanAuth.startsWith('DOC-') ? 'Attending Physician' : undefined),
      doctorPhone,
      hospitalName: hospitalName || (cleanAuth.startsWith('HOSP-') ? cleanAuth.replace('HOSP-', '') : undefined),
    });

    res.status(201).json(result);
  } catch (err) {
    console.error('SOS trigger error:', err);
    res.status(500).json({ error: 'Could not raise the SOS. Please contact a hospital directly.' });
  }
});

// List SOS requests (staff & admin), optionally filtered by status
router.get('/', auth, async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status) filter.status = status;
    const requests = await SOSRequest.find(filter)
      .sort({ createdAt: -1 })
      .limit(200);
    res.json(requests);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// Get a single SOS request (staff & admin)
router.get('/:id', auth, async (req, res) => {
  try {
    const request = await SOSRequest.findById(req.params.id)
      .populate('donorsAlerted.donorId', 'name phone bloodGroup')
      .populate('donorsResponded.donorId', 'name phone bloodGroup');
    if (!request) return res.status(404).json({ error: 'SOS request not found' });
    res.json(request);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// Upgrade a public unverified SOS to an authorized clinical donor broadcast (hospital staff/admin only)
router.post('/:id/verify-broadcast', auth, async (req, res) => {
  try {
    if (req.user.role === 'superadmin') {
      return res.status(403).json({
        error: 'Separation of Duties violation: Platform Super Admin (IT Plane) cannot clinically authorize emergency donor broadcasts. Clinical validation must be performed by hospital clinical staff (Hospital Admin/Nurse/Doctor).',
      });
    }

    if (!['admin', 'staff'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied: Hospital clinical role required.' });
    }

    const result = await verifyAndBroadcastSOS(req.params.id, req.user);
    logAudit(req.user, 'sos.clinical_verify_broadcast', {
      entity: 'SOSRequest',
      entityId: req.params.id,
      summary: `Clinically verified public SOS and triggered broadcast by ${req.user.name}`,
    });
    res.json(result);
  } catch (err) {
    console.error('Verify and broadcast error:', err);
    res.status(400).json({ error: err.message || 'Failed to verify and broadcast SOS' });
  }
});

// Technical Force-Resolve for stuck or duplicate requests (Super Admin / IT Plane only)
router.post('/:id/technical-resolve', auth, allowRoles('superadmin'), async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason || typeof reason !== 'string' || reason.trim().length < 8) {
      return res.status(400).json({
        error: 'A detailed technical reason (at least 8 characters) is required to force-resolve an emergency ticket.',
      });
    }

    const request = await SOSRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ error: 'SOS request not found' });

    request.status = 'resolved';
    request.hospitalTriageStatus = 'cancelled';
    await request.save();

    logAudit(req.user, 'sos.technical_force_resolve', {
      entity: 'SOSRequest',
      entityId: request._id,
      summary: `Super Admin technical force-resolve: ${reason.trim()}`,
      metadata: {
        reason: reason.trim(),
        referenceId: request.referenceId,
        bloodGroup: request.bloodGroup,
      },
    });

    res.json({
      message: 'SOS request marked as resolved for technical reasons.',
      sos: request,
    });
  } catch (err) {
    console.error('Technical resolve error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update SOS status: resolved / expired (admin)
router.put('/:id/status', auth, isAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'resolved', 'expired'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const request = await SOSRequest.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!request) return res.status(404).json({ error: 'SOS request not found' });
    res.json(request);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
