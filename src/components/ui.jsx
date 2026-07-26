import { useEffect } from 'react'

// Thẻ trắng
export const Card = ({ className = '', children, ...p }) =>
  <div className={'card ' + className} {...p}>{children}</div>

// Thẻ số lớn (số magenta 42px + bong bóng)
export function StatBig({ nhan, so, don, canhBao, delta }) {
  return (
    <div className={'tq-lon' + (canhBao ? ' canh-bao' : '')}>
      <div className="tq-lon-nhan">{nhan}</div>
      <div className="tq-lon-so">{so}{don && <i>{don}</i>}</div>
      {delta && <span className={'tq-delta ' + (delta.kind || 'tang')}>{delta.text}</span>}
    </div>
  )
}

// Badge trạng thái
export const Tt = ({ cls = 'cho', children }) =>
  <span className={'tt ' + cls}>{children}</span>

// Tiêu đề mục nhỏ
export const SecTit = ({ children, phu }) =>
  <div className="sec-tit">{children}{phu && <span className="n">{phu}</span>}</div>

// Spinner đang tải
export const Spinner = ({ text = 'Đang tải…' }) =>
  <div className="cho-tai"><i className="quay" /><span>{text}</span></div>

// Rỗng
export const Empty = ({ text = 'Chưa có dữ liệu' }) =>
  <div className="empty"><div className="t">{text}</div></div>

// Lớp phủ hộp thoại (style gắn thẳng — không phụ thuộc CSS ngoài, bài học NS FLOW)
export function LopPhu({ onClose, children, rong = 520 }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div style={S.bg} onClick={onClose}>
      <div style={{ ...S.box, maxWidth: rong }} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
const S = {
  bg: { position: 'fixed', inset: 0, background: 'rgba(20,33,58,.45)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  box: { width: '100%', background: '#fff', borderRadius: 16,
         boxShadow: '0 2px 6px rgba(20,33,58,.08),0 16px 48px rgba(20,33,58,.14)',
         maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }
}

// Toast nhẹ — tự ẩn sau 2.6s
export function Toast({ msg, kind, onHet }) {
  useEffect(() => {
    if (!msg || !onHet) return
    const t = setTimeout(onHet, 2600)
    return () => clearTimeout(t)
  }, [msg, onHet])
  if (!msg) return null
  return <div className={'toast' + (kind === 'err' ? ' err' : '')}>{msg}</div>
}
