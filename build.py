# -*- coding: utf-8 -*-
"""Dựng bản web từ giao diện 3_WEB_OFFLINE/ và lớp bảo vệ shared/ (chạy trên máy admin).

    docs/            BẢN ADMIN. Đưa lên GitHub. Bật GitHub Pages: Settings → Pages → Deploy from a branch → /docs.
    dist/            DonGiaBOQ_web_nhanvien.zip — BẢN NHÂN VIÊN, phát hành offline cùng gói DonGiaBOQ_nhanvien.dgbw
                     (thư mục 6_GOI_DU_LIEU_WEBAPP). Không đưa lên GitHub.

Module "Điền giá BOQ" (mã nguồn riêng trong modules/de_xuat_gia/) được GHÉP vào app tra cứu: thêm mục
"Điền giá BOQ" trên thanh điều hướng, chỉ tài khoản admin thấy; dùng chung lần đăng nhập và CSDL đã nạp.
Mã module chép vào <bản>/assets/dxg/, CSS được giới hạn trong #sec-dxg để không ảnh hưởng giao diện app.

Dữ liệu nội bộ của bản admin gồm ba nguồn: Nội bộ + CTG (khối db, 2_XU_LY làm sạch chung) và đối thủ (khối doithu).
App tra cứu gộp đối thủ vào khi nạp bằng mergeDB của modules/de_xuat_gia/assets/pricing.js, để Điểm rơi giá, Phân tích
(So sánh nguồn) và Điền giá BOQ dùng chung cả ba nguồn. Vì vậy pricing.js được nạp TRƯỚC app.js. CTG đóng gói riêng
(khối ctg của modules/ctg/dong_goi.js) chỉ được gộp khi khối db chưa có CTG. Bản nhân viên không có module, không gộp.

Hai bản chỉ chứa MÃ. Không sao chép 3_WEB_OFFLINE/data và không sao chép gói dữ liệu.
Dùng: python build.py              dựng app tra cứu + ghép module
      python build.py --module     chỉ ghép lại module vào bản đã dựng (không cần thư mục 3_WEB_OFFLINE)
"""
import hashlib
import os
import re
import shutil
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.normpath(os.path.join(HERE, "..", "3_WEB_OFFLINE"))
SHARED = os.path.join(HERE, "shared")
DOCS = os.path.join(HERE, "docs")
NHAN_VIEN = os.path.join(HERE, "dist", "nhan_vien")
SHARED_FILES = ["crypto-web.js", "secure.js", "secure-ui.js", "secure-ui.css", "gate.css"]
DXG = os.path.join(HERE, "modules", "de_xuat_gia")
DXG_JS = ["pricing.js", "xlsx-io.js", "dxg-app.js"]
# Mặc định chỉ admin — đúng chính sách "nhân viên chỉ tra cứu, không xuất". Bản nhân viên không chứa module.
DXG_CHO_NHAN_VIEN = False

# Chính sách nội dung: trang chỉ được tải mã từ chính site; không gọi mạng được (connect-src 'none'),
# nên dữ liệu đã giải mã trong trang không gửi đi đâu được ngay cả khi có mã độc chèn vào.
CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
       "connect-src 'none'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'")

CAM_TEN = re.compile(r"(^db\.js$|^doithu\.js$|^analysis\.js$|^ctg\.js$|\.dgbw$|\.enc$|\.xlsx$|^tai_khoan\.json$|^thong_tin\.json$)", re.I)
CAM_NOI_DUNG = re.compile(r"window\.(DB|AN|DT|CTG)\s*=\s*\{")


def don_sach(thu_muc):
    """Xóa nội dung cũ. Thư mục đang bị Explorer/trình theo dõi file giữ thì để lại vỏ rỗng và ghi đè vào."""
    for root, dirs, files in os.walk(thu_muc, topdown=False):
        for f in files:
            os.remove(os.path.join(root, f))
        for d in dirs:
            try:
                os.rmdir(os.path.join(root, d))
            except OSError:
                pass


def dung_ban(thu_muc, vai_tro):
    don_sach(thu_muc)
    os.makedirs(os.path.join(thu_muc, "shared"), exist_ok=True)
    for f in SHARED_FILES:
        shutil.copy2(os.path.join(SHARED, f), os.path.join(thu_muc, "shared", f))
    shutil.copytree(os.path.join(WEB, "assets"), os.path.join(thu_muc, "assets"), dirs_exist_ok=True)

    src = open(os.path.join(WEB, "index.html"), encoding="utf-8").read()
    assert len(re.findall(r'<script src="assets/[^"]+"></script>', src)) >= 4, "index.html thiếu script ứng dụng (kiểm tra 3_WEB_OFFLINE/index.html)"
    out = gan_cong_bao_ve(src, vai_tro, "shared")

    out = gan_dien_gia(out, thu_muc, vai_tro)

    with open(os.path.join(thu_muc, "index.html"), "w", encoding="utf-8") as fh:
        fh.write(out)


