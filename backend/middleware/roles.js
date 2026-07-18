
const allowRoles = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (roles.includes(req.user.role)) return next();
  return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
};

// True if the user may act on the given hospital's data.
// superadmin is global; admin/staff are limited to their own hospital.
function canAccessHospital(user, hospitalId) {
  if (!user) return false;
  if (user.role === 'superadmin') return true;
  return Boolean(
    user.hospitalId && hospitalId && user.hospitalId.toString() === hospitalId.toString()
  );
}

module.exports = { allowRoles, canAccessHospital };