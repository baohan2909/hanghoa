import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// ============================================================================
// SẮP XẾP + PHỄU LỌC THEO CỘT (v3.123.0) — dùng chung mọi bảng chia hàng đội sale
//   Bấm tên cột  : số -> lớn→nhỏ → nhỏ→lớn → bỏ · chữ -> A→Z → Z→A → bỏ
//   Bấm phễu     : = 0 · ≠ 0 · > 0 · ≥ x · ≤ x · từ a đến b · chọn giá trị (như Excel / Google Sheets)
//   Điều kiện lưu thành CHUỖI — đúng cú pháp ô gõ tay dưới tiêu đề (2 cách nhập luôn khớp nhau):
//     số : "5" bằng · ">5" ">=5" "<3" "<=3" "!=0" · "5-10" khoảng · "1;3;5" chọn giá trị
//     chữ: "abc" chứa (mọi từ) · "=A;B" đúng các giá trị
//   Lọc chỉ ẨN dòng khỏi màn hình — số đã chia, nháp, tổng vẫn giữ nguyên.
// ============================================================================

const SO = '-?\\d+(?:\\.\\d+)?';
const RONG = '∅';   // không chọn giá trị nào
const reDon = new RegExp(`^(>=|<=|>|<|=|!=|≠)?(${SO})$`);
const reKhoang = new RegExp(`^(${SO})(?:-|\\.\\.|~)(${SO})$`);
const reDs = new RegExp(`^(${SO})(?:;(${SO}))+;?$`);

// số: trả hàm kiểm tra · null (không lọc) · 'sai' (gõ chưa hiểu)
export function boLocSo(chuoi) {
  const t = String(chuoi ?? '').replace(/\s+/g, '').replace(',', '.');
  if (!t) return null;
  if (t === RONG) return () => false;   // "Bỏ hết" trong danh sách giá trị
  let m = t.match(reDon);
  if (m) {
    const op = m[1] || '=', n = +m[2];
    return (v) => v != null && (op === '>' ? v > n : op === '>=' ? v >= n : op === '<' ? v < n : op === '<=' ? v <= n
      : op === '!=' || op === '≠' ? v !== n : v === n);
  }
  m = t.match(reKhoang);
  if (m) { const a = Math.min(+m[1], +m[2]), b = Math.max(+m[1], +m[2]); return (v) => v != null && v >= a && v <= b; }
  if (reDs.test(t)) { const s = new Set(t.split(';').filter(Boolean).map(Number)); return (v) => v != null && s.has(v); }
  return 'sai';
}
// chữ: "=A;B" đúng giá trị · còn lại: chứa mọi từ
export function boLocChu(chuoi) {
  const t = String(chuoi ?? '').trim();
  if (!t) return null;
  if (t === RONG) return () => false;
  if (t.startsWith('=')) {
    const s = new Set(t.slice(1).split(';').map((x) => x.trim().toLowerCase()).filter(Boolean));
    return s.size ? (v) => s.has(String(v ?? '').toLowerCase()) : null;
  }
  const tu = t.toLowerCase().split(/\s+/).filter(Boolean);
  return (v) => { const h = String(v ?? '').toLowerCase(); return tu.every((w) => h.includes(w)); };
}
export const boLoc = (chuoi, loai) => (loai === 'chu' ? boLocChu(chuoi) : boLocSo(chuoi));

// so sánh: null luôn xuống cuối
export function soSanh(a, b, g) {
  const na = a == null || a === '', nb = b == null || b === '';
  if (na || nb) return na === nb ? 0 : na ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return g * (a - b);
  return g * String(a).localeCompare(String(b), 'vi', { numeric: true });
}

