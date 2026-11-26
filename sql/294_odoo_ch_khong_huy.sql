-- NEW - 294: ĐÃ ĐẨY ĐƠN LÊN ODOO → TÀI KHOẢN CỬA HÀNG KHÔNG HUỶ / XOÁ / SỬA ĐƯỢC   (anh chốt 26/11/2026, thay SQL 293)
--   Lý do: kho in phiếu soạn hàng ngay sau khi nhận đơn — in phiếu KHÔNG đổi trạng thái trên Odoo ("Chờ sẵn sàng" vẫn có thể đang soạn).
--   Cần huỷ: liên hệ phòng Điều Phối Hàng Hóa (danh sách ở tham số odoo_api.lien_he_huy) hoặc bấm "Yêu cầu huỷ" (ghi nhật ký cho điều phối).
--   Điều phối / Quản trị: giữ như cũ (tới hết "Chờ sẵn sàng", chưa xuất cái nào).
update chiahang.tham_so
set gia_tri = gia_tri || '{"lien_he_huy": [{"ten": "Nguyễn Phương Thảo", "sdt": "0902 474 186"}, {"ten": "Đỗ Thị Lệ Quyên", "sdt": "0902 488 857"}]}'::jsonb
where key = 'odoo_api' and pham_vi = 'GLOBAL';

-- liên hệ huỷ: trả kèm cấu hình Odoo (hộp gửi đơn) — dạng "Tên SĐT · Tên SĐT"
create or replace function chiahang._fn_odoo_lien_he_huy()
returns text language sql stable security definer set search_path to chiahang, public as $$
  select coalesce(string_agg((e->>'ten') || ' ' || (e->>'sdt'), ' · '), 'phòng Điều Phối Hàng Hóa')
  from tham_so t cross join jsonb_array_elements(coalesce(t.gia_tri->'lien_he_huy', '[]')) e
  where t.key = 'odoo_api' and t.pham_vi = 'GLOBAL'
$$;

do $do$
declare d text;
  o1 text := $q$  -- NEW - 293: cửa hàng chỉ huỷ khi đơn đang Chờ sẵn sàng (chưa ai tác động)
  if u->>'vai_tro' = 'CH' and not coalesce((u->>'ql')::boolean, false) and o.buoc <> 5 then
    return jsonb_build_object('ok', false, 'loi', 'Tài khoản cửa hàng chỉ ' || lower(v_ten) || ' được đơn đang "Chờ sẵn sàng" (chưa ai xử lý). Đơn này đang "'
      || coalesce(o.odoo_tt, 'chưa có trạng thái từ Odoo') || '" — bấm "Yêu cầu huỷ" để kho / điều phối xử lý.');
  end if;$q$;
  n1 text := $q$  -- NEW - 294: đơn đã đẩy lên Odoo → cửa hàng không tự huỷ / xoá (kho có thể đã in phiếu soạn hàng)
  if u->>'vai_tro' = 'CH' and not coalesce((u->>'ql')::boolean, false) then
    return jsonb_build_object('ok', false, 'loi', 'Đơn đã đẩy lên Odoo — tài khoản cửa hàng không tự ' || lower(v_ten)
      || ' được (kho có thể đã in phiếu soạn hàng). Cần ' || lower(v_ten) || ': liên hệ phòng Điều Phối Hàng Hóa — '
      || _fn_odoo_lien_he_huy() || ', hoặc bấm "Yêu cầu huỷ".');
  end if;$q$;
begin
  d := pg_get_functiondef('chiahang.fn_odoo_huy_chuan_bi'::regproc);
  if position(o1 in d) = 0 then raise exception 'fn_odoo_huy_chuan_bi: không thấy mốc 293'; end if;
  execute replace(d, o1, n1);
end $do$;

do $do$
declare d text;
  o1 text := $q$and (case when u->>'vai_tro' = 'CH' and not v_ql then o.buoc = 5 else o.buoc between 3 and 5 end)   -- NEW - 293$q$;
  n1 text := $q$and (coalesce(u->>'vai_tro', '') <> 'CH' or v_ql) and o.buoc between 3 and 5   -- NEW - 294: cửa hàng không tự huỷ sau khi đẩy đơn$q$;
  o2 text := $q$'huy_api', jsonb_build_object('huy_bat', coalesce((c->>'huy_bat')::boolean, false), 'xoa_bat', coalesce((c->>'xoa_bat')::boolean, false)),$q$;
  n2 text := $q$'huy_api', jsonb_build_object('huy_bat', coalesce((c->>'huy_bat')::boolean, false), 'xoa_bat', coalesce((c->>'xoa_bat')::boolean, false)),
      'lien_he_huy', coalesce(c->'lien_he_huy', '[]'::jsonb),   -- NEW - 294$q$;
begin
  d := pg_get_functiondef('chiahang.fn_odoo_don_ct'::regproc);
  if position(o1 in d) = 0 then raise exception 'fn_odoo_don_ct: không thấy mốc 293'; end if;
  if (length(d) - length(replace(d, o2, ''))) / length(o2) <> 1 then raise exception 'fn_odoo_don_ct: mốc huy_api'; end if;
  execute replace(replace(d, o1, n1), o2, n2);
end $do$;

do $do$
declare d text;
  o1 text := $q$'nguoi_tao', coalesce(c->>'nguoi_tao', ''), 'ma', u->>'ma',$q$;
  n1 text := $q$'nguoi_tao', coalesce(c->>'nguoi_tao', ''), 'ma', u->>'ma',
    'lien_he_huy', coalesce(c->'lien_he_huy', '[]'::jsonb),   -- NEW - 294$q$;
begin
  d := pg_get_functiondef('chiahang.fn_odoo_cfg'::regproc);
  if position(o1 in d) = 0 then raise exception 'fn_odoo_cfg: không thấy mốc'; end if;
  execute replace(d, o1, n1);
end $do$;
