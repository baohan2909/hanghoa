import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { Spinner, Empty, Toast } from '../components/ui'
import { IcPlus } from '../components/Icons'
import SoanBo from './SoanBo'

const ST = {
  hieu_luc: { nhan: 'Hiệu lực', cls: 'hl' },
  nhap: { nhan: 'Nháp', cls: 'nh' },
  ngung: { nhan: 'Ngưng', cls: 'ng' }
}
function apDung(s) {
  if (s === 'tat_ca') return 'Tất cả'
  if (s?.startsWith('nganh:')) return 'Ngành ' + s.slice(6)
  if (s?.startsWith('dong:')) return 'Dòng ' + s.slice(5)
  return s
}

export default function BoCauHoi() {
  const [ds, setDs] = useState([])
  const [tai, setTai] = useState(true)
  const [toast, setToast] = useState(null)
  const [soan, setSoan] = useState(null)     // {boId} | {boId:null} | null

  useEffect(() => { taiDs() }, [])
  async function taiDs() {
    setTai(true)
    try { setDs(await api.bocauhoiDs() || []) } catch (e) { setToast({ msg: e.message, kind: 'err' }) } finally { setTai(false) }
  }

  async function phatHanh(id) {
    try { await api.bocauhoiPhatHanh(id); setToast({ msg: 'Đã phát hành — bản cũ cùng phạm vi tự ngưng' }); taiDs() }
    catch (e) { setToast({ msg: e.message, kind: 'err' }) }
  }
  async function banMoi(id) {
    try {
      const idMoi = await api.bocauhoiBanMoi(id)
      setToast({ msg: 'Đã nhân bản thành bản nháp mới' }); await taiDs()
      setSoan({ boId: idMoi })
    } catch (e) { setToast({ msg: e.message, kind: 'err' }) }
  }

  if (tai) return <Spinner />
  return (
    <>
      <div className="toolbar">
        <div className="sp" />
        <button className="btn-ai" onClick={() => setSoan({ boId: null })}>
          <IcPlus size={17} />Tạo bộ câu hỏi mới
        </button>
      </div>
      {ds.length === 0 ? <Empty text="Chưa có bộ câu hỏi — bấm Tạo bộ câu hỏi mới" /> :
        ds.map(b => {
          const st = ST[b.trang_thai] || { nhan: b.trang_thai, cls: 'ng' }
          return (
            <div className="bo" key={b.id}>
              <div>
                <div className="nm"><span className="vbadge">v{b.phien_ban}</span> {b.ten}</div>
                <div className="mt2">Áp dụng: {apDung(b.ap_dung_cho)} · {b.so_cau} câu</div>
              </div>
              <div className="bo-act">
                {b.trang_thai === 'nhap' && <>
                  <button className="btn-mini" onClick={() => setSoan({ boId: b.id })}>Soạn</button>
                  <button className="btn-mini" onClick={() => phatHanh(b.id)}>Phát hành</button>
                </>}
                {b.trang_thai === 'hieu_luc' &&
                  <button className="btn-mini" onClick={() => banMoi(b.id)}>Sửa (tạo bản mới)</button>}
                <span className={'st ' + st.cls}>{st.nhan}</span>
              </div>
            </div>
          )
        })}
      {soan &&
        <SoanBo boId={soan.boId} onClose={() => setSoan(null)}
          onXong={() => { setSoan(null); setToast({ msg: 'Đã lưu bản nháp' }); taiDs() }} />}
      {toast && <Toast msg={toast.msg} kind={toast.kind} onHet={() => setToast(null)} />}
    </>
  )
}
