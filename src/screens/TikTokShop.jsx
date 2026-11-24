import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { useApp } from '../App.jsx';
import { Sel, DateBox, isoVN } from '../lib/ui.jsx';
import { IcRefresh, IcSearch, IcAlert, IcClock, IcGuiLen, IcCheck } from '../lib/icons.jsx';

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

export default function TikTokShop() {
  const { user, baoToast } = useApp();
  const [loc, setLoc] = useState(() => ({ tu: truNgay(6), den: isoVN(), kenh: '', dm: '', tt: '', nb: null, ch: null }));
  const [q, setQ] = useState('');
  const [qTre, setQTre] = useState('');
  const [bc, setBc] = useState(null);
  const [loi, setLoi] = useState('');
  const [dang, setDang] = useState(false);
  const [api, setApi] = useState(null);
  const [the, setThe] = useState('tq');
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

  const tai = useCallback(async () => {
    setDang(true);
    const { data, error } = await sb.rpc('fn_tt_bao_cao', { p_token: user.token, p_loc: pLoc });
    setDang(false);
    if (error) { setLoi(error.message); return; }
    setLoi(''); setBc(data);
  }, [user.token, pLoc]);
  useEffect(() => { tai(); }, [tai]);

  const taiApi = useCallback(async () => {
    const { data } = await sb.rpc('fn_tt_api_tt', { p_token: user.token });
    if (data) setApi(data);
  }, [user.token]);
  useEffect(() => { taiApi(); }, [taiApi]);
  // đang kéo đơn → hỏi lại mỗi 8 giây, xong thì tải lại báo cáo
  const dangKeoTruoc = useRef(false);
  useEffect(() => {
    if (!api?.dang_keo) { if (dangKeoTruoc.current) { dangKeoTruoc.current = false; tai(); } return; }
    dangKeoTruoc.current = true;
    const t = setTimeout(taiApi, 8000);
    return () => clearTimeout(t);
  }, [api, taiApi, tai]);

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

  return (
    <>
      <div className="cmdbar">
        <h1>TikTok Shop</h1>
        <div className="sub">Đơn bán trên TikTok Shop — số đơn, số lượng, doanh thu theo sản phẩm, người bán, cửa hàng và kênh LIVE / Video / Thẻ sản phẩm. Tự lấy qua API mỗi 5 phút; nạp thêm file Excel khi cần.</div>
      </div>
      <div className="odn tts">
        {/* Nguồn dữ liệu */}
        <div className="odn-dong-bo">
          <span className="odn-db-i"><IcClock /> Dữ liệu có từ <b>{kho?.tu ? ngayVN(kho.tu) : '—'}</b> đến <b>{kho?.den ? ngayVN(kho.den) : '—'}</b>
            <em>· {fmt(kho?.tong_don || 0)} đơn{napCuoi ? ` · lần nạp cuối ${gioNgay(napCuoi.luc)} (${napCuoi.nguon === 'api' ? 'API' : 'Excel'})` : ''}</em></span>
          <span className="odn-api">
            {api?.ket_noi
              ? <i className="ok" title={api.keo_luc ? 'Lần lấy cuối ' + gioNgay(api.keo_luc) : ''}>API đã kết nối{api.shop_ten ? ' · ' + api.shop_ten : ''}{api.keo_luc ? ' · lấy lúc ' + gioNgay(api.keo_luc) : ''}</i>
              : <i className="cho">API chưa kết nối — đang dùng file Excel</i>}
            {api?.dang_keo && <i className="ok">Đang lấy đơn…</i>}
            {/* NEW - 3.145: lệch mà hệ thống đang tự kéo bù → vàng; chỉ báo đỏ khi kéo bù 3 lần vẫn chưa khớp */}
            {api?.ds_luc && (soKet(api) > 0
              ? <i className="do" title="Có ngày đã tự kéo bù 3 lần vẫn chưa khớp TikTok — xem thẻ Đối soát">Đối soát: lệch {fmt(soKet(api))} ngày</i>
              : soLech(api) > 0
                ? <i className="lech" title="Có ngày app còn ít đơn hơn TikTok — hệ thống đang tự kéo bù, 15 phút kiểm lại một lần">Đang kéo bù {fmt(soLech(api))} ngày</i>
                : <i className="ok" title="Số đơn, đơn liên kết, trả hàng từng ngày khớp TikTok — tự đối soát 3 giờ/lần">Đối soát khớp {fmt((api.doi_soat || []).length)} ngày</i>)}
            {(api?.ar_kq?.luc || api?.lk_kq?.luc) && <i className="ok" title="ID người bán theo từng mã đơn (báo cáo phân tích TikTok 20 phút/lần + API liên kết 5 phút/lần)">ID từng đơn lúc {gioNgay(api.ar_kq?.luc || api.lk_kq.luc)}</i>}
            {api?.tk_luc && <i className="ok" title="Phiên LIVE + video có ID người bán (TikTok thống kê), chạy mỗi 60 phút">Thống kê LIVE/video lúc {gioNgay(api.tk_luc)}</i>}
            {api?.loi && <i className="do" title={api.loi}>Lỗi API: {String(api.loi).slice(0, 60)}</i>}
          </span>
          {api?.ket_noi && <button className="odn-nut-phu" onClick={keoNgay} disabled={api?.dang_keo}><IcRefresh /> Lấy ngay từ TikTok</button>}
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
          {dang && <span className="odn-phu">Đang tải…</span>}
        </div>

        {loi && <div className="odn-bao do"><IcAlert /> Không tải được: {loi} <button onClick={tai}>Thử lại</button></div>}

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
          {[['tq', 'Tổng quan'], ['sp', 'Sản phẩm', bc?.sp?.length], ['nb', 'Người bán', bc ? new Set([...(bc.nb || []).map((x) => x.nb).filter(Boolean), ...Object.keys(bc.live_nb || {}), ...Object.keys(bc.video_nb || {})]).size : null],
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
          : the === 'sp' ? <BangSanPham ds={bc.sp} />
          : the === 'nb' ? <BangNguoiBan bc={bc} chon={(nb) => { setLoc((l) => ({ ...l, nb })); baoToast('Đang lọc theo ' + nbTen(nb)); }} moGan={() => setThe('gan')} />
          : the === 'vl' ? <VideoLive bc={bc} chon={(nb) => { setLoc((l) => ({ ...l, nb })); baoToast('Đang lọc theo ' + nbTen(nb)); }} />
          : the === 'ch' ? <BangCuaHang ds={bc.ch} chon={(ch) => { setLoc((l) => ({ ...l, ch })); baoToast('Đang lọc theo cửa hàng'); }} />
          : the === 'don' ? <DsDon pLoc={pLoc} tenNb={bc.ten_nb} />
          : the === 'ds' ? <DoiSoat api={api} />
          : <GanNguoiBan xong={tai} />}

        {tongDon === 0 && bc && !dang && (kho?.tong_don || 0) === 0 && (
          <div className="tts-trong">
            <b>Chưa có đơn TikTok nào trong app</b>
            <p>Bấm <b>Nạp file Excel</b> và kéo thả file "Tất cả đơn hàng" xuất từ Seller Center. Khi API đã kết nối, đơn sẽ tự về mỗi 5 phút.</p>
          </div>
        )}
      </div>
      {nap && <HopNap dong={() => setNap(false)} xong={() => { tai(); taiApi(); }} />}
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

function BangSanPham({ ds }) {
  const [rows, th] = useSap(ds, { k: 'sl', d: -1 });
  const [mo, setMo] = useState(null);
  return (
    <div className="odn-bang-khung">
      <table className="odn-bang tts-bang">
        <thead><tr>{th('ma', 'Mã hàng')}{th('ten', 'Sản phẩm')}{th('sl', 'SL bán', 'so')}{th('don', 'Đơn', 'so')}{th('dt', 'Doanh thu', 'so')}
          {th('huy', 'Huỷ', 'so')}<th>Kênh</th>{th('so_nb', 'Người bán', 'so')}</tr></thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan={8} className="odn-trong">Không có sản phẩm trong khoảng lọc.</td></tr>
            : rows.map((r) => [
              <tr key={r.ma} className={mo === r.ma ? 'on' : ''} onClick={() => setMo(mo === r.ma ? null : r.ma)}>
                <td><div className="odn-ten">{r.ma}</div><div className="odn-phu">{r.dm || '—'} · {(r.co || []).length} phân loại</div></td>
                <td className="tts-ten-sp" title={r.ten}>{r.ten || '—'}</td>
                <td className="so"><b>{fmt(r.sl)}</b>{r.dat !== r.sl && <div className="odn-phu">đặt {fmt(r.dat)}</div>}</td>
                <td className="so">{fmt(r.don)}</td>
                <td className="so"><b>{tien(r.dt)}</b></td>
                <td className="so">{r.huy > 0 ? <span className="tts-huy">{fmt(r.huy)}</span> : '—'}{r.tra > 0 && <div className="odn-phu">trả {fmt(r.tra)}</div>}</td>
                <td><ThanhKenh r={r} /></td>
                <td className="so">{fmt(r.so_nb)}</td>
              </tr>,
              mo === r.ma && (
                <tr key={r.ma + '_co'} className="tts-mo"><td colSpan={8}>
                  <div className="tts-co">{(r.co || []).map((c) => (
                    <span key={c.sku} className="tts-co-o"><b>{c.sku}</b><small>{c.pl || ''}</small><em>{fmt(c.sl)}{c.dat !== c.sl ? ` / đặt ${fmt(c.dat)}` : ''}</em></span>
                  ))}</div>
                </td></tr>
              ),
            ])}
        </tbody>
      </table>
    </div>
  );
}

// NEW - 3.141: gộp 3 nguồn theo ID người bán — đơn (LIVE gắn theo mã phòng + Excel), thống kê phiên LIVE, thống kê video
function BangNguoiBan({ bc, chon, moGan }) {
  const ds = useMemo(() => {
    const m = new Map();
    for (const r of bc.nb || []) m.set(r.nb, { ...r });
    const them = (h) => { if (!m.has(h)) m.set(h, { nb: h, don: 0, sl: 0, dt: 0, huy: 0, so_sp: 0, live: 0, video: 0, the: 0 }); return m.get(h); };
    for (const [h, v] of Object.entries(bc.live_nb || {})) Object.assign(them(h), { lv_phien: v.so_phien, lv_dt: v.dt, lv_sl: v.sl, lv_don: v.don, lv_xem: v.xem });
    for (const [h, v] of Object.entries(bc.video_nb || {})) Object.assign(them(h), { vd_so: v.so_video, vd_don: v.don, vd_sl: v.sl, vd_dt: v.dt, vd_xem: v.xem });
    const loaiCua = new Map((bc.nb || []).map((r) => [r.nb, r]));
    for (const r of m.values()) {
      if (!r.ten_ch && loaiCua.get(r.nb)?.ten_ch) r.ten_ch = loaiCua.get(r.nb).ten_ch;
      r.tong_dt = (r.nb === '' ? r.dt : (r.lv_dt || 0) + (r.vd_dt || 0)) || r.dt || 0;
    }
    return [...m.values()];
  }, [bc]);
  const [rows, th] = useSap(ds, { k: 'tong_dt', d: -1 });
  const tk = bc.tk || {};
  return (
    <div className="odn-bang-khung">
      <div className="tts-ghi-nguon">
        <span><b>Từ đơn</b>: ID người bán theo từng mã đơn, đúng cách Seller Center ghi nhận (báo cáo phân tích TikTok) — mua trực tiếp từ LIVE hoặc video của mọi tài khoản: chính thức, marketing, nhà sáng tạo. Đơn mua qua thẻ sản phẩm không tính cho ai.</span>
        <span><b>LIVE / Video (TikTok thống kê)</b>: số liệu chính thức theo từng phiên LIVE và video, TikTok chốt chậm 1–2 ngày
          {tk.live_den || tk.video_den ? ` (đang có tới ${tk.live_den ? 'LIVE ' + ngayVN(tk.live_den) : ''}${tk.video_den ? ' · video ' + ngayVN(tk.video_den) : ''})` : ''}.</span>
      </div>
      <table className="odn-bang tts-bang">
        <thead>
          <tr className="tts-nhom"><th colSpan={2} /><th colSpan={4} className="so">Từ đơn</th><th colSpan={3} className="so tts-lv">LIVE · TikTok thống kê</th><th colSpan={3} className="so tts-vd">Video · TikTok thống kê</th></tr>
          <tr>{th('nb', 'Người bán (ID TikTok)')}{th('ten_ch', 'Cửa hàng')}{th('don', 'Đơn', 'so')}{th('sl', 'SL', 'so')}{th('dt', 'Doanh thu', 'so')}{th('huy', 'Huỷ', 'so')}
            {th('lv_phien', 'Phiên', 'so tts-lv')}{th('lv_sl', 'SL', 'so tts-lv')}{th('lv_dt', 'Doanh số', 'so tts-lv')}
            {th('vd_so', 'Video', 'so tts-vd')}{th('vd_sl', 'SL', 'so tts-vd')}{th('vd_dt', 'Doanh số', 'so tts-vd')}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan={12} className="odn-trong">Không có người bán trong khoảng lọc.</td></tr>
            : rows.map((r) => (
              <tr key={r.nb} onClick={() => chon(r.nb)} title="Bấm để lọc toàn bộ báo cáo theo người bán này">
                <td><div className="odn-ten">{tenGoi(bc.ten_nb, r.nb)}</div>
                  <div className="odn-phu">{r.nb ? (bc.ten_nb?.[r.nb] ? '@' + r.nb + ' · ' : '') + (r.loai ? LOAI[r.loai] || r.loai : 'Chưa gán') : 'đơn mua qua thẻ sản phẩm (không qua LIVE / video)'}</div></td>
                <td>{r.ten_ch ? <span className="odn-ten nho">{r.ten_ch}</span>
                  : r.nb && !r.loai ? <button className="tts-link" onClick={(e) => { e.stopPropagation(); moGan(); }}>Gán cửa hàng</button> : <span className="odn-phu">—</span>}</td>
                <td className="so"><b>{r.don ? fmt(r.don) : '—'}</b></td>
                <td className="so">{r.sl ? fmt(r.sl) : '—'}</td>
                <td className="so"><b>{r.dt ? tien(r.dt) : '—'}</b></td>
                <td className="so">{r.huy > 0 ? <span className="tts-huy">{fmt(r.huy)}</span> : '—'}</td>
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

// NEW - 3.141: phiên LIVE + video nổi bật (TikTok thống kê, có ID người bán)
function VideoLive({ bc, chon }) {
  const [xem, setXem] = useState('live');
  const live = bc.live_top || [], video = bc.video_top || [];
  return (
    <div className="tts-gan">
      <div className="tts-gan-dau">
        <div className="tts-nhanh">
          <button className={xem === 'live' ? 'on' : ''} onClick={() => setXem('live')}>Phiên LIVE ({fmt(live.length)})</button>
          <button className={xem === 'video' ? 'on' : ''} onClick={() => setXem('video')}>Video có đơn ({fmt(video.length)})</button>
        </div>
        <span className="odn-phu">Top 100 theo doanh số trong khoảng ngày đang lọc · TikTok chốt số liệu chậm 1–2 ngày · bấm dòng để lọc theo người bán.</span>
      </div>
      <div className="odn-bang-khung">
        {xem === 'live' ? (
          <table className="odn-bang tts-bang">
            <thead><tr><th>Người bán</th><th>Phiên LIVE</th><th className="so">Đơn</th><th className="so">SL</th><th className="so">Doanh số</th><th className="so">Khách</th><th className="so">Người xem</th></tr></thead>
            <tbody>{live.length === 0 ? <tr><td colSpan={7} className="odn-trong">Chưa có phiên LIVE trong khoảng này.</td></tr>
              : live.map((r) => (
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
              : video.map((r) => (
                <tr key={r.video_id} onClick={() => chon(r.username || '')}>
                  <td><div className="odn-ten">{tenGoi(bc.ten_nb, r.username)}</div><div className="odn-phu">{bc.ten_nb?.[r.username] ? '@' + r.username + ' · ' : ''}{r.ten_ch || 'chưa gán cửa hàng'}</div></td>
                  <td><div className="tts-ten-sp" title={r.tieu_de}>{r.tieu_de || '—'}</div><div className="odn-phu">đăng {gioNgay(r.dang_luc)}</div></td>
                  <td><div className="tts-ten-sp" title={(r.san_pham || []).map((x) => x.name).join(' · ')}>{(r.san_pham || [])[0]?.name || '—'}</div>
                    {(r.san_pham || []).length > 1 && <div className="odn-phu">+{r.san_pham.length - 1} sản phẩm</div>}</td>
                  <td className="so">{fmt(r.don)}</td><td className="so">{fmt(r.sl)}</td><td className="so"><b>{tien(r.dt)}</b></td><td className="so">{fmt(r.xem)}</td>
                </tr>))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// NEW - 3.143: đối soát từng ngày app ↔ TikTok
const lechNgay = (r) => (r.app_don ?? 0) < (r.tiktok_don ?? 0) || (r.app_lk ?? 0) < (r.tiktok_lk ?? 0) || (r.app_tra ?? 0) < (r.tiktok_tra ?? 0);
const soLech = (api) => (api?.doi_soat || []).filter(lechNgay).length;
// NEW - 3.145: ngày đã tự kéo bù từ 3 lần trở lên mà vẫn lệch → cần xem
const soKet = (api) => (api?.doi_soat || []).filter((r) => lechNgay(r) && (r.sua_lan || 0) >= 3).length;
function DoiSoat({ api }) {
  const ds = api?.doi_soat || [];
  const kq = api?.ds_kq || {};
  const o = (tk, app) => {
    if (tk == null) return <td className="so odn-phu">—</td>;
    const thieu = (tk || 0) - (app || 0);
    return <td className="so">{fmt(app || 0)} / {fmt(tk)}{thieu > 0 ? <span className="tts-huy"> thiếu {fmt(thieu)}</span> : thieu < 0 ? <span className="odn-phu"> +{fmt(-thieu)}</span> : <span className="tts-khop"> ✓</span>}</td>;
  };
  return (
    <div className="odn-bang-khung">
      <div className="tts-ghi-nguon">
        <span><b>Đối soát với TikTok</b>: mỗi 3 giờ hệ thống tự đếm số đơn, số dòng hàng có ID người bán và số yêu cầu trả hàng của từng ngày trên TikTok rồi so với app. Ngày nào app thiếu → tự kéo lại cả ngày đó, 15 phút sau đối soát lại.</span>
        <span>Lần gần nhất: {api?.ds_luc ? gioNgay(kq.luc || api.ds_luc) : 'chưa chạy'}{kq.lech_truoc != null ? ` · lệch trước khi sửa ${fmt(kq.lech_truoc)} ngày · còn lệch ${fmt(kq.con_lech || 0)} ngày` : ''}{kq.loi ? ` · lỗi: ${kq.loi}` : ''}. Hiển thị dạng app / TikTok; 15 phút gần nhất chưa tính.</span>
      </div>
      <table className="odn-bang tts-bang">
        <thead><tr><th>Ngày</th><th className="so">Đơn hàng</th><th className="so" title="TikTok đếm theo dòng hàng (mỗi mã hàng trong đơn là 1 dòng)">Dòng hàng có ID người bán</th><th className="so">Yêu cầu trả hàng</th><th className="so">Tự kéo bù</th></tr></thead>
        <tbody>{ds.length === 0 ? <tr><td colSpan={5} className="odn-trong">Chưa có kết quả đối soát — lượt đầu chạy trong vòng 5 phút.</td></tr>
          : ds.map((r) => (
            <tr key={r.ngay} className={lechNgay(r) ? 'tts-dong-lech' : ''}>
              <td><b>{ngayVN(r.ngay)}</b></td>{o(r.tiktok_don, r.app_don)}{o(r.tiktok_lk, r.app_lk)}{o(r.tiktok_tra, r.app_tra)}
              <td className="so">{r.sua_lan ? `${fmt(r.sua_lan)} lần` : '—'}</td>
            </tr>))}</tbody>
      </table>
    </div>
  );
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
function DsDon({ pLoc, tenNb }) {
  const { user } = useApp();
  const [kq, setKq] = useState(null);
  const [loi, setLoi] = useState('');
  const [mo, setMo] = useState(null);
  useEffect(() => {
    let huy = false;
    setKq(null);
    sb.rpc('fn_tt_don_ds', { p_token: user.token, p_loc: pLoc, p_gioi_han: 300 }).then(({ data, error }) => {
      if (huy) return;
      if (error) { setLoi(error.message); return; }
      setLoi(''); setKq(data);
    });
    return () => { huy = true; };
  }, [pLoc, user.token]);
  if (loi) return <div className="odn-bao do"><IcAlert /> Không tải được: {loi}</div>;
  const ds = kq?.ds || [];
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
                  <td><div className="tts-ten-sp" title={dong[0]?.ten}>{dong[0]?.sku || '—'}{dong.length > 1 ? ` +${dong.length - 1} mã` : ''}</div>
                    <div className="odn-phu">{fmt(sl)} sản phẩm</div></td>
                  <td className="so"><b>{fmt(d.tong_tien)}</b></td>
                  <td>{d.kenh && <KenhChip k={d.kenh} />}<div className="odn-phu">{d.creator ? tenGoi(tenNb, d.creator) : 'không qua người bán'}{d.ten_ch ? ' · ' + d.ten_ch : ''}</div></td>
                  <td><div className="odn-ten nho">{d.dvvc || '—'}</div><div className="odn-phu">{d.van_don || ''}{d.giao_luc ? ' · giao ' + gioNgay(d.giao_luc) : d.gui_luc ? ' · gửi ' + gioNgay(d.gui_luc) : ''}</div></td>
                  <td>{d.tinh || '—'}</td>
                </tr>,
                mo === d.ma_don && (
                  <tr key={d.ma_don + '_ct'} className="tts-mo"><td colSpan={7}>
                    <table className="tts-ct"><thead><tr><th>Mã hàng</th><th>Sản phẩm · phân loại</th><th className="so">SL</th><th className="so">Giá niêm yết</th><th className="so">Shop giảm</th><th className="so">Khách trả</th><th>Người bán</th></tr></thead>
                      <tbody>{dong.map((x, i) => (
                        <tr key={i}><td><b>{x.sku || '—'}</b></td><td>{x.ten}<div className="odn-phu">{x.pl}</div></td>
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
      {kq && kq.tong > ds.length && <div className="odn-phu odn-chan-bang">Đang hiện {ds.length}/{fmt(kq.tong)} đơn mới nhất — thu hẹp bộ lọc để xem đơn cũ hơn.</div>}
    </div>
  );
}

/* ================= Gán ID người bán ↔ cửa hàng ================= */
function GanNguoiBan({ xong }) {
  const { user, baoToast } = useApp();
  const [kq, setKq] = useState(null);
  const [loc, setLoc] = useState('chua');
  const [tim, setTim] = useState('');
  const [luu, setLuu] = useState('');
  const tai = useCallback(async () => {
    const { data, error } = await sb.rpc('fn_tt_nb_ds', { p_token: user.token });
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    setKq(data);
  }, [user.token, baoToast]);
  useEffect(() => { tai(); }, [tai]);
  const chOpt = useMemo(() => [{ value: '', label: '— Không gắn cửa hàng —' },
    ...(kq?.ch || []).map((c) => ({ value: c.ma, label: c.ten, sub: c.ma + (c.kv ? ' · ' + c.kv : '') }))], [kq]);
  // NEW - 3.146: lưu xong cập nhật ngay dòng đó (không tải lại cả danh sách); báo cáo chung làm mới sau 2 giây
  const henLamMoi = useRef(null);
  const lamMoiBaoCao = () => { clearTimeout(henLamMoi.current); henLamMoi.current = setTimeout(() => xong(), 2000); };
  useEffect(() => () => clearTimeout(henLamMoi.current), []);
  const suaDong = (h, moi) => setKq((k) => (k ? { ...k, nb: k.nb.map((x) => (x.handle === h ? { ...x, ...moi } : x)) } : k));
  const gan = async (r, ma, loai) => {
    setLuu(r.handle);
    const { data, error } = await sb.rpc('fn_tt_nb_gan', { p_token: user.token, p_handle: r.handle, p_ma_ch: ma || null, p_loai: loai || null, p_ghi_chu: null });
    setLuu('');
    if (error) { baoToast('Chưa lưu được @' + r.handle + ': ' + error.message); return; }
    suaDong(r.handle, { ma_ch: data?.ma_ch ?? null, ten_ch: data?.ten_ch ?? null, loai: data?.loai ?? null, tu_dong: false, nguoi: data?.nguoi ?? user.ma_dang_nhap, goi_y: null });
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
    setNhap((n) => { const m = { ...n }; delete m[r.handle]; return m; });
    baoToast(ten ? `Đã đặt tên @${r.handle} là "${ten}"` : 'Đã xoá tên gọi @' + r.handle);
    lamMoiBaoCao();
  };
  const ds = (kq?.nb || []).filter((r) => (loc === 'chua' ? !r.ma_ch && !r.loai : loc === 'da' ? r.ma_ch || r.loai : true))
    .filter((r) => !tim.trim() || r.handle.includes(tim.trim().toLowerCase()) || (r.ten_ch || '').toLowerCase().includes(tim.trim().toLowerCase())
      || (r.ten || '').toLowerCase().includes(tim.trim().toLowerCase()));
  const dem = (kq?.nb || []).reduce((s, r) => ({ chua: s.chua + (!r.ma_ch && !r.loai ? 1 : 0), da: s.da + (r.ma_ch || r.loai ? 1 : 0) }), { chua: 0, da: 0 });
  return (
    <div className="tts-gan">
      <div className="tts-gan-dau">
        <div className="tts-nhanh">
          {[['chua', `Chưa gán (${dem.chua})`], ['da', `Đã gán (${dem.da})`], ['tat', 'Tất cả']].map(([k, ten]) => (
            <button key={k} className={loc === k ? 'on' : ''} onClick={() => setLoc(k)}>{ten}</button>
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
                    <div className="odn-phu">{r.lan_cuoi ? 'bán gần nhất ' + gioNgay(r.lan_cuoi) : 'chưa có đơn'}{r.ma_ch || r.loai ? (r.tu_dong ? ' · tự khớp' : r.nguoi ? ' · gán bởi ' + r.nguoi : '') : ''}</div></td>
                  <td style={{ minWidth: 190 }}>
                    <input className="tts-ten-goi" value={nhap[r.handle] ?? r.ten ?? ''} maxLength={60} placeholder="Đặt tên gọi…"
                      aria-label={'Tên gọi cho @' + r.handle}
                      onChange={(e) => setNhap((n) => ({ ...n, [r.handle]: e.target.value }))}
                      onBlur={() => datTen(r)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setNhap((n) => { const m = { ...n }; delete m[r.handle]; return m; }); } }} />
                  </td>
                  <td className="so"><b>{fmt(r.don30)}</b> đơn<div className="odn-phu">{fmt(r.sl30)} sp</div></td>
                  <td style={{ minWidth: 170 }}>
                    <Sel value={r.loai || ''} placeholder="Chọn loại" onChange={(v) => gan(r, v === 'CH' || v === 'DOISALE' ? r.ma_ch : null, v)}
                      options={[{ value: '', label: '— Chưa gán —', disabled: true }, ...Object.entries(LOAI).map(([k, ten]) => ({ value: k, label: ten }))]} />
                  </td>
                  <td style={{ minWidth: 230 }}>
                    <Sel value={r.ma_ch || ''} placeholder="Chọn cửa hàng" timKiem onChange={(v) => gan(r, v, v ? null : r.loai)} options={chOpt} />
                  </td>
                  <td>{(r.goi_y || []).length ? <div className="odn-chips">{r.goi_y.map((g) => (
                    <button key={g.ma} className="tts-goi-y" onClick={() => gan(r, g.ma, null)} title={'Gán vào ' + g.ten}>{g.ten}</button>
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
