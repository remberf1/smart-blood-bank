const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Main authentication middleware.
// Verifies the JWT, then loads the CURRENT user from the DB so role, hospital,
// and active-status changes take effect immediately (no stale-token window).
const auth = async (req, res, next) => {
  // Get token from header
  const token = req.header('x-auth-token') || req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'No token, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Reject donor tokens: they are signed with the same secret but must not
    // be usable on staff/admin endpoints. Only User tokens carry `userId`.
    if (!decoded.userId || decoded.role === 'donor') {
      return res.status(403).json({ error: 'Not authorized for this resource' });
    }

    // Source of truth is the DB, not the token claims.
    const user = await User.findById(decoded.userId).select('role hospitalId isActive email name');
    if (!user) {
      return res.status(401).json({ error: 'User no longer exists' });
    }
    if (!user.isActive) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    req.user = {
      userId: user._id.toString(),
      role: user.role,
      hospitalId: user.hospitalId ? user.hospitalId.toString() : null,
      email: user.email,
      name: user.name,
    };
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token is not valid' });
  }
};

// Role-based middleware
const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Access denied. Admin only.' });
  }
  next();
};

const isSuperAdmin = (req, res, next) => {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Access denied. Super admin only.' });
  }
  next();
};


module.exports = { auth, isAdmin, isSuperAdmin };