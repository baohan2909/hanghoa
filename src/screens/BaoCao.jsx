import { useEffect, useState } from 'react';
import { sb, fmtDT } from '../lib/supabase.js';
import { IcRefresh, IcClock } from '../lib/icons.jsx';
import { DateBox } from '../lib/ui.jsx';

const iso = (d) => d.toISOString().slice(0, 10);

export default function BaoCao() {
  const homNay = new Date();
  const truoc = new Date(Date.now() - 29 * 864e5);
  const [tu, setTu] = useState(iso(truoc));
  const [den, setDen] = useState(iso(homNay));
  const [tong, setTong] = useState(null);
  const [rows, setRows] = useState([]);
  const [kpi, setKpi] = useState([]);
  const [xem, setXem] = useState('SLA');   // SLA | TUAN_THU
  const [busy, setBusy] = useState(false);

  const tai = async () => {
    setBusy(true);
    const [{ data: t }, { data: r }, { data: k }] = await Promise.all([
      sb.rpc('fn_bao_cao_tong', { p_tu: tu, p_den: den }),
      sb.rpc('fn_bao_cao_leadtime', { p_tu: tu, p_den: den }),
      sb.rpc('fn_kpi_tuan_thu', { p_tu: tu, p_den: den }),
    ]);
    setTong(t || {}); setRows(r || []); setKpi(k || []); setBusy(false);
  };
  useEffect(() => { tai(); }, []);

  const tyLeSla = tong && (tong.dat_sla_kho + tong.tre_sla_kho) > 0
    ? Math.round(tong.dat_sla_kho * 100 / (tong.dat_sla_kho + tong.tre_sla_kho)) : null;

  return (
    <>
      <div className="cmdbar">
        <h1>Báo cáo tốc độ xử lý</h1>
        <div className="sub">Đo toàn bộ thời gian từ lúc cửa hàng xin đến lúc nhận hàng — tiêu chí cốt lõi của dự án.</div>
        <div className="row">
          <DateBox label="Từ" value={tu} onChange={setTu} />
          <DateBox label="Đến" value={den} onChange={setDen} />
          <button className="btn" disabled={busy}
            style={{ background: 'rgba(255,255,255,.16)', color: '#fff' }}
            onClick={tai}><IcRefresh /> {busy ? 'Đang tải…' : 'Xem'}</button>
          <button className="btn" onClick={() => setXem('SLA')}
            style={{ background: xem === 'SLA' ? '#fff' : 'rgba(255,255,255,.16)', color: xem === 'SLA' ? 'var(--ink)' : '#fff' }}>
            Tốc độ xử lý</button>
          <button className="btn" onClick={() => setXem('TUAN_THU')}
            style={{ background: xem === 'TUAN_THU' ? '#fff' : 'rgba(255,255,255,.16)', color: xem === 'TUAN_THU' ? 'var(--ink)' : '#fff' }}>
            Tuân thủ cửa hàng</button>
        </div>
      </div>

      {xem === 'SLA' && tong && (
        <div className="pipe" style={{ marginBottom: 16 }}>
          <div className="stage"><div className="n">{tong.tong_don ?? 0}</div><div className="t">Tổng đơn</div></div>
          <div className="stage"><div className="n">{tong.da_nhan ?? 0}</div><div className="t">Đã nhận</div></div>
          <div className="stage"><div className="n">{tong.dang_chay ?? 0}</div><div className="t">Đang chạy</div></div>
          <div className={'stage' + (tyLeSla !== null && tyLeSla < 90 ? ' hot' : '')}>
            <div className="n">{tyLeSla !== null ? tyLeSla + '%' : '—'}</div>
            <div className="t">Đạt SLA kho</div></div>
          <div className="stage"><div className="n">{tong.gio_bangiao_tb ?? '—'}</div><div className="t">Giờ đến bàn giao (TB)</div></div>
          <div className="stage"><div className="n">{tong.ngay_nhan_tb ?? '—'}</div><div className="t">Ngày xin→nhận (TB)</div></div>
        </div>
      )}

      {xem === 'SLA' && (
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr>
            <th>Đơn</th><th>Cửa hàng</th><th>Trạng thái</th>
            <th>Gửi lúc</th><th className="num">Giờ đến bàn giao</th>
            <th className="num">Ngày xin→nhận</th><th>SLA kho</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.don_id}>
                <td className="mono">#{r.don_id}</td>
                <td><b>{r.ten_ch}</b> <span className="mono" style={{ color: 'var(--ink-2)' }}>{r.ma_ch}</span></td>
                <td>{r.trang_thai}</td>
                <td>{fmtDT(r.ngay_gui)}</td>
                <td className="num">{r.gio_den_bangiao != null ? r.gio_den_bangiao + 'h' : '—'}</td>
                <td className="num">{r.ngay_xin_den_nhan != null ? r.ngay_xin_den_nhan + ' ngày' : '—'}</td>
                <td>{r.dat_sla == null ? '—'
                  : r.dat_sla ? <span className="chip teal">Đạt</span>
                              : <span className="chip warn">Trễ</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="empty"><div className="t">Chưa có đơn trong khoảng này</div>
          <IcClock style={{ opacity: .3, margin: '10px auto 0' }} /></div>}
      </div>
      )}

      {xem === 'TUAN_THU' && (
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr>
            <th>Cửa hàng</th><th className="num">Nhóm</th>
            <th className="num">Kỳ theo lịch</th><th className="num">Gửi đúng lịch</th>
            <th className="num">Gửi trễ</th><th className="num">Khẩn cấp</th>
            <th className="num">Đủ 2 xác nhận</th><th className="num">% đúng lịch</th>
          </tr></thead>
          <tbody>
            {kpi.map((k) => (
              <tr key={k.ma_ch}>
                <td><b>{k.ten}</b> <span className="mono" style={{ color: 'var(--ink-2)' }}>{k.ma_ch}</span></td>
                <td className="num">{k.nhom_ch}</td>
                <td className="num">{k.so_ky_lich}</td>
                <td className="num">{k.so_gui_dung_lich}</td>
                <td className="num" style={k.so_gui_tre > 0 ? { color: 'var(--magenta)', fontWeight: 700 } : undefined}>{k.so_gui_tre}</td>
                <td className="num" style={k.so_khan_cap >= 3 ? { color: 'var(--magenta)', fontWeight: 700 } : undefined}>{k.so_khan_cap}</td>
                <td className="num">{k.so_du_2_xac_nhan}/{k.tong_phieu}</td>
                <td className="num">{k.ty_le_dung_lich == null ? '—'
                  : <span className={'chip ' + (k.ty_le_dung_lich >= 90 ? 'teal' : k.ty_le_dung_lich >= 70 ? 'gold' : 'warn')}>{k.ty_le_dung_lich}%</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!kpi.length && <div className="empty"><div className="t">Chưa có dữ liệu tuân thủ trong khoảng này</div></div>}
      </div>
      )}
    </>
  );
}
