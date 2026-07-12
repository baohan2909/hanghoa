# BÀN GIAO — NS FLOW (chiahang)

## NHẬT KÝ NỐI TIẾP

### Phiên 1 — 11/07/2026 — Build toàn bộ 4 phase v1.0.0

**Quyết định kiến trúc đã chốt (Aroma giao toàn quyền):**
- Supabase **project riêng**, schema `chiahang` (tách khỏi chamcong; PostgREST cần
  thêm `chiahang` vào Exposed schemas; GAS/Edge dùng header `Accept-Profile`/`Content-Profile`).
- Đăng nhập: mã CH / mã quản lý + mật khẩu bcrypt (mặc định `Ns280396`, tài khoản CH
  tự sinh bằng trigger khi sync cửa hàng). `nguoi_dung` chặn đọc trực tiếp.
- File Odoo: mapping cột để trong `tham_so.odoo_mapping` → **chờ file mẫu Odoo của anh
  để tinh chỉnh mapping, không cần sửa code.**
- `ban_hang` không partition (2 tháng dữ liệu), chống trùng bằng `row_hash` unique.
  Không đọc/lưu cột thành tiền (nguyên tắc không đụng doanh thu).
- Frontend Vite + React 19, không thư viện UI ngoài; `xlsx` dynamic import (chunk riêng
  429KB chỉ tải khi bấm xuất file; bundle chính 127KB gzip).
- Deploy: GitHub Actions build → Pages (anh chỉ push source, không cần chạy npm local).

**Đã hoàn thành:**
| Hạng mục | Trạng thái |
|---|---|
| 001–006 migrations (schema, engine 7 lớp, seed+cron, RLS, ảnh batch, RPC bổ sung) | ✅ |
| Engine: censored demand (het_hang_log), shrinkage nhóm ngành 3, trần định mức ngành, reason codes | ✅ |
| GAS sync: cửa hàng (map tên→mã), tồn kho 2 sheet, ảnh (old_code/HinhSanPham), bán hàng delta watermark | ✅ |
| 6 màn hình: Dashboard SLA, Xin hàng, Duyệt (FIFO + xuất Odoo), Chia hàng mới, Vận đơn GHTK, Tham số | ✅ |
| Edge Functions: ghtk-tracking ✅ · push-notify (cần VAPID keys mới chạy) | ✅ / ⚠️ |
| Build vite pass, GitHub Actions workflow | ✅ |
| RBAC chặt theo vai trò trong từng RPC (hiện tin `p_nguoi` từ client — pilot) | ❌ Phase siết |
| Ưu tiên khi kho thiếu: `fn_uu_tien_phan_bo` có sẵn trong DB, **chưa nối UI** | ⚠️ |
| Báo cáo lead time xin→nhận (dữ liệu đã ghi đủ mốc, chưa có màn báo cáo) | ⚠️ |

**Việc anh cần làm để chạy:** theo README mục "Triển khai lần đầu" (5 bước).
Điểm chết hay quên: Exposed schemas thêm `chiahang`; bật pg_cron trước phần cron của 003.

**Chờ anh cung cấp:**
1. File mẫu import Odoo đã chạy thành công → em/anh sửa `odoo_mapping`.
2. Token API GHTK → secrets function ghtk-tracking.
3. Xác nhận cột G "NHÓM CỬA HÀNG" trong sheet đã điền 1/2/3 (chưa có → mặc định nhóm 2, chu kỳ 14 ngày).

**Phiên sau ưu tiên:** siết RBAC (token phiên server-side thay vì tin p_nguoi), rồi pilot 5–10 CH.

### Phiên 1b — 11/07/2026 — Hoàn tất phần còn nợ (v1.0.1)

- ✅ Migration `007_baocao.sql`: `fn_bao_cao_leadtime` (từng đơn: giờ gửi→bàn giao,
  ngày gửi→nhận, đạt/trễ SLA), `fn_bao_cao_tong` (KPI tổng), `fn_thieu_kho`
  (tổng cầu các đơn đã duyệt vs tồn kho TP/SA).
- ✅ Màn **Báo cáo** (`BaoCao.jsx`): chọn khoảng ngày, 6 ô KPI (tổng đơn, đã nhận,
  đang chạy, % đạt SLA kho, giờ bàn giao TB, ngày xin→nhận TB) + bảng chi tiết từng đơn.
  Tab chỉ hiện cho DIEU_PHOI/ADMIN.
