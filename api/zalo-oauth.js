// NS CARE — Callback OAuth Zalo (Vercel Edge). Đổi ?code -> token, lưu Supabase.
export const config = { runtime: 'edge' };

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_ID = process.env.ZALO_APP_ID || '';
const APP_SECRET = process.env.ZALO_APP_SECRET || '';

async function db(path, init = {}) {
  return fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      'Content-Profile': 'care', 'Accept-Profile': 'care',
      Prefer: 'return=representation', ...(init.headers || {})
    }
  });
}
function html(tieu, mo, ok = true) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
     <div style="font-family:system-ui;max-width:480px;margin:70px auto;text-align:center;padding:0 20px">
       <div style="font-size:44px">${ok ? '🎉' : '⚠️'}</div>
       <div style="font-size:21px;font-weight:800;color:#14213A;margin:10px 0">${tieu}</div>
       <p style="color:#4A5670;line-height:1.65">${mo}</p></div>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export default async function handler(req) {
  try {
    if (!APP_ID || !APP_SECRET) return html('Chưa cấu hình', 'Thiếu ZALO_APP_ID / ZALO_APP_SECRET trong Environment Variables của Vercel.', false);
    const url = new URL(req.url);
    let code = url.searchParams.get('code') || '';
    if (!code && req.method === 'POST') { const b = await req.json().catch(() => ({})); code = b.code || ''; }
    if (!code) return html('Thiếu mã uỷ quyền', 'Không nhận được ?code từ Zalo. Thử lại từ đầu.', false);

    const tk = await fetch('https://oauth.zaloapp.com/v4/oa/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', secret_key: APP_SECRET },
      body: new URLSearchParams({ code, app_id: APP_ID, grant_type: 'authorization_code' })
    });
    const j = await tk.json();
    if (!j.access_token) return html('Zalo từ chối', 'Chi tiết: ' + JSON.stringify(j).slice(0, 300), false);

    let oaTen = null;
    try {
      const oa = await fetch('https://openapi.zalo.me/v2.0/oa/getoa', { headers: { access_token: j.access_token } }).then(r => r.json());
      if (oa?.error === 0) oaTen = oa.data?.name || null;
    } catch (_) { /* bỏ qua */ }

    await db('zalo_cau_hinh?id=eq.1', {
      method: 'PATCH',
      body: JSON.stringify({
        access_token: j.access_token, refresh_token: j.refresh_token,
        het_han: new Date(Date.now() + Number(j.expires_in || 3600) * 1000).toISOString(),
        oa_ten: oaTen, cap_nhat_luc: new Date().toISOString()
      })
    });
    return html('Kết nối Zalo OA thành công!',
      (oaTen ? `OA <b>${oaTen}</b> đã sẵn sàng. ` : '') + 'Token tự làm mới — anh đóng tab này và quay lại NS CARE.');
  } catch (e) {
    return html('Lỗi', String(e?.message || e), false);
  }
}
