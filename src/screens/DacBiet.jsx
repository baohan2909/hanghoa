import { useEffect, useRef, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { IcSearch, IcBox } from '../lib/icons.jsx';
import { useApp } from '../App.jsx';

// ===== HÀNG ĐẶC BIỆT — Thu hồi & Hàng mới (Điều phối kiểm soát, KHÔNG chia tự động) =====
const fmtVND = (n) => (n || 0).toLocaleString('vi-VN') + 'đ';
const fmtNgay = (d) => d ? String(d).split('T')[0].split('-').reverse().join('/') : '—';
const laBH = (n1) => (n1 || '').includes('bảo hiểm') || (n1 || '').includes('Mũ');

const BadgeNganh = ({ n1 }) => {
  const bh = laBH(n1);
  return <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 10px', borderRadius: 10, whiteSpace: 'nowrap',
    background: bh ? '#E4F5F0' : '#F7EFDE', color: bh ? 'var(--teal-deep)' : '#8A6D2F' }}>
    {bh ? 'Mũ bảo hiểm' : 'Nón vải'}</span>;
};

export default function DacBiet() {
  const { user, baoToast } = useApp();
  const [tab, setTab] = useState('THU_HOI');
  const [ds, setDs] = useState(null);
  // tìm để thêm
  const [q, setQ] = useState('');
  const [goiY, setGoiY] = useState(null);        // null = chưa tìm, [] = không thấy
  const [dangTim, setDangTim] = useState(false);
  const timRef = useRef(null);
  // khối mã tạo gần đây
  const [soNgay, setSoNgay] = useState(30);
  const [tatCa, setTatCa] = useState(false);
  const [maMoi, setMaMoi] = useState(null);
  const [locNganh, setLocNganh] = useState('ALL');
  const [qMoi, setQMoi] = useState('');
  const [sortMoi, setSortMoi] = useState({ key: 'ngay', dir: -1 });
  // ảnh hover + lightbox (như Đề nghị hàng)
  const [hoverAnh, setHoverAnh] = useState(null);
  const [xemAnh, setXemAnh] = useState(null);
  // Panel bán theo cửa hàng (kiểm soát hàng mới toàn diện — CHỈ số lượng)
  const [xemBan, setXemBan] = useState(null);   // {sp, rows|null, tu, den}
  const moBan = async (sp, tu, den) => {
    setXemBan({ sp, rows: null, tu, den });
    const { data, error } = await sb.rpc('fn_ban_theo_ch', { p_barcode: sp.barcode, p_tu: tu, p_den: den });
    if (error) { baoToast('Lỗi: ' + error.message); setXemBan(null); return; }
    setXemBan({ sp, rows: data || [], tu, den });
  };
  const anhProps = (url) => ({
    onMouseEnter: (e) => url && setHoverAnh({ url, x: e.clientX + 20, y: e.clientY - 80 }),
    onMouseLeave: () => setHoverAnh(null),
    onClick: (e) => { if (url) { e.stopPropagation(); setXemAnh(url); } },
    style: url ? { cursor: 'zoom-in' } : undefined,
  });

  const taiDS = async () => {
    const { data, error } = await sb.rpc('fn_dacbiet_ds');
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    setDs(data || []);
  };
  useEffect(() => { taiDS(); }, []);

  const taiMaMoi = async (n, all) => {
    setMaMoi(null);
    const { data, error } = await sb.rpc('fn_ma_moi_ds', { p_so_ngay: n, p_tat_ca: !!all });
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    setMaMoi(data || []);
  };
  useEffect(() => { if (tab === 'HANG_MOI') taiMaMoi(soNgay, tatCa); }, [tab, soNgay, tatCa]);

  // Tìm gợi ý (debounce 300ms, từ 2 ký tự, báo rõ trạng thái)
  const goTim = (v) => {
    setQ(v);
    clearTimeout(timRef.current);
    if (v.trim().length < 1) { setGoiY(null); setDangTim(false); return; }
    setDangTim(true);
    timRef.current = setTimeout(async () => {
      const { data, error } = await sb.rpc('fn_tim_sp', { p_q: v.trim() });
      setDangTim(false);
      if (error) { baoToast('Lỗi tìm kiếm: ' + error.message); setGoiY([]); return; }
      setGoiY(data || []);
    }, 300);
  };

  const them = async (bc, loai) => {
    const { error } = await sb.rpc('fn_dacbiet_them', {
      p_barcode: bc, p_loai: loai || tab, p_nguoi: user.ma_dang_nhap });
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    baoToast('Đã thêm vào danh sách'); setQ(''); setGoiY(null); taiDS();
    if (tab === 'HANG_MOI') taiMaMoi(soNgay);
  };
  const xoa = async (bc) => {
    const { error } = await sb.rpc('fn_dacbiet_xoa', { p_barcode: bc });
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    baoToast('Đã gỡ khỏi danh sách'); taiDS();
  };

  const dsTab = (ds || []).filter((r) => r.loai === tab);

  // Lọc + sort mã tạo gần đây
  const sortVal = { ngay: (r) => r.ngay_tao_ma || '', gia: (r) => r.gia_niem_yet || 0,
    kho: (r) => r.kho_tong || 0, ban: (r) => r.da_ban_30 || 0,
    nganh: (r) => (laBH(r.nganh_1) ? 0 : 1), sp: (r) => r.ma_tham_chieu || r.sku || '' };
  const doiSortMoi = (key) => setSortMoi((c) => ({ key, dir: c.key === key ? -c.dir : -1 }));
  const icSort = (key) => <span style={{ opacity: sortMoi.key === key ? 1 : .3, fontSize: 10 }}>{sortMoi.key === key && sortMoi.dir === 1 ? ' ▲' : ' ▼'}</span>;
  let maMoiLoc = (maMoi || []).filter((r) => {
    if (locNganh !== 'ALL' && (locNganh === 'BH') !== laBH(r.nganh_1)) return false;
    if (qMoi.trim()) {
      const k = qMoi.trim().toUpperCase();
      if (![r.barcode, r.sku, r.ma_tham_chieu, r.nganh_3].some((x) => (x || '').toUpperCase().includes(k))) return false;
    }
    return true;
  });
  maMoiLoc = [...maMoiLoc].sort((a, b) => {
    const va = sortVal[sortMoi.key](a), vb = sortVal[sortMoi.key](b);
    return (va < vb ? -1 : va > vb ? 1 : 0) * sortMoi.dir;
  });

  const AnhSP = ({ url }) => url
    ? <img className="sp" src={url} alt="" {...anhProps(url)}
        onError={(e) => { e.target.onerror = null; e.target.className = 'noimg'; e.target.removeAttribute('src'); }} />
    : <div className="noimg" />;

  return (
    <div>
      <div className="cmdbar">
        <div className="cmd-title">
          <h2><IcBox style={{ verticalAlign: -3, marginRight: 8 }} />Hàng đặc biệt</h2>
          <p>Hàng KHÔNG chia tự động — phòng Điều phối kiểm soát trực tiếp. Cửa hàng vẫn thấy mã nhưng bị khóa ô đề nghị.</p>
        </div>
      </div>

      <div className="nhom-tabs" style={{ marginTop: 14 }}>
        <button className={'nhom-tab' + (tab === 'THU_HOI' ? ' on' : '')} onClick={() => { setTab('THU_HOI'); setQ(''); setGoiY(null); }}>
          Hàng thu hồi {ds && <b style={{ marginLeft: 4 }}>{(ds || []).filter((r) => r.loai === 'THU_HOI').length}</b>}
        </button>
        <button className={'nhom-tab' + (tab === 'HANG_MOI' ? ' on' : '')} onClick={() => { setTab('HANG_MOI'); setQ(''); setGoiY(null); }}>
          Hàng mới / tái bản {ds && <b style={{ marginLeft: 4 }}>{(ds || []).filter((r) => r.loai === 'HANG_MOI').length}</b>}
        </button>
      </div>

      {/* Ô tìm + thêm */}
      <div className="card" style={{ marginTop: 12, padding: 14, position: 'relative' }}>
        <div className="lbl" style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 700, marginBottom: 8 }}>
          {tab === 'THU_HOI' ? 'Thêm sản phẩm thu hồi' : 'Thêm mã tái bản (ngày tạo cũ nhưng cần ĐP chia)'}
        </div>
        <div style={{ position: 'relative', maxWidth: 520 }}>
          <IcSearch style={{ position: 'absolute', left: 11, top: 12, width: 16, height: 16, color: 'var(--ink-2)', pointerEvents: 'none' }} />
          <input className="inp" style={{ paddingLeft: 36, width: '100%' }}
            placeholder="Barcode, SKU, mã — gõ để tìm" value={q} onChange={(e) => goTim(e.target.value)} />
          {(dangTim || goiY) && q.trim().length >= 1 && (
            <div className="goiy-pop">
              {dangTim && <div className="goiy-item" style={{ color: 'var(--ink-2)', fontSize: 12.5 }}>Đang tìm…</div>}
              {!dangTim && goiY && !goiY.length &&
                <div className="goiy-item" style={{ color: 'var(--ink-2)', fontSize: 12.5 }}>Không tìm thấy sản phẩm khớp "{q.trim()}"</div>}
              {!dangTim && (goiY || []).map((g) => (
                <div key={g.barcode} className="goiy-item">
                  <AnhSP url={g.hinh_url} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="mono" style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--teal-deep)' }}>{g.ma_tham_chieu || g.sku}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>{g.nganh_3} · kho tổng {g.kho_tong}</div>
                  </div>
                  <BadgeNganh n1={g.nganh_1} />
                  {g.dac_biet
                    ? <span style={{ fontSize: 11, color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>đã trong DS</span>
                    : <button className="btn-mini" onClick={() => them(g.barcode)}>＋ Thêm</button>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Danh sách của tab */}
      <div className="card" style={{ marginTop: 12, padding: 0 }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', fontWeight: 700, fontSize: 13.5 }}>
          Danh sách {tab === 'THU_HOI' ? 'thu hồi' : 'hàng mới thêm tay'} ({dsTab.length})
        </div>
        {!dsTab.length ? (
          <div className="empty" style={{ margin: 14 }}>Chưa có sản phẩm nào trong danh sách.</div>
        ) : (
          <div className="tbl-wrap" style={{ maxHeight: '46vh' }}>
            <table className="tbl">
              <thead><tr>
                <th className="col-sp">Sản phẩm</th><th className="center">Ngành</th>
                <th className="center">Giá</th><th className="center">Kho tổng</th>
                <th className="center">Người thêm</th><th className="center">Ngày thêm</th><th className="center">Gỡ</th>
              </tr></thead>
              <tbody>
                {dsTab.map((r) => (
                  <tr key={r.barcode}>
                    <td className="col-sp">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <AnhSP url={r.hinh_url} />
                        <div>
                          <div className="mono" style={{ fontWeight: 700, color: 'var(--teal-deep)' }}>{r.ma_tham_chieu || r.sku}</div>
                          <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>{r.nganh_3}</div>
                        </div>
                      </div>
                    </td>
                    <td className="center"><BadgeNganh n1={r.nganh_1} /></td>
                    <td className="num">{fmtVND(r.gia_niem_yet)}</td>
                    <td className="num">{r.kho_tong}</td>
                    <td className="center">{r.nguoi_tao || '—'}</td>
                    <td className="center">{fmtNgay(r.tao_luc)}</td>
                    <td className="center"><button className="btn-mini btn-danger" onClick={() => xoa(r.barcode)}>－ Gỡ</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Tab HÀNG MỚI: mã tạo gần đây */}
      {tab === 'HANG_MOI' && (
        <div className="card" style={{ marginTop: 12, padding: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>Mã tạo gần đây</div>
            <span style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>
              (mã tạo ≤ 30 ngày <b>tự động</b> khóa chia — bấm ＋ chỉ khi muốn giữ khóa lâu hơn 30 ngày)
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', width: '100%', marginTop: 4 }}>
              <div className="nhom-tabs" style={{ margin: 0 }}>
                {[['ALL', 'Tất cả'], ['BH', 'Mũ bảo hiểm'], ['NV', 'Nón vải']].map(([k, ten]) => (
                  <button key={k} className={'nhom-tab' + (locNganh === k ? ' on' : '')} onClick={() => setLocNganh(k)}>{ten}</button>
                ))}
              </div>
              <div className="nhom-tabs" style={{ margin: 0 }}>
                {[14, 30, 60, 90].map((n) => (
                  <button key={n} className={'nhom-tab' + (!tatCa && soNgay === n ? ' on' : '')} onClick={() => { setTatCa(false); setSoNgay(n); }}>{n} ngày</button>
                ))}
                <button className={'nhom-tab' + (tatCa ? ' on' : '')} onClick={() => setTatCa(true)}>Tất cả mã</button>
              </div>
              <div style={{ position: 'relative' }}>
                <IcSearch style={{ position: 'absolute', left: 10, top: 12, width: 15, height: 15, color: 'var(--ink-2)', pointerEvents: 'none' }} />
                <input className="inp" style={{ width: 190, paddingLeft: 33 }} placeholder="Barcode, SKU, mã"
                  value={qMoi} onChange={(e) => setQMoi(e.target.value)} />
              </div>
            </div>
          </div>
          {!maMoi ? (
            <div className="quet-load"><div className="quet-ring" /><div className="quet-s">đang tải…</div></div>
          ) : !maMoiLoc.length ? (
            <div className="empty" style={{ margin: 14 }}>Không có mã nào khớp trong {soNgay} ngày qua.</div>
          ) : (
            <div className="tbl-wrap" style={{ maxHeight: '52vh' }}>
              <table className="tbl">
                <thead><tr>
                  <th className="col-sp sortable" onClick={() => doiSortMoi('sp')}>Sản phẩm{icSort('sp')}</th>
                  <th className="center sortable" onClick={() => doiSortMoi('nganh')}>Ngành{icSort('nganh')}</th>
                  <th className="center sortable" onClick={() => doiSortMoi('ngay')}>Ngày tạo mã{icSort('ngay')}</th>
                  <th className="center sortable" onClick={() => doiSortMoi('gia')}>Giá{icSort('gia')}</th>
                  <th className="center sortable" onClick={() => doiSortMoi('kho')}>Kho tổng{icSort('kho')}</th>
                  <th className="center sortable" onClick={() => doiSortMoi('ban')}>Đã bán 30N{icSort('ban')}</th>
                  <th className="center">Thêm DS</th>
                </tr></thead>
                <tbody>
                  {maMoiLoc.map((r) => (
                    <tr key={r.barcode} className="row-click" onClick={() => moBan(r, null, null)} title="Bấm xem bán tại từng cửa hàng">
                      <td className="col-sp">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <AnhSP url={r.hinh_url} />
                          <div>
                            <div className="mono" style={{ fontWeight: 700, color: 'var(--teal-deep)' }}>{r.ma_tham_chieu || r.sku}</div>
                            <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>{r.nganh_3}</div>
                          </div>
                        </div>
                      </td>
                      <td className="center"><BadgeNganh n1={r.nganh_1} /></td>
                      <td className="center"><b style={{ color: 'var(--teal-deep)' }}>{fmtNgay(r.ngay_tao_ma)}</b></td>
                      <td className="num">{fmtVND(r.gia_niem_yet)}</td>
                      <td className="num">{r.kho_tong}</td>
                      <td className="num">{r.da_ban_30}</td>
                      <td className="center">
                        {r.dac_biet
                          ? <span style={{ fontSize: 11, color: 'var(--ink-2)' }}>đã có</span>
                          : <button className="btn-mini" onClick={(e) => { e.stopPropagation(); them(r.barcode, 'HANG_MOI'); }}>＋</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Ảnh hover phóng to + lightbox — như Đề nghị hàng */}
      {hoverAnh && (
        <img className="sp-zoom" src={hoverAnh.url} alt=""
          style={{ left: Math.min(hoverAnh.x, window.innerWidth - 340), top: Math.max(10, hoverAnh.y) }} />
      )}
      {xemAnh && (
        <div className="img-lightbox" onClick={() => setXemAnh(null)}>
          <img src={xemAnh} alt="" />
        </div>
      )}

      {/* Panel: bán mã tại từng cửa hàng (kiểm soát toàn diện — CHỈ số lượng) */}
      {xemBan && (
        <div className="modal-nen" onClick={() => setXemBan(null)}>
          <div className="modal-hop" onClick={(e) => e.stopPropagation()}>
            <div className="modal-dau">
              <div>
                <div className="mono" style={{ fontWeight: 700, color: 'var(--teal-deep)', fontSize: 15 }}>
                  {xemBan.sp.ma_tham_chieu || xemBan.sp.sku}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                  {xemBan.sp.nganh_3} · bán tại từng cửa hàng {xemBan.tu ? '(khoảng chọn)' : '(30 ngày gần nhất)'}</div>
              </div>
              <button className="btn-mini" onClick={() => setXemBan(null)}>Đóng</button>
            </div>
            <div className="modal-than">
              {!xemBan.rows ? (
                <div className="quet-load"><div className="quet-ring" /><div className="quet-s">đang tải…</div></div>
              ) : !xemBan.rows.length ? (
                <div className="empty">Mã này chưa phát sinh bán và không còn tồn ở cửa hàng nào.</div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 14, marginBottom: 10, fontSize: 12.5 }}>
                    <span>Tổng bán: <b style={{ color: 'var(--teal-deep)' }}>{xemBan.rows.reduce((s, r) => s + Number(r.sl_ban), 0)}</b></span>
                    <span>Số cửa hàng có bán: <b>{xemBan.rows.filter((r) => Number(r.sl_ban) > 0).length}</b></span>
                  </div>
                  <div className="tbl-wrap" style={{ maxHeight: '54vh' }}>
                    <table className="tbl">
                      <thead><tr>
                        <th>Cửa hàng</th><th className="center">Khu vực</th>
                        <th className="center">SL bán</th><th className="center">Tồn hiện tại</th><th className="center">Bán gần nhất</th>
                      </tr></thead>
                      <tbody>
                        {xemBan.rows.map((r) => (
                          <tr key={r.ma_ch}>
                            <td><b>{r.ten_ch}</b> <span style={{ color: 'var(--ink-2)', fontSize: 11 }}>{r.ma_ch}</span></td>
                            <td className="center">{r.khu_vuc || '—'}</td>
                            <td className="num" style={{ fontWeight: 700, color: Number(r.sl_ban) > 0 ? 'var(--teal-deep)' : 'var(--ink-2)' }}>{r.sl_ban}</td>
                            <td className="num">{r.ton_hien_tai}</td>
                            <td className="center">{fmtNgay(r.lan_cuoi)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
