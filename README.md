# NS FLOW — Chia hàng & điều phối hàng hóa Nón Sơn

Nền tảng thay quy trình chia hàng thủ công theo *Kế hoạch triển khai hệ thống đề nghị
và điều chuyển hàng hóa*: cửa hàng **chủ động lập Phiếu đề nghị hàng hóa** theo **lịch
cố định**, hai trưởng ca cùng xác nhận, engine Postgres tính số đề xuất (7 lớp, giải
thích từng dòng), điều phối **kiểm soát ngược & can thiệp khi có cảnh báo** (không còn
duyệt từng đơn), kho tổng xử lý theo nhịp ngày làm việc, file Odoo sinh tự động, theo
dõi GHTK đến khi cửa hàng xác nhận nhận.
**SLA cứng: gửi hôm nay — kho bàn giao vận chuyển trong ngày làm việc kế tiếp**
(T6 → trưa T7 · T7/CN → gom xử lý T2)..

## Kiến trúc
```
Google Sheets (THÁNG x, Dự án SP - Phân tích)
   │ Apps Script (gas/SyncNSFlow.gs) — mỗi 60 phút, delta theo watermark
   ▼
Supabase (project riêng, schema chiahang)
   ├─ migrations/001→009: bảng + engine + lịch cố định + auth phiên + RPC + cron
   ├─ Edge Functions: ghtk-tracking · push-notify (tùy chọn)
   ▼
PWA Vite + React (GitHub Pages, repo này) — build tự động bằng GitHub Actions
```

## Triển khai lần đầu (thứ tự bắt buộc)

**1. Supabase** — tạo project mới (Pro, region Singapore/Sydney):
- SQL Editor: chạy lần lượt `supabase/migrations/001 → 009`.
  - `008_lich_v2.sql`: lịch cố định, phiên đăng nhập (token), 2 trưởng ca xác nhận,
    vai trò KHO, deadline theo ngày làm việc, cảnh báo tuân thủ, KPI.
  - `009_engine_v2.sql`: engine tính chu kỳ theo lịch thật + gợi ý hàng kho tổng đang sẵn.
- Database → Extensions: bật `pg_cron` (trước khi chạy phần cron cuối file 003).
- Settings → API → **Exposed schemas: thêm `chiahang`** (bắt buộc, thiếu là app trắng).
- Ghi lại `Project URL`, `anon key`, `service_role key`.
- **Sau khi sync dữ liệu (bước 2)**, điền cột nhóm `cua_hang.nhom_ch` (1/2/3) rồi chạy
  một lần trong SQL Editor để phân lịch cố định toàn hệ thống:
  ```sql
  select chiahang.fn_phan_lich_tu_dong();
  ```
  Hàm này ghi đè toàn bộ lịch (N1 chia 3 cụm theo sức bán, N2 rải quota từng thứ,
  N3 rải chu kỳ 21 ngày né thứ Sáu). Chỉ chạy lại khi cửa hàng đổi nhóm.
- **Tạo tài khoản trưởng ca** để luồng "2 xác nhận" chạy được — mỗi cửa hàng cần ≥2
  tài khoản người thật (một tài khoản CH dùng chung không đủ). Trong SQL Editor,
  với token của admin (lấy từ `fn_dang_nhap`), gọi `fn_them_nguoi_dung(...)` cho từng
  trưởng ca, hoặc thêm trực tiếp vào `nguoi_dung` (vai_tro `CH`, gắn `ma_ch`).

**2. Apps Script** — project mới, dán `gas/SyncNSFlow.gs`:
- Script Properties: `SUPABASE_URL`, `SERVICE_KEY` (service_role), `FOLDER_ID`.
- Chạy `syncTatCa()` lần đầu (cấp quyền Drive khi hỏi) → kiểm tra bảng có dữ liệu.
- Chạy `setupTriggers()` một lần.

**3. Frontend** — repo GitHub `hanghoa`:
- Sửa `src/config.js`: điền `SUPABASE_URL` + `SUPABASE_ANON`.
- Push toàn bộ repo lên branch `main`.
- Settings → Pages → Source: **GitHub Actions**. Workflow tự build + deploy.
- App chạy tại `https://baohan2909.github.io/hanghoa/`.

**4. GHTK (Phase vận chuyển)**:
```
supabase functions deploy ghtk-tracking
supabase secrets set GHTK_TOKEN=<token> SB_URL=<project url> SB_SERVICE_KEY=<service_role>
```

**5. Push (tùy chọn)**: `npx web-push generate-vapid-keys` → set secrets → deploy `push-notify`.

## Tài khoản
| Mã | Vai trò | Mật khẩu mặc định |
|---|---|---|
| `NS00490` | ADMIN | `Ns280396` |
| `DIEUPHOI` | DIEU_PHOI | `Ns280396` |
| `KHOTONG` | KHO (kho tổng) | `Ns280396` |
| Mã CH (tự sinh khi sync) | CH | `Ns280396` |
| Mã trưởng ca (admin tạo) | CH | `Ns280396` |

Đổi mật khẩu trong màn **Tham số** (admin) — mật khẩu lưu bcrypt, bảng `nguoi_dung`
không cho đọc trực tiếp qua API.

## File Odoo
Cấu trúc cột nằm ở tham số `odoo_mapping` (màn Tham số) — khi có file mẫu Odoo
chính thức, sửa mapping JSON tại đó, **không cần sửa code**.

## Vòng đời đơn
`GUI → DUYET → XUAT_FILE → LEN_ODOO → KHO_LAY → BAN_GIAO_VC → DANG_GIAO → DA_NHAN`
Mỗi bước ghi audit log (`lich_su_trang_thai`). pg_cron quét SLA mỗi 30 phút,
ghi `canh_bao` cho đơn quá hạn + cửa hàng quá lịch xin hàng.

## Engine gợi ý (fn_goi_y_chia_hang) — 7 lớp
1. Làm sạch: net trả hàng, khoảng [đơn gần nhất → hôm qua].
2. Phân loại SKU×CH: đủ dữ liệu / mỏng / hàng mới / không bán / đứt hàng giữa kỳ.
3. Tốc độ: censored (chia số ngày CÓ hàng, từ `het_hang_log`), shrinkage về nhóm
   ngành cấp 3 khi số nhỏ, hàng mới mượn tốc độ nhóm × hệ số.
4. Nhu cầu: `v × (chu kỳ + lead time) + z × sigma × sqrt(chu kỳ + lead time)`.
5. Đề xuất: trừ tồn dự tính (đã gồm đi đường), co tỷ lệ nếu tổng ngành vượt trần định mức.
6. Số nhỏ: bán hết → tối thiểu `min_display`.
7. Reason codes trên từng dòng — nhân viên thấy vì sao AI đề xuất số đó.

Mọi hệ số là tham số trong bảng `tham_so`, chỉnh trong app, hiệu lực ngay.
