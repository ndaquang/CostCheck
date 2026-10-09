'use strict';
/* Biểu đồ SVG tối giản (không thư viện ngoài, chạy offline). Màu lấy từ CSS variables. */
const CH = (() => {
  const NF = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });
  const esc = s => s === null || s === undefined ? '' : String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const short = v => { const a = Math.abs(v); return a >= 1e9 ? NF.format(v / 1e9) + ' tỷ' : a >= 1e6 ? NF.format(v / 1e6) + ' tr' : a >= 1e4 ? NF.format(v / 1e3) + 'k' : NF.format(v); };
  const SER = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)'];
  function niceTicks(min, max, n = 4) {
    if (min === max) { max = min + 1; }
    const step0 = (max - min) / n, mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= step0) || step0;
    const lo = Math.floor(min / step) * step, out = [];
    for (let v = lo; v <= max + step * 0.001; v += step) out.push(+v.toFixed(10));
    if (out[out.length - 1] < max) out.push(+(out[out.length - 1] + step).toFixed(10));   // trục luôn phủ giá trị lớn nhất
    return out;
  }
  const barTop = (x, y, w, h, r = 4) => { r = Math.min(r, w / 2, Math.abs(h)); return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`; };
  const barRight = (x, y, w, h, r = 4) => { r = Math.min(r, h / 2, Math.abs(w)); return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`; };

  // Cột dọc: data [{k, v, tip}]
  function vbar(data, o = {}) {
    if (!data.length) return '<div class="muted small">Không có dữ liệu</div>';
    const W = o.W || 560, H = o.H || 220, L = o.L || 44, B = 24, T = 14;
    const max = Math.max(...data.map(d => d.v)) || 1, ticks = niceTicks(0, max);
    const top = ticks[ticks.length - 1], bw = (W - L) / data.length;
    const yS = v => H - B - (v / top) * (H - B - T);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
    ticks.forEach(t => { s += `<line class="grid" x1="${L}" x2="${W}" y1="${yS(t)}" y2="${yS(t)}"/><text x="${L - 6}" y="${yS(t) + 4}" text-anchor="end">${(o.fmt || short)(t)}</text>`; });
    const every = Math.ceil(data.length / Math.floor((W - L) / 34));
    data.forEach((d, i) => {
      const x = L + i * bw, pad = Math.max(Math.min(6, bw * .18), (bw - 48) / 2), h = H - B - yS(d.v);
      if (d.v > 0) s += `<path class="bar" style="fill:${d.color || o.color || 'var(--series-1)'}" d="${barTop(x + pad, yS(d.v), bw - 2 * pad, h)}"/>`;
      if (o.labels && bw > 26) s += `<text x="${x + bw / 2}" y="${yS(d.v) - 4}" text-anchor="middle">${(o.lfmt || short)(d.v)}</text>`;
      if (i % every === 0) s += `<text x="${x + bw / 2}" y="${H - 7}" text-anchor="middle">${esc(d.k)}</text>`;
      s += `<rect class="hit" x="${x}" y="0" width="${bw}" height="${H - B}" data-tip="${esc(d.tip || d.k + ': ' + (o.fmt || short)(d.v))}"/>`;
    });
    if (o.vline !== undefined) { const x = L + o.vline * bw; s += `<line class="med" x1="${x}" x2="${x}" y1="${T - 4}" y2="${H - B}"/>`; }
    return s + '</svg>';
  }

  // Thanh ngang: data [{k, v, lo, hi, tip, color}], o.ref = đường tham chiếu (vd 1.0)
  function hbar(data, o = {}) {
    if (!data.length) return '<div class="muted small">Không có dữ liệu</div>';
    const W = o.W || 560, rowH = o.rowH || 24, L = o.L || 190, R = o.R || 70, H = data.length * rowH + 22;
    const vals = data.flatMap(d => [d.v, d.lo ?? d.v, d.hi ?? d.v]);
    let min = o.min ?? Math.min(0, ...vals), max = o.max ?? Math.max(...vals);
    if (o.ref !== undefined) { min = Math.min(min, o.ref); max = Math.max(max, o.ref); }
    const pad = (max - min) * 0.04; if (o.min === undefined && min !== 0) min -= pad; max += pad;
    const xS = v => L + (v - min) / (max - min || 1) * (W - L - R);
    const base = o.base ?? (min < 0 ? 0 : (o.ref ?? min));
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
    niceTicks(min, max, 4).filter(t => t >= min && t <= max).forEach(t => { s += `<line class="grid" x1="${xS(t)}" x2="${xS(t)}" y1="0" y2="${H - 18}"/><text x="${xS(t)}" y="${H - 4}" text-anchor="middle">${(o.tfmt || o.fmt || short)(t)}</text>`; });
    data.forEach((d, i) => {
      const y = i * rowH, x0 = xS(base), x1 = xS(d.v), bh = rowH - 9;
      const lab = String(d.k).length > (o.maxLab || 28) ? String(d.k).slice(0, (o.maxLab || 28) - 1) + '…' : d.k;
      s += `<text x="${L - 8}" y="${y + rowH / 2 + 4}" text-anchor="end">${esc(lab)}</text>`;
      const col = d.color || o.color || 'var(--series-1)';
      if (x1 >= x0) s += `<path class="bar" style="fill:${col}" d="${barRight(x0, y + 4, Math.max(1, x1 - x0), bh)}"/>`;
      else s += `<path class="bar" style="fill:${col}" transform="translate(${2 * x0},0) scale(-1,1)" d="${barRight(x0, y + 4, Math.max(1, x0 - x1), bh)}"/>`;
      if (d.lo !== undefined && d.hi !== undefined && d.lo !== null) s += `<line class="whisk" style="stroke:var(--text-2);stroke-width:1.5" x1="${xS(d.lo)}" x2="${xS(d.hi)}" y1="${y + rowH / 2 + 0.5}" y2="${y + rowH / 2 + 0.5}"/>`;
      s += `<text class="lbl" x="${Math.max(x1, x0, d.hi !== undefined && d.hi !== null ? xS(d.hi) : 0) + 6}" y="${y + rowH / 2 + 4}">${(o.lfmt || o.fmt || short)(d.v)}</text>`;
      s += `<rect class="hit" x="0" y="${y}" width="${W}" height="${rowH}" data-tip="${esc(d.tip || d.k + ': ' + (o.fmt || short)(d.v))}"/>`;
    });
    if (o.ref !== undefined) s += `<line class="ref" x1="${xS(o.ref)}" x2="${xS(o.ref)}" y1="0" y2="${H - 18}"/>`;
    return s + '</svg>';
  }

  // Đường: series [{name, color, dashed, pts:[{x, y, lo, hi, tip}]}]
  function line(series, o = {}) {
    const pts = series.flatMap(s => s.pts);
    if (!pts.length) return '<div class="muted small">Không có dữ liệu</div>';
    const W = o.W || 560, H = o.H || 240, L = o.L || 44, R = o.R || 16, B = 24, T = 12;
    const xs = pts.map(p => p.x), ys = pts.flatMap(p => [p.y, p.lo ?? p.y, p.hi ?? p.y]);
    if (o.ref !== undefined) ys.push(o.ref);
    const xmin = Math.min(...xs), xmax = Math.max(...xs), ticks = niceTicks(Math.min(...ys), Math.max(...ys));
    const ymin = ticks[0], ymax = ticks[ticks.length - 1];
    const xS = x => L + (x - xmin) / (xmax - xmin || 1) * (W - L - R), yS = y => H - B - (y - ymin) / (ymax - ymin || 1) * (H - B - T);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
    ticks.forEach(t => { s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${yS(t)}" y2="${yS(t)}"/><text x="${L - 6}" y="${yS(t) + 4}" text-anchor="end">${(o.fmt || short)(t)}</text>`; });
    [...new Set(xs)].sort((a, b) => a - b).forEach(x => { s += `<text x="${xS(x)}" y="${H - 7}" text-anchor="middle">${o.xfmt ? o.xfmt(x) : x}</text>`; });
    if (o.ref !== undefined) s += `<line class="ref" x1="${L}" x2="${W - R}" y1="${yS(o.ref)}" y2="${yS(o.ref)}"/>`;
    series.forEach((se, k) => {
      const col = se.color || SER[k % SER.length], P = se.pts.slice().sort((a, b) => a.x - b.x);
      const band = P.filter(p => p.lo !== undefined && p.lo !== null);
      if (band.length > 1) s += `<path class="band" d="M${band.map(p => `${xS(p.x)},${yS(p.hi)}`).join('L')}L${band.slice().reverse().map(p => `${xS(p.x)},${yS(p.lo)}`).join('L')}Z"/>`;
      if (P.length > 1) s += `<path class="line${se.dashed ? ' fc' : ''}" style="stroke:${col}" d="M${P.map(p => `${xS(p.x)},${yS(p.y)}`).join('L')}"/>`;
      P.forEach(p => { s += `<circle class="dot" style="fill:${col}" cx="${xS(p.x)}" cy="${yS(p.y)}" r="${p.r || 4}"/><circle class="hit" cx="${xS(p.x)}" cy="${yS(p.y)}" r="12" data-tip="${esc(p.tip || `${se.name ? se.name + ' · ' : ''}${p.x}: ${(o.fmt || short)(p.y)}`)}"/>`; });
      if (o.direct && P.length) { const p = P[P.length - 1]; s += `<text class="lbl" x="${xS(p.x) + 6}" y="${yS(p.y) + 4}">${esc(se.name)}</text>`; }
    });
    return s + '</svg>';
  }

  // Tán xạ: pts [{x, y, color, tip, r}]
  function scatter(pts, o = {}) {
    if (!pts.length) return '<div class="muted small">Không có dữ liệu</div>';
    const W = o.W || 560, H = o.H || 300, L = o.L || 48, R = 14, B = 30, T = 10;
    const xt = niceTicks(Math.min(...pts.map(p => p.x)), Math.max(...pts.map(p => p.x)), 5);
    const yt = niceTicks(Math.min(...pts.map(p => p.y), o.ref ?? Infinity), Math.max(...pts.map(p => p.y), o.ref ?? -Infinity), 5);
    const xS = x => L + (x - xt[0]) / (xt[xt.length - 1] - xt[0] || 1) * (W - L - R), yS = y => H - B - (y - yt[0]) / (yt[yt.length - 1] - yt[0] || 1) * (H - B - T);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
    yt.forEach(t => { s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${yS(t)}" y2="${yS(t)}"/><text x="${L - 6}" y="${yS(t) + 4}" text-anchor="end">${(o.yfmt || short)(t)}</text>`; });
    xt.forEach(t => { s += `<text x="${xS(t)}" y="${H - 10}" text-anchor="middle">${(o.xfmt || short)(t)}</text>`; });
    if (o.ref !== undefined) s += `<line class="ref" x1="${L}" x2="${W - R}" y1="${yS(o.ref)}" y2="${yS(o.ref)}"/>`;
    (o.lines || []).forEach(l => { if (l.pts.length > 1) s += `<path class="line" style="stroke:${l.color || 'var(--series-2)'};stroke-width:2.5" d="M${l.pts.map(p => `${xS(p.x)},${yS(p.y)}`).join('L')}"/>`; });
    pts.forEach(p => { s += `<circle class="dot" style="fill:${p.color || 'var(--series-1)'}" cx="${xS(p.x)}" cy="${yS(p.y)}" r="${p.r || 5}"><title></title></circle><circle class="hit" cx="${xS(p.x)}" cy="${yS(p.y)}" r="9" data-tip="${esc(p.tip || '')}"/>`; });
    if (o.xlabel) s += `<text x="${W - R}" y="${H - 22}" text-anchor="end">${esc(o.xlabel)}</text>`;
    return s + '</svg>';
  }

  // Màu phân kỳ cho ô nhiệt: v trong [-lim, lim]
  function diverge(v, lim = 30) {
    if (v === null || v === undefined) return 'transparent';
    const t = Math.max(-1, Math.min(1, v / lim)), a = Math.abs(t) * 0.85;
    return `color-mix(in srgb, ${t < 0 ? 'var(--div-neg)' : 'var(--div-pos)'} ${Math.round(a * 100)}%, var(--div-mid))`;
  }

  // Thanh khoảng mini (P10–P90, hộp P25–P75, vạch P50) theo thang log quanh P50
  function rangeMini(p10, p25, p50, p75, p90, W = 140, lim = Math.log(4)) {
    const x = v => W / 2 + Math.max(-1, Math.min(1, Math.log(v / p50) / lim)) * (W / 2 - 4);
    return `<svg class="chart" viewBox="0 0 ${W} 16" style="width:${W}px;height:16px"><line class="grid" x1="${W / 2}" x2="${W / 2}" y1="0" y2="16"/>` +
      `<line class="whisk" x1="${x(p10)}" x2="${x(p90)}" y1="8" y2="8"/><rect class="box" x="${x(p25)}" y="3" width="${Math.max(2, x(p75) - x(p25))}" height="10" rx="2"/>` +
      `<line class="medtick" x1="${x(p50)}" x2="${x(p50)}" y1="3" y2="13"/></svg>`;
  }

  function bindTips(root = document) {
    const tip = document.getElementById('tip');
    root.addEventListener('mousemove', e => {
      const h = e.target.closest && e.target.closest('[data-tip]');
      if (!h) { tip.hidden = true; return; }
      tip.textContent = h.dataset.tip; tip.hidden = false;
      tip.style.left = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8) + 'px';
      tip.style.top = (e.clientY + 16) + 'px';
    });
    root.addEventListener('mouseleave', () => { tip.hidden = true; });
  }
  return { vbar, hbar, line, scatter, diverge, rangeMini, bindTips, short, esc, SER, NF };
})();
