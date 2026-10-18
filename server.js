require('dotenv').config();
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');

const { readDB, writeDB, DATA_DIR, UPLOAD_DIR } = require('./data/db');
const { hashPassword, verifyPassword, isBlocked, recordFail, clearFails } = require('./lib/auth');
const FileSessionStore = require('./lib/fileSessionStore');
const adminRoutes = require('./routes/admin');
const clientRoutes = require('./routes/client');
const shopRoutes = require('./routes/shop');
const shop = require('./lib/shop');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(bodyParser.json());
app.use(session({
  store: new FileSessionStore(DATA_DIR),
  secret: process.env.SESSION_SECRET || 'nxmedia-secret-key-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: 'auto', maxAge: 1000 * 60 * 60 * 24 * 14 }
}));

// متغیرهای عمومی در دسترس همه ویوها
app.use((req, res, next) => {
  const db = readDB();
  res.locals.site = db.site;
  res.locals.siteName = db.site.siteName;
  res.locals.currentUser = req.session.user || null;
  res.locals.baseUrl = `${req.protocol}://${req.get('host')}`;
  res.locals.currentPath = req.path;
  res.locals.fmtDate = (iso) => { const d = iso ? new Date(iso) : null; return d && !isNaN(d) ? d.toLocaleDateString('fa-IR') : '-'; };
  res.locals.amountOf = shop.amountOf;
  res.locals.orderStatus = shop.STATUS_LABEL;
  res.locals.orderMethod = shop.METHOD_LABEL;
  res.locals.fmtMoney = (n) => (Number(n) || 0).toLocaleString('fa-IR');
  next();
});

// ---------- پنل ادمین ----------
app.use('/admin', adminRoutes);

// ---------- صفحات اصلی ----------
app.get('/', (req, res) => {
  const db = readDB();
  res.render('pages/home', {
    title: `${db.site.siteName} | تولید محتوا و آموزش اینستاگرام`,
    services: db.services.slice(0, 6),
    testimonials: db.testimonials.slice(0, 3),
    portfolio: db.portfolio.slice(0, 4),
    pricing: db.pricing
  });
});

app.get('/about', (req, res) => {
  const db = readDB();
  res.render('pages/about', { title: `درباره ما و معرفی مجموعه | ${db.site.siteName}`, team: db.team });
});

// ---------- خدمات ----------
app.get('/services', (req, res) => {
  const db = readDB();
  res.render('pages/services', { title: `خدمات تولید محتوا و مدیریت اینستاگرام | ${db.site.siteName}`, description: 'تولید ریلز، پست و استوری، سناریونویسی، فیلم‌برداری، تدوین، طراحی گرافیک و مدیریت کامل پیج اینستاگرام.', services: db.services, pricing: db.pricing });
});

app.get('/services/:slug', (req, res) => {
  const db = readDB();
  const service = db.services.find(s => s.slug === req.params.slug);
  if (!service) return res.status(404).render('pages/404', { title: 'صفحه پیدا نشد' });
  res.render('pages/service-detail', {
    title: `${service.title} | ${db.site.siteName}`,
    description: service.summary,
    ogImage: service.image,
    jsonLd: { '@context': 'https://schema.org', '@type': 'Service', name: service.title, description: service.summary, provider: { '@type': 'Organization', name: db.site.siteName }, areaServed: 'IR' },
    service,
    amount: shop.amountOf(service),
    related: db.services.filter(s => s.slug !== service.slug).slice(0, 3)
  });
});

app.get('/pricing', (req, res) => {
  const db = readDB();
  res.render('pages/pricing', { title: `تعرفه خدمات | ${db.site.siteName}`, description: 'تعرفه و پکیج‌های تولید محتوا و مدیریت پیج اینستاگرام NxMedia.', pricing: db.pricing });
});

