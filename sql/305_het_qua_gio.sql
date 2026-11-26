-- ============================================================================
-- NEW - 305: BỚT LỖI "canceling statement due to statement timeout" (anh báo 26/11 15:01 — "app rất hay bị nhiều nơi")
--   Nguyên nhân (đo 24 giờ qua, nhật ký máy chủ):
--     1) App gọi máy chủ bằng khoá công khai → mỗi lệnh chỉ được 3 giây. Lúc máy chủ bận (đầu giờ :00 :05 :10…, 3 lịch chạy ngầm
--        tq_lam_moi ~18 giây + odoo_pk_quet ~8 giây + ma_xs_lam_moi ~5 giây chạy CÙNG LÚC trên máy chủ 2 nhân; 8h–9h sáng
--        cửa hàng mở app đồng loạt) → lệnh bình thường 0,3–1 giây bị đẩy quá 3 giây → huỷ → màn báo lỗi.
--     2) fn_tq_doc (Tổng quan, 37 lỗi/ngày): bộ đệm vừa quá 5 phút đúng lúc lịch tq_lam_moi đang tính lại → màn tự tính chen
--        rồi đứng chờ khoá dòng của lịch tới ~18 giây.
--     3) fn_ai_so_lieu (sổ số liệu SIÊU TRÍ TUỆ): lần tính đầu cần ~25–35 giây (báo cáo online tháng) > giới hạn 8 giây
--        → 17/17 lần hỏng, chưa từng lưu được → mỗi câu hỏi AI lại đốt 8 giây máy chủ vô ích.
--   Sửa (không đổi lịch chạy, không đổi số liệu):
--     a) Các hàm hay quá giờ được giới hạn riêng (cùng cách fn_nh_bao_cao / fn_tt_bao_cao đang dùng): màn xem 20 giây, nạp dữ liệu 60 giây.
--     b) fn_tq_doc: bộ đệm cũ ≤ 15 phút thì trả ngay (lịch 5 phút/lần sẽ tính lại), không tính chen; lưu bộ đệm không chờ khoá.
--     c) fn_ai_so_lieu: cho 60 giây để tính xong & lưu 15 phút; đang có lượt khác tính thì trả bản gần nhất, không tính chồng.
--     d) (Nhận hàng — anh hỏi 15:07, ca Năm Căn bấm nhận khi hàng còn ở kho GHTK) phiếu có vận đơn mà GHTK chưa tới bước
--        "Đang giao hàng" thì cửa hàng chưa bấm nhận được; Quản trị vẫn nhận thay được.
--   App (3.163.0): lệnh nào vẫn quá giờ thì tự thử lại 2 lần (sau 1,5 giây và 4 giây) trước khi báo lỗi.
-- ============================================================================

-- a) Giới hạn riêng cho các hàm hay quá giờ (24 giờ qua)
alter function chiahang.fn_tq_doc(text, integer) set statement_timeout = '20s';
alter function chiahang.fn_tq_ma_van_de(text) set statement_timeout = '30s';
alter function chiahang.fn_tq_cao_cap_ngay(date, date, integer) set statement_timeout = '20s';
alter function chiahang.fn_goi_y_chia_hang(text, date, date, integer) set statement_timeout = '20s';
alter function chiahang.fn_ds_tong_quan_nhanh(integer, integer, integer, integer, boolean) set statement_timeout = '20s';
alter function chiahang.fn_ds_chia_doi(text, integer) set statement_timeout = '20s';
alter function chiahang.fn_ol_du_lieu(uuid, boolean) set statement_timeout = '20s';
alter function chiahang.fn_odoo_tong_quan(uuid, jsonb) set statement_timeout = '20s';
alter function chiahang.fn_odoo_don_ds(uuid, jsonb) set statement_timeout = '20s';
alter function chiahang.fn_odoo_don_ct(uuid, bigint) set statement_timeout = '20s';
alter function chiahang.fn_odoo_lam_moi(uuid) set statement_timeout = '20s';
alter function chiahang.fn_rt_ban_24h(integer) set statement_timeout = '20s';
alter function chiahang.fn_ks_ds() set statement_timeout = '20s';
alter function chiahang.fn_ai_van_de_xem(uuid, boolean) set statement_timeout = '20s';
alter function chiahang.fn_canh_bao(text, text, date, date) set statement_timeout = '20s';
alter function chiahang.fn_dck_don(timestamptz) set statement_timeout = '20s';
alter function chiahang.fn_tt_bao_cao(uuid, jsonb) set statement_timeout = '60s';
-- nạp dữ liệu (GAS / máy chủ gửi lên): hỏng là mất lượt đồng bộ → 60 giây
alter function chiahang.fn_tt_nap_api(jsonb, jsonb) set statement_timeout = '60s';
alter function chiahang.fn_tt_video_nap(date, jsonb) set statement_timeout = '60s';
alter function chiahang.fn_tt_live_nap(jsonb) set statement_timeout = '60s';
alter function chiahang.fn_tt_doi_soat_nap(jsonb) set statement_timeout = '60s';
alter function chiahang.fn_thung_nap(jsonb) set statement_timeout = '60s';
alter function chiahang.fn_dong_bo_tai_khoan(jsonb, text) set statement_timeout = '60s';
alter function chiahang.fn_ai_so_lieu(uuid, boolean) set statement_timeout = '60s';

