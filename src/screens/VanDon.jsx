import { useEffect, useState } from 'react';
import { sb, fmtDT, TRANG_THAI } from '../lib/supabase.js';
import { IcTruck, IcRefresh, IcCheck } from '../lib/icons.jsx';
import { GHTK_FN, SUPABASE_ANON } from '../config.js';
import { useApp } from '../App.jsx';

export default function VanDon() {
  const { user, baoToast } = useApp();
  const [choGan, setChoGan] = useState([]);   // đơn BAN_GIAO_VC chưa có mã VĐ
  const [ds, setDs] = useState([]);           // vận đơn đang theo dõi
  const [maVd, setMaVd] = useState({});       // input mã VĐ theo don_id
  const [busy, setBusy] = useState(false);
  const laDieuPhoi = user.vai_tro !== 'CH';

  const tai = async () => {
    let q1 = sb.from('don_xin_hang')
      .select('id, ma_ch, trang_thai, ngay_gui, cua_hang(ten), van_don(ma_van_don)')
      .in('trang_thai', ['BAN_GIAO_VC', 'DANG_GIAO'])
      .order('ngay_gui', { ascending: true });
    if (user.vai_tro === 'CH') q1 = q1.eq('ma_ch', user.ma_ch);
    const { data: dons } = await q1;
    setChoGan((dons || []).filter((d) => !d.van_don?.ma_van_don));

    let q2 = sb.from('van_don')
      .select('*, don_xin_hang!inner(id, ma_ch, trang_thai, cua_hang(ten))')
      .not('ma_van_don', 'is', null)
      .order('cap_nhat_luc', { ascending: false, nullsFirst: false }).limit(200);
    if (user.vai_tro === 'CH') q2 = q2.eq('don_xin_hang.ma_ch', user.ma_ch);
    const { data: vds } = await q2;
    setDs(vds || []);
  };
  useEffect(() => { tai(); }, []);

  const gan = async (donId) => {
    const ma = (maVd[donId] || '').trim();
    if (!ma) { baoToast('Nhập mã vận đơn GHTK trước'); return; }
    const { error } = await sb.rpc('fn_gan_van_don',
      { p_token: user.token, p_don_id: donId, p_ma_van_don: ma });
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    baoToast(`Đã gán vận đơn cho #${donId}`); setMaVd((m) => ({ ...m, [donId]: '' })); tai();
  };

  const lamMoi = async (donId) => {
    setBusy(true);
    try {
      const r = await fetch(GHTK_FN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + SUPABASE_ANON },
        body: JSON.stringify(donId ? { don_id: donId } : {}),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      baoToast(donId ? `Đã cập nhật đơn #${donId}` : `Đã hỏi GHTK ${j.so_luong ?? ''} vận đơn`);
      tai();
    } catch (e) { baoToast('GHTK lỗi: ' + e.message); }
    setBusy(false);
  };

  const xacNhanNhan = async (donId) => {
    const { error } = await sb.rpc('fn_buoc',
      { p_token: user.token, p_don_id: donId, p_tt: 'DA_NHAN' });
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    baoToast(`Đã xác nhận nhận hàng đơn #${donId} — khép vòng đời đơn`); tai();
  };

  const tre = (v) => v.du_kien_giao && !v.thuc_te_giao && new Date(v.du_kien_giao) < new Date();

  return (
    <>
      <div className="cmdbar">
        <h1>Vận đơn & giao nhận</h1>
        <div className="sub">Theo dõi hành trình Giao Hàng Tiết Kiệm — cửa hàng xác nhận nhận để khép vòng đời đơn.</div>
        {laDieuPhoi && (
          <div className="row">
            <button className="btn" disabled={busy}
              style={{ background: 'rgba(255,255,255,.16)', color: '#fff' }}
              onClick={() => lamMoi()}><IcRefresh /> {busy ? 'Đang hỏi GHTK…' : 'Làm mới tất cả từ GHTK'}</button>
          </div>
        )}
      </div>

      {laDieuPhoi && choGan.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>Đã bàn giao vận chuyển — chờ gán mã vận đơn</h3>
          {choGan.map((d) => (
            <div key={d.id} style={{ display: 'flex', gap: 10, alignItems: 'center',
              padding: '8px 0', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
              <span style={{ minWidth: 200 }}>
                <b className="mono">#{d.id}</b> {d.cua_hang?.ten}
                <span className="mono" style={{ color: 'var(--ink-2)' }}> {d.ma_ch}</span>
              </span>
              <input className="qty-input" style={{ width: 170, textAlign: 'left' }}
                placeholder="Mã vận đơn GHTK" value={maVd[d.id] || ''}
                onChange={(e) => setMaVd((m) => ({ ...m, [d.id]: e.target.value }))} />
              <button className="btn btn-teal" onClick={() => gan(d.id)}><IcTruck /> Gán</button>
            </div>
          ))}
        </div>
      )}

      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr>
            <th>Đơn</th><th>Cửa hàng</th><th>Mã vận đơn</th><th>Trạng thái VC</th>
            <th>Kho xong</th><th>Bàn giao</th><th>Dự kiến</th><th>Thực tế</th><th></th>
          </tr></thead>
          <tbody>
            {ds.map((v) => (
              <tr key={v.don_id} style={tre(v) ? { background: '#FFF3F8' } : undefined}>
                <td className="mono">#{v.don_id}</td>
                <td><b>{v.don_xin_hang?.cua_hang?.ten}</b>
                  <span className="mono" style={{ color: 'var(--ink-2)' }}> {v.don_xin_hang?.ma_ch}</span></td>
                <td className="mono">{v.ma_van_don}</td>
                <td>
                  {v.xac_nhan_nhan
                    ? <span className="chip teal">Đã nhận — hoàn tất</span>
                    : <>{v.trang_thai_vc || TRANG_THAI[v.don_xin_hang?.trang_thai] || '—'}
                        {tre(v) && <span className="chip warn"> Giao trễ</span>}</>}
                  {v.ly_do_that_bai && <div style={{ fontSize: 11, color: 'var(--magenta)' }}>{v.ly_do_that_bai}</div>}
                  {v.vi_tri && <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>{v.vi_tri}</div>}
                </td>
                <td>{fmtDT(v.ngay_kho_xong)}</td>
                <td>{fmtDT(v.ngay_ban_giao)}</td>
                <td>{fmtDT(v.du_kien_giao)}</td>
                <td>{fmtDT(v.thuc_te_giao)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {laDieuPhoi && !v.xac_nhan_nhan &&
                    <button className="btn btn-ghost" disabled={busy}
                      onClick={() => lamMoi(v.don_id)}><IcRefresh /></button>}
                  {!v.xac_nhan_nhan && (user.vai_tro !== 'CH' || v.don_xin_hang?.ma_ch === user.ma_ch) &&
                    <button className="btn btn-primary" onClick={() => xacNhanNhan(v.don_id)}>
                      <IcCheck /> Đã nhận</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!ds.length && !choGan.length &&
          <div className="empty"><div className="t">Chưa có vận đơn nào đang theo dõi</div></div>}
      </div>
    </>
  );
}
