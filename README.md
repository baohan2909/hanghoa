# ĐIỀU PHỐI HÀNG HÓA — Nón Sơn

Hệ thống điều phối hàng hóa cho chuỗi ~220 nơi bán (168 cửa hàng CH + 36 điểm bán DB)
của Nón Sơn. Cửa hàng chủ động đề nghị hàng theo lịch cố định, engine Postgres tính số
đề xuất, điều phối kiểm soát ngược và can thiệp khi có cảnh báo, kho xuất hàng qua Odoo,
đơn vị vận chuyển giao tới nơi — toàn bộ chuỗi được theo dõi trong một ứng dụng.

*(Tên cũ **NS FLOW** đã bỏ.)*

## Kiến trúc

| Thành phần | Công nghệ |
|---|---|
| Giao diện | React + Vite, PWA, chạy trên GitHub Pages |
| Dữ liệu | Supabase (PostgreSQL), schema `chiahang` |
| Đồng bộ | Google Apps Script đọc Google Sheets → Supabase (chạy mỗi giờ) |
| Vận đơn | Giao Hàng Tiết Kiệm — webhook + Edge Function `ghtk-webhook` / `ghtk-quet` / `ghtk-nhan` |
| Xuất kho | File Excel nạp vào Odoo, mã đơn `NS-{id}` |

Toàn bộ nghiệp vụ nặng nằm trong hàm PostgreSQL (`fn_*`), giao diện chỉ gọi RPC.

## Màn hình

Tổng quan · Đề nghị hàng · Duyệt · Kho · Lịch đề nghị & Điều chuyển kho · Chia hàng mới ·
Giám sát thiếu hàng · Chất lượng đề nghị · Yêu cầu điều phối · Vận đơn · Hàng đặc biệt ·
Theo dõi online · Báo cáo · Đối soát · Đấu trường · Tham số.

## Quy tắc nghiệp vụ bất di bất dịch

1. **Không hiển thị doanh thu** ở bất kỳ đâu — chỉ số lượng sản phẩm. Giá niêm yết được
   phép hiện để phân loại hàng, nhưng không cộng thành giá trị tồn kho.
2. Ngành **phụ kiện** bị loại khỏi mọi tính toán tổng quan.
3. **Nơi bán = CH + DB**. Đội sale (DO), kho vùng (KV), kho tổng (TP/SA), kho phụ kiện (PK)
   không phải nơi bán — mọi hàm và mọi lượt đồng bộ phải nhận cả CH lẫn DB.
4. Phiếu khẩn cấp (KC) **không tính tuân thủ lịch**, chỉ phiếu định kỳ (DK) mới tính.
5. Đơn "Chưa chuyển" là **nháp**, không tính là đã gửi; tính từ "Chờ xét duyệt" trở đi.
6. Barcode file bán ≠ barcode file tồn cho cùng sản phẩm — mọi phép so khớp phải là
   `(barcode = X OR ma_tham_chieu = Y)`.
7. Trạng thái điều chuyển Odoo chuẩn hóa 6 mức tiếng Việt ở cả Apps Script lẫn giao diện.

## Thư mục

```
src/
  App.jsx            khung, menu, phân quyền, cơ chế tự cập nhật
  config.js          endpoint Supabase + Edge Function
  lib/               supabase.js · ui.jsx (Sel, DateBox) · icons.jsx · odooExport.js
  screens/           mỗi màn một file
  styles.css         toàn bộ giao diện — mỗi class định nghĩa ĐÚNG MỘT LẦN
```

**Không có trong repo này** (repo công khai — không để lộ cấu trúc dữ liệu):
migration SQL và mã Google Apps Script được giữ riêng ngoài repo.

## Quy ước phát triển

- **Migration SQL đánh số tăng dần**, chạy đúng thứ tự, chạy lại nhiều lần không hỏng.
- Đổi kiểu trả về của hàm thì phải `drop function` trước khi tạo lại.
- Bảng mới cho Apps Script ghi vào thì phải `grant all to service_role`.
- Mỗi class CSS chỉ được định nghĩa một lần — `grep -c "^\.ten-class {"` phải bằng 1.
- Bump `version` trong `package.json` mỗi lần phát hành, rồi vào **Tham số → Phát hành**
  để các máy đang mở nhận thông báo cập nhật.
- **Migration SQL và Apps Script KHÔNG nằm trong repo này** — repo công khai, không
  để lộ tên bảng, cấu trúc hàm và logic nghiệp vụ. Hai thứ này giữ riêng bên ngoài.

## Phát hành

1. Chạy các file SQL còn thiếu trong Supabase, theo thứ tự số (file giữ ngoài repo).
2. Đẩy code lên nhánh chính, chờ GitHub Actions build xong.
3. Vào **Tham số → Phát hành**, nhập số phiên bản. Máy cửa hàng đang mở sẽ hiện lời mời
   cập nhật, và **không tự tải lại khi nhân viên đang nhập dở**.
