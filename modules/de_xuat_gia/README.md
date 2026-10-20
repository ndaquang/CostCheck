# Module Điền giá BOQ

Module lấy **giá tốt nhất** từ mọi nguồn giá trong gói dữ liệu `.dgbw` (CSDL nội bộ dùng chung với app Tra cứu, đơn giá đối thủ, CTG nếu có) cùng đơn giá bổ sung, rồi ghi vào file BOQ. Mặc định giá nằm ở **một cột riêng "ĐƠN GIÁ ĐỀ XUẤT (CSDL)" được tô màu**, tách khỏi giá QS trong cột Đơn giá.

## Vị trí trong phần mềm
Module là mục **"Điền giá BOQ"** trên thanh điều hướng của app Tra cứu đơn giá, cạnh Tra cứu / Điểm rơi giá / Phân tích. **Chỉ tài khoản admin thấy mục này.** Module dùng chung lần đăng nhập và CSDL đã nạp của app, không cần đăng nhập lại.

Mã nguồn module vẫn nằm riêng trong `modules/de_xuat_gia/`. `build.py` ghép module vào app khi dựng:
- chép mã vào `docs/assets/dxg/`;
- giới hạn CSS trong `#sec-dxg` để không ảnh hưởng giao diện app;
- chèn giao diện dạng `<template>`.

Sau khi sửa module, chạy `python build.py --module` để ghép lại. Lệnh này không cần thư mục `WEB/`.

Trên giao diện có các nút:
- **Nhập Excel BOQ…**: file cần điền giá.
- **Nhập Excel đơn giá…**: đơn giá bổ sung.
- **Nhập Excel baseline…**
- **Xuất Excel đã điền giá**: BOQ gốc kèm cột giá đề xuất tô màu (hoặc giá điền vào cột Đơn giá, tùy tùy chọn "Ghi giá vào").
- **Xuất báo cáo Excel**: file riêng gồm sheet Tóm tắt và Chi tiết từng dòng.

## Nguyên tắc
Tùy chọn **"Ghi giá vào"** có hai cách:

**Cột riêng "Đơn giá đề xuất" (mặc định)**: giá đề xuất không trộn với giá khác.
- Phần mềm thêm **một cột** ngay sau cột cuối của bảng (sau mọi cột có dữ liệu như Ghi chú, Baseline, và sau ô gộp). Tiêu đề cột là **"ĐƠN GIÁ ĐỀ XUẤT (CSDL)"** kèm cách chọn giá (vd "P25"), nền cam đậm. Mỗi ô giá có nền vàng và định dạng `#,##0`.
- Cột Đơn giá, Thành tiền, công thức, tổng cộng và giá QS có sẵn **giữ nguyên**. Dòng đã có giá QS vẫn có giá đề xuất ở cột riêng để so sánh. Dòng không có đề xuất để trống ô.
- Không thêm sheet. Vùng in giữ nguyên, nên cột đề xuất là cột làm việc nằm ngoài vùng in.
- Nạp lại file đã xuất: cột đề xuất được nhận ra, không bị nhầm là cột Đơn giá. Lần xuất sau ghi lại vào đúng cột đó, không thêm cột mới.
- Mỗi lần xuất đều ghi lên **file BOQ gốc**. Giá của các lần xuất trước (cách khác, tùy chọn khác) không lẫn vào file mới.

**Ô Đơn giá đang trống**: cách cũ, không thêm sheet hay cột.
- Phần mềm chỉ ghi số vào ô Đơn giá đang trống. Ô đã có giá, ô công thức, ô chữ không bị ghi, trừ khi bật "Ghi đè ô đã có giá".
- Ô Thành tiền đang trống được điền công thức `= KL × Đơn giá` cùng dòng, kèm giá trị lưu sẵn, để tổng biểu tự cộng. Có thể tắt.
- File được đặt cờ để Excel tính lại khi mở (`fullCalcOnLoad`). Đây là thay đổi duy nhất trong `workbook.xml`.

