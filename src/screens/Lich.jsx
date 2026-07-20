import { useEffect, useMemo, useRef, useState } from 'react';
import { sb, rpcHet, TRANG_THAI, fmtDT } from '../lib/supabase.js';
import { DateBox, Sel, isoVN } from '../lib/ui.jsx';
import { useApp } from '../App.jsx';

const iso = (d = new Date()) => isoVN(d);
const fmtDM = (s) => s.slice(8, 10) + '/' + s.slice(5, 7);
const THU = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const THU_DAY = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
const dow = (s) => new Date(s + 'T00:00:00').getDay();
const themNgay = (s, n) => iso(new Date(new Date(s + 'T00:00:00').getTime() + n * 864e5));

export default function Lich() {
  const { user, baoToast } = useApp();
  const homNay = iso(new Date());
  const suaDuoc = ['DIEU_PHOI', 'ADMIN'].includes(user.vai_tro);
  const [tab, setTab] = useState('LICH');
  const [tu, setTu] = useState(iso(new Date(Date.now() - 3 * 864e5)));
  const [den, setDen] = useState(iso(new Date(Date.now() + 28 * 864e5)));
  const [rows, setRows] = useState(null);

  const tai = async () => {
    const { data, error } = await rpcHet('fn_lich_matran', { p_tu: tu, p_den: den });
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    setRows(data || []);
  };
  useEffect(() => { tai(); }, [tu, den]);

  // ngày -> [{ch, daGui}]
  const theoNgay = useMemo(() => {
    const m = {};
    (rows || []).forEach((r) => {
      const gui = new Set(r.ngay_gui || []);
      (r.ngay_lich || []).forEach((n) => (m[n] || (m[n] = [])).push({ ...r, daGui: gui.has(n) }));
    });
    return m;
  }, [rows]);

  const setLichLocal = (ma_ch, ngay, co) => setRows((rs) => rs.map((x) => x.ma_ch !== ma_ch ? x : {
    ...x, ngay_lich: co ? [...new Set([...x.ngay_lich, ngay])].sort() : x.ngay_lich.filter((n) => n !== ngay),
  }));

  const toggleO = async (ma_ch, ngay, dangCo) => {
    if (!suaDuoc) return;
    const { error } = await sb.rpc('fn_sua_lich_ngay', { p_token: user.token, p_ma_ch: ma_ch, p_ngay: ngay, p_co: !dangCo });
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    setLichLocal(ma_ch, ngay, !dangCo);
    baoToast(dangCo ? 'Đã bỏ lịch' : 'Đã thêm lịch');
  };
  const chuyenO = async (ma_ch, tuN, denN) => {
    if (!suaDuoc) return;
    const { error } = await sb.rpc('fn_lich_chuyen', { p_token: user.token, p_ma_ch: ma_ch, p_tu_ngay: tuN, p_den_ngay: denN });
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    setLichLocal(ma_ch, tuN, false); setLichLocal(ma_ch, denN, true);
    baoToast(`Đã chuyển sang ${fmtDM(denN)}`);
  };

  return (
    <>
      <div className="cmdbar">
        <h1>Lịch đề nghị hàng hóa</h1>
        <div className="sub">N1 · 2 lần/tuần — N2 · 1 lần/tuần — N3 · chu kỳ ~11 ngày. Cửa hàng đề nghị hôm trước, kho lấy hôm sau (né T7/CN).</div>
      </div>

      <div className="nhom-tabs" style={{ marginTop: 14, marginBottom: 0 }}>
        {[['LICH', 'Lịch tổng'], ['TUANTHU', 'Tuân thủ'], ['NHOM', 'Data nhóm'], ['AUTO', 'Ma trận & Tạo lịch'], ['PHIEU', 'Điều chuyển kho']].map(([v, t]) => (
          <button key={v} className={'nhom-tab' + (tab === v ? ' on' : '')} onClick={() => setTab(v)}>{t}</button>
        ))}
      </div>

      {tab === 'LICH' && <TabLich {...{ theoNgay, homNay, tu, den, setTu, setDen, toggleO, chuyenO, suaDuoc, rows }} />}
      {tab === 'TUANTHU' && <TabTuanThu {...{ tu, den, setTu, setDen }} />}
      {tab === 'NHOM' && <TabNhom {...{ tu, den, taiLai: tai }} />}
      {tab === 'AUTO' && <TabAuto {...{ rows, homNay, taiLai: tai }} />}
      {tab === 'PHIEU' && <TabPhieu />}
    </>
  );
}

