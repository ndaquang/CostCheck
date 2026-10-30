'use strict';
// In mật khẩu Supabase (suy ra từ mật khẩu app) cho một tài khoản, dùng đúng hàm của trình duyệt.
// Dùng: node scripts/mat_khau_dong_bo.js <tên đăng nhập> <admin|nhan_vien>      (hỏi mật khẩu app, không hiện ký tự)
const fs = require('fs'), path = require('path'), vm = require('vm'), readline = require('readline');
const [ten, vaiTro] = process.argv.slice(2);
if (!ten || !['admin', 'nhan_vien'].includes(vaiTro)) { console.error('Dùng: node scripts/mat_khau_dong_bo.js <tên đăng nhập> <admin|nhan_vien>'); process.exit(1); }

const ctx = { crypto: globalThis.crypto, TextEncoder, TextDecoder, atob, btoa, Response, Blob, CompressionStream, DecompressionStream };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['crypto-web.js', 'dong-bo.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'shared', f), 'utf8'), ctx);

const rl = readline.createInterface({ input: process.stdin, output: process.stderr, terminal: true });
rl._writeToOutput = s => { if (s.includes('Mật khẩu app')) rl.output.write(s); };   // không hiện mật khẩu đang gõ
rl.question('Mật khẩu app: ', async mk => {
  rl.close(); console.error('');
  const email = ten.toLowerCase() + '@dgbw.local';
  const pw = await ctx.DGW.matKhauDongBo(mk, ten, ctx.DONGBO.SYNC_ITER);
  console.log(`Email:    ${email}\nMật khẩu: ${pw}\n\n-- Dashboard → Authentication → Add user (Auto Confirm), rồi chạy:\n` +
    `update auth.users set raw_app_meta_data = raw_app_meta_data || '{"vai_tro":"${vaiTro}"}' where email = '${email}';`);
});
