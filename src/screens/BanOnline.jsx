// NEW - 3.153: BÁN ONLINE — toàn bộ đơn online qua Nhanh.vn (TikTok, Shopee, Lazada, Facebook, Zalo OA, Website, Admin…)
//   Nguồn: Nhanh.vn Open API v3 (tự lấy 5 phút/lần, kéo bù từ 01/10/2026) + file báo cáo nhân viên để ĐỐI CHIẾU.
//   SQL 262/263 · Edge Function 'nhanh'.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { sb } from '../lib/supabase.js';
import { useApp } from '../App.jsx';
import { Sel, DateBox, isoVN } from '../lib/ui.jsx';
import { IcRefresh, IcSearch, IcAlert, IcClock, IcGuiLen, IcCheck } from '../lib/icons.jsx';
import NutXuat from '../lib/bao-cao/NutXuat.jsx';   // NEW - 3.154

/* ================= tiện ích ================= */
// NEW - 3.154: hằng số + định dạng dùng chung với file xuất (lib/bao-cao/hangSo.js)
import { fmt, tien, pct, pctTxt, ngayVN, tyLe, THU_TU_KENH, kenhTen, kenhMau, NHOM_KENH, TTN, NGANH, CS, LY_DO } from '../lib/bao-cao/hangSo.js';
const gioNgay = (s) => (s ? new Date(s).toLocaleString('vi', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—');
const gioGon = (s) => { if (!s) return '—'; const d = new Date(s); return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString('vi', { hour: '2-digit', minute: '2-digit' }) : gioNgay(s); };
const truNgay = (n, tu = new Date()) => { const d = new Date(tu); d.setDate(d.getDate() - n); return isoVN(d); };

const NHANH = [
  ['Hôm nay', () => [isoVN(), isoVN()]],
  ['Hôm qua', () => [truNgay(1), truNgay(1)]],
  ['7 ngày', () => [truNgay(6), isoVN()]],
  ['30 ngày', () => [truNgay(29), isoVN()]],
  ['Tháng này', () => { const d = new Date(); return [isoVN(new Date(d.getFullYear(), d.getMonth(), 1)), isoVN()]; }],
  ['Tháng trước', () => { const d = new Date(); return [isoVN(new Date(d.getFullYear(), d.getMonth() - 1, 1)), isoVN(new Date(d.getFullYear(), d.getMonth(), 0))]; }],
];

// nhớ trong phiên: kết quả theo bộ lọc + phiên bản dữ liệu (chỉ tải lại khi có dữ liệu mới)
const boNho = new Map();
const nhoMan = { loc: null, the: 'tq' };
const khoaNho = (loai, p) => loai + '|' + JSON.stringify(p || {});

// NEW - 3.156.1: NHỚ BÁO CÁO TRÊN MÁY — mở lại app hiện ngay số lần trước (rồi tự cập nhật ngầm), giữ 5 bộ lọc gần nhất
const LS_BC = 'nh_bc_nho';
let daNapLs = '';
const docLs = (ma) => { try { const m = JSON.parse(localStorage.getItem(LS_BC) || 'null'); return m && m.ma === ma && m.ds ? m.ds : {}; } catch { return {}; } };
function napLs(ma) {
  if (daNapLs === ma) return;
  daNapLs = ma;
  for (const [k, v] of Object.entries(docLs(ma))) if (!boNho.has(k)) boNho.set(k, v);
}
function ghiLs(ma, k, v) {
  const ds = { ...docLs(ma), [k]: { ...v, luc: Date.now() } };
  const xep = Object.entries(ds).sort((a, b) => (b[1].luc || 0) - (a[1].luc || 0));
  for (const n of [5, 3, 1]) {
    try { localStorage.setItem(LS_BC, JSON.stringify({ ma, ds: Object.fromEntries(xep.slice(0, n)) })); return; } catch { /* đầy → giữ ít hơn */ }
  }
}

function Lech({ moi, cu, nguoc }) {
  const v = tyLe(Number(moi) || 0, Number(cu) || 0);
  if (v == null) return <span className="tts-lech moi" title="Kỳ trước chưa có số">mới</span>;
  if (Math.abs(v) < 0.5) return <span className="tts-lech bang" title="So với kỳ trước">= 0%</span>;
  const tot = nguoc ? v < 0 : v > 0;
  return <span className={'tts-lech ' + (tot ? 'tang' : 'giam')} title="So với kỳ trước">{v > 0 ? '▲' : '▼'} {Math.abs(v).toLocaleString('vi', { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 1 })}%</span>;
}
const KenhChip = ({ k }) => <span className="tts-kenh" style={{ '--m': kenhMau(k) }}><i />{kenhTen(k)}</span>;
const TtChip = ({ n, ten }) => { const c = TTN[n] || TTN.xl; return <span className={'odn-chip ' + c[1]}>{ten || c[0]}</span>; };

function useSap(ds, mac) {
  const [sap, setSap] = useState(mac);
  const rows = useMemo(() => {
    const a = [...(ds || [])];
    a.sort((x, y) => { const u = x[sap.k] ?? '', v = y[sap.k] ?? ''; return (u < v ? -1 : u > v ? 1 : 0) * sap.d; });
    return a;
  }, [ds, sap]);
  const th = (k, ten, cls = '') => (
    <th className={'sap ' + cls} onClick={() => setSap((s) => ({ k, d: s.k === k ? -s.d : -1 }))}>{ten}{sap.k === k ? (sap.d < 0 ? ' ↓' : ' ↑') : ''}</th>
  );
  return [rows, th];
}
function useHienDan(ds, buoc = 300) {
  const [n, setN] = useState(buoc);
  useEffect(() => { setN(buoc); }, [ds, buoc]);
  const hien = ds.length > n ? ds.slice(0, n) : ds;
  const chan = ds.length > n ? (
    <div className="odn-chan-bang tts-hien-them">
      <span>Đang hiện {fmt(n)}/{fmt(ds.length)} dòng — sắp xếp và tổng đã tính trên đủ {fmt(ds.length)} dòng</span>
      <button className="tts-link" onClick={() => setN((x) => x + buoc)}>Hiện thêm {fmt(Math.min(buoc, ds.length - n))}</button>
      <button className="tts-link" onClick={() => setN(ds.length)}>Hiện tất cả</button>
    </div>) : null;
  return [hien, chan];
}
function Khung({ tieu, phu, children, cls = '', them }) {
  return (
    <div className={'tts-khung ' + cls}>
      <div className="tts-khung-dau"><b>{tieu}</b>{phu && <span>{phu}</span>}{them}</div>
      {children}
    </div>
  );
}
function Dong({ ten, so, phu, ty, mau, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={'tts-dong' + (onClick ? ' bam' : '')} onClick={onClick}>
      <div className="tts-dong-tren"><span className="tts-dong-ten">{ten}</span><b>{so}</b></div>
      <div className="tts-dong-duoi"><div className="tts-dong-thanh"><i style={{ width: Math.min(100, Math.max(ty || 0, 0)) + '%', background: mau }} /></div>{phu && <small>{phu}</small>}</div>
    </Tag>
  );
}

// ô hình sản phẩm (hình nonson.vn trong danh mục) — rê chuột phóng to, bấm xem lớn
function AnhSp({ url, ma, ten, co = 40 }) {
  const [loi, setLoi] = useState(false);
  const [phong, setPhong] = useState(null);
  const [xem, setXem] = useState(false);
  useEffect(() => {
    if (!xem) return undefined;
    const h = (e) => { if (e.key === 'Escape') setXem(false); };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [xem]);
  const kt = { width: co, height: co };
  if (!url || loi) return <span className="tts-anh trong" style={kt} />;
  const viTri = (e) => setPhong({ x: e.clientX, y: e.clientY });
  return (<>
    <img className="tts-anh" style={kt} src={url} alt={ma} loading="lazy" decoding="async" onError={() => setLoi(true)}
      onMouseEnter={viTri} onMouseMove={viTri} onMouseLeave={() => setPhong(null)}
      onClick={(e) => { e.stopPropagation(); setPhong(null); setXem(true); }} />
    {phong && !xem && createPortal(<img className="sp-zoom" src={url} alt=""
      style={{ left: Math.min(phong.x + 18, window.innerWidth - 206), top: Math.max(8, Math.min(phong.y - 95, window.innerHeight - 206)) }} />, document.body)}
    {xem && createPortal(<div className="img-lightbox tts-anh-xem" onClick={(e) => { e.stopPropagation(); setXem(false); }}>
      <figure><img src={url} alt={ma} /><figcaption><b>{ma}</b>{ten ? <span>{ten}</span> : null}</figcaption></figure></div>, document.body)}
  </>);
}

/* ================= MÀN CHÍNH ================= */
export default function BanOnline() {
  const { user, baoToast } = useApp();
  napLs(user.ma_dang_nhap);   // NEW - 3.156.1
  const [loc, setLoc] = useState(() => nhoMan.loc || { tu: truNgay(6), den: isoVN(), kenh: '', shop: '', tt: '', nganh: '', cs: '' });
  const [q, setQ] = useState('');
  const [qTre, setQTre] = useState('');
  const [the, setThe] = useState(nhoMan.the);
  const [api, setApi] = useState(() => boNho.get('api')?.data || null);
  const [apiXong, setApiXong] = useState(!!boNho.get('api'));
  const [bc, setBc] = useState(null);
  const [dang, setDang] = useState(false);
  const [loi, setLoi] = useState('');
  const [nap, setNap] = useState(false);
  useEffect(() => { nhoMan.loc = loc; }, [loc]);
  useEffect(() => { nhoMan.the = the; }, [the]);
  useEffect(() => { const t = setTimeout(() => setQTre(q.trim()), 400); return () => clearTimeout(t); }, [q]);

  const pLoc = useMemo(() => ({
    tu: loc.tu, den: loc.den,
    ...(loc.kenh ? { kenh: [Number(loc.kenh)] } : {}), ...(loc.shop ? { shop: [loc.shop] } : {}),
    ...(loc.tt ? { tt: [loc.tt] } : {}), ...(loc.nganh ? { nganh: [loc.nganh] } : {}), ...(loc.cs ? { cs: loc.cs } : {}),
    ...(qTre ? { q: qTre } : {}),
  }), [loc, qTre]);
  const phienBan = api?.phien_ban || '';

  const taiApi = useCallback(async () => {
    const { data, error } = await sb.rpc('fn_nh_api_tt', { p_token: user.token });
    if (!error && data) { boNho.set('api', { data }); setApi(data); }
    setApiXong(true);
  }, [user.token]);
  useEffect(() => { taiApi(); }, [taiApi]);
  useEffect(() => {
    const hoi = () => { if (document.visibilityState === 'visible') taiApi(); };
    const t = setInterval(hoi, 60000);
    document.addEventListener('visibilitychange', hoi);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', hoi); };
  }, [taiApi]);
  useEffect(() => {   // đang kéo → hỏi lại mỗi 8 giây
    if (!api?.dang_keo) return undefined;
    const t = setTimeout(taiApi, 8000); return () => clearTimeout(t);
  }, [api, taiApi]);

  const khoa = khoaNho('bc', pLoc);
  useEffect(() => {
    const c = boNho.get(khoa);
    if (c) { setBc(c.data); setLoi(''); }
    if (!apiXong || (c && c.pb === phienBan)) return undefined;
    let huy = false;
    setDang(true);
    sb.rpc('fn_nh_bao_cao', { p_token: user.token, p_loc: pLoc }).then(({ data, error }) => {
      if (huy) return;
      setDang(false);
      if (error) { setLoi(error.message); return; }
      boNho.set(khoa, { data, pb: phienBan }); setLoi(''); setBc(data);
      ghiLs(user.ma_dang_nhap, khoa, { data, pb: phienBan });   // NEW - 3.156.1
    });
    return () => { huy = true; };
  }, [khoa, pLoc, phienBan, apiXong, user.token, user.ma_dang_nhap]);

  // NEW - 3.156.1: TẢI SẴN — sau khi mở màn / đổi bộ lọc (trừ ngày), tải ngầm đủ 6 mốc ngày (Hôm nay … Tháng trước)
  // cùng bộ lọc đó + danh sách đơn của bộ lọc đang xem → bấm sang mốc khác / thẻ Đơn hàng là có số ngay.
  // Máy chủ cũng nhớ kết quả (SQL 270) nên lần tải sau chỉ mất chưa tới 1 giây.
  const pbRef = useRef(phienBan); pbRef.current = phienBan;
  const nenLoc = useMemo(() => { const { tu: _a, den: _b, ...r } = pLoc; return r; }, [pLoc]);   // eslint-disable-line no-unused-vars
  const khoaNen = JSON.stringify(nenLoc);
  useEffect(() => {
    if (!apiXong || nenLoc.q) return undefined;
    let huy = false;
    const t = setTimeout(async () => {
      for (const [, f] of NHANH) {
        if (huy || document.visibilityState === 'hidden') return;
        const [tu, den] = f(); const p = { tu, den, ...nenLoc }; const k = khoaNho('bc', p);
        if (boNho.get(k)?.pb === pbRef.current) continue;
        const { data, error } = await sb.rpc('fn_nh_bao_cao', { p_token: user.token, p_loc: p });
        if (!huy && !error && data && !(boNho.get(k)?.pb === pbRef.current)) boNho.set(k, { data, pb: pbRef.current });
      }
    }, 2500);
    return () => { huy = true; clearTimeout(t); };
  }, [apiXong, khoaNen, user.token]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {   // danh sách đơn của bộ lọc đang xem
    if (!bc || dang || !apiXong) return undefined;
    const k = khoaNho('don', pLoc);
    if (boNho.get(k)?.pb === phienBan) return undefined;
    let huy = false;
    const t = setTimeout(() => sb.rpc('fn_nh_don_ds', { p_token: user.token, p_loc: pLoc, p_gioi_han: 200 }).then(({ data, error }) => {
      if (!huy && !error && data && !(boNho.get(k)?.pb === phienBan)) boNho.set(k, { data, pb: phienBan });
    }), 1200);
    return () => { huy = true; clearTimeout(t); };
  }, [bc, dang, apiXong, pLoc, phienBan, user.token]);

  const datLoc = (k) => (v) => setLoc((l) => ({ ...l, [k]: v }));
  const coLoc = !!(q || loc.kenh || loc.shop || loc.tt || loc.nganh || loc.cs);
  const t = bc?.tong || {}, tr = bc?.truoc || {};
  const laiGop = t.dt_co_gv > 0 && t.gv > 0 ? t.dt_co_gv - t.gv : null;
  const tongKy = (t.don || 0) + (t.don_huy || 0);
  const kenhOpt = [{ value: '', label: 'Mọi kênh' }, ...THU_TU_KENH.filter((k) => (bc?.kenh || []).some((x) => x.k === k) || k === Number(loc.kenh))
    .map((k) => ({ value: String(k), label: kenhTen(k) })),
    ...(bc?.kenh || []).filter((x) => !THU_TU_KENH.includes(x.k)).map((x) => ({ value: String(x.k), label: x.ten }))];
  const shopOpt = [{ value: '', label: 'Mọi gian hàng' }, ...(bc?.shop || []).map((s) => ({ value: s.shop, label: s.shop, sub: s.ten_kenh + ' · ' + tien(s.dt) }))];

  const KPI = [
    ['', 'Doanh số', tien(t.dt), <Lech moi={t.dt} cu={tr.dt} />, `${fmt(t.sl)} sản phẩm · không tính đơn huỷ`],
    ['', 'Đơn', fmt(t.don), <Lech moi={t.don} cu={tr.don} />, `${fmt(t.so_shop || 0)} gian hàng / kênh`],
    ['', 'Giá TB / đơn', t.don ? tien(t.dt / t.don) : '—', <Lech moi={t.don ? t.dt / t.don : 0} cu={tr.don ? tr.dt / tr.don : 0} />, `${t.don ? (t.sl / t.don).toLocaleString('vi', { maximumFractionDigits: 2 }) : 0} sp / đơn`],
    ['tc', 'Thành công', tien(t.dt_tc), <Lech moi={t.dt_tc} cu={tr.dt_tc} />, `${fmt(t.don_tc)} đơn · ${pctTxt(t.don_tc || 0, t.don || 0)}`],
    ['giao', 'Đang giao / xử lý', fmt((t.don_giao || 0) + (t.don_xl || 0)), null, `${tien(t.dt_giao)} chưa chốt`],
    ['hoan', 'Hoàn', fmt(t.don_hoan), <Lech moi={t.don_hoan} cu={tr.don_hoan} nguoc />, `${pctTxt(t.don_hoan || 0, t.don || 0)} đơn · ${tien(t.dt_hoan)}`, 'canh'],
    ['huy', 'Huỷ', fmt(t.don_huy), <Lech moi={t.don_huy} cu={tr.don_huy} nguoc />, `${pctTxt(t.don_huy || 0, tongKy)} tổng đơn đặt`, 'do'],
    ['', laiGop != null ? 'Lãi gộp' : 'Phí sàn', laiGop != null ? tien(laiGop) : tien(t.phi_san), null,
      laiGop != null ? `${pctTxt(laiGop, t.dt_co_gv)} doanh số có giá vốn` : `${pctTxt(t.phi_san || 0, t.dt || 0)} doanh số`],
  ];

  // NEW - 3.154: XUẤT — báo cáo PDF / dữ liệu Excel theo đúng bộ lọc đang xem
  const moTaLoc = () => [loc.kenh ? 'Kênh ' + kenhTen(Number(loc.kenh)) : '', loc.shop ? 'Gian hàng ' + loc.shop : '', loc.nganh ? 'Ngành ' + (NGANH[loc.nganh] || loc.nganh) : '',
    loc.cs ? 'Hàng ' + (CS[loc.cs] || loc.cs).toLowerCase() : '', loc.tt ? 'Trạng thái ' + (TTN[loc.tt]?.[0] || loc.tt).toLowerCase() : '', qTre ? `Tìm "${qTre}"` : '']
    .filter(Boolean).join('  ·  ') || 'Toàn bộ kênh bán online';
  const meta = () => ({ loc: moTaLoc(), nguoi: [user.ten, user.ma_dang_nhap].filter(Boolean).join(' · '),
    luc: new Date().toLocaleString('vi', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) });
  const taoBaoCao = async (bao) => {
    bao('Đang dựng báo cáo…');
    const [{ docOnline }, { taoPdfBlob }] = await Promise.all([import('../lib/bao-cao/online.js'), import('../lib/bao-cao/pdf.js')]);
    const blob = await taoPdfBlob(docOnline(bc, meta()));
    return { blob, ten: `BaoCao_Online_${bc.tu}_${bc.den}.pdf` };
  };
  const taoDuLieu = async (bao) => {
    const [{ sheetsOnline }, { excelBlob, layHetDong }] = await Promise.all([import('../lib/bao-cao/online.js'), import('../lib/bao-cao/excel.js')]);
    bao('Đang lấy từng dòng hàng…', 0);
    const dong = await layHetDong(sb, 'fn_nh_xuat', { p_token: user.token, p_loc: pLoc }, (a, b) => bao(`Đang lấy dòng hàng ${fmt(a)} / ${fmt(b)}`, b ? (a / b) * 0.85 : null));
    bao('Đang tạo file Excel…', 0.9);
    await new Promise((r) => setTimeout(r, 30));
    const blob = await excelBlob(sheetsOnline(bc, dong, meta()));
    return { blob, ten: `DuLieu_Online_${bc.tu}_${bc.den}.xlsx` };
  };

  const ds = (bc?.tong?.don || 0) + (bc?.tong?.don_huy || 0);
  return (
    <>
      <div className="cmdbar">
        <h1>Online</h1>
        <div className="sub">Toàn bộ đơn online qua Nhanh.vn — TikTok, Shopee, Lazada, Facebook, Zalo OA, Website, Admin.</div>
      </div>
      <div className="odn tts bo">
        <div className="odn-dong-bo">
          <span className="odn-db-i"><IcClock /> Dữ liệu <b>{api?.tong?.tu ? ngayVN(api.tong.tu) : '—'}</b> – <b>{api?.tong?.den ? ngayVN(api.tong.den) : '—'}</b>
            <em>· {fmt(api?.tong?.don || 0)} đơn</em></span>
          <span className="odn-api">
            {api?.ket_noi
              ? <i className="ok" title={'Nhanh.vn đã kết nối · tự cập nhật 5 phút/lần' + (api.keo_luc ? '\nLấy đơn lúc ' + gioNgay(api.keo_luc) : '')}>{api.dang_keo ? 'Đang lấy đơn…' : 'Cập nhật ' + gioGon(api.keo_luc)}</i>
              : <i className="cho">Chưa kết nối Nhanh.vn</i>}
            {api?.ket_noi && !api.bf_xong && <i className="lech">Đang lấy đơn cũ tới {ngayVN(api.bf_ngay || api.ds_tu).slice(0, 5)}</i>}
            {api?.loi && <i className="do" title={api.loi}>Lỗi kết nối</i>}
          </span>
          {!api?.ket_noi && <button className="odn-nut-phu" onClick={() => setThe('kn')}>Kết nối Nhanh.vn</button>}
          <NutXuat sanSang={!!bc && !dang} taoBaoCao={taoBaoCao} taoDuLieu={taoDuLieu} ghiChu="Theo đúng khoảng ngày + bộ lọc đang xem" />
          <button className="btn btn-ai odn-nut-chinh" onClick={() => setNap(true)}><IcGuiLen /> Nạp file báo cáo</button>
        </div>

        <div className="odn-loc">
          <label className="odn-tim"><IcSearch />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mã đơn Nhanh, mã đơn sàn, mã hàng, số điện thoại, mã vận đơn…" /></label>
          <DateBox label="Từ" value={loc.tu} onChange={datLoc('tu')} />
          <DateBox label="Đến" value={loc.den} onChange={datLoc('den')} />
          <Sel value={loc.kenh} onChange={datLoc('kenh')} placeholder="Kênh" options={kenhOpt} />
          <Sel value={loc.shop} onChange={datLoc('shop')} placeholder="Gian hàng" timKiem options={shopOpt} />
          <Sel value={loc.nganh} onChange={datLoc('nganh')} placeholder="Ngành"
            options={[{ value: '', label: 'Mọi ngành' }, ...Object.entries(NGANH).map(([k, v]) => ({ value: k, label: v }))]} />
          <Sel value={loc.cs} onChange={datLoc('cs')} placeholder="Chính / Sale"
            options={[{ value: '', label: 'Chính + Sale' }, { value: 'chinh', label: 'Hàng chính' }, { value: 'sale', label: 'Hàng sale' }]} />
          <Sel value={loc.tt} onChange={datLoc('tt')} placeholder="Trạng thái"
            options={[{ value: '', label: 'Mọi trạng thái' }, ...Object.entries(TTN).map(([k, [ten]]) => ({ value: k, label: ten }))]} />
          {coLoc && <button className="odn-nut-phu" onClick={() => { setQ(''); setLoc((l) => ({ ...l, kenh: '', shop: '', tt: '', nganh: '', cs: '' })); }}>Bỏ lọc</button>}
        </div>
        <div className="tts-nhanh">
          {NHANH.map(([ten, f]) => { const [a, b] = f(); return <button key={ten} className={loc.tu === a && loc.den === b ? 'on' : ''} onClick={() => setLoc((l) => ({ ...l, tu: a, den: b }))}>{ten}</button>; })}
          {bc && <span className="odn-phu">so với kỳ trước {ngayVN(bc.tu_truoc).slice(0, 5)}–{ngayVN(bc.den_truoc)}</span>}
          {dang && <span className="odn-phu">{bc ? 'Đang cập nhật số mới…' : 'Đang tải…'}</span>}
          {!dang && bc?.nho_luc && <span className="odn-phu" title="Báo cáo được tính sẵn trên máy chủ, tự tính lại khi có đơn mới (tối đa 10 phút / lần)">· số liệu lúc {gioGon(bc.nho_luc)}</span>}
        </div>

        {loi && <div className="odn-bao do"><IcAlert /> Không tải được: {loi} <button onClick={() => { boNho.delete(khoa); setLoi(''); taiApi(); }}>Thử lại</button></div>}

        <div className="odn-kpi bo-kpi">
          {KPI.map(([k, ten, so, lech, phu, mau], i) => (
            <button key={i} className={'odn-k' + (k && loc.tt === k ? ' on' : '') + (mau && Number(String(so).replace(/\D/g, '')) > 0 ? ' ' + mau : '')}
              onClick={() => k && setLoc((l) => ({ ...l, tt: l.tt === k ? '' : k }))} style={k ? undefined : { cursor: 'default' }}>
              <b>{bc ? so : '…'}</b><span>{ten} {bc && lech}</span>{bc && <em>{phu}</em>}
            </button>
          ))}
        </div>

        <div className="odn-the" role="tablist">
          {[['tq', 'Tổng quan'], ['kenh', 'Kênh & gian hàng', bc?.shop?.length], ['sp', 'Sản phẩm', bc?.sp?.length], ['nganh', 'Ngành · Chính / Sale'],
            ['vc', 'Vận chuyển & hoàn', bc?.hvc?.length], ['nv', 'Nhân viên chốt đơn', bc?.nv?.length], ['tinh', 'Khu vực', bc?.tinh?.length],
            ['tt', 'TikTok × ID', bc?.tiktok?.don || null], ['don', 'Đơn hàng', ds || null], ['ds', 'Đối soát'], ['kn', api?.ket_noi ? 'Kết nối' : 'Kết nối ●']].map(([k, ten, so]) => (
            <button key={k} role="tab" aria-selected={the === k} className={the === k ? 'on' : ''} onClick={() => setThe(k)}>
              {ten}{so != null && so !== 0 && <i>{fmt(so)}</i>}
            </button>
          ))}
        </div>

        {the === 'kn' ? <KetNoi api={api} xong={taiApi} />
          : the === 'ds' ? <DoiSoatFile pLoc={{ tu: loc.tu, den: loc.den }} phienBan={phienBan} apiXong={apiXong} moNap={() => setNap(true)} />
          : the === 'don' ? <DsDon pLoc={pLoc} phienBan={phienBan} apiXong={apiXong} />
          : !bc ? <div className="odn-bang-khung"><div className="odn-trong">{dang ? 'Đang tải báo cáo…' : 'Chưa có số liệu'}</div></div>
          : the === 'tq' ? <TongQuan bc={bc} chonKenh={(k) => setLoc((l) => ({ ...l, kenh: String(k) }))} />
          : the === 'kenh' ? <BangKenh bc={bc} chonShop={(s) => { setLoc((l) => ({ ...l, shop: s })); baoToast('Đang lọc theo gian hàng ' + s); }} />
          : the === 'sp' ? <BangSp ds={bc.sp} />
          : the === 'nganh' ? <NganhCs bc={bc} chon={(nganh, cs) => setLoc((l) => ({ ...l, nganh, cs }))} />
          : the === 'vc' ? <VanChuyen bc={bc} />
          : the === 'nv' ? <BangNv ds={bc.nv} />
          : the === 'tinh' ? <BangTinh ds={bc.tinh} />
          : <TikTokId bc={bc} />}

        {bc && ds === 0 && !dang && (api?.tong?.don || 0) === 0 && the !== 'kn' && (
          <div className="tts-trong">
            <b>Chưa có đơn online nào trong app</b>
            <p>Bấm <b>Kết nối Nhanh.vn</b> để đơn tự về mỗi 5 phút (kéo bù từ {ngayVN(api?.ds_tu || '2026-10-01')}), hoặc <b>Nạp file báo cáo</b> xuất từ Nhanh để xem ngay.</p>
          </div>
        )}
      </div>
      {nap && <HopNap dong={() => setNap(false)} xong={taiApi} />}
    </>
  );
}

/* ================= Tổng quan ================= */
function BieuDoKenh({ bc, chiSo }) {
  const ref = useRef(null);
  const [rong, setRong] = useState(900);
  const [tro, setTro] = useState(null);
  useEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setRong(Math.max(320, Math.floor(e.contentRect.width))));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const { ngays, kenhs, m } = useMemo(() => {
    const m0 = new Map(); const ks = new Set();
    for (const x of bc.theo_ngay || []) { ks.add(x.kenh); const k = x.k; if (!m0.has(k)) m0.set(k, {}); m0.get(k)[x.kenh] = x; }
    const ds = []; const a = new Date(bc.tu + 'T00:00:00'); const b = new Date(bc.den + 'T00:00:00');
    for (let d = new Date(a); d <= b && ds.length < 800; d.setDate(d.getDate() + 1)) ds.push(isoVN(d));
    const thu = [...ks].sort((x, y) => (THU_TU_KENH.indexOf(x) + 1 || 99) - (THU_TU_KENH.indexOf(y) + 1 || 99));
    return { ngays: ds, kenhs: thu, m: m0 };
  }, [bc]);
  const cao = 240, le = { t: 12, r: 12, b: 26, l: 56 };
  const w = rong - le.l - le.r, h = cao - le.t - le.b, n = ngays.length;
  const tong = ngays.map((d) => kenhs.reduce((s, k) => s + Number(m.get(d)?.[k]?.[chiSo] || 0), 0));
  const maxV = Math.max(1, ...tong);
  const p10 = 10 ** Math.floor(Math.log10(maxV)); const mm = maxV / p10;
  const max = (mm <= 1 ? 1 : mm <= 2 ? 2 : mm <= 2.5 ? 2.5 : mm <= 5 ? 5 : 10) * p10;
  const bw = Math.max(2, Math.min(28, (w / n) * 0.7));
  const x = (i) => le.l + (i + 0.5) * (w / n);
  const y = (v) => le.t + h - (v / max) * h;
  const buoc = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(w / 56))));
  const dd = (v) => (chiSo === 'dt' ? tien(v) : fmt(Math.round(v)));
  return (
    <div className="tts-bd" ref={ref}>
      <svg width={rong} height={cao} role="img" aria-label="Doanh số theo ngày, chia theo kênh"
        onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const i = Math.floor(((e.clientX - r.left - le.l) / w) * n); setTro(i >= 0 && i < n ? i : null); }}
        onMouseLeave={() => setTro(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (<g key={f}><line x1={le.l} x2={le.l + w} y1={y(f * max)} y2={y(f * max)} className="tts-bd-luoi" />
          <text x={le.l - 8} y={y(f * max) + 4} textAnchor="end" className="tts-bd-truc">{dd(f * max)}</text></g>))}
        {ngays.map((d, i) => {
          let acc = 0;
          const segs = kenhs.map((k) => { const v = Number(m.get(d)?.[k]?.[chiSo] || 0); const y0 = y(acc); acc += v; return v > 0 ? { k, y1: y(acc), y0 } : null; }).filter(Boolean);
          return (<g key={d} opacity={tro != null && tro !== i ? 0.55 : 1}>
            {segs.map((s, j) => <rect key={s.k} x={x(i) - bw / 2} y={s.y1 + (j < segs.length - 1 ? 0 : 0)} width={bw} height={Math.max(0, s.y0 - s.y1 - (segs.length > 1 ? 1 : 0))}
              rx={j === segs.length - 1 ? 3 : 0} fill={kenhMau(s.k)} />)}
          </g>);
        })}
        {ngays.map((d, i) => (i % buoc === 0 || i === n - 1) && (i === n - 1 || n - 1 - i >= Math.max(1, buoc * 0.8)) &&
          <text key={d} x={x(i)} y={cao - 8} textAnchor="middle" className="tts-bd-truc">{ngayVN(d).slice(0, 5)}</text>)}
      </svg>
      {tro != null && (
        <div className="tts-bd-hop" style={{ left: Math.min(x(tro) + 14, rong - 230), top: 8 }}>
          <b>{ngayVN(ngays[tro])} · {dd(tong[tro])}</b>
          {[...kenhs].reverse().map((k) => { const v = Number(m.get(ngays[tro])?.[k]?.[chiSo] || 0); return v ? (
            <div key={k}><i style={{ background: kenhMau(k) }} /><span>{kenhTen(k)}</span><b>{dd(v)}</b></div>) : null; })}
        </div>
      )}
      <div className="tts-td-chu-giai">{kenhs.map((k) => <span key={k}><i style={{ borderTopColor: kenhMau(k), borderTopWidth: 8 }} />{kenhTen(k)}</span>)}</div>
    </div>
  );
}

