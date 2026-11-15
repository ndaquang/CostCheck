'use strict';
/* CSDL chiết tính giá (CTG): chuyển sheet DATABASE của DATABASE_CTG.xlsx thành bộ dữ liệu cùng định dạng window.DB
   của app tra cứu (cột theo dòng + từ điển), để app mở ở mục "CTG" (index.html?ds=ctg, chỉ admin).
   • Mỗi dòng giữ Tổng cộng, tách Vật tư / Nhân công; bỏ dòng Tổng cộng ≤ 0.
   • Nhóm đại diện = cùng tên công việc (đã chuẩn hóa) + cùng đơn vị; tên nhóm = cách ghi dùng ở nhiều dự án nhất.
   • Nhóm công việc NRM2 xếp theo từ khóa trong tên, không khớp thì theo tiền tố "Mã công tác link" (MC.FW-…, INF.MH-…).
   • Giá giữ nguyên theo từng file CTG (không quy đổi theo năm). */
const { norm, nrm2ByKeyword } = require('../de_xuat_gia/assets/pricing.js');

const COT = {   // tiêu đề cột sheet DATABASE (đã chuẩn hóa) → khóa
  ten: 'ten cong viec', dv: 'don vi', ma: 'ma goc', link: 'ma cong tac link', nc: 'nhan cong', vt: 'vat tu',
  tc: 'tong cong', da: 'ten du an', nam: 'nam', file: 'file nguon', goc: 'ten cong viec goc truoc khi dich',
};
const BAT_BUOC = ['ten', 'dv', 'tc', 'da'];

// [mã, tên, nhóm] — thứ tự nhóm ở đây là thứ tự hiện trong bộ lọc
const NRM2 = [
  ['01', 'Chi phí chung, biện pháp thi công', 'CHI PHÍ CHUNG'],
  ['03', 'Phá dỡ', 'PHÁ DỠ - CẢI TẠO'],
  ['05', 'Đào đắp đất', 'PHẦN NGẦM - NỀN MÓNG'],
  ['06', 'Xử lý nền, chống mối', 'PHẦN NGẦM - NỀN MÓNG'],
  ['07', 'Cọc', 'PHẦN NGẦM - NỀN MÓNG'],
  ['09', 'Tường vây, tường chắn', 'PHẦN NGẦM - NỀN MÓNG'],
  ['11', 'Bê tông đổ tại chỗ', 'KẾT CẤU'],
  ['15', 'Kết cấu thép', 'KẾT CẤU'],
  ['17', 'Mái tôn, tấm lợp', 'MÁI - BAO CHE - CHỐNG THẤM'],
  ['18', 'Mái ngói', 'MÁI - BAO CHE - CHỐNG THẤM'],
  ['19', 'Chống thấm', 'MÁI - BAO CHE - CHỐNG THẤM'],
  ['21', 'Ốp mặt ngoài, bao che', 'MÁI - BAO CHE - CHỐNG THẤM'],
  ['14', 'Khối xây (gạch/đá)', 'KIẾN TRÚC - HOÀN THIỆN'],
  ['20', 'Vách ngăn, tấm ốp', 'KIẾN TRÚC - HOÀN THIỆN'],
  ['23', 'Cửa sổ, vách kính', 'KIẾN TRÚC - HOÀN THIỆN'],
  ['24', 'Cửa đi, cửa cuốn', 'KIẾN TRÚC - HOÀN THIỆN'],
  ['25', 'Cầu thang, lan can', 'KIẾN TRÚC - HOÀN THIỆN'],
  ['26', 'Kim khí, chi tiết thép', 'KIẾN TRÚC - HOÀN THIỆN'],
  ['27', 'Kính', 'KIẾN TRÚC - HOÀN THIỆN'],
  ['28', 'Hoàn thiện sàn/tường/trần', 'KIẾN TRÚC - HOÀN THIỆN'],
  ['29', 'Sơn, trang trí', 'KIẾN TRÚC - HOÀN THIỆN'],
  ['30', 'Trần', 'KIẾN TRÚC - HOÀN THIỆN'],
  ['31', 'Cách nhiệt, chống cháy', 'KIẾN TRÚC - HOÀN THIỆN'],
  ['32', 'Nội thất, thiết bị, biển báo', 'KIẾN TRÚC - HOÀN THIỆN'],
  ['38', 'Cơ điện (MEP)', 'CƠ ĐIỆN'],
  ['34', 'Thoát nước ngầm', 'HẠ TẦNG - CẢNH QUAN'],
  ['35', 'Hạ tầng, san nền', 'HẠ TẦNG - CẢNH QUAN'],
  ['36', 'Hàng rào, cổng', 'HẠ TẦNG - CẢNH QUAN'],
  ['37', 'Cảnh quan, cây xanh', 'HẠ TẦNG - CẢNH QUAN'],
  ['00', 'Chưa phân loại', 'CHƯA PHÂN LOẠI'],
];

