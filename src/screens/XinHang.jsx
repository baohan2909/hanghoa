import { useEffect, useMemo, useRef, useState } from 'react';
import { sb, fmtVND, LY_DO } from '../lib/supabase.js';
import { IcSpark, IcSearch, IcBox, IcClock, IcAlert, IcDown, IcCheck } from '../lib/icons.jsx';
import { useApp } from '../App.jsx';

// ===== Màn ĐỀ NGHỊ HÀNG HÓA (10 mục hoàn thiện) =====
// 4 nhóm: BH-chính / BH-sale / NV-chính / NV-sale (mục 4), mỗi nhóm 1 kho tổng (mục 5).
// Auto-save nháp vào localStorage theo cửa hàng (mục 6). Xuất 1 nhóm hoặc cả 4 file (mục 7).

const NHOM = [
  { id: 'BH_C', ten: 'Bảo hiểm — chính', nhom: 'BH', sale: false },
  { id: 'BH_S', ten: 'Bảo hiểm — sale',  nhom: 'BH', sale: true  },
  { id: 'NV_C', ten: 'Nón vải — chính',  nhom: 'NV', sale: false },
  { id: 'NV_S', ten: 'Nón vải — sale',   nhom: 'NV', sale: true  },
];
const nhomCua = (r) => (r.nhom_hang === 'BH' ? 'BH' : 'NV') + '_' + (r.la_hang_sale ? 'S' : 'C');
const KEY = (ma) => 'nsflow_draft_' + ma;

