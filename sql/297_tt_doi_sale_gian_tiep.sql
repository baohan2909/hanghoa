-- ============================================================================
-- NEW - 297: theo chốt của anh 26/11
--   1) Gán cửa hàng đúng: hangxanh.nonson → Pasteur · lythuongkiet2.nonson → Nguyễn Thị Thập 2 · nonsonphanvantri.ns → Võ Văn Ngân
--      · travinhhai.nonson → Trà Vinh 2 · dbbienhoabon.nonson → Đội sale 08. Tên hiển thị "Nón Sơn - Đội sale NN" cho ID đội sale.
--   2) Đơn TikTok không ghi tài khoản nào = mua thẳng từ tài khoản chính thoitrangnonson (cũng là kho) → gán thoitrangnonson,
--      kênh Trưng bày, nguồn ID 'shop_chinh' (phân biệt với trưng bày thật của thoitrangnonson).
--   3) Gián tiếp (khách xem LIVE / video rồi mua sau) vẫn tính vào LIVE / Video, nhưng tách số riêng để phân tích:
--      _fn_tt_dong thêm cột gt; báo cáo người bán + Theo dõi + tổng có dt_live_gt / dt_video_gt / dt_the.
--   4) Bán online (Nhanh): đơn hoàn (71/72/74) và giao thất bại (61) KHÔNG tính doanh thu / SL bán (vẫn đếm riêng ở mục hoàn).
--      TikTok vốn đã trừ phần trả hàng (doanh thu × phần còn lại sau trả).
--   5) Thẻ Đội sale: fn_tt_doi_sale — mỗi đội = các ID gán vào đội (DOISALEnn), doanh thu / TB ngày / LIVE / Video / Trưng bày,
--      so kỳ trước, theo ngày, từng ID.
-- ============================================================================

-- 1) Gán cửa hàng
update chiahang.tt_creator c set ma_ch = v.ma, loai = v.loai, tu_dong = false, cap_nhat_luc = now(),
  ghi_chu = 'Anh chốt 26/11 (khớp file kế toán)'
from (values ('hangxanh.nonson', 'CH05013', 'CH'), ('lythuongkiet2.nonson', 'CH05080', 'CH'), ('nonsonphanvantri.ns', 'CH05071', 'CH'),
             ('travinhhai.nonson', 'CH06067', 'CH'), ('dbbienhoabon.nonson', 'DOISALE08', 'DOISALE')) v(h, ma, loai)
where c.handle = v.h;

update chiahang.tt_creator c set ten = v.ten, cap_nhat_luc = now()
from (values ('doisale1', 'Nón Sơn - Đội sale 01'), ('doisaleso02', 'Nón Sơn - Đội sale 02'), ('doisaleso3', 'Nón Sơn - Đội sale 03'),
             ('doisaleso03', 'Nón Sơn - Đội sale 03'), ('doisaleso4', 'Nón Sơn - Đội sale 04'), ('nonson.doisale05', 'Nón Sơn - Đội sale 05'),
             ('doisale06.nonson', 'Nón Sơn - Đội sale 06'), ('dbbienhoabon.nonson', 'Nón Sơn - Đội sale 08'), ('doisale09', 'Nón Sơn - Đội sale 09'),
             ('nonson.doisale10', 'Nón Sơn - Đội sale 10'), ('doisale11', 'Nón Sơn - Đội sale 11'), ('doisaleso11', 'Nón Sơn - Đội sale 11'),
             ('doisaleso12', 'Nón Sơn - Đội sale 12'), ('nonson.doisale13', 'Nón Sơn - Đội sale 13'), ('doisaleso14', 'Nón Sơn - Đội sale 14'),
             ('doisaleso15', 'Nón Sơn - Đội sale 15'), ('doisaleso18', 'Nón Sơn - Đội sale 18'), ('doisaleso19', 'Nón Sơn - Đội sale 19'),
             ('doisaleso20', 'Nón Sơn - Đội sale 20'), ('doisaleso21', 'Nón Sơn - Đội sale 21'), ('doisaleso24', 'Nón Sơn - Đội sale 24')) v(h, ten)
where c.handle = v.h and c.ten is null;

