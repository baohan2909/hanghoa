// NEW - 3.154: hằng số + định dạng dùng chung cho màn Online, TikTok Shop và file xuất (báo cáo PDF, dữ liệu Excel).
// Không phụ thuộc React — dựng báo cáo / thử bằng Node được.

export const fmt = (n) => (n == null || n === '' ? '—' : Number(n).toLocaleString('vi'));
export const tien = (n) => {
  const v = Number(n) || 0, a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toLocaleString('vi', { maximumFractionDigits: 2 }) + ' tỷ';
  if (a >= 1e6) return (v / 1e6).toLocaleString('vi', { maximumFractionDigits: 1 }) + ' tr';
  return Math.round(v).toLocaleString('vi');
};
export const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
export const pctTxt = (a, b) => pct(a, b).toLocaleString('vi') + '%';
export const ngayVN = (s) => (s ? String(s).slice(8, 10) + '/' + String(s).slice(5, 7) + '/' + String(s).slice(0, 4) : '—');
export const ngayNgan = (s) => (s ? String(s).slice(8, 10) + '/' + String(s).slice(5, 7) : '');
// NEW - 3.157: TRUNG BÌNH / NGÀY — số ngày của khoảng xem (tính cả 2 đầu) và số chia theo ngày
export const soNgayKy = (tu, den) => (tu && den ? Math.max(1, Math.round((Date.parse(String(den).slice(0, 10)) - Date.parse(String(tu).slice(0, 10))) / 864e5) + 1) : 1);
export const tbN = (x, n) => { const v = (Number(x) || 0) / Math.max(1, n || 1); return Math.abs(v) >= 10 ? Math.round(v).toLocaleString('vi') : v.toLocaleString('vi', { maximumFractionDigits: 1 }); };
export const tbTien = (x, n) => tien((Number(x) || 0) / Math.max(1, n || 1));
export const tyLe = (moi, cu) => (cu > 0 ? ((moi - cu) / cu) * 100 : moi > 0 ? null : 0);

// ===== Online (Nhanh.vn) =====
// Kênh bán (saleChannel) — mỗi kênh giữ 1 màu cố định (bảng màu đã kiểm cho người mù màu, không dùng tím)
export const KENH = {
  48: ['TikTok Shop', '#2a78d6'], 42: ['Shopee', '#eb6834'], 1: ['Admin', '#1baf7a'], 10: ['Website (API)', '#eda100'],
  20: ['Facebook', '#e87ba4'], 49: ['Zalo OA', '#008300'], 41: ['Lazada', '#e34948'],
  2: ['Website', '#8A94A8'], 21: ['Instagram', '#8A94A8'], 43: ['Sendo', '#8A94A8'], 45: ['Tiki', '#8A94A8'],
  50: ['Shopee chat', '#8A94A8'], 51: ['Lazada chat', '#8A94A8'], 52: ['Zalo cá nhân', '#8A94A8'], 60: ['TikTok chat', '#8A94A8'],
};
export const THU_TU_KENH = [48, 42, 1, 10, 20, 49, 41, 60, 2, 21, 43, 45, 50, 51, 52];
export const kenhTen = (k) => (KENH[k] ? KENH[k][0] : 'Kênh ' + k);
export const kenhMau = (k) => (KENH[k] ? KENH[k][1] : '#A7B0BF');
export const NHOM_KENH = { san: 'Sàn TMĐT', web: 'Web + Facebook + Zalo' };
export const TTN = { tc: ['Thành công', 'ok'], giao: ['Đang giao', 'duong'], xl: ['Đang xử lý', 'xam'], hoan: ['Hoàn', 'cam'], tb: ['Thất bại', 'do'], huy: ['Huỷ', 'do'] };
export const NGANH = { BH: 'Nón bảo hiểm', NV: 'Nón vải', PK: 'Phụ kiện', '?': 'Chưa rõ' };   // NEW - 3.156.4 thống nhất tên ngành
export const CS = { chinh: 'Chính', sale: 'Sale', '?': 'Chưa rõ' };
export const LY_DO = { 1: 'Đặt nhầm sản phẩm', 2: 'Phí ship cao', 3: 'Không muốn chuyển khoản', 4: 'Đơn trùng', 5: 'Không liên lạc được khách',
  6: 'Hết hàng', 8: 'Chờ chuyển khoản', 9: 'Khách không thích sản phẩm', 10: 'Không hài lòng nhân viên giao', 11: 'Giao chậm',
  12: 'Đã mua ở cửa hàng', 14: 'Sai địa chỉ nhận', 16: 'Khách không muốn mua nữa', 18: 'Khác', 19: 'Không liên lạc được người gửi',
  20: 'Người gửi không bán online / ngoài tỉnh', 22: 'Chưa giao hàng cho hãng', 23: 'Hãng lấy hàng chậm', 24: 'Sai địa chỉ kho lấy',
  25: 'Hãng làm mất hàng', 26: 'Shop tự giao', 29: 'Shop chưa xử lý đơn', 30: 'Sai giá sản phẩm', 35: 'Khách vắng nhà (hẹn giao lại)' };

// ===== TikTok Shop =====
export const TT_KENH = { live: ['LIVE', '#D6006C'], video: ['Video', '#3FB6A8'], the: ['Thẻ sản phẩm', '#CBA45A'], khac: ['Không qua người bán', '#A7B0BF'] };
export const TT_LOAI = { CH: 'Cửa hàng', DOISALE: 'Đội sale', KENH: 'Kênh công ty', KOL: 'Nhà sáng tạo ngoài', KHAC: 'Khác' };
export const TT_TRANG_THAI = { cho_tt: 'Chờ thanh toán', cho_gui: 'Chờ gửi hàng', dang_giao: 'Đang giao', da_giao: 'Đã giao', hoan_thanh: 'Hoàn thành', huy: 'Đã huỷ', tra_hang: 'Trả hàng' };
