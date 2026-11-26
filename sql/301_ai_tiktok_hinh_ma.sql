-- ============================================================================
-- NEW - 301: SIÊU TRÍ TUỆ — hình sản phẩm: AI chỉ ghi MÃ trong ngoặc ![…](MÃ), máy chủ tự điền link hình
--   (26/11 12:04: AI chép link dài bị đứt giữa chừng). Sửa câu hướng dẫn trong kết quả công cụ tiktok cho khớp.
-- ============================================================================
do $do$
declare d text;
  o text := $q$viết mỗi mã 1 dòng đúng dạng ![MÃ · SL cái · doanh thu](hinh), app tự hiện thành lưới hình;$q$;
  n text := $q$viết mỗi mã 1 dòng đúng dạng ![MÃ · SL cái · doanh thu](MÃ) — trong ngoặc chỉ ghi MÃ, app tự điền hình và hiện thành lưới;$q$;
begin
  d := pg_get_functiondef('chiahang.fn_ai_tiktok'::regproc);
  if position(n in d) > 0 then return; end if;
  if position(o in d) = 0 then raise exception 'fn_ai_tiktok: mốc'; end if;
  execute replace(d, o, n);
end $do$;
