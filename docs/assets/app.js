'use strict';
/* Tra cứu đơn giá BOQ — chạy hoàn toàn offline trên dữ liệu data/db.js (tạo bởi build_data.py) */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const NF = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
const fmt = v => (v === null || v === undefined || v === '') ? '' : NF.format(v);
const esc = s => s === null || s === undefined ? '' : String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PAGE = 50;

/* ---------- Chuẩn hóa tiếng Việt ---------- */
function norm(s) {
  if (!s) return '';
  return String(s).toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/([a-z])(\d)/g, '$1 $2').replace(/(\d)([a-z])/g, '$1 $2')
    .trim();
}

let DB, C, D, N;
// Chạy trong phần mềm Windows: dữ liệu nạp qua kênh bảo mật (window.SECURE), quyền admin / nhan_vien
const ROLE = (window.SECURE && window.SECURE.role) || 'admin';
// Bộ dữ liệu: 'noibo' (mặc định) hoặc 'doithu' (đơn giá đối thủ — độc lập, chỉ admin, chỉ tra cứu)
const DS = new URLSearchParams(location.search).get('ds') === 'doithu' ? 'doithu' : 'noibo';
if (DS === 'doithu' && ROLE !== 'admin') location.replace('index.html');
let nameNorm, docNorm;          // chuỗi đã chuẩn hóa theo dòng
let vocab, postings;            // chỉ mục đảo: từ -> Int32Array(dòng*4 + trường)
let parVocab, parPost, parRows; // chỉ mục "Hạng mục cha"
const FW = [1, 0.9, 0.55];      // trọng số trường: tên, mô tả gốc, thông số
let FACETS = [];
const state = { q: '', sort: 'rel', pmin: null, pmax: null, par: false, split: false, nowarn: false };
let result = { ids: new Int32Array(0), score: null, matched: new Set(), partial: false, groups: null };

/* ---------- Nạp dữ liệu ---------- */
function boot() {
  if (window.SECURE) {
    $('#splash-msg').textContent = 'Đang giải mã dữ liệu…';
    window.SECURE.load(DS === 'doithu' ? 'doithu' : 'db').then(txt => { window.DB = JSON.parse(txt); $('#splash-msg').textContent = 'Đang lập chỉ mục tìm kiếm…'; setTimeout(init, 30); })
      .catch(e => { $('#splash-msg').textContent = 'Không mở được dữ liệu'; $('#splash-err').textContent = String(e && e.message || e); $('.bar').hidden = true; });
    return;
  }
  const s = document.createElement('script');
  s.src = DS === 'doithu' ? 'data/doithu.js' : 'data/db.js';
  s.onload = () => { if (DS === 'doithu') window.DB = window.DT; $('#splash-msg').textContent = 'Đang lập chỉ mục tìm kiếm…'; setTimeout(init, 30); };
  s.onerror = () => {
    $('#splash-msg').textContent = 'Không tìm thấy data/db.js';
    $('#splash-err').innerHTML = 'Hãy chạy <code>python build_data.py</code> trong thư mục WEB rồi mở lại trang.';
    $('.bar').hidden = true;
  };
  document.body.appendChild(s);
}

function init() {
  const t0 = performance.now();
  DB = window.DB; C = DB.cols; D = DB.dicts; N = DB.count;
  buildIndex();
  buildFacets();
  if (DS === 'doithu') setupDoiThu();
  $('#db-meta').textContent = `${NF.format(N)} đơn giá · ${NF.format(D.p.length)} dự án · ${NF.format(D.f.length)} file nguồn · cập nhật ${DB.built}`;
  buildGroupIndex();
  const sec = readHash();
  bindUI();
  run();
  $('#splash').remove();
  showSection(sec);
  console.log(`Khởi tạo ${Math.round(performance.now() - t0)} ms, ${vocab.length} từ trong chỉ mục`);
}

function buildIndex() {
  const map = new Map();
  nameNorm = new Array(N); docNorm = new Array(N);
  const add = (text, i, f) => {
    const n = norm(text);
    if (!n) return '';
    const v = i * 4 + f;
    for (const t of n.split(' ')) {
      let a = map.get(t);
      if (!a) map.set(t, a = []);
      if (a[a.length - 1] !== v) a.push(v);
    }
    return n;
  };
  for (let i = 0; i < N; i++) {
    const a = add(C.name[i], i, 0), c = add(C.spec[i], i, 2), b = '';
    nameNorm[i] = a; docNorm[i] = a + ' | ' + b + ' | ' + c;
  }
  vocab = [...map.keys()].sort();
  postings = vocab.map(t => Int32Array.from(map.get(t)));

  // Hạng mục cha: chỉ mục trên từ điển, rồi ánh xạ về dòng
  const pm = new Map();
  D.par.forEach((p, pi) => { for (const t of new Set(norm(p).split(' '))) if (t) { let a = pm.get(t); if (!a) pm.set(t, a = []); a.push(pi); } });
  parVocab = [...pm.keys()].sort();
  parPost = parVocab.map(t => pm.get(t));
  const cnt = new Int32Array(D.par.length);
  for (let i = 0; i < N; i++) if (C.par[i] >= 0) cnt[C.par[i]]++;
  parRows = Array.from(cnt, c => new Int32Array(c));
  cnt.fill(0);
  for (let i = 0; i < N; i++) { const p = C.par[i]; if (p >= 0) parRows[p][cnt[p]++] = i; }
}

/* ---------- Tìm kiếm mờ ---------- */
function lowerBound(arr, x) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; } return lo; }

function editDist(a, b, max) { // Damerau (OSA) có ngưỡng
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  let prev2 = null, prev = new Array(lb + 1), cur = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    cur[0] = i; let rowMin = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v; if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    const t = prev2 || new Array(lb + 1); prev2 = prev; prev = cur; cur = t;
  }
  return prev[lb];
}

const expCache = new Map();
function expand(qt, voc, fuzzy = true) { // -> [[chỉ số từ, điểm]]
  const key = (voc === vocab ? 'v' : 'p') + (fuzzy ? 1 : 0) + qt;
  if (expCache.has(key)) return expCache.get(key);
  const out = [], seen = new Set();
  let k = lowerBound(voc, qt);
  if (voc[k] === qt) { out.push([k, 1]); seen.add(k); }
  const hasDigit = /\d/.test(qt);
  if (qt.length >= 2 && !(hasDigit && qt.length < 3)) {
    for (let j = k; j < voc.length && voc[j].startsWith(qt); j++) {
      if (seen.has(j)) continue;
      const w = voc[j];
      if (hasDigit && /^\d/.test(qt) && /\d/.test(w.slice(qt.length, qt.length + 1))) continue; // "16" không khớp "160"
      out.push([j, Math.max(0.6, 0.88 - 0.03 * (w.length - qt.length))]); seen.add(j);
    }
  }
  // Mờ: khi từ không có trong từ điển (gõ sai) hoặc từ dài
  if (fuzzy && !hasDigit && (qt.length >= 6 || (qt.length >= 3 && voc[k] !== qt))) {
    const max = qt.length >= 8 ? 2 : 1;
    for (let j = 0; j < voc.length; j++) {
      if (seen.has(j)) continue;
      const w = voc[j];
      if (Math.abs(w.length - qt.length) > max || w.charCodeAt(0) > 122 || /\d/.test(w)) continue;
      const d = editDist(qt, w, max);
      if (d <= max) { out.push([j, d === 1 ? 0.62 : 0.42]); seen.add(j); }
    }
  }
  expCache.set(key, out);
  if (expCache.size > 500) expCache.delete(expCache.keys().next().value);
  return out;
}

