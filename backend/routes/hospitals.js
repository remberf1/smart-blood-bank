const express = require('express');
const router = express.Router();
const Hospital = require('../models/Hospital');
const Inventory = require('../models/Inventory'); // To check if hospital has inventory before deleting
const { auth, isAdmin, isSuperAdmin } = require('../middleware/auth');
const { canAccessHospital } = require('../middleware/roles');
const { logAudit } = require('../services/auditService');

// Contact phone: allow +, spaces, dashes and parentheses as formatting, but the
// digits must be 10–14 and there must be no letters. Rejects the "too long /
// contains letters" input the UI used to accept.
function isValidContactPhone(raw) {
  if (!raw) return false;
  const digits = String(raw).replace(/[\s()+-]/g, '');
  return /^\d{10,14}$/.test(digits);
}
const PHONE_ERROR = 'Enter a valid phone number — 10 to 14 digits, no letters.';

// ==================== CREATE HOSPITAL (superadmin only) ====================
router.post('/', auth, isSuperAdmin, async (req, res) => {
  try {
    const { name, address, location, contactPhone } = req.body;

    if (!isValidContactPhone(contactPhone)) {
      return res.status(400).json({ error: PHONE_ERROR });
    }

    // Check if hospital already exists
    const existing = await Hospital.findOne({ name });
    if (existing) {
      return res.status(400).json({ error: 'Hospital with this name already exists' });
    }

    const hospital = new Hospital({ name, address, location, contactPhone });
    await hospital.save();
    res.status(201).json(hospital);
  } catch (err) {
    console.error('Error creating hospital:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== GET ALL HOSPITALS (Public) ====================
router.get('/', async (req, res) => {
  try {
    const hospitals = await Hospital.find().sort({ name: 1 });
    res.json(hospitals);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== GET SINGLE HOSPITAL (Public) ====================
router.get('/:id', async (req, res) => {
  try {
    const hospital = await Hospital.findById(req.params.id);
    if (!hospital) {
      return res.status(404).json({ error: 'Hospital not found' });
    }
    res.json(hospital);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== UPDATE HOSPITAL (own hospital or superadmin) ====================
router.put('/:id', auth, async (req, res) => {
  try {
    if (!canAccessHospital(req.user, req.params.id)) {
      return res.status(403).json({ error: 'You can only edit your own hospital' });
    }
    const { name, address, location, contactPhone } = req.body;

    if (contactPhone !== undefined && !isValidContactPhone(contactPhone)) {
      return res.status(400).json({ error: PHONE_ERROR });
    }

    const hospital = await Hospital.findByIdAndUpdate(
      req.params.id,
      { name, address, location, contactPhone, updatedAt: Date.now() },
      { new: true, runValidators: true }
    );
    
    if (!hospital) {
      return res.status(404).json({ error: 'Hospital not found' });
    }
    
    res.json({ message: 'Hospital updated successfully', hospital });
  } catch (err) {
    console.error('Error updating hospital:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== TOGGLE DEACTIVATE/ACTIVATE HOSPITAL (superadmin only) ====================
router.patch('/:id/toggle-active', auth, isSuperAdmin, async (req, res) => {
  try {
    const hospital = await Hospital.findById(req.params.id);
    if (!hospital) return res.status(404).json({ error: 'Hospital not found' });

    hospital.isActive = hospital.isActive === false ? true : false;
    hospital.deactivatedAt = hospital.isActive ? undefined : new Date();
    await hospital.save();

    logAudit(req.user, hospital.isActive ? 'hospital.activate' : 'hospital.deactivate', {
      entity: 'Hospital',
      entityId: hospital._id,
      summary: `${hospital.isActive ? 'Activated' : 'Deactivated'} facility ${hospital.name}`,
    });

    res.json({
      message: `Hospital ${hospital.name} ${hospital.isActive ? 'activated' : 'deactivated'} successfully`,
      hospital,
    });
  } catch (err) {
    console.error('Error toggling hospital active state:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== DELETE HOSPITAL (Hard Delete Prohibited) ====================
router.delete('/:id', auth, isSuperAdmin, async (req, res) => {
  return res.status(400).json({
    error: 'Hard deletion is strictly prohibited in healthcare compliance to prevent orphaning donor records, clinical requisitions, and audit logs. Please toggle "Deactivate" instead.',
  });
});

// ==================== GET HOSPITAL WITH ITS INVENTORY ====================
router.get('/:id/inventory', async (req, res) => {
  try {
    const hospital = await Hospital.findById(req.params.id);
    if (!hospital) {
      return res.status(404).json({ error: 'Hospital not found' });
    }
    
    const inventory = await Inventory.find({ hospitalId: req.params.id });
    
    res.json({
      hospital: {
        id: hospital._id,
        name: hospital.name,
        address: hospital.address,
        contactPhone: hospital.contactPhone
      },
      inventory
    });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;