function TongQuan({ bc, chonKenh }) {
  const [chiSo, setChiSo] = useState('dt');
  const t = bc.tong || {};
  const kenh = bc.kenh || [];
  const tongDt = kenh.reduce((s, x) => s + (x.dt || 0), 0);
  const nhom = ['san', 'web'].map((g) => ({ g, dt: kenh.filter((x) => x.nhom === g).reduce((s, x) => s + x.dt, 0), don: kenh.filter((x) => x.nhom === g).reduce((s, x) => s + x.don, 0) }));
  const pheu = [['tc', t.don_tc], ['giao', t.don_giao], ['xl', t.don_xl], ['hoan', t.don_hoan], ['tb', t.don_tb], ['huy', t.don_huy]];
  const tongPheu = pheu.reduce((s, [, v]) => s + (v || 0), 0);
  const MAU_PHEU = { tc: '#1baf7a', giao: '#2a78d6', xl: '#A7B0BF', hoan: '#eda100', tb: '#e34948', huy: '#B0115C' };
  const gio = bc.gio || [];
  const gMax = Math.max(1, ...gio.map((x) => x.dt || 0));
  const gDinh = gio.reduce((a, x) => (x.dt > (a?.dt || 0) ? x : a), null);
  const top = (bc.sp || []).slice(0, 8);
  const spMax = Math.max(1, ...top.map((x) => x.dt));
  return (
    <div className="tts-tq">
      <Khung tieu={{ dt: 'Doanh số', don: 'Số đơn', sl: 'Sản phẩm bán' }[chiSo] + ' theo ngày · theo kênh'} phu="rê chuột xem từng kênh · không tính đơn huỷ"
        them={<div className="tts-nhanh nho bo-chi-so">{[['dt', 'Doanh số'], ['don', 'Đơn'], ['sl', 'Sản phẩm']].map(([k, ten]) => (
          <button key={k} className={chiSo === k ? 'on' : ''} onClick={() => setChiSo(k)}>{ten}</button>))}</div>}>
        <BieuDoKenh bc={bc} chiSo={chiSo} />
      </Khung>

      <div className="tts-luoi3">
        <Khung tieu="Kênh bán" phu="bấm để lọc">
          <div className="bo-nhom">{nhom.map((x) => (
            <div key={x.g}><span>{NHOM_KENH[x.g]}</span><b>{tien(x.dt)}</b><em>{pctTxt(x.dt, tongDt)} · {fmt(x.don)} đơn</em></div>))}</div>
          <div className="tts-dong-ds">{kenh.map((x) => (
            <Dong key={x.k} ten={<KenhChip k={x.k} />} so={tien(x.dt)} phu={`${fmt(x.don)} đơn · ${pctTxt(x.dt, tongDt)} · hoàn ${pctTxt(x.hoan, x.don)}`}
              ty={pct(x.dt, Math.max(1, ...kenh.map((y) => y.dt)))} mau={kenhMau(x.k)} onClick={() => chonKenh(x.k)} />))}</div>
        </Khung>
        <Khung tieu="Trạng thái đơn" phu={`${fmt(tongPheu)} đơn đã đặt`}>
          <div className="bo-pheu">{pheu.filter(([, v]) => v > 0).map(([k, v]) => (
            <i key={k} style={{ width: (v / Math.max(1, tongPheu)) * 100 + '%', background: MAU_PHEU[k] }} title={`${TTN[k][0]}: ${fmt(v)} đơn`} />))}</div>
          <div className="tts-dong-ds">{pheu.map(([k, v]) => (
            <Dong key={k} ten={<span className="bo-cham"><i style={{ background: MAU_PHEU[k] }} />{TTN[k][0]}</span>} so={fmt(v || 0)} phu={pctTxt(v || 0, tongPheu)}
              ty={pct(v || 0, tongPheu)} mau={MAU_PHEU[k]} />))}</div>
        </Khung>
        <Khung tieu="Giờ chốt đơn" phu={gDinh ? `mạnh nhất ${gDinh.g}h–${gDinh.g + 1}h` : ''}>
          <div className="bo-gio">{gio.map((x) => (
            <i key={x.g} style={{ height: Math.max(2, (x.dt / gMax) * 100) + '%' }} title={`${x.g}h–${x.g + 1}h: ${fmt(x.don)} đơn · ${tien(x.dt)}`} />))}</div>
          <div className="tts-24-truc"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>24h</span></div>
          <div className="bo-mini">
            <div><span>Khách (theo SĐT)</span><b>{fmt(t.khach)}</b></div>
            <div><span>Mua ≥ 2 đơn</span><b>{fmt(t.khach_lap)}</b></div>
            <div><span>Số mã bán</span><b>{fmt(t.so_ma)}</b></div>
          </div>
        </Khung>
      </div>

      <div className="bo-luoi2">
        <NganhCs bc={bc} gon />
        <Khung tieu="Bán chạy nhất" phu="theo doanh số · xem đủ ở thẻ Sản phẩm">
          <div className="bo-top">{top.map((x, i) => (
            <div key={x.ma} className="bo-top-dong">
              <span className="bo-top-so">{i + 1}</span>
              <AnhSp url={x.hinh} ma={x.ma} ten={x.ten} co={34} />
              <span className="bo-top-ma"><b>{x.ma}</b><small>{NGANH[x.nganh]} · {CS[x.cs]}</small></span>
              <span className="tts-td-sp-thanh"><i style={{ width: (x.dt / spMax) * 100 + '%', background: '#1E5F63' }} /></span>
              <b className="so">{tien(x.dt)}</b><span className="so odn-phu">{fmt(x.sl)} sp</span>
            </div>))}</div>
        </Khung>
      </div>
    </div>
  );
}

