// Tạo đơn điều chuyển trên Odoo qua API của IT (v3.114.0; CHÍNH THỨC từ v3.118.0 — mở theo tham_so odoo_api.tat_ca)
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
  const nt = String(chung.nguoiTao || d.nguoi_tao || '').trim();
  if (nt) o.nguoi_tao = nt;
  if (d.cho_trung) o.cho_trung = true;   // đã xác nhận gửi dù giống hệt đơn đã tạo trong 48 giờ (SQL 206)
  if (d.cho_vuot) o.cho_vuot = true;     // đã xác nhận gửi dù vượt tồn khả dụng của kho (SQL 207)
  const sale = String(d.sale_tai_cua_hang || '').trim();
  if (sale) o.sale_tai_cua_hang = sale;  // đội sale: cửa hàng đội đang bán
  return o;
}

// Huỷ / xoá đơn trên Odoo (SQL 207 — bật/tắt bằng tham số odoo_api.huy_bat / xoa_bat; đã bật 21/11)
export async function huyOdoo({ token, id, hanhDong, lyDo }) {
  let r;
  try {
    r = await fetch(FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_ANON}`, apikey: SUPABASE_ANON },
      body: JSON.stringify({ token, hanh_dong: hanhDong, id, ly_do: lyDo }),
    });
  } catch (e) {
    return { ok: false, loi: 'Không kết nối được máy chủ: ' + (e?.message || e) };
  }
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { ok: false, loi: `HTTP ${r.status}: ${t.slice(0, 300)}` }; }
}

// Sửa đơn (v3.118.0 — SQL 209): Odoo chưa có API sửa -> máy chủ huỷ đơn cũ rồi tạo đơn mới đã sửa (mã đơn mới)
//   chiTiet: [{ barcode, sku, nhu_cau }] — số mới từng dòng (0 = bỏ mã). Trả { ok, name_moi, id_moi, odoo_id, loi, vuot?, chan_vuot?, huy_cu? }
export async function suaOdoo({ token, id, chiTiet, lyDo, choVuot = false, xemTruoc = false }) {
  let r;
  try {
    r = await fetch(FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_ANON}`, apikey: SUPABASE_ANON },
      body: JSON.stringify({ token, hanh_dong: 'sua', id, chi_tiet: chiTiet, ly_do: lyDo, cho_vuot: !!choVuot, xem_truoc: !!xemTruoc }),
    });
  } catch (e) {
    return { ok: false, loi: 'Không kết nối được máy chủ: ' + (e?.message || e) };
  }
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { ok: false, loi: `HTTP ${r.status}: ${t.slice(0, 300)}` }; }
}

// Ghi chú gần đây (mỗi máy) — bấm để điền nhanh
const KHOA_GC = 'ns_odoo_gc_gan_day';
export function ghiChuGanDay() {
  try { const a = JSON.parse(localStorage.getItem(KHOA_GC) || '[]'); return Array.isArray(a) ? a.slice(0, 8) : []; } catch { return []; }
}
export function nhoGhiChu(t) {
  const s = String(t || '').trim(); if (!s) return;
  try { localStorage.setItem(KHOA_GC, JSON.stringify([s, ...ghiChuGanDay().filter((x) => x !== s)].slice(0, 8))); } catch { /* bỏ qua */ }
}
// Cửa hàng đội sale đang bán (nhớ theo từng đội, mỗi máy)
const KHOA_SALE = 'ns_odoo_sale_ch';
export function saleChCuaDoi(doi) {
  try { return JSON.parse(localStorage.getItem(KHOA_SALE) || '{}')[doi] || ''; } catch { return ''; }
}
export function nhoSaleCh(doi, ch) {
  try { const m = JSON.parse(localStorage.getItem(KHOA_SALE) || '{}'); m[doi] = ch; localStorage.setItem(KHOA_SALE, JSON.stringify(m)); } catch { /* bỏ qua */ }
}

export const moOdoo = (opts) => window.dispatchEvent(new CustomEvent('ns-odoo-mo', { detail: opts }));

// Lịch sử đơn theo tài liệu nguồn (mã phiếu / mã lệnh)
export async function odooTheoNguon(token, nguon) {
  if (!token || !nguon?.length) return [];
  const { data, error } = await sb.rpc('fn_odoo_ds', { p_token: token, p_ngay: 60, p_nguon: nguon });
  return error ? [] : data || [];
}
