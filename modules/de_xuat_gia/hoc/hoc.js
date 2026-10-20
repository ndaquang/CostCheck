'use strict';
/* TRAIN KHỚP — học từ các lần QS xác nhận nhóm đúng, đo tỉ lệ khớp trước / sau, xuất mô hình học (.dxgl) cho module Điền giá BOQ.
   Dùng: node modules/de_xuat_gia/hoc/hoc.js [--db data/db.js] [--out <thư mục>]
           [--cap <cặp khớp.xlsx> ...]      file QS lập: cột Mô tả | Đơn vị | Tiêu đề hạng mục (không bắt buộc) | Nhóm đúng
           [--phien <phiên.dgbq> ...]       phiên làm việc đã lưu từ trang Điền giá BOQ (lấy các dòng QS đã chọn nhóm)
           [--mo-hinh <cũ.dxgl> ...]        dữ liệu học đã có (cộng dồn)
           [--dong-nghia <từ đồng nghĩa.xlsx>]  cột Từ | Nghĩa chuẩn (vd "cốp pha" → "ván khuôn")
           [--boq-gia <BOQ đã chốt giá.xlsx> ...]  đo độ lệch giá tham khảo so với giá chốt thật
           [--k 5]                           số phần kiểm tra chéo
   Kết quả: hoc_khop.dxgl (nạp vào trang Điền giá BOQ: ô "Mở phiên / dữ liệu học"), BAO_CAO_HOC.xlsx, hoc.json */
const { DXG, fs, path, arg, args, loadDB, readXlsx, writeXlsx, findHeader, pct } = require('./chung.js');

const { db: DB, demo } = loadDB(arg('--db') && path.resolve(arg('--db')));
const OUT = path.resolve(arg('--out') || path.join(__dirname, 'ket_qua_hoc'));
const K = +(arg('--k') || 5);
fs.mkdirSync(OUT, { recursive: true });
const F = { excludeReview: true, excludeOutlier: true };   // bộ lọc mặc định của trang Điền giá
const LV = { cao: 3, tb: 2, thap: 1, none: 0 };
const log = (...a) => console.log(...a);

/* ---------- 1. Thu thập cặp "mô tả BOQ → nhóm đúng" ---------- */
const raw = [], bad = [];
for (const f of args('--cap')) {
  let n = 0;
  for (const sh of readXlsx(f).sheets) {
    const h = findHeader(sh.grid, {
      d: ['mo ta', 'noi dung', 'description', 'dien giai', 'ten cong viec', 'noi dung cong viec'], u: ['don vi', 'dvt', 'unit'],
      n: ['tieu de', 'tieu de hang muc', 'hang muc cha', 'heading'], g: ['nhom dung', 'nhom', 'group', 'nhom csdl', 'nhom tham khao'],
    }, ['d', 'g']);
    if (!h) continue;
    for (let r = h.headerRow + 1; r < sh.grid.length; r++) {
      const row = sh.grid[r] || [], v = k => h.cols[k] === undefined ? '' : String(row[h.cols[k]] ?? '').trim();
      if (!v('d') || !v('g')) continue;
      raw.push({ d: v('d'), u: v('u'), n: v('n'), gn: v('g'), src: `${path.basename(f)}!${sh.name}:${r + 1}` }); n++;
    }
  }
  log(`Cặp khớp từ ${path.basename(f)}: ${n}`);
}
for (const f of args('--phien')) {
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  const items = (j.items || []).filter(x => x.picked && x.d && x.gn);
  for (const x of items) raw.push({ d: x.d, u: x.u || '', n: x.n || '', gk: x.gkey, gn: x.gn, gu: x.gu, neg: x.auto ? [x.auto] : [], src: `${path.basename(f)}:${x.id}` });
  log(`Lựa chọn QS từ phiên ${path.basename(f)}: ${items.length}${(j.items || []).some(x => x.picked && !x.d) ? ' (phiên lưu bằng phiên bản cũ không có mô tả: lưu lại phiên bằng phiên bản mới)' : ''}`);
}
let prior = { cap: [], dong_nghia: [] };
for (const f of args('--mo-hinh')) { const j = JSON.parse(fs.readFileSync(f, 'utf8')); prior = DXG.mergeLearn(prior, j); log(`Dữ liệu học cũ ${path.basename(f)}: ${(j.cap || []).length} cặp`); }
for (const c of prior.cap) raw.push({ ...c, src: 'dữ liệu học cũ' });
const syn = [...prior.dong_nghia];
if (arg('--dong-nghia')) {
  for (const sh of readXlsx(path.resolve(arg('--dong-nghia'))).sheets) {
    const h = findHeader(sh.grid, { a: ['tu', 'tu viet tat', 'cach ghi'], b: ['nghia chuan', 'nghia', 'chuan', 'thay bang'] }, ['a', 'b']);
    if (h) for (let r = h.headerRow + 1; r < sh.grid.length; r++) { const row = sh.grid[r] || [], a = row[h.cols.a], b = row[h.cols.b]; if (a && b) syn.push([String(a), String(b)]); }
  }
  log(`Từ đồng nghĩa: ${syn.length} cặp`);
}
if (!raw.length) { console.error('Chưa có dữ liệu để học: truyền --cap <file.xlsx>, --phien <file.dgbq> hoặc --mo-hinh <file.dxgl>.'); process.exit(2); }

