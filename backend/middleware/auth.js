const jwt = require('jsonwebtoken');

// Main authentication middleware
const auth = (req, res, next) => {
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

    req.user = decoded;
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