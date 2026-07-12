import { useEffect, useState, createContext, useContext } from 'react';
import { sb } from './lib/supabase.js';
import { IcPulse, IcCart, IcCheck, IcSplit, IcTruck, IcGear, IcClock, IcBox } from './lib/icons.jsx';
import Login from './screens/Login.jsx';
import Dashboard from './screens/Dashboard.jsx';
import XinHang from './screens/XinHang.jsx';
import Duyet from './screens/Duyet.jsx';
import Kho from './screens/Kho.jsx';
import Lich from './screens/Lich.jsx';
import ChiaHangMoi from './screens/ChiaHangMoi.jsx';
import VanDon from './screens/VanDon.jsx';
import BaoCao from './screens/BaoCao.jsx';
import ThamSo from './screens/ThamSo.jsx';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

// Vai trò: CH (cửa hàng/trưởng ca) · DIEU_PHOI · KHO (kho tổng) · ADMIN
const TABS = [
  { id: 'dashboard', ten: 'Tổng quan',    Ic: IcPulse, roles: ['DIEU_PHOI', 'ADMIN'] },
  { id: 'xinhang',   ten: 'Đề nghị hàng', Ic: IcCart,  roles: ['CH', 'DIEU_PHOI', 'ADMIN'] },
  { id: 'duyet',     ten: 'Điều phối',    Ic: IcCheck, roles: ['DIEU_PHOI', 'ADMIN'] },
  { id: 'kho',       ten: 'Kho tổng',     Ic: IcBox,   roles: ['KHO', 'DIEU_PHOI', 'ADMIN'] },
  { id: 'lich',      ten: 'Lịch đề nghị', Ic: IcClock, roles: ['DIEU_PHOI', 'ADMIN'] },
  { id: 'chiamoi',   ten: 'Chia hàng mới', Ic: IcSplit, roles: ['DIEU_PHOI', 'ADMIN'] },
  { id: 'vandon',    ten: 'Vận đơn',      Ic: IcTruck, roles: ['CH', 'KHO', 'DIEU_PHOI', 'ADMIN'] },
  { id: 'baocao',    ten: 'Báo cáo',      Ic: IcClock, roles: ['DIEU_PHOI', 'ADMIN'] },
  { id: 'thamso',    ten: 'Tham số',      Ic: IcGear,  roles: ['ADMIN'] },
];

const TAB_MAC_DINH = { CH: 'xinhang', KHO: 'kho', DIEU_PHOI: 'dashboard', ADMIN: 'dashboard' };

export default function App() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('nsflow_user')); } catch { return null; }
  });
  const [tab, setTab] = useState('xinhang');
  const [toast, setToast] = useState('');
  const [choXuLy, setChoXuLy] = useState(0);

  const baoToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2600); };
  const dangXuat = () => { localStorage.removeItem('nsflow_user'); setUser(null); };

  useEffect(() => {
    if (!user) return;
    setTab(TAB_MAC_DINH[user.vai_tro] || 'dashboard');
    // Đếm việc cần xử lý theo vai trò: điều phối = phiếu vừa gửi; kho = chờ tiếp nhận
    const dem = async () => {
      if (user.vai_tro === 'KHO') {
        const { count } = await sb.from('don_xin_hang')
          .select('id', { count: 'exact', head: true }).eq('trang_thai', 'LEN_ODOO');
        setChoXuLy(count || 0);
      } else {
        const { count } = await sb.from('don_xin_hang')
          .select('id', { count: 'exact', head: true }).eq('trang_thai', 'GUI');
        setChoXuLy(count || 0);
      }
    };
    dem();
    const ch = sb.channel('don').on('postgres_changes',
      { event: '*', schema: 'chiahang', table: 'don_xin_hang' }, dem).subscribe();
    return () => sb.removeChannel(ch);
  }, [user]);

  if (!user) return <Login onOk={(u) => { localStorage.setItem('nsflow_user', JSON.stringify(u)); setUser(u); }} />;

  const tabs = TABS.filter((t) => t.roles.includes(user.vai_tro));
  const Screen = { dashboard: Dashboard, xinhang: XinHang, duyet: Duyet, kho: Kho, lich: Lich,
    chiamoi: ChiaHangMoi, vandon: VanDon, baocao: BaoCao, thamso: ThamSo }[tab]
    || (user.vai_tro === 'KHO' ? Kho : XinHang);
  const tabDem = user.vai_tro === 'KHO' ? 'kho' : 'duyet';

  return (
    <Ctx.Provider value={{ user, baoToast, dangXuat }}>
      <div className="shell">
        <nav className="topnav" aria-label="Điều hướng">
          {tabs.map(({ id, ten, Ic }) => (
            <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
              <Ic /> {ten}
              {id === tabDem && choXuLy > 0 && <span className="badge-dot">{choXuLy}</span>}
            </button>
          ))}
          <button style={{ marginLeft: 'auto' }} onClick={dangXuat}>
            {user.ten} · Thoát
          </button>
        </nav>
        <Screen />
        {toast && <div className="toast" role="status">{toast}</div>}
      </div>
    </Ctx.Provider>
  );
}