/* ---------- 2. Đánh giá ---------- */
// Gắn nhóm đúng trong chỉ mục hiện hành: theo khóa / tên + đơn vị, rồi theo tên (đơn vị quy đổi được)
function resolveAll(IX, list) {
  const byName = new Map();
  for (const g of IX.groups) { const k = DXG.norm(g.name); (byName.get(k) || byName.set(k, []).get(k)).push(g); }
  const ok = [];
  for (const p of list) {
    let g = DXG.resolveGroup(IX, p.gk, p.gn, p.gu || p.u);
    if (!g) { const gs = byName.get(DXG.norm(p.gn)) || []; g = gs.find(x => !p.u || DXG.unitRatio(x.unit, p.u) !== null) || gs[0] || null; }
    if (g) ok.push({ ...p, gid: g.id, gk: g.key, gn: g.name, gu: g.unit }); else if (IX === IX0) bad.push(p);
  }
  return ok;
}
function judge(IX, p) {
  const m = DXG.match(IX, { desc: p.d, unit: p.u, near: p.n, ctx: p.n });
  const rank = m.findIndex(c => c.g === p.gid) + 1;
  const c = m[0];
  const st = c ? DXG.groupStats(IX, c.g, F, c.ratio) : null;
  const fit = c ? DXG.confidence(c, st) : { level: 'none', value: 0 };
  return { p, rank, top: c ? c.g : -1, score: c ? c.score : 0, conf: fit.value, level: fit.level, unitOk: c ? c.unitOk : null, learned: c && c.learned, ok: !!c && c.g === p.gid };
}
const canFill = (r, min) => r.top >= 0 && r.unitOk !== false && LV[r.level] >= LV[min];
function metrics(res, min = 'tb') {
  const n = res.length, fill = res.filter(r => canFill(r, min)), good = fill.filter(r => r.ok);
  return { n, top1: pct(res.filter(r => r.rank === 1).length, n), top3: pct(res.filter(r => r.rank >= 1 && r.rank <= 3).length, n),
    fill: pct(fill.length, n), prec: pct(good.length, fill.length), dung: pct(good.length, n), sai: pct(fill.length - good.length, n) };
}
const toCap = (IX, list, base) => list.map(p => {
  const b = base && base.get(p);
  const neg = (p.neg || []).slice();
  if (b && b.top >= 0 && b.top !== p.gid) { const g = IX.groups[b.top]; neg.push({ gk: g.key, gn: g.name, gu: g.unit }); }
  return { d: p.d, u: p.u, n: p.n, gk: p.gk, gn: p.gn, gu: p.gu, neg, so: p.so || 1 };
});