function parseQuery(q) {
  const phrases = [], excl = [], pos = [];
  q = q.replace(/"([^"]+)"/g, (_, p) => { const n = norm(p); if (n) { phrases.push(n); pos.push(...n.split(' ')); } return ' '; });
  for (const part of q.split(/\s+/)) {
    if (!part) continue;
    if (part.startsWith('-') && part.length > 1) { const n = norm(part.slice(1)); if (n) excl.push(...n.split(' ')); }
    else { const n = norm(part); if (n) pos.push(...n.split(' ')); }
  }
  return { pos: [...new Set(pos)], excl, phrases };
}

function search(q = state.q) {
  const { pos, excl, phrases } = parseQuery(q);
  const matched = new Set();
  if (!pos.length && !excl.length) return { ids: null, score: null, matched, partial: false };
  const total = new Float32Array(N), hits = new Uint8Array(N), tok = new Float32Array(N);
  for (const qt of pos) {
    tok.fill(0);
    for (const [vi, s] of expand(qt, vocab)) {
      matched.add(vocab[vi]);
      const p = postings[vi];
      for (let k = 0; k < p.length; k++) { const r = p[k] >> 2, sc = s * FW[p[k] & 3]; if (sc > tok[r]) tok[r] = sc; }
    }
    if (state.par) for (const [vi, s] of expand(qt, parVocab)) {
      const sc = s * 0.35;
      for (const pi of parPost[vi]) { const rows = parRows[pi]; for (let k = 0; k < rows.length; k++) if (sc > tok[rows[k]]) tok[rows[k]] = sc; }
    }
    for (let i = 0; i < N; i++) if (tok[i] > 0) { total[i] += tok[i]; hits[i]++; }
  }
  const ban = new Uint8Array(N);
  for (const et of excl) for (const [vi] of expand(et, vocab, false)) { const p = postings[vi]; for (let k = 0; k < p.length; k++) ban[p[k] >> 2] = 1; }

  const phrase = pos.join(' ');
  const collect = need => {
    const ids = [];
    for (let i = 0; i < N; i++) {
      if (ban[i] || hits[i] < need) continue;
      if (!pos.length) { ids.push(i); continue; }
      if (phrases.length && !phrases.every(p => docNorm[i].includes(p))) continue;
      ids.push(i);
    }
    return ids;
  };
  let ids = collect(pos.length), partial = false;
  if (!ids.length && pos.length > 1) { ids = collect(Math.max(1, Math.ceil(pos.length * 0.6))); partial = ids.length > 0; }
  for (const i of ids) {
    const nn = nameNorm[i];
    let s = total[i];
    if (pos.length > 1 && nn.includes(phrase)) s += 1.5;
    else if (pos.length > 1 && docNorm[i].includes(phrase)) s += 0.8;
    if (nn.startsWith(phrase)) s += 0.5;
    s += Math.log10((C.dup[i] || 1) + 1) * 0.15 + ((C.y[i] || 2011) - 2011) * 0.004 - Math.min(nn.length, 400) * 0.0025;
    total[i] = s;
  }
  return { ids: Int32Array.from(ids), score: total, matched, partial, phrase };
}

/* ---------- Bộ lọc (facet) ---------- */
function buildFacets() {
  const UNK = '(Không xác định)';
  const P = DB.projects; // [code, name, type, prov, prov25, owner]
  const fromDict = (col, dict) => ({ labels: [...dict, UNK], code: i => col[i] < 0 ? dict.length : col[i] });
  const derived = (fn) => { // facet suy ra theo dự án
    const labels = [], idx = new Map();
    const pmap = P.map(p => { const v = fn(p) || UNK; if (!idx.has(v)) { idx.set(v, labels.length); labels.push(v); } return idx.get(v); });
    return { labels, code: i => pmap[C.p[i]] };
  };
  const years = [...new Set(C.y.filter(v => v))].sort((a, b) => b - a);
  const yIdx = new Map(years.map((y, k) => [y, k]));

  const nrm = DB.nrm2;
  FACETS = [
    { key: 'nrm', label: 'Nhóm công việc NRM2', open: true, sort: 'label', limit: 40,
      labels: [...nrm.map(n => `${n[0]} · ${n[1]}`), UNK], group: [...nrm.map(n => n[2]), ''],
      code: i => C.n[i] < 0 ? nrm.length : C.n[i] },
    { key: 'w', label: 'Loại công việc', search: true, ...fromDict(C.w, D.w) },
    { key: 'e', label: 'Cấu kiện', ...fromDict(C.e, D.e) },
    { key: 'u', label: 'Đơn vị', search: true, ...fromDict(C.u, D.u) },
    { key: 'y', label: 'Năm báo giá', open: true, sort: 'label', limit: 20, labels: [...years.map(String), UNK], code: i => C.y[i] ? yIdx.get(C.y[i]) : years.length },
    { key: 'type', label: 'Loại hình dự án', ...derived(p => p[2]) },
    { key: 'prov25', label: 'Tỉnh/TP (sau sáp nhập 2025)', search: true, ...derived(p => p[4]) },
    { key: 'prov', label: 'Tỉnh/TP (trước sáp nhập)', search: true, ...derived(p => p[3]) },
    { key: 'p', label: 'Dự án', search: true, labels: [...P.map(p => p[1] && p[1] !== p[0] ? `${p[1]} (${p[0]})` : p[0]), UNK], code: i => C.p[i] < 0 ? P.length : C.p[i] },
    { key: 'c', label: 'Nhà thầu / NCC', ...fromDict(C.c, D.c) },
    { key: 'warn', label: 'Cảnh báo giá', labels: [...D.warn, 'Bình thường'], code: i => C.warn[i] < 0 ? D.warn.length : C.warn[i] },
    { key: 'chk', label: 'Kiểm tra KL×ĐG', ...fromDict(C.chk, D.chk) },
    { key: 'cur', label: 'Tiền tệ', ...fromDict(C.cur, D.cur) },
    { key: 'f', label: 'File nguồn', search: true, ...fromDict(C.f, D.f) },
  ];
  if (C.st) FACETS.splice(0, 0, { key: 'st', label: 'Trạng thái làm sạch', open: true, ...fromDict(C.st, D.st) });
  if (C.ol) FACETS.splice(FACETS.findIndex(f => f.key === 'warn') + 1, 0, { key: 'ol', label: 'Phân loại ngoại lai', labels: [...D.ol, '(Không)'], code: i => C.ol[i] < 0 ? D.ol.length : C.ol[i] });
  if (C.vt) FACETS.splice(FACETS.findIndex(f => f.key === 'u') + 1, 0, { key: 'vt', label: 'Vật tư chuẩn hóa (thép)', search: true, ...fromDict(C.vt, D.vt) });
  for (const f of FACETS) {
    const arr = new Int32Array(N);
    for (let i = 0; i < N; i++) arr[i] = f.code(i);
    f.codes = arr; f.sel = new Set(); f.counts = new Int32Array(f.labels.length);
    f.expanded = false; f.filter = '';
    const total = new Int32Array(f.labels.length); for (let i = 0; i < N; i++) total[arr[i]]++;
    f.total = total;
  }
  // Ẩn facet chỉ có 1 giá trị
  FACETS = FACETS.filter(f => f.total.filter(c => c > 0).length > 1 && !(ROLE === 'nhan_vien' && ['p', 'c', 'f', 'st'].includes(f.key)));
  FACETS.forEach((f, k) => f.idx = k);
}

