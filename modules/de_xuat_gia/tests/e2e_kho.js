'use strict';
/* Kiểm thử nguồn "Kho giá" trên bản đã dựng docs/ (Chromium, CSP + cổng đăng nhập thật, Supabase GIẢ LẬP bằng page.route):
   • dòng Kho giá chỉ có mô tả, đơn vị, đơn giá → khi gộp vào dữ liệu nội bộ được xếp nhóm NRM2
     (khớp tên đã phân loại → tự động kNN → theo từ khóa), lọc được theo "Nhóm công việc NRM2" và "Nguồn phân loại NRM2";
   • lưu thêm giá (napLaiKho): dòng mới cũng được phân loại, bộ lọc đang chọn được giữ, đối thủ vẫn ẩn.
   Dùng: node modules/de_xuat_gia/tests/e2e_kho.js <thư mục tạm>. Gói dữ liệu là giả lập. */
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const { execFileSync } = require('child_process');
let pw; try { pw = require('playwright'); } catch { pw = require(path.join(execFileSync('npm', ['root', '-g']).toString().trim(), 'playwright')); }
const { goiMau } = require('../../ctg/tests/mau.js');
const { makeDB, makeDoiThu, fullDB } = require('./fixture_db.js');

const DOCS = path.resolve(__dirname, '../../../docs');
const WORK = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'kho-e2e-')));
fs.mkdirSync(WORK, { recursive: true });
const SB = 'https://jzwmzpwcpjvhpylkhapg.supabase.co';

