# -*- coding: utf-8 -*-
"""Kiểm tra file BOQ đã điền giá CHỈ khác file gốc ở đúng các ô được phần mềm ghi.
   Dùng: python verify_fill.py <BOQ gốc.xlsx> <BOQ đã điền.xlsx> [--json]
   • Mọi phần của file (theme, chuỗi, ô gộp, vùng in, liên kết ngoài…) giống hệt từng byte,
     trừ: các sheet có ô được ghi, workbook.xml (chỉ được thêm fullCalcOnLoad="1" để Excel tính lại),
     và styles.xml (chỉ được THÊM style mới cho cột giá đề xuất; style cũ giữ nguyên).
   • Trong sheet: mọi thứ ngoài các ô giống hệt (trừ <dimension> và độ rộng của chính cột đề xuất). Mỗi ô khác nhau:
     - ô Đơn giá / Thành tiền: trước đó TRỐNG, giữ nguyên style, giờ chứa một số hoặc công thức KL×Đơn giá cùng dòng;
     - hoặc ô thuộc CỘT GIÁ ĐỀ XUẤT: cột không có dữ liệu nào trong file gốc; chứa tiêu đề "ĐƠN GIÁ ĐỀ XUẤT (CSDL)",
       nhãn cách chọn giá, hoặc một số (giá). Không ô nào bị xóa."""
import sys, zipfile, re, json
import xml.etree.ElementTree as ET

src, out = sys.argv[1], sys.argv[2]
a, b = zipfile.ZipFile(src), zipfile.ZipFile(out)
errs, filled = [], []
CELL = re.compile(rb'<(?:\w+:)?c\b[^>]*?(?:/>|>.*?</(?:\w+:)?c>)', re.S)
REF = re.compile(rb'\sr="([A-Z]+\d+)"')
ATTRS = re.compile(rb'<(?:\w+:)?c\b([^>]*?)/?>')

def cells(x):
    d = {}
    for m in CELL.finditer(x):
        r = REF.search(m.group(0))
        if r: d[r.group(1).decode()] = m.group(0)
    return d

def attrs(c):
    at = dict(re.findall(rb'\s([\w:]+)="([^"]*)"', ATTRS.match(c).group(1)))
    at.pop(b't', None)          # ô trống có thể mang t= thừa
    return at

def empty(c):
    inner = c.split(b'>', 1)[1] if not c.endswith(b'/>') else b''
    return not re.search(rb'<(?:\w+:)?(f|is)\b', inner) and not re.search(rb'<(?:\w+:)?v>[^<]+<', inner)

COLS = re.compile(rb'<(?:\w+:)?cols>.*?</(?:\w+:)?cols>', re.S)
DIM = re.compile(rb'<(?:\w+:)?dimension\b[^>]*/>')
COL = re.compile(rb'<(?:\w+:)?col\b([^>]*)/>')
SPANS = re.compile(rb'\sspans="[^"]*"')
col_of = lambda ref: re.match(r'[A-Z]+', ref).group(0)
def col_idx(L):
    n = 0
    for ch in L: n = n * 26 + ord(ch) - 64
    return n

def col_attrs(x):
    """độ rộng / ẩn / style từng cột theo <cols>: {chỉ số cột: thuộc tính (không gồm min, max)}"""
    m = COLS.search(x); out = {}
    if not m: return out
    for el in COL.finditer(m.group(0)):
        at = dict(re.findall(rb'\s([\w:]+)="([^"]*)"', el.group(1)))
        lo, hi = int(at.pop(b'min')), int(at.pop(b'max'))
        for i in range(lo, min(hi, 16384) + 1): out[i] = at
    return out

def styles_ok(xa, xb):
    """styles.xml mới chỉ được THÊM phần tử vào cuối các danh sách (numFmts, fonts, fills, borders, cellXfs)"""
    ta, tb = ET.fromstring(xa), ET.fromstring(xb)
    ca = {c.tag: c for c in ta}; cb = {c.tag: c for c in tb}
    for tag, el in ca.items():
        if tag not in cb: return f'mất {tag}'
        ka, kb = [ET.tostring(k) for k in el], [ET.tostring(k) for k in cb[tag]]
        if kb[:len(ka)] != ka: return f'{tag.split("}")[-1]}: style cũ bị đổi'
        if len(kb) > len(ka) and tag.split('}')[-1] not in ('numFmts', 'fonts', 'fills', 'borders', 'cellXfs'): return f'{tag}: thêm phần tử lạ'
    return None

