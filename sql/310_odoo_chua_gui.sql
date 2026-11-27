-- ============================================================================
-- NEW - 310 (27/11 14:40, anh báo):
--   1) LẤY SỐ TỪ ODOO ĐỨNG TỪ 13:52: máy chủ dữ liệu khởi động lại 2 lần (13:53, 14:20) -> bộ đếm mã yêu cầu của pg_net
--      quay về 1, đụng mã cũ còn trong odoo_pk_hang (khoá chính req_id) -> fn_odoo_pk_quet lỗi "duplicate key" mỗi phút,
--      không lấy được phiếu mới -> đơn vừa tạo hiện "Chờ Odoo nhận", ngăn chi tiết báo "App chưa đọc được phiếu này từ Odoo".
--      Sửa: (a) _fn_odoo_pk_gui ghi đè dòng cũ trùng mã (dòng cũ là lịch sử / yêu cầu đã mất khi máy chủ khởi động lại);
--           (b) fn_odoo_pk_quet đóng ngay các yêu cầu gửi TRƯỚC lúc máy chủ khởi động lại (phản hồi của chúng đã mất,
--               không để chúng đọc nhầm phản hồi của yêu cầu mới cùng mã).
--      KHÔNG đổi: lịch chạy, số lô, số yêu cầu mỗi phút, giờ nghỉ đêm.
--   2) ĐƠN HÀNG ODOO ĐẨY ĐƯỢC PHIẾU CHƯA GỬI: phiếu đã chia (Đội Sale / Chia hàng mới) đã xác nhận, đang giữ tồn
--      nhưng CHƯA có đơn Odoo -> fn_odoo_chua_gui trả danh sách để màn Đơn hàng Odoo hiện + nút "Gửi lên Odoo"
--      (trước chỉ gửi lại được ở Đội Sale › Phiếu đã chia).
-- ============================================================================

-- 1a) ghi đè dòng trùng mã yêu cầu
do $do$
declare d text;
  o text := $q$  insert into odoo_pk_hang (req_id, loai, ds, nguoi) values (v, p_loai, p_ds, p_nguoi);$q$;
  n text := $q$  insert into odoo_pk_hang (req_id, loai, ds, nguoi) values (v, p_loai, p_ds, p_nguoi)
  -- NEW - 310: máy chủ khởi động lại -> pg_net đếm lại từ 1 -> mã có thể trùng dòng cũ (lịch sử) -> ghi đè
  on conflict (req_id) do update set loai = excluded.loai, ds = excluded.ds, nguoi = excluded.nguoi,
                                     gui_luc = now(), xong_luc = null, ket_qua = null;$q$;
begin
  d := pg_get_functiondef('chiahang._fn_odoo_pk_gui(jsonb, text, jsonb, text)'::regprocedure);
  if position('NEW - 310' in d) > 0 then return; end if;
  if (length(d) - length(replace(d, o, ''))) / length(o) <> 1 then raise exception '_fn_odoo_pk_gui: mốc'; end if;
  execute replace(d, o, n);
end $do$;

-- 1b) đóng yêu cầu gửi trước lúc máy chủ khởi động lại
do $do$
declare d text;
  o text := $q$  for r in select req_id from odoo_pk_hang where xong_luc is null order by req_id loop$q$;
  n text := $q$  -- NEW - 310: yêu cầu gửi trước lúc máy chủ khởi động lại -> phản hồi đã mất (pg_net không giữ qua lần khởi động lại)
  update odoo_pk_hang set xong_luc = now(), ket_qua = 'mat: may chu khoi dong lai'
  where xong_luc is null and gui_luc < pg_postmaster_start_time();
  for r in select req_id from odoo_pk_hang where xong_luc is null order by req_id loop$q$;
begin
  d := pg_get_functiondef('chiahang.fn_odoo_pk_quet()'::regprocedure);
  if position('NEW - 310' in d) > 0 then return; end if;
  if (length(d) - length(replace(d, o, ''))) / length(o) <> 1 then raise exception 'fn_odoo_pk_quet: mốc'; end if;
  execute replace(d, o, n);
end $do$;

-- 2) phiếu đã chia chưa có đơn Odoo (Quản trị / Điều phối)
create or replace function chiahang.fn_odoo_chua_gui(p_token uuid)
returns jsonb language plpgsql stable security definer
set search_path to chiahang, public
set statement_timeout to '10s'
as $$
declare u jsonb;
begin
  u := _fn_dt_u(p_token);
  if not coalesce((u->>'ql')::boolean, false) then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.tao_luc desc)
    from (
      select p.id, p.ma_phieu, p.nguon, p.loai, p.ghi_chu, p.nguoi, nd.ten as ten_nguoi, p.tao_luc,
             c.so_ma, c.tong, c.doi
      from ds_phieu p
      left join nguoi_dung nd on nd.ma_dang_nhap = p.nguoi
      cross join lateral (
        select count(distinct ct.barcode) so_ma, coalesce(sum(ct.sl), 0) tong,
               coalesce(jsonb_agg(distinct ct.ma_ch) filter (where ct.ma_ch is not null), '[]'::jsonb) doi
        from ds_phieu_ct ct where ct.phieu_id = p.id) c
      where p.trang_thai = 'xac_nhan'
        and p.tao_luc > now() - interval '30 days'
        and p.tao_luc < now() - interval '3 minutes'          -- vừa xác nhận: hộp Odoo có thể đang gửi
        and not exists (select 1 from odoo_don o where o.tai_lieu_nguon = p.ma_phieu)
    ) x), '[]'::jsonb);
end $$;

notify pgrst, 'reload schema';
