// NS CARE — GỬI TỨC THÌ (gửi thử + trả lời khách) — Vercel Edge.
// App gọi thẳng endpoint này để gửi ngay, không qua hàng đợi cron.
export const config = { runtime: 'edge' };

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_ID = process.env.ZALO_APP_ID || '';
const APP_SECRET = process.env.ZALO_APP_SECRET || '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type'
};
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json', ...CORS } });

async function db(path, init = {}) {
  return fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: {
    apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json',
    'Content-Profile': 'care', 'Accept-Profile': 'care', Prefer: 'return=representation', ...(init.headers || {}) } });
}
async function rpc(fn, body) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, { method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', 'Content-Profile': 'care' },
    body: JSON.stringify(body) });
  return { ok: r.ok, data: r.ok ? await r.json().catch(() => null) : null, status: r.status };
}
async function zaloToken() {
  const [c] = await (await db('zalo_cau_hinh?id=eq.1')).json();
  if (!c?.refresh_token) throw new Error('CHUA_KET_NOI_ZALO');
  if (c.access_token && c.het_han && new Date(c.het_han).getTime() - Date.now() > 5 * 60000) return c.access_token;
  const r = await fetch('https://oauth.zaloapp.com/v4/oa/access_token', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', secret_key: APP_SECRET },
    body: new URLSearchParams({ app_id: APP_ID, grant_type: 'refresh_token', refresh_token: c.refresh_token }) });
  const j = await r.json();
  if (!j.access_token) throw new Error('REFRESH_LOI');
  await db('zalo_cau_hinh?id=eq.1', { method: 'PATCH', body: JSON.stringify({
    access_token: j.access_token, refresh_token: j.refresh_token || c.refresh_token,
    het_han: new Date(Date.now() + Number(j.expires_in || 3600) * 1000).toISOString(), cap_nhat_luc: new Date().toISOString() }) });
  return j.access_token;
}
const caNhanHoa = (t, kh) => String(t || '').replace(/\{ten\}/g, kh?.ten || 'Quý khách').replace(/\{tinh\}/g, kh?.tinh || '');
async function zaloPost(url, body, token) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', access_token: token }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return { ok: (j.error === 0 || j.error == null) && r.status < 300, ma: String(j.error ?? r.status), msg: j.message || '' };
}
async function guiText(userId, text, token) {
  return zaloPost('https://openapi.zalo.me/v3.0/oa/message/cs', { recipient: { user_id: userId }, message: { text } }, token);
}
async function guiCS(userId, mau, kh, token) {
  if (mau.anh_url) await zaloPost('https://openapi.zalo.me/v3.0/oa/message/cs',
    { recipient: { user_id: userId }, message: { attachment: { type: 'template', payload: { template_type: 'media', elements: [{ media_type: 'image', url: mau.anh_url }] } } } }, token);
  return zaloPost('https://openapi.zalo.me/v3.0/oa/message/cs', { recipient: { user_id: userId }, message: { text: caNhanHoa(mau.noi_dung, kh) } }, token);
}
async function guiZNS(sdt, mau, kh, token) {
  const phone = '84' + String(sdt).replace(/\D/g, '').replace(/^0/, '');
  let data = {}; try { data = JSON.parse(mau.zns_thams || '{}'); } catch (_) { /* rỗng */ }
  if (!Object.keys(data).length) data = { ten: kh?.ten || 'Quý khách' };
  return zaloPost('https://business.openapi.zalo.me/message/template', { phone, template_id: mau.zns_template_id, template_data: data }, token);
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, loi: 'POST only' }, 405);
  try {
    const b = await req.json().catch(() => ({}));
    // 1) Xác thực token nhân viên
    const ma = await rpc('fn_phien_ma', { p_token: b.token || '' });
    if (!ma.ok || !ma.data) return json({ ok: false, loi: 'PHIEN_KHONG_HOP_LE' }, 401);

    const token = await zaloToken();

    // 2a) TRẢ LỜI KHÁCH (text) trong cửa sổ 48h — miễn phí
    if (b.kieu === 'traloi') {
      const [ev] = await (await db(`mkt_su_kien?id=eq.${b.su_kien_id}&select=zalo_user_id`)).json();
      if (!ev?.zalo_user_id) return json({ ok: false, loi: 'KHONG_CO_ZALO_ID' });
      const r = await guiText(ev.zalo_user_id, String(b.text || '').slice(0, 2000), token);
      if (r.ok) await db(`mkt_su_kien?id=eq.${b.su_kien_id}`, { method: 'PATCH', body: JSON.stringify({ da_xu_ly: true }) });
      return json({ ok: r.ok, ma_loi: r.ok ? null : r.ma, kenh: 'tu_van' });
    }

    // 2b) GỬI THỬ 1 SỐ — quyết kênh và gửi ngay
    if (b.kieu === 'thu') {
      const [mau] = await (await db(`mkt_mau?id=eq.${b.mau_id}`)).json();
      if (!mau) return json({ ok: false, loi: 'KHONG_THAY_MAU' });
      const sdt = String(b.sdt || '').replace(/\D/g, '');
      const [kh] = await (await db(`mkt_khach?sdt=eq.${sdt}&select=id,ten,tinh,zalo_user_id,zalo_follow,zalo_tuong_tac_luc`)).json();
      let kq;
      const trong48h = kh?.zalo_tuong_tac_luc && Date.now() - new Date(kh.zalo_tuong_tac_luc).getTime() < 48 * 3600000;
      if (kh?.zalo_user_id && kh?.zalo_follow && trong48h) {
        const r = await guiCS(kh.zalo_user_id, mau, kh, token);
        kq = { ok: r.ok, kenh: 'tu_van', ma_loi: r.ok ? null : r.ma };
      } else if (mau.loai === 'zns' && mau.zns_template_id) {
        const r = await guiZNS(sdt, mau, kh, token);
        kq = { ok: r.ok, kenh: 'zns', ma_loi: r.ok ? null : r.ma };
      } else {
        kq = { ok: false, kenh: null, ma_loi: 'CHUA_CO_KENH' };
      }
      // ghi lịch sử gửi thử
      await db('mkt_gui_thu', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({
        mau_id: b.mau_id, sdt, khach_id: kh?.id || null,
        trang_thai: kq.ok ? 'da_gui' : (kq.ma_loi === 'CHUA_CO_KENH' ? 'bo_qua' : 'loi'),
        kenh_gui: kq.kenh, ma_loi: kq.ma_loi, gui_luc: new Date().toISOString() }) });
      return json(kq);
    }

    // 2c) GỬI TỪ HỘP CHAT (text và/hoặc ảnh) — ghi vào ht_tin
    if (b.kieu === 'chat') {
      const [ht] = await (await db(`ht_hoi_thoai?id=eq.${b.hoi_thoai_id}&select=zalo_user_id,kenh`)).json();
      if (!ht?.zalo_user_id) return json({ ok: false, loi: 'KHONG_CO_HOI_THOAI' });
      const text = String(b.text || '').slice(0, 2000);
      let r = { ok: true, ma: null };
      if (ht.kenh === 'facebook') {
        // ===== GỬI QUA FACEBOOK =====
        const PT = process.env.FB_PAGE_TOKEN || '';
        if (!PT) return json({ ok: false, loi: 'CHUA_CO_FB_TOKEN' });
        const fbSend = async (msg) => {
          const rr = await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${PT}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipient: { id: ht.zalo_user_id }, messaging_type: 'RESPONSE', message: msg })
          });
          const jj = await rr.json().catch(() => ({}));
          return { ok: !jj.error, ma: jj.error ? String(jj.error.code) : null };
        };
        if (b.anh_url) r = await fbSend({ attachment: { type: 'image', payload: { url: b.anh_url, is_reusable: true } } });
        if (text) { const r2 = await fbSend({ text: text.slice(0, 1900) }); if (!b.anh_url) r = r2; else if (!r2.ok) r = r2; }
      } else {
        // ===== GỬI QUA ZALO =====
        if (b.anh_url) {
          r = await zaloPost('https://openapi.zalo.me/v3.0/oa/message/cs', {
            recipient: { user_id: ht.zalo_user_id },
            message: { attachment: { type: 'template', payload: { template_type: 'media',
              elements: [{ media_type: 'image', url: b.anh_url }] } } }
          }, token);
        }
        if (text) {
          const r2 = await guiText(ht.zalo_user_id, text, token);
          if (!b.anh_url) r = r2; else if (!r2.ok) r = r2;
        }
      }
      await rpc('fn_ht_ghi_tin_di', { p_hoi_thoai_id: b.hoi_thoai_id, p_noi_dung: text,
        p_nguoi_gui: ma.data, p_trang_thai: r.ok ? 'da_gui' : 'loi',
        p_ma_loi: r.ok ? null : r.ma, p_anh_url: b.anh_url || null });
      return json({ ok: r.ok, ma_loi: r.ok ? null : r.ma });
    }

    // 2d) LẤY TÊN + AVATAR Zalo cho 1 hội thoại (app gọi khi thiếu tên / bấm nút làm mới)
    if (b.kieu === 'lay_ten') {
      const [ht] = await (await db(`ht_hoi_thoai?id=eq.${b.hoi_thoai_id}&select=zalo_user_id,kenh`)).json();
      if (!ht?.zalo_user_id) return json({ ok: false, loi: 'KHONG_CO_HOI_THOAI' });
      if (ht.kenh === 'facebook') {
        const PT = process.env.FB_PAGE_TOKEN || '';
        if (!PT) return json({ ok: false, loi: 'CHUA_CO_FB_TOKEN' });
        const rr = await fetch(`https://graph.facebook.com/${ht.zalo_user_id}?fields=first_name,last_name,profile_pic&access_token=${PT}`);
        const jj = await rr.json().catch(() => ({}));
        if (jj && !jj.error) {
          const ten = [jj.last_name, jj.first_name].filter(Boolean).join(' ') || null;
          const ava = jj.profile_pic || null;
          if (ten || ava) {
            await rpc('fn_ht_cap_nhat_ten', { p_zalo_user_id: ht.zalo_user_id, p_ten: ten, p_avatar: ava });
            return json({ ok: true, ten, avatar: ava });
          }
        }
        return json({ ok: false, loi: 'FB_' + String(jj?.error?.code ?? rr.status), zalo: jj?.error?.message || '' });
      }
      const r = await fetch('https://openapi.zalo.me/v3.0/oa/user/detail?data=' +
        encodeURIComponent(JSON.stringify({ user_id: ht.zalo_user_id })), { headers: { access_token: token } });
      const j = await r.json().catch(() => ({}));
      const ten = j?.data?.display_name || j?.data?.name || null;
      const ava = j?.data?.avatar || (j?.data?.avatars && (j.data.avatars['240'] || j.data.avatars['120'])) || null;
      if (j?.error === 0 && (ten || ava)) {
        await rpc('fn_ht_cap_nhat_ten', { p_zalo_user_id: ht.zalo_user_id, p_ten: ten, p_avatar: ava });
        return json({ ok: true, ten, avatar: ava });
      }
      // trả lỗi thô của Zalo để chẩn đoán (error -230: ngoài 48h; -201: thiếu quyền...)
      return json({ ok: false, loi: 'ZALO_' + String(j?.error ?? r.status), zalo: j?.message || '' });
    }

    return json({ ok: false, loi: 'KIEU_KHONG_HOP_LE' });
  } catch (e) {
    return json({ ok: false, loi: String(e?.message || e) });
  }
}
