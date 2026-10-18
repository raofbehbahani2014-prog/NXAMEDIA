const { readDB } = require('../data/db');

// ورود مشتری لازم است و حساب او باید هنوز وجود داشته باشد (ممکن است ادمین حذفش کرده باشد)
function requireClient(req, res, next) {
  const sessUser = req.session && req.session.user;
  if (!sessUser) {
    if (req.method === 'GET') req.session.returnTo = req.originalUrl;
    return res.redirect('/client/login');
  }
  const me = readDB().users.find(u => u.id === sessUser.id);
  if (!me) return req.session.destroy(() => res.redirect('/client/login'));
  res.locals.me = me;
  req.me = me;
  next();
}

module.exports = { requireClient };
