import { useEffect, useMemo, useState } from 'react';
import { sb, fmtVND, LY_DO } from '../lib/supabase.js';
import { IcSpark, IcSearch, IcBox, IcClock, IcAlert } from '../lib/icons.jsx';
import { useApp } from '../App.jsx';

// Màn ĐỀ NGHỊ HÀNG HÓA — cửa hàng chủ động lập phiếu theo lịch cố định.
// Phiếu định kỳ chỉ gửi đúng ngày lịch, trước giờ chốt; ngoài lịch dùng KHẨN CẤP + lý do.
// Gửi cần 2 trưởng ca: người đăng nhập + trưởng ca thứ hai xác nhận bằng mật khẩu.
export default function XinHang() {
  const { user, baoToast } = useApp();
  const [dsCH, setDsCH] = useState([]);
  const [maCH, setMaCH] = useState(user.ma_ch || '');
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [loc, setLoc] = useState('CAN_CAP');
  const [loai, setLoai] = useState('DINH_KY');
  const [lyDoKhan, setLyDoKhan] = useState('');
  const [lich, setLich] = useState(null);          // {den_lich, ky_tiep, gio_chot}
  const [xacNhan, setXacNhan] = useState(null);    // {ma2, mk2} khi mở modal gửi

  useEffect(() => {
    if (user.vai_tro !== 'CH') {
      sb.from('cua_hang').select('ma_ch, ten').like('ma_ch', 'CH%')
        .eq('hoat_dong', true).order('ten').then(({ data }) => setDsCH(data || []));
    }
  }, []);

  // Lịch của cửa hàng đang chọn
  useEffect(() => {
    if (!maCH) { setLich(null); return; }
    (async () => {
      const homNay = new Date().toISOString().slice(0, 10);
      const [{ data: hn }, { data: kt }, { data: ts }] = await Promise.all([
        sb.rpc('fn_den_lich', { p_ma_ch: maCH, p_ngay: homNay }),
        sb.rpc('fn_ky_tiep', { p_ma_ch: maCH, p_tu: homNay }),
        sb.from('tham_so').select('gia_tri').eq('key', 'gio_chot_de_nghi').eq('pham_vi', 'GLOBAL').single(),
      ]);
      const gioChot = (typeof ts?.gia_tri === 'string' ? ts.gia_tri : '15:30');
      setLich({ den_lich: !!hn, ky_tiep: kt, gio_chot: gioChot });
      setLoai(hn ? 'DINH_KY' : 'KHAN_CAP');
    })();
  }, [maCH]);

  const treGio = lich && lich.den_lich &&
    new Date().toTimeString().slice(0, 5) > lich.gio_chot;

  const goiY = async () => {
    if (!maCH) { baoToast('Chọn cửa hàng trước'); return; }
    setBusy(true); setRows(null);
    const { data, error } = await sb.rpc('fn_goi_y_chia_hang', { p_ma_ch: maCH });
    setBusy(false);
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    setRows((data || []).map((r) => ({ ...r, sl_xin: r.sl_ai })));
  };

  const hien = useMemo(() => {
    if (!rows) return [];
    let v = rows;
    if (loc === 'CAN_CAP') v = v.filter((r) => r.sl_ai > 0 || r.sl_xin > 0);
    if (loc === 'SALE') v = v.filter((r) => r.la_hang_sale);
    if (loc === 'CHINH') v = v.filter((r) => !r.la_hang_sale);
    if (loc === 'KHO_SAN') v = v.filter((r) => (r.ly_do?.codes || []).includes('KHO_DANG_SAN'));
    if (q) {
      const k = q.toUpperCase();
      v = v.filter((r) => [r.barcode, r.sku, r.ma_tham_chieu].some((x) => (x || '').toUpperCase().includes(k)));
    }
    return v;
  }, [rows, q, loc]);

  const tongXin = useMemo(() => (rows || []).reduce((s, r) => s + (r.sl_xin || 0), 0), [rows]);

  // Bán nhanh sắp hết nhưng bị bỏ khỏi phiếu -> trách nhiệm trưởng ca (mục VII.2 kế hoạch)
  const boSot = useMemo(() => (rows || []).filter((r) =>
    r.sl_ai > 0 && (r.sl_xin || 0) === 0 && r.toc_do >= 0.5 && r.ton_truoc <= 2), [rows]);

  const sua = (barcode, val) => setRows((rs) => rs.map((r) =>
    r.barcode === barcode ? { ...r, sl_xin: Math.max(0, parseInt(val) || 0) } : r));

  const guiThat = async () => {
    const lines = rows.filter((r) => r.sl_xin > 0).map((r) => ({
      barcode: r.barcode, ton_truoc: r.ton_truoc, dang_di_duong: r.dang_di_duong,
      ton_du_tinh: r.ton_du_tinh, sl_ban_ky: r.sl_ban_ky, so_ngay_ban: r.so_ngay_ban,
      toc_do: r.toc_do, sl_ai: r.sl_ai, sl_xin: r.sl_xin, ly_do_ai: r.ly_do, canh_bao: r.canh_bao,
    }));
    setBusy(true);
    const { data, error } = await sb.rpc('fn_gui_don', {
      p_token: user.token, p_ma_ch: maCH, p_loai: loai, p_lines: lines,
      p_ma2: xacNhan.ma2, p_mk2: xacNhan.mk2,
      p_ly_do_khan: loai === 'KHAN_CAP' ? lyDoKhan : null,
    });
    setBusy(false);
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    baoToast(`Đã gửi Phiếu đề nghị #${data} — ${lines.length} mã hàng, 2 trưởng ca đã xác nhận`);
    setRows(null); setXacNhan(null); setLyDoKhan('');
  };

  const moXacNhan = () => {
    if (loai === 'KHAN_CAP' && !lyDoKhan.trim()) {
      baoToast('Phiếu khẩn cấp bắt buộc ghi rõ lý do'); return;
    }
    if (!rows.some((r) => r.sl_xin > 0)) { baoToast('Chưa có dòng nào có số lượng'); return; }
    setXacNhan({ ma2: '', mk2: '' });
  };

  const thu = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  const kyTiepTxt = lich?.ky_tiep
    ? `${thu[new Date(lich.ky_tiep + 'T00:00').getDay()]} ${new Date(lich.ky_tiep + 'T00:00').toLocaleDateString('vi-VN')}`
    : null;

  return (
    <>
      <div className="cmdbar">
        <h1>Đề nghị hàng hóa</h1>
        <div className="sub">Cửa hàng chủ động lập phiếu theo lịch — gửi trước {lich?.gio_chot || '15:30'}, hai trưởng ca cùng xác nhận.</div>
        <div className="row">
          {user.vai_tro !== 'CH' && (
            <select value={maCH} onChange={(e) => { setMaCH(e.target.value); setRows(null); }}
              style={{ padding: '9px 12px', borderRadius: 10, border: 0 }}>
              <option value="">Chọn cửa hàng…</option>
              {dsCH.map((c) => <option key={c.ma_ch} value={c.ma_ch}>{c.ten} ({c.ma_ch})</option>)}
            </select>
          )}
          {lich && (
            <span className="sla-chip" style={!lich.den_lich ? { background: 'rgba(203,164,90,.4)' } : undefined}>
              <IcClock /> {lich.den_lich
                ? (treGio ? `Đến lịch hôm nay — ĐÃ QUA ${lich.gio_chot}` : `Đến lịch hôm nay — hạn ${lich.gio_chot}`)
                : (kyTiepTxt ? `Kỳ tới: ${kyTiepTxt}` : 'Chưa được phân lịch')}
            </span>
          )}
          <select value={loai} onChange={(e) => setLoai(e.target.value)}
            style={{ padding: '9px 12px', borderRadius: 10, border: 0 }}>
            <option value="DINH_KY" disabled={lich && !lich.den_lich}>Định kỳ (đúng lịch)</option>
            <option value="KHAN_CAP">Khẩn cấp</option>
          </select>
          <button className="btn btn-ai" onClick={goiY} disabled={busy || !maCH}>
            <IcSpark /> {busy ? 'Đang tính toán…' : 'AI gợi ý đề nghị'}
          </button>
          {rows && <span className="sla-chip">{tongXin} sp · {rows.filter((r) => r.sl_xin > 0).length} mã</span>}
        </div>
        {loai === 'KHAN_CAP' && (
          <div className="row">
            <input value={lyDoKhan} onChange={(e) => setLyDoKhan(e.target.value)}
              placeholder="Lý do khẩn cấp (bắt buộc): bán đột biến / sắp hết mã chạy / chương trình…"
              style={{ padding: '9px 12px', borderRadius: 10, border: 0, flex: 1, minWidth: 260 }} />
          </div>
        )}
      </div>

      {rows && boSot.length > 0 && (
        <div className="card" style={{ marginBottom: 12, borderLeft: '4px solid var(--magenta)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--magenta)', fontWeight: 700, fontSize: 13.5 }}>
            <IcAlert /> {boSot.length} mã bán nhanh sắp hết đang bị bỏ khỏi phiếu
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-2)', margin: '4px 0 6px' }}>
            Trưởng ca chịu trách nhiệm nếu để hàng bán chạy bị thiếu. Kiểm tra lại trước khi gửi:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {boSot.slice(0, 10).map((r) => (
              <span key={r.barcode} className="chip warn">{r.ma_tham_chieu || r.barcode} · tồn {r.ton_truoc} · AI {r.sl_ai}</span>
            ))}
          </div>
        </div>
      )}

      {rows && (
        <>
          <div className="toolbar">
            <div style={{ position: 'relative' }}>
              <input type="search" placeholder="Tìm barcode / SKU / mã cũ" value={q}
                onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 34, width: 240 }} />
              <span style={{ position: 'absolute', left: 10, top: 10, color: 'var(--ink-2)' }}><IcSearch /></span>
            </div>
            <select value={loc} onChange={(e) => setLoc(e.target.value)}>
              <option value="CAN_CAP">Cần bổ sung ({rows.filter((r) => r.sl_ai > 0).length})</option>
              <option value="TAT_CA">Tất cả ({rows.length})</option>
              <option value="KHO_SAN">Kho tổng đang sẵn</option>
              <option value="CHINH">Hàng chính</option>
              <option value="SALE">Hàng sale</option>
            </select>
            <button className="btn btn-primary" style={{ marginLeft: 'auto' }}
              onClick={moXacNhan} disabled={busy || tongXin === 0}>Gửi Phiếu đề nghị</button>
          </div>

          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr>
                <th>Sản phẩm</th><th>Ngành</th><th>Giá</th>
                <th className="num">Tồn</th><th className="num">Đi đường</th>
                <th className="num">Bán/kỳ</th><th className="num">Tốc độ</th>
                <th className="num">Tuần tồn</th>
                <th className="num">AI đề xuất</th><th className="num">SL đề nghị</th>
                <th>Lý do</th>
              </tr></thead>
              <tbody>
                {hien.map((r) => {
                  const vuot = r.ton_du_tinh + r.sl_xin > r.muc_max;
                  return (
                    <tr key={r.barcode}>
                      <td>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          {r.hinh_url
                            ? <img className="sp" src={r.hinh_url} alt="" loading="lazy" />
                            : <div className="noimg"><IcBox /></div>}
                          <div>
                            <div className="mono" style={{ fontWeight: 600 }}>{r.ma_tham_chieu || r.sku}</div>
                            <div className="mono" style={{ color: 'var(--ink-2)', fontSize: 11 }}>{r.barcode}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ fontSize: 12 }}>{r.nganh_3 || r.nganh_1}</td>
                      <td>
                        {r.la_hang_sale
                          ? <><span className="price-sale">{fmtVND(r.gia_sale)}</span>
                              <span className="price-old">{fmtVND(r.gia_niem_yet)}</span></>
                          : <span style={{ fontWeight: 600 }}>{fmtVND(r.gia_niem_yet)}</span>}
                      </td>
                      <td className="num">{r.ton_truoc}</td>
                      <td className="num">{r.dang_di_duong > 0 ? r.dang_di_duong : '—'}</td>
                      <td className="num">{r.sl_ban_ky}<span style={{ color: 'var(--ink-2)' }}>/{r.so_ngay_ban}d</span></td>
                      <td className="num">{r.toc_do}</td>
                      <td className="num" style={r.so_tuan_ton != null && r.so_tuan_ton < 1
                        ? { color: 'var(--magenta)', fontWeight: 700 } : undefined}>
                        {r.so_tuan_ton != null ? r.so_tuan_ton : '—'}</td>
                      <td className="num" style={{ fontWeight: 700, color: 'var(--teal-deep)' }}>{r.sl_ai}</td>
                      <td className="num">
                        <input className={'qty-input' + (vuot ? ' over' : '')} type="number" min="0"
                          value={r.sl_xin} onChange={(e) => sua(r.barcode, e.target.value)} />
                      </td>
                      <td style={{ maxWidth: 230 }}>
                        {(r.ly_do?.codes || []).map((c) => (
                          <span key={c} className={'chip' + (c === 'VUOT_MAX_DA_CAT' ? ' warn'
                            : c === 'HANG_MOI_THEO_NHOM' ? ' gold'
                            : c === 'KHO_DANG_SAN' ? ' teal'
                            : c === 'DU_TON_KHONG_CAP' ? ' dim' : '')}>{LY_DO[c] || c}</span>
                        ))}
                        {vuot && <span className="chip warn">Vượt max ngành ({r.muc_max})</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!hien.length && <div className="empty">
              <div className="t">Không có mã nào theo bộ lọc</div>
              Đổi bộ lọc sang "Tất cả" để xem toàn bộ tồn kho.
            </div>}
          </div>
        </>
      )}

      {!rows && !busy && (
        <div className="empty card">
          <div className="t">Bấm "AI gợi ý đề nghị" để bắt đầu</div>
          Hệ thống phân tích từ kỳ đề nghị gần nhất đến hôm qua: bán ròng, tồn thực tế,
          hàng đi đường, định mức min–max, kỳ đề nghị kế tiếp theo lịch — và đề xuất
          số lượng kèm lý do từng dòng.
        </div>
      )}

      {xacNhan && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,33,58,.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}
          onClick={() => setXacNhan(null)}>
          <div className="card" style={{ maxWidth: 400, width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, marginBottom: 4 }}>Xác nhận của trưởng ca thứ hai</h3>
            <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 14 }}>
              Phiếu đề nghị cần sự đồng thuận của HAI trưởng ca. Trưởng ca còn lại nhập mã
              và mật khẩu để xác nhận — cả hai cùng chịu trách nhiệm về phiếu này
              ({tongXin} sản phẩm, {rows.filter((r) => r.sl_xin > 0).length} mã).
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input className="qty-input mono" style={{ width: '100%', textAlign: 'left' }}
                placeholder="Mã trưởng ca thứ hai" value={xacNhan.ma2} autoCapitalize="characters"
                onChange={(e) => setXacNhan((x) => ({ ...x, ma2: e.target.value.toUpperCase() }))} />
              <input className="qty-input" style={{ width: '100%', textAlign: 'left' }} type="password"
                placeholder="Mật khẩu trưởng ca thứ hai" value={xacNhan.mk2}
                onChange={(e) => setXacNhan((x) => ({ ...x, mk2: e.target.value }))} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setXacNhan(null)}>Hủy</button>
                <button className="btn btn-primary" style={{ flex: 2 }} disabled={busy || !xacNhan.ma2 || !xacNhan.mk2}
                  onClick={guiThat}>{busy ? 'Đang gửi…' : 'Xác nhận & gửi phiếu'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
