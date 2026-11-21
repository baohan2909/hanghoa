import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { useApp } from '../App.jsx';
import { Sel, DateBox, isoVN } from '../lib/ui.jsx';
import { IcRefresh, IcSearch, IcAlert, IcCheck, IcGuiLen, IcClock } from '../lib/icons.jsx';
import { useOdooCfg, moOdoo, huyOdoo, suaOdoo, layMoiOdoo } from '../lib/odoo.js';

const TaoDon = lazy(() => import('./TaoDon.jsx'));

// ============================================================================
// QUẢN LÝ ĐƠN ODOO (v3.116.0 — SQL 206)
//   Mọi đơn app tạo trên Odoo: tra cứu, timeline, đối chiếu app ↔ Odoo, xử lý (gửi lại / bỏ / yêu cầu huỷ – điều chỉnh).
//   Trạng thái thực tế = dữ liệu điều chuyển đồng bộ từ Odoo (dieu_chuyen_kho, ~10 phút/lần) — app KHÔNG tự suy đoán.
//   v3.118.0: Huỷ đơn qua API Odoo; SỬA ĐƠN = huỷ đơn cũ + tạo đơn mới đã sửa (Odoo chưa có API sửa).
//   Đơn đã xuất kho: chỉ gửi Yêu cầu điều chỉnh cho kho. Tài khoản CỬA HÀNG: giao diện gọn (ẩn soạn đơn rời, tồn, dữ liệu kỹ thuật).
//   Dùng làm màn riêng (menu Đơn Odoo) và nhúng trong Phòng điều hành (prop nhung).
// ============================================================================

const fmt = (n) => (n == null || n === '' ? '—' : Number(n).toLocaleString('vi'));
const gioNgay = (s) => (s ? new Date(s).toLocaleString('vi', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—');
const gio = (s) => (s ? new Date(s).toLocaleTimeString('vi', { hour: '2-digit', minute: '2-digit' }) : '—');
const ngay = (s) => (s ? String(s).slice(8, 10) + '/' + String(s).slice(5, 7) : '—');
const truNgay = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return isoVN(d); };

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
  chua_thay: ['Chưa thấy trên dữ liệu Odoo', 'vang', 'Odoo báo đã tạo nhưng dữ liệu điều chuyển đồng bộ từ Odoo chưa có đơn này. Tra trên Odoo bằng tên đơn hoặc mã Odoo; nếu đơn nằm ngoài báo cáo đồng bộ thì báo IT đưa vào.'],
  cho_duyet_lau: ['Chờ duyệt quá 1 ngày', 'vang', 'Đơn nằm ở bước chờ duyệt trên Odoo quá 1 ngày — nhắc người duyệt.'],
  cho_xuat_lau: ['Chờ xuất quá 2 ngày', 'vang', 'Đã duyệt nhưng kho chưa xuất sau 2 ngày — liên hệ kho cung ứng.'],
  di_duong_lau: ['Đi đường quá 3 ngày', 'vang', 'Kho đã xuất hơn 3 ngày mà cửa hàng chưa nhận — kiểm tra vận chuyển, nhắc cửa hàng xác nhận nhận hàng trên Odoo.'],
  lech: ['Lệch app ↔ Odoo', 'do', 'Số dòng hoặc số lượng trên Odoo khác đơn app đã gửi — xem bảng đối chiếu bên dưới.'],
  trung: ['Giống đơn khác', 'xam', 'Nội dung giống hệt một đơn đã tạo trong 48 giờ — người gửi đã xác nhận vẫn gửi.'],
  yeu_cau: ['Có yêu cầu chờ', 'xanh', 'Đang chờ kho / điều phối xử lý yêu cầu huỷ hoặc điều chỉnh trên Odoo.'],
  giu_nhap: ['Odoo giữ nháp', 'vang', 'Odoo tạo đơn nhưng KHÔNG tự duyệt (thường do kho thiếu hàng lúc tạo) — đơn nằm ở nháp, chưa trừ tồn khả dụng. Kho kiểm tra tồn rồi duyệt trên Odoo, hoặc huỷ đơn.'],
  huy_loi: ['Huỷ / xoá lỗi', 'do', 'Lệnh huỷ / xoá gửi Odoo bị từ chối — đọc lý do trong nhật ký. Đơn trên Odoo KHÔNG đổi.'],
  huy_treo: ['Lệnh huỷ treo', 'do', 'Đã gửi lệnh huỷ / xoá quá 2 phút chưa có kết quả — tra trên Odoo trước khi gửi lại.'],
  // NEW - 213: theo phiếu xuất / nhận lấy thẳng từ Odoo + vận đơn
  xuat_thieu: ['Kho xuất thiếu', 'vang', 'Kho đã xuất nhưng ít hơn số đơn yêu cầu — xem cột Đã xuất từng mã. Phần còn lại có thể kho xuất bổ sung (phiếu dở dang) hoặc thiếu hàng.'],
  nhan_thieu: ['Cửa hàng nhận thiếu', 'do', 'Cửa hàng xác nhận nhận ít hơn số kho đã xuất — kiểm tra hàng thất lạc / nhận sót, nhắc cửa hàng hoặc kho đối chiếu.'],
  giao_chua_nhan: ['Đã giao, chưa nhận', 'vang', 'Đơn vị vận chuyển báo đã giao hơn 1 ngày mà cửa hàng chưa xác nhận nhận hàng trên Odoo — nhắc cửa hàng nhận hàng.'],
};
// NEW - 213: trạng thái phiếu kho Odoo
const TT_PK = { draft: 'Nháp', waiting: 'Chờ hàng', confirmed: 'Chờ hàng', assigned: 'Sẵn sàng', done: 'Xong', cancel: 'Huỷ' };
const NHOM_VD = { CHO_LAY: 'Chờ lấy', DANG_CHAY: 'Đang giao', GIAO_XONG: 'Đã giao', SU_CO: 'Sự cố', TRA_HANG: 'Trả hàng', HUY: 'Đã huỷ' };
const MAN = { sua_don: 'Sửa đơn', tao_don: 'Tạo đơn trực tiếp', de_nghi: 'Đề nghị hàng', chia_moi: 'Chia hàng mới', dieu_phoi: 'Yêu cầu ĐP', doi_sale: 'Đội Sale', ds_ban_chia: 'Bàn chia đội' };
const TT_CK = { giu_cho: 'Đang gửi — giữ chỗ', cho_xuat: 'Đang trừ, chờ kho xuất', tam_giu: 'Tạm giữ', nhap: 'Odoo nháp — chưa trừ', xong: 'Đã xuất / đóng', huy: 'Đã trả lại', het_tam: 'Hết tạm giữ' };
// Ô chỉ số (bấm = lọc)
const KPI = [
  ['', 'Tất cả đơn', 'tong'], ['thanh_cong', 'Odoo đã nhận'], ['can_xu_ly', 'Cần xử lý', null, 'canh'], ['loi', 'Gửi lỗi', null, 'do'],
  ['cho_duyet', 'Chờ duyệt'], ['da_duyet', 'Chờ xuất kho'], ['xuat_kho', 'Đang giao'], ['hoan_tat', 'Đã nhận'], ['huy', 'Huỷ'],
];
const BUOC_TL = [
  [1, 'Tạo đơn'], [2, 'Gửi Odoo'], [3, 'Odoo tiếp nhận'], [4, 'Chờ duyệt'], [5, 'Duyệt · chờ xuất'], [6, 'Xuất kho · đang giao'], [7, 'Cửa hàng nhận'],
];

