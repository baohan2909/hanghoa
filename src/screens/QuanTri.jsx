import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { Card, SecTit, Spinner, Empty, Tt, Toast, LopPhu } from '../components/ui'
import { IcCheck } from '../components/Icons'
import { gioVN, fmtSdt, ngayVN } from '../lib/format'

const NHAN_CFG = {
  han_goi_ngay: { nhan: 'Hạn gọi sau nhận hàng', dv: 'ngày' },
  so_lan_toi_da: { nhan: 'Số lần gọi tối đa', dv: 'lần' },
  nguong_tin_hieu_do: { nhan: 'Ngưỡng tín hiệu đỏ (trong 14 ngày)', dv: 'góp ý' },
  gop_cuoc_ngay: { nhan: 'Cửa sổ gộp cuộc gọi', dv: 'ngày' }
}

export default function QuanTri() {
  const [cfg, setCfg] = useState([])
  const [kg, setKg] = useState([])
  const [nk, setNk] = useState([])
  const [tai, setTai] = useState(true)
  const [sua, setSua] = useState({})          // { khoa: giá trị đang gõ }
  const [toast, setToast] = useState(null)
  const [anDanh, setAnDanh] = useState(false)

  useEffect(() => { taiDs() }, [])
  async function taiDs() {
    setTai(true)
    try {
      const [a, b, c] = await Promise.all([api.configLay(), api.khongGoiDs(), api.nhatKy(50)])
      setCfg(a || []); setKg(b || []); setNk(c || [])
    } catch (e) { console.error(e) } finally { setTai(false) }
  }

  async function luuCfg(khoa) {
    const gt = String(sua[khoa] ?? '').trim()
    if (!gt) return
    try {
      await api.configDat(khoa, gt)
      setToast({ msg: 'Đã lưu cấu hình' })
      setSua(s => { const n = { ...s }; delete n[khoa]; return n })
      taiDs()
    } catch (e) { setToast({ msg: e.message, kind: 'err' }) }
  }

  if (tai) return <Spinner />
  return (
    <>
      <div className="grid-2" style={{ marginTop: 0 }}>
        <Card className="pad">
          <SecTit phu="bấm số để sửa, Enter hoặc ✓ để lưu">Cấu hình hệ thống</SecTit>
          <div className="kv-list">
            {cfg.map(c => {
              const m = NHAN_CFG[c.khoa] || { nhan: c.mo_ta || c.khoa, dv: '' }
              const dangSua = sua[c.khoa] !== undefined
              return (
                <div className="kv" key={c.khoa}>
                  <div className="k">{m.nhan}</div>
                  {dangSua ?
                    <span className="cfg-sua">
                      <input autoFocus value={sua[c.khoa]}
                        onChange={e => setSua(s => ({ ...s, [c.khoa]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') luuCfg(c.khoa); if (e.key === 'Escape') setSua(s => { const n = { ...s }; delete n[c.khoa]; return n }) }} />
                      <button className="cfg-ok" onClick={() => luuCfg(c.khoa)}><IcCheck size={14} /></button>
                    </span> :
                    <span className="vbadge cfg-bam" title="Bấm để sửa"
                      onClick={() => setSua(s => ({ ...s, [c.khoa]: c.gia_tri }))}>
                      {c.gia_tri} {m.dv}</span>}
                </div>
              )
            })}
          </div>
        </Card>

        <Card className="pad">
          <SecTit phu="NĐ 13/2023">Danh sách không gọi</SecTit>
          {kg.length === 0 ? <div className="tin-rong">Trống — chưa có số nào bị chặn.</div> :
            <div className="kv-list">
              {kg.map(x => (
                <div className="kv" key={x.sdt}>
                  <div className="k">{fmtSdt(x.sdt)}<small>{x.ly_do} · {ngayVN(x.tao_luc)}</small></div>
                  <Tt cls="klh">Chặn gọi</Tt>
                </div>
              ))}
            </div>}
          <button className="btn-mini warn" style={{ marginTop: 14, width: '100%' }}
            onClick={() => setAnDanh(true)}>Ẩn danh dữ liệu một khách (theo yêu cầu)…</button>
        </Card>
      </div>

      <Card className="pad" style={{ marginTop: 16 }}>
        <SecTit phu="50 dòng gần nhất">Nhật ký hệ thống</SecTit>
        {nk.length === 0 ? <Empty text="Chưa có nhật ký" /> :
          <div className="tbl-wrap" style={{ boxShadow: 'none', border: 'none' }}>
            <table className="tbl">
              <thead><tr><th className="l">Thời điểm</th><th className="l">Bảng</th><th>Hành động</th><th className="l">Người thực hiện</th></tr></thead>
              <tbody>
                {nk.map((n, i) => (
                  <tr key={i} style={{ cursor: 'default' }}>
                    <td className="l">{gioVN(n.thoi_diem)}</td>
                    <td className="l">{n.bang}</td>
                    <td>{n.hanh_dong}</td>
                    <td className="l">{n.nguoi}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
      </Card>

      {anDanh && <AnDanhKhach onClose={() => setAnDanh(false)}
        onXong={(msg) => { setAnDanh(false); setToast({ msg }); taiDs() }} />}
      {toast && <Toast msg={toast.msg} kind={toast.kind} onHet={() => setToast(null)} />}
    </>
  )
}

/* Ẩn danh khách — không đảo ngược được, bắt gõ số xác nhận */
function AnDanhKhach({ onClose, onXong }) {
  const [sdt, setSdt] = useState('')
  const [xn, setXn] = useState('')
  const [loi, setLoi] = useState('')
  const [luu, setLuu] = useState(false)
  const khop = sdt.trim() && sdt.trim() === xn.trim()

  async function chay() {
    setLoi(''); setLuu(true)
    try {
      await api.anDanhKhach(sdt.trim())
      onXong('Đã ẩn danh dữ liệu khách ' + sdt.trim())
    } catch (e) { setLoi(e.message) } finally { setLuu(false) }
  }
  return (
    <LopPhu onClose={onClose} rong={440}>
      <div className="lp-dau" style={{ background: 'linear-gradient(135deg,#8E0047,#D6006C)' }}>
        <b>Ẩn danh dữ liệu khách</b><button className="lp-dong" onClick={onClose}>✕</button></div>
      <div className="lp-than">
        <div className="an-canh">Thao tác <b>không đảo ngược được</b>: tên và số điện thoại của khách
          sẽ bị xoá vĩnh viễn khỏi hệ thống, số bị chặn tạo phiếu mới. Ý kiến đã phân loại giữ lại
          ở dạng vô danh để phân tích.</div>
        <div className="nd-o" style={{ marginTop: 12 }}><label>Số điện thoại khách</label>
          <input value={sdt} onChange={e => setSdt(e.target.value)} placeholder="0909…" /></div>
        <div className="nd-o" style={{ marginTop: 10 }}><label>Gõ lại số để xác nhận</label>
          <input value={xn} onChange={e => setXn(e.target.value)} placeholder="Nhập lại đúng số trên" /></div>
        {loi && <div className="login-err" style={{ marginTop: 10 }}>{loi}</div>}
      </div>
      <div className="lp-chan">
        <button className="btn-ghost" onClick={onClose} type="button">Huỷ</button>
        <button className="btn-ai" style={{ background: 'linear-gradient(135deg,#8E0047,#D6006C)', boxShadow: '0 6px 18px rgba(214,0,108,.35)' }}
          disabled={!khop || luu} onClick={chay}>{luu ? 'Đang xử lý…' : 'Ẩn danh vĩnh viễn'}</button>
      </div>
    </LopPhu>
  )
}
