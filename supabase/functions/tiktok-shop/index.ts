// NS FLOW — Edge Function: tiktok-shop   (NEW - 3.140 TikTok Shop · SQL 237/238)
// Dùng app "NS CARE" trên Partner Center (app_key lưu ở bảng tt_api, khoá bí mật ở Vault 'tiktok_app_secret').
//
//   GET  ?code=...            → nhận ủy quyền từ TikTok (đường dẫn chuyển hướng của app), đổi token, lấy shop_cipher, lưu tt_api
//   POST {viec:'keo'}         → kéo đơn theo update_time (lịch tq_lam_moi 5 phút/lần, hoặc nút "Lấy ngay" trong app)
//   POST {viec:'thu', duong_dan, tham_so, method, body}  → gọi thử 1 API, trả NGUYÊN VĂN phản hồi (để đối chiếu tên trường)
//   POST bắt buộc header x-tt-khoa = tt_api.khoa_noi_bo (SQL tự gửi qua pg_net).
//
// Chữ ký TikTok Shop (đã kiểm ở NS CARE): app_secret + đường_dẫn + (key+value đã sắp xếp, bỏ sign & access_token) + body + app_secret
// → HMAC-SHA256 khoá app_secret → hex.

const SB_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('SB_URL') || '';
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SB_SERVICE_KEY') || '';
const API = 'https://open-api.tiktokglobalshop.com';
const AUTH = 'https://auth.tiktok-shops.com';
const NGAN_SACH_MS = 100_000;     // tối đa ~100 giây mỗi lượt
const TRANG_TOI_DA = 30;          // tối đa 30 trang × 100 đơn mỗi lượt

type J = Record<string, any>;

const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });

