import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { LopPhu, Spinner } from '../components/ui'
import { IcPlus, IcCheck, IcStar } from '../components/Icons'
import { NHOM_YK } from '../lib/format'

const LOAI = [
  { id: 'diem', nhan: 'Điểm 1–5' },
  { id: 'chon', nhan: 'Chọn đáp án' },
  { id: 'tu_luan', nhan: 'Tự luận' }
]

/* Trình soạn bộ câu hỏi.
   boId = null -> tạo mới; boId có -> mở bản nháp để soạn. */
export default function SoanBo({ boId, onClose, onXong }) {
  const [ten, setTen] = useState('')
  const [apDung, setApDung] = useState('tat_ca')
  const [loiMo, setLoiMo] = useState('')
  const [cau, setCau] = useState([])          // [{noi_dung,loai,lua_chon[],nhom_chu_de,la_neo,bat_buoc}]
  const [tai, setTai] = useState(!!boId)
  const [luu, setLuu] = useState(false)
  const [loi, setLoi] = useState('')

  useEffect(() => {
    if (!boId) { themCau(true); return }
    (async () => {
      try {
        const j = await api.bocauhoiChitiet(boId)
        const b = j?.bo || {}
        setTen(b.ten || ''); setApDung(b.ap_dung_cho || 'tat_ca'); setLoiMo(b.loi_mo_dau || '')
        setCau((j?.cau_hoi || []).map(q => ({
          noi_dung: q.noi_dung || '', loai: q.loai || 'tu_luan',
          lua_chon: Array.isArray(q.lua_chon) ? q.lua_chon : [],
          nhom_chu_de: q.nhom_chu_de || '', la_neo: !!q.la_neo, bat_buoc: !!q.bat_buoc
        })))
      } catch (e) { setLoi(e.message) } finally { setTai(false) }
    })()
  }, [boId])

  function themCau(neoDau) {
    setCau(c => [...c, {
      noi_dung: '', loai: neoDau && c.length === 0 ? 'diem' : 'tu_luan',
      lua_chon: [], nhom_chu_de: '', la_neo: neoDau && c.length === 0, bat_buoc: false
    }])
  }
  const datCau = (i, patch) => setCau(c => c.map((q, j) => j === i ? { ...q, ...patch } : q))
  const xoaCau = (i) => setCau(c => c.filter((_, j) => j !== i))
  function doiChoCau(i, huong) {
    setCau(c => {
      const j = i + huong
      if (j < 0 || j >= c.length) return c
      const n = [...c]; [n[i], n[j]] = [n[j], n[i]]; return n
    })
  }
  // chỉ 1 câu được là điểm neo
  function datNeo(i) {
    setCau(c => c.map((q, j) => ({ ...q, la_neo: j === i, loai: j === i ? 'diem' : q.loai })))
  }

  async function luuBo() {
    setLoi('')
    if (!ten.trim()) { setLoi('Cần tên bộ câu hỏi'); return }
    const dsCau = cau.filter(q => q.noi_dung.trim())
    if (dsCau.length === 0) { setLoi('Cần ít nhất 1 câu hỏi'); return }
    setLuu(true)
    try {
      let id = boId
      if (!id) id = await api.bocauhoiTao(ten.trim(), apDung, loiMo.trim() || null)
      await api.cauhoiLuu(id, dsCau.map((q, i) => ({
        thu_tu: i + 1, noi_dung: q.noi_dung.trim(), loai: q.loai,
        lua_chon: q.loai === 'chon' ? q.lua_chon.filter(x => x.trim()) : null,
        nhom_chu_de: q.nhom_chu_de || null, la_neo: q.la_neo, bat_buoc: q.bat_buoc
      })))
      onXong?.(id)
    } catch (e) { setLoi(e.message) } finally { setLuu(false) }
  }

  return (
    <LopPhu onClose={onClose} rong={720}>
      <div className="lp-dau"><b>{boId ? 'Soạn bộ câu hỏi' : 'Tạo bộ câu hỏi mới'}</b>
        <span className="lp-phu">Bản nháp — phát hành sau khi soạn xong</span>
        <button className="lp-dong" onClick={onClose}>✕</button></div>

      <div className="lp-than">
        {tai ? <Spinner /> : <>
          <div className="nd-hang">
            <div className="nd-o"><label>Tên bộ câu hỏi *</label>
              <input value={ten} onChange={e => setTen(e.target.value)} placeholder="VD: Chăm sóc sau mua — chuẩn" /></div>
            <div className="nd-o"><label>Áp dụng cho</label>
              <select value={apDung} onChange={e => setApDung(e.target.value)}>
                <option value="tat_ca">Tất cả sản phẩm</option>
                <option value="nganh:BH">Ngành mũ bảo hiểm</option>
                <option value="nganh:NV">Ngành nón vải</option>
              </select></div>
          </div>
          <div className="nd-o" style={{ marginBottom: 14 }}>
            <label>Lời mở đầu (nhân viên đọc khi bắt máy)</label>
            <textarea className="ta" style={{ marginTop: 0 }} rows={2} value={loiMo}
              onChange={e => setLoiMo(e.target.value)}
              placeholder="Dạ em chào anh/chị, em gọi từ Nón Sơn ạ…" />
          </div>

          <label className="nd-lb">Danh sách câu hỏi</label>
          {cau.map((q, i) => (
            <div className="sb-cau" key={i}>
              <div className="sb-dau">
                <span className="sb-stt">{i + 1}</span>
                <select className="sb-loai" value={q.loai}
                  onChange={e => datCau(i, { loai: e.target.value, la_neo: e.target.value === 'diem' ? q.la_neo : false })}>
                  {LOAI.map(l => <option key={l.id} value={l.id}>{l.nhan}</option>)}
                </select>
                <select className="sb-loai" value={q.nhom_chu_de}
                  onChange={e => datCau(i, { nhom_chu_de: e.target.value })}>
                  <option value="">— Nhóm chủ đề —</option>
                  {Object.entries(NHOM_YK).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <div className="sp" style={{ flex: 1 }} />
                <button type="button" className={'sb-neo' + (q.la_neo ? ' on' : '')}
                  onClick={() => datNeo(i)} title="Đặt làm câu điểm neo (so sánh xuyên bộ)">
                  <IcStar size={12} />Neo</button>
                <button type="button" className="sb-nut" onClick={() => doiChoCau(i, -1)} disabled={i === 0}>↑</button>
                <button type="button" className="sb-nut" onClick={() => doiChoCau(i, 1)} disabled={i === cau.length - 1}>↓</button>
                <button type="button" className="sb-nut xoa" onClick={() => xoaCau(i)}>✕</button>
              </div>
              <textarea className="ta" style={{ marginTop: 9 }} rows={2} value={q.noi_dung}
                onChange={e => datCau(i, { noi_dung: e.target.value })}
                placeholder="Nội dung câu hỏi (hỏi theo hướng tích cực, gọn)…" />
              {q.loai === 'chon' &&
                <div className="sb-lc">
                  {q.lua_chon.map((o, j) => (
                    <div className="sb-lc-i" key={j}>
                      <input value={o} placeholder={'Đáp án ' + (j + 1)}
                        onChange={e => datCau(i, { lua_chon: q.lua_chon.map((x, k) => k === j ? e.target.value : x) })} />
                      <button type="button" className="nd-xoa"
                        onClick={() => datCau(i, { lua_chon: q.lua_chon.filter((_, k) => k !== j) })}>✕</button>
                    </div>
                  ))}
                  <button type="button" className="btn-mini" style={{ alignSelf: 'flex-start' }}
                    onClick={() => datCau(i, { lua_chon: [...q.lua_chon, ''] })}>
                    + Thêm đáp án</button>
                </div>}
            </div>
          ))}
          <button type="button" className="btn-ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
            onClick={() => themCau(false)}><IcPlus size={15} />Thêm câu hỏi</button>
          {loi && <div className="login-err" style={{ marginTop: 12 }}>{loi}</div>}
        </>}
      </div>

      <div className="lp-chan">
        <button className="btn-ghost" onClick={onClose} type="button">Huỷ</button>
        <button className="btn-ai" disabled={luu || tai} onClick={luuBo}>
          <IcCheck size={16} />{luu ? 'Đang lưu…' : 'Lưu bản nháp'}</button>
      </div>
    </LopPhu>
  )
}
