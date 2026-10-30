'use strict';
/* Giải mã gói dữ liệu ngay trên trình duyệt bằng WebCrypto.
   Định dạng khớp với tools/quan_tri_web.py:
   • Khóa từ mật khẩu: PBKDF2-SHA256 (số vòng lưu trong gói) → AES-256-GCM để bọc khóa dữ liệu
   • Khối dữ liệu: "DGW1" + nonce (12 byte) + AES-256-GCM(gzip(JSON)), AAD = tên khối
   Mã nguồn này không chứa khóa nào. Khóa chỉ tồn tại trong bộ nhớ sau khi nhập đúng mật khẩu. */
(() => {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const MAGIC = 'DGW1';

  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  // Khóa bọc (KEK) từ mật khẩu. extractable = false: không đọc lại được bằng JavaScript.
  async function khoaTuMatKhau(matKhau, salt, soVong) {
    const nen = await crypto.subtle.importKey('raw', enc.encode(matKhau), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: soVong, hash: 'SHA-256' },
      nen, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  }

  // Mở khóa dữ liệu đã bọc trong tài khoản → CryptoKey chỉ dùng để giải mã
  async function moKhoaBoc(boc, kek, aad) {
    const raw = b64(boc);
    const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.subarray(0, 12), additionalData: enc.encode(aad) }, kek, raw.subarray(12));
    const key = await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);   // encrypt: ghi delta
    new Uint8Array(bytes).fill(0);   // xóa bản thô khỏi bộ nhớ
    return key;
  }

  // Giải mã một khối dữ liệu → chuỗi JSON
  async function giaiKhoi(duLieu, key, aad) {
    const raw = b64(duLieu);
    if (dec.decode(raw.subarray(0, 4)) !== MAGIC) throw new Error('Gói dữ liệu không đúng định dạng.');
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.subarray(4, 16), additionalData: enc.encode(aad) }, key, raw.subarray(16));
    return new Response(new Blob([plain]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  }

  const toB64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };

  // Mã hóa chuỗi JSON thành khối cùng định dạng với giaiKhoi: "DGW1" + nonce + AES-GCM(gzip(JSON)), base64
  async function maHoaKhoi(chuoi, key, aad) {
    const nen = new Uint8Array(await new Response(new Blob([enc.encode(chuoi)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, nen));
    const out = new Uint8Array(16 + ct.length);
    out.set(enc.encode(MAGIC), 0); out.set(iv, 4); out.set(ct, 16);
    return toB64(out);
  }

  // Mật khẩu riêng cho Supabase, suy ra từ mật khẩu app bằng PBKDF2 với muối tách biệt: Supabase không bao giờ thấy mật khẩu gốc
  async function matKhauDongBo(matKhau, tenDangNhap, soVong) {
    const nen = await crypto.subtle.importKey('raw', enc.encode(matKhau), 'PBKDF2', false, ['deriveBits']);
    const muoi = enc.encode('dgbw-dong-bo|' + tenDangNhap.toLowerCase());
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: muoi, iterations: soVong, hash: 'SHA-256' }, nen, 256));
    return Array.from(bits, b => b.toString(16).padStart(2, '0')).join('');
  }

  async function sha256Hex(u8) {
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', u8)), b => b.toString(16).padStart(2, '0')).join('');
  }

  window.DGW = { b64, toB64, khoaTuMatKhau, moKhoaBoc, giaiKhoi, maHoaKhoi, matKhauDongBo, sha256Hex };
})();