// ---------- نمونه‌کارها ----------
app.get('/portfolio', (req, res) => {
  const db = readDB();
  res.render('pages/portfolio', { title: `نمونه‌کارها و پروژه‌های انجام‌شده | ${db.site.siteName}`, description: 'نمونه‌کارها و Case Study پروژه‌های تولید محتوا و رشد پیج اینستاگرام برای برندهای مختلف.', portfolio: db.portfolio });
});

app.get('/portfolio/:slug', (req, res) => {
  const db = readDB();
  const item = db.portfolio.find(p => p.slug === req.params.slug);
  if (!item) return res.status(404).render('pages/404', { title: 'صفحه پیدا نشد' });
  res.render('pages/case-study', { title: `${item.title} | Case Study | ${db.site.siteName}`, description: item.summary, ogImage: item.cover, item });
});

// ---------- آموزش ----------
app.get('/education', (req, res) => {
  const db = readDB();
  res.render('pages/education', { title: `آموزش تولید محتوا | ${db.site.siteName}`, courses: db.courses, articles: db.articles });
});

app.get('/courses', (req, res) => {
  const db = readDB();
  res.render('pages/courses', { title: `دوره‌های آموزشی | ${db.site.siteName}`, description: 'دوره‌های تخصصی آموزش تولید محتوا، سناریونویسی ریلز و مدیریت پیج اینستاگرام.', courses: db.courses });
});

app.get('/courses/:slug', (req, res) => {
  const db = readDB();
  const course = db.courses.find(c => c.slug === req.params.slug);
  if (!course) return res.status(404).render('pages/404', { title: 'صفحه پیدا نشد' });
  res.render('pages/course-detail', { title: `${course.title} | ${db.site.siteName}`, amount: shop.amountOf(course), sellable: shop.isSellable(course), missingFile: !!req.session.isAdmin && !shop.hasFile(course), access: shop.hasAccess(db, req.session.user, 'course', course.slug), description: course.summary, ogImage: course.cover, course, jsonLd: { '@context': 'https://schema.org', '@type': 'Course', name: course.title, description: course.summary, provider: { '@type': 'Organization', name: db.site.siteName } } });
});

app.get('/blog', (req, res) => {
  const db = readDB();
  res.render('pages/blog', { title: `وبلاگ و مقالات آموزشی | ${db.site.siteName}`, description: 'جدیدترین مقالات آموزشی درباره الگوریتم اینستاگرام، کپشن‌نویسی، ریلز و استراتژی محتوا.', articles: db.articles });
});

app.get('/blog/:slug', (req, res) => {
  const db = readDB();
  const article = db.articles.find(a => a.slug === req.params.slug);
  if (!article) return res.status(404).render('pages/404', { title: 'صفحه پیدا نشد' });
  res.render('pages/article-detail', { title: `${article.title} | ${db.site.siteName}`, description: article.excerpt, ogImage: article.cover, ogType: 'article', article, jsonLd: { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: article.title, description: article.excerpt, image: article.cover || undefined, datePublished: article.date, author: { '@type': 'Organization', name: db.site.siteName }, publisher: { '@type': 'Organization', name: db.site.siteName } } });
});

// ---------- تماس / فرم‌ها ----------
app.get('/contact', (req, res) => {
  const db = readDB();
  res.render('pages/contact', { title: `تماس با ما | ${db.site.siteName}`, description: 'با تیم NxMedia تماس بگیرید؛ مشاوره و ثبت درخواست پروژه تولید محتوای اینستاگرام.', faqs: db.faqs });
});

app.post('/contact', (req, res) => {
  const db = readDB();
  db.leads.contact.push({ ...req.body, date: new Date().toLocaleString('fa-IR') });
  writeDB(db);
  res.render('pages/thanks', { title: 'پیام شما ارسال شد', message: 'پیام شما با موفقیت ثبت شد. تیم ما طی ۲۴ ساعت آینده با شما تماس می‌گیرد.' });
});

app.get('/request-project', (req, res) => {
  const db = readDB();
  res.render('pages/request-project', { title: `درخواست پروژه | ${db.site.siteName}`, services: db.services });
});

