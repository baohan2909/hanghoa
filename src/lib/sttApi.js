// ============================================================================
// NEW - 3.127 SIÊU TRÍ TUỆ · gọi máy chủ (Edge Function sieu-tri-tue, SQL 215)
//   Khoá FableAI KHÔNG có ở đây — chỉ nằm trong Supabase Vault, máy chủ tự đọc.
// ============================================================================
import { sb } from './supabase.js';
import { SUPABASE_URL, SUPABASE_ANON } from '../config.js';

const FN = SUPABASE_URL + '/functions/v1/sieu-tri-tue';
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_ANON}`, apikey: SUPABASE_ANON };

// Gửi 1 yêu cầu và đọc luồng NDJSON. onSuKien(e) gọi cho từng sự kiện. Trả { client, xong, loi, viec_id }.
export async function goiLuong(body, onSuKien, signal) {
  let r;
  try {
    r = await fetch(FN, { method: 'POST', headers: H, body: JSON.stringify(body), signal });
  } catch (e) {
    if (e?.name === 'AbortError') return { loi: 'Đã dừng', dung: true };
    return { loi: 'Không kết nối được máy chủ SIÊU TRÍ TUỆ — kiểm tra mạng rồi thử lại' };
  }
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('ndjson')) {
    let j = null; try { j = await r.json(); } catch { /* */ }
    return { loi: j?.loi || j?.message || `Máy chủ trả lỗi ${r.status}` + (r.status === 404 ? ' — chưa triển khai hàm sieu-tri-tue' : '') };
  }
  const out = { client: null, xong: null, loi: null, viec_id: null };
  const doc = r.body.getReader();
  const dec = new TextDecoder();
  let du = '';
  const xuLy = (dong) => {
    if (!dong.trim()) return;
    let e; try { e = JSON.parse(dong); } catch { return; }
    if (e.viec_id) out.viec_id = e.viec_id;
    if (e.t === 'client') out.client = e;
    if (e.t === 'xong') out.xong = e;
    if (e.t === 'loi') out.loi = e.loi;
    try { onSuKien?.(e); } catch { /* */ }
  };
  try {
    for (;;) {
      const { value, done } = await doc.read();
      if (done) break;
      du += dec.decode(value, { stream: true });
      let i;
      while ((i = du.indexOf('\n')) >= 0) { xuLy(du.slice(0, i)); du = du.slice(i + 1); }
    }
    xuLy(du);
  } catch (e) {
    if (e?.name === 'AbortError') return { ...out, loi: 'Đã dừng', dung: true };
    if (!out.xong && !out.client) out.loi = out.loi || 'Mất kết nối giữa chừng — xem lại ở Lịch sử';
  }
  return out;
}

export async function goiJson(body) {
  try {
    const r = await fetch(FN, { method: 'POST', headers: H, body: JSON.stringify(body) });
    const j = await r.json().catch(() => null);
    return j || { ok: false, loi: `Máy chủ trả lỗi ${r.status}` };
  } catch { return { ok: false, loi: 'Không kết nối được máy chủ' }; }
}

const rpc = async (fn, args) => {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(/does not exist|schema cache/i.test(error.message) ? 'Máy chủ chưa có ' + fn + ' — cần chạy SQL 215' : error.message);
  return data;
};
export const aiQuyen = (token) => rpc('fn_ai_quyen', { p_token: token });
export const aiLichSu = (token, tatCa = false, gioiHan = 80) => rpc('fn_ai_lich_su', { p_token: token, p_tat_ca: tatCa, p_gioi_han: gioiHan });
export const aiViecCt = (token, id) => rpc('fn_ai_viec_ct', { p_token: token, p_id: id });
export const aiPhienTin = (token, phien) => rpc('fn_ai_phien_tin', { p_token: token, p_phien: phien });
export const aiDuyet = (token, id) => rpc('fn_ai_thao_tac_duyet', { p_token: token, p_id: id });
export const aiXong = (token, id, ok, kq, loi) => rpc('fn_ai_thao_tac_xong', { p_token: token, p_id: id, p_ok: ok, p_ket_qua: kq ?? null, p_loi: loi ?? null });
export const aiHuy = (token, id) => rpc('fn_ai_thao_tac_huy', { p_token: token, p_id: id });
export const aiCauHinh = (token) => rpc('fn_ai_cau_hinh', { p_token: token });
export const aiCauHinhLuu = (token, cfg) => rpc('fn_ai_cau_hinh_luu', { p_token: token, p_cfg: cfg });
export const aiLuuKhoa = (token, khoa) => rpc('fn_ai_luu_khoa', { p_token: token, p_khoa: khoa });