-- 2) Gán ID: không tài khoản → thoitrangnonson
create or replace function chiahang._fn_tt_gan_ar(p_don text[] default null::text[])
returns integer language plpgsql security definer set search_path to chiahang, public as $$
declare v_n int;
begin
  update tt_don_dong l set
      creator      = x.nb,
      kenh         = x.kenh,
      nb_gian_tiep = x.gian_tiep,
      tai_khoan    = x.tai_khoan,
      nb_nguon     = case when x.mac_dinh then 'shop_chinh' else 'bao_cao' end,   -- NEW - 297
      nd_id        = coalesce(x.nd_id, l.nd_id)
    from (select a.ma_don, a.sku_id, a.tai_khoan,
                 case a.nd_loai when 'LIVE' then 'live' when 'VIDEO' then 'video' else 'the' end kenh,   -- NEW - 295: theo loại nội dung
                 coalesce(t.nb, 'thoitrangnonson') nb,                                                   -- NEW - 297: không tài khoản = tài khoản chính
                 t.nb is null mac_dinh,
                 case when a.ghi_nhan = 'INDIRECT' then t.nb end gian_tiep,                              -- NEW - 295: đánh dấu gián tiếp
                 nullif(coalesce(nullif(a.video_id, ''), nullif(a.room_id, '')), '') nd_id
            from tt_ar_dong a
            join tt_don d on d.ma_don = a.ma_don
            left join tt_lk_dong k on k.ma_don = a.ma_don and k.sku_id = a.sku_id
            -- NEW - 295: tài khoản TikTok ghi nhận (trực tiếp / gián tiếp), tên theo ngày đặt; thiếu tên → API liên kết
            cross join lateral (select coalesce(_fn_tt_ten_tk(a.open_id, a.room_id, a.video_id, d.ngay),
                                                case when a.nguon_don = 'AFFILIATE' then lower(k.creator) end) nb) t
           where (p_don is null or a.ma_don = any(p_don))) x
   where l.ma_don = x.ma_don and l.sku_id = x.sku_id
     and coalesce(l.nb_nguon, '') <> 'excel'
     and (l.creator is distinct from x.nb or l.kenh is distinct from x.kenh or l.nb_gian_tiep is distinct from x.gian_tiep
          or l.tai_khoan is distinct from x.tai_khoan
          or l.nb_nguon is distinct from case when x.mac_dinh then 'shop_chinh' else 'bao_cao' end);
  get diagnostics v_n = row_count;
  perform _fn_tt_dau_don(p_don);
  update tt_don d set creator = null, kenh = x.kenh
    from (select ma_don, max(kenh) kenh from tt_don_dong where (p_don is null or ma_don = any(p_don))
          group by 1 having count(creator) = 0) x
   where d.ma_don = x.ma_don and d.nguon = 'api' and (d.creator is not null or d.kenh is distinct from x.kenh);

  insert into tt_creator (handle, ma_ch, loai, tu_dong)
  select n.h, g.ma_ch, case when g.ma_ch like 'DOISALE%' then 'DOISALE' when g.ma_ch is not null then 'CH' end, true
  from (select distinct creator h from tt_don_dong l where creator is not null and nb_nguon = 'bao_cao'
          and (p_don is null or l.ma_don = any(p_don))
          and not exists (select 1 from tt_creator c where c.handle = l.creator)) n
  cross join lateral (select _fn_tt_goi_y(n.h) ma_ch) g
  on conflict (handle) do nothing;
  return v_n;
end $$;
revoke all on function chiahang._fn_tt_gan_ar(text[]) from public, anon, authenticated;

-- 3a) _fn_tt_dong thêm cột gt (dòng gián tiếp)
do $do$
declare d text;
  o1 text := 'hs numeric)';
  n1 text := 'hs numeric, gt boolean)';
  o2 text := E'::numeric / l.so_luong end\n  from p';
  n2 text := E'::numeric / l.so_luong end,\n    l.nb_gian_tiep is not null   -- NEW - 297: dòng gián tiếp (xem LIVE / video rồi mua sau)\n  from p';
