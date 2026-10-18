'use strict';
/* Chạy module Tham khảo giá BOQ trên MỘT FILE BOQ bất kỳ (BOQ thật), dùng CSDL giả lập của demo
   (hoặc CSDL thật dạng data/db.js nếu có: --db <đường dẫn db.js>).
   Dùng: node modules/de_xuat_gia/demo/chay_file.js --boq <file.xlsx> [--baseline <file.xlsx>] [--db <db.js>] [--out <thư mục>]
   Kết quả: file Excel đã thêm sheet TK_*, ảnh giao diện, KET_QUA.md, kiểm tra format BOQ gốc. */
const fs = require('fs'), path = require('path'), http = require('http');
const { execFileSync } = require('child_process');
let pw; try { pw = require('playwright'); } catch { pw = require(path.join(execFileSync('npm', ['root', '-g']).toString().trim(), 'playwright')); }

const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const BOQ = arg('--boq') && path.resolve(arg('--boq'));
if (!BOQ || !fs.existsSync(BOQ)) { console.error('Cần --boq <file.xlsx>'); process.exit(2); }
const BASE = arg('--baseline') && path.resolve(arg('--baseline'));
const DBJS = arg('--db') && path.resolve(arg('--db'));
const MOD = path.resolve(__dirname, '..');
const OUT = path.resolve(arg('--out') || path.join(__dirname, 'ket_qua_' + path.basename(BOQ).replace(/\.\w+$/, '')));
const SITE = path.join(OUT, '.trang');
fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(SITE, { recursive: true, force: true });
fs.mkdirSync(path.join(SITE, 'data'), { recursive: true });
fs.cpSync(path.join(MOD, 'assets'), path.join(SITE, 'assets'), { recursive: true });
fs.copyFileSync(path.join(MOD, 'index.html'), path.join(SITE, 'index.html'));
if (DBJS) fs.copyFileSync(DBJS, path.join(SITE, 'data', 'db.js'));
else fs.writeFileSync(path.join(SITE, 'data', 'db.js'), 'window.DB = ' + JSON.stringify(require('./du_lieu_mau.js').taoDB()) + ';');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' };
const srv = http.createServer((req, res) => {
  const p = path.join(SITE, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!p.startsWith(SITE) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
}).listen(0);
const NF = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
const f0 = v => (v === null || v === undefined || v === '') ? '' : NF.format(Math.round(v));
const fq = v => (v === null || v === undefined || v === '') ? '' : NF.format(v);
const pc = v => (v === null || v === undefined || !isFinite(v)) ? '' : (v > 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
const md = s => String(s ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();

(async () => {
  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1440, height: 950 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`);
  await page.waitForSelector('#splash', { state: 'detached' });
  let t0 = Date.now();
  await page.setInputFiles('#f-boq', BOQ);
  await page.waitForFunction(() => !document.querySelector('#step-map').hidden || document.querySelector('#load-msg.err'), null, { timeout: 120000 });
  if (await page.$('#load-msg.err')) throw new Error(await page.textContent('#load-msg'));
  const tRead = Date.now() - t0;
  const cauTruc = await page.evaluate(() => window.__DXG_STATE.sheets.map(s => ({ sheet: s.name, dung: s.include, dong_tieu_de: s.det.headerRow + 1, cot: Object.fromEntries(Object.entries(s.det.cols).map(([k, c]) => [k, XLSXIO.colName(c)])) })));
  await page.locator('#step-map').screenshot({ path: path.join(OUT, '1_nhan_dien_cau_truc.png') });
  t0 = Date.now();
  await page.click('#go'); await page.waitForSelector('#step-res:not([hidden])', { timeout: 120000 });
  const tMatch = Date.now() - t0;
  if (BASE) { await page.setInputFiles('#f-base', BASE); await page.waitForFunction(() => window.__DXG_STATE.items.some(it => it.baseFile), null, { timeout: 30000 }).catch(() => {}); }
  await page.screenshot({ path: path.join(OUT, '2_ket_qua.png'), fullPage: true });
  const rows = await page.evaluate(() => {
    const S = window.__DXG_STATE;
    return S.items.map(it => {
      const c = it.c;
      return { sheet: it.sheet, dong: it.r + 1, ma: it.code, mo_ta: it.desc, near: it.heads[it.heads.length - 1] || '', dv: it.unit, kl: it.qty,
        nhom_id: c.shown ? c.cand.g : (c.cand ? c.cand.g : null), shown: c.shown, phu_hop: c.fit.level, diem: c.cand ? c.cand.score : null,
        ref: c.ref, n: c.st ? c.st.n : null, qs: c.qs, vi_tri: c.zone, danh_gia: c.ev, base: c.base, lech: c.dev ? c.dev.pct : null, luu_y: c.notes.join(' · ') };
    });
  });
  // tên nhóm: lấy từ bảng hiển thị
  const names = await page.$$eval('#res-tbl tbody tr[data-id] td.grp', tds => tds.map(td => td.childNodes[0] ? td.childNodes[0].textContent.trim() : ''));
  const counts = await page.evaluate(() => ({ note: window.__DXG_STATE.lines.filter(l => l.kind === 'note').length, head: window.__DXG_STATE.lines.filter(l => l.kind === 'head').length }));
  await page.click('#res-tbl tbody tr[data-id]'); await page.waitForSelector('#drawer:not([hidden])');
  await page.screenshot({ path: path.join(OUT, '3_chi_tiet_dong.png') });
  await page.click('#dw-close');
  t0 = Date.now();
  await page.click('#dx-export');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.click('#dlg-form button[type=submit]')]);
  const outFile = path.join(OUT, dl.suggestedFilename()); await dl.saveAs(outFile);
  const tExport = Date.now() - t0;
  await browser.close(); srv.close();
  fs.rmSync(SITE, { recursive: true, force: true });
  let fmt;
  try { fmt = execFileSync('python3', [path.join(MOD, 'tests', 'verify_format.py'), BOQ, outFile]).toString().trim(); }
  catch (e) { fmt = (e.stdout || '').toString().trim() || String(e); process.exitCode = 1; }

  const LBL = { ok: 'Hợp lý', xem: 'Cần xem', bt: 'Bất thường', nogia: 'Chưa có giá QS', notk: 'Không có tham khảo', skip: 'Bỏ qua' };
  const FIT = { cao: 'Cao', tb: 'TB', thap: 'Thấp', none: 'Không khớp' };
  const dem = k => rows.filter(r => r.danh_gia === k).length;
  const o = [];
  o.push(`# Kết quả chạy module trên file: ${path.basename(BOQ)}`, '');
  o.push(DBJS ? `CSDL: ${path.basename(DBJS)}` : '> **CSDL dùng để tham khảo là CSDL GIẢ LẬP của bộ chạy thử** (~500 báo giá / 40 nhóm công việc). Giá tham khảo dưới đây chỉ minh họa cách module chạy; để có giá thật cần chạy với gói CSDL `.dgbw` thật trên trang web.', '');
  o.push('## Đọc file', '', `| Sheet | Dùng | Dòng tiêu đề | Cột nhận diện |`, `|---|---|---|---|`);
  for (const s of cauTruc) o.push(`| ${s.sheet} | ${s.dung ? 'có' : 'không'} | ${s.dung ? s.dong_tieu_de : ''} | ${s.dung ? Object.entries(s.cot).map(([k, c]) => `${k}=${c}`).join(', ') : ''} |`);
  o.push('', `- Dòng hạng mục: **${rows.length}** · tiêu đề nhóm: ${counts.head} · dòng ghi chú/thuyết minh bỏ qua: ${counts.note}`);
  o.push(`- Thời gian: đọc file ${(tRead / 1000).toFixed(1)} s · khớp CSDL ${(tMatch / 1000).toFixed(1)} s · xuất Excel ${(tExport / 1000).toFixed(1)} s`);
  o.push(`- Có giá tham khảo: ${rows.filter(r => r.ref).length}/${rows.length} · QS đã có giá: ${rows.filter(r => r.qs).length}`);
  if (rows.some(r => r.qs)) o.push(`- Đánh giá: Hợp lý ${dem('ok')} · Cần xem ${dem('xem')} · Bất thường ${dem('bt')} · Chưa có giá QS ${dem('nogia')} · Không có tham khảo ${dem('notk')}`);
  o.push('', '## Giữ nguyên định dạng BOQ gốc', '', `- ${fmt}`, '');
  o.push('## Chi tiết từng dòng', '', '| Sheet | Dòng | Mã | Mô tả (tiêu đề gần nhất) | ĐV | KL | Nhóm tham khảo CSDL | Phù hợp | P50 | P25 – P75 | Giá QS | Đánh giá | Lưu ý |', '|---|--:|---|---|---|--:|---|---|--:|--:|--:|---|---|');
  rows.forEach((r, k) => o.push(`| ${md(r.sheet)} | ${r.dong} | ${md(r.ma)} | ${md(r.mo_ta)}${r.near ? ` _(${md(r.near)})_` : ''} | ${md(r.dv)} | ${fq(r.kl)} | ${md(names[k] || '—')} | ${FIT[r.phu_hop] || ''} | ${r.ref ? f0(r.ref.p50) : ''} | ${r.ref ? f0(r.ref.p25) + ' – ' + f0(r.ref.p75) : ''} | ${f0(r.qs)} | ${LBL[r.danh_gia]} | ${md(r.luu_y)} |`));
  fs.writeFileSync(path.join(OUT, 'KET_QUA.md'), o.join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'ket_qua.json'), JSON.stringify({ cauTruc, rows: rows.map((r, k) => ({ ...r, nhom: names[k] })), fmt, tRead, tMatch, tExport }, null, 1));
  // Báo cáo dạng Excel
  execFileSync('python3', [path.join(__dirname, 'bao_cao_xlsx.py'), path.join(OUT, 'ket_qua.json'), path.join(OUT, 'KET_QUA.xlsx'), path.basename(BOQ),
    DBJS ? '' : 'Giá tham khảo lấy từ CSDL GIẢ LẬP của bộ chạy thử (~500 báo giá / 40 nhóm công việc) — chỉ minh họa cách module chạy, không phải giá thị trường thật.']);
  console.log(o.slice(0, 20 + cauTruc.length).join('\n'));
  if (errs.length) { console.error('LỖI TRANG:', errs); process.exitCode = 1; }
  console.log(`\nKết quả: ${OUT}`);
})().catch(e => { console.error(e); srv.close(); process.exit(1); });
