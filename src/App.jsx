import { useEffect, useState, createContext, useContext, Component } from 'react';
import { sb } from './lib/supabase.js';
import { IcPulse, IcCart, IcCheck, IcSplit, IcTruck, IcGear, IcClock, IcBox, IcAlert, IcSearch, IcOut, IcTrophy } from './lib/icons.jsx';
import Login from './screens/Login.jsx';
import Dashboard from './screens/Dashboard.jsx';
import XinHang from './screens/XinHang.jsx';
import Duyet from './screens/Duyet.jsx';
import Kho from './screens/Kho.jsx';
import Lich from './screens/Lich.jsx';
import DauTruong from './screens/DauTruong.jsx';
import GiamSat from './screens/GiamSat.jsx';
import ChiaHangMoi from './screens/ChiaHangMoi.jsx';
import DacBiet from './screens/DacBiet.jsx';
import TheoDoiOnline from './screens/TheoDoiOnline.jsx';
import VanDon from './screens/VanDon.jsx';
import BaoCao from './screens/BaoCao.jsx';
import ThamSo from './screens/ThamSo.jsx';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

// Menu "bàn làm việc": chia nhóm theo tư duy quản lý
const MENU = [
  { nhom: 'VẬN HÀNH', items: [
    { id: 'dashboard', ten: 'Tổng quan',      Ic: IcPulse, roles: ['DIEU_PHOI', 'ADMIN'] },
    { id: 'xinhang',   ten: 'Đề nghị hàng',   Ic: IcCart,  roles: ['CH', 'DIEU_PHOI', 'ADMIN'] },
    { id: 'duyet',     ten: 'Điều phối',      Ic: IcCheck, roles: ['DIEU_PHOI', 'ADMIN'] },
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
    giamsat: GiamSat, chiamoi: ChiaHangMoi, dacbiet: DacBiet, online: TheoDoiOnline, vandon: VanDon, baocao: BaoCao, thamso: ThamSo }[tab]
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
    <Ctx.Provider value={{ user, baoToast, dangXuat }}>
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
            <ErrBound key={tab}><Screen /></ErrBound>
          </main>
        </div>
        {toast && <div className="toast" role="status">{toast}</div>}
      </div>
    </Ctx.Provider>
  );
}
