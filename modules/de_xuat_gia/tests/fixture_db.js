'use strict';
/* Sinh cơ sở dữ liệu GIẢ LẬP cùng định dạng window.DB để kiểm thử (không phải dữ liệu thật). */
function makeDB() {
  const work = [
    // [tên đại diện, đơn vị, giá trung tâm, biến thể tên]
    ['Bê tông lót móng M150 đá 4x6', 'm3', 1150000, ['Bê tông lót móng đá 4x6 M150', 'BT lót móng M150', 'Bê tông lót đá 4x6 mác 150']],
    ['Bê tông móng M300 đá 1x2', 'm3', 1650000, ['Bê tông móng mác 300 đá 1x2', 'Đổ bê tông móng M300', 'Bê tông thương phẩm móng M300']],
    ['Bê tông cột M300 đá 1x2', 'm3', 1750000, ['Bê tông cột mác 300', 'Đổ bê tông cột M300 đá 1x2']],
    ['Cốt thép móng D<=10', 'kg', 21000, ['Sản xuất lắp dựng cốt thép móng D<=10', 'Cốt thép móng đường kính ≤10mm']],
    ['Cốt thép cột D>18', 'kg', 20500, ['Sản xuất lắp dựng cốt thép cột D>18', 'Thép cột đường kính >18mm']],
    ['Ván khuôn móng', 'm2', 180000, ['Lắp dựng tháo dỡ ván khuôn móng', 'Cốp pha móng']],
    ['Xây tường gạch đặc dày 220', 'm3', 1450000, ['Xây tường gạch đặc 220mm vữa M75', 'Xây gạch đặc tường 220']],
    ['Trát tường trong dày 15mm', 'm2', 95000, ['Trát tường trong vữa M75 dày 1,5cm', 'Trát tường trong 15mm']],
    ['Sơn tường trong nhà 1 lót 2 phủ', 'm2', 65000, ['Sơn nước tường trong 1 lớp lót 2 lớp phủ', 'Sơn tường trong']],
    ['Trần thạch cao khung chìm', 'm2', 260000, ['Thi công trần thạch cao khung chìm tấm 9mm', 'Trần thạch cao phẳng khung chìm']],
    ['Lát gạch ceramic 600x600', 'm2', 320000, ['Lát nền gạch ceramic 600x600', 'Lát gạch 600x600']],
    ['Đào đất móng bằng máy', 'm3', 45000, ['Đào móng bằng máy đào', 'Đào đất hố móng bằng cơ giới']],
  ];
  const projects = [
    ['P01', 'Nhà xưởng A', 'Nhà xưởng', 'Bình Dương', 'TP Hồ Chí Minh', 'CĐT A'],
    ['P02', 'Văn phòng B', 'Văn phòng', 'Hà Nội', 'Hà Nội', 'CĐT B'],
    ['P03', 'Nhà xưởng C', 'Nhà xưởng', 'Đồng Nai', 'Đồng Nai', 'CĐT C'],
    ['P04', 'Chung cư D', 'Nhà ở', 'TP Hồ Chí Minh', 'TP Hồ Chí Minh', 'CĐT D'],
  ];
  const cols = { name: [], spec: [], u: [], cu: [], g: [], gn: [], p26: [], cp: [], tot: [], y: [], p: [], st: [], ol: [], warn: [], mat: [], lab: [], c: [], f: [] };
  const D = { u: [], cu: [], g: [], gn: [], st: ['OK', 'REVIEW'], ol: ['Ngoại lai cao'], warn: ['Giá bất thường'], c: ['NCC 1'], f: ['file1.xlsx'] };
  const idx = (dict, v) => { let k = dict.indexOf(v); if (k < 0) { dict.push(v); k = dict.length - 1; } return k; };
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  work.forEach(([rep, unit, price, vars], gi) => {
    const g = idx(D.g, rep), gn = idx(D.gn, rep);
    for (let k = 0; k < 14; k++) {
      const name = k % 4 === 0 ? rep : vars[k % vars.length];
      const v = price * (0.8 + 0.4 * rnd());
      const out = k === 13;   // 1 giá ngoại lai mỗi nhóm
      const val = out ? v * 3 : v;
      cols.name.push(name); cols.spec.push(''); cols.u.push(idx(D.u, unit)); cols.cu.push(idx(D.cu, unit));
      cols.g.push(g); cols.gn.push(gn); cols.p26.push(Math.round(val)); cols.cp.push(Math.round(val)); cols.tot.push(Math.round(val * 0.9));
      cols.y.push(2021 + (k % 6)); cols.p.push(k % projects.length); cols.st.push(k === 12 ? 1 : 0);
      cols.ol.push(out ? 0 : -1); cols.warn.push(-1);
      cols.mat.push(Math.round(val * 0.9 * 0.7)); cols.lab.push(Math.round(val * 0.9 * 0.3)); cols.c.push(0); cols.f.push(0);
    }
  });
  // 1 dòng không có nhóm
  cols.name.push('Vận chuyển phế thải đi đổ'); cols.spec.push(''); cols.u.push(idx(D.u, 'chuyến')); cols.cu.push(idx(D.cu, 'chuyến'));
  cols.g.push(-1); cols.gn.push(-1); cols.p26.push(1500000); cols.cp.push(1500000); cols.tot.push(1500000); cols.y.push(2025); cols.p.push(0);
  cols.st.push(0); cols.ol.push(-1); cols.warn.push(-1); cols.mat.push(null); cols.lab.push(null); cols.c.push(0); cols.f.push(0);
  return { built: '2026-10-01', baseYear: 2026, count: cols.name.length, cols, dicts: D, projects, nrm2: [] };
}
if (typeof module === 'object') module.exports = { makeDB };
if (require.main === module) {
  const out = process.argv[2];
  require('fs').writeFileSync(out, 'window.DB = ' + JSON.stringify(makeDB()) + ';\n');
  console.log('wrote', out);
}
