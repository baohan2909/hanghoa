-- ============================================================================
-- 173_thieu_hang_bo_pk_thuhoi.sql
--   MÀN THIẾU HÀNG: BỎ HẲN PHỤ KIỆN VÀ HÀNG THU HỒI
--
--   Màn "Thiếu hàng" gọi 2 hàm:  fn_canh_bao()  và  fn_can_san_xuat()
--   File này BỌC cả hai hàm lại (không sửa một dòng nào trong ruột hàm gốc):
--      · đổi tên hàm gốc thành  <tên>_goc
--      · tạo hàm cùng tên cũ, gọi hàm gốc rồi LỌC BỎ phụ kiện + hàng thu hồi
--   Front-end gọi y như cũ, không phải đổi gì.
--
--   CHẠY LẠI NHIỀU LẦN ĐƯỢC: lần 2 trở đi chỉ dựng lại lớp bọc, không đổi tên nữa.
--   MUỐN GỠ BỎ: xem khối "GỠ BỎ" ở cuối file.
--
--   AN TOÀN: nếu hàm gốc không có cột để lọc (sai kỳ vọng) thì RAISE -> HỦY
--   TOÀN BỘ, không âm thầm bọc sai.
-- ============================================================================
set search_path = chiahang, public;

-- ---------------------------------------------------------------------------
-- (0) SOI BẢNG hang_dac_biet TRƯỚC — để thấy rõ cột ap_dung đang chứa gì.
--     Chỉ để xem, không sửa gì.
-- ---------------------------------------------------------------------------
select column_name as cot, data_type as kieu
from information_schema.columns
where table_schema = 'chiahang' and table_name = 'hang_dac_biet'
order by ordinal_position;

select loai, ap_dung::text as ap_dung, count(*) as so_ma
from chiahang.hang_dac_biet
group by 1, 2 order by 1, 2;

do $mig$
declare
  v_ten      text;
  v_goc      text;
  v_oid      oid;
  v_args     text;          -- chữ ký ĐẦY ĐỦ (có DEFAULT) -> dùng cho CREATE
  v_ids      text;          -- chữ ký RÚT GỌN (không DEFAULT) -> dùng cho ALTER/DROP/GRANT
  v_res      text;
  v_goi      text;          -- chuỗi truyền tham số sang hàm gốc
  v_cols     text[];        -- tên các cột TRẢ VỀ của hàm gốc
  v_secdef   boolean;
  v_vol      char;
  v_dk       text;          -- điều kiện lọc
  v_body     text;
  v_kieu_ap  text;         -- kiểu dữ liệu thật của hang_dac_biet.ap_dung (KHÔNG đoán)
  v_dk_ap    text;         -- mảnh điều kiện cho ap_dung, dựng theo đúng kiểu
  v_da_boc   boolean;      -- lần chạy trước đã bọc rồi?
  v_dem      int;
