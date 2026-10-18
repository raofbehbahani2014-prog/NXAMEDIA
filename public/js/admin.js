document.addEventListener('DOMContentLoaded', () => {
  // آپلود فیلدهای تصویر/ویدئو/فایل داخل فرم‌ها
  document.querySelectorAll('.field-upload').forEach(box => {
    const input = box.querySelector('input[type=file]');
    const hidden = box.querySelector('input[type=hidden]');
    const preview = box.querySelector('.upload-preview');
    const type = box.dataset.type;
    const isPrivate = type === 'private';

    function renderPreview(value, original) {
      if (!value) { preview.innerHTML = ''; return; }
      if (isPrivate) { preview.innerHTML = '<p class="hint">✅ فایل ثبت شده است' + (original ? ': ' + original : '') + '</p>'; return; }
      const ext = value.split('.').pop().toLowerCase();
      if (type === 'video' || ['mp4', 'webm', 'mov'].includes(ext)) preview.innerHTML = '<video src="' + value + '" controls></video>';
      else if (['mp3', 'wav', 'ogg', 'm4a', 'aac'].includes(ext)) preview.innerHTML = '<audio src="' + value + '" controls></audio>';
      else if (type === 'image' || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(ext)) preview.innerHTML = '<img src="' + value + '" alt="">';
      else preview.innerHTML = '<p class="hint"><a href="' + value + '" target="_blank">مشاهده فایل فعلی</a></p>';
    }
    renderPreview(hidden.value);

    input.addEventListener('change', async () => {
      if (!input.files.length) return;
      const fd = new FormData();
      fd.append('file', input.files[0]);
      box.classList.add('dragover');
      preview.innerHTML = '<p class="hint">در حال آپلود... (برای فایل‌های حجیم کمی صبر کنید)</p>';
      try {
        const res = await fetch(isPrivate ? '/admin/upload-private' : '/admin/upload-field', { method: 'POST', body: fd });
        const data = await res.json();
        if (data.ok) {
          hidden.value = isPrivate ? data.name : data.url;
          renderPreview(hidden.value, data.original);
        } else {
          preview.innerHTML = '';
          alert(data.message || 'خطا در آپلود فایل');
        }
      } catch (e) {
        preview.innerHTML = '';
        alert('خطا در آپلود فایل');
      }
      box.classList.remove('dragover');
    });
  });

  // تب‌های صفحه تنظیمات سایت
  const tabs = document.querySelectorAll('.tabs a[data-tab]');
  const panels = document.querySelectorAll('.tab-panel');
  if (tabs.length) {
    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        tabs.forEach(t => t.classList.remove('active'));
        panels.forEach(p => p.style.display = 'none');
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab).style.display = 'block';
      });
    });
  }

  // تایید حذف
  document.querySelectorAll('form.confirm-delete').forEach(f => {
    f.addEventListener('submit', (e) => {
      if (!confirm('آیا از حذف این مورد مطمئن هستید؟')) e.preventDefault();
    });
  });
});
