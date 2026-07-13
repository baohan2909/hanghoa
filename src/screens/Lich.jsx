import { useEffect, useMemo, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { IcClock, IcRefresh, IcGear } from '../lib/icons.jsx';
import { DateBox } from '../lib/ui.jsx';
import { useApp } from '../App.jsx';

// Màn LỊCH ĐỀ NGHỊ — điều phối/admin xem lịch cố định theo ngày, sửa lịch từng cửa hàng.
// Lịch được chốt cứng: N1 (2 ngày/tuần theo cụm), N2 (1 thứ cố định), N3 (chu kỳ 21 ngày).
const THU = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
const isoNgay = (d) => d.toISOString().slice(0, 10);

export default function Lich() {
  const { user, baoToast } = useApp();
  const [ngay, setNgay] = useState(isoNgay(new Date()));
  const [dsNgay, setDsNgay] = useState([]);
  const [busy, setBusy] = useState(false);
  const [sua, setSua] = useState(null);        // {ma_ch, ten, lich:[{tuan,thu}]}
  const [huongDan, setHuongDan] = useState(false);

  const taiNgay = async () => {
    setBusy(true);
    const { data } = await sb.rpc('fn_lich_ngay', { p_ngay: ngay });
    setDsNgay(data || []); setBusy(false);
  };
  useEffect(() => { taiNgay(); }, [ngay]);

  const theoNhom = useMemo(() => {
    const g = { 1: [], 2: [], 3: [] };
    dsNgay.forEach((r) => (g[r.nhom_ch] || (g[r.nhom_ch] = [])).push(r));
    return g;
  }, [dsNgay]);

  const moSua = async (ma_ch, ten) => {
    const { data } = await sb.from('lich_de_nghi').select('tuan, thu').eq('ma_ch', ma_ch);
    setSua({ ma_ch, ten, lich: data || [] });
  };

  const toggleThu = (tuan, thu) => setSua((s) => {
    const co = s.lich.some((l) => l.tuan === tuan && l.thu === thu);
    return { ...s, lich: co
      ? s.lich.filter((l) => !(l.tuan === tuan && l.thu === thu))
      : [...s.lich, { tuan, thu }] };
  });

  const luuSua = async () => {
    const { error } = await sb.rpc('fn_sua_lich',
      { p_token: user.token, p_ma_ch: sua.ma_ch, p_lich: sua.lich });
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    baoToast(`Đã cập nhật lịch ${sua.ma_ch}`); setSua(null); taiNgay();
  };

  const homNay = isoNgay(new Date());
  const tenThu = THU[new Date(ngay + 'T00:00').getDay()];

  return (
    <>
      <div className="cmdbar">
        <h1>Lịch đề nghị hàng hóa</h1>
        <div className="sub">Lịch cố định, lặp theo chu kỳ — chỉ đổi khi cửa hàng chuyển nhóm sức bán.</div>
        <div className="row">
          <DateBox label="Ngày" value={ngay} onChange={setNgay} />
          <span className="sla-chip"><IcClock /> {tenThu}{ngay === homNay ? ' · hôm nay' : ''}</span>
          <button className="btn" style={{ background: 'rgba(255,255,255,.16)', color: '#fff' }}
            onClick={taiNgay} disabled={busy}><IcRefresh /> {busy ? 'Đang tải…' : 'Xem'}</button>
          {(user.vai_tro === 'ADMIN' || user.vai_tro === 'DIEU_PHOI') && (
            <button className="btn btn-gold" onClick={() => setHuongDan(true)}>
              <IcGear /> Phân lịch tự động</button>
          )}
          <span className="sla-chip">{dsNgay.length} cửa hàng</span>
        </div>
      </div>

      <div className="grid2">
        {[1, 2, 3].map((nhom) => (
          <div key={nhom} className="card">
            <h3 style={{ fontSize: 14.5, marginBottom: 10 }}>
              Nhóm {nhom} <span style={{ color: 'var(--ink-2)', fontWeight: 400 }}>· {theoNhom[nhom]?.length || 0} cửa hàng</span>
            </h3>
            {!theoNhom[nhom]?.length && <div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>Không có cửa hàng nhóm này trong ngày.</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(theoNhom[nhom] || []).map((r) => (
                <div key={r.ma_ch} style={{ display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.ten}</div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--ink-2)' }}>
                      {r.ma_ch}{r.cum ? ' · ' + r.cum : ''}</div>
                  </div>
                  {r.da_gui
                    ? <span className={'chip ' + (r.gui_tre ? 'warn' : 'teal')}>{r.gui_tre ? 'Trễ' : 'Đã gửi'}</span>
                    : <span className="chip dim">Chưa gửi</span>}
                  <button className="btn btn-ghost" style={{ padding: '4px 8px' }}
                    onClick={() => moSua(r.ma_ch, r.ten)}>Sửa</button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {sua && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,33,58,.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}
          onClick={() => setSua(null)}>
          <div className="card" style={{ maxWidth: 560, width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, marginBottom: 2 }}>Sửa lịch — {sua.ten}</h3>
            <div className="mono" style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 12 }}>{sua.ma_ch}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 8 }}>
              Tuần 0 = mọi tuần (Nhóm 1, 2). Tuần 1–3 = tuần trong chu kỳ 21 ngày (Nhóm 3).
              Chọn các ô ngày đề nghị:
            </div>
            <div className="tbl-wrap" style={{ marginBottom: 12 }}>
              <table className="tbl">
                <thead><tr><th>Tuần</th>{THU.map((t) => <th key={t} className="num" style={{ fontSize: 11 }}>{t.replace('Thứ ', 'T').replace('Chủ nhật', 'CN')}</th>)}</tr></thead>
                <tbody>
                  {[0, 1, 2, 3].map((tuan) => (
                    <tr key={tuan}>
                      <td style={{ fontWeight: 600 }}>{tuan === 0 ? 'Mọi tuần' : 'Tuần ' + tuan}</td>
                      {THU.map((_, thu) => {
                        const on = sua.lich.some((l) => l.tuan === tuan && l.thu === thu);
                        return (
                          <td key={thu} className="num">
                            <button onClick={() => toggleThu(tuan, thu)}
                              style={{ width: 26, height: 26, borderRadius: 7, cursor: 'pointer',
                                border: on ? 0 : '1.5px solid var(--line)',
                                background: on ? 'var(--teal-deep)' : '#fff',
                                color: on ? '#fff' : 'var(--ink-2)', fontWeight: 700 }}>
                              {on ? '✓' : ''}</button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setSua(null)}>Hủy</button>
              <button className="btn btn-primary" style={{ flex: 2 }} onClick={luuSua}>Lưu lịch</button>
            </div>
          </div>
        </div>
      )}

      {huongDan && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,33,58,.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}
          onClick={() => setHuongDan(false)}>
          <div className="card" style={{ maxWidth: 480, width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, marginBottom: 8 }}>Phân lịch tự động toàn hệ thống</h3>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 12 }}>
              Hàm <span className="mono">fn_phan_lich_tu_dong()</span> phân toàn bộ cửa hàng vào lịch cố định
              theo kế hoạch: Nhóm 1 chia 3 cụm (15/15/10) theo sức bán, Nhóm 2 rải theo quota từng thứ,
              Nhóm 3 rải slot 21 ngày né thứ Sáu. Việc này ghi đè toàn bộ lịch hiện tại nên phải chạy
              chủ động một lần khi triển khai, không để lộ ra API.
            </div>
            <div className="card" style={{ background: 'var(--bg-2)', fontSize: 12.5 }}>
              Mở <b>Supabase → SQL Editor</b>, chạy:
              <pre className="mono" style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>
select fn_phan_lich_tu_dong();</pre>
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-2)', margin: '10px 0' }}>
              Sau khi chạy, tải lại trang này để xem lịch. Cần điền trước cột nhóm cửa hàng (1/2/3)
              trong bảng <span className="mono">cua_hang.nhom_ch</span>.
            </div>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => setHuongDan(false)}>Đã hiểu</button>
          </div>
        </div>
      )}
    </>
  );
}
