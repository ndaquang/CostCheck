'use strict';
/* Hàm dùng chung cho công cụ học (hoc.js) và làm sạch (lam_sach.js): nạp CSDL, đọc / ghi Excel qua Python + openpyxl. */
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const DXG = require('../assets/pricing.js');

const argv = process.argv.slice(2);
const arg = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const args = k => argv.flatMap((a, i) => a === k && argv[i + 1] ? [path.resolve(argv[i + 1])] : []);
const flag = k => argv.includes(k);

const readJsObj = file => {
  const txt = fs.readFileSync(file, 'utf8');
  const a = txt.indexOf('{'), b = txt.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('Không đọc được CSDL ' + file);
  return JSON.parse(txt.slice(a, b + 1));
};
// Nguồn dữ liệu, giống trang web (bản admin):
//   --db <db.js>                 CSDL thật dạng data/db.js (window.DB = {...}) hoặc JSON; khối db của 2_XU_LY đã gồm Nội bộ + CTG (cột ng)
//   --du-lieu <thư mục data>     db.js + doithu.js (+ ctg.js) trong thư mục, vd 3_WEB_OFFLINE/data
//   --goi <gói admin .dgbw> --user <admin>   đọc thẳng gói dữ liệu: khối db, doithu (+ ctg) mà tài khoản mở được
//                                (mật khẩu: biến môi trường DGW_MAT_KHAU, hoặc hỏi khi chạy, không hiện ký tự)
//   --them <file.js>[=Nhãn]      (lặp được) gộp thêm nguồn giá cùng định dạng (vd data/doithu.js = Đối thủ)
// Không truyền gì thì dùng CSDL giả lập của bộ chạy thử. Nguồn phụ (đối thủ, CTG) gộp bằng mergeDB như trang web; nguồn đã có
// trong CSDL (vd CTG đã làm sạch chung trong khối db) thì không gộp lần nữa.
// opt.them = false: chỉ CSDL chính, không gộp nguồn phụ (lam_sach.js --sua).
const NHAN = { doithu: 'Đối thủ', ctg: 'CTG' };
function loadDB(file, { them = true } = {}) {
  const phu = [];   // [{ file, label, db }]
  let db, nhan, demo = false;
  if (arg('--goi')) {
    const ten = arg('--user');
    if (!ten) throw new Error('--goi cần --user <tên đăng nhập admin>.');
    const k = docGoi(path.resolve(arg('--goi')), ten);
    if (!k.db) throw new Error('Gói không có khối db, hoặc tài khoản không mở được khối này.');
    db = k.db; nhan = path.basename(arg('--goi'));
    for (const kind of ['doithu', 'ctg']) if (k[kind]) phu.push({ file: `${nhan} (khối ${kind})`, label: NHAN[kind], db: k[kind] });
  } else if (arg('--du-lieu')) {
    const dir = path.resolve(arg('--du-lieu'));
    db = readJsObj(path.join(dir, 'db.js')); nhan = path.join(arg('--du-lieu'), 'db.js');
    for (const kind of ['doithu', 'ctg']) { const f = path.join(dir, kind + '.js'); if (fs.existsSync(f)) phu.push({ file: kind + '.js', label: NHAN[kind], db: readJsObj(f) }); }
  } else if (file) { db = readJsObj(file); nhan = arg('--db'); }
  else { db = require('../demo/du_lieu_mau.js').taoDB(); demo = true; nhan = 'GIẢ LẬP (bộ chạy thử)'; }
  argv.forEach((a, i) => {
    if (a !== '--them' || !argv[i + 1]) return;
    const [f, label] = argv[i + 1].split('=');
    const base = path.basename(f).replace(/\.\w+$/, '');
    phu.push({ file: path.basename(f), label: label || NHAN[base.toLowerCase()] || base, db: readJsObj(path.resolve(f)) });
  });
  const out = { db, demo, nhan, nguon: [], boQua: [] };
  for (const x of phu) {
    if (!them) out.boQua.push(x.label);
    else if (DXG.hasSource(db, x.label)) out.nguon.push({ file: x.file, label: x.label, coSan: true, dong: 0 });
    else out.nguon.push({ file: x.file, label: x.label, ...DXG.mergeDB(db, x.db, x.label) });
  }
  return out;
}
// Gói dữ liệu .dgbw → { tên khối: dữ liệu } các khối tài khoản mở được (cùng định dạng shared/crypto-web.js)
function docGoi(file, ten) {
  const { moKhoa, giaiKhoi } = require('../../ctg/dong_goi.js');
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
  const keys = moKhoa(pkg, ten, matKhau(ten)), out = {};
  for (const [kind, k] of Object.entries(pkg.khoi || {})) if (keys[k.khoa]) out[kind] = giaiKhoi(k.du_lieu, keys[k.khoa], kind);
  for (const k of Object.values(keys)) k.fill(0);
  return out;
}
// Mật khẩu: DGW_MAT_KHAU, hoặc hỏi không hiện ký tự (getpass của Python, chạy đồng bộ như phần còn lại của công cụ)
function matKhau(ten) {
  if (process.env.DGW_MAT_KHAU) return process.env.DGW_MAT_KHAU;
  for (const py of ['python3', 'python']) {
    try { return execFileSync(py, ['-c', 'import getpass,sys;sys.stdout.write(getpass.getpass(sys.argv[1]))', `Mật khẩu của ${ten}: `], { stdio: ['inherit', 'pipe', 'inherit'] }).toString(); }
    catch (e) { if (e.code !== 'ENOENT') throw new Error('Không đọc được mật khẩu.'); }
  }
  throw new Error('Cần Python để hỏi mật khẩu, hoặc đặt biến môi trường DGW_MAT_KHAU.');
}
// "Nội bộ 12.345 · CTG 2.000 · Đối thủ 3.456" theo cột nguồn ng (rỗng nếu chỉ một nguồn)
function moTaNguon(db) {
  const C = db.cols, D = db.dicts || {};
  if (!Array.isArray(C.ng) || !Array.isArray(D.ng)) return '';
  const cnt = new Map();
  for (const v of C.ng) { const l = D.ng[v] || 'Nội bộ'; cnt.set(l, (cnt.get(l) || 0) + 1); }
  return cnt.size > 1 ? [...cnt].map(([l, n]) => `${l} ${n.toLocaleString('vi-VN')}`).join(' · ') : '';
}
const inNguon = nguon => { for (const x of nguon) console.log(x.coSan ? `Nguồn ${x.label} (${x.file}): đã có trong CSDL, không gộp lần nữa` : `Gộp nguồn ${x.label} (${x.file}): ${x.dong} dòng, ${x.nhomChung} nhóm trùng với CSDL, ${x.nhomMoi} nhóm mới`); };
// Nhãn nguồn của dòng i ('Nội bộ' nếu CSDL không có cột ng)
const nguonCua = (db, i) => (Array.isArray(db.cols.ng) && db.dicts.ng && db.dicts.ng[db.cols.ng[i]]) || 'Nội bộ';
const readXlsx = file => JSON.parse(execFileSync('python3', [path.join(__dirname, 'doc_xlsx.py'), file], { maxBuffer: 1 << 30 }).toString());
function writeXlsx(report, file) {
  const tmp = file + '.json';
  fs.writeFileSync(tmp, JSON.stringify(report));
  try { execFileSync('python3', [path.join(__dirname, 'xuat_xlsx.py'), tmp, file]); } finally { fs.rmSync(tmp, { force: true }); }
}
// Tìm cột theo tên tiêu đề (đã chuẩn hóa) trong 30 dòng đầu; req: các cột bắt buộc. -> { headerRow, cols: {key: c} }
function findHeader(grid, want, req) {
  for (let r = 0; r < Math.min(grid.length, 30); r++) {
    const row = grid[r] || [], cols = {};
    row.forEach((v, c) => {
      const n = DXG.norm(v);
      for (const [k, names] of Object.entries(want)) if (cols[k] === undefined && names.some(x => n === x || n.startsWith(x + ' '))) cols[k] = c;
    });
    if (req.every(k => cols[k] !== undefined)) return { headerRow: r, cols };
  }
  return null;
}
const pct = (a, b) => b ? a / b : null;
module.exports = { DXG, fs, path, arg, args, flag, loadDB, docGoi, moTaNguon, nguonCua, inNguon, readXlsx, writeXlsx, findHeader, pct };
