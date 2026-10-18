# -*- coding: utf-8 -*-
"""Kiểm tra file xuất KHÔNG thay đổi bất kỳ thứ gì của BOQ gốc.
   Dùng: python verify_format.py <BOQ gốc.xlsx> <file xuất.xlsx>
   • Mọi phần của file gốc (sheet, chuỗi, theme, vùng in, định dạng có điều kiện…) giống hệt từng byte,
     trừ 4 phần mục lục phải sửa để THÊM sheet: workbook.xml, workbook.xml.rels, [Content_Types].xml, styles.xml.
   • 4 phần đó chỉ được thêm vào cuối: style/sheet/quan hệ cũ giữ nguyên thứ tự và nội dung."""
import sys, zipfile, re
import xml.etree.ElementTree as ET

src, out = sys.argv[1], sys.argv[2]
a, b = zipfile.ZipFile(src), zipfile.ZipFile(out)
INDEX = {'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', '[Content_Types].xml', 'xl/styles.xml'}
errs = []
for name in a.namelist():
    if name not in b.namelist():
        errs.append(f'thiếu phần {name}'); continue
    if name in INDEX: continue
    if a.read(name) != b.read(name): errs.append(f'phần {name} bị thay đổi')
NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
def canon(e): return re.sub(r'\s+', ' ', ET.tostring(e, encoding='unicode')).replace(' />', '/>')
def children_prefix(path, container):
    """Các phần tử con cũ của container (vd <fills>) phải giữ nguyên thứ tự và nội dung; chỉ được thêm vào cuối."""
    ra, rb = ET.fromstring(a.read(path)), ET.fromstring(b.read(path))
    ea, eb = (ra if container is None else ra.find(container)), (rb if container is None else rb.find(container))
    if ea is None: return
    if eb is None: errs.append(f'{path}: mất {container}'); return
    la, lb = list(ea), list(eb)
    if len(lb) < len(la): errs.append(f'{path}: số phần tử trong {container} giảm'); return
    for x, y in zip(la, lb):
        if canon(x) != canon(y): errs.append(f'{path}: phần tử cũ trong {container} bị đổi: {canon(x)[:120]} → {canon(y)[:120]}'); return
for tag in ['numFmts', 'fonts', 'fills', 'borders', 'cellStyleXfs', 'cellXfs', 'cellStyles', 'dxfs']:
    children_prefix('xl/styles.xml', NS + tag)
children_prefix('xl/workbook.xml', NS + 'sheets')
children_prefix('xl/workbook.xml', NS + 'definedNames')
for tag in ['calcPr', 'workbookPr', 'bookViews']:
    ea = ET.fromstring(a.read('xl/workbook.xml')).find(NS + tag); eb = ET.fromstring(b.read('xl/workbook.xml')).find(NS + tag)
    if (ea is None) != (eb is None) or (ea is not None and canon(ea) != canon(eb)): errs.append(f'workbook.xml: {tag} bị đổi')
children_prefix('xl/_rels/workbook.xml.rels', None)
children_prefix('[Content_Types].xml', None)
if errs:
    print('KHÔNG ĐẠT — định dạng BOQ gốc bị thay đổi:'); [print('  -', e) for e in errs]; sys.exit(1)
print(f'Đạt: {len(a.namelist())} phần của file gốc giữ nguyên ({len(a.namelist()) - len(INDEX)} phần giống từng byte); thêm {len(b.namelist()) - len(a.namelist())} phần mới.')
