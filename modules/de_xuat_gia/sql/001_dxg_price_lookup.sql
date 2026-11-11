-- Kho đơn giá tra cứu (từ sheet "PHAN TICH THEO MA" của file tổng hợp).
-- Chỉ admin đọc/ghi (dùng is_admin() như dxg_projects). Không có UPDATE/DELETE: mỗi lần lưu là một lô (batch) mới.
create table if not exists public.dxg_price_lookup (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.dxg_projects(id),
  batch_id    uuid not null,
  source_file text,
  description text not null check (char_length(description) between 1 and 1000),
  desc_search text not null,                 -- mô tả không dấu, chữ thường, để tìm kiếm
  unit_raw    text,                          -- đơn vị gốc trong file
  unit_norm   text,                          -- đơn vị đã chuẩn hóa (m2, m3, 100m2, tấn...)
  multi_unit  boolean not null default false,-- true: 2-3 đơn vị → tra theo mô tả
  unit_price  numeric not null check (unit_price >= 0),
  created_by  uuid default auth.uid() references auth.users(id),
  created_at  timestamptz not null default now()
);
create index if not exists dxg_price_lookup_project_idx on public.dxg_price_lookup (project_id, batch_id);
create index if not exists dxg_price_lookup_unit_idx on public.dxg_price_lookup (unit_norm);
create index if not exists dxg_price_lookup_price_idx on public.dxg_price_lookup (unit_price);

alter table public.dxg_price_lookup enable row level security;
create policy dxg_price_lookup_select on public.dxg_price_lookup for select to authenticated using ((select is_admin()));
create policy dxg_price_lookup_insert on public.dxg_price_lookup for insert to authenticated with check ((select is_admin()));

-- Chỉ lô mới nhất của mỗi dự án (tra cứu dùng view này)
create or replace view public.dxg_price_lookup_latest with (security_invoker = true) as
select p.* from public.dxg_price_lookup p
where p.batch_id = (select l.batch_id from public.dxg_price_lookup l where l.project_id = p.project_id order by l.created_at desc limit 1);
