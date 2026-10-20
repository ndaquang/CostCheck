'use strict';
/* LÀM SẠCH CSDL ĐƠN GIÁ — soát lỗi dữ liệu làm giảm tỉ lệ khớp và làm sai giá tham khảo.
   Dùng: node modules/de_xuat_gia/hoc/lam_sach.js [--db data/db.js] [--out <thư mục>] [--sua <db_sach.js>] [--gan-nhom] [--nhanh]
     --db        CSDL thật (window.DB = {...}); bỏ trống = CSDL giả lập của bộ chạy thử
     --sua       ghi CSDL đã sửa các lỗi an toàn: bỏ giá không hợp lệ, bỏ dòng trùng hệt, đánh dấu ngoại lai chưa đánh dấu
     --gan-nhom  (kèm --sua) gán nhóm cho dòng chưa có nhóm khi gợi ý rất chắc (khớp ≥ 0.85, cùng đơn vị)
     --nhanh     bỏ bước dò dòng có thể sai nhóm (chậm với CSDL rất lớn)
   Kết quả: BAO_CAO_LAM_SACH.xlsx (Tóm tắt + mỗi loại lỗi một sheet) và lam_sach.json. CSDL gốc không bị sửa. */
const { DXG, fs, path, arg, flag, loadDB, writeXlsx } = require('./chung.js');

const { db: DB, demo } = loadDB(arg('--db') && path.resolve(arg('--db')));
const OUT = path.resolve(arg('--out') || path.join(__dirname, 'ket_qua_lam_sach'));
fs.mkdirSync(OUT, { recursive: true });
const t0 = Date.now();
const IX = DXG.buildIndex(DB);
const { C, D, N, has } = IX;
const prj = i => { const p = (DB.projects || [])[has('p') ? C.p[i] : -1]; return p ? p[0] : ''; };
const file = i => (has('f') && C.f[i] >= 0 && D.f ? D.f[C.f[i]] : '') || '';
const gOf = new Int32Array(N).fill(-1);
for (const g of IX.groups) for (const i of g.rows) gOf[i] = g.id;
const row = i => [i, prj(i), file(i), C.name[i], IX.unitOf(i), IX.price(i), gOf[i] >= 0 ? IX.groups[gOf[i]].name : '(chưa có nhóm)'];
const HEAD = ['Dòng CSDL', 'Dự án', 'File nguồn', 'Mô tả', 'Đơn vị', 'Giá quy đổi', 'Nhóm hiện tại'];
const W = [9, 9, 22, 55, 8, 14, 40];
const issues = {};   // loại -> { title, why, fix, head, rows, safe }
const add = (k, meta, r) => { (issues[k] = issues[k] || { ...meta, rows: [] }).rows.push(r); };

const M = {
  gia: { title: 'Giá không hợp lệ', why: 'Giá trống, ≤ 0 hoặc không phải số — không dùng được, làm nhiễu thống kê.', fix: 'Bỏ khỏi CSDL (--sua tự bỏ).', safe: true },
  trung: { title: 'Dòng trùng hệt', why: 'Cùng mô tả, đơn vị, giá, dự án, năm — một báo giá được nhập nhiều lần, làm lệch P25/P50 về phía giá đó.', fix: 'Giữ 1 dòng (--sua tự bỏ bản trùng).', safe: true },
  ngoailai: { title: 'Ngoại lai chưa đánh dấu', why: 'Giá lệch xa nhóm (|z| log-giá theo MAD > 3,5 và lệch ≥ 1,6 lần, hoặc lệch > 3 lần trung vị) nhưng chưa có cờ ngoại lai.', fix: 'Kiểm tra nhập sai đơn vị / số 0; --sua tự đánh dấu ngoại lai (không xóa).', safe: true },
  donvi_la: { title: 'Đơn vị lạ', why: 'Cách ghi đơn vị phần mềm không nhận ra → không quy đổi được, dòng BOQ cùng đơn vị bị "khác đơn vị".', fix: 'Chuẩn hóa về m2, m3, m, kg, tấn, cái, bộ, lô/gói… trong dữ liệu nguồn.' },
  donvi_lech: { title: 'Lệch đơn vị trong nhóm', why: 'Dòng có đơn vị không quy đổi được về đơn vị của nhóm (vd m2 trong nhóm m3) → giá nhóm bị trộn.', fix: 'Sửa đơn vị hoặc chuyển dòng sang nhóm đúng.' },
  phan_tan: { title: 'Nhóm phân tán lớn', why: 'Khoảng P25–P75 > 80% trung vị: nhóm có thể đang gộp nhiều quy cách / phạm vi công việc khác nhau.', fix: 'Tách nhóm theo quy cách (mác, chiều dày, vật liệu) hoặc phạm vi (cung cấp / lắp đặt).' },
  nhom_trung: { title: 'Nhóm trùng nhau', why: 'Hai nhóm cùng tên chuẩn hóa và cùng đơn vị → mẫu giá bị chia đôi, khớp phải chọn ngẫu nhiên.', fix: 'Gộp về một nhóm đại diện.' },
  ten_xau: { title: 'Mô tả không rõ', why: 'Mô tả quá ngắn, chỉ có số, hoặc là dòng tổng/cộng bị nhập nhầm thành đơn giá.', fix: 'Sửa mô tả hoặc bỏ dòng.' },
  chua_nhom: { title: 'Gợi ý gán nhóm', why: 'Dòng chưa có nhóm đại diện nhưng khớp rõ với một nhóm có sẵn.', fix: 'Gán nhóm gợi ý (--sua --gan-nhom tự gán khi khớp ≥ 0.85).' },
  sai_nhom: { title: 'Có thể sai nhóm', why: 'Mô tả của dòng khớp với nhóm khác tốt hơn hẳn nhóm hiện tại.', fix: 'Xem lại và chuyển nhóm nếu đúng.' },
};

