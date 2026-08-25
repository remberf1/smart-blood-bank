const express = require('express');
const router = express.Router();
const Inventory = require('../models/Inventory');
const BloodBatch = require('../models/BloodBatch');
const { haversineDistance, getDistanceScore, getRecencyScore, getStockScore } = require('../controllers/wpsEngine');
const { auth, isAdmin } = require('../middleware/auth');
const { canAccessHospital, allowRoles } = require('../middleware/roles');
const { addBloodUnits, removeBloodUnits, refreshBloodInventory, expireDueBatches } = require('../services/inventoryService');

// POST - Add inventory
router.post('/',auth,async (req, res) => {
  try {
    const { hospitalId, resourceType, bloodGroup, units, oxygenCylinderCount, oxygenFillStatus } = req.body;

    if (!canAccessHospital(req.user, hospitalId)) {
      return res.status(403).json({ error: 'You can only manage your own hospital\'s inventory' });
    }

    // Blood is tracked as dated batches; adding stock creates a batch with an
    // expiry and refreshes the Inventory cache.
    if (resourceType === 'blood') {
      if (!bloodGroup) return res.status(400).json({ error: 'bloodGroup is required for blood' });
      await addBloodUnits({ hospitalId, bloodGroup, units: units || 0, source: 'manual' });
      const inventory = await Inventory.findOne({ hospitalId, resourceType: 'blood', bloodGroup });
      return res.status(201).json(inventory);
    }

    // Oxygen is a simple counter (no expiry / batches).
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

// PUT - Set blood units to an absolute value (reconciled through batches)
router.put('/blood/:inventoryId',auth, async (req, res) => {
  try {
    const target = Number(req.body.units);
    const existing = await Inventory.findById(req.params.inventoryId);
    if (!existing) return res.status(404).json({ error: 'Inventory not found' });
    if (!canAccessHospital(req.user, existing.hospitalId)) {
      return res.status(403).json({ error: 'You can only manage your own hospital\'s inventory' });
    }
    if (!Number.isFinite(target) || target < 0) {
      return res.status(400).json({ error: 'units must be a non-negative number' });
    }

    // Reconcile the requested count against dated batches: add a manual batch
    // for an increase, discard oldest stock (FEFO) for a decrease.
    const delta = target - (existing.units || 0);
    if (delta > 0) {
      await addBloodUnits({ hospitalId: existing.hospitalId, bloodGroup: existing.bloodGroup, units: delta, source: 'manual' });
    } else if (delta < 0) {
      await removeBloodUnits({ hospitalId: existing.hospitalId, bloodGroup: existing.bloodGroup, units: -delta });
    } else {
      await refreshBloodInventory(existing.hospitalId, existing.bloodGroup);
    }

    const updated = await Inventory.findById(req.params.inventoryId);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT - Update oxygen
router.put('/oxygen/:inventoryId',auth, async (req, res) => {
  try {
    const { oxygenCylinderCount, oxygenFillStatus } = req.body;
    const existing = await Inventory.findById(req.params.inventoryId);
    if (!existing) return res.status(404).json({ error: 'Inventory not found' });
    if (!canAccessHospital(req.user, existing.hospitalId)) {
      return res.status(403).json({ error: 'You can only manage your own hospital\'s inventory' });
    }
    existing.oxygenCylinderCount = oxygenCylinderCount;
    existing.oxygenFillStatus = oxygenFillStatus;
    existing.lastUpdatedAt = Date.now();
    await existing.save();
    res.json(existing);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE - Remove inventory (admin/superadmin only; staff can add/update, not delete)
router.delete('/:inventoryId', auth, isAdmin, async (req, res) => {
  try {
    const existing = await Inventory.findById(req.params.inventoryId);
    if (!existing) return res.status(404).json({ error: 'Inventory not found' });
    if (!canAccessHospital(req.user, existing.hospitalId)) {
      return res.status(403).json({ error: 'You can only manage your own hospital\'s inventory' });
    }
    await existing.deleteOne();
    res.json({ message: 'Inventory deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== BLOOD BATCH / EXPIRY ====================
// GET - Batches expiring soon (own hospital; superadmin may pass ?hospitalId=)
router.get('/expiring', auth, async (req, res) => {
  try {
    const days = Number(req.query.days) || 7;
    const hospitalId =
      req.user.role === 'superadmin' ? req.query.hospitalId : req.user.hospitalId;

    if (req.user.role !== 'superadmin' && !hospitalId) {
      return res.status(400).json({ error: 'No hospital associated with your account' });
    }

    const now = new Date();
    const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const filter = { status: 'available', expiryDate: { $gt: now, $lte: cutoff } };
    if (hospitalId) filter.hospitalId = hospitalId;

    const batches = await BloodBatch.find(filter)
      .populate('donorId', 'name bloodGroup')
      .populate('hospitalId', 'name')
      .sort({ expiryDate: 1 });
    res.json(batches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST - Manually run the expiry sweep (admin/superadmin)
router.post('/expire-run', auth, allowRoles('admin', 'superadmin'), async (req, res) => {
  try {
    const expiredBatches = await expireDueBatches();
    res.json({ expiredBatches });
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