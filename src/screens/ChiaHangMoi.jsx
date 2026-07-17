import { useEffect, useRef, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { IcSplit, IcDown, IcSearch } from '../lib/icons.jsx';
import { useApp } from '../App.jsx';

// ===== CHIA HÀNG MỚI v2 — nhiều mã một lần · ngành cấp 3 HOẶC mã tham chiếu · xuất tất cả =====
function AnhMini({ url }) {
  const [loi, setLoi] = useState(false);
  if (!url || loi) return <div className="noimg" />;
  return <img src={url} alt="" onError={() => setLoi(true)} />;
}
let seq = 1;
const dongMoi = () => ({ id: seq++, q: '', goiY: [], sp: null, nganh3: '',
  qTC: '', goiYTC: [], thamChieu: null, tong: '', ct: null, batchId: null, moRong: true });

export default function ChiaHangMoi() {
  const { user, baoToast } = useApp();
  const [dsNganh3, setDsNganh3] = useState([]);
  const [dong, setDong] = useState([dongMoi()]);
  const [busy, setBusy] = useState(false);
  const [khoMap, setKhoMap] = useState({});
  const timRef = useRef({});

  const [tenCH, setTenCH] = useState({});
  useEffect(() => {
    sb.from('cua_hang').select('ma_ch, ten')
      .then(({ data }) => setTenCH(Object.fromEntries((data || []).map((c) => [c.ma_ch, c.ten]))));
    sb.from('san_pham').select('nganh_3').not('nganh_3', 'is', null)
      .then(({ data }) => setDsNganh3([...new Set((data || []).map((x) => x.nganh_3))].sort()));
    sb.from('tham_so').select('gia_tri').eq('key', 'kho_tong_ma').eq('pham_vi', 'GLOBAL').single()
      .then(({ data }) => setKhoMap(data?.gia_tri || {}));
  }, []);

  const capNhat = (id, patch) => setDong((ds) => ds.map((d) => d.id === id ? { ...d, ...patch } : d));

  const goTim = (id, field, v) => {
    capNhat(id, field === 'sp' ? { q: v, sp: null } : { qTC: v, thamChieu: null });
    const key = id + field;
    clearTimeout(timRef.current[key]);
    if (v.trim().length < 1) { capNhat(id, field === 'sp' ? { goiY: [] } : { goiYTC: [] }); return; }
    timRef.current[key] = setTimeout(async () => {
      const { data, error } = await sb.rpc('fn_tim_sp', { p_q: v.trim() });
      if (error) { baoToast('Lỗi tìm kiếm: ' + error.message); return; }
      capNhat(id, field === 'sp' ? { goiY: data || [] } : { goiYTC: data || [] });
    }, 300);
  };
  const chonSP = (id, g) => capNhat(id, { sp: g, q: g.ma_tham_chieu || g.sku || g.barcode, goiY: [], nganh3: g.nganh_3 || '' });
  const chonTC = (id, g) => capNhat(id, { thamChieu: g, qTC: g.ma_tham_chieu || g.sku || g.barcode, goiYTC: [] });

  const chiaDong = async (d) => {
    if (!d.sp || !d.tong || (!d.nganh3 && !d.thamChieu)) {
      baoToast('Dòng thiếu: sản phẩm, tổng SL và (ngành cấp 3 hoặc mã tham chiếu)'); return false;
    }
    const { data: id, error } = await sb.rpc('fn_chia_hang_moi_v2', {
      p_barcode: d.sp.barcode, p_nganh3: d.nganh3 || null, p_tong: parseInt(d.tong),
      p_nguoi: user.ma_dang_nhap, p_tham_chieu: d.thamChieu?.barcode || null,
      p_tham_chieu_ma: d.thamChieu?.ma_tham_chieu || null });
    if (error) { baoToast('Lỗi: ' + error.message); return false; }
    const { data, error: e2 } = await sb.from('chia_hang_moi_ct')
      .select('*').eq('batch_id', id).order('sl_de_xuat', { ascending: false });
    if (e2) { baoToast('Lỗi đọc kết quả: ' + e2.message); return false; }
    if (!data || !data.length) {
      baoToast(d.thamChieu ? 'Mã tham chiếu chưa có bán 60 ngày — thử mã khác' : 'Ngành này chưa có bán 60 ngày — hãy chọn MÃ THAM CHIẾU tương tự để chia');
    }
    capNhat(d.id, { ct: data || [], batchId: id });
    return true;
  };

  const chiaTatCa = async () => {
    setBusy(true);
    for (const d of dong) if (!d.ct) await chiaDong(d);
    setBusy(false);
  };

  const suaChot = (id, idRow, v) => setDong((ds) => ds.map((d) => d.id !== id ? d : {
    ...d, ct: d.ct.map((r) => r.id === idRow ? { ...r, sl_chot: Math.max(0, parseInt(v) || 0) } : r) }));

  const khoNguon = (sp) => {
    const bh = (sp?.nganh_1 || '').includes('bảo hiểm') || (sp?.nganh_1 || '').includes('Mũ');
    return bh ? (khoMap.BH_CHINH || '') : (khoMap.NV_CHINH || '');
  };

  const xuatTatCa = async () => {
    const daChia = dong.filter((d) => d.ct && d.batchId);
    if (!daChia.length) { baoToast('Chưa có dòng nào được chia'); return; }
    for (const d of daChia) {
      await Promise.all(d.ct.map((r) => sb.from('chia_hang_moi_ct').update({ sl_chot: r.sl_chot }).eq('id', r.id)));
      await sb.from('chia_hang_moi').update({ trang_thai: 'CHOT' }).eq('id', d.batchId);
    }
    const rowsX = [];
    daChia.forEach((d) => d.ct.filter((r) => r.sl_chot > 0).forEach((r) => rowsX.push({
      'Kho nguồn': khoNguon(d.sp),
      'Kho đích': r.ma_ch,
      'SKU/ Barcode': d.sp.sku || d.sp.barcode,
      'Số lượng': r.sl_chot,
    })));
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(rowsX);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Trang tính1');
    XLSX.writeFile(wb, `CHIAMOI_${new Date().toISOString().slice(0, 10)}.xlsx`);
    baoToast(`Đã chốt & xuất ${rowsX.length} dòng điều chuyển`);
  };

  const tongTatCa = dong.reduce((s, d) => s + (d.ct || []).reduce((x, r) => x + (r.sl_chot || 0), 0), 0);

  return (
    <div>
      <div className="cmdbar">
        <div className="cmd-title">
          <h2><IcSplit style={{ verticalAlign: -3, marginRight: 8 }} />Chia hàng mới</h2>
          <p>Thêm nhiều mã một lần — chia theo tỷ trọng bán ngành cấp 3, hoặc theo mã tham chiếu tương tự. Chỉnh tay được sau khi chia.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-ai" disabled={busy} onClick={chiaTatCa}>
            {busy ? 'Đang chia…' : '✦ Chia tự động tất cả'}
          </button>
          <button className="btn btn-gold" onClick={xuatTatCa}>
            <IcDown style={{ verticalAlign: -3 }} /> Xuất tất cả{tongTatCa > 0 ? ` (${tongTatCa} sp)` : ''}
          </button>
        </div>
      </div>

      {dong.map((d, i) => (
        <div key={d.id} className="card" style={{ marginTop: 12, padding: 14 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ position: 'relative', flex: '1 1 240px' }}>
              <div className="lbl">Mã hàng mới #{i + 1}</div>
              <div style={{ position: 'relative' }}>
                <IcSearch style={{ position: 'absolute', left: 11, top: 12, width: 16, height: 16, color: 'var(--ink-2)', pointerEvents: 'none' }} />
                <input className="inp" style={{ paddingLeft: 32, width: '100%' }}
                  placeholder="Barcode, SKU, mã" value={d.q} onChange={(e) => goTim(d.id, 'sp', e.target.value)} />
              </div>
              {d.goiY.length > 0 && (
                <div className="goiy-pop">
                  {d.goiY.map((g) => (
                    <div key={g.barcode} className="goiy-item" style={{ cursor: 'pointer' }} onClick={() => chonSP(d.id, g)}>
                      <AnhMini url={g.hinh_url} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="mono" style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--teal-deep)' }}>{g.ma_tham_chieu || g.sku}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>{g.nganh_3} · kho {g.kho_tong}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ flex: '1 1 200px' }}>
              <div className="lbl">Ngành cấp 3 (tự nhận)</div>
              <select className="inp" style={{ width: '100%' }} value={d.nganh3} onChange={(e) => capNhat(d.id, { nganh3: e.target.value })}>
                <option value="">— chọn —</option>
                {dsNganh3.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div style={{ position: 'relative', flex: '1 1 220px' }}>
              <div className="lbl">Mã tham chiếu (tùy chọn — ưu tiên hơn ngành)</div>
              <input className="inp" style={{ width: '100%' }}
                placeholder="Mã cũ tương tự…" value={d.qTC} onChange={(e) => goTim(d.id, 'tc', e.target.value)} />
              {d.goiYTC.length > 0 && (
                <div className="goiy-pop">
                  {d.goiYTC.map((g) => (
                    <div key={g.barcode} className="goiy-item" style={{ cursor: 'pointer' }} onClick={() => chonTC(d.id, g)}>
                      <AnhMini url={g.hinh_url} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="mono" style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--teal-deep)' }}>{g.ma_tham_chieu || g.sku}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>{g.nganh_3}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ flex: '0 0 110px' }}>
              <div className="lbl">Tổng SL</div>
              <input className="inp" type="number" min="1" style={{ width: '100%' }}
                value={d.tong} onChange={(e) => capNhat(d.id, { tong: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {!d.ct && <button className="btn btn-primary" disabled={busy} onClick={() => chiaDong(d)}>Chia</button>}
              {dong.length > 1 && <button className="btn-mini btn-danger" onClick={() => setDong((ds) => ds.filter((x) => x.id !== d.id))}>－</button>}
            </div>
          </div>

          {d.thamChieu && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--teal-deep)' }}>
              Chia theo tỷ trọng bán của <b className="mono">{d.thamChieu.ma_tham_chieu || d.thamChieu.sku}</b> (60 ngày)
            </div>
          )}

          {d.ct && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <b style={{ fontSize: 13 }}>Kết quả: {d.ct.length} cửa hàng · {d.ct.reduce((s, r) => s + (r.sl_chot || 0), 0)} sp</b>
                <button className="btn-mini" onClick={() => capNhat(d.id, { moRong: !d.moRong })}>{d.moRong ? 'Thu gọn' : 'Mở rộng'}</button>
                <button className="btn-mini" onClick={() => capNhat(d.id, { ct: null, batchId: null })}>Chia lại</button>
              </div>
              {d.moRong && (
                <div className="tbl-wrap" style={{ maxHeight: '40vh' }}>
                  <table className="tbl">
                    <thead><tr><th>Cửa hàng</th><th className="num">Tỷ lệ</th><th className="num">Đề xuất</th><th className="num">Chốt</th></tr></thead>
                    <tbody>
                      {d.ct.map((r) => (
                        <tr key={r.id}>
                          <td><b>{tenCH[r.ma_ch] || r.ma_ch}</b> <span style={{ color: 'var(--ink-2)', fontSize: 11 }}>{r.ma_ch}</span></td>
                          <td className="num">{Math.round((r.ty_le || 0) * 100)}%</td>
                          <td className="num">{r.sl_de_xuat}</td>
                          <td className="num"><input className="qty-input" type="number" min="0" value={r.sl_chot}
                            onChange={(e) => suaChot(d.id, r.id, e.target.value)} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      <button className="btn" style={{ marginTop: 12 }} onClick={() => setDong((ds) => [...ds, dongMoi()])}>
        ＋ Thêm mã hàng mới
      </button>
    </div>
  );
}
