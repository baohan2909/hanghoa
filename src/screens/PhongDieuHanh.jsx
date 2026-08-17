import { useEffect, useMemo, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { useApp } from '../App.jsx';

/* ============================================================
   NS COMMAND — Phòng điều hành 360°
   2 chế độ: THEO CỬA HÀNG (điểm sức khỏe) · THEO MÃ (điều chuyển).
   Backend: fn_dieu_hanh_tong / _ch / _ma_tong / _ma_ch (SQL 154-157).
   Nguyên tắc: thẻ KPI bấm = LỌC · tiêu đề cột bấm = SẮP XẾP.
============================================================ */

const BAC = (d) =>
  d >= 90 ? { h: 1, ten: 'Khỏe', mau: '#177E74', key: 'khoe' } :
  d >= 75 ? { h: 2, ten: 'Ổn', mau: '#3FB6A8', key: 'khoe' } :
  d >= 55 ? { h: 3, ten: 'Theo dõi', mau: '#CBA45A', key: 'oon' } :
  d >= 35 ? { h: 4, ten: 'Thiếu nặng', mau: '#D63384', key: 'canh' } :
            { h: 5, ten: 'Nguy kịch', mau: '#FF3B5C', key: 'nguy' };

const iso = (d) => (d || new Date()).toISOString().slice(0, 10);
const fmtNgay = (s) => s ? String(s).slice(8, 10) + '/' + String(s).slice(5, 7) : '—';
const fmtSo = (n) => (n == null || n === '—') ? '—' : Number(n).toLocaleString('vi-VN');
const fmtTien = (n) => {
  if (n == null || n === '—' || !Number(n)) return '—';
  const v = Number(n);
  if (v >= 1e9) return (v / 1e9).toFixed(1).replace('.0', '') + ' tỷ';
  if (v >= 1e6) return (v / 1e6).toFixed(1).replace('.0', '') + ' tr';
  if (v >= 1e3) return Math.round(v / 1e3) + 'k';
  return String(v);
};
// khoảng cách 2 điểm (km) — gợi ý điều chuyển gần nhất
const khoangCach = (a, b) => {
  if (a?.lat == null || b?.lat == null) return null;
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)));
};

function moPhong() {
  const KV = ['Hồ Chí Minh', 'Hà Nội', 'Tây Nam Bộ', 'Đông Nam Bộ', 'Trung Tây Nguyên', 'Bắc Trung Bộ'];
  const MA = ['MC008-TR130', 'NS008BTG-XL', 'NS012CKT-ĐN123-M', 'MC037-DN1', 'NS014EMP-TR133-L'];
  const ds = [];
  for (let i = 0; i < 205; i++) {
    const diem = Math.max(12, Math.min(99, Math.round(72 + (Math.random() - 0.5) * 74)));
    const soHet = diem < 55 ? Math.round((60 - diem) / 4) : Math.round(Math.random() * 3);
    const dm = 400 + Math.round(Math.random() * 300), ton = Math.round(dm * diem / 100);
    ds.push({
      ma_ch: 'CH0' + (5000 + i), ten: KV[i % 6].split(' ').slice(-1) + ' CH ' + (i + 1),
      khu_vuc: KV[i % 6], nhom_ch: (i % 3) + 1, diem,
      ton_dat: Math.round(diem * 0.9 + Math.random() * 10), tong_ton: ton, dm_min: dm,
      sl_thieu: Math.max(0, dm - ton), gia_tri_het: soHet * (300000 + Math.round(Math.random() * 700000)),
      so_het: soHet, ma_het_lau: soHet ? MA[i % 5] : null, ngay_het_lau: soHet ? Math.round(Math.random() * 12) : 0,
      xin_cuoi: iso(new Date(Date.now() - Math.round(Math.random() * 14) * 864e5)),
      tre_lich: diem < 55 ? Math.round(Math.random() * 3) : 0,
      lich_toi: iso(new Date(Date.now() + Math.round(Math.random() * 6) * 864e5)),
      bo_lich: diem < 45 ? 1 : 0, tuan_thu: Math.round(Math.min(100, diem + Math.random() * 20)),
      cldn: diem >= 80 ? 'A' : diem >= 65 ? 'B' : diem >= 50 ? 'C' : 'D',
    });
  }
  return ds;
}