- ✅ Màn **Duyệt** nối cảnh báo thiếu kho: banner đỏ liệt kê barcode kho trung tâm không
  đủ (cần/còn/số CH); trong đơn đang mở, dòng thuộc barcode thiếu có chip "Kho chỉ còn X".
  `fn_uu_tien_phan_bo` vẫn sẵn trong DB để tính phương án fair-share (nối nút thao tác ở
  phiên sau nếu anh muốn tự động co số duyệt theo điểm).
- ✅ Build pass. Bổ sung tab thứ 6 (Báo cáo) giữa Vận đơn và Tham số.

**Chạy thêm:** anh chạy `007_baocao.sql` trong SQL Editor (sau 006).

---

## NHẬT KÝ NỐI TIẾP

### Phiên 2 — 11/07/2026 — NÂNG CẤP v2.0.0 theo Kế hoạch triển khai mới

Anh gửi tài liệu *"Kế hoạch triển khai hệ thống đề nghị và điều chuyển hàng hóa tại
cửa hàng"*. Đây là thay đổi triết lý vận hành, không chỉ thêm tính năng. Đã nâng toàn bộ
hệ thống theo 6 trục lớn:

**1. Bỏ cơ chế xin–chờ duyệt → "Phiếu đề nghị hàng hóa"**
- Cửa hàng chủ động lập phiếu, tự chịu trách nhiệm. Điều phối chuyển sang *kiểm soát
  ngược & can thiệp khi có cảnh báo* (không duyệt từng đơn).
- `fn_dieu_chinh_don` thay `fn_duyet_don`: điều phối chỉ sửa số khi cần, **bắt buộc ghi
  lý do**, chỉ trước khi lên Odoo, ghi vết vào `lich_su_trang_thai`.

**2. Lịch đề nghị cố định 3 nhóm** (`008_lich_v2.sql`)
- Bảng `lich_de_nghi(ma_ch, tuan, thu)`: tuan 0 = mọi tuần (N1/N2), 1–3 = tuần trong
  chu kỳ 21 ngày (N3). Cột `cua_hang.cum` = N1A/N1B/N1C.
- `fn_phan_lich_tu_dong()` (chạy tay, revoke anon): N1 chia 3 cụm 15/15/10 theo sức bán
  30 ngày (1A CN+T4, 1B T2+T5, 1C T3+T6); N2 quota CN..T7 = [4,15,20,15,14,2,4]; N3 rải
  slot 0..20, mỗi CH 2 lượt cách 10 rồi 11 ngày, né thứ Sáu.
- `fn_tuan_chu_ky`, `fn_den_lich`, `fn_ky_tiep`, `fn_lich_ngay`, `fn_sua_lich` (điều phối
  chỉnh tay, có audit). Mốc chu kỳ: tham số `ngay_goc_chu_ky` (Chủ nhật bắt đầu Tuần 1).
- Hạn gửi: tham số `gio_chot_de_nghi` = 15:30. Gửi sau giờ → cờ `gui_tre`.
- **Deadline kho theo ngày làm việc** (`fn_deadline_kho`): T2–T5 → 17:00 hôm sau ·
  T6 → 12:00 T7 · T7/CN → 17:00 T2.

**3. Hai trưởng ca cùng xác nhận + AUTH PHIÊN (đóng nợ RBAC)**
- Bảng `phien(token uuid, ma, het_han 30 ngày)`. `fn_dang_nhap` v2 trả JSON kèm `token`.
  `fn_kiem(token)` xác thực mọi RPC ghi. Mọi hàm ghi giờ nhận `p_token` thay vì tin
  `p_nguoi` do client gửi — **RBAC đã siết server-side**.
- `fn_gui_don` v2: trưởng ca thứ hai nhập mã + mật khẩu, verify bằng `crypt` server-side;
  phải khác người lập phiếu và cùng cửa hàng. Chặn phiếu định kỳ trùng ngày; phiếu ngoài
  lịch bắt buộc dùng KHAN_CAP + lý do.
- `fn_them_nguoi_dung` (ADMIN): tạo tài khoản trưởng ca.

**4. Vai trò KHO TỔNG + màn riêng** (`Kho.jsx`)
- Vai trò `KHO`, tài khoản `KHOTONG`. Pipeline mới:
  `GUI → XUAT_FILE → LEN_ODOO → KHO_NHAN → KHO_LAY → BAN_GIAO_VC → DANG_GIAO → DA_NHAN`
  qua `fn_buoc(token, don, tt)` — kiểm vai trò từng bước.
