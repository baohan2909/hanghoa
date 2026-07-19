import { useEffect, useMemo, useRef, useState } from 'react';
import { sb, rpcHet } from '../lib/supabase.js';
import { IcRefresh } from '../lib/icons.jsx';
import { DateBox, Sel } from '../lib/ui.jsx';
import { useApp } from '../App.jsx';

// LỊCH ĐỀ NGHỊ — 3 tab: Hôm nay (điều khiển) · Lịch (calendar tuần) · Tuân thủ.
// N1 2 lần/tuần · N2 1 lần/tuần · N3 chu kỳ ~11 ngày · né T7/CN.
const iso = (d) => d.toISOString().slice(0, 10);
const fmtDM = (s) => s.slice(8, 10) + '/' + s.slice(5, 7);
const THU = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const THU_DAY = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
const dow = (s) => new Date(s + 'T00:00:00').getDay();

export default function Lich() {
  const { user, baoToast } = useApp();
  const homNay = iso(new Date());
  const suaDuoc = ['DIEU_PHOI', 'ADMIN'].includes(user.vai_tro);
  const [tab, setTab] = useState('HOMNAY');
  // Kỳ xem: mặc định tháng quanh hôm nay
  const [tu, setTu] = useState(iso(new Date(Date.now() - 3 * 864e5)));
  const [den, setDen] = useState(iso(new Date(Date.now() + 28 * 864e5)));
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);

  const tai = async () => {
    setBusy(true);
    const { data, error } = await rpcHet('fn_lich_matran', { p_tu: tu, p_den: den });
    setBusy(false);
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    setRows(data || []);
  };
  useEffect(() => { tai(); }, [tu, den]);

  // Index: ngày -> danh sách CH có lịch (kèm đã gửi chưa)
  const theoNgay = useMemo(() => {
    const m = {};
    (rows || []).forEach((r) => {
      const gui = new Set(r.ngay_gui || []);
      (r.ngay_lich || []).forEach((n) => {
        (m[n] || (m[n] = [])).push({ ...r, daGui: gui.has(n) });
      });
    });
    return m;
  }, [rows]);

  const toggleO = async (ma_ch, ngay, dangCo) => {
    if (!suaDuoc) return;
    const { error } = await sb.rpc('fn_sua_lich_ngay',
      { p_token: user.token, p_ma_ch: ma_ch, p_ngay: ngay, p_co: !dangCo });
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    setRows((rs) => rs.map((x) => x.ma_ch !== ma_ch ? x : {
      ...x, ngay_lich: dangCo ? x.ngay_lich.filter((n) => n !== ngay) : [...x.ngay_lich, ngay].sort(),
    }));
    baoToast(dangCo ? 'Đã bỏ lịch' : 'Đã thêm lịch');
  };

  return (
    <>
      <div className="cmdbar">
        <h1>Lịch đề nghị hàng hóa</h1>
        <div className="sub">N1 · 2 lần/tuần — N2 · 1 lần/tuần — N3 · chu kỳ ~11 ngày. Cửa hàng đề nghị hôm trước, kho lấy hôm sau (né T7/CN).</div>
      </div>

      <div className="seg" style={{ marginTop: 14 }}>
        {[['HOMNAY', 'Hôm nay & sắp tới'], ['LICH', 'Lịch tổng'], ['TUANTHU', 'Tuân thủ'], ['CAUHINH', 'Nhập / Sinh lịch']].map(([v, t]) => (
          <button key={v} className={'seg-btn' + (tab === v ? ' on' : '')} onClick={() => setTab(v)}>{t}</button>
        ))}
      </div>

      {tab === 'HOMNAY' && <TabHomNay rows={rows} theoNgay={theoNgay} homNay={homNay} toggleO={toggleO} suaDuoc={suaDuoc} setTab={setTab} />}
      {tab === 'LICH' && <TabLich theoNgay={theoNgay} homNay={homNay} tu={tu} den={den} setTu={setTu} setDen={setDen}
        toggleO={toggleO} suaDuoc={suaDuoc} rows={rows} busy={busy} tai={tai} />}
      {tab === 'TUANTHU' && <TabTuanThu tu={tu} den={den} setTu={setTu} setDen={setDen} />}
      {tab === 'CAUHINH' && <TabCauHinh tu={tu} den={den} setTu={setTu} setDen={setDen} taiLai={tai} />}
    </>
  );
}