Cả hai cách đều giữ nguyên style ô, ô gộp, độ rộng các cột có sẵn, vùng in, liên kết ngoài và mọi công thức. `tests/verify_fill.py` kiểm tra file xuất chỉ khác file gốc ở đúng các ô phần mềm ghi:
- ô trống được điền, giữ nguyên style;
- hoặc ô thuộc cột đề xuất, trong file gốc không có dữ liệu.

`styles.xml` chỉ được thêm style mới. Mọi phần khác giống hệt từng byte.

## Nguồn giá

Giá đề xuất lấy từ mọi nguồn dưới đây, gộp chung vào phân bố giá của từng nhóm công việc:

| Nguồn | Lấy từ | Ghi chú |
|---|---|---|
| Nội bộ | khối `db` của gói `.dgbw` (dùng chung với app Tra cứu) | nguồn chính |
| Đối thủ | khối `doithu` của gói `.dgbw` (cùng dữ liệu mục "Đối thủ" của app) | chỉ khóa admin mở được |
| CTG | khối `ctg` của gói `.dgbw`, nếu có | cần cùng định dạng CSDL (xem lưu ý dưới) |
| Bổ sung | file Excel nạp bằng **Nhập Excel đơn giá…** | ưu tiên nhẹ khi khớp |

- Khi mở mục Điền giá BOQ, module tự mở các khối `doithu`, `ctg` bằng khóa của tài khoản đang đăng nhập. Khối nào không có trong gói (hoặc tài khoản không có quyền) thì bỏ qua và ghi rõ ở dòng **"Nguồn giá đang dùng"** ngay đầu module. Ví dụ: "nội bộ 12.345 · đối thủ 3.456 báo giá · CTG: không có trong gói dữ liệu".
- Nhóm đại diện của nguồn khác **trùng tên + đơn vị** với nhóm nội bộ được gộp chung: báo giá hai nguồn vào cùng một phân bố, P25 tính trên tất cả. Nhóm chỉ nguồn khác có thì thêm thành nhóm mới. Nhờ vậy dòng BOQ mà CSDL nội bộ chưa có vẫn có giá.
- Tùy chọn **"Nguồn giá"** (bước 3) bỏ chọn được từng nguồn. Báo giá của nguồn bị bỏ chọn không vào phân bố, kể cả khi phần mềm phải nới các bộ lọc khác.
- Ngăn chi tiết, báo cáo Excel (cột "Nguồn báo giá") ghi số báo giá theo từng nguồn, vd "12 báo giá (nội bộ 9, đối thủ 3)".
- Gộp diễn ra trong bộ nhớ của module. CSDL của app Tra cứu và gói `.dgbw` không bị sửa.
- Mỗi khối phải cùng định dạng `window.DB` của app (cols, dicts, projects), với giá đã quy về cùng năm gốc. Khối có năm gốc khác được ghi lưu ý; khối khác định dạng được báo "định dạng khác, chưa dùng được".
- Công cụ `hoc/` và `demo/chay_file.js` nhận `--them data/doithu.js` (lặp được, có thể kèm `=Nhãn`) để train, soát dữ liệu và chạy thử trên cùng các nguồn với trang web. `lam_sach.js --sua` không dùng cùng `--them`, để bản CSDL sửa không trộn nguồn khác vào.

## Chọn giá "tốt nhất"
| Tùy chọn | Ý nghĩa |
|---|---|
| **Tốt nhất — cạnh tranh (P25)** (mặc định) | 25% báo giá đáng tin thấp hơn mức này |
| Thấp nhất hợp lý (P10) | mức thấp nhất còn đáng tin |
| Trung vị (P50) | mức phổ biến của thị trường |
| Năm gần nhất | trung vị các báo giá của năm mới nhất |

