-- ============================================================================
-- 175_ch_dong_6_ham.sql — BỎ CỬA HÀNG ĐÃ ĐÓNG KHỎI 6 HÀM CÒN SÓT
--
--   Quét toàn schema ra 42 hàm + 1 view "thiếu lọc". Đối chiếu mã nguồn app:
--   22 hàm được front-end gọi. Đọc từng dòng dùng cua_hang của 22 hàm đó thì
--   chỉ 6 hàm THẬT SỰ cần vá — số còn lại chỉ `left join cua_hang` để lấy TÊN
--   hiển thị cho đơn/vận đơn/bán hàng cũ, vá vào là mất tên trong báo cáo.
--
--   6 HÀM VÁ Ở ĐÂY:
--     1. fn_nguon_gan     — modal "Tìm nguồn" màn Thiếu hàng
--     2. fn_dp_nguon      — gợi ý nguồn màn Yêu cầu điều phối
--     3. fn_cldn_v2       — bảng điểm Chất lượng đề nghị
--     4. fn_thi_hang_kv   — xếp hạng khu vực màn Đấu trường
--     5. fn_cldn_du_bao   — dự báo nơi sắp trống
--     6. fn_cldn_ma_trong — dự báo mã sắp trống
--
--   Viết lại bằng ĐÚNG mã nguồn đang chạy, chỉ THÊM dòng đánh dấu -- >>> THÊM.
--   Không dynamic SQL, không bọc hàm, không đổi tên. So từng dòng được.
--
--   NGUYÊN TẮC CỦA MỌI ĐIỀU KIỆN THÊM VÀO:
--     coalesce(c.hoat_dong, true)  — dòng KHÔNG khớp cửa hàng nào (kho tổng,
--     mã lạ) thì GIỮ. Chỉ loại khi biết chắc đó là cửa hàng và đã đóng.
--     Làm vậy để không vô tình nuốt mất hàng ở kho tổng.
--
--   AN TOÀN: sao lưu nguyên văn 6 hàm cũ trước khi thay. Khối GỠ BỎ ở cuối.
-- ============================================================================
set search_path = chiahang, public;

-- ---------------------------------------------------------------------------
-- 0) SAO LƯU NGUYÊN VĂN 6 HÀM CŨ
-- ---------------------------------------------------------------------------
create table if not exists chiahang.ham_sao_luu (
  id         bigserial primary key,
  luc        timestamptz not null default now(),
  ghi_chu    text,
  ten_ham    text not null,
  dinh_nghia text not null
);

insert into chiahang.ham_sao_luu (ghi_chu, ten_ham, dinh_nghia)
select '175 - truoc khi bo cua hang dong', p.proname, pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'chiahang'
  and p.proname in ('fn_nguon_gan', 'fn_dp_nguon', 'fn_cldn_v2',
                    'fn_thi_hang_kv', 'fn_cldn_du_bao', 'fn_cldn_ma_trong')
  and not exists (
    select 1 from chiahang.ham_sao_luu s
    where s.ten_ham = p.proname and s.dinh_nghia = pg_get_functiondef(p.oid)
  );

-- ---------------------------------------------------------------------------
-- 1) fn_nguon_gan — modal "Tìm nguồn" (màn Thiếu hàng)
--    Không gợi ý lấy hàng từ cửa hàng đã đóng. Kho tổng GIỮ NGUYÊN.
-- ---------------------------------------------------------------------------
create or replace function chiahang.fn_nguon_gan(p_ma_ch text, p_barcode text)
returns table (ma_ch text, ten text, la_kho_tong boolean,
               ton integer, ton_du_kien integer, khoang_cach double precision)
language plpgsql
stable security definer
set search_path to 'chiahang', 'public', 'extensions'
as $function$
declare
  v_lat double precision; v_lng double precision;
  v_bh_c text; v_bh_s text; v_nv_c text; v_nv_s text;
