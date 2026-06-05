function requireLogin(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.redirect('/login');
}
function requireRole(...roles) {
  return (req, res, next) => {
    const u = req.session && req.session.user;
    if (!u) return res.redirect('/login');
    if (!roles.includes(u.role)) return res.status(403).render('error', { title: 'Χωρίς πρόσβαση', message: 'Δεν έχετε πρόσβαση σε αυτή τη σελίδα.', user: u });
    return next();
  };
}
function homeForRole(role) {
  if (role === 'admin') return '/admin';
  if (role === 'driver') return '/driver';
  return '/staff';
}
module.exports = { requireLogin, requireRole, homeForRole };
