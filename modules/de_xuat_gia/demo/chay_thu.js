'use strict';
/* CHẠY THỬ module Điền giá BOQ trên dữ liệu GIẢ LẬP.
   Dùng:  node modules/de_xuat_gia/demo/chay_thu.js [thư mục kết quả]     (mặc định: demo/ket_qua)
          node modules/de_xuat_gia/demo/chay_thu.js --mo                  mở trang chạy thử để tự thao tác
   Sinh BOQ nhà xưởng mẫu (36 dòng) rồi chạy chay_file.js:
     1. BOQ chưa có giá  → điền giá tốt nhất vào cột Đơn giá
     2. BOQ đã có một phần giá QS → chỉ điền ô trống, giữ nguyên giá QS */
const fs = require('fs'), path = require('path'), http = require('http');
const { execFileSync } = require('child_process');

const MOD = path.resolve(__dirname, '..');
const MO = process.argv.includes('--mo');
const OUT = path.resolve(process.argv.slice(2).find(a => !a.startsWith('--')) || path.join(__dirname, 'ket_qua'));
const IN = path.join(OUT, 'dau_vao');
fs.mkdirSync(IN, { recursive: true });
execFileSync('python3', [path.join(__dirname, 'tao_boq_mau.py'), IN]);

if (MO) {
  const SITE = path.join(OUT, '.trang_chay_thu');
  fs.rmSync(SITE, { recursive: true, force: true }); fs.mkdirSync(path.join(SITE, 'data'), { recursive: true });
  fs.cpSync(path.join(MOD, 'assets'), path.join(SITE, 'assets'), { recursive: true });
  fs.copyFileSync(path.join(MOD, 'index.html'), path.join(SITE, 'index.html'));
  fs.writeFileSync(path.join(SITE, 'data', 'db.js'), 'window.DB = ' + JSON.stringify(require('./du_lieu_mau.js').taoDB()) + ';');
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' };
  http.createServer((req, res) => {
    const p = path.join(SITE, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
    if (!p.startsWith(SITE) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
  }).listen(8765, () => console.log(`Trang chạy thử (CSDL giả lập): http://127.0.0.1:8765/index.html\nFile mẫu để nạp: ${IN}\nCtrl+C để dừng.`));
  return;
}

const run = (boq, out) => execFileSync('node', [path.join(__dirname, 'chay_file.js'), '--boq', boq, '--out', out], { stdio: 'inherit' });
console.log('== 1. BOQ chưa có giá');
run(path.join(IN, 'BOQ_ChayThu.xlsx'), path.join(OUT, '1_chua_co_gia'));
console.log('\n== 2. BOQ đã có một phần giá QS');
run(path.join(IN, 'BOQ_ChayThu_QS.xlsx'), path.join(OUT, '2_da_co_mot_phan_gia'));
console.log(`\nKết quả: ${OUT}`);
