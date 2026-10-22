'use strict';
// Kiểm thử công cụ làm sạch CSDL và train khớp: node tests/test_hoc.js <thư mục tạm>   (cần python3 + openpyxl)
const assert = require('assert');
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const DXG = require('../assets/pricing.js');
const { taoDB } = require('../demo/du_lieu_mau.js');

const WORK = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'dxg-hoc-')));
fs.mkdirSync(WORK, { recursive: true });
const HOC = path.join(__dirname, '..', 'hoc');
const node = (...a) => execFileSync('node', a).toString();
let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓', name); };

// CSDL bẩn: thêm dòng trùng, giá 0, giá nhập sai đơn vị (×1000), đơn vị lạ, dòng chưa có nhóm, dòng "Tổng cộng"
const db = taoDB(), C = db.cols, D = db.dicts, N0 = db.count;
const push = (i, patch) => { for (const k of Object.keys(C)) C[k].push(k in patch ? patch[k] : C[k][i]); db.count++; };
const iSon = C.name.findIndex(x => /^Sơn tường trong/.test(x));
push(iSon, {}); push(iSon, {});                                   // 2 bản trùng hệt
push(iSon, { p26: 0, cp: 0, tot: 0 });                            // giá không hợp lệ
push(iSon, { p26: C.p26[iSon] * 1000, cp: C.cp[iSon] * 1000, tot: C.tot[iSon] * 1000, ol: -1, st: 0, y: 2026 });   // ngoại lai chưa đánh dấu
D.u.push('m2 (sàn)?'); push(iSon, { u: D.u.length - 1, name: 'Sơn tường trong nhà loại tốt', p26: 70000, cp: 70000 });   // đơn vị lạ
D.cu.push('m3'); const iVK = C.name.findIndex(x => x === 'Ván khuôn móng');
push(iVK, { name: 'Lắp dựng tháo dỡ ván khuôn móng băng', g: -1, gn: -1, p26: 190000, cp: 190000 });               // chưa có nhóm
push(iSon, { name: 'Tổng cộng', p26: 5e8, cp: 5e8 });
fs.writeFileSync(path.join(WORK, 'db_ban.js'), 'window.DB = ' + JSON.stringify(db) + ';\n');

t('làm sạch: phát hiện đúng các loại lỗi', () => {
  const out = path.join(WORK, 'ls');
  node(path.join(HOC, 'lam_sach.js'), '--db', path.join(WORK, 'db_ban.js'), '--out', out, '--sua', path.join(WORK, 'db_sach.js'), '--gan-nhom');
  const r = JSON.parse(fs.readFileSync(path.join(out, 'lam_sach.json'), 'utf8'));
  assert.ok(r.trung.n >= 2, 'trùng ' + JSON.stringify(r.trung));
  assert.strictEqual(r.gia.n, 1);
  assert.ok(r.ngoailai.n >= 1);
  assert.ok(r.donvi_la && r.donvi_la.n >= 1);
  assert.ok(r.chua_nhom && r.chua_nhom.n >= 1);
  assert.ok(r.ten_xau && r.ten_xau.n >= 1);
  assert.ok(fs.statSync(path.join(out, 'BAO_CAO_LAM_SACH.xlsx')).size > 3000);
});
t('làm sạch --sua: bỏ trùng / giá 0, đánh dấu ngoại lai, gán nhóm; CSDL gốc giữ nguyên', () => {
  const txt = fs.readFileSync(path.join(WORK, 'db_sach.js'), 'utf8');
  const s = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
  assert.strictEqual(s.count, db.count - s.lam_sach.bo);
  assert.ok(s.lam_sach.bo >= 3 && s.lam_sach.ngoai_lai >= 1 && s.lam_sach.gan_nhom === 1, JSON.stringify(s.lam_sach));
  for (const a of Object.values(s.cols)) assert.strictEqual(a.length, s.count);
  const k = s.cols.name.indexOf('Lắp dựng tháo dỡ ván khuôn móng băng');
  assert.strictEqual(s.cols.g[k], C.g[iVK]);
  const big = s.cols.p26.findIndex(p => p === C.p26[iSon] * 1000);
  assert.ok(s.cols.ol[big] >= 0 && s.dicts.ol[s.cols.ol[big]] === 'Ngoại lai (làm sạch tự động)');
  assert.strictEqual(DXG.buildIndex(s).groups.find(g => g.name === 'Sơn tường trong nhà 1 lót 2 phủ').rows.length,
    DXG.buildIndex(db).groups.find(g => g.name === 'Sơn tường trong nhà 1 lót 2 phủ').rows.length - 2);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(WORK, 'db_ban.js'), 'utf8').slice(11, -2)).count, db.count);
});