- "Báo giá đáng tin" là báo giá còn lại sau các bộ lọc: bỏ giá ngoại lai, bỏ dòng REVIEW, và lọc theo nguồn, năm, loại hình, tỉnh/TP nếu có chọn. Có hệ số điều chỉnh (%) và tùy chọn làm tròn.
- **Chỉ điền khi đủ tin cậy:** nhóm tham khảo khớp từ mức "Trung bình" trở lên (chỉnh được) và cùng đơn vị (hoặc quy đổi được, vd kg ↔ tấn). Dòng không đạt được để trống, kèm lý do, để QS định giá.
- Dòng được điền với độ khớp Trung bình có ghi chú "nên kiểm tra".
- QS có thể chọn nhóm khác hoặc nhập giá tay cho từng dòng trong ngăn chi tiết.

## Làm kết quả chính xác hơn
- **Đơn giá bổ sung:** nạp thêm file Excel có cột Mô tả, Đơn vị, Đơn giá (báo giá NCC, BOQ đã chốt giá, bảng giá mới…). Các giá này được thêm vào CSDL của phiên làm việc và **ưu tiên khi khớp**. Nạp được nhiều file, và chúng được lưu cùng phiên (`.dgbq`).
- **Cập nhật CSDL chung:** đưa báo giá mới vào dữ liệu nguồn của app Tra cứu rồi dựng lại gói `.dgbw`. Module dùng ngay gói mới.
- **Dữ liệu học (.dxgl):** mỗi lần QS chọn nhóm đúng cho một dòng (trong ngăn chi tiết), bấm **Lưu dữ liệu học**. Lần sau mở file `.dxgl` ở ô "Mở phiên / dữ liệu học": mô tả đã gặp khớp đúng ngay nhóm QS chọn (độ khớp Cao), mô tả gần giống được ưu tiên nhóm đó, nhóm QS đã bác bị hạ điểm. Xem mục **Train khớp và làm sạch dữ liệu** bên dưới.

## Train khớp và làm sạch dữ liệu

Phần mềm không dùng mô hình AI "hộp đen": khớp theo từ (IDF), từ đồng nghĩa ngành xây dựng và **bộ nhớ các lần QS xác nhận**. Muốn tỉ lệ khớp cao và giá đáng tin, làm theo 3 bước, lặp lại sau mỗi đợt BOQ:

**1. Làm sạch CSDL đơn giá** — lỗi dữ liệu vừa làm khớp sai vừa làm lệch P25/P50.
```
node modules/de_xuat_gia/hoc/lam_sach.js --db data/db.js --out ket_qua_lam_sach [--sua db_sach.js] [--gan-nhom]
```
Báo cáo `BAO_CAO_LAM_SACH.xlsx` liệt kê: giá không hợp lệ, dòng trùng hệt, ngoại lai chưa đánh dấu, đơn vị lạ, lệch đơn vị trong nhóm, nhóm phân tán lớn (đang gộp nhiều quy cách), nhóm trùng nhau, mô tả không rõ ("Tổng cộng" nhập nhầm), dòng chưa có nhóm (kèm nhóm gợi ý), dòng có thể sai nhóm. `--sua` ghi **bản CSDL mới** đã bỏ dòng trùng / giá 0 và đánh dấu ngoại lai (không xóa); `--gan-nhom` gán thêm nhóm cho dòng chưa có nhóm khi gợi ý rất chắc (≥ 0,85, cùng đơn vị). CSDL gốc không bị sửa. Các lỗi còn lại sửa trong dữ liệu nguồn của app Tra cứu rồi dựng lại gói `.dgbw`.

**2. Thu thập lựa chọn của QS** — nguồn "dữ liệu train", càng nhiều càng tốt:
- phiên làm việc `.dgbq` (lưu từ trang Điền giá: các dòng QS đã chọn nhóm);
- file `.dxgl` (nút **Lưu dữ liệu học**);
- file Excel QS tự lập: cột **Mô tả | Đơn vị | Tiêu đề hạng mục** (không bắt buộc) **| Nhóm đúng** (tên nhóm đại diện trong CSDL). Mẫu: `python modules/de_xuat_gia/hoc/tao_cap_mau.py <thư mục>`;
- (không bắt buộc) file từ đồng nghĩa: cột **Từ | Nghĩa chuẩn** (vd "cốp pha" → "ván khuôn").