function applyFilters(base) {
  const act = FACETS.filter(f => f.sel.size);
  const nf = FACETS.length;
  FACETS.forEach(f => f.counts.fill(0));
  const out = [];
  const { pmin, pmax, split, nowarn } = state;
  const selArr = act.map(f => { const m = new Uint8Array(f.labels.length); f.sel.forEach(v => m[v] = 1); return m; });
  const loop = i => {
    const t = C.tot[i];
    if (pmin !== null && !(t >= pmin)) return;
    if (pmax !== null && !(t <= pmax)) return;
    if (split && C.mat[i] === null && C.lab[i] === null) return;
    if (nowarn && C.warn[i] >= 0) return;
    let fails = 0, failF = -1;
    for (let a = 0; a < act.length; a++) if (!selArr[a][act[a].codes[i]]) { fails++; failF = act[a].idx; if (fails > 1) return; }
    if (fails === 0) { out.push(i); for (let k = 0; k < nf; k++) FACETS[k].counts[FACETS[k].codes[i]]++; }
    else FACETS[failF].counts[FACETS[failF].codes[i]]++;
  };
  if (base) for (let k = 0; k < base.length; k++) loop(base[k]);
  else for (let i = 0; i < N; i++) loop(i);
  return out;
}


/* ---------- Nhóm đại diện ---------- */
const GROUP_BATCH = 40, DETAIL_BATCH = 30;
let G_ROWS = null, G_NAME = null, G_UNIT = null;   // theo mã nhóm (chỉ số từ điển D.g)
function buildGroupIndex() {
  const ng = D.g ? D.g.length : 0;
  const cnt = new Int32Array(ng);
  for (let i = 0; i < N; i++) if (C.g[i] >= 0) cnt[C.g[i]]++;
  G_ROWS = Array.from(cnt, c => new Int32Array(c));
  cnt.fill(0);
  G_NAME = new Array(ng); G_UNIT = new Array(ng);
  for (let i = 0; i < N; i++) {
    const g = C.g[i]; if (g < 0) continue;
    G_ROWS[g][cnt[g]++] = i;
    if (G_NAME[g] === undefined) { G_NAME[g] = C.gn[i] >= 0 ? D.gn[C.gn[i]] : C.name[i]; G_UNIT[g] = C.cu[i] >= 0 ? D.cu[C.cu[i]] : unitOf(i); }
  }
}
const p26 = i => (C.p26 && C.p26[i] !== null && C.p26[i] !== undefined) ? C.p26[i] : (C.cp ? C.cp[i] : C.tot[i]);
function qtile(sorted, p) { if (!sorted.length) return null; const x = (sorted.length - 1) * p, lo = Math.floor(x), hi = Math.ceil(x); return sorted[lo] + (sorted[hi] - sorted[lo]) * (x - lo); }
function groupStats(ids) {
  const v = Float64Array.from(ids, p26).sort();
  const proj = new Set(), names = new Set();
  let ly = 0, sum = 0;
  for (const i of ids) { proj.add(C.p[i]); names.add(C.name[i]); if ((C.y[i] || 0) > ly) ly = C.y[i]; }
  for (const x of v) sum += x;
  return { n: v.length, med: qtile(v, .5), p10: qtile(v, .1), p25: qtile(v, .25), p75: qtile(v, .75), p90: qtile(v, .9),
    min: v[0], max: v[v.length - 1], mean: sum / (v.length || 1), proj: proj.size, latest: ly, variants: names.size };
}
function aggregate(ids, score, phrase = '') {
  const rq = state.q.toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim(), rawQ = /[^ -]/.test(rq) ? rq : '';
  const m = new Map();
  for (const i of ids) {
    const g = C.g[i] >= 0 ? C.g[i] : -1 - i;   // dòng chưa có nhóm → nhóm riêng
    let e = m.get(g);
    if (!e) m.set(g, e = { g, ids: [], score: -1e9 });
    e.ids.push(i);
    if (score && score[i] > e.score) e.score = score[i];
  }
  const out = [...m.values()];
  for (const e of out) {
    e.st = groupStats(e.ids);
    e.name = e.g >= 0 ? G_NAME[e.g] : C.name[e.ids[0]];
    e.unit = e.g >= 0 ? G_UNIT[e.g] : unitOf(e.ids[0]);
    if (score) {   // xếp hạng nhóm: điểm dòng tốt nhất + tên đại diện khớp cụm từ + độ phổ biến (số dự án)
      const nn = norm(e.name);
      if (rawQ && e.name.toLowerCase().normalize('NFC').includes(rawQ)) e.score += 1.5;   // gõ có dấu: khớp đúng dấu được ưu tiên
      e.score += (phrase && nn.includes(phrase) ? 1.2 : 0) + (phrase && nn.startsWith(phrase) ? 0.4 : 0) + 0.35 * Math.log10(1 + e.st.proj);
    }
  }
  return out;
}
function sortGroups(gs, hasQ) {
  const s = state.sort === 'rel' && !hasQ ? 'proj' : state.sort;
  const cmp = {
    rel: (a, b) => b.score - a.score || b.st.proj - a.st.proj,
    proj: (a, b) => b.st.proj - a.st.proj || b.st.n - a.st.n,
    new: (a, b) => b.st.latest - a.st.latest || b.st.proj - a.st.proj,
    pasc: (a, b) => a.st.med - b.st.med,
    pdesc: (a, b) => b.st.med - a.st.med,
  }[s] || ((a, b) => b.st.proj - a.st.proj);
  return gs.sort(cmp);
}

/* ---------- Chạy ---------- */
let lastSearchQ = null, lastSearch = null;
function run() {
  const key = state.q + '|' + state.par;
  if (key !== lastSearchQ) { lastSearch = search(state.q); lastSearchQ = key; }
  const s = lastSearch;
  const ids = applyFilters(s.ids);
  const hasQ = !!s.ids;
  result = { ids, score: s.score, matched: s.matched, partial: s.partial, hasQ, groups: sortGroups(aggregate(ids, s.score, s.phrase), hasQ), shown: 0, open: new Set() };
  renderSearch();
  writeHash();
}

/* ---------- Hiển thị: Tra cứu ---------- */
function hl(text) {
  if (!text) return '';
  if (!result.matched || !result.matched.size) return esc(text);
  let out = '', last = 0;
  for (const m of text.matchAll(/[\p{L}\p{N}]+/gu)) {
    const parts = norm(m[0]).split(' ').filter(Boolean);
    const hit = parts.length && parts.every(p => result.matched.has(p));
    out += esc(text.slice(last, m.index)) + (hit ? `<mark>${esc(m[0])}</mark>` : esc(m[0]));
    last = m.index + m[0].length;
  }
  return out + esc(text.slice(last));
}
const projOf = i => DB.projects[C.p[i]] || [];
const unitOf = i => C.u[i] >= 0 ? D.u[C.u[i]] : '';
const curOf = i => C.cur[i] >= 0 ? D.cur[C.cur[i]] : '';
const nrmOf = i => DB.nrm2[C.n[i]] || ['', '', ''];
function flags(i) {
  let s = '';
  if (C.st && C.st[i] >= 0 && D.st[C.st[i]] === 'REVIEW') s += `<span class="tag lo" title="${esc(C.why && C.why[i] || '')}">REVIEW</span> `;
  if (C.warn[i] >= 0) { const w = D.warn[C.warn[i]]; s += `<span class="tag ${w.startsWith('Cao') ? 'hi' : 'lo'}" title="${esc(w)} so với nhóm rộng">${w.startsWith('Cao') ? '▲' : '▼'}</span>`; }
  return s;
}
const money = v => v === null || v === undefined ? '–' : NF0.format(Math.round(v));
const NF0 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });

function renderSearch() {
  const gs = result.groups;
  $('#count').innerHTML = `<b>${NF.format(gs.length)}</b> nhóm · ${NF.format(result.ids.length)} dòng đơn giá` + (result.hasQ ? ` cho “${esc(state.q)}”` : '');
  $('#notice').hidden = !result.partial;
  if (result.partial) $('#notice').textContent = 'Không có dòng nào khớp đủ mọi từ khóa — đang hiển thị kết quả gần đúng.';
  $('#sort').value = state.sort;
  renderChips();
  renderFacets();
  const ex = ['bê tông lót móng', 'cốt thép cột', 'ván khuôn sàn', 'trát tường ngoài', 'sơn nước ngoài nhà', 'trần thạch cao', 'chống thấm sàn vệ sinh', 'đào đất móng'];
  $('#quick').innerHTML = (!result.hasQ && !FACETS.some(f => f.sel.size)) ?
    `<div class="suggest"><span class="muted">Gợi ý:</span>${ex.map(e => `<button data-ex="${esc(e)}">${esc(e)}</button>`).join('')}</div>` : '';
  const box = $('#results');
  if (!gs.length) { box.innerHTML = `<div class="empty">Không tìm thấy đơn giá phù hợp.<br><span class="small">Thử bỏ bớt bộ lọc hoặc dùng ít từ khóa hơn.</span></div>`; return; }
  box.innerHTML = `<div class="glist-h"><span>Nhóm đại diện</span><span>ĐV</span><span class="num">Đơn giá đại diện</span><span class="num">Khoảng phổ biến (P25–P75)</span></div><div id="glist"></div><div id="sentinel"></div>`;
  appendGroups();
}
function groupRow(e, k) {
  const s = e.st;
  return `<div class="grp" data-k="${k}">
    <div class="grp-h" role="button" tabindex="0"><span class="caret">▸</span>
      <span class="gname">${hl(e.name)}</span>
      <span class="gunit">${esc(e.unit)}</span>
      <span class="gprice num">${money(s.med)}</span>
      <span class="grange num">${s.n > 1 ? `${money(s.p25)} – ${money(s.p75)}` : '<span class="muted">1 báo giá</span>'}${s.n > 1 && s.p10 > 0 ? CH.rangeMini(s.p10, s.p25, s.med, s.p75, s.p90, 90) : ''}</span>
    </div><div class="grp-b" hidden></div></div>`;
}
function appendGroups() {
  const gs = result.groups, from = result.shown, to = Math.min(gs.length, from + GROUP_BATCH);
  if (from >= to) return;
  $('#glist').insertAdjacentHTML('beforeend', gs.slice(from, to).map((e, j) => groupRow(e, from + j)).join(''));
  result.shown = to;
}
let observer = null;
function setupLazy() {
  observer = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting) && !$('#sec-search').hidden) appendGroups(); }, { rootMargin: '600px' });
  const watch = () => { const s = $('#sentinel'); if (s) observer.observe(s); };
  new MutationObserver(watch).observe($('#results'), { childList: true });
  watch();
}
function toggleGroup(el) {
  const k = +el.dataset.k, e = result.groups[k], body = $('.grp-b', el);
  const open = body.hidden;
  body.hidden = !open; el.classList.toggle('open', open);
  if (open && !body.dataset.ready) { body.dataset.ready = 1; body.innerHTML = groupBody(e); e.detailShown = 0; appendDetails(el, e); }
}
function groupBody(e) {
  const s = e.st;
  const chip = (k, v) => `<span class="gs"><i>${k}</i> ${v}</span>`;
  return `<div class="gsum">${chip('Đại diện', `<b>${money(s.med)}</b>`)}${chip('Trung bình', money(s.mean))}${chip('Phổ biến', `${money(s.p25)} – ${money(s.p75)}`)}${chip('Thấp – cao', `${money(s.min)} – ${money(s.max)}`)}${chip('Báo giá', NF.format(s.n))}${chip('Dự án', s.proj)}${chip('Mới nhất', s.latest)}${s.variants > 1 ? chip('Tên biến thể', s.variants) : ''}
    ${e.g >= 0 ? `<button class="link" data-drop="${e.g}">Xem điểm rơi giá →</button>` : ''}</div>
    <div class="small muted" style="margin:4px 0 6px">Giá quy về mặt bằng ${DB.baseYear || 2026}; tính trên các dòng đang lọc. Bấm 1 dòng để xem đủ thông tin.</div>
    <div class="tbl-wrap"><table class="dtl"><thead><tr><th class="num">Năm</th><th>Dự án</th><th>Tên công việc (gốc trong BOQ)</th><th class="num">Đơn giá gốc</th></tr></thead><tbody></tbody></table></div>
    <div class="dmore"></div>`;
}
function appendDetails(el, e) {
  if (!e.sorted) e.sorted = [...e.ids].sort((a, b) => (C.y[b] || 0) - (C.y[a] || 0) || p26(a) - p26(b));
  const from = e.detailShown, to = Math.min(e.sorted.length, from + DETAIL_BATCH);
  $('tbody', el).insertAdjacentHTML('beforeend', e.sorted.slice(from, to).map(i => {
    const p = projOf(i), loc = C.loc && C.loc[i] >= 0 ? D.loc[C.loc[i]] : '';
    if (ROLE === 'nhan_vien') p[1] = p[2] || '';   // không hiện mã/tên dự án cho nhân viên
    const adj = p26(i), base = C.cp ? C.cp[i] : C.tot[i];
    return `<tr data-row="${i}"><td class="num">${C.y[i] || ''}</td><td>${esc(p[1] || '')}<div class="price-sub">${esc(p[4] || p[3] || '')}</div></td>
      <td>${hl(C.name[i])}${loc ? `<div class="price-sub">@ ${esc(loc)}</div>` : ''}</td>
      <td class="num"><b>${fmt(C.tot[i])}</b> <span class="small muted">/${esc(unitOf(i))}</span> ${flags(i)}${Math.abs(adj - base) > 0.5 || unitOf(i) !== e.unit ? `<div class="price-sub">≈ ${money(adj)} /${esc(e.unit)} (${DB.baseYear || 2026})</div>` : ''}</td></tr>`;
  }).join(''));
  e.detailShown = to;
  $('.dmore', el).innerHTML = to < e.sorted.length ? `<button class="link" data-more-d="1">Xem thêm ${Math.min(DETAIL_BATCH, e.sorted.length - to)} / còn ${e.sorted.length - to} dòng</button>` : '';
}

