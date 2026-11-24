// NS FLOW — Edge Function: nhanh   (NEW - 3.153 Bán online · SQL 262/263)
// Nhanh.vn Open API v3 (https://apidocs.nhanh.vn/v3) — lấy TOÀN BỘ đơn online (TikTok, Shopee, Lazada, Facebook, Zalo OA, Website, Admin…)
//
//   GET  ?accessCode=...        → Nhanh chuyển về sau khi anh bấm "Cho phép" → đổi accessToken (hạn 1 năm) → lưu nh_api → về app
//   POST {viec:'tu_dong'}       → (lịch 5 phút/lần qua fn_tq_lam_moi) 1) đơn mới/đơn đổi trạng thái theo updatedAt
//                                  2) kéo bù lịch sử theo ngày tạo, từ ds_tu (01/10/2026) tới hôm nay — dở trang thì cất con trỏ
//   POST {viec:'keo_ngay', ngay:['2026-11-03', …]} → kéo lại đúng các ngày chọn (nút trong app)
//   POST {viec:'dia_diem'}      → danh sách tỉnh/thành (id → tên)
//   POST {viec:'thu', duong_dan, body} → gọi thử 1 API, trả NGUYÊN VĂN phản hồi (để đối chiếu tên trường)
//   POST bắt buộc header x-nh-khoa = nh_api.khoa_noi_bo (SQL tự gửi qua pg_net).
// Mọi đơn lưu kèm JSON gốc (nh_don.raw) → phân tích lại bằng SQL được, không phải kéo lại.

const SB_URL = Deno.env.get('SUPABASE_URL') || '';
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const POS = 'https://pos.open.nhanh.vn';
const APP_URL = 'https://baohan2909.github.io/hanghoa/';
const HET_GIO = 125_000;   // ngân sách mỗi lượt (Edge Function tối đa ~150 giây)

type J = Record<string, any>;
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
const ngu = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

