// NS FLOW — Edge Function: sieu-tri-tue  (SIÊU TRÍ TUỆ — trợ lý AI điều hành · v3.159.6 · SQL 215–222, 285, 289, 290)
//
// Luồng 1 lần giao việc:  app gửi yêu cầu + ngữ cảnh màn hình  ->  AI (FableAI) hiểu & chọn công cụ
//   -> công cụ MÁY CHỦ (chỉ đọc: tong_quan, lich_de_nghi, dieu_chuyen, ho_so, xep_hang, hoi_so_lieu, danh_muc) chạy ngay tại đây
//   -> công cụ MÀN HÌNH (mo_man, chia_doi, doc_man) trả về app chạy bằng engine sẵn có, app gửi kết quả lại ('tiep')
//   -> AI tổng hợp -> trả lời + thẻ kết quả. Việc GHI (xác nhận chia, đơn Odoo) chỉ tạo PHIẾU CHỜ DUYỆT — người bấm Duyệt mới chạy.
// Tiến độ gửi dần theo dòng NDJSON: {t:'viec'|'tien_do'|'ke_hoach'|'buoc'|'client'|'xong'|'loi', ...}
//
// Bảo mật: khoá FableAI chỉ nằm trong Supabase Vault ('ai_fable_key', đọc qua fn_ai_khoa — chỉ service_role)
//          hoặc secret AI_FABLE_KEY. KHÔNG nằm trong app / repo / bảng thường. Không bao giờ in ra log.
// Quyền: token đăng nhập app -> fn_ai_quyen (tham_so 'ai': bật, vai trò được dùng, dừng khẩn).
//
// Gọi (POST, Bearer anon như odoo-dieu-chuyen):
//   { token, hanh_dong:'chay', yeu_cau, phien_id?, man, ngu_canh }      -> luồng NDJSON
//   { token, hanh_dong:'tiep', viec_id, ket_qua:[{id, ket_qua, buoc?, the?, loi?}] } -> luồng NDJSON
//   { token, hanh_dong:'dung', viec_id }                                 -> {ok}
//   { token, hanh_dong:'thu' }  (Quản trị: thử kết nối 2 kiểu API)        -> {ok, models, anthropic, openai}
//   { token, hanh_dong:'hoc', tay? }  NEW - 289: TỰ HỌC (chạy nền, có trần token/ngày) -> {ok, chay, ly_do?}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const tra = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
const enc = new TextEncoder();
type J = Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any

const SB_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("SB_URL") || "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SB_SERVICE_KEY") || "";
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", "Content-Profile": "chiahang", "Accept-Profile": "chiahang" };
async function rpc(fn: string, body: unknown): Promise<any> {   // eslint-disable-line @typescript-eslint/no-explicit-any
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  const t = await r.text();
  let j: unknown = null; try { j = JSON.parse(t); } catch { /* */ }
  if (r.status >= 300) throw new Error(((j as J)?.message as string) || t.slice(0, 300));
  return j;
}

// khoá: giữ trong bộ nhớ của phiên máy (5 phút) cho nhanh, không ghi đâu khác
let khoaNho = { v: "", luc: 0 };
async function layKhoa(): Promise<string> {
  const env = Deno.env.get("AI_FABLE_KEY");
  if (env) return env;
  if (khoaNho.v && Date.now() - khoaNho.luc < 300000) return khoaNho.v;
  try { const k = await rpc("fn_ai_khoa", {}); khoaNho = { v: typeof k === "string" ? k : "", luc: Date.now() }; } catch { khoaNho = { v: "", luc: 0 }; }
  return khoaNho.v;
}

// ---------------------------------------------------------------------------
// CÔNG CỤ
// ---------------------------------------------------------------------------
const TAB_MO_TA = "dashboard=Tổng quan · xinhang=Đề nghị hàng · duyet=Điều phối · ycdp=Yêu cầu ĐP · doisale=Đội Sale (che: doi=Chia từng đội, thung=Kho thùng, loat=Chia hàng mới, doimoi=Đội mới, phieu=Phiếu đã chia, can=Cân đối) · kho=Kho tổng · odoo=Đơn Odoo · tonkd=Tồn khả dụng · dieuhanh=Phòng điều hành · giamsat=Thiếu hàng · vandon=Vận đơn · baocao=Báo cáo · dacbiet=Hàng đặc biệt · lich=Lịch đề nghị · chiamoi=Chia hàng mới · thamso=Tham số";

// NEW - 3.132 mô tả công cụ + lời dặn viết TIẾNG ANH gọn (chữ Việt có dấu tốn ~3 lần token); câu trả lời vẫn 100% tiếng Việt
const SCHEMA_GON = [
  'Schema "chiahang" (read-only). Main tables:',
  "ban_hang(ngay, gio, so_don, barcode, ma_ch, nganh_1, ma_tham_chieu, gia_sale, gia_ban, so_luong) store sales, so_luong<0 = return. ban_hang_doi_sale: same columns, sales teams.",
  "san_pham(barcode, sku, ma_tham_chieu LINE-COLOR-SIZE e.g. NS008ATG-TR002-M, nganh_1, nganh_3, gia_niem_yet, gia_sale, la_hang_sale, ngay_tao_ma). v_sp_tt(barcode, ten_sp).",
  "ton_kho(ma_ch, barcode, ton_hien_tai, ton_du_tinh) stock everywhere. ton_kho_thung(barcode, ton_hien_tai) box warehouse TK05005.",
  "cua_hang(ma_ch, ten, khu_vuc, nhom_ch 1|2|3 = N1|N2|N3, cum, chu_ky_ngay, lead_time_ngay, bh_min, bh_max, nv_min, nv_max, hoat_dong): CH*/DB* stores, DOISALEnn sales teams, SA*/PK*/TP* warehouses.",
  "don_xin_hang(id, ma_ch, loai 'DINH_KY'|.., trang_thai ('NHAP'=draft), ngay_gui, gui_tre). khong_de_nghi(ma_ch, ngay). lich_ngay(ma_ch, ngay) = request schedule.",
  "dieu_chuyen_kho(ma_phieu (DK* periodic, other urgent), barcode, ma_ch, ma_kho_nguon, ma_tham_chieu, sl_nhu_cau, sl_da_xuat, sl_dang_chuyen, sl_da_nhap, trang_thai 'Chưa chuyển'|'Chờ sẵn sàng'|'Một phần'|'Đã xuất'|'Đã nhận', ngay_tao, ngay_xuat) Odoo transfers.",
  "yeu_cau_dieu_phoi(ma_ch, barcode, so_luong, trang_thai 'CHO'|'DU'|'HUY') coordination requests — NOT the scheduled đề nghị.",
  "odoo_don(name, odoo_name, kho_cung_ung, kho_yeu_cau, tong_sl, trang_thai, tao_luc) = ONLY the app's send log (not all Odoo slips; use dieu_chuyen for Odoo slips). het_hang_log(ma_ch, barcode, ngay). giu_hang(ma_ch, barcode, so_luong, trang_thai). van_don_ghtk(label_id, ma_ch, status_text, la_xong, ngay_tao, so_luong). hang_dac_biet(barcode, loai THU_HOI|HANG_MOI|CHO_CHIA). thung_dong_san(ma_thung, nhom, tong_sl) + thung_dong_san_ct(ma_thung, barcode, sl). v_nguoi_dung_ai(ma_dang_nhap, ten, vai_tro, ma_ch, hoat_dong).",
  "Functions: fn_la_noi_ban(ma_ch) bool; fn_nhom_nganh(nganh_1) -> 'BH'|'NV'|'PK'. Any other table/column: call danh_muc first — never guess column names.",
  "PostgreSQL only: current_date - 6; date_trunc('month', current_date)::date; call fn_la_noi_ban(b.ma_ch) without schema prefix; ton_kho has no nganh_1 → join san_pham s using (barcode); match codes upper(ma_tham_chieu) LIKE upper('X')||'%'; no period given → 30 days; aggregate in SQL, add LIMIT.",
  "Example: sales 7 days by region → select c.khu_vuc, sum(b.so_luong) sl from ban_hang b join cua_hang c using (ma_ch) where b.ngay >= current_date - 6 and fn_la_noi_ban(b.ma_ch) group by 1 order by 2 desc",
].join("\n");