function renderChips() {
  const chips = [];
  if (state.q) chips.push(['q', '', 'Từ khóa', state.q]);
  for (const f of FACETS) for (const v of f.sel) chips.push(['f', f.key + ':' + v, f.label, f.labels[v]]);
  if (state.pmin !== null) chips.push(['pmin', '', 'Giá từ', fmt(state.pmin)]);
  if (state.pmax !== null) chips.push(['pmax', '', 'Giá đến', fmt(state.pmax)]);
  if (state.split) chips.push(['split', '', '', 'Có tách VL/NC']);
  if (state.nowarn) chips.push(['nowarn', '', '', 'Ẩn giá bất thường']);
  if (state.par) chips.push(['par', '', '', 'Tìm cả hạng mục cha']);
  $('#chips').innerHTML = chips.map(([t, v, k, l]) =>
    `<span class="chip">${k ? `<i>${esc(k)}:</i>` : ''}<span title="${esc(l)}">${esc(l)}</span><button data-chip="${t}" data-v="${esc(v)}" title="Bỏ lọc">✕</button></span>`).join('');
}
const PRIMARY = ['nrm', 'u', 'y', 'type', 'prov25'];
function facetHtml(f, openState) {
  const open = f.key in openState ? openState[f.key] : (PRIMARY.includes(f.key) ? !!f.open : false) || f.sel.size > 0;
  let items = f.labels.map((l, v) => v).filter(v => f.counts[v] > 0 || f.sel.has(v));
  const flt = norm(f.filter);
  if (flt) items = items.filter(v => norm(f.labels[v]).includes(flt));
  if (f.group) { const go = [...new Set(f.group)]; items.sort((a, b) => go.indexOf(f.group[a]) - go.indexOf(f.group[b]) || a - b); }
  else if (f.sort === 'label') { /* giữ thứ tự gốc */ } else items.sort((a, b) => (f.sel.has(b) - f.sel.has(a)) || f.counts[b] - f.counts[a]);
  const lim = f.expanded || flt ? 300 : (f.limit || 8);
  const shown = items.slice(0, lim);
  let lastGroup = null;
  const opts = shown.map(v => {
    let gh = '';
    if (f.group && f.group[v] !== lastGroup) { lastGroup = f.group[v]; if (lastGroup) gh = `<div class="grp-h2">${esc(lastGroup)}</div>`; }
    return gh + `<label class="opt${f.counts[v] ? '' : ' zero'}"><input type="checkbox" data-f="${f.key}" data-v="${v}"${f.sel.has(v) ? ' checked' : ''}>` +
      `<span class="lbl" title="${esc(f.labels[v])}">${esc(f.labels[v])}</span><span class="cnt">${NF.format(f.counts[v])}</span></label>`;
  }).join('');
  const more = items.length > shown.length ? `<button class="link more" data-more="${f.key}">Xem thêm ${items.length - shown.length} mục</button>` :
    (f.expanded && items.length > (f.limit || 8) ? `<button class="link more" data-more="${f.key}">Thu gọn</button>` : '');
  return `<details class="facet" data-key="${f.key}"${open ? ' open' : ''}><summary>${esc(f.label)}${f.sel.size ? `<span class="badge">${f.sel.size}</span>` : ''}</summary>` +
    (f.search ? `<input class="fsearch" data-fs="${f.key}" placeholder="Lọc trong danh sách…" value="${esc(f.filter)}">` : '') +
    `<div class="opts">${opts || '<span class="muted small">Không có giá trị</span>'}</div>${more}</details>`;
}
function renderFacets() {
  const openState = {};
  $$('details.facet[data-key]').forEach(d => openState[d.dataset.key] = d.open);
  $('#facets').innerHTML = FACETS.filter(f => PRIMARY.includes(f.key)).map(f => facetHtml(f, openState)).join('');
  $('#facets-adv').innerHTML = FACETS.filter(f => !PRIMARY.includes(f.key)).map(f => facetHtml(f, openState)).join('');
  const nAdv = FACETS.filter(f => !PRIMARY.includes(f.key)).reduce((a, f) => a + f.sel.size, 0) + (state.pmin !== null) + (state.pmax !== null) + state.split + state.nowarn + state.par;
  $('#adv-badge').textContent = nAdv || ''; $('#adv-badge').hidden = !nAdv;
}