// cot: { k: { lay: (x) => giá trị, loai: 'so' | 'chu', tim?: (x) => chuỗi để tìm "chứa" } }
export function locVaSap(rows, cot, sap, loc, sapPhu) {
  const fs = [];
  Object.entries(loc || {}).forEach(([k, chuoi]) => {
    const c = cot[k]; if (!c) return;
    const f = boLoc(chuoi, c.loai);
    if (typeof f !== 'function') return;
    const laDs = c.loai === 'chu' && String(chuoi).trim().startsWith('=');
    const lay = c.loai === 'chu' && !laDs && c.tim ? c.tim : c.lay;
    fs.push((x) => f(lay(x)));
  });
  let v = fs.length ? rows.filter((x) => fs.every((f) => f(x))) : [...rows];
  const c = sap && cot[sap.k];
  if (c) v.sort((a, b) => soSanh(c.lay(a), c.lay(b), sap.g) || (sapPhu ? sapPhu(a, b) : 0));
  else if (sapPhu) v.sort(sapPhu);
  return v;
}

// Trạng thái sắp xếp + lọc của 1 bảng — nhớ trên máy (theo khoá), lỗi bộ nhớ thì vẫn chạy
const doc = (k) => { try { const s = localStorage.getItem('ds_sl:' + k); return s ? JSON.parse(s) : null; } catch { return null; } };
const ghi = (k, v) => { try { localStorage.setItem('ds_sl:' + k, JSON.stringify(v)); } catch { /* bỏ qua */ } };
export function useSapLoc(khoa, sapMacDinh = null) {
  const [st, setSt] = useState(() => (khoa && doc(khoa)) || { sap: sapMacDinh, loc: {} });
  useEffect(() => { if (khoa) ghi(khoa, st); }, [khoa, st]);
  const datSap = (sap) => setSt((s) => ({ ...s, sap }));
  const datLoc = (k, v) => setSt((s) => { const loc = { ...s.loc }; if (v == null || !String(v).trim()) delete loc[k]; else loc[k] = v; return { ...s, loc }; });
  const xoaLoc = () => setSt((s) => ({ ...s, loc: {} }));
  const coLoc = Object.values(st.loc || {}).some((v) => String(v || '').trim());
  return { sap: st.sap, loc: st.loc || {}, datSap, datLoc, xoaLoc, coLoc };
}

// Chu kỳ khi bấm tên cột
export function sapTiep(sap, k, loai) {
  const dau = loai === 'chu' ? 1 : -1;
  if (!sap || sap.k !== k) return { k, g: dau };
  if (sap.g === dau) return { k, g: -dau };
  return null;
}

const IcPheu = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 4.5h18l-7 8.2v6l-4 1.8v-7.8z" /></svg>);

// ---------------------------------------------------------------------------
// Ô tiêu đề cột: bấm tên = sắp xếp · bấm phễu = hộp lọc
// ---------------------------------------------------------------------------
export function ThCot({ k, ten, nhan, title, loai = 'so', sap, onSap, loc, onLoc, giaTri, className = '', style, nhanSo }) {
  const [mo, setMo] = useState(false);
  const ref = useRef(null);
  const dangSap = sap && sap.k === k ? sap.g : 0;
  const f = boLoc(loc, loai);
  const dangLoc = typeof f === 'function';
  const mui = dangSap ? (dangSap > 0 ? '↑' : '↓') : '';
  return (
    <th ref={ref} className={className + ' lc-th' + (dangLoc ? ' lc-co-loc' : '') + (dangSap ? ' lc-co-sap' : '')} style={style}
      aria-sort={dangSap ? (dangSap > 0 ? 'ascending' : 'descending') : undefined}>
      <div className="lc-o">
        <button type="button" className="lc-ten" title={(title ? title + '\n' : '') + 'Bấm để sắp xếp' + (loai === 'chu' ? ' A→Z / Z→A' : ' lớn→nhỏ / nhỏ→lớn')}
          onClick={() => onSap(sapTiep(sap, k, loai))}>
          <span>{ten}</span>{mui && <i className="lc-mui">{mui}</i>}
        </button>
        <button type="button" className={'lc-pheu' + (dangLoc ? ' on' : '')} aria-label={'Lọc cột ' + (nhan || (typeof ten === 'string' ? ten : k))}
          title={dangLoc ? `Đang lọc: ${loc}` : 'Lọc cột này'} onClick={(e) => { e.stopPropagation(); setMo((v) => !v); }}>
          <IcPheu />
        </button>
      </div>
      {mo && <HopLoc neo={ref} ten={nhan || (typeof ten === 'string' ? ten : (title || k))} loai={loai} sap={dangSap} k={k}
        onSap={onSap} loc={loc || ''} onLoc={onLoc} giaTri={giaTri} nhanSo={nhanSo} onDong={() => setMo(false)} />}
    </th>
  );
}

