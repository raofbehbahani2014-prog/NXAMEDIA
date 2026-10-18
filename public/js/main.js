document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.mobile-toggle');
  const nav = document.querySelector('nav.main-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => nav.classList.toggle('open'));
  }

  const newsletterForm = document.querySelector('#newsletter-form');
  if (newsletterForm) {
    newsletterForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = newsletterForm.querySelector('input[name="email"]').value;
      const msgBox = newsletterForm.querySelector('.form-msg');
      try {
        const res = await fetch('/newsletter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (msgBox) msgBox.textContent = data.message || 'عضویت با موفقیت انجام شد.';
        newsletterForm.reset();
      } catch (err) {
        if (msgBox) msgBox.textContent = 'خطایی رخ داد. دوباره تلاش کنید.';
      }
    });
  }

  const searchForm = document.querySelector('#site-search-form');
  if (searchForm) {
    searchForm.addEventListener('submit', (e) => {
      const input = searchForm.querySelector('input[name="q"]');
      if (!input.value.trim()) e.preventDefault();
    });
  }
});

// ===== موشن و انیمیشن‌ها =====
document.addEventListener('DOMContentLoaded', () => {
  // ظاهر شدن المان‌ها هنگام اسکرول
  const targets = document.querySelectorAll('.card, .portfolio-card, .testimonial-card, .price-card, .faq-item, .stat-box, .section-head, .story, .cta-band');
  targets.forEach((el, i) => { el.classList.add('reveal'); el.style.transitionDelay = ((i % 4) * 0.08) + 's'; });
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    targets.forEach(el => io.observe(el));
  } else {
    targets.forEach(el => el.classList.add('visible'));
  }

  // نوار پیشرفت اسکرول
  const bar = document.getElementById('scroll-progress');
  if (bar) {
    window.addEventListener('scroll', () => {
      const h = document.documentElement;
      const p = (h.scrollTop / (h.scrollHeight - h.clientHeight)) * 100;
      bar.style.width = p + '%';
    }, { passive: true });
  }

  // شمارنده انیمیشنی اعداد (فقط اگر عدد انگلیسی/فارسی باشد)
  const faDigits = '۰۱۲۳۴۵۶۷۸۹';
  const toFa = n => String(n).replace(/\d/g, d => faDigits[d]);
  const toEn = s => s.replace(/[۰-۹]/g, d => faDigits.indexOf(d));
  document.querySelectorAll('.hero-stats strong, .stat-box strong').forEach(el => {
    const original = el.textContent.trim();
    const m = toEn(original).match(/^([+]?)(\d+)(.*)$/);
    if (!m) return;
    const target = parseInt(m[2], 10);
    const usedFa = /[۰-۹]/.test(original);
    const co = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        co.disconnect();
        const start = performance.now(), dur = 1400;
        const tick = now => {
          const t = Math.min((now - start) / dur, 1);
          const val = Math.round(target * (1 - Math.pow(1 - t, 3)));
          el.textContent = m[1] + (usedFa ? toFa(val) : val) + m[3];
          if (t < 1) requestAnimationFrame(tick); else el.textContent = original;
        };
        requestAnimationFrame(tick);
      });
    });
    co.observe(el);
  });

  // لایک با دابل‌کلیک روی گوشی موکاپ
  const phoneImg = document.querySelector('.phone-img');
  if (phoneImg) {
    phoneImg.addEventListener('dblclick', (e) => {
      const h = document.createElement('div');
      h.textContent = '❤️';
      h.style.cssText = `position:absolute;left:${e.offsetX - 20}px;top:${e.offsetY - 20}px;font-size:44px;animation:riseFade 1s ease-out forwards;pointer-events:none;`;
      phoneImg.appendChild(h);
      setTimeout(() => h.remove(), 1000);
    });
  }
});
