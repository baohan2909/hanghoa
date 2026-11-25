-- NEW - 279: Hộp gửi Odoo — cổng Odoo báo 502 / quá giờ nhưng Odoo VẪN tạo đơn (25/11 DSC20261125-SA05001-DOISALE19-01)
--   App tự kiểm tra lại theo TÊN đơn: gọi fn_odoo_pk_lam_moi (hỏi Odoo) rồi đọc trạng thái bằng hàm này.
--   Trigger tg_odoo_don_doi_chieu sẵn có tự chuyển 'loi' -> 'thanh_cong' khi dữ liệu Odoo có đơn.
create or replace function chiahang.fn_odoo_tt_ten(p_token uuid, p_names text[]) returns jsonb
language plpgsql stable security definer set search_path to chiahang, public as $$
declare u jsonb;
begin
  u := _fn_dt_u(p_token);
  return coalesce((
    select jsonb_agg(jsonb_build_object('name', name, 'trang_thai', trang_thai, 'loi', loi, 'odoo_id', odoo_id,
                                        'odoo_tt', odoo_tt, 'odoo_ct', odoo_ct))
    from odoo_don where name = any (coalesce(p_names[1:50], '{}'))), '[]'::jsonb);
end $$;
revoke all on function chiahang.fn_odoo_tt_ten(uuid, text[]) from public;
grant execute on function chiahang.fn_odoo_tt_ten(uuid, text[]) to anon, authenticated, service_role;
