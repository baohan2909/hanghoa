import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { Spinner, Toast, LopPhu } from '../components/ui'
import { IcChevL, IcCheck, IcStar, IcPhone, IcPlus } from '../components/Icons'
import { ttPhieu, ngayVN, gioVN, fmtSdt, KETQUA, NHOM_YK, SAC_THAI } from '../lib/format'

export default function Phieu({ phieuId, quayLai }) {
  const [d, setD] = useState(null)
  const [tai, setTai] = useState(true)
  const [traLoi, setTraLoi] = useState({})
  const [diemNeo, setDiemNeo] = useState(null)
  const [dongY, setDongY] = useState(true)
  const [yKien, setYKien] = useState([])       // [{ma_sp,nhom,sac_thai,noi_dung}]
  const [henMo, setHenMo] = useState(false)
  const [luu, setLuu] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => { taiPhieu() }, [phieuId])
  async function taiPhieu() {
    setTai(true)
    try {
      const j = await api.phieu(phieuId)
      setD(j)
      const p = j.phieu || {}
      setDiemNeo(p.diem_neo ?? null)
      setDongY(p.dong_y_trao_doi ?? true)
      const init = {}
      ;(j.tra_loi || []).forEach(t => { init[t.cau_hoi_id] = { diem: t.diem, gia_tri: t.gia_tri, tu_luan: t.tu_luan } })
      setTraLoi(init)
    } catch (e) { setToast({ msg: e.message, kind: 'err' }) } finally { setTai(false) }
  }

  const cauHoi = d?.cau_hoi || []
  const dsSp = d?.san_pham || []
  const datTL = (id, patch) => setTraLoi(s => ({ ...s, [id]: { ...s[id], ...patch } }))

  /* ---- Ý kiến phân loại ---- */
  function themYKien(goiY) {
    setYKien(y => [...y, {
      ma_sp: dsSp[0]?.ma_sp || null,
      nhom: goiY?.nhom || 'san_pham',
      sac_thai: goiY?.sac_thai || 'gop_y',
      noi_dung: goiY?.noi_dung || ''
    }])
  }
  const datYK = (i, patch) => setYKien(y => y.map((x, j) => j === i ? { ...x, ...patch } : x))
  const xoaYK = (i) => setYKien(y => y.filter((_, j) => j !== i))

  // Gợi ý nhanh từ câu tự luận có nội dung + đáp án "cần cải thiện"
  const goiY = useMemo(() => {
    const out = []
    cauHoi.forEach(c => {
      const t = traLoi[c.id]
      if (!t) return
      if (c.loai === 'tu_luan' && (t.tu_luan || '').trim())
        out.push({ nhom: c.nhom_chu_de || 'san_pham', sac_thai: 'gop_y', noi_dung: t.tu_luan.trim() })
      if (c.loai === 'chon' && /cải thiện|chậm|kém|móp|hỏng/i.test(t.gia_tri || ''))
        out.push({ nhom: c.nhom_chu_de || 'san_pham', sac_thai: 'gop_y', noi_dung: t.gia_tri })
    })
    return out.filter(g => !yKien.some(y => y.noi_dung === g.noi_dung))
  }, [cauHoi, traLoi, yKien])

  /* ---- Ghi liên hệ ---- */
  async function ghiLienHe(ket_qua, hen_luc, ghi_chu) {
    try {
      await api.ghiLienHe({ phieu_id: phieuId, ket_qua, hen_luc, ghi_chu })
      setToast({ msg: 'Đã ghi: ' + (KETQUA[ket_qua] || ket_qua) })
      setHenMo(false); taiPhieu()
    } catch (e) { setToast({ msg: e.message, kind: 'err' }) }
  }

  async function luuKetQua() {
    setLuu(true)
    try {
      const tra_loi = Object.entries(traLoi).map(([cau_hoi_id, v]) => ({
        cau_hoi_id: Number(cau_hoi_id), diem: v.diem ?? null,
        gia_tri: v.gia_tri ?? null, tu_luan: v.tu_luan ?? null
      }))
      const y_kien = yKien.filter(y => (y.noi_dung || '').trim())
        .map(y => ({ ma_sp: y.ma_sp, nhom: y.nhom, sac_thai: y.sac_thai, noi_dung: y.noi_dung.trim() }))
      await api.luuTraLoi({ phieu_id: phieuId, tra_loi, y_kien, diem_neo: diemNeo, dong_y: dongY, hoan_tat: true })
      setToast({ msg: 'Đã lưu kết quả & hoàn tất phiếu' })
      setTimeout(quayLai, 700)
    } catch (e) { setToast({ msg: e.message, kind: 'err' }) } finally { setLuu(false) }
  }

  if (tai) return <Spinner />
  if (!d) return null
  const p = d.phieu || {}, k = d.khach || {}, don = d.don || {}
  const tt = ttPhieu(p.trang_thai)

  return (
    <>
      <div className="back" onClick={quayLai}><IcChevL size={16} />Hàng đợi chăm sóc</div>
      <div className="phieu-grid">
        {/* ===== Cột trái: khảo sát + ý kiến ===== */}
        <div>
          {d.loi_mo_dau &&
            <div className="mo-dau">
              <div className="lb">Lời mở đầu</div>
              <p>"{d.loi_mo_dau}"</p>
            </div>}

          {cauHoi.map((c, i) => (
            <div className="q" key={c.id}>
              <div className="qn">{i + 1}. {c.noi_dung}
                {c.la_neo && <span className="neo-flag"><IcStar size={10} />ĐIỂM NEO</span>}</div>
              {c.loai === 'diem' &&
                <div className="neo">
                  {[1, 2, 3, 4, 5].map(n => (
                    <div key={n}
                      className={'p' + ((c.la_neo ? diemNeo : traLoi[c.id]?.diem) === n ? ' on' : '')}
                      onClick={() => { c.la_neo ? setDiemNeo(n) : datTL(c.id, { diem: n }) }}>{n}</div>
                  ))}
                </div>}
              {c.loai === 'chon' &&
                <div className="opts">
                  {(c.lua_chon || []).map(o => (
                    <div key={o} className={'opt' + (traLoi[c.id]?.gia_tri === o ? ' on' : '')}
                      onClick={() => datTL(c.id, { gia_tri: o })}>{o}</div>
                  ))}
                </div>}
              {c.loai === 'tu_luan' &&
                <textarea className="ta" placeholder="Ghi câu trả lời của khách…"
                  value={traLoi[c.id]?.tu_luan || ''}
                  onChange={e => datTL(c.id, { tu_luan: e.target.value })} />}
            </div>
          ))}

          {/* ---- PHÂN LOẠI Ý KIẾN ---- */}
          <div className="q">
            <div className="qn">Phân loại ý kiến khách
              <span className="yk-dem">{yKien.length}</span></div>
            <div className="yk-note">Ý kiến phân loại ở đây nuôi thẻ Tín hiệu đỏ &amp; màn Phân tích.</div>

            {goiY.length > 0 &&
              <div className="yk-goiy">
                {goiY.map((g, i) => (
                  <button type="button" className="yk-goiy-i" key={i} onClick={() => themYKien(g)}>
                    <IcPlus size={12} />{NHOM_YK[g.nhom]} · "{g.noi_dung.slice(0, 42)}{g.noi_dung.length > 42 ? '…' : ''}"
                  </button>
                ))}
              </div>}

            {yKien.map((y, i) => (
              <div className="yk-dong" key={i}>
                <select value={y.ma_sp || ''} onChange={e => datYK(i, { ma_sp: e.target.value || null })}>
                  {dsSp.map(s => <option key={s.ma_sp} value={s.ma_sp}>{s.ten_sp || s.ma_sp}</option>)}
                </select>
                <select value={y.nhom} onChange={e => datYK(i, { nhom: e.target.value })}>
                  {Object.entries(NHOM_YK).map(([kk, v]) => <option key={kk} value={kk}>{v}</option>)}
                </select>
                <div className="yk-sac">
                  {Object.entries(SAC_THAI).map(([kk, v]) => (
                    <button type="button" key={kk}
                      className={'yk-sac-i ' + kk + (y.sac_thai === kk ? ' on' : '')}
                      onClick={() => datYK(i, { sac_thai: kk })}>{v.nhan}</button>
                  ))}
                </div>
                <input className="yk-nd" value={y.noi_dung} placeholder="Nội dung ý kiến…"
                  onChange={e => datYK(i, { noi_dung: e.target.value })} />
                <button type="button" className="nd-xoa" onClick={() => xoaYK(i)}>✕</button>
              </div>
            ))}
            <button type="button" className="btn-mini" style={{ marginTop: 10 }}
              onClick={() => themYKien()}>+ Thêm ý kiến</button>
          </div>
        </div>

        {/* ===== Cột phải ===== */}
        <div>
          <div className="side-card">
            <div className="kh-head">
              <div className="av">{(k.ten || 'K').slice(0, 1).toUpperCase()}</div>
              <div><div className="nm">{k.ten || '(chưa có tên)'}</div>
                <div className="sdt">{fmtSdt(k.sdt)}</div></div>
              <a className="goi-that" href={'tel:' + (k.sdt || '')} title="Gọi ngay">
                <IcPhone size={17} /></a>
            </div>
            <div className="kh-meta">
              <div className="r"><span className="k">Ngày nhận</span><span className="v">{ngayVN(don.ngay_nhan)}</span></div>
              <div className="r"><span className="k">Hạn gọi</span><span className="v">{ngayVN(p.han_lien_he)}</span></div>
              <div className="r"><span className="k">Trạng thái</span><span className={'tt ' + tt.cls}>{tt.nhan}</span></div>
              <div className="r"><span className="k">Sản phẩm</span>
                <span className="v">{dsSp.map(s => s.ten_sp).filter(Boolean).join(', ') || '—'}</span></div>
            </div>
            <div className="consent">
              <div className="l">Khách đồng ý trao đổi<small>Ghi nhận theo NĐ 13/2023</small></div>
              <div className={'sw' + (dongY ? ' on' : '')} onClick={() => setDongY(v => !v)} />
            </div>
          </div>

          <div className="side-card">
            <div className="sec-tit" style={{ marginBottom: 10 }}>Ghi kết quả cuộc gọi</div>
            <div className="ghi-nut">
              <button className="btn-mini" onClick={() => ghiLienHe('khong_nghe')}>Không nghe</button>
              <button className="btn-mini" onClick={() => setHenMo(true)}>Hẹn gọi lại…</button>
              <button className="btn-mini" onClick={() => ghiLienHe('sai_so')}>Sai số</button>
              <button className="btn-mini warn" onClick={() => ghiLienHe('tu_choi')}>Khách từ chối</button>
            </div>
          </div>

          <div className="side-card">
            <div className="sec-tit" style={{ marginBottom: 12 }}>Lịch sử liên hệ
              <span className="n">{(d.lich_su || []).length} lần</span></div>
            {(d.lich_su || []).length === 0 ? <div className="tin-rong">Chưa liên hệ lần nào.</div> :
              <div className="tl">
                {d.lich_su.map((l, i) => (
                  <div className={'it ' + (l.ket_qua === 'thanh_cong' ? 'ok' : 'fail')} key={i}>
                    <div className="t">Lần {l.lan_thu} · {gioVN(l.thoi_diem)} — {KETQUA[l.ket_qua] || l.ket_qua}</div>
                    {l.hen_luc && <div className="s">Hẹn: {gioVN(l.hen_luc)}</div>}
                    {l.ghi_chu && <div className="s">{l.ghi_chu}</div>}
                  </div>
                ))}
              </div>}
          </div>

          <button className="btn-ai full" disabled={luu} onClick={luuKetQua}>
            <IcCheck size={18} />{luu ? 'Đang lưu…' : 'Lưu kết quả & hoàn tất'}
          </button>
        </div>
      </div>

      {henMo && <HenGoiLai onClose={() => setHenMo(false)}
        onLuu={(luc, chu) => ghiLienHe('hen_lai', luc, chu)} />}
      {toast && <Toast msg={toast.msg} kind={toast.kind} onHet={() => setToast(null)} />}
    </>
  )
}

