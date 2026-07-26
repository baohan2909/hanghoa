import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { Card, SecTit, Spinner, Empty } from '../components/ui'
import { IcDown } from '../components/Icons'
import { NHOM_YK, SAC_THAI, isoVN } from '../lib/format'

const KHOANG = [
  { id: '7', nhan: '7 ngày' },
  { id: '30', nhan: '30 ngày' },
  { id: '90', nhan: '90 ngày' },
  { id: 'all', nhan: 'Tất cả' }
]

export default function PhanTich() {
  const [rows, setRows] = useState([])
  const [tai, setTai] = useState(true)
  const [khoang, setKhoang] = useState('30')
  const [nhom, setNhom] = useState('')
  const [sacThai, setSacThai] = useState('')

  useEffect(() => { taiDs() }, [khoang, nhom, sacThai])
  async function taiDs() {
    setTai(true)
    try {
      const tu = khoang === 'all' ? null
        : isoVN(new Date(Date.now() - Number(khoang) * 86400000))
      setRows(await api.phanTich({ tu, nhom: nhom || null, sac_thai: sacThai || null }) || [])
    } catch (e) { console.error(e) } finally { setTai(false) }
  }

  // Gộp theo dòng SP (bar) + theo nhóm (bar phải) + tổng sắc thái
  const { dongArr, dongMax, nhomArr, nhomMax, tongSac, tong } = useMemo(() => {
    const tDong = {}, tNhom = {}, tSac = { khen: 0, trung_lap: 0, gop_y: 0 }
    rows.forEach(r => {
      const n = Number(r.so_luong) || 0
      const d = r.dong_sp || '(không rõ)'
      tDong[d] = (tDong[d] || 0) + n
      tNhom[r.nhom] = (tNhom[r.nhom] || 0) + n
      tSac[r.sac_thai] = (tSac[r.sac_thai] || 0) + n
    })
    const dA = Object.entries(tDong).sort((a, b) => b[1] - a[1]).slice(0, 10)
    const nA = Object.entries(tNhom).sort((a, b) => b[1] - a[1])
    return {
      dongArr: dA, dongMax: Math.max(1, ...dA.map(x => x[1])),
      nhomArr: nA, nhomMax: Math.max(1, ...nA.map(x => x[1])),
      tongSac: tSac, tong: Object.values(tSac).reduce((a, b) => a + b, 0) || 1
    }
  }, [rows])

  function xuatCSV() {
    const bom = '\uFEFF'
    const head = ['Dòng sản phẩm', 'Nhóm', 'Sắc thái', 'Số lượng']
    const lines = rows.map(r => [
      r.dong_sp || '', NHOM_YK[r.nhom] || r.nhom,
      SAC_THAI[r.sac_thai]?.nhan || r.sac_thai, r.so_luong
    ].map(x => '"' + String(x).replace(/"/g, '""') + '"').join(','))
    const blob = new Blob([bom + head.join(',') + '\n' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = 'phan-tich-y-kien.csv'
    a.click(); URL.revokeObjectURL(a.href)
  }

  return (
    <>
      <div className="toolbar">
        {KHOANG.map(k => (
          <div key={k.id} className={'nhom-tab' + (khoang === k.id ? ' on' : '')}
               onClick={() => setKhoang(k.id)}>{k.nhan}</div>
        ))}
        <div className="sp" />
        <select className="sel-kenh" value={nhom} onChange={e => setNhom(e.target.value)}>
          <option value="">Nhóm: Tất cả</option>
          {Object.entries(NHOM_YK).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="sel-kenh" value={sacThai} onChange={e => setSacThai(e.target.value)}>
          <option value="">Sắc thái: Tất cả</option>
          {Object.entries(SAC_THAI).map(([k, v]) => <option key={k} value={k}>{v.nhan}</option>)}
        </select>
        <button className="btn-ghost" onClick={xuatCSV}><IcDown size={15} />Xuất Excel</button>
      </div>

      {tai ? <Spinner /> : rows.length === 0 ? <Empty text="Chưa có ý kiến trong phạm vi lọc" /> : <>
        <div className="row4" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <div className="tq-lon"><div className="tq-lon-nhan">Khen</div>
            <div className="tq-lon-so" style={{ color: 'var(--green)' }}>{Math.round(tongSac.khen / tong * 100)}<i>%</i></div>
            <span className="tq-delta tang">{tongSac.khen} ý kiến</span></div>
          <div className="tq-lon"><div className="tq-lon-nhan">Trung lập</div>
            <div className="tq-lon-so" style={{ color: 'var(--teal-deep)' }}>{Math.round(tongSac.trung_lap / tong * 100)}<i>%</i></div>
            <span className="tq-delta tang" style={{ color: 'var(--teal-deep)' }}>{tongSac.trung_lap} ý kiến</span></div>
          <div className="tq-lon canh-bao"><div className="tq-lon-nhan">Góp ý</div>
            <div className="tq-lon-so">{Math.round(tongSac.gop_y / tong * 100)}<i>%</i></div>
            <span className="tq-delta giam">{tongSac.gop_y} ý kiến</span></div>
        </div>

        <div className="grid-2">
          <Card className="pad">
            <SecTit phu="top 10">Ý kiến theo dòng sản phẩm</SecTit>
            {dongArr.map(([dong, v]) => (
              <div className="pt-r" key={dong}>
                <div className="hd"><span>{dong}</span><b>{v}</b></div>
                <div className="kt-bar">
                  <div className="kt-fill" style={{ width: (v / dongMax * 100) + '%' }}>
                    <div className="kt-song" /><span className="kt-pct">{v}</span>
                  </div>
                </div>
              </div>
            ))}
          </Card>
          <Card className="pad">
            <SecTit>Ý kiến theo nhóm chủ đề</SecTit>
            <div className="yk">
              {nhomArr.map(([k, v]) => (
                <div className="r" key={k}>
                  <span className="nm">{NHOM_YK[k] || k}</span>
                  <div className="track"><div className="fill" style={{ width: (v / nhomMax * 100) + '%' }} /></div>
                  <span className="v">{v}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card className="pad" style={{ marginTop: 16 }}>
          <SecTit phu="chi tiết dòng × nhóm × sắc thái">Bảng chi tiết</SecTit>
          <div className="tbl-wrap" style={{ boxShadow: 'none', border: 'none' }}>
            <table className="tbl">
              <thead><tr><th className="l">Dòng SP</th><th>Nhóm</th><th>Sắc thái</th><th>Số lượng</th></tr></thead>
              <tbody>
                {rows.map((r, i) => {
                  const st = SAC_THAI[r.sac_thai] || { nhan: r.sac_thai, cls: 'cho' }
                  return (
                    <tr key={i} style={{ cursor: 'default' }}>
                      <td className="l"><b>{r.dong_sp || '(không rõ)'}</b></td>
                      <td>{NHOM_YK[r.nhom] || r.nhom}</td>
                      <td><span className={'tt ' + st.cls}>{st.nhan}</span></td>
                      <td className="num">{r.so_luong}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </>}
    </>
  )
}