begin
  d := pg_get_functiondef('chiahang._fn_tt_dong'::regproc);
  if position('gt boolean' in d) > 0 then return; end if;
  if position(o1 in d) = 0 then raise exception '_fn_tt_dong: mốc 1'; end if;
  if position(o2 in d) = 0 then raise exception '_fn_tt_dong: mốc 2'; end if;
  drop function chiahang._fn_tt_dong(jsonb);
  execute replace(replace(d, o1, n1), o2, n2);
end $do$;
revoke all on function chiahang._fn_tt_dong(jsonb) from public, anon, authenticated;

-- 3b) fn_tt_bao_cao: tách gián tiếp + doanh thu trưng bày theo người bán và tổng
do $do$
declare d text; i int;
  o text[] := array[
    'l.thanh_toan, l.ly_do_huy, l.huy_boi,',
    $q$sum(dtl) filter (where kenh = 'video') dvd,$q$,
    $q$coalesce(round(sum(y.dvd)), 0) dt_video,$q$,
    $q$'khach_tra', coalesce(round(sum(kt)), 0),$q$];
  n text[] := array[
    'l.thanh_toan, l.ly_do_huy, l.huy_boi, l.gt,',
    $q$sum(dtl) filter (where kenh = 'video') dvd, sum(dtl) filter (where kenh = 'live' and gt) dlvg, sum(dtl) filter (where kenh = 'video' and gt) dvdg, sum(dtl) filter (where kenh = 'the') dth,$q$,
    $q$coalesce(round(sum(y.dvd)), 0) dt_video, coalesce(round(sum(y.dlvg)), 0) dt_live_gt, coalesce(round(sum(y.dvdg)), 0) dt_video_gt, coalesce(round(sum(y.dth)), 0) dt_the,   -- NEW - 297$q$,
    $q$'dt_live', coalesce(round(sum(dtl) filter (where kenh = 'live')), 0), 'dt_live_gt', coalesce(round(sum(dtl) filter (where kenh = 'live' and gt)), 0),
        'dt_video', coalesce(round(sum(dtl) filter (where kenh = 'video')), 0), 'dt_video_gt', coalesce(round(sum(dtl) filter (where kenh = 'video' and gt)), 0),
        'dt_the', coalesce(round(sum(dtl) filter (where kenh = 'the')), 0),   -- NEW - 297
        'khach_tra', coalesce(round(sum(kt)), 0),$q$];
begin
  d := pg_get_functiondef('chiahang.fn_tt_bao_cao'::regproc);
  if position('dt_live_gt' in d) > 0 then return; end if;
  for i in 1 .. array_length(o, 1) loop
    if (length(d) - length(replace(d, o[i], ''))) / length(o[i]) <> 1 then raise exception 'fn_tt_bao_cao: mốc % không đúng 1 lần', i; end if;
    d := replace(d, o[i], n[i]);
  end loop;
  execute d;
end $do$;

-- 3c) fn_tt_theo_doi: tách gián tiếp
do $do$
declare d text;
  o1 text := 'l.tao_luc, l.ten_sp, l.danh_muc,';
  n1 text := 'l.tao_luc, l.ten_sp, l.danh_muc, l.gt,';
  o2 text := $q$'dt_the', coalesce(round(sum(dtl) filter (where kenh not in ('live', 'video'))), 0))$q$;
  n2 text := $q$'dt_the', coalesce(round(sum(dtl) filter (where kenh not in ('live', 'video'))), 0),
              'dt_live_gt', coalesce(round(sum(dtl) filter (where kenh = 'live' and gt)), 0),   -- NEW - 297
              'dt_video_gt', coalesce(round(sum(dtl) filter (where kenh = 'video' and gt)), 0))$q$;
begin
  d := pg_get_functiondef('chiahang.fn_tt_theo_doi'::regproc);
  if position('dt_live_gt' in d) > 0 then return; end if;
  if (length(d) - length(replace(d, o1, ''))) / length(o1) <> 1 then raise exception 'fn_tt_theo_doi: mốc 1'; end if;
  if (length(d) - length(replace(d, o2, ''))) / length(o2) <> 1 then raise exception 'fn_tt_theo_doi: mốc 2'; end if;
  execute replace(replace(d, o1, n1), o2, n2);
end $do$;