/* ================= Ngành × Chính / Sale (bảng kê) ================= */
function NganhCs({ bc, gon, chon }) {
  const ds = bc.nganh_cs || [];
  const v = (n, c, f = 'dt') => ds.filter((x) => (n == null || x.nganh === n) && (c == null || x.cs === c)).reduce((s, x) => s + (x[f] || 0), 0);
  const tong = v(null, null);
  const nganhs = ['BH', 'NV', 'PK', '?'].filter((n) => v(n, null) > 0 || v(n, null, 'sl') > 0);
  const o = (n, c) => (chon ? <button className="tts-link bo-o" onClick={() => chon(n || '', c || '')}>{tien(v(n, c))}</button> : tien(v(n, c)));
  return (
    <Khung tieu="Tỷ trọng hàng chính / sale theo ngành" phu="doanh số · không tính đơn huỷ" cls="bo-bk">
      <table className="odn-bang tts-bang bo-bang-bk">
        <thead><tr><th>Ngành hàng</th><th className="so">Chính</th><th className="so">Sale</th>{!gon && <th className="so">Chưa rõ</th>}<th className="so">Tổng</th><th className="so">% online</th></tr></thead>
        <tbody>
          {nganhs.map((n) => (
            <tr key={n}><td><b>{NGANH[n]}</b><div className="odn-phu">{fmt(v(n, null, 'sl'))} sp</div></td>
              <td className="so">{o(n, 'chinh')}<div className="odn-phu">{pctTxt(v(n, 'chinh'), v(n, null))}</div></td>
              <td className="so">{o(n, 'sale')}<div className="odn-phu">{pctTxt(v(n, 'sale'), v(n, null))}</div></td>
              {!gon && <td className="so">{tien(v(n, '?'))}</td>}
              <td className="so"><b>{tien(v(n, null))}</b></td><td className="so">{pctTxt(v(n, null), tong)}</td></tr>))}
          <tr className="tts-dong-tong"><td><b>Tổng cộng</b></td><td className="so"><b>{tien(v(null, 'chinh'))}</b><div className="odn-phu">{pctTxt(v(null, 'chinh'), tong)}</div></td>
            <td className="so"><b>{tien(v(null, 'sale'))}</b><div className="odn-phu">{pctTxt(v(null, 'sale'), tong)}</div></td>
            {!gon && <td className="so">{tien(v(null, '?'))}</td>}<td className="so"><b>{tien(tong)}</b></td><td className="so">100%</td></tr>
        </tbody>
      </table>
      {!gon && <div className="bo-bk-thanh">{nganhs.map((n) => ['chinh', 'sale'].map((c) => v(n, c) > 0 && (
        <i key={n + c} style={{ width: (v(n, c) / Math.max(1, tong)) * 100 + '%', background: n === 'BH' ? (c === 'sale' ? '#eb6834' : '#2a78d6') : n === 'NV' ? (c === 'sale' ? '#eda100' : '#1baf7a') : '#A7B0BF' }}
          title={`${NGANH[n]} ${CS[c]}: ${tien(v(n, c))} (${pctTxt(v(n, c), tong)})`} />)))}</div>}
      {chon && <div className="odn-phu">Bấm số để lọc toàn bộ báo cáo theo ngành + chính / sale. Chính / Sale lấy theo danh mục sản phẩm (cột Giá sale).</div>}
    </Khung>
  );
}

