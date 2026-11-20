// Tạo đơn điều chuyển trên Odoo qua API của IT (v3.114.0 — đang THỬ NGHIỆM, chỉ tài khoản trong tham_so odoo_api.nguoi_thu)
//   App  -> Edge Function odoo-dieu-chuyen (khoá API nằm ở máy chủ, KHÔNG có trong app) -> https://open.nonson.vn/api/webhook/transfer
//   Mỗi cặp (kho cung ứng -> kho yêu cầu) = 1 đơn. Tên đơn duy nhất; đơn đã tạo thành công không gửi lại được.
//   Mở hộp gửi từ bất kỳ màn hình nào: moOdoo({ tieuDe, man, lyDo, don, onThanhCong, onExcel, canh })
import { useEffect, useState } from 'react';
import { sb } from './supabase.js';
import { SUPABASE_URL, SUPABASE_ANON } from '../config.js';

const FN = SUPABASE_URL + '/functions/v1/odoo-dieu-chuyen';
let cache = { token: null, p: null };

// Cấu hình + quyền của tài khoản đang đăng nhập (đọc 1 lần / phiên)
export function layCfgOdoo(token, moi = false) {
  if (!token) return Promise.resolve(null);
  if (!moi && cache.token === token && cache.p) return cache.p;
  cache = {
    token,
    p: Promise.resolve(sb.rpc('fn_odoo_cfg', { p_token: token }))
      .then(({ data, error }) => (error ? null : data)).catch(() => null),
  };
  return cache.p;
}

// null = tài khoản chưa được mở -> màn hình không hiện nút Odoo
export function useOdooCfg(user) {
  const [cfg, setCfg] = useState(null);
  useEffect(() => {
    let song = true;
    layCfgOdoo(user?.token).then((c) => { if (song) setCfg(c); });
    return () => { song = false; };
  }, [user?.token]);
  return cfg?.cho_phep ? cfg : null;
}

export async function goiOdoo({ token, man, requests, xemTruoc }) {
  let r;
  try {
    r = await fetch(FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_ANON}`, apikey: SUPABASE_ANON },
      body: JSON.stringify({ token, man, requests, xem_truoc: !!xemTruoc }),
    });
  } catch (e) {
    return { ok: false, loi: 'Không kết nối được máy chủ: ' + (e?.message || e) };
  }
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { ok: false, loi: `HTTP ${r.status}: ${t.slice(0, 300)}` }; }
}

// Gom dòng chuyển thành đơn: mỗi cặp (kho cung ứng, kho yêu cầu) = 1 đơn
//   dong: [{ tu, den, den_ten?, sku?, barcode?, sl, ma? }]   mau: trường chung cho mọi đơn (prefix, tai_lieu_nguon, ghi_chu, ly_do…)
export function gomDon(dong, mau = {}) {
  const m = new Map();
  (dong || []).forEach((d) => {
    const sl = Math.floor(Number(d.sl) || 0);
    if (sl <= 0 || !d.tu || !d.den) return;
    const k = d.tu + '>' + d.den;
    let o = m.get(k);
    if (!o) {
      o = { ...mau, kho_cung_ung: d.tu, kho_yeu_cau: d.den, ten_yeu_cau: d.den_ten || '', chi_tiet: [] };
      m.set(k, o);
    }
    o.chi_tiet.push({ sku: d.sku || '', barcode: d.barcode || '', nhu_cau: sl, ma: d.ma || '' });
  });
  return [...m.values()];
}

// Phần gửi lên máy chủ (bỏ trường chỉ để hiển thị)
export function thanhRequest(d, chung) {
  const ghi = [d.ghi_chu, chung.ghiChu].map((x) => String(x || '').trim()).filter(Boolean).join(' | ');
  const o = {
    tai_lieu_nguon: d.tai_lieu_nguon || '', kho_cung_ung: d.kho_cung_ung, kho_yeu_cau: d.kho_yeu_cau,
    ly_do: d.ly_do || chung.lyDo, chi_tiet: d.chi_tiet.map((c) => ({ sku: c.sku || '', barcode: c.barcode || '', nhu_cau: c.nhu_cau })),
  };
  if (d.name) o.name = d.name; else if (d.prefix) o.prefix = d.prefix;
  if (ghi) o.ghi_chu = ghi.slice(0, 500);
  if (String(chung.nguoiTao || '').trim()) o.nguoi_tao = String(chung.nguoiTao).trim();
  return o;
}

export const moOdoo = (opts) => window.dispatchEvent(new CustomEvent('ns-odoo-mo', { detail: opts }));

// Lịch sử đơn theo tài liệu nguồn (mã phiếu / mã lệnh)
export async function odooTheoNguon(token, nguon) {
  if (!token || !nguon?.length) return [];
  const { data, error } = await sb.rpc('fn_odoo_ds', { p_token: token, p_ngay: 60, p_nguon: nguon });
  return error ? [] : data || [];
}
