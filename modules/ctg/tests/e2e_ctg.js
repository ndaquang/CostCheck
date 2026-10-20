'use strict';
/* Kiểm thử bản đã dựng docs/ với gói .dgbw có khối "ctg" (Chromium, CSP + cổng đăng nhập thật):
   • admin: thanh điều hướng có "CTG"; mở index.html?ds=ctg → CSDL chiết tính giá, tra cứu, vật tư / nhân công, xuất Excel;
     không có mục Điền giá BOQ; gói chưa có khối ctg → báo cách thêm.
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
let fails = 0; const check = (ok, text) => { console.log(`  ${ok ? '✓' : '✗'} ${text}`); if (!ok) fails++; };

(async () => {
  const goc = await goiMau({ db: [fullDB(makeDB()), 'nv'] });
  const coCTG = path.join(WORK, 'admin_ctg.dgbw'), khongCTG = path.join(WORK, 'admin.dgbw');
  fs.writeFileSync(khongCTG, JSON.stringify(goc));
  fs.writeFileSync(coCTG, JSON.stringify(goiCTG(goc, taoCSDL(luoiMau()).db, 'admin', 'matkhau')));
  const srv = serve(DOCS), base = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await pw.chromium.launch();

  console.log('admin');
  const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1360, height: 900 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (['error', 'warning'].includes(m.type()) && /Content Security|Refused|Error/i.test(m.text())) errs.push(m.text()); });
  await login(page, base, coCTG, 'admin');
  const navs = await page.$$eval('.topnav a', as => as.filter(a => a.offsetParent).map(a => a.textContent.trim()));
  check(navs.includes('CTG') && navs.indexOf('CTG') === navs.indexOf('Đối thủ') - 1, 'dữ liệu nội bộ: thanh điều hướng có "CTG" trước "Đối thủ": ' + navs.join(' | '));
  await Promise.all([page.waitForNavigation(), page.click('.topnav a.nav-ctg')]);
  check(/\?ds=ctg$/.test(page.url()), 'bấm CTG → ' + page.url().replace(/^.*\//, ''));
  await login(page, page.url(), coCTG, 'admin');
  check((await page.textContent('.brand .title')).trim() === 'CSDL chiết tính giá' && await page.evaluate(() => document.documentElement.classList.contains('ds-ctg')), 'tiêu đề "CSDL chiết tính giá"');
  const navs2 = await page.$$eval('.topnav a', as => as.map(a => a.textContent.trim() + (a.classList.contains('on') ? '*' : '')));
  check(navs2.join('|') === 'Dữ liệu nội bộ|CTG*|Đối thủ', 'chuyển bộ dữ liệu: ' + navs2.join(' | '));
  check(!(await page.$('#sec-dxg')) && await page.isHidden('#sec-drop') && await page.isHidden('#sec-analysis'), 'chỉ tra cứu: không có Điền giá BOQ / Điểm rơi / Phân tích');
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
  check(await page.getAttribute('.topnav a:last-child', 'href') === 'index.html?ds=doithu', 'liên kết sang Đối thủ');
  if (errs.length) { console.error('  LỖI:', errs); fails++; }

  console.log('admin, gói chưa có khối ctg');
  const p3 = await browser.newPage();
  await login(p3, base + '?ds=ctg', khongCTG, 'admin', false);
  await p3.waitForFunction(() => document.querySelector('#splash-err') && document.querySelector('#splash-err').textContent);
  check(/chưa có CSDL chiết tính giá.*dong_goi\.js/.test(await p3.textContent('#splash-err')), 'báo cách thêm: ' + (await p3.textContent('#splash-err')).slice(0, 70) + '…');
  await p3.close();

  console.log('nhân viên');
  const p2 = await browser.newPage();
  await login(p2, base, coCTG, 'nv1');
  const navs3 = await p2.$$eval('.topnav a', as => as.filter(a => a.offsetParent).map(a => a.textContent.trim()));
  check(!navs3.includes('CTG') && !navs3.includes('Đối thủ'), 'không thấy CTG / Đối thủ: ' + navs3.join(' | '));
  await login(p2, base + '?ds=ctg', coCTG, 'nv1', false);
  await p2.waitForURL(u => !/ds=ctg/.test(u.toString()), { timeout: 10000 }).catch(() => {});
  check(!/ds=ctg/.test(p2.url()) && await p2.isVisible('#gate'), 'mở thẳng ?ds=ctg → về trang dữ liệu nội bộ: ' + p2.url().replace(/^.*\//, ''));
  await p2.close();

  await browser.close(); srv.close();
  console.log(fails ? `THẤT BẠI: ${fails}` : 'Đạt.');
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
