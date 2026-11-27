// Tạo đơn điều chuyển trên Odoo qua API của IT (v3.114.0; CHÍNH THỨC từ v3.118.0 — mở theo tham_so odoo_api.tat_ca)
//   App  -> Edge Function odoo-dieu-chuyen (khoá API nằm ở máy chủ, KHÔNG có trong app) -> https://open.nonson.vn/api/webhook/transfer
//   Mỗi cặp (kho cung ứng -> kho yêu cầu) = 1 đơn. Tên đơn duy nhất; đơn đã tạo thành công không gửi lại được.
//   Mở hộp gửi từ bất kỳ màn hình nào: moOdoo({ tieuDe, man, lyDo, don, onThanhCong, onExcel, canh })
import { useEffect, useState } from 'react';
import { sb } from './supabase.js';
import { SUPABASE_URL, SUPABASE_ANON } from '../config.js';

const FN = SUPABASE_URL + '/functions/v1/odoo-dieu-chuyen';
let cache = { token: null, p: null };
let loiTam = false;   // NEW - 3.169.0: lần đọc cấu hình gần nhất lỗi tạm (để màn hình báo, không ẩn lặng lẽ)
export const odooLoiTam = () => loiTam;

// Cấu hình + quyền của tài khoản đang đăng nhập (đọc 1 lần / phiên)
// NEW - 3.169.0: lỗi TẠM (máy chủ báo 521, quá giờ, mất mạng) KHÔNG còn bị nhớ cả phiên.
//   Trước: 1 lần đọc lỗi -> kết quả rỗng bị giữ tới khi tải lại trang -> MỌI màn ẩn nút / ô "tạo đơn Odoo"
//   (27/11 14:20 máy chủ báo 521 -> phiếu DS261127-142336-D28 xác nhận xong mà không có đơn Odoo, không báo gì).
//   Nay: thử 3 lần (ngay · 1,5 giây · 4 giây); vẫn lỗi -> trả undefined (khác null = máy chủ trả "chưa mở")
//   và xoá nhớ để lần gọi sau thử lại; useOdooCfg tự thử lại 20 giây / lần.
export function layCfgOdoo(token, moi = false) {
  if (!token) return Promise.resolve(null);
  if (!moi && cache.token === token && cache.p) return cache.p;
  const p = (async () => {
    for (const cho of [0, 1500, 4000]) {
      if (cho) await new Promise((r) => setTimeout(r, cho));
      try {
        const { data, error } = await sb.rpc('fn_odoo_cfg', { p_token: token });
        if (!error) { loiTam = false; return data; }
      } catch { /* thử lại */ }
    }
    loiTam = true;
    return undefined;
  })();
  cache = { token, p };
  p.then((c) => { if (c === undefined && cache.p === p) cache = { token: null, p: null }; });
  return p;
}

// NEW - 3.126: ô "Đồng thời tạo đơn trên Odoo" nhớ theo TÀI KHOẢN trên máy chủ (cfg.kem, chưa chọn = bật) — đổi máy không mất
export async function luuKemOdoo(token, bat) {
  const c = await layCfgOdoo(token);
  if (c) c.kem = !!bat;   // cập nhật bản đang nhớ trong phiên
  const { error } = await sb.rpc('fn_odoo_kem', { p_token: token, p_bat: !!bat });
  return !error;
}

// null = tài khoản chưa được mở -> màn hình không hiện nút Odoo
export function useOdooCfg(user) {
  const [cfg, setCfg] = useState(null);
  useEffect(() => {
    let song = true; let hen = null;
    const tai = () => layCfgOdoo(user?.token).then((c) => {
      if (!song) return;
      if (c === undefined && user?.token) { hen = setTimeout(tai, 20000); return; }   // NEW - 3.169.0: lỗi tạm -> 20 giây thử lại
      setCfg(c);
    });
    tai();
    return () => { song = false; clearTimeout(hen); };
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

// NEW - 303: NHẬN HÀNG TỪ APP — máy chủ kiểm quyền + số rồi gọi Odoo …/transfer/complete-incoming
//   dong: [{ barcode, so_luong }] (0 = không nhận mã đó). Trả { ok, loi, thong_bao, tong, tong_con, can_ly_do? }
export async function nhanOdoo({ token, name, dong, ghiChu = '', xemTruoc = false }) {
  let r;
  try {
    r = await fetch(FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_ANON}`, apikey: SUPABASE_ANON },
      body: JSON.stringify({ token, hanh_dong: 'nhan', name, dong, ghi_chu: ghiChu, xem_truoc: !!xemTruoc }),
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

// NEW - 213: lấy phiếu xuất / nhận MỚI NHẤT từ Odoo (API pickings) cho vài đơn — máy chủ gọi Odoo, app hỏi lại kết quả.
// Trả { ok, so_doi, loi } sau tối đa ~15 giây.
export async function layMoiOdoo(token, names) {
  const ds = [...new Set((names || []).filter(Boolean))].slice(0, 50);
  if (!ds.length) return { ok: false, loi: 'Không có đơn' };
  const { data, error } = await sb.rpc('fn_odoo_pk_lam_moi', { p_token: token, p_names: ds });
  if (error) return { ok: false, loi: error.message };
  if (!data?.ok) return { ok: false, loi: data?.loi || 'Không gửi được' };
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, i < 3 ? 900 : 1500));
    const k = await sb.rpc('fn_odoo_pk_doc', { p_token: token, p_req: data.req_id });
    if (k.error) return { ok: false, loi: k.error.message };
    if (k.data?.xong) return { ok: !k.data.loi, so_doi: k.data.so_doi || 0, so_don: k.data.so_don || 0, loi: k.data.loi };
  }
  return { ok: false, loi: 'Odoo trả lời chậm — app sẽ tự cập nhật ở lượt chạy ngầm kế tiếp' };
}
