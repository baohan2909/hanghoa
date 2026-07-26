import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { IcDash, IcPhone, IcUser, IcChart, IcForm, IcGear, IcChevL, IcOut, IcDown } from './Icons'

const NHOM = [
  { g: 'Chăm sóc', items: [
    { id: 'tq', nhan: 'Tổng quan', Ic: IcDash },
    { id: 'hd', nhan: 'Hàng đợi chăm sóc', Ic: IcPhone, badgeKey: 'hangDoi' },
    { id: 'kh', nhan: 'Khách hàng 360°', Ic: IcUser }
  ]},
  { g: 'Phân tích', items: [
    { id: 'pt', nhan: 'Phân tích ý kiến', Ic: IcChart, min: 'quan_ly' }
  ]},
  { g: 'Thiết lập', items: [
    { id: 'bo', nhan: 'Bộ câu hỏi', Ic: IcForm, min: 'quan_ly' },
    { id: 'admin', nhan: 'Quản trị', Ic: IcGear, min: 'admin' }
  ]}
]

export default function Sidebar({ man, setMan, badges = {} }) {
  const [gon, setGon] = useState(false)
  const [caiDat, setCaiDat] = useState(null)   // sự kiện beforeinstallprompt
  const { user, dangXuat, laQuyen } = useAuth()
  const active = man === 'phieu' ? 'hd' : man

  useEffect(() => {
    const h = (e) => { e.preventDefault(); setCaiDat(e) }
    window.addEventListener('beforeinstallprompt', h)
    return () => window.removeEventListener('beforeinstallprompt', h)
  }, [])

  async function taiApp() {
    if (caiDat) { caiDat.prompt(); setCaiDat(null); return }
    // iPhone/Safari không có prompt — hướng dẫn
    alert('Trên iPhone: bấm nút Chia sẻ (ô vuông mũi tên) ▸ "Thêm vào MH chính" để cài NS CARE như ứng dụng.')
  }

  return (
    <aside className={'sidebar' + (gon ? ' gon' : '')}>
      <button className="side-toggle" onClick={() => setGon(g => !g)} title="Thu gọn">
        <IcChevL size={14} style={{ transform: gon ? 'rotate(180deg)' : 'none' }} />
      </button>
      <div className="side-logo">
        <div className="mark">NS</div>
        <div className="tx"><div className="t">NS CARE</div><div className="s">Chăm sóc sau mua</div></div>
      </div>

      <nav className="side-nav">
        {NHOM.map(nh => {
          const items = nh.items.filter(it => !it.min || laQuyen(it.min))
          if (!items.length) return null
          return (
            <div key={nh.g}>
              <div className="side-group">{nh.g}</div>
              {items.map(it => (
                <div key={it.id}
                     className={'side-item' + (active === it.id ? ' on' : '')}
                     onClick={() => setMan(it.id)}>
                  <it.Ic size={19} />
                  <span className="side-txt">{it.nhan}</span>
                  {it.badgeKey && badges[it.badgeKey] > 0 &&
                    <span className="badge-dot">{badges[it.badgeKey]}</span>}
                </div>
              ))}
            </div>
          )
        })}
      </nav>

      <button className="side-install" onClick={taiApp}>
        <IcDown size={15} /><span className="side-txt">Tải ứng dụng</span>
      </button>

      <div className="side-user">
        <div className="av">{(user?.ten || 'A').slice(0, 1).toUpperCase()}</div>
        <div className="tx">
          <div className="n">{user?.ten || user?.ma_nv}</div>
          <div className="r">{user?.ma_nv} · {vaiTro(user?.vai_tro)}</div>
        </div>
        <button className="side-out-ic" onClick={dangXuat} title="Đăng xuất"><IcOut size={16} /></button>
      </div>
    </aside>
  )
}
function vaiTro(v) { return ({ admin: 'Quản trị', quan_ly: 'Quản lý', cham_soc: 'Chăm sóc' })[v] || v }
