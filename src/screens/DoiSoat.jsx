import { useEffect, useState } from 'react';
import { sb, fmtDT } from '../lib/supabase.js';
import { useApp } from '../App.jsx';

// ===== ĐỐI SOÁT DỮ LIỆU — số hàng đã sync (DB) vs data tồn (sheet), phát hiện lệch =====
const TEN_BANG = { ton_kho: 'Tồn kho', ban_hang: 'Bán hàng', cua_hang: 'Cửa hàng' };

export default function DoiSoat() {
  const { baoToast } = useApp();
  const [moiNhat, setMoiNhat] = useState(null);
  const [lichSu, setLichSu] = useState(null);
  const [dangTai, setDangTai] = useState(false);

  const tai = async () => {
    setDangTai(true);
    const [a, b] = await Promise.all([
      sb.rpc('fn_doi_soat_moi_nhat'),
      sb.rpc('fn_doi_soat_lich_su', { p_gioi_han: 50 }),
    ]);
    if (a.error) baoToast('Lỗi: ' + a.error.message);
    setMoiNhat(a.data || []);
    setLichSu(b.data || []);
    setDangTai(false);
  };
  useEffect(() => { tai(); }, []);   // eslint-disable-line

  const fmtSL = (n) => n == null ? '—' : Number(n).toLocaleString('vi');
  const lechClass = (khop) => khop ? 'ds-ok' : 'ds-lech';

  return (
    <div className="wrap">
      <div className="page-head">
        <div>
          <h2>Đối soát dữ liệu</h2>
          <p>So số liệu đã đồng bộ (Supabase) với data gốc trên Google Sheet. Lệch = cần kiểm tra sync.</p>
        </div>
        <button className="btn btn-ai" onClick={tai} disabled={dangTai}>{dangTai ? 'Đang tải…' : '↻ Làm mới'}</button>
      </div>

      {/* Thẻ trạng thái mới nhất mỗi bảng */}
      <div className="the-hang the-hang-wrap" style={{ marginTop: 4 }}>
        {moiNhat === null ? <div style={{ padding: 16, color: 'var(--ink-2)' }}>Đang tải…</div>
          : moiNhat.length === 0 ? <div style={{ padding: 16, color: 'var(--ink-2)' }}>Chưa có dữ liệu đối soát. Chạy sync để tạo.</div>
          : moiNhat.map((r) => (
            <div key={r.bang} className={'ds-card ' + lechClass(r.khop)}>
              <div className="ds-card-top">
                <span className="ds-card-ten">{TEN_BANG[r.bang] || r.bang}</span>
                <span className={'ds-badge ' + (r.khop ? 'ds-badge-ok' : 'ds-badge-lech')}>
                  {r.khop ? '✓ Khớp' : '⚠ Lệch'}
                </span>
              </div>
              <div className="ds-card-body">
                <div className="ds-line"><span>Số dòng</span>
                  <span>sheet {fmtSL(r.so_dong_sheet)} · DB {fmtSL(r.so_dong_db)}
                    {r.lech_dong !== 0 && <b className="ds-delta"> ({r.lech_dong > 0 ? '+' : ''}{r.lech_dong})</b>}</span></div>
                <div className="ds-line"><span>Tổng số lượng</span>
                  <span>sheet {fmtSL(r.tong_sl_sheet)} · DB {fmtSL(r.tong_sl_db)}
                    {r.lech_sl !== 0 && <b className="ds-delta"> ({r.lech_sl > 0 ? '+' : ''}{r.lech_sl})</b>}</span></div>
              </div>
              <div className="ds-card-luc">Cập nhật: {fmtDT(r.luc)}</div>
            </div>
          ))}
      </div>

      {/* Lịch sử đối soát */}
      <div className="card" style={{ marginTop: 16, padding: 0, overflow: 'hidden' }}>
        <div className="card-head" style={{ padding: '12px 16px' }}>Lịch sử đối soát (50 lần gần nhất)</div>
        <div className="tbl-wrap" style={{ maxHeight: '52vh', overflow: 'auto' }}>
          <table className="tbl tbl-fit">
            <thead><tr>
              <th>Thời điểm</th><th>Bảng</th><th className="center">Kết quả</th>
              <th className="num">Dòng sheet</th><th className="num">Dòng DB</th>
              <th className="num">SL sheet</th><th className="num">SL DB</th>
              <th className="num">Lệch SL</th><th>Ghi chú</th>
            </tr></thead>
            <tbody>
              {lichSu === null ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 24, color: 'var(--ink-2)' }}>Đang tải…</td></tr>
              ) : lichSu.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 24, color: 'var(--ink-2)' }}>Chưa có bản ghi.</td></tr>
              ) : lichSu.map((r, i) => (
                <tr key={i} className={r.khop ? '' : 'ds-row-lech'}>
                  <td style={{ fontSize: 12 }}>{fmtDT(r.luc)}</td>
                  <td>{TEN_BANG[r.bang] || r.bang}</td>
                  <td className="center"><span className={'ds-badge ' + (r.khop ? 'ds-badge-ok' : 'ds-badge-lech')}>{r.khop ? 'Khớp' : 'Lệch'}</span></td>
                  <td className="num">{fmtSL(r.so_dong_sheet)}</td>
                  <td className="num">{fmtSL(r.so_dong_db)}</td>
                  <td className="num">{fmtSL(r.tong_sl_sheet)}</td>
                  <td className="num">{fmtSL(r.tong_sl_db)}</td>
                  <td className="num">{r.lech_sl === 0 ? '—' : <b style={{ color: 'var(--magenta)' }}>{r.lech_sl > 0 ? '+' : ''}{r.lech_sl}</b>}</td>
                  <td style={{ fontSize: 12, color: 'var(--ink-2)' }}>{r.ghi_chu || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
