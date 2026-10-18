'use strict';
/* Đọc / sửa / ghi file .xlsx ngay trong trình duyệt, GIỮ NGUYÊN định dạng của file gốc (không cần thư viện ngoài).
   • Giải nén bằng DecompressionStream('deflate-raw'), nén lại bằng CompressionStream.
   • Chỉ thay đúng các ô được ghi; style, ô gộp, công thức, sheet khác giữ nguyên.
   • Thêm style mới (đậm, nền màu, định dạng số) và thêm sheet mới vào workbook có sẵn.
   Module tham khảo giá chỉ THÊM sheet mới: các sheet gốc không bị phân tích lại hay ghi lại, giữ nguyên từng byte.
   API: XLSXIO.read(ArrayBuffer) -> Promise<Workbook> */
(function () {
  const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const NS_PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const dec = new TextDecoder(), enc = new TextEncoder();

  /* ---------- ZIP ---------- */
  const CRC = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; }
  function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  async function pipe(data, stream) {
    const out = await new Response(new Blob([data]).stream().pipeThrough(stream)).arrayBuffer();
    return new Uint8Array(out);
  }
  async function unzip(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf);
    let e = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('Không phải file .xlsx hợp lệ (định dạng .xls cũ hãy lưu lại thành .xlsx).');
    const count = dv.getUint16(e + 10, true);
    let p = dv.getUint32(e + 16, true);
    const files = new Map();
    for (let k = 0; k < count; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('File .xlsx bị hỏng (thư mục zip).');
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const off = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
      p += 46 + nlen + xlen + clen;
      if (name.endsWith('/')) continue;
      const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
      const raw = u8.slice(start, start + csize);
      files.set(name, method === 0 ? raw : method === 8 ? await pipe(raw, new DecompressionStream('deflate-raw')) : null);
      if (!files.get(name)) throw new Error(`Không giải nén được ${name} (phương thức ${method}).`);
    }
    return files;
  }
  async function zip(files) {
    const parts = [], central = [];
    let offset = 0;
    for (const [fname, data] of files) {
      const name = enc.encode(fname), crc = crc32(data);
      let body = data, method = 0;
      if (typeof CompressionStream !== 'undefined' && data.length > 256) { body = await pipe(data, new CompressionStream('deflate-raw')); method = 8; }
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, method, true);
      h.setUint32(14, crc, true); h.setUint32(18, body.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
      parts.push(h, name, body);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, method, true);
      c.setUint32(16, crc, true); c.setUint32(20, body.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
      central.push(c, name);
      offset += 30 + name.length + body.length;
    }
    const cd = central.reduce((s, x) => s + x.byteLength, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.size, true); e.setUint16(10, files.size, true); e.setUint32(12, cd, true); e.setUint32(16, offset, true);
    return new Blob([...parts, ...central, e], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /* ---------- Tiện ích ô ---------- */
  function colName(i) { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26; } return s; }
  function colIndex(s) { let n = 0; for (const ch of s) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; }
  function parseRef(ref) { const m = /^([A-Z]+)(\d+)$/.exec(ref || ''); return m ? { c: colIndex(m[1]), r: +m[2] - 1 } : null; }
  const ref = (r, c) => colName(c) + (r + 1);
  const xesc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  const kids = (el, name) => Array.from(el.childNodes).filter(n => n.nodeType === 1 && n.localName === name);
  const kid = (el, name) => kids(el, name)[0] || null;
  const textOf = el => Array.from(el.getElementsByTagNameNS(NS, 't')).map(t => t.textContent).join('');

  /* ---------- Workbook ---------- */
  class Workbook {
    constructor(files) {
      this.files = files; this.docs = new Map(); this.dirty = new Set();
    }
    xml(path) {
      if (!this.docs.has(path)) {
        const raw = this.files.get(path);
        if (!raw) return null;
        const doc = new DOMParser().parseFromString(dec.decode(raw), 'application/xml');
        if (doc.getElementsByTagName('parsererror').length) throw new Error(`Không đọc được ${path}`);
        this.docs.set(path, doc);
      }
      return this.docs.get(path);
    }
    touch(path) { this.dirty.add(path); }
    init() {
      const wb = this.xml('xl/workbook.xml');
      if (!wb) throw new Error('File không có xl/workbook.xml — không phải workbook Excel.');
      const rels = this.xml('xl/_rels/workbook.xml.rels');
      const target = new Map();
      for (const r of rels.getElementsByTagNameNS(NS_PKG, 'Relationship')) target.set(r.getAttribute('Id'), r.getAttribute('Target'));
      const resolve = t => t.startsWith('/') ? t.slice(1) : ('xl/' + t).replace(/[^/]+\/\.\.\//g, '');
      this.sheets = [];
      for (const s of wb.getElementsByTagNameNS(NS, 'sheet')) {
        const rid = s.getAttributeNS(NS_R, 'id') || s.getAttribute('r:id');
        const t = target.get(rid);
        if (!t || !/worksheets\//.test(t)) continue;   // bỏ qua chartsheet
        this.sheets.push({ name: s.getAttribute('name'), path: resolve(t), state: s.getAttribute('state') || 'visible' });
      }
      this.ss = [];
      const sst = this.xml('xl/sharedStrings.xml');
      if (sst) for (const si of sst.getElementsByTagNameNS(NS, 'si')) {
        // chỉ lấy <t> trực tiếp hoặc trong <r>, bỏ phiên âm <rPh>
        let s = ''; for (const n of si.childNodes) { if (n.localName === 't') s += n.textContent; else if (n.localName === 'r') s += textOf(n); }
        this.ss.push(s);
      }
      return this;
    }
    // Lưới giá trị của sheet (chuỗi / số / null)
    grid(si) {
      const doc = this.xml(this.sheets[si].path);
      const rows = [];
      let rr = -1;
      for (const row of doc.getElementsByTagNameNS(NS, 'row')) {
        rr = row.hasAttribute('r') ? +row.getAttribute('r') - 1 : rr + 1;
        const vals = [];
        let cc = -1;
        for (const c of kids(row, 'c')) {
          const p = parseRef(c.getAttribute('r'));
          cc = p ? p.c : cc + 1;
          vals[cc] = this.cellValue(c);
        }
        rows[rr] = vals;
      }
      for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
      return rows;
    }
    cellValue(c) {
      const t = c.getAttribute('t'), v = kid(c, 'v');
      if (t === 's') return v ? (this.ss[+v.textContent] ?? '') : '';
      if (t === 'inlineStr') { const is = kid(c, 'is'); return is ? textOf(is) : ''; }
      if (t === 'str') return v ? v.textContent : '';
      if (t === 'b') return v ? v.textContent === '1' : null;
      if (t === 'e') return null;
      if (!v || v.textContent === '') return null;   // công thức chưa có giá trị đệm
      const n = +v.textContent;
      return isFinite(n) ? n : v.textContent;
    }
    // Ô gộp dạng [{r0,c0,r1,c1}]
    merges(si) {
      const doc = this.xml(this.sheets[si].path), out = [];
      for (const m of doc.getElementsByTagNameNS(NS, 'mergeCell')) {
        const [a, b] = (m.getAttribute('ref') || '').split(':').map(parseRef);
        if (a) out.push({ r0: a.r, c0: a.c, r1: (b || a).r, c1: (b || a).c });
      }
      return out;
    }

    /* --- Ghi ô --- */
    _rowEl(doc, r) {
      const sd = doc.getElementsByTagNameNS(NS, 'sheetData')[0];
      if (!sd.__rows) {   // gán r cho mọi dòng/ô để chèn đúng thứ tự; giữ bảng tra dòng
        sd.__rows = new Map();
        let rr = 0;
        for (const row of kids(sd, 'row')) {
          rr = row.hasAttribute('r') ? +row.getAttribute('r') : rr + 1; row.setAttribute('r', rr);
          sd.__rows.set(rr - 1, row);
          let cc = -1;
          for (const c of kids(row, 'c')) { const p = parseRef(c.getAttribute('r')); cc = p ? p.c : cc + 1; c.setAttribute('r', ref(rr - 1, cc)); }
        }
      }
      const hit = sd.__rows.get(r);
      if (hit) return hit;
      let before = null;
      for (const row of kids(sd, 'row')) if (+row.getAttribute('r') - 1 > r) { before = row; break; }
      const row = doc.createElementNS(NS, 'row');
      row.setAttribute('r', r + 1);
      sd.insertBefore(row, before);
      sd.__rows.set(r, row);
      return row;
    }
    _cellEl(doc, r, c) {
      const row = this._rowEl(doc, r);
      let before = null;
      for (const el of kids(row, 'c')) {
        const p = parseRef(el.getAttribute('r'));
        if (p.c === c) return el;
        if (p.c > c) { before = el; break; }
      }
      const el = doc.createElementNS(NS, 'c');
      el.setAttribute('r', ref(r, c));
      // ô mới: kế thừa style mặc định của dòng/cột nếu có
      if (row.getAttribute('customFormat') === '1' && row.hasAttribute('s')) el.setAttribute('s', row.getAttribute('s'));
      row.insertBefore(el, before);
      if (row.hasAttribute('spans')) row.removeAttribute('spans');
      return el;
    }
    hasFormula(si, r, c) {
      const doc = this.xml(this.sheets[si].path);
      const el = this._findCell(doc, r, c);
      return !!(el && kid(el, 'f'));
    }
    _findCell(doc, r, c) {
      const row = this._rowEl(doc, r);
      for (const el of kids(row, 'c')) if (parseRef(el.getAttribute('r')).c === c) return el;
      return null;
    }
    styleOf(si, r, c) {
      const el = this._findCell(this.xml(this.sheets[si].path), r, c);
      return el && el.hasAttribute('s') ? +el.getAttribute('s') : 0;
    }
    // v: số | chuỗi | null (xóa giá trị) ; o: { s: chỉ số style, f: công thức (không có dấu =), keepFormula }
    set(si, r, c, v, o = {}) {
      const sh = this.sheets[si], doc = this.xml(sh.path);
      const el = this._cellEl(doc, r, c);
      for (const n of [...kids(el, 'v'), ...kids(el, 'is')]) el.removeChild(n);
      const f = kid(el, 'f');
      if (o.f !== undefined) {
        if (f) el.removeChild(f);
        const nf = doc.createElementNS(NS, 'f'); nf.textContent = o.f; el.insertBefore(nf, el.firstChild);
        el.removeAttribute('t');
      } else if (f && !o.keepFormula) {
        // công thức dùng chung (shared master) thì không xóa để khỏi làm hỏng các ô phụ thuộc
        if (f.getAttribute('t') === 'shared' && f.hasAttribute('ref')) { /* giữ */ } else el.removeChild(f);
      }
      if (o.s !== undefined) el.setAttribute('s', o.s);
      if (o.f === undefined && !(f && o.keepFormula)) {
        if (typeof v === 'number' && isFinite(v)) {
          el.removeAttribute('t');
          const nv = doc.createElementNS(NS, 'v'); nv.textContent = String(v); el.appendChild(nv);
        } else if (v !== null && v !== undefined && v !== '') {
          el.setAttribute('t', 'inlineStr');
          const is = doc.createElementNS(NS, 'is'), t = doc.createElementNS(NS, 't');
          t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve'); t.textContent = String(v); is.appendChild(t); el.appendChild(is);
        } else el.removeAttribute('t');
      }
      this.touch(sh.path);
      this._grow(si, r, c);
    }
    // Chỉ xóa giá trị lưu đệm của ô công thức để Excel tính lại khi mở
    dropCache(si, r, c) {
      const sh = this.sheets[si], el = this._findCell(this.xml(sh.path), r, c);
      if (el && kid(el, 'f')) { for (const n of kids(el, 'v')) el.removeChild(n); this.touch(sh.path); }
    }
    _grow(si, r, c) {
      const sh = this.sheets[si];
      sh.maxR = Math.max(sh.maxR || 0, r); sh.maxC = Math.max(sh.maxC || 0, c);
    }
    setColWidth(si, c, width) {
      const sh = this.sheets[si], doc = this.xml(sh.path), ws = doc.documentElement;
      let cols = kid(ws, 'cols');
      if (cols) { for (const col of kids(cols, 'col')) if (+col.getAttribute('min') - 1 <= c && +col.getAttribute('max') - 1 >= c) return; }
      else {
        cols = doc.createElementNS(NS, 'cols');
        ws.insertBefore(cols, kid(ws, 'sheetData'));
      }
      const col = doc.createElementNS(NS, 'col');
      col.setAttribute('min', c + 1); col.setAttribute('max', c + 1); col.setAttribute('width', width); col.setAttribute('customWidth', '1');
      let before = null; for (const x of kids(cols, 'col')) if (+x.getAttribute('min') - 1 > c) { before = x; break; }
      cols.insertBefore(col, before);
      this.touch(sh.path);
    }

    /* --- Style --- */
    // spec: { bold, color (ARGB chữ), fill (ARGB nền), numFmt ('#,##0' | '0.0%' | ...), wrap, base (xf gốc để kế thừa viền/căn lề), border }
    style(spec) {
      const key = JSON.stringify(spec);
      this._styleCache = this._styleCache || new Map();
      if (this._styleCache.has(key)) return this._styleCache.get(key);
      const path = 'xl/styles.xml';
      let doc = this.xml(path);
      if (!doc) {
        this.files.set(path, enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${NS}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`));
        doc = this.xml(path);
        this._ensureContentType('/xl/styles.xml', 'application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml');
        this._ensureRel('styles', 'styles.xml');
      }
      const ss = doc.documentElement;
      const sect = (name, after) => {
        let el = kid(ss, name);
        if (!el) {
          el = doc.createElementNS(NS, name); el.setAttribute('count', '0');
          const order = ['numFmts', 'fonts', 'fills', 'borders', 'cellStyleXfs', 'cellXfs'];
          let ref = null; for (const n of order.slice(order.indexOf(name) + 1)) if ((ref = kid(ss, n))) break;
          ss.insertBefore(el, ref || ss.firstChild);
        }
        return el;
      };
      const push = (parent, xmlStr) => {
        const frag = new DOMParser().parseFromString(`<x xmlns="${NS}">${xmlStr}</x>`, 'application/xml').documentElement.firstChild;
        parent.appendChild(doc.importNode(frag, true));
        const n = kids(parent, frag.localName).length;
        parent.setAttribute('count', n);
        return n - 1;
      };
      const cellXfs = sect('cellXfs');
      const baseXf = spec.base !== undefined ? kids(cellXfs, 'xf')[spec.base] : null;
      const attr = (n, d) => baseXf && baseXf.hasAttribute(n) ? baseXf.getAttribute(n) : d;
      let numFmtId = attr('numFmtId', '0');
      if (spec.numFmt) {
        const builtin = { '0': 1, '0.00': 2, '#,##0': 3, '#,##0.00': 4, '0%': 9, '0.00%': 10 }[spec.numFmt];
        if (builtin) numFmtId = String(builtin);
        else {
          const nf = sect('numFmts');
          let id = 164; const ex = kids(nf, 'numFmt');
          const hit = ex.find(x => x.getAttribute('formatCode') === spec.numFmt);
          if (hit) id = +hit.getAttribute('numFmtId');
          else { for (const x of ex) id = Math.max(id, +x.getAttribute('numFmtId') + 1); push(nf, `<numFmt numFmtId="${id}" formatCode="${xesc(spec.numFmt)}"/>`); }
          numFmtId = String(id);
        }
      }
      let fontId = attr('fontId', '0');
      if (spec.bold || spec.color || spec.italic) {
        const fonts = sect('fonts');
        const baseFont = kids(fonts, 'font')[+fontId];
        const sz = baseFont && kid(baseFont, 'sz') ? kid(baseFont, 'sz').getAttribute('val') : '11';
        const nm = baseFont && kid(baseFont, 'name') ? kid(baseFont, 'name').getAttribute('val') : 'Calibri';
        fontId = String(push(fonts, `<font>${spec.bold ? '<b/>' : ''}${spec.italic ? '<i/>' : ''}<sz val="${sz}"/>${spec.color ? `<color rgb="${spec.color}"/>` : ''}<name val="${xesc(nm)}"/></font>`));
      }
      let fillId = attr('fillId', '0');
      if (spec.fill) fillId = String(push(sect('fills'), `<fill><patternFill patternType="solid"><fgColor rgb="${spec.fill}"/><bgColor indexed="64"/></patternFill></fill>`));
      let borderId = attr('borderId', '0');
      if (spec.border) borderId = this._thinBorder ?? (this._thinBorder = String(push(sect('borders'), '<border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border>')));
      const align = spec.wrap ? '<alignment wrapText="1" vertical="top"/>' : (baseXf && kid(baseXf, 'alignment') ? new XMLSerializer().serializeToString(kid(baseXf, 'alignment')).replace(/ xmlns="[^"]*"/, '') : '');
      const id = push(cellXfs, `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"${align ? ' applyAlignment="1"' : ''}>${align}</xf>`);
      this.touch(path);
      this._styleCache.set(key, id);
      return id;
    }

    // Định dạng dùng cho định dạng có điều kiện: { fill (ARGB nền), color (ARGB chữ), bold }
    dxf(spec) {
      const key = 'dxf' + JSON.stringify(spec);
      this._styleCache = this._styleCache || new Map();
      if (this._styleCache.has(key)) return this._styleCache.get(key);
      if (!this.xml('xl/styles.xml')) this.style({});   // file chưa có styles.xml thì tạo
      const doc = this.xml('xl/styles.xml'), ss = doc.documentElement;
      let dx = kid(ss, 'dxfs');
      if (!dx) {
        dx = doc.createElementNS(NS, 'dxfs'); dx.setAttribute('count', '0');
        let ref = null; for (const n of ['tableStyles', 'colors', 'extLst']) if ((ref = kid(ss, n))) break;
        ss.insertBefore(dx, ref);
      }
      const xml = `<dxf>${spec.bold || spec.color ? `<font>${spec.bold ? '<b/>' : ''}${spec.color ? `<color rgb="${spec.color}"/>` : ''}</font>` : ''}${spec.fill ? `<fill><patternFill><bgColor rgb="${spec.fill}"/></patternFill></fill>` : ''}</dxf>`;
      const frag = new DOMParser().parseFromString(`<x xmlns="${NS}">${xml}</x>`, 'application/xml').documentElement.firstChild;
      dx.appendChild(doc.importNode(frag, true));
      const id = kids(dx, 'dxf').length - 1;
      dx.setAttribute('count', id + 1);
      this.touch('xl/styles.xml');
      this._styleCache.set(key, id);
      return id;
    }

    /* --- Thêm / thay sheet --- */
    // rows: mảng dòng; ô = giá trị hoặc {v, s, f}. o: { widths, freeze (số dòng cố định), filter }
    putSheet(name, rows, o = {}) {
      name = name.replace(/[\[\]:*?/\\]/g, ' ').slice(0, 31);
      const xml = this._sheetXml(rows, o);
      let sh = this.sheets.find(s => s.name.toLowerCase() === name.toLowerCase());
      if (sh) { this.files.set(sh.path, enc.encode(xml)); this.docs.delete(sh.path); this.dirty.delete(sh.path); return; }
      let n = 1; while (this.files.has(`xl/worksheets/sheet${n}.xml`)) n++;
      const path = `xl/worksheets/sheet${n}.xml`;
      this.files.set(path, enc.encode(xml));
      const rid = this._ensureRel('worksheet', `worksheets/sheet${n}.xml`, true);
      this._ensureContentType('/' + path, 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml');
      const wb = this.xml('xl/workbook.xml'), sheetsEl = wb.getElementsByTagNameNS(NS, 'sheets')[0];
      let maxId = 0; for (const s of sheetsEl.getElementsByTagNameNS(NS, 'sheet')) maxId = Math.max(maxId, +s.getAttribute('sheetId'));
      const el = wb.createElementNS(NS, 'sheet');
      el.setAttribute('name', name); el.setAttribute('sheetId', maxId + 1); el.setAttributeNS(NS_R, 'r:id', rid);
      sheetsEl.appendChild(el);
      this.touch('xl/workbook.xml');
      this.sheets.push({ name, path, state: 'visible' });
    }
    _sheetXml(rows, o) {
      const out = [`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${NS}" xmlns:r="${NS_R}">`];
      const fr = o.freeze || 0;
      out.push(`<sheetViews><sheetView workbookViewId="0">${fr ? `<pane ySplit="${fr}" topLeftCell="A${fr + 1}" activePane="bottomLeft" state="frozen"/>` : ''}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>`);
      if (o.widths && o.widths.length) out.push('<cols>' + o.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>');
      out.push('<sheetData>');
      let maxC = 0;
      rows.forEach((row, ri) => {
        out.push(`<row r="${ri + 1}">`);
        (row || []).forEach((cell, ci) => {
          if (cell === null || cell === undefined || cell === '') return;
          const x = typeof cell === 'object' ? cell : { v: cell };
          maxC = Math.max(maxC, ci);
          const s = x.s !== undefined ? ` s="${x.s}"` : '';
          const r = ref(ri, ci);
          if (x.f) {
            // công thức kèm giá trị đệm (để file mở ra đã có số, Excel tự tính lại khi ô nguồn thay đổi)
            const cv = typeof x.v === 'number' && isFinite(x.v) ? `<v>${x.v}</v>` : (typeof x.v === 'string' ? `<v>${xesc(x.v)}</v>` : '');
            out.push(`<c r="${r}"${s}${typeof x.v === 'string' ? ' t="str"' : ''}><f>${xesc(x.f)}</f>${cv}</c>`);
          }
          else if (typeof x.v === 'number' && isFinite(x.v)) out.push(`<c r="${r}"${s}><v>${x.v}</v></c>`);
          else if (x.v === null || x.v === undefined || x.v === '') out.push(`<c r="${r}"${s}/>`);
          else out.push(`<c r="${r}" t="inlineStr"${s}><is><t xml:space="preserve">${xesc(x.v)}</t></is></c>`);
        });
        out.push('</row>');
      });
      out.push('</sheetData>');
      if (o.filter && rows.length > 1) out.push(`<autoFilter ref="A${o.filter}:${colName(maxC)}${rows.length}"/>`);
      // o.cf: [{ sqref: 'U2:U90', rules: [{ formula: '$U2="Hợp lý"', dxf: id }] }]
      let pr = 1;
      for (const cf of o.cf || []) {
        out.push(`<conditionalFormatting sqref="${cf.sqref}">` + cf.rules.map(ru => `<cfRule type="expression" dxfId="${ru.dxf}" priority="${pr++}"><formula>${xesc(ru.formula)}</formula></cfRule>`).join('') + '</conditionalFormatting>');
      }
      out.push('</worksheet>');
      return out.join('');
    }
    _ensureRel(type, target, alwaysNew) {
      const path = 'xl/_rels/workbook.xml.rels', doc = this.xml(path);
      const all = Array.from(doc.getElementsByTagNameNS(NS_PKG, 'Relationship'));
      const T = `http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}`;
      if (!alwaysNew) { const hit = all.find(r => r.getAttribute('Type') === T); if (hit) return hit.getAttribute('Id'); }
      let n = 1; const ids = new Set(all.map(r => r.getAttribute('Id'))); while (ids.has('rId' + n)) n++;
      const el = doc.createElementNS(NS_PKG, 'Relationship');
      el.setAttribute('Id', 'rId' + n); el.setAttribute('Type', T); el.setAttribute('Target', target);
      doc.documentElement.appendChild(el);
      this.touch(path);
      return 'rId' + n;
    }
    _ensureContentType(part, type) {
      const path = '[Content_Types].xml', doc = this.xml(path);
      const NS_CT = doc.documentElement.namespaceURI;
      for (const o of doc.getElementsByTagNameNS(NS_CT, 'Override')) if (o.getAttribute('PartName') === part) return;
      const el = doc.createElementNS(NS_CT, 'Override');
      el.setAttribute('PartName', part); el.setAttribute('ContentType', type);
      doc.documentElement.appendChild(el);
      this.touch(path);
    }
    // Buộc Excel tính lại toàn bộ khi mở; bỏ calcChain cũ (Excel tự dựng lại)
    forceRecalc() {
      const wb = this.xml('xl/workbook.xml'), root = wb.documentElement;
      let cp = wb.getElementsByTagNameNS(NS, 'calcPr')[0];
      if (!cp) {
        cp = wb.createElementNS(NS, 'calcPr');
        const after = ['oleSize', 'customWorkbookViews', 'pivotCaches', 'smartTagPr', 'smartTagTypes', 'webPublishing', 'fileRecoveryPr', 'webPublishObjects', 'extLst'];
        let ref = null; for (const n of after) if ((ref = kid(root, n))) break;
        root.insertBefore(cp, ref);
      }
      cp.setAttribute('fullCalcOnLoad', '1');
      this.touch('xl/workbook.xml');
      if (this.files.has('xl/calcChain.xml')) {
        this.files.delete('xl/calcChain.xml');
        const rels = this.xml('xl/_rels/workbook.xml.rels');
        for (const r of Array.from(rels.getElementsByTagNameNS(NS_PKG, 'Relationship'))) if (/calcChain$/.test(r.getAttribute('Type'))) r.parentNode.removeChild(r);
        this.touch('xl/_rels/workbook.xml.rels');
        const ct = this.xml('[Content_Types].xml');
        for (const o of Array.from(ct.getElementsByTagNameNS(ct.documentElement.namespaceURI, 'Override'))) if (o.getAttribute('PartName') === '/xl/calcChain.xml') o.parentNode.removeChild(o);
        this.touch('[Content_Types].xml');
      }
    }
    _fixDimension(sh) {
      const doc = this.xml(sh.path), d = doc.getElementsByTagNameNS(NS, 'dimension')[0];
      if (!d || sh.maxC === undefined) return;
      const [a, b] = (d.getAttribute('ref') || 'A1').split(':');
      const pa = parseRef(a) || { r: 0, c: 0 }, pb = parseRef(b || a) || pa;
      d.setAttribute('ref', `${ref(Math.min(pa.r, 0), Math.min(pa.c, 0))}:${ref(Math.max(pb.r, sh.maxR), Math.max(pb.c, sh.maxC))}`);
    }
    async save() {
      for (const sh of this.sheets) if (this.dirty.has(sh.path)) this._fixDimension(sh);
      for (const p of this.dirty) {
        const doc = this.docs.get(p);
        if (doc) this.files.set(p, enc.encode(new XMLSerializer().serializeToString(doc)));
      }
      this.dirty.clear();
      // [Content_Types].xml phải đứng đầu gói
      const ordered = new Map([['[Content_Types].xml', this.files.get('[Content_Types].xml')]]);
      for (const [k, v] of this.files) if (k !== '[Content_Types].xml') ordered.set(k, v);
      return zip(ordered);
    }
  }

  window.XLSXIO = {
    async read(buf) { return new Workbook(await unzip(buf)).init(); },
    colName, colIndex,
  };
})();
