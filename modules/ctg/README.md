# CSDL chiết tính giá (CTG)

CTG là **một nguồn của dữ liệu nội bộ**, bên cạnh Nội bộ và Đối thủ. Không có mục CTG riêng trên thanh điều hướng. Trong app, CTG xuất hiện ở các chỗ sau:

- **Tra cứu:** bộ lọc *Nguồn dữ liệu*, nhãn "CTG" trên từng dòng. Nhóm có tách vật tư / nhân công thì hiện thêm trung vị Vật tư / Nhân công và hai cột tương ứng.
- **Điểm rơi giá:** so điểm rơi và hệ số CTG / Nội bộ của cùng nhóm.
- **Phân tích → So sánh nguồn:** hệ số CTG / Nội bộ theo nhóm và theo NRM2.
- **Điền giá BOQ:** CTG là một nguồn giá.

Có hai cách đưa CTG vào gói admin:

1. **Cách chính:** `2_XU_LY\CAP_NHAT_DU_LIEU.bat` làm sạch CTG chung quy trình với Nội bộ. Dòng CTG nằm trong khối `db`, cột "Nguồn dữ liệu" = CTG. Giá CTG được quy về năm gốc như Nội bộ, nhóm đại diện dùng chung. Gói nhân viên đã lọc bỏ dòng CTG.
2. **Cách cũ, khi CTG chưa đi qua `2_XU_LY`:** lệnh `dong_goi.js` dưới đây thêm khối `ctg` vào gói admin. App chỉ gộp khối này khi khối `db` chưa có dòng CTG: ghép nhóm theo tên + đơn vị, giá quy về năm gốc theo hệ số năm của dữ liệu nội bộ.

Địa chỉ cũ `index.html?ds=ctg` mở dữ liệu nội bộ, lọc sẵn nguồn CTG.

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
| Năm | lấy từ cột Năm. Khối `ctg` **giữ giá gốc theo file CTG**. Khi gộp vào dữ liệu nội bộ, app quy giá về năm gốc theo hệ số năm của dữ liệu nội bộ; dòng không rõ năm giữ giá gốc |

Dòng còn chi tiết: Mã gốc, Mã công tác link (hiện ở "Mã dòng"), File nguồn, dòng trong sheet DATABASE, tên tiếng Anh gốc nếu có.

## Chạy thử không qua cổng đăng nhập

```
node modules/ctg/dong_goi.js --xlsx DATABASE_CTG.xlsx --js ../3_WEB_OFFLINE/data/ctg.js
```

Lệnh trên ghi file `ctg.js` cho bản offline. Bản offline cần nạp `pricing.js` trước `app.js` để gộp nguồn (xem README gốc). **Không đưa file `ctg.js` lên GitHub.** `build.py` chặn file `ctg.js` và khối `window.CTG = {…}` trong bản dựng.

## Mã app

- Gộp nguồn: `NGUON_PHU` và `gopNguonPhu` trong `docs/assets/app.js`, dùng `mergeDB` của `modules/de_xuat_gia/assets/pricing.js`. `build.py` nạp `pricing.js` trước `app.js`.
- `shared/secure.js` báo riêng lỗi "gói không có khối …". App bỏ qua khối không có, không báo lỗi.

## Kiểm thử

```
node modules/ctg/tests/test_ctg.js [thư mục tạm]   # chuyển dữ liệu, NRM2, đơn vị, gói khối ctg (giải mã lại bằng WebCrypto), lệnh dong_goi.js
node modules/ctg/tests/e2e_ctg.js <thư mục tạm>    # Chromium trên docs/: ba nguồn Nội bộ / CTG / Đối thủ (Tra cứu, Điểm rơi giá, So sánh nguồn,
                                                   # Điền giá BOQ), gói cũ có khối ctg, ?ds=ctg, mục Đối thủ không đăng nhập lại, nhân viên
```

Mọi dữ liệu trong `tests/` là giả lập.

```
modules/ctg/
  ctg.js        sheet DATABASE → window.DB (cột + từ điển), phân loại NRM2, gộp đơn vị, nhóm đại diện
  dong_goi.js   đọc Excel, gói khối "ctg" vào gói admin (AES-GCM, cùng định dạng shared/crypto-web.js)
  tests/        mau.js (dữ liệu + gói giả lập), test_ctg.js, e2e_ctg.js
```
