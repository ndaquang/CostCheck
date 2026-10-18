'use strict';
/* Lõi tham khảo giá BOQ — không phụ thuộc giao diện, chạy được cả trong trình duyệt (window.DXG) và Node (require).
   • Nhận diện cột / dòng hạng mục của bảng BOQ.
   • Khớp từng dòng BOQ với "nhóm đại diện" trong cơ sở dữ liệu đơn giá (window.DB, cùng định dạng với app tra cứu).
   • Thống kê giá nhóm (trung vị, P25–P75…) theo bộ lọc, đề xuất đơn giá và độ tin cậy.
   • Ghép giá baseline vào dòng BOQ và tính chênh lệch. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DXG = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  /* ---------- Chuẩn hóa tiếng Việt (giống app tra cứu) ---------- */
  function norm(s) {
    if (s === null || s === undefined) return '';
    return String(s).toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/²/g, '2').replace(/³/g, '3')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/([a-z])(\d)/g, '$1 $2').replace(/(\d)([a-z])/g, '$1 $2')
      .trim();
  }
  // Từ quá phổ biến trong mô tả BOQ, ít giá trị phân biệt
  const STOP = new Set('va cua cho cac bang theo trong voi la tai tu den gom bao gom loai bao the khi duoc co mot nhung hoac de tren duoi vao ra cong tac thi cong lap dat cung cap the and of the for to in with by on at or including incl supply install a an as per all'.split(' '));
  const tokens = s => norm(s).split(' ').filter(t => t && !STOP.has(t));

  /* ---------- Đơn vị ---------- */
  const UNIT_ALIAS = [
    ['m2', /^(m 2|m2|met vuong|sqm|sq m|m vuong|m2 san|m2 sàn)$/],
    ['m3', /^(m 3|m3|met khoi|khoi|cbm|cu m)$/],
    ['m', /^(m|md|m dai|met|met dai|lm|rm|l m|m run)$/],
    ['kg', /^(kg|kilogram|kgs)$/],
    ['tan', /^(tan|t|ton|tons|tonne)$/],
    ['cai', /^(cai|chiec|cay|thanh|tam|vien|pcs|pc|no|nos|ea|each|unit|units|qua|con|so)$/],
    ['bo', /^(bo|set|sets|cum|ht|he thong|system)$/],
    ['ls', /^(ls|l s|lot|tron goi|goi|tg|lump sum|item|khoan|cong trinh|ct)$/],
    ['diem', /^(diem|point|pt|vi tri)$/],
    ['lit', /^(lit|l|lit)$/],
    ['cong', /^(cong|ngay cong|manday|md cong)$/],
    ['thang', /^(thang|month|months)$/],
  ];
  // -> { base: 'm2', factor: 100 } (vd: "100m2" = 100 lần m2); base = norm(u) nếu không nhận ra
  function parseUnit(u) {
    let n = norm(u);
    if (!n) return { base: '', factor: 1 };
    let factor = 1;
    const m = n.match(/^(\d+)\s+(.*)$/);
    if (m && m[2]) { factor = +m[1] || 1; n = m[2]; }
    for (const [b, re] of UNIT_ALIAS) if (re.test(n)) {
      if (b === 'tan') return { base: 'kg', factor: factor * 1000 };
      return { base: b, factor };
    }
    return { base: n, factor };
  }
  // Hệ số nhân để đổi giá theo đơn vị `from` sang đơn vị `to`; null nếu không đổi được
  function unitRatio(from, to) {
    const a = parseUnit(from), b = parseUnit(to);
    if (!a.base || !b.base || a.base !== b.base) return null;
    return b.factor / a.factor;
  }

  /* ---------- Thống kê ---------- */
  function qtile(sorted, p) {
    if (!sorted.length) return null;
    const x = (sorted.length - 1) * p, lo = Math.floor(x), hi = Math.ceil(x);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (x - lo);
  }
  // Vị trí (0..1) của giá trị v trong phân bố đã sắp xếp
  function percentRank(sorted, v) {
    if (!sorted.length || v === null || v === undefined) return null;
    let lo = 0, hi = sorted.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m; }
    let eq = lo; while (eq < sorted.length && sorted[eq] === v) eq++;
    return sorted.length === 1 ? (v < sorted[0] ? 0 : v > sorted[0] ? 1 : 0.5) : ((lo + eq) / 2) / sorted.length;
  }

  /* ---------- Chỉ mục cơ sở dữ liệu ---------- */
  // Dựng chỉ mục "nhóm" từ DB: nhóm đại diện D.g; dòng chưa có nhóm gộp theo tên chuẩn hóa + đơn vị
  function buildIndex(DB) {
    const C = DB.cols, D = DB.dicts, N = DB.count;
    const has = k => Array.isArray(C[k]) || (C[k] && C[k].length !== undefined);
    const unitOf = i => (has('u') && C.u[i] >= 0) ? D.u[C.u[i]] : '';
    const canonUnit = i => (has('cu') && C.cu[i] >= 0) ? D.cu[C.cu[i]] : unitOf(i);
    const price = i => {
      if (has('p26') && C.p26[i] !== null && C.p26[i] !== undefined) return C.p26[i];
      if (has('cp') && C.cp[i] !== null && C.cp[i] !== undefined) return C.cp[i];
      return C.tot[i];
    };
    const groups = [], gmap = new Map();
    for (let i = 0; i < N; i++) {
      const p = price(i);
      if (!(typeof p === 'number' && isFinite(p) && p > 0)) continue;
      const key = has('g') && C.g[i] >= 0 ? 'g' + C.g[i] : 'n' + norm(C.name[i]) + '|' + norm(canonUnit(i));
      let g = gmap.get(key);
      if (!g) {
        const name = has('g') && C.g[i] >= 0 ? ((has('gn') && C.gn[i] >= 0) ? D.gn[C.gn[i]] : (D.g ? D.g[C.g[i]] : C.name[i])) : C.name[i];
        g = { id: groups.length, key, dg: has('g') && C.g[i] >= 0 ? C.g[i] : -1, name, unit: canonUnit(i), rows: [] };
        gmap.set(key, g); groups.push(g);
      }
      g.rows.push(i);
    }
    // Trọng số từ theo nhóm: tên đại diện (1.0), tên các dòng (≤0.7 theo tỷ lệ), thông số (≤0.25)
    const post = new Map();   // token -> [[gid, w]]
    for (const g of groups) {
      const w = new Map();
      const rep = tokens(g.name);
      g.rep = rep; g.repSet = new Set(rep);
      g.repBig = new Set(); for (let k = 1; k < rep.length; k++) g.repBig.add(rep[k - 1] + ' ' + rep[k]);
      for (const t of g.repSet) w.set(t, 1);
      const cnt = new Map(), cntSpec = new Map(), big = new Map();
      const sample = g.rows.length > 60 ? g.rows.filter((_, k) => k % Math.ceil(g.rows.length / 60) === 0) : g.rows;
      for (const i of sample) {
        const tk = tokens(C.name[i]);
        for (const t of new Set(tk)) cnt.set(t, (cnt.get(t) || 0) + 1);
        for (let k = 1; k < tk.length; k++) { const b = tk[k - 1] + ' ' + tk[k]; big.set(b, (big.get(b) || 0) + 1); }
        if (has('spec')) for (const t of new Set(tokens(C.spec[i]))) cntSpec.set(t, (cntSpec.get(t) || 0) + 1);
      }
      const ns = sample.length || 1;
      for (const [t, c] of cnt) w.set(t, Math.max(w.get(t) || 0, 0.25 + 0.45 * c / ns));
      for (const [t, c] of cntSpec) w.set(t, Math.max(w.get(t) || 0, 0.25 * c / ns));
      g.big = new Set([...g.repBig, ...[...big].filter(([, c]) => c / ns >= 0.3).map(([b]) => b)]);
      g.nums = new Set(rep.filter(t => /^\d/.test(t)));
      g.tw = w;
      for (const [t, v] of w) { let a = post.get(t); if (!a) post.set(t, a = []); a.push(g.id, v); }
    }
    const NG = groups.length || 1;
    const idf = new Map();
    for (const [t, a] of post) idf.set(t, Math.log(1 + NG / (a.length / 2)) * (/^\d/.test(t) ? 1.15 : 1));
    const vocab = [...post.keys()].sort();
    for (const g of groups) {
      let s = 0; for (const t of g.repSet) s += idf.get(t) || 0;
      g.repIdf = s || 1;
      g.proj = new Set(g.rows.map(i => has('p') ? C.p[i] : 0)).size;
    }
    return { DB, C, D, N, groups, post, idf, vocab, NG, price, unitOf, canonUnit, has };
  }

  function lowerBound(arr, x) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; } return lo; }

  function editDist1(a, b) {   // khoảng cách sửa ≤ 1 (thay/thêm/bớt/đảo)
    if (a === b) return true;
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    let i = 0; while (i < la && i < lb && a[i] === b[i]) i++;
    if (la === lb) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
    return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
  }
  // Mở rộng 1 từ truy vấn: khớp đúng, tiền tố (từ ≥ 4 ký tự), hoặc sai 1 ký tự khi không có trong từ điển
  function expandTok(IX, t) {
    if (!IX.expCache) IX.expCache = new Map();
    if (IX.expCache.has(t)) return IX.expCache.get(t);
    const out = expandTok0(IX, t).slice(0, 12);
    IX.expCache.set(t, out);
    return out;
  }
  function expandTok0(IX, t) {
    const out = [];
    if (IX.post.has(t)) out.push([t, 1]);
    if (/^\d/.test(t)) return out;
    if (t.length >= 4) {
      for (let k = lowerBound(IX.vocab, t); k < IX.vocab.length && IX.vocab[k].startsWith(t); k++) if (IX.vocab[k] !== t) out.push([IX.vocab[k], 0.7]);
    }
    if (!out.length && t.length >= 5) {
      for (const v of IX.vocab) if (Math.abs(v.length - t.length) <= 1 && v[0] === t[0] && editDist1(v, t)) out.push([v, 0.75]);
    }
    return out;
  }

  /* ---------- Khớp 1 dòng BOQ ---------- */
  // line: { desc, unit, ctx (tiêu đề hạng mục cha) } -> [{ g, score, cover, unitOk, ratio }]
  function match(IX, line, opt = {}) {
    const limit = opt.limit || 8;
    const qMain = tokens(line.desc);
    const qSet = new Set(qMain);
    const qCtx = [...new Set(tokens(line.ctx))].filter(t => !qSet.has(t));
    // từ hiếm trước: chúng sinh ứng viên; từ quá phổ biến chỉ cộng điểm cho ứng viên đã có
    const plen = t => expandTok(IX, t).reduce((n, [v]) => n + IX.post.get(v).length / 2, 0);
    const q = [...[...qSet].sort((a, b) => plen(a) - plen(b)).map(t => [t, 1]), ...qCtx.map(t => [t, 0.3])];
    if (!qMain.length) return [];
    // Cộng điểm bằng mảng số (nhanh với CSDL lớn); từ ngữ cảnh chỉ cộng thêm cho nhóm đã khớp mô tả
    const NG = IX.groups.length;
    const acc = IX._acc || (IX._acc = new Float64Array(NG)), tmp = IX._tmp || (IX._tmp = new Float64Array(NG));
    const touched = [];
    let denom = 0;
    for (const [t, qw] of q) {
      const exp = expandTok(IX, t), isCtx = qw < 1;
      let id = 0; for (const [v] of exp) id = Math.max(id, IX.idf.get(v) || 0);
      denom += (exp.length ? id : Math.log(1 + IX.NG)) * qw;
      const tt = [];
      if (touched.length && (isCtx || plen(t) > Math.max(2000, touched.length * 4))) {
        // cộng thêm trên tập ứng viên hiện có thay vì duyệt cả danh sách dài
        for (const gid of touched) {
          const tw = IX.groups[gid].tw;
          let best = 0; for (const [v, ew] of exp) { const w = tw.get(v); if (w) best = Math.max(best, (IX.idf.get(v) || 0) * qw * ew * w); }
          acc[gid] += best;
        }
        continue;
      }
      for (const [v, ew] of exp) {
        const a = IX.post.get(v), iv = (IX.idf.get(v) || 0) * qw * ew;
        for (let k = 0; k < a.length; k += 2) {
          const gid = a[k];
          if (isCtx && acc[gid] === 0) continue;   // ngữ cảnh khi chưa có ứng viên: không sinh ứng viên mới
          const add = iv * a[k + 1];
          if (tmp[gid] === 0) tt.push(gid);
          if (add > tmp[gid]) tmp[gid] = add;   // một từ truy vấn chỉ tính một lần cho mỗi nhóm
        }
      }
      for (const gid of tt) { if (acc[gid] === 0) touched.push(gid); acc[gid] += tmp[gid]; tmp[gid] = 0; }
    }
    if (!touched.length) return [];
    let mx = 0; for (const gid of touched) if (acc[gid] > mx) mx = acc[gid];
    let cand = touched.filter(gid => acc[gid] >= mx * 0.35).map(gid => [gid, acc[gid]]);
    for (const gid of touched) acc[gid] = 0;
    cand.sort((x, y) => y[1] - x[1]); cand = cand.slice(0, 300);
    const qAll = new Set(q.map(([t]) => t));
    const qBig = []; for (let k = 1; k < qMain.length; k++) qBig.push(qMain[k - 1] + ' ' + qMain[k]);
    const qNums = new Set(qMain.filter(t => /^\d/.test(t)));
    const out = [];
    for (const [gid, raw] of cand) {
      const g = IX.groups[gid];
      let s = raw;
      let bh = 0; for (const b of qBig) if (g.big.has(b)) bh++;
      if (qBig.length) s += denom * 0.15 * bh / qBig.length;
      let cover = Math.min(1, s / (denom || 1));
      // Độ chính xác: phần tên nhóm được truy vấn giải thích
      let pi = 0; for (const t of g.repSet) if (qAll.has(t)) pi += IX.idf.get(t) || 0;
      const prec = Math.min(1, pi / g.repIdf);
      let score = cover * (0.7 + 0.3 * prec);
      // Số hiệu khác nhau (M250 vs M300, D10 vs D16, dày 100 vs 200) → phạt
      if (qNums.size && g.nums.size) {
        let conflict = 0; for (const t of g.nums) if (!qNums.has(t)) conflict++;
        let same = 0; for (const t of qNums) if (g.nums.has(t)) same++;
        if (conflict && !same) score *= Math.pow(0.82, Math.min(conflict, 2));
      }
      const ratio = line.unit ? unitRatio(g.unit, line.unit) : null;
      const unitOk = !line.unit ? null : ratio !== null;
      if (line.unit && !g.unit) score *= 0.92;
      else if (unitOk === false) score *= 0.6;
      score += 0.015 * Math.log10(1 + g.proj);
      out.push({ g: gid, score: Math.min(1, score), cover, prec, unitOk, ratio: ratio === null ? 1 : ratio });
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, limit);
  }

  /* ---------- Thống kê giá nhóm theo bộ lọc ---------- */
  // f: { yearFrom, yearTo, types:Set, provs:Set, excludeReview, excludeOutlier, excludeWarn }
  function rowPass(IX, i, f) {
    const { C, D, DB, has } = IX;
    if (f.yearFrom && !((C.y[i] || 0) >= f.yearFrom)) return false;
    if (f.yearTo && !((C.y[i] || 9999) <= f.yearTo)) return false;
    if (f.excludeReview && has('st') && C.st[i] >= 0 && D.st[C.st[i]] === 'REVIEW') return false;
    if (f.excludeOutlier && has('ol') && C.ol[i] >= 0) return false;
    if (f.excludeWarn && has('warn') && C.warn[i] >= 0) return false;
    if ((f.types && f.types.size) || (f.provs && f.provs.size)) {
      const p = (DB.projects || [])[has('p') ? C.p[i] : -1] || [];
      if (f.types && f.types.size && !f.types.has(p[2] || '')) return false;
      if (f.provs && f.provs.size && !f.provs.has(p[4] || p[3] || '')) return false;
    }
    return true;
  }
  function groupStats(IX, gid, f = {}, ratio = 1) {
    const g = IX.groups[gid];
    let ids = g.rows.filter(i => rowPass(IX, i, f));
    let relaxed = false;
    if (!ids.length && g.rows.length) { ids = g.rows.filter(i => rowPass(IX, i, { excludeReview: f.excludeReview })); relaxed = true; }
    if (!ids.length) { ids = g.rows.slice(); relaxed = true; }
    const v = Float64Array.from(ids, i => IX.price(i) * ratio).sort();
    const { C, has } = IX;
    let latest = 0, latestPrice = null, sum = 0, mat = [], lab = [];
    const proj = new Set();
    for (const i of ids) {
      if (has('p')) proj.add(C.p[i]);
      const y = C.y[i] || 0;
      if (y > latest || (y === latest && latestPrice === null)) { latest = y; }
      const t = C.tot[i];
      if (has('mat') && has('lab') && t > 0 && C.mat[i] !== null && C.lab[i] !== null && C.mat[i] !== undefined) {
        mat.push(C.mat[i] / t); lab.push(C.lab[i] / t);
      }
    }
    for (const x of v) sum += x;
    const recent = ids.filter(i => (C.y[i] || 0) === latest).map(i => IX.price(i) * ratio).sort((a, b) => a - b);
    latestPrice = qtile(recent, 0.5);
    mat.sort((a, b) => a - b); lab.sort((a, b) => a - b);
    return {
      ids, sorted: v, n: v.length, proj: proj.size, relaxed,
      med: qtile(v, 0.5), p10: qtile(v, 0.1), p25: qtile(v, 0.25), p75: qtile(v, 0.75), p90: qtile(v, 0.9),
      min: v[0], max: v[v.length - 1], mean: sum / (v.length || 1), latest, latestPrice,
      matShare: mat.length >= 2 ? qtile(mat, 0.5) : null, labShare: lab.length >= 2 ? qtile(lab, 0.5) : null,
    };
  }
  const STRATEGY = {
    med: { label: 'Trung vị (P50)', pick: s => s.med },
    p25: { label: 'Cạnh tranh (P25)', pick: s => s.p25 },
    p75: { label: 'An toàn (P75)', pick: s => s.p75 },
    mean: { label: 'Trung bình', pick: s => s.mean },
    latest: { label: 'Năm gần nhất (trung vị)', pick: s => s.latestPrice },
  };
  // Độ tin cậy: điểm khớp × độ đủ mẫu × độ phân tán
  function confidence(m, st) {
    if (!m) return { level: 'none', value: 0 };
    let v = m.score;
    if (st) {
      v *= st.n >= 5 ? 1 : st.n >= 3 ? 0.93 : st.n === 2 ? 0.8 : 0.62;   // 1 báo giá thì không bao giờ 'cao'
      if (st.med > 0 && st.n >= 3) { const disp = (st.p75 - st.p25) / st.med; if (disp > 0.8) v *= 0.85; }
      if (st.relaxed) v *= 0.9;
    }
    if (m.unitOk === false) v = Math.min(v, 0.45);
    const level = v >= 0.72 ? 'cao' : v >= 0.5 ? 'tb' : v >= 0.32 ? 'thap' : 'none';
    return { level, value: v };
  }

  /* ---------- Nhận diện bảng BOQ ---------- */
  const COLS = {
    code: ['stt', 'tt', 'no', 'item', 'item no', 'ma hieu', 'ma', 'ma cv', 'ma cong viec', 'ref', 'so tt', 'hang muc so'],
    desc: ['mo ta', 'noi dung', 'ten cong viec', 'noi dung cong viec', 'hang muc', 'description', 'dien giai', 'cong viec', 'item description', 'ten hang muc', 'mo ta cong viec', 'description of works', 'particulars', 'ten vat tu'],
    unit: ['don vi', 'dvt', 'dv', 'unit', 'units', 'don vi tinh', 'uom'],
    qty: ['khoi luong', 'kl', 'so luong', 'quantity', 'qty', 'quantities', 'sl'],
    rate: ['don gia', 'unit rate', 'rate', 'unit price', 'don gia tong hop', 'don gia tong', 'don gia vnd', 'gia'],
    amount: ['thanh tien', 'amount', 'total', 'gia tri', 'thanh tien vnd', 'total amount', 'tong'],
    mat: ['vat lieu', 'vat tu', 'material', 'materials', 'don gia vat lieu', 'vl'],
    lab: ['nhan cong', 'labour', 'labor', 'don gia nhan cong', 'nc', 'thi cong'],
    base: ['baseline', 'gia baseline', 'base line', 'gia goc', 'ngan sach', 'budget', 'gia chu dau tu', 'gia du toan', 'gia muc tieu', 'target'],
    note: ['ghi chu', 'note', 'notes', 'remark', 'remarks'],
  };
  function headerScore(text, key) {
    const n = norm(text);
    if (!n) return 0;
    let best = 0;
    for (const k of COLS[key]) {
      if (n === k) best = Math.max(best, 3);
      else if ((' ' + n + ' ').includes(' ' + k + ' ')) best = Math.max(best, k.length >= 4 ? 2 : 1);
    }
    return best;
  }
  // grid: mảng 2 chiều giá trị ô (chuỗi/số/null). -> { headerRow, cols: {key: colIndex}, dataStart }
  function detectColumns(grid, maxScan = 40) {
    let best = null;
    for (let r = 0; r < Math.min(grid.length, maxScan); r++) {
      const row = grid[r] || [];
      const next = grid[r + 1] || [];
      // dòng tiêu đề phải tự có ít nhất 2 ô giống tiêu đề (dòng kế tiếp chỉ bổ sung tiêu đề song ngữ)
      const own = row.filter(v => typeof v === 'string' && Object.keys(COLS).some(k => headerScore(v, k))).length;
      if (own < 2) continue;
      const cols = {}, score = {};
      for (let c = 0; c < Math.max(row.length, next.length); c++) {
        const txt = [row[c], typeof next[c] === 'string' ? next[c] : ''].filter(v => typeof v === 'string').join(' ');
        for (const key of Object.keys(COLS)) {
          let s = headerScore(txt, key);
          if (!s) continue;
          // "Đơn giá vật liệu" là cột vật liệu, không phải cột đơn giá tổng
          if (key === 'rate' && (headerScore(txt, 'mat') || headerScore(txt, 'lab'))) s = 0.5;
          if (key === 'rate' && /tong hop|total|tong/.test(norm(txt))) s += 1;
          if (key === 'amount' && headerScore(txt, 'rate') >= 2 && !/thanh tien|amount/.test(norm(txt))) s = 0;
          if (key === 'desc' && headerScore(txt, 'code') === 3) s = 0;
          if (s > (score[key] || 0)) { score[key] = s; cols[key] = c; }
        }
      }
      const total = (score.desc ? 3 : 0) + (score.unit ? 2 : 0) + (score.qty ? 2 : 0) + (score.rate ? 1.5 : 0) + (score.amount ? 1 : 0) + (score.code ? 0.5 : 0);
      if (score.desc && (score.unit || score.qty) && (!best || total > best.total)) {
        const twoRow = next.some((v, c) => typeof v === 'string' && Object.keys(COLS).some(k => headerScore(v, k) >= 2) && !(typeof row[c] === 'number'));
        best = { headerRow: r, cols, total, dataStart: r + (twoRow ? 2 : 1) };
      }
    }
    if (!best) return null;
    // Cột trùng nhau: ưu tiên mô tả/đơn vị/khối lượng
    const used = new Set();
    for (const k of ['desc', 'unit', 'qty', 'rate', 'amount', 'code', 'mat', 'lab', 'base', 'note']) {
      if (best.cols[k] === undefined) continue;
      if (used.has(best.cols[k])) delete best.cols[k]; else used.add(best.cols[k]);
    }
    return best;
  }

  const isNum = v => typeof v === 'number' && isFinite(v);
  const toNum = v => {
    if (isNum(v)) return v;
    if (typeof v !== 'string') return null;
    const s = v.trim().replace(/\s/g, '');
    if (!/^-?[\d.,]+$/.test(s)) return null;
    // 1.234.567,5 (VN) hoặc 1,234,567.5 (EN)
    let t = s;
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) t = s.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) t = s.replace(/,/g, '');
    else t = s.replace(',', '.');
    const n = parseFloat(t);
    return isFinite(n) ? n : null;
  };
  // Tách dòng: 'item' (có mô tả + đơn vị/khối lượng), 'head' (tiêu đề nhóm), bỏ qua dòng trống/tổng cộng
  function extractLines(grid, det, sheetName) {
    const { cols, dataStart } = det;
    const out = [];
    const heads = [];   // ngăn xếp tiêu đề: [{lvl, text}]
    const cell = (r, k) => cols[k] === undefined ? null : (grid[r] || [])[cols[k]];
    for (let r = dataStart; r < grid.length; r++) {
      const row = grid[r] || [];
      let desc = cell(r, 'desc');
      desc = desc === null || desc === undefined ? '' : String(desc).trim();
      const unit = String(cell(r, 'unit') ?? '').trim();
      const qty = toNum(cell(r, 'qty'));
      const code = String(cell(r, 'code') ?? '').trim();
      if (!desc) {
        // mô tả có thể nằm lệch sang cột kế bên khi ô bị gộp
        const alt = row.find((v, c) => typeof v === 'string' && v.trim().length > 6 && c !== cols.unit && c !== cols.code);
        if (!alt) continue;
        desc = alt.trim();
      }
      const nd = norm(desc);
      if (/^(tong cong|tong cong truoc thue|cong|tong|total|sub total|subtotal|grand total|thue vat|vat|cong hang muc|tong gia tri|carried forward|brought forward)\b/.test(nd) && !unit) {
        out.push({ kind: 'sum', r, desc, code, sheet: sheetName });
        continue;
      }
      if (unit || (qty !== null && qty !== 0)) {
        const ctx = heads.map(h => h.text).join(' · ');
        out.push({
          kind: 'item', r, sheet: sheetName, code, desc, unit, qty,
          rate: toNum(cell(r, 'rate')), amount: toNum(cell(r, 'amount')), base: toNum(cell(r, 'base')),
          ctx, heads: heads.map(h => h.text),
        });
      } else {
        // Cấp tiêu đề: theo mã (A, I, 1, 1.1, 1.1.1) hoặc theo thứ tự xuất hiện
        let lvl = 1;
        if (/^[A-Z]$|^[IVXLC]+$/.test(code)) lvl = 1;
        else if (/^\d+$/.test(code)) lvl = 2;
        else if (/^\d+(\.\d+)+$/.test(code)) lvl = 1 + code.split('.').length;
        else lvl = heads.length ? heads[heads.length - 1].lvl + 1 : 1;
        while (heads.length && heads[heads.length - 1].lvl >= lvl) heads.pop();
        heads.push({ lvl, text: desc.length > 140 ? desc.slice(0, 140) : desc });
        if (heads.length > 4) heads.shift();
        out.push({ kind: 'head', r, sheet: sheetName, code, desc, lvl });
      }
    }
    return out;
  }

  /* ---------- Baseline ---------- */
  // base: [{code, desc, unit, price, sheet}] -> gán vào items theo: (sheet+mã) → (mã duy nhất) → (mô tả + đơn vị) → (mô tả gần đúng)
  function matchBaseline(items, base) {
    const key = (...a) => a.map(x => norm(x)).join('|');
    const bySheetCode = new Map(), byCode = new Map(), byDesc = new Map();
    const codeCount = new Map();
    for (const b of base) if (b.code) codeCount.set(norm(b.code), (codeCount.get(norm(b.code)) || 0) + 1);
    for (const b of base) {
      if (b.code && b.sheet) bySheetCode.set(key(b.sheet, b.code, b.desc.slice(0, 30)), b);
      if (b.code && b.sheet) bySheetCode.set(key(b.sheet, b.code), bySheetCode.get(key(b.sheet, b.code)) || b);
      if (b.code && codeCount.get(norm(b.code)) === 1) byCode.set(norm(b.code), b);
      byDesc.set(key(b.desc, parseUnit(b.unit).base), b);
      if (!byDesc.has(key(b.desc))) byDesc.set(key(b.desc), b);
    }
    // chỉ mục từ cho khớp gần đúng
    const tokIdx = new Map();
    base.forEach((b, k) => { b._t = new Set(tokens(b.desc)); for (const t of b._t) { let a = tokIdx.get(t); if (!a) tokIdx.set(t, a = []); a.push(k); } });
    const res = new Map();   // item -> {b, how}
    for (const it of items) {
      let b = null, how = '';
      if (it.code && (b = bySheetCode.get(key(it.sheet, it.code, it.desc.slice(0, 30))) || null)) how = 'mã + mô tả';
      else if ((b = byDesc.get(key(it.desc, parseUnit(it.unit).base)) || null)) how = 'mô tả + đơn vị';
      else if (it.code && (b = byCode.get(norm(it.code)) || null) && jac(new Set(tokens(it.desc)), b._t) >= 0.5) how = 'mã';
      else if ((b = byDesc.get(key(it.desc)) || null)) how = 'mô tả';
      else {
        b = null;
        const qt = new Set(tokens(it.desc)), cnt = new Map();
        for (const t of qt) for (const k of tokIdx.get(t) || []) cnt.set(k, (cnt.get(k) || 0) + 1);
        let bestK = -1, bestJ = 0;
        for (const [k] of cnt) { const j = jac(qt, base[k]._t); if (j > bestJ) { bestJ = j; bestK = k; } }
        if (bestK >= 0 && bestJ >= 0.8 && (!it.unit || !base[bestK].unit || unitRatio(base[bestK].unit, it.unit) !== null)) { b = base[bestK]; how = `gần đúng ${Math.round(bestJ * 100)}%`; }
      }
      if (b) {
        const ratio = it.unit && b.unit ? unitRatio(b.unit, it.unit) : 1;
        res.set(it, { price: b.price * (ratio || 1), how, src: b });
      }
    }
    return res;
  }
  function jac(a, b) { if (!a.size || !b.size) return 0; let n = 0; for (const t of a) if (b.has(t)) n++; return n / (a.size + b.size - n); }

  // Chênh lệch đề xuất so với baseline
  function diff(proposed, baseline, qty) {
    if (!isNum(proposed) || !isNum(baseline)) return null;
    const d = proposed - baseline;
    return { d, pct: baseline ? d / baseline : null, amt: isNum(qty) ? d * qty : null };
  }

  return { norm, tokens, parseUnit, unitRatio, qtile, percentRank, buildIndex, match, groupStats, rowPass, STRATEGY, confidence, detectColumns, extractLines, matchBaseline, diff, toNum, COLS };
});
