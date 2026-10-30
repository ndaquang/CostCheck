# -*- coding: utf-8 -*-
"""Sinh file BOQ + baseline MẪU để kiểm thử (dữ liệu giả lập). Dùng: python make_boq.py <thư mục ra>
   BOQ_mau.xlsx : BOQ chưa có giá, định dạng phong phú (gộp ô, màu, viền, độ rộng cột, định dạng số,
                  định dạng có điều kiện, vùng in, cố định dòng) để kiểm tra phần mềm KHÔNG đổi định dạng.
   BOQ_QS.xlsx  : cùng BOQ, QS đã nhập đơn giá (có dòng hợp lý, cần xem, bất thường)."""
import sys, os
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Border, Side, Alignment
from openpyxl.formatting.rule import CellIsRule

out = sys.argv[1] if len(sys.argv) > 1 else '.'
thin = Side(style='thin'); B = Border(left=thin, right=thin, top=thin, bottom=thin)
ROWS = [
    ('A', 'PHẦN MÓNG', None, None, None),
    (1, 'Đào đất hố móng bằng máy đào', 'm3', 350, 46000),
    (2, 'Bê tông lót móng đá 4x6 mác 150', 'm3', 25.5, 1600000),      # cao bất thường
    (3, 'Bê tông móng M300 đá 1x2', 'm3', 120, 1700000),
    (4, 'Cốt thép D<=10', 'tấn', 4.2, 19500000),
    (5, 'Ván khuôn móng', 'm2', 410, 120000),                          # thấp bất thường
    ('B', 'PHẦN HOÀN THIỆN', None, None, None),
    (6, 'Xây tường gạch đặc 220mm vữa M75', 'm3', 85, 1350000),
    (7, 'Trát tường trong nhà dày 15mm', 'm2', 1600, 100000),
    (8, 'Sơn tường trong nhà 1 lớp lót 2 lớp phủ', 'm2', 1600, None),  # QS chưa nhập
    (9, 'Trần thạch cao khung chìm', 'm2', 640, 265000),
    (10, 'Hệ thống điều hòa VRV', 'bộ', 1, 350000000),
]

def make(path, with_price):
    wb = Workbook(); ws = wb.active; ws.title = 'Xay dung'
    ws['A1'] = 'BẢNG KHỐI LƯỢNG MỜI THẦU'; ws['A1'].font = Font(bold=True, size=14, color='FF1F4E79'); ws.merge_cells('A1:H1')
    ws['A1'].alignment = Alignment(horizontal='center')
    hdr = ['STT', 'Mô tả công việc', 'Đơn vị', 'Khối lượng', 'Đơn giá', None, 'Thành tiền', 'Ghi chú']
    hdr2 = ['No.', 'Description', 'Unit', 'Quantity', 'Vật liệu', 'Nhân công', 'Amount', 'Remark']
    fill = PatternFill('solid', fgColor='FFD9E1F2')
    for c, v in enumerate(hdr, 1):
        x = ws.cell(3, c, v); x.font = Font(bold=True); x.fill = fill; x.border = B
    for c, v in enumerate(hdr2, 1):
        x = ws.cell(4, c, v); x.font = Font(italic=True); x.fill = fill; x.border = B
    r = 5
    for code, desc, unit, qty, price in ROWS:
        ws.cell(r, 1, code); ws.cell(r, 2, desc); ws.cell(r, 3, unit); ws.cell(r, 4, qty)
        for c in range(1, 9): ws.cell(r, c).border = B
        if unit:
            if with_price and price is not None: ws.cell(r, 5, price)
            ws.cell(r, 7, f'=D{r}*E{r}')
            ws.cell(r, 5).number_format = '#,##0'; ws.cell(r, 7).number_format = '#,##0'
        else:
            ws.cell(r, 2).font = Font(bold=True); ws.cell(r, 2).fill = PatternFill('solid', fgColor='FFFFF2CC')
        r += 1
    ws.cell(r, 2, 'Tổng cộng').font = Font(bold=True); ws.cell(r, 7, f'=SUM(G5:G{r-1})').number_format = '#,##0'
    ws.column_dimensions['B'].width = 50; ws.column_dimensions['G'].width = 18
    ws.freeze_panes = 'A5'; ws.print_area = f'A1:H{r}'
    ws.conditional_formatting.add(f'E5:E{r-1}', CellIsRule(operator='greaterThan', formula=['100000000'], fill=PatternFill('solid', bgColor='FFFFC7CE')))

    ws2 = wb.create_sheet('Hoan thien')
    ws2.append(['TT', 'Nội dung', 'ĐVT', 'KL', 'Đơn giá', 'Thành tiền', 'Giá baseline'])
    ws2.append([1, 'Lát nền gạch ceramic 600x600', 'm2', 900, 340000 if with_price else None, None, 300000])
    ws2.append([2, 'Sơn tường trong', 'm2', 500, 70000 if with_price else None, None, 60000])
    ws2.append([3, 'Vận chuyển phế thải đi đổ', 'chuyến', 12, None, None, None])
    wb.save(path)

