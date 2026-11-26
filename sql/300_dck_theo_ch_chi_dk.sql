-- ============================================================================
-- NEW - 300: màn Đề nghị hàng hoá — dòng "✓ Hôm nay đã gửi phiếu" CHỈ tính phiếu ĐỊNH KỲ (mã DK…)
--   26/11: phòng Điều phối chia HÀNG MỚI (mã HM…) cho Trường Chinh 2 → màn báo nhầm "đã gửi phiếu" dù phiếu định kỳ chưa gửi.
--   Lịch đề nghị / Tổng quan vốn đã chỉ tính DK; nay fn_dck_theo_ch cũng vậy (HM, KC, DSC, PD… không tính là đã gửi đề nghị).
-- ============================================================================
do $do$
declare d text;
  o text := 'where d.ma_ch = p_ma_ch and d.ngay_tao between p_tu and p_den';
  n text := $q$where d.ma_ch = p_ma_ch and d.ngay_tao between p_tu and p_den
      and d.ma_phieu like 'DK%'   -- NEW - 300: chỉ phiếu định kỳ$q$;
begin
  d := pg_get_functiondef('chiahang.fn_dck_theo_ch'::regproc);
  if position('NEW - 300' in d) > 0 then return; end if;
  if position(o in d) = 0 then raise exception 'fn_dck_theo_ch: mốc'; end if;
  execute replace(d, o, n);
end $do$;
