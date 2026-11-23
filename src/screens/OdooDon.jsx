import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { sb } from '../lib/supabase.js';
import { useApp } from '../App.jsx';
import { Sel, DateBox, isoVN } from '../lib/ui.jsx';
import { IcRefresh, IcSearch, IcAlert, IcCheck, IcGuiLen, IcClock } from '../lib/icons.jsx';
import { useOdooCfg, moOdoo, huyOdoo, suaOdoo, layMoiOdoo } from '../lib/odoo.js';

const TaoDon = lazy(() => import('./TaoDon.jsx'));

// ============================================================================
// QUẢN LÝ ĐƠN ODOO (v3.116.0 — SQL 206)
//   Mọi đơn app tạo trên Odoo: tra cứu, timeline, đối chiếu app ↔ Odoo, xử lý (gửi lại / bỏ / yêu cầu huỷ – điều chỉnh).
//   v3.118.0: Huỷ đơn qua API Odoo; SỬA ĐƠN = huỷ đơn cũ + tạo đơn mới đã sửa (Odoo chưa có API sửa).
//   Đơn đã xuất kho: chỉ gửi Yêu cầu điều chỉnh cho kho. Tài khoản CỬA HÀNG: giao diện gọn (ẩn soạn đơn rời, tồn, dữ liệu kỹ thuật).
//   Dùng làm màn riêng (menu Đơn Odoo) và nhúng trong Phòng điều hành (prop nhung).
// NEW - 3.139 TRUNG TÂM ĐƠN HÀNG ODOO (SQL 231 · _fn_odoo_v2)
//   - Hiện MỌI phiếu Odoo: đơn app (chip APP) + phiếu tạo thẳng trên Odoo (chip ODOO, id âm = -transfer_id, chỉ xem).
//   - Thanh 7 bước theo dữ liệu thật: Tạo · Chờ duyệt · Chờ sẵn sàng · Xuất kho · Đang vận chuyển · Đã giao · Xác nhận nhận.
//     Bước thiếu dữ liệu ghi "chưa có dữ liệu", không tự suy ra.
//   - Đối soát 4 cột: App yêu cầu · Odoo yêu cầu (XKDC còn hiệu lực) · Đã xuất · Đã nhận; nhãn Khớp / Xuất thiếu / Xuất dư /
//     Vừa dư vừa thiếu / Chờ đối soát; "tạm" khi còn XKDC dở dang; "Kho sửa đơn" thay nhãn "Lệch app ↔ Odoo".
//   - Chi tiết 4 thẻ: Sản phẩm & đối soát · Phiếu kho (truy vết XKDC / NKDC huỷ – thay) · Vận chuyển (Gỡ / Ghép tay) · Lịch sử.
//   - Lọc "Đã giao, chưa nhận" xếp theo thời gian chờ (vàng > 24 giờ, hồng > 72 giờ).
// ============================================================================