- Màn Kho: 3 tab (chờ tiếp nhận / đã nhận / đã lấy) FIFO đánh số, nút bước kế, modal
  `fn_kho_phan_hoi` báo thiếu hàng/sai dữ liệu (sinh cảnh báo, không tự bỏ đơn),
  highlight quá hạn, auto-refresh 60s.

**5. Cảnh báo tuân thủ + KPI**
- `fn_quet_qua_han` v2 (cron */30): QUA_HAN deadline kho + BO_LICH (đến lịch, quá giờ
  chốt chưa gửi) + KHAN_CAP_LIEN_TUC (≥3 phiếu khẩn/14 ngày).
- `fn_kpi_tuan_thu(tu, den)`: mỗi CH — số kỳ theo lịch, gửi đúng lịch, gửi trễ, khẩn cấp,
  đủ 2 xác nhận, % đúng lịch. Hiện trong màn Báo cáo (tab "Tuân thủ cửa hàng").
- `fn_tong_de_nghi_ngay(ma_ch, ngay)`: tổng BH + NV cho biên bản bàn giao (chamcong gọi).

**6. Engine v2** (`009_engine_v2.sql`)
- Chu kỳ = số ngày đến **kỳ đề nghị kế tiếp thật theo lịch** (`fn_ky_tiep`), fallback
  `chu_ky_ngay` khi CH chưa có lịch.
- Nguồn gợi ý mới **KHO_DANG_SAN**: mã kho tổng còn ≥ `kho_san_nguong` (10), CH chưa có
  tồn, nhóm ngành cấp 3 đang bán tốt tại CH → gợi ý `min_display` để đa dạng mẫu; v =
  v_nhom×0.5, xếp sau nhu cầu thật, tối đa `kho_san_toi_da` (15) mã/phiếu.
- Trả thêm `so_tuan_ton` (UI hiển thị số tuần tồn, đỏ nếu <1).

**Frontend cập nhật:** `Login` (token) · `App` (tab Kho/Lịch, rename "Đề nghị hàng",
default tab theo vai trò, badge theo vai trò) · `XinHang` viết lại (banner lịch, loại
KHAN_CAP + lý do, cảnh báo bỏ sót hàng bán nhanh, cột Tuần tồn, filter Kho sẵn, modal 2
xác nhận) · `Duyet` viết lại (điều phối, tabs pipeline, can thiệp + lý do, banner thiếu
kho) · `Kho` mới · `Lich` mới (xem lịch theo ngày/nhóm, sửa lịch từng CH, hướng dẫn phân
lịch tự động) · `VanDon`/`ThamSo`/`Dashboard`/`BaoCao` chuyển sang token + trạng thái v2 ·
`supabase.js` (TRANG_THAI + LY_DO mới) · GAS chu kỳ nhóm mới 4/7/11.

**Build:** ✅ pass sạch.

**CHẠY THÊM (theo thứ tự):**
1. SQL Editor: `008_lich_v2.sql` rồi `009_engine_v2.sql`.
2. Điền cột `cua_hang.nhom_ch` (1/2/3) cho toàn bộ CH, rồi chạy `select
   chiahang.fn_phan_lich_tu_dong();` một lần.
3. Tạo tài khoản trưởng ca (≥2 người/CH) bằng `fn_them_nguoi_dung` hoặc thêm trực tiếp
   vào `nguoi_dung`.
4. (Tùy chọn) chỉnh `ngay_goc_chu_ky` trong Tham số cho đúng Chủ nhật bắt đầu Tuần 1
   thực tế; chỉnh `gio_chot_de_nghi` nếu khác 15:30.

**Lưu ý:** đọc dữ liệu vẫn mở cho anon (chỉ siết GHI qua token). Cron `nsflow-sla` tự
chạy `fn_quet_qua_han` v2. Vẫn chờ anh: **file mẫu Odoo** (chỉnh `odoo_mapping`),
**token GHTK**, **xác nhận cột nhóm CH** đã điền, **danh sách trưởng ca theo CH**.

**Chưa làm (đề xuất phiên sau, không chặn pilot):**
- Kết nối Odoo trực tiếp (hiện xuất Excel thủ công qua `odoo_mapping`).
- Tự động phân hàng mới/tái bản cho điều phối (màn ChiaHangMoi hiện làm thủ công + AI đề xuất).
- Web Push nhắc lịch đề nghị buổi sáng cho trưởng ca (hạ tầng push-notify đã có).
- Biên bản bàn giao tự chèn `fn_tong_de_nghi_ngay` vào chamcong.
