import { useEffect, useRef, useState } from 'react';
import { IcDown } from './icons.jsx';

// Ngày HÔM NAY theo giờ máy người dùng (điện thoại NV ở VN) — KHÔNG dùng toISOString()
// vì toISOString() trả giờ UTC, sáng sớm VN sẽ lùi 1 ngày. Dùng thành phần local.
export const isoVN = (d = new Date()) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

// ============================================================
// QUY TẮC UI (áp toàn hệ thống):
// - KHÔNG dùng <select> hay popup mặc định của trình duyệt.
// - Mọi ô chọn = Sel: nút trắng bo 10px, danh sách xổ trắng bo tròn có bóng.
// - Mọi ô ngày = DateBox: khung trắng bo 10px đồng bộ.
// - Thẻ/tab đang chọn = gradient chủ đạo + bóng mờ (class .on chuẩn).
// ============================================================

export function Sel({ value, onChange, options, style, placeholder = 'Chọn…', timKiem }) {
  const [mo, setMo] = useState(false);
  const [pos, setPos] = useState(null);
  const [q, setQ] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setMo(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  // bật ô tìm nếu prop timKiem, hoặc tự động khi >8 lựa chọn
  const coTim = timKiem ?? options.length > 8;
  const toggle = () => {
    if (!mo && ref.current) {
      const r = ref.current.getBoundingClientRect();
      setPos({ left: r.left, top: r.bottom + 6, width: Math.max(r.width, 160) });
      setQ('');
    }
    setMo((v) => !v);
  };
  const chon = options.find((o) => o.value === value);
  const loc = coTim && q.trim()
    ? options.filter((o) => (o.label || '').toString().toLowerCase().includes(q.trim().toLowerCase()))
    : options;
  return (
    <div ref={ref} className="sel" style={style}>
      <button type="button" className="sel-btn" onClick={toggle}>
        <span>{chon ? chon.label : <span style={{ opacity: .55 }}>{placeholder}</span>}</span>
        <IcDown style={{ flexShrink: 0, opacity: .5 }} />
      </button>
      {mo && pos && (
        <div className="sel-pop-fixed" style={{ left: pos.left, top: pos.top, minWidth: pos.width }}>
          {coTim && (
            <input className="sel-search" autoFocus placeholder="Gõ để tìm…"
              value={q} onChange={(e) => setQ(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()} />
          )}
          {loc.length === 0 && <div className="sel-empty">Không tìm thấy</div>}
          {loc.map((o) => (
            <button key={o.value} type="button" disabled={o.disabled}
              className={'sel-item' + (o.value === value ? ' on' : '')}
              onMouseDown={() => { if (!o.disabled) { onChange(o.value); setMo(false); } }}>
              {o.label}
              {o.sub && <div className="sel-sub">{o.sub}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function DateBox({ value, onChange, label, style }) {
  const ref = useRef(null);
  const hienThi = value
    ? value.split('-').reverse().join('/')   // yyyy-mm-dd -> dd/mm/yyyy
    : 'dd/mm/yyyy';
  const moLich = () => {
    const el = ref.current; if (!el) return;
    if (el.showPicker) { try { el.showPicker(); return; } catch {} }
    el.focus(); el.click();
  };
  return (
    <label className="datebox" style={style} onClick={moLich}>
      {label && <span className="datebox-l">{label}</span>}
      <span className="datebox-txt" style={!value ? { opacity: .5 } : undefined}>{hienThi}</span>
      <input ref={ref} type="date" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
