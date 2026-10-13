-- ============================================================================
-- 174_thieu_hang_bo_pk_thuhoi.sql   (THAY HẲN file 173 — đừng chạy 173 nữa)
--
--   MÀN THIẾU HÀNG: BỎ HẲN PHỤ KIỆN VÀ HÀNG THU HỒI
--   Màn "Thiếu hàng" (GiamSat.jsx) gọi đúng 2 hàm:
--        fn_canh_bao(p_ma_ch, p_khu_vuc, p_tu, p_den)
--        fn_can_san_xuat(p_so_ngay)
--
--   File này VIẾT LẠI 2 HÀM ĐÓ bằng ĐÚNG mã nguồn đang chạy, chỉ THÊM
--   điều kiện lọc. Không dynamic SQL, không bọc hàm, không đổi tên gì.
--   Anh có thể so từng dòng với bản cũ.
--
--   THÊM ĐÚNG NHỮNG DÒNG NÀY (đánh dấu  -- >>> THÊM):
--     fn_canh_bao     : 3 dòng  (2 chặn phụ kiện, 1 chặn thu hồi)
--     fn_can_san_xuat : 3 dòng  (2 chặn phụ kiện, 1 chặn thu hồi)
--
--   CĂN CỨ (lấy từ DB thật, không đoán):
--     · nganh_1 chỉ có 3 giá trị: 'Nón vải', 'Mũ bảo hiểm', 'Phụ kiện'
--     · fn_la_pk đã coalesce sẵn -> không bao giờ trả NULL
--     · hang_dac_biet.ap_dung là text NOT NULL, chỉ có 'CH' và 'CH_DB'
--       -> đó là PHẠM VI áp dụng, KHÔNG phải công tắc bật/tắt.
--       Bản thân fn_canh_bao khi tính cột dac_biet cũng chỉ xét hdb.loai
--       và bỏ qua ap_dung, nên ở đây lọc y hệt: chỉ xét loai = 'THU_HOI'.
--
--   AN TOÀN: trước khi thay, lưu nguyên văn 2 hàm cũ vào chiahang.ham_sao_luu.
--   Muốn quay lại: xem khối "GỠ BỎ" ở cuối file.
-- ============================================================================
set search_path = chiahang, public;

-- ---------------------------------------------------------------------------
-- 0) SAO LƯU NGUYÊN VĂN 2 HÀM CŨ (chạy được nhiều lần, mỗi lần thêm 1 bản ghi)
-- ---------------------------------------------------------------------------
create table if not exists chiahang.ham_sao_luu (
  id         bigserial primary key,
  luc        timestamptz not null default now(),
  ghi_chu    text,
  ten_ham    text not null,
  dinh_nghia text not null
);

insert into chiahang.ham_sao_luu (ghi_chu, ten_ham, dinh_nghia)
select '174 - truoc khi bo phu kien + thu hoi', p.proname, pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'chiahang'
  and p.proname in ('fn_canh_bao', 'fn_can_san_xuat')
  -- không lưu trùng nếu lỡ chạy lại file này
  and not exists (
    select 1 from chiahang.ham_sao_luu s
    where s.ten_ham = p.proname and s.dinh_nghia = pg_get_functiondef(p.oid)
  );

-- ---------------------------------------------------------------------------
-- 1) fn_canh_bao — nguồn cấp dữ liệu chính cho màn Thiếu hàng
-- ---------------------------------------------------------------------------
create or replace function chiahang.fn_canh_bao(
  p_ma_ch   text default null::text,
  p_khu_vuc text default null::text,
  p_tu      date default null::date,
  p_den     date default null::date)
returns table (
  ma_ch text, ten_ch text, khu_vuc text, barcode text, sku text, ma_tham_chieu text,
  nganh_1 text, nganh_3 text, nhom_hang text, la_hang_sale boolean,
  gia_niem_yet numeric, gia_sale numeric, hinh_url text,
  sl_ban integer, ban_30 integer, ton_that integer, ton_du_kien integer, dang_chuyen integer,
  kho_tong integer, ton_ch_khac integer, so_ch_khac integer, ngay_het integer,
  toc_do numeric, ngay_ban_cuoi date, dang text, muc integer, dac_biet text)
language plpgsql
stable security definer
set search_path to 'chiahang', 'public', 'extensions'
as $function$
declare
  v_bh_c text; v_bh_s text; v_nv_c text; v_nv_s text; v_moc date := current_date - 1;
  v_tu date := coalesce(p_tu, current_date - 30);
  v_den date := coalesce(p_den, current_date - 1);
  v_ng_moi int := (fn_ts('nguong_hang_moi_ngay', array['GLOBAL'], 30))::int;
