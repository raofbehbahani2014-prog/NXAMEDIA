const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { readDB, writeDB, slugify, UPLOAD_DIR, PRIVATE_DIR } = require('../data/db');
const { collections } = require('../data/collections');
const { requireAdmin } = require('../middleware/adminAuth');
const { clientUpload, privateUpload, fixName } = require('../lib/upload');
const shop = require('../lib/shop');
const { sections, buildRecord } = require('../lib/clientData');

const router = express.Router();

// ---------- تنظیمات آپلود فایل ----------
const uploadDir = UPLOAD_DIR;
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = slugify(path.basename(file.originalname, ext));
    cb(null, `${base}-${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 300 * 1024 * 1024 }, // ۳۰۰ مگابایت (برای ویدئو)
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|gif|svg|mp4|webm|mov|quicktime|mpeg|mp3|wav|ogg|m4a|aac|zip|pdf/;
    const ok = allowed.test(file.mimetype) || allowed.test(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('نوع فایل مجاز نیست'), ok);
  }
});

function mediaType(filename) {
  return /\.(mp4|webm|mov)$/i.test(filename) ? 'video' : 'image';
}

// ---------- ورود ادمین ----------
router.get('/login', (req, res) => {
  if (req.session.isAdmin) return res.redirect('/admin');
  res.render('pages/admin/login', { title: 'ورود ادمین | NxMedia', error: null, layout: false });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPass = process.env.ADMIN_PASS || 'admin123';
  if (username === adminUser && password === adminPass) {
    req.session.isAdmin = true;
    req.session.adminName = username;
    return res.redirect('/admin');
  }
  res.render('pages/admin/login', { title: 'ورود ادمین | NxMedia', error: 'نام کاربری یا رمز عبور اشتباه است.' });
});

router.post('/logout', (req, res) => {
  req.session.isAdmin = false;
  res.redirect('/admin/login');
});

// از این به بعد همه روت‌ها نیاز به لاگین ادمین دارند
router.use(requireAdmin);

// ---------- داشبورد ----------
router.get('/', (req, res) => {
  const db = readDB();
  const counts = Object.keys(collections).reduce((acc, key) => {
    acc[key] = (db[key] || []).length;
    return acc;
  }, {});
  const leadCounts = {
    contact: (db.leads?.contact || []).length,
    projectRequests: (db.leads?.projectRequests || []).length,
    consultations: (db.leads?.consultations || []).length
  };
  res.render('pages/admin/dashboard', {
    title: 'داشبورد ادمین | NxMedia',
    collections, counts, leadCounts, mediaCount: (db.media || []).length,
    pendingOrders: db.orders.filter(o => o.status === 'awaiting_review').length,
    coordOrders: db.clientInvoices.filter(i => i.status === 'در انتظار هماهنگی').length
  });
});

// ---------- مدیریت متن‌ها و تنظیمات کلی سایت ----------
router.get('/site-settings', (req, res) => {
  const db = readDB();
  res.render('pages/admin/site-settings', { title: 'متن‌ها و تنظیمات سایت | ادمین', site: db.site });
});

router.post('/site-settings', (req, res) => {
  const db = readDB();
  // فرم به‌صورت تودرتو می‌آید: site[hero][title1] و ...
  db.site = deepMerge(db.site, req.body.site || {});
  writeDB(db);
  res.redirect('/admin/site-settings?saved=1');
});

function deepMerge(target, src) {
  for (const key in src) {
    if (src[key] !== null && typeof src[key] === 'object' && !Array.isArray(src[key])) {
      target[key] = deepMerge(target[key] || {}, src[key]);
    } else {
      target[key] = src[key];
    }
  }
  return target;
}

// ---------- کتابخانه رسانه (آپلود عکس/ویدئو) ----------
router.get('/media', (req, res) => {
  const db = readDB();
  res.render('pages/admin/media', { title: 'کتابخانه رسانه | ادمین', media: (db.media || []).slice().reverse() });
});

router.post('/media/upload', upload.array('files', 20), (req, res) => {
  const db = readDB();
  db.media = db.media || [];
  (req.files || []).forEach(f => {
    db.media.push({
      id: 'media-' + Date.now() + '-' + Math.round(Math.random() * 1000),
      url: '/uploads/' + f.filename,
      name: fixName(f.originalname),
      type: mediaType(f.filename),
      uploadedAt: new Date().toISOString()
    });
  });
  writeDB(db);
  res.redirect('/admin/media');
});

router.post('/media/:id/delete', (req, res) => {
  const db = readDB();
  const item = (db.media || []).find(m => m.id === req.params.id);
  if (item) {
    const filePath = path.join(uploadDir, path.basename(item.url));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    db.media = db.media.filter(m => m.id !== req.params.id);
    writeDB(db);
  }
  res.redirect('/admin/media');
});

// آپلود سریع (استفاده‌شده داخل فرم ویرایش آیتم‌ها، پاسخ JSON می‌دهد)
router.post('/upload-field', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, message: 'فایلی ارسال نشد' });
  const db = readDB();
  db.media = db.media || [];
  const entry = {
    id: 'media-' + Date.now(),
    url: '/uploads/' + req.file.filename,
    name: fixName(req.file.originalname),
    type: mediaType(req.file.filename),
    uploadedAt: new Date().toISOString()
  };
  db.media.push(entry);
  writeDB(db);
  res.json({ ok: true, url: entry.url });
});

// ---------- آپلود فایل پولی (پوشه خصوصی) ----------
router.post('/upload-private', (req, res) => {
  privateUpload.single('file')(req, res, (err) => {
    if (err || !req.file) return res.status(400).json({ ok: false, message: 'آپلود ناموفق بود (نوع یا حجم فایل مجاز نیست).' });
    res.json({ ok: true, name: req.file.filename, original: fixName(req.file.originalname) });
  });
});

// ---------- سفارش‌ها و پرداخت‌ها ----------
router.get('/orders', (req, res) => {
  const db = readDB();
  const status = String(req.query.status || '');
  let orders = db.orders.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  if (status) orders = orders.filter(o => o.status === status);
  const userMap = Object.fromEntries(db.users.map(u => [u.id, u]));
  res.render('pages/admin/orders', {
    title: 'سفارش‌ها و پرداخت‌ها | ادمین', active: 'orders', status,
    orders: orders.map(o => ({ ...o, user: userMap[o.userId] || { name: 'حذف‌شده', email: '' } })),
    users: db.users, courses: db.courses, assets: db.assets,
    counts: Object.fromEntries(Object.keys(shop.STATUS_LABEL).map(k => [k, db.orders.filter(o => o.status === k).length])),
    msg: req.query.msg || ''
  });
});

router.get('/orders/:id/receipt', (req, res) => {
  const db = readDB();
  const o = db.orders.find(x => x.id === req.params.id);
  if (!o || !o.receiptFile) return res.status(404).send('رسیدی ثبت نشده است.');
  const fp = path.join(PRIVATE_DIR, path.basename(o.receiptFile));
  if (!fs.existsSync(fp)) return res.status(404).send('فایل رسید پیدا نشد.');
  res.sendFile(fp);
});

router.post('/orders/:id/approve', (req, res) => {
  const db = readDB();
  const o = db.orders.find(x => x.id === req.params.id);
  if (o && ['awaiting_review', 'pending', 'rejected', 'failed'].includes(o.status)) {
    shop.markPaid(db, o, { reviewedAt: new Date().toISOString() });
    writeDB(db);
  }
  res.redirect('/admin/orders?msg=' + encodeURIComponent('پرداخت تایید و دسترسی کاربر فعال شد.'));
});

router.post('/orders/:id/reject', (req, res) => {
  const db = readDB();
  const o = db.orders.find(x => x.id === req.params.id);
  if (o && o.status === 'awaiting_review') {
    o.status = 'rejected';
    o.adminNote = String(req.body.note || '').trim().slice(0, 300);
    o.reviewedAt = new Date().toISOString();
    shop.addNotice(db, o.userId, 'رسید پرداخت شما تایید نشد', (o.title || '') + (o.adminNote ? ' — ' + o.adminNote : ''));
    writeDB(db);
  }
  res.redirect('/admin/orders?msg=' + encodeURIComponent('رسید رد شد و به کاربر اطلاع داده می‌شود.'));
});

// اعطای دستی دسترسی (مثلا پرداخت نقدی یا هدیه)
router.post('/orders/grant', (req, res) => {
  const db = readDB();
  const { userId, type } = req.body;
  const itemId = String(req.body.itemId || '');
  const user = db.users.find(u => u.id === userId);
  const p = user && ['course', 'asset'].includes(type) ? shop.getPurchasable(db, type, itemId, userId) : null;
  if (!p) return res.redirect('/admin/orders?msg=' + encodeURIComponent('اطلاعات نامعتبر است.'));
  if (!shop.hasAccess(db, user, type, itemId)) {
    const o = { id: 'ord-' + Date.now() + '-' + Math.round(Math.random() * 100000), userId, type, itemId, title: p.title, amount: p.amount, method: 'manual', status: 'pending', createdAt: new Date().toISOString() };
    db.orders.push(o);
    shop.markPaid(db, o, { reviewedAt: new Date().toISOString() });
    writeDB(db);
  }
  res.redirect('/admin/orders?msg=' + encodeURIComponent('دسترسی فعال شد.'));
});

// ---------- مشتریان ثبت‌نام‌شده ----------
function removeUploadedFile(url) {
  if (!url || !url.startsWith('/uploads/')) return;
  const fp = path.join(uploadDir, path.basename(url));
  try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch (e) { /* ignore */ }
}

router.get('/users/all', (req, res) => {
  const db = readDB();
  res.render('pages/admin/users', { title: 'مشتریان | ادمین', active: 'users', users: (db.users || []).slice().reverse() });
});

router.get('/users/:id', (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.redirect('/admin/users/all');
  const data = {};
  Object.keys(sections).forEach(key => {
    data[key] = db[sections[key].collection].filter(x => x.userId === user.id).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  });
  res.render('pages/admin/user-detail', {
    title: `${user.name} | مدیریت پنل مشتری`, active: 'users', user, sections, data,
    orders: db.orders.filter(o => o.userId === user.id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
    msg: req.query.msg || '', err: req.query.err || ''
  });
});

// افزودن آیتم برای مشتری
router.post('/users/:uid/:kind/add', (req, res, next) => {
  const conf = sections[req.params.kind];
  if (!conf) return next();
  clientUpload.single('file')(req, res, (uploadErr) => {
    const back = (q) => res.redirect(`/admin/users/${req.params.uid}?${q}#sec-${req.params.kind}`);
    const db = readDB();
    if (!db.users.find(u => u.id === req.params.uid)) return res.redirect('/admin/users/all');
    if (uploadErr) return back('err=' + encodeURIComponent('خطا در آپلود فایل (حجم یا نوع فایل مجاز نیست).'));

    const { record, error } = buildRecord(req.params.kind, req.body, null);
    if (error) { if (req.file) removeUploadedFile('/uploads/' + req.file.filename); return back('err=' + encodeURIComponent(error)); }

    const fileCol = conf.cols.find(c => c.type === 'file');
    if (fileCol) {
      if (req.file) {
        record[fileCol.name] = '/uploads/' + req.file.filename;
        if (req.params.kind === 'files' && !record.name) record.name = fixName(req.file.originalname);
      } else if (fileCol.requiredFile) {
        return back('err=' + encodeURIComponent('انتخاب فایل الزامی است.'));
      }
    }
    if (req.params.kind === 'files') record.by = 'admin';
    record.id = req.params.kind + '-' + Date.now() + '-' + Math.round(Math.random() * 1000);
    record.userId = req.params.uid;
    record.createdAt = new Date().toISOString();
    db[conf.collection].push(record);
    if (req.params.kind === 'invoices' && record.status === 'در انتظار پرداخت') shop.addNotice(db, req.params.uid, 'فاکتور شما آماده پرداخت است', record.title);
    writeDB(db);
    back('msg=' + encodeURIComponent('ذخیره شد.'));
  });
});

