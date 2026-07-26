import { supabase } from './supabase'
import { layToken, xoaPhien } from './session'

// Gọi hàm fn_* trên Supabase. Tự chèn p_token (trừ khi bỏ qua).
async function rpc(fn, args = {}, { token = true } = {}) {
  const params = { ...args }
  if (token) params.p_token = layToken()
  const { data, error } = await supabase.rpc(fn, params)
  if (error) {
    // Phiên hỏng -> đăng xuất để quay lại màn đăng nhập
    const msg = (error.message || '') + (error.details || '')
    if (/PHIEN_KHONG_HOP_LE|KHONG_DU_QUYEN/.test(msg)) {
      if (/PHIEN_KHONG_HOP_LE/.test(msg)) { xoaPhien(); location.reload() }
    }
    throw new Error(viLoi(error.message) || 'Có lỗi xảy ra')
  }
  return data
}

// Dịch mã lỗi ra tiếng Việt
function viLoi(m = '') {
  const map = {
    SAI_TAI_KHOAN_MAT_KHAU: 'Sai mã nhân viên hoặc mật khẩu',
    SDT_KHONG_HOP_LE: 'Số điện thoại không hợp lệ',
    SDT_TRONG_DANH_SACH_KHONG_GOI: 'Số này nằm trong danh sách không gọi',
    KHONG_DU_QUYEN: 'Bạn không đủ quyền thực hiện',
    KHONG_THAY_PHIEU: 'Không tìm thấy phiếu',
    KHONG_THAY_KHACH: 'Không tìm thấy khách',
    BO_DA_PHAT_HANH_KHONG_SUA_DUOC: 'Bộ câu hỏi đã phát hành, không sửa được'
  }
  for (const k in map) if (m.includes(k)) return map[k]
  return m
}

export const api = {
  // --- Auth ---
  async dangNhap(ma_nv, mat_khau) {
    const rows = await rpc('fn_dangnhap', { p_ma_nv: ma_nv, p_mat_khau: mat_khau }, { token: false })
    return Array.isArray(rows) ? rows[0] : rows
  },
  dangXuat: () => rpc('fn_dangxuat', {}),

  // --- Danh mục ---
  spTim: (tu_khoa) => rpc('fn_sp_tim', { p_tu_khoa: tu_khoa }),

  // --- Nhập đơn / phiếu ---
  nhapDon: (p) => rpc('fn_nhap_don', {
    p_sdt: p.sdt, p_ten: p.ten, p_kenh_ma: p.kenh_ma,
    p_ngay_nhan: p.ngay_nhan, p_sanpham: p.sanpham, p_gop: p.gop ?? true
  }),
  hangDoi: (trang_thai = null, tu_khoa = null) =>
    rpc('fn_hangdoi', { p_trang_thai: trang_thai, p_tu_khoa: tu_khoa }),
  phieu: (id) => rpc('fn_phieu', { p_phieu_id: id }),
  khach360: (sdt) => rpc('fn_khach_360', { p_sdt: sdt }),

  ghiLienHe: (p) => rpc('fn_ghi_lienhe', {
    p_phieu_id: p.phieu_id, p_ket_qua: p.ket_qua,
    p_kenh: p.kenh || 'goi', p_hen_luc: p.hen_luc || null, p_ghi_chu: p.ghi_chu || null
  }),
  luuTraLoi: (p) => rpc('fn_luu_traloi', {
    p_phieu_id: p.phieu_id, p_tra_loi: p.tra_loi || [],
    p_y_kien: p.y_kien || [], p_diem_neo: p.diem_neo ?? null,
    p_dong_y: p.dong_y ?? null, p_hoan_tat: p.hoan_tat ?? true
  }),

  // --- Tổng quan / phân tích ---
  tongQuan: () => rpc('fn_tong_quan', {}),
  tinHieuDo: () => rpc('fn_tin_hieu_do', {}),
  khungGio: () => rpc('fn_khung_gio', {}),
  phanTich: (p = {}) => rpc('fn_phan_tich', {
    p_tu: p.tu || null, p_den: p.den || null, p_dong: p.dong || null,
    p_nhom: p.nhom || null, p_sac_thai: p.sac_thai || null
  }),

  // --- Bộ câu hỏi ---
  bocauhoiDs: () => rpc('fn_bocauhoi_ds', {}),
  bocauhoiChitiet: (id) => rpc('fn_bocauhoi_chitiet', { p_id: id }),
  bocauhoiTao: (ten, ap_dung, loi_mo) =>
    rpc('fn_bocauhoi_tao', { p_ten: ten, p_ap_dung: ap_dung || 'tat_ca', p_loi_mo: loi_mo || null }),
  cauhoiLuu: (bo_id, cau_hoi) => rpc('fn_cauhoi_luu', { p_bo_id: bo_id, p_cau_hoi: cau_hoi }),
  bocauhoiPhatHanh: (id) => rpc('fn_bocauhoi_phathanh', { p_id: id }),
  bocauhoiBanMoi: (id) => rpc('fn_bocauhoi_ban_moi', { p_id: id }),

  // --- Quản trị ---
  configLay: () => rpc('fn_config_lay', {}),
  configDat: (khoa, gt) => rpc('fn_config_dat', { p_khoa: khoa, p_gia_tri: gt }),
  khongGoiDs: () => rpc('fn_khong_goi_ds', {}),
  anDanhKhach: (sdt) => rpc('fn_an_danh_khach', { p_sdt: sdt }),
  nhatKy: (gh = 100) => rpc('fn_nhat_ky', { p_gioi_han: gh })
}