def gan_cong_bao_ve(src, vai_tro, goc_shared):
    """Chèn CSP + cổng đăng nhập vào index.html nguồn; script ứng dụng chỉ được nạp sau khi đăng nhập."""
    dung_scripts = re.findall(r'<script src="(assets/[^"]+)"></script>\n?', src)
    assert len(dung_scripts) >= 4, "index.html thiếu script ứng dụng (kiểm tra 3_WEB_OFFLINE/index.html)"
    assert "<script>" not in src, "index.html có script nội tuyến — không tương thích CSP"
    out = re.sub(r'<script src="assets/[^"]+"></script>\n?', "", src)
    head = ('<meta name="robots" content="noindex,nofollow">\n'
            '<meta name="referrer" content="no-referrer">\n'
            f'<meta http-equiv="Content-Security-Policy" content="{CSP}">\n'
            f'<link rel="stylesheet" href="{goc_shared}/gate.css">\n'
            f'<link rel="stylesheet" href="{goc_shared}/secure-ui.css">\n')
    out = out.replace("</head>", head + "</head>", 1)
    danh_sach = ",".join([f"{goc_shared}/secure-ui.js"] + dung_scripts)
    body = (f'<script src="{goc_shared}/crypto-web.js"></script>\n'
            f'<script src="{goc_shared}/secure.js" data-build="{vai_tro}" data-scripts="{danh_sach}"></script>\n')
    return out.replace("</body>", body + "</body>", 1)


def kiem_tra_web():
    """docs/ được dựng lại từ 3_WEB_OFFLINE/assets: bản ở đó chưa gộp nguồn (đối thủ, CTG cho Điểm rơi giá và Phân tích)
    thì bản dựng mới sẽ mất các chức năng này."""
    doc = lambda f: open(os.path.join(WEB, "assets", f), encoding="utf-8", errors="ignore").read() if os.path.isfile(os.path.join(WEB, "assets", f)) else ""
    if "NGUON_PHU" not in doc("app.js") or "TABS.nguon" not in doc("dash.js"):
        sys.exit("DỪNG: 3_WEB_OFFLINE/assets chưa có bản app gộp nguồn (Nội bộ / CTG / Đối thủ cho Điểm rơi giá và Phân tích). "
                 "Chép docs/assets/app.js, app.css, dash.js sang 3_WEB_OFFLINE/assets/ rồi chạy lại, "
                 "nếu không bản dựng mới sẽ mất các chức năng này.")


def css_trong_muc(css, goc="#sec-dxg"):
    """Giới hạn CSS của module trong phần tử goc, để không đè lên giao diện app tra cứu."""
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)

    def tach(sel):   # tách danh sách selector theo dấu phẩy ngoài ngoặc
        out, d, cur = [], 0, ""
        for ch in sel:
            d += ch in "([" ; d -= ch in ")]"
            if ch == "," and d == 0: out.append(cur); cur = ""
            else: cur += ch
        return out + [cur]

    def doi(sel):
        s = sel.strip()
        if s in ("html", "body", "html, body"): return goc
        if s == "*": return f"{goc}, {goc} *"
        if s.startswith(":root"): return f":root{s[5:]} {goc}" if s[5:] else goc
        if s.startswith("html."):
            a, _, b = s.partition(" ")
            return f"{a} {goc} {b}".strip()
        return f"{goc} {s}"

    def khoi(t):
        out, i = [], 0
        while True:
            j = t.find("{", i)
            if j < 0: return "".join(out) + t[i:]
            sel = t[i:j].strip()
            d, k = 1, j + 1
            while d: d += (t[k] == "{") - (t[k] == "}"); k += 1
            body = t[j + 1:k - 1]
            if sel.startswith("@media") or sel.startswith("@supports"):
                out.append(f"{sel} {{{khoi(body)}}}\n")
            elif sel.startswith("@"):
                out.append(f"{sel} {{{body}}}\n")
            else:
                out.append(", ".join(doi(x) for x in tach(sel) if x.strip()) + f" {{{body}}}\n")
            i = k
    return khoi(css)