**3. Train và đo tỉ lệ khớp**
```
node modules/de_xuat_gia/hoc/hoc.js --db data/db.js --cap CapKhop.xlsx --phien a.dgbq --phien b.dgbq \
     [--mo-hinh cu.dxgl] [--dong-nghia DongNghia.xlsx] [--boq-gia BOQ_da_chot_gia.xlsx] --out ket_qua_hoc
```
Kết quả:
- `hoc_khop.dxgl`: nạp vào trang Điền giá BOQ (ô "Mở phiên / dữ liệu học"). Lần sau truyền lại bằng `--mo-hinh` để cộng dồn.
- `BAO_CAO_HOC.xlsx`: Top-1 / Top-3, tỉ lệ điền, độ chính xác khi điền, **tỉ lệ điền sai**, theo 3 trường hợp: trước khi học, mô tả mới (kiểm tra chéo: mô tả đem thử chưa có trong dữ liệu học, ước lượng đúng cho BOQ mới), mô tả đã gặp. Có ngưỡng "Chỉ điền khi khớp ≥" khuyến nghị (mức điền nhiều nhất mà vẫn đúng ≥ 95%, cần ≥ 100 cặp mới hạ ngưỡng), danh sách dòng khớp sai, **gợi ý từ đồng nghĩa** để QS duyệt, và (với `--boq-gia`) độ lệch giá tham khảo so với giá chốt thật.

Lưu ý: CSDL dựng lại có thể đổi mã nhóm; dữ liệu học tìm lại nhóm theo tên + đơn vị. Đổi tên nhóm trong CSDL thì cặp cũ báo "không còn nhóm" — sửa tên trong file cặp khớp rồi train lại.

Khớp có sẵn (không cần train): viết tắt / đồng nghĩa (BT, BTCT, BTTP, cốp pha ↔ ván khuôn, mác 300 → M300, Φ10 / phi 10 / đường kính 10 → D10, gạch ống ↔ gạch rỗng, WC ↔ vệ sinh, nội thất ↔ trong nhà…), thuật ngữ BOQ tiếng Anh thường gặp (concrete, formwork, rebar, plastering, waterproofing…); bỏ các cụm động từ chung ("sản xuất lắp dựng", "tháo dỡ", "gia công") để không lấn át từ phân biệt như móng / cột / dầm.

## Quy trình
1. Nạp BOQ, có thể kèm đơn giá bổ sung và baseline.
2. Kiểm tra cấu trúc: cột Mô tả, Đơn vị, Khối lượng, Đơn giá (giá QS có sẵn; là cột được điền nếu chọn "Ghi giá vào: Ô Đơn giá đang trống").
3. Bấm **Tính giá điền**, xem từng dòng: Sẽ điền / Giữ giá có sẵn / Không điền và lý do.
4. Bấm **Xuất Excel đã điền giá**. File nhận được là `<tên>_DaDienGia.xlsx`, giá đề xuất ở cột riêng tô màu.
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
  index.html            giao diện: trang chạy thử độc lập; phần <main> và ngăn chi tiết được ghép vào app khi dựng
  assets/pricing.js     lõi: nhận diện BOQ, khớp nhóm, thống kê giá, baseline (chạy được trong Node)
  assets/xlsx-io.js     đọc .xlsx, điền giá bằng cách sửa đúng ô trong XML, không ghi lại cả sheet (không cần thư viện ngoài)
  assets/dxg-app.js     giao diện, tính giá điền, điền vào BOQ, đơn giá bổ sung, lưu phiên
  assets/dxg.css
  hoc/                  công cụ chạy bằng Node: lam_sach.js (soát / sửa CSDL), hoc.js (train + đo tỉ lệ khớp), tao_cap_mau.py
  tests/                dữ liệu giả lập + kiểm thử
