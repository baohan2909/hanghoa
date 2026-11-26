-- ============================================================================
-- NEW - 306: KIỂM NHẬN HÀNG (quét mã / tick mã) cần hình từng mã — chi tiết phiếu (fn_odoo_don_ct → dong4) trả thêm 'hinh'
--   Hình lấy từ danh mục sản phẩm (san_pham.hinh_url); mã chưa có hình thì mượn hình mã cùng mẫu-màu khác size (bỏ đuôi -size).
-- ============================================================================
do $do$
declare d text;
  o1 text := $q$    select j.*, coalesce(s.ma_tham_chieu, dm.ma_tham_chieu, j.sku, j.bc) ma,$q$;
  n1 text := $q$    select j.*, coalesce(s.hinh_url, (select s2.hinh_url from san_pham s2                     -- NEW - 306: hình từng mã
                                      where s2.hinh_url is not null and coalesce(s.ma_tham_chieu, dm.ma_tham_chieu) like '%-%'
                                        and s2.ma_tham_chieu like regexp_replace(coalesce(s.ma_tham_chieu, dm.ma_tham_chieu), '-[^-]+$', '') || '-%'
                                      limit 1)) hinh,
           coalesce(s.ma_tham_chieu, dm.ma_tham_chieu, j.sku, j.bc) ma,$q$;
  o2 text := $q$'app', k.app, 'odoo', k.odoo, 'xuat', k.xuat, 'nhan', k.nhan, 'kq', k.kq, 'ks', k.ks)$q$;
  n2 text := $q$'app', k.app, 'odoo', k.odoo, 'xuat', k.xuat, 'nhan', k.nhan, 'kq', k.kq, 'ks', k.ks, 'hinh', k.hinh)$q$;
begin
  d := pg_get_functiondef('chiahang.fn_odoo_don_ct'::regproc);
  if position('NEW - 306' in d) > 0 then return; end if;
  if (length(d) - length(replace(d, o1, ''))) / length(o1) <> 1 then raise exception 'fn_odoo_don_ct: mốc 1'; end if;
  if (length(d) - length(replace(d, o2, ''))) / length(o2) <> 1 then raise exception 'fn_odoo_don_ct: mốc 2'; end if;
  execute replace(replace(d, o1, n1), o2, n2);
end $do$;
