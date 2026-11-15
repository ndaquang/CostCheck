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
t('nguồn có sẵn trong CSDL (cột ng của 2_XU_LY: Nội bộ + CTG): giữ nhãn, không gộp trùng, thêm đối thủ', () => {
  const dst = makeDB(), dt = makeDB();
  // khối db đã làm sạch chung Nội bộ + CTG: dòng lẻ là CTG, một dòng chưa ghi nguồn (-1 = Nội bộ)
  dst.dicts.ng = ['Nội bộ', 'CTG'];
  dst.cols.ng = dst.cols.name.map((_, i) => (i === 0 ? -1 : i % 2));
  assert.ok(DXG.hasSource(dst, 'CTG')); assert.ok(!DXG.hasSource(dst, 'Đối thủ'));
  const r = DXG.mergeDB(dst, dt, 'Đối thủ');
  assert.strictEqual(r.dong, dt.count);
  assert.deepStrictEqual(dst.dicts.ng, ['Nội bộ', 'CTG', 'Đối thủ']);
  assert.ok(dst.cols.ng.every(v => v >= 0));
  assert.strictEqual(dst.cols.ng[0], 0);
  const n = l => dst.cols.ng.filter(v => dst.dicts.ng[v] === l).length;
  assert.strictEqual(n('Đối thủ'), dt.count);
  assert.strictEqual(n('CTG') + n('Nội bộ'), dst.count - dt.count);
  assert.ok(DXG.hasSource(dst, 'Đối thủ'));
  const IX = DXG.buildIndex(dst);
  const gid = DXG.match(IX, { desc: 'Đào đất móng bằng máy', unit: 'm3' })[0].g;
  assert.deepStrictEqual(Object.keys(DXG.groupStats(IX, gid, {}).src).sort(), ['CTG', 'Nội bộ', 'Đối thủ'].sort());
  // CSDL chưa có cột nguồn: tagSource tạo cột, mọi dòng = Nội bộ
  const x = makeDB(); DXG.tagSource(x, 'Bổ sung');
  assert.deepStrictEqual(x.dicts.ng, ['Nội bộ', 'Bổ sung']); assert.ok(x.cols.ng.every(v => v === 0));
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
  assert.deepStrictEqual(dst.dicts.ng, ['Nội bộ', 'Đối thủ']);
  const IX2 = DXG.buildIndex(dst);
  assert.strictEqual(IX2.groups.length, nGroups0 + 1);
  const gid = DXG.match(IX2, { desc: 'Đào đất móng bằng máy', unit: 'm3' })[0].g;
  const all = DXG.groupStats(IX2, gid, {}), own = DXG.groupStats(IX2, gid, { srcOff: new Set(['Đối thủ']) });
  assert.deepStrictEqual(all.src, { 'Nội bộ': 14, 'Đối thủ': 14 });
  assert.strictEqual(own.n, 14); assert.deepStrictEqual(own.src, { 'Nội bộ': 14 });
  assert.ok(all.med > own.med);
  // dự án nguồn mới: lọc tỉnh vẫn đúng
  assert.ok(DXG.groupStats(IX2, gid, { provs: new Set(['Tây Ninh']) }).ids.every(i => IX2.C.ng[i] === 1));
  // nhóm chỉ có ở nguồn đã tắt: không nới bộ lọc sang nguồn đó
  const vrv = DXG.match(IX2, { desc: 'Hệ thống điều hòa VRV', unit: 'bộ' })[0];
  assert.strictEqual(IX2.groups[vrv.g].name, 'Hệ thống điều hòa VRV');
  assert.strictEqual(DXG.groupStats(IX2, vrv.g, {}).med, 3.2e8);
  assert.strictEqual(DXG.groupStats(IX2, vrv.g, { srcOff: new Set(['Đối thủ']), yearFrom: 2030 }).n, 0);
});
t('gộp CTG: giá quy về năm gốc theo hệ số năm của CSDL nội bộ; "tấn" không gộp với "kg"', () => {
  const { taoCSDL } = require('../../ctg/ctg.js'), { luoiMau } = require('../../ctg/tests/mau.js');
  const dst = makeDB(), C = dst.cols, F = { 2021: 1.3, 2022: 1.2, 2023: 1.15, 2024: 1.1, 2025: 1.05, 2026: 1 };
  for (let i = 0; i < dst.count; i++) { C.cp[i] = C.tot[i]; C.p26[i] = Math.round(C.tot[i] * F[C.y[i]]); }
  const f = DXG.yearFactors(dst);
  assert.ok(Math.abs(f.get(2024) - 1.1) < 1e-3 && Math.abs(f.get(2021) - 1.3) < 1e-3);
  const ctg = taoCSDL(luoiMau()).db;
  const r = DXG.mergeDB(dst, ctg, 'CTG');
  assert.strictEqual(r.quyDoi, ctg.count); assert.strictEqual(r.khongNam, 0);
  const i24 = ctg.cols.y.findIndex(y => y === 2024), j = dst.count - ctg.count + i24;
  assert.strictEqual(dst.cols.p26[j], Math.round(ctg.cols.tot[i24] * f.get(2024)));
  const i26 = ctg.cols.y.findIndex(y => y === 2026);
  assert.strictEqual(dst.cols.p26[dst.count - ctg.count + i26], ctg.cols.tot[i26]);
  // tách vật tư / nhân công của CTG vẫn còn để thống kê
  assert.ok(dst.cols.mat[j] > 0 && dst.cols.lab[j] > 0);
  // đơn vị: nhóm "tấn" của nguồn khác không gộp vào nhóm "kg" cùng tên
  const a = makeDB(), b = makeDB();
  const kg = b.dicts.u.indexOf('kg'); b.dicts.u[kg] = 'tấn'; b.dicts.cu[b.dicts.cu.indexOf('kg')] = 'tấn';
  const r2 = DXG.mergeDB(a, b, 'Khác');
  assert.strictEqual(r2.nhomMoi, 2); assert.strictEqual(r2.nhomChung, 10);
  assert.strictEqual(r2.quyDoi, 0);   // nguồn đã có giá quy đổi: giữ nguyên
});
t('gộp nhóm gần giống khi tính giá: cùng thông số thì gộp, khác mác / trong-ngoài thì không', () => {
  const { taoCSDL } = require('../../ctg/ctg.js'), { luoiMau } = require('../../ctg/tests/mau.js');
  const dst = require('../demo/du_lieu_mau.js').taoDB();
  DXG.mergeDB(dst, taoCSDL(luoiMau()).db, 'CTG');
  const IX3 = DXG.buildIndex(dst), name = g => IX3.groups[g].name;
  const pool = (desc, unit) => { const m = DXG.match(IX3, { desc, unit }); return { m, p: DXG.poolCands(IX3, m, 0, { desc }).map(x => name(x.g)) }; };
  assert.deepStrictEqual(pool('Bê tông lót M150', 'm3').p, ['Bê tông lót móng M150 đá 4x6']);
  assert.deepStrictEqual(pool('Bê tông lót M100', 'm3').p.some(n => /M150/.test(n)), false);
  assert.deepStrictEqual(pool('Trát tường trong nhà dày 15mm vữa M75', 'm2').p.some(n => /ngoài/.test(n)), false);
  const son = pool('Sơn tường trong nhà 1 lớp lót 2 lớp phủ', 'm2');
  assert.ok(!son.p.some(n => /ngoài/.test(n)) && son.p.length >= 1, JSON.stringify(son.p));
  // thống kê gộp: đủ báo giá của các nhóm, mỗi dòng quy về đơn vị dòng BOQ
  const { m } = pool('Bê tông lót M150', 'm3'), pl = DXG.poolCands(IX3, m, 0, { desc: 'Bê tông lót M150' });
  const one = DXG.groupStats(IX3, m[0].g, {}), all = DXG.groupStats(IX3, m[0].g, {}, 1, pl);
  assert.strictEqual(all.n, one.n + IX3.groups[pl[0].g].rows.length); assert.strictEqual(all.pooled, 1);
  assert.ok(all.src['CTG'] > 0 && all.src['Nội bộ'] > 0);
  // QS đã chọn nhóm: không gộp
  assert.deepStrictEqual(DXG.poolCands(IX3, [{ ...m[0], picked: true }, ...m.slice(1)], 0, { desc: 'Bê tông lót M150' }), []);
  // trong nhà / ngoài nhà là hai từ khác nhau sau chuẩn hóa
  assert.ok(DXG.tokens('Sơn tường trong nhà').includes('noithat') && DXG.tokens('Trát ngoài 2cm').includes('ngoaithat'));
});
t('đánh giá baseline so với CSDL: phù hợp / cần xem / không phù hợp', () => {
  const ref = { p10: 80, p25: 90, p50: 100, p75: 110, p90: 130 };
  assert.strictEqual(DXG.judgeBaseline(95, ref).level, 'ok');
  assert.strictEqual(DXG.judgeBaseline(86, ref, 0.15).level, 'ok');   // ngoài P25–P75 nhưng lệch P50 trong ngưỡng
  assert.strictEqual(DXG.judgeBaseline(120, ref).level, 'xem');
  assert.strictEqual(DXG.judgeBaseline(120, ref).ok, true);
  const cao = DXG.judgeBaseline(150, ref), thap = DXG.judgeBaseline(60, ref);
  assert.strictEqual(cao.level, 'cao'); assert.strictEqual(cao.ok, false); assert.ok(Math.abs(cao.d50 - 0.5) < 1e-9);
  assert.strictEqual(thap.level, 'thap'); assert.strictEqual(thap.ok, false);
  assert.strictEqual(DXG.judgeBaseline(null, ref), null);
  assert.strictEqual(DXG.judgeBaseline(100, null), null);
});
t('kiểm tra số học BOQ đã có giá', () => {
  const it = (r, desc, unit, qty, rate, amount, extra = {}) => ({ kind: 'item', sheet: 'S', r, desc, unit, qty, rate, amount, ...extra });
  const lines = [
    { kind: 'head', sheet: 'S', r: 4, desc: 'PHẦN MÓNG', lvl: 1 },
    it(5, 'Đào đất hố móng bằng máy', 'm3', 350, 46000, 16100000),
    it(6, 'Bê tông móng M300 đá 1x2', 'm3', 120, 1700000, 240000000),                    // sai: đúng 204.000.000
    it(7, 'Ván khuôn móng gỗ', 'm2', 410, 120000, null, { fAmt: 'D9*E9' }),              // công thức lấy dòng khác
    it(8, 'Cốt thép móng', 'kg', 1000, 20000, 30000000, { lab: 5000, rateEff: 25000 }),   // VL 20.000 + NC 5.000: đúng ra 25.000.000
    { kind: 'sum', sheet: 'S', r: 9, desc: 'Cộng hạng mục A', amount: 16100000 + 240000000 + 410 * 120000 + 30000000 },
    { kind: 'head', sheet: 'S', r: 10, desc: 'PHẦN HOÀN THIỆN', lvl: 1 },
    it(11, 'Trát tường trong nhà dày 15mm', 'm2', 1600, 100000, 160000000),
    it(12, 'Sơn tường trong nhà', 'm2', 1600, null, null),                                // chưa có giá
    it(13, 'Lát gạch nền', 'm2', null, 300000, 9000000),                                  // thiếu KL
    { kind: 'sum', sheet: 'S', r: 14, desc: 'Cộng hạng mục B', amount: 169000000 },
    { kind: 'sum', sheet: 'S', r: 15, desc: 'Thuế VAT 8%', amount: 1 },
    { kind: 'sum', sheet: 'S', r: 16, desc: 'Tổng cộng', amount: 500000000 },            // sai
  ];
  const res = DXG.auditBoq(lines), at = (r, type) => res.find(x => x.r === r && x.type === type);
  assert.ok(!res.some(x => x.r === 5), JSON.stringify(res.filter(x => x.r === 5)));
  assert.strictEqual(at(6, 'sai_tt').diff, 36000000);
  assert.ok(at(7, 'cong_thuc') && /dòng 9/.test(at(7, 'cong_thuc').msg));
  assert.strictEqual(at(8, 'sai_tt').expect, 25000000);
  assert.ok(!res.some(x => x.r === 9), 'cộng hạng mục A đúng');
  assert.ok(at(12, 'chua_gia') && at(13, 'thieu_kl'));
  assert.ok(!res.some(x => x.r === 14 || x.r === 15), 'cộng B đúng, dòng thuế bỏ qua');
  const tong = at(16, 'sai_tong');
  assert.ok(tong && tong.sev === 'loi' && tong.expect === 16100000 + 240000000 + 410 * 120000 + 30000000 + 169000000, JSON.stringify(tong));
  // giá BOQ so với thị trường
  const ref = { p10: 80, p25: 90, p50: 100, p75: 110, p90: 130 };
  assert.strictEqual(DXG.judgePrice(200, ref).level, 'cao');
  assert.strictEqual(DXG.judgePrice(50, ref).level, 'thap');
});
t('bước phân loại cho dòng gộp thêm (NRM2, loại công việc, cấu kiện): khớp tên → kNN → từ khóa; nguồn có danh mục NRM2 riêng thì ánh xạ theo mã', () => {
  const NRM = [['11', 'Bê tông đổ tại chỗ', 'KẾT CẤU'], ['14', 'Khối xây', 'HOÀN THIỆN'], ['28', 'Hoàn thiện sàn/tường/trần', 'HOÀN THIỆN'], ['29', 'Sơn, trang trí', 'HOÀN THIỆN'],
    ['30', 'Trần', 'HOÀN THIỆN'], ['05', 'Đào đắp đất', 'PHẦN NGẦM'], ['24', 'Cửa đi, cửa cuốn', 'HOÀN THIỆN'], ['00', 'Chưa phân loại', 'CHƯA PHÂN LOẠI']];
  const maCua = ten => /^(Bê tông|BT|Đổ bê tông|Cốt thép|Thép|Sản xuất|Ván khuôn|Cốp pha|Lắp dựng)/.test(ten) ? '11' : /^Xây/.test(ten) ? '14' : /^(Trát|Lát)/.test(ten) ? '28'
    : /^Sơn/.test(ten) ? '29' : /^(Trần|Thi công trần)/.test(ten) ? '30' : /^Đào/.test(ten) ? '05' : '00';
  // loại công việc (w) và cấu kiện (e): cột mã hóa theo từ điển, như khối db của 2_XU_LY
  const loaiCua = ten => /^(Bê tông|BT|Đổ bê tông)/.test(ten) ? 'Bê tông' : /^(Cốt thép|Thép|Sản xuất)/.test(ten) ? 'Cốt thép' : /^(Ván khuôn|Cốp pha|Lắp dựng)/.test(ten) ? 'Ván khuôn'
    : /^Xây/.test(ten) ? 'Xây' : /^Trát/.test(ten) ? 'Trát' : /^Lát/.test(ten) ? 'Lát' : /^Sơn/.test(ten) ? 'Sơn' : /^(Trần|Thi công trần)/.test(ten) ? 'Trần' : /^Đào/.test(ten) ? 'Đào đất' : null;
  const ckCua = ten => /móng/i.test(ten) ? 'Móng' : /cột/i.test(ten) ? 'Cột' : /tường/i.test(ten) ? 'Tường' : null;
  const coNRM = (db, nrm) => {
    db.nrm2 = nrm.map(x => x.slice()); db.cols.n = db.cols.name.map(ten => nrm.findIndex(x => x[0] === maCua(ten)));
    for (const [k, fn] of [['w', loaiCua], ['e', ckCua]]) { const d = db.dicts[k] = []; db.cols[k] = db.cols.name.map(ten => { const v = fn(ten); if (v === null) return -1; let j = d.indexOf(v); if (j < 0) j = d.push(v) - 1; return j; }); }
    return db;
  };
  const dst = coNRM(makeDB(), NRM), n0 = dst.count;
  const PL = require('../assets/price-lib.js');
  const ten = ['Bê tông móng M300 đá 1x2', 'Lát gạch 600x600', 'Sơn nước tường ngoài nhà 2 lớp phủ', 'Cửa đi thép chống cháy 2 cánh', 'Hạng mục xyz không rõ', 'Sơn nước tường ngoài nhà 2 lớp phủ'];
  const kho = PL.toDB(ten.map((d, k) => ({ project_id: 'p1', description: d, unit_raw: k === 0 ? 'm3' : 'm2', unit_norm: k === 0 ? 'm3' : 'm2', unit_price: 100000 + k, created_at: '2026-11-11T00:00:00Z' })), [{ id: 'p1', name: 'Dự án mới' }]);
  assert.ok(!kho.cols.n);   // Kho giá chỉ có mô tả, đơn vị, đơn giá
  const r = DXG.mergeDB(dst, kho, 'Kho giá');
  assert.deepStrictEqual(r.phanLoai, { khopTen: 2, knn: 2, tuKhoa: 1, chua: 1, loaiCV: 4, cauKien: 3 });
  // loại công việc / cấu kiện cũng được xếp ở cùng bước (khớp nhóm, khớp tên, kNN); không đủ chắc thì để trống
  const tu = (k, j) => dst.cols[k][n0 + j] >= 0 ? dst.dicts[k][dst.cols[k][n0 + j]] : '';
  assert.deepStrictEqual(ten.map((_, j) => tu('w', j)), ['Bê tông', 'Lát', 'Sơn', '', '', 'Sơn']);
  assert.deepStrictEqual(ten.map((_, j) => tu('e', j)), ['Móng', '', 'Tường', '', '', 'Tường']);
  const ma = k => dst.nrm2[dst.cols.n[n0 + k]][0], cach = k => dst.cols.src[n0 + k] >= 0 ? dst.dicts.src[dst.cols.src[n0 + k]] : '';
  assert.deepStrictEqual(ten.map((_, k) => ma(k)), ['11', '28', '29', '24', '00', '29']);
  assert.deepStrictEqual(ten.map((_, k) => cach(k)), ['Khớp tên đã phân loại', 'Khớp tên đã phân loại', 'Tự động kNN', 'Theo từ khóa', '', 'Tự động kNN']);
  assert.ok(dst.cols.n.every(v => Number.isInteger(v)));   // không còn null (null vào Int32Array thành 0 = nhóm NRM2 đầu tiên)
  assert.ok(dst.cols.src.slice(0, n0).every(v => v === -1));   // dòng có sẵn không bị đổi
  Object.keys(dst.cols).forEach(k => assert.strictEqual(dst.cols[k].length, dst.count, k));
  assert.ok(!Object.keys(dst).includes('_nrm') && !JSON.stringify(dst).includes('"_nrm"'));   // mô hình phân loại không lọt vào dữ liệu
  // nạp lại cùng mốc (Kho giá): dùng lại mô hình, kết quả như cũ
  for (const k of Object.keys(dst.cols)) dst.cols[k].length = n0;
  dst.count = n0; dst.projects.length -= 1;
  assert.deepStrictEqual(DXG.mergeDB(dst, kho, 'Kho giá').phanLoai, r.phanLoai);
  // nguồn có cột n + danh mục NRM2 thứ tự khác: ánh xạ theo mã, mã dst chưa có thì thêm vào danh mục
  const a = coNRM(makeDB(), NRM), b = coNRM(makeDB(), [['99', 'Nhóm riêng của nguồn', 'KHÁC'], ...NRM.slice().reverse()]);
  b.cols.n[0] = 0;
  const na = a.count; DXG.mergeDB(a, b, 'Đối thủ');
  for (let i = 1; i < b.count; i++) if (b.nrm2[b.cols.n[i]][0] !== '00') assert.strictEqual(a.nrm2[a.cols.n[na + i]][0], b.nrm2[b.cols.n[i]][0], b.cols.name[i]);
  assert.strictEqual(a.nrm2[a.cols.n[na]][0], '99'); assert.strictEqual(a.nrm2.length, NRM.length + 1);
  // CSDL không có cột n / danh mục NRM2: bỏ qua bước phân loại
  const c = makeDB(); assert.deepStrictEqual(DXG.mergeDB(c, kho, 'Kho giá').phanLoai, { khopTen: 0, knn: 0, tuKhoa: 0, chua: 0, loaiCV: 0, cauKien: 0 }); assert.ok(!c.cols.n && !c.cols.src);
  // từ khóa dùng chung với CTG
  assert.strictEqual(DXG.nrm2ByKeyword('Tháo dỡ ván khuôn móng'), '11'); assert.strictEqual(DXG.nrm2ByKeyword('abc xyz'), null);
  // mô tả BOQ dài (Kho giá): công việc chính nêu đầu mô tả thắng cụm phụ đứng sau; quy tắc ưu tiên (cốp pha…) vẫn thắng
  const dai = 'CCLD Cửa đi 2 cánh chống cháy hệ khung thép, tấm thép dày 1mm ốp 2 mặt';
  assert.strictEqual(DXG.nrm2ByKeyword(dai), '28'); assert.strictEqual(DXG.nrm2ByKeyword(dai, true), '24');
  assert.strictEqual(DXG.nrm2ByKeyword('CCLD hàng rào thép hộp cao 1.5m, sơn chống rỉ hoàn thiện', true), '36');
  assert.strictEqual(DXG.nrm2ByKeyword('Lắp dựng tháo dỡ ván khuôn cột', true), '11');
});

console.log(`\n${n} nhóm kiểm thử đạt.`);
