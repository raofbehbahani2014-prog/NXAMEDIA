const express = require('express');
const path = require('path');
const fs = require('fs');

const { readDB, writeDB, UPLOAD_DIR } = require('../data/db');
const { requireClient } = require('../middleware/clientAuth');
const { clientUpload, fixName } = require('../lib/upload');

const router = express.Router();

// صفحات ورود/ثبت‌نام در server.js تعریف شده‌اند؛ فقط مسیرهای زیر نیاز به ورود دارند
const PANEL = ['/purchases', '/dashboard', '/projects', '/content-calendar', '/files', '/invoices', '/content', '/files/upload'];
router.use((req, res, next) => (PANEL.some(p => req.path === p || req.path.startsWith(p + '/')) ? requireClient(req, res, next) : next()));

const mine = (arr, uid) => (arr || []).filter(x => x.userId === uid);
const byNewest = (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''));

router.get('/dashboard', (req, res) => {
  const db = readDB();
  const uid = req.me.id;
  const projects = mine(db.clientProjects, uid);
  const content = mine(db.clientContent, uid);
  const invoices = mine(db.clientInvoices, uid);
  res.render('pages/client/dashboard', {
    noindex: true,
    title: 'پنل مشتری',
    stats: {
      activeProjects: projects.filter(p => p.status !== 'تکمیل‌شده').length,
      pendingContent: content.filter(c => c.status === 'در انتظار تایید').length,
      unpaidInvoices: invoices.filter(i => i.status === 'در انتظار پرداخت').length
    },
    notices: mine(db.clientNotices, uid).sort(byNewest).slice(0, 6)
  });
});

router.get('/projects', (req, res) => {
  const db = readDB();
  res.render('pages/client/projects', { noindex: true, title: 'پروژه‌های من | پنل مشتری', projects: mine(db.clientProjects, req.me.id).sort(byNewest) });
});

router.get('/content-calendar', (req, res) => {
  const db = readDB();
  const items = mine(db.clientContent, req.me.id).sort((a, b) => String(a.date || '9999').localeCompare(String(b.date || '9999')));
  res.render('pages/client/content-calendar', { noindex: true, title: 'تقویم محتوایی | پنل مشتری', items });
});

// تایید یا درخواست اصلاح محتوا توسط مشتری
router.post('/content/:id/approve', (req, res) => {
  const db = readDB();
  const it = db.clientContent.find(x => x.id === req.params.id && x.userId === req.me.id);
  if (it && it.status === 'در انتظار تایید') { it.status = 'تایید شده'; it.clientNote = ''; writeDB(db); }
  res.redirect('/client/content-calendar');
});

router.post('/content/:id/revise', (req, res) => {
  const db = readDB();
  const it = db.clientContent.find(x => x.id === req.params.id && x.userId === req.me.id);
  if (it && it.status === 'در انتظار تایید') {
    it.status = 'نیاز به اصلاح';
    it.clientNote = String(req.body.note || '').trim().slice(0, 500);
    writeDB(db);
  }
  res.redirect('/client/content-calendar');
});

router.get('/files', (req, res) => {
  const db = readDB();
  res.render('pages/client/files', { noindex: true, title: 'فایل‌ها | پنل مشتری', files: mine(db.clientFiles, req.me.id).sort(byNewest), err: req.query.err || '', ok: req.query.ok || '' });
});

router.post('/files/upload', (req, res) => {
  clientUpload.single('file')(req, res, (err) => {
    if (err || !req.file) return res.redirect('/client/files?err=1');
    const db = readDB();
    db.clientFiles.push({
      id: 'files-' + Date.now() + '-' + Math.round(Math.random() * 1000),
      userId: req.me.id,
      name: fixName(req.file.originalname),
      url: '/uploads/' + req.file.filename,
      by: 'client',
      createdAt: new Date().toISOString()
    });
    writeDB(db);
    res.redirect('/client/files?ok=1');
  });
});

// مشتری فقط فایل‌هایی را که خودش آپلود کرده می‌تواند حذف کند
router.post('/files/:id/delete', (req, res) => {
  const db = readDB();
  const f = db.clientFiles.find(x => x.id === req.params.id && x.userId === req.me.id && x.by === 'client');
  if (f) {
    const fp = path.join(UPLOAD_DIR, path.basename(f.url));
    try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch (e) { /* ignore */ }
    db.clientFiles = db.clientFiles.filter(x => x.id !== f.id);
    writeDB(db);
  }
  res.redirect('/client/files');
});

router.get('/invoices', (req, res) => {
  const db = readDB();
  res.render('pages/client/invoices', { noindex: true, title: 'فاکتورها | پنل مشتری', invoices: mine(db.clientInvoices, req.me.id).sort(byNewest), ok: req.query.ok || '' });
});

router.get('/purchases', (req, res) => {
  const db = readDB();
  const orders = db.orders.filter(o => o.userId === req.me.id).sort(byNewest).map(o => {
    const p = ['course', 'asset'].includes(o.type) ? (o.type === 'course' ? db.courses : db.assets).find(x => x.slug === o.itemId) : null;
    return { ...o, exists: o.type === 'invoice' || !!p, itemUrl: o.type === 'course' ? '/courses/' + o.itemId : o.type === 'asset' ? '/store/' + o.itemId : '/client/invoices' };
  });
  res.render('pages/client/purchases', { noindex: true, title: 'خریدها و پرداخت‌ها | پنل مشتری', orders, ok: req.query.ok || '' });
});

module.exports = router;
