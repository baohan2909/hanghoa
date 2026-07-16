import { useEffect, useState, createContext, useContext } from 'react';
import { sb } from './lib/supabase.js';
import { IcPulse, IcCart, IcCheck, IcSplit, IcTruck, IcGear, IcClock, IcBox, IcAlert, IcSearch, IcOut } from './lib/icons.jsx';
import Login from './screens/Login.jsx';
import Dashboard from './screens/Dashboard.jsx';
import XinHang from './screens/XinHang.jsx';
import Duyet from './screens/Duyet.jsx';
import Kho from './screens/Kho.jsx';
import Lich from './screens/Lich.jsx';
import GiamSat from './screens/GiamSat.jsx';
import ChiaHangMoi from './screens/ChiaHangMoi.jsx';
import DacBiet from './screens/DacBiet.jsx';
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
  { nhom: 'CẤU HÌNH', items: [
    { id: 'lich',      ten: 'Lịch đề nghị',   Ic: IcClock, roles: ['DIEU_PHOI', 'ADMIN'] },
    { id: 'chiamoi',   ten: 'Chia hàng mới',  Ic: IcSplit, roles: ['DIEU_PHOI', 'ADMIN'] },
    { id: 'dacbiet',   ten: 'Hàng đặc biệt', Ic: IcBox,   roles: ['DIEU_PHOI', 'ADMIN'] },
    { id: 'thamso',    ten: 'Tham số',        Ic: IcGear,  roles: ['ADMIN'] },
  ]},
];
const TAB_MAC_DINH = { CH: 'xinhang', KHO: 'kho', DIEU_PHOI: 'dashboard', ADMIN: 'dashboard' };
const VAI_TRO_TEN = { CH: 'Trưởng ca cửa hàng', KHO: 'Kho tổng', DIEU_PHOI: 'Điều phối', ADMIN: 'Quản trị' };

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
  const dangXuat = () => { localStorage.removeItem('nsflow_user'); setUser(null); };

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

  if (!user) return <Login onOk={(u) => { localStorage.setItem('nsflow_user', JSON.stringify(u)); setUser(u); }} />;

  const Screen = { dashboard: Dashboard, xinhang: XinHang, duyet: Duyet, kho: Kho, lich: Lich,
    giamsat: GiamSat, chiamoi: ChiaHangMoi, dacbiet: DacBiet, vandon: VanDon, baocao: BaoCao, thamso: ThamSo }[tab]
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
            <Screen />
          </main>
        </div>
        {toast && <div className="toast" role="status">{toast}</div>}
      </div>
    </Ctx.Provider>
  );
}