// 1. Giá không hợp lệ (buildIndex đã bỏ qua các dòng này)
const p0 = i => (has('p26') && C.p26[i] != null) ? C.p26[i] : (has('cp') && C.cp[i] != null) ? C.cp[i] : C.tot[i];
for (let i = 0; i < N; i++) { const p = p0(i); if (!(typeof p === 'number' && isFinite(p) && p > 0)) add('gia', M.gia, [i, prj(i), file(i), C.name[i], IX.unitOf(i), p ?? '', '']); }
// 2. Trùng hệt
const seen = new Map(), dup = new Set();
for (let i = 0; i < N; i++) {
  if (gOf[i] < 0 && !(p0(i) > 0)) continue;
  const k = [DXG.norm(C.name[i]), DXG.norm(IX.unitOf(i)), p0(i), has('p') ? C.p[i] : '', C.y ? C.y[i] : ''].join('|');
  if (seen.has(k)) { dup.add(i); add('trung', M.trung, [...row(i), seen.get(k)]); } else seen.set(k, i);
}
// 3–6. Theo nhóm: ngoại lai, lệch đơn vị, phân tán
const olNew = new Set();
for (const g of IX.groups) {
  const ids = g.rows.filter(i => !dup.has(i));
  for (const i of ids) {
    const u = IX.unitOf(i);
    if (u && DXG.unitRatio(u, g.unit) === null) add('donvi_lech', M.donvi_lech, [...row(i), g.unit]);
  }
  const ok = ids.filter(i => !(has('ol') && C.ol[i] >= 0) && !(has('st') && C.st[i] >= 0 && D.st[C.st[i]] === 'REVIEW'));
  if (ok.length < 5) continue;
  const lg = ok.map(i => Math.log(IX.price(i))).sort((a, b) => a - b);
  const med = DXG.qtile(lg, 0.5), mad = DXG.qtile(lg.map(x => Math.abs(x - med)).sort((a, b) => a - b), 0.5) * 1.4826;
  for (const i of ok) {
    const x = Math.log(IX.price(i)), z = mad > 0 ? Math.abs(x - med) / mad : 0;
    // lệch thống kê VÀ lệch đáng kể (≥ 1,6 lần), hoặc lệch quá 3 lần
    if ((z > 3.5 && Math.abs(x - med) > Math.log(1.6)) || Math.abs(x - med) > Math.log(3)) { olNew.add(i); add('ngoailai', M.ngoailai, [...row(i), Math.round(Math.exp(med)), +(Math.exp(x - med)).toFixed(2)]); }
  }
  const v = ok.map(i => IX.price(i)).sort((a, b) => a - b), m = DXG.qtile(v, 0.5);
  const disp = (DXG.qtile(v, 0.75) - DXG.qtile(v, 0.25)) / m;
  if (disp > 0.8) add('phan_tan', M.phan_tan, [g.name, g.unit, v.length, g.proj, Math.round(DXG.qtile(v, 0.25)), Math.round(m), Math.round(DXG.qtile(v, 0.75)), disp]);
}
// Đơn vị lạ (gộp theo cách ghi)
const uCount = new Map();
for (let i = 0; i < N; i++) { const u = IX.unitOf(i); if (!u) continue; const b = DXG.parseUnit(u).base; if (!DXG.UNIT_BASES.has(b)) uCount.set(u, (uCount.get(u) || 0) + 1); }
for (const [u, n] of [...uCount].sort((a, b) => b[1] - a[1])) add('donvi_la', M.donvi_la, [u, DXG.parseUnit(u).base, n]);
// Nhóm trùng
const gk = new Map();
for (const g of IX.groups) { const k = [...g.repSet].sort().join(' ') + '|' + DXG.parseUnit(g.unit).base; (gk.get(k) || gk.set(k, []).get(k)).push(g); }
for (const gs of gk.values()) if (gs.length > 1) for (const g of gs.slice(1)) add('nhom_trung', M.nhom_trung, [gs[0].name, gs[0].rows.length, g.name, g.rows.length, g.unit]);
// Mô tả không rõ
const SUM = /^(tong|cong|total|sub ?total|grand total|thue|vat)\b/;
for (let i = 0; i < N; i++) {
  const n = DXG.norm(C.name[i]), tk = DXG.tokens(C.name[i]);
  if (!n || tk.length < 2 && n.length < 6 || /^[\d ]+$/.test(n) || SUM.test(n)) add('ten_xau', M.ten_xau, row(i));
}
// Dòng chưa có nhóm / có thể sai nhóm: khớp mô tả của dòng với các nhóm (theo mô tả duy nhất để nhanh)
const assign = new Map();
if (!flag('--nhanh')) {
  const byName = new Map();
  for (let i = 0; i < N; i++) if (gOf[i] >= 0) { const k = DXG.norm(C.name[i]) + '|' + DXG.norm(IX.unitOf(i)); (byName.get(k) || byName.set(k, []).get(k)).push(i); }
  for (const ids of byName.values()) {
    const i = ids[0], own = gOf[i], g = IX.groups[own];
    const m = DXG.match(IX, { desc: C.name[i], unit: IX.unitOf(i) }, { learn: false });
    if (!m.length) continue;
    if (g.dg < 0) {   // nhóm tự gộp theo tên = dòng chưa có nhóm đại diện
      const best = m.find(c => IX.groups[c.g].dg >= 0);
      if (best && best.score >= 0.6 && best.unitOk !== false) {
        for (const r of ids) { add('chua_nhom', M.chua_nhom, [...row(r), IX.groups[best.g].name, +best.score.toFixed(2)]); if (best.score >= 0.85) assign.set(r, best.g); }
      }
      continue;
    }
    const o = m.find(c => c.g === own), top = m[0];
    const os = o ? o.score : 0;
    if (top.g !== own && top.score >= 0.7 && top.score - os >= 0.25 && top.unitOk !== false)
      for (const r of ids) add('sai_nhom', M.sai_nhom, [...row(r), IX.groups[top.g].name, +top.score.toFixed(2), +os.toFixed(2)]);
  }
}

