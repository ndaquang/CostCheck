'use strict';
/* Gom CSDL chiết tính giá (DATABASE_CTG.xlsx) vào GÓI DỮ LIỆU ADMIN (.dgbw) dưới khối "ctg".
   • Khối "ctg" mã hóa bằng khóa admin: chỉ tài khoản admin mở được; gói nhân viên không chứa khối này.
   • Cần đăng nhập một tài khoản admin có trong gói (để mở khóa admin). Mật khẩu hỏi khi chạy, không hiện ký tự
     (hoặc đặt biến môi trường DGW_MAT_KHAU). Phần còn lại của gói giữ nguyên.
   • Gói cũ được giữ ở <gói>.truoc_ctg. Mỗi lần dựng lại gói admin bằng công cụ quản trị, chạy lại lệnh này.
   Dùng:
     node modules/ctg/dong_goi.js --xlsx DATABASE_CTG.xlsx --goi DonGiaBOQ_admin.dgbw --user <admin> [--out <gói mới.dgbw>]
     node modules/ctg/dong_goi.js --xlsx DATABASE_CTG.xlsx --js WEB/data/ctg.js    chạy thử app không qua cổng đăng nhập
     node modules/ctg/dong_goi.js --xlsx DATABASE_CTG.xlsx                          chỉ đọc và in thống kê */
const fs = require('fs'), path = require('path'), crypto = require('crypto'), zlib = require('zlib');
const { execFileSync } = require('child_process');
const { taoCSDL, NRM2 } = require('./ctg.js');

const KHOI = 'ctg';
const MAGIC = Buffer.from('DGW1');

/* ---------- Mã hóa: cùng định dạng shared/crypto-web.js ---------- */
function timTaiKhoan(pkg, ten) {
  if (!pkg || pkg.dinh_dang !== 'DGW1' || !Array.isArray(pkg.users) || !pkg.khoi) throw new Error('Tệp này không phải gói dữ liệu của phần mềm.');
  const u = pkg.users.find(x => String(x.ten_dang_nhap).toLowerCase() === String(ten).toLowerCase());
  if (!u) throw new Error(`Gói không có tài khoản "${ten}".`);
  if (!u.hoat_dong) throw new Error(`Tài khoản "${u.ten_dang_nhap}" đang bị khóa.`);
  return u;
}
// Mở các khóa (nv, admin) mà tài khoản có trong gói bằng mật khẩu. -> { nv?: Buffer, admin?: Buffer }
function moKhoa(pkg, ten, matKhau) {
  const u = timTaiKhoan(pkg, ten);
  const kek = crypto.pbkdf2Sync(matKhau, Buffer.from(u.salt, 'base64'), u.kdf.iter, 32, 'sha256');
  const out = {};
  for (const [k, w] of Object.entries(u.khoa || {})) {
    const raw = Buffer.from(w, 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', kek, raw.subarray(0, 12));
    d.setAAD(Buffer.from(`${u.ten_dang_nhap}|${k}`));
    d.setAuthTag(raw.subarray(raw.length - 16));
    try { out[k] = Buffer.concat([d.update(raw.subarray(12, raw.length - 16)), d.final()]); }
    catch { throw new Error('Sai mật khẩu.'); }
  }
  return out;
}
function moKhoaAdmin(pkg, ten, matKhau) {
  const u = timTaiKhoan(pkg, ten);
  if (!u.khoa || !u.khoa.admin) throw new Error(`"${u.ten_dang_nhap}" không có khóa admin trong gói này (tài khoản nhân viên, hoặc đây là gói nhân viên).`);
  const k = moKhoa(pkg, ten, matKhau);
  if (k.nv) k.nv.fill(0);
  return k.admin;
}
function maHoaKhoi(obj, key, kind) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(kind));
  const ct = Buffer.concat([c.update(zlib.gzipSync(Buffer.from(JSON.stringify(obj)), { level: 9 })), c.final(), c.getAuthTag()]);
  return Buffer.concat([MAGIC, iv, ct]).toString('base64');
}
function giaiKhoi(duLieu, key, kind) {
  const raw = Buffer.from(duLieu, 'base64');
  if (!raw.subarray(0, 4).equals(MAGIC)) throw new Error('Khối dữ liệu không đúng định dạng.');
  const d = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(4, 16));
  d.setAAD(Buffer.from(kind));
  d.setAuthTag(raw.subarray(raw.length - 16));
  return JSON.parse(zlib.gunzipSync(Buffer.concat([d.update(raw.subarray(16, raw.length - 16)), d.final()])).toString('utf8'));
}
// Thêm (hoặc thay) khối ctg vào gói; kiểm tra giải mã lại được trước khi trả về
function goiCTG(pkg, db, ten, matKhau) {
  const key = moKhoaAdmin(pkg, ten, matKhau);
  const out = { ...pkg, khoi: { ...pkg.khoi, [KHOI]: { khoa: 'admin', du_lieu: maHoaKhoi(db, key, KHOI) } } };
  if (giaiKhoi(out.khoi[KHOI].du_lieu, key, KHOI).count !== db.count) throw new Error('Kiểm tra giải mã khối ctg không khớp.');
  key.fill(0);
  return out;
}