begin
  select c.lat, c.lng into v_lat, v_lng from cua_hang c where c.ma_ch = p_ma_ch;
  select gia_tri->>'BH_CHINH', gia_tri->>'BH_SALE', gia_tri->>'NV_CHINH', gia_tri->>'NV_SALE'
    into v_bh_c, v_bh_s, v_nv_c, v_nv_s
  from tham_so where key='kho_tong_ma' and pham_vi='GLOBAL';

  return query
  select
    tk.ma_ch,
    coalesce(c.ten, tk.ma_ch),
    (tk.ma_ch in (v_bh_c, v_bh_s, v_nv_c, v_nv_s)),
    tk.ton_hien_tai, tk.ton_du_tinh,
    fn_khoang_cach(v_lat, v_lng, c.lat, c.lng)
  from ton_kho tk
  left join cua_hang c on c.ma_ch = tk.ma_ch
  where tk.barcode = p_barcode and tk.ton_hien_tai > 0 and tk.ma_ch <> p_ma_ch
    and (coalesce(c.hoat_dong, true) or tk.ma_ch in (v_bh_c, v_bh_s, v_nv_c, v_nv_s))  -- >>> THÊM: bỏ CH đã đóng, kho tổng giữ nguyên
  order by
    (tk.ma_ch in (v_bh_c, v_bh_s, v_nv_c, v_nv_s)) desc,   -- kho tổng ưu tiên đầu
    fn_khoang_cach(v_lat, v_lng, c.lat, c.lng) asc nulls last;
end $function$;

-- ---------------------------------------------------------------------------
-- 2) fn_dp_nguon — gợi ý nguồn (màn Yêu cầu điều phối)
-- ---------------------------------------------------------------------------
create or replace function chiahang.fn_dp_nguon(p_barcode text)
returns table (ma_ch text, ten text, khu_vuc text, la_kho boolean, ton integer,
               toc_do numeric, ban_60 integer, giu_lai integer, co_the_cho integer)
language sql
stable
set search_path to 'chiahang', 'public', 'extensions'   -- >>> THÊM: bản cũ không có, nên ruột hàm không tự tìm được bảng khi tạo
as $function$
  select t.ma_ch,
         coalesce(c.ten, t.ma_ch)                       as ten,
         c.khu_vuc,
         not fn_la_noi_ban(t.ma_ch)                     as la_kho,
         t.ton_hien_tai::int                            as ton,
         coalesce(x.toc_do, 0)                          as toc_do,
         coalesce(x.ban_60, 0)                          as ban_60,
         -- Kho tổng không giữ lại gì; nơi bán giữ đủ dùng tới kỳ sau
         case when not fn_la_noi_ban(t.ma_ch) then 0
              else ceil(coalesce(x.toc_do, 0) * coalesce(c.chu_ky_ngay, 7))::int end as giu_lai,
         greatest(t.ton_hien_tai::int -
           case when not fn_la_noi_ban(t.ma_ch) then 0
                else ceil(coalesce(x.toc_do, 0) * coalesce(c.chu_ky_ngay, 7))::int end, 0) as co_the_cho
  from ton_kho t
  left join cua_hang c on c.ma_ch = t.ma_ch
  left join v_ma_xs  x on x.ma_ch = t.ma_ch and x.barcode = t.barcode
  where t.barcode = p_barcode and t.ton_hien_tai > 0
    and not exists (select 1 from fn_ycdp_chi_tiet(p_barcode) d where d.ma_ch = t.ma_ch)
    and (coalesce(c.hoat_dong, true) or not fn_la_noi_ban(t.ma_ch))  -- >>> THÊM: bỏ CH đã đóng, kho giữ nguyên
  order by (not fn_la_noi_ban(t.ma_ch)) desc,   -- kho lên đầu
           co_the_cho desc, coalesce(x.toc_do, 0) asc;
$function$;

-- ---------------------------------------------------------------------------
-- 3) fn_cldn_v2 — bảng điểm Chất lượng đề nghị
--    Chấm điểm cửa hàng đã đóng là vô nghĩa và kéo tụt điểm trung bình.
-- ---------------------------------------------------------------------------
create or replace function chiahang.fn_cldn_v2(p_tu date, p_den date)
returns table (ma_ch text, ten text, khu_vuc text, nhom_ch integer, chu_ky integer,
               so_xs integer, so_mat integer, so_sap_het integer, ton integer, da_dn integer,
               ngay_ton numeric, d_phu numeric, d_sau numeric, d_dung numeric, d_cocau numeric,
               d_dinhmuc numeric, d_sat numeric, diem numeric, xep_loai text, canh_bao text)