t('train: cặp khớp Excel + phiên QS → mô hình .dxgl, đo trước / sau', () => {
  execFileSync('python3', [path.join(HOC, 'tao_cap_mau.py'), WORK]);
  // phiên QS: một mô tả lạ QS đã chọn nhóm "Đào đất hố móng bằng máy"
  const IX = DXG.buildIndex(taoDB()), g = IX.groups.find(x => x.name === 'Đào đất hố móng bằng máy');
  fs.writeFileSync(path.join(WORK, 'phien.dgbq'), JSON.stringify({ dinh_dang: 'DGBQ3', items: [
    { id: 'S|9', picked: true, gkey: g.key, d: 'Công tác hố đào cơ giới khu A', u: 'm3', n: '', gn: g.name, gu: g.unit, auto: null },
    { id: 'S|10', picked: false, gkey: g.key, d: 'không phải QS chọn', u: 'm3', gn: g.name, gu: g.unit },
  ] }));
  const out = path.join(WORK, 'hoc');
  const txt = node(path.join(HOC, 'hoc.js'), '--cap', path.join(WORK, 'CapKhop_mau.xlsx'), '--phien', path.join(WORK, 'phien.dgbq'), '--out', out);
  const r = JSON.parse(fs.readFileSync(path.join(out, 'hoc.json'), 'utf8'));
  assert.strictEqual(r.cap, 53, txt);
  assert.strictEqual(r.khong_nhom, 0);
  assert.ok(r.da_hoc.top1 === 1 && r.da_hoc.fill === 1 && r.da_hoc.sai === 0, JSON.stringify(r.da_hoc));
  assert.ok(r.moi.top1 >= r.truoc.top1 - 1e-9 && r.moi.sai <= r.truoc.sai + 1e-9, 'học không làm kém đi với mô tả mới');
  const m = JSON.parse(fs.readFileSync(path.join(out, 'hoc_khop.dxgl'), 'utf8'));
  assert.strictEqual(m.dinh_dang, 'DXGL1');
  assert.strictEqual(m.cap.length, 50);   // 53 dòng, 3 dòng lặp lại được cộng dồn
  assert.ok(m.cap.some(c => c.so === 2));
  // mô hình dùng được ngay trong lõi
  DXG.applyLearn(IX, m);
  const top = DXG.match(IX, { desc: 'Công tác hố đào cơ giới khu A', unit: 'm3' })[0];
  assert.strictEqual(top.g, g.id); assert.strictEqual(top.learned, 'exact');
});
t('train: nhóm không có trong CSDL được liệt kê; cộng dồn mô hình cũ + từ đồng nghĩa', () => {
  execFileSync('python3', ['-c', `from openpyxl import Workbook
wb = Workbook(); ws = wb.active
ws.append(['Mô tả', 'Đơn vị', 'Nhóm đúng']); ws.append(['Hố đào thủ công', 'm3', 'Nhóm không tồn tại']); ws.append(['Hố đào máy', 'm3', 'Đào đất hố móng bằng máy'])
wb.save('${path.join(WORK, 'cap2.xlsx')}')
wb = Workbook(); ws = wb.active; ws.append(['Từ', 'Nghĩa chuẩn']); ws.append(['hố đào', 'đào móng']); wb.save('${path.join(WORK, 'dn.xlsx')}')`]);
  const out = path.join(WORK, 'hoc2');
  node(path.join(HOC, 'hoc.js'), '--cap', path.join(WORK, 'cap2.xlsx'), '--mo-hinh', path.join(WORK, 'hoc', 'hoc_khop.dxgl'), '--dong-nghia', path.join(WORK, 'dn.xlsx'), '--out', out);
  const r = JSON.parse(fs.readFileSync(path.join(out, 'hoc.json'), 'utf8'));
  assert.strictEqual(r.khong_nhom, 1);
  const m = JSON.parse(fs.readFileSync(path.join(out, 'hoc_khop.dxgl'), 'utf8'));
  assert.strictEqual(m.cap.length, 51);
  assert.deepStrictEqual(m.dong_nghia, [['hố đào', 'đào móng']]);
  DXG.setSynonyms();
});
t('công cụ học / làm sạch gộp thêm nguồn giá (--them), như trang Điền giá', () => {
  const { makeDoiThu } = require('./fixture_db.js');
  fs.writeFileSync(path.join(WORK, 'doithu.js'), 'window.DT = ' + JSON.stringify(makeDoiThu()) + ';\n');
  const out = path.join(WORK, 'hoc3');
  const txt = node(path.join(HOC, 'hoc.js'), '--cap', path.join(WORK, 'CapKhop_mau.xlsx'), '--them', path.join(WORK, 'doithu.js'), '--out', out);
  assert.ok(/Gộp nguồn Đối thủ \(doithu\.js\): 171 dòng/.test(txt), txt);
  const ls = path.join(WORK, 'ls3');
  node(path.join(HOC, 'lam_sach.js'), '--them', path.join(WORK, 'doithu.js') + '=Đối thủ', '--out', ls, '--nhanh');
  assert.ok(fs.existsSync(path.join(ls, 'BAO_CAO_LAM_SACH.xlsx')));
  assert.throws(() => execFileSync('node', [path.join(HOC, 'lam_sach.js'), '--them', path.join(WORK, 'doithu.js'), '--sua', path.join(WORK, 'x.js')], { stdio: 'pipe' }));
});
t('đủ ba nguồn: --du-lieu (thư mục data) và --goi (gói .dgbw); CTG đã có trong khối db thì không gộp lần nữa', () => {
  const { makeDoiThu, makeDB } = require('./fixture_db.js');
  // khối db của 2_XU_LY: Nội bộ + CTG làm sạch chung (cột ng); thư mục data có thêm doithu.js và một ctg.js cũ
  const nb = makeDB(); nb.dicts.ng = ['Nội bộ', 'CTG']; nb.cols.ng = nb.cols.name.map((_, i) => i % 3 === 2 ? 1 : 0);
  const them = (i, patch) => { for (const k of Object.keys(nb.cols)) nb.cols[k].push(k in patch ? patch[k] : nb.cols[k][i]); nb.count++; };
  them(2, {}); them(0, { name: 'Tổng cộng', p26: 5e8, cp: 5e8 });   // dòng CTG trùng hệt, dòng "Tổng cộng" Nội bộ
  const dt = makeDoiThu(), dir = path.join(WORK, 'data');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'db.js'), 'window.DB = ' + JSON.stringify(nb) + ';\n');
  fs.writeFileSync(path.join(dir, 'doithu.js'), 'window.DT = ' + JSON.stringify(dt) + ';\n');
  fs.writeFileSync(path.join(dir, 'ctg.js'), 'window.CTG = ' + JSON.stringify(makeDB()) + ';\n');
  const txt = node(path.join(HOC, 'hoc.js'), '--cap', path.join(WORK, 'CapKhop_mau.xlsx'), '--du-lieu', dir, '--out', path.join(WORK, 'hoc4'));
  assert.ok(/Gộp nguồn Đối thủ \(doithu\.js\): 171 dòng/.test(txt) && /Nguồn CTG \(ctg\.js\): đã có trong CSDL/.test(txt), txt);
  // làm sạch: cột Nguồn từng dòng lỗi, Tóm tắt đếm theo nguồn
  const ls = path.join(WORK, 'ls4');
  node(path.join(HOC, 'lam_sach.js'), '--du-lieu', dir, '--out', ls, '--nhanh');
  const xl = execFileSync('python3', ['-c', `import sys,json
from openpyxl import load_workbook
w = load_workbook(sys.argv[1]); s = w['Tóm tắt']; hr = next(r for r in range(1, 10) if s.cell(r, 1).value == 'Loại lỗi')
o = {'tt': [c.value for c in s[hr]], 'note': s.cell(2, 1).value, 'dem': {s.cell(r, 1).value: [s.cell(r, c).value for c in (3, 4, 5)] for r in range(hr + 1, s.max_row + 1)}}
o['src'] = set()
for n in w.worksheets[1:]:   # sheet lỗi theo dòng: cột Nguồn sau Dự án
  h = next((r for r in range(1, 10) if n.cell(r, 1).value == 'Dòng CSDL'), None)
  if h: o['nl'] = [c.value for c in n[h]]; o['src'] |= {n.cell(r, 3).value for r in range(h + 1, n.max_row + 1)}
o['src'] = sorted(o['src'])
print(json.dumps(o, ensure_ascii=False))`, path.join(ls, 'BAO_CAO_LAM_SACH.xlsx')]).toString();
  const r = JSON.parse(xl);
  assert.deepStrictEqual(r.tt.slice(0, 5), ['Loại lỗi', 'Số mục', 'Nội bộ', 'CTG', 'Đối thủ'], xl);
  assert.ok(/\(Nội bộ \d+ · CTG \d+ · Đối thủ 171\)/.test(r.note), r.note);
  assert.ok(r.dem && r.dem['Dòng trùng hệt'][1] === 1 && r.dem['Mô tả không rõ'][0] >= 1, xl);   // đếm theo nguồn: [Nội bộ, CTG, Đối thủ]
  assert.deepStrictEqual(r.nl.slice(0, 3), ['Dòng CSDL', 'Dự án', 'Nguồn'], xl);
  assert.ok(r.src.includes('Nội bộ') && r.src.includes('CTG') && r.src.every(x => ['Nội bộ', 'CTG', 'Đối thủ'].includes(x)), xl);
  // --sua: chỉ khối db (Nội bộ + CTG), không trộn đối thủ vào bản sửa
  const sua = node(path.join(HOC, 'lam_sach.js'), '--du-lieu', dir, '--out', path.join(WORK, 'ls5'), '--sua', path.join(WORK, 'db_sach4.js'), '--nhanh');
  assert.ok(/--sua: chỉ soát và sửa CSDL chính, không gộp Đối thủ, CTG/.test(sua), sua);
  const s4 = JSON.parse(fs.readFileSync(path.join(WORK, 'db_sach4.js'), 'utf8').replace(/^window\.DB = /, '').replace(/;\s*$/, ''));
  assert.deepStrictEqual(s4.dicts.ng, ['Nội bộ', 'CTG']); assert.ok(s4.count <= nb.count);
  // --goi: đọc thẳng gói admin (khối db + doithu), mật khẩu qua DGW_MAT_KHAU
  const goi = path.join(WORK, 'admin.dgbw');
  execFileSync('node', ['-e', `require(${JSON.stringify(path.join(__dirname, '../../ctg/tests/mau.js'))}).goiMau({ db: [JSON.parse(process.argv[1]), 'admin'], doithu: [JSON.parse(process.argv[2]), 'admin'] }).then(g => require('fs').writeFileSync(process.argv[3], JSON.stringify(g)))`,
    JSON.stringify(nb), JSON.stringify(dt), goi]);
  const env = { ...process.env, DGW_MAT_KHAU: 'matkhau' };
  const g = execFileSync('node', [path.join(HOC, 'hoc.js'), '--cap', path.join(WORK, 'CapKhop_mau.xlsx'), '--goi', goi, '--user', 'admin', '--out', path.join(WORK, 'hoc5')], { env }).toString();
  assert.ok(/Gộp nguồn Đối thủ \(admin\.dgbw \(khối doithu\)\): 171 dòng/.test(g), g);
  const r5 = JSON.parse(fs.readFileSync(path.join(WORK, 'hoc4', 'hoc.json'), 'utf8')), r6 = JSON.parse(fs.readFileSync(path.join(WORK, 'hoc5', 'hoc.json'), 'utf8'));
  assert.deepStrictEqual(r6.truoc, r5.truoc);   // cùng dữ liệu với --du-lieu → cùng kết quả khớp
  assert.throws(() => execFileSync('node', [path.join(HOC, 'hoc.js'), '--goi', goi, '--user', 'admin', '--out', path.join(WORK, 'hoc6')], { env: { ...env, DGW_MAT_KHAU: 'sai' }, stdio: 'pipe' }), /Sai mật khẩu/);
});
console.log(`\n${n} nhóm kiểm thử công cụ học đạt.`);
