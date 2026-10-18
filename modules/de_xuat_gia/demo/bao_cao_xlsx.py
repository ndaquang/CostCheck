# -*- coding: utf-8 -*-
"""Xuất báo cáo kết quả chạy module ra Excel (KET_QUA.xlsx) từ ket_qua.json do chay_file.js tạo.
   Dùng: python bao_cao_xlsx.py <ket_qua.json> <KET_QUA.xlsx> <tên file BOQ> [ghi chú CSDL]"""
import sys, json
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Border, Side, Alignment
from openpyxl.formatting.rule import FormulaRule

src, out, ten_boq = sys.argv[1], sys.argv[2], sys.argv[3]
ghi_chu_csdl = sys.argv[4] if len(sys.argv) > 4 else ''
d = json.load(open(src, encoding='utf-8'))
rows, cau_truc = d['rows'], d['cauTruc']

thin = Side(style='thin', color='FFBFBFBF'); B = Border(left=thin, right=thin, top=thin, bottom=thin)
HEAD = PatternFill('solid', fgColor='FF1F4E79'); HF = Font(bold=True, color='FFFFFFFF')
REF = PatternFill('solid', fgColor='FFF2F2F2')
FILL = {'Hợp lý': ('FFE2F0D9', 'FF1F6B3A'), 'Cần xem': ('FFFFF2CC', 'FF7F6000'), 'Bất thường': ('FFF8CBAD', 'FF9C0006'),
        'Không có tham khảo': ('FFEDEDED', 'FF595959'), 'Chưa có giá QS': ('FFEDEDED', 'FF595959')}
LBL = {'ok': 'Hợp lý', 'xem': 'Cần xem', 'bt': 'Bất thường', 'nogia': 'Chưa có giá QS', 'notk': 'Không có tham khảo', 'skip': 'Bỏ qua'}
FIT = {'cao': 'Cao', 'tb': 'Trung bình', 'thap': 'Thấp', 'none': 'Không khớp'}

def header(ws, r, titles, widths=None):
    for c, t in enumerate(titles, 1):
        x = ws.cell(r, c, t); x.font = HF; x.fill = HEAD; x.border = B
        x.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
    if widths:
        for c, w in enumerate(widths, 1): ws.column_dimensions[ws.cell(1, c).column_letter].width = w

wb = Workbook()
# ---- Tóm tắt
ws = wb.active; ws.title = 'Tóm tắt'
ws['A1'] = f'KẾT QUẢ CHẠY MODULE THAM KHẢO GIÁ BOQ — {ten_boq}'; ws['A1'].font = Font(bold=True, size=14, color='FF1F4E79')
if ghi_chu_csdl:
    ws['A2'] = ghi_chu_csdl; ws['A2'].font = Font(italic=True, color='FFC00000')
dem = lambda k: sum(1 for r in rows if r['danh_gia'] == k)
co_qs = [r for r in rows if r.get('qs')]
both = [r for r in rows if r.get('qs') and r.get('ref') and r.get('kl')]
t_qs = sum(r['qs'] * r['kl'] for r in both); t_ref = sum(r['ref']['p50'] * r['kl'] for r in both)
kpi = [
    ('Dòng hạng mục đọc được', len(rows)),
    ('Có giá tham khảo từ CSDL', sum(1 for r in rows if r.get('ref'))),
    ('QS đã có giá', len(co_qs)),
    ('Hợp lý', dem('ok')), ('Cần xem', dem('xem')), ('Bất thường', dem('bt')),
    ('Chưa có giá QS', dem('nogia')), ('Không có tham khảo', dem('notk')),
    ('Tổng giá trị QS (dòng có cả giá QS và tham khảo)', round(t_qs) if both else None),
    ('QS so với P50 tham khảo', (t_qs - t_ref) / t_ref if t_ref else None),
    ('Thời gian đọc / khớp / xuất (giây)', f"{d['tRead']/1000:.1f} / {d['tMatch']/1000:.1f} / {d['tExport']/1000:.1f}"),
    ('Giữ nguyên định dạng BOQ gốc', d['fmt']),
]
header(ws, 4, ['Chỉ tiêu', 'Kết quả'], [52, 70])
for i, (k, v) in enumerate(kpi, 5):
    ws.cell(i, 1, k).border = B; c = ws.cell(i, 2, v); c.border = B; c.alignment = Alignment(wrap_text=True, horizontal='left')
    if k == 'QS so với P50 tham khảo': c.number_format = '+0.0%;-0.0%'
    elif isinstance(v, (int, float)): c.number_format = '#,##0'
    if k in FILL: c.fill = PatternFill('solid', fgColor=FILL[k][0]); c.font = Font(bold=True, color=FILL[k][1])

