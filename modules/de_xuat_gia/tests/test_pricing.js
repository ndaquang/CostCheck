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
t('BOQ thật: ghi chú, "CÔNG TÁC…" là tiêu đề, tiêu đề phụ ngang cấp, tiêu đề phụ "Mời thầu/Dự thầu"', () => {
  const grid = [
    ['Stt', 'Mô tả', 'Đơn vị', 'Khối lượng', null, 'Đơn giá (VNĐ)', 'Thành tiền'],
    [null, null, null, 'Mời thầu', 'Dự thầu'],
    ['A', 'CÔNG TÁC ĐẤT'],
    [null, 'Công tác được xem như bao gồm đào móng, vận chuyển, lấp đất, đầm chặt theo đúng chỉ dẫn kỹ thuật của dự án và các tiêu chuẩn'],
    [null, 'Công tác đào đất'],
    ['1', 'Móng & đà kiềng', 'm3', 339],
    ['B', 'CÔNG TÁC BÊ TÔNG'],
    [null, 'Bê tông thương phẩm đổ bằng bơm', 'Ghi chú'],
    [null, 'BÊ TÔNG LÓT B10'],
    ['1', 'Móng, giằng móng', 'm3', 13],
    [null, 'BÊ TÔNG B20, W8'],
    ['1', 'Móng', 'm3', 27],
    [null, '.................................'],
    [null, 'TỔNG GIÁ TRỊ', null, null, null, null, 0],
  ];
  const d = DXG.detectColumns(grid);
  assert.strictEqual(d.dataStart, 2); assert.strictEqual(d.cols.qty, 3); assert.strictEqual(d.cols.rate, 5);
  const L = DXG.extractLines(grid, d, 'B2');
  assert.deepStrictEqual(L.map(l => l.kind), ['head', 'note', 'head', 'item', 'head', 'note', 'head', 'item', 'head', 'item', 'note', 'sum']);
  assert.deepStrictEqual(L[9].heads, ['CÔNG TÁC BÊ TÔNG', 'BÊ TÔNG B20, W8']);
});
t('cấp độ bền B → mác M; mô tả ngắn dùng tiêu đề gần nhất', () => {
  assert.deepStrictEqual(DXG.tokens('Bê tông lót B10'), ['be', 'tong', 'lot', 'm', '150']);
  assert.deepStrictEqual(DXG.tokens('Sàn tầng B1'), ['san', 'tang', 'b', '1']);   // không phải bê tông thì giữ nguyên
  const m = DXG.match(IX, { desc: 'Móng, giằng móng', unit: 'm3', near: 'BÊ TÔNG LÓT B10', ctx: 'CÔNG TÁC BÊ TÔNG · BÊ TÔNG LÓT B10' });
  assert.strictEqual(IX.groups[m[0].g].name, 'Bê tông lót móng M150 đá 4x6');
  const v = DXG.match(IX, { desc: 'Móng', unit: 'm2', near: 'CÔNG TÁC VÁN KHUÔN', ctx: 'CÔNG TÁC VÁN KHUÔN' });
  assert.strictEqual(IX.groups[v[0].g].name, 'Ván khuôn móng');
});
t('từ đồng nghĩa / viết tắt ngành xây dựng', () => {
  assert.deepStrictEqual(DXG.tokens('BT lót mác 150'), ['be', 'tong', 'lot', 'm', '150']);
  assert.deepStrictEqual(DXG.tokens('Cốp pha cột'), DXG.tokens('Ván khuôn cột'));
  assert.deepStrictEqual(DXG.tokens('Thép Φ10'), ['thep', 'd', '10']);
  assert.deepStrictEqual(DXG.tokens('đường kính 10'), ['d', '10']);
  assert.strictEqual(top('Cốp pha móng', 'm2').name, 'Ván khuôn móng');
  assert.strictEqual(top('Formwork for footing', 'm2').name, 'Ván khuôn móng');
  DXG.setSynonyms([['hố đào', 'đào móng']]);
  assert.deepStrictEqual(DXG.tokens('hố đào'), ['dao', 'mong']);
  DXG.setSynonyms();
});
t('học từ lựa chọn QS: nhớ đúng, gần đúng, nhóm bị bác', () => {
  const IX2 = DXG.buildIndex(makeDB());
  const g = n => IX2.groups.find(x => x.name === n);
  const want = g('Đào đất móng bằng máy'), bad = g('Ván khuôn móng');
  // mô tả lạ: trước khi học chỉ khớp yếu (không đủ tin cậy để điền)
  const q = { desc: 'Công tác hố đào cơ giới khu A', unit: 'm3' };
  const before = DXG.match(IX2, q);
  assert.ok(!before.length || before[0].score < 0.5);
  const r = DXG.applyLearn(IX2, { cap: [
    { d: q.desc, u: 'm3', gk: want.key, gn: want.name, gu: want.unit },
    { d: 'Cốp pha móng đơn', u: 'm2', gk: 'g999', gn: 'Ván khuôn móng', gu: 'm2', neg: [] },   // khóa cũ: tìm lại theo tên
    { d: 'Nhóm đã bị xóa', u: 'm2', gk: 'gX', gn: 'Không còn', gu: 'm2' },
  ] });
  assert.deepStrictEqual([r.nhan, r.mat], [2, 1]);
  const m = DXG.match(IX2, q);
  assert.strictEqual(m[0].g, want.id); assert.strictEqual(m[0].learned, 'exact');
  assert.strictEqual(DXG.confidence(m[0], DXG.groupStats(IX2, m[0].g, {}, 1)).level, 'cao');
  // thứ tự từ khác vẫn là "nhớ đúng"; thêm 1 từ là "gần đúng"; khác con số thì không dùng
  assert.strictEqual(DXG.match(IX2, { desc: 'Hố đào cơ giới khu A công tác', unit: 'm3' })[0].learned, 'exact');
  const near = DXG.match(IX2, { desc: 'Công tác hố đào cơ giới khu A bằng máy', unit: 'm3' });
  assert.strictEqual(near[0].g, want.id); assert.strictEqual(near[0].learned, 'near');
  assert.ok(!DXG.match(IX2, { desc: 'Công tác hố đào cơ giới khu A2', unit: 'm3' }).some(c => c.learned));
  assert.ok(DXG.match(IX2, { desc: 'Cốp pha móng đơn', unit: 'm2' })[0].g === bad.id);
  // QS bác nhóm tự khớp → nhóm đó bị hạ điểm
  const top0 = DXG.match(IX2, { desc: 'Bê tông móng M300', unit: 'm3' })[0];
  const alt = g('Bê tông cột M300 đá 1x2');
  DXG.applyLearn(IX2, { cap: [{ d: 'Bê tông móng M300', u: 'm3', gk: alt.key, gn: alt.name, gu: alt.unit, neg: [{ gk: IX2.groups[top0.g].key, gn: IX2.groups[top0.g].name, gu: IX2.groups[top0.g].unit }] }] });
  const after = DXG.match(IX2, { desc: 'Bê tông móng M300', unit: 'm3' });
  assert.strictEqual(after[0].g, alt.id);
  assert.ok(after.find(c => c.g === top0.g).score < top0.score);
  // tắt học
  assert.strictEqual(DXG.match(IX2, { desc: 'Bê tông móng M300', unit: 'm3' }, { learn: false })[0].g, top0.g);
});
t('gộp nguồn giá: nhóm trùng tên gộp chung, nhóm mới thêm, lọc theo nguồn', () => {
  const dst = makeDB(), src = makeDB();
  // nguồn thứ hai: giá cao hơn 10%, thêm một nhóm chỉ nguồn này có, dự án riêng
  src.cols.p26 = src.cols.p26.map(v => Math.round(v * 1.1)); src.projects = [['DT1', 'Đối thủ 1', 'Nhà xưởng', 'Long An', 'Tây Ninh', '']];
  src.cols.p = src.cols.p.map(() => 0);
  const k = src.dicts.g.push('Hệ thống điều hòa VRV') - 1; src.dicts.gn.push('Hệ thống điều hòa VRV'); const ub = src.dicts.u.push('bộ') - 1; src.dicts.cu.push('bộ');
  for (const key of Object.keys(src.cols)) src.cols[key].push(src.cols[key][0]);
  const last = src.count; src.count++;
  Object.assign(src.cols, { name: src.cols.name.map((x, i) => i === last ? 'Hệ thống điều hòa VRV' : x) });
  src.cols.g[last] = k; src.cols.gn[last] = src.dicts.gn.length - 1; src.cols.u[last] = ub; src.cols.cu[last] = src.dicts.cu.length - 1; src.cols.p26[last] = 3.2e8;
  const n0 = dst.count, nGroups0 = DXG.buildIndex(dst).groups.length;
  const r = DXG.mergeDB(dst, src, 'Đối thủ');
  assert.strictEqual(dst.count, n0 + src.count);
  for (const a of Object.values(dst.cols)) assert.strictEqual(a.length, dst.count);
  assert.strictEqual(r.nhomMoi, 1); assert.strictEqual(r.nhomChung, 12);
  assert.deepStrictEqual(dst.dicts.ns, ['Nội bộ', 'Đối thủ']);
  const IX2 = DXG.buildIndex(dst);
  assert.strictEqual(IX2.groups.length, nGroups0 + 1);
  const gid = DXG.match(IX2, { desc: 'Đào đất móng bằng máy', unit: 'm3' })[0].g;
  const all = DXG.groupStats(IX2, gid, {}), own = DXG.groupStats(IX2, gid, { srcOff: new Set(['Đối thủ']) });
  assert.deepStrictEqual(all.src, { 'Nội bộ': 14, 'Đối thủ': 14 });
  assert.strictEqual(own.n, 14); assert.deepStrictEqual(own.src, { 'Nội bộ': 14 });
  assert.ok(all.med > own.med);
  // dự án nguồn mới: lọc tỉnh vẫn đúng
  assert.ok(DXG.groupStats(IX2, gid, { provs: new Set(['Tây Ninh']) }).ids.every(i => IX2.C.ns[i] === 1));
  // nhóm chỉ có ở nguồn đã tắt: không nới bộ lọc sang nguồn đó
  const vrv = DXG.match(IX2, { desc: 'Hệ thống điều hòa VRV', unit: 'bộ' })[0];
  assert.strictEqual(IX2.groups[vrv.g].name, 'Hệ thống điều hòa VRV');
  assert.strictEqual(DXG.groupStats(IX2, vrv.g, {}).med, 3.2e8);
  assert.strictEqual(DXG.groupStats(IX2, vrv.g, { srcOff: new Set(['Đối thủ']), yearFrom: 2030 }).n, 0);
});
console.log(`\n${n} nhóm kiểm thử đạt.`);
