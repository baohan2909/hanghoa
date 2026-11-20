import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { useApp } from '../App.jsx';
import { Sel, DateBox, isoVN } from '../lib/ui.jsx';
import { IcRefresh, IcSearch, IcAlert, IcCheck, IcGuiLen, IcClock } from '../lib/icons.jsx';
import { useOdooCfg, moOdoo } from '../lib/odoo.js';

// ============================================================================
// QUẢN LÝ ĐƠN ODOO (v3.116.0 — SQL 206)
//   Mọi đơn app tạo trên Odoo: tra cứu, timeline, đối chiếu app ↔ Odoo, xử lý (gửi lại / bỏ / yêu cầu huỷ – điều chỉnh).
//   Trạng thái thực tế = dữ liệu điều chuyển đồng bộ từ Odoo (dieu_chuyen_kho, ~10 phút/lần) — app KHÔNG tự suy đoán.
//   Odoo chưa có API huỷ / sửa / tra trạng thái: yêu cầu huỷ – điều chỉnh được ghi lại cho kho xử lý trên Odoo.
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
};
const MAN = { de_nghi: 'Đề nghị hàng', chia_moi: 'Chia hàng mới', dieu_phoi: 'Yêu cầu ĐP', doi_sale: 'Đội Sale', ds_ban_chia: 'Bàn chia đội' };
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
  const [loc, setLoc] = useState(() => ({ tu: truNgay(29), den: isoVN(), nguoi: '', kho: '', man: '', nhom: locDau || '', ...(locDau && typeof locDau === 'object' ? locDau : {}) }));
  const [q, setQ] = useState('');
  const [qTre, setQTre] = useState('');
  const [tq, setTq] = useState(null);
  const [ds, setDs] = useState(null);
  const [loi, setLoi] = useState('');
  const [dangTai, setDangTai] = useState(false);
  const [chon, setChon] = useState(null);     // id đơn đang mở
  const [sap, setSap] = useState({ k: 'tao_luc', d: -1 });
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
    const { error } = await sb.rpc('fn_odoo_lam_moi', { p_token: user.token });
    if (error) { setDangTai(false); baoToast('Không làm mới được: ' + error.message); return; }
    await tai(); baoToast('Đã đối chiếu lại với dữ liệu Odoo mới nhất');
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
          <em>đồng bộ khoảng 10 phút/lần — không phải thời gian thực</em></span>
        <span className="odn-api">
          <i className="ok">Tạo đơn qua API</i><i className="ok">Trạng thái theo dữ liệu đồng bộ</i><i className="cho">Huỷ / sửa trên Odoo: chưa có API</i>
        </span>
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
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tên đơn, mã Odoo, cửa hàng, mã hàng, người tạo…" /></label>
        <DateBox label="Từ" value={loc.tu} onChange={(v) => setLoc((l) => ({ ...l, tu: v }))} />
        <DateBox label="Đến" value={loc.den} onChange={(v) => setLoc((l) => ({ ...l, den: v }))} />
        <Sel value={loc.kho} onChange={(v) => setLoc((l) => ({ ...l, kho: v }))} placeholder="Kho / cửa hàng"
          options={[{ value: '', label: 'Mọi kho / cửa hàng' }, ...(tq?.kho || []).map((k) => ({ value: k, label: k }))]} />
        <Sel value={loc.nguoi} onChange={(v) => setLoc((l) => ({ ...l, nguoi: v }))} placeholder="Người tạo"
          options={[{ value: '', label: 'Mọi người tạo' }, ...(tq?.nguoi || []).map((k) => ({ value: k, label: k }))]} />
        <Sel value={loc.man} onChange={(v) => setLoc((l) => ({ ...l, man: v }))} placeholder="Nguồn"
          options={[{ value: '', label: 'Mọi nguồn' }, ...Object.entries(MAN).map(([k, t]) => ({ value: k, label: t }))]} />
        {coLoc && <button className="odn-nut-phu" onClick={() => { setQ(''); setLoc((l) => ({ ...l, nguoi: '', kho: '', man: '', nhom: '' })); }}>Bỏ lọc</button>}
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
                    <div className="odn-phu">{r.odoo_id ? `Odoo #${r.odoo_id}` : TT_GUI[r.trang_thai]?.[0] || r.trang_thai} · {MAN[r.man] || r.man || '—'}</div></td>
                  <td><div className="odn-ten nho">{r.kho_cung_ung} → {r.kho_yeu_cau}</div><div className="odn-phu">{r.ten_yeu_cau || ''}</div></td>
                  <td className="so"><b>{fmt(r.tong_sl)}</b><div className="odn-phu">{r.so_dong} dòng</div></td>
                  <td><TienTrinh r={r} /></td>
                  <td>{(r.canh || []).length ? <div className="odn-chips">{r.canh.map((c) => <Chip key={c} k={c} />)}</div> : <span className="odn-phu">—</span>}</td>
                  <td><div className="odn-ten nho">{gioNgay(r.tao_luc)}</div><div className="odn-phu">{r.nguoi_gui}</div></td>
                </tr>
              ))}
          </tbody>
        </table>
        {ds && ds.tong > rows.length && <div className="odn-phu odn-chan-bang">Đang hiện {rows.length}/{fmt(ds.tong)} đơn mới nhất — thu hẹp bộ lọc để xem đơn cũ hơn.</div>}
      </div>

      {tq?.theo_ngay?.length > 0 && <BieuDoNgay ds={tq.theo_ngay} />}

      {chon && <NganChiTiet id={chon} dong={() => setChon(null)} odoo={odoo} saiXong={tai} />}
    </div>
  );

  if (nhung) return noiDung;
  return (
    <>
      <div className="cmdbar">
        <h1>Đơn hàng Odoo</h1>
        <div className="sub">Mọi đơn điều chuyển app tạo trên Odoo — tra cứu, theo dõi tiến trình, xử lý khi có sự cố.</div>
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
function NganChiTiet({ id, dong, odoo, saiXong }) {
  const { user, baoToast } = useApp();
  const [ct, setCt] = useState(null);
  const [loi, setLoi] = useState('');
  const [hop, setHop] = useState(null);       // {loai, tieu_de}
  const [nd, setNd] = useState('');
  const [gui, setGui] = useState(false);
  const [moThua, setMoThua] = useState(false);

  const tai = useCallback(async () => {
    const { data, error } = await sb.rpc('fn_odoo_don_ct', { p_token: user.token, p_id: id });
    if (error) { setLoi(error.message); return; }
    if (!data?.ok) { setLoi(data?.loi || 'Không đọc được đơn'); return; }
    setLoi(''); setCt(data);
  }, [id, user.token]);
  useEffect(() => { setCt(null); tai(); }, [tai]);
  useEffect(() => { const h = (e) => { if (e.key === 'Escape' && !hop) dong(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [dong, hop]);

  const thucHien = async () => {
    if (!hop) return;
    setGui(true);
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
        ten_yeu_cau: ct.ten_yeu_cau, ghi_chu: p.ghi_chu || '', ly_do: p.ly_do, nguoi_tao: p.nguoi_tao,
        chi_tiet: (ct.dong || []).map((d) => ({ sku: d.sku, barcode: d.barcode, nhu_cau: d.nhu_cau, ma: d.ma })) }],
      onDong: () => { tai(); saiXong(); },
    });
  };
  const chep = (t) => { try { navigator.clipboard.writeText(t); baoToast('Đã chép ' + t); } catch { /* bỏ qua */ } };

  // mốc thời gian từng bước — lấy từ nhật ký (lần đầu ghi nhận bước đó)
  const moc = useMemo(() => {
    if (!ct) return {};
    const m = { 1: ct.tao_luc, 2: ct.gui_luc };
    if (ct.trang_thai === 'thanh_cong' || ct.trang_thai === 'can_xem') m[3] = ct.xong_luc;
    (ct.su_kien || []).forEach((s) => { const b = s.du_lieu?.buoc; if (s.loai === 'odoo_tt' && b > 3 && !m[b]) m[b] = s.luc; });
    return m;
  }, [ct]);

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
                      <span>{moc[b] ? (b >= 4 ? 'ghi nhận ' : '') + gioNgay(moc[b]) : b === 6 && ct.odoo_sl?.ngay_xuat ? 'xuất ' + ngay(ct.odoo_sl.ngay_xuat) : ''}</span>
                    </div>
                  );
                })}
              </section>
              <p className="odn-tl-ghi">Bước 4–7 lấy theo dữ liệu Odoo đồng bộ (lần gần nhất {gioNgay(ct.dck_luc)}). Mốc giờ là lúc app ghi nhận thay đổi, không phải giờ thao tác trên Odoo.</p>

              {/* Cảnh báo + hướng xử lý */}
              {(ct.canh || []).filter((k) => CANH[k]).map((k) => (
                <div key={k} className={'odn-bao ' + CANH[k][1]}><IcAlert /><div><b>{CANH[k][0]}</b>{CANH[k][2]}
                  {k === 'loi' && ct.loi && <code>{ct.loi}</code>}
                  {k === 'trung' && ct.trung_voi && <code>Giống đơn {ct.trung_voi}</code>}</div></div>
              ))}
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
                {ct.trang_thai === 'thanh_cong' && ct.buoc >= 3 && ct.buoc <= 5 && ct.yeu_cau?.trang_thai !== 'cho' && ct.quyen?.yeu_cau && <>
                  <button className="odn-nut-phu" onClick={() => setHop({ loai: 'huy', tieu: 'Yêu cầu huỷ đơn', goi_y: 'Lý do huỷ — kho sẽ huỷ trên Odoo', xong: 'Đã gửi yêu cầu huỷ' })}>Yêu cầu huỷ</button>
                  <button className="odn-nut-phu" onClick={() => setHop({ loai: 'dieu_chinh', tieu: 'Yêu cầu điều chỉnh', goi_y: 'Cần sửa gì: mã, số lượng, kho…', xong: 'Đã gửi yêu cầu điều chỉnh' })}>Yêu cầu điều chỉnh</button>
                </>}
                {ct.yeu_cau?.trang_thai === 'cho' && ct.quyen?.xu_ly && <>
                  <button className="odn-nut-phu xanh" onClick={() => setHop({ loai: 'xong', tieu: 'Đã xử lý trên Odoo', goi_y: 'Đã làm gì trên Odoo (không bắt buộc)', xong: 'Đã đóng yêu cầu' })}><IcCheck /> Đã xử lý</button>
                  <button className="odn-nut-phu" onClick={() => setHop({ loai: 'tu_choi', tieu: 'Từ chối yêu cầu', goi_y: 'Lý do từ chối', xong: 'Đã từ chối yêu cầu' })}>Từ chối</button>
                </>}
                <button className="odn-nut-phu" onClick={() => setHop({ loai: 'ghi_chu', tieu: 'Ghi chú vào nhật ký', goi_y: 'Ghi chú', xong: 'Đã ghi chú' })}>Ghi chú</button>
              </div>
              {ct.trang_thai === 'thanh_cong' && ct.buoc >= 6 && <p className="odn-phu">Đơn đã xuất kho trên Odoo — không huỷ / sửa được nữa. Hàng đã đi: làm phiếu trả hàng hoặc điều chuyển ngược.</p>}

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

              <details className="odn-tho">
                <summary>Dữ liệu kỹ thuật (JSON đã gửi · phản hồi Odoo)</summary>
                <pre>{JSON.stringify({ gui: ct.payload, phan_hoi: ct.phan_hoi, http: ct.http }, null, 2)}</pre>
              </details>
            </div>
          </>
        )}

        {hop && (
          <div className="odn-hop-nen" onMouseDown={(e) => { if (e.target === e.currentTarget) setHop(null); }}>
            <div className="odn-hop">
              <b>{hop.tieu}</b>
              {hop.loai === 'huy' && <p>Odoo chưa có API huỷ: yêu cầu được ghi vào nhật ký đơn để kho huỷ trên Odoo. App tự đóng yêu cầu khi dữ liệu Odoo báo "Bị hủy".</p>}
              {hop.loai === 'dieu_chinh' && <p>Yêu cầu được ghi vào nhật ký đơn để kho sửa trên Odoo. Số liệu trong app không tự đổi.</p>}
              <textarea autoFocus value={nd} onChange={(e) => setNd(e.target.value)} placeholder={hop.goi_y} rows={3} maxLength={1000} />
              <div className="odn-hop-chan">
                <button className="odn-nut-phu" onClick={() => setHop(null)}>Huỷ</button>
                <button className="btn btn-ai odn-nut-chinh" disabled={gui} onClick={thucHien}>{gui ? 'Đang lưu…' : hop.tieu}</button>
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
