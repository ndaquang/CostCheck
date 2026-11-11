const assert = require('assert'), P = require('../assets/price-lib.js');
const grid = [['PHAN TICH THEO MA THAM CHIEU'], ['Tong hop'], ['STT', 'Ma tham chieu', 'Mo ta', 'Don vi', 'Tong KL', 'Don gia (VND)', 'Tong Tien (VND)', 'So lan'],
  [3, 'CUA', 'CCLD mái kính cường lực', 'Bộ, Mét, m2', 1, 3351812.33, 1, 162],
  [1, 'A', 'Phun cát làm sạch kết cấu thép', 'M2, m2', 1, 120000, 1, 1],
  [2, 'B', 'Đắp đá hỗn hợp', '100m3', 1, 113810000, 1, 5],
  [4, 'C', 'Đào đất bó vỉa', 'm3', 1, 150000, 1, 1],
  [null, 'TONG CONG', null, null, 1, null, 1, null],
  ['STT', 'Ma tham chieu', 'Mo ta', 'Don vi', 'x', 'Don gia', 'x', 'x']];
const { rows, skipped } = P.parseGrid(grid);
assert.strictEqual(rows.length, 4); assert.strictEqual(skipped, 2);
assert.deepStrictEqual([rows[0].unit_norm, rows[0].multi_unit], ['bộ, m, m2', true]);
assert.deepStrictEqual([rows[1].unit_norm, rows[1].multi_unit], ['m2', false]);
assert.strictEqual(rows[2].unit_norm, '100m3');
assert.strictEqual(P.filter(rows, { q: 'dao dat' }).length, 1);
assert.strictEqual(P.filter(rows, { unit: '__multi' }).length, 1);
assert.strictEqual(P.filter(rows, { min: 100000, max: 200000 }).length, 2);
console.log('test_pricelib OK');
// toDB + mergeDB (nguồn "Kho giá" gộp vào CSDL)
const X = require('../assets/pricing.js'), { makeDB } = require('./fixture_db.js');
const db = makeDB(); const n0 = db.count;
const kho = P.toDB(rows.map(r => ({ ...r, project_id: 'abcd1234-0', created_at: '2026-11-11T00:00:00Z' })), [{ id: 'abcd1234-0', name: 'Dự án Gremsy' }]);
const r = X.mergeDB(db, kho, 'Kho giá');
assert.strictEqual(r.dong, 4); assert.strictEqual(db.count, n0 + 4);
assert.ok(X.hasSource(db, 'Kho giá'));
const last = db.count - 1; assert.strictEqual(db.cols.p26[last], 150000); assert.strictEqual(db.projects[db.projects.length - 1][1], 'Dự án Gremsy');
assert.strictEqual(db.dicts.ng[db.cols.ng[last]], 'Kho giá');
Object.keys(db.cols).forEach(k => assert.strictEqual(db.cols[k].length, db.count, k));
console.log('toDB/mergeDB OK');