export default function PhongDieuHanh({ chonTab }) {
  const { user } = useApp();
  const [cheDo, setCheDo] = useState('ch');
  const [ds, setDs] = useState(null);
  const [dsMa, setDsMa] = useState(null);
  const [moPhongCo, setMoPhongCo] = useState(false);
  const [loiThat, setLoiThat] = useState(null);
  const [chon, setChon] = useState(null);
  const [ho, setHo] = useState(null);
  const [hoMa, setHoMa] = useState(null);
  const [kv, setKv] = useState('ALL');
  const [nhom, setNhom] = useState('ALL');
  const [locBac, setLocBac] = useState(null);
  const [q, setQ] = useState('');
  const [sortCh, setSortCh] = useState('diem');
  const [gio, setGio] = useState(new Date());

  useEffect(() => { const t = setInterval(() => setGio(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const truoc = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = truoc; };
  }, []);

  useEffect(() => { (async () => {
    try {
      const { data, error } = await sb.rpc('fn_dieu_hanh_tong', { p_token: user.token });
      if (error) throw new Error('[' + (error.code || '?') + '] ' + (error.message || 'RPC lỗi'));
      if (!Array.isArray(data) || !data.length) throw new Error('Hàm trả về rỗng/không phải mảng');
      setDs(data); setMoPhongCo(false); setLoiThat(null);
    } catch (e) { setDs(moPhong()); setMoPhongCo(true); setLoiThat(e.message || String(e)); }
  })(); }, [user]);

  useEffect(() => { if (cheDo !== 'ma' || dsMa) return; (async () => {
    try {
      const { data, error } = await sb.rpc('fn_dieu_hanh_ma_tong', { p_token: user.token });
      if (error || !Array.isArray(data)) throw error || new Error('lỗi');
      setDsMa(data);
    } catch { setDsMa([]); }
  })(); }, [cheDo, dsMa, user]);

  const loc = useMemo(() => (ds || []).filter((c) =>
    (kv === 'ALL' || c.khu_vuc === kv) && (nhom === 'ALL' || String(c.nhom_ch) === nhom)
    && (!locBac || BAC(c.diem).key === locBac)
    && (!q || (c.ten + c.ma_ch).toLowerCase().includes(q.toLowerCase()))), [ds, kv, nhom, locBac, q]);

  const tk = useMemo(() => {
    const g = { khoe: 0, oon: 0, canh: 0, nguy: 0 };
    (ds || []).filter((c) => (kv === 'ALL' || c.khu_vuc === kv) && (nhom === 'ALL' || String(c.nhom_ch) === nhom))
      .forEach((c) => { g[BAC(c.diem).key]++; });
    return g;
  }, [ds, kv, nhom]);

  const dsSort = useMemo(() => {
    const a = [...loc];
    const cmp = { diem: (x, y) => x.diem - y.diem, so_het: (x, y) => (y.so_het || 0) - (x.so_het || 0),
      sl_thieu: (x, y) => (y.sl_thieu || 0) - (x.sl_thieu || 0), ten: (x, y) => x.ten.localeCompare(y.ten),
      xin_cuoi: (x, y) => String(x.xin_cuoi || '').localeCompare(String(y.xin_cuoi || '')) };
    return a.sort(cmp[sortCh] || cmp.diem);
  }, [loc, sortCh]);

  const luoiKV = useMemo(() => [...new Set((ds || []).map((c) => c.khu_vuc))].filter(Boolean).sort(), [ds]);

  const moHoSo = async (c) => {
    setChon(c); setHo({ ...c, ds_het: [], lich_su_xin: [], lich_toi: [], _load: true });
    try {
      const { data, error } = await sb.rpc('fn_dieu_hanh_ch', { p_token: user.token, p_ma_ch: c.ma_ch });
      if (error) throw new Error('[' + (error.code || '?') + '] ' + (error.message || 'RPC lỗi'));
      if (!data) throw new Error('null');
      const arr = (x) => Array.isArray(x) ? x : (x ? [x] : []);
      setHo({ ...c, ...data, ds_het: arr(data.ds_het), lich_su_xin: arr(data.lich_su_xin), lich_toi: arr(data.lich_toi) });
    } catch (e) {
      setHo({ ...c, _mp: true, _loi: e.message || String(e),
        ds_het: c.ma_het_lau ? [{ ma: c.ma_het_lau, gia: c.gia_tri_het, so_ngay: c.ngay_het_lau }] : [],
        lich_su_xin: c.xin_cuoi ? [{ ngay: c.xin_cuoi, trang_thai: 'DUYET', tre: !!c.tre_lich }] : [],
        lich_toi: c.lich_toi ? [c.lich_toi] : [] });
    }
  };

  const moMa = async (m) => {
    setHoMa({ ...m, ds_het: [], ds_con: [], chonHet: null, _load: true });
    try {
      const { data, error } = await sb.rpc('fn_dieu_hanh_ma_ch', { p_token: user.token, p_barcode: m.barcode });
      if (error) throw new Error('[' + (error.code || '?') + '] ' + (error.message || 'RPC lỗi'));
      const arr = (x) => Array.isArray(x) ? x : [];
      setHoMa({ ...m, ...data, ds_het: arr(data.ds_het), ds_con: arr(data.ds_con), chonHet: null });
    } catch (e) { setHoMa({ ...m, _loi: e.message || String(e), ds_het: [], ds_con: [] }); }
  };

  if (!ds) return <div className="ndh full"><div className="ndh-load">Đang mở phòng điều hành…</div></div>;

  return (
    <div className="ndh full">
      <div className="ndh-hd">
        <div className="ndh-logo">NS COMMAND<span>PHÒNG ĐIỀU HÀNH · 360°</span></div>
        <div className="ndh-che">
          <button className={cheDo === 'ch' ? 'on' : ''} onClick={() => setCheDo('ch')}>Theo cửa hàng</button>
          <button className={cheDo === 'ma' ? 'on' : ''} onClick={() => setCheDo('ma')}>Theo mã sản phẩm</button>
        </div>
        <div className="ndh-clock">{gio.toLocaleTimeString('vi-VN', { hour12: false })} · {gio.toLocaleDateString('vi-VN')}</div>
        <button className="ndh-thoat" onClick={() => chonTab && chonTab('dashboard')} title="Thoát">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          <span>Thoát</span>
        </button>
      </div>

      {moPhongCo && <div className="ndh-mp">⚙ Đang MÔ PHỎNG{loiThat ? ' — Lỗi thật: ' + loiThat : ''}. Chạy SQL backend để hiện số thật.</div>}

      {cheDo === 'ch' ? (
        <TheoCuaHang {...{ loc, dsSort, tk, kv, setKv, nhom, setNhom, luoiKV, locBac, setLocBac, q, setQ, sortCh, setSortCh, chon, moHoSo }} />
      ) : (
        <TheoMa {...{ dsMa, q, setQ, moMa }} />
      )}

      {ho && <ModalCH ho={ho} setHo={setHo} />}
      {hoMa && <ModalMa hoMa={hoMa} setHoMa={setHoMa} />}
    </div>
  );
}

/* ============ CHẾ ĐỘ THEO CỬA HÀNG ============ */
function TheoCuaHang({ loc, dsSort, tk, kv, setKv, nhom, setNhom, luoiKV, locBac, setLocBac, q, setQ, sortCh, setSortCh, chon, moHoSo }) {
  const KPI = [['khoe', tk.khoe, 'Cửa hàng khỏe (≥75đ)', 'k1'], ['oon', tk.oon, 'Cần theo dõi (55–74)', 'k2'],
    ['canh', tk.canh, 'Cảnh báo thiếu (35–54)', 'k3'], ['nguy', tk.nguy, 'NGUY KỊCH (<35đ)', 'k4']];
  const cot = [['ten', 'CỬA HÀNG'], ['diem', 'ĐIỂM'], ['so_het', 'MÃ HẾT'], ['sl_thieu', 'SL THIẾU'], ['xin_cuoi', 'XIN CUỐI']];
  return (
    <>
      <div className="ndh-loc-bar">
        <select value={kv} onChange={(e) => setKv(e.target.value)}>
          <option value="ALL">Mọi khu vực</option>{luoiKV.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <select value={nhom} onChange={(e) => setNhom(e.target.value)}>
          <option value="ALL">Mọi nhóm</option><option value="1">Nhóm 1</option><option value="2">Nhóm 2</option><option value="3">Nhóm 3</option>
        </select>
        <input placeholder="Tìm cửa hàng…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="ndh-dem">{loc.length} cửa hàng{locBac ? ' · đang lọc' : ''}</span>
      </div>

      <div className="ndh-kpis">
        {KPI.map(([k, v, t, c]) => (
          <button key={k} className={'ndh-kpi ' + c + (locBac === k ? ' active' : '')}
            onClick={() => setLocBac(locBac === k ? null : k)}>
            <div className="n">{v}</div><div className="t">{t}</div>
            {locBac === k && <div className="ndh-kpi-x">● đang lọc · bấm để bỏ</div>}
          </button>
        ))}
      </div>

      <div className="ndh-main2">
        <div className="ndh-pan">
          <h3><span className="dot" />BẢN ĐỒ NHIỆT · {loc.length} cửa hàng · màu theo điểm sức khỏe</h3>
          <div className="ndh-map">
            {loc.map((c) => { const b = BAC(c.diem); return (
              <div key={c.ma_ch} className={'ndh-o h' + b.h + (chon?.ma_ch === c.ma_ch ? ' sel' : '')}
                title={c.ten + ' (' + c.ma_ch + ') · ' + c.diem + 'đ · ' + b.ten + ' · ' + (c.so_het || 0) + ' mã hết'}
                onClick={() => moHoSo(c)}>{c.diem}</div>
            ); })}
            {!loc.length && <div className="ndh-trong">Không có cửa hàng khớp bộ lọc</div>}
          </div>
          <div className="ndh-cg">
            <span><i style={{ background: '#177E74' }} />≥90</span><span><i style={{ background: '#3FB6A8' }} />75–89</span>
            <span><i style={{ background: '#CBA45A' }} />55–74</span><span><i style={{ background: '#D63384' }} />35–54</span>
            <span><i style={{ background: '#FF3B5C' }} />&lt;35</span>
          </div>
        </div>

        <div className="ndh-pan">
          <h3><span className="dot do" />DANH SÁCH · bấm tiêu đề cột để sắp xếp</h3>
          <div className="ndh-bang">
            <div className="ndh-bhd">
              {cot.map(([k, t]) => (
                <button key={k} className={'ndh-th' + (k === 'ten' ? ' l' : '') + (sortCh === k ? ' on' : '')}
                  onClick={() => setSortCh(k)}>{t}{sortCh === k ? ' ▾' : ''}</button>
              ))}
            </div>
            <div className="ndh-brows">
              {dsSort.map((c, i) => { const b = BAC(c.diem); return (
                <div key={c.ma_ch} className={'ndh-br' + (chon?.ma_ch === c.ma_ch ? ' sel' : '')} onClick={() => moHoSo(c)}>
                  <div className="l"><span className="stt">{i + 1}</span><div><div className="tn">{c.ten}</div>
                    <div className="mc">{c.ma_ch} · {c.khu_vuc}</div></div></div>
                  <div className="dm" style={{ color: b.mau }}>{c.diem}</div>
                  <div className="v">{fmtSo(c.so_het)}</div>
                  <div className="v">{fmtSo(c.sl_thieu)}</div>
                  <div className="v nho">{fmtNgay(c.xin_cuoi)}</div>
                </div>
              ); })}
              {!dsSort.length && <div className="ndh-trong">Không có cửa hàng khớp bộ lọc</div>}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ============ CHẾ ĐỘ THEO MÃ ============ */
function TheoMa({ dsMa, q, setQ, moMa }) {
  const loc = useMemo(() => (dsMa || []).filter((m) =>
    !q || (m.ma + m.barcode).toLowerCase().includes(q.toLowerCase())), [dsMa, q]);
  if (!dsMa) return <div className="ndh-load">Đang tải tổng hợp theo mã…</div>;
  return (
    <>
      <div className="ndh-loc-bar">
        <input placeholder="Tìm mã sản phẩm…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="ndh-dem">{loc.length} mã đang hết trên toàn hệ thống</span>
      </div>
      <div className="ndh-pan">
        <h3><span className="dot do" />MÃ ĐANG HẾT TOÀN HỆ THỐNG · sắp theo số cửa hàng hết · bấm mã để điều chuyển</h3>
        <div className="ndh-bang">
          <div className="ndh-bhd ma">
            <div className="ndh-th l">MÃ SẢN PHẨM</div><div className="ndh-th">GIÁ</div>
            <div className="ndh-th">CH ĐANG HẾT</div><div className="ndh-th">CH CÒN HÀNG</div><div className="ndh-th">TỒN CÒN</div>
          </div>
          <div className="ndh-brows">
            {loc.map((m, i) => (
              <div key={m.barcode} className="ndh-br ma" onClick={() => moMa(m)}>
                <div className="l"><span className="stt">{i + 1}</span><div className="tn ma-code">{m.ma}</div></div>
                <div className="v gia">{fmtTien(m.gia)}</div>
                <div className="v"><span className="ndh-badge do">{m.so_ch_het}</span></div>
                <div className="v"><span className={'ndh-badge' + (m.so_ch_con ? ' teal' : ' xam')}>{m.so_ch_con}</span></div>
                <div className="v">{fmtSo(m.tong_ton_con)}</div>
              </div>
            ))}
            {!loc.length && <div className="ndh-trong">Không có mã nào đang hết 👍</div>}
          </div>
        </div>
      </div>
    </>
  );
}

/* ============ MODAL HỒ SƠ CỬA HÀNG ============ */
function ModalCH({ ho, setHo }) {
  const b = BAC(ho.diem);
  return (
    <div className="ndh-modal" onClick={() => setHo(null)}>
      <div className="ndh-mbox" onClick={(e) => e.stopPropagation()}>
        <div className="ndh-mhd">
          <div><div className="ndh-mten">{ho.ten}</div>
            <div className="ndh-msub">{ho.ma_ch} · {ho.khu_vuc} · Nhóm {ho.nhom_ch}{ho.chu_ky_ngay ? ` · chu kỳ ${ho.chu_ky_ngay}n` : ''}</div></div>
          <div className="ndh-mdiem" style={{ color: b.mau, borderColor: b.mau }}><span>{ho.diem}</span><small>{b.ten}</small></div>
          <button className="ndh-mx" onClick={() => setHo(null)}>✕</button>
        </div>
        {ho._mp && <div className="ndh-mp" style={{ margin: '0 0 12px' }}>⚙ Chi tiết mô phỏng{ho._loi ? ' — Lỗi: ' + ho._loi : ''}.</div>}
        <div className="ndh-mkpi">
          <div className="k do"><span className="v">{fmtSo(ho.so_ma_het ?? ho.so_het)}</span><span className="l">Mã đang hết</span></div>
          <div className="k cam"><span className="v">{fmtSo(ho.sl_thieu)}</span><span className="l">SL thiếu định mức</span></div>
          <div className="k"><span className="v">{fmtSo(ho.tong_ton)}</span><span className="l">Tồn hiện có{ho.so_ma_ton != null ? ` · ${ho.so_ma_ton} mã` : ''}</span></div>
          <div className="k teal"><span className="v">{fmtTien(ho.gia_tri_ton)}</span><span className="l">Giá trị tồn</span></div>
        </div>
        <div className="ndh-mgrid">
          <div className="ndh-mcol">
            <h4>SẢN PHẨM ĐANG HẾT{ho.gia_tri_het > 0 ? ` · giá trị ${fmtTien(ho.gia_tri_het)}` : ''}</h4>
            {(ho.ds_het && ho.ds_het.length) ? (
              <div className="ndh-mtb-wrap"><table className="ndh-mtb">
                <thead><tr><th>Mã sản phẩm</th><th className="r">Giá</th><th className="r">Số ngày hết</th></tr></thead>
                <tbody>{ho.ds_het.map((m, i) => (
                  <tr key={i}><td className="ma">{m.ma}</td><td className="r gia">{m.gia ? fmtTien(m.gia) : '—'}</td>
                    <td className={'r ' + (m.so_ngay >= 7 ? 'do' : m.so_ngay >= 3 ? 'cam' : 'nhe')}>{m.so_ngay} ngày</td></tr>
                ))}</tbody></table></div>
            ) : <div className="ndh-trong">Không có sản phẩm nào đang hết</div>}
          </div>
          <div className="ndh-mcol">
            <h4>LỊCH SỬ ĐỀ NGHỊ · 60 ngày</h4>
            {(ho.lich_su_xin && ho.lich_su_xin.length && ho.lich_su_xin[0].ngay) ? (
              <div className="ndh-tl">{ho.lich_su_xin.filter((x) => x.ngay).slice(0, 8).map((x, i) => (
                <div key={i} className="ndh-tli"><span className={'ndh-tld' + (x.tre ? ' tre' : '')} />
                  <span className="ng">{fmtNgay(x.ngay)}</span><span className="lo">{x.tre ? 'Gửi trễ' : 'Đúng hạn'}</span>
                  <span className="tt">{x.trang_thai}</span></div>
              ))}</div>
            ) : <div className="ndh-trong">Chưa có đề nghị nào trong 60 ngày</div>}
            {Array.isArray(ho.lich_toi) && ho.lich_toi.filter(Boolean).length > 0 && (
              <div className="ndh-lichtoi">Lịch đề nghị tới: {ho.lich_toi.filter(Boolean).map(fmtNgay).join(' · ')}</div>)}
          </div>
        </div>
        <div className="ndh-mchiso">
          <div><span>Định mức tối thiểu</span><b>{fmtSo(ho.dm_min)}</b></div>
          <div><span>Đạt định mức</span><b className={ho.ton_dat < 60 ? 'xau' : 'ok'}>{ho.ton_dat != null ? ho.ton_dat + '%' : '—'}</b></div>
          <div><span>Tuân thủ lịch</span><b className={ho.tuan_thu < 70 ? 'xau' : 'ok'}>{ho.tuan_thu != null ? ho.tuan_thu + '%' : '—'}</b></div>
          <div><span>Chất lượng ĐN</span><b className={(ho.cldn >= 'C') ? 'xau' : 'ok'}>{ho.cldn || '—'}</b></div>
        </div>
      </div>
    </div>
  );
}

/* ============ MODAL CHI TIẾT MÃ (điều chuyển) ============ */
function ModalMa({ hoMa, setHoMa }) {
  const chonHet = hoMa.chonHet;
  const dsCon = useMemo(() => {
    const a = (hoMa.ds_con || []).map((c) => ({ ...c }));
    if (chonHet) { a.forEach((c) => { c._km = khoangCach(chonHet, c); }); a.sort((x, y) => (x._km ?? 1e9) - (y._km ?? 1e9)); }
    return a;
  }, [hoMa.ds_con, chonHet]);
  return (
    <div className="ndh-modal" onClick={() => setHoMa(null)}>
      <div className="ndh-mbox" onClick={(e) => e.stopPropagation()}>
        <div className="ndh-mhd">
          <div><div className="ndh-mten">{hoMa.ma}</div>
            <div className="ndh-msub">{hoMa.gia ? fmtTien(hoMa.gia) : ''} · {(hoMa.ds_het || []).length} CH hết · {(hoMa.ds_con || []).length} CH còn hàng</div></div>
          <button className="ndh-mx" onClick={() => setHoMa(null)}>✕</button>
        </div>
        {hoMa._loi && <div className="ndh-mp" style={{ margin: '0 0 12px' }}>⚙ Lỗi: {hoMa._loi}</div>}
        <div className="ndh-dc-huong">Bấm 1 cửa hàng ĐANG HẾT (trái) → danh sách CÒN HÀNG (phải) tự sắp theo khoảng cách gần nhất để điều chuyển.</div>
        <div className="ndh-mgrid">
          <div className="ndh-mcol">
            <h4>CỬA HÀNG ĐANG HẾT · {(hoMa.ds_het || []).length}</h4>
            <div className="ndh-mtb-wrap">{(hoMa.ds_het || []).map((c) => (
              <div key={c.ma_ch} className={'ndh-dc-r het' + (chonHet?.ma_ch === c.ma_ch ? ' sel' : '')}
                onClick={() => setHoMa({ ...hoMa, chonHet: c })}>
                <div><div className="tn">{c.ten}</div><div className="mc">{c.ma_ch} · {c.khu_vuc}</div></div>
                <div className="ng do">{c.so_ngay}n</div>
              </div>
            ))}{!(hoMa.ds_het || []).length && <div className="ndh-trong">—</div>}</div>
          </div>
          <div className="ndh-mcol">
            <h4>CỬA HÀNG CÒN HÀNG · {dsCon.length}{chonHet ? ' · gần ' + chonHet.ten + ' nhất' : ''}</h4>
            <div className="ndh-mtb-wrap">{dsCon.map((c) => (
              <div key={c.ma_ch} className="ndh-dc-r con">
                <div><div className="tn">{c.ten}</div><div className="mc">{c.ma_ch} · {c.khu_vuc}</div></div>
                <div className="ndh-dc-r-r"><span className="ton">tồn {fmtSo(c.ton)}</span>
                  {c._km != null && <span className="km">{c._km} km</span>}</div>
              </div>
            ))}{!dsCon.length && <div className="ndh-trong">Không có CH nào còn hàng để điều chuyển</div>}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