make(os.path.join(out, 'BOQ_mau.xlsx'), False)
make(os.path.join(out, 'BOQ_QS.xlsx'), True)

bw = Workbook(); bs = bw.active; bs.title = 'Xay dung'
bs.append(['STT', 'Mô tả', 'Đơn vị', 'Baseline'])
for code, desc, unit, price in [(1, 'Đào đất hố móng bằng máy đào', 'm3', 50000), (2, 'Bê tông lót móng đá 4x6 mác 150', 'm3', 1000000),
                                (3, 'Bê tông móng M300 đá 1x2', 'm3', 1700000), (4, 'Cốt thép D<=10', 'kg', 19000),
                                (7, 'Trát tường trong nhà dày 15mm', 'm2', 130000), (9, 'Trần thạch cao khung chìm', 'm2', 255000)]:
    bs.append([code, desc, unit, price])
bw.save(os.path.join(out, 'Baseline_mau.xlsx'))
# BOQ ĐÃ CÓ GIÁ để kiểm tra: số liệu nhập cứng, có sai số học, sai dòng tổng, công thức lấy nhầm dòng, giá cao / thấp
kw = Workbook(); ks = kw.active; ks.title = 'Kiem tra'
ks.append(['BOQ NHÀ THẦU ĐÃ CHÀO GIÁ'])
ks.append(['STT', 'Mô tả công việc', 'Đơn vị', 'Khối lượng', 'Đơn giá', 'Thành tiền'])
ks.append(['A', 'PHẦN MÓNG', None, None, None, None])                                   # dòng 3
ks.append([1, 'Đào đất hố móng bằng máy đào', 'm3', 350, 46000, 16100000])             # 4 đúng
ks.append([2, 'Bê tông lót móng đá 4x6 mác 150', 'm3', 25.5, 1600000, 40800000])       # 5 giá cao quá
ks.append([3, 'Bê tông móng M300 đá 1x2', 'm3', 120, 1700000, 240000000])              # 6 sai số học (đúng 204.000.000)
ks.append([4, 'Ván khuôn móng', 'm2', 410, 120000, '=D6*E6'])                          # 7 công thức lấy nhầm dòng 6; giá thấp quá
ks.append([None, 'Cộng hạng mục A', None, None, None, 346100000])                      # 8 đúng (16,1 + 40,8 + 240 + 49,2 tr)
ks.append(['B', 'PHẦN HOÀN THIỆN', None, None, None, None])
ks.append([5, 'Trát tường trong nhà dày 15mm', 'm2', 1600, 100000, 160000000])
ks.append([6, 'Trần thạch cao khung chìm', 'm2', 640, 265000, 169600000])
ks.append([7, 'Sơn tường trong nhà 1 lớp lót 2 lớp phủ', 'm2', 1600, None, None])       # 12 chưa có giá
ks.append([None, 'Cộng hạng mục B', None, None, None, 329600000])
ks.append([None, 'Tổng cộng', None, None, None, 700000000])                            # 14 sai (đúng 675.700.000)
kw.save(os.path.join(out, 'BOQ_KiemTra.xlsx'))
print('ok')

# Đơn giá bổ sung (vd báo giá NCC mới) — có hạng mục không có trong CSDL
xw = Workbook(); xs = xw.active; xs.title = 'Bao gia NCC'
xs.append(['STT', 'Mô tả', 'Đơn vị', 'Đơn giá'])
xs.append([1, 'Hệ thống điều hòa VRV', 'bộ', 320000000])
xs.append([2, 'Sơn tường trong nhà 1 lớp lót 2 lớp phủ', 'm2', 61000])
xw.save(os.path.join(out, 'DonGia_BoSung.xlsx'))
