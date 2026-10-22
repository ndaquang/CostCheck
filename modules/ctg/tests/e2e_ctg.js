'use strict';
/* Kiểm thử bản đã dựng docs/ với ba nguồn dữ liệu Nội bộ / CTG / Đối thủ (Chromium, CSP + cổng đăng nhập thật):
   • gói admin như 2_XU_LY: khối db có cột "Nguồn dữ liệu" (Nội bộ + CTG) + khối doithu → app gộp đối thủ khi nạp:
     Tra cứu mặc định Nội bộ + CTG (bỏ chip là hiện cả đối thủ), Điểm rơi giá so ba nguồn, Phân tích → So sánh nguồn,
     Điền giá BOQ dùng cả ba nguồn, mục Đối thủ chuyển ngay trong trang (không đăng nhập lại), xuất Excel có cột nguồn.
   • gói cũ: khối db chỉ Nội bộ + khối ctg của modules/ctg/dong_goi.js → CTG vẫn được gộp vào dữ liệu nội bộ.
   • địa chỉ cũ index.html?ds=ctg → dữ liệu nội bộ, lọc sẵn nguồn CTG.
   • nhân viên: chỉ Tra cứu, không gộp nguồn, không thấy Đối thủ.
   Dùng: node modules/ctg/tests/e2e_ctg.js <thư mục tạm>. Gói dữ liệu là giả lập. */
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const { execFileSync } = require('child_process');
let pw; try { pw = require('playwright'); } catch { pw = require(path.join(execFileSync('npm', ['root', '-g']).toString().trim(), 'playwright')); }
const { taoCSDL } = require('../ctg.js');
const { goiCTG } = require('../dong_goi.js');
const { luoiMau, goiMau } = require('./mau.js');
const { makeDB, makeDoiThu, fullDB } = require('../../de_xuat_gia/tests/fixture_db.js');

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
const chips = page => page.$$eval('#chips .chip', cs => cs.map(c => c.textContent.replace('✕', '').replace(/:\s*/, ': ').trim()));
const dem = async page => +(await page.textContent('#count')).replace(/^.*· ([\d.]+) dòng.*$/s, '$1').replace(/\./g, '');
let fails = 0; const check = (ok, text) => { console.log(`  ${ok ? '✓' : '✗'} ${text}`); if (!ok) fails++; };
const theoDoiLoi = page => { const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (['error', 'warning'].includes(m.type()) && /Content Security|Refused|Error/i.test(m.text())) errs.push(m.text()); }); return errs; };

