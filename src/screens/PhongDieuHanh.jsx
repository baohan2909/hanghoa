import { useEffect, useMemo, useRef, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { useApp } from '../App.jsx';

/* ================================================================
   NS COMMAND v2 — Phòng điều hành 360° (viết lại toàn bộ)
   Tư duy điều hành: nhìn 5 giây ra vấn đề → bấm 1 phát ra chuyên sâu.
   - Hero: gauge sức khỏe toàn hệ thống + 4 bậc (bấm = LỌC) + strip tổng thiệt hại
   - Khu vực: chip điểm TB từng khu vực (bấm = LỌC) → thấy ngay vùng yếu
   - Danh sách: THẺ có TÊN cửa hàng rõ ràng (lưới) hoặc BẢNG (cột bấm = SORT)
   - Drawer chuyên sâu: CẤU THÀNH ĐIỂM 4 trụ (vì sao yếu) + SP hết + lịch sử
   - Theo mã: mã hết toàn hệ thống + "CẦN SẢN XUẤT" + điều chuyển theo km
   Backend: SQL 159 (fn_dieu_hanh_tong/_ch/_ma_tong/_ma_ch — cache, không timeout)
================================================================ */

const BAC = (d) =>
  d >= 90 ? { h: 1, ten: 'Khỏe', mau: '#22F5A0' } :
  d >= 75 ? { h: 2, ten: 'Ổn định', mau: '#2DE0FF' } :
  d >= 55 ? { h: 3, ten: 'Theo dõi', mau: '#FFE83D' } :
  d >= 35 ? { h: 4, ten: 'Cảnh báo', mau: '#FF9F1C' } :
            { h: 5, ten: 'Nguy kịch', mau: '#FF2E97' };

const fmtNgay = (s) => s ? String(s).slice(8, 10) + '/' + String(s).slice(5, 7) : '—';
const fmtSo = (n) => (n == null || n === '') ? '—' : Number(n).toLocaleString('vi-VN');
const fmtTien = (n) => {
  const v = Number(n);
  if (!v) return '0';
  if (v >= 1e9) return (v / 1e9).toFixed(1).replace('.0', '') + ' tỷ';
  if (v >= 1e6) return (v / 1e6).toFixed(1).replace('.0', '') + ' tr';
  if (v >= 1e3) return Math.round(v / 1e3) + 'k';
  return String(v);
};
const khoangCach = (a, b) => {
  if (a?.lat == null || b?.lat == null) return null;
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)));
};
// 4 trụ điểm — ưu tiên số backend (SQL 159), thiếu thì ước tính từ dữ liệu có sẵn
const truDiem = (c) => ([
  { ten: 'Tồn kho / định mức', ts: '35%', v: c.diem_ton ?? c.ton_dat },
  { ten: 'Hết hàng', ts: '25%', v: c.diem_het ?? Math.max(0, 100 - (c.so_het || 0) * 8 - (c.ngay_het_lau || 0) * 3) },
  { ten: 'Kỷ luật lịch đề nghị', ts: '20%', v: c.diem_lich ?? (c.tuan_thu != null ? Math.max(0, Math.min(100, c.tuan_thu - (c.tre_lich || 0) * 10)) : null) },
  { ten: 'Chất lượng đề nghị', ts: '20%', v: c.diem_cldn ?? ({ A: 92, B: 77, C: 62, D: 45 }[c.cldn] ?? null) },
]);
// việc cần làm — nói bằng CHỮ, không bắt đọc điểm
const viecLam = (c) => {
  const v = [];
  if (c.so_het > 0) v.push({ loai: 'chuyen', txt: `Điều chuyển ${c.so_het} mã đang hết` + (c.ngay_het_lau ? ` — lâu nhất ${c.ngay_het_lau} ngày` : '') });
  if (c.ton_dat != null && c.ton_dat < 60 && c.sl_thieu > 0) v.push({ loai: 'bosung', txt: `Bổ sung ${fmtSo(c.sl_thieu)} SP — mới đạt ${c.ton_dat}% định mức` });
  if (c.bo_lich) v.push({ loai: 'nhac', txt: 'Nhắc gửi đề nghị — đang bỏ lịch kỳ này' });
  else if (c.tre_lich > 0) v.push({ loai: 'nhac', txt: `Nhắc kỷ luật — ${c.tre_lich} lần gửi trễ trong 30 ngày` });
  if (!v.length) v.push({ loai: 'ok', txt: 'Ổn định — không cần can thiệp' });
  return v;
};
// số đếm tăng dần
function useCountUp(value, ms = 650) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const to = Number(value) || 0; const t0 = performance.now(); let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return v;
}

