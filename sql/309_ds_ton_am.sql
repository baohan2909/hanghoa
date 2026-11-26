-- ============================================================================
-- NEW - 309: Đội Sale › Chia từng đội — cột Tồn hiện ĐÚNG số Odoo kể cả ÂM (anh báo 26/11 17:54)
--   Trước: fn_dang_ve làm tròn tồn âm thành 0 → ô Tồn trống, cộng với Về/đi thì dư 1 so với thật
--          (vd Đội 05 MBH-TRUNGBAY-200: Odoo tồn −1, đang về 33 → thật còn 32, màn hiện 0 + 33).
--   Nay: màn Chia từng đội lấy tồn âm thẳng từ ton_kho (chỉ màn này; các màn khác giữ nguyên, chờ anh duyệt).
--        Mã có tồn âm mà không bán / không về vẫn hiện để thấy.
-- ============================================================================
do $do$
declare d text;
  o1 text := $q$  tk as (select barcode, ton t, ve d
         from fn_ds_dang_ve(array[p_ma_ch])),$q$;
  n1 text := $q$  tk as (select d.barcode, case when t.ton_hien_tai < 0 then t.ton_hien_tai else d.ton end t, d.ve d   -- NEW - 309: tồn âm giữ nguyên
         from fn_ds_dang_ve(array[p_ma_ch]) d
         left join ton_kho t on t.ma_ch = p_ma_ch and t.barcode = d.barcode),$q$;
  o2 text := $q$ma as (select barcode from tk where t > 0 or d <> 0$q$;
  n2 text := $q$ma as (select barcode from tk where t <> 0 or d <> 0$q$;
begin
  d := pg_get_functiondef('chiahang.fn_ds_chia_doi'::regproc);
  if position('NEW - 309' in d) > 0 then return; end if;
  if (length(d) - length(replace(d, o1, ''))) / length(o1) <> 1 then raise exception 'fn_ds_chia_doi: mốc 1'; end if;
  if (length(d) - length(replace(d, o2, ''))) / length(o2) <> 1 then raise exception 'fn_ds_chia_doi: mốc 2'; end if;
  execute replace(replace(d, o1, n1), o2, n2);
end $do$;
