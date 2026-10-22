'use strict';
/* Chạy module Điền giá BOQ trên MỘT FILE BOQ bất kỳ: tính giá tốt nhất và điền thẳng vào cột Đơn giá.
   Mặc định dùng CSDL giả lập của demo; dùng CSDL thật dạng data/db.js với --db.
   Dùng: node modules/de_xuat_gia/demo/chay_file.js --boq <file.xlsx> [--extra <đơn giá bổ sung.xlsx> ...]
                                                   [--baseline <file.xlsx>] [--db <db.js>] [--pick p25|p10|med|latest] [--out <thư mục>]
                                                   [--mode col|rate]   col (mặc định): giá đề xuất vào cột riêng tô màu; rate: vào ô Đơn giá trống
                                                   [--them data/doithu.js ...]  thêm nguồn giá (file gán window.DT / window.CTG), gộp như trang web
                                                   [--du-lieu 3_WEB_OFFLINE/data]  db.js + doithu.js (+ ctg.js): đủ ba nguồn Nội bộ, CTG, Đối thủ
                                                   [--goi DonGiaBOQ_admin.dgbw --user <admin>]  đọc thẳng các khối db, doithu, ctg của gói
                                                     (mật khẩu: DGW_MAT_KHAU hoặc hỏi khi chạy; dữ liệu giải mã chỉ nằm tạm trong thư mục kết quả, xóa khi xong)
   Kết quả: <tên>_DaDienGia.xlsx (BOQ có giá đề xuất, không thêm sheet), KET_QUA.xlsx (báo cáo riêng), ảnh giao diện. */
const fs = require('fs'), path = require('path'), http = require('http');
const { execFileSync } = require('child_process');
let pw; try { pw = require('playwright'); } catch { pw = require(path.join(execFileSync('npm', ['root', '-g']).toString().trim(), 'playwright')); }

