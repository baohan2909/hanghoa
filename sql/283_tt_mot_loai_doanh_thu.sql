-- NEW - 283: MỘT LOẠI DOANH THU DUY NHẤT CHO MỌI NƠI (anh chốt 25/11)
--   Doanh thu = giá bán sau giảm của shop (giá niêm yết − shop giảm), chỉ đơn hợp lệ — ĐÚNG BẰNG doanh thu đơn TikTok trên Nhanh
--   (đối chiếu 24/11: 898 / 898 đơn khớp từng đồng) và báo cáo Online.
--   Bỏ hẳn số "TikTok đếm" (GMV TikTok tự thống kê: tiền khách trả, có cả đơn huỷ). LIVE / Video tính lại từ ĐƠN:
--     live_nb / video_nb / live_top / video_top: đơn, SL, doanh thu lấy từ dòng đơn (theo phòng LIVE room_id / video nd_id);
--     chỉ giữ số KHÔNG phải tiền từ TikTok: số phiên, người xem, lượt xem, tiêu đề.
--   fn_tt_theo_doi: bỏ tiền / SL / đơn TikTok của LIVE / video (màn dùng tong.dt_live / dt_video tính từ đơn).
do $do$
declare d text; a int; b int;
  o1 text := $$    select l.ma_don, coalesce(l.ma_me, l.seller_sku, '?') ma,$$;
  n1 text := $$    select l.ma_don, l.sku_id, coalesce(l.ma_me, l.seller_sku, '?') ma,$$;
  o2 text := E'  chn as (select ma_ch, count(*) so_nb from (select distinct ma_ch, nb from dt where ma_ch <> '''') x group by ma_ch)\n';
  n2 text := E'  chn as (select ma_ch, count(*) so_nb from (select distinct ma_ch, nb from dt where ma_ch <> '''') x group by ma_ch),\n'
    || E'  -- NEW - 283: LIVE / Video tính từ ĐƠN (cùng 1 loại doanh thu) — gắn phòng LIVE / video theo từng dòng đơn\n'
    || E'  kd as materialized (\n'
    || E'    select dt.nb, dt.kenh, dt.ma_don, dt.sl_ban, dt.la_huy, dt.dtl, dd.room_id, dd.nd_id\n'
    || E'    from dt join tt_don_dong dd on dd.ma_don = dt.ma_don and dd.sku_id = dt.sku_id\n'
    || E'    where dt.kenh in (''live'', ''video'')),\n'
    || E'  lvp as (   -- phiên LIVE: chỉ lấy số phiên / người xem của TikTok, KHÔNG lấy tiền\n'
    || E'    select lower(l.username) nbu, count(*) so_phien, sum(l.nguoi_xem) xem\n'
    || E'    from tt_live l left join tt_creator c on c.handle = l.username\n'
    || E'    where l.ngay between (v_loc->>''tu'')::date and (v_loc->>''den'')::date and l.username is not null\n'
    || E'      and (coalesce(jsonb_typeof(v_loc->''nb''), '''') <> ''array'' or l.username in (select jsonb_array_elements_text(v_loc->''nb'')))\n'
    || E'      and (coalesce(jsonb_typeof(v_loc->''ch''), '''') <> ''array'' or coalesce(c.ma_ch, '''') in (select jsonb_array_elements_text(v_loc->''ch'')))\n'
    || E'    group by 1),\n'
    || E'  vdm as (   -- video: chỉ lấy tiêu đề / lượt xem / sản phẩm của TikTok, KHÔNG lấy tiền\n'
    || E'    select v.video_id, lower(max(v.username)) nbu, max(v.tieu_de) tieu_de, max(v.dang_luc) dang_luc, sum(v.luot_xem) xem,\n'
    || E'           max(v.san_pham::text)::jsonb san_pham\n'
    || E'    from tt_video_ngay v where v.ngay between (v_loc->>''tu'')::date and (v_loc->>''den'')::date group by v.video_id)\n';
  o3 text := $$    'video_nb', (select coalesce(jsonb_object_agg(username$$;
  o4 text := $$    'tk', (select jsonb_build_object('video_den'$$;
  n34 text :=
       E'    -- NEW - 283: người bán × LIVE / video — đơn, SL, doanh thu TỪ ĐƠN; số phiên / video / người xem từ TikTok\n'
    || E'    ''video_nb'', (select coalesce(jsonb_object_agg(coalesce(o.nb, p.nbu), jsonb_build_object(''so_video'', coalesce(o.so_video, 0), ''don'', coalesce(o.don, 0),\n'
    || E'        ''sl'', coalesce(o.sl, 0), ''dt'', coalesce(o.dt, 0), ''xem'', coalesce(p.xem, 0))), ''{}''::jsonb)\n'
    || E'      from (select nb, count(distinct nd_id) filter (where not la_huy) so_video, count(distinct ma_don) filter (where not la_huy) don,\n'
    || E'                   coalesce(sum(sl_ban), 0) sl, round(coalesce(sum(dtl), 0)) dt\n'
    || E'            from kd where kenh = ''video'' and nb <> '''' group by nb) o\n'
    || E'      left join (select nbu, sum(xem) xem from vdm where nbu is not null group by nbu) p on p.nbu = o.nb),\n'
    || E'    ''live_nb'', (select coalesce(jsonb_object_agg(coalesce(o.nb, p.nbu), jsonb_build_object(''so_phien'', coalesce(p.so_phien, 0), ''don'', coalesce(o.don, 0),\n'
    || E'        ''sl'', coalesce(o.sl, 0), ''dt'', coalesce(o.dt, 0), ''xem'', coalesce(p.xem, 0))), ''{}''::jsonb)\n'
    || E'      from (select nb, count(distinct ma_don) filter (where not la_huy) don, coalesce(sum(sl_ban), 0) sl, round(coalesce(sum(dtl), 0)) dt\n'
    || E'            from kd where kenh = ''live'' and nb <> '''' group by nb) o\n'
    || E'      full join lvp p on p.nbu = o.nb\n'
    || E'      where coalesce(o.nb, p.nbu) is not null),\n'
    || E'    ''video_top'', (select coalesce(jsonb_agg(x order by x.dt desc), ''[]''::jsonb) from (\n'
    || E'        select o.nd_id video_id, o.nb username, m.tieu_de, m.dang_luc, o.don, o.sl, o.dt, m.xem, m.san_pham, c.ma_ch, ch.ten ten_ch\n'
    || E'        from (select nd_id, max(nb) nb, count(distinct ma_don) filter (where not la_huy) don, coalesce(sum(sl_ban), 0) sl,\n'
    || E'                     round(coalesce(sum(dtl), 0)) dt\n'
    || E'              from kd where kenh = ''video'' and nd_id is not null group by nd_id) o\n'
    || E'        left join vdm m on m.video_id = o.nd_id\n'
    || E'        left join tt_creator c on c.handle = o.nb left join cua_hang ch on ch.ma_ch = c.ma_ch\n'
    || E'        where o.don > 0) x),\n'
    || E'    ''live_top'', (select coalesce(jsonb_agg(x order by x.dt desc), ''[]''::jsonb) from (\n'
    || E'        select l.id, l.username, l.tieu_de, l.bat_dau, l.ket_thuc, coalesce(o.don, 0) don, coalesce(o.sl, 0) sl, coalesce(o.dt, 0) dt,\n'
    || E'          l.khach, l.so_sp, l.nguoi_xem xem, c.ma_ch, ch.ten ten_ch\n'
    || E'        from tt_live l left join tt_creator c on c.handle = l.username left join cua_hang ch on ch.ma_ch = c.ma_ch\n'
    || E'        left join (select room_id, count(distinct ma_don) filter (where not la_huy) don, coalesce(sum(sl_ban), 0) sl,\n'
    || E'                          round(coalesce(sum(dtl), 0)) dt\n'
    || E'                   from kd where kenh = ''live'' and room_id is not null group by room_id) o on o.room_id = l.id\n'
    || E'        where l.ngay between (v_loc->>''tu'')::date and (v_loc->>''den'')::date\n'
    || E'          and (coalesce(jsonb_typeof(v_loc->''nb''), '''') <> ''array'' or l.username in (select jsonb_array_elements_text(v_loc->''nb'')))\n'
    || E'          and (coalesce(jsonb_typeof(v_loc->''ch''), '''') <> ''array'' or coalesce(c.ma_ch, '''') in (select jsonb_array_elements_text(v_loc->''ch'')))\n'
    || E'        ) x),\n';
  o5 text := $$  v_khoa := md5(v_loc::text);$$;
  n5 text := $$  v_khoa := md5(v_loc::text || '|283');   -- NEW - 283: khoá mới, bỏ bản nhớ tính theo cách cũ$$;
  -- fn_tt_theo_doi
  o6 text := E'          (select jsonb_build_object(''phien'', count(*), ''dt'', coalesce(round(sum(gmv)), 0), ''sl'', coalesce(sum(sl), 0),\n'
          || E'                    ''xem'', coalesce(sum(nguoi_xem), 0), ''don'', coalesce(sum(sku_orders), 0))\n';
  n6 text := E'          (select jsonb_build_object(''phien'', count(*), ''xem'', coalesce(sum(nguoi_xem), 0))   -- NEW - 283: tiền LIVE lấy từ đơn (tong.dt_live)\n';
  o7 text := E'          (select jsonb_build_object(''so'', count(distinct video_id) filter (where sku_orders > 0), ''dt'', coalesce(round(sum(gmv)), 0),\n'
          || E'                    ''sl'', coalesce(sum(sl), 0), ''xem'', coalesce(sum(luot_xem), 0))\n';
  n7 text := E'          (select jsonb_build_object(''xem'', coalesce(sum(luot_xem), 0))   -- NEW - 283: tiền Video lấy từ đơn (tong.dt_video)\n';
  f text;
begin
  d := pg_get_functiondef('chiahang.fn_tt_bao_cao'::regproc);
  foreach f in array array[o1, o2, o3, o4, o5] loop
    if (length(d) - length(replace(d, f, ''))) / length(f) <> 1 then raise exception 'fn_tt_bao_cao: mốc không duy nhất: %', left(f, 60); end if;
  end loop;
  d := replace(replace(replace(d, o1, n1), o2, n2), o5, n5);
  a := strpos(d, o3); b := strpos(d, o4);
  if a = 0 or b <= a then raise exception 'fn_tt_bao_cao: không tìm thấy khối LIVE / video'; end if;
  d := substr(d, 1, a - 1) || n34 || substr(d, b);
  execute d;

  d := pg_get_functiondef('chiahang.fn_tt_theo_doi'::regproc);
  foreach f in array array[o6, o7] loop
    if (length(d) - length(replace(d, f, ''))) / length(f) <> 1 then raise exception 'fn_tt_theo_doi: mốc không duy nhất: %', left(f, 60); end if;
  end loop;
  execute replace(replace(d, o6, n6), o7, n7);
end $do$;