async function rpc(fn: string, body: unknown) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json',
      'Content-Profile': 'chiahang', 'Accept-Profile': 'chiahang',
    },
    body: JSON.stringify(body ?? {}),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`RPC ${fn} ${r.status}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}

async function kySign(secret: string, duongDan: string, thamSo: Record<string, string>, thoBody = '') {
  const keys = Object.keys(thamSo).filter((k) => k !== 'sign' && k !== 'access_token').sort();
  let chuoi = duongDan + keys.map((k) => k + thamSo[k]).join('');
  if (thoBody) chuoi += thoBody;
  chuoi = secret + chuoi + secret;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(chuoi));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function goiTikTok(cfg: J, token: string, duongDan: string, thamSoThem: Record<string, string> = {},
  method = 'GET', body: unknown = null) {
  const thoBody = body ? JSON.stringify(body) : '';
  const thamSo: Record<string, string> = { app_key: cfg.app_key, timestamp: String(Math.floor(Date.now() / 1000)), ...thamSoThem };
  thamSo.sign = await kySign(cfg.app_secret, duongDan, thamSo, thoBody);
  const r = await fetch(API + duongDan + '?' + new URLSearchParams(thamSo), {
    method,
    headers: { 'x-tts-access-token': token, 'Content-Type': 'application/json' },
    ...(thoBody ? { body: thoBody } : {}),
  });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { code: -1, message: 'Không đọc được phản hồi', http: r.status, tho: t.slice(0, 500) }; }
}

const isoTuGiay = (s: unknown) => (s ? new Date(Number(s) * 1000).toISOString() : null);

// ---- token: tự làm mới khi còn dưới 2 ngày ----
async function damBaoToken(cfg: J): Promise<string> {
  const conLai = cfg.het_han ? Date.parse(cfg.het_han) - Date.now() : -1;
  if (cfg.access_token && conLai > 48 * 3600e3) return cfg.access_token;
  if (!cfg.refresh_token) throw new Error('CHUA_UY_QUYEN');
  const r = await fetch(AUTH + '/api/v2/token/refresh?' + new URLSearchParams({
    app_key: cfg.app_key, app_secret: cfg.app_secret, refresh_token: cfg.refresh_token, grant_type: 'refresh_token',
  }));
  const j = await r.json().catch(() => null);
  const d = j?.data || {};
  if (!d.access_token) throw new Error('LAM_MOI_TOKEN_LOI: ' + JSON.stringify(j || {}).slice(0, 300));
  await rpc('fn_tt_api_luu', { p: {
    access_token: d.access_token, refresh_token: d.refresh_token || null,
    het_han: isoTuGiay(d.access_token_expire_in), refresh_het_han: isoTuGiay(d.refresh_token_expire_in),
    quyen: d.granted_scopes || null,
  } });
  return d.access_token;
}

// ---- chuyển 1 đơn API → các dòng theo khoá ngắn (giống file Excel) ----
function capDiaChi(o: J) {
  const a = o.recipient_address || {};
  const ds: J[] = Array.isArray(a.district_info) ? a.district_info : [];
  const cap = ds.filter((x) => String(x.address_level || '').toUpperCase() !== 'L0');   // L0 = quốc gia
  return { tinh: cap[0]?.address_name || a.region || null, phuong: cap.length > 1 ? cap[cap.length - 1]?.address_name : null };
}
function dongTuDon(o: J): J[] {
  const p = o.payment || {};
  const dc = capDiaChi(o);
  const chung: J = {
    d: String(o.id), st: o.status, np: o.is_pre_order ? 'Pre-order' : 'Normal',
    t_tao: o.create_time, t_tt: o.paid_time, t_rts: o.rts_time, t_gui: o.collection_time ?? o.shipping_time,
    t_giao: o.delivery_time, t_huy: o.cancel_time, hb: o.cancellation_initiator, lyd: o.cancel_reason,
    ht: o.fulfillment_type, vd: o.tracking_number, dv: o.shipping_provider, kg: o.delivery_option_name,
    tinh: dc.tinh, phuong: dc.phuong, ttoan: o.payment_method_name, goi: o.packages?.[0]?.id,
    tong: p.total_amount, ps: p.shipping_fee, pg: p.original_shipping_fee, pssh: p.shipping_fee_seller_discount,
    pss: p.shipping_fee_platform_discount, thue: p.tax, ban: o.update_time,
  };
  const items: J[] = Array.isArray(o.line_items) ? o.line_items : [];
  return items.map((li) => {
    const sl = Number(li.quantity ?? 1) || 1;
    const gg = Number(li.original_price ?? 0);
    return {
      ...chung, sk: li.sku_id, ss: li.seller_sku, ten: li.product_name, pl: li.sku_name, sl,
      gg, tg: gg * sl, gs: Number(li.platform_discount ?? 0),
      gsh: Number(li.seller_discount ?? 0), ts: Number(li.sale_price ?? 0),
    };
  });
}

// ---- kéo đơn theo update_time tăng dần, cất mốc sau mỗi trang ----
async function keoDon(cfg: J) {
  const batDau = Date.now();
  if (!cfg.app_secret) throw new Error('THIEU_APP_SECRET');
  let token = await damBaoToken(cfg);
  if (!cfg.shop_cipher) await layShop(cfg, token);
  const cipher = cfg.shop_cipher;
  if (!cipher) throw new Error('THIEU_SHOP_CIPHER');

  const bayGio = Math.floor(Date.now() / 1000) - 60;
  let moc = Number(cfg.keo_moc) || bayGio - (Number(cfg.lui_ngay) || 30) * 86400;
  let trang = 0, soDon = 0, napId: number | null = null, pageToken = '', mau: J | null = null, xongHet = false;
  const tong = { moi: 0, cap_nhat: 0, bo_qua: 0, loi: 0 };

  while (trang < TRANG_TOI_DA && Date.now() - batDau < NGAN_SACH_MS) {
    const thamSo: Record<string, string> = { shop_cipher: cipher, page_size: '100', sort_field: 'update_time', sort_order: 'ASC' };
    if (pageToken) thamSo.page_token = pageToken;
    const j = await goiTikTok(cfg, token, '/order/202309/orders/search', thamSo, 'POST',
      { update_time_ge: moc, update_time_lt: bayGio });
    if (j?.code !== 0) {
      await rpc('fn_tt_api_ghi', { p: { xong: true, loi: `orders/search ${j?.code}: ${j?.message || ''}`.slice(0, 500),
        kq: { trang, so_don: soDon, ...tong, phan_hoi: JSON.stringify(j).slice(0, 800) } } });
      return { ok: false, loi: j?.message, code: j?.code, trang, so_don: soDon };
    }
    const ds: J[] = j?.data?.orders || [];
    if (!mau && ds.length) mau = ds[0];
    if (ds.length) {
      const dong = ds.flatMap(dongTuDon);
      const kq = await rpc('fn_tt_nap_api', { p_ds: dong, p_meta: { nap_id: napId, ten_file: 'API TikTok Shop' } });
      napId = kq?.nap_id ?? napId;
      tong.moi += kq?.moi || 0; tong.cap_nhat += kq?.cap_nhat || 0; tong.bo_qua += kq?.bo_qua || 0; tong.loi += kq?.loi || 0;
      soDon += ds.length;
    }
    trang++;
    pageToken = j?.data?.next_page_token || '';
    const maxCapNhat = Math.max(0, ...ds.map((o) => Number(o.update_time) || 0));
    if (!pageToken) { moc = bayGio; xongHet = true; }
    else if (maxCapNhat > moc) moc = maxCapNhat;     // dừng giữa chừng: lượt sau đi tiếp từ đơn cập nhật muộn nhất đã nhận
    await rpc('fn_tt_api_ghi', { p: { keo_moc: moc } });
    if (!pageToken) break;
  }
  const kq = { trang, so_don: soDon, ...tong, xong_het: xongHet, giay: Math.round((Date.now() - batDau) / 1000) };
  await rpc('fn_tt_api_ghi', { p: { xong: true, loi: '', kq, ...(mau ? { mau } : {}) } });
  return { ok: true, ...kq };
}

async function layShop(cfg: J, token: string) {
  const sh = await goiTikTok(cfg, token, '/authorization/202309/shops');
  const s = sh?.data?.shops?.[0];
  if (s) {
    cfg.shop_cipher = s.cipher;
    await rpc('fn_tt_api_luu', { p: { shop_id: s.id || null, shop_ten: s.name || null, shop_cipher: s.cipher || null } });
  }
  return sh;
}

function html(tieu: string, mo: string, ok = true) {
  return new Response(
    `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
     <title>${tieu}</title>
     <body style="margin:0;background:#F7F5F1;font-family:'Be Vietnam Pro',system-ui,sans-serif">
     <div style="max-width:520px;margin:70px auto;padding:28px 24px;background:#fff;border:1px solid #E6E2D8;border-radius:16px;text-align:center">
       <div style="width:54px;height:54px;margin:0 auto 12px;border-radius:50%;display:grid;place-items:center;
         background:${ok ? 'linear-gradient(135deg,#14213A 0%,#1E5F63 62%,#3FB6A8 100%)' : '#FCEAF2'};color:${ok ? '#fff' : '#B0115C'};font-size:26px;font-weight:800">${ok ? '✓' : '!'}</div>
       <div style="font-size:20px;font-weight:800;color:#14213A;margin:6px 0 8px">${tieu}</div>
       <p style="color:#4A5670;line-height:1.65;margin:0">${mo}</p></div></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

