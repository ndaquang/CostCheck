'use strict';
/* Kiểm thử bản đã dựng docs/ (CSP + cổng đăng nhập + gói .dgbw mã hóa): module Điền giá BOQ GHÉP trong app tra cứu.
   • admin: có mục "Điền giá BOQ" trên thanh điều hướng, dùng chung CSDL đã nạp (không đăng nhập lại),
     nhập Excel → điền giá → xuất Excel (chỉ ô trống thay đổi) + xuất báo cáo; mục Tra cứu vẫn chạy bình thường.
   • nhân viên: không có mục này.
   Dùng: node tests/e2e_gate.js <thư mục tạm>   — chạy sau `python build.py --module`. Gói dữ liệu là giả lập. */
const fs = require('fs'), path = require('path'), http = require('http'), zlib = require('zlib');
const { webcrypto: wc } = require('crypto');
const { execFileSync } = require('child_process');
let pw; try { pw = require('playwright'); } catch { pw = require(path.join(execFileSync('npm', ['root', '-g']).toString().trim(), 'playwright')); }

const ROOT = path.resolve(__dirname, '../../..');
const WORK = path.resolve(process.argv[2] || fs.mkdtempSync('/tmp/dxg-gate-'));
fs.mkdirSync(WORK, { recursive: true });
execFileSync('python3', [path.join(__dirname, 'make_boq.py'), WORK]);
const b64 = u => Buffer.from(u).toString('base64');
const enc = new TextEncoder();

async function makePackage() {
  const salt = wc.getRandomValues(new Uint8Array(16)), iter = 1000;
  const base = await wc.subtle.importKey('raw', enc.encode('matkhau'), 'PBKDF2', false, ['deriveKey']);
  const kek = await wc.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const keyNv = wc.getRandomValues(new Uint8Array(32)), keyAd = wc.getRandomValues(new Uint8Array(32));
  const wrap = async (raw, aad) => { const iv = wc.getRandomValues(new Uint8Array(12)); const ct = await wc.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, kek, raw); return b64(Buffer.concat([iv, Buffer.from(ct)])); };
  const block = async (obj, raw, aad) => {
    const k = await wc.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']), iv = wc.getRandomValues(new Uint8Array(12));
    const ct = await wc.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, k, zlib.gzipSync(JSON.stringify(obj)));
    return b64(Buffer.concat([Buffer.from('DGW1'), iv, Buffer.from(ct)]));
  };
  const user = async (ten, admin) => ({ ten_dang_nhap: ten, ho_ten: ten.toUpperCase(), hoat_dong: true, salt: b64(salt), kdf: { iter }, khoa: { nv: await wrap(keyNv, `${ten}|nv`), ...(admin ? { admin: await wrap(keyAd, `${ten}|admin`) } : {}) } });
  return { dinh_dang: 'DGW1', users: [await user('admin', true), await user('nv1', false)], khoi: {
    db: { khoa: 'nv', du_lieu: await block((({ makeDB, fullDB }) => fullDB(makeDB()))(require('./fixture_db.js')), keyNv, 'db') },
    doithu: { khoa: 'admin', du_lieu: await block((({ makeDoiThu, fullDB }) => fullDB(makeDoiThu()))(require('./fixture_db.js')), keyAd, 'doithu') },   // chỉ khóa admin mở được
    ctg: { khoa: 'admin', du_lieu: await block(require('../../ctg/ctg.js').taoCSDL(require('../../ctg/tests/mau.js').luoiMau()).db, keyAd, 'ctg') },
  } };
}

