const express = require('express');
const path = require('path');
const fs = require('fs');

const { readDB, writeDB, PRIVATE_DIR } = require('../data/db');
const { requireClient } = require('../middleware/clientAuth');
const { receiptUpload } = require('../lib/upload');
const shop = require('../lib/shop');
const payment = require('../lib/payment');

const router = express.Router();
const TYPES = ['course', 'asset', 'invoice'];
const newId = () => 'ord-' + Date.now() + '-' + Math.round(Math.random() * 100000);

function removePrivate(name) {
  if (!name) return;
  try { fs.unlinkSync(path.join(PRIVATE_DIR, path.basename(name))); } catch (e) { /* ignore */ }
}

// ---------- فروشگاه فیچرها (صدا، تصویر، قالب آماده) ----------
router.get('/store', (req, res) => {
  const db = readDB();
  const cat = String(req.query.cat || '');
  const assets = cat ? db.assets.filter(a => a.category === cat) : db.assets;
  res.render('pages/store', {
    title: `فروشگاه فیچرهای ادیت | ${db.site.siteName}`,
    description: 'قالب آماده، موزیک و افکت صوتی، تصاویر و LUT برای تدوین ویدئو و تولید محتوای اینستاگرام. نمونه رایگان دانلود کنید و نسخه کامل را بخرید.',
    assets, categories: shop.ASSET_CATEGORIES, cat
  });
});

router.get('/store/:slug', (req, res) => {
  const db = readDB();
  const asset = db.assets.find(a => a.slug === req.params.slug);
  if (!asset) return res.status(404).render('pages/404', { title: 'صفحه پیدا نشد' });
  res.render('pages/asset-detail', {
    title: `${asset.title} | ${db.site.siteName}`,
    description: asset.summary,
    ogImage: asset.cover,
    asset,
    amount: shop.amountOf(asset),
    sellable: shop.isSellable(asset),
    missingFile: !!req.session.isAdmin && !shop.hasFile(asset),
    access: shop.hasAccess(db, req.session.user, 'asset', asset.slug),
    jsonLd: {
      '@context': 'https://schema.org', '@type': 'Product', name: asset.title, description: asset.summary,
      image: asset.cover || undefined, category: asset.category,
      offers: { '@type': 'Offer', priceCurrency: 'IRR', price: String(shop.amountOf(asset) * 10), availability: 'https://schema.org/InStock' }
    }
  });
});

// ---------- سفارش خدمت یا پکیج (ثبت درخواست، هماهنگی، سپس پرداخت از پنل) ----------
function findOrderable(db, kind, id) {
  if (kind === 'service') { const it = db.services.find(x => x.slug === id); return it && { item: it, title: it.title, backUrl: '/services/' + it.slug, priceText: it.priceNote || '' }; }
  if (kind === 'package') { const it = db.pricing.find(x => x.id === id); return it && { item: it, title: it.name, backUrl: '/pricing', priceText: '' }; }
  return null;
}

router.get('/order/:kind/:id', requireClient, (req, res) => {
  const db = readDB();
  const o = findOrderable(db, req.params.kind, req.params.id);
  if (!o) return res.status(404).render('pages/404', { title: 'صفحه پیدا نشد' });
  res.render('pages/order-service', { noindex: true, title: 'سفارش ' + o.title, o, kind: req.params.kind, id: req.params.id, amount: shop.amountOf(o.item), priceRaw: o.item.price || '' });
});

router.post('/order/:kind/:id', requireClient, (req, res) => {
  const db = readDB();
  const o = findOrderable(db, req.params.kind, req.params.id);
  if (!o) return res.status(404).render('pages/404', { title: 'صفحه پیدا نشد' });
  const r = shop.createServiceOrder(db, req.me, req.params.kind, o.item, req.body.note);
  if (!r.duplicate) writeDB(db);
  res.redirect('/client/invoices?ok=' + (r.duplicate ? 'dup' : 'service'));
});

