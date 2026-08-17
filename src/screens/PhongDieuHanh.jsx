import { useEffect, useMemo, useRef, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { useApp } from '../App.jsx';

/* ============================================================
   NS COMMAND — Phòng điều hành 360°
   Chấm mỗi cửa hàng 1 ĐIỂM SỨC KHỎE 0-100 từ 5 trụ:
   tồn/định mức · mã xương sống trống · hết hàng kéo dài ·
   tuân thủ lịch · chất lượng đề nghị.
   Backend: fn_dieu_hanh_tong / fn_dieu_hanh_ch (chạy khi có SQL);
   nếu chưa có hàm -> tự MÔ PHỎNG để anh xem giao diện trước.
============================================================ */

const BAC = (d) =>
  d >= 90 ? { h: 1, ten: 'Khỏe', mau: '#177E74' } :
  d >= 75 ? { h: 2, ten: 'Ổn', mau: '#3FB6A8' } :
  d >= 55 ? { h: 3, ten: 'Theo dõi', mau: '#CBA45A' } :
  d >= 35 ? { h: 4, ten: 'Thiếu nặng', mau: '#D63384' } :
            { h: 5, ten: 'Nguy kịch', mau: '#FF3B5C' };

const iso = (d) => (d || new Date()).toISOString().slice(0, 10);
const fmtNgay = (s) => s ? s.slice(8, 10) + '/' + s.slice(5, 7) : '—';

// ---- MÔ PHỎNG (chỉ dùng khi backend chưa sẵn sàng) ----
function moPhong() {
  const KV = ['Hồ Chí Minh', 'Hà Nội', 'Tây Nam Bộ', 'Đông Nam Bộ', 'Trung Tây Nguyên', 'Bắc Trung Bộ'];
  const MA = ['MC008-TR130', 'NS008BTG-XL', 'NS012CKT-ĐN123-M', 'MC037-DN1', 'NS014EMP-TR133-L'];
  const ds = [];
  for (let i = 0; i < 205; i++) {
    const diem = Math.max(12, Math.min(99, Math.round(72 + (Math.random() - 0.5) * 74)));
    const nhom = (i % 3) + 1;
    const soHet = diem < 55 ? Math.round((60 - diem) / 4) : Math.round(Math.random() * 3);
    ds.push({
      ma_ch: 'CH0' + (5000 + i), ten: KV[i % 6].split(' ').slice(-1) + ' CH ' + (i + 1),
      khu_vuc: KV[i % 6], nhom_ch: nhom, diem,
      ton_dat: Math.round(diem * 0.9 + Math.random() * 10),
      so_het: soHet, ma_het_lau: soHet ? MA[i % 5] : null, ngay_het_lau: soHet ? Math.round(Math.random() * 12) : 0,
      xin_cuoi: iso(new Date(Date.now() - Math.round(Math.random() * 14) * 864e5)),
      tre_lich: diem < 55 ? Math.round(Math.random() * 3) : 0,
      lich_toi: iso(new Date(Date.now() + Math.round(Math.random() * 6) * 864e5)),
      bo_lich: diem < 45 ? 1 : 0,
      tuan_thu: Math.round(Math.min(100, diem + Math.random() * 20)),
      cldn: diem >= 80 ? 'A' : diem >= 65 ? 'B' : diem >= 50 ? 'C' : 'D',
    });
  }
  return ds;
}

export default function PhongDieuHanh({ chonTab }) {
  const { user } = useApp();
  const [ds, setDs] = useState(null);
  const [moPhongCo, setMoPhongCo] = useState(false);
  const [chon, setChon] = useState(null);   // cửa hàng đang xem hồ sơ
  const [kv, setKv] = useState('ALL');
  const [nhom, setNhom] = useState('ALL');
  const [gio, setGio] = useState(new Date());

  useEffect(() => { const t = setInterval(() => setGio(new Date()), 1000); return () => clearInterval(t); }, []);

  // TOÀN MÀN HÌNH — khóa cuộn trang nền khi phòng điều hành mở
  useEffect(() => {
    const truoc = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = truoc; };
  }, []);

  useEffect(() => { (async () => {
    try {
      const { data, error } = await sb.rpc('fn_dieu_hanh_tong', { p_token: user.token });
      if (error || !Array.isArray(data)) throw error || new Error('no data');
      setDs(data); setMoPhongCo(false);
    } catch {
      setDs(moPhong()); setMoPhongCo(true);   // chưa có backend -> mô phỏng
    }
  })(); }, [user]);

  const loc = useMemo(() => (ds || []).filter((c) =>
    (kv === 'ALL' || c.khu_vuc === kv) && (nhom === 'ALL' || String(c.nhom_ch) === nhom)), [ds, kv, nhom]);

  const tk = useMemo(() => {
    const g = { khoe: 0, oon: 0, canh: 0, nguy: 0 };
    loc.forEach((c) => { const b = BAC(c.diem).h; if (b <= 2) g.khoe++; else if (b === 3) g.oon++; else if (b === 4) g.canh++; else g.nguy++; });
    return g;
  }, [loc]);

  const top = useMemo(() => [...loc].sort((a, b) => a.diem - b.diem).slice(0, 6), [loc]);
  const luoiKV = useMemo(() => [...new Set((ds || []).map((c) => c.khu_vuc))], [ds]);

  if (!ds) return <div className="ndh full"><div className="ndh-load">Đang mở phòng điều hành…</div></div>;
  const cur = chon || top[0];

  return (
    <div className="ndh full">
      {/* HEADER */}
      <div className="ndh-hd">
        <div className="ndh-logo">NS COMMAND<span>PHÒNG ĐIỀU HÀNH · 360°</span></div>
        <div className="ndh-loc">
          <select value={kv} onChange={(e) => setKv(e.target.value)}>
            <option value="ALL">Mọi khu vực</option>
            {luoiKV.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <select value={nhom} onChange={(e) => setNhom(e.target.value)}>
            <option value="ALL">Mọi nhóm</option><option value="1">Nhóm 1</option><option value="2">Nhóm 2</option><option value="3">Nhóm 3</option>
          </select>
        </div>
        <div className="ndh-clock">{gio.toLocaleTimeString('vi-VN', { hour12: false })} · {gio.toLocaleDateString('vi-VN')}</div>
        <button className="ndh-thoat" onClick={() => chonTab && chonTab('dashboard')} title="Thoát phòng điều hành">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          <span>Thoát</span>
        </button>
      </div>

      {moPhongCo && <div className="ndh-mp">⚙ Đang hiển thị dữ liệu MÔ PHỎNG — chạy SQL backend (fn_dieu_hanh_tong) để hiện số thật.</div>}

      {/* KPI */}
      <div className="ndh-kpis">
        {[['khoe', tk.khoe, 'Cửa hàng khỏe', 'k1'], ['oon', tk.oon, 'Cần theo dõi', 'k2'], ['canh', tk.canh, 'Cảnh báo thiếu', 'k3'], ['nguy', tk.nguy, 'NGUY KỊCH', 'k4']].map(([k, v, t, c]) => (
          <div key={k} className={'ndh-kpi ' + c}><div className="n">{v}</div><div className="t">{t}</div></div>
        ))}
      </div>

      <div className="ndh-main">
        {/* HEATMAP */}
        <div className="ndh-pan">
          <h3><span className="dot" />BẢN ĐỒ NHIỆT {loc.length} CỬA HÀNG · điểm sức khỏe tồn kho</h3>
          <div className="ndh-map">
            {loc.map((c) => { const b = BAC(c.diem); return (
              <div key={c.ma_ch} className={'ndh-o h' + b.h + (chon?.ma_ch === c.ma_ch ? ' sel' : '')}
                title={c.ten + ' · ' + c.diem + 'đ · ' + b.ten} onClick={() => setChon(c)}>{c.diem}</div>
            ); })}
          </div>
          <div className="ndh-cg">
            <span><i style={{ background: '#177E74' }} />90-100</span>
            <span><i style={{ background: '#3FB6A8' }} />75-89</span>
            <span><i style={{ background: '#CBA45A' }} />55-74</span>
            <span><i style={{ background: '#D63384' }} />35-54</span>
            <span><i style={{ background: '#FF3B5C' }} />&lt;35 nguy kịch</span>
          </div>
        </div>

        {/* TOP NGUY KỊCH */}
        <div className="ndh-pan">
          <h3><span className="dot do" />TOP THIẾU HÀNG TRẦM TRỌNG</h3>
          <div className="ndh-nk">
            {top.map((c, i) => (
              <div key={c.ma_ch} className={'ndh-nkr' + (chon?.ma_ch === c.ma_ch ? ' sel' : '')} onClick={() => setChon(c)}>
                <div className="h">{i + 1}</div>
                <div className="mid">
                  <div className="ten">{c.ten} <b>· {c.diem}đ</b></div>
                  <div className="sub">{c.so_het} mã hết{c.ma_het_lau ? ` · ${c.ma_het_lau} ${c.ngay_het_lau}n` : ''}{c.bo_lich ? ' · bỏ lịch' : ''}</div>
                  <div className="bar"><i style={{ width: (100 - c.diem) + '%' }} /></div>
                </div>
                <div className="ph">Xin cuối <b>{fmtNgay(c.xin_cuoi)}</b><br />Lịch tới <b className={c.bo_lich ? 'tre' : ''}>{fmtNgay(c.lich_toi)}</b></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* HỒ SƠ NHANH + RADAR */}
      <div className="ndh-duoi">
        <div className="ndh-pan">
          <h3><span className="dot gold" />HỒ SƠ NHANH · {cur?.ten || '—'}</h3>
          {cur && (() => { const b = BAC(cur.diem); const R = 62, C = Math.PI * R, off = C * (1 - cur.diem / 100) * 0.5 + C * 0.5;
            return (
            <div className="ndh-gau">
              <svg width="150" height="112" viewBox="0 0 150 112">
                <path d="M14 100 A 62 62 0 0 1 136 100" stroke="rgba(255,255,255,.09)" strokeWidth="13" fill="none" strokeLinecap="round" />
                <path d="M14 100 A 62 62 0 0 1 136 100" stroke={b.mau} strokeWidth="13" fill="none" strokeLinecap="round"
                  strokeDasharray={C} strokeDashoffset={off} style={{ filter: `drop-shadow(0 0 6px ${b.mau})`, transition: 'stroke-dashoffset .6s' }} />
                <text x="75" y="86" textAnchor="middle" fill={b.mau} fontSize="27" fontWeight="900">{cur.diem}</text>
                <text x="75" y="103" textAnchor="middle" fill="#7A8FA6" fontSize="9">ĐIỂM SỨC KHỎE</text>
              </svg>
              <div className="ndh-tick">
                <div>Tồn đạt định mức: <b className={cur.ton_dat < 60 ? 'xau' : 'ok'}>{cur.ton_dat}%</b></div>
                <div>Hết <b className={cur.so_het ? 'xau' : 'ok'}>{cur.so_het} mã</b>{cur.ma_het_lau ? <> · lâu nhất <b className="xau">{cur.ma_het_lau} · {cur.ngay_het_lau}n</b></> : ''}</div>
                <div>Xin gần nhất: <b>{fmtNgay(cur.xin_cuoi)}</b>{cur.tre_lich ? <> · <span className="xau">trễ {cur.tre_lich}n</span></> : ''}</div>
                <div>Lịch tới: <b className={cur.bo_lich ? 'xau' : 'ok'}>{fmtNgay(cur.lich_toi)}</b> · tuân thủ <b className={cur.tuan_thu < 70 ? 'xau' : 'ok'}>{cur.tuan_thu}%</b></div>
                <div>Chất lượng ĐN: <b className={cur.cldn >= 'C' ? 'xau' : 'ok'}>{cur.cldn}</b></div>
              </div>
            </div>
          ); })()}
        </div>

        <div className="ndh-pan">
          <h3><span className="dot mag" />RADAR CHUYÊN CẦN · ai đang lơ là</h3>
          <div className="ndh-radar">
            {[...loc].filter((c) => c.bo_lich || c.tre_lich || c.tuan_thu < 70).sort((a, b) => a.tuan_thu - b.tuan_thu).slice(0, 6).map((c) => (
              <div key={c.ma_ch} onClick={() => setChon(c)}>
                <span className="ch">{c.tuan_thu < 50 ? '🔴' : '🟡'} <b>{c.ten}</b></span>
                <span className="mo">{c.bo_lich ? 'bỏ lịch · ' : ''}{c.tre_lich ? `trễ ${c.tre_lich}n · ` : ''}tuân thủ {c.tuan_thu}%</span>
              </div>
            ))}
            {(() => { const best = [...loc].sort((a, b) => b.tuan_thu - a.tuan_thu)[0];
              return best ? <div className="best"><span className="ch">👑 <b>{best.ten}</b></span><span className="mo">tuân thủ {best.tuan_thu}% — gương mẫu</span></div> : null; })()}
          </div>
        </div>
      </div>
    </div>
  );
}
