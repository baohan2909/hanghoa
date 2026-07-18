import { useEffect, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { IcPulse, IcSearch } from '../lib/icons.jsx';
import { useApp } from '../App.jsx';

// ===== THEO DÕI ONLINE — ai đang xem, tần suất, thời lượng (Admin) =====
const isoD = (d) => d.toISOString().slice(0, 10);
const fmtGio = (s) => {
  s = Math.round(Number(s) || 0);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}g ${m}p` : m ? `${m}p` : `${s}s`;
};
const fmtLuc = (t) => {
  if (!t) return '—';
  const d = new Date(t), now = new Date();
  const phut = Math.round((now - d) / 60000);
  if (phut < 1) return 'vừa xong';
  if (phut < 60) return phut + ' phút trước';
  if (phut < 1440) return Math.floor(phut / 60) + ' giờ trước';
  return d.toLocaleDateString('vi-VN') + ' ' + d.toTimeString().slice(0, 5);
};
const manTen = { xinhang: 'Đề nghị hàng', giamsat: 'Thiếu hàng', vandon: 'Vận đơn',
  chiamoi: 'Chia hàng mới', dacbiet: 'Hàng đặc biệt', online: 'Theo dõi online',
  kho: 'Kho tổng', baocao: 'Báo cáo', thamso: 'Tham số', duyet: 'Điều phối' };

export default function TheoDoiOnline() {
  const { baoToast } = useApp();
  const [online, setOnline] = useState([]);
  const [tk, setTk] = useState(null);
  const [tu, setTu] = useState(isoD(new Date(Date.now() - 30 * 864e5)));
  const [den, setDen] = useState(isoD(new Date()));
  const [q, setQ] = useState('');
  const [sort, setSort] = useState({ k: 'lan_cuoi', d: -1 });

  const taiOnline = async () => {
    const { data } = await sb.rpc('fn_online_now');
    setOnline(data || []);
  };
  const taiTK = async () => {
    setTk(null);
    const { data, error } = await sb.rpc('fn_thongke_xem', { p_tu: tu, p_den: den });
    if (error) { baoToast('Lỗi: ' + error.message); setTk([]); return; }
    setTk(data || []);
  };
  useEffect(() => { taiOnline(); const t = setInterval(taiOnline, 30000); return () => clearInterval(t); }, []);
  useEffect(() => { taiTK(); /* eslint-disable-next-line */ }, [tu, den]);

  let ds = (tk || []).filter((r) => {
    if (!q.trim()) return true;
    const k = q.trim().toUpperCase();
    return [r.ten, r.ten_ch, r.ma_ch, r.ma].some((x) => (x || '').toUpperCase().includes(k));
  });
  const onlineSet = new Set(online.map((o) => o.ma));
  const sv = { ten: (r) => r.ten_ch || r.ten || '', phien: (r) => Number(r.so_phien),
    gio: (r) => Number(r.tong_giay), ngay: (r) => Number(r.so_ngay_xem),
    lan_cuoi: (r) => r.lan_cuoi || '', online: (r) => (onlineSet.has(r.ma) ? 1 : 0) };
  ds = [...ds].sort((a, b) => { const x = sv[sort.k](a), y = sv[sort.k](b);
    return (x < y ? -1 : x > y ? 1 : 0) * sort.d; });
  const doiSort = (k) => setSort((c) => ({ k, d: c.k === k ? -c.d : -1 }));
  const ic = (k) => <span style={{ opacity: sort.k === k ? 1 : .3, fontSize: 10 }}>{sort.k === k && sort.d === 1 ? ' ▲' : ' ▼'}</span>;

  const soHoatDong = (tk || []).filter((r) => Number(r.so_phien) > 0).length;
  const soImLang = (tk || []).length - soHoatDong;

  return (
    <div>
      <div className="cmdbar">
        <div className="cmd-title">
          <h2><IcPulse style={{ verticalAlign: -3, marginRight: 8 }} />Theo dõi online</h2>
          <p>Cửa hàng nào đang mở app, tần suất và thời lượng xem — cập nhật tự động mỗi 30 giây.</p>
        </div>
      </div>

      {/* Thẻ tổng */}
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <div className="the-g" style={{ cursor: 'default' }}>
          <span className="the-g-n" style={{ color: 'var(--teal-deep)' }}>{online.length}</span>
          <span className="the-g-t">Đang online<small>ngay lúc này</small></span>
        </div>
        <div className="the-g" style={{ cursor: 'default' }}>
          <span className="the-g-n">{soHoatDong}</span>
          <span className="the-g-t">Có xem trong kỳ<small>{tu.split('-').reverse().join('/')} → {den.split('-').reverse().join('/')}</small></span>
        </div>
        <div className="the-g" style={{ cursor: 'default' }}>
          <span className="the-g-n" style={{ color: soImLang ? 'var(--magenta)' : 'var(--ink)' }}>{soImLang}</span>
          <span className="the-g-t">Không mở app<small>cần nhắc nhở</small></span>
        </div>
      </div>

      {/* Đang online */}
      {online.length > 0 && (
        <div className="card" style={{ marginTop: 12, padding: 0 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', fontWeight: 700, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="dot-online" /> Đang online ({online.length})
          </div>
          <div className="tbl-wrap" style={{ maxHeight: '32vh' }}>
            <table className="tbl tbl-fit">
              <thead><tr><th>Cửa hàng</th><th className="center">Đang xem</th><th className="center">Online từ</th><th className="center">Thời lượng</th></tr></thead>
              <tbody>
                {online.map((o) => (
                  <tr key={o.ma}>
                    <td><span className="dot-online" style={{ marginRight: 6 }} /><b>{o.ten_ch || o.ten}</b> <span style={{ color: 'var(--ink-2)', fontSize: 11 }}>{o.ma_ch || o.ma}</span></td>
                    <td className="center">{manTen[o.man_hinh] || o.man_hinh || '—'}</td>
                    <td className="center">{fmtLuc(o.online_tu)}</td>
                    <td className="center">{fmtGio(o.giay_online)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Thống kê theo kỳ */}
      <div className="card" style={{ marginTop: 12, padding: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>Thống kê xem theo cửa hàng</div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>Từ</span>
            <label className="date-vi lg" onClick={(e) => { const i = e.currentTarget.querySelector("input"); i && i.showPicker && i.showPicker(); }}>
              <span>{tu.split('-').reverse().join('/')}</span>
              <input type="date" value={tu} onChange={(e) => setTu(e.target.value)} /></label>
            <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>đến</span>
            <label className="date-vi lg" onClick={(e) => { const i = e.currentTarget.querySelector("input"); i && i.showPicker && i.showPicker(); }}>
              <span>{den.split('-').reverse().join('/')}</span>
              <input type="date" value={den} onChange={(e) => setDen(e.target.value)} /></label>
            <div style={{ position: 'relative' }}>
              <IcSearch style={{ position: 'absolute', left: 10, top: 12, width: 15, height: 15, color: 'var(--ink-2)', pointerEvents: 'none' }} />
              <input className="inp" style={{ width: 190, paddingLeft: 33 }} placeholder="Tìm cửa hàng" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {!tk ? (
        <div className="card"><div className="quet-load"><div className="quet-ring" /><div className="quet-s">đang tải…</div></div></div>
      ) : (
        <div className="card" style={{ marginTop: 12, padding: 0 }}>
          <div className="tbl-wrap" style={{ maxHeight: '52vh' }}>
            <table className="tbl tbl-fit">
              <thead><tr>
                <th className="center sortable" onClick={() => doiSort('online')}>{ic('online')}</th>
                <th className="sortable" onClick={() => doiSort('ten')}>Cửa hàng{ic('ten')}</th>
                <th className="center sortable" onClick={() => doiSort('phien')}>Số phiên{ic('phien')}</th>
                <th className="center sortable" onClick={() => doiSort('gio')}>Tổng thời lượng{ic('gio')}</th>
                <th className="center sortable" onClick={() => doiSort('ngay')}>Số ngày xem{ic('ngay')}</th>
                <th className="center sortable" onClick={() => doiSort('lan_cuoi')}>Lần cuối{ic('lan_cuoi')}</th>
              </tr></thead>
              <tbody>
                {ds.map((r) => {
                  const on = onlineSet.has(r.ma);
                  const imLang = Number(r.so_phien) === 0;
                  return (
                    <tr key={r.ma} style={imLang ? { background: '#FDF3F7' } : undefined}>
                      <td className="center">{on ? <span className="dot-online" /> : <span className="dot-off" />}</td>
                      <td><b>{r.ten_ch || r.ten}</b> <span style={{ color: 'var(--ink-2)', fontSize: 11 }}>{r.ma_ch || r.ma}</span></td>
                      <td className="num">{r.so_phien}</td>
                      <td className="num">{fmtGio(r.tong_giay)}</td>
                      <td className="num">{r.so_ngay_xem}</td>
                      <td className="center" style={{ color: imLang ? 'var(--magenta)' : 'var(--ink)' }}>{imLang ? 'Chưa mở app' : fmtLuc(r.lan_cuoi)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
