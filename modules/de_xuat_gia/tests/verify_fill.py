# -*- coding: utf-8 -*-
"""Kiểm tra file BOQ đã điền giá CHỈ khác file gốc ở đúng các ô đơn giá được điền.
   Dùng: python verify_fill.py <BOQ gốc.xlsx> <BOQ đã điền.xlsx> [--json]
   • Mọi phần của file (theme, chuỗi, style, ô gộp, vùng in, liên kết ngoài…) giống hệt từng byte,
     trừ: các sheet có ô được điền, và workbook.xml (chỉ được thêm fullCalcOnLoad="1" để Excel tính lại).
   • Trong sheet: mọi thứ ngoài các ô giống hệt; mỗi ô khác nhau phải là ô trước đó TRỐNG (không giá trị, không
     công thức), giữ nguyên thuộc tính s (style), và giờ chỉ chứa một giá trị số — hoặc công thức Thành tiền
     dạng KL×Đơn giá cùng dòng. Không ô nào bị xóa."""
import sys, zipfile, re, json

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

for name in a.namelist():
    if name not in b.namelist():
        errs.append(f'thiếu phần {name}'); continue
    xa, xb = a.read(name), b.read(name)
    if xa == xb: continue
    if name == 'xl/workbook.xml':
        norm = xb.replace(b' fullCalcOnLoad="1"', b'')
        norm = re.sub(rb'<(\w+:)?calcPr/>', b'', norm)
        if norm != xa.replace(b' fullCalcOnLoad="1"', b''):
            errs.append('workbook.xml: thay đổi ngoài fullCalcOnLoad')
        continue
    if not name.startswith('xl/worksheets/sheet'):
        errs.append(f'phần {name} bị thay đổi'); continue
    ca, cb = cells(xa), cells(xb)
    if CELL.sub(b'', xa) != CELL.sub(b'', xb):
        errs.append(f'{name}: nội dung ngoài các ô bị thay đổi'); continue
    for ref, c in ca.items():
        if ref not in cb: errs.append(f'{name}: mất ô {ref}')
    for ref, c in cb.items():
        old = ca.get(ref)
        if old == c: continue
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
    print(json.dumps({'ok': not errs, 'errs': errs, 'filled': len(filled)}, ensure_ascii=False)); sys.exit(1 if errs else 0)
if errs:
    print('KHÔNG ĐẠT:'); [print('  -', e) for e in errs[:30]]; sys.exit(1)
same = sum(1 for n in a.namelist() if a.read(n) == b.read(n))
nf = sum(1 for x in filled if x[3])
print(f'Đạt: chỉ điền {len(filled) - nf} ô đơn giá' + (f' + {nf} ô thành tiền (= KL × đơn giá)' if nf else '') + f' vào ô trống, giữ nguyên style; {same}/{len(a.namelist())} phần của file giống hệt từng byte; không thêm sheet/cột.')