/* ---------- Báo cáo ---------- */
const EXTRA = {
  trung: [['Trùng với dòng'], [10]], ngoailai: [['Trung vị nhóm', 'Gấp mấy lần trung vị'], [14, 12]], donvi_lech: [['Đơn vị nhóm'], [10]],
  chua_nhom: [['Nhóm gợi ý', 'Độ khớp'], [40, 9]], sai_nhom: [['Nhóm khớp tốt hơn', 'Độ khớp', 'Độ khớp nhóm hiện tại'], [40, 9, 10]],
};
const SPECIAL = {
  donvi_la: [['Cách ghi đơn vị', 'Phần mềm hiểu là', 'Số dòng'], [20, 20, 10]],
  phan_tan: [['Nhóm', 'Đơn vị', 'Số báo giá', 'Số dự án', 'P25', 'P50', 'P75', '(P75−P25)/P50'], [50, 8, 10, 9, 14, 14, 14, 13], [4, 5, 6], [7]],
  nhom_trung: [['Nhóm giữ', 'Số dòng', 'Nhóm trùng', 'Số dòng', 'Đơn vị'], [50, 9, 50, 9, 8]],
  gia: [HEAD.slice(0, 6).concat(['']), W],
};
const order = Object.keys(M).filter(k => issues[k]);
const total = order.reduce((n, k) => n + issues[k].rows.length, 0);
const sum = {
  name: 'Tóm tắt', title: 'LÀM SẠCH CSDL ĐƠN GIÁ',
  note: `CSDL: ${demo ? 'GIẢ LẬP (bộ chạy thử)' : arg('--db')} · ${N.toLocaleString('vi-VN')} dòng · ${IX.groups.length.toLocaleString('vi-VN')} nhóm · dựng ${DB.built || '?'}\nDữ liệu sạch giúp: khớp đúng nhóm hơn (đơn vị, tên nhóm thống nhất) và giá tham khảo P25/P50 đáng tin hơn (không lẫn giá nhập sai).`,
  header: ['Loại lỗi', 'Số mục', 'Vì sao cần sửa', 'Cách sửa', 'Sửa tự động (--sua)'], widths: [26, 10, 70, 60, 14],
  rows: Object.keys(M).map(k => [M[k].title, issues[k] ? issues[k].rows.length : 0, M[k].why, M[k].fix, M[k].safe ? 'có' : k === 'chua_nhom' ? 'với --gan-nhom' : 'không']),
};
const sheets = [sum, ...order.map(k => {
  const sp = SPECIAL[k], ex = EXTRA[k] || [[], []];
  return { name: M[k].title, title: M[k].title, note: M[k].why + '\n→ ' + M[k].fix,
    header: sp ? sp[0] : HEAD.concat(ex[0]), widths: sp ? sp[1] : W.concat(ex[1]), money: sp ? sp[2] || [] : [5, ...(k === 'ngoailai' ? [7] : [])], pct: sp ? sp[3] || [] : [],
    rows: issues[k].rows.slice(0, 20000) };
})];
writeXlsx({ sheets }, path.join(OUT, 'BAO_CAO_LAM_SACH.xlsx'));
fs.writeFileSync(path.join(OUT, 'lam_sach.json'), JSON.stringify(Object.fromEntries(order.map(k => [k, { title: M[k].title, n: issues[k].rows.length }])), null, 1));

