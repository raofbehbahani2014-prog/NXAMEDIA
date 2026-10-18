// منطق مشترک فروش: قیمت، دسترسی، پرداخت موفق، تنظیمات درگاه
const ASSET_CATEGORIES = ['صدا و موزیک', 'افکت صوتی', 'تصویر و استوک', 'قالب آماده ویدئو', 'قالب پست و استوری', 'LUT و رنگ‌بندی', 'ترنزیشن و افکت', 'فونت', 'سایر'];

const STATUS_LABEL = {
  pending: 'در انتظار پرداخت (درگاه)',
  awaiting_review: 'در انتظار بررسی رسید',
  paid: 'پرداخت‌شده',
  rejected: 'رد شده',
  failed: 'ناموفق'
};
const METHOD_LABEL = { gateway: 'درگاه آنلاین', card: 'کارت‌به‌کارت', manual: 'اعطای دستی' };

function normDigits(str) {
  return String(str || '')
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
}

// قیمت به تومان؛ اگر نامعتبر باشد 0 (یعنی قابل فروش نیست، نه رایگان)
function amountOf(item) {
  for (const f of ['priceAmount', 'price']) {
    const n = parseInt(normDigits(item && item[f]).replace(/[^\d]/g, ''), 10);
    if (!isNaN(n) && n > 0) return n;
  }
  return 0;
}

function isSellable(item) {
  return amountOf(item) > 0;
}

function hasFile(item) {
  return !!(item && (item.fullFile || item.fullLink));
}

function hasAccess(db, user, type, id) {
  if (!user) return false;
  if (type === 'invoice') {
    const inv = db.clientInvoices.find(i => i.id === id && i.userId === user.id);
    return !!inv && inv.status === 'پرداخت‌شده';
  }
  return db.orders.some(o => o.userId === user.id && o.type === type && o.itemId === id && o.status === 'paid');
}

// آیتم قابل خرید را با اطلاعات لازم برمی‌گرداند؛ قیمت همیشه از سرور خوانده می‌شود
function getPurchasable(db, type, id, userId) {
  if (type === 'course') {
    const c = db.courses.find(x => x.slug === id);
    return c && { item: c, title: c.title, amount: amountOf(c), backUrl: '/courses/' + c.slug, sellable: isSellable(c) };
  }
  if (type === 'asset') {
    const a = db.assets.find(x => x.slug === id);
    return a && { item: a, title: a.title, amount: amountOf(a), backUrl: '/store/' + a.slug, sellable: isSellable(a) };
  }
  if (type === 'invoice') {
    const inv = db.clientInvoices.find(i => i.id === id && i.userId === userId);
    return inv && {
      item: inv,
      title: 'فاکتور ' + (inv.number ? inv.number + ' - ' : '') + inv.title,
      amount: amountOf({ priceAmount: inv.amount }),
      backUrl: '/client/invoices',
      sellable: inv.status === 'در انتظار پرداخت' && amountOf({ priceAmount: inv.amount }) > 0
    };
  }
  return null;
}

function addNotice(db, userId, title, text) {
  db.clientNotices.push({
    id: 'notices-' + Date.now() + '-' + Math.round(Math.random() * 1000),
    userId, title, text: text || '', createdAt: new Date().toISOString()
  });
}

// ثبت پرداخت موفق (هم درگاه و هم تایید دستی ادمین از این استفاده می‌کنند)
function markPaid(db, order, extra) {
  order.status = 'paid';
  order.paidAt = new Date().toISOString();
  Object.assign(order, extra || {});
  if (order.type === 'invoice') {
    const inv = db.clientInvoices.find(i => i.id === order.itemId && i.userId === order.userId);
    if (inv) inv.status = 'پرداخت‌شده';
  }
  addNotice(db, order.userId, 'پرداخت شما تایید شد ✅', order.title);
}

// سفارش خدمت/پکیج: یک فاکتور «در انتظار هماهنگی» می‌سازد؛ بعد از هماهنگی ادمین آن را «در انتظار پرداخت» می‌کند
function createServiceOrder(db, user, kind, item, note) {
  const title = kind === 'package' ? item.name : item.title;
  const key = kind + ':' + (kind === 'package' ? item.id : item.slug);
  const open = db.clientInvoices.find(i => i.userId === user.id && i.orderKey === key && i.status === 'در انتظار هماهنگی');
  if (open) return { duplicate: true, invoice: open };
  const inv = {
    id: 'invoices-' + Date.now() + '-' + Math.round(Math.random() * 1000),
    userId: user.id,
    number: 'F-' + String(Date.now()).slice(-6),
    title: (kind === 'package' ? 'پکیج ' : 'خدمت ') + title,
    amount: amountOf(item),
    status: 'در انتظار هماهنگی',
    date: new Date().toISOString().slice(0, 10),
    orderKey: key,
    customerNote: String(note || '').trim().slice(0, 500),
    createdAt: new Date().toISOString()
  };
  db.clientInvoices.push(inv);
  addNotice(db, user.id, 'درخواست شما ثبت شد', title + ' — بعد از هماهنگی با تیم، فاکتور برای پرداخت فعال می‌شود.');
  return { duplicate: false, invoice: inv };
}

function paymentConfig(db) {
  const p = (db.site && db.site.payment) || {};
  const merchant = process.env.ZARINPAL_MERCHANT_ID || p.merchantId || '';
  const sandbox = process.env.ZARINPAL_SANDBOX ? process.env.ZARINPAL_SANDBOX === 'true' : p.sandbox === 'yes';
  return {
    merchant, sandbox,
    gatewayEnabled: p.gatewayEnabled !== 'no',
    gatewayReady: p.gatewayEnabled !== 'no' && !!merchant,
    cardEnabled: p.cardEnabled !== 'no' && !!p.cardNumber,
    cardNumber: p.cardNumber || '', cardOwner: p.cardOwner || '', bankName: p.bankName || '', cardNote: p.cardNote || ''
  };
}

module.exports = { createServiceOrder, hasFile, ASSET_CATEGORIES, STATUS_LABEL, METHOD_LABEL, amountOf, isSellable, hasAccess, getPurchasable, markPaid, addNotice, paymentConfig, normDigits };
