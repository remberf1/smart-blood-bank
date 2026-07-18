
const allowRoles = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (roles.includes(req.user.role)) return next();
  return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
};

module.exports = { allowRoles };