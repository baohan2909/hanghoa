-- ============================================================================
-- NEW - 298: MÃ MỚI TẠO TỰ VÀO BẢNG SẢN PHẨM (anh duyệt 26/11)
--   Bảng Sản phẩm (san_pham) lấy từ FILE TỒN — mã mới tạo chưa có tồn ở kho nào thì chưa có dòng trong file → app chưa thấy
--   (vd 209100001 / 209200001 Mũ BH trưng bày 150 / 200 tạo 26/11). Danh mục DATA SẢN PHẨM (sp_danh_muc) thì đã có ngay.
--   Nay: sau mỗi lượt đồng bộ danh mục (fn_sp_danh_muc_don, 1 giờ/lần), mã nào TẠO TRONG 60 NGÀY GẦN ĐÂY (theo dãy mã vạch 2240000…)
--   mà chưa có trong bảng Sản phẩm → tự thêm từ danh mục (mã, mã tham chiếu, ngành, giá niêm yết).
--   Ngày tạo mã: mã mới hơn mọi mã đang có = hôm nay; còn lại lấy ngày tạo của mã liền trước trong dãy.
--   Khi mã có tồn, lượt đồng bộ tồn ghi đè bằng số liệu chuẩn của file tồn như mọi mã khác. Không xoá gì.
-- ============================================================================
create or replace function chiahang._fn_sp_them_ma_moi()
returns integer language plpgsql security definer set search_path to chiahang, public as $$
declare v_nguong text; v_max text; v_hn date := (now() at time zone 'Asia/Ho_Chi_Minh')::date; v_n int;
begin
  select min(barcode), max(barcode) into v_nguong, v_max from san_pham
   where barcode ~ '^2240000\d{6}$' and ngay_tao_ma >= v_hn - 60;
  if v_nguong is null then return 0; end if;
  insert into san_pham (barcode, sku, ma_tham_chieu, nganh_1, nganh_3, gia_niem_yet, ngay_tao_ma, updated_at, la_hang_sale)
  select d.barcode, d.sku, d.ma_tham_chieu, d.nganh_1, d.nganh_3, coalesce(d.gia_niem_yet, 0),
         case when d.barcode > v_max then v_hn
              else coalesce((select s.ngay_tao_ma from san_pham s where s.barcode ~ '^2240000\d{6}$' and s.barcode < d.barcode
                              order by s.barcode desc limit 1), v_hn) end,
         now(), false
    from sp_danh_muc d
   where d.barcode ~ '^2240000\d{6}$' and d.barcode >= v_nguong
     and not exists (select 1 from san_pham s where s.barcode = d.barcode)
  on conflict (barcode) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function chiahang._fn_sp_them_ma_moi() from public, anon, authenticated;

-- gắn vào cuối lượt đồng bộ danh mục
do $do$
declare d text;
  o text := $q$return jsonb_build_object('dong', v_moi, 'cu', v_cu, 'xoa', v_xoa, 'bo_qua', v_bo, 'thung', fn_thung_giai_ma());$q$;
  n text := $q$return jsonb_build_object('dong', v_moi, 'cu', v_cu, 'xoa', v_xoa, 'bo_qua', v_bo, 'thung', fn_thung_giai_ma(),
    'ma_moi', _fn_sp_them_ma_moi());   -- NEW - 298: mã mới tạo chưa có tồn → tự vào bảng Sản phẩm$q$;
begin
  d := pg_get_functiondef('chiahang.fn_sp_danh_muc_don'::regproc);
  if position('_fn_sp_them_ma_moi' in d) > 0 then return; end if;
  if position(o in d) = 0 then raise exception 'fn_sp_danh_muc_don: mốc'; end if;
  execute replace(d, o, n);
end $do$;

-- chạy ngay 1 lần
select chiahang._fn_sp_them_ma_moi();
