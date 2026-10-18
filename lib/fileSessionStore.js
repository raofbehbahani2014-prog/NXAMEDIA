const fs = require('fs');
const path = require('path');
const session = require('express-session');

// ذخیره نشست‌ها روی دیسک تا با ری‌استارت سرور کاربران از حساب خارج نشوند
class FileSessionStore extends session.Store {
  constructor(dir) {
    super();
    this.file = path.join(dir, 'sessions.json');
    try { this.data = JSON.parse(fs.readFileSync(this.file, 'utf-8')); } catch (e) { this.data = {}; }
    this.timer = null;
  }
  _save() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const now = Date.now();
      for (const sid in this.data) {
        const exp = this.data[sid].cookie && this.data[sid].cookie.expires;
        if (exp && new Date(exp).getTime() < now) delete this.data[sid];
      }
      try {
        fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.data));
        fs.renameSync(this.file + '.tmp', this.file);
      } catch (e) { console.error('session save error', e.message); }
    }, 500);
  }
  get(sid, cb) {
    const s = this.data[sid];
    if (!s) return cb(null, null);
    const exp = s.cookie && s.cookie.expires;
    if (exp && new Date(exp).getTime() < Date.now()) { delete this.data[sid]; return cb(null, null); }
    cb(null, s);
  }
  set(sid, sess, cb) { this.data[sid] = sess; this._save(); cb && cb(null); }
  destroy(sid, cb) { delete this.data[sid]; this._save(); cb && cb(null); }
  touch(sid, sess, cb) { if (this.data[sid]) this.data[sid].cookie = sess.cookie; cb && cb(null); }
}
module.exports = FileSessionStore;