DXG.setSynonyms();
const IX0 = DXG.buildIndex(DB);                 // TRƯỚC: CSDL như hiện tại, chưa học
const P0 = resolveAll(IX0, raw);
const before = P0.map(p => judge(IX0, p));
DXG.setSynonyms(syn);
const IX = syn.length ? DXG.buildIndex(DB) : IX0;   // SAU: thêm từ đồng nghĩa + bộ nhớ học
const P = resolveAll(IX, raw);
const baseRes = new Map(P.map(p => [p, judge(IX, p)]));
// Kiểm tra chéo theo nhóm mô tả: cùng một cách ghi luôn nằm chung một phần → đo đúng khả năng gặp MÔ TẢ MỚI
const keyOf = p => DXG.learnKey(p.d, p.u, p.n);
const keys = [...new Set(P.map(keyOf))];
const fold = new Map(keys.map((k, i) => [k, i % K]));
const cv = new Array(P.length);
for (let f = 0; f < K; f++) {
  const train = P.filter(p => fold.get(keyOf(p)) !== f);
  DXG.applyLearn(IX, DXG.mergeLearn({}, { cap: toCap(IX, train, baseRes) }));
  P.forEach((p, i) => { if (fold.get(keyOf(p)) === f) cv[i] = judge(IX, p); });
}
// Đã học: mô hình đầy đủ trên chính dữ liệu học (dòng đã gặp sẽ khớp thế nào lần sau)
const model = DXG.mergeLearn({ dong_nghia: syn }, { cap: toCap(IX, P, baseRes) });
DXG.applyLearn(IX, model);
const after = P.map(p => judge(IX, p));
// Dòng lặp lại: mô tả xuất hiện ≥ 2 lần trong dữ liệu (thường gặp giữa các BOQ của cùng chủ đầu tư / tư vấn)
const kc = new Map(); for (const p of P) kc.set(keyOf(p), (kc.get(keyOf(p)) || 0) + 1);

const M0 = metrics(before), MS = metrics([...baseRes.values()]), MC = metrics(cv), MA = metrics(after);
// Ngưỡng "Chỉ điền khi khớp ≥": chọn mức điền nhiều nhất mà vẫn đúng ≥ 95% (theo kiểm tra chéo)
const thr = ['thap', 'tb', 'cao'].map(l => ({ l, ...metrics(cv, l) }));
// (dưới 100 cặp thì chưa đủ căn cứ để hạ ngưỡng: giữ mặc định Trung bình, chỉ nâng lên Cao nếu Trung bình sai nhiều)
const MIN_REC = 100;
let rec = thr.filter(t => t.prec !== null && t.prec >= 0.95).sort((a, b) => b.fill - a.fill)[0] || thr[2];
if (P.length < MIN_REC && rec.l === 'thap') rec = thr[1];

/* ---------- 3. Gợi ý từ đồng nghĩa từ các dòng khớp sai ---------- */
const pairCnt = new Map();
for (const r of before) {
  if (r.ok) continue;
  const g = IX0.groups[r.p.gid], qt = new Set(DXG.tokens(r.p.d));
  const A = [...qt].filter(t => !g.tw.has(t) && !/^\d/.test(t)), B = [...g.repSet].filter(t => !qt.has(t) && !/^\d/.test(t));
  if (!A.length || !B.length || A.length > 3 || B.length > 3) continue;
  for (const a of A) for (const b of B) { const k = a + '→' + b; const x = pairCnt.get(k) || { a, b, n: 0, vd: r.p.d }; x.n++; pairCnt.set(k, x); }
}
const synSug = [...pairCnt.values()].sort((x, y) => y.n - x.n).slice(0, 60);

/* ---------- 4. So với giá chốt thật (BOQ đã có giá) ---------- */
const priceRows = [];
for (const f of args('--boq-gia')) {
  for (const sh of readXlsx(f).sheets) {
    if (sh.state !== 'visible') continue;
    const det = DXG.detectColumns(sh.grid); if (!det || det.cols.rate === undefined) continue;
    for (const l of DXG.extractLines(sh.grid, det, sh.name)) {
      if (l.kind !== 'item' || !(l.rate > 0)) continue;
      const m = DXG.match(IX, { desc: l.desc, unit: l.unit, ctx: l.ctx, near: l.heads[l.heads.length - 1] || '' })[0];
      const st = m ? DXG.groupStats(IX, m.g, F, m.ratio) : null, fit = m ? DXG.confidence(m, st) : { level: 'none' };
      priceRows.push({ f: path.basename(f), sh: sh.name, r: l.r + 1, d: l.desc, u: l.unit, gia: l.rate, g: m ? IX.groups[m.g].name : '', level: fit.level,
        p25: st && st.p25, p50: st && st.med, p10: st && st.p10, p90: st && st.p90, lech: st && st.med ? l.rate / st.med - 1 : null, fill: !!m && m.unitOk !== false && LV[fit.level] >= LV.tb });
    }
  }
}
const pf = priceRows.filter(r => r.fill && r.lech !== null);
const PM = { n: priceRows.length, fill: pf.length, in10: pct(pf.filter(r => Math.abs(r.lech) <= 0.1).length, pf.length),
  in20: pct(pf.filter(r => Math.abs(r.lech) <= 0.2).length, pf.length), band: pct(pf.filter(r => r.gia >= r.p10 && r.gia <= r.p90).length, pf.length),
  medAbs: pf.length ? DXG.qtile(pf.map(r => Math.abs(r.lech)).sort((a, b) => a - b), 0.5) : null };

