import { isoVN } from '../lib/ui.jsx';
import { useEffect, useState } from 'react';
import { sb, rpcHet } from '../lib/supabase.js';
import { IcSearch, IcDown } from '../lib/icons.jsx';
import { useApp } from '../App.jsx';

// ===== BÁO CÁO MÃ HÀNG MỚI — tháng hiện tại, tổng thể hoặc theo cửa hàng =====
const fmtVND = (n) => (n || 0).toLocaleString('vi-VN') + 'đ';
const fmtNgay = (d) => d ? String(d).split('T')[0].split('-').reverse().join('/') : '—';
const laBH = (n1) => (n1 || '').includes('bảo hiểm') || (n1 || '').includes('Mũ');
const isoD = (d) => isoVN(d);
const thangNay = () => { const d = new Date(); return 'T' + (d.getMonth() + 1) + '/' + d.getFullYear(); };

const BadgeNganh = ({ n1 }) => {
  const bh = laBH(n1);
  return <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 10px', borderRadius: 10, whiteSpace: 'nowrap',
    background: bh ? '#E4F5F0' : '#F7EFDE', color: bh ? 'var(--teal-deep)' : '#8A6D2F' }}>
    {bh ? 'Mũ bảo hiểm' : 'Nón vải'}</span>;
};
function AnhSP({ url, onZoom, onHover, onLeave }) {
  const [loi, setLoi] = useState(false);
  if (!url || loi) return <div className="noimg" />;
  return <img className="sp" src={url} alt="" onError={() => setLoi(true)} style={{ cursor: 'zoom-in' }}
    onMouseEnter={(e) => onHover?.(url, e)} onMouseLeave={onLeave}
    onClick={(e) => { e.stopPropagation(); onZoom?.(url); }} />;
}

