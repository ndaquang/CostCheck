# Đơn giá BOQ — Bản web

Hai bản chạy trên trình duyệt, dùng chung giao diện tra cứu của `../3_WEB_OFFLINE/`:

- **Bản admin** (`docs/`): đưa lên GitHub, bật GitHub Pages. Có thêm mục **Điền giá BOQ** (`modules/de_xuat_gia/`).
- **Bản nhân viên** (zip `dist/DonGiaBOQ_web_nhanvien.zip`): phát hành offline, không đưa lên GitHub.

Gói dữ liệu mã hóa (`.dgbw`) nằm riêng ở `../6_GOI_DU_LIEU_WEBAPP/`.

## 1. Nguyên tắc bảo mật

- **GitHub chỉ chứa mã.** Không có dữ liệu, không có khóa, không có mật khẩu.
- **Dữ liệu chỉ tồn tại dạng mã hóa**, trong gói `.dgbw` do admin tạo trên máy mình. Gói được chuyển cho nhân viên qua USB hoặc ổ nội bộ.
- **Khóa không nằm trong mã nguồn.** Khóa dữ liệu được bọc bằng mật khẩu của từng người: PBKDF2-SHA256 600.000 vòng, sau đó AES-256-GCM.
- **Tại sao không đặt khóa lên GitHub:** ai đọc được repo, hoặc mở được trang trên trình duyệt, đều lấy được khóa, nên dữ liệu coi như công khai. Git cũng giữ lịch sử vĩnh viễn, kể cả khi đã xóa.
- **Trang không gọi mạng được.** Có CSP `connect-src 'none'`, nên dữ liệu đã giải mã trong trang không gửi ra ngoài được ngay cả khi có mã độc chèn vào.
- **Nhân viên không nhận dữ liệu admin.** Gói nhân viên không chứa khối admin và không chứa khóa admin. Dòng CTG bị lọc bỏ; tên dự án, nhà thầu, file nguồn đã được ẩn trước khi mã hóa.
- **Gói admin gồm 3 khối, cùng khóa admin:** `db` (Nội bộ + CTG, cột *Nguồn dữ liệu*), `analysis`, `doithu` (đơn giá đối thủ). Gói nhân viên chỉ có `db` Nội bộ đã ẩn nguồn.

## 2. Ba nguồn dữ liệu: Nội bộ, CTG, Đối thủ

| Nguồn | Nằm ở đâu trong gói admin | Tạo bởi |
|---|---|---|
| Nội bộ | khối `db` | `2_XU_LY\CAP_NHAT_DU_LIEU.bat` (làm sạch, phân tích, dựng `3_WEB_OFFLINE/data/db.js`) |
| CTG (chiết tính giá) | khối `db`, cùng các dòng Nội bộ, phân biệt bằng cột **Nguồn dữ liệu** | như trên: CTG đi chung quy trình làm sạch với Nội bộ |
| Đối thủ | khối `doithu` | `build_data.py --nguon doithu` (`3_WEB_OFFLINE/data/doithu.js`) |

`tools/quan_tri_web.py phat-hanh` gói ba nguồn vào `DonGiaBOQ_admin.dgbw`. Không cần bước nào khác: **app tự gộp đối thủ vào dữ liệu nội bộ khi nạp** (chỉ tài khoản admin), dùng hàm `mergeDB` của `modules/de_xuat_gia/assets/pricing.js`:

- Nhóm đại diện của đối thủ **trùng tên + đơn vị** với nhóm nội bộ thì vào chung nhóm đó; nhóm chỉ đối thủ có thì thành nhóm mới.
- Giá chưa quy về năm gốc thì được quy đổi theo hệ số năm học từ chính dữ liệu nội bộ.
- Nguồn đã có trong khối `db` thì không gộp lần nữa. Ví dụ, gói cũ có khối `ctg` của `modules/ctg/dong_goi.js` mà khối `db` chưa có CTG: khối `ctg` được gộp như đối thủ.

Ba nguồn được dùng ở:

| Chức năng | Cách dùng ba nguồn |
|---|---|
| **Tra cứu** | Bộ lọc *Nguồn dữ liệu*. Mặc định chọn sẵn Nội bộ + CTG, như trước. Bỏ chip lọc là hiện cả đối thủ. Dòng CTG / đối thủ có nhãn nguồn. Mở nhóm thấy trung vị từng nguồn. Xuất Excel có cột *Nguồn dữ liệu*. |
| **Điểm rơi giá** | Một nhóm: hộp P10–P90 của từng nguồn, hệ số *CTG / Nội bộ* và *Đối thủ / Nội bộ* theo trung vị, biểu đồ thời gian tô màu theo nguồn, nút xem riêng từng nguồn. Danh sách nhóm ghi "có CTG, Đối thủ" / "chỉ Đối thủ". Có ô lọc *Chỉ nhóm có giá từ 2 nguồn trở lên*. |
| **Phân tích** | Thẻ **So sánh nguồn** tính ngay trên dữ liệu đang mở, không cần chạy lại `analysis.py`: hệ số từng nguồn so với Nội bộ theo nhóm, theo NRM2, phân bố hệ số, nhóm lệch nhiều nhất (bấm sang Điểm rơi giá). Các thẻ còn lại lấy từ khối `analysis` như cũ. |
| **Điền giá BOQ** | Giá đề xuất lấy từ cả ba nguồn. Tùy chọn *Nguồn giá* bỏ được từng nguồn. |
| **Làm sạch / Học / Chạy file** (`modules/de_xuat_gia/hoc/`, `demo/chay_file.js`) | Thêm `--du-lieu ../3_WEB_OFFLINE/data` (đọc `db.js` + `doithu.js`) hoặc `--goi <gói admin .dgbw> --user <admin>` (đọc thẳng gói, hỏi mật khẩu). Báo cáo làm sạch có cột *Nguồn* từng dòng lỗi, sheet Tóm tắt đếm theo nguồn. |