function serve(dir) {
  const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  return http.createServer((req, res) => {
    const p = path.join(dir, decodeURIComponent(req.url.split('?')[0]));
    if (!p.startsWith(dir) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
  }).listen(0);
}

const login = async (page, port, user) => {
  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.setInputFiles('#gate-file', path.join(WORK, 'test.dgbw'));
  await page.fill('#gate-user', user); await page.fill('#gate-pass', 'matkhau');
  await page.click('#gate-go');
  await page.waitForSelector('#splash', { state: 'detached', timeout: 20000 });
};
let fails = 0; const check = (ok, text) => { console.log(`  ${ok ? '✓' : '✗'} ${text}`); if (!ok) fails++; };

(async () => {
  fs.writeFileSync(path.join(WORK, 'test.dgbw'), JSON.stringify(await makePackage()));
  const DOCS = path.join(ROOT, 'docs');
  const srv = serve(DOCS), port = srv.address().port;
  const browser = await pw.chromium.launch();

  console.log('admin');
  const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1440, height: 950 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (['error', 'warning'].includes(m.type()) && /Content Security|Refused|Error/i.test(m.text())) errs.push(m.text()); });
  await login(page, port, 'admin');
  const navs = await page.$$eval('.topnav a', as => as.map(a => a.textContent.trim()));
  check(navs.includes('Điền giá BOQ'), 'thanh điều hướng có mục "Điền giá BOQ": ' + navs.join(' | '));
  await page.click('.topnav [data-sec="dien-gia"]');
  await page.waitForSelector('#sec-dxg:not([hidden])');
  check(await page.isHidden('#sec-search'), 'mở mục Điền giá BOQ thì ẩn mục Tra cứu');
  await page.screenshot({ path: path.join(WORK, 'embed_1.png') });
  await page.setInputFiles('#f-boq', path.join(WORK, 'BOQ_mau.xlsx'));
  await page.waitForSelector('#step-map:not([hidden])');
  await page.click('#go'); await page.waitForSelector('#step-res:not([hidden])');
  const nFill = await page.evaluate(() => window.__DXG_STATE.items.filter(it => it.c.fill).length);
  check(nFill >= 10, `dùng chung CSDL của app, không đăng nhập lại: ${nFill} dòng sẽ điền`);
  const meta = await page.textContent('#dxg-src');
  check(/Đối thủ 171/.test(meta) && /CTG \d+/.test(meta), 'admin: khối đối thủ + CTG trong gói .dgbw được gộp vào nguồn giá — ' + meta);
  check(await page.evaluate(() => window.__DXG_STATE.items.find(it => it.id === 'Xay dung|15').c.fill), 'dòng chỉ nguồn đối thủ có giá (VRV) được đề xuất');
  await page.click('#res-tbl tr[data-id="Xay dung|5"]'); await page.waitForSelector('#dxg-drawer:not([hidden])');
  check(await page.$$eval('#dw-body table.refs th', ths => ths.some(t => t.textContent === 'Dự án')), 'admin thấy tên dự án trong báo giá tham khảo');
  await page.screenshot({ path: path.join(WORK, 'embed_drawer.png') });
  await page.click('#dw-close');
  await page.screenshot({ path: path.join(WORK, 'embed_2.png'), fullPage: true });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#dx-export')]);
  const out = path.join(WORK, 'embed_' + dl.suggestedFilename()); await dl.saveAs(out);
  try { console.log('  ✓ ' + execFileSync('python3', [path.join(__dirname, 'verify_fill.py'), path.join(WORK, 'BOQ_mau.xlsx'), out]).toString().trim()); }
  catch (e) { console.log('  ✗ ' + e.stdout); fails++; }
  const [rp] = await Promise.all([page.waitForEvent('download'), page.click('#dx-report')]);
  const rep = path.join(WORK, rp.suggestedFilename()); await rp.saveAs(rep);
  const sheets = execFileSync('python3', ['-c', 'from openpyxl import load_workbook as L;import sys;w=L(sys.argv[1]);print(w.sheetnames, w["Chi tiết"].max_row)', rep]).toString().trim();
  check(/Tóm tắt.*Chi tiết.*\s14$/.test(sheets), 'xuất báo cáo Excel riêng: ' + sheets);
  // quay lại Tra cứu: app vẫn chạy
  await page.click('.topnav [data-sec="tra-cuu"]');
  check(await page.isHidden('#sec-dxg') && !(await page.isHidden('#sec-search')), 'quay lại mục Tra cứu bình thường');
  await page.fill('#q', 'be tong'); await page.waitForTimeout(400);
  check((await page.textContent('#count')).trim().length > 0, 'tra cứu vẫn hoạt động: ' + (await page.textContent('#count')).trim().slice(0, 40));
  // mở lại trang ở mục Điền giá (#sec=dien-gia) sau khi đăng nhập lại
  await page.click('.topnav [data-sec="dien-gia"]');
  const hash = await page.evaluate(() => location.hash);
  check(/sec=dien-gia/.test(hash), 'địa chỉ trang ghi nhớ mục đang mở: ' + hash);
  if (errs.length) { console.error('  LỖI:', errs); fails++; }
  await page.close();

  console.log('nhân viên');
  const p2 = await browser.newPage();
  await login(p2, port, 'nv1');
  const navs2 = await p2.$$eval('.topnav a', as => as.filter(a => a.offsetParent).map(a => a.textContent.trim()));
  check(!navs2.includes('Điền giá BOQ') && !(await p2.$('#sec-dxg')), 'nhân viên không có mục Điền giá BOQ: ' + navs2.join(' | '));
  await p2.close();

  await browser.close(); srv.close();
  console.log(fails ? `THẤT BẠI: ${fails}` : 'Đạt.');
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