-- b) Tổng quan: không tính chen khi lịch đang tính lại, không đứng chờ khoá
create or replace function chiahang.fn_tq_doc(p_khoi text, p_han_giay integer default 300)
returns jsonb language plpgsql security definer
set search_path to 'chiahang', 'public' set statement_timeout to '20s'
as $function$
declare r record; v jsonb; v_co boolean;
begin
  select * into r from tq_cache where khoi = p_khoi;
  v_co := found;
  if v_co and now() - r.tinh_luc < make_interval(secs => p_han_giay) then
    return jsonb_build_object('du_lieu', r.du_lieu, 'tinh_luc', r.tinh_luc, 'cu', false);
  end if;
  -- NEW - 305: bộ đệm cũ ≤ hạn + 10 phút → trả ngay (lịch tq_lam_moi 5 phút/lần đang / sắp tính lại)
  if v_co and now() - r.tinh_luc < make_interval(secs => p_han_giay + 600) then
    return jsonb_build_object('du_lieu', r.du_lieu, 'tinh_luc', r.tinh_luc, 'cu', false);
  end if;

  begin
    v := case p_khoi
           when 'tong_quan' then fn_tong_quan()
           when 'san_pham'  then fn_tq_sanpham_tinh()
           when 'cao_cap'   then fn_tq_cao_cap()
           when 'chuoi'     then fn_tq_chuoi(30)
           when 'bieu_do'   then fn_tq_bieudo(90)
           else null end;
    if v is null then
      return jsonb_build_object('du_lieu', null, 'loi', 'Khối không hợp lệ: ' || p_khoi);
    end if;
    begin   -- NEW - 305: lịch đang ghi dòng này → bỏ qua lưu, không chờ
      perform set_config('lock_timeout', '500ms', true);
      insert into tq_cache (khoi, du_lieu, tinh_luc) values (p_khoi, v, now())
      on conflict (khoi) do update set du_lieu = excluded.du_lieu, tinh_luc = now();
    exception when lock_not_available then null;
    end;
    return jsonb_build_object('du_lieu', v, 'tinh_luc', now(), 'cu', false);
  exception when others then
    if v_co then
      return jsonb_build_object('du_lieu', r.du_lieu, 'tinh_luc', r.tinh_luc, 'cu', true, 'loi', sqlerrm);
    end if;
    return jsonb_build_object('du_lieu', null, 'loi', sqlerrm);
  end;
end $function$;

-- c) Sổ số liệu AI: không tính chồng
do $do$
declare d text;
  o text := $q$v_khoa := 'so_lieu|' || coalesce(u->>'ma', '?');$q$;
  n text := $q$v_khoa := 'so_lieu|' || coalesce(u->>'ma', '?');
  -- NEW - 305: đang có lượt khác tính cùng sổ (lần đầu mất ~30 giây) → không tính chồng, trả bản gần nhất trong ngày
  if not pg_try_advisory_xact_lock(hashtext(v_khoa)) then
    select * into c from ai_so_lieu where khoa = v_khoa;
    if found and (c.luc at time zone 'Asia/Ho_Chi_Minh')::date = v_hn then
      return c.kq || jsonb_build_object('luc', c.luc, 'tuoi_phut', round(extract(epoch from now() - c.luc) / 60), 'dang_tinh_lai', true);
    end if;
    return jsonb_build_object('dang_tinh', true, 'ngay', v_hn,
      'loi', jsonb_build_array('Sổ số liệu hôm nay đang được tính (lần đầu mất khoảng nửa phút) — dùng công cụ để lấy số'));
  end if;$q$;
