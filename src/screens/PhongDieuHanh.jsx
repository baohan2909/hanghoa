import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { useApp } from '../App.jsx';
import { Sel } from '../lib/ui.jsx';
import { IcSearch, IcRefresh, IcAlert, IcCheck, IcClock, IcTruck, IcBox, IcMoRong, IcOut, IcGuiLen, IcRadar, IcTeam } from '../lib/icons.jsx';
import OdooDon from './OdooDon.jsx';
import TonKho from './TonKho.jsx';
import { BanTinTheoDoi } from '../lib/BanTin.jsx';
import { SUPABASE_URL, SUPABASE_ANON } from '../config.js';

/* ============================================================================
   PHÒNG ĐIỀU HÀNH v4 (v3.116.0) — thiết kế lại 100%
   Tư duy: mở ra là biết NGAY đang xảy ra gì → cái gì bình thường → cái gì vướng → làm gì tiếp.
   Bố cục: Tình hình lúc này (câu tóm tắt + 5 chỉ số) → Luồng hàng (thanh luồng phiếu điều chuyển)
           → Cần xử lý ngay (hàng đợi ưu tiên) | Sức khỏe cửa hàng → Kho đang chậm | Mã cần xử lý
   Tab: Tổng quan · Cửa hàng · Mã hàng · Điều chuyển · Đơn Odoo · Việc cần làm
   Nguồn số liệu (KHÔNG đổi logic): fn_dieu_hanh_tong / _ch / _ma_tong / _ma_ch (SQL 159 — cache, đã loại thu hồi + phụ kiện)
     + fn_dh_luong (SQL 206 — phiếu điều chuyển từ dữ liệu Odoo) + fn_odoo_tong_quan (SQL 206 — đơn app tạo trên Odoo)
   Màu chỉ dùng cho TRẠNG THÁI: teal = ổn, vàng đất = cần chú ý, hồng thương hiệu = nghiêm trọng.
============================================================================ */

export const BAC = (d) =>
  d >= 90 ? { h: 1, ten: 'Khỏe', mau: '#2F9E8F' } :
  d >= 75 ? { h: 2, ten: 'Ổn định', mau: '#5B8DB8' } :
  d >= 55 ? { h: 3, ten: 'Theo dõi', mau: '#C9A13A' } :
  d >= 35 ? { h: 4, ten: 'Cảnh báo', mau: '#D9822B' } :
            { h: 5, ten: 'Nguy kịch', mau: '#D6006C' };
const MAU_BAC = { 1: '#2F9E8F', 2: '#5B8DB8', 3: '#C9A13A', 4: '#D9822B', 5: '#D6006C' };
const TEN_BAC = { 1: ['Khỏe', '≥ 90'], 2: ['Ổn định', '75–89'], 3: ['Theo dõi', '55–74'], 4: ['Cảnh báo', '35–54'], 5: ['Nguy kịch', '< 35'] };

const fmtNgay = (s) => (s ? String(s).slice(8, 10) + '/' + String(s).slice(5, 7) : '—');
const fmtSo = (n) => (n == null || n === '' ? '—' : Number(n).toLocaleString('vi-VN'));
const gioPhut = (s) => (s ? new Date(s).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—');
const khoangCach = (a, b) => {
  if (a?.lat == null || b?.lat == null) return null;
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)));
};
// 4 trụ điểm — ưu tiên số backend (SQL 159), thiếu thì ước tính từ dữ liệu có sẵn (giữ nguyên công thức cũ)
const truDiem = (c) => ([
  { ten: 'Tồn kho / định mức', ts: '35%', v: c.diem_ton ?? c.ton_dat },
  { ten: 'Hết hàng', ts: '25%', v: c.diem_het ?? Math.max(0, 100 - (c.so_het || 0) * 8 - (c.ngay_het_lau || 0) * 3) },
  { ten: 'Kỷ luật lịch đề nghị', ts: '20%', v: c.diem_lich ?? (c.tuan_thu != null ? Math.max(0, Math.min(100, c.tuan_thu - (c.tre_lich || 0) * 10)) : null) },
  { ten: 'Chất lượng đề nghị', ts: '20%', v: c.diem_cldn ?? ({ A: 92, B: 77, C: 62, D: 45 }[c.cldn] ?? null) },
]);
const viecLam = (c) => {
  const v = [];
  if (c.so_het > 0) v.push({ loai: 'chuyen', txt: `Điều chuyển ${c.so_het} mã đang hết` + (c.ngay_het_lau ? ` — lâu nhất ${c.ngay_het_lau} ngày` : '') });
  if (c.ton_dat != null && c.ton_dat < 60 && c.sl_thieu > 0) v.push({ loai: 'bosung', txt: `Bổ sung ${fmtSo(c.sl_thieu)} SP — mới đạt ${c.ton_dat}% định mức` });
  if (c.bo_lich) v.push({ loai: 'nhac', txt: 'Nhắc gửi đề nghị — đang bỏ lịch kỳ này' });
  else if (c.tre_lich > 0) v.push({ loai: 'nhac', txt: `Nhắc kỷ luật — ${c.tre_lich} lần gửi trễ trong 30 ngày` });
  if (!v.length) v.push({ loai: 'ok', txt: 'Ổn định — không cần can thiệp' });
  return v;
};
// Luồng phiếu điều chuyển (fn_dh_luong)
const LUONG = [
  ['nhap', 'Chờ gửi duyệt', 'quá 1 ngày'], ['cho_duyet', 'Chờ duyệt', 'quá 1 ngày'], ['cho_xuat', 'Chờ xuất kho', 'quá 2 ngày'],
  ['dang_giao', 'Đang giao', 'quá 3 ngày từ lúc xuất'], ['da_nhan', 'Cửa hàng đã nhận', ''],
];
const TEN_LUONG = Object.fromEntries(LUONG.map(([k, t]) => [k, t]));
const TAB = [['tq', 'Tổng quan'], ['ch', 'Cửa hàng'], ['ma', 'Mã hàng'], ['ton', 'Tồn khả dụng'], ['dc', 'Điều chuyển'], ['odoo', 'Đơn Odoo'], ['xn', 'Xác nhận đọc'], ['viec', 'Việc cần làm']];