// ---------- صفحه پرداخت ----------
function guard(req, res, db) {
  const { type, id } = req.params;
  if (!TYPES.includes(type)) { res.status(404).render('pages/404', { title: 'صفحه پیدا نشد' }); return null; }
  const p = shop.getPurchasable(db, type, id, req.me.id);
  if (!p) { res.status(404).render('pages/404', { title: 'صفحه پیدا نشد' }); return null; }
  if (shop.hasAccess(db, req.me, type, id)) { res.redirect('/client/purchases'); return null; }
  if (!p.sellable) { res.redirect(p.backUrl); return null; }
  return p;
}

router.get('/checkout/:type/:id', requireClient, (req, res) => {
  const db = readDB();
  const p = guard(req, res, db);
  if (!p) return;
  const { type, id } = req.params;
  const cfg = shop.paymentConfig(db);
  delete cfg.merchant;
  res.render('pages/checkout', {
    noindex: true, title: 'پرداخت | ' + db.site.siteName, p, type, id, cfg,
    pending: db.orders.find(o => o.userId === req.me.id && o.type === type && o.itemId === id && o.status === 'awaiting_review'),
    err: req.query.err || ''
  });
});

// پرداخت با درگاه
router.post('/checkout/:type/:id/gateway', requireClient, async (req, res) => {
  const db = readDB();
  const p = guard(req, res, db);
  if (!p) return;
  const { type, id } = req.params;
  const back = (e) => res.redirect(`/checkout/${type}/${id}?err=${encodeURIComponent(e)}`);
  const cfg = shop.paymentConfig(db);
  if (!cfg.gatewayReady) return back('درگاه پرداخت آنلاین هنوز فعال نشده است.');

  const order = {
    id: newId(), userId: req.me.id, type, itemId: id, title: p.title, amount: p.amount,
    method: 'gateway', status: 'pending', createdAt: new Date().toISOString()
  };
  db.orders.push(order);
  writeDB(db);

  const base = ((db.site.seo && db.site.seo.siteUrl) || process.env.SITE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  try {
    const r = await payment.request(cfg, {
      amount: p.amount, description: p.title, callbackUrl: `${base}/payment/callback/${order.id}`,
      email: req.me.email, mobile: req.me.phone
    });
    const fresh = readDB();
    const o = fresh.orders.find(x => x.id === order.id);
    o.authority = r.authority;
    writeDB(fresh);
    res.redirect(r.url);
  } catch (e) {
    const fresh = readDB();
    const o = fresh.orders.find(x => x.id === order.id);
    if (o) { o.status = 'failed'; o.note = 'خطا در اتصال به درگاه: ' + e.message; writeDB(fresh); }
    back('اتصال به درگاه ناموفق بود. لطفاً دوباره تلاش کنید یا کارت‌به‌کارت را انتخاب کنید.');
  }
});

// بازگشت از درگاه
router.get('/payment/callback/:orderId', async (req, res) => {
  const db = readDB();
  const order = db.orders.find(o => o.id === req.params.orderId && o.method === 'gateway');
  if (!order) return res.status(404).render('pages/404', { title: 'صفحه پیدا نشد' });
  const result = (ok, msg) => res.render('pages/payment-result', { noindex: true, title: 'نتیجه پرداخت', ok, msg, order });

  if (order.status === 'paid') return result(true, '');
  if (order.status !== 'pending') return result(false, 'این پرداخت قبلاً بسته شده است.');
  if (!order.authority || String(req.query.Authority || '') !== order.authority) return result(false, 'اطلاعات بازگشت از درگاه معتبر نیست.');

  if (req.query.Status !== 'OK') {
    order.status = 'failed'; order.note = 'پرداخت توسط کاربر لغو شد یا ناموفق بود.';
    writeDB(db);
    return result(false, 'پرداخت انجام نشد یا لغو شد.');
  }
  try {
    const cfg = shop.paymentConfig(db);
    const v = await payment.verify(cfg, { amount: order.amount, authority: order.authority });
    const fresh = readDB();
    const o = fresh.orders.find(x => x.id === order.id);
    if (v.ok) {
      if (o.status === 'pending') shop.markPaid(fresh, o, { refId: v.refId });
      writeDB(fresh);
      return result(true, '');
    }
    o.status = 'failed'; o.note = 'تایید پرداخت ناموفق: ' + v.error;
    writeDB(fresh);
    return result(false, 'تایید پرداخت توسط درگاه انجام نشد.');
  } catch (e) {
    // پرداخت ممکن است انجام شده باشد؛ سفارش pending می‌ماند تا ادمین بررسی کند
    return result(false, 'ارتباط با درگاه برای تایید پرداخت برقرار نشد. اگر مبلغ از حساب شما کم شده، با پشتیبانی تماس بگیرید.');
  }
});

// کارت‌به‌کارت با ارسال رسید
router.post('/checkout/:type/:id/card', requireClient, (req, res) => {
  receiptUpload.single('receipt')(req, res, (uploadErr) => {
    const db = readDB();
    const p = guard(req, res, db);
    if (!p) { if (req.file) removePrivate(req.file.filename); return; }
    const { type, id } = req.params;
    const back = (e) => { if (req.file) removePrivate(req.file.filename); res.redirect(`/checkout/${type}/${id}?err=${encodeURIComponent(e)}`); };

    const cfg = shop.paymentConfig(db);
    if (!cfg.cardEnabled) return back('پرداخت کارت‌به‌کارت فعال نیست.');
    if (uploadErr) return back('آپلود رسید ناموفق بود (فقط عکس یا PDF تا ۱۰ مگابایت).');
    const trackingCode = String(req.body.trackingCode || '').trim().slice(0, 40);
    if (!req.file && !trackingCode) return back('تصویر رسید یا کد پیگیری را وارد کنید.');
    if (db.orders.some(o => o.userId === req.me.id && o.type === type && o.itemId === id && o.status === 'awaiting_review')) {
      return back('رسید قبلی شما در حال بررسی است.');
    }

    db.orders.push({
      id: newId(), userId: req.me.id, type, itemId: id, title: p.title, amount: p.amount,
      method: 'card', status: 'awaiting_review',
      trackingCode, note: String(req.body.note || '').trim().slice(0, 300),
      receiptFile: req.file ? req.file.filename : '',
      createdAt: new Date().toISOString()
    });
    writeDB(db);
    res.redirect('/client/purchases?ok=card');
  });
});

// ---------- دانلود نسخه کامل (فقط بعد از پرداخت) ----------
router.get('/download/:type/:id', requireClient, (req, res) => {
  const { type, id } = req.params;
  if (!['course', 'asset'].includes(type)) return res.status(404).render('pages/404', { title: 'صفحه پیدا نشد' });
  const db = readDB();
  const item = (type === 'course' ? db.courses : db.assets).find(x => x.slug === id);
  if (!item) return res.status(404).render('pages/404', { title: 'صفحه پیدا نشد' });
  if (!shop.hasAccess(db, req.me, type, id) && !req.session.isAdmin) return res.redirect(`/checkout/${type}/${id}`);

  if (item.fullLink && /^https?:\/\//i.test(item.fullLink)) return res.redirect(item.fullLink);
  const file = item.fullFile ? path.join(PRIVATE_DIR, path.basename(item.fullFile)) : '';
  if (!file || !fs.existsSync(file)) {
    return res.status(404).render('pages/payment-result', { noindex: true, title: 'فایل آماده نیست', ok: false, msg: 'فایل این محصول هنوز بارگذاری نشده است. با پشتیبانی تماس بگیرید.', order: null });
  }
  res.download(file, item.title + path.extname(file));
});

module.exports = router;
