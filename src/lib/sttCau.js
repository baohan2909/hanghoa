// ============================================================================
// NEW - 3.127 SIÊU TRÍ TUỆ · cầu nối màn hình
//   Màn nào cho AI điều khiển thì đăng ký 1 "cầu" (dangKyCau) gồm các hàm dùng đúng engine của màn đó.
//   Trợ lý (SieuTriTue.jsx) gọi cầu khi AI yêu cầu công cụ màn hình. Chuyển màn con qua datMo / useNgheMo.
// ============================================================================
import { useEffect, useRef } from 'react';

const cau = new Map();
const ngheCau = new Set();
export function dangKyCau(ten, ctrl) {
  cau.set(ten, ctrl);
  ngheCau.forEach((f) => f());
  return () => { if (cau.get(ten) === ctrl) cau.delete(ten); ngheCau.forEach((f) => f()); };
}
export const layCau = (ten) => cau.get(ten) || null;
export function choCau(ten, ms = 10000) {
  return new Promise((ok) => {
    const c = cau.get(ten);
    if (c) { ok(c); return; }
    let h = null;
    const f = () => { const x = cau.get(ten); if (x) { ngheCau.delete(f); clearTimeout(h); ok(x); } };
    ngheCau.add(f);
    h = setTimeout(() => { ngheCau.delete(f); ok(null); }, ms);
  });
}

// yêu cầu mở màn con (vd Đội Sale -> Chia hàng đội sale -> Chia từng đội): màn con nghe và tự chuyển
let moCho = null;
const ngheMo = new Set();
export function datMo(y) { moCho = { ...y, luc: Date.now() }; ngheMo.forEach((f) => f(moCho)); }
export function useNgheMo(fn) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const f = (y) => ref.current(y);
    if (moCho && Date.now() - moCho.luc < 10000) f(moCho);
    ngheMo.add(f);
    return () => { ngheMo.delete(f); };
  }, []);
}

// đợi điều kiện đúng (kiểm mỗi 60ms), hết giờ trả false
export function cho(dk, ms = 15000, buoc = 60) {
  return new Promise((ok) => {
    const t0 = Date.now();
    const lap = () => {
      let d = false;
      try { d = !!dk(); } catch { d = false; }
      if (d) { ok(true); return; }
      if (Date.now() - t0 > ms) { ok(false); return; }
      setTimeout(lap, buoc);
    };
    lap();
  });
}