export default function OdooDon({ nhung = false, locDau = null }) {
  const { user, baoToast } = useApp();
  const odoo = useOdooCfg(user);
  const laCH = user.vai_tro === 'CH';
  const [loc, setLoc] = useState(() => ({ tu: truNgay(29), den: isoVN(), nguoi: '', kho: '', man: '', nhom: locDau || '', ...(locDau && typeof locDau === 'object' ? locDau : {}) }));
  const [q, setQ] = useState('');
  const [qTre, setQTre] = useState('');
  const [tq, setTq] = useState(null);
  const [ds, setDs] = useState(null);
  const [loi, setLoi] = useState('');
  const [dangTai, setDangTai] = useState(false);
  const [chon, setChon] = useState(null);     // id đơn đang mở
  const [sap, setSap] = useState({ k: 'tao_luc', d: -1 });
  const [tao, setTao] = useState(false);
  const hen = useRef(null);
  useEffect(() => { clearTimeout(hen.current); hen.current = setTimeout(() => setQTre(q.trim()), 350); return () => clearTimeout(hen.current); }, [q]);

  const base = useMemo(() => ({ tu: loc.tu, den: loc.den, nguoi: loc.nguoi, kho: loc.kho, man: loc.man }), [loc.tu, loc.den, loc.nguoi, loc.kho, loc.man]);
  const tai = useCallback(async () => {
    setDangTai(true); setLoi('');
    const [a, b] = await Promise.all([
      sb.rpc('fn_odoo_tong_quan', { p_token: user.token, p_loc: base }),
      sb.rpc('fn_odoo_don_ds', { p_token: user.token, p_loc: { ...base, nhom: loc.nhom, q: qTre } }),
    ]);
    setDangTai(false);
    if (a.error || b.error) { setLoi((a.error || b.error).message); return; }
    setTq(a.data); setDs(b.data);
  }, [user.token, base, loc.nhom, qTre]);
  useEffect(() => { tai(); }, [tai]);

  const lamMoi = async () => {
    setDangTai(true);
    // NEW - 213: hỏi thẳng Odoo các đơn đang chạy trên màn hình (tối đa 50), rồi đối chiếu lại
    const dangChay = (ds?.rows || []).filter((r) => r.trang_thai === 'thanh_cong' && r.buoc >= 3 && r.buoc <= 6).map((r) => r.name);
    const k = dangChay.length ? await layMoiOdoo(user.token, dangChay) : null;
    const { error } = await sb.rpc('fn_odoo_lam_moi', { p_token: user.token });
    if (error) { setDangTai(false); baoToast('Không làm mới được: ' + error.message); return; }
    await tai();
    baoToast(k && !k.ok ? 'Đã đối chiếu lại — ' + k.loi : `Đã lấy mới từ Odoo${k ? ` ${Math.min(50, dangChay.length)} đơn đang chạy` : ''}${k?.so_doi ? ` · ${k.so_doi} đơn đổi trạng thái` : ''}`);
  };

  const rows = useMemo(() => {
    const a = [...(ds?.rows || [])];
    const g = { tao_luc: (r) => r.tao_luc || '', tong_sl: (r) => r.tong_sl || 0, buoc: (r) => r.buoc ?? 0, name: (r) => r.name, kho_yeu_cau: (r) => r.ten_yeu_cau || r.kho_yeu_cau }[sap.k];
    a.sort((x, y) => { const p = g(x), q2 = g(y); return (p < q2 ? -1 : p > q2 ? 1 : 0) * sap.d; });
    return a;
  }, [ds, sap]);
  const bamCot = (k) => setSap((s) => (s.k === k ? { k, d: -s.d } : { k, d: k === 'name' || k === 'kho_yeu_cau' ? 1 : -1 }));
  const mt = (k) => (sap.k === k ? (sap.d === 1 ? ' ▲' : ' ▼') : '');
  const dem = tq?.dem || {};
  const coLoc = loc.nguoi || loc.kho || loc.man || loc.nhom || q;
  const dongBo = ds?.dong_bo || tq?.dong_bo;

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
            </button>
          );
        })}
      </div>

      {/* Bộ lọc */}
      <div className="odn-loc">
        <label className="odn-tim"><IcSearch />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tên đơn, mã Odoo, cửa hàng, mã hàng, người tạo, ghi chú…" /></label>
        <DateBox label="Từ" value={loc.tu} onChange={(v) => setLoc((l) => ({ ...l, tu: v }))} />
        <DateBox label="Đến" value={loc.den} onChange={(v) => setLoc((l) => ({ ...l, den: v }))} />
        <Sel value={loc.kho} onChange={(v) => setLoc((l) => ({ ...l, kho: v }))} placeholder="Kho / cửa hàng"
          options={[{ value: '', label: 'Mọi kho / cửa hàng' }, ...(tq?.kho || []).map((k) => ({ value: k, label: k }))]} />
        {!laCH && <>
          <Sel value={loc.nguoi} onChange={(v) => setLoc((l) => ({ ...l, nguoi: v }))} placeholder="Người tạo"
            options={[{ value: '', label: 'Mọi người tạo' }, ...(tq?.nguoi || []).map((k) => ({ value: k, label: k }))]} />
          <Sel value={loc.man} onChange={(v) => setLoc((l) => ({ ...l, man: v }))} placeholder="Nguồn"
            options={[{ value: '', label: 'Mọi nguồn' }, ...Object.entries(MAN).map(([k, t]) => ({ value: k, label: t }))]} />
        </>}
        {coLoc && <button className="odn-nut-phu" onClick={() => { setQ(''); setLoc((l) => ({ ...l, nguoi: '', kho: '', man: '', nhom: '' })); }}>Bỏ lọc</button>}
        {!laCH && <button className="btn btn-ai odn-nut-chinh odn-tao" onClick={() => setTao(true)} title={odoo ? 'Tạo đơn điều chuyển mới' : 'Soạn đơn — tài khoản chưa mở gửi Odoo thì xuất Excel'}>
          <IcGuiLen /> Tạo đơn mới</button>}
      </div>

      {loi && <div className="odn-bao do"><IcAlert /> Không tải được: {loi} <button onClick={tai}>Thử lại</button></div>}

      {/* Danh sách */}
      <div className="odn-bang-khung">
        <table className="odn-bang">
          <thead><tr>
            <th className="sap" onClick={() => bamCot('name')}>Đơn{mt('name')}</th>
            <th className="sap" onClick={() => bamCot('kho_yeu_cau')}>Từ → đến{mt('kho_yeu_cau')}</th>
            <th className="sap so" onClick={() => bamCot('tong_sl')}>Số lượng{mt('tong_sl')}</th>
            <th className="sap" onClick={() => bamCot('buoc')}>Tiến trình trên Odoo{mt('buoc')}</th>
            <th>Cần chú ý</th>
            <th className="sap" onClick={() => bamCot('tao_luc')}>Tạo lúc{mt('tao_luc')}</th>
          </tr></thead>
          <tbody>
            {ds == null ? <tr><td colSpan={6} className="odn-trong">Đang tải đơn…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={6} className="odn-trong">{coLoc ? 'Không có đơn khớp bộ lọc.' : 'Chưa có đơn nào tạo từ app trong khoảng ngày này. Đơn tạo bằng nút "Tạo đơn Odoo" ở các màn chia hàng sẽ hiện ở đây.'}</td></tr>
              : rows.map((r) => (
                <tr key={r.id} className={chon === r.id ? 'on' : ''} onClick={() => setChon(r.id)}>
                  <td><div className="odn-ten">{r.name}</div>
                    <div className="odn-phu">{r.odoo_id ? `Odoo #${r.odoo_id}` : TT_GUI[r.trang_thai]?.[0] || r.trang_thai} · {MAN[r.man] || r.man || '—'}</div>
                    {r.ghi_chu && <div className="odn-gc-dong" title={r.ghi_chu}>✎ {r.ghi_chu}</div>}</td>
                  <td><div className="odn-ten nho">{r.kho_cung_ung} → {r.kho_yeu_cau}</div><div className="odn-phu">{r.ten_yeu_cau || ''}</div></td>
                  <td className="so"><b>{fmt(r.tong_sl)}</b><div className="odn-phu">{r.so_dong} dòng</div></td>
                  <td><TienTrinh r={r} /></td>
                  <td>{(r.canh || []).length ? <div className="odn-chips">{r.canh.map((c) => <Chip key={c} k={c} />)}</div> : <span className="odn-phu">—</span>}</td>
                  <td><div className="odn-ten nho">{gioNgay(r.tao_luc)}</div><div className="odn-phu">{r.nguoi_gui}{r.nguoi_tao && r.nguoi_tao !== r.nguoi_gui ? ' · Odoo: ' + r.nguoi_tao : ''}</div></td>
                </tr>
              ))}
          </tbody>
        </table>
        {ds && ds.tong > rows.length && <div className="odn-phu odn-chan-bang">Đang hiện {rows.length}/{fmt(ds.tong)} đơn mới nhất — thu hẹp bộ lọc để xem đơn cũ hơn.</div>}
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
        <div className="sub">{laCH ? 'Đơn điều chuyển về cửa hàng — xem trạng thái trên Odoo, huỷ hoặc sửa đơn. Tạo đơn mới ở màn Đề nghị hàng.'
          : 'Mọi đơn điều chuyển app tạo trên Odoo — tra cứu, theo dõi tiến trình, xử lý khi có sự cố.'}</div>
      </div>
      {noiDung}
    </>
  );
}

