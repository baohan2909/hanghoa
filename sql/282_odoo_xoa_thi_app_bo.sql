-- NEW - 282: PHIẾU BỊ XOÁ THẲNG TRÊN ODOO (không qua app) -> APP TỰ BỎ THEO (anh chốt 25/11)
--   Căn cứ: API đồng bộ phiếu Odoo (hỏi theo tên phiếu, cron odoo_pk_quet mỗi phút).
--   Odoo trả "thành công" mà 2 lần liền không có phiếu đó  +  báo cáo Odoo trên Sheet cũng mất phiếu ≥ 30 phút
--   => coi là Odoo đã xoá, app làm theo ngay:
--     1. odoo_phieu: state = cancel, tt_ct = 'Đã xoá' (không còn tính "trả đi" / đồng bộ)
--     2. dieu_chuyen_kho: bỏ các dòng của phiếu (không còn tính "đang về")
--     3. ton_cam_ket: trả lại hàng đang giữ cho kho nguồn (_fn_ton_tra)
--     4. odoo_don (đơn app đã tạo thành công): odoo_ct = 'Đã xoá' + ghi nhật ký đơn
--   Lần hỏi Odoo lỗi / không phải "success" KHÔNG tính là "không thấy" (tránh xoá nhầm khi API trục trặc).
create or replace function chiahang._fn_odoo_da_xoa(p_name text) returns jsonb
language plpgsql security definer set search_path to chiahang, public as $$
declare v_dck int := 0; v_tra int := 0; v_don int := 0;
begin
  if nullif(btrim(coalesce(p_name, '')), '') is null then return jsonb_build_object('bo_qua', 'khong_ten'); end if;
  -- an toàn: báo cáo Odoo trên Sheet cũng phải mất phiếu này ít nhất 30 phút (đồng bộ điều chuyển 10 phút / lần)
  if exists (select 1 from dieu_chuyen_kho where ma_phieu = p_name and synced_at > now() - interval '30 minutes') then
    return jsonb_build_object('bo_qua', 'sheet_van_con');
  end if;
  update odoo_phieu set state = 'cancel', tt_ct = 'Đã xoá', doi_luc = now()
  where name = p_name and coalesce(tt_ct, '') <> 'Đã xoá';
  delete from dieu_chuyen_kho where ma_phieu = p_name;
  get diagnostics v_dck = row_count;
  v_tra := _fn_ton_tra(p_name, 'Odoo đã xoá phiếu (làm thẳng trên Odoo) — app tự trả lại hàng đang giữ', 'he_thong');
  with u as (
    update odoo_don set odoo_ct = 'Đã xoá', odoo_thay_luc = coalesce(odoo_thay_luc, now()), odoo_tt_luc = now()
    where name = p_name and trang_thai = 'thanh_cong' and coalesce(odoo_ct, '') <> 'Đã xoá'
    returning id, odoo_tt)
  insert into odoo_su_kien (don_id, loai, noi_dung, du_lieu, nguoi)
  select u.id, 'odoo_tt', 'Odoo không còn phiếu này (đã xoá thẳng trên Odoo) — app bỏ theo: không tính đang về, trả lại hàng giữ',
         jsonb_build_object('tt', u.odoo_tt, 'ct', 'Đã xoá', 'dong_dck_bo', v_dck, 'dong_tra_giu', v_tra), 'he_thong'
  from u;
  get diagnostics v_don = row_count;
  return jsonb_build_object('ok', true, 'dck', v_dck, 'tra_giu', v_tra, 'don', v_don);
end $$;
revoke all on function chiahang._fn_odoo_da_xoa(text) from public, anon, authenticated;

