import { useEffect, useState, useRef, lazy, Suspense, createContext, useContext, Component } from 'react';
import { sb } from './lib/supabase.js';
import { IcPulse, IcCart, IcCheck, IcSplit, IcTruck, IcGear, IcClock, IcBox, IcAlert, IcSearch, IcOut, IcTrophy } from './lib/icons.jsx';
import Login from './screens/Login.jsx';
import XinHang from './screens/XinHang.jsx';

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
const BaoCao = lazy(() => import('./screens/BaoCao.jsx'));
const ThamSo = lazy(() => import('./screens/ThamSo.jsx'));
const DoiSoat = lazy(() => import('./screens/DoiSoat.jsx'));
const YeuCauDieuPhoi = lazy(() => import('./screens/YeuCauDieuPhoi.jsx'));
const ChatLuongDN = lazy(() => import('./screens/ChatLuongDN.jsx'));
const ChiaHangMoi = lazy(() => import('./screens/ChiaHangMoi.jsx'));

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

// Menu "bàn làm việc": chia nhóm theo tư duy quản lý
const MENU = [
  { nhom: 'VẬN HÀNH', items: [
    { id: 'dashboard', ten: 'Tổng quan',      Ic: IcPulse, roles: ['DIEU_PHOI', 'ADMIN'] },
    { id: 'chatluong', ten: 'Chất lượng ĐN', Ic: IcAlert, roles: ['DIEU_PHOI', 'ADMIN', 'KHO'] },
    { id: 'xinhang',   ten: 'Đề nghị hàng',   Ic: IcCart,  roles: ['CH', 'DIEU_PHOI', 'ADMIN'] },
    { id: 'duyet',     ten: 'Điều phối',      Ic: IcCheck, roles: ['DIEU_PHOI', 'ADMIN'] },
    { id: 'ycdp',      ten: 'Yêu cầu ĐP',     Ic: IcCart,  roles: ['DIEU_PHOI', 'KHO', 'ADMIN'] },
    { id: 'kho',       ten: 'Kho tổng',       Ic: IcBox,   roles: ['KHO', 'DIEU_PHOI', 'ADMIN'] },
  ]},
  { nhom: 'GIÁM SÁT', items: [
    { id: 'giamsat',   ten: 'Thiếu hàng',     Ic: IcAlert, roles: ['CH', 'DIEU_PHOI', 'ADMIN'] },
    { id: 'vandon',    ten: 'Vận đơn',        Ic: IcTruck, roles: ['CH', 'KHO', 'DIEU_PHOI', 'ADMIN'] },
    { id: 'baocao',    ten: 'Báo cáo',        Ic: IcClock, roles: ['DIEU_PHOI', 'ADMIN'] },
  ]},
  { nhom: 'THI ĐUA', items: [
    { id: 'dautruong', ten: 'Đấu trường',     Ic: IcTrophy, roles: ['CH', 'KHO', 'DIEU_PHOI', 'ADMIN'] },
  ]},
  { nhom: 'CẤU HÌNH', items: [
    { id: 'lich',      ten: 'Lịch đề nghị',   Ic: IcClock, roles: ['DIEU_PHOI', 'ADMIN'] },
    { id: 'chiamoi',   ten: 'Chia hàng mới',  Ic: IcSplit, roles: ['DIEU_PHOI', 'ADMIN'] },
    { id: 'dacbiet',   ten: 'Hàng đặc biệt', Ic: IcBox,   roles: ['DIEU_PHOI', 'ADMIN'] },
    { id: 'online',    ten: 'Theo dõi online', Ic: IcPulse, roles: ['ADMIN'] },
    { id: 'doisoat',   ten: 'Đối soát',       Ic: IcAlert, roles: ['ADMIN'] },
    { id: 'thamso',    ten: 'Tham số',        Ic: IcGear,  roles: ['ADMIN'] },
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
  const [moMenu, setMoMenu] = useState(false);
  const [caiApp, setCaiApp] = useState(null);       // sự kiện cài PWA (nếu trình duyệt hỗ trợ)
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
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);
  const taiApp = async () => {
    if (!caiApp) { baoToast('Mở menu trình duyệt → "Thêm vào màn hình chính" để cài'); return; }
    caiApp.prompt();
    await caiApp.userChoice;
    setCaiApp(null);
  };

  const baoToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2600); };
  const dangXuat = () => { localStorage.removeItem('nsflow_user'); localStorage.removeItem('nsflow_login_at'); setUser(null); };

  // ===== TỰ CẬP NHẬT =====
  // Admin phát hành ở màn Tham số -> mọi máy nhận realtime -> hiện thanh mời cập nhật.
  // TUYỆT ĐỐI không tự tải lại khi người dùng đang thao tác dở (dangBan).
  useEffect(() => {
    if (!user) return;
    const soanh = (d) => {
      if (!d || !d.ban || d.ban === __APP_VERSION__) { setBanMoi(null); return; }
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

  if (!user) return <Login onOk={(u) => { localStorage.setItem('nsflow_user', JSON.stringify(u)); localStorage.setItem('nsflow_login_at', String(Date.now())); setUser(u); }} />;

  const Screen = { dashboard: Dashboard, xinhang: XinHang, duyet: Duyet, kho: Kho, lich: Lich, dautruong: DauTruong,
    giamsat: GiamSat, chiamoi: ChiaHangMoi, dacbiet: DacBiet, online: TheoDoiOnline, vandon: VanDon, baocao: BaoCao, thamso: ThamSo, doisoat: DoiSoat, ycdp: YeuCauDieuPhoi, chatluong: ChatLuongDN }[tab]
    || (user.vai_tro === 'KHO' ? Kho : XinHang);
  const tabDem = user.vai_tro === 'KHO' ? 'kho' : 'duyet';
  const chonTab = (id) => { setTab(id); setMoMenu(false); };

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
              </button>
            ))}
          </div>
        );
      })}
      </div>
      <div className="side-user">
        {!gon && <><div className="n">{user.ten}</div>
        <div className="r mono">{user.ma_dang_nhap} · {VAI_TRO_TEN[user.vai_tro] || user.vai_tro}</div></>}
        <button className="side-install" onClick={taiApp} title={gon ? 'Tải ứng dụng' : undefined}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: -3, flexShrink: 0 }}>
            <path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
          {!gon && ' Tải ứng dụng'}
        </button>
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
          <main className="main">
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
        {toast && <div className="toast" role="status">{toast}</div>}
      </div>
    </Ctx.Provider>
  );
}
