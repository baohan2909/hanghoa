import { useEffect, useState, useRef, useCallback, lazy, Suspense, createContext, useContext, Component } from 'react';
import { sb } from './lib/supabase.js';
import { IcPulse, IcCart, IcCheck, IcSplit, IcTruck, IcGear, IcClock, IcBox, IcAlert, IcSearch, IcOut, IcTrophy, IcRadar, IcChat2, IcTeam, IcGuiLen, IcTui, IcOnline, IcChiaOnl } from './lib/icons.jsx';
import Login from './screens/Login.jsx';
import XinHang from './screens/XinHang.jsx';
import { OdooHost } from './lib/OdooHop.jsx';
import { BanTinHost } from './lib/BanTin.jsx';
import { SieuTriTueHost } from './lib/SieuTriTue.jsx';   // NEW - 3.127 SIÊU TRÍ TUỆ
import { useBaoTri, ManBaoTri, DaiBaoTri } from './lib/BaoTri.jsx';

// Màn ít dùng / nặng: tải khi mở, giữ lần tải đầu nhẹ cho máy cửa hàng
const Kho = lazy(() => import('./screens/Kho.jsx'));
const Duyet = lazy(() => import('./screens/Duyet.jsx'));
const Dashboard = lazy(() => import('./screens/Dashboard.jsx'));
const Lich = lazy(() => import('./screens/Lich.jsx'));
const DauTruong = lazy(() => import('./screens/DauTruong.jsx'));
const GiamSat = lazy(() => import('./screens/GiamSat.jsx'));
const DacBiet = lazy(() => import('./screens/DacBiet.jsx'));
const TheoDoiOnline = lazy(() => import('./screens/TheoDoiOnline.jsx'));
const VanDon = lazy(() => import('./screens/VanDon.jsx'));
const ThamSo = lazy(() => import('./screens/ThamSo.jsx'));
const DoiSoat = lazy(() => import('./screens/DoiSoat.jsx'));
const YeuCauDieuPhoi = lazy(() => import('./screens/YeuCauDieuPhoi.jsx'));
const ChatLuongDN = lazy(() => import('./screens/ChatLuongDN.jsx'));
const ChiaHangMoi = lazy(() => import('./screens/ChiaHangMoi.jsx'));
const DoiSale = lazy(() => import('./screens/DoiSale.jsx'));
const PhongDieuHanh = lazy(() => import('./screens/PhongDieuHanh.jsx'));
const BaoCaoTelegram = lazy(() => import('./screens/BaoCaoTelegram.jsx'));
const OdooDon = lazy(() => import('./screens/OdooDon.jsx'));
const TikTokShop = lazy(() => import('./screens/TikTokShop.jsx'));   // NEW - 3.140
const BanOnline = lazy(() => import('./screens/BanOnline.jsx'));     // NEW - 3.153 Bán online (Nhanh.vn)
const TonKho = lazy(() => import('./screens/TonKho.jsx'));
const ChiaOnline = lazy(() => import('./screens/ChiaOnline.jsx'));   // NEW - 3.157 Chia hàng Online
const HuongDan = lazy(() => import('./screens/HuongDan.jsx'));

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

