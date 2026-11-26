-- ============================================================================
-- NEW - 291: BÁO CÁO ONLINE — TÁCH COMBO + bỏ HGG khỏi số sản phẩm + nhận mã size mới theo mã mẹ   (anh duyệt 26/11/2026)
--   • Combo TikTok "COMBO 2 NÓN ATG-XM156-L-XL" (mã ATG-XM156-L-XL, KHÔNG có trong danh mục) → 2 dòng nón: ATG-XM156-L × 1 + ATG-XM156-XL × 1,
--     doanh thu / giá vốn chia đôi → vào đúng ngành (Nón bảo hiểm) và Chính / Sale theo mã, tính vào Bán chạy theo mã mẹ.
--     (Màn Chia hàng Online đã tách combo từ trước — SQL 277 — không đổi.)
--   • HGG "Hàng Gửi Giúp" (0 đồng): giữ đơn, nhưng số sản phẩm = 0.
--   • Mã size mới chưa có trong danh mục (vd MC1996-XH1-S) → lấy ngành / chính-sale theo mẫu cùng mã mẹ (MC1996-XH1-M).
--   Chỉ đổi _fn_nh_dong (nguồn chung của fn_nh_bao_cao, fn_nh_don_ds, công cụ AI Online). Tổng doanh thu KHÔNG đổi.
-- ============================================================================
CREATE OR REPLACE FUNCTION chiahang._fn_nh_dong(p_loc jsonb)
 RETURNS TABLE(don_id bigint, app_order_id text, kenh integer, nhom text, shop text, tt integer, ttn text, ngay date, gio integer, nguon text, hvc text, nv text, tinh text, khach text, phi_san numeric, phi_ship numeric, giao_h numeric, ly_do integer, ma text, ma_me text, ten text, nganh text, cs text, sl integer, dt numeric, gv numeric, gny numeric, hinh text, l_dau boolean)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'chiahang', 'public'
AS $function$
-- câu lệnh động với giá trị lọc cụ thể → bộ lập kế hoạch ước lượng đúng số dòng (tránh nested loop trên hàng chục nghìn dòng)
declare
  w text; wx text := '';
  v_q text := nullif(btrim(p_loc->>'q'), '');
