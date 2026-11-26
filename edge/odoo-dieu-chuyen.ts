// NS FLOW — Edge Function: odoo-dieu-chuyen
// Tạo đơn điều chuyển trên Odoo qua API của IT (POST https://open.nonson.vn/api/webhook/transfer).
//
// Bảo mật: X-API-Key nằm trong Supabase Vault ('odoo_api_key', đọc qua fn_odoo_khoa — chỉ service_role)
//          hoặc secret ODOO_API_KEY (Edge Functions > Secrets, ưu tiên nếu có) — KHÔNG nằm trong app / repo.
// Quyền: kiểm token đăng nhập app + danh sách tài khoản được mở (tham_so 'odoo_api') trong fn_odoo_chuan_bi.
//
// Gọi: POST { token, man, requests: [{name?, prefix?, tai_lieu_nguon, kho_cung_ung, kho_yeu_cau, ly_do, ghi_chu?, nguoi_tao?,
//                                      chi_tiet:[{sku?, barcode?, nhu_cau}]}], xem_truoc?: true }
//   xem_truoc = true: chỉ trả payload sẽ gửi (không gửi Odoo, không ghi nhật ký)
//   Huỷ / xoá: { token, hanh_dong: 'huy'|'xoa', id, ly_do, xem_truoc? } — gửi lại nội dung đơn gốc + "action": cancel|delete
//   Sửa (v4, SQL 209): { token, hanh_dong: 'sua', id, chi_tiet, ly_do, cho_vuot?, xem_truoc? } — huỷ đơn cũ + tạo đơn mới đã sửa
//   Nhận hàng (v5, SQL 303): { token, hanh_dong: 'nhan', name, dong:[{barcode, so_luong}], ghi_chu?, xem_truoc? } — …/transfer/complete-incoming
// Trả:  { ok, http, ket_qua:[{name, trang_thai: thanh_cong|can_xem|loi, loi}], phan_hoi, canh }

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const tra = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: cors });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return tra({ ok: false, loi: "Chỉ nhận POST" }, 405);

  const sbUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("SB_URL");
  const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SB_SERVICE_KEY");
  let apiKey = Deno.env.get("ODOO_API_KEY") || "";
  if (!sbUrl || !sbKey) return tra({ ok: false, loi: "Thiếu SUPABASE_URL / SERVICE_ROLE_KEY" }, 500);

  const H = {
    apikey: sbKey, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json",
    "Content-Profile": "chiahang", "Accept-Profile": "chiahang",
  };
  const rpc = async (fn: string, body: unknown) => {
    const r = await fetch(`${sbUrl}/rest/v1/rpc/${fn}`, { method: "POST", headers: H, body: JSON.stringify(body) });
    const t = await r.text();
    let j: unknown = null; try { j = JSON.parse(t); } catch { /* */ }
    if (r.status >= 300) throw new Error(`${fn}: ` + ((j as { message?: string })?.message || t.slice(0, 300)));
    return j as Record<string, unknown>;
  };

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return tra({ ok: false, loi: "Body không phải JSON" }, 400); }

  const layKhoa = async () => {
    if (!apiKey) {
      try { const k = await rpc("fn_odoo_khoa", {}); apiKey = typeof k === "string" ? k : ""; } catch { apiKey = ""; }
    }
    return apiKey;
  };
  const guiOdoo = async (url: string, requests: unknown) => {
    let http = 0, phanHoi: unknown = null, loiMang: string | null = null;
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
        body: JSON.stringify({ requests }),
        signal: AbortSignal.timeout(55000),
      });
      http = r.status;
      const t = await r.text();
      try { phanHoi = JSON.parse(t); } catch { phanHoi = { raw: t.slice(0, 20000) }; }
    } catch (e) {
      loiMang = "Không gọi được Odoo: " + String((e as Error).message || e);
    }
    return { http, phanHoi, loiMang };
  };

  // NEW - 303: NHẬN HÀNG TỪ APP — POST …/api/webhook/transfer/complete-incoming {ma_phieu, chi_tiet:[{barcode|sku, so_luong}]}
  //   Gọi: { token, hanh_dong: 'nhan', name, dong: [{barcode, so_luong}], ghi_chu?, xem_truoc? }
  //   fn_odoo_nhan_chuan_bi kiểm quyền (kho nhận / ADMIN) + số (0 ≤ nhận ≤ đã xuất − đã nhận) rồi ghi nhật ký; gửi Odoo; ghi kết quả.
  if (body.hanh_dong === "nhan") {
    let pre: Record<string, unknown>;
    try {
      pre = await rpc("fn_odoo_nhan_chuan_bi", {
        p_token: body.token, p_name: body.name ?? "", p_dong: body.dong ?? [], p_ghi_chu: body.ghi_chu ?? "", p_thu: !!body.xem_truoc,
      });
    } catch (e) { return tra({ ok: false, loi: String((e as Error).message || e) }, 400); }
    if (!pre?.ok) return tra(pre, 400);
    if (body.xem_truoc) return tra(pre);
    if (!(await layKhoa())) {
      await rpc("fn_odoo_nhan_ket_qua", { p_id: pre.id, p_http: 0, p_phan_hoi: null, p_loi: "Chưa có khoá API Odoo" }).catch(() => {});
      return tra({ ok: false, loi: "Chưa có khoá API Odoo" }, 500);
    }
    let http = 0, phanHoi: unknown = null, loiMang: string | null = null;
    try {
      const r = await fetch(String(pre.url), {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
        body: JSON.stringify(pre.payload),
        signal: AbortSignal.timeout(55000),
      });
      http = r.status;
      const t = await r.text();
      try { phanHoi = JSON.parse(t); } catch { phanHoi = { raw: t.slice(0, 20000) }; }
    } catch (e) {
      loiMang = "Không gọi được Odoo: " + String((e as Error).message || e);
    }
    try {
      const kq = await rpc("fn_odoo_nhan_ket_qua", { p_id: pre.id, p_http: http, p_phan_hoi: phanHoi, p_loi: loiMang });
      return tra({ ...(kq || {}), http, phan_hoi: phanHoi });
    } catch (e) {
      return tra({ ok: false, http, phan_hoi: phanHoi, loi: "Đã gửi Odoo nhưng chưa ghi được kết quả: " + String((e as Error).message || e) }, 500);
    }
  }

  // HUỶ / XOÁ đơn trên Odoo (cùng địa chỉ, thêm "action": cancel | delete). Mặc định TẮT (tham số odoo_api.huy_bat / xoa_bat).
  //   Gọi: { token, hanh_dong: 'huy' | 'xoa', id, ly_do, xem_truoc? }
  if (body.hanh_dong === "huy" || body.hanh_dong === "xoa") {
    let pre: Record<string, unknown>;
    try {
      pre = await rpc("fn_odoo_huy_chuan_bi", {
        p_token: body.token, p_id: body.id, p_hanh_dong: body.hanh_dong, p_ly_do: body.ly_do ?? "", p_thu: !!body.xem_truoc,
      });
    } catch (e) { return tra({ ok: false, loi: String((e as Error).message || e) }, 400); }
    if (!pre?.ok) return tra(pre, 400);
    if (body.xem_truoc) return tra({ ok: true, xem_truoc: true, requests: pre.requests });
    if (!(await layKhoa())) {
      await rpc("fn_odoo_huy_ket_qua", { p_id: pre.id, p_http: 0, p_phan_hoi: null, p_loi: "Chưa có khoá API Odoo" }).catch(() => {});
      return tra({ ok: false, loi: "Chưa có khoá API Odoo" }, 500);
    }
    const g = await guiOdoo(String(pre.url), pre.requests);
    try {
      const kq = await rpc("fn_odoo_huy_ket_qua", { p_id: pre.id, p_http: g.http, p_phan_hoi: g.phanHoi, p_loi: g.loiMang });
      return tra({ ...(kq || {}), http: g.http, phan_hoi: g.phanHoi, requests: pre.requests });
    } catch (e) {
      return tra({ ok: false, http: g.http, phan_hoi: g.phanHoi, loi: "Đã gửi Odoo nhưng chưa ghi được kết quả: " + String((e as Error).message || e) }, 500);
    }
  }

  // SỬA ĐƠN (SQL 209) — Odoo chưa có API sửa: huỷ đơn cũ (API cancel) rồi tạo đơn mới đã sửa, ghi liên kết 2 đơn.
  //   Gọi: { token, hanh_dong: 'sua', id, chi_tiet: [{barcode, sku?, nhu_cau}], ly_do, cho_vuot?, xem_truoc? }
  //   Kiểm hết (quyền, trạng thái, vượt tồn) TRƯỚC khi huỷ -> đơn cũ chỉ bị huỷ khi đơn mới chắc chắn tạo được (trừ lỗi mạng Odoo).
  if (body.hanh_dong === "sua") {
    let s: Record<string, unknown>;
    try {
      s = await rpc("fn_odoo_sua_chuan_bi", {
        p_token: body.token, p_id: body.id, p_chi_tiet: body.chi_tiet ?? [], p_ly_do: body.ly_do ?? "",
        p_cho_vuot: !!body.cho_vuot, p_thu: !!body.xem_truoc,
      });
    } catch (e) { return tra({ ok: false, loi: String((e as Error).message || e) }, 400); }
    if (!s?.ok) return tra(s, 400);
    if (body.xem_truoc) return tra({ ...s, xem_truoc: true });
    if (!(await layKhoa())) return tra({ ok: false, loi: "Chưa có khoá API Odoo" }, 500);

    // a) huỷ đơn cũ
    let h: Record<string, unknown>;
    try {
      h = await rpc("fn_odoo_huy_chuan_bi", {
        p_token: body.token, p_id: body.id, p_hanh_dong: "huy", p_ly_do: "Sửa đơn: " + String(s.ly_do || ""), p_thu: false,
      });
    } catch (e) { return tra({ ok: false, buoc: "huy", loi: String((e as Error).message || e) }, 400); }
    if (!h?.ok) return tra({ ...h, buoc: "huy" }, 400);
    const g1 = await guiOdoo(String(h.url), h.requests);
    let k1: Record<string, unknown> = {};
    try {
      k1 = await rpc("fn_odoo_huy_ket_qua", { p_id: body.id, p_http: g1.http, p_phan_hoi: g1.phanHoi, p_loi: g1.loiMang });
    } catch (e) {
      return tra({ ok: false, buoc: "huy", http: g1.http, loi: "Đã gửi lệnh huỷ nhưng chưa ghi được kết quả: " + String((e as Error).message || e) }, 500);
    }
    if (!k1?.ok) {
      return tra({ ok: false, buoc: "huy", loi: "Odoo không huỷ được đơn cũ — CHƯA sửa gì. " + String(k1?.loi || ""), http: g1.http, phan_hoi: g1.phanHoi }, 200);
    }

    // b) tạo đơn mới đã sửa
    const req2 = s.request as Record<string, unknown>;
    let c: Record<string, unknown>;
    try {
      c = await rpc("fn_odoo_chuan_bi", { p_token: body.token, p_requests: [req2], p_man: s.man ?? null, p_thu: false });
    } catch (e) { c = { ok: false, loi: String((e as Error).message || e) }; }
    if (!c?.ok) {
      const loi = String(c?.loi || "không tạo được đơn mới");
      await rpc("fn_odoo_sua_lien_ket", { p_cu: body.id, p_moi: null, p_ly_do: s.ly_do, p_thay_doi: s.thay_doi, p_nguoi: h.nguoi, p_loi: loi }).catch(() => {});
      return tra({ ok: false, buoc: "tao", huy_cu: true, name_cu: s.name_cu, loi: "Đã huỷ đơn cũ nhưng CHƯA tạo được đơn mới: " + loi + " — tạo lại từ Đề nghị hàng", vuot: c?.vuot }, 200);
    }
    const ids = (c.ids as number[]) || [];
    const g2 = await guiOdoo(String(c.url), c.requests);
    let kq: { trang_thai: string; loi?: string; odoo_id?: number; name?: string; id?: number }[] = [];
    try {
      kq = (await rpc("fn_odoo_ket_qua", { p_ids: ids, p_http: g2.http, p_phan_hoi: g2.phanHoi, p_loi: g2.loiMang })) as unknown as typeof kq;
    } catch (e) {
      await rpc("fn_odoo_sua_lien_ket", { p_cu: body.id, p_moi: ids[0] ?? null, p_ly_do: s.ly_do, p_thay_doi: s.thay_doi, p_nguoi: h.nguoi }).catch(() => {});
      return tra({ ok: false, buoc: "tao", huy_cu: true, id_moi: ids[0], loi: "Đã gửi đơn mới nhưng chưa ghi được kết quả: " + String((e as Error).message || e) }, 500);
    }
    await rpc("fn_odoo_sua_lien_ket", { p_cu: body.id, p_moi: ids[0] ?? null, p_ly_do: s.ly_do, p_thay_doi: s.thay_doi, p_nguoi: h.nguoi }).catch(() => {});
    const k2 = (kq || [])[0] || { trang_thai: "loi" };
    const okMoi = k2.trang_thai === "thanh_cong";
    return tra({
      ok: okMoi, buoc: "tao", huy_cu: true, name_cu: s.name_cu, name_moi: k2.name || (c.requests as { name?: string }[])?.[0]?.name,
      id_moi: ids[0], odoo_id: k2.odoo_id ?? null, ket_qua: kq, http: g2.http,
      loi: okMoi ? null : "Đã huỷ đơn cũ; đơn mới gửi Odoo chưa thành công: " + (k2.loi || g2.loiMang || "lỗi") + " — mở đơn mới để Gửi lại",
    });
  }

  // 1) Kiểm quyền + kiểm dữ liệu + cấp tên + ghi nhật ký 'dang_gui'
  let pre: Record<string, unknown>;
  try {
    pre = await rpc("fn_odoo_chuan_bi", {
      p_token: body.token, p_requests: body.requests ?? [], p_man: body.man ?? null, p_thu: !!body.xem_truoc,
    });
  } catch (e) { return tra({ ok: false, loi: String((e as Error).message || e) }, 400); }
  if (!pre?.ok) return tra(pre, 400);
  if (body.xem_truoc) return tra({ ok: true, xem_truoc: true, requests: pre.requests, canh: pre.canh });
  // Khoá: ưu tiên secret ODOO_API_KEY, không có thì lấy trong Supabase Vault (fn_odoo_khoa — chỉ service_role gọi được)
  if (!(await layKhoa())) {
    await rpc("fn_odoo_ket_qua", { p_ids: pre.ids, p_http: 0, p_phan_hoi: null, p_loi: "Chưa có khoá API Odoo" }).catch(() => {});
    return tra({ ok: false, loi: "Chưa có khoá API Odoo (Vault 'odoo_api_key' hoặc secret ODOO_API_KEY)" }, 500);
  }

  // 2) Gửi Odoo
  const { http, phanHoi, loiMang } = await guiOdoo(String(pre.url), pre.requests);

  // 3) Ghi kết quả từng đơn
  let ketQua: unknown = null;
  try {
    ketQua = await rpc("fn_odoo_ket_qua", { p_ids: pre.ids, p_http: http, p_phan_hoi: phanHoi, p_loi: loiMang });
  } catch (e) {
    return tra({ ok: false, http, phan_hoi: phanHoi, loi: "Đã gửi Odoo nhưng chưa ghi được kết quả: " + String((e as Error).message || e) }, 500);
  }
  const ds = (ketQua as { trang_thai: string }[]) || [];
  return tra({
    ok: !loiMang && http >= 200 && http < 300 && ds.every((x) => x.trang_thai === "thanh_cong"),
    http, loi: loiMang, ket_qua: ds, phan_hoi: phanHoi, canh: pre.canh, requests: pre.requests,
  });
});