// Menu "bàn làm việc": chia nhóm theo tư duy quản lý
// NEW - 3.157: menu cơ cấu lại theo việc — Tổng quan · Chia hàng · Kho & đơn · Báo cáo · Thi đua · Hỗ trợ · Cấu hình
//   (giữ nguyên tên "Đề nghị hàng" — cửa hàng đã quen; id màn không đổi nên Siêu trí tuệ / đường dẫn cũ vẫn đúng)
const MENU = [
  { nhom: 'TỔNG QUAN', items: [
    { id: 'dashboard', ten: 'Tổng quan',      Ic: IcPulse, roles: ['DIEU_PHOI', 'ADMIN'] },
    { id: 'dieuhanh',  ten: 'Phòng điều hành', Ic: IcRadar, roles: ['DIEU_PHOI', 'ADMIN'] },
  ]},
  { nhom: 'CHIA HÀNG', items: [
    { id: 'xinhang',   ten: 'Đề nghị hàng',   Ic: IcCart,  roles: ['CH', 'DIEU_PHOI', 'ADMIN'] },
    { id: 'duyet',     ten: 'Điều phối',      Ic: IcCheck, roles: ['DIEU_PHOI', 'ADMIN'] },
    { id: 'ycdp',      ten: 'Yêu cầu ĐP',     Ic: IcCart,  roles: ['DIEU_PHOI', 'KHO', 'ADMIN'] },
    { id: 'chiamoi',   ten: 'Chia hàng mới',  Ic: IcSplit, roles: ['DIEU_PHOI', 'ADMIN'] },
    { id: 'doisale',   ten: 'Đội Sale',       Ic: IcTeam,  roles: ['DIEU_PHOI', 'ADMIN'] },
    { id: 'chiaonline', ten: 'Chia hàng Online', Ic: IcChiaOnl, roles: ['DIEU_PHOI', 'ADMIN'] },   // NEW - 3.157
  ]},
  { nhom: 'KHO & ĐƠN', items: [
    { id: 'kho',       ten: 'Kho tổng',       Ic: IcBox,   roles: ['KHO', 'DIEU_PHOI', 'ADMIN'] },
    { id: 'tonkd',     ten: 'Tồn khả dụng',   Ic: IcBox,   roles: ['KHO', 'DIEU_PHOI', 'ADMIN'] },   // v3.118.0: ẩn với cửa hàng
    { id: 'odoo',      ten: 'Đơn hàng Odoo',  Ic: IcGuiLen, roles: ['CH', 'KHO', 'DIEU_PHOI', 'ADMIN'] },
    { id: 'vandon',    ten: 'Vận đơn',        Ic: IcTruck, roles: ['CH', 'KHO', 'DIEU_PHOI', 'ADMIN'] },
  ]},
  { nhom: 'BÁO CÁO', items: [
    { id: 'banonline', ten: 'Online',         Ic: IcOnline,  roles: ['DIEU_PHOI', 'ADMIN'] },   // NEW - 3.153 Nhanh.vn
    { id: 'tiktok',    ten: 'TikTok Shop',    Ic: IcTui,   roles: ['DIEU_PHOI', 'ADMIN'] },   // NEW - 3.140
    { id: 'giamsat',   ten: 'Thiếu hàng',     Ic: IcAlert, roles: ['CH', 'DIEU_PHOI', 'ADMIN'] },
    { id: 'chatluong', ten: 'Chất lượng ĐN', Ic: IcAlert, roles: ['DIEU_PHOI', 'ADMIN', 'KHO'] },
  ]},
  { nhom: 'THI ĐUA', items: [
    { id: 'dautruong', ten: 'Đấu trường',     Ic: IcTrophy, roles: ['CH', 'KHO', 'DIEU_PHOI', 'ADMIN'] },
  ]},
  { nhom: 'HỖ TRỢ', items: [
    { id: 'huongdan',  ten: 'Hướng dẫn cập nhật', Ic: IcCheck, roles: ['CH', 'KHO', 'DIEU_PHOI', 'ADMIN'] },
  ]},
  { nhom: 'CẤU HÌNH', items: [
    { id: 'lich',      ten: 'Lịch đề nghị',   Ic: IcClock, roles: ['DIEU_PHOI', 'ADMIN'] },
    { id: 'dacbiet',   ten: 'Hàng đặc biệt', Ic: IcBox,   roles: ['DIEU_PHOI', 'ADMIN'] },
    { id: 'online',    ten: 'Theo dõi online', Ic: IcPulse, roles: ['ADMIN'] },
    { id: 'doisoat',   ten: 'Đối soát',       Ic: IcAlert, roles: ['ADMIN'] },
    { id: 'thamso',    ten: 'Tham số',        Ic: IcGear,  roles: ['ADMIN'] },
    { id: 'baocaotg',  ten: 'Báo cáo Telegram', Ic: IcChat2, roles: ['ADMIN'] },
  ]},
];
const TAB_MAC_DINH = { CH: 'xinhang', KHO: 'kho', DIEU_PHOI: 'dashboard', ADMIN: 'dashboard' };
const VAI_TRO_TEN = { CH: 'Trưởng ca cửa hàng', KHO: 'Kho tổng', DIEU_PHOI: 'Điều phối', ADMIN: 'Quản trị' };

