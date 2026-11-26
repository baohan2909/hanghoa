-- ============================================================================
-- NEW - 308: ẨN ĐƠN HUỶ (anh chốt 26/11 16:02 — "đã huỷ rồi thì đừng hiển thị… áp dụng toàn bộ")
--   - Đơn huỷ / xoá trên Odoo / đơn app đã bỏ = một trạng thái "Đã huỷ" và KHÔNG hiện trong danh sách Đơn hàng Odoo
--     (mọi tài khoản, kể cả màn nhúng ở Phòng điều hành). Chỉ QUẢN TRỊ bật "Hiện đơn huỷ" hoặc bấm ô "Huỷ" khi cần xem.
--   - Ô số "Tất cả", "Cần xử lý"… không đếm đơn huỷ; ô "Huỷ" chỉ Quản trị thấy (so_huy).
--   - Cảnh báo "Giống đơn khác" chỉ còn khi đơn giống kia vẫn đang chạy (đơn kia đã huỷ / xoá / bỏ thì thôi).
--   - Lịch cửa hàng + dòng "Hôm nay đã gửi phiếu" (Đề nghị hàng) không tính phiếu đã huỷ / từ chối.
-- ============================================================================

-- 1) "Giống đơn khác" chỉ khi đơn kia còn chạy
do $do$
declare d text;
  o text := $q$case when b.trung_voi is not null then 'trung' end,$q$;
  n text := $q$case when b.trung_voi is not null                                                   -- NEW - 308: đơn kia đã huỷ / xoá / bỏ thì không báo
                 and not exists (select 1 from odoo_don t2 left join odoo_phieu op2 on op2.name = t2.name
                                 where t2.name = b.trung_voi
                                   and (t2.trang_thai = 'da_bo' or op2.state in ('cancel', 'refuse')
                                        or coalesce(op2.tt_ct, t2.odoo_ct, '') in ('Đã xoá', 'Bị hủy', 'Bị từ chối')))
            then 'trung' end,$q$;
begin
  d := pg_get_functiondef('chiahang._fn_odoo_v'::regproc);
  if position('NEW - 308' in d) > 0 then return; end if;
  if (length(d) - length(replace(d, o, ''))) / length(o) <> 1 then raise exception '_fn_odoo_v: mốc'; end if;
  execute replace(d, o, n);
end $do$;

-- 2) Danh sách: ẩn đơn huỷ / xoá / bỏ — chỉ Quản trị bật xem (hien_huy) hoặc bấm ô Huỷ
do $do$
declare d text;
  o text := $q$and (nullif(p_loc->>'nhom', '') is null or p_loc->>'nhom' = any (v.nhom) or v.name = any (v_bt))$q$;
  n text := $q$and (nullif(p_loc->>'nhom', '') is null or p_loc->>'nhom' = any (v.nhom) or v.name = any (v_bt)
           or (p_loc->>'nhom' = 'huy' and v.trang_thai = 'da_bo'))
      and (not (coalesce(v.dc, '') = 'huy' or v.trang_thai = 'da_bo')                       -- NEW - 308: đơn huỷ / xoá / bỏ ẩn
           or (coalesce((u->>'admin')::boolean, false) and (coalesce((p_loc->>'hien_huy')::boolean, false) or p_loc->>'nhom' = 'huy')))$q$;
begin
  d := pg_get_functiondef('chiahang.fn_odoo_don_ds'::regproc);
  if position('NEW - 308' in d) > 0 then return; end if;
  if (length(d) - length(replace(d, o, ''))) / length(o) <> 1 then raise exception 'fn_odoo_don_ds: mốc'; end if;
  execute replace(d, o, n);
end $do$;

-- 3) Ô số: không đếm đơn huỷ; số đơn huỷ riêng cho Quản trị
do $do$
declare d text;
  o1 text := $q$with f as materialized ($q$;
  n1 text := $q$with f0 as materialized ($q$;
  o2 text := $q$), k as (select unnest(nhom) k from f)$q$;
  n2 text := $q$), f as materialized (select * from f0 where not (coalesce(f0.dc, '') = 'huy' or f0.trang_thai = 'da_bo')),   -- NEW - 308
  k as (select unnest(nhom) k from f)$q$;
  o3 text := $q$    'bao_thieu', case when$q$;
  n3 text := $q$    'so_huy', case when coalesce((u->>'admin')::boolean, false)                     -- NEW - 308: chỉ Quản trị thấy số đơn huỷ
                   then (select count(*) from f0 where coalesce(f0.dc, '') = 'huy' or f0.trang_thai = 'da_bo') else 0 end,
    'bao_thieu', case when$q$;
begin
  d := pg_get_functiondef('chiahang.fn_odoo_tong_quan'::regproc);
  if position('NEW - 308' in d) > 0 then return; end if;
  if (length(d) - length(replace(d, o1, ''))) / length(o1) <> 1 then raise exception 'fn_odoo_tong_quan: mốc 1'; end if;
  if (length(d) - length(replace(d, o2, ''))) / length(o2) <> 1 then raise exception 'fn_odoo_tong_quan: mốc 2'; end if;
  if (length(d) - length(replace(d, o3, ''))) / length(o3) <> 1 then raise exception 'fn_odoo_tong_quan: mốc 3'; end if;
  execute replace(replace(replace(d, o1, n1), o2, n2), o3, n3);
end $do$;

-- 4) Lịch cửa hàng + "Hôm nay đã gửi phiếu": bỏ phiếu đã huỷ / từ chối
do $do$
declare f text; d text;
  o text := $q$d.ma_ch = p_ma_ch and d.ngay_tao between p_tu and p_den$q$;
  n text := $q$d.ma_ch = p_ma_ch and d.ngay_tao between p_tu and p_den
      and coalesce(d.trang_thai_chi_tiet, '') not in ('Bị hủy', 'Bị huỷ', 'Bị từ chối', 'Đã xoá')   -- NEW - 308: phiếu huỷ không tính$q$;
begin
  foreach f in array array['chiahang.fn_dck_phieu_cua_ch', 'chiahang.fn_dck_theo_ch'] loop
    d := pg_get_functiondef(f::regproc);
    continue when position('NEW - 308' in d) > 0;
    if (length(d) - length(replace(d, o, ''))) / length(o) <> 1 then raise exception '%: mốc', f; end if;
    execute replace(d, o, n);
  end loop;
end $do$;

notify pgrst, 'reload schema';
