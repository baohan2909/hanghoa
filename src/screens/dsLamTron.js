import { useEffect, useState } from 'react';
import { sb } from '../lib/supabase.js';

// ============================================================================
// QUY TẮC LÀM TRÒN + CHIA THEO TỶ TRỌNG — dùng chung cho Chia từng đội, Chia hàng mới đội sale, Đội mới (v3.112.0)
//   · Luôn làm tròn LÊN mức hợp lệ gần nhất sau khi tính nhu cầu, KHÔNG vượt tồn khả dụng
//   · Giá 250k: 5, 10, 15… · 350k: 3, 5, 10, 15… · ≥ 400k: 5, 10, 15… · giá khác / chưa có giá: bội 5
//   · Lưỡi: bội 5 · Túi ráp (Túi kraft): chỉ S, M — bước 200, mặc định 400 · phụ kiện khác: không làm tròn
//   Cấu hình: tham_so 'ds_lam_tron' (sửa ở màn Tham số) — thiếu thì dùng mặc định dưới đây
// ============================================================================
export const LT_MAC_DINH = {
  buoc_mac_dinh: 5,
  gia: [
    { tu: 250000, den: 250000, muc: [], buoc: 5 },
    { tu: 350000, den: 350000, muc: [3], buoc: 5 },
    { tu: 400000, den: 99999999, muc: [], buoc: 5 },
  ],
  luoi: { nganh_3: 'Lưỡi mũ bảo hiểm các loại', buoc: 5 },
  tui_rap: { nganh_3: 'Túi kraft', buoc: 200, size: ['S', 'M'], mac_dinh: { S: 400, M: 400 } },
  phu_kien_khac_buoc: 1,
  doi_moi: {
    tong: 1050,
    co_cau: [{ gia: 250000, sl: 500 }, { gia: 350000, sl: 50 }, { gia: 400000, sl: 400 }, { gia: 500000, sl: 100 }],
    w_chinh: 0.6, w_mang: 0.15, tran_mau: 0.25, tran_mau_sac: 0.5,
  },
};

let boNho = null;
export function useLamTron() {
  const [cfg, setCfg] = useState(boNho || LT_MAC_DINH);
  useEffect(() => {
    if (boNho) return;
    sb.from('tham_so').select('gia_tri').eq('key', 'ds_lam_tron').eq('pham_vi', 'GLOBAL').maybeSingle()
      .then(({ data }) => {
        const g = data?.gia_tri;
        boNho = g && typeof g === 'object' ? { ...LT_MAC_DINH, ...g, doi_moi: { ...LT_MAC_DINH.doi_moi, ...(g.doi_moi || {}) } } : LT_MAC_DINH;
        setCfg(boNho);
      });
  }, []);
  return cfg;
}

const chuan = (s) => String(s || '').normalize('NFC').trim().toLowerCase();
export const kGia = (g) => (g ? (g % 1000 === 0 ? `${g / 1000}k` : Number(g).toLocaleString('vi')) : '—');

// "NS008ATG-ĐN052-M" -> mẫu "NS008ATG", họ màu "ĐN", size "M"
export const mauMa = (mtc) => String(mtc || '').split('-')[0];
export function hoMau(mtc) {
  const p = String(mtc || '').split('-');
  if (p.length < 2) return '';
  const m = p[1].normalize('NFC').match(/^[^\d]+/);
  return m ? m[0].toUpperCase() : '';
}
export const sizeCuoi = (mtc) => { const p = String(mtc || '').split('-'); return p.length > 1 ? p[p.length - 1].toUpperCase() : ''; };

export function moTaMuc(q) {
  const b = Math.max(1, q.buoc || 1);
  if (b === 1 && !(q.muc || []).length) return 'không làm tròn';
  const ds = [...new Set([...(q.muc || []), b, b * 2, b * 3])].sort((a, c) => a - c);
  return ds.join(', ') + '…';
}

