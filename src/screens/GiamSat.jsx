import { useEffect, useMemo, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { Sel, DateBox } from '../lib/ui.jsx';
import { IcAlert, IcRefresh, IcBox, IcSearch, IcCheck } from '../lib/icons.jsx';
import { useApp } from '../App.jsx';

// ===== GIÁM SÁT THIẾU HÀNG =====
// Mục tiêu số 1 của hệ thống: KHÔNG để cửa hàng bán chạy/bán hết mà không được
// bổ sung kịp, trong khi KHO TỔNG VẪN CÒN HÀNG.
// Máy quét: mã ĐÃ BÁN trong khoảng ngày + CH hết hàng + kho còn + (chưa) có phiếu đề nghị.
const iso = (d) => d.toISOString().slice(0, 10);

export default function GiamSat() {
  const { user, baoToast } = useApp();
  const [tu, setTu] = useState(iso(new Date(Date.now() - 13 * 864e5)));
  const [den, setDen] = useState(iso(new Date()));
  const [locDN, setLocDN] = useState('CHUA');       // CHUA | TAT_CA | DA
  const [locNhom, setLocNhom] = useState('ALL');    // ALL | BH | NV
  const [maCH, setMaCH] = useState(user.vai_tro === 'CH' ? user.ma_ch : '');
  const [dsCH, setDsCH] = useState([]);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (user.vai_tro !== 'CH') {
      sb.from('cua_hang').select('ma_ch, ten').like('ma_ch', 'CH%')
        .eq('hoat_dong', true).order('ten').then(({ data }) => setDsCH(data || []));
    }
  }, []);

  const quet = async () => {
    setBusy(true);
    const { data, error } = await sb.rpc('fn_quet_thieu_hang', {
      p_tu: tu, p_den: den, p_ma_ch: maCH || null, p_nguong_ton: 0,
    });
    setBusy(false);
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    setRows(data || []);
  };
  useEffect(() => { quet(); }, []);

  const hien = useMemo(() => {
    let v = rows;
    if (locDN === 'CHUA') v = v.filter((r) => !r.da_de_nghi);
    if (locDN === 'DA') v = v.filter((r) => r.da_de_nghi);
    if (locNhom !== 'ALL') v = v.filter((r) => r.nhom_hang === locNhom);
    if (q) {
      const k = q.toUpperCase();
      v = v.filter((r) => [r.barcode, r.ma_tham_chieu, r.ten_ch, r.ma_ch]
        .some((x) => (x || '').toUpperCase().includes(k)));
    }
    return v;
  }, [rows, locDN, locNhom, q]);

  const chuaDN = rows.filter((r) => !r.da_de_nghi);
  const soCH = new Set(chuaDN.map((r) => r.ma_ch)).size;
  const tongMatBan = chuaDN.reduce((s, r) => s + r.sl_ban, 0);

  return (
    <>
      <div className="cmdbar">
        <h1>Giám sát thiếu hàng</h1>
        <div className="sub">Mã đã bán hết tại cửa hàng, kho tổng còn hàng — soi ngay ai chưa đề nghị bổ sung.</div>
        <div className="row">
          {user.vai_tro !== 'CH' && (
            <Sel value={maCH} onChange={setMaCH} placeholder="Toàn hệ thống"
              options={[{ value: '', label: 'Toàn hệ thống' },
                ...dsCH.map((c) => ({ value: c.ma_ch, label: c.ten, sub: c.ma_ch }))]}
              style={{ minWidth: 210 }} />
          )}
          <DateBox label="Từ" value={tu} onChange={setTu} />
          <DateBox label="Đến" value={den} onChange={setDen} />
          <button className="btn btn-ai" onClick={quet} disabled={busy}>
            <IcSearch /> {busy ? 'Đang quét…' : 'Quét thiếu hàng'}
          </button>
        </div>
      </div>

      <div className="kpis">
        <div className="card">
          <div style={{ fontSize: 11.5, color: 'var(--ink-2)', fontWeight: 600 }}>DÒNG THIẾU CHƯA ĐỀ NGHỊ</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: chuaDN.length ? 'var(--magenta)' : 'var(--green)', fontFamily: 'var(--font-disp)' }}>
            {chuaDN.length}</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 11.5, color: 'var(--ink-2)', fontWeight: 600 }}>CỬA HÀNG LIÊN QUAN</div>
          <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'var(--font-disp)' }}>{soCH}</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 11.5, color: 'var(--ink-2)', fontWeight: 600 }}>SỨC BÁN ĐANG BỎ LỠ (SP/KỲ)</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--gold)', fontFamily: 'var(--font-disp)' }}>{tongMatBan}</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 11.5, color: 'var(--ink-2)', fontWeight: 600 }}>ĐÃ CÓ PHIẾU BỔ SUNG</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--teal-deep)', fontFamily: 'var(--font-disp)' }}>
            {rows.length - chuaDN.length}</div>
        </div>
      </div>

      <div className="toolbar">
        <Sel value={locDN} onChange={setLocDN} options={[
          { value: 'CHUA', label: 'Chưa đề nghị — cần xử lý' },
          { value: 'TAT_CA', label: 'Tất cả' },
          { value: 'DA', label: 'Đã có phiếu bổ sung' },
        ]} />
        <Sel value={locNhom} onChange={setLocNhom} options={[
          { value: 'ALL', label: 'Cả hai ngành' },
          { value: 'BH', label: 'Mũ bảo hiểm' },
          { value: 'NV', label: 'Nón vải' },
        ]} />
        <div style={{ position: 'relative' }}>
          <input type="search" placeholder="Tìm mã / cửa hàng" value={q}
            onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 34, width: 220 }} />
          <span style={{ position: 'absolute', left: 10, top: 10, color: 'var(--ink-2)' }}><IcSearch /></span>
        </div>
        <span className="chip dim" style={{ marginLeft: 'auto' }}>{hien.length} dòng</span>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr>
            <th>Cửa hàng</th><th>Sản phẩm</th>
            <th className="num">Đã bán/kỳ</th><th className="num">Trống (ngày)</th>
            <th className="num">Tồn CH</th><th className="num">Kho tổng</th>
            <th>Tình trạng</th>
          </tr></thead>
          <tbody>
            {hien.map((r) => (
              <tr key={r.ma_ch + r.barcode}
                style={!r.da_de_nghi ? { background: '#FFF6FA' } : undefined}>
                <td><b>{r.ten_ch}</b> <span className="mono" style={{ color: 'var(--ink-2)', fontSize: 11 }}>{r.ma_ch}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    {r.hinh_url ? <img className="sp" src={r.hinh_url} alt="" loading="lazy" />
                      : <div className="noimg"><IcBox /></div>}
                    <div>
                      <div className="mono" style={{ fontWeight: 600 }}>{r.ma_tham_chieu || r.barcode}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>
                        {r.nganh_3}{r.la_hang_sale ? ' · sale' : ''}</div>
                    </div>
                  </div>
                </td>
                <td className="num" style={{ fontWeight: 700 }}>{r.sl_ban}</td>
                <td className="num" style={r.so_ngay_trong >= 3 ? { color: 'var(--magenta)', fontWeight: 700 } : undefined}>
                  {r.so_ngay_trong}</td>
                <td className="num">{r.ton_ch}</td>
                <td className="num" style={{ color: 'var(--teal-deep)', fontWeight: 700 }}>{r.kho_tong}</td>
                <td>
                  {r.da_de_nghi
                    ? <span className="chip teal"><IcCheck /> Phiếu #{r.don_id}</span>
                    : <span className="chip warn"><IcAlert /> Chưa đề nghị bổ sung</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!hien.length && !busy && <div className="empty">
          <div className="t">Không có mã nào thiếu theo bộ lọc</div>
          Cửa hàng đang được cấp hàng đầy đủ trong khoảng ngày này.
        </div>}
      </div>
    </>
  );
}
