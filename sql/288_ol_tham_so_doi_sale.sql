-- NEW - 288: CHIA HÀNG ONLINE làm theo Đội Sale (3.159.4) — cho phép Quản trị đặt mặc định 3 ô gõ số:
--   suc_ban (Sức bán N ngày, 1–28) · chia_du (Chia đủ N ngày) · ty_le (Tỷ lệ %). Giữ nguyên các khoá cũ.
do $do$
declare d text;
  o text := $q$where k in ('ngay_phu', 'an_toan', 'lam_tron', 'toi_thieu', 'ly_do', 'giu_nguon', 'nguon');$q$;
  n text := $q$where k in ('ngay_phu', 'an_toan', 'lam_tron', 'toi_thieu', 'ly_do', 'giu_nguon', 'nguon', 'suc_ban', 'chia_du', 'ty_le');   -- NEW - 288$q$;
begin
  d := pg_get_functiondef('chiahang.fn_ol_cau_hinh_luu'::regproc);
  if (length(d) - length(replace(d, o, ''))) / length(o) <> 1 then raise exception 'fn_ol_cau_hinh_luu: không thấy mốc'; end if;
  execute replace(d, o, n);
end $do$;