begin
  select gia_tri->>'BH_CHINH', gia_tri->>'BH_SALE', gia_tri->>'NV_CHINH', gia_tri->>'NV_SALE'
    into v_bh_c, v_bh_s, v_nv_c, v_nv_s
  from tham_so where key='kho_tong_ma' and pham_vi='GLOBAL';

  return query
  with kho_ma as (select array[v_bh_c, v_bh_s, v_nv_c, v_nv_s] as arr),
  -- NƠI BÁN trong phạm vi: CHỈ cửa hàng (CH) + điểm bán (DB), loại đội sale & kho
  ch_list as (
    select c.ma_ch, c.ten, c.khu_vuc from cua_hang c
    where (c.ma_ch like 'CH%' or c.ma_ch like 'DB%') and coalesce(c.hoat_dong, true)
      and (p_ma_ch is null or c.ma_ch = p_ma_ch)
      and (p_khu_vuc is null or c.khu_vuc = p_khu_vuc)
  ),
  cand as (
    select cl.ma_ch, tk.barcode from ch_list cl
      join ton_kho tk on tk.ma_ch = cl.ma_ch
    union
    select cl.ma_ch, b.barcode from ch_list cl
      join ban_hang b on b.ma_ch = cl.ma_ch and b.ngay > v_moc - 30
  ),
  ban_ky as (
    select b.ma_ch, b.barcode, sum(b.so_luong)::int as sl
    from ban_hang b join ch_list cl on cl.ma_ch = b.ma_ch
    where b.ngay between v_tu and v_den group by b.ma_ch, b.barcode
  ),
  ban30 as (
    select b.ma_ch, b.barcode, sum(b.so_luong)::int as sl, max(b.ngay) as ngay_cuoi
    from ban_hang b join ch_list cl on cl.ma_ch = b.ma_ch
    where b.ngay > v_moc - 30 group by b.ma_ch, b.barcode
  ),
  ton_ch as (
    select tk.ma_ch, tk.barcode, tk.ton_hien_tai, tk.ton_du_tinh
    from ton_kho tk join ch_list cl on cl.ma_ch = tk.ma_ch
  ),
  kho as (
    select tk.barcode, coalesce(sum(tk.ton_hien_tai),0)::int as kho_tong
    from ton_kho tk, kho_ma where tk.ma_ch = any(kho_ma.arr) group by tk.barcode
  ),
  -- "CH khác còn tồn" cũng CHỈ tính nơi bán CH+DB (nguồn điều chuyển ngang hợp lệ)
  ch_khac as (
    select tk.barcode, coalesce(sum(tk.ton_hien_tai),0)::int as ton, count(*)::int as so_ch
    from ton_kho tk
    where (tk.ma_ch like 'CH%' or tk.ma_ch like 'DB%') and tk.ton_hien_tai > 0
    group by tk.barcode
  ),
  tinh as (
    select
      cd.ma_ch, cl.ten as ten_ch, cl.khu_vuc,
      cd.barcode, sp.sku, sp.ma_tham_chieu, sp.nganh_1, sp.nganh_3,
      fn_nganh(cd.barcode, sp.sku, sp.nganh_1) as nhom_hang,
      coalesce(sp.la_hang_sale,false) as la_hang_sale,
      sp.gia_niem_yet, sp.gia_sale, sp.hinh_url,
      coalesce(bk.sl,0) as sl_ban, coalesce(b3.sl,0) as ban_30,
      coalesce(tc.ton_hien_tai,0) as ton_that, coalesce(tc.ton_du_tinh,0) as ton_du_kien,
      greatest(coalesce(tc.ton_du_tinh,0) - coalesce(tc.ton_hien_tai,0), 0) as dang_chuyen,
      coalesce(k.kho_tong,0) as kho_tong,
      coalesce(ck.ton,0) as ton_ch_khac, coalesce(ck.so_ch,0) as so_ch_khac,
      case when coalesce(tc.ton_hien_tai,0)=0 and b3.ngay_cuoi is not null
           then greatest(current_date - b3.ngay_cuoi,0) else 0 end as ngay_het,
      round((coalesce(b3.sl,0)::numeric/30),2) as toc_do,
      b3.ngay_cuoi,
      sp.ngay_tao_ma
    from cand cd
    join ch_list cl on cl.ma_ch = cd.ma_ch
    join san_pham sp on sp.barcode = cd.barcode
                    and not fn_la_pk(sp.nganh_1)    -- >>> THÊM: chặn PHỤ KIỆN ngay từ gốc
    left join ban_ky bk on bk.ma_ch = cd.ma_ch and bk.barcode = cd.barcode
    left join ban30 b3 on b3.ma_ch = cd.ma_ch and b3.barcode = cd.barcode
    left join ton_ch tc on tc.ma_ch = cd.ma_ch and tc.barcode = cd.barcode
    left join kho k on k.barcode = cd.barcode
    left join ch_khac ck on ck.barcode = cd.barcode
  )
  select t.ma_ch, t.ten_ch, t.khu_vuc, t.barcode, t.sku, t.ma_tham_chieu, t.nganh_1, t.nganh_3,
    t.nhom_hang, t.la_hang_sale, t.gia_niem_yet, t.gia_sale, t.hinh_url,
    t.sl_ban, t.ban_30, t.ton_that, t.ton_du_kien, t.dang_chuyen,
    t.kho_tong, t.ton_ch_khac, t.so_ch_khac, t.ngay_het, t.toc_do, t.ngay_cuoi,
    case
      when t.ton_that = 0 then 'BO_SUNG'
      else 'CANH_BAO' end as dang,
    case when t.ban_30 = 0 then 999 when t.ton_that = 0 then 0
         else floor(t.ton_that::numeric/(t.ban_30::numeric/30))::int end as muc,
    -- Trạng thái đặc biệt: THU_HOI (ĐP thu hồi) / HANG_MOI (thủ công hoặc mã mới ≤ ngưỡng ngày)
    case when hdb.loai is not null then hdb.loai
         when t.ngay_tao_ma is not null and t.ngay_tao_ma >= current_date - v_ng_moi then 'HANG_MOI'
         end as dac_biet
  from tinh t
  left join hang_dac_biet hdb on hdb.barcode = t.barcode
  where t.sl_ban > 0 and (t.ton_that = 0 or t.ton_that < t.sl_ban)
    and coalesce(t.nhom_hang, '') <> 'PK'          -- >>> THÊM: chặn PHỤ KIỆN theo fn_nganh
    and coalesce(hdb.loai, '') <> 'THU_HOI'        -- >>> THÊM: chặn HÀNG THU HỒI
  order by
    case when t.ton_that = 0 and t.ban_30 > 0 then 0
         when t.ton_that = 0 then 1 else 2 end,
    (case when t.ban_30 = 0 then 999 when t.ton_that = 0 then 0
          else floor(t.ton_that::numeric/(t.ban_30::numeric/30))::int end),
    t.ban_30 desc;
