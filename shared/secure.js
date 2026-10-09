'use strict';
/* Cổng đăng nhập và window.SECURE cho bản web (cùng hợp đồng với bản Windows: user, name, role, at, load(kind), logout()).
   • Chọn gói dữ liệu .dgbw do admin cấp, nhập tên đăng nhập và mật khẩu.
   • Mật khẩu → PBKDF2 → mở khóa tài khoản. Sai mật khẩu thì không giải mã được gì.
   • Gói nhân viên KHÔNG chứa khối admin, nên nhân viên không có khóa để mở chúng.
   • Đăng xuất = tải lại trang, xóa sạch dữ liệu đã giải mã khỏi bộ nhớ.
   Tham số do build.py ghi vào thẻ script: data-build ('admin' | 'nhan_vien'), data-scripts (file ứng dụng, đúng thứ tự). */
(() => {
  const me = document.currentScript;
  const BUILD = (me && me.dataset.build) || 'nhan_vien';   // mặc định an toàn: chỉ quyền nhân viên
  const SCRIPTS = ((me && me.dataset.scripts) || '').split(',').filter(Boolean);
  const $ = s => document.querySelector(s);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  let PKG = null;    // gói đã đọc: tài khoản + khối dữ liệu đã mã hóa
  let KEYS = null;   // khóa mở được sau đăng nhập, chỉ tồn tại trong bộ nhớ
  let fails = 0;

  const splash = $('#splash');
  if (splash) splash.style.display = 'none';   // ẩn màn hình nạp dữ liệu cho tới khi đăng nhập xong

  const gate = document.createElement('div');
  gate.id = 'gate';
  gate.innerHTML = `
    <form class="gate-box" id="gate-form">
      <div class="gate-logo">ĐG</div>
      <h1>Đơn giá BOQ</h1>
      <p class="gate-sub">${BUILD === 'admin' ? 'Bản quản trị' : 'Bản nhân viên'} · Cơ sở dữ liệu nội bộ</p>
      <label>Gói dữ liệu (.dgbw) do admin cấp<input type="file" id="gate-file" accept=".dgbw,application/json" required></label>
      <label>Tên đăng nhập<input id="gate-user" autocomplete="off" autocapitalize="off" spellcheck="false" required></label>
      <label>Mật khẩu<input id="gate-pass" type="password" autocomplete="off" required></label>
      <div class="gate-err" id="gate-err" role="alert" hidden></div>
      <button id="gate-go" type="submit">Đăng nhập</button>
    </form>`;
  document.body.appendChild(gate);
  $('#gate-form').addEventListener('submit', dangNhap);

  async function dangNhap(e) {
    e.preventDefault();
    const btn = $('#gate-go'), err = $('#gate-err');
    const file = $('#gate-file').files[0];
    const ten = $('#gate-user').value.trim();
    const matKhau = $('#gate-pass').value;
    btn.disabled = true; btn.textContent = 'Đang kiểm tra…'; err.hidden = true;
    let thongBao = 'Sai tên đăng nhập hoặc mật khẩu, hoặc tài khoản đã bị khóa.';
    try {
      if (!file) { thongBao = 'Chưa chọn gói dữ liệu.'; throw new Error(thongBao); }
      const pkg = JSON.parse(await file.text());
      if (pkg.dinh_dang !== 'DGW1' || !Array.isArray(pkg.users) || !pkg.khoi) { thongBao = 'Tệp này không phải gói dữ liệu của phần mềm.'; throw new Error(thongBao); }

      const u = pkg.users.find(x => x.ten_dang_nhap.toLowerCase() === ten.toLowerCase());
      if (!u || !u.hoat_dong || !u.khoa || !u.khoa.nv) throw new Error('auth');
      const kek = await DGW.khoaTuMatKhau(matKhau, DGW.b64(u.salt), u.kdf.iter);
      const keys = { nv: await DGW.moKhoaBoc(u.khoa.nv, kek, `${u.ten_dang_nhap}|nv`) };
      if (BUILD === 'admin' && u.khoa.admin) keys.admin = await DGW.moKhoaBoc(u.khoa.admin, kek, `${u.ten_dang_nhap}|admin`);

      PKG = pkg; KEYS = keys;
      $('#gate-pass').value = '';
      moGiaoDien(u, keys.admin ? 'admin' : 'nhan_vien');
    } catch (ex) {
      fails++;
      await sleep(Math.min(4000, 400 * 2 ** fails));   // chậm dần khi nhập sai liên tiếp (rào cản phụ, phía trình duyệt)
      $('#gate-pass').value = '';
      err.textContent = thongBao;
      err.hidden = false;
      btn.disabled = false; btn.textContent = 'Đăng nhập';
      $('#gate-pass').focus();
    }
  }

  function moGiaoDien(u, role) {
    window.SECURE = {
      user: u.ten_dang_nhap,
      name: u.ho_ten || u.ten_dang_nhap,
      role,
      at: new Date().toISOString(),
      load: kind => layDuLieu(kind),
      logout: () => { KEYS = null; PKG = null; location.reload(); },
    };
    gate.remove();
    if (splash) splash.style.display = '';
    // Nạp giao diện theo đúng thứ tự; async = false giữ nguyên thứ tự thực thi
    for (const src of SCRIPTS) {
      const s = document.createElement('script');
      s.src = src;
      s.async = false;
      document.body.appendChild(s);
    }
  }

  // Trả về chuỗi JSON của khối dữ liệu nếu khóa đang đăng nhập mở được; ngược lại từ chối
  async function layDuLieu(kind) {
    if (!KEYS || !PKG) throw new Error('Chưa đăng nhập.');
    const khoi = PKG.khoi[kind];
    const key = khoi && KEYS[khoi.khoa];
    if (!key) throw new Error('Không có quyền truy cập dữ liệu này.');
    return DGW.giaiKhoi(khoi.du_lieu, key, kind);
  }
})();