language sql
stable
set search_path to 'chiahang', 'public', 'extensions'   -- >>> THÊM: bản cũ không có
as $function$
  with ch as (
    select c.ma_ch, c.ten, c.khu_vuc, coalesce(c.nhom_ch, 2) as nhom_ch,
           coalesce(c.chu_ky_ngay, 7) as chu_ky,
           c.bh_min, c.bh_max, c.nv_min, c.nv_max
    from cua_hang c where fn_la_noi_ban(c.ma_ch)
      and coalesce(c.hoat_dong, true)          -- >>> THÊM: bỏ cửa hàng đã đóng
  ),
  -- Đề nghị trong kỳ: gộp đơn trong app + phiếu điều chuyển Odoo, bỏ nháp
  dn_app as (
    select d.ma_ch, ct.barcode,
           sum(coalesce(ct.sl_duyet, ct.sl_xin))::int as sl,
           sum(ct.sl_xin)::int                        as sl_xin,
           sum(coalesce(ct.sl_duyet, ct.sl_xin))::int as sl_duyet
    from don_xin_hang_ct ct
    join don_xin_hang d on d.id = ct.don_id
    where d.ngay_gui::date between p_tu and p_den
      and d.trang_thai not in ('NHAP', 'HOAN')
    group by d.ma_ch, ct.barcode
  ),
  dn_odoo as (
    select k.ma_ch, k.barcode, sum(k.sl_nhu_cau)::int as sl, 0 as sl_xin, 0 as sl_duyet
    from dieu_chuyen_kho k
    where k.ngay_tao between p_tu and p_den
      and k.trang_thai <> 'Chưa chuyển'
      and fn_la_noi_ban(k.ma_ch)
    group by k.ma_ch, k.barcode
  ),
  dn as (
    select ma_ch, barcode, sum(sl)::int as sl,
           sum(sl_xin)::int as sl_xin, sum(sl_duyet)::int as sl_duyet
    from (select * from dn_app union all select * from dn_odoo) t
    group by ma_ch, barcode
  ),
  tk as (
    select t.ma_ch, t.barcode, t.ton_hien_tai::int as ton
    from ton_kho t where fn_la_noi_ban(t.ma_ch) and t.ton_hien_tai > 0
  ),
  -- Một dòng cho mỗi (nơi bán × mã) có liên quan
  ma as (
    select coalesce(x.ma_ch, d.ma_ch, t.ma_ch)    as ma_ch,
           coalesce(x.barcode, d.barcode, t.barcode) as barcode,
           coalesce(x.la_xs, false)               as la_xs,
           coalesce(x.toc_do, 0)                  as toc_do,
           coalesce(t.ton, 0)                     as ton,
           coalesce(d.sl, 0)                      as dn,
           coalesce(d.sl_xin, 0)                  as sl_xin,
           coalesce(d.sl_duyet, 0)                as sl_duyet
    from v_ma_xs x
    full join dn d on d.ma_ch = x.ma_ch and d.barcode = x.barcode
    full join tk t on t.ma_ch = coalesce(x.ma_ch, d.ma_ch)
                  and t.barcode = coalesce(x.barcode, d.barcode)
  ),
  ma_n as (   -- gắn ngành để chấm định mức và cơ cấu
    select ma.*, fn_nhom_nganh(s.nganh_1) as nhom
    from ma left join san_pham s on s.barcode = ma.barcode
    where fn_nhom_nganh(s.nganh_1) <> 'PK' or s.nganh_1 is null
  ),
  gom as (
    select m.ma_ch,
      count(*) filter (where m.la_xs)::int                                    as so_xs,
      count(*) filter (where m.la_xs and m.ton = 0 and m.dn = 0)::int         as so_mat,
      count(*) filter (where m.la_xs and (m.ton + m.dn) > 0)::int             as so_co,
      sum(m.ton)::int                                                          as ton,
      sum(m.dn)::int                                                           as da_dn,
      sum(m.toc_do)                                                            as toc_do_ngay,
      sum(m.sl_xin)::int                                                       as sl_xin,
      sum(m.sl_duyet)::int                                                     as sl_duyet,
      sum(m.dn) filter (where m.la_xs)::int                                    as dn_xs,
      sum(case when m.nhom = 'BH' then m.ton + m.dn else 0 end)::int           as sau_bh,
      sum(case when m.nhom = 'NV' then m.ton + m.dn else 0 end)::int           as sau_nv,
      sum(case when m.nhom = 'BH' then m.toc_do else 0 end)                    as td_bh,
      sum(case when m.nhom = 'NV' then m.toc_do else 0 end)                    as td_nv
    from ma_n m group by m.ma_ch
  ),
  -- Mã xương sống sắp hết: còn ít hơn thời gian tới kỳ đề nghị sau
  sap as (
    select m.ma_ch, count(*)::int as so_sap_het
    from ma_n m join ch on ch.ma_ch = m.ma_ch
    where m.la_xs and m.toc_do > 0
      and (m.ton + m.dn) / m.toc_do < ch.chu_ky
    group by m.ma_ch
  ),
  tinh as (
    select ch.*, g.so_xs, g.so_mat, g.so_co, g.ton, g.da_dn, g.toc_do_ngay,
           g.sl_xin, g.sl_duyet, g.dn_xs, g.sau_bh, g.sau_nv, g.td_bh, g.td_nv,
           coalesce(s.so_sap_het, 0) as so_sap_het,
           -- số ngày bán được với lượng hàng sau đề nghị
           case when g.toc_do_ngay > 0
                then round((g.ton + g.da_dn) / g.toc_do_ngay, 1) else null end as ngay_ton
    from ch
    left join gom g on g.ma_ch = ch.ma_ch
    left join sap s on s.ma_ch = ch.ma_ch
  ),
  diem as (
    select t.*,
      -- 1. Độ phủ mã xương sống
      case when coalesce(t.so_xs, 0) = 0 then null
           else round(t.so_co::numeric * 100 / t.so_xs, 1) end as d_phu,
      -- 2. Độ sâu tồn so chu kỳ đề nghị của chính nơi đó
      case when t.ngay_ton is null then null
           else least(100, round(t.ngay_ton * 100 / t.chu_ky, 1)) end as d_sau,
      -- 3. Đề nghị có rơi đúng vào mã xương sống không
      case when coalesce(t.da_dn, 0) = 0 then null
           else round(t.dn_xs::numeric * 100 / t.da_dn, 1) end as d_dung,
      -- 4. Cân đối cơ cấu: tỷ trọng bảo hiểm sau ĐN so tỷ trọng bán thực tế
      case when coalesce(t.sau_bh, 0) + coalesce(t.sau_nv, 0) = 0
             or coalesce(t.td_bh, 0) + coalesce(t.td_nv, 0) = 0 then null
           else greatest(0, round(100 - abs(
                  t.sau_bh * 100.0 / nullif(t.sau_bh + t.sau_nv, 0)
                - t.td_bh  * 100.0 / nullif(t.td_bh  + t.td_nv, 0)) * 2, 1)) end as d_cocau,
      -- 5. Đúng định mức (phần của bản cũ, nay chỉ còn 1 chỉ số)
      round((
        case when t.bh_min is null or t.bh_min = 0 then 100
             when t.sau_bh >= t.bh_min then 100
             else t.sau_bh * 100.0 / t.bh_min end
      + case when t.nv_min is null or t.nv_min = 0 then 100
             when t.sau_nv >= t.nv_min then 100
             else t.sau_nv * 100.0 / t.nv_min end) / 2, 1) as d_dinhmuc,
      -- 6. Đề nghị sát thực tế: xin bao nhiêu thì được duyệt bấy nhiêu
      case when coalesce(t.sl_xin, 0) = 0 then null
           else least(100, round(t.sl_duyet::numeric * 100 / t.sl_xin, 1)) end as d_sat
    from tinh t
  ),
  tong as (
    select d.*,
      round(
        coalesce(d.d_phu,     60) * 0.30 + coalesce(d.d_sau,     60) * 0.25 +
        coalesce(d.d_dung,    60) * 0.15 + coalesce(d.d_cocau,   70) * 0.10 +
        coalesce(d.d_dinhmuc, 70) * 0.10 + coalesce(d.d_sat,    100) * 0.10, 1) as diem
    from diem d
  )
  select t.ma_ch, t.ten, t.khu_vuc, t.nhom_ch, t.chu_ky,
         coalesce(t.so_xs, 0), coalesce(t.so_mat, 0), coalesce(t.so_sap_het, 0),
         coalesce(t.ton, 0), coalesce(t.da_dn, 0), t.ngay_ton,
         t.d_phu, t.d_sau, t.d_dung, t.d_cocau, t.d_dinhmuc, t.d_sat,
         case when coalesce(t.so_xs, 0) = 0 then null else t.diem end,
         -- Nơi chưa có lịch sử bán thì KHÔNG chấm điểm — chấm là bịa.
         case when coalesce(t.so_xs, 0) = 0 then '—'
              when t.diem >= 85 then 'A' when t.diem >= 70 then 'B'
              when t.diem >= 55 then 'C' else 'D' end,
         case when coalesce(t.so_xs, 0) = 0                     then 'CHUA_DU_LIEU'
              when coalesce(t.da_dn, 0) = 0                     then 'CHUA_DN'
              when coalesce(t.so_mat, 0) > 0                    then 'MAT_MA'
              when t.ngay_ton is not null and t.ngay_ton < t.chu_ky then 'HUT_SAU'
              when coalesce(t.so_sap_het, 0) > 0                then 'SAP_HET'
              else 'ON' end
  from tong t
  order by t.diem asc nulls last;
