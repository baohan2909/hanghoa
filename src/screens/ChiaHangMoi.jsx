import { useEffect, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { IcSplit, IcDown } from '../lib/icons.jsx';
import { useApp } from '../App.jsx';

export default function ChiaHangMoi() {
  const { user, baoToast } = useApp();
  const [dsNganh3, setDsNganh3] = useState([]);
  const [barcode, setBarcode] = useState('');
  const [nganh3, setNganh3] = useState('');
  const [tong, setTong] = useState('');
  const [ct, setCt] = useState(null);
  const [batchId, setBatchId] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    sb.from('san_pham').select('nganh_3').not('nganh_3', 'is', null)
      .then(({ data }) => setDsNganh3([...new Set((data || []).map((x) => x.nganh_3))].sort()));
  }, []);

  // Gõ barcode -> tự nhận nganh_3 của SP
  const timSP = async (bc) => {
    setBarcode(bc);
    if (bc.length < 8) return;
    const { data } = await sb.from('san_pham').select('nganh_3').eq('barcode', bc).single();
    if (data?.nganh_3) setNganh3(data.nganh_3);
  };

  const chia = async () => {
    if (!barcode || !nganh3 || !tong) { baoToast('Nhập đủ barcode, ngành cấp 3 và tổng SL'); return; }
    setBusy(true);
    const { data: id, error } = await sb.rpc('fn_chia_hang_moi', {
      p_barcode: barcode, p_nganh3: nganh3, p_tong: parseInt(tong), p_nguoi: user.ma_dang_nhap });
    if (error) { setBusy(false); baoToast('Lỗi: ' + error.message); return; }
    const { data } = await sb.from('chia_hang_moi_ct')
      .select('*, cua_hang(ten)').eq('batch_id', id).order('sl_de_xuat', { ascending: false });
    setCt(data || []); setBatchId(id); setBusy(false);
  };

  const suaChot = (idRow, v) => setCt((rows) => rows.map((r) =>
    r.id === idRow ? { ...r, sl_chot: Math.max(0, parseInt(v) || 0) } : r));

  const luuVaXuat = async () => {
    await Promise.all(ct.map((r) =>
      sb.from('chia_hang_moi_ct').update({ sl_chot: r.sl_chot }).eq('id', r.id)));
    await sb.from('chia_hang_moi').update({ trang_thai: 'CHOT' }).eq('id', batchId);
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(ct.filter((r) => r.sl_chot > 0).map((r) => ({
      'Mã kho nhận': r.ma_ch, 'Barcode': barcode, 'Số lượng': r.sl_chot,
      'Ghi chú': `NS-MOI-${batchId}` })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ChiaHangMoi');
    XLSX.writeFile(wb, `ODOO_CHIAMOI_${batchId}.xlsx`);
    baoToast('Đã chốt và xuất file');
  };

  const tongChot = (ct || []).reduce((s, r) => s + (r.sl_chot || 0), 0);

  return (
    <>
      <div className="cmdbar">
        <h1>Chia hàng mới / tái bản</h1>
        <div className="sub">Phân bổ theo tỷ trọng bán ngành cấp 3 của từng cửa hàng, tự chặn theo định mức</div>
        <div className="row">
          <input className="mono" placeholder="Barcode hàng mới" value={barcode}
            onChange={(e) => timSP(e.target.value.trim())}
            style={{ padding: '9px 12px', borderRadius: 10, border: 0, width: 170 }} />
          <select value={nganh3} onChange={(e) => setNganh3(e.target.value)}
            style={{ padding: '9px 12px', borderRadius: 10, border: 0, maxWidth: 230 }}>
            <option value="">Ngành cấp 3 căn cứ…</option>
            {dsNganh3.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <input type="number" min="1" placeholder="Tổng SL" value={tong}
            onChange={(e) => setTong(e.target.value)}
            style={{ padding: '9px 12px', borderRadius: 10, border: 0, width: 100 }} />
          <button className="btn btn-ai" onClick={chia} disabled={busy}>
            <IcSplit /> {busy ? 'Đang chia…' : 'Chia tự động'}</button>
        </div>
      </div>

      {ct && (
        <>
          <div className="toolbar">
            <span>Tổng chốt: <b>{tongChot}</b> / {tong}</span>
            <button className="btn btn-gold" style={{ marginLeft: 'auto' }} onClick={luuVaXuat}>
              <IcDown /> Chốt & xuất file Odoo</button>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Cửa hàng</th><th className="num">Tỷ trọng nhóm</th>
                <th className="num">Đề xuất</th><th className="num">Chốt</th></tr></thead>
              <tbody>
                {ct.map((r) => (
                  <tr key={r.id}>
                    <td><b>{r.cua_hang?.ten}</b> <span className="mono" style={{ color: 'var(--ink-2)' }}>{r.ma_ch}</span></td>
                    <td className="num">{(r.ty_le * 100).toFixed(1)}%</td>
                    <td className="num" style={{ color: 'var(--teal-deep)', fontWeight: 700 }}>{r.sl_de_xuat}</td>
                    <td className="num"><input className="qty-input" type="number" min="0"
                      value={r.sl_chot} onChange={(e) => suaChot(r.id, e.target.value)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {!ct && <div className="empty card">
        <div className="t">Chia hàng mới theo dữ liệu, không theo cảm tính</div>
        Nhập barcode hàng mới, hệ thống tự nhận ngành cấp 3, phân tích cửa hàng nào bán tốt
        nhóm tương đương và đề xuất tỷ lệ. Điều phối chỉ chỉnh những dòng cần can thiệp.
      </div>}
    </>
  );
}