Ví dụ:

```bash
cd 5_WEBAPP
node modules/de_xuat_gia/hoc/lam_sach.js --du-lieu ../3_WEB_OFFLINE/data --out ket_qua_lam_sach
node modules/de_xuat_gia/hoc/hoc.js --goi ../6_GOI_DU_LIEU_WEBAPP/DonGiaBOQ_admin.dgbw --user ndaquang --cap CapKhop.xlsx --out ket_qua_hoc
node modules/de_xuat_gia/demo/chay_file.js --boq BOQ.xlsx --du-lieu ../3_WEB_OFFLINE/data
```

`lam_sach.js --sua` chỉ sửa khối `db` (Nội bộ + CTG), không trộn đối thủ vào bản sửa.

## 3. Cấu trúc thư mục

| Thư mục / tệp | Nội dung | Đưa lên GitHub? |
|---|---|---|
| `docs/` | Bản admin (sinh bởi `build.py`) | **Có** |
| `shared/` | Lớp mật mã, cổng đăng nhập, bảo vệ giao diện | **Có** |
| `modules/de_xuat_gia/` | Mục Điền giá BOQ, công cụ làm sạch / học / chạy file (Node) | **Có** |
| `modules/ctg/` | Đóng gói `DATABASE_CTG.xlsx` thành khối `ctg` (cách cũ, khi CTG chưa đi qua `2_XU_LY`) | **Có** |
| `build.py`, `README.md`, `.gitignore` | Dựng bản, hướng dẫn, quy tắc loại trừ | **Có** |
| `tools/` | Công cụ quản trị và kiểm tra an toàn | Không (đã loại trong `.gitignore`) |
| `../6_GOI_DU_LIEU_WEBAPP/` | Gói `.dgbw` đã mã hóa (thư mục riêng, ngoài `5_WEBAPP`) | **Không bao giờ** |
| `dist/` | Zip bản nhân viên | Không |

`build.py` lấy giao diện từ `../3_WEB_OFFLINE/`; `tools/quan_tri_web.py` đọc dữ liệu ở `../3_WEB_OFFLINE/data/` và ghi gói vào `../6_GOI_DU_LIEU_WEBAPP/`.

## 4. Quy trình

### Lần đầu (máy admin)

```bash
cd 5_WEBAPP
python tools/quan_tri_web.py khoi-tao --ten admin --ho-ten "Tên admin"
python tools/quan_tri_web.py them --ten nv01 --ho-ten "Nguyễn Văn A"
python build.py
```

Mật khẩu tối thiểu 12 ký tự. Gói nhân viên bị thử mật khẩu ngoại tuyến được, nên mật khẩu càng dài và ngẫu nhiên càng tốt.

Gửi cho nhân viên: `6_GOI_DU_LIEU_WEBAPP/DonGiaBOQ_nhanvien.dgbw` và `dist/DonGiaBOQ_web_nhanvien.zip`. Mật khẩu gửi riêng.

### Sau khi kéo bản mới từ GitHub

`build.py` dựng `docs/` từ `../3_WEB_OFFLINE/assets`. Mã giao diện mới nhất nằm ở `docs/assets/`. Vì vậy, trước lần `python build.py` đầu tiên, **chép `docs/assets/app.js`, `app.css`, `dash.js` sang `3_WEB_OFFLINE/assets/`**. Nếu chưa chép, `build.py` dừng lại để bản dựng mới không mất phần ba nguồn.

Không cần sửa `3_WEB_OFFLINE/index.html`. App tự đổi chữ và tự thêm thẻ So sánh nguồn.

Bản offline `3_WEB_OFFLINE` (mở trực tiếp, không qua `build.py`) chỉ gộp đối thủ khi trang nạp `pricing.js` trước `app.js`:

1. Chép `modules/de_xuat_gia/assets/pricing.js` thành `3_WEB_OFFLINE/assets/dxg/pricing.js`.
2. Thêm `<script src="assets/dxg/pricing.js"></script>` ngay trước dòng nạp `assets/app.js`.

Không làm hai bước này thì bản offline vẫn chạy với Nội bộ + CTG như cũ.

### Đưa bản admin lên GitHub