// Quy tắc của 1 dòng: x = { pk, n3, mtc, gia }
export function quyTac(x, cfg) {
  const c = cfg || LT_MAC_DINH;
  if (x.pk) {
    const n3 = chuan(x.n3);
    if (c.tui_rap && n3 && n3 === chuan(c.tui_rap.nganh_3)) {
      const z = sizeCuoi(x.mtc);
      const cho = (c.tui_rap.size || []).map((s) => String(s).toUpperCase()).includes(z);
      const buoc = c.tui_rap.buoc || 200;
      const md = (c.tui_rap.mac_dinh || {})[z] ?? 400;
      return { loai: 'tui', buoc, muc: [], macDinh: md, cho, size: z,
        nhan: cho ? `Túi ráp ${z}: bước ${buoc} (${buoc}, ${buoc * 2}, ${buoc * 3}…), mặc định ${md}` : `Túi ráp ${z}: đội sale chỉ dùng size ${(c.tui_rap.size || []).join(', ')}` };
    }
    if (c.luoi && n3 && n3 === chuan(c.luoi.nganh_3)) {
      const buoc = c.luoi.buoc || 5;
      return { loai: 'luoi', buoc, muc: [], nhan: `Lưỡi: bội ${buoc} (${moTaMuc({ buoc, muc: [] })})` };
    }
    const buoc = c.phu_kien_khac_buoc || 1;
    return { loai: 'pk', buoc, muc: [], nhan: buoc > 1 ? `Phụ kiện: bội ${buoc}` : 'Phụ kiện: không làm tròn' };
  }
  const g = Number(x.gia) || 0;
  const r = g ? (c.gia || []).find((q) => g >= q.tu && g <= q.den) : null;
  if (r) return { loai: 'gia', buoc: r.buoc || 5, muc: r.muc || [], nhan: `Giá ${kGia(g)}: ${moTaMuc(r)}` };
  const buoc = c.buoc_mac_dinh || 5;
  return { loai: 'mac_dinh', buoc, muc: [], nhan: g ? `Giá ${kGia(g)}: ${moTaMuc({ buoc })} (mặc định)` : `Chưa có giá sale: ${moTaMuc({ buoc })} (mặc định)` };
}

// làm tròn LÊN mức hợp lệ gần nhất (n <= 0 -> 0)
export function lenMuc(n, q) {
  if (!(n > 0)) return 0;
  const b = Math.max(1, q.buoc || 1);
  const s = Math.ceil(n / b - 1e-9) * b;
  const m = (q.muc || []).filter((v) => v >= n).sort((a, c) => a - c)[0];
  return m != null ? Math.min(m, s) : s;
}
// mức hợp lệ lớn nhất <= n (dùng để KHÔNG vượt kho)
export function xuongMuc(n, q) {
  if (!(n > 0)) return 0;
  const b = Math.max(1, q.buoc || 1);
  const s = Math.floor(n / b + 1e-9) * b;
  const m = (q.muc || []).filter((v) => v <= n).sort((a, c) => c - a)[0] || 0;
  return Math.max(s, m);
}
export const mucNho = (q) => lenMuc(1, q);