/* ================= Kênh & gian hàng ================= */
function BangKenh({ bc, chonShop }) {
  const [mo, setMo] = useState(null);
  const [rows, th] = useSap(bc.kenh || [], { k: 'dt', d: -1 });
  const tong = (bc.kenh || []).reduce((s, x) => s + x.dt, 0);
  return (
    <div className="odn-bang-khung">
      <table className="odn-bang tts-bang">
        <thead><tr>{th('ten', 'Kênh')}{th('don', 'Đơn', 'so')}{th('sl', 'SL', 'so')}{th('dt', 'Doanh số', 'so')}<th className="so">Tỷ trọng</th>
          <th className="so">Giá TB</th>{th('tc', 'Thành công', 'so')}{th('hoan', 'Hoàn', 'so')}{th('huy', 'Huỷ', 'so')}{th('phi_san', 'Phí sàn', 'so')}</tr></thead>
        <tbody>
          {rows.map((r) => [
            <tr key={r.k} className={mo === r.k ? 'on' : ''} onClick={() => setMo(mo === r.k ? null : r.k)}>
              <td><KenhChip k={r.k} /><div className="odn-phu">{NHOM_KENH[r.nhom]} · {fmt(r.so_shop)} gian hàng</div></td>
              <td className="so"><b>{fmt(r.don)}</b></td><td className="so">{fmt(r.sl)}</td>
              <td className="so"><b>{tien(r.dt)}</b></td>
              <td className="so"><span className="bo-ty"><i style={{ width: pct(r.dt, tong) + '%', background: kenhMau(r.k) }} /></span>{pctTxt(r.dt, tong)}</td>
              <td className="so">{r.don ? tien(r.dt / r.don) : '—'}</td>
              <td className="so">{pctTxt(r.tc, r.don)}<div className="odn-phu">{tien(r.dt_tc)}</div></td>
              <td className="so">{r.hoan ? <span className="tts-huy">{pctTxt(r.hoan, r.don)}</span> : '—'}<div className="odn-phu">{fmt(r.hoan)} đơn</div></td>
              <td className="so">{r.huy ? pctTxt(r.huy, r.don + r.huy) : '—'}<div className="odn-phu">{fmt(r.huy)} đơn</div></td>
              <td className="so">{r.phi_san ? tien(r.phi_san) : '—'}{r.phi_san > 0 && <div className="odn-phu">{pctTxt(r.phi_san, r.dt)}</div>}</td>
            </tr>,
            mo === r.k && (bc.shop || []).filter((s) => s.kenh === r.k).map((s) => (
              <tr key={r.k + s.shop} className="tts-mo bo-shop" onClick={() => chonShop(s.shop)} title="Bấm để lọc theo gian hàng này">
                <td><span className="bo-thut">↳ {s.shop}</span></td><td className="so">{fmt(s.don)}</td><td className="so">{fmt(s.sl)}</td>
                <td className="so">{tien(s.dt)}</td><td className="so">{pctTxt(s.dt, tong)}</td><td className="so">{s.don ? tien(s.dt / s.don) : '—'}</td>
                <td className="so">{pctTxt(s.tc, s.don)}</td><td className="so">{pctTxt(s.hoan, s.don)}</td><td className="so">{fmt(s.huy)}</td><td className="so">{s.phi_san ? tien(s.phi_san) : '—'}</td>
              </tr>)),
          ])}
          <tr className="tts-dong-tong"><td><b>Tổng</b></td><td className="so"><b>{fmt(bc.tong.don)}</b></td><td className="so"><b>{fmt(bc.tong.sl)}</b></td>
            <td className="so"><b>{tien(bc.tong.dt)}</b></td><td className="so">100%</td><td className="so">{bc.tong.don ? tien(bc.tong.dt / bc.tong.don) : '—'}</td>
            <td className="so">{pctTxt(bc.tong.don_tc, bc.tong.don)}</td><td className="so">{pctTxt(bc.tong.don_hoan, bc.tong.don)}</td>
            <td className="so">{fmt(bc.tong.don_huy)}</td><td className="so">{tien(bc.tong.phi_san)}</td></tr>
        </tbody>
      </table>
      <div className="odn-chan-bang">Bấm 1 kênh để xem từng gian hàng · bấm gian hàng để lọc toàn bộ báo cáo. Doanh số = tiền hàng sau giảm giá, không tính đơn huỷ.</div>
    </div>
  );
}

