# Module Điền giá BOQ

Module lấy **giá tốt nhất** từ CSDL đơn giá (gói `.dgbw`, dùng chung với app Tra cứu) và **điền thẳng vào cột Đơn giá của file BOQ**.

## Nguyên tắc
- **Không thêm sheet, không thêm cột.** Phần mềm chỉ ghi số vào ô Đơn giá đang trống. Style ô, ô gộp, độ rộng cột, vùng in, liên kết ngoài và mọi công thức sẵn có đều giữ nguyên.
- Ô đã có giá, ô công thức, ô chữ không bao giờ bị ghi. Muốn ghi đè ô đã có giá thì bật tùy chọn "Ghi đè ô đã có giá".
- Ô Thành tiền đang trống (không giá trị, không công thức) được điền công thức `= KL × Đơn giá` của cùng dòng, kèm giá trị lưu sẵn. Nhờ vậy tổng biểu và sheet Tổng hợp tự cộng. Có thể tắt tùy chọn này.
- File được đặt cờ để Excel tính lại khi mở (`fullCalcOnLoad`). Đây là thay đổi duy nhất trong `workbook.xml`.
- `tests/verify_fill.py` kiểm tra file xuất chỉ khác file gốc ở đúng các ô vừa điền (trước đó trống, giữ nguyên style). Mọi phần khác giống hệt từng byte.

## Chọn giá "tốt nhất"
| Tùy chọn | Ý nghĩa |
|---|---|
| **Tốt nhất — cạnh tranh (P25)** (mặc định) | 25% báo giá đáng tin thấp hơn mức này |
| Thấp nhất hợp lý (P10) | mức thấp nhất còn đáng tin |
| Trung vị (P50) | mức phổ biến của thị trường |
| Năm gần nhất | trung vị các báo giá của năm mới nhất |

- "Báo giá đáng tin" là báo giá còn lại sau các bộ lọc: bỏ giá ngoại lai, bỏ dòng REVIEW, và lọc theo năm, loại hình, tỉnh/TP nếu có chọn. Có hệ số điều chỉnh (%) và tùy chọn làm tròn.
- **Chỉ điền khi đủ tin cậy:** nhóm tham khảo khớp từ mức "Trung bình" trở lên (chỉnh được) và cùng đơn vị (hoặc quy đổi được, vd kg ↔ tấn). Dòng không đạt được để trống, kèm lý do, để QS định giá.
- Dòng được điền với độ khớp Trung bình có ghi chú "nên kiểm tra".
- QS có thể chọn nhóm khác hoặc nhập giá tay cho từng dòng trong ngăn chi tiết.

## Làm kết quả chính xác hơn
- **Đơn giá bổ sung:** nạp thêm file Excel có cột Mô tả, Đơn vị, Đơn giá (báo giá NCC, BOQ đã chốt giá, bảng giá mới…). Các giá này được thêm vào CSDL của phiên làm việc và **ưu tiên khi khớp**. Nạp được nhiều file, và chúng được lưu cùng phiên (`.dgbq`).
- **Cập nhật CSDL chung:** đưa báo giá mới vào dữ liệu nguồn của app Tra cứu rồi dựng lại gói `.dgbw`. Module dùng ngay gói mới.

## Quy trình
1. Nạp BOQ, có thể kèm đơn giá bổ sung và baseline.
2. Kiểm tra cấu trúc. Chú ý **cột Đơn giá**, vì đây là cột sẽ được điền.
3. Bấm **Tính giá điền**, xem từng dòng: Sẽ điền / Giữ giá có sẵn / Không điền và lý do.
4. Bấm **Điền giá vào BOQ & tải về**. File nhận được là `<tên>_DaDienGia.xlsx`.
5. **Lưu phiên** để làm tiếp lần sau.

Baseline (nếu nạp) chỉ dùng để so sánh trên màn hình, không ghi vào BOQ.

## Cách khớp nhóm và tính giá tham khảo

- **Nhóm công việc**: dùng nhóm đại diện có sẵn trong CSDL. Dòng chưa có nhóm thì gộp theo tên chuẩn hóa + đơn vị.
- **Khớp mô tả**: tiếng Việt có dấu hay không dấu đều được. Chấm điểm từ theo IDF, cộng điểm cụm 2 từ, chấp nhận tiền tố và lỗi gõ 1 ký tự. Tiêu đề hạng mục cha được dùng làm ngữ cảnh.
- **Thông số**: khác số hiệu (M250/M300, D10/D16, dày 100/200) thì trừ điểm.
- **Đơn vị**: nhận nhiều cách viết, tự quy đổi kg↔tấn và đơn vị có hệ số (`100m2`).
- **Phân bố giá**: lấy giá đã quy về năm gốc của các báo giá trong nhóm, sau các bộ lọc: năm, loại hình, tỉnh/TP, bỏ REVIEW / ngoại lai / cảnh báo. Có thể nhân thêm hệ số điều chỉnh (%). Lọc xong không còn mẫu nào thì nới bộ lọc và ghi rõ trong lưu ý dữ liệu.

## Phân quyền

- **Mặc định chỉ admin** dùng module, đúng chính sách "nhân viên chỉ tra cứu". Tài khoản nhân viên mở trang sẽ bị chặn, và bản nhân viên không chứa module.
- Muốn mở cho nhân viên: đặt cờ cuối trong `MODULE_LIST` của `build.py` thành `True`. Khi đó nhân viên không thấy tên dự án và nguồn báo giá.

## Cấu trúc thư mục

