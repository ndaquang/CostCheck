'use strict';
/* Kiểm thử đầu-cuối trên Chromium (dữ liệu giả lập):
   1. BOQ chưa có giá → tra giá tham khảo, QS chọn nhóm + ghi ý kiến → xuất → BOQ gốc giữ nguyên từng byte.
   2. Nạp lại BOQ đã có giá QS → lựa chọn/ý kiến được giữ, đánh giá Hợp lý/Cần xem/Bất thường → baseline → xuất.
   3. LibreOffice tính lại: kết quả công thức trong TK_DanhGia khớp với phần mềm; sửa giá QS trong sheet gốc
      thì đánh giá tự đổi.
   4. Lưu phiên → khôi phục trên trang mới.
   Dùng: node tests/e2e.js <thư mục làm việc tạm>   (cần playwright, python3 + openpyxl, LibreOffice) */
const fs = require('fs'), path = require('path'), http = require('http');
const { execFileSync } = require('child_process');
let pw; try { pw = require('playwright'); } catch { pw = require(path.join(execFileSync('npm', ['root', '-g']).toString().trim(), 'playwright')); }

const MOD = path.resolve(__dirname, '..');
const WORK = path.resolve(process.argv[2] || fs.mkdtempSync('/tmp/dxg-'));
const SITE = path.join(WORK, 'site');
fs.rmSync(SITE, { recursive: true, force: true });
fs.cpSync(MOD, SITE, { recursive: true, filter: s => !s.includes(`${path.sep}tests`) });
fs.mkdirSync(path.join(SITE, 'data'), { recursive: true });
fs.writeFileSync(path.join(SITE, 'data', 'db.js'), 'window.DB = ' + JSON.stringify(require('./fixture_db.js').makeDB()) + ';');
execFileSync('python3', [path.join(__dirname, 'make_boq.py'), WORK]);
const py = (code, ...args) => execFileSync('python3', ['-c', code, ...args]).toString().trim();
const verify = (src, out) => console.log('  ' + execFileSync('python3', [path.join(__dirname, 'verify_format.py'), src, out]).toString().trim());
let fails = 0; const check = (ok, text) => { console.log(`  ${ok ? '✓' : '✗'} ${text}`); if (!ok) fails++; };

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const srv = http.createServer((req, res) => {
  const p = path.join(SITE, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!p.startsWith(SITE) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
}).listen(0);

// Tính lại bằng LibreOffice rồi đọc giá trị sheet TK_DanhGia
function recalc(file) {
  const dir = path.join(WORK, 'lo'); fs.rmSync(dir, { recursive: true, force: true });
  execFileSync('soffice', ['--headless', '--calc', '--convert-to', 'xlsx', '--outdir', dir, file], { stdio: 'ignore' });
  return JSON.parse(py(`import json,sys
from openpyxl import load_workbook
ws = load_workbook(sys.argv[1], data_only=True)['TK_DanhGia']
print(json.dumps([[c for c in r] for r in ws.iter_rows(min_row=2, values_only=True)], default=str))`, path.join(dir, path.basename(file))));
}

(async () => {
  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1400, height: 900 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const exportFile = async (name, sum = true) => {
    await page.click('#dx-export');
    if (!(await page.isChecked('#x-sum')) === sum) await page.click('#x-sum');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#dlg-form button[type=submit]')]);
    const f = path.join(WORK, name); await dl.saveAs(f); return f;
  };
  const state = () => page.evaluate(() => window.__DXG_STATE.items.map(it => ({ id: it.id, desc: it.desc, qs: it.c.qs, ev: it.c.ev, zone: it.c.zone, p50: it.c.ref && it.c.ref.p50, base: it.c.base, note: it.note, picked: !!(it.cands[it.sel] && it.cands[it.sel].picked) })));

  await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`);
  await page.waitForSelector('#splash', { state: 'detached' });

  console.log('1. BOQ chưa có giá');
  await page.setInputFiles('#f-boq', path.join(WORK, 'BOQ_mau.xlsx'));
  await page.waitForSelector('#step-map:not([hidden])');
  await page.click('#go'); await page.waitForSelector('#step-res:not([hidden])');
  let s = await state();
  check(s.every(x => ['nogia', 'notk'].includes(x.ev)), 'chưa có giá QS → không dòng nào bị chấm hợp lý/bất thường ' + JSON.stringify(s.filter(x => !['nogia', 'notk'].includes(x.ev))));
  check(s.filter(x => x.p50).length >= 11, `có giá tham khảo cho ${s.filter(x => x.p50).length}/${s.length} dòng`);
  // QS: dòng VRV không khớp → tìm nhóm thủ công; ghi ý kiến
  await page.click('#res-tbl tr[data-id="Xay dung|15"]'); await page.waitForSelector('#drawer:not([hidden])');
  await page.fill('#dw-q', 'van chuyen phe thai'); await page.click('[data-do=search]');
  await page.click('#dw-sr .cand[data-g]');
  await page.fill('#dw-note', 'Thiết bị MEP: lấy báo giá NCC, CSDL không có'); await page.click('[data-do=apply]');
  await page.click('[data-do=prev]');
  await page.screenshot({ path: path.join(WORK, 'drawer.png') });
  await page.click('#dw-close');
  const f1 = await exportFile('lan1_ThamKhaoGia.xlsx');
  verify(path.join(WORK, 'BOQ_mau.xlsx'), f1);

  console.log('2. Nạp lại BOQ đã có giá QS');
  await page.setInputFiles('#f-boq', path.join(WORK, 'BOQ_QS.xlsx'));
  await page.waitForSelector('#step-map:not([hidden])');
  await page.click('#go'); await page.waitForSelector('#step-res:not([hidden])');
  await page.setInputFiles('#f-base', path.join(WORK, 'Baseline_mau.xlsx'));
  await page.waitForFunction(() => window.__DXG_STATE.items.some(it => it.baseFile));
  s = await state();
  for (const r of s) console.log(`    ${r.id.padEnd(14)} ${r.desc.slice(0, 36).padEnd(36)} QS ${String(r.qs ?? '').padStart(10)} P50 ${String(Math.round(r.p50 || 0)).padStart(9)} ${String(r.zone).padEnd(8)} ${r.ev}`);
  const by = id => s.find(x => x.id === id);
  check(by('Xay dung|15').note.startsWith('Thiết bị MEP') && by('Xay dung|15').picked, 'ý kiến và nhóm QS chọn được giữ khi nạp lại BOQ');
  check(by('Xay dung|6').ev === 'bt' && by('Xay dung|9').ev === 'bt', 'giá quá cao / quá thấp → Bất thường');
  check(by('Xay dung|7').ev === 'ok', 'giá trong P25–P75 → Hợp lý');
  check(by('Xay dung|13').ev === 'nogia', 'dòng QS chưa nhập giá → Chưa có giá QS');
  check(by('Hoan thien|1').base === 300000, 'baseline đọc từ cột trong BOQ');
  await page.click('.tab[data-tab=sum]'); await page.waitForSelector('#tab-sum .sum-grid');
  await page.screenshot({ path: path.join(WORK, 'sum.png'), fullPage: true });
  await page.click('.tab[data-tab=lines]');
  await page.screenshot({ path: path.join(WORK, 'lines.png'), fullPage: true });
  const f2 = await exportFile('lan2_ThamKhaoGia.xlsx');
  verify(path.join(WORK, 'BOQ_QS.xlsx'), f2);
  // Xuất lần nữa từ file đã có sheet TK_*: sheet TK được thay, không nhân đôi
  const f3 = await exportFile('lan3_ThamKhaoGia.xlsx');
  check(py(`from openpyxl import load_workbook as L;import sys;print(L(sys.argv[1]).sheetnames)`, f3) === "['Xay dung', 'Hoan thien', 'TK_DanhGia', 'TK_TongHop', 'TK_NguonGia']", 'xuất lại không nhân đôi sheet TK_*');

  console.log('3. Công thức trong Excel (LibreOffice tính lại)');
  const rows = recalc(f2);
  const evCol = 20, zoneCol = 19, qsCol = 18;
  const LABEL = { ok: 'Hợp lý', xem: 'Cần xem', bt: 'Bất thường', nogia: 'Chưa có giá QS', notk: 'Không có tham khảo' };
  check(rows.length === s.length && rows.every((r, k) => r[evCol] === LABEL[s[k].ev]), 'cột Đánh giá do Excel tính khớp với phần mềm');
  // QS sửa giá dòng "Ván khuôn móng" (E10) trong sheet gốc → TK_DanhGia phải đổi đánh giá
  const edited = path.join(WORK, 'qs_sua_gia.xlsx');
  py(`import zipfile,sys,re
src,dst=sys.argv[1],sys.argv[2]
zi=zipfile.ZipFile(src); zo=zipfile.ZipFile(dst,'w',zipfile.ZIP_DEFLATED)
for n in zi.namelist():
    d=zi.read(n)
    if n=='xl/worksheets/sheet1.xml': d=re.sub(rb'(<c r="E10"[^>]*>)<v>[^<]*</v>', rb'\\g<1><v>183000</v>', d)
    # Excel tự tính lại ô phụ thuộc khi QS sửa giá; LibreOffice mở file thì dùng giá trị đệm,
    # nên bỏ giá trị đệm của công thức trong các sheet TK_* để buộc tính lại
    elif n.startswith('xl/worksheets/') and n not in ('xl/worksheets/sheet1.xml','xl/worksheets/sheet2.xml'): d=re.sub(rb'(</f>)<v>[^<]*</v>', rb'\\1', d)
    zo.writestr(n,d)
zo.close()`, f2, edited);
  const rows2 = recalc(edited);
  const k10 = s.findIndex(x => x.id === 'Xay dung|9');
  check(rows[k10][evCol] === 'Bất thường' && rows2[k10][qsCol] === 183000 && rows2[k10][evCol] === 'Hợp lý', `QS sửa giá trong sheet gốc → TK_DanhGia tự đổi: ${rows[k10][evCol]} → ${rows2[k10][evCol]} (${rows2[k10][zoneCol]})`);

  console.log('4. Lưu & khôi phục phiên');
  const [ds] = await Promise.all([page.waitForEvent('download'), page.click('#save-sess')]);
  const sess = path.join(WORK, ds.suggestedFilename()); await ds.saveAs(sess);
  await page.reload(); await page.waitForSelector('#splash', { state: 'detached' });
  await page.setInputFiles('#f-boq', path.join(WORK, 'BOQ_QS.xlsx')); await page.waitForSelector('#step-map:not([hidden])');
  await page.click('#go'); await page.waitForSelector('#step-res:not([hidden])');
  await page.setInputFiles('#f-sess', sess);
  await page.waitForFunction(() => window.__DXG_STATE.items.some(it => it.note));
  s = await state();
  check(by('Xay dung|15') && s.find(x => x.id === 'Xay dung|15').note.startsWith('Thiết bị MEP') && s.filter(x => x.base).length >= 8, 'khôi phục ý kiến, nhóm đã chọn và baseline');

  if (errs.length) { console.error('LỖI TRANG:', errs); fails++; }
  await browser.close(); srv.close();
  console.log(fails ? `THẤT BẠI: ${fails} kiểm tra` : 'Đạt tất cả.');
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