// Từ khóa theo tên công việc: quy tắc NRM2_TU_KHOA dùng chung với bước phân loại NRM2 khi gộp nguồn (pricing.js nrm2ByKeyword).
// Tiền tố "Mã công tác link" (sau MC. / SC. / INF.) khi tên không khớp từ khóa nào
const TIEN_TO = {
  '01': 'BPTC GE', '03': 'DE DEMO DISMANTLE', '05': 'ER EW BF WA', '06': 'AT', '07': 'PL D300 D350 D400 KN TC',
  '09': 'TD', '11': 'CON C STR LT LTBT FW RB WM JT JOINT KHE DUL', '14': 'MAS', '15': 'KCT', '17': 'RF AOT', '19': 'WP WF',
  '20': 'PAR WALL PANEL W', '23': 'AL ALU ALUMIUM NK', '24': 'DR DO DOOR CUA CUATHEP D DRKVP', '28': 'PLS TI TL FF FL ST STONE SANVN IL',
  '29': 'PT EP TP MOLD', '30': 'CEI GYP', '31': 'FP', '32': 'FUR ID EQ EQUIP SN ANCI', '34': 'SDS MH RCP TNM TNT KENHTIEU HATANG',
  '35': 'AGG ASP ROAD RD CURB VIAHE SKV SP RM ATGT EPARK INF', '36': 'GATE FE', '37': 'SS LS HC LANDCAPE', '38': 'MEP',
};
const MA_TIEN_TO = new Map(Object.entries(TIEN_TO).flatMap(([ma, ds]) => ds.split(' ').map(t => [t, ma])));

function phanLoai(ten, link) {
  const ma = nrm2ByKeyword(ten);
  if (ma) return ma;
  const dau = String(link || '').split('-')[0].split('.');
  return MA_TIEN_TO.get((dau[1] || dau[0]).trim().toUpperCase()) || '00';
}

// Đơn vị: gộp cách ghi khác nhau của cùng một đơn vị (nos / nr / cái…, lot / ls / trọn gói…)
const DON_VI = {
  m2: ['m2', 'm²', '1m²', 'm2`'], m3: ['m3', 'm³', '1m3'], m: ['m', 'md', 'm dài'], '100m': ['100m', '100md'],
  'cái': ['cái', 'cai', 'nos', 'no', 'no.', 'noos', 'nr', 'ea', 'pcs', 'unit'], 'bộ': ['bộ', 'set'],
  'gói': ['gói', 'goi', 'trọn gói', 'toàn bộ', 'lot', 'lots', 'ls', 'item', 'items', 'sum'],
  kg: ['kg'], 'tấn': ['tấn', 'tan', 'tân', 'ton', 't'], 'cây': ['cây', '1 cây'], 'cọc': ['cọc', 'coc'],
  'vị trí': ['vị trí', 'vị tri'], 'điểm': ['điểm', 'point', 'points'], 'lỗ': ['lỗ', 'lổ', 'lỗ khoan', 'hole'],
  'hố': ['hố', 'hố ga', 'ga', 'pit'], 'hệ': ['hệ', 'ht'], 'tháng': ['tháng', 'month', 'moths'], 'mối nối': ['mối nối', 'mối', 'mỗi nối'],
};
const MA_DON_VI = new Map(Object.entries(DON_VI).flatMap(([dv, ds]) => ds.map(x => [x, dv])));
function donVi(u) {
  const s = String(u || '').toLowerCase().normalize('NFC').replace(/[个女性树]/g, '').replace(/\s*\/\s*$/, '').replace(/\s+/g, ' ').trim();
  return MA_DON_VI.get(s) || s;
}

const so = v => (typeof v === 'number' && isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && isFinite(+v.replace(/,/g, '')) ? +v.replace(/,/g, '') : null));
const qtile = (a, p) => { const x = (a.length - 1) * p, lo = Math.floor(x), hi = Math.ceil(x); return a[lo] + (a[hi] - a[lo]) * (x - lo); };
const pad = n => String(n).padStart(2, '0');