begin
  -- hang_dac_biet.ap_dung kiểu gì? DÒ THẬT, không đoán — lần trước đoán boolean nên nổ.
  select data_type into v_kieu_ap
  from information_schema.columns
  where table_schema = 'chiahang' and table_name = 'hang_dac_biet' and column_name = 'ap_dung';

  if v_kieu_ap is null then
    v_dk_ap := '';                                   -- không có cột -> mọi dòng THU_HOI đều tính
    raise notice 'hang_dac_biet KHÔNG có cột ap_dung -> lọc mọi dòng loai = THU_HOI';
  elsif v_kieu_ap = 'boolean' then
    v_dk_ap := ' and coalesce(h.ap_dung, true)';
    raise notice 'hang_dac_biet.ap_dung kiểu boolean -> dùng coalesce(ap_dung, true)';
  else
    -- Kiểu chữ/số: chỉ bỏ khi ghi rõ là TẮT. Mọi giá trị khác (kể cả rỗng) coi như ĐANG ÁP DỤNG,
    -- thà lọc dư một dòng thu hồi còn hơn để sót hàng thu hồi trong màn Thiếu hàng.
    v_dk_ap := ' and lower(coalesce(h.ap_dung::text, '''')) not in'
            || ' (''false'', ''f'', ''0'', ''no'', ''n'', ''khong'', ''không'', ''tat'', ''tắt'', ''off'')';
    raise notice 'hang_dac_biet.ap_dung kiểu % -> chỉ bỏ qua khi giá trị ghi rõ là TẮT', v_kieu_ap;
  end if;

  foreach v_ten in array array['fn_canh_bao', 'fn_can_san_xuat'] loop
    v_goc := v_ten || '_goc';

    ---------------------------------------------------------------------------
    -- 1) Xác định hàm sẽ bọc. Đã bọc rồi -> lấy luôn hàm _goc, khỏi đổi tên lại.
    ---------------------------------------------------------------------------
    select count(*) into v_dem
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'chiahang' and p.proname = v_goc;

    if v_dem > 1 then
      raise exception 'CHỐT KIỂM: chiahang.% có % bản — dừng.', v_goc, v_dem;
    end if;
    v_da_boc := (v_dem = 1);

    if not v_da_boc then
      -- chưa bọc: phải có đúng 1 hàm tên gốc
      select count(*) into v_dem
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'chiahang' and p.proname = v_ten;
      if v_dem <> 1 then
        raise exception 'CHỐT KIỂM: chiahang.% có % bản (cần đúng 1) — dừng, không bọc.', v_ten, v_dem;
      end if;
    end if;

    select p.oid,
           pg_get_function_arguments(p.oid),
           pg_get_function_identity_arguments(p.oid),
           pg_get_function_result(p.oid),
           -- CHỈ lấy đúng số tham số VÀO (proargnames còn chứa cả tên cột trả về)
           array_to_string(p.proargnames[1:p.pronargs], ', '),
           p.prosecdef,
           p.provolatile,
           -- tên các cột TRẢ VỀ (proargmodes = 't' với returns table)
           (select array_agg(p.proargnames[i])
              from generate_subscripts(p.proargnames, 1) i
             where p.proargmodes is not null and p.proargmodes[i] = 't')
      into v_oid, v_args, v_ids, v_res, v_goi, v_secdef, v_vol, v_cols
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'chiahang' and p.proname = case when v_da_boc then v_goc else v_ten end;

    if v_oid is null then
      raise exception 'CHỐT KIỂM: không tìm thấy chiahang.% — dừng.', v_ten;
    end if;
    if v_cols is null or array_length(v_cols, 1) is null then
      raise exception 'CHỐT KIỂM: chiahang.% không phải RETURNS TABLE (không đọc được tên cột) — dừng.', v_ten;
    end if;
    if v_goi is null or v_goi = '' then
      raise exception 'CHỐT KIỂM: chiahang.% có tham số không đặt tên — dừng.', v_ten;
    end if;

    ---------------------------------------------------------------------------
    -- 2) Dựng điều kiện lọc theo ĐÚNG những cột hàm gốc thực sự trả về
    ---------------------------------------------------------------------------
    v_dk := '';

    -- (a) BỎ PHỤ KIỆN
    if 'nhom_hang' = any(v_cols) then
      v_dk := v_dk || ' and coalesce(t.nhom_hang, '''') <> ''PK''';
    end if;
    if 'nganh_1' = any(v_cols) then
      -- coalesce(...) vì fn_la_pk(NULL) trả NULL -> nếu không bọc sẽ RỚT MẤT dòng có nganh_1 trống
      v_dk := v_dk || ' and not coalesce(chiahang.fn_la_pk(t.nganh_1), false)';
    end if;
    if v_dk = '' then
      raise exception 'CHỐT KIỂM: chiahang.% không trả nhom_hang lẫn nganh_1, không lọc phụ kiện được — dừng.', v_ten;
    end if;

    -- (b) BỎ HÀNG THU HỒI
    if 'dac_biet' = any(v_cols) then
      v_dk := v_dk || ' and coalesce(t.dac_biet, '''') <> ''THU_HOI''';
    elsif 'barcode' = any(v_cols) then
      v_dk := v_dk || ' and not exists (select 1 from chiahang.hang_dac_biet h'
                   || ' where h.barcode = t.barcode and h.loai = ''THU_HOI'''
                   || v_dk_ap || ')';
    else
      raise exception 'CHỐT KIỂM: chiahang.% không có dac_biet lẫn barcode, không lọc thu hồi được — dừng.', v_ten;
    end if;

    ---------------------------------------------------------------------------
    -- 3) Đổi tên hàm gốc (chỉ lần đầu) rồi dựng lớp bọc
    ---------------------------------------------------------------------------
    if not v_da_boc then
      execute format('alter function chiahang.%I(%s) rename to %I', v_ten, v_ids, v_goc);
      raise notice 'Đã đổi tên chiahang.%(...) -> %', v_ten, v_goc;
    end if;

    v_body := format('select t.* from chiahang.%I(%s) t where true%s', v_goc, v_goi, v_dk);

    execute format(
      'create or replace function chiahang.%I(%s) returns %s language sql %s %s as $f$ %s $f$',
      v_ten, v_args, v_res,
      case v_vol when 'i' then 'immutable' when 's' then 'stable' else '' end,
      case when v_secdef then 'security definer set search_path = chiahang, public' else '' end,
      v_body);

    execute format('grant execute on function chiahang.%I(%s) to anon, authenticated, service_role', v_ten, v_ids);
    execute format('grant execute on function chiahang.%I(%s) to anon, authenticated, service_role', v_goc, v_ids);

    raise notice 'ĐÃ BỌC chiahang.%  —  lọc:%', v_ten, v_dk;
  end loop;
