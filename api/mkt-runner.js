// NS CARE — Bộ chạy chiến dịch (Vercel Edge). Supabase pg_cron gọi mỗi 5 phút.
export const config = { runtime: 'edge' };

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_ID = process.env.ZALO_APP_ID || '';
const APP_SECRET = process.env.ZALO_APP_SECRET || '';
const CRON_SECRET = process.env.CRON_SECRET || '';

async function rpc(fn, body) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json', 'Content-Profile': 'care' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`RPC ${fn} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
async function db(path, init = {}) {
  return fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json', 'Content-Profile': 'care', 'Accept-Profile': 'care',
      Prefer: 'return=representation', ...(init.headers || {}) }
  });
}
async function zaloToken() {
  const [c] = await (await db('zalo_cau_hinh?id=eq.1')).json();
  if (!c?.refresh_token) throw new Error('CHUA_KET_NOI_ZALO');
  if (c.access_token && c.het_han && new Date(c.het_han).getTime() - Date.now() > 5 * 60000) return c.access_token;
  const r = await fetch('https://oauth.zaloapp.com/v4/oa/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', secret_key: APP_SECRET },
    body: new URLSearchParams({ app_id: APP_ID, grant_type: 'refresh_token', refresh_token: c.refresh_token })
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('REFRESH_LOI: ' + JSON.stringify(j).slice(0, 200));
  await db('zalo_cau_hinh?id=eq.1', { method: 'PATCH', body: JSON.stringify({
    access_token: j.access_token, refresh_token: j.refresh_token || c.refresh_token,
    het_han: new Date(Date.now() + Number(j.expires_in || 3600) * 1000).toISOString(),
    cap_nhat_luc: new Date().toISOString() }) });
  return j.access_token;
}
const caNhanHoa = (t, kh) => String(t || '').replace(/\{ten\}/g, kh.ten || 'Quý khách').replace(/\{tinh\}/g, kh.tinh || '');
async function zaloPost(url, body, token) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', access_token: token }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return { ok: (j.error === 0 || j.error == null) && r.status < 300, ma: String(j.error ?? r.status) };
}
async function guiCS(userId, mau, kh, token) {
  if (mau.anh_url) await zaloPost('https://openapi.zalo.me/v3.0/oa/message/cs',
    { recipient: { user_id: userId }, message: { attachment: { type: 'template', payload: { template_type: 'media', elements: [{ media_type: 'image', url: mau.anh_url }] } } } }, token);
  return zaloPost('https://openapi.zalo.me/v3.0/oa/message/cs', { recipient: { user_id: userId }, message: { text: caNhanHoa(mau.noi_dung, kh) } }, token);
}
async function guiZNS(sdt, mau, kh, token) {
  const phone = '84' + String(sdt).replace(/\D/g, '').replace(/^0/, '');
  let data = {}; try { data = JSON.parse(mau.zns_thams || '{}'); } catch (_) { /* rỗng */ }
  if (!Object.keys(data).length) data = { ten: kh.ten || 'Quý khách' };
  return zaloPost('https://business.openapi.zalo.me/message/template', { phone, template_id: mau.zns_template_id, template_data: data }, token);
}

export default async function handler(req) {
  if (CRON_SECRET && req.headers.get('x-cron-secret') !== CRON_SECRET)
    return Response.json({ ok: false, loi: 'sai cron secret' }, { status: 401 });
  const t0 = Date.now(), HAN = 55000, kq = {};
  try {
    const dsCd = (await rpc('fn_sync_mkt_cd_chay', {})) || [];
    if (!dsCd.length) return Response.json({ ok: true, thongbao: 'không có chiến dịch chạy' });
    const token = await zaloToken();
    for (const cd of dsCd) {
      await rpc('fn_sync_mkt_chuan_bi', { p_cd: cd.id });
      const mau = cd.mau || {};
      const hs = await db(`mkt_gui?chien_dich_id=eq.${cd.id}&trang_thai=eq.da_gui&gui_luc=gte.${new Date().toISOString().slice(0, 10)}&select=id`, { headers: { Prefer: 'count=exact', Range: '0-0' } });
      let daGui = Number((hs.headers.get('content-range') || '0/0').split('/')[1]) || 0;
      const tran = Number(cd.gioi_han_ngay || 500);
      let gui = 0, loi = 0, boQua = 0;
      while (daGui < tran && Date.now() - t0 < HAN) {
        const lo = (await rpc('fn_sync_mkt_lay_lo', { p_cd: cd.id, p_so: 20 })) || [];
        if (!lo.length) break;
        const bao = [];
        for (const kh of lo) {
          try {
            const trong48h = kh.tuong_tac_luc && Date.now() - new Date(kh.tuong_tac_luc).getTime() < 48 * 3600000;
            if (cd.kenh !== 'zns_only' && kh.zalo_user_id && kh.zalo_follow && trong48h) {
              const r = await guiCS(kh.zalo_user_id, mau, kh, token);
              bao.push({ gui_id: kh.gui_id, trang_thai: r.ok ? 'da_gui' : 'loi', kenh: 'tu_van', ma_loi: r.ok ? null : r.ma });
              r.ok ? (daGui++, gui++) : loi++;
            } else if (cd.kenh !== 'follow_only' && mau.loai === 'zns' && mau.zns_template_id) {
              const r = await guiZNS(kh.sdt, mau, kh, token);
              bao.push({ gui_id: kh.gui_id, trang_thai: r.ok ? 'da_gui' : 'loi', kenh: 'zns', ma_loi: r.ok ? null : r.ma });
              r.ok ? (daGui++, gui++) : loi++;
            } else {
              bao.push({ gui_id: kh.gui_id, trang_thai: 'bo_qua', kenh: null, ma_loi: 'CHUA_CO_KENH' }); boQua++;
            }
          } catch (e) {
            bao.push({ gui_id: kh.gui_id, trang_thai: 'loi', ma_loi: String(e?.message).slice(0, 80) }); loi++;
          }
          await new Promise(res => setTimeout(res, 200));
          if (daGui >= tran || Date.now() - t0 > HAN) break;
        }
        await rpc('fn_sync_mkt_ket_qua', { p_rows: bao });
      }
      kq['cd_' + cd.id] = { gui, loi, bo_qua: boQua, hom_nay: daGui, tran };
    }
    return Response.json({ ok: true, kq });
  } catch (e) {
    return Response.json({ ok: false, loi: String(e?.message || e) }, { status: 200 });
  }
}
