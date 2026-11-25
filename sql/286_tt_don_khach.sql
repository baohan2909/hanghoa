-- NEW - 286: TikTok Shop — chi tiết đơn theo ID (anh 25/11: bấm ID xem đơn nào, ai mua, tình trạng, bán gì)
--   fn_tt_don_ds thêm 'khach' = tên người mua ĐÃ CHE (TikTok che sẵn, vd "l**"; tên nào chưa che thì app tự che "L***").
--   Lấy từ đơn Nhanh cùng mã (nh_don.app_order_id = mã đơn TikTok, có chỉ mục idx_nh_don_app). Không lấy SĐT / địa chỉ.
do $do$
declare d text;
  o text := $$'kenh', d.kenh, 'creator', d.creator,$$;
  n text := $$'kenh', d.kenh, 'creator', d.creator,
        'khach', (select case when n.khach_ten like '%*%' then n.khach_ten else left(n.khach_ten, 1) || '***' end
                  from nh_don n where n.app_order_id = d.ma_don and coalesce(n.khach_ten, '') <> '' order by n.id desc limit 1),   -- NEW - 286$$;
begin
  d := pg_get_functiondef('chiahang.fn_tt_don_ds'::regproc);
  if (length(d) - length(replace(d, o, ''))) / length(o) <> 1 then raise exception 'fn_tt_don_ds: mốc không duy nhất'; end if;
  execute replace(d, o, n);
end $do$;
