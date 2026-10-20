'use strict';
/* Kiểm thử đầu-cuối trên Chromium (dữ liệu giả lập) — quy trình ĐIỀN GIÁ TRỰC TIẾP vào BOQ:
   1. BOQ chưa có giá → giá đề xuất (P25) vào CỘT RIÊNG tô màu sau bảng; cột Đơn giá không bị ghi; nạp lại file đã xuất
      thì cột đề xuất không bị nhận nhầm là cột Đơn giá và xuất lại vào đúng cột cũ.
   2. Chế độ điền vào ô Đơn giá; LibreOffice tính lại: Thành tiền = KL × đơn giá vừa điền, Tổng cộng cập nhật.
   3. BOQ đã có một phần giá QS → ô có giá được giữ; ở chế độ cột riêng, giá QS và giá đề xuất nằm ở hai cột khác nhau.
   4. Đơn giá bổ sung → dòng trước đó không có tham khảo được điền theo giá bổ sung.
   5. Giá điền tay + lưu / khôi phục phiên.
   6. Dữ liệu học: lựa chọn nhóm của QS được lưu (.dxgl) và dùng lại khi khớp.
   Dùng: node tests/e2e.js <thư mục tạm>   (cần playwright, python3 + openpyxl, LibreOffice) */
const fs = require('fs'), path = require('path'), http = require('http');
const { execFileSync } = require('child_process');
let pw; try { pw = require('playwright'); } catch { pw = require(path.join(execFileSync('npm', ['root', '-g']).toString().trim(), 'playwright')); }

