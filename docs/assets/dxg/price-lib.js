/* Kho đơn giá tra cứu: đọc sheet "PHAN TICH THEO MA" của file tổng hợp, chuẩn hóa đơn vị, chỉ giữ MÔ TẢ + ĐƠN VỊ + ĐƠN GIÁ.
 * Quy tắc: mã tham chiếu có đơn giá = 0 → bỏ qua. Mã có 2-3 đơn vị (sau chuẩn hóa) → không lưu dòng tổng hợp,
 * thay bằng các dòng chi tiết của mã đó ở sheet "TONG HOP CHI TIET" (mỗi dòng 1 đơn vị).
 * 100m2 / 100m3 giữ riêng (không gộp với m2 / m3, vì giá khác nhau 100 lần). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.PriceLib = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const fold = s => String(s == null ? '' : s).toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/²/g, '2').replace(/³/g, '3').replace(/[^a-z0-9]+/g, ' ').trim();
  const ALIAS = { m2: 'm2', m3: 'm3', met: 'm', md: 'm', m: 'm', mdai: 'm', tan: 'tấn', t: 'tấn', bo: 'bộ', coc: 'cọc', hop: 'hộp', cay: 'cây', cai: 'cái', san: 'sàn' };
  function normUnit(raw) {
    const parts = String(raw == null ? '' : raw).split(/[,;]/).map(s => s.trim()).filter(Boolean);
    const set = [];
    for (const p of parts) {
      const k = fold(p).replace(/ /g, '');
      const u = /^\d+(m2|m3|m)$/.test(k) ? k : (ALIAS[k] || k);
      if (u && !set.includes(u)) set.push(u);
    }
    return { unit_norm: set.join(', '), multi_unit: set.length >= 2 };
  }
  const num = v => { const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, '')); return isFinite(n) ? n : null; };

  const isPrice = f => /^don gia( \(?vnd\)?)?$/.test(f) || f === 'don gia vnd';
  /* Tìm dòng tiêu đề: trả chỉ số cột mã tham chiếu (code), mô tả (m), đơn vị (u), đơn giá (p) */
  function findHeader(grid, needCode) {
    for (let r = 0; r < Math.min(grid.length, 40); r++) {
      const f = (grid[r] || []).map(fold);
      const m = f.findIndex(x => x === 'mo ta' || x.startsWith('mo ta ') || x === 'ten cong viec' || x === 'noi dung cong viec' || x === 'dien giai');
      const u = f.findIndex(x => x === 'don vi' || x === 'dvt' || x.startsWith('don vi '));
      let p = f.findIndex(isPrice); if (p < 0) p = f.findIndex(x => x.startsWith('don gia'));
      const code = f.findIndex(x => x.startsWith('ma tham chieu') || x === 'ma tc' || x === 'ma');
      if (m >= 0 && p >= 0 && (!needCode || code >= 0)) return { h: r, m, u, p, code };
    }
    return null;
  }
  const isTitle = row => row.some(v => { const f = fold(v); return f === 'tong cong' || f === 'mo ta'; });
  const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const mkRow = (desc, raw, price, code) => ({ description: desc.slice(0, 1000), desc_search: fold(desc), unit_raw: raw, ...normUnit(raw),
    unit_price: Math.round(price * 100) / 100, code });

  /* Sheet "PHAN TICH THEO MA" (grid: mảng các dòng). Trả { rows, skipped, zero }: dòng đơn giá ≤ 0 bỏ qua (zero), dòng tiêu đề/tổng bỏ qua (skipped) */
  function parseGrid(grid) {
    const H = findHeader(grid, false);
    if (!H) throw new Error('Không thấy dòng tiêu đề có cột "Mo ta" và "Don gia".');
    const rows = []; let skipped = 0, zero = 0;
    for (let r = H.h + 1; r < grid.length; r++) {
      const row = grid[r] || [];
      if (row.every(v => v == null || v === '')) continue;
      if (isTitle(row)) { skipped++; continue; }
      const desc = clean(row[H.m]), price = num(row[H.p]);
      if (!desc) { skipped++; continue; }
      if (price === null || price <= 0) { zero++; continue; }
      rows.push(mkRow(desc, H.u >= 0 ? clean(row[H.u]) : '', price, H.code >= 0 ? clean(row[H.code]) : ''));
    }
    return { rows, skipped, zero };
  }

  /* Sheet "TONG HOP CHI TIET": các dòng chi tiết theo mã tham chiếu. Ô mã để trống thì lấy mã của dòng trên (bảng gom nhóm).
   * Trả Map mã (fold) → [{ description, unit_raw, price }] — chỉ dòng có đơn giá > 0 */
  function parseDetail(grid) {
    const H = findHeader(grid, true);
    if (!H) throw new Error('Sheet "TONG HOP CHI TIET" thiếu dòng tiêu đề có cột "Ma tham chieu", "Mo ta", "Don gia".');
    const out = new Map(); let cur = '';
    for (let r = H.h + 1; r < grid.length; r++) {
      const row = grid[r] || [];
      if (row.every(v => v == null || v === '') || isTitle(row)) continue;
      const c = clean(row[H.code]); if (c) cur = fold(c); if (!cur) continue;
      const desc = clean(row[H.m]), price = num(row[H.p]);
      if (!desc || price === null || price <= 0) continue;
      if (!out.has(cur)) out.set(cur, []);
      out.get(cur).push({ description: desc, unit_raw: H.u >= 0 ? clean(row[H.u]) : '', price });
    }
    return out;
  }

  /* Gộp: mã có 1 đơn vị lấy dòng tổng hợp; mã nhiều đơn vị thay bằng các dòng chi tiết (mỗi dòng 1 đơn vị) của mã đó.
   * Mã có đơn giá = 0 đã bị bỏ ở parseGrid nên cũng không lấy chi tiết. */
  function combine(sum, detail) {
    const rows = [], noDetail = []; let multi = 0, fromDetail = 0, detailMulti = 0;
    for (const r of sum.rows) {
      if (!r.multi_unit) { rows.push(r); continue; }
      multi++;
      const ds = detail && r.code ? detail.get(fold(r.code)) : null;
      if (!ds || !ds.length) { noDetail.push(r.code || r.description); continue; }
      for (const d of ds) {
        const x = mkRow(d.description, d.unit_raw, d.price, r.code);
        if (x.multi_unit || !x.unit_norm) { detailMulti++; continue; }
        rows.push(x); fromDetail++;
      }
    }
    return { rows, skipped: sum.skipped, zero: sum.zero, multi, fromDetail, detailMulti, noDetail };
  }

  /* Đọc workbook XLSXIO: sheet "PHAN TICH THEO MA" (bắt buộc) + "TONG HOP CHI TIET" (cho mã nhiều đơn vị) */
  async function readWorkbook(wb) {
    const find = n => wb.sheets.findIndex(s => fold(s.name) === n);
    const si = find('phan tich theo ma');
    if (si < 0) throw new Error('Không thấy sheet "PHAN TICH THEO MA" trong file.');
    const sum = parseGrid(wb.grid(si));
    const di = find('tong hop chi tiet');
    const r = combine(sum, di >= 0 ? parseDetail(wb.grid(di)) : null);
    r.hasDetail = di >= 0;
    return r;
  }
  /* Lọc phía trình duyệt: q (từ khóa, mọi từ phải có), unit, min, max */
  function filter(rows, f) {
    const words = fold(f.q || '').split(' ').filter(Boolean);
    return rows.filter(r => words.every(w => r.desc_search.includes(w))
      && (!f.unit || r.unit_norm === f.unit || (r.multi_unit && f.unit === '__multi'))
      && (f.min == null || r.unit_price >= f.min) && (f.max == null || r.unit_price <= f.max));
  }
  /* Dòng Supabase → khối dữ liệu cùng định dạng window.DB, để mergeDB gộp thành nguồn "Kho giá" của app tra cứu.
   * rows: { project_id, description, unit_raw, unit_norm, unit_price, created_at }; projects: [{ id, name }] */
  function toDB(rows, projects) {
    const pIdx = new Map(), prj = [];
    for (const p of projects || []) { pIdx.set(p.id, prj.length); prj.push([String(p.id).slice(0, 8), p.name, '', '', '', '']); }
    const D = { u: [], cu: [], g: [], gn: [] }, ix = {}, gm = new Map();
    const idx = (k, v) => { const m = ix[k] || (ix[k] = new Map()); let j = m.get(v); if (j === undefined) { D[k].push(v); j = D[k].length - 1; m.set(v, j); } return j; };
    const C = { name: [], spec: [], u: [], cu: [], g: [], gn: [], p26: [], cp: [], tot: [], y: [], p: [], mat: [], lab: [] };
    for (const r of rows) {
      const unit = r.unit_norm || r.unit_raw || '', key = fold(r.description) + '|' + unit;
      let g = gm.get(key); if (g === undefined) { g = idx('g', r.description); gm.set(key, g); }
      const u = idx('u', unit), price = Math.round(Number(r.unit_price));
      C.name.push(r.description); C.spec.push(''); C.u.push(u); C.cu.push(idx('cu', unit)); C.g.push(g); C.gn.push(idx('gn', r.description));
      C.p26.push(price); C.cp.push(price); C.tot.push(price);
      C.y.push(r.created_at ? new Date(r.created_at).getFullYear() : 0);
      C.p.push(pIdx.has(r.project_id) ? pIdx.get(r.project_id) : -1); C.mat.push(null); C.lab.push(null);
    }
    return { count: rows.length, cols: C, dicts: D, projects: prj };
  }
  return { fold, normUnit, parseGrid, parseDetail, combine, readWorkbook, filter, toDB };
});
