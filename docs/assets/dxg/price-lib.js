/* Kho đơn giá tra cứu: đọc sheet "PHAN TICH THEO MA" của file tổng hợp, chuẩn hóa đơn vị, chỉ giữ MÔ TẢ + ĐƠN VỊ + ĐƠN GIÁ.
 * Quy tắc: đơn vị có 2-3 đơn vị (sau chuẩn hóa) → multi_unit = true, tra cứu theo mô tả.
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

  /* grid: mảng các dòng (mảng ô) của sheet. Trả { rows, skipped } */
  function parseGrid(grid) {
    let h = -1, cm = -1, cu = -1, cp = -1;
    for (let r = 0; r < Math.min(grid.length, 30); r++) {
      const f = (grid[r] || []).map(fold);
      const a = f.findIndex(x => x === 'mo ta'), b = f.findIndex(x => x === 'don vi'), c = f.findIndex(x => x.startsWith('don gia'));
      if (a >= 0 && c >= 0) { h = r; cm = a; cu = b; cp = c; break; }
    }
    if (h < 0) throw new Error('Không thấy dòng tiêu đề có cột "Mo ta" và "Don gia".');
    const rows = []; let skipped = 0;
    for (let r = h + 1; r < grid.length; r++) {
      const row = grid[r] || [];
      if (row.every(v => v == null || v === '')) continue;
      if (row.some(v => { const f = fold(v); return f === 'tong cong' || f === 'mo ta'; })) { skipped++; continue; }
      const desc = String(row[cm] == null ? '' : row[cm]).replace(/\s+/g, ' ').trim(), price = num(row[cp]);
      if (!desc || price === null || price <= 0) { skipped++; continue; }
      const raw = cu >= 0 && row[cu] != null ? String(row[cu]).trim() : '';
      rows.push({ description: desc.slice(0, 1000), desc_search: fold(desc), unit_raw: raw, ...normUnit(raw), unit_price: Math.round(price * 100) / 100 });
    }
    return { rows, skipped };
  }
  /* Tìm sheet "PHAN TICH THEO MA" trong workbook XLSXIO */
  async function readWorkbook(wb) {
    const si = wb.sheets.findIndex(s => fold(s.name) === 'phan tich theo ma');
    if (si < 0) throw new Error('Không thấy sheet "PHAN TICH THEO MA" trong file.');
    return parseGrid(wb.grid(si));
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
  return { fold, normUnit, parseGrid, readWorkbook, filter, toDB };
});