begin
  w := format('d.ngay between %L::date and %L::date and _fn_nh_la_ban(d.loai)', p_loc->>'tu', p_loc->>'den');
  if jsonb_typeof(p_loc->'kenh') = 'array' and jsonb_array_length(p_loc->'kenh') > 0 then
    w := w || format(' and d.sale_channel = any(%L::int[])', array(select (jsonb_array_elements_text(p_loc->'kenh'))::int)::text);
  end if;
  if nullif(p_loc->>'nhom', '') is not null then
    w := w || format(' and _fn_nh_nhom_kenh(d.sale_channel) = %L', p_loc->>'nhom');
  end if;
  if jsonb_typeof(p_loc->'shop') = 'array' and jsonb_array_length(p_loc->'shop') > 0 then
    w := w || format(' and coalesce(d.shop_ten, _fn_nh_kenh_ten(d.sale_channel)) = any(%L::text[])',
                     array(select jsonb_array_elements_text(p_loc->'shop'))::text);
  end if;
  if jsonb_typeof(p_loc->'tt') = 'array' and jsonb_array_length(p_loc->'tt') > 0 then
    w := w || format(' and _fn_nh_tt_nhom(d.trang_thai) = any(%L::text[])', array(select jsonb_array_elements_text(p_loc->'tt'))::text);
  end if;
  if v_q is not null then
    -- tìm theo đơn (id / mã sàn / SĐT / vận đơn) → cả đơn; theo mã hàng → chỉ các dòng của mã đó
    w := w || format(' and (d.id::text = %1$L or d.app_order_id = %1$L or d.khach_sdt like %2$L or d.ma_van_don = %1$L'
                     ' or l.ma ilike %2$L)', v_q, '%' || v_q || '%');
  end if;
  if jsonb_typeof(p_loc->'nganh') = 'array' and jsonb_array_length(p_loc->'nganh') > 0 then
    wx := wx || format(' and x.nganh = any(%L::text[])', array(select jsonb_array_elements_text(p_loc->'nganh'))::text);
  end if;
  if nullif(p_loc->>'cs', '') is not null then
    wx := wx || format(' and x.cs = %L', p_loc->>'cs');
  end if;

  return query execute
  'with sp as materialized (
     select upper(btrim(s.ma_tham_chieu)) k, max(s.nganh_1) nganh_1,
       bool_or(coalesce(s.la_hang_sale, false) or s.gia_sale is not null) la_sale,
       max(s.gia_niem_yet) gny, max(s.hinh_url) filter (where s.hinh_url ~ ''^https?://'') hinh
     from san_pham s where coalesce(s.ma_tham_chieu, '''') <> '''' group by 1),
   sp2 as materialized (   -- NEW - 291: tra theo mã bỏ tiền tố NS008… (mã combo TikTok không có tiền tố)
     select distinct on (k2) regexp_replace(k, ''^NS[0-9]{3}'', '''') k2, nganh_1, la_sale, gny, hinh from sp order by k2, k),
   spm as materialized (   -- NEW - 291: tra theo mã mẹ (cùng mẫu, size khác) — mã size mới chưa có trong danh mục
     select distinct on (km) _fn_tt_mame(regexp_replace(k, ''^NS[0-9]{3}'', '''')) km, nganh_1, la_sale, gny, hinh from sp
     where _fn_tt_mame(regexp_replace(k, ''^NS[0-9]{3}'', '''')) is not null order by km, k),
   x as (
     select d.id, d.app_order_id, d.sale_channel, _fn_nh_nhom_kenh(d.sale_channel) nhom,
       coalesce(d.shop_ten, _fn_nh_kenh_ten(d.sale_channel)) shop, d.trang_thai, _fn_nh_tt_nhom(d.trang_thai) ttn, d.ngay,
       extract(hour from d.tao_luc at time zone ''Asia/Ho_Chi_Minh'')::int gio, d.nguon, coalesce(d.hvc_ten, ''Chưa có hãng VC'') hvc,
       coalesce(nullif(d.nv_ban, ''''), nullif(d.nguoi_tao, ''''), ''Không ghi'') nv, coalesce(d.tinh_ten, ''Chưa rõ'') tinh,
       nullif(regexp_replace(coalesce(d.khach_sdt, ''''), ''\\D'', '''', ''g''), '''') khach, d.phi_san, d.phi_ship,
       case when d.giao_luc is not null and d.tao_luc is not null and d.giao_luc > d.tao_luc
            then (extract(epoch from d.giao_luc - d.tao_luc) / 3600)::numeric end giao_h, d.ly_do,
       l.stt, t.i, t.ma2 ma, _fn_nh_ma_me(t.ma2) ma_me, l.ten,
       case when coalesce(s1.k, s2.k, s3.k2, s4.km) is null then ''?'' else fn_nhom_nganh(coalesce(s1.nganh_1, s2.nganh_1, s3.nganh_1, s4.nganh_1)) end nganh,
       case when coalesce(s1.k, s2.k, s3.k2, s4.km) is null then ''?'' when coalesce(s1.la_sale, s2.la_sale, s3.la_sale, s4.la_sale) then ''sale'' else ''chinh'' end cs,
       case when upper(btrim(coalesce(l.ma, ''''))) = ''HGG'' then 0 else coalesce(l.so_luong, 0) end::int sl,   -- NEW - 291: hàng gửi giúp không tính sản phẩm
       (coalesce(l.thanh_tien, 0) * t.phan)::numeric dt,
       case when l.gia_von is not null then (l.gia_von * coalesce(l.so_luong, 0) * t.phan)::numeric end gv,
       coalesce(s1.gny, s2.gny, s3.gny, s4.gny)::numeric gny, coalesce(s1.hinh, s2.hinh, s3.hinh, s4.hinh) hinh
     from nh_don d join nh_don_dong l on l.don_id = d.id
     left join sp s0 on s0.k = upper(btrim(l.ma))
     left join lateral (select case when s0.k is null then
       regexp_match(upper(btrim(l.ma)), ''^([A-Z0-9]+)-([^-]+)-(XS|S|M|L|XL|XXL|2XL)-(XS|S|M|L|XL|XXL|2XL)$'') end g) z on true
     cross join lateral (   -- NEW - 291: combo 2 nón → 2 dòng, mỗi dòng nửa doanh thu
       select 1 i, z.g[1] || ''-'' || z.g[2] || ''-'' || z.g[3] ma2, 0.5::numeric phan where z.g is not null
       union all select 2, z.g[1] || ''-'' || z.g[2] || ''-'' || z.g[4], 0.5::numeric where z.g is not null
       union all select 0, l.ma, 1::numeric where z.g is null) t
     left join sp s1 on s1.k = upper(btrim(t.ma2))
     left join sp s2 on s1.k is null and s2.k = _fn_tt_mame(upper(btrim(t.ma2)))
     left join sp2 s3 on s1.k is null and s2.k is null and s3.k2 = regexp_replace(upper(btrim(t.ma2)), ''^NS[0-9]{3}'', '''')
     left join spm s4 on s1.k is null and s2.k is null and s3.k2 is null
                     and s4.km = _fn_tt_mame(regexp_replace(upper(btrim(t.ma2)), ''^NS[0-9]{3}'', ''''))
     where ' || w || ')
   select x.id, x.app_order_id, x.sale_channel, x.nhom, x.shop, x.trang_thai, x.ttn, x.ngay, x.gio, x.nguon, x.hvc, x.nv, x.tinh, x.khach,
     x.phi_san, x.phi_ship, x.giao_h, x.ly_do, x.ma, x.ma_me, x.ten, x.nganh, x.cs, x.sl, x.dt, x.gv, x.gny, x.hinh,
     row_number() over (partition by x.id order by x.stt, x.i) = 1
   from x where true' || wx;
end $function$;

-- báo cáo Online đang giữ sẵn (10 phút / cùng phiên bản dữ liệu) → đánh dấu cũ để tính lại theo cách mới
update chiahang.nh_bc_nho set luc = now() - interval '1 day', pb = coalesce(pb, '') || '~291';