/* grid: lưới giá trị sheet DATABASE (dòng 1 = tiêu đề). -> { db, thongKe } */
function taoCSDL(grid, { built } = {}) {
  const head = (grid[0] || []).map(norm);
  const cot = {};
  for (const [k, ten] of Object.entries(COT)) { const c = head.indexOf(ten); if (c >= 0) cot[k] = c; }
  const thieu = BAT_BUOC.filter(k => cot[k] === undefined);
  if (thieu.length) throw new Error(`Sheet DATABASE thiếu cột: ${thieu.map(k => COT[k]).join(', ')}`);
  const lay = (r, k) => (cot[k] === undefined ? null : r[cot[k]]);

  const D = { p: [], f: [], u: [], cu: [], g: [], gn: [], warn: ['Cao bất thường', 'Thấp bất thường'], cur: ['VNĐ'], sh: ['DATABASE'], par: [], w: [], e: [], c: [], chk: [] };
  const C = { name: [], oname: [], spec: [], code: [], id: [], u: [], cu: [], tot: [], mat: [], lab: [], mac: [], y: [], p: [], f: [], n: [], g: [], gn: [],
    warn: [], dup: [], cur: [], sh: [], row: [], par: [], w: [], e: [], c: [], chk: [] };
  const tuDien = (dict, map) => v => { let k = map.get(v); if (k === undefined) { k = dict.length; dict.push(v); map.set(v, k); } return k; };
  const maDA = tuDien(D.p, new Map()), maFile = tuDien(D.f, new Map()), maDV = tuDien(D.u, new Map());
  const nrmIdx = new Map(NRM2.map((n, k) => [n[0], k]));
  const tk = { doc: 0, bo: [], nrm: {} };

  for (let r = 1; r < grid.length; r++) {
    const row = grid[r] || [];
    const ten = String(lay(row, 'ten') || '').replace(/\s+/g, ' ').trim();
    if (!ten) continue;
    tk.doc++;
    const tc = so(lay(row, 'tc'));
    if (!(tc > 0)) { tk.bo.push({ dong: r + 1, ten, ly_do: tc === null ? 'Tổng cộng trống' : 'Tổng cộng ≤ 0' }); continue; }
    const da = String(lay(row, 'da') || '').trim() || '(Không rõ dự án)';
    const dv = maDV(donVi(lay(row, 'dv')));
    const nam = so(lay(row, 'nam'));
    const ma = phanLoai(ten, lay(row, 'link'));
    tk.nrm[ma] = (tk.nrm[ma] || 0) + 1;
    C.name.push(ten); C.oname.push(String(lay(row, 'goc') || '')); C.spec.push('');
    C.code.push(String(lay(row, 'ma') || '')); C.id.push(String(lay(row, 'link') || ''));
    C.u.push(dv); C.cu.push(dv);
    C.tot.push(tc); C.mat.push(so(lay(row, 'vt'))); C.lab.push(so(lay(row, 'nc'))); C.mac.push(null);
    C.y.push(nam >= 1990 && nam <= 2100 ? Math.round(nam) : null);
    C.p.push(maDA(da));
    C.f.push(lay(row, 'file') ? maFile(String(lay(row, 'file')).trim()) : -1);
    C.n.push(nrmIdx.get(ma));
    C.cur.push(0); C.sh.push(0); C.row.push(r + 1); C.dup.push(1);
    for (const k of ['par', 'w', 'e', 'c', 'chk']) C[k].push(-1);
  }
  const N = C.name.length;
  D.cu = D.u.slice();   // đơn vị đã gộp cách ghi: đơn vị gốc và đơn vị chuẩn trùng nhau

  // Nhóm đại diện: cùng tên đã chuẩn hóa + cùng đơn vị
  const nhom = new Map();
  for (let i = 0; i < N; i++) {
    const key = norm(C.name[i]) + '|' + D.u[C.u[i]];
    let e = nhom.get(key);
    if (!e) nhom.set(key, e = { rows: [] });
    e.rows.push(i);
  }
  let gi = 0;
  for (const e of nhom.values()) {
    const g = gi++;
    D.g.push('CTG' + String(g + 1).padStart(5, '0'));
    const ten = new Map();   // cách ghi → các dự án dùng
    for (const i of e.rows) { C.g[i] = g; let s = ten.get(C.name[i]); if (!s) ten.set(C.name[i], s = new Set()); s.add(C.p[i]); }
    D.gn.push([...ten].sort((a, b) => b[1].size - a[1].size)[0][0]);
    for (const i of e.rows) C.gn[i] = g;
    // Cảnh báo giá: lệch quá 3 lần so với trung vị nhóm (nhóm từ 4 báo giá)
    const v = e.rows.map(i => C.tot[i]).sort((a, b) => a - b), med = qtile(v, 0.5);
    for (const i of e.rows) C.warn[i] = v.length < 4 ? -1 : C.tot[i] > 3 * med ? 0 : C.tot[i] < med / 3 ? 1 : -1;
  }

  const now = built ? new Date(built) : new Date();
  const db = {
    built: `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
    nguon: 'CTG', count: N, cols: C, dicts: D, nrm2: NRM2,
    projects: D.p.map(p => [p, p, '', '', '', '']), filePaths: D.f.slice(),
  };
  tk.dong = N; tk.nhom = D.g.length; tk.du_an = D.p.length; tk.file = D.f.length;
  tk.canh_bao = C.warn.filter(x => x >= 0).length;
  return { db, thongKe: tk };
}

module.exports = { taoCSDL, phanLoai, donVi, NRM2, COT };