function serve(dir) {
  const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  return http.createServer((req, res) => {
    const p = path.join(dir, decodeURIComponent(req.url.split('?')[0]));
    if (!p.startsWith(dir) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
  }).listen(0);
}
let fails = 0; const check = (ok, text) => { console.log(`  ${ok ? '✓' : '✗'} ${text}`); if (!ok) fails++; };
const dem = async page => +(await page.textContent('#count')).replace(/^.*· ([\d.]+) dòng.*$/s, '$1').replace(/\./g, '');
const chips = page => page.$$eval('#chips .chip', cs => cs.map(c => c.textContent.replace('✕', '').replace(/:\s*/, ': ').trim()));

// Danh mục NRM2 + nhóm của từng dòng dữ liệu nội bộ giả lập (như khối db đã qua bước phân loại của 2_XU_LY)
const NRM = [['11', 'Bê tông đổ tại chỗ', 'KẾT CẤU'], ['14', 'Khối xây', 'HOÀN THIỆN'], ['28', 'Hoàn thiện sàn/tường/trần', 'HOÀN THIỆN'], ['29', 'Sơn, trang trí', 'HOÀN THIỆN'],
  ['30', 'Trần', 'HOÀN THIỆN'], ['05', 'Đào đắp đất', 'PHẦN NGẦM'], ['24', 'Cửa đi, cửa cuốn', 'HOÀN THIỆN'], ['00', 'Chưa phân loại', 'CHƯA PHÂN LOẠI']];
const maCua = ten => /^(Bê tông|BT|Đổ bê tông|Cốt thép|Thép|Sản xuất|Ván khuôn|Cốp pha|Lắp dựng)/.test(ten) ? '11' : /^Xây/.test(ten) ? '14' : /^(Trát|Lát)/.test(ten) ? '28'
  : /^Sơn/.test(ten) ? '29' : /^(Trần|Thi công trần)/.test(ten) ? '30' : /^Đào/.test(ten) ? '05' : '00';
const loaiCua = ten => /^(Bê tông|BT|Đổ bê tông)/.test(ten) ? 'Bê tông' : /^(Cốt thép|Thép|Sản xuất)/.test(ten) ? 'Cốt thép' : /^(Ván khuôn|Cốp pha|Lắp dựng)/.test(ten) ? 'Ván khuôn'
  : /^Xây/.test(ten) ? 'Xây' : /^Trát/.test(ten) ? 'Trát' : /^Lát/.test(ten) ? 'Lát' : /^Sơn/.test(ten) ? 'Sơn' : /^(Trần|Thi công trần)/.test(ten) ? 'Trần' : /^Đào/.test(ten) ? 'Đào đất' : null;
const coNRM = db => {
  db.nrm2 = NRM.map(x => x.slice()); db.cols.n = db.cols.name.map(ten => NRM.findIndex(x => x[0] === maCua(ten)));
  const d = db.dicts.w = []; db.cols.w = db.cols.name.map(ten => { const v = loaiCua(ten); if (v === null) return -1; let j = d.indexOf(v); if (j < 0) j = d.push(v) - 1; return j; });
  return db;
};

(async () => {
  const db = coNRM(fullDB(makeDB())), dt = coNRM(fullDB(makeDoiThu()));
  const goi = path.join(WORK, 'admin_kho.dgbw');
  fs.writeFileSync(goi, JSON.stringify(await goiMau({ db: [db, 'admin'], doithu: [dt, 'admin'] })));

  // Supabase giả lập: đăng nhập, danh sách dự án, lô đơn giá mới nhất
  const PID = '11111111-2222-3333-4444-555555555555';
  const dong = (d, u, gia) => ({ id: 'r' + Math.random(), project_id: PID, description: d, desc_search: d.toLowerCase(), unit_raw: u, unit_norm: u, multi_unit: false, unit_price: gia, source_file: 'kho.xlsx', created_at: '2026-11-11T00:00:00Z' });
  let kho = [dong('Bê tông móng M300 đá 1x2', 'm3', 1700000), dong('Sơn nước tường ngoài nhà 2 lớp phủ', 'm2', 70000), dong('Cửa đi thép chống cháy 2 cánh', 'bộ', 9500000), dong('Hạng mục xyz không rõ', 'm2', 12345)];
  const duAn = { id: PID, name: 'Dự án mới', loai_hinh: 'Nhà xưởng', tinh: null, created_at: '2026-11-11T00:00:00Z' };
  const token = ['x', Buffer.from(JSON.stringify({ app_metadata: { role: 'admin' } })).toString('base64url'), 'x'].join('.');
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  const srv = serve(DOCS), base = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  const errs = []; page.on('pageerror', e => errs.push(e.stack || e.message));
  page.on('console', m => { if (['error', 'warning'].includes(m.type()) && /Content Security|Refused|Error/i.test(m.text())) errs.push(m.text()); });
  await page.route(SB + '/**', route => {
    const req = route.request(), u = new URL(req.url()), json = (body, status = 200) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (u.pathname === '/auth/v1/token') return json({ access_token: token, refresh_token: 'r', expires_in: 3600, user: { email: 'admin@example.com' } });
    if (u.pathname === '/rest/v1/dxg_projects') {
      if (req.method() === 'PATCH') Object.assign(duAn, JSON.parse(req.postData()));   // sửa loại hình / tỉnh
      return json([duAn]);
    }
    if (u.pathname === '/rest/v1/dxg_price_lookup_latest') return json(+u.searchParams.get('offset') ? [] : kho);
    return json([]);
  });
  await page.addInitScript(() => { try { localStorage.setItem('dxg_cloud_email', 'admin@example.com'); } catch (e) { } });

  console.log('admin: dữ liệu nội bộ + đối thủ đã phân loại NRM2, Kho giá chưa phân loại');
  await page.goto(base);
  await page.setInputFiles('#gate-file', goi);
  await page.fill('#gate-user', 'admin'); await page.fill('#gate-pass', 'matkhau');
  await page.click('#gate-go');
  await page.waitForSelector('#splash', { state: 'detached', timeout: 30000 });
  const nrmKho = () => page.evaluate(() => {
    const D = window.DB, C = D.cols, ng = D.dicts.ng.indexOf('Kho giá'), out = [];
    for (let i = 0; i < D.count; i++) if (C.ng[i] === ng) out.push([C.name[i], C.n[i] >= 0 ? D.nrm2[C.n[i]][0] : '', C.src && C.src[i] >= 0 ? D.dicts.src[C.src[i]] : '', C.w[i] >= 0 ? D.dicts.w[C.w[i]] : '']);
    return out;
  });
  const r1 = await nrmKho();
  check(JSON.stringify(r1) === JSON.stringify([['Bê tông móng M300 đá 1x2', '11', 'Khớp tên đã phân loại', 'Bê tông'], ['Sơn nước tường ngoài nhà 2 lớp phủ', '29', 'Tự động kNN', 'Sơn'],
    ['Cửa đi thép chống cháy 2 cánh', '24', 'Theo từ khóa', ''], ['Hạng mục xyz không rõ', '00', '', '']]), 'dòng Kho giá qua bước phân loại khi gộp: ' + r1.map(x => `NRM2 ${x[1]} (${x[2] || 'chưa xếp được'}), loại công việc "${x[3]}"`).join(' · '));
  check(await dem(page) === db.count + kho.length, `Tra cứu mặc định: Nội bộ + Kho giá (${await dem(page)} dòng), đối thủ ẩn`);
  // bộ lọc NRM2: nhóm 29 có cả dòng Kho giá
  const nhan29 = await page.$$eval('#facets label, #facets-adv label', ls => ls.map(l => l.textContent.replace(/\s+/g, ' ').trim()).filter(t => /^29 · /.test(t)));
  check(nhan29.length === 1, 'bộ lọc "Nhóm công việc NRM2" có nhóm 29: ' + nhan29.join(' | '));
  const cachPL = await page.$$eval('#facets label, #facets-adv label', ls => ls.map(l => l.textContent.replace(/\s+/g, ' ').trim()).filter(t => /^(Khớp tên đã phân loại|Tự động kNN|Theo từ khóa)/.test(t)));
  check(cachPL.length === 3, 'bộ lọc "Nguồn phân loại NRM2": ' + cachPL.join(' | '));
  await page.fill('#q', 'sơn nước tường ngoài'); await page.waitForTimeout(400);
  await page.click('#glist .grp-h'); await page.waitForSelector('#glist .grp-b:not([hidden]) tbody tr');
  await page.click('#glist .grp-b:not([hidden]) tbody tr'); await page.waitForSelector('#drawer:not([hidden])');
  const kv = (await page.textContent('#drawer-body')).replace(/\s+/g, ' ');
  check(/NRM2\s*29 · Sơn, trang trí \(Tự động kNN\)/.test(kv), 'chi tiết dòng Kho giá ghi nhóm NRM2 và cách phân loại');
  await page.click('#drawer-close');

  console.log('lưu thêm giá vào Kho (napLaiKho)');
  await page.fill('#q', ''); await page.waitForTimeout(400);
  const truoc = await chips(page);
  kho = [...kho, dong('Trần thạch cao khung chìm tấm 9mm', 'm2', 255000), dong('Lát gạch 600x600', 'm2', 300000)];
  const kq = await page.evaluate(() => window.CostCheck.napLaiKho());
  check(kq.status === 'ok' && kq.dong === kho.length && JSON.stringify(kq.phanLoai) === JSON.stringify({ khopTen: 2, knn: 2, tuKhoa: 1, chua: 1, loaiCV: 4, cauKien: 0 }), 'nạp lại Kho giá: ' + JSON.stringify(kq.phanLoai));
  const r2 = await nrmKho();
  check(r2.length === kho.length && r2[4][1] === '30' && r2[4][3] === 'Trần' && r2[5][1] === '28' && r2[5][3] === 'Lát', `dòng mới cũng được phân loại: ${r2[4][0]} → ${r2[4][1]} / ${r2[4][3]}, ${r2[5][0]} → ${r2[5][1]} / ${r2[5][3]}`);
  const sau = await chips(page);
  check(JSON.stringify(sau) === JSON.stringify(truoc) && await dem(page) === db.count + kho.length, `giữ bộ lọc đang chọn (${sau.join(', ')}), đối thủ vẫn ẩn: ${await dem(page)} dòng`);
  console.log('loại hình dự án / tỉnh của dự án Kho giá');
  const daKho = () => page.evaluate(() => { const D = window.DB, i = D.cols.ng.lastIndexOf(D.dicts.ng.indexOf('Kho giá')), p = D.projects[D.cols.p[i]]; return [p[1], p[2], p[4]]; });
  check(JSON.stringify(await daKho()) === JSON.stringify(['Dự án mới', 'Nhà xưởng', '']), 'dự án Kho giá mang loại hình đã lưu: ' + (await daKho()).join(' | '));
  await page.click('.topnav [data-sec="dien-gia"]'); await page.waitForSelector('#step-lib:not([hidden])', { timeout: 20000 });
  await page.waitForFunction(() => document.querySelector('#lib-q-proj') && document.querySelector('#lib-q-proj').options.length > 1);
  await page.fill('#lib-proj', 'Dự án mới'); await page.dispatchEvent('#lib-proj', 'change');
  check(await page.inputValue('#lib-type') === 'Nhà xưởng', 'chọn dự án đã lưu: điền sẵn loại hình đang lưu');
  await page.fill('#lib-type', 'Văn phòng'); await page.fill('#lib-prov', 'Đồng Nai');
  await page.click('#lib-info');
  await page.waitForFunction(() => /Đã cập nhật loại hình/.test(document.querySelector('#lib-st').textContent), null, { timeout: 20000 });
  check(JSON.stringify(await daKho()) === JSON.stringify(['Dự án mới', 'Văn phòng', 'Đồng Nai']), 'sửa loại hình / tỉnh không cần nạp lại file: ' + (await daKho()).join(' | ') + ' — ' + (await page.textContent('#lib-st')).trim().slice(0, 150));
  check(!errs.length, 'không lỗi trang / CSP' + (errs.length ? ': ' + errs.join(' | ') : ''));

  await browser.close(); srv.close();
  console.log(fails ? `${fails} kiểm tra KHÔNG đạt.` : 'Đạt.');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