// đọc chuỗi đang lọc -> trạng thái hộp
function docLoc(chuoi, loai) {
  const t = String(chuoi || '').replace(/\s+/g, '').replace(',', '.');
  if (!t) return { kieu: 'tat' };
  if (t === RONG) return { kieu: 'chon', ds: [] };
  if (loai === 'chu') {
    if (t.startsWith('=')) return { kieu: 'chon', ds: String(chuoi).trim().slice(1).split(';').map((x) => x.trim()).filter(Boolean) };
    return { kieu: 'chua', a: String(chuoi).trim() };
  }
  if (t === '0' || t === '=0') return { kieu: 'eq0' };
  if (t === '!=0' || t === '≠0') return { kieu: 'ne0' };
  if (t === '>0') return { kieu: 'gt0' };
  let m = t.match(new RegExp(`^>=(${SO})$`)); if (m) return { kieu: 'ge', a: m[1] };
  m = t.match(new RegExp(`^<=(${SO})$`)); if (m) return { kieu: 'le', a: m[1] };
  m = t.match(reKhoang); if (m) return { kieu: 'khoang', a: m[1], b: m[2] };
  if (reDs.test(t) || /^=?-?\d+(?:\.\d+)?$/.test(t)) return { kieu: 'chon', ds: t.replace(/^=/, '').split(';').filter(Boolean).map(Number) };
  return { kieu: 'khac', a: chuoi };
}

