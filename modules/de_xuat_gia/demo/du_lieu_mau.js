'use strict';
/* CSDL đơn giá GIẢ LẬP cho chạy thử (cùng định dạng window.DB của app tra cứu). Không phải dữ liệu thật.
   ~40 nhóm công việc, 12 dự án ở 5 tỉnh/TP, báo giá 2020–2026; giá đã quy về 2026 (p26) có dao động,
   có giá ngoại lai và dòng REVIEW như dữ liệu thực tế. */
function taoDB() {
  // [tên đại diện, đơn vị, giá 2026 (VNĐ), các cách ghi khác trong báo giá]
  const CV = [
    ['Đào đất hố móng bằng máy', 'm3', 48000, ['Đào móng bằng máy đào 0,8m3', 'Đào đất hố móng bằng cơ giới', 'Đào đất móng công trình bằng máy']],
    ['Đắp đất hoàn trả hố móng, đầm chặt K90', 'm3', 62000, ['Đắp đất hố móng đầm K90', 'Lấp đất hố móng, đầm chặt']],
    ['Vận chuyển đất thừa đi đổ', 'm3', 95000, ['Vận chuyển đất đổ đi bằng ô tô', 'Chở đất thừa ra khỏi công trường']],
    ['Ép cọc BTCT 300x300', 'm', 185000, ['Ép cọc bê tông cốt thép 30x30', 'Thi công ép cọc 300x300']],
    ['Bê tông lót móng M150 đá 4x6', 'm3', 1180000, ['Bê tông lót móng đá 4x6 mác 150', 'BT lót móng M150', 'Bê tông lót đá 4x6 M150 dày 100']],
    ['Bê tông móng M300 đá 1x2', 'm3', 1720000, ['Bê tông móng mác 300 đá 1x2', 'Bê tông thương phẩm móng M300', 'Đổ bê tông đài móng M300']],
    ['Bê tông cột M300 đá 1x2', 'm3', 1850000, ['Bê tông cột mác 300', 'Bê tông thương phẩm cột M300 đá 1x2']],
    ['Bê tông dầm sàn M300 đá 1x2', 'm3', 1790000, ['Bê tông dầm, sàn mác 300', 'Bê tông thương phẩm dầm sàn M300']],
    ['Cốt thép móng D<=10', 'kg', 21500, ['Sản xuất lắp dựng cốt thép móng D<=10', 'Cốt thép móng đường kính ≤10mm']],
    ['Cốt thép móng D<=18', 'kg', 20800, ['Sản xuất lắp dựng cốt thép móng D<=18', 'Cốt thép móng đường kính ≤18mm']],
    ['Cốt thép cột D>18', 'kg', 20600, ['Sản xuất lắp dựng cốt thép cột D>18', 'Thép cột đường kính >18mm']],
    ['Cốt thép dầm sàn D<=10', 'kg', 21900, ['Sản xuất lắp dựng cốt thép dầm sàn D<=10', 'Thép sàn D10']],
    ['Ván khuôn móng', 'm2', 185000, ['Lắp dựng tháo dỡ ván khuôn móng', 'Cốp pha móng', 'Ván khuôn gỗ móng']],
    ['Ván khuôn cột', 'm2', 235000, ['Lắp dựng tháo dỡ ván khuôn cột', 'Cốp pha cột']],
    ['Ván khuôn dầm sàn', 'm2', 215000, ['Lắp dựng tháo dỡ ván khuôn dầm sàn', 'Cốp pha dầm sàn']],
    ['Xây tường gạch đặc dày 220', 'm3', 1480000, ['Xây tường gạch đặc 220mm vữa M75', 'Xây gạch đặc tường 220']],
    ['Xây tường gạch rỗng dày 100', 'm2', 265000, ['Xây tường gạch ống 100mm', 'Xây tường gạch rỗng 4 lỗ dày 100']],
    ['Xây tường gạch bê tông nhẹ AAC dày 200', 'm3', 1650000, ['Xây tường gạch AAC 200', 'Xây gạch bê tông khí chưng áp dày 200']],
    ['Trát tường trong dày 15mm', 'm2', 98000, ['Trát tường trong vữa M75 dày 1,5cm', 'Trát tường trong 15mm']],
    ['Trát tường ngoài dày 20mm', 'm2', 125000, ['Trát tường ngoài vữa M75 dày 2cm', 'Trát tường ngoài 20mm']],
    ['Sơn tường trong nhà 1 lót 2 phủ', 'm2', 68000, ['Sơn nước tường trong 1 lớp lót 2 lớp phủ', 'Sơn tường trong']],
    ['Sơn tường ngoài nhà 1 lót 2 phủ', 'm2', 92000, ['Sơn nước tường ngoài 1 lớp lót 2 lớp phủ', 'Sơn tường ngoài']],
    ['Bả matit tường trong', 'm2', 38000, ['Bả matít tường trong 2 lớp', 'Bả bột tường trong']],
    ['Trần thạch cao khung chìm', 'm2', 265000, ['Thi công trần thạch cao khung chìm tấm 9mm', 'Trần thạch cao phẳng khung chìm']],
    ['Trần thạch cao chống ẩm khung chìm', 'm2', 310000, ['Trần thạch cao chống ẩm tấm 9mm khung chìm', 'Trần chống ẩm khung chìm']],
    ['Lát gạch ceramic 600x600', 'm2', 335000, ['Lát nền gạch ceramic 600x600', 'Lát gạch 600x600']],
    ['Lát gạch granite 800x800', 'm2', 495000, ['Lát nền gạch granite 800x800', 'Lát gạch porcelain 800x800']],
    ['Ốp gạch ceramic tường 300x600', 'm2', 345000, ['Ốp tường gạch 300x600', 'Ốp gạch ceramic WC 300x600']],
    ['Chống thấm sàn vệ sinh màng khò nóng', 'm2', 225000, ['Chống thấm sàn WC màng bitum khò nóng', 'Chống thấm sàn vệ sinh bằng màng khò']],
    ['Chống thấm sàn mái gốc xi măng', 'm2', 175000, ['Chống thấm mái gốc xi măng 2 thành phần', 'Chống thấm sàn mái']],
    ['Cửa đi nhôm hệ kính cường lực 8mm', 'm2', 2650000, ['Cửa nhôm hệ kính cường lực 8mm', 'Cửa đi nhôm Xingfa kính 8mm']],
    ['Cửa sổ nhôm kính 6.38mm', 'm2', 2350000, ['Cửa sổ nhôm Xingfa kính dán 6.38', 'Cửa sổ nhôm kính an toàn']],
    ['Lan can inox 304', 'm', 1150000, ['Lan can inox 304 cao 1m1', 'Tay vịn lan can inox']],
    ['Mái tôn mạ màu dày 0.45', 'm2', 235000, ['Lợp mái tôn mạ màu 0.45mm', 'Tôn lợp mái dày 0,45']],
    ['Kết cấu thép nhà xưởng', 'kg', 32000, ['Gia công lắp dựng kết cấu thép', 'Sản xuất lắp dựng khung kèo thép']],
    ['Sơn chống cháy kết cấu thép 60 phút', 'm2', 285000, ['Sơn chống cháy thép R60', 'Sơn chống cháy 60 phút cho kết cấu thép']],
    ['Nền bê tông cốt thép dày 200 M300', 'm2', 495000, ['Nền BTCT dày 200 mác 300', 'Bê tông nền nhà xưởng dày 200']],
    ['Đá granite mặt bậc cầu thang', 'm2', 1250000, ['Ốp lát đá granite bậc thang', 'Đá granite cầu thang']],
    ['Vách ngăn vệ sinh compact HPL 12mm', 'm2', 1350000, ['Vách vệ sinh compact 12mm', 'Vách ngăn WC compact HPL']],
    ['Vận chuyển phế thải đi đổ', 'chuyến', 1450000, ['Vận chuyển xà bần đi đổ', 'Chở phế thải xây dựng']],
  ];
  const DA = [
    ['DA01', 'Nhà xưởng Tân Uyên', 'Nhà xưởng', 'Bình Dương', 'TP Hồ Chí Minh'],
    ['DA02', 'Nhà xưởng Nhơn Trạch', 'Nhà xưởng', 'Đồng Nai', 'Đồng Nai'],
    ['DA03', 'Nhà xưởng Đức Hòa', 'Nhà xưởng', 'Long An', 'Tây Ninh'],
    ['DA04', 'Văn phòng Quận 7', 'Văn phòng', 'TP Hồ Chí Minh', 'TP Hồ Chí Minh'],
    ['DA05', 'Văn phòng Cầu Giấy', 'Văn phòng', 'Hà Nội', 'Hà Nội'],
    ['DA06', 'Chung cư Thủ Đức', 'Nhà ở', 'TP Hồ Chí Minh', 'TP Hồ Chí Minh'],
    ['DA07', 'Chung cư Long Biên', 'Nhà ở', 'Hà Nội', 'Hà Nội'],
    ['DA08', 'Trường học Dĩ An', 'Trường học', 'Bình Dương', 'TP Hồ Chí Minh'],
    ['DA09', 'Nhà xưởng Bắc Ninh', 'Nhà xưởng', 'Bắc Ninh', 'Bắc Ninh'],
    ['DA10', 'Văn phòng Biên Hòa', 'Văn phòng', 'Đồng Nai', 'Đồng Nai'],
    ['DA11', 'Trường học Gò Vấp', 'Trường học', 'TP Hồ Chí Minh', 'TP Hồ Chí Minh'],
    ['DA12', 'Nhà ở Thuận An', 'Nhà ở', 'Bình Dương', 'TP Hồ Chí Minh'],
  ];
  const projects = DA.map(d => [d[0], d[1], d[2], d[3], d[4], 'CĐT giả lập']);
  const YEAR_OF = [2020, 2021, 2022, 2022, 2023, 2023, 2024, 2024, 2025, 2025, 2026, 2026];
  const ESC = { 2020: 0.82, 2021: 0.86, 2022: 0.91, 2023: 0.94, 2024: 0.97, 2025: 0.99, 2026: 1 };   // giá gốc = p26 × ESC
  const REGION = { 'Hà Nội': 1.04, 'Bắc Ninh': 1.02 };
  const cols = { name: [], spec: [], u: [], cu: [], g: [], gn: [], p26: [], cp: [], tot: [], y: [], p: [], st: [], ol: [], warn: [], mat: [], lab: [], c: [], f: [] };
  const D = { u: [], cu: [], g: [], gn: [], st: ['OK', 'REVIEW'], ol: ['Ngoại lai cao', 'Ngoại lai thấp'], warn: ['Giá bất thường'], c: ['NCC giả lập'], f: ['bao_gia_gia_lap.xlsx'] };
  const idx = (dict, v) => { let k = dict.indexOf(v); if (k < 0) { dict.push(v); k = dict.length - 1; } return k; };
  let seed = 20261018; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const gauss = () => { let s = 0; for (let k = 0; k < 6; k++) s += rnd(); return (s - 3) / 1.2; };   // ~N(0,1)
  CV.forEach(([rep, unit, price, vars], gi) => {
    const g = idx(D.g, rep), gn = idx(D.gn, rep);
    const n = 8 + Math.floor(rnd() * 12);
    for (let k = 0; k < n; k++) {
      const pi = Math.floor(rnd() * DA.length), y = YEAR_OF[Math.floor(rnd() * YEAR_OF.length)];
      let v = price * (REGION[DA[pi][3]] || 1) * (1 + 0.17 * gauss());   // độ phân tán ~10% như thị trường
      let ol = -1, st = 0;
      if (k === n - 1 && rnd() < 0.6) { v *= rnd() < 0.5 ? 2.6 : 0.35; ol = v > price ? 0 : 1; }   // giá nhập sai / ngoại lai
      else if (rnd() < 0.05) st = 1;                                                               // dòng REVIEW
      const name = k % 3 === 0 ? rep : vars[k % vars.length];
      cols.name.push(name); cols.spec.push(''); cols.u.push(idx(D.u, unit)); cols.cu.push(idx(D.cu, unit));
      cols.g.push(g); cols.gn.push(gn); cols.p26.push(Math.round(v)); cols.cp.push(Math.round(v)); cols.tot.push(Math.round(v * ESC[y]));
      cols.y.push(y); cols.p.push(pi); cols.st.push(st); cols.ol.push(ol); cols.warn.push(-1);
      const ms = 0.55 + 0.2 * rnd();
      cols.mat.push(Math.round(v * ESC[y] * ms)); cols.lab.push(Math.round(v * ESC[y] * (1 - ms))); cols.c.push(0); cols.f.push(0);
    }
  });
  return { built: '2026-10-01 (giả lập)', baseYear: 2026, count: cols.name.length, cols, dicts: D, projects, nrm2: [] };
}
module.exports = { taoDB };
