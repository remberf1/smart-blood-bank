const express = require('express');
const router = express.Router();
const Hospital = require('../models/Hospital');

// Add a new hospital
router.post('/', async (req, res) => {
  try {
    const { name, address, location, contactPhone } = req.body;
    const hospital = new Hospital({ name, address, location, contactPhone });
    await hospital.save();
    res.status(201).json(hospital);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all hospitals
router.get('/', async (req, res) => {
  try {
    const hospitals = await Hospital.find();
    res.json(hospitals);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;