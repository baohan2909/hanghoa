import { useEffect, useRef, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { IcSearch, IcDown } from '../lib/icons.jsx';
import { useApp } from '../App.jsx';

// ===== BÁO CÁO MÃ HÀNG MỚI — bán theo tháng, tổng thể hoặc theo cửa hàng =====
const fmtVND = (n) => (n || 0).toLocaleString('vi-VN') + 'đ';
const fmtNgay = (d) => d ? String(d).split('T')[0].split('-').reverse().join('/') : '—';
const laBH = (n1) => (n1 || '').includes('bảo hiểm') || (n1 || '').includes('Mũ');
const isoD = (d) => d.toISOString().slice(0, 10);

const BadgeNganh = ({ n1 }) => {
  const bh = laBH(n1);
  return <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 10px', borderRadius: 10, whiteSpace: 'nowrap',
    background: bh ? '#E4F5F0' : '#F7EFDE', color: bh ? 'var(--teal-deep)' : '#8A6D2F' }}>
    {bh ? 'Mũ bảo hiểm' : 'Nón vải'}</span>;
};
function AnhSP({ url, onZoom, onHover, onLeave }) {
  const [loi, setLoi] = useState(false);
  if (!url || loi) return <div className="noimg" />;
  return <img className="sp" src={url} alt="" onError={() => setLoi(true)}
    style={{ cursor: 'zoom-in' }}
    onMouseEnter={(e) => onHover?.(url, e)} onMouseLeave={onLeave}
    onClick={(e) => { e.stopPropagation(); onZoom?.(url); }} />;
}