/* ---------- Đọc Excel (Python + openpyxl, như công cụ hoc/) ---------- */
function docXlsx(file) {
  const doc = path.join(__dirname, '..', 'de_xuat_gia', 'hoc', 'doc_xlsx.py');
  let loi;
  for (const py of ['python3', 'python']) {
    try { return JSON.parse(execFileSync(py, [doc, file], { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'pipe'] }).toString()); }
    catch (e) { loi = e; }
  }
  throw new Error(`Không đọc được ${file} (cần Python + openpyxl): ${String(loi.stderr || loi.message).trim().split('\n').pop()}`);
}
function sheetDatabase(wb) {
  const sh = wb.sheets.find(s => s.name.trim().toUpperCase() === 'DATABASE') || wb.sheets[0];
  if (!sh) throw new Error('File Excel không có sheet nào.');
  return sh.grid;
}

function hoiMatKhau(loiNhac) {
  if (process.env.DGW_MAT_KHAU) return Promise.resolve(process.env.DGW_MAT_KHAU);
  const stdin = process.stdin;
  process.stdout.write(loiNhac);
  return new Promise(res => {
    if (!stdin.isTTY) {   // đọc dòng đầu từ stdin khi chạy trong script
      let s = '';
      stdin.setEncoding('utf8');
      stdin.on('data', d => { s += d; });
      stdin.on('end', () => { process.stdout.write('\n'); res(s.split(/\r?\n/)[0]); });
      return;
    }
    let s = '';
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
    const nghe = chunk => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') { stdin.setRawMode(false); stdin.pause(); stdin.off('data', nghe); process.stdout.write('\n'); return res(s); }
        if (ch === '\u0003') { process.stdout.write('\n'); process.exit(130); }
        s = ch === '\u007f' || ch === '\b' ? s.slice(0, -1) : s + ch;
      }
    };
    stdin.on('data', nghe);
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const xlsx = arg('--xlsx'), goi = arg('--goi'), js = arg('--js');
  if (!xlsx) { console.error('Cần --xlsx <DATABASE_CTG.xlsx>. Xem hướng dẫn ở đầu file modules/ctg/dong_goi.js.'); process.exit(2); }

  const { db, thongKe: tk } = taoCSDL(sheetDatabase(docXlsx(path.resolve(xlsx))));
  const nf = n => n.toLocaleString('vi-VN');
  console.log(`CSDL chiết tính giá: ${nf(tk.dong)} đơn giá · ${nf(tk.nhom)} nhóm đại diện · ${nf(tk.du_an)} dự án · ${nf(tk.file)} file nguồn`);
  if (tk.bo.length) console.log(`  Bỏ ${tk.bo.length} dòng: ` + tk.bo.slice(0, 5).map(b => `dòng ${b.dong} (${b.ly_do})`).join(', ') + (tk.bo.length > 5 ? ', …' : ''));
  console.log(`  Giá bất thường (lệch > 3 lần trung vị nhóm): ${nf(tk.canh_bao)} dòng`);
  console.log('  NRM2: ' + NRM2.filter(n => tk.nrm[n[0]]).map(n => `${n[0]} ${nf(tk.nrm[n[0]])}`).join(' · '));

  if (js) {
    fs.mkdirSync(path.dirname(path.resolve(js)), { recursive: true });
    fs.writeFileSync(js, 'window.CTG = ' + JSON.stringify(db) + ';\n');
    console.log(`✓ Dữ liệu chạy thử: ${js}  (không đưa file này lên GitHub)`);
  }
  if (!goi) { if (!js) console.log('Chưa gói vào đâu. Thêm --goi <gói admin .dgbw> --user <admin> để gom vào gói admin.'); return; }

  const ten = arg('--user');
  if (!ten) { console.error('Cần --user <tên đăng nhập admin> để mở khóa admin của gói.'); process.exit(2); }
  const src = path.resolve(goi), out = path.resolve(arg('--out') || goi);
  const pkg = JSON.parse(fs.readFileSync(src, 'utf8'));
  const moi = goiCTG(pkg, db, ten, await hoiMatKhau(`Mật khẩu của ${ten}: `));
  if (out === src) fs.copyFileSync(src, src + '.truoc_ctg');
  fs.writeFileSync(out + '.tmp', JSON.stringify(moi));
  fs.renameSync(out + '.tmp', out);
  const kb = Math.round(moi.khoi[KHOI].du_lieu.length / 1024);
  console.log(`✓ ${pkg.khoi[KHOI] ? 'Thay' : 'Thêm'} khối "${KHOI}" (${nf(kb)} KB, khóa admin) → ${out}`);
  if (out === src) console.log(`  Gói cũ giữ ở ${src}.truoc_ctg`);
  console.log(`  Các khối trong gói: ${Object.entries(moi.khoi).map(([k, v]) => `${k} (${v.khoa})`).join(', ')}`);
}

if (require.main === module) main().catch(e => { console.error('DỪNG: ' + (e && e.message || e)); process.exit(1); });

module.exports = { moKhoa, moKhoaAdmin, maHoaKhoi, giaiKhoi, goiCTG, hoiMatKhau, KHOI };