# ---- Đọc file
ws = wb.create_sheet('Đọc file')
header(ws, 1, ['Sheet', 'Dùng', 'Dòng tiêu đề', 'Mã', 'Mô tả', 'Đơn vị', 'Khối lượng', 'Đơn giá QS', 'Thành tiền', 'Baseline'], [18, 8, 12, 8, 8, 8, 11, 11, 11, 10])
for i, s in enumerate(cau_truc, 2):
    c = s['cot'] if s['dung'] else {}
    vals = [s['sheet'], 'có' if s['dung'] else 'không', s['dong_tieu_de'] if s['dung'] else None] + [c.get(k) for k in ['code', 'desc', 'unit', 'qty', 'rate', 'amount', 'base']]
    for j, v in enumerate(vals, 1): ws.cell(i, j, v).border = B
ws.freeze_panes = 'A2'

# ---- Chi tiết
ws = wb.create_sheet('Chi tiết')
H = ['Sheet', 'Dòng', 'Mã', 'Mô tả', 'Tiêu đề gần nhất', 'ĐV', 'KL', 'Nhóm tham khảo CSDL', 'Độ phù hợp', 'Số BG',
     'P10', 'P25', 'P50', 'P75', 'P90', 'Giá QS', 'QS / P50', 'Vị trí', 'Đánh giá', 'Lưu ý dữ liệu']
header(ws, 1, H, [12, 6, 6, 44, 30, 8, 10, 36, 11, 7, 12, 12, 12, 12, 12, 13, 9, 10, 18, 34])
for i, r in enumerate(rows, 2):
    ref = r.get('ref') or {}
    nhom = r.get('nhom') or ''
    vals = [r['sheet'], r['dong'], r['ma'], r['mo_ta'], r['near'], r['dv'], r['kl'],
            nhom if not nhom.startswith('gợi ý yếu') else '', FIT.get(r['phu_hop'], ''), r.get('n') if ref else None,
            *[round(ref[k]) if ref else None for k in ['p10', 'p25', 'p50', 'p75', 'p90']],
            r.get('qs'), (r['qs'] / ref['p50'] - 1) if (r.get('qs') and ref) else None, r.get('vi_tri') or None,
            LBL.get(r['danh_gia'], ''), '; '.join(x for x in [r.get('luu_y'), nhom if nhom.startswith('gợi ý yếu') else ''] if x)]
    for j, v in enumerate(vals, 1):
        c = ws.cell(i, j, v); c.border = B
        if j in (4, 5, 8, 20): c.alignment = Alignment(wrap_text=True, vertical='top')
        if j == 7: c.number_format = '#,##0.##'
        if 11 <= j <= 16: c.number_format = '#,##0'
        if 11 <= j <= 15: c.fill = REF
        if j == 16: c.font = Font(bold=True)
        if j == 17: c.number_format = '+0.0%;-0.0%'
n = len(rows) + 1
for lbl, (bg, fg) in FILL.items():
    ws.conditional_formatting.add(f'S2:S{n}', FormulaRule(formula=[f'$S2="{lbl}"'], fill=PatternFill('solid', bgColor=bg), font=Font(color=fg, bold=lbl == 'Bất thường')))
ws.freeze_panes = 'E2'; ws.auto_filter.ref = f'A1:T{n}'
wb.save(out)
print('ok', out)