const fmt = (n) => (n == null || n === '' ? '—' : Number(n).toLocaleString('vi'));
const gioNgay = (s) => (s ? new Date(s).toLocaleString('vi', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—');
const ngay = (s) => (s ? String(s).slice(8, 10) + '/' + String(s).slice(5, 7) : '—');
const truNgay = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return isoVN(d); };
// NEW - 3.139: "chờ 2 ngày 5 giờ"
// NEW - 3.139.5: chờ nhận tính theo NGÀY — ≤1 ngày xanh · 2–3 ngày vàng · 4–7 ngày hồng · trên 7 ngày hồng đỏ
const ngayCho = (h) => (h == null ? null : Math.max(1, Math.ceil(h / 24)));
const mauCho = (d) => (d <= 1 ? 'xanh' : d <= 3 ? 'vang' : d <= 7 ? 'do' : 'dodam');
function ChoNhan({ h }) {
  const d = ngayCho(h); if (d == null) return null;
  return <span className={'odn-chip ' + mauCho(d)} title="Đơn vị vận chuyển đã giao, nơi nhận chưa xác nhận nhận trên Odoo">Chưa nhận {d} ngày</span>;
}

export const TT_GUI = {
  thanh_cong: ['Odoo đã nhận', 'ok'], loi: ['Gửi lỗi', 'do'], can_xem: ['Cần xem phản hồi', 'vang'],
  dang_gui: ['Đang gửi', 'xanh'], da_bo: ['Đã bỏ', 'xam'],
};
export const BUOC = {
  2: 'Chưa vào Odoo', 3: 'Odoo đã nhận', 4: 'Chờ duyệt', 5: 'Đã duyệt · chờ xuất', 6: 'Xuất kho · đang giao', 7: 'Cửa hàng đã nhận', '-1': 'Huỷ / từ chối',
};
export const CANH = {
  loi: ['Gửi lỗi', 'do', 'Odoo không tạo được đơn. Đọc lỗi bên dưới, sửa dữ liệu (mã hàng, kho) rồi bấm Gửi lại — tên đơn giữ nguyên nên không tạo trùng. Không cần gửi nữa thì bấm Bỏ đơn.'],
  can_xem: ['Phản hồi chưa rõ', 'vang', 'Odoo trả kết quả không nói rõ thành công hay lỗi. Tra trên Odoo bằng tên đơn trước khi gửi lại.'],
  treo: ['Treo khi gửi', 'do', 'Đã gửi quá 2 phút mà chưa ghi được kết quả (mất kết nối giữa chừng). Tra trên Odoo bằng tên đơn; chưa có thì Gửi lại.'],
  chua_thay: ['Chưa thấy trên Odoo', 'vang', 'Odoo báo đã tạo nhưng app chưa đọc được phiếu này từ Odoo. Bấm Lấy mới từ Odoo; vẫn không có thì tra trên Odoo bằng tên đơn.'],
  cho_duyet_lau: ['Chờ duyệt quá 1 ngày', 'vang', 'Phiếu nằm ở bước chờ duyệt trên Odoo quá 1 ngày — nhắc người duyệt.'],
  cho_xuat_lau: ['Chờ xuất quá 2 ngày', 'vang', 'Đã duyệt nhưng kho chưa xuất sau 2 ngày — liên hệ kho cung ứng.'],
  di_duong_lau: ['Đi đường quá 3 ngày', 'vang', 'Kho đã xuất hơn 3 ngày mà chưa thấy giao thành công hay xác nhận nhận — kiểm tra vận chuyển, nhắc nơi nhận xác nhận trên Odoo.'],
  lech: ['Kho sửa đơn', 'vang', 'Odoo yêu cầu khác số app gửi — xem bảng đối soát.'],
  trung: ['Giống đơn khác', 'xam', 'Nội dung giống hệt một đơn đã tạo trong 48 giờ — người gửi đã xác nhận vẫn gửi.'],
  yeu_cau: ['Có yêu cầu chờ', 'xanh', 'Đang chờ kho / điều phối xử lý yêu cầu huỷ hoặc điều chỉnh trên Odoo.'],
  giu_nhap: ['Odoo giữ nháp', 'vang', 'Odoo tạo đơn nhưng KHÔNG tự duyệt (thường do kho thiếu hàng lúc tạo) — đơn nằm ở nháp, chưa trừ tồn khả dụng. Kho kiểm tra tồn rồi duyệt trên Odoo, hoặc huỷ đơn.'],
  huy_loi: ['Huỷ / xoá lỗi', 'do', 'Lệnh huỷ / xoá gửi Odoo bị từ chối — đọc lý do trong nhật ký. Đơn trên Odoo KHÔNG đổi.'],
  huy_treo: ['Lệnh huỷ treo', 'do', 'Đã gửi lệnh huỷ / xoá quá 2 phút chưa có kết quả — tra trên Odoo trước khi gửi lại.'],
  xuat_thieu: ['Kho xuất thiếu', 'do', 'Kho đã xuất ít hơn Odoo yêu cầu — xem cột Đã xuất từng mã.'],
  nhan_thieu: ['Nhận thiếu', 'do', 'Phiếu nhập đã xong nhưng nơi nhận xác nhận ít hơn số kho đã xuất — kiểm tra hàng thất lạc / nhận sót.'],
  // NEW - 3.139: vận chuyển
  giao_chua_nhan: ['Đã giao, chưa nhận > 24 giờ', 'vang', 'Đơn vị vận chuyển báo giao thành công hơn 24 giờ mà nơi nhận chưa xác nhận nhận trên Odoo — nhắc nhận hàng.'],
  giao_qua_72: ['Đã giao, chưa nhận > 72 giờ', 'do', 'Đã giao hơn 72 giờ mà nơi nhận chưa xác nhận trên Odoo — kiểm tra hàng, nhắc cửa hàng / đội nhận ngay.'],
  vc_bat_thuong: ['Giao bất thường', 'do', 'Vận đơn gặp sự cố, chậm giao hoặc trả hàng — xem thẻ Vận chuyển.'],
};
const TT_PK = { draft: 'Nháp', waiting: 'Chờ hàng', confirmed: 'Chờ hàng', assigned: 'Sẵn sàng', done: 'Xong', cancel: 'Huỷ' };
const NHOM_VD = { CHO_LAY: 'Chờ lấy', DANG_CHAY: 'Đang giao', GIAO_XONG: 'Đã giao', SU_CO: 'Sự cố', TRA_HANG: 'Trả hàng', HUY: 'Đã huỷ' };
const MAN = { sua_don: 'Sửa đơn', tao_don: 'Tạo đơn trực tiếp', de_nghi: 'Đề nghị hàng', chia_moi: 'Chia hàng mới', dieu_phoi: 'Yêu cầu ĐP', doi_sale: 'Đội Sale', ds_ban_chia: 'Bàn chia đội' };
// NEW - 3.139
const B7_TEN = ['Tạo đơn', 'Chờ duyệt', 'Chờ sẵn sàng', 'Xuất kho', 'Đang vận chuyển', 'Đã giao', 'Xác nhận nhận'];
const TRANG = { 1: 'Chờ duyệt', 2: 'Chờ sẵn sàng', 4: 'Đã xuất kho', 5: 'Đang vận chuyển', 6: 'Đã giao – chờ xác nhận', 7: 'Đã nhận' };
const DC = {
  khop: ['Khớp số lượng', 'ok'], xuat_thieu: ['Kho xuất thiếu', 'do'], xuat_du: ['Kho xuất dư', 'duong'],
  vua_du_vua_thieu: ['Vừa dư vừa thiếu', 'cam'], cho_doi_soat: ['Chờ đối soát', 'xam'], huy: ['Đã huỷ', 'xam'],
};
const VC = {
  cho_lay: ['Chờ GHTK lấy hàng', 'xam'], dang_vc: ['Đang vận chuyển', 'xanh'], da_giao: ['Đã giao – chờ xác nhận', 'vang'],
  da_nhan: ['Đã xác nhận nhận', 'ok'], bat_thuong: ['Giao bất thường', 'do'],
};
const DO_TIN = { CAO: ['ghép tự động', 'xanh'], TRUNG: ['ghép tự động, cần xác nhận', 'vang'], TAY: ['ghép tay', 'ok'] };
// Ô chỉ số (bấm = lọc)
const KPI = [
  ['', 'Tất cả', 'tong'], ['can_xu_ly', 'Cần xử lý', null, 'canh'], ['cho_duyet', 'Chờ duyệt'], ['cho_xuat', 'Chờ xuất kho'],
  ['dang_vc', 'Đang vận chuyển'], ['da_giao_cho_nhan', 'Đã giao, chưa nhận', null, 'vang'], ['xuat_lech', 'Xuất thiếu / dư', null, 'do'], ['huy', 'Huỷ'],
];
// NEW - 3.139.5: phễu lọc theo cột (lọc ở máy chủ — fn_odoo_don_ds 'cot', số phiếu từng giá trị trả về trong 'mat')
const NHAN_MAT = {
  nguon: { APP: 'APP — app tạo', ODOO: 'ODOO — tạo trên Odoo' },
  loai: { DK: 'DK — đề nghị hàng', KC: 'KC — khẩn cấp', HM: 'HM — hàng mới', DSC: 'DSC — đội sale', DS: 'DS — đội sale', DSK: 'DSK — đội sale',
    DP: 'DP — điều phối', PDCK: 'PDCK — điều chuyển khác' },
  buoc: { gui: 'Chờ Odoo nhận', loi: 'Gửi lỗi', 1: 'Chờ duyệt', 2: 'Chờ sẵn sàng', 4: 'Đã xuất kho', 5: 'Đang vận chuyển', 6: 'Đã giao – chờ xác nhận',
    '7p': 'Nhận một phần', 7: 'Đã nhận', huy: 'Đã huỷ' },
  vc: { cho_lay: 'Chờ GHTK lấy hàng', dang_vc: 'Đang vận chuyển', da_giao: 'Đã giao – chờ xác nhận', da_nhan: 'Đã xác nhận nhận',
    bat_thuong: 'Giao bất thường', khong: 'Chưa có vận đơn' },
  nhanh: { chua_xuat: 'Chưa xuất', chua_nhan: 'Đã xuất, chưa nhận', nhan_1p: 'Nhận một phần', nhan_du: 'Đã nhận đủ' },
  dc: { khop: 'Khớp số lượng', xuat_thieu: 'Kho xuất thiếu', xuat_du: 'Kho xuất dư', vua_du_vua_thieu: 'Vừa dư vừa thiếu', cho_doi_soat: 'Chờ đối soát',
    huy: 'Đã huỷ', chua_len: 'Chưa lên Odoo', kho_sua: 'Kho sửa đơn', nhan_thieu: 'Nhận thiếu', tam: 'Tạm tính (còn XKDC dở)' },
  canh: { cn_1: 'Chưa nhận 1 ngày', cn_3: 'Chưa nhận 2–3 ngày', cn_7: 'Chưa nhận 4–7 ngày', cn_8: 'Chưa nhận trên 7 ngày', khong: 'Không cảnh báo' },
};
const THU_MAT = { buoc: ['gui', 'loi', '1', '2', '4', '5', '6', '7p', '7', 'huy'], vc: ['cho_lay', 'dang_vc', 'da_giao', 'bat_thuong', 'da_nhan', 'khong'],
  nhanh: ['chua_xuat', 'chua_nhan', 'nhan_1p', 'nhan_du'], dc: ['khop', 'xuat_thieu', 'xuat_du', 'vua_du_vua_thieu', 'cho_doi_soat', 'kho_sua', 'nhan_thieu', 'tam', 'chua_len', 'huy'],
  canh: ['cn_8', 'cn_7', 'cn_3', 'cn_1'] };
// mỗi cột: những nhóm giá trị lọc được
const PHEU = {
  don: [['nguon', 'Nguồn đơn'], ['loai', 'Loại phiếu']],
  noi: [['xuat', 'Nơi xuất', true], ['nhan', 'Nơi nhận', true]],
  buoc: [['buoc', 'Bước hiện tại'], ['vc', 'Vận chuyển']],
  sl: [['nhanh', 'Tình trạng xuất / nhận']],
  dc: [['dc', 'Kết quả đối soát']],
  canh: [['canh', 'Cảnh báo']],
};
const nhanMat = (d, k, t) => (d === 'canh' && CANH[k] ? CANH[k][0] : NHAN_MAT[d]?.[k] || (t ? `${k} · ${t}` : k));

// trạng thái chữ của 1 phiếu
function trangThai(r) {
  const b = r.b7 || [];
  if (r.dc === 'huy') return r.odoo_ct && r.odoo_ct !== 'Bị hủy' ? r.odoo_ct : 'Đã huỷ';
  if (b[1] === 4) return TT_GUI[r.trang_thai]?.[0] || 'Gửi lỗi';
  if (r.nguon === 'APP' && !r.state) return r.trang_thai === 'dang_gui' ? 'Đang gửi Odoo' : 'Chờ Odoo nhận';
  if (r.buoc7 === 7 && b[6] === 1) return 'Nhận một phần';
  return TRANG[r.buoc7] || B7_TEN[(r.buoc7 || 1) - 1];
}

export default function OdooDon({ nhung = false, locDau = null }) {
  const { user, baoToast } = useApp();
  const odoo = useOdooCfg(user);
  const laCH = user.vai_tro === 'CH';
  const [loc, setLoc] = useState(() => ({
    tu: truNgay(29), den: isoVN(), nguoi: '', kho: '', man: '', nguon: '', buoc: '', dc: '', vc: '',
    nhom: typeof locDau === 'string' ? locDau : '', ...(locDau && typeof locDau === 'object' ? locDau : {}),
  }));
  const [q, setQ] = useState('');
  const [qTre, setQTre] = useState('');
  const [tq, setTq] = useState(null);
  const [ds, setDs] = useState(null);
  const [loi, setLoi] = useState('');
  const [dangTai, setDangTai] = useState(false);
  const [chon, setChon] = useState(null);     // id phiếu đang mở (âm = phiếu tạo trên Odoo)
  const [sap, setSap] = useState({ k: 'ngay', d: -1 });
  const [tao, setTao] = useState(false);
  const [cot, setCot] = useState({});           // NEW - 3.139.5: phễu lọc theo cột { khoá: [giá trị đã chọn] }
  const hen = useRef(null);
  useEffect(() => { clearTimeout(hen.current); hen.current = setTimeout(() => setQTre(q.trim()), 350); return () => clearTimeout(hen.current); }, [q]);

  const base = useMemo(() => ({ tu: loc.tu, den: loc.den, nguoi: loc.nguoi, kho: loc.kho, man: loc.man, nguon: loc.nguon }),
    [loc.tu, loc.den, loc.nguoi, loc.kho, loc.man, loc.nguon]);
  const cotGui = useMemo(() => Object.fromEntries(Object.entries(cot).filter(([, v]) => Array.isArray(v))), [cot]);
  // NEW - 3.139: ô số chỉ tải lại khi đổi bộ lọc gốc; danh sách tải lại khi đổi mọi bộ lọc
  const taiTq = useCallback(async () => {
    const { data, error } = await sb.rpc('fn_odoo_tong_quan', { p_token: user.token, p_loc: base });
    if (error) { setLoi(error.message); return; }
    setTq(data);
  }, [user.token, base]);
  const taiDs = useCallback(async () => {
    setDangTai(true); setLoi('');
    const { data, error } = await sb.rpc('fn_odoo_don_ds', {
      p_token: user.token,
      p_loc: { ...base, nhom: loc.nhom, q: qTre, buoc: loc.buoc, dc: loc.dc, vc: loc.vc, sap: sap.k === 'cho_gio' ? 'cho' : '', cot: cotGui },
    });
    setDangTai(false);
    if (error) { setLoi(error.message); return; }
    setDs(data);
  }, [user.token, base, loc.nhom, loc.buoc, loc.dc, loc.vc, qTre, sap.k, cotGui]);
  useEffect(() => { taiTq(); }, [taiTq]);
  useEffect(() => { taiDs(); }, [taiDs]);
  const tai = useCallback(() => { taiTq(); taiDs(); }, [taiTq, taiDs]);

  const lamMoi = async () => {
    setDangTai(true);
    // hỏi thẳng Odoo các phiếu đang chạy trên màn hình (tối đa 50), rồi đối chiếu lại
    const dangChay = (ds?.rows || []).filter((r) => r.state && r.dc !== 'huy' && (r.b7 || [])[6] !== 2).map((r) => r.name).slice(0, 50);
    const k = dangChay.length ? await layMoiOdoo(user.token, dangChay) : null;
    const { error } = await sb.rpc('fn_odoo_lam_moi', { p_token: user.token });
    if (error) { setDangTai(false); baoToast('Không làm mới được: ' + error.message); return; }
    tai();
    baoToast(k && !k.ok ? 'Đã đối chiếu lại — ' + k.loi : `Đã lấy mới từ Odoo${k ? ` ${dangChay.length} phiếu đang chạy` : ''}${k?.so_doi ? ` · ${k.so_doi} phiếu đổi trạng thái` : ''}`);
  };

  const rows = useMemo(() => {
    const a = [...(ds?.rows || [])];
    const g = {
      ngay: (r) => r.ngay || '', sl: (r) => r.sl_odoo ?? r.tong_sl ?? 0, buoc7: (r) => (r.dc === 'huy' ? -1 : r.buoc7 ?? 0), name: (r) => r.name,
      kho_yeu_cau: (r) => r.ten_yeu_cau || r.kho_yeu_cau || '', cho_gio: (r) => r.cho_gio ?? -1,
    }[sap.k];
    a.sort((x, y) => { const p = g(x), q2 = g(y); return (p < q2 ? -1 : p > q2 ? 1 : 0) * sap.d; });
    return a;
  }, [ds, sap]);
  const bamCot = (k) => setSap((s) => (s.k === k ? { k, d: -s.d } : { k, d: k === 'name' || k === 'kho_yeu_cau' ? 1 : -1 }));
  const mt = (k) => (sap.k === k ? (sap.d === 1 ? ' ▲' : ' ▼') : '');
  const dem = tq?.dem || {};
  const coLoc = loc.nguoi || loc.kho || loc.man || loc.nhom || loc.nguon || loc.buoc || loc.dc || loc.vc || q || Object.keys(cotGui).length > 0;
  const dongBo = ds?.dong_bo || tq?.dong_bo;
  const datLoc = (k) => (v) => setLoc((l) => ({ ...l, [k]: v }));

  const noiDung = (
    <div className={'odn' + (nhung ? ' nhung' : '')}>
      {/* Đồng bộ + khả năng API */}
      <div className="odn-dong-bo">
        <span className="odn-db-i"><IcClock /> Dữ liệu Odoo cập nhật <b>{dongBo?.dck_luc ? gioNgay(dongBo.dck_luc) : '—'}</b>
          <em>lấy thẳng từ Odoo vài phút/lần — bấm Làm mới để lấy ngay</em></span>
        {!laCH && <span className="odn-api">
          <i className="ok">Tạo đơn qua API</i><i className="ok">Xuất / nhận lấy thẳng từ Odoo</i>
          <i className={tq?.huy_api?.huy_bat ? 'ok' : 'cho'}>{tq?.huy_api?.huy_bat ? 'Huỷ / sửa qua API: đã bật' : 'Huỷ qua API: chờ IT bật'}</i>
        </span>}
        <button className="odn-nut-phu" onClick={lamMoi} disabled={dangTai}><IcRefresh /> Làm mới</button>
      </div>

      {/* Ô chỉ số — bấm để lọc */}
      <div className="odn-kpi">
        {KPI.map(([k, t, dac, mau]) => {
          const so = dac === 'tong' ? tq?.tong : dem[k] || 0;
          return (
            <button key={k || 'tat'} className={'odn-k' + (loc.nhom === k ? ' on' : '') + (mau && so > 0 ? ' ' + mau : '')}
              onClick={() => setLoc((l) => ({ ...l, nhom: l.nhom === k ? '' : k }))}>
              <b>{tq ? fmt(so) : '…'}</b><span>{t}</span>
              {k === 'da_giao_cho_nhan' && tq?.giao_cho?.tong > 0 && <em>{fmt(tq.giao_cho.qua_3n || 0)} quá 3 ngày · {fmt(tq.giao_cho.qua_7n || 0)} quá 7 ngày</em>}
              {k === '' && tq && <em>{fmt(tq.tong_app)} đơn app · {fmt((tq.tong || 0) - (tq.tong_app || 0))} tạo trên Odoo</em>}
            </button>
          );
        })}
      </div>

      {/* Bộ lọc */}
      <div className="odn-loc">
        <label className="odn-tim"><IcSearch />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mã đơn, mã XKDC / NKDC, mã vận đơn, cửa hàng, mã hàng, ghi chú…" /></label>
        <DateBox label="Từ" value={loc.tu} onChange={datLoc('tu')} />
        <DateBox label="Đến" value={loc.den} onChange={datLoc('den')} />
        {!laCH && <>
          <Sel value={loc.nguoi} onChange={datLoc('nguoi')} placeholder="Người gửi"
            options={[{ value: '', label: 'Mọi người gửi' }, ...(tq?.nguoi || []).map((k) => ({ value: k, label: k }))]} />
          <Sel value={loc.man} onChange={datLoc('man')} placeholder="Màn tạo đơn"
            options={[{ value: '', label: 'Mọi màn tạo đơn' }, ...Object.entries(MAN).map(([k, t]) => ({ value: k, label: t }))]} />
        </>}
        {coLoc && <button className="odn-nut-phu" onClick={() => { setQ(''); setCot({}); setLoc((l) => ({ ...l, nguoi: '', kho: '', man: '', nhom: '', nguon: '', buoc: '', dc: '', vc: '' })); }}>Bỏ lọc</button>}
        {!laCH && <button className="btn btn-ai odn-nut-chinh odn-tao" onClick={() => setTao(true)} title={odoo ? 'Tạo đơn điều chuyển mới' : 'Soạn đơn — tài khoản chưa mở gửi Odoo thì xuất Excel'}>
          <IcGuiLen /> Tạo đơn mới</button>}
      </div>
      {ds?.tim_moi_ngay && <div className="odn-phu odn-tim-ghi">Đang tìm trên mọi ngày (bỏ qua khoảng ngày) vì có từ khoá.</div>}

      {loi && <div className="odn-bao do"><IcAlert /> Không tải được: {loi} <button onClick={tai}>Thử lại</button></div>}

      {/* Danh sách — mỗi dòng 6 thông tin */}
      <div className="odn-bang-khung">
        <table className="odn-bang">
          <thead><tr>
            {[['don', 'Đơn', 'name'], ['noi', 'Từ → đến', 'kho_yeu_cau'], ['buoc', 'Bước', 'buoc7'], ['sl', 'Xuất / yêu cầu', 'sl', 'so'],
              ['dc', 'Đối soát', null], ['canh', 'Cảnh báo', 'cho_gio']].map(([c, ten, ks, cls]) => (
              <ThPheu key={c} c={c} ten={ten} cls={cls} sapTen={ks ? mt(ks) : ''} onSap={ks ? () => bamCot(ks) : null}
                mat={ds?.mat} cot={cot} setCot={setCot} />
            ))}
          </tr></thead>
          <tbody>
            {ds == null ? <tr><td colSpan={6} className="odn-trong">Đang tải phiếu…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={6} className="odn-trong">{coLoc ? 'Không có phiếu khớp bộ lọc.' : 'Chưa có phiếu Odoo nào trong khoảng ngày này.'}</td></tr>
              : rows.map((r) => (
                <tr key={r.id} className={chon === r.id ? 'on' : ''} onClick={() => setChon(r.id)}>
                  <td><div className="odn-ten"><Nguon n={r.nguon} />{r.name}</div>
                    <div className="odn-phu">{gioNgay(r.ngay)} · {r.nguon === 'APP' ? (MAN[r.man] || r.man || 'App') + (r.nguoi_gui ? ' · ' + r.nguoi_gui : '') : 'tạo trên Odoo'}</div>
                    {r.ghi_chu && <div className="odn-gc-dong" title={r.ghi_chu}>✎ {r.ghi_chu}</div>}</td>
                  <td><div className="odn-ten nho">{r.kho_cung_ung} → {r.kho_yeu_cau}</div><div className="odn-phu">{r.ten_yeu_cau || ''}</div></td>
                  <td><Buoc7 r={r} /></td>
                  <td className="so"><b>{r.sl_xuat != null ? fmt(r.sl_xuat) : '—'}</b> / {fmt(r.sl_odoo ?? r.tong_sl)}
                    {/* 3.139.3: dòng phụ theo số lượng (không theo số dòng) */}
                    {r.sl_nhan > 0 && <div className="odn-phu">đã nhận {fmt(r.sl_nhan)}</div>}</td>
                  <td><DcChip r={r} /></td>
                  <td>{(() => {
                    const ds2 = (r.canh || []).filter((c) => CANH[c] && c !== 'giao_chua_nhan' && c !== 'giao_qua_72');
                    const cho = r.vc === 'da_giao' && r.cho_gio != null;
                    return ds2.length || cho
                      ? <div className="odn-chips">{cho && <ChoNhan h={r.cho_gio} />}{ds2.map((c) => <Chip key={c} k={c} />)}</div>
                      : <span className="odn-phu">—</span>;
                  })()}</td>
                </tr>
              ))}
          </tbody>
        </table>
        {ds && ds.tong > rows.length && <div className="odn-phu odn-chan-bang">Đang hiện {rows.length}/{fmt(ds.tong)} phiếu mới nhất — thu hẹp bộ lọc để xem phiếu cũ hơn.</div>}
      </div>

      {tq?.theo_ngay?.length > 0 && <BieuDoNgay ds={tq.theo_ngay} />}

      {chon && <NganChiTiet key={chon} id={chon} dong={() => setChon(null)} odoo={odoo} saiXong={tai} moDon={setChon} />}
      {tao && <Suspense fallback={null}><TaoDon onDong={() => setTao(false)} onXong={tai} /></Suspense>}
    </div>
  );

  if (nhung) return noiDung;
  return (
    <>
      <div className="cmdbar">
        <h1>Đơn hàng Odoo</h1>
        <div className="sub">{laCH ? 'Phiếu điều chuyển về / đi từ cửa hàng — theo dõi 7 bước, đối soát xuất / nhận, vận chuyển. Tạo đơn mới ở màn Đề nghị hàng.'
          : 'Mọi phiếu điều chuyển trên Odoo (đơn app tạo + phiếu tạo thẳng trên Odoo) — theo dõi 7 bước, đối soát xuất / nhận, vận chuyển, xử lý sự cố.'}</div>
      </div>
      {noiDung}
    </>
  );
}

// NEW - 3.139.5: ô tiêu đề có phễu lọc (giống phễu bảng chia hàng: bấm tên = sắp xếp, bấm phễu = hộp chọn giá trị)
const IcPheu = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 4.5h18l-7 8.2v6l-4 1.8v-7.8z" /></svg>);
function ThPheu({ c, ten, cls, sapTen, onSap, mat, cot, setCot }) {
  const [mo, setMo] = useState(false);
  const ref = useRef(null);
  const nhom = PHEU[c];
  const dangLoc = nhom.some(([d]) => Array.isArray(cot[d]));
  return (
    <th ref={ref} className={(cls || '') + ' lc-th lc-trai' + (dangLoc ? ' lc-co-loc' : '') + (sapTen ? ' lc-co-sap' : '')}>
      <div className="lc-o">
        {onSap ? <button type="button" className="lc-ten" onClick={onSap} title="Bấm để sắp xếp"><span>{ten}</span>{sapTen && <i className="lc-mui">{sapTen.trim()}</i>}</button>
          : <span className="lc-ten"><span>{ten}</span></span>}
        <button type="button" className={'lc-pheu' + (dangLoc ? ' on' : '')} aria-label={'Lọc cột ' + ten} title={dangLoc ? 'Đang lọc cột này' : 'Lọc cột này'}
          onClick={(e) => { e.stopPropagation(); setMo((v) => !v); }}><IcPheu /></button>
      </div>
      {mo && <HopPheu neo={ref} ten={ten} nhom={nhom} mat={mat} cot={cot} setCot={setCot} onDong={() => setMo(false)} />}
    </th>
  );
}
function HopPheu({ neo, ten, nhom, mat, cot, setCot, onDong }) {
  const hop = useRef(null);
  const [vt, setVt] = useState(null);
  const [tim, setTim] = useState({});
  useLayoutEffect(() => {
    const dat = () => {
      const r = neo.current?.getBoundingClientRect(); if (!r) return;
      const vw = window.innerWidth, vh = window.innerHeight;
      const W = Math.min(300, vw - 16);
      const left = Math.max(8, Math.min(r.left, vw - W - 8));
      const duoi = vh - r.bottom - 12;
      const top = duoi >= 260 ? r.bottom + 4 : Math.max(8, r.top - Math.min(460, vh - 24) - 4);
      setVt({ left, top, W, maxH: duoi >= 260 ? duoi : Math.min(460, r.top - 12) });
    };
    dat();
    const theo = (e) => { if (hop.current && hop.current.contains(e.target)) return; dat(); };
    window.addEventListener('resize', theo); window.addEventListener('scroll', theo, true);
    return () => { window.removeEventListener('resize', theo); window.removeEventListener('scroll', theo, true); };
  }, [neo]);
  useEffect(() => {
    const ngoai = (e) => { if (hop.current && !hop.current.contains(e.target) && !neo.current?.contains(e.target)) onDong(); };
    const esc = (e) => { if (e.key === 'Escape') onDong(); };
    document.addEventListener('mousedown', ngoai); document.addEventListener('touchstart', ngoai, { passive: true }); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', ngoai); document.removeEventListener('touchstart', ngoai); document.removeEventListener('keydown', esc); };
  }, [onDong, neo]);
  if (!vt) return null;
  const ghi = (d, arr) => setCot((o) => { const n = { ...o }; if (arr == null) delete n[d]; else n[d] = arr; return n; });
  return createPortal(
    <div ref={hop} className="lc-hop" role="dialog" aria-label={'Lọc ' + ten} style={{ left: vt.left, top: vt.top, width: vt.W, maxHeight: vt.maxH }}
      onMouseDown={(e) => e.stopPropagation()}>
      <div className="lc-hop-dau"><b>Lọc cột {ten}</b><button type="button" className="lc-x" onClick={onDong} aria-label="Đóng">×</button></div>
      {nhom.map(([d, tieu, coTim]) => {
        const thu = THU_MAT[d];
        let ds = [...(mat?.[d] || [])];
        if (thu) ds.sort((a, b) => (thu.indexOf(a.k) + 1 || 99) - (thu.indexOf(b.k) + 1 || 99));
        (cot[d] || []).forEach((k) => { if (!ds.some((x) => x.k === k)) ds.push({ k, n: 0 }); });   // giá trị đang chọn nhưng hết phiếu
        const q = (tim[d] || '').trim().toLowerCase();
        const hien = q ? ds.filter((x) => nhanMat(d, x.k, x.t).toLowerCase().includes(q)) : ds;
        const chon = Array.isArray(cot[d]) ? new Set(cot[d]) : null;
        const co = (k) => (chon ? chon.has(k) : true);
        const bat = (k) => {
          const cur = chon ? [...chon] : ds.map((x) => x.k);
          const moi = co(k) ? cur.filter((x) => x !== k) : [...cur, k];
          ghi(d, moi.length === ds.length && ds.every((x) => moi.includes(x.k)) ? null : moi);
        };
        return (
          <div key={d}>
            <div className="lc-muc lc-muc-ds"><span>{tieu}</span>
              <button type="button" onClick={() => ghi(d, null)}>Chọn hết</button>
              <button type="button" onClick={() => ghi(d, [])}>Bỏ hết</button></div>
            {coTim && ds.length > 8 && <input className="lc-inp lc-tim" value={tim[d] || ''} placeholder={`Tìm trong ${ds.length} mã…`}
              onChange={(e) => setTim((o) => ({ ...o, [d]: e.target.value }))} />}
            <div className="lc-ds">
              {!mat && <div className="lc-ghi">Đang tải…</div>}
              {hien.map((x) => (
                <label key={x.k} className="lc-ds-dong">
                  <input type="checkbox" checked={co(x.k)} onChange={() => bat(x.k)} />
                  <span className="lc-ds-v">{nhanMat(d, x.k, x.t)}</span><em>{fmt(x.n)}</em>
                </label>
              ))}
            </div>
          </div>
        );
      })}
      <div className="lc-cuoi">
        <button type="button" className="lc-xoa" disabled={!nhom.some(([d]) => Array.isArray(cot[d]))} onClick={() => nhom.forEach(([d]) => ghi(d, null))}>Xoá lọc cột</button>
        <button type="button" className="lc-xong" onClick={onDong}>Xong</button>
      </div>
    </div>,
    document.body,
  );
}

function Chip({ k }) {
  const c = CANH[k]; if (!c) return null;
  return <span className={'odn-chip ' + c[1]} title={c[2]}>{c[0]}</span>;
}
// NEW - 3.139: chip nguồn đơn
function Nguon({ n }) {
  return <i className={'odn-ng ' + (n === 'APP' ? 'app' : 'odoo')} title={n === 'APP' ? 'Đơn app tạo' : 'Phiếu tạo thẳng trên Odoo'}>{n}</i>;
}
// NEW - 3.139: thanh 7 bước (0 chưa tới · 1 đang · 2 xong · 3 chưa có dữ liệu · 4 lỗi gửi · 5 huỷ)
function Buoc7({ r }) {
  const b = r.b7 || [];
  return (
    <div className={'odn-tt' + (r.dc === 'huy' ? ' huy' : '') + (b[1] === 4 ? ' loi7' : '')}>
      <div className="odn-tt-doi">{B7_TEN.map((t, i) => <i key={i} className={'b' + (b[i] ?? 0)} title={t + ({ 2: ': xong', 1: ': đang ở bước này', 3: ': chưa có dữ liệu', 4: ': lỗi', 5: ': huỷ' }[b[i]] || '')} />)}</div>
      <span>{trangThai(r)}</span>
    </div>
  );
}
// NEW - 3.139: chip đối soát + nhãn phụ
function DcChip({ r }) {
  const d = DC[r.dc];
  if (!d) return <span className="odn-phu">{r.nguon === 'APP' && !r.state ? 'chưa lên Odoo' : '—'}</span>;
  const c = r.dc_chi || {};
  // 3.139.5: không ghi dấu −/+ (khó hiểu) — ghi số mã và số cái
  const chi = r.dc === 'vua_du_vua_thieu' ? `dư ${c.n_du} mã (${fmt(c.sl_du)} cái) · thiếu ${c.n_thieu} mã (${fmt(c.sl_thieu)} cái)`
    : r.dc === 'xuat_thieu' ? `thiếu ${c.n_thieu} mã (${fmt(c.sl_thieu)} cái)` : r.dc === 'xuat_du' ? `dư ${c.n_du} mã (${fmt(c.sl_du)} cái)` : '';
  return (
    <div className="odn-chips">
      <span className={'odn-chip ' + d[1] + (r.dc_tam ? ' tam' : '')} title={r.dc_tam ? 'Tạm tính — còn phiếu xuất dở dang, số sẽ đổi khi kho xuất tiếp' : ''}>{d[0]}{r.dc_tam ? ' · tạm' : ''}</span>
      {r.kho_sua && <span className="odn-chip vang" title="Odoo yêu cầu khác số app gửi — kho đã sửa đơn trước khi xuất">Kho sửa đơn</span>}
      {r.nhan_thieu && <span className="odn-chip do" title="Đã nhận ít hơn đã xuất">Nhận thiếu</span>}
      {chi && <em className="odn-dc-chi">{chi}</em>}
    </div>
  );
}

function BieuDoNgay({ ds }) {
  const max = Math.max(1, ...ds.map((d) => d.tong));
  return (
    <div className="odn-bd">
      <div className="odn-bd-dau"><b>Phiếu tạo theo ngày</b><span><i className="ok" /> Đơn app <i className="odoo" /> Tạo trên Odoo <i className="do" /> Gửi lỗi</span></div>
      <div className="odn-bd-cot">
        {ds.map((d) => (
          <div key={d.ngay} className="odn-bd-c" title={`${ngay(d.ngay)}: ${d.tong} phiếu · ${d.app} đơn app · ${d.hoan_tat} đã nhận · ${d.loi} gửi lỗi`}>
            <div className="odn-bd-thanh odoo" style={{ height: (d.tong / max) * 100 + '%' }}>
              {d.app > 0 && <i className="ok" style={{ height: (d.app / d.tong) * 100 + '%' }} />}
              {d.loi > 0 && <i className="do" style={{ height: (d.loi / d.tong) * 100 + '%' }} />}
            </div>
            <span>{Number(String(d.ngay).slice(8, 10))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================= Ngăn chi tiết 1 phiếu ================= */
export function NganChiTiet({ id, dong, odoo, saiXong, moDon }) {
  const { user, baoToast } = useApp();
  const laCH = user.vai_tro === 'CH';
  const [sua, setSua] = useState(false);
  const [ct, setCt] = useState(null);
  const [loi, setLoi] = useState('');
  const [hop, setHop] = useState(null);       // {loai, tieu_de}
  const [nd, setNd] = useState('');
  const [gui, setGui] = useState(false);
  const [layMoi, setLayMoi] = useState(false);
  const [the, setThe] = useState('sp');       // NEW - 3.139: sp · pk · vc · ls
  const [ghep, setGhep] = useState(null);     // NEW - 3.139: gợi ý vận đơn
  const [timVd, setTimVd] = useState('');
  const [dangVd, setDangVd] = useState('');

  const tai = useCallback(async () => {
    const { data, error } = await sb.rpc('fn_odoo_don_ct', { p_token: user.token, p_id: id });
    if (error) { setLoi(error.message); return; }
    if (!data?.ok) { setLoi(data?.loi || 'Không đọc được phiếu'); return; }
    setLoi(''); setCt(data);
  }, [id, user.token]);
  useEffect(() => { setCt(null); tai(); }, [tai]);
  useEffect(() => { const h = (e) => { if (e.key === 'Escape' && !hop && !sua) dong(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [dong, hop, sua]);

  const thucHien = async () => {
    if (!hop) return;
    setGui(true);
    if (hop.loai === 'huy_api' || hop.loai === 'xoa_api') {
      const r = await huyOdoo({ token: user.token, id, hanhDong: hop.loai === 'huy_api' ? 'huy' : 'xoa', lyDo: nd });
      setGui(false);
      if (!r?.ok) { baoToast(r?.loi || 'Odoo không thực hiện được'); tai(); saiXong(); return; }
      baoToast(hop.xong + (r.thong_bao ? ' — ' + r.thong_bao : '')); setHop(null); setNd(''); tai(); saiXong(); return;
    }
    if (hop.loai === 'nha') {
      const { data, error } = await sb.rpc('fn_ton_nha', { p_token: user.token, p_name: ct.name, p_ly_do: nd });
      setGui(false);
      if (error || !data?.ok) { baoToast(error?.message || data?.loi || 'Không giải phóng được'); return; }
      baoToast(hop.xong); setHop(null); setNd(''); tai(); saiXong(); return;
    }
    const { data, error } = hop.loai === 'xong' || hop.loai === 'tu_choi'
      ? await sb.rpc('fn_odoo_xu_ly', { p_token: user.token, p_id: id, p_ket_qua: hop.loai, p_ghi_chu: nd })
      : await sb.rpc('fn_odoo_yeu_cau', { p_token: user.token, p_id: id, p_loai: hop.loai, p_noi_dung: nd });
    setGui(false);
    if (error || !data?.ok) { baoToast(error?.message || data?.loi || 'Không thực hiện được'); return; }
    baoToast(hop.xong); setHop(null); setNd(''); tai(); saiXong();
  };
  const guiLai = () => {
    const p = ct.payload || {};
    moOdoo({
      tieuDe: 'Gửi lại ' + ct.name, man: ct.man, lyDo: p.ly_do,
      don: [{ name: ct.name, tai_lieu_nguon: p.tai_lieu_nguon, kho_cung_ung: p.kho_cung_ung || ct.kho_cung_ung, kho_yeu_cau: p.kho_yeu_cau || ct.kho_yeu_cau,
        ten_yeu_cau: ct.ten_yeu_cau, ghi_chu: p.ghi_chu || '', ly_do: p.ly_do, nguoi_tao: p.nguoi_tao, sale_tai_cua_hang: p.sale_tai_cua_hang || '',
        chi_tiet: (ct.dong || []).map((d) => ({ sku: d.sku, barcode: d.barcode, nhu_cau: d.nhu_cau, ma: d.ma })) }],
      onDong: () => { tai(); saiXong(); },
    });
  };
  const chep = (t) => { try { navigator.clipboard.writeText(t); baoToast('Đã chép ' + t); } catch { /* bỏ qua */ } };
  // lấy phiếu xuất / nhận mới nhất của phiếu này từ Odoo
  const layTuOdoo = async () => {
    setLayMoi(true);
    const k = await layMoiOdoo(user.token, [ct.name]);
    setLayMoi(false);
    baoToast(k.ok ? (k.so_don ? (k.so_doi ? 'Đã lấy mới từ Odoo — có thay đổi' : 'Đã lấy mới từ Odoo — chưa có gì thay đổi') : 'Odoo chưa có phiếu này') : k.loi);
    tai(); saiXong();
  };
  // NEW - 3.139: gỡ / ghép / xác nhận vận đơn
  const taiGoiY = async (tim) => {
    setGhep((g) => ({ ...(g || {}), dang: true }));
    const { data, error } = await sb.rpc('fn_odoo_vd_goi_y', { p_token: user.token, p_ma_phieu: ct.name, p_tim: tim || null });
    if (error || !data?.ok) { setGhep({ loi: error?.message || data?.loi || 'Không tải được gợi ý' }); return; }
    setGhep(data);
  };
  const suaVd = async (label, hd) => {
    setDangVd(label + hd);
    const { data, error } = await sb.rpc('fn_odoo_vd_sua', { p_token: user.token, p_ma_phieu: ct.name, p_label: label, p_hanh_dong: hd });
    setDangVd('');
    if (error || !data?.ok) { baoToast(error?.message || data?.loi || 'Không thực hiện được'); return; }
    baoToast(hd === 'go' ? 'Đã gỡ vận đơn ' + label : 'Đã ghép vận đơn ' + label);
    tai(); saiXong();
    if (ghep && !ghep.loi) taiGoiY(timVd);
  };

  const laApp = ct?.nguon === 'APP';
  const coHuyApi = !!(laApp && ct?.quyen?.huy_odoo && ct?.huy_api?.huy_bat);
  const coSua = coHuyApi && !!odoo;
  const dong4 = ct?.dong4 || [];
  const tong4 = useMemo(() => dong4.reduce((a, d) => ({ app: a.app + (d.app || 0), odoo: a.odoo + (d.odoo || 0), xuat: a.xuat + (d.xuat || 0), nhan: a.nhan + (d.nhan || 0) }),
    { app: 0, odoo: 0, xuat: 0, nhan: 0 }), [dong4]);
  const dcCt = ct ? DC[ct.dc] : null;
  const nkXong = !!ct && (ct.nhan_thieu || (ct.b7 || [])[6] === 2);   // 3.139.6: phiếu nhập đã xong
  const dcGiai = !ct ? '' : ct.dc === 'khop' ? 'Mọi mã kho xuất đúng số Odoo yêu cầu.'
    : ct.dc === 'xuat_thieu' ? `${ct.dc_chi?.n_thieu} mã xuất ít hơn Odoo yêu cầu, tổng thiếu ${fmt(ct.dc_chi?.sl_thieu)}.`
    : ct.dc === 'xuat_du' ? `${ct.dc_chi?.n_du} mã xuất nhiều hơn Odoo yêu cầu, tổng dư ${fmt(ct.dc_chi?.sl_du)}.`
    : ct.dc === 'vua_du_vua_thieu' ? `Dư ${ct.dc_chi?.n_du} mã (${fmt(ct.dc_chi?.sl_du)} cái) · thiếu ${ct.dc_chi?.n_thieu} mã (${fmt(ct.dc_chi?.sl_thieu)} cái).`
    : ct.dc === 'cho_doi_soat' ? 'Chưa có phiếu xuất nào hoàn thành — đối soát khi kho xuất.'
    : ct.dc === 'huy' ? 'Phiếu đã huỷ trên Odoo — không tính số.' : 'Đơn chưa lên Odoo.';
  const THE = [['sp', 'Sản phẩm & đối soát', dong4.length], ['pk', 'Phiếu kho', (ct?.phieu_con || []).length],
    ['vc', 'Vận chuyển', (ct?.van_don || []).length], ['ls', 'Lịch sử', (ct?.su_kien || []).length]];

  return (
    <div className="kt-modal odn-nen" onMouseDown={(e) => { if (e.target === e.currentTarget) dong(); }}>
      <aside className="odn-ngan" role="dialog" aria-label="Chi tiết phiếu Odoo">
        {!ct ? (
          <div className="odn-ngan-tai">{loi ? <><IcAlert /> {loi}</> : 'Đang tải chi tiết…'}<button className="odn-x" onClick={dong}>×</button></div>
        ) : (
          <>
            <header className="odn-ngan-dau">
              <div>
                <small><Nguon n={ct.nguon} /> {laApp ? `${MAN[ct.man] || ct.man || 'Đơn điều chuyển'}${ct.ly_do ? ' · ' + ct.ly_do : ''}` : `Phiếu tạo trên Odoo · ${ct.odoo_ct || ''}`}</small>
                <h2 onClick={() => chep(ct.name)} title="Bấm để chép tên đơn">{ct.name}</h2>
                <p>{ct.kho_cung_ung} → <b>{ct.kho_yeu_cau}</b>{ct.ten_yeu_cau ? ' · ' + ct.ten_yeu_cau : ''}
                  {ct.odoo_id && <> · <span className="odn-ma" onClick={() => chep(String(ct.odoo_id))} title="Mã phiếu trên Odoo — bấm để chép">Odoo #{ct.odoo_id}</span></>}</p>
              </div>
              <button className="odn-x" onClick={dong} aria-label="Đóng">×</button>
            </header>

            <div className="odn-ngan-than">
              {/* NEW - 3.139: 7 bước theo dữ liệu thật */}
              <section className="odn-tl">
                {B7_TEN.map((t, i) => {
                  const s = (ct.b7 || [])[i] ?? 0; const luc = (ct.b7_luc || [])[i];
                  const cls = { 2: ' xong', 4: ' loi', 5: ' huy' }[s] || '';   // 3.139.2: chỉ bước xong mới tô xanh
                  const ten = s === 4 ? (TT_GUI[ct.trang_thai]?.[0] || 'Gửi lỗi') : t;
                  const phu = s === 2 ? (luc ? gioNgay(luc) : '')
                    : s === 3 ? 'chưa có dữ liệu'
                    : s === 1 ? (i === 6 ? (ct.nk_xong ? 'nhận một phần' : ct.cho_gio != null ? `chưa nhận ${ngayCho(ct.cho_gio)} ngày` : 'đang chờ') : 'đang ở bước này')
                    : s === 5 ? 'huỷ' : '';
                  return (
                    <div key={i} className={'odn-tl-b' + cls}>
                      <i>{s === 2 ? <IcCheck /> : s === 4 || s === 5 ? '!' : i + 1}</i>
                      <b>{ten}</b><span>{phu}</span>
                    </div>
                  );
                })}
              </section>
              <p className="odn-tl-ghi">Chỉ đánh dấu xong khi có dữ liệu xác nhận (Odoo, GHTK). "Chưa có dữ liệu" = bước sau đã xong nhưng thiếu dữ liệu bước này. Lần lấy Odoo gần nhất {gioNgay(ct.kho_odoo?.lay_luc || ct.dck_luc)}.</p>

              {/* Cảnh báo + hướng xử lý */}
              {ct.vc === 'da_giao' && ct.cho_gio != null && (
                <div className={'odn-bao ' + { xanh: 'xanh', vang: 'vang', do: 'do', dodam: 'do dodam' }[mauCho(ngayCho(ct.cho_gio))]}><IcClock />
                  <div><b>Chưa nhận {ngayCho(ct.cho_gio)} ngày</b>Đơn vị vận chuyển báo giao thành công lúc {gioNgay(ct.vc_giao)}; nơi nhận chưa xác nhận nhận trên Odoo — nhắc nhận hàng.</div></div>
              )}
              {(ct.canh || []).filter((k) => CANH[k] && k !== 'giao_chua_nhan' && k !== 'giao_qua_72').map((k) => (
                <div key={k} className={'odn-bao ' + CANH[k][1]}><IcAlert /><div><b>{CANH[k][0]}</b>{CANH[k][2]}
                  {k === 'loi' && ct.loi && <code>{ct.loi}</code>}
                  {k === 'trung' && ct.trung_voi && <code>Giống đơn {ct.trung_voi}</code>}</div></div>
              ))}

              {/* Thông tin đơn */}
              <section className="odn-tt-don">
                <div><span>Ghi chú</span><b className={ct.ghi_chu ? '' : 'trong'}>{ct.ghi_chu || 'không ghi chú'}</b></div>
                {laApp ? <>
                  <div><span>Người tạo trên Odoo</span><b>{ct.nguoi_tao || 'user của kho yêu cầu'}</b></div>
                  <div><span>Người gửi từ app</span><b>{ct.nguoi_gui || '—'}</b></div>
                  <div><span>Lý do</span><b>{ct.ly_do || '—'}</b></div>
                  {ct.tai_lieu_nguon && ct.tai_lieu_nguon !== ct.name && <div><span>Tài liệu nguồn</span><b>{ct.tai_lieu_nguon}</b></div>}
                  {ct.sale_tai_cua_hang && <div><span>CH đội đang sale</span><b>{ct.sale_tai_cua_hang}</b></div>}
                  {ct.odoo_duyet && <div><span>Odoo khi tạo</span><b className={ct.odoo_duyet === 'giu_nhap' ? 'canh' : 'ok'}>{ct.odoo_duyet === 'giu_nhap' ? 'Giữ NHÁP (chưa duyệt)' : 'Tự duyệt ngay'}</b></div>}
                </> : <>
                  <div><span>Ngày tạo trên Odoo</span><b>{gioNgay(ct.kho_odoo?.date_planned || ct.ngay)}</b></div>
                  <div><span>Trạng thái Odoo</span><b>{ct.odoo_ct || '—'}{ct.odoo_tt ? ' · ' + ct.odoo_tt : ''}</b></div>
                </>}
              </section>

              {laApp && ct.huy && (
                <div className={'odn-yc ' + (ct.huy.trang_thai === 'xong' ? 'xong' : ct.huy.trang_thai === 'loi' ? 'tu_choi' : '')}>
                  <b>{ct.huy.hanh_dong === 'xoa' ? 'Xoá' : 'Huỷ'} trên Odoo qua API · {{ dang_gui: 'đang gửi', xong: 'Odoo đã xác nhận', loi: 'Odoo từ chối' }[ct.huy.trang_thai] || ct.huy.trang_thai}</b>
                  <p>{ct.huy.ly_do}</p>
                  <span>{ct.huy.nguoi} · {gioNgay(ct.huy.luc)}{ct.huy.ket_qua ? ' — ' + ct.huy.ket_qua : ''}</span>
                  {ct.huy.sua_thanh && <div className="odn-sua-lk">Đã sửa → đơn mới <b>{ct.huy.sua_thanh}</b>
                    {moDon && ct.huy.sua_thanh_id && <button className="odn-link" onClick={() => moDon(ct.huy.sua_thanh_id)}>Mở đơn mới</button>}</div>}
                  {ct.huy.sua_loi && <div className="odn-sua-lk loi">Đã huỷ để sửa nhưng chưa tạo được đơn mới: {ct.huy.sua_loi} — tạo lại đơn từ Đề nghị hàng.</div>}
                </div>
              )}
              {laApp && ct.yeu_cau && (
                <div className={'odn-yc ' + ct.yeu_cau.trang_thai}>
                  <b>{ct.yeu_cau.loai === 'huy' ? 'Yêu cầu huỷ' : 'Yêu cầu điều chỉnh'} · {{ cho: 'đang chờ xử lý', xong: 'đã xử lý', tu_choi: 'bị từ chối' }[ct.yeu_cau.trang_thai]}</b>
                  <p>{ct.yeu_cau.noi_dung}</p>
                  <span>{ct.yeu_cau.nguoi} · {gioNgay(ct.yeu_cau.luc)}{ct.yeu_cau.ket_qua ? ' — ' + ct.yeu_cau.ket_qua : ''}</span>
                </div>
              )}

              {/* Thao tác */}
              <div className="odn-tac">
                {ct.quyen?.gui_lai && odoo && <button className="btn btn-ai odn-nut-chinh" onClick={guiLai}><IcGuiLen /> Gửi lại lên Odoo</button>}
                {ct.quyen?.gui_lai && !odoo && <span className="odn-phu">Gửi lại: tài khoản chưa được mở tạo đơn Odoo</span>}
                {laApp && ['loi', 'can_xem'].includes(ct.trang_thai) && !ct.odoo_id && !ct.state && ct.quyen?.yeu_cau &&
                  <button className="odn-nut-phu" onClick={() => setHop({ loai: 'bo', tieu: 'Bỏ đơn lỗi', goi_y: 'Lý do bỏ (không bắt buộc)', xong: 'Đã bỏ đơn lỗi' })}>Bỏ đơn</button>}
                {coSua && <button className="btn btn-ai odn-nut-chinh" onClick={() => setSua(true)}>Sửa đơn</button>}
                {coHuyApi &&
                  <button className="odn-nut-phu do" onClick={() => setHop({ loai: 'huy_api', tieu: 'Huỷ đơn trên Odoo', goi_y: 'Lý do huỷ (bắt buộc)', xong: 'Odoo đã huỷ đơn' })}>Huỷ đơn</button>}
                {laApp && !coHuyApi && ct.trang_thai === 'thanh_cong' && ct.buoc >= 3 && ct.yeu_cau?.trang_thai !== 'cho' && ct.quyen?.yeu_cau && <>
                  {ct.buoc <= 5 && <button className="odn-nut-phu" onClick={() => setHop({ loai: 'huy', tieu: 'Yêu cầu huỷ đơn', goi_y: 'Lý do huỷ — kho sẽ huỷ trên Odoo', xong: 'Đã gửi yêu cầu huỷ' })}>Yêu cầu huỷ</button>}
                  <button className="odn-nut-phu" onClick={() => setHop({ loai: 'dieu_chinh', tieu: 'Yêu cầu điều chỉnh', goi_y: ct.buoc >= 6 ? 'Cần xử lý gì: trả hàng, thiếu / thừa số lượng…' : 'Cần sửa gì: mã, số lượng, kho…', xong: 'Đã gửi yêu cầu điều chỉnh' })}>Yêu cầu điều chỉnh</button>
                </>}
                {laApp && ct.yeu_cau?.trang_thai === 'cho' && ct.quyen?.xu_ly && <>
                  <button className="odn-nut-phu xanh" onClick={() => setHop({ loai: 'xong', tieu: 'Đã xử lý trên Odoo', goi_y: 'Đã làm gì trên Odoo (không bắt buộc)', xong: 'Đã đóng yêu cầu' })}><IcCheck /> Đã xử lý</button>
                  <button className="odn-nut-phu" onClick={() => setHop({ loai: 'tu_choi', tieu: 'Từ chối yêu cầu', goi_y: 'Lý do từ chối', xong: 'Đã từ chối yêu cầu' })}>Từ chối</button>
                </>}
                {laApp && ct.quyen?.xoa_odoo && ct.huy_api?.xoa_bat &&
                  <button className="odn-nut-phu do" onClick={() => setHop({ loai: 'xoa_api', tieu: 'Xoá đơn trên Odoo', goi_y: 'Lý do xoá (bắt buộc)', xong: 'Odoo đã xoá đơn' })}>Xoá trên Odoo</button>}
                {ct.quyen?.nha_ton && (ct.ton?.dong || []).some((d) => d.dang_tru > 0) &&
                  <button className="odn-nut-phu" onClick={() => setHop({ loai: 'nha', tieu: 'Giải phóng tồn đang giữ', goi_y: 'Lý do giải phóng (bắt buộc)', xong: 'Đã trả lại tồn khả dụng' })}>Giải phóng tồn</button>}
                {laApp && <button className="odn-nut-phu" onClick={() => setHop({ loai: 'ghi_chu', tieu: 'Ghi chú vào nhật ký', goi_y: 'Ghi chú', xong: 'Đã ghi chú' })}>Ghi chú</button>}
                <button className="odn-nut-phu" onClick={layTuOdoo} disabled={layMoi}><IcRefresh /> {layMoi ? 'Đang hỏi Odoo…' : 'Lấy mới từ Odoo'}</button>
              </div>
              {laApp && ct.trang_thai === 'thanh_cong' && ct.buoc >= 6 && <p className="odn-phu">Đơn đã xuất kho trên Odoo — không huỷ / sửa được nữa. Cần trả hàng / điều chỉnh: gửi Yêu cầu điều chỉnh để kho xử lý.</p>}
              {!laApp && <p className="odn-phu">Phiếu tạo thẳng trên Odoo: app chỉ theo dõi, đối soát và ghép vận đơn. Huỷ / sửa thực hiện trên Odoo.</p>}

              {/* NEW - 3.139: 4 thẻ */}
              <div className="odn-the" role="tablist">
                {THE.map(([k, t, n]) => (
                  <button key={k} role="tab" aria-selected={the === k} className={the === k ? 'on' : ''} onClick={() => setThe(k)}>{t}{n ? <i>{n}</i> : null}</button>
                ))}
              </div>

              {the === 'sp' && <>
                <section className="odn-muc">
                  <h3>Sản phẩm & đối soát <span>{dong4.length} mã · Odoo yêu cầu {fmt(ct.sl_odoo)} · đã xuất {fmt(ct.sl_xuat)} · đã nhận {fmt(ct.sl_nhan)}</span></h3>
                  <div className={'odn-dc2 ' + (ct.nhan_thieu ? 'do' : dcCt?.[1] || 'xam') + (ct.dc_tam ? ' tam' : '')}>
                    <b>{dcCt?.[0] || 'Chưa lên Odoo'}{ct.dc_tam ? ' · tạm tính' : ''}{ct.nhan_thieu ? ' · Nhận thiếu' : ''}</b>
                    <span>{dcGiai}{ct.dc_tam ? ' Còn phiếu xuất dở dang — số sẽ đổi khi kho xuất tiếp.' : ''}</span>
                    {ct.kho_sua && <span className="odn-dc2-phu"><b>Kho sửa đơn:</b> Odoo yêu cầu khác số app gửi ở các ô tô vàng.</span>}
                    {ct.nhan_thieu && <span className="odn-dc2-phu"><b>Nhận thiếu:</b> phiếu nhập đã xong, đã nhận {fmt(ct.sl_nhan)} / đã xuất {fmt(ct.sl_xuat)}.</span>}
                  </div>
                  {dong4.length === 0 ? <p className="odn-phu">Chưa có dòng hàng từ Odoo — bấm Lấy mới từ Odoo.</p> : (
                    <div className="odn-ct-khung">
                      <table className="odn-ct odn-ct4">
                        <thead><tr><th>Mã hàng</th>{laApp && <th className="so">App yêu cầu</th>}<th className="so">Odoo yêu cầu</th><th className="so">Đã xuất</th><th className="so">Đã nhận</th></tr></thead>
                        <tbody>{dong4.map((d) => (
                          <tr key={d.barcode} className={'kq-' + d.kq}>
                            <td><b>{d.ma}</b><span>{d.ten || d.barcode}</span></td>
                            {laApp && <td className={'so' + (d.ks ? ' ks' : '')}>{fmt(d.app)}</td>}
                            {/* 3.139.4: kho xuất không khớp -> 2 ô Odoo yêu cầu + Đã xuất tô hồng, không ghi số chênh */}
                            <td className={'so' + (d.kq === 'thieu' || d.kq === 'du' ? ' lech' : d.ks ? ' ks' : '')}>{d.odoo == null ? (d.kq === 'bo' ? 'bỏ mã' : '—') : fmt(d.odoo)}</td>
                            <td className={'so' + (d.kq === 'thieu' || d.kq === 'du' || (nkXong && (d.nhan || 0) < (d.xuat || 0)) ? ' lech' : '')}>{fmt(d.xuat)}</td>
                            {/* 3.139.6: phiếu nhập đã xong mà nhận ít hơn xuất -> tô hồng Đã xuất + Đã nhận */}
                            <td className={'so' + (nkXong && (d.nhan || 0) < (d.xuat || 0) ? ' lech' : '')}>{fmt(d.nhan)}</td>
                          </tr>
                        ))}</tbody>
                        <tfoot><tr><td>Tổng</td>{laApp && <td className="so">{fmt(tong4.app)}</td>}<td className="so">{fmt(tong4.odoo)}</td><td className="so">{fmt(tong4.xuat)}</td><td className="so">{fmt(tong4.nhan)}</td></tr></tfoot>
                      </table>
                    </div>
                  )}
                </section>
              </>}

              {the === 'pk' && (
                <section className="odn-muc">
                  <h3>Phiếu xuất / nhận trên Odoo <span>{ct.kho_odoo?.lay_luc ? 'lấy từ Odoo ' + gioNgay(ct.kho_odoo.lay_luc) : 'chưa lấy từ Odoo'}</span></h3>
                  {(ct.phieu_con || []).length === 0 ? <p className="odn-phu">{ct.state ? 'Chưa có phiếu xuất / nhận (phiếu chưa duyệt).' : 'App chưa đọc được phiếu này từ Odoo — bấm Lấy mới từ Odoo.'}</p>
                    : ct.phieu_con.map((p) => <PhieuCon key={p.name} p={p} ds={ct.phieu_con} chep={chep} />)}
                  <p className="odn-phu">Phiếu huỷ không tính vào số. Kho huỷ phiếu cũ rồi tạo phiếu mới thì phiếu cũ ghi "đã thay bằng …" kèm các mã kho đổi.</p>
                </section>
              )}

              {the === 'vc' && (
                <section className="odn-muc">
                  <h3>Vận chuyển <span>{VC[ct.vc]?.[0] || (ct.so_vd ? '' : 'chưa ghép vận đơn')}</span></h3>
                  <div className="odn-vc-moc">
                    {[['Xuất kho', (ct.b7_luc || [])[3]], ['GHTK lấy hàng', (ct.b7_luc || [])[4]], ['Giao thành công', (ct.b7_luc || [])[5]], ['Xác nhận nhận', ct.nk_xong]].map(([t, l]) => (
                      <div key={t} className={l ? 'co' : ''}><span>{t}</span><b>{l ? gioNgay(l) : 'chưa có'}</b></div>
                    ))}
                  </div>
                  {ct.vc === 'da_giao' && ct.cho_gio != null && (
                    <div className="odn-vc-cho"><ChoNhan h={ct.cho_gio} /><span>kể từ lúc GHTK báo giao thành công {gioNgay(ct.vc_giao)}</span></div>
                  )}
                  {(ct.van_don || []).length === 0 && <p className="odn-phu">Chưa ghép vận đơn nào. {ct.quyen_vd ? 'Bấm Ghép tay vận đơn để chọn.' : ''}</p>}
                  {(ct.van_don || []).map((v) => (
                    <div key={v.label} className="odn-vd-the">
                      <div className="odn-vd-dau">
                        <span className="odn-ma" onClick={() => chep(v.label)} title="Bấm để chép mã vận đơn">{v.label}</span>
                        <i className={'odn-vd-tt ' + (v.nhom || '')}>{v.tt || NHOM_VD[v.nhom] || '—'}</i>
                        {DO_TIN[v.do_tin] && <em className={'odn-chip ' + DO_TIN[v.do_tin][1]}>{DO_TIN[v.do_tin][0]}</em>}
                      </div>
                      <small>{v.hang} · {v.ten_nhan || v.ma_ch || '—'}{v.kg ? ' · ' + v.kg + ' kg' : ''}</small>
                      <small>Lấy {v.lay ? gioNgay(v.lay) : v.lay_ngay ? ngay(v.lay_ngay) : '—'} · Giao {v.giao ? gioNgay(v.giao) : v.giao_ngay ? ngay(v.giao_ngay) : '—'}{v.ly_do ? ' · ' + v.ly_do : ''}</small>
                      {v.phieu_khac && <small>Chung vận đơn với: {v.phieu_khac}</small>}
                      {(v.hanh_trinh || []).length > 0 && (
                        <details className="odn-ht"><summary>Hành trình ({v.hanh_trinh.length} mốc)</summary>
                          <ol>{v.hanh_trinh.map((h, i) => <li key={i}><span>{gioNgay(h.luc)}</span>{h.tt}{h.ly_do ? ' — ' + h.ly_do : ''}</li>)}</ol>
                        </details>)}
                      {ct.quyen_vd && (
                        <div className="odn-vd-nut">
                          {v.do_tin === 'TRUNG' && <button className="odn-nut-phu xanh" disabled={!!dangVd} onClick={() => suaVd(v.label, 'ghep')}><IcCheck /> Xác nhận đúng</button>}
                          <button className="odn-nut-phu" disabled={!!dangVd} onClick={() => suaVd(v.label, 'go')}>Gỡ khỏi phiếu</button>
                        </div>)}
                    </div>
                  ))}
                  {ct.quyen_vd && (!ghep ? <button className="odn-nut-phu odn-ghep-mo" onClick={() => taiGoiY('')}>Ghép tay vận đơn</button> : (
                    <div className="odn-ghep">
                      <div className="odn-ghep-dau"><b>Ghép tay vận đơn</b>
                        <span>{ghep.ma_ch ? `Gợi ý: vận đơn tới ${ghep.ma_ch}${ghep.doi_sale ? ' (cửa hàng đội đang sale)' : ''} quanh ngày ${ngay(ghep.ngay)}` : ''}</span>
                        <button className="odn-x" onClick={() => { setGhep(null); setTimVd(''); }} aria-label="Đóng">×</button></div>
                      <label className="odn-tim"><IcSearch /><input value={timVd} onChange={(e) => setTimVd(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') taiGoiY(timVd.trim()); }} placeholder="Gõ mã vận đơn rồi Enter (bỏ trống = gợi ý)" /></label>
                      {ghep.loi && <div className="odn-bao do"><IcAlert /> {ghep.loi}</div>}
                      {ghep.dang && <p className="odn-phu">Đang tìm…</p>}
                      {!ghep.dang && (ghep.ds || []).length === 0 && !ghep.loi && <p className="odn-phu">Không có vận đơn phù hợp. Gõ mã vận đơn để tìm.</p>}
                      {(ghep.ds || []).map((g) => (
                        <div key={g.label} className={'odn-ghep-dong' + (g.da_ghep ? ' da' : '')}>
                          <div><b className="odn-ma">{g.label}</b><small>{g.ten_nhan || g.ma_ch} · tạo {ngay(g.ngay_tao)}{g.lay_ngay ? ' · lấy ' + ngay(g.lay_ngay) : ''} · {g.tt}</small>
                            {g.phieu_khac && <small>Đang gắn: {g.phieu_khac}</small>}</div>
                          {g.da_ghep ? <span className="odn-chip ok">Đã ghép</span>
                            : <button className="odn-nut-phu xanh" disabled={!!dangVd} onClick={() => suaVd(g.label, 'ghep')}>Ghép</button>}
                        </div>
                      ))}
                    </div>))}
                </section>
              )}

              {the === 'ls' && <>
                {laApp && <section className="odn-muc">
                  <h3>Nhật ký xử lý <span>{(ct.su_kien || []).length} sự kiện</span></h3>
                  <ol className="odn-nk">
                    {[...(ct.su_kien || [])].reverse().map((s, i) => (
                      <li key={i} className={s.loai}>
                        <span className="t">{gioNgay(s.luc)}</span>
                        <div><b>{s.noi_dung}</b>{s.nguoi && <em>{s.nguoi}</em>}</div>
                      </li>
                    ))}
                  </ol>
                </section>}
                <section className="odn-muc">
                  <h3>Dữ liệu Odoo <span>lấy lần cuối {gioNgay(ct.kho_odoo?.lay_luc)}</span></h3>
                  <div className="odn-tt-don odn-tt-gon">
                    <div><span>Đổi trạng thái gần nhất</span><b>{gioNgay(ct.kho_odoo?.doi_luc)}</b></div>
                    <div><span>Trạng thái</span><b>{ct.kho_odoo?.state || '—'} · {ct.odoo_tt || '—'}</b></div>
                  </div>
                </section>
                {!laCH && (ct.ton?.nhat_ky || []).length > 0 && (
                  <details className="odn-tho odn-ton-nk"><summary>Nhật ký tồn của phiếu ({ct.ton.nhat_ky.length})</summary>
                    <ol className="odn-nk">{[...ct.ton.nhat_ky].reverse().map((n, i) => (
                      <li key={i} className={n.anh_huong < 0 ? 'bo' : n.anh_huong > 0 ? 'ket_qua' : ''}>
                        <span className="t">{gioNgay(n.luc)}</span>
                        <div><b>{n.noi_dung}</b><em>{n.barcode} · {n.anh_huong > 0 ? '+' : n.anh_huong < 0 ? '−' : ''}{n.anh_huong ? fmt(Math.abs(n.anh_huong)) : fmt(n.sl) + ' (không đổi khả dụng)'}{n.nguoi ? ' · ' + n.nguoi : ''}</em></div>
                      </li>))}</ol>
                  </details>)}
                {!laCH && laApp && <details className="odn-tho">
                  <summary>Dữ liệu kỹ thuật (JSON đã gửi · phản hồi Odoo)</summary>
                  <pre>{JSON.stringify({ gui: ct.payload, phan_hoi: ct.phan_hoi, http: ct.http }, null, 2)}</pre>
                </details>}
              </>}
            </div>
          </>
        )}

        {sua && ct && <HopSua ct={ct} id={id} onDong={() => setSua(false)}
          onXong={(idMoi) => { setSua(false); saiXong(); if (idMoi && moDon) moDon(idMoi); else tai(); }} />}
        {hop && (
          <div className="odn-hop-nen" onMouseDown={(e) => { if (e.target === e.currentTarget) setHop(null); }}>
            <div className="odn-hop">
              <b>{hop.tieu}</b>
              {hop.loai === 'huy' && <p>{ct?.huy_api?.huy_bat ? 'Yêu cầu được ghi vào nhật ký để kho / điều phối xem xét. Muốn huỷ ngay trên Odoo: dùng nút "Huỷ trên Odoo".' : 'Huỷ qua API chưa bật: yêu cầu được ghi vào nhật ký đơn để kho huỷ trên Odoo.'} App tự đóng yêu cầu khi dữ liệu Odoo báo "Bị hủy".</p>}
              {hop.loai === 'dieu_chinh' && <p>Yêu cầu được ghi vào nhật ký đơn để kho sửa trên Odoo. Số liệu trong app không tự đổi.</p>}
              {(hop.loai === 'huy_api' || hop.loai === 'xoa_api') && <p>Gửi lệnh {hop.loai === 'huy_api' ? 'HUỶ' : 'XOÁ'} thẳng lên Odoo. App chỉ đổi trạng thái và trả lại tồn khả dụng khi Odoo xác nhận thành công. Kho đã xuất hàng thì Odoo / app sẽ từ chối.</p>}
              {hop.loai === 'nha' && <p>Trả lại tồn khả dụng phiếu này đang giữ (vd kho báo sẽ không xuất). Phiếu trên Odoo KHÔNG đổi. Nếu dữ liệu Odoo sau đó vẫn thấy phiếu đang chờ xuất, hệ thống tự trừ lại.</p>}
              <textarea autoFocus value={nd} onChange={(e) => setNd(e.target.value)} placeholder={hop.goi_y} rows={3} maxLength={1000} />
              <div className="odn-hop-chan">
                <button className="odn-nut-phu" onClick={() => setHop(null)}>Huỷ</button>
                <button className="btn btn-ai odn-nut-chinh" disabled={gui || (['huy_api', 'xoa_api', 'nha'].includes(hop.loai) && nd.trim().length < 3)} onClick={thucHien}>{gui ? 'Đang xử lý…' : hop.tieu}</button>
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

// NEW - 3.139: 1 phiếu con XKDC / NKDC; phiếu huỷ ghi "đã thay bằng …" + mã kho đổi so với phiếu thay
function PhieuCon({ p, ds, chep }) {
  const [mo, setMo] = useState(false);
  const huy = p.state === 'cancel';
  const thay = huy && p.thay ? ds.find((x) => x.name === p.thay) : null;
  const doi = useMemo(() => {
    if (!thay) return [];
    const a = new Map((p.dong || []).map((d) => [d.barcode, d]));
    const b = new Map((thay.dong || []).map((d) => [d.barcode, d]));
    const out = [];
    new Set([...a.keys(), ...b.keys()]).forEach((k) => {
      const x = a.get(k), y = b.get(k);
      if ((x?.nc || 0) !== (y?.nc || 0)) out.push(`${(x || y).ma}: ${x ? fmt(x.nc) : 'chưa có'} → ${y ? fmt(y.nc) : 'bỏ'}`);
    });
    return out;
  }, [p, thay]);
  return (
    <div className={'odn-pc' + (huy ? ' huy' : '') + (p.state === 'done' ? ' xong' : '')}>
      <div className="odn-pc-dau">
        <span className="odn-ma" onClick={() => chep(p.name)} title="Bấm để chép mã phiếu">{p.name}</span>
        <i>{p.loai === 'xk' ? 'Phiếu xuất' : 'Phiếu nhận'}</i>
        <i className={'odn-pk-tt ' + (p.state || '')}>{TT_PK[p.state] || p.state}</i>
        <small>{p.xong ? gioNgay(p.xong) : ''}{p.kho ? ' · ' + p.kho : ''}</small>
        {p.sl_nc != null && <b>{fmt(p.sl_ht)} / {fmt(p.sl_nc)}</b>}
      </div>
      {huy && <div className="odn-pc-thay">{p.thay ? <>Đã thay bằng <b>{p.thay}</b>{doi.length ? ' · kho đổi: ' + doi.slice(0, 6).join(' · ') + (doi.length > 6 ? ` · +${doi.length - 6} mã` : '') : ' · không đổi mã / số'}</> : 'Đã huỷ, không có phiếu thay'}</div>}
      {p.ghi && <div className="odn-pc-ghi">✎ {p.ghi}</div>}
      {(p.dong || []).length > 0 && <button className="odn-link" onClick={() => setMo(!mo)}>{mo ? 'Ẩn' : 'Xem'} {p.dong.length} mã</button>}
      {mo && (
        <table className="odn-ct"><thead><tr><th>Mã hàng</th><th className="so">Nhu cầu</th><th className="so">Hoàn thành</th><th>Dòng</th></tr></thead>
          <tbody>{p.dong.map((d) => <tr key={d.barcode}><td><b>{d.ma}</b><span>{d.barcode}</span></td><td className="so">{fmt(d.nc)}</td><td className="so">{fmt(d.ht)}</td><td><span className="odn-phu">{d.tt}</span></td></tr>)}</tbody>
        </table>)}
    </div>
  );
}

/* ================= Sửa đơn: huỷ đơn cũ + tạo đơn mới đã sửa (v3.118.0) ================= */
function HopSua({ ct, id, onDong, onXong }) {
  const { user, baoToast } = useApp();
  const dong = ct.dong || [];
  const khoa = (d) => d.barcode || d.sku;
  const [sl, setSl] = useState(() => Object.fromEntries(dong.map((d) => [khoa(d), String(d.nhu_cau ?? 0)])));
  const [lyDo, setLyDo] = useState('');
  const [dang, setDang] = useState(false);
  const [loi, setLoi] = useState('');
  const [vuot, setVuot] = useState(null);
  const [chan, setChan] = useState(false);
  const [choVuot, setChoVuot] = useState(false);
  const [hong, setHong] = useState(null);      // đã huỷ đơn cũ nhưng đơn mới chưa tạo được

  const so = (k) => { const n = Math.floor(Number(sl[k])); return Number.isFinite(n) && n >= 0 ? n : NaN; };
  const tongCu = dong.reduce((a, d) => a + (d.nhu_cau || 0), 0);
  const tongMoi = dong.reduce((a, d) => a + (so(khoa(d)) || 0), 0);
  const soDoi = dong.filter((d) => so(khoa(d)) !== d.nhu_cau).length;
  const sai = dong.some((d) => Number.isNaN(so(khoa(d))));
  const conMa = dong.some((d) => so(khoa(d)) > 0);
  const duoc = !dang && !hong && !sai && soDoi > 0 && conMa && lyDo.trim().length >= 3 && (!vuot || (!chan && choVuot));

  const lam = async () => {
    if (!duoc) return;
    setDang(true); setLoi('');
    const r = await suaOdoo({ token: user.token, id, lyDo: lyDo.trim(), choVuot,
      chiTiet: dong.map((d) => ({ barcode: d.barcode, sku: d.sku, nhu_cau: so(khoa(d)) })) });
    setDang(false);
    if (r?.ok) { baoToast(`Đã sửa đơn — đơn mới ${r.name_moi}${r.odoo_id ? ' · mã Odoo #' + r.odoo_id : ''}`); onXong(r.id_moi); return; }
    if (Array.isArray(r?.vuot) && r.vuot.length && !r?.huy_cu) { setVuot(r.vuot); setChan(!!r.chan_vuot); setLoi(r.loi || ''); return; }
    if (r?.huy_cu) { setHong({ loi: r.loi, idMoi: r.id_moi }); return; }
    setLoi(r?.loi || 'Không sửa được đơn');
  };

  return (
    <div className="odn-hop-nen" onMouseDown={(e) => { if (e.target === e.currentTarget && !dang && !hong) onDong(); }}>
      <div className="odn-hop sd-hop" role="dialog" aria-label="Sửa đơn">
        <b>Sửa đơn {ct.name}</b>
        <p>App sẽ <b className="sd-nhan">huỷ đơn này trên Odoo</b> rồi <b className="sd-nhan">tạo đơn mới đã sửa</b> (mã đơn mới). Chỉ sửa số lượng; ghi 0 để bỏ mã.</p>
        <div className="sd-ds">
          {dong.map((d) => {
            const k = khoa(d); const n = so(k); const doi = n !== d.nhu_cau;
            return (
              <div key={k} className={'sd-dong' + (doi ? ' doi' : '') + (n === 0 ? ' bo' : '')}>
                <div className="sd-ma"><b>{d.ma}</b><span>{d.ten || d.barcode}</span></div>
                <span className="sd-cu" title="Số cũ">{fmt(d.nhu_cau)}</span>
                <input type="number" inputMode="numeric" min="0" value={sl[k]} disabled={dang || !!hong} aria-label={'Số mới ' + d.ma}
                  onChange={(e) => { setSl((s) => ({ ...s, [k]: e.target.value })); setVuot(null); setChoVuot(false); }} />
                <button type="button" className="sd-bo-nut" disabled={dang || !!hong || n === 0}
                  onClick={() => { setSl((s) => ({ ...s, [k]: '0' })); setVuot(null); setChoVuot(false); }}>Bỏ mã</button>
              </div>
            );
          })}
        </div>
        <div className="sd-tong">Cũ <b>{fmt(tongCu)}</b> cái → mới <b>{fmt(tongMoi)}</b> cái · {soDoi} dòng thay đổi{!conMa ? ' · bỏ hết mã thì dùng nút Huỷ đơn' : ''}</div>
        <textarea value={lyDo} onChange={(e) => setLyDo(e.target.value)} rows={2} maxLength={300} disabled={dang || !!hong}
          placeholder="Lý do sửa (bắt buộc) — vd: cửa hàng báo bớt, khách huỷ đặt…" />
        {vuot && (
          <div className="od-bao canh od-vuot"><IcAlert /><div>
            <b>{chan ? 'Kho không đủ hàng — giảm số lượng rồi sửa lại:' : 'Vượt tồn khả dụng của kho:'}</b>
            {vuot.slice(0, 10).map((v, j) => <div key={j}>• <b>{v.ma}</b> cần {fmt(v.can)} · kho {v.kho} còn khả dụng {fmt(Math.max(v.kha_dung, 0))}</div>)}
            {!chan && <label className="sd-cho"><input type="checkbox" checked={choVuot} onChange={(e) => setChoVuot(e.target.checked)} /> Đã kiểm tra — vẫn sửa (Odoo giữ NHÁP nếu kho thiếu)</label>}
          </div></div>)}
        {loi && !vuot && <div className="odn-bao do"><IcAlert /><div>{loi}</div></div>}
        {hong && <div className="odn-bao do"><IcAlert /><div><b>Đơn cũ đã huỷ nhưng đơn mới chưa tạo xong</b>{hong.loi}</div></div>}
        <div className="odn-hop-chan">
          {hong
            ? <button className="btn btn-ai odn-nut-chinh" onClick={() => onXong(hong.idMoi)}>{hong.idMoi ? 'Mở đơn mới để gửi lại' : 'Đóng'}</button>
            : <>
                <button className="odn-nut-phu" disabled={dang} onClick={onDong}>Đóng</button>
                <button className={'btn btn-ai odn-nut-chinh' + (dang ? ' dang-chay' : '')} disabled={!duoc} onClick={lam}>
                  {dang ? 'Đang huỷ đơn cũ & tạo đơn mới…' : 'Xác nhận sửa đơn'}</button>
              </>}
        </div>
      </div>
    </div>
  );
}
