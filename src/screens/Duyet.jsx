import { useEffect, useState } from 'react';
import { sb, fmtDT, TRANG_THAI } from '../lib/supabase.js';
import { IcCheck, IcDown, IcOut } from '../lib/icons.jsx';
import { xuatFileOdoo } from '../lib/odooExport.js';
import { useApp } from '../App.jsx';

// Màn ĐIỀU PHỐI — không duyệt nội dung từng đơn như trước.
// Nhiệm vụ: xuất file, đưa lên Odoo, theo dõi pipeline, CAN THIỆP (kèm lý do) khi cảnh báo.
export default function Duyet() {
  const { user, baoToast } = useApp();
  const [ds, setDs] = useState([]);
  const [tt, setTt] = useState('GUI');
  const [mo, setMo] = useState(null);
  const [lines, setLines] = useState([]);
  const [thieuKho, setThieuKho] = useState([]);
  const [lyDoSua, setLyDoSua] = useState('');

  const taiThieuKho = async () => {
    const { data } = await sb.rpc('fn_thieu_kho');
    setThieuKho(data || []);
  };
  const thieuMap = Object.fromEntries(thieuKho.map((t) => [t.barcode, t]));

  const tai = async () => {
    const { data } = await sb.from('don_xin_hang')
      .select('*, cua_hang(ten)').eq('trang_thai', tt)
      .order('ngay_gui', { ascending: true });   // FIFO: gửi trước xử lý trước
    setDs(data || []); setMo(null); setLyDoSua('');
    taiThieuKho();
  };
  useEffect(() => { tai(); }, [tt]);

  const moDon = async (d) => {
    const { data } = await sb.from('don_xin_hang_ct')
      .select('*, san_pham(sku, ma_tham_chieu, hinh_url, nganh_3)')
      .eq('don_id', d.id).order('id');
    setLines((data || []).map((l) => ({ ...l, sl_duyet: l.sl_duyet ?? l.sl_xin })));
    setMo(d);
  };

  const buoc = async (d, next, thongBao) => {
    const { error } = await sb.rpc('fn_buoc',
      { p_token: user.token, p_don_id: d.id, p_tt: next });
    if (error) { baoToast('Lỗi: ' + error.message); return false; }
    baoToast(thongBao || `Phiếu #${d.id} → ${TRANG_THAI[next]}`); tai(); return true;
  };

  const xuat = async () => {
    await xuatFileOdoo(mo, lines);
    await buoc(mo, 'XUAT_FILE', `Đã xuất file Odoo phiếu #${mo.id}`);
  };

  const canThiep = async () => {
    if (!lyDoSua.trim()) { baoToast('Can thiệp bắt buộc ghi lý do'); return; }
    const sua = lines.filter((l) => l.sl_duyet !== l.sl_xin)
      .map((l) => ({ id: l.id, sl_duyet: l.sl_duyet }));
    if (!sua.length) { baoToast('Chưa sửa dòng nào'); return; }
    const { error } = await sb.rpc('fn_dieu_chinh_don',
      { p_token: user.token, p_don_id: mo.id, p_sua: sua, p_ly_do: lyDoSua });
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    baoToast(`Đã can thiệp ${sua.length} dòng phiếu #${mo.id} (có ghi vết)`); tai();
  };

  const daSua = mo && lines.some((l) => l.sl_duyet !== l.sl_xin);

  return (
    <>
      <div className="cmdbar">
        <h1>Điều phối & kiểm soát phiếu</h1>
        <div className="sub">Cửa hàng tự chịu trách nhiệm phiếu — điều phối xuất file, đưa lên Odoo và chỉ can thiệp khi có cảnh báo.</div>
        <div className="row">
          {['GUI', 'XUAT_FILE', 'LEN_ODOO', 'KHO_NHAN', 'KHO_LAY'].map((s) => (
            <button key={s} className="btn" onClick={() => setTt(s)}
              style={{ background: tt === s ? '#fff' : 'rgba(255,255,255,.16)',
                       color: tt === s ? 'var(--ink)' : '#fff' }}>
              {TRANG_THAI[s]}
            </button>
          ))}
        </div>
      </div>

      {!mo && thieuKho.length > 0 && (
        <div className="card" style={{ marginBottom: 14, borderLeft: '4px solid var(--magenta)' }}>
          <h3 style={{ fontSize: 15, marginBottom: 8, color: 'var(--magenta)' }}>
            Kho trung tâm không đủ cho {thieuKho.length} mã hàng đang chờ cấp
          </h3>
          <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 8 }}>
            Nguyên tắc: phiếu đến trước giữ hàng trước. Can thiệp phiếu đến sau nếu cần, có ghi lý do.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {thieuKho.slice(0, 12).map((t) => (
              <span key={t.barcode} className="chip warn">
                {t.ma_tham_chieu || t.barcode}: cần {t.tong_cau}, còn {t.kha_dung} ({t.so_ch} CH)
              </span>
            ))}
            {thieuKho.length > 12 && <span className="chip dim">+{thieuKho.length - 12} mã khác</span>}
          </div>
        </div>
      )}

      {!mo && (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Phiếu</th><th>Cửa hàng</th><th>Loại</th><th>Xác nhận</th>
              <th>Gửi lúc</th><th>Deadline kho</th><th></th></tr></thead>
            <tbody>
              {ds.map((d) => {
                const tre = d.deadline_kho && new Date(d.deadline_kho) < new Date();
                return (
                  <tr key={d.id}>
                    <td className="mono">#{d.id}</td>
                    <td><b>{d.cua_hang?.ten}</b> <span className="mono" style={{ color: 'var(--ink-2)' }}>{d.ma_ch}</span></td>
                    <td>{d.loai === 'KHAN_CAP'
                      ? <span className="chip warn">Khẩn cấp{d.ly_do_khan_cap ? `: ${d.ly_do_khan_cap}` : ''}</span>
                      : <span className="chip dim">Định kỳ{d.gui_tre ? ' · TRỄ GIỜ' : ''}</span>}</td>
                    <td className="mono" style={{ fontSize: 11 }}>
                      {d.xac_nhan_1}{d.xac_nhan_2 ? ' + ' + d.xac_nhan_2 : ''}</td>
                    <td>{fmtDT(d.ngay_gui)}</td>
                    <td style={{ color: tre ? 'var(--magenta)' : undefined, fontWeight: tre ? 700 : 400 }}>
                      {fmtDT(d.deadline_kho)}{tre ? ' — QUÁ HẠN' : ''}</td>
                    <td>
                      {tt === 'GUI'
                        ? <button className="btn btn-teal" onClick={() => moDon(d)}><IcDown /> Xem & xuất Odoo</button>
                        : tt === 'XUAT_FILE'
                        ? <button className="btn btn-gold" onClick={() => buoc(d, 'LEN_ODOO')}>
                            <IcCheck /> Đã đưa lên Odoo</button>
                        : <button className="btn btn-ghost" onClick={() => moDon(d)}>Xem</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!ds.length && <div className="empty"><div className="t">Không có phiếu ở trạng thái này</div></div>}
        </div>
      )}

      {mo && (
        <>
          <div className="toolbar">
            <button className="btn btn-ghost" onClick={() => setMo(null)}>← Danh sách</button>
            <b>Phiếu #{mo.id} — {mo.cua_hang?.ten}</b>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {daSua && mo.trang_thai === 'GUI' && (
                <>
                  <input value={lyDoSua} onChange={(e) => setLyDoSua(e.target.value)}
                    placeholder="Lý do can thiệp (bắt buộc)"
                    style={{ padding: '8px 12px', borderRadius: 10, border: '1.5px solid var(--line)', width: 240 }} />
                  <button className="btn btn-gold" onClick={canThiep}>Lưu can thiệp</button>
                </>
              )}
              {mo.trang_thai === 'GUI' &&
                <button className="btn btn-primary" onClick={xuat}><IcOut /> Xuất file Odoo</button>}
            </span>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr>
                <th>Sản phẩm</th><th className="num">Tồn trước</th><th className="num">Đi đường</th>
                <th className="num">Bán/kỳ</th><th className="num">AI</th>
                <th className="num">CH đề nghị</th><th className="num">Sau can thiệp</th><th>Cảnh báo</th>
              </tr></thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} style={l.sl_xin !== l.sl_ai ? { background: '#FDF8EC' } : undefined}>
                    <td>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        {l.san_pham?.hinh_url && <img className="sp" src={l.san_pham.hinh_url} alt="" loading="lazy" />}
                        <div>
                          <div className="mono" style={{ fontWeight: 600 }}>{l.san_pham?.ma_tham_chieu || l.barcode}</div>
                          <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>{l.san_pham?.nganh_3}</div>
                        </div>
                      </div>
                    </td>
                    <td className="num">{l.ton_truoc}</td>
                    <td className="num">{l.dang_di_duong || '—'}</td>
                    <td className="num">{l.sl_ban_ky}/{l.so_ngay_ban}d</td>
                    <td className="num" style={{ color: 'var(--teal-deep)', fontWeight: 700 }}>{l.sl_ai}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{l.sl_xin}</td>
                    <td className="num">
                      <input className="qty-input" type="number" min="0" value={l.sl_duyet}
                        disabled={mo.trang_thai !== 'GUI'}
                        onChange={(e) => setLines((ls) => ls.map((x) =>
                          x.id === l.id ? { ...x, sl_duyet: Math.max(0, parseInt(e.target.value) || 0) } : x))} />
                    </td>
                    <td>{l.canh_bao && <span className="chip warn">{l.canh_bao}</span>}
                        {l.sl_xin !== l.sl_ai && <span className="chip gold">CH sửa {l.sl_ai}→{l.sl_xin}</span>}
                        {thieuMap[l.barcode] && <span className="chip warn">Kho chỉ còn {thieuMap[l.barcode].kha_dung}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
