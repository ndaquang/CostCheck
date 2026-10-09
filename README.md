# Đơn giá BOQ — Bản web

Hai bản chạy trên trình duyệt, dùng chung giao diện tra cứu của `WEB/`:

- **Bản admin** (`docs/`): đưa lên GitHub, bật GitHub Pages.
- **Bản nhân viên** (`dist/nhan_vien/`, zip `dist/DonGiaBOQ_web_nhanvien.zip`): phát hành offline, không đưa lên GitHub.

## 1. Nguyên tắc bảo mật

- **GitHub chỉ chứa mã.** Không có dữ liệu, không có khóa, không có mật khẩu.
- **Dữ liệu chỉ tồn tại dạng mã hóa**, trong gói `.dgbw` do admin tạo trên máy mình. Gói được chuyển cho nhân viên qua USB hoặc ổ nội bộ.
- **Khóa không nằm trong mã nguồn.** Khóa dữ liệu được bọc bằng mật khẩu của từng người: PBKDF2-SHA256 600.000 vòng, sau đó AES-256-GCM.
- **Tại sao không đặt khóa lên GitHub:** ai đọc được repo, hoặc mở được trang trên trình duyệt, đều lấy được khóa, nên dữ liệu coi như công khai. Git cũng giữ lịch sử vĩnh viễn, kể cả khi đã xóa.
- **Trang không gọi mạng được.** Có CSP `connect-src 'none'`, nên dữ liệu đã giải mã trong trang không gửi ra ngoài được ngay cả khi có mã độc chèn vào.
- **Nhân viên không nhận dữ liệu admin.** Gói nhân viên không chứa khối admin và không chứa khóa admin. Tên dự án, nhà thầu, file nguồn đã được ẩn trước khi mã hóa.

## 2. Cấu trúc thư mục

| Thư mục / tệp | Nội dung | Đưa lên GitHub? |
|---|---|---|
| `docs/` | Bản admin (sinh bởi `build.py`) | **Có** |
| `shared/` | Lớp mật mã, cổng đăng nhập, bảo vệ giao diện | **Có** |
| `build.py`, `README.md`, `.gitignore` | Dựng bản, hướng dẫn, quy tắc loại trừ | **Có** |
| `tools/` | Công cụ quản trị và kiểm tra an toàn | Không (đã loại trong `.gitignore`) |
| `goi_du_lieu/` | Gói `.dgbw` đã mã hóa | **Không bao giờ** |
| `dist/` | Bản nhân viên + zip | Không |

`build.py` lấy giao diện từ `../../WEB/` và cần đặt `webapp/` đúng vị trí trong dự án (`PHAN_MEM/webapp`).

## 3. Quy trình

### Lần đầu (máy admin)

```bash
cd PHAN_MEM/webapp
python tools/quan_tri_web.py khoi-tao --ten admin --ho-ten "Tên admin"
python tools/quan_tri_web.py them --ten nv01 --ho-ten "Nguyễn Văn A"
python build.py
```

Mật khẩu tối thiểu 12 ký tự. Gói nhân viên bị thử mật khẩu ngoại tuyến được, nên mật khẩu càng dài và ngẫu nhiên càng tốt.

Gửi cho nhân viên: `goi_du_lieu/DonGiaBOQ_nhanvien.dgbw` và `dist/DonGiaBOQ_web_nhanvien.zip`. Mật khẩu gửi riêng.

### Đưa bản admin lên GitHub

```bash
cd PHAN_MEM/webapp
python tools/kiem_tra_truoc_khi_day.py
```

Nếu kiểm tra báo "An toàn" thì mới đưa lên. Repo lấy `webapp/` làm gốc, rồi bật **Settings → Pages → Deploy from a branch → `/docs`**.

### Cập nhật dữ liệu hằng ngày

1. Chạy `WEB\CAP_NHAT_DU_LIEU.bat` trong thư mục `_CSDL_DON_GIA_BOQ` (dựng `WEB/data/db.js`).
2. Chạy:

```bash
cd PHAN_MEM/webapp
python tools/quan_tri_web.py phat-hanh
```

Sau đó gửi lại gói `DonGiaBOQ_nhanvien.dgbw` cho nhân viên. Mã giao diện không đổi thì không cần gửi lại zip.

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

## 4. Giới hạn cần biết

- **Bản web không chặn được công cụ nhà phát triển (F12) và không chặn chụp màn hình.** Người có mật khẩu hợp lệ đọc được dữ liệu trong quyền của họ. Nếu cần chống trích xuất mạnh hơn, dùng **bản Windows** (`PHAN_MEM/`, Electron): bản đó khóa DevTools và chặn chụp màn hình với nhân viên.
- **Gói dữ liệu nằm trên máy nhân viên**, nên ai có gói có thể thử mật khẩu ngoại tuyến. Biện pháp: mật khẩu ≥ 12 ký tự và PBKDF2 600.000 vòng.
- **Chặn đăng nhập sai chỉ là rào cản phía trình duyệt**, có thể vượt qua. Độ an toàn thật nằm ở độ mạnh của mật khẩu.
- **Thu hồi không hoàn toàn.** Khóa hoặc xóa chỉ chặn các gói phát hành sau. Bản đã phát ra không thu hồi được. `doi-khoa` buộc mọi người nhận gói mới và mật khẩu mới.
- **Chuyển sang "Đối thủ" hoặc "Phân tích" bằng liên kết sẽ tải lại trang**, nên phải nạp gói và nhập mật khẩu lại. Đây là chủ ý: tải lại là xóa sạch dữ liệu khỏi bộ nhớ.
- **Repo public:** mã nguồn công khai, không có bí mật nên không sao. **Repo private:** GitHub Pages cần gói trả phí.
- **Chưa kiểm thử** việc mở `index.html` trực tiếp từ đĩa (`file://`) trên máy nhân viên. Đã kiểm thử đầy đủ qua `http://localhost` với CSP nghiêm ngặt. Cần thử trên máy nhân viên trước khi triển khai.

## 5. Kiểm tra nhanh

- `python -m py_compile tools/quan_tri_web.py build.py`
- `python tools/kiem_tra_truoc_khi_day.py`: quét đúng những tệp sẽ lên GitHub.
- `build.py` tự chạy kiểm tra đầu ra. Nếu bản dựng chứa khối dữ liệu hoặc tệp `.dgbw`, quá trình dừng lại.