const CONG_CU: J[] = [
  {
    name: "tong_quan",
    description: "Chain-wide KPIs exactly as the 'Tổng quan' screen: sales today (no accessories), stores short vs minimum, 'mã cháy hàng – kho còn', 'hết sạch toàn hệ thống', today's scheduled đề nghị, urgent requests, pending coordination requests, running transfers, 14-day sales.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "lich_de_nghi",
    description: "Request schedule with the SAME formula as the 'Lịch đề nghị' screen: stores scheduled, đã gửi (sent), không đề nghị (confirmed none), chưa gửi (not sent) — totals, by region, store lists. One day, or a range → per-day counts + stores most often not sent. ALWAYS use for đề nghị / gửi đơn / lịch questions. Schedules exist only for stores CH*/DB* — sales teams (DOISALE) have no đề nghị schedule.",
    input_schema: { type: "object", properties: {
      ngay: { type: "string", description: "YYYY-MM-DD, default today" },
      tu_ngay: { type: "string" }, den_ngay: { type: "string", description: "range ≤ 63 days" },
      khu_vuc: { type: "string", description: "region or store name text" },
      nhom: { type: "string", enum: ["N1", "N2", "N3"] },
      kem_da_gui: { type: "boolean", description: "also list the stores that HAVE sent (default: only not-sent + confirmed-none lists)" },
    } },
  },
  {   // NEW - 3.137 phiếu điều chuyển Odoo đúng quy tắc màn Điều chuyển kho
    name: "dieu_chuyen",
    description: "Odoo transfer slips (phiếu điều chuyển / đơn trên Odoo) with the SAME rules as the 'Điều chuyển kho' screen — synced from Odoo, incl. slips made outside the app: totals per status, chưa xuất (not exported), xuất một phần, đã xuất, cancelled/refused kept apart, by destination (stores vs sales teams) and prefix (DK periodic, KC urgent, DSC sales team, HM new goods), list of not-exported slips. ALWAYS use for đơn / phiếu trên Odoo, đã xuất / chưa xuất / kho chưa làm questions — never query odoo_don for this.",
    input_schema: { type: "object", properties: {
      ngay: { type: "string", description: "YYYY-MM-DD slip creation date, default today" },
      tu_ngay: { type: "string" }, den_ngay: { type: "string", description: "range ≤ 63 days" },
      tim: { type: "string", description: "store/team code or name, region, or slip code text" },
      tien_to: { type: "string", description: "DK | KC | DSC | HM" },
    } },
  },
  {
    name: "ho_so",
    description: "360° profile of ONE store / sales team / warehouse / product: sales (today, yesterday, 7d, 14d by day, previous period, by group, top codes), stock, days of cover, codes running out, non-selling stock, stockouts, holds, transfers & unreceived ones, Odoo orders, shipments, staff, contest, schedule. Product: prices, sales by size, top stores, stock by place, in transit.",
    input_schema: { type: "object", properties: {
      q: { type: "string", description: "Team number ('3'), code (CH05014, DOISALE03, SA05001), store name ('Nguyễn Trãi 5'), product code (NS008ATG-TR002) or barcode" },
      ngay: { type: "integer", description: "Sales window days, default 30" },
    }, required: ["q"] },
  },
  {
    name: "xep_hang",
    description: "Exact ranking / top / totals (prefer over SQL) of cua_hang (stores), doi_sale, khu_vuc, san_pham (full code), mau (line-colour), dong (line) by ban (qty), doanh_thu, ton (current stock), het_hang (stockouts), tra (returns). Filters: nhom, khu_vuc, tim (text), ma_ch. Returns totals.",
    input_schema: { type: "object", properties: {
      doi_tuong: { type: "string", enum: ["cua_hang", "doi_sale", "khu_vuc", "san_pham", "mau", "dong"] },
      chi_so: { type: "string", enum: ["ban", "doanh_thu", "ton", "het_hang", "tra"] },
      so_ngay: { type: "integer", description: "Last N days, default 7 (today = 1)" },
      tu_ngay: { type: "string" }, den_ngay: { type: "string" },
      nhom: { type: "string", enum: ["BH", "NV", "PK"], description: "BH helmets · NV fabric hats · PK accessories" },
      khu_vuc: { type: "string" }, tim: { type: "string" }, ma_ch: { type: "string", description: "only inside one store/team (when ranking products)" },
      thu_tu: { type: "string", enum: ["giam", "tang"] }, top: { type: "integer" },
      kem_ton: { type: "boolean", description: "include current stock per row" },
    }, required: ["doi_tuong", "chi_so"] },
  },
  {   // NEW - 285: doanh thu mọi kênh (1 loại doanh thu) — cấm tự viết SQL cho doanh thu
    name: "doanh_thu",
    description: "Revenue of EVERY sales channel with the app's single revenue definition (actual selling price; sale goods at sale price): stores CH/DB, sales teams DOISALE, online (Nhanh orders: TikTok Shop, Shopee, web…), total, per-day average, top 5 stores / teams, stores by group BH/NV/PK. tim = one store / team (code, store name or team number). ALWAYS use for doanh thu / revenue / tiền bán questions — NEVER hoi_so_lieu for revenue.",
    input_schema: { type: "object", properties: {
      tu_ngay: { type: "string", description: "YYYY-MM-DD, default today" }, den_ngay: { type: "string", description: "YYYY-MM-DD, default today (range ≤ 93 days)" },
      tim: { type: "string", description: "optional: one store / team" },
    } },
  },
  {   // NEW - 285: TikTok Shop y như màn TikTok Shop
    name: "tiktok",
    description: "TikTok Shop exactly like the 'TikTok Shop' screen: revenue, orders, qty, cancels; LIVE vs Video vs product card; per seller ID / channel account (e.g. 'Vành - Chính', 'Kết - Chính', 'Kết - Sale', store accounts). theo_doi=true = the user's 'Theo dõi ★' list (the special-watch IDs, '3 kênh theo dõi đặc biệt') with previous-period comparison. Without id/theo_doi = whole shop + top sellers. san_pham = products sold (ma, ten, sl, doanh_thu, don, don_huy, sl_huy, ly_do_huy, hinh = product IMAGE link) — ALWAYS use this tool (never hoi_so_lieu) for TikTok products / product images / cancelled products of an ID.",   // NEW - 3.160.1 (SQL 299)
    input_schema: { type: "object", properties: {
      tu_ngay: { type: "string", description: "YYYY-MM-DD, default today" }, den_ngay: { type: "string", description: "YYYY-MM-DD, default today" },
      id: { type: "array", items: { type: "string" }, description: "seller ID names or @accounts" },
      theo_doi: { type: "boolean", description: "the user's Theo dõi ★ list" },
      so_sp: { type: "number", description: "how many products in san_pham (default 30 with id, 10 without; max 60)" },
    } },
  },
  {   // NEW - 285: Online (Nhanh) y như màn Online
    name: "online",
    description: "Online orders (Nhanh) exactly like the 'Online' screen: revenue, orders, cancels, returns, per sales channel (TikTok Shop, Shopee, web, Facebook, Zalo…), per-day average.",
    input_schema: { type: "object", properties: {
      tu_ngay: { type: "string", description: "YYYY-MM-DD, default today" }, den_ngay: { type: "string", description: "YYYY-MM-DD, default today" },
    } },
  },
  {
    name: "hoi_so_lieu",
    description: "Run ONE read-only SELECT (max 300 rows) only when no other tool covers the question. Never for revenue (use doanh_thu / tiktok / online). Never for TikTok Shop orders / products / images (use tiktok).\n" + SCHEMA_GON,
    input_schema: { type: "object", properties: {
      cau_hoi: { type: "string", description: "Short question in Vietnamese (shown to the user)" },
      cach_tinh: { type: "string", description: "One honest line in Vietnamese: which data, filters and period the numbers use (shown to the user under 'Cách tính')" },
      sql: { type: "string", description: "Exactly one SELECT/WITH, no trailing ;" },
    }, required: ["cau_hoi", "cach_tinh", "sql"] },
  },
  {
    name: "danh_muc",
    description: "Find tables + columns by keyword (e.g. 'van don', 'odoo', 'thung') before querying an unknown table. Empty = list all tables.",
    input_schema: { type: "object", properties: { tu_khoa: { type: "string" } } },
  },
  {   // NEW - 3.133 tự học: lưu nghĩa từ / quy tắc vào tri thức (bộ não)
    name: "ghi_nho",
    description: "Save a lasting business meaning or rule to the app's knowledge base (its 'brain') when the user explains what a word means, defines a rule, corrects you, or says nhớ / ghi nhớ / lần sau. Never for one-off numbers. Admin → active now; others → waits for admin approval.",
    input_schema: { type: "object", properties: {
      cum_tu: { type: "string", description: "Comma-separated trigger phrases exactly as users say them (Vietnamese), e.g. 'đi hàng, chia tồn kho'" },
      noi_dung: { type: "string", description: "Self-contained meaning/rule in Vietnamese (≤ 600 chars)" },
      cong_cu: { type: "string", description: "Tool to use for this kind of question, if any" },
    }, required: ["cum_tu", "noi_dung"] },
  },
  {
    name: "mo_man",
    description: "Open a screen for the user. tab: " + TAB_MO_TA,
    input_schema: { type: "object", properties: { tab: { type: "string" }, che: { type: "string", description: "sub-mode (tab doisale)" } }, required: ["tab"] },
  },
  {
    name: "chia_doi",
    description: "Prepare an allocation plan for ONE sales team on the 'Chia từng đội' screen with the app's own engine (rounding by sale price, never above warehouse stock, box picking by the shared formula), apply constraints, check, and create a PENDING APPROVAL (no stock written). Call again to revise (old pending one is cancelled). The app reports the result itself.",
    input_schema: { type: "object", properties: {
      doi: { type: "string", description: "Team number ('1'), code (DOISALE01) or name" },
      chia_du_ngay: { type: "integer", description: "'Chia đủ' days" },
      suc_ban_ngay: { type: "integer", description: "'Sức bán' days" },
      ty_le: { type: "integer", description: "'Tỷ lệ' %" },
      thung: { type: "object", description: "Pick boxes by the shared box-suggestion formula", properties: { so_min: { type: "integer" }, so_max: { type: "integer" } } },
      ma_thung: { type: "array", items: { type: "string" }, description: "Specific boxes" },
      bo_thung: { type: "boolean", description: "No boxes" },
      tran_ton_sau: { type: "integer", description: "Team's total sale stock AFTER allocation must not exceed" },
      tran_giao: { type: "integer", description: "Total delivered this time (boxes + extra) must not exceed" },
      toi_da_moi_ma: { type: "integer" },
      uu_tien: { type: "array", items: { type: "string" }, description: "Codes/keywords to keep when trimming" },
      chi_ma: { type: "array", items: { type: "string" }, description: "ONLY allocate matching codes" },
      loai_bo: { type: "array", items: { type: "string" }, description: "Exclude matching codes" },
      bo_du_qua_ngay: { type: "integer", description: "Skip codes the team already covers for more than N days" },
      nguon: { type: "string", enum: ["tat", "sa", "pk"] },
      lam_tiep: { type: "boolean", description: "true if more work remains after this step (other teams, comparison, analysis)" },
    }, required: ["doi"] },
  },
  {
    name: "doc_man",
    description: "Read the open 'Chia từng đội' table (team, parameters, totals, boxes, warnings) to double-check.",
    input_schema: { type: "object", properties: {} },
  },
];
const CONG_CU_MAN = new Set(["mo_man", "chia_doi", "doc_man"]);

// Mọi dữ liệu kinh doanh đều mở; chỉ chặn bí mật (mật khẩu, phiên đăng nhập, khoá) và nhật ký AI
const CAM_SQL = /\b(vault|decrypted_secrets?|mat_khau|password|secret|phien|push_sub|ai_phien|ai_tin|ai_viec|ai_buoc|ai_thao_tac|ai_token|fn_ai_khoa|fn_odoo_khoa|pg_authid|pg_shadow|current_setting|set_config|dblink|http_get|http_post)\b|\b(auth|storage|net|cron|vault|supabase_functions)\s*\./i;
async function hoiSoLieu(i: J) {
  const sql = String(i?.sql || "").trim().replace(/;+\s*$/, "");
  if (!sql) return { ok: false, loi: "Thiếu câu SELECT" };
  if (CAM_SQL.test(sql)) return { ok: false, loi: "Câu truy vấn chạm vùng bí mật (mật khẩu, phiên đăng nhập, khoá). Thông tin nhân sự dùng v_nguoi_dung_ai." };
  const sql2 = sql.replace(/\b(chiahang\.)?nguoi_dung\b/gi, "v_nguoi_dung_ai");   // nhân sự: đi qua view không có mật khẩu
  let kq = await rpc("fn_ai_chay_sql", { p_sql: sql2, p_gioi_han: 300 });
  if (Array.isArray(kq)) kq = kq[0];
  if (!kq?.ok) return { ok: false, loi: kq?.loi || "Lỗi truy vấn" };
  let du = JSON.stringify(kq.du_lieu ?? []);
  const cat = du.length > 9000;
  if (cat) du = du.slice(0, 9000);
  return { ok: true, so_dong: kq.so_dong, du_lieu: cat ? du + "…(cắt bớt)" : kq.du_lieu, cat };
}

async function hoSo(i: J) {
  const r = await rpc("fn_ai_ho_so", { p_q: String(i?.q || ""), p_ngay: Number(i?.ngay) || 30 });
  return r && typeof r === "object" ? r : { ok: false, loi: "Không đọc được hồ sơ" };
}
async function danhMuc(i: J) {
  const r = await rpc("fn_ai_danh_muc", { p_tu_khoa: String(i?.tu_khoa || "") || null });
  return { ok: true, bang: r };
}
async function xepHang(i: J) {
  const r = await rpc("fn_ai_xep_hang", { p: i || {} });
  return r && typeof r === "object" ? r : { ok: false, loi: "Không xếp hạng được" };
}
async function tongQuan() {
  const r = await rpc("fn_ai_tong_quan", {});
  return r && typeof r === "object" ? r : { ok: false, loi: "Không đọc được số liệu Tổng quan" };
}
async function dieuChuyen(i: J) {
  const r = await rpc("fn_ai_dieu_chuyen", { p: i || {} });
  return r && typeof r === "object" ? r : { ok: false, loi: "Không đọc được phiếu điều chuyển" };
}
async function lichDeNghi(i: J) {
  const r = await rpc("fn_ai_lich_de_nghi", { p: i || {} });
  return r && typeof r === "object" ? r : { ok: false, loi: "Không đọc được Lịch đề nghị" };
}
// NEW - 285: doanh thu / TikTok / Online — gọi CHÍNH hàm của màn (cần phiên của người hỏi để kiểm quyền như trên app)
async function doanhThu(i: J, c?: Ctx) {
  const r = await rpc("fn_ai_doanh_thu", { p_token: c?.token || null, p: i || {} });
  return r && typeof r === "object" ? r : { ok: false, loi: "Không đọc được doanh thu" };
}
async function tikTok(i: J, c?: Ctx) {
  const r = await rpc("fn_ai_tiktok", { p_token: c?.token || null, p: i || {} });
  return r && typeof r === "object" ? r : { ok: false, loi: "Không đọc được TikTok Shop" };
}
async function onLine(i: J, c?: Ctx) {
  const r = await rpc("fn_ai_online", { p_token: c?.token || null, p: i || {} });
  return r && typeof r === "object" ? r : { ok: false, loi: "Không đọc được màn Online" };
}
const CONG_CU_MAY: Record<string, (i: J, c?: Ctx) => Promise<J>> = { hoi_so_lieu: hoiSoLieu, ho_so: hoSo, danh_muc: danhMuc, xep_hang: xepHang, tong_quan: tongQuan, lich_de_nghi: lichDeNghi, dieu_chuyen: dieuChuyen,
  doanh_thu: doanhThu, tiktok: tikTok, online: onLine };

