// تعریف بخش‌های داده هر مشتری؛ هم توسط ادمین و هم پنل مشتری استفاده می‌شود
const STATUS = {
  project: ['در حال انجام', 'در انتظار تایید', 'تکمیل‌شده', 'متوقف'],
  content: ['پیش‌نویس', 'در انتظار تایید', 'تایید شده', 'نیاز به اصلاح', 'منتشر شد'],
  invoice: ['در انتظار پرداخت', 'در انتظار هماهنگی', 'پرداخت‌شده']
};
const CONTENT_TYPES = ['ریلز', 'پست', 'استوری', 'کاروسل', 'ویدئو', 'سایر'];

// key = نام بخش در URL ، collection = نام آرایه در db.json
const sections = {
  projects: {
    collection: 'clientProjects', title: 'پروژه‌ها', icon: '📁',
    cols: [
      { name: 'title', label: 'عنوان پروژه', type: 'text', required: true },
      { name: 'status', label: 'وضعیت', type: 'select', options: STATUS.project },
      { name: 'progress', label: 'پیشرفت (۰ تا ۱۰۰)', type: 'number' },
      { name: 'startDate', label: 'تاریخ شروع', type: 'date' },
      { name: 'dueDate', label: 'تاریخ تحویل', type: 'date' },
      { name: 'note', label: 'توضیح', type: 'text' }
    ]
  },
  content: {
    collection: 'clientContent', title: 'تقویم محتوایی', icon: '🗓️',
    cols: [
      { name: 'date', label: 'تاریخ انتشار', type: 'date' },
      { name: 'type', label: 'نوع محتوا', type: 'select', options: CONTENT_TYPES },
      { name: 'topic', label: 'موضوع', type: 'text', required: true },
      { name: 'status', label: 'وضعیت', type: 'select', options: STATUS.content },
      { name: 'mediaUrl', label: 'پیش‌نمایش (عکس/ویدئو)', type: 'file' }
    ]
  },
  files: {
    collection: 'clientFiles', title: 'فایل‌ها (ارسال برای مشتری)', icon: '📎',
    cols: [
      { name: 'name', label: 'عنوان فایل', type: 'text' },
      { name: 'url', label: 'فایل', type: 'file', requiredFile: true }
    ]
  },
  invoices: {
    collection: 'clientInvoices', title: 'فاکتورها', icon: '💳',
    cols: [
      { name: 'number', label: 'شماره فاکتور', type: 'text' },
      { name: 'title', label: 'شرح', type: 'text', required: true },
      { name: 'amount', label: 'مبلغ (تومان)', type: 'number' },
      { name: 'status', label: 'وضعیت', type: 'select', options: STATUS.invoice },
      { name: 'date', label: 'تاریخ صدور', type: 'date' }
    ]
  },
  notices: {
    collection: 'clientNotices', title: 'اعلان‌ها و آخرین فعالیت‌ها', icon: '🔔',
    cols: [
      { name: 'title', label: 'عنوان', type: 'text', required: true },
      { name: 'text', label: 'متن', type: 'text' }
    ]
  }
};

function normDigits(str) {
  return String(str || '')
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
}

// ساخت رکورد از فرم، با اعتبارسنجی؛ خروجی { record } یا { error }
function buildRecord(key, body, existing) {
  const conf = sections[key];
  const rec = existing ? { ...existing } : {};
  for (const c of conf.cols) {
    if (c.type === 'file') continue;
    let v = String(body[c.name] !== undefined ? body[c.name] : (rec[c.name] || '')).trim();
    if (c.type === 'select') {
      if (!c.options.includes(v)) v = existing ? (rec[c.name] || c.options[0]) : c.options[0];
    } else if (c.type === 'number') {
      v = parseInt(normDigits(v).replace(/[^\d]/g, ''), 10);
      if (isNaN(v)) v = 0;
      if (c.name === 'progress') v = Math.max(0, Math.min(100, v));
    } else if (c.type === 'date') {
      if (v && isNaN(new Date(v).getTime())) v = '';
    } else {
      v = v.slice(0, 500);
    }
    if (c.required && !v) return { error: `«${c.label}» الزامی است.` };
    rec[c.name] = v;
  }
  return { record: rec };
}

module.exports = { sections, STATUS, buildRecord };
