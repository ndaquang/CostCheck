# -*- coding: utf-8 -*-
"""Sinh file BOQ + baseline MẪU để kiểm thử (dữ liệu giả lập). Dùng: python make_boq.py <thư mục ra>"""
import sys, os
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Border, Side, Alignment

out = sys.argv[1] if len(sys.argv) > 1 else '.'
thin = Side(style='thin'); B = Border(left=thin, right=thin, top=thin, bottom=thin)
wb = Workbook(); ws = wb.active; ws.title = 'Xay dung'
ws['A1'] = 'BẢNG KHỐI LƯỢNG MỜI THẦU'; ws['A1'].font = Font(bold=True, size=14); ws.merge_cells('A1:H1')
hdr = ['STT', 'Mô tả công việc', 'Đơn vị', 'Khối lượng', 'Đơn giá', None, 'Thành tiền', 'Ghi chú']
hdr2 = ['No.', 'Description', 'Unit', 'Quantity', 'Vật liệu', 'Nhân công', 'Amount', 'Remark']
for c, v in enumerate(hdr, 1): ws.cell(3, c, v).font = Font(bold=True)
for c, v in enumerate(hdr2, 1): ws.cell(4, c, v).font = Font(italic=True)
rows = [
    ('A', 'PHẦN MÓNG', None, None),
    (1, 'Đào đất hố móng bằng máy đào', 'm3', 350),
    (2, 'Bê tông lót móng đá 4x6 mác 150', 'm3', 25.5),
    (3, 'Bê tông móng M300 đá 1x2', 'm3', 120),
    (4, 'Cốt thép D<=10', 'tấn', 4.2),
    (5, 'Ván khuôn móng', 'm2', 410),
    ('B', 'PHẦN HOÀN THIỆN', None, None),
    (6, 'Xây tường gạch đặc 220mm vữa M75', 'm3', 85),
    (7, 'Trát tường trong nhà dày 15mm', 'm2', 1600),
    (8, 'Sơn tường trong nhà 1 lớp lót 2 lớp phủ', 'm2', 1600),
    (9, 'Trần thạch cao khung chìm', 'm2', 640),
    (10, 'Hệ thống điều hòa VRV', 'bộ', 1),
]
r = 5
for code, desc, unit, qty in rows:
    ws.cell(r, 1, code); ws.cell(r, 2, desc); ws.cell(r, 3, unit); ws.cell(r, 4, qty)
    for c in range(1, 9): ws.cell(r, c).border = B
    if unit:
        ws.cell(r, 7, f'=D{r}*E{r}')   # công thức có sẵn
        ws.cell(r, 5).number_format = '#,##0'
    else:
        ws.cell(r, 2).font = Font(bold=True)
    r += 1
ws.cell(r, 2, 'Tổng cộng'); ws.cell(r, 7, f'=SUM(G5:G{r-1})')
ws.column_dimensions['B'].width = 50

ws2 = wb.create_sheet('Hoan thien')
ws2.append(['TT', 'Nội dung', 'ĐVT', 'KL', 'Đơn giá', 'Thành tiền', 'Giá baseline'])
ws2.append([1, 'Lát nền gạch ceramic 600x600', 'm2', 900, None, None, 300000])
ws2.append([2, 'Sơn tường trong', 'm2', 500, 70000, None, 60000])
ws2.append([3, 'Vận chuyển phế thải đi đổ', 'chuyến', 12, None, None, None])
wb.save(os.path.join(out, 'BOQ_mau.xlsx'))

bw = Workbook(); bs = bw.active; bs.title = 'Xay dung'
bs.append(['STT', 'Mô tả', 'Đơn vị', 'Baseline'])
for code, desc, unit, price in [(1, 'Đào đất hố móng bằng máy đào', 'm3', 50000), (2, 'Bê tông lót móng đá 4x6 mác 150', 'm3', 1000000),
                                (3, 'Bê tông móng M300 đá 1x2', 'm3', 1700000), (4, 'Cốt thép D<=10', 'kg', 19000),
                                (7, 'Trát tường trong nhà dày 15mm', 'm2', 130000), (9, 'Trần thạch cao khung chìm', 'm2', 255000)]:
    bs.append([code, desc, unit, price])
bw.save(os.path.join(out, 'Baseline_mau.xlsx'))
print('ok')