end $mig$;

-- ============================================================================
-- KIỂM NGAY — các câu dưới TỰ IN KẾT QUẢ
-- Gọi hàm bằng TÊN THAM SỐ (p_tu => ...) để không phụ thuộc thứ tự tham số.
-- ============================================================================

-- (1) Chữ ký thật của 4 hàm + ruột lớp bọc
select p.proname as ham,
       pg_get_function_arguments(p.oid) as tham_so,
       left(replace(pg_get_functiondef(p.oid), chr(10), ' '), 420) as ruot
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'chiahang'
  and p.proname in ('fn_canh_bao', 'fn_can_san_xuat', 'fn_canh_bao_goc', 'fn_can_san_xuat_goc')
order by p.proname;

-- (2) ĐẾM TRƯỚC / SAU — số dòng phải giảm đúng bằng phụ kiện + thu hồi
select 'fn_canh_bao' as ham,
       (select count(*) from chiahang.fn_canh_bao_goc(p_tu => current_date - 30, p_den => current_date - 1)) as truoc_khi_loc,
       (select count(*) from chiahang.fn_canh_bao(p_tu => current_date - 30, p_den => current_date - 1))     as sau_khi_loc;

-- (3) Còn sót phụ kiện hoặc thu hồi không? PHẢI RA 0 DÒNG.
select t.barcode, t.ma_tham_chieu, t.nganh_1, t.nhom_hang, t.dac_biet
from chiahang.fn_canh_bao(p_tu => current_date - 30, p_den => current_date - 1) t
where coalesce(t.nhom_hang, '') = 'PK'
   or coalesce(chiahang.fn_la_pk(t.nganh_1), false)
   or coalesce(t.dac_biet, '') = 'THU_HOI'
limit 20;

-- (4) Đúng những mã nào bị loại khỏi màn Thiếu hàng (xem cho yên tâm)
select t.barcode, t.ma_tham_chieu, t.nganh_1, t.nhom_hang, t.dac_biet,
       case when coalesce(t.nhom_hang, '') = 'PK' or coalesce(chiahang.fn_la_pk(t.nganh_1), false)
            then 'PHỤ KIỆN' else 'THU HỒI' end as ly_do_loai
from chiahang.fn_canh_bao_goc(p_tu => current_date - 30, p_den => current_date - 1) t
where coalesce(t.nhom_hang, '') = 'PK'
   or coalesce(chiahang.fn_la_pk(t.nganh_1), false)
   or coalesce(t.dac_biet, '') = 'THU_HOI'
order by ly_do_loai, t.barcode
limit 50;

-- (5) Cần sản xuất cũng sạch chưa
select 'fn_can_san_xuat' as ham,
       (select count(*) from chiahang.fn_can_san_xuat_goc(p_so_ngay => 30)) as truoc_khi_loc,
       (select count(*) from chiahang.fn_can_san_xuat(p_so_ngay => 30))     as sau_khi_loc;

-- ============================================================================
-- GỠ BỎ (nếu muốn quay lại như cũ) — bỏ dấu chú thích rồi chạy riêng khối này
-- ============================================================================
-- do $$
-- declare v_ten text; v_args text;
-- begin
--   foreach v_ten in array array['fn_canh_bao', 'fn_can_san_xuat'] loop
--     select pg_get_function_identity_arguments(p.oid) into v_args
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'chiahang' and p.proname = v_ten || '_goc';
--     if v_args is not null then
--       execute format('drop function if exists chiahang.%I(%s)', v_ten, v_args);
--       execute format('alter function chiahang.%I(%s) rename to %I', v_ten || '_goc', v_args, v_ten);
--     end if;
--   end loop;
-- end $$;