-- 4) Bán online: đơn hoàn + giao thất bại không tính doanh thu / SL bán
do $do$
declare d text; i int; v_dem int;
  o text[] := array[
    $q$sum(dt) filter (where ttn <> 'huy')$q$,
    $q$sum(sl) filter (where ttn <> 'huy')$q$,
    $q$filter (where ttn <> 'huy' and co_gv)$q$,
    $q$coalesce(sum(sl), 0) sl, coalesce(round(sum(dt)), 0) dt, count(distinct don_id) don$q$,
    $q$coalesce(sum(sl) filter (where nhom = 'san'), 0) sl_san, coalesce(sum(sl) filter (where nhom = 'web'), 0) sl_web$q$,
    $q$select ma_me, ma, sum(sl) sl from xh group by 1, 2$q$,
    $q$select ngay, kenh, count(*) don, sum(sl) sl, round(sum(dt)) dt from od where ttn <> 'huy' group by 1, 2$q$,
    $q$select tinh, count(*) don, coalesce(round(sum(dt)), 0) dt,$q$,
    $q$round(sum(dt)) dt from od where ttn <> 'huy' group by gio$q$,
    $q$where o.kenh = 48 and o.ttn <> 'huy')$q$];
  n text[] := array[
    $q$sum(dt) filter (where ttn not in ('huy', 'hoan', 'tb'))$q$,
    $q$sum(sl) filter (where ttn not in ('huy', 'hoan', 'tb'))$q$,
    $q$filter (where ttn not in ('huy', 'hoan', 'tb') and co_gv)$q$,
    $q$coalesce(sum(sl) filter (where ttn not in ('hoan', 'tb')), 0) sl, coalesce(round(sum(dt) filter (where ttn not in ('hoan', 'tb'))), 0) dt, count(distinct don_id) filter (where ttn not in ('hoan', 'tb')) don$q$,
    $q$coalesce(sum(sl) filter (where nhom = 'san' and ttn not in ('hoan', 'tb')), 0) sl_san, coalesce(sum(sl) filter (where nhom = 'web' and ttn not in ('hoan', 'tb')), 0) sl_web$q$,
    $q$select ma_me, ma, sum(sl) filter (where ttn not in ('hoan', 'tb')) sl from xh group by 1, 2$q$,
    $q$select ngay, kenh, count(*) don, sum(sl) filter (where ttn not in ('hoan', 'tb')) sl, round(sum(dt) filter (where ttn not in ('hoan', 'tb'))) dt from od where ttn <> 'huy' group by 1, 2$q$,
    $q$select tinh, count(*) don, coalesce(round(sum(dt) filter (where ttn not in ('hoan', 'tb'))), 0) dt,$q$,
    $q$round(sum(dt) filter (where ttn not in ('hoan', 'tb'))) dt from od where ttn <> 'huy' group by gio$q$,
    $q$where o.kenh = 48 and o.ttn not in ('huy', 'hoan', 'tb'))$q$];
  toi_thieu int[] := array[5, 5, 2, 2, 1, 1, 1, 1, 1, 1];
begin
  d := pg_get_functiondef('chiahang.fn_nh_bao_cao'::regproc);
  if position($q$ttn not in ('huy', 'hoan', 'tb')$q$ in d) > 0 then return; end if;
  for i in 1 .. array_length(o, 1) loop
    v_dem := (length(d) - length(replace(d, o[i], ''))) / length(o[i]);
    if v_dem < toi_thieu[i] then raise exception 'fn_nh_bao_cao: mốc % chỉ thấy % lần', i, v_dem; end if;
    d := replace(d, o[i], n[i]);
  end loop;
  execute d;
end $do$;

