import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { Card, StatBig, SecTit, Spinner, Tt } from '../components/ui'
import { NHOM_YK } from '../lib/format'

export default function TongQuan({ moHangDoi }) {
  const [tq, setTq] = useState(null)
  const [tin, setTin] = useState([])
  const [gio, setGio] = useState([])
  const [tai, setTai] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const [a, b, c] = await Promise.all([api.tongQuan(), api.tinHieuDo(), api.khungGio()])
        setTq(a || {}); setTin(b || []); setGio(c || [])
      } catch (e) { console.error(e) } finally { setTai(false) }
    })()
  }, [])

  if (tai) return <Spinner />
  const yk = tq?.y_kien_theo_nhom || {}
  const ykMax = Math.max(1, ...Object.values(yk).map(Number))
  const gioMax = Math.max(1, ...gio.map(g => Number(g.ty_le) || 0))

  return (
    <>
      <div className="row4">
        <div className="tq-bam" onClick={() => moHangDoi?.('cho')}>
          <StatBig nhan="Chờ gọi hôm nay" so={tq?.cho_goi_hom_nay ?? 0}
            delta={{ kind: 'tang', text: 'Bấm để mở hàng đợi' }} /></div>
        <div className="tq-bam" onClick={() => moHangDoi?.('qua')}>
          <StatBig nhan="Quá hạn chưa gọi" so={tq?.qua_han ?? 0} canhBao
            delta={{ kind: 'giam', text: (tq?.qua_han > 0 ? 'Cần xử lý gấp — bấm mở' : 'Ổn định') }} /></div>
        <StatBig nhan="Nhấc máy 30N" so={tq?.ty_le_thanh_cong ?? 0} don="%" />
        <StatBig nhan="Điểm hài lòng TB" so={tq?.diem_neo_tb ?? '—'} don="/5" />
      </div>

      <div className="grid-2">
        <Card className="tin-do pad">
          <div className="hd"><span className="pulse" /><h3>Tín hiệu đỏ</h3>
            <span className="cnt">{tin.length} dòng vượt ngưỡng</span></div>
          {tin.length === 0 && <div className="tin-rong">Chưa có tín hiệu đỏ nào — tốt.</div>}
          {tin.map((t, i) => (
            <div className="tin-row" key={i}>
              <div className="d">Dòng {t.dong_sp} · {NHOM_YK[t.nhom] || t.nhom}
                <small>{t.so_lan} góp ý trong 14 ngày{t.vi_du ? ` — "${t.vi_du}"` : ''}</small></div>
              <span className="tin-badge">×{t.so_lan}</span>
            </div>
          ))}
        </Card>

        <Card className="pad">
          <SecTit phu="tỉ lệ nhấc máy theo giờ">Khung giờ vàng</SecTit>
          {gio.length === 0 ? <div className="tin-rong">Chưa đủ dữ liệu cuộc gọi.</div> :
            <div className="kgv">
              {gio.map(g => {
                const p = Number(g.ty_le) || 0
                return (
                  <div className="col" key={g.gio}>
                    <span className="p">{p}%</span>
                    <div className={'bar' + (p >= gioMax * 0.9 ? ' hot' : '')}
                         style={{ height: Math.max(6, (p / gioMax) * 100) + '%' }} />
                    <span className="h">{g.gio}h</span>
                  </div>
                )
              })}
            </div>}
        </Card>
      </div>

      <div className="grid-2">
        <Card className="pad">
          <SecTit phu="theo nhóm chủ đề">Ý kiến 30 ngày</SecTit>
          <div className="yk">
            {Object.keys(yk).length === 0 && <div className="tin-rong">Chưa có ý kiến nào.</div>}
            {Object.entries(yk).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
              <div className="r" key={k}>
                <span className="nm">{NHOM_YK[k] || k}</span>
                <div className="track"><div className="fill" style={{ width: (v / ykMax * 100) + '%' }} /></div>
                <span className="v">{v}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="pad">
          <SecTit phu="30 ngày">Kết quả chăm sóc</SecTit>
          <div className="kv-list">
            <div className="kv"><div className="k">Hoàn tất</div><Tt cls="done">{tq?.hoan_tat_30 ?? 0} phiếu</Tt></div>
            <div className="kv"><div className="k">Chờ gọi hôm nay</div><Tt cls="cho">{tq?.cho_goi_hom_nay ?? 0} phiếu</Tt></div>
            <div className="kv"><div className="k">Quá hạn</div><Tt cls="qhan">{tq?.qua_han ?? 0} phiếu</Tt></div>
          </div>
        </Card>
      </div>
    </>
  )
}