/* ================= Sản phẩm ================= */
function BangSp({ ds }) {
  const [mo, setMo] = useState(null);
  const rows0 = useMemo(() => (ds || []).map((r) => ({ ...r, gia_tb: r.sl ? r.dt / r.sl : 0, giam: r.gny && r.sl ? 1 - r.dt / r.sl / r.gny : null })), [ds]);
  const [rows, th] = useSap(rows0, { k: 'dt', d: -1 });
  const [hien, chan] = useHienDan(rows, 200);
  const tong = rows0.reduce((s, x) => s + x.dt, 0);
  return (
    <div className="odn-bang-khung">
      <table className="odn-bang tts-bang">
        <thead><tr>{th('ma', 'Mã hàng')}{th('sl', 'SL', 'so')}{th('dt', 'Doanh số', 'so')}{th('don', 'Đơn', 'so')}{th('gia_tb', 'Giá bán TB', 'so')}
          {th('giam', 'Giảm vs niêm yết', 'so')}<th>Sàn / Web</th>{th('sl_hoan', 'Hoàn', 'so')}</tr></thead>
        <tbody>
          {hien.length === 0 ? <tr><td colSpan={8} className="odn-trong">Không có sản phẩm trong khoảng lọc.</td></tr> : hien.map((r) => [
            <tr key={r.ma} className={mo === r.ma ? 'on' : ''} onClick={() => setMo(mo === r.ma ? null : r.ma)}>
              <td title={r.ten || ''}><div className="tts-ma-o"><AnhSp url={r.hinh} ma={r.ma} ten={r.ten} co={44} />
                <div><div className="odn-ten">{r.ma}</div><div className="odn-phu"><span className={'bo-nganh ' + (r.nganh === '?' ? 'khac' : r.nganh)}>{NGANH[r.nganh]}</span> <span className={'bo-cs ' + (r.cs === '?' ? 'khac' : r.cs)}>{CS[r.cs]}</span> · {(r.co || []).length} mã con</div></div></div></td>
              <td className="so"><b>{fmt(r.sl)}</b></td>
              <td className="so"><b>{tien(r.dt)}</b><div className="odn-phu">{pctTxt(r.dt, tong)}</div></td>
              <td className="so">{fmt(r.don)}</td>
              <td className="so">{tien(r.gia_tb)}{r.gny ? <div className="odn-phu">niêm yết {tien(r.gny)}</div> : null}</td>
              <td className="so">{r.giam != null ? (r.giam * 100).toLocaleString('vi', { maximumFractionDigits: 0 }) + '%' : '—'}</td>
              <td><div className="tts-mix" title={`Sàn ${fmt(r.sl_san)} · Web/FB/Zalo ${fmt(r.sl_web)}`}><div className="tts-mix-thanh">
                {r.sl_san > 0 && <i style={{ width: (r.sl_san / Math.max(1, r.sl)) * 100 + '%', background: '#2a78d6' }} />}
                {r.sl_web > 0 && <i style={{ width: (r.sl_web / Math.max(1, r.sl)) * 100 + '%', background: '#1baf7a' }} />}</div></div>
                <div className="odn-phu">sàn {pctTxt(r.sl_san, r.sl)}</div></td>
              <td className="so">{r.sl_hoan ? <span className="tts-huy">{fmt(r.sl_hoan)}</span> : '—'}</td>
            </tr>,
            mo === r.ma && (
              <tr key={r.ma + '_co'} className="tts-mo"><td colSpan={8}>{r.ten && <div className="odn-phu tts-co-ten">{r.ten}</div>}
                <div className="tts-co">{(r.co || []).map((c) => <span key={c.ma} className="tts-co-o"><b>{c.ma}</b><em>{fmt(c.sl)}</em></span>)}</div></td></tr>),
          ])}
        </tbody>
      </table>
      {chan}
      <div className="odn-chan-bang">Mã hàng = mã mẹ (bỏ tiền tố NSxxx + size). Ngành, chính / sale, giá niêm yết và hình lấy theo danh mục sản phẩm. Bấm dòng để xem từng mã con.</div>
    </div>
  );
}

/* ================= Vận chuyển & hoàn ================= */
function VanChuyen({ bc }) {
  const [rows, th] = useSap((bc.hvc || []).map((r) => ({ ...r, ty_tc: r.don ? r.tc / r.don : 0, ty_hoan: r.don ? r.hoan / r.don : 0 })), { k: 'don', d: -1 });
  const ld = bc.ly_do || [];
  const ldTong = ld.reduce((s, x) => s + x.don, 0);
  return (
    <div className="tts-tq">
      <div className="odn-bang-khung">
        <table className="odn-bang tts-bang">
          <thead><tr>{th('ten', 'Hãng vận chuyển')}{th('don', 'Đơn', 'so')}{th('ty_tc', 'Thành công', 'so')}{th('giao', 'Đang giao', 'so')}
            {th('ty_hoan', 'Hoàn', 'so')}{th('tb', 'Thất bại', 'so')}{th('giao_h', 'Thời gian giao TB', 'so')}{th('phi_ship', 'Phí ship TB', 'so')}</tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.ten}><td><b>{r.ten}</b></td><td className="so"><b>{fmt(r.don)}</b></td>
              <td className="so">{pctTxt(r.tc, r.don)}<div className="odn-phu">{fmt(r.tc)} đơn</div></td><td className="so">{fmt(r.giao)}</td>
              <td className="so">{r.hoan ? <span className="tts-huy">{pctTxt(r.hoan, r.don)}</span> : '—'}<div className="odn-phu">{fmt(r.hoan)} đơn</div></td>
              <td className="so">{fmt(r.tb)}</td>
              <td className="so">{r.giao_h != null ? (r.giao_h >= 48 ? (r.giao_h / 24).toLocaleString('vi', { maximumFractionDigits: 1 }) + ' ngày' : Math.round(r.giao_h) + ' giờ') : '—'}</td>
              <td className="so">{r.phi_ship ? tien(r.phi_ship) : '—'}</td></tr>))}</tbody>
        </table>
        <div className="odn-chan-bang">Thời gian giao = từ lúc tạo đơn tới lúc giao thành công. Đơn từ file báo cáo không có giờ giao / phí ship — sẽ đủ khi lấy qua API.</div>
      </div>
      <Khung tieu="Lý do huỷ / hoàn / thất bại" phu={`${fmt(ldTong)} đơn có ghi lý do`}>
        {ld.length === 0 ? <div className="odn-phu tts-khung-trong">Chưa có dữ liệu lý do (chỉ có khi lấy qua API)</div>
          : <div className="tts-dong-ds">{ld.map((x) => (
            <Dong key={x.k + x.ttn} ten={<span>{LY_DO[x.k] || 'Lý do ' + x.k} <TtChip n={x.ttn} /></span>} so={fmt(x.don)} ty={pct(x.don, Math.max(1, ...ld.map((y) => y.don)))} mau={x.ttn === 'hoan' ? '#eda100' : '#e34948'} phu={pctTxt(x.don, ldTong)} />))}</div>}
      </Khung>
    </div>
  );
}

/* ================= Nhân viên chốt đơn (web + FB + Zalo + Admin) ================= */
function BangNv({ ds }) {
  const [rows, th] = useSap(ds || [], { k: 'dt', d: -1 });
  const tong = (ds || []).reduce((s, x) => s + x.dt, 0);
  return (
    <div className="odn-bang-khung">
      <table className="odn-bang tts-bang">
        <thead><tr>{th('ten', 'Nhân viên / người tạo đơn')}{th('don', 'Đơn', 'so')}{th('sl', 'SL', 'so')}{th('dt', 'Doanh số', 'so')}<th className="so">Tỷ trọng</th>
          {th('hoan', 'Hoàn', 'so')}{th('huy', 'Huỷ', 'so')}<th>Kênh</th></tr></thead>
        <tbody>{rows.length === 0 ? <tr><td colSpan={8} className="odn-trong">Không có đơn Web / Facebook / Zalo / Admin trong khoảng lọc.</td></tr> : rows.map((r) => (
          <tr key={r.ten}><td><b>{r.ten}</b></td><td className="so"><b>{fmt(r.don)}</b></td><td className="so">{fmt(r.sl)}</td><td className="so"><b>{tien(r.dt)}</b></td>
            <td className="so"><span className="bo-ty"><i style={{ width: pct(r.dt, tong) + '%', background: '#1E5F63' }} /></span>{pctTxt(r.dt, tong)}</td>
            <td className="so">{fmt(r.hoan)}</td><td className="so">{fmt(r.huy)}</td><td className="odn-phu">{r.kenh}</td></tr>))}</tbody>
      </table>
      <div className="odn-chan-bang">Chỉ tính đơn tự chốt (Admin, Website, Facebook, Zalo OA…). Đơn sàn TMĐT xem ở thẻ Kênh & gian hàng / TikTok × ID.</div>
    </div>
  );
}