```bash
cd 5_WEBAPP
python tools/kiem_tra_truoc_khi_day.py
```

Nếu kiểm tra báo "An toàn" thì mới đưa lên. Repo lấy `5_WEBAPP/` làm gốc, rồi bật **Settings → Pages → Deploy from a branch → `/docs`**.

### Cập nhật dữ liệu hằng ngày

1. Chạy `2_XU_LY\CAP_NHAT_DU_LIEU.bat` (làm sạch Nội bộ + CTG, phân tích, dựng `3_WEB_OFFLINE/data/*.js`).
2. Bấm đúp `PHAT_HANH_GOI_DU_LIEU.bat` (hoặc `python tools/quan_tri_web.py phat-hanh`), nhập tài khoản ADMIN.

Sau đó gửi lại gói `DonGiaBOQ_nhanvien.dgbw` cho nhân viên. Mã giao diện không đổi thì không cần gửi lại zip. Sửa giao diện (`3_WEB_OFFLINE/assets`) thì chạy lại `python build.py`. Sửa module Điền giá BOQ thì chạy `python build.py --module`.

### Vận hành tài khoản

| Việc | Lệnh |
|---|---|
| Xem danh sách | `python tools/quan_tri_web.py danh-sach` |
| Thêm người | `python tools/quan_tri_web.py them --ten ... --ho-ten "..."` |
| Đặt lại mật khẩu | `python tools/quan_tri_web.py doi-mat-khau --ten ...` (gửi lại gói cho người đó) |
| Khóa / mở khóa | `python tools/quan_tri_web.py khoa --ten ...` hoặc `mo-khoa` |
| Nhân viên nghỉ việc | `xoa --ten ...`, sau đó `doi-khoa` |
| Đổi khóa dữ liệu | `python tools/quan_tri_web.py doi-khoa` (nhập mật khẩu mới cho mọi người) |

Tham số `--thu-muc` và `--nguon` có giá trị mặc định, thường không cần truyền.

## 5. Giới hạn cần biết

- **Bản web không chặn được công cụ nhà phát triển (F12) và không chặn chụp màn hình.** Người có mật khẩu hợp lệ đọc được dữ liệu trong quyền của họ. Nếu cần chống trích xuất mạnh hơn, dùng **bản Windows** (`../4_PHAN_MEM_WINDOWS/`, Electron): bản đó khóa DevTools và chặn chụp màn hình với nhân viên.
- **Gói dữ liệu nằm trên máy nhân viên**, nên ai có gói có thể thử mật khẩu ngoại tuyến. Biện pháp: mật khẩu ≥ 12 ký tự và PBKDF2 600.000 vòng.
- **Chặn đăng nhập sai chỉ là rào cản phía trình duyệt**, có thể vượt qua. Độ an toàn thật nằm ở độ mạnh của mật khẩu.
- **Thu hồi không hoàn toàn.** Khóa hoặc xóa chỉ chặn các gói phát hành sau. Bản đã phát ra không thu hồi được. `doi-khoa` buộc mọi người nhận gói mới và mật khẩu mới.
- **Chuyển giữa Dữ liệu nội bộ và Đối thủ diễn ra ngay trong trang**, không phải đăng nhập lại. Tải lại trang (F5) vẫn là đăng xuất: tải lại là xóa sạch dữ liệu khỏi bộ nhớ.
- **So sánh nguồn chỉ so trong cùng nhóm đại diện.** Đối thủ ghi tên nhóm khác Nội bộ thì không ghép được nhóm và không vào hệ số. Mỗi bên cần ít nhất 3 báo giá trong nhóm.
- **Repo public:** mã nguồn công khai, không có bí mật nên không sao. **Repo private:** GitHub Pages cần gói trả phí.
- **Chưa kiểm thử** việc mở `index.html` trực tiếp từ đĩa (`file://`) trên máy nhân viên. Đã kiểm thử đầy đủ qua `http://localhost` với CSP nghiêm ngặt. Cần thử trên máy nhân viên trước khi triển khai.

## 6. Kiểm tra nhanh

- `python -m py_compile tools/quan_tri_web.py build.py`
- `python tools/kiem_tra_truoc_khi_day.py`: quét đúng những tệp sẽ lên GitHub.
- `build.py` tự chạy kiểm tra đầu ra. Nếu bản dựng chứa khối dữ liệu hoặc tệp `.dgbw`, quá trình dừng lại.
- Kiểm thử bằng dữ liệu giả lập (cần Node, Python + openpyxl, Chromium của Playwright):
  - `node modules/de_xuat_gia/tests/test_pricing.js`
  - `node modules/de_xuat_gia/tests/test_hoc.js <thư mục tạm>`
  - `node modules/ctg/tests/test_ctg.js <thư mục tạm>`
  - `node modules/ctg/tests/e2e_ctg.js <thư mục tạm>`: ba nguồn trên bản `docs/`.
  - `node modules/de_xuat_gia/tests/e2e_gate.js <thư mục tạm>`
  - `node modules/de_xuat_gia/tests/e2e.js <thư mục tạm>`
