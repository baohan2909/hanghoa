// Lưu phiên đăng nhập (token + hồ sơ) ở localStorage.
const KEY = 'nscare_auth'

export function luuPhien(p) { localStorage.setItem(KEY, JSON.stringify(p)) }
export function layPhien() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null }
}
export function xoaPhien() { localStorage.removeItem(KEY) }
export function layToken() { return layPhien()?.token || null }