def gan_dien_gia(html, thu_muc, vai_tro, cho_nhan_vien=None):
    """Ghép module Điền giá BOQ vào index.html của app tra cứu (gỡ phần ghép cũ trước, nên chạy lại nhiều lần được)."""
    nv = DXG_CHO_NHAN_VIEN if cho_nhan_vien is None else cho_nhan_vien
    html = re.sub(r"<!--DXG-->.*?<!--/DXG-->\r?\n?", "", html, flags=re.S)
    html = re.sub(r'<a href="de-xuat-gia/index.html"[^>]*>[^<]*</a>', "", html)   # liên kết trang riêng cũ
    html = re.sub(r'data-scripts="[^"]*"', lambda m: re.sub(r',assets/dxg/[^,"]+', "", m.group(0)), html)
    dich = os.path.join(thu_muc, "assets", "dxg")
    if os.path.exists(dich):
        shutil.rmtree(dich)
    for cu in [os.path.join(thu_muc, "de-xuat-gia")]:   # trang riêng của phiên bản trước
        if os.path.exists(cu):
            shutil.rmtree(cu)
    if vai_tro != "admin" and not nv:
        return html
    os.makedirs(dich)
    h = hashlib.sha1()
    for f in DXG_JS:
        shutil.copy2(os.path.join(DXG, "assets", f), os.path.join(dich, f))
        h.update(open(os.path.join(DXG, "assets", f), "rb").read())
    css = css_trong_muc(open(os.path.join(DXG, "assets", "dxg.css"), encoding="utf-8").read())
    h.update(css.encode("utf-8"))
    with open(os.path.join(dich, "dxg-embed.css"), "w", encoding="utf-8") as fh:
        fh.write("/* Tạo tự động từ modules/de_xuat_gia/assets/dxg.css — giới hạn trong #sec-dxg. Không sửa trực tiếp. */\n" + css)
    v = h.hexdigest()[:8]
    src = open(os.path.join(DXG, "index.html"), encoding="utf-8").read()
    giao_dien = re.search(r'<main class="wrap">.*?</main>', src, re.S).group(0) + "\n" + re.search(r'<aside id="dxg-drawer".*?</aside>', src, re.S).group(0)
    nl = "\r\n" if "\r\n" in html else "\n"
    html = html.replace("</head>", f'<!--DXG--><link rel="stylesheet" href="assets/dxg/dxg-embed.css?v={v}"><!--/DXG-->{nl}</head>', 1)
    html = re.sub(r'(<script src="[^"]*crypto-web\.js")', lambda m: f'<!--DXG--><template id="dxg-tpl">{giao_dien}</template><!--/DXG-->{nl}' + m.group(1), html, count=1)
    # pricing.js nạp TRƯỚC app.js: app tra cứu dùng mergeDB để gộp nguồn đối thủ / CTG vào dữ liệu nội bộ
    truoc = f",assets/dxg/pricing.js?v={v}"
    html, co_app = re.subn(r'(data-scripts="[^"]*?)(,assets/app\.js)', lambda m: m.group(1) + truoc + m.group(2), html, count=1)
    them = "".join(f",assets/dxg/{f}?v={v}" for f in DXG_JS if co_app == 0 or f != "pricing.js")
    html = re.sub(r'(data-scripts="[^"]*)"', lambda m: m.group(1) + them + '"', html, count=1)
    return html


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
    if "--module" in sys.argv:
        for thu_muc, vai_tro in [(DOCS, "admin"), (NHAN_VIEN, "nhan_vien")]:
            idx = os.path.join(thu_muc, "index.html")
            if not os.path.isfile(idx):
                print(f"Bỏ qua {thu_muc}: chưa có bản dựng app tra cứu (chạy python build.py đầy đủ trước).")
                continue
            html = open(idx, encoding="utf-8", newline="").read()
            with open(idx, "w", encoding="utf-8", newline="") as fh:
                fh.write(gan_dien_gia(html, thu_muc, vai_tro))
            kiem_tra_dau_ra(thu_muc)
            print(f"✓ Ghép module Điền giá BOQ → {thu_muc}")
        return
    if not os.path.isdir(WEB):
        sys.exit(f"Không thấy {WEB}. Cần thư mục 3_WEB_OFFLINE của dự án để lấy giao diện.")
    kiem_tra_web()
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
    shutil.rmtree(NHAN_VIEN, ignore_errors=True)   # chỉ giữ bản zip cho nhẹ
    print(f"✓ Bản admin:    {DOCS}  (đưa lên GitHub)")
    print(f"✓ Gói zip nhân viên: {zip_path}")


if __name__ == "__main__":
    main()