Deno.serve(async (req) => {
  if (!SB_URL || !SB_KEY) return json({ ok: false, loi: 'THIEU_SUPABASE_URL_HOAC_SERVICE_KEY' }, 500);
  const url = new URL(req.url);

  // ===== 1) Ủy quyền: TikTok chuyển hướng về đây kèm ?code =====
  if (req.method === 'GET') {
    const code = url.searchParams.get('code') || url.searchParams.get('auth_code') || '';
    if (!code) return html('Điều phối hàng hóa · TikTok Shop', 'Đường dẫn này nhận ủy quyền từ TikTok Shop. Mở link ủy quyền trong app để kết nối.', true);
    try {
      const cfg = await rpc('fn_tt_api_cfg', {});
      if (!cfg?.app_secret) return html('Chưa lưu khoá bí mật', 'Chạy câu SQL lưu khoá bí mật app NS CARE vào Vault (tên <b>tiktok_app_secret</b>) rồi ủy quyền lại.', false);
      const r = await fetch(AUTH + '/api/v2/token/get?' + new URLSearchParams({
        app_key: cfg.app_key, app_secret: cfg.app_secret, auth_code: code, grant_type: 'authorized_code',
      }));
      const j = await r.json().catch(() => null);
      const d = j?.data || {};
      if (!d.access_token) return html('TikTok từ chối', 'Chi tiết: ' + JSON.stringify(j || {}).slice(0, 400), false);
      await rpc('fn_tt_api_luu', { p: {
        access_token: d.access_token, refresh_token: d.refresh_token || null,
        het_han: isoTuGiay(d.access_token_expire_in), refresh_het_han: isoTuGiay(d.refresh_token_expire_in),
        quyen: d.granted_scopes || null, ket_noi: true,
      } });
      cfg.access_token = d.access_token;
      const sh = await layShop(cfg, d.access_token);
      const ten = sh?.data?.shops?.[0]?.name;
      return html('Đã kết nối TikTok Shop', (ten ? `Cửa hàng <b>${ten}</b> đã kết nối với app Điều phối hàng hóa. ` : '') +
        'Đơn hàng sẽ tự về app mỗi 5 phút. Anh đóng tab này và quay lại app.');
    } catch (e) {
      return html('Lỗi kết nối', String((e as Error)?.message || e), false);
    }
  }

  // ===== 2) Lệnh nội bộ (SQL gửi qua pg_net) =====
  if (req.method !== 'POST') return json({ ok: false, loi: 'SAI_PHUONG_THUC' }, 405);
  let cfg: J;
  try { cfg = await rpc('fn_tt_api_cfg', {}); } catch (e) { return json({ ok: false, loi: String((e as Error).message) }, 500); }
  if (!cfg || req.headers.get('x-tt-khoa') !== cfg.khoa_noi_bo) return json({ ok: false, loi: 'KHONG_CO_QUYEN' }, 401);
  const body: J = await req.json().catch(() => ({}));

  try {
    if (body.viec === 'thu') {
      const token = await damBaoToken(cfg);
      const thamSo: Record<string, string> = { ...(body.tham_so || {}) };
      if (body.can_cipher !== false && cfg.shop_cipher && !thamSo.shop_cipher) thamSo.shop_cipher = cfg.shop_cipher;
      const kq = await goiTikTok(cfg, token, String(body.duong_dan || '/authorization/202309/shops'), thamSo,
        String(body.method || 'GET'), body.body ?? null);
      return json({ ok: true, phan_hoi: kq });
    }
    const kq = await keoDon(cfg);
    return json(kq);
  } catch (e) {
    const loi = String((e as Error)?.message || e).slice(0, 500);
    try { await rpc('fn_tt_api_ghi', { p: { xong: true, loi } }); } catch { /* bỏ qua */ }
    return json({ ok: false, loi }, 200);
  }
});
