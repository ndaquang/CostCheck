# CSDL chiết tính giá (CTG)

Mục **"CTG"** trên app tra cứu, nằm cạnh "Dữ liệu nội bộ" và "Đối thủ". Mục này tra cứu đơn giá chiết tính (Vật tư + Nhân công = Tổng cộng) lấy từ `DATABASE_CTG.xlsx`.

- **Chỉ admin thấy.** Dữ liệu nằm trong khối `ctg` của **gói admin** `.dgbw` và được mã hóa bằng khóa admin. Gói nhân viên không chứa khối này. Tài khoản nhân viên không thấy mục CTG; nếu mở thẳng `index.html?ds=ctg` thì bị đưa về dữ liệu nội bộ.
- Mục CTG chỉ có tra cứu, giống mục Đối thủ: bộ lọc NRM2, năm, dự án, file nguồn; nhóm đại diện có P25–P75; xuất Excel.
- Mở một nhóm sẽ thấy thêm **trung vị Vật tư / Nhân công** và hai cột Vật tư, Nhân công của từng báo giá.

## Gom DATABASE_CTG.xlsx vào gói admin

Chạy lại mỗi khi có `DATABASE_CTG.xlsx` mới. Cũng chạy lại **sau mỗi lần dựng lại gói admin** bằng công cụ quản trị, vì gói dựng mới chưa có khối `ctg`.

```
node modules/ctg/dong_goi.js --xlsx DATABASE_CTG.xlsx --goi DonGiaBOQ_admin.dgbw --user <tên đăng nhập admin>
```

- Lệnh hỏi mật khẩu admin (không hiện ký tự), hoặc đọc biến môi trường `DGW_MAT_KHAU`. Mật khẩu dùng để mở khóa admin có sẵn trong gói. Sai mật khẩu, tài khoản nhân viên hoặc gói nhân viên thì lệnh dừng và không ghi gì.
- Khối `ctg` được thêm vào gói, hoặc thay khối cũ. Các khối và tài khoản khác giữ nguyên. Gói cũ được giữ ở `<gói>.truoc_ctg`. Dùng `--out <file>` để ghi ra file khác.
- Sau khi gói xong, lệnh giải mã lại khối để kiểm tra, rồi in thống kê: số dòng, nhóm, dự án, file, số dòng theo NRM2, dòng bị bỏ.
- Phát hành gói mới cho admin. Gói nhân viên không đổi.

Cần Node và Python + openpyxl, như các công cụ trong `modules/de_xuat_gia/hoc/`. Không cài thêm gì.

## Dữ liệu được xử lý thế nào

File cần có sheet **DATABASE** với các cột: Tên công việc, Đơn vị, Mã gốc, Mã công tác link, Nhân công, Vật tư, Tổng cộng, Tên dự án, Năm, File nguồn, Tên công việc gốc (trước khi dịch). Bốn cột bắt buộc là Tên công việc, Đơn vị, Tổng cộng, Tên dự án. Thứ tự cột không quan trọng.

| | |
|---|---|
| Dòng giữ lại | có Tên công việc và Tổng cộng > 0. Dòng khấu trừ (âm) bị bỏ và được liệt kê khi chạy |
| Đơn vị | gộp các cách ghi: nos / nr / ea / pcs → cái; set → bộ; lot / ls / item / trọn gói → gói; md → m; ton → tấn… |
| Nhóm đại diện | cùng tên công việc (đã chuẩn hóa dấu, khoảng trắng) + cùng đơn vị. Tên nhóm là cách ghi được nhiều dự án dùng nhất |
| Nhóm NRM2 | xếp theo từ khóa trong tên công việc (`QUY_TAC` trong `ctg.js`). Tên không khớp từ khóa nào thì xếp theo tiền tố "Mã công tác link" (MC.FW → 11, INF.MH → 34…). Còn lại là "00 · Chưa phân loại" (khoảng 3% với file hiện tại) |
| Cảnh báo giá | dòng lệch quá 3 lần trung vị nhóm, chỉ xét nhóm từ 4 báo giá |
| Năm | lấy từ cột Năm. **Giá giữ nguyên theo file CTG**, không quy đổi về mặt bằng 2026. App ghi rõ "chưa quy đổi theo năm" |

Dòng còn chi tiết: Mã gốc, Mã công tác link (hiện ở "Mã dòng"), File nguồn, dòng trong sheet DATABASE, tên tiếng Anh gốc nếu có.

## Mở trên web

Đăng nhập bằng gói admin, rồi bấm **CTG** trên thanh điều hướng. Giống mục Đối thủ, CTG mở thành trang riêng (`index.html?ds=ctg`), nên phải đăng nhập lại một lần. Nếu gói chưa có khối `ctg`, trang báo lệnh cần chạy.

Chạy thử không qua cổng đăng nhập:

```
node modules/ctg/dong_goi.js --xlsx DATABASE_CTG.xlsx --js WEB/data/ctg.js
```

Sau đó mở `WEB/index.html?ds=ctg`. **Không đưa file `ctg.js` lên GitHub.** `build.py` chặn file `ctg.js` và khối `window.CTG = {…}` trong bản dựng.

## Mã app và build.py

- Mục CTG nằm trong `docs/assets/app.js` và `docs/assets/app.css`. App đọc bộ dữ liệu theo `?ds=` qua bảng `DS_RIENG`.
- `docs/` được dựng lại từ `WEB/assets`. Trước lần chạy `python build.py` đầy đủ đầu tiên, phải **chép `docs/assets/app.js` và `docs/assets/app.css` sang `WEB/assets/`**. Nếu WEB chưa có CTG, `build.py` dừng lại để bản dựng mới không mất mục CTG.
- `build.py` tự thêm liên kết CTG trên thanh điều hướng nếu `WEB/index.html` chưa có.
- `shared/secure.js` báo riêng lỗi "gói không có khối …". App dùng lỗi này để hướng dẫn admin thêm khối `ctg`.

## Kiểm thử

```
node modules/ctg/tests/test_ctg.js [thư mục tạm]   # chuyển dữ liệu, NRM2, đơn vị, gói khối ctg (giải mã lại bằng WebCrypto), lệnh dong_goi.js
node modules/ctg/tests/e2e_ctg.js <thư mục tạm>    # Chromium trên docs/: admin / nhân viên, gói thiếu khối ctg, xuất Excel
```

Mọi dữ liệu trong `tests/` là giả lập.

```
modules/ctg/
  ctg.js        sheet DATABASE → window.DB (cột + từ điển), phân loại NRM2, gộp đơn vị, nhóm đại diện
  dong_goi.js   đọc Excel, gói khối "ctg" vào gói admin (AES-GCM, cùng định dạng shared/crypto-web.js)
  tests/        mau.js (dữ liệu + gói giả lập), test_ctg.js, e2e_ctg.js
```
