-- Loại hình dự án và Tỉnh/TP của dự án Kho giá (bộ lọc "Loại hình dự án", "Tỉnh/TP" của app tra cứu).
alter table public.dxg_projects
  add column if not exists loai_hinh text check (loai_hinh is null or char_length(loai_hinh) between 1 and 100),
  add column if not exists tinh text check (tinh is null or char_length(tinh) between 1 and 100);
-- Chỉ cho sửa đúng hai cột này (tên dự án vẫn không sửa được qua API); policy UPDATE của admin đã có (dxg_projects_archive).
grant update (loai_hinh, tinh) on public.dxg_projects to authenticated;
