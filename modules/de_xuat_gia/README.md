# Module Tham khảo & đánh giá giá BOQ

Công cụ **tư vấn cho công tác giá**:

- **QS là người lập toàn bộ giá**, làm trong Excel theo cách quen thuộc.
- **CSDL đơn giá** (gói `.dgbw`, dùng chung với app Tra cứu) chỉ là **nguồn tham khảo**.
- Phần mềm tra giá tham khảo cho từng dòng BOQ, đánh giá giá QS đã lập so với giá thị trường và baseline, rồi để QS ghi ý kiến. Kết luận cuối cùng luôn là của QS.

## Nguyên tắc: không đổi format BOQ gốc

- Phần mềm **không ghi vào bất kỳ ô nào của các sheet BOQ gốc**. Định dạng, độ rộng cột, ô gộp, công thức, vùng in, định dạng có điều kiện đều giữ nguyên.
- Kết quả chỉ nằm ở các **sheet mới** `TK_*` thêm vào cuối file.
- Kiểm thử `tests/verify_format.py` so từng phần của file xuất với file gốc:
  - Toàn bộ sheet, chuỗi, theme… phải **giống hệt từng byte**.
  - Bốn phần mục lục của file (danh sách sheet, quan hệ, loại nội dung, bảng style) buộc phải sửa để thêm sheet, nhưng chỉ được **thêm vào cuối**. Phần tử cũ không đổi.
- Xuất lại nhiều lần thì các sheet `TK_*` được thay mới, không bị nhân đôi.

## Quy trình

1. **Lấy giá tham khảo** (trước khi lập giá)
   - Nạp BOQ chưa có giá, kiểm tra các cột (cột *Đơn giá QS* là nơi QS sẽ nhập giá), bấm **Tra giá tham khảo**.
   - Mỗi dòng có: nhóm công việc tương đương trong CSDL, độ phù hợp, phân bố giá P10 / P25 / **P50** / P75 / P90, số báo giá, số dự án, năm gần nhất, và các lưu ý dữ liệu (ít mẫu, đã nới bộ lọc, khác đơn vị, quy đổi đơn vị).
   - QS có thể chọn nhóm khác hoặc tự tìm nhóm trong CSDL, xem từng báo giá gốc, ghi ý kiến.
   - **Xuất Excel**: thêm sheet `TK_DanhGia`, `TK_TongHop` và `TK_NguonGia` (chỉ admin) vào file BOQ.
2. **QS lập giá trong Excel**
   - QS nhập đơn giá vào sheet BOQ như bình thường.
   - Sheet `TK_DanhGia` đọc giá QS bằng công thức trỏ về ô gốc, nên **cột Vị trí, Đánh giá và QS/Baseline tự cập nhật** khi QS sửa giá. Không cần quay lại phần mềm.
3. **Đánh giá và ý kiến**
   - Nạp lại file BOQ đã có giá. Các nhóm đã chọn, baseline nhập tay và ý kiến được giữ nguyên.
   - Nạp baseline (file riêng, cột trong BOQ, hoặc nhập tay) bất cứ lúc nào.
   - Xem tab **Tổng hợp**, ghi **Ý kiến QS / tư vấn** cho từng dòng, rồi xuất lại.
   - **Lưu phiên** (`.dgbq`) để làm tiếp lần sau.

### Thang đánh giá giá QS (so với phân bố giá CSDL của nhóm tham khảo)

| Đánh giá | Điều kiện |
|---|---|
| Hợp lý | giá QS trong P25–P75 |
| Cần xem | giá QS trong P10–P25 hoặc P75–P90 |
| Bất thường | giá QS dưới P10 hoặc trên P90 |
| Chưa có giá QS / Không có tham khảo | thiếu một trong hai |
| QS / Baseline | tô đỏ khi lệch vượt ngưỡng (mặc định 10%) |

Đánh giá chỉ để tham khảo. Giá lệch khỏi CSDL vẫn có thể đúng do điều kiện riêng của dự án; khi đó QS ghi lý do vào cột ý kiến.

### Sheet `TK_DanhGia`

Mỗi dòng BOQ một dòng, gồm:
- Sheet, Dòng (bấm để nhảy tới ô gốc), Hạng mục, Mã, Mô tả, ĐV.
- **KL**: công thức trỏ về ô gốc.
- Thông tin tham khảo: Nhóm CSDL, ĐV nhóm, Độ phù hợp, Số BG, Số DA, Năm gần nhất, P10–P90.
- **Giá QS**: công thức trỏ về cột đơn giá gốc. Nếu BOQ chỉ có thành tiền thì lấy thành tiền / KL.
- **Vị trí**, **Đánh giá**: công thức, có tô màu.
- Baseline, **QS / Baseline**, Thành tiền QS, Thành tiền theo P50.
- Lưu ý dữ liệu, Ý kiến QS / tư vấn.