const argv = process.argv.slice(2);
const arg = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const args = k => argv.flatMap((a, i) => a === k ? [path.resolve(argv[i + 1])] : []);
const BOQ = arg('--boq') && path.resolve(arg('--boq'));
if (!BOQ || !fs.existsSync(BOQ)) { console.error('Cần --boq <file.xlsx>'); process.exit(2); }
const EXTRA = args('--extra'), BASE = arg('--baseline') && path.resolve(arg('--baseline')), THEM = args('--them');
const DBJS = arg('--db') && path.resolve(arg('--db')), PICK = arg('--pick') || 'p25', MODE = arg('--mode') === 'rate' ? 'rate' : 'col';
const MOD = path.resolve(__dirname, '..');
const OUT = path.resolve(arg('--out') || path.join(__dirname, 'ket_qua_' + path.basename(BOQ).replace(/\.\w+$/, '')));
const SITE = path.join(OUT, '.trang');
fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(SITE, { recursive: true, force: true });
fs.mkdirSync(path.join(SITE, 'data'), { recursive: true });
fs.cpSync(path.join(MOD, 'assets'), path.join(SITE, 'assets'), { recursive: true });
fs.copyFileSync(path.join(MOD, 'index.html'), path.join(SITE, 'index.html'));
const GOI = arg('--goi') && path.resolve(arg('--goi')), DU_LIEU = arg('--du-lieu') && path.resolve(arg('--du-lieu'));
let DATA;   // nội dung data/db.js của trang chạy thử: window.DB (+ window.DT / window.CTG, module tự gộp như trang web)
if (GOI) {
  if (!arg('--user')) { console.error('--goi cần --user <tên đăng nhập admin>'); process.exit(2); }
  const k = require('../hoc/chung.js').docGoi(GOI, arg('--user'));
  DATA = [['DB', k.db], ['DT', k.doithu], ['CTG', k.ctg]].filter(([, v]) => v).map(([b, v]) => `window.${b} = ${JSON.stringify(v)};`);
} else if (DU_LIEU) DATA = ['db.js', 'doithu.js', 'ctg.js'].map(f => path.join(DU_LIEU, f)).filter(f => fs.existsSync(f)).map(f => fs.readFileSync(f, 'utf8'));
else DATA = [DBJS ? fs.readFileSync(DBJS, 'utf8') : 'window.DB = ' + JSON.stringify(require('./du_lieu_mau.js').taoDB()) + ';'];
fs.writeFileSync(path.join(SITE, 'data', 'db.js'), [...DATA, ...THEM.map(f => fs.readFileSync(f, 'utf8'))].join('\n'));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' };
const srv = http.createServer((req, res) => {
  const p = path.join(SITE, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!p.startsWith(SITE) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
}).listen(0);

(async () => {
  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1440, height: 950 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`);
  await page.waitForSelector('#splash', { state: 'detached' });
  await page.waitForFunction(() => window.__DXG_STATE.sources.length > 0, null, { timeout: 120000 });
  const nguon = await page.textContent('#dxg-src');
  for (const f of EXTRA) {
    const n0 = await page.evaluate(() => window.__DXG_STATE.extra.length);
    await page.setInputFiles('#f-extra', f);
    await page.waitForFunction(n => window.__DXG_STATE.extra.length > n || document.querySelector('#load-msg.err'), n0, { timeout: 60000 });
  }
  let t0 = Date.now();
  await page.setInputFiles('#f-boq', BOQ);
  await page.waitForFunction(() => !document.querySelector('#step-map').hidden || document.querySelector('#load-msg.err'), null, { timeout: 120000 });
  if (await page.$('#load-msg.err')) throw new Error(await page.textContent('#load-msg'));
  const tRead = Date.now() - t0;
  const cauTruc = await page.evaluate(() => window.__DXG_STATE.sheets.map(s => ({ sheet: s.name, dung: s.include, dong_tieu_de: s.det.headerRow + 1, cot: Object.fromEntries(Object.entries(s.det.cols).map(([k, c]) => [k, XLSXIO.colName(c)])) })));
  await page.locator('#step-map').screenshot({ path: path.join(OUT, '1_nhan_dien_cau_truc.png') });
  t0 = Date.now();
  await page.click('#go'); await page.waitForSelector('#step-res:not([hidden])', { timeout: 120000 });
  const tMatch = Date.now() - t0;
  if (PICK !== 'p25') await page.selectOption('#o-pick', PICK);
  if (MODE !== 'col') await page.selectOption('#o-mode', MODE);
  if (BASE) { await page.setInputFiles('#f-base', BASE); await page.waitForFunction(() => window.__DXG_STATE.items.some(it => it.baseFile), null, { timeout: 30000 }).catch(() => {}); }
  await page.screenshot({ path: path.join(OUT, '2_ket_qua.png'), fullPage: true });
  const rows = await page.evaluate(() => window.__DXG_STATE.items.map(it => {
    const c = it.c;
    return { sheet: it.sheet, dong: it.r + 1, ma: it.code, mo_ta: it.desc, near: it.heads[it.heads.length - 1] || '', dv: it.unit, kl: it.qty,
      phu_hop: c.fit.level, ref: c.ref, n: c.st && c.shown ? c.st.n : null, gia_co_san: it.qs, gia: c.price, dien: c.fill, ly_do: c.why,
      danh_gia_co_san: it.qs ? c.ev : null, base: c.base, lech: c.dev ? c.dev.pct : null, luu_y: c.notes.join(' · '),
      nguon: c.shown && c.st.src ? Object.entries(c.st.src).map(([l, n]) => `${l} ${n}`).join(', ') : '' };
  }));
  const names = await page.$$eval('#res-tbl tbody tr[data-id] td.grp', tds => tds.map(td => td.childNodes[0] ? td.childNodes[0].textContent.trim() : ''));
  const counts = await page.evaluate(() => ({ note: window.__DXG_STATE.lines.filter(l => l.kind === 'note').length, head: window.__DXG_STATE.lines.filter(l => l.kind === 'head').length, extra: window.__DXG_STATE.extra.length }));
  const firstFill = await page.$('#res-tbl tbody tr[data-id]');
  if (firstFill) { await firstFill.click(); await page.waitForSelector('#dxg-drawer:not([hidden])'); await page.screenshot({ path: path.join(OUT, '3_chi_tiet_dong.png') }); await page.click('#dw-close'); }
  t0 = Date.now();
  let outFile = null;
  if (rows.some(r => r.dien)) {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.click('#dx-export')]);
    outFile = path.join(OUT, dl.suggestedFilename()); await dl.saveAs(outFile);
  }
  const tExport = Date.now() - t0;
  await browser.close(); srv.close();
  fs.rmSync(SITE, { recursive: true, force: true });
  let fmt = 'Không có ô nào được điền.';
  if (outFile) {
    try { fmt = execFileSync('python3', [path.join(MOD, 'tests', 'verify_fill.py'), BOQ, outFile]).toString().trim(); }
    catch (e) { fmt = (e.stdout || '').toString().trim() || String(e); process.exitCode = 1; }
  }
  const json = { file: path.basename(BOQ), out: outFile && path.basename(outFile), pick: PICK, mode: MODE, nguon, cauTruc, counts, rows: rows.map((r, k) => ({ ...r, nhom: names[k] })), fmt, tRead, tMatch, tExport,
    extra: EXTRA.map(f => path.basename(f)) };
  fs.writeFileSync(path.join(OUT, 'ket_qua.json'), JSON.stringify(json, null, 1));
  execFileSync('python3', [path.join(__dirname, 'bao_cao_xlsx.py'), path.join(OUT, 'ket_qua.json'), path.join(OUT, 'KET_QUA.xlsx'),
    DBJS || GOI || DU_LIEU ? '' : 'Giá lấy từ CSDL GIẢ LẬP của bộ chạy thử (~500 báo giá / 40 nhóm công việc) — chỉ minh họa cách module chạy, không phải giá thị trường thật.']);
  const nFill = rows.filter(r => r.dien).length, nKeep = rows.filter(r => !r.dien && (r.gia || r.gia_co_san)).length;
  console.log(MODE === 'col'
    ? `File: ${path.basename(BOQ)} — ${rows.length} dòng hạng mục · có giá đề xuất ${nFill} (cột riêng) · đã có giá QS ${rows.filter(r => r.gia_co_san).length} (giữ nguyên ở cột Đơn giá) · không đề xuất ${rows.length - nFill}`
    : `File: ${path.basename(BOQ)} — ${rows.length} dòng hạng mục · điền ${nFill} · giữ giá có sẵn ${nKeep} · để trống ${rows.length - nFill - nKeep}`);
  console.log(nguon);
  console.log(`Thời gian: đọc ${(tRead / 1000).toFixed(1)} s · khớp ${(tMatch / 1000).toFixed(1)} s · điền + xuất ${(tExport / 1000).toFixed(1)} s`);
  console.log(fmt);
  if (errs.length) { console.error('LỖI TRANG:', errs); process.exitCode = 1; }
  if (GOI) fs.rmSync(path.join(SITE, 'data'), { recursive: true, force: true });   // không để lại dữ liệu đã giải mã
  console.log(`Kết quả: ${OUT}`);
})().catch(e => { console.error(e); srv.close(); if (GOI) fs.rmSync(path.join(SITE, 'data'), { recursive: true, force: true }); process.exit(1); });
