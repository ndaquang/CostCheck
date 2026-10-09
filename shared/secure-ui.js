'use strict';
/* Lớp bảo vệ giao diện bản web: watermark người dùng, phân quyền hiển thị, chặn sao chép/in (nhân viên), tự khóa sau 60 phút.
   Đây là lớp phụ. Lớp chính là dữ liệu: gói nhân viên đã lược bỏ nguồn báo giá từ lúc phát hành. Chạy TRƯỚC app.js. */
(() => {
  const S = window.SECURE;
  if (!S) return;
  const staff = S.role !== 'admin';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ready = fn => (document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn) : fn());

  document.documentElement.classList.add(staff ? 'role-staff' : 'role-admin');

  // Watermark: tên + tài khoản + thời điểm đăng nhập, lặp mờ trên màn hình (ảnh chụp vẫn truy được người làm lộ)
  const when = new Date(S.at).toLocaleString('vi-VN', { hour12: false });
  const text = esc(`${S.name} · ${S.user} · ${when}`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="230"><text x="20" y="130" transform="rotate(-22 230 115)" font-family="Segoe UI, sans-serif" font-size="15" fill="#7a7a7a">${text}</text></svg>`;
  const wm = document.createElement('div');
  wm.id = 'watermark';
  wm.style.backgroundImage = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;

  const roleLabel = S.role === 'admin' ? 'Admin' : 'Nhân viên';
  ready(() => {
    document.body.appendChild(wm);
    const nav = document.querySelector('.topnav');
    if (nav) {
      const box = document.createElement('div');
      box.className = 'userbox';
      box.innerHTML = `<span class="who" title="${roleLabel}">${esc(S.name)} <i>${roleLabel}</i></span><button class="btn" id="logout">Đăng xuất</button>`;
      nav.after(box);
      box.querySelector('#logout').onclick = () => S.logout();
    }
  });

  const okTarget = t => t && t.closest && t.closest('input, textarea, select');
  if (staff) {
    for (const ev of ['copy', 'cut', 'selectstart', 'dragstart']) {
      document.addEventListener(ev, e => { if (!okTarget(e.target)) e.preventDefault(); }, true);
    }
    window.addEventListener('beforeprint', () => document.documentElement.classList.add('no-print'));
  }
  document.addEventListener('contextmenu', e => e.preventDefault(), true);
  document.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && (k === 'p' || k === 's' || (staff && k === 'a' && !okTarget(e.target)))) e.preventDefault();
  }, true);

  // Tự đăng xuất sau 60 phút không thao tác
  let idle;
  const reset = () => { clearTimeout(idle); idle = setTimeout(() => S.logout(), 60 * 60 * 1000); };
  ['mousemove', 'keydown', 'wheel', 'click'].forEach(ev => document.addEventListener(ev, reset, { passive: true }));
  reset();
})();
