'use strict';
// Kiểm thử lõi đề xuất giá: node tests/test_pricing.js
const assert = require('assert');
const DXG = require('../assets/pricing.js');
const { makeDB } = require('./fixture_db.js');

const IX = DXG.buildIndex(makeDB());
const top = (desc, unit, ctx = '') => { const m = DXG.match(IX, { desc, unit, ctx }); return m.length ? { ...m[0], name: IX.groups[m[0].g].name } : null; };
let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓', name); };

t('chuẩn hóa tiếng Việt', () => {
  assert.strictEqual(DXG.norm('Bê tông M300 đá 1x2'), 'be tong m 300 da 1 x 2');
  assert.strictEqual(DXG.norm('m²'), 'm 2');
});
t('đơn vị & quy đổi', () => {
  assert.strictEqual(DXG.parseUnit('m²').base, 'm2');
  assert.strictEqual(DXG.parseUnit('M3').base, 'm3');
  assert.strictEqual(DXG.unitRatio('kg', 'tấn'), 1000);
  assert.strictEqual(DXG.unitRatio('m2', '100m2'), 100);
  assert.strictEqual(DXG.unitRatio('m2', 'm3'), null);
  assert.strictEqual(DXG.unitRatio('md', 'm'), 1);
});
t('khớp đúng nhóm theo mô tả', () => {
  assert.strictEqual(top('Bê tông lót móng đá 4x6 mác 150', 'm3').name, 'Bê tông lót móng M150 đá 4x6');
  assert.strictEqual(top('Trát tường trong nhà, vữa XM M75 dày 15mm', 'm2').name, 'Trát tường trong dày 15mm');
  assert.strictEqual(top('Sơn tường trong nhà 1 nước lót 2 nước phủ', 'm2').name, 'Sơn tường trong nhà 1 lót 2 phủ');
  assert.strictEqual(top('Tran thach cao khung chim', 'm2').name, 'Trần thạch cao khung chìm');   // không dấu
});
t('phân biệt mác bê tông / cấu kiện', () => {
  assert.strictEqual(top('Bê tông móng M300', 'm3').name, 'Bê tông móng M300 đá 1x2');
  assert.strictEqual(top('Bê tông cột đá 1x2 M300', 'm3').name, 'Bê tông cột M300 đá 1x2');
});
t('ngữ cảnh hạng mục cha giúp khớp', () => {
  const m = top('Cốt thép D<=10', 'kg', 'PHẦN MÓNG');
  assert.strictEqual(m.name, 'Cốt thép móng D<=10');
});
t('quy đổi kg → tấn', () => {
  const m = top('Cốt thép cột D>18', 'tấn');
  assert.strictEqual(m.ratio, 1000);
  const st = DXG.groupStats(IX, m.g, {}, m.ratio);
  assert.ok(st.med > 15e6 && st.med < 30e6, 'giá/tấn ' + st.med);
});
t('không khớp với mô tả lạ', () => {
  const m = DXG.match(IX, { desc: 'Hệ thống điều hòa VRV tầng mái', unit: 'bộ' });
  const c = m.length ? DXG.confidence(m[0], DXG.groupStats(IX, m[0].g, {}, m[0].ratio)) : { level: 'none' };
  assert.ok(c.level === 'none' || c.level === 'thap', 'mức ' + c.level);
});
t('lọc ngoại lai và REVIEW', () => {
  const m = top('Đào đất móng bằng máy', 'm3');
  const all = DXG.groupStats(IX, m.g, {}), f = DXG.groupStats(IX, m.g, { excludeOutlier: true, excludeReview: true });
  assert.strictEqual(all.n, 14); assert.strictEqual(f.n, 12);
  assert.ok(f.max < all.max);
  const y = DXG.groupStats(IX, m.g, { yearFrom: 2025 });
  assert.ok(y.ids.every(i => IX.C.y[i] >= 2025));
  const ty = DXG.groupStats(IX, m.g, { types: new Set(['Nhà xưởng']) });
  assert.ok(ty.ids.every(i => [0, 2].includes(IX.C.p[i])));
});
t('nhận diện cột BOQ 2 dòng tiêu đề', () => {
  const grid = [
    ['BẢNG KHỐI LƯỢNG'], [],
    ['STT', 'Mô tả công việc', 'Đơn vị', 'Khối lượng', 'Đơn giá', null, 'Thành tiền'],
    ['No.', 'Description', 'Unit', 'Quantity', 'Vật liệu', 'Nhân công', 'Amount'],
    ['A', 'PHẦN MÓNG'],
    [1, 'Bê tông lót móng M150', 'm3', 12.5, null, null, null],
    ['', 'Tổng cộng'],
  ];
  const d = DXG.detectColumns(grid);
  assert.strictEqual(d.headerRow, 2); assert.strictEqual(d.dataStart, 4);
  assert.strictEqual(d.cols.desc, 1); assert.strictEqual(d.cols.unit, 2); assert.strictEqual(d.cols.qty, 3); assert.strictEqual(d.cols.amount, 6);
  const lines = DXG.extractLines(grid, d, 'S1');
  assert.deepStrictEqual(lines.map(l => l.kind), ['head', 'item', 'sum']);
  assert.strictEqual(lines[1].ctx, 'PHẦN MÓNG');
});
t('số kiểu VN / EN', () => {
  assert.strictEqual(DXG.toNum('1.234.567'), 1234567);
  assert.strictEqual(DXG.toNum('1,234,567.5'), 1234567.5);
  assert.strictEqual(DXG.toNum('12,5'), 12.5);
  assert.strictEqual(DXG.toNum('abc'), null);
});
t('ghép baseline theo mã / mô tả', () => {
  const items = [{ sheet: 'S1', code: '1', desc: 'Bê tông lót móng M150', unit: 'm3' }, { sheet: 'S1', code: '2', desc: 'Cốt thép cột D>18', unit: 'tấn' }, { sheet: 'S1', code: '9', desc: 'Không có trong baseline', unit: 'm2' }];
  const base = [{ sheet: 'S1', code: '1', desc: 'Bê tông lót móng M150', unit: 'm3', price: 1200000 }, { sheet: 'Khác', code: 'X', desc: 'Cốt thép cột D>18', unit: 'kg', price: 20000 }];
  const r = DXG.matchBaseline(items, base);
  assert.strictEqual(r.get(items[0]).price, 1200000);
  assert.strictEqual(r.get(items[1]).price, 20000000);   // kg → tấn
  assert.ok(!r.has(items[2]));
  const d = DXG.diff(1100000, 1000000, 10);
  assert.ok(Math.abs(d.pct - 0.1) < 1e-9); assert.strictEqual(d.amt, 1000000);
});
t('bách phân vị', () => {
  assert.strictEqual(DXG.percentRank([1, 2, 3, 4], 0), 0);
  assert.strictEqual(DXG.percentRank([1, 2, 3, 4], 9), 1);
  assert.strictEqual(DXG.percentRank([1, 2, 3, 4], 2.5), 0.5);
});
console.log(`\n${n} nhóm kiểm thử đạt.`);
