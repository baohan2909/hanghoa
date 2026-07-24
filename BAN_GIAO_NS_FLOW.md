# BÀN GIAO PHIÊN LÀM VIỆC — ĐIỀU PHỐI HÀNG HÓA

> Cập nhật: 24/07/2026 · App **v3.43.0** · Apps Script **v3.24.2** · SQL đã chạy tới **132**

## 0. Cách làm việc

Người dùng là Aroma (NS00490), IT duy nhất của Nón Sơn. Trả lời **100% tiếng Việt**,
xưng anh/em, ngắn gọn trọng tâm, "nói ít làm nhiều". Anh làm việc chủ yếu trên iPhone.

Anh giao toàn quyền quyết định kỹ thuật, chỉ hỏi khi mơ hồ cao: **đổi schema, bump
version, thao tác xóa dữ liệu**. Nhưng khi **đề xuất** thì phải tường tận — nhất là
thiết kế: nêu rõ tên class, mã màu, kích thước, gradient, hiệu ứng.

## 1. Dự án

- Tên hiển thị **ĐIỀU PHỐI HÀNG HÓA** (tên cũ NS FLOW đã bỏ).
- Repo GitHub Pages: `hanghoa` (baohan2909.github.io/hanghoa/), React + Vite, PWA.
- Supabase Pro, schema **`chiahang`** — tuyệt đối không đổi tên schema.
- Đồng bộ: Google Apps Script đọc Google Sheets → Supabase, chạy mỗi giờ.
- Mã đơn Odoo: `NS-{id}`. Mã lệnh điều chuyển ngang: `DPyyyymmdd-HHmm`.

## 2. Bảy quy tắc nghiệp vụ bất di bất dịch

1. **Không hiển thị doanh thu** ở bất kỳ đâu — chỉ số lượng sản phẩm. *(Giá niêm yết
   được phép hiện để phân loại hàng cao cấp; không cộng thành giá trị tồn kho.)*
2. Ngành **phụ kiện (PK)** loại khỏi mọi tính toán tổng quan.
3. **Nơi bán = CH (168) + DB (36) = 204.** DO/DOISALE, KV, TP/SA, PK không phải nơi bán.
   Mọi hàm và mọi lượt đồng bộ phải nhận **cả CH lẫn DB**.
4. Phiếu **KC không tính tuân thủ lịch**, chỉ DK mới tính. KC vẫn hiện đủ ở Điều chuyển kho.
5. Đơn **"Chưa chuyển" = nháp**, không tính đã gửi. Tính từ "Chờ xét duyệt" trở đi.
6. **Barcode file bán ≠ barcode file tồn** → mọi match phải là
   `(barcode = X OR ma_tham_chieu = Y)`.
7. **6 trạng thái Odoo** chuẩn hóa 2 lớp (Apps Script + giao diện). Tầng chi tiết (cột S)
   chỉ dùng tách nhóm "Chưa chuyển" thành: Yêu cầu điều chuyển / Chờ xét duyệt /
   Bị từ chối / Bị hủy.

## 3. Quy tắc giao diện

- **Header `cmdbar`** nền gradient teal → mọi chữ/nút trong header màu trắng, nút dùng
  `.btn-hd` (kính mờ). **Cấm** `.btn-ghost` trong header (chữ đen).
- Lọc/tìm/nút phụ gom vào một hàng **`.toolbar`** riêng, không nhét vào header.
- **Thẻ chọn**: `.the-g` (button) chứa `.the-g-n` (số 28px) + `.the-g-t` (nhãn + `<small>`),
  active thêm class `.on` = `var(--grad)` + glow + chữ trắng. Cấm tự chế thẻ phẳng.
- Dropdown **luôn dùng `Sel`** trong `lib/ui.jsx`, ngày dùng `DateBox`. Cấm `<select>` thô.
- Nút: `.btn-ai` (gradient + glow) · `.btn-teal` · `.btn-ghost` · `.btn-mini` (trong bảng).
- Thanh tiến độ: `.kt-info` → `.kt-bar` → `.kt-fill` (glow) → `.kt-song` + `.kt-pct`.
- Thẻ số lớn `.tq-lon-so` font-mono 42px **màu magenta** — số luôn magenta.
- Bảng: mọi tiêu đề cột bấm sort được, nội dung ô một dòng không wrap, ngày dd/mm/yyyy.
- **Thẻ báo cáo nền trắng cỡ lớn** phải có bong bóng tròn nhạt ở góc phải trên:
  `::after` tròn ~90-130px, lệch ra ngoài mép, `rgba(63,182,168,.07)` teal mặc định,
  `rgba(214,0,108,.07)` magenta cho thẻ cảnh báo; thẻ cha `position: relative; overflow: hidden`.