-- 5) Thẻ Đội sale
create or replace function chiahang.fn_tt_doi_sale(p_token uuid, p_loc jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer
set search_path to chiahang, public set statement_timeout to '30s' set work_mem to '64MB' as $$
declare u jsonb; v_loc jsonb; v_truoc jsonb; v_h text[]; v_tu date; v_den date; v_n int; v_kq jsonb;
begin
  u := _fn_dt_u(p_token);
  if not coalesce((u->>'ql')::boolean, false) then raise exception 'Chỉ Điều phối / Quản trị xem được TikTok Shop'; end if;
  v_loc := _fn_tt_loc(p_loc) - 'nb' - 'ch' - 'bo_qua';
  v_tu := (v_loc->>'tu')::date; v_den := (v_loc->>'den')::date; v_n := v_den - v_tu + 1;
  select coalesce(array_agg(handle), '{}') into v_h from tt_creator where ma_ch like 'DOISALE%';
  v_loc := v_loc || jsonb_build_object('nb', to_jsonb(v_h));
  v_truoc := v_loc || jsonb_build_object('tu', v_tu - v_n, 'den', v_tu - 1);

  with tv as (select c.handle, c.ten, c.ma_ch, ch.ten ten_doi from tt_creator c join cua_hang ch on ch.ma_ch = c.ma_ch where c.ma_ch like 'DOISALE%'),
  dd as materialized (
    select l.nb, tv.ma_ch, l.ma_don, l.la_huy, l.sl_ban, l.kenh, l.gt, l.ngay, (l.tien_truoc_giam - coalesce(l.giam_shop, 0)) * l.hs dtl
    from _fn_tt_dong(v_loc) l join tv on tv.handle = l.nb where cardinality(v_h) > 0),
  tr as (
    select tv.ma_ch, count(distinct l.ma_don) filter (where not l.la_huy) don, coalesce(sum(l.sl_ban), 0) sl,
           coalesce(round(sum((l.tien_truoc_giam - coalesce(l.giam_shop, 0)) * l.hs)), 0) dt
    from _fn_tt_dong(v_truoc) l join tv on tv.handle = l.nb where cardinality(v_h) > 0 group by tv.ma_ch)
  select jsonb_build_object('tu', v_tu, 'den', v_den, 'so_ngay', v_n, 'tu_truoc', v_tu - v_n, 'den_truoc', v_tu - 1,
    'doi', coalesce((select jsonb_agg(x order by x.ma_ch) from (
        select g.ma_ch, max(g.ten_doi) ten,
          (select jsonb_agg(jsonb_build_object('handle', t2.handle, 'ten', t2.ten) order by t2.handle) from tv t2 where t2.ma_ch = g.ma_ch) ids,
          (select jsonb_build_object(
              'don', count(distinct ma_don) filter (where not la_huy), 'huy', count(distinct ma_don) filter (where la_huy),
              'sl', coalesce(sum(sl_ban), 0), 'dt', coalesce(round(sum(dtl)), 0),
              'live', coalesce(sum(sl_ban) filter (where kenh = 'live'), 0), 'video', coalesce(sum(sl_ban) filter (where kenh = 'video'), 0),
              'the', coalesce(sum(sl_ban) filter (where kenh not in ('live', 'video')), 0),
              'dt_live', coalesce(round(sum(dtl) filter (where kenh = 'live')), 0), 'dt_live_gt', coalesce(round(sum(dtl) filter (where kenh = 'live' and gt)), 0),
              'dt_video', coalesce(round(sum(dtl) filter (where kenh = 'video')), 0), 'dt_video_gt', coalesce(round(sum(dtl) filter (where kenh = 'video' and gt)), 0),
              'dt_the', coalesce(round(sum(dtl) filter (where kenh not in ('live', 'video'))), 0))
             from dd where dd.ma_ch = g.ma_ch) tong,
          (select jsonb_build_object('don', tr.don, 'sl', tr.sl, 'dt', tr.dt) from tr where tr.ma_ch = g.ma_ch) truoc,
          (select coalesce(jsonb_agg(jsonb_build_object('k', z.ngay, 'don', z.don, 'sl', z.sl, 'dt', z.dt) order by z.ngay), '[]'::jsonb)
             from (select ngay, count(distinct ma_don) filter (where not la_huy) don, coalesce(sum(sl_ban), 0) sl, coalesce(round(sum(dtl)), 0) dt
                   from dd where dd.ma_ch = g.ma_ch group by ngay) z) ngay,
          (select coalesce(jsonb_agg(jsonb_build_object('handle', z.nb, 'don', z.don, 'huy', z.huy, 'sl', z.sl, 'dt', z.dt,
                    'dt_live', z.dlv, 'dt_live_gt', z.dlvg, 'dt_video', z.dvd, 'dt_video_gt', z.dvdg, 'dt_the', z.dth) order by z.dt desc), '[]'::jsonb)
             from (select nb, count(distinct ma_don) filter (where not la_huy) don, count(distinct ma_don) filter (where la_huy) huy,
                          coalesce(sum(sl_ban), 0) sl, coalesce(round(sum(dtl)), 0) dt,
                          coalesce(round(sum(dtl) filter (where kenh = 'live')), 0) dlv, coalesce(round(sum(dtl) filter (where kenh = 'live' and gt)), 0) dlvg,
                          coalesce(round(sum(dtl) filter (where kenh = 'video')), 0) dvd, coalesce(round(sum(dtl) filter (where kenh = 'video' and gt)), 0) dvdg,
                          coalesce(round(sum(dtl) filter (where kenh not in ('live', 'video'))), 0) dth
                   from dd where dd.ma_ch = g.ma_ch group by nb) z) theo_id
        from tv g group by g.ma_ch) x), '[]'::jsonb),
    'doi_ds', coalesce((select jsonb_agg(jsonb_build_object('ma_ch', ma_ch, 'ten', ten) order by ma_ch) from cua_hang where ma_ch like 'DOISALE%'), '[]'::jsonb),
    'tat_ca', coalesce((select jsonb_agg(jsonb_build_object('handle', c.handle, 'ten', c.ten, 'loai', c.loai, 'ma_ch', c.ma_ch, 'ten_ch', ch.ten) order by c.handle)
        from tt_creator c left join cua_hang ch on ch.ma_ch = c.ma_ch), '[]'::jsonb)
  ) into v_kq;
  return v_kq;
end $$;
revoke all on function chiahang.fn_tt_doi_sale(uuid, jsonb) from public;
grant execute on function chiahang.fn_tt_doi_sale(uuid, jsonb) to anon, authenticated;

-- 6) Chạy lại gán ID + bỏ số nhớ báo cáo + tri thức SIÊU TRÍ TUỆ
select chiahang._fn_tt_gan_ar(null);
update chiahang.tt_bc_nho set luc = now() - interval '1 day';
update chiahang.nh_bc_nho set luc = now() - interval '1 day', pb = coalesce(pb, '') || '~297';

