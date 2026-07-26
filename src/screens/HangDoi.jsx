import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { Spinner, Empty } from '../components/ui'
import { IcSearch, IcDown, IcBox, IcStar, IcPhone } from '../components/Icons'
import { ttPhieu, ngayVN, fmtSdt } from '../lib/format'

const TABS = [
  { id: 'all', nhan: 'Tất cả' },
  { id: 'qua', nhan: 'Quá hạn' },
  { id: 'cho', nhan: 'Chờ gọi' },
  { id: 'hen', nhan: 'Hẹn lại' }
]

export default function HangDoi({ moPhieu, tabDau }) {
  const [rows, setRows] = useState([])
  const [tai, setTai] = useState(true)
  const [tab, setTab] = useState(tabDau || 'all')
  const [kenh, setKenh] = useState('')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState({ key: 'han_lien_he', dir: 'asc' })

  useEffect(() => {
    (async () => {
      try { setRows(await api.hangDoi() || []) } catch (e) { console.error(e) } finally { setTai(false) }
    })()
  }, [])

  const dsKenh = useMemo(() => [...new Set(rows.map(r => r.kenh).filter(Boolean))], [rows])
  const dem = useMemo(() => ({
    all: rows.length,
    qua: rows.filter(r => r.qua_han).length,
    cho: rows.filter(r => r.trang_thai === 'cho_lien_he').length,
    hen: rows.filter(r => r.trang_thai === 'hen_goi_lai').length
  }), [rows])

  const hien = useMemo(() => {
    let r = rows
    if (tab === 'qua') r = r.filter(x => x.qua_han)
    else if (tab === 'cho') r = r.filter(x => x.trang_thai === 'cho_lien_he')
    else if (tab === 'hen') r = r.filter(x => x.trang_thai === 'hen_goi_lai')
    if (kenh) r = r.filter(x => x.kenh === kenh)
    if (q.trim()) {
      const s = q.trim().toLowerCase()
      r = r.filter(x => (x.ten_kh || '').toLowerCase().includes(s) || (x.sdt || '').includes(s))
    }
    const { key, dir } = sort
    return [...r].sort((a, b) => {
      let va = a[key] ?? '', vb = b[key] ?? ''
      return (va > vb ? 1 : va < vb ? -1 : 0) * (dir === 'asc' ? 1 : -1)
    })
  }, [rows, tab, kenh, q, sort])

  const doSort = (key) => setSort(s => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))
  const arrow = (key) => sort.key === key ? (sort.dir === 'asc' ? '▲' : '▼') : '▾'

  function xuatCSV() {
    const bom = '\uFEFF'
    const head = ['Khách hàng', 'SĐT', 'Sản phẩm', 'Kênh', 'Trạng thái', 'Hạn gọi', 'Số lần']
    const lines = hien.map(r => [
      r.ten_kh || '', r.sdt || '', (r.ten_sp_dau || '') + (r.so_sp > 1 ? ' +' + (r.so_sp - 1) : ''),
      r.kenh || '', ttPhieu(r.trang_thai, r.qua_han).nhan, ngayVN(r.han_lien_he), r.so_lan || 0
    ].map(x => '"' + String(x).replace(/"/g, '""') + '"').join(','))
    const blob = new Blob([bom + head.join(',') + '\n' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'hang-doi-cham-soc.csv'
    a.click(); URL.revokeObjectURL(a.href)
  }

  if (tai) return <Spinner />
  return (
    <>
      <div className="toolbar">
        {TABS.map(t => (
          <div key={t.id} className={'nhom-tab' + (tab === t.id ? ' on' : '')} onClick={() => setTab(t.id)}>
            {t.nhan}<span className="nhom-badge">{dem[t.id]}</span>
          </div>
        ))}
        <div className="sp" />
        {dsKenh.length > 0 &&
          <select className="sel-kenh" value={kenh} onChange={e => setKenh(e.target.value)}>
            <option value="">Kênh: Tất cả</option>
            {dsKenh.map(k => <option key={k} value={k}>{k}</option>)}
          </select>}
        <div className="search">
          <IcSearch size={16} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm tên / số điện thoại…" />
        </div>
        <button className="btn-ghost" onClick={xuatCSV}><IcDown size={15} />Xuất Excel</button>
      </div>

      {hien.length === 0 ? <Empty text="Không có phiếu nào" /> :
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr>
            <th className="l">#</th>
            <th className="l" onClick={() => doSort('ten_kh')}>Khách hàng <span className="ar">{arrow('ten_kh')}</span></th>
            <th className="l">Sản phẩm</th>
            <th onClick={() => doSort('kenh')}>Kênh <span className="ar">{arrow('kenh')}</span></th>
            <th onClick={() => doSort('trang_thai')} className={sort.key === 'trang_thai' ? 'sorted' : ''}>Trạng thái <span className="ar">{arrow('trang_thai')}</span></th>
            <th onClick={() => doSort('han_lien_he')} className={sort.key === 'han_lien_he' ? 'sorted' : ''}>Hạn gọi <span className="ar">{arrow('han_lien_he')}</span></th>
            <th onClick={() => doSort('so_lan')}>Số lần <span className="ar">{arrow('so_lan')}</span></th>
            <th>Ưu tiên</th>
            <th>Thao tác</th>
          </tr></thead>
          <tbody>
            {hien.map((r, i) => {
              const tt = ttPhieu(r.trang_thai, r.qua_han)
              return (
                <tr key={r.phieu_id} onClick={() => moPhieu(r.phieu_id)}>
                  <td className="stt">{i + 1}</td>
                  <td className="l"><div className="kh-nm">{r.ten_kh || '(chưa có tên)'}</div>
                    <div className="kh-sdt">{fmtSdt(r.sdt)}</div></td>
                  <td className="l"><span className="sp-nm"><IcBox size={15} />
                    {r.ten_sp_dau || '—'}{r.so_sp > 1 ? ` · +${r.so_sp - 1}` : ''}</span></td>
                  <td>{r.kenh ? <span className="kbadge">{r.kenh}</span> : '—'}</td>
                  <td><span className={'tt ' + tt.cls}>{tt.nhan}</span></td>
                  <td className="num">{ngayVN(r.han_lien_he)}</td>
                  <td className="num">{r.so_lan || 0}</td>
                  <td>{r.uu_tien > 0 ? <span className="uu-star"><IcStar size={16} /></span> : '—'}</td>
                  <td><a className="act-btn" href={'tel:' + (r.sdt || '')}
                        onClick={e => e.stopPropagation()}><IcPhone size={13} />Gọi</a></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>}
    </>
  )
}