- Bảng màu: magenta `#D6006C` · teal `#3FB6A8` · vàng `#CBA45A`. **Không dùng tím.**
- **Mỗi class CSS định nghĩa đúng một lần** — `grep -c "^\.ten {" src/styles.css` = 1.

## 4. Quy tắc code & giao file

- Code tối thiểu, **sửa phẫu thuật**: không đụng code lân cận, không tiện tay cải tiến.
  Mỗi dòng sửa truy được về một yêu cầu cụ thể.
- Anh nêu N vấn đề → sửa đủ N, hoặc lập bảng ✅/⚠️/❌ trung thực.
- **Chỉ gửi file đã sửa**, không gửi lại toàn repo. Zip đánh số kèm bump `package.json`.
- **Apps Script VÀ migration SQL đều xuất file riêng**, tuyệt đối không đóng vào repo
  — repo công khai, không để lộ tên bảng, cấu trúc hàm, logic nghiệp vụ.
- SQL: đổi kiểu trả về → `drop function` trước. Bảng mới cho Apps Script ghi →
  `grant all to service_role`. Xóa view/bảng vật chất hóa → đọc `pg_class.relkind` trước.
- Apps Script: mọi `UrlFetchApp` tới Supabase phải dùng `HEADERS()` (có
  `Content-Profile: chiahang`) và kiểm `getResponseCode() >= 300`, không nuốt lỗi.

## 5. Trạng thái hiện tại

**Đồng bộ** ổn định. Bug tồn ảo đã đóng, ba gốc: Apps Script gọi RPC thiếu header
`Content-Profile` (âm thầm vào schema public), chạy chồng (đã khóa `LockService`),
`fn_don_ton_cu` phải dùng `is distinct from`. Apps Script **không** khử trùng khóa —
nếu file tồn của IT lại nhân dòng thì lỗi Postgres 21000 tái diễn; dùng `kiemTrungTon.gs`
để kiểm.

**Vận đơn GHTK**: `customer_fullname` luôn null (GHTK ẩn người nhận qua API), tên cửa
hàng **chỉ lấy được từ nhãn PDF** — Edge Function `ghtk-nhan` đọc nhãn hàng loạt
(100 đơn/request, nhận phần số đuôi của mã đơn) rồi bóc chữ bằng `unpdf`. Mã vận đơn
chứa **mã tuyến**, không phải mã cửa hàng — hướng này đã bị bác bỏ vì sai 12,5%.

**Đã hoàn tất lộ trình v3.37 → v3.40**:

| SQL | Nội dung |
|---|---|
| 121 | Nối vận đơn ↔ phiếu điều chuyển theo cặp `(ma_ch, ngày)`; bắt phiếu treo |
| 122 | Bảng `phien_ban` + phát hành phiên bản, realtime |
| 123 | Tổng quan v4: `tq_cache`, 5 khối độc lập, `fn_tq_doc` chống màn trắng |
| 124 | Theo dõi sâu hàng cao cấp, 5 nhóm cảnh báo xếp theo mức nghiêm trọng |
| 125 | Chất lượng đề nghị v2: mã xương sống, 6 chỉ số, dự báo trống hàng |
| 126 | Bàn điều chuyển ngang ở Yêu cầu điều phối |
| 127 | Bổ sung ảnh sản phẩm vào khối "Trong chuyến này" |
| 128 | Bật RLS đúng cách: khóa bảng, hàm chạy bằng quyền chủ sở hữu |
| 129 | Ghép phiếu xoay trục về phiếu · chuyển phiếu giữa chuyến · danh mục khách sĩ · hẹn giờ nhận diện cửa hàng trên máy chủ |
| 130 | v_sp_tt (tên + ảnh SP) · bán hôm nay theo giờ tương đương · chuỗi giao hàng trả đủ tên CH/khu vực/ngày tạo/số ngày · mã mới có tên sản phẩm |

**Việc còn treo**: làm lại màn **Chia hàng mới** — chia xong bấm một cái là dựng thành
bảng chia cho từng cửa hàng giống màn Đề nghị hàng, xuất ra là chia luôn.

## 6. Bảo mật dữ liệu — RLS

Supabase mở schema `chiahang` ra ngoài qua PostgREST, mà khóa `anon` nằm công khai
trong mã nguồn ứng dụng. Bảng nào cấp quyền cho `anon` mà không bật RLS thì người
ngoài đọc/sửa/xóa thẳng được — đó là lý do Supabase cảnh báo.

Nhưng **bật RLS suông sẽ làm hỏng âm thầm**: hàm mặc định chạy bằng quyền người gọi,
nên RLS chặn luôn cả hàm — ứng dụng không báo lỗi, chỉ trả về rỗng.

