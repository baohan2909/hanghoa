-- ============================================================================
-- NEW - 311 (27/11 15:00, anh): Quản trị huỷ được phiếu đã chia CHƯA có đơn Odoo ngay ở Đơn hàng Odoo
--   (vd DS261120-112915-D01 — phiếu cũ đã được chia lại bằng phiếu sau, không gửi nữa).
--   Huỷ = như nút Huỷ ở Đội Sale › Phiếu đã chia (fn_ds_phieu_doi_tt): trả phần tồn đang giữ, thùng trả lại, phiếu thành "Đã huỷ".
--   Chặn: chỉ tài khoản Quản trị; chỉ phiếu đang giữ tồn và CHƯA có đơn Odoo nào (đã có đơn thì huỷ đơn bên Odoo trước).
-- ============================================================================
create or replace function chiahang.fn_odoo_chua_gui_huy(p_token uuid, p_id bigint, p_ly_do text default null)
returns jsonb language plpgsql security definer
set search_path to chiahang, public
as $$
declare u jsonb; p record; k jsonb;
begin
  u := _fn_dt_u(p_token);
  if not coalesce((u->>'admin')::boolean, false) then
    return jsonb_build_object('ok', false, 'loi', 'Chỉ tài khoản Quản trị được huỷ phiếu ở đây');
  end if;
  select * into p from ds_phieu where id = p_id;
  if p.id is null then return jsonb_build_object('ok', false, 'loi', 'Không thấy phiếu'); end if;
  if p.trang_thai <> 'xac_nhan' then return jsonb_build_object('ok', false, 'loi', 'Phiếu không còn ở trạng thái đang giữ tồn'); end if;
  if exists (select 1 from odoo_don o where o.tai_lieu_nguon = p.ma_phieu) then
    return jsonb_build_object('ok', false, 'loi', 'Phiếu đã có đơn Odoo — huỷ đơn Odoo trước');
  end if;
  k := fn_ds_phieu_doi_tt(p_id, 'huy', coalesce(u->>'ma', u->>'ma_dang_nhap', '?') || ' ở Đơn hàng Odoo'
                                         || coalesce(' — ' || nullif(trim(p_ly_do), ''), ''));
  return k || jsonb_build_object('ma_phieu', p.ma_phieu);
end $$;
revoke all on function chiahang.fn_odoo_chua_gui_huy(uuid, bigint, text) from public;
grant execute on function chiahang.fn_odoo_chua_gui_huy(uuid, bigint, text) to anon, authenticated;

notify pgrst, 'reload schema';
