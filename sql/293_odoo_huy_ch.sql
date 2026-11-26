-- NEW - 293: TÀI KHOẢN CỬA HÀNG chỉ được HUỶ / SỬA đơn Odoo khi đơn đang "Chờ sẵn sàng" (bước 5 — chưa ai tác động)   (anh chốt 26/11/2026)
--   Bước: 3 = đã gửi, Odoo chưa báo trạng thái · 4 = Chưa chuyển · 5 = Chờ sẵn sàng · 6 = Đã xuất / Một phần / Chưa nhận · 7 = Đã nhận.
--   Điều phối / Quản trị: giữ như cũ (bước 3–5, chưa xuất cái nào). Vẫn chặn khi kho đã xuất bất kỳ số lượng nào.
--   Cửa hàng ngoài bước 5 → dùng "Yêu cầu huỷ" để kho / điều phối xử lý.
do $do$
declare d text;
  o1 text := $q$  if o.buoc = -1 then return jsonb_build_object('ok', false, 'loi', 'Đơn đã ' || coalesce(lower(o.odoo_ct), 'huỷ') || ' trên Odoo'); end if;$q$;
  n1 text := $q$  if o.buoc = -1 then return jsonb_build_object('ok', false, 'loi', 'Đơn đã ' || coalesce(lower(o.odoo_ct), 'huỷ') || ' trên Odoo'); end if;
  -- NEW - 293: cửa hàng chỉ huỷ khi đơn đang Chờ sẵn sàng (chưa ai tác động)
  if u->>'vai_tro' = 'CH' and not coalesce((u->>'ql')::boolean, false) and o.buoc <> 5 then
    return jsonb_build_object('ok', false, 'loi', 'Tài khoản cửa hàng chỉ ' || lower(v_ten) || ' được đơn đang "Chờ sẵn sàng" (chưa ai xử lý). Đơn này đang "'
      || coalesce(o.odoo_tt, 'chưa có trạng thái từ Odoo') || '" — bấm "Yêu cầu huỷ" để kho / điều phối xử lý.');
  end if;$q$;
begin
  d := pg_get_functiondef('chiahang.fn_odoo_huy_chuan_bi'::regproc);
  if position(o1 in d) = 0 then raise exception 'fn_odoo_huy_chuan_bi: không thấy mốc'; end if;
  execute replace(d, o1, n1);
end $do$;

do $do$
declare d text;
  o1 text := $q$'huy_odoo', (o.nguoi_gui = u->>'ma' or v_ql) and o.trang_thai = 'thanh_cong' and o.buoc between 3 and 5$q$;
  n1 text := $q$'huy_odoo', (o.nguoi_gui = u->>'ma' or v_ql) and o.trang_thai = 'thanh_cong'
                    and (case when u->>'vai_tro' = 'CH' and not v_ql then o.buoc = 5 else o.buoc between 3 and 5 end)   -- NEW - 293$q$;
begin
  d := pg_get_functiondef('chiahang.fn_odoo_don_ct'::regproc);
  if position(o1 in d) = 0 then raise exception 'fn_odoo_don_ct: không thấy mốc'; end if;
  execute replace(d, o1, n1);
end $do$;
