'use strict';
/* Kiểm thử đồng bộ Supabase trên bản docs/ (Supabase được giả lập bằng page.route, không gọi mạng thật):
   tải gói từ máy chủ, áp delta, ghi delta mã hóa, gói cũ không áp delta, nhân viên không ghi được.
   Dùng: node tests/e2e_dong_bo.js   — chạy sau `python build.py --module`. */
const fs = require('fs'), path = require('path'), http = require('http'), zlib = require('zlib');
const { webcrypto: wc } = require('crypto');
const { execFileSync } = require('child_process');
let pw; try { pw = require('playwright'); } catch { pw = require(path.join(execFileSync('npm', ['root', '-g']).toString().trim(), 'playwright')); }
const { makeDB, fullDB } = require('../modules/de_xuat_gia/tests/fixture_db.js');

const b64 = u => Buffer.from(u).toString('base64'), enc = new TextEncoder();
const SB = fs.readFileSync(path.join(__dirname, '..', 'supabase.json'), 'utf8'), URL_SB = JSON.parse(SB).url;
const sha = buf => require('crypto').createHash('sha256').update(buf).digest('hex');
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };

async function taoGoi(ten) {
  const salt = wc.getRandomValues(new Uint8Array(16)), iter = 1000;
  const base = await wc.subtle.importKey('raw', enc.encode('matkhau'), 'PBKDF2', false, ['deriveKey']);
  const kek = await wc.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const keyRaw = wc.getRandomValues(new Uint8Array(32));
  const key = await wc.subtle.importKey('raw', keyRaw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  const seal = async (data, k, aad) => { const iv = wc.getRandomValues(new Uint8Array(12)); return b64(Buffer.concat([iv, Buffer.from(await wc.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, k, data))])); };
  const khoi = async (obj, aad) => { const iv = wc.getRandomValues(new Uint8Array(12)); const ct = await wc.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, zlib.gzipSync(JSON.stringify(obj))); return b64(Buffer.concat([Buffer.from('DGW1'), iv, Buffer.from(ct)])); };
  const db = fullDB(makeDB());
  const pkg = { dinh_dang: 'DGW1', users: [{ ten_dang_nhap: ten, ho_ten: ten, hoat_dong: true, salt: b64(salt), kdf: { iter }, khoa: { nv: await seal(keyRaw, kek, `${ten}|nv`), ...(ten === 'admin' ? { admin: await seal(keyRaw, kek, `${ten}|admin`) } : {}) } }],
    khoi: { db: { khoa: 'nv', du_lieu: await khoi(db, 'db') } } };
  return { bytes: Buffer.from(JSON.stringify(pkg)), key, n: db.count };
}
const deltaMa = async (op, key, aad) => { const iv = wc.getRandomValues(new Uint8Array(12)); return b64(Buffer.concat([Buffer.from('DGW1'), iv, Buffer.from(await wc.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, zlib.gzipSync(JSON.stringify(op))))])); };
const deltaGiai = async (ct, key, aad) => { const raw = Buffer.from(ct, 'base64'); return JSON.parse(zlib.gunzipSync(Buffer.from(await wc.subtle.decrypt({ name: 'AES-GCM', iv: raw.subarray(4, 16), additionalData: enc.encode(aad) }, key, raw.subarray(16)))).toString()); };
const OP = { t: 'them', hang: [{ name: 'Hạng mục từ delta', u: 'm2', y: 2026, cp: 123000 }] };

let fails = 0; const check = (ok, t) => { console.log(`  ${ok ? '✓' : '✗'} ${t}`); if (!ok) fails++; };

async function phien(browser, port, { ten, vaiTro, goi, manifestSha, deltas }) {
  const posts = [], reqs = [];
  const page = await browser.newPage();
  if (process.env.DEBUG_E2E) { page.on('pageerror', e => console.log('PAGEERR', e.stack.split('\n').slice(0,4).join(' / '))); page.on('console', m => console.log('CONSOLE', m.type(), m.text())); }
  await page.route(URL_SB + '/**', async route => {
    const r = route.request(), u = new globalThis.URL(r.url());
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    reqs.push(r.method() + ' ' + u.pathname + u.search);
    const json = (o, s = 200) => route.fulfill({ status: s, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(o) });
    if (u.pathname === '/auth/v1/token') return json({ access_token: 'tok', user: { app_metadata: { vai_tro: vaiTro } } });
    if (u.pathname.endsWith('/phien_ban.json')) return json({ phien_ban: 'pb1', sha256: { [vaiTro]: manifestSha } });
    if (u.pathname.endsWith('/moi_nhat.dgbw')) return route.fulfill({ status: 200, headers: CORS, body: goi.bytes });
    if (u.pathname === '/rest/v1/delta' && r.method() === 'GET') return json(deltas);
    if (u.pathname === '/rest/v1/delta' && r.method() === 'POST') { posts.push(JSON.parse(r.postData())); return route.fulfill({ status: 201, headers: CORS }); }
    return route.fulfill({ status: 404, headers: CORS });
  });
  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.fill('#gate-user', ten); await page.fill('#gate-pass', 'matkhau');   // KHÔNG chọn file: gói tải từ Supabase
  await page.click('#gate-go');
  await page.waitForSelector('#splash', { state: 'detached', timeout: 20000 });
  return { page, posts, reqs };
}

