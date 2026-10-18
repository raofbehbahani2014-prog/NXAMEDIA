const fs = require('fs');
const path = require('path');

// مسیر ذخیره‌سازی: اگر DATA_DIR تنظیم شود (مثلا مسیر دیسک لیارا)، دیتا آنجا ذخیره می‌شود
const SEED_DB = path.join(__dirname, 'db.json');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : __dirname;
const DB_PATH = path.join(DATA_DIR, 'db.json');
const UPLOAD_DIR = process.env.DATA_DIR
  ? path.join(DATA_DIR, 'uploads')
  : path.join(__dirname, '..', 'public', 'uploads');

// پوشه خصوصی برای فایل‌های پولی و رسیدها (هرگز مستقیم سرو نمی‌شود)
const PRIVATE_DIR = process.env.DATA_DIR
  ? path.join(DATA_DIR, 'private')
  : path.join(__dirname, '..', 'private');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(PRIVATE_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// اولین اجرا روی دیسک جدید: دیتابیس اولیه را کپی کن
if (!fs.existsSync(DB_PATH)) {
  fs.copyFileSync(SEED_DB, DB_PATH);
}

function readDB() {
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  db.users = db.users || [];
  ['clientProjects', 'clientContent', 'clientFiles', 'clientInvoices', 'clientNotices', 'orders', 'assets'].forEach(k => { db[k] = db[k] || []; });
  return db;
}

// نوشتن اتمیک: اول فایل موقت، بعد جایگزینی (جلوگیری از خراب شدن فایل هنگام قطعی)
function writeDB(data) {
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, DB_PATH);
}

function slugify(str) {
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9آ-ی\u0600-\u06FF\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'item-' + Date.now();
}

module.exports = { readDB, writeDB, slugify, DATA_DIR, UPLOAD_DIR, PRIVATE_DIR };