app.post('/request-project', (req, res) => {
  const db = readDB();
  db.leads.projectRequests.push({ ...req.body, date: new Date().toLocaleString('fa-IR') });
  writeDB(db);
  res.render('pages/thanks', { title: 'درخواست شما ثبت شد', message: 'درخواست پروژه شما ثبت شد. کارشناسان ما به‌زودی با شما هماهنگ می‌کنند.' });
});

app.get('/consultation', (req, res) => {
  res.render('pages/consultation', { title: `رزرو مشاوره اینستاگرام | ${res.locals.siteName}` });
});

app.post('/consultation', (req, res) => {
  const db = readDB();
  db.leads.consultations.push({ ...req.body, createdAt: new Date().toLocaleString('fa-IR') });
  writeDB(db);
  res.render('pages/thanks', { title: 'رزرو شما ثبت شد', message: 'زمان مشاوره شما ثبت شد. جزئیات نهایی از طریق واتساپ یا ایمیل اطلاع‌رسانی می‌شود.' });
});

app.post('/newsletter', (req, res) => {
  console.log('عضویت خبرنامه:', req.body.email);
  res.json({ ok: true, message: 'با موفقیت در خبرنامه عضو شدید.' });
});

// ---------- FAQ ----------
app.get('/faq', (req, res) => {
  const db = readDB();
  res.render('pages/faq', { title: `سوالات متداول | ${db.site.siteName}`, description: 'پاسخ به پرتکرارترین سوالات درباره تولید محتوا، مدیریت پیج و همکاری با ما.', faqs: db.faqs, jsonLd: { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: db.faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) } });
});

// ---------- جستجوی داخلی ساده ----------
app.get('/search', (req, res) => {
  const db = readDB();
  const q = (req.query.q || '').trim().toLowerCase();
  let results = [];
  if (q) {
    results = [
      ...db.services.filter(s => s.title.toLowerCase().includes(q) || (s.summary || '').toLowerCase().includes(q)).map(s => ({ type: 'خدمت', title: s.title, url: `/services/${s.slug}` })),
      ...db.articles.filter(a => a.title.toLowerCase().includes(q)).map(a => ({ type: 'مقاله', title: a.title, url: `/blog/${a.slug}` })),
      ...db.courses.filter(c => c.title.toLowerCase().includes(q)).map(c => ({ type: 'دوره', title: c.title, url: `/courses/${c.slug}` })),
      ...db.assets.filter(a => a.title.toLowerCase().includes(q)).map(a => ({ type: 'فیچر', title: a.title, url: `/store/${a.slug}` })),
      ...db.portfolio.filter(p => p.title.toLowerCase().includes(q)).map(p => ({ type: 'نمونه‌کار', title: p.title, url: `/portfolio/${p.slug}` }))
    ];
  }
  res.render('pages/search', { noindex: true, title: `نتایج جستجو برای «${req.query.q || ''}» | ${db.site.siteName}`, q: req.query.q || '', results });
});

// ---------- احراز هویت مشتری (ذخیره‌شده روی دیسک) ----------
const safeReturn = (u) => (typeof u === 'string' && u.startsWith('/') && !u.startsWith('//') ? u : null);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.get('/client/login', (req, res) => {
  if (req.session.user) return res.redirect('/client/dashboard');
  res.render('pages/client/login', { noindex: true, title: `ورود مشتری | ${res.locals.siteName}`, error: null });
});

app.post('/client/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const key = req.ip + '|' + email;
  const fail = (msg) => res.status(401).render('pages/client/login', { noindex: true, title: `ورود مشتری | ${res.locals.siteName}`, error: msg });

  if (isBlocked(key)) return fail('تلاش‌های ناموفق زیاد بود. ۱۵ دقیقه بعد دوباره امتحان کنید.');
  const db = readDB();
  const user = db.users.find(u => u.email === email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    recordFail(key);
    return fail('ایمیل یا رمز عبور نادرست است.');
  }
  clearFails(key);
  const returnTo = safeReturn(req.session.returnTo);
  req.session.regenerate(() => {
    req.session.user = { id: user.id, name: user.name, email: user.email };
    res.redirect(returnTo || '/client/dashboard');
  });
});

