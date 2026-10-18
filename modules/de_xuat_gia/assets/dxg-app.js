'use strict';
/* Tham khảo & đánh giá giá BOQ — công cụ TƯ VẤN cho QS.
   • QS là người lập toàn bộ giá trong Excel; CSDL đơn giá chỉ là nguồn tham khảo.
   • Phần mềm KHÔNG ghi vào sheet BOQ gốc: mọi kết quả nằm ở sheet mới TK_*; sheet TK_DanhGia dùng công thức
     trỏ về ô giá của QS nên tự cập nhật khi QS sửa giá trong Excel.
   Dữ liệu nạp qua window.SECURE (gói .dgbw) như app tra cứu; chạy thử không có cổng đăng nhập thì nạp data/db.js. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const NF = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
  const NF2 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
  const fmt = v => (v === null || v === undefined || !isFinite(v)) ? '' : NF.format(v);
  const fmtQ = v => (v === null || v === undefined || !isFinite(v)) ? '' : NF2.format(v);
  const pct = v => (v === null || v === undefined || !isFinite(v)) ? '' : (v > 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
  const esc = s => s === null || s === undefined ? '' : String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isNum = v => typeof v === 'number' && isFinite(v);
  const ROLE = (window.SECURE && window.SECURE.role) || 'admin';
  const ADMIN = ROLE === 'admin';
  const FIT = { cao: 'Cao', tb: 'Trung bình', thap: 'Thấp', none: 'Không khớp' };
  // Đánh giá giá QS so với phân bố giá CSDL (cùng nhãn với công thức trong sheet TK_DanhGia)
  const EVAL = { ok: 'Hợp lý', xem: 'Cần xem', bt: 'Bất thường', nogia: 'Chưa có giá QS', notk: 'Không có tham khảo', skip: 'Bỏ qua' };
  const KEYS = [['code', 'Mã/STT'], ['desc', 'Mô tả *'], ['unit', 'Đơn vị'], ['qty', 'Khối lượng'], ['rate', 'Đơn giá QS'], ['amount', 'Thành tiền'], ['base', 'Giá baseline']];
  const PAGE = 300;
  const OWN = /^(TK|DX)_/;   // sheet do phần mềm tạo, bỏ qua khi đọc

  let IX = null;
  const S = {
    wb: null, fileName: '', sheets: [], lines: [], items: [],
    baseList: null, baseName: '', session: null,
    opt: { yearFrom: null, yearTo: null, types: new Set(), provs: new Set(), excludeReview: true, excludeOutlier: true, excludeWarn: false, factor: 1, tolBl: 0.10, tolOk: 0.05, tolBt: 0.15 },
    view: { f: 'all', q: '', shown: PAGE, tab: 'lines', cur: null },
  };

  /* ---------- Nạp cơ sở dữ liệu ---------- */
  function boot() {
    // Nhân viên chỉ dùng được khi admin bật cờ cho_nhan_vien trong build.py
    const meta = document.querySelector('meta[name="cho-nhan-vien"]');
    if (!ADMIN && !(meta && meta.content === '1')) {
      $('#splash-msg').textContent = 'Chức năng Tham khảo giá BOQ chỉ dành cho tài khoản admin.';
      $('.bar').hidden = true;
      return;
    }
    const done = txt => {
      if (txt) window.DB = JSON.parse(txt);
      $('#splash-msg').textContent = 'Đang lập chỉ mục khớp công việc…';
      setTimeout(init, 30);
    };
    const fail = e => { $('#splash-msg').textContent = 'Không mở được dữ liệu'; $('#splash-err').textContent = String(e && e.message || e); $('.bar').hidden = true; };
    if (window.SECURE) { $('#splash-msg').textContent = 'Đang giải mã dữ liệu…'; window.SECURE.load('db').then(done).catch(fail); return; }
    const s = document.createElement('script');
    s.src = 'data/db.js';
    s.onload = () => done(null);
    s.onerror = () => fail('Không tìm thấy data/db.js (chế độ chạy thử không qua cổng đăng nhập).');
    document.body.appendChild(s);
  }
  function init() {
    const t0 = performance.now();
    IX = DXG.buildIndex(window.DB);
    const DB = window.DB;
    $('#db-meta').textContent = `${NF.format(DB.count)} đơn giá · ${NF.format(IX.groups.length)} nhóm công việc · giá quy về ${DB.baseYear || 2026} · cập nhật ${DB.built || ''}`;
    buildOptions();
    bindUI();
    $('#splash').remove();
    console.log(`Chỉ mục tham khảo giá: ${Math.round(performance.now() - t0)} ms, ${IX.groups.length} nhóm`);
  }

  /* ---------- Tùy chọn ---------- */
  function buildOptions() {
    const P = window.DB.projects || [];
    const fill = (id, vals, set) => {
      const box = $(`#${id} .msel-list`);
      const list = [...new Set(vals.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
      box.innerHTML = list.length ? list.map(v => `<label><input type="checkbox" value="${esc(v)}"> ${esc(v)}</label>`).join('') : '<span class="muted small">Không có dữ liệu</span>';
      box.addEventListener('change', () => {
        set.clear(); $$('input:checked', box).forEach(i => set.add(i.value));
        $(`#${id} summary`).textContent = set.size ? [...set].join(', ') : 'Tất cả';
        recompute();
      });
    };
    fill('o-type', P.map(p => p[2]), S.opt.types);
    fill('o-prov', P.map(p => p[4] || p[3]), S.opt.provs);
  }
  function readOptions() {
    const o = S.opt, n = id => { const v = $(id).value.trim(); return v === '' ? null : +v; };
    o.yearFrom = n('#o-yfrom'); o.yearTo = n('#o-yto');
    o.factor = (n('#o-factor') ?? 100) / 100;
    o.tolBl = (n('#o-tol') ?? 10) / 100;
    o.tolOk = (n('#o-ok') ?? 5) / 100; o.tolBt = (n('#o-bt') ?? 15) / 100;
    o.excludeReview = $('#o-review').checked; o.excludeOutlier = $('#o-outlier').checked; o.excludeWarn = $('#o-warn').checked;
  }
  function writeOptions() {
    const o = S.opt;
    $('#o-yfrom').value = o.yearFrom ?? ''; $('#o-yto').value = o.yearTo ?? '';
    $('#o-factor').value = Math.round(o.factor * 1000) / 10; $('#o-tol').value = Math.round(o.tolBl * 1000) / 10;
    $('#o-ok').value = Math.round((o.tolOk ?? 0.05) * 1000) / 10; $('#o-bt').value = Math.round((o.tolBt ?? 0.15) * 1000) / 10;
    $('#o-review').checked = o.excludeReview; $('#o-outlier').checked = o.excludeOutlier; $('#o-warn').checked = o.excludeWarn;
    for (const [id, set] of [['o-type', o.types], ['o-prov', o.provs]]) {
      $$(`#${id} input`).forEach(i => { i.checked = set.has(i.value); });
      $(`#${id} summary`).textContent = set.size ? [...set].join(', ') : 'Tất cả';
    }
  }

  /* ---------- Bước 1: nạp file ---------- */
  function msg(text, kind = '') { const m = $('#load-msg'); m.hidden = !text; m.className = 'msg ' + kind; m.textContent = text; }
  async function loadBoq(file) {
    try {
      msg('Đang đọc file BOQ…');
      const wb = await XLSXIO.read(await file.arrayBuffer());
      // Nạp lại BOQ (vd sau khi QS đã nhập giá): giữ các lựa chọn nhóm, baseline nhập tay, ý kiến đã có
      if (S.items.length) S.session = sessionData();
      const prev = new Map(S.sheets.filter(s => s.include).map(s => [s.name, s.det]));   // giữ cấu trúc QS đã chỉnh
      S.wb = wb; S.fileName = file.name; S.sheets = []; S.items = []; S.lines = [];
      wb.sheets.forEach((sh, si) => {
        if (sh.state !== 'visible' || OWN.test(sh.name)) return;
        const grid = wb.grid(si);
        const det = prev.get(sh.name) || DXG.detectColumns(grid);
        S.sheets.push({ si, name: sh.name, grid, det: det ? JSON.parse(JSON.stringify(det)) : { headerRow: 0, dataStart: 1, cols: {} }, include: !!det, auto: !!det });
      });
      $('#n-boq').textContent = file.name;
      const ok = S.sheets.filter(s => s.include).length;
      if (!S.sheets.length) throw new Error('File không có sheet nào để đọc.');
      msg(ok ? `Đã đọc ${S.sheets.length} sheet, nhận diện được bảng BOQ ở ${ok} sheet. Kiểm tra lại cấu trúc ở bước 2.` : 'Không tự nhận ra dòng tiêu đề BOQ. Hãy chọn sheet và cột thủ công ở bước 2.', ok ? 'ok' : 'err');
      renderMap();
      $('#step-map').hidden = false; $('#step-res').hidden = true;
      $('#step-map').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) { console.error(e); msg('Không đọc được file BOQ: ' + (e.message || e), 'err'); }
  }
  async function loadBase(file) {
    try {
      const wb = await XLSXIO.read(await file.arrayBuffer());
      const list = [];
      wb.sheets.forEach((sh, si) => {
        if (OWN.test(sh.name)) return;
        const grid = wb.grid(si), det = DXG.detectColumns(grid);
        if (!det) return;
        const priceCol = det.cols.base ?? det.cols.rate;
        if (priceCol === undefined) return;
        const lines = DXG.extractLines(grid, { ...det, cols: { ...det.cols, base: priceCol } }, sh.name);
        for (const l of lines) if (l.kind === 'item' && isNum(l.base) && l.base > 0) list.push({ code: l.code, desc: l.desc, unit: l.unit, price: l.base, sheet: sh.name });
      });
      if (!list.length) throw new Error('Không tìm thấy cột giá baseline (cần tiêu đề "Baseline", "Đơn giá", "Ngân sách"… cùng cột Mô tả và Đơn vị).');
      S.baseList = list; S.baseName = file.name;
      $('#n-base').textContent = `${file.name} · ${NF.format(list.length)} giá`;
      if (S.items.length) { applyBaseline(); recompute(); }
      const hit = S.items.filter(it => isNum(it.baseFile)).length;
      msg(S.items.length ? `Baseline: đọc ${NF.format(list.length)} giá, ghép được ${NF.format(hit)}/${NF.format(S.items.length)} dòng BOQ.` : `Đã đọc ${NF.format(list.length)} giá baseline. Sẽ ghép vào BOQ ở bước 3.`, 'ok');
    } catch (e) { console.error(e); msg('Không đọc được file baseline: ' + (e.message || e), 'err'); }
  }
  async function loadSession(file) {
    try {
      const j = JSON.parse(await file.text());
      if (!['DGBQ1', 'DGBQ2'].includes(j.dinh_dang)) throw new Error('Không phải file phiên làm việc.');
      S.session = j;
      $('#n-sess').textContent = file.name;
      if (j.opt) { Object.assign(S.opt, j.opt, { types: new Set(j.opt.types || []), provs: new Set(j.opt.provs || []) }); writeOptions(); }
      if (j.baseList && !S.baseList) { S.baseList = j.baseList; S.baseName = j.baseName || 'phiên đã lưu'; $('#n-base').textContent = `${S.baseName} · ${NF.format(j.baseList.length)} giá`; }
      if (S.items.length) { applySession(); applyBaseline(); recompute(); msg('Đã khôi phục phiên làm việc.', 'ok'); }
      else msg(`Đã nạp phiên của file "${j.file || ''}". Nạp file BOQ tương ứng để tiếp tục.`, 'ok');
    } catch (e) { msg('Không mở được phiên: ' + (e.message || e), 'err'); }
  }

  /* ---------- Bước 2: cấu trúc ---------- */
  const headerText = (sh, c) => {
    const h = sh.det.headerRow, a = (sh.grid[h] || [])[c], b = (sh.grid[h + 1] || [])[c];
    return [a, typeof b === 'string' && sh.det.dataStart > h + 1 ? b : ''].filter(v => v !== null && v !== undefined && v !== '').join(' / ');
  };
  function renderMap() {
    const t = $('#map-tbl');
    let h = `<thead><tr><th>Dùng</th><th>Sheet</th><th>Dòng tiêu đề</th>${KEYS.map(([, l]) => `<th>${esc(l)}</th>`).join('')}<th>Số dòng hạng mục</th></tr></thead><tbody>`;
    S.sheets.forEach((sh, k) => {
      const width = Math.max(1, ...sh.grid.slice(0, 200).map(r => r.length));
      const opts = sel => '<option value="">—</option>' + Array.from({ length: width }, (_, c) => {
        const ht = headerText(sh, c);
        return `<option value="${c}"${sel === c ? ' selected' : ''}>${XLSXIO.colName(c)}${ht ? ' · ' + esc(String(ht).slice(0, 28)) : ''}</option>`;
      }).join('');
      const n = sh.include && sh.det.cols.desc !== undefined ? DXG.extractLines(sh.grid, sh.det, sh.name).filter(l => l.kind === 'item').length : 0;
      h += `<tr data-k="${k}"><td><input type="checkbox" data-a="inc"${sh.include ? ' checked' : ''}></td><td><b>${esc(sh.name)}</b>${sh.auto ? '' : ' <span class="badge b-thap">chưa nhận ra</span>'}</td>
        <td><input type="number" min="1" data-a="hdr" value="${sh.det.headerRow + 1}"></td>
        ${KEYS.map(([key]) => `<td><select data-a="col" data-key="${key}">${opts(sh.det.cols[key])}</select></td>`).join('')}
        <td class="num">${sh.include ? NF.format(n) : ''}</td></tr>`;
    });
    t.innerHTML = h + '</tbody>';
  }
  function onMapChange(e) {
    const tr = e.target.closest('tr[data-k]'); if (!tr) return;
    const sh = S.sheets[+tr.dataset.k], a = e.target.dataset.a;
    if (a === 'inc') sh.include = e.target.checked;
    if (a === 'hdr') {
      const r = Math.max(0, (+e.target.value || 1) - 1);
      const twoRow = (sh.grid[r + 1] || []).some(v => typeof v === 'string' && v.length < 40) && !(sh.grid[r + 1] || []).some(v => isNum(v));
      sh.det.headerRow = r; sh.det.dataStart = r + (twoRow ? 2 : 1);
    }
    if (a === 'col') { const v = e.target.value; if (v === '') delete sh.det.cols[e.target.dataset.key]; else sh.det.cols[e.target.dataset.key] = +v; }
    renderMap();
  }

  /* ---------- Bước 3: tham khảo ---------- */
  async function runAll() {
    const use = S.sheets.filter(s => s.include && s.det.cols.desc !== undefined);
    if (!use.length) { msg('Chưa có sheet nào được chọn hoặc chưa chọn cột Mô tả ở bước 2.', 'err'); return; }
    const t0 = performance.now(), btn = $('#go');
    btn.disabled = true;
    S.lines = []; S.items = [];
    let done = 0;
    for (const sh of use) {
      const lines = DXG.extractLines(sh.grid, sh.det, sh.name);
      S.lines.push({ kind: 'sheet', sheet: sh.name });
      for (const l of lines) {
        if (l.kind === 'item') {
          l.id = `${sh.name}|${l.r}`; l.si = sh.si; l.sh = sh;
          l.cands = DXG.match(IX, { desc: l.desc, unit: l.unit, ctx: l.ctx });
          l.sel = l.cands.length ? 0 : -1;
          l.baseCol = isNum(l.base) && l.base > 0 ? l.base : null;
          l.baseFile = null; l.baseManual = null; l.skip = false; l.note = '';
          // Giá QS: cột đơn giá; nếu chỉ có thành tiền thì suy ra = thành tiền / khối lượng
          l.qs = isNum(l.rate) && l.rate > 0 ? l.rate : (isNum(l.amount) && l.amount > 0 && isNum(l.qty) && l.qty > 0 ? l.amount / l.qty : null);
          S.items.push(l);
          if (++done % 100 === 0) { btn.textContent = `Đang khớp… ${NF.format(done)} dòng`; await new Promise(r => setTimeout(r)); }
        }
        S.lines.push(l);
      }
    }
    if (S.session) applySession();
    applyBaseline();
    console.log(`Khớp ${S.items.length} dòng trong ${Math.round(performance.now() - t0)} ms`);
    btn.disabled = false; btn.textContent = 'Tra giá tham khảo →';
    $('#step-res').hidden = false;
    S.view.shown = PAGE;
    recompute();
    $('#step-res').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function applyBaseline() {
    if (!S.baseList) return;
    const res = DXG.matchBaseline(S.items, S.baseList);
    for (const it of S.items) { const b = res.get(it); it.baseFile = b ? b.price : null; it.baseHow = b ? b.how : ''; }
  }
  function applySession() {
    const map = new Map((S.session.items || []).map(x => [x.id, x]));
    for (const it of S.items) {
      const x = map.get(it.id); if (!x) continue;
      if (x.gkey) {
        const g = IX.groups.find(gr => gr.key === x.gkey);
        if (g) {
          let k = it.cands.findIndex(c => c.g === g.id);
          if (k < 0) { it.cands.push(manualCand(g.id, it.unit)); k = it.cands.length - 1; }
          it.sel = k;
        }
      } else if (x.gkey === null) it.sel = -1;
      it.baseManual = x.baseManual ?? null; it.skip = !!x.skip; it.note = x.note || '';
    }
  }
  function manualCand(gid, unit) {
    const g = IX.groups[gid], ratio = unit ? DXG.unitRatio(g.unit, unit) : null;
    return { g: gid, score: 1, cover: 1, prec: 1, unitOk: unit ? ratio !== null : null, ratio: ratio ?? 1, picked: true };
  }

  // Thống kê nhóm có bộ nhớ đệm theo bộ lọc hiện hành
  let statCache = new Map(), statKey = '';
  function stats(gid, ratio) {
    const o = S.opt;
    const fk = [o.yearFrom, o.yearTo, [...o.types].join(','), [...o.provs].join(','), o.excludeReview, o.excludeOutlier, o.excludeWarn].join('|');
    if (fk !== statKey) { statCache = new Map(); statKey = fk; }
    const k = gid + '|' + ratio;
    if (!statCache.has(k)) statCache.set(k, DXG.groupStats(IX, gid, o, ratio));
    return statCache.get(k);
  }
  function calc(it) {
    const o = S.opt, f = o.factor, c = it.sel >= 0 ? it.cands[it.sel] : null;
    const st = c ? stats(c.g, c.ratio) : null;
    const fit = c ? (c.picked ? { level: 'cao', value: 1, picked: true } : DXG.confidence(c, st)) : { level: 'none', value: 0 };
    // nhóm chỉ dùng làm tham khảo khi đủ độ phù hợp hoặc do QS chọn
    const shown = !!(c && st && (fit.level !== 'none' || c.picked));
    const ref = shown ? { p10: st.p10 * f, p25: st.p25 * f, p50: st.med * f, p75: st.p75 * f, p90: st.p90 * f } : null;
    const qs = it.qs;
    // Đánh giá: theo vị trí trên phân bố + ngưỡng % so với P50 (tránh gắn cờ khi phân bố quá hẹp)
    const d50 = ref && isNum(qs) && ref.p50 ? qs / ref.p50 - 1 : null;
    let ev;
    if (it.skip) ev = 'skip';
    else if (!ref) ev = 'notk';
    else if (!isNum(qs)) ev = 'nogia';
    else if ((qs >= ref.p25 && qs <= ref.p75) || Math.abs(d50) <= o.tolOk) ev = 'ok';
    else if ((qs < ref.p10 || qs > ref.p90) && Math.abs(d50) > o.tolBt) ev = 'bt';
    else ev = 'xem';
    const zone = !ref || !isNum(qs) ? '' : qs < ref.p10 ? '< P10' : qs < ref.p25 ? 'P10–P25' : qs <= ref.p75 ? 'P25–P75' : qs <= ref.p90 ? 'P75–P90' : '> P90';
    const prank = ref && isNum(qs) ? DXG.percentRank(st.sorted, qs / f) : null;
    const base = isNum(it.baseManual) ? it.baseManual : isNum(it.baseFile) ? it.baseFile : it.baseCol;
    const baseSrc = isNum(it.baseManual) ? 'nhập tay' : isNum(it.baseFile) ? 'file baseline' : isNum(it.baseCol) ? 'cột BOQ' : '';
    const dev = DXG.diff(qs, base, it.qty);
    const devHi = !!(dev && dev.pct !== null && Math.abs(dev.pct) > o.tolBl);
    const notes = [];
    if (shown) {
      if (st.n < 3) notes.push(`Ít mẫu (${st.n} báo giá)`);
      if (st.relaxed) notes.push('Đã nới bộ lọc');
      if (c.unitOk === false) notes.push(`Khác đơn vị (${IX.groups[c.g].unit})`);
      if (fit.level === 'thap') notes.push('Khớp nhóm yếu');
      if (c.ratio !== 1) notes.push(`Quy đổi ${IX.groups[c.g].unit} ×${fmtQ(c.ratio)}`);
    }
    it.c = { cand: c, shown, st, fit, ref, qs, d50, ev, zone, prank, base, baseSrc, dev, devHi, notes,
      amtQs: isNum(qs) && isNum(it.qty) ? qs * it.qty : null, amtRef: ref && isNum(it.qty) ? ref.p50 * it.qty : null,
      amtBase: isNum(base) && isNum(it.qty) ? base * it.qty : null };
    return it.c;
  }
  function recompute() {
    if (!S.items.length) return;
    readOptions();
    for (const it of S.items) calc(it);
    renderKpis();
    if (S.view.tab === 'lines') renderTable(); else renderSummary();
    if (S.view.cur) renderDrawer(S.view.cur);
  }

  /* ---------- KPI ---------- */
  function totals(items) {
    const t = { n: 0, tk: 0, qs: 0, ev: { ok: 0, xem: 0, bt: 0, nogia: 0, notk: 0 }, amtQs: 0, qsRef: 0, ref: 0, qsBase: 0, base: 0, nRef: 0, nBase: 0, devHi: 0 };
    for (const it of items) {
      const c = it.c; if (it.skip) continue;
      t.n++; if (c.ref) t.tk++; if (isNum(c.qs)) t.qs++;
      t.ev[c.ev]++;
      if (c.devHi) t.devHi++;
      if (isNum(c.amtQs)) t.amtQs += c.amtQs;
      if (isNum(c.amtQs) && isNum(c.amtRef)) { t.qsRef += c.amtQs; t.ref += c.amtRef; t.nRef++; }
      if (isNum(c.amtQs) && isNum(c.amtBase)) { t.qsBase += c.amtQs; t.base += c.amtBase; t.nBase++; }
    }
    return t;
  }
  function renderKpis() {
    const t = totals(S.items);
    const dRef = t.ref ? (t.qsRef - t.ref) / t.ref : null, dBase = t.base ? (t.qsBase - t.base) / t.base : null;
    $('#kpis').innerHTML = [
      ['Dòng hạng mục', NF.format(t.n), `${NF.format(t.tk)} dòng có giá tham khảo · ${NF.format(t.qs)} dòng QS đã có giá`, 'all'],
      ['Hợp lý', NF.format(t.ev.ok), `trong P25–P75 hoặc lệch P50 ≤ ${Math.round(S.opt.tolOk * 100)}%`, 'ok'],
      ['Cần xem', NF.format(t.ev.xem), 'ngoài P25–P75, chưa tới mức bất thường', 'xem'],
      ['Bất thường', NF.format(t.ev.bt), `ngoài P10–P90 và lệch P50 > ${Math.round(S.opt.tolBt * 100)}%`, 'bt'],
      ['Tổng giá trị QS', fmt(t.amtQs), `so với P50 CSDL: ${dRef === null ? '—' : pct(dRef)} (${NF.format(t.nRef)} dòng)`, ''],
      ['So với baseline', dBase === null ? '—' : pct(dBase), dBase === null ? (S.baseName ? 'chưa ghép được dòng nào' : 'chưa có baseline') : `${NF.format(t.nBase)} dòng · ${NF.format(t.devHi)} dòng lệch > ${Math.round(S.opt.tolBl * 100)}%`, 'dev'],
    ].map(([k, v, s, f]) => `<div class="kpi${f ? ' clickable' : ''}" ${f ? `data-f="${f}"` : ''}><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div><div class="s">${esc(s)}</div></div>`).join('');
  }

  /* ---------- Bảng ---------- */
  function visible() {
    const { f, q } = S.view, nq = DXG.norm(q);
    const pass = it => {
      const c = it.c;
      if (['ok', 'xem', 'bt', 'nogia', 'notk'].includes(f) && c.ev !== f) return false;
      if (f === 'dev' && !c.devHi) return false;
      if (f === 'note' && !it.note) return false;
      if (nq && !DXG.norm(it.desc + ' ' + it.code + ' ' + it.ctx).includes(nq)) return false;
      return true;
    };
    if (f === 'all' && !nq) return S.lines;
    return S.lines.filter(l => l.kind === 'item' && pass(l));
  }
  const EV_CLS = { ok: 'cao', xem: 'thap', bt: 'none', nogia: 'man', notk: 'man', skip: 'man' };
  const evBadge = it => `<span class="badge b-${EV_CLS[it.c.ev]}">${EVAL[it.c.ev]}</span>`;
  const fitBadge = it => it.c.cand ? `<span class="badge b-${it.c.fit.level}" title="Độ phù hợp của nhóm CSDL với mô tả BOQ">${it.c.cand.picked ? 'QS chọn' : FIT[it.c.fit.level]}</span>` : '';
  function rowHtml(l) {
    if (l.kind === 'sheet') return `<tr class="head"><td colspan="12">Sheet: ${esc(l.sheet)}</td></tr>`;
    if (l.kind === 'head') return `<tr class="head"><td>${esc(l.code)}</td><td colspan="11">${esc(l.desc)}</td></tr>`;
    if (l.kind !== 'item') return '';
    const c = l.c, g = c.shown ? IX.groups[c.cand.g] : null;
    return `<tr data-id="${esc(l.id)}"${S.view.cur === l ? ' class="sel"' : ''}>
      <td class="small">${esc(l.code)}</td>
      <td class="desc">${esc(l.desc)}${l.ctx ? `<div class="ctx">${esc(l.ctx)}</div>` : ''}${l.note ? `<div class="note">Ý kiến: ${esc(l.note)}</div>` : ''}</td>
      <td>${esc(l.unit)}</td>
      <td class="num">${fmtQ(l.qty)}</td>
      <td class="grp">${g ? esc(g.name) : c.cand ? `<span class="muted">gợi ý yếu: ${esc(IX.groups[c.cand.g].name)}</span>` : '<span class="muted">—</span>'} ${fitBadge(l)}
        ${g ? `<div class="price-sub">${c.st.n} báo giá · ${c.st.proj} dự án · gần nhất ${c.st.latest || '?'}</div>` : ''}${c.notes.length ? `<div class="price-sub warn">${esc(c.notes.join(' · '))}</div>` : ''}</td>
      <td class="num"><b>${c.ref ? fmt(c.ref.p50) : ''}</b></td>
      <td class="num small">${c.ref ? `${fmt(c.ref.p25)} – ${fmt(c.ref.p75)}<div class="price-sub">P10–P90: ${fmt(c.ref.p10)} – ${fmt(c.ref.p90)}</div>` : ''}</td>
      <td class="num"><b>${fmt(c.qs)}</b></td>
      <td class="num small">${esc(c.zone)}${c.d50 !== null ? `<div class="price-sub">${pct(c.d50)} so P50</div>` : ''}</td>
      <td>${evBadge(l)}</td>
      <td class="num">${fmt(c.base)}${c.baseSrc ? `<div class="price-sub">${esc(c.baseSrc)}</div>` : ''}</td>
      <td class="num ${c.devHi ? 'd-hi' : c.dev ? 'd-ok' : ''}">${c.dev ? pct(c.dev.pct) : ''}</td></tr>`;
  }
  function renderTable() {
    const rows = visible(), items = rows.filter(l => l.kind === 'item').length;
    $('#res-tbl').innerHTML = `<thead><tr><th>Mã</th><th>Mô tả</th><th>ĐV</th><th class="num">KL</th><th>Nhóm tham khảo trong CSDL</th>
      <th class="num">Giá TK (P50)</th><th class="num">P25 – P75</th><th class="num">Giá QS</th><th class="num">Vị trí</th><th>Đánh giá</th><th class="num">Baseline</th><th class="num">QS / BL</th></tr></thead>
      <tbody>${rows.slice(0, S.view.shown).map(rowHtml).join('')}</tbody>`;
    $('#flt-count').textContent = `${NF.format(items)} dòng`;
    $('#more').hidden = rows.length <= S.view.shown;
  }

  /* ---------- Ngăn chi tiết ---------- */
  const projOf = i => (window.DB.projects || [])[IX.C.p ? IX.C.p[i] : -1] || [];
  function openDrawer(it) {
    if (!it) return;
    S.view.cur = it; renderDrawer(it); $('#drawer').hidden = false;
    $$('#res-tbl tr.sel').forEach(r => r.classList.remove('sel'));
    const tr = $(`#res-tbl tr[data-id="${CSS.escape(it.id)}"]`); if (tr) tr.classList.add('sel');
  }
  function closeDrawer() { S.view.cur = null; $('#drawer').hidden = true; $$('#res-tbl tr.sel').forEach(r => r.classList.remove('sel')); }
  // Thanh phân bố P10–P90 và vị trí giá QS / baseline
  function distBar(c) {
    if (!c.ref) return '';
    const { p10, p25, p50, p75, p90 } = c.ref;
    const pts = [p10, p90, c.qs, c.base].filter(isNum);
    const lo = Math.min(...pts) * 0.95, hi = Math.max(...pts) * 1.05, x = v => ((v - lo) / (hi - lo) * 100).toFixed(2) + '%';
    const mark = (v, cls, label) => isNum(v) ? `<span class="pm ${cls}" style="left:${x(v)}" title="${esc(label)}: ${fmt(v)}"><i>${esc(label)}</i></span>` : '';
    return `<div class="dist"><div class="dist-track">
      <span class="dist-w" style="left:${x(p10)};width:calc(${x(p90)} - ${x(p10)})"></span>
      <span class="dist-iqr" style="left:${x(p25)};width:calc(${x(p75)} - ${x(p25)})"></span>
      <span class="dist-med" style="left:${x(p50)}"></span>
      ${mark(c.qs, 'pm-qs', 'QS')}${mark(c.base, 'pm-bl', 'BL')}</div>
      <div class="dist-lab small muted"><span>P10 ${fmt(p10)}</span><span>P25 ${fmt(p25)}</span><span><b>P50 ${fmt(p50)}</b></span><span>P75 ${fmt(p75)}</span><span>P90 ${fmt(p90)}</span></div></div>`;
  }
  function candHtml(it, c, k) {
    const g = IX.groups[c.g], st = stats(c.g, c.ratio), f = S.opt.factor;
    const conv = c.ratio !== 1 ? ` · quy đổi từ ${esc(g.unit)} ×${fmtQ(c.ratio)}` : '';
    return `<div class="cand${it.sel === k ? ' on' : ''}" data-k="${k}">
      <input type="radio" name="cand"${it.sel === k ? ' checked' : ''}>
      <div><div class="nm">${esc(g.name)}</div>
        <div class="small muted">ĐV ${esc(g.unit || '?')}${conv}${c.unitOk === false ? ' · <b class="d-hi">khác đơn vị</b>' : ''} · ${st.n} báo giá · ${st.proj} dự án · gần nhất ${st.latest || '?'}${st.relaxed ? ' · đã nới bộ lọc' : ''}</div></div>
      <div class="num"><b>${fmt(st.med * f)}</b><div class="price-sub">${fmt(st.p25 * f)} – ${fmt(st.p75 * f)}</div><div class="price-sub">${c.picked ? 'QS chọn' : 'phù hợp ' + Math.round(c.score * 100) + '%'}</div></div></div>`;
  }
  function renderDrawer(it) {
    const c = it.c || calc(it), o = S.opt;
    $('#dw-title').textContent = `${it.sheet} · dòng Excel ${it.r + 1}${it.code ? ' · mã ' + it.code : ''}`;
    const kv = [['Mô tả', esc(it.desc)], ['Hạng mục cha', esc(it.ctx)], ['Đơn vị / KL', `${esc(it.unit)} · ${fmtQ(it.qty)}`],
      ['Giá QS', isNum(c.qs) ? `<b>${fmt(c.qs)}</b>${isNum(it.rate) ? '' : ' <span class="muted small">(= thành tiền / khối lượng)</span>'}` : '<span class="muted">chưa có trong file</span>'],
      ['Đánh giá', `${evBadge(it)} ${c.zone ? `<span class="small">vị trí ${esc(c.zone)}${c.prank !== null ? ` (≈ P${Math.round(c.prank * 100)})` : ''} · ${pct(c.d50)} so với P50</span>` : ''}`],
      ['Baseline', isNum(c.base) ? `${fmt(c.base)} <span class="muted small">(${esc(c.baseSrc)}${it.baseHow && c.baseSrc === 'file baseline' ? ', ghép theo ' + esc(it.baseHow) : ''})</span>${c.dev ? ` · QS lệch <span class="${c.devHi ? 'd-hi' : 'd-ok'}">${pct(c.dev.pct)}</span>` : ''}` : '—'],
      ['Lưu ý dữ liệu', c.notes.length ? `<span class="warn">${esc(c.notes.join(' · '))}</span>` : '—']];
    let h = `<div class="row-in" style="justify-content:space-between;margin-bottom:10px"><button class="btn sm" data-do="prev">← Dòng trước</button><button class="btn sm" data-do="next">Dòng sau →</button></div>
      <div class="kv">${kv.map(([k, v]) => `<div>${k}</div><div>${v}</div>`).join('')}</div>
      <h4>Phân bố giá tham khảo${o.factor !== 1 ? ` (đã nhân hệ số ${Math.round(o.factor * 1000) / 10}%)` : ''}</h4>
      ${c.ref ? distBar(c) : '<div class="muted small">Chưa có nhóm tham khảo phù hợp — chọn hoặc tìm nhóm bên dưới.</div>'}
      <h4>Ý kiến QS / tư vấn</h4>
      <textarea id="dw-note" rows="3" placeholder="vd: Giá thấp do NCC chào giá khuyến mãi; đề nghị kiểm tra lại quy cách…">${esc(it.note)}</textarea>
      <div class="row-in" style="margin-top:6px"><label>Baseline nhập tay</label><input type="number" id="dw-base" step="any" value="${isNum(it.baseManual) ? it.baseManual : ''}" placeholder="${isNum(it.baseFile ?? it.baseCol) ? fmt(it.baseFile ?? it.baseCol) : 'nhập giá'}">
        <label><input type="checkbox" id="dw-skip"${it.skip ? ' checked' : ''}> Không đánh giá dòng này</label>
        <button class="btn sm primary" data-do="apply">Lưu</button></div>
      <h4>Nhóm công việc tham khảo trong CSDL ${it.cands.length ? '' : '<span class="muted">(không tìm thấy — tìm thủ công bên dưới)</span>'}</h4>
      ${it.cands.map((cd, k) => candHtml(it, cd, k)).join('')}
      ${it.sel >= 0 ? '<button class="link small" data-do="unsel">Không dùng nhóm nào làm tham khảo</button>' : ''}
      <h4>Tìm nhóm khác trong CSDL</h4>
      <div class="row-in"><input type="search" id="dw-q" placeholder="vd: bê tông lót móng M150"><button class="btn sm" data-do="search">Tìm</button></div>
      <div id="dw-sr"></div>`;
    if (c.shown) {
      const ids = [...c.st.ids].sort((a, b) => (IX.C.y[b] || 0) - (IX.C.y[a] || 0)).slice(0, 60);
      h += `<h4>Báo giá tham khảo (${c.st.n}${c.st.n > ids.length ? `, hiện ${ids.length} mới nhất` : ''})</h4>
        <div class="tbl-wrap"><table class="refs"><thead><tr><th>Năm</th>${ADMIN ? '<th>Dự án</th>' : ''}<th>Tỉnh/TP</th><th>Tên trong báo giá</th><th class="num">Giá quy đổi</th><th class="num">Giá gốc</th></tr></thead><tbody>
        ${ids.map(i => { const p = projOf(i); return `<tr><td>${IX.C.y[i] || ''}</td>${ADMIN ? `<td>${esc(p[1] || p[0] || '')}</td>` : ''}<td>${esc(p[4] || p[3] || '')}</td><td>${esc(IX.C.name[i])}</td><td class="num">${fmt(IX.price(i) * c.cand.ratio * o.factor)}</td><td class="num small">${fmt(IX.C.tot[i])} /${esc(IX.unitOf(i))}</td></tr>`; }).join('')}
        </tbody></table></div>`;
    }
    $('#dw-body').innerHTML = h;
  }
  function drawerAction(e) {
    const it = S.view.cur; if (!it) return;
    const cand = e.target.closest('.cand[data-k]');
    if (cand) { it.sel = +cand.dataset.k; return refreshItem(it); }
    const sr = e.target.closest('[data-g]');
    if (sr) {
      const gid = +sr.dataset.g;
      let k = it.cands.findIndex(x => x.g === gid);
      if (k < 0) { it.cands.unshift(manualCand(gid, it.unit)); k = 0; }
      else it.cands[k] = { ...it.cands[k], picked: true };
      it.sel = k; return refreshItem(it);
    }
    const act = e.target.dataset && e.target.dataset.do;
    if (act === 'apply') {
      const b = $('#dw-base').value.trim();
      it.baseManual = b === '' ? null : +b; it.note = $('#dw-note').value.trim(); it.skip = $('#dw-skip').checked;
      return refreshItem(it);
    }
    if (act === 'unsel') { it.sel = -1; return refreshItem(it); }
    if (act === 'search') return drawerSearch(it);
    if (act === 'prev' || act === 'next') {
      const list = visible().filter(l => l.kind === 'item'), k = list.indexOf(it);
      openDrawer(list[k + (act === 'next' ? 1 : -1)]);
    }
  }
  function drawerSearch(it) {
    const q = $('#dw-q').value.trim(); if (!q) return;
    const res = DXG.match(IX, { desc: q, unit: it.unit, ctx: '' }, { limit: 12 });
    $('#dw-sr').innerHTML = res.length ? res.map(r => {
      const g = IX.groups[r.g], st = stats(r.g, r.ratio), f = S.opt.factor;
      return `<div class="cand" data-g="${r.g}"><span>＋</span><div><div class="nm">${esc(g.name)}</div><div class="small muted">ĐV ${esc(g.unit)}${r.unitOk === false ? ' · <b class="d-hi">khác đơn vị</b>' : ''} · ${st.n} báo giá · ${st.proj} dự án</div></div><div class="num"><b>${fmt(st.med * f)}</b><div class="price-sub">${fmt(st.p25 * f)} – ${fmt(st.p75 * f)}</div></div></div>`;
    }).join('') : '<div class="muted small">Không tìm thấy nhóm nào.</div>';
  }
  function refreshItem(it) {
    calc(it); renderKpis();
    const tr = $(`#res-tbl tr[data-id="${CSS.escape(it.id)}"]`);
    if (tr) tr.outerHTML = rowHtml(it);
    renderDrawer(it);
  }

  /* ---------- Tổng hợp ---------- */
  function groupBy(keyFn) {
    const m = new Map();
    for (const it of S.items) { if (it.skip) continue; const k = keyFn(it); if (!m.has(k)) m.set(k, []); m.get(k).push(it); }
    return [...m.entries()].map(([k, items]) => ({ k, ...totals(items) }));
  }
  function renderSummary() {
    const o = S.opt;
    const tbl = (rows, label) => `<div class="tbl-wrap"><table><thead><tr><th>${label}</th><th class="num">Dòng</th><th class="num">Hợp lý</th><th class="num">Cần xem</th><th class="num">Bất thường</th><th class="num">Chưa có TK</th><th class="num">Tổng giá trị QS</th><th class="num">QS / P50</th><th class="num">QS / baseline</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${esc(r.k)}</td><td class="num">${NF.format(r.n)}</td><td class="num">${r.ev.ok}</td><td class="num">${r.ev.xem}</td><td class="num ${r.ev.bt ? 'd-hi' : ''}">${r.ev.bt}</td><td class="num">${r.ev.notk}</td><td class="num">${fmt(r.amtQs)}</td>
        <td class="num">${r.ref ? pct((r.qsRef - r.ref) / r.ref) : ''}</td><td class="num">${r.base ? pct((r.qsBase - r.base) / r.base) : ''}</td></tr>`).join('')}
      </tbody></table></div>`;
    const t = totals(S.items), tot = t.n || 1;
    const seg = (n, cls, title) => n ? `<span class="${cls}" style="width:${n / tot * 100}%" title="${esc(title)}: ${n}"></span>` : '';
    // Dòng cần QS chú ý nhất: bất thường xếp theo giá trị chênh với P50
    const watch = S.items.filter(it => !it.skip && (it.c.ev === 'bt' || it.c.devHi) && isNum(it.c.amtQs))
      .map(it => ({ it, d: isNum(it.c.amtRef) ? it.c.amtQs - it.c.amtRef : 0 })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 15);
    $('#tab-sum').innerHTML = `<div class="sum-grid">
      <div class="card"><h3>Đánh giá giá QS so với CSDL</h3>
        <div class="distbar">${seg(t.ev.ok, 'c-ok', 'Hợp lý')}${seg(t.ev.xem, 'c-lo', 'Cần xem')}${seg(t.ev.bt, 'c-hi', 'Bất thường')}${seg(t.ev.nogia + t.ev.notk, 'c-na', 'Chưa có giá / tham khảo')}</div>
        <div class="legend"><span><i class="c-ok"></i>Hợp lý: ${t.ev.ok}</span><span><i class="c-lo"></i>Cần xem: ${t.ev.xem}</span><span><i class="c-hi"></i>Bất thường: ${t.ev.bt}</span><span><i class="c-na"></i>Chưa có giá QS: ${t.ev.nogia} · không có tham khảo: ${t.ev.notk}</span></div>
        <p class="small muted">Đánh giá chỉ để QS tham khảo. Giá lệch khỏi CSDL có thể đúng do điều kiện riêng của dự án — QS ghi lý do vào ý kiến.</p></div>
      <div class="card"><h3>Dòng nên rà soát (bất thường hoặc lệch baseline &gt; ${Math.round(o.tolBl * 100)}%)</h3>
        <div class="tbl-wrap"><table><thead><tr><th>Mô tả</th><th class="num">Giá QS</th><th class="num">P50</th><th class="num">Vị trí</th><th class="num">QS / BL</th><th class="num">Chênh TT vs P50</th></tr></thead><tbody>
        ${watch.map(({ it, d }) => `<tr data-id="${esc(it.id)}" class="jump"><td>${esc(it.desc.slice(0, 70))}</td><td class="num">${fmt(it.c.qs)}</td><td class="num">${it.c.ref ? fmt(it.c.ref.p50) : ''}</td><td class="num">${esc(it.c.zone)}</td><td class="num ${it.c.devHi ? 'd-hi' : ''}">${it.c.dev ? pct(it.c.dev.pct) : ''}</td><td class="num">${d ? fmt(d) : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Không có dòng nào cần rà soát.</td></tr>'}
        </tbody></table></div></div>
    </div>
    <div class="card"><h3>Theo sheet</h3>${tbl(groupBy(it => it.sheet), 'Sheet')}</div>
    <div class="card"><h3>Theo hạng mục cấp 1</h3>${tbl(groupBy(it => `${it.sheet} · ${it.heads[0] || '(không có tiêu đề)'}`), 'Hạng mục')}</div>`;
  }

  /* ---------- Xuất Excel: chỉ THÊM sheet TK_*, không đụng sheet BOQ gốc ---------- */
  const sheetRef = name => `'${name.replace(/'/g, "''")}'!`;
  const C = c => XLSXIO.colName(c);
  async function exportXlsx(opt) {
    const wb = S.wb;
    const st = {
      head: wb.style({ bold: true, fill: 'FFDDEBF7', border: true, wrap: true }),
      num: wb.style({ numFmt: '#,##0', border: true }), qty: wb.style({ numFmt: '#,##0.00', border: true }),
      pct: wb.style({ numFmt: '0.0%', border: true }), txt: wb.style({ border: true }), wrap: wb.style({ border: true, wrap: true }),
      ref: wb.style({ numFmt: '#,##0', border: true, fill: 'FFF2F2F2' }), qs: wb.style({ numFmt: '#,##0', border: true, bold: true }),
      link: wb.style({ border: true, color: 'FF0563C1' }), title: wb.style({ bold: true }), bold: wb.style({ bold: true, border: true }), note: wb.style({ italic: true, color: 'FF595959' }),
    };
    const dx = {
      ok: wb.dxf({ fill: 'FFE2F0D9', color: 'FF1F6B3A' }), xem: wb.dxf({ fill: 'FFFFF2CC', color: 'FF7F6000' }),
      bt: wb.dxf({ fill: 'FFF8CBAD', color: 'FF9C0006', bold: true }), dev: wb.dxf({ color: 'FF9C0006', bold: true }),
    };
    wb.putSheet('TK_DanhGia', evalRows(st), {
      widths: [14, 7, 26, 8, 48, 7, 11, 40, 8, 11, 7, 7, 8, 12, 12, 12, 12, 12, 13, 9, 10, 18, 13, 10, 16, 16, 30, 40],
      freeze: 1, filter: 1,
      cf: [
        { sqref: `V2:V${S.items.length + 1}`, rules: [{ formula: 'V2="Hợp lý"', dxf: dx.ok }, { formula: 'V2="Cần xem"', dxf: dx.xem }, { formula: 'V2="Bất thường"', dxf: dx.bt }] },
        { sqref: `X2:X${S.items.length + 1}`, rules: [{ formula: `AND(ISNUMBER(X2),ABS(X2)>${S.opt.tolBl})`, dxf: dx.dev }] },
      ],
    });
    if (opt.sum) wb.putSheet('TK_TongHop', summaryRows(st), { widths: [46, 9, 9, 9, 11, 11, 18, 11, 11] });
    if (opt.ref && ADMIN) wb.putSheet('TK_NguonGia', sourceRows(st), { widths: [14, 7, 50, 8, 34, 50, 14, 14, 10], freeze: 1, filter: 1 });
    const blob = await wb.save();
    download(blob, S.fileName.replace(/\.(xlsx|xlsm)$/i, '') + '_ThamKhaoGia.xlsx');
    S.wb = await XLSXIO.read(await blob.arrayBuffer());
  }
  // Sheet đánh giá: 1 dòng / hạng mục BOQ. Giá QS, KL là công thức trỏ về sheet gốc → tự cập nhật khi QS sửa giá.
  function evalRows(st) {
    const H = ['Sheet', 'Dòng', 'Hạng mục', 'Mã', 'Mô tả', 'ĐV', 'KL', 'Nhóm tham khảo trong CSDL', 'ĐV nhóm', 'Độ phù hợp', 'Số BG', 'Số DA', 'Năm gần nhất',
      'P10', 'P25', 'P50 (giá TK)', 'P75', 'P90', 'Giá QS', 'QS / P50', 'Vị trí', 'Đánh giá', 'Baseline', 'QS / Baseline', 'Thành tiền QS', 'Thành tiền theo P50', 'Lưu ý dữ liệu', 'Ý kiến QS / tư vấn'];
    const rows = [H.map(v => ({ v, s: st.head }))];
    S.items.forEach((it, k) => {
      const c = it.c, x = k + 2, cols = it.sh.det.cols, sr = sheetRef(it.sheet), er = it.r + 1;
      const g = c.shown ? IX.groups[c.cand.g] : null, R = c.ref;
      const cell = col => `${sr}${C(col)}${er}`;
      const qtyF = cols.qty !== undefined ? `IF(ISNUMBER(${cell(cols.qty)}),${cell(cols.qty)},"")` : null;
      const qsF = cols.rate !== undefined ? `IF(ISNUMBER(${cell(cols.rate)}),IF(${cell(cols.rate)}=0,"",${cell(cols.rate)}),"")`
        : (cols.amount !== undefined && cols.qty !== undefined ? `IFERROR(IF(${cell(cols.amount)}/${cell(cols.qty)}=0,"",${cell(cols.amount)}/${cell(cols.qty)}),"")` : null);
      const num = v => isNum(v) ? Math.round(v) : null;
      const S_ = `S${x}`, N_ = `N${x}`, O_ = `O${x}`, P_ = `P${x}`, Q_ = `Q${x}`, R_ = `R${x}`;
      const o = S.opt, D = `ABS(${S_}/${P_}-1)`;
      const evalF = it.skip ? null : `IF(${P_}="","${EVAL.notk}",IF(${S_}="","${EVAL.nogia}",IF(OR(AND(${S_}>=${O_},${S_}<=${Q_}),${D}<=${o.tolOk}),"${EVAL.ok}",IF(AND(OR(${S_}<${N_},${S_}>${R_}),${D}>${o.tolBt}),"${EVAL.bt}","${EVAL.xem}"))))`;
      rows.push([
        { v: it.sheet, s: st.txt },
        { f: `HYPERLINK("#${sr}A${er}",${er})`, v: er, s: st.link },
        { v: it.heads[0] || '', s: st.txt }, { v: it.code, s: st.txt }, { v: it.desc, s: st.wrap }, { v: it.unit, s: st.txt },
        qtyF ? { f: qtyF, v: isNum(it.qty) ? it.qty : '', s: st.qty } : { v: it.qty, s: st.qty },
        { v: g ? g.name : '', s: st.wrap }, { v: g ? g.unit : '', s: st.txt },
        { v: !c.cand ? 'Không khớp' : c.cand.picked ? 'QS chọn' : FIT[c.fit.level], s: st.txt },
        { v: g ? c.st.n : null, s: st.num }, { v: g ? c.st.proj : null, s: st.num }, { v: g ? c.st.latest || null : null, s: st.txt },
        { v: R ? num(R.p10) : null, s: st.ref }, { v: R ? num(R.p25) : null, s: st.ref }, { v: R ? num(R.p50) : null, s: st.ref }, { v: R ? num(R.p75) : null, s: st.ref }, { v: R ? num(R.p90) : null, s: st.ref },
        qsF ? { f: qsF, v: isNum(c.qs) ? c.qs : '', s: st.qs } : { v: null, s: st.qs },
        { f: `IF(OR(${S_}="",${P_}=""),"",${S_}/${P_}-1)`, v: c.d50 !== null ? c.d50 : '', s: st.pct },
        { f: `IF(OR(${S_}="",${P_}=""),"",IF(${S_}<${N_},"< P10",IF(${S_}<${O_},"P10–P25",IF(${S_}<=${Q_},"P25–P75",IF(${S_}<=${R_},"P75–P90","> P90")))))`, v: c.zone, s: st.txt },
        evalF ? { f: evalF, v: EVAL[c.ev], s: st.txt } : { v: EVAL.skip, s: st.txt },
        { v: isNum(c.base) ? c.base : null, s: st.num },
        { f: `IF(OR(${S_}="",W${x}=""),"",${S_}/W${x}-1)`, v: c.dev && isNum(c.dev.pct) ? c.dev.pct : '', s: st.pct },
        { f: `IF(OR(${S_}="",G${x}=""),"",${S_}*G${x})`, v: isNum(c.amtQs) ? c.amtQs : '', s: st.num },
        { f: `IF(OR(${P_}="",G${x}=""),"",${P_}*G${x})`, v: isNum(c.amtRef) ? c.amtRef : '', s: st.num },
        { v: c.notes.join(' · '), s: st.wrap }, { v: it.note, s: st.wrap },
      ]);
    });
    return rows;
  }
  // Tổng hợp: số liệu tại thời điểm xuất (sheet TK_DanhGia mới là bảng cập nhật trực tiếp)
  function summaryRows(st) {
    const o = S.opt, t = totals(S.items), H = v => ({ v, s: st.head }), N = v => ({ v: isNum(v) ? Math.round(v) : null, s: st.num }), T = v => ({ v, s: st.txt }), P = v => ({ v: v, s: st.pct });
    const rows = [
      [{ v: `THAM KHẢO & ĐÁNH GIÁ GIÁ BOQ — ${S.fileName}`, s: st.title }],
      [`Lập lúc ${new Date().toLocaleString('vi-VN', { hour12: false })}${window.SECURE ? ' · ' + window.SECURE.name : ''}`],
      [`CSDL: giá quy về ${window.DB.baseYear || 2026} · hệ số ${Math.round(o.factor * 1000) / 10}% · năm ${o.yearFrom || '…'}–${o.yearTo || '…'} · loại hình: ${[...o.types].join(', ') || 'tất cả'} · tỉnh: ${[...o.provs].join(', ') || 'tất cả'}`],
      [`Baseline: ${S.baseName || (t.base ? 'cột baseline trong BOQ' : 'chưa có')} · ngưỡng lệch ${Math.round(o.tolBl * 100)}%`],
      [`Đánh giá giá QS: Hợp lý = trong P25–P75 hoặc lệch P50 ≤ ${Math.round(o.tolOk * 100)}% · Bất thường = ngoài P10–P90 và lệch P50 > ${Math.round(o.tolBt * 100)}% · còn lại Cần xem`],
      [{ v: 'Giá do QS lập. CSDL chỉ dùng để tham khảo. Bảng dưới là số liệu tại thời điểm xuất; sheet TK_DanhGia tự cập nhật khi QS sửa giá trong các sheet BOQ.', s: st.note }],
      [],
      [H('Chỉ tiêu'), H('Giá trị')],
      [T('Số dòng hạng mục'), N(t.n)], [T('Có giá tham khảo CSDL'), N(t.tk)], [T('QS đã có giá'), N(t.qs)],
      [T('Hợp lý / Cần xem / Bất thường'), T(`${t.ev.ok} / ${t.ev.xem} / ${t.ev.bt}`)],
      [T('Tổng giá trị QS (VNĐ)'), N(t.amtQs)],
      [T('QS so với P50 CSDL (trên dòng có cả 2)'), P(t.ref ? (t.qsRef - t.ref) / t.ref : null)],
      [T('QS so với baseline (trên dòng có cả 2)'), P(t.base ? (t.qsBase - t.base) / t.base : null)],
      [],
      [H('Sheet / Hạng mục cấp 1'), H('Dòng'), H('Hợp lý'), H('Cần xem'), H('Bất thường'), H('Chưa có TK'), H('Tổng giá trị QS'), H('QS / P50'), H('QS / baseline')],
    ];
    const groups = new Map();
    for (const it of S.items) {
      if (it.skip) continue;
      for (const k of [it.sheet, `   ${it.sheet} · ${it.heads[0] || '(không có tiêu đề)'}`]) { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
    }
    for (const [k, items] of groups) {
      const x = totals(items), bold = !k.startsWith('   ');
      rows.push([{ v: k, s: bold ? st.bold : st.txt }, N(x.n), N(x.ev.ok), N(x.ev.xem), N(x.ev.bt), N(x.ev.notk), N(x.amtQs), P(x.ref ? (x.qsRef - x.ref) / x.ref : null), P(x.base ? (x.qsBase - x.base) / x.base : null)]);
    }
    return rows;
  }
  function sourceRows(st) {
    const rows = [['Sheet', 'Dòng', 'Mô tả BOQ', 'Năm', 'Dự án', 'Tên trong báo giá', 'Giá quy đổi', 'Giá gốc', 'ĐV gốc'].map(v => ({ v, s: st.head }))];
    for (const it of S.items) {
      const c = it.c; if (!c.shown || it.skip) continue;
      const ids = [...c.st.ids].sort((a, b) => (IX.C.y[b] || 0) - (IX.C.y[a] || 0)).slice(0, 10);
      for (const i of ids) { const p = projOf(i); rows.push([it.sheet, it.r + 1, it.desc, IX.C.y[i] || null, p[1] || p[0] || '', IX.C.name[i], { v: Math.round(IX.price(i) * c.cand.ratio * S.opt.factor), s: st.num }, { v: IX.C.tot[i], s: st.num }, IX.unitOf(i)]); }
    }
    return rows;
  }
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function sessionData() {
    const o = S.opt;
    return {
      dinh_dang: 'DGBQ2', file: S.fileName, at: new Date().toISOString(),
      opt: { ...o, types: [...o.types], provs: [...o.provs] }, baseName: S.baseName, baseList: S.baseList,
      items: S.items.filter(it => (it.cands[it.sel] && it.cands[it.sel].picked) || (it.sel < 0 && it.cands.length) || it.sel > 0 || isNum(it.baseManual) || it.skip || it.note)
        .map(it => ({ id: it.id, gkey: it.sel >= 0 ? IX.groups[it.cands[it.sel].g].key : null, baseManual: it.baseManual, skip: it.skip, note: it.note })),
    };
  }
  function saveSession() {
    download(new Blob([JSON.stringify(sessionData())], { type: 'application/json' }), S.fileName.replace(/\.(xlsx|xlsm)$/i, '') + '.dgbq');
  }

  /* ---------- Sự kiện ---------- */
  function bindUI() {
    const onFile = (id, fn) => {
      const inp = $(id), drop = inp.closest('.drop');
      inp.addEventListener('change', () => { if (inp.files[0]) fn(inp.files[0]); inp.value = ''; });
      drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('over'));
      drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) fn(e.dataTransfer.files[0]); });
    };
    onFile('#f-boq', loadBoq); onFile('#f-base', loadBase); onFile('#f-sess', loadSession);
    $('#map-tbl').addEventListener('change', onMapChange);
    $('#go').addEventListener('click', runAll);
    for (const id of ['#o-yfrom', '#o-yto', '#o-factor', '#o-tol', '#o-ok', '#o-bt', '#o-review', '#o-outlier', '#o-warn']) $(id).addEventListener('change', recompute);
    $('#flt').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setFilter(b.dataset.f); });
    $('#kpis').addEventListener('click', e => { const k = e.target.closest('.kpi[data-f]'); if (k) { switchTab('lines'); setFilter(k.dataset.f); } });
    let tq; $('#flt-q').addEventListener('input', e => { clearTimeout(tq); tq = setTimeout(() => { S.view.q = e.target.value; S.view.shown = PAGE; renderTable(); }, 200); });
    $('#more').addEventListener('click', () => { S.view.shown += PAGE; renderTable(); });
    $('#res-tbl').addEventListener('click', e => { const tr = e.target.closest('tr[data-id]'); if (tr) openDrawer(S.items.find(it => it.id === tr.dataset.id)); });
    $('#tab-sum').addEventListener('click', e => { const tr = e.target.closest('tr[data-id]'); if (tr) openDrawer(S.items.find(it => it.id === tr.dataset.id)); });
    $('#dw-close').addEventListener('click', closeDrawer);
    $('#dw-body').addEventListener('click', drawerAction);
    $('#dw-body').addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      if (e.target.id === 'dw-q') { e.preventDefault(); drawerSearch(S.view.cur); }
      else if (e.target.id === 'dw-base') { e.preventDefault(); drawerAction({ target: { dataset: { do: 'apply' }, closest: () => null } }); }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('#dlg').hidden) $('#dlg').hidden = true; else closeDrawer(); } });
    $$('.tab').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
    $('#save-sess').addEventListener('click', saveSession);
    $('#dx-export').addEventListener('click', () => { $('#dlg').hidden = false; });
    $('#dlg-cancel').addEventListener('click', () => { $('#dlg').hidden = true; });
    $('#dlg-form').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = $('#dlg-form button[type=submit]'); btn.disabled = true; btn.textContent = 'Đang tạo file…';
      try {
        await exportXlsx({ sum: $('#x-sum').checked, ref: $('#x-ref').checked });
        $('#dlg').hidden = true;
      } catch (ex) { console.error(ex); msg('Không xuất được file: ' + (ex.message || ex), 'err'); $('#dlg').hidden = true; }
      btn.disabled = false; btn.textContent = 'Xuất file';
    });
  }
  function setFilter(f) { S.view.f = f; S.view.shown = PAGE; $$('#flt button').forEach(b => b.classList.toggle('on', b.dataset.f === f)); renderTable(); }
  function switchTab(t) {
    S.view.tab = t; $$('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    $('#tab-lines').hidden = t !== 'lines'; $('#tab-sum').hidden = t !== 'sum';
    if (t === 'lines') renderTable(); else renderSummary();
  }

  // Cho kiểm thử tự động
  window.__DXG_STATE = S;
  boot();
})();