```
modules/de_xuat_gia/
  index.html            giao diện (nguồn, chưa có cổng đăng nhập)
  assets/pricing.js     lõi: nhận diện BOQ, khớp nhóm, thống kê giá, baseline (chạy được trong Node)
  assets/xlsx-io.js     đọc .xlsx, điền giá bằng cách sửa đúng ô trong XML, không ghi lại cả sheet (không cần thư viện ngoài)
  assets/dxg-app.js     giao diện, tính giá điền, điền vào BOQ, đơn giá bổ sung, lưu phiên
  assets/dxg.css
  tests/                dữ liệu giả lập + kiểm thử
```

Dựng: `python build.py` (app tra cứu + module) hoặc `python build.py --module` (chỉ module). Kết quả nằm ở `docs/de-xuat-gia/`.

## Chạy thử với dữ liệu giả lập

```
node modules/de_xuat_gia/demo/chay_thu.js          # chạy trọn quy trình, kết quả ở modules/de_xuat_gia/demo/ket_qua/
node modules/de_xuat_gia/demo/chay_thu.js --mo     # mở trang chạy thử (http://127.0.0.1:8765) để tự thao tác
```

Dữ liệu chạy thử gồm CSDL giả lập (khoảng 500 báo giá, 40 nhóm công việc, 12 dự án, năm 2020–2026) và BOQ nhà xưởng 36 dòng có định dạng như BOQ thật. Bộ chạy thử chạy 2 trường hợp: BOQ chưa có giá, và BOQ đã có một phần giá QS.

Chạy trên một file BOQ bất kỳ (BOQ thật):

```
node modules/de_xuat_gia/demo/chay_file.js --boq <file.xlsx> [--extra <đơn giá bổ sung.xlsx> ...] [--baseline <file.xlsx>] [--db <db.js>] [--pick p25|p10|med|latest] [--out <thư mục>]
```

Kết quả gồm file `<tên>_DaDienGia.xlsx` (BOQ đã điền giá) và báo cáo **riêng** `KET_QUA.xlsx` (sheet Tóm tắt, Đọc file, Chi tiết từng dòng: giá điền, P10–P90, lý do điền/không điền). Mặc định so với CSDL giả lập. Muốn có giá tham khảo thật thì truyền `--db` là CSDL thật dạng `window.DB = {...}`, hoặc dùng trang web với gói `.dgbw`.

### Các mẫu BOQ thật đã xử lý
- Dòng có chữ "Ghi chú" ở cột Đơn vị, đoạn thuyết minh dài, dòng "......" được bỏ qua: không phải hạng mục, cũng không phải tiêu đề.
- "CÔNG TÁC …" là tiêu đề, không nhầm với dòng "CỘNG"; "TỔNG QUÁT" không phải dòng tổng.
- Tiêu đề phụ không có mã ("BÊ TÔNG LÓT B10", "BÊ TÔNG B20, W8") ngang cấp nhau, nằm dưới tiêu đề có mã gần nhất (A, B, I…).
- Tiêu đề bảng 2 dòng có dòng con ngắn ("Khối lượng" → "Mời thầu / Dự thầu").
- Mô tả ngắn ("Móng", "Dầm", "Sàn tầng 1") dùng tiêu đề gần nhất làm nội dung chính khi khớp, nhưng vẫn ưu tiên từ của chính mô tả.
- Cấp độ bền bê tông B quy về mác M (B10 → M150, B20 → M250, B25 → M350…). Thông số có tiền tố khác giá trị (M150/M300, D10/D18, CB300/CB500) bị phạt mạnh.
- Sheet chỉ có điều kiện chung hoặc thuyết minh (không có dòng hạng mục) mặc định không dùng. Sheet "rộng" hàng nghìn cột vẫn đọc nhanh.

## Kiểm thử

```
node modules/de_xuat_gia/tests/test_pricing.js          # lõi: khớp, đơn vị, bộ lọc, nhận diện cột, baseline
node modules/de_xuat_gia/tests/e2e.js <thư mục tạm>      # Chromium + LibreOffice: điền giá P25, chỉ ô trống thay đổi,
                                                         # Thành tiền/Tổng tính lại, giữ giá QS có sẵn, đơn giá bổ sung, phiên
node modules/de_xuat_gia/tests/e2e_gate.js <thư mục tạm> # bản đã dựng: CSP + cổng đăng nhập + phân quyền
python modules/de_xuat_gia/tests/verify_fill.py <BOQ gốc> <file đã điền>  # chỉ các ô trống được điền, mọi thứ khác giữ nguyên
```

Mọi dữ liệu trong `tests/` là giả lập.

## Hướng phát triển

1. **Học từ lựa chọn của QS**: lưu cặp "mô tả BOQ → nhóm tham khảo QS chọn" để lần sau khớp đúng ngay.
2. **Khớp theo thuộc tính kỹ thuật**: tách mác, đường kính, chiều dày, cấu kiện; nhóm sai thông số chính thì loại hẳn thay vì chỉ trừ điểm.
3. **Chỉ số giá theo vùng và thời gian** (thép, xi măng, cát đá) thay cho một hệ số chung.
4. **Nạp giá chốt hoặc trúng thầu** về CSDL, rồi đo độ lệch giữa giá tham khảo và giá chốt để biết nhóm nào cần thêm dữ liệu.
5. **Mẫu báo cáo tư vấn** (PDF / Word) từ sheet đánh giá và ý kiến QS.
6. **Add-in Excel** (phương án B): xem giá tham khảo ngay trong Excel khi chọn một dòng.