end $function$;

-- ---------------------------------------------------------------------------
-- 2) fn_can_san_xuat — tab "Cần sản xuất" trong cùng màn Thiếu hàng
-- ---------------------------------------------------------------------------
create or replace function chiahang.fn_can_san_xuat(p_so_ngay integer default 30)
returns table (
  barcode text, sku text, ma_tham_chieu text, nganh_1 text, nganh_3 text, nhom_hang text,
  la_hang_sale boolean, gia_niem_yet numeric, hinh_url text, ban_toan_ht integer,
  so_ch_ban integer, ton_con_o_ch integer, kho_tong integer, ngay_ban_cuoi date)
language plpgsql
stable security definer
set search_path to 'chiahang', 'public', 'extensions'
as $function$
declare
  v_bh_c text; v_bh_s text; v_nv_c text; v_nv_s text; v_pk text;
  v_moc date := current_date - 1;
begin
  select gia_tri->>'BH_CHINH', gia_tri->>'BH_SALE', gia_tri->>'NV_CHINH', gia_tri->>'NV_SALE', gia_tri->>'PK_CHINH'
    into v_bh_c, v_bh_s, v_nv_c, v_nv_s, v_pk
  from tham_so where key='kho_tong_ma' and pham_vi='GLOBAL';

  return query
  with ban_ht as (
    select b.barcode,
      sum(b.so_luong)::int as ban_toan_ht,
      count(distinct b.ma_ch)::int as so_ch_ban,
      max(b.ngay) as ngay_cuoi
    from ban_hang b
    where b.ngay > v_moc - p_so_ngay
      and b.ma_ch not in (v_bh_c, v_bh_s, v_nv_c, v_nv_s, v_pk)   -- chỉ tính bán ở cửa hàng
    group by b.barcode
    having sum(b.so_luong) > 0
  ),
  kho as (
    select tk.barcode, coalesce(sum(tk.ton_hien_tai),0)::int as kho_tong
    from ton_kho tk where tk.ma_ch in (v_bh_c, v_bh_s, v_nv_c, v_nv_s, v_pk)
    group by tk.barcode
  ),
  ton_ch as (
    select tk.barcode, coalesce(sum(tk.ton_hien_tai),0)::int as ton_ch
    from ton_kho tk where tk.ma_ch not in (v_bh_c, v_bh_s, v_nv_c, v_nv_s, v_pk)
    group by tk.barcode
  )
  select
    bh.barcode, sp.sku, sp.ma_tham_chieu, sp.nganh_1, sp.nganh_3,
    fn_nganh(bh.barcode, sp.sku, sp.nganh_1),
    coalesce(sp.la_hang_sale, false),
    sp.gia_niem_yet, sp.hinh_url,
    bh.ban_toan_ht, bh.so_ch_ban,
    coalesce(tc.ton_ch, 0),
    coalesce(k.kho_tong, 0),
    bh.ngay_cuoi
  from ban_ht bh
  join san_pham sp on sp.barcode = bh.barcode
  left join kho k on k.barcode = bh.barcode
  left join ton_ch tc on tc.barcode = bh.barcode
  where coalesce(k.kho_tong, 0) <= 0        -- kho tổng đã cạn
    and not fn_la_pk(sp.nganh_1)                                        -- >>> THÊM: chặn PHỤ KIỆN
    and coalesce(fn_nganh(bh.barcode, sp.sku, sp.nganh_1), '') <> 'PK'  -- >>> THÊM: chặn PHỤ KIỆN
    and not exists (select 1 from hang_dac_biet h                       -- >>> THÊM: chặn HÀNG THU HỒI
                     where h.barcode = bh.barcode and h.loai = 'THU_HOI')
  order by bh.ban_toan_ht desc;
