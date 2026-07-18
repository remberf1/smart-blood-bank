const express = require('express');
const router = express.Router();
const Hospital = require('../models/Hospital');
const Inventory = require('../models/Inventory'); // To check if hospital has inventory before deleting
const { auth, isAdmin } = require('../middleware/auth');

// ==================== CREATE HOSPITAL ====================
router.post('/', auth, async (req, res) => {
  try {
    const { name, address, location, contactPhone } = req.body;
    
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
    res.status(500).json({ error: err.message });
  }
});

// ==================== GET ALL HOSPITALS (Public) ====================
router.get('/', async (req, res) => {
  try {
    const hospitals = await Hospital.find().sort({ name: 1 });
    res.json(hospitals);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

// ==================== UPDATE HOSPITAL ====================
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, address, location, contactPhone } = req.body;
    
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
    res.status(500).json({ error: err.message });
  }
});

// ==================== DELETE HOSPITAL ====================
router.delete('/:id', auth, async (req, res) => {
  try {
    // First, check if hospital has any inventory
    const inventoryCount = await Inventory.countDocuments({ hospitalId: req.params.id });
    
    if (inventoryCount > 0) {
      return res.status(400).json({ 
        error: `Cannot delete hospital. It has ${inventoryCount} inventory record(s). Delete inventory first.` 
      });
    }
    
    const hospital = await Hospital.findByIdAndDelete(req.params.id);
    if (!hospital) {
      return res.status(404).json({ error: 'Hospital not found' });
    }
    
    res.json({ message: 'Hospital deleted successfully', hospital: { name: hospital.name } });
  } catch (err) {
    console.error('Error deleting hospital:', err);
    res.status(500).json({ error: err.message });
  }
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
    res.status(500).json({ error: err.message });
  }
});

// ==================== GET HOSPITALS WITH DELIVERY STATUS (Admin) ====================//
router.put('/:id/delivery-status', auth, async (req, res) => {
  try {
    const { deliveryStatus } = req.body;
    const hospital = await Hospital.findByIdAndUpdate(req.params.id, { deliveryStatus }, { new: true });
    res.json(hospital);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;