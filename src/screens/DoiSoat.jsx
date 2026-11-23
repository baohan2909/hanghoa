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
  const [dcTon, setDcTon] = useState(null);         // NEW - 3.139 đối chiếu tồn kho nguồn với phiếu Odoo
  const [moCt, setMoCt] = useState(false);

  const tai = async (imLang) => {
    if (!imLang) setDangTai(true);
    const [a, b, c, d, e] = await Promise.all([
      sb.rpc('fn_doi_soat_moi_nhat'),
      sb.rpc('fn_doi_soat_lich_su', { p_gioi_han: 50 }),
      sb.rpc('fn_sync_tinh_trang'),
      sb.rpc('fn_sync_lich_su', { p_gioi_han: 40 }),
      sb.rpc('fn_ton_dc_ds', { p_gio: 24 }),
    ]);
    if (a.error && !imLang) baoToast('Lỗi: ' + a.error.message);
    setMoiNhat(a.data || []);
    setLichSu(b.data || []);
    setSyncTT(c.data || []);
    setSyncLS(d.data || []);
    if (!e.error) setDcTon(e.data || null);
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
          syncCuaHang: 'Cửa hàng', syncSale: 'Hàng sale', syncHinhAnh: 'Hình ảnh', syncTaiKhoan: 'Tài khoản' };
        // CHỈ hiện bước sync thật (có tên trong TEN) — bỏ dòng test (kiem_*), bỏ 'tong'
        const hienTT = syncTT.filter((s) => TEN[s.buoc]);
        if (!hienTT.length) return null;
        const coLoi = hienTT.filter((s) => s.trang_thai === 'LOI');
        const dangCh = hienTT.filter((s) => s.trang_thai === 'DANG_CHAY');
        const fmtPhut = (p) => p == null ? '' : p < 1 ? 'vừa xong' : p < 60 ? Math.round(p) + ' phút trước'
          : p < 1440 ? Math.round(p / 60) + ' giờ trước' : Math.round(p / 1440) + ' ngày trước';
        return (
          <div className="card sync-khoi">
            <div className="sync-khoi-tit">Tình trạng đồng bộ</div>
            {dangCh.length > 0 ? (
              <div className="sync-dangchay">🔄 Đang đồng bộ: {dangCh.map((s) => (TEN[s.buoc] || s.buoc) + (s.chi_tiet ? ' — ' + s.chi_tiet : '')).join(' · ')} <span className="sync-tudong">(tự cập nhật…)</span></div>
            ) : coLoi.length > 0 ? (
              <div className="sync-canhbao">⚠ Có {coLoi.length} bước đồng bộ đang LỖI: {coLoi.map((s) => TEN[s.buoc] || s.buoc).join(', ')}.</div>
            ) : (
              <div className="sync-ok">✓ Đồng bộ bình thường — tất cả các bước chạy OK.</div>
            )}
            <div className="sync-ds">
              {hienTT.map((s) => (
                <div key={s.buoc} className="sync-dong">
                  <span className={'sync-dot ' + (s.trang_thai === 'DANG_CHAY' ? 'dc' : s.trang_thai === 'LOI' ? 'loi' : s.trang_thai === 'BO_LUOT' ? 'bo' : 'ok')} />
                  <span className="sync-dong-ten">{TEN[s.buoc] || s.buoc}</span>
                  <span className={'sync-dong-tt ' + (s.trang_thai === 'DANG_CHAY' ? 'dc' : s.trang_thai === 'LOI' ? 'loi' : s.trang_thai === 'BO_LUOT' ? 'bo' : 'ok')}>
                    {s.trang_thai === 'DANG_CHAY' ? 'Đang chạy' : s.trang_thai === 'OK' ? 'OK' : s.trang_thai === 'BO_LUOT' ? 'Bỏ lượt' : 'Lỗi'}
                  </span>
                  <span className="sync-dong-luc">{s.trang_thai === 'DANG_CHAY' ? s.chi_tiet : fmtPhut(s.phut_truoc)}</span>
                  {s.trang_thai === 'LOI' && s.chi_tiet && <span className="sync-dong-ct" title={s.chi_tiet}>{s.chi_tiet}</span>}
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

      {/* NEW - 3.139 ĐỐI CHIẾU TỒN KHO NGUỒN VỚI PHIẾU ODOO (SQL 227) */}
      {dcTon && (() => {
        const gc = dcTon.gio_chuan || {};
        const luot = dcTon.luot || [];
        const ct = dcTon.chi_tiet || [];
        const gio = (t) => (t ? new Date(t).toLocaleString('vi', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—');
        return (
          <div className="card dct" style={{ marginTop: 16, padding: 0, overflow: 'hidden' }}>
            <div className="card-head" style={{ padding: '12px 16px' }}>Đối chiếu tồn kho nguồn với phiếu Odoo (24 giờ)</div>
            <div className="dct-ghi">
              Mỗi lần tồn mới về: <b>tồn mới − (tồn trước − xuất theo phiếu + nhập theo phiếu)</b> = biến động không có phiếu Odoo
              (bán, nhập mua / sản xuất, đơn online, kiểm kê). Xử lý sau 35 phút để phiếu kịp về.
              <span className={'dct-chip ' + (gc.co > 0 ? 'ok' : 'vang')}>
                {gc.co > 0 ? `Giờ chuẩn Odoo: ${fmtSL(gc.co)}/${fmtSL(gc.tong)} dòng tồn` : 'Đang dùng giờ GAS đọc — cập nhật GAS v3.33.0 + nhờ IT ghi giờ vào ô Q1'}
              </span>
              {dcTon.cho > 0 && <span className="dct-chip xam">{dcTon.cho} lượt tồn đang chờ đối chiếu</span>}
            </div>
            <div className="tbl-wrap" style={{ maxHeight: '44vh', overflow: 'auto' }}>
              <table className="tbl tbl-fit">
                <thead><tr>
                  <th>Lượt tồn</th><th>Kho</th><th className="num">Tồn trước</th><th className="num">Xuất phiếu</th>
                  <th className="num">Nhập phiếu</th><th className="num">Tồn mới</th>
                  <th className="num">Tăng ngoài phiếu</th><th className="num">Giảm ngoài phiếu</th><th className="num">Mã lệch</th>
                </tr></thead>
                <tbody>
                  {luot.length === 0 ? (
                    <tr><td colSpan={9} style={{ textAlign: 'center', padding: 20, color: 'var(--ink-2)' }}>
                      Chưa có lượt đối chiếu — cần 2 lượt tồn liên tiếp (lượt đầu chỉ làm mốc).</td></tr>
                  ) : luot.map((r) => (
                    <tr key={r.moc + r.kho} className={r.ngoai_giam <= -50 ? 'ds-row-lech' : ''}>
                      <td style={{ fontSize: 12 }}>{gio(r.asof_truoc)} → {gio(r.asof_moi)}{r.gio_chuan !== 'odoo' && <i className="dct-gas"> giờ GAS</i>}</td>
                      <td>{r.kho}</td>
                      <td className="num">{fmtSL(r.ton_truoc)}</td>
                      <td className="num">{r.xuat ? '−' + fmtSL(r.xuat) : '—'}</td>
                      <td className="num">{r.nhap ? '+' + fmtSL(r.nhap) : '—'}</td>
                      <td className="num">{fmtSL(r.ton_moi)}</td>
                      <td className="num dct-tang">{r.ngoai_tang ? '+' + fmtSL(r.ngoai_tang) : '—'}</td>
                      <td className="num dct-giam">{r.ngoai_giam ? fmtSL(r.ngoai_giam) : '—'}</td>
                      <td className="num">{r.so_ma_lech || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {ct.length > 0 && (
              <div className="dct-ct">
                <button type="button" className="dct-mo" onClick={() => setMoCt(!moCt)} aria-expanded={moCt}>
                  {moCt ? '▾' : '▸'} Mã lệch ở lượt mới nhất ({ct.length})</button>
                {moCt && (
                  <div className="tbl-wrap" style={{ maxHeight: '40vh', overflow: 'auto' }}>
                    <table className="tbl tbl-fit">
                      <thead><tr><th>Kho</th><th>Mã</th><th className="num">Tồn trước</th><th className="num">Xuất</th>
                        <th className="num">Nhập</th><th className="num">Tồn mới</th><th className="num">Ngoài phiếu</th></tr></thead>
                      <tbody>
                        {ct.map((r) => (
                          <tr key={r.kho + r.barcode}>
                            <td>{r.kho}</td><td>{r.ma || r.barcode}</td>
                            <td className="num">{fmtSL(r.ton_truoc)}</td><td className="num">{r.xuat || '—'}</td>
                            <td className="num">{r.nhap || '—'}</td><td className="num">{fmtSL(r.ton_moi)}</td>
                            <td className={'num ' + (r.ngoai < 0 ? 'dct-giam' : 'dct-tang')}>{r.ngoai > 0 ? '+' : ''}{fmtSL(r.ngoai)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
            {(dcTon.moc_ngay || []).length > 0 && (
              <div className="dct-ghi">Mốc chuẩn của ngày (lượt tồn đầu tiên từ 1 giờ sáng):{' '}
                {dcTon.moc_ngay.map((m) => <span key={m.kho} className="dct-chip xam">{m.kho} {fmtSL(m.tong_ton)} · {gio(m.asof)}</span>)}
              </div>
            )}
          </div>
        );
      })()}

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