function BangTinh({ ds }) {
  const [rows, th] = useSap(ds || [], { k: 'dt', d: -1 });
  const [hien, chan] = useHienDan(rows, 100);
  const max = Math.max(1, ...(ds || []).map((x) => x.dt));
  const tong = (ds || []).reduce((s, x) => s + x.dt, 0);
  return (
    <div className="odn-bang-khung">
      <table className="odn-bang tts-bang">
        <thead><tr>{th('ten', 'Tỉnh / thành')}{th('don', 'Đơn', 'so')}{th('dt', 'Doanh số', 'so')}<th>Tỷ trọng</th>{th('hoan', 'Hoàn', 'so')}</tr></thead>
        <tbody>{hien.map((r) => (
          <tr key={r.ten}><td><b>{r.ten}</b></td><td className="so">{fmt(r.don)}</td><td className="so"><b>{tien(r.dt)}</b></td>
            <td><span className="bo-ty rong"><i style={{ width: (r.dt / max) * 100 + '%', background: '#1E5F63' }} /></span> <span className="odn-phu">{pctTxt(r.dt, tong)}</span></td>
            <td className="so">{r.hoan ? pctTxt(r.hoan, r.don) : '—'}</td></tr>))}</tbody>
      </table>
      {chan}
    </div>
  );
}

/* ================= TikTok × ID (nối với thẻ TikTok Shop) ================= */
const LOAI_ID = { CH: 'Cửa hàng', DOISALE: 'Đội sale', KENH: 'Kênh công ty', KOL: 'Nhà sáng tạo ngoài', KHAC: 'Khác', CHUA_GAN: 'ID chưa gán cửa hàng', KHONG: 'Không qua người bán' };
function TikTokId({ bc }) {
  const tk = bc.tiktok || {};
  const [rows, th] = useSap(tk.nb || [], { k: 'dt', d: -1 });
  const [hien, chan] = useHienDan(rows, 100);
  const theoLoai = tk.theo_loai || [];
  const tong = theoLoai.reduce((s, x) => s + (x.dt || 0), 0);
  return (
    <div className="tts-tq">
      <div className="bo-tt-dau">
        <div><span>Đơn TikTok trên Nhanh</span><b>{fmt(tk.don)}</b></div>
        <div><span>Tìm thấy trong TikTok Shop app</span><b>{fmt(tk.khop)}</b><em>{pctTxt(tk.khop || 0, tk.don || 0)}</em></div>
        <div><span>Có ID người bán</span><b>{fmt(tk.co_nb)}</b><em>{pctTxt(tk.co_nb || 0, tk.don || 0)}</em></div>
      </div>
      <Khung tieu="Doanh số TikTok theo loại ID" phu="ID người bán lấy từ thẻ TikTok Shop (báo cáo phân tích từng đơn)">
        <div className="tts-dong-ds">{theoLoai.map((x) => (
          <Dong key={x.loai} ten={LOAI_ID[x.loai] || x.loai} so={tien(x.dt)} phu={`${fmt(x.don)} đơn · ${pctTxt(x.dt, tong)}`} ty={pct(x.dt, Math.max(1, ...theoLoai.map((y) => y.dt || 0)))} mau="#2a78d6" />))}</div>
      </Khung>
      <div className="odn-bang-khung">
        <table className="odn-bang tts-bang">
          <thead><tr>{th('nb', 'ID người bán')}{th('ten_ch', 'Cửa hàng')}{th('don', 'Đơn', 'so')}{th('dt', 'Doanh số (Nhanh)', 'so')}</tr></thead>
          <tbody>{hien.map((r) => (
            <tr key={r.nb}><td><b>{r.ten || '@' + r.nb}</b>{r.ten && <div className="odn-phu">@{r.nb}</div>}</td>
              <td>{r.ten_ch || LOAI_ID[r.loai] || <span className="odn-phu">chưa gán</span>}</td><td className="so">{fmt(r.don)}</td><td className="so"><b>{tien(r.dt)}</b></td></tr>))}</tbody>
        </table>
        {chan}
      </div>
    </div>
  );
}

/* ================= Danh sách đơn ================= */
function DsDon({ pLoc, phienBan, apiXong }) {
  const { user } = useApp();
  const khoa = khoaNho('don', pLoc);
  const [kq, setKq] = useState(() => boNho.get(khoa)?.data || null);
  const [mo, setMo] = useState(null);
  const [them, setThem] = useState(false);
  useEffect(() => {
    const c = boNho.get(khoa);
    if (c) setKq(c.data);
    if (!apiXong || (c && c.pb === phienBan)) return undefined;
    let huy = false;
    sb.rpc('fn_nh_don_ds', { p_token: user.token, p_loc: pLoc, p_gioi_han: 200 }).then(({ data, error }) => {
      if (huy || error) return; boNho.set(khoa, { data, pb: phienBan }); setKq(data);
    });
    return () => { huy = true; };
  }, [khoa, pLoc, phienBan, apiXong, user.token]);
  const taiThem = async () => {
    setThem(true);
    const { data } = await sb.rpc('fn_nh_don_ds', { p_token: user.token, p_loc: { ...pLoc, bo_qua: kq.ds.length }, p_gioi_han: 300 });
    setThem(false);
    if (data) { const moi = { tong: data.tong, ds: [...kq.ds, ...data.ds] }; boNho.set(khoa, { data: moi, pb: phienBan }); setKq(moi); }
  };
  const ds = kq?.ds || [];
  return (
    <div className="odn-bang-khung">
      <table className="odn-bang tts-bang">
        <thead><tr><th>Đơn</th><th>Kênh · gian hàng</th><th>Trạng thái</th><th>Sản phẩm</th><th className="so">Tiền hàng</th><th>Khách · khu vực</th><th>Vận chuyển</th></tr></thead>
        <tbody>
          {kq == null ? <tr><td colSpan={7} className="odn-trong">Đang tải đơn…</td></tr>
            : ds.length === 0 ? <tr><td colSpan={7} className="odn-trong">Không có đơn trong khoảng lọc.</td></tr>
            : ds.map((d) => [
              <tr key={d.id} className={mo === d.id ? 'on' : ''} onClick={() => setMo(mo === d.id ? null : d.id)}>
                <td><div className="odn-ten">{d.id}</div><div className="odn-phu">{gioNgay(d.tao_luc)}{d.app ? ' · ' + d.app : ''}{d.nguon === 'excel' ? ' · từ file' : ''}</div></td>
                <td><KenhChip k={d.kenh} /><div className="odn-phu">{d.shop || d.nv || ''}</div></td>
                <td><TtChip n={d.ttn} ten={d.ten_tt} /></td>
                <td><div className="tts-ten-sp" title={(d.dong || []).map((x) => x.ma).join(', ')}>{d.dong?.[0]?.ma || '—'}{(d.dong || []).length > 1 ? ` +${d.dong.length - 1} mã` : ''}</div><div className="odn-phu">{fmt(d.sl)} sản phẩm</div></td>
                <td className="so"><b>{fmt(d.tien)}</b></td>
                <td><div className="odn-ten nho">{d.khach || '—'}</div><div className="odn-phu">{[d.sdt, d.tinh].filter(Boolean).join(' · ')}</div></td>
                <td><div className="odn-ten nho">{d.hvc || '—'}</div><div className="odn-phu">{d.van_don || ''}{d.giao_luc ? ' · giao ' + gioNgay(d.giao_luc) : ''}</div></td>
              </tr>,
              mo === d.id && (
                <tr key={d.id + '_ct'} className="tts-mo"><td colSpan={7}>
                  <table className="tts-ct"><thead><tr><th>Mã hàng</th><th>Sản phẩm</th><th className="so">SL</th><th className="so">Giá</th><th className="so">Giảm / sp</th><th className="so">Thành tiền</th></tr></thead>
                    <tbody>{(d.dong || []).map((x, i) => (
                      <tr key={i}><td><b>{x.ma || '—'}</b></td><td>{x.ten}</td><td className="so">{fmt(x.sl)}</td><td className="so">{fmt(x.gia)}</td><td className="so">{fmt(x.giam)}</td><td className="so"><b>{fmt(x.tien)}</b></td></tr>))}</tbody></table>
                  <div className="odn-phu tts-ct-phu">{[d.nv && 'Nhân viên: ' + d.nv, d.phi_san && 'Phí sàn ' + fmt(d.phi_san), d.phi_ship && 'Phí ship ' + fmt(d.phi_ship),
                    d.thu_ho && 'Thu hộ ' + fmt(d.thu_ho), d.ly_do && 'Lý do: ' + (LY_DO[d.ly_do] || d.ly_do), d.ghi_chu && 'Ghi chú: ' + d.ghi_chu].filter(Boolean).join(' · ')}</div>
                </td></tr>),
            ])}
        </tbody>
      </table>
      {kq && kq.tong > ds.length && (
        <div className="odn-chan-bang tts-hien-them"><span>Đang hiện {fmt(ds.length)}/{fmt(kq.tong)} đơn</span>
          <button className="tts-link" disabled={them} onClick={taiThem}>{them ? 'Đang tải…' : `Xem thêm ${fmt(Math.min(300, kq.tong - ds.length))} đơn`}</button></div>)}
    </div>
  );
}

