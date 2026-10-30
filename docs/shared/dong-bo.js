'use strict';
/* Đồng bộ qua Supabase (phương án gói gốc + delta).
   • Gói .dgbw gốc nằm trong bucket private "goi" (admin/moi_nhat.dgbw, nhan_vien/moi_nhat.dgbw) cùng goi/phien_ban.json.
   • Mỗi thao tác ghi một dòng vào bảng "delta": nội dung ĐÃ MÃ HÓA ở trình duyệt bằng chính khóa dữ liệu của gói.
     Supabase chỉ thấy bản mã.
   • Khi mở app: tải gói gốc, tải delta của đúng phiên bản gói, giải mã rồi áp lên khối dữ liệu.
   Dùng fetch thuần (không SDK) vì CSP chỉ cho script từ chính site. Thiếu mạng hoặc thiếu tài khoản Supabase thì
   app vẫn chạy bằng gói gốc, không chặn đăng nhập. */
(() => {
  const SYNC_ITER = 600000;
  const TRE = 15000;

  async function goi(cfg, duongDan, opt = {}) {
    const ac = new AbortController();
    const h = setTimeout(() => ac.abort(), TRE);
    try {
      const r = await fetch(cfg.url + duongDan, {
        ...opt, signal: ac.signal,
        headers: { apikey: cfg.key, ...(cfg.token ? { Authorization: 'Bearer ' + cfg.token } : {}), ...(opt.headers || {}) },
      });
      if (!r.ok) throw Object.assign(new Error('Supabase ' + r.status), { status: r.status });
      return r;
    } finally { clearTimeout(h); }
  }

  const emailTu = ten => ten.toLowerCase() + '@dgbw.local';

  // Đăng nhập Supabase bằng mật khẩu riêng suy ra từ mật khẩu app. Trả về { token, vai_tro }.
  async function dangNhap(cfg, ten, matKhau) {
    const mk = await DGW.matKhauDongBo(matKhau, ten, SYNC_ITER);
    const r = await goi(cfg, '/auth/v1/token?grant_type=password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailTu(ten), password: mk }),
    });
    const j = await r.json();
    return { token: j.access_token, vai_tro: (j.user && j.user.app_metadata && j.user.app_metadata.vai_tro) || '' };
  }

  async function docManifest(cfg) {
    return (await goi(cfg, '/storage/v1/object/authenticated/goi/phien_ban.json')).json();
  }

  async function taiGoi(cfg, duongDan) {
    return new Uint8Array(await (await goi(cfg, '/storage/v1/object/authenticated/goi/' + duongDan)).arrayBuffer());
  }

  // Các delta của một phiên bản gói, theo thứ tự id, phân trang 1000 dòng
  async function layDelta(cfg, doiTuong, phienBan) {
    const out = [];
    let sau = 0;
    for (;;) {
      const q = `/rest/v1/delta?select=id,khoi,du_lieu&doi_tuong=eq.${doiTuong}&goi=eq.${encodeURIComponent(phienBan)}&id=gt.${sau}&order=id.asc&limit=1000`;
      const rows = await (await goi(cfg, q)).json();
      out.push(...rows);
      if (rows.length < 1000) return out;
      sau = rows[rows.length - 1].id;
    }
  }

  async function ghiDelta(cfg, rows) {
    await goi(cfg, '/rest/v1/delta', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(rows),
    });
  }

  const aadDelta = (khoi, phienBan) => `delta|${khoi}|${phienBan}`;

  // Giải mã danh sách delta bằng khóa của khối; delta hỏng (sai khóa, bị sửa) bị bỏ qua và đếm lại
  async function giaiDelta(rows, khoi, key, phienBan) {
    const ops = []; let hong = 0;
    for (const r of rows) {
      if (r.khoi !== khoi) continue;
      try { ops.push({ id: r.id, op: JSON.parse(await DGW.giaiKhoi(r.du_lieu, key, aadDelta(khoi, phienBan))) }); }
      catch { hong++; }
    }
    return { ops, hong };
  }

  async function maHoaDelta(op, khoi, key, phienBan) {
    return DGW.maHoaKhoi(JSON.stringify(op), key, aadDelta(khoi, phienBan));
  }

  /* ---- Áp delta lên khối dữ liệu dạng cột { count, cols, dicts, projects } ----
     op = { t: 'them', hang: [ { name, u, p: ['mã', 'tên', 'loại', 'tỉnh', ...], y, cp, tot, c, f, ... } ] }
     Chuỗi ở cột từ điển (u, cu, ng, c, f, st, ol, warn) được đổi sang chỉ số; p là bộ dự án, khớp theo mã (phần tử đầu).
     Cột không được cung cấp lấy giá trị mặc định; dòng mới có g = -1 (chưa nhóm) cho tới khi admin gộp delta vào gói mới. */
  const TU_DIEN = new Set(['u', 'cu', 'ng', 'c', 'f', 'st', 'ol', 'warn']);
  const MAC_DINH = { g: -1, gn: -1, ol: -1, warn: -1, c: -1, f: -1, st: 0, spec: '', dup: 1 };

  // Cột chưa biết: suy từ dữ liệu có sẵn. Cột đã có null → null; cột chỉ có chuỗi → ''; còn lại là cột chỉ số/cờ → -1.
  // Không dùng null cho cột chỉ số vì `null >= 0` là true trong JS và làm app tra nhầm dòng 0.
  function macDinhCot(a) {
    let chuoi = false, so = false;
    for (let i = 0; i < a.length; i++) {
      const v = a[i];
      if (v === null || v === undefined) return null;
      if (typeof v === 'string') chuoi = true; else so = true;
    }
    return chuoi && !so ? '' : -1;
  }

  function chiSo(db, k, v) {
    if (v === null || v === undefined || v === '') return -1;
    const D = db.dicts || (db.dicts = {});
    const a = D[k] || (D[k] = []);
    let i = a.indexOf(v);
    if (i < 0) { a.push(v); i = a.length - 1; }
    return i;
  }

  function chiSoDuAn(db, p) {
    if (!Array.isArray(p) || !p.length) return -1;
    const pr = db.projects || (db.projects = []);
    let i = pr.findIndex(x => x[0] === p[0]);
    if (i < 0) { pr.push(p.slice()); i = pr.length - 1; if (db.dicts && Array.isArray(db.dicts.p)) db.dicts.p.push(p[0]); }
    return i;
  }

  function apDung(db, op) {
    if (!op || op.t !== 'them' || !Array.isArray(op.hang)) return 0;
    const C = db.cols, mac = {};
    let them = 0;
    for (const h of op.hang) {
      if (!h || typeof h.name !== 'string') continue;
      for (const k of Object.keys(C)) {
        if (!Array.isArray(C[k])) continue;
        let v;
        if (k === 'p') v = chiSoDuAn(db, h.p);
        else if (TU_DIEN.has(k) && (typeof h[k] === 'string' || (k === 'cu' && typeof h.u === 'string'))) v = chiSo(db, k, k === 'cu' && h.cu === undefined ? h.u : h[k]);
        else if (h[k] !== undefined) v = h[k];
        else if (k === 'p26' && h.cp !== undefined) v = h.cp;
        else if (k === 'id') v = 'dlt' + (db.count + them);
        else if (k in MAC_DINH) v = MAC_DINH[k];
        else v = k in mac ? mac[k] : (mac[k] = macDinhCot(C[k]));
        C[k].push(v);
      }
      them++;
    }
    db.count = (db.count || 0) + them;
    return them;
  }

  window.DONGBO = { dangNhap, docManifest, taiGoi, layDelta, ghiDelta, giaiDelta, maHoaDelta, apDung, aadDelta, SYNC_ITER };
})();
