-- ============================================================================
-- NEW - 296: đi kèm 295 — SIÊU TRÍ TUỆ gọi đúng tên kênh mới + biết cách tính ID TikTok
--   • fn_ai_tiktok: 'the' → "Trưng bày" (trưng bày của ID hoặc shop không qua tài khoản)
--   • Tri thức hệ thống: doanh thu 1 ID TikTok = mọi đơn TikTok ghi nhận cho tài khoản đó (trực tiếp, gián tiếp, trưng bày),
--     tên theo ngày đặt; đơn không ghi tài khoản = "Shop – không qua tài khoản" (kế toán gộp vào thoitrangnonson)
-- ============================================================================
do $do$
declare d text;
  o text := $q$when 'the' then 'Thẻ sản phẩm' else 'Khác' end$q$;
  n text := $q$when 'the' then 'Trưng bày' else 'Chưa rõ nguồn' end$q$;
begin
  d := pg_get_functiondef('chiahang.fn_ai_tiktok'::regproc);
  if position(o in d) = 0 then raise exception 'fn_ai_tiktok: mốc'; end if;
  execute replace(d, o, n);
end $do$;

insert into chiahang.ai_tri_thuc (loai, cum_tu, noi_dung, nguon, trang_thai)
select 'tu_ngu', 'doanh thu ID TikTok, gián tiếp, trưng bày, lệch kế toán',
  'Doanh thu 1 ID TikTok (từ 26/11, SQL 295) = MỌI đơn TikTok ghi nhận cho tài khoản đó trong báo cáo phân tích: mua ngay trong LIVE / video, '
  || 'mua từ trưng bày của ID, và gián tiếp (xem LIVE / video của ID rồi mua sau). Kênh = loại nội dung (gián tiếp vẫn tính vào LIVE / video tương ứng). '
  || 'Tài khoản đổi tên / chuyển cửa hàng: đơn trước ngày đổi tính cho tên cũ (bảng tt_tk_ten; tháng 11: nonsonlythuongkiethm → doisaleso19 từ 13/11, '
  || 'nguyenthaibinh.nonson → doisaleso24 từ 20/11). Đơn TikTok không ghi tài khoản nào = "Shop – không qua tài khoản" (kế toán gộp vào thoitrangnonson, mục Video). '
  || 'So với file kế toán: tổng từng ID khớp; khác ở (1) kế toán xếp khách xem LIVE của kênh công ty / shop rồi mua sau vào Video, app xếp vào LIVE; '
  || '(2) kế toán chụp số 1 lần nên đơn huỷ / hoàn sau đó vẫn tính; (3) kế toán bỏ đơn hoàn hàng, app vẫn tính (định nghĩa doanh thu anh chốt 25/11).',
  'he_thong', 'dung'
where not exists (select 1 from chiahang.ai_tri_thuc where cum_tu = 'doanh thu ID TikTok, gián tiếp, trưng bày, lệch kế toán');