/* ================= Đối soát file báo cáo nhân viên ↔ API ================= */
function DoiSoatFile({ pLoc, phienBan, apiXong, moNap }) {
  const { user } = useApp();
  const khoa = khoaNho('ds', pLoc);
  const [kq, setKq] = useState(() => boNho.get(khoa)?.data || null);
  const [loi, setLoi] = useState('');
  const [xem, setXem] = useState('lech');
  useEffect(() => {
    const c = boNho.get(khoa);
    if (c) setKq(c.data);
    if (!apiXong || (c && c.pb === phienBan)) return undefined;
    let huy = false;
    sb.rpc('fn_nh_doi_soat', { p_token: user.token, p_loc: pLoc }).then(({ data, error }) => {
      if (huy) return; if (error) { setLoi(error.message); return; }
      boNho.set(khoa, { data, pb: phienBan }); setLoi(''); setKq(data);
    });
    return () => { huy = true; };
  }, [khoa, pLoc, phienBan, apiXong, user.token]);
  if (loi) return <div className="odn-bao do"><IcAlert /> Không tải được: {loi}</div>;
  if (!kq) return <div className="odn-bang-khung"><div className="odn-trong">Đang đối soát…</div></div>;
  const tg = kq.tong || {};
  const danh = { lech: kq.lech || [], chi_excel: kq.chi_excel || [], chi_api: kq.chi_api || [] }[xem];
  const o = (a, b, laTien) => {
    const d = (a || 0) - (b || 0);
    return <td className="so">{laTien ? tien(a) : fmt(a)}{(kq.co_api && kq.co_excel && d !== 0) ? <span className={d > 0 ? 'tts-huy' : 'odn-phu'}> {d > 0 ? '+' : ''}{laTien ? tien(d) : fmt(d)}</span> : null}</td>;
  };
  return (
    <div className="tts-tq">
      <div className="tts-ghi-nguon bo-ds-ghi">
        <span><b>Đối soát</b>: so file báo cáo nhân viên (xuất từ Nhanh) với đơn lấy qua API, từng ngày · từng kênh · từng đơn. File không có đơn huỷ nên API cũng bỏ đơn huỷ khi so.</span>
        <span>{kq.co_excel ? `File: ${fmt(tg.excel?.don)} đơn · ${tien(tg.excel?.tien)}` : 'Chưa có file báo cáo trong khoảng này'} · {kq.co_api ? `API: ${fmt(tg.api?.don)} đơn · ${tien(tg.api?.tien)} (bỏ ${fmt(tg.api_huy)} đơn huỷ)` : 'API chưa có đơn trong khoảng này'}
          {kq.co_api && kq.co_excel ? ` · ${fmt(kq.so_ngay_chung)} ngày có cả hai để so` : ''}</span>
        {!kq.co_excel && <button className="btn btn-ai odn-nut-chinh bo-ds-nap" onClick={moNap}><IcGuiLen /> Nạp file báo cáo</button>}
      </div>
      {kq.co_api && kq.co_excel && (
        <div className="bo-tt-dau">
          <div className={tg.chi_excel ? 'canh' : ''}><span>Có trong file, API chưa có</span><b>{fmt(tg.chi_excel)}</b></div>
          <div className={tg.chi_api ? 'canh' : ''}><span>API có, file không có</span><b>{fmt(tg.chi_api)}</b></div>
          <div className={tg.lech_tt ? 'canh' : ''}><span>Lệch trạng thái</span><b>{fmt(tg.lech_tt)}</b></div>
          <div className={tg.lech_tien ? 'canh' : ''}><span>Lệch tiền (&gt; 1.000đ)</span><b>{fmt(tg.lech_tien)}</b></div>
        </div>)}
      <div className="bo-luoi2">
        <div className="odn-bang-khung">
          <table className="odn-bang tts-bang">
            <thead><tr><th>Ngày</th><th className="so">Đơn · file</th><th className="so">Đơn · API</th><th className="so">Tiền · file</th><th className="so">Tiền · API</th><th className="so">Huỷ (API)</th></tr></thead>
            <tbody>{(kq.ngay || []).filter((r) => r.e_don || r.a_don).map((r) => (
              <tr key={r.ngay} className={r.e_don && r.a_don && (r.e_don !== r.a_don) ? 'tts-dong-lech' : ''}><td><b>{ngayVN(r.ngay)}</b></td>
                <td className="so">{fmt(r.e_don)}</td>{o(r.a_don, r.e_don)}<td className="so">{tien(r.e_tien)}</td>{o(r.a_tien, r.e_tien, true)}<td className="so">{fmt(r.a_huy)}</td></tr>))}</tbody>
          </table>
        </div>
        <div className="odn-bang-khung">
          <table className="odn-bang tts-bang">
            <thead><tr><th>Kênh</th><th className="so">Đơn · file</th><th className="so">Đơn · API</th><th className="so">Tiền · file</th><th className="so">Tiền · API</th></tr></thead>
            <tbody>{(kq.kenh || []).map((r) => (
              <tr key={r.kenh}><td><KenhChip k={r.kenh} /></td><td className="so">{fmt(r.e_don)}</td>{o(r.a_don, r.e_don)}<td className="so">{tien(r.e_tien)}</td>{o(r.a_tien, r.e_tien, true)}</tr>))}</tbody>
          </table>
        </div>
      </div>
      {kq.co_api && kq.co_excel && (
        <div className="odn-bang-khung">
          <div className="tts-nhanh nho bo-ds-tab">{[['lech', 'Lệch trạng thái / tiền', tg.lech_tt + tg.lech_tien], ['chi_excel', 'Chỉ có trong file', tg.chi_excel], ['chi_api', 'Chỉ có trong API', tg.chi_api]].map(([k, ten, so]) => (
            <button key={k} className={xem === k ? 'on' : ''} onClick={() => setXem(k)}>{ten} ({fmt(so || 0)})</button>))}</div>
          <DanhSachLech ds={danh} loai={xem} />
        </div>)}
    </div>
  );
}
function DanhSachLech({ ds, loai }) {
  const [hien, chan] = useHienDan(ds, 100);
  return (<>
    <table className="odn-bang tts-bang">
      <thead><tr><th>Mã đơn Nhanh</th><th>Ngày</th><th>Kênh</th>{loai === 'lech' ? <><th>Trạng thái file → API</th><th className="so">Tiền file</th><th className="so">Tiền API</th></>
        : <><th>Trạng thái</th><th className="so">Tiền</th></>}</tr></thead>
      <tbody>{hien.length === 0 ? <tr><td colSpan={6} className="odn-trong">Không có đơn nào — khớp.</td></tr> : hien.map((r) => (
        <tr key={r.id}><td><b>{r.id}</b></td><td>{ngayVN(r.ngay)}</td><td>{r.kenh}</td>
          {loai === 'lech' ? <><td>{r.tt_excel} → <b>{r.tt_api}</b></td><td className="so">{fmt(r.tien_excel)}</td><td className="so">{fmt(r.tien_api)}</td></>
            : <><td>{r.tt}</td><td className="so">{fmt(r.tien)}</td></>}</tr>))}</tbody>
    </table>
    {chan}
  </>);
}