class ErrBound extends Component {
  constructor(p) { super(p); this.state = { loi: null }; }
  static getDerivedStateFromError(e) { return { loi: e?.message || String(e) }; }
  render() {
    if (this.state.loi) return (
      <div className="card" style={{ margin: 16, padding: 20, borderLeft: '4px solid var(--magenta)' }}>
        <div style={{ fontWeight: 700, color: 'var(--magenta)', marginBottom: 6 }}>Màn hình gặp lỗi</div>
        <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>{this.state.loi}</div>
        <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => location.reload()}>Tải lại</button>
      </div>
    );
    return this.props.children;
  }
}

export default function App() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('nsflow_user')); } catch { return null; }
  });
  const [tab, setTab] = useState('xinhang');
  const [toast, setToast] = useState('');
  const [choXuLy, setChoXuLy] = useState(0);
  const [baoThieu, setBaoThieu] = useState(0);      // NEW - 304: số phiếu cửa hàng báo thiếu khi nhận, chờ xử lý
  const [moMenu, setMoMenu] = useState(false);
  const [caiApp, setCaiApp] = useState(null);       // sự kiện cài PWA (nếu trình duyệt hỗ trợ)
  // NEW - 3.145: đang mở bằng ứng dụng đã cài (cửa sổ riêng / màn hình chính) → không hiện nút "Tải ứng dụng"
  const [daCai, setDaCai] = useState(() => {
    try {
      return ['standalone', 'window-controls-overlay', 'minimal-ui', 'fullscreen'].some((m) => window.matchMedia(`(display-mode: ${m})`).matches)
        || window.navigator.standalone === true;
    } catch { return false; }
  });
  // iPhone/iPad không có hộp cài tự động → vẫn hiện nút để hướng dẫn "Thêm vào màn hình chính" khi mở bằng Safari
  const laIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const hienCai = !daCai && (!!caiApp || laIOS);
  const [banMoi, setBanMoi] = useState(null);       // {ban, bat_buoc, ghi_chu} — bản phát hành mới
  const [dem, setDem] = useState(null);            // đếm ngược tự cập nhật (giây), null = không đếm
  const banRef = useRef(new Set());                // các màn đang có thao tác dở
  const [dangBan, setDangBan] = useState(false);
  // Màn con gọi: datBan('xinhang', true/false) khi bắt đầu / kết thúc việc dở.
  const datBan = (id, ban) => {
    const s = banRef.current;
    if (ban) s.add(id); else s.delete(id);
    setDangBan(s.size > 0);
  };

  useEffect(() => { document.title = `Điều phối hàng hóa — Nón Sơn · v${__APP_VERSION__}`; }, []);

  useEffect(() => {
    const h = (e) => { e.preventDefault(); setCaiApp(e); };
    window.addEventListener('beforeinstallprompt', h);
    // NEW - 3.145: cài xong thì ẩn nút "Tải ứng dụng"
    const xong = () => { setCaiApp(null); setDaCai(true); };
    window.addEventListener('appinstalled', xong);
    return () => { window.removeEventListener('beforeinstallprompt', h); window.removeEventListener('appinstalled', xong); };
  }, []);
  const taiApp = async () => {
    if (!caiApp) { baoToast('Bấm nút Chia sẻ → "Thêm vào MH chính" để cài'); return; }
    caiApp.prompt();
    const kq = await caiApp.userChoice;
    setCaiApp(null);
    if (kq?.outcome === 'accepted') setDaCai(true);
  };

  // NEW - 3.157: baoToast ỔN ĐỊNH (không đổi mỗi lần vẽ lại). Trước đây mỗi lần báo lỗi làm App vẽ lại → hàm mới →
  //   các màn có useEffect phụ thuộc baoToast gọi lại RPC → lỗi tiếp → vòng lặp dội máy chủ (24/11: 576 lần gọi / giờ).
  const henToast = useRef(null);
  const baoToast = useCallback((msg) => { setToast(msg); clearTimeout(henToast.current); henToast.current = setTimeout(() => setToast(''), 2600); }, []);
  // NEW - 3.140.1: quay về từ ủy quyền TikTok Shop (Edge Function tiktok-shop chuyển hướng về ?tiktok=ok|loi)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const kq = p.get('tiktok');
    if (!kq) return;
    setTab('tiktok');
    setToast(kq === 'ok' ? 'Đã kết nối TikTok Shop' + (p.get('shop') ? ' · ' + p.get('shop') : '') + ' — đơn sẽ tự về mỗi 5 phút'
      : 'Kết nối TikTok Shop chưa được: ' + (p.get('ly_do') || 'không rõ lý do'));
    setTimeout(() => setToast(''), 8000);
    window.history.replaceState(null, '', window.location.pathname);
  }, []);
  // NEW - 3.153: quay về từ ủy quyền Nhanh.vn (Edge Function nhanh chuyển hướng về ?nhanh=ok|loi)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const kq = p.get('nhanh');
    if (!kq) return;
    setTab('banonline');
    setToast(kq === 'ok' ? 'Đã kết nối Nhanh.vn — đơn online sẽ tự về mỗi 5 phút, kéo bù lịch sử dần trong khoảng 1 giờ'
      : 'Kết nối Nhanh.vn chưa được: ' + (p.get('ly_do') || 'không rõ lý do'));
    setTimeout(() => setToast(''), 9000);
    window.history.replaceState(null, '', window.location.pathname);
  }, []);
  const dangXuat = () => { localStorage.removeItem('nsflow_user'); localStorage.removeItem('nsflow_login_at'); setUser(null); };

  // ===== TỰ CẬP NHẬT =====
  // Admin phát hành ở màn Tham số -> mọi máy nhận realtime -> hiện thanh mời cập nhật.
  // TUYỆT ĐỐI không tự tải lại khi người dùng đang thao tác dở (dangBan).
  useEffect(() => {
    if (!user) return;
    // NEW - 3.159.6: chỉ mời cập nhật khi bản phát hành MỚI HƠN bản đang chạy (bản phát hành cũ hơn → không báo, tránh tải lại vòng vòng)
    const moiHon = (a, b) => {
      const x = String(a).split('.').map((v) => parseInt(v, 10) || 0), y = String(b).split('.').map((v) => parseInt(v, 10) || 0);
      for (let i = 0; i < Math.max(x.length, y.length); i += 1) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); }
      return false;
    };
    const soanh = (d) => {
      if (!d || !d.ban || !moiHon(d.ban, __APP_VERSION__)) { setBanMoi(null); return; }
      setBanMoi({ ban: d.ban, bat_buoc: !!d.bat_buoc, ghi_chu: d.ghi_chu || '' });
    };
    const hoi = () => sb.rpc('fn_phien_ban').then(({ data }) => soanh(data), () => {});
    hoi();
    const ch = sb.channel('phien_ban').on('postgres_changes',
      { event: 'INSERT', schema: 'chiahang', table: 'phien_ban' }, hoi).subscribe();
    const t = setInterval(hoi, 15 * 60000);          // lưới an toàn nếu realtime rớt
    const khiHien = () => { if (document.visibilityState === 'visible') hoi(); };
    document.addEventListener('visibilitychange', khiHien);
    return () => { sb.removeChannel(ch); clearInterval(t); document.removeEventListener('visibilitychange', khiHien); };
  }, [user]);

  // Đổi URL để bỏ qua bản HTML còn nằm trong bộ nhớ đệm của trình duyệt.
  const capNhatNgay = () => location.replace(location.pathname + '?v=' + encodeURIComponent(banMoi?.ban || Date.now()));

  // Rảnh tay thì đếm ngược rồi tự cập nhật; đang làm dở thì dừng đếm ngay.
  useEffect(() => {
    if (!banMoi) { setDem(null); return; }
    if (dangBan) { setDem(null); return; }
    setDem(banMoi.bat_buoc ? 20 : 60);
    const t = setInterval(() => setDem((v) => {
      if (v === null) return null;
      if (v <= 1) { clearInterval(t); capNhatNgay(); return 0; }
      return v - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [banMoi, dangBan]);

  // Nhịp tim: báo online + màn đang xem, mỗi 60s. Cũng gửi ngay khi đổi màn.
  useEffect(() => {
    if (!user) return;
    let dung = false;
    const nhip = () => {
      if (dung) return;
      sb.rpc('fn_ghi_nhip', { p_ma: user.ma_dang_nhap, p_ma_ch: user.ma_ch || null, p_man: tab })
        .then(() => {}, () => {});   // im lặng nếu lỗi mạng, không phiền người dùng
    };
    nhip();
    const t = setInterval(nhip, 60000);
    return () => { dung = true; clearInterval(t); };
  }, [user, tab]);

  // Đăng nhập duy trì 1 tuần: tự logout vào 0h thứ 2. Kiểm khi mở app + mỗi phút.
  useEffect(() => {
    if (!user) return;
    const motThu2 = () => {
      // mốc 0h thứ 2 kế tiếp kể từ lúc đăng nhập
      const loginAt = Number(localStorage.getItem('nsflow_login_at') || Date.now());
      const d = new Date(loginAt);
      const day = d.getDay();                     // 0=CN,1=T2...
      const toMon = (day === 1 ? 7 : ((8 - day) % 7)) || 7;
      const han = new Date(d); han.setDate(d.getDate() + toMon);
      han.setHours(0, 0, 0, 0);
      return han.getTime();
    };
    const kiem = () => { if (Date.now() >= motThu2()) { baoToast('Phiên tuần đã hết — đăng nhập lại'); dangXuat(); } };
    kiem();
    const t = setInterval(kiem, 60000);
    return () => clearInterval(t);
  }, [user]);

  // NEW - 304: Quản trị / Điều phối — đếm phiếu cửa hàng báo thiếu khi nhận (2 phút / lần khi đang mở app, và ngay khi xử lý xong)
  useEffect(() => {
    if (!user || !['ADMIN', 'DIEU_PHOI'].includes(user.vai_tro)) { setBaoThieu(0); return undefined; }
    let song = true;
    const dem = async () => {
      if (document.visibilityState === 'hidden') return;
      const { data, error } = await sb.rpc('fn_odoo_bao_thieu_dem', { p_token: user.token });
      if (song && !error) setBaoThieu(data?.so || 0);
    };
    dem();
    const t = setInterval(dem, 120000);
    document.addEventListener('visibilitychange', dem);
    window.addEventListener('ns-bao-thieu-doi', dem);
    return () => { song = false; clearInterval(t); document.removeEventListener('visibilitychange', dem); window.removeEventListener('ns-bao-thieu-doi', dem); };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setTab(TAB_MAC_DINH[user.vai_tro] || 'dashboard');
    const dem = async () => {
      const tt = user.vai_tro === 'KHO' ? 'LEN_ODOO' : 'GUI';
      const { count } = await sb.from('don_xin_hang')
        .select('id', { count: 'exact', head: true }).eq('trang_thai', tt);
      setChoXuLy(count || 0);
    };
    dem();
    const ch = sb.channel('don').on('postgres_changes',
      { event: '*', schema: 'chiahang', table: 'don_xin_hang' }, dem).subscribe();
    return () => sb.removeChannel(ch);
  }, [user]);

  const [gon, setGon] = useState(() => localStorage.getItem('nsflow_side_gon') === '1');
  const doiGon = () => setGon((v) => { localStorage.setItem('nsflow_side_gon', v ? '0' : '1'); return !v; });
  const { bt: baoTri, hoi: hoiBaoTri } = useBaoTri(user);   // v3.119.0: khoá app bảo trì (Tham số)

  if (!user) return <Login onOk={(u) => { localStorage.setItem('nsflow_user', JSON.stringify(u)); localStorage.setItem('nsflow_login_at', String(Date.now())); setUser(u); }} />;

  // v3.119.0: đang bảo trì và vai trò này bị khoá -> chỉ hiện màn thông báo (máy chủ cũng từ chối mọi thao tác)
  if (baoTri?.khoa) return <ManBaoTri bt={baoTri} user={user} onKiem={hoiBaoTri} dangXuat={dangXuat} />;

  const Screen = { dashboard: Dashboard, xinhang: XinHang, duyet: Duyet, kho: Kho, lich: Lich, dautruong: DauTruong,
    giamsat: GiamSat, chiamoi: ChiaHangMoi, doisale: DoiSale, dacbiet: DacBiet, online: TheoDoiOnline, vandon: VanDon, thamso: ThamSo, doisoat: DoiSoat, ycdp: YeuCauDieuPhoi, chatluong: ChatLuongDN, dieuhanh: PhongDieuHanh, baocaotg: BaoCaoTelegram, odoo: OdooDon, tiktok: TikTokShop, banonline: BanOnline, tonkd: TonKho, huongdan: HuongDan, chiaonline: ChiaOnline }[tab]
    || (user.vai_tro === 'KHO' ? Kho : XinHang);
  const tabDem = user.vai_tro === 'KHO' ? 'kho' : 'duyet';
  const chonTab = (id) => { setTab(id); setMoMenu(false); };
  // NEW - 304: bấm số đỏ báo thiếu -> mở Đơn hàng Odoo, lọc sẵn thẻ "Nhận thiếu"
  const moBaoThieu = (e) => {
    e.stopPropagation();
    try { sessionStorage.setItem('ns_odoo_nhom', 'bao_thieu'); } catch { /* bỏ qua */ }
    window.dispatchEvent(new CustomEvent('ns-odoo-nhom', { detail: 'bao_thieu' }));
    chonTab('odoo');
  };

  const sidebar = (
    <aside className={'sidebar' + (moMenu ? ' open' : '') + (gon ? ' gon' : '')} aria-label="Menu">
      <button className="side-toggle" onClick={doiGon}
        title={gon ? 'Mở rộng menu' : 'Thu gọn menu'} aria-label="Thu gọn / mở rộng menu">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: gon ? 'rotate(180deg)' : 'none', transition: 'transform .25s' }}>
          <path d="M15 18l-6-6 6-6" /></svg>
      </button>
      <div className="side-logo">
        <div className="t">{gon ? 'ĐP' : 'ĐIỀU PHỐI HÀNG HÓA'}</div>
        {!gon && <div className="s">Nón Sơn · đề nghị & điều chuyển</div>}
        <div className="s" style={{ opacity: .55, fontSize: 10.5, marginTop: 2 }}>v{__APP_VERSION__}</div>
      </div>
      <div className="side-nav">
      {MENU.map((g) => {
        const items = g.items.filter((t) => t.roles.includes(user.vai_tro));
        if (!items.length) return null;
        return (
          <div key={g.nhom}>
            <div className="side-group">{gon ? '·' : g.nhom}</div>
            {items.map(({ id, ten, Ic }) => (
              <button key={id} className={'side-item' + (tab === id ? ' on' : '')}
                onClick={() => chonTab(id)} title={gon ? ten : undefined}>
                <Ic /><span className="side-txt">{ten}</span>
                {id === tabDem && choXuLy > 0 && <span className="badge-dot">{choXuLy}</span>}
                {id === 'odoo' && baoThieu > 0 && (
                  <span className="badge-dot" role="button" title="Cửa hàng báo thiếu khi nhận — bấm để xem" onClick={moBaoThieu}>{baoThieu}</span>)}
              </button>
            ))}
          </div>
        );
      })}
      </div>
      <div className="side-user">
        {!gon && <><div className="n">{user.ten}</div>
        <div className="r mono">{user.ma_dang_nhap} · {VAI_TRO_TEN[user.vai_tro] || user.vai_tro}</div></>}
        {hienCai && <button className="side-install" onClick={taiApp} title={gon ? 'Tải ứng dụng' : undefined}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: -3, flexShrink: 0 }}>
            <path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
          {!gon && ' Tải ứng dụng'}
        </button>}
        <button className="side-out" onClick={dangXuat} title={gon ? 'Đăng xuất' : undefined}>
          <IcOut style={{ verticalAlign: -3 }} />{!gon && ' Đăng xuất'}</button>
      </div>
    </aside>
  );

  return (
    <Ctx.Provider value={{ user, baoToast, dangXuat, datBan }}>
      <div className="ws">
        {sidebar}
        {moMenu && <div className="m-cover" onClick={() => setMoMenu(false)} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="mtop">
            <button className="mtop-btn" onClick={() => setMoMenu(true)} aria-label="Mở menu">
              <IcSearch style={{ display: 'none' }} />
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            </button>
            <div className="t">ĐIỀU PHỐI HÀNG HÓA</div>
          </div>
          <DaiBaoTri bt={baoTri} chonTab={user.vai_tro === 'ADMIN' ? chonTab : null} />
          <main className="main" data-tab={tab}>
            <ErrBound key={tab}><Suspense fallback={<div className="card" style={{ padding: 34, textAlign: 'center', color: 'var(--ink-2)' }}>Đang mở màn hình…</div>}>
              <Screen chonTab={chonTab} />
            </Suspense></ErrBound>
          </main>
        </div>
        {banMoi && (
          <div className={'capnhat-bar' + (banMoi.bat_buoc ? ' bb' : '')} role="status">
            <span className="cn-ic" aria-hidden="true">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20V5M6 11l6-6 6 6" /></svg>
            </span>
            <div className="cn-txt">
              <b>Đã có bản mới {banMoi.ban}</b>
              <small>
                {dangBan ? 'Làm xong việc đang dở rồi cập nhật — số đang nhập vẫn được giữ'
                  : dem !== null ? `Tự cập nhật sau ${dem} giây`
                  : (banMoi.ghi_chu || 'Cập nhật để dùng tính năng mới nhất')}
              </small>
            </div>
            <button className="btn btn-hd cn-nut" onClick={capNhatNgay}>Cập nhật ngay</button>
            {!banMoi.bat_buoc && <button className="cn-sau" onClick={() => setBanMoi(null)}>Để sau</button>}
          </div>
        )}
        <OdooHost user={user} baoToast={baoToast} />
        <BanTinHost user={user} baoToast={baoToast} />
        {/* NEW - 3.127 SIÊU TRÍ TUỆ: trợ lý AI điều hành — có ở mọi tab */}
        <SieuTriTueHost user={user} tab={tab} chonTab={chonTab} baoToast={baoToast}
          tabsDuoc={MENU.flatMap((g) => g.items).filter((t) => t.roles.includes(user.vai_tro)).map(({ id, ten }) => ({ id, ten }))} />
        {toast && <div className="toast" role="status">{toast}</div>}
      </div>
    </Ctx.Provider>
  );
}
