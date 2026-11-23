// ============================================================================
// NEW - 3.131 KHOÁ THU NHỎ trên điện thoại
//   Lỗi: chụm 2 ngón làm cả app co nhỏ lại (tỉ lệ < 100%) vì có phần nội dung rộng hơn màn hình.
//   Cách chặn:
//     1. Chụm 2 ngón khi đang ở 100% -> chặn (touchmove + gesturechange của Safari). Vẫn cho PHÓNG TO để xem kỹ bảng / biểu đồ,
//        và từ phóng to chụm về được tới đúng 100% thì dừng.
//     2. Lỡ đã bị co (tỉ lệ < 100%) -> tự đưa về 100%.
//   (Chạm đúp phóng to đã tắt bằng CSS: html { touch-action: manipulation })
// ============================================================================
export function khoaThuNho() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (!('ontouchstart' in window) && !(navigator.maxTouchPoints > 0)) return;
  const tiLe = () => (window.visualViewport ? window.visualViewport.scale : 1);
  const kc = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  let d0 = 0;
  document.addEventListener('touchstart', (e) => { if (e.touches.length === 2) d0 = kc(e.touches); }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 2) return;
    const d = kc(e.touches);
    if (d < d0 - 2 && tiLe() <= 1.01 && e.cancelable) e.preventDefault();   // đang chụm (thu nhỏ) khi đã ở 100%
    d0 = d;
  }, { passive: false });
  // Safari iPhone: sự kiện gesture riêng (scale < 1 = đang chụm)
  const chanGesture = (e) => { if (typeof e.scale === 'number' && e.scale < 1 && tiLe() <= 1.01) e.preventDefault(); };
  document.addEventListener('gesturestart', chanGesture, { passive: false });
  document.addEventListener('gesturechange', chanGesture, { passive: false });

  // đã bị co dưới 100% -> đưa về 100% (đặt tạm maximum-scale=1 rồi trả lại để vẫn phóng to được)
  const meta = document.querySelector('meta[name="viewport"]');
  const goc = meta?.getAttribute('content') || 'width=device-width, initial-scale=1';
  let hen = 0;
  const veGoc = () => {
    if (!meta || tiLe() >= 0.99) return;
    meta.setAttribute('content', goc.replace(/,?\s*maximum-scale=[\d.]+/g, '') + ', maximum-scale=1');
    clearTimeout(hen);
    hen = setTimeout(() => meta.setAttribute('content', goc), 400);
  };
  window.visualViewport?.addEventListener('resize', () => setTimeout(veGoc, 150));
  document.addEventListener('touchend', (e) => { if (e.touches.length === 0) setTimeout(veGoc, 200); }, { passive: true });
}