/* ================= Kết nối Nhanh.vn + chạy thủ công ================= */
// 3.153.1: chỉ hiện thứ cần dùng — đã kết nối thì gọn 1 thẻ trạng thái + nút chạy; cấu hình khoá xếp vào "Cài đặt kết nối" (Quản trị)
const RETURN_LINK = 'https://yocddobdziclxseotekx.supabase.co/functions/v1/nhanh';
function KetNoi({ api, xong }) {
  const { user, baoToast } = useApp();
  const [appId, setAppId] = useState(api?.app_id || '');
  const [secret, setSecret] = useState('');
  const [luu, setLuu] = useState(false);
  const [ngayKeo, setNgayKeo] = useState(truNgay(1));
  useEffect(() => { if (api?.app_id) setAppId(api.app_id); }, [api?.app_id]);
  const luuCh = async () => {
    setLuu(true);
    const { error } = await sb.rpc('fn_nh_cau_hinh_luu', { p_token: user.token, p_app_id: appId, p_secret: secret || null, p_tu_dong: null });
    setLuu(false);
    if (error) { baoToast('Chưa lưu được: ' + error.message); return; }
    setSecret(''); baoToast('Đã lưu'); xong();
  };
  const chay = async (viec, ngay = null) => {
    const { data, error } = await sb.rpc('fn_nh_chay', { p_token: user.token, p_viec: viec, p_ngay: ngay });
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    if (data?.kq === 'dang_chay') { baoToast(`Đang có 1 lượt chạy — khoảng ${fmt(data.con_giay)} giây nữa bấm lại`); return; }
    if (!data?.ok) { baoToast('Chưa kết nối Nhanh.vn'); return; }
    baoToast('Đã gửi lệnh — khoảng 1–2 phút có kết quả'); setTimeout(xong, 1500);
  };
  const datTuDong = async (bat) => {
    const { error } = await sb.rpc('fn_nh_cau_hinh_luu', { p_token: user.token, p_app_id: null, p_secret: null, p_tu_dong: bat });
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    baoToast(bat ? 'Đã bật tự lấy đơn' : 'Đã tắt tự lấy đơn'); xong();
  };
  const chep = (s) => { try { navigator.clipboard.writeText(s); baoToast('Đã chép'); } catch { /* bỏ qua */ } };
  const conNgay = api?.het_han ? Math.round((new Date(api.het_han) - new Date()) / 86400000) : null;
  const coKhoa = !!(api?.app_id && api?.co_secret);

  const formKhoa = api?.admin ? (
    <div className="bo-kn-form">
      <label><span>App ID</span><input className="inp" value={appId} onChange={(e) => setAppId(e.target.value.replace(/\D/g, ''))} inputMode="numeric" /></label>
      <label><span>Secret Key</span>
        <input className="inp" type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={api?.co_secret ? 'Đã lưu — dán mới nếu đổi' : 'Dán Secret Key'} /></label>
      <button className="btn btn-ai" disabled={luu || !appId || (!secret && !api?.co_secret)} onClick={luuCh}>{luu ? 'Đang lưu…' : 'Lưu'}</button>
    </div>) : <p className="odn-phu">Chỉ Quản trị được nhập khoá kết nối.</p>;
  const nutKetNoi = (chu) => <a className={'btn btn-ai' + (api?.link_uy_quyen ? '' : ' tat')} href={api?.link_uy_quyen || undefined} aria-disabled={!api?.link_uy_quyen}>{chu}</a>;

  // ----- chưa kết nối: 2 bước -----
  if (!api?.ket_noi) return (
    <div className="tts-tq">
      <div className="bo-kn">
        <div className={'bo-kn-buoc' + (coKhoa ? ' xong' : '')}>
          <span className="bo-kn-so">{coKhoa ? <IcCheck /> : '1'}</span>
          <div className="bo-kn-than">
            <b>Nhập App ID + Secret Key</b>
            <p>Lấy ở trang app trên <a href="https://open.nhanh.vn/apps" target="_blank" rel="noreferrer">open.nhanh.vn</a>.</p>
            {!api?.app_id && <div className="bo-kn-chep"><span className="odn-phu">Redirect URL khi tạo app:</span><code>{RETURN_LINK}</code>
              <button className="odn-nut-phu" onClick={() => chep(RETURN_LINK)}>Chép</button></div>}
            {formKhoa}
          </div>
        </div>
        <div className="bo-kn-buoc">
          <span className="bo-kn-so">2</span>
          <div className="bo-kn-than">
            <b>Cho phép đọc dữ liệu</b>
            <p>Chọn quyền đọc + tất cả kho → Đồng ý. Xong tự quay về đây.</p>
            {nutKetNoi('Kết nối Nhanh.vn')}
          </div>
        </div>
      </div>
    </div>
  );

  // ----- đã kết nối: 1 thẻ gọn -----
  const sapHet = conNgay != null && conNgay <= 30;
  return (
    <div className="tts-tq">
      <div className="bo-kn">
        <div className="bo-kn-buoc xong">
          <span className="bo-kn-so"><IcCheck /></span>
          <div className="bo-kn-than">
            <b>Đã kết nối Nhanh.vn{sapHet && <span className="odn-chip do bo-kn-chip">Còn {fmt(conNgay)} ngày — bấm Kết nối lại</span>}</b>
            <div className="bo-kn-tt">
              <span>{api.tu_dong ? 'Tự cập nhật 5 phút/lần' : <em className="do">Đang tắt tự cập nhật</em>}{api.keo_luc ? ` · lần cuối ${gioNgay(api.keo_luc)}` : ''}{api.dang_keo ? ' · đang lấy…' : ''}</span>
              {!api.bf_xong && <span>Đang lấy đơn cũ: đã tới {ngayVN(api.bf_ngay || api.ds_tu)}</span>}
              {api.loi && <span className="do">Lỗi: {api.loi}</span>}
            </div>
            <div className="bo-kn-nut">
              <button className="odn-nut-phu" disabled={api.dang_keo} onClick={() => chay('tu_dong')}><IcRefresh /> Lấy ngay</button>
              <span className="bo-kn-ngay"><DateBox label="Ngày" value={ngayKeo} onChange={setNgayKeo} />
                <button className="odn-nut-phu" disabled={api.dang_keo || !ngayKeo} onClick={() => chay('keo_ngay', [ngayKeo])}><IcRefresh /> Kéo lại ngày này</button></span>
              {sapHet && nutKetNoi('Kết nối lại Nhanh.vn')}
            </div>
            {api.admin && (
              <details className="bo-kn-them">
                <summary>Cài đặt kết nối</summary>
                <div className="bo-kn-than">
                  {formKhoa}
                  <div className="bo-kn-nut">
                    {nutKetNoi('Kết nối lại Nhanh.vn')}
                    <button className="odn-nut-phu" onClick={() => datTuDong(!api.tu_dong)}>{api.tu_dong ? 'Tắt tự cập nhật' : 'Bật tự cập nhật'}</button>
                  </div>
                </div>
              </details>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= Nạp file báo cáo nhân viên (xuất từ Nhanh) ================= */
const COT_FILE = {
  'SỐ ID': 'don_id', 'ID TÍCH HỢP': 'app', 'THỜI GIAN': 'tao', 'NGƯỜI TẠO ĐƠN': 'nt', 'NGUỒN': 'nguon', 'Số điện thoại': 'sdt',
  'Thành phố': 'tinh', 'Sản phẩm': 'ten', 'Mã': 'ma', 'Chiết khấu': 'ck', 'Giá': 'gia', 'Số lượng': 'sl', 'Ghi chú': 'ghi', 'NV': 'nv',
  'Hãng Vận Chuyển': 'hvc', 'gian hàng': 'gh', 'Trạng Thái': 'tt', 'KÊNH': 'kenh', 'THÀNH TIỀN': 'tt_tien', 'Nhà Sáng Tạo': 'nst',
  'Tên Nhân Viên': 'tnv', 'Loại Nội Dung': 'lnd', 'CỬA HÀNG': 'lch', 'CHÍNH / Sale': 'cs', 'CTKM': 'ctkm', 'Ngành Hàng': 'nganh',
};
const chuan = (s) => String(s ?? '').trim().toLowerCase().normalize('NFC');
const ngayChu = (v) => {
  if (v instanceof Date) { const p = (n) => String(n).padStart(2, '0'); return `${p(v.getDate())}/${p(v.getMonth() + 1)}/${v.getFullYear()} ${p(v.getHours())}:${p(v.getMinutes())}:${p(v.getSeconds())}`; }
  return v == null ? '' : String(v).trim();
};
async function docFileNhanh(file) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  let aoa = null, dau = -1;
  for (const ten of [...wb.SheetNames].sort((a, b) => (chuan(b) === 'data') - (chuan(a) === 'data'))) {
    const a = XLSX.utils.sheet_to_json(wb.Sheets[ten], { header: 1, raw: true, defval: '' });
    const i = a.slice(0, 8).findIndex((r) => r.some((c) => chuan(c) === 'số id') && r.some((c) => chuan(c) === 'thời gian'));
    if (i >= 0) { aoa = a; dau = i; break; }
  }
  if (!aoa) throw new Error('Không thấy bảng đơn hàng — file cần có cột "SỐ ID" và "THỜI GIAN" (sheet DATA của báo cáo Nhanh)');
  const tieuDe = aoa[dau].map((x) => String(x).trim());
  const map = tieuDe.map((c) => { const k = Object.keys(COT_FILE).find((x) => chuan(x) === chuan(c)); return k ? COT_FILE[k] : null; });
  if (!map.includes('ma') || !map.includes('sl')) throw new Error('File thiếu cột "Mã" hoặc "Số lượng"');
  const ds = [];
  for (let i = dau + 1; i < aoa.length; i++) {
    const r = aoa[i]; const o = { dong: i + 1 };
    map.forEach((k, j) => { if (!k) return; const v = k === 'tao' ? ngayChu(r[j]) : r[j] instanceof Date ? ngayChu(r[j]) : String(r[j] ?? '').trim(); if (v !== '') o[k] = v; });
    if (!/^\d{4,}$/.test(o.don_id || '') || !/^\d{2}\/\d{2}\/\d{4}/.test(o.tao || '')) continue;
    if (o.tt_tien == null && o.gia != null) o.tt_tien = String((Number(o.gia) - Number(o.ck || 0)) * Number(o.sl || 0));
    ds.push(o);
  }
  const ngay = ds.map((x) => x.tao.slice(0, 10).split('/').reverse().join('-')).sort();
  return { ten: file.name, ds, soDon: new Set(ds.map((x) => x.don_id)).size, tu: ngay[0], den: ngay[ngay.length - 1] };
}
function chiaLo(ds, n = 1500) {
  const theo = new Map();
  for (const x of ds) { if (!theo.has(x.don_id)) theo.set(x.don_id, []); theo.get(x.don_id).push(x); }
  const lo = []; let cur = [];
  for (const dong of theo.values()) { if (cur.length && cur.length + dong.length > n) { lo.push(cur); cur = []; } cur.push(...dong); }
  if (cur.length) lo.push(cur);
  return lo;
}
function HopNap({ dong, xong }) {
  const { user } = useApp();
  const [f, setF] = useState(null);
  const [dangNap, setDangNap] = useState(false);
  const [keo, setKeo] = useState(false);
  const chon = useRef(null);
  const doc = async (file) => { if (!file) return; setF({ ten: file.name, dang: true }); try { setF(await docFileNhanh(file)); } catch (e) { setF({ ten: file.name, loi: e.message || String(e) }); } };
  const nap = async () => {
    setDangNap(true);
    const lo = chiaLo(f.ds); let napId = null; let tong = { dong: 0, don_tam: 0 };
    for (let j = 0; j < lo.length; j++) {
      const { data, error } = await sb.rpc('fn_nh_excel_nap', { p_token: user.token, p_rows: lo[j],
        p_meta: { ten_file: f.ten, tu: f.tu, den: f.den, nap_id: napId, xong: j === lo.length - 1 } });
      if (error) { setF((x) => ({ ...x, loi: 'Lô ' + (j + 1) + '/' + lo.length + ': ' + error.message })); setDangNap(false); return; }
      napId = data?.nap_id ?? napId; tong = { dong: tong.dong + (data?.dong || 0), don_tam: tong.don_tam + (data?.don_tam || 0) };
      setF((x) => ({ ...x, tienDo: Math.round(((j + 1) / lo.length) * 100) }));
    }
    setDangNap(false); setF((x) => ({ ...x, kq: tong })); xong();
  };
  return (
    <div className="modal-nen" onClick={() => !dangNap && dong()}>
      <div className="modal-hop tts-nap" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Nạp file báo cáo đơn online">
        <div className="modal-dau"><b>Nạp file báo cáo đơn online (xuất từ Nhanh)</b>
          <button className="modal-x" onClick={dong} disabled={dangNap} aria-label="Đóng">✕</button></div>
        <div className="modal-than">
          <div className={'tts-tha' + (keo ? ' keo' : '')} role="button" tabIndex={0}
            onDragOver={(e) => { e.preventDefault(); setKeo(true); }} onDragLeave={() => setKeo(false)}
            onDrop={(e) => { e.preventDefault(); setKeo(false); doc(e.dataTransfer.files?.[0]); }}
            onClick={() => chon.current?.click()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') chon.current?.click(); }}>
            <IcGuiLen /><b>Kéo thả file vào đây hoặc bấm để chọn</b>
            <span>File báo cáo doanh thu nhân viên làm từ Nhanh (sheet DATA: SỐ ID, THỜI GIAN, NGUỒN, Mã, Số lượng, Trạng Thái…). Dùng để đối chiếu với API; đơn API chưa có thì tạm hiện từ file.</span>
            <input ref={chon} type="file" accept=".xlsx,.xls" hidden onChange={(e) => { doc(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
          {f && (
            <div className="tts-file-ds"><div className={'tts-file' + (f.loi ? ' loi' : f.kq ? ' xong' : '')}>
              <div className="tts-file-dau"><b title={f.ten}>{f.ten}</b>
                {f.kq ? <span className="odn-chip ok"><IcCheck /> Xong</span> : f.loi ? <span className="odn-chip do">Lỗi</span> : null}</div>
              {f.dang ? <div className="odn-phu">Đang đọc file…</div> : f.loi ? <div className="tts-file-loi">{f.loi}</div> : (<>
                <div className="odn-phu">{fmt(f.ds.length)} dòng · <b>{fmt(f.soDon)} đơn</b> · tạo từ {ngayVN(f.tu)} đến {ngayVN(f.den)}</div>
                {(f.tienDo != null || f.kq) && <div className="tts-tien-do"><i style={{ width: (f.kq ? 100 : f.tienDo) + '%' }} /></div>}
                {f.kq && <div className="tts-file-kq"><span><b>{fmt(f.kq.dong)}</b> dòng để đối chiếu</span><span><b>{fmt(f.kq.don_tam)}</b> đơn tạm hiện từ file (API chưa có)</span></div>}
              </>)}
            </div></div>)}
          <div className="tts-nap-chan">
            <span className="odn-phu">File mới thay file cũ cho các ngày trùng. Chỉ lưu số điện thoại (để đếm khách mua lại), không lưu tên / địa chỉ khách.</span>
            {f?.kq ? <button className="btn btn-ai" onClick={dong}>Xong</button>
              : <button className="btn btn-ai" disabled={!f?.ds?.length || dangNap} onClick={nap}>{dangNap ? `Đang nạp ${f?.tienDo || 0}%` : `Nạp ${fmt(f?.soDon || 0)} đơn`}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