**Mô hình đang dùng** (file 128): bảng mới bật RLS và **không có policy nào** → khóa
cứng; thu hồi quyền trực tiếp của `anon`/`authenticated`; các hàm cần đụng bảng thì
chuyển sang `SECURITY DEFINER` kèm `set search_path = chiahang, public`. Ứng dụng chỉ
vào được qua hàm do mình viết. `service_role` (Apps Script, Edge Function) đi xuyên RLS
nên không ảnh hưởng.

**Nhớ:** mỗi lần chạy lại file 121-127 (chúng tạo lại hàm) thì phải **chạy lại 128**,
vì hàm tạo mới quay về chế độ mặc định. File 128 có khối tự kiểm báo hàm nào còn thiếu.

## 7. Bẫy đã gặp — đừng lặp lại

- PostgREST cắt 1000 dòng → dùng RPC + `rpcHet`, không `select` thẳng bảng lớn.
- Không dùng subquery tương quan trong hàm tổng hợp — dựng bảng trung gian rồi join.
- Hàm có `create temp table` **không được** khai báo `stable`.
- `fn_tq_lam_moi` bị nhiều file ghi đè nối tiếp: chạy lại file cũ sẽ mất khối của file mới.
  File 124 có khối tự kiểm cảnh báo việc này.
- Sau khi sửa CSS phải grep lại class trùng; sau khi sửa code phải **build trước khi giao**.
- Bật RLS mà quên `SECURITY DEFINER` cho hàm → ứng dụng trả rỗng, KHÔNG báo lỗi.
- **Gọi hàm đọc tham số ngay trong câu truy vấn** (kiểu `coalesce(p, (fn_doc()->>'x')::numeric)`
  đặt trong CTE) khiến hàm bị gọi lại rất nhiều lần: đo được 422 ms, đưa vào biến plpgsql
  rồi mới truy vấn thì còn 0,8 ms — nhanh hơn 500 lần. Luôn đọc tham số một lần vào biến.
- Bảng `tq_cache` dùng cột `du_lieu`, KHÔNG phải `gia_tri`. Viết sai tên cột thì khối
  cache rơi vào exception và âm thầm tính lại mỗi lần gọi.
- `transform` khi rê chuột (dù chỉ translateY 2px) biến thẻ thành khung chứa, làm mọi
  phần tử `position: fixed` bên trong bị `overflow: hidden` của thẻ cắt. Muốn hiệu ứng
  nhấc thẻ mà vẫn cho ảnh phóng nổi ra ngoài thì dùng box-shadow, KHÔNG dùng transform.
- Sheet bán hàng có **cột B là GIỜ**, Apps Script bản cũ bỏ qua nên kho dữ liệu chỉ có
  ngày. Đã vá (SQL 131 thêm cột `gio`, bản vá GAS đọc `r[1]`). Mã băm chống trùng KHÔNG
  đưa giờ vào — định dạng giờ lệch giữa hai file sẽ sinh dòng trùng; `post_` dùng
  `Prefer: resolution=merge-duplicates` nên nạp lại chỉ cập nhật, không nhân đôi.
  `fn_tq_ban_gio` chỉ so theo giờ khi ngày đối chiếu có ≥80% dòng đã có giờ, chưa đủ thì
  tự rơi về so cả ngày — không cần sửa gì khi nạp xong.
- Chèn khối `const` mới vào giữa component phải đặt TRƯỚC mọi chỗ dùng nó, nếu không
  sẽ lỗi lúc chạy "Cannot access ... before initialization" — build KHÔNG bắt được.
- Lớp phủ hộp thoại: dùng component `LopPhu` trong Dashboard — style gắn thẳng vào thẻ,
  không phụ thuộc file CSS; tiêu đề `.lp-dau` nền gradient chữ trắng glow, vùng cuộn duy nhất
  `.lp-cuon` (mọi overflow lồng bên trong phải visible để thead dán đúng). Ảnh rê chuột
  `.tqa-to` hiện CỐ ĐỊNH giữa màn hình nền TRẮNG (không còn bị mép bảng cắt); ảnh bấm
  xem `.tq-anh-full img` cũng nền trắng bo góc. Card mã mới `.mm-o`: lưới 2 cột 78px+1fr —
  cột trái tốc độ sp/ngày ở trên, ảnh ở dưới; cột phải tên sản phẩm rồi các dòng gạch
  đầu dòng chấm tròn teal (Ra mắt / Tồn kho · Tồn CH / Đang có ở N CH); bấm card mở
  phân bổ theo cửa hàng. Tiêu đề hộp thoại giữ nền gradient nhưng KHÔNG glow chữ —
  anh thấy chữ trắng có text-shadow trắng bị loang, xấu.
- Hai màn MỒ CÔI trong repo, không màn nào import: `BaoCaoMaMoi.jsx` và `TqHangHoa.jsx`.
  Cả hai đều có phần hiển thị tiền. Chờ anh quyết xóa hay dọn rồi đưa vào menu.
