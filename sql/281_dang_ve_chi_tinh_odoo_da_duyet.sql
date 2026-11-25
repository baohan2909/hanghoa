-- NEW - 281: QUY TẮC (anh chốt 25/11): ĐƠN CHƯA ĐẨY QUA ODOO TUYỆT ĐỐI KHÔNG TÍNH VÀO "ĐANG VỀ"
--   "Đang về" chỉ lấy từ phiếu Odoo ĐÃ DUYỆT (Điều chuyển kho: Chờ sẵn sàng / Đã xuất / Một phần) + chênh "dự tính − hiện tại" của Odoo.
--   KHÔNG tính:
--     • "Chưa chuyển" = yêu cầu nháp trên Odoo chưa duyệt ("Yêu cầu điều chuyển") — vd DK20261119-TP05006-DB06005-02 gây "0 + 2" ảo
--     • giữ chỗ trên app (ton_cam_ket giu_cho / tam_giu) chưa lên Odoo
--     • phiếu chia trên app chưa đẩy Odoo (đã bỏ từ SQL 272)
--     • Chia hàng Online: đơn app mà Odoo giữ NHÁP (odoo_duyet = 'giu_nhap')
--   fn_dang_ve dùng chung cho: Đề nghị hàng, Đội Sale, Chia hàng mới, Cảnh báo, Thiếu hàng, Quét thiếu hàng, popup "đang về".
do $do$
declare d text;
  o1 text := $$d.trang_thai in ('Chưa chuyển', 'Chờ sẵn sàng', 'Đã xuất', 'Một phần')$$;
  n1 text := $$d.trang_thai in ('Chờ sẵn sàng', 'Đã xuất', 'Một phần') /* NEW - 281: 'Chưa chuyển' = yêu cầu chưa duyệt trên Odoo — KHÔNG tính */$$;
  o2 text := E'          union all select ck.ma_ch, ck.barcode, ck.sl, ck.sl from ck) x';
  n2 text := E'          -- NEW - 281: giữ chỗ trên app (ton_cam_ket giu_cho / tam_giu) chưa lên Odoo — KHÔNG tính\n          ) x';
  o3 text := $$    'tra_di', coalesce($$;
  n3 text := E'    -- NEW - 281: yêu cầu nháp trên Odoo chưa duyệt — chỉ liệt kê, KHÔNG tính vào đang về\n'
          || E'    ''yc_odoo'', coalesce((select jsonb_agg(jsonb_build_object(''ma_phieu'', d.ma_phieu, ''tu'', d.ma_kho_nguon, ''sl'', d.sl_nhu_cau,\n'
          || E'        ''ngay_tao'', d.ngay_tao) order by d.ngay_tao desc, d.ma_phieu)\n'
          || E'      from dieu_chuyen_kho d\n'
          || E'      where d.ma_ch = p_ma_ch and d.barcode = p_barcode and d.ngay_tao > current_date - 30 and d.trang_thai = ''Chưa chuyển''\n'
          || E'        and coalesce(d.trang_thai_chi_tiet, '''') not in (''Bị hủy'', ''Bị từ chối'')), ''[]''::jsonb),\n'
          || $$    'tra_di', coalesce($$;
  o4 text := $$o.trang_thai = 'thanh_cong' and o.huy is null and o.tao_luc > now() - interval '10 days'$$;
  n4 text := $$o.trang_thai = 'thanh_cong' and o.huy is null and o.tao_luc > now() - interval '10 days' and coalesce(o.odoo_duyet, '') <> 'giu_nhap'$$;
begin
  -- fn_dang_ve
  d := pg_get_functiondef('chiahang.fn_dang_ve'::regproc);
  if (length(d) - length(replace(d, o1, ''))) / length(o1) <> 1 or (length(d) - length(replace(d, o2, ''))) / length(o2) <> 1 then
    raise exception 'fn_dang_ve: mốc không duy nhất'; end if;
  execute replace(replace(d, o1, n1), o2, n2);
  -- fn_dang_ve_ct
  d := pg_get_functiondef('chiahang.fn_dang_ve_ct'::regproc);
  if (length(d) - length(replace(d, o1, ''))) / length(o1) <> 1 or (length(d) - length(replace(d, o3, ''))) / length(o3) <> 1 then
    raise exception 'fn_dang_ve_ct: mốc không duy nhất'; end if;
  execute replace(replace(d, o1, n1), o3, n3);
  -- _fn_ol_tinh (Chia hàng Online)
  d := pg_get_functiondef('chiahang._fn_ol_tinh'::regproc);
  if (length(d) - length(replace(d, o1, ''))) / length(o1) <> 1 or (length(d) - length(replace(d, o4, ''))) / length(o4) <> 1 then
    raise exception '_fn_ol_tinh: mốc không duy nhất'; end if;
  execute replace(replace(d, o1, n1), o4, n4);
end $do$;
