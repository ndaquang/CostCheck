# Module Đề xuất giá BOQ

Thả file Excel BOQ vào, phần mềm dùng cơ sở dữ liệu đơn giá (gói `.dgbw`, giống app Tra cứu) để **đề xuất đơn giá cho từng dòng**, **điền giá vào chính file Excel** (giữ nguyên định dạng) và **so sánh với giá baseline**.

Mọi xử lý chạy trong trình duyệt. Trang có CSP `connect-src 'none'`, nên dữ liệu không gửi ra ngoài được.

## Cách dùng

1. Mở **Đề xuất giá BOQ** trên thanh điều hướng của app Tra cứu (mở tab mới). Đăng nhập bằng gói `.dgbw` như app chính.
2. **Bước 1, nạp file**
   - *File BOQ* (`.xlsx`/`.xlsm`; file `.xls` cũ thì lưu lại thành `.xlsx` trước).
   - *Giá baseline* (không bắt buộc, nạp lúc nào cũng được): một file Excel có Mã/STT, Mô tả, Đơn vị và cột giá. Tiêu đề cột giá là "Baseline", "Ngân sách", "Giá gốc", "Budget"… (hoặc "Đơn giá").
   - *Phiên đã lưu* (`.dgbq`): khôi phục những gì đã chỉnh ở lần trước.
3. **Bước 2, kiểm tra cấu trúc.** Phần mềm tự tìm dòng tiêu đề (kể cả tiêu đề song ngữ hai dòng) và các cột Mã, Mô tả, Đơn vị, KL, Đơn giá, Thành tiền, VL, NC, Baseline. Nhận sai cột nào thì chọn lại cột đó; sheet nào không cần định giá thì bỏ chọn.
4. **Bước 3, kết quả**
   - Tùy chọn: cách chọn giá (P50 / P25 cạnh tranh / P75 an toàn / trung bình / năm gần nhất), khoảng năm, loại hình dự án, tỉnh/TP, hệ số điều chỉnh (%), mức tin cậy tối thiểu để tự điền, bỏ dòng REVIEW / ngoại lai / cảnh báo, ngưỡng lệch baseline.
   - Bảng chi tiết: nhóm khớp, độ tin cậy, đơn giá đề xuất, khoảng P25–P75, thành tiền, baseline, % lệch, tiền lệch, và **vị trí của baseline trên phân bố giá thị trường** (P0–P100).
   - Bấm một dòng để mở ngăn chi tiết. Ở đó có thể chọn nhóm khác trong danh sách gợi ý, tìm nhóm thủ công trong CSDL, sửa giá tay, nhập baseline, ghi chú, đánh dấu "không định giá", và xem các báo giá đã dùng để tính.
   - Tab **Tổng hợp & so sánh baseline**: phân bố lệch, baseline so với thị trường, 15 dòng lệch nhiều tiền nhất, tổng theo sheet và theo hạng mục cấp 1.
5. **Xuất Excel đã điền giá.** File gốc giữ nguyên style, ô gộp, công thức và các sheet khác. Phần mềm chỉ làm những việc sau:
   - Điền vào cột Đơn giá: chỉ ô trống, hoặc ghi đè. Ô đang có công thức không bao giờ bị ghi đè.
   - Ô Thành tiền trống thì điền công thức `=KL×ĐG`. Ô Thành tiền đã có công thức thì giữ nguyên, Excel tính lại khi mở file.
   - Nếu có cột VL/NC thì có thể tách theo tỷ lệ trung vị của nhóm.
   - Thêm các cột phân tích bên phải: ĐG đề xuất, P25, P75, số báo giá, tin cậy, nhóm khớp, baseline, lệch, %. Cột % được tô màu theo ngưỡng lệch.
   - Thêm sheet `DX_TongHop`, `DX_ChiTiet`, và `DX_ThamChieu` (chỉ admin: các báo giá đã dùng cho từng dòng).
   - Xuất lại lần nữa thì các sheet `DX_*` được thay mới, không bị nhân đôi.
6. **Lưu phiên** (`.dgbq`): lưu nhóm đã chọn tay, giá sửa tay, baseline nhập tay, ghi chú và danh sách baseline để làm tiếp sau, đúng như yêu cầu "từ từ bổ sung baseline".

## Cách phần mềm khớp và tính giá

- **Nhóm công việc**: dùng nhóm đại diện có sẵn trong CSDL (`D.g`). Dòng chưa có nhóm được gộp theo tên chuẩn hóa + đơn vị.
- **Khớp mô tả**: chuẩn hóa tiếng Việt (có dấu hay không dấu đều được), chấm điểm từ theo IDF trên tên đại diện và các biến thể tên. Có cộng điểm cụm 2 từ, chấp nhận từ viết tắt theo tiền tố và gõ sai 1 ký tự. Tiêu đề hạng mục cha (vd "PHẦN MÓNG") được dùng làm ngữ cảnh với trọng số thấp.
- **Phạt khi sai số hiệu**: M250 khác M300, D10 khác D16, dày 100 khác dày 200.
- **Đơn vị**: nhận nhiều cách viết (m², m2, md, tấn/kg, bộ/cái, trọn gói…). Tự quy đổi kg↔tấn và các đơn vị có hệ số như `100m2`. Khác đơn vị mà không quy đổi được thì độ tin cậy bị hạ.
- **Giá**: lấy giá đã quy về năm gốc (`p26`) của các báo giá trong nhóm, sau bộ lọc. Lọc xong mà không còn báo giá nào thì nới bộ lọc và gắn nhãn "đã nới bộ lọc". Giá được làm tròn (≥100.000 làm tròn đến 100 đ, ≥1.000 làm tròn đến 10 đ).
- **Độ tin cậy** gồm điểm khớp, số mẫu (chỉ 1 báo giá thì không bao giờ đạt "Cao") và độ phân tán P25–P75. Có 4 mức: Cao / Trung bình / Thấp / Không khớp.
- **Ghép baseline** theo thứ tự: sheet + mã + mô tả, rồi mô tả + đơn vị, rồi mã (mô tả phải giống ≥50%), rồi mô tả gần đúng ≥80%. Có quy đổi đơn vị. Giá nhập tay luôn được ưu tiên trước file baseline, và file baseline trước cột baseline trong BOQ.

