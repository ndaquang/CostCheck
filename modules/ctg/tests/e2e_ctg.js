'use strict';
/* Kiểm thử bản đã dựng docs/ với gói .dgbw có khối "ctg" (Chromium, CSP + cổng đăng nhập thật):
   • admin: đăng nhập MỘT lần, chuyển qua lại Dữ liệu nội bộ / CTG / Đối thủ ngay trong trang (không tải lại, không đăng nhập lại);
     CTG: tra cứu, vật tư / nhân công, xuất Excel; mục Điền giá BOQ vẫn dùng dữ liệu nội bộ; gói chưa có khối ctg → báo cách thêm.
   • mở thẳng index.html?ds=ctg (sau khi tải lại trang) vẫn chạy, chuyển về dữ liệu nội bộ có đủ các mục.
   • nhân viên: không thấy "CTG", mở thẳng ?ds=ctg bị đưa về dữ liệu nội bộ.
   Dùng: node modules/ctg/tests/e2e_ctg.js <thư mục tạm>. Gói dữ liệu là giả lập. */
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const { execFileSync } = require('child_process');
let pw; try { pw = require('playwright'); } catch { pw = require(path.join(execFileSync('npm', ['root', '-g']).toString().trim(), 'playwright')); }
const { taoCSDL } = require('../ctg.js');
const { goiCTG } = require('../dong_goi.js');
const { luoiMau, goiMau } = require('./mau.js');
const { makeDB, fullDB } = require('../../de_xuat_gia/tests/fixture_db.js');

const DOCS = path.resolve(__dirname, '../../../docs');
const WORK = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'ctg-e2e-')));
fs.mkdirSync(WORK, { recursive: true });