// ============ TAB HÔM NAY — điều khiển kiểm soát ============
function TabHomNay({ rows, theoNgay, homNay, toggleO, suaDuoc, setTab }) {
  const homNayDs = theoNgay[homNay] || [];
  const chuaGui = homNayDs.filter((r) => !r.daGui);
  const daGui = homNayDs.filter((r) => r.daGui);

  // 7 ngày tới (bỏ hôm nay)
  const sapToi = useMemo(() => {
    const out = [];
    for (let i = 1; i <= 10; i++) {
      const n = iso(new Date(Date.now() + i * 864e5));
      const ds = theoNgay[n] || [];
      if (ds.length) out.push({ ngay: n, ds });
      if (out.length >= 6) break;
    }
    return out;
  }, [theoNgay]);

  if (!rows) return <div className="card" style={{ marginTop: 12, padding: 40, textAlign: 'center', color: 'var(--ink-2)' }}>Đang tải…</div>;

  return (
    <div style={{ marginTop: 14, display: 'grid', gap: 14, gridTemplateColumns: '1.2fr 1fr' }}>
      {/* CỘT TRÁI — hôm nay */}
      <div>
        <div className="card lich2-today">
          <div className="lich2-today-head">
            <div>
              <div className="lich2-today-thu">{THU_DAY[dow(homNay)]}</div>
              <div className="lich2-today-ngay">{fmtDM(homNay)}</div>
            </div>
            <div className="lich2-today-badges">
              <div className="lich2-badge"><b>{homNayDs.length}</b> tới lịch</div>
              <div className={'lich2-badge' + (chuaGui.length ? ' warn' : ' ok')}>
                <b>{chuaGui.length}</b> chưa gửi
              </div>
            </div>
          </div>

          {homNayDs.length === 0 ? (
            <div className="lich2-empty">Hôm nay không có cửa hàng nào theo lịch.</div>
          ) : (
            <>
              {chuaGui.length > 0 && (
                <div className="lich2-sec">
                  <div className="lich2-sec-tit warn">Chưa gửi phiếu ({chuaGui.length})</div>
                  <div className="lich2-list">
                    {chuaGui.map((r) => (
                      <div key={r.ma_ch} className="lich2-item warn">
                        <span className={'tag-n tag-n' + r.nhom_ch}>N{r.nhom_ch}</span>
                        <div className="lich2-item-ten">
                          <div>{r.ten}</div>
                          <div className="lich2-item-sub">{r.ma_ch} · {r.khu_vuc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {daGui.length > 0 && (
                <div className="lich2-sec">
                  <div className="lich2-sec-tit ok">Đã gửi ({daGui.length})</div>
                  <div className="lich2-list">
                    {daGui.map((r) => (
                      <div key={r.ma_ch} className="lich2-item ok">
                        <span className={'tag-n tag-n' + r.nhom_ch}>N{r.nhom_ch}</span>
                        <div className="lich2-item-ten">
                          <div>{r.ten}</div>
                          <div className="lich2-item-sub">{r.ma_ch} · {r.khu_vuc}</div>
                        </div>
                        <span className="lich2-tick">✓</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* CỘT PHẢI — sắp tới */}
      <div>
        <div className="card" style={{ padding: 16 }}>
          <div className="lich2-h">Lịch sắp tới</div>
          {sapToi.length === 0 ? (
            <div className="lich2-empty">Chưa có lịch trong những ngày tới.</div>
          ) : sapToi.map(({ ngay, ds }) => (
            <div key={ngay} className="lich2-upcoming">
              <div className="lich2-up-date">
                <div className="lich2-up-thu">{THU[dow(ngay)]}</div>
                <div className="lich2-up-dm">{fmtDM(ngay)}</div>
              </div>
              <div className="lich2-up-body">
                <div className="lich2-up-count">{ds.length} nơi bán</div>
                <div className="lich2-up-nhom">
                  {[1, 2, 3].map((n) => {
                    const c = ds.filter((r) => r.nhom_ch === n).length;
                    return c ? <span key={n} className={'tag-n tag-n' + n}>N{n}: {c}</span> : null;
                  })}
                </div>
              </div>
            </div>
          ))}
          <button className="btn-ghost" style={{ marginTop: 12, width: '100%' }} onClick={() => setTab('LICH')}>
            Xem lịch tổng →
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ TAB LỊCH — calendar theo tuần ============
function TabLich({ theoNgay, homNay, tu, den, setTu, setDen, toggleO, suaDuoc, rows, busy, tai }) {
  const [kv, setKv] = useState('ALL');
  const [nhom, setNhom] = useState('ALL');
  const [chiTiet, setChiTiet] = useState(null);   // ngày đang mở chi tiết

  const dsKV = useMemo(() => [...new Set((rows || []).map((r) => r.khu_vuc).filter(Boolean))].sort(), [rows]);

  // Lọc theoNgay theo kv/nhom
  const loc = (ds) => (ds || []).filter((r) =>
    (kv === 'ALL' || r.khu_vuc === kv) && (nhom === 'ALL' || String(r.nhom_ch) === nhom));

  // Dựng lưới tuần: từ đầu tuần chứa 'tu' đến hết tuần chứa 'den'
  const tuan = useMemo(() => {
    const start = new Date(tu + 'T00:00:00');
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // về thứ 2
    const end = new Date(den + 'T00:00:00');
    const weeks = []; let cur = new Date(start); let guard = 0;
    while (cur <= end && guard < 12) {
      const days = [];
      for (let i = 0; i < 7; i++) { days.push(iso(cur)); cur = new Date(cur.getTime() + 864e5); }
      weeks.push(days); guard++;
    }
    return weeks;
  }, [tu, den]);

  return (
    <>
      <div className="card" style={{ marginTop: 14, padding: 14 }}>
        <div className="lich2-toolbar">
          <div className="lich2-toolbar-l">
            <DateBox label="Từ" value={tu} onChange={setTu} />
            <DateBox label="Đến" value={den} onChange={setDen} />
          </div>
          <div className="lich2-toolbar-r">
            <div className="seg sm">
              {[['ALL', 'Tất cả'], ['1', 'N1'], ['2', 'N2'], ['3', 'N3']].map(([v, t]) => (
                <button key={v} className={'seg-btn' + (nhom === v ? ' on' : '')} onClick={() => setNhom(v)}>{t}</button>
              ))}
            </div>
            <Sel value={kv} onChange={setKv} placeholder="Khu vực"
              options={[{ value: 'ALL', label: 'Mọi khu vực' }, ...dsKV.map((k) => ({ value: k, label: k }))]} style={{ minWidth: 190 }} />
          </div>
        </div>

        {/* Header thứ */}
        <div className="cal-head">
          {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((t, i) => (
            <div key={t} className={'cal-head-c' + (i >= 5 ? ' cuoi' : '')}>{t}</div>
          ))}
        </div>
        {/* Lưới tuần */}
        <div className="cal-grid">
          {tuan.map((week, wi) => week.map((n) => {
            const d = dow(n);
            const cuoiTuan = d === 0 || d === 6;
            const ds = loc(theoNgay[n]);
            const chuaGui = ds.filter((r) => !r.daGui).length;
            const inRange = n >= tu && n <= den;
            return (
              <div key={n} className={'cal-cell' + (n === homNay ? ' homnay' : '') + (cuoiTuan ? ' cuoi' : '') + (!inRange ? ' mo' : '')}
                onClick={() => ds.length && setChiTiet({ ngay: n, ds })}
                style={{ cursor: ds.length ? 'pointer' : 'default' }}>
                <div className="cal-cell-top">
                  <span className="cal-cell-day">{n.slice(8, 10)}/{n.slice(5, 7)}</span>
                  {n === homNay && <span className="cal-today-tag">hôm nay</span>}
                </div>
                {ds.length > 0 && (
                  <div className="cal-cell-body">
                    <div className={'cal-count' + (chuaGui ? ' warn' : ' ok')}>{ds.length}</div>
                    <div className="cal-nhom">
                      {[1, 2, 3].map((nn) => {
                        const c = ds.filter((r) => r.nhom_ch === nn).length;
                        return c ? <span key={nn} className={'cal-nhom-dot n' + nn} title={'N' + nn + ': ' + c}>{c}</span> : null;
                      })}
                    </div>
                    {chuaGui > 0 && n <= homNay && <div className="cal-warn">{chuaGui} chưa gửi</div>}
                  </div>
                )}
              </div>
            );
          }))}
        </div>
        <div className="cal-legend">
          <span><i className="cal-dot n1" />N1</span>
          <span><i className="cal-dot n2" />N2</span>
          <span><i className="cal-dot n3" />N3</span>
          <span style={{ marginLeft: 'auto', color: 'var(--ink-2)' }}>Bấm ngày để xem chi tiết{suaDuoc ? ' & sửa lịch' : ''}</span>
        </div>
      </div>

      {chiTiet && <NgayModal chiTiet={chiTiet} homNay={homNay} onClose={() => setChiTiet(null)}
        toggleO={toggleO} suaDuoc={suaDuoc} rows={rows} />}
    </>
  );
}

// Modal chi tiết 1 ngày + thêm/bỏ CH
function NgayModal({ chiTiet, homNay, onClose, toggleO, suaDuoc, rows }) {
  const { ngay, ds } = chiTiet;
  const [them, setThem] = useState(false);
  const coRoi = new Set(ds.map((r) => r.ma_ch));
  const conLai = (rows || []).filter((r) => !coRoi.has(r.ma_ch));
  const [q, setQ] = useState('');
  const locConLai = conLai.filter((r) => !q || (r.ten + r.ma_ch).toLowerCase().includes(q.toLowerCase())).slice(0, 30);

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal lich2-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{THU_DAY[dow(ngay)]}, {fmtDM(ngay)}</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{ds.length} nơi bán theo lịch</div>
          </div>
          <button className="modal-x" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ maxHeight: '60vh', overflow: 'auto' }}>
          <div className="lich2-list">
            {ds.sort((a, b) => a.nhom_ch - b.nhom_ch).map((r) => (
              <div key={r.ma_ch} className={'lich2-item' + (r.daGui ? ' ok' : ngay < homNay ? ' warn' : '')}>
                <span className={'tag-n tag-n' + r.nhom_ch}>N{r.nhom_ch}</span>
                <div className="lich2-item-ten">
                  <div>{r.ten}</div>
                  <div className="lich2-item-sub">{r.ma_ch} · {r.khu_vuc}</div>
                </div>
                {r.daGui ? <span className="lich2-tick">✓ đã gửi</span>
                  : ngay < homNay ? <span className="lich2-x">✕ bỏ lỡ</span> : null}
                {suaDuoc && <button className="btn-mini btn-danger" onClick={() => { toggleO(r.ma_ch, ngay, true); onClose(); }}>Bỏ</button>}
              </div>
            ))}
          </div>
          {suaDuoc && (
            <div style={{ marginTop: 14 }}>
              {!them ? (
                <button className="btn-ghost" onClick={() => setThem(true)}>+ Thêm cửa hàng vào ngày này</button>
              ) : (
                <div>
                  <input className="inp" autoFocus placeholder="Tìm cửa hàng để thêm…" value={q}
                    onChange={(e) => setQ(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
                  <div className="lich2-add-list">
                    {locConLai.map((r) => (
                      <button key={r.ma_ch} className="lich2-add-item" onClick={() => { toggleO(r.ma_ch, ngay, false); onClose(); }}>
                        <span className={'tag-n tag-n' + r.nhom_ch}>N{r.nhom_ch}</span> {r.ten}
                        <span className="lich2-item-sub" style={{ marginLeft: 'auto' }}>{r.ma_ch}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============ TAB TUÂN THỦ — thẻ lọc + bảng ============
function TabTuanThu({ tu, den, setTu, setDen }) {
  const { baoToast } = useApp();
  const [rows, setRows] = useState(null);
  const [loc, setLoc] = useState('ALL');   // ALL | LO | NGOAI | TOT
  const [sortC, setSortC] = useState({ col: 'pct', dir: 'asc' });

  useEffect(() => { (async () => {
    const { data, error } = await rpcHet('fn_lich_tuanthu', { p_tu: tu, p_den: den });
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    setRows(data || []);
  })(); }, [tu, den]);

  const tk = useMemo(() => {
    const v = rows || [];
    return {
      tongLich: v.reduce((s, r) => s + (r.so_lich || 0), 0),
      dung: v.reduce((s, r) => s + (r.dung_lich || 0), 0),
      lo: v.reduce((s, r) => s + (r.bo_lo || 0), 0),
      ngoai: v.reduce((s, r) => s + (r.ngoai_lich || 0), 0),
    };
  }, [rows]);

  const hien = useMemo(() => {
    let v = [...(rows || [])];
    if (loc === 'LO') v = v.filter((r) => r.bo_lo > 0);
    else if (loc === 'NGOAI') v = v.filter((r) => r.ngoai_lich > 0);
    else if (loc === 'TOT') v = v.filter((r) => r.pct != null && r.pct >= 80);
    const get = { ten: (r) => r.ten, nhom: (r) => r.nhom_ch, lich: (r) => r.so_lich,
      dung: (r) => r.dung_lich, lo: (r) => r.bo_lo, ngoai: (r) => r.ngoai_lich, pct: (r) => r.pct ?? -1 }[sortC.col];
    v.sort((a, b) => { const x = get(a), y = get(b); const c = typeof x === 'string' ? x.localeCompare(y) : x - y; return sortC.dir === 'asc' ? c : -c; });
    return v;
  }, [rows, loc, sortC]);
  const doiSort = (c) => setSortC((s) => ({ col: c, dir: s.col === c && s.dir === 'desc' ? 'asc' : 'desc' }));
  const ic = (c) => sortC.col === c ? (sortC.dir === 'asc' ? ' ▲' : ' ▼') : '';

  const The = ({ id, so, ten, mau }) => (
    <button className={'lich2-kpi' + (loc === id ? ' on' : '')} onClick={() => setLoc(id)}>
      <div className="lich2-kpi-so" style={{ color: mau }}>{so}</div>
      <div className="lich2-kpi-ten">{ten}</div>
    </button>
  );

  return (
    <>
      <div className="card" style={{ marginTop: 14, padding: 14, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <DateBox label="Từ" value={tu} onChange={setTu} />
        <DateBox label="Đến" value={den} onChange={setDen} />
        <span style={{ color: 'var(--ink-2)', fontSize: 12.5 }}>Bấm thẻ để lọc bảng bên dưới</span>
      </div>
      <div className="lich2-kpis">
        <The id="ALL" so={`${tk.dung}/${tk.tongLich}`} ten="Gửi đúng lịch" mau="var(--teal-deep)" />
        <The id="LO" so={tk.lo} ten="Bỏ lỡ (quá ngày chưa gửi)" mau="var(--magenta)" />
        <The id="NGOAI" so={tk.ngoai} ten="Gửi ngoài lịch" mau="#b98f2e" />
        <The id="TOT" so={(rows || []).filter((r) => r.pct != null && r.pct >= 80).length} ten="Nơi bán tuân thủ tốt (≥80%)" mau="var(--teal-deep)" />
      </div>

      <div className="card" style={{ marginTop: 12, padding: 0, overflow: 'hidden' }}>
        <div className="tbl-wrap" style={{ maxHeight: '56vh', overflow: 'auto' }}>
          <table className="tbl tbl-fit">
            <thead><tr>
              <th className="sortable" onClick={() => doiSort('ten')}>Cửa hàng{ic('ten')}</th>
              <th className="center sortable" onClick={() => doiSort('nhom')}>Nhóm{ic('nhom')}</th>
              <th className="num sortable" onClick={() => doiSort('lich')}>Số lịch{ic('lich')}</th>
              <th className="num sortable" onClick={() => doiSort('dung')}>Đúng{ic('dung')}</th>
              <th className="num sortable" onClick={() => doiSort('lo')}>Bỏ lỡ{ic('lo')}</th>
              <th className="num sortable" onClick={() => doiSort('ngoai')}>Ngoài lịch{ic('ngoai')}</th>
              <th className="num sortable" onClick={() => doiSort('pct')}>Tuân thủ{ic('pct')}</th>
            </tr></thead>
            <tbody>
              {hien.map((r) => (
                <tr key={r.ma_ch} className={r.bo_lo > 0 ? 'row-lo' : ''}>
                  <td><div style={{ fontWeight: 600 }}>{r.ten}</div>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--ink-2)' }}>{r.ma_ch} · {r.khu_vuc}</div></td>
                  <td className="center"><span className={'tag-n tag-n' + r.nhom_ch}>N{r.nhom_ch}</span></td>
                  <td className="num">{r.so_lich}</td>
                  <td className="num" style={{ color: 'var(--teal-deep)', fontWeight: 700 }}>{r.dung_lich}</td>
                  <td className="num" style={{ color: r.bo_lo > 0 ? 'var(--magenta)' : undefined, fontWeight: r.bo_lo > 0 ? 700 : 400 }}>{r.bo_lo}</td>
                  <td className="num">{r.ngoai_lich}</td>
                  <td className="num"><PctBar pct={r.pct} /></td>
                </tr>
              ))}
              {hien.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--ink-2)' }}>Không có dữ liệu khớp bộ lọc.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function PctBar({ pct }) {
  if (pct == null) return <span style={{ color: 'var(--ink-2)' }}>—</span>;
  const mau = pct >= 80 ? 'var(--teal-deep)' : pct >= 50 ? '#b98f2e' : 'var(--magenta)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
      <div style={{ width: 46, height: 6, borderRadius: 4, background: 'var(--line)', overflow: 'hidden' }}>
        <div style={{ width: pct + '%', height: '100%', background: mau }} />
      </div>
      <b style={{ color: mau, minWidth: 34, textAlign: 'right' }}>{pct}%</b>
    </div>
  );
}

// ============ TAB CẤU HÌNH — nhập / sinh lịch ============
function TabCauHinh({ tu, den, setTu, setDen, taiLai }) {
  const { user, baoToast } = useApp();
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const docFile = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const all = XLSX.utils.sheet_to_json(ws, { header: 1 });
      const hdr = all[0] || [];
      const colNgay = [];
      hdr.forEach((h, i) => { const m = String(h || '').trim().match(/^(\d{1,2})\/(\d{1,2})$/); if (m) colNgay.push({ idx: i, dd: +m[1], mm: +m[2] }); });
      if (!colNgay.length) { baoToast('Không thấy cột ngày dd/mm ở dòng 1'); setBusy(false); return; }
      let nam = +tu.slice(0, 4), truoc = colNgay[0].mm;
      const ngayCua = colNgay.map((c) => { if (c.mm < truoc) nam++; truoc = c.mm; return { idx: c.idx, iso: `${nam}-${String(c.mm).padStart(2, '0')}-${String(c.dd).padStart(2, '0')}` }; });
      const { data: dsCH } = await sb.from('cua_hang').select('ma_ch, ten').or('ma_ch.like.CH%,ma_ch.like.DB%');
      const map = {}; (dsCH || []).forEach((c) => { map[c.ten.trim().toUpperCase()] = c.ma_ch; });
      const out = [], khongKhop = [];
      for (let i = 1; i < all.length; i++) {
        const r = all[i]; const ten = String(r?.[1] || '').trim(); if (!ten) continue;
        const ma = map[ten.toUpperCase()];
        if (!ma) { if (String(r?.[0] || '').match(/^\d+$/)) khongKhop.push(ten); continue; }
        ngayCua.forEach(({ idx, iso: is }) => { if (String(r[idx] || '').trim().toLowerCase() === 'x') out.push({ ma_ch: ma, ngay: is }); });
      }
      const cac = out.map((o) => o.ngay).sort();
      setPreview({ rows: out, khongKhop, tuF: cac[0], denF: cac[cac.length - 1], soCH: new Set(out.map((o) => o.ma_ch)).size });
    } catch (e) { baoToast('Lỗi đọc file: ' + e.message); }
    setBusy(false); if (fileRef.current) fileRef.current.value = '';
  };

  const ghi = async () => {
    if (!preview?.rows?.length) return; setBusy(true);
    const { data, error } = await sb.rpc('fn_lich_import', { p_token: user.token, p_tu: preview.tuF, p_den: preview.denF, p_rows: preview.rows });
    setBusy(false);
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    baoToast(`Đã nhập ${data?.them_moi} ngày-lịch (thay ${data?.xoa_cu} dòng cũ)`); setPreview(null); taiLai();
  };
  const sinhTiep = async () => {
    setBusy(true);
    const { data, error } = await sb.rpc('fn_lich_sinh_tiep', { p_token: user.token, p_tu: tu, p_den: den });
    setBusy(false);
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    baoToast(`Đã sinh ${data?.so_ngay_sinh} ngày-lịch cho ${data?.so_ch} nơi bán`); taiLai();
  };
  const taiMau = async () => {
    const XLSX = await import('xlsx');
    const { data } = await rpcHet('fn_lich_matran', { p_tu: tu, p_den: den });
    const dsN = []; let d = new Date(tu + 'T00:00:00'); const e = new Date(den + 'T00:00:00');
    while (d <= e) { dsN.push(iso(d)); d = new Date(d.getTime() + 864e5); }
    const hdr = ['STT', 'TÊN CỬA HÀNG', 'KHU VỰC', 'NHÓM', ...dsN.map(fmtDM), 'TỔNG/CH'];
    const rowsX = (data || []).map((r, i) => { const l = new Set(r.ngay_lich || []); const cells = dsN.map((n) => l.has(n) ? 'x' : ''); return [i + 1, r.ten, r.khu_vuc, 'N' + r.nhom_ch, ...cells, cells.filter(Boolean).length]; });
    const ws = XLSX.utils.aoa_to_sheet([hdr, ...rowsX]); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ma trận theo ngày'); XLSX.writeFile(wb, `LICH_${tu}_${den}.xlsx`);
  };

  const Card = ({ tit, mo, children }) => (
    <div className="card lich2-cfg">
      <div className="lich2-cfg-tit">{tit}</div>
      <div className="lich2-cfg-mo">{mo}</div>
      {children}
    </div>
  );

  return (
    <div className="lich2-cfg-grid">
      <Card tit="⇪ Nhập lịch từ file Excel" mo="Dòng 1 có các cột ngày dd/mm, cột B là tên cửa hàng, đánh x vào ngày có lịch. Nhập kỳ mới thay toàn bộ lịch trong khoảng ngày của file.">
        <label className="btn-primary lich2-btn" style={{ cursor: 'pointer' }}>
          Chọn file Excel
          <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={(e) => docFile(e.target.files?.[0])} />
        </label>
        {preview && (
          <div className="lich2-preview">
            <div><b>{preview.soCH}</b> nơi bán · <b>{preview.rows.length}</b> ngày-lịch · {fmtDM(preview.tuF)}–{fmtDM(preview.denF)}</div>
            {preview.khongKhop.length > 0 && <div style={{ color: 'var(--magenta)', marginTop: 5, fontSize: 12 }}>⚠ {preview.khongKhop.length} tên không khớp: {preview.khongKhop.slice(0, 4).join(', ')}…</div>}
            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              <button className="btn-primary lich2-btn" onClick={ghi} disabled={busy}>Ghi vào hệ thống</button>
              <button className="btn-ghost" onClick={() => setPreview(null)}>Hủy</button>
            </div>
          </div>
        )}
      </Card>
      <Card tit="⚙ Sinh lịch tự động kỳ tiếp" mo={`Sinh cho khoảng ${fmtDM(tu)}–${fmtDM(den)} (chỉnh 2 ô ngày ở tab Lịch tổng) dựa trên kỳ trước: N1/N2 giữ đúng thứ, N3 tiếp chu kỳ ~11 ngày, tự né T7 & CN, không đè ngày đã có.`}>
        <button className="btn-primary lich2-btn" onClick={sinhTiep} disabled={busy}>Sinh lịch {fmtDM(tu)} – {fmtDM(den)}</button>
      </Card>
      <Card tit="⬇ Tải file mẫu / lịch hiện tại" mo="Xuất ma trận kỳ đang xem ra Excel đúng định dạng nhập — sửa ngoài rồi nhập lại, hoặc làm mẫu trắng.">
        <button className="btn-ghost lich2-btn" onClick={taiMau} disabled={busy}>Tải Excel kỳ hiện tại</button>
      </Card>
    </div>
  );
}