export default function BaoCaoMaMoi() {
  const { baoToast } = useApp();
  const [rows, setRows] = useState(null);
  const [dsCH, setDsCH] = useState([]);
  const [nganh, setNganh] = useState('ALL');
  const [maCH, setMaCH] = useState('');
  const [tuTao, setTuTao] = useState('');
  const [denTao, setDenTao] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState({ k: 'ngay', d: -1 });
  const [hoverAnh, setHoverAnh] = useState(null);
  const [xemAnh, setXemAnh] = useState(null);
  // panel chi tiết (3 thẻ như tab hàng mới)
  const [xemBan, setXemBan] = useState(null);   // {sp, rows|null, tu, den}
  const [theBan, setTheBan] = useState('ban');

  useEffect(() => {
    sb.from('cua_hang').select('ma_ch, ten').or('ma_ch.like.CH%,ma_ch.like.DB%').order('ma_ch')
      .then(({ data }) => setDsCH(data || []));
  }, []);

  const tai = async () => {
    setRows(null);
    const { data, error } = await rpcHet('fn_baocao_ma_moi', {
      p_tu: tuTao || null, p_den: denTao || null,
      p_nganh: nganh === 'ALL' ? null : nganh, p_ma_ch: maCH || null,
    });
    if (error) { baoToast('Lỗi: ' + error.message); setRows([]); return; }
    setRows(data || []);
  };
  useEffect(() => { tai(); /* eslint-disable-next-line */ }, [nganh, maCH, tuTao, denTao]);

  // panel chi tiết bán/tồn theo CH
  const moBan = async (sp, tu, den) => {
    tu = tu || isoD(new Date(Date.now() - 30 * 864e5));
    den = den || isoD(new Date());
    setTheBan('ban');
    setXemBan({ sp, rows: null, tu, den });
    const { data, error } = await sb.rpc('fn_ban_theo_ch',
      { p_barcode: sp.barcode, p_ma_tc: sp.ma_tham_chieu, p_tu: tu, p_den: den });
    if (error) { baoToast('Lỗi: ' + error.message); setXemBan(null); return; }
    setXemBan({ sp, rows: data || [], tu, den });
  };
  const doiNgayBan = (tu, den) => xemBan && moBan(xemBan.sp, tu, den);

  let ds = (rows || []).filter((r) => {
    if (q.trim()) { const k = q.trim().toUpperCase();
      if (![r.barcode, r.sku, r.ma_tham_chieu, r.nganh_3].some((x) => (x || '').toUpperCase().includes(k))) return false; }
    return true;
  });
  const sv = { sp: (r) => r.ma_tham_chieu || r.sku || '', nganh: (r) => (laBH(r.nganh_1) ? 0 : 1),
    ngay: (r) => r.ngay_tao_ma || '', gia: (r) => r.gia_niem_yet || 0,
    ban: (r) => Number(r.ban_thang_nay), ton: (r) => Number(r.ton_hien), soch: (r) => Number(r.so_ch_ban) };
  ds = [...ds].sort((a, b) => { const x = sv[sort.k](a), y = sv[sort.k](b);
    return (x < y ? -1 : x > y ? 1 : 0) * sort.d; });
  const doiSort = (k) => setSort((c) => ({ k, d: c.k === k ? -c.d : -1 }));
  const ic = (k) => <span style={{ opacity: sort.k === k ? 1 : .3, fontSize: 10 }}>{sort.k === k && sort.d === 1 ? ' ▲' : ' ▼'}</span>;

  const tenCHchon = maCH ? (dsCH.find((c) => c.ma_ch === maCH)?.ten || maCH) : 'Tất cả cửa hàng';
  const onHover = (url, e) => setHoverAnh({ url, x: e.clientX + 20, y: e.clientY - 80 });

  const xuat = async () => {
    if (!ds.length) { baoToast('Không có dữ liệu để xuất'); return; }
    const XLSX = await import('xlsx');
    const head = ['Mã tham chiếu', 'SKU', 'Ngành', 'Ngành cấp 3', 'Giá', 'Ngày tạo mã',
      'Bán ' + thangNay(), 'Tồn', 'Số CH bán'];
    const body = ds.map((r) => [
      r.ma_tham_chieu || '', r.sku || '', laBH(r.nganh_1) ? 'Mũ bảo hiểm' : 'Nón vải', r.nganh_3 || '',
      r.gia_niem_yet || 0, fmtNgay(r.ngay_tao_ma),
      Number(r.ban_thang_nay), Number(r.ton_hien), Number(r.so_ch_ban),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([[`BÁO CÁO MÃ MỚI — ${tenCHchon} — ${thangNay()}`], head, ...body]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Báo cáo mã mới');
    XLSX.writeFile(wb, `BAOCAO_MAMOI_${isoVN()}.xlsx`);
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
              <label className="date-vi lg" onClick={(e) => { const i = e.currentTarget.querySelector("input"); i && i.showPicker && i.showPicker(); }}>
                <span>{tuTao ? tuTao.split('-').reverse().join('/') : 'dd/mm/yyyy'}</span>
                <input type="date" value={tuTao} onChange={(e) => setTuTao(e.target.value)} /></label>
              <span style={{ color: 'var(--ink-2)', fontSize: 11 }}>–</span>
              <label className="date-vi lg" onClick={(e) => { const i = e.currentTarget.querySelector("input"); i && i.showPicker && i.showPicker(); }}>
                <span>{denTao ? denTao.split('-').reverse().join('/') : 'dd/mm/yyyy'}</span>
                <input type="date" value={denTao} onChange={(e) => setDenTao(e.target.value)} /></label>
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

      <div style={{ marginTop: 14, marginBottom: 6, display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <b style={{ fontSize: 15, color: 'var(--navy)' }}>Báo cáo mã mới — {tenCHchon}</b>
        {rows && <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{ds.length} mã · bán {thangNay()} · bấm dòng xem chi tiết</span>}
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
                <th className="center sortable" onClick={() => doiSort('ban')}>Bán {thangNay()}{ic('ban')}</th>
                <th className="center sortable" onClick={() => doiSort('ton')}>Tồn{ic('ton')}</th>
                <th className="center sortable" onClick={() => doiSort('soch')}>Số CH bán{ic('soch')}</th>
              </tr></thead>
              <tbody>
                {ds.map((r) => (
                  <tr key={r.barcode} className="row-click" onClick={() => moBan(r)} title="Bấm xem chi tiết theo cửa hàng">
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
                    <td className="num" style={{ fontWeight: 800, color: Number(r.ban_thang_nay) > 0 ? 'var(--teal-deep)' : 'var(--ink-2)' }}>{r.ban_thang_nay}</td>
                    <td className="num" style={{ fontWeight: Number(r.ton_hien) > 0 ? 700 : 400, color: Number(r.ton_hien) > 0 ? 'var(--ink)' : 'var(--magenta)' }}>{r.ton_hien}</td>
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

      {/* Panel chi tiết 3 thẻ — giống tab hàng mới/tái bản */}
      {xemBan && (() => {
        const R = xemBan.rows || [];
        const daBan = R.filter((r) => Number(r.sl_ban_ky) > 0).sort((a, b) => b.sl_ban_ky - a.sl_ban_ky);
        const conTon = R.filter((r) => Number(r.ton_hien_tai) > 0).sort((a, b) => b.ton_hien_tai - a.ton_hien_tai);
        const hetTon = R.filter((r) => Number(r.ton_hien_tai) === 0)
                        .sort((a, b) => (b.da_ban - a.da_ban) || (b.tong_ban_all - a.tong_ban_all));
        const dem = (arr) => { const ch = arr.filter((r) => r.loai_diem === 'CH').length;
          const db = arr.length - ch; return db > 0 ? ch + ' cửa hàng · ' + db + ' điểm bán' : ch + ' cửa hàng'; };
        const cur = theBan === 'ban' ? daBan : theBan === 'ton' ? conTon : hetTon;
        const tongBanKy = daBan.reduce((s, r) => s + Number(r.sl_ban_ky), 0);
        return (
        <div className="modal-nen" onClick={() => setXemBan(null)}>
          <div className="modal-hop" onClick={(e) => e.stopPropagation()}>
            <div className="modal-dau">
              <div>
                <div className="mono" style={{ fontWeight: 700, color: 'var(--teal-deep)', fontSize: 15 }}>
                  {xemBan.sp.ma_tham_chieu || xemBan.sp.sku}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>{xemBan.sp.nganh_3}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <span style={{ color: 'var(--ink-2)' }}>Bán từ</span>
                <label className="date-vi" onClick={(e) => { const i = e.currentTarget.querySelector("input"); i && i.showPicker && i.showPicker(); }}>
                  <span>{xemBan.tu.split('-').reverse().join('/')}</span>
                  <input type="date" value={xemBan.tu} onChange={(e) => doiNgayBan(e.target.value, xemBan.den)} /></label>
                <span style={{ color: 'var(--ink-2)' }}>đến</span>
                <label className="date-vi" onClick={(e) => { const i = e.currentTarget.querySelector("input"); i && i.showPicker && i.showPicker(); }}>
                  <span>{xemBan.den.split('-').reverse().join('/')}</span>
                  <input type="date" value={xemBan.den} onChange={(e) => doiNgayBan(xemBan.tu, e.target.value)} /></label>
                <button className="btn-mini" onClick={() => setXemBan(null)} style={{ marginLeft: 6 }}>Đóng</button>
              </div>
            </div>
            <div className="modal-than">
              {!xemBan.rows ? (
                <div className="quet-load"><div className="quet-ring" /><div className="quet-s">đang tải…</div></div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    <button className={'the-g' + (theBan === 'ban' ? ' on' : '')} onClick={() => setTheBan('ban')}>
                      <span className="the-g-n">{tongBanKy}</span>
                      <span className="the-g-t">Đã bán<small>{dem(daBan)}</small></span>
                    </button>
                    <button className={'the-g' + (theBan === 'ton' ? ' on' : '')} onClick={() => setTheBan('ton')}>
                      <span className="the-g-n">{conTon.length}</span>
                      <span className="the-g-t">Đang còn tồn<small>{dem(conTon)}</small></span>
                    </button>
                    <button className={'the-g' + (theBan === 'het' ? ' on' : '')} onClick={() => setTheBan('het')}>
                      <span className="the-g-n">{hetTon.length}</span>
                      <span className="the-g-t">Không tồn<small>{dem(hetTon)}</small></span>
                    </button>
                  </div>
                  {!cur.length ? (
                    <div className="empty">{theBan === 'ban' ? 'Không có bán trong khoảng chọn.'
                      : theBan === 'ton' ? 'Không cửa hàng nào có tồn.' : 'Mọi cửa hàng đều còn tồn.'}</div>
                  ) : (
                    <div className="tbl-wrap" style={{ maxHeight: '48vh' }}>
                      <table className="tbl">
                        <thead><tr>
                          <th>Cửa hàng</th><th className="center">Khu vực</th>
                          <th className="center">Bán (kỳ)</th><th className="center">Tồn</th>
                          {theBan === 'het' ? <th className="center">Tình trạng</th> : <th className="center">Bán gần nhất</th>}
                        </tr></thead>
                        {theBan === 'het' && hetTon.some((r) => r.da_ban) && (
                          <thead><tr><th colSpan={5} style={{ background: '#FCE8EF', fontSize: 11, fontWeight: 700,
                            color: 'var(--magenta)', padding: '5px 8px', textAlign: 'left', textTransform: 'none', letterSpacing: 0 }}>
                            Đã BÁN HẾT — cần bổ sung ({hetTon.filter((r) => r.da_ban).length})</th></tr></thead>
                        )}
                        <tbody>
                          {cur.map((r, idx) => {
                            const het = Number(r.ton_hien_tai) === 0;
                            const dauNhomChua = theBan === 'het' && !r.da_ban && (idx === 0 || cur[idx - 1].da_ban);
                            return (
                            <>
                              {dauNhomChua && (
                                <tr><td colSpan={5} style={{ background: '#EEF0F3', fontSize: 11, fontWeight: 700,
                                  color: 'var(--ink-2)', padding: '5px 8px' }}>Chưa phân bổ bao giờ ({hetTon.filter((r2) => !r2.da_ban).length})</td></tr>
                              )}
                              <tr key={r.ma_ch} style={theBan === 'het' ? (r.da_ban ? { background: '#FDF3F7' } : { background: '#F7F8FA' }) : undefined}>
                                <td><b>{r.ten_ch}</b> <span style={{ color: 'var(--ink-2)', fontSize: 11 }}>{r.ma_ch}</span></td>
                                <td className="center">{r.khu_vuc || '—'}</td>
                                <td className="num" style={{ fontWeight: 700, color: Number(r.sl_ban_ky) > 0 ? 'var(--teal-deep)' : 'var(--ink-2)' }}>{r.sl_ban_ky}</td>
                                <td className="num" style={{ fontWeight: het ? 400 : 700, color: het ? 'var(--magenta)' : 'var(--ink)' }}>{r.ton_hien_tai}</td>
                                {theBan === 'het'
                                  ? <td className="center">{r.da_ban
                                      ? <span className="tt tt-het" style={{ fontSize: 10.5, whiteSpace: 'nowrap' }}>Bán hết</span>
                                      : <span className="tt" style={{ fontSize: 10.5, background: '#EEF0F3', color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>Chưa phân bổ</span>}</td>
                                  : <td className="center">{fmtNgay(r.lan_cuoi)}</td>}
                              </tr>
                            </>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