// Ô chọn cửa hàng: gõ trực tiếp để lọc, danh sách xổ ngay dưới (mục 1)
function ChonCH({ ds, value, onChange }) {
  const [mo, setMo] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setMo(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  const chon = ds.find((c) => c.ma_ch === value);
  // Khi chưa mở: hiện tên CH đã chọn. Khi mở: gõ để lọc.
  const text = mo ? q : (chon ? `${chon.ten} (${chon.ma_ch})` : '');
  const loc = (mo && q)
    ? ds.filter((c) => (c.ten + ' ' + c.ma_ch).toLowerCase().includes(q.toLowerCase())).slice(0, 50)
    : ds.slice(0, 50);
  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 280 }}>
      <div style={{ position: 'relative' }}>
        <IcSearch style={{ position: 'absolute', left: 12, top: 11, opacity: .45, pointerEvents: 'none' }} />
        <input className="ch-input" placeholder="Gõ tên hoặc mã cửa hàng…"
          value={text}
          onFocus={() => { setMo(true); setQ(''); }}
          onChange={(e) => { setMo(true); setQ(e.target.value); }} />
      </div>
      {mo && (
        <div className="ch-pop">
          <div className="ch-list">
            {loc.map((c) => (
              <button key={c.ma_ch} className={'ch-item' + (c.ma_ch === value ? ' on' : '')}
                onMouseDown={() => { onChange(c.ma_ch); setMo(false); setQ(''); }}>
                <div style={{ fontWeight: 600 }}>{c.ten}</div>
                <div className="mono" style={{ fontSize: 11, color: 'var(--ink-2)' }}>{c.ma_ch}</div>
              </button>
            ))}
            {!loc.length && <div style={{ padding: 14, color: 'var(--ink-2)', fontSize: 13 }}>Không tìm thấy cửa hàng</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function XinHang() {
  const { user, baoToast } = useApp();
  const [dsCH, setDsCH] = useState([]);
  const [maCH, setMaCH] = useState(user.ma_ch || '');
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [nhomXem, setNhomXem] = useState('BH_C');   // tab nhóm hiện tại | 'ALL'
  const [loai, setLoai] = useState('DINH_KY');
  const [lyDoKhan, setLyDoKhan] = useState('');
  const [lich, setLich] = useState(null);
  const [tuNgay, setTuNgay] = useState('');          // mốc thời gian (mục 9)
  const [xacNhan, setXacNhan] = useState(null);
  const luuTimer = useRef(null);

  useEffect(() => {
    if (user.vai_tro !== 'CH') {
      sb.from('cua_hang').select('ma_ch, ten').like('ma_ch', 'CH%')
        .eq('hoat_dong', true).order('ten').then(({ data }) => setDsCH(data || []));
    }
  }, []);

  // Lịch + khôi phục nháp auto-save khi đổi cửa hàng (mục 6)
  useEffect(() => {
    if (!maCH) { setLich(null); setRows(null); return; }
    (async () => {
      const homNay = new Date().toISOString().slice(0, 10);
      const [{ data: hn }, { data: kt }, { data: ts }] = await Promise.all([
        sb.rpc('fn_den_lich', { p_ma_ch: maCH, p_ngay: homNay }),
        sb.rpc('fn_ky_tiep', { p_ma_ch: maCH, p_tu: homNay }),
        sb.from('tham_so').select('gia_tri').eq('key', 'gio_chot_de_nghi').eq('pham_vi', 'GLOBAL').single(),
      ]);
      setLich({ den_lich: !!hn, ky_tiep: kt, gio_chot: (typeof ts?.gia_tri === 'string' ? ts.gia_tri : '15:30') });
      setLoai(hn ? 'DINH_KY' : 'KHAN_CAP');
      // khôi phục nháp
      try {
        const raw = localStorage.getItem(KEY(maCH));
        if (raw) { const d = JSON.parse(raw); setRows(d.rows); setTuNgay(d.tuNgay || ''); baoToast('Đã khôi phục bản nháp đang làm dở'); }
        else setRows(null);
      } catch { setRows(null); }
    })();
  }, [maCH]);

  // Auto-save mỗi khi rows đổi (mục 6) — chống mất khi lỡ tắt
  useEffect(() => {
    if (!maCH || !rows) return;
    clearTimeout(luuTimer.current);
    luuTimer.current = setTimeout(() => {
      try { localStorage.setItem(KEY(maCH), JSON.stringify({ rows, tuNgay, luc: Date.now() })); } catch {}
    }, 600);
  }, [rows, tuNgay, maCH]);

  const treGio = lich && lich.den_lich && new Date().toTimeString().slice(0, 5) > lich.gio_chot;

  const goiY = async () => {
    if (!maCH) { baoToast('Chọn cửa hàng trước'); return; }
    setBusy(true);
    const args = { p_ma_ch: maCH };
    if (tuNgay) args.p_tu_ngay = tuNgay;
    const { data, error } = await sb.rpc('fn_goi_y_chia_hang', args);
    setBusy(false);
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    setRows((data || []).map((r) => ({ ...r, sl_xin: r.sl_ai })));
  };

  // Số lượng theo từng nhóm để hiện badge trên tab
  const demNhom = useMemo(() => {
    const d = { BH_C: 0, BH_S: 0, NV_C: 0, NV_S: 0 };
    (rows || []).forEach((r) => { if (r.sl_xin > 0) d[nhomCua(r)] += r.sl_xin; });
    return d;
  }, [rows]);

  const hien = useMemo(() => {
    if (!rows) return [];
    let v = nhomXem === 'ALL' ? rows : rows.filter((r) => nhomCua(r) === nhomXem);
    if (q) {
      const k = q.toUpperCase();
      v = v.filter((r) => [r.barcode, r.sku, r.ma_tham_chieu].some((x) => (x || '').toUpperCase().includes(k)));
    }
    return v;
  }, [rows, nhomXem, q]);

  const tongXin = useMemo(() => (rows || []).reduce((s, r) => s + (r.sl_xin || 0), 0), [rows]);
  const boSot = useMemo(() => (rows || []).filter((r) =>
    r.sl_ai > 0 && (r.sl_xin || 0) === 0 && r.toc_do >= 0.5 && r.ton_truoc <= 2), [rows]);

  const sua = (barcode, val) => setRows((rs) => rs.map((r) =>
    r.barcode === barcode ? { ...r, sl_xin: Math.max(0, parseInt(val) || 0) } : r));

  // Xuất Excel 1 nhóm (mục 7)
  const xuatNhom = async (nhomId) => {
    const XLSX = await import('xlsx');
    const info = NHOM.find((n) => n.id === nhomId);
    const dsN = rows.filter((r) => nhomCua(r) === nhomId && r.sl_xin > 0);
    if (!dsN.length) { baoToast(`Nhóm ${info.ten} chưa có dòng nào`); return; }
    const khoMa = dsN[0].kho_ma || nhomId;
    const rowsX = dsN.map((r) => ({
      'Mã kho': khoMa, 'Barcode': r.barcode, 'Mã tham chiếu': r.ma_tham_chieu || '',
      'Sản phẩm': r.nganh_3 || '', 'Số lượng': r.sl_xin,
    }));
    const ws = XLSX.utils.json_to_sheet(rowsX);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, khoMa);
    XLSX.writeFile(wb, `DENGHI_${maCH}_${khoMa}.xlsx`);
    baoToast(`Đã xuất ${dsN.length} dòng — kho ${khoMa}`);
  };
  const xuatTatCa = async () => {
    const conNhom = NHOM.filter((n) => demNhom[n.id] > 0);
    if (!conNhom.length) { baoToast('Chưa có số lượng nào để xuất'); return; }
    for (const n of conNhom) await xuatNhom(n.id);
  };

  const guiThat = async () => {
    const lines = rows.filter((r) => r.sl_xin > 0).map((r) => ({
      barcode: r.barcode, ton_truoc: r.ton_truoc, dang_di_duong: 0,
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
    baoToast(`Đã gửi Phiếu đề nghị #${data} — ${lines.length} mã, 2 trưởng ca xác nhận`);
    localStorage.removeItem(KEY(maCH));   // xong thì xóa nháp
    setRows(null); setXacNhan(null); setLyDoKhan('');
  };

  const moXacNhan = () => {
    if (loai === 'KHAN_CAP' && !lyDoKhan.trim()) { baoToast('Phiếu khẩn cấp bắt buộc ghi lý do'); return; }
    if (!rows.some((r) => r.sl_xin > 0)) { baoToast('Chưa có dòng nào có số lượng'); return; }
    setXacNhan({ ma2: '', mk2: '' });
  };

  const thu = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  const kyTiepTxt = lich?.ky_tiep
    ? `${thu[new Date(lich.ky_tiep + 'T00:00').getDay()]} ${new Date(lich.ky_tiep + 'T00:00').toLocaleDateString('vi-VN')}` : null;

  return (
    <>
      <div className="cmdbar">
        <h1>Đề nghị hàng hóa</h1>
        <div className="sub">Cửa hàng chủ động lập phiếu theo lịch — gửi trước {lich?.gio_chot || '15:30'}, hai trưởng ca cùng xác nhận.</div>
        <div className="row">
          {user.vai_tro !== 'CH'
            ? <ChonCH ds={dsCH} value={maCH} onChange={(v) => setMaCH(v)} />
            : null}
          {lich && (
            <span className="sla-chip" style={!lich.den_lich ? { background: 'rgba(203,164,90,.4)' } : undefined}>
              <IcClock /> {lich.den_lich
                ? (treGio ? `Đến lịch — ĐÃ QUA ${lich.gio_chot}` : `Đến lịch hôm nay — hạn ${lich.gio_chot}`)
                : (kyTiepTxt ? `Kỳ tới: ${kyTiepTxt}` : 'Chưa được phân lịch')}
            </span>
          )}
          <select value={loai} onChange={(e) => setLoai(e.target.value)}
            style={{ padding: '9px 12px', borderRadius: 10, border: 0 }}>
            <option value="DINH_KY" disabled={lich && !lich.den_lich}>Định kỳ (đúng lịch)</option>
            <option value="KHAN_CAP">Khẩn cấp</option>
          </select>
          <label className="date-inline" title="Tính từ ngày (bỏ trống = từ kỳ đề nghị gần nhất)">
            <span>Từ</span>
            <input type="date" value={tuNgay} onChange={(e) => setTuNgay(e.target.value)} />
          </label>
          <button className="btn btn-ai" onClick={goiY} disabled={busy || !maCH}>
            <IcSpark /> {busy ? 'Đang tính…' : 'AI gợi ý đề nghị'}
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
            Trưởng ca chịu trách nhiệm nếu để hàng bán chạy bị thiếu. Kiểm tra lại trước khi gửi.
          </div>
        </div>
      )}

      {rows && (
        <>
          {/* Tab 4 nhóm + Tất cả (mục 4,6) */}
          <div className="nhom-tabs">
            {NHOM.map((n) => (
              <button key={n.id} className={'nhom-tab' + (nhomXem === n.id ? ' on' : '')}
                onClick={() => setNhomXem(n.id)}>
                {n.ten}
                {demNhom[n.id] > 0 && <span className="nhom-badge">{demNhom[n.id]}</span>}
              </button>
            ))}
            <button className={'nhom-tab' + (nhomXem === 'ALL' ? ' on' : '')} onClick={() => setNhomXem('ALL')}>
              Xem tất cả
            </button>
          </div>

          <div className="toolbar">
            <div style={{ position: 'relative' }}>
              <input type="search" placeholder="Tìm barcode / SKU / mã cũ" value={q}
                onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 34, width: 240 }} />
              <span style={{ position: 'absolute', left: 10, top: 10, color: 'var(--ink-2)' }}><IcSearch /></span>
            </div>
            <span className="chip dim">Tự động lưu nháp</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              {nhomXem !== 'ALL' &&
                <button className="btn btn-ghost" onClick={() => xuatNhom(nhomXem)}><IcDown /> Xuất nhóm này</button>}
              <button className="btn btn-gold" onClick={xuatTatCa}><IcDown /> Xuất tất cả (4 file)</button>
              <button className="btn btn-primary" onClick={moXacNhan} disabled={busy || tongXin === 0}>
                Gửi Phiếu đề nghị</button>
            </div>
          </div>

          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr>
                <th>Sản phẩm</th><th>Giá</th>
                <th className="num">Tồn CH</th>
                <th className="num">Kho tổng</th>
                <th className="num">Tốc độ</th>
                <th className="num">Chu kỳ bán</th>
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
                            <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>{r.nganh_3}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        {r.la_hang_sale
                          ? <><span className="price-sale">{fmtVND(r.gia_sale)}</span>
                              <span className="price-old">{fmtVND(r.gia_niem_yet)}</span></>
                          : <span style={{ fontWeight: 600 }}>{fmtVND(r.gia_niem_yet)}</span>}
                      </td>
                      <td className="num">{r.ton_truoc}</td>
                      <td className="num" style={r.kho_tong <= 0
                        ? { color: 'var(--magenta)', fontWeight: 700 }
                        : { color: 'var(--teal-deep)', fontWeight: 600 }}>{r.kho_tong}</td>
                      <td className="num">{r.toc_do}</td>
                      <td className="num">{r.chu_ky_ban != null ? r.chu_ky_ban + 'd' : '—'}</td>
                      <td className="num" style={{ fontWeight: 700, color: 'var(--teal-deep)' }}>{r.sl_ai}</td>
                      <td className="num">
                        <input className={'qty-input' + (vuot ? ' over' : '')} type="number" min="0"
                          value={r.sl_xin} onChange={(e) => sua(r.barcode, e.target.value)} />
                      </td>
                      <td style={{ maxWidth: 220 }}>
                        {(r.ly_do?.codes || []).slice(0, 2).map((c) => (
                          <span key={c} className={'chip' + (c === 'VUOT_MAX_DA_CAT' || c === 'KHO_TONG_HET' ? ' warn'
                            : c === 'HANG_MOI_THEO_NHOM' ? ' gold'
                            : c === 'DU_TON_KHONG_CAP' ? ' dim' : '')}>{LY_DO[c] || c}</span>
                        ))}
                        {vuot && <span className="chip warn">Vượt max ({r.muc_max})</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!hien.length && <div className="empty">
              <div className="t">Nhóm này chưa có mã nào</div>
              Chuyển tab nhóm khác hoặc "Xem tất cả".
            </div>}
          </div>
        </>
      )}

      {!rows && !busy && (
        <div className="empty card">
          <div className="t">Bấm "AI gợi ý đề nghị" để bắt đầu</div>
          Hệ thống phân tích bán ròng, tồn cửa hàng, tồn kho tổng, định mức và kỳ đề nghị kế tiếp,
          rồi đề xuất số lượng kèm lý do — chia sẵn 4 nhóm bảo hiểm/nón vải, chính/sale.
        </div>
      )}

      {xacNhan && (
        <div className="modal-bg" onClick={() => setXacNhan(null)}>
          <div className="card" style={{ maxWidth: 400, width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, marginBottom: 4 }}>Xác nhận của trưởng ca thứ hai</h3>
            <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 14 }}>
              Phiếu cần đồng thuận của HAI trưởng ca. Người còn lại nhập mã và mật khẩu để xác nhận
              — cả hai cùng chịu trách nhiệm ({tongXin} sp, {rows?.filter((r) => r.sl_xin > 0).length} mã).
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
                  onClick={guiThat}><IcCheck /> {busy ? 'Đang gửi…' : 'Xác nhận & gửi'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
