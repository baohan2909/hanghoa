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

  if (!user) return <Login onOk={(u) => { localStorage.setItem('nsflow_user', JSON.stringify(u)); setUser(u); }} />;

  const Screen = { dashboard: Dashboard, xinhang: XinHang, duyet: Duyet, kho: Kho, lich: Lich,
    giamsat: GiamSat, chiamoi: ChiaHangMoi, vandon: VanDon, baocao: BaoCao, thamso: ThamSo }[tab]
    || (user.vai_tro === 'KHO' ? Kho : XinHang);
  const tabDem = user.vai_tro === 'KHO' ? 'kho' : 'duyet';
  const chonTab = (id) => { setTab(id); setMoMenu(false); };

  const sidebar = (
    <aside className={'sidebar' + (moMenu ? ' open' : '')} aria-label="Menu">
      <div className="side-logo">
        <div className="t">ĐIỀU PHỐI HÀNG HÓA</div>
        <div className="s">Nón Sơn · đề nghị & điều chuyển</div>
      </div>
      {MENU.map((g) => {
        const items = g.items.filter((t) => t.roles.includes(user.vai_tro));
        if (!items.length) return null;
        return (
          <div key={g.nhom}>
            <div className="side-group">{g.nhom}</div>
            {items.map(({ id, ten, Ic }) => (
              <button key={id} className={'side-item' + (tab === id ? ' on' : '')} onClick={() => chonTab(id)}>
                <Ic /> {ten}
                {id === tabDem && choXuLy > 0 && <span className="badge-dot">{choXuLy}</span>}
              </button>
            ))}
          </div>
        );
      })}
      <div className="side-user">
        <div className="n">{user.ten}</div>
        <div className="r mono">{user.ma_dang_nhap} · {VAI_TRO_TEN[user.vai_tro] || user.vai_tro}</div>
        <button className="side-out" onClick={dangXuat}><IcOut style={{ verticalAlign: -3 }} /> Đăng xuất</button>
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
