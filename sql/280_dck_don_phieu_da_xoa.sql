-- NEW - 280: "Đang về" ẢO do phiếu đã bị XOÁ trên Odoo (25/11 — DB06005 hiện "0 + 2 = 2" từ phiếu DK20261119-TP05006-DB06005-02)
--   Nguyên nhân: fn_dck_don (GAS gọi sau mỗi lượt đồng bộ Sheet) xoá dòng không còn trong Sheet, NHƯNG chừa dòng API Odoo
--   đã chạm trong 7 ngày (api_luc). Phiếu bị xoá trên Odoo -> Sheet mất, API hỏi theo tên cũng không thấy -> dòng vẫn bị chừa,
--   tiếp tục tính "đang về" cho cửa hàng tới 7 ngày.
--   Sửa: dòng có api_luc vẫn được dọn khi CẢ HAI nguồn cùng xác nhận mất:
--     (1) Sheet không còn > 2 giờ (synced_at cũ hơn lượt này và cũ hơn 2 giờ)
--     (2) API Odoo hỏi theo tên ≥ 2 lần SAU lần cuối thấy (odoo_phieu.khong_thay ≥ 2, lay_luc > api_luc + 1 phút)
--   Phiếu BỊ HUỶ không đụng tới (Odoo vẫn trả về, trạng thái chi tiết "Bị hủy" đã không tính đang về).
do $do$
declare d text; o text := E'    and (api_luc is null or api_luc < now() - interval ''7 days'');';
begin
  d := pg_get_functiondef('chiahang.fn_dck_don'::regproc);
  if (length(d) - length(replace(d, o, ''))) / length(o) <> 1 then raise exception 'fn_dck_don: mốc không duy nhất'; end if;
  execute replace(d, o,
       E'    and (api_luc is null or api_luc < now() - interval ''7 days''\n'
    || E'         -- NEW - 280: Sheet mất > 2 giờ VÀ API Odoo hỏi theo tên >= 2 lần sau lần cuối thấy đều không thấy -> phiếu đã bị xoá trên Odoo\n'
    || E'         or (synced_at < now() - interval ''2 hours''\n'
    || E'             and exists (select 1 from odoo_phieu op where op.name = dieu_chuyen_kho.ma_phieu\n'
    || E'                           and op.khong_thay >= 2 and op.lay_luc > dieu_chuyen_kho.api_luc + interval ''1 minute'')));');
end $do$;
