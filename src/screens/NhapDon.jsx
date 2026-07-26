import { useState } from 'react'
import { api } from '../lib/api'
import { LopPhu, Toast } from '../components/ui'
import { IcSearch, IcPlus, IcCheck } from '../components/Icons'
import { isoVN } from '../lib/format'

const KENH = [
  { ma: 'live', ten: 'Livestream' }, { ma: 'web', ten: 'Website' },
  { ma: 'shopee', ten: 'Shopee' }, { ma: 'tiktok', ten: 'TikTok Shop' },
  { ma: 'cuahang', ten: 'Cửa hàng' }
]

export default function NhapDon({ onClose, onXong }) {
  const [sdt, setSdt] = useState('')
  const [ten, setTen] = useState('')
  const [kenh, setKenh] = useState('live')
  const [ngayNhan, setNgayNhan] = useState(isoVN())
  const [tuKhoa, setTuKhoa] = useState('')
  const [kq, setKq] = useState([])
  const [chon, setChon] = useState([])   // [{ma_sp, ten, so_luong}]
  const [luu, setLuu] = useState(false)
  const [toast, setToast] = useState(null)

  async function timSp() {
    if (tuKhoa.trim().length < 2) return
    try { setKq(await api.spTim(tuKhoa.trim()) || []) } catch (e) { setToast({ msg: e.message, kind: 'err' }) }
  }
  function themSp(s) {
    if (chon.some(x => x.ma_sp === s.ma_sp)) return
    setChon(c => [...c, { ma_sp: s.ma_sp, ten: s.ten, so_luong: 1 }])
    setKq([]); setTuKhoa('')
  }

  async function luuDon() {
    if (!sdt.trim() || chon.length === 0) { setToast({ msg: 'Cần số điện thoại và ít nhất 1 sản phẩm', kind: 'err' }); return }
    setLuu(true)
    try {
      const r = await api.nhapDon({
        sdt: sdt.trim(), ten: ten.trim() || null, kenh_ma: kenh, ngay_nhan: ngayNhan,
        sanpham: chon.map(c => ({ ma: c.ma_sp, so_luong: c.so_luong })), gop: true
      })
      const row = Array.isArray(r) ? r[0] : r
      setToast({ msg: row?.canh_bao || 'Đã tạo phiếu chăm sóc' })
      setTimeout(() => { onXong?.(); onClose() }, 700)
    } catch (e) { setToast({ msg: e.message, kind: 'err' }) } finally { setLuu(false) }
  }

  return (
    <LopPhu onClose={onClose} rong={560}>
      <div className="lp-dau"><b>Nhập đơn mới</b><span className="lp-phu">Tạo phiếu chăm sóc sau mua</span>
        <button className="lp-dong" onClick={onClose}>✕</button></div>
      <div className="lp-than">
        <div className="nd-hang">
          <div className="nd-o"><label>Số điện thoại *</label>
            <input value={sdt} onChange={e => setSdt(e.target.value)} placeholder="0909…" /></div>
          <div className="nd-o"><label>Tên khách</label>
            <input value={ten} onChange={e => setTen(e.target.value)} placeholder="(tuỳ chọn)" /></div>
        </div>
        <div className="nd-hang">
          <div className="nd-o"><label>Kênh mua</label>
            <select value={kenh} onChange={e => setKenh(e.target.value)}>
              {KENH.map(k => <option key={k.ma} value={k.ma}>{k.ten}</option>)}
            </select></div>
          <div className="nd-o"><label>Ngày nhận hàng</label>
            <input type="date" value={ngayNhan} onChange={e => setNgayNhan(e.target.value)} /></div>
        </div>

        <label className="nd-lb">Sản phẩm</label>
        <div className="nd-tim">
          <div className="search"><IcSearch size={16} />
            <input value={tuKhoa} onChange={e => setTuKhoa(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), timSp())}
              placeholder="Gõ mã / barcode / tên rồi Enter…" /></div>
          <button className="btn-ghost" onClick={timSp} type="button">Tìm</button>
        </div>
        {kq.length > 0 &&
          <div className="nd-kq">
            {kq.map(s => (
              <div className="nd-kq-i" key={s.ma_sp} onClick={() => themSp(s)}>
                <div><b>{s.ten || s.ma_sp}</b><span>{s.ma_sp}</span></div>
                <IcPlus size={16} />
              </div>
            ))}
          </div>}
        {chon.length > 0 &&
          <div className="nd-chon">
            {chon.map((c, i) => (
              <div className="nd-chon-i" key={c.ma_sp}>
                <div className="t">{c.ten || c.ma_sp}<span>{c.ma_sp}</span></div>
                <input className="nd-sl" type="number" min="1" value={c.so_luong}
                  onChange={e => setChon(a => a.map((x, j) => j === i ? { ...x, so_luong: +e.target.value || 1 } : x))} />
                <button className="nd-xoa" onClick={() => setChon(a => a.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
          </div>}
      </div>
      <div className="lp-chan">
        <button className="btn-ghost" onClick={onClose} type="button">Huỷ</button>
        <button className="btn-ai" disabled={luu} onClick={luuDon}><IcCheck size={16} />{luu ? 'Đang lưu…' : 'Tạo phiếu'}</button>
      </div>
      {toast && <Toast msg={toast.msg} kind={toast.kind} />}
    </LopPhu>
  )
}
