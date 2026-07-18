const jwt = require('jsonwebtoken');
const Donor = require('../models/Donor');

module.exports = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'donor') {
      return res.status(403).json({ error: 'Forbidden: Not a donor account' });
    }

    const donor = await Donor.findById(decoded.donorId).select('-password');
    if (!donor) {
      return res.status(401).json({ error: 'Donor not found' });
    }

    req.donor = donor;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};