$function$;

-- ---------------------------------------------------------------------------
-- 4) fn_thi_hang_kv — xếp hạng khu vực (màn Đấu trường)
-- ---------------------------------------------------------------------------
create or replace function chiahang.fn_thi_hang_kv(p_tu date, p_den date)
returns table (khu_vuc text, so_ch bigint, so_nguoi bigint, tong_diem bigint, diem_tb numeric)
language sql
stable security definer
set search_path to 'chiahang', 'public'
as $function$
  with best as (
    select t.ma_ch, t.ma_nguoi, max(t.diem) as diem_ca_nhan
    from thi_ket_qua t
    where t.tao_luc::date between p_tu and p_den and t.ma_ch is not null
    group by t.ma_ch, t.ma_nguoi
  )
  select c.khu_vuc, count(distinct c.ma_ch), count(b.ma_nguoi),
    coalesce(sum(b.diem_ca_nhan), 0), coalesce(round(avg(b.diem_ca_nhan), 0), 0)
  from cua_hang c
  join best b on b.ma_ch = c.ma_ch
  where c.khu_vuc is not null
    and coalesce(c.hoat_dong, true)          -- >>> THÊM: bỏ cửa hàng đã đóng
  group by c.khu_vuc
  order by sum(b.diem_ca_nhan) desc nulls last;