/* ================== MÀN CHÍNH ================== */
export default function PhongDieuHanh({ chonTab }) {
  const { user, baoToast } = useApp();
  const [tab, setTab] = useState(() => { try { return localStorage.getItem('pdh_tab') || 'tq'; } catch { return 'tq'; } });
  const [ds, setDs] = useState(null);
  const [dsMa, setDsMa] = useState(null);
  const [luong, setLuong] = useState(null);
  const [odoo, setOdoo] = useState(null);
  const [loiTai, setLoiTai] = useState(null);
  const [capNhat, setCapNhat] = useState(null);
  const [chon, setChon] = useState(null);
  const [hoMa, setHoMa] = useState(null);
  const [locCH, setLocCH] = useState({ kv: null, nhom: 'ALL', bac: null, boLich: false, q: '', ghim: false });
  const [locMa, setLocMa] = useState({ q: '', sx: false });
  const [locDc, setLocDc] = useState({ buoc: '', kho: '', q: '' });
  const [odooNhom, setOdooNhom] = useState('');
  const [view, setView] = useState(() => { try { return localStorage.getItem('pdh_view') || 'bang'; } catch { return 'bang'; } });
  const [sort, setSort] = useState({ key: 'diem', dir: 'asc' });
  const [ghim, setGhim] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem('nd2_ghim')) || []); } catch { return new Set(); } });
  const [tv, setTv] = useState(false);
  const [pal, setPal] = useState(false);
  const [gio, setGio] = useState(new Date());
  const thanRef = useRef(null);
  useEffect(() => { thanRef.current?.scrollTo?.(0, 0); }, [tab]);   // đổi khu vực -> về đầu trang

  useEffect(() => { try { localStorage.setItem('pdh_tab', tab); } catch { /* */ } }, [tab]);
  useEffect(() => { try { localStorage.setItem('pdh_view', view); } catch { /* */ } }, [view]);
  useEffect(() => { try { localStorage.setItem('nd2_ghim', JSON.stringify([...ghim])); } catch { /* */ } }, [ghim]);
  useEffect(() => { const t = setInterval(() => setGio(new Date()), 30000); return () => clearInterval(t); }, []);
  useEffect(() => { const truoc = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = truoc; }; }, []);
  useEffect(() => {
    const h = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPal(true); } };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, []);
  // Trình chiếu: toàn màn hình + tự chuyển tab mỗi 15 giây
  useEffect(() => {
    if (!tv) return undefined;
    document.documentElement.requestFullscreen?.().catch(() => {});
    const VONG = ['tq', 'ch', 'dc', 'viec'];
    const id = setInterval(() => setTab((c) => VONG[(VONG.indexOf(c) + 1) % VONG.length]), 15000);
    const thoat = () => { if (!document.fullscreenElement) setTv(false); };
    document.addEventListener('fullscreenchange', thoat);
    return () => { clearInterval(id); document.removeEventListener('fullscreenchange', thoat); if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); };
  }, [tv]);

  const taiDs = useCallback(async () => {
    setLoiTai(null);
    try {
      const { data, error } = await sb.rpc('fn_dieu_hanh_tong', { p_token: user.token });
      if (error) throw new Error('[' + (error.code || '?') + '] ' + (error.message || 'RPC lỗi'));
      if (!Array.isArray(data)) throw new Error('Hàm trả về không phải mảng');
      if (!data.length) throw new Error('Chưa có dữ liệu trong cache — chạy SQL 159 (file gộp) để nạp số liệu');
      setDs(data);
      try { const { data: cc } = await sb.from('dieu_hanh_cache').select('cap_nhat').eq('id', 1).single(); if (cc?.cap_nhat) setCapNhat(cc.cap_nhat); } catch { /* bỏ qua */ }
    } catch (e) { setDs(null); setLoiTai(e.message || String(e)); }
  }, [user.token]);
  const taiPhu = useCallback(async () => {
    const [m, l, o] = await Promise.all([
      sb.rpc('fn_dieu_hanh_ma_tong', { p_token: user.token }),
      sb.rpc('fn_dh_luong', { p_token: user.token, p_ngay: 14 }),
      sb.rpc('fn_odoo_tong_quan', { p_token: user.token, p_loc: {} }),
    ]);
    setDsMa(!m.error && Array.isArray(m.data) ? m.data : []);
    setLuong(l.error ? { loi: l.error.message } : l.data);
    setOdoo(o.error ? { loi: o.error.message } : o.data);
  }, [user.token]);
  useEffect(() => { taiDs(); taiPhu(); }, [taiDs, taiPhu]);
  const lamMoi = () => { setDsMa(null); setLuong(null); setOdoo(null); taiDs(); taiPhu(); baoToast('Đã tải lại số liệu'); };

  // Số liệu cửa hàng là bản TÍNH SẴN (cache) — cũ quá thì tính lại ở máy chủ (Edge Function dieu-hanh-lam-moi, ~5 giây).
  //   Cũ > 60 phút: hiện cảnh báo + nút "Tính lại ngay" · cũ > 3 giờ: tự tính lại 1 lần khi mở màn (chỉ Điều phối / Quản trị)
  const coQuyenTinh = user.vai_tro === 'ADMIN' || user.vai_tro === 'DIEU_PHOI';
  const tuoiPhut = capNhat ? Math.round((gio.getTime() - new Date(capNhat).getTime()) / 60000) : null;
  const [dangTinh, setDangTinh] = useState(false);
  const daTuTinh = useRef(false);
  const tinhLai = useCallback(async (tuDong = false) => {
    if (dangTinh) return;
    setDangTinh(true);
    try {
      const r = await fetch(SUPABASE_URL + '/functions/v1/dieu-hanh-lam-moi', { method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_ANON}`, apikey: SUPABASE_ANON },
        body: JSON.stringify({ token: user.token }) });
      const j = await r.json().catch(() => ({ ok: false, loi: 'HTTP ' + r.status }));
      if (!j.ok) throw new Error(j.loi || 'Không tính lại được');
      await taiDs(); setDsMa(null); taiPhu();
      baoToast(j.bo_qua ? 'Số liệu vừa được tính lại — đã tải bản mới nhất' : `Đã tính lại số liệu ${j.ch?.so_ch ?? ''} cửa hàng · ${j.ma?.so_ma ?? ''} mã`);
    } catch (e) { if (!tuDong) baoToast('Tính lại số liệu lỗi: ' + (e.message || e)); }
    setDangTinh(false);
  }, [dangTinh, user.token, taiDs, taiPhu, baoToast]);
  useEffect(() => {
    if (!daTuTinh.current && coQuyenTinh && tuoiPhut != null && tuoiPhut > 180) { daTuTinh.current = true; tinhLai(true); }
  }, [tuoiPhut, coQuyenTinh, tinhLai]);

  /* ---- thống kê cửa hàng (giữ nguyên cách tính cũ) ---- */
  const locCoBan = useMemo(() => (ds || []).filter((c) => (!locCH.kv || c.khu_vuc === locCH.kv) && (locCH.nhom === 'ALL' || String(c.nhom_ch) === locCH.nhom)), [ds, locCH.kv, locCH.nhom]);
  const tk = useMemo(() => {
    const g = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }; let thieu = 0, bo = 0, tong = 0, chHet = 0;
    (ds || []).forEach((c) => { g[BAC(c.diem).h]++; thieu += c.sl_thieu || 0; bo += c.bo_lich ? 1 : 0; tong += c.diem; if ((c.so_het || 0) > 0) chHet++; });
    const n = (ds || []).length;
    return { g, thieu, chHet, bo, tb: n ? Math.round(tong / n) : 0, n };
  }, [ds]);
  const dsKV = useMemo(() => {
    const m = {};
    (ds || []).forEach((c) => {
      if (!c.khu_vuc) return;
      const x = (m[c.khu_vuc] = m[c.khu_vuc] || { ten: c.khu_vuc, n: 0, sum: 0, yeu: 0, nguy: 0, canh: 0, thieu: 0, het: 0, chHet: 0 });
      const h = BAC(c.diem).h;
      x.n++; x.sum += c.diem; if (c.diem < 55) x.yeu++; if (h === 5) x.nguy++; if (h === 4) x.canh++;
      x.thieu += c.sl_thieu || 0; x.het += c.so_het || 0; if ((c.so_het || 0) > 0) x.chHet++;
    });
    return Object.values(m).map((x) => ({ ...x, tb: Math.round(x.sum / x.n) })).sort((a, b) => a.tb - b.tb);
  }, [ds]);
  const maSX = useMemo(() => (dsMa || []).filter((m) => !m.so_ch_con).sort((a, b) => b.so_ch_het - a.so_ch_het), [dsMa]);
  const maDC = useMemo(() => (dsMa || []).filter((m) => m.so_ch_het >= 2 && m.so_ch_con > 0).sort((a, b) => b.so_ch_het - a.so_ch_het), [dsMa]);
  const chNhac = useMemo(() => (ds || []).filter((c) => c.bo_lich || c.tre_lich > 0).sort((a, b) => (b.bo_lich - a.bo_lich) || (b.tre_lich || 0) - (a.tre_lich || 0)), [ds]);
  const chBS = useMemo(() => (ds || []).filter((c) => c.ton_dat != null && c.ton_dat < 50 && c.sl_thieu > 0).sort((a, b) => (b.sl_thieu || 0) - (a.sl_thieu || 0)), [ds]);
  const soViec = maSX.length + maDC.length + chNhac.length + chBS.length;

  /* ---- mở chi tiết ---- */
  const moHoSo = async (c) => {
    setChon({ ...c, ds_het: null, lich_su_xin: null, lich_toi: null });
    try {
      const { data, error } = await sb.rpc('fn_dieu_hanh_ch', { p_token: user.token, p_ma_ch: c.ma_ch });
      if (error) throw new Error('[' + (error.code || '?') + '] ' + (error.message || 'RPC lỗi'));
      if (!data) throw new Error('Hàm trả về null');
      const arr = (x) => (Array.isArray(x) ? x : (x ? [x] : []));
      setChon((p) => (p && p.ma_ch === c.ma_ch ? { ...p, ...data, ds_het: arr(data.ds_het), lich_su_xin: arr(data.lich_su_xin), lich_toi: arr(data.lich_toi) } : p));
    } catch (e) {
      setChon((p) => (p && p.ma_ch === c.ma_ch ? { ...p, _loi: e.message || String(e), ds_het: [], lich_su_xin: [], lich_toi: [] } : p));
    }
  };
  const moMa = async (m) => {
    setHoMa({ ...m, ds_het: [], ds_con: [], chonHet: null, _load: true });
    try {
      const { data, error } = await sb.rpc('fn_dieu_hanh_ma_ch', { p_token: user.token, p_barcode: m.barcode });
      if (error) throw new Error('[' + (error.code || '?') + '] ' + (error.message || 'RPC lỗi'));
      const arr = (x) => (Array.isArray(x) ? x : []);
      setHoMa((p) => (p && p.barcode === m.barcode ? { ...p, ...data, ds_het: arr(data.ds_het), ds_con: arr(data.ds_con), _load: false } : p));
    } catch (e) { setHoMa((p) => (p && p.barcode === m.barcode ? { ...p, _load: false, _loi: e.message || String(e) } : p)); }
  };
  const copyText = async (t, msg) => {
    try { await navigator.clipboard.writeText(t); baoToast(msg); }
    catch { try { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); baoToast(msg); } catch { baoToast('Trình duyệt chặn sao chép'); } }
  };
  const bcCH = (c) => {
    const b = BAC(c.diem);
    const dong = [
      `BÁO CÁO CỬA HÀNG — ${c.ten} (${c.ma_ch})`, `${c.khu_vuc} · Nhóm ${c.nhom_ch} · ${b.ten} ${c.diem} điểm`, 'Việc cần làm:',
      ...viecLam(c).map((v) => `• ${v.txt}`),
      `Mã đang hết: ${fmtSo(c.so_ma_het ?? c.so_het)} · SL thiếu định mức: ${fmtSo(c.sl_thieu)}`,
      `Tồn: ${fmtSo(c.tong_ton)}${c.so_ma_ton != null ? ` (${c.so_ma_ton} mã)` : ''}${c.gia_tri_ton != null ? ` · Giá trị tồn: ${fmtSo(c.gia_tri_ton)}đ` : ''}`,
      `Tuân thủ lịch: ${c.tuan_thu != null ? c.tuan_thu + '%' : '—'} · CLDN: ${c.cldn || '—'} · Xin cuối: ${fmtNgay(c.xin_cuoi)}`,
    ];
    if (Array.isArray(c.ds_het) && c.ds_het.length) {
      dong.push(`Sản phẩm đang hết (${c.ds_het.length}):`);
      c.ds_het.slice(0, 10).forEach((m) => dong.push(`• ${m.ma}${m.gia ? ` · ${fmtSo(m.gia)}đ` : ''} · hết ${m.so_ngay} ngày`));
      if (c.ds_het.length > 10) dong.push(`… và ${c.ds_het.length - 10} mã khác`);
    }
    dong.push(`(Phòng điều hành · ${gio.toLocaleString('vi-VN')})`);
    copyText(dong.join('\n'), 'Đã chép báo cáo cửa hàng — dán vào Zalo/Telegram');
  };
  const bcViec = () => {
    const kk = (tt, arr, fm) => (arr.length ? [`${tt} (${arr.length}):`, ...arr.slice(0, 10).map(fm), ...(arr.length > 10 ? [`… và ${arr.length - 10} mục khác`] : [])] : []);
    copyText([
      `VIỆC CẦN XỬ LÝ — Phòng điều hành (${gio.toLocaleString('vi-VN')})`,
      ...kk('Cần sản xuất / nhập', maSX, (m) => `• ${m.ma} — hết ở ${m.so_ch_het} CH, không nơi nào còn`),
      ...kk('Điều chuyển giữa cửa hàng', maDC, (m) => `• ${m.ma} — ${m.so_ch_het} CH hết · ${m.so_ch_con} CH còn (tồn ${fmtSo(m.tong_ton_con)})`),
      ...kk('Nhắc kỷ luật đề nghị', chNhac, (c) => `• ${c.ten} (${c.ma_ch}) — ${c.bo_lich ? 'bỏ lịch kỳ này' : c.tre_lich + ' lần trễ'}`),
      ...kk('Bổ sung tồn gấp', chBS, (c) => `• ${c.ten} (${c.ma_ch}) — thiếu ${fmtSo(c.sl_thieu)} SP, đạt ${c.ton_dat}%`),
    ].join('\n'), 'Đã chép danh sách việc');
  };

  /* ---- điều hướng từ Tổng quan ---- */
  const diToi = {
    ch: (loc) => { setLocCH((l) => ({ ...l, kv: null, bac: null, boLich: false, q: '', ghim: false, ...loc })); setTab('ch'); },
    ma: (loc) => { setLocMa((l) => ({ ...l, ...loc })); setTab('ma'); },
    dc: (loc) => { setLocDc((l) => ({ ...l, buoc: '', kho: '', q: '', ...loc })); setTab('dc'); },
    odoo: (nhom) => { setOdooNhom(nhom || ''); setTab('odoo'); },
    viec: () => setTab('viec'),
  };

  const Header = (
    <header className="pdh-dau">
      <div className="pdh-dau-ten">
        <IcRadar />
        <div><b>Phòng điều hành</b><span>Hàng hoá · điều chuyển · đơn Odoo</span></div>
      </div>
      <nav className="pdh-tab" aria-label="Khu vực">
        {TAB.map(([k, t]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t}
            {k === 'viec' && soViec > 0 && <i>{soViec}</i>}
            {k === 'odoo' && (odoo?.dem?.can_xu_ly || 0) > 0 && <i className="do">{odoo.dem.can_xu_ly}</i>}
          </button>
        ))}
      </nav>
      <div className="pdh-dau-phai">
        <button className="pdh-ic" onClick={() => setPal(true)} title="Tìm nhanh cửa hàng / mã hàng (Ctrl+K)"><IcSearch /><span>Tìm</span><kbd>Ctrl K</kbd></button>
        <button className="pdh-ic" onClick={lamMoi} title="Tải lại số liệu"><IcRefresh /></button>
        <button className={'pdh-ic' + (tv ? ' on' : '')} onClick={() => setTv(!tv)} title="Trình chiếu toàn màn hình — tự chuyển khu vực mỗi 15 giây"><IcMoRong /></button>
        <span className="pdh-gio">{gio.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
        <button className="pdh-thoat" onClick={() => chonTab && chonTab('dashboard')}><IcOut /> Thoát</button>
      </div>
    </header>
  );

  return (
    <div className="pdh">
      {Header}
      <div className="pdh-moi">
        <span className={tuoiPhut > 60 ? 'cu' : ''}><i className="cham" /> Cửa hàng & mã hàng: <b>{capNhat ? gioPhut(capNhat) : '…'}</b>
          {dangTinh ? <em className="dang">đang tính lại…</em> : tuoiPhut > 60 && <em>cũ {tuoiPhut > 1440 ? Math.round(tuoiPhut / 1440) + ' ngày' : Math.round(tuoiPhut / 60) + ' giờ'}</em>}
          {coQuyenTinh && !dangTinh && tuoiPhut > 15 && <button onClick={() => tinhLai(false)}>Tính lại ngay</button>}</span>
        <span>Điều chuyển (dữ liệu Odoo): <b>{luong?.dck_luc ? gioPhut(luong.dck_luc) : '…'}</b></span>
        <span>Đơn Odoo đối chiếu: <b>{odoo?.dong_bo?.luc ? gioPhut(odoo.dong_bo.luc) : '…'}</b></span>
        <em>Đã loại hàng thu hồi và phụ kiện khỏi thống kê cửa hàng</em>
      </div>

      <main className="pdh-than" ref={thanRef}>
        {!ds && loiTai ? (
          <div className="pdh-loi"><IcAlert /><div><b>Chưa nạp được số liệu cửa hàng</b><p>{loiTai}</p></div><button className="pdh-nut" onClick={() => { taiDs(); taiPhu(); }}>Thử lại</button></div>
        ) : !ds ? (
          <div className="pdh-cho"><span /><span /><span /><span className="dai" /><span className="dai" /><p>Đang mở phòng điều hành…</p></div>
        ) : tab === 'tq' ? (
          <TongQuan tk={tk} dsKV={dsKV} luong={luong} odoo={odoo} ds={ds} maSX={maSX} maDC={maDC} chNhac={chNhac} gio={gio}
            diToi={diToi} moHoSo={moHoSo} moMa={moMa} />
        ) : tab === 'ch' ? (
          <TabCuaHang ds={ds} locCoBan={locCoBan} tk={tk} dsKV={dsKV} loc={locCH} setLoc={setLocCH} view={view} setView={setView}
            sort={sort} setSort={setSort} ghim={ghim} setGhim={setGhim} moHoSo={moHoSo} chon={chon} />
        ) : tab === 'ma' ? (
          <TabMa dsMa={dsMa} loc={locMa} setLoc={setLocMa} moMa={moMa} />
        ) : tab === 'dc' ? (
          <TabDieuChuyen luong={luong} loc={locDc} setLoc={setLocDc} />
        ) : tab === 'odoo' ? (
          <OdooDon nhung key={'odoo-' + odooNhom} locDau={odooNhom} />
        ) : tab === 'ton' ? (
          <TonKho nhung />
        ) : tab === 'xn' ? (
          <div className="pdh-tab-noi"><BanTinTheoDoi user={user} baoToast={baoToast} nhung /></div>
        ) : (
          <TabViec maSX={maSX} maDC={maDC} chNhac={chNhac} chBS={chBS} dangTaiMa={dsMa == null} moHoSo={moHoSo} moMa={moMa} bcViec={bcViec} />
        )}
      </main>

      {chon && <NganCH c={chon} dong={() => setChon(null)} bcCH={bcCH} />}
      {hoMa && <HopMa hoMa={hoMa} setHoMa={setHoMa} />}
      {pal && <TimNhanh ds={ds} dsMa={dsMa} dong={() => setPal(false)} chonCH={(c) => { setPal(false); moHoSo(c); }} chonMa={(m) => { setPal(false); moMa(m); }} />}
    </div>
  );
}

/* ================== TỔNG QUAN ================== */
function TongQuan({ tk, dsKV, luong, odoo, ds, maSX, maDC, chNhac, gio, diToi, moHoSo, moMa }) {
  const lb = luong?.buoc || {};
  const dangXuLy = ['nhap', 'cho_duyet', 'cho_xuat', 'dang_giao'].reduce((s, k) => s + (lb[k]?.phieu || 0), 0);
  const odooCan = odoo?.dem?.can_xu_ly || 0;
  const canChuY = tk.g[4] + tk.g[5];
  const nguyKich = useMemo(() => (ds || []).filter((c) => BAC(c.diem).h === 5).sort((a, b) => a.diem - b.diem), [ds]);

  // Hàng đợi ưu tiên: mức 3 nghiêm trọng · 2 cần chú ý · 1 theo dõi
  const hangDoi = useMemo(() => {
    const v = [];
    if (odooCan > 0) v.push({ m: 3, ic: IcGuiLen, t: `${odooCan} phiếu Odoo cần xử lý`, c: [odoo.dem.loi && `${odoo.dem.loi} gửi lỗi`, odoo.dem.qua_han && `${odoo.dem.qua_han} quá hạn`, odoo.dem.da_giao_cho_nhan && `${odoo.dem.da_giao_cho_nhan} đã giao chưa nhận` /* NEW - 3.139 */, odoo.dem.chua_thay && `${odoo.dem.chua_thay} chưa thấy trên Odoo`].filter(Boolean).join(' · ') || 'Xem từng đơn', nut: 'Mở đơn', go: () => diToi.odoo('can_xu_ly') });
    const kho0 = (luong?.theo_kho || [])[0];
    if (lb.cho_xuat?.qua_han) v.push({ m: lb.cho_xuat.qua_han >= 20 ? 3 : 2, ic: IcBox, t: `${lb.cho_xuat.qua_han} phiếu chờ xuất kho quá 2 ngày`, c: kho0 ? `Nhiều nhất kho ${kho0.kho} (${kho0.qua_han} phiếu quá hạn)` : '', nut: 'Xem phiếu', go: () => diToi.dc({ buoc: 'cho_xuat' }) });
    if (lb.dang_giao?.qua_han) v.push({ m: 2, ic: IcTruck, t: `${lb.dang_giao.qua_han} phiếu đã xuất quá 3 ngày chưa nhận`, c: 'Kiểm tra vận chuyển, nhắc cửa hàng xác nhận nhận hàng', nut: 'Xem phiếu', go: () => diToi.dc({ buoc: 'dang_giao' }) });
    if (lb.nhap?.qua_han) v.push({ m: 2, ic: IcClock, t: `${lb.nhap.qua_han} phiếu nằm nháp quá 1 ngày`, c: 'Phiếu "Yêu cầu điều chuyển" chưa được gửi duyệt trên Odoo', nut: 'Xem phiếu', go: () => diToi.dc({ buoc: 'nhap' }) });
    nguyKich.slice(0, 3).forEach((c) => v.push({ m: 3, ic: IcAlert, t: `${c.ten} nguy kịch — ${c.diem} điểm`, c: viecLam(c)[0].txt, nut: 'Mở', go: () => moHoSo(c) }));
    if (nguyKich.length > 3) v.push({ m: 3, ic: IcAlert, t: `Còn ${nguyKich.length - 3} cửa hàng nguy kịch khác`, c: 'Lọc toàn bộ cửa hàng nguy kịch', nut: 'Xem', go: () => diToi.ch({ bac: 5 }) });
    if (maSX.length) v.push({ m: 2, ic: IcBox, t: `${maSX.length} mã hết mà không cửa hàng nào còn`, c: `Cần sản xuất / nhập — nhiều nhất ${maSX[0].ma} (hết ở ${maSX[0].so_ch_het} CH)`, nut: 'Xem mã', go: () => diToi.ma({ sx: true }) });
    if (maDC.length) v.push({ m: 1, ic: IcTruck, t: `${maDC.length} mã nên điều chuyển giữa cửa hàng`, c: `Ví dụ ${maDC[0].ma}: ${maDC[0].so_ch_het} CH hết, ${maDC[0].so_ch_con} CH còn`, nut: 'Xem việc', go: () => diToi.viec() });
    if (tk.bo) v.push({ m: 1, ic: IcTeam, t: `${tk.bo} cửa hàng bỏ lịch đề nghị kỳ này`, c: chNhac[0] ? `Ví dụ ${chNhac[0].ten}` : '', nut: 'Lọc', go: () => diToi.ch({ boLich: true }) });
    return v.sort((a, b) => b.m - a.m);
  }, [odoo, odooCan, luong, lb, nguyKich, maSX, maDC, tk.bo, chNhac, diToi, moHoSo]);

  const tomTat = hangDoi.length
    ? hangDoi.filter((x) => x.m >= 2).slice(0, 3).map((x) => x.t).join('; ')
    : '';

  return (
    <div className="pdh-tq">
      {/* 1. Tình hình lúc này */}
      <section className="pdh-tinh-hinh">
        <div className="pdh-th-chu">
          <h1>Tình hình lúc {gio.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</h1>
          <p>{tomTat ? <>Cần ưu tiên: {tomTat}.</> : 'Không có vấn đề nổi cộm — hệ thống đang vận hành bình thường.'}</p>
        </div>
        <div className="pdh-chi-so">
          <button className="pdh-cs" onClick={() => diToi.ch({})}>
            <span>Sức khỏe cửa hàng</span><b style={{ color: BAC(tk.tb).mau }}>{tk.tb}<small>/100</small></b><em>{BAC(tk.tb).ten} · {tk.n} cửa hàng</em></button>
          <button className={'pdh-cs' + (canChuY ? ' vang' : '')} onClick={() => diToi.ch({ bac: tk.g[5] ? 5 : 4 })}>
            <span>Cửa hàng cần chú ý</span><b>{canChuY}</b><em>{tk.g[5]} nguy kịch · {tk.g[4]} cảnh báo</em></button>
          <button className="pdh-cs" onClick={() => diToi.ma({})}>
            <span>Cửa hàng có mã hết</span><b>{fmtSo(tk.chHet)}</b><em>thiếu {fmtSo(tk.thieu)} SP so định mức</em></button>
          <button className={'pdh-cs' + ((luong?.so_qua_han || 0) > 0 ? ' vang' : '')} onClick={() => diToi.dc({})}>
            <span>Phiếu điều chuyển đang xử lý</span><b>{luong ? fmtSo(dangXuLy) : '…'}</b><em>{luong ? `${fmtSo(luong.so_qua_han)} quá hạn · 14 ngày` : 'đang tải'}</em></button>
          <button className={'pdh-cs' + (odooCan ? ' do' : '')} onClick={() => diToi.odoo(odooCan ? 'can_xu_ly' : '')}>
            <span>Đơn hàng Odoo</span><b>{odoo ? fmtSo(odoo.tong) : '…'}</b><em>{odoo ? (odooCan ? `${odooCan} cần xử lý` : 'không có sự cố') + ' · 30 ngày' : 'đang tải'}</em></button>
        </div>
      </section>

      {/* 2. Luồng hàng */}
      <section className="pdh-khoi">
        <div className="pdh-khoi-dau"><h2>Luồng phiếu điều chuyển</h2><span>14 ngày gần nhất · theo trạng thái trên Odoo · bấm từng chặng để xem phiếu</span></div>
        <ThanhLuong luong={luong} onChon={(k) => diToi.dc({ buoc: k })} />
      </section>

      {/* 3. Hàng đợi + sức khỏe */}
      <div className="pdh-hai">
        <section className="pdh-khoi">
          <div className="pdh-khoi-dau"><h2>Cần xử lý ngay</h2><span>{hangDoi.length ? `${hangDoi.length} mục · xếp theo mức độ` : ''}</span></div>
          {hangDoi.length ? (
            <ol className="pdh-hd">
              {hangDoi.map((x, i) => { const Ic = x.ic; return (
                <li key={i} className={'m' + x.m}>
                  <span className="ic"><Ic /></span>
                  <div><b>{x.t}</b>{x.c && <p>{x.c}</p>}</div>
                  <button onClick={x.go}>{x.nut}</button>
                </li>
              ); })}
            </ol>
          ) : <div className="pdh-yen"><IcCheck /> Không có việc khẩn — các chỉ số đang trong ngưỡng.</div>}
        </section>

        <section className="pdh-khoi">
          <div className="pdh-khoi-dau"><h2>Sức khỏe cửa hàng</h2><span>{tk.n} cửa hàng đang hoạt động</span></div>
          <div className="pdh-phan-bo">
            {[1, 2, 3, 4, 5].map((h) => tk.g[h] > 0 && (
              <button key={h} style={{ flexGrow: tk.g[h], background: MAU_BAC[h] }} title={`${TEN_BAC[h][0]}: ${tk.g[h]} cửa hàng`} onClick={() => diToi.ch({ bac: h })} />
            ))}
          </div>
          <div className="pdh-chu-giai">
            {[1, 2, 3, 4, 5].map((h) => (
              <button key={h} onClick={() => diToi.ch({ bac: h })}><i style={{ background: MAU_BAC[h] }} />{TEN_BAC[h][0]}<b>{tk.g[h]}</b></button>
            ))}
          </div>
          <h3 className="pdh-tieu-phu">Khu vực cần để ý</h3>
          <div className="pdh-kv">
            {dsKV.slice(0, 6).map((k) => (
              <button key={k.ten} onClick={() => diToi.ch({ kv: k.ten })}>
                <span className="t">{k.ten}</span>
                <span className="thanh"><i style={{ width: k.tb + '%', background: BAC(k.tb).mau }} /></span>
                <b style={{ color: BAC(k.tb).mau }}>{k.tb}</b>
                <em>{k.yeu ? `${k.yeu}/${k.n} yếu` : `${k.n} CH`}</em>
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* 4. Kho chậm + mã */}
      <div className="pdh-hai">
        <section className="pdh-khoi">
          <div className="pdh-khoi-dau"><h2>Kho đang giữ phiếu</h2><span>chờ xuất · quá hạn · đang giao</span></div>
          {!luong ? <div className="pdh-mo">Đang tải…</div> : luong.loi ? <div className="pdh-mo">Chưa đọc được dữ liệu điều chuyển: {luong.loi}</div>
            : (luong.theo_kho || []).length ? (
              <table className="pdh-bang gon">
                <thead><tr><th>Kho</th><th className="so">Chờ xuất</th><th className="so">Quá hạn</th><th className="so">Đang giao</th></tr></thead>
                <tbody>{luong.theo_kho.map((k) => (
                  <tr key={k.kho} onClick={() => diToi.dc({ kho: k.kho })}>
                    <td><b>{k.kho}</b></td><td className="so">{fmtSo(k.cho_xuat)}</td>
                    <td className={'so' + (k.qua_han ? ' vang' : '')}>{fmtSo(k.qua_han)}</td><td className="so">{fmtSo(k.dang_giao)}</td>
                  </tr>))}</tbody>
              </table>
            ) : <div className="pdh-yen"><IcCheck /> Không kho nào đang giữ phiếu.</div>}
        </section>
        <section className="pdh-khoi">
          <div className="pdh-khoi-dau"><h2>Mã hàng cần xử lý</h2><span>{dsMaTom(maSX, maDC)}</span></div>
          <div className="pdh-ma-hai">
            <div><h3 className="pdh-tieu-phu">Cần sản xuất / nhập</h3>
              {maSX.slice(0, 5).map((m) => <button key={m.barcode} className="pdh-ma-i" onClick={() => moMa(m)}><b>{m.ma}</b><span>hết ở {m.so_ch_het} CH</span></button>)}
              {!maSX.length && <p className="pdh-mo">Không có mã nào</p>}</div>
            <div><h3 className="pdh-tieu-phu">Nên điều chuyển</h3>
              {maDC.slice(0, 5).map((m) => <button key={m.barcode} className="pdh-ma-i" onClick={() => moMa(m)}><b>{m.ma}</b><span>{m.so_ch_het} hết · {m.so_ch_con} còn</span></button>)}
              {!maDC.length && <p className="pdh-mo">Không có mã nào</p>}</div>
          </div>
        </section>
      </div>
    </div>
  );
}
const dsMaTom = (sx, dc) => (sx.length || dc.length ? `${sx.length} cần sản xuất · ${dc.length} nên điều chuyển` : '');

/* Thanh luồng: một dải = toàn bộ phiếu 14 ngày, chia đoạn theo chặng; phần quá hạn gạch chéo */
function ThanhLuong({ luong, onChon, lon }) {
  const [hien, setHien] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setHien(true)); return () => cancelAnimationFrame(id); }, [luong]);
  if (!luong) return <div className="pdh-luong cho"><span /></div>;
  if (luong.loi) return <div className="pdh-mo">Chưa đọc được dữ liệu điều chuyển: {luong.loi}</div>;
  const b = luong.buoc || {};
  const tong = LUONG.reduce((s, [k]) => s + (b[k]?.phieu || 0), 0) || 1;
  return (
    <div className={'pdh-luong' + (lon ? ' lon' : '')}>
      <div className="pdh-luong-dai">
        {LUONG.map(([k], i) => {
          const n = b[k]?.phieu || 0; if (!n) return null;
          const qh = b[k]?.qua_han || 0;
          return (
            <button key={k} className={'d d' + i} style={{ width: hien ? (n / tong) * 100 + '%' : 0 }} onClick={() => onChon(k)} title={`${TEN_LUONG[k]}: ${n} phiếu${qh ? ` · ${qh} quá hạn` : ''}`}>
              {qh > 0 && <i style={{ width: (qh / n) * 100 + '%' }} />}
            </button>
          );
        })}
      </div>
      <div className="pdh-luong-chang">
        {LUONG.map(([k, t, nguong], i) => {
          const x = b[k] || {};
          return (
            <button key={k} className={'c c' + i + (x.qua_han ? ' tre' : '')} onClick={() => onChon(k)}>
              <span className="t"><i />{t}</span>
              <b>{fmtSo(x.phieu || 0)}<small> phiếu</small></b>
              <em>{x.qua_han ? `${x.qua_han} ${nguong}` : x.phieu ? `${fmtSo(x.sl)} cái · ${x.ch} CH` : 'không có'}</em>
            </button>
          );
        })}
      </div>
      {(b.dung?.phieu || 0) > 0 && <p className="pdh-luong-ghi">Ngoài luồng: {b.dung.phieu} phiếu bị huỷ / từ chối trên Odoo.</p>}
    </div>
  );
}

/* ================== CỬA HÀNG ================== */
function TabCuaHang({ ds, locCoBan, tk, dsKV, loc, setLoc, view, setView, sort, setSort, ghim, setGhim, moHoSo, chon }) {
  const dat = (o) => setLoc((l) => ({ ...l, ...o }));
  const dsLoc = useMemo(() => locCoBan.filter((c) => (!loc.bac || BAC(c.diem).h === loc.bac) && (!loc.boLich || c.bo_lich === 1)
    && (!loc.ghim || ghim.has(c.ma_ch)) && (!loc.q || (c.ten + ' ' + c.ma_ch).toLowerCase().includes(loc.q.toLowerCase()))), [locCoBan, loc, ghim]);
  const dsSort = useMemo(() => {
    const a = [...dsLoc]; const d = sort.dir === 'asc' ? 1 : -1;
    const get = { diem: (c) => c.diem, so_het: (c) => c.so_het || 0, sl_thieu: (c) => c.sl_thieu || 0, ton_dat: (c) => c.ton_dat ?? -1,
      tuan_thu: (c) => c.tuan_thu ?? -1, ten: (c) => c.ten, xin_cuoi: (c) => c.xin_cuoi || '', khu_vuc: (c) => c.khu_vuc || '' }[sort.key] || ((c) => c.diem);
    a.sort((x, y) => { const gx = get(x), gy = get(y); return (gx < gy ? -1 : gx > gy ? 1 : 0) * d; });
    return ghim.size ? [...a.filter((c) => ghim.has(c.ma_ch)), ...a.filter((c) => !ghim.has(c.ma_ch))] : a;
  }, [dsLoc, sort, ghim]);
  const bamCot = (key, dm) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: dm }));
  const mt = (k) => (sort.key === k ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '');
  const coLoc = loc.kv || loc.bac || loc.boLich || loc.q || loc.nhom !== 'ALL' || loc.ghim;
  const doiGhim = (ma) => setGhim((g) => { const n = new Set(g); if (n.has(ma)) n.delete(ma); else n.add(ma); return n; });

  return (
    <div className="pdh-tab-noi">
      <div className="pdh-bac">
        {[5, 4, 3, 2, 1].map((h) => (
          <button key={h} className={loc.bac === h ? 'on' : ''} onClick={() => dat({ bac: loc.bac === h ? null : h })}>
            <i style={{ background: MAU_BAC[h] }} /><span>{TEN_BAC[h][0]}<small>{TEN_BAC[h][1]}</small></span><b>{tk.g[h]}</b>
          </button>
        ))}
        <button className={loc.boLich ? 'on' : ''} onClick={() => dat({ boLich: !loc.boLich })}><i style={{ background: '#C9A13A' }} /><span>Bỏ lịch đề nghị<small>kỳ này</small></span><b>{tk.bo}</b></button>
      </div>
      <div className="pdh-cong">
        <label className="pdh-tim"><IcSearch /><input value={loc.q} onChange={(e) => dat({ q: e.target.value })} placeholder="Tìm tên hoặc mã cửa hàng…" /></label>
        <Sel value={loc.kv || ''} onChange={(v) => dat({ kv: v || null })} options={[{ value: '', label: 'Mọi khu vực' }, ...dsKV.map((k) => ({ value: k.ten, label: `${k.ten} · ${k.tb} điểm` }))]} />
        <Sel value={loc.nhom} onChange={(v) => dat({ nhom: v })} options={[{ value: 'ALL', label: 'Mọi nhóm' }, { value: '1', label: 'Nhóm 1' }, { value: '2', label: 'Nhóm 2' }, { value: '3', label: 'Nhóm 3' }]} />
        <div className="pdh-seg">
          {[['bang', 'Bảng'], ['the', 'Thẻ'], ['kv', 'Khu vực']].map(([k, t]) => <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{t}</button>)}
        </div>
        <button className={'pdh-nut-phu' + (loc.ghim ? ' on' : '')} onClick={() => dat({ ghim: !loc.ghim })} title="Chỉ hiện cửa hàng đang theo dõi">★ Theo dõi {ghim.size}</button>
        <span className="pdh-dem">{dsLoc.length}/{ds.length} cửa hàng</span>
        {coLoc && <button className="pdh-nut-phu" onClick={() => setLoc({ kv: null, nhom: 'ALL', bac: null, boLich: false, q: '', ghim: false })}>Bỏ lọc</button>}
      </div>

      {view === 'kv' ? (
        <div className="pdh-khoi kin"><table className="pdh-bang">
          <thead><tr><th>Khu vực</th><th className="so">Cửa hàng</th><th className="so">Sức khỏe TB</th><th className="so">Nguy kịch</th><th className="so">Cảnh báo</th><th className="so">CH có mã hết</th><th className="so">Mã hết</th><th className="so">SP thiếu</th></tr></thead>
          <tbody>{dsKV.map((k) => (
            <tr key={k.ten} onClick={() => { dat({ kv: k.ten }); setView('bang'); }}>
              <td><b>{k.ten}</b><span>{k.yeu} cửa hàng dưới 55 điểm</span></td><td className="so">{k.n}</td>
              <td className="so"><b style={{ color: BAC(k.tb).mau }}>{k.tb}</b></td>
              <td className={'so' + (k.nguy ? ' do' : '')}>{k.nguy || '—'}</td><td className={'so' + (k.canh ? ' vang' : '')}>{k.canh || '—'}</td>
              <td className="so">{k.chHet || '—'}</td><td className="so">{fmtSo(k.het)}</td><td className="so">{fmtSo(k.thieu)}</td>
            </tr>))}</tbody>
        </table></div>
      ) : view === 'the' ? (
        <div className="pdh-luoi">
          {dsSort.map((c) => { const b = BAC(c.diem); const v = viecLam(c)[0]; return (
            <article key={c.ma_ch} className={'pdh-the' + (chon?.ma_ch === c.ma_ch ? ' on' : '')} onClick={() => moHoSo(c)} style={{ '--m': b.mau }}>
              <div className="dau">
                <div><b>{c.ten}</b><span>{c.ma_ch} · {c.khu_vuc}</span></div>
                <span className="diem" style={{ color: b.mau }}>{c.diem}</span>
              </div>
              <div className="chi">
                <span className={c.so_het ? 'xau' : ''}><b>{fmtSo(c.so_het)}</b> mã hết</span>
                <span><b>{fmtSo(c.sl_thieu)}</b> thiếu</span>
                <span>xin {fmtNgay(c.xin_cuoi)}</span>
              </div>
              <div className="dinh-muc"><i style={{ width: Math.min(100, c.ton_dat || 0) + '%', background: b.mau }} /></div>
              <p className={'viec ' + v.loai}>{v.txt}</p>
              <button className={'sao' + (ghim.has(c.ma_ch) ? ' on' : '')} onClick={(e) => { e.stopPropagation(); doiGhim(c.ma_ch); }} title="Ghim theo dõi">★</button>
            </article>
          ); })}
          {!dsSort.length && <div className="pdh-mo">Không có cửa hàng khớp bộ lọc.</div>}
        </div>
      ) : (
        <div className="pdh-khoi kin"><table className="pdh-bang">
          <thead><tr>
            <th className="sap" onClick={() => bamCot('ten', 'asc')}>Cửa hàng{mt('ten')}</th>
            <th className="sap so" onClick={() => bamCot('diem', 'asc')}>Điểm{mt('diem')}</th>
            <th className="sap so" onClick={() => bamCot('ton_dat', 'asc')}>Tồn / định mức{mt('ton_dat')}</th>
            <th className="sap so" onClick={() => bamCot('so_het', 'desc')}>Mã hết{mt('so_het')}</th>
            <th className="sap so" onClick={() => bamCot('sl_thieu', 'desc')}>SL thiếu{mt('sl_thieu')}</th>
            <th className="sap so" onClick={() => bamCot('tuan_thu', 'asc')}>Tuân thủ lịch{mt('tuan_thu')}</th>
            <th className="sap so" onClick={() => bamCot('xin_cuoi', 'asc')}>Xin cuối{mt('xin_cuoi')}</th>
            <th>Việc cần làm</th><th />
          </tr></thead>
          <tbody>{dsSort.map((c) => { const b = BAC(c.diem); const v = viecLam(c)[0]; return (
            <tr key={c.ma_ch} className={chon?.ma_ch === c.ma_ch ? 'on' : ''} onClick={() => moHoSo(c)}>
              <td><b>{c.ten}</b><span>{c.ma_ch} · {c.khu_vuc} · N{c.nhom_ch}</span></td>
              <td className="so"><span className="pdh-diem" style={{ '--m': b.mau }}>{c.diem}</span></td>
              <td className="so">{c.ton_dat != null ? c.ton_dat + '%' : '—'}</td>
              <td className={'so' + (c.so_het ? ' do' : '')}>{fmtSo(c.so_het)}</td>
              <td className={'so' + (c.sl_thieu ? ' vang' : '')}>{fmtSo(c.sl_thieu)}</td>
              <td className="so">{c.tuan_thu != null ? c.tuan_thu + '%' : '—'}</td>
              <td className="so">{fmtNgay(c.xin_cuoi)}</td>
              <td className={'viec ' + v.loai}>{v.txt}</td>
              <td><button className={'pdh-sao' + (ghim.has(c.ma_ch) ? ' on' : '')} onClick={(e) => { e.stopPropagation(); doiGhim(c.ma_ch); }} title="Ghim theo dõi — nổi lên đầu">★</button></td>
            </tr>
          ); })}
          {!dsSort.length && <tr><td colSpan={9} className="pdh-mo">Không có cửa hàng khớp bộ lọc.</td></tr>}</tbody>
        </table></div>
      )}
    </div>
  );
}

/* ================== MÃ HÀNG ================== */
function TabMa({ dsMa, loc, setLoc, moMa }) {
  const ds = useMemo(() => (dsMa || []).filter((m) => (!loc.sx || !m.so_ch_con) && (!loc.q || (m.ma + ' ' + m.barcode).toLowerCase().includes(loc.q.toLowerCase()))), [dsMa, loc]);
  const [sort, setSort] = useState({ k: 'so_ch_het', d: -1 });
  const dsS = useMemo(() => [...ds].sort((a, b) => { const x = a[sort.k] ?? 0, y = b[sort.k] ?? 0; return (x < y ? -1 : x > y ? 1 : 0) * sort.d; }), [ds, sort]);
  const bam = (k) => setSort((s) => (s.k === k ? { k, d: -s.d } : { k, d: k === 'ma' ? 1 : -1 }));
  const mt = (k) => (sort.k === k ? (sort.d === 1 ? ' ▲' : ' ▼') : '');
  if (!dsMa) return <div className="pdh-mo">Đang tải tổng hợp theo mã…</div>;
  const canSX = dsMa.filter((m) => !m.so_ch_con).length;
  return (
    <div className="pdh-tab-noi">
      <div className="pdh-bac">
        <button className={!loc.sx ? 'on' : ''} onClick={() => setLoc((l) => ({ ...l, sx: false }))}><i style={{ background: '#5B8DB8' }} /><span>Mã đang hết<small>toàn hệ thống</small></span><b>{fmtSo(dsMa.length)}</b></button>
        <button className={loc.sx ? 'on' : ''} onClick={() => setLoc((l) => ({ ...l, sx: !l.sx }))}><i style={{ background: '#D6006C' }} /><span>Cần sản xuất<small>không CH nào còn</small></span><b>{fmtSo(canSX)}</b></button>
        <div className="pdh-bac-tinh"><i style={{ background: '#C9A13A' }} /><span>Hết ở ≥ 3 cửa hàng</span><b>{fmtSo(dsMa.filter((m) => m.so_ch_het >= 3).length)}</b></div>
      </div>
      <div className="pdh-cong">
        <label className="pdh-tim"><IcSearch /><input value={loc.q} onChange={(e) => setLoc((l) => ({ ...l, q: e.target.value }))} placeholder="Tìm mã sản phẩm…" /></label>
        <span className="pdh-dem">{ds.length} mã · bấm mã để xem cửa hàng hết / còn và khoảng cách</span>
      </div>
      <div className="pdh-khoi kin"><table className="pdh-bang">
        <thead><tr>
          <th className="sap" onClick={() => bam('ma')}>Mã sản phẩm{mt('ma')}</th>
          <th className="sap so" onClick={() => bam('gia')}>Giá{mt('gia')}</th>
          <th className="sap so" onClick={() => bam('so_ch_het')}>CH hết{mt('so_ch_het')}</th>
          <th className="sap so" onClick={() => bam('so_ch_con')}>CH còn{mt('so_ch_con')}</th>
          <th className="sap so" onClick={() => bam('tong_ton_con')}>Tồn còn{mt('tong_ton_con')}</th>
          <th>Hướng xử lý</th>
        </tr></thead>
        <tbody>{dsS.slice(0, 500).map((m) => (
          <tr key={m.barcode} onClick={() => moMa(m)}>
            <td><b>{m.ma}</b><span>{m.barcode}</span></td>
            <td className="so">{m.gia ? fmtSo(m.gia) + 'đ' : '—'}</td>
            <td className="so do">{m.so_ch_het}</td><td className="so">{m.so_ch_con || '—'}</td><td className="so">{fmtSo(m.tong_ton_con)}</td>
            <td className={'viec ' + (!m.so_ch_con ? 'sx' : m.so_ch_het >= 2 ? 'chuyen' : 'ok')}>{!m.so_ch_con ? 'Cần sản xuất / nhập' : m.so_ch_het >= 2 ? 'Điều chuyển từ CH còn hàng' : 'Theo dõi'}</td>
          </tr>))}
          {!dsS.length && <tr><td colSpan={6} className="pdh-mo">Không có mã nào khớp.</td></tr>}</tbody>
      </table>{dsS.length > 500 && <p className="pdh-mo">Đang hiện 500/{dsS.length} mã — gõ để tìm mã cụ thể.</p>}</div>
    </div>
  );
}

/* ================== ĐIỀU CHUYỂN ================== */
function TabDieuChuyen({ luong, loc, setLoc }) {
  const [sort, setSort] = useState({ k: 'so_ngay', d: -1 });
  const ds = useMemo(() => (luong?.qua_han || []).filter((p) => (!loc.buoc || p.buoc === loc.buoc) && (!loc.kho || p.kho === loc.kho)
    && (!loc.q || (p.ma_phieu + ' ' + p.ma_ch + ' ' + (p.ten_ch || '')).toLowerCase().includes(loc.q.toLowerCase())))
    .sort((a, b) => { const x = a[sort.k] ?? '', y = b[sort.k] ?? ''; return (x < y ? -1 : x > y ? 1 : 0) * sort.d; }), [luong, loc, sort]);
  const bam = (k) => setSort((s) => (s.k === k ? { k, d: -s.d } : { k, d: ['ma_phieu', 'ten_ch', 'kho'].includes(k) ? 1 : -1 }));
  const mt = (k) => (sort.k === k ? (sort.d === 1 ? ' ▲' : ' ▼') : '');
  return (
    <div className="pdh-tab-noi">
      <section className="pdh-khoi">
        <div className="pdh-khoi-dau"><h2>Luồng phiếu điều chuyển · 14 ngày</h2><span>Nguồn: dữ liệu điều chuyển đồng bộ từ Odoo · cập nhật {luong?.dck_luc ? gioPhut(luong.dck_luc) : '…'}</span></div>
        <ThanhLuong luong={luong} lon onChon={(k) => setLoc((l) => ({ ...l, buoc: l.buoc === k ? '' : k }))} />
      </section>
      {luong?.theo_ngay?.length > 0 && <BieuDoLuong ds={luong.theo_ngay} />}
      <section className="pdh-khoi kin">
        <div className="pdh-khoi-dau lot"><h2>Phiếu quá hạn</h2>
          <span>{fmtSo(luong?.so_qua_han)} phiếu · ngưỡng: nháp &gt; 1 ngày · chờ duyệt &gt; 1 ngày · chờ xuất &gt; 2 ngày · đang giao &gt; 3 ngày{(luong?.so_qua_han || 0) > 60 ? ' · hiện 60 phiếu lâu nhất' : ''}</span></div>
        <div className="pdh-cong lot">
          <label className="pdh-tim"><IcSearch /><input value={loc.q} onChange={(e) => setLoc((l) => ({ ...l, q: e.target.value }))} placeholder="Mã phiếu, cửa hàng…" /></label>
          <Sel value={loc.buoc} onChange={(v) => setLoc((l) => ({ ...l, buoc: v }))} options={[{ value: '', label: 'Mọi chặng' }, ...LUONG.slice(0, 4).map(([k, t]) => ({ value: k, label: t }))]} />
          <Sel value={loc.kho} onChange={(v) => setLoc((l) => ({ ...l, kho: v }))} options={[{ value: '', label: 'Mọi kho' }, ...(luong?.theo_kho || []).map((k) => ({ value: k.kho, label: `${k.kho} · ${k.qua_han} quá hạn` }))]} />
          {(loc.buoc || loc.kho || loc.q) && <button className="pdh-nut-phu" onClick={() => setLoc({ buoc: '', kho: '', q: '' })}>Bỏ lọc</button>}
        </div>
        <table className="pdh-bang">
          <thead><tr>
            <th className="sap" onClick={() => bam('ma_phieu')}>Phiếu{mt('ma_phieu')}</th>
            <th className="sap" onClick={() => bam('ten_ch')}>Cửa hàng nhận{mt('ten_ch')}</th>
            <th className="sap" onClick={() => bam('kho')}>Kho{mt('kho')}</th>
            <th>Chặng</th>
            <th className="sap so" onClick={() => bam('so_ngay')}>Số ngày{mt('so_ngay')}</th>
            <th className="sap so" onClick={() => bam('sl')}>Số lượng{mt('sl')}</th>
          </tr></thead>
          <tbody>{ds.map((p) => (
            <tr key={p.ma_phieu} className="tinh">
              <td><b>{p.ma_phieu}</b><span>tạo {fmtNgay(p.ngay_tao)}{p.ngay_xuat ? ' · xuất ' + fmtNgay(p.ngay_xuat) : ''}</span></td>
              <td><b className="nhe">{p.ten_ch || p.ma_ch}</b><span>{p.ma_ch} · {p.khu_vuc || ''}</span></td>
              <td>{p.kho}</td>
              <td><span className={'pdh-chang ' + p.buoc}>{TEN_LUONG[p.buoc] || p.buoc}</span><span>{p.tt}{p.ct ? ' · ' + p.ct : ''}</span></td>
              <td className={'so' + (p.so_ngay >= 5 ? ' do' : ' vang')}><b>{p.so_ngay}</b></td>
              <td className="so">{fmtSo(p.sl)}<span>{p.so_dong} dòng</span></td>
            </tr>))}
            {!ds.length && <tr><td colSpan={6} className="pdh-mo">{luong ? 'Không có phiếu quá hạn khớp bộ lọc.' : 'Đang tải…'}</td></tr>}</tbody>
        </table>
      </section>
    </div>
  );
}

function BieuDoLuong({ ds }) {
  const KEYS = [['da_nhan', 'Đã nhận'], ['dang_giao', 'Đang giao'], ['cho_xuat', 'Chờ xuất'], ['cho_duyet', 'Chờ duyệt'], ['nhap', 'Nháp']];
  const max = Math.max(1, ...ds.map((d) => KEYS.reduce((s, [k]) => s + (d[k] || 0), 0)));
  return (
    <section className="pdh-khoi">
      <div className="pdh-khoi-dau"><h2>Phiếu tạo theo ngày và trạng thái hiện tại</h2>
        <span className="pdh-cg">{KEYS.map(([k, t]) => <i key={k} className={'k ' + k}>{t}</i>)}</span></div>
      <div className="pdh-bd">
        {ds.map((d) => { const tong = KEYS.reduce((s, [k]) => s + (d[k] || 0), 0); return (
          <div key={d.ngay} className="c" title={`${fmtNgay(d.ngay)}: ${tong} phiếu — ` + KEYS.map(([k, t]) => `${t} ${d[k] || 0}`).join(', ')}>
            <div className="cot" style={{ height: (tong / max) * 100 + '%' }}>{KEYS.slice().reverse().map(([k]) => d[k] ? <i key={k} className={k} style={{ flexGrow: d[k] }} /> : null)}</div>
            <span>{fmtNgay(d.ngay)}</span>
          </div>
        ); })}
      </div>
    </section>
  );
}

/* ================== VIỆC CẦN LÀM ================== */
function TabViec({ maSX, maDC, chNhac, chBS, dangTaiMa, moHoSo, moMa, bcViec }) {
  const Khoi = ({ tieu, mo, ds, rong, render, mau }) => (
    <section className={'pdh-khoi pdh-viec ' + mau}>
      <div className="pdh-khoi-dau"><h2>{tieu}<em>{ds == null ? '…' : ds.length}</em></h2><span>{mo}</span></div>
      <div className="pdh-viec-ds">{ds == null ? <p className="pdh-mo">Đang tải…</p> : ds.length ? ds.map(render) : <p className="pdh-mo">{rong}</p>}</div>
    </section>
  );
  return (
    <div className="pdh-tab-noi">
      <div className="pdh-cong"><span className="pdh-dem">Danh sách tự tổng hợp từ số liệu hiện tại — bấm từng dòng để mở chi tiết.</span>
        <button className="pdh-nut-phu" onClick={bcViec}>Chép danh sách việc</button></div>
      <div className="pdh-bon">
        <Khoi tieu="Cần sản xuất / nhập thêm" mo="Mã đang hết mà không cửa hàng nào còn tồn" mau="do" ds={dangTaiMa ? null : maSX} rong="Không có mã nào."
          render={(m) => <button key={m.barcode} onClick={() => moMa(m)}><b>{m.ma}</b><span>hết ở {m.so_ch_het} cửa hàng{m.gia ? ` · ${fmtSo(m.gia)}đ` : ''}</span></button>} />
        <Khoi tieu="Điều chuyển giữa cửa hàng" mo="Mã hết ở từ 2 cửa hàng nhưng nơi khác còn hàng" mau="vang" ds={dangTaiMa ? null : maDC} rong="Không có mã nào cần điều chuyển gấp."
          render={(m) => <button key={m.barcode} onClick={() => moMa(m)}><b>{m.ma}</b><span>{m.so_ch_het} CH hết · {m.so_ch_con} CH còn (tồn {fmtSo(m.tong_ton_con)})</span></button>} />
        <Khoi tieu="Nhắc kỷ luật đề nghị" mo="Cửa hàng bỏ lịch hoặc gửi trễ trong 30 ngày" mau="vang" ds={chNhac} rong="Tất cả cửa hàng đúng kỷ luật."
          render={(c) => <button key={c.ma_ch} onClick={() => moHoSo(c)}><b>{c.ten}</b><span>{c.bo_lich ? 'đang bỏ lịch kỳ này' : `${c.tre_lich} lần gửi trễ`} · xin cuối {fmtNgay(c.xin_cuoi)}</span></button>} />
        <Khoi tieu="Bổ sung tồn gấp" mo="Cửa hàng dưới 50% định mức tối thiểu" mau="xanh" ds={chBS} rong="Không cửa hàng nào dưới 50% định mức."
          render={(c) => <button key={c.ma_ch} onClick={() => moHoSo(c)}><b>{c.ten}</b><span>thiếu {fmtSo(c.sl_thieu)} SP · đạt {c.ton_dat}% định mức</span></button>} />
      </div>
    </div>
  );
}

/* ================== NGĂN CHI TIẾT CỬA HÀNG ================== */
function NganCH({ c, dong, bcCH }) {
  useEffect(() => { const h = (e) => { if (e.key === 'Escape') dong(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [dong]);
  const b = BAC(c.diem);
  return (
    <div className="kt-modal pdh-nen" onMouseDown={(e) => { if (e.target === e.currentTarget) dong(); }}>
      <aside className="pdh-ngan" role="dialog" aria-label={'Cửa hàng ' + c.ten}>
        <header className="pdh-ngan-dau">
          <div className="pdh-vong" style={{ '--m': b.mau, '--p': c.diem }}><b>{c.diem}</b></div>
          <div><h2>{c.ten}</h2><p>{c.ma_ch} · {c.khu_vuc} · Nhóm {c.nhom_ch}{c.chu_ky_ngay ? ` · chu kỳ ${c.chu_ky_ngay} ngày` : ''}</p>
            <span className="pdh-nhan" style={{ '--m': b.mau }}>{b.ten}</span></div>
          <button className="pdh-x" onClick={dong} aria-label="Đóng">×</button>
        </header>
        <div className="pdh-ngan-than">
          {c._loi && <div className="pdh-loi nho"><IcAlert /> Không tải được chi tiết — {c._loi}</div>}
          <div className="pdh-ngan-so">
            <div><b className="do">{fmtSo(c.so_ma_het ?? c.so_het)}</b><span>Mã đang hết</span></div>
            <div><b className="vang">{fmtSo(c.sl_thieu)}</b><span>SL thiếu định mức</span></div>
            <div><b>{fmtSo(c.tong_ton)}</b><span>Tồn hiện có{c.so_ma_ton != null ? ` · ${c.so_ma_ton} mã` : ''}</span></div>
            <div><b>{c.gia_tri_ton != null ? fmtSo(c.gia_tri_ton) + 'đ' : '—'}</b><span>Giá trị tồn</span></div>
          </div>
          <section className="pdh-muc"><h3>Việc cần làm</h3>
            {viecLam(c).map((v, i) => <p key={i} className={'pdh-viec-i ' + v.loai}>{v.txt}</p>)}
            <button className="pdh-nut-phu" onClick={() => bcCH(c)}>Chép báo cáo cửa hàng</button>
          </section>
          <section className="pdh-muc"><h3>Vì sao {c.diem} điểm</h3>
            {truDiem(c).map((t, i) => { const m = t.v == null ? '#9AA3B2' : BAC(t.v).mau; return (
              <div key={i} className="pdh-tru"><span>{t.ten}<em>{t.ts}</em></span><i><u style={{ width: (t.v ?? 0) + '%', background: m }} /></i><b style={{ color: m }}>{t.v ?? '—'}</b></div>
            ); })}
          </section>
          <section className="pdh-muc"><h3>Sản phẩm đang hết{c.so_ma_het ? ` · ${c.so_ma_het} mã` : ''}</h3>
            {c.ds_het == null ? <p className="pdh-mo">Đang tải…</p> : c.ds_het.length ? (
              <div className="pdh-cuon"><table className="pdh-bang gon">
                <thead><tr><th>Mã sản phẩm</th><th className="so">Giá</th><th className="so">Đã hết</th></tr></thead>
                <tbody>{c.ds_het.map((m, i) => <tr key={i} className="tinh"><td><b>{m.ma}</b></td><td className="so">{m.gia ? fmtSo(m.gia) + 'đ' : '—'}</td>
                  <td className={'so' + (m.so_ngay >= 7 ? ' do' : m.so_ngay >= 3 ? ' vang' : '')}>{m.so_ngay} ngày</td></tr>)}</tbody>
              </table></div>
            ) : <p className="pdh-mo">Không có sản phẩm nào đang hết.</p>}
          </section>
          <section className="pdh-muc"><h3>Kỷ luật đề nghị · 60 ngày{c.tuan_thu != null ? ` · tuân thủ ${c.tuan_thu}%` : ''}</h3>
            {c.lich_su_xin == null ? <p className="pdh-mo">Đang tải…</p> : c.lich_su_xin.length ? (
              <ol className="pdh-ls">{c.lich_su_xin.slice(0, 8).map((x, i) => (
                <li key={i} className={x.tre ? 'tre' : ''}><span>{fmtNgay(x.ngay)}</span><b>{x.tre ? 'Gửi trễ' : 'Đúng hạn'}</b><em>{x.trang_thai}</em></li>))}</ol>
            ) : <p className="pdh-mo">Chưa có đề nghị nào trong 60 ngày.</p>}
            {Array.isArray(c.lich_toi) && c.lich_toi.filter(Boolean).length > 0 && <p className="pdh-lich-toi">Lịch đề nghị tới: <b>{c.lich_toi.filter(Boolean).map(fmtNgay).join(' · ')}</b></p>}
          </section>
        </div>
      </aside>
    </div>
  );
}

/* ================== HỘP MÃ HÀNG ================== */
function HopMa({ hoMa, setHoMa }) {
  useEffect(() => { const h = (e) => { if (e.key === 'Escape') setHoMa(null); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [setHoMa]);
  const chonHet = hoMa.chonHet;
  const dsCon = useMemo(() => {
    const a = (hoMa.ds_con || []).map((c) => ({ ...c }));
    if (chonHet) { a.forEach((c) => { c._km = khoangCach(chonHet, c); }); a.sort((x, y) => (x._km ?? 1e9) - (y._km ?? 1e9)); }
    return a;
  }, [hoMa.ds_con, chonHet]);
  return (
    <div className="kt-modal pdh-nen giua" onMouseDown={(e) => { if (e.target === e.currentTarget) setHoMa(null); }}>
      <div className="pdh-hop">
        <header className="pdh-ngan-dau"><div><h2>{hoMa.ma}</h2><p>{hoMa.gia ? 'Giá ' + fmtSo(hoMa.gia) + 'đ · ' : ''}{(hoMa.ds_het || []).length} cửa hàng hết · {(hoMa.ds_con || []).length} cửa hàng còn hàng</p></div>
          <button className="pdh-x" onClick={() => setHoMa(null)} aria-label="Đóng">×</button></header>
        <div className="pdh-hop-than">
          {hoMa._loi && <div className="pdh-loi nho"><IcAlert /> {hoMa._loi}</div>}
          <p className="pdh-huong">Chọn một cửa hàng <b>đang hết</b> — cột bên phải tự xếp cửa hàng <b>còn hàng</b> gần nhất lên đầu.</p>
          <div className="pdh-hai-cot">
            <div><h3>Đang hết · {(hoMa.ds_het || []).length}</h3>
              <div className="pdh-cuon">{hoMa._load ? <p className="pdh-mo">Đang tải…</p> : (hoMa.ds_het || []).map((c) => (
                <button key={c.ma_ch} className={'pdh-dc het' + (chonHet?.ma_ch === c.ma_ch ? ' on' : '')} onClick={() => setHoMa({ ...hoMa, chonHet: c })}>
                  <div><b>{c.ten}</b><span>{c.ma_ch} · {c.khu_vuc}</span></div><em>{c.so_ngay} ngày</em></button>))}</div></div>
            <div><h3>Còn hàng · {dsCon.length}{chonHet ? ` · gần ${chonHet.ten}` : ''}</h3>
              <div className="pdh-cuon">{dsCon.map((c) => (
                <div key={c.ma_ch} className="pdh-dc"><div><b>{c.ten}</b><span>{c.ma_ch} · {c.khu_vuc}</span></div>
                  <em><b>{fmtSo(c.ton)}</b>{c._km != null && <small>{c._km} km</small>}</em></div>))}
                {!dsCon.length && !hoMa._load && <p className="pdh-mo">Không cửa hàng nào còn hàng — cần sản xuất.</p>}</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================== TÌM NHANH (Ctrl+K) ================== */
function TimNhanh({ ds, dsMa, dong, chonCH, chonMa }) {
  const [q, setQ] = useState('');
  const oRef = useRef(null);
  useEffect(() => { oRef.current?.focus(); const h = (e) => { if (e.key === 'Escape') dong(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [dong]);
  const kq = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return {
      ch: qq ? (ds || []).filter((c) => (c.ten + ' ' + c.ma_ch).toLowerCase().includes(qq)).slice(0, 7) : [...(ds || [])].sort((a, b) => a.diem - b.diem).slice(0, 6),
      ma: qq ? (dsMa || []).filter((m) => (m.ma + ' ' + m.barcode).toLowerCase().includes(qq)).slice(0, 5) : (dsMa || []).slice(0, 4),
    };
  }, [ds, dsMa, q]);
  return (
    <div className="kt-modal pdh-nen giua tren" onMouseDown={(e) => { if (e.target === e.currentTarget) dong(); }}>
      <div className="pdh-tim-nhanh">
        <label><IcSearch /><input ref={oRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Gõ tên / mã cửa hàng hoặc mã sản phẩm"
          onKeyDown={(e) => { if (e.key === 'Enter') { if (kq.ch[0]) chonCH(kq.ch[0]); else if (kq.ma[0]) chonMa(kq.ma[0]); } }} /><kbd>Esc</kbd></label>
        <div className="ds">
          {kq.ch.length > 0 && <h4>{q.trim() ? 'Cửa hàng' : 'Cửa hàng yếu nhất'}</h4>}
          {kq.ch.map((c) => { const b = BAC(c.diem); return (
            <button key={c.ma_ch} onClick={() => chonCH(c)}><i style={{ background: b.mau }} /><b>{c.ten}</b><span>{c.ma_ch} · {c.khu_vuc}</span><em style={{ color: b.mau }}>{c.diem}</em></button>); })}
          {kq.ma.length > 0 && <h4>Mã đang hết</h4>}
          {kq.ma.map((m) => (
            <button key={m.barcode} onClick={() => chonMa(m)}><i style={{ background: '#D9822B' }} /><b>{m.ma}</b><span>{m.so_ch_het} CH hết · {m.so_ch_con} CH còn</span><em>{m.gia ? fmtSo(m.gia) + 'đ' : ''}</em></button>))}
          {!kq.ch.length && !kq.ma.length && <p className="pdh-mo">Không tìm thấy — thử từ khoá khác.</p>}
        </div>
      </div>
    </div>
  );
}
