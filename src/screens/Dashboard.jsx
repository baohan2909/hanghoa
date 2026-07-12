import { useEffect, useState } from 'react';
import { sb, fmtDT, TRANG_THAI } from '../lib/supabase.js';
import { IcAlert, IcRefresh, IcClock } from '../lib/icons.jsx';

const STAGES = ['GUI','XUAT_FILE','LEN_ODOO','KHO_NHAN','KHO_LAY','BAN_GIAO_VC','DANG_GIAO','DA_NHAN'];

export default function Dashboard() {
  const [pipe, setPipe] = useState({});
  const [quaHan, setQuaHan] = useState([]);
  const [chuaGui, setChuaGui] = useState([]);
  const [homNay, setHomNay] = useState(0);

  const tai = async () => {
    const { data: dons } = await sb.from('don_xin_hang')
      .select('id, ma_ch, trang_thai, ngay_gui, deadline_kho, cua_hang(ten)')
      .neq('trang_thai', 'NHAP').order('ngay_gui', { ascending: false }).limit(500);
    const p = {}; STAGES.forEach((s) => (p[s] = 0));
    let hn = 0; const qh = [];
    const dau = new Date(); dau.setHours(0, 0, 0, 0);
    (dons || []).forEach((d) => {
      if (p[d.trang_thai] !== undefined) p[d.trang_thai]++;
      if (new Date(d.ngay_gui) >= dau) hn++;
      if (d.deadline_kho && new Date(d.deadline_kho) < new Date()
        && !['BAN_GIAO_VC','DANG_GIAO','DA_NHAN','HOAN'].includes(d.trang_thai)) qh.push(d);
    });
    setPipe(p); setHomNay(hn); setQuaHan(qh);
    const isoHN = new Date().toISOString().slice(0, 10);
    const { data: lich } = await sb.rpc('fn_lich_ngay', { p_ngay: isoHN });
    setChuaGui((lich || []).filter((r) => !r.da_gui));
  };
  useEffect(() => { tai(); const t = setInterval(tai, 60000); return () => clearInterval(t); }, []);

  return (
    <>
      <div className="cmdbar">
        <h1>Tổng quan điều phối</h1>
        <div className="sub">SLA: gửi hôm nay — kho bàn giao vận chuyển trong ngày làm việc kế tiếp</div>
        <div className="row">
          <span className="sla-chip"><IcClock /> {homNay} đơn hôm nay</span>
          <span className="sla-chip" style={quaHan.length ? { background: 'rgba(214,0,108,.35)' } : undefined}>
            <IcAlert /> {quaHan.length} quá hạn</span>
          <button className="btn" style={{ background: 'rgba(255,255,255,.16)', color: '#fff' }}
            onClick={tai}><IcRefresh /> Làm mới</button>
        </div>
      </div>

      <div className="pipe" style={{ marginBottom: 16 }}>
        {STAGES.map((s) => (
          <div key={s} className={'stage' + (s === 'GUI' && pipe[s] > 0 ? ' hot' : '')}>
            <div className="n">{pipe[s] ?? 0}</div>
            <div className="t">{TRANG_THAI[s]}</div>
          </div>
        ))}
      </div>

      <div className="grid2">
        <div className="card">
          <h3 style={{ fontSize: 15, marginBottom: 10, color: 'var(--magenta)' }}>Đơn quá hạn SLA</h3>
          {quaHan.length ? quaHan.map((d) => (
            <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between',
              padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
              <span><b className="mono">#{d.id}</b> {d.cua_hang?.ten} — {TRANG_THAI[d.trang_thai]}</span>
              <span className="mono" style={{ color: 'var(--magenta)' }}>{fmtDT(d.deadline_kho)}</span>
            </div>
          )) : <div style={{ color: 'var(--ink-2)', fontSize: 13 }}>Không có đơn quá hạn. Giữ nhịp này.</div>}
        </div>
        <div className="card">
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>Đến lịch hôm nay — chưa gửi</h3>
          {chuaGui.length ? chuaGui.map((c) => (
            <div key={c.ma_ch} style={{ display: 'flex', justifyContent: 'space-between',
              padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
              <span><b className="mono">{c.ma_ch}</b> {c.ten} <span style={{ color: 'var(--ink-2)' }}>· Nhóm {c.nhom_ch}</span></span>
            </div>
          )) : <div style={{ color: 'var(--ink-2)', fontSize: 13 }}>Tất cả cửa hàng đến lịch hôm nay đã gửi.</div>}
        </div>
      </div>
    </>
  );
}
