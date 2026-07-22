import { useEffect, useState } from 'react';
import { sb, fmtDT } from '../lib/supabase.js';
import { useApp } from '../App.jsx';

// ===== ĐỐI SOÁT DỮ LIỆU — số hàng đã sync (DB) vs data tồn (sheet), phát hiện lệch =====
const TEN_BANG = { ton_kho: 'Tồn kho', ban_hang: 'Bán hàng', cua_hang: 'Cửa hàng' };

export default function DoiSoat() {
  const { baoToast } = useApp();
  const [moiNhat, setMoiNhat] = useState(null);
  const [lichSu, setLichSu] = useState(null);
  const [syncTT, setSyncTT] = useState(null);        // tình trạng đồng bộ mỗi bước
  const [syncLS, setSyncLS] = useState(null);        // lịch sử đồng bộ
  const [dangTai, setDangTai] = useState(false);

  const tai = async (imLang) => {
    if (!imLang) setDangTai(true);
    const [a, b, c, d] = await Promise.all([
      sb.rpc('fn_doi_soat_moi_nhat'),
      sb.rpc('fn_doi_soat_lich_su', { p_gioi_han: 50 }),
      sb.rpc('fn_sync_tinh_trang'),
      sb.rpc('fn_sync_lich_su', { p_gioi_han: 40 }),
    ]);
    if (a.error && !imLang) baoToast('Lỗi: ' + a.error.message);
    setMoiNhat(a.data || []);
    setLichSu(b.data || []);
    setSyncTT(c.data || []);
    setSyncLS(d.data || []);
    if (!imLang) setDangTai(false);
  };
  useEffect(() => { tai(); }, []);   // eslint-disable-line

  // LUÔN tự làm mới khi màn đang mở, để bắt được cả lúc sync mới bắt đầu (không chỉ khi
  // đã thấy "đang chạy"). Đang chạy -> 3s cho mượt %; rảnh -> 8s cho nhẹ.
  const dangChay = (syncTT || []).some((s) => s.trang_thai === 'DANG_CHAY');
  useEffect(() => {
    const t = setInterval(() => { tai(true); }, dangChay ? 3000 : 8000);
    return () => clearInterval(t);
  }, [dangChay]);   // eslint-disable-line

  const fmtSL = (n) => n == null ? '—' : Number(n).toLocaleString('vi');
  const lechClass = (khop) => khop ? 'ds-ok' : 'ds-lech';

  return (
    <>
      <div className="cmdbar">
        <div className="cmd-title">
          <h2>Đối soát dữ liệu</h2>
          <p>So số liệu đã đồng bộ (Supabase) với data gốc trên Google Sheet. Lệch = cần kiểm tra sync.</p>
        </div>
        <div className="cmd-row">
          <button className="btn btn-ai" onClick={tai} disabled={dangTai}>{dangTai ? 'Đang tải…' : '↻ Làm mới'}</button>
        </div>
      </div>

      {/* ===== TÌNH TRẠNG ĐỒNG BỘ — xem ngay sync có lỗi không ===== */}
      {syncTT && syncTT.length > 0 && (() => {
        const TEN = { ton_kho: 'Tồn kho', ban_hang: 'Bán hàng', dieu_chuyen: 'Điều chuyển', san_pham: 'Sản phẩm',
          cua_hang: 'Cửa hàng', syncTonKho: 'Tồn kho', syncBanHang: 'Bán hàng', syncDieuChuyen: 'Điều chuyển',
          syncCuaHang: 'Cửa hàng', syncSale: 'Hàng sale', syncHinhAnh: 'Hình ảnh', syncTaiKhoan: 'Tài khoản', tong: 'Tổng thể' };
        const coLoi = syncTT.filter((s) => s.trang_thai === 'LOI');
        const dangCh = syncTT.filter((s) => s.trang_thai === 'DANG_CHAY');
        const fmtPhut = (p) => p == null ? '' : p < 1 ? 'vừa xong' : p < 60 ? Math.round(p) + ' phút trước'
          : p < 1440 ? Math.round(p / 60) + ' giờ trước' : Math.round(p / 1440) + ' ngày trước';
        return (
          <div style={{ marginBottom: 14 }}>
            {dangCh.length > 0 ? (
              <div className="sync-dangchay">🔄 Đang đồng bộ: {dangCh.map((s) => (TEN[s.buoc] || s.buoc) + (s.chi_tiet ? ' — ' + s.chi_tiet : '')).join(' · ')} <span className="sync-tudong">(tự cập nhật…)</span></div>
            ) : coLoi.length > 0 ? (
              <div className="sync-canhbao">⚠ Có {coLoi.length} bước đồng bộ đang LỖI: {coLoi.map((s) => TEN[s.buoc] || s.buoc).join(', ')}. Kiểm tra bên dưới.</div>
            ) : (
              <div className="sync-ok">✓ Đồng bộ đang bình thường — tất cả các bước chạy OK.</div>
            )}
            <div className="the-hang the-hang-wrap" style={{ marginTop: 8 }}>
              {syncTT.filter((s) => s.buoc !== 'tong').map((s) => (
                <div key={s.buoc} className={'the-g sync-the ' + (s.trang_thai === 'DANG_CHAY' ? 'sync-dc' : s.trang_thai === 'LOI' ? 'sync-loi' : s.trang_thai === 'BO_LUOT' ? 'sync-bo' : 'sync-tot')}>
                  <div className="the-g-nhan">{TEN[s.buoc] || s.buoc}</div>
                  <div className="the-g-so" style={{ fontSize: 15 }}>
                    {s.trang_thai === 'DANG_CHAY' ? '🔄 Đang chạy' : s.trang_thai === 'OK' ? '✓ OK' : s.trang_thai === 'BO_LUOT' ? '⏸ Bỏ lượt' : '✕ Lỗi'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>{s.trang_thai === 'DANG_CHAY' ? s.chi_tiet : fmtPhut(s.phut_truoc)}</div>
                  {s.trang_thai === 'LOI' && s.chi_tiet && <div className="sync-loi-ct" title={s.chi_tiet}>{s.chi_tiet}</div>}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

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
    </>
  );
}