function Chip({ k }) {
  const c = CANH[k]; if (!c) return null;
  return <span className={'odn-chip ' + c[1]} title={c[2]}>{c[0]}</span>;
}

// Thanh tiến trình gọn trong bảng: 6 đốt (gửi → nhận) + nhãn bước
function TienTrinh({ r }) {
  const b = r.buoc ?? 2;
  const loiGui = r.trang_thai === 'loi' || r.trang_thai === 'can_xem' || r.trang_thai === 'da_bo';
  return (
    <div className={'odn-tt' + (b === -1 ? ' huy' : '') + (loiGui ? ' loi' : '')}>
      <div className="odn-tt-doi">{[2, 3, 4, 5, 6, 7].map((i) => <i key={i} className={b === -1 ? 'h' : i < b ? 'x' : i === b ? 'c' : ''} />)}</div>
      <span>{loiGui ? TT_GUI[r.trang_thai][0] : BUOC[b]}{r.odoo_ct && b >= 4 && b !== 7 ? ` · ${r.odoo_ct}` : ''}</span>
    </div>
  );
}

function BieuDoNgay({ ds }) {
  const max = Math.max(1, ...ds.map((d) => d.tong));
  return (
    <div className="odn-bd">
      <div className="odn-bd-dau"><b>Đơn tạo theo ngày</b><span><i className="ok" /> Odoo đã nhận <i className="do" /> Lỗi / cần xem</span></div>
      <div className="odn-bd-cot">
        {ds.map((d) => (
          <div key={d.ngay} className="odn-bd-c" title={`${ngay(d.ngay)}: ${d.tong} đơn · ${d.ok} đã nhận · ${d.loi} lỗi`}>
            <div className="odn-bd-thanh" style={{ height: (d.tong / max) * 100 + '%' }}>
              {d.loi > 0 && <i className="do" style={{ height: (d.loi / d.tong) * 100 + '%' }} />}
            </div>
            <span>{Number(String(d.ngay).slice(8, 10))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================= Ngăn chi tiết 1 đơn ================= */
export function NganChiTiet({ id, dong, odoo, saiXong, moDon }) {
  const { user, baoToast } = useApp();
  const laCH = user.vai_tro === 'CH';
  const [sua, setSua] = useState(false);
  const [ct, setCt] = useState(null);
  const [loi, setLoi] = useState('');
  const [hop, setHop] = useState(null);       // {loai, tieu_de}
  const [nd, setNd] = useState('');
  const [gui, setGui] = useState(false);
  const [moThua, setMoThua] = useState(false);
  const [layMoi, setLayMoi] = useState(false);

  const tai = useCallback(async () => {
    const { data, error } = await sb.rpc('fn_odoo_don_ct', { p_token: user.token, p_id: id });
    if (error) { setLoi(error.message); return; }
    if (!data?.ok) { setLoi(data?.loi || 'Không đọc được đơn'); return; }
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
  // NEW - 213: lấy phiếu xuất / nhận mới nhất của đơn này từ Odoo
  const layTuOdoo = async () => {
    setLayMoi(true);
    const k = await layMoiOdoo(user.token, [ct.name]);
    setLayMoi(false);
    baoToast(k.ok ? (k.so_don ? (k.so_doi ? 'Đã lấy mới từ Odoo — có thay đổi' : 'Đã lấy mới từ Odoo — chưa có gì thay đổi') : 'Odoo chưa có đơn này') : k.loi);
    tai(); saiXong();
  };

  // mốc thời gian từng bước — lấy từ nhật ký (lần đầu ghi nhận bước đó)
  const moc = useMemo(() => {
    if (!ct) return {};
    const m = { 1: ct.tao_luc, 2: ct.gui_luc };
    if (ct.trang_thai === 'thanh_cong' || ct.trang_thai === 'can_xem') m[3] = ct.xong_luc;
    (ct.su_kien || []).forEach((s) => { const b = s.du_lieu?.buoc; if (s.loai === 'odoo_tt' && b > 3 && !m[b]) m[b] = s.luc; });
    // NEW - 213: giờ thật trên Odoo (phiếu xuất / nhận xong)
    if (ct.kho_odoo?.xk_xong) m[6] = ct.kho_odoo.xk_xong;
    if (ct.kho_odoo?.nk_xong) m[7] = ct.kho_odoo.nk_xong;
    return m;
  }, [ct]);

  const coHuyApi = !!(ct?.quyen?.huy_odoo && ct?.huy_api?.huy_bat);
  const coSua = coHuyApi && !!odoo;

  return (
    <div className="kt-modal odn-nen" onMouseDown={(e) => { if (e.target === e.currentTarget) dong(); }}>
      <aside className="odn-ngan" role="dialog" aria-label="Chi tiết đơn Odoo">
        {!ct ? (
          <div className="odn-ngan-tai">{loi ? <><IcAlert /> {loi}</> : 'Đang tải chi tiết…'}<button className="odn-x" onClick={dong}>×</button></div>
        ) : (
          <>
            <header className="odn-ngan-dau">
              <div>
                <small>{MAN[ct.man] || ct.man || 'Đơn điều chuyển'} · {ct.ly_do}</small>
                <h2 onClick={() => chep(ct.name)} title="Bấm để chép tên đơn">{ct.name}</h2>
                <p>{ct.kho_cung_ung} → <b>{ct.kho_yeu_cau}</b>{ct.ten_yeu_cau ? ' · ' + ct.ten_yeu_cau : ''}
                  {ct.odoo_id && <> · <span className="odn-ma" onClick={() => chep(String(ct.odoo_id))} title="Mã phiếu trên Odoo — bấm để chép">Odoo #{ct.odoo_id}</span></>}</p>
              </div>
              <button className="odn-x" onClick={dong} aria-label="Đóng">×</button>
            </header>

            <div className="odn-ngan-than">
              {/* Timeline */}
              <section className="odn-tl">
                {BUOC_TL.map(([b, t]) => {
                  // đã đạt tới bước nào (reached) và lỗi ở bước nào (errAt)
                  const hien = ct.buoc ?? 2; const tt = ct.trang_thai;
                  let reached = hien, errAt = null;
                  if (tt === 'loi' || tt === 'da_bo') { reached = 1; errAt = 2; }
                  else if (tt === 'can_xem' && hien === 3) { reached = 2; errAt = 3; }
                  else if (tt === 'dang_gui') reached = 1;
                  else if (hien === -1) reached = 3;
                  const loiTai = b === errAt;
                  const huy = hien === -1 && b === 4;
                  const xong = b <= reached;
                  const dang = !xong && !loiTai && !huy && hien !== -1 && b === reached + 1;
                  return (
                    <div key={b} className={'odn-tl-b' + (xong ? ' xong' : '') + (dang ? ' dang' : '') + (loiTai ? ' loi' : '') + (huy ? ' huy' : '')}>
                      <i>{xong ? <IcCheck /> : loiTai || huy ? '!' : b}</i>
                      <b>{huy ? (ct.odoo_ct || 'Bị huỷ') : loiTai ? (tt === 'da_bo' ? 'Đã bỏ' : tt === 'can_xem' ? 'Phản hồi chưa rõ' : 'Gửi lỗi') : t}</b>
                      <span>{moc[b] ? ((b === 6 && ct.kho_odoo?.xk_xong) ? 'xuất ' : (b === 7 && ct.kho_odoo?.nk_xong) ? 'nhận ' : b >= 4 ? 'ghi nhận ' : '') + gioNgay(moc[b]) : b === 6 && ct.odoo_sl?.ngay_xuat ? 'xuất ' + ngay(ct.odoo_sl.ngay_xuat) : ''}</span>
                    </div>
                  );
                })}
              </section>
              <p className="odn-tl-ghi">Bước 4–7 theo dữ liệu Odoo (lần lấy gần nhất {gioNgay(ct.kho_odoo?.lay_luc || ct.dck_luc)}). Giờ xuất / nhận là giờ thật trên Odoo; bước 4–5 là lúc app ghi nhận thay đổi.</p>

              {/* Cảnh báo + hướng xử lý */}
              {(ct.canh || []).filter((k) => CANH[k]).map((k) => (
                <div key={k} className={'odn-bao ' + CANH[k][1]}><IcAlert /><div><b>{CANH[k][0]}</b>{CANH[k][2]}
                  {k === 'loi' && ct.loi && <code>{ct.loi}</code>}
                  {k === 'trung' && ct.trung_voi && <code>Giống đơn {ct.trung_voi}</code>}</div></div>
              ))}
              {/* Thông tin người dùng ghi khi tạo đơn — dùng đủ mọi trường gửi Odoo */}
              <section className="odn-tt-don">
                <div><span>Ghi chú</span><b className={ct.ghi_chu ? '' : 'trong'}>{ct.ghi_chu || 'không ghi chú'}</b></div>
                <div><span>Người tạo trên Odoo</span><b>{ct.nguoi_tao || 'user của kho yêu cầu'}</b></div>
                <div><span>Người gửi từ app</span><b>{ct.nguoi_gui || '—'}</b></div>
                <div><span>Lý do</span><b>{ct.ly_do || '—'}</b></div>
                {ct.tai_lieu_nguon && ct.tai_lieu_nguon !== ct.name && <div><span>Tài liệu nguồn</span><b>{ct.tai_lieu_nguon}</b></div>}
                {ct.sale_tai_cua_hang && <div><span>CH đội đang sale</span><b>{ct.sale_tai_cua_hang}</b></div>}
                {ct.odoo_duyet && <div><span>Odoo khi tạo</span><b className={ct.odoo_duyet === 'giu_nhap' ? 'canh' : 'ok'}>{ct.odoo_duyet === 'giu_nhap' ? 'Giữ NHÁP (chưa duyệt)' : 'Tự duyệt ngay'}</b></div>}
              </section>

              {ct.huy && (
                <div className={'odn-yc ' + (ct.huy.trang_thai === 'xong' ? 'xong' : ct.huy.trang_thai === 'loi' ? 'tu_choi' : '')}>
                  <b>{ct.huy.hanh_dong === 'xoa' ? 'Xoá' : 'Huỷ'} trên Odoo qua API · {{ dang_gui: 'đang gửi', xong: 'Odoo đã xác nhận', loi: 'Odoo từ chối' }[ct.huy.trang_thai] || ct.huy.trang_thai}</b>
                  <p>{ct.huy.ly_do}</p>
                  <span>{ct.huy.nguoi} · {gioNgay(ct.huy.luc)}{ct.huy.ket_qua ? ' — ' + ct.huy.ket_qua : ''}</span>
                  {ct.huy.sua_thanh && <div className="odn-sua-lk">Đã sửa → đơn mới <b>{ct.huy.sua_thanh}</b>
                    {moDon && ct.huy.sua_thanh_id && <button className="odn-link" onClick={() => moDon(ct.huy.sua_thanh_id)}>Mở đơn mới</button>}</div>}
                  {ct.huy.sua_loi && <div className="odn-sua-lk loi">Đã huỷ để sửa nhưng chưa tạo được đơn mới: {ct.huy.sua_loi} — tạo lại đơn từ Đề nghị hàng.</div>}
                </div>
              )}
              {ct.yeu_cau && (
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
                {['loi', 'can_xem'].includes(ct.trang_thai) && !ct.odoo_id && !ct.odoo_tt && ct.quyen?.yeu_cau &&
                  <button className="odn-nut-phu" onClick={() => setHop({ loai: 'bo', tieu: 'Bỏ đơn lỗi', goi_y: 'Lý do bỏ (không bắt buộc)', xong: 'Đã bỏ đơn lỗi' })}>Bỏ đơn</button>}
                {coSua && <button className="btn btn-ai odn-nut-chinh" onClick={() => setSua(true)}>Sửa đơn</button>}
                {coHuyApi &&
                  <button className="odn-nut-phu do" onClick={() => setHop({ loai: 'huy_api', tieu: 'Huỷ đơn trên Odoo', goi_y: 'Lý do huỷ (bắt buộc)', xong: 'Odoo đã huỷ đơn' })}>Huỷ đơn</button>}
                {!coHuyApi && ct.trang_thai === 'thanh_cong' && ct.buoc >= 3 && ct.yeu_cau?.trang_thai !== 'cho' && ct.quyen?.yeu_cau && <>
                  {ct.buoc <= 5 && <button className="odn-nut-phu" onClick={() => setHop({ loai: 'huy', tieu: 'Yêu cầu huỷ đơn', goi_y: 'Lý do huỷ — kho sẽ huỷ trên Odoo', xong: 'Đã gửi yêu cầu huỷ' })}>Yêu cầu huỷ</button>}
                  <button className="odn-nut-phu" onClick={() => setHop({ loai: 'dieu_chinh', tieu: 'Yêu cầu điều chỉnh', goi_y: ct.buoc >= 6 ? 'Cần xử lý gì: trả hàng, thiếu / thừa số lượng…' : 'Cần sửa gì: mã, số lượng, kho…', xong: 'Đã gửi yêu cầu điều chỉnh' })}>Yêu cầu điều chỉnh</button>
                </>}
                {ct.yeu_cau?.trang_thai === 'cho' && ct.quyen?.xu_ly && <>
                  <button className="odn-nut-phu xanh" onClick={() => setHop({ loai: 'xong', tieu: 'Đã xử lý trên Odoo', goi_y: 'Đã làm gì trên Odoo (không bắt buộc)', xong: 'Đã đóng yêu cầu' })}><IcCheck /> Đã xử lý</button>
                  <button className="odn-nut-phu" onClick={() => setHop({ loai: 'tu_choi', tieu: 'Từ chối yêu cầu', goi_y: 'Lý do từ chối', xong: 'Đã từ chối yêu cầu' })}>Từ chối</button>
                </>}
                {ct.quyen?.xoa_odoo && ct.huy_api?.xoa_bat &&
                  <button className="odn-nut-phu do" onClick={() => setHop({ loai: 'xoa_api', tieu: 'Xoá đơn trên Odoo', goi_y: 'Lý do xoá (bắt buộc)', xong: 'Odoo đã xoá đơn' })}>Xoá trên Odoo</button>}
                {ct.quyen?.nha_ton && (ct.ton?.dong || []).some((d) => d.dang_tru > 0) &&
                  <button className="odn-nut-phu" onClick={() => setHop({ loai: 'nha', tieu: 'Giải phóng tồn đang giữ', goi_y: 'Lý do giải phóng (bắt buộc)', xong: 'Đã trả lại tồn khả dụng' })}>Giải phóng tồn</button>}
                <button className="odn-nut-phu" onClick={() => setHop({ loai: 'ghi_chu', tieu: 'Ghi chú vào nhật ký', goi_y: 'Ghi chú', xong: 'Đã ghi chú' })}>Ghi chú</button>
              </div>
              {ct.trang_thai === 'thanh_cong' && ct.buoc >= 6 && <p className="odn-phu">Đơn đã xuất kho trên Odoo — không huỷ / sửa được nữa. Cần trả hàng / điều chỉnh: gửi Yêu cầu điều chỉnh để kho xử lý.</p>}

              {/* NEW - 213: phiếu xuất / nhận lấy thẳng từ Odoo + vận đơn */}
              {(ct.trang_thai === 'thanh_cong' || ct.kho_odoo) && (
                <section className="odn-muc">
                  <h3>Kho xuất · cửa hàng nhận <span>{ct.kho_odoo?.lay_luc ? 'lấy từ Odoo ' + gioNgay(ct.kho_odoo.lay_luc) : 'chưa lấy từ Odoo'}</span>
                    <button className="odn-nut-phu odn-lay" onClick={layTuOdoo} disabled={layMoi}><IcRefresh /> {layMoi ? 'Đang hỏi Odoo…' : 'Lấy mới từ Odoo'}</button></h3>
                  {!ct.kho_odoo ? <p className="odn-phu">App chưa lấy phiếu xuất / nhận của đơn này — bấm Lấy mới từ Odoo, hoặc chờ lượt chạy ngầm vài phút.</p>
                    : ct.kho_odoo.khong_thay > 0 && !ct.kho_odoo.state ? <p className="odn-phu">Odoo không trả đơn này (đã xoá hoặc sai tên) — kiểm tra trên Odoo.</p> : (<>
                    <div className="odn-kho">
                      {[['xk', 'Kho xuất', ct.kho_odoo.sl_xuat, 'đã xuất'], ['nk', 'Cửa hàng nhận', ct.kho_odoo.sl_nhan, 'đã nhận']].map(([k, t, so, nhan]) => {
                        const ds = ct.kho_odoo[k] || [];
                        const xong = ds.length > 0 && ds.every((p) => p.state === 'done' || p.state === 'cancel');
                        return (
                          <div key={k} className={'odn-kho-o' + (xong ? ' xong' : ds.length ? ' dang' : '')}>
                            <div className="odn-kho-dau"><b>{t}</b><span><b>{fmt(so || 0)}</b> / {fmt(ct.kho_odoo.sl_nhu_cau || 0)} {nhan}</span></div>
                            {ds.length === 0 ? <em>{k === 'xk' ? 'Chưa có phiếu xuất (đơn chưa duyệt)' : 'Chưa có phiếu nhận'}</em> : ds.map((p) => (
                              <div key={p.name} className="odn-kho-pk">
                                <span className="odn-ma" onClick={() => chep(p.name)} title="Bấm để chép mã phiếu">{p.name}</span>
                                <i className={'odn-pk-tt ' + (p.state || '')}>{TT_PK[p.state] || p.state}</i>
                                <small>{p.xong ? gioNgay(p.xong) : ''}{p.kho ? ' · ' + p.kho : ''}</small>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                    {(ct.van_don || []).length > 0 && (
                      <div className="odn-vd">
                        <b>Vận đơn</b>
                        {ct.van_don.map((v) => (
                          <div key={v.label} className="odn-vd-dong">
                            <span className="odn-ma" onClick={() => chep(v.label)} title="Bấm để chép mã vận đơn">{v.label}</span>
                            <i className={'odn-vd-tt ' + (v.nhom || '')}>{NHOM_VD[v.nhom] || v.tt || '—'}</i>
                            <small>{v.lay ? 'lấy ' + ngay(v.lay) : ''}{v.giao ? ' · giao ' + ngay(v.giao) : ''}{v.ly_do ? ' · ' + v.ly_do : ''}</small>
                          </div>
                        ))}
                      </div>
                    )}
                  </>)}
                </section>
              )}

              {/* Đối chiếu */}
              <section className="odn-muc">
                <h3>Hàng trong đơn <span>{ct.so_dong} dòng · {fmt(ct.tong_sl)} cái</span></h3>
                {ct.doi_chieu?.co_du_lieu ? (
                  <div className={'odn-dc' + (ct.doi_chieu.lech || ct.doi_chieu.thieu || ct.doi_chieu.thua ? ' lech' : '')}>
                    {ct.doi_chieu.lech || ct.doi_chieu.thieu || ct.doi_chieu.thua
                      ? <>Đối chiếu Odoo: <b>{ct.doi_chieu.khop}</b> dòng khớp · <b>{ct.doi_chieu.lech}</b> lệch số lượng · <b>{ct.doi_chieu.thieu}</b> chưa có trên Odoo · <b>{ct.doi_chieu.thua}</b> chỉ có trên Odoo</>
                      : <><IcCheck /> Khớp hoàn toàn với Odoo: {ct.doi_chieu.so_dong_odoo} dòng · {fmt(ct.doi_chieu.sl_odoo)} cái</>}
                  </div>
                ) : <div className="odn-dc cho">Chưa có dữ liệu Odoo cho đơn này — chưa đối chiếu được từng dòng.</div>}
                <table className="odn-ct">
                  <thead><tr><th>Mã hàng</th><th className="so">App gửi</th><th className="so">Odoo</th><th className="so">Đã xuất</th><th className="so">Đã nhận</th></tr></thead>
                  <tbody>{(ct.dong || []).map((d, i) => (
                    <tr key={i} className={d.khop || ''}>
                      <td><b>{d.ma}</b><span>{d.barcode}{d.sku ? ' · SKU ' + d.sku : ''}</span></td>
                      <td className="so">{fmt(d.nhu_cau)}</td>
                      <td className="so">{d.odoo ? fmt(d.odoo.nhu_cau) : '—'}</td>
                      <td className="so">{d.odoo ? fmt(d.odoo.da_xuat) : '—'}</td>
                      <td className="so">{d.odoo ? fmt(d.odoo.da_nhap) : '—'}</td>
                    </tr>
                  ))}</tbody>
                </table>
                {(ct.dong_thua || []).length > 0 && (
                  <button className="odn-link" onClick={() => setMoThua(!moThua)}>{moThua ? 'Ẩn' : 'Xem'} {ct.dong_thua.length} dòng chỉ có trên Odoo</button>)}
                {moThua && <table className="odn-ct"><tbody>{ct.dong_thua.map((d, i) => (
                  <tr key={i} className="thua"><td><b>{d.ma}</b><span>{d.barcode} · {d.ten || ''}</span></td><td className="so">{fmt(d.nhu_cau)}</td><td>{d.tt}</td></tr>))}</tbody></table>}
              </section>

              {/* Ảnh hưởng tồn kho (không hiện với tài khoản cửa hàng) */}
              {!laCH && <section className="odn-muc">
                <h3>Ảnh hưởng tồn khả dụng <span>kho {ct.kho_cung_ung} · đang trừ {fmt((ct.ton?.dong || []).reduce((a, d) => a + (d.dang_tru || 0), 0))} cái</span></h3>
                {(ct.ton?.dong || []).length === 0 ? <p className="odn-phu">Đơn tạo trước khi có sổ tồn (21/11) hoặc chưa gửi — không giữ tồn.</p> : (
                  <table className="odn-ct">
                    <thead><tr><th>Mã hàng</th><th className="so">Đặt</th><th className="so">Đã xuất</th><th className="so">Đang trừ</th><th>Trạng thái</th></tr></thead>
                    <tbody>{ct.ton.dong.map((d, i) => (
                      <tr key={i}><td><b>{d.ma}</b><span>{d.barcode}</span></td><td className="so">{fmt(d.sl_dat)}</td><td className="so">{fmt(d.sl_xuat)}</td>
                        <td className="so"><b>{fmt(d.dang_tru)}</b></td><td><span className="odn-phu">{TT_CK[d.trang_thai] || d.trang_thai}{d.nguon === 'odoo' ? ' · theo Odoo' : ''}</span></td></tr>))}</tbody>
                  </table>)}
                {(ct.ton?.nhat_ky || []).length > 0 && (
                  <details className="odn-tho odn-ton-nk"><summary>Nhật ký tồn của đơn ({ct.ton.nhat_ky.length})</summary>
                    <ol className="odn-nk">{[...ct.ton.nhat_ky].reverse().map((n, i) => (
                      <li key={i} className={n.anh_huong < 0 ? 'bo' : n.anh_huong > 0 ? 'ket_qua' : ''}>
                        <span className="t">{gioNgay(n.luc)}</span>
                        <div><b>{n.noi_dung}</b><em>{n.barcode} · {n.anh_huong > 0 ? '+' : n.anh_huong < 0 ? '−' : ''}{n.anh_huong ? fmt(Math.abs(n.anh_huong)) : fmt(n.sl) + ' (không đổi khả dụng)'}{n.nguoi ? ' · ' + n.nguoi : ''}</em></div>
                      </li>))}</ol>
                  </details>)}
              </section>}

              {/* Nhật ký */}
              <section className="odn-muc">
                <h3>Nhật ký xử lý <span>{(ct.su_kien || []).length} sự kiện</span></h3>
                <ol className="odn-nk">
                  {[...(ct.su_kien || [])].reverse().map((s, i) => (
                    <li key={i} className={s.loai}>
                      <span className="t">{gioNgay(s.luc)}</span>
                      <div><b>{s.noi_dung}</b>{s.nguoi && <em>{s.nguoi}</em>}</div>
                    </li>
                  ))}
                </ol>
              </section>

              {!laCH && <details className="odn-tho">
                <summary>Dữ liệu kỹ thuật (JSON đã gửi · phản hồi Odoo)</summary>
                <pre>{JSON.stringify({ gui: ct.payload, phan_hoi: ct.phan_hoi, http: ct.http }, null, 2)}</pre>
              </details>}
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
              {hop.loai === 'nha' && <p>Trả lại tồn khả dụng đơn này đang giữ (vd kho báo sẽ không xuất). Đơn trên Odoo KHÔNG đổi. Nếu dữ liệu Odoo sau đó vẫn thấy đơn đang chờ xuất, hệ thống tự trừ lại.</p>}
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
