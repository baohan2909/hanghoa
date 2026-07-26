import { createContext, useContext, useState, useCallback } from 'react'
import { api } from '../lib/api'
import { luuPhien, layPhien, xoaPhien } from '../lib/session'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => layPhien())

  const dangNhap = useCallback(async (ma_nv, mat_khau) => {
    const p = await api.dangNhap(ma_nv, mat_khau)
    if (!p || !p.token) throw new Error('Sai mã nhân viên hoặc mật khẩu')
    const u = { token: p.token, ma_nv: p.ma_nv, ten: p.ten, vai_tro: p.vai_tro }
    luuPhien(u); setUser(u); return u
  }, [])

  const dangXuat = useCallback(async () => {
    try { await api.dangXuat() } catch {}
    xoaPhien(); setUser(null)
  }, [])

  const laQuyen = useCallback((min) => {
    const rank = { cham_soc: 1, quan_ly: 2, admin: 3 }
    return (rank[user?.vai_tro] || 0) >= (rank[min] || 1)
  }, [user])

  return <Ctx.Provider value={{ user, dangNhap, dangXuat, laQuyen }}>{children}</Ctx.Provider>
}