```

Dựng: `python build.py` (app tra cứu + ghép module) hoặc `python build.py --module` (chỉ ghép lại module vào `docs/`).

## Chạy thử với dữ liệu giả lập

```
node modules/de_xuat_gia/demo/chay_thu.js          # chạy trọn quy trình, kết quả ở modules/de_xuat_gia/demo/ket_qua/
node modules/de_xuat_gia/demo/chay_thu.js --mo     # mở trang chạy thử (http://127.0.0.1:8765) để tự thao tác
```

Dữ liệu chạy thử gồm CSDL giả lập (khoảng 500 báo giá, 40 nhóm công việc, 12 dự án, năm 2020–2026) và BOQ nhà xưởng 36 dòng có định dạng như BOQ thật. Bộ chạy thử chạy 2 trường hợp: BOQ chưa có giá, và BOQ đã có một phần giá QS.

Chạy trên một file BOQ bất kỳ (BOQ thật):

```
node modules/de_xuat_gia/demo/chay_file.js --boq <file.xlsx> [--extra <đơn giá bổ sung.xlsx> ...] [--baseline <file.xlsx>] [--db <db.js>] [--pick p25|p10|med|latest] [--mode col|rate] [--out <thư mục>]
```

Thêm `--mode rate` để điền vào ô Đơn giá thay cho cột riêng.

Kết quả gồm file `<tên>_DaDienGia.xlsx` (BOQ có cột giá đề xuất) và báo cáo **riêng** `KET_QUA.xlsx` (sheet Tóm tắt, Đọc file, Chi tiết từng dòng: giá điền, P10–P90, lý do điền/không điền). Mặc định so với CSDL giả lập. Muốn có giá tham khảo thật thì truyền `--db` là CSDL thật dạng `window.DB = {...}`, hoặc dùng trang web với gói `.dgbw`.

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
node modules/de_xuat_gia/tests/test_pricing.js          # lõi: khớp, đơn vị, bộ lọc, nhận diện cột, baseline, từ đồng nghĩa, dữ liệu học
node modules/de_xuat_gia/tests/test_hoc.js <thư mục tạm> # làm sạch CSDL (dữ liệu bẩn giả lập) + train khớp (cặp Excel, phiên, mô hình cũ)
node modules/de_xuat_gia/tests/e2e.js <thư mục tạm>      # Chromium + LibreOffice: cột giá đề xuất riêng tô màu (cột Đơn giá không đổi,
                                                         # nạp lại file đã xuất), điền vào ô trống + Thành tiền/Tổng tính lại,
                                                         # giữ giá QS có sẵn, đơn giá bổ sung, phiên, dữ liệu học, gộp nguồn đối thủ
node modules/de_xuat_gia/tests/e2e_gate.js <thư mục tạm> # app đã dựng (docs/): mục Điền giá BOQ trong app, CSP + đăng nhập, admin / nhân viên,
                                                         # khối doithu (khóa admin) trong gói .dgbw được gộp vào nguồn giá
python modules/de_xuat_gia/tests/verify_fill.py <BOQ gốc> <file đã điền>  # chỉ các ô trống được điền, mọi thứ khác giữ nguyên
```

Mọi dữ liệu trong `tests/` là giả lập.

## Hướng phát triển

1. ~~Học từ lựa chọn của QS~~: đã có (dữ liệu học `.dxgl`, công cụ `hoc/`). Tiếp theo: lưu dữ liệu học dùng chung cho cả nhóm QS thay vì từng file.
2. **Khớp theo thuộc tính kỹ thuật**: tách mác, đường kính, chiều dày, cấu kiện; nhóm sai thông số chính thì loại hẳn thay vì chỉ trừ điểm.
3. **Chỉ số giá theo vùng và thời gian** (thép, xi măng, cát đá) thay cho một hệ số chung.
4. **Nạp giá chốt hoặc trúng thầu** về CSDL, rồi đo độ lệch giữa giá tham khảo và giá chốt để biết nhóm nào cần thêm dữ liệu.
5. **Mẫu báo cáo tư vấn** (PDF / Word) từ sheet đánh giá và ý kiến QS.
6. **Add-in Excel** (phương án B): xem giá tham khảo ngay trong Excel khi chọn một dòng.