/* Modal hẹn gọi lại: chọn ngày + giờ + ghi chú */
function HenGoiLai({ onClose, onLuu }) {
  const mai = new Date(Date.now() + 24 * 3600 * 1000)
  const [ngay, setNgay] = useState(new Date(mai.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10))
  const [gio, setGio] = useState('19:00')
  const [chu, setChu] = useState('')
  return (
    <LopPhu onClose={onClose} rong={420}>
      <div className="lp-dau"><b>Hẹn gọi lại</b><button className="lp-dong" onClick={onClose}>✕</button></div>
      <div className="lp-than">
        <div className="nd-hang">
          <div className="nd-o"><label>Ngày</label>
            <input type="date" value={ngay} onChange={e => setNgay(e.target.value)} /></div>
          <div className="nd-o"><label>Giờ</label>
            <input type="time" value={gio} onChange={e => setGio(e.target.value)} /></div>
        </div>
        <div className="nd-o"><label>Ghi chú</label>
          <input value={chu} onChange={e => setChu(e.target.value)} placeholder="VD: khách bận, hẹn buổi tối" /></div>
      </div>
      <div className="lp-chan">
        <button className="btn-ghost" onClick={onClose} type="button">Huỷ</button>
        <button className="btn-ai" onClick={() => onLuu(ngay + 'T' + gio + ':00+07:00', chu || null)}>
          <IcCheck size={16} />Ghi hẹn</button>
      </div>
    </LopPhu>
  )
}
