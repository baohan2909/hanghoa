import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { dangNhap } = useAuth()
  const [maNv, setMaNv] = useState('')
  const [mk, setMk] = useState('')
  const [loi, setLoi] = useState('')
  const [dang, setDang] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setLoi(''); setDang(true)
    try { await dangNhap(maNv.trim(), mk) }
    catch (err) { setLoi(err.message || 'Đăng nhập thất bại') }
    finally { setDang(false) }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo"><div className="mark">NS</div><b>NS CARE</b></div>
        <p className="login-sub">Hệ thống chăm sóc khách hàng sau mua</p>
        <div className="field">
          <label>Mã nhân viên</label>
          <input autoFocus value={maNv} onChange={e => setMaNv(e.target.value)} placeholder="VD: NS00490" />
        </div>
        <div className="field">
          <label>Mật khẩu</label>
          <input type="password" value={mk} onChange={e => setMk(e.target.value)} placeholder="••••••••" />
        </div>
        {loi && <div className="login-err">{loi}</div>}
        <button className="btn-ai full" style={{ marginTop: 18 }} disabled={dang}>
          {dang ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
      </form>
    </div>
  )
}