/* ================== MÀN CHÍNH ================== */
export default function PhongDieuHanh({ chonTab }) {
  const { user } = useApp();
  const [cheDo, setCheDo] = useState('ch');
  const [ds, setDs] = useState(null);
  const [dsMa, setDsMa] = useState(null);
  const [loiTai, setLoiTai] = useState(null);
  const [capNhat, setCapNhat] = useState(null);
  const [chon, setChon] = useState(null);          // drawer cửa hàng
  const [hoMa, setHoMa] = useState(null);          // modal mã
  const [kv, setKv] = useState(null);
  const [nhom, setNhom] = useState('ALL');
  const [bac, setBac] = useState(null);            // KPI bấm = lọc bậc
  const [boLich, setBoLich] = useState(false);
  const [q, setQ] = useState(''); const [qMa, setQMa] = useState('');
  const [view, setView] = useState(() => { try { return localStorage.getItem('nd2_view') || 'grid'; } catch { return 'grid'; } });
  const [sort, setSort] = useState(() => { try { return JSON.parse(localStorage.getItem('nd2_sort')) || { key: 'diem', dir: 'asc' }; } catch { return { key: 'diem', dir: 'asc' }; } });
  const [locSX, setLocSX] = useState(false);       // theo mã: chỉ mã cần sản xuất
  const [tv, setTv] = useState(false);             // chế độ trình chiếu TV
  const [pal, setPal] = useState(false);           // bảng lệnh Ctrl+K
  const [palQ, setPalQ] = useState('');
  const [ghim, setGhim] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem('nd2_ghim')) || []); } catch { return new Set(); } });
  const [locGhim, setLocGhim] = useState(false);
  const [toast, setToast] = useState(null);
  const [gio, setGio] = useState(new Date());

  useEffect(() => { try { localStorage.setItem('nd2_view', view); } catch { /* */ } }, [view]);
  useEffect(() => { try { localStorage.setItem('nd2_sort', JSON.stringify(sort)); } catch { /* */ } }, [sort]);

  // TV: fullscreen + tự luân chuyển 3 tab mỗi 14 giây
  useEffect(() => {
    if (!tv) return;
    document.documentElement.requestFullscreen?.().catch(() => {});
    const TABS = ['ch', 'viec', 'ma'];
    const id = setInterval(() => setCheDo((c) => TABS[(TABS.indexOf(c) + 1) % TABS.length]), 14000);
    const thoatFS = () => { if (!document.fullscreenElement) setTv(false); };
    document.addEventListener('fullscreenchange', thoatFS);
    return () => { clearInterval(id); document.removeEventListener('fullscreenchange', thoatFS); document.fullscreenElement && document.exitFullscreen?.().catch(() => {}); };
  }, [tv]);

  // Ctrl+K mở bảng lệnh · lưu ghim
  useEffect(() => {
    const h = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPal(true); } };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, []);
  useEffect(() => { try { localStorage.setItem('nd2_ghim', JSON.stringify([...ghim])); } catch { /* */ } }, [ghim]);

  const thongBao = (t) => { setToast(t); clearTimeout(thongBao._id); thongBao._id = setTimeout(() => setToast(null), 2600); };
  const copyText = async (t, msg) => {
    try { await navigator.clipboard.writeText(t); thongBao(msg || 'Đã sao chép'); }
    catch {
      try { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); thongBao(msg || 'Đã sao chép'); }
      catch { thongBao('Trình duyệt chặn sao chép'); }
    }
  };
  const toggleGhim = (ma) => setGhim((g) => { const n = new Set(g); if (n.has(ma)) n.delete(ma); else n.add(ma); return n; });
  const lamMoiApp = () => { setDsMa(null); taiDs(); thongBao('Đã tải lại số liệu từ máy chủ'); };

  // BÁO CÁO 1 CLICK — văn bản dán thẳng Zalo/Telegram
  const bcCH = (c) => {
    if (!c) return;
    const b = BAC(c.diem);
    const dong = [
      `📋 BÁO CÁO CỬA HÀNG — ${c.ten} (${c.ma_ch})`,
      `${c.khu_vuc} · Nhóm ${c.nhom_ch} · ${b.ten} ${c.diem}đ`,
      `— VIỆC CẦN LÀM —`,
      ...viecLam(c).map((v) => `• ${v.txt}`),
      `— CHỈ SỐ —`,
      `• Mã đang hết: ${fmtSo(c.so_ma_het ?? c.so_het)} · SL thiếu định mức: ${fmtSo(c.sl_thieu)}`,
      `• Tồn: ${fmtSo(c.tong_ton)}${c.so_ma_ton != null ? ` (${c.so_ma_ton} mã)` : ''}${c.gia_tri_ton != null ? ` · Giá trị tồn: ${fmtSo(c.gia_tri_ton)}đ` : ''}`,
      `• Tuân thủ lịch: ${c.tuan_thu != null ? c.tuan_thu + '%' : '—'} · CLDN: ${c.cldn || '—'} · Xin cuối: ${fmtNgay(c.xin_cuoi)}`,
    ];
    if (Array.isArray(c.ds_het) && c.ds_het.length) {
      dong.push(`— SẢN PHẨM ĐANG HẾT (${c.ds_het.length}) —`);
      c.ds_het.slice(0, 10).forEach((m) => dong.push(`• ${m.ma}${m.gia ? ` · ${fmtSo(m.gia)}đ` : ''} · hết ${m.so_ngay} ngày`));
      if (c.ds_het.length > 10) dong.push(`… và ${c.ds_het.length - 10} mã khác`);
    }
    dong.push(`(NS COMMAND · ${gio.toLocaleTimeString('vi-VN', { hour12: false }).slice(0, 5)} ${gio.toLocaleDateString('vi-VN')})`);
    copyText(dong.join('\n'), 'Đã sao chép báo cáo cửa hàng — dán vào Zalo/Telegram');
  };
  const bcViec = () => {
    const sx = (dsMa || []).filter((m) => !m.so_ch_con);
    const dc = (dsMa || []).filter((m) => m.so_ch_het >= 2 && m.so_ch_con > 0);
    const nh = (ds || []).filter((c) => c.bo_lich || c.tre_lich > 0);
    const bs = (ds || []).filter((c) => c.ton_dat != null && c.ton_dat < 50 && c.sl_thieu > 0).sort((a, b) => b.sl_thieu - a.sl_thieu);
    const kk = (tt, arr, fm) => arr.length ? [`— ${tt} (${arr.length}) —`, ...arr.slice(0, 10).map(fm), ...(arr.length > 10 ? [`… và ${arr.length - 10} mục khác`] : [])] : [];
    const dong = [
      `📋 VIỆC CẦN XỬ LÝ — NS COMMAND (${gio.toLocaleDateString('vi-VN')} ${gio.toLocaleTimeString('vi-VN', { hour12: false }).slice(0, 5)})`,
      ...kk('⚑ CẦN SẢN XUẤT / NHẬP', sx, (m) => `• ${m.ma} — hết ở ${m.so_ch_het} CH, không nơi nào còn`),
      ...kk('⇄ ĐIỀU CHUYỂN', dc, (m) => `• ${m.ma} — ${m.so_ch_het} CH hết · ${m.so_ch_con} CH còn (tồn ${fmtSo(m.tong_ton_con)})`),
      ...kk('✉ NHẮC KỶ LUẬT', nh, (c) => `• ${c.ten} (${c.ma_ch}) — ${c.bo_lich ? 'bỏ lịch kỳ này' : c.tre_lich + ' lần trễ'} · xin cuối ${fmtNgay(c.xin_cuoi)}`),
      ...kk('▲ BỔ SUNG TỒN GẤP', bs, (c) => `• ${c.ten} (${c.ma_ch}) — thiếu ${fmtSo(c.sl_thieu)} SP, đạt ${c.ton_dat}%`),
    ];
    copyText(dong.join('\n'), 'Đã sao chép báo cáo việc — dán vào Zalo/Telegram');
  };

  useEffect(() => { const t = setInterval(() => setGio(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const truoc = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = truoc; };
  }, []);

  const taiDs = async () => {
    setLoiTai(null);
    try {
      const { data, error } = await sb.rpc('fn_dieu_hanh_tong', { p_token: user.token });
      if (error) throw new Error('[' + (error.code || '?') + '] ' + (error.message || 'RPC lỗi'));
      if (!Array.isArray(data)) throw new Error('Hàm trả về không phải mảng');
      if (!data.length) throw new Error('Chưa có dữ liệu trong cache — chạy SQL 159 (file gộp) để nạp số liệu');
      setDs(data);
      try { const { data: cc } = await sb.from('dieu_hanh_cache').select('cap_nhat').eq('id', 1).single(); if (cc?.cap_nhat) setCapNhat(cc.cap_nhat); } catch { /* bỏ qua */ }
    } catch (e) { setDs(null); setLoiTai(e.message || String(e)); }
  };
  useEffect(() => { taiDs(); }, [user]);

  useEffect(() => { if (dsMa) return; (async () => {
    try {
      const { data, error } = await sb.rpc('fn_dieu_hanh_ma_tong', { p_token: user.token });
      if (error || !Array.isArray(data)) throw error || new Error('lỗi');
      setDsMa(data);
    } catch { setDsMa([]); }
  })(); }, [dsMa, user]);

  // đếm việc cho badge tab (phần mã chỉ đếm được sau khi dsMa tải)
  const soViec = useMemo(() => {
    const nhac = (ds || []).filter((c) => c.bo_lich || c.tre_lich > 0).length;
    const bs = (ds || []).filter((c) => c.ton_dat != null && c.ton_dat < 50 && c.sl_thieu > 0).length;
    const sx = (dsMa || []).filter((m) => !m.so_ch_con).length;
    const dc = (dsMa || []).filter((m) => m.so_ch_het >= 2 && m.so_ch_con > 0).length;
    return nhac + bs + sx + dc;
  }, [ds, dsMa]);

  /* ---- lọc + thống kê ---- */
  const locCoBan = useMemo(() => (ds || []).filter((c) =>
    (!kv || c.khu_vuc === kv) && (nhom === 'ALL' || String(c.nhom_ch) === nhom)), [ds, kv, nhom]);
  const loc = useMemo(() => locCoBan.filter((c) =>
    (!bac || BAC(c.diem).h === bac)
    && (!boLich || c.bo_lich === 1)
    && (!locGhim || ghim.has(c.ma_ch))
    && (!q || (c.ten + ' ' + c.ma_ch).toLowerCase().includes(q.toLowerCase()))), [locCoBan, bac, boLich, q, locGhim, ghim]);

  const tk = useMemo(() => {
    const g = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }; let thieu = 0, giaHet = 0, bo = 0, tongDiem = 0, chHet = 0;
    locCoBan.forEach((c) => { g[BAC(c.diem).h]++; thieu += c.sl_thieu || 0; giaHet += c.gia_tri_het || 0; bo += c.bo_lich ? 1 : 0; tongDiem += c.diem; if ((c.so_het || 0) > 0) chHet++; });
    return { g, thieu, giaHet, chHet, bo, tb: locCoBan.length ? Math.round(tongDiem / locCoBan.length) : 0, n: locCoBan.length };
  }, [locCoBan]);

  const dsKV = useMemo(() => {
    const m = {};
    (ds || []).forEach((c) => {
      if (!c.khu_vuc) return;
      (m[c.khu_vuc] = m[c.khu_vuc] || { ten: c.khu_vuc, n: 0, sum: 0, yeu: 0, nguy: 0, canh: 0, thieu: 0, giaHet: 0, het: 0, chHet: 0 });
      const x = m[c.khu_vuc]; const h = BAC(c.diem).h;
      x.n++; x.sum += c.diem; if (c.diem < 55) x.yeu++;
      if (h === 5) x.nguy++; if (h === 4) x.canh++;
      x.thieu += c.sl_thieu || 0; x.giaHet += c.gia_tri_het || 0; x.het += c.so_het || 0; if ((c.so_het||0)>0) x.chHet++;
    });
    return Object.values(m).map((x) => ({ ...x, tb: Math.round(x.sum / x.n) })).sort((a, b) => a.tb - b.tb);
  }, [ds]);

  const dsSort = useMemo(() => {
    const a = [...loc]; const d = sort.dir === 'asc' ? 1 : -1;
    const get = { diem: (c) => c.diem, so_het: (c) => c.so_het || 0, sl_thieu: (c) => c.sl_thieu || 0,
      gia_tri_het: (c) => c.gia_tri_het || 0, ton_dat: (c) => c.ton_dat ?? -1, tuan_thu: (c) => c.tuan_thu ?? -1,
      ten: (c) => c.ten, xin_cuoi: (c) => c.xin_cuoi || '' }[sort.key] || ((c) => c.diem);
    a.sort((x, y) => { const gx = get(x), gy = get(y); return (gx < gy ? -1 : gx > gy ? 1 : 0) * d; });
    return ghim.size ? [...a.filter((c) => ghim.has(c.ma_ch)), ...a.filter((c) => !ghim.has(c.ma_ch))] : a;
  }, [loc, sort, ghim]);

  const bamCot = (key, dirMacDinh) => setSort((s) => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: dirMacDinh });
  const coLoc = kv || bac || boLich || q || nhom !== 'ALL';
  const xoaLoc = () => { setKv(null); setBac(null); setBoLich(false); setQ(''); setNhom('ALL'); };

  /* ---- drawer chuyên sâu ---- */
  const moHoSo = async (c) => {
    setChon({ ...c, _load: true, ds_het: null, lich_su_xin: null, lich_toi: null });
    try {
      const { data, error } = await sb.rpc('fn_dieu_hanh_ch', { p_token: user.token, p_ma_ch: c.ma_ch });
      if (error) throw new Error('[' + (error.code || '?') + '] ' + (error.message || 'RPC lỗi'));
      if (!data) throw new Error('Hàm trả về null');
      const arr = (x) => Array.isArray(x) ? x : (x ? [x] : []);
      setChon((prev) => prev && prev.ma_ch === c.ma_ch
        ? { ...prev, ...data, ds_het: arr(data.ds_het), lich_su_xin: arr(data.lich_su_xin), lich_toi: arr(data.lich_toi), _load: false }
        : prev);
    } catch (e) {
      setChon((prev) => prev && prev.ma_ch === c.ma_ch
        ? { ...prev, _load: false, _loi: e.message || String(e), ds_het: [], lich_su_xin: [], lich_toi: [] } : prev);
    }
  };

  const moMa = async (m) => {
    setHoMa({ ...m, ds_het: [], ds_con: [], chonHet: null, _load: true });
    try {
      const { data, error } = await sb.rpc('fn_dieu_hanh_ma_ch', { p_token: user.token, p_barcode: m.barcode });
      if (error) throw new Error('[' + (error.code || '?') + '] ' + (error.message || 'RPC lỗi'));
      const arr = (x) => Array.isArray(x) ? x : [];
      setHoMa((prev) => prev && prev.barcode === m.barcode
        ? { ...prev, ...data, ds_het: arr(data.ds_het), ds_con: arr(data.ds_con), _load: false } : prev);
    } catch (e) { setHoMa((prev) => prev && prev.barcode === m.barcode ? { ...prev, _load: false, _loi: e.message || String(e) } : prev); }
  };

  /* ---- khung ---- */
  const Header = (
    <div className="nd2-hd">
      <div className="nd2-logo">NS COMMAND<span>PHÒNG ĐIỀU HÀNH 360°</span></div>
      <div className="nd2-tab">
        <button className={cheDo === 'ch' ? 'on' : ''} onClick={() => setCheDo('ch')}>Cửa hàng</button>
        <button className={cheDo === 'ma' ? 'on' : ''} onClick={() => setCheDo('ma')}>Mã sản phẩm</button>
        <button className={cheDo === 'viec' ? 'on' : ''} onClick={() => setCheDo('viec')}>Việc cần xử lý{soViec > 0 && <em className="bdg">{soViec}</em>}</button>
      </div>
      <div className="nd2-hd-r">
        {capNhat && <span className="nd2-capnhat" title="Số liệu tính sẵn trong cache — chạy lại SQL 159 hoặc bật pg_cron để làm mới. Đã loại hàng thu hồi khỏi mọi thống kê.">Số liệu {fmtNgay(capNhat.slice(0, 10))} · {capNhat.slice(11, 16)} · đã loại hàng thu hồi</span>}
        <button className="nd2-ic-btn" onClick={lamMoiApp} title="Tải lại số liệu">↻</button>
        <button className="nd2-ic-btn" onClick={() => setPal(true)} title="Tìm nhanh cửa hàng / mã — Ctrl+K">⌕</button>
        <span className="nd2-clock">{gio.toLocaleTimeString('vi-VN', { hour12: false }).split(':').map((x, i) => (
          i === 0 ? x : <span key={i}><i className="nhay">:</i>{x}</span>
        ))}</span>
        <button className={'nd2-tv' + (tv ? ' on' : '')} onClick={() => setTv(!tv)} title="Chế độ trình chiếu — toàn màn hình, tự luân chuyển các bảng">⛶ {tv ? 'Đang chiếu' : 'Trình chiếu'}</button>
        <button className="nd2-thoat" onClick={() => chonTab && chonTab('dashboard')}>✕ Thoát</button>
      </div>
    </div>
  );

  if (!ds) return (
    <div className="nd2">{Header}
      {loiTai ? (
        <div className="nd2-loi"><div className="ic">⚠</div><div className="tt">Chưa nạp được số liệu</div>
          <div className="ms">{loiTai}</div><button className="nd2-btn" onClick={taiDs}>Thử lại</button></div>
      ) : (
        <div className="nd2-body">
          <div className="nd2-skel-hero"><span className="nd2-skel tron" /><span className="nd2-skel o1" /><span className="nd2-skel o1" /><span className="nd2-skel o1" /><span className="nd2-skel o1" /><span className="nd2-skel o1" /></div>
          <div className="nd2-skel-grid">{Array.from({ length: 8 }).map((_, i) => <span key={i} className="nd2-skel o2" style={{ animationDelay: i * 90 + 'ms' }} />)}</div>
          <div className="nd2-loading nho"><div className="nd2-spin" />Đang kết nối phòng điều hành…</div>
        </div>
      )}
    </div>
  );

  return (
    <div className="nd2">
      <span className="nd2-orb a" /><span className="nd2-orb b" />
      {Header}
      <Ticker ds={ds} dsMa={dsMa} tk={tk} />
      <div className="nd2-fade" key={cheDo}>
      {cheDo === 'ch' ? (
        <div className="nd2-body">
          <Hero tk={tk} bac={bac} setBac={setBac} boLich={boLich} setBoLich={setBoLich} />
          <TongQuan ds={locCoBan} dsMa={dsMa} tk={tk} setBac={setBac} setKv={setKv} setBoLich={setBoLich} />
          <KhuVuc dsKV={dsKV} kv={kv} setKv={setKv} />
          <div className="nd2-bar">
            <input className="nd2-in" placeholder="Tìm tên hoặc mã cửa hàng…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="nd2-in" value={nhom} onChange={(e) => setNhom(e.target.value)}>
              <option value="ALL">Mọi nhóm</option><option value="1">Nhóm 1</option><option value="2">Nhóm 2</option><option value="3">Nhóm 3</option>
            </select>
            <select className="nd2-in" value={sort.key + '.' + sort.dir} onChange={(e) => { const [key, dir] = e.target.value.split('.'); setSort({ key, dir }); }}>
              <option value="diem.asc">Yếu nhất trước</option><option value="diem.desc">Khỏe nhất trước</option>
              <option value="so_het.desc">Nhiều mã hết nhất</option><option value="sl_thieu.desc">Thiếu SL nhiều nhất</option>
              <option value="gia_tri_het.desc">Giá trị hết cao nhất</option><option value="xin_cuoi.asc">Xin lâu nhất</option>
              <option value="ten.asc">Tên A→Z</option>
            </select>
            <div className="nd2-view">
              <button className={view === 'grid' ? 'on' : ''} onClick={() => setView('grid')} title="Lưới thẻ">▦</button>
              <button className={view === 'table' ? 'on' : ''} onClick={() => setView('table')} title="Bảng chi tiết">☰</button>
              <button className={view === 'kv' ? 'on' : ''} onClick={() => setView('kv')} title="So sánh khu vực">▤</button>
            </div>
            <button className={'nd2-ghim-btn' + (locGhim ? ' on' : '')} onClick={() => setLocGhim(!locGhim)} title="Chỉ hiện cửa hàng đang theo dõi (bấm ★ trên thẻ để ghim)">★ {ghim.size}</button>
            <span className="nd2-dem">{loc.length}/{tk.n} cửa hàng</span>
            {coLoc && <button className="nd2-xoaloc" onClick={xoaLoc}>Xóa lọc ✕</button>}
          </div>
          {view === 'grid' && <GridCH ds={dsSort} moHoSo={moHoSo} chon={chon} ghim={ghim} toggleGhim={toggleGhim} chonKV={setKv} />}
          {view === 'table' && <BangCH ds={dsSort} moHoSo={moHoSo} chon={chon} sort={sort} bamCot={bamCot} />}
          {view === 'kv' && <BangKV dsKV={dsKV} chonKV={(t) => { setKv(t); setView('grid'); }} />}
        </div>
      ) : cheDo === 'ma' ? (
        <TheoMa dsMa={dsMa} q={qMa} setQ={setQMa} locSX={locSX} setLocSX={setLocSX} moMa={moMa} />
      ) : (
        <TabViec ds={ds} dsMa={dsMa} moHoSo={moHoSo} moMa={moMa} bcViec={bcViec} />
      )}
      </div>
      <DrawerCH chon={chon} dong={() => setChon(null)} bcCH={bcCH} />
      {hoMa && <ModalMa hoMa={hoMa} setHoMa={setHoMa} />}
      {pal && <Palette ds={ds} dsMa={dsMa} q={palQ} setQ={setPalQ}
        dong={() => { setPal(false); setPalQ(''); }}
        chonCH={(c) => { setPal(false); setPalQ(''); moHoSo(c); }}
        chonMa={(m) => { setPal(false); setPalQ(''); moMa(m); }} />}
      {toast && <div className="nd2-toast">✓ {toast}</div>}
    </div>
  );
}

