import { useState } from 'react'
import { api } from '../lib/api'
import { Card, SecTit, Spinner, Empty, Tt } from '../components/ui'
import { IcSearch } from '../components/Icons'
import { ngayVN, fmtSdt, ttPhieu, NHOM_YK, SAC_THAI } from '../lib/format'

export default function Khach360() {
  const [sdt, setSdt] = useState('')
  const [d, setD] = useState(null)
  const [tai, setTai] = useState(false)
  const [loi, setLoi] = useState('')

  async function tim(e) {
    e?.preventDefault()
    if (!sdt.trim()) return
    setTai(true); setLoi(''); setD(null)
    try { setD(await api.khach360(sdt.trim())) }
    catch (err) { setLoi(err.message) } finally { setTai(false) }
  }

  const k = d?.khach, dons = d?.don || [], yks = d?.y_kien || []
  return (
    <>
      <form className="toolbar" onSubmit={tim}>
        <div className="search" style={{ minWidth: 320 }}>
          <IcSearch size={16} />
          <input value={sdt} onChange={e => setSdt(e.target.value)} placeholder="Tra cứu khách theo số điện thoại…" />
        </div>
        <button className="btn-ai">Tra cứu</button>
      </form>

      {tai && <Spinner />}
      {loi && <Empty text={loi} />}
      {k &&
        <div className="phieu-grid">
          <div>
            <Card className="pad" style={{ marginBottom: 16 }}>
              <div className="kh-head" style={{ border: 'none', paddingBottom: 0 }}>
                <div className="av" style={{ width: 54, height: 54, fontSize: 22 }}>{(k.ten || 'K').slice(0, 1).toUpperCase()}</div>
                <div><div className="nm" style={{ fontSize: 18 }}>{k.ten || '(chưa có tên)'}</div>
                  <div className="sdt">{fmtSdt(k.sdt)}</div></div>
              </div>
            </Card>
            <SecTit phu={`${dons.length} đơn`}>Lịch sử đơn hàng</SecTit>
            {dons.length === 0 ? <Empty text="Chưa có đơn" /> :
              <div className="tbl-wrap"><table className="tbl">
                <thead><tr><th className="l">Ngày nhận</th><th className="l">Sản phẩm</th><th>Điểm neo</th><th>Trạng thái CS</th></tr></thead>
                <tbody>
                  {dons.map((o, i) => {
                    const tt = ttPhieu(o.phieu?.trang_thai)
                    const sp = (o.san_pham || []).map(s => s.ten_sp).filter(Boolean).join(', ')
                    return (
                      <tr key={i}>
                        <td className="l">{ngayVN(o.don?.ngay_nhan)}</td>
                        <td className="l">{sp || '—'}</td>
                        <td className="num">{o.phieu?.diem_neo ?? '—'}</td>
                        <td><span className={'tt ' + tt.cls}>{tt.nhan}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table></div>}
          </div>
          <div>
            <Card className="side-card">
              <SecTit>Ý kiến đã ghi nhận</SecTit>
              {yks.length === 0 ? <div className="tin-rong">Chưa có ý kiến.</div> :
                yks.map((y, i) => {
                  const st = SAC_THAI[y.sac_thai] || { nhan: y.sac_thai, cls: 'cho' }
                  return (
                    <div className="tin-row" key={i} style={i === 0 ? { borderTop: 'none', paddingTop: 0 } : {}}>
                      <div className="d">{NHOM_YK[y.nhom] || y.nhom}<small>{y.noi_dung}</small></div>
                      <span className={'tt ' + st.cls}>{st.nhan}</span>
                    </div>
                  )
                })}
            </Card>
          </div>
        </div>}
    </>
  )
}