export default function BaoCaoMaMoi() {
  const { baoToast } = useApp();
  const [rows, setRows] = useState(null);
  const [dsCH, setDsCH] = useState([]);
  // bộ lọc
  const [nganh, setNganh] = useState('ALL');   // ALL | BH | NV
  const [maCH, setMaCH] = useState('');         // '' = tổng mọi CH
  const [tuTao, setTuTao] = useState('');       // khoảng ngày tạo mã
  const [denTao, setDenTao] = useState('');
  const [banTu, setBanTu] = useState(isoD(new Date(Date.now() - 180 * 864e5)));  // bán 6 tháng
  const [banDen, setBanDen] = useState(isoD(new Date()));
  const [q, setQ] = useState('');
  const [sort, setSort] = useState({ k: 'ngay', d: -1 });
  const [hoverAnh, setHoverAnh] = useState(null);
  const [xemAnh, setXemAnh] = useState(null);

  useEffect(() => {
    sb.from('cua_hang').select('ma_ch, ten').or('ma_ch.like.CH%,ma_ch.like.DB%').order('ma_ch')
      .then(({ data }) => setDsCH(data || []));
  }, []);

  const tai = async () => {
    setRows(null);
    const { data, error } = await sb.rpc('fn_baocao_ma_moi', {
      p_tu: tuTao || null, p_den: denTao || null,
      p_nganh: nganh === 'ALL' ? null : nganh,
      p_ma_ch: maCH || null,
      p_ban_tu: banTu || null, p_ban_den: banDen || null,
    });
    if (error) { baoToast('Lỗi: ' + error.message); setRows([]); return; }
    setRows(data || []);
  };
  useEffect(() => { tai(); /* eslint-disable-next-line */ }, [nganh, maCH, tuTao, denTao, banTu, banDen]);

  // Các tháng xuất hiện (cột động) — từ khoảng bán chọn
  const thangs = (() => {
    const set = new Set();
    (rows || []).forEach((r) => Object.keys(r.ban_thang || {}).forEach((t) => set.add(t)));
    return [...set].sort();
  })();
  const nhanThang = (t) => { const [y, m] = t.split('-'); return 'T' + Number(m) + '/' + y.slice(2); };

  // lọc + sort
  let ds = (rows || []).filter((r) => {
    if (q.trim()) { const k = q.trim().toUpperCase();
      if (![r.barcode, r.sku, r.ma_tham_chieu, r.nganh_3].some((x) => (x || '').toUpperCase().includes(k))) return false; }
    return true;
  });
  const sv = { sp: (r) => r.ma_tham_chieu || r.sku || '', nganh: (r) => (laBH(r.nganh_1) ? 0 : 1),
    ngay: (r) => r.ngay_tao_ma || '', gia: (r) => r.gia_niem_yet || 0,
    tong: (r) => Number(r.tong_ban), soch: (r) => Number(r.so_ch_ban) };
  ds = [...ds].sort((a, b) => { const x = sv[sort.k](a), y = sv[sort.k](b);
    return (x < y ? -1 : x > y ? 1 : 0) * sort.d; });
  const doiSort = (k) => setSort((c) => ({ k, d: c.k === k ? -c.d : -1 }));
  const ic = (k) => <span style={{ opacity: sort.k === k ? 1 : .3, fontSize: 10 }}>{sort.k === k && sort.d === 1 ? ' ▲' : ' ▼'}</span>;

  const tenCHchon = maCH ? (dsCH.find((c) => c.ma_ch === maCH)?.ten || maCH) : 'Tất cả cửa hàng';
  const onHover = (url, e) => setHoverAnh({ url, x: e.clientX + 20, y: e.clientY - 80 });

  // Xuất Excel
  const xuat = async () => {
    if (!ds.length) { baoToast('Không có dữ liệu để xuất'); return; }
    const XLSX = await import('xlsx');
    const head = ['Mã tham chiếu', 'SKU', 'Ngành', 'Ngành cấp 3', 'Giá', 'Ngày tạo mã',
      ...thangs.map(nhanThang), 'Tổng bán', 'Số CH bán'];
    const body = ds.map((r) => [
      r.ma_tham_chieu || '', r.sku || '', laBH(r.nganh_1) ? 'Mũ bảo hiểm' : 'Nón vải', r.nganh_3 || '',
      r.gia_niem_yet || 0, fmtNgay(r.ngay_tao_ma),
      ...thangs.map((t) => (r.ban_thang || {})[t] || 0),
      Number(r.tong_ban), Number(r.so_ch_ban),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([[`BÁO CÁO MÃ MỚI — ${tenCHchon}`], head, ...body]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Báo cáo mã mới');
    XLSX.writeFile(wb, `BAOCAO_MAMOI_${new Date().toISOString().slice(0, 10)}.xlsx`);
    baoToast('Đã xuất báo cáo');
  };

  return (
    <div>
      {/* Thanh lọc */}
      <div className="card" style={{ padding: 14, marginTop: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 230px' }}>
            <div className="lbl">Cửa hàng</div>
            <select className="inp" style={{ width: '100%' }} value={maCH} onChange={(e) => setMaCH(e.target.value)}>
              <option value="">Tất cả cửa hàng (tổng thể)</option>
              {dsCH.map((c) => <option key={c.ma_ch} value={c.ma_ch}>{c.ten} · {c.ma_ch}</option>)}
            </select>
          </div>
          <div>
            <div className="lbl">Ngành hàng</div>
            <div className="nhom-tabs" style={{ margin: 0 }}>
              {[['ALL', 'Tất cả'], ['BH', 'Mũ bảo hiểm'], ['NV', 'Nón vải']].map(([k, t]) => (
                <button key={k} className={'nhom-tab' + (nganh === k ? ' on' : '')} onClick={() => setNganh(k)}>{t}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="lbl">Mã tạo từ … đến</div>
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <label className="date-vi"><span>{tuTao ? tuTao.split('-').reverse().join('/') : 'dd/mm/yyyy'}</span>
                <input type="date" value={tuTao} onChange={(e) => setTuTao(e.target.value)} /></label>
              <span style={{ color: 'var(--ink-2)', fontSize: 11 }}>–</span>
              <label className="date-vi"><span>{denTao ? denTao.split('-').reverse().join('/') : 'dd/mm/yyyy'}</span>
                <input type="date" value={denTao} onChange={(e) => setDenTao(e.target.value)} /></label>
            </div>
          </div>
          <div>
            <div className="lbl">Bán từ … đến</div>
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <label className="date-vi"><span>{banTu.split('-').reverse().join('/')}</span>
                <input type="date" value={banTu} onChange={(e) => setBanTu(e.target.value)} /></label>
              <span style={{ color: 'var(--ink-2)', fontSize: 11 }}>–</span>
              <label className="date-vi"><span>{banDen.split('-').reverse().join('/')}</span>
                <input type="date" value={banDen} onChange={(e) => setBanDen(e.target.value)} /></label>
            </div>
          </div>
          <div style={{ flex: '1 1 180px', minWidth: 160 }}>
            <div className="lbl">Tìm mã</div>
            <div style={{ position: 'relative' }}>
              <IcSearch style={{ position: 'absolute', left: 10, top: 12, width: 15, height: 15, color: 'var(--ink-2)', pointerEvents: 'none' }} />
              <input className="inp" style={{ width: '100%', paddingLeft: 33 }} placeholder="Barcode, SKU, mã"
                value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          <button className="btn btn-gold" onClick={xuat}><IcDown style={{ verticalAlign: -3 }} /> Xuất Excel</button>
        </div>
      </div>

      {/* Tiêu đề báo cáo (để in) */}
      <div style={{ marginTop: 14, marginBottom: 6, display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <b style={{ fontSize: 15, color: 'var(--navy)' }}>Báo cáo mã mới — {tenCHchon}</b>
        {rows && <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{ds.length} mã · bán {banTu.split('-').reverse().join('/')} → {banDen.split('-').reverse().join('/')}</span>}
      </div>

      {!rows ? (
        <div className="card"><div className="quet-load"><div className="quet-ring" /><div className="quet-s">đang tải…</div></div></div>
      ) : !ds.length ? (
        <div className="card"><div className="empty">Không có mã mới nào khớp bộ lọc.</div></div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="tbl-wrap" style={{ maxHeight: '62vh' }}>
            <table className="tbl bc-print">
              <thead><tr>
                <th className="col-sp sortable" onClick={() => doiSort('sp')}>Sản phẩm{ic('sp')}</th>
                <th className="center sortable" onClick={() => doiSort('nganh')}>Ngành{ic('nganh')}</th>
                <th className="center sortable" onClick={() => doiSort('ngay')}>Ngày tạo{ic('ngay')}</th>
                <th className="center sortable" onClick={() => doiSort('gia')}>Giá{ic('gia')}</th>
                {thangs.map((t) => <th key={t} className="center">{nhanThang(t)}</th>)}
                <th className="center sortable" onClick={() => doiSort('tong')}>Tổng bán{ic('tong')}</th>
                <th className="center sortable" onClick={() => doiSort('soch')}>Số CH bán{ic('soch')}</th>
              </tr></thead>
              <tbody>
                {ds.map((r) => (
                  <tr key={r.barcode}>
                    <td className="col-sp">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <AnhSP url={r.hinh_url} onZoom={setXemAnh} onHover={onHover} onLeave={() => setHoverAnh(null)} />
                        <div>
                          <div className="mono" style={{ fontWeight: 700, color: 'var(--teal-deep)' }}>{r.ma_tham_chieu || r.sku}</div>
                          <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>{r.nganh_3}</div>
                        </div>
                      </div>
                    </td>
                    <td className="center"><BadgeNganh n1={r.nganh_1} /></td>
                    <td className="center">{fmtNgay(r.ngay_tao_ma)}</td>
                    <td className="num">{fmtVND(r.gia_niem_yet)}</td>
                    {thangs.map((t) => {
                      const v = (r.ban_thang || {})[t];
                      return <td key={t} className="center" style={{ fontSize: 12, color: v ? 'var(--teal-deep)' : 'var(--ink-2)', fontWeight: v ? 700 : 400 }}>
                        <span style={{ whiteSpace: 'nowrap' }}>N: — · B: {v || 0}</span></td>;
                    })}
                    <td className="num" style={{ fontWeight: 800, color: 'var(--teal-deep)' }}>{r.tong_ban}</td>
                    <td className="num">{r.so_ch_ban}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {hoverAnh && <img className="sp-zoom" src={hoverAnh.url} alt=""
        style={{ left: Math.min(hoverAnh.x, window.innerWidth - 340), top: Math.max(10, hoverAnh.y) }} />}
      {xemAnh && <div className="img-lightbox" onClick={() => setXemAnh(null)}><img src={xemAnh} alt="" /></div>}
    </div>
  );
}