// ---------------------------------------------------------------------------
// NEW - 285: SỔ SỐ LIỆU + TỪ ĐIỂN — nạp sẵn vào lời dặn, hỏi là trả lời ngay (không thêm lịch chạy: sổ cũ > 15 phút tự tính lại)
// ---------------------------------------------------------------------------
const cho = <T,>(p: Promise<T>, ms: number): Promise<T | null> => Promise.race([p.catch(() => null), new Promise<null>((ok) => setTimeout(() => ok(null), ms))]);
const tien = (v: unknown) => (v == null ? "—" : Math.round(Number(v)).toLocaleString("vi-VN") + "đ");
function khoiSoLieu(s: J | null, them: number[] = []): string {
  if (!s || typeof s !== "object" || !s.doanh_thu) return "";
  const d = s.doanh_thu || {}, h = d.hom_nay || {}, q = d.hom_qua || {}, b = d["7_ngay"] || {}, m = d.thang_nay || {};
  const tb = (x: unknown, n: unknown) => { if (x == null) return null; const v = Math.round(Number(x) / (Number(n) || 1)); them.push(v); return v; };
  const hang = (ten: string, k: string) => `- ${ten}: ${tien(h[k])} | ${tien(q[k])} | ${tien(b[k])} (TB ${tien(tb(b[k], b.so_ngay || 7))}/ngày) | ${tien(m[k])} (TB ${tien(tb(m[k], m.so_ngay || 1))}/ngày)`;
  const l: string[] = [];
  const luc = s.luc ? new Date(new Date(s.luc).getTime() + 7 * 3600000).toISOString().slice(11, 16) : "?";
  l.push(`\n\nTODAY FACTS — computed ${luc} (${s.tuoi_phut ?? 0} min ago) by the app's own report functions, single revenue definition. Quote these directly (Vietnamese format); mention the time if > 15 min old; for other periods / details call doanh_thu, tiktok or online.`);
  l.push(`Doanh thu | hôm nay (${h.den || ""}) | hôm qua | 7 ngày ${b.tu || ""}→${b.den || ""} | tháng này ${m.tu || ""}→${m.den || ""}`);
  l.push(hang("Tổng (cửa hàng + đội sale + online)", "tong"));
  l.push(hang("Cửa hàng CH/DB", "cua_hang"));
  l.push(hang("Đội sale (giá sale thực bán)", "doi_sale"));
  l.push(hang("Online (đơn Nhanh: TikTok Shop, Shopee, web…)", "online"));
  const ok = (x: J) => Object.entries(x?.online_kenh || {}).filter(([, v]) => Number(v) > 0).sort((a, z) => Number(z[1]) - Number(a[1])).slice(0, 5).map(([k, v]) => `${k} ${tien(v)}`).join(" · ");
  if (h.online_kenh) l.push(`  · Online theo kênh hôm nay: ${ok(h)}`);
  if (b.online_kenh) l.push(`  · Online theo kênh 7 ngày: ${ok(b)}`);
  const tk = s.tiktok || {};
  for (const [ky, ten] of [["hom_nay", "hôm nay"], ["7_ngay", "7 ngày"]]) {
    const x = tk[ky]; if (!x) continue;
    l.push(`TikTok Shop ${ten} (màn TikTok Shop): ${tien(x.tong)} · ${x.don ?? "—"} đơn hợp lệ · ${x.don_huy ?? "—"} đơn huỷ${ky === "7_ngay" ? ` · TB ${tien(x.tb_ngay)}/ngày` : ""} · ${Object.entries(x.kenh || {}).map(([k, v]) => `${k} ${tien(v)}`).join(" · ")}`
      + (x.top_nguoi_ban?.length ? ` · top: ${x.top_nguoi_ban.slice(0, 4).map((n: J) => `${n.ten} ${tien(n.dt)}`).join(", ")}` : ""));
  }
  const td = s.theo_doi || {};
  for (const [ky, ten] of [["hom_nay", "hôm nay"], ["7_ngay", "7 ngày"]]) {
    const x: J[] = td[ky]; if (!x?.length) continue;
    const tong = x.reduce((a, n) => a + Number(n.dt || 0), 0), don = x.reduce((a, n) => a + Number(n.don || 0), 0);
    them.push(tong);
    l.push(`Theo dõi ★ của người hỏi (TikTok Shop) ${ten}: ` + x.map((n) => `${n.ten} ${n.tai_khoan} ${tien(n.dt)} (${n.don} đơn, LIVE ${tien(n.dt_live)}, Video ${tien(n.dt_video)}${ky === "7_ngay" ? `, TB ${tien(n.tb_ngay)}/ngày, kỳ trước ${tien(n.ky_truoc_dt)}` : ""})`).join(" · ")
      + ` · CỘNG ${x.length} ID: ${tien(tong)}, ${don} đơn`);
  }
  const v = s.van_de || {}, cn = s.cap_nhat || v.cap_nhat || {};
  const vd: string[] = [];
  if (v.don_odoo_loi_hom_nay) vd.push(`${v.don_odoo_loi_hom_nay} đơn Odoo lỗi hôm nay (${(v.don_odoo_loi_mau || []).join("; ")})`);
  if (v.don_odoo_dang_gui) vd.push(`${v.don_odoo_dang_gui} đơn Odoo đang gửi / chưa rõ`);
  if (v.tiktok_cho_thanh_toan_hom_nay) vd.push(`${v.tiktok_cho_thanh_toan_hom_nay} đơn TikTok hôm nay chờ thanh toán (đang tính trong doanh thu)`);
  if (v.tiktok_cho_gui_hang) vd.push(`${v.tiktok_cho_gui_hang} đơn TikTok chờ gửi hàng`);
  Object.entries(v.loi_dong_bo || {}).forEach(([k, x]) => vd.push(`lỗi đồng bộ ${k}: ${x}`));
  if (vd.length) l.push("Vấn đề hôm nay: " + vd.join(" · "));
  // NEW - 289: sổ vấn đề toàn app (đỏ = gấp) — AI nắm sẵn, không đợi hỏi
  const va: J[] = Array.isArray(s.van_de_app) ? s.van_de_app : [];
  if (va.length) {
    l.push("APP ISSUES NOW (computed from the app's data; mention the relevant ones proactively when they bear on the question; for 'có vấn đề gì / hôm nay sao' list them, red first):");
    va.slice(0, 20).forEach((x) => l.push(`- [${x.muc === "do" ? "ĐỎ" : "vàng"}] ${x.nhom}: ${x.tieu_de}${x.chi_tiet ? " — " + String(x.chi_tiet).slice(0, 260) : ""}`));
  }
  const c2 = s.cap_nhat || cn;
  if (c2 && Object.keys(c2).length) l.push(`Dữ liệu mới nhất: bán cửa hàng ${c2.ban_cua_hang || "—"} · đội sale ${c2.ban_doi_sale || "—"} · đơn TikTok ${c2.tiktok_don || "—"} · đơn Nhanh ${c2.nhanh_don || "—"}`);
  return l.join("\n");
}
function khoiTuDien(ds: J[] | null): string {
  if (!Array.isArray(ds) || !ds.length) return "";
  return "\n\nENTITIES IN THIS QUESTION (resolved from the app's data — trust these over guesses):\n" + ds.slice(0, 12).map((x) => "- " + String(x.giai_thich || "")).join("\n");
}

// NEW - 3.133 TRI THỨC: nạp nghĩa từ / quy tắc / bài học sửa sai khớp câu hỏi · AI tự ghi nhớ khi được giải thích
async function napTriThuc(yeuCau: string): Promise<J[]> {
  try { const r = await rpc("fn_ai_tri_thuc_cho", { p_yeu_cau: yeuCau }); return Array.isArray(r) ? r : []; } catch (e) { console.error("tri_thuc", String((e as Error)?.message || e).slice(0, 200)); return []; }
}
function khoiTriThuc(ds: J[]): string {
  if (!ds.length) return "";
  return "\n\nBUSINESS KNOWLEDGE (the company's own definitions — they override your assumptions; if an item names a tool, use it):\n" +
    ds.map((t) => `- ${t.loai === "sua_sai" ? "[past mistake] " : t.loai === "cau_mau" ? "[worked example] " : t.loai === "kien_thuc" ? "[fact] " : ""}${t.cau_mau ? "Q: \"" + String(t.cau_mau).slice(0, 200) + "\" → " : ""}${t.cum_tu ? "[" + String(t.cum_tu).split(",").slice(0, 4).map((x) => x.trim()).join(", ") + "] " : ""}${t.noi_dung}${t.cong_cu ? " (tool: " + t.cong_cu + ")" : ""}`).join("\n");
}
async function ghiNho(q: J, i: J) {
  const p: J = { cum_tu: String(i?.cum_tu || "").slice(0, 300), noi_dung: String(i?.noi_dung || "").slice(0, 800), cong_cu: String(i?.cong_cu || "") || null, loai: "tu_ngu" };
  const r = await rpc("fn_ai_ghi_nho", { p_nguoi: q.ma, p_admin: !!q.admin, p });
  if (r?.ok === false) return r;
  return { ok: true, trang_thai: r?.trang_thai, ghi_chu: r?.trang_thai === "dung" ? "Đã lưu vào tri thức, dùng ngay từ câu sau" : "Đã lưu, chờ Quản trị duyệt" };
}

// NEW - 3.133 CÁCH TÍNH: lộ định nghĩa / truy vấn đằng sau mỗi con số để người dùng tự soi
const BANG_TEN: J = { ban_hang: "bán hàng cửa hàng", ban_hang_doi_sale: "bán hàng đội sale", san_pham: "sản phẩm", v_sp_tt: "tên sản phẩm", ton_kho: "tồn kho", ton_kho_thung: "tồn kho thùng",
  cua_hang: "danh sách cửa hàng / kho", don_xin_hang: "đơn xin hàng", khong_de_nghi: "không đề nghị", lich_ngay: "lịch đề nghị", dieu_chuyen_kho: "phiếu điều chuyển Odoo",
  yeu_cau_dieu_phoi: "yêu cầu điều phối", odoo_don: "đơn Odoo", het_hang_log: "nhật ký hết hàng", giu_hang: "giữ hàng", van_don_ghtk: "vận đơn GHTK", hang_dac_biet: "hàng đặc biệt",
  thung_dong_san: "thùng đóng sẵn", thung_dong_san_ct: "chi tiết thùng", v_nguoi_dung_ai: "nhân sự" };
