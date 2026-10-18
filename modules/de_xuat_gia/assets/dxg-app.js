'use strict';
/* Đề xuất giá BOQ — giao diện. Dữ liệu đơn giá nạp qua window.SECURE (gói .dgbw) giống app tra cứu;
   khi chạy thử không có cổng đăng nhập thì nạp data/db.js. Mọi xử lý diễn ra trong trình duyệt, không gửi dữ liệu đi đâu. */
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
  const LEVEL = { cao: 'Cao', tb: 'Trung bình', thap: 'Thấp', none: 'Không khớp' };
  const LEVEL_RANK = { cao: 3, tb: 2, thap: 1, none: 0 };
  const KEYS = [['code', 'Mã/STT'], ['desc', 'Mô tả *'], ['unit', 'Đơn vị'], ['qty', 'Khối lượng'], ['rate', 'Đơn giá'], ['amount', 'Thành tiền'], ['mat', 'ĐG vật liệu'], ['lab', 'ĐG nhân công'], ['base', 'Giá baseline']];
  const PAGE = 300;

  let IX = null;
  const S = {
    wb: null, fileName: '', sheets: [], lines: [], items: [],
    baseList: null, baseName: '', session: null,
    opt: { strategy: 'med', yearFrom: null, yearTo: null, types: new Set(), provs: new Set(), excludeReview: true, excludeOutlier: true, excludeWarn: false, factor: 1, minConf: 'thap', tol1: 0.05, tol2: 0.15 },
    view: { f: 'all', q: '', shown: PAGE, tab: 'lines', cur: null },
  };

  /* ---------- Nạp cơ sở dữ liệu ---------- */
  function boot() {
    // Nhân viên chỉ dùng được khi admin bật cờ cho_nhan_vien trong build.py
    const meta = document.querySelector('meta[name="cho-nhan-vien"]');
    if (!ADMIN && !(meta && meta.content === '1')) {
      $('#splash-msg').textContent = 'Chức năng Đề xuất giá BOQ chỉ dành cho tài khoản admin.';
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
    console.log(`Chỉ mục đề xuất giá: ${Math.round(performance.now() - t0)} ms, ${IX.groups.length} nhóm`);
  }

  /* ---------- Tùy chọn ---------- */
  function buildOptions() {
    const sel = $('#o-strategy');
    sel.innerHTML = Object.entries(DXG.STRATEGY).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('');
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
    o.strategy = $('#o-strategy').value;
    o.yearFrom = n('#o-yfrom'); o.yearTo = n('#o-yto');
    o.factor = (n('#o-factor') ?? 100) / 100;
    o.minConf = $('#o-minconf').value;
    o.tol1 = (n('#o-tol1') ?? 5) / 100; o.tol2 = (n('#o-tol2') ?? 15) / 100;
    o.excludeReview = $('#o-review').checked; o.excludeOutlier = $('#o-outlier').checked; o.excludeWarn = $('#o-warn').checked;
  }
  function writeOptions() {
    const o = S.opt;
    $('#o-strategy').value = o.strategy; $('#o-yfrom').value = o.yearFrom ?? ''; $('#o-yto').value = o.yearTo ?? '';
    $('#o-factor').value = Math.round(o.factor * 1000) / 10; $('#o-minconf').value = o.minConf;
    $('#o-tol1').value = o.tol1 * 100; $('#o-tol2').value = o.tol2 * 100;
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
      S.wb = wb; S.fileName = file.name; S.sheets = []; S.items = []; S.lines = [];
      wb.sheets.forEach((sh, si) => {
        if (sh.state !== 'visible' || /^DX_/.test(sh.name)) return;   // bỏ sheet ẩn và sheet phân tích của lần xuất trước
        const grid = wb.grid(si);
        const det = DXG.detectColumns(grid);
        S.sheets.push({ si, name: sh.name, grid, det: det || { headerRow: 0, dataStart: 1, cols: {} }, include: !!det, auto: !!det });
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
        if (/^DX_/.test(sh.name)) return;
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
      msg(S.items.length ? `Baseline: đọc ${NF.format(list.length)} giá, ghép được ${NF.format(hit)}/${NF.format(S.items.length)} dòng BOQ.` : `Đã đọc ${NF.format(list.length)} giá baseline. Sẽ ghép vào BOQ khi đề xuất giá.`, 'ok');
    } catch (e) { console.error(e); msg('Không đọc được file baseline: ' + (e.message || e), 'err'); }
  }
  async function loadSession(file) {
    try {
      const j = JSON.parse(await file.text());
      if (j.dinh_dang !== 'DGBQ1') throw new Error('Không phải file phiên đề xuất giá.');
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
    let h = `<thead><tr><th>Định giá</th><th>Sheet</th><th>Dòng tiêu đề</th>${KEYS.map(([, l]) => `<th>${esc(l)}</th>`).join('')}<th>Số dòng hạng mục</th></tr></thead><tbody>`;
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

  /* ---------- Đề xuất ---------- */
  async function runAll() {
    const use = S.sheets.filter(s => s.include && s.det.cols.desc !== undefined);
    if (!use.length) { alert('Chưa có sheet nào được chọn hoặc chưa chọn cột Mô tả.'); return; }
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
          if (++done % 100 === 0) { btn.textContent = `Đang khớp… ${NF.format(done)} dòng`; await new Promise(r => setTimeout(r)); }
          l.baseCol = isNum(l.base) && l.base > 0 ? l.base : null;
          l.baseFile = null; l.baseManual = null; l.manual = null; l.skip = false; l.note = '';
          S.items.push(l);
        }
        S.lines.push(l);
      }
    }
    if (S.session) applySession();
    applyBaseline();
    console.log(`Khớp ${S.items.length} dòng trong ${Math.round(performance.now() - t0)} ms`);
    btn.disabled = false; btn.textContent = 'Đề xuất giá →';
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
      it.manual = x.manual ?? null; it.baseManual = x.baseManual ?? null; it.skip = !!x.skip; it.note = x.note || '';
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
  const roundPrice = v => !isNum(v) ? null : v >= 100000 ? Math.round(v / 100) * 100 : v >= 1000 ? Math.round(v / 10) * 10 : Math.round(v);
  function calc(it) {
    const o = S.opt, c = it.sel >= 0 ? it.cands[it.sel] : null;
    const st = c ? stats(c.g, c.ratio) : null;
    const conf = c ? (c.picked ? { level: 'tb', value: 0.6, picked: true } : DXG.confidence(c, st)) : { level: 'none', value: 0 };
    if (c && c.picked && st) conf.level = st.n >= 3 ? 'cao' : 'tb';
    let price = null, src = 'none';
    if (it.skip) src = 'skip';
    else if (isNum(it.manual)) { price = it.manual; src = 'manual'; }
    else if (c && st && LEVEL_RANK[conf.level] >= LEVEL_RANK[o.minConf] && conf.level !== 'none') {
      price = roundPrice(DXG.STRATEGY[o.strategy].pick(st) * o.factor); src = 'auto';
    }
    const base = isNum(it.baseManual) ? it.baseManual : isNum(it.baseFile) ? it.baseFile : it.baseCol;
    const baseSrc = isNum(it.baseManual) ? 'tay' : isNum(it.baseFile) ? 'file' : isNum(it.baseCol) ? 'cột BOQ' : '';
    const dev = DXG.diff(price, base, it.qty);
    const devLvl = !dev || dev.pct === null ? '' : Math.abs(dev.pct) <= o.tol1 ? 'ok' : Math.abs(dev.pct) <= o.tol2 ? 'lo' : 'hi';
    // nhóm chỉ được coi là "đã khớp" khi đủ tin cậy hoặc do người dùng chọn
    const shown = !!(c && (conf.level !== 'none' || c.picked));
    const prank = shown && st && isNum(base) ? DXG.percentRank(st.sorted, base / o.factor) : null;
    const amount = isNum(price) && isNum(it.qty) ? price * it.qty : null;
    const baseAmt = isNum(base) && isNum(it.qty) ? base * it.qty : null;
    it.c = { cand: c, shown, st, conf, price, src, base, baseSrc, dev, devLvl, prank, amount, baseAmt,
      low: st ? st.p25 * o.factor : null, high: st ? st.p75 * o.factor : null,
      check: !it.skip && src !== 'manual' && (conf.level === 'thap' || conf.level === 'none' || (c && c.unitOk === false) || (st && st.relaxed) || src === 'none') };
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
    let n = 0, priced = 0, amt = 0, baseAmt = 0, both = 0, amtBoth = 0, baseBoth = 0;
    const lv = { cao: 0, tb: 0, thap: 0, none: 0 };
    for (const it of items) {
      const c = it.c; if (it.skip) continue; n++;
      if (c.src === 'manual') lv.man = (lv.man || 0) + 1; else lv[c.conf.level]++;
      if (isNum(c.price)) priced++;
      if (isNum(c.amount)) amt += c.amount;
      if (isNum(c.baseAmt)) baseAmt += c.baseAmt;
      if (isNum(c.amount) && isNum(c.baseAmt)) { both++; amtBoth += c.amount; baseBoth += c.baseAmt; }
    }
    return { n, priced, amt, baseAmt, both, amtBoth, baseBoth, lv };
  }
  function renderKpis() {
    const t = totals(S.items), checkN = S.items.filter(it => it.c.check).length;
    const d = t.baseBoth ? (t.amtBoth - t.baseBoth) / t.baseBoth : null;
    const devHi = S.items.filter(it => it.c.devLvl === 'hi').length;
    $('#kpis').innerHTML = [
      ['Dòng hạng mục', NF.format(t.n), `${NF.format(t.priced)} dòng đã có giá (${t.n ? Math.round(t.priced / t.n * 100) : 0}%)`, 'all'],
      ['Độ tin cậy', `${NF.format(t.lv.cao)} · ${NF.format(t.lv.tb)} · ${NF.format(t.lv.thap)}`, `cao · trung bình · thấp${t.lv.man ? ` · ${NF.format(t.lv.man)} sửa tay` : ''}`, ''],
      ['Cần kiểm tra', NF.format(checkN), `${NF.format(t.lv.none)} dòng không khớp`, 'check'],
      ['Tổng giá trị đề xuất', fmt(t.amt), 'VNĐ, theo khối lượng BOQ', ''],
      ['Tổng baseline', t.baseAmt ? fmt(t.baseAmt) : '—', S.baseName ? `nguồn: ${S.baseName}` : (t.baseAmt ? 'từ cột baseline trong BOQ' : 'chưa nạp baseline'), 'nobase'],
      ['Chênh lệch so với baseline', d === null ? '—' : pct(d), d === null ? 'trên các dòng có cả hai giá' : `${fmt(t.amtBoth - t.baseBoth)} VNĐ · ${NF.format(t.both)} dòng · ${NF.format(devHi)} dòng lệch > ${Math.round(S.opt.tol2 * 100)}%`, 'dev'],
    ].map(([k, v, s, f]) => `<div class="kpi${f ? ' clickable' : ''}" ${f ? `data-f="${f}"` : ''}><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div><div class="s">${esc(s)}</div></div>`).join('');
  }

  /* ---------- Bảng kết quả ---------- */
  function visible() {
    const { f, q } = S.view, nq = DXG.norm(q);
    const pass = it => {
      const c = it.c;
      if (f === 'check' && !c.check) return false;
      if (f === 'none' && !(c.conf.level === 'none' || it.sel < 0)) return false;
      if (f === 'dev' && !(c.devLvl === 'lo' || c.devLvl === 'hi')) return false;
      if (f === 'nobase' && isNum(c.base)) return false;
      if (f === 'manual' && !(isNum(it.manual) || isNum(it.baseManual) || it.skip || (c.cand && c.cand.picked))) return false;
      if (nq && !DXG.norm(it.desc + ' ' + it.code + ' ' + it.ctx).includes(nq)) return false;
      return true;
    };
    if (f === 'all' && !nq) return S.lines;
    return S.lines.filter(l => l.kind === 'item' && pass(l));
  }
  function badge(it) {
    const c = it.c;
    if (it.skip) return '<span class="badge b-man">Bỏ qua</span>';
    if (c.src === 'manual') return '<span class="badge b-man">Sửa tay</span>';
    return `<span class="badge b-${c.conf.level}" title="Điểm ${Math.round(c.conf.value * 100)}%">${LEVEL[c.conf.level]}</span>`;
  }
  function rowHtml(l) {
    if (l.kind === 'sheet') return `<tr class="head"><td colspan="13">Sheet: ${esc(l.sheet)}</td></tr>`;
    if (l.kind === 'head') return `<tr class="head"><td>${esc(l.code)}</td><td colspan="12">${esc(l.desc)}</td></tr>`;
    if (l.kind !== 'item') return '';
    const c = l.c, g = c.shown ? IX.groups[c.cand.g] : null;
    const unitWarn = g && c.cand.unitOk === false ? ` <span class="badge b-none" title="Đơn vị nhóm khác đơn vị BOQ">ĐV ${esc(g.unit)}</span>` : '';
    const conv = g && c.cand.ratio !== 1 ? ` <span class="price-sub">(${esc(g.unit)} ×${fmtQ(c.cand.ratio)})</span>` : '';
    return `<tr data-id="${esc(l.id)}"${S.view.cur === l ? ' class="sel"' : ''}>
      <td class="small">${esc(l.code)}</td>
      <td class="desc">${esc(l.desc)}${l.ctx ? `<div class="ctx">${esc(l.ctx)}</div>` : ''}</td>
      <td>${esc(l.unit)}</td>
      <td class="num">${fmtQ(l.qty)}</td>
      <td class="grp">${g ? esc(g.name) + conv + unitWarn : c.cand ? `<span class="muted">gợi ý yếu: ${esc(IX.groups[c.cand.g].name)}</span>` : '<span class="muted">—</span>'}${g && c.st ? `<div class="price-sub">${c.st.n} báo giá · ${c.st.proj} dự án${c.st.relaxed ? ' · đã nới bộ lọc' : ''}</div>` : ''}</td>
      <td>${badge(l)}</td>
      <td class="num"><b>${fmt(c.price)}</b>${isNum(l.rate) ? `<div class="price-sub">trong file: ${fmt(l.rate)}</div>` : ''}</td>
      <td class="num small">${g && c.st ? `${fmt(c.low)} – ${fmt(c.high)}` : ''}</td>
      <td class="num">${fmt(c.amount)}</td>
      <td class="num">${fmt(c.base)}${c.baseSrc ? `<div class="price-sub">${esc(c.baseSrc)}</div>` : ''}</td>
      <td class="num d-${c.devLvl}">${c.dev ? pct(c.dev.pct) : ''}</td>
      <td class="num d-${c.devLvl}">${c.dev && isNum(c.dev.amt) ? fmt(c.dev.amt) : ''}</td>
      <td class="num small" title="Vị trí của giá baseline trong phân bố giá thị trường của nhóm">${c.prank !== null ? 'P' + Math.round(c.prank * 100) : ''}</td></tr>`;
  }
  function renderTable() {
    const rows = visible(), items = rows.filter(l => l.kind === 'item').length;
    const shown = rows.slice(0, S.view.shown);
    $('#res-tbl').innerHTML = `<thead><tr><th>Mã</th><th>Mô tả</th><th>ĐV</th><th class="num">KL</th><th>Nhóm khớp trong CSDL</th><th>Tin cậy</th>
      <th class="num">ĐG đề xuất</th><th class="num">P25 – P75</th><th class="num">Thành tiền</th><th class="num">Baseline</th><th class="num">Lệch %</th><th class="num">Lệch tiền</th><th class="num" title="Baseline nằm ở bách phân vị nào của giá thị trường">Vị trí BL</th></tr></thead>
      <tbody>${shown.map(rowHtml).join('')}</tbody>`;
    $('#flt-count').textContent = `${NF.format(items)} dòng`;
    $('#more').hidden = rows.length <= S.view.shown;
  }

  /* ---------- Ngăn chi tiết ---------- */
  const projOf = i => (window.DB.projects || [])[IX.C.p ? IX.C.p[i] : -1] || [];
  function openDrawer(it) { S.view.cur = it; renderDrawer(it); $('#drawer').hidden = false; $$('#res-tbl tr.sel').forEach(r => r.classList.remove('sel')); const tr = $(`#res-tbl tr[data-id="${CSS.escape(it.id)}"]`); if (tr) tr.classList.add('sel'); }
  function closeDrawer() { S.view.cur = null; $('#drawer').hidden = true; $$('#res-tbl tr.sel').forEach(r => r.classList.remove('sel')); }
  function candHtml(it, c, k) {
    const g = IX.groups[c.g], st = stats(c.g, c.ratio), o = S.opt;
    const conv = c.ratio !== 1 ? ` · quy đổi từ ${esc(g.unit)} ×${fmtQ(c.ratio)}` : '';
    return `<div class="cand${it.sel === k ? ' on' : ''}" data-k="${k}">
      <input type="radio" name="cand"${it.sel === k ? ' checked' : ''}>
      <div><div class="nm">${esc(g.name)}</div>
        <div class="small muted">ĐV ${esc(g.unit || '?')}${conv}${c.unitOk === false ? ' · <b class="d-hi">khác đơn vị</b>' : ''} · ${st.n} báo giá · ${st.proj} dự án · gần nhất ${st.latest || '?'}${st.relaxed ? ' · đã nới bộ lọc' : ''}</div></div>
      <div class="num"><b>${fmt(st.med * o.factor)}</b><div class="price-sub">${fmt(st.p25 * o.factor)} – ${fmt(st.p75 * o.factor)}</div><div class="price-sub">${c.picked ? 'chọn tay' : 'khớp ' + Math.round(c.score * 100) + '%'}</div></div></div>`;
  }
  function renderDrawer(it) {
    const c = it.c || calc(it), o = S.opt;
    $('#dw-title').textContent = `${it.sheet} · dòng ${it.r + 1}${it.code ? ' · ' + it.code : ''}`;
    const kv = [['Mô tả', esc(it.desc)], ['Hạng mục cha', esc(it.ctx)], ['Đơn vị / KL', `${esc(it.unit)} · ${fmtQ(it.qty)}`],
      ['Đơn giá trong file', fmt(it.rate)], ['Giá đề xuất', `<b>${fmt(c.price)}</b> ${badge(it)} <span class="muted small">${c.src === 'auto' ? DXG.STRATEGY[o.strategy].label + (o.factor !== 1 ? ` × ${Math.round(o.factor * 1000) / 10}%` : '') : ''}</span>`],
      ['Baseline', isNum(c.base) ? `${fmt(c.base)} <span class="muted small">(${esc(c.baseSrc)}${it.baseHow && c.baseSrc === 'file' ? ', ghép theo ' + esc(it.baseHow) : ''})</span>` : '—'],
      ['Chênh lệch', c.dev ? `<span class="d-${c.devLvl}">${fmt(c.dev.d)} (${pct(c.dev.pct)})${isNum(c.dev.amt) ? ` · ${fmt(c.dev.amt)} theo KL` : ''}</span>${c.prank !== null ? ` · baseline ở <b>P${Math.round(c.prank * 100)}</b> của thị trường` : ''}` : '—']];
    let h = `<div class="row-in" style="justify-content:space-between;margin-bottom:10px"><button class="btn sm" data-do="prev">← Dòng trước</button><button class="btn sm" data-do="next">Dòng sau →</button></div>
      <div class="kv">${kv.map(([k, v]) => `<div>${k}</div><div>${v}</div>`).join('')}</div>
      <h4>Điều chỉnh</h4>
      <div class="row-in"><label>Giá sửa tay</label><input type="number" id="dw-manual" step="any" value="${isNum(it.manual) ? it.manual : ''}" placeholder="${fmt(c.src === 'auto' ? c.price : null)}">
        <label>Baseline</label><input type="number" id="dw-base" step="any" value="${isNum(it.baseManual) ? it.baseManual : ''}" placeholder="${isNum(it.baseFile ?? it.baseCol) ? fmt(it.baseFile ?? it.baseCol) : 'nhập giá'}">
        <button class="btn sm primary" data-do="apply">Áp dụng</button></div>
      <div class="row-in" style="margin-top:6px"><input type="text" id="dw-note" placeholder="Ghi chú cho dòng này" value="${esc(it.note)}" style="flex:1">
        <label><input type="checkbox" id="dw-skip"${it.skip ? ' checked' : ''}> Không định giá dòng này</label></div>
      <h4>Nhóm công việc khớp trong CSDL ${it.cands.length ? '' : '<span class="muted">(không tìm thấy — tìm thủ công bên dưới)</span>'}</h4>
      ${it.cands.map((cd, k) => candHtml(it, cd, k)).join('')}
      ${it.sel >= 0 ? '<button class="link small" data-do="unsel">Bỏ chọn nhóm (không đề xuất giá tự động)</button>' : ''}
      <h4>Tìm nhóm khác trong CSDL</h4>
      <div class="row-in"><input type="search" id="dw-q" placeholder="vd: bê tông lót móng M150" value=""><button class="btn sm" data-do="search">Tìm</button></div>
      <div id="dw-sr"></div>`;
    if (c.st) {
      const ids = [...c.st.ids].sort((a, b) => (IX.C.y[b] || 0) - (IX.C.y[a] || 0)).slice(0, 60);
      h += `<h4>Báo giá dùng để tính (${c.st.n}${c.st.n > ids.length ? `, hiện ${ids.length} mới nhất` : ''})</h4>
        <div class="tbl-wrap"><table class="refs"><thead><tr><th>Năm</th>${ADMIN ? '<th>Dự án</th>' : ''}<th>Tỉnh/TP</th><th>Tên trong báo giá</th><th class="num">Giá quy đổi</th><th class="num">Giá gốc</th></tr></thead><tbody>
        ${ids.map(i => { const p = projOf(i); return `<tr><td>${IX.C.y[i] || ''}</td>${ADMIN ? `<td>${esc(p[1] || p[0] || '')}</td>` : ''}<td>${esc(p[4] || p[3] || '')}</td><td>${esc(IX.C.name[i])}</td><td class="num">${fmt(IX.price(i) * c.cand.ratio * o.factor)}</td><td class="num small">${fmt(IX.C.tot[i])} /${esc(IX.unitOf(i))}</td></tr>`; }).join('')}
        </tbody></table></div>`;
    }
    $('#dw-body').innerHTML = h;
  }
  function drawerAction(e) {
    const it = S.view.cur; if (!it) return;
    const cand = e.target.closest('.cand');
    if (cand && cand.dataset.k !== undefined) { it.sel = +cand.dataset.k; return refreshItem(it); }
    const sr = e.target.closest('[data-g]');
    if (sr) {
      const gid = +sr.dataset.g;
      let k = it.cands.findIndex(x => x.g === gid);
      if (k < 0) { it.cands.unshift(manualCand(gid, it.unit)); k = 0; }
      it.sel = k; return refreshItem(it);
    }
    const act = e.target.dataset.do;
    if (act === 'apply') {
      const m = $('#dw-manual').value.trim(), b = $('#dw-base').value.trim();
      it.manual = m === '' ? null : +m; it.baseManual = b === '' ? null : +b;
      it.note = $('#dw-note').value; it.skip = $('#dw-skip').checked;
      return refreshItem(it);
    }
    if (act === 'unsel') { it.sel = -1; return refreshItem(it); }
    if (act === 'search') return drawerSearch(it);
    if (act === 'prev' || act === 'next') {
      const list = visible().filter(l => l.kind === 'item'), k = list.indexOf(it);
      const nx = list[k + (act === 'next' ? 1 : -1)];
      if (nx) openDrawer(nx);
    }
  }
  function drawerSearch(it) {
    const q = $('#dw-q').value.trim(); if (!q) return;
    const res = DXG.match(IX, { desc: q, unit: it.unit, ctx: '' }, { limit: 12 });
    $('#dw-sr').innerHTML = res.length ? res.map(r => {
      const g = IX.groups[r.g], st = stats(r.g, r.ratio);
      return `<div class="cand" data-g="${r.g}"><span>＋</span><div><div class="nm">${esc(g.name)}</div><div class="small muted">ĐV ${esc(g.unit)}${r.unitOk === false ? ' · <b class="d-hi">khác đơn vị</b>' : ''} · ${st.n} báo giá · ${st.proj} dự án</div></div><div class="num"><b>${fmt(st.med * S.opt.factor)}</b><div class="price-sub">${fmt(st.p25 * S.opt.factor)} – ${fmt(st.p75 * S.opt.factor)}</div></div></div>`;
    }).join('') : '<div class="muted small">Không tìm thấy nhóm nào.</div>';
  }
  function refreshItem(it) {
    calc(it); renderKpis();
    const tr = $(`#res-tbl tr[data-id="${CSS.escape(it.id)}"]`);
    if (tr) { tr.outerHTML = rowHtml(it); }
    renderDrawer(it);
  }

  /* ---------- Tổng hợp ---------- */
  function renderSummary() {
    const o = S.opt, by = (keyFn) => {
      const m = new Map();
      for (const it of S.items) { if (it.skip) continue; const k = keyFn(it); if (!m.has(k)) m.set(k, []); m.get(k).push(it); }
      return [...m.entries()].map(([k, items]) => ({ k, ...totals(items) }));
    };
    const tbl = (rows, label) => `<div class="tbl-wrap"><table><thead><tr><th>${label}</th><th class="num">Dòng</th><th class="num">Đã có giá</th><th class="num">Tổng đề xuất</th><th class="num">Tổng baseline</th><th class="num">Lệch (dòng có cả 2 giá)</th><th class="num">%</th></tr></thead><tbody>
      ${rows.map(r => { const d = r.baseBoth ? (r.amtBoth - r.baseBoth) / r.baseBoth : null, lv = d === null ? '' : Math.abs(d) <= o.tol1 ? 'ok' : Math.abs(d) <= o.tol2 ? 'lo' : 'hi';
        return `<tr><td>${esc(r.k)}</td><td class="num">${NF.format(r.n)}</td><td class="num">${NF.format(r.priced)}</td><td class="num">${fmt(r.amt)}</td><td class="num">${r.baseAmt ? fmt(r.baseAmt) : ''}</td><td class="num d-${lv}">${r.both ? fmt(r.amtBoth - r.baseBoth) : ''}</td><td class="num d-${lv}">${pct(d)}</td></tr>`; }).join('')}
      </tbody></table></div>`;
    const withB = S.items.filter(it => !it.skip && it.c.dev);
    const cnt = { ok: 0, loU: 0, loD: 0, hiU: 0, hiD: 0 };
    for (const it of withB) { const lv = it.c.devLvl, up = it.c.dev.d > 0; if (lv === 'ok') cnt.ok++; else if (lv === 'lo') cnt[up ? 'loU' : 'loD']++; else cnt[up ? 'hiU' : 'hiD']++; }
    const noB = S.items.filter(it => !it.skip && !isNum(it.c.base)).length;
    const tot = withB.length + noB || 1;
    const seg = (n, cls, title) => n ? `<span class="${cls}" style="width:${n / tot * 100}%" title="${esc(title)}: ${n}"></span>` : '';
    const pos = { lo: 0, mid: 0, hi: 0 };
    for (const it of S.items) { const p = it.c.prank; if (p === null || it.skip) continue; if (p < 0.25) pos.lo++; else if (p > 0.75) pos.hi++; else pos.mid++; }
    const top = withB.filter(it => isNum(it.c.dev.amt)).sort((a, b) => Math.abs(b.c.dev.amt) - Math.abs(a.c.dev.amt)).slice(0, 15);
    $('#tab-sum').innerHTML = `<div class="sum-grid">
      <div class="card"><h3>Phân bố lệch giá đề xuất so với baseline</h3>
        <div class="distbar">${seg(cnt.ok, 'c-ok', 'Trong ngưỡng')}${seg(cnt.loU + cnt.loD, 'c-lo', 'Lệch vừa')}${seg(cnt.hiU + cnt.hiD, 'c-hi', 'Lệch lớn')}${seg(noB, 'c-na', 'Chưa có baseline')}</div>
        <div class="legend"><span><i class="c-ok"></i>|lệch| ≤ ${Math.round(o.tol1 * 100)}%: ${cnt.ok}</span><span><i class="c-lo"></i>${Math.round(o.tol1 * 100)}–${Math.round(o.tol2 * 100)}%: ${cnt.loU} cao hơn · ${cnt.loD} thấp hơn</span><span><i class="c-hi"></i>> ${Math.round(o.tol2 * 100)}%: ${cnt.hiU} cao hơn · ${cnt.hiD} thấp hơn</span><span><i class="c-na"></i>chưa có baseline: ${noB}</span></div>
        <h3 style="margin-top:16px">Baseline so với giá thị trường (CSDL)</h3>
        <div class="legend"><span>Thấp hơn P25: <b>${pos.lo}</b> dòng</span><span>Trong P25–P75: <b>${pos.mid}</b></span><span>Cao hơn P75: <b>${pos.hi}</b></span></div>
        <p class="small muted">Baseline thấp hơn P25 → rủi ro thiếu ngân sách; cao hơn P75 → có dư địa đàm phán.</p></div>
      <div class="card"><h3>15 dòng chênh lệch lớn nhất (theo thành tiền)</h3>
        <div class="tbl-wrap"><table><thead><tr><th>Mô tả</th><th class="num">Đề xuất</th><th class="num">Baseline</th><th class="num">%</th><th class="num">Lệch tiền</th></tr></thead><tbody>
        ${top.map(it => `<tr data-id="${esc(it.id)}" class="jump"><td>${esc(it.desc.slice(0, 80))}</td><td class="num">${fmt(it.c.price)}</td><td class="num">${fmt(it.c.base)}</td><td class="num d-${it.c.devLvl}">${pct(it.c.dev.pct)}</td><td class="num d-${it.c.devLvl}">${fmt(it.c.dev.amt)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Chưa có dòng nào có cả giá đề xuất và baseline.</td></tr>'}
        </tbody></table></div></div>
    </div>
    <div class="card"><h3>Theo sheet</h3>${tbl(by(it => it.sheet), 'Sheet')}</div>
    <div class="card"><h3>Theo hạng mục cấp 1</h3>${tbl(by(it => `${it.sheet} · ${it.heads[0] || '(không có tiêu đề)'}`), 'Hạng mục')}</div>`;
  }

  /* ---------- Xuất Excel ---------- */
  async function exportXlsx(opt) {
    const wb = S.wb, o = S.opt;
    const st = {
      head: wb.style({ bold: true, fill: 'FFDDEBF7', border: true, wrap: true }),
      num: wb.style({ numFmt: '#,##0', border: true }), pct: wb.style({ numFmt: '0.0%', border: true }), txt: wb.style({ border: true }),
      ok: wb.style({ numFmt: '0.0%', border: true, fill: 'FFE2F0D9' }), lo: wb.style({ numFmt: '0.0%', border: true, fill: 'FFFFF2CC' }), hi: wb.style({ numFmt: '0.0%', border: true, fill: 'FFF8CBAD', bold: true }),
      bold: wb.style({ bold: true, border: true }), boldNum: wb.style({ bold: true, numFmt: '#,##0', border: true }),
      title: wb.style({ bold: true }),
    };
    const C = XLSXIO.colName;
    let written = 0;
    for (const sh of S.sheets.filter(s => s.include)) {
      const items = S.items.filter(it => it.sh === sh);
      if (!items.length) continue;
      const { cols } = sh.det, si = sh.si;
      const width = Math.max(...sh.grid.map(r => r.length), ...Object.values(cols).map(c => c + 1));
      const A0 = width + 1;   // chừa 1 cột trống
      if (opt.cols) {
        const heads = ['ĐG đề xuất', 'P25', 'P75', 'Số báo giá', 'Tin cậy', 'Nhóm khớp trong CSDL', 'Baseline', 'Lệch ĐG', 'Lệch %', 'Lệch thành tiền'];
        heads.forEach((h, k) => { wb.set(si, sh.det.headerRow, A0 + k, h, { s: st.head }); wb.setColWidth(si, A0 + k, k === 5 ? 42 : 14); });
      }
      for (const it of items) {
        const c = it.c, r = it.r;
        const p = it.skip ? null : c.price;
        if (isNum(p)) {
          let rateOk = false;
          if (opt.rate !== 'no' && cols.rate !== undefined && !wb.hasFormula(si, r, cols.rate)) {
            if (opt.rate === 'all' || !isNum(it.rate)) { wb.set(si, r, cols.rate, p); written++; rateOk = true; }
          }
          if (cols.rate !== undefined && (rateOk || isNum(it.rate) || wb.hasFormula(si, r, cols.rate))) rateOk = true;
          if (opt.split && c.st && c.st.matShare !== null && cols.mat !== undefined && cols.lab !== undefined && rateOk) {
            const vMat = (sh.grid[r] || [])[cols.mat], vLab = (sh.grid[r] || [])[cols.lab];
            if (!isNum(vMat) && !isNum(vLab) && !wb.hasFormula(si, r, cols.mat) && !wb.hasFormula(si, r, cols.lab)) {
              wb.set(si, r, cols.mat, Math.round(p * c.st.matShare)); wb.set(si, r, cols.lab, Math.round(p * c.st.labShare));
            }
          }
          if (opt.amount && cols.amount !== undefined) {
            if (wb.hasFormula(si, r, cols.amount)) wb.dropCache(si, r, cols.amount);
            else if (!isNum(it.amount) && cols.qty !== undefined && rateOk) wb.set(si, r, cols.amount, null, { f: `${C(cols.qty)}${r + 1}*${C(cols.rate)}${r + 1}` });
          }
        }
        if (opt.cols) {
          const g = c.shown ? IX.groups[c.cand.g] : null, ok = g && c.st && !it.skip;
          const vals = [
            [p, st.num], [ok ? Math.round(c.low) : null, st.num], [ok ? Math.round(c.high) : null, st.num], [ok ? c.st.n : null, st.num],
            [it.skip ? 'Bỏ qua' : c.src === 'manual' ? 'Sửa tay' : LEVEL[c.conf.level], st.txt], [g ? g.name : '', st.txt],
            [c.base, st.num], [c.dev ? Math.round(c.dev.d) : null, st.num], [c.dev ? c.dev.pct : null, c.devLvl ? st[c.devLvl] : st.pct], [c.dev && isNum(c.dev.amt) ? Math.round(c.dev.amt) : null, st.num],
          ];
          vals.forEach(([v, s], k) => wb.set(si, r, A0 + k, v ?? null, { s }));
        }
      }
    }
    if (opt.sheets) { wb.putSheet('DX_TongHop', summaryRows(st), { widths: [46, 12, 12, 20, 20, 20, 10], freeze: 0 }); wb.putSheet('DX_ChiTiet', detailRows(st), { widths: [16, 8, 10, 60, 8, 12, 14, 14, 14, 16, 12, 44, 10, 10, 14, 12, 14, 10, 18, 30], freeze: 1, filter: 1 }); }
    if (opt.ref && ADMIN) wb.putSheet('DX_ThamChieu', refRows(st), { widths: [16, 8, 50, 8, 34, 50, 14, 14, 10], freeze: 1, filter: 1 });
    wb.forceRecalc();
    const blob = await wb.save();
    download(blob, S.fileName.replace(/\.(xlsx|xlsm)$/i, '') + '_DeXuatGia.xlsx');
    // Đọc lại file gốc để lần xuất sau không chồng thay đổi
    S.wb = await XLSXIO.read(await blob.arrayBuffer());
    return written;
  }
  function summaryRows(st) {
    const o = S.opt, t = totals(S.items), H = v => ({ v, s: st.head }), N = v => ({ v: isNum(v) ? Math.round(v) : null, s: st.num }), T = v => ({ v, s: st.txt });
    const P = v => ({ v, s: st.pct });
    const rows = [
      [{ v: `ĐỀ XUẤT GIÁ BOQ — ${S.fileName}`, s: st.title }],
      [`Lập lúc ${new Date().toLocaleString('vi-VN', { hour12: false })}${window.SECURE ? ' · ' + window.SECURE.name : ''}`],
      [`Cách chọn giá: ${DXG.STRATEGY[o.strategy].label} · hệ số ${Math.round(o.factor * 1000) / 10}% · năm ${o.yearFrom || '…'}–${o.yearTo || '…'} · loại hình: ${[...o.types].join(', ') || 'tất cả'} · tỉnh: ${[...o.provs].join(', ') || 'tất cả'} · giá quy về ${window.DB.baseYear || 2026}`],
      [`Baseline: ${S.baseName || (t.baseAmt ? 'cột baseline trong BOQ' : 'chưa có')} · ngưỡng lệch ${Math.round(o.tol1 * 100)}% / ${Math.round(o.tol2 * 100)}%`],
      [],
      [H('Chỉ tiêu'), H('Giá trị')],
      [T('Số dòng hạng mục'), N(t.n)], [T('Số dòng đã có giá'), N(t.priced)],
      [T('Tin cậy cao / TB / thấp / không khớp'), T(`${t.lv.cao} / ${t.lv.tb} / ${t.lv.thap} / ${t.lv.none}`)],
      [T('Tổng giá trị đề xuất (VNĐ)'), N(t.amt)], [T('Tổng baseline (VNĐ)'), N(t.baseAmt)],
      [T('Chênh lệch trên dòng có cả 2 giá (VNĐ)'), N(t.both ? t.amtBoth - t.baseBoth : null)], [T('Chênh lệch %'), P(t.baseBoth ? (t.amtBoth - t.baseBoth) / t.baseBoth : null)],
      [],
      [H('Sheet / Hạng mục cấp 1'), H('Số dòng'), H('Đã có giá'), H('Tổng đề xuất'), H('Tổng baseline'), H('Lệch (dòng có 2 giá)'), H('Lệch %')],
    ];
    const groups = new Map();
    for (const it of S.items) {
      if (it.skip) continue;
      for (const k of [it.sheet, `   ${it.sheet} · ${it.heads[0] || '(không có tiêu đề)'}`]) { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
    }
    for (const [k, items] of groups) {
      const x = totals(items), bold = !k.startsWith('   ');
      rows.push([{ v: k, s: bold ? st.bold : st.txt }, N(x.n), N(x.priced), { v: Math.round(x.amt), s: bold ? st.boldNum : st.num }, N(x.baseAmt || null), N(x.both ? x.amtBoth - x.baseBoth : null), P(x.baseBoth ? (x.amtBoth - x.baseBoth) / x.baseBoth : null)]);
    }
    return rows;
  }
  function detailRows(st) {
    const H = ['Sheet', 'Dòng', 'Mã', 'Mô tả', 'ĐV', 'KL', 'ĐG trong file', 'ĐG đề xuất', 'Thành tiền đề xuất', 'Nguồn giá', 'Tin cậy', 'Nhóm khớp', 'ĐV nhóm', 'Số BG', 'P25', 'P75', 'Baseline', 'Lệch %', 'Lệch thành tiền', 'Ghi chú / Hạng mục cha'];
    const rows = [H.map(v => ({ v, s: st.head }))];
    for (const it of S.items) {
      const c = it.c, g = c.shown ? IX.groups[c.cand.g] : null, ok = g && c.st;
      rows.push([it.sheet, it.r + 1, it.code, it.desc, it.unit, it.qty, it.rate, { v: it.skip ? null : c.price, s: st.num }, { v: it.skip || !isNum(c.amount) ? null : Math.round(c.amount), s: st.num },
        it.skip ? 'bỏ qua' : c.src === 'manual' ? 'sửa tay' : c.src === 'auto' ? 'CSDL' : 'chưa có', LEVEL[c.conf.level], g ? g.name : '', g ? g.unit : '', ok ? c.st.n : null,
        { v: ok ? Math.round(c.low) : null, s: st.num }, { v: ok ? Math.round(c.high) : null, s: st.num }, { v: c.base, s: st.num },
        { v: c.dev ? c.dev.pct : null, s: c.devLvl ? st[c.devLvl] : st.pct }, { v: c.dev && isNum(c.dev.amt) ? Math.round(c.dev.amt) : null, s: st.num }, [it.note, it.ctx].filter(Boolean).join(' | ')]);
    }
    return rows;
  }
  function refRows(st) {
    const rows = [['Sheet', 'Dòng', 'Mô tả BOQ', 'Năm', 'Dự án', 'Tên trong báo giá', 'Giá quy đổi', 'Giá gốc', 'ĐV gốc'].map(v => ({ v, s: st.head }))];
    for (const it of S.items) {
      const c = it.c; if (!c.shown || !c.st || it.skip) continue;
      const ids = [...c.st.ids].sort((a, b) => (IX.C.y[b] || 0) - (IX.C.y[a] || 0)).slice(0, 10);
      for (const i of ids) { const p = projOf(i); rows.push([it.sheet, it.r + 1, it.desc, IX.C.y[i] || null, p[1] || p[0] || '', IX.C.name[i], { v: Math.round(IX.price(i) * c.cand.ratio), s: st.num }, { v: IX.C.tot[i], s: st.num }, IX.unitOf(i)]); }
    }
    return rows;
  }
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function saveSession() {
    const o = S.opt;
    const j = {
      dinh_dang: 'DGBQ1', file: S.fileName, at: new Date().toISOString(),
      opt: { ...o, types: [...o.types], provs: [...o.provs] }, baseName: S.baseName, baseList: S.baseList,
      items: S.items.filter(it => (it.cands[it.sel] && it.cands[it.sel].picked) || it.sel < 0 && it.cands.length || isNum(it.manual) || isNum(it.baseManual) || it.skip || it.note || it.sel > 0)
        .map(it => ({ id: it.id, gkey: it.sel >= 0 ? IX.groups[it.cands[it.sel].g].key : null, manual: it.manual, baseManual: it.baseManual, skip: it.skip, note: it.note })),
    };
    download(new Blob([JSON.stringify(j)], { type: 'application/json' }), S.fileName.replace(/\.(xlsx|xlsm)$/i, '') + '.dgbq');
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
    for (const id of ['#o-strategy', '#o-yfrom', '#o-yto', '#o-factor', '#o-minconf', '#o-tol1', '#o-tol2', '#o-review', '#o-outlier', '#o-warn']) $(id).addEventListener('change', recompute);
    $('#flt').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; setFilter(b.dataset.f); });
    $('#kpis').addEventListener('click', e => { const k = e.target.closest('.kpi[data-f]'); if (k) { switchTab('lines'); setFilter(k.dataset.f); } });
    let tq; $('#flt-q').addEventListener('input', e => { clearTimeout(tq); tq = setTimeout(() => { S.view.q = e.target.value; S.view.shown = PAGE; renderTable(); }, 200); });
    $('#more').addEventListener('click', () => { S.view.shown += PAGE; renderTable(); });
    $('#res-tbl').addEventListener('click', e => { const tr = e.target.closest('tr[data-id]'); if (tr) openDrawer(S.items.find(it => it.id === tr.dataset.id)); });
    $('#tab-sum').addEventListener('click', e => { const tr = e.target.closest('tr[data-id]'); if (tr) openDrawer(S.items.find(it => it.id === tr.dataset.id)); });
    $('#dw-close').addEventListener('click', closeDrawer);
    $('#dw-body').addEventListener('click', drawerAction);
    $('#dw-body').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'dw-q') { e.preventDefault(); drawerSearch(S.view.cur); } else if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); drawerAction({ target: { dataset: { do: 'apply' }, closest: () => null } }); } });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('#dlg').hidden) $('#dlg').hidden = true; else closeDrawer(); } });
    $$('.tab').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
    $('#save-sess').addEventListener('click', saveSession);
    $('#dx-export').addEventListener('click', () => { $('#dlg').hidden = false; });
    $('#dlg-cancel').addEventListener('click', () => { $('#dlg').hidden = true; });
    $('#dlg-form').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = $('#dlg-form button[type=submit]'); btn.disabled = true; btn.textContent = 'Đang tạo file…';
      try {
        await exportXlsx({ rate: $('input[name=x-rate]:checked').value, amount: $('#x-amount').checked, split: $('#x-split').checked, cols: $('#x-cols').checked, sheets: $('#x-sheets').checked, ref: $('#x-ref').checked });
        $('#dlg').hidden = true;
      } catch (ex) { console.error(ex); alert('Không xuất được file: ' + (ex.message || ex)); }
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
