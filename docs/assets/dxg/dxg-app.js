'use strict';
/* Điền giá BOQ — lấy giá tốt nhất từ CSDL đơn giá và ĐIỀN TRỰC TIẾP vào cột Đơn giá của file BOQ.
   • Không thêm sheet, không thêm cột: chỉ ghi số vào ô đơn giá đang trống (giữ style ô, công thức thành tiền,
     mọi định dạng khác). Ô đã có giá, ô công thức, ô chữ không bao giờ bị ghi.
   • Giá tốt nhất mặc định = P25 các báo giá đáng tin (đã bỏ ngoại lai / REVIEW), chỉ điền khi khớp đủ tin cậy.
   • Có thể nạp thêm "đơn giá bổ sung" (Excel) để làm giàu CSDL ngay trong phiên.
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
  const FIT_RANK = { cao: 3, tb: 2, thap: 1, none: 0 };
  const PROP_FILL = 'FFFFEB9C', PROP_HEAD_FILL = 'FFFFC000';   // màu tô cột giá đề xuất: ô giá / tiêu đề
  const PICK_SHORT = { p25: 'P25', p10: 'P10', med: 'P50', latest: 'năm gần nhất', base: 'baseline phù hợp / P25' };
  const PICK = {
    p25: { label: 'Tốt nhất — cạnh tranh (P25)', f: s => s.p25 },
    p10: { label: 'Thấp nhất hợp lý (P10)', f: s => s.p10 },
    med: { label: 'Trung vị thị trường (P50)', f: s => s.med },
    latest: { label: 'Năm gần nhất (trung vị)', f: s => s.latestPrice },
    // Phương án baseline: dòng có baseline phù hợp với CSDL (trong P10–P90) điền baseline; baseline không phù hợp / không có baseline → P25
    base: { label: 'Baseline nếu phù hợp với CSDL (không thì P25)', f: s => s.p25 },
  };
  // Đánh giá giá baseline so với phân bố giá CSDL (DXG.judgeBaseline)
  const BL_EVAL = { ok: 'Phù hợp', xem: 'Cần xem', cao: 'Không phù hợp — cao', thap: 'Không phù hợp — thấp' };
  const BL_CLS = { ok: 'cao', xem: 'tb', cao: 'none', thap: 'none' };
  const PV_EVAL = { ok: 'Phù hợp', xem: 'Cần xem', cao: 'Cao quá', thap: 'Thấp quá' }, PV_CLS = BL_CLS;
  const SEV = { loi: 'Lỗi', canh_bao: 'Cảnh báo', luu_y: 'Lưu ý' };
  // Đánh giá giá QS đã có sẵn trong file (nếu có) so với phân bố giá CSDL
  const EVAL = { ok: 'Hợp lý', xem: 'Cần xem', bt: 'Bất thường', nogia: 'Chưa có giá', notk: 'Không có tham khảo', skip: 'Bỏ qua' };
  const KEYS = [['code', 'Mã/STT'], ['desc', 'Mô tả *'], ['unit', 'Đơn vị'], ['qty', 'Khối lượng'], ['rate', 'Đơn giá (giá QS có sẵn)'], ['amount', 'Thành tiền'], ['base', 'Giá baseline']];
  const PAGE = 300;
  const OWN = /^(TK|DX)_/;   // sheet do phiên bản cũ của phần mềm tạo, bỏ qua khi đọc

  let IX = null;
  let DBX = null;   // CSDL module dùng: chính window.DB; sao chép riêng khi thêm đơn giá bổ sung để không đổi dữ liệu của app tra cứu
  const EMBED = !!document.getElementById('dxg-tpl');   // nhúng trong app tra cứu (mục "Điền giá BOQ")
  const S = {
    wb: null, fileName: '', sheets: [], lines: [], items: [],
    baseList: null, baseName: '', extra: [], session: null,
    learn: { cap: [], dong_nghia: [] }, learnInfo: null,   // dữ liệu học (.dxgl) đã nạp
    sources: [],   // nguồn giá ngoài CSDL nội bộ đã thử nạp: [{ label, status: 'ok' | 'co_san' (đã có trong CSDL) | 'none' | 'loi' | 'format', dong, nhomChung, nhomMoi }]
    // mode: 'col' = ghi giá đề xuất vào CỘT RIÊNG tô màu (mặc định, không đụng cột Đơn giá); 'rate' = điền vào ô Đơn giá đang trống
    opt: { mode: 'col', pick: 'p25', minFit: 'tb', round: 'auto', overwrite: false, amount: true, yearFrom: null, yearTo: null, types: new Set(), provs: new Set(),
      excludeReview: true, excludeOutlier: true, excludeWarn: false, srcOff: new Set(), pool: true, factor: 1, tolBl: 0.10, tolOk: 0.05, tolBt: 0.15 },
    view: { f: 'all', q: '', shown: PAGE, tab: 'lines', cur: null },
  };

  /* ---------- Nhúng trong app tra cứu: mục "Điền giá BOQ" trên thanh điều hướng (chỉ admin) ---------- */
  function bootEmbed() {
    if (!ADMIN) return;   // nhân viên: không có mục này. Khi mở bộ dữ liệu riêng (CTG, đối thủ), app tra cứu ẩn mục này
    const sec = document.createElement('section');
    sec.id = 'sec-dxg'; sec.hidden = true;
    sec.appendChild(document.getElementById('dxg-tpl').content.cloneNode(true));
    const last = document.getElementById('sec-analysis') || document.querySelector('section:last-of-type');
    (last ? last.parentNode : document.body).insertBefore(sec, last ? last.nextSibling : null);
    const nav = document.querySelector('.topnav');
    if (nav) {
      const a = document.createElement('a');
      a.href = '#'; a.dataset.sec = 'dien-gia'; a.textContent = 'Điền giá BOQ'; a.title = 'Điền giá từ CSDL vào file BOQ Excel (admin)';
      nav.insertBefore(a, nav.querySelector('.nav-ctg, .nav-dt'));   // trước các bộ dữ liệu riêng
    }
    let started = false;
    const show = on => {
      sec.hidden = !on;
      if (!on) { const d = $('#dxg-drawer'); if (d) d.hidden = true; return; }
      if (started) return;
      started = true;
      const wait = () => (window.DB && window.DB.cols ? init() : setTimeout(wait, 200));
      wait();
    };
    // app tra cứu tự ẩn các mục khác và đánh dấu nút; module chỉ bật / tắt mục của mình
    document.addEventListener('click', e => {
      const s = e.target.closest('.topnav [data-sec]');
      if (s) { e.preventDefault(); show(s.dataset.sec === 'dien-gia'); }
    });
    // mở lại trang khi đang ở mục này (#sec=dien-gia)
    const fromHash = () => new URLSearchParams(location.hash.slice(1)).get('sec') === 'dien-gia' && !new URLSearchParams(location.search).get('ds');
    if (fromHash()) {
      const go = () => (window.DB && window.DB.cols && !document.getElementById('splash') ? show(true) : setTimeout(go, 200));
      go();
    }
  }

  /* ---------- Nạp cơ sở dữ liệu ---------- */
  function boot() {
    if (EMBED) return bootEmbed();
    // Nhân viên chỉ dùng được khi admin bật cờ cho_nhan_vien trong build.py
    const meta = document.querySelector('meta[name="cho-nhan-vien"]');
    if (!ADMIN && !(meta && meta.content === '1')) {
      $('#splash-msg').textContent = 'Chức năng Điền giá BOQ chỉ dành cho tài khoản admin.';
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
  /* ---------- Nguồn giá ngoài CSDL nội bộ ---------- */
  // Các khối dữ liệu cùng định dạng window.DB trong gói .dgbw, gộp vào CSDL của module để có thêm báo giá cho mỗi nhóm
  // công việc. Chỉ admin; nhân viên không có khóa mở các khối này. Chạy thử không qua đăng nhập: dùng window.DT / window.CTG
  // nếu trang đã nạp sẵn (vd data/db.js gán thêm biến window.DT). Nguồn đã có trong CSDL (cột ng) thì không gộp lần nữa.
  const NGUON = [{ kind: 'ctg', label: 'CTG', glob: 'CTG' }, { kind: 'doithu', label: 'Đối thủ', glob: 'DT' }];
  async function readSource(n) {
    if (window.SECURE) return JSON.parse(await window.SECURE.load(n.kind));
    if (!window[n.glob]) throw new Error('không có');
    return window[n.glob];
  }
  async function loadSources() {
    if (!ADMIN) return;
    for (const n of NGUON) {
      // nguồn đã có trong CSDL (CTG làm sạch chung trong khối db, hoặc app tra cứu đã gộp đối thủ) thì không gộp lần nữa
      if (DXG.hasSource(DBX || window.DB, n.label)) { S.sources.push({ label: n.label, status: 'co_san' }); continue; }
      let src;
      try { src = await readSource(n); }
      catch (e) { S.sources.push({ label: n.label, status: !window.SECURE || e.code === 'THIEU_KHOI' ? 'none' : 'loi', why: String(e && e.message || e) }); continue; }
      if (!src || !src.cols || !Array.isArray(src.cols.name) || !src.count) { S.sources.push({ label: n.label, status: 'format' }); continue; }
      S.sources.push({ label: n.label, status: 'ok', ...DXG.mergeDB(ownDB(), src, n.label) });
    }
    if (S.sources.some(x => x.status === 'ok')) {
      const sess = S.items.length ? sessionData() : null;
      rebuildIndex(); buildSourceOptions();
      if (sess) rematch(sess);
    } else showMeta();
    console.info('Nguồn giá:', S.sources.map(x => `${x.label} ${x.status}${x.dong ? ` (${x.dong} dòng)` : ''}`).join(', '));
  }
  function showMeta() {
    const meta = $('#dxg-meta'), srcEl = $('#dxg-src');
    const C = DBX.cols, D = DBX.dicts || {}, cnt = {};
    if (Array.isArray(C.ng) && Array.isArray(D.ng)) for (let i = 0; i < DBX.count; i++) { const l = D.ng[C.ng[i]] || 'Nội bộ'; cnt[l] = (cnt[l] || 0) + 1; }
    const parts = Object.entries(cnt).map(([l, n]) => `${l} ${NF.format(n)}`);
    const miss = S.sources.filter(x => x.status !== 'ok' && x.status !== 'co_san').map(x => `${x.label}: ${x.status === 'none' ? 'không có trong gói dữ liệu' : x.status === 'loi' ? 'không mở được (' + x.why + ')' : 'định dạng khác, chưa dùng được'}`);
    // nguồn chưa quy giá về năm gốc (CTG): đã quy đổi theo hệ số năm học từ CSDL nội bộ
    const quy = S.sources.filter(x => x.quyDoi || x.khongNam).map(x => `${x.label}: quy giá về ${DBX.baseYear || 2026} theo hệ số năm của CSDL nội bộ (${NF.format(x.quyDoi)} dòng${x.khongNam ? `; ${NF.format(x.khongNam)} dòng không rõ năm giữ giá gốc` : ''})`);
    const gop = S.sources.filter(x => x.status === 'ok').map(x => `${x.label}: ${NF.format(x.nhomChung)} nhóm trùng tên với CSDL, ${NF.format(x.nhomMoi)} nhóm mới`);
    if (meta) meta.textContent = `${NF.format(DBX.count)} đơn giá${parts.length > 1 ? ` (${parts.join(' · ')})` : S.extra.length ? ` (gồm ${NF.format(S.extra.length)} bổ sung)` : ''} · ${NF.format(IX.groups.length)} nhóm công việc · giá quy về ${DBX.baseYear || 2026} · cập nhật ${DBX.built || ''}${miss.length ? ' · ' + miss.join(' · ') : ''}`;
    // trong nội dung module (thấy được cả khi ghép vào app tra cứu)
    const lech = S.sources.filter(x => x.lechNam).map(x => x.label);
    if (srcEl) srcEl.textContent = `Nguồn giá đang dùng: ${parts.length ? parts.join(' · ') : `Nội bộ ${NF.format(DBX.count)}`} báo giá · ${NF.format(IX.groups.length)} nhóm công việc${miss.length ? ' · ' + miss.join(' · ') : ''}`
      + (gop.length ? ` · ${gop.join(' · ')}` : '') + (quy.length ? ` · ${quy.join(' · ')}` : '')
      + (lech.length ? ` · Lưu ý: ${lech.join(', ')} quy giá về năm gốc khác CSDL nội bộ` : '');
  }
  const nhieuNguon = () => !!(DBX && DBX.dicts && DBX.dicts.ng && DBX.dicts.ng.length > 1 && Array.isArray(DBX.cols.ng));
  // Nguồn có báo giá trong phân bố: số báo giá theo nguồn của một thống kê nhóm (chỉ hiện khi CSDL có từ 2 nguồn)
  const srcTxt = st => {
    const D = DBX.dicts || {};
    if (!st || !st.src || !D.ng || D.ng.length < 2) return '';
    return ' (' + Object.entries(st.src).map(([l, n]) => `${l} ${n}`).join(', ') + ')';
  };
  function rebuildIndex() {
    if (!DBX) DBX = window.DB;
    DXG.setSynonyms(S.learn.dong_nghia);
    IX = DXG.buildIndex(DBX);
    S.learnInfo = S.learn.cap.length ? DXG.applyLearn(IX, S.learn) : null;
    // đơn giá bổ sung (dữ liệu mới nhất của người dùng) được ưu tiên nhẹ khi khớp
    const bs = S.extra.length ? (DBX.projects || []).findIndex(p => p[0] === 'BOSUNG') : -1;
    if (bs >= 0) for (const g of IX.groups) if (g.rows.every(i => IX.C.p[i] === bs)) g.boost = 1.08;
    statCache = new Map();
    showMeta();
  }
  function init() {
    const t0 = performance.now();
    rebuildIndex();
    buildOptions();
    bindUI();
    if ($('#splash')) $('#splash').remove();
    if (!window.writeWorkbook) $('#dx-report').hidden = true;   // báo cáo Excel dùng bộ ghi xlsx của app tra cứu
    console.log(`Chỉ mục điền giá: ${Math.round(performance.now() - t0)} ms, ${IX.groups.length} nhóm`);
    loadSources();
  }

  /* ---------- Tùy chọn ---------- */
  function buildOptions() {
    $('#o-pick').innerHTML = Object.entries(PICK).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('');
    const P = DBX.projects || [];
    const fill = (id, vals, set) => {
      const box = $(`#${id} .msel-list`);
      const list = [...new Set(vals.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
      box.innerHTML = list.length ? list.map(v => `<label><input type="checkbox" value="${esc(v)}"> ${esc(v)}</label>`).join('') : '<span class="muted small">Không có dữ liệu</span>';
      box.onchange = () => {
        set.clear(); $$('input:checked', box).forEach(i => set.add(i.value));
        $(`#${id} summary`).textContent = set.size ? [...set].join(', ') : 'Tất cả';
        recompute();
      };
    };
    fill('o-type', P.map(p => p[2]), S.opt.types);
    fill('o-prov', P.map(p => p[4] || p[3]), S.opt.provs);
    buildSourceOptions();
  }
  // "Nguồn giá": mặc định dùng mọi nguồn; bỏ chọn nguồn nào thì báo giá của nguồn đó không vào phân bố giá
  function buildSourceOptions() {
    const D = (DBX && DBX.dicts) || {}, labels = D.ng && D.ng.length ? D.ng : ['Nội bộ'], box = $('#o-src .msel-list');
    if (!box) return;
    box.innerHTML = labels.map(l => `<label><input type="checkbox" value="${esc(l)}"${S.opt.srcOff.has(l) ? '' : ' checked'}> ${esc(l)}</label>`).join('');
    const sum = () => { const on = labels.filter(l => !S.opt.srcOff.has(l)); $('#o-src summary').textContent = on.length === labels.length ? 'Tất cả' : on.join(', ') || '(không nguồn nào)'; };
    box.onchange = () => { S.opt.srcOff.clear(); $$('input', box).forEach(i => { if (!i.checked) S.opt.srcOff.add(i.value); }); sum(); recompute(); };
    sum();
    // CSDL dựng lại (thêm nguồn) cũng phải dựng lại danh sách tỉnh / loại hình theo dự án mới
    const P = (DBX && DBX.projects) || [];
    for (const [id, vals, set] of [['o-type', P.map(p => p[2]), S.opt.types], ['o-prov', P.map(p => p[4] || p[3]), S.opt.provs]]) {
      const lb = $(`#${id} .msel-list`); if (!lb) continue;
      const list = [...new Set(vals.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
      if (list.length) lb.innerHTML = list.map(v => `<label><input type="checkbox" value="${esc(v)}"${set.has(v) ? ' checked' : ''}> ${esc(v)}</label>`).join('');
    }
  }
  function readOptions() {
    const o = S.opt, n = id => { const v = $(id).value.trim(); return v === '' ? null : +v; };
    o.mode = $('#o-mode').value;
    $('#o-overwrite').disabled = $('#o-amount').disabled = o.mode === 'col';   // chỉ dùng khi điền vào ô Đơn giá
    o.pick = $('#o-pick').value; o.minFit = $('#o-minfit').value; o.round = $('#o-round').value; o.overwrite = $('#o-overwrite').checked; o.amount = $('#o-amount').checked;
    o.yearFrom = n('#o-yfrom'); o.yearTo = n('#o-yto');
    o.factor = (n('#o-factor') ?? 100) / 100;
    o.tolBl = (n('#o-tol') ?? 10) / 100;
    o.excludeReview = $('#o-review').checked; o.excludeOutlier = $('#o-outlier').checked; o.excludeWarn = $('#o-warn').checked;
    o.pool = $('#o-pool').checked;
  }
  function writeOptions() {
    const o = S.opt;
    $('#o-mode').value = o.mode === 'rate' ? 'rate' : 'col';
    $('#o-pick').value = o.pick || 'p25'; $('#o-minfit').value = o.minFit || 'tb'; $('#o-round').value = o.round || 'auto'; $('#o-overwrite').checked = !!o.overwrite; $('#o-amount').checked = o.amount !== false;
    $('#o-yfrom').value = o.yearFrom ?? ''; $('#o-yto').value = o.yearTo ?? '';
    $('#o-factor').value = Math.round(o.factor * 1000) / 10; $('#o-tol').value = Math.round(o.tolBl * 1000) / 10;
    $('#o-review').checked = o.excludeReview; $('#o-outlier').checked = o.excludeOutlier; $('#o-warn').checked = o.excludeWarn; $('#o-pool').checked = o.pool !== false;
    buildSourceOptions();
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
      const buf = await file.arrayBuffer();
      const wb = await XLSXIO.read(buf.slice(0));
      S.src = buf;   // bản gốc: mỗi lần xuất đều ghi lên bản gốc, giá của các lần xuất trước không lẫn vào
      if (S.items.length) S.session = sessionData();   // nạp lại BOQ: giữ lựa chọn, giá tay, ý kiến đã có
      const prev = new Map(S.sheets.filter(s => s.include).map(s => [s.name, s.det]));
      S.wb = wb; S.fileName = file.name; S.sheets = []; S.items = []; S.lines = [];
      const skipped = [];   // sheet hiện (visible) nhưng không có hạng mục
      wb.sheets.forEach((sh, si) => {
        if (sh.state !== 'visible' || OWN.test(sh.name)) return;
        const grid = wb.grid(si);
        const fresh = DXG.detectColumns(grid), old = prev.get(sh.name);
        // nạp lại BOQ cùng sheet: giữ cột QS đã chỉnh, nhưng cột giá đề xuất luôn theo file mới (file đã xuất có thể có sẵn cột này)
        const det = old ? { ...old, cols: { ...old.cols } } : fresh;
        if (old) { delete det.cols.prop; if (fresh && fresh.cols.prop !== undefined) det.cols.prop = fresh.cols.prop; }
        // sheet chỉ có thuyết minh / điều kiện chung (không có dòng hạng mục) thì mặc định không dùng
        const nItem = det ? DXG.extractLines(grid, det, sh.name).filter(l => l.kind === 'item').length : 0;
        const entry = { si, name: sh.name, grid, formulas: wb.formulaCells(si), fText: wb.formulaText(si), det: det ? JSON.parse(JSON.stringify(det)) : { headerRow: 0, dataStart: 1, cols: {} }, include: nItem > 0, auto: !!det };
        // sheet không có dòng hạng mục (bìa, tổng hợp, mẫu trống…) không cần điền giá: bỏ khỏi danh sách; file xuất vẫn giữ nguyên sheet đó
        (nItem ? S.sheets : skipped).push(entry);
      });
      if (!S.sheets.length) S.sheets = skipped;   // không nhận ra sheet nào: hiện đủ để QS chọn sheet và cột thủ công
      $('#n-boq').textContent = file.name;
      const ok = S.sheets.filter(s => s.include).length;
      if (!S.sheets.length) throw new Error('File không có sheet nào để đọc.');
      msg(ok ? `Đã đọc file, nhận diện được bảng BOQ ở ${ok} sheet (bỏ qua ${skipped.length} sheet không có hạng mục cần điền giá). Kiểm tra lại cấu trúc ở bước 2 (Mô tả, Đơn vị, Khối lượng, Đơn giá).` : 'Không tự nhận ra dòng tiêu đề BOQ. Hãy chọn sheet và cột thủ công ở bước 2.', ok ? 'ok' : 'err');
      renderMap();
      $('#step-map').hidden = false; $('#step-res').hidden = true;
      $('#step-map').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) { console.error(e); msg('Không đọc được file BOQ: ' + (e.message || e), 'err'); }
  }
  // Đọc các dòng có giá từ một file Excel bất kỳ (BOQ đã có giá, bảng giá NCC, baseline…)
  async function readPriceFile(file, prefer) {
    const wb = await XLSXIO.read(await file.arrayBuffer());
    const list = [];
    wb.sheets.forEach((sh, si) => {
      if (OWN.test(sh.name) || sh.state !== 'visible') return;
      const grid = wb.grid(si), det = DXG.detectColumns(grid);
      if (!det) return;
      const priceCol = prefer === 'base' ? (det.cols.base ?? det.cols.rate) : (det.cols.rate ?? det.cols.base);
      if (priceCol === undefined) return;
      const lines = DXG.extractLines(grid, { ...det, cols: { ...det.cols, base: priceCol } }, sh.name);
      for (const l of lines) if (l.kind === 'item' && isNum(l.base) && l.base > 0) list.push({ code: l.code, desc: l.desc, ctx: l.heads[l.heads.length - 1] || '', unit: l.unit, price: l.base, sheet: sh.name });
    });
    return list;
  }
  async function loadBase(file) {
    try {
      const list = await readPriceFile(file, 'base');
      if (!list.length) throw new Error('Không tìm thấy cột giá baseline (cần tiêu đề "Baseline", "Đơn giá", "Ngân sách"… cùng cột Mô tả và Đơn vị).');
      S.baseList = list; S.baseName = file.name;
      $('#n-base').textContent = `${file.name} · ${NF.format(list.length)} giá`;
      if (S.items.length) { applyBaseline(); recompute(); }
      const hit = S.items.filter(it => isNum(it.baseFile)).length;
      const t = S.items.length ? totals(S.items) : null;
      msg(t ? `Baseline: đọc ${NF.format(list.length)} giá, ghép được ${NF.format(hit)}/${NF.format(S.items.length)} dòng BOQ — so với CSDL: ${NF.format(t.blOk)} phù hợp, ${NF.format(t.blXem)} cần xem, ${NF.format(t.blKo)} không phù hợp. Chọn "Giá điền: ${PICK.base.label}" để điền baseline phù hợp vào BOQ.` : `Đã đọc ${NF.format(list.length)} giá baseline. Sau khi tính giá, mỗi dòng có đánh giá baseline phù hợp / không phù hợp với CSDL.`, 'ok');
    } catch (e) { console.error(e); msg('Không đọc được file baseline: ' + (e.message || e), 'err'); }
  }
  // Đơn giá bổ sung: thêm vào CSDL ngay trong phiên (không ghi ra gói dữ liệu)
  async function loadExtra(file) {
    try {
      const list = await readPriceFile(file, 'rate');
      if (!list.length) throw new Error('Không tìm thấy dòng nào có Mô tả + Đơn vị + Đơn giá.');
      addExtraRows(list, file.name);
      $('#n-extra').textContent = `${S.extra.length ? NF.format(S.extra.length) : 0} đơn giá bổ sung`;
      if (S.items.length) { rematch(); }
      msg(`Đã thêm ${NF.format(list.length)} đơn giá bổ sung từ "${file.name}" vào CSDL của phiên làm việc.`, 'ok');
    } catch (e) { console.error(e); msg('Không đọc được file đơn giá bổ sung: ' + (e.message || e), 'err'); }
  }
  // sao chép CSDL (một lần) trước khi thêm dòng, để dữ liệu của app tra cứu không bị đổi
  function ownDB() {
    if (DBX !== window.DB) return DBX;
    const src = window.DB, cols = {}, dicts = {};
    for (const [k, v] of Object.entries(src.cols)) cols[k] = Array.isArray(v) ? v.slice() : v;
    for (const [k, v] of Object.entries(src.dicts || {})) dicts[k] = Array.isArray(v) ? v.slice() : v;
    DBX = { ...src, cols, dicts, projects: (src.projects || []).slice() };
    return DBX;
  }
  function addExtraRows(list, fileName) {
    const DB = ownDB(), C = DB.cols, D = DB.dicts;
    DB.projects = DB.projects || [];
    let pi = DB.projects.findIndex(p => p[0] === 'BOSUNG');
    if (pi < 0) { DB.projects.push(['BOSUNG', 'Đơn giá bổ sung', '', '', '', '']); pi = DB.projects.length - 1; }
    const uIdx = (dict, v) => { if (!D[dict]) D[dict] = []; let k = D[dict].indexOf(v); if (k < 0) { D[dict].push(v); k = D[dict].length - 1; } return k; };
    const N = DB.count, year = DB.baseYear || new Date().getFullYear();
    const ng = DXG.tagSource(DB, 'Bổ sung');
    const keys = Object.keys(C).filter(k => Array.isArray(C[k]));
    for (const it of list) {
      // mô tả ngắn ("Móng") trong file bổ sung: ghép tiêu đề gần nhất để thành tên đầy đủ
      const name = it.desc.length < 25 && it.ctx ? `${it.ctx} — ${it.desc}` : it.desc;
      const row = { name, spec: '', u: uIdx('u', it.unit), cu: uIdx('cu', it.unit), g: -1, gn: -1, p26: it.price, cp: it.price, tot: it.price, y: year, p: pi,
        st: -1, ol: -1, warn: -1, mat: null, lab: null, mac: null, ng };
      for (const k of keys) C[k].push(k in row ? row[k] : (typeof C[k][0] === 'number' ? -1 : null));
      S.extra.push({ ...it, file: fileName });
    }
    DB.count = N + list.length;
    rebuildIndex();
  }
  async function loadSession(file) {
    try {
      const j = JSON.parse(await file.text());
      if (j.dinh_dang === 'DXGL1') return loadLearn(j, file.name);
      if (!['DGBQ1', 'DGBQ2', 'DGBQ3'].includes(j.dinh_dang)) throw new Error('Không phải file phiên làm việc hay dữ liệu học.');
      S.session = j;
      $('#n-sess').textContent = file.name;
      if (j.opt) { Object.assign(S.opt, j.opt, { types: new Set(j.opt.types || []), provs: new Set(j.opt.provs || []), srcOff: new Set(j.opt.srcOff || []) }); writeOptions(); }
      if (j.baseList && !S.baseList) { S.baseList = j.baseList; S.baseName = j.baseName || 'phiên đã lưu'; $('#n-base').textContent = `${S.baseName} · ${NF.format(j.baseList.length)} giá`; }
      if (j.extra && j.extra.length && !S.extra.length) { addExtraRows(j.extra, 'phiên đã lưu'); $('#n-extra').textContent = `${NF.format(S.extra.length)} đơn giá bổ sung`; }
      if (S.items.length) { rematch(j); msg('Đã khôi phục phiên làm việc.', 'ok'); }
      else msg(`Đã nạp phiên của file "${j.file || ''}". Nạp file BOQ tương ứng để tiếp tục.`, 'ok');
    } catch (e) { msg('Không mở được phiên: ' + (e.message || e), 'err'); }
  }

  /* ---------- Dữ liệu học: nhớ nhóm QS đã chọn cho từng mô tả ---------- */
  function loadLearn(j, name) {
    const sess = S.items.length ? sessionData() : null;
    S.learn = DXG.mergeLearn(S.learn, j);
    rebuildIndex();
    const r = S.learnInfo || { nhan: 0, mat: 0 };
    $('#n-sess').textContent = name;
    if (sess) rematch(sess);
    msg(`Đã nạp dữ liệu học: ${NF.format(r.nhan)} lựa chọn của QS${r.mat ? `, ${NF.format(r.mat)} lựa chọn không còn nhóm trong CSDL` : ''}${S.learn.dong_nghia.length ? `, ${S.learn.dong_nghia.length} cặp từ đồng nghĩa` : ''}.`, 'ok');
  }
  const gref = gid => { const g = IX.groups[gid]; return { gk: g.key, gn: g.name, gu: g.unit }; };
  // Lựa chọn của QS trong phiên hiện tại: dòng QS tự chọn nhóm (khác hoặc xác nhận nhóm tự khớp)
  function sessionPairs() {
    const cap = [];
    for (const it of S.items) {
      const c = it.sel >= 0 ? it.cands[it.sel] : null;
      if (!c || !c.picked) continue;
      const neg = it.auto >= 0 && it.auto !== c.g ? [gref(it.auto)] : [];
      cap.push({ d: it.desc, u: it.unit, n: it.heads[it.heads.length - 1] || '', ...gref(c.g), neg, so: 1 });
    }
    return cap;
  }
  function saveLearn() {
    const cur = sessionPairs();
    if (!cur.length && !S.learn.cap.length) { msg('Chưa có lựa chọn nào của QS để học. Mở chi tiết dòng và chọn nhóm đúng trước.', 'err'); return; }
    // cặp đã nạp trước đó không cộng lại lần nữa khi lưu nhiều lần trong cùng phiên
    const model = DXG.mergeLearn(S.learn, { cap: cur });
    model.tao_luc = new Date().toISOString(); model.csdl = { built: DBX.built || '', count: DBX.count };
    download(new Blob([JSON.stringify(model)], { type: 'application/json' }), 'du_lieu_hoc_' + new Date().toISOString().slice(0, 10) + '.dxgl');
    msg(`Đã lưu dữ liệu học: ${NF.format(model.cap.length)} cặp mô tả → nhóm (${NF.format(cur.length)} từ phiên này).`, 'ok');
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
      // chỉ liệt kê tới cột cuối có tiêu đề + vài cột (sheet có thể "rộng" tới 16.384 cột do định dạng)
      const hdrW = Math.max(0, ...[sh.det.headerRow, sh.det.headerRow + 1].map(r => (sh.grid[r] || []).reduce((m, v, c) => (v !== null && v !== undefined && v !== '' ? c + 1 : m), 0)));
      const width = Math.min(Math.max(hdrW + 6, 12, ...Object.values(sh.det.cols).map(c => c + 2)), 60);
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

  /* ---------- Bước 3: tính giá điền ---------- */
  async function runAll() {
    const use = S.sheets.filter(s => s.include && s.det.cols.desc !== undefined);
    if (!use.length) { msg('Chưa có sheet nào được chọn hoặc chưa chọn cột Mô tả ở bước 2.', 'err'); return; }
    const noRate = use.filter(s => s.det.cols.rate === undefined).map(s => s.name);
    if (noRate.length && S.opt.mode === 'rate') msg(`Sheet ${noRate.join(', ')} chưa chọn cột Đơn giá: các dòng của sheet này sẽ không được điền giá.`, 'err');
    const t0 = performance.now(), btn = $('#go');
    btn.disabled = true;
    S.lines = []; S.items = [];
    let done = 0;
    for (const sh of use) {
      const lines = DXG.extractLines(sh.grid, sh.det, sh.name);
      S.lines.push({ kind: 'sheet', sheet: sh.name });
      // Bảng tách Đơn giá thành Vật liệu | Nhân công mà không có cột tổng: đơn giá của dòng = VL + NC
      const rc0 = sh.det.cols.rate, splitVL = rc0 !== undefined && sh.det.cols.lab !== undefined && /vat lieu|vat tu|material/.test(DXG.norm((sh.grid[sh.det.headerRow + 1] || [])[rc0] || ''));
      const ac0 = sh.det.cols.amount;
      for (const l of lines) {
        if (ac0 !== undefined && (l.kind === 'item' || l.kind === 'sum')) l.fAmt = (sh.fText || new Map()).get(XLSXIO.colName(ac0) + (l.r + 1)) || null;
        if (l.kind === 'item') {
          l.rateEff = splitVL && isNum(l.rate) && isNum(l.lab) ? l.rate + l.lab : l.rate;
          l.id = `${sh.name}|${l.r}`; l.si = sh.si; l.sh = sh;
          l.cands = matchLine(l);
          l.sel = l.cands.length ? 0 : -1;
          l.auto = l.cands.length ? l.cands[0].g : -1;   // nhóm phần mềm đề xuất (ghi nhận là nhóm bị bác khi QS chọn nhóm khác)
          l.baseCol = isNum(l.base) && l.base > 0 ? l.base : null;
          l.baseFile = null; l.baseManual = null; l.manual = null; l.skip = false; l.note = '';
          l.qs = isNum(l.rateEff) && l.rateEff > 0 ? l.rateEff : null;   // giá đang có trong ô đơn giá (VL + NC nếu bảng tách 2 cột)
          const rc = sh.det.cols.rate;
          l.rateFormula = rc !== undefined && sh.formulas.has(XLSXIO.colName(rc) + (l.r + 1));
          const ac = sh.det.cols.amount;
          l.amountEmpty = ac !== undefined && !sh.formulas.has(XLSXIO.colName(ac) + (l.r + 1)) && !isNum(l.amount) && (sh.grid[l.r] || [])[ac] == null;
          S.items.push(l);
          if (++done % 100 === 0) { btn.textContent = `Đang khớp… ${NF.format(done)} dòng`; await new Promise(r => setTimeout(r)); }
        }
        S.lines.push(l);
      }
    }
    if (S.session) applySession();
    applyBaseline();
    runAudit();
    console.log(`Khớp ${S.items.length} dòng trong ${Math.round(performance.now() - t0)} ms`);
    btn.disabled = false; btn.textContent = 'Tính giá điền →';
    $('#step-res').hidden = false;
    S.view.shown = PAGE;
    // BOQ đã có giá ở phần lớn các dòng: mở thẳng thẻ Kiểm tra BOQ; BOQ chưa có giá: về Chi tiết dòng
    const priced = S.items.filter(it => isNum(it.qs)).length;
    if (S.items.length && priced >= S.items.length * 0.5) S.view.tab = 'audit';
    else if (S.view.tab === 'audit') S.view.tab = 'lines';
    switchTab(S.view.tab);
    recompute();
    $('#step-res').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  const matchLine = l => DXG.match(IX, { desc: l.desc, unit: l.unit, ctx: l.ctx, near: l.heads[l.heads.length - 1] || '' });
  // CSDL đổi (thêm đơn giá bổ sung): khớp lại, giữ lựa chọn của người dùng
  function rematch(sess = sessionData()) {
    for (const it of S.items) { it.cands = matchLine(it); it.sel = it.cands.length ? 0 : -1; it.auto = it.cands.length ? it.cands[0].g : -1; }
    S.session = sess; applySession(); applyBaseline(); recompute();
  }
  function applyBaseline() {
    if (!S.baseList) return;
    const res = DXG.matchBaseline(S.items, S.baseList);
    for (const it of S.items) { const b = res.get(it); it.baseFile = b ? b.price : null; it.baseHow = b ? b.how : ''; }
  }
  // Kiểm tra số học BOQ đã có giá: gắn danh sách lỗi vào từng dòng
  function runAudit() {
    S.audit = DXG.auditBoq(S.lines.filter(l => l.kind !== 'sheet'));
    const byKey = new Map(S.items.map(it => [`${it.sheet}|${it.r}`, it]));
    for (const it of S.items) it.issues = [];
    for (const x of S.audit) { const it = byKey.get(`${x.sheet}|${x.r}`); if (it) it.issues.push(x); }
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
          else if (x.picked) it.cands[k] = { ...it.cands[k], picked: true };
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
  function stats(gid, ratio, pool = []) {
    const o = S.opt;
    const fk = [o.yearFrom, o.yearTo, [...o.types].join(','), [...o.provs].join(','), [...o.srcOff].join(','), o.excludeReview, o.excludeOutlier, o.excludeWarn, IX.groups.length].join('|');
    if (fk !== statKey) { statCache = new Map(); statKey = fk; }
    const k = gid + '|' + ratio + pool.map(p => `+${p.g}|${p.ratio}`).join('');
    if (!statCache.has(k)) statCache.set(k, DXG.groupStats(IX, gid, o, ratio, pool));
    return statCache.get(k);
  }
  function roundPrice(v) {
    if (!isNum(v)) return null;
    const m = S.opt.round;
    if (m === 'none') return Math.round(v);
    if (m === '1000') return Math.round(v / 1000) * 1000;
    if (m === '100') return Math.round(v / 100) * 100;
    return v >= 1e6 ? Math.round(v / 1000) * 1000 : v >= 1e4 ? Math.round(v / 100) * 100 : v >= 1000 ? Math.round(v / 10) * 10 : Math.round(v);
  }
  function calc(it) {
    const o = S.opt, f = o.factor, c = it.sel >= 0 ? it.cands[it.sel] : null;
    const pool = c && o.pool ? DXG.poolCands(IX, it.cands, it.sel, { desc: it.desc, near: it.heads[it.heads.length - 1] || '' }) : [];   // nhóm gần giống gộp chung báo giá
    const st = c ? stats(c.g, c.ratio, pool) : null;
    const fit = c ? (c.picked ? { level: 'cao', value: 1, picked: true } : DXG.confidence(c, st)) : { level: 'none', value: 0 };
    const shown = !!(c && st && st.n > 0 && (fit.level !== 'none' || c.picked));
    const ref = shown ? { p10: st.p10 * f, p25: st.p25 * f, p50: st.med * f, p75: st.p75 * f, p90: st.p90 * f } : null;
    // ---- Giá điền và có điền hay không
    const best = shown ? roundPrice(PICK[o.pick].f(st) * f) : null;
    // ---- Baseline và đánh giá phù hợp / không phù hợp với CSDL (chỉ khi nhóm khớp đủ tin cậy và cùng đơn vị)
    const base = isNum(it.baseManual) ? it.baseManual : isNum(it.baseFile) ? it.baseFile : it.baseCol;
    const baseSrc = isNum(it.baseManual) ? 'nhập tay' : isNum(it.baseFile) ? 'file baseline' : isNum(it.baseCol) ? 'cột BOQ' : '';
    const reliable = shown && c.unitOk !== false && (c.picked || FIT_RANK[fit.level] >= FIT_RANK[o.minFit]);
    const bv = reliable ? DXG.judgeBaseline(base, ref, o.tolBl) : null;
    // Giá đang có trong BOQ so với thị trường (CSDL): phù hợp / cần xem / cao quá / thấp quá
    const pv = reliable && !it.skip ? DXG.judgePrice(it.qs, ref, o.tolBl) : null;
    let price = null, fill = false, why = '';
    const hasRate = it.sh.det.cols.rate !== undefined, col = o.mode === 'col';
    // Cột riêng: giá đề xuất ghi vào cột mới, ô Đơn giá (kể cả ô đã có giá QS) không bị đụng tới
    if (it.skip) why = 'Không điền (đã chọn bỏ qua)';
    else if (!col && !hasRate) why = 'Sheet chưa chọn cột Đơn giá';
    else if (!col && it.rateFormula) why = 'Ô đơn giá là công thức — giữ nguyên';
    else if (!col && isNum(it.qs) && !o.overwrite) { why = 'Ô đã có giá — giữ nguyên'; price = it.qs; }
    else if (isNum(it.manual)) { price = it.manual; fill = true; why = 'Giá nhập tay'; }
    else if (o.pick === 'base' && bv && bv.ok) { price = base; fill = true; why = bv.level === 'ok' ? 'Baseline — phù hợp với CSDL' : 'Baseline — cần xem (ngoài P25–P75, trong P10–P90)'; }
    else if (o.pick === 'base' && isNum(base) && !reliable) { price = base; fill = true; why = 'Baseline — chưa đối chiếu được với CSDL, nên kiểm tra'; }
    else if (!shown) why = c && st && st.n === 0 ? 'Nhóm khớp không có báo giá thuộc nguồn đang chọn' : 'Không có tham khảo trong CSDL — QS tự định giá';
    else if (c.unitOk === false) why = `Khác đơn vị (CSDL: ${IX.groups[c.g].unit}) — không điền`;
    else if (FIT_RANK[fit.level] < FIT_RANK[o.minFit]) { why = `Khớp ${FIT[fit.level].toLowerCase()} — không điền, QS kiểm tra`; }
    else if (!isNum(best) || best <= 0) why = 'Không tính được giá';
    else { price = best; fill = true; why = (o.pick === 'base' ? (bv ? `Baseline ${BL_EVAL[bv.level].toLowerCase()} — dùng P25 CSDL` : 'Không có baseline — dùng P25 CSDL') : PICK[o.pick].label) + (fit.level === 'cao' ? '' : ` · khớp ${FIT[fit.level].toLowerCase()}, nên kiểm tra`); }
    if (col) why = why.replace(/không điền/g, 'không đề xuất');
    // ---- Đánh giá giá đang có trong file (nếu QS đã nhập)
    const qs = it.qs, d50 = ref && isNum(qs) && ref.p50 ? qs / ref.p50 - 1 : null;
    let ev;
    if (it.skip) ev = 'skip';
    else if (!ref) ev = 'notk';
    else if (!isNum(qs)) ev = 'nogia';
    else if ((qs >= ref.p25 && qs <= ref.p75) || Math.abs(d50) <= o.tolOk) ev = 'ok';
    else if ((qs < ref.p10 || qs > ref.p90) && Math.abs(d50) > o.tolBt) ev = 'bt';
    else ev = 'xem';
    const finalPrice = isNum(price) ? price : null;
    const dev = DXG.diff(finalPrice, base, it.qty);
    const devHi = !!(dev && dev.pct !== null && Math.abs(dev.pct) > o.tolBl);
    const notes = [];
    if (shown) {
      if (st.n < 3) notes.push(`Ít mẫu (${st.n} báo giá)`);
      if (st.relaxed) notes.push('Đã nới bộ lọc');
      if (c.ratio !== 1) notes.push(`Quy đổi ${IX.groups[c.g].unit} ×${fmtQ(c.ratio)}`);
      if (pool.length) notes.push(`Gộp ${pool.length + 1} nhóm gần giống: ${pool.map(p => IX.groups[p.g].name).join('; ')}`);
      if (IX.groups[c.g].boost) notes.push('Từ đơn giá bổ sung');
      if (o.mode === 'col' && isNum(it.qs)) notes.push(`Ô Đơn giá đang có ${fmt(it.qs)} — giữ nguyên`);
      if (c.learned && !c.picked) notes.push(c.learned === 'exact' ? 'Theo dữ liệu học (QS đã chọn nhóm này)' : 'Theo dữ liệu học (mô tả gần giống)');
    }
    it.c = { cand: c, pool, shown, st, fit, ref, best, price: finalPrice, fill, why, qs, d50, ev, base, baseSrc, bv, pv, pvAmt: pv && isNum(it.qty) ? (it.qs - ref.p50) * it.qty : null, dev, devHi, notes,
      amt: isNum(finalPrice) && isNum(it.qty) ? finalPrice * it.qty : null, amtBase: isNum(base) && isNum(it.qty) ? base * it.qty : null };
    return it.c;
  }
  function recompute() {
    if (!S.items.length) return;
    readOptions();
    for (const it of S.items) calc(it);
    renderKpis();
    renderTab();
    if (S.view.cur) renderDrawer(S.view.cur);
  }

  /* ---------- KPI ---------- */
  function totals(items) {
    const t = { n: 0, fill: 0, keep: 0, none: 0, amt: 0, amtFill: 0, bt: 0, base: 0, withBase: 0, nBase: 0, devHi: 0, blOk: 0, blXem: 0, blKo: 0, blNa: 0 };
    for (const it of items) {
      const c = it.c; if (it.skip) continue;
      t.n++;
      if (c.fill) { t.fill++; if (isNum(c.amt)) t.amtFill += c.amt; }
      else if (status(c) === 'keep') t.keep++;
      else t.none++;
      if (isNum(c.amt)) t.amt += c.amt;
      if (isNum(c.qs) && c.ev === 'bt') t.bt++;
      if (isNum(c.amt) && isNum(c.amtBase)) { t.withBase += c.amt; t.base += c.amtBase; t.nBase++; }
      if (c.devHi) t.devHi++;
      if (c.bv) { if (c.bv.level === 'ok') t.blOk++; else if (c.bv.level === 'xem') t.blXem++; else t.blKo++; }
      else if (isNum(c.base)) t.blNa++;
    }
    return t;
  }
  function renderKpis() {
    const t = totals(S.items), dB = t.base ? (t.withBase - t.base) / t.base : null, col = S.opt.mode === 'col';
    $('#kpis').innerHTML = [
      ['Dòng hạng mục', NF.format(t.n), col ? `${NF.format(t.fill)} dòng có giá đề xuất (${t.n ? Math.round(t.fill / t.n * 100) : 0}%)` : `${NF.format(t.fill + t.keep)} dòng có giá sau khi điền (${t.n ? Math.round((t.fill + t.keep) / t.n * 100) : 0}%)`, 'all'],
      [col ? 'Có giá đề xuất' : 'Sẽ điền giá', NF.format(t.fill), col ? `${PICK[S.opt.pick].label} → cột riêng tô màu` : `${PICK[S.opt.pick].label}`, 'fill'],
      [col ? 'Chỉ có giá QS' : 'Giữ giá đang có', NF.format(t.keep), t.bt ? `${NF.format(t.bt)} giá đang có bất thường so với CSDL` : col ? 'ô Đơn giá có sẵn, không có đề xuất' : 'ô đã có giá / công thức', 'keep'],
      [col ? 'Không đề xuất — QS định giá' : 'Không điền — QS định giá', NF.format(t.none), 'không có tham khảo hoặc khớp chưa đủ tin cậy', 'none'],
      col ? ['Tổng giá trị theo giá đề xuất', fmt(t.amt), 'KL × giá đề xuất (chỉ các dòng có đề xuất)', '']
        : ['Tổng giá trị sau khi điền', fmt(t.amt), `trong đó phần điền mới ${fmt(t.amtFill)}`, ''],
      ...(() => { const q = auditTotals(); return q.priced ? [['Kiểm tra BOQ', `${NF.format(q.err)} lỗi số học · ${NF.format(q.cao + q.thap)} giá bất thường`, `${q.verdict} — ${NF.format(q.cao)} cao quá, ${NF.format(q.thap)} thấp quá so với thị trường`, 'audit']] : []; })(),
      ['Baseline so với CSDL', t.blOk + t.blXem + t.blKo ? `${NF.format(t.blKo)} không phù hợp` : '—', t.blOk + t.blXem + t.blKo + t.blNa ? `${NF.format(t.blOk)} phù hợp · ${NF.format(t.blXem)} cần xem${t.blNa ? ` · ${NF.format(t.blNa)} chưa đối chiếu được` : ''}` : (S.baseName ? 'chưa ghép được dòng nào' : 'chưa nạp baseline'), 'blko'],
      ['So với baseline', dB === null ? '—' : pct(dB), dB === null ? (S.baseName ? 'chưa ghép được dòng nào' : 'chưa nạp baseline') : `${NF.format(t.nBase)} dòng · ${NF.format(t.devHi)} dòng lệch > ${Math.round(S.opt.tolBl * 100)}%`, 'dev'],
    ].map(([k, v, s, f]) => `<div class="kpi${f ? ' clickable' : ''}" ${f ? `data-f="${f}"` : ''}><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div><div class="s">${esc(s)}</div></div>`).join('');
  }

  /* ---------- Bảng ---------- */
  const status = c => c.fill ? 'fill' : isNum(c.price) || isNum(c.qs) ? 'keep' : 'none';
  function visible() {
    const { f, q } = S.view, nq = DXG.norm(q);
    const pass = it => {
      const c = it.c;
      if (['fill', 'keep', 'none'].includes(f) && status(c) !== f) return false;
      if (f === 'bt' && !(isNum(c.qs) && c.ev === 'bt')) return false;
      if (f === 'dev' && !c.devHi) return false;
      if (f === 'blko' && !(c.bv && !c.bv.ok)) return false;
      if (f === 'arith' && !(it.issues || []).some(x => x.sev === 'loi')) return false;
      if (f === 'pvko' && !(c.pv && !c.pv.ok)) return false;
      if (f === 'note' && !it.note) return false;
      if (nq && !DXG.norm(it.desc + ' ' + it.code + ' ' + it.ctx).includes(nq)) return false;
      return true;
    };
    if (f === 'all' && !nq) return S.lines;
    return S.lines.filter(l => l.kind === 'item' && pass(l));
  }
  const ST_BADGE = { fill: ['cao', 'Sẽ điền'], keep: ['tb', 'Giữ giá có sẵn'], none: ['man', 'Không điền'] };
  const ST_BADGE_COL = { fill: ['cao', 'Có đề xuất'], keep: ['tb', 'Chỉ có giá QS'], none: ['man', 'Không đề xuất'] };
  const stBadge = it => { const [cls, t] = (S.opt.mode === 'col' ? ST_BADGE_COL : ST_BADGE)[status(it.c)]; return `<span class="badge b-${cls}" title="${esc(it.c.why)}">${t}</span>`; };
  const fitBadge = it => it.c.cand ? `<span class="badge b-${it.c.fit.level}" title="Độ phù hợp của nhóm CSDL với mô tả BOQ">${it.c.cand.picked ? 'QS chọn' : FIT[it.c.fit.level]}</span>` : '';
  const blBadge = c => c.bv ? `<div><span class="badge b-${BL_CLS[c.bv.level]}" title="Baseline so với phân bố giá CSDL: ${esc(pct(c.bv.d50))} so P50">${esc(BL_EVAL[c.bv.level])}</span></div>` : '';
  function rowHtml(l) {
    if (l.kind === 'sheet') return `<tr class="head"><td colspan="11">Sheet: ${esc(l.sheet)}</td></tr>`;
    if (l.kind === 'head') return `<tr class="head"><td>${esc(l.code)}</td><td colspan="10">${esc(l.desc)}</td></tr>`;
    if (l.kind !== 'item') return '';
    const c = l.c, g = c.shown ? IX.groups[c.cand.g] : null;
    const evTxt = isNum(c.qs) && c.ref ? `<div class="price-sub ${c.ev === 'bt' ? 'd-hi' : ''}">giá có sẵn${S.opt.mode === 'col' ? ' ' + fmt(c.qs) : ''}: ${EVAL[c.ev]} (${pct(c.d50)} so P50)</div>` : '';
    return `<tr data-id="${esc(l.id)}"${S.view.cur === l ? ' class="sel"' : ''}>
      <td class="small">${esc(l.code)}</td>
      <td class="desc">${esc(l.desc)}${l.ctx ? `<div class="ctx">${esc(l.ctx)}</div>` : ''}${l.note ? `<div class="note">Ý kiến: ${esc(l.note)}</div>` : ''}</td>
      <td>${esc(l.unit)}</td>
      <td class="num">${fmtQ(l.qty)}</td>
      <td class="grp">${g ? esc(g.name) : c.cand ? `<span class="muted">gợi ý yếu: ${esc(IX.groups[c.cand.g].name)}</span>` : '<span class="muted">—</span>'} ${fitBadge(l)}
        ${g ? `<div class="price-sub">${c.st.n} báo giá${esc(srcTxt(c.st))} · ${c.st.proj} dự án · gần nhất ${c.st.latest || '?'}</div>` : ''}${c.notes.length ? `<div class="price-sub warn">${esc(c.notes.join(' · '))}</div>` : ''}</td>
      <td class="num small">${c.ref ? `${fmt(c.ref.p25)} – ${fmt(c.ref.p75)}<div class="price-sub">P50 ${fmt(c.ref.p50)}</div>` : ''}</td>
      <td class="num"><b>${fmt(c.price)}</b>${evTxt}</td>
      <td>${stBadge(l)}<div class="price-sub">${esc(c.why)}</div></td>
      <td class="num">${fmt(c.amt)}</td>
      <td class="num">${fmt(c.base)}${c.baseSrc ? `<div class="price-sub">${esc(c.baseSrc)}</div>` : ''}</td>
      <td class="num ${c.devHi ? 'd-hi' : c.dev ? 'd-ok' : ''}">${c.dev ? pct(c.dev.pct) : ''}${blBadge(c)}</td></tr>`;
  }
  function renderTable() {
    const rows = visible(), items = rows.filter(l => l.kind === 'item').length;
    $('#res-tbl').innerHTML = `<thead><tr><th>Mã</th><th>Mô tả</th><th>ĐV</th><th class="num">KL</th><th>Nhóm tham khảo trong CSDL</th>
      <th class="num">P25 – P75</th><th class="num">${S.opt.mode === 'col' ? 'Giá đề xuất' : 'Đơn giá'}</th><th>${S.opt.mode === 'col' ? 'Đề xuất' : 'Điền'}</th><th class="num">Thành tiền</th><th class="num">Baseline</th><th class="num">so BL · đánh giá BL</th></tr></thead>
      <tbody>${rows.slice(0, S.view.shown).map(rowHtml).join('')}</tbody>`;
    $('#flt-count').textContent = `${NF.format(items)} dòng`;
    $('#more').hidden = rows.length <= S.view.shown;
  }

  /* ---------- Ngăn chi tiết ---------- */
  const projOf = i => (DBX.projects || [])[IX.C.p ? IX.C.p[i] : -1] || [];
  function openDrawer(it) {
    if (!it) return;
    S.view.cur = it; renderDrawer(it); $('#dxg-drawer').hidden = false;
    $$('#res-tbl tr.sel').forEach(r => r.classList.remove('sel'));
    const tr = $(`#res-tbl tr[data-id="${CSS.escape(it.id)}"]`); if (tr) tr.classList.add('sel');
  }
  function closeDrawer() { S.view.cur = null; $('#dxg-drawer').hidden = true; $$('#res-tbl tr.sel').forEach(r => r.classList.remove('sel')); }
  // Thanh phân bố P10–P90, giá điền và baseline
  function distBar(c) {
    if (!c.ref) return '';
    const { p10, p25, p50, p75, p90 } = c.ref;
    const pts = [p10, p90, c.price, c.base].filter(isNum);
    const lo = Math.min(...pts) * 0.95, hi = Math.max(...pts) * 1.05, x = v => ((v - lo) / (hi - lo || 1) * 100).toFixed(2) + '%';
    const mark = (v, cls, label) => isNum(v) ? `<span class="pm ${cls}" style="left:${x(v)}" title="${esc(label)}: ${fmt(v)}"><i>${esc(label)}</i></span>` : '';
    return `<div class="dist"><div class="dist-track">
      <span class="dist-w" style="left:${x(p10)};width:calc(${x(p90)} - ${x(p10)})"></span>
      <span class="dist-iqr" style="left:${x(p25)};width:calc(${x(p75)} - ${x(p25)})"></span>
      <span class="dist-med" style="left:${x(p50)}"></span>
      ${mark(c.price, 'pm-qs', 'Giá')}${mark(c.base, 'pm-bl', 'BL')}</div>
      <div class="dist-lab small muted"><span>P10 ${fmt(p10)}</span><span><b>P25 ${fmt(p25)}</b></span><span>P50 ${fmt(p50)}</span><span>P75 ${fmt(p75)}</span><span>P90 ${fmt(p90)}</span></div></div>`;
  }
  function candHtml(it, c, k) {
    const g = IX.groups[c.g], st = stats(c.g, c.ratio), f = S.opt.factor;
    const conv = c.ratio !== 1 ? ` · quy đổi từ ${esc(g.unit)} ×${fmtQ(c.ratio)}` : '';
    return `<div class="cand${it.sel === k ? ' on' : ''}" data-k="${k}">
      <input type="radio" name="cand"${it.sel === k ? ' checked' : ''}>
      <div><div class="nm">${esc(g.name)}${g.boost ? ' <span class="badge b-tb">bổ sung</span>' : ''}</div>
        <div class="small muted">ĐV ${esc(g.unit || '?')}${conv}${c.unitOk === false ? ' · <b class="d-hi">khác đơn vị</b>' : ''} · ${st.n} báo giá${esc(srcTxt(st))} · ${st.proj} dự án · gần nhất ${st.latest || '?'}${st.relaxed ? ' · đã nới bộ lọc' : ''}</div></div>
      <div class="num"><b>${fmt(roundPrice(PICK[S.opt.pick].f(st) * f))}</b><div class="price-sub">P25–P75 ${fmt(st.p25 * f)} – ${fmt(st.p75 * f)}</div><div class="price-sub">${c.picked ? 'QS chọn' : c.learned ? 'đã học · ' + Math.round(c.score * 100) + '%' : 'phù hợp ' + Math.round(c.score * 100) + '%'}</div></div></div>`;
  }
  function renderDrawer(it) {
    const c = it.c || calc(it), o = S.opt;
    $('#dw-title').textContent = `${it.sheet} · dòng Excel ${it.r + 1}${it.code ? ' · mã ' + it.code : ''}`;
    const kv = [['Mô tả', esc(it.desc)], ['Hạng mục cha', esc(it.ctx)], ['Đơn vị / KL', `${esc(it.unit)} · ${fmtQ(it.qty)}`],
      ['Đơn giá', `<b>${fmt(c.price)}</b> ${stBadge(it)} <span class="muted small">${esc(c.why)}</span>`],
      ['Giá đang có trong ô', isNum(it.qs) ? `${fmt(it.qs)}${c.ref ? ` · ${EVAL[c.ev]} (${pct(c.d50)} so với P50)` : ''}` : it.rateFormula ? 'ô là công thức' : '<span class="muted">trống</span>'],
      ['Baseline', isNum(c.base) ? `${fmt(c.base)} <span class="muted small">(${esc(c.baseSrc)})</span>${c.dev ? ` · giá điền lệch <span class="${c.devHi ? 'd-hi' : 'd-ok'}">${pct(c.dev.pct)}</span>` : ''}` : '—'],
      ['Baseline so với CSDL', c.bv ? `<span class="badge b-${BL_CLS[c.bv.level]}">${esc(BL_EVAL[c.bv.level])}</span> <span class="muted small">${pct(c.bv.d50)} so với P50 · phù hợp: trong P25–P75 hoặc lệch P50 ≤ ${Math.round(o.tolBl * 100)}%; không phù hợp: ngoài P10–P90</span>` : isNum(c.base) ? '<span class="muted">chưa đối chiếu được (không có nhóm CSDL khớp đủ tin cậy, cùng đơn vị)</span>' : '—'],
      ['Giá trong BOQ so với thị trường', c.pv ? `<span class="badge b-${PV_CLS[c.pv.level]}">${esc(PV_EVAL[c.pv.level])}</span> <span class="muted small">${pct(c.pv.d50)} so với P50${isNum(c.pvAmt) ? ` · chênh ${fmt(c.pvAmt)} đ theo khối lượng` : ''}</span>` : isNum(it.qs) ? '<span class="muted">chưa đối chiếu được</span>' : '—'],
      ['Kiểm tra số học', (it.issues || []).length ? it.issues.map(x => `<div class="${x.sev === 'loi' ? 'd-hi' : x.sev === 'canh_bao' ? 'warn' : 'muted'}">${esc(x.msg)}${isNum(x.expect) ? ` — đúng ra ${fmt(x.expect)}, ghi ${fmt(x.actual)}` : ''}</div>`).join('') : '<span class="d-ok">không phát hiện lỗi</span>'],
      ['Lưu ý dữ liệu', c.notes.length ? `<span class="warn">${esc(c.notes.join(' · '))}</span>` : '—']];
    let h = `<div class="row-in" style="justify-content:space-between;margin-bottom:10px"><button class="btn sm" data-do="prev">← Dòng trước</button><button class="btn sm" data-do="next">Dòng sau →</button></div>
      <div class="kv">${kv.map(([k, v]) => `<div>${k}</div><div>${v}</div>`).join('')}</div>
      <h4>Phân bố giá trong CSDL${o.factor !== 1 ? ` (đã nhân hệ số ${Math.round(o.factor * 1000) / 10}%)` : ''}</h4>
      ${c.ref ? distBar(c) : '<div class="muted small">Chưa có nhóm tham khảo phù hợp — chọn hoặc tìm nhóm bên dưới, hoặc nhập giá tay.</div>'}
      <h4>Điều chỉnh</h4>
      <div class="row-in"><label for="dw-manual">Giá điền tay</label><input type="number" id="dw-manual" step="any" value="${isNum(it.manual) ? it.manual : ''}" placeholder="${fmt(c.best)}">
        <label for="dw-base">Baseline</label><input type="number" id="dw-base" step="any" value="${isNum(it.baseManual) ? it.baseManual : ''}" placeholder="${isNum(it.baseFile ?? it.baseCol) ? fmt(it.baseFile ?? it.baseCol) : 'nhập giá'}">
        <label><input type="checkbox" id="dw-skip"${it.skip ? ' checked' : ''}> Không điền dòng này</label>
        <button class="btn sm primary" data-do="apply">Lưu</button></div>
      <textarea id="dw-note" rows="2" placeholder="Ghi chú cho dòng này (không ghi vào file BOQ)">${esc(it.note)}</textarea>
      <h4>Nhóm công việc tham khảo trong CSDL ${it.cands.length ? '' : '<span class="muted">(không tìm thấy — tìm thủ công bên dưới)</span>'}</h4>
      ${it.cands.map((cd, k) => candHtml(it, cd, k)).join('')}
      ${it.sel >= 0 ? '<button class="link small" data-do="unsel">Không dùng nhóm nào (không điền giá tự động)</button>' : ''}
      <h4>Tìm nhóm khác trong CSDL</h4>
      <div class="row-in"><input type="search" id="dw-q" placeholder="vd: bê tông lót móng M150"><button class="btn sm" data-do="search">Tìm</button></div>
      <div id="dw-sr"></div>`;
    if (c.shown) {
      const ids = [...c.st.ids].sort((a, b) => (IX.C.y[b] || 0) - (IX.C.y[a] || 0)).slice(0, 60);
      h += `<h4>Báo giá tham khảo (${c.st.n}${c.st.n > ids.length ? `, hiện ${ids.length} mới nhất` : ''})</h4>
        <div class="tbl-wrap"><table class="refs"><thead><tr><th>Năm</th>${ADMIN ? '<th>Dự án</th>' : ''}<th>Tỉnh/TP</th>${nhieuNguon() ? '<th>Nguồn</th>' : ''}<th>Tên trong báo giá</th><th class="num">Giá quy đổi</th><th class="num">Giá gốc</th></tr></thead><tbody>
        ${ids.map(i => { const p = projOf(i); return `<tr><td>${IX.C.y[i] || ''}</td>${ADMIN ? `<td>${esc(p[1] || p[0] || '')}</td>` : ''}<td>${esc(p[4] || p[3] || '')}</td>${nhieuNguon() ? `<td>${esc(IX.D.ng[IX.C.ng[i]] || '')}</td>` : ''}<td>${esc(IX.C.name[i])}</td><td class="num">${fmt(IX.price(i) * (c.st.rate.get(i) ?? c.cand.ratio) * o.factor)}</td><td class="num small">${fmt(IX.C.tot[i])} /${esc(IX.unitOf(i))}</td></tr>`; }).join('')}
        </tbody></table></div>`;
    }
    $('#dw-body').innerHTML = h;
  }
  function drawerAction(e) {
    const it = S.view.cur; if (!it) return;
    const cand = e.target.closest('.cand[data-k]');
    if (cand) { it.sel = +cand.dataset.k; it.cands[it.sel] = { ...it.cands[it.sel], picked: true }; return refreshItem(it); }
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
      const m = $('#dw-manual').value.trim(), b = $('#dw-base').value.trim();
      it.manual = m === '' ? null : +m; it.baseManual = b === '' ? null : +b; it.note = $('#dw-note').value.trim(); it.skip = $('#dw-skip').checked;
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
      return `<div class="cand" data-g="${r.g}"><span>＋</span><div><div class="nm">${esc(g.name)}</div><div class="small muted">ĐV ${esc(g.unit)}${r.unitOk === false ? ' · <b class="d-hi">khác đơn vị</b>' : ''} · ${st.n} báo giá${esc(srcTxt(st))} · ${st.proj} dự án</div></div><div class="num"><b>${fmt(roundPrice(PICK[S.opt.pick].f(st) * f))}</b><div class="price-sub">P25–P75 ${fmt(st.p25 * f)} – ${fmt(st.p75 * f)}</div></div></div>`;
    }).join('') : '<div class="muted small">Không tìm thấy nhóm nào.</div>';
  }
  function refreshItem(it) {
    calc(it); renderKpis();
    const tr = $(`#res-tbl tr[data-id="${CSS.escape(it.id)}"]`);
    if (tr) tr.outerHTML = rowHtml(it);
    renderDrawer(it);
  }

  /* ---------- Kiểm tra BOQ đã có giá: số học + giá so với thị trường ---------- */
  function auditTotals() {
    const q = { n: 0, priced: 0, ok: 0, xem: 0, cao: 0, thap: 0, na: 0, err: 0, warn: 0, info: 0, amtCao: 0, amtThap: 0, amtErr: 0, total: 0 };
    for (const it of S.items) {
      if (it.skip) continue;
      q.n++;
      const c = it.c; if (!c) continue;
      if (isNum(it.qs)) { q.priced++; if (isNum(it.qty)) q.total += isNum(it.amount) ? it.amount : it.qs * it.qty; }
      if (c.pv) { q[c.pv.level]++; if (c.pv.level === 'cao' && isNum(c.pvAmt)) q.amtCao += c.pvAmt; if (c.pv.level === 'thap' && isNum(c.pvAmt)) q.amtThap += c.pvAmt; }
      else if (isNum(it.qs)) q.na++;
    }
    for (const x of S.audit || []) { if (x.sev === 'loi') { q.err++; if (isNum(x.diff)) q.amtErr += x.diff; } else if (x.sev === 'canh_bao') q.warn++; else q.info++; }
    const judged = q.ok + q.xem + q.cao + q.thap, bad = judged ? (q.cao + q.thap) / judged : 0, errRate = q.n ? q.err / q.n : 0;
    q.verdict = !q.priced ? 'BOQ chưa có giá' : q.err === 0 && bad <= 0.10 ? 'Tốt' : errRate > 0.05 || bad > 0.30 ? 'Kém — cần soát lại' : 'Cần chỉnh sửa';
    q.vcls = q.verdict === 'Tốt' ? 'cao' : q.verdict.startsWith('Kém') ? 'none' : 'tb';
    return q;
  }
  function renderAudit() {
    const q = auditTotals(), o = S.opt, judged = q.ok + q.xem + q.cao + q.thap;
    if (!q.priced) { $('#tab-audit').innerHTML = '<div class="card"><h3>Kiểm tra BOQ</h3><p class="muted">File BOQ chưa có đơn giá. Nạp BOQ đã có giá (cột Đơn giá, Thành tiền) để kiểm tra sai số học và giá cao / thấp so với thị trường.</p></div>'; return; }
    const SEV_ORD = ['loi', 'canh_bao', 'luu_y'];
    const arith = (S.audit || []).slice().sort((a, b) => SEV_ORD.indexOf(a.sev) - SEV_ORD.indexOf(b.sev) || Math.abs(b.diff || 0) - Math.abs(a.diff || 0));
    const pvBad = S.items.filter(it => !it.skip && it.c.pv && !it.c.pv.ok).sort((a, b) => Math.abs(b.c.pvAmt || 0) - Math.abs(a.c.pvAmt || 0));
    const pvXem = S.items.filter(it => !it.skip && it.c.pv && it.c.pv.level === 'xem').length;
    const lineAt = new Map(S.lines.filter(l => l.kind === 'item' || l.kind === 'sum').map(l => [`${l.sheet}|${l.r}`, l]));
    const seg = (n, cls, title) => n && judged ? `<span class="${cls}" style="width:${n / judged * 100}%" title="${esc(title)}: ${n}"></span>` : '';
    $('#tab-audit').innerHTML = `<div class="sum-grid">
      <div class="card"><h3>Đánh giá chung: <span class="badge b-${q.vcls}">${esc(q.verdict)}</span></h3>
        <div class="kv">
          <div>Dòng có giá</div><div>${NF.format(q.priced)} / ${NF.format(q.n)} dòng · tổng giá trị ${fmt(q.total)}</div>
          <div>Sai số học</div><div><b class="${q.err ? 'd-hi' : 'd-ok'}">${NF.format(q.err)} lỗi</b>${q.err ? ` · tổng chênh ${fmt(q.amtErr)}` : ''} · ${NF.format(q.warn)} cảnh báo · ${NF.format(q.info)} lưu ý</div>
          <div>Giá so với thị trường</div><div>${NF.format(q.ok)} phù hợp · ${NF.format(q.xem)} cần xem · <b class="d-hi">${NF.format(q.cao)} cao quá</b>${q.cao ? ` (+${fmt(q.amtCao)})` : ''} · <b class="d-hi">${NF.format(q.thap)} thấp quá</b>${q.thap ? ` (${fmt(q.amtThap)})` : ''}${q.na ? ` · ${NF.format(q.na)} chưa đối chiếu được` : ''}</div>
        </div>
        <div class="distbar">${seg(q.ok, 'c-ok', 'Phù hợp')}${seg(q.xem, 'c-lo', 'Cần xem')}${seg(q.cao + q.thap, 'c-hi', 'Cao / thấp quá')}</div>
        <p class="small muted">Giá được so với phân bố báo giá trong CSDL (theo bộ lọc năm, loại hình, tỉnh, nguồn ở trên; giá quy về năm ${DBX.baseYear || 2026}). Phù hợp: trong P25–P75 hoặc lệch P50 ≤ ${Math.round(o.tolBl * 100)}% ("Ngưỡng lệch baseline"). Cần xem: trong P10–P90. Cao / thấp quá: ngoài P10–P90. Chỉ đối chiếu dòng khớp nhóm CSDL từ mức "${esc(FIT[o.minFit])}" và cùng đơn vị. Đánh giá chung "Tốt": không lỗi số học và ≤ 10% dòng giá bất thường; "Kém": lỗi số học > 5% số dòng hoặc > 30% giá bất thường.</p></div>
      <div class="card"><h3>Giá cao / thấp quá so với thị trường (${pvBad.length})</h3>
        <div class="tbl-wrap"><table><thead><tr><th>Mô tả</th><th>ĐV</th><th class="num">Đơn giá BOQ</th><th class="num">P10 – P90</th><th class="num">so P50</th><th class="num">Chênh × KL</th></tr></thead><tbody>
        ${pvBad.map(it => `<tr data-id="${esc(it.id)}" class="jump"><td>${esc(it.desc.slice(0, 70))}<div class="ctx">${esc(it.sheet)} · dòng ${it.r + 1}</div></td><td>${esc(it.unit)}</td><td class="num">${fmt(it.qs)}</td><td class="num small">${fmt(it.c.ref.p10)} – ${fmt(it.c.ref.p90)}</td><td class="num"><span class="badge b-none">${esc(PV_EVAL[it.c.pv.level])}</span><div class="d-hi">${pct(it.c.pv.d50)}</div></td><td class="num">${fmt(it.c.pvAmt)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Không có dòng giá bất thường.</td></tr>'}
        </tbody></table></div>${pvXem ? `<p class="small muted">${NF.format(pvXem)} dòng "cần xem" (ngoài P25–P75, trong P10–P90): xem ở thẻ Chi tiết dòng.</p>` : ''}</div>
    </div>
    <div class="card"><h3>Sai số học và lỗi lập bảng (${arith.length})</h3>
      <div class="tbl-wrap"><table><thead><tr><th>Mức</th><th>Sheet · dòng</th><th>Mô tả</th><th>Vấn đề</th><th class="num">Đúng ra</th><th class="num">BOQ ghi</th><th class="num">Chênh lệch</th></tr></thead><tbody>
      ${arith.map(x => { const ln = lineAt.get(`${x.sheet}|${x.r}`), it = ln && ln.kind === 'item' ? ln : null; return `<tr${it ? ` data-id="${esc(it.id)}" class="jump"` : ''}><td><span class="badge b-${x.sev === 'loi' ? 'none' : x.sev === 'canh_bao' ? 'tb' : 'man'}">${SEV[x.sev]}</span></td><td class="small">${esc(x.sheet)} · ${x.r + 1}</td><td>${esc(((ln && ln.desc) || '').slice(0, 60))}</td><td class="small">${esc(x.msg)}</td><td class="num">${fmt(x.expect)}</td><td class="num">${fmt(x.actual)}</td><td class="num ${x.diff ? 'd-hi' : ''}">${fmt(x.diff)}</td></tr>`; }).join('') || '<tr><td colspan="7" class="d-ok">Không phát hiện sai số học.</td></tr>'}
      </tbody></table></div></div>`;
  }

  /* ---------- Tổng hợp ---------- */
  function groupBy(keyFn) {
    const m = new Map();
    for (const it of S.items) { if (it.skip) continue; const k = keyFn(it); if (!m.has(k)) m.set(k, []); m.get(k).push(it); }
    return [...m.entries()].map(([k, items]) => ({ k, ...totals(items) }));
  }
  function renderSummary() {
    const tbl = (rows, label) => `<div class="tbl-wrap"><table><thead><tr><th>${label}</th><th class="num">Dòng</th><th class="num">Sẽ điền</th><th class="num">Giữ giá có sẵn</th><th class="num">Không điền</th><th class="num">Tổng giá trị sau khi điền</th><th class="num">so baseline</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${esc(r.k)}</td><td class="num">${NF.format(r.n)}</td><td class="num">${r.fill}</td><td class="num">${r.keep}</td><td class="num ${r.none ? 'd-lo' : ''}">${r.none}</td><td class="num">${fmt(r.amt)}</td><td class="num">${r.base ? pct((r.withBase - r.base) / r.base) : ''}</td></tr>`).join('')}
      </tbody></table></div>`;
    const t = totals(S.items), tot = t.n || 1;
    const seg = (n, cls, title) => n ? `<span class="${cls}" style="width:${n / tot * 100}%" title="${esc(title)}: ${n}"></span>` : '';
    const todo = S.items.filter(it => !it.skip && status(it.c) === 'none').sort((a, b) => (b.qty || 0) - (a.qty || 0)).slice(0, 20);
    $('#tab-sum').innerHTML = `<div class="sum-grid">
      <div class="card"><h3>Kết quả điền giá</h3>
        <div class="distbar">${seg(t.fill, 'c-ok', 'Sẽ điền')}${seg(t.keep, 'c-lo', 'Giữ giá có sẵn')}${seg(t.none, 'c-na', 'Không điền')}</div>
        <div class="legend"><span><i class="c-ok"></i>Sẽ điền: ${t.fill}</span><span><i class="c-lo"></i>Giữ giá có sẵn: ${t.keep}</span><span><i class="c-na"></i>Không điền (QS định giá): ${t.none}</span></div>
        <p class="small muted">Cách chọn giá: ${esc(PICK[S.opt.pick].label)}. Chỉ điền khi nhóm tham khảo khớp mức "${esc(FIT[S.opt.minFit])}" trở lên và cùng đơn vị. Muốn tăng số dòng được điền: nạp thêm đơn giá bổ sung, hoặc chọn nhóm cho từng dòng trong ngăn chi tiết.</p></div>
      <div class="card"><h3>Dòng chưa có giá — QS cần định giá</h3>
        <div class="tbl-wrap"><table><thead><tr><th>Mô tả</th><th>ĐV</th><th class="num">KL</th><th>Lý do</th></tr></thead><tbody>
        ${todo.map(it => `<tr data-id="${esc(it.id)}" class="jump"><td>${esc(it.desc.slice(0, 70))}<div class="ctx">${esc(it.heads[it.heads.length - 1] || '')}</div></td><td>${esc(it.unit)}</td><td class="num">${fmtQ(it.qty)}</td><td class="small">${esc(it.c.why)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Mọi dòng đều đã có giá.</td></tr>'}
        </tbody></table></div></div>
    </div>
    <div class="card"><h3>Theo sheet</h3>${tbl(groupBy(it => it.sheet), 'Sheet')}</div>
    <div class="card"><h3>Theo hạng mục cấp 1</h3>${tbl(groupBy(it => `${it.sheet} · ${it.heads[0] || '(không có tiêu đề)'}`), 'Hạng mục')}</div>`;
  }

  /* ---------- Xuất: giá đề xuất vào CỘT RIÊNG tô màu (mặc định), hoặc điền vào ô Đơn giá đang trống ---------- */
  // Cột giá đề xuất của sheet: cột phần mềm đã thêm ở lần trước, nếu không thì cột trống đầu tiên bên phải bảng
  // (sau mọi ô có dữ liệu và mọi ô gộp từ dòng tiêu đề tới dòng hạng mục cuối)
  function propColumn(wb, sh, items) {
    const det = sh.det;
    if (det.cols.prop !== undefined) return { c: det.cols.prop, reuse: true };
    const last = Math.max(...items.map(it => it.r));
    let mx = Math.max(...Object.values(det.cols));
    for (let r = det.headerRow; r < sh.grid.length; r++) {   // cả phần dưới dòng hạng mục cuối: ô lạc ở cột ngoài cũng không bị ghi đè hay lẫn vào cột đề xuất
      const row = sh.grid[r] || [];
      for (let c = row.length - 1; c > mx; c--) if (row[c] !== null && row[c] !== undefined && row[c] !== '') { mx = c; break; }
    }
    const merges = wb.merges(sh.si).filter(m => m.r1 >= det.headerRow && m.r0 <= last);
    for (let grow = true; grow;) { grow = false; for (const m of merges) if (m.c0 <= mx + 1 && m.c1 > mx) { mx = m.c1; grow = true; } }
    return { c: mx + 1, reuse: false };
  }
  async function exportCol() {
    const wb = await XLSXIO.read(S.src.slice(0)), C = XLSXIO.colName, out = [];
    let written = 0; const skipped = [];
    for (const sh of S.sheets) {
      const items = S.items.filter(it => it.sh === sh);
      if (!items.length) continue;
      const det = sh.det, { c: pc, reuse } = propColumn(wb, sh, items), si = sh.si;
      const refCol = det.cols.rate ?? det.cols.amount ?? det.cols.qty ?? det.cols.unit ?? det.cols.desc;
      const two = det.dataStart > det.headerRow + 1;
      const hs = wb.style({ base: wb.styleOf(si, det.headerRow, refCol), bold: true, fill: PROP_HEAD_FILL, border: true, wrap: true });
      const label = PICK_SHORT[S.opt.pick] + (S.opt.factor !== 1 ? ` × ${fmtQ(S.opt.factor * 100)}%` : '');
      const cells = [{ r: det.headerRow, c: pc, v: two ? DXG.PROP_HEAD : `${DXG.PROP_HEAD} — ${label}`, s: hs, force: true }];
      if (two) cells.push({ r: det.headerRow + 1, c: pc, v: label, s: hs, force: true });
      let n = 0;
      for (const it of items) {
        const pr = it.c.fill && isNum(it.c.price) ? it.c.price : null;
        if (pr === null && !reuse) continue;   // không có đề xuất: để trống (lần xuất lại thì xóa đề xuất cũ)
        const vs = pr === null ? undefined : wb.style({ base: wb.styleOf(si, it.r, refCol), fill: PROP_FILL, numFmt: '#,##0', border: true });
        cells.push({ r: it.r, c: pc, v: pr, s: vs, force: true });
        if (pr !== null) n++;
      }
      const res = wb.fillValues(si, cells);
      wb.setColWidthRaw(si, pc, 18);
      written += n; skipped.push(...res.skipped.map(x => `${sh.name}!${x.ref} (${x.why})`));
      out.push(`${sh.name}: cột ${C(pc)} (${NF.format(n)} giá)`);
    }
    if (!written) { msg('Không có dòng nào có giá đề xuất.', 'err'); return { written, skipped }; }
    const blob = await wb.save();
    const name = S.fileName.replace(/\.(xlsx|xlsm)$/i, '') + '_DaDienGia' + (/\.xlsm$/i.test(S.fileName) ? '.xlsm' : '.xlsx');
    download(blob, name);
    S.lastExport = { written, skipped, cols: out };
    msg(`Đã ghi ${NF.format(written)} giá đề xuất vào cột riêng "${DXG.PROP_HEAD}" tô màu — ${out.join('; ')}. Cột Đơn giá và Thành tiền của BOQ giữ nguyên.${skipped.length ? ` Bỏ qua ${skipped.length} ô: ${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? '…' : ''}` : ''}`, 'ok');
    return { written, skipped };
  }
  async function exportXlsx() {
    if (S.opt.mode === 'col') return exportCol();
    const wb = await XLSXIO.read(S.src.slice(0)), bySheet = new Map(), C = XLSXIO.colName;
    const add = (si, cell) => { if (!bySheet.has(si)) bySheet.set(si, []); bySheet.get(si).push(cell); };
    let nAmt = 0;
    for (const it of S.items) {
      const c = it.c, cols = it.sh.det.cols;
      if (c.fill && isNum(c.price)) add(it.si, { r: it.r, c: cols.rate, v: c.price });
      // Thành tiền đang trống (không giá trị, không công thức) → công thức = KL × Đơn giá, kèm giá trị đệm
      if (S.opt.amount && isNum(c.price) && it.amountEmpty && cols.qty !== undefined && cols.rate !== undefined && isNum(it.qty)) {
        add(it.si, { r: it.r, c: cols.amount, f: `${C(cols.qty)}${it.r + 1}*${C(cols.rate)}${it.r + 1}`, v: Math.round(it.qty * c.price * 100) / 100 }); nAmt++;
      }
    }
    let written = 0; const skipped = [];
    for (const [si, cells] of bySheet) {
      const res = wb.fillValues(si, cells, { overwrite: S.opt.overwrite });
      written += res.written.length; skipped.push(...res.skipped.map(x => `${wb.sheets[si].name}!${x.ref} (${x.why})`));
    }
    if (!written) { msg('Không có ô nào được điền (không có dòng "Sẽ điền").', 'err'); return { written, skipped }; }
    const nRate = written - Math.min(nAmt, written);
    wb.setFullCalcOnLoad();   // để Thành tiền / Tổng cộng tính lại theo giá vừa điền khi mở file
    const blob = await wb.save();
    const name = S.fileName.replace(/\.(xlsx|xlsm)$/i, '') + '_DaDienGia' + (/\.xlsm$/i.test(S.fileName) ? '.xlsm' : '.xlsx');
    download(blob, name);
    S.lastExport = { written, skipped };
    msg(`Đã điền ${NF.format(nRate)} ô đơn giá${nAmt ? ` và ${NF.format(nAmt)} ô thành tiền (= KL × đơn giá)` : ''} vào "${name}".${skipped.length ? ` Bỏ qua ${skipped.length} ô: ${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? '…' : ''}` : ''}`, 'ok');
    return { written, skipped };
  }
  // Báo cáo kết quả: file Excel RIÊNG (không ghi vào BOQ) — dùng bộ ghi xlsx của app tra cứu
  function exportReport() {
    const FIT_T = { cao: 'Cao', tb: 'Trung bình', thap: 'Thấp', none: 'Không khớp' };
    const t = totals(S.items), o = S.opt, col = o.mode === 'col';
    const st = c => c.fill ? (col ? 'Có giá đề xuất' : 'Đã điền') : status(c) === 'keep' ? (col ? 'Chỉ có giá QS' : 'Giữ giá có sẵn') : 'Để trống — QS định giá';
    const sum = [['Chỉ tiêu', 'Giá trị'],
      ['File BOQ', S.fileName], ['Ghi giá vào', col ? `Cột riêng "${DXG.PROP_HEAD}" tô màu (cột Đơn giá giữ nguyên)` : 'Ô Đơn giá đang trống'], ['Cách chọn giá', PICK[o.pick].label], ['Đơn giá bổ sung', S.extra.length ? `${S.extra.length} giá` : 'không'],
      ['Dòng hạng mục', t.n], ['Sẽ điền / đã điền', t.fill], ['Giữ giá có sẵn', t.keep], ['Để trống — QS định giá', t.none],
      ['Tổng giá trị sau khi điền', Math.round(t.amt)], ['  trong đó phần điền mới', Math.round(t.amtFill)],
      ['Baseline phù hợp CSDL', t.blOk], ['Baseline cần xem', t.blXem], ['Baseline không phù hợp CSDL', t.blKo], ['Baseline chưa đối chiếu được', t.blNa],
      ['CSDL', `${NF.format(DBX.count)} đơn giá · giá quy về ${DBX.baseYear || 2026} · cập nhật ${DBX.built || ''}`], ['Lập lúc', new Date().toLocaleString('vi-VN', { hour12: false })]];
    const det = [['Sheet', 'Dòng', 'Mã', 'Mô tả', 'Tiêu đề gần nhất', 'ĐV', 'KL', 'Nhóm tham khảo CSDL', 'Độ phù hợp', 'Số BG', 'P10', 'P25', 'P50', 'P75', 'P90', col ? 'Giá đề xuất' : 'Đơn giá', 'Thành tiền', 'Trạng thái', 'Lý do', 'Ghi chú', 'Giá có sẵn trong BOQ', 'Nguồn báo giá', 'Baseline', 'Nguồn baseline', 'Baseline so với CSDL', 'Baseline so P50', 'Giá điền so baseline']];
    for (const it of S.items) {
      const c = it.c, g = c.shown ? IX.groups[c.cand.g] : null, R = c.ref;
      det.push([it.sheet, it.r + 1, it.code, it.desc, it.heads[it.heads.length - 1] || '', it.unit, it.qty, g ? g.name : '', c.cand ? FIT_T[c.fit.level] : '', g ? c.st.n : null,
        ...(R ? [R.p10, R.p25, R.p50, R.p75, R.p90].map(Math.round) : [null, null, null, null, null]), c.price, isNum(c.amt) ? Math.round(c.amt) : null, st(c), c.why, it.note, c.qs, g ? Object.entries(c.st.src || {}).map(([l, n]) => `${l} ${n}`).join(', ') : '',
        isNum(c.base) ? c.base : null, c.baseSrc, c.bv ? BL_EVAL[c.bv.level] : isNum(c.base) ? 'Chưa đối chiếu được' : '', c.bv ? pct(c.bv.d50) : '', c.dev && c.dev.pct !== null ? pct(c.dev.pct) : '']);
    }
    const q = auditTotals();
    sum.push(['Kiểm tra BOQ — đánh giá chung', q.verdict], ['Lỗi số học', q.err], ['Cảnh báo / lưu ý lập bảng', q.warn + q.info],
      ['Giá phù hợp thị trường', q.ok], ['Giá cần xem', q.xem], ['Giá cao quá', q.cao], ['Giá thấp quá', q.thap], ['Chênh do giá cao quá (theo P50 × KL)', Math.round(q.amtCao)], ['Chênh do giá thấp quá (theo P50 × KL)', Math.round(q.amtThap)]);
    const ar = [['Mức', 'Sheet', 'Dòng', 'Mô tả', 'Vấn đề', 'Đúng ra', 'BOQ ghi', 'Chênh lệch']];
    for (const x of S.audit || []) { const ln = S.lines.find(l => l.sheet === x.sheet && l.r === x.r); ar.push([SEV[x.sev], x.sheet, x.r + 1, (ln && ln.desc) || '', x.msg, isNum(x.expect) ? Math.round(x.expect) : null, isNum(x.actual) ? Math.round(x.actual) : null, isNum(x.diff) ? Math.round(x.diff) : null]); }
    const pr = [['Sheet', 'Dòng', 'Mã', 'Mô tả', 'ĐV', 'KL', 'Đơn giá BOQ', 'Nhóm CSDL', 'P10', 'P25', 'P50', 'P75', 'P90', 'Đánh giá', 'So P50', 'Chênh × KL (so P50)']];
    for (const it of S.items) { const c = it.c; if (!isNum(it.qs)) continue; const R = c.ref;
      pr.push([it.sheet, it.r + 1, it.code, it.desc, it.unit, it.qty, it.qs, c.shown ? IX.groups[c.cand.g].name : '', ...(R ? [R.p10, R.p25, R.p50, R.p75, R.p90].map(Math.round) : [null, null, null, null, null]), c.pv ? PV_EVAL[c.pv.level] : 'Chưa đối chiếu được', c.pv ? pct(c.pv.d50) : '', isNum(c.pvAmt) ? Math.round(c.pvAmt) : null]); }
    const blob = window.writeWorkbook([
      { name: 'Tóm tắt', rows: sum, widths: [36, 70], nums: new Set([1]) },
      ...(q.priced ? [{ name: 'Kiểm tra số học', rows: ar, widths: [10, 14, 6, 48, 60, 15, 15, 15], nums: new Set([5, 6, 7]) },
        { name: 'Kiểm tra giá', rows: pr, widths: [14, 6, 6, 48, 7, 10, 14, 38, 11, 11, 11, 11, 11, 16, 10, 16], nums: new Set([6, 8, 9, 10, 11, 12, 15]) }] : []),
      { name: 'Chi tiết', rows: det, widths: [14, 6, 6, 48, 30, 7, 10, 38, 11, 7, 11, 11, 11, 11, 11, 12, 15, 20, 38, 30, 14, 26, 14, 14, 22, 12, 14], nums: new Set([10, 11, 12, 13, 14, 15, 16, 20, 22]) },
    ]);
    download(blob, S.fileName.replace(/\.(xlsx|xlsm)$/i, '') + '_BaoCaoDienGia.xlsx');
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
      dinh_dang: 'DGBQ3', file: S.fileName, at: new Date().toISOString(),
      opt: { ...o, types: [...o.types], provs: [...o.provs], srcOff: [...o.srcOff] }, baseName: S.baseName, baseList: S.baseList,
      extra: S.extra.map(({ code, desc, ctx, unit, price, sheet }) => ({ code, desc, ctx, unit, price, sheet })),
      items: S.items.filter(it => (it.cands[it.sel] && it.cands[it.sel].picked) || (it.sel < 0 && it.cands.length) || isNum(it.manual) || isNum(it.baseManual) || it.skip || it.note)
        .map(it => ({ id: it.id, gkey: it.sel >= 0 ? IX.groups[it.cands[it.sel].g].key : null, picked: !!(it.cands[it.sel] && it.cands[it.sel].picked), manual: it.manual, baseManual: it.baseManual, skip: it.skip, note: it.note,
          d: it.desc, u: it.unit, n: it.heads[it.heads.length - 1] || '', gn: it.sel >= 0 ? IX.groups[it.cands[it.sel].g].name : null, gu: it.sel >= 0 ? IX.groups[it.cands[it.sel].g].unit : null,
          auto: it.auto >= 0 && it.sel >= 0 && it.auto !== it.cands[it.sel].g ? gref(it.auto) : null })),
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
    onFile('#f-boq', loadBoq); onFile('#f-extra', loadExtra); onFile('#f-base', loadBase); onFile('#f-sess', loadSession);
    $('#map-tbl').addEventListener('change', onMapChange);
    $('#go').addEventListener('click', runAll);
    for (const id of ['#o-pool', '#o-mode', '#o-pick', '#o-minfit', '#o-round', '#o-overwrite', '#o-amount', '#o-yfrom', '#o-yto', '#o-factor', '#o-tol', '#o-review', '#o-outlier', '#o-warn']) $(id).addEventListener('change', recompute);
    $('#flt').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setFilter(b.dataset.f); });
    $('#kpis').addEventListener('click', e => { const k = e.target.closest('.kpi[data-f]'); if (!k) return; if (k.dataset.f === 'audit') return switchTab('audit'); switchTab('lines'); setFilter(k.dataset.f); });
    let tq; $('#flt-q').addEventListener('input', e => { clearTimeout(tq); tq = setTimeout(() => { S.view.q = e.target.value; S.view.shown = PAGE; renderTable(); }, 200); });
    $('#more').addEventListener('click', () => { S.view.shown += PAGE; renderTable(); });
    $('#res-tbl').addEventListener('click', e => { const tr = e.target.closest('tr[data-id]'); if (tr) openDrawer(S.items.find(it => it.id === tr.dataset.id)); });
    $('#tab-sum').addEventListener('click', e => { const tr = e.target.closest('tr[data-id]'); if (tr) openDrawer(S.items.find(it => it.id === tr.dataset.id)); });
    $('#tab-audit').addEventListener('click', e => { const tr = e.target.closest('tr[data-id]'); if (tr) openDrawer(S.items.find(it => it.id === tr.dataset.id)); });
    $('#dw-close').addEventListener('click', closeDrawer);
    $('#dw-body').addEventListener('click', drawerAction);
    $('#dw-body').addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      if (e.target.id === 'dw-q') { e.preventDefault(); drawerSearch(S.view.cur); }
      else if (e.target.id === 'dw-manual' || e.target.id === 'dw-base') { e.preventDefault(); drawerAction({ target: { dataset: { do: 'apply' }, closest: () => null } }); }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.view.cur) closeDrawer(); });
    $$('.tab').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
    $('#save-sess').addEventListener('click', saveSession);
    $('#save-learn').addEventListener('click', saveLearn);
    $('#dx-report').addEventListener('click', () => { try { exportReport(); } catch (ex) { console.error(ex); msg('Không xuất được báo cáo: ' + (ex.message || ex), 'err'); } });
    $('#dx-export').addEventListener('click', async () => {
      const btn = $('#dx-export'); btn.disabled = true; btn.textContent = 'Đang điền giá…';
      try { await exportXlsx(); } catch (ex) { console.error(ex); msg('Không xuất được file: ' + (ex.message || ex), 'err'); }
      btn.disabled = false; btn.textContent = 'Xuất Excel đã điền giá';
      $('#load-msg').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
  function renderTab() { if (S.view.tab === 'lines') renderTable(); else if (S.view.tab === 'audit') renderAudit(); else renderSummary(); }
  function setFilter(f) { S.view.f = f; S.view.shown = PAGE; $$('#flt button').forEach(b => b.classList.toggle('on', b.dataset.f === f)); renderTable(); }
  function switchTab(t) {
    S.view.tab = t; $$('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    $('#tab-lines').hidden = t !== 'lines'; $('#tab-sum').hidden = t !== 'sum'; $('#tab-audit').hidden = t !== 'audit';
    if (S.items.length && S.items[0].c) renderTab();
  }

  // Cho kiểm thử tự động
  window.__DXG_STATE = S;
  boot();
})();