// ============ LỊCH TỔNG — calendar ============
function TabLich({ theoNgay, homNay, tu, den, setTu, setDen, toggleO, chuyenO, suaDuoc, rows }) {
  const [kv, setKv] = useState('ALL');
  const [nhom, setNhom] = useState('ALL');
  const [openNgay, setOpenNgay] = useState(null);
  const dsKV = useMemo(() => [...new Set((rows || []).map((r) => r.khu_vuc).filter(Boolean))].sort(), [rows]);
  const loc = (ds) => (ds || []).filter((r) => (kv === 'ALL' || r.khu_vuc === kv) && (nhom === 'ALL' || String(r.nhom_ch) === nhom));

  const tuan = useMemo(() => {
    const start = new Date(tu + 'T00:00:00');
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const end = new Date(den + 'T00:00:00'); const weeks = []; let cur = new Date(start); let g = 0;
    while (cur <= end && g < 14) { const d = []; for (let i = 0; i < 7; i++) { d.push(iso(cur)); cur = new Date(cur.getTime() + 864e5); } weeks.push(d); g++; }
    return weeks;
  }, [tu, den]);

  return (
    <>
      <div className="card" style={{ marginTop: 14, padding: 16 }}>
        <div className="lich2-toolbar">
          <div className="lich2-toolbar-l">
            <DateBox label="Từ" value={tu} onChange={setTu} />
            <DateBox label="Đến" value={den} onChange={setDen} />
          </div>
          <div className="lich2-toolbar-r">
            <div className="nhom-tabs" style={{ margin: 0 }}>
              {[['ALL', 'Tất cả'], ['1', 'N1'], ['2', 'N2'], ['3', 'N3']].map(([v, t]) => (
                <button key={v} className={'nhom-tab' + (nhom === v ? ' on' : '')} onClick={() => setNhom(v)}>{t}</button>
              ))}
            </div>
            <Sel value={kv} onChange={setKv} placeholder="Khu vực"
              options={[{ value: 'ALL', label: 'Mọi khu vực' }, ...dsKV.map((k) => ({ value: k, label: k }))]} style={{ minWidth: 190 }} />
          </div>
        </div>

        <div className="cal-head">
          {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((t, i) => (
            <div key={t} className={'cal-head-c' + (i >= 5 ? ' cuoi' : '')}>{t}</div>
          ))}
        </div>
        <div className="cal-grid">
          {tuan.map((week) => week.map((n) => {
            const d = dow(n); const cuoiTuan = d === 0 || d === 6;
            const ds = loc(theoNgay[n]); const gui = ds.filter((r) => r.daGui).length;
            const inRange = n >= tu && n <= den;
            return (
              <div key={n} className={'cal-cell' + (n === homNay ? ' homnay' : '') + (cuoiTuan ? ' cuoi' : '') + (!inRange ? ' mo' : '') + (ds.length ? ' co' : '')}
                onClick={() => ds.length && setOpenNgay(n)}>
                <div className="cal-cell-top">
                  <span className="cal-cell-day">{n.slice(8, 10)}<span className="cal-cell-mm">/{n.slice(5, 7)}</span></span>
                  {n === homNay && <span className="cal-today-tag">hôm nay</span>}
                </div>
                {ds.length > 0 && (
                  <div className="cal-cell-body">
                    {n <= homNay
                      ? <div className="cal-frac"><b>{gui}</b><span>/{ds.length}</span></div>
                      : <div className="cal-count">{ds.length}</div>}
                    <div className="cal-nhom">
                      {[1, 2, 3].map((nn) => { const c = ds.filter((r) => r.nhom_ch === nn).length;
                        return c ? <span key={nn} className={'cal-nhom-dot n' + nn} title={'N' + nn + ': ' + c}>{c}</span> : null; })}
                    </div>
                  </div>
                )}
              </div>
            );
          }))}
        </div>
        <div className="cal-legend">
          <span><i className="cal-dot n1" />N1</span><span><i className="cal-dot n2" />N2</span><span><i className="cal-dot n3" />N3</span>
          <span style={{ marginLeft: 16, color: 'var(--ink-2)' }}><b style={{ color: 'var(--teal-deep)' }}>số xanh</b> = đã gửi / tổng lịch ngày đó</span>
          <span style={{ marginLeft: 'auto', color: 'var(--ink-2)' }}>Bấm ngày để xem chi tiết{suaDuoc ? ' · chuyển · thêm/bỏ' : ''}</span>
        </div>
      </div>

      {openNgay && (
        <NgayModal ngay={openNgay} theoNgay={theoNgay} loc={loc} homNay={homNay} rows={rows}
          onClose={() => setOpenNgay(null)} onNav={(delta) => setOpenNgay((n) => themNgay(n, delta))}
          toggleO={toggleO} chuyenO={chuyenO} suaDuoc={suaDuoc} />
      )}
    </>
  );
}