$function$;

-- ---------------------------------------------------------------------------
-- 5) fn_cldn_du_bao — dự báo nơi sắp trống
-- ---------------------------------------------------------------------------
create or replace function chiahang.fn_cldn_du_bao(p_ngay integer default 7)
returns table (ma_ch text, ten text, khu_vuc text, so_xs integer, so_het integer,
               ngay_ton numeric, ma_dau_tien text)
language sql
stable
set search_path to 'chiahang', 'public', 'extensions'   -- >>> THÊM: bản cũ không có
as $function$
  with dn as (   -- hàng đang trên đường về (đã xuất, chưa nhận)
    select k.ma_ch, k.barcode,
           sum(greatest(coalesce(k.sl_nhu_cau, 0) - coalesce(k.sl_da_nhap, 0), 0))::int as sl
    from dieu_chuyen_kho k
    where k.trang_thai in ('Đã xuất', 'Chưa nhận', 'Một phần') and fn_la_noi_ban(k.ma_ch)
    group by k.ma_ch, k.barcode
  ),
  m as (
    select x.ma_ch, x.barcode, x.toc_do, x.ban_60,
           coalesce(t.ton_hien_tai, 0) + coalesce(d.sl, 0) as co,
           case when x.toc_do > 0
                then (coalesce(t.ton_hien_tai, 0) + coalesce(d.sl, 0)) / x.toc_do
                else null end as ngay_con
    from v_ma_xs x
    left join ton_kho t on t.ma_ch = x.ma_ch and t.barcode = x.barcode
    left join dn d      on d.ma_ch = x.ma_ch and d.barcode = x.barcode
    where x.la_xs
  ),
  g as (
    select m.ma_ch,
           count(*)::int as so_xs,
           count(*) filter (where m.ngay_con is not null and m.ngay_con < p_ngay)::int as so_het,
           round(sum(m.co) / nullif(sum(m.toc_do), 0), 1) as ngay_ton
    from m group by m.ma_ch
  ),
  dau as (
    select distinct on (m.ma_ch) m.ma_ch, s.sku
    from m left join san_pham s on s.barcode = m.barcode
    where m.ngay_con is not null and m.ngay_con < p_ngay
    order by m.ma_ch, m.ngay_con asc, m.ban_60 desc
  )
  select g.ma_ch, c.ten, c.khu_vuc, g.so_xs, g.so_het, g.ngay_ton, d.sku
  from g
  join cua_hang c on c.ma_ch = g.ma_ch
  left join dau d on d.ma_ch = g.ma_ch
  where g.so_het > 0
    and coalesce(c.hoat_dong, true)          -- >>> THÊM: bỏ cửa hàng đã đóng
  order by g.so_het::numeric / nullif(g.so_xs, 0) desc, g.so_het desc;