// ویرایش آیتم
router.post('/users/:uid/:kind/:id/edit', (req, res, next) => {
  const conf = sections[req.params.kind];
  if (!conf) return next();
  clientUpload.single('file')(req, res, (uploadErr) => {
    const back = (q) => res.redirect(`/admin/users/${req.params.uid}?${q}#sec-${req.params.kind}`);
    const db = readDB();
    const list = db[conf.collection];
    const idx = list.findIndex(x => x.id === req.params.id && x.userId === req.params.uid);
    if (idx === -1) return back('err=' + encodeURIComponent('مورد پیدا نشد.'));
    if (uploadErr) return back('err=' + encodeURIComponent('خطا در آپلود فایل.'));

    const { record, error } = buildRecord(req.params.kind, req.body, list[idx]);
    if (error) { if (req.file) removeUploadedFile('/uploads/' + req.file.filename); return back('err=' + encodeURIComponent(error)); }
    const fileCol = conf.cols.find(c => c.type === 'file');
    if (fileCol && req.file) {
      removeUploadedFile(list[idx][fileCol.name]);
      record[fileCol.name] = '/uploads/' + req.file.filename;
    }
    if (req.params.kind === 'invoices' && record.status === 'در انتظار پرداخت' && list[idx].status !== 'در انتظار پرداخت') {
      shop.addNotice(db, req.params.uid, 'فاکتور شما آماده پرداخت است', record.title);
    }
    list[idx] = record;
    writeDB(db);
    back('msg=' + encodeURIComponent('تغییرات ذخیره شد.'));
  });
});