const MOD = path.resolve(__dirname, '..');
const WORK = path.resolve(process.argv[2] || fs.mkdtempSync('/tmp/dxg-'));
const SITE = path.join(WORK, 'site');
fs.rmSync(SITE, { recursive: true, force: true });
fs.cpSync(MOD, SITE, { recursive: true, filter: s => !s.includes(`${path.sep}tests`) && !s.includes(`${path.sep}demo`) });
fs.mkdirSync(path.join(SITE, 'data'), { recursive: true });
fs.writeFileSync(path.join(SITE, 'data', 'db.js'), 'window.DB = ' + JSON.stringify(require('./fixture_db.js').makeDB()) + ';');
execFileSync('python3', [path.join(__dirname, 'make_boq.py'), WORK]);
const py = (code, ...args) => execFileSync('python3', ['-c', code, ...args]).toString().trim();
const verify = (src, out) => { try { const r = execFileSync('python3', [path.join(__dirname, 'verify_fill.py'), src, out]).toString().trim(); console.log('  ✓ ' + r); } catch (e) { console.log('  ✗ ' + e.stdout); fails++; } };
let fails = 0; const check = (ok, text) => { console.log(`  ${ok ? '✓' : '✗'} ${text}`); if (!ok) fails++; };

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const srv = http.createServer((req, res) => {
  const p = path.join(SITE, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!p.startsWith(SITE) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
}).listen(0);
const cellsOf = (file, sheet, col) => JSON.parse(py(`import json,sys
from openpyxl import load_workbook
ws = load_workbook(sys.argv[1])[sys.argv[2]]
print(json.dumps({r: ws.cell(r, int(sys.argv[3])).value for r in range(1, ws.max_row + 1)}, default=str))`, file, sheet, String(col)));
function recalc(file) {
  const dir = path.join(WORK, 'lo'); fs.rmSync(dir, { recursive: true, force: true });
  execFileSync('soffice', ['--headless', '--calc', '--convert-to', 'xlsx', '--outdir', dir, file], { stdio: 'ignore' });
  return path.join(dir, path.basename(file));
}

(async () => {
  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1400, height: 900 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const state = () => page.evaluate(() => window.__DXG_STATE.items.map(it => ({ id: it.id, r: it.r, sheet: it.sheet, desc: it.desc, fill: it.c.fill, price: it.c.price, why: it.c.why, p25: it.c.ref && it.c.ref.p25, qs: it.qs })));
  const run = async file => {
    await page.setInputFiles('#f-boq', file); await page.waitForSelector('#step-map:not([hidden])');
    await page.click('#go'); await page.waitForSelector('#step-res:not([hidden])');
  };
  const exportFile = async name => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#dx-export')]);
    const f = path.join(WORK, name); await dl.saveAs(f); return f;
  };
  await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`);
  await page.waitForSelector('#splash', { state: 'detached' });

  const setMode = m => page.selectOption('#o-mode', m);
  // ô của 1 cột: { dòng: [giá trị, màu nền] }
  const colOf = (file, sheet, col) => JSON.parse(py(`import json,sys
from openpyxl import load_workbook
ws = load_workbook(sys.argv[1])[sys.argv[2]]
c = int(sys.argv[3])
print(json.dumps({r: [ws.cell(r, c).value, ws.cell(r, c).fill.fgColor.rgb if ws.cell(r, c).fill.fill_type == 'solid' else None] for r in range(1, ws.max_row + 1)}, default=str))`, file, sheet, String(col)));

  console.log('1. BOQ chưa có giá → giá đề xuất vào CỘT RIÊNG tô màu (mặc định)');
  await run(path.join(WORK, 'BOQ_mau.xlsx'));
  let s = await state();
  const by = id => s.find(x => x.id === id);
  check(await page.$eval('#o-mode', e => e.value) === 'col', 'mặc định: ghi vào cột riêng');
  check(s.filter(x => x.fill).length >= 10, `${s.filter(x => x.fill).length}/${s.length} dòng có giá đề xuất`);
  check(s.filter(x => x.fill).every(x => Math.abs(x.price - x.p25) / x.p25 < 0.01), 'giá đề xuất = P25 (đã làm tròn)');
  check(!by('Xay dung|15').fill, 'dòng không có tham khảo (VRV) không có đề xuất: ' + by('Xay dung|15').why);
  await page.screenshot({ path: path.join(WORK, 'lines.png'), fullPage: true });
  const f1 = await exportFile('lan1_DaDienGia.xlsx');
  verify(path.join(WORK, 'BOQ_mau.xlsx'), f1);
  const sheets = py(`from openpyxl import load_workbook as L;import sys;print(L(sys.argv[1]).sheetnames)`, f1);
  check(sheets === "['Xay dung', 'Hoan thien']", 'không thêm sheet nào: ' + sheets);
  const P = colOf(f1, 'Xay dung', 9), E1 = cellsOf(f1, 'Xay dung', 5);
  check(P[3][0] === 'ĐƠN GIÁ ĐỀ XUẤT (CSDL)' && P[4][0] === 'P25' && P[3][1] === 'FFFFC000', 'cột I (sau cột Ghi chú): tiêu đề "ĐƠN GIÁ ĐỀ XUẤT (CSDL)" / "P25", tô màu');
  check(s.filter(x => x.sheet === 'Xay dung' && x.fill).every(x => P[x.r + 1][0] === x.price && P[x.r + 1][1] === 'FFFFEB9C'), 'giá đề xuất trong cột I đúng bằng giá phần mềm tính, ô được tô màu');
  check(!P[by('Xay dung|15').r + 1][0], 'dòng không có đề xuất: ô cột đề xuất để trống');
  check(s.filter(x => x.sheet === 'Xay dung').every(x => E1[x.r + 1] === null), 'cột Đơn giá (E) không bị ghi');
  const H = colOf(f1, 'Hoan thien', 8);
  check(H[1][0] === 'ĐƠN GIÁ ĐỀ XUẤT (CSDL) — P25' && typeof H[2][0] === 'number', 'sheet tiêu đề 1 dòng: cột H sau cột Giá baseline');
  check(py(`from openpyxl import load_workbook as L;import sys;print(L(sys.argv[1])['Xay dung'].column_dimensions['I'].width)`, f1) === '18.0', 'cột đề xuất rộng 18');
  // Nạp lại chính file đã xuất: cột đề xuất không bị nhận nhầm là cột Đơn giá, xuất lại ghi đúng cột cũ
  await run(f1);
  const det = await page.evaluate(() => window.__DXG_STATE.sheets.map(sh => sh.det.cols));
  check(det[0].rate === 4 && det[0].prop === 8, 'nạp lại file đã xuất: cột Đơn giá vẫn là E, cột đề xuất I được nhận ra');
  const f1b = await exportFile('lan1b_DaDienGia.xlsx');
  verify(path.join(WORK, 'BOQ_mau.xlsx'), f1b);
  check(py(`from openpyxl import load_workbook as L;import sys;ws=L(sys.argv[1])['Xay dung'];print(ws.max_column)`, f1b) === '9', 'xuất lại: ghi vào cột I cũ, không thêm cột mới');

  console.log('2. Chế độ "Ô Đơn giá đang trống" + công thức Thành tiền tính lại (LibreOffice)');
  await run(path.join(WORK, 'BOQ_mau.xlsx'));
  await setMode('rate');
  s = await state();
  const f1r = await exportFile('lan1r_DaDienGia.xlsx');
  verify(path.join(WORK, 'BOQ_mau.xlsx'), f1r);
  const E = cellsOf(f1r, 'Xay dung', 5);
  check(s.filter(x => x.sheet === 'Xay dung' && x.fill).every(x => E[x.r + 1] === x.price), 'giá trong ô Đơn giá đúng bằng giá phần mềm tính');
  const r1 = recalc(f1r);
  const vals = JSON.parse(py(`import json,sys
from openpyxl import load_workbook
ws = load_workbook(sys.argv[1], data_only=True)['Xay dung']
print(json.dumps([[ws.cell(r,4).value, ws.cell(r,5).value, ws.cell(r,7).value] for r in range(6, 18)]))`, r1));
  check(vals.filter(v => typeof v[1] === 'number').every(v => Math.abs(v[2] - v[0] * v[1]) < 1), 'Thành tiền = KL × đơn giá đã điền');
  const total = vals[vals.length - 1][2], sumRows = vals.slice(0, -1).reduce((t, v) => t + (typeof v[2] === 'number' ? v[2] : 0), 0);
  check(Math.abs(total - sumRows) < 1 && total > 0, `Tổng cộng cập nhật: ${Math.round(total).toLocaleString('vi-VN')}`);

  console.log('3. BOQ đã có một phần giá QS');
  await run(path.join(WORK, 'BOQ_QS.xlsx'));
  s = await state();
  check(s.filter(x => x.qs).every(x => !x.fill && x.price === x.qs), `ô Đơn giá: ${s.filter(x => x.qs).length} ô đã có giá được giữ nguyên`);
  check(by('Xay dung|13').fill, 'ô trống (Sơn tường trong nhà) được điền');
  const f2 = await exportFile('lan2_DaDienGia.xlsx');
  verify(path.join(WORK, 'BOQ_QS.xlsx'), f2);
  await setMode('col');
  s = await state();
  check(s.filter(x => x.qs && x.p25).every(x => x.fill && x.price !== null), 'cột riêng: dòng đã có giá QS vẫn có giá đề xuất để so sánh');
  const f2c = await exportFile('lan2c_DaDienGia.xlsx');
  verify(path.join(WORK, 'BOQ_QS.xlsx'), f2c);
  const E2 = cellsOf(f2c, 'Xay dung', 5), E0 = cellsOf(path.join(WORK, 'BOQ_QS.xlsx'), 'Xay dung', 5), P2 = colOf(f2c, 'Xay dung', 9);
  check(JSON.stringify(E2) === JSON.stringify(E0), 'cột Đơn giá giữ nguyên giá QS, không trộn giá đề xuất');
  check(s.filter(x => x.sheet === 'Xay dung' && x.fill).every(x => P2[x.r + 1][0] === x.price), 'giá đề xuất nằm riêng ở cột I');

  console.log('4. Đơn giá bổ sung');
  await run(path.join(WORK, 'BOQ_mau.xlsx'));
  await page.setInputFiles('#f-extra', path.join(WORK, 'DonGia_BoSung.xlsx'));
  await page.waitForFunction(() => window.__DXG_STATE.extra.length > 0);
  await page.waitForFunction(() => window.__DXG_STATE.items.find(it => it.id === 'Xay dung|15').c.fill);
  s = await state();
  check(by('Xay dung|15').price === 320000000, 'VRV được điền theo đơn giá bổ sung: ' + by('Xay dung|15').price);
  check(by('Xay dung|13').price === 61000, 'đơn giá bổ sung được ưu tiên hơn CSDL cũ (Sơn tường): ' + by('Xay dung|13').price);

  console.log('5. Giá tay + lưu / khôi phục phiên');
  await page.click('#res-tbl tr[data-id="Xay dung|12"]'); await page.waitForSelector('#dxg-drawer:not([hidden])');
  await page.fill('#dw-manual', '97000'); await page.click('[data-do=apply]');
  await page.screenshot({ path: path.join(WORK, 'drawer.png') });
  await page.click('#dw-close');
  check((await state()).find(x => x.id === 'Xay dung|12').price === 97000, 'giá tay được dùng');
  const [ds] = await Promise.all([page.waitForEvent('download'), page.click('#save-sess')]);
  const sess = path.join(WORK, ds.suggestedFilename()); await ds.saveAs(sess);
  await page.reload(); await page.waitForSelector('#splash', { state: 'detached' });
  await run(path.join(WORK, 'BOQ_mau.xlsx'));
  await page.setInputFiles('#f-sess', sess);
  await page.waitForFunction(() => window.__DXG_STATE.items.some(it => it.manual === 97000));
  s = await state();
  check(by('Xay dung|12').price === 97000 && by('Xay dung|15').price === 320000000, 'khôi phục giá tay và đơn giá bổ sung');
  await page.click('.tab[data-tab=sum]'); await page.waitForSelector('#tab-sum .sum-grid');
  await page.screenshot({ path: path.join(WORK, 'sum.png'), fullPage: true });
  const f3 = await exportFile('lan3_DaDienGia.xlsx');
  verify(path.join(WORK, 'BOQ_mau.xlsx'), f3);

  console.log('6. Dữ liệu học: QS chọn nhóm khác → lưu .dxgl → lần sau khớp đúng ngay');
  await page.click(".tab[data-tab=lines]");
  const pickId = await page.evaluate(() => window.__DXG_STATE.items.find(it => it.cands.length >= 2 && !it.qs).id);
  await page.click(`#res-tbl tr[data-id="${pickId}"]`); await page.waitForSelector('#dxg-drawer:not([hidden])');
  await page.click('#dw-body .cand[data-k="1"]');
  const want = await page.evaluate(id => { const it = window.__DXG_STATE.items.find(x => x.id === id); return it.cands[it.sel].g; }, pickId);
  await page.click('#dw-close');
  const [dlL] = await Promise.all([page.waitForEvent('download'), page.click('#save-learn')]);
  const learnFile = path.join(WORK, dlL.suggestedFilename()); await dlL.saveAs(learnFile);
  const model = JSON.parse(fs.readFileSync(learnFile, 'utf8'));
  check(model.dinh_dang === 'DXGL1' && model.cap.length === 1 && model.cap[0].neg.length === 1, `file dữ liệu học: ${model.cap.length} cặp, có ghi nhóm bị bác`);
  await page.reload(); await page.waitForSelector('#splash', { state: 'detached' });
  await run(path.join(WORK, 'BOQ_mau.xlsx'));
  await page.setInputFiles('#f-sess', learnFile);
  await page.waitForFunction(() => /dữ liệu học/.test(document.querySelector('#load-msg').textContent));
  const got = await page.evaluate(id => { const it = window.__DXG_STATE.items.find(x => x.id === id); const c = it.cands[it.sel]; return { g: c.g, learned: c.learned, fit: it.c.fit.level }; }, pickId);
  check(got.g === want && got.learned === 'exact' && got.fit === 'cao', `dòng ${pickId} khớp nhóm QS đã chọn, độ khớp ${got.fit}`);

  if (errs.length) { console.error('LỖI TRANG:', errs); fails++; }
  await browser.close(); srv.close();
  console.log(fails ? `THẤT BẠI: ${fails} kiểm tra` : 'Đạt tất cả.');
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
