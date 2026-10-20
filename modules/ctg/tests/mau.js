'use strict';
/* Dữ liệu GIẢ LẬP cùng cấu trúc sheet DATABASE của DATABASE_CTG.xlsx (không phải dữ liệu thật) và gói .dgbw giả lập
   tạo bằng WebCrypto như trình duyệt (shared/crypto-web.js), để kiểm thử độc lập với công cụ đóng gói. */
const zlib = require('zlib');
const { webcrypto: wc } = require('crypto');

const TIEU_DE = ['Tên công việc', 'Đơn vị', 'Mã gốc', 'Mã công tác link', 'Nhân công', 'Vật tư', 'Tổng cộng', 'Tên dự án', 'Năm', 'File nguồn', 'Tên công việc gốc (trước khi dịch)'];
function luoiMau() {
  const cv = [   // [tên, đơn vị, mã link, nhân công, vật tư]
    ['Bê tông lót M150', 'm3', 'MC.CON-Lean', 180000, 1500000],
    ['Bê tông lót M100', 'm3', 'MC.CON-Lean100', 175000, 1400000],
    ['Bê tông lót móng, đà kiềng B7.5 (M100)', 'm3', 'MC.CON-Lean-F', 190000, 1450000],
    ['CCLD ván khuôn móng, đà kiềng, nền trệt', 'm2', 'MC.FW-F', 95000, 60000],
    ['Lắp dựng tháo dỡ ván khuôn cột', 'm2', 'MC.FW-C', 110000, 70000],
    ['Cốt thép CB240 300 400 500', 'kg', 'MC.RB-CB', 4100, 16800],
    ['Xây tường gạch dày 200 mm', 'm2', 'MC.MAS-BRICK-200', 200000, 397000],
    ['Trát má cửa', 'md', 'MC.PLS-JAMB', 17600, 17600],
    ['Trát tường trong dày 15mm, M75', 'm2', 'MC.PLS-INT-15', 94100, 22400],
    ['Sơn nước tường trong nhà bao gồm bả, 1 lớp lót và 2 lớp sơn phủ', 'm2', 'MC.PT-W-IN', 30000, 45000],
    ['Hố ga xây gạch loại 3 kích thước 1,64x1,64m', 'cái', 'INF.MH-3', 900000, 2100000],
    ['Bê tông nhựa chặt loại BTNC 12.5, dày 6cm', 'm2', 'INF.ASP-125', 20000, 210000],
    ['Cửa sổ nhôm sơn tĩnh điện kính cường lực 6mm', 'm2', 'SC.AL-W1', 250000, 1900000],
    ['Lanh tô 180x180', 'md', 'MC.LT-180', 60000, 90000],
    ['Đào đất hố móng, đà kiềng', 'm3', 'MC.ER-Exca', 85000, 0],
    ['Quét chống thấm chuyên dụng 3 lớp - mái', 'm2', 'SC.WP-R', 40000, 160000],
  ];
  const duAn = [['NHA XUONG A', 2024, 'NHA XUONG A_CTG_240105.xlsx'], ['VAN PHONG B', 2025, '250310_VAN PHONG B_CTG.xlsx'],
    ['KHO C', 2026, 'KHO C_CTG Lan 1_260120.xlsx'], ['NHA MAY D', 2026, '260415-NHA MAY D CTG.xlsx']];
  const grid = [TIEU_DE];
  duAn.forEach(([da, nam, file], k) => cv.forEach(([ten, dv, link, nc, vt], j) => {
    const h = 1 + ((k * 7 + j * 3) % 9 - 4) / 40;   // dao động giá giữa các dự án
    grid.push([ten, k === 1 && dv === 'cái' ? 'nos' : dv, link.split('-').slice(1).join('-'), link, Math.round(nc * h), Math.round(vt * h), Math.round((nc + vt) * h), da, nam, file, null]);
  }));
  grid.push(['Bê tông lót M150', 'M3', 'Lean', 'MC.CON-Lean', 200000, 1600000, 1800000 * 3.6, 'KHO C', 2026, 'KHO C_CTG Lan 1_260120.xlsx', null]);   // giá bất thường
  grid.push(['Khấu trừ phế liệu', 'tấn', 'KhauTru', 'PL.KP-KhauTru', -1000000, 0, -1000000, 'NHA MAY D', 2026, '260415-NHA MAY D CTG.xlsx', null]);
  grid.push(['Bê tông lót M150', 'm3', 'Lean', 'MC.CON-Lean', 180000, 1500000, 1680000, 'VAN PHONG B', 2025, '250310_VAN PHONG B_CTG.xlsx', 'Lean concrete M150']);   // dòng đã dịch
  return grid;
}