end $function$;

-- ---------------------------------------------------------------------------
-- 3) QUYỀN (giữ nguyên như cũ)
-- ---------------------------------------------------------------------------
grant execute on function chiahang.fn_canh_bao(text, text, date, date) to anon, authenticated, service_role;
grant execute on function chiahang.fn_can_san_xuat(integer)            to anon, authenticated, service_role;

-- ============================================================================
-- KIỂM — TỰ IN KẾT QUẢ. Gọi bằng TÊN THAM SỐ nên không phụ thuộc thứ tự.
-- ============================================================================

-- (1) Màn Thiếu hàng còn sót phụ kiện / thu hồi không? PHẢI RA 0 DÒNG.
select t.barcode, t.ma_tham_chieu, t.nganh_1, t.nhom_hang, t.dac_biet
from chiahang.fn_canh_bao(p_tu => current_date - 30, p_den => current_date - 1) t
where coalesce(t.nhom_hang, '') = 'PK'
   or chiahang.fn_la_pk(t.nganh_1)
   or coalesce(t.dac_biet, '') = 'THU_HOI'
limit 20;

-- (2) Tab Cần sản xuất còn sót không? PHẢI RA 0 DÒNG.
select t.barcode, t.ma_tham_chieu, t.nganh_1, t.nhom_hang
from chiahang.fn_can_san_xuat(p_so_ngay => 30) t
where coalesce(t.nhom_hang, '') = 'PK'
   or chiahang.fn_la_pk(t.nganh_1)
   or exists (select 1 from chiahang.hang_dac_biet h
               where h.barcode = t.barcode and h.loai = 'THU_HOI')
limit 20;

-- (3) Số dòng còn lại của 2 hàm (xem cho biết quy mô sau khi lọc)
select 'fn_canh_bao'     as ham,
       (select count(*) from chiahang.fn_canh_bao(p_tu => current_date - 30, p_den => current_date - 1)) as so_dong
union all
select 'fn_can_san_xuat',
       (select count(*) from chiahang.fn_can_san_xuat(p_so_ngay => 30));

-- (4) Phân bố ngành còn lại — không được thấy 'Phụ kiện' / 'PK'
select t.nganh_1, t.nhom_hang, count(*) as so_dong
from chiahang.fn_canh_bao(p_tu => current_date - 30, p_den => current_date - 1) t
group by 1, 2 order by 3 desc;

-- (5) Đã sao lưu được bản cũ chưa
select id, luc, ten_ham, length(dinh_nghia) as do_dai, ghi_chu
from chiahang.ham_sao_luu order by id desc limit 10;

-- ============================================================================
-- GỠ BỎ — quay lại y nguyên bản cũ. Chạy RIÊNG khối này khi cần.
-- Nó lấy đúng nguyên văn đã lưu ở bước 0 và chạy lại.
-- ============================================================================
-- do $$
-- declare r record;
-- begin
--   for r in
--     select distinct on (s.ten_ham) s.ten_ham, s.dinh_nghia
--     from chiahang.ham_sao_luu s
--     where s.ten_ham in ('fn_canh_bao', 'fn_can_san_xuat')
--       and s.ghi_chu = '174 - truoc khi bo phu kien + thu hoi'
--     order by s.ten_ham, s.id asc          -- bản lưu ĐẦU TIÊN = bản gốc trước khi sửa
--   loop
--     execute r.dinh_nghia;
--     raise notice 'Đã phục hồi %', r.ten_ham;
--   end loop;
-- end $$;
