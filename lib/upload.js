const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { UPLOAD_DIR, PRIVATE_DIR } = require('../data/db');

const ALLOWED = /\.(jpe?g|png|webp|gif|mp4|webm|mov|pdf|zip|docx?|xlsx?|pptx?|txt)$/i;

// نام فایل‌های فارسی توسط multer به‌صورت latin1 خوانده می‌شود؛ اینجا درست می‌کنیم
function fixName(name) {
  try { return Buffer.from(name, 'latin1').toString('utf8'); } catch (e) { return name; }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  // نام تصادفی و غیرقابل حدس برای فایل‌های اختصاصی مشتریان
  filename: (req, file, cb) => cb(null, crypto.randomBytes(12).toString('hex') + path.extname(file.originalname).toLowerCase())
});

const clientUpload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ALLOWED.test(file.originalname))
});

// آپلود فایل‌های پولی (دوره و پکیج) توسط ادمین؛ در پوشه خصوصی
const PRIVATE_ALLOWED = /\.(jpe?g|png|webp|gif|svg|mp4|webm|mov|mkv|mp3|wav|ogg|m4a|aac|pdf|zip|rar|7z|psd|ai|eps|aep|prproj|mogrt|cube|xmp|lrtemplate|ttf|otf|docx?|xlsx?|pptx?|txt)$/i;
const privateStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PRIVATE_DIR),
  filename: (req, file, cb) => cb(null, crypto.randomBytes(10).toString('hex') + path.extname(file.originalname).toLowerCase())
});
const privateUpload = multer({
  storage: privateStorage,
  limits: { fileSize: 1024 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, PRIVATE_ALLOWED.test(file.originalname))
});

// رسید کارت‌به‌کارت: فقط عکس یا PDF و حداکثر ۱۰ مگابایت، در پوشه خصوصی
const receiptStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PRIVATE_DIR),
  filename: (req, file, cb) => cb(null, 'receipt-' + crypto.randomBytes(10).toString('hex') + path.extname(file.originalname).toLowerCase())
});
const receiptUpload = multer({
  storage: receiptStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /\.(jpe?g|png|webp|pdf)$/i.test(file.originalname))
});

module.exports = { clientUpload, privateUpload, receiptUpload, fixName };
