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
const fmtSo = (n) => (n == null || n === '—') ? '—' : Number(n).toLocaleString('vi-VN');
const fmtTien = (n) => {
  if (n == null || n === '—' || !Number(n)) return '—';
  const v = Number(n);
  if (v >= 1e9) return (v / 1e9).toFixed(1).replace('.0', '') + ' tỷ';
  if (v >= 1e6) return (v / 1e6).toFixed(1).replace('.0', '') + ' tr';
  if (v >= 1e3) return Math.round(v / 1e3) + 'k';
  return String(v);
};

// ---- MÔ PHỎNG (chỉ dùng khi backend chưa sẵn sàng) ----
function moPhong() {
  const KV = ['Hồ Chí Minh', 'Hà Nội', 'Tây Nam Bộ', 'Đông Nam Bộ', 'Trung Tây Nguyên', 'Bắc Trung Bộ'];
  const MA = ['MC008-TR130', 'NS008BTG-XL', 'NS012CKT-ĐN123-M', 'MC037-DN1', 'NS014EMP-TR133-L'];
  const ds = [];
  for (let i = 0; i < 205; i++) {
    const diem = Math.max(12, Math.min(99, Math.round(72 + (Math.random() - 0.5) * 74)));
    const nhom = (i % 3) + 1;
    const soHet = diem < 55 ? Math.round((60 - diem) / 4) : Math.round(Math.random() * 3);
    const dm = 400 + Math.round(Math.random() * 300);
    const ton = Math.round(dm * diem / 100);
    ds.push({
      ma_ch: 'CH0' + (5000 + i), ten: KV[i % 6].split(' ').slice(-1) + ' CH ' + (i + 1),
      khu_vuc: KV[i % 6], nhom_ch: nhom, diem,
      ton_dat: Math.round(diem * 0.9 + Math.random() * 10), tong_ton: ton, dm_min: dm,
      sl_thieu: Math.max(0, dm - ton), gia_tri_het: soHet * (300000 + Math.round(Math.random() * 700000)),
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
  const [loiThat, setLoiThat] = useState(null);
  const [chon, setChon] = useState(null);   // cửa hàng đang xem hồ sơ nhanh
  const [ho, setHo] = useState(null);       // hồ sơ 360° chi tiết (modal)
  const [hoTai, setHoTai] = useState(false);
  const [kv, setKv] = useState('ALL');
  const [nhom, setNhom] = useState('ALL');
  const [gio, setGio] = useState(new Date());

  const moHoSo = async (c) => {
    setChon(c); setHo({ ...c, ds_het: [], lich_su_xin: [], lich_toi: [], _load: true }); setHoTai(true); setLoiThat(null);
    try {
      const { data, error } = await sb.rpc('fn_dieu_hanh_ch', { p_token: user.token, p_ma_ch: c.ma_ch });
      if (error) throw new Error('[' + (error.code || '?') + '] ' + (error.message || 'RPC lỗi'));
      if (!data) throw new Error('Hàm trả về null');
      const arr = (x) => Array.isArray(x) ? x : (x ? [x] : []);
      setHo({ ...c, ...data, ds_het: arr(data.ds_het), lich_su_xin: arr(data.lich_su_xin), lich_toi: arr(data.lich_toi), _loi: null });
    } catch (e) {
      // rơi mô phỏng chi tiết — GHI lỗi thật để chẩn đoán
      setHo({ ...c, _mp: true, _loi: e.message || String(e),
        ds_het: c.ma_het_lau ? [{ ma: c.ma_het_lau, gia: c.gia_tri_het, so_ngay: c.ngay_het_lau }] : [],
        lich_su_xin: c.xin_cuoi ? [{ ngay: c.xin_cuoi, trang_thai: 'DUYET', tre: !!c.tre_lich }] : [],
        lich_toi: c.lich_toi ? [c.lich_toi] : [] });
    }
    setHoTai(false);
  };

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
      if (error) throw new Error('[' + (error.code || '?') + '] ' + (error.message || error.hint || 'RPC lỗi'));
      if (data == null) throw new Error('Hàm trả về null — kiểm quyền hoặc token');
      if (!Array.isArray(data)) throw new Error('Hàm trả về không phải mảng (kiểu ' + typeof data + ')');
      if (!data.length) throw new Error('Hàm trả về rỗng — chưa có cửa hàng hoạt động khớp điều kiện');
      setDs(data); setMoPhongCo(false); setLoiThat(null);
    } catch (e) {
      setDs(moPhong()); setMoPhongCo(true); setLoiThat(e.message || String(e));   // rơi về mô phỏng, GHI lỗi thật
    }
  })(); }, [user]);

  const loc = useMemo(() => (ds || []).filter((c) =>
    (kv === 'ALL' || c.khu_vuc === kv) && (nhom === 'ALL' || String(c.nhom_ch) === nhom)), [ds, kv, nhom]);

  const tk = useMemo(() => {
    const g = { khoe: 0, oon: 0, canh: 0, nguy: 0 };
    loc.forEach((c) => { const b = BAC(c.diem).h; if (b <= 2) g.khoe++; else if (b === 3) g.oon++; else if (b === 4) g.canh++; else g.nguy++; });
    return g;
  }, [loc]);

  const [topSap, setTopSap] = useState('diem');
  const top = useMemo(() => {
    const arr = [...loc];
    if (topSap === 'so_het') arr.sort((a, b) => (b.so_het || 0) - (a.so_het || 0) || a.diem - b.diem);
    else if (topSap === 'sl_thieu') arr.sort((a, b) => (b.sl_thieu || 0) - (a.sl_thieu || 0) || a.diem - b.diem);
    else arr.sort((a, b) => a.diem - b.diem);
    return arr.slice(0, 20);
  }, [loc, topSap]);
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

      {moPhongCo && <div className="ndh-mp">⚙ Đang hiển thị dữ liệu MÔ PHỎNG{loiThat ? ' — Lỗi thật: ' + loiThat : ''}. Cần chạy SQL backend fn_dieu_hanh_tong (schema chiahang) để hiện số thật.</div>}

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
                title={c.ten + ' · ' + c.diem + 'đ · ' + b.ten} onClick={() => moHoSo(c)}>{c.diem}</div>
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
          <h3><span className="dot do" />TOP THIẾU HÀNG · {topSap === 'diem' ? 'điểm thấp nhất' : topSap === 'so_het' ? 'nhiều mã hết nhất' : 'thiếu nhiều nhất'}
            <span className="ndh-sap">
              <button className={topSap === 'diem' ? 'on' : ''} onClick={() => setTopSap('diem')}>Điểm</button>
              <button className={topSap === 'so_het' ? 'on' : ''} onClick={() => setTopSap('so_het')}>Mã hết</button>
              <button className={topSap === 'sl_thieu' ? 'on' : ''} onClick={() => setTopSap('sl_thieu')}>SL thiếu</button>
            </span>
          </h3>
          <div className="ndh-nk">
            {top.map((c, i) => { const b = BAC(c.diem); return (
              <div key={c.ma_ch} className={'ndh-nkr' + (chon?.ma_ch === c.ma_ch ? ' sel' : '')} onClick={() => moHoSo(c)}>
                <div className="h">{i + 1}</div>
                <div className="mid">
                  <div className="ten">{c.ten} <span className="ndh-ma">{c.ma_ch}</span></div>
                  <div className="ndh-chip-row">
                    <span className="ndh-chip diem" style={{ color: b.mau, borderColor: b.mau }}>{c.diem}đ</span>
                    <span className="ndh-chip"><b>{fmtSo(c.so_het)}</b> mã hết</span>
                    <span className="ndh-chip"><b>{fmtSo(c.sl_thieu)}</b> thiếu</span>
                    {c.gia_tri_het > 0 && <span className="ndh-chip tien">{fmtTien(c.gia_tri_het)}</span>}
                    {c.bo_lich ? <span className="ndh-chip xau">bỏ lịch</span> : null}
                  </div>
                  <div className="bar"><i style={{ width: Math.min(100, c.dm_min ? Math.round(100 * c.sl_thieu / c.dm_min) : (100 - c.diem)) + '%' }} /></div>
                </div>
                <div className="ph">Xin cuối<br /><b>{fmtNgay(c.xin_cuoi)}</b></div>
              </div>
            ); })}
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
              <div key={c.ma_ch} onClick={() => moHoSo(c)}>
                <span className="ch">{c.tuan_thu < 50 ? '🔴' : '🟡'} <b>{c.ten}</b></span>
                <span className="mo">{c.bo_lich ? 'bỏ lịch · ' : ''}{c.tre_lich ? `trễ ${c.tre_lich}n · ` : ''}tuân thủ {c.tuan_thu}%</span>
              </div>
            ))}
            {(() => { const best = [...loc].sort((a, b) => b.tuan_thu - a.tuan_thu)[0];
              return best ? <div className="best"><span className="ch">👑 <b>{best.ten}</b></span><span className="mo">tuân thủ {best.tuan_thu}% — gương mẫu</span></div> : null; })()}
          </div>
        </div>
      </div>

      {/* MODAL HỒ SƠ 360° */}
      {ho && (
        <div className="ndh-modal" onClick={() => setHo(null)}>
          <div className="ndh-mbox" onClick={(e) => e.stopPropagation()}>
            <div className="ndh-mhd">
              <div>
                <div className="ndh-mten">{ho.ten}</div>
                <div className="ndh-msub">{ho.ma_ch} · {ho.khu_vuc} · Nhóm {ho.nhom_ch}{ho.chu_ky_ngay ? ` · chu kỳ ${ho.chu_ky_ngay}n` : ''}</div>
              </div>
              {(() => { const b = BAC(ho.diem); return (
                <div className="ndh-mdiem" style={{ color: b.mau, borderColor: b.mau }}>
                  <span>{ho.diem}</span><small>{b.ten}</small>
                </div>
              ); })()}
              <button className="ndh-mx" onClick={() => setHo(null)}>✕</button>
            </div>
            {ho._mp && <div className="ndh-mp" style={{ margin: '0 0 12px' }}>⚙ Chi tiết mô phỏng{ho._loi ? ' — Lỗi: ' + ho._loi : ''}. Chạy fn_dieu_hanh_ch để hiện số thật.</div>}

            {/* HÀNG CHỈ SỐ NỔI BẬT */}
            <div className="ndh-mkpi">
              <div className="k do"><span className="v">{fmtSo(ho.so_ma_het ?? ho.so_het)}</span><span className="l">Mã đang hết</span></div>
              <div className="k cam"><span className="v">{fmtSo(ho.sl_thieu)}</span><span className="l">SL thiếu định mức</span></div>
              <div className="k"><span className="v">{fmtSo(ho.tong_ton)}</span><span className="l">Tồn hiện có{ho.so_ma_ton != null ? ` · ${ho.so_ma_ton} mã` : ''}</span></div>
              <div className="k teal"><span className="v">{fmtTien(ho.gia_tri_ton)}</span><span className="l">Giá trị tồn</span></div>
            </div>

            <div className="ndh-mgrid">
              {/* SẢN PHẨM ĐANG HẾT */}
              <div className="ndh-mcol">
                <h4>SẢN PHẨM ĐANG HẾT{ho.gia_tri_het > 0 ? ` · giá trị ${fmtTien(ho.gia_tri_het)}` : ''}</h4>
                {(ho.ds_het && ho.ds_het.length) ? (
                  <div className="ndh-mtb-wrap">
                    <table className="ndh-mtb">
                      <thead><tr><th>Mã sản phẩm</th><th className="r">Giá</th><th className="r">Số ngày hết</th></tr></thead>
                      <tbody>{ho.ds_het.map((m, i) => (
                        <tr key={i}><td className="ma">{m.ma}</td>
                          <td className="r gia">{m.gia ? fmtTien(m.gia) : '—'}</td>
                          <td className={'r ' + (m.so_ngay >= 7 ? 'do' : m.so_ngay >= 3 ? 'cam' : 'nhe')}>{m.so_ngay} ngày</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : <div className="ndh-trong">Không có sản phẩm nào đang hết</div>}
              </div>

              {/* LỊCH SỬ ĐỀ NGHỊ */}
              <div className="ndh-mcol">
                <h4>LỊCH SỬ ĐỀ NGHỊ · 60 ngày</h4>
                {(ho.lich_su_xin && ho.lich_su_xin.length && ho.lich_su_xin[0].ngay) ? (
                  <div className="ndh-tl">
                    {ho.lich_su_xin.filter((x) => x.ngay).slice(0, 8).map((x, i) => (
                      <div key={i} className="ndh-tli">
                        <span className={'ndh-tld' + (x.tre ? ' tre' : '')} />
                        <span className="ng">{fmtNgay(x.ngay)}</span>
                        <span className="lo">{x.tre ? 'Gửi trễ' : 'Đúng hạn'}</span>
                        <span className="tt">{x.trang_thai}</span>
                      </div>
                    ))}
                  </div>
                ) : <div className="ndh-trong">Chưa có đề nghị nào trong 60 ngày</div>}
                {Array.isArray(ho.lich_toi) && ho.lich_toi.filter(Boolean).length > 0 && (
                  <div className="ndh-lichtoi">Lịch đề nghị tới: {ho.lich_toi.filter(Boolean).map(fmtNgay).join(' · ')}</div>
                )}
              </div>
            </div>

            {/* CHỈ SỐ ĐÁNH GIÁ */}
            <div className="ndh-mchiso">
              <div><span>Định mức tối thiểu</span><b>{fmtSo(ho.dm_min)}</b></div>
              <div><span>Đạt định mức</span><b className={ho.ton_dat < 60 ? 'xau' : 'ok'}>{ho.ton_dat != null ? ho.ton_dat + '%' : '—'}</b></div>
              <div><span>Tuân thủ lịch</span><b className={ho.tuan_thu < 70 ? 'xau' : 'ok'}>{ho.tuan_thu != null ? ho.tuan_thu + '%' : '—'}</b></div>
              <div><span>Chất lượng ĐN</span><b className={(ho.cldn >= 'C') ? 'xau' : 'ok'}>{ho.cldn || '—'}</b></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