/* ---------- 5. Ghi kết quả ---------- */
model.tao_luc = new Date().toISOString();
model.csdl = { built: DB.built || '', count: DB.count, demo };
model.danh_gia = { cap: P.length, truoc: M0, moi: MC, da_hoc: MA, nguong: rec.l };
fs.writeFileSync(path.join(OUT, 'hoc_khop.dxgl'), JSON.stringify(model));
const gname = (IXx, g) => g >= 0 ? IXx.groups[g].name : '(không khớp)';
const FIT = { cao: 'Cao', tb: 'Trung bình', thap: 'Thấp', none: 'Không khớp' };
const mrow = (label, m, note) => [label, m.top1, m.top3, m.fill, m.prec, m.dung, m.sai, note];
const sheets = [
  { name: 'Tóm tắt', title: 'TRAIN KHỚP NHÓM — KẾT QUẢ',
    note: `CSDL: ${demo ? 'GIẢ LẬP (bộ chạy thử)' : arg('--db')} · ${DB.count.toLocaleString('vi-VN')} dòng · ${IX.groups.length} nhóm\n` +
      `Dữ liệu học: ${P.length} cặp mô tả → nhóm (${keys.length} cách ghi khác nhau)${bad.length ? `, ${bad.length} cặp không tìm thấy nhóm trong CSDL (xem sheet "Không có nhóm")` : ''} · từ đồng nghĩa người dùng: ${syn.length}\n` +
      `"Điền" = độ khớp ≥ Trung bình và cùng đơn vị (như mặc định của trang Điền giá). "Mô tả mới" = kiểm tra chéo ${K} phần, mô tả đem thử chưa từng có trong dữ liệu học.`,
    header: ['Trường hợp', 'Top-1 đúng', 'Top-3 có nhóm đúng', 'Tỉ lệ điền', 'Độ chính xác khi điền', 'Điền đúng / tổng', 'Điền SAI / tổng', 'Ghi chú'],
    widths: [42, 11, 13, 11, 13, 13, 13, 60], pct: [1, 2, 3, 4, 5, 6],
    rows: [
      mrow('Trước khi học', M0, 'CSDL + từ đồng nghĩa có sẵn'),
      ...(syn.length ? [mrow('Thêm từ đồng nghĩa người dùng', MS, `${syn.length} cặp`)] : []),
      mrow('Sau khi học — mô tả MỚI (ước lượng thực tế)', MC, 'Độ khớp với BOQ mới chưa gặp: nhờ mô tả gần giống + nhóm bị bác'),
      mrow('Sau khi học — mô tả ĐÃ GẶP', MA, 'Cùng cách ghi xuất hiện lại ở BOQ sau → khớp đúng nhóm QS đã chọn'),
      [], ['Khuyến nghị "Chỉ điền khi khớp ≥"', FIT[rec.l], '', rec.fill, rec.prec, '', '', 'Mức điền nhiều nhất mà vẫn đúng ≥ 95% (kiểm tra chéo)' + (P.length < MIN_REC ? ` · dưới ${MIN_REC} cặp: chưa hạ ngưỡng` : '')],
      ...thr.map(t => [`   mức ${FIT[t.l]}`, '', '', t.fill, t.prec, t.dung, t.sai, '']),
      ...(PM.n ? [[], ['So với giá chốt thật', `${PM.fill}/${PM.n} dòng điền`, '', PM.in10, PM.in20, PM.band, PM.medAbs,
        'Cột: trong ±10% P50 · trong ±20% P50 · nằm trong P10–P90 · trung vị |lệch|']] : []),
    ] },
  { name: 'Chi tiết', title: 'Từng cặp: trước / sau khi học', header: ['Mô tả', 'Đơn vị', 'Tiêu đề', 'Nhóm đúng', 'Số lần', 'Trước: nhóm khớp', 'Trước', 'Mô tả mới: nhóm khớp', 'Mô tả mới', 'Đã gặp', 'Nguồn'],
    widths: [50, 8, 20, 40, 7, 40, 9, 40, 9, 9, 30],
    rows: P.map((p, i) => { const b = before.find(r => r.p.src === p.src && r.p.d === p.d) || {}; const v = r => !r || r.top < 0 ? '—' : r.ok ? (canFill(r, 'tb') ? 'đúng' : 'đúng, chưa điền') : (canFill(r, 'tb') ? 'SAI' : 'sai, không điền');
      return [p.d, p.u, p.n, p.gn, kc.get(keyOf(p)), gname(IX0, b.top ?? -1), v(b), gname(IX, cv[i].top), v(cv[i]), v(after[i]), p.src]; }) },
  { name: 'Từ đồng nghĩa gợi ý', title: 'Gợi ý từ đồng nghĩa (từ các dòng khớp sai trước khi học)',
    note: 'Mỗi dòng: từ trong mô tả BOQ không có trong nhóm đúng ↔ từ của nhóm đúng không có trong mô tả. QS duyệt, giữ cặp đúng nghĩa,\nghi vào file từ đồng nghĩa (cột Từ | Nghĩa chuẩn) rồi chạy lại với --dong-nghia.',
    header: ['Từ', 'Nghĩa chuẩn', 'Số lần', 'Ví dụ'], widths: [18, 18, 8, 60], rows: synSug.map(x => [x.a, x.b, x.n, x.vd]) },
];
if (bad.length) sheets.push({ name: 'Không có nhóm', title: 'Cặp có "Nhóm đúng" không tìm thấy trong CSDL', note: 'Sửa tên nhóm cho đúng tên nhóm đại diện trong CSDL (hoặc CSDL đã đổi tên nhóm).',
  header: ['Mô tả', 'Đơn vị', 'Nhóm đúng (đã ghi)', 'Nguồn'], widths: [50, 8, 45, 30], rows: bad.map(p => [p.d, p.u, p.gn, p.src]) });
