-- ============================================================================
-- NEW - 307 (26/11 15:41–15:46, anh báo):
--   1) Đơn hàng Odoo — TÌM NHANH + KHÔNG DẤU: gõ "đức hòa" chờ 3–6 giây, "duc hoa" không ra gì.
--      Trước: có từ khoá là tính chi tiết MỌI phiếu mọi ngày (~18.700 phiếu) rồi mới lọc.
--      Nay: lọc trước tên các phiếu khớp từ khoá (bỏ dấu, mọi ngày) theo mã / tên cửa hàng – kho, mã phiếu, số Odoo, ghi chú,
--           người gửi (mã + tên), lý do, mã vạch / SKU, mã hàng, tên hàng, mã vận đơn, mã phiếu xuất / nhận XKDC / NKDC
--           → chỉ tính chi tiết đúng các phiếu đó (_fn_odoo_v2 thêm tham số p_ds = danh sách tên phiếu).
--   2) Ô "Người gửi" có cả tên (fn_odoo_tong_quan trả thêm nguoi_ten).
--   3) Báo "giống đơn … đã gửi" nhầm: đơn kia đã XOÁ / HUỶ trên Odoo vẫn bị tính là trùng (ca CH06024 -07/-08 so với -16/-17)
--      → kiểm trùng bỏ qua đơn mà Odoo đã xoá / huỷ / từ chối.
-- ============================================================================

-- Chỉ mục tra mã vạch / SKU trong dòng phiếu Odoo
create index if not exists odoo_phieu_dong_bc_idx on chiahang.odoo_phieu_dong (barcode);
create index if not exists odoo_phieu_dong_sku_idx on chiahang.odoo_phieu_dong (sku);

-- 1a) _fn_odoo_v2: thêm bản 5 tham số (p_ds = danh sách tên phiếu, chỉ tính đúng các phiếu đó).
--     Bản 4 tham số cũ (mọi màn đang gọi) giữ nguyên chữ ký, thân đổi thành gọi bản mới với p_ds = null → một chỗ tính duy nhất.
do $do$
declare d text; v text; i int;
  o0 text := $q$p_tu date DEFAULT NULL::date, p_den date DEFAULT NULL::date, p_ten text DEFAULT NULL::text)$q$;
  n0 text := $q$p_tu date, p_den date, p_ten text, p_ds text[])$q$;
  o1 text := $q$(p_ten is null or a.name = p_ten)$q$;
  n1 text := $q$(p_ten is null or a.name = p_ten) and (p_ds is null or a.name = any (p_ds))$q$;
  o2 text := $q$(p_ten is null or op.name = p_ten)$q$;
  n2 text := $q$(p_ten is null or op.name = p_ten) and (p_ds is null or op.name = any (p_ds))$q$;
begin
  if to_regprocedure('chiahang._fn_odoo_v2(jsonb, date, date, text, text[])') is not null then return; end if;
  d := pg_get_functiondef('chiahang._fn_odoo_v2(jsonb, date, date, text)'::regprocedure);
  if (length(d) - length(replace(d, o0, ''))) / length(o0) <> 1 then raise exception '_fn_odoo_v2: mốc 0'; end if;
  if (length(d) - length(replace(d, o1, ''))) / length(o1) <> 1 then raise exception '_fn_odoo_v2: mốc 1'; end if;
  if (length(d) - length(replace(d, o2, ''))) / length(o2) <> 1 then raise exception '_fn_odoo_v2: mốc 2'; end if;
  -- bản mới 5 tham số (thân y hệt bản cũ + lọc p_ds)
  execute replace(replace(replace(d, o0, n0), o1, n1), o2, n2);
  -- bản cũ 4 tham số: chỉ gọi bản mới
  i := strpos(d, 'AS $function$');
  v := left(d, i - 1) || 'AS $function$' || chr(10)
       || '  -- NEW - 307: thân thật nằm ở bản 5 tham số (thêm p_ds); bản này giữ chữ ký cho mọi chỗ đang gọi' || chr(10)
       || '  select * from chiahang._fn_odoo_v2(p_u, p_tu, p_den, p_ten, null::text[])' || chr(10) || '$function$';
  execute v;