function NgayModal({ ngay, theoNgay, loc, homNay, rows, onClose, onNav, toggleO, chuyenO, suaDuoc }) {
  const ds = loc(theoNgay[ngay]).sort((a, b) => a.nhom_ch - b.nhom_ch);
  const [them, setThem] = useState(false);
  const [q, setQ] = useState('');
  const [chuyen, setChuyen] = useState(null);   // ma_ch đang chọn ngày chuyển
  const coRoi = new Set(ds.map((r) => r.ma_ch));
  const conLai = (rows || []).filter((r) => !coRoi.has(r.ma_ch) && (!q || (r.ten + r.ma_ch).toLowerCase().includes(q.toLowerCase()))).slice(0, 40);
  const gui = ds.filter((r) => r.daGui).length;

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal lich2-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <button className="cal-nav" onClick={() => onNav(-1)} title="Ngày trước">‹</button>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{THU_DAY[dow(ngay)]}, {fmtDM(ngay)}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>{gui}/{ds.length} đã gửi · {ds.length} theo lịch</div>
          </div>
          <button className="cal-nav" onClick={() => onNav(1)} title="Ngày sau">›</button>
          <button className="modal-x" onClick={onClose} style={{ marginLeft: 8 }}>✕</button>
        </div>
        <div className="modal-body" style={{ maxHeight: '62vh', overflow: 'auto' }}>
          <div className="lich2-list">
            {ds.map((r) => (
              <div key={r.ma_ch} className={'lich2-item' + (r.daGui ? ' ok' : ngay < homNay ? ' warn' : '')}>
                <span className={'tag-n tag-n' + r.nhom_ch}>N{r.nhom_ch}</span>
                <div className="lich2-item-ten"><div>{r.ten}</div><div className="lich2-item-sub">{r.ma_ch} · {r.khu_vuc}</div></div>
                {r.daGui ? <span className="lich2-tick">✓ đã gửi</span> : ngay < homNay ? <span className="lich2-x">✕ bỏ lỡ</span> : null}
                {suaDuoc && (chuyen === r.ma_ch
                  ? <span className="lich2-chuyen-wrap" onClick={(e) => e.stopPropagation()}>
                      <DateBox value={ngay} onChange={(nv) => { chuyenO(r.ma_ch, ngay, nv); setChuyen(null); }} />
                      <button className="btn-mini" onClick={() => setChuyen(null)}>Hủy</button>
                    </span>
                  : <span style={{ display: 'flex', gap: 5 }}>
                      <button className="btn-mini btn-mini-teal" onClick={() => setChuyen(r.ma_ch)}>Chuyển</button>
                      <button className="btn-mini btn-mini-danger" onClick={() => toggleO(r.ma_ch, ngay, true)}>Bỏ</button>
                    </span>)}
              </div>
            ))}
            {ds.length === 0 && <div className="lich2-empty">Ngày này chưa có cửa hàng nào.</div>}
          </div>
          {suaDuoc && (
            <div style={{ marginTop: 14 }}>
              {!them ? <button className="btn btn-teal btn-sm" onClick={() => setThem(true)}>+ Thêm cửa hàng vào ngày này</button>
                : <>
                    <input className="inp" autoFocus placeholder="Tìm cửa hàng để thêm…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
                    <div className="lich2-add-list">
                      {conLai.map((r) => (
                        <button key={r.ma_ch} className="lich2-add-item" onClick={() => toggleO(r.ma_ch, ngay, false)}>
                          <span className={'tag-n tag-n' + r.nhom_ch}>N{r.nhom_ch}</span> {r.ten}
                          <span className="lich2-item-sub" style={{ marginLeft: 'auto' }}>{r.ma_ch}</span>
                        </button>
                      ))}
                    </div>
                  </>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============ TUÂN THỦ ============
function TabTuanThu({ tu, den, setTu, setDen }) {
  const { baoToast } = useApp();
  const [rows, setRows] = useState(null);
  const [loc, setLoc] = useState('ALL');
  const [sortC, setSortC] = useState({ col: 'pct', dir: 'asc' });
  useEffect(() => { (async () => {
    const { data, error } = await rpcHet('fn_lich_tuanthu', { p_tu: tu, p_den: den });
    if (error) { baoToast('Lỗi: ' + error.message); return; } setRows(data || []);
  })(); }, [tu, den]);

  const tk = useMemo(() => { const v = rows || []; return {
    tongLich: v.reduce((s, r) => s + (r.so_lich || 0), 0), dung: v.reduce((s, r) => s + (r.dung_lich || 0), 0),
    lo: v.reduce((s, r) => s + (r.bo_lo || 0), 0), ngoai: v.reduce((s, r) => s + (r.ngoai_lich || 0), 0),
    tot: v.filter((r) => r.pct != null && r.pct >= 80).length }; }, [rows]);
  const hien = useMemo(() => {
    let v = [...(rows || [])];
    if (loc === 'LO') v = v.filter((r) => r.bo_lo > 0);
    else if (loc === 'NGOAI') v = v.filter((r) => r.ngoai_lich > 0);
    else if (loc === 'TOT') v = v.filter((r) => r.pct != null && r.pct >= 80);
    const g = { ten: (r) => r.ten, nhom: (r) => r.nhom_ch, lich: (r) => r.so_lich, dung: (r) => r.dung_lich,
      lo: (r) => r.bo_lo, ngoai: (r) => r.ngoai_lich, pct: (r) => r.pct ?? -1 }[sortC.col];
    v.sort((a, b) => { const x = g(a), y = g(b); const c = typeof x === 'string' ? x.localeCompare(y) : x - y; return sortC.dir === 'asc' ? c : -c; });
    return v;
  }, [rows, loc, sortC]);
  const ds = (c) => setSortC((s) => ({ col: c, dir: s.col === c && s.dir === 'desc' ? 'asc' : 'desc' }));
  const ic = (c) => sortC.col === c ? (sortC.dir === 'asc' ? ' ▲' : ' ▼') : '';
  const The = ({ id, n, t }) => (
    <button className={'the-g' + (loc === id ? ' on' : '')} onClick={() => setLoc(id)}>
      <span className="the-g-n">{n}</span><span className="the-g-t">{t}</span>
    </button>
  );

  return (
    <>
      <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <DateBox label="Từ" value={tu} onChange={setTu} /><DateBox label="Đến" value={den} onChange={setDen} />
        <span style={{ color: 'var(--ink-2)', fontSize: 12 }}>Bấm thẻ để lọc bảng</span>
      </div>
      <div className="the-hang" style={{ marginTop: 12 }}>
        <The id="ALL" n={`${tk.dung}/${tk.tongLich}`} t="Gửi đúng lịch" />
        <The id="LO" n={tk.lo} t="Bỏ lỡ (quá ngày)" />
        <The id="NGOAI" n={tk.ngoai} t="Gửi ngoài lịch" />
        <The id="TOT" n={tk.tot} t="Tuân thủ tốt (≥80%)" />
      </div>
      <div className="card" style={{ marginTop: 12, padding: 0, overflow: 'hidden' }}>
        <div className="tbl-wrap" style={{ maxHeight: '56vh', overflow: 'auto' }}>
          <table className="tbl tbl-fit">
            <thead><tr>
              <th className="sortable" onClick={() => ds('ten')}>Cửa hàng{ic('ten')}</th>
              <th className="center sortable" onClick={() => ds('nhom')}>Nhóm{ic('nhom')}</th>
              <th className="num sortable" onClick={() => ds('lich')}>Số lịch{ic('lich')}</th>
              <th className="num sortable" onClick={() => ds('dung')}>Đúng{ic('dung')}</th>
              <th className="num sortable" onClick={() => ds('lo')}>Bỏ lỡ{ic('lo')}</th>
              <th className="num sortable" onClick={() => ds('ngoai')}>Ngoài lịch{ic('ngoai')}</th>
              <th className="num sortable" onClick={() => ds('pct')}>Tuân thủ{ic('pct')}</th>
            </tr></thead>
            <tbody>
              {hien.map((r) => (
                <tr key={r.ma_ch} className={r.bo_lo > 0 ? 'row-lo' : ''}>
                  <td><div style={{ fontWeight: 600 }}>{r.ten}</div><div className="mono" style={{ fontSize: 10, color: 'var(--ink-2)' }}>{r.ma_ch} · {r.khu_vuc}</div></td>
                  <td className="center"><span className={'tag-n tag-n' + r.nhom_ch}>N{r.nhom_ch}</span></td>
                  <td className="num">{r.so_lich}</td>
                  <td className="num" style={{ color: 'var(--teal-deep)', fontWeight: 700 }}>{r.dung_lich}</td>
                  <td className="num" style={{ color: r.bo_lo > 0 ? 'var(--magenta)' : undefined, fontWeight: r.bo_lo > 0 ? 700 : 400 }}>{r.bo_lo}</td>
                  <td className="num">{r.ngoai_lich}</td>
                  <td className="num"><PctBar pct={r.pct} /></td>
                </tr>
              ))}
              {hien.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--ink-2)' }}>Không có dữ liệu.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
function PctBar({ pct }) {
  if (pct == null) return <span style={{ color: 'var(--ink-2)' }}>—</span>;
  const m = pct >= 80 ? 'var(--teal-deep)' : pct >= 50 ? 'var(--gold)' : 'var(--magenta)';
  return <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
    <div style={{ width: 46, height: 6, borderRadius: 4, background: 'var(--line)', overflow: 'hidden' }}><div style={{ width: pct + '%', height: '100%', background: m }} /></div>
    <b style={{ color: m, minWidth: 34, textAlign: 'right' }}>{pct}%</b></div>;
}

// ============ DATA NHÓM ============
function TabNhom({ tu, den, taiLai }) {
  const { user, baoToast } = useApp();
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState(''); const [nhom, setNhom] = useState('ALL'); const [kv, setKv] = useState('ALL');
  const [sortC, setSortC] = useState({ col: 'nhom', dir: 'asc' });
  const tai = async () => {
    const { data, error } = await rpcHet('fn_ds_nhom_ch', { p_tu: tu, p_den: den });
    if (error) { baoToast('Lỗi: ' + error.message); return; } setRows(data || []);
  };
  useEffect(() => { tai(); }, [tu, den]);
  const doiNhom = async (ma_ch, n) => {
    const { error } = await sb.rpc('fn_sua_nhom_ch', { p_token: user.token, p_ma_ch: ma_ch, p_nhom: n });
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    setRows((rs) => rs.map((r) => r.ma_ch === ma_ch ? { ...r, nhom_ch: n } : r));
    baoToast(`${ma_ch} → Nhóm ${n}`); taiLai && taiLai();
  };
  const dsKV = useMemo(() => [...new Set((rows || []).map((r) => r.khu_vuc).filter(Boolean))].sort(), [rows]);
  const hien = useMemo(() => {
    let v = [...(rows || [])];
    if (nhom !== 'ALL') v = v.filter((r) => String(r.nhom_ch) === nhom);
    if (kv !== 'ALL') v = v.filter((r) => r.khu_vuc === kv);
    if (q.trim()) v = v.filter((r) => (r.ten + r.ma_ch).toLowerCase().includes(q.toLowerCase()));
    const g = { ten: (r) => r.ten, nhom: (r) => r.nhom_ch, lich: (r) => r.so_lich_ky, ban: (r) => Number(r.ban_30) }[sortC.col];
    v.sort((a, b) => { const x = g(a), y = g(b); const c = typeof x === 'string' ? x.localeCompare(y) : x - y; return sortC.dir === 'asc' ? c : -c; });
    return v;
  }, [rows, nhom, kv, q, sortC]);
  const ds = (c) => setSortC((s) => ({ col: c, dir: s.col === c && s.dir === 'desc' ? 'asc' : 'desc' }));
  const ic = (c) => sortC.col === c ? (sortC.dir === 'asc' ? ' ▲' : ' ▼') : '';
  const chuaLich = (rows || []).filter((r) => r.so_lich_ky === 0).length;

  return (
    <>
      <div className="card" style={{ marginTop: 14, padding: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="nhom-tabs" style={{ margin: 0 }}>
          {[['ALL', 'Tất cả'], ['1', 'N1'], ['2', 'N2'], ['3', 'N3']].map(([v, t]) => (
            <button key={v} className={'nhom-tab' + (nhom === v ? ' on' : '')} onClick={() => setNhom(v)}>{t}</button>
          ))}
        </div>
        <Sel value={kv} onChange={setKv} placeholder="Khu vực" options={[{ value: 'ALL', label: 'Mọi khu vực' }, ...dsKV.map((k) => ({ value: k, label: k }))]} style={{ minWidth: 180 }} />
        <input className="inp" placeholder="Tìm cửa hàng…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 200 }} />
        <span className="sla-chip">{hien.length} nơi bán</span>
        {chuaLich > 0 && <span className="sla-chip" style={{ background: 'rgba(214,0,108,.1)', color: 'var(--magenta)' }}>{chuaLich} chưa có lịch kỳ này</span>}
      </div>
      <div className="card" style={{ marginTop: 12, padding: 0, overflow: 'hidden' }}>
        <div className="tbl-wrap" style={{ maxHeight: '60vh', overflow: 'auto' }}>
          <table className="tbl tbl-fit">
            <thead><tr>
              <th className="sortable" onClick={() => ds('ten')}>Cửa hàng{ic('ten')}</th>
              <th className="center">Đổi nhóm</th>
              <th className="num sortable" onClick={() => ds('ban')}>Bán 30 ngày{ic('ban')}</th>
              <th className="num sortable" onClick={() => ds('lich')}>Lịch kỳ này{ic('lich')}</th>
            </tr></thead>
            <tbody>
              {hien.map((r) => (
                <tr key={r.ma_ch}>
                  <td><div style={{ fontWeight: 600 }}>{r.ten}</div><div className="mono" style={{ fontSize: 10, color: 'var(--ink-2)' }}>{r.ma_ch} · {r.khu_vuc}</div></td>
                  <td className="center">
                    <div className="nhom-tabs" style={{ margin: 0, display: 'inline-flex', flexWrap: 'nowrap' }}>
                      {[1, 2, 3].map((n) => (
                        <button key={n} className={'nhom-tab' + (r.nhom_ch === n ? ' on' : '')} style={{ height: 30, padding: '0 11px', fontSize: 12 }} onClick={() => doiNhom(r.ma_ch, n)}>N{n}</button>
                      ))}
                    </div>
                  </td>
                  <td className="num">{Number(r.ban_30).toLocaleString('vi')}</td>
                  <td className="num">{r.so_lich_ky === 0
                    ? <span style={{ color: 'var(--magenta)', fontWeight: 700 }}>chưa có</span>
                    : <span style={{ color: 'var(--teal-deep)', fontWeight: 700 }}>{r.so_lich_ky}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ============ MA TRẬN — tổng quan + tạo lịch tự động + nhập/xuất ============
function TabAuto({ rows, homNay, taiLai }) {
  const { user, baoToast } = useApp();
  const [tuM, setTuM] = useState(iso(new Date(Date.now() - 3 * 864e5)));
  const [denM, setDenM] = useState(iso(new Date(Date.now() + 28 * 864e5)));
  const [kv, setKv] = useState('ALL');
  const [nhom, setNhom] = useState('ALL');
  const [q, setQ] = useState('');
  const [preview, setPreview] = useState(null);   // Set "ma_ch|ngay" các ô MỚI tạo
  const [local, setLocal] = useState(null);       // ma trận cục bộ khi có preview
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const base = local || rows || [];
  const dsKV = useMemo(() => [...new Set(base.map((r) => r.khu_vuc).filter(Boolean))].sort(), [base]);
  const dsNgay = useMemo(() => {
    const out = []; let d = new Date(tuM + 'T00:00:00'); const e = new Date(denM + 'T00:00:00');
    while (d <= e && out.length < 70) { out.push(iso(d)); d = new Date(d.getTime() + 864e5); }
    return out;
  }, [tuM, denM]);

  const hien = useMemo(() => base.filter((r) =>
    (kv === 'ALL' || r.khu_vuc === kv) && (nhom === 'ALL' || String(r.nhom_ch) === nhom) &&
    (!q.trim() || (r.ten + r.ma_ch).toLowerCase().includes(q.toLowerCase()))
  ), [base, kv, nhom, q]);

  // Thống kê
  const tk = useMemo(() => {
    let oLich = 0, chuaCo = 0;
    hien.forEach((r) => {
      const c = (r.ngay_lich || []).filter((n) => n >= tuM && n <= denM).length;
      oLich += c; if (c === 0) chuaCo++;
    });
    return { oLich, chuaCo, tong: hien.length, moi: preview ? preview.size : 0 };
  }, [hien, tuM, denM, preview]);

  // TẠO LỊCH TỰ ĐỘNG (preview phía client) — N1/N2 giữ thứ kỳ trước, N3 chu kỳ ~11, né T7/CN
  const taoTuDong = () => {
    const moi = new Set();
    const next = base.map((r) => {
      const cu = new Set(r.ngay_lich || []);
      const truoc = (r.ngay_lich || []).filter((n) => n < tuM);
      if (r.nhom_ch === 1 || r.nhom_ch === 2) {
        // các thứ (dow) đã dùng gần đây; mặc định N1 T2+T5, N2 T3
        let dows = [...new Set(truoc.slice(-8).map((n) => dow(n)))];
        if (!dows.length) dows = r.nhom_ch === 1 ? [1, 4] : [2];
        dsNgay.forEach((n) => {
          const d = dow(n);
          if (d !== 0 && d !== 6 && dows.includes(d) && n >= tuM && !cu.has(n)) {
            cu.add(n); moi.add(r.ma_ch + '|' + n);
          }
        });
      } else {
        // N3: chu kỳ trung bình kỳ trước (fallback 11), tiếp từ ngày cuối
        const sorted = truoc.slice().sort();
        let ck = 11;
        if (sorted.length >= 2) {
          let tot = 0, cnt = 0;
          for (let i = 1; i < sorted.length; i++) {
            const kc = Math.round((new Date(sorted[i]) - new Date(sorted[i - 1])) / 864e5);
            if (kc >= 5 && kc <= 20) { tot += kc; cnt++; }
          }
          if (cnt) ck = Math.round(tot / cnt);
        }
        let d = sorted.length ? themNgay(sorted[sorted.length - 1], ck)
          : themNgay(tuM, Math.abs(hashStr(r.ma_ch)) % ck);
        let guard = 0;
        while (d <= denM && guard++ < 40) {
          if (d >= tuM) {
            let dd = d; const w = dow(dd);
            if (w === 6) dd = themNgay(dd, -1); else if (w === 0) dd = themNgay(dd, 1);
            if (!cu.has(dd)) { cu.add(dd); moi.add(r.ma_ch + '|' + dd); }
          }
          d = themNgay(d, ck);
        }
      }
      return { ...r, ngay_lich: [...cu].sort() };
    });
    setLocal(next); setPreview(moi);
    baoToast(`Xem trước: sẽ tạo ${moi.size} ngày-lịch mới. Kiểm tra rồi Xác nhận.`);
  };

  const xacNhan = async () => {
    if (!preview || !preview.size) return;
    setBusy(true);
    // Gom ô mới thành rows import CHỈ cho khoảng [tuM,denM] — nhưng import xóa cả kỳ,
    // nên ta ghi từng ô mới bằng fn_sua_lich_ngay (an toàn, không xóa lịch cũ).
    let ok = 0;
    for (const key of preview) {
      const [ma_ch, ngay] = key.split('|');
      const { error } = await sb.rpc('fn_sua_lich_ngay', { p_token: user.token, p_ma_ch: ma_ch, p_ngay: ngay, p_co: true });
      if (!error) ok++;
    }
    setBusy(false);
    baoToast(`Đã tạo ${ok} ngày-lịch mới`);
    setPreview(null); setLocal(null); taiLai();
  };
  const huyPreview = () => { setPreview(null); setLocal(null); };

  // Tick 1 ô (chỉ khi không ở chế độ preview)
  const tick = async (r, ngay, dangCo) => {
    if (preview) { baoToast('Đang xem trước — Xác nhận hoặc Hủy trước khi sửa tay'); return; }
    const { error } = await sb.rpc('fn_sua_lich_ngay', { p_token: user.token, p_ma_ch: r.ma_ch, p_ngay: ngay, p_co: !dangCo });
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    taiLai();
  };

  const docFile = async (file) => {
    if (!file) return; setBusy(true);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const rowsF = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
      const hdr = rowsF[0] || []; const colNgay = [];
      hdr.forEach((h, i) => { const m = String(h || '').trim().match(/^(\d{1,2})\/(\d{1,2})$/); if (m) colNgay.push({ idx: i, dd: +m[1], mm: +m[2] }); });
      if (!colNgay.length) { baoToast('Không thấy cột ngày dd/mm'); setBusy(false); return; }
      let nam = +tuM.slice(0, 4), truoc = colNgay[0].mm;
      const ngayCua = colNgay.map((c) => { if (c.mm < truoc) nam++; truoc = c.mm; return { idx: c.idx, iso: `${nam}-${String(c.mm).padStart(2, '0')}-${String(c.dd).padStart(2, '0')}` }; });
      const { data: dsCH } = await sb.from('cua_hang').select('ma_ch, ten').or('ma_ch.like.CH%,ma_ch.like.DB%');
      const map = {}; (dsCH || []).forEach((c) => { map[c.ten.trim().toUpperCase()] = c.ma_ch; });
      const out = [], kk = [];
      for (let i = 1; i < rowsF.length; i++) { const r = rowsF[i]; const ten = String(r?.[1] || '').trim(); if (!ten) continue;
        const ma = map[ten.toUpperCase()]; if (!ma) { if (String(r?.[0] || '').match(/^\d+$/)) kk.push(ten); continue; }
        ngayCua.forEach(({ idx, iso: is }) => { if (String(r[idx] || '').trim().toLowerCase() === 'x') out.push({ ma_ch: ma, ngay: is }); }); }
      const cac = out.map((o) => o.ngay).sort();
      if (!confirm(`Nhập ${out.length} ngày-lịch (${new Set(out.map(o=>o.ma_ch)).size} nơi bán, ${fmtDM(cac[0])}–${fmtDM(cac[cac.length-1])})?\nSẽ THAY lịch trong khoảng ngày của file.${kk.length?`\n⚠ ${kk.length} tên không khớp.`:''}`)) { setBusy(false); return; }
      const { data, error } = await sb.rpc('fn_lich_import', { p_token: user.token, p_tu: cac[0], p_den: cac[cac.length - 1], p_rows: out });
      if (error) { baoToast('Lỗi: ' + error.message); setBusy(false); return; }
      baoToast(`Đã nhập ${data?.them_moi} ngày-lịch`); taiLai();
    } catch (e) { baoToast('Lỗi đọc file: ' + e.message); }
    setBusy(false); if (fileRef.current) fileRef.current.value = '';
  };
  const xuatFile = async () => {
    const XLSX = await import('xlsx');
    const hdr = ['STT', 'TÊN CỬA HÀNG', 'KHU VỰC', 'NHÓM', ...dsNgay.map(fmtDM), 'TỔNG/CH'];
    const rowsX = hien.map((r, i) => { const l = new Set(r.ngay_lich || []); const cells = dsNgay.map((n) => l.has(n) ? 'x' : ''); return [i + 1, r.ten, r.khu_vuc, 'N' + r.nhom_ch, ...cells, cells.filter(Boolean).length]; });
    const ws = XLSX.utils.aoa_to_sheet([hdr, ...rowsX]); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ma trận theo ngày'); XLSX.writeFile(wb, `LICH_${tuM}_${denM}.xlsx`);
  };

  return (
    <>
      {/* Thống kê */}
      <div className="the-hang" style={{ marginTop: 14 }}>
        <div className="the-g"><span className="the-g-n">{tk.tong}</span><span className="the-g-t">nơi bán</span></div>
        <div className="the-g"><span className="the-g-n" style={{ color: 'var(--teal-deep)' }}>{tk.oLich}</span><span className="the-g-t">ô lịch trong kỳ</span></div>
        <div className="the-g"><span className="the-g-n" style={{ color: tk.chuaCo ? 'var(--magenta)' : 'var(--teal-deep)' }}>{tk.chuaCo}</span><span className="the-g-t">nơi bán chưa có lịch</span></div>
        {preview && <div className="the-g on"><span className="the-g-n">+{tk.moi}</span><span className="the-g-t">ô mới (xem trước)</span></div>}
      </div>

      {/* Thanh công cụ */}
      <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <DateBox label="Từ" value={tuM} onChange={setTuM} />
        <DateBox label="Đến" value={denM} onChange={setDenM} />
        <div className="nhom-tabs" style={{ margin: 0 }}>
          {[['ALL', 'Tất cả'], ['1', 'N1'], ['2', 'N2'], ['3', 'N3']].map(([v, t]) => (
            <button key={v} className={'nhom-tab' + (nhom === v ? ' on' : '')} onClick={() => setNhom(v)}>{t}</button>
          ))}
        </div>
        <Sel value={kv} onChange={setKv} placeholder="Khu vực" options={[{ value: 'ALL', label: 'Mọi khu vực' }, ...dsKV.map((k) => ({ value: k, label: k }))]} style={{ minWidth: 170 }} />
        <input className="inp" placeholder="Tìm cửa hàng…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 180 }} />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {!preview ? (
            <>
              <button className="btn btn-ai" onClick={taoTuDong} disabled={busy}>✨ Tạo lịch tự động</button>
              <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>Nhập Excel
                <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={(e) => docFile(e.target.files?.[0])} /></label>
              <button className="btn btn-ghost" onClick={xuatFile}>Xuất Excel</button>
            </>
          ) : (
            <>
              <button className="btn btn-ai" onClick={xacNhan} disabled={busy}>✓ Xác nhận tạo {tk.moi} ô</button>
              <button className="btn btn-ghost" onClick={huyPreview}>Hủy xem trước</button>
            </>
          )}
        </div>
      </div>

      {preview && (
        <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(203,164,90,.12)', borderRadius: 8, fontSize: 12.5, color: '#8a6a24' }}>
          Đang xem trước — ô <b style={{ color: 'var(--gold)' }}>vàng</b> là lịch mới sẽ tạo. Bấm <b>Xác nhận</b> để lưu, hoặc <b>Hủy</b> để bỏ.
        </div>
      )}

      {/* MA TRẬN */}
      <div className="card" style={{ marginTop: 12, padding: 0, overflow: 'hidden' }}>
        <div className="tbl-wrap" style={{ maxHeight: '64vh', overflow: 'auto' }}>
          <table className="tbl mt2">
            <thead>
              <tr>
                <th className="mt2-ten">Cửa hàng</th>
                <th className="mt2-nhom">Nhóm</th>
                {dsNgay.map((n) => { const d = dow(n); return (
                  <th key={n} className={'mt2-ngay' + (n === homNay ? ' homnay' : '') + (d === 0 || d === 6 ? ' cuoi' : '')}>
                    <div className="mt2-dm">{n.slice(8, 10)}/{n.slice(5, 7)}</div><div className="mt2-thu">{THU[d]}</div>
                  </th>
                ); })}
              </tr>
            </thead>
            <tbody>
              {hien.map((r) => {
                const lich = new Set(r.ngay_lich || []);
                return (
                  <tr key={r.ma_ch}>
                    <td className="mt2-ten"><div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.ten}</div>
                      <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-2)' }}>{r.ma_ch}</div></td>
                    <td className="mt2-nhom center"><span className={'tag-n tag-n' + r.nhom_ch}>N{r.nhom_ch}</span></td>
                    {dsNgay.map((n) => {
                      const co = lich.has(n); const laMoi = preview && preview.has(r.ma_ch + '|' + n);
                      return (
                        <td key={n} className={'mt2-o' + (co ? ' co' : '') + (laMoi ? ' moi' : '') + (n === homNay ? ' homnay' : '')}
                          onClick={() => tick(r, n, co)} title={r.ten + ' · ' + fmtDM(n)}>
                          {laMoi ? '✦' : co ? '✓' : ''}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; } return h; }

// ============ PHIẾU ĐIỀU CHUYỂN — thống kê mọi phiếu (định kỳ + khẩn cấp) ============
// ============ ĐIỀU CHUYỂN KHO — trạng thái THẬT từ Odoo (app chỉ đọc) ============
// 4 trạng thái sheet: Chưa chuyển -> Chờ sẵn sàng -> Đã xuất -> Đã nhận.
const DCK_TT = ['Chưa chuyển', 'Chờ sẵn sàng', 'Đã xuất', 'Đã nhận'];
// Chuẩn hóa trạng thái về tiếng Việt (phòng dữ liệu cũ còn tiếng Anh trong DB).
const chuanDCK = (s) => {
  const k = String(s || '').trim().toLowerCase();
  if (k === 'not transfer') return 'Chưa chuyển';
  if (k === 'waiting available') return 'Chờ sẵn sàng';
  if (k === 'issued') return 'Đã xuất';
  if (k === 'received') return 'Đã nhận';
  return String(s || '').trim();
};
const dckClass = (tt) => ({ 'Chưa chuyển': 'dck-cho', 'Chờ sẵn sàng': 'dck-san',
  'Đã xuất': 'dck-xuat', 'Đã nhận': 'dck-nhan' }[tt] || 'dck-cho');

function TabPhieu() {
  const { baoToast } = useApp();
  const [tu, setTu] = useState(iso(new Date(Date.now() - 13 * 864e5)));
  const [den, setDen] = useState(iso());
  const [rows, setRows] = useState(null);
  const [locTT, setLocTT] = useState('');           // lọc trạng thái (bấm thẻ)
  const [locCH, setLocCH] = useState('');
  const [locKho, setLocKho] = useState('');         // kho nguồn
  const [q, setQ] = useState('');
  const [sortC, setSortC] = useState({ col: 'tao', dir: 'desc' });

  useEffect(() => { (async () => {
    setRows(null);
    const { data, error } = await rpcHet('fn_dck_ds', { p_tu: tu, p_den: den });
    if (error) { baoToast('Lỗi: ' + error.message); setRows([]); return; }
    setRows((data || []).map((r) => ({ ...r, trang_thai: chuanDCK(r.trang_thai) })));
  })(); }, [tu, den]);   // eslint-disable-line

  const dsCH = useMemo(() => {
    const m = new Map();
    (rows || []).forEach((r) => r.ma_ch && m.set(r.ma_ch, r.ten_ch || r.ma_ch));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([v, t]) => ({ value: v, label: t }));
  }, [rows]);
  const dsKho = useMemo(() => {
    const m = new Map();
    (rows || []).forEach((r) => r.ma_kho_nguon && m.set(r.ma_kho_nguon, r.ten_kho_nguon || r.ma_kho_nguon));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([v, t]) => ({ value: v, label: t }));
  }, [rows]);

  const tk = useMemo(() => {
    const v = rows || [];
    const dem = (tt) => v.filter((r) => r.trang_thai === tt).length;
    return { tong: v.length, cho: dem('Chưa chuyển'), san: dem('Chờ sẵn sàng'),
      xuat: dem('Đã xuất'), nhan: dem('Đã nhận') };
  }, [rows]);

  const hien = useMemo(() => {
    let v = [...(rows || [])];
    if (locTT) v = v.filter((r) => r.trang_thai === locTT);
    if (locCH) v = v.filter((r) => r.ma_ch === locCH);
    if (locKho) v = v.filter((r) => r.ma_kho_nguon === locKho);
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      v = v.filter((r) => (r.ma_phieu || '').toLowerCase().includes(t)
        || (r.ten_ch || '').toLowerCase().includes(t) || (r.ma_ch || '').toLowerCase().includes(t)
        || (r.ten_kho_nguon || '').toLowerCase().includes(t) || (r.khu_vuc || '').toLowerCase().includes(t));
    }
    const g = { phieu: (r) => r.ma_phieu, ch: (r) => r.ten_ch || '', kho: (r) => r.ten_kho_nguon || '',
      tt: (r) => DCK_TT.indexOf(r.trang_thai), tao: (r) => r.ngay_tao || '',
      ma: (r) => Number(r.so_ma), nhu: (r) => Number(r.tong_nhu_cau) }[sortC.col];
    if (g) v.sort((a, b) => { const x = g(a), y = g(b);
      const c = typeof x === 'string' ? x.localeCompare(y) : (x > y ? 1 : x < y ? -1 : 0);
      return sortC.dir === 'asc' ? c : -c; });
    return v;
  }, [rows, locTT, locCH, locKho, q, sortC]);
  const ds = (c) => setSortC((s) => ({ col: c, dir: s.col === c && s.dir === 'desc' ? 'asc' : 'desc' }));
  const ic = (c) => sortC.col === c ? (sortC.dir === 'asc' ? ' ▲' : ' ▼') : '';

  const xuat = async () => {
    const XLSX = await import('xlsx');
    const hdr = ['Mã phiếu', 'Trạng thái', 'Cửa hàng nhận', 'Mã CH', 'Khu vực', 'Kho nguồn', 'Ngày tạo', 'Ngày xuất', 'Số mã', 'Tổng nhu cầu', 'Đã nhập'];
    const data = hien.map((r) => [r.ma_phieu, r.trang_thai, r.ten_ch, r.ma_ch, r.khu_vuc,
      r.ten_kho_nguon, r.ngay_tao ? fmtDM(r.ngay_tao) + '/' + r.ngay_tao.slice(0,4) : '',
      r.ngay_xuat ? fmtDM(r.ngay_xuat) + '/' + r.ngay_xuat.slice(0,4) : '',
      Number(r.so_ma), Number(r.tong_nhu_cau), Number(r.tong_da_nhap)]);
    const ws = XLSX.utils.aoa_to_sheet([hdr, ...data]); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Điều chuyển kho'); XLSX.writeFile(wb, `DieuChuyenKho_${tu}_${den}.xlsx`);
  };
  const bamTT = (tt) => setLocTT((v) => v === tt ? '' : tt);

  return (
    <>
      <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <DateBox label="Từ" value={tu} onChange={setTu} />
        <DateBox label="Đến" value={den} onChange={setDen} />
        <Sel value={locCH} onChange={setLocCH} timKiem placeholder="Tất cả CH nhận"
          options={[{ value: '', label: 'Tất cả CH nhận' }, ...dsCH]} style={{ minWidth: 180 }} />
        <Sel value={locKho} onChange={setLocKho} timKiem placeholder="Mọi kho nguồn"
          options={[{ value: '', label: 'Mọi kho nguồn' }, ...dsKho]} style={{ minWidth: 170 }} />
        <input className="flt-in" placeholder="Tìm mã phiếu / CH / kho…" value={q}
          onChange={(e) => setQ(e.target.value)} style={{ height: 40, minWidth: 200, flex: 1 }} />
        <button className="btn btn-ghost" onClick={xuat}>Xuất Excel</button>
      </div>

      <div className="the-hang" style={{ marginTop: 12 }}>
        <button className={'the-g' + (locTT === '' ? ' on' : '')} onClick={() => setLocTT('')}>
          <span className="the-g-n">{tk.tong}</span><span className="the-g-t">tổng phiếu (mã DK)</span>
        </button>
        <button className={'the-g' + (locTT === 'Chưa chuyển' ? ' on' : '')} onClick={() => bamTT('Chưa chuyển')}>
          <span className="the-g-n" style={{ color: 'var(--ink-2)' }}>{tk.cho}</span><span className="the-g-t">chưa chuyển</span>
        </button>
        <button className={'the-g' + (locTT === 'Chờ sẵn sàng' ? ' on' : '')} onClick={() => bamTT('Chờ sẵn sàng')}>
          <span className="the-g-n" style={{ color: 'var(--gold)' }}>{tk.san}</span><span className="the-g-t">chờ sẵn sàng</span>
        </button>
        <button className={'the-g' + (locTT === 'Đã xuất' ? ' on' : '')} onClick={() => bamTT('Đã xuất')}>
          <span className="the-g-n" style={{ color: 'var(--teal-deep)' }}>{tk.xuat}</span><span className="the-g-t">đã xuất</span>
        </button>
        <button className={'the-g' + (locTT === 'Đã nhận' ? ' on' : '')} onClick={() => bamTT('Đã nhận')}>
          <span className="the-g-n" style={{ color: 'var(--magenta)' }}>{tk.nhan}</span><span className="the-g-t">đã nhận</span>
        </button>
      </div>

      <div className="card" style={{ marginTop: 12, padding: 0, overflow: 'hidden' }}>
        <div className="tbl-wrap" style={{ maxHeight: '60vh', overflow: 'auto' }}>
          <table className="tbl tbl-fit">
            <thead><tr>
              <th className="sortable" onClick={() => ds('phieu')}>Mã phiếu{ic('phieu')}</th>
              <th className="center sortable" onClick={() => ds('tt')}>Trạng thái{ic('tt')}</th>
              <th className="sortable" onClick={() => ds('ch')}>Cửa hàng nhận{ic('ch')}</th>
              <th className="sortable" onClick={() => ds('kho')}>Kho nguồn{ic('kho')}</th>
              <th className="sortable" onClick={() => ds('tao')}>Ngày tạo{ic('tao')}</th>
              <th className="num sortable" onClick={() => ds('ma')}>Số mã{ic('ma')}</th>
              <th className="num sortable" onClick={() => ds('nhu')}>Nhu cầu{ic('nhu')}</th>
              <th className="num">Đã nhập</th>
            </tr></thead>
            <tbody>
              {rows === null ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 26, color: 'var(--ink-2)' }}>Đang tải…</td></tr>
              ) : hien.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 26, color: 'var(--ink-2)' }}>Chưa có phiếu điều chuyển (mã DK) trong khoảng này.</td></tr>
              ) : hien.map((r) => (
                <tr key={r.ma_phieu}>
                  <td className="mono" style={{ fontWeight: 700, fontSize: 11 }}>{r.ma_phieu}</td>
                  <td className="center"><span className={'dck-tt ' + dckClass(r.trang_thai)}>{r.trang_thai}</span></td>
                  <td><div style={{ fontWeight: 600 }}>{r.ten_ch}</div>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--ink-2)' }}>{r.ma_ch} · {r.khu_vuc}</div></td>
                  <td style={{ fontSize: 12 }}>{r.ten_kho_nguon}<div className="mono" style={{ fontSize: 10, color: 'var(--ink-2)' }}>{r.ma_kho_nguon}</div></td>
                  <td style={{ fontSize: 12 }}>{r.ngay_tao ? fmtDM(r.ngay_tao) : '—'}</td>
                  <td className="num">{Number(r.so_ma)}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{Number(r.tong_nhu_cau)}</td>
                  <td className="num" style={{ color: Number(r.tong_da_nhap) >= Number(r.tong_nhu_cau) ? 'var(--teal-deep)' : 'var(--ink-2)' }}>{Number(r.tong_da_nhap)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
