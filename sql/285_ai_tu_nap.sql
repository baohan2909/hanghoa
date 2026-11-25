-- ============================================================================
-- NEW - 285: SIÊU TRÍ TUỆ TỰ NẠP KIẾN THỨC (anh yêu cầu 25/11: AI phải tự học, hỏi là trả lời ngay, không bịa)
--   1. Công cụ đúng màn (dùng CHÍNH hàm của màn, 1 loại doanh thu):
--        fn_ai_tiktok   — màn TikTok Shop (fn_tt_bao_cao / fn_tt_theo_doi): tổng, LIVE / Video / thẻ SP, từng ID / người bán, danh sách Theo dõi ★
--        fn_ai_online   — màn Online (fn_nh_bao_cao, Nhanh): tổng, từng kênh (TikTok Shop, Shopee, web…)
--        fn_ai_doanh_thu— gộp mọi kênh: cửa hàng + đội sale + online, kèm TB/ngày
--   2. Sổ số liệu (ai_so_lieu): hôm nay / hôm qua / 7 ngày / tháng này + TikTok theo dõi + vấn đề app + giờ cập nhật dữ liệu.
--        Không thêm lịch chạy: mỗi lần hỏi, sổ cũ quá 15 phút thì tự tính lại (fn_ai_so_lieu).
--   3. Từ điển tự động (fn_ai_tu_dien): tên ID TikTok, danh sách Theo dõi ★, cửa hàng, đội — hiểu cả lời đọc giọng nói
--        ("kết gạch ngang chính" = Kết - Chính, "seo / sell" = sale, "đội xe / đội seo" = đội sale).
-- Mọi hàm: security definer, chỉ máy chủ AI (service_role) gọi — không mở cho anon / authenticated.
-- ============================================================================

create table if not exists chiahang.ai_so_lieu (
  khoa  text primary key,
  kq    jsonb not null,
  luc   timestamptz not null default now(),
  ms    int
);
alter table chiahang.ai_so_lieu enable row level security;
revoke all on chiahang.ai_so_lieu from anon, authenticated;

-- ---------------------------------------------------------------------------
-- chuẩn hoá lời nói (giọng nói đọc dấu "-" thành "gạch ngang", "sale" thành "seo", "chính" thành "chín / 9")
-- ---------------------------------------------------------------------------
create or replace function chiahang.fn_ai_chuan_noi(p text)
returns text language sql immutable set search_path to chiahang, public as $$
  select ' ' || trim(regexp_replace(
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(trim(fn_ai_chuan_chu(p)),
      '\mgach ngang\M', ' ', 'g'),
      '\m(seo|sell|sel|xeo|seu|xeu)\M', 'sale', 'g'),
      '\m(ket|vanh|non)(\s+)(chin|9)\M', '\1 chinh', 'g'),
      '\mdoi (xe|sell)\M', 'doi sale', 'g'),
    '\s+', ' ', 'g')) || ' '
$$;

-- ---------------------------------------------------------------------------
-- tìm ID TikTok theo tên / tài khoản (dùng cho công cụ + từ điển)
-- ---------------------------------------------------------------------------
create or replace function chiahang._fn_ai_tt_id(p_ds jsonb)
returns text[] language sql stable security definer set search_path to chiahang, public as $$
  with x as (
    select trim(both ' @' from v) v from jsonb_array_elements_text(case jsonb_typeof(p_ds) when 'array' then p_ds when 'string' then jsonb_build_array(p_ds) else '[]'::jsonb end) v)
  select coalesce(array_agg(distinct c.handle), '{}')
  from x join tt_creator c
    on lower(c.handle) = lower(x.v)
    or trim(fn_ai_chuan_chu(c.handle)) = trim(fn_ai_chuan_chu(x.v))
    or (c.ten is not null and trim(fn_ai_chuan_noi(c.ten)) = trim(fn_ai_chuan_noi(x.v)))
$$;