function bangTuSql(sql: string): string[] {
  const cte = new Set([...sql.matchAll(/\b([a-z_][a-z0-9_]*)\s+as\s*(?:materialized\s*)?\(/gi)].map((m) => m[1].toLowerCase()));
  const ds = [...sql.matchAll(/\b(?:from|join)\s+(?:chiahang\.)?([a-z_][a-z0-9_]*)/gi)].map((m) => m[1].toLowerCase())
    .filter((t) => !cte.has(t) && !/^(lateral|unnest|generate_series|jsonb_|json_|fn_|select)/.test(t));
  return [...new Set(ds)].map((t) => BANG_TEN[t] ? `${BANG_TEN[t]} (${t})` : t);
}
const CACH_CO_DINH: J = {
  tong_quan: "Cùng khối số liệu với màn Tổng quan (bán hôm nay không gồm phụ kiện; chỉ cửa hàng / điểm bán đang hoạt động).",
  chia_doi: "Engine chia của màn Chia từng đội (làm tròn theo giá sale, không vượt tồn kho, chọn thùng theo công thức chung).",
};
function themCach(tam: J, ten: string, input: J, r: J) {
  if (!r || r.ok === false || ten === "danh_muc" || ten === "ghi_nho") return;
  let muc: J | null = null;
  if (ten === "hoi_so_lieu") muc = { cong_cu: ten, nhan: String(input?.cau_hoi || "").slice(0, 160), dinh_nghia: String(input?.cach_tinh || "AI tự viết truy vấn").slice(0, 400), bang: bangTuSql(String(input?.sql || "")), sql: String(input?.sql || "").slice(0, 3000) };
  else {
    const dn = String(r.dinh_nghia || CACH_CO_DINH[ten] || r.nguon || "");
    if (dn) muc = { cong_cu: ten, nhan: nhanCongCu(ten, input), dinh_nghia: dn.slice(0, 600) };
  }
  if (!muc) return;
  const ds: J[] = tam.cach || [];
  if (!ds.some((x) => x.cong_cu === muc!.cong_cu && x.dinh_nghia === muc!.dinh_nghia && (x.sql || "") === (muc!.sql || ""))) ds.push(muc);
  tam.cach = ds.slice(-8);
}

const nhanCongCu = (ten: string, i: J): string => {
  if (ten === "tong_quan") return "Đọc số liệu màn Tổng quan";
  if (ten === "lich_de_nghi") return "Đọc Lịch đề nghị " + (i?.tu_ngay ? `${i.tu_ngay} → ${i.den_ngay || "nay"}` : i?.ngay || "hôm nay") + (i?.khu_vuc ? " · " + i.khu_vuc : "") + (i?.nhom ? " · " + i.nhom : "");
  if (ten === "dieu_chuyen") return "Đọc phiếu điều chuyển Odoo " + (i?.tu_ngay ? `${i.tu_ngay} → ${i.den_ngay || "nay"}` : i?.ngay || "hôm nay") + (i?.tim ? " · " + i.tim : "") + (i?.tien_to ? " · " + i.tien_to : "");
  if (ten === "ho_so") return "Đọc hồ sơ " + String(i?.q || "") + (i?.ngay ? ` (${i.ngay} ngày)` : "");
  if (ten === "danh_muc") return "Tra danh mục bảng" + (i?.tu_khoa ? ": " + i.tu_khoa : "");
  if (ten === "xep_hang") return `Xếp hạng ${({ cua_hang: "cửa hàng", doi_sale: "đội sale", khu_vuc: "khu vực", san_pham: "sản phẩm", mau: "mẫu màu", dong: "dòng" } as J)[i?.doi_tuong] || i?.doi_tuong} theo ${({ ban: "số bán", doanh_thu: "doanh thu", ton: "tồn", het_hang: "hết hàng", tra: "trả hàng" } as J)[i?.chi_so] || i?.chi_so}${i?.nhom ? " · " + i.nhom : ""}${i?.so_ngay ? " · " + i.so_ngay + " ngày" : ""}`;
  if (ten === "hoi_so_lieu") return "Tra số liệu: " + String(i?.cau_hoi || "").slice(0, 120);
  const ky = (i?.tu_ngay || i?.den_ngay) ? ` ${i?.tu_ngay || ""}${i?.den_ngay && i?.den_ngay !== i?.tu_ngay ? " → " + i.den_ngay : ""}` : " hôm nay";   // NEW - 285
  if (ten === "doanh_thu") return "Doanh thu mọi kênh (cửa hàng · đội sale · Online)" + ky + (i?.tim ? " · " + i.tim : "");
  if (ten === "tiktok") return "Đọc TikTok Shop" + ky + (i?.theo_doi ? " · danh sách Theo dõi ★" : i?.id?.length ? " · " + [].concat(i.id).join(", ") : "");
  if (ten === "online") return "Đọc màn Online (Nhanh)" + ky;
  if (ten === "ghi_nho") return "Ghi nhớ vào tri thức: " + String(i?.cum_tu || "").split(",")[0].trim().slice(0, 60);
  if (ten === "mo_man") return "Mở màn " + (i?.tab || "") + (i?.che ? " · " + i.che : "");
  if (ten === "doc_man") return "Đọc màn Chia từng đội để kiểm tra";
  if (ten === "chia_doi") {
    const p: string[] = [];
    if (i?.chia_du_ngay) p.push(`đủ ${i.chia_du_ngay} ngày`);
    if (i?.thung) p.push(`${i.thung.so_min ?? "?"}–${i.thung.so_max ?? "?"} thùng`);
    if (i?.tran_ton_sau) p.push(`tồn sau ≤ ${i.tran_ton_sau}`);
    if (i?.tran_giao) p.push(`giao ≤ ${i.tran_giao}`);
    return `Chia hàng đội ${i?.doi ?? ""}` + (p.length ? " (" + p.join(", ") + ")" : "");
  }
  return ten;
};

// ---------------------------------------------------------------------------
// GỌI AI — 2 kiểu API (anthropic /v1/messages · openai /v1/chat/completions), nội bộ giữ dạng anthropic
// ---------------------------------------------------------------------------
type KqAI = { blocks: J[]; vao: number; ra: number; mo_hinh: string; u?: J };
function sangOpenAI(sys: string, msgs: J[]) {
  const out: J[] = [{ role: "system", content: sys }];
  for (const m of msgs) {
    if (typeof m.content === "string") { out.push({ role: m.role, content: m.content }); continue; }
    if (m.role === "assistant") {
      const text = m.content.filter((b: J) => b.type === "text").map((b: J) => b.text).join("\n");
      const calls = m.content.filter((b: J) => b.type === "tool_use").map((b: J) => ({ id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
      out.push({ role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
    } else {
      const text = m.content.filter((b: J) => b.type === "text").map((b: J) => b.text).join("\n");
      m.content.filter((b: J) => b.type === "tool_result").forEach((b: J) => out.push({ role: "tool", tool_call_id: b.tool_use_id, content: typeof b.content === "string" ? b.content : JSON.stringify(b.content) }));
      if (text) out.push({ role: "user", content: text });
    }
  }
  return out;
}
// NEW - 3.159.5: NHỚ ĐỆM (prompt caching) — phần cố định (công cụ + lời dặn) và phần đầu cuộc hỏi đáp được máy AI nhớ 5 phút:
//   lượt sau đọc lại với giá 1/10 thay vì đọc mới. Tối đa 4 điểm nhớ: cuối danh sách công cụ · cuối lời dặn cố định · cuối lời dặn · cuối tin nhắn.
let nhoDemTat = false;   // cổng AI không nhận nhớ đệm (lỗi 400) → tắt trong phiên máy này, gọi kiểu thường
function nhoDem(sys: string, tools: J[], msgs: J[]): J {
  const dau = sys.startsWith(LOI_DAN) ? LOI_DAN : "";
  const system: J[] = dau
    ? [{ type: "text", text: dau, cache_control: { type: "ephemeral" } }, ...(sys.length > dau.length ? [{ type: "text", text: sys.slice(dau.length), cache_control: { type: "ephemeral" } }] : [])]
    : [{ type: "text", text: sys, cache_control: { type: "ephemeral" } }];
  const t2 = tools.length ? tools.map((t, i) => (i === tools.length - 1 ? { ...t, cache_control: { type: "ephemeral" } } : t)) : [];
  const m2 = msgs.map((m, i) => {
    if (i !== msgs.length - 1) return m;
    const c = typeof m.content === "string" ? [{ type: "text", text: m.content }] : Array.isArray(m.content) ? m.content.map((b: J) => ({ ...b })) : m.content;
    if (Array.isArray(c) && c.length) c[c.length - 1] = { ...c[c.length - 1], cache_control: { type: "ephemeral" } };
    return { ...m, content: c };
  });
  return { system, messages: m2, ...(t2.length ? { tools: t2 } : {}) };
}
class LoiAI extends Error { constructor(msg: string, public http = 0, public thuLai = false) { super(msg); } }
function loiHttp(s: number, t: string): LoiAI {
  const ngan = t.replace(/\s+/g, " ").slice(0, 200);
  if (s === 401 || s === 403) return new LoiAI("Khoá FableAI sai, hết hạn hoặc bị chặn (" + s + ")", s);
  if (s === 402) return new LoiAI("Tài khoản FableAI hết số dư (402)", s);
  if (s === 429) return new LoiAI("FableAI đang giới hạn tốc độ (429) — thử lại sau ít giây", s, true);
  if (s >= 500) return new LoiAI("FableAI lỗi máy chủ (" + s + ")", s, true);
  return new LoiAI("FableAI trả lỗi " + s + ": " + ngan, s);
}
async function goiMot(cfg: J, khoa: string, mo_hinh: string, sys: string, tools: J[], msgs: J[], maxTok: number, ep = false): Promise<KqAI> {
  const url = String(cfg.url || "https://api.fableaiapi.com").replace(/\/+$/, "");
  let r: Response;
  try {
    if (cfg.kieu === "openai") {
      r = await fetch(url + "/v1/chat/completions", {
        method: "POST", signal: AbortSignal.timeout(90000),
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + khoa },
        body: JSON.stringify({ model: mo_hinh, max_tokens: maxTok, messages: sangOpenAI(sys, msgs),
          ...(tools.length ? { tools: tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } })), ...(ep ? { tool_choice: "required" } : {}) } : {}) }),
      });
    } else {
      const goi = (nho: boolean) => fetch(url + "/v1/messages", {
        method: "POST", signal: AbortSignal.timeout(90000),
        headers: { "Content-Type": "application/json", "x-api-key": khoa, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: mo_hinh, max_tokens: maxTok, ...(nho ? nhoDem(sys, tools, msgs) : { system: sys, messages: msgs, ...(tools.length ? { tools } : {}) }),
          ...(tools.length && ep ? { tool_choice: { type: "any" } } : {}) }),
      });
      const nho = !cfg.khong_nho_dem && !nhoDemTat;
      r = await goi(nho);
      if (nho && r.status === 400) {   // NEW - 3.159.5: cổng không nhận nhớ đệm → gọi lại kiểu thường, nhớ để lần sau khỏi thử
        const t0 = await r.text();
        if (/cache|system|content|block|extra/i.test(t0)) nhoDemTat = true;   // lỗi do nhớ đệm → tắt hẳn trong phiên máy
        console.error("nho_dem 400 -> goi thuong:", t0.slice(0, 200));
        r = await goi(false);   // mọi lỗi 400 khi có nhớ đệm: thử lại 1 lần kiểu thường cho chắc
      }
    }
  } catch (e) {
    throw new LoiAI("Không kết nối được FableAI: " + String((e as Error)?.message || e).slice(0, 120), 0, true);
  }
  const t = await r.text();
  if (!r.ok) {
    const e = loiHttp(r.status, t);
    const ra = Number(r.headers.get("retry-after") || 0);
    (e as J).cho = ra > 0 ? Math.min(ra * 1000, 6000) : 1500;
    throw e;
  }
  let j: J; try { j = JSON.parse(t); } catch { throw new LoiAI("FableAI trả về không phải JSON"); }
  if (cfg.kieu === "openai") {
    const m = j?.choices?.[0]?.message || {};
    const blocks: J[] = [];
    if (m.content) blocks.push({ type: "text", text: String(m.content) });
    (m.tool_calls || []).forEach((c: J) => {
      let input: J = {}; try { input = JSON.parse(c.function?.arguments || "{}"); } catch { /* */ }
      blocks.push({ type: "tool_use", id: c.id, name: c.function?.name, input });
    });
    return { blocks, vao: j?.usage?.prompt_tokens || 0, ra: j?.usage?.completion_tokens || 0, mo_hinh, u: { ...(j?.usage || {}), stop: j?.choices?.[0]?.finish_reason ?? null } };
  }
  const blocks = (j?.content || []).filter((b: J) => b.type === "text" || b.type === "tool_use").map((b: J) => (b.type === "text" ? { type: "text", text: b.text } : { type: "tool_use", id: b.id, name: b.name, input: b.input ?? {} }));
  const u = j?.usage || {};
  return { blocks, vao: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0), ra: u.output_tokens || 0, mo_hinh, u: { ...u, stop: j?.stop_reason ?? null } };   // NEW - 3.160.1: lý do dừng
}
async function goiAI(cfg: J, khoa: string, sys: string, tools: J[], msgs: J[], maxTok = 1400, ep = false): Promise<KqAI> {
  const chinh = String(cfg.mo_hinh || "claude-opus-5-5");
  try { return await goiMot(cfg, khoa, chinh, sys, tools, msgs, maxTok, ep); } catch (e) {
    if (!(e as LoiAI).thuLai) throw e;
    await new Promise((r) => setTimeout(r, (e as J).cho || 1500));
    try { return await goiMot(cfg, khoa, chinh, sys, tools, msgs, maxTok, ep); } catch (e2) {
      const phu = String(cfg.mo_hinh_du_phong || "");
      if (!(e2 as LoiAI).thuLai || !phu || phu === chinh) throw e2;
      return await goiMot(cfg, khoa, phu, sys, tools, msgs, maxTok, ep);
    }
  }
}