router.post('/users/:uid/:kind/:id/delete', (req, res, next) => {
  const conf = sections[req.params.kind];
  if (!conf) return next();
  const db = readDB();
  const item = db[conf.collection].find(x => x.id === req.params.id && x.userId === req.params.uid);
  if (item) {
    const fileCol = conf.cols.find(c => c.type === 'file');
    if (fileCol) removeUploadedFile(item[fileCol.name]);
    db[conf.collection] = db[conf.collection].filter(x => x !== item && x.id !== item.id);
    writeDB(db);
  }
  res.redirect(`/admin/users/${req.params.uid}?msg=${encodeURIComponent('حذف شد.')}#sec-${req.params.kind}`);
});

// حذف مشتری همراه با همه داده‌ها و فایل‌هایش
router.post('/users/:id/delete', (req, res) => {
  const db = readDB();
  Object.keys(sections).forEach(key => {
    const conf = sections[key];
    const fileCol = conf.cols.find(c => c.type === 'file');
    db[conf.collection] = db[conf.collection].filter(x => {
      if (x.userId !== req.params.id) return true;
      if (fileCol) removeUploadedFile(x[fileCol.name]);
      return false;
    });
  });
  db.users = (db.users || []).filter(u => u.id !== req.params.id);
  writeDB(db);
  res.redirect('/admin/users/all');
});