update chiahang.ai_tri_thuc set cap_nhat = now(), noi_dung =
  'Doanh thu 1 ID TikTok (từ 26/11, SQL 295 + 297) = MỌI đơn TikTok ghi nhận cho tài khoản đó trong báo cáo phân tích: mua ngay trong LIVE / video, '
  || 'mua từ trưng bày của ID, và gián tiếp (xem LIVE / video của ID rồi mua sau). Báo cáo có chữ LIVE thì tính vào LIVE (kể cả gián tiếp); số gián tiếp '
  || 'tách riêng (dt_live_gt / dt_video_gt) để biết khách xem rồi mới mua sau. Đơn TikTok không ghi tài khoản nào = mua thẳng từ tài khoản chính '
  || 'thoitrangnonson (cũng là kho), kênh Trưng bày, nguồn shop_chinh. Tài khoản đổi tên / chuyển cửa hàng: đơn trước ngày đổi tính cho tên cũ '
  || '(bảng tt_tk_ten; tháng 11: nonsonlythuongkiethm → doisaleso19 từ 13/11, nguyenthaibinh.nonson → doisaleso24 từ 20/11). '
  || 'Doanh thu đã trừ hàng hoàn (TikTok: × phần còn lại sau trả; Bán online: bỏ đơn hoàn và giao thất bại). '
  || 'So với file kế toán: tổng từng ID khớp; khác ở (1) kế toán xếp khách xem LIVE của kênh công ty / shop rồi mua sau vào Video, app xếp vào LIVE; '
  || '(2) kế toán lấy số 1 lần nên đơn huỷ / hoàn sau đó vẫn tính. Thẻ Đội sale ở màn TikTok Shop: mỗi đội = các ID gán vào DOISALEnn.'
where cum_tu = 'doanh thu ID TikTok, gián tiếp, trưng bày, lệch kế toán';
