# -*- coding: utf-8 -*-
"""Tạo file CẶP KHỚP MẪU (giả lập) cho CSDL giả lập của bộ chạy thử: mô tả BOQ → nhóm đúng.
   Định dạng giống file QS tự lập để train: cột Mô tả | Đơn vị | Tiêu đề hạng mục (không bắt buộc) | Nhóm đúng.
   Dùng: python tao_cap_mau.py <thư mục>"""
import sys, os
from openpyxl import Workbook
from openpyxl.styles import Font

CAP = [
    # (mô tả trong BOQ, đơn vị, tiêu đề gần nhất, nhóm đúng trong CSDL)
    ('Đào móng công trình bằng máy, đất cấp II', 'm3', 'CÔNG TÁC ĐẤT', 'Đào đất hố móng bằng máy'),
    ('Excavation for footing by machine', 'm3', 'EARTHWORK', 'Đào đất hố móng bằng máy'),
    ('Lấp đất hố móng, đầm chặt K=0,90', 'm3', 'CÔNG TÁC ĐẤT', 'Đắp đất hoàn trả hố móng, đầm chặt K90'),
    ('Backfill to foundation, compacted K90', 'm3', 'EARTHWORK', 'Đắp đất hoàn trả hố móng, đầm chặt K90'),
    ('Vận chuyển đất dư đổ đi, cự ly 5km', 'm3', 'CÔNG TÁC ĐẤT', 'Vận chuyển đất thừa đi đổ'),
    ('Ép cọc BTCT tiết diện 30x30cm', 'm', 'CỌC', 'Ép cọc BTCT 300x300'),
    ('BT lót móng đá 4x6 mác 150', 'm3', 'BÊ TÔNG MÓNG', 'Bê tông lót móng M150 đá 4x6'),
    ('Bê tông lót B10', 'm3', 'BÊ TÔNG MÓNG', 'Bê tông lót móng M150 đá 4x6'),
    ('Concrete footing grade B20 (M250) ready mix', 'm3', 'CONCRETE', 'Bê tông móng M300 đá 1x2'),
    ('Bê tông đài, giằng móng B22.5', 'm3', 'BÊ TÔNG MÓNG', 'Bê tông móng M300 đá 1x2'),
    ('Bê tông cột đá 1x2 mác 300', 'm3', 'BÊ TÔNG THÂN', 'Bê tông cột M300 đá 1x2'),
    ('BTTP dầm sàn M300', 'm3', 'BÊ TÔNG THÂN', 'Bê tông dầm sàn M300 đá 1x2'),
    ('Concrete for beams and slabs grade 300', 'm3', 'CONCRETE', 'Bê tông dầm sàn M300 đá 1x2'),
    ('SXLD cốt thép móng Φ≤10', 'kg', 'CỐT THÉP', 'Cốt thép móng D<=10'),
    ('Cốt thép móng đường kính ≤18', 'tấn', 'CỐT THÉP', 'Cốt thép móng D<=18'),
    ('Rebar for columns dia >18mm', 'kg', 'REINFORCEMENT', 'Cốt thép cột D>18'),
    ('Thép sàn, dầm phi 10', 'kg', 'CỐT THÉP', 'Cốt thép dầm sàn D<=10'),
    ('Cốp pha móng băng', 'm2', 'VÁN KHUÔN', 'Ván khuôn móng'),
    ('Formwork to columns', 'm2', 'FORMWORK', 'Ván khuôn cột'),
    ('Coppha dầm, sàn', 'm2', 'VÁN KHUÔN', 'Ván khuôn dầm sàn'),
    ('Xây tường gạch thẻ 220, VXM M75', 'm3', 'XÂY', 'Xây tường gạch đặc dày 220'),
    ('Xây tường gạch ống 4 lỗ dày 100', 'm2', 'XÂY', 'Xây tường gạch rỗng dày 100'),
    ('Xây gạch AAC 200, vữa chuyên dụng', 'm3', 'XÂY', 'Xây tường gạch bê tông nhẹ AAC dày 200'),
    ('Trát trong dày 1,5cm VXM M75', 'm2', 'TRÁT', 'Trát tường trong dày 15mm'),
    ('Internal plastering 15mm', 'm2', 'PLASTERING', 'Trát tường trong dày 15mm'),
    ('Trát ngoài 2cm', 'm2', 'TRÁT', 'Trát tường ngoài dày 20mm'),
    ('Sơn nước nội thất 1 lót 2 phủ', 'm2', 'SƠN', 'Sơn tường trong nhà 1 lót 2 phủ'),
    ('Sơn nước ngoại thất 1 lót 2 phủ', 'm2', 'SƠN', 'Sơn tường ngoài nhà 1 lót 2 phủ'),
    ('Bả bột trét tường trong', 'm2', 'SƠN', 'Bả matit tường trong'),
    ('Trần thạch cao phẳng khung chìm Vĩnh Tường', 'm2', 'TRẦN', 'Trần thạch cao khung chìm'),
    ('Gypsum ceiling moisture resistant, concealed frame', 'm2', 'CEILING', 'Trần thạch cao chống ẩm khung chìm'),
    ('Lát nền ceramic 60x60', 'm2', 'LÁT', 'Lát gạch ceramic 600x600'),
    ('Lát gạch porcelain 80x80', 'm2', 'LÁT', 'Lát gạch granite 800x800'),
    ('Ốp tường WC gạch 30x60', 'm2', 'ỐP', 'Ốp gạch ceramic tường 300x600'),
    ('Chống thấm sàn WC màng khò nóng', 'm2', 'CHỐNG THẤM', 'Chống thấm sàn vệ sinh màng khò nóng'),
    ('Waterproofing to roof slab, cementitious', 'm2', 'WATERPROOFING', 'Chống thấm sàn mái gốc xi măng'),
    ('Cửa đi nhôm Xingfa kính cường lực 8mm', 'm2', 'CỬA', 'Cửa đi nhôm hệ kính cường lực 8mm'),
    ('Cửa sổ nhôm kính dán an toàn 6.38mm', 'm2', 'CỬA', 'Cửa sổ nhôm kính 6.38mm'),
    ('Stainless steel railing SUS304', 'm', 'RAILING', 'Lan can inox 304'),
    ('Tôn lợp mái mạ màu 0.45mm', 'm2', 'MÁI', 'Mái tôn mạ màu dày 0.45'),
    ('SXLD khung kèo thép nhà xưởng', 'kg', 'KẾT CẤU THÉP', 'Kết cấu thép nhà xưởng'),
    ('Sơn chống cháy KCT R60', 'm2', 'KẾT CẤU THÉP', 'Sơn chống cháy kết cấu thép 60 phút'),
    ('Nền BTCT nhà xưởng dày 200, mác 300', 'm2', 'NỀN', 'Nền bê tông cốt thép dày 200 M300'),
    ('Ốp đá granite bậc cầu thang', 'm2', 'HOÀN THIỆN', 'Đá granite mặt bậc cầu thang'),
    ('Vách ngăn WC tấm compact 12mm', 'm2', 'HOÀN THIỆN', 'Vách ngăn vệ sinh compact HPL 12mm'),
    ('Vận chuyển xà bần ra khỏi công trường', 'chuyến', 'CHUNG', 'Vận chuyển phế thải đi đổ'),
    # mô tả ngắn: nghĩa nằm ở tiêu đề hạng mục
    ('Móng', 'm2', 'VÁN KHUÔN', 'Ván khuôn móng'),
    ('Cột', 'm2', 'VÁN KHUÔN', 'Ván khuôn cột'),
    ('Cột', 'm3', 'BÊ TÔNG M300', 'Bê tông cột M300 đá 1x2'),
    # lặp lại mô tả đã có (BOQ các dự án thường dùng lại cách ghi)
    ('Coppha dầm, sàn', 'm2', 'VÁN KHUÔN', 'Ván khuôn dầm sàn'),
    ('BTTP dầm sàn M300', 'm3', 'BÊ TÔNG THÂN', 'Bê tông dầm sàn M300 đá 1x2'),
    ('Thép sàn, dầm phi 10', 'kg', 'CỐT THÉP', 'Cốt thép dầm sàn D<=10'),
]
out = sys.argv[1] if len(sys.argv) > 1 else '.'
os.makedirs(out, exist_ok=True)
wb = Workbook(); ws = wb.active; ws.title = 'Cap khop'
ws.append(['CẶP KHỚP MẪU (GIẢ LẬP) — QS xác nhận nhóm đúng cho từng mô tả BOQ'])
ws['A1'].font = Font(bold=True)
ws.append([])
ws.append(['Mô tả', 'Đơn vị', 'Tiêu đề hạng mục', 'Nhóm đúng'])
for r in CAP: ws.append(list(r))
for c, w in zip('ABCD', (55, 9, 22, 45)): ws.column_dimensions[c].width = w
f = os.path.join(out, 'CapKhop_mau.xlsx'); wb.save(f); print(f)