// Cân về đúng tổng T bằng cách lùi / tiến từng mức (giữ quy tắc làm tròn, không vượt trần).
//   a: {k: số}, ds: [{k, w, raw, tran, min}] — lùi mã bị làm tròn lên nhiều nhất / tỷ trọng thấp trước,
//   tiến mã thiếu nhiều nhất / tỷ trọng cao trước. Trả lệch còn lại (T - tổng) nếu không khớp được do bước làm tròn.
export function canBang(a, ds, T, q, choTang) {
  const tong = () => ds.reduce((s, d) => s + (a[d.k] || 0), 0);
  let S = tong();
  for (let vong = 0; vong < 3000 && S > T; vong++) {
    const ung = ds.filter((d) => (a[d.k] || 0) > (d.min || 0))
      .map((d) => { const nd = Math.max(xuongMuc((a[d.k] || 0) - 1, q), 0); return { d, nd, giam: (a[d.k] || 0) - nd }; })
      .filter((u) => u.nd >= (u.d.min || 0));
    if (!ung.length) break;
    // ưu tiên: giảm không làm hụt dưới T; trong đó mã thừa so với raw nhiều nhất, tỷ trọng thấp nhất
    ung.sort((x, y) => ((x.giam <= S - T ? 0 : 1) - (y.giam <= S - T ? 0 : 1))
      || (((a[y.d.k] || 0) - (y.d.raw || 0)) - ((a[x.d.k] || 0) - (x.d.raw || 0)))
      || ((x.d.w || 0) - (y.d.w || 0)));
    const u = ung[0];
    a[u.d.k] = u.nd; S -= u.giam;
  }
  for (let vong = 0; vong < 3000 && S < T; vong++) {
    const tatCa = ds.map((d) => { const cu = a[d.k] || 0; const nu = lenMuc(cu + 1, q); return { d, nu, tang: nu - cu }; })
      .filter((u) => u.tang > 0 && u.tang <= T - S && u.nu <= (u.d.tran ?? Infinity) && (u.d.w || 0) > 0);
    // choTang(d, tang): ràng buộc mềm (vd trần mỗi mẫu) — hết ứng viên hợp lệ mới bỏ qua ràng buộc để đủ tổng
    const hop = choTang ? tatCa.filter((u) => choTang(u.d, u.tang)) : tatCa;
    const ung = hop.length ? hop : tatCa;
    if (!ung.length) break;
    ung.sort((x, y) => (((y.d.raw || 0) - (a[y.d.k] || 0)) - ((x.d.raw || 0) - (a[x.d.k] || 0))) || ((y.d.w || 0) - (x.d.w || 0)));
    const u = ung[0];
    a[u.d.k] = u.nu; S += u.tang;
  }
  return T - S;
}

// Chia tổng T theo tỷ trọng w, có min / max mỗi nơi và trần tran (kho) — làm tròn theo q rồi cân đúng tổng.
//   ds: [{k, w, min, max, tran}] -> { a: {k: số}, raw: {k: số lẻ}, lech }
export function chiaTyTrong(T, ds, q) {
  const a = {}, raw = {};
  ds.forEach((d) => { a[d.k] = 0; raw[d.k] = 0; });
  if (!(T > 0) || !ds.length) return { a, raw, lech: T > 0 ? T : 0 };
  const tranCua = (d) => Math.min(d.max ?? Infinity, d.tran ?? Infinity);
  let R = T;
  ds.forEach((d) => { if (d.min > 0) { raw[d.k] = Math.min(d.min, tranCua(d)); R -= raw[d.k]; } });
  for (let vong = 0; vong < 30 && R > 1e-9; vong++) {
    const mo = ds.filter((d) => (d.w || 0) > 0 && raw[d.k] < tranCua(d) - 1e-9);
    const W = mo.reduce((s, d) => s + d.w, 0);
    if (!W) break;
    let dung = 0;
    mo.forEach((d) => { const them = Math.min((R * d.w) / W, tranCua(d) - raw[d.k]); raw[d.k] += them; dung += them; });
    R -= dung;
    if (dung < 1e-9) break;
  }
  ds.forEach((d) => {
    const t = tranCua(d);
    const capM = Number.isFinite(t) ? xuongMuc(t, q) : Infinity;
    a[d.k] = raw[d.k] > 1e-9 ? Math.min(lenMuc(raw[d.k], q), capM) : 0;
    if (d.min > 0 && a[d.k] < d.min) a[d.k] = Math.min(lenMuc(d.min, q), capM);
  });
  const lech = canBang(a, ds.map((d) => ({ ...d, raw: raw[d.k], tran: tranCua(d) })), T, q);
  return { a, raw, lech };
}