/* ---------- Ngăn chi tiết 1 dòng ---------- */
function absPath(rel) {
  try {
    const u = new URL(rel, location.href);
    if (u.protocol !== 'file:') return u.href;
    return decodeURIComponent(u.pathname).replace(/^\/([A-Za-z]:)/, '$1').replace(/\//g, '\\');
  } catch { return rel; }
}
function openDrawer(title, html) {
  $('#drawer-title').innerHTML = title; $('#drawer-body').innerHTML = html;
  $('#drawer').hidden = false; $('#drawer-bg').hidden = false; $('#drawer-body').scrollTop = 0;
}
function closeDrawer() { $('#drawer').hidden = true; $('#drawer-bg').hidden = true; }
function showRow(i) {
  const p = projOf(i), nr = nrmOf(i);
  const file = C.f[i] >= 0 ? D.f[C.f[i]] : '';
  const rel = C.f[i] >= 0 ? DB.filePaths[C.f[i]] : '';
  const g = C.g && C.g[i] >= 0 ? C.g[i] : -1;
  const kv = [
    ['Đơn giá tổng hợp', `<b>${fmt(C.tot[i])}</b> ${esc(curOf(i))} / ${esc(unitOf(i))} ${flags(i)}`],
    ['Quy về ' + (DB.baseYear || 2026), C.p26 ? `${money(p26(i))} / ${esc(C.cu[i] >= 0 ? D.cu[C.cu[i]] : unitOf(i))}` : ''],
    ['Nhóm đại diện', g >= 0 ? `${esc(G_NAME[g])} <button class="link" data-drop="${g}">điểm rơi →</button>` : ''],
    ['Vị trí', C.loc && C.loc[i] >= 0 ? esc(D.loc[C.loc[i]]) : ''],
    ...(C.st ? [['Trạng thái làm sạch', `<b>${esc(C.st[i] >= 0 ? D.st[C.st[i]] : '')}</b>`], ['Lý do REVIEW', esc(C.why[i])]] : []),
    ['Đơn giá vật liệu', fmt(C.mat[i])], ['Đơn giá nhân công', fmt(C.lab[i])], ['Đơn giá máy', fmt(C.mac[i])],
    ['Thông số kỹ thuật', esc(C.spec[i])], ['Tên công việc (gốc)', C.oname ? esc(C.oname[i]) : ''],
    ['Hạng mục cha', esc(C.par[i] >= 0 ? D.par[C.par[i]] : '')], ['Mã hiệu gốc', esc(C.code[i])],
    ['NRM2', `${esc(nr[0])} · ${esc(nr[1])}${C.src && C.src[i] >= 0 && D.src[C.src[i]] !== 'Theo CSDL gốc' ? ` <span class="muted">(${esc(D.src[C.src[i]])})</span>` : ''}`],
    ['Loại công việc', esc(C.w[i] >= 0 ? D.w[C.w[i]] : '')], ['Vật tư chuẩn hóa', C.vt && C.vt[i] >= 0 ? esc(D.vt[C.vt[i]]) : ''],
    ['Năm báo giá', C.y[i] || ''], ['Dự án', `${esc(p[1])} <span class="muted">(${esc(p[0])})</span>`],
    ['Loại hình', esc(p[2])], ['Tỉnh/TP', esc([p[3], p[4] && p[4] !== p[3] ? '→ ' + p[4] + ' (2025)' : ''].filter(Boolean).join(' '))],
    ['Nhà thầu/NCC', esc(C.c[i] >= 0 ? D.c[C.c[i]] : '')], ['Kiểm tra KL×ĐG', esc(C.chk[i] >= 0 ? D.chk[C.chk[i]] : '')],
    ['File nguồn', file ? `<a href="${esc(encodeURI(rel))}" target="_blank">${esc(file)}</a>` : ''],
    ['Sheet / Dòng', esc([C.sh[i] >= 0 ? D.sh[C.sh[i]] : '', C.row[i]].filter(Boolean).join(' / dòng '))],
    ['Mã dòng', esc(C.id[i])],
  ].filter(([, v]) => v !== '' && v !== null && v !== undefined);
  openDrawer(esc(C.name[i]), `
    <div class="actions">
      ${file ? `<button class="btn" data-act="copypath" data-path="${esc(absPath(rel))}">Sao chép đường dẫn file</button>` : ''}
      <button class="btn" data-act="copyrow" data-i="${i}">Sao chép dòng</button>
    </div>
    <dl class="kv">${kv.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`);
}

/* ---------- Xuất Excel: TONG_HOP + CHI_TIET (outline +/−) ---------- */
function exportXlsx() {
  const gs = result.groups, base = DB.baseYear || 2026;
  const sum = [['Tên nhóm đại diện', 'ĐV', `Đơn giá đại diện (${base})`, 'P25', 'P75', 'Trung bình', 'Thấp nhất', 'Cao nhất', 'Số báo giá', 'Số dự án', 'Năm mới nhất', 'Số tên biến thể', 'Mã nhóm']];
  for (const e of gs) { const s = e.st; sum.push([e.name, e.unit, Math.round(s.med), Math.round(s.p25), Math.round(s.p75), Math.round(s.mean), Math.round(s.min), Math.round(s.max), s.n, s.proj, s.latest, s.variants, e.g >= 0 ? D.g[e.g] : '']); }
  const det = [['Nhóm / Tên công việc', 'ĐV', `Đơn giá quy về ${base}`, 'Đơn giá gốc', 'ĐV gốc', 'Năm', 'Dự án', 'Tỉnh/TP (2025)', 'Loại hình', 'Vị trí', 'Trạng thái', 'Đơn giá VL', 'Đơn giá NC', 'File nguồn', 'Mã dòng']];
  const opts = [{}];
  let nrow = 0, cut = false;
  for (const e of gs) {
    if (nrow > 100000) { cut = true; break; }
    const s = e.st;
    det.push([`${e.name}  (${s.n} báo giá · ${s.proj} dự án · phổ biến ${money(s.p25)}–${money(s.p75)})`, e.unit, Math.round(s.med), null, null, s.latest, null, null, null, null, null, null, null, null, e.g >= 0 ? D.g[e.g] : '']);
    opts.push({ group: 1, collapsed: 1 });
    const ids = e.sorted || [...e.ids].sort((a, b) => (C.y[b] || 0) - (C.y[a] || 0));
    for (const i of ids) {
      const p = projOf(i);
      det.push(['    ' + C.name[i], e.unit, Math.round(p26(i)), C.tot[i], unitOf(i), C.y[i], p[1], p[4], p[2], C.loc && C.loc[i] >= 0 ? D.loc[C.loc[i]] : '',
        C.st && C.st[i] >= 0 ? D.st[C.st[i]] : '', C.mat[i], C.lab[i], C.f[i] >= 0 ? D.f[C.f[i]] : '', C.id[i]]);
      opts.push({ level: 1, hidden: 1 });
      nrow++;
    }
  }
  const blob = writeWorkbook([
    { name: 'TONG_HOP', rows: sum, widths: [60, 7, 16, 13, 13, 13, 13, 13, 9, 9, 10, 10, 11], nums: new Set([2, 3, 4, 5, 6, 7]) },
    { name: 'CHI_TIET', rows: det, rowOpts: opts, widths: [70, 7, 16, 14, 7, 7, 24, 16, 18, 26, 10, 12, 12, 36, 14], nums: new Set([2, 3, 11, 12]) },
  ]);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `TraCuuDonGia_${(norm(state.q).replace(/ /g, '_') || 'tatca').slice(0, 30)}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast(`Đã xuất ${NF.format(gs.length)} nhóm, ${NF.format(nrow)} dòng chi tiết` + (cut ? ' (giới hạn 100.000 dòng – lọc hẹp hơn để xuất đủ)' : ''));
}

/* ---------- Điểm rơi giá ---------- */
const DROP = { g: null };
function dropTopGroups(q) {
  if (q) {
    const s = search(q);
    if (!s.ids || !s.ids.length) return [];
    return aggregate(s.ids, s.score, s.phrase).filter(e => e.g >= 0).sort((a, b) => b.score - a.score || b.st.proj - a.st.proj).slice(0, 12);
  }
  if (!DROP.top) {
    const arr = [];
    for (let g = 0; g < G_ROWS.length; g++) arr.push([g, new Set(Array.from(G_ROWS[g], i => C.p[i])).size]);
    DROP.top = arr.sort((a, b) => b[1] - a[1]).slice(0, 24).map(([g, p]) => ({ g, name: G_NAME[g], unit: G_UNIT[g], proj: p }));
  }
  return DROP.top;
}
function renderDropPicker() {
  const q = $('#dp-q').value.trim();
  const list = dropTopGroups(q);
  $('#dp-list').innerHTML = list.length ? list.map(e => `<button class="dp-item${e.g === DROP.g ? ' on' : ''}" data-g="${e.g}">${esc(e.name)} <span class="muted">· ${esc(e.unit)} · ${e.st ? e.st.proj : e.proj} DA</span></button>`).join('')
    : '<span class="muted small">Không tìm thấy nhóm phù hợp</span>';
  $('#dp-list-h').textContent = q ? 'Nhóm phù hợp' : 'Nhóm có nhiều dự án nhất';
}
function boxes(rows, unit) {   // biểu đồ hộp ngang dùng chung trục
  if (!rows.length) return '<div class="muted small">Chưa đủ dữ liệu (cần ≥ 3 báo giá mỗi nhóm)</div>';
  const W = 560, rowH = 26, L = 170, R = 60, H = rows.length * rowH + 22;
  const lo = Math.min(...rows.map(r => r.p10)), hi = Math.max(...rows.map(r => r.p90));
  const xS = v => L + (v - lo) / (hi - lo || 1) * (W - L - R);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
  for (let k = 0; k <= 4; k++) { const v = lo + (hi - lo) * k / 4; s += `<line class="grid" x1="${xS(v)}" x2="${xS(v)}" y1="0" y2="${H - 18}"/><text x="${xS(v)}" y="${H - 4}" text-anchor="middle">${CH.short(v)}</text>`; }
  rows.forEach((r, k) => {
    const y = k * rowH + 4, m = y + (rowH - 8) / 2;
    s += `<text x="${L - 8}" y="${m + 4}" text-anchor="end">${esc(r.k.length > 24 ? r.k.slice(0, 23) + '…' : r.k)}</text>`;
    s += `<line class="whisk" x1="${xS(r.p10)}" x2="${xS(r.p90)}" y1="${m}" y2="${m}"/>`;
    s += `<rect class="box" x="${xS(r.p25)}" y="${y + 2}" width="${Math.max(3, xS(r.p75) - xS(r.p25))}" height="${rowH - 12}" rx="3"/>`;
    s += `<line class="medtick" x1="${xS(r.p50)}" x2="${xS(r.p50)}" y1="${y + 2}" y2="${y + rowH - 10}"/>`;
    s += `<text class="lbl" x="${xS(r.p90) + 6}" y="${m + 4}">${CH.short(r.p50)} <tspan class="muted">(${r.n})</tspan></text>`;
    s += `<rect class="hit" x="0" y="${y - 2}" width="${W}" height="${rowH}" data-tip="${esc(`${r.k}: trung vị ${money(r.p50)} · P25–P75 ${money(r.p25)}–${money(r.p75)} · ${r.n} báo giá`)}"/>`;
  });
  return s + '</svg>';
}
function renderDrop() {
  renderDropPicker();
  const box = $('#dp-view');
  if (DROP.g === null || !G_ROWS[DROP.g]) { box.innerHTML = '<div class="empty">Chọn một nhóm đại diện ở trên để xem điểm rơi đơn giá.</div>'; return; }
  const g = DROP.g, ids = Array.from(G_ROWS[g]), s = groupStats(ids), unit = G_UNIT[g], base = DB.baseYear || 2026;
  // 1) phân bố
  const vals = Float64Array.from(ids, p26).sort();
  const lo = qtile(vals, .02), hi = qtile(vals, .98), B = Math.min(24, Math.max(6, Math.ceil(Math.sqrt(vals.length)) + 2)), w = (hi - lo) / B || 1;
  const bins = new Array(B).fill(0);
  for (const v of vals) bins[Math.max(0, Math.min(B - 1, Math.floor((v - lo) / w)))]++;
  const hist = bins.map((c, k) => { const a = lo + k * w, b = a + w; const inBand = b > s.p25 && a < s.p75;
    return { k: CH.short(a), v: c, color: inBand ? 'var(--series-1)' : 'var(--muted)', tip: `${money(a)} – ${money(b)}: ${c} báo giá${inBand ? ' (vùng phổ biến)' : ''}` }; });
  // 2) theo thời gian (giá gốc theo năm)
  const byY = new Map();
  for (const i of ids) { const y = C.y[i]; if (!y) continue; if (!byY.has(y)) byY.set(y, []); byY.get(y).push(C.cp ? C.cp[i] : C.tot[i]); }
  const pts = ids.filter(i => C.y[i]).map(i => ({ x: C.y[i] + ((i * 7919) % 100 - 50) / 260, y: C.cp ? C.cp[i] : C.tot[i], r: 3.5, color: 'var(--series-1)',
    tip: `${C.y[i]} · ${projOf(i)[1] || ''}: ${money(C.cp ? C.cp[i] : C.tot[i])} /${unit}` }));
  const medLine = [...byY].sort((a, b) => a[0] - b[0]).map(([y, a]) => ({ x: y, y: qtile(a.sort((p, q) => p - q), .5) }));
  // 3) theo tỉnh / loại hình
  const by = (fn) => {
    const m = new Map();
    for (const i of ids) { const k = fn(i); if (!k) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(p26(i)); }
    return [...m].filter(([, a]) => a.length >= 3).map(([k, a]) => { a.sort((p, q) => p - q); return { k, n: a.length, p10: qtile(a, .1), p25: qtile(a, .25), p50: qtile(a, .5), p75: qtile(a, .75), p90: qtile(a, .9) }; })
      .sort((a, b) => b.n - a.n).slice(0, 12);
  };
  const dim = DROP.dim || 'prov';
  const cat = dim === 'prov' ? by(i => projOf(i)[4]) : by(i => projOf(i)[2]);
  // biến thể tên
  const vm = new Map();
  for (const i of ids) vm.set(C.name[i], (vm.get(C.name[i]) || 0) + 1);
  const variants = [...vm].sort((a, b) => b[1] - a[1]);
  box.innerHTML = `
    <div class="dp-head"><div><div class="dp-name">${esc(G_NAME[g])}</div><div class="muted small">${esc(unit)} · ${NF.format(s.n)} báo giá · ${s.proj} dự án · ${variants.length} cách ghi tên · mới nhất ${s.latest}</div></div>
      <div class="kpis dp-kpis">
        <div class="kpi"><div class="k">Đơn giá đại diện (${base})</div><div class="v">${money(s.med)}</div></div>
        <div class="kpi"><div class="k">Khoảng phổ biến P25–P75</div><div class="v small-v">${money(s.p25)} – ${money(s.p75)}</div></div>
        <div class="kpi"><div class="k">Trung bình</div><div class="v small-v">${money(s.mean)}</div></div>
      </div></div>
    <div class="grid2">
      <div class="card"><h3>Giá phổ biến nằm ở đâu?</h3><div class="cap">Số báo giá theo mức giá (quy về ${base}). Cột xanh = vùng phổ biến P25–P75; nét đứt = đơn giá đại diện.</div>
        <div class="chart">${CH.vbar(hist, { fmt: v => NF.format(v), H: 230, vline: (s.med - lo) / w })}</div></div>
      <div class="card"><h3>Giá thay đổi theo thời gian?</h3><div class="cap">Mỗi chấm = 1 báo giá (giá gốc theo năm, /${esc(unit)}); đường = trung vị từng năm.</div>
        <div class="chart">${CH.scatter(pts, { yfmt: CH.short, xfmt: v => String(Math.round(v)), H: 250, lines: [{ pts: medLine, color: 'var(--series-2)' }] })}</div></div>
    </div>
    <div class="grid2">
      <div class="card"><h3>Khác nhau theo ${dim === 'prov' ? 'tỉnh/TP' : 'loại hình dự án'}?</h3>
        <div class="seg small-seg"><button data-dim="prov" class="${dim === 'prov' ? 'on' : ''}">Tỉnh/TP</button><button data-dim="type" class="${dim === 'type' ? 'on' : ''}">Loại hình</button></div>
        <div class="cap">Hộp = P25–P75, vạch trắng = trung vị, râu = P10–P90 (quy về ${base}); chỉ nhóm ≥ 3 báo giá.</div>
        <div class="chart">${boxes(cat, unit)}</div></div>
      <div class="card"><h3>Các cách ghi tên trong nhóm</h3><div class="cap">Tên đại diện = tên được dùng ở nhiều dự án nhất.</div>
        <div class="tbl-wrap tall"><table><tbody>${variants.slice(0, 40).map(([n, c]) => `<tr><td>${esc(n)}</td><td class="num">${c}</td></tr>`).join('')}</tbody></table></div></div>
    </div>`;
  writeHash();
}

/* ---------- Chế độ dữ liệu đối thủ ---------- */
function setupDoiThu() {
  document.documentElement.classList.add('ds-doithu');
  document.title = 'Đơn giá đối thủ';
  const t = document.querySelector('.brand .title'); if (t) t.textContent = 'Đơn giá đối thủ';
  const nav = document.querySelector('.topnav');
  if (nav) nav.innerHTML = '<a href="index.html">Dữ liệu nội bộ</a><a href="index.html?ds=doithu" class="on">Đối thủ</a>';
  $('#q').placeholder = 'Tìm đơn giá đối thủ… vd: be tong lot, cot thep cot';
}

/* ---------- Mục (section) ---------- */
let SECTION = 'tra-cuu';
function showSection(sec) {
  if (DS === 'doithu') sec = 'tra-cuu';
  if (ROLE === 'nhan_vien') sec = 'tra-cuu';   // nhân viên chỉ được tra cứu
  SECTION = sec;
  $('#sec-search').hidden = sec !== 'tra-cuu';
  $('#sec-drop').hidden = sec !== 'diem-roi';
  $('#sec-analysis').hidden = sec !== 'phan-tich';
  $$('.topnav [data-sec]').forEach(a => a.classList.toggle('on', a.dataset.sec === sec));
  if (sec === 'diem-roi') renderDrop();
  if (sec === 'phan-tich' && window.DASH) window.DASH.start();
  writeHash();
  window.scrollTo({ top: 0 });
}
function openDrop(g) { DROP.g = g; closeDrawer(); showSection('diem-roi'); }

/* ---------- Trạng thái URL ---------- */
function writeHash() {
  const p = new URLSearchParams();
  if (SECTION !== 'tra-cuu') p.set('sec', SECTION);
  if (SECTION === 'diem-roi' && DROP.g !== null) p.set('g', D.g[DROP.g]);
  if (state.q) p.set('q', state.q);
  if (state.sort !== 'rel') p.set('sort', state.sort);
  if (state.pmin !== null) p.set('pmin', state.pmin);
  if (state.pmax !== null) p.set('pmax', state.pmax);
  for (const k of ['par', 'split', 'nowarn']) if (state[k]) p.set(k, 1);
  for (const f of FACETS) if (f.sel.size) p.set('f.' + f.key, [...f.sel].map(v => f.labels[v]).join('|'));
  const h = p.toString();
  try { history.replaceState(null, '', h ? '#' + h : location.pathname + location.search); } catch (e) { }
}
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  state.q = p.get('q') || ''; state.sort = p.get('sort') || 'rel';
  state.pmin = p.has('pmin') ? +p.get('pmin') : null; state.pmax = p.has('pmax') ? +p.get('pmax') : null;
  for (const k of ['par', 'split', 'nowarn']) state[k] = p.get(k) === '1';
  for (const f of FACETS) {
    f.sel.clear();
    const v = p.get('f.' + f.key);
    if (v) v.split('|').forEach(l => { const k = f.labels.indexOf(l); if (k >= 0) f.sel.add(k); });
  }
  if (p.get('g') && D.g) { const k = D.g.indexOf(p.get('g')); if (k >= 0) DROP.g = k; }
  $('#q').value = state.q;
  $('#pmin').value = state.pmin !== null ? fmt(state.pmin) : '';
  $('#pmax').value = state.pmax !== null ? fmt(state.pmax) : '';
  $('#opt-par').checked = state.par; $('#opt-split').checked = state.split; $('#opt-nowarn').checked = state.nowarn;
  return p.get('sec') || 'tra-cuu';
}

/* ---------- Sự kiện ---------- */
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 3200); }
function copy(text) { navigator.clipboard.writeText(text).then(() => toast('Đã sao chép'), () => toast('Không sao chép được')); }
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const parseNum = s => { const v = String(s).replace(/[^\d,]/g, '').replace(',', '.'); return v === '' ? null : +v; };

function bindUI() {
  const q = $('#q');
  q.addEventListener('input', debounce(() => { state.q = q.value.trim(); if (SECTION !== 'tra-cuu') showSection('tra-cuu'); run(); }, 180));
  q.addEventListener('keydown', e => { if (e.key === 'Escape') { q.value = ''; state.q = ''; run(); } });
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); q.select(); }
    if (e.key === 'Escape' && !$('#drawer').hidden) closeDrawer();
  });
  $('#help-btn').onclick = () => { $('#help').hidden = !$('#help').hidden; };
  document.addEventListener('click', e => {
    if (!e.target.closest('#help, #help-btn')) $('#help').hidden = true;
    const d = e.target.closest('[data-drop]'); if (d) { e.preventDefault(); openDrop(+d.dataset.drop); }
    const s = e.target.closest('.topnav [data-sec]'); if (s) { e.preventDefault(); showSection(s.dataset.sec); }
  });

  $('#sort').onchange = e => { state.sort = e.target.value; run(); };
  $('#export').onclick = exportXlsx;
  for (const [id, k] of [['opt-par', 'par'], ['opt-split', 'split'], ['opt-nowarn', 'nowarn']]) $('#' + id).onchange = e => { state[k] = e.target.checked; run(); };
  const pr = debounce(() => { state.pmin = parseNum($('#pmin').value); state.pmax = parseNum($('#pmax').value); run(); }, 400);
  $('#pmin').oninput = pr; $('#pmax').oninput = pr;
  $('#pmin').onblur = $('#pmax').onblur = e => { const v = parseNum(e.target.value); e.target.value = v === null ? '' : fmt(v); };

  const side = $('#side');
  side.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.f) { const f = FACETS.find(x => x.key === t.dataset.f), v = +t.dataset.v; t.checked ? f.sel.add(v) : f.sel.delete(v); run(); }
  });
  side.addEventListener('input', debounce(e => {
    const t = e.target;
    if (t.dataset.fs) {
      const f = FACETS.find(x => x.key === t.dataset.fs); f.filter = t.value;
      renderFacets();
      const inp = $(`[data-fs="${f.key}"]`); inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length);
    }
  }, 120));
  side.addEventListener('click', e => {
    const m = e.target.closest('[data-more]');
    if (m) { const f = FACETS.find(x => x.key === m.dataset.more); f.expanded = !f.expanded; renderFacets(); }
  });
  $('#clear-all').onclick = () => {
    FACETS.forEach(f => { f.sel.clear(); f.filter = ''; });
    Object.assign(state, { q: '', pmin: null, pmax: null, par: false, split: false, nowarn: false });
    $('#q').value = ''; $('#pmin').value = ''; $('#pmax').value = '';
    $('#opt-par').checked = $('#opt-split').checked = $('#opt-nowarn').checked = false;
    run();
  };
  $('#side-open').onclick = () => side.classList.add('open');
  $('#side-close').onclick = () => side.classList.remove('open');
  $('#chips').onclick = e => {
    const b = e.target.closest('button[data-chip]'); if (!b) return;
    const t = b.dataset.chip;
    if (t === 'q') { state.q = ''; $('#q').value = ''; }
    else if (t === 'f') { const [k, v] = b.dataset.v.split(':'); FACETS.find(x => x.key === k).sel.delete(+v); }
    else if (t === 'pmin' || t === 'pmax') { state[t] = null; $('#' + t).value = ''; }
    else { state[t] = false; $('#opt-' + t).checked = false; }
    run();
  };
  $('#quick').onclick = e => { const b = e.target.closest('[data-ex]'); if (b) { $('#q').value = b.dataset.ex; state.q = b.dataset.ex; run(); } };
  $('#results').addEventListener('click', e => {
    if (e.target.closest('[data-drop]')) return;
    const r = e.target.closest('tr[data-row]'); if (r) return showRow(+r.dataset.row);
    const md = e.target.closest('[data-more-d]'); if (md) { const el = md.closest('.grp'); return appendDetails(el, result.groups[+el.dataset.k]); }
    const h = e.target.closest('.grp-h'); if (h) toggleGroup(h.closest('.grp'));
  });
  $('#results').addEventListener('keydown', e => { const h = e.target.closest('.grp-h'); if (h && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleGroup(h.closest('.grp')); } });
  $('#drawer-body').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const i = +b.dataset.i;
    if (b.dataset.act === 'copypath') copy(b.dataset.path);
    if (b.dataset.act === 'copyrow') copy([C.name[i], unitOf(i), C.tot[i], C.mat[i] ?? '', C.lab[i] ?? '', C.y[i], projOf(i)[1]].join('\t'));
  });
  $('#drawer-close').onclick = closeDrawer; $('#drawer-bg').onclick = closeDrawer;
  $('#dp-q').addEventListener('input', debounce(renderDropPicker, 200));
  $('#dp-list').onclick = e => { const b = e.target.closest('[data-g]'); if (b) { DROP.g = +b.dataset.g; renderDrop(); } };
  $('#dp-view').onclick = e => { const b = e.target.closest('[data-dim]'); if (b) { DROP.dim = b.dataset.dim; renderDrop(); } };
  CH.bindTips(document);
  setupLazy();
  window.addEventListener('hashchange', () => { const sec = readHash(); lastSearchQ = null; run(); showSection(sec); });
}

boot();