function serve(dir) {
  const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  return http.createServer((req, res) => {
    const p = path.join(dir, decodeURIComponent(req.url.split('?')[0]));
    if (!p.startsWith(dir) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
  }).listen(0);
}
const login = async (page, url, goi, user, doi = true) => {
  await page.goto(url);
  await page.setInputFiles('#gate-file', goi);
  await page.fill('#gate-user', user); await page.fill('#gate-pass', 'matkhau');
  await page.click('#gate-go');
  if (doi) await page.waitForSelector('#splash', { state: 'detached', timeout: 20000 });
};
const navHien = page => page.$$eval('.topnav a', as => as.filter(a => a.offsetParent).map(a => a.textContent.trim() + (a.dataset.ds && a.classList.contains('on') ? '*' : '')).join(' | '));
const chuyen = async (page, sel, tieuDe) => { await page.click(sel); await page.waitForFunction(t => document.querySelector('.brand .title').textContent === t, tieuDe, { timeout: 20000 }); await page.waitForTimeout(300); };
let DXG_NOI_BO;   // module Điền giá BOQ đã khởi tạo trên dữ liệu nội bộ (loại hình dự án của CSDL giả lập)
let fails = 0; const check = (ok, text) => { console.log(`  ${ok ? '✓' : '✗'} ${text}`); if (!ok) fails++; };

(async () => {
  const noiBo = fullDB(makeDB()), doiThu = fullDB(makeDB());
  doiThu.cols.name = doiThu.cols.name.map(n => n + ' (đối thủ)'); doiThu.dicts.gn = doiThu.dicts.gn.map(n => n + ' (đối thủ)');
  const goc = await goiMau({ db: [noiBo, 'nv'], doithu: [doiThu, 'admin'] });
  const coCTG = path.join(WORK, 'admin_ctg.dgbw'), khongCTG = path.join(WORK, 'admin.dgbw');
  fs.writeFileSync(khongCTG, JSON.stringify(goc));
  fs.writeFileSync(coCTG, JSON.stringify(goiCTG(goc, taoCSDL(luoiMau()).db, 'admin', 'matkhau')));
  const srv = serve(DOCS), base = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await pw.chromium.launch();

  console.log('admin: chuyển bộ dữ liệu ngay trong trang');
  const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1360, height: 900 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (['error', 'warning'].includes(m.type()) && /Content Security|Refused|Error/i.test(m.text())) errs.push(m.text()); });
  let taiTrang = 0; page.on('load', () => taiTrang++);
  await login(page, base, coCTG, 'admin');
  taiTrang = 0;
  check(await navHien(page) === 'Tra cứu | Điểm rơi giá | Phân tích | Điền giá BOQ | CTG | Đối thủ', 'dữ liệu nội bộ: ' + await navHien(page));
  await page.fill('#q', 'be tong'); await page.waitForTimeout(400);

  await chuyen(page, '.topnav a.nav-ctg', 'CSDL chiết tính giá');
  check(taiTrang === 0 && !(await page.$('#gate')), 'bấm CTG: không tải lại trang, không đăng nhập lại');
  check(/\?ds=ctg(#|$)/.test(page.url()) && await page.evaluate(() => document.documentElement.classList.contains('ds-ctg')), 'địa chỉ trang ghi ?ds=ctg: ' + page.url().replace(/^.*\//, ''));
  check(await navHien(page) === 'Dữ liệu nội bộ | CTG* | Đối thủ', 'thanh điều hướng: ' + await navHien(page));
  check(await page.isHidden('#sec-drop') && await page.isHidden('#sec-analysis') && await page.isHidden('#sec-dxg'), 'chỉ tra cứu: Điền giá BOQ / Điểm rơi / Phân tích ẩn');
  check(await page.inputValue('#q') === 'be tong' && /cho “be tong”/.test(await page.textContent('#count')), 'giữ từ khóa đang tìm khi chuyển: ' + (await page.textContent('#count')).trim());
  const meta = (await page.textContent('#db-meta')).trim();
  check(/^66 đơn giá · 4 dự án · 4 file nguồn · cập nhật \d\d\/\d\d\/\d{4} \d\d:\d\d$/.test(meta), 'thông tin CSDL: ' + meta);
  check(await page.$$eval('#facets .opt .lbl', ls => ls.some(l => l.textContent === '11 · Bê tông đổ tại chỗ')) && await page.$$eval('#facets .grp-h2', hs => hs.some(h => h.textContent === 'KẾT CẤU')), 'bộ lọc Nhóm công việc NRM2 theo nhóm');
  await page.fill('#q', 'bê tông lót'); await page.waitForTimeout(500);
  const dem = (await page.textContent('#count')).trim();
  const ten = await page.$$eval('#glist .gname', ns => ns.map(n => n.textContent));
  check(/^3 nhóm · 14 dòng đơn giá/.test(dem) && ten.every(t => /Bê tông lót/.test(t)), `tìm "bê tông lót": ${dem} — ${ten.join(' / ')}`);
  await page.click('#glist .grp-h');
  await page.waitForSelector('#glist .grp-b:not([hidden]) tbody tr');
  const chips = await page.$$eval('#glist .gsum .gs i', is => is.map(i => i.textContent));
  const ths = await page.$$eval('#glist table.dtl th', t => t.map(x => x.textContent));
  check(chips.includes('Vật tư') && chips.includes('Nhân công') && ths.join('|') === 'Năm|Dự án|Tên công việc (gốc trong BOQ)|Vật tư|Nhân công|Đơn giá gốc', 'mở nhóm: trung vị vật tư / nhân công, cột ' + ths.join(' | '));
  check(/chưa quy đổi theo năm/.test(await page.textContent('#glist .grp-b .small.muted')), 'ghi chú: giá gốc, chưa quy đổi theo năm');
  check((await page.textContent('#glist .gunit')).trim() === 'm3' && !(await page.textContent('#glist .grp-b tbody')).includes('≈'), 'nhóm có đơn vị; dòng không có dòng phụ "quy về năm"');
  check(!(await page.$('#glist [data-drop]')) || !(await page.isVisible('#glist [data-drop]')), 'không có liên kết điểm rơi giá');
  await page.screenshot({ path: path.join(WORK, 'ctg_tra_cuu.png') });
  await page.click('#glist .grp-b tbody tr');
  await page.waitForSelector('#drawer:not([hidden])');
  const kv = await page.$$eval('#drawer dt', d => d.map(x => x.textContent));
  check(kv.includes('Đơn giá vật liệu') && kv.includes('Đơn giá nhân công') && kv.includes('Mã dòng') && !kv.some(k => /^Quy về/.test(k)), 'chi tiết dòng: vật liệu, nhân công, mã công tác');
  await page.click('#drawer-close');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
  const xl = path.join(WORK, dl.suggestedFilename()); await dl.saveAs(xl);
  const hd = execFileSync('python3', ['-c', 'from openpyxl import load_workbook as L;import sys;w=L(sys.argv[1]);print(w["TONG_HOP"]["C1"].value, "|", w["CHI_TIET"]["C1"].value, "|", w["CHI_TIET"]["L1"].value, w["CHI_TIET"]["M1"].value)', xl]).toString().trim();
  check(hd === 'Đơn giá đại diện | Đơn giá | Đơn giá VL Đơn giá NC', 'xuất Excel: ' + hd);
  await page.click('#facets .opt input');   // chọn 1 bộ lọc: quay lại CTG vẫn còn
  await page.waitForTimeout(300);
  const demCTG = (await page.textContent('#count')).trim();

  await chuyen(page, '.topnav a.nav-dt', 'Đơn giá đối thủ');
  check(taiTrang === 0 && !(await page.$('#gate')), 'bấm Đối thủ: không tải lại trang, không đăng nhập lại');
  check(await navHien(page) === 'Dữ liệu nội bộ | CTG | Đối thủ*' && /\?ds=doithu(#|$)/.test(page.url()), 'đối thủ: ' + await navHien(page));
  await page.fill('#q', ''); await page.waitForTimeout(400);
  check(await page.$$eval('#glist .gname', ns => ns.length > 0 && ns.every(n => /đối thủ/.test(n.textContent))), 'hiện dữ liệu đối thủ');
  await page.click('#glist .grp-h'); await page.waitForSelector('#glist .grp-b:not([hidden]) tbody tr');
  check(!(await page.$$eval('#glist table.dtl th', t => t.some(x => x.textContent === 'Vật tư'))), 'đối thủ không có cột vật tư / nhân công');

  const t0 = Date.now();
  await chuyen(page, '.topnav a.nav-ctg', 'CSDL chiết tính giá');
  await page.fill('#q', 'bê tông lót'); await page.waitForTimeout(500);
  check((await page.textContent('#count')).trim() === demCTG && await page.$$eval('#facets .opt input:checked', i => i.length) === 1, `quay lại CTG: giữ bộ lọc đã chọn, không giải mã lại (${Date.now() - t0} ms): ${demCTG}`);

  await chuyen(page, '.topnav a.nav-noibo', 'Đơn giá BOQ');
  check(taiTrang === 0 && await navHien(page) === 'Tra cứu | Điểm rơi giá | Phân tích | Điền giá BOQ | CTG | Đối thủ' && !/ds=/.test(page.url()), 'về dữ liệu nội bộ: ' + await navHien(page));
  await page.click('.topnav [data-sec="dien-gia"]');
  await page.waitForSelector('#sec-dxg:not([hidden])');
  DXG_NOI_BO = () => /Nhà xưởng/.test(document.querySelector('#o-type .msel-list').textContent) && window.DB.cols.name[0] === window.DB.cols.name[0].replace(' (đối thủ)', '');
  await page.waitForFunction(DXG_NOI_BO);
  check(await page.evaluate(n => window.DB.count === n, noiBo.count), 'Điền giá BOQ dùng dữ liệu nội bộ (loại hình dự án: ' + (await page.textContent('#o-type .msel-list')).trim().replace(/\s+/g, ', ') + ')');
  await chuyen(page, '.topnav a.nav-ctg', 'CSDL chiết tính giá');
  check(await page.isHidden('#sec-dxg') && !(await page.isHidden('#sec-search')), 'đang ở Điền giá BOQ bấm CTG → ẩn Điền giá, mở tra cứu CTG');
  await chuyen(page, '.topnav a.nav-noibo', 'Đơn giá BOQ');
  check(taiTrang === 0 && !(await page.$('#gate')), 'cả phiên chỉ đăng nhập 1 lần, không tải lại trang');
  if (errs.length) { console.error('  LỖI:', errs); fails++; }
  await page.close();

  console.log('admin: gói chưa có khối ctg');
  const p3 = await browser.newPage();
  await login(p3, base, khongCTG, 'admin');
  await p3.click('.topnav a.nav-ctg');
  await p3.waitForFunction(() => /chưa có CSDL chiết tính giá/.test(document.querySelector('#toast').textContent));
  check((await p3.textContent('.brand .title')) === 'Đơn giá BOQ' && /dong_goi\.js/.test(await p3.textContent('#toast')), 'báo cách thêm, vẫn ở dữ liệu nội bộ: ' + (await p3.textContent('#toast')).slice(0, 60) + '…');
  await login(p3, base + '?ds=ctg', khongCTG, 'admin', false);
  await p3.waitForFunction(() => document.querySelector('#splash-err') && document.querySelector('#splash-err').textContent);
  check(/chưa có CSDL chiết tính giá.*dong_goi\.js/.test(await p3.textContent('#splash-err')), 'mở thẳng ?ds=ctg: báo cách thêm');
  await p3.close();

  console.log('admin: mở thẳng ?ds=ctg (sau khi tải lại trang)');
  const p4 = await browser.newPage();
  await login(p4, base + '?ds=ctg', coCTG, 'admin');
  check((await p4.textContent('.brand .title')) === 'CSDL chiết tính giá' && await navHien(p4) === 'Dữ liệu nội bộ | CTG* | Đối thủ', 'mở CTG: ' + await navHien(p4));
  await chuyen(p4, '.topnav a.nav-noibo', 'Đơn giá BOQ');
  await p4.click('.topnav [data-sec="dien-gia"]');
  await p4.waitForSelector('#sec-dxg:not([hidden])');
  await p4.waitForFunction(DXG_NOI_BO);
  check(await p4.evaluate(n => window.DB.count === n, noiBo.count), 'chuyển về dữ liệu nội bộ: có Điền giá BOQ, dùng dữ liệu nội bộ');
  await p4.close();

  console.log('nhân viên');
  const p2 = await browser.newPage();
  await login(p2, base, coCTG, 'nv1');
  const navs3 = await navHien(p2);
  check(navs3 === 'Tra cứu', 'không thấy CTG / Đối thủ: ' + navs3);
  await login(p2, base + '?ds=ctg', coCTG, 'nv1', false);
  await p2.waitForURL(u => !/ds=ctg/.test(u.toString()), { timeout: 10000 }).catch(() => {});
  check(!/ds=ctg/.test(p2.url()) && await p2.isVisible('#gate'), 'mở thẳng ?ds=ctg → về trang dữ liệu nội bộ: ' + p2.url().replace(/^.*\//, ''));
  await p2.close();

  await browser.close(); srv.close();
  console.log(fails ? `THẤT BẠI: ${fails}` : 'Đạt.');
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