begin
  d := pg_get_functiondef('chiahang.fn_ai_so_lieu'::regproc);
  if position('NEW - 305' in d) > 0 then return; end if;
  if (length(d) - length(replace(d, o, ''))) / length(o) <> 1 then raise exception 'fn_ai_so_lieu: mốc'; end if;
  execute replace(d, o, n);
end $do$;

-- d) Nhận hàng: GHTK chưa tới bước "Đang giao hàng" → cửa hàng chưa nhận được (Quản trị vẫn nhận thay)
do $do$
declare d text;
  o1 text := $q$declare c jsonb; p record; n record;$q$;
  n1 text := $q$declare v_vd record; c jsonb; p record; n record;$q$;
  o2 text := $q$select * into n from odoo_nhan x where x.name = p_name order by x.tao_luc desc limit 1;$q$;
  n2 text := $q$select * into n from odoo_nhan x where x.name = p_name order by x.tao_luc desc limit 1;
  -- NEW - 305: vận đơn GHTK của phiếu (bỏ vận đơn đã gỡ / đã huỷ); "toi" = đã tới bước Đang giao / Đã giao / Đối soát / Delay giao
  select count(*) so, count(*) filter (where g.status_id in (4, 5, 6, 9, 10)) toi,
         max(g.status_text) filter (where g.status_id not in (4, 5, 6, 9, 10)) tt, max(g.cap_nhat_luc) luc
    into v_vd
  from van_don_phieu vp join van_don_ghtk g on g.label_id = vp.label_id
  where vp.ma_phieu = p_name and coalesce(vp.do_tin, '') <> 'GO' and coalesce(g.status_id, 0) <> -1;$q$;
  o3 text := $q$    when n.trang_thai = 'dang_gui' and n.tao_luc$q$;
  n3 text := $q$    when v_vd.so > 0 and v_vd.toi = 0 and not coalesce((u->>'admin')::boolean, false)   -- NEW - 305
      then 'Hàng đang trên đường — GHTK báo "' || coalesce(v_vd.tt, 'chưa giao') || '"'
           || coalesce(' (cập nhật ' || to_char(v_vd.luc at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM') || ')', '')
           || '. Chỉ bấm nhận khi hàng đã tới; hàng tới rồi mà vẫn báo vậy thì liên hệ phòng Điều Phối'
    when n.trang_thai = 'dang_gui' and n.tao_luc$q$;
  o4 text := $q$'phan_con', v_pc,$q$;
  n4 text := $q$'phan_con', v_pc, 'van_don', jsonb_build_object('so', v_vd.so, 'toi', v_vd.toi, 'tt', v_vd.tt),   -- NEW - 305$q$;
begin
  d := pg_get_functiondef('chiahang._fn_odoo_nhan_tt'::regproc);
  if position('NEW - 305' in d) > 0 then return; end if;
  if (length(d) - length(replace(d, o1, ''))) / length(o1) <> 1 then raise exception '_fn_odoo_nhan_tt: mốc 1'; end if;
  if (length(d) - length(replace(d, o2, ''))) / length(o2) <> 1 then raise exception '_fn_odoo_nhan_tt: mốc 2'; end if;
  if (length(d) - length(replace(d, o3, ''))) / length(o3) <> 1 then raise exception '_fn_odoo_nhan_tt: mốc 3'; end if;
  if (length(d) - length(replace(d, o4, ''))) / length(o4) <> 1 then raise exception '_fn_odoo_nhan_tt: mốc 4'; end if;
  execute replace(replace(replace(replace(d, o1, n1), o2, n2), o3, n3), o4, n4);
end $do$;

notify pgrst, 'reload schema';
