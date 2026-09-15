const express = require('express');
const router = express.Router();
const SOSRequest = require('../models/SOSRequest');
const PatientRequest = require('../models/PatientRequest');
const ResourceRequest = require('../models/ResourceRequest');
const DonationAppointment = require('../models/DonationAppointment');
const Inventory = require('../models/Inventory');
const { auth } = require('../middleware/auth');

// GET /api/badges — small "things needing attention" counts for the sidebar,
// scoped to the caller's role/hospital. Cheap countDocuments queries, polled
// by the dashboard.
router.get('/', auth, async (req, res) => {
  try {
    const isSuper = req.user.role === 'superadmin';
    const hid = req.user.hospitalId;

    const prFilter = { deliveryStatus: 'pending' };
    const apFilter = { status: 'pending' };
    const rrFilter = { status: 'pending' };
    // Low stock: available blood below the reorder threshold.
    const invFilter = { resourceType: 'blood', units: { $gt: 0, $lt: 10 } };
    if (!isSuper) {
      if (hid) {
        prFilter.$or = [{ allocatedHospitalId: hid }, { preferredHospitalId: hid }];
        apFilter.hospitalId = hid;
        rrFilter.supplyingHospitalId = hid; // requests awaiting THIS hospital's response
        invFilter.hospitalId = hid;
      } else {
        // A hospital user with no hospital sees nothing to act on.
        return res.json({ sos: 0, patientRequests: 0, resourceRequests: 0, appointments: 0, lowStock: 0 });
      }
    }

    const [sos, patientRequests, resourceRequests, appointments, lowStock] = await Promise.all([
      SOSRequest.countDocuments({ status: 'pending' }), // emergencies are network-wide
      PatientRequest.countDocuments(prFilter),
      ResourceRequest.countDocuments(rrFilter),
      DonationAppointment.countDocuments(apFilter),
      Inventory.countDocuments(invFilter),
    ]);

    res.json({ sos, patientRequests, resourceRequests, appointments, lowStock });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
