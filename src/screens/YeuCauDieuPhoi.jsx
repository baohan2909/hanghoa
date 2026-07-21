import { Fragment, useEffect, useMemo, useState } from 'react';
import { sb, fmtDT } from '../lib/supabase.js';
import { useApp } from '../App.jsx';
import { DateBox } from '../lib/ui.jsx';

// ===== YÊU CẦU ĐIỀU PHỐI — tổng hợp nhu cầu mã hết hàng cửa hàng báo về =====
export default function YeuCauDieuPhoi() {
  const { baoToast } = useApp();
  const [rows, setRows] = useState(null);
  const [tu, setTu] = useState('');
  const [den, setDen] = useState('');
  const [q, setQ] = useState('');
  const [mo, setMo] = useState(null);          // barcode đang mở chi tiết
  const [chiTiet, setChiTiet] = useState({});  // barcode -> danh sách CH

  const tai = async () => {
    setRows(null); setMo(null);
    const { data, error } = await sb.rpc('fn_ycdp_tong_hop', { p_tu: tu || null, p_den: den || null });
    if (error) { baoToast('Lỗi: ' + error.message); setRows([]); return; }
    setRows(data || []);
  };
  useEffect(() => { tai(); }, [tu, den]);   // eslint-disable-line

  const xoChiTiet = async (bc) => {
    if (mo === bc) { setMo(null); return; }
    setMo(bc);
    if (!chiTiet[bc]) {
      const { data } = await sb.rpc('fn_ycdp_chi_tiet', { p_barcode: bc });
      setChiTiet((m) => ({ ...m, [bc]: data || [] }));
    }
  };

  const hien = useMemo(() => {
    let v = [...(rows || [])];
    if (q.trim()) { const t = q.trim().toLowerCase();
      v = v.filter((r) => (r.ma_tham_chieu || '').toLowerCase().includes(t)
        || (r.ten_sp || '').toLowerCase().includes(t) || (r.barcode || '').includes(t)
        || (r.ds_ch || '').toLowerCase().includes(t)); }
    return v;
  }, [rows, q]);

  const tong = useMemo(() => {
    const v = rows || [];
    return { ma: v.length, sl: v.reduce((s, r) => s + Number(r.tong_sl), 0),
      ch: new Set((v.flatMap((r) => (r.ds_ch || '').split(', ')))).size };
  }, [rows]);

  const xuat = async () => {
    const XLSX = await import('xlsx');
    const hdr = ['Mã tham chiếu', 'Barcode', 'Sản phẩm', 'Ngành', 'Số CH xin', 'Tổng SL cần', 'Tồn hệ thống', 'Các cửa hàng', 'Mới nhất'];
    const data = hien.map((r) => [r.ma_tham_chieu, r.barcode, r.ten_sp, r.nganh_1,
      Number(r.so_ch), Number(r.tong_sl), Number(r.ton_he_thong), r.ds_ch, fmtDT(r.moi_nhat)]);
    const ws = XLSX.utils.aoa_to_sheet([hdr, ...data]); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Yêu cầu điều phối'); XLSX.writeFile(wb, `YeuCauDieuPhoi_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  return (
    <div className="wrap">
      <div className="page-head">
        <div>
          <h2>Yêu cầu điều phối</h2>
          <p>Nhu cầu hàng cửa hàng báo về (mã đã bán nhưng hết tồn). Hệ thống chỉ ghi nhu cầu — bộ phận liên quan chủ động xử lý.</p>
        </div>
        <button className="btn btn-ai" onClick={tai}>↻ Làm mới</button>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <DateBox label="Từ" value={tu} onChange={setTu} />
        <DateBox label="Đến" value={den} onChange={setDen} />
        <input className="flt-in" placeholder="Tìm mã / sản phẩm / cửa hàng…" value={q}
          onChange={(e) => setQ(e.target.value)} style={{ height: 40, minWidth: 220, flex: 1 }} />
        <span className="sla-chip">{tong.ma} mã · {tong.sl} cái · {tong.ch} cửa hàng</span>
        <button className="btn btn-ghost" onClick={xuat}>Xuất Excel</button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="tbl-wrap" style={{ maxHeight: '64vh', overflow: 'auto' }}>
          <table className="tbl tbl-fit">
            <thead><tr>
              <th>Sản phẩm</th>
              <th className="num">Số CH xin</th>
              <th className="num">Tổng cần</th>
              <th className="num">Tồn hệ thống</th>
              <th>Cửa hàng</th>
              <th>Mới nhất</th>
            </tr></thead>
            <tbody>
              {rows === null ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 26, color: 'var(--ink-2)' }}>Đang tải…</td></tr>
              ) : hien.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 26, color: 'var(--ink-2)' }}>Chưa có yêu cầu điều phối nào.</td></tr>
              ) : hien.map((r) => (
                <Fragment key={r.barcode}>
                  <tr className="ycdp-row" onClick={() => xoChiTiet(r.barcode)} style={{ cursor: 'pointer' }}>
                    <td><span style={{ marginRight: 6, color: 'var(--teal-deep)' }}>{mo === r.barcode ? '▼' : '▶'}</span>
                      <b>{r.ma_tham_chieu || r.barcode}</b>
                      <div style={{ fontSize: 11, color: 'var(--ink-2)', marginLeft: 18 }}>{r.ten_sp} · {r.nganh_1}</div></td>
                    <td className="num" style={{ fontWeight: 800, fontSize: 15, color: 'var(--teal-deep)' }}>{Number(r.so_ch)}</td>
                    <td className="num" style={{ fontWeight: 800, fontSize: 15, color: 'var(--magenta)' }}>{Number(r.tong_sl)}</td>
                    <td className="num" style={{ color: Number(r.ton_he_thong) > 0 ? 'var(--teal-deep)' : 'var(--ink-3)' }}>
                      {Number(r.ton_he_thong)}{Number(r.ton_he_thong) > 0 && <div style={{ fontSize: 10, color: 'var(--teal-deep)' }}>điều chuyển được</div>}</td>
                    <td style={{ fontSize: 11, color: 'var(--ink-2)', maxWidth: 260 }}>{r.ds_ch}</td>
                    <td style={{ fontSize: 12 }}>{fmtDT(r.moi_nhat)}</td>
                  </tr>
                  {mo === r.barcode && (
                    <tr><td colSpan={6} style={{ padding: 0, background: '#F7F9FB' }}>
                      {!chiTiet[r.barcode] ? <div style={{ padding: 12, fontSize: 12, color: 'var(--ink-2)' }}>Đang tải…</div>
                        : (
                        <div style={{ padding: '8px 10px 10px 34px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                          {chiTiet[r.barcode].map((c) => (
                            <div key={c.ma_ch} style={{ display: 'flex', justifyContent: 'space-between',
                              background: '#fff', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 12px', fontSize: 12 }}>
                              <span><b>{c.ten_ch}</b> <span className="mono" style={{ color: 'var(--ink-2)', fontSize: 10 }}>{c.ma_ch} · {c.khu_vuc}</span></span>
                              <span>cần <b style={{ color: 'var(--magenta)' }}>{c.so_luong}</b> · {fmtDT(c.tao_luc)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