/* ================== TỔNG QUAN SỨC KHỎE TOÀN HỆ THỐNG ================== */
function TongQuan({ ds, dsMa, tk, setBac, setKv, setBoLich }) {
  const info = useMemo(() => {
    const n = ds.length || 1;
    const thieuTon = ds.filter((c) => c.ton_dat != null && c.ton_dat < 100).length;
    const coHet = tk.chHet;
    const boLich = tk.bo;
    const nguy = tk.g[5], canh = tk.g[4];
    const sanXuat = (dsMa || []).filter((m) => !m.so_ch_con).length;
    // khu vực yếu nhất theo số CH nguy kịch+cảnh báo
    const kvMap = {};
    ds.forEach((c) => { if (!c.khu_vuc) return; const h = BAC(c.diem).h;
      (kvMap[c.khu_vuc] = kvMap[c.khu_vuc] || { n: 0, yeu: 0 }); kvMap[c.khu_vuc].n++; if (h >= 4) kvMap[c.khu_vuc].yeu++; });
    const kvYeu = Object.entries(kvMap).map(([k, v]) => ({ k, ...v, tyLe: v.yeu / v.n })).filter((x) => x.yeu > 0).sort((a, b) => b.yeu - a.yeu)[0];

    // 4 trạng thái màu neon riêng
    const tt = [
      { key: 'het', mau: '#FF9F1C', ic: '⚠', nhan: 'Cửa hàng có mã hết', so: coHet, pc: Math.round(coHet / n * 100), loc: () => { setBac(null); setKv(null); setBoLich(false); } },
      { key: 'ton', mau: '#FF9F1C', ic: '▼', nhan: 'Thiếu tồn so định mức', so: thieuTon, pc: Math.round(thieuTon / n * 100), loc: () => {} },
      { key: 'lich', mau: '#FFE83D', ic: '✉', nhan: 'Bỏ lịch đề nghị', so: boLich, pc: Math.round(boLich / n * 100), loc: () => setBoLich(true) },
      { key: 'sx', mau: '#2DE0FF', ic: '⚑', nhan: 'Mã cần sản xuất', so: sanXuat, pc: null, loc: () => {} },
    ];

    // vấn đề nổi bật nhất
    let noiBat;
    if (nguy > 0 && nguy / n >= 0.15) noiBat = { mau: '#FF2E97', txt: `${nguy} cửa hàng đang NGUY KỊCH (${Math.round(nguy / n * 100)}% hệ thống) — cần can thiệp ngay`, loc: () => setBac(5) };
    else if (thieuTon / n >= 0.5) noiBat = { mau: '#FF9F1C', txt: `Phần lớn hệ thống thiếu tồn: ${thieuTon}/${n} cửa hàng dưới định mức (${Math.round(thieuTon / n * 100)}%)`, loc: () => {} };
    else if (coHet / n >= 0.4) noiBat = { mau: '#FF9F1C', txt: `${coHet}/${n} cửa hàng đang có mã hết (${Math.round(coHet / n * 100)}%) — ưu tiên điều chuyển & sản xuất`, loc: () => {} };
    else if (boLich / n >= 0.3) noiBat = { mau: '#FFE83D', txt: `${boLich} cửa hàng bỏ lịch đề nghị kỳ này — nhắc kỷ luật`, loc: () => setBoLich(true) };
    else if (kvYeu && kvYeu.tyLe >= 0.4) noiBat = { mau: '#FF9F1C', txt: `Khu vực ${kvYeu.k} tập trung cửa hàng yếu: ${kvYeu.yeu}/${kvYeu.n} cần chú ý`, loc: () => setKv(kvYeu.k) };
    else noiBat = { mau: '#22F5A0', txt: `Hệ thống ổn định — ${tk.g[1] + tk.g[2]}/${n} cửa hàng khỏe/ổn, không có vấn đề nổi cộm`, loc: () => {} };

    return { tt, noiBat, nguy, canh, n };
  }, [ds, dsMa, tk, setBac, setKv, setBoLich]);

  return (
    <div className="nd2-tq">
      <div className="nd2-tq-noibat" style={{ '--m': info.noiBat.mau }} onClick={info.noiBat.loc}>
        <span className="ic">◉</span>
        <div><b>VẤN ĐỀ NỔI BẬT NHẤT</b><span>{info.noiBat.txt}</span></div>
        <em>→</em>
      </div>
      <div className="nd2-tq-tt">
        {info.tt.map((t) => (
          <button key={t.key} className="nd2-tq-o" style={{ '--m': t.mau }} onClick={t.loc}>
            <span className="ic">{t.ic}</span>
            <b>{fmtSo(t.so)}</b>
            <span className="nh">{t.nhan}{t.pc != null ? ` · ${t.pc}%` : ''}</span>
            <i className="thanh"><u style={{ width: (t.pc ?? Math.min(100, t.so)) + '%' }} /></i>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ================== TICKER LIVE ================== */
function Ticker({ ds, dsMa, tk }) {
  const items = useMemo(() => {
    const t = [];
    [...(ds || [])].sort((a, b) => a.diem - b.diem).slice(0, 3).forEach((c) =>
      t.push({ m: BAC(c.diem).h === 5 ? 'do' : 'cam', tx: `${c.ten} (${c.ma_ch}) — ${BAC(c.diem).ten} ${c.diem}đ · ${c.so_het || 0} mã hết · thiếu ${fmtSo(c.sl_thieu)} SP` }));
    (dsMa || []).filter((m) => !m.so_ch_con).slice(0, 3).forEach((m) =>
      t.push({ m: 'cam', tx: `CẦN SẢN XUẤT ${m.ma} — hết ở ${m.so_ch_het} cửa hàng, không nơi nào còn tồn` }));
    (dsMa || []).filter((m) => m.so_ch_het >= 3 && m.so_ch_con > 0).slice(0, 2).forEach((m) =>
      t.push({ m: 'vang', tx: `ĐIỀU CHUYỂN ${m.ma} — ${m.so_ch_het} CH hết, ${m.so_ch_con} CH còn (tồn ${fmtSo(m.tong_ton_con)})` }));
    const bo = (ds || []).filter((c) => c.bo_lich).length;
    if (bo) t.push({ m: 'vang', tx: `${bo} cửa hàng đang bỏ lịch đề nghị kỳ này` });
    t.push({ m: 'teal', tx: `Toàn hệ thống: thiếu ${fmtSo(tk.thieu)} SP so định mức · ${fmtSo(tk.chHet)} cửa hàng đang có mã hết · sức khỏe TB ${tk.tb}đ` });
    return t;
  }, [ds, dsMa, tk]);
  if (!items.length) return null;
  const Noi = items.map((x, i) => <span key={i} className={'it ' + x.m}>◆ {x.tx}</span>);
  return (
    <div className="nd2-ticker">
      <span className="nd2-live">● LIVE</span>
      <div className="nd2-ticker-khung"><div className="nd2-ticker-track">{Noi}{items.map((x, i) => <span key={'b' + i} className={'it ' + x.m}>◆ {x.tx}</span>)}</div></div>
    </div>
  );
}

/* ================== HERO KPI ================== */
function Hero({ tk, bac, setBac, boLich, setBoLich }) {
  const tb = useCountUp(tk.tb); const b = BAC(tk.tb);
  const thieu = useCountUp(tk.thieu, 800);
  const chu = 2 * Math.PI * 52;
  const [p, setP] = useState(0);
  useEffect(() => { const id = requestAnimationFrame(() => setP(tk.tb)); return () => cancelAnimationFrame(id); }, [tk.tb]);
  const THE = [[5, 'Nguy kịch', '<35đ'], [4, 'Cảnh báo', '35–54'], [3, 'Theo dõi', '55–74'], [2, 'Ổn định', '75–89'], [1, 'Khỏe', '≥90']];
  return (
    <>
      <div className="nd2-hero">
        <div className="nd2-gauge-box">
          <svg viewBox="0 0 120 120" className="nd2-gauge">
            <circle cx="60" cy="60" r="52" className="rail" />
            <circle cx="60" cy="60" r="52" className="val" style={{ stroke: b.mau, strokeDasharray: `${chu * p / 100} ${chu}` }} />
          </svg>
          <div className="nd2-gauge-num"><b style={{ color: b.mau }}>{tb}</b><span>SỨC KHỎE<br />TOÀN HỆ THỐNG</span></div>
        </div>
        <div className="nd2-bacs">
          {THE.map(([h, ten, mo]) => { const mau = BAC(h === 1 ? 95 : h === 2 ? 80 : h === 3 ? 60 : h === 4 ? 45 : 20).mau; return (
            <button key={h} className={'nd2-bac b' + h + (bac === h ? ' on' : '')} style={{ '--m': mau }} onClick={() => setBac(bac === h ? null : h)}>
              <span className="n">{tk.g[h]}</span>
              <span className="t">{ten}</span><span className="m">{mo}</span>
              {bac === h && <span className="dl">● đang lọc</span>}
            </button>
          ); })}
        </div>
      </div>
      <div className="nd2-strip">
        <div className="s"><span className="v cam">{fmtSo(thieu)}</span><span className="l">SP thiếu so định mức</span></div>
        <div className="s"><span className="v vang">{fmtSo(tk.chHet)}</span><span className="l">Cửa hàng đang có mã hết</span></div>
        <button className={'s bam' + (boLich ? ' on' : '')} onClick={() => setBoLich(!boLich)}>
          <span className="v vang">{tk.bo}</span><span className="l">CH bỏ lịch đề nghị{boLich ? ' · đang lọc' : ''}</span>
        </button>
      </div>
    </>
  );
}

/* ================== KHU VỰC ================== */
function KhuVuc({ dsKV, kv, setKv }) {
  if (!dsKV.length) return null;
  return (
    <div className="nd2-kv">
      {dsKV.map((k) => { const b = BAC(k.tb); return (
        <button key={k.ten} className={'nd2-kv-chip' + (kv === k.ten ? ' on' : '')} onClick={() => setKv(kv === k.ten ? null : k.ten)}>
          <i style={{ background: b.mau }} /><b>{k.ten}</b>
          <span style={{ color: b.mau }}>{k.tb}đ</span>
          {k.yeu > 0 && <em>{k.yeu} yếu</em>}
        </button>
      ); })}
    </div>
  );
}

/* ================== LƯỚI THẺ ================== */
function GridCH({ ds, moHoSo, chon, ghim, toggleGhim, chonKV }) {
  if (!ds.length) return <div className="nd2-trong">Không có cửa hàng khớp bộ lọc</div>;
  const nghieng = (e) => {
    const el = e.currentTarget, r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.transform = `perspective(700px) rotateX(${(0.5 - y) * 5}deg) rotateY(${(x - 0.5) * 5}deg) translateY(-3px)`;
    el.style.setProperty('--mx', (x * 100) + '%'); el.style.setProperty('--my', (y * 100) + '%');
  };
  const tha = (e) => { e.currentTarget.style.transform = ''; };
  return (
    <div className="nd2-grid">
      {ds.map((c, i) => { const b = BAC(c.diem); const daGhim = ghim.has(c.ma_ch); return (
        <div key={c.ma_ch} className={'nd2-card vao b' + b.h + (chon?.ma_ch === c.ma_ch ? ' sel' : '') + (daGhim ? ' ghim' : '')}
          style={{ '--m': b.mau, animationDelay: (i < 24 ? i * 26 : 0) + 'ms' }}
          onMouseMove={nghieng} onMouseLeave={tha} onClick={() => moHoSo(c)}>
          <button className={'nd2-sao' + (daGhim ? ' on' : '')} title={daGhim ? 'Bỏ theo dõi' : 'Ghim theo dõi — nổi lên đầu danh sách'}
            onClick={(e) => { e.stopPropagation(); toggleGhim(c.ma_ch); }}>★</button>
          <div className="top">
            <div className="vong" style={{ background: `conic-gradient(${b.mau} ${c.diem}%, rgba(148,163,184,.13) 0)` }}><i>{c.diem}</i></div>
            <div className="ai">
              <div className="ten" title={c.ten}>{c.ten}</div>
              <div className="ma">{c.ma_ch} · <span className="kvlink" title="Bấm để lọc khu vực này" onClick={(e) => { e.stopPropagation(); chonKV(c.khu_vuc); }}>{c.khu_vuc}</span></div>
            </div>
            <span className="bac" style={{ color: b.mau }}>{b.ten}</span>
          </div>
          <div className="chiso">
            <span className={c.so_het > 0 ? 'xau' : ''}><b>{fmtSo(c.so_het)}</b> mã hết</span>
            <span className={c.sl_thieu > 0 ? 'cam' : ''}><b>{fmtSo(c.sl_thieu)}</b> thiếu</span>
            <span>xin <b>{fmtNgay(c.xin_cuoi)}</b></span>
          </div>
          <div className="day"><i style={{ width: Math.min(100, c.ton_dat || 0) + '%', background: b.mau }} /><span>{c.ton_dat != null ? c.ton_dat + '% định mức' : 'không định mức'}</span></div>
          <div className={'act ' + viecLam(c)[0].loai}>{viecLam(c)[0].loai === 'ok' ? '✓' : '→'} {viecLam(c)[0].txt}</div>
        </div>
      ); })}
    </div>
  );
}

/* ================== BẢNG ================== */
function BangCH({ ds, moHoSo, chon, sort, bamCot }) {
  const COT = [['ten', 'CỬA HÀNG', 'asc'], ['diem', 'ĐIỂM', 'asc'], ['ton_dat', 'TỒN/ĐM', 'asc'], ['so_het', 'MÃ HẾT', 'desc'],
    ['sl_thieu', 'SL THIẾU', 'desc'], ['tuan_thu', 'TUÂN THỦ', 'asc'], ['xin_cuoi', 'XIN CUỐI', 'asc']];
  return (
    <div className="nd2-bang">
      <div className="nd2-bhd">
        {COT.map(([k, t, dm]) => (
          <button key={k} className={'th' + (k === 'ten' ? ' l' : '') + (sort.key === k ? ' on' : '')} onClick={() => bamCot(k, dm)}>
            {t}{sort.key === k ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
          </button>
        ))}
      </div>
      <div className="nd2-brows">
        {ds.map((c, i) => { const b = BAC(c.diem); return (
          <div key={c.ma_ch} className={'nd2-br' + (chon?.ma_ch === c.ma_ch ? ' sel' : '')} onClick={() => moHoSo(c)}>
            <div className="l"><span className="stt">{i + 1}</span><span className="cham" style={{ background: b.mau }} />
              <div className="ai"><div className="ten">{c.ten}</div><div className="ma">{c.ma_ch} · {c.khu_vuc} · N{c.nhom_ch}</div></div></div>
            <div className="v diem" style={{ color: b.mau }}>{c.diem}</div>
            <div className="v">{c.ton_dat != null ? c.ton_dat + '%' : '—'}</div>
            <div className={'v' + (c.so_het > 0 ? ' xau' : '')}>{fmtSo(c.so_het)}</div>
            <div className={'v' + (c.sl_thieu > 0 ? ' cam' : '')}>{fmtSo(c.sl_thieu)}</div>
            <div className="v">{c.tuan_thu != null ? c.tuan_thu + '%' : '—'}</div>
            <div className="v mo">{fmtNgay(c.xin_cuoi)}</div>
          </div>
        ); })}
        {!ds.length && <div className="nd2-trong">Không có cửa hàng khớp bộ lọc</div>}
      </div>
    </div>
  );
}

/* ================== DRAWER CHUYÊN SÂU ================== */
function DrawerCH({ chon, dong, bcCH }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') dong(); };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [dong]);
  const b = chon ? BAC(chon.diem) : null;
  return (
    <>
      <div className={'nd2-mo' + (chon ? ' hien' : '')} onClick={dong} />
      <div className={'nd2-drawer' + (chon ? ' mo' : '')}>
        {chon && (
          <>
            <div className="nd2-d-hd">
              <div className="vong" style={{ background: `conic-gradient(${b.mau} ${chon.diem}%, rgba(148,163,184,.13) 0)` }}><i>{chon.diem}</i></div>
              <div className="ai">
                <div className="ten">{chon.ten}</div>
                <div className="ma">{chon.ma_ch} · {chon.khu_vuc} · Nhóm {chon.nhom_ch}{chon.chu_ky_ngay ? ` · chu kỳ ${chon.chu_ky_ngay} ngày` : ''}</div>
                <span className="bac" style={{ color: b.mau, borderColor: b.mau }}>{b.ten}</span>
              </div>
              <button className="x" onClick={dong}>✕</button>
            </div>
            {chon._loi && <div className="nd2-canh">⚠ Không tải được chi tiết — {chon._loi}</div>}
            <button className="nd2-copybtn" onClick={() => bcCH(chon)}>⧉ Sao chép báo cáo cửa hàng — dán Zalo/Telegram</button>

            <div className="nd2-d-kpi">
              <div className="k"><b className="do">{fmtSo(chon.so_ma_het ?? chon.so_het)}</b><span>Mã đang hết</span></div>
              <div className="k"><b className="cam">{fmtSo(chon.sl_thieu)}</b><span>SL thiếu định mức</span></div>
              <div className="k"><b>{fmtSo(chon.tong_ton)}</b><span>Tồn hiện có{chon.so_ma_ton != null ? ` · ${chon.so_ma_ton} mã` : ''}</span></div>
              <div className="k"><b className="teal">{chon.gia_tri_ton != null ? fmtSo(chon.gia_tri_ton) + 'đ' : '—'}</b><span>Giá trị tồn</span></div>
            </div>

            <div className="nd2-d-sec">
              <h4>VIỆC CẦN LÀM</h4>
              <div className="nd2-act-ds">
                {viecLam(chon).map((v, i) => (
                  <div key={i} className={'nd2-act-i ' + v.loai}>{v.loai === 'ok' ? '✓' : '→'} {v.txt}</div>
                ))}
              </div>
            </div>

            <div className="nd2-d-sec">
              <h4>CẤU THÀNH ĐIỂM · vì sao {chon.diem} điểm</h4>
              <div className="nd2-tru">
                {truDiem(chon).map((t, i) => { const m = t.v == null ? '#64748B' : BAC(t.v).mau; return (
                  <div key={i} className="hang">
                    <span className="ten">{t.ten} <em>{t.ts}</em></span>
                    <span className="bar"><i style={{ width: (t.v ?? 0) + '%', background: m, animationDelay: (i * 90) + 'ms' }} /></span>
                    <b style={{ color: m }}>{t.v == null ? '—' : t.v}</b>
                  </div>
                ); })}
              </div>
            </div>

            <div className="nd2-d-sec">
              <h4>SẢN PHẨM ĐANG HẾT{chon.so_ma_het ? ` · ${chon.so_ma_het} mã` : ''}</h4>
              {chon.ds_het == null ? <div className="nd2-mini-load">Đang tải…</div>
                : chon.ds_het.length ? (
                  <div className="nd2-cuon">
                    <table className="nd2-tb"><thead><tr><th>Mã sản phẩm</th><th className="r">Giá</th><th className="r">Đã hết</th></tr></thead>
                      <tbody>{chon.ds_het.map((m, i) => (
                        <tr key={i}><td className="ma">{m.ma}</td><td className="r vang">{m.gia ? fmtSo(m.gia) + 'đ' : '—'}</td>
                          <td className={'r ' + (m.so_ngay >= 7 ? 'do' : m.so_ngay >= 3 ? 'cam' : 'mo')}>{m.so_ngay} ngày</td></tr>
                      ))}</tbody></table>
                  </div>
                ) : <div className="nd2-trong nho">Không có sản phẩm nào đang hết</div>}
            </div>

            <div className="nd2-d-sec">
              <h4>KỶ LUẬT ĐỀ NGHỊ · 60 ngày{chon.tuan_thu != null ? ` · tuân thủ ${chon.tuan_thu}%` : ''}</h4>
              {chon.lich_su_xin == null ? <div className="nd2-mini-load">Đang tải…</div>
                : chon.lich_su_xin.length ? (
                  <div className="nd2-tl">{chon.lich_su_xin.slice(0, 8).map((x, i) => (
                    <div key={i} className="i"><span className={'cham' + (x.tre ? ' tre' : '')} />
                      <span className="ng">{fmtNgay(x.ngay)}</span><span className="lo">{x.tre ? 'Gửi trễ' : 'Đúng hạn'}</span>
                      <span className="tt">{x.trang_thai}</span></div>
                  ))}</div>
                ) : <div className="nd2-trong nho">Chưa có đề nghị nào trong 60 ngày</div>}
              {Array.isArray(chon.lich_toi) && chon.lich_toi.filter(Boolean).length > 0 && (
                <div className="nd2-lichtoi">→ Lịch đề nghị tới: <b>{chon.lich_toi.filter(Boolean).map(fmtNgay).join(' · ')}</b></div>)}
            </div>
          </>
        )}
      </div>
    </>
  );
}

/* ================== THEO MÃ ================== */
function TheoMa({ dsMa, q, setQ, locSX, setLocSX, moMa }) {
  const canSX = useMemo(() => (dsMa || []).filter((m) => !m.so_ch_con).length, [dsMa]);
  const loc = useMemo(() => (dsMa || []).filter((m) =>
    (!locSX || !m.so_ch_con) && (!q || (m.ma + ' ' + m.barcode).toLowerCase().includes(q.toLowerCase()))), [dsMa, q, locSX]);
  if (!dsMa) return <div className="nd2-body"><div className="nd2-loading"><div className="nd2-spin" />Đang tải tổng hợp theo mã…</div></div>;
  return (
    <div className="nd2-body">
      <div className="nd2-strip">
        <div className="s"><span className="v do">{dsMa.length}</span><span className="l">Mã đang hết toàn hệ thống</span></div>
        <div className="s"><span className="v vang">{dsMa.filter((m) => m.so_ch_het >= 3).length}</span><span className="l">Mã hết ở ≥3 cửa hàng</span></div>
        <button className={'s bam' + (locSX ? ' on' : '')} onClick={() => setLocSX(!locSX)}>
          <span className="v cam">{canSX}</span><span className="l">CẦN SẢN XUẤT — không CH nào còn{locSX ? ' · đang lọc' : ''}</span>
        </button>
      </div>
      <div className="nd2-bar">
        <input className="nd2-in" placeholder="Tìm mã sản phẩm…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="nd2-dem">{loc.length} mã · bấm mã để mở bảng điều chuyển</span>
      </div>
      <div className="nd2-bang">
        <div className="nd2-bhd ma">
          <div className="th l">MÃ SẢN PHẨM</div><div className="th">GIÁ</div><div className="th">CH HẾT</div><div className="th">CH CÒN</div><div className="th">TỒN CÒN</div>
        </div>
        <div className="nd2-brows">
          {loc.map((m, i) => (
            <div key={m.barcode} className="nd2-br ma" onClick={() => moMa(m)}>
              <div className="l"><span className="stt">{i + 1}</span><div className="ai"><div className="ten code">{m.ma}</div>
                {!m.so_ch_con && <div className="ma sx">⚑ cần sản xuất — không nơi nào còn hàng</div>}</div></div>
              <div className="v vang">{m.gia ? fmtSo(m.gia) + 'đ' : '—'}</div>
              <div className="v"><span className="bg do">{m.so_ch_het}</span></div>
              <div className="v"><span className={'bg ' + (m.so_ch_con ? 'teal' : 'xam')}>{m.so_ch_con}</span></div>
              <div className="v">{fmtSo(m.tong_ton_con)}</div>
            </div>
          ))}
          {!loc.length && <div className="nd2-trong">Không có mã nào khớp</div>}
        </div>
      </div>
    </div>
  );
}

/* ================== BẢNG LỆNH Ctrl+K ================== */
function Palette({ ds, dsMa, q, setQ, dong, chonCH, chonMa }) {
  const oRef = useRef(null);
  useEffect(() => {
    oRef.current?.focus();
    const h = (e) => { if (e.key === 'Escape') dong(); };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [dong]);
  const kq = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const ch = qq
      ? (ds || []).filter((c) => (c.ten + ' ' + c.ma_ch).toLowerCase().includes(qq)).slice(0, 7)
      : [...(ds || [])].sort((a, b) => a.diem - b.diem).slice(0, 6);
    const ma = qq
      ? (dsMa || []).filter((m) => (m.ma + ' ' + m.barcode).toLowerCase().includes(qq)).slice(0, 5)
      : (dsMa || []).slice(0, 4);
    return { ch, ma };
  }, [ds, dsMa, q]);
  const enter = (e) => { if (e.key === 'Enter') { if (kq.ch[0]) chonCH(kq.ch[0]); else if (kq.ma[0]) chonMa(kq.ma[0]); } };
  return (
    <div className="nd2-mmo" onClick={dong}>
      <div className="nd2-pal" onClick={(e) => e.stopPropagation()}>
        <input ref={oRef} className="nd2-pal-in" placeholder="Gõ tên / mã cửa hàng hoặc mã sản phẩm…  (Enter = mở kết quả đầu · Esc = đóng)"
          value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={enter} />
        <div className="nd2-pal-ds">
          {kq.ch.length > 0 && <div className="nd2-pal-nh">CỬA HÀNG{!q.trim() ? ' · yếu nhất' : ''}</div>}
          {kq.ch.map((c) => { const b = BAC(c.diem); return (
            <div key={c.ma_ch} className="nd2-pal-i" onClick={() => chonCH(c)}>
              <span className="cham" style={{ background: b.mau }} />
              <b>{c.ten}</b><span className="mo">{c.ma_ch} · {c.khu_vuc}</span>
              <em style={{ color: b.mau }}>{c.diem}đ</em>
            </div>
          ); })}
          {kq.ma.length > 0 && <div className="nd2-pal-nh">MÃ SẢN PHẨM ĐANG HẾT</div>}
          {kq.ma.map((m) => (
            <div key={m.barcode} className="nd2-pal-i" onClick={() => chonMa(m)}>
              <span className="cham" style={{ background: '#F0409A' }} />
              <b className="code">{m.ma}</b><span className="mo">{m.so_ch_het} CH hết · {m.so_ch_con} CH còn</span>
              <em className="vang">{m.gia ? fmtSo(m.gia) + 'đ' : ''}</em>
            </div>
          ))}
          {!kq.ch.length && !kq.ma.length && <div className="nd2-trong nho">Không tìm thấy — thử từ khóa khác</div>}
        </div>
      </div>
    </div>
  );
}

/* ================== BẢNG SO SÁNH KHU VỰC ================== */
function BangKV({ dsKV, chonKV }) {
  if (!dsKV.length) return <div className="nd2-trong">Chưa có dữ liệu khu vực</div>;
  return (
    <div className="nd2-bang">
      <div className="nd2-bhd kv">
        <div className="th l">KHU VỰC · bấm để xem cửa hàng</div><div className="th">CH</div><div className="th">SỨC KHỎE TB</div>
        <div className="th">NGUY KỊCH</div><div className="th">CẢNH BÁO</div><div className="th">MÃ HẾT</div><div className="th">SP THIẾU</div><div className="th">CH CÓ MÃ HẾT</div>
      </div>
      <div className="nd2-brows">
        {dsKV.map((k) => { const b = BAC(k.tb); return (
          <div key={k.ten} className="nd2-br kv" onClick={() => chonKV(k.ten)}>
            <div className="l"><span className="cham" style={{ background: b.mau }} />
              <div className="ai"><div className="ten">{k.ten}</div><div className="ma">{k.yeu} cửa hàng yếu (&lt;55đ)</div></div></div>
            <div className="v">{k.n}</div>
            <div className="v diem" style={{ color: b.mau }}>{k.tb}</div>
            <div className={'v' + (k.nguy ? ' xau' : ' mo')}>{k.nguy || '—'}</div>
            <div className={'v' + (k.canh ? ' cam' : ' mo')}>{k.canh || '—'}</div>
            <div className={'v' + (k.het ? ' xau' : ' mo')}>{fmtSo(k.het)}</div>
            <div className="v cam">{fmtSo(k.thieu)}</div>
            <div className="v">{k.chHet || '—'}</div>
          </div>
        ); })}
      </div>
    </div>
  );
}

/* ================== TAB VIỆC CẦN XỬ LÝ ================== */
function TabViec({ ds, dsMa, moHoSo, moMa, bcViec }) {
  const sx = useMemo(() => (dsMa || []).filter((m) => !m.so_ch_con).sort((a, b) => b.so_ch_het - a.so_ch_het), [dsMa]);
  const dc = useMemo(() => (dsMa || []).filter((m) => m.so_ch_het >= 2 && m.so_ch_con > 0).sort((a, b) => b.so_ch_het - a.so_ch_het), [dsMa]);
  const nhac = useMemo(() => (ds || []).filter((c) => c.bo_lich || c.tre_lich > 0)
    .sort((a, b) => (b.bo_lich - a.bo_lich) || (b.tre_lich || 0) - (a.tre_lich || 0)), [ds]);
  const bs = useMemo(() => (ds || []).filter((c) => c.ton_dat != null && c.ton_dat < 50 && c.sl_thieu > 0)
    .sort((a, b) => (b.sl_thieu || 0) - (a.sl_thieu || 0)), [ds]);
  const dangTaiMa = dsMa == null;
  return (
    <div className="nd2-body">
      <div className="nd2-viec-gt"><span>Danh sách việc được tổng hợp tự động từ số liệu hiện tại — bấm từng dòng để mở chi tiết và xử lý.</span>
        <button className="nd2-copybtn nho" onClick={bcViec}>⧉ Sao chép báo cáo việc</button></div>
      <div className="nd2-viec">
        <div className="nd2-vp sx">
          <h3>⚑ CẦN SẢN XUẤT / NHẬP THÊM <em>{dangTaiMa ? '…' : sx.length}</em></h3>
          <p>Mã đang hết mà không cửa hàng nào còn tồn để điều chuyển</p>
          <div className="ds">
            {dangTaiMa ? <div className="nd2-mini-load">Đang tải…</div> : sx.length ? sx.map((m) => (
              <div key={m.barcode} className="i" onClick={() => moMa(m)}>
                <div className="ai"><b className="code">{m.ma}</b><span>hết ở {m.so_ch_het} cửa hàng{m.gia ? ` · giá ${fmtSo(m.gia)}đ` : ''}</span></div><em>→</em>
              </div>
            )) : <div className="nd2-trong nho">Không có mã nào — tốt</div>}
          </div>
        </div>
        <div className="nd2-vp dc">
          <h3>⇄ ĐIỀU CHUYỂN GIỮA CỬA HÀNG <em>{dangTaiMa ? '…' : dc.length}</em></h3>
          <p>Mã hết ở từ 2 cửa hàng trở lên nhưng nơi khác vẫn còn hàng</p>
          <div className="ds">
            {dangTaiMa ? <div className="nd2-mini-load">Đang tải…</div> : dc.length ? dc.map((m) => (
              <div key={m.barcode} className="i" onClick={() => moMa(m)}>
                <div className="ai"><b className="code">{m.ma}</b><span>{m.so_ch_het} CH hết · {m.so_ch_con} CH còn (tồn {fmtSo(m.tong_ton_con)})</span></div><em>→</em>
              </div>
            )) : <div className="nd2-trong nho">Không có mã nào cần điều chuyển gấp</div>}
          </div>
        </div>
        <div className="nd2-vp nhac">
          <h3>✉ NHẮC KỶ LUẬT ĐỀ NGHỊ <em>{nhac.length}</em></h3>
          <p>Cửa hàng bỏ lịch hoặc gửi trễ trong 30 ngày qua</p>
          <div className="ds">
            {nhac.length ? nhac.map((c) => (
              <div key={c.ma_ch} className="i" onClick={() => moHoSo(c)}>
                <div className="ai"><b>{c.ten}</b><span>{c.bo_lich ? 'đang bỏ lịch kỳ này' : `${c.tre_lich} lần gửi trễ`} · xin cuối {fmtNgay(c.xin_cuoi)}</span></div><em>→</em>
              </div>
            )) : <div className="nd2-trong nho">Tất cả cửa hàng đang đúng kỷ luật</div>}
          </div>
        </div>
        <div className="nd2-vp bs">
          <h3>▲ BỔ SUNG TỒN GẤP <em>{bs.length}</em></h3>
          <p>Cửa hàng dưới 50% định mức tối thiểu — thiếu nhiều nhất xếp trước</p>
          <div className="ds">
            {bs.length ? bs.map((c) => (
              <div key={c.ma_ch} className="i" onClick={() => moHoSo(c)}>
                <div className="ai"><b>{c.ten}</b><span>thiếu {fmtSo(c.sl_thieu)} SP · mới đạt {c.ton_dat}% định mức</span></div><em>→</em>
              </div>
            )) : <div className="nd2-trong nho">Không cửa hàng nào dưới 50% định mức</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function ModalMa({ hoMa, setHoMa }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') setHoMa(null); };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [setHoMa]);
  const chonHet = hoMa.chonHet;
  const dsCon = useMemo(() => {
    const a = (hoMa.ds_con || []).map((c) => ({ ...c }));
    if (chonHet) { a.forEach((c) => { c._km = khoangCach(chonHet, c); }); a.sort((x, y) => (x._km ?? 1e9) - (y._km ?? 1e9)); }
    return a;
  }, [hoMa.ds_con, chonHet]);
  return (
    <div className="nd2-mmo" onClick={() => setHoMa(null)}>
      <div className="nd2-mbox" onClick={(e) => e.stopPropagation()}>
        <div className="nd2-d-hd">
          <div className="ai">
            <div className="ten code">{hoMa.ma}</div>
            <div className="ma">{hoMa.gia ? 'Giá ' + fmtSo(hoMa.gia) + 'đ' : ''} · {(hoMa.ds_het || []).length} CH hết · {(hoMa.ds_con || []).length} CH còn hàng</div>
          </div>
          <button className="x" onClick={() => setHoMa(null)}>✕</button>
        </div>
        {hoMa._loi && <div className="nd2-canh">⚠ {hoMa._loi}</div>}
        {hoMa._load && <div className="nd2-mini-load">Đang tải danh sách…</div>}
        <div className="nd2-huong">Bấm cửa hàng <b className="do">ĐANG HẾT</b> bên trái → cột phải tự xếp <b className="teal">CH CÒN HÀNG</b> theo khoảng cách gần nhất.</div>
        <div className="nd2-2cot">
          <div className="cot">
            <h4>ĐANG HẾT · {(hoMa.ds_het || []).length}</h4>
            <div className="nd2-cuon">{(hoMa.ds_het || []).map((c) => (
              <div key={c.ma_ch} className={'nd2-dc het' + (chonHet?.ma_ch === c.ma_ch ? ' sel' : '')} onClick={() => setHoMa({ ...hoMa, chonHet: c })}>
                <div className="ai"><div className="ten">{c.ten}</div><div className="ma">{c.ma_ch} · {c.khu_vuc}</div></div>
                <span className="ng">{c.so_ngay}n</span>
              </div>
            ))}{!(hoMa.ds_het || []).length && !hoMa._load && <div className="nd2-trong nho">—</div>}</div>
          </div>
          <div className="cot">
            <h4>CÒN HÀNG · {dsCon.length}{chonHet ? <em> · gần {chonHet.ten}</em> : ''}</h4>
            <div className="nd2-cuon">{dsCon.map((c) => (
              <div key={c.ma_ch} className="nd2-dc con">
                <div className="ai"><div className="ten">{c.ten}</div><div className="ma">{c.ma_ch} · {c.khu_vuc}</div></div>
                <div className="ph"><b>{fmtSo(c.ton)}</b>{c._km != null && <span>{c._km} km</span>}</div>
              </div>
            ))}{!dsCon.length && !hoMa._load && <div className="nd2-trong nho">Không CH nào còn hàng — cần sản xuất</div>}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