if (priceRows.length) sheets.push({ name: 'So giá chốt', title: 'Giá tham khảo so với giá chốt thật', header: ['File', 'Sheet', 'Dòng', 'Mô tả', 'Đơn vị', 'Giá chốt', 'Nhóm khớp', 'Độ khớp', 'Có điền', 'P10', 'P25', 'P50', 'P90', 'Giá chốt / P50 − 1'],
  widths: [20, 12, 6, 50, 8, 13, 40, 11, 8, 13, 13, 13, 13, 12], money: [5, 9, 10, 11, 12], pct: [13],
  rows: priceRows.map(r => [r.f, r.sh, r.r, r.d, r.u, r.gia, r.g, FIT[r.level], r.fill ? 'có' : '', r.p10, r.p25, r.p50, r.p90, r.lech]) });
writeXlsx({ sheets }, path.join(OUT, 'BAO_CAO_HOC.xlsx'));
fs.writeFileSync(path.join(OUT, 'hoc.json'), JSON.stringify({ cap: P.length, khong_nhom: bad.length, truoc: M0, dong_nghia: MS, moi: MC, da_hoc: MA, nguong: rec.l, gia: PM }, null, 1));

const f = v => v === null ? '—' : (v * 100).toFixed(1) + '%';
log(`\n${P.length} cặp học (${keys.length} cách ghi)${bad.length ? `, ${bad.length} cặp không có nhóm trong CSDL` : ''}`);
log('                               Top-1   Điền   Đúng khi điền   Điền SAI');
for (const [l, m] of [['Trước khi học', M0], ...(syn.length ? [['+ từ đồng nghĩa', MS]] : []), ['Sau học — mô tả mới', MC], ['Sau học — mô tả đã gặp', MA]])
  log(`  ${l.padEnd(28)} ${f(m.top1).padStart(6)} ${f(m.fill).padStart(6)} ${f(m.prec).padStart(12)} ${f(m.sai).padStart(10)}`);
log(`Khuyến nghị "Chỉ điền khi khớp ≥ ${FIT[rec.l]}" (điền ${f(rec.fill)}, đúng ${f(rec.prec)} khi điền)`);
if (PM.n) log(`So giá chốt: ${PM.fill}/${PM.n} dòng điền · trong ±10% P50: ${f(PM.in10)} · trong ±20%: ${f(PM.in20)} · trong P10–P90: ${f(PM.band)}`);
log(`Mô hình học: ${path.join(OUT, 'hoc_khop.dxgl')}\nBáo cáo: ${path.join(OUT, 'BAO_CAO_HOC.xlsx')}`);