$function$;

-- ---------------------------------------------------------------------------
-- 6) fn_cldn_ma_trong — dự báo mã sắp trống ở nhiều nơi
--    Lọc ngay ở sap_trong để cả so_noi lẫn ds_noi đều không đếm CH đã đóng.
-- ---------------------------------------------------------------------------
create or replace function chiahang.fn_cldn_ma_trong(p_ngay integer default 7, p_so integer default 30)
returns table (barcode text, sku text, ma_tham_chieu text, ten_sp text, nganh_3 text,
               hinh_url text, so_noi integer, ds_noi text, ton_noi_ban bigint,
               ton_kho_tong bigint, toc_do_tong numeric, huong text)
language sql
stable security definer
set search_path to 'chiahang', 'public'
as $function$
  with xs as (
    -- mã trọng yếu ở từng nơi + tồn + tốc độ (từ bảng vật chất hóa, rất nhanh)
    select x.ma_ch, x.barcode, x.toc_do,
           coalesce(t.ton_hien_tai, 0) as ton
    from v_ma_xs x
    left join ton_kho t on t.ma_ch = x.ma_ch and t.barcode = x.barcode
    where x.la_xs
  ),
  duong as (   -- hàng đang trên đường về từng nơi
    select d.ma_ch, d.barcode, sum(d.sl_nhu_cau)::numeric as sl
    from dieu_chuyen_kho d
    where d.trang_thai not in ('Chưa chuyển', 'Đã nhận')
    group by 1, 2
  ),
  sap_trong as (
    select xs.ma_ch, xs.barcode, xs.toc_do
    from xs
    left join duong g on g.ma_ch = xs.ma_ch and g.barcode = xs.barcode
    where xs.toc_do > 0
      and (xs.ton + coalesce(g.sl, 0)) / xs.toc_do < p_ngay
      and not exists (select 1 from cua_hang c2                                      -- >>> THÊM: bỏ CH đã đóng
                       where c2.ma_ch = xs.ma_ch and not coalesce(c2.hoat_dong, true))  -- >>> THÊM
  ),
  gom as (
    select st.barcode,
           count(*)::int as so_noi,
           string_agg(coalesce(c.ten, st.ma_ch), ' · ' order by st.toc_do desc) as ds_noi,
           sum(st.toc_do) as toc_do_tong
    from sap_trong st
    left join cua_hang c on c.ma_ch = st.ma_ch
    group by st.barcode
  ),
  ton_nb as (
    select t.barcode, sum(t.ton_hien_tai)::bigint as ton
    from ton_kho t where fn_la_noi_ban(t.ma_ch) and t.ton_hien_tai > 0 group by 1
  ),
  ton_kt as (
    select t.barcode, sum(t.ton_hien_tai)::bigint as ton
    from ton_kho t where not fn_la_noi_ban(t.ma_ch) and t.ton_hien_tai > 0 group by 1
  )
  select g.barcode, s.sku, s.ma_tham_chieu, tt.ten_sp, s.nganh_3, tt.hinh_url,
         g.so_noi,
         -- chỉ nêu 3 nơi gấp nhất cho gọn
         (string_to_array(g.ds_noi, ' · '))[1] ||
           case when g.so_noi >= 2 then ' · ' || (string_to_array(g.ds_noi, ' · '))[2] else '' end ||
           case when g.so_noi >= 3 then ' · ' || (string_to_array(g.ds_noi, ' · '))[3] else '' end ||
           case when g.so_noi > 3 then ' +' || (g.so_noi - 3) else '' end as ds_noi,
         coalesce(nb.ton, 0) as ton_noi_ban,
         coalesce(kt.ton, 0) as ton_kho_tong,
         round(g.toc_do_tong, 1) as toc_do_tong,
         case when coalesce(kt.ton, 0) > 0 then 'CHIA'
              when coalesce(nb.ton, 0) > g.toc_do_tong * p_ngay then 'DIEU_PHOI'
              else 'SAN_XUAT' end as huong
  from gom g
  join san_pham s on s.barcode = g.barcode
  left join v_sp_tt tt on tt.barcode = g.barcode
  left join ton_nb nb on nb.barcode = g.barcode
  left join ton_kt kt on kt.barcode = g.barcode
  order by g.so_noi desc, g.toc_do_tong desc
  limit p_so;
