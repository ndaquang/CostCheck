# -*- coding: utf-8 -*-
"""Dựng bản web từ giao diện WEB/ và lớp bảo vệ shared/ (chạy trên máy admin).

    docs/            BẢN ADMIN. Đưa lên GitHub. Bật GitHub Pages: Settings → Pages → Deploy from a branch → /docs.
    dist/nhan_vien/  BẢN NHÂN VIÊN. Phát hành offline cùng gói DonGiaBOQ_nhanvien.dgbw. Không đưa lên GitHub.

Hai bản chỉ chứa MÃ. Không sao chép WEB/data và không sao chép gói dữ liệu.
Dùng: python build.py
"""
import os
import re
import shutil
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.normpath(os.path.join(HERE, "..", "..", "WEB"))
SHARED = os.path.join(HERE, "shared")
DOCS = os.path.join(HERE, "docs")
NHAN_VIEN = os.path.join(HERE, "dist", "nhan_vien")
SHARED_FILES = ["crypto-web.js", "secure.js", "secure-ui.js", "secure-ui.css", "gate.css"]

# Chính sách nội dung: trang chỉ được tải mã từ chính site; không gọi mạng được (connect-src 'none'),
# nên dữ liệu đã giải mã trong trang không gửi đi đâu được ngay cả khi có mã độc chèn vào.
CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
       "connect-src 'none'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'")

CAM_TEN = re.compile(r"(^db\.js$|^doithu\.js$|^analysis\.js$|\.dgbw$|\.enc$|\.xlsx$|^tai_khoan\.json$|^thong_tin\.json$)", re.I)
CAM_NOI_DUNG = re.compile(r"window\.(DB|AN|DT)\s*=\s*\{")


def dung_ban(thu_muc, vai_tro):
    if os.path.exists(thu_muc):
        shutil.rmtree(thu_muc)
    os.makedirs(os.path.join(thu_muc, "shared"))
    for f in SHARED_FILES:
        shutil.copy2(os.path.join(SHARED, f), os.path.join(thu_muc, "shared", f))
    shutil.copytree(os.path.join(WEB, "assets"), os.path.join(thu_muc, "assets"))

    src = open(os.path.join(WEB, "index.html"), encoding="utf-8").read()
    dung_scripts = re.findall(r'<script src="(assets/[^"]+)"></script>\n?', src)
    assert len(dung_scripts) >= 4, "index.html thiếu script ứng dụng (kiểm tra WEB/index.html)"
    assert "<script>" not in src, "index.html có script nội tuyến — không tương thích CSP"
    out = re.sub(r'<script src="assets/[^"]+"></script>\n?', "", src)

    head = ('<meta name="robots" content="noindex,nofollow">\n'
            '<meta name="referrer" content="no-referrer">\n'
            f'<meta http-equiv="Content-Security-Policy" content="{CSP}">\n'
            '<link rel="stylesheet" href="shared/gate.css">\n'
            '<link rel="stylesheet" href="shared/secure-ui.css">\n')
    out = out.replace("</head>", head + "</head>", 1)

    danh_sach = ",".join(["shared/secure-ui.js"] + dung_scripts)
    body = ('<script src="shared/crypto-web.js"></script>\n'
            f'<script src="shared/secure.js" data-build="{vai_tro}" data-scripts="{danh_sach}"></script>\n')
    out = out.replace("</body>", body + "</body>", 1)

    with open(os.path.join(thu_muc, "index.html"), "w", encoding="utf-8") as fh:
        fh.write(out)


def kiem_tra_dau_ra(thu_muc):
    """Chốt an toàn cuối cùng: bản dựng không được chứa dữ liệu hay khóa."""
    for root, dirs, files in os.walk(thu_muc):
        for name in files:
            p = os.path.join(root, name)
            if CAM_TEN.search(name):
                sys.exit(f"DỪNG: bản dựng chứa tệp dữ liệu {p}")
            if name.lower().endswith((".js", ".html", ".css", ".json")):
                if CAM_NOI_DUNG.search(open(p, encoding="utf-8", errors="ignore").read()):
                    sys.exit(f"DỪNG: {p} chứa khối dữ liệu nhúng trong mã")
    if os.path.exists(os.path.join(thu_muc, "data")):
        sys.exit("DỪNG: bản dựng có thư mục data/")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    if not os.path.isdir(WEB):
        sys.exit(f"Không thấy {WEB}. Cần thư mục WEB của dự án để lấy giao diện.")
    dung_ban(DOCS, "admin")
    kiem_tra_dau_ra(DOCS)
    dung_ban(NHAN_VIEN, "nhan_vien")
    kiem_tra_dau_ra(NHAN_VIEN)

    zip_path = os.path.join(HERE, "dist", "DonGiaBOQ_web_nhanvien.zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for root, _, files in os.walk(NHAN_VIEN):
            for name in files:
                full = os.path.join(root, name)
                z.write(full, os.path.join("DonGiaBOQ_web", os.path.relpath(full, NHAN_VIEN)))
    print(f"✓ Bản admin:    {DOCS}  (đưa lên GitHub)")
    print(f"✓ Bản nhân viên: {NHAN_VIEN}")
    print(f"✓ Gói zip nhân viên: {zip_path}")


if __name__ == "__main__":
    main()
