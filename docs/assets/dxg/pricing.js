'use strict';
/* Lõi tham khảo giá BOQ — không phụ thuộc giao diện, chạy được cả trong trình duyệt (window.DXG) và Node (require).
   • Nhận diện cột / dòng hạng mục của bảng BOQ.
   • Khớp từng dòng BOQ với "nhóm đại diện" trong cơ sở dữ liệu đơn giá (window.DB, cùng định dạng với app tra cứu).
   • Thống kê giá nhóm (trung vị, P25–P75…) theo bộ lọc, đề xuất đơn giá và độ tin cậy.
   • Ghép giá baseline vào dòng BOQ, tính chênh lệch và đánh giá baseline phù hợp / không phù hợp với CSDL. */
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
  // Cấp độ bền bê tông (TCVN 5574) → mác tương đương, để "B20" khớp "M250"
  const B2M = { '7.5': 100, '10': 150, '12.5': 150, '15': 200, '20': 250, '22.5': 300, '25': 350, '27.5': 350, '30': 400, '35': 450, '40': 500 };
  function concreteClass(s) {
    const t = String(s);
    if (!/b[eê]\s*t[oô]ng|\bbt\b|concrete/i.test(t.normalize('NFC'))) return t;
    return t.replace(/\bB\s?(7[.,]5|10|12[.,]5|15|20|22[.,]5|25|27[.,]5|30|35|40)\b/gi, (m, x) => `M${B2M[x.replace(',', '.')]}`);
  }
  // Từ đồng nghĩa / viết tắt ngành xây dựng (viết dạng đã chuẩn hóa), áp cho cả CSDL lẫn mô tả BOQ để hai bên nói cùng một "ngôn ngữ"
  const SYN0 = [
    ['btct', 'be tong cot thep'], ['bttp', 'be tong thuong pham'], ['bt', 'be tong'],
    ['cop pha', 'van khuon'], ['coppha', 'van khuon'], ['copha', 'van khuon'], ['cofa', 'van khuon'], ['coffa', 'van khuon'], ['vk', 'van khuon'],
    // cụm động từ thi công chung chung: bỏ khi so khớp ("sản xuất" bỏ dấu thành "san" = sàn; "lắp dựng / tháo dỡ" lấn át "móng / cột")
    ['sxld', ''], ['sx ld', ''], ['san xuat', ''], ['lap dung', ''], ['thao do', ''], ['gia cong', ''], ['sx', ''],
    ['kct', 'ket cau thep'],
    ['vxm', 'vua xi mang'], ['xm', 'xi mang'], ['wc', 've sinh'], ['gach ong', 'gach rong'],
    ['concrete', 'be tong'], ['rebar', 'cot thep'], ['reinforcement', 'cot thep'], ['formwork', 'van khuon'], ['shuttering', 'van khuon'],
    ['excavation', 'dao dat'], ['backfill', 'dap dat'], ['backfilling', 'dap dat'], ['plastering', 'trat'], ['plaster', 'trat'],
    ['painting', 'son'], ['paint', 'son'], ['ceiling', 'tran'], ['gypsum', 'thach cao'], ['waterproofing', 'chong tham'],
    ['brickwork', 'xay gach'], ['masonry', 'xay'], ['footing', 'mong'], ['foundation', 'mong'], ['column', 'cot'], ['columns', 'cot'],
    ['beam', 'dam'], ['beams', 'dam'], ['slab', 'san'], ['slabs', 'san'], ['railing', 'lan can'], ['handrail', 'lan can'],
    ['tiling', 'gach'], ['tiles', 'gach'], ['tile', 'gach'], ['steel', 'thep'], ['pile', 'coc'], ['piles', 'coc'], ['piling', 'coc'],
    ['stainless steel', 'inox'], ['stainless', 'inox'], ['ready mix', 'thuong pham'], ['ready mixed', 'thuong pham'],
    // trong nhà / ngoài nhà: "trong" là từ dừng nên phải đổi thành một từ riêng, nếu không "sơn tường trong nhà" ≈ "sơn tường ngoài nhà"
    ['trong nha', 'noithat'], ['noi that', 'noithat'], ['ngoai nha', 'ngoaithat'], ['ngoai that', 'ngoaithat'],
    ['tuong trong', 'tuong noithat'], ['tuong ngoai', 'tuong ngoaithat'], ['trat trong', 'trat noithat'], ['trat ngoai', 'trat ngoaithat'],
    ['son trong', 'son noithat'], ['son ngoai', 'son ngoaithat'], ['op trong', 'op noithat'], ['op ngoai', 'op ngoaithat'],
    ['internal', 'noithat'], ['interior', 'noithat'], ['external', 'ngoaithat'], ['exterior', 'ngoaithat'],
    ['moisture resistant', 'chong am'], ['concealed frame', 'khung chim'], ['cementitious', 'goc xi mang'], ['roof', 'mai'], ['roofing', 'lop mai'],
    ['machine', 'may'], ['door', 'cua di'], ['window', 'cua so'], ['wall', 'tuong'], ['walls', 'tuong'], ['floor', 'nen'], ['flooring', 'lat nen'],
    ['porcelain', 'granite'], ['xa ban', 'phe thai'], ['ba bot', 'ba matit'], ['matic', 'matit'],
  ];
  // Biến đổi theo mẫu: "mác 300" → M300, "đường kính 10" / "Φ10" / "phi 10" → D10, "1*2" → 1x2
  const PAT = [[/ mac (?=\d)/g, ' m '], [/ (duong kinh|dk|phi|fi) (?=\d)/g, ' d ']];
  let SYN = [];
  function compileSyn(list) {
    return list.map(([a, b]) => [norm(a), norm(b)]).filter(([a, b]) => a && a !== b)   // b rỗng = bỏ cụm từ
      .sort((x, y) => y[0].length - x[0].length)
      .map(([a, b]) => [new RegExp(' ' + a + '(?= )', 'g'), b ? ' ' + b : '']);
  }
  // Thêm từ đồng nghĩa của người dùng / học được ([[từ, nghĩa chuẩn], …]); gọi trước buildIndex
  function setSynonyms(list = []) { SYN = compileSyn([...SYN0, ...list]); }
  setSynonyms();
  function canon(n) {
    let s = ' ' + n + ' ';
    for (const [re, r] of PAT) s = s.replace(re, r);
    for (const [re, r] of SYN) s = s.replace(re, r);
    return s.trim();
  }
  const prepDims = s => String(s).replace(/(\d)\s*[*×]\s*(?=\d)/g, '$1x').replace(/[Φφø∅]\s*(?=\d)/g, ' D');
  const tokens = s => s === null || s === undefined ? [] : canon(norm(concreteClass(prepDims(s)))).split(' ').filter(t => t && !STOP.has(t));
  // Thông số có tiền tố: mác M300, đường kính D10, cấp độ bền B20, thép CB300 → { m: Set(300), d: Set(10) }
  function attrNums(tk) {
    const out = {};
    for (let k = 1; k < tk.length; k++) if (/^\d/.test(tk[k]) && /^(m|d|b|cb|phi)$/.test(tk[k - 1])) (out[tk[k - 1]] = out[tk[k - 1]] || new Set()).add(tk[k]);
    return out;
  }

  /* ---------- Đơn vị ---------- */
  const UNIT_ALIAS = [
    ['m2', /^(m 2|m2|met vuong|sqm|sq m|m vuong|m2 san|m2 sàn)$/],
    ['m3', /^(m 3|m3|met khoi|khoi|cbm|cu m)$/],
    ['m', /^(m|md|m dai|met|met dai|lm|rm|l m|m run)$/],
    ['kg', /^(kg|kilogram|kgs)$/],
    ['tan', /^(tan|t|ton|tons|tonne)$/],
    ['cai', /^(cai|chiec|cay|thanh|tam|vien|pcs|pc|no|nos|ea|each|unit|units|qua|con|so)$/],
    ['bo', /^(bo|set|sets|cum|ht|he thong|system)$/],
    ['ls', /^(ls|l s|lot|tron goi|goi|tg|lump sum|item|khoan|cong trinh|ct|toan bo|tb|hang muc)$/],
    ['diem', /^(diem|point|pt|vi tri)$/],
    ['lit', /^(lit|l|lit)$/],
    ['cong', /^(cong|ngay cong|manday|md cong)$/],
    ['thang', /^(thang|month|months)$/],
    ['ngay', /^(ngay|day|days)$/], ['ca', /^(ca|ca may|shift)$/], ['chuyen', /^(chuyen|chuyen xe|trip|trips)$/],
    ['cuon', /^(cuon|roll|rolls)$/], ['bao', /^(bao|bag|bags)$/], ['km', /^(km|kilomet)$/],
  ];
  const UNIT_BASES = new Set(UNIT_ALIAS.map(([b]) => b === 'tan' ? 'kg' : b));
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
      g.attr = attrNums(rep);
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
    // Mô tả ngắn ("Móng", "Sàn tầng 1"): tiêu đề gần nhất ("BÊ TÔNG LÓT B10") là một phần nội dung chính
    const short = qMain.length <= 4;
    const qNear = short ? [...new Set(tokens(line.near))].filter(t => !qSet.has(t)) : [];
    const nearSet = new Set(qNear);
    const qCtx = [...new Set(tokens(line.ctx))].filter(t => !qSet.has(t) && !nearSet.has(t));
    // từ hiếm trước: chúng sinh ứng viên; từ quá phổ biến chỉ cộng điểm cho ứng viên đã có
    const plen = t => expandTok(IX, t).reduce((n, [v]) => n + IX.post.get(v).length / 2, 0);
    const q = [...[...qSet, ...qNear].sort((a, b) => plen(a) - plen(b)).map(t => [t, nearSet.has(t) ? 0.6 : 1]), ...qCtx.map(t => [t, 0.3])];
    if (!qMain.length) return [];
    // Cộng điểm bằng mảng số (nhanh với CSDL lớn); từ ngữ cảnh chỉ cộng thêm cho nhóm đã khớp mô tả
    const NG = IX.groups.length;
    const acc = IX._acc || (IX._acc = new Float64Array(NG)), tmp = IX._tmp || (IX._tmp = new Float64Array(NG));
    const touched = [];
    let denom = 0;
    for (const [t, qw] of q) {
      const exp = expandTok(IX, t), isCtx = qw < 0.5;
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
    if (!touched.length) {   // không từ nào khớp CSDL: vẫn dùng được mô tả QS đã dạy
      const o = []; if (IX.mem && opt.learn !== false) applyMemory(IX, line, o);
      return o.sort((a, b) => b.score - a.score).slice(0, limit);
    }
    let mx = 0; for (const gid of touched) if (acc[gid] > mx) mx = acc[gid];
    let cand = touched.filter(gid => acc[gid] >= mx * 0.35).map(gid => [gid, acc[gid]]);
    for (const gid of touched) acc[gid] = 0;
    cand.sort((x, y) => y[1] - x[1]); cand = cand.slice(0, 300);
    const qAll = new Set(q.map(([t]) => t));
    const qBig = [];
    for (const seq of [qMain, short ? tokens(line.near) : []]) for (let k = 1; k < seq.length; k++) qBig.push(seq[k - 1] + ' ' + seq[k]);
    const qNums = new Set([...qMain, ...qNear].filter(t => /^\d/.test(t)));
    const qAttr = attrNums(tokens(line.desc).concat(short ? ['|'] : [], short ? tokens(line.near) : []));
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
      // Ưu tiên nhóm chứa đủ các từ của chính mô tả dòng ("Dầm" dưới tiêu đề "CỐT THÉP…" → cốt thép DẦM)
      if (qSet.size) {
        let mh = 0;
        for (const t of qSet) if (expandTok(IX, t).some(([v]) => g.tw.has(v))) mh++;
        score *= 0.8 + 0.2 * mh / qSet.size;
      }
      // Số hiệu khác nhau (M250 vs M300, D10 vs D16, dày 100 vs 200) → phạt
      if (qNums.size && g.nums.size) {
        let conflict = 0; for (const t of g.nums) if (!qNums.has(t)) conflict++;
        let same = 0; for (const t of qNums) if (g.nums.has(t)) same++;
        if (conflict && !same) score *= Math.pow(0.82, Math.min(conflict, 2));
      }
      // Cùng loại thông số nhưng khác giá trị (M150 vs M300, D10 vs D18) → phạt mạnh
      for (const [k, vs] of Object.entries(qAttr)) {
        const gv = g.attr[k];
        if (gv && ![...vs].some(v => gv.has(v))) score *= 0.7;
      }
      const ratio = line.unit ? unitRatio(g.unit, line.unit) : null;
      const unitOk = !line.unit ? null : ratio !== null;
      if (line.unit && !g.unit) score *= 0.92;
      else if (unitOk === false) score *= 0.6;
      score += 0.015 * Math.log10(1 + g.proj);
      if (g.boost) score *= g.boost;   // vd đơn giá bổ sung của người dùng
      out.push({ g: gid, score: Math.min(1, score), cover, prec, unitOk, ratio: ratio === null ? 1 : ratio });
    }
    if (IX.mem && opt.learn !== false) applyMemory(IX, line, out);
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, limit);
  }

  /* ---------- Học từ lựa chọn của QS ---------- */
  // Mô hình học (.dxgl): { dinh_dang: 'DXGL1', cap: [{ d, u, n, gk, gn, gu, neg: [{gk, gn, gu}], so }], dong_nghia: [[từ, nghĩa]] }
  // d/u/n: mô tả, đơn vị, tiêu đề gần nhất của dòng BOQ; gk/gn/gu: khóa, tên, đơn vị nhóm QS chọn; neg: nhóm QS đã bác.
  const isShort = d => tokens(d).length <= 4;
  // Khóa nhớ: các từ của mô tả (không phụ thuộc thứ tự) + đơn vị; mô tả ngắn ("Móng") thêm tiêu đề gần nhất
  function learnKey(desc, unit, near) {
    const k = [...new Set(tokens(desc))].sort().join(' ') + '|' + parseUnit(unit).base;
    return isShort(desc) && near ? k + '|' + [...new Set(tokens(near))].sort().join(' ') : k;
  }
  // Tìm nhóm theo khóa (cùng tên), rồi theo tên + đơn vị (CSDL dựng lại có thể đổi mã nhóm)
  function resolveGroup(IX, gk, gn, gu) {
    if (!IX._gByKey) {
      IX._gByKey = new Map(IX.groups.map(g => [g.key, g]));
      IX._gByName = new Map();
      for (const g of IX.groups) { const k = norm(g.name) + '|' + parseUnit(g.unit).base; if (!IX._gByName.has(k)) IX._gByName.set(k, g); }
    }
    const g = IX._gByKey.get(gk);
    if (g && (!gn || norm(g.name) === norm(gn))) return g;
    return IX._gByName.get(norm(gn) + '|' + parseUnit(gu).base) || null;
  }
  // Nạp mô hình học vào chỉ mục. -> { nhan: số cặp dùng được, mat: số cặp không còn nhóm trong CSDL }
  function applyLearn(IX, model) {
    IX.mem = new Map(); IX.memList = []; IX.memTok = new Map();
    let nhan = 0, mat = 0;
    for (const c of (model && model.cap) || []) {
      const g = resolveGroup(IX, c.gk, c.gn, c.gu);
      if (!g) { mat++; continue; }
      nhan++;
      const key = learnKey(c.d, c.u, c.n);
      let e = IX.mem.get(key);
      if (!e) {
        const tk = new Set(tokens(c.d).concat(isShort(c.d) ? tokens(c.n) : []));
        e = { key, votes: new Map(), neg: new Set(), tk, nums: [...tk].filter(t => /^\d/.test(t)).sort().join(' '), ub: parseUnit(c.u).base };
        IX.mem.set(key, e); IX.memList.push(e);
        for (const t of tk) { let a = IX.memTok.get(t); if (!a) IX.memTok.set(t, a = []); a.push(e); }
      }
      e.votes.set(g.id, (e.votes.get(g.id) || 0) + (c.so || 1));
      for (const x of c.neg || []) { const ng = resolveGroup(IX, x.gk, x.gn, x.gu); if (ng && ng.id !== g.id) e.neg.add(ng.id); }
    }
    for (const e of IX.memList) {
      let best = -1, bv = 0, tot = 0;
      for (const [gid, v] of e.votes) { tot += v; if (v > bv) { bv = v; best = gid; } }
      e.gid = best; e.agree = bv / tot;   // các QS chọn khác nhau cho cùng mô tả → tin ít hơn
      for (const gid of e.votes.keys()) if (gid !== best) e.neg.delete(gid);
    }
    if (!IX.memList.length) IX.mem = null;
    return { nhan, mat, mau: IX.memList.length };
  }
  // Cộng dồn hai mô hình học: cùng mô tả + cùng nhóm thì cộng số lần chọn, gộp các nhóm bị bác
  function mergeLearn(a = {}, b = {}) {
    const map = new Map(), out = { dinh_dang: 'DXGL1', cap: [], dong_nghia: [] };
    for (const c of [...(a.cap || []), ...(b.cap || [])]) {
      const k = learnKey(c.d, c.u, c.n) + '#' + norm(c.gn) + '|' + parseUnit(c.gu).base;
      const x = map.get(k);
      if (!x) { const y = { ...c, neg: [...(c.neg || [])], so: c.so || 1 }; map.set(k, y); out.cap.push(y); continue; }
      x.so += c.so || 1; x.gk = c.gk;
      for (const n of c.neg || []) if (!x.neg.some(m => norm(m.gn) === norm(n.gn))) x.neg.push(n);
    }
    const seen = new Set();
    for (const p of [...(a.dong_nghia || []), ...(b.dong_nghia || [])]) { const k = p.map(norm).join('>'); if (!seen.has(k)) { seen.add(k); out.dong_nghia.push(p); } }
    return out;
  }
  function addCand(IX, line, out, gid, score, learned) {
    let c = out.find(x => x.g === gid);
    if (!c) {
      const g = IX.groups[gid], ratio = line.unit ? unitRatio(g.unit, line.unit) : null;
      c = { g: gid, score: 0, cover: 1, prec: 1, unitOk: line.unit ? ratio !== null : null, ratio: ratio === null ? 1 : ratio };
      out.push(c);
    }
    if (c.unitOk === false) return;
    if (score > c.score) { c.score = score; c.learned = learned; }
  }
  function applyMemory(IX, line, out) {
    const e = IX.mem.get(learnKey(line.desc, line.unit, line.near));
    if (e) {
      for (const c of out) if (e.neg.has(c.g)) c.score *= 0.6;
      addCand(IX, line, out, e.gid, 0.9 + 0.08 * e.agree, 'exact');
      return;
    }
    // Gần đúng: mô tả đã học rất giống (Jaccard theo IDF ≥ 0.8: từ phân biệt như "trong"/"ngoài" nặng hơn từ phổ biến),
    // cùng đơn vị, cùng các con số (M300 ≠ M350)
    const tk = new Set(tokens(line.desc).concat(isShort(line.desc) ? tokens(line.near) : []));
    const nums = [...tk].filter(t => /^\d/.test(t)).sort().join(' '), ub = parseUnit(line.unit).base;
    const seen = new Set(), maxIdf = Math.log(1 + IX.NG) * 1.15;
    const w = t => IX.idf.get(t) || maxIdf;   // từ CSDL không có: coi là rất phân biệt
    let wq = 0; for (const t of tk) wq += w(t);
    let best = null, bj = 0;
    for (const t of tk) for (const m of IX.memTok.get(t) || []) {
      if (seen.has(m)) continue; seen.add(m);
      if (m.nums !== nums || (ub && m.ub && m.ub !== ub)) continue;
      let inter = 0, wm = 0; for (const x of m.tk) { wm += w(x); if (tk.has(x)) inter += w(x); }
      const j = inter / (wq + wm - inter);
      if (j > bj) { bj = j; best = m; }
    }
    if (best && bj >= 0.8) {
      for (const c of out) if (best.neg.has(c.g)) c.score *= 0.8;
      addCand(IX, line, out, best.gid, (0.55 + 0.35 * bj) * (0.7 + 0.3 * best.agree), 'near');
    }
  }

  /* ---------- Gộp nhiều nguồn giá vào một CSDL ---------- */
  // Mỗi dòng mang nhãn nguồn ở cột ng (từ điển D.ng: 'Nội bộ', 'CTG', 'Đối thủ', 'Bổ sung'…) — cùng cột "Nguồn dữ liệu" mà
  // 2_XU_LY ghi khi làm sạch chung Nội bộ + CTG — để lọc và thống kê theo nguồn. Chưa có cột thì tạo (mọi dòng = Nội bộ);
  // dòng chưa ghi nguồn (-1) cũng là Nội bộ. -> chỉ số của label trong D.ng
  function tagSource(DB, label) {
    const C = DB.cols, D = DB.dicts = DB.dicts || {};
    if (!Array.isArray(D.ng)) D.ng = [];
    const idx = l => { let k = D.ng.indexOf(l); if (k < 0) { D.ng.push(l); k = D.ng.length - 1; } return k; };
    if (!Array.isArray(C.ng)) C.ng = new Array(DB.count).fill(idx('Nội bộ'));
    else if (C.ng.some(v => !(v >= 0))) { const nb = idx('Nội bộ'); for (let i = 0; i < C.ng.length; i++) if (!(C.ng[i] >= 0)) C.ng[i] = nb; }
    return idx(label);
  }
  // CSDL đã có dòng của nguồn label chưa (vd CTG đã làm sạch chung trong khối db) — để không gộp một nguồn hai lần
  function hasSource(DB, label) {
    const C = DB.cols, D = DB.dicts || {}, k = Array.isArray(D.ng) ? D.ng.indexOf(label) : -1;
    return k >= 0 && Array.isArray(C.ng) && C.ng.includes(k);
  }
  // Hệ số quy giá gốc về năm gốc theo năm báo giá, học từ chính CSDL: trung vị (giá đã quy về năm gốc / giá gốc) của
  // các dòng cùng năm. -> Map(năm → hệ số); rỗng nếu CSDL không có giá đã quy đổi (p26)
  function yearFactors(DB) {
    const C = DB.cols, out = new Map(), by = new Map();
    if (!Array.isArray(C.p26) || !Array.isArray(C.y)) return out;
    for (let i = 0; i < DB.count; i++) {
      const a = C.p26[i], b = Array.isArray(C.cp) && C.cp[i] > 0 ? C.cp[i] : C.tot[i], y = C.y[i];
      if (!(a > 0 && b > 0 && y)) continue;
      let v = by.get(y); if (!v) by.set(y, v = []); v.push(a / b);
    }
    for (const [y, v] of by) if (v.length >= 5) out.set(y, qtile(v.sort((x, z) => x - z), 0.5));
    return out;
  }
  // Gộp CSDL src (cùng định dạng window.DB) vào dst — dst phải là bản sao riêng vì bị sửa tại chỗ.
  // • Nhóm đại diện của src trùng tên + đơn vị (cùng đơn vị gốc và hệ số: "tấn" khác "kg") với một nhóm của dst được gộp
  //   vào nhóm đó (giá hai nguồn chung một phân bố); nhóm chưa có thì thêm mới.
  // • src chưa quy giá về năm gốc (không có p26, vd CTG) mà dst có: giá được quy đổi theo hệ số năm học từ dst
  //   (năm trước năm sớm nhất có hệ số dùng hệ số năm sớm nhất; từ năm gốc trở đi giữ nguyên; không rõ năm giữ giá gốc).
  // -> { dong, nhomChung, nhomMoi, lechNam, quyDoi, khongNam }
  function mergeDB(dst, src, label) {
    const C = dst.cols, D = dst.dicts, SC = src.cols, SD = src.dicts || {}, N0 = dst.count, M = src.count;
    const quy = Array.isArray(C.p26) && !Array.isArray(SC.p26) && !Array.isArray(SC.cp) ? yearFactors(dst) : null;
    const years = quy ? [...quy.keys()].sort((a, b) => a - b) : [];
    const base = dst.baseYear || (years.length ? years[years.length - 1] : 0);
    const factorOf = y => {
      if (!y) return null;
      if (quy.has(y)) return quy.get(y);
      if (y >= base) return 1;
      if (!years.length) return null;
      let best = years[0]; for (const x of years) if (Math.abs(x - y) < Math.abs(best - y)) best = x;   // năm gần nhất có hệ số
      return quy.get(best);
    };
    let quyDoi = 0, khongNam = 0;
    tagSource(dst, 'Nội bộ');
    const ng = tagSource(dst, label);
    const col = (cols, k) => Array.isArray(cols[k]);
    const gName = (cols, dicts, i) => col(cols, 'gn') && cols.gn[i] >= 0 && dicts.gn ? dicts.gn[cols.gn[i]] : col(cols, 'g') && cols.g[i] >= 0 && dicts.g ? dicts.g[cols.g[i]] : null;
    const uName = (cols, dicts, i) => col(cols, 'cu') && cols.cu[i] >= 0 && dicts.cu ? dicts.cu[cols.cu[i]] : col(cols, 'u') && cols.u[i] >= 0 && dicts.u ? dicts.u[cols.u[i]] : '';
    const gKey = (name, unit) => { const u = parseUnit(unit); return norm(name) + '|' + u.base + '|' + u.factor; };
    const lookup = new Map();
    const dictIdx = (k, v) => {
      if (v === null || v === undefined) return -1;
      let m = lookup.get(k);
      if (!m) { m = new Map(); (D[k] || (D[k] = [])).forEach((x, j) => { if (!m.has(x)) m.set(x, j); }); lookup.set(k, m); }
      let j = m.get(v);
      if (j === undefined) { D[k].push(v); j = D[k].length - 1; m.set(v, j); }
      return j;
    };
    // nhóm của dst theo tên + đơn vị
    const gDst = new Map();
    if (col(C, 'g')) for (let i = 0; i < N0; i++) if (C.g[i] >= 0) { const k = gKey(gName(C, D, i), uName(C, D, i)); if (!gDst.has(k)) gDst.set(k, [C.g[i], col(C, 'gn') ? C.gn[i] : -1]); }
    const gMap = new Map();   // nhóm src -> [g, gn] ở dst
    let chung = 0, moi = 0;
    const mapGroup = i => {
      if (!col(SC, 'g') || SC.g[i] < 0 || !col(C, 'g')) return [-1, -1];
      const sg = SC.g[i];
      if (gMap.has(sg)) return gMap.get(sg);
      const name = gName(SC, SD, i), k = gKey(name, uName(SC, SD, i));
      let r = gDst.get(k);
      if (r) chung++;
      else {
        D.g = D.g || []; D.g.push(SD.g ? SD.g[sg] : name);
        let gn = -1; if (col(C, 'gn')) { D.gn = D.gn || []; D.gn.push(name); gn = D.gn.length - 1; }
        r = [D.g.length - 1, gn]; gDst.set(k, r); moi++;
      }
      gMap.set(sg, r);
      return r;
    };
    // dự án của src nối vào cuối danh sách dự án
    dst.projects = dst.projects || [];
    const pOff = dst.projects.length;
    for (const p of src.projects || []) { dst.projects.push(p.slice()); if (Array.isArray(D.p)) D.p.push(p[0]); }
    const keys = Object.keys(C).filter(k => col(C, k));
    for (let i = 0; i < M; i++) {
      const [g, gn] = mapGroup(i);
      for (const k of keys) {
        let v;
        if (k === 'ng') v = ng;
        else if (k === 'p') v = col(SC, 'p') && SC.p[i] >= 0 ? pOff + SC.p[i] : -1;
        else if (k === 'g') v = g;
        else if (k === 'gn') v = gn;
        else if (Array.isArray(D[k])) v = col(SC, k) && SC[k][i] >= 0 && SD[k] ? dictIdx(k, SD[k][SC[k][i]]) : -1;   // cột mã hóa theo từ điển
        else if (k === 'p26' && quy) {
          const f = factorOf(col(SC, 'y') ? SC.y[i] : null), t = col(SC, 'tot') ? SC.tot[i] : null;
          v = f && t > 0 ? Math.round(t * f) : null;
          if (v !== null) quyDoi++; else khongNam++;
        }
        else v = col(SC, k) ? SC[k][i] : null;
        C[k].push(v);
      }
    }
    dst.count = N0 + M;
    return { dong: M, nhomChung: chung, nhomMoi: moi, lechNam: !!(src.baseYear && dst.baseYear && src.baseYear !== dst.baseYear), quyDoi, khongNam };
  }
  // Dòng thuộc nguồn đang bị tắt (f.srcOff: Set nhãn nguồn) — lọc cứng, không bao giờ nới
  const srcOff = (IX, i, f) => !!(f.srcOff && f.srcOff.size && IX.has('ng') && f.srcOff.has(IX.D.ng[IX.C.ng[i]]));

  /* ---------- Thống kê giá nhóm theo bộ lọc ---------- */
  // f: { yearFrom, yearTo, types:Set, provs:Set, excludeReview, excludeOutlier, excludeWarn, srcOff:Set }
  function rowPass(IX, i, f) {
    const { C, D, DB, has } = IX;
    if (srcOff(IX, i, f)) return false;
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
  // more: [{ g, ratio }] — nhóm gần giống gộp chung báo giá với nhóm chính (poolCands); ratio của từng nhóm quy về đơn vị dòng BOQ
  function groupStats(IX, gid, f = {}, ratio = 1, more = []) {
    const rate = new Map();
    for (const p of [{ g: gid, ratio }, ...more]) for (const i of IX.groups[p.g].rows) if (!rate.has(i)) rate.set(i, p.ratio);
    const rows = [...rate.keys()], adj = i => IX.price(i) * rate.get(i);
    let ids = rows.filter(i => rowPass(IX, i, f));
    let relaxed = false;
    // không còn mẫu: nới các bộ lọc khác, riêng nguồn đã tắt thì vẫn loại
    if (!ids.length && rows.length) { ids = rows.filter(i => rowPass(IX, i, { excludeReview: f.excludeReview, srcOff: f.srcOff })); relaxed = true; }
    if (!ids.length) { ids = rows.filter(i => !srcOff(IX, i, f)); relaxed = true; }
    const v = Float64Array.from(ids, adj).sort();   // có thể rỗng khi mọi báo giá của nhóm thuộc nguồn đã tắt
    const { C, has } = IX;
    let latest = 0, latestPrice = null, sum = 0, mat = [], lab = [];
    const proj = new Set(), src = {};
    for (const i of ids) {
      if (has('p')) proj.add(C.p[i]);
      if (has('ng')) { const l = IX.D.ng[C.ng[i]]; src[l] = (src[l] || 0) + 1; }
      const y = C.y[i] || 0;
      if (y > latest || (y === latest && latestPrice === null)) { latest = y; }
      const t = C.tot[i];
      if (has('mat') && has('lab') && t > 0 && C.mat[i] !== null && C.lab[i] !== null && C.mat[i] !== undefined) {
        mat.push(C.mat[i] / t); lab.push(C.lab[i] / t);
      }
    }
    for (const x of v) sum += x;
    const recent = ids.filter(i => (C.y[i] || 0) === latest).map(adj).sort((a, b) => a - b);
    latestPrice = qtile(recent, 0.5);
    mat.sort((a, b) => a - b); lab.sort((a, b) => a - b);
    return {
      ids, sorted: v, n: v.length, proj: proj.size, relaxed, src, rate, pooled: more.length,
      med: qtile(v, 0.5), p10: qtile(v, 0.1), p25: qtile(v, 0.25), p75: qtile(v, 0.75), p90: qtile(v, 0.9),
      min: v[0], max: v[v.length - 1], mean: sum / (v.length || 1), latest, latestPrice,
      matShare: mat.length >= 2 ? qtile(mat, 0.5) : null, labShare: lab.length >= 2 ? qtile(lab, 0.5) : null,
    };
  }
  /* ---------- Gộp nhóm gần giống ---------- */
  // Cùng một công việc thường có nhiều nhóm vì mỗi nguồn / dự án ghi tên khác nhau ("Bê tông lót M150" ở CTG,
  // "Bê tông lót móng M150 đá 4x6" ở CSDL nội bộ). Gộp báo giá các nhóm khớp gần ngang nhóm chính để có nhiều mẫu hơn:
  // • điểm khớp ≥ 0.75 và không kém nhóm chính quá 0.15;
  // • đơn vị quy đổi được về đơn vị nhóm chính;
  // • không lệch thông số: các con số trong tên nhóm này phải nằm trong tên nhóm kia (M150 ⊂ "M150 đá 4x6", nhưng
  //   dày 100 ≠ dày 200), cùng loại thông số (mác, đường kính…) phải có giá trị chung;
  // • không thiếu ý chính của mô tả: các từ của mô tả BOQ mà nhóm chính có, nhóm gộp cũng phải có (≥ 65% theo IDF);
  // • không trái nghĩa (trong nhà / ngoài nhà, tròn / vuông, nóng / lạnh).
  // Nhóm QS đã chọn / dữ liệu học không gộp (QS đã quyết định nhóm); nhóm được ưu tiên (g.boost: đơn giá bổ sung QS nạp
  // cho chính dự án) dùng riêng, không gộp và không bị gộp. Tối đa 4 nhóm gộp thêm. -> [{ g, ratio }]
  const OPPOSITE = [['noithat', 'ngoaithat'], ['tron', 'vuong'], ['nong', 'lanh']];
  function numsCompatible(a, b) {
    const sub = (p, q) => [...p].every(t => q.has(t));
    if (a.nums.size && b.nums.size && !sub(a.nums, b.nums) && !sub(b.nums, a.nums)) return false;
    for (const [k, vs] of Object.entries(a.attr)) { const w = b.attr[k]; if (w && ![...vs].some(v => w.has(v))) return false; }
    return true;
  }
  function poolCands(IX, cands, k = 0, line = {}) {
    const c = cands[k];
    if (!c || c.picked || c.learned || c.unitOk === false || IX.groups[c.g].boost) return [];
    const g = IX.groups[c.g], out = [];
    const q = [...new Set(tokens(line.desc).concat(tokens(line.desc).length <= 4 ? tokens(line.near) : []))].filter(t => !/^\d/.test(t));
    const qg = q.filter(t => g.tw.has(t)), wq = qg.reduce((a, t) => a + (IX.idf.get(t) || 0), 0);
    const side = (grp, t) => grp.tw.has(t) || q.includes(t);
    for (const x of cands) {
      if (x === c || x.g === c.g || x.picked || x.learned || x.unitOk === false) continue;
      if (x.score < 0.75 || x.score < c.score - 0.15) continue;
      const h = IX.groups[x.g], r = unitRatio(h.unit, g.unit);
      if (h.boost || r === null || !numsCompatible(g, h)) continue;
      if (wq > 0 && qg.reduce((a, t) => a + (h.tw.has(t) ? IX.idf.get(t) || 0 : 0), 0) / wq < 0.65) continue;
      if (OPPOSITE.some(([a, b]) => (side(g, a) && h.tw.has(b) && !h.tw.has(a)) || (side(g, b) && h.tw.has(a) && !h.tw.has(b)))) continue;
      out.push({ g: x.g, ratio: x.unitOk === null ? r * c.ratio : x.ratio });
      if (out.length >= 4) break;
    }
    return out;
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
    let v = m.learned === 'exact' ? Math.max(m.score, 0.98) : m.score;   // QS đã xác nhận đúng mô tả này
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
    desc: ['mo ta', 'noi dung', 'ten cong viec', 'ten cong tac', 'noi dung cong viec', 'hang muc', 'description', 'dien giai', 'cong viec', 'item description', 'ten hang muc', 'mo ta cong viec', 'description of works', 'particulars', 'ten vat tu'],
    unit: ['don vi', 'dvt', 'dv', 'unit', 'units', 'don vi tinh', 'uom'],
    qty: ['khoi luong', 'kl', 'q ty', 'so luong', 'quantity', 'qty', 'quantities', 'sl'],
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
      if (n === k || n.startsWith(k + ' ')) best = Math.max(best, 3);   // "STT / Item": từ đầu tiên là tên cột
      else if ((' ' + n + ' ').includes(' ' + k + ' ')) best = Math.max(best, k.length >= 4 ? 2 : 1);
    }
    return best;
  }
  const PROP_HEAD = 'ĐƠN GIÁ ĐỀ XUẤT (CSDL)', PROP_RE = /\bde xuat csdl\b/;
  // grid: mảng 2 chiều giá trị ô (chuỗi/số/null). -> { headerRow, cols: {key: colIndex}, dataStart }
  //   cols.prop: cột giá đề xuất phần mềm đã thêm ở lần xuất trước (nếu có) — lần xuất sau ghi lại vào đúng cột đó
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
        // cột "ĐƠN GIÁ ĐỀ XUẤT (CSDL)" do chính phần mềm thêm ở lần xuất trước: không phải cột đơn giá của BOQ
        if (PROP_RE.test(norm(txt))) { if (cols.prop === undefined) cols.prop = c; continue; }
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
        // tiêu đề 2 dòng: dòng kế là tiêu đề song ngữ, hoặc dòng con ngắn ("Mời thầu / Dự thầu", "Vật liệu / Nhân công")
        const nextVals = next.filter(v => v !== null && v !== undefined && v !== '');
        const twoRow = next.some((v, c) => typeof v === 'string' && Object.keys(COLS).some(k => headerScore(v, k) >= 2) && !(typeof row[c] === 'number'))
          || (nextVals.length > 0 && nextVals.every(v => typeof v === 'string' && v.trim().length <= 30) && !next[cols.desc]);
        best = { headerRow: r, cols, total, dataStart: r + (twoRow ? 2 : 1) };
      }
    }
    if (!best) return null;
    // Tiêu đề nhóm 2 dòng: "ĐƠN GIÁ" / "THÀNH TIỀN" gộp ô bên trên, dòng dưới là Vật liệu | Nhân công | Máy | Tổng cộng.
    // Đơn giá và thành tiền của dòng là cột "Tổng cộng" của nhóm, không phải cột Vật liệu hay cột "Tổng cộng" nào đó.
    {
      const hr = grid[best.headerRow] || [], sub = grid[best.headerRow + 1] || [];
      const group = (re, key) => {
        const c0 = hr.findIndex(v => typeof v === 'string' && re.test(norm(v)));
        if (c0 < 0 || !/vat lieu|vat tu|material/.test(norm(sub[c0]))) return;
        let c1 = c0 + 1; while (c1 < hr.length && (hr[c1] === null || hr[c1] === undefined || hr[c1] === '')) c1++;
        for (let c = c0; c < c1; c++) {
          const t = norm(sub[c]);
          if (/^(tong( cong)?|total)$/.test(t)) best.cols[key] = c;
          else if (key === 'rate' && /vat lieu|vat tu|material/.test(t)) best.cols.mat = c;
          else if (key === 'rate' && /nhan cong|labou?r/.test(t)) best.cols.lab = c;
        }
      };
      group(/^don gia\b/, 'rate'); group(/^thanh tien\b/, 'amount');
    }
    // Cột trùng nhau: ưu tiên mô tả/đơn vị/khối lượng
    const used = new Set();
    for (const k of ['prop', 'desc', 'unit', 'qty', 'rate', 'amount', 'code', 'mat', 'lab', 'base', 'note']) {
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
    let codedLvl = 0;   // cấp của tiêu đề có mã gần nhất (A, I, 1.1…): tiêu đề không mã nằm ngay dưới nó
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
      // Dòng tổng / thuế / chuyển trang (chú ý: "CÔNG TÁC…" không phải "CỘNG", "TỔNG QUÁT" không phải dòng tổng)
      const SUM = /^(tong (cong|gia tri|so tien|tien|muc|hang muc|chi phi)|cong( \d+| hang muc| muc| don| chuyen trang)?$|cong (hang muc|muc|don|chuyen trang)\b|total|sub ?total|grand total|thue( vat| gtgt)?\b|vat\b|carried forward|brought forward|chuyen (sang )?trang|mang sang)/;
      if (SUM.test(nd) && !unit) {
        out.push({ kind: 'sum', r, desc, code, sheet: sheetName });
        continue;
      }
      // Ghi chú / thuyết minh: chữ "Ghi chú" ở cột đơn vị, đoạn văn dài, dòng "......" → không phải hạng mục hay tiêu đề
      const nu = norm(unit);
      if (/^(ghi chu|note|notes|remark|xem ghi chu)$/.test(nu) || /^[.…\-_\s]+$/.test(desc) || (!code && !unit && qty === null && desc.length > 90)) {
        out.push({ kind: 'note', r, desc, code, sheet: sheetName });
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
        let lvl;
        if (/^[A-Z]$|^[IVXLC]+$/.test(code)) lvl = 1;
        else if (/^\d+$/.test(code)) lvl = 2;
        else if (/^\d+(\.\d+)+$/.test(code)) lvl = 1 + code.split('.').length;
        if (lvl) codedLvl = lvl;
        else lvl = codedLvl + 1;   // các tiêu đề phụ không mã liền nhau là ngang cấp
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

  // Đánh giá giá baseline so với phân bố giá CSDL (ref: {p10, p25, p50, p75, p90}):
  // 'ok' phù hợp (trong P25–P75 hoặc lệch P50 ≤ tol) · 'xem' cần xem (trong P10–P90) · 'cao' / 'thap' không phù hợp (ngoài P10–P90)
  function judgeBaseline(base, ref, tol = 0.10) {
    if (!isNum(base) || base <= 0 || !ref || !isNum(ref.p50) || !(ref.p50 > 0)) return null;
    const d50 = base / ref.p50 - 1;
    let level;
    if ((base >= ref.p25 && base <= ref.p75) || Math.abs(d50) <= tol) level = 'ok';
    else if (base >= ref.p10 && base <= ref.p90) level = 'xem';
    else level = base > ref.p90 ? 'cao' : 'thap';
    return { level, d50, ok: level === 'ok' || level === 'xem' };
  }

  return { norm, tokens, setSynonyms, learnKey, resolveGroup, applyLearn, mergeLearn, tagSource, hasSource, mergeDB, yearFactors, poolCands, parseUnit, UNIT_BASES, unitRatio, qtile, percentRank, buildIndex, match, groupStats, rowPass, STRATEGY, confidence, detectColumns, extractLines, matchBaseline, judgeBaseline, diff, toNum, COLS, PROP_HEAD };
});
