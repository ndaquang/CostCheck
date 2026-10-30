'use strict';
// Kiểm thử mã hóa delta + áp delta: node tests/test_dong_bo.js
const assert = require('assert');
const fs = require('fs'), path = require('path'), vm = require('vm');

const ctx = { window: {}, crypto: globalThis.crypto, TextEncoder, TextDecoder, atob, btoa, Response, Blob, CompressionStream, DecompressionStream, fetch: () => { throw new Error('không gọi mạng'); }, console };
ctx.window = ctx; ctx.DGW = undefined;
vm.createContext(ctx);
for (const f of ['crypto-web.js', 'dong-bo.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'shared', f), 'utf8'), ctx, { filename: f });
const { DGW, DONGBO } = ctx;
const { makeDB } = require('../modules/de_xuat_gia/tests/fixture_db.js');

(async () => {
  const key = await crypto.subtle.importKey('raw', crypto.getRandomValues(new Uint8Array(32)), 'AES-GCM', false, ['encrypt', 'decrypt']);
  const key2 = await crypto.subtle.importKey('raw', crypto.getRandomValues(new Uint8Array(32)), 'AES-GCM', false, ['encrypt', 'decrypt']);

  // 1. Vòng mã hóa → giải mã, kể cả tiếng Việt
  const op = { t: 'them', hang: [{ name: 'Đổ bê tông móng M300 — phát sinh', u: 'm3', cp: 1700000 }] };
  const ct = await DONGBO.maHoaDelta(op, 'db', key, 'pb1');
  assert.deepStrictEqual(JSON.parse(await DGW.giaiKhoi(ct, key, DONGBO.aadDelta('db', 'pb1'))), op);
  assert(!Buffer.from(ct, 'base64').toString('latin1').includes('bê tông'), 'bản mã không được lộ chữ gốc');
  // 2. Sai khóa / sai khối / sai phiên bản đều bị từ chối (AAD gắn delta với ngữ cảnh)
  await assert.rejects(DGW.giaiKhoi(ct, key2, DONGBO.aadDelta('db', 'pb1')));
  await assert.rejects(DGW.giaiKhoi(ct, key, DONGBO.aadDelta('doithu', 'pb1')));
  await assert.rejects(DGW.giaiKhoi(ct, key, DONGBO.aadDelta('db', 'pb2')));
  // 3. Hai lần mã hóa cùng nội dung cho bản mã khác nhau (nonce ngẫu nhiên)
  assert.notStrictEqual(ct, await DONGBO.maHoaDelta(op, 'db', key, 'pb1'));

  // 4. giaiDelta: bỏ delta hỏng, đếm lại, lọc theo khối
  const rows = [{ id: 1, khoi: 'db', du_lieu: ct }, { id: 2, khoi: 'db', du_lieu: await DONGBO.maHoaDelta(op, 'db', key2, 'pb1') }, { id: 3, khoi: 'doithu', du_lieu: ct }];
  const g = await DONGBO.giaiDelta(rows, 'db', key, 'pb1');
  assert.strictEqual(g.ops.length, 1); assert.strictEqual(g.hong, 1); assert.strictEqual(g.ops[0].id, 1);

  // 5. Mật khẩu đồng bộ: ổn định, khác mật khẩu gốc, tách theo người dùng, không phân biệt hoa thường tên
  const a = await DGW.matKhauDongBo('mk-test', 'Admin', 1000);
  assert.strictEqual(a, await DGW.matKhauDongBo('mk-test', 'admin', 1000));
  assert.notStrictEqual(a, await DGW.matKhauDongBo('mk-test', 'nv1', 1000));
  assert(!a.includes('mk-test') && /^[0-9a-f]{64}$/.test(a));

  // 6. Áp delta lên dữ liệu dạng cột: mọi cột cùng độ dài, chỉ số từ điển và dự án đúng
  const db = makeDB();
  const n0 = db.count, np0 = db.projects.length;
  const P = ['DT99', 'Dự án mới', 'Nhà xưởng', 'Long An', 'Tây Ninh', 'CĐT Z'];
  require('../modules/de_xuat_gia/tests/fixture_db.js').fullDB(db);
  const them = DONGBO.apDung(db, { t: 'them', hang: [
    { name: 'Hạng mục mới A', u: 'm2', p: P, y: 2026, cp: 100000, p26: 100000, tot: 90000, c: 'NCC mới', f: 'moi.xlsx' },
    { name: 'Hạng mục mới B', u: 'cái', p: P, y: 2026, cp: 5000 },
    { khong_co_ten: true },
  ] });
  assert.strictEqual(them, 2); assert.strictEqual(db.count, n0 + 2);
  for (const k of Object.keys(db.cols)) assert.strictEqual(db.cols[k].length, db.count, 'cột ' + k);
  assert.strictEqual(db.projects.length, np0 + 1, 'dự án mới thêm một lần, dòng thứ hai dùng lại');
  const i = n0, C = db.cols, D = db.dicts;
  assert.strictEqual(C.name[i], 'Hạng mục mới A'); assert.strictEqual(D.u[C.u[i]], 'm2'); assert.strictEqual(D.cu[C.cu[i]], 'm2');
  assert.strictEqual(C.p[i], np0); assert.strictEqual(C.p[i + 1], np0);
  assert.strictEqual(D.c[C.c[i]], 'NCC mới'); assert.strictEqual(D.f[C.f[i]], 'moi.xlsx');
  assert.strictEqual(C.g[i], -1, 'chưa nhóm'); assert.strictEqual(C.ol[i], -1); assert.strictEqual(C.st[i], 0);
  assert.strictEqual(C.p26[i + 1], 5000, 'p26 mặc định = cp'); assert.strictEqual(C.c[i + 1], -1);
  // cột dẫn xuất suy mặc định từ dữ liệu: cột chỉ số → -1 (không phải null), cột nullable → null, id duy nhất
  assert.strictEqual(C.par[i], -1); assert.strictEqual(C.loc[i], -1); assert.strictEqual(C.mat[i], null); assert.strictEqual(C.spec[i], '');
  assert.strictEqual(C.dup[i], 1); assert.strictEqual(new Set(C.id).size, db.count, 'id không trùng');
  // op lạ hoặc rỗng không làm hỏng dữ liệu
  assert.strictEqual(DONGBO.apDung(db, { t: 'xoa' }), 0); assert.strictEqual(DONGBO.apDung(db, null), 0);

  console.log('✓ test_dong_bo: mã hóa/giải mã delta, AAD, mật khẩu đồng bộ, áp delta');
})().catch(e => { console.error(e); process.exit(1); });