$function$;

-- ---------------------------------------------------------------------------
-- 7) QUYỀN — giữ nguyên như cũ
-- ---------------------------------------------------------------------------
grant execute on function chiahang.fn_nguon_gan(text, text)        to anon, authenticated, service_role;
grant execute on function chiahang.fn_dp_nguon(text)               to anon, authenticated, service_role;
grant execute on function chiahang.fn_cldn_v2(date, date)          to anon, authenticated, service_role;
grant execute on function chiahang.fn_thi_hang_kv(date, date)      to anon, authenticated, service_role;
grant execute on function chiahang.fn_cldn_du_bao(integer)         to anon, authenticated, service_role;
grant execute on function chiahang.fn_cldn_ma_trong(integer, integer) to anon, authenticated, service_role;

-- ============================================================================
-- KIỂM — một bảng duy nhất, tất cả phải ĐẠT
-- ============================================================================
with ch_dong as (
  select c.ma_ch from chiahang.cua_hang c where not coalesce(c.hoat_dong, true)
)
select * from (

  select 1 as stt, 'Số cửa hàng đã đóng trong hệ' as muc,
         (select count(*)::text from ch_dong) as gia_tri, 'tham khảo' as ket_luan

  union all
  select 2, 'Chất lượng ĐN còn kèm CH đã đóng',
         count(*)::text,
         case when count(*) = 0 then 'ĐẠT' else 'HỎNG — phải = 0' end
  from chiahang.fn_cldn_v2(current_date - 30, current_date) t
  where t.ma_ch in (select ma_ch from ch_dong)

  union all
  select 3, 'Dự báo nơi sắp trống còn kèm CH đã đóng',
         count(*)::text,
         case when count(*) = 0 then 'ĐẠT' else 'HỎNG — phải = 0' end
  from chiahang.fn_cldn_du_bao(7) t
  where t.ma_ch in (select ma_ch from ch_dong)

  union all
  select 4, 'Đấu trường — số khu vực còn xếp hạng',
         count(*)::text, 'tham khảo (so với trước khi vá)'
  from chiahang.fn_thi_hang_kv(current_date - 30, current_date)

  union all
  select 5, 'Bản sao lưu gốc của ' || s.ten_ham,
         'id ' || min(s.id)::text, 'ĐẠT'
  from chiahang.ham_sao_luu s
  where s.ghi_chu = '175 - truoc khi bo cua hang dong'
  group by s.ten_ham

) z order by z.stt, z.muc;

-- ============================================================================
-- GỠ BỎ — quay lại y nguyên bản cũ. Chạy RIÊNG khối này khi cần.
-- ============================================================================
-- do $$
-- declare r record;
-- begin
--   -- BẮT BUỘC: bản gốc của 3 hàm language sql không có SET search_path,
--   -- không đặt dòng này thì tạo lại sẽ báo relation "cua_hang" does not exist
--   execute 'set local search_path = chiahang, public, extensions';
--   for r in
--     select distinct on (s.ten_ham) s.ten_ham, s.dinh_nghia
--     from chiahang.ham_sao_luu s
--     where s.ghi_chu = '175 - truoc khi bo cua hang dong'
--     order by s.ten_ham, s.id asc          -- bản lưu ĐẦU TIÊN = bản gốc
--   loop
--     execute r.dinh_nghia;
--     raise notice 'Đã phục hồi %', r.ten_ham;
--   end loop;
-- end $$;