/* ---------- Ghi CSDL đã sửa (không đụng CSDL gốc) ---------- */
if (arg('--sua')) {
  const drop = new Set([...dup, ...(issues.gia ? issues.gia.rows.map(r => r[0]) : [])]);
  const out = JSON.parse(JSON.stringify(DB));
  const OC = out.cols, OD = out.dicts;
  if (olNew.size) {
    OD.ol = OD.ol || []; let k = OD.ol.indexOf('Ngoại lai (làm sạch tự động)'); if (k < 0) { OD.ol.push('Ngoại lai (làm sạch tự động)'); k = OD.ol.length - 1; }
    if (!OC.ol) OC.ol = new Array(N).fill(-1);
    for (const i of olNew) OC.ol[i] = k;
  }
  let gan = 0;
  if (flag('--gan-nhom') && OC.g) for (const [i, gid] of assign) {
    const g = IX.groups[gid], r0 = g.rows[0];
    OC.g[i] = C.g[r0]; if (OC.gn && has('gn')) OC.gn[i] = C.gn[r0]; gan++;
  }
  const keep = [];
  for (let i = 0; i < N; i++) if (!drop.has(i)) keep.push(i);
  for (const [k, a] of Object.entries(OC)) if (Array.isArray(a) && a.length === N) OC[k] = keep.map(i => a[i]);
  out.count = keep.length;
  out.lam_sach = { luc: new Date().toISOString(), bo: drop.size, ngoai_lai: olNew.size, gan_nhom: gan };
  const f = path.resolve(arg('--sua'));
  fs.writeFileSync(f, 'window.DB = ' + JSON.stringify(out) + ';\n');
  console.log(`CSDL đã sửa: ${f} — bỏ ${drop.size} dòng (trùng / giá không hợp lệ), đánh dấu ${olNew.size} ngoại lai, gán nhóm ${gan} dòng.`);
}
console.log(`Soát ${N.toLocaleString('vi-VN')} dòng / ${IX.groups.length} nhóm trong ${((Date.now() - t0) / 1000).toFixed(1)} s — ${total} mục cần xem:`);
for (const k of order) console.log(`  · ${M[k].title}: ${issues[k].rows.length}`);
console.log(`Báo cáo: ${path.join(OUT, 'BAO_CAO_LAM_SACH.xlsx')}`);
