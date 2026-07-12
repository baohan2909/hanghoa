import { useEffect, useState } from 'react';
import { sb, fmtDT, TRANG_THAI } from '../lib/supabase.js';
import { IcBox, IcCheck, IcTruck, IcAlert, IcRefresh } from '../lib/icons.jsx';
import { useApp } from '../App.jsx';

// Màn KHO TỔNG — nhịp làm việc theo kế hoạch:
// LEN_ODOO (chờ tiếp nhận) -> KHO_NHAN (đã tiếp nhận, giữ hàng theo thứ tự đến)
// -> KHO_LAY (lấy xong) -> BAN_GIAO_VC (bàn giao vận chuyển, chốt SLA).
// Kho phản hồi ngay khi thiếu hàng / sai dữ liệu — không tự bỏ đơn.
const BUOC_KE = { LEN_ODOO: 'KHO_NHAN', KHO_NHAN: 'KHO_LAY', KHO_LAY: 'BAN_GIAO_VC' };
const NUT = {
  LEN_ODOO: ['Tiếp nhận đơn', IcCheck, 'btn-teal'],
  KHO_NHAN: ['Đã lấy xong hàng', IcBox, 'btn-primary'],
  KHO_LAY: ['Bàn giao vận chuyển', IcTruck, 'btn-gold'],
};

export default function Kho() {
  const { user, baoToast } = useApp();
  const [ds, setDs] = useState([]);
  const [tt, setTt] = useState('LEN_ODOO');
  const [phanHoi, setPhanHoi] = useState(null);   // {don, noiDung}
  const [dem, setDem] = useState({});

  const tai = async () => {
    const { data } = await sb.from('don_xin_hang')
      .select('*, cua_hang(ten, khu_vuc)')
      .in('trang_thai', ['LEN_ODOO', 'KHO_NHAN', 'KHO_LAY'])
      .order('ngay_gui', { ascending: true });      // đến trước — giữ hàng trước
    const all = data || [];
    setDs(all.filter((d) => d.trang_thai === tt));
    setDem({
      LEN_ODOO: all.filter((d) => d.trang_thai === 'LEN_ODOO').length,
      KHO_NHAN: all.filter((d) => d.trang_thai === 'KHO_NHAN').length,
      KHO_LAY: all.filter((d) => d.trang_thai === 'KHO_LAY').length,
    });
  };
  useEffect(() => { tai(); const t = setInterval(tai, 60000); return () => clearInterval(t); }, [tt]);

  const buoc = async (d) => {
    const next = BUOC_KE[d.trang_thai];
    const { error } = await sb.rpc('fn_buoc',
      { p_token: user.token, p_don_id: d.id, p_tt: next });
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    baoToast(next === 'BAN_GIAO_VC'
      ? `Phiếu #${d.id} đã bàn giao vận chuyển — chốt SLA kho`
      : `Phiếu #${d.id} → ${TRANG_THAI[next]}`);
    tai();
  };

  const guiPhanHoi = async () => {
    if (!phanHoi.noiDung.trim()) { baoToast('Ghi rõ nội dung phản hồi'); return; }
    const { error } = await sb.rpc('fn_kho_phan_hoi',
      { p_token: user.token, p_don_id: phanHoi.don.id, p_noi_dung: phanHoi.noiDung });
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    baoToast(`Đã gửi phản hồi phiếu #${phanHoi.don.id} — điều phối và cửa hàng sẽ thấy cảnh báo`);
    setPhanHoi(null); tai();
  };


  return (
    <>
      <div className="cmdbar">
        <h1>Kho tổng — xử lý phiếu</h1>
        <div className="sub">Đơn đến trước giữ hàng trước · lấy hàng trong ngày làm việc kế tiếp · T7+CN gom xử lý thứ Hai.</div>
        <div className="row">
          {['LEN_ODOO', 'KHO_NHAN', 'KHO_LAY'].map((s) => (
            <button key={s} className="btn" onClick={() => setTt(s)}
              style={{ background: tt === s ? '#fff' : 'rgba(255,255,255,.16)',
                       color: tt === s ? 'var(--ink)' : '#fff' }}>
              {TRANG_THAI[s]} ({dem[s] ?? 0})
            </button>
          ))}
          <button className="btn" style={{ background: 'rgba(255,255,255,.16)', color: '#fff' }}
            onClick={tai}><IcRefresh /> Làm mới</button>
        </div>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr>
            <th>#</th><th>Phiếu</th><th>Cửa hàng</th><th>Khu vực</th>
            <th>Gửi lúc</th><th>Deadline</th><th>Phản hồi</th><th></th>
          </tr></thead>
          <tbody>
            {ds.map((d, i) => {
              const tre = d.deadline_kho && new Date(d.deadline_kho) < new Date();
              const [nhan, Ic, mau] = NUT[d.trang_thai] || [];
              return (
                <tr key={d.id} style={tre ? { background: '#FFF3F8' } : undefined}>
                  <td className="mono" style={{ color: 'var(--ink-2)' }}>{i + 1}</td>
                  <td className="mono">#{d.id}{d.loai === 'KHAN_CAP' && <span className="chip warn" style={{ marginLeft: 6 }}>Khẩn</span>}</td>
                  <td><b>{d.cua_hang?.ten}</b> <span className="mono" style={{ color: 'var(--ink-2)' }}>{d.ma_ch}</span></td>
                  <td style={{ fontSize: 12 }}>{d.cua_hang?.khu_vuc}</td>
                  <td>{fmtDT(d.ngay_gui)}</td>
                  <td style={{ color: tre ? 'var(--magenta)' : undefined, fontWeight: tre ? 700 : 400 }}>
                    {fmtDT(d.deadline_kho)}{tre ? ' — QUÁ HẠN' : ''}</td>
                  <td style={{ maxWidth: 180, fontSize: 12 }}>
                    {d.phan_hoi_kho && <span className="chip warn">{d.phan_hoi_kho}</span>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className={'btn ' + mau} onClick={() => buoc(d)}><Ic /> {nhan}</button>{' '}
                    <button className="btn btn-ghost" title="Phản hồi thiếu hàng / sai dữ liệu"
                      onClick={() => setPhanHoi({ don: d, noiDung: d.phan_hoi_kho || '' })}><IcAlert /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!ds.length && <div className="empty">
          <div className="t">Không có phiếu ở trạng thái này</div>
          Phiếu xuất hiện tại đây sau khi điều phối xác nhận đã đưa lên Odoo.
        </div>}
      </div>

      {phanHoi && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,33,58,.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}
          onClick={() => setPhanHoi(null)}>
          <div className="card" style={{ maxWidth: 420, width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, marginBottom: 4 }}>Phản hồi phiếu #{phanHoi.don.id}</h3>
            <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 12 }}>
              Thiếu hàng, sai mã, sai số lượng hoặc vấn đề phát sinh — kho phản hồi rõ trên hệ thống,
              không tự bỏ đơn hoặc thay đổi số lượng.
            </div>
            <textarea className="qty-input" rows={3}
              style={{ width: '100%', textAlign: 'left', height: 'auto' }}
              placeholder="VD: Mã NS008BTG-XH536-M chỉ còn 3/8 — đã lấy 3, phần thiếu chờ điều phối"
              value={phanHoi.noiDung}
              onChange={(e) => setPhanHoi((x) => ({ ...x, noiDung: e.target.value }))} />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setPhanHoi(null)}>Hủy</button>
              <button className="btn btn-primary" style={{ flex: 2 }} onClick={guiPhanHoi}>Gửi phản hồi</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
