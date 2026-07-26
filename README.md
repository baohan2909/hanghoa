# NS CARE — CRM chăm sóc khách hàng sau mua (Nón Sơn)

Ứng dụng web (Vite + React) kết nối Supabase. Toàn bộ nghiệp vụ đi qua các
hàm `care.fn_*` (bảng khóa cứng RLS — app không chạm thẳng bảng).

## Cấu trúc thư mục
```
ns-care/
├─ index.html
├─ package.json
├─ vite.config.js          base './' để chạy trên GitHub Pages
├─ README.md
└─ src/
   ├─ main.jsx             điểm khởi động
   ├─ App.jsx              khung + điều hướng màn + cổng đăng nhập
   ├─ styles.css           design system (khớp ĐIỀU PHỐI HÀNG HÓA)
   ├─ lib/
   │  ├─ config.js         ★ ĐIỀN URL + ANON KEY Ở ĐÂY
   │  ├─ supabase.js       khởi tạo client (schema 'care')
   │  ├─ api.js            bọc toàn bộ hàm fn_* + dịch lỗi tiếng Việt
   │  ├─ session.js        lưu phiên đăng nhập (localStorage)
   │  └─ format.js         định dạng ngày/SĐT + nhãn trạng thái
   ├─ context/AuthContext.jsx
   ├─ components/          Sidebar, Cmdbar, Icons, ui (Card/StatBig/Modal…)
   └─ screens/            Login, TongQuan, HangDoi, Phieu, Khach360,
                          PhanTich, BoCauHoi, QuanTri, NhapDon
```

## Thứ tự triển khai

### 1. Database (Supabase) — làm 1 lần
- Mở **SQL Editor**, dán & chạy file `care_foundation_v1.4.sql` (giao riêng).
- Vào **Project Settings ▸ API ▸ Exposed schemas**, thêm `care` vào danh sách.

### 2. Đồng bộ danh mục + tài khoản (Google Apps Script) — làm 1 lần / định kỳ
- Tạo Apps Script, dán file `NS_CARE_sync.gs` (giao riêng).
- Điền `CFG` (URL, service_role key, tên file/tab/cột Sheet).
- Chạy menu **NS CARE ▸ Đồng bộ TẤT CẢ** (mật khẩu trong Sheet được DB tự hash).

### 3. Web app (repo này)
```bash
# a) Điền src/lib/config.js: SUPABASE_URL + SUPABASE_ANON_KEY
npm install
npm run build          # ra thư mục dist/
# b) Đưa nội dung dist/ lên GitHub Pages (hoặc push repo + deploy như NS FLOW)
```
Chạy thử tại chỗ: `npm run dev`.

## Tính năng bản v1.2 (mới thêm)
- **Phân tích v2**: lọc 7/30/90 ngày hoặc tất cả, lọc nhóm chủ đề + sắc thái,
  3 thẻ tỉ lệ khen/trung lập/góp ý, biểu đồ theo dòng SP + theo nhóm, bảng
  chi tiết dòng × nhóm × sắc thái, xuất Excel.
- **Quản trị v2**: bấm thẳng vào giá trị cấu hình để sửa (Enter lưu, Esc huỷ);
  công cụ **ẩn danh dữ liệu khách** theo NĐ 13/2023 (xác nhận 2 lớp — gõ lại
  số điện thoại mới cho chạy, không đảo ngược được).
- **Tổng quan bấm được**: thẻ "Chờ gọi hôm nay" / "Quá hạn" bấm là nhảy thẳng
  Hàng đợi đúng tab đó.

## Tính năng bản v1.1
- **Trình soạn bộ câu hỏi**: tạo/soạn bản nháp, 3 loại câu (điểm 1–5, chọn
  đáp án, tự luận), gắn nhóm chủ đề, xếp thứ tự, đặt 1 câu điểm neo, phát hành.
- **Phân loại ý kiến ngay trong Phiếu**: chọn sản phẩm + nhóm + sắc thái
  (khen/trung lập/góp ý) + nội dung; có gợi ý tự động từ câu trả lời tự luận —
  dữ liệu này nuôi Tín hiệu đỏ & màn Phân tích.
- **Hẹn gọi lại chọn ngày giờ + ghi chú**; lịch sử hiện cả giờ hẹn.
- **Nút Gọi = gọi thật** (`tel:`) ở hàng đợi + trong phiếu (bấm trên iPhone
  là quay số luôn).
- **Lọc theo kênh + Xuất Excel (CSV có BOM, mở tiếng Việt chuẩn)** ở Hàng đợi.
- **PWA**: cài lên màn hình chính iPhone/Android như app thật (nút "Tải ứng
  dụng" chân sidebar); service worker network-first nên cập nhật bản mới không
  bị kẹt cache, offline vẫn mở được giao diện đã tải.

## Ghi chú
- `config.js` chứa **anon key** (khóa công khai an toàn — DB đã khóa RLS,
  app chỉ chạm được qua `fn_*`). **KHÔNG** đưa service_role key vào repo này;
  key đó chỉ dùng trong GAS.
- Yêu cầu SQL **v1.4** trở lên (fn_hangdoi có cột kênh + fn_sync_tin_hieu_do).
- Cảnh báo **Telegram** khi có tín hiệu đỏ: điền `CFG.TELEGRAM` trong GAS và đặt
  trigger theo giờ chạy `quetTinHieuDo` (xem file tổng hợp bàn giao).

## ⚠️ Đường dẫn GitHub Pages
Repo deploy ở `baohan2909.github.io/nscare/` nên `vite.config.js` đặt `base: '/nscare/'`.
Nếu đổi TÊN REPO, phải sửa `base` thành `/<tên-repo>/` rồi build lại, nếu không sẽ TRẮNG MÀN (asset 404).
