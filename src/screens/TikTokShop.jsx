import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { sb } from '../lib/supabase.js';
import { useApp } from '../App.jsx';
import { Sel, DateBox, isoVN } from '../lib/ui.jsx';
import { IcRefresh, IcSearch, IcAlert, IcClock, IcGuiLen, IcCheck } from '../lib/icons.jsx';
import NutXuat from '../lib/bao-cao/NutXuat.jsx';   // NEW - 3.154

// ============================================================================
// NEW - 3.140 TIKTOK SHOP (SQL 237 · 238 · Edge Function tiktok-shop)
//   Đơn bán TikTok Shop: số đơn, số lượng, doanh thu theo ngày / giờ, sản phẩm, người bán (ID TikTok), cửa hàng, kênh
//   LIVE / Video / Thẻ sản phẩm, trạng thái giao, lý do huỷ.
//   Nguồn: (1) nạp file Excel "Tất cả đơn hàng" xuất từ Seller Center — kéo thả; (2) API chính thức (app NS CARE) tự kéo
//   5 phút/lần khi đã ủy quyền. Chống trùng theo mã đơn; bản mới hơn mới ghi đè; API không có ID người bán thì giữ của Excel.
//   Doanh thu shop = giá niêm yết − shop giảm (phần sàn trợ giá vẫn về shop); đơn huỷ không tính số lượng, doanh thu.
// ============================================================================

