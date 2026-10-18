'use strict';
/* Kiểm thử đầu-cuối trên Chromium: nạp BOQ mẫu → đề xuất → nạp baseline → sửa tay → xuất Excel.
   Dùng: node tests/e2e.js <thư mục làm việc tạm>   (cần playwright; dữ liệu là giả lập) */
const fs = require('fs'), path = require('path'), http = require('http');
const { execFileSync } = require('child_process');
let pw; try { pw = require('playwright'); } catch { pw = require(path.join(execFileSync('npm', ['root', '-g']).toString().trim(), 'playwright')); }

const MOD = path.resolve(__dirname, '..');
const WORK = path.resolve(process.argv[2] || fs.mkdtempSync('/tmp/dxg-'));
const SITE = path.join(WORK, 'site');
fs.rmSync(SITE, { recursive: true, force: true });
fs.cpSync(MOD, SITE, { recursive: true, filter: s => !s.includes(`${path.sep}tests`) });
fs.mkdirSync(path.join(SITE, 'data'), { recursive: true });
fs.writeFileSync(path.join(SITE, 'data', 'db.js'), 'window.DB = ' + JSON.stringify(require('./fixture_db.js').makeDB()) + ';');
execFileSync('python3', [path.join(__dirname, 'make_boq.py'), WORK]);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const srv = http.createServer((req, res) => {
  const p = path.join(SITE, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!p.startsWith(SITE) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
}).listen(0);

(async () => {
  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1400, height: 900 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`);
  await page.waitForSelector('#splash', { state: 'detached' });
  await page.setInputFiles('#f-boq', path.join(WORK, 'BOQ_mau.xlsx'));
  await page.waitForSelector('#step-map:not([hidden])');
  const mapInfo = await page.evaluate(() => window.__DXG_STATE.sheets.map(s => ({ name: s.name, include: s.include, det: s.det })));
  console.log('Cấu trúc:', JSON.stringify(mapInfo));
  await page.click('#go');
  await page.waitForSelector('#step-res:not([hidden])');
  await page.setInputFiles('#f-base', path.join(WORK, 'Baseline_mau.xlsx'));
  await page.waitForFunction(() => window.__DXG_STATE.items.some(it => it.baseFile));
  const res = await page.evaluate(() => window.__DXG_STATE.items.map(it => ({ id: it.id, desc: it.desc, unit: it.unit, grp: it.c.cand ? it.c.cand.g : null, lvl: it.c.conf.level, price: it.c.price, base: it.c.base, pct: it.c.dev && it.c.dev.pct })));
  for (const r of res) console.log(`  ${r.id.padEnd(16)} ${r.desc.slice(0, 40).padEnd(40)} ${String(r.unit).padEnd(7)} ${r.lvl.padEnd(5)} ${String(r.price).padStart(10)}  BL ${String(r.base).padStart(9)} ${r.pct !== null && r.pct !== undefined ? (r.pct * 100).toFixed(1) + '%' : ''}`);
  console.log('KPI:', (await page.textContent('#kpis')).replace(/\s+/g, ' '));
  if (errs.length) console.error('LỖI TRANG:', errs);
  // mở chi tiết dòng VRV, tìm thủ công và sửa tay giá
  await page.click('#res-tbl tr[data-id="Xay dung|15"]');
  await page.waitForSelector('#drawer:not([hidden])');
  await page.fill('#dw-q', 'be tong mong'); await page.click('[data-do=search]');
  await page.click('[data-do=prev]');
  await page.screenshot({ path: path.join(WORK, 'drawer.png') });
  await page.click('[data-do=next]');
  await page.fill('#dw-manual', '350000000'); await page.click('[data-do=apply]');
  await page.click('[data-do=next]');
  await page.click('#dw-close');
  await page.click('.tab[data-tab=sum]');
  await page.waitForSelector('#tab-sum .sum-grid');
  await page.screenshot({ path: path.join(WORK, 'sum.png'), fullPage: true });
  await page.click('.tab[data-tab=lines]');
  await page.screenshot({ path: path.join(WORK, 'lines.png'), fullPage: true });
  // Xuất
  await page.click('#dx-export');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#dlg-form button[type=submit]')]);
  const outFile = path.join(WORK, dl.suggestedFilename()); await dl.saveAs(outFile);
  // Lưu phiên
  const [ds] = await Promise.all([page.waitForEvent('download'), page.click('#save-sess')]);
  await ds.saveAs(path.join(WORK, ds.suggestedFilename()));
  // Xuất lần 2 (file đã có sheet DX_*) phải vẫn hợp lệ
  await page.click('#dx-export');
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#dlg-form button[type=submit]')]);
  await dl2.saveAs(path.join(WORK, 'lan2_' + dl2.suggestedFilename()));
  console.log('Đã xuất:', outFile);
  // Khôi phục phiên trên trang mới
  await page.reload(); await page.waitForSelector('#splash', { state: 'detached' });
  await page.setInputFiles('#f-boq', path.join(WORK, 'BOQ_mau.xlsx')); await page.waitForSelector('#step-map:not([hidden])');
  await page.click('#go'); await page.waitForSelector('#step-res:not([hidden])');
  await page.setInputFiles('#f-sess', path.join(WORK, ds.suggestedFilename()));
  await page.waitForFunction(() => window.__DXG_STATE.items.some(it => it.manual === 350000000));
  const restored = await page.evaluate(() => window.__DXG_STATE.items.filter(it => it.baseFile).length);
  console.log('Khôi phục phiên: giá sửa tay ✓, baseline ghép lại', restored, 'dòng');
  if (errs.length) { console.error('LỖI TRANG:', errs); process.exitCode = 1; }
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