Giá tham khảo là số liệu tĩnh tại lúc xuất. Phần đánh giá là công thức Excel.

## Cách khớp nhóm và tính giá tham khảo

- **Nhóm công việc**: dùng nhóm đại diện có sẵn trong CSDL. Dòng chưa có nhóm thì gộp theo tên chuẩn hóa + đơn vị.
- **Khớp mô tả**: tiếng Việt có dấu hay không dấu đều được. Chấm điểm từ theo IDF, cộng điểm cụm 2 từ, chấp nhận tiền tố và lỗi gõ 1 ký tự. Tiêu đề hạng mục cha được dùng làm ngữ cảnh.
- **Thông số**: khác số hiệu (M250/M300, D10/D16, dày 100/200) thì trừ điểm.
- **Đơn vị**: nhận nhiều cách viết, tự quy đổi kg↔tấn và đơn vị có hệ số (`100m2`).
- **Phân bố giá**: lấy giá đã quy về năm gốc của các báo giá trong nhóm, sau các bộ lọc: năm, loại hình, tỉnh/TP, bỏ REVIEW / ngoại lai / cảnh báo. Có thể nhân thêm hệ số điều chỉnh (%). Lọc xong không còn mẫu nào thì nới bộ lọc và ghi rõ trong lưu ý dữ liệu.

## Phân quyền

- **Mặc định chỉ admin** dùng module, đúng chính sách "nhân viên chỉ tra cứu". Tài khoản nhân viên mở trang sẽ bị chặn, và bản nhân viên không chứa module.
- Muốn mở cho nhân viên: đặt cờ cuối trong `MODULE_LIST` của `build.py` thành `True`. Khi đó nhân viên không thấy tên dự án, nguồn báo giá và sheet `TK_NguonGia`.

## Cấu trúc thư mục

```
modules/de_xuat_gia/
  index.html            giao diện (nguồn, chưa có cổng đăng nhập)
  assets/pricing.js     lõi: nhận diện BOQ, khớp nhóm, thống kê giá, baseline (chạy được trong Node)
  assets/xlsx-io.js     đọc .xlsx, thêm sheet mới mà không đụng sheet gốc (không cần thư viện ngoài)
  assets/dxg-app.js     giao diện, xuất Excel, lưu phiên
  assets/dxg.css
  tests/                dữ liệu giả lập + kiểm thử
```

Dựng: `python build.py` (app tra cứu + module) hoặc `python build.py --module` (chỉ module). Kết quả nằm ở `docs/de-xuat-gia/`.

## Kiểm thử

```
node modules/de_xuat_gia/tests/test_pricing.js          # lõi: khớp, đơn vị, bộ lọc, nhận diện cột, baseline
node modules/de_xuat_gia/tests/e2e.js <thư mục tạm>      # Chromium + LibreOffice: tham khảo → QS nhập giá → đánh giá,
                                                         # BOQ gốc giữ nguyên từng byte, công thức tự cập nhật, lưu/khôi phục phiên
node modules/de_xuat_gia/tests/e2e_gate.js <thư mục tạm> # bản đã dựng: CSP + cổng đăng nhập + phân quyền
python modules/de_xuat_gia/tests/verify_format.py <BOQ gốc> <file xuất>   # kiểm tra format BOQ gốc không đổi
```

Mọi dữ liệu trong `tests/` là giả lập.

## Hướng phát triển (theo vai trò tư vấn)

1. **Học từ lựa chọn của QS**: lưu cặp "mô tả BOQ → nhóm tham khảo QS chọn" để lần sau khớp đúng ngay.
2. **Khớp theo thuộc tính kỹ thuật**: tách mác, đường kính, chiều dày, cấu kiện; nhóm sai thông số chính thì loại hẳn thay vì chỉ trừ điểm.
3. **Chỉ số giá theo vùng và thời gian** (thép, xi măng, cát đá) thay cho một hệ số chung.
4. **Nạp giá chốt hoặc trúng thầu** về CSDL, rồi đo độ lệch giữa giá tham khảo và giá chốt để biết nhóm nào cần thêm dữ liệu.
5. **Mẫu báo cáo tư vấn** (PDF / Word) từ sheet đánh giá và ý kiến QS.
6. **Add-in Excel** (phương án B): xem giá tham khảo ngay trong Excel khi chọn một dòng.
