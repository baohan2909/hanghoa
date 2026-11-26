-- NEW - 292: fn_tt_don_ds — sửa lỗi SQL 286: chú thích "-- NEW - 286" nằm giữa dòng làm MẤT 3 trường 'nguon', 'ma_ch', 'ten_ch'
--   (ngăn chi tiết ID không hiện tên cửa hàng ở dòng "Người bán"). Đưa 3 trường về đúng chỗ, không đổi gì khác.
do $do$
declare d text;
  o text := $q$limit 1),   -- NEW - 286 'nguon', d.nguon, 'ma_ch', c.ma_ch, 'ten_ch', ch.ten,$q$;
  n text := $q$limit 1),   -- NEW - 286 tên khách đã che
        'nguon', d.nguon, 'ma_ch', c.ma_ch, 'ten_ch', ch.ten,   -- NEW - 292$q$;
begin
  d := pg_get_functiondef('chiahang.fn_tt_don_ds'::regproc);
  if position(o in d) = 0 then raise exception 'fn_tt_don_ds: không thấy mốc'; end if;
  execute replace(d, o, n);
end $do$;