app.get('/client/register', (req, res) => {
  if (req.session.user) return res.redirect('/client/dashboard');
  res.render('pages/client/register', { noindex: true, title: `ثبت‌نام مشتری | ${res.locals.siteName}`, error: null, values: {} });
});

app.post('/client/register', (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const phone = String(req.body.phone || '').trim();
  const password = String(req.body.password || '');
  const password2 = String(req.body.password2 || '');
  const values = { name, email, phone };
  const fail = (msg) => res.status(400).render('pages/client/register', { noindex: true, title: `ثبت‌نام مشتری | ${res.locals.siteName}`, error: msg, values });

  if (name.length < 2) return fail('نام را وارد کنید.');
  if (!EMAIL_RE.test(email)) return fail('ایمیل معتبر نیست.');
  if (password.length < 8) return fail('رمز عبور باید حداقل ۸ کاراکتر باشد.');
  if (password !== password2) return fail('تکرار رمز عبور مطابقت ندارد.');

  const db = readDB();
  if (db.users.some(u => u.email === email)) return fail('این ایمیل قبلاً ثبت‌نام کرده است.');

  const user = {
    id: 'u-' + Date.now() + '-' + Math.round(Math.random() * 1000),
    name, email, phone,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString()
  };
  db.users.push(user);
  writeDB(db);
  const returnTo = safeReturn(req.session.returnTo);
  req.session.regenerate(() => {
    req.session.user = { id: user.id, name: user.name, email: user.email };
    res.redirect(returnTo || '/client/dashboard');
  });
});

app.post('/client/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

app.use('/', shopRoutes);

// ---------- پنل مشتری (داده‌های واقعی هر مشتری) ----------
app.use('/client', clientRoutes);

// ---------- صفحات قانونی ----------
app.get('/terms', (req, res) => {
  res.render('pages/terms', { title: `قوانین و شرایط همکاری | ${res.locals.siteName}` });
});

app.get('/privacy', (req, res) => {
  res.render('pages/privacy', { title: `حریم خصوصی | ${res.locals.siteName}` });
});

// ---------- sitemap و robots ساده ----------
app.get('/sitemap.xml', (req, res) => {
  const db = readDB();
  const base = `${req.protocol}://${req.get('host')}`;
  const staticUrls = ['/', '/about', '/services', '/portfolio', '/education', '/courses', '/store', '/blog', '/pricing', '/contact', '/faq', '/request-project', '/consultation', '/terms', '/privacy'];
  const dynamicUrls = [
    ...db.services.map(s => `/services/${s.slug}`),
    ...db.portfolio.map(p => `/portfolio/${p.slug}`),
    ...db.courses.map(c => `/courses/${c.slug}`),
    ...db.assets.map(a => `/store/${a.slug}`),
    ...db.articles.map(a => `/blog/${a.slug}`)
  ];
  const urls = [...staticUrls, ...dynamicUrls];
  res.set('Content-Type', 'application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${base}${u}</loc><lastmod>${new Date().toISOString().slice(0,10)}</lastmod><priority>${u === '/' ? '1.0' : '0.7'}</priority></url>`).join('\n')}
</urlset>`);
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /client/\nDisallow: /admin/\nDisallow: /checkout/\nDisallow: /download/\nSitemap: ${req.protocol}://${req.get('host')}/sitemap.xml`);
});

// ---------- 404 ----------
app.use((req, res) => {
  res.status(404).render('pages/404', { title: 'صفحه پیدا نشد' });
});

app.listen(PORT, () => {
  console.log(`✅ NxMedia در حال اجرا روی http://localhost:${PORT}`);
  console.log(`🔐 پنل ادمین: http://localhost:${PORT}/admin/login`);
});