// ---------------------------------------------------------------------------
// LỜI DẶN
// ---------------------------------------------------------------------------
const LOI_DAN = [
  'You are SIÊU TRÍ TUỆ, the operations assistant inside the "Điều phối hàng hoá" app of Nón Sơn (helmet & fabric-hat chain: ~190 active stores CH*/DB*; 31 sales teams DOISALEnn; main warehouses TP05006 helmets / TP05002 fabric hats, sale-goods SA05001/SA05002, accessories PK05001, boxes TK05005, regional KV*).',
  "RULES",
  '- Reply ONLY in Vietnamese with full diacritics; call yourself "em" and address the user EXACTLY with the form given in "Address the user as" below — never guess gender from the name. Short, to the point, bullet points, thousands separated by dots. Use **bold** for headings; never use # headings, > quotes or tables.',
  "- Messages are often voice-dictated and may contain mis-heard words (e.g. 'bộ' for 'cái' / 'cửa hàng'): read them by sound and by the conversation so far.",
  "- If a request is unclear, NEVER answer with only a question. Take the most likely meaning from the conversation and screen, fetch the data and answer it. If another meaning is plausible, check it too and state it in one line (e.g. 'Hôm nay không có lịch đội sale nào — nếu ý <address> là cửa hàng thì: …'). End with one short confirm question ('Ý <address> là …, đúng không ạ?'). Ask back without answering only when nothing reasonable can be fetched — and then still list concrete options.",
  "- Every number must come from a tool result. Never invent, estimate or guess. If data is missing, say exactly what is missing.",
  "- Never say anything was created, prepared, sent or is waiting for approval unless a tool result in THIS request confirms it. 'phuong_an_gan_nhat' in the screen context is an OLD plan for revisions only — not something done now. To make a plan you MUST call chia_doi.",
  "- Use the tool whose definition matches the app screen: đề nghị / gửi đơn / lịch định kỳ / đã gửi / chưa gửi / không đề nghị → lich_de_nghi (never yeu_cau_dieu_phoi or don_xin_hang via SQL). Đơn / phiếu trên Odoo (anh may say 'đu'), đã xuất / chưa xuất → dieu_chuyen (never odoo_don via SQL). Chain-wide today overview (bán hôm nay, thiếu hàng, cháy hàng, hết sạch, đơn khẩn, điều chuyển đang chạy, yêu cầu điều phối chờ) → tong_quan. One store/team/warehouse/product → ho_so. Top/ranking/totals → xep_hang. Anything else → hoi_so_lieu (PostgreSQL); unsure of columns → danh_muc first.",
  '- If any number came from hoi_so_lieu, end with one line: "Số liệu em tự tra bằng truy vấn riêng — anh nên đối chiếu màn hình." Fill its cach_tinh honestly (data, filters, period).',
  "- When the user explains a word, defines a rule or corrects you (ý anh là…, không phải…, nhớ là…, lần sau…), also call ghi_nho with the lasting lesson. Never save one-off numbers.",
  "- Call every needed tool in the first turn (parallel is fine). Ask back only when required info is missing; otherwise act and state your interpretation.",
  '- Writes (confirm allocation, Odoo orders…) are never done directly: tools only create a pending approval; the user taps "Duyệt & thực hiện".',
  '- Revenue (doanh thu, tiền bán) of any channel: answer from TODAY FACTS when they cover it, otherwise call doanh_thu / tiktok / online. NEVER use hoi_so_lieu (own SQL) for revenue — joining sales tables multiplies rows and sale goods must use the sale price.',
  '- "kênh" can mean a sales channel (cửa hàng / đội sale / online), a marketplace (TikTok Shop, Shopee…) or a TikTok seller ID / channel account (e.g. "Vành - Chính", "Kết - Chính", "Kết - Sale"). "3 kênh theo dõi (đặc biệt)" = the user\'s Theo dõi ★ list → tiktok theo_doi=true. Read ENTITIES first.',
  '- Voice dictation: "gạch ngang" = "-", "seo / sell" = "sale", "chín / 9" after Kết / Vành = "Chính", "đội xe / đội seo" = đội sale.',
  '- Every report answer must also give the average per day (TB/ngày) when the period is longer than 1 day.',
  '- chia_doi: "tầm 3–5 thùng" → thung {so_min:3, so_max:5}; "đủ 15 ngày" / "đủ bán 15 ngày" → chia_du_ngay 15 (NOT suc_ban_ngay; suc_ban_ngay only when the user says "sức bán N ngày"); "tồn sau không quá 500" → tran_ton_sau 500; "giao / còn 400 sản phẩm" → tran_giao 400; colours → look up colour codes, put them in uu_tien. Revisions → call chia_doi again keeping params from phuong_an_gan_nhat. More work after → lam_tiep:true.',
  "- Need data → CALL A TOOL NOW in this turn; never reply with only a plan.",
  "- Product images: tool results give image links (hinh). To show images write one line per product exactly: ![MÃ · SL cái · doanh thu](link) — the app renders them as an image grid. Never say you cannot send images.",   // NEW - 3.160.1
  "- A history line saying the previous request ran out of steps only means THAT request stopped. Every new request has full steps — never give step / turn / length limits as a reason; just do the work.",
].join("\n");
function loiDan(q: J, man: string, nguCanh: unknown) {
  const now = new Date(Date.now() + 7 * 3600000);
  const ngay = now.toISOString().slice(0, 10), gio = now.toISOString().slice(11, 16);
  let nc = ""; try { nc = JSON.stringify(nguCanh ?? {}); } catch { nc = "{}"; }
  if (nc.length > 2500) nc = nc.slice(0, 2500) + "…";
  const xh = String(q.cfg?.xung_ho?.[q.ma] || "anh/chị");   // NEW - 3.134 xưng hô theo tài khoản (Cài đặt › Xưng hô)
  return LOI_DAN + `\n\nUser: ${q.ten || q.ma} (${q.ma}, ${q.vai_tro}). Address the user as: "${xh}". Now: ${ngay} ${gio} (Vietnam time). Current screen: ${man || "?"}. Screen context: ${nc}`;
}

// chọn bộ công cụ theo yêu cầu (không tốn lượt AI) — chỉ bớt khi chắc chắn, còn lại gửi đủ
const boDauJs = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase();
function laHoiSoLieu(yeuCau: string): boolean {
  const s = " " + boDauJs(yeuCau) + " ";
  const hoi = /\?|\b(bao nhieu|may|nao|ai|tinh hinh|thong tin|so sanh|top|xep hang|doanh thu|ban chay|het hang|sap het|van don|odoo|bao cao|tai sao|vi sao|the nao|liet ke|danh sach|tong)\b/.test(s);
  const chia = /\b(chia|thung|phieu cho duyet|duyet)\b/.test(s);
  return hoi && !chia;
}
function laViecChia(yeuCau: string, nguCanh: J | null): boolean {
  const s = " " + boDauJs(yeuCau) + " ";
  return /\b(chia|thung|phieu|duyet|uu tien|loai bo|bo ma|giam xuong|tang len|ton sau|giao toi da|giao khong qua)\b/.test(s)
    || (!!nguCanh?.phuong_an_gan_nhat && /\b(giam|tang|bot|them|bo|con)\b/.test(s) && s.length < 90);
}
function chonCongCu(yeuCau: string, nguCanh: J | null): J[] {
  const s = " " + boDauJs(yeuCau) + " ";
  const viecChia = laViecChia(yeuCau, nguCanh);
  const hoi = /\?|\b(bao nhieu|may|nao|ai|tinh hinh|thong tin|so sanh|top|xep hang|doanh thu|ban chay|het hang|sap het|van don|odoo|bao cao|kiem tra|tai sao|vi sao|the nao)\b/.test(s);
  if (viecChia && !hoi) return CONG_CU.filter((t) => !["hoi_so_lieu", "danh_muc", "xep_hang", "tong_quan", "lich_de_nghi", "dieu_chuyen", "doanh_thu", "tiktok", "online"].includes(t.name));
  if (hoi && !viecChia) return CONG_CU.filter((t) => !["chia_doi", "doc_man"].includes(t.name));
  return CONG_CU;
}

// NEW - 285 SOÁT SỐ: gom mọi số trong kết quả công cụ / sổ số liệu; số tiền / số lớn trong câu trả lời phải khớp (cho phép làm tròn)
function ghiSo(tam: J, r: unknown) {
  if (r == null) return;
  let t = ""; try { t = typeof r === "string" ? r : JSON.stringify(r); } catch { return; }
  const ds: number[] = tam.so || [];
  for (const m of t.matchAll(/-?\d+(?:\.\d+)?/g)) { const v = Math.abs(Number(m[0])); if (v >= 1000) ds.push(v); }
  tam.so = [...new Set(ds)].slice(-4000);
}
function soChuaCo(tam: J, text: string): string[] {
  const co: number[] = tam.so || [];
  const re = /(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?(?:\s*(tỷ|triệu|trieu|tr|nghìn|ngàn|k)(?![\p{L}]))?/giu;
  const ds: { goc: string; v: number; sai: number }[] = [];
  for (const m of text.matchAll(re)) {
    const sau = text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 2);
    if (/^\s?%/.test(sau)) continue;   // phần trăm
    const nguyen = Number(m[1].replace(/\./g, "")), le = m[2] || "", dv = (m[3] || "").toLowerCase();
    const heSo = dv === "tỷ" ? 1e9 : (dv === "tr" || dv.startsWith("tri")) ? 1e6 : dv ? 1e3 : 1;
    const v = (nguyen + (le ? Number("0." + le) : 0)) * heSo;
    if (v < 10000 || (!dv && /^(19|20)\d{2}$/.test(m[1]))) continue;   // bỏ số nhỏ (ngày, đơn, %, mã…) và năm
    ds.push({ goc: m[0].trim(), v, sai: heSo > 1 ? heSo * Math.pow(10, -(le.length || 0)) * 0.51 + 1 : 1 });
  }
  const khop = (v: number, e: number) => co.some((x) => Math.abs(x - v) <= e);
  const dung = ds.filter((d) => khop(d.v, d.sai)).map((d) => d.v);
  const sai: string[] = [];
  for (const d of ds) {
    if (khop(d.v, d.sai)) continue;
    // cho phép phép cộng / trừ giữa các số ĐÃ khớp trong cùng câu trả lời (tổng 2–3 kênh, chênh lệch)
    let ok = false;
    for (let i = 0; i < dung.length && !ok; i++) for (let j = i + 1; j < dung.length && !ok; j++) {
      if (Math.abs(dung[i] + dung[j] - d.v) <= d.sai || Math.abs(Math.abs(dung[i] - dung[j]) - d.v) <= d.sai) ok = true;
      for (let k = j + 1; k < dung.length && !ok; k++) if (Math.abs(dung[i] + dung[j] + dung[k] - d.v) <= d.sai) ok = true;
    }
    // cho phép trung bình / ngày tự chia (7, 14, 28, 30 ngày hoặc số ngày đã qua trong tháng)
    if (!ok) for (const n of [7, 14, 28, 30, Number(tam.so_ngay_thang) || 0]) if (n > 1 && khop(d.v * n, d.sai * n + n)) { ok = true; break; }
    if (!ok) sai.push(d.goc);
    if (sai.length >= 6) break;
  }
  return [...new Set(sai)];
}

// tự tóm tắt kết quả màn hình (không cần lượt AI thứ 2) — số lấy nguyên từ engine của app
const fN = (n: unknown) => Number(n ?? 0).toLocaleString("vi-VN");
const fD = (v: unknown) => (v == null ? "—" : Number(v) > 365 ? "> 1 năm" : String(v).replace(".", ","));
function tomTatMan(goi: J[], kq: J): string | null {
  const dong: string[] = [];
  for (const g of goi) {
    const r = kq[g.id];
    if (!r || r.ok === false) return null;
    if (g.name === "mo_man") { dong.push(`- Đã mở màn ${r.ten || r.tab}.`); continue; }
    if (g.name !== "chia_doi" || g.input?.lam_tiep) return null;
    const c = r.chia || {};
    dong.push(`- **${r.ten_doi || r.doi}**: giao **${fN(c.tong)} cái** (sale ${fN(c.sale)} · phụ kiện ${fN(c.phu_kien)} · thùng ${fN(c.thung)}${r.thung?.length ? ` = ${r.thung.length} thùng` : ""}), ${fN(c.so_ma)} mã.`);
    dong.push(`- Tồn hàng sale ${fN(r.truoc?.ton)} → ${fN(r.sau?.ton)} · đủ bán ${fD(r.truoc?.du_ngay)} → ${fD(r.sau?.du_ngay)} ngày.`);
    if (r.tham_so_da_dung?.length) dong.push(`- Tham số: ${r.tham_so_da_dung.map((t: J) => `${t.ten} ${t.gt} (${t.ng})`).join(" · ")}.`);   // NEW - 285
    if (r.sua_theo_cau_noi?.length) dong.push(`- Em đã sửa theo đúng câu anh nói: ${r.sua_theo_cau_noi.join("; ")}.`);
    const k = r.kiem_tra || {};
    if (k.ma_ban != null) dong.push(`- Kiểm tra: ${k.thieu_sau ? `**${fN(k.thieu_sau)} mã đang bán vẫn thiếu** (${fN(k.cai_thieu)} cái${k.thieu_kho ? `, ${fN(k.thieu_kho)} mã do kho hết` : ""})` : `mọi mã đang bán đủ ${r.tham_so?.chia_du_ngay ?? "?"} ngày`} · ${k.vuot_kho ? `**${fN(k.vuot_kho)} mã vượt kho**` : "không vượt kho"}${c.thung ? ` · thùng ${fN(c.thung)} cái: ${fN(k.thung_dung)} đúng nhu cầu, ${fN(k.thung_du)} dư` : ""}.`);
    if (r.rang_buoc_da_ap?.length) dong.push(`- Đã áp: ${r.rang_buoc_da_ap.join(" · ")}.`);
    (r.ghi_chu_ap || []).forEach((x: string) => dong.push(`- ${x}.`));
    if (r.canh_bao?.length) dong.push(`- Lưu ý: ${r.canh_bao.join("; ")}.`);
    if (r.kiem_tra?.thu_hoi_rut?.length) dong.push(`- Thùng có mã thu hồi, rút ra khi cấp: ${r.kiem_tra.thu_hoi_rut.join("; ")}.`);
    dong.push(String(r.phieu_cho_duyet || "").startsWith("đã tạo") ? "- Phiếu đang chờ anh bấm **Duyệt & thực hiện**."
      : c.tong ? "- Chưa tạo phiếu duyệt vì còn mã vượt kho — anh xem các dòng hồng trên bàn chia." : "- Không có số nào để chia nên em không tạo phiếu.");
  }
  return dong.length ? dong.join("\n") : null;
}

