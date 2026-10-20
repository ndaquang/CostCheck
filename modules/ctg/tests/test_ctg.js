'use strict';
/* Kiểm thử CSDL chiết tính giá: chuyển sheet DATABASE → window.DB, phân loại NRM2, gộp đơn vị, gói khối "ctg" vào gói admin
   (giải mã lại như trình duyệt), chạy lệnh dong_goi.js trên file Excel giả lập.
   Dùng: node modules/ctg/tests/test_ctg.js [thư mục tạm]. Mọi dữ liệu là giả lập. */
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const { taoCSDL, phanLoai, donVi } = require('../ctg.js');
const { goiCTG } = require('../dong_goi.js');
const { luoiMau, goiMau, moNhuTrinhDuyet } = require('./mau.js');

let fails = 0;
const check = (ok, text) => { console.log(`  ${ok ? '✓' : '✗'} ${text}`); if (!ok) fails++; };
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };

(async () => {
  console.log('Chuyển sheet DATABASE');
  const grid = luoiMau();
  const { db, thongKe } = taoCSDL(grid, { built: '2026-10-20T06:42:00' });
  const C = db.cols, D = db.dicts;
  check(db.count === grid.length - 2 && thongKe.bo.length === 1 && thongKe.bo[0].ly_do === 'Tổng cộng ≤ 0', `bỏ dòng Tổng cộng ≤ 0: ${db.count} dòng, bỏ ${thongKe.bo.length}`);
  const cot = ['name', 'spec', 'par', 'dup', 'y', 'p', 'n', 'w', 'e', 'u', 'c', 'warn', 'chk', 'cur', 'f', 'tot', 'mat', 'lab', 'mac', 'g', 'gn', 'cu', 'code', 'sh', 'row', 'id', 'oname'];
  check(cot.every(k => Array.isArray(C[k]) && C[k].length === db.count), 'đủ các cột app tra cứu dùng, cùng độ dài');
  check(['p', 'f', 'u', 'cu', 'g', 'gn', 'warn', 'cur', 'sh', 'par', 'w', 'e', 'c', 'chk'].every(k => Array.isArray(D[k])) && db.projects.length === D.p.length && db.filePaths.length === D.f.length, 'đủ từ điển, dự án, đường dẫn file');
  check(db.built === '20/10/2026 06:42' && !C.p26 && !C.cp, 'ngày cập nhật dd/mm/yyyy hh:mm; giá giữ nguyên (không quy đổi năm)');
  const i0 = C.name.indexOf('Trát má cửa');
  check(C.mat[i0] > 0 && C.lab[i0] > 0 && C.tot[i0] === grid[8][6], 'giữ Tổng cộng, tách Vật tư / Nhân công');
  const lot = [...Array(db.count).keys()].filter(i => C.name[i] === 'Bê tông lót M150');
  check(lot.length === 6 && new Set(lot.map(i => C.g[i])).size === 1 && D.gn[C.gn[lot[0]]] === 'Bê tông lót M150', 'cùng tên + cùng đơn vị (m3 / M3) → một nhóm đại diện');
  check(lot.filter(i => C.warn[i] === 0).length === 1 && lot.filter(i => C.warn[i] === 1).length === 0, 'giá lệch > 3 lần trung vị nhóm → "Cao bất thường"');
  check(C.oname[lot[lot.length - 1]] === 'Lean concrete M150', 'giữ tên công việc gốc trước khi dịch');
  const hoGa = [...Array(db.count).keys()].filter(i => C.name[i].startsWith('Hố ga'));
  check(new Set(hoGa.map(i => D.u[C.u[i]])).size === 1 && D.u[C.u[hoGa[0]]] === 'cái', 'đơn vị nos / cái gộp làm một: ' + D.u[C.u[hoGa[0]]]);
  check(C.cu.every((k, i) => D.cu[k] === D.u[C.u[i]]), 'đơn vị chuẩn (cu) có trong từ điển, trùng đơn vị dòng');
  check(D.p.length === 4 && db.projects[0][1] === 'NHA XUONG A' && C.y[0] === 2024, 'dự án, năm lấy từ sheet');

  console.log('Phân loại NRM2');
  const ca = [
    ['Lắp dựng tháo dỡ ván khuôn cột', '11'], ['Trát má cửa', '28'], ['Hố ga xây gạch loại 3', '34'], ['Bê tông nhựa chặt BTNC 12.5', '35'],
    ['Cửa sổ nhôm sơn tĩnh điện kính cường lực', '23'], ['Lanh tô 180x180', '11'], ['Sơn cửa thép', '29'], ['Xây tường gạch dày 200 mm', '14'],
    ['Đào đất hố móng, đà kiềng', '05'], ['Cắt, đập và vận chuyển đầu cọc D350', '07'], ['Phá dỡ cột BTCT', '03'], ['Cửa thép chống cháy 60\'', '24'],
    ['Sơn chống cháy R90', '31'], ['Trồng cây cau vua', '37'], ['Trần thạch cao khung chìm dày 9mm', '30'], ['Lát đá granite ngạch cửa', '28'],
    ['Chống thấm bể XLNT, mặt trong', '34'], ['Quét chống thấm chuyên dụng 3 lớp - mái', '19'], ['Lắp đặt hố ga', '34'], ['Mục lạ không rõ', '00'],
  ];
  const sai = ca.filter(([t, m]) => phanLoai(t) !== m);
  check(!sai.length, `xếp đúng ${ca.length - sai.length}/${ca.length} mẫu` + (sai.length ? ': sai ' + sai.map(([t, m]) => `"${t}" → ${phanLoai(t)} (cần ${m})`).join('; ') : ''));
  check(phanLoai('Mục lạ', 'MC.FW-ABC') === '11' && phanLoai('Mục lạ', 'INF.MH-1') === '34', 'tên không khớp từ khóa → theo tiền tố "Mã công tác link"');
  check(donVi('Nos') === 'cái' && donVi('m²') === 'm2' && donVi('trọn gói') === 'gói' && donVi('cái 个') === 'cái' && donVi('100md') === '100m', 'chuẩn hóa đơn vị');
  check(throws(() => taoCSDL([['Tên', 'Giá'], ['a', 1]]), /thiếu cột/), 'sheet sai cấu trúc → báo thiếu cột');

  console.log('Gói khối "ctg" vào gói admin');
  const pkg = await goiMau({ db: [{ count: 1 }, 'nv'], doithu: [{ count: 2 }, 'admin'] });
  const moi = goiCTG(pkg, db, 'ADMIN', 'matkhau');
  check(moi.khoi.ctg && moi.khoi.ctg.khoa === 'admin', 'thêm khối ctg, khóa admin (tên đăng nhập không phân biệt hoa thường)');
  check(moi.khoi.db.du_lieu === pkg.khoi.db.du_lieu && moi.khoi.doithu.du_lieu === pkg.khoi.doithu.du_lieu && moi.users === pkg.users, 'các khối và tài khoản khác giữ nguyên');
  const lai = await moNhuTrinhDuyet(moi, 'admin', 'matkhau', 'ctg');
  check(lai.count === db.count && lai.cols.name[0] === C.name[0], 'giải mã lại bằng WebCrypto như trình duyệt: ' + lai.count + ' dòng');
  check(throws(() => goiCTG(pkg, db, 'admin', 'sai'), /Sai mật khẩu/), 'sai mật khẩu → dừng');
  check(throws(() => goiCTG(pkg, db, 'nv1', 'matkhau'), /không có khóa admin/), 'tài khoản nhân viên → dừng (không gói được dữ liệu admin)');
  check(throws(() => goiCTG({ ...pkg, users: pkg.users.filter(u => !u.khoa.admin) }, db, 'nv1', 'matkhau'), /không có khóa admin/), 'gói nhân viên → dừng');
  check(throws(() => goiCTG({ foo: 1 }, db, 'admin', 'matkhau'), /không phải gói dữ liệu/), 'tệp không phải gói .dgbw → dừng');
  const lan2 = goiCTG(moi, { ...db, count: db.count }, 'admin', 'matkhau');
  check(Object.keys(lan2.khoi).filter(k => k === 'ctg').length === 1 && lan2.khoi.ctg.du_lieu !== moi.khoi.ctg.du_lieu, 'chạy lại → thay khối ctg cũ');

  console.log('Lệnh dong_goi.js trên file Excel');
  const WORK = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'ctg-')));
  fs.mkdirSync(WORK, { recursive: true });
  const xlsx = path.join(WORK, 'DATABASE_CTG.xlsx'), goi = path.join(WORK, 'admin.dgbw');
  fs.writeFileSync(path.join(WORK, 'grid.json'), JSON.stringify(grid));
  execFileSync('python3', ['-c', `import json,sys
from openpyxl import Workbook
wb = Workbook(); ws = wb.active; ws.title = 'DATABASE'
for r in json.load(open(sys.argv[1], encoding='utf-8')): ws.append(r)
wb.create_sheet('DS_FILE').append(['Tên file', 'Tên dự án'])
wb.save(sys.argv[2])`, path.join(WORK, 'grid.json'), xlsx]);
  fs.writeFileSync(goi, JSON.stringify(pkg));
  const cli = path.join(__dirname, '..', 'dong_goi.js');
  const outTxt = execFileSync('node', [cli, '--xlsx', xlsx, '--goi', goi, '--user', 'admin', '--js', path.join(WORK, 'data', 'ctg.js')], { env: { ...process.env, DGW_MAT_KHAU: 'matkhau' } }).toString();
  const daGoi = JSON.parse(fs.readFileSync(goi, 'utf8'));
  check(/Thêm khối "ctg"/.test(outTxt) && daGoi.khoi.ctg && fs.existsSync(goi + '.truoc_ctg') && !JSON.parse(fs.readFileSync(goi + '.truoc_ctg', 'utf8')).khoi.ctg, 'ghi khối ctg vào gói, giữ gói cũ ở .truoc_ctg');
  check((await moNhuTrinhDuyet(daGoi, 'admin', 'matkhau', 'ctg')).count === db.count, 'gói ghi ra mở được bằng mật khẩu admin');
  check(/^window\.CTG = \{/.test(fs.readFileSync(path.join(WORK, 'data', 'ctg.js'), 'utf8')), '--js ghi data/ctg.js cho chế độ chạy thử');
  let loi = '';
  try { execFileSync('node', [cli, '--xlsx', xlsx, '--goi', goi, '--user', 'admin'], { env: { ...process.env, DGW_MAT_KHAU: 'sai' }, stdio: 'pipe' }); }
  catch (e) { loi = e.stderr.toString(); }
  check(/DỪNG: Sai mật khẩu/.test(loi) && JSON.parse(fs.readFileSync(goi, 'utf8')).khoi.ctg.du_lieu === daGoi.khoi.ctg.du_lieu, 'sai mật khẩu → dừng, gói không đổi');

  console.log(fails ? `THẤT BẠI: ${fails}` : 'Đạt.');
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
