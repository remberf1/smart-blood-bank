const express = require('express');
const router = express.Router();
const Inventory = require('../models/Inventory');
const { haversineDistance, getDistanceScore, getRecencyScore, getStockScore } = require('../controllers/wpsEngine');

// POST - Add inventory
router.post('/', async (req, res) => {
  try {
    console.log('POST /api/inventory called');
    const { hospitalId, resourceType, bloodGroup, units, oxygenCylinderCount, oxygenFillStatus } = req.body;
    
    const inventory = new Inventory({
      hospitalId,
      resourceType,
      bloodGroup,
      units: units || 0,
      oxygenCylinderCount: oxygenCylinderCount || 0,
      oxygenFillStatus: oxygenFillStatus || 'empty'
    });
    
    await inventory.save();
    res.status(201).json(inventory);
  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET - All blood inventory across all hospitals
router.get('/blood', async (req, res) => {
  try {
    const allBlood = await Inventory.find({ 
      resourceType: 'blood',
      units: { $gt: 0 }
    }).populate('hospitalId', 'name address location contactPhone');
    res.json(allBlood);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET - Blood by group
router.get('/blood/:bloodGroup', async (req, res) => {
  try {
    const inventory = await Inventory.find({ 
      resourceType: 'blood', 
      bloodGroup: req.params.bloodGroup,
      units: { $gt: 0 }
    }).populate('hospitalId', 'name address location contactPhone');
    res.json(inventory);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET - All oxygen
router.get('/oxygen', async (req, res) => {
  try {
    const oxygen = await Inventory.find({ 
      resourceType: 'oxygen',
      oxygenCylinderCount: { $gt: 0 }
    }).populate('hospitalId', 'name address location contactPhone');
    res.json(oxygen);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET - Inventory by hospital
router.get('/hospital/:hospitalId', async (req, res) => {
  try {
    const inventory = await Inventory.find({ hospitalId: req.params.hospitalId });
    res.json(inventory);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT - Update blood units
router.put('/blood/:inventoryId', async (req, res) => {
  try {
    const { units } = req.body;
    const inventory = await Inventory.findByIdAndUpdate(
      req.params.inventoryId,
      { units, lastUpdatedAt: Date.now() },
      { new: true }
    );
    if (!inventory) return res.status(404).json({ error: 'Inventory not found' });
    res.json(inventory);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT - Update oxygen
router.put('/oxygen/:inventoryId', async (req, res) => {
  try {
    const { oxygenCylinderCount, oxygenFillStatus } = req.body;
    const inventory = await Inventory.findByIdAndUpdate(
      req.params.inventoryId,
      { oxygenCylinderCount, oxygenFillStatus, lastUpdatedAt: Date.now() },
      { new: true }
    );
    if (!inventory) return res.status(404).json({ error: 'Inventory not found' });
    res.json(inventory);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE - Remove inventory
router.delete('/:inventoryId', async (req, res) => {
  try {
    const inventory = await Inventory.findByIdAndDelete(req.params.inventoryId);
    if (!inventory) return res.status(404).json({ error: 'Inventory not found' });
    res.json({ message: 'Inventory deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== ENHANCED WPS RANKING WITH RADIUS FILTER ====================
// GET - Rank hospitals by WPS for a specific blood group with optional radius
router.get('/rank/:bloodGroup', async (req, res) => {
  try {
    const { bloodGroup } = req.params;
    const { lat, lon, radius } = req.query; // radius in km (optional, default 100)
    
    if (!lat || !lon) {
      return res.status(400).json({ error: 'User latitude and longitude are required' });
    }
    
    const userLat = parseFloat(lat);
    const userLon = parseFloat(lon);
    const maxRadius = radius ? parseFloat(radius) : 100; // Default 100km radius
    
    // Find all hospitals with the requested blood group
    const hospitalsWithStock = await Inventory.aggregate([
      { $match: { resourceType: 'blood', bloodGroup: bloodGroup, units: { $gt: 0 } } },
      { $lookup: { from: 'hospitals', localField: 'hospitalId', foreignField: '_id', as: 'hospital' } },
      { $unwind: '$hospital' }
    ]);
    
    if (hospitalsWithStock.length === 0) {
      return res.json({
        bloodGroup,
        userLocation: { lat: userLat, lon: userLon },
        searchRadius: maxRadius,
        message: `No hospitals have ${bloodGroup} blood available within ${maxRadius}km`,
        recommendations: null,
        allRanked: []
      });
    }
    
    // Calculate max units for normalization
    const maxUnits = Math.max(...hospitalsWithStock.map(h => h.units));
    
    // Calculate distance and WPS for each hospital, then filter by radius
    const scoredHospitals = hospitalsWithStock.map(hospital => {
      const distance = haversineDistance(
        userLat, userLon,
        hospital.hospital.location.coordinates[1],
        hospital.hospital.location.coordinates[0]
      );
      
      const distanceScore = getDistanceScore(distance);
      const recencyScore = getRecencyScore(hospital.lastUpdatedAt);
      const stockScore = getStockScore(hospital.units, maxUnits);
      const wps = (0.40 * stockScore) + (0.35 * recencyScore) + (0.25 * distanceScore);
      
      return {
        hospitalId: hospital.hospital._id,
        name: hospital.hospital.name,
        address: hospital.hospital.address,
        contactPhone: hospital.hospital.contactPhone,
        distance: parseFloat(distance.toFixed(1)),
        distanceScore: parseFloat(distanceScore.toFixed(4)),
        recencyScore: parseFloat(recencyScore.toFixed(4)),
        stockScore: parseFloat(stockScore.toFixed(4)),
        wps: parseFloat(wps.toFixed(4)),
        unitsAvailable: hospital.units,
        lastUpdated: hospital.lastUpdatedAt
      };
    });
    
    // Filter by radius
    const filteredHospitals = scoredHospitals.filter(h => h.distance <= maxRadius);
    
    if (filteredHospitals.length === 0) {
      return res.json({
        bloodGroup,
        userLocation: { lat: userLat, lon: userLon },
        searchRadius: maxRadius,
        message: `No hospitals have ${bloodGroup} blood within ${maxRadius}km of your location`,
        recommendations: null,
        allRanked: []
      });
    }
    
    // Sort by WPS (highest first)
    const ranked = filteredHospitals.sort((a, b) => b.wps - a.wps);
    
    // Get categorized recommendations
    const proximal = [...filteredHospitals].sort((a, b) => a.distance - b.distance)[0];
    const optimal = ranked.find(h => h.distance <= 20) || ranked[0];
    const reliable = filteredHospitals
      .filter(h => h.distance <= 15)
      .sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated))[0] || proximal;
    
    res.json({
      bloodGroup,
      userLocation: { lat: userLat, lon: userLon },
      searchRadius: maxRadius,
      hospitalsFound: filteredHospitals.length,
      maxUnitsInDataset: maxUnits,
      recommendations: {
        proximal: proximal,      // Closest hospital
        optimal: optimal,        // Highest WPS within 20km
        reliable: reliable       // Most recently updated within 15km
      },
      allRanked: ranked.slice(0, 5) // Top 5 ranked hospitals
    });
    
  } catch (err) {
    console.error('WPS Ranking Error:', err);
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;