(async () => {
  const DOCS = path.join(__dirname, '..', 'docs');
  const srv = http.createServer((req, res) => { const p = path.join(DOCS, decodeURIComponent(req.url.split('?')[0])); if (!p.startsWith(DOCS) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); }).listen(0);
  const port = srv.address().port, browser = await pw.chromium.launch();

  console.log('admin: gói tải từ Supabase + delta');
  const g = await taoGoi('admin');
  const row = { id: 7, khoi: 'db', du_lieu: await deltaMa(OP, g.key, 'delta|db|pb1') };
  let s = await phien(browser, port, { ten: 'admin', vaiTro: 'admin', goi: g, manifestSha: sha(g.bytes), deltas: [row] });
  const info = await s.page.evaluate(() => SECURE.dongBo());
  check(info.trang_thai === 'ket_noi' && info.phien_ban === 'pb1' && info.so_delta === 1, 'đồng bộ: ' + JSON.stringify(info));
  check(s.reqs.some(q => /doi_tuong=eq\.admin&goi=eq\.pb1/.test(q)), 'chỉ hỏi delta của đúng đối tượng và phiên bản gói');
  const db = JSON.parse(await s.page.evaluate(() => SECURE.load('db')));
  check(db.count === g.n + 1 && db.cols.name[g.n] === 'Hạng mục từ delta', `delta đã áp: ${g.n} → ${db.count} dòng`);
  const kq = await s.page.evaluate(async op => { await SECURE.ghiDelta('db', { admin: op, nhan_vien: { t: 'them', hang: [{ name: 'Bản cho nhân viên', u: 'm2', cp: 1 }] } }); return JSON.parse(await SECURE.load('db')).count; }, OP);
  check(s.posts.length === 1 && s.posts[0].length === 2, 'ghi delta: một lần POST, hai dòng (admin + nhân viên)');
  const [r1, r2] = s.posts[0];
  check(r1.doi_tuong === 'admin' && r2.doi_tuong === 'nhan_vien' && r1.goi === 'pb1' && r1.khoi === 'db', 'dòng ghi có đối tượng, khối, phiên bản đúng');
  check(!JSON.stringify(s.posts).includes('Hạng mục từ delta'), 'dữ liệu gửi lên là bản mã, không lộ chữ gốc');
  check((await deltaGiai(r1.du_lieu, g.key, 'delta|db|pb1')).hang[0].name === 'Hạng mục từ delta', 'giải mã được bằng khóa của gói');
  check(kq === g.n + 2, 'delta vừa ghi hiện ngay trong phiên: ' + kq);
  await s.page.close();

  console.log('admin: gói đang mở không khớp manifest (gói cũ)');
  s = await phien(browser, port, { ten: 'admin', vaiTro: 'admin', goi: g, manifestSha: 'khac', deltas: [row] });
  const cu = await s.page.evaluate(() => SECURE.dongBo());
  check(cu.trang_thai === 'goi_cu' && cu.so_delta === 0, 'gói cũ: không áp delta ' + JSON.stringify(cu));
  check(JSON.parse(await s.page.evaluate(() => SECURE.load('db'))).count === g.n, 'dữ liệu giữ nguyên gói gốc');
  const loi = await s.page.evaluate(() => SECURE.ghiDelta('db', { admin: { t: 'them', hang: [] } }).then(() => 'ghi', e => e.message));
  check(/Chưa đồng bộ/.test(loi) && s.posts.length === 0, 'gói cũ: từ chối ghi delta — ' + loi);
  await s.page.close();

  console.log('nhân viên');
  const gn = await taoGoi('nv1');
  const rn = { id: 9, khoi: 'db', du_lieu: await deltaMa(OP, gn.key, 'delta|db|pb1') };
  s = await phien(browser, port, { ten: 'nv1', vaiTro: 'nhan_vien', goi: gn, manifestSha: sha(gn.bytes), deltas: [rn] });
  check(JSON.parse(await s.page.evaluate(() => SECURE.load('db'))).count === gn.n + 1, 'nhân viên nhận delta của đối tượng nhan_vien');
  check(s.reqs.some(q => q.includes('moi_nhat.dgbw') && q.includes('/nhan_vien/')), 'tải gói từ thư mục nhan_vien/');
  const e2 = await s.page.evaluate(() => SECURE.ghiDelta('db', { admin: { t: 'them', hang: [] } }).then(() => 'ghi', e => e.message));
  check(/Chỉ admin/.test(e2) && s.posts.length === 0, 'nhân viên không ghi được delta — ' + e2);
  await s.page.close();

  console.log('mất kết nối Supabase');
  const p3 = await browser.newPage();
  await p3.route(URL_SB + '/**', r => r.abort());
  await p3.goto(`http://127.0.0.1:${port}/index.html`);
  await p3.fill('#gate-user', 'admin'); await p3.fill('#gate-pass', 'matkhau');
  await p3.setInputFiles('#gate-file', { name: 'test.dgbw', mimeType: 'application/json', buffer: g.bytes });
  await p3.click('#gate-go'); await p3.waitForSelector('#splash', { state: 'detached', timeout: 30000 });
  check((await p3.evaluate(() => SECURE.dongBo())).trang_thai === 'ngoai_tuyen', 'mất mạng: vẫn đăng nhập bằng file gói, chạy offline');
  await p3.close();

  await browser.close(); srv.close();
  console.log(fails ? `THẤT BẠI: ${fails}` : 'Đạt.');
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