// ---------- CRUD عمومی برای کالکشن‌ها ----------
router.get('/:collection', (req, res, next) => {
  const conf = collections[req.params.collection];
  if (!conf) return next();
  const db = readDB();
  res.render('pages/admin/collection-list', {
    title: `مدیریت ${conf.label} | ادمین`,
    key: req.params.collection,
    conf,
    items: db[req.params.collection] || []
  });
});

router.get('/:collection/new', (req, res, next) => {
  const conf = collections[req.params.collection];
  if (!conf) return next();
  res.render('pages/admin/collection-form', {
    title: `افزودن ${conf.label} | ادمین`,
    key: req.params.collection,
    conf,
    item: null
  });
});

router.get('/:collection/:id/edit', (req, res, next) => {
  const conf = collections[req.params.collection];
  if (!conf) return next();
  const db = readDB();
  const item = (db[req.params.collection] || []).find(i => String(i[conf.idField]) === req.params.id);
  if (!item) return res.redirect(`/admin/${req.params.collection}`);
  res.render('pages/admin/collection-form', {
    title: `ویرایش ${conf.label} | ادمین`,
    key: req.params.collection,
    conf,
    item
  });
});

function buildItemFromBody(conf, body, existing) {
  const item = existing ? { ...existing } : {};
  conf.fields.forEach(f => {
    const raw = body[f.name];
    if (f.type === 'list') {
      item[f.name] = (raw || '').split('\n').map(s => s.trim()).filter(Boolean);
    } else if (f.type === 'stats') {
      item[f.name] = (raw || '').split('\n').map(s => s.trim()).filter(Boolean).map(line => {
        const [label, value] = line.split('|').map(s => (s || '').trim());
        return { label: label || '', value: value || '' };
      });
    } else {
      item[f.name] = raw !== undefined ? raw : (item[f.name] || '');
    }
  });
  return item;
}

