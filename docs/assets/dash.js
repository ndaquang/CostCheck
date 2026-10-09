'use strict';
/* Mục Phân tích — dữ liệu từ data/analysis.js (tạo bởi analysis.py). Bọc trong hàm riêng để không trùng tên với app.js;
   chỉ nạp analysis.js khi người dùng mở mục Phân tích. */
window.DASH = (() => {
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const { esc, short } = CH;
const NF0 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const NF1 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });
const f0 = v => v === null || v === undefined ? '–' : NF0.format(v);
const f1 = v => v === null || v === undefined ? '–' : NF1.format(v);
const pct = v => v === null || v === undefined ? '–' : (v > 0 ? '+' : '') + NF1.format(v) + '%';
let AN;

function boot() {
  if (window.SECURE) {
    window.SECURE.load('analysis').then(txt => { AN = JSON.parse(txt); init(); })
      .catch(e => { $('#view').innerHTML = `<div class="empty">Không mở được kết quả phân tích: ${esc(String(e && e.message || e))}</div>`; });
    return;
  }
  const s = document.createElement('script');
  s.src = 'data/analysis.js';
  s.onload = () => { AN = window.AN; init(); };
  s.onerror = () => {
    $('#view').innerHTML = '<div class="empty">Chưa có data/analysis.js — chạy <code>python analysis.py</code> trong thư mục WEB (sau CLEANED/clean_data.py).</div>';
  };
  document.body.appendChild(s);
}

const TABS = {};
function init() {
  const o = AN.overview;
  $('#an-meta').textContent = `Kết quả phân tích lúc ${AN.built} · ${f0(o.rows)} đơn giá sạch · ${f0(o.projects)} dự án · ${o.years[0]}–${o.years[1]}`;
  $('#tabs').onclick = e => { const b = e.target.closest('button[data-tab]'); if (b) show(b.dataset.tab); };
  show('overview');
}
const TECH = { anomaly: 'Bất thường (ML)', names: 'Chuẩn hóa & phân loại', algos: '50 thuật toán – giả sử áp dụng' };
const TAB_NAME = { overview: 'Tổng quan', index: 'Chỉ số giá', factors: 'Tỉnh & loại hình', labour: 'Vật liệu – nhân công', mc: 'Mô phỏng chi phí',
  cluster: 'Phân cụm dự án', articles: 'Bài phân tích', bench: 'Mô phỏng chi phí', ...TECH };
