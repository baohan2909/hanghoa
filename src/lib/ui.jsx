import { useEffect, useRef, useState } from 'react';
import { IcDown } from './icons.jsx';

// ============================================================
// QUY TẮC UI (áp toàn hệ thống):
// - KHÔNG dùng <select> hay popup mặc định của trình duyệt.
// - Mọi ô chọn = Sel: nút trắng bo 10px, danh sách xổ trắng bo tròn có bóng.
// - Mọi ô ngày = DateBox: khung trắng bo 10px đồng bộ.
// - Thẻ/tab đang chọn = gradient chủ đạo + bóng mờ (class .on chuẩn).
// ============================================================

export function Sel({ value, onChange, options, style, placeholder = 'Chọn…' }) {
  const [mo, setMo] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setMo(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const chon = options.find((o) => o.value === value);
  return (
    <div ref={ref} className="sel" style={style}>
      <button type="button" className="sel-btn" onClick={() => setMo((v) => !v)}>
        <span>{chon ? chon.label : <span style={{ opacity: .55 }}>{placeholder}</span>}</span>
        <IcDown style={{ flexShrink: 0, opacity: .5 }} />
      </button>
      {mo && (
        <div className="sel-pop">
          {options.map((o) => (
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
  return (
    <label className="datebox" style={style}>
      {label && <span className="datebox-l">{label}</span>}
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