function HopLoc({ neo, ten, loai, sap, k, onSap, loc, onLoc, giaTri, nhanSo, onDong }) {
  const hop = useRef(null);
  const [vt, setVt] = useState(null);
  const st = docLoc(loc, loai);
  const [ge, setGe] = useState(st.kieu === 'ge' ? st.a : '');
  const [le, setLe] = useState(st.kieu === 'le' ? st.a : '');
  const [ka, setKa] = useState(st.kieu === 'khoang' ? st.a : '');
  const [kb, setKb] = useState(st.kieu === 'khoang' ? st.b : '');
  const [chua, setChua] = useState(st.kieu === 'chua' ? st.a : '');
  const [tim, setTim] = useState('');

  // vị trí: ngay dưới tiêu đề, không tràn mép màn hình; bảng cuộn -> đi theo tiêu đề, tiêu đề khuất hẳn -> đóng
  useLayoutEffect(() => {
    let raf = 0;
    const dat = () => {
      const r = neo.current?.getBoundingClientRect(); if (!r) return;
      if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) { onDong(); return; }   // tiêu đề khuất hẳn
      // vùng đang nhìn thấy (iPhone phóng to / trang rộng hơn màn hình -> dùng visualViewport)
      const vv = window.visualViewport;
      const ox = vv ? vv.offsetLeft : 0, oy = vv ? vv.offsetTop : 0;
      const vw = vv ? vv.width : window.innerWidth, vh = vv ? vv.height : window.innerHeight;
      const W = Math.min(292, vw - 16);
      const left = Math.max(ox + 8, Math.min(r.left + r.width / 2 - W / 2, ox + vw - W - 8));
      const duoi = oy + vh - r.bottom - 12;
      const caoMax = Math.min(460, vh - 24);
      const top = duoi >= 260 ? r.bottom + 4 : Math.max(oy + 8, r.top - caoMax - 4);
      setVt({ left, top, W, maxH: duoi >= 260 ? duoi : Math.min(caoMax, r.top - oy - 12) });
    };
    dat();
    const theo = (e) => { if (hop.current && hop.current.contains(e.target)) return; cancelAnimationFrame(raf); raf = requestAnimationFrame(dat); };
    window.addEventListener('resize', theo);
    window.addEventListener('scroll', theo, true);
    window.visualViewport?.addEventListener('resize', theo);
    window.visualViewport?.addEventListener('scroll', theo);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', theo); window.removeEventListener('scroll', theo, true);
      window.visualViewport?.removeEventListener('resize', theo); window.visualViewport?.removeEventListener('scroll', theo); };
  }, [neo]);   // eslint-disable-line
  useEffect(() => {
    const ngoai = (e) => { if (hop.current && !hop.current.contains(e.target) && !neo.current?.contains(e.target)) onDong(); };
    const esc = (e) => { if (e.key === 'Escape') onDong(); };
    document.addEventListener('mousedown', ngoai); document.addEventListener('touchstart', ngoai, { passive: true });
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', ngoai); document.removeEventListener('touchstart', ngoai);
      document.removeEventListener('keydown', esc); };
  }, [onDong, neo]);

  // danh sách giá trị + số dòng (như Excel)
  const ds = useMemo(() => {
    const m = new Map();
    (giaTri ? giaTri() : []).forEach((v) => {
      if (v == null || v === '') return;
      const key = loai === 'chu' ? String(v) : +v;
      m.set(key, (m.get(key) || 0) + 1);
    });
    const a = [...m.entries()].map(([v, n]) => ({ v, n }));
    return loai === 'chu' ? a.sort((x, y) => String(x.v).localeCompare(String(y.v), 'vi', { numeric: true })) : a.sort((x, y) => x.v - y.v);
  }, [giaTri, loai]);
  const dsHien = useMemo(() => {
    const q = tim.trim().toLowerCase();
    return (q ? ds.filter((x) => String(nhanSo && loai !== 'chu' ? nhanSo(x.v) : x.v).toLowerCase().includes(q)) : ds).slice(0, 300);
  }, [ds, tim, nhanSo, loai]);
  const chon = st.kieu === 'chon' ? new Set(st.ds.map((v) => (loai === 'chu' ? String(v).toLowerCase() : +v))) : null;
  const daChon = (v) => (chon ? chon.has(loai === 'chu' ? String(v).toLowerCase() : v) : st.kieu === 'tat');
  const ghiDs = (arr) => {
    if (!arr.length) { onLoc(RONG); return; }   // bỏ hết -> không dòng nào
    if (arr.length === ds.length) { onLoc(''); return; }
    onLoc(loai === 'chu' ? '=' + arr.join(';') : (arr.length === 1 ? String(arr[0]) : arr.join(';')));
  };
  const batTat = (v) => {
    const cur = chon ? ds.map((x) => x.v).filter((x) => daChon(x)) : ds.map((x) => x.v);
    ghiDs(daChon(v) ? cur.filter((x) => x !== v) : [...cur, v]);
  };
  const datKieu = (kieu) => {
    if (kieu === 'tat') onLoc('');
    else if (kieu === 'eq0') onLoc('0');
    else if (kieu === 'ne0') onLoc('!=0');
    else if (kieu === 'gt0') onLoc('>0');
  };
  const so = (s) => String(s).replace(',', '.').trim();
  const hopLe = (s) => /^-?\d+(?:\.\d+)?$/.test(so(s));
  const nhan = (v) => (loai === 'chu' ? v : nhanSo ? nhanSo(v) : (+v).toLocaleString('vi-VN'));

  if (!vt) return null;
  return createPortal(
    <div ref={hop} className="lc-hop" role="dialog" aria-label={'Lọc ' + ten} style={{ left: vt.left, top: vt.top, width: vt.W, maxHeight: vt.maxH }}
      onMouseDown={(e) => e.stopPropagation()}>
      <div className="lc-hop-dau"><b>{ten}</b><button type="button" className="lc-x" onClick={onDong} aria-label="Đóng">×</button></div>

      <div className="lc-muc">Sắp xếp</div>
      <div className="lc-seg">
        {(loai === 'chu' ? [[1, 'A → Z'], [-1, 'Z → A']] : [[-1, '↓ Lớn → nhỏ'], [1, '↑ Nhỏ → lớn']]).map(([g, t]) => (
          <button type="button" key={g} className={sap === g ? 'on' : ''} onClick={() => onSap(sap === g ? null : { k, g })}>{t}</button>
        ))}
      </div>

      <div className="lc-muc">Điều kiện</div>
      {loai === 'chu' ? (
        <div className="lc-dong"><span>Chứa</span>
          <input className="lc-inp" value={chua} placeholder="gõ chữ cần tìm…" autoFocus
            aria-label="Chứa" onChange={(e) => { setChua(e.target.value); onLoc(e.target.value.trim().startsWith('=') ? '' : e.target.value); }} /></div>
      ) : (<>
        <div className="lc-chip">
          {[['tat', 'Tất cả'], ['eq0', '= 0'], ['ne0', '≠ 0'], ['gt0', '> 0']].map(([kk, t]) => (
            <button type="button" key={kk} className={st.kieu === kk ? 'on' : ''} onClick={() => datKieu(kk)}>{t}</button>
          ))}
        </div>
        <div className={'lc-dong' + (st.kieu === 'ge' ? ' on' : '')}><span>≥</span>
          <input className="lc-inp" inputMode="decimal" value={ge} placeholder="lớn hơn hoặc bằng…" aria-label="Lớn hơn hoặc bằng"
            onChange={(e) => { setGe(e.target.value); if (hopLe(e.target.value)) onLoc('>=' + so(e.target.value)); else if (!e.target.value.trim() && st.kieu === 'ge') onLoc(''); }} /></div>
        <div className={'lc-dong' + (st.kieu === 'le' ? ' on' : '')}><span>≤</span>
          <input className="lc-inp" inputMode="decimal" value={le} placeholder="nhỏ hơn hoặc bằng…" aria-label="Nhỏ hơn hoặc bằng"
            onChange={(e) => { setLe(e.target.value); if (hopLe(e.target.value)) onLoc('<=' + so(e.target.value)); else if (!e.target.value.trim() && st.kieu === 'le') onLoc(''); }} /></div>
        <div className={'lc-dong lc-khoang' + (st.kieu === 'khoang' ? ' on' : '')}><span>Từ</span>
          <input className="lc-inp" inputMode="decimal" value={ka} placeholder="a" aria-label="Từ"
            onChange={(e) => { setKa(e.target.value); if (hopLe(e.target.value) && hopLe(kb)) onLoc(so(e.target.value) + '..' + so(kb)); }} />
          <span>đến</span>
          <input className="lc-inp" inputMode="decimal" value={kb} placeholder="b" aria-label="Đến"
            onChange={(e) => { setKb(e.target.value); if (hopLe(ka) && hopLe(e.target.value)) onLoc(so(ka) + '..' + so(e.target.value)); }} />
        </div>
      </>)}
      {st.kieu === 'khac' && <div className="lc-ghi">Đang lọc theo ô gõ tay: <b>{st.a}</b></div>}

      {ds.length > 0 && (<>
        <div className="lc-muc lc-muc-ds">
          <span>Chọn giá trị</span>
          <button type="button" onClick={() => onLoc('')}>Chọn hết</button>
          <button type="button" onClick={() => ghiDs([])}>Bỏ hết</button>
        </div>
        {ds.length > 8 && <input className="lc-inp lc-tim" value={tim} placeholder={`Tìm trong ${ds.length.toLocaleString('vi-VN')} giá trị…`} onChange={(e) => setTim(e.target.value)} />}
        <div className="lc-ds">
          {dsHien.map(({ v, n }) => (
            <label key={String(v)} className="lc-ds-dong">
              <input type="checkbox" checked={daChon(v)} onChange={() => batTat(v)} />
              <span className="lc-ds-v">{nhan(v)}</span><em>{n.toLocaleString('vi-VN')}</em>
            </label>
          ))}
          {dsHien.length === 300 && <div className="lc-ghi">Còn nữa — gõ để tìm</div>}
        </div>
      </>)}

      <div className="lc-cuoi">
        <button type="button" className="lc-xoa" disabled={!loc && !sap} onClick={() => { onLoc(''); if (sap) onSap(null); setGe(''); setLe(''); setKa(''); setKb(''); setChua(''); }}>Xoá lọc cột</button>
        <button type="button" className="lc-xong" onClick={onDong}>Xong</button>
      </div>
    </div>,
    document.body,
  );
}
