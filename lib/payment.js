// اتصال به درگاه پرداخت زرین‌پال (API نسخه ۴). برای درگاه دیگر فقط این فایل را عوض کنید.
// نکته: مبلغ در API زرین‌پال به ریال است؛ قیمت‌های سایت تومان است، پس ×۱۰ می‌شود.
// قبل از راه‌اندازی نهایی، واحد مبلغ را با مستندات یا پنل زرین‌پال خود چک کنید.

function endpoints(cfg) {
  return cfg.sandbox
    ? { api: 'https://sandbox.zarinpal.com/pg/v4/payment', start: 'https://sandbox.zarinpal.com/pg/StartPay/' }
    : { api: 'https://api.zarinpal.com/pg/v4/payment', start: 'https://www.zarinpal.com/pg/StartPay/' };
}

async function post(url, body) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    return await r.json();
  } finally { clearTimeout(t); }
}

function errText(j) {
  const e = j && j.errors;
  if (e && e.message) return e.message;
  if (Array.isArray(e) && e[0] && e[0].message) return e[0].message;
  return 'خطای نامشخص از درگاه';
}

async function request(cfg, { amount, description, callbackUrl, email, mobile }) {
  const ep = endpoints(cfg);
  const metadata = {};
  if (email) metadata.email = email;
  if (mobile && /^09\d{9}$/.test(mobile)) metadata.mobile = mobile;
  const j = await post(ep.api + '/request.json', {
    merchant_id: cfg.merchant,
    amount: amount * 10,
    callback_url: callbackUrl,
    description: String(description || 'پرداخت').slice(0, 200),
    metadata
  });
  if (j && j.data && j.data.code === 100 && j.data.authority) {
    return { authority: j.data.authority, url: ep.start + j.data.authority };
  }
  throw new Error(errText(j));
}

async function verify(cfg, { amount, authority }) {
  const ep = endpoints(cfg);
  const j = await post(ep.api + '/verify.json', { merchant_id: cfg.merchant, amount: amount * 10, authority });
  if (j && j.data && (j.data.code === 100 || j.data.code === 101)) {
    return { ok: true, refId: String(j.data.ref_id || '') };
  }
  return { ok: false, error: errText(j) };
}

module.exports = { request, verify };