const b64 = u => Buffer.from(u).toString('base64');
const enc = new TextEncoder();
// Gói giả lập: admin (khóa nv + admin), nv1 (chỉ khóa nv); khoi: { tên: [đối tượng, 'nv' | 'admin'] }
async function goiMau(khoi, matKhau = 'matkhau') {
  const salt = wc.getRandomValues(new Uint8Array(16)), iter = 1000;
  const base = await wc.subtle.importKey('raw', enc.encode(matKhau), 'PBKDF2', false, ['deriveKey']);
  const kek = await wc.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const raw = { nv: wc.getRandomValues(new Uint8Array(32)), admin: wc.getRandomValues(new Uint8Array(32)) };
  const wrap = async (k, aad) => { const iv = wc.getRandomValues(new Uint8Array(12)); return b64(Buffer.concat([iv, Buffer.from(await wc.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, kek, k))])); };
  const block = async (obj, k, aad) => {
    const key = await wc.subtle.importKey('raw', k, 'AES-GCM', false, ['encrypt']), iv = wc.getRandomValues(new Uint8Array(12));
    const ct = await wc.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, zlib.gzipSync(JSON.stringify(obj)));
    return b64(Buffer.concat([Buffer.from('DGW1'), iv, Buffer.from(ct)]));
  };
  const user = async (ten, admin) => ({ ten_dang_nhap: ten, ho_ten: ten.toUpperCase(), hoat_dong: true, salt: b64(salt), kdf: { iter },
    khoa: { nv: await wrap(raw.nv, `${ten}|nv`), ...(admin ? { admin: await wrap(raw.admin, `${ten}|admin`) } : {}) } });
  const out = { dinh_dang: 'DGW1', users: [await user('admin', true), await user('nv1', false)], khoi: {} };
  for (const [ten, [obj, k]] of Object.entries(khoi)) out.khoi[ten] = { khoa: k, du_lieu: await block(obj, raw[k], ten) };
  return out;
}
// Giải mã như trình duyệt (crypto-web.js): khóa admin mở từ mật khẩu, rồi giải khối
async function moNhuTrinhDuyet(pkg, ten, matKhau, kind) {
  const u = pkg.users.find(x => x.ten_dang_nhap === ten);
  const base = await wc.subtle.importKey('raw', enc.encode(matKhau), 'PBKDF2', false, ['deriveKey']);
  const kek = await wc.subtle.deriveKey({ name: 'PBKDF2', salt: Buffer.from(u.salt, 'base64'), iterations: u.kdf.iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const khoi = pkg.khoi[kind], w = Buffer.from(u.khoa[khoi.khoa], 'base64');
  const k = await wc.subtle.decrypt({ name: 'AES-GCM', iv: w.subarray(0, 12), additionalData: enc.encode(`${ten}|${khoi.khoa}`) }, kek, w.subarray(12));
  const key = await wc.subtle.importKey('raw', k, 'AES-GCM', false, ['decrypt']);
  const r = Buffer.from(khoi.du_lieu, 'base64');
  const plain = await wc.subtle.decrypt({ name: 'AES-GCM', iv: r.subarray(4, 16), additionalData: enc.encode(kind) }, key, r.subarray(16));
  return JSON.parse(zlib.gunzipSync(Buffer.from(plain)).toString('utf8'));
}

module.exports = { TIEU_DE, luoiMau, goiMau, moNhuTrinhDuyet };