(async () => {
  // Gói như 2_XU_LY: khối db Nội bộ + CTG (cột ng, CTG rẻ hơn ~10%), khối doithu (đắt hơn ~10%, thêm nhóm VRV)
  const db = fullDB(makeDB());
  db.dicts.ng = ['Nội bộ', 'CTG']; db.cols.ng = db.cols.name.map((_, i) => (i % 3 === 2 ? 1 : 0));
  db.cols.p26 = db.cols.p26.map((v, i) => (db.cols.ng[i] === 1 ? Math.round(v * 0.9) : v));
  const nNB = db.cols.ng.filter(v => v === 0).length, nCTG = db.count - nNB;
  const dt = fullDB(makeDoiThu());
  const moi = path.join(WORK, 'admin_3nguon.dgbw');
  fs.writeFileSync(moi, JSON.stringify(await goiMau({ db: [db, 'admin'], doithu: [dt, 'admin'] })));
  // Gói cũ: khối db chỉ Nội bộ (khóa nv, nhân viên mở được) + khối ctg (dong_goi.js) + khối doithu
  const noiBo = fullDB(makeDB()), ctg = taoCSDL(luoiMau()).db;
  const cu = path.join(WORK, 'admin_cu.dgbw');
  fs.writeFileSync(cu, JSON.stringify(goiCTG(await goiMau({ db: [noiBo, 'nv'], doithu: [dt, 'admin'] }), ctg, 'admin', 'matkhau')));
  const motNguon = path.join(WORK, 'admin_1nguon.dgbw');
  fs.writeFileSync(motNguon, JSON.stringify(await goiMau({ db: [noiBo, 'nv'] })));
  const srv = serve(DOCS), base = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await pw.chromium.launch();

  console.log('admin: gói khối db (Nội bộ + CTG) + khối doithu');
  const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1360, height: 900 } });
  const errs = theoDoiLoi(page);
  let taiTrang = 0; page.on('load', () => taiTrang++);
  await login(page, base, moi, 'admin');
  taiTrang = 0;
  check(await navHien(page) === 'Tra cứu | Điểm rơi giá | Phân tích | Điền giá BOQ | Đối thủ', 'thanh điều hướng (không còn mục CTG riêng): ' + await navHien(page));
  const meta = (await page.textContent('#db-meta')).trim();
  check(meta.startsWith(`${db.count + dt.count} đơn giá (Nội bộ ${nNB} · CTG ${nCTG} · Đối thủ ${dt.count})`), 'đếm theo nguồn: ' + meta);
  check(JSON.stringify(await chips(page)) === JSON.stringify(['Nguồn dữ liệu: Nội bộ', 'Nguồn dữ liệu: CTG']) && await dem(page) === db.count,
    `Tra cứu mặc định Nội bộ + CTG (${await dem(page)} dòng), đối thủ chưa hiện`);
  await page.click('#chips [data-chip]'); await page.click('#chips [data-chip]'); await page.waitForTimeout(300);
  check(await dem(page) === db.count + dt.count, `bỏ lọc nguồn → hiện cả đối thủ (${await dem(page)} dòng)`);
  await page.fill('#q', 'bê tông lót'); await page.waitForTimeout(400);
  await page.click('#glist .grp-h'); await page.waitForSelector('#glist .grp-b:not([hidden]) tbody tr');
  const gs = await page.$$eval('#glist .grp-b .gsum .gs i', is => is.map(i => i.textContent));
  check(['Nội bộ', 'CTG', 'Đối thủ'].every(l => gs.includes(l)), 'mở nhóm: trung vị từng nguồn — ' + gs.slice(0, 5).join(', '));
  check(await page.$$eval('#glist .grp-b .tag.src', ts => new Set(ts.map(t => t.textContent)).size === 2), 'dòng CTG / đối thủ có nhãn nguồn');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
  const xl = path.join(WORK, dl.suggestedFilename()); await dl.saveAs(xl);
  const cot = execFileSync('python3', ['-c', 'from openpyxl import load_workbook as L;import sys;w=L(sys.argv[1])["CHI_TIET"];print(w.cell(1, w.max_column).value, "|", sorted({str(w.cell(r, w.max_column).value) for r in range(2, w.max_row + 1)} - {"None"}))', xl]).toString().trim();
  check(cot === "Nguồn dữ liệu | ['CTG', 'Nội bộ', 'Đối thủ']", 'xuất Excel có cột nguồn: ' + cot);

  await page.click('.topnav [data-sec="diem-roi"]'); await page.waitForTimeout(300);
  check(/Nội bộ, CTG, Đối thủ/.test(await page.textContent('#sec-drop label.chk')) && await page.isVisible('#dp-both'), 'Điểm rơi giá: lọc "nhóm có giá từ 2 nguồn trở lên"');
  const vrv = await page.$$eval('#dp-list .dp-item', bs => bs.map(b => b.textContent).filter(t => /VRV/.test(t)));
  check(vrv.length === 1 && /chỉ Đối thủ/.test(vrv[0]), 'nhóm chỉ đối thủ có: ' + vrv[0]);
  await page.click('#dp-both'); await page.waitForTimeout(200);
  check(!(await page.$$eval('#dp-list .dp-item', bs => bs.some(b => /VRV/.test(b.textContent)))), 'bật lọc 2 nguồn: bỏ nhóm chỉ một nguồn');
  await page.click('#dp-list .dp-item'); await page.waitForTimeout(300);
  const kpi = await page.$$eval('#dp-view .kpi', ks => ks.map(k => k.textContent.replace(/\s+/g, ' ').trim()));
  check(kpi.some(k => /^CTG so với Nội bộ ?×0,\d\d ?-/.test(k)) && kpi.some(k => /^Đối thủ so với Nội bộ ?×1,\d\d ?\+/.test(k)), 'hệ số trung vị so với Nội bộ: ' + kpi.slice(2).join(' / '));
  check(await page.$$eval('#dp-view .dp-src button', bs => bs.map(b => b.textContent).join('|')) === 'Tất cả nguồn|Nội bộ|CTG|Đối thủ' && /CTG, Đối thủ rơi ở đâu/.test(await page.textContent('#dp-view')), 'so sánh điểm rơi ba nguồn');
  await page.click('#dp-view [data-dsrc="Đối thủ"]'); await page.waitForTimeout(200);
  check(/chỉ Đối thủ/.test(await page.textContent('#dp-view .dp-head')), 'xem riêng một nguồn');
  await page.screenshot({ path: path.join(WORK, 'diem_roi_3_nguon.png'), fullPage: true });

  await page.click('.topnav [data-sec="phan-tich"]');
  await page.waitForSelector('#tabs [data-tab="nguon"]');
  await page.waitForFunction(() => /không có khối "analysis"/.test(document.querySelector('#view').textContent));
  await page.click('#tabs [data-tab="nguon"]');
  await page.waitForSelector('#view table');
  const hang = await page.$$eval('#view .card.full', cs => [...cs[0].querySelectorAll('tbody tr')].map(r => [...r.cells].map(c => c.textContent.trim())));
  check(hang.map(r => r[0]).join('|') === 'Nội bộ|CTG|Đối thủ' && /^×0,[89]/.test(hang[1][5]) && /^×1,1/.test(hang[2][5]), 'Phân tích → So sánh nguồn (không cần analysis.js): ' + hang.map(r => `${r[0]} ${r[5]}`).join(', '));
  await page.click('#view [data-ngsrc="Đối thủ"]'); await page.waitForTimeout(200);
  const nhom = (await page.textContent('#view .card.full:last-of-type tbody tr td')).trim();
  await page.click('#view .card.full:last-of-type [data-drop]');
  await page.waitForSelector('#sec-drop:not([hidden])');
  check((await page.textContent('#dp-view .dp-name')).trim() === nhom, 'bấm "Điểm rơi →" mở đúng nhóm: ' + nhom);
  await page.screenshot({ path: path.join(WORK, 'so_sanh_nguon.png') });

  await page.click('.topnav [data-sec="dien-gia"]');
  await page.waitForSelector('#sec-dxg:not([hidden])');
  await page.waitForFunction(() => /Đối thủ/.test(document.querySelector('#dxg-src').textContent));
  const src = (await page.textContent('#dxg-src')).trim();
  check(new RegExp(`Nội bộ ${nNB} · CTG ${nCTG} · Đối thủ ${dt.count} báo giá`).test(src) && !/không có trong gói/.test(src), 'Điền giá BOQ dùng ba nguồn, không gộp trùng: ' + src);

  await page.click('.topnav a.nav-dt');
  await page.waitForFunction(() => document.querySelector('.brand .title').textContent === 'Đơn giá đối thủ', null, { timeout: 20000 });
  check(taiTrang === 0 && /\?ds=doithu(#|$)/.test(page.url()) && await navHien(page) === 'Dữ liệu nội bộ | Đối thủ*', 'mục Đối thủ ngay trong trang: ' + await navHien(page));
  check(/^171 đơn giá · 2 dự án/.test((await page.textContent('#db-meta')).trim()), 'mục Đối thủ: chỉ dữ liệu đối thủ');
  await page.click('.topnav a.nav-noibo');
  await page.waitForFunction(() => document.querySelector('.brand .title').textContent === 'Đơn giá BOQ', null, { timeout: 20000 });
  check(taiTrang === 0 && !(await page.$('#gate')), 'cả phiên chỉ đăng nhập 1 lần, không tải lại trang');
  if (errs.length) { console.error('  LỖI:', errs); fails++; }
  await page.close();

  console.log('admin: gói cũ có khối ctg (dong_goi.js), địa chỉ cũ ?ds=ctg');
  const p2 = await browser.newPage();
  const errs2 = theoDoiLoi(p2);
  await login(p2, base + '?ds=ctg', cu, 'admin');
  const m2 = (await p2.textContent('#db-meta')).trim();
  check(m2.startsWith(`${noiBo.count + ctg.count + dt.count} đơn giá (Nội bộ ${noiBo.count} · CTG ${ctg.count} · Đối thủ ${dt.count})`), 'khối ctg được gộp vào dữ liệu nội bộ: ' + m2);
  check(JSON.stringify(await chips(p2)) === JSON.stringify(['Nguồn dữ liệu: CTG']) && await dem(p2) === ctg.count && !/ds=/.test(p2.url()), `?ds=ctg → dữ liệu nội bộ lọc CTG (${await dem(p2)} dòng): ${p2.url().replace(/^.*\//, '')}`);
  await p2.fill('#q', 'bê tông lót'); await p2.waitForTimeout(400);
  await p2.click('#glist .grp-h'); await p2.waitForSelector('#glist .grp-b:not([hidden]) tbody tr');
  check(/≈ [\d.]+ \/m3 \(2026\)/.test(await p2.textContent('#glist .grp-b tbody')), 'giá CTG quy về năm gốc theo hệ số năm của dữ liệu nội bộ');
  if (errs2.length) { console.error('  LỖI:', errs2); fails++; }
  await p2.close();

  console.log('admin: gói chỉ có dữ liệu nội bộ');
  const p3 = await browser.newPage();
  await login(p3, base, motNguon, 'admin');
  check(!(await chips(p3)).length && !/\(Nội bộ/.test(await p3.textContent('#db-meta')), 'không lọc nguồn, không đếm theo nguồn');
  await p3.click('.topnav [data-sec="phan-tich"]'); await p3.click('#tabs [data-tab="nguon"]');
  check(/chỉ có một nguồn/.test(await p3.textContent('#view')), 'So sánh nguồn: báo dữ liệu chỉ có một nguồn');
  await p3.close();

  console.log('nhân viên');
  const p4 = await browser.newPage();
  const errs4 = theoDoiLoi(p4);
  await login(p4, base + '?ds=ctg', cu, 'nv1');
  check(await navHien(p4) === 'Tra cứu' && !(await chips(p4)).length && await dem(p4) === noiBo.count, `chỉ Tra cứu dữ liệu nội bộ, không gộp CTG / đối thủ (${await dem(p4)} dòng)`);
  await login(p4, base + '?ds=doithu', cu, 'nv1', false);
  await p4.waitForURL(u => !/ds=doithu/.test(u.toString()), { timeout: 10000 }).catch(() => {});
  check(!/ds=doithu/.test(p4.url()), 'mở thẳng ?ds=doithu → về trang dữ liệu nội bộ: ' + p4.url().replace(/^.*\//, ''));
  if (errs4.length) { console.error('  LỖI:', errs4); fails++; }
  await p4.close();

  await browser.close(); srv.close();
  console.log(fails ? `THẤT BẠI: ${fails}` : 'Đạt.');
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