const fmt = (n) => (n == null || n === '' ? '—' : Number(n).toLocaleString('vi'));
const tien = (n) => {
  const v = Number(n) || 0, a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toLocaleString('vi', { maximumFractionDigits: 2 }) + ' tỷ';
  if (a >= 1e6) return (v / 1e6).toLocaleString('vi', { maximumFractionDigits: 1 }) + ' tr';
  return Math.round(v).toLocaleString('vi');
};
const gioNgay = (s) => (s ? new Date(s).toLocaleString('vi', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—');
// hôm nay chỉ hiện giờ, ngày khác thì kèm ngày (NEW - 3.154.2)
const gioGon = (s) => { if (!s) return '—'; const d = new Date(s); return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString('vi', { hour: '2-digit', minute: '2-digit' }) : gioNgay(s); };
const ngayVN = (s) => (s ? String(s).slice(8, 10) + '/' + String(s).slice(5, 7) + '/' + String(s).slice(0, 4) : '—');
const truNgay = (n, tu = new Date()) => { const d = new Date(tu); d.setDate(d.getDate() - n); return isoVN(d); };
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
const pctTxt = (a, b) => pct(a, b).toLocaleString('vi') + '%';

const KENH = { live: ['LIVE', '#D6006C'], video: ['Video', '#3FB6A8'], the: ['Thẻ sản phẩm', '#CBA45A'], khac: ['Không qua người bán', '#A7B0BF'] };
const TT = {
  cho_tt: ['Chờ thanh toán', 'xam'], cho_gui: ['Chờ gửi hàng', 'vang'], dang_giao: ['Đang giao', 'xanh'],
  da_giao: ['Đã giao', 'ok'], hoan_thanh: ['Hoàn thành', 'ok'], huy: ['Đã huỷ', 'do'], tra_hang: ['Trả hàng', 'do'], khac: ['Khác', 'xam'],
};
const TT_LOC = { cho: ['cho_tt', 'cho_gui'], dang_giao: ['dang_giao'], giao: ['da_giao', 'hoan_thanh'], huy: ['huy'], tra_hang: ['tra_hang'] };
const LOAI = { CH: 'Cửa hàng', DOISALE: 'Đội sale', KENH: 'Kênh công ty', KOL: 'Nhà sáng tạo ngoài', KHAC: 'Khác' };
// NEW - 3.146: tên gọi anh đặt cho ID người bán (thẻ Gán cửa hàng) — có tên gọi thì hiện tên gọi, ID để dòng phụ
const tenGoi = (ten, h) => (h ? (ten?.[h] || '@' + h) : 'Không qua người bán');

// cột file Excel Seller Center → khoá ngắn gửi SQL (bỏ hẳn tên, SĐT, địa chỉ, tin nhắn người mua)
const COT = {
  'Order ID': 'd', 'Order Status': 'st', 'Order Substatus': 'sst', 'Cancelation/Return Type': 'lh', 'Normal or Pre-order': 'np',
  'SKU ID': 'sk', 'Seller SKU': 'ss', 'Product Name': 'ten', 'Variation': 'pl', 'Quantity': 'sl', 'Sku Quantity of return': 'slt',
  'SKU Unit Original Price': 'gg', 'SKU Subtotal Before Discount': 'tg', 'SKU Platform Discount': 'gs', 'SKU Seller Discount': 'gsh',
  'SKU Subtotal After Discount': 'ts', 'Shipping Fee After Discount': 'ps', 'Original Shipping Fee': 'pg',
  'Shipping Fee Seller Discount': 'pssh', 'Shipping Fee Platform Discount': 'pss', 'Payment platform discount': 'ptt', 'Taxes': 'thue',
  'Order Amount': 'tong', 'Order Refund Amount': 'hoan', 'Created Time': 't_tao', 'Paid Time': 't_tt', 'RTS Time': 't_rts',
  'Shipped Time': 't_gui', 'Delivered Time': 't_giao', 'Cancelled Time': 't_huy', 'Cancel By': 'hb', 'Cancel Reason': 'lyd',
  'Fulfillment Type': 'ht', 'Warehouse Name': 'kho', 'Tracking ID': 'vd', 'Delivery Option': 'kg', 'Shipping Provider Name': 'dv',
  'Province': 'tinh', 'District': 'phuong', 'Payment Method': 'ttoan', 'Weight(kg)': 'kl', 'Product Category': 'dm',
  'Package ID': 'goi', 'Order Channel': 'kenh', 'Creator Handle': 'cr',
};
const COT_BAT_BUOC = ['Order ID', 'Created Time', 'Quantity', 'Order Status'];
const LO_DONG = 400;

const NHANH = [
  ['Hôm nay', () => [isoVN(), isoVN()]],
  ['Hôm qua', () => [truNgay(1), truNgay(1)]],
  ['7 ngày', () => [truNgay(6), isoVN()]],
  ['30 ngày', () => [truNgay(29), isoVN()]],
  ['Tháng này', () => { const d = new Date(); return [isoVN(new Date(d.getFullYear(), d.getMonth(), 1)), isoVN()]; }],
  ['Tháng trước', () => { const d = new Date(); return [isoVN(new Date(d.getFullYear(), d.getMonth() - 1, 1)), isoVN(new Date(d.getFullYear(), d.getMonth(), 0))]; }],
];

const Chip = ({ tt }) => { const c = TT[tt] || TT.khac; return <span className={'odn-chip ' + c[1]}>{c[0]}</span>; };
const KenhChip = ({ k }) => { const c = KENH[k] || KENH.khac; return <span className="tts-kenh" style={{ '--m': c[1] }}><i />{c[0]}</span>; };

// thanh tỉ lệ kênh (LIVE / Video / Thẻ SP)
function ThanhKenh({ r }) {
  const tong = (r.live || 0) + (r.video || 0) + (r.the || 0);
  const khac = Math.max((r.sl || 0) - tong, 0);
  const all = tong + khac;
  if (!all) return <span className="odn-phu">—</span>;
  const p = (v) => (v / all) * 100 + '%';
  return (
    <div className="tts-mix" title={`LIVE ${r.live || 0} · Video ${r.video || 0} · Thẻ sản phẩm ${r.the || 0}${khac ? ' · Khác ' + khac : ''}`}>
      <div className="tts-mix-thanh">
        {r.live > 0 && <i style={{ width: p(r.live), background: KENH.live[1] }} />}
        {r.video > 0 && <i style={{ width: p(r.video), background: KENH.video[1] }} />}
        {r.the > 0 && <i style={{ width: p(r.the), background: KENH.the[1] }} />}
        {khac > 0 && <i style={{ width: p(khac), background: KENH.khac[1] }} />}
      </div>
    </div>
  );
}

// NEW - 3.148: NHỚ TRONG PHIÊN — kết quả đã tải theo từng bộ lọc + bộ lọc / thẻ đang xem.
//   Mở lại màn, đổi thẻ, quay lại khoảng ngày cũ → hiện ngay, KHÔNG tải lại; chỉ tải lại khi TikTok có dữ liệu mới
//   (fn_tt_api_tt.phien_ban đổi — hỏi 60 giây/lần, rất nhẹ), và tải ngầm trong lúc vẫn hiện số cũ.
const boNho = new Map();
const nhoMan = { loc: null, the: 'tq' };
const khoaNho = (loai, p) => loai + '|' + JSON.stringify(p || {});

/* ================= NEW - 3.151: HÌNH SẢN PHẨM theo mã ================= */
// Bảng { mã mẹ: link hình } (hình nonson.vn trong san_pham) — tải 1 lần, 30 phút làm mới 1 lần, nhớ trên máy để mở lại hiện ngay
const khoHinh = { map: null, luc: 0, dang: false, nghe: new Set() };
try { const c = JSON.parse(localStorage.getItem('tt_hinh') || 'null'); if (c && typeof c === 'object') khoHinh.map = c; } catch { /* bỏ qua */ }
const ngheHinh = (f) => { khoHinh.nghe.add(f); return () => khoHinh.nghe.delete(f); };
const layHinhMap = () => khoHinh.map;
const maMe = (s) => String(s || '').trim().replace(/-(XXXL|XXL|XL|XS|S|M|L|F|FS|FREE|FREESIZE|[0-9]{2})$/i, '');
const hinhCua = (map, ma) => (map && ma ? map[ma] || map[maMe(ma)] || map[maMe(maMe(ma))] || null : null);
async function taiHinh(token) {
  if (!token || khoHinh.dang || (khoHinh.luc && Date.now() - khoHinh.luc < 30 * 60 * 1000)) return;
  khoHinh.dang = true;
  try {
    const { data, error } = await sb.rpc('fn_tt_hinh', { p_token: token });
    if (!error && data && typeof data === 'object') {
      khoHinh.map = data; khoHinh.luc = Date.now(); khoHinh.nghe.forEach((f) => f());
      try { localStorage.setItem('tt_hinh', JSON.stringify(data)); } catch { /* đầy bộ nhớ: bỏ qua */ }
    }
  } finally { khoHinh.dang = false; }
}

// Ô hình của 1 mã: rê chuột phóng to, bấm (hoặc chạm trên điện thoại) xem hình lớn kèm mã + tên
function AnhMa({ ma, ten, co = 40 }) {
  const map = useSyncExternalStore(ngheHinh, layHinhMap);
  const url = hinhCua(map, ma);
  const [loi, setLoi] = useState(false);
  const [phong, setPhong] = useState(null);
  const [xem, setXem] = useState(false);
  useEffect(() => {
    if (!xem) return undefined;
    const h = (e) => { if (e.key === 'Escape') setXem(false); };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [xem]);
  const kt = { width: co, height: co };
  if (!url || loi) return <span className="tts-anh trong" style={kt} title={ma ? 'Mã ' + ma + ' chưa có hình' : ''} />;
  const viTri = (e) => setPhong({ x: e.clientX, y: e.clientY });
  return (<>
    <img className="tts-anh" style={kt} src={url} alt={ma} loading="lazy" decoding="async" onError={() => setLoi(true)}
      onMouseEnter={viTri} onMouseMove={viTri} onMouseLeave={() => setPhong(null)}
      onClick={(e) => { e.stopPropagation(); setPhong(null); setXem(true); }} />
    {phong && !xem && createPortal(
      <img className="sp-zoom" src={url} alt="" style={{ left: Math.min(phong.x + 18, window.innerWidth - 206), top: Math.max(8, Math.min(phong.y - 95, window.innerHeight - 206)) }} />,
      document.body)}
    {xem && createPortal(
      <div className="img-lightbox tts-anh-xem" onClick={(e) => { e.stopPropagation(); setXem(false); }}>
        <figure><img src={url} alt={ma} /><figcaption><b>{ma}</b>{ten ? <span>{ten}</span> : null}</figcaption></figure>
      </div>, document.body)}
  </>);
}

export default function TikTokShop() {
  const { user, baoToast } = useApp();
  const [loc, setLoc] = useState(() => nhoMan.loc || ({ tu: truNgay(6), den: isoVN(), kenh: '', dm: '', tt: '', nb: null, ch: null }));
  useEffect(() => { nhoMan.loc = loc; }, [loc]);
  const [q, setQ] = useState('');
  const [qTre, setQTre] = useState('');
  const [bc, setBc] = useState(null);
  const [loi, setLoi] = useState('');
  const [dang, setDang] = useState(false);
  const [api, setApi] = useState(() => boNho.get('api')?.data || null);
  const [apiXong, setApiXong] = useState(false);   // đã hỏi phiên bản dữ liệu lần đầu
  const phienBan = api?.phien_ban || '';
  useEffect(() => { taiHinh(user.token); }, [user.token, phienBan]);   // NEW - 3.151: bảng hình theo mã
  const [the, setThe] = useState(nhoMan.the);
  useEffect(() => { nhoMan.the = the; }, [the]);
  // NEW - 3.150: danh sách ID đang theo dõi ★ (lưu trên máy chủ theo người dùng)
  const [td, setTd] = useState(() => boNho.get('api')?.data?.theo_doi || []);
  useEffect(() => { if (api?.theo_doi) setTd(api.theo_doi); }, [api]);
  const [nap, setNap] = useState(false);
  const hen = useRef(null);
  useEffect(() => { clearTimeout(hen.current); hen.current = setTimeout(() => setQTre(q.trim()), 350); return () => clearTimeout(hen.current); }, [q]);

  const pLoc = useMemo(() => {
    const p = { tu: loc.tu, den: loc.den };
    if (qTre) p.q = qTre;
    if (loc.kenh) p.kenh = [loc.kenh];
    if (loc.dm) p.dm = [loc.dm];
    if (loc.tt) p.tt = TT_LOC[loc.tt];
    if (loc.nb != null) p.nb = [loc.nb];
    if (loc.ch != null) p.ch = [loc.ch];
    return p;
  }, [loc, qTre]);

  const khoaHienTai = useRef('');
  const dangTaiKhoa = useRef('');
  const tai = useCallback(async (pb) => {
    const k = khoaNho('bc', pLoc);
    if (dangTaiKhoa.current === k) return;      // đang tải đúng bộ lọc này rồi
    dangTaiKhoa.current = k;
    setDang(true);
    const { data, error } = await sb.rpc('fn_tt_bao_cao', { p_token: user.token, p_loc: pLoc });
    if (dangTaiKhoa.current === k) dangTaiKhoa.current = '';
    setDang(false);
    if (khoaHienTai.current !== k) return;       // anh đã đổi bộ lọc trong lúc chờ
    if (error) { setLoi(error.message); return; }
    boNho.set(k, { data, pb });
    setLoi(''); setBc(data);
  }, [user.token, pLoc]);
  useEffect(() => {
    const k = khoaNho('bc', pLoc);
    khoaHienTai.current = k;
    const c = boNho.get(k);
    if (c) { setBc(c.data); setLoi(''); }
    if (!apiXong) return;                        // chờ biết phiên bản dữ liệu (rất nhanh) rồi mới quyết định
    if (c && c.pb === phienBan) return;          // đã có và TikTok chưa có gì mới → không tải lại
    tai(phienBan);
  }, [pLoc, phienBan, apiXong, tai]);

  const taiApi = useCallback(async () => {
    const { data } = await sb.rpc('fn_tt_api_tt', { p_token: user.token });
    if (data) { setApi(data); boNho.set('api', { data }); }
    setApiXong(true);
  }, [user.token]);
  useEffect(() => { taiApi(); }, [taiApi]);
  // NEW - 3.148: hỏi phiên bản dữ liệu 60 giây/lần (và khi quay lại cửa sổ) — có dữ liệu mới thì tự tải ngầm
  useEffect(() => {
    const hoi = () => { if (document.visibilityState === 'visible') taiApi(); };
    const t = setInterval(hoi, 60000);
    document.addEventListener('visibilitychange', hoi);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', hoi); };
  }, [taiApi]);
  // đang kéo đơn → hỏi lại mỗi 8 giây, xong thì tải lại báo cáo
  const dangKeoTruoc = useRef(false);
  useEffect(() => {
    if (!api?.dang_keo) { dangKeoTruoc.current = false; return; }   // kéo xong → phiên bản dữ liệu đổi → tự tải ngầm
    dangKeoTruoc.current = true;
    const t = setTimeout(taiApi, 8000);
    return () => clearTimeout(t);
  }, [api, taiApi]);

  const doiTd = async (h, bat) => {
    const { data, error } = await sb.rpc('fn_tt_theo_doi_luu', { p_token: user.token, p_handle: h, p_bat: bat });
    if (error) { baoToast('Chưa lưu được: ' + error.message); return; }
    const ds = data?.ds || [];
    setTd(ds);
    const a = boNho.get('api'); if (a) boNho.set('api', { data: { ...a.data, theo_doi: ds } });
    baoToast((bat ? 'Đã thêm vào Theo dõi: ' : 'Đã bỏ theo dõi: ') + (bc?.ten_nb?.[h] || '@' + h));
  };

  const keoNgay = async () => {
    const { data, error } = await sb.rpc('fn_tt_api_keo', { p_token: user.token });
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    baoToast(data?.kq === 'dang_chay' ? 'Đang lấy đơn từ TikTok…' : data?.ok ? 'Đã gửi lệnh lấy đơn — vài giây sẽ có' : 'Chưa kết nối API TikTok');
    setTimeout(taiApi, 1500);
  };

  const datLoc = (k) => (v) => setLoc((l) => ({ ...l, [k]: v }));
  const coLoc = !!(q || loc.kenh || loc.dm || loc.tt || loc.nb != null || loc.ch != null);
  const t = bc?.tong || {};
  const tongDon = (t.don || 0) + (t.don_huy || 0);
  const nbTen = (h) => (h === '' ? 'Không qua người bán' : bc?.ten_nb?.[h] ? `${bc.ten_nb[h]} (@${h})` : '@' + h);

  const KPI = [
    ['', 'Đơn hợp lệ', fmt(t.don), `${fmt(t.so_nb)} người bán · ${fmt(t.so_sp)} mã`],
    ['', 'Sản phẩm bán', fmt(t.sl), `đặt ${fmt(t.sl_dat)} · trả ${fmt(t.sl_tra)}`],
    ['', 'Doanh thu shop', tien(t.dt), t.don ? `trung bình ${tien(t.dt / t.don)} / đơn` : 'giá niêm yết − shop giảm'],
    ['', 'Khách trả', tien(t.khach_tra), `sàn hỗ trợ ${tien(t.san_ho_tro)}`],
    ['huy', 'Đơn huỷ', fmt(t.don_huy), `${pctTxt(t.don_huy || 0, tongDon)} tổng đơn`, 'do'],
    ['cho', 'Chờ gửi hàng', fmt(t.cho_gui), 'chưa giao cho vận chuyển', 'canh'],
    ['dang_giao', 'Đang giao', fmt(t.dang_giao), 'đã gửi, chưa tới khách'],
    ['giao', 'Đã giao', fmt(t.da_giao), `${pctTxt(t.da_giao || 0, t.don || 0)} đơn hợp lệ`],
  ];

  const kho = bc?.kho;
  const napCuoi = bc?.nap?.[0];

  // NEW - 3.154: XUẤT — báo cáo PDF / dữ liệu Excel theo đúng bộ lọc đang xem
  const TT_TEN = { cho: 'chờ gửi hàng', dang_giao: 'đang giao', giao: 'đã giao', huy: 'đã huỷ', tra_hang: 'trả hàng' };
  const moTaLoc = () => [loc.kenh ? 'Kênh ' + (KENH[loc.kenh]?.[0] || loc.kenh) : '', loc.dm ? 'Loại hàng ' + loc.dm : '', loc.tt ? 'Đơn ' + (TT_TEN[loc.tt] || loc.tt) : '',
    loc.nb != null ? 'Người bán ' + nbTen(loc.nb) : '', loc.ch != null ? 'Cửa hàng ' + ((bc?.ch || []).find((c) => c.ma_ch === loc.ch)?.ten || loc.ch || 'chưa gán') : '',
    qTre ? `Tìm "${qTre}"` : ''].filter(Boolean).join('  ·  ') || 'Toàn bộ đơn của shop';
  const meta = () => ({ loc: moTaLoc(), nguoi: [user.ten, user.ma_dang_nhap].filter(Boolean).join(' · '),
    luc: new Date().toLocaleString('vi', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) });
  const taoBaoCao = async (bao) => {
    bao('Đang dựng báo cáo…');
    const [{ docTikTok }, { taoPdfBlob }] = await Promise.all([import('../lib/bao-cao/tiktok.js'), import('../lib/bao-cao/pdf.js')]);
    const blob = await taoPdfBlob(docTikTok(bc, meta()));
    return { blob, ten: `BaoCao_TikTokShop_${bc.tu}_${bc.den}.pdf` };
  };
  const taoDuLieu = async (bao) => {
    const [{ sheetsTikTok }, { excelBlob, layHetDong }] = await Promise.all([import('../lib/bao-cao/tiktok.js'), import('../lib/bao-cao/excel.js')]);
    bao('Đang lấy từng dòng hàng…', 0);
    const dong = await layHetDong(sb, 'fn_tt_xuat', { p_token: user.token, p_loc: pLoc }, (a, b) => bao(`Đang lấy dòng hàng ${fmt(a)} / ${fmt(b)}`, b ? (a / b) * 0.85 : null));
    bao('Đang tạo file Excel…', 0.9);
    await new Promise((r) => setTimeout(r, 30));
    const blob = await excelBlob(sheetsTikTok(bc, dong, meta()));
    return { blob, ten: `DuLieu_TikTokShop_${bc.tu}_${bc.den}.xlsx` };
  };

  return (
    <>
      <div className="cmdbar">
        <h1>TikTok Shop</h1>
        <div className="sub">Đơn bán trên TikTok Shop — số đơn, số lượng, doanh thu theo sản phẩm, người bán, cửa hàng và kênh LIVE / Video / Thẻ sản phẩm. Tự lấy qua API mỗi 5 phút; nạp thêm file Excel khi cần.</div>
      </div>
      <div className="odn tts">
        {/* Nguồn dữ liệu */}
        {/* NEW - 3.154.2: thanh trạng thái gọn — 1 chip "Cập nhật", chỉ báo thêm khi có việc cần để ý; chi tiết rê chuột vào chip */}
        <div className="odn-dong-bo">
          <span className="odn-db-i"><IcClock /> Dữ liệu <b>{kho?.tu ? ngayVN(kho.tu) : '—'}</b> – <b>{kho?.den ? ngayVN(kho.den) : '—'}</b>
            <em>· {fmt(kho?.tong_don || 0)} đơn</em></span>
          <span className="odn-api">
            {api?.ket_noi
              ? <i className="ok" title={[api.shop_ten ? 'API đã kết nối · ' + api.shop_ten : 'API đã kết nối',
                  api.keo_luc ? 'Lấy đơn lúc ' + gioNgay(api.keo_luc) + ' (5 phút/lần)' : '',
                  api.ds_luc ? `Đối soát: ${soLech(api) ? 'đang kéo bù ' + soLech(api) + ' ngày' : 'khớp ' + (api.doi_soat || []).length + ' ngày'}` : '',
                  (api.ar_kq?.luc || api.lk_kq?.luc) ? 'ID người bán từng đơn lúc ' + gioNgay(api.ar_kq?.luc || api.lk_kq.luc) : '',
                  api.tk_luc ? 'Thống kê LIVE / video lúc ' + gioNgay(api.tk_luc) : '',
                  napCuoi ? `Lần nạp cuối ${gioNgay(napCuoi.luc)} (${napCuoi.nguon === 'api' ? 'API' : 'Excel'})` : ''].filter(Boolean).join('\n')}>
                  {api.dang_keo ? 'Đang lấy đơn…' : 'Cập nhật ' + gioGon(api.keo_luc)}</i>
              : <i className="cho">Chưa nối API — đang dùng file Excel</i>}
            {api?.ds_luc && (soKet(api) > 0
              ? <i className="do" title="Có ngày đã tự kéo bù 3 lần vẫn chưa khớp TikTok — xem thẻ Đối soát">Lệch {fmt(soKet(api))} ngày</i>
              : soLech(api) > 0 ? <i className="lech" title="Có ngày app còn ít đơn hơn TikTok — hệ thống đang tự kéo bù, 15 phút kiểm lại một lần">Đang kéo bù {fmt(soLech(api))} ngày</i> : null)}
            {api?.loi && <i className="do" title={api.loi}>Lỗi API</i>}
          </span>
          {api?.ket_noi && <button className="odn-nut-phu odn-nut-icon" onClick={keoNgay} disabled={api?.dang_keo} title="Lấy ngay từ TikTok" aria-label="Lấy ngay từ TikTok"><IcRefresh /></button>}
          <NutXuat sanSang={!!bc && !dang} taoBaoCao={taoBaoCao} taoDuLieu={taoDuLieu} ghiChu="Theo đúng khoảng ngày + bộ lọc đang xem" />
          <button className="btn btn-ai odn-nut-chinh" onClick={() => setNap(true)}><IcGuiLen /> Nạp file Excel</button>
        </div>

        {/* Bộ lọc */}
        <div className="odn-loc">
          <label className="odn-tim"><IcSearch />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mã đơn, mã hàng, tên sản phẩm, ID người bán, mã vận đơn…" /></label>
          <DateBox label="Từ" value={loc.tu} onChange={datLoc('tu')} />
          <DateBox label="Đến" value={loc.den} onChange={datLoc('den')} />
          <Sel value={loc.kenh} onChange={datLoc('kenh')} placeholder="Kênh"
            options={[{ value: '', label: 'Mọi kênh' }, ...Object.entries(KENH).map(([k, [ten]]) => ({ value: k, label: ten }))]} />
          <Sel value={loc.dm} onChange={datLoc('dm')} placeholder="Loại hàng"
            options={[{ value: '', label: 'Mọi loại hàng' }, ...(bc?.dm || []).filter((d) => d.k).map((d) => ({ value: d.k, label: d.k }))]} />
          <Sel value={loc.tt} onChange={datLoc('tt')} placeholder="Trạng thái"
            options={[{ value: '', label: 'Mọi trạng thái' }, { value: 'cho', label: 'Chờ gửi hàng' }, { value: 'dang_giao', label: 'Đang giao' },
              { value: 'giao', label: 'Đã giao' }, { value: 'huy', label: 'Đã huỷ' }, { value: 'tra_hang', label: 'Trả hàng' }]} />
          {coLoc && <button className="odn-nut-phu" onClick={() => { setQ(''); setLoc((l) => ({ ...l, kenh: '', dm: '', tt: '', nb: null, ch: null })); }}>Bỏ lọc</button>}
        </div>
        <div className="tts-nhanh">
          {NHANH.map(([ten, f]) => {
            const [a, b] = f();
            return <button key={ten} className={loc.tu === a && loc.den === b ? 'on' : ''} onClick={() => setLoc((l) => ({ ...l, tu: a, den: b }))}>{ten}</button>;
          })}
          {loc.nb != null && <span className="tts-loc-chip">Người bán: <b>{nbTen(loc.nb)}</b><button onClick={() => setLoc((l) => ({ ...l, nb: null }))} aria-label="Bỏ lọc người bán">✕</button></span>}
          {loc.ch != null && <span className="tts-loc-chip">Cửa hàng: <b>{(bc?.ch || []).find((c) => c.ma_ch === loc.ch)?.ten || loc.ch || 'Chưa gán'}</b><button onClick={() => setLoc((l) => ({ ...l, ch: null }))} aria-label="Bỏ lọc cửa hàng">✕</button></span>}
          {dang && <span className="odn-phu">{bc ? 'Đang cập nhật số mới…' : 'Đang tải…'}</span>}
        </div>

        {loi && <div className="odn-bao do"><IcAlert /> Không tải được: {loi} <button onClick={() => tai(phienBan)}>Thử lại</button></div>}

        {/* Chỉ số */}
        <div className="odn-kpi">
          {KPI.map(([k, ten, so, phu, mau], i) => (
            <button key={i} className={'odn-k' + (k && loc.tt === k ? ' on' : '') + (mau && Number(String(so).replace(/\D/g, '')) > 0 ? ' ' + mau : '')}
              onClick={() => k && setLoc((l) => ({ ...l, tt: l.tt === k ? '' : k }))} style={k ? undefined : { cursor: 'default' }}>
              <b>{bc ? so : '…'}</b><span>{ten}</span>{bc && <em>{phu}</em>}
            </button>
          ))}
        </div>

        {/* Thẻ */}
        <div className="odn-the" role="tablist">
          {[['tq', 'Tổng quan'], ['td', 'Theo dõi ★', td.length || null], ['sp', 'Sản phẩm', bc?.sp?.length], ['nb', 'Người bán', bc ? new Set([...(bc.nb || []).map((x) => x.nb).filter(Boolean), ...Object.keys(bc.live_nb || {}), ...Object.keys(bc.video_nb || {})]).size : null],
            ['vl', 'Video & LIVE', bc ? (bc.live_top || []).length + (bc.video_top || []).length : null],
            ['ch', 'Cửa hàng', bc?.ch?.length], ['don', 'Đơn hàng', tongDon], ['gan', 'Gán cửa hàng', bc?.chua_gan || null],
            ['ds', 'Đối soát', soLech(api) || null]].map(([k, ten, so]) => (
            <button key={k} role="tab" aria-selected={the === k} className={the === k ? 'on' : ''} onClick={() => setThe(k)}>
              {ten}{so != null && so !== 0 && <i className={k === 'gan' || k === 'ds' ? 'canh' : ''}>{fmt(so)}</i>}
            </button>
          ))}
        </div>

        {!bc ? <div className="odn-bang-khung"><div className="odn-trong">Đang tải báo cáo…</div></div>
          : the === 'tq' ? <TongQuan bc={bc} tongDon={tongDon} chonNb={(nb) => { setLoc((l) => ({ ...l, nb })); }} />
          : the === 'td' ? <TheoDoi bc={bc} pLoc={pLoc} phienBan={phienBan} apiXong={apiXong} td={td} doiTd={doiTd}
              chonNb={(nb) => { setLoc((l) => ({ ...l, nb })); setThe('tq'); baoToast('Đang lọc toàn bộ báo cáo theo ' + nbTen(nb)); }} />
          : the === 'sp' ? <BangSanPham ds={bc.sp} />
          : the === 'nb' ? <BangNguoiBan bc={bc} td={td} doiTd={doiTd} chon={(nb) => { setLoc((l) => ({ ...l, nb })); baoToast('Đang lọc theo ' + nbTen(nb)); }} moGan={() => setThe('gan')} />
          : the === 'vl' ? <VideoLive bc={bc} chon={(nb) => { setLoc((l) => ({ ...l, nb })); baoToast('Đang lọc theo ' + nbTen(nb)); }} />
          : the === 'ch' ? <BangCuaHang ds={bc.ch} chon={(ch) => { setLoc((l) => ({ ...l, ch })); baoToast('Đang lọc theo cửa hàng'); }} />
          : the === 'don' ? <DsDon pLoc={pLoc} tenNb={bc.ten_nb} phienBan={phienBan} apiXong={apiXong} />
          : the === 'ds' ? <DoiSoat api={api} xong={taiApi} />
          : <GanNguoiBan xong={taiApi} phienBan={phienBan} apiXong={apiXong} />}

        {tongDon === 0 && bc && !dang && (kho?.tong_don || 0) === 0 && (
          <div className="tts-trong">
            <b>Chưa có đơn TikTok nào trong app</b>
            <p>Bấm <b>Nạp file Excel</b> và kéo thả file "Tất cả đơn hàng" xuất từ Seller Center. Khi API đã kết nối, đơn sẽ tự về mỗi 5 phút.</p>
          </div>
        )}
      </div>
      {nap && <HopNap dong={() => setNap(false)} xong={taiApi} />}
    </>
  );
}

/* ================= Tổng quan ================= */
function TongQuan({ bc, tongDon, chonNb }) {
  const theoGio = bc.tu === bc.den;
  const cot = useMemo(() => {
    const m = new Map((bc.theo || []).map((x) => [x.k, x]));
    if (theoGio) return Array.from({ length: 24 }, (_, h) => { const k = String(h).padStart(2, '0'); return { k, nhan: h, ...(m.get(k) || {}) }; });
    const ds = []; const a = new Date(bc.tu + 'T00:00:00'); const b = new Date(bc.den + 'T00:00:00');
    for (let d = new Date(a); d <= b && ds.length < 400; d.setDate(d.getDate() + 1)) {
      const k = isoVN(d); ds.push({ k, nhan: d.getDate(), ...(m.get(k) || {}) });
    }
    if (ds.length <= 62) return ds;
    // dài quá 2 tháng → gộp theo tuần
    const tuan = [];
    for (let i = 0; i < ds.length; i += 7) {
      const g = ds.slice(i, i + 7);
      const cong = (f) => g.reduce((s, x) => s + (x[f] || 0), 0);
      tuan.push({ k: g[0].k, nhan: ngayVN(g[0].k).slice(0, 5), den: g[g.length - 1].k, don: cong('don'), huy: cong('huy'), sl: cong('sl'), dt: cong('dt'), live: cong('live'), video: cong('video'), the: cong('the') });
    }
    return tuan;
  }, [bc, theoGio]);
  const max = Math.max(1, ...cot.map((x) => x.sl || 0));
  const tongSl = (bc.kenh || []).reduce((s, x) => s + (x.sl || 0), 0);
  const huy = bc.huy || [];
  const tongHuy = huy.reduce((s, x) => s + x.n, 0);
  const ai = huy.reduce((s, x) => ({ kh: s.kh + (x.kh || 0), ht: s.ht + (x.ht || 0), shop: s.shop + (x.shop || 0) }), { kh: 0, ht: 0, shop: 0 });

  return (
    <div className="tts-tq">
      <div className="odn-bd tts-bd">
        <div className="odn-bd-dau"><b>Sản phẩm bán {theoGio ? 'theo giờ' : cot.length > 62 || cot[0]?.den ? 'theo tuần' : 'theo ngày'}</b>
          <span>{Object.entries(KENH).map(([k, [ten, m]]) => <span key={k} className="tts-cb"><i style={{ background: m }} />{ten}</span>)}</span></div>
        <div className="odn-bd-cot tts-cot">
          {cot.map((x) => {
            const khac = Math.max((x.sl || 0) - (x.live || 0) - (x.video || 0) - (x.the || 0), 0);
            const h = ((x.sl || 0) / max) * 100;
            return (
              <div key={x.k} className="odn-bd-c" title={`${theoGio ? x.nhan + 'h' : ngayVN(x.k)}${x.den ? ' → ' + ngayVN(x.den) : ''}: ${fmt(x.sl || 0)} sản phẩm · ${fmt(x.don || 0)} đơn · ${fmt(x.huy || 0)} huỷ · doanh thu ${tien(x.dt || 0)}`}>
                {x.sl > 0 && <em className="tts-cot-so">{fmt(x.sl)}</em>}
                <div className="tts-cot-thanh" style={{ height: h + '%' }}>
                  {[['live', x.live], ['video', x.video], ['the', x.the], ['khac', khac]].filter(([, v]) => v > 0).map(([k, v]) => (
                    <i key={k} style={{ height: (v / x.sl) * 100 + '%', background: KENH[k][1] }} />
                  ))}
                </div>
                <span>{theoGio ? x.nhan : x.nhan}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="tts-luoi3">
        <Khung tieu="Kênh bán" phu="theo số sản phẩm">
          {(bc.kenh || []).map((x) => (
            <Dong key={x.k} ten={<KenhChip k={x.k} />} so={fmt(x.sl)} phu={`${fmt(x.don)} đơn · ${tien(x.dt)}`} ty={pct(x.sl, tongSl)} mau={(KENH[x.k] || KENH.khac)[1]} />
          ))}
        </Khung>
        <Khung tieu="Loại hàng" phu="theo số sản phẩm">
          {(bc.dm || []).map((x) => (
            <Dong key={x.k} ten={x.k || 'Chưa rõ'} so={fmt(x.sl)} phu={`${fmt(x.don)} đơn · ${tien(x.dt)}`} ty={pct(x.sl, tongSl)} mau="#1E5F63" />
          ))}
        </Khung>
        <Khung tieu="Lý do huỷ" phu={tongHuy ? `${fmt(tongHuy)} đơn · khách ${ai.kh} · hệ thống ${ai.ht} · shop ${ai.shop}` : 'không có đơn huỷ'}>
          {huy.slice(0, 7).map((x) => (
            <Dong key={x.k} ten={x.k} so={fmt(x.n)} phu={pctTxt(x.n, tongDon) + ' tổng đơn'} ty={pct(x.n, tongHuy)} mau="#D6006C" />
          ))}
        </Khung>
      </div>

      <div className="tts-luoi3">
        <Khung tieu="Người bán dẫn đầu" phu="bấm để lọc">
          {(bc.nb || []).filter((x) => x.don > 0).slice(0, 8).map((x) => (
            <Dong key={x.nb} ten={<span className="tts-nb">{tenGoi(bc.ten_nb, x.nb)}{(x.ten_ch || bc.ten_nb?.[x.nb]) && <small>{x.ten_ch || '@' + x.nb}</small>}</span>}
              so={tien(x.dt)} phu={`${fmt(x.don)} đơn · ${fmt(x.sl)} sp`} ty={pct(x.dt, (bc.nb || [])[0]?.dt || 1)} mau="#3FB6A8" onClick={() => chonNb(x.nb)} />
          ))}
        </Khung>
        <Khung tieu="Tỉnh / thành nhiều đơn" phu="đơn hợp lệ">
          {(bc.tinh || []).slice(0, 8).map((x) => (
            <Dong key={x.k} ten={x.k || 'Chưa rõ'} so={fmt(x.don)} phu={tien(x.dt)} ty={pct(x.don, (bc.tinh || [])[0]?.don || 1)} mau="#14213A" />
          ))}
        </Khung>
        <Khung tieu="Vận chuyển & thanh toán" phu="đơn hợp lệ">
          {(bc.dvvc || []).filter((x) => x.don > 0).slice(0, 4).map((x) => (
            <Dong key={'v' + x.k} ten={x.k || 'Chưa có đơn vị'} so={fmt(x.don)} ty={pct(x.don, bc.tong?.don || 1)} mau="#1E5F63" />
          ))}
          {(bc.thanh_toan || []).filter((x) => x.don > 0).slice(0, 4).map((x) => (
            <Dong key={'t' + x.k} ten={x.k || 'Chưa rõ'} so={fmt(x.don)} ty={pct(x.don, bc.tong?.don || 1)} mau="#CBA45A" />
          ))}
        </Khung>
      </div>
    </div>
  );
}
function Khung({ tieu, phu, children }) {
  const rong = !children || (Array.isArray(children) && children.flat().filter(Boolean).length === 0);
  return (
    <div className="tts-khung">
      <div className="tts-khung-dau"><b>{tieu}</b>{phu && <span>{phu}</span>}</div>
      {rong ? <div className="odn-phu tts-khung-trong">Chưa có dữ liệu</div> : <div className="tts-dong-ds">{children}</div>}
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

/* ================= Bảng sắp xếp dùng chung ================= */
function useSap(ds, mac) {
  const [sap, setSap] = useState(mac);
  const rows = useMemo(() => {
    const a = [...(ds || [])];
    a.sort((x, y) => { const u = x[sap.k] ?? '', v = y[sap.k] ?? ''; return (u < v ? -1 : u > v ? 1 : 0) * sap.d; });
    return a;
  }, [ds, sap]);
  const th = (k, ten, cls = '') => (
    <th className={'sap ' + cls} onClick={() => setSap((s) => ({ k, d: s.k === k ? -s.d : -1 }))}>
      {ten}{sap.k === k ? (sap.d < 0 ? ' ↓' : ' ↑') : ''}</th>
  );
  return [rows, th];
}

// NEW - 3.147: số liệu trả đủ, không cắt — bảng dài chỉ VẼ dần từng 300 dòng cho app mượt, bấm để hiện thêm / hiện tất cả
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

function BangSanPham({ ds }) {
  const [rowsDu, th] = useSap(ds, { k: 'sl', d: -1 });
  const [rows, chan] = useHienDan(rowsDu);
  const [mo, setMo] = useState(null);
  return (
    <div className="odn-bang-khung">
      <table className="odn-bang tts-bang">
        <thead><tr>{th('ma', 'Mã hàng')}{th('sl', 'SL bán', 'so')}{th('don', 'Đơn', 'so')}{th('dt', 'Doanh thu', 'so')}
          {th('huy', 'Huỷ', 'so')}<th>Kênh</th>{th('so_nb', 'Người bán', 'so')}</tr></thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan={7} className="odn-trong">Không có sản phẩm trong khoảng lọc.</td></tr>
            : rows.map((r) => [
              <tr key={r.ma} className={mo === r.ma ? 'on' : ''} onClick={() => setMo(mo === r.ma ? null : r.ma)}>
                <td title={r.ten || ''}><div className="tts-ma-o"><AnhMa ma={r.ma} ten={r.ten} co={44} />
                  <div><div className="odn-ten">{r.ma}</div><div className="odn-phu">{r.dm || '—'} · {(r.co || []).length} phân loại</div></div></div></td>
                <td className="so"><b>{fmt(r.sl)}</b>{r.dat !== r.sl && <div className="odn-phu">đặt {fmt(r.dat)}</div>}</td>
                <td className="so">{fmt(r.don)}</td>
                <td className="so"><b>{tien(r.dt)}</b></td>
                <td className="so">{r.huy > 0 ? <span className="tts-huy">{fmt(r.huy)}</span> : '—'}{r.tra > 0 && <div className="odn-phu">trả {fmt(r.tra)}</div>}</td>
                <td><ThanhKenh r={r} /></td>
                <td className="so">{fmt(r.so_nb)}</td>
              </tr>,
              mo === r.ma && (
                <tr key={r.ma + '_co'} className="tts-mo"><td colSpan={7}>{r.ten && <div className="odn-phu tts-co-ten">{r.ten}</div>}
                  <div className="tts-co">{(r.co || []).map((c) => (
                    <span key={c.sku} className="tts-co-o"><b>{c.sku}</b><small>{c.pl || ''}</small><em>{fmt(c.sl)}{c.dat !== c.sl ? ` / đặt ${fmt(c.dat)}` : ''}</em></span>
                  ))}</div>
                </td></tr>
              ),
            ])}
        </tbody>
      </table>
      {chan}
    </div>
  );
}

// NEW - 3.141: gộp 3 nguồn theo ID người bán — đơn (LIVE gắn theo mã phòng + Excel), thống kê phiên LIVE, thống kê video
// NEW - 3.149: cột CỬA HÀNG đứng đầu và luôn có chữ — cửa hàng đã gán, hoặc nhóm theo loại (Kênh công ty, Đội sale,
//   Nhà sáng tạo ngoài, Khác), đơn mua qua thẻ sản phẩm → "Thẻ sản phẩm"; chưa gán → "Chưa gán" + nút Gán
const NHOM_LOAI = { KENH: 'Kênh công ty', DOISALE: 'Đội sale', KOL: 'Nhà sáng tạo ngoài', KHAC: 'Khác', CH: 'Cửa hàng — chưa chọn' };
function nhomCuaHang(r) {
  if (r.nb === '') return { ten: 'Thẻ sản phẩm', phu: 'không qua người bán', loai: 'the' };
  if (r.ten_ch) return { ten: r.ten_ch, phu: r.ma_ch || '', loai: 'ch' };
  if (r.loai && NHOM_LOAI[r.loai]) return { ten: NHOM_LOAI[r.loai], phu: r.loai === 'CH' ? 'cần chọn cửa hàng' : 'không gắn cửa hàng', loai: r.loai === 'CH' ? 'chua' : 'nhom' };
  return { ten: 'Chưa gán', phu: 'cần gán cửa hàng / loại', loai: 'chua' };
}

function BangNguoiBan({ bc, td = [], doiTd, chon, moGan }) {
  const dangTd = useMemo(() => new Set(td.map((x) => x.handle)), [td]);
  const ds = useMemo(() => {
    const m = new Map();
    for (const r of bc.nb || []) m.set(r.nb, { ...r });
    const them = (h) => { if (!m.has(h)) m.set(h, { nb: h, don: 0, sl: 0, dt: 0, huy: 0, so_sp: 0, live: 0, video: 0, the: 0 }); return m.get(h); };
    for (const [h, v] of Object.entries(bc.live_nb || {})) Object.assign(them(h), { lv_phien: v.so_phien, lv_dt: v.dt, lv_sl: v.sl, lv_don: v.don, lv_xem: v.xem });
    for (const [h, v] of Object.entries(bc.video_nb || {})) Object.assign(them(h), { vd_so: v.so_video, vd_don: v.don, vd_sl: v.sl, vd_dt: v.dt, vd_xem: v.xem });
    for (const r of m.values()) {
      const tt = bc.nb_tt?.[r.nb];   // loại + cửa hàng của mọi ID (kể cả ID chỉ có số LIVE / video)
      if (tt) { r.loai = r.loai || tt.loai; r.ma_ch = r.ma_ch || tt.ma_ch; r.ten_ch = r.ten_ch || tt.ten_ch; }
      r.nhom = nhomCuaHang(r);
      r.nhom_ten = r.nhom.ten;
      r.ten_nb = r.nb === '' ? '' : (bc.ten_nb?.[r.nb] || r.nb);
    }
    return [...m.values()];
  }, [bc]);
  const [rows, th] = useSap(ds, { k: 'dt', d: -1 });
  const tk = bc.tk || {};
  const t = bc.tong || {};
  // dòng TỔNG: phần "Tổng theo đơn" lấy đúng ô tổng trên cùng (không cộng trùng đơn có nhiều người bán); LIVE / video cộng các dòng
  const cong = (k) => ds.reduce((x, r) => x + (Number(r[k]) || 0), 0);
  return (
    <div className="odn-bang-khung">
      <div className="tts-ghi-nguon">
        <span><b>Tổng theo đơn</b> (vùng xám): số chuẩn app tính từ chính các mã đơn — mỗi đơn tính cho ID đã bán nó (mua trực tiếp từ LIVE hoặc video của ID đó, đúng cách Seller Center ghi nhận). Đơn: đơn hợp lệ · SL: sản phẩm bán ra sau trả · Doanh thu: tiền shop thu sau giảm giá của shop · Huỷ: số đơn huỷ. Dùng cột này để so doanh số giữa các ID / cửa hàng.</span>
        <span><b>LIVE / Video (TikTok thống kê)</b>: số TikTok tự thống kê theo từng phiên LIVE, từng video (doanh số gộp, có cả đơn chưa thanh toán / sẽ huỷ), chốt chậm 1–2 ngày — để xem hiệu quả nội dung, không cộng với vùng xám
          {tk.live_den || tk.video_den ? ` (đang có tới ${tk.live_den ? 'LIVE ' + ngayVN(tk.live_den) : ''}${tk.video_den ? ' · video ' + ngayVN(tk.video_den) : ''})` : ''}.</span>
      </div>
      <table className="odn-bang tts-bang tts-bang-nb">
        <thead>
          <tr className="tts-nhom"><th colSpan={2} /><th colSpan={4} className="so tts-dn">Tổng theo đơn · số chuẩn</th><th colSpan={3} className="so tts-lv">LIVE · TikTok thống kê</th><th colSpan={3} className="so tts-vd">Video · TikTok thống kê</th></tr>
          <tr>{th('nhom_ten', 'Cửa hàng')}{th('ten_nb', 'Người bán')}
            {th('don', 'Đơn', 'so tts-dn')}{th('sl', 'SL', 'so tts-dn')}{th('dt', 'Doanh thu', 'so tts-dn')}{th('huy', 'Huỷ', 'so tts-dn')}
            {th('lv_phien', 'Phiên', 'so tts-lv')}{th('lv_sl', 'SL', 'so tts-lv')}{th('lv_dt', 'Doanh số', 'so tts-lv')}
            {th('vd_so', 'Video', 'so tts-vd')}{th('vd_sl', 'SL', 'so tts-vd')}{th('vd_dt', 'Doanh số', 'so tts-vd')}</tr>
          {rows.length > 0 && (
            <tr className="tts-dong-tong">
              <td><div className="odn-ten">Tổng cộng</div><div className="odn-phu">{fmt(rows.filter((r) => r.nb !== '').length)} người bán</div></td>
              <td />
              <td className="so tts-dn"><b>{fmt(t.don)}</b></td>
              <td className="so tts-dn"><b>{fmt(t.sl)}</b></td>
              <td className="so tts-dn tts-dt"><b>{tien(t.dt)}</b></td>
              <td className="so tts-dn">{t.don_huy > 0 ? <span className="tts-huy">{fmt(t.don_huy)}</span> : '—'}</td>
              <td className="so tts-lv"><b>{fmt(cong('lv_phien'))}</b></td>
              <td className="so tts-lv"><b>{fmt(cong('lv_sl'))}</b></td>
              <td className="so tts-lv"><b>{tien(cong('lv_dt'))}</b></td>
              <td className="so tts-vd"><b>{fmt(cong('vd_so'))}</b></td>
              <td className="so tts-vd"><b>{fmt(cong('vd_sl'))}</b></td>
              <td className="so tts-vd"><b>{tien(cong('vd_dt'))}</b></td>
            </tr>)}
        </thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan={12} className="odn-trong">Không có người bán trong khoảng lọc.</td></tr>
            : rows.map((r) => (
              <tr key={r.nb} onClick={() => chon(r.nb)} title="Bấm để lọc toàn bộ báo cáo theo người bán này">
                <td className="tts-o-ch">
                  <div className={'tts-ch-ten ' + r.nhom.loai}>{r.nhom.ten}</div>
                  {r.nhom.loai === 'chua'
                    ? <button className="tts-link" onClick={(e) => { e.stopPropagation(); moGan(); }}>Gán cửa hàng</button>
                    : <div className="odn-phu">{r.nhom.phu}</div>}
                </td>
                <td><div className="tts-nb-o">
                  {r.nb && doiTd && <button className={'tts-sao' + (dangTd.has(r.nb) ? ' on' : '')} aria-pressed={dangTd.has(r.nb)}
                    title={dangTd.has(r.nb) ? 'Đang theo dõi — bấm để bỏ' : 'Thêm vào Theo dõi ★'}
                    onClick={(e) => { e.stopPropagation(); doiTd(r.nb, !dangTd.has(r.nb)); }}>{dangTd.has(r.nb) ? '★' : '☆'}</button>}
                  <div><div className="odn-ten nho">{tenGoi(bc.ten_nb, r.nb)}</div>
                  <div className="odn-phu">{r.nb ? (bc.ten_nb?.[r.nb] ? '@' + r.nb + ' · ' : '') + (r.loai ? LOAI[r.loai] || r.loai : 'chưa gán loại') : 'mua qua thẻ sản phẩm, không qua LIVE / video'}</div></div>
                </div></td>
                <td className="so tts-dn"><b>{r.don ? fmt(r.don) : '—'}</b></td>
                <td className="so tts-dn">{r.sl ? fmt(r.sl) : '—'}</td>
                <td className="so tts-dn tts-dt"><b>{r.dt ? tien(r.dt) : '—'}</b></td>
                <td className="so tts-dn">{r.huy > 0 ? <span className="tts-huy">{fmt(r.huy)}</span> : '—'}</td>
                <td className="so tts-lv">{r.lv_phien ? fmt(r.lv_phien) : '—'}</td>
                <td className="so tts-lv">{r.lv_sl ? fmt(r.lv_sl) : '—'}</td>
                <td className="so tts-lv"><b>{r.lv_dt ? tien(r.lv_dt) : '—'}</b></td>
                <td className="so tts-vd">{r.vd_so ? fmt(r.vd_so) : '—'}</td>
                <td className="so tts-vd">{r.vd_sl ? fmt(r.vd_sl) : '—'}</td>
                <td className="so tts-vd"><b>{r.vd_dt ? tien(r.vd_dt) : '—'}</b></td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

/* ================= NEW - 3.150: THEO DÕI ★ — các ID người bán anh chọn để theo dõi riêng ================= */
// 8 màu phân biệt (đã kiểm cho người mù màu); mỗi ID giữ một ô màu cố định — thêm / bỏ ID khác không làm đổi màu ID cũ.
// Từ ID thứ 9 dùng lại màu nhưng vẽ nét đứt để vẫn phân biệt.
const MAU_TD = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const mauTd = (m) => MAU_TD[(Number(m) || 0) % MAU_TD.length];
const netTd = (m) => (Number(m) || 0) >= MAU_TD.length;
const tyLe = (moi, cu) => (cu > 0 ? ((moi - cu) / cu) * 100 : moi > 0 ? null : 0);
const XANH_DAM = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281'];
const lamTronTren = (v) => { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); const m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; };
const cacNgay = (tu, den) => { const ds = []; const d = new Date(tu + 'T00:00:00'); const c = new Date(den + 'T00:00:00'); while (d <= c && ds.length < 800) { ds.push(isoVN(d)); d.setDate(d.getDate() + 1); } return ds; };

function Lech({ moi, cu }) {
  const v = tyLe(Number(moi) || 0, Number(cu) || 0);
  if (v == null) return <span className="tts-lech moi" title="Kỳ trước chưa có số">mới</span>;
  if (Math.abs(v) < 0.5) return <span className="tts-lech bang" title="So với kỳ trước">= 0%</span>;
  return <span className={'tts-lech ' + (v > 0 ? 'tang' : 'giam')} title="So với kỳ trước">
    {v > 0 ? '▲' : '▼'} {Math.abs(v).toLocaleString('vi', { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 1 })}%</span>;
}

// Biểu đồ đường nhiều ID: 1 trục, nét 2px, rê chuột hiện đường dóng + bảng số từng ID; ≤ 4 ID thì ghi tên ở cuối đường
function BieuDoDuong({ nhan, chuoi, dinhDang, nhanX }) {
  const ref = useRef(null);
  const [rong, setRong] = useState(800);
  const [tro, setTro] = useState(null);
  useEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setRong(Math.max(320, Math.floor(e.contentRect.width))));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const ghiTen = chuoi.length <= 4 && rong >= 560;   // màn hẹp: chỉ dùng chú giải bên dưới
  const cao = 270, le = { t: 14, r: ghiTen ? 128 : 18, b: 28, l: 62 };
  const w = rong - le.l - le.r, h = cao - le.t - le.b, n = nhan.length;
  const max = lamTronTren(Math.max(0, ...chuoi.flatMap((c) => c.y)));
  const x = (i) => le.l + (n <= 1 ? w / 2 : (i * w) / (n - 1));
  const y = (v) => le.t + h - (Math.max(0, v) / max) * h;
  const buoc = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(w / 64))));
  // nhãn cuối đường: xếp theo độ cao rồi đẩy cách nhau ≥ 15px để không chồng
  const nhanCuoi = ghiTen ? chuoi.map((c) => ({ c, yy: y(c.y[n - 1] || 0) })).sort((a, b) => a.yy - b.yy) : [];
  for (let i = 1; i < nhanCuoi.length; i++) if (nhanCuoi[i].yy - nhanCuoi[i - 1].yy < 15) nhanCuoi[i].yy = nhanCuoi[i - 1].yy + 15;
  const chi = tro == null ? null : Math.min(n - 1, Math.max(0, tro));
  const diChuot = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - r.left;
    setTro(n <= 1 ? 0 : Math.round(((mx - le.l) / w) * (n - 1)));
  };
  return (
    <div className="tts-bd" ref={ref}>
      <svg width={rong} height={cao} role="img" aria-label="Diễn biến theo ngày của các ID đang theo dõi" onMouseMove={diChuot} onMouseLeave={() => setTro(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}><line x1={le.l} x2={le.l + w} y1={y(f * max)} y2={y(f * max)} className="tts-bd-luoi" />
            <text x={le.l - 8} y={y(f * max) + 4} textAnchor="end" className="tts-bd-truc">{dinhDang(f * max)}</text></g>
        ))}
        {nhan.map((k, i) => (i % buoc === 0 || i === n - 1) && (i === n - 1 || n - 1 - i >= Math.max(1, buoc * 0.8)) && (
          <text key={k} x={x(i)} y={cao - 8} textAnchor="middle" className="tts-bd-truc">{nhanX(k)}</text>
        ))}
        {chi != null && <line x1={x(chi)} x2={x(chi)} y1={le.t} y2={le.t + h} className="tts-bd-dong" />}
        {chuoi.map((c) => (
          <path key={c.k} d={c.y.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ')}
            fill="none" stroke={c.mau} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={c.net ? '6 4' : undefined} />
        ))}
        {n === 1 && chuoi.map((c) => <circle key={c.k} cx={x(0)} cy={y(c.y[0] || 0)} r="4" fill={c.mau} stroke="#fff" strokeWidth="2" />)}
        {chi != null && chuoi.map((c) => <circle key={c.k} cx={x(chi)} cy={y(c.y[chi] || 0)} r="4.5" fill={c.mau} stroke="#fff" strokeWidth="2" />)}
        {nhanCuoi.map(({ c, yy }) => (
          <g key={c.k}><circle cx={le.l + w + 10} cy={yy} r="4" fill={c.mau} />
            <text x={le.l + w + 18} y={yy + 4} className="tts-bd-ten">{c.ten.length > 16 ? c.ten.slice(0, 15) + '…' : c.ten}</text></g>
        ))}
        <rect x={le.l} y={le.t} width={w} height={h} fill="transparent" />
      </svg>
      {chi != null && (
        <div className="tts-bd-hop" style={{ left: Math.min(x(chi) + 12, rong - 230), top: 8 }}>
          <b>{nhanX(nhan[chi], true)}</b>
          {[...chuoi].sort((a, b) => (b.y[chi] || 0) - (a.y[chi] || 0)).map((c) => (
            <div key={c.k}><i style={{ background: c.mau }} /><span>{c.ten}</span><b>{dinhDang(c.y[chi] || 0, true)}</b></div>
          ))}
        </div>
      )}
    </div>
  );
}

function Duong24({ gio, mau }) {
  const max = Math.max(1, ...gio);
  const dinh = gio.indexOf(Math.max(...gio));
  return (
    <div className="tts-24">
      <div className="tts-24-cot">{gio.map((v, i) => (
        <i key={i} style={{ height: Math.max(2, (v / max) * 100) + '%', background: v ? mau : '#E6E9EE' }} title={`${i}h–${i + 1}h: ${fmt(v)} sp`} />
      ))}</div>
      <div className="tts-24-truc"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>24h</span></div>
      <div className="odn-phu">{max > 1 || gio[dinh] ? `Bán mạnh nhất ${dinh}h–${dinh + 1}h (${fmt(gio[dinh])} sp)` : 'Chưa có đơn'}</div>
    </div>
  );
}

function DuongNho({ y, mau }) {
  const w = 220, h = 46, n = y.length, max = Math.max(1, ...y);
  if (n < 2) return null;
  const d = y.map((v, i) => (i ? 'L' : 'M') + ((i * w) / (n - 1)).toFixed(1) + ' ' + (h - 3 - (v / max) * (h - 6)).toFixed(1)).join(' ');
  return <svg className="tts-duong-nho" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true"><path d={d} fill="none" stroke={mau} strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg>;
}

function TheTd({ e, ky, chonNb, doiTd }) {
  const t = e.tong || {}, tr = e.truoc || {};
  const mau = mauTd(e.mau);
  const aov = t.don ? t.dt / t.don : 0, aovTr = tr.don ? tr.dt / tr.don : 0;
  const [sp, chan] = useHienDan(e.sp || [], 8);
  const spMax = Math.max(1, ...(e.sp || []).map((x) => x.sl));
  return (
    <div className="tts-td-the" style={{ '--m': mau }}>
      <div className="tts-td-the-dau">
        <div><div className="tts-td-ten"><i style={{ background: mau }} />{e.ten || '@' + e.handle}</div>
          <div className="odn-phu">{e.ten ? '@' + e.handle + ' · ' : ''}{e.ten_ch || (e.loai ? LOAI[e.loai] : 'chưa gán')}</div></div>
        <div className="tts-td-nut">
          <button className="tts-link" onClick={() => chonNb(e.handle)}>Lọc báo cáo</button>
          <button className="tts-link do" onClick={() => doiTd(e.handle, false)}>Bỏ theo dõi</button>
        </div>
      </div>
      <div className="tts-td-kpi">
        <div><span>Doanh thu</span><b>{tien(t.dt)}</b><Lech moi={t.dt} cu={tr.dt} /></div>
        <div><span>Đơn</span><b>{fmt(t.don || 0)}</b><Lech moi={t.don} cu={tr.don} /></div>
        <div><span>SL bán</span><b>{fmt(t.sl || 0)}</b><Lech moi={t.sl} cu={tr.sl} /></div>
        <div><span>Giá TB / đơn</span><b>{aov ? tien(aov) : '—'}</b><Lech moi={aov} cu={aovTr} /></div>
      </div>
      <div className="odn-phu tts-td-ky">So với {ky}: doanh thu {tien(tr.dt || 0)} · {fmt(tr.don || 0)} đơn · huỷ {pctTxt(t.huy || 0, (t.don || 0) + (t.huy || 0))} (kỳ trước {pctTxt(tr.huy || 0, (tr.don || 0) + (tr.huy || 0))})</div>
      <div className="tts-td-hai">
        <div><div className="tts-td-nho">Doanh thu theo ngày</div><DuongNho y={(e.ngay || []).map((d) => d.dt)} mau={mau} /></div>
        <div><div className="tts-td-nho">Giờ bán (SL)</div><Duong24 gio={e.gio || []} mau={mau} /></div>
      </div>
      <div className="tts-td-hai">
        <div><div className="tts-td-nho">Kênh (SL bán)</div><ThanhKenh r={{ live: t.live, video: t.video, the: t.the, sl: t.sl }} />
          <div className="odn-phu">LIVE {pctTxt(t.live || 0, t.sl || 0)} · Video {pctTxt(t.video || 0, t.sl || 0)}</div></div>
        <div><div className="tts-td-nho">TikTok thống kê</div>
          <div className="odn-phu">LIVE: <b>{fmt(e.live?.phien || 0)}</b> phiên · {tien(e.live?.dt || 0)} · {fmt(e.live?.xem || 0)} người xem</div>
          <div className="odn-phu">Video có đơn: <b>{fmt(e.video?.so || 0)}</b> · {tien(e.video?.dt || 0)} · {fmt(e.video?.xem || 0)} lượt xem</div></div>
      </div>
      <div className="tts-td-nho">Sản phẩm bán ({fmt((e.sp || []).length)} mã · {fmt(t.so_sp || 0)} mã có đơn hợp lệ)</div>
      <div className="tts-td-sp">
        {sp.length === 0 ? <div className="odn-phu">Chưa có đơn trong khoảng này.</div> : sp.map((x) => (
          <div key={x.ma} className="tts-td-sp-dong" title={x.ten || ''}>
            <AnhMa ma={x.ma} ten={x.ten} co={30} />
            <span className="tts-td-sp-ma"><b>{x.ma}</b><small>{x.dm || ''}</small></span>
            <span className="tts-td-sp-thanh"><i style={{ width: (x.sl / spMax) * 100 + '%', background: mau }} /></span>
            <b className="so">{fmt(x.sl)}</b><span className="so odn-phu">{tien(x.dt)}</span>
          </div>
        ))}
      </div>
      {chan}
    </div>
  );
}

function TheoDoi({ bc, pLoc, phienBan, apiXong, td, doiTd, chonNb }) {
  const { user } = useApp();
  const ds0 = td.map((x) => x.handle).join(',');
  const khoa = khoaNho('td', { ...pLoc, nb: undefined, ch: undefined, ds: ds0 });
  const [kq, setKq] = useState(() => boNho.get(khoa)?.data || null);
  const [loi, setLoi] = useState('');
  const [dang, setDang] = useState(false);
  const [chiSo, setChiSo] = useState('dt');
  const [sapMt, setSapMt] = useState('tong');
  useEffect(() => {
    const c = boNho.get(khoa);
    if (c) { setKq(c.data); setLoi(''); }
    if (!apiXong || (c && c.pb === phienBan)) return undefined;
    let huy = false;
    setDang(true);
    sb.rpc('fn_tt_theo_doi', { p_token: user.token, p_loc: pLoc }).then(({ data, error }) => {
      if (huy) return;
      setDang(false);
      if (error) { setLoi(error.message); return; }
      boNho.set(khoa, { data, pb: phienBan });
      setLoi(''); setKq(data);
    });
    return () => { huy = true; };
  }, [khoa, pLoc, phienBan, apiXong, user.token]);

  const dangTd = new Set(td.map((x) => x.handle));
  const dtTheo = new Map((bc.nb || []).map((r) => [r.nb, r.dt || 0]));
  const tatCa = (kq?.tat_ca || []).length ? kq.tat_ca : (bc.nb || []).filter((r) => r.nb).map((r) => ({ handle: r.nb, ten: bc.ten_nb?.[r.nb], loai: r.loai, ten_ch: r.ten_ch }));
  const chonThem = tatCa.filter((x) => !dangTd.has(x.handle))
    .sort((a, b) => (dtTheo.get(b.handle) || 0) - (dtTheo.get(a.handle) || 0) || a.handle.localeCompare(b.handle))
    .map((x) => ({ value: x.handle, label: x.ten ? `${x.ten} (@${x.handle})` : '@' + x.handle,
      sub: [x.ten_ch || (x.loai ? LOAI[x.loai] : 'chưa gán'), dtTheo.get(x.handle) ? tien(dtTheo.get(x.handle)) + ' trong khoảng lọc' : ''].filter(Boolean).join(' · ') }));
  const goiY = (bc.nb || []).filter((r) => r.nb && !dangTd.has(r.nb)).sort((a, b) => (b.dt || 0) - (a.dt || 0)).slice(0, 6);

  const ds = (kq?.ds || []).filter((e) => dangTd.has(e.handle));
  const tenE = (e) => e.ten || '@' + e.handle;
  const ky = kq ? `kỳ trước ${ngayVN(kq.tu_truoc).slice(0, 5)}–${ngayVN(kq.den_truoc)}` : 'kỳ trước';
  const motNgay = kq && kq.tu === kq.den;

  // bảng so sánh
  const hang = useMemo(() => ds.map((e) => {
    const t = e.tong || {}, tr = e.truoc || {};
    return { e, handle: e.handle, ten: tenE(e), dt: t.dt || 0, don: t.don || 0, sl: t.sl || 0, aov: t.don ? t.dt / t.don : 0,
      huy: (t.huy || 0) / Math.max(1, (t.don || 0) + (t.huy || 0)), so_sp: t.so_sp || 0,
      lv_dt: e.live?.dt || 0, lv_phien: e.live?.phien || 0, vd_dt: e.video?.dt || 0, vd_so: e.video?.so || 0, tr };
  }), [ds]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [hangSap, th] = useSap(hang, { k: 'dt', d: -1 });
  const dtMax = Math.max(1, ...hang.map((r) => r.dt));
  const tongNhom = hang.reduce((a, r) => ({ dt: a.dt + r.dt, don: a.don + r.don, sl: a.sl + r.sl }), { dt: 0, don: 0, sl: 0 });

  // biểu đồ
  const nhan = !kq ? [] : motNgay ? Array.from({ length: 24 }, (_, i) => i) : cacNgay(kq.tu, kq.den);
  const chuoi = ds.map((e) => {
    const m = new Map((e.ngay || []).map((d) => [d.k, d]));
    return { k: e.handle, ten: tenE(e), mau: mauTd(e.mau), net: netTd(e.mau),
      y: motNgay ? (e.gio || []).map(Number) : nhan.map((d) => Number(m.get(d)?.[chiSo] || 0)) };
  });
  const dinhDang = (v) => (motNgay || chiSo !== 'dt' ? fmt(Math.round(v)) : tien(v));

  // ma trận sản phẩm × ID
  const mt = useMemo(() => {
    const a = [...(kq?.ma_tran || [])];
    if (sapMt !== 'tong') a.sort((x, y) => (y.theo?.[sapMt] || 0) - (x.theo?.[sapMt] || 0) || y.tong - x.tong);
    return a;
  }, [kq, sapMt]);
  const [mtHien, mtChan] = useHienDan(mt, 25);
  const oMax = Math.max(1, ...mt.flatMap((m) => ds.map((e) => m.theo?.[e.handle] || 0)));
  const mauO = (v) => (v ? XANH_DAM[Math.min(XANH_DAM.length - 1, Math.floor(Math.sqrt(v / oMax) * (XANH_DAM.length - 1)))] : 'transparent');
  const chuTrang = (v) => v && Math.sqrt(v / oMax) * (XANH_DAM.length - 1) >= 6;

  return (
    <div className="tts-td">
      <div className="tts-td-chon">
        <div className="tts-td-chon-ds">
          <b>Đang theo dõi {fmt(td.length)} ID</b>
          {ds.length === 0 && td.length > 0 && !kq && <span className="odn-phu">Đang tải…</span>}
          {td.map((x) => {
            const e = (kq?.ds || []).find((y) => y.handle === x.handle);
            return (
              <span key={x.handle} className="tts-td-chip">
                <i style={{ background: mauTd(x.mau) }} />{e?.ten || bc.ten_nb?.[x.handle] || '@' + x.handle}
                <button aria-label={'Bỏ theo dõi ' + x.handle} title="Bỏ theo dõi" onClick={() => doiTd(x.handle, false)}>✕</button>
              </span>);
          })}
        </div>
        <div className="tts-td-them">
          <Sel value="" placeholder="+ Thêm ID để theo dõi" timKiem options={chonThem} onChange={(v) => v && doiTd(v, true)} />
        </div>
        <span className="odn-phu">Khoảng ngày + bộ lọc kênh / loại hàng / trạng thái lấy theo thanh lọc phía trên · so với {ky} (cùng số ngày, liền trước){dang ? ' · đang cập nhật…' : ''}</span>
      </div>
      {loi && <div className="odn-bao do"><IcAlert /> Không tải được: {loi}</div>}

      {td.length === 0 ? (
        <div className="tts-td-trong">
          <b>Chọn các ID cần theo dõi riêng</b>
          <p>Mỗi ID được so sánh song song: doanh thu, đơn, SL, giá trung bình, tỷ lệ huỷ, kênh bán, giờ bán, sản phẩm bán — so với kỳ trước. Bấm ☆ ở thẻ Người bán hoặc chọn nhanh:</p>
          <div className="tts-td-goi-y">{goiY.map((r) => (
            <button key={r.nb} className="tts-goi-y" onClick={() => doiTd(r.nb, true)}>+ {bc.ten_nb?.[r.nb] || '@' + r.nb} · {tien(r.dt)}</button>
          ))}</div>
        </div>
      ) : ds.length > 0 && (<>
        <div className="odn-bang-khung">
          <div className="tts-td-tieu"><b>So sánh</b><span>bấm tiêu đề cột để xếp · ▲▼ so với {ky}</span></div>
          <table className="odn-bang tts-bang tts-td-bang">
            <thead><tr>{th('ten', 'ID theo dõi')}{th('dt', 'Doanh thu', 'so')}{th('don', 'Đơn', 'so')}{th('sl', 'SL bán', 'so')}{th('aov', 'Giá TB / đơn', 'so')}
              {th('huy', 'Huỷ', 'so')}{th('so_sp', 'Số mã', 'so')}<th>Kênh</th>{th('lv_dt', 'LIVE · TikTok', 'so')}{th('vd_dt', 'Video · TikTok', 'so')}</tr></thead>
            <tbody>
              {hangSap.map((r) => (
                <tr key={r.handle} onClick={() => chonNb(r.handle)} title="Bấm để lọc toàn bộ báo cáo theo ID này">
                  <td><div className="tts-td-ten nho"><i style={{ background: mauTd(r.e.mau) }} />{r.ten}</div>
                    <div className="odn-phu">{r.e.ten ? '@' + r.handle + ' · ' : ''}{r.e.ten_ch || (r.e.loai ? LOAI[r.e.loai] : 'chưa gán')}</div></td>
                  <td className="so tts-td-dt"><div><b>{tien(r.dt)}</b><Lech moi={r.dt} cu={r.tr.dt} /></div>
                    <span className="tts-td-vach"><i style={{ width: (r.dt / dtMax) * 100 + '%', background: mauTd(r.e.mau) }} /></span></td>
                  <td className="so"><b>{fmt(r.don)}</b><div><Lech moi={r.don} cu={r.tr.don} /></div></td>
                  <td className="so"><b>{fmt(r.sl)}</b><div><Lech moi={r.sl} cu={r.tr.sl} /></div></td>
                  <td className="so">{r.aov ? tien(r.aov) : '—'}<div><Lech moi={r.aov} cu={r.tr.don ? r.tr.dt / r.tr.don : 0} /></div></td>
                  <td className="so">{(r.huy * 100).toLocaleString('vi', { maximumFractionDigits: 1 })}%</td>
                  <td className="so">{fmt(r.so_sp)}</td>
                  <td><ThanhKenh r={{ live: r.e.tong?.live, video: r.e.tong?.video, the: r.e.tong?.the, sl: r.sl }} /></td>
                  <td className="so">{r.lv_dt ? <><b>{tien(r.lv_dt)}</b><div className="odn-phu">{fmt(r.lv_phien)} phiên</div></> : '—'}</td>
                  <td className="so">{r.vd_dt ? <><b>{tien(r.vd_dt)}</b><div className="odn-phu">{fmt(r.vd_so)} video</div></> : '—'}</td>
                </tr>
              ))}
              <tr className="tts-dong-tong">
                <td><div className="odn-ten">Cả nhóm theo dõi</div><div className="odn-phu">chiếm {pctTxt(tongNhom.dt, bc.tong?.dt || 0)} doanh thu shop</div></td>
                <td className="so"><b>{tien(tongNhom.dt)}</b></td><td className="so"><b>{fmt(tongNhom.don)}</b></td><td className="so"><b>{fmt(tongNhom.sl)}</b></td>
                <td className="so">{tongNhom.don ? tien(tongNhom.dt / tongNhom.don) : '—'}</td><td colSpan={5} />
              </tr>
            </tbody>
          </table>
        </div>

        <div className="tts-khung">
          <div className="tts-khung-dau"><b>{motNgay ? 'SL bán theo giờ' : 'Diễn biến theo ngày'}</b>
            {!motNgay && <div className="tts-nhanh nho">{[['dt', 'Doanh thu'], ['don', 'Đơn'], ['sl', 'SL bán']].map(([k, ten]) => (
              <button key={k} className={chiSo === k ? 'on' : ''} onClick={() => setChiSo(k)}>{ten}</button>))}</div>}</div>
          <BieuDoDuong nhan={nhan} chuoi={chuoi} dinhDang={dinhDang}
            nhanX={(k, day) => (motNgay ? `${k}h${day ? '–' + (k + 1) + 'h' : ''}` : day ? ngayVN(k) : ngayVN(k).slice(0, 5))} />
          <div className="tts-td-chu-giai">{chuoi.map((c) => (
            <span key={c.k}><i style={{ borderTopColor: c.mau, borderTopStyle: c.net ? 'dashed' : 'solid' }} />{c.ten}</span>))}</div>
        </div>

        <div className="odn-bang-khung">
          <div className="tts-td-tieu"><b>Sản phẩm × ID</b><span>mỗi ô = SL bán của mã đó ở ID đó · màu càng đậm bán càng nhiều · bấm tên ID để xếp theo ID</span></div>
          <table className="odn-bang tts-mt">
            <thead><tr><th>Mã hàng</th>
              {ds.map((e) => (<th key={e.handle} className={'so sap' + (sapMt === e.handle ? ' on' : '')} onClick={() => setSapMt(e.handle)}>
                <span className="tts-td-ten nho"><i style={{ background: mauTd(e.mau) }} />{tenE(e).length > 14 ? tenE(e).slice(0, 13) + '…' : tenE(e)}</span></th>))}
              <th className={'so sap' + (sapMt === 'tong' ? ' on' : '')} onClick={() => setSapMt('tong')}>Tổng</th></tr></thead>
            <tbody>
              {mtHien.map((m) => (
                <tr key={m.ma}>
                  <td title={m.ten || ''}><div className="tts-ma-o"><AnhMa ma={m.ma} ten={m.ten} co={34} /><div><b>{m.ma}</b><div className="odn-phu">{m.dm || ''}</div></div></div></td>
                  {ds.map((e) => { const v = m.theo?.[e.handle] || 0; return (
                    <td key={e.handle} className="so tts-mt-o" title={`${m.ma} · ${tenE(e)}: ${fmt(v)} sp${m.tong ? ' (' + pctTxt(v, m.tong) + ' của mã này)' : ''}`}>
                      <span style={{ background: mauO(v), color: chuTrang(v) ? '#fff' : '#14213A' }}>{v ? fmt(v) : '·'}</span></td>); })}
                  <td className="so"><b>{fmt(m.tong)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
          {mtChan}
        </div>

        <div className="tts-td-tieu ngoai"><b>Chi tiết từng ID</b><span>so với {ky}</span></div>
        <div className="tts-td-luoi">{ds.map((e) => <TheTd key={e.handle} e={e} ky={ky} chonNb={chonNb} doiTd={doiTd} />)}</div>
      </>)}
    </div>
  );
}

// NEW - 3.141: phiên LIVE + video nổi bật (TikTok thống kê, có ID người bán)
function VideoLive({ bc, chon }) {
  const [xem, setXem] = useState('live');
  const live = bc.live_top || [], video = bc.video_top || [];
  const [liveHien, liveChan] = useHienDan(live);
  const [videoHien, videoChan] = useHienDan(video);
  return (
    <div className="tts-gan">
      <div className="tts-gan-dau">
        <div className="tts-nhanh">
          <button className={xem === 'live' ? 'on' : ''} onClick={() => setXem('live')}>Phiên LIVE ({fmt(live.length)})</button>
          <button className={xem === 'video' ? 'on' : ''} onClick={() => setXem('video')}>Video có đơn ({fmt(video.length)})</button>
        </div>
        <span className="odn-phu">Đủ mọi phiên LIVE / video có đơn trong khoảng ngày đang lọc, xếp theo doanh số · TikTok chốt số liệu chậm 1–2 ngày · bấm dòng để lọc theo người bán.</span>
      </div>
      <div className="odn-bang-khung">
        {xem === 'live' ? (
          <table className="odn-bang tts-bang">
            <thead><tr><th>Người bán</th><th>Phiên LIVE</th><th className="so">Đơn</th><th className="so">SL</th><th className="so">Doanh số</th><th className="so">Khách</th><th className="so">Người xem</th></tr></thead>
            <tbody>{live.length === 0 ? <tr><td colSpan={7} className="odn-trong">Chưa có phiên LIVE trong khoảng này.</td></tr>
              : liveHien.map((r) => (
                <tr key={r.id} onClick={() => chon(r.username || '')}>
                  <td><div className="odn-ten">{tenGoi(bc.ten_nb, r.username)}</div><div className="odn-phu">{bc.ten_nb?.[r.username] ? '@' + r.username + ' · ' : ''}{r.ten_ch || 'chưa gán cửa hàng'}</div></td>
                  <td><div className="tts-ten-sp" title={r.tieu_de}>{r.tieu_de || '—'}</div>
                    <div className="odn-phu">{gioNgay(r.bat_dau)} → {r.ket_thuc ? new Date(r.ket_thuc).toLocaleTimeString('vi', { hour: '2-digit', minute: '2-digit' }) : '…'} · {fmt(r.so_sp)} mã</div></td>
                  <td className="so">{fmt(r.don)}</td><td className="so">{fmt(r.sl)}</td><td className="so"><b>{tien(r.dt)}</b></td>
                  <td className="so">{fmt(r.khach)}</td><td className="so">{fmt(r.xem)}</td>
                </tr>))}</tbody>
          </table>
        ) : (
          <table className="odn-bang tts-bang">
            <thead><tr><th>Người bán</th><th>Video</th><th>Sản phẩm</th><th className="so">Đơn</th><th className="so">SL</th><th className="so">Doanh số</th><th className="so">Lượt xem</th></tr></thead>
            <tbody>{video.length === 0 ? <tr><td colSpan={7} className="odn-trong">Chưa có video có đơn trong khoảng này.</td></tr>
              : videoHien.map((r) => (
                <tr key={r.video_id} onClick={() => chon(r.username || '')}>
                  <td><div className="odn-ten">{tenGoi(bc.ten_nb, r.username)}</div><div className="odn-phu">{bc.ten_nb?.[r.username] ? '@' + r.username + ' · ' : ''}{r.ten_ch || 'chưa gán cửa hàng'}</div></td>
                  <td><div className="tts-ten-sp" title={r.tieu_de}>{r.tieu_de || '—'}</div><div className="odn-phu">đăng {gioNgay(r.dang_luc)}</div></td>
                  <td><div className="tts-ten-sp" title={(r.san_pham || []).map((x) => x.name).join(' · ')}>{(r.san_pham || [])[0]?.name || '—'}</div>
                    {(r.san_pham || []).length > 1 && <div className="odn-phu">+{r.san_pham.length - 1} sản phẩm</div>}</td>
                  <td className="so">{fmt(r.don)}</td><td className="so">{fmt(r.sl)}</td><td className="so"><b>{tien(r.dt)}</b></td><td className="so">{fmt(r.xem)}</td>
                </tr>))}</tbody>
          </table>
        )}
        {xem === 'live' ? liveChan : videoChan}
      </div>
    </div>
  );
}

// NEW - 3.143: đối soát từng ngày app ↔ TikTok
const lechNgay = (r) => (r.app_don ?? 0) < (r.tiktok_don ?? 0) || (r.app_lk ?? 0) < (r.tiktok_lk ?? 0) || (r.app_tra ?? 0) < (r.tiktok_tra ?? 0);
const soLech = (api) => (api?.doi_soat || []).filter(lechNgay).length;
// NEW - 3.145: ngày đã tự kéo bù từ 3 lần trở lên mà vẫn lệch → cần xem
const soKet = (api) => (api?.doi_soat || []).filter((r) => lechNgay(r) && (r.sua_lan || 0) >= 3).length;
// NEW - 3.152: CHẠY THỦ CÔNG — tự động vẫn chạy như cũ; khi thấy lỗi / cần lấy ngay thì bấm ở đây
const ngayNgan = (s) => (s ? String(s).slice(8, 10) + '/' + String(s).slice(5, 7) : '');
const VIEC_TC = [
  { k: 'keo', ten: 'Lấy đơn mới', nut: 'Lấy ngay',
    mo: 'Đơn mới + đơn đổi trạng thái, ID người bán (liên kết), trả hàng. Tự chạy 5 phút/lần.',
    luc: (a) => a?.keo_luc, tt: (a) => (a?.keo_kq?.so_don != null ? `${fmt(a.keo_kq.so_don)} đơn cập nhật` : '') },
  { k: 'doi_soat', ten: 'Đối soát + kéo bù', nut: 'Đối soát ngay',
    mo: 'Đếm lại từng ngày với TikTok từ 01/10, ngày nào app thiếu thì kéo lại cả ngày (mới nhất trước). Tự chạy 3 giờ/lần, đang lệch thì 15 phút/lần.',
    luc: (a) => a?.ds_kq?.luc || a?.ds_luc, loi: (a) => a?.ds_kq?.loi,
    tt: (a) => (a?.ds_kq?.con_lech != null ? (a.ds_kq.con_lech ? `còn lệch ${fmt(a.ds_kq.con_lech)} ngày` : 'khớp hết') : '') },
  { k: 'thong_ke', ten: 'LIVE + video', nut: 'Lấy ngay',
    mo: 'Phiên LIVE và video có đơn theo từng ID (TikTok chốt số chậm 1–2 ngày). Tự chạy 60 phút/lần.',
    luc: (a) => a?.tk_luc, loi: (a) => a?.tk_kq?.loi_live || a?.tk_kq?.loi_video || a?.tk_kq?.loi,
    tt: (a) => [a?.live_moc ? `LIVE tới ${ngayNgan(a.live_moc)}` : '', a?.video_moc ? `video tới ${ngayNgan(a.video_moc)}` : ''].filter(Boolean).join(' · ') },
  { k: 'ai_report', ten: 'ID người bán từng đơn', nut: 'Lấy ngay',
    mo: 'Báo cáo phân tích TikTok — ID người bán cho mọi đơn (kênh công ty, marketing, nhà sáng tạo). Tự chạy 20 phút/lần.',
    luc: (a) => a?.ar_kq?.luc || a?.ar_luc, loi: (a) => a?.ar_kq?.loi,
    tt: (a) => (a?.ar_moc ? `đã chốt tới ${ngayNgan(a.ar_moc)}` : '') },
];

function DoiSoat({ api, xong }) {
  const { user, baoToast } = useApp();
  const ds = api?.doi_soat || [];
  const kq = api?.ds_kq || {};
  const [chon, setChon] = useState(() => new Set());
  const [gui, setGui] = useState('');
  const dang = !!api?.dang_keo || !!gui;
  const o = (tk, app) => {
    if (tk == null) return <td className="so odn-phu">—</td>;
    const thieu = (tk || 0) - (app || 0);
    return <td className="so">{fmt(app || 0)} / {fmt(tk)}{thieu > 0 ? <span className="tts-huy"> thiếu {fmt(thieu)}</span> : thieu < 0 ? <span className="odn-phu"> +{fmt(-thieu)}</span> : <span className="tts-khop"> ✓</span>}</td>;
  };
  const doiChon = (ngay) => setChon((c) => { const n = new Set(c); if (n.has(ngay)) n.delete(ngay); else if (n.size < 31) n.add(ngay); return n; });
  const chay = async (viec, ngay = null) => {
    setGui(viec);
    const { data, error } = await sb.rpc('fn_tt_api_chay', { p_token: user.token, p_viec: viec, p_ngay: ngay });
    setGui('');
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    if (data?.kq === 'dang_chay') { baoToast(`Đang có 1 lượt chạy — khoảng ${fmt(data.con_giay)} giây nữa bấm lại`); return; }
    if (!data?.ok) { baoToast('Chưa kết nối API TikTok'); return; }
    baoToast(ngay ? `Đã gửi lệnh kéo lại ${fmt(ngay.length)} ngày — khoảng 1–2 phút có kết quả` : 'Đã gửi lệnh — khoảng 1–2 phút có kết quả');
    if (ngay) setChon(new Set());
    setTimeout(xong, 1500);
  };
  const thieu = ds.filter(lechNgay).map((r) => r.ngay);
  const chuaKip = kq.chua_kip || [];
  return (<>
    <div className="tts-tc">
      <div className="tts-tc-dau">
        <b>Chạy thủ công</b>
        <span>Tự động vẫn chạy như cũ — chỉ bấm khi thấy lỗi hoặc cần lấy ngay. Mỗi lượt khoảng 1–2 phút; đang có lượt chạy thì phải đợi xong (không chạy chồng).</span>
        {api?.dang_keo && <i className="tts-tc-chay">Đang chạy 1 lượt…</i>}
      </div>
      {api?.loi && <div className="odn-bao do"><IcAlert /> Lỗi gần nhất: {api.loi}</div>}
      <div className="tts-tc-luoi">
        {VIEC_TC.map((v) => {
          const loi = v.loi?.(api);
          const luc = v.luc(api);
          return (
            <div key={v.k} className={'tts-tc-o' + (loi ? ' loi' : '')}>
              <b>{v.ten}</b>
              <span className="tts-tc-mo">{v.mo}</span>
              <span className={'tts-tc-tt' + (loi ? ' do' : '')}>{luc ? 'Lần cuối ' + gioNgay(luc) : 'Chưa chạy'}{v.tt(api) ? ' · ' + v.tt(api) : ''}{loi ? ' · lỗi: ' + String(loi).slice(0, 120) : ''}</span>
              <button className="odn-nut-phu" disabled={dang} onClick={() => chay(v.k)}><IcRefresh /> {gui === v.k ? 'Đang gửi…' : v.nut}</button>
            </div>);
        })}
      </div>
    </div>

    <div className="odn-bang-khung">
      <div className="tts-ghi-nguon">
        <span><b>Đối soát với TikTok</b>: mỗi 3 giờ hệ thống tự đếm số đơn, số dòng hàng có ID người bán và số yêu cầu trả hàng của từng ngày trên TikTok rồi so với app. Ngày nào app thiếu → tự kéo lại cả ngày đó, 15 phút sau đối soát lại.</span>
        <span>Lần gần nhất: {api?.ds_luc ? gioNgay(kq.luc || api.ds_luc) : 'chưa chạy'}{kq.lech_truoc != null ? ` · lệch trước khi sửa ${fmt(kq.lech_truoc)} ngày · còn lệch ${fmt(kq.con_lech || 0)} ngày` : ''}{kq.loi ? ` · lỗi: ${kq.loi}` : ''}{kq.thu_cong ? ` · lượt kéo lại thủ công ${fmt(kq.thu_cong.length)} ngày` : ''}. Hiển thị dạng app / TikTok; 15 phút gần nhất chưa tính.</span>
      </div>
      <div className="tts-tc-chon">
        <span>Bấm vào từng ngày để chọn rồi <b>Kéo lại</b> — kéo lại cả ngày từ TikTok kể cả ngày đang khớp. Mỗi lượt kéo được khoảng 1–2 ngày đông đơn; ngày chưa kịp sẽ báo để bấm tiếp.</span>
        <div className="tts-tc-chon-nut">
          {thieu.length > 0 && <button className="tts-link" onClick={() => setChon(new Set(thieu.slice(0, 31)))}>Chọn {fmt(Math.min(31, thieu.length))} ngày đang thiếu</button>}
          {chuaKip.length > 0 && !dang && <button className="tts-link" onClick={() => setChon(new Set(chuaKip))}>Chọn {fmt(chuaKip.length)} ngày lượt trước chưa kịp</button>}
          {chon.size > 0 && <button className="tts-link" onClick={() => setChon(new Set())}>Bỏ chọn</button>}
          <button className="odn-nut-phu tts-tc-keo" disabled={!chon.size || dang} onClick={() => chay('doi_soat', [...chon].sort().reverse())}>
            <IcRefresh /> {gui === 'doi_soat' && chon.size ? 'Đang gửi…' : chon.size ? `Kéo lại ${fmt(chon.size)} ngày đã chọn` : 'Chọn ngày để kéo lại'}</button>
        </div>
      </div>
      <table className="odn-bang tts-bang tts-bang-ds">
        <thead><tr><th className="tts-o-chon" aria-label="Chọn" /><th>Ngày</th><th className="so">Đơn hàng</th><th className="so" title="TikTok đếm theo dòng hàng (mỗi mã hàng trong đơn là 1 dòng)">Dòng hàng có ID người bán</th><th className="so">Yêu cầu trả hàng</th><th className="so">Đã kéo bù</th></tr></thead>
        <tbody>{ds.length === 0 ? <tr><td colSpan={6} className="odn-trong">Chưa có kết quả đối soát — lượt đầu chạy trong vòng 5 phút.</td></tr>
          : ds.map((r) => (
            <tr key={r.ngay} className={(lechNgay(r) ? 'tts-dong-lech' : '') + (chon.has(r.ngay) ? ' tts-dong-chon' : '')} onClick={() => doiChon(r.ngay)}>
              <td className="tts-o-chon"><input type="checkbox" checked={chon.has(r.ngay)} onChange={() => doiChon(r.ngay)} onClick={(e) => e.stopPropagation()} aria-label={'Chọn ngày ' + ngayVN(r.ngay)} /></td>
              <td><b>{ngayVN(r.ngay)}</b></td>{o(r.tiktok_don, r.app_don)}{o(r.tiktok_lk, r.app_lk)}{o(r.tiktok_tra, r.app_tra)}
              <td className="so">{r.sua_lan ? `${fmt(r.sua_lan)} lần` : '—'}</td>
            </tr>))}</tbody>
      </table>
    </div>
  </>);
}

function BangCuaHang({ ds, chon }) {
  const [rows, th] = useSap(ds, { k: 'dt', d: -1 });
  return (
    <div className="odn-bang-khung">
      <table className="odn-bang tts-bang">
        <thead><tr>{th('ten', 'Cửa hàng')}{th('kv', 'Khu vực')}{th('so_nb', 'ID người bán', 'so')}{th('don', 'Đơn', 'so')}
          {th('sl', 'SL bán', 'so')}{th('dt', 'Doanh thu', 'so')}{th('huy', 'Đơn huỷ', 'so')}</tr></thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan={7} className="odn-trong">Chưa có cửa hàng nào — gán ID người bán với cửa hàng ở thẻ Gán cửa hàng.</td></tr>
            : rows.map((r) => (
              <tr key={r.ma_ch} onClick={() => chon(r.ma_ch)} title="Bấm để lọc theo cửa hàng này">
                <td><div className="odn-ten">{r.ten || r.ma_ch}</div><div className="odn-phu">{r.ma_ch}</div></td>
                <td>{r.kv || '—'}</td>
                <td className="so">{fmt(r.so_nb)}</td>
                <td className="so"><b>{fmt(r.don)}</b></td>
                <td className="so">{fmt(r.sl)}</td>
                <td className="so"><b>{tien(r.dt)}</b></td>
                <td className="so">{r.huy > 0 ? <span className="tts-huy">{fmt(r.huy)}</span> : '—'}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

/* ================= Đơn hàng ================= */
function DsDon({ pLoc, tenNb, phienBan, apiXong }) {
  const { user, baoToast } = useApp();
  const [dangThem, setDangThem] = useState(false);
  const [kq, setKq] = useState(null);
  const [loi, setLoi] = useState('');
  const [mo, setMo] = useState(null);
  // NEW - 3.148: nhớ trong phiên — chỉ tải lại khi có dữ liệu mới (giữ nguyên số trang anh đã xem thêm)
  const khoa = khoaNho('don', pLoc);
  useEffect(() => {
    const c = boNho.get(khoa);
    if (c) { setKq(c.data); setLoi(''); } else setKq(null);
    if (!apiXong || (c && c.pb === phienBan)) return;
    let huy = false;
    sb.rpc('fn_tt_don_ds', { p_token: user.token, p_loc: pLoc, p_gioi_han: Math.max(300, c?.data?.ds?.length || 0) }).then(({ data, error }) => {
      if (huy) return;
      if (error) { if (!c) setLoi(error.message); return; }
      boNho.set(khoa, { data, pb: phienBan });
      setLoi(''); setKq(data);
    });
    return () => { huy = true; };
  }, [khoa, pLoc, phienBan, apiXong, user.token]);
  if (loi) return <div className="odn-bao do"><IcAlert /> Không tải được: {loi}</div>;
  const ds = kq?.ds || [];
  const taiThem = async () => {
    setDangThem(true);
    const { data, error } = await sb.rpc('fn_tt_don_ds', { p_token: user.token, p_loc: { ...pLoc, bo_qua: ds.length }, p_gioi_han: 300 });
    setDangThem(false);
    if (error) { baoToast('Chưa tải thêm được: ' + error.message); return; }
    setKq((k) => {
      const moi = { ...k, ds: [...(k?.ds || []), ...(data?.ds || [])] };
      const c = boNho.get(khoa);
      if (c) boNho.set(khoa, { ...c, data: moi });
      return moi;
    });
  };
  return (
    <div className="odn-bang-khung">
      <table className="odn-bang tts-bang">
        <thead><tr><th>Đơn</th><th>Trạng thái</th><th>Sản phẩm</th><th className="so">Tiền</th><th>Kênh · người bán</th><th>Vận chuyển</th><th>Tỉnh</th></tr></thead>
        <tbody>
          {kq == null ? <tr><td colSpan={7} className="odn-trong">Đang tải đơn…</td></tr>
            : ds.length === 0 ? <tr><td colSpan={7} className="odn-trong">Không có đơn trong khoảng lọc.</td></tr>
            : ds.map((d) => {
              const dong = d.dong || [];
              const sl = dong.reduce((s, x) => s + (x.sl || 0), 0);
              return [
                <tr key={d.ma_don} className={mo === d.ma_don ? 'on' : ''} onClick={() => setMo(mo === d.ma_don ? null : d.ma_don)}>
                  <td><div className="odn-ten">{d.ma_don}</div><div className="odn-phu">{gioNgay(d.tao_luc)}{d.nguon === 'api' ? ' · API' : ''}</div></td>
                  <td><Chip tt={d.tt} />{d.tt === 'huy' && d.ly_do_huy && <div className="odn-phu tts-cat" title={d.ly_do_huy}>{d.ly_do_huy}</div>}</td>
                  <td><div className="tts-ma-o"><AnhMa ma={dong[0]?.sku} ten={dong[0]?.ten} co={36} />
                    <div><div className="tts-ten-sp" title={dong[0]?.ten}>{dong[0]?.sku || '—'}{dong.length > 1 ? ` +${dong.length - 1} mã` : ''}</div>
                    <div className="odn-phu">{fmt(sl)} sản phẩm</div></div></div></td>
                  <td className="so"><b>{fmt(d.tong_tien)}</b></td>
                  <td>{d.kenh && <KenhChip k={d.kenh} />}<div className="odn-phu">{d.creator ? tenGoi(tenNb, d.creator) : 'không qua người bán'}{d.ten_ch ? ' · ' + d.ten_ch : ''}</div></td>
                  <td><div className="odn-ten nho">{d.dvvc || '—'}</div><div className="odn-phu">{d.van_don || ''}{d.giao_luc ? ' · giao ' + gioNgay(d.giao_luc) : d.gui_luc ? ' · gửi ' + gioNgay(d.gui_luc) : ''}</div></td>
                  <td>{d.tinh || '—'}</td>
                </tr>,
                mo === d.ma_don && (
                  <tr key={d.ma_don + '_ct'} className="tts-mo"><td colSpan={7}>
                    <table className="tts-ct"><thead><tr><th>Mã hàng</th><th>Sản phẩm · phân loại</th><th className="so">SL</th><th className="so">Giá niêm yết</th><th className="so">Shop giảm</th><th className="so">Khách trả</th><th>Người bán</th></tr></thead>
                      <tbody>{dong.map((x, i) => (
                        <tr key={i}><td><div className="tts-ma-o"><AnhMa ma={x.sku} ten={x.ten} co={36} /><b>{x.sku || '—'}</b></div></td><td>{x.ten}<div className="odn-phu">{x.pl}</div></td>
                          <td className="so">{fmt(x.sl)}{x.tra > 0 && <div className="odn-phu">trả {x.tra}</div>}</td>
                          <td className="so">{fmt(x.truoc)}</td><td className="so">{fmt(x.shop_giam)}</td><td className="so"><b>{fmt(x.tien)}</b></td>
                          <td>{x.nb ? tenGoi(tenNb, x.nb) : '—'}{x.kenh && <div className="odn-phu">{(KENH[x.kenh] || KENH.khac)[0]}</div>}</td></tr>
                      ))}</tbody></table>
                    <div className="odn-phu tts-ct-phu">{d.thanh_toan || ''}{d.kieu_giao ? ' · ' + d.kieu_giao : ''}{d.huy_boi ? ' · huỷ bởi ' + ({ User: 'khách', System: 'hệ thống', Operator: 'shop', Seller: 'shop' }[d.huy_boi] || d.huy_boi) : ''}</div>
                  </td></tr>
                ),
              ];
            })}
        </tbody>
      </table>
      {/* NEW - 3.147: không chặn trần — tải tiếp từng 300 đơn tới hết */}
      {kq && kq.tong > ds.length && (
        <div className="odn-chan-bang tts-hien-them">
          <span>Đang hiện {fmt(ds.length)}/{fmt(kq.tong)} đơn, mới nhất trước</span>
          <button className="tts-link" disabled={dangThem} onClick={taiThem}>{dangThem ? 'Đang tải…' : `Xem thêm ${fmt(Math.min(300, kq.tong - ds.length))} đơn`}</button>
        </div>)}
    </div>
  );
}

/* ================= Gán ID người bán ↔ cửa hàng ================= */
function GanNguoiBan({ xong, phienBan, apiXong }) {
  const { user, baoToast } = useApp();
  const [kq, setKq] = useState(() => boNho.get('nb')?.data || null);   // NEW - 3.148: nhớ trong phiên
  const [loc, setLoc] = useState('chua');
  const [tim, setTim] = useState('');
  const [luu, setLuu] = useState('');
  // NEW - 3.147.1: dòng vừa sửa vẫn ở lại bộ lọc hiện tại (để chọn tiếp loại / cửa hàng / tên gọi) tới khi đổi bộ lọc
  const [vuaSua, setVuaSua] = useState(() => new Set());
  const danhDau = (h) => setVuaSua((x) => new Set(x).add(h));
  // chọn cửa hàng: loại Kênh công ty / Nhà sáng tạo ngoài / Khác thì giữ nguyên; Cửa hàng / Đội sale (hoặc chưa có) thì tự theo mã cửa hàng
  const giuLoai = (r, ma) => (['KENH', 'KOL', 'KHAC'].includes(r.loai) ? r.loai : ma ? null : r.loai);
  const tai = useCallback(async (pb) => {
    const { data, error } = await sb.rpc('fn_tt_nb_ds', { p_token: user.token });
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    boNho.set('nb', { data, pb });
    setKq(data);
  }, [user.token, baoToast]);
  useEffect(() => {
    const c = boNho.get('nb');
    if (!apiXong || (c && c.pb === phienBan)) return;
    tai(phienBan);
  }, [apiXong, phienBan, tai]);
  const chOpt = useMemo(() => [{ value: '', label: '— Không gắn cửa hàng —' },
    ...(kq?.ch || []).map((c) => ({ value: c.ma, label: c.ten, sub: c.ma + (c.kv ? ' · ' + c.kv : '') }))], [kq]);
  // NEW - 3.146: lưu xong cập nhật ngay dòng đó (không tải lại cả danh sách); báo cáo chung làm mới sau 2 giây
  const henLamMoi = useRef(null);
  const lamMoiBaoCao = () => { clearTimeout(henLamMoi.current); henLamMoi.current = setTimeout(() => xong(), 2000); };
  useEffect(() => () => clearTimeout(henLamMoi.current), []);
  const suaDong = (h, moi) => setKq((k) => {
    if (!k) return k;
    const kq2 = { ...k, nb: k.nb.map((x) => (x.handle === h ? { ...x, ...moi } : x)) };
    const c = boNho.get('nb');
    if (c) boNho.set('nb', { ...c, data: kq2 });
    return kq2;
  });
  const gan = async (r, ma, loai) => {
    setLuu(r.handle);
    const { data, error } = await sb.rpc('fn_tt_nb_gan', { p_token: user.token, p_handle: r.handle, p_ma_ch: ma || null, p_loai: loai || null, p_ghi_chu: null });
    setLuu('');
    if (error) { baoToast('Chưa lưu được @' + r.handle + ': ' + error.message); return; }
    suaDong(r.handle, { ma_ch: data?.ma_ch ?? null, ten_ch: data?.ten_ch ?? null, loai: data?.loai ?? null, tu_dong: false, nguoi: data?.nguoi ?? user.ma_dang_nhap, goi_y: null });
    danhDau(r.handle);
    baoToast('Đã lưu ' + (r.ten || '@' + r.handle));
    lamMoiBaoCao();
  };
  // NEW - 3.146: đặt tên gọi (vd kênh công ty) — lưu khi rời ô hoặc bấm Enter
  const [nhap, setNhap] = useState({});
  const datTen = async (r) => {
    const ten = (nhap[r.handle] ?? r.ten ?? '').trim();
    if (ten === (r.ten || '')) return;
    setLuu(r.handle);
    const { data, error } = await sb.rpc('fn_tt_nb_ten', { p_token: user.token, p_handle: r.handle, p_ten: ten });
    setLuu('');
    if (error) { baoToast('Chưa lưu được tên gọi: ' + error.message); return; }
    suaDong(r.handle, { ten: data?.ten ?? null });
    danhDau(r.handle);
    setNhap((n) => { const m = { ...n }; delete m[r.handle]; return m; });
    baoToast(ten ? `Đã đặt tên @${r.handle} là "${ten}"` : 'Đã xoá tên gọi @' + r.handle);
    lamMoiBaoCao();
  };
  const ds = (kq?.nb || []).filter((r) => vuaSua.has(r.handle) || (loc === 'chua' ? !r.ma_ch && !r.loai : loc === 'da' ? r.ma_ch || r.loai : true))
    .filter((r) => !tim.trim() || r.handle.includes(tim.trim().toLowerCase()) || (r.ten_ch || '').toLowerCase().includes(tim.trim().toLowerCase())
      || (r.ten || '').toLowerCase().includes(tim.trim().toLowerCase()));
  const dem = (kq?.nb || []).reduce((s, r) => ({ chua: s.chua + (!r.ma_ch && !r.loai ? 1 : 0), da: s.da + (r.ma_ch || r.loai ? 1 : 0) }), { chua: 0, da: 0 });
  return (
    <div className="tts-gan">
      <div className="tts-gan-dau">
        <div className="tts-nhanh">
          {[['chua', `Chưa gán (${dem.chua})`], ['da', `Đã gán (${dem.da})`], ['tat', 'Tất cả']].map(([k, ten]) => (
            <button key={k} className={loc === k ? 'on' : ''} onClick={() => { setLoc(k); setVuaSua(new Set()); }}>{ten}</button>
          ))}
        </div>
        <label className="odn-tim tts-gan-tim"><IcSearch /><input value={tim} onChange={(e) => setTim(e.target.value)} placeholder="Tìm ID, tên gọi, cửa hàng…" /></label>
        <span className="odn-phu">ID mới tự khớp cửa hàng khi tên trùng khớp duy nhất. Gán tay ở đây sẽ áp cho mọi đơn cũ lẫn mới. Tên gọi hiện thay ID trên mọi thẻ báo cáo.</span>
      </div>
      <div className="odn-bang-khung">
        <table className="odn-bang tts-bang tts-gan-bang">
          <thead><tr><th>ID người bán</th><th>Tên gọi</th><th className="so">30 ngày</th><th>Loại</th><th>Cửa hàng</th><th>Gợi ý</th></tr></thead>
          <tbody>
            {kq == null ? <tr><td colSpan={6} className="odn-trong">Đang tải…</td></tr>
              : ds.length === 0 ? <tr><td colSpan={6} className="odn-trong">{loc === 'chua' ? 'Mọi ID người bán đã được gán.' : 'Không có ID phù hợp.'}</td></tr>
              : ds.map((r) => (
                <tr key={r.handle} className={luu === r.handle ? 'tts-dang-luu' : ''}>
                  <td><div className="odn-ten">@{r.handle}</div>
                    <div className="odn-phu">{r.lan_cuoi ? 'bán gần nhất ' + gioNgay(r.lan_cuoi) : 'chưa có đơn'}{r.ma_ch || r.loai ? (r.tu_dong ? ' · tự khớp' : r.nguoi ? ' · gán bởi ' + r.nguoi : '') : ''}</div>
                    {vuaSua.has(r.handle) && <span className="tts-da-luu"><IcCheck /> Đã lưu{loc === 'chua' && (r.ma_ch || r.loai) ? ' — chọn tiếp được, đổi bộ lọc mới chuyển sang Đã gán' : ''}</span>}</td>
                  <td style={{ minWidth: 190 }}>
                    <input className="tts-ten-goi" value={nhap[r.handle] ?? r.ten ?? ''} maxLength={60} placeholder="Đặt tên gọi…"
                      aria-label={'Tên gọi cho @' + r.handle}
                      onChange={(e) => setNhap((n) => ({ ...n, [r.handle]: e.target.value }))}
                      onBlur={() => datTen(r)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setNhap((n) => { const m = { ...n }; delete m[r.handle]; return m; }); } }} />
                  </td>
                  <td className="so"><b>{fmt(r.don30)}</b> đơn<div className="odn-phu">{fmt(r.sl30)} sp</div></td>
                  <td style={{ minWidth: 170 }}>
                    <Sel value={r.loai || ''} placeholder="Chọn loại" onChange={(v) => gan(r, r.ma_ch, v)}
                      options={[{ value: '', label: '— Chưa gán —', disabled: true }, ...Object.entries(LOAI).map(([k, ten]) => ({ value: k, label: ten }))]} />
                  </td>
                  <td style={{ minWidth: 230 }}>
                    <Sel value={r.ma_ch || ''} placeholder="Chọn cửa hàng" timKiem onChange={(v) => gan(r, v, giuLoai(r, v))} options={chOpt} />
                  </td>
                  <td>{(r.goi_y || []).length ? <div className="odn-chips">{r.goi_y.map((g) => (
                    <button key={g.ma} className="tts-goi-y" onClick={() => gan(r, g.ma, giuLoai(r, g.ma))} title={'Gán vào ' + g.ten}>{g.ten}</button>
                  ))}</div> : <span className="odn-phu">—</span>}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ================= Nạp file Excel ================= */
const thoiGianTen = (ten) => {
  const m = String(ten || '').match(/(\d{4})-(\d{2})-(\d{2})-(\d{2})_(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+07:00` : null;
};
const chuoiNgay = (v) => {
  if (v instanceof Date) {
    const p = (n) => String(n).padStart(2, '0');
    return `${p(v.getDate())}/${p(v.getMonth() + 1)}/${v.getFullYear()} ${p(v.getHours())}:${p(v.getMinutes())}:${p(v.getSeconds())}`;
  }
  return v == null ? '' : String(v).trim();
};
async function docFile(file) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
  if (!aoa.length) throw new Error('File trống');
  const tieuDe = aoa[0].map((x) => String(x).trim());
  const thieu = COT_BAT_BUOC.filter((c) => !tieuDe.includes(c));
  if (thieu.length) throw new Error('Không phải file "Tất cả đơn hàng" của TikTok Shop — thiếu cột: ' + thieu.join(', '));
  const chiSo = tieuDe.map((c) => COT[c] || null);
  const ds = []; let lamTron = 0;
  const cotMa = tieuDe.indexOf('Order ID');
  for (let i = 1; i < aoa.length; i++) {
    const r = aoa[i];
    const id = r[cotMa];
    if (typeof id === 'number' && id > Number.MAX_SAFE_INTEGER) { lamTron++; continue; }
    if (!/^\d{6,}$/.test(String(id).trim())) continue;      // bỏ dòng mô tả cột (dòng 2) và dòng trống
    const o = {};
    chiSo.forEach((k, j) => {
      if (!k) return;
      const v = k.startsWith('t_') ? chuoiNgay(r[j]) : r[j] instanceof Date ? chuoiNgay(r[j]) : String(r[j] ?? '').trim();
      if (v !== '') o[k] = v;
    });
    ds.push(o);
  }
  const don = new Set(ds.map((x) => x.d));
  const ngay = ds.map((x) => (x.t_tao || '').slice(0, 10)).filter(Boolean)
    .map((s) => s.split('/').reverse().join('-')).sort();
  return { ten: file.name, ban: thoiGianTen(file.name) || new Date(file.lastModified || Date.now()).toISOString(),
    banTuTen: !!thoiGianTen(file.name), ds, soDon: don.size, tu: ngay[0], den: ngay[ngay.length - 1], lamTron };
}
function chiaLo(ds) {
  const theoDon = new Map();
  for (const x of ds) { if (!theoDon.has(x.d)) theoDon.set(x.d, []); theoDon.get(x.d).push(x); }
  const lo = []; let cur = [];
  for (const dong of theoDon.values()) {
    if (cur.length && cur.length + dong.length > LO_DONG) { lo.push(cur); cur = []; }
    cur.push(...dong);
  }
  if (cur.length) lo.push(cur);
  return lo;
}

function HopNap({ dong, xong }) {
  const { user, baoToast } = useApp();
  const [files, setFiles] = useState([]);   // {ten, ds, soDon, tu, den, ban, loi, kq, tienDo}
  const [keo, setKeo] = useState(false);
  const [dangNap, setDangNap] = useState(false);
  const chon = useRef(null);

  const them = async (ds) => {
    const moi = [];
    for (const f of ds) {
      try { moi.push(await docFile(f)); }
      catch (e) { moi.push({ ten: f.name, loi: e.message || String(e) }); }
    }
    setFiles((a) => [...a, ...moi]);
  };
  const napHet = async () => {
    setDangNap(true);
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.loi || f.kq || !f.ds?.length) continue;
      const lo = chiaLo(f.ds);
      let napId = null; const tong = { moi: 0, cap_nhat: 0, bo_qua: 0, loi: 0 };
      for (let j = 0; j < lo.length; j++) {
        const { data, error } = await sb.rpc('fn_tt_nap', { p_token: user.token, p_ds: lo[j],
          p_meta: { ten_file: f.ten, ban_luc: f.ban, nap_id: napId, xong: j === lo.length - 1 } });
        if (error) { setFiles((a) => a.map((x, k) => (k === i ? { ...x, loi: 'Lô ' + (j + 1) + ': ' + error.message } : x))); break; }
        napId = data?.nap_id ?? napId;
        tong.moi += data?.moi || 0; tong.cap_nhat += data?.cap_nhat || 0; tong.bo_qua += data?.bo_qua || 0; tong.loi += data?.loi || 0;
        setFiles((a) => a.map((x, k) => (k === i ? { ...x, tienDo: Math.round(((j + 1) / lo.length) * 100) } : x)));
      }
      setFiles((a) => a.map((x, k) => (k === i && !x.loi ? { ...x, kq: tong } : x)));
    }
    setDangNap(false);
    baoToast('Đã nạp xong');
    xong();
  };
  const conNap = files.some((f) => !f.loi && !f.kq && f.ds?.length);
  const daXong = files.length > 0 && files.every((f) => f.loi || f.kq);

  return (
    <div className="modal-nen" onClick={() => !dangNap && dong()}>
      <div className="modal-hop tts-nap" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Nạp file Excel TikTok Shop">
        <div className="modal-dau"><b>Nạp đơn TikTok Shop từ file Excel</b>
          <button className="modal-x" onClick={dong} disabled={dangNap} aria-label="Đóng">✕</button></div>
        <div className="modal-than">
          <div className={'tts-tha' + (keo ? ' keo' : '')}
            onDragOver={(e) => { e.preventDefault(); setKeo(true); }} onDragLeave={() => setKeo(false)}
            onDrop={(e) => { e.preventDefault(); setKeo(false); them([...e.dataTransfer.files]); }}
            onClick={() => chon.current?.click()} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') chon.current?.click(); }}>
            <IcGuiLen />
            <b>Kéo thả file vào đây hoặc bấm để chọn</b>
            <span>File "Tất cả đơn hàng" tải từ Seller Center → Đơn hàng → Xuất → Excel. Chọn được nhiều file một lúc.</span>
            <input ref={chon} type="file" accept=".xlsx,.xls,.csv" multiple hidden onChange={(e) => { them([...e.target.files]); e.target.value = ''; }} />
          </div>

          {files.length > 0 && (
            <div className="tts-file-ds">
              {files.map((f, i) => (
                <div key={i} className={'tts-file' + (f.loi ? ' loi' : f.kq ? ' xong' : '')}>
                  <div className="tts-file-dau"><b title={f.ten}>{f.ten}</b>
                    {f.kq ? <span className="odn-chip ok"><IcCheck /> Xong</span> : f.loi ? <span className="odn-chip do">Lỗi</span> : null}</div>
                  {f.loi ? <div className="tts-file-loi">{f.loi}</div> : (
                    <>
                      <div className="odn-phu">{fmt(f.ds.length)} dòng · <b>{fmt(f.soDon)} đơn</b> · tạo từ {ngayVN(f.tu)} đến {ngayVN(f.den)} ·
                        {f.banTuTen ? ' xuất lúc ' + gioNgay(f.ban) : ' (không đọc được giờ xuất trong tên file — lấy giờ lưu file)'}</div>
                      {f.lamTron > 0 && <div className="tts-file-loi">{fmt(f.lamTron)} dòng bị Excel làm tròn mã đơn nên đã bỏ qua — dùng file gốc tải từ TikTok, đừng mở rồi lưu lại bằng Excel.</div>}
                      {(f.tienDo != null || f.kq) && <div className="tts-tien-do"><i style={{ width: (f.kq ? 100 : f.tienDo) + '%' }} /></div>}
                      {f.kq && <div className="tts-file-kq"><span><b>{fmt(f.kq.moi)}</b> đơn mới</span><span><b>{fmt(f.kq.cap_nhat)}</b> cập nhật</span>
                        <span title="Trong app đã có bản mới hơn (file xuất muộn hơn hoặc API)"><b>{fmt(f.kq.bo_qua)}</b> bỏ qua vì đã có bản mới hơn</span>
                        {f.kq.loi > 0 && <span className="tts-huy"><b>{fmt(f.kq.loi)}</b> đơn lỗi ngày tạo</span>}</div>}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="tts-nap-chan">
            <span className="odn-phu">Đơn trùng mã sẽ được cập nhật trạng thái mới nhất, không bị nhân đôi. Không lưu tên, số điện thoại, địa chỉ người mua.</span>
            {daXong ? <button className="btn btn-ai" onClick={dong}>Xong</button>
              : <button className="btn btn-ai" disabled={!conNap || dangNap} onClick={napHet}>
                {dangNap ? 'Đang nạp…' : `Nạp ${fmt(files.filter((f) => !f.loi && !f.kq).reduce((s, f) => s + (f.soDon || 0), 0))} đơn`}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
