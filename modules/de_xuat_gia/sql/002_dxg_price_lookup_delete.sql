-- Cho phép admin xóa đơn giá theo dự án (nút "Xóa giá dự án" trong Kho đơn giá tra cứu).
create policy dxg_price_lookup_delete on public.dxg_price_lookup for delete to authenticated using ((select is_admin()));