props = []   # ô thuộc cột giá đề xuất
for name in a.namelist():
    if name not in b.namelist():
        errs.append(f'thiếu phần {name}'); continue
    xa, xb = a.read(name), b.read(name)
    if xa == xb: continue
    if name == 'xl/styles.xml':
        e = styles_ok(xa, xb)
        if e: errs.append('styles.xml: ' + e)
        continue
    if name == 'xl/workbook.xml':
        norm = xb.replace(b' fullCalcOnLoad="1"', b'')
        norm = re.sub(rb'<(\w+:)?calcPr/>', b'', norm)
        if norm != xa.replace(b' fullCalcOnLoad="1"', b''):
            errs.append('workbook.xml: thay đổi ngoài fullCalcOnLoad')
        continue
    if not name.startswith('xl/worksheets/sheet'):
        errs.append(f'phần {name} bị thay đổi'); continue
    ca, cb = cells(xa), cells(xb)
    strip = lambda x: SPANS.sub(b'', DIM.sub(b'', COLS.sub(b'', CELL.sub(b'', x))))   # spans: gợi ý phạm vi cột của dòng, được nới khi thêm cột
    if strip(xa) != strip(xb):
        errs.append(f'{name}: nội dung ngoài các ô bị thay đổi'); continue
    for ref, c in ca.items():
        if ref not in cb: errs.append(f'{name}: mất ô {ref}')
    # cột giá đề xuất: cột có ô thay đổi, mang tiêu đề cột đề xuất, mà trong file gốc không có dữ liệu nào
    used = {col_of(r) for r, c in ca.items() if not empty(c)}
    changed = {col_of(r) for r, c in cb.items() if ca.get(r) != c}
    head = {col_of(r) for r, c in cb.items() if 'ĐỀ XUẤT (CSDL)'.encode() in c}
    pcols = {L for L in changed if L not in used and L in head}   # phải có tiêu đề cột đề xuất
    wa, wb_ = col_attrs(xa), col_attrs(xb)
    for i in set(wa) | set(wb_):
        if wa.get(i) != wb_.get(i) and not any(col_idx(L) == i for L in pcols): errs.append(f'{name}: độ rộng / thuộc tính cột {i} bị đổi')
    for ref, c in cb.items():
        old = ca.get(ref)
        if old == c: continue
        if col_of(ref) in pcols:
            v = re.search(rb'<(?:\w+:)?v>([^<]*)</(?:\w+:)?v>', c)
            t = re.search(rb'<(?:\w+:)?t\b[^>]*>([^<]*)</(?:\w+:)?t>', c)
            if re.search(rb'<(?:\w+:)?f\b', c): errs.append(f'{name}!{ref}: cột đề xuất có công thức'); continue
            if v:
                try: props.append((name, ref, float(v.group(1)))); continue
                except ValueError: pass
            if t or empty(c): continue   # tiêu đề / nhãn cách chọn giá / ô để trống
            errs.append(f'{name}!{ref}: ô cột đề xuất không hợp lệ'); continue
        m = re.search(rb'<(?:\w+:)?v>([^<]*)</(?:\w+:)?v>', c)
        fm = re.search(rb'<(?:\w+:)?f>([^<]*)</(?:\w+:)?f>', c)
        row = re.sub(r'^[A-Z]+', '', ref)
        if fm and not re.fullmatch(rb'[A-Z]+%s\*[A-Z]+%s' % (row.encode(), row.encode()), fm.group(1)):
            errs.append(f'{name}!{ref}: công thức mới không phải KL × Đơn giá cùng dòng'); continue
        if not m or (re.search(rb'<(?:\w+:)?f\b', c) and not fm):
            errs.append(f'{name}!{ref}: ô mới không phải một giá trị số'); continue
        try: float(m.group(1))
        except ValueError: errs.append(f'{name}!{ref}: giá trị không phải số'); continue
        if old is not None:
            if not empty(old): errs.append(f'{name}!{ref}: ô vốn đã có dữ liệu bị ghi đè'); continue
            if attrs(old) != attrs(c): errs.append(f'{name}!{ref}: thuộc tính / style của ô bị đổi'); continue
        filled.append((name, ref, float(m.group(1)), bool(fm)))
for name in b.namelist():
    if name not in a.namelist(): errs.append(f'thêm phần mới {name}')

if '--json' in sys.argv:
    print(json.dumps({'ok': not errs, 'errs': errs, 'filled': len(filled), 'props': len(props)}, ensure_ascii=False)); sys.exit(1 if errs else 0)
if errs:
    print('KHÔNG ĐẠT:'); [print('  -', e) for e in errs[:30]]; sys.exit(1)
same = sum(1 for n in a.namelist() if a.read(n) == b.read(n))
nf = sum(1 for x in filled if x[3])
if props:
    cols = sorted({f"{n.split('/')[-1][:-4]}!{col_of(r)}" for n, r, _ in props})
    print(f'Đạt: {len(props)} giá đề xuất trong cột riêng ({", ".join(cols)}); cột Đơn giá / Thành tiền và mọi ô khác giữ nguyên'
          + (f' (ngoài {len(filled)} ô trống được điền)' if filled else '') + f'; {same}/{len(a.namelist())} phần của file giống hệt từng byte; không thêm sheet.')
else:
    print(f'Đạt: chỉ điền {len(filled) - nf} ô đơn giá' + (f' + {nf} ô thành tiền (= KL × đơn giá)' if nf else '') + f' vào ô trống, giữ nguyên style; {same}/{len(a.namelist())} phần của file giống hệt từng byte; không thêm sheet/cột.')