-- ---------------------------------------------------------------------------
-- 1a. TikTok Shop — y như màn TikTok Shop
-- ---------------------------------------------------------------------------
create or replace function chiahang.fn_ai_tiktok(p_token uuid, p jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path to chiahang, public as $$
declare v_hn date := (now() at time zone 'Asia/Ho_Chi_Minh')::date; v_tu date; v_den date; v_n int; r jsonb; v_h text[]; v_tong jsonb;
  v_dn constant text := 'Doanh thu = giá niêm yết − shop giảm, chỉ đơn hợp lệ (không huỷ) — đúng cách tính màn TikTok Shop và doanh thu đơn TikTok trên Nhanh. Đơn = số đơn hợp lệ, SL = sản phẩm bán.';
begin
  v_den := coalesce(nullif(p->>'den_ngay', '')::date, v_hn);
  v_tu := coalesce(nullif(p->>'tu_ngay', '')::date, v_den);
  if v_tu > v_den then v_tu := v_den; end if;
  if v_den - v_tu > 92 then v_tu := v_den - 92; end if;
  v_n := v_den - v_tu + 1;

  -- danh sách Theo dõi ★ của người hỏi
  if coalesce((p->>'theo_doi')::boolean, false) then
    r := fn_tt_theo_doi(p_token, jsonb_build_object('tu', v_tu, 'den', v_den));
    select jsonb_build_object('dt', coalesce(sum((x->'tong'->>'dt')::numeric), 0), 'don', coalesce(sum((x->'tong'->>'don')::int), 0),
                              'sl', coalesce(sum((x->'tong'->>'sl')::int), 0), 'huy', coalesce(sum((x->'tong'->>'huy')::int), 0))
      into v_tong from jsonb_array_elements(coalesce(r->'ds', '[]')) x;
    return jsonb_build_object('ok', true, 'kieu', 'theo_doi', 'tu', v_tu, 'den', v_den, 'so_ngay', v_n,
      'ky_truoc', jsonb_build_object('tu', r->'tu_truoc', 'den', r->'den_truoc'),
      'ds', coalesce((select jsonb_agg(jsonb_build_object(
          'ten', coalesce(x->>'ten', x->>'handle'), 'tai_khoan', '@' || (x->>'handle'),
          'doanh_thu', (x->'tong'->>'dt')::numeric, 'dt_tb_ngay', round((x->'tong'->>'dt')::numeric / v_n),
          'don', (x->'tong'->>'don')::int, 'sl', (x->'tong'->>'sl')::int, 'don_huy', (x->'tong'->>'huy')::int,
          'dt_live', (x->'tong'->>'dt_live')::numeric, 'dt_video', (x->'tong'->>'dt_video')::numeric, 'dt_the_sp', (x->'tong'->>'dt_the')::numeric,
          'ky_truoc', jsonb_build_object('doanh_thu', (x->'truoc'->>'dt')::numeric, 'don', (x->'truoc'->>'don')::int)) order by (x->>'thu_tu')::int)
        from jsonb_array_elements(coalesce(r->'ds', '[]')) x), '[]'),
      'tong_nhom', v_tong || jsonb_build_object('dt_tb_ngay', round((v_tong->>'dt')::numeric / v_n)),
      'dinh_nghia', v_dn || ' Danh sách = Theo dõi ★ của người hỏi (màn TikTok Shop › Theo dõi).');
  end if;

  v_h := _fn_ai_tt_id(p->'id');
  if p ? 'id' and cardinality(v_h) = 0 then
    return jsonb_build_object('ok', false, 'loi', 'Không thấy ID TikTok "' || (p->>'id') || '"',
      'cac_id_co_ten', (select jsonb_agg(jsonb_build_object('ten', ten, 'tai_khoan', '@' || handle)) from tt_creator where ten is not null));
  end if;
  r := fn_tt_bao_cao(p_token, jsonb_build_object('tu', v_tu, 'den', v_den) || case when cardinality(v_h) > 0 then jsonb_build_object('nb', to_jsonb(v_h)) else '{}'::jsonb end);
  return jsonb_build_object('ok', true, 'kieu', case when cardinality(v_h) > 0 then 'id' else 'toan_shop' end, 'tu', v_tu, 'den', v_den, 'so_ngay', v_n,
    'tong', jsonb_build_object('doanh_thu', (r->'tong'->>'dt')::numeric, 'dt_tb_ngay', round((r->'tong'->>'dt')::numeric / v_n),
      'don', (r->'tong'->>'don')::int, 'don_tb_ngay', round((r->'tong'->>'don')::numeric / v_n, 1), 'sl', (r->'tong'->>'sl')::int,
      'don_huy', (r->'tong'->>'don_huy')::int, 'so_nguoi_ban', (r->'tong'->>'so_nb')::int, 'cho_gui', (r->'tong'->>'cho_gui')::int,
      'dang_giao', (r->'tong'->>'dang_giao')::int, 'da_giao', (r->'tong'->>'da_giao')::int),
    'theo_kenh', coalesce((select jsonb_agg(jsonb_build_object('kenh', case x->>'k' when 'live' then 'LIVE' when 'video' then 'Video' when 'the' then 'Thẻ sản phẩm' else 'Khác' end,
        'doanh_thu', (x->>'dt')::numeric, 'don', (x->>'don')::int, 'sl', (x->>'sl')::int)) from jsonb_array_elements(coalesce(r->'kenh', '[]')) x), '[]'),
    'nguoi_ban', coalesce((select jsonb_agg(z order by (z->>'doanh_thu')::numeric desc) from (
        select jsonb_build_object('ten', coalesce(nullif(r->'ten_nb'->>(x->>'nb'), ''), case when coalesce(x->>'nb', '') = '' then 'Không qua người bán (shop / thẻ SP)' else '@' || (x->>'nb') end),
          'tai_khoan', nullif('@' || coalesce(x->>'nb', ''), '@'), 'cua_hang', x->>'ten_ch',
          'doanh_thu', (x->>'dt')::numeric, 'don', (x->>'don')::int, 'sl', (x->>'sl')::int, 'don_huy', (x->>'huy')::int,
          'dt_live', (x->>'dt_live')::numeric, 'dt_video', (x->>'dt_video')::numeric) z
        from jsonb_array_elements(coalesce(r->'nb', '[]')) x
        order by (x->>'dt')::numeric desc nulls last limit 12) q), '[]'),
    'dinh_nghia', v_dn);
end $$;

-- ---------------------------------------------------------------------------
-- 1b. Online (Nhanh) — y như màn Online
-- ---------------------------------------------------------------------------
create or replace function chiahang.fn_ai_online(p_token uuid, p jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path to chiahang, public as $$
declare v_hn date := (now() at time zone 'Asia/Ho_Chi_Minh')::date; v_tu date; v_den date; v_n int; r jsonb;
begin
  v_den := coalesce(nullif(p->>'den_ngay', '')::date, v_hn);
  v_tu := coalesce(nullif(p->>'tu_ngay', '')::date, v_den);
  if v_tu > v_den then v_tu := v_den; end if;
  if v_den - v_tu > 92 then v_tu := v_den - 92; end if;
  v_n := v_den - v_tu + 1;
  r := fn_nh_bao_cao(p_token, jsonb_build_object('tu', v_tu, 'den', v_den));
  return jsonb_build_object('ok', true, 'tu', v_tu, 'den', v_den, 'so_ngay', v_n,
    'tong', jsonb_build_object('doanh_thu', (r->'tong'->>'dt')::numeric, 'dt_tb_ngay', round((r->'tong'->>'dt')::numeric / v_n),
      'don', (r->'tong'->>'don')::int, 'don_tb_ngay', round((r->'tong'->>'don')::numeric / v_n, 1), 'sl', (r->'tong'->>'sl')::int,
      'don_huy', (r->'tong'->>'don_huy')::int, 'dt_don_huy', (r->'tong'->>'dt_huy')::numeric, 'don_hoan', (r->'tong'->>'don_hoan')::int,
      'so_shop', (r->'tong'->>'so_shop')::int, 'khach', (r->'tong'->>'khach')::int),
    'theo_kenh', coalesce((select jsonb_agg(jsonb_build_object('kenh', x->>'ten', 'doanh_thu', (x->>'dt')::numeric, 'dt_tb_ngay', round((x->>'dt')::numeric / v_n),
        'don', (x->>'don')::int, 'sl', (x->>'sl')::int, 'don_huy', (x->>'huy')::int) order by (x->>'dt')::numeric desc nulls last)
      from jsonb_array_elements(coalesce(r->'kenh', '[]')) x), '[]'),
    'dinh_nghia', 'Màn Online (đơn Nhanh, mọi kênh online: TikTok Shop, Shopee, web, Facebook…): doanh thu = tiền hàng sau giảm của đơn hợp lệ, không tính đơn huỷ — cùng 1 loại doanh thu với màn TikTok Shop. TikTok Shop ở đây là TỔNG shop; chi tiết từng ID / LIVE / Video xem công cụ tiktok.');
end $$;

-- ---------------------------------------------------------------------------
-- 1c. Doanh thu mọi kênh — cửa hàng + đội sale + online
-- ---------------------------------------------------------------------------
create or replace function chiahang.fn_ai_doanh_thu(p_token uuid, p jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path to chiahang, public as $$
declare v_hn date := (now() at time zone 'Asia/Ho_Chi_Minh')::date; v_tu date; v_den date; v_n int;
  v_ch jsonb; v_ds jsonb; v_ol jsonb; v_tim text := nullif(trim(coalesce(p->>'tim', '')), '');
begin
  v_den := coalesce(nullif(p->>'den_ngay', '')::date, v_hn);
  v_tu := coalesce(nullif(p->>'tu_ngay', '')::date, v_den);
  if v_tu > v_den then v_tu := v_den; end if;
  if v_den - v_tu > 92 then v_tu := v_den - 92; end if;
  v_n := v_den - v_tu + 1;

  with b as (select b.ma_ch, b.so_don, b.so_luong, coalesce(nullif(b.gia_sale, 0), b.gia_ban, 0) gia_ban, fn_nhom_nganh(b.nganh_1) nhom
             from ban_hang b where b.ngay between v_tu and v_den and fn_la_noi_ban(b.ma_ch)
               and (v_tim is null or b.ma_ch = upper(v_tim) or b.ma_ch in (select ma_ch from cua_hang where fn_ai_chuan_chu(ten) like '%' || trim(fn_ai_chuan_chu(v_tim)) || '%')))
  select jsonb_build_object('doanh_thu', coalesce(round(sum(so_luong * gia_ban)), 0), 'dt_tb_ngay', coalesce(round(sum(so_luong * gia_ban) / v_n), 0),
      'sl', coalesce(sum(so_luong), 0), 'don', count(distinct ma_ch || '|' || so_don) filter (where so_luong > 0), 'so_cua_hang', count(distinct ma_ch),
      'theo_nhom', jsonb_build_object('BH', coalesce(round(sum(so_luong * gia_ban) filter (where nhom = 'BH')), 0), 'NV', coalesce(round(sum(so_luong * gia_ban) filter (where nhom = 'NV')), 0),
                                      'PK', coalesce(round(sum(so_luong * gia_ban) filter (where nhom = 'PK')), 0)),
      'top', (select coalesce(jsonb_agg(jsonb_build_object('ma', t.ma_ch, 'ten', c.ten, 'doanh_thu', t.dt, 'sl', t.sl) order by t.dt desc), '[]')
              from (select ma_ch, round(sum(so_luong * gia_ban)) dt, sum(so_luong) sl from b group by ma_ch order by 2 desc limit 5) t left join cua_hang c using (ma_ch)))
    into v_ch from b;

  with b as (select b.ma_ch, b.so_don, b.so_luong, coalesce(nullif(b.gia_sale, 0), b.gia_ban, 0) gia_ban from ban_hang_doi_sale b where b.ngay between v_tu and v_den
               and (v_tim is null or b.ma_ch = upper(v_tim) or b.ma_ch ~ ('^DOISALE0*' || coalesce(substring(v_tim from '(\d{1,3})\s*$'), 'x') || '$')))
  select jsonb_build_object('doanh_thu', coalesce(round(sum(so_luong * gia_ban)), 0), 'dt_tb_ngay', coalesce(round(sum(so_luong * gia_ban) / v_n), 0),
      'sl', coalesce(sum(so_luong), 0), 'don', count(distinct ma_ch || '|' || so_don) filter (where so_luong > 0), 'so_doi', count(distinct ma_ch),
      'top', (select coalesce(jsonb_agg(jsonb_build_object('ma', t.ma_ch, 'ten', c.ten, 'doanh_thu', t.dt, 'sl', t.sl) order by t.dt desc), '[]')
              from (select ma_ch, round(sum(so_luong * gia_ban)) dt, sum(so_luong) sl from b group by ma_ch order by 2 desc limit 5) t left join cua_hang c using (ma_ch)))
    into v_ds from b;

  if v_tim is null then
    begin
      v_ol := fn_ai_online(p_token, jsonb_build_object('tu_ngay', v_tu, 'den_ngay', v_den));
    exception when others then v_ol := jsonb_build_object('ok', false, 'loi', left(sqlerrm, 200));
    end;
  end if;

  return jsonb_build_object('ok', true, 'tu', v_tu, 'den', v_den, 'so_ngay', v_n, 'tim', v_tim,
    'tong', case when v_tim is null then jsonb_build_object(
        'doanh_thu', (v_ch->>'doanh_thu')::numeric + (v_ds->>'doanh_thu')::numeric + coalesce((v_ol->'tong'->>'doanh_thu')::numeric, 0),
        'dt_tb_ngay', round(((v_ch->>'doanh_thu')::numeric + (v_ds->>'doanh_thu')::numeric + coalesce((v_ol->'tong'->>'doanh_thu')::numeric, 0)) / v_n)) end,
    'cua_hang', v_ch, 'doi_sale', v_ds,
    'online', case when v_ol is null then null when coalesce((v_ol->>'ok')::boolean, false) then jsonb_build_object('doanh_thu', v_ol->'tong'->'doanh_thu', 'dt_tb_ngay', v_ol->'tong'->'dt_tb_ngay',
        'don', v_ol->'tong'->'don', 'sl', v_ol->'tong'->'sl', 'theo_kenh', (select jsonb_agg(k) from (select k from jsonb_array_elements(v_ol->'theo_kenh') k limit 6) z)) else v_ol end,
    'dinh_nghia', 'Một loại doanh thu cho mọi nơi. Cửa hàng (bán lẻ CH / DB): số lượng × giá thực bán (giá sale nếu có, không thì giá bán), trả hàng trừ ra. Đội sale: như cửa hàng, từ bán đội sale. Online: đơn Nhanh hợp lệ (gồm TikTok Shop, Shopee, web…). Tổng = cửa hàng + đội sale + online.');
end $$;

-- ---------------------------------------------------------------------------
-- 2. SỔ SỐ LIỆU — tự làm mới khi cũ quá 15 phút (không thêm lịch chạy)
-- ---------------------------------------------------------------------------
create or replace function chiahang.fn_ai_so_lieu(p_token uuid, p_ep boolean default false)
returns jsonb language plpgsql security definer set search_path to chiahang, public as $$
declare u jsonb; v_khoa text; c record; v_hn date := (now() at time zone 'Asia/Ho_Chi_Minh')::date; t0 timestamptz := clock_timestamp();
  kq jsonb := '{}'::jsonb; k record; x jsonb; v_loi jsonb := '[]'::jsonb;
begin
  u := _fn_dt_u(p_token);
  v_khoa := 'so_lieu|' || coalesce(u->>'ma', '?');
  select * into c from ai_so_lieu where khoa = v_khoa;
  if found and not p_ep and c.luc > now() - interval '15 minutes' and (c.luc at time zone 'Asia/Ho_Chi_Minh')::date = v_hn then
    return c.kq || jsonb_build_object('luc', c.luc, 'tuoi_phut', round(extract(epoch from now() - c.luc) / 60));
  end if;

  -- doanh thu mọi kênh theo 4 kỳ
  for k in select * from (values ('hom_nay', v_hn, v_hn), ('hom_qua', v_hn - 1, v_hn - 1), ('7_ngay', v_hn - 6, v_hn),
                                 ('thang_nay', date_trunc('month', v_hn)::date, v_hn)) z(ky, tu, den) loop
    begin
      x := fn_ai_doanh_thu(p_token, jsonb_build_object('tu_ngay', k.tu, 'den_ngay', k.den));
      kq := jsonb_set(kq, array['doanh_thu'], coalesce(kq->'doanh_thu', '{}') || jsonb_build_object(k.ky, jsonb_build_object(
        'tu', k.tu, 'den', k.den, 'so_ngay', x->'so_ngay', 'tong', x->'tong'->'doanh_thu', 'tong_tb_ngay', x->'tong'->'dt_tb_ngay',
        'cua_hang', x->'cua_hang'->'doanh_thu', 'cua_hang_sl', x->'cua_hang'->'sl', 'doi_sale', x->'doi_sale'->'doanh_thu', 'doi_sale_sl', x->'doi_sale'->'sl',
        'online', x->'online'->'doanh_thu', 'online_don', x->'online'->'don',
        'online_kenh', (select jsonb_object_agg(e->>'kenh', e->'doanh_thu') from jsonb_array_elements(coalesce(x->'online'->'theo_kenh', '[]')) e))));
    exception when others then v_loi := v_loi || jsonb_build_array('doanh_thu ' || k.ky || ': ' || left(sqlerrm, 160));
    end;
  end loop;

  -- TikTok: toàn shop hôm nay + 7 ngày (LIVE / Video / thẻ) · danh sách Theo dõi ★ hôm nay + 7 ngày
  for k in select * from (values ('hom_nay', v_hn, v_hn), ('7_ngay', v_hn - 6, v_hn)) z(ky, tu, den) loop
    begin
      x := fn_ai_tiktok(p_token, jsonb_build_object('tu_ngay', k.tu, 'den_ngay', k.den));
      kq := jsonb_set(kq, array['tiktok'], coalesce(kq->'tiktok', '{}') || jsonb_build_object(k.ky, jsonb_build_object(
        'tong', x->'tong'->'doanh_thu', 'tb_ngay', x->'tong'->'dt_tb_ngay', 'don', x->'tong'->'don', 'don_huy', x->'tong'->'don_huy',
        'kenh', (select jsonb_object_agg(e->>'kenh', e->'doanh_thu') from jsonb_array_elements(coalesce(x->'theo_kenh', '[]')) e),
        'top_nguoi_ban', (select jsonb_agg(jsonb_build_object('ten', e->>'ten', 'dt', e->'doanh_thu', 'don', e->'don')) from (select e from jsonb_array_elements(coalesce(x->'nguoi_ban', '[]')) e limit 5) z))));
    exception when others then v_loi := v_loi || jsonb_build_array('tiktok ' || k.ky || ': ' || left(sqlerrm, 160));
    end;
    begin
      x := fn_ai_tiktok(p_token, jsonb_build_object('tu_ngay', k.tu, 'den_ngay', k.den, 'theo_doi', true));
      kq := jsonb_set(kq, array['theo_doi'], coalesce(kq->'theo_doi', '{}') || jsonb_build_object(k.ky,
        (select jsonb_agg(jsonb_build_object('ten', e->>'ten', 'tai_khoan', e->>'tai_khoan', 'dt', e->'doanh_thu', 'tb_ngay', e->'dt_tb_ngay', 'don', e->'don', 'sl', e->'sl',
                 'dt_live', e->'dt_live', 'dt_video', e->'dt_video', 'ky_truoc_dt', e->'ky_truoc'->'doanh_thu'))
         from jsonb_array_elements(coalesce(x->'ds', '[]')) e)));
    exception when others then v_loi := v_loi || jsonb_build_array('theo_doi ' || k.ky || ': ' || left(sqlerrm, 160));
    end;
  end loop;

  -- vấn đề app hôm nay + giờ cập nhật dữ liệu
  begin
    kq := kq || jsonb_build_object('van_de', jsonb_build_object(
      'don_odoo_loi_hom_nay', (select count(*) from odoo_don where trang_thai = 'loi' and (tao_luc at time zone 'Asia/Ho_Chi_Minh')::date = v_hn),
      'don_odoo_loi_mau', (select jsonb_agg(left(name || ': ' || coalesce(loi, ''), 120)) from (select name, loi from odoo_don where trang_thai = 'loi'
                            and (tao_luc at time zone 'Asia/Ho_Chi_Minh')::date = v_hn order by tao_luc desc limit 3) z),
      'don_odoo_dang_gui', (select count(*) from odoo_don where trang_thai in ('cho_gui', 'dang_gui', 'chua_ro')),
      'tiktok_cho_thanh_toan_hom_nay', (select count(*) from tt_don where ngay = v_hn and tt = 'cho_tt'),
      'tiktok_cho_gui_hang', (select count(*) from tt_don where tt in ('cho_gui', 'cho_dong_goi')),
      'loi_dong_bo', jsonb_strip_nulls(jsonb_build_object('tiktok', (select left(loi, 160) from tt_api where loi is not null order by cap_nhat_luc desc nulls last limit 1),
                                                          'nhanh', (select left(loi, 160) from nh_api where loi is not null and loi_luc > now() - interval '1 day' order by loi_luc desc limit 1)))),
      'cap_nhat', jsonb_build_object(
        'ban_cua_hang', (select to_char(max(ngay + gio), 'DD/MM HH24:MI') from ban_hang where ngay >= v_hn - 1),
        'ban_doi_sale', (select to_char(max(ngay + gio), 'DD/MM HH24:MI') from ban_hang_doi_sale where ngay >= v_hn - 1),
        'tiktok_don', (select to_char(max(tao_luc) at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI') from tt_don where ngay >= v_hn - 1),
        'nhanh_don', (select to_char(max(tao_luc) at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI') from nh_don where ngay >= v_hn - 1)));
  exception when others then v_loi := v_loi || jsonb_build_array('van_de: ' || left(sqlerrm, 160));
  end;

  kq := kq || jsonb_build_object('ngay', v_hn, 'loi', v_loi);
  insert into ai_so_lieu (khoa, kq, luc, ms) values (v_khoa, kq, now(), round(extract(epoch from clock_timestamp() - t0) * 1000))
  on conflict (khoa) do update set kq = excluded.kq, luc = excluded.luc, ms = excluded.ms;
  return kq || jsonb_build_object('luc', now(), 'tuoi_phut', 0, 'ms', round(extract(epoch from clock_timestamp() - t0) * 1000));
end $$;

-- ---------------------------------------------------------------------------
-- 3. TỪ ĐIỂN TỰ ĐỘNG — lấy từ dữ liệu, khớp với câu hỏi (cả lời đọc giọng nói)
-- ---------------------------------------------------------------------------
create or replace function chiahang.fn_ai_tu_dien(p_nguoi text, p_yeu_cau text)
returns jsonb language plpgsql stable security definer set search_path to chiahang, public as $$
declare v_q text := fn_ai_chuan_noi(p_yeu_cau); r jsonb := '[]'::jsonb; v_td jsonb; m text[];
begin
  -- danh sách Theo dõi ★ (TikTok Shop) của người hỏi
  select jsonb_agg(jsonb_build_object('ten', coalesce(c.ten, t.handle), 'tai_khoan', '@' || t.handle) order by t.thu_tu, t.tao_luc)
    into v_td from tt_theo_doi t left join tt_creator c on c.handle = t.handle where t.nguoi = p_nguoi;
  if v_td is not null and v_q ~ '\m(theo doi|dac biet|3 kenh|ba kenh|3 id|ba id)\M' then
    r := r || jsonb_build_array(jsonb_build_object('loai', 'theo_doi',
      'giai_thich', 'Danh sách Theo dõi ★ (màn TikTok Shop › Theo dõi) của người hỏi gồm ' || jsonb_array_length(v_td) || ' ID TikTok: '
        || (select string_agg((e->>'ten') || ' (' || (e->>'tai_khoan') || ')', ', ') from jsonb_array_elements(v_td) e)
        || ' — đây là các ID người bán / kênh trên TikTok Shop, KHÔNG phải cửa hàng hay mã hàng. Doanh thu: công cụ tiktok với theo_doi = true.'));
  end if;
  -- tên ID TikTok (kể cả lời đọc: "kết gạch ngang chín" = Kết - Chính)
  r := r || coalesce((select jsonb_agg(jsonb_build_object('loai', 'id_tiktok', 'ten', c.ten, 'tai_khoan', '@' || c.handle,
      'giai_thich', '"' || c.ten || '" = ID TikTok @' || c.handle || ' (' || coalesce(c.loai, '') || case when c.ma_ch is not null then ', cửa hàng ' || c.ma_ch else '' end
        || ') trên TikTok Shop — doanh thu: công cụ tiktok, id = ["' || c.handle || '"]'))
    from tt_creator c
    where c.ten is not null and length(trim(fn_ai_chuan_noi(c.ten))) >= 3
      and (v_q ~ ('\m' || array_to_string(string_to_array(trim(fn_ai_chuan_noi(c.ten)), ' '), '(\s+\S+){0,2}\s+') || '\M')
           or v_q like '%' || fn_ai_chuan_chu(c.handle) || '%')), '[]'::jsonb);
  -- cửa hàng theo tên (bỏ tiền tố tỉnh)
  r := r || coalesce((select jsonb_agg(jsonb_build_object('loai', 'cua_hang', 'ma', z.ma_ch, 'ten', z.ten, 'giai_thich', '"' || z.ten || '" = cửa hàng ' || z.ma_ch))
    from (select ma_ch, ten, trim(regexp_replace(fn_ai_chuan_chu(ten), '^\s*(hcm|hn|ha noi|tp hcm|dn|ct|bd|dong nai|binh duong)\s+', ' ')) t
          from cua_hang where coalesce(hoat_dong, true) and ten is not null) z
    where length(z.t) >= 6 and v_q like '% ' || z.t || ' %' limit 5), '[]'::jsonb);
  -- đội sale theo số ("đội xe / đội seo số 1" = Đội SALE 01)
  for m in select regexp_matches(v_q, '\mdoi( sale)?( so)? (\d{1,2})\M', 'g') loop
    r := r || jsonb_build_array(jsonb_build_object('loai', 'doi_sale', 'ma', 'DOISALE' || lpad(m[3], 2, '0'),
      'giai_thich', '"đội ' || m[3] || '" = đội sale DOISALE' || lpad(m[3], 2, '0') || ' (giọng nói hay đọc "đội xe / đội seo")'));
  end loop;
  return r;
end $$;

revoke all on function chiahang.fn_ai_chuan_noi(text), chiahang._fn_ai_tt_id(jsonb), chiahang.fn_ai_tiktok(uuid, jsonb), chiahang.fn_ai_online(uuid, jsonb),
  chiahang.fn_ai_doanh_thu(uuid, jsonb), chiahang.fn_ai_so_lieu(uuid, boolean), chiahang.fn_ai_tu_dien(text, text) from public, anon, authenticated;
grant execute on function chiahang.fn_ai_tiktok(uuid, jsonb), chiahang.fn_ai_online(uuid, jsonb), chiahang.fn_ai_doanh_thu(uuid, jsonb),
  chiahang.fn_ai_so_lieu(uuid, boolean), chiahang.fn_ai_tu_dien(text, text) to service_role;

-- tri thức: các kênh bán (để AI không nhầm "kênh")
insert into chiahang.ai_tri_thuc (loai, cum_tu, noi_dung, cong_cu, nguon, trang_thai)
select 'tu_ngu', 'kênh, kênh bán, kênh tiktok, kênh online, id tiktok, người bán tiktok, theo dõi, theo dõi đặc biệt',
  'Các kênh bán: (1) Cửa hàng CH/DB; (2) Đội sale DOISALEnn; (3) Online = đơn Nhanh (TikTok Shop, Shopee, web…) — công cụ online; (4) TikTok Shop chi tiết theo ID người bán / kênh (vd "Vành - Chính", "Kết - Chính", "Kết - Sale"), LIVE / Video / thẻ SP — công cụ tiktok; "3 kênh theo dõi đặc biệt" = danh sách Theo dõi ★ ở màn TikTok Shop (tiktok, theo_doi = true). Doanh thu mọi kênh: công cụ doanh_thu. KHÔNG tự viết SQL cho doanh thu.',
  'doanh_thu', 'he_thong', 'dung'
where not exists (select 1 from chiahang.ai_tri_thuc where cum_tu like 'kênh, kênh bán, kênh tiktok%');

-- NEW - 285: doanh thu cửa hàng / đội sale theo GIÁ THỰC BÁN (giá sale nếu có — như fn_ds_thung_goi_y).
--   Trước đây hồ sơ / xếp hạng lấy gia_ban (giá niêm yết) -> đội sale bán hàng sale 250k bị tính 650k (gấp ~2,6 lần).
do $do$
declare d text; o text; n text; c int;
begin
  d := pg_get_functiondef('chiahang.fn_ai_xep_hang'::regproc);
  o := 'nganh_1, so_luong, gia_ban from ban_hang'; n := 'nganh_1, so_luong, coalesce(nullif(gia_sale, 0), gia_ban) gia_ban from ban_hang';
  c := (length(d) - length(replace(d, o, ''))) / length(o);
  if c <> 2 then raise exception 'fn_ai_xep_hang: % mốc', c; end if;
  execute replace(d, o, n);
  d := pg_get_functiondef('chiahang.fn_ai_ho_so'::regproc);
  o := 'so_luong, gia_ban, so_don from ban_hang'; n := 'so_luong, coalesce(nullif(gia_sale, 0), gia_ban) gia_ban, so_don from ban_hang';
  c := (length(d) - length(replace(d, o, ''))) / length(o);
  if c <> 2 then raise exception 'fn_ai_ho_so: % mốc', c; end if;
  execute replace(d, o, n);
end $do$;