-- _fn_odoo_pk_xu_ly: chỉ đếm "không thấy" khi Odoo trả success + data; đủ 2 lần liền -> _fn_odoo_da_xoa
do $do$
declare d text;
  o1 text := E'  else\n    select coalesce(jsonb_agg(t), ''[]''::jsonb) into v_thay';
  n1 text := E'  elsif coalesce(j->>''status'', '''') = ''success'' and jsonb_typeof(j->''data'') = ''array'' then   -- NEW - 282: API lỗi KHÔNG tính là không thấy\n    select coalesce(jsonb_agg(t), ''[]''::jsonb) into v_thay';
  o2 text := E'    on conflict (name) do update set lay_luc = now(), khong_thay = o.khong_thay + 1;\n';
  n2 text := E'    on conflict (name) do update set lay_luc = now(), khong_thay = o.khong_thay + 1;\n'
          || E'    -- NEW - 282: hỏi theo tên 2 lần liền không thấy -> Odoo đã xoá phiếu -> app bỏ theo\n'
          || E'    perform _fn_odoo_da_xoa(op.name) from odoo_phieu op\n'
          || E'    where op.name in (select jsonb_array_elements_text(v_thay)) and op.khong_thay >= 2;\n';
begin
  d := pg_get_functiondef('chiahang._fn_odoo_pk_xu_ly'::regproc);
  if (length(d) - length(replace(d, o1, ''))) / length(o1) <> 1 or (length(d) - length(replace(d, o2, ''))) / length(o2) <> 1 then
    raise exception '_fn_odoo_pk_xu_ly: mốc không duy nhất'; end if;
  execute replace(replace(d, o1, n1), o2, n2);
end $do$;

-- fn_dck_don (GAS gọi sau mỗi lượt syncDieuChuyen): chốt an toàn SQL 201 đang đếm cả ~66.700 dòng PDCK (KHÔNG đến từ Sheet)
--   là "dòng cũ" -> lượt nào cũng thấy "đọc ít hơn số cũ" -> bỏ qua, KHÔNG dọn gì (vì vậy SQL 280 chưa có tác dụng).
--   Sửa: chỉ đếm + dọn đúng các phiếu Sheet quản lý (tiền tố DK/KC/HM/DP/DS/DSK/DSC — trùng RE_PHIEU_APP trong GAS).
--   Giữ nguyên: chốt an toàn 201, che dòng API Odoo trong 7 ngày (228), dọn phiếu Odoo đã xoá (280).
create or replace function chiahang.fn_dck_don(p_truoc timestamptz)
returns integer language plpgsql security definer set search_path = chiahang, public as $$
declare v_moi int; v_cu int; v_xoa int;
  v_re constant text := '^(DK|KC|HM|DP|DSK|DSC|DS)[0-9]{8}-';   -- NEW - 282: đúng phạm vi GAS đọc từ Sheet
begin
  select count(*) filter (where synced_at >= p_truoc), count(*) filter (where synced_at < p_truoc)
    into v_moi, v_cu from dieu_chuyen_kho where ma_phieu ~ v_re;
  if v_cu > 0 and v_moi < v_cu then
    return -v_cu;              -- lượt này đọc quá ít so với dữ liệu đang có -> giữ nguyên, không dọn
  end if;
  delete from dieu_chuyen_kho d where d.ma_phieu ~ v_re and d.synced_at < p_truoc
    and (d.api_luc is null or d.api_luc < now() - interval '7 days'        -- NEW - 228: dòng API Odoo quản lý thì chừa
         or (d.synced_at < now() - interval '2 hours'                       -- NEW - 280: trừ khi Odoo đã xoá phiếu
             and exists (select 1 from odoo_phieu op where op.name = d.ma_phieu
                           and op.khong_thay >= 2 and op.lay_luc > d.api_luc + interval '1 minute')));
  get diagnostics v_xoa = row_count;
  return v_xoa;
end $$;

-- Xử lý ngay 11 phiếu đã xác nhận KHÔNG còn trên Odoo (API hỏi theo tên lúc 16:17 ngày 25/11 chỉ thấy phiếu đối chứng)
select n phieu, chiahang._fn_odoo_da_xoa(n) ket_qua
from unnest(array['DK20261119-TP05006-DB06005-02','DK20261119-TP05002-DB06005-01','DK20261119-PK05001-DB06005-03',
                  'DK20261119-TP05002-CH05060-06','HM20261123-TP05006-CH01002-1','HM20261123-TP05006-CH01008-1',
                  'HM20261123-TP05006-CH01009-1','HM20261123-TP05006-CH01011-1','HM20261123-TP05006-CH01013-1',
                  'HM20261123-TP05006-CH01016-1','HM20261123-TP05006-DB06015-4']) n;
