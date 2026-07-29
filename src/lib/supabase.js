import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON } from '../config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON, {
  db: { schema: 'chiahang' },
  auth: { persistSession: false },
});

export const fmt = (n) => (n ?? 0).toLocaleString('vi-VN');
export const fmtVND = (n) => (n ? Number(n).toLocaleString('vi-VN') + 'đ' : '—');
export const fmtDT = (s) => s ? new Date(s).toLocaleString('vi-VN',
  { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

// Reason code -> câu tiếng Việt hiển thị cho nhân viên
export const LY_DO = {
  BAN_NHANH: 'Bán nhanh',
  BAN_HET: 'Đã bán hết',
  HET_HANG_GIUA_KY: 'Hết hàng giữa kỳ — tốc độ đã hiệu chỉnh',
  DU_TON_KHONG_CAP: 'Đủ tồn, chưa cần cấp',
  HANG_MOI_THEO_NHOM: 'Hàng mới — tính theo nhóm ngành',
  SO_LIEU_MONG_DUA_NHOM: 'Số liệu mỏng — dựa nhóm ngành',
  DANG_DI_DUONG: 'Có hàng đang đi đường',
  VUOT_MAX_DA_CAT: 'Vượt định mức tối đa — đã cắt',
  KHO_DANG_SAN: 'Kho tổng đang sẵn — đa dạng mẫu',
};
export const TRANG_THAI = {
  GUI: 'Đã gửi', DUYET: 'Điều phối can thiệp', XUAT_FILE: 'Đã xuất file',
  LEN_ODOO: 'Đã lên Odoo', KHO_NHAN: 'Kho đã tiếp nhận', KHO_LAY: 'Kho đã lấy',
  BAN_GIAO_VC: 'Bàn giao VC', DANG_GIAO: 'Đang giao', DA_NHAN: 'Đã nhận',
  HOAN: 'Hoàn', NHAP: 'Nháp',
};

// Gọi RPC lấy HẾT dữ liệu, tự phân trang chống giới hạn 1000 dòng của PostgREST.
// Dùng cho mọi RPC có thể trả > 1000 dòng.
export async function rpcHet(fn, args, trang = 1000) {
  let tat = [];
  for (let i = 0; i < 30; i++) {
    const { data, error } = await sb.rpc(fn, args).range(i * trang, (i + 1) * trang - 1);
    if (error) return { data: null, error };
    tat = tat.concat(data || []);
    if (!data || data.length < trang) break;
  }
  return { data: tat, error: null };
}
