'use strict';
/* CHẠY THỬ module Tham khảo giá BOQ trên dữ liệu GIẢ LẬP, xuất kết quả ra thư mục để xem.
   Dùng:  node modules/de_xuat_gia/demo/chay_thu.js [thư mục kết quả]        (mặc định: demo/ket_qua)
          node modules/de_xuat_gia/demo/chay_thu.js --mo                     mở trang chạy thử để tự thao tác
   Cần: Node + playwright (Chromium), python3 + openpyxl; LibreOffice (không bắt buộc) để kiểm tra công thức.
   Quy trình mô phỏng đúng cách QS làm:
     1. Nạp BOQ chưa có giá → tra giá tham khảo → xuất file (BOQ gốc + sheet TK_*)
     2. QS nhập giá trong Excel → nạp lại BOQ đã có giá + baseline CĐT → đánh giá, ghi ý kiến → xuất file
     3. Kiểm tra định dạng BOQ gốc giữ nguyên từng byte; kiểm tra công thức đánh giá trong Excel */
const fs = require('fs'), path = require('path'), http = require('http');
const { execFileSync } = require('child_process');
let pw; try { pw = require('playwright'); } catch { pw = require(path.join(execFileSync('npm', ['root', '-g']).toString().trim(), 'playwright')); }

