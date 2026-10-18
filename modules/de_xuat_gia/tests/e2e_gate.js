'use strict';
/* Kiểm thử bản đã dựng (CSP + cổng đăng nhập + gói .dgbw mã hóa) cho quyền admin và nhân viên.
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
  return { dinh_dang: 'DGW1', users: [await user('admin', true), await user('nv1', false)], khoi: { db: { khoa: 'nv', du_lieu: await block(require('./fixture_db.js').makeDB(), keyNv, 'db') } } };
}

function serve(dir) {
  const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  return http.createServer((req, res) => {
    const p = path.join(dir, decodeURIComponent(req.url.split('?')[0]));
    if (!p.startsWith(dir) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
  }).listen(0);
}

async function run(browser, site, user, label) {
  const srv = serve(site);
  const page = await browser.newPage({ acceptDownloads: true });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (['error', 'warning'].includes(m.type()) && /Content Security|Refused|Error/i.test(m.text())) errs.push(m.text()); });
  await page.goto(`http://127.0.0.1:${srv.address().port}/de-xuat-gia/index.html`);
  await page.setInputFiles('#gate-file', path.join(WORK, 'test.dgbw'));
  await page.fill('#gate-user', user); await page.fill('#gate-pass', 'matkhau');
  await page.click('#gate-go');
  await page.waitForSelector('#splash', { state: 'detached', timeout: 20000 });
  const who = await page.textContent('.userbox .who');
  await page.setInputFiles('#f-boq', path.join(WORK, 'BOQ_mau.xlsx'));
  await page.waitForFunction(() => !document.querySelector('#step-map').hidden || document.querySelector('#load-msg').classList.contains('err'));
  if (await page.$('#load-msg.err')) throw new Error(`[${label}] ` + await page.textContent('#load-msg') + ' ' + errs.join(' | '));
  await page.click('#go');
  await page.waitForSelector('#step-res:not([hidden])');
  await page.click('#res-tbl tr[data-id="Xay dung|5"]');
  const hasProj = await page.$$eval('#dw-body table.refs th', ths => ths.some(t => t.textContent === 'Dự án'));
  await page.click('#dw-close');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#dx-export')]);
  const out = path.join(WORK, `${label}_${dl.suggestedFilename()}`); await dl.saveAs(out);
  const sheets = execFileSync('python3', ['-c', `from openpyxl import load_workbook as L;print(L(${JSON.stringify(out)}).sheetnames)`]).toString().trim();
  console.log(`[${label}] ${who.trim()} · cột Dự án trong tham chiếu: ${hasProj} · sheets: ${sheets}`);
  if (errs.length) { console.error(`[${label}] LỖI:`, errs); process.exitCode = 1; }
  await page.close(); srv.close();
  return { hasProj, sheets };
}

(async () => {
  fs.writeFileSync(path.join(WORK, 'test.dgbw'), JSON.stringify(await makePackage()));
  // bản nhân viên: dựng bằng chính build.py — mặc định (chỉ admin) thì không có module; bật cờ thì có
  const build = (dir, flag) => {
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
    fs.cpSync(path.join(ROOT, 'shared'), path.join(dir, 'shared'), { recursive: true });
    execFileSync('python3', ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(ROOT)}); import build; build.dung_module(${JSON.stringify(dir)}, 'nhan_vien', ${flag}); build.kiem_tra_dau_ra(${JSON.stringify(dir)})`]);
  };
  const nvMacDinh = path.join(WORK, 'nv_mac_dinh'), nvMo = path.join(WORK, 'nv_mo');
  build(nvMacDinh, 'None'); build(nvMo, 'True');
  if (fs.existsSync(path.join(nvMacDinh, 'de-xuat-gia'))) { console.error('bản nhân viên mặc định không được chứa module'); process.exitCode = 1; }
  else console.log('[nv mặc định] bản nhân viên không chứa module ✓');
  const browser = await pw.chromium.launch();
  const a = await run(browser, path.join(ROOT, 'docs'), 'admin', 'admin');
  const b = await run(browser, nvMo, 'admin', 'nv-mo');   // bản nhân viên: tài khoản admin cũng chỉ có quyền nhân viên
  if (!a.hasProj) { console.error('admin phải thấy tên dự án trong báo giá tham khảo'); process.exitCode = 1; }
  if (b.hasProj) { console.error('nhân viên không được thấy tên dự án'); process.exitCode = 1; }
  for (const x of [a, b]) if (x.sheets !== "['Xay dung', 'Hoan thien']") { console.error('file điền giá không được thêm sheet: ' + x.sheets); process.exitCode = 1; }
  // tài khoản nhân viên mở bản admin: bị chặn
  {
    const srv = serve(path.join(ROOT, 'docs')), page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${srv.address().port}/de-xuat-gia/index.html`);
    await page.setInputFiles('#gate-file', path.join(WORK, 'test.dgbw'));
    await page.fill('#gate-user', 'nv1'); await page.fill('#gate-pass', 'matkhau'); await page.click('#gate-go');
    await page.waitForFunction(() => /chỉ dành cho tài khoản admin/.test(document.querySelector('#splash-msg').textContent), null, { timeout: 15000 });
    console.log('[nv1 trên bản admin] bị chặn ✓');
    await page.close(); srv.close();
  }
  await browser.close();
  console.log(process.exitCode ? 'THẤT BẠI' : 'Đạt.');
})().catch(e => { console.error(e); process.exit(1); });