end $do$;
revoke all on function chiahang._fn_odoo_v2(jsonb, date, date, text, text[]) from public, anon, authenticated, service_role;
revoke all on function chiahang._fn_odoo_v2(jsonb, date, date, text) from public, anon, authenticated, service_role;

-- 1b) fn_odoo_don_ds: có từ khoá → lọc trước tên phiếu rồi chỉ tính các phiếu đó
do $do$
declare d text;
  o1 text := $q$declare v_bt text[]; u jsonb; v_q text;$q$;
  n1 text := $q$declare v_cand text[]; v_qk text; v_ma boolean; v_bt text[]; u jsonb; v_q text;$q$;
  o2 text := $q$  v_bt := case when p_loc->>'nhom' = 'bao_thieu' then array(select distinct b.name from odoo_nhan b where b.xl_tt = 'cho' and _fn_odoo_bt_cho(b.name)) end;$q$;
  n2 text := $q$  v_bt := case when p_loc->>'nhom' = 'bao_thieu' then array(select distinct b.name from odoo_nhan b where b.xl_tt = 'cho' and _fn_odoo_bt_cho(b.name)) end;
  -- NEW - 307: tìm nhanh, không dấu — lọc trước tên phiếu khớp từ khoá (mọi ngày), chỉ tính chi tiết đúng các phiếu đó
  if v_q <> '' then
    v_qk := '%' || fn_ai_bo_dau(v_q) || '%';
    v_ma := v_q ~ '^[0-9a-z._/-]+$';     -- từ khoá dạng mã (không dấu cách, không dấu tiếng Việt)
    v_cand := array(
      with c as (select ch.ma_ch from cua_hang ch where fn_ai_bo_dau(ch.ma_ch || ' ' || coalesce(ch.ten, '')) like v_qk),
           nd as (select n.ma_dang_nhap from nguoi_dung n where fn_ai_bo_dau(n.ma_dang_nhap || ' ' || coalesce(n.ten, '')) like v_qk)
      select p.name from odoo_phieu p
       where p.kho_yeu_cau in (select ma_ch from c) or p.kho_cung_ung in (select ma_ch from c)
          or lower(concat_ws(' ', p.name, p.kho_yeu_cau, p.kho_cung_ung, p.transfer_id::text)) like '%' || v_q || '%'
          or (p.ghi_chu is not null and fn_ai_bo_dau(p.ghi_chu) like v_qk)
          or (v_q ~ '^(xk|nk)' and length(v_q) >= 4 and lower(coalesce(p.xk::text, '') || coalesce(p.nk::text, '')) like '%' || v_q || '%')
      union
      select o.name from odoo_don o
       where o.kho_yeu_cau in (select ma_ch from c) or o.kho_cung_ung in (select ma_ch from c) or o.nguoi_gui in (select ma_dang_nhap from nd)
          or fn_ai_bo_dau(concat_ws(' ', o.name, o.tai_lieu_nguon, o.kho_yeu_cau, o.kho_cung_ung, o.ghi_chu, o.nguoi_gui, o.nguoi_tao,
                                    o.sale_tai_cua_hang, o.ly_do, o.odoo_id::text, o.odoo_name)) like v_qk
          or (v_ma and exists (select 1 from jsonb_array_elements(coalesce(o.payload->'chi_tiet', '[]'::jsonb)) e
                               where lower(e->>'barcode') = v_q or lower(e->>'sku') = v_q))
      union
      select pd.name from odoo_phieu_dong pd where v_ma and (pd.barcode = v_q or pd.sku = v_q)
      union
      select pd.name from odoo_phieu_dong pd join san_pham s on s.barcode = pd.barcode
       where length(v_q) >= 3 and lower(coalesce(s.ma_tham_chieu, '')) like '%' || v_q || '%'
      union
      select pd.name from odoo_phieu_dong pd where length(v_q) >= 4 and not v_ma and lower(coalesce(pd.ten_sp, '')) like '%' || v_q || '%'
      union
      select vp.ma_phieu from van_don_phieu vp where v_ma and length(v_q) >= 4 and lower(vp.label_id) like '%' || v_q || '%');
  end if;$q$;
  o3 text := $q$where (v_q = '' or v.tim like '%' || v_q || '%'$q$;
  n3 text := $q$where (v_q = '' or v.name = any (v_cand) or v.tim like '%' || v_q || '%'$q$;
  o4 text := $q$from _fn_odoo_v2(u, v_tu, v_den) v$q$;
  n4 text := $q$from _fn_odoo_v2(u, v_tu, v_den, null, case when v_q <> '' then v_cand end) v$q$;
begin
  d := pg_get_functiondef('chiahang.fn_odoo_don_ds'::regproc);
  if position('NEW - 307' in d) > 0 then return; end if;
  if (length(d) - length(replace(d, o1, ''))) / length(o1) <> 1 then raise exception 'fn_odoo_don_ds: mốc 1'; end if;
  if (length(d) - length(replace(d, o2, ''))) / length(o2) <> 1 then raise exception 'fn_odoo_don_ds: mốc 2'; end if;
  if (length(d) - length(replace(d, o3, ''))) / length(o3) <> 1 then raise exception 'fn_odoo_don_ds: mốc 3'; end if;
  if (length(d) - length(replace(d, o4, ''))) / length(o4) <> 1 then raise exception 'fn_odoo_don_ds: mốc 4'; end if;
  execute replace(replace(replace(replace(d, o1, n1), o2, n2), o3, n3), o4, n4);
end $do$;

-- 2) Người gửi có cả tên
do $do$
declare d text;
  o text := $q$    'nguoi', coalesce((select jsonb_agg(distinct nguoi_gui) from f where nguoi_gui is not null), '[]'::jsonb),$q$;
  n text := $q$    'nguoi', coalesce((select jsonb_agg(distinct nguoi_gui) from f where nguoi_gui is not null), '[]'::jsonb),
    'nguoi_ten', coalesce((select jsonb_object_agg(x.ma, coalesce(nd.ten, ch.ten, x.ma))   -- NEW - 307: tên người gửi / cửa hàng
                           from (select distinct nguoi_gui ma from f where nguoi_gui is not null) x
                           left join nguoi_dung nd on nd.ma_dang_nhap = x.ma
                           left join cua_hang ch on ch.ma_ch = x.ma), '{}'::jsonb),$q$;
begin
  d := pg_get_functiondef('chiahang.fn_odoo_tong_quan'::regproc);
  if position('NEW - 307' in d) > 0 then return; end if;
  if (length(d) - length(replace(d, o, ''))) / length(o) <> 1 then raise exception 'fn_odoo_tong_quan: mốc'; end if;
  execute replace(d, o, n);
end $do$;

-- 3) Kiểm trùng bỏ qua đơn Odoo đã xoá / huỷ / từ chối
do $do$
declare d text;
  o text := $q$      and coalesce(o.odoo_ct, '') not in ('Bị hủy', 'Bị từ chối')$q$;
  n text := $q$      and coalesce(o.odoo_ct, '') not in ('Bị hủy', 'Bị từ chối')
      and not exists (select 1 from odoo_phieu op where op.name = o.name                       -- NEW - 307: Odoo đã xoá / huỷ thì không còn là trùng
                      and (op.state in ('cancel', 'refuse') or coalesce(op.tt_ct, '') in ('Đã xoá', 'Bị hủy', 'Bị từ chối')))$q$;
begin
  d := pg_get_functiondef('chiahang.fn_odoo_chuan_bi'::regproc);
  if position('NEW - 307' in d) > 0 then return; end if;
  if (length(d) - length(replace(d, o, ''))) / length(o) <> 1 then raise exception 'fn_odoo_chuan_bi: mốc'; end if;
  execute replace(d, o, n);
end $do$;

notify pgrst, 'reload schema';