router.post('/:collection/new', (req, res, next) => {
  const conf = collections[req.params.collection];
  if (!conf) return next();
  const db = readDB();
  db[req.params.collection] = db[req.params.collection] || [];

  const item = buildItemFromBody(conf, req.body, null);
  if (conf.idField === 'slug') {
    item.slug = slugify(req.body.slug || req.body.title || req.body.name);
  } else {
    item.id = req.params.collection + '-' + Date.now();
  }
  db[req.params.collection].push(item);
  writeDB(db);
  res.redirect(`/admin/${req.params.collection}`);
});

router.post('/:collection/:id/edit', (req, res, next) => {
  const conf = collections[req.params.collection];
  if (!conf) return next();
  const db = readDB();
  const list = db[req.params.collection] || [];
  const idx = list.findIndex(i => String(i[conf.idField]) === req.params.id);
  if (idx === -1) return res.redirect(`/admin/${req.params.collection}`);

  const updated = buildItemFromBody(conf, req.body, list[idx]);
  updated[conf.idField] = list[idx][conf.idField]; // شناسه ثابت می‌ماند
  list[idx] = updated;
  db[req.params.collection] = list;
  writeDB(db);
  res.redirect(`/admin/${req.params.collection}`);
});

router.post('/:collection/:id/delete', (req, res, next) => {
  const conf = collections[req.params.collection];
  if (!conf) return next();
  const db = readDB();
  db[req.params.collection] = (db[req.params.collection] || []).filter(i => String(i[conf.idField]) !== req.params.id);
  writeDB(db);
  res.redirect(`/admin/${req.params.collection}`);
});

// ---------- مشاهده درخواست‌ها (فرم‌های سایت) ----------
router.get('/leads/all', (req, res) => {
  const db = readDB();
  const leads = db.leads || { contact: [], projectRequests: [], consultations: [] };
  const isCourse = l => /^(علاقه‌مندی به دوره|ثبت‌نام دوره)/.test(l.service || '');
  const userMap = Object.fromEntries(db.users.map(u => [u.id, u]));
  const serviceOrders = db.clientInvoices.filter(i => i.status === 'در انتظار هماهنگی').map(i => ({ ...i, user: userMap[i.userId] || { name: 'حذف‌شده', email: '' } }));
  res.render('pages/admin/leads', {
    serviceOrders,
    title: 'درخواست‌های دریافتی | ادمین',
    leads: { ...leads, projectRequests: leads.projectRequests.filter(l => !isCourse(l)), courseInterests: leads.projectRequests.filter(isCourse) }
  });
});

module.exports = router;