## Phân quyền

Theo đúng chính sách hiện có ("nhân viên chỉ tra cứu, không xuất"), module **mặc định chỉ dành cho admin**:

- Bản admin (`docs/`) có module. Tài khoản nhân viên đăng nhập vào bản này sẽ bị chặn.
- Bản nhân viên (`dist/nhan_vien/`) không chứa module.
- Muốn mở cho nhân viên thì đổi cờ cuối trong `MODULE_LIST` của `build.py` thành `True`. Khi đó nhân viên không thấy tên dự án hay nguồn báo giá, và không có sheet `DX_ThamChieu`.

## Cấu trúc thư mục

```
modules/de_xuat_gia/
  index.html            giao diện (nguồn, chưa có cổng đăng nhập)
  assets/pricing.js     lõi: nhận diện BOQ, khớp nhóm, thống kê giá, baseline (chạy được cả trong Node)
  assets/xlsx-io.js     đọc/sửa/ghi .xlsx giữ nguyên định dạng (không cần thư viện ngoài)
  assets/dxg-app.js     giao diện, xuất Excel, lưu phiên
  assets/dxg.css
  tests/                dữ liệu giả lập + kiểm thử
```

Dựng: `python build.py` dựng app tra cứu và module. `python build.py --module` chỉ dựng lại module, không cần thư mục WEB. Kết quả nằm ở `docs/de-xuat-gia/`.

Chạy thử không qua cổng đăng nhập: đặt `data/db.js` (định dạng `window.DB = {...}`) cạnh `index.html` rồi mở trang qua một web server cục bộ.

## Kiểm thử

```
node modules/de_xuat_gia/tests/test_pricing.js         # lõi: khớp, đơn vị, bộ lọc, nhận diện cột, baseline
node modules/de_xuat_gia/tests/e2e.js <thư mục tạm>     # Chromium: nạp BOQ → đề xuất → baseline → sửa tay → xuất → khôi phục phiên
node modules/de_xuat_gia/tests/e2e_gate.js <thư mục tạm> # bản đã dựng: CSP + cổng đăng nhập + phân quyền admin/nhân viên
```

Hai bài e2e cần `playwright` và `openpyxl`. Mọi dữ liệu trong `tests/` đều là giả lập.

## Đề xuất chức năng tiếp theo

**Nâng độ chính xác**
1. **Học từ lựa chọn của người dùng**: lưu cặp "mô tả BOQ → nhóm đã chọn" thành bộ từ đồng nghĩa dùng chung. Lần sau gặp mô tả tương tự sẽ khớp đúng ngay.
2. **Chỉ số giá theo vùng và thời gian**: hệ số theo tỉnh/TP và chỉ số giá vật liệu chính (thép, xi măng, cát đá) để điều chỉnh tự động, thay cho một hệ số chung.
3. **Định giá theo phân tích đơn giá**: dòng không khớp thì ghép từ định mức (VL + NC + máy) theo đơn giá vật tư mới nhất.
4. **Mã NRM2 / mã công việc**: gắn mã cho từng dòng BOQ để lọc và tổng hợp theo chuẩn, và để so sánh giữa các dự án.

**Kiểm soát chi phí**
5. **So sánh nhiều nhà thầu**: nạp nhiều BOQ đã có giá của các nhà thầu, đặt cạnh nhau với giá đề xuất và baseline, đánh dấu dòng bất thường (bỏ giá thấp hoặc cao quá mức).
6. **Kiểm tra lỗi BOQ**: KL×ĐG khác thành tiền, đơn vị lạ, dòng trùng, tổng phụ sai, dòng thiếu khối lượng.
7. **Phân tích Pareto**: 20% hạng mục chiếm 80% giá trị, để tập trung kiểm tra và đàm phán.
8. **Mô phỏng ngân sách**: kịch bản P25/P50/P75 cho toàn gói thầu, độ nhạy theo vật liệu chính, gợi ý mức dự phòng.

**Quy trình**
9. **Lịch sử phiên bản baseline**: lưu nhiều lần baseline (v1, v2…) và xem chênh lệch giữa các phiên bản.
10. **Duyệt giá hai bước**: người lập đề xuất, admin duyệt. Đóng dấu người duyệt và thời điểm vào file xuất.
11. **Đưa kết quả về CSDL**: sau khi trúng thầu hoặc chốt giá, xuất các dòng đã duyệt thành báo giá mới để `build_data.py` nạp lại, giúp dữ liệu giàu dần.
12. **So sánh với đơn giá đối thủ**: admin xem thêm cột giá đối thủ (khối `doithu`) ngay trong bảng đề xuất.
13. **Báo cáo PDF / trang in** tóm tắt cho ban giám đốc: KPI, top lệch, biểu đồ phân bố.