let techSub = 'anomaly';
function show(tab) {
  if (tab === 'bench') tab = 'mc';
  if (TECH[tab]) { techSub = tab; tab = 'tech'; }
  if (!TABS[tab]) tab = 'overview';
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  $('#view').innerHTML = '';
  TABS[tab]($('#view'));
  window.scrollTo({ top: 0 });
}
let started = false;
function start() { if (!started) { started = true; boot(); } }
const head = (title, intro, method, algos = []) =>
  `<h2>${title}</h2><p class="intro">${intro}</p>` +
  (method ? `<div class="method">${algos.map(a => `<span class="algo-chip">#${a}</span>`).join('')}<b>Phương pháp:</b> ${method}</div>` : '');
const card = (title, cap, body, cls = '') => `<div class="card ${cls}"><h3>${title}</h3>${cap ? `<div class="cap">${cap}</div>` : ''}<div class="chart">${body}</div></div>`;
const kpi = (k, v, s = '') => `<div class="kpi"><div class="k">${k}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
function table(cols, rows, cls = '') {
  return `<div class="tbl-wrap ${cls}"><table><thead><tr>${cols.map(c => `<th${c.num ? ' class="num"' : ''}>${c.t}</th>`).join('')}</tr></thead><tbody>` +
    rows.map(r => `<tr${r._attr || ''}>${cols.map((c, i) => `<td${c.num ? ' class="num"' : ''}${r._style && r._style[i] ? ` style="${r._style[i]}"` : ''}>${r[i] ?? ''}</td>`).join('')}</tr>`).join('') + `</tbody></table></div>`;
}

/* ---------- 1. Tổng quan ---------- */
TABS.tech = v => {
  v.innerHTML = `<div class="seg tech-seg">${Object.entries(TECH).map(([k, l]) => `<button data-sub="${k}" class="${k === techSub ? 'on' : ''}">${esc(l)}</button>`).join('')}</div><div id="tech-view"></div>`;
  TABS[techSub]($('#tech-view'));
  $('.tech-seg', v).onclick = e => { const b = e.target.closest('[data-sub]'); if (b) { techSub = b.dataset.sub; TABS.tech(v); } };
};
TABS.overview = v => {
  const o = AN.overview, q = o.quality, tot = q.scores.length ? q.scores[q.scores.length - 1] : null;
  const st = Object.fromEntries(o.byStatus);
  const sevOrder = { 'Cao': 0, 'Trung bình': 1, 'Thấp': 2, 'Thông tin': 3 };
  v.innerHTML = head('Tổng quan cơ sở dữ liệu đơn giá', 'Dữ liệu sau khi làm sạch (CLEANED/CSDL_DON_GIA_SACH.xlsx). Dòng REVIEW vẫn được giữ nhưng cần xem lý do trước khi dùng làm giá tham khảo.') +
    `<div class="kpis">${kpi('Dòng đơn giá sạch', f0(o.rows), `${f0(st.KEEP || 0)} KEEP · ${f0(st.REVIEW || 0)} REVIEW`)}${kpi('Dòng dùng phân tích', f0(o.rowsAnalysis), 'bỏ ngoại lai nghi sai & trùng chéo dự án')}${kpi('Dự án', f0(o.projects))}${kpi('Hạng mục duy nhất', f0(o.items), 'tên chuẩn hóa + đơn vị')}${kpi('Giai đoạn', `${o.years[0]}–${o.years[1]}`)}${tot ? kpi('Điểm chất lượng', `${f1(tot[2])}<small style="font-size:13px;color:var(--muted)">/100</small>`, `trước làm sạch: ${f1(tot[1])}`) : ''}</div>` +
    `<div class="grid2">${card('Số dòng theo năm báo giá', '', CH.vbar(o.byYear.map(([k, n]) => ({ k, v: n, tip: `${k}: ${f0(n)} dòng` })), { labels: true }))}` +
    card('Số dòng theo nhóm công việc', 'NRM2 nhóm lớn', CH.hbar(o.byGroup.map(([k, n]) => ({ k, v: n, tip: `${k}: ${f0(n)} dòng` })), { L: 210 })) + `</div>` +
    `<div class="grid2">${card('Theo loại hình dự án', '', CH.hbar(o.byType.map(([k, n]) => ({ k, v: n, tip: `${k}: ${f0(n)} dòng` })), { L: 230 }))}` +
    card('Theo tỉnh/TP (sau sáp nhập 2025)', '12 tỉnh nhiều dữ liệu nhất', CH.hbar(o.byProv.slice(0, 12).map(([k, n]) => ({ k, v: n, tip: `${k}: ${f0(n)} dòng` })), { L: 170 })) + `</div>` +
    (q.scores.length ? `<div class="grid2">${card('Điểm chất lượng dữ liệu theo chiều', 'Trước → sau làm sạch (%). Trọng số: Đầy đủ 20, Duy nhất 15, Nhất quán 15, Hợp lệ 20, Chính xác 20, Chuẩn hóa 10',
      table([{ t: 'Chiều' }, { t: 'Trước', num: 1 }, { t: 'Sau', num: 1 }, { t: 'Vấn đề còn lại' }], q.scores.map(s => [esc(s[0]), f1(s[1]), `<b>${f1(s[2])}</b>`, `<span class="small muted">${esc(s[4])}</span>`])))}` +
      card('Vấn đề chính phát hiện khi làm sạch', 'Chi tiết: CLEANED/BAO_CAO_CHAT_LUONG.xlsx',
        table([{ t: 'Vấn đề' }, { t: 'Số lượng', num: 1 }, { t: 'Mức' }], q.issues.filter(i => sevOrder[i[2]] <= 1).sort((a, b) => sevOrder[a[2]] - sevOrder[b[2]] || b[1] - a[1]).map(i => [esc(i[0]), f0(i[1]), `<span class="tag ${i[2] === 'Cao' ? 'hi' : 'lo'}">${esc(i[2])}</span>`]), 'tall')) + `</div>` : '');
};

/* ---------- 2. Chỉ số giá ---------- */
TABS.index = v => {
  const I = AN.index, ov = I.overall, base = AN.baseYear;
  const main = [{ name: 'Chỉ số chung', pts: ov.map(d => ({ x: d.year, y: d.index, lo: d.lo, hi: d.hi, r: d.n < 300 ? 3 : 4, tip: `${d.year}: ${f1(d.index)} (CI 90%: ${f1(d.lo)}–${f1(d.hi)}) · ${f0(d.n)} dòng` })) },
  { name: 'Kịch bản đà tăng (Holt hãm)', dashed: true, color: 'var(--series-2)', pts: [{ x: base, y: 100 }, ...I.forecast.map(d => ({ x: d.year, y: d.index, tip: `Holt ${d.year}: ${f1(d.index)}` }))] },
  { name: 'Kịch bản xu hướng 2022–' + base, dashed: true, color: 'var(--series-3)', pts: [{ x: base, y: 100 }, ...I.trendForecast.map(d => ({ x: d.year, y: d.index, tip: `Xu hướng ${d.year}: ${f1(d.index)}` }))] }];
  const recent = ov.filter(d => d.year >= 2022), prev = ov.find(d => d.year === base - 1);
  v.innerHTML = head('Chỉ số giá theo năm', `So sánh CÙNG một hạng mục qua các năm (đã khử ảnh hưởng tỉnh và loại hình) → mặt bằng giá ${base} = 100. Dùng để quy đổi đơn giá cũ về hiện tại và dự báo năm tới.`,
    `Hồi quy hiệu ứng cố định log(đơn giá) = hạng mục + năm + tỉnh + loại hình (backfitting 1.000 vòng); khoảng tin cậy 90% bằng bootstrap 40 lần theo dự án; dự báo 2 kịch bản: Holt có hãm xu hướng (φ) và xu hướng log-tuyến tính 2022–${base}. Ẩn các năm < ${I.minRows} dòng${I.hidden.length ? ' (' + I.hidden.join(', ') + ')' : ''}.`, [6, 10, 36]) +
    `<div class="kpis">${kpi(`Tăng bình quân 2022–${base}`, pct(I.cagr), '/năm (xu hướng log-tuyến tính)')}${prev ? kpi(`${base - 1} → ${base}`, pct((100 / prev.index - 1) * 100), I.yoy ? `kiểm chứng: ${f0(I.yoy.items)} hạng mục chung, trung vị ${pct(I.yoy.median)}` : '') : ''}${kpi(`Dự báo ${base + 1} (Holt)`, f1(I.forecast[0].index), `α=${I.holt.alpha}, β=${I.holt.beta}, φ=${I.holt.phi}`)}${kpi(`Dự báo ${base + 1} (xu hướng)`, f1(I.trendForecast[0].index), `${base + 2}: ${f1(I.trendForecast[1].index)}`)}</div>` +
    `<div class="grid2">${card('Chỉ số giá chung (' + base + ' = 100)', 'Dải mờ = khoảng tin cậy 90%. Hai đường nét đứt = hai kịch bản dự báo.', `<div class="legend"><span><i style="background:var(--series-1)"></i>Chỉ số</span><span><i style="background:var(--series-2)"></i>Kịch bản đà tăng (Holt hãm)</span><span><i style="background:var(--series-3)"></i>Kịch bản xu hướng 2022–${base}</span></div>` + CH.line(main, { ref: 100, fmt: v => f1(v) }))}` +
    `<div class="card"><h3>Quy đổi đơn giá theo năm (giả sử)</h3><div class="cap">Nhập đơn giá ở năm báo giá → giá tương đương năm khác theo chỉ số.</div>
      <div class="ctrl"><label>Đơn giá <input type="number" id="ix-p" value="1500000" step="1000"></label>
      <label>Năm gốc <select id="ix-from">${ov.map(d => `<option${d.year === 2023 ? ' selected' : ''}>${d.year}</option>`).join('')}</select></label>
      <label>Quy về <select id="ix-to">${ov.map(d => `<option value="${d.year}"${d.year === base ? ' selected' : ''}>${d.year}</option>`).join('')}${I.forecast.map(d => `<option value="H${d.year}">${d.year} (Holt)</option>`).join('')}${I.trendForecast.map(d => `<option value="T${d.year}">${d.year} (xu hướng)</option>`).join('')}</select></label></div>
      <div id="ix-out" class="kpis"></div>
      ${table([{ t: 'Năm' }, { t: 'Chỉ số', num: 1 }, { t: 'CI 90%', num: 1 }, { t: 'Số dòng', num: 1 }], ov.slice().reverse().map(d => [d.year, `<b>${f1(d.index)}</b>`, `${f1(d.lo)} – ${f1(d.hi)}`, f0(d.n)]), 'tall')}</div></div>` +
    `<h3 style="margin:6px 0 10px">Chỉ số theo nhóm công việc</h3><div class="grid3">` +
    I.groups.map(g => card(esc(g.group), `${f0(g.n)} dòng`, CH.line([{ name: g.group, pts: g.series.map(d => ({ x: d.year, y: d.index, tip: `${g.group} ${d.year}: ${f1(d.index)} · ${f0(d.n)} dòng` })) }], { ref: 100, H: 180, W: 420, fmt: v => f1(v) }))).join('') + `</div>`;
  const all = [...ov.map(d => ({ ...d, key: String(d.year) })), ...I.forecast.map(d => ({ ...d, key: 'H' + d.year })), ...I.trendForecast.map(d => ({ ...d, key: 'T' + d.year }))];
  const calc = () => {
    const p = +$('#ix-p').value || 0, a = all.find(d => d.key == $('#ix-from').value), b = all.find(d => d.key == $('#ix-to').value);
    const r = b.index / a.index;
    $('#ix-out').innerHTML = kpi('Đơn giá quy đổi', f0(p * r), `× ${NF1.format(r * 100) / 100} (${f1(b.index)} / ${f1(a.index)})`) + kpi('Chênh lệch', pct((r - 1) * 100));
  };
  ['#ix-p', '#ix-from', '#ix-to'].forEach(s => $(s).oninput = calc); calc();
};

/* ---------- 3. Địa điểm & loại hình ---------- */
TABS.factors = v => {
  const F = AN.factors;
  const fac = (rows, L) => CH.hbar(rows.map(r => ({ k: r.name + (r.projects < 3 ? ' *' : ''), v: r.factor, lo: r.lo, hi: r.hi, color: r.projects < 3 || r.name === '(Không rõ)' ? 'var(--muted)' : undefined, tip: `${r.name}: ×${r.factor} (CI 90% ${r.lo}–${r.hi}) · ${f0(r.n)} dòng, ${r.projects} dự án` })), { ref: 1, base: 1, L, fmt: v => '×' + NF1.format(v * 100) / 100, lfmt: v => '×' + v.toFixed(2), rowH: 25 });
  v.innerHTML = head('Hệ số địa điểm & loại hình dự án', 'Cùng hạng mục, cùng năm báo giá: dự án ở tỉnh/loại hình nào đắt hơn? Hệ số 1,00 = mức bình quân toàn CSDL.',
    `Hồi quy bội log(đơn giá) = hạng mục + năm + tỉnh + loại hình (R² = ${F.r2}, ${f0(F.n)} dòng); khoảng tin cậy 90% bằng bootstrap 30 lần theo dự án. Chỉ hiển thị nhóm ≥ 200 dòng.`, [7, 10]) +
    `<div class="grid2">${card('Hệ số theo tỉnh/TP (2025)', 'Vạch ngang = CI 90%. Thanh xám + dấu * = dưới 3 dự án hoặc chưa rõ tỉnh → không dùng làm hệ số.', fac(F.province, 150))}${card('Hệ số theo loại hình dự án', 'Phản ánh cả khác biệt tiêu chuẩn kỹ thuật/hoàn thiện giữa loại hình', fac(F.type, 230))}</div>` +
    `<div class="card full"><h3>Ước tính tương tự (analogous) — giả sử áp dụng #7</h3><div class="cap">Chi phí mới = Chi phí gốc × (Q mới / Q gốc)<sup>n</sup> × hệ số năm × hệ số tỉnh × hệ số loại hình. Hệ số lấy từ dữ liệu, n theo bảng tham khảo (nhà xưởng 0,80–0,90).</div>
     <div class="ctrl">
      <label>Chi phí gốc (tỷ) <input type="number" id="an-c" value="45" step="0.5" style="width:90px"></label>
      <label>Quy mô gốc (m²) <input type="number" id="an-q0" value="5000" style="width:100px"></label>
      <label>Quy mô mới (m²) <input type="number" id="an-q1" value="8000" style="width:100px"></label>
      <label>n <input type="number" id="an-n" value="0.85" step="0.05" style="width:70px"></label>
     </div><div class="ctrl">
      <label>Năm gốc <select id="an-y0">${AN.index.overall.map(d => `<option${d.year === 2024 ? ' selected' : ''}>${d.year}</option>`).join('')}</select></label>
      <label>Năm mới <select id="an-y1">${[...AN.index.overall, ...AN.index.forecast].map(d => `<option${d.year === AN.baseYear ? ' selected' : ''}>${d.year}</option>`).join('')}</select></label>
      <label>Tỉnh gốc <select id="an-p0">${F.province.map(r => `<option value="${r.factor}"${r.name === 'TP. Hồ Chí Minh' ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
      <label>Tỉnh mới <select id="an-p1">${F.province.map(r => `<option value="${r.factor}"${r.name === 'Tây Ninh' ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
      <label>Loại hình gốc <select id="an-t0">${F.type.map(r => `<option value="${r.factor}"${r.name === 'Nhà xưởng công nghiệp' ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
      <label>Loại hình mới <select id="an-t1">${F.type.map(r => `<option value="${r.factor}"${r.name === 'Nhà xưởng công nghiệp' ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
     </div><div class="kpis" id="an-out"></div></div>` +
    `<div class="grid2">${card('Bảng hệ số tỉnh', '', table([{ t: 'Tỉnh/TP' }, { t: 'Hệ số', num: 1 }, { t: 'CI 90%', num: 1 }, { t: 'Dòng', num: 1 }, { t: 'Dự án', num: 1 }], F.province.map(r => [esc(r.name), `<b>${r.factor.toFixed(3)}</b>`, `${r.lo.toFixed(2)}–${r.hi.toFixed(2)}`, f0(r.n), r.projects]), 'tall'))}` +
    card('Bảng hệ số loại hình', '', table([{ t: 'Loại hình' }, { t: 'Hệ số', num: 1 }, { t: 'CI 90%', num: 1 }, { t: 'Dòng', num: 1 }, { t: 'Dự án', num: 1 }], F.type.map(r => [esc(r.name), `<b>${r.factor.toFixed(3)}</b>`, `${r.lo.toFixed(2)}–${r.hi.toFixed(2)}`, f0(r.n), r.projects]), 'tall')) + `</div>`;
  const all = [...AN.index.overall, ...AN.index.forecast];
  const calc = () => {
    const c = +$('#an-c').value, q0 = +$('#an-q0').value, q1 = +$('#an-q1').value, n = +$('#an-n').value;
    const fq = Math.pow(q1 / q0, n), fy = all.find(d => d.year == $('#an-y1').value).index / all.find(d => d.year == $('#an-y0').value).index;
    const fp = $('#an-p1').value / $('#an-p0').value, ft = $('#an-t1').value / $('#an-t0').value, res = c * fq * fy * fp * ft;
    $('#an-out').innerHTML = kpi('Chi phí ước tính', NF1.format(Math.round(res * 10) / 10) + ' tỷ', `${f0(res * 1e9 / q1)} đ/m²`) + kpi('Hệ số quy mô', fq.toFixed(3), `tuyến tính sẽ là ${(q1 / q0).toFixed(3)}`) +
      kpi('Hệ số năm', fy.toFixed(3)) + kpi('Hệ số tỉnh', fp.toFixed(3)) + kpi('Hệ số loại hình', ft.toFixed(3));
  };
  $$('#view input, #view select').forEach(e => e.oninput = calc); calc();
};

/* ---------- 4. Đơn giá chuẩn ---------- */
TABS.bench = v => {
  const B = AN.bench, groups = [...new Set(B.map(b => b.group))];
  v.innerHTML = head('Đơn giá chuẩn theo hạng mục', `${B.length} hạng mục có dữ liệu từ ≥ 8 dự án. Giá đã quy về mặt bằng ${AN.baseYear} bằng chỉ số giá. Thanh khoảng: vạch = P10–P90, hộp = P25–P75, vạch trắng = P50 (thang log, giữa = P50).`,
    'Ước tính ba điểm từ dữ liệu thật: a = P10, m = P50, b = P90 → E = (a + 4m + b)/6, σ = (b − a)/6. Độ phân tán = (P75 − P25)/P50. Xu hướng = độ dốc hồi quy log(giá) theo năm của riêng hạng mục.', [9, 6]) +
    `<div class="ctrl"><input type="search" id="b-q" placeholder="Lọc tên hạng mục… (không dấu cũng được)"><select id="b-g"><option value="">Mọi nhóm</option>${groups.map(g => `<option>${esc(g)}</option>`).join('')}</select>
     <select id="b-s"><option value="projects">Nhiều dự án nhất</option><option value="cv">Phân tán nhất</option><option value="trend">Tăng giá nhanh nhất</option><option value="trendAsc">Giảm giá / tăng chậm</option><option value="p50">Đơn giá cao nhất</option></select><span class="muted small" id="b-c"></span></div><div id="b-t"></div>`;
  const nz = s => String(s).toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const draw = () => {
    const q = nz($('#b-q').value.trim()), g = $('#b-g').value, s = $('#b-s').value;
    let rows = B.filter(b => (!g || b.group === g) && (!q || q.split(/\s+/).every(w => nz(b.name).includes(w))));
    const key = { projects: b => -b.projects, cv: b => -(b.cv ?? 0), trend: b => -(b.trend ?? -99), trendAsc: b => (b.trend ?? 99), p50: b => -b.p50 }[s];
    rows.sort((a, b) => key(a) - key(b));
    $('#b-c').textContent = `${rows.length} hạng mục`;
    $('#b-t').innerHTML = table([{ t: 'Hạng mục' }, { t: 'ĐV' }, { t: 'DA', num: 1 }, { t: 'Phân bố' }, { t: 'P10', num: 1 }, { t: 'P50', num: 1 }, { t: 'P90', num: 1 }, { t: 'E (3 điểm)', num: 1 }, { t: 'σ', num: 1 }, { t: 'Phân tán', num: 1 }, { t: 'Xu hướng/năm', num: 1 }, { t: `Gần nhất (${AN.baseYear - 1}–${AN.baseYear})`, num: 1 }],
      rows.slice(0, 250).map(b => [`${esc(b.name)}<div class="small muted">${esc(b.group)}${b.work ? ' · ' + esc(b.work) : ''}</div>`, esc(b.unit), b.projects,
      CH.rangeMini(b.p10, b.p25, b.p50, b.p75, b.p90), f0(b.p10), `<b>${f0(b.p50)}</b>`, f0(b.p90), f0(b.E), f0(b.sd),
      `<span style="color:${b.cv > 50 ? 'var(--warn-hi)' : 'inherit'}">${f0(b.cv)}%</span>`, b.trend === null ? '–' : pct(b.trend), b.recent ? `${f0(b.recent)} <span class="small muted">(${b.nRecent})</span>` : '–']), 'tall');
  };
  ['#b-q', '#b-g', '#b-s'].forEach(s => $(s).oninput = draw); draw();
};

/* ---------- 5. Vật liệu – nhân công ---------- */
TABS.labour = v => {
  const Lb = AN.labour;
  v.innerHTML = head('Cơ cấu vật liệu – nhân công', `Tỷ lệ nhân công = NC / (VL + NC + Máy) trên ${f0(Lb.n)} dòng có tách đơn giá thành phần. Dùng để tách rủi ro trượt giá vật liệu và lương.`, null) +
    `<div class="kpis">${kpi('Tỷ lệ nhân công trung vị', f1(Lb.overall) + '%')}${kpi('Loại công việc phân tích', Lb.byWork.length, '≥ 60 dòng mỗi loại')}</div>` +
    `<div class="grid2">${card('Tỷ lệ nhân công theo loại công việc', 'Thanh = trung vị; vạch = P25–P75', CH.hbar(Lb.byWork.slice(0, 30).map(w => ({ k: w.work, v: w.p50, lo: w.p25, hi: w.p75, tip: `${w.work}: trung vị ${f1(w.p50)}% (P25–P75: ${f1(w.p25)}–${f1(w.p75)}%) · ${f0(w.n)} dòng` })), { L: 200, min: 0, max: 100, fmt: v => f0(v) + '%', rowH: 22 }))}` +
    `<div>${card('Tỷ lệ nhân công theo năm', '', CH.line([{ name: 'Tỷ lệ NC', pts: Lb.byYear.map(([y, p, n]) => ({ x: y, y: p, tip: `${y}: ${f1(p)}% · ${f0(n)} dòng` })) }], { fmt: v => f0(v) + '%', H: 200 }))}
     <div class="card" style="margin-top:14px"><h3>Giả sử giá vật liệu thay đổi</h3><div class="cap">ΔĐG ≈ ĐG × (1 − tỷ lệ NC) × %thay đổi VL + ĐG × tỷ lệ NC × %thay đổi lương</div>
     <div class="ctrl"><label>Loại công việc <select id="lb-w">${Lb.byWork.map(w => `<option value="${w.p50}">${esc(w.work)}</option>`).join('')}</select></label>
     <label>Đơn giá <input type="number" id="lb-p" value="1000000" step="1000" style="width:120px"></label></div>
     <div class="ctrl"><label>VL thay đổi <input type="range" id="lb-m" min="-30" max="50" value="10"> <b id="lb-mv"></b></label><label>Lương thay đổi <input type="range" id="lb-l" min="-20" max="40" value="5"> <b id="lb-lv"></b></label></div>
     <div class="kpis" id="lb-out"></div></div></div></div>`;
  const calc = () => {
    const s = +$('#lb-w').value / 100, p = +$('#lb-p').value, m = +$('#lb-m').value, l = +$('#lb-l').value;
    $('#lb-mv').textContent = pct(m); $('#lb-lv').textContent = pct(l);
    const np = p * (1 + (1 - s) * m / 100 + s * l / 100);
    $('#lb-out').innerHTML = kpi('Đơn giá mới', f0(np), pct((np / p - 1) * 100)) + kpi('Tỷ lệ NC áp dụng', f1(s * 100) + '%');
  };
  ['#lb-w', '#lb-p', '#lb-m', '#lb-l'].forEach(s => $(s).oninput = calc); calc();
};

/* ---------- 6. Monte Carlo ---------- */
const MC = { rows: null };
function erf(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x)), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }
const Phi = x => 0.5 * (1 + erf(x / Math.SQRT2));
function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const qAt = (q, u) => { const x = u * (q.length - 1), i = Math.floor(x), f = x - i; return i >= q.length - 1 ? q[q.length - 1] : q[i] + (q[i + 1] - q[i]) * f; };
TABS.mc = v => {
  const combos = AN.combos, key = c => c.work + '|' + c.unit;
  const cmap = Object.fromEntries(combos.map(c => [key(c), c]));
  if (!MC.rows) MC.rows = AN.mcTemplate.items.map(i => ({ k: i.work + '|' + i.unit, qty: i.qty }));
  v.innerHTML = head('Mô phỏng Monte Carlo chi phí (giả sử áp dụng #8, #9, #46)', `Mỗi hạng mục lấy ngẫu nhiên đơn giá từ PHÂN PHỐI THẬT trong CSDL (đã quy về ${AN.baseYear}), nhân khối lượng, cộng tổng — lặp hàng nghìn lần → xác suất vượt ngân sách. Khối lượng mẫu là GIẢ ĐỊNH: "${esc(AN.mcTemplate.name)}" — sửa theo dự án của bạn.`,
    'Lấy mẫu nghịch đảo hàm phân phối thực nghiệm (41 phân vị, đã cắt P2/P98). Tương quan giá giữa các hạng mục mô phỏng bằng nhân tố chung (Gaussian copula, hệ số ρ). Tornado = mức dao động chi phí P10→P90 của từng hạng mục.', [8, 9, 46]) +
    `<div class="grid2"><div class="card"><h3>Khối lượng (giả định)</h3><div class="cap">Chọn loại công việc + đơn vị có trong CSDL (≥ 40 dòng). Đơn giá P10/P50/P90 tham khảo.</div>
      <div class="tbl-wrap tall mc-items"><table><thead><tr><th>Hạng mục</th><th class="num">Khối lượng</th><th class="num">P10</th><th class="num">P50</th><th class="num">P90</th><th></th></tr></thead><tbody id="mc-body"></tbody></table></div>
      <div class="ctrl" style="margin-top:10px"><button class="btn" id="mc-add">+ Thêm hạng mục</button><button class="btn" id="mc-reset">Khôi phục mẫu</button></div></div>
     <div class="card"><h3>Thiết lập</h3>
      <div class="ctrl"><label>Diện tích sàn (m²) <input type="number" id="mc-gfa" value="${AN.mcTemplate.gfa}" style="width:110px"></label><label>Số lần lặp <select id="mc-n"><option>2000</option><option selected>10000</option><option>30000</option></select></label></div>
      <div class="ctrl"><label>Tương quan giá ρ <input type="range" id="mc-rho" min="0" max="0.9" step="0.1" value="0.3"> <b id="mc-rv">0,3</b></label></div>
      <div class="ctrl"><label>Ngân sách để kiểm tra (tỷ) <input type="number" id="mc-bud" step="0.5" style="width:100px"></label><button class="btn primary" id="mc-run">Chạy mô phỏng</button></div>
      <div class="note">ρ = 0: giá các hạng mục độc lập (lạc quan). ρ cao: thị trường cùng tăng/giảm (thép, xi măng…) → đuôi rủi ro dày hơn.</div>
      <div class="kpis" id="mc-kpi" style="margin-top:12px"></div></div></div>
     <div class="grid2" id="mc-res"></div>`;
  const opts = combos.map(c => `<option value="${esc(key(c))}">${esc(c.work)} (${esc(c.unit)}) · ${c.projects} DA</option>`).join('');
  const drawRows = () => {
    $('#mc-body').innerHTML = MC.rows.map((r, i) => {
      const c = cmap[r.k];
      return `<tr><td><select data-i="${i}" class="mc-k">${opts.replace(`value="${esc(r.k)}"`, `value="${esc(r.k)}" selected`)}</select></td>
        <td class="num"><input type="number" data-i="${i}" class="mc-q" value="${r.qty}"></td><td class="num">${f0(qAt(c.q, .1))}</td><td class="num"><b>${f0(qAt(c.q, .5))}</b></td><td class="num">${f0(qAt(c.q, .9))}</td>
        <td><button class="ghost" data-del="${i}" title="Bỏ">✕</button></td></tr>`;
    }).join('');
  };
  drawRows();
  $('#mc-body').onchange = e => { const i = +e.target.dataset.i; if (e.target.classList.contains('mc-k')) { MC.rows[i].k = e.target.value; drawRows(); } if (e.target.classList.contains('mc-q')) MC.rows[i].qty = +e.target.value; };
  $('#mc-body').onclick = e => { const b = e.target.closest('[data-del]'); if (b) { MC.rows.splice(+b.dataset.del, 1); drawRows(); } };
  $('#mc-add').onclick = () => { MC.rows.push({ k: key(combos[0]), qty: 100 }); drawRows(); };
  $('#mc-reset').onclick = () => { MC.rows = AN.mcTemplate.items.map(i => ({ k: i.work + '|' + i.unit, qty: i.qty })); drawRows(); };
  $('#mc-rho').oninput = e => $('#mc-rv').textContent = NF1.format(+e.target.value);
  $('#mc-run').onclick = run;
  function run() {
    const rho = +$('#mc-rho').value, n = +$('#mc-n').value, gfa = +$('#mc-gfa').value || 1;
    const items = MC.rows.filter(r => cmap[r.k] && r.qty > 0).map(r => ({ ...r, c: cmap[r.k] }));
    const tot = new Float64Array(n), per = items.map(() => new Float64Array(n)), s1 = Math.sqrt(1 - rho * rho);
    for (let t = 0; t < n; t++) {
      const zc = gauss(); let sum = 0;
      items.forEach((it, j) => { const u = Phi(rho * zc + s1 * gauss()); const c = it.qty * qAt(it.c.q, u); per[j][t] = c; sum += c; });
      tot[t] = sum;
    }
    const srt = Float64Array.from(tot).sort(), P = p => srt[Math.min(n - 1, Math.floor(p * n))];
    const mean = tot.reduce((a, b) => a + b, 0) / n;
    // 3 điểm (#9)
    let E3 = 0, V3 = 0;
    items.forEach(it => { const a = qAt(it.c.q, .1) * it.qty, m = qAt(it.c.q, .5) * it.qty, b = qAt(it.c.q, .9) * it.qty; E3 += (a + 4 * m + b) / 6; V3 += ((b - a) / 6) ** 2; });
    const ty = v => NF1.format(Math.round(v / 1e8) / 10) + ' tỷ';
    const bud = +$('#mc-bud').value ? +$('#mc-bud').value * 1e9 : P(.5);
    if (!+$('#mc-bud').value) $('#mc-bud').value = (Math.round(P(.5) / 1e8) / 10);
    const pOver = tot.filter(x => x > bud).length / n;
    $('#mc-kpi').innerHTML = kpi('P50 (50/50)', ty(P(.5)), `${f0(P(.5) / gfa)} đ/m²`) + kpi('P80 (ngân sách khuyến nghị)', ty(P(.8)), `dự phòng ${pct((P(.8) / P(.5) - 1) * 100)} so với P50`) +
      kpi('P95 (an toàn cao)', ty(P(.95)), `dự phòng ${pct((P(.95) / P(.5) - 1) * 100)}`) + kpi('Xác suất vượt ngân sách', f0(pOver * 100) + '%', `ngân sách ${ty(bud)}`) +
      kpi('P10 – P90', `${ty(P(.1))} – ${ty(P(.9))}`) + kpi('Ước tính 3 điểm (#9)', ty(E3), `σ = ${ty(Math.sqrt(V3))} (giả định độc lập)`);
    // Histogram
    const lo = P(.001), hi = P(.999), bins = 40, w = (hi - lo) / bins, cnt = new Array(bins).fill(0);
    tot.forEach(x => { const k = Math.min(bins - 1, Math.max(0, Math.floor((x - lo) / w))); cnt[k]++; });
    const hist = cnt.map((c, k) => ({ k: ty(lo + k * w), v: c, tip: `${ty(lo + k * w)} – ${ty(lo + (k + 1) * w)}: ${c} lần (${f1(c / n * 100)}%)`, color: lo + (k + 1) * w > bud ? 'var(--series-2)' : 'var(--series-1)' }));
    // Tornado
    const torn = items.map((it, j) => {
      const a = Float64Array.from(per[j]).sort(), sw = a[Math.floor(.9 * n)] - a[Math.floor(.1 * n)];
      let cov = 0, mj = per[j].reduce((x, y) => x + y, 0) / n, vj = 0, vt = 0;
      for (let t = 0; t < n; t++) { cov += (per[j][t] - mj) * (tot[t] - mean); vj += (per[j][t] - mj) ** 2; vt += (tot[t] - mean) ** 2; }
      return { k: it.c.work + ' (' + it.c.unit + ')', v: sw, r: cov / Math.sqrt(vj * vt), share: mj / mean };
    }).sort((a, b) => b.v - a.v);
    $('#mc-res').innerHTML = card(`Phân phối tổng chi phí (${f0(n)} lần)`, `Màu cam = các lần vượt ngân sách ${ty(bud)}`, CH.vbar(hist, { fmt: v => f0(v), H: 240 })) +
      card('Tornado — hạng mục chi phối rủi ro (#46)', 'Độ dài = dao động chi phí hạng mục P10→P90; r = tương quan với tổng; tỷ trọng = % chi phí kỳ vọng',
        CH.hbar(torn.map(t => ({ k: t.k, v: t.v, tip: `${t.k}: dao động ${ty(t.v)} · r = ${t.r.toFixed(2)} · tỷ trọng ${f1(t.share * 100)}%` })), { L: 220, fmt: ty, rowH: 23 }));
  }
  run();
};

/* ---------- 7. Phân cụm dự án ---------- */
TABS.cluster = v => {
  const P = AN.projects, G = P.groups, cols = CH.SER;
  v.innerHTML = head('Phân cụm dự án theo mặt bằng giá', `Mức giá dự án = đơn giá của dự án so với bình quân CSDL cho CÙNG hạng mục, CÙNG năm (0% = bằng mặt bằng). K-Means chia ${P.clusters.reduce((a, c) => a + c.size, 0)} dự án (≥ 150 dòng) thành ${P.k} cụm theo hồ sơ giá ${G.length} nhóm công việc.`,
    `Phần dư hồi quy (hạng mục + năm) trung bình theo dự án × nhóm, co rút về 0 cho nhóm ít dòng (empirical Bayes); K-Means 30 lần khởi tạo, chọn k theo silhouette (= ${P.silhouette}).`, [31, 10]) +
    `<div class="grid3">${P.clusters.map((c, j) => `<div class="card"><h3><i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${cols[j]};margin-right:6px"></i>${esc(c.label)}</h3><div class="cap">${c.size} dự án · mức giá chung ${pct(c.level)}</div>
      <div class="small">Cao nhất ở <b>${esc(c.hi)}</b> (${pct(c.profile[c.hi])}), thấp nhất ở <b>${esc(c.lo)}</b> (${pct(c.profile[c.lo])})</div>
      <div class="small muted" style="margin-top:4px">${c.types.map(t => `${esc(t[0])} (${t[1]})`).join(' · ')}</div></div>`).join('')}</div>` +
    `<div class="card full"><h3>Hồ sơ giá từng cụm (% so với mặt bằng)</h3><div class="cap">Xanh = rẻ hơn, đỏ = đắt hơn mặt bằng</div>` +
    table([{ t: 'Cụm' }, ...G.map(g => ({ t: esc(g), num: 1 }))], P.clusters.map(c => { const r = [esc(c.label), ...G.map(g => pct(c.profile[g]))]; r._style = [null, ...G.map(g => `background:${CH.diverge(c.profile[g])}`)]; return r; })) + `</div>` +
    `<div class="grid2">${card('Mức giá dự án theo năm', 'Mỗi chấm = 1 dự án; màu = cụm (xám = dự án nhỏ không phân cụm)', `<div class="legend">${P.clusters.map((c, j) => `<span><i style="background:${cols[j]}"></i>${esc(c.label)}</span>`).join('')}<span><i style="background:var(--muted)"></i>Chưa phân cụm</span></div>` +
      CH.scatter(P.list.map(p => ({ x: p.year, y: p.level, color: p.cluster === null ? 'var(--muted)' : cols[p.cluster], r: p.n > 1000 ? 6 : 4, tip: `${p.name} (${p.code}) · ${p.type} · ${p.prov || '?'} · ${p.year}: ${pct(p.level)} · ${f0(p.n)} dòng` })), { ref: 0, yfmt: v => pct(v), xfmt: v => String(Math.round(v)) }))}` +
    `<div class="card"><h3>Xếp hạng dự án</h3><div class="ctrl"><input type="search" id="pj-q" placeholder="Lọc tên/mã dự án…"></div><div id="pj-t"></div></div></div>`;
  const draw = () => {
    const q = $('#pj-q').value.trim().toLowerCase();
    const rows = P.list.filter(p => !q || (p.name + ' ' + p.code).toLowerCase().includes(q)).slice().sort((a, b) => b.level - a.level);
    $('#pj-t').innerHTML = table([{ t: 'Dự án' }, { t: 'Năm', num: 1 }, { t: 'Dòng', num: 1 }, { t: 'Mức giá', num: 1 }, { t: 'Cụm' }],
      rows.map(p => [`${esc(p.name)}<div class="small muted">${esc(p.type)} · ${esc(p.prov || '?')}</div>`, p.year, f0(p.n), `<b style="color:${p.level > 10 ? 'var(--warn-hi)' : p.level < -10 ? 'var(--accent)' : 'inherit'}">${pct(p.level)}</b>`, p.cluster === null ? '<span class="muted small">—</span>' : esc(P.clusters[p.cluster].label)]), 'tall');
  };
  $('#pj-q').oninput = draw; draw();
};

/* ---------- 8. Bất thường ---------- */
TABS.anomaly = v => {
  const A = AN.anomaly;
  v.innerHTML = head('Phát hiện đơn giá bất thường bằng máy học', 'So sánh Isolation Forest (đa chiều) với quy tắc thống kê hiện có (robust z-score theo nhóm + IQR theo hạng mục).',
    'Isolation Forest 150 cây, mẫu 256: điểm bất thường cao = dễ bị "cô lập" bằng ít lần chia. Đặc trưng: z so với cùng hạng mục, z so với cùng loại công việc + đơn vị (giá đã quy về năm gốc), độ lệch tỷ lệ nhân công. Ngưỡng = top 1%.', [41]) +
    `<div class="kpis">${kpi('Dòng phân tích', f0(A.n))}${kpi('Isolation Forest gắn cờ', f0(A.ifFlag), 'top 1%')}${kpi('Quy tắc hiện có gắn cờ', f0(A.ruleFlag))}${kpi('Cả hai cùng gắn cờ', f0(A.both), 'ưu tiên rà soát')}${kpi('Chỉ ML phát hiện', f0(A.onlyIF), 'quy tắc cũ bỏ sót')}</div>` +
    `<div class="grid2">${card('Phân bố điểm bất thường', `Nét đứt = ngưỡng top 1% (${A.thr})`, CH.vbar(A.hist.map((c, i) => ({ k: (0.3 + i * (0.5 / 30)).toFixed(2), v: c, color: 0.3 + (i + 1) * (0.5 / 30) > A.thr ? 'var(--series-2)' : 'var(--series-1)', tip: `điểm ${(0.3 + i * (0.5 / 30)).toFixed(3)}–${(0.3 + (i + 1) * (0.5 / 30)).toFixed(3)}: ${f0(c)} dòng` })), { fmt: v => f0(v), vline: (A.thr - 0.3) / (0.5 / 30) }))}` +
    card('Đối chiếu hai phương pháp', '', CH.hbar([{ k: 'Chỉ quy tắc', v: A.onlyRule }, { k: 'Cả hai', v: A.both, color: 'var(--series-2)' }, { k: 'Chỉ Isolation Forest', v: A.onlyIF, color: 'var(--series-3)' }], { L: 150, fmt: v => f0(v) }) +
      `<p class="note">Quy tắc cũ dùng ngưỡng trên từng nhóm nên gắn cờ nhiều hơn; Isolation Forest kết hợp nhiều chiều cùng lúc nên bắt được dòng "lệch vừa phải trên nhiều tiêu chí".</p>`) + `</div>` +
    `<div class="card full"><h3>Ví dụ: dòng chỉ Isolation Forest phát hiện</h3><div class="cap">Lý do = đặc trưng lệch nhiều nhất. Tra mã dòng ở trang Tra cứu để xem file nguồn.</div>` +
    table([{ t: 'Mã dòng' }, { t: 'Tên công việc' }, { t: 'ĐV' }, { t: 'Đơn giá', num: 1 }, { t: 'Năm', num: 1 }, { t: 'Dự án' }, { t: 'Điểm', num: 1 }, { t: 'Lý do' }],
      A.examples.map(e => [`<a href="index.html#q=${encodeURIComponent(e.name.slice(0, 60))}">${esc(e.id)}</a>`, esc(e.name), esc(e.unit), f0(e.price), e.year, esc(e.project), e.score, esc(e.why)]), 'tall') + `</div>`;
};

/* ---------- 9. Chuẩn hóa & phân loại ---------- */
TABS.names = v => {
  const N = AN.names, C = AN.classify, M = C.models;
  const mrows = Object.entries(M).map(([k, m]) => [k === 'NB' ? 'Naive Bayes (#21)' : esc(k) + ' (#23)', `<b>${f1(m.acc)}%</b>`, m.accHigh === null ? '–' : f1(m.accHigh) + '%', f1(m.cover) + '%', k === C.best ? '<span class="done">✓ dùng</span>' : '']);
  v.innerHTML = head('Nhóm đại diện & phân loại tự động', 'Các cách ghi tên khác nhau của cùng một công việc được gom thành nhóm đại diện (dùng trong Tra cứu và Điểm rơi giá); hạng mục "Chưa phân loại" được gợi ý nhóm NRM2.',
    'Gom nhóm: cùng đơn vị; lõi tên giống nhau sau khi bỏ tiền tố vị trí, từ phụ (cung cấp và lắp đặt, bao gồm…) và lỗi gõ; thông số chính khớp (M100 ≡ B7.5, D16 ≠ D18, trát trong ≠ trát ngoài) – tách bằng regex; tên đại diện = tên dùng ở nhiều dự án nhất. Phân loại: Naive Bayes trên từ; kNN (k = 5) theo độ giống tên, kiểm định trên tập giữ lại; tin cậy ≥ 80% đã được áp dụng khi làm sạch.', [16, 17, 19, 21, 23, 28]) +
    `<div class="kpis">${kpi('Cách ghi tên (tên + ĐV)', f0(N.items))}${kpi('Nhóm đại diện', f0(N.after), `giảm ${f1((1 - N.after / N.items) * 100)}%`)}${kpi('Nhóm gom ≥ 2 cách ghi', f0(N.clusters), `${f0(N.inClusters)} tên`)}${kpi('Hạng mục còn chưa phân loại', f0(C.unlabeled))}${kpi('Gợi ý tin cậy ≥ 80%', f0(C.highConf))}</div>` +
    `<div class="grid2">${card('So sánh mô hình phân loại NRM2', `Huấn luyện ${f0(C.train)} hạng mục, kiểm tra ${f0(C.test)} hạng mục chưa thấy`, table([{ t: 'Mô hình' }, { t: 'Độ chính xác', num: 1 }, { t: 'Chính xác khi tin cậy ≥ 80%', num: 1 }, { t: 'Tỷ lệ đạt ≥ 80%', num: 1 }, { t: '' }], mrows))}` +
    card('Nhóm được đề xuất (tin cậy ≥ 80%)', '', CH.hbar(C.dist.map(([k, n]) => ({ k, v: n })), { L: 200, fmt: v => f0(v) })) + `</div>` +
    `<div class="card full"><h3>Nhóm gom nhiều cách ghi tên nhất</h3><div class="cap">Lev = số ký tự khác so với tên đại diện; JW = Jaro–Winkler (1 = giống hệt); Token = token_sort_ratio (%).</div>` +
    table([{ t: 'Tên đại diện' }, { t: 'ĐV' }, { t: 'Biến thể' }, { t: 'Dòng', num: 1 }],
      N.examples.map(e => [esc(e.canonical), esc(e.unit), e.variants.map(x => `${esc(x.name)} <span class="small muted">(${x.n} dòng · Lev ${x.lev} · JW ${x.jw} · Token ${x.tok})</span>`).join('<br>'), f0(e.n)]), 'tall') + `</div>` +
    `<div class="card full"><h3>Đề xuất phân loại NRM2 cho hạng mục "Chưa phân loại"</h3><div class="ctrl"><input type="search" id="cl-q" placeholder="Lọc tên…"><label>Tin cậy tối thiểu <input type="range" id="cl-c" min="0" max="100" step="10" value="80"> <b id="cl-cv">80%</b></label><span class="muted small" id="cl-n"></span></div><div id="cl-t"></div></div>`;
  const draw = () => {
    const q = $('#cl-q').value.trim().toLowerCase(), c = +$('#cl-c').value; $('#cl-cv').textContent = c + '%';
    const rows = C.pred.filter(p => p.conf >= c && (!q || p.name.toLowerCase().includes(q)));
    $('#cl-n').textContent = `${f0(rows.length)} hạng mục`;
    $('#cl-t').innerHTML = table([{ t: 'Hạng mục' }, { t: 'ĐV' }, { t: 'Dòng', num: 1 }, { t: 'Đề xuất NRM2' }, { t: 'Tin cậy', num: 1 }, { t: 'Độ giống tên gần nhất', num: 1 }],
      rows.slice(0, 400).map(p => [esc(p.name), esc(p.unit), p.n, `${esc(p.pred)} · ${esc(p.predName)}`, `<b>${p.conf}%</b>`, p.sim + '%']), 'tall');
  };
  $('#cl-q').oninput = draw; $('#cl-c').oninput = draw; draw();
};

/* ---------- 10. Bài phân tích ---------- */
TABS.articles = v => {
  v.innerHTML = head('Bài phân tích', 'Các nhận định chính rút ra từ dữ liệu — số liệu tự cập nhật mỗi lần chạy lại analysis.py.', null) +
    `<div class="toc">${AN.articles.map((a, i) => `<a class="btn" href="#art-${i}" onclick="document.getElementById('art-${i}').scrollIntoView({behavior:'smooth'});return false">${i + 1}. ${esc(a.title)}</a>`).join('')}</div>` +
    AN.articles.map((a, i) => `<article class="article" id="art-${i}"><div class="tag">${esc(a.tag)}</div><h3>${i + 1}. ${esc(a.title)}</h3><p class="lead">${esc(a.lead)}</p>${a.body.filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('')}<div class="act"><b>Áp dụng:</b> ${esc(a.action)}</div></article>`).join('');
};

/* ---------- 11. 50 thuật toán ---------- */
TABS.algos = v => {
  const L = AN.algos, rel = { 'Rất cao': 'r5', 'Cao': 'r4', 'Trung bình': 'r3', 'Thấp': 'r2', 'Không': 'r2' };
  const tabName = TAB_NAME;
  const cnt = k => L.filter(a => a.rel === k).length, demo = L.filter(a => a.result).length;
  v.innerHTML = head('Giả sử áp dụng 50 thuật toán vào CSDL đơn giá', 'Đánh giá từng thuật toán trong tài liệu "50 thuật toán ngành xây dựng": áp dụng lên CSDL đơn giá thì làm được gì, mức liên quan, độ khó, và kết quả demo đã chạy thật trên dữ liệu.', null) +
    `<div class="kpis">${kpi('Đã chạy demo trên dữ liệu', demo, 'xem tab tương ứng')}${kpi('Liên quan rất cao', cnt('Rất cao'))}${kpi('Liên quan cao', cnt('Cao'))}${kpi('Trung bình', cnt('Trung bình'))}${kpi('Thấp / không liên quan', cnt('Thấp') + cnt('Không'), 'chủ yếu nhóm tiến độ, thị giác máy tính, logistics')}</div>` +
    `<div class="grid3">
      <div class="card"><h3>① Áp dụng ngay (🟢, đã có kết quả)</h3><div class="small">${L.filter(a => a.result && a.effort === '🟢').map(a => `#${a.id} ${esc(a.name)}`).join('<br>')}</div></div>
      <div class="card"><h3>② Tiếp theo (🟡 – cần Python)</h3><div class="small">${L.filter(a => a.effort === '🟡' && (a.rel === 'Rất cao' || a.rel === 'Cao')).map(a => `#${a.id} ${esc(a.name)}${a.result ? ' <span class="done">✓</span>' : ''}`).join('<br>')}</div></div>
      <div class="card"><h3>③ Dài hạn (🔴 – cần ML/hạ tầng)</h3><div class="small">${L.filter(a => a.effort === '🔴' && (a.rel === 'Rất cao' || a.rel === 'Cao' || a.rel === 'Trung bình')).map(a => `#${a.id} ${esc(a.name)}`).join('<br>')}</div></div></div>` +
    `<div class="ctrl"><select id="al-r"><option value="">Mọi mức liên quan</option>${['Rất cao', 'Cao', 'Trung bình', 'Thấp', 'Không'].map(r => `<option>${r}</option>`).join('')}</select><label><input type="checkbox" id="al-d"> Chỉ thuật toán đã chạy demo</label></div><div id="al-t"></div>`;
  const draw = () => {
    const r = $('#al-r').value, d = $('#al-d').checked;
    $('#al-t').innerHTML = table([{ t: '#' }, { t: 'Thuật toán' }, { t: 'Nhóm' }, { t: 'Độ khó' }, { t: 'Liên quan' }, { t: 'Nếu áp dụng trên CSDL đơn giá' }, { t: 'Kết quả demo trên dữ liệu' }],
      L.filter(a => (!r || a.rel === r) && (!d || a.result)).map(a => [a.id, `<b>${esc(a.name)}</b>`, esc(a.group), a.effort, `<span class="pill ${rel[a.rel]}">${esc(a.rel)}</span>`, esc(a.apply),
      a.result ? `<span class="done">✓</span> ${esc(a.result)}<div><a href="#${a.tab}" data-go="${a.tab}" class="small">→ ${esc(tabName[a.tab] || a.tab)}</a></div>` : '<span class="muted small">—</span>']));
  };
  $('#al-r').oninput = draw; $('#al-d').oninput = draw; draw();
  v.onclick = e => { const a = e.target.closest('[data-go]'); if (a) { e.preventDefault(); show(a.dataset.go); } };
};

return { start };
})();
