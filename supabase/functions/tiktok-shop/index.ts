// NS FLOW — Edge Function: tiktok-shop   (NEW - 3.140 TikTok Shop · SQL 237/238)
// Dùng app "NS CARE" trên Partner Center (app_key lưu ở bảng tt_api, khoá bí mật ở Vault 'tiktok_app_secret').
//
//   GET  ?code=...            → nhận ủy quyền từ TikTok (đường dẫn chuyển hướng của app), đổi token, lấy shop_cipher, lưu tt_api
//   POST {viec:'keo'}         → kéo đơn theo update_time (lịch tq_lam_moi 5 phút/lần, hoặc nút "Lấy ngay" trong app)
//   POST {viec:'thong_ke'}    → NEW - 3.141: kéo phiên LIVE + thống kê video (có ID người bán), mỗi 60 phút
//   POST {viec:'lien_ket'}    → NEW - 3.142: API liên kết — ID người bán từng đơn; bình thường chạy ké sau mỗi lượt 'keo'
//   POST {viec:'tra_hang'}    → NEW - 3.143: trả hàng / hoàn tiền (returns/search); bình thường chạy ké sau mỗi lượt 'keo'
//   POST {viec:'doi_soat'}    → NEW - 3.143: đối soát từng ngày với TikTok (đơn, đơn liên kết, trả hàng) + tự kéo bù — lịch 3 giờ/lần
//                              NEW - 3.145: đối soát + kéo bù đủ từ ngày tt_api.ds_tu (anh chốt 01/10/2026), tối đa 62 ngày gần nhất
//   POST {viec:'ai_report'}   → NEW - 3.144: báo cáo phân tích cấp từng đơn — ID người bán mọi tài khoản (chính thức, marketing, nhà sáng tạo) — lịch 20 phút/lần
//   POST {viec:'san_pham'}    → NEW - 3.141: đồng bộ sản phẩm + ngành (loại hàng); bình thường chạy ké sau mỗi lượt 'keo'
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
  // NEW - 3.143: TikTok báo vượt giới hạn tốc độ (36009002) → chờ rồi gọi lại, tối đa 4 lần
  for (let lan = 0; ; lan++) {
    const thamSo: Record<string, string> = { app_key: cfg.app_key, timestamp: String(Math.floor(Date.now() / 1000)), ...thamSoThem };
    thamSo.sign = await kySign(cfg.app_secret, duongDan, thamSo, thoBody);
    const r = await fetch(API + duongDan + '?' + new URLSearchParams(thamSo), {
      method,
      headers: { 'x-tts-access-token': token, 'Content-Type': 'application/json' },
      ...(thoBody ? { body: thoBody } : {}),
    });
    const t = await r.text();
    let j: J;
    try { j = JSON.parse(t); } catch { j = { code: -1, message: 'Không đọc được phản hồi', http: r.status, tho: t.slice(0, 500) }; }
    if ((j?.code === 36009002 || r.status === 429) && lan < 4) { await new Promise((ok) => setTimeout(ok, 1500 * (lan + 1))); continue; }
    return j;
  }
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
  // NEW - 3.141: nhớ token mới trong lượt này để bước sau (sản phẩm) không làm mới lần 2
  cfg.access_token = d.access_token; cfg.het_han = isoTuGiay(d.access_token_expire_in);
  if (d.refresh_token) cfg.refresh_token = d.refresh_token;
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
    // NEW - 3.143: đơn gửi mẫu / đơn đổi hàng — không tính là bán
    mau: !!o.is_sample_order, doi: !!o.is_replacement_order,
  };
  const items: J[] = Array.isArray(o.line_items) ? o.line_items : [];
  return items.map((li) => {
    const sl = Number(li.quantity ?? 1) || 1;
    const gg = Number(li.original_price ?? 0);
    return {
      ...chung, sk: li.sku_id, ss: li.seller_sku, ten: li.product_name, pl: li.sku_name, sl,
      // NEW - 3.141: đơn LIVE có room_id = mã phiên LIVE → SQL tra ra ID người bán
      room: li.room_id || undefined, kenh: li.room_id ? 'LIVE' : undefined,
      // NEW - 3.143: dòng bị hủy riêng trong đơn còn hiệu lực (hủy một phần) + quà tặng kèm
      huy: String(o.status || '').toUpperCase() !== 'CANCELLED' && String(li.display_status || '').toUpperCase() === 'CANCELLED' ? sl : 0,
      qua: li.is_gift ? sl : 0,
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

// ---- NEW - 3.142: API liên kết — ID người bán cho TỪNG ĐƠN (LIVE / VIDEO / …), mã video / mã phiên, hoa hồng ----
//   Search Seller Affiliate Orders 202410, lọc theo create_time; lần đầu lùi 'lui_ngay' ngày, sau đó quét lại từ mốc − 6 giờ.
//   Dở trang thì cất page_token + khung giờ, lượt sau đi tiếp.
async function keoLienKet(cfg: J, batDau: number, hetGio = 115_000) {
  const kq: J = { trang: 0, don: 0, dong: 0, gan: 0 };
  const conGio = () => hetGio - (Date.now() - batDau);
  if (conGio() < 15_000) return { ...kq, bo_qua: 'het_gio' };
  const token = await damBaoToken(cfg);
  const cipher = cfg.shop_cipher;
  const bayGio = Math.floor(Date.now() / 1000) - 60;
  const tuMoi = cfg.lk_moc ? Number(cfg.lk_moc) - 6 * 3600 : bayGio - (Number(cfg.lui_ngay) || 30) * 86400;
  let pt = String(cfg.lk_token || '');
  let tu = pt ? Number(cfg.lk_tu) || 0 : tuMoi;
  let den = pt ? Number(cfg.lk_den) || 0 : bayGio;
  if (pt && (!tu || !den)) { pt = ''; tu = tuMoi; den = bayGio; }
  let xong = false;
  while (conGio() > 12_000 && kq.trang < 150) {
    const ts: Record<string, string> = { shop_cipher: cipher, page_size: '100' };
    if (pt) ts.page_token = pt;
    const j = await goiTikTok(cfg, token, '/affiliate_seller/202410/orders/search', ts, 'POST', { create_time_ge: tu, create_time_lt: den });
    if (j?.code !== 0) {
      kq.loi = `${j?.code}: ${j?.message || ''}`.slice(0, 200);
      if (pt) await rpc('fn_tt_lk_nap', { p: { token: '' } });   // trang hỏng/hết hạn → lượt sau quét lại khung từ mốc
      break;
    }
    if (kq.trang === 0 && j?.data?.total_count != null) kq.tong = j.data.total_count;
    const ds: J[] = j?.data?.orders || [];
    pt = j?.data?.next_page_token || '';
    kq.trang++; kq.don += ds.length;
    xong = !pt || !ds.length;
    const r = await rpc('fn_tt_lk_nap', { p: { ds, token: xong ? '' : pt, tu, den, xong } });
    kq.dong += r?.dong || 0; kq.gan += r?.gan || 0;
    if (xong) break;
  }
  Object.assign(kq, { xong, tu, den, giay: Math.round((Date.now() - batDau) / 1000), luc: new Date().toISOString() });
  await rpc('fn_tt_lk_nap', { p: { kq } });
  return kq;
}

// ---- NEW - 3.143: TRẢ HÀNG / HOÀN TIỀN — returns/search theo update_time tăng dần, cất mốc sau mỗi trang ----
async function keoTraHang(cfg: J, batDau: number, hetGio = 118_000) {
  const kq: J = { trang: 0, tra: 0, gan: 0 };
  const conGio = () => hetGio - (Date.now() - batDau);
  if (conGio() < 12_000) return { ...kq, bo_qua: 'het_gio' };
  const token = await damBaoToken(cfg);
  const bayGio = Math.floor(Date.now() / 1000) - 60;
  const moc = Number(cfg.tra_moc) || bayGio - ((Number(cfg.lui_ngay) || 30) + 30) * 86400;
  let pt = '', xong = false, mocMoi = moc;
  while (conGio() > 8_000 && kq.trang < 60) {
    const ts: Record<string, string> = { shop_cipher: cfg.shop_cipher, page_size: '50', sort_field: 'update_time', sort_order: 'ASC' };
    if (pt) ts.page_token = pt;
    const j = await goiTikTok(cfg, token, '/return_refund/202309/returns/search', ts, 'POST', { update_time_ge: moc, update_time_lt: bayGio });
    if (j?.code !== 0) { kq.loi = `${j?.code}: ${j?.message || ''}`.slice(0, 200); break; }
    const ds: J[] = j?.data?.return_orders || [];
    pt = j?.data?.next_page_token || '';
    kq.trang++;
    xong = !pt || !ds.length;
    const maxSua = Math.max(0, ...ds.map((r) => Number(r.update_time) || 0));
    mocMoi = xong ? bayGio : Math.max(mocMoi, maxSua);
    const r = await rpc('fn_tt_tra_nap', { p: { ds, moc: mocMoi } });
    kq.tra += r?.tra || 0; kq.gan += r?.gan || 0;
    if (xong) break;
  }
  Object.assign(kq, { xong, giay: Math.round((Date.now() - batDau) / 1000), luc: new Date().toISOString() });
  await rpc('fn_tt_tra_nap', { p: { xong, kq } });
  return kq;
}

// ---- NEW - 3.143: ĐỐI SOÁT từng ngày với TikTok (đơn · đơn liên kết · trả hàng) + tự kéo bù ngày còn thiếu ----
const mocNgay = (ngay: string) => Math.floor(Date.parse(ngay + 'T00:00:00+07:00') / 1000);
async function demTikTok(cfg: J, token: string, duongDan: string, tu: number, den: number, kichTrang = '1') {
  const j = await goiTikTok(cfg, token, duongDan, { shop_cipher: cfg.shop_cipher, page_size: kichTrang }, 'POST', { create_time_ge: tu, create_time_lt: den });
  return j?.code === 0 ? Number(j?.data?.total_count ?? NaN) : NaN;
}
async function keoKhung(cfg: J, token: string, loai: 'don' | 'lk' | 'tra', tu: number, den: number, conGio: () => number) {
  const dd = loai === 'don' ? '/order/202309/orders/search' : loai === 'lk' ? '/affiliate_seller/202410/orders/search' : '/return_refund/202309/returns/search';
  let pt = '', trang = 0, so = 0, napId: number | null = null, xong = false;
  while (conGio() > 10_000 && trang < 60) {
    const ts: Record<string, string> = { shop_cipher: cfg.shop_cipher, page_size: loai === 'tra' ? '50' : '100' };
    if (pt) ts.page_token = pt;
    const j = await goiTikTok(cfg, token, dd, ts, 'POST', { create_time_ge: tu, create_time_lt: den });
    if (j?.code !== 0) return { loi: `${loai} ${j?.code}: ${j?.message || ''}`.slice(0, 200), trang, so };
    const ds: J[] = loai === 'tra' ? (j?.data?.return_orders || []) : (j?.data?.orders || []);
    if (ds.length) {
      if (loai === 'don') {
        const r = await rpc('fn_tt_nap_api', { p_ds: ds.flatMap(dongTuDon), p_meta: { nap_id: napId, ten_file: 'API TikTok Shop — đối soát kéo bù' } });
        napId = r?.nap_id ?? napId;
      } else if (loai === 'lk') await rpc('fn_tt_lk_nap', { p: { ds } });
      else await rpc('fn_tt_tra_nap', { p: { ds } });
    }
    so += ds.length; trang++;
    pt = j?.data?.next_page_token || '';
    if (!pt || !ds.length) { xong = true; break; }
  }
  return { trang, so, xong };
}
async function doiSoat(cfg: J) {
  const batDau = Date.now();
  const HET = 130_000;
  const conGio = () => HET - (Date.now() - batDau);
  if (!cfg.app_secret) throw new Error('THIEU_APP_SECRET');
  const token = await damBaoToken(cfg);
  if (!cfg.shop_cipher) await layShop(cfg, token);
  const homNay = ngayVN(new Date());
  // NEW - 3.145: lấy dữ liệu từ ngày anh chốt (ds_tu, vd 2026-10-01) — đối soát + kéo bù đủ từ ngày đó, tối đa 62 ngày gần nhất
  const tuNgay = cfg.ds_tu ? Math.round((Date.parse(homNay) - Date.parse(String(cfg.ds_tu).slice(0, 10))) / 86400e3) + 1 : 0;
  const soNgay = Math.min(62, Math.max(Math.min(45, (Number(cfg.lui_ngay) || 30) + 1), tuNgay));
  const cuoi = Math.floor(Date.now() / 1000) - 15 * 60;   // bỏ 15 phút gần nhất (đơn mới chưa kịp kéo)
  const khung = Array.from({ length: soNgay }, (_, i) => {
    const ngay = congNgay(homNay, -i);
    return { ngay, tu: mocNgay(ngay), den: Math.min(mocNgay(congNgay(ngay, 1)), cuoi) };
  }).filter((k) => k.den > k.tu);
  const dem: J[] = [];
  let i = 0;
  const tho = async () => {
    while (i < khung.length) {
      const k = khung[i++];
      const [don, lk, tra] = await Promise.all([
        demTikTok(cfg, token, '/order/202309/orders/search', k.tu, k.den),
        demTikTok(cfg, token, '/affiliate_seller/202410/orders/search', k.tu, k.den),
        demTikTok(cfg, token, '/return_refund/202309/returns/search', k.tu, k.den),
      ]);
      dem.push({ ...k, don: Number.isFinite(don) ? don : null, lk: Number.isFinite(lk) ? lk : null, tra: Number.isFinite(tra) ? tra : null });
    }
  };
  await Promise.all([tho(), tho()]);
  const r0 = await rpc('fn_tt_doi_soat_nap', { p: { ds: dem } });
  const can: J[] = r0?.can_sua || [];
  const sua: string[] = [], chiTiet: J[] = [];
  for (const c of can) {   // mới nhất trước
    if (conGio() < 25_000) break;
    const k = khung.find((x) => x.ngay === String(c.ngay).slice(0, 10));
    if (!k) continue;
    const ct: J = { ngay: k.ngay };
    if (c.don) ct.don = await keoKhung(cfg, token, 'don', k.tu, k.den, conGio);
    if (c.lk && conGio() > 20_000) ct.lk = await keoKhung(cfg, token, 'lk', k.tu, k.den, conGio);
    if (c.tra && conGio() > 20_000) ct.tra = await keoKhung(cfg, token, 'tra', k.tu, k.den, conGio);
    sua.push(k.ngay); chiTiet.push(ct);
  }
  let conLech = can.length;
  if (sua.length) {
    const r1 = await rpc('fn_tt_doi_soat_nap', { p: { ds: dem.filter((d) => sua.includes(d.ngay)), sua } });
    conLech = (r1?.can_sua || []).length;
  }
  const kq = { ngay: dem.length, lech_truoc: can.length, da_sua: chiTiet, con_lech: conLech,
    giay: Math.round((Date.now() - batDau) / 1000), luc: new Date().toISOString() };
  // còn lệch → 15 phút sau đối soát lại; khớp hết → 3 giờ sau
  await rpc('fn_tt_doi_soat_nap', { p: { xong: true, kq, lui_phut: conLech > 0 ? 165 : 0 } });
  return kq;
}

// ---- NEW - 3.144: BÁO CÁO PHÂN TÍCH CẤP TỪNG ĐƠN (AI Report 202611, nhóm trd_skuord) ----
//   Mỗi dòng mã đơn + SKU: loại tài khoản (chính thức / marketing / nhà sáng tạo), loại nội dung (LIVE / video / thẻ sản phẩm),
//   ghi nhận trực tiếp / gián tiếp, mã video, mã phiên LIVE, creator_open_id → ID người bán cho MỌI đơn như Seller Center.
//   Lần đầu lùi 'lui_ngay' ngày (mỗi ngày 1 lượt truy vấn, dở trang thì cất token), sau đó luôn làm lại 3 ngày gần nhất.
const AR_THAN = (ngay: string) => ({
  start_date: ngay, end_date: ngay, time_granularity: 'DAY',
  group_dimensions: ['account_type', 'content_type', 'main_order_id', 'product_id', 'sku_id'],
  metric_codes: ['pay_sku_order_cnt', 'pay_amt'],
  detail_fields: ['author_id', 'item_id', 'room_id', 'attributed_type', 'order_source'],
  filters: [], sort_rules: [],
});
async function keoAiReport(cfg: J) {
  const batDau = Date.now();
  const HET = 120_000;
  const conGio = () => HET - (Date.now() - batDau);
  if (!cfg.app_secret) throw new Error('THIEU_APP_SECRET');
  const token = await damBaoToken(cfg);
  if (!cfg.shop_cipher) await layShop(cfg, token);
  const homNay = ngayVN(new Date());
  const ganNhat = congNgay(homNay, -2);
  const moc = cfg.ar_moc ? String(cfg.ar_moc).slice(0, 10) : '';
  const ngays: string[] = [];
  for (let d = moc ? congNgay(moc, 1) : congNgay(homNay, -(Number(cfg.lui_ngay) || 30)); d < ganNhat; d = congNgay(d, 1)) ngays.push(d);
  ngays.push(ganNhat, congNgay(homNay, -1), homNay);
  const kq: J = { ngay: [] as string[], trang: 0, dong: 0, gan: 0 };
  let dung = false;
  for (const ngay of ngays) {
    let pt = (cfg.ar_ngay && String(cfg.ar_ngay).slice(0, 10) === ngay && cfg.ar_token) ? String(cfg.ar_token) : '';
    let xongNgay = false;
    while (true) {
      if (conGio() < 12_000) { await rpc('fn_tt_ar_nap', { p: { ngay, token: pt } }); dung = true; break; }
      const ts: Record<string, string> = { shop_cipher: cfg.shop_cipher, page_size: '100' };
      if (pt) ts.page_token = pt;
      const j = await goiTikTok(cfg, token, '/analytics/202611/ai_report/data/query', ts, 'POST', AR_THAN(ngay));
      if (j?.code !== 0) {
        kq.loi = `${ngay} ${j?.code}: ${j?.message || ''}`.slice(0, 300);
        await rpc('fn_tt_ar_nap', { p: { ngay, token: '' } });   // token hỏng → lượt sau làm lại ngày này từ đầu
        dung = true; break;
      }
      const rows: J[] = j?.data?.rows || [];
      pt = j?.data?.next_page_token || '';
      kq.trang++;
      const r = await rpc('fn_tt_ar_nap', { p: { ds: rows, ngay, token: pt } });
      kq.dong += r?.dong || 0; kq.gan += r?.gan || 0;
      if (!pt || !rows.length) { xongNgay = true; break; }
    }
    if (dung) break;
    if (xongNgay) {
      kq.ngay.push(ngay);
      if (ngay < ganNhat) await rpc('fn_tt_ar_nap', { p: { moc: ngay } });
    }
  }
  if (!dung && kq.ngay.length) await rpc('fn_tt_ar_nap', { p: { moc: congNgay(ganNhat, -1) } });
  Object.assign(kq, { giay: Math.round((Date.now() - batDau) / 1000), luc: new Date().toISOString() });
  await rpc('fn_tt_ar_nap', { p: { xong: true, kq } });
  return kq;
}

// ---- NEW - 3.141: loại hàng (ngành sản phẩm) — chạy ké sau mỗi lượt kéo đơn, dùng phần thời gian còn lại ----
//   1) liệt kê sản phẩm + SKU (lần đầu toàn bộ, sau đó chỉ sản phẩm sửa từ mốc sp_moc; dở trang thì lượt sau đi tiếp)
//   2) lấy ngành lá cho sản phẩm chưa có (ưu tiên sản phẩm đang có đơn thiếu loại hàng), 5 lệnh song song
async function dongBoSanPham(cfg: J, batDau: number, hetGio = 110_000) {
  const kq: J = { trang: 0, sp: 0, lay_dm: 0, gan: 0, loi_dm: 0 };
  const conGio = () => hetGio - (Date.now() - batDau);
  if (conGio() < 15_000) return { ...kq, bo_qua: 'het_gio' };
  const token = await damBaoToken(cfg);
  const cipher = cfg.shop_cipher;
  // 1) danh sách
  let pt = String(cfg.sp_token || ''), xong = false;
  const bat = pt ? Number(cfg.sp_bat) || null : Math.floor(Date.now() / 1000) - 600;
  const loc: J = { status: 'ALL' };
  if (cfg.sp_moc) loc.update_time_ge = Number(cfg.sp_moc);
  while (conGio() > 40_000 && kq.trang < 40) {
    const ts: Record<string, string> = { shop_cipher: cipher, page_size: '100' };
    if (pt) ts.page_token = pt;
    const j = await goiTikTok(cfg, token, '/product/202502/products/search', ts, 'POST', loc);
    if (j?.code !== 0) {
      kq.loi_ds = `${j?.code}: ${j?.message || ''}`.slice(0, 200);
      if (pt) await rpc('fn_tt_sp_nap', { p: { token: '' } });   // trang hỏng/hết hạn → lượt sau liệt kê lại từ đầu
      break;
    }
    const ds: J[] = (j?.data?.products || []).map((x: J) => ({
      id: x.id, ten: x.title, tt: x.status, sua: x.update_time,
      skus: (x.skus || []).map((k: J) => ({ id: k.id, ss: k.seller_sku })),
    }));
    pt = j?.data?.next_page_token || '';
    kq.trang++;
    xong = !pt || !ds.length;
    const r = await rpc('fn_tt_sp_nap', { p: { ds, token: xong ? '' : pt, ...(bat ? { bat } : {}), xong } });
    kq.sp += r?.sp || 0;
    if (xong) break;
  }
  kq.ds_xong = xong;
  // 2) ngành
  const can: string[] = conGio() > 20_000 ? (await rpc('fn_tt_sp_can_dm', { p_n: 600 })) || [] : [];
  let i = 0;
  const cho: J[] = [];
  const ghi = async () => {
    if (!cho.length) return;
    const r = await rpc('fn_tt_sp_dm', { p: { ds: cho.splice(0) } });
    kq.gan += r?.gan || 0;
  };
  const tho = async () => {
    while (i < can.length && conGio() > 12_000) {
      const id = can[i++];
      const j = await goiTikTok(cfg, token, `/product/202309/products/${id}`, { shop_cipher: cipher });
      if (j?.code === 0) {
        const ch: J[] = j?.data?.category_chains || [];
        const la = ch.find((c) => c.is_leaf) || ch[ch.length - 1];
        cho.push({ id, dm: la?.local_name || '', nganh: ch.map((c) => c.local_name).join(' › ') });
        kq.lay_dm++;
      } else {
        kq.loi_dm++;
        if (!kq.loi_dm_mau) kq.loi_dm_mau = `${j?.code}: ${j?.message || ''}`.slice(0, 200);
        if (j?.code === 36009002 || j?.code === 429) break;   // bị giới hạn tốc độ → để lượt sau
        cho.push({ id, loi: `${j?.code}: ${j?.message || ''}`.slice(0, 200) });
      }
      if (cho.length >= 40) await ghi();
    }
  };
  await Promise.all([tho(), tho(), tho(), tho(), tho()]);
  await ghi();
  kq.con = Math.max(0, can.length - i);
  kq.giay = Math.round((Date.now() - batDau) / 1000);
  await rpc('fn_tt_sp_dm', { p: { kq: { ...kq, luc: new Date().toISOString() } } });
  return kq;
}

// ---- NEW - 3.141: thống kê phiên LIVE + video (có ID người bán) ----
const ngayVN = (d: Date) => new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10);
const congNgay = (s: string, n: number) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

async function thongKe(cfg: J) {
  const batDau = Date.now();
  const HET_GIO = 110_000;
  if (!cfg.app_secret) throw new Error('THIEU_APP_SECRET');
  const token = await damBaoToken(cfg);
  if (!cfg.shop_cipher) await layShop(cfg, token);
  const cipher = cfg.shop_cipher;
  const homNay = ngayVN(new Date());
  const lui = Number(cfg.lui_ngay) || 30;
  const kq: J = { phien: 0, gan_don: 0, video: 0, ngay_video: [] as string[] };

  // 1) Phiên LIVE: lần đầu lùi 'lui_ngay' ngày, sau đó làm lại 2 ngày gần nhất (số liệu TikTok chốt chậm 1–2 ngày)
  const liveTu = cfg.live_moc ? congNgay(String(cfg.live_moc).slice(0, 10), -2) : congNgay(homNay, -lui - 1);
  // NEW - 3.145: kéo lùi xa thì đi từng khúc 20 ngày (mỗi lượt xong 1 khúc rồi ghi mốc), tránh làm lại từ đầu khi hết giờ
  const liveDen = congNgay(liveTu, 20) < congNgay(homNay, 1) ? congNgay(liveTu, 20) : congNgay(homNay, 1);
  let pt = '', trang = 0, xongLive = false;
  while (trang < 80 && Date.now() - batDau < HET_GIO - 30_000) {
    const ts: Record<string, string> = { shop_cipher: cipher, start_date_ge: liveTu, end_date_lt: liveDen, page_size: '100' };
    if (pt) ts.page_token = pt;
    const j = await goiTikTok(cfg, token, '/analytics/202508/shop_lives/performance', ts);
    if (j?.code !== 0) { kq.loi_live = `${j?.code}: ${j?.message || ''}`.slice(0, 300); break; }
    const ds: J[] = j?.data?.live_stream_sessions || [];
    if (ds.length) {
      const r = await rpc('fn_tt_live_nap', { p: ds });
      kq.phien += r?.phien || 0; kq.gan_don += r?.gan_don || 0;
    }
    trang++;
    pt = j?.data?.next_page_token || '';
    if (!pt || !ds.length) { xongLive = true; break; }
  }
  if (xongLive) await rpc('fn_tt_api_tk', { p: { live_moc: liveDen === congNgay(homNay, 1) ? homNay : congNgay(liveDen, -1) } });

  // 2) Video theo từng ngày: lần đầu lùi 'lui_ngay' ngày, sau đó làm lại từ ngày đã chốt − 1 tới ngày TikTok có số liệu mới nhất.
  //    Xếp theo doanh số giảm dần, dừng khi cả trang không còn video có đơn.
  let ngay = cfg.video_moc ? congNgay(String(cfg.video_moc).slice(0, 10), -1) : congNgay(homNay, -lui);
  let moiNhat = homNay;
  while (ngay <= moiNhat && Date.now() - batDau < HET_GIO) {
    let pv = '', tv = 0, hetNgay = false;
    while (tv < 60 && Date.now() - batDau < HET_GIO) {
      const ts: Record<string, string> = { shop_cipher: cipher, start_date_ge: ngay, end_date_lt: congNgay(ngay, 1), page_size: '100',
        sort_field: 'gmv', sort_order: 'DESC' };
      if (pv) ts.page_token = pv;
      const j = await goiTikTok(cfg, token, '/analytics/202409/shop_videos/performance', ts);
      if (j?.code !== 0) { kq.loi_video = `${j?.code}: ${j?.message || ''}`.slice(0, 300); hetNgay = false; break; }
      if (j?.data?.latest_available_date) moiNhat = String(j.data.latest_available_date);
      const ds: J[] = j?.data?.videos || [];
      const coBan = ds.filter((v) => Number(v.sku_orders) > 0 || Number(v.units_sold) > 0 || Number(v?.gmv?.amount) > 0);
      if (coBan.length) {
        const r = await rpc('fn_tt_video_nap', { p_ngay: ngay, p: coBan });
        kq.video += r?.video || 0;
      }
      tv++;
      pv = j?.data?.next_page_token || '';
      if (!pv || coBan.length === 0) { hetNgay = true; break; }
    }
    if (!hetNgay || kq.loi_video || ngay > moiNhat) break;   // hết giờ giữa ngày / lỗi / TikTok chưa có số ngày này → lượt sau làm tiếp
    await rpc('fn_tt_api_tk', { p: { video_moc: ngay } });
    kq.ngay_video.push(ngay);
    if (ngay >= moiNhat) break;
    ngay = congNgay(ngay, 1);
  }
  kq.giay = Math.round((Date.now() - batDau) / 1000);
  await rpc('fn_tt_api_tk', { p: { xong: true, loi: kq.loi_live || kq.loi_video || '', kq } });
  return { ok: !kq.loi_live && !kq.loi_video, ...kq };
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

// Supabase Edge Function không phục vụ trang HTML (bị đổi sang text/plain) → kết quả ủy quyền chuyển hướng về app
const APP_URL = 'https://baohan2909.github.io/hanghoa/';
function veApp(ok: boolean, thamSo: Record<string, string> = {}) {
  return new Response(null, { status: 302,
    headers: { Location: APP_URL + '?' + new URLSearchParams({ tiktok: ok ? 'ok' : 'loi', ...thamSo }) } });
}

Deno.serve(async (req) => {
  if (!SB_URL || !SB_KEY) return json({ ok: false, loi: 'THIEU_SUPABASE_URL_HOAC_SERVICE_KEY' }, 500);
  const url = new URL(req.url);

  // ===== 1) Ủy quyền: TikTok chuyển hướng về đây kèm ?code =====
  if (req.method === 'GET') {
    const code = url.searchParams.get('code') || url.searchParams.get('auth_code') || '';
    if (!code) return veApp(false, { ly_do: 'Thiếu mã ủy quyền — mở link ủy quyền trong app để kết nối' });
    try {
      const cfg = await rpc('fn_tt_api_cfg', {});
      if (!cfg?.app_secret) return veApp(false, { ly_do: 'Chưa lưu khoá bí mật app vào Vault (tiktok_app_secret)' });
      const r = await fetch(AUTH + '/api/v2/token/get?' + new URLSearchParams({
        app_key: cfg.app_key, app_secret: cfg.app_secret, auth_code: code, grant_type: 'authorized_code',
      }));
      const j = await r.json().catch(() => null);
      const d = j?.data || {};
      if (!d.access_token) return veApp(false, { ly_do: 'TikTok từ chối: ' + String(j?.message || j?.code || 'không rõ').slice(0, 200) });
      await rpc('fn_tt_api_luu', { p: {
        access_token: d.access_token, refresh_token: d.refresh_token || null,
        het_han: isoTuGiay(d.access_token_expire_in), refresh_het_han: isoTuGiay(d.refresh_token_expire_in),
        quyen: d.granted_scopes || null, ket_noi: true,
      } });
      cfg.access_token = d.access_token;
      const sh = await layShop(cfg, d.access_token);
      const ten = sh?.data?.shops?.[0]?.name;
      return veApp(true, ten ? { shop: String(ten) } : {});
    } catch (e) {
      return veApp(false, { ly_do: String((e as Error)?.message || e).slice(0, 200) });
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
    if (body.viec === 'thong_ke') return json(await thongKe(cfg));
    if (body.viec === 'san_pham') return json(await dongBoSanPham(cfg, Date.now()));
    if (body.viec === 'lien_ket') return json(await keoLienKet(cfg, Date.now()));
    if (body.viec === 'tra_hang') return json(await keoTraHang(cfg, Date.now()));
    if (body.viec === 'doi_soat') return json(await doiSoat(cfg));
    if (body.viec === 'ai_report') return json(await keoAiReport(cfg));
    const batDau = Date.now();
    const kq: J = await keoDon(cfg);
    // NEW - 3.142: ID người bán từng đơn (API liên kết), rồi loại hàng — dùng thời gian còn lại; lỗi ở 2 bước này không làm hỏng lượt kéo đơn
    try { kq.lien_ket = await keoLienKet(cfg, batDau, 105_000); } catch (e) { kq.lien_ket = { loi: String((e as Error)?.message || e).slice(0, 200) }; }
    // NEW - 3.143: trả hàng / hoàn tiền
    try { kq.tra_hang = await keoTraHang(cfg, batDau, 118_000); } catch (e) { kq.tra_hang = { loi: String((e as Error)?.message || e).slice(0, 200) }; }
    try { kq.san_pham = await dongBoSanPham(cfg, batDau, 130_000); } catch (e) { kq.san_pham = { loi: String((e as Error)?.message || e).slice(0, 200) }; }
    return json(kq);
  } catch (e) {
    const loi = String((e as Error)?.message || e).slice(0, 500);
    try {
      // thống kê lỗi vẫn ghi giờ chạy để lịch quay lại kéo đơn, không kẹt mãi ở bước thống kê
      if (body.viec === 'thong_ke') await rpc('fn_tt_api_tk', { p: { xong: true, loi } });
      else if (body.viec === 'ai_report') await rpc('fn_tt_ar_nap', { p: { xong: true, kq: { loi, luc: new Date().toISOString() } } });
      else if (body.viec === 'doi_soat') await rpc('fn_tt_doi_soat_nap', { p: { xong: true, kq: { loi, luc: new Date().toISOString() }, lui_phut: 150 } });
      else await rpc('fn_tt_api_ghi', { p: { xong: true, loi } });
    } catch { /* bỏ qua */ }
    return json({ ok: false, loi }, 200);
  }
});
