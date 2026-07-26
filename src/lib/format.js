// Helpers hiển thị

// Ngày ISO theo giờ VN (tránh lệch UTC như bài học bên NS FLOW)
export function isoVN(d = new Date()) {
  const t = new Date(d.getTime() + 7 * 3600 * 1000)
  return t.toISOString().slice(0, 10)
}

// dd/mm/yyyy
export function ngayVN(s) {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d)) return s
  const t = new Date(d.getTime() + 7 * 3600 * 1000)
  return t.toISOString().slice(0, 10).split('-').reverse().join('/')
}

// dd/mm HH:MM
export function gioVN(s) {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d)) return s
  const t = new Date(d.getTime() + 7 * 3600 * 1000)
  const i = t.toISOString()
  return i.slice(8, 10) + '/' + i.slice(5, 7) + ' ' + i.slice(11, 16)
}

// 0909 123 456
export function fmtSdt(s) {
  if (!s) return ''
  const x = String(s).replace(/\D/g, '')
  if (x.length === 10) return x.replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3')
  return s
}

// Nhãn + màu trạng thái phiếu
export const TT = {
  cho_lien_he:         { nhan: 'Chờ liên hệ',        cls: 'cho'  },
  dang_lien_he:        { nhan: 'Đang liên hệ',       cls: 'dang' },
  hen_goi_lai:         { nhan: 'Hẹn gọi lại',        cls: 'hen'  },
  khong_lien_lac_duoc: { nhan: 'Không liên lạc được', cls: 'klh' },
  tu_choi:             { nhan: 'Từ chối',            cls: 'klh'  },
  hoan_tat:            { nhan: 'Hoàn tất',           cls: 'done' }
}
export function ttPhieu(t, quaHan) {
  if (quaHan) return { nhan: 'Quá hạn', cls: 'qhan' }
  return TT[t] || { nhan: t || '—', cls: 'cho' }
}

// Nhãn kết quả liên hệ
export const KETQUA = {
  thanh_cong: 'Kết nối thành công',
  khong_nghe: 'Không nghe máy',
  hen_lai:    'Khách hẹn gọi lại',
  sai_so:     'Sai số / không đúng người',
  tu_choi:    'Khách từ chối'
}

// Nhãn nhóm ý kiến
export const NHOM_YK = {
  san_pham: 'Sản phẩm', thiet_ke: 'Thiết kế', chat_lieu: 'Chất liệu',
  dong_goi: 'Đóng gói', van_chuyen: 'Vận chuyển', gia: 'Giá',
  livestream: 'Livestream', dich_vu: 'Dịch vụ', khac: 'Khác'
}
export const SAC_THAI = {
  khen: { nhan: 'Khen', cls: 'done' },
  trung_lap: { nhan: 'Trung lập', cls: 'cho' },
  gop_y: { nhan: 'Góp ý', cls: 'hen' }
}