// ---------------------------------------------------------------------------
// VÒNG LÀM VIỆC
// ---------------------------------------------------------------------------
type Ctx = { q: J; cfg: J; khoa: string; viec: string; tam: J; gui: (o: J) => void; ghi: (fn: string, b: J) => void; ghiXong: () => Promise<void>; token?: string };

async function chayVong(c: Ctx) {
  const { q, cfg, tam, gui, ghi } = c;
  const maxV = Math.max(2, Math.min(15, Number(cfg.max_vong) || 8));
  const tran = Number(cfg.tran_token_ngay) || 0;
  while (true) {
    if (tam.vong >= maxV) {
      const tl = "Em đã dùng hết số lượt xử lý cho yêu cầu này. Anh xem các bước đã làm ở mục Lịch sử, hoặc giao lại yêu cầu gọn hơn giúp em.";
      await ketThuc(c, tl);
      return;
    }
    if (tran > 0) {
      const da = Number(await rpc("fn_ai_bd_token", { p_nguoi: q.ma, p_mo_hinh: String(cfg.mo_hinh || ""), p_vao: 0, p_ra: 0 })) || 0;
      if (da >= tran) throw new LoiAI(`Đã chạm trần ${tran.toLocaleString("vi-VN")} token/ngày của tài khoản — Quản trị có thể nâng ở Cài đặt SIÊU TRÍ TUỆ`);
    }
    tam.vong = (tam.vong || 0) + 1;
    const dau = tam.vong === 1;
    const ptToi = dau ? 22 : Math.min(97, Math.round(tam.pt + (97 - tam.pt) * 0.6));
    const tenBuoc = dau ? "Phân tích yêu cầu & lập kế hoạch" : "Kiểm tra kết quả & tổng hợp";
    gui({ t: "tien_do", pt: tam.pt, pt_toi: ptToi, buoc: tenBuoc });
    ghi("fn_ai_bd_luu", { p_viec: c.viec, p: { phan_tram: tam.pt, buoc_hien: tenBuoc } });
    const t0 = Date.now();
    const boCC = CONG_CU.filter((t) => (tam.cc || []).length === 0 || tam.cc.includes(t.name));
    // câu hỏi số liệu: lượt đầu BẮT BUỘC gọi công cụ (không trả lời suông / không bịa); bị nhắc lại cũng ép
    const ep = (dau && !!tam.ep) || !!tam.nhac_ep;
    tam.nhac_ep = false;
    const kq = await goiAI(cfg, c.khoa, tam.sys, boCC, tam.msgs, dau ? 900 : 2400, ep);   // NEW - 3.160.1: đủ chỗ cho danh sách hình sản phẩm
    const ms = Date.now() - t0;
    tam.pt = ptToi;
    const text = kq.blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    const goi = kq.blocks.filter((b) => b.type === "tool_use");
    tam.stt = (tam.stt || 0) + 1;
    gui({ t: "buoc", stt: tam.stt, noi: "ai", nhan: tenBuoc, trang_thai: "xong", ms });
    ghi("fn_ai_bd_buoc", { p_viec: c.viec, p: { stt: tam.stt, noi: "ai", ten: kq.mo_hinh, nhan: tenBuoc + (text && goi.length ? " — " + text.slice(0, 200) : ""), trang_thai: "xong", ms, ket_qua: { vao: kq.vao, ra: kq.ra, cong_cu: goi.map((g) => g.name),
      u: kq.u ?? null, ky_tu: { loi_dan: tam.sys.length, cong_cu: JSON.stringify(boCC).length, tin: JSON.stringify(tam.msgs).length } } } });   // soi token: usage thô + số ký tự từng phần
    ghi("fn_ai_bd_luu", { p_viec: c.viec, p: { them_vao: kq.vao, them_ra: kq.ra, them_luot: 1, mo_hinh: kq.mo_hinh } });
    ghi("fn_ai_bd_token", { p_nguoi: q.ma, p_mo_hinh: kq.mo_hinh, p_vao: kq.vao, p_ra: kq.ra });
    tam.vao = (tam.vao || 0) + kq.vao; tam.ra = (tam.ra || 0) + kq.ra;
    tam.msgs.push({ role: "assistant", content: kq.blocks.length ? kq.blocks : [{ type: "text", text: "(trống)" }] });

    // trả lời suông kiểu "dạ em tra luôn" mà không gọi công cụ -> nhắc 1 lần, ép gọi công cụ
    if (!goi.length && !tam.da_nhac && text.length < 160 && /\b(em (se|xin|dang|tra|xem|kiem|doc|lay|tinh)|de em|ke hoach|tra giup|xem giup)\b/.test(boDauJs(text))) {
      tam.da_nhac = true; tam.nhac_ep = true;
      tam.msgs.push({ role: "user", content: "Làm luôn: gọi công cụ lấy số liệu thật ngay bây giờ." });
      continue;
    }
    // NEW - 3.134 hỏi lại suông kiểu "em chưa hiểu… ý anh là…?" -> nhắc 1 lần: tự chọn cách hiểu hợp lý, tra và trả lời luôn
    if (!goi.length && !tam.da_hoi_lai && text.includes("?") && /\b(chua (hieu|ro)|khong ro y|xin .{0,15}cho ro)\b/.test(boDauJs(text))) {
      tam.da_hoi_lai = true;
      tam.msgs.push({ role: "user", content: "Đừng chỉ hỏi lại. Chọn cách hiểu hợp lý nhất theo hội thoại, tra thêm số liệu nếu cần và trả lời luôn; nêu ngắn cách hiểu khác (nếu có) rồi hỏi xác nhận 1 câu ngắn ở cuối." });
      continue;
    }
    // NEW - 3.135 CHỐT CHỐNG BỊA: chưa có công cụ nào chạy thành công mà câu trả lời báo "đã tạo / chờ duyệt" hoặc có số liệu
    //   -> lần 1: bắt gọi công cụ thật; lần 2 vẫn vậy: KHÔNG đưa câu bịa cho người dùng
    if (!goi.length && !(tam.da_goi > 0)) {
      const kd = boDauJs(text);
      const baoDaLam = /\b(da (tao|chia|gui|len|lap|xac nhan|duyet|cap nhat|xuat|chon)|phuong an|cho (anh |chi |anh\/chi )?duyet|duyet (&|va) thuc hien)\b/.test(kd);
      const coSo = (text.match(/\d{2,}/g) || []).length >= 2 && !(tam.co_so_lieu && soChuaCo(tam, text).length === 0);   // 285: số khớp sổ số liệu thì không phải bịa
      if (baoDaLam || coSo) {
        if (!tam.da_chan) {
          tam.da_chan = true; tam.nhac_ep = true;
          tam.msgs.push({ role: "user", content: "Câu trả lời vừa rồi báo đã làm / có số liệu nhưng CHƯA gọi công cụ nào — không được bịa. Gọi công cụ thật ngay (tạo phương án chia phải gọi chia_doi; số liệu phải lấy từ công cụ tra cứu)." });
          continue;
        }
        const xh = String(q.cfg?.xung_ho?.[q.ma] || "anh/chị");
        await ketThuc(c, `Em chưa thực hiện được: em không gọi được công cụ nào nên không có kết quả thật để báo ${xh}. ${xh.charAt(0).toUpperCase() + xh.slice(1)} giao lại giúp em (ví dụ: "chia đội 25 tầm 3–5 thùng, đủ 15 ngày").`);
        return;
      }
    }
    // NEW - 285 SOÁT SỐ: số tiền / số lớn trong câu trả lời phải có trong kết quả công cụ hoặc sổ số liệu
    if (!goi.length && text) {
      const sai = soChuaCo(tam, text);
      if (sai.length && !tam.da_soat) {
        tam.da_soat = true;
        tam.msgs.push({ role: "user", content: `Các số sau KHÔNG có trong kết quả công cụ / TODAY FACTS: ${sai.join(", ")}. Chỉ dùng số lấy từ công cụ (được làm tròn); nếu là phép cộng / trừ thì ghi rõ các số hạng. Nếu cần số khác thì gọi công cụ. Viết lại câu trả lời.` });
        continue;
      }
      if (sai.length) { await ketThuc(c, text + `\n\n⚠ Em chưa đối chiếu được ${sai.length > 1 ? "các số" : "số"} ${sai.join(", ")} với dữ liệu — anh kiểm tra lại trên màn hình giúp em.`); return; }
    }
    if (!goi.length) { await ketThuc(c, text || "Em đã xong."); return; }
    if (text) { gui({ t: "ke_hoach", text }); tam.ke_hoach = text; }

    // công cụ máy chủ chạy ngay; công cụ màn hình gửi về app
    const kqMay: J = {}; const man: J[] = [];
    for (const g of goi) {
      if (CONG_CU_MAN.has(g.name)) { man.push(g); continue; }
      const nhan = nhanCongCu(g.name, g.input);
      tam.stt++;
      const stt = tam.stt;
      gui({ t: "buoc", stt, noi: "may_chu", nhan, trang_thai: "dang" });
      gui({ t: "tien_do", pt: tam.pt, pt_toi: Math.min(tam.pt + 6, 90), buoc: nhan });
      const t1 = Date.now();
      let r: J;
      try { r = g.name === "ghi_nho" ? await ghiNho(q, g.input) : CONG_CU_MAY[g.name] ? await CONG_CU_MAY[g.name](g.input, c) : { ok: false, loi: "Không có công cụ " + g.name }; } catch (e) { r = { ok: false, loi: String((e as Error)?.message || e).slice(0, 300) }; }
      if (r.ok !== false) ghiSo(tam, r);   // NEW - 285: số trong kết quả công cụ -> dùng để soát câu trả lời
      const ms1 = Date.now() - t1;
      kqMay[g.id] = r;
      if (r.ok !== false && g.name !== "ghi_nho" && g.name !== "danh_muc") tam.da_goi = (tam.da_goi || 0) + 1;   // NEW - 3.135 đếm công cụ lấy số / làm việc chạy thành công
      if (r.ok !== false && g.name !== "danh_muc" && g.name !== "ghi_nho") tam.nguon = [...new Set([...(tam.nguon || []), g.name])];   // NEW - 3.132 nguồn số liệu của câu trả lời
      themCach(tam, g.name, g.input, r);   // NEW - 3.133 cách tính
      if (g.name === "ghi_nho" && r.ok !== false) tam.nho = [...(tam.nho || []), { cum_tu: String(g.input?.cum_tu || "").slice(0, 120), noi_dung: String(g.input?.noi_dung || "").slice(0, 300), trang_thai: r.trang_thai }].slice(-5);
      tam.pt = Math.min(tam.pt + 6, 90);
      gui({ t: "buoc", stt, noi: "may_chu", nhan, trang_thai: r.ok === false ? "loi" : "xong", ms: ms1, loi: r.ok === false ? r.loi : undefined, so_dong: r.so_dong });
      ghi("fn_ai_bd_buoc", { p_viec: c.viec, p: { stt, noi: "may_chu", ten: g.name, nhan, tham_so: g.input, ket_qua: r.ok === false ? r : g.name === "hoi_so_lieu" ? { so_dong: r.so_dong, cat: r.cat } : { co: true }, trang_thai: r.ok === false ? "loi" : "xong", ms: ms1 } });
    }
    if (man.length) {
      const ptTu = tam.pt, ptDen = Math.round(ptTu + (90 - ptTu) * 0.85);
      tam.cho = { ids: goi.map((g) => g.id), may: kqMay, man: man.map((g) => g.id), goi: goi.map((g) => ({ id: g.id, name: g.name, input: g.input })) };
      tam.pt = ptDen;
      const ds = man.map((g) => ({ id: g.id, ten: g.name, tham_so: g.input, nhan: nhanCongCu(g.name, g.input) }));
      gui({ t: "client", goi: ds, pt_tu: ptTu, pt_den: ptDen });
      ghi("fn_ai_bd_luu", { p_viec: c.viec, p: { trang_thai: "cho_man", phan_tram: ptTu, buoc_hien: ds.map((d) => d.nhan).join(" · ").slice(0, 200), tam } });
      return;
    }
    tam.msgs.push({ role: "user", content: goi.map((g) => ({ type: "tool_result", tool_use_id: g.id, content: JSON.stringify(kqMay[g.id]), ...(kqMay[g.id]?.ok === false ? { is_error: true } : {}) })) });
  }
}