async function rpc(fn: string, body: unknown) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json',
      'Content-Profile': 'chiahang', 'Accept-Profile': 'chiahang' },
    body: JSON.stringify(body ?? {}),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`RPC ${fn} ${r.status}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}

const loiNhanh = (j: J) => `${j?.errorCode || 'LOI'}: ${Array.isArray(j?.messages) ? j.messages.join('; ')
  : typeof j?.messages === 'object' && j?.messages ? JSON.stringify(j.messages) : (j?.messages || j?.message || '')}`.slice(0, 400);

// Gọi Open API v3: POST JSON, appId + businessId trên URL, header Authorization = accessToken.
// Vượt giới hạn tốc độ (ERR_429) → chờ đúng lockedSeconds rồi gọi lại (tối đa 3 lần).
async function goiNhanh(cfg: J, duongDan: string, body: unknown) {
  for (let lan = 0; ; lan++) {
    const url = `${POS}${duongDan}?appId=${encodeURIComponent(cfg.app_id)}&businessId=${encodeURIComponent(cfg.business_id)}`;
    const r = await fetch(url, { method: 'POST', headers: { Authorization: cfg.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}) });
    const t = await r.text();
    let j: J;
    try { j = JSON.parse(t); } catch { j = { code: 0, errorCode: 'KHONG_DOC_DUOC', messages: `HTTP ${r.status}: ${t.slice(0, 300)}` }; }
    const qua = j?.errorCode === 'ERR_429' || j?.errorCode === 'ERR_EXCEEDED_RATE_LIMIT' || r.status === 429;
    if (qua && lan < 3) { await ngu((Math.min(30, Number(j?.data?.lockedSeconds) || 5) + 1) * 1000); continue; }
    return j;
  }
}

const ngayVN = (d: Date) => new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10);
const congNgay = (s: string, n: number) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const mocNgay = (ngay: string) => Math.floor(Date.parse(ngay + 'T00:00:00+07:00') / 1000);

// Kéo 1 khung (createdAt hoặc updatedAt) tới hết trang hoặc hết giờ. Mỗi trang nạp ngay vào DB.
async function keoKhung(cfg: J, loc: J, conGio: () => number, tiep: unknown = null, luuTiep?: (n: unknown) => Promise<void>) {
  let next: unknown = tiep, trang = 0, don = 0, xong = false, loi = '';
  while (conGio() > 12_000) {
    const paginator: J = { size: 100 };
    if (next != null) paginator.next = next;
    const j = await goiNhanh(cfg, '/v3.0/order/list', { filters: loc, paginator, dataOptions: { marketing: 1 } });
    if (j?.code !== 1) { loi = loiNhanh(j); break; }
    const ds: J[] = Array.isArray(j?.data) ? j.data : Array.isArray(j?.data?.orders) ? j.data.orders : [];
    if (ds.length) await rpc('fn_nh_nap_sv', { p: { ds } });
    don += ds.length; trang++;
    next = j?.paginator?.next ?? null;
    if (next == null || (Array.isArray(next) && !next.length)) { xong = true; break; }
    if (luuTiep) await luuTiep(next);
  }
  return { trang, don, xong, next, loi };
}

// 1) đơn mới + đơn đổi trạng thái (updatedAt) từ mốc − 5 phút
async function keoMoi(cfg: J, conGio: () => number) {
  const bayGio = Math.floor(Date.now() / 1000) - 30;
  let tu = (Number(cfg.keo_moc) || bayGio - 2 * 3600) - 300;
  if (bayGio - tu > 30 * 86400) tu = bayGio - 30 * 86400;          // API giới hạn 31 ngày mỗi lần lọc
  const kq = await keoKhung(cfg, { updatedAtFrom: tu, updatedAtTo: bayGio }, conGio);
  if (kq.xong) await rpc('fn_nh_ghi_sv', { p: { keo_moc: bayGio } });
  return { ...kq, tu, den: bayGio };
}

// 2) kéo bù lịch sử theo NGÀY TẠO, tiến từ ds_tu tới hôm nay; dở trang thì cất con trỏ (bf_next) để lượt sau đi tiếp
async function keoBu(cfg: J, conGio: () => number) {
  if (cfg.bf_xong) return { bo_qua: 'da_xong' };
  const homNay = ngayVN(new Date());
  let ngay = cfg.bf_ngay ? String(cfg.bf_ngay).slice(0, 10) : String(cfg.ds_tu || '2026-10-01').slice(0, 10);
  let next: unknown = cfg.bf_next ?? null;
  const kq: J = { ngay: [] as string[], don: 0, trang: 0 };
  while (ngay <= homNay && conGio() > 15_000) {
    const r = await keoKhung(cfg, { createdAtFrom: mocNgay(ngay), createdAtTo: mocNgay(congNgay(ngay, 1)) }, conGio, next,
      async (n) => { await rpc('fn_nh_ghi_sv', { p: { bf_next: n } }); });
    kq.don += r.don; kq.trang += r.trang;
    if (r.loi) { kq.loi = `${ngay} ${r.loi}`; break; }
    if (!r.xong) { kq.dang = ngay; break; }                     // hết giờ giữa ngày → lượt sau làm tiếp đúng trang
    kq.ngay.push(ngay);
    ngay = congNgay(ngay, 1); next = null;
    await rpc('fn_nh_ghi_sv', { p: { bf_ngay: ngay, bf_next: null } });
  }
  if (ngay > homNay) await rpc('fn_nh_ghi_sv', { p: { bf_xong: true } });
  return kq;
}

// kéo lại đúng các ngày anh chọn (mới nhất trước)
async function keoNgay(cfg: J, ds: unknown[], conGio: () => number) {
  const homNay = ngayVN(new Date());
  const ngays = [...new Set(ds.map((x) => String(x).slice(0, 10)).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x) && x <= homNay))]
    .sort().reverse().slice(0, 31);
  const kq: J = { ngay: [] as string[], don: 0, trang: 0, chua_kip: [] as string[] };
  for (const ngay of ngays) {
    if (conGio() < 15_000) { kq.chua_kip.push(ngay); continue; }
    const r = await keoKhung(cfg, { createdAtFrom: mocNgay(ngay), createdAtTo: mocNgay(congNgay(ngay, 1)) }, conGio);
    kq.don += r.don; kq.trang += r.trang;
    if (r.loi) { kq.loi = `${ngay} ${r.loi}`; kq.chua_kip.push(ngay); break; }
    if (r.xong) kq.ngay.push(ngay); else kq.chua_kip.push(ngay);
  }
  return kq;
}

async function diaDiem(cfg: J) {
  const j = await goiNhanh(cfg, '/v3.0/shipping/location', { filters: { locationVersion: 'v1', type: 'CITY' } });
  if (j?.code !== 1) throw new Error('Tỉnh/thành: ' + loiNhanh(j));
  const ds: J[] = Array.isArray(j?.data) ? j.data : [];
  await rpc('fn_nh_ghi_sv', { p: { dia_diem: ds, cap: 'CITY' } });
  return { tinh: ds.length };
}

function veApp(ok: boolean, thamSo: Record<string, string> = {}) {
  return new Response(null, { status: 302,
    headers: { Location: APP_URL + '?' + new URLSearchParams({ nhanh: ok ? 'ok' : 'loi', ...thamSo }) } });
}

Deno.serve(async (req) => {
  if (!SB_URL || !SB_KEY) return json({ ok: false, loi: 'THIEU_SUPABASE_URL_HOAC_SERVICE_KEY' }, 500);
  const url = new URL(req.url);

  // ===== 1) Ủy quyền: Nhanh chuyển hướng về đây kèm ?accessCode =====
  if (req.method === 'GET') {
    const code = url.searchParams.get('accessCode') || '';
    if (!code) return veApp(false, { ly_do: 'Thiếu accessCode — bấm "Kết nối Nhanh.vn" trong app để bắt đầu' });
    try {
      const cfg = await rpc('fn_nh_cfg_sv', {});
      if (!cfg?.app_id) return veApp(false, { ly_do: 'Chưa lưu App ID trong app' });
      if (!cfg?.secret_key) return veApp(false, { ly_do: 'Chưa lưu Secret Key trong app' });
      const r = await fetch(`${POS}/v3.0/app/getaccesstoken?appId=${encodeURIComponent(cfg.app_id)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessCode: code, secretKey: cfg.secret_key }) });
      const j: J = await r.json().catch(() => ({}));
      const d: J = j?.data && typeof j.data === 'object' ? j.data : j;
      if (j?.code !== 1 || !d?.accessToken) return veApp(false, { ly_do: 'Nhanh từ chối: ' + loiNhanh(j) });
      // đã gắn 1 doanh nghiệp rồi thì không cho mã ủy quyền của doanh nghiệp khác ghi đè
      if (cfg.business_id && d.businessId && String(cfg.business_id) !== String(d.businessId))
        return veApp(false, { ly_do: `Tài khoản Nhanh thuộc doanh nghiệp khác (${d.businessId}) — app đang gắn ${cfg.business_id}` });
      await rpc('fn_nh_ghi_sv', { p: { api: { access_token: d.accessToken, business_id: d.businessId, expired_at: d.expiredAt,
        quyen: d.permissions ?? null, kho: d.depotIds ?? null, ket_noi: true } } });
      return veApp(true, { han: String(d.expiredAt || '') });
    } catch (e) {
      return veApp(false, { ly_do: String((e as Error)?.message || e).slice(0, 200) });
    }
  }

  // ===== 2) Lệnh nội bộ (SQL gửi qua pg_net) =====
  if (req.method !== 'POST') return json({ ok: false, loi: 'SAI_PHUONG_THUC' }, 405);
  let cfg: J;
  try { cfg = await rpc('fn_nh_cfg_sv', {}); } catch (e) { return json({ ok: false, loi: String((e as Error).message) }, 500); }
  if (!cfg || req.headers.get('x-nh-khoa') !== cfg.khoa_noi_bo) return json({ ok: false, loi: 'KHONG_CO_QUYEN' }, 401);
  const body: J = await req.json().catch(() => ({}));
  const batDau = Date.now();
  const conGio = () => HET_GIO - (Date.now() - batDau);

  try {
    if (!cfg.access_token || !cfg.business_id) throw new Error('CHUA_KET_NOI');
    if (body.viec === 'thu') {
      const duong = String(body.duong_dan || '/v3.0/order/list');
      if (!/^\/v3\.0\/[a-z]+\/(list|detail|location)$/i.test(duong)) throw new Error('CHI_DUOC_GOI_API_DOC');   // chỉ API đọc
      const kq = await goiNhanh(cfg, duong, body.body ?? { paginator: { size: 1 } });
      await rpc('fn_nh_ghi_sv', { p: { xong: true } });
      return json({ ok: true, phan_hoi: kq });
    }
    if (body.viec === 'dia_diem') {
      const kq: J = await diaDiem(cfg);
      kq.moi = await keoMoi(cfg, conGio);
      await rpc('fn_nh_ghi_sv', { p: { keo_kq: { ...kq.moi, luc: new Date().toISOString() }, loi: kq.moi.loi || '', xong: true } });
      return json(kq);
    }
    if (body.viec === 'keo_ngay') {
      const kq = await keoNgay(cfg, Array.isArray(body.ngay) ? body.ngay : [], conGio);
      await rpc('fn_nh_ghi_sv', { p: { bf_kq: { thu_cong: true, ...kq, luc: new Date().toISOString(), giay: Math.round((Date.now() - batDau) / 1000) },
        loi: kq.loi || '', xong: true } });
      return json(kq);
    }
    // 'tu_dong': lấy mới trước (nhanh, quan trọng nhất), còn giờ thì kéo bù lịch sử
    const moi = await keoMoi(cfg, conGio);
    await rpc('fn_nh_ghi_sv', { p: { keo_kq: { ...moi, luc: new Date().toISOString(), giay: Math.round((Date.now() - batDau) / 1000) } } });
    let bu: J = { bo_qua: 'het_gio' };
    if (!moi.loi && conGio() > 30_000) {
      bu = await keoBu(cfg, conGio);
      await rpc('fn_nh_ghi_sv', { p: { bf_kq: { ...bu, luc: new Date().toISOString(), giay: Math.round((Date.now() - batDau) / 1000) } } });
    }
    await rpc('fn_nh_ghi_sv', { p: { loi: moi.loi || bu.loi || '', xong: true } });
    return json({ moi, bu });
  } catch (e) {
    const loi = String((e as Error)?.message || e).slice(0, 500);
    try { await rpc('fn_nh_ghi_sv', { p: { loi, xong: true } }); } catch { /* bỏ qua */ }
    return json({ ok: false, loi }, 200);
  }
});
