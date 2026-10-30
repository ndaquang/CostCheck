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
  // Đồng bộ qua Supabase (tùy chọn): build.py ghi URL và khóa publishable (công khai theo thiết kế) vào thẻ script
  const SB = me && me.dataset.sbUrl && me.dataset.sbKey ? { url: me.dataset.sbUrl.replace(/\/$/, ''), key: me.dataset.sbKey } : null;
  const $ = s => document.querySelector(s);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  let PKG = null;    // gói đã đọc: tài khoản + khối dữ liệu đã mã hóa
  let KEYS = null;   // khóa mở được sau đăng nhập, chỉ tồn tại trong bộ nhớ
  let fails = 0;
  let SYNC = null;   // { cfg, manifest, vai_tro, trang_thai }: trạng thái đồng bộ của phiên này
  let DELTA = [];    // delta đã giải mã: { id, khoi, op }

  const splash = $('#splash');
  if (splash) splash.style.display = 'none';   // ẩn màn hình nạp dữ liệu cho tới khi đăng nhập xong

  const gate = document.createElement('div');
  gate.id = 'gate';
  gate.innerHTML = `
    <form class="gate-box" id="gate-form">
      <div class="gate-logo">ĐG</div>
      <h1>Đơn giá BOQ</h1>
      <p class="gate-sub">${BUILD === 'admin' ? 'Bản quản trị' : 'Bản nhân viên'} · Cơ sở dữ liệu nội bộ</p>
      <label>Gói dữ liệu (.dgbw) do admin cấp<input type="file" id="gate-file" accept=".dgbw,application/json"${SB ? '' : ' required'}></label>
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
      if (!file && !SB) { thongBao = 'Chưa chọn gói dữ liệu.'; throw new Error(thongBao); }
      let bytes = file ? new Uint8Array(await file.arrayBuffer()) : null;
      const sync = SB ? await thuDongBo(ten, matKhau, !bytes) : null;
      if (!bytes) {
        if (!sync || !sync.goi) { thongBao = 'Chưa chọn gói dữ liệu và không tải được gói từ máy chủ.'; throw new Error(thongBao); }
        bytes = sync.goi;
      }
      const pkg = JSON.parse(new TextDecoder().decode(bytes));
      if (pkg.dinh_dang !== 'DGW1' || !Array.isArray(pkg.users) || !pkg.khoi) { thongBao = 'Tệp này không phải gói dữ liệu của phần mềm.'; throw new Error(thongBao); }

      const u = pkg.users.find(x => x.ten_dang_nhap.toLowerCase() === ten.toLowerCase());
      if (!u || !u.hoat_dong || !u.khoa || !u.khoa.nv) throw new Error('auth');
      const kek = await DGW.khoaTuMatKhau(matKhau, DGW.b64(u.salt), u.kdf.iter);
      const keys = { nv: await DGW.moKhoaBoc(u.khoa.nv, kek, `${u.ten_dang_nhap}|nv`) };
      if (BUILD === 'admin' && u.khoa.admin) keys.admin = await DGW.moKhoaBoc(u.khoa.admin, kek, `${u.ten_dang_nhap}|admin`);

      PKG = pkg; KEYS = keys;
      $('#gate-pass').value = '';
      const role = keys.admin ? 'admin' : 'nhan_vien';
      if (sync) await napDelta(sync, bytes, role, keys);
      moGiaoDien(u, role);
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
      dongBo: () => SYNC && { trang_thai: SYNC.trang_thai, phien_ban: SYNC.manifest && SYNC.manifest.phien_ban, so_delta: DELTA.length },
      ghiDelta: (kind, ops) => ghiDelta(role, kind, ops),
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
    if (!khoi) throw Object.assign(new Error(`Gói dữ liệu không có khối "${kind}".`), { code: 'THIEU_KHOI' });
    const key = KEYS[khoi.khoa];
    if (!key) throw new Error('Không có quyền truy cập dữ liệu này.');
    const text = await DGW.giaiKhoi(khoi.du_lieu, key, kind);
    const ds = DELTA.filter(d => d.khoi === kind);
    if (!ds.length) return text;
    const db = JSON.parse(text);
    if (!db || !db.cols) return text;
    for (const d of ds) DONGBO.apDung(db, d.op);
    return JSON.stringify(db);
  }

  // Đăng nhập Supabase, đọc manifest phiên bản, và tải gói gốc nếu người dùng không tự chọn file.
  // Không bao giờ ném lỗi: lỗi mạng hoặc thiếu tài khoản chỉ làm app chạy bằng gói gốc.
  async function thuDongBo(ten, matKhau, canTai) {
    const cfg = { ...SB };
    try {
      const dn = await DONGBO.dangNhap(cfg, ten, matKhau);
      cfg.token = dn.token;
      const manifest = await DONGBO.docManifest(cfg);
      const goi = canTai ? await DONGBO.taiGoi(cfg, (dn.vai_tro === 'admin' ? 'admin' : 'nhan_vien') + '/moi_nhat.dgbw') : null;
      return (SYNC = { cfg, manifest, vai_tro: dn.vai_tro, goi, trang_thai: 'ket_noi' });
    } catch (ex) {
      return (SYNC = { cfg, manifest: null, goi: null, trang_thai: 'ngoai_tuyen' });
    }
  }

  // Tải và giải mã delta; chỉ áp khi gói đang mở đúng là gói gốc ghi trong manifest (so SHA-256)
  async function napDelta(sync, bytes, role, keys) {
    DELTA = [];
    if (sync.trang_thai !== 'ket_noi' || !sync.manifest) return;
    try {
      const m = sync.manifest;
      if ((m.sha256 || {})[role] !== await DGW.sha256Hex(bytes)) { sync.trang_thai = 'goi_cu'; return; }
      const rows = await DONGBO.layDelta(sync.cfg, role, m.phien_ban);
      for (const kind of Object.keys(PKG.khoi)) {
        const key = keys[PKG.khoi[kind].khoa];
        if (!key) continue;
        const { ops, hong } = await DONGBO.giaiDelta(rows, kind, key, m.phien_ban);
        DELTA.push(...ops.map(o => ({ id: o.id, khoi: kind, op: o.op })));
        if (hong) sync.trang_thai = 'delta_hong';
      }
    } catch (ex) { sync.trang_thai = 'ngoai_tuyen'; }
  }

  // Chỉ admin: ghi delta cho từng đối tượng, mỗi bản mã hóa bằng khóa của đối tượng đó.
  // ops = { admin: op, nhan_vien: op } — op cho nhân viên phải do nơi gọi làm sạch trước (không tên dự án, nhà thầu, nguồn).
  async function ghiDelta(role, kind, ops) {
    if (role !== 'admin') throw new Error('Chỉ admin được ghi delta.');
    if (!SYNC || SYNC.trang_thai !== 'ket_noi' || !SYNC.manifest) throw new Error('Chưa đồng bộ được với máy chủ, hoặc gói đang mở không phải bản mới nhất.');
    const pb = SYNC.manifest.phien_ban, rows = [];
    for (const dt of ['admin', 'nhan_vien']) {
      const op = ops && ops[dt];
      if (!op) continue;
      const khoi = PKG.khoi[kind];
      const key = dt === 'admin' ? (khoi && KEYS[khoi.khoa]) : KEYS.nv;
      if (!key) throw new Error('Không có khóa để ghi delta cho ' + dt + '.');
      rows.push({ doi_tuong: dt, khoi: kind, goi: pb, du_lieu: await DONGBO.maHoaDelta(op, kind, key, pb) });
    }
    if (!rows.length) return;
    await DONGBO.ghiDelta(SYNC.cfg, rows);
    if (ops.admin) DELTA.push({ id: 'cuc_bo_' + DELTA.length, khoi: kind, op: ops.admin });
  }
})();
