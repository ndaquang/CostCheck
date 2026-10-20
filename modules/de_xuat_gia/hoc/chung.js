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
// CSDL thật dạng data/db.js (window.DB = {...}) hoặc JSON; không truyền thì dùng CSDL giả lập của bộ chạy thử.
// --them <file.js>[=Nhãn] (lặp được): gộp thêm nguồn giá cùng định dạng (vd data/doithu.js = Đối thủ), như trang Điền giá BOQ.
const NHAN = { doithu: 'Đối thủ', ctg: 'CTG' };
function loadDB(file) {
  const out = file ? { db: readJsObj(file), demo: false } : { db: require('../demo/du_lieu_mau.js').taoDB(), demo: true };
  out.nguon = [];
  argv.forEach((a, i) => {
    if (a !== '--them' || !argv[i + 1]) return;
    const [f, label] = argv[i + 1].split('=');
    const base = path.basename(f).replace(/\.\w+$/, '');
    const r = DXG.mergeDB(out.db, readJsObj(path.resolve(f)), label || NHAN[base.toLowerCase()] || base);
    out.nguon.push({ file: path.basename(f), label: label || NHAN[base.toLowerCase()] || base, ...r });
  });
  return out;
}
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
module.exports = { DXG, fs, path, arg, args, flag, loadDB, readXlsx, writeXlsx, findHeader, pct };
