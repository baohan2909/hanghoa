import { useCallback, useEffect, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { useApp } from '../App.jsx';
import { BangBanTin, BanTinHop } from '../lib/BanTin.jsx';
import { IcCheck, IcAlert } from '../lib/icons.jsx';

// ============================================================================
// HƯỚNG DẪN CẬP NHẬT (v3.118.0) — xem lại các bản tin đã/đang phát; bản nào chưa xác nhận thì đọc + xác nhận tại đây
// ============================================================================
const gioNgay = (s) => (s ? new Date(s).toLocaleString('vi', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');

export default function HuongDan() {
  const { user, baoToast } = useApp();
  const [ds, setDs] = useState(null);
  const [mo, setMo] = useState(null);
  const [doc, setDoc] = useState(null);
  const tai = useCallback(async () => {
    const { data, error } = await sb.rpc('fn_ban_tin_ds', { p_token: user.token });
    if (error) { baoToast('Không tải được: ' + error.message); setDs([]); return; }
    setDs(data || []);
    setMo((m) => m ?? (data?.[0]?.id || null));
  }, [user.token, baoToast]);
  useEffect(() => { tai(); }, [tai]);
  useEffect(() => { const h = () => tai(); window.addEventListener('ns-ban-tin-xong', h); return () => window.removeEventListener('ns-ban-tin-xong', h); }, [tai]);

  return (
    <>
      <div className="cmdbar">
        <h1>Hướng dẫn cập nhật</h1>
        <div className="sub">Các tính năng mới của app và cách dùng. Bản nào có nhãn "Chưa xác nhận" thì đọc hết rồi bấm xác nhận.</div>
      </div>
      {ds == null ? <div className="card hd-trong">Đang tải…</div>
        : ds.length === 0 ? <div className="card hd-trong">Chưa có hướng dẫn nào.</div>
        : (
          <div className="hd-ds">
            {ds.map((b) => {
              const daXn = !!b.xac_nhan_luc;
              const can = !daXn && b.bat && (b.vai_tro || []).includes(user.vai_tro);
              return (
                <article key={b.id} className={'card hd-the' + (mo === b.id ? ' mo' : '')}>
                  <button className="hd-dau" onClick={() => setMo(mo === b.id ? null : b.id)} aria-expanded={mo === b.id}>
                    <div><b>{b.tieu_de}</b><small>{b.bat_luc ? 'Phát hành ' + gioNgay(b.bat_luc) : 'Chưa phát hành'}{!b.bat ? ' · đang tắt' : ''}</small></div>
                    {daXn ? <span className="odn-chip ok"><IcCheck /> Đã xác nhận</span>
                      : can ? <span className="odn-chip do"><IcAlert /> Chưa xác nhận</span> : null}
                  </button>
                  {mo === b.id && (
                    <div className="hd-than">
                      <BangBanTin noiDung={b.noi_dung} />
                      {daXn ? <p className="hd-xn"><IcCheck /> {b.ho_ten} xác nhận đã đọc lúc {gioNgay(b.xac_nhan_luc)}</p>
                        : can && <div className="hd-nut"><button className="btn btn-ai odn-nut-chinh" onClick={() => setDoc(b)}>Đọc & xác nhận</button></div>}
                    </div>)}
                </article>
              );
            })}
          </div>)}
      {doc && <BanTinHop bt={{ ...doc, con_hoan: 0 }} user={user} baoToast={baoToast} onDong={() => setDoc(null)}
        onXong={() => { setDoc(null); tai(); window.dispatchEvent(new CustomEvent('ns-ban-tin-hoi')); }} />}
    </>
  );
}