const MOD = path.resolve(__dirname, '..');
const MO = process.argv.includes('--mo');
const OUT = path.resolve(process.argv.slice(2).find(a => !a.startsWith('--')) || path.join(__dirname, 'ket_qua'));
const IN = path.join(OUT, 'dau_vao'), SITE = path.join(OUT, '.trang_chay_thu');
for (const d of [OUT, IN]) fs.mkdirSync(d, { recursive: true });
fs.rmSync(SITE, { recursive: true, force: true });
fs.mkdirSync(path.join(SITE, 'data'), { recursive: true });
fs.cpSync(path.join(MOD, 'assets'), path.join(SITE, 'assets'), { recursive: true });
fs.copyFileSync(path.join(MOD, 'index.html'), path.join(SITE, 'index.html'));
fs.writeFileSync(path.join(SITE, 'data', 'db.js'), 'window.DB = ' + JSON.stringify(require('./du_lieu_mau.js').taoDB()) + ';');
execFileSync('python3', [path.join(__dirname, 'tao_boq_mau.py'), IN]);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' };
const srv = http.createServer((req, res) => {
  const p = path.join(SITE, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!p.startsWith(SITE) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
}).listen(MO ? 8765 : 0);
const URL_ = () => `http://127.0.0.1:${srv.address().port}/index.html`;

if (MO) {
  console.log(`Trang chạy thử (CSDL giả lập): ${URL_()}\nFile mẫu để nạp: ${IN}\nCtrl+C để dừng.`);
  return;
}

const py = (code, ...args) => execFileSync('python3', ['-c', code, ...args]).toString().trim();
const hasLO = (() => { try { execFileSync('soffice', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const NF = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const f0 = v => (v === null || v === undefined || v === '') ? '' : NF.format(Math.round(v));
const pc = v => (v === null || v === undefined || v === '' || !isFinite(v)) ? '' : (v > 0 ? '+' : '') + (v * 100).toFixed(1) + '%';

(async () => {
  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1440, height: 950 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const shot = (name, full = false) => page.screenshot({ path: path.join(OUT, name), fullPage: full });
  const xuat = async name => {
    await page.click('#dx-export');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#dlg-form button[type=submit]')]);
    const f = path.join(OUT, name); await dl.saveAs(f); return f;
  };
  const kiemFormat = (goc, xuatRa) => execFileSync('python3', [path.join(MOD, 'tests', 'verify_format.py'), goc, xuatRa]).toString().trim();
  const items = () => page.evaluate(() => window.__DXG_STATE.items.map(it => ({
    sheet: it.sheet, dong: it.r + 1, ma: it.code, mo_ta: it.desc, dv: it.unit, kl: it.qty,
    ref: it.c.ref, n: it.c.st ? it.c.st.n : null, qs: it.c.qs, vi_tri: it.c.zone, danh_gia: it.c.ev, base: it.c.base, lech: it.c.dev ? it.c.dev.pct : null,
    luu_y: it.c.notes.join(' · '), y_kien: it.note, phu_hop: it.c.fit.level,
  })));
  const groupNames = () => page.evaluate(() => window.__DXG_STATE.items.map(it => it.c.shown ? document.querySelector(`#res-tbl tr[data-id="${CSS.escape(it.id)}"] td.grp`)?.childNodes[0]?.textContent.trim() : ''));

  await page.goto(URL_());
  await page.waitForSelector('#splash', { state: 'detached' });

  // ---- Bước 1: BOQ chưa có giá → giá tham khảo
  await page.setInputFiles('#f-boq', path.join(IN, 'BOQ_ChayThu.xlsx'));
  await page.waitForSelector('#step-map:not([hidden])');
  await page.locator('#step-map').screenshot({ path: path.join(OUT, '1_nhan_dien_cau_truc.png') });
  await page.click('#go'); await page.waitForSelector('#step-res:not([hidden])');
  await shot('2_gia_tham_khao.png');
  const f1 = await xuat('1_BOQ_ChayThu_ThamKhaoGia.xlsx');
  const fmt1 = kiemFormat(path.join(IN, 'BOQ_ChayThu.xlsx'), f1);

  // ---- Bước 2–3: BOQ đã có giá QS + baseline → đánh giá, ghi ý kiến
  await page.setInputFiles('#f-boq', path.join(IN, 'BOQ_ChayThu_QS.xlsx'));
  await page.waitForSelector('#step-map:not([hidden])');
  await page.click('#go'); await page.waitForSelector('#step-res:not([hidden])');
  await page.setInputFiles('#f-base', path.join(IN, 'Baseline_CDT.xlsx'));
  await page.waitForFunction(() => window.__DXG_STATE.items.some(it => it.baseFile));
  // QS ghi ý kiến cho dòng bất thường "Ván khuôn móng" (dòng Excel 15)
  await page.click('#res-tbl tr[data-id="1. Ket cau|14"]'); await page.waitForSelector('#drawer:not([hidden])');
  await page.fill('#dw-note', 'Giá QS thấp hơn thị trường: kiểm tra lại phạm vi (chỉ nhân công?) và số lần luân chuyển ván khuôn.'); await page.click('[data-do=apply]');
  await shot('5_chi_tiet_dong.png');
  await page.click('#dw-close');
  await page.click('#flt button[data-f=bt]');
  await shot('3b_loc_bat_thuong.png', true);
  await page.click('#flt button[data-f=all]');
  await shot('3_danh_gia_gia_QS.png', true);
  await page.click('.tab[data-tab=sum]'); await page.waitForSelector('#tab-sum .sum-grid');
  await shot('4_tong_hop.png', true);
  await page.click('.tab[data-tab=lines]');
  const rows = await items(), names = await groupNames();
  const f2 = await xuat('2_BOQ_ChayThu_QS_ThamKhaoGia.xlsx');
  const fmt2 = kiemFormat(path.join(IN, 'BOQ_ChayThu_QS.xlsx'), f2);
  await browser.close(); srv.close();

  // ---- Kiểm tra công thức trong Excel bằng LibreOffice (nếu có)
  let congThuc = 'Bỏ qua (máy không có LibreOffice).';
  if (hasLO) {
    const lo = path.join(OUT, '.lo'); fs.rmSync(lo, { recursive: true, force: true });
    // bỏ giá trị đệm của công thức trong sheet TK_* để LibreOffice tự tính lại từ giá QS trong sheet gốc
    const tmp = path.join(lo, 'tinh_lai.xlsx'); fs.mkdirSync(lo, { recursive: true });
    py(`import zipfile,sys,re
zi=zipfile.ZipFile(sys.argv[1]); zo=zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED)
src=zipfile.ZipFile(sys.argv[3]).namelist()
for n in zi.namelist():
    d=zi.read(n)
    if n.startswith('xl/worksheets/') and n not in src: d=re.sub(rb'(</f>)<v>[^<]*</v>', rb'\\1', d)
    zo.writestr(n,d)
zo.close()`, f2, tmp, path.join(IN, 'BOQ_ChayThu_QS.xlsx'));
    execFileSync('soffice', ['--headless', '--calc', '--convert-to', 'xlsx', '--outdir', path.join(lo, 'out'), tmp], { stdio: 'ignore' });
    const ex = JSON.parse(py(`import json,sys
from openpyxl import load_workbook
ws=load_workbook(sys.argv[1],data_only=True)['TK_DanhGia']
print(json.dumps([[r[18],r[21]] for r in ws.iter_rows(min_row=2,values_only=True)],default=str))`, path.join(lo, 'out', 'tinh_lai.xlsx')));
    const LBL = { ok: 'Hợp lý', xem: 'Cần xem', bt: 'Bất thường', nogia: 'Chưa có giá QS', notk: 'Không có tham khảo', skip: 'Bỏ qua' };
    const khop = ex.filter((r, k) => r[1] === LBL[rows[k].danh_gia]).length;
    congThuc = `LibreOffice tính lại sheet TK_DanhGia từ giá QS trong sheet gốc: ${khop}/${rows.length} dòng cho cùng kết quả đánh giá với phần mềm.`;
    fs.rmSync(lo, { recursive: true, force: true });
  }
  fs.rmSync(SITE, { recursive: true, force: true });

  // ---- Báo cáo
  const LBL = { ok: 'Hợp lý', xem: 'Cần xem', bt: 'Bất thường', nogia: 'Chưa có giá QS', notk: 'Không có tham khảo', skip: 'Bỏ qua' };
  const dem = k => rows.filter(r => r.danh_gia === k).length;
  const sum = (f) => rows.reduce((s, r) => s + (f(r) || 0), 0);
  const both = rows.filter(r => r.qs && r.ref && r.kl);
  const tQs = sum(r => r.qs && r.kl ? r.qs * r.kl : 0), tQsRef = both.reduce((s, r) => s + r.qs * r.kl, 0), tRef = both.reduce((s, r) => s + r.ref.p50 * r.kl, 0);
  const bb = rows.filter(r => r.qs && r.base && r.kl), tQsB = bb.reduce((s, r) => s + r.qs * r.kl, 0), tB = bb.reduce((s, r) => s + r.base * r.kl, 0);
  const md = [];
  md.push('# Kết quả chạy thử — Tham khảo & đánh giá giá BOQ', '');
  md.push('> Dữ liệu GIẢ LẬP (CSDL ~500 báo giá / 40 nhóm công việc / 12 dự án; BOQ nhà xưởng 36 dòng). Không phải dữ liệu thật.', '');
  md.push('## Tóm tắt', '');
  md.push(`| Chỉ tiêu | Kết quả |`, `|---|---|`);
  md.push(`| Dòng hạng mục BOQ | ${rows.length} |`);
  md.push(`| Có giá tham khảo từ CSDL | ${rows.filter(r => r.ref).length} |`);
  md.push(`| Hợp lý / Cần xem / Bất thường | ${dem('ok')} / ${dem('xem')} / ${dem('bt')} |`);
  md.push(`| Chưa có giá QS / Không có tham khảo | ${dem('nogia')} / ${dem('notk')} |`);
  md.push(`| Tổng giá trị QS | ${f0(tQs)} VNĐ |`);
  md.push(`| QS so với P50 thị trường (${both.length} dòng có cả 2) | ${pc((tQsRef - tRef) / tRef)} |`);
  md.push(`| QS so với baseline CĐT (${bb.length} dòng có cả 2) | ${pc((tQsB - tB) / tB)} |`);
  md.push('', '## Kiểm tra giữ nguyên định dạng BOQ gốc', '');
  md.push(`- File bước 1: ${fmt1}`, `- File bước 3: ${fmt2}`, `- Công thức: ${congThuc}`);
  md.push('', '## Chi tiết từng dòng', '');
  md.push('| Sheet | Mã | Mô tả | ĐV | Nhóm tham khảo CSDL | P50 | P25 – P75 | Giá QS | Vị trí | Đánh giá | Baseline | QS/BL | Lưu ý |', '|---|---|---|---|---|--:|--:|--:|---|---|--:|--:|---|');
  rows.forEach((r, k) => md.push(`| ${r.sheet} | ${r.ma} | ${r.mo_ta} | ${r.dv} | ${names[k] || '—'} | ${r.ref ? f0(r.ref.p50) : ''} | ${r.ref ? f0(r.ref.p25) + ' – ' + f0(r.ref.p75) : ''} | ${f0(r.qs)} | ${r.vi_tri} | **${LBL[r.danh_gia]}** | ${f0(r.base)} | ${pc(r.lech)} | ${[r.luu_y, r.y_kien && 'Ý kiến: ' + r.y_kien].filter(Boolean).join(' · ')} |`));
  md.push('', '## File', '', '- `1_BOQ_ChayThu_ThamKhaoGia.xlsx` — bước 1: BOQ chưa có giá + sheet giá tham khảo',
    '- `2_BOQ_ChayThu_QS_ThamKhaoGia.xlsx` — bước 3: BOQ QS đã nhập giá + đánh giá + baseline + ý kiến',
    '- `dau_vao/` — BOQ mẫu và baseline dùng để chạy thử', '- `*.png` — ảnh giao diện');
  fs.writeFileSync(path.join(OUT, 'KET_QUA.md'), md.join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'ket_qua.json'), JSON.stringify({ rows: rows.map((r, k) => ({ ...r, nhom: names[k] })), fmt1, fmt2, congThuc }, null, 1));
  console.log(md.slice(0, 16).join('\n'));
  if (errs.length) { console.error('LỖI TRANG:', errs); process.exitCode = 1; }
  console.log(`\nKết quả: ${OUT}`);
})().catch(e => { console.error(e); srv.close(); process.exit(1); });
