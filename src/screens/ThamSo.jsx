import { useEffect, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { IcGear, IcCheck } from '../lib/icons.jsx';
import { useApp } from '../App.jsx';

// Nhóm hiển thị để màn hình có trật tự nghiệp vụ, không phải bãi key-value
const NHOM = [
  { ten: 'Engine gợi ý', keys: ['k_shrinkage', 'z_an_toan', 'he_so_hang_moi',
      'nguong_hang_moi_ngay', 'nguong_du_lieu_day', 'min_display'] },
  { ten: 'Ưu tiên khi kho thiếu', keys: ['w_het_hang', 'w_thu_tu', 'w_toc_do', 'w_nhom_ch'] },
  { ten: 'File Odoo', keys: ['odoo_mapping'] },
];

export default function ThamSo() {
  const { user, baoToast } = useApp();
  const [ds, setDs] = useState([]);
  const [sua, setSua] = useState({});          // {'key/pham_vi': chuỗi đang gõ}
  const [mk, setMk] = useState({ cu: '', moi: '' });
  const [ph, setPh] = useState({ ban: __APP_VERSION__, bat_buoc: false, ghi_chu: '' });
  const [banHT, setBanHT] = useState(null);      // bản đang phát hành trên hệ thống

  const tai = async () => {
    const { data } = await sb.from('tham_so').select('*').order('key').order('pham_vi');
    setDs(data || []); setSua({});
  };
  useEffect(() => { tai(); }, []);
  useEffect(() => { sb.rpc('fn_phien_ban').then(({ data }) => setBanHT(data || {}), () => {}); }, []);

  // Phát hành: mọi máy đang mở app sẽ nhận tín hiệu và hiện thanh mời cập nhật.
  const phatHanh = async () => {
    if (!ph.ban.trim()) { baoToast('Nhập số phiên bản'); return; }
    const { data, error } = await sb.rpc('fn_phat_hanh', {
      p_ban: ph.ban.trim(), p_bat_buoc: ph.bat_buoc,
      p_ghi_chu: ph.ghi_chu, p_nguoi: user.ma_dang_nhap });
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    setBanHT(data || {});
    baoToast('Đã phát hành ' + ph.ban.trim() + ' — các máy đang mở sẽ nhận thông báo');
  };

  const k = (t) => t.key + '/' + t.pham_vi;
  const hienGiaTri = (t) =>
    sua[k(t)] !== undefined ? sua[k(t)]
      : typeof t.gia_tri === 'object' ? JSON.stringify(t.gia_tri, null, 2) : String(t.gia_tri);

  const luu = async (t) => {
    const raw = hienGiaTri(t).trim();
    let gt;
    try { gt = JSON.parse(raw); }               // '5', '0.8', '[...]' đều là JSON hợp lệ
    catch { baoToast('Giá trị không hợp lệ (số hoặc JSON)'); return; }
    const { error } = await sb.rpc('fn_luu_tham_so', {
      p_key: t.key, p_pham_vi: t.pham_vi, p_gia_tri: gt,
      p_mo_ta: t.mo_ta, p_token: user.token,
    });
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    baoToast(`Đã lưu ${t.key} (${t.pham_vi}) — có hiệu lực ngay lần gợi ý sau`); tai();
  };

  const doiMk = async () => {
    if (!mk.cu || !mk.moi) { baoToast('Nhập đủ mật khẩu hiện tại và mới'); return; }
    const { error } = await sb.rpc('fn_doi_mat_khau',
      { p_ma: user.ma_dang_nhap, p_cu: mk.cu, p_moi: mk.moi });
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    baoToast('Đã đổi mật khẩu'); setMk({ cu: '', moi: '' });
  };

  const theoNhom = (keys) => ds.filter((t) => keys.includes(t.key));
  const khac = ds.filter((t) => !NHOM.some((n) => n.keys.includes(t.key)));

  const Bang = ({ items }) => (
    <table className="tbl">
      <thead><tr><th style={{ width: 180 }}>Tham số</th><th style={{ width: 120 }}>Phạm vi</th>
        <th>Giá trị</th><th>Ý nghĩa</th><th style={{ width: 90 }}></th></tr></thead>
      <tbody>
        {items.map((t) => {
          const laJson = typeof t.gia_tri === 'object';
          const daSua = sua[k(t)] !== undefined;
          return (
            <tr key={k(t)} style={daSua ? { background: '#FDF8EC' } : undefined}>
              <td className="mono" style={{ fontWeight: 600 }}>{t.key}</td>
              <td><span className="chip dim">{t.pham_vi}</span></td>
              <td>
                {laJson
                  ? <textarea className="qty-input" rows={5}
                      style={{ width: '100%', minWidth: 260, textAlign: 'left',
                        fontFamily: 'var(--font-mono)', fontSize: 12, height: 'auto' }}
                      value={hienGiaTri(t)}
                      onChange={(e) => setSua((s) => ({ ...s, [k(t)]: e.target.value }))} />
                  : <input className="qty-input" style={{ width: 110 }}
                      value={hienGiaTri(t)}
                      onChange={(e) => setSua((s) => ({ ...s, [k(t)]: e.target.value }))} />}
              </td>
              <td style={{ fontSize: 12, color: 'var(--ink-2)', maxWidth: 320 }}>{t.mo_ta}</td>
              <td>{daSua && <button className="btn btn-primary" onClick={() => luu(t)}>
                <IcCheck /> Lưu</button>}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <>
      <div className="cmdbar">
        <h1>Tham số hệ thống</h1>
        <div className="sub">Mọi hệ số của engine đều nằm ở đây — lưu là có hiệu lực ngay, mọi thay đổi được ghi audit log.</div>
      </div>

      {NHOM.map((n) => {
        const items = theoNhom(n.keys);
        if (!items.length) return null;
        return (
          <div key={n.ten} style={{ marginBottom: 18 }}>
            <h3 style={{ fontSize: 15, margin: '0 0 8px', display: 'flex', gap: 6, alignItems: 'center' }}>
              <IcGear /> {n.ten}</h3>
            <div className="tbl-wrap"><Bang items={items} /></div>
          </div>
        );
      })}
      {khac.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <h3 style={{ fontSize: 15, margin: '0 0 8px' }}>Khác</h3>
          <div className="tbl-wrap"><Bang items={khac} /></div>
        </div>
      )}

      <div className="card" style={{ maxWidth: 560, marginBottom: 18 }}>
        <h3 style={{ fontSize: 15, marginBottom: 4, display: 'flex', gap: 6, alignItems: 'center' }}>
          <IcCheck /> Phát hành bản mới</h3>
        <div className="tq-ghi" style={{ marginBottom: 12 }}>
          Máy này đang chạy <b>v{__APP_VERSION__}</b>
          {banHT?.ban ? <> · hệ thống đang công bố <b>v{banHT.ban}</b></> : null}.
          Bấm phát hành: mọi cửa hàng đang mở app sẽ thấy lời mời cập nhật —
          <b> không máy nào tự tải lại khi nhân viên đang nhập dở</b>.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input className="qty-input" style={{ width: '100%', textAlign: 'left' }}
            placeholder="Số phiên bản (vd 3.37.0)" value={ph.ban}
            onChange={(e) => setPh((v) => ({ ...v, ban: e.target.value }))} />
          <input className="qty-input" style={{ width: '100%', textAlign: 'left' }}
            placeholder="Ghi chú hiển thị cho cửa hàng (không bắt buộc)" value={ph.ghi_chu}
            onChange={(e) => setPh((v) => ({ ...v, ghi_chu: e.target.value }))} />
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={ph.bat_buoc}
              onChange={(e) => setPh((v) => ({ ...v, bat_buoc: e.target.checked }))} />
            Bản bắt buộc — tự cập nhật ngay khi nhân viên rảnh tay (dùng cho bản sửa lỗi)
          </label>
          <button className="btn btn-ai" onClick={phatHanh} style={{ alignSelf: 'flex-start' }}>Phát hành</button>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 420 }}>
        <h3 style={{ fontSize: 15, marginBottom: 10 }}>Đổi mật khẩu ({user.ma_dang_nhap})</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input className="qty-input" style={{ width: '100%', textAlign: 'left' }} type="password"
            placeholder="Mật khẩu hiện tại" value={mk.cu}
            onChange={(e) => setMk((m) => ({ ...m, cu: e.target.value }))} />
          <input className="qty-input" style={{ width: '100%', textAlign: 'left' }} type="password"
            placeholder="Mật khẩu mới (tối thiểu 6 ký tự)" value={mk.moi}
            onChange={(e) => setMk((m) => ({ ...m, moi: e.target.value }))} />
          <button className="btn btn-primary" onClick={doiMk}>Đổi mật khẩu</button>
        </div>
      </div>
    </>
  );
}