async function ketThuc(c: Ctx, traLoi: string) {
  const the = c.tam.the || null;
  const nguon: string[] = c.tam.nguon || [];
  const cach: J[] = c.tam.cach || [], nho: J[] = c.tam.nho || [], tri: J[] = c.tam.tri || [];   // NEW - 3.133
  c.gui({ t: "tien_do", pt: 100, buoc: "Hoàn tất" });
  c.ghi("fn_ai_bd_luu", { p_viec: c.viec, p: { trang_thai: "xong", phan_tram: 100, buoc_hien: "Hoàn tất", tra_loi: traLoi, ...(the ? { the } : {}), ke_hoach: { nguon, cach, nho, tri }, tam: null } });
  await c.ghiXong();
  c.gui({ t: "xong", viec_id: c.viec, tra_loi: traLoi, the, nguon, cach, nho, tri, token: { vao: c.tam.vao || 0, ra: c.tam.ra || 0 } });
}

// nối tin cũ trong phiên (chỉ chữ) — gộp tin liền nhau cùng vai, bắt đầu bằng người dùng
function lichSu(ls: J[], yeuCau: string): J[] {
  const out: J[] = [];
  for (const m of (ls || []).slice(-6)) {
    const role = m.vai === "ai" ? "assistant" : "user";
    let text = String(m.noi_dung || "").slice(0, 600);
    if (!text) continue;
    if (role === "assistant" && /dùng hết số lượt xử lý/.test(text)) text = "(Yêu cầu trước dừng giữa chừng, chưa có kết quả — câu này làm lại từ đầu.)";   // NEW - 3.160.1
    if (!out.length && role !== "user") continue;
    if (out.length && out[out.length - 1].role === role) out[out.length - 1].content += "\n" + text;
    else out.push({ role, content: text });
  }
  if (out.length && out[out.length - 1].role === "user") out[out.length - 1].content += "\n" + yeuCau;
  else out.push({ role: "user", content: yeuCau });
  return out;
}

function luong(fn: (gui: (o: J) => void) => Promise<void>) {
  const stream = new ReadableStream({
    async start(ctrl) {
      let dong = false;
      const gui = (o: J) => { if (!dong) try { ctrl.enqueue(enc.encode(JSON.stringify(o) + "\n")); } catch { dong = true; } };
      try { await fn(gui); } catch (e) { gui({ t: "loi", loi: String((e as Error)?.message || e).slice(0, 400) }); }
      dong = true;
      try { ctrl.close(); } catch { /* */ }
    },
  });
  return new Response(stream, { headers: { ...cors, "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" } });
}

// ---------------------------------------------------------------------------
// NEW - 289: TỰ HỌC — đọc lại các câu đã hỏi + sổ vấn đề → AI rút bài học → "Chờ duyệt" (có bằng chứng, không có bằng chứng thì bỏ)
// ---------------------------------------------------------------------------
const HOC_DAN = [
  "You are the self-review module of SIÊU TRÍ TUỆ, the AI assistant inside the Nón Sơn operations app. Below are the assistant's own system rules and tools, then the questions users asked recently (with the answer given, tools called, errors, the user's NEXT question in the same chat, and 'báo sai' reports), the knowledge it already has, and the current app issues.",
  "TASK: extract durable LESSONS that will make future answers right the first time. Kinds (field loai):",
  "- tu_ngu: what a word / nickname / abbreviation / voice-typo the users use means in this app (cum_tu = the words, comma separated).",
  "- quy_tac: a business rule or a how-to-answer rule the assistant must always follow (only if clearly shown by the evidence).",
  "- sua_sai: a mistake the assistant made (wrong tool, wrong number, misunderstood question, user corrected or asked again) and the right way next time. cau_mau = the question that went wrong.",
  "- cau_mau: a worked example of a COMMON question answered well: cau_mau = the question as users phrase it, noi_dung = which tool(s) with which parameters and what to say. Only from questions that clearly succeeded (no correction / no repeat).",
  "- kien_thuc: a stable fact about the business or the app that users rely on (screens, warehouses, channels, people's roles, how a number is defined). NOT today's numbers — numbers change daily and are re-computed.",
  "STRICT RULES:",
  "1. Every lesson must be supported by the evidence below: put the supporting question ids in bang_chung.viec (array of the 'viec' values) and a short reason in bang_chung.ly_do. No evidence → do not write the lesson. Never invent facts, names, numbers or rules.",
  "2. A sign of a wrong answer: cau_sau repeats / rephrases the same question, says sai / không phải / nhầm / ý anh là / chưa đúng, the answer has ⚠ or an error, or bao_sai is present.",
  "3. Skip anything already covered by EXISTING KNOWLEDGE (same meaning). Prefer fewer, sharper lessons (max 15).",
  "4. Write cum_tu / cau_mau / noi_dung in Vietnamese, short and directly usable. cong_cu = exact tool name when the lesson is about a tool.",
  "5. Do not copy personal data of customers. Do not include secrets.",
  "OUTPUT: call the tool ghi_bai_hoc exactly once (tom_tat = 2-4 câu tiếng Việt: người dùng hỏi gì, AI làm tốt / sai chỗ nào; bai = the lessons, may be empty).",
].join("\n");
// NEW - 3.159.6: trả bài học qua công cụ bắt buộc → luôn đúng khuôn (không còn lỗi "AI không trả JSON")
const CC_HOC: J = {
  name: "ghi_bai_hoc", description: "Ghi kết quả tự học.",
  input_schema: { type: "object", required: ["tom_tat", "bai"], properties: {
    tom_tat: { type: "string" },
    bai: { type: "array", items: { type: "object", required: ["loai", "noi_dung", "bang_chung"], properties: {
      loai: { type: "string", enum: ["tu_ngu", "quy_tac", "sua_sai", "cau_mau", "kien_thuc"] },
      cum_tu: { type: "string" }, cau_mau: { type: "string" }, noi_dung: { type: "string" }, cong_cu: { type: "string" },
      bang_chung: { type: "object", required: ["viec"], properties: { viec: { type: "array", items: { type: "string" } }, ly_do: { type: "string" } } } } } } } },
};
function layJson(t: string): J | null {
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
}
async function hocNen(cfg: J, bd: J) {
  const lan = bd.lan;
  let vao = 0, ra = 0, mo_hinh = String(cfg.mo_hinh_hoc || cfg.mo_hinh || "claude-opus-5-5");
  try {
    const khoa = await layKhoa();
    if (!khoa) throw new Error("Chưa có khoá FableAI");
    const tl: J = await rpc("fn_ai_hoc_tu_lieu", { p_lan: lan });
    let cau: J[] = Array.isArray(tl?.cau_hoi) ? tl.cau_hoi : [];
    const coNoi = (x: J[]) => JSON.stringify(x).length;
    // NEW - 3.159.6 GỌN: không gửi lại cả lời dặn, công cụ chỉ tên + 1 câu, tri thức đang có rút gọn (máy chủ tự lọc trùng)
    const congCu = CONG_CU.map((t) => `- ${t.name}: ${String(t.description || "").split(/(?<=[.!?])\s/)[0].slice(0, 140)}`).join("\n");
    const coDinh = (HOC_DAN.length + congCu.length + JSON.stringify(tl?.tri_thuc_dang_co || []).length + JSON.stringify(tl?.van_de_app || []).length) / 3;
    const conLai = Math.max(0, Number(bd.con_token || 0) - 8000);
    while (cau.length > 3 && coDinh + coNoi(cau) / 3 > conLai) cau = cau.slice(Math.ceil(cau.length / 5));
    if (coDinh + coNoi(cau) / 3 > conLai) throw new Error("Không đủ trần token còn lại hôm nay");
    const ids = new Set(cau.map((x) => String(x.viec)));
    const nd = [
      "=== ASSISTANT TOOLS ===\n" + congCu,
      "=== EXISTING KNOWLEDGE (do not duplicate) ===\n" + JSON.stringify(tl?.tri_thuc_dang_co || []),
      "=== APP ISSUES NOW (context only) ===\n" + JSON.stringify(tl?.van_de_app || []),
      `=== QUESTIONS ${tl?.tu || ""} → ${tl?.den || ""} (${cau.length}) ===\n` + cau.map((x) => JSON.stringify(x)).join("\n"),
    ].join("\n\n");
    const kq = await goiAI({ ...cfg, khong_nho_dem: true }, khoa, HOC_DAN, [CC_HOC], [{ role: "user", content: nd }], 6000, true);
    vao = kq.vao; ra = kq.ra; mo_hinh = kq.mo_hinh;
    await rpc("fn_ai_bd_token", { p_nguoi: "AI_TU_HOC", p_mo_hinh: mo_hinh, p_vao: vao, p_ra: ra }).catch(() => {});
    const tu = kq.blocks.find((b) => b.type === "tool_use" && b.name === "ghi_bai_hoc");
    const text = kq.blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n");
    const j = tu?.input && typeof tu.input === "object" ? tu.input : layJson(text);
    if (!j) throw new Error("AI không trả kết quả đúng khuôn: " + text.slice(0, 160));
    // chỉ giữ bài học có bằng chứng là câu hỏi THẬT trong tư liệu
    const bai = (Array.isArray(j.bai) ? j.bai : []).filter((b: J) => {
      const v = Array.isArray(b?.bang_chung?.viec) ? b.bang_chung.viec.map(String).filter((x: string) => ids.has(x)) : [];
      if (!v.length) return false;
      b.bang_chung = { viec: v.slice(0, 8), ly_do: String(b.bang_chung?.ly_do || "").slice(0, 300) };
      return true;
    }).slice(0, 20);
    await rpc("fn_ai_hoc_ket_thuc", { p_lan: lan, p: { bai, tom_tat: String(j.tom_tat || "").slice(0, 1500), vao, ra, mo_hinh } });
  } catch (e) {
    await rpc("fn_ai_hoc_ket_thuc", { p_lan: lan, p: { loi: String((e as Error)?.message || e).slice(0, 400), vao, ra, mo_hinh } }).catch(() => {});
  }
}

// hàng đợi ghi nhật ký: không chặn luồng, giữ đúng thứ tự
function taoGhi() {
  let hang: Promise<unknown> = Promise.resolve();
  const ghi = (fn: string, b: J) => { const sao = JSON.parse(JSON.stringify(b)); hang = hang.then(() => rpc(fn, sao)).catch((e) => console.error("ghi", fn, String(e?.message || e).slice(0, 200))); };
  return { ghi, ghiXong: () => hang.then(() => {}) };
}

// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return tra({ ok: false, loi: "Chỉ nhận POST" }, 405);
  if (!SB_URL || !SB_KEY) return tra({ ok: false, loi: "Thiếu SUPABASE_URL / SERVICE_ROLE_KEY" }, 500);
  let body: J = {};
  try { body = await req.json(); } catch { return tra({ ok: false, loi: "Body không phải JSON" }, 400); }

  let q: J;
  try { q = await rpc("fn_ai_quyen", { p_token: body.token }); } catch (e) { return tra({ ok: false, loi: "Phiên đăng nhập không hợp lệ: " + String((e as Error)?.message || e).slice(0, 120) }, 401); }
  const hd = String(body.hanh_dong || "chay");

  // ---- Quản trị: thử kết nối 2 kiểu API
  if (hd === "thu") {
    if (!q.admin) return tra({ ok: false, loi: "Chỉ Quản trị thử kết nối" }, 403);
    const khoa = await layKhoa();
    if (!khoa) return tra({ ok: false, loi: "Chưa có khoá FableAI — dán khoá ở Cài đặt rồi thử lại" });
    const cfg = q.cfg || {};
    const url = String(cfg.url || "https://api.fableaiapi.com").replace(/\/+$/, "");
    const out: J = { ok: true, url, mo_hinh: cfg.mo_hinh };
    try {
      const r = await fetch(url + "/v1/models", { headers: { "x-api-key": khoa, Authorization: "Bearer " + khoa }, signal: AbortSignal.timeout(20000) });
      const t = await r.text(); let j: J = {}; try { j = JSON.parse(t); } catch { /* */ }
      out.models = r.ok ? (j.data || j.models || []).map((m: J) => m.id || m.name).filter(Boolean).slice(0, 60) : { loi: "HTTP " + r.status + ": " + t.slice(0, 160) };
    } catch (e) { out.models = { loi: String((e as Error)?.message || e).slice(0, 160) }; }
    const cong = [{ name: "cong", description: "Cộng hai số", input_schema: { type: "object", properties: { a: { type: "number" }, b: { type: "number" } }, required: ["a", "b"] } }];
    const mo_hinh = String(body.mo_hinh || cfg.mo_hinh || "claude-sonnet-5-5");
    for (const kieu of ["anthropic", "openai"]) {
      const t0 = Date.now();
      try {
        const k = await goiMot({ ...cfg, kieu }, khoa, mo_hinh, "Trả lời ngắn.", cong, [{ role: "user", content: "Dùng công cụ cong để tính 2 + 3." }], 120);
        const tu = k.blocks.find((b) => b.type === "tool_use");
        out[kieu] = { ok: !!tu && tu.name === "cong", ms: Date.now() - t0, goi_cong_cu: tu ? { ten: tu.name, tham_so: tu.input } : null, vao: k.vao, ra: k.ra };
        await rpc("fn_ai_bd_token", { p_nguoi: q.ma, p_mo_hinh: mo_hinh, p_vao: k.vao, p_ra: k.ra }).catch(() => {});
      } catch (e) { out[kieu] = { ok: false, ms: Date.now() - t0, loi: String((e as Error)?.message || e).slice(0, 200) }; }
    }
    return tra(out);
  }

  if (!q.ok) return tra({ ok: false, loi: q.loi || "Không có quyền dùng SIÊU TRÍ TUỆ" }, 403);

  // ---- NEW - 289: TỰ HỌC — app gọi khi có người mở (máy chủ tự giới hạn: cách N giờ, trần token/ngày, 1 lượt 1 lúc); Quản trị bấm "Học ngay"
  if (hd === "hoc") {
    const tay = !!body.tay;
    if (tay && !q.admin) return tra({ ok: false, loi: "Chỉ Quản trị bấm Học ngay" }, 403);
    let bd: J;
    try { bd = await rpc("fn_ai_hoc_bat_dau", { p_kich_hoat: tay ? "tay" : "mo_app", p_nguoi: q.ma }); } catch (e) { return tra({ ok: false, loi: String((e as Error)?.message || e).slice(0, 200) }); }
    if (!bd?.chay) return tra({ ok: true, chay: false, ly_do: bd?.ly_do || "" });
    const viecHoc = hocNen(q.cfg || {}, bd).catch((e) => console.error("hoc", String((e as Error)?.message || e).slice(0, 300)));
    const er = (globalThis as J).EdgeRuntime;
    if (er?.waitUntil) er.waitUntil(viecHoc); else await viecHoc;
    return tra({ ok: true, chay: true, lan: bd.lan, so_cau: bd.so_cau });
  }

  // ---- dừng việc đang chạy
  if (hd === "dung") {
    const v = await rpc("fn_ai_bd_doc", { p_viec: body.viec_id }).catch(() => null);
    if (!v || v.nguoi !== q.ma) return tra({ ok: false, loi: "Không có việc này" }, 404);
    if (["xong", "loi", "dung"].includes(v.trang_thai)) return tra({ ok: true, trang_thai: v.trang_thai });
    await rpc("fn_ai_bd_luu", { p_viec: body.viec_id, p: { trang_thai: "dung", buoc_hien: "Người dùng dừng", tam: null } });
    return tra({ ok: true, trang_thai: "dung" });
  }

  if (hd !== "chay" && hd !== "tiep") return tra({ ok: false, loi: "Hành động không hợp lệ" }, 400);
  const cfg = q.cfg || {};

  return luong(async (gui) => {
    const { ghi, ghiXong } = taoGhi();
    let viec = "", tam: J;
    const khoaP = layKhoa();
    let triP: Promise<J[]> = Promise.resolve([]);
    if (hd === "chay") {
      const yeuCau = String(body.yeu_cau || "").trim().slice(0, 2000);
      if (!yeuCau) throw new Error("Chưa có yêu cầu");
      triP = napTriThuc(yeuCau);
      // NEW - 285: sổ số liệu (≤ 10 giây, quá thì bỏ qua — AI vẫn gọi công cụ) + từ điển thực thể trong câu hỏi
      const soLieuP = cho(rpc("fn_ai_so_lieu", { p_token: body.token, p_ep: false }), 10000);
      const tuDienP = cho(rpc("fn_ai_tu_dien", { p_nguoi: q.ma, p_yeu_cau: yeuCau }), 4000);
      const bd = await rpc("fn_ai_bd_bat_dau", { p_nguoi: q.ma, p_phien: body.phien_id || null, p_yeu_cau: yeuCau, p_man: String(body.man || "").slice(0, 60) });
      viec = bd.viec_id;
      gui({ t: "viec", viec_id: viec, phien_id: bd.phien_id });
      gui({ t: "tien_do", pt: 3, pt_toi: 5, buoc: "Tiếp nhận yêu cầu" });
      const cc = chonCongCu(yeuCau, body.ngu_canh || null).map((t) => t.name);
      // câu hỏi số liệu (không có công cụ chia): bỏ ngữ cảnh bàn chia khỏi lời dặn cho đỡ tốn lượt AI
      let nc: J = body.ngu_canh && typeof body.ngu_canh === "object" ? { ...body.ngu_canh } : {};
      if (!cc.includes("chia_doi")) { delete nc.chia_tung_doi; delete nc.phuong_an_gan_nhat; }
      const tri = await triP;
      const [soLieu, tuDien] = await Promise.all([soLieuP, tuDienP]);
      const themSo: number[] = [];
      const ksl = khoiSoLieu(soLieu as J, themSo), ktd = khoiTuDien(tuDien as J[]);
      tam = { sys: loiDan(q, String(body.man || ""), nc) + khoiTriThuc(tri) + ktd + ksl, msgs: lichSu(bd.lich_su, yeuCau), vong: 0, stt: 0, pt: 5, cc, ep: laHoiSoLieu(yeuCau) || laViecChia(yeuCau, body.ngu_canh || null), da_goi: 0,
        tri: tri.map((t) => ({ id: t.id, loai: t.loai, cum: String(t.cum_tu || "").split(",")[0].trim() || "bài học sửa sai" })) };
      ghiSo(tam, soLieu); ghiSo(tam, themSo);   // NEW - 285
      tam.so_ngay_thang = Number((soLieu as J)?.doanh_thu?.thang_nay?.so_ngay) || null;
      tam.co_so_lieu = !!ksl;
      if (ksl || ktd) {
        tam.stt = (tam.stt || 0) + 1;
        const nhan = [ksl ? `Đọc sổ số liệu (${(soLieu as J)?.tuoi_phut ?? 0} phút trước)` : "", ktd ? `nhận ra ${(tuDien as J[]).length} tên trong câu hỏi` : ""].filter(Boolean).join(" · ");
        gui({ t: "buoc", stt: tam.stt, noi: "may_chu", nhan, trang_thai: "xong", ms: 0 });
        ghi("fn_ai_bd_buoc", { p_viec: viec, p: { stt: tam.stt, noi: "may_chu", ten: "so_lieu", nhan, ket_qua: { tu_dien: tuDien, tuoi_phut: (soLieu as J)?.tuoi_phut ?? null }, trang_thai: "xong", ms: 0 } });
      }
      if (tri.length) {   // NEW - 3.133 hiện bước "Nạp tri thức" để thấy AI đang dùng bộ não
        tam.stt = (tam.stt || 0) + 1;
        const nhan = `Nạp tri thức: ${tri.length} mục (${tam.tri.map((t: J) => t.cum).slice(0, 4).join(", ")})`;
        gui({ t: "buoc", stt: tam.stt, noi: "may_chu", nhan, trang_thai: "xong", ms: 0 });
        ghi("fn_ai_bd_buoc", { p_viec: viec, p: { stt: tam.stt, noi: "may_chu", ten: "tri_thuc", nhan, ket_qua: { ids: tri.map((t) => t.id) }, trang_thai: "xong", ms: 0 } });
      }
    } else {
      viec = String(body.viec_id || "");
      const v = await rpc("fn_ai_bd_doc", { p_viec: viec });
      if (!v || v.nguoi !== q.ma) throw new Error("Không có việc này");
      if (v.trang_thai !== "cho_man" || !v.tam?.cho) throw new Error(v.trang_thai === "dung" ? "Việc đã dừng" : "Việc không còn chờ màn hình");
      tam = v.tam;
      gui({ t: "viec", viec_id: viec, phien_id: v.phien_id, tiep: true });
      const kqMan: J = {};
      for (const k of (Array.isArray(body.ket_qua) ? body.ket_qua : [])) {
        if (!tam.cho.man.includes(k.id)) continue;
        // từng bước nhỏ màn hình đã làm -> nhật ký
        for (const b of (Array.isArray(k.buoc) ? k.buoc : []).slice(0, 30)) {
          tam.stt = (tam.stt || 0) + 1;
          ghi("fn_ai_bd_buoc", { p_viec: viec, p: { stt: tam.stt, noi: "man_hinh", ten: String(k.ten || ""), nhan: String(b.nhan || "").slice(0, 300), trang_thai: b.ok === false ? "loi" : "xong", ms: Math.round(Number(b.ms) || 0), ket_qua: b.ct ?? null } });
        }
        if (k.the) tam.the = k.the;
        kqMan[k.id] = k.loi ? { ok: false, loi: String(k.loi).slice(0, 500) } : (k.ket_qua ?? { ok: true });
        if (!k.loi) ghiSo(tam, kqMan[k.id]);   // NEW - 285
        if (!k.loi && kqMan[k.id]?.ok !== false && k.ten !== "mo_man") tam.da_goi = (tam.da_goi || 0) + 1;   // NEW - 3.135
        if (!k.loi && k.ten === "chia_doi") { tam.nguon = [...new Set([...(tam.nguon || []), "chia_doi"])]; themCach(tam, "chia_doi", {}, { ok: true }); }
      }
      tam.msgs.push({ role: "user", content: tam.cho.ids.map((id: string) => {
        const r = tam.cho.may[id] ?? kqMan[id] ?? { ok: false, loi: "Màn hình không trả kết quả (người dùng đóng hoặc đổi màn)" };
        return { type: "tool_result", tool_use_id: id, content: JSON.stringify(r).slice(0, 12000), ...(r?.ok === false ? { is_error: true } : {}) };
      }) });
      const tuTom = tam.cho.goi && Object.keys(tam.cho.may || {}).length === 0 ? tomTatMan(tam.cho.goi, kqMan) : null;
      tam.cho = null;
      if (tuTom) {
        tam.stt = (tam.stt || 0) + 1;
        ghi("fn_ai_bd_buoc", { p_viec: viec, p: { stt: tam.stt, noi: "may_chu", ten: "tu_tom_tat", nhan: "Tự tổng hợp từ kết quả màn hình (không tốn lượt AI)", trang_thai: "xong", ms: 0 } });
        gui({ t: "buoc", stt: tam.stt, noi: "may_chu", nhan: "Tự tổng hợp từ kết quả màn hình", trang_thai: "xong", ms: 0 });
        tam.msgs.push({ role: "assistant", content: tuTom });
        await ketThuc({ q, cfg, khoa: "", viec, tam, gui, ghi, ghiXong }, tuTom);
        return;
      }
      gui({ t: "tien_do", pt: tam.pt, pt_toi: tam.pt + 1, buoc: "Nhận kết quả từ màn hình" });
      ghi("fn_ai_bd_luu", { p_viec: viec, p: { trang_thai: "dang_chay", phan_tram: tam.pt } });
    }
    const khoa = await khoaP;
    const ctx: Ctx = { q, cfg, khoa, viec, tam, gui, ghi, ghiXong, token: String(body.token || "") };
    try {
      if (!khoa) throw new LoiAI("Chưa có khoá FableAI — Quản trị dán khoá ở Cài đặt SIÊU TRÍ TUỆ");
      await chayVong(ctx);
      await ghiXong();
    } catch (e) {
      const loi = String((e as Error)?.message || e).slice(0, 400);
      ghi("fn_ai_bd_luu", { p_viec: viec, p: { trang_thai: "loi", loi, buoc_hien: "Lỗi", tam: null } });
      await ghiXong();
      gui({ t: "loi", viec_id: viec, loi });
    }
  });
});

