// ============================================================================
// NEW - 3.157 CHIA HÀNG ONLINE
//   Chuyển hàng từ kho nguồn (Odoo) → kho online, đúng số, đúng kho nguồn, đúng lúc:
//     Bán online mỗi ngày (Nhanh, mọi kênh)  ·  Tồn online THẬT (Nhanh kho giao online)  ·  Đang về (phiếu Odoo chưa nhập Nhanh)
//     → dự báo bán (7/14/28 ngày, TÍNH ĐỦ mọi ngày — kể cả ngày sale lớn 11/11, 12/12) × (thời gian về thật + số ngày phủ) + mức an toàn
//   NEW - 3.157.1: kho KOL05001 / KOL05002 trên Odoo chỉ là kho "bù nhìn" để trừ tồn kho tổng — TỒN THẬT CỦA ONLINE = TỒN NHANH.
//     Mỗi lần chuyển online làm đồng thời 2 việc: đơn Odoo (trừ kho nguồn) + phiếu NHẬP ở Nhanh (cộng tồn online, ghi mã phiếu PDCK… vào diễn giải).
//     App theo dõi từng đơn: Odoo đã xuất chưa → Nhanh đã nhập chưa (đủ số chưa).
//     → trừ tồn có thể bán + đang về → làm tròn → lấy từ kho nguồn quen của mã (còn khả dụng) → đơn Odoo
//   Số liệu: fn_ol_du_lieu (SQL 277, tính sẵn ở máy chủ, làm mới nền mỗi lượt kéo Nhanh). Máy tính chạy ngay trên máy:
//   kéo "Số ngày phủ" / "Mức an toàn" là thấy số mới tức thì.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { useApp } from '../App.jsx';
import { IcRefresh, IcDown, IcAlert, IcClock, IcSpark, IcGuiLen, IcBox, IcGrid, IcRadar } from '../lib/icons.jsx';
import { useOdooCfg, moOdoo, gomDon } from '../lib/odoo.js';
import { isoVN } from '../lib/ui.jsx';

const NGANH = { BH: 'Nón bảo hiểm', NV: 'Nón vải', PK: 'Phụ kiện' };
const TEN_KHO = {
  KOL05002: 'Kho Online - Bảo hiểm', KOL05001: 'Kho Online - Nón vải',
  SA05001: 'Kho Sale Bảo hiểm', TP05006: 'Kho Xuất Nón bảo hiểm', PK05001: 'Kho Phụ kiện',
  TP05002: 'Kho Thành phẩm Nón vải', SA05002: 'Kho Sale Nón vải',
};
const AN_TOAN = [['thap', 'Gọn', 0.84, 'Ít hàng nằm kho — chấp nhận hụt hàng khoảng 1/5 số ngày bán cao'],
  ['vua', 'Vừa', 1.28, 'Cân bằng — đủ hàng ~9/10 ngày'], ['cao', 'Chắc', 1.65, 'Hiếm khi hết — kho online giữ nhiều hơn']];
const TT = {
  het: ['Hết hàng', 'het'], gap: ['Sắp hết', 'gap'], thap: ['Thấp', 'thap'], du: ['Ổn', 'du'],
  thua: ['Tồn nhiều', 'thua'], cham: ['Không bán 28 ngày', 'cham'],
};
const THU_TT = { het: 0, gap: 1, thap: 2, du: 3, thua: 4, cham: 5 };

const fmtN = (n) => (n == null || Number.isNaN(n) ? '—' : Math.round(n).toLocaleString('vi'));
const fmt1 = (n) => (n == null || !Number.isFinite(n) ? '—' : (Math.round(n * 10) / 10).toLocaleString('vi'));
const gio = (s) => (s ? new Date(s).toLocaleTimeString('vi', { hour: '2-digit', minute: '2-digit' }) : '—');
const gioNgay = (s) => { if (!s) return '—'; const d = new Date(s); return gio(s) + ' ' + d.toLocaleDateString('vi', { day: '2-digit', month: '2-digit' }); };
const ngayNgan = (s) => (s ? s.slice(8, 10) + '/' + s.slice(5, 7) : '—');
const kGia = (g) => (g ? (g >= 1e6 ? fmt1(g / 1e6) + 'tr' : Math.round(g / 1000) + 'k') : '');
const tong = (a) => a.reduce((s, x) => s + x, 0);
const doLech = (a) => { if (a.length < 2) return 0; const m = tong(a) / a.length; return Math.sqrt(tong(a.map((x) => (x - m) ** 2)) / (a.length - 1)); };
const soNgay = (tu, den) => Math.round((Date.parse(den + 'T00:00:00') - Date.parse(tu + 'T00:00:00')) / 864e5);
const boDau = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

const LS = 'ns_chia_online_ts';
const docTs = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } };

// ---------------------------------------------------------------------------
// MÁY TÍNH — 1 mã
//   v      = 50% TB 7 ngày + 30% TB 14 ngày + 20% TB 28 ngày (mã mới: chia theo số ngày đã bán)
//            TÍNH ĐỦ mọi ngày bán, kể cả ngày sale lớn (11/11, 12/12…) — anh chốt 25/11: phải có các ngày đó mới chia chuẩn
//   L      = thời gian về THẬT của kho nguồn (tạo phiếu Odoo → nhập kho Nhanh, đo 30 ngày)
//   mục tiêu = v × (L + số ngày phủ) + z × độ lệch × √(L + phủ)
//   cần    = mục tiêu − có thể bán online − đang về   → làm tròn (bán ≥ 2/ngày: theo bước làm tròn) → bỏ nếu quá nhỏ mà chưa gấp
//   lấy    = kho nguồn quen của mã trước (60 ngày), rồi thứ tự kho nguồn của ngành; không vượt khả dụng (trừ % giữ lại cho cửa hàng)
// ---------------------------------------------------------------------------
function tinhMa(r, p, cfg, lt, homNay, sua) {
  const d = r.d || new Array(28).fill(0);
  // mã MỚI (tạo mã < 28 ngày): chia theo số ngày từ lần bán đầu; mã cũ bán lai rai: luôn chia đủ 28 ngày (không thổi phồng)
  const moi = r.moi && soNgay(r.moi, homNay) < 28;
  const tuoi = moi && r.nd ? Math.max(1, Math.min(28, soNgay(r.nd, homNay))) : 28;
  const ngayCo = d.slice(28 - tuoi);
  const c = ngayCo;   // NEW - 3.157.1: không chặn trần, không bỏ ngày nào
  const a7 = tong(c.slice(-7)) / Math.min(7, c.length);
  const a14 = tong(c.slice(-14)) / Math.min(14, c.length);
  const a28 = tong(c) / c.length;
  let v = 0.5 * a7 + 0.3 * a14 + 0.2 * a28;
  if (v === 0 && r.hn > 0) v = r.hn;   // mã mới bán hôm nay
  const sd = doLech(c);
  const xh = a28 > 0 ? a7 / a28 : a7 > 0 ? 2 : 1;

  const mac = cfg.nguon?.[r.n] || [];
  const ls = r.ls || {};
  const thuTu = [...new Set([...(sua?.nguon && mac.includes(sua.nguon) ? [sua.nguon] : []),
    ...Object.keys(ls).filter((k) => mac.includes(k)).sort((a, b) => ls[b] - ls[a]), ...mac])];
  const chinh = thuTu.find((k) => (r.ng?.[k] || 0) > 0) || thuTu[0];
  const L = Math.max(1, Number(lt?.[chinh]) || 2);
  const z = (AN_TOAN.find((a) => a[0] === p.an) || AN_TOAN[1])[2];
  const H = L + p.phu;
  const anToan = z * sd * Math.sqrt(H);
  const mucTieu = v * H + anToan;
  const co = Math.max(0, r.cb || 0), ve = r.ve || 0;
  let can = Math.max(0, mucTieu - co - ve);
  const buoc = v >= 2 ? Math.max(1, p.lamTron) : 1;
  let deXuat = can > 0 ? Math.ceil(can / buoc) * buoc : 0;
  const phu = v > 0 ? co / v : Infinity;
  const phuVe = v > 0 ? (co + ve) / v : Infinity;
  if (deXuat > 0 && deXuat < (cfg.toi_thieu ?? 2) && phuVe > L + 1) deXuat = 0;

  const giu = Math.max(0, Math.min(90, Number(p.giuNguon) || 0)) / 100;
  const khaDung = (k) => Math.max(0, Math.floor((r.ng?.[k] || 0) * (1 - giu)));
  const sl = sua?.sl != null ? Math.max(0, Math.floor(sua.sl)) : deXuat;
  let con = sl; const chia = [];
  for (const k of thuTu) {
    if (con <= 0) break;
    const lay = Math.min(con, khaDung(k));
    if (lay > 0) { chia.push({ k, sl: lay }); con -= lay; }
  }
  const thieu = con;   // nguồn không đủ
  const vuot = sua?.sl != null && thieu > 0;   // anh nhập quá khả dụng
  if (vuot && thuTu[0]) {   // vẫn ghi vào kho đầu — Odoo sẽ hỏi lại khi vượt
    const o = chia.find((x) => x.k === thuTu[0]); if (o) o.sl += thieu; else chia.unshift({ k: thuTu[0], sl: thieu });
  }
  const sl2 = tong(chia.map((x) => x.sl));
  const tt = v <= 0.05 ? (co > 0 ? 'cham' : null) : co <= 0 ? 'het' : phu < L ? 'gap' : phuVe < L + p.phu * 0.5 ? 'thap'
    : phuVe > 45 && co > 10 ? 'thua' : 'du';
  const lyDo = v > 0 ? `Bán ${fmt1(v)}/ngày${xh >= 1.25 ? ' ↑' : xh <= 0.75 ? ' ↓' : ''} · online còn ${fmt1(phu === Infinity ? 0 : phu)} ngày`
    + (ve ? ` · đang về ${fmtN(ve)}` : '') + ` → cần đủ ${fmt1(H)} ngày (về ${fmt1(L)} + phủ ${p.phu}) + an toàn ${fmtN(anToan)} = ${fmtN(mucTieu)}` : '';
  return { r, v, a7, a28, xh, sd, L, H, mucTieu, anToan, co, ve, can, deXuat, sl: sl2, chia, thieu: vuot ? 0 : thieu, vuot,
    phu, phuVe, tt, thuTu, den: cfg.kho_dich?.[r.n] || 'KOL05002', lyDo, daSua: sua?.sl != null || !!sua?.nguon };
}

// Biểu đồ 28 ngày: 7 ngày gần nhất đậm, ngày bán cao nhất màu vàng (để thấy đỉnh — vẫn tính đủ)
function Song({ d }) {
  if (!d) return <span className="co-song trong">không bán</span>;
  const max = Math.max(1, ...d);
  return (
    <svg className="co-song" viewBox="0 0 84 24" preserveAspectRatio="none" aria-hidden="true">
      {d.map((x, i) => {
        const h = x > 0 ? Math.max(1.5, (x / max) * 22) : 0.8;
        return <rect key={i} x={i * 3} y={24 - h} width="2.2" height={h} rx="0.6"
          className={x === max && x > 0 ? 'db' : i >= 21 ? 'gan' : ''} />;
      })}
    </svg>
  );
}

// Thước "đủ bán": vạch L (về) và L + phủ (mục tiêu)
function Thuoc({ m, phu }) {
  const tran = Math.max(m.H * 1.6, 10);
  const w = (x) => `${Math.max(0, Math.min(100, (x / tran) * 100))}%`;
  const a = m.phu === Infinity ? tran : m.phu, b = m.phuVe === Infinity ? tran : m.phuVe;
  return (
    <div className="co-thuoc" title={`Có thể bán đủ ${fmt1(a)} ngày${m.ve ? ` · tính cả đang về: ${fmt1(b)} ngày` : ''} · mục tiêu ${fmt1(m.H)} ngày (về ${fmt1(m.L)} + phủ ${phu})`}>
      <div className="nen">
        <i className="ve" style={{ width: w(b) }} />
        <i className={'co ' + (m.tt || '')} style={{ width: w(a) }} />
        <b className="moc" style={{ left: w(m.L) }} />
        <b className="moc dich" style={{ left: w(m.H) }} />
      </div>
      <span>{m.v > 0 ? <>{fmt1(a)}<small> ngày</small>{m.ve ? <em> → {fmt1(b)}</em> : null}</> : '—'}</span>
    </div>
  );
}

export default function ChiaOnline() {
  const { user, baoToast, datBan } = useApp();
  const odoo = useOdooCfg(user);
  const [kq, setKq] = useState(null);
  const [loi, setLoi] = useState('');
  const [dang, setDang] = useState(false);
  const [lamMoi, setLamMoi] = useState(false);
  const [tab, setTab] = useState('chia');
  const ts0 = docTs();
  const [p, setP] = useState({ phu: ts0.phu ?? null, an: ts0.an ?? null, lamTron: ts0.lamTron ?? null, giuNguon: ts0.giuNguon ?? null });
  const [nganh, setNganh] = useState('');
  const [loc, setLoc] = useState('can');
  const [q, setQ] = useState('');
  const [sap, setSap] = useState({ k: '', g: -1 });
  const [sua, setSua] = useState({});
  const [soHien, setSoHien] = useState(250);
  const [moMa, setMoMa] = useState(null);
  const [phieuDs, setPhieuDs] = useState(null);
  const [phieuSua, setPhieuSua] = useState(null);   // {id, ma_phieu} khi mở lại phiếu nháp để sửa
  const [dangLuu, setDangLuu] = useState(false);
  const songRef = useRef(true);
  const kqRef = useRef(null);
  const banRef = useRef(datBan);
  banRef.current = datBan;
  useEffect(() => () => { songRef.current = false; banRef.current?.('chiaonline', false); }, []);

  const cfg = kq?.cfg || {};
  const P = useMemo(() => ({
    phu: p.phu ?? cfg.ngay_phu ?? 7, an: p.an ?? cfg.an_toan ?? 'vua', lamTron: p.lamTron ?? cfg.lam_tron ?? 5,
    giuNguon: p.giuNguon ?? cfg.giu_nguon ?? 0,
  }), [p, cfg.ngay_phu, cfg.an_toan, cfg.lam_tron, cfg.giu_nguon]);
  useEffect(() => { try { localStorage.setItem(LS, JSON.stringify(p)); } catch { /* bỏ qua */ } }, [p]);
  useEffect(() => { banRef.current?.('chiaonline', Object.keys(sua).length > 0); }, [sua]);   // đang sửa dở → không tự cập nhật bản mới

  const tai = async (moi = false) => {
    if (moi) setLamMoi(true); else setDang(true);
    const { data, error } = await sb.rpc('fn_ol_du_lieu', { p_token: user.token, p_moi: moi });
    if (!songRef.current) return null;
    if (moi) setLamMoi(false); else setDang(false);
    if (error) {
      if (moi && kq) baoToast('Máy chủ đang bận — vẫn xem số tính lúc ' + gio(kq.nho_luc) + ', thử lại sau ít phút');
      else setLoi(error.message || String(error));
      return null;
    }
    setKq(data); setLoi('');
    return data;
  };
  const taiPhieu = async () => {
    const { data, error } = await sb.rpc('fn_ol_phieu_ds', { p_token: user.token, p_ngay: 30 });
    if (!songRef.current) return;
    if (error) { baoToast('Chưa tải được phiếu: ' + error.message); return; }
    setPhieuDs(data || []);
  };
  useEffect(() => {
    (async () => {
      const d = await tai(false);
      if (d?.cu) await tai(true);
    })();
    taiPhieu();
    const t = setInterval(async () => {   // 5 phút: bản máy chủ mới hơn thì lấy
      if (document.visibilityState !== 'visible') return;
      const d = await sb.rpc('fn_ol_du_lieu', { p_token: user.token, p_moi: false });
      if (songRef.current && d.data && d.data.nho_luc !== kqRef.current?.nho_luc) setKq(d.data);
    }, 5 * 60000);
    return () => clearInterval(t);
  }, []);   // eslint-disable-line
  useEffect(() => { kqRef.current = kq; }, [kq]);

  const layTonNgay = async () => {
    const { data, error } = await sb.rpc('fn_nh_chay', { p_token: user.token, p_viec: 'ton' });
    if (error) { baoToast('Chưa lấy được: ' + error.message); return; }
    if (data?.kq === 'dang_chay') { baoToast(`Nhanh đang chạy lượt khác — thử lại sau ${data.con_giay || 60} giây`); return; }
    baoToast('Đang lấy tồn online + phiếu nhập từ Nhanh (~1 phút) — xong tự tính lại');
    setTimeout(() => { if (songRef.current) tai(true); }, 75000);
  };

  const homNay = isoVN();
  const ds = useMemo(() => (kq?.rows || []).map((r) => tinhMa(r, P, cfg, kq?.lt, homNay, sua[r.b])),
    [kq, P, sua]);   // eslint-disable-line

  // ===== Tổng quan =====
  const theoNganh = useMemo(() => ds.filter((m) => !nganh || m.r.n === nganh), [ds, nganh]);
  const tq = useMemo(() => {
    const ban = theoNganh.filter((m) => m.v > 0);
    const v = tong(ban.map((m) => m.v)), co = tong(theoNganh.map((m) => m.co)), ve = tong(theoNganh.map((m) => m.ve));
    const chon = theoNganh.filter((m) => m.sl > 0);
    const don = new Set(chon.flatMap((m) => m.chia.map((c) => c.k + '>' + m.den)));
    return {
      v, co, ve, phu: v > 0 ? co / v : 0, phuVe: v > 0 ? (co + ve) / v : 0,
      a7: tong(theoNganh.map((m) => m.r.s7 || 0)) / 7,
      het: theoNganh.filter((m) => m.tt === 'het').length, gap: theoNganh.filter((m) => m.tt === 'gap').length,
      thap: theoNganh.filter((m) => m.tt === 'thap').length,
      sl: tong(chon.map((m) => m.sl)), ma: chon.length, don: don.size,
      thieu: theoNganh.filter((m) => m.thieu > 0).length,
      giaTri: tong(chon.map((m) => m.sl * (m.r.gs || m.r.g || 0))),
    };
  }, [theoNganh]);
  const demNganh = useMemo(() => {
    const o = { '': ds.filter((m) => m.v > 0 || m.co > 0).length };
    Object.keys(NGANH).forEach((k) => { o[k] = ds.filter((m) => m.r.n === k && (m.v > 0 || m.co > 0)).length; });
    return o;
  }, [ds]);

  const LOC = [
    ['can', 'Cần chuyển', (m) => m.sl > 0],
    ['het', 'Hết hàng', (m) => m.tt === 'het'],
    ['gap', 'Sắp hết', (m) => m.tt === 'gap'],
    ['thap', 'Thấp', (m) => m.tt === 'thap'],
    ['thieu', 'Kho nguồn thiếu', (m) => m.thieu > 0],
    ['ve', 'Đang về', (m) => m.ve > 0],
    ['sua', 'Đã sửa tay', (m) => m.daSua],
    ['ban', 'Có bán', (m) => m.v > 0],
  ];
  const demLoc = useMemo(() => Object.fromEntries(LOC.map(([k, , f]) => [k, theoNganh.filter(f).length])), [theoNganh]);   // eslint-disable-line

  const hien = useMemo(() => {
    const f = LOC.find((x) => x[0] === loc)?.[2] || (() => true);
    const tu = boDau(q.trim());
    let a = theoNganh.filter((m) => f(m) && (!tu || boDau([m.r.m, m.r.t, m.r.b, m.r.sku].join(' ')).includes(tu)));
    const gt = { v: (m) => m.v, phu: (m) => (m.phu === Infinity ? 1e9 : m.phu), sl: (m) => m.sl, co: (m) => m.co, ve: (m) => m.ve, xh: (m) => m.xh };
    if (sap.k && gt[sap.k]) a = [...a].sort((x, y) => (gt[sap.k](x) - gt[sap.k](y)) * sap.g);
    else a = [...a].sort((x, y) => (THU_TT[x.tt] ?? 9) - (THU_TT[y.tt] ?? 9) || y.v - x.v);
    return a;
  }, [theoNganh, loc, q, sap]);   // eslint-disable-line
  useEffect(() => { setSoHien(250); }, [loc, nganh, q]);

  // ===== Phiếu: dòng chuyển (mỗi mã × kho nguồn) =====
  const dongChuyen = useMemo(() => ds.filter((m) => m.sl > 0).flatMap((m) => m.chia.filter((c) => c.sl > 0).map((c) => ({
    barcode: m.r.b, sku: m.r.sku, ma: m.r.m, tu: c.k, den: m.den, sl: c.sl, de_xuat: m.deXuat, ly_do: m.lyDo, n: m.r.n,
  }))), [ds]);
  const tongCap = useMemo(() => {
    const g = new Map();
    dongChuyen.forEach((d) => {
      const k = d.tu + '>' + d.den;
      const o = g.get(k) || { tu: d.tu, den: d.den, sl: 0, ma: 0 };
      o.sl += d.sl; o.ma += 1; g.set(k, o);
    });
    return [...g.values()].sort((a, b) => b.sl - a.sl);
  }, [dongChuyen]);

  const datSo = (b, v) => setSua((s) => {
    const n = { ...s };
    if (v === '' || v == null) { const o = { ...(n[b] || {}) }; delete o.sl; if (o.nguon) n[b] = o; else delete n[b]; }
    else n[b] = { ...(n[b] || {}), sl: Math.max(0, Math.floor(Number(v) || 0)) };
    return n;
  });
  const datNguon = (b, k) => setSua((s) => ({ ...s, [b]: { ...(s[b] || {}), nguon: k } }));

  const luuPhieu = async () => {
    if (!dongChuyen.length) { baoToast('Chưa có mã nào cần chuyển'); return null; }
    setDangLuu(true);
    const { data, error } = await sb.rpc('fn_ol_phieu_luu', { p_token: user.token, p: {
      id: phieuSua?.id || null, ghi_chu: `Phủ ${P.phu} ngày · an toàn ${(AN_TOAN.find((a) => a[0] === P.an) || [])[1] || ''}`,
      tham_so: { ...P, lt: kq?.lt, nho_luc: kq?.nho_luc }, dong: dongChuyen } });
    setDangLuu(false);
    if (error) { baoToast('Chưa lưu được: ' + error.message); return null; }
    setPhieuSua(null);
    taiPhieu();
    return data;
  };
  const guiOdoo = (phieu, dong) => {
    const don = gomDon(dong.map((d) => ({ tu: d.tu, den: d.den, den_ten: TEN_KHO[d.den] || d.den, barcode: d.barcode, sku: d.sku, sl: d.sl, ma: d.ma })),
      { prefix: cfg.prefix || 'OL', tai_lieu_nguon: phieu.ma_phieu, ghi_chu: 'Chia hàng Online ' + phieu.ma_phieu });
    moOdoo({
      tieuDe: `Chia hàng Online · ${phieu.ma_phieu} — ${don.length} đơn`, man: 'chia_online', lyDo: cfg.ly_do || 'Kho Online Tỉnh', don,
      canh: [`Đơn chuyển kho nguồn → kho online. Lý do mặc định "${cfg.ly_do || 'Kho Online Tỉnh'}" — đổi được ở ô Lý do.`],
      onThanhCong: async () => { setSua({}); taiPhieu(); setTimeout(() => songRef.current && tai(true), 1500); },
      onDong: () => taiPhieu(),
    });
  };
  const taoDon = async () => {
    const ph = await luuPhieu();
    if (!ph) return;
    if (!odoo) { baoToast(`Đã lưu phiếu ${ph.ma_phieu} — tài khoản chưa được mở tạo đơn Odoo, xuất Excel để gửi kho`); return; }
    guiOdoo(ph, dongChuyen);
  };
  const luuNhap = async () => { const ph = await luuPhieu(); if (ph) { baoToast(`Đã lưu nháp ${ph.ma_phieu} — nháp KHÔNG tính vào đang về`); setSua({}); } };

  const xuatExcel = async (ma = 'OL-NHAP', dong = dongChuyen, phan = ds.filter((m) => m.sl > 0), dsOdoo = null) => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const h1 = ['Kho nguồn', 'Kho đích', 'SKU/ Barcode', 'Số lượng', 'Mã phiếu'];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dong.map((d) => ({
      'Kho nguồn': d.tu, 'Kho đích': d.den, 'SKU/ Barcode': d.sku || d.barcode, 'Số lượng': d.sl, 'Mã phiếu': ma,
    })), { header: h1 }), 'Trang tính1');
    // NEW - 3.157.1: danh sách để kho online NHẬP vào Nhanh (kho KOL trên Odoo chỉ trừ tồn kho tổng — tồn online thật nằm ở Nhanh).
    //   Diễn giải phiếu nhập Nhanh ghi đúng mã phiếu Odoo (PDCK…) để app khớp "đã nhập".
    const maOdoo = (d) => (dsOdoo || []).find((o) => o.tt === 'thanh_cong' && o.tu === d.tu && o.den === d.den)?.name || '';
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dong.map((d) => ({
      'Mã sản phẩm (Nhanh)': d.ma || '', 'Mã vạch': d.barcode, 'Số lượng nhập': d.sl, 'Kho online': d.den, 'Từ kho': d.tu,
      'Ghi vào diễn giải phiếu nhập Nhanh': maOdoo(d) || `mã phiếu Odoo của đơn ${d.tu} → ${d.den} (${ma})`,
    }))), 'Nhập Nhanh');
    if (phan?.length) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(phan.map((m) => ({
        'Mã': m.r.m, 'Tên': m.r.t || '', 'Ngành': NGANH[m.r.n] || m.r.n, 'Bán/ngày (dự báo)': Math.round(m.v * 10) / 10,
        'Bán 7 ngày': m.r.s7 || 0, 'Bán 28 ngày': m.r.s28 || 0, 'Online có thể bán': m.co, 'Đang về': m.ve,
        'Đủ bán (ngày)': m.phu === Infinity ? '' : Math.round(m.phu * 10) / 10, 'Mục tiêu': Math.round(m.mucTieu),
        'Đề xuất': m.deXuat, 'Chuyển': m.sl, 'Kho nguồn': m.chia.map((c) => `${c.k}: ${c.sl}`).join(', '), 'Kho đích': m.den, 'Lý do': m.lyDo,
      }))), 'Phân tích');
    }
    XLSX.writeFile(wb, `CHIA_ONLINE_${ma}_${isoVN()}.xlsx`);
  };

  const datSap = (k) => setSap((s) => (s.k === k ? (s.g === -1 ? { k, g: 1 } : { k: '', g: -1 }) : { k, g: -1 }));
  const Th = ({ k, children, title, className }) => (
    <th className={(className || '') + (k ? ' sap' : '') + (sap.k === k ? ' on' : '')} title={title} onClick={k ? () => datSap(k) : undefined}>
      {children}{sap.k === k ? (sap.g > 0 ? ' ↑' : ' ↓') : ''}</th>
  );

  const moc = kq?.moc || {};
  return (
    <div className="co-man">
      <div className="cmdbar co-dau">
        <div className="cmd-title">
          <h2>Chia hàng Online</h2>
          <p>Bán online mỗi ngày · tồn kho online thật · hàng đang về — máy tính đề xuất chuyển đúng số, đúng kho nguồn, anh chốt rồi tạo đơn Odoo</p>
        </div>
        <div className="cmd-row">
          <span className="co-moc" title="Lúc lấy số liệu"><IcClock />
            Tồn online {gio(moc.ton_luc)} · Đơn {gio(moc.don_luc)} · Kho nguồn {gio(moc.nguon_luc)}{kq?.nho_luc ? ` · tính lúc ${gio(kq.nho_luc)}` : ''}
          </span>
          <button className="btn-hd" onClick={layTonNgay} title="Lấy ngay tồn kho online + phiếu nhập từ Nhanh (bình thường tự lấy mỗi 20 phút)"><IcBox /> Lấy tồn ngay</button>
          <button className="btn-hd" onClick={() => tai(true)} disabled={lamMoi}><IcRefresh /> {lamMoi ? 'Đang tính…' : 'Tính lại'}</button>
        </div>
      </div>

      <div className="hh-tabs dsl-man co-tabs">
        <button className={'hh-tab' + (tab === 'chia' ? ' on' : '')} onClick={() => setTab('chia')}><IcSpark /> Đề xuất chuyển</button>
        <button className={'hh-tab' + (tab === 'kho' ? ' on' : '')} onClick={() => setTab('kho')}><IcRadar /> Sức khoẻ kho online</button>
        <button className={'hh-tab' + (tab === 'phieu' ? ' on' : '')} onClick={() => { setTab('phieu'); taiPhieu(); }}>
          <IcGrid /> Phiếu đã chia{phieuDs?.filter((x) => x.tt === 'nhap').length ? <i className="co-dem">{phieuDs.filter((x) => x.tt === 'nhap').length} nháp</i> : null}</button>
      </div>

      {loi && <div className="dsl-canh"><IcAlert /> Chưa tải được số liệu: {loi} <button className="btn btn-ghost" onClick={() => tai(false)}>Thử lại</button></div>}
      {!kq && !loi && <div className="card dsl-trong">{dang ? 'Đang tính số liệu online…' : 'Đang mở…'}</div>}

      {kq && tab === 'chia' && (<>
        {kq.cu && <div className="co-bao"><IcClock /> Đang xem số tính lúc {gio(kq.nho_luc)} — {lamMoi ? 'đang tính lại với số mới…' : 'đã có số mới, bấm Tính lại'}</div>}
        {(kq.treo?.length > 0 || kq.nhap_cho > 0) && (
          <div className="co-bao vang">
            <IcAlert />
            {kq.treo?.length > 0 && <span><b>{kq.treo.length} phiếu Odoo đã xuất &gt; 4 ngày</b> mà Nhanh chưa thấy nhập ({fmtN(tong(kq.treo.map((x) => x.sl)))} cái) — không cộng vào đang về. <button className="co-link" onClick={() => setTab('kho')}>Xem</button></span>}
            {kq.nhap_cho > 0 && <span><b>{kq.nhap_cho} phiếu nháp</b> chưa lên Odoo — nháp không tính đang về. <button className="co-link" onClick={() => setTab('phieu')}>Xem</button></span>}
          </div>
        )}

        {/* ===== Dải số ===== */}
        <div className="co-kpi">
          <div><small>Bán online / ngày</small><b>{fmtN(tq.v)}</b><em>7 ngày qua TB {fmtN(tq.a7)} · hôm nay {fmtN(kq.hom_nay?.sl)} cái / {fmtN(kq.hom_nay?.don)} đơn</em></div>
          <div><small>Online có thể bán</small><b>{fmtN(tq.co)}</b><em>đủ ~{fmt1(tq.phu)} ngày bán</em></div>
          <div><small>Đang về kho online</small><b>{fmtN(tq.ve)}</b><em>tính cả đang về: ~{fmt1(tq.phuVe)} ngày</em></div>
          <div className={tq.het + tq.gap ? 'nong' : ''}><small>Cần gấp</small><b>{fmtN(tq.het + tq.gap)}</b><em>{tq.het} mã hết · {tq.gap} mã sắp hết · {tq.thap} thấp</em></div>
          <div className="chinh"><small>Đề xuất chuyển</small><b>{fmtN(tq.sl)}</b><em>{tq.ma} mã · {tq.don} đơn Odoo{tq.thieu ? ` · ${tq.thieu} mã thiếu nguồn` : ''}</em></div>
        </div>

        {/* ===== Bảng điều khiển ===== */}
        <div className="card co-dk">
          <div className="co-dk-o">
            <label>Số ngày phủ <b>{P.phu}</b> ngày</label>
            <input type="range" min="2" max="21" value={P.phu} onChange={(e) => setP((x) => ({ ...x, phu: Number(e.target.value) }))} />
            <small>Hàng về xong đủ bán thêm bao nhiêu ngày</small>
          </div>
          <div className="co-dk-o">
            <label>Mức an toàn</label>
            <div className="co-seg">
              {AN_TOAN.map(([k, t, , g]) => <button key={k} title={g} className={P.an === k ? 'on' : ''} onClick={() => setP((x) => ({ ...x, an: k }))}>{t}</button>)}
            </div>
            <small>{(AN_TOAN.find((a) => a[0] === P.an) || [])[3]}</small>
          </div>
          <div className="co-dk-o">
            <label>Làm tròn</label>
            <div className="co-seg">
              {[1, 5, 10].map((k) => <button key={k} className={P.lamTron === k ? 'on' : ''} onClick={() => setP((x) => ({ ...x, lamTron: k }))}>{k === 1 ? 'Lẻ' : k}</button>)}
            </div>
            <small>Mã bán ≥ 2/ngày làm tròn lên theo bước này</small>
          </div>
          <div className="co-dk-o">
            <label>Chừa cho cửa hàng <b>{P.giuNguon}%</b></label>
            <input type="range" min="0" max="50" step="5" value={P.giuNguon} onChange={(e) => setP((x) => ({ ...x, giuNguon: Number(e.target.value) }))} />
            <small>Không lấy hết khả dụng kho nguồn</small>
          </div>
          <div className="co-dk-o hep">
            <label>Tồn online = tồn Nhanh</label>
            <small>Kho KOL trên Odoo chỉ để trừ tồn kho tổng. Tính đủ mọi ngày bán, kể cả ngày sale lớn.</small>
            {user.vai_tro === 'ADMIN' && <button className="co-link" onClick={async () => {
              const { error } = await sb.rpc('fn_ol_cau_hinh_luu', { p_token: user.token, p_cfg: { ngay_phu: P.phu, an_toan: P.an, lam_tron: P.lamTron, giu_nguon: P.giuNguon } });
              baoToast(error ? 'Chưa lưu: ' + error.message : 'Đã đặt làm mặc định cho mọi người');
            }}>Đặt làm mặc định</button>}
          </div>
        </div>

        <div className="co-loc">
          <div className="ch-xem">
            {[['', 'Tất cả'], ...Object.entries(NGANH)].map(([k, t]) => (
              <button key={k} className={nganh === k ? 'on' : ''} onClick={() => setNganh(k)}>{t}<i>{fmtN(demNganh[k])}</i></button>
            ))}
          </div>
          <div className="co-chip">
            {LOC.map(([k, t]) => (
              <button key={k} className={(loc === k ? 'on ' : '') + ((k === 'het' || k === 'gap') && demLoc[k] ? 'nong' : '')} onClick={() => setLoc(loc === k ? '' : k)}>
                {t}<i>{fmtN(demLoc[k])}</i></button>
            ))}
          </div>
          <input className="co-tim" placeholder="Tìm mã, tên, màu…" value={q} onChange={(e) => setQ(e.target.value)} />
          {Object.keys(sua).length > 0 && <button className="co-link do" onClick={() => setSua({})}>Bỏ {Object.keys(sua).length} chỗ sửa tay</button>}
        </div>

        {/* ===== Bảng đề xuất ===== */}
        <div className="card co-bang-khung">
          <table className="co-bang">
            <thead>
              <tr>
                <th className="l">Sản phẩm <span className="co-dem2">{fmtN(hien.length)}</span></th>
                <th title="Bán mỗi ngày 28 ngày qua — 7 ngày gần nhất đậm, ngày bán cao nhất màu vàng">Bán 28 ngày</th>
                <Th k="v" title="Dự báo bán / ngày (50% TB 7 ngày + 30% TB 14 + 20% TB 28)">Bán/ngày</Th>
                <Th k="co" title="Tồn online có thể bán (Nhanh: đã trừ hàng giữ cho đơn, đang giao…)">Có thể bán</Th>
                <Th k="phu" title="Đủ bán bao nhiêu ngày · vạch 1 = thời gian hàng về · vạch 2 = mục tiêu (về + số ngày phủ)">Đủ bán</Th>
                <Th k="ve" title="Chỉ phiếu Odoo ĐÃ DUYỆT → kho online chưa nhập ở Nhanh + đơn app đã tạo thành công trên Odoo. Đơn chưa đẩy / chưa duyệt trên Odoo KHÔNG tính">Đang về</Th>
                <th title="Kho nguồn: số khả dụng · bấm để lấy từ kho này trước">Kho nguồn</th>
                <Th k="sl" className="c-sl" title="Số chuyển — gõ để sửa, xoá trống để về số máy tính">Chuyển</Th>
              </tr>
            </thead>
            <tbody>
              {hien.slice(0, soHien).map((m) => {
                const r = m.r; const mo = moMa === r.b;
                return [
                  <tr key={r.b} className={(m.tt ? 'co-r-' + m.tt : '') + (mo ? ' mo' : '')}>
                    <td className="l sp" onClick={() => setMoMa(mo ? null : r.b)}><div className="co-sp">
                      {r.h ? <img src={r.h} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} /> : <span className="anh" />}
                      <div>
                        <b>{r.m}{r.gs ? <i className="co-gia">{kGia(r.gs)}</i> : null}{r.moi && soNgay(r.moi, homNay) <= 45 ? <i className="co-moi">mới</i> : null}</b>
                        <small>{(r.t || '').replace(/-[^-]*$/, '') || r.n3 || ''}</small>
                      </div>
                      {m.tt && <span className={'co-tt ' + TT[m.tt][1]}>{TT[m.tt][0]}</span>}
                    </div></td>
                    <td><Song d={r.d} /></td>
                    <td className="so"><b>{fmt1(m.v)}</b>{m.v > 0 && (m.xh >= 1.25 ? <em className="len">↑{Math.round((m.xh - 1) * 100)}%</em> : m.xh <= 0.75 ? <em className="xuong">↓{Math.round((1 - m.xh) * 100)}%</em> : null)}
                      <small title="Trung bình / ngày: 7 ngày gần nhất · 28 ngày">TB 7n {fmt1((r.s7 || 0) / 7)} · 28n {fmt1((r.s28 || 0) / 28)}</small>
                      {r.hn ? <small>hôm nay {r.hn}</small> : null}</td>
                    <td className="so"><b>{fmtN(m.co)}</b>{r.on > m.co ? <small title="Tồn thực − có thể bán: hàng giữ cho đơn / đang giao">thực {fmtN(r.on)}</small> : null}</td>
                    <td><Thuoc m={m} phu={P.phu} /></td>
                    <td className="so" title={(r.vc || []).map((x) => `${x.p} · ${x.k} · ${x.sl} cái · ${x.tt} ${ngayNgan(x.n)}`).join('\n')}>
                      {m.ve ? <><b className="ve">+{fmtN(m.ve)}</b><small>{(r.vc || []).length} phiếu</small></> : <span className="nhat">·</span>}</td>
                    <td className="nguon">
                      {m.thuTu.length ? m.thuTu.map((k) => {
                        const c = m.chia.find((x) => x.k === k);
                        const kd = r.ng?.[k] || 0;
                        return (
                          <button key={k} className={(c ? 'lay ' : '') + (kd ? '' : 'het')} onClick={() => datNguon(r.b, k)}
                            title={`${TEN_KHO[k] || k}: khả dụng ${fmtN(kd)}${r.ls?.[k] ? ` · 60 ngày đã chuyển online ${fmtN(r.ls[k])}` : ''}${c ? ` · lấy ${c.sl}` : ''}`}>
                            {k}<i>{fmtN(kd)}</i>{c ? <em>−{fmtN(c.sl)}</em> : null}
                          </button>);
                      }) : <span className="nhat">chưa đặt kho nguồn</span>}
                      {m.thieu > 0 && <small className="thieu">thiếu {fmtN(m.thieu)}</small>}
                      {m.vuot && <small className="thieu">vượt khả dụng</small>}
                    </td>
                    <td className="c-sl">
                      <input inputMode="numeric" value={sua[r.b]?.sl ?? ''} placeholder={String(m.sl || 0)}
                        className={sua[r.b]?.sl != null ? 'sua' : m.sl ? 'goi-y' : ''} title={m.lyDo}
                        onChange={(e) => datSo(r.b, e.target.value.replace(/[^\d]/g, ''))} />
                      {sua[r.b]?.sl != null ? <small className="ai" onClick={() => datSo(r.b, '')} title="Về số máy tính">máy: {m.deXuat}</small>
                        : m.thieu > 0 ? <small className="thieu" title="Máy tính cần nhiều hơn khả dụng kho nguồn">cần {fmtN(m.deXuat)}</small> : null}
                    </td>
                  </tr>,
                  mo && (
                    <tr key={r.b + '-ct'} className="co-ct"><td colSpan={8}>
                      <div className="co-ct-o">
                        <div><small>Vì sao</small><p>{m.lyDo || 'Không bán trong 28 ngày — không đề xuất chuyển.'}</p></div>
                        <div><small>Số liệu</small><p>Bán 7 ngày {fmtN(r.s7)} · 14 ngày {fmtN(r.s14)} · 28 ngày {fmtN(r.s28)} · độ lệch {fmt1(m.sd)}/ngày<br />
                          Online: thực {fmtN(r.on)} · có thể bán {fmtN(r.cb)} · giữ cho đơn {fmtN(r.gi)}<br />
                          Kho đích {m.den} · thời gian về {fmt1(m.L)} ngày{r.lc ? ` · lần chuyển gần nhất ${ngayNgan(r.lc)}` : ''}</p></div>
                        {(r.vc || []).length > 0 && <div><small>Đang về</small>{r.vc.map((x) => <p key={x.p} className="phu">{x.p} · {x.k} · <b>{x.sl}</b> · {x.tt} {ngayNgan(x.n)}</p>)}</div>}
                        <div><small>Mã</small><p>{r.b}{r.sku ? ' · SKU ' + r.sku : ''}<br />{r.t}</p></div>
                      </div>
                    </td></tr>
                  ),
                ];
              })}
              {!hien.length && <tr><td colSpan={8} className="co-trong">{loc === 'can' ? 'Không có mã nào cần chuyển với thông số hiện tại 👌' : 'Không có mã nào khớp'}</td></tr>}
            </tbody>
          </table>
          {hien.length > soHien && <button className="co-them" onClick={() => setSoHien((n) => n + 250)}>Xem thêm {fmtN(Math.min(250, hien.length - soHien))} mã</button>}
        </div>

        {/* ===== Thanh chốt ===== */}
        <div className="co-chot">
          <div className="co-chot-so"><b>{fmtN(tq.sl)}</b><span>cái · {tq.ma} mã<br />{tq.don} đơn Odoo</span></div>
          <div className="co-chot-cap">
            {tongCap.slice(0, 6).map((c) => <span key={c.tu + c.den} title={`${TEN_KHO[c.tu] || c.tu} → ${TEN_KHO[c.den] || c.den}`}>{c.tu} <i>→</i> {c.den} <b>{fmtN(c.sl)}</b><small>{c.ma} mã</small></span>)}
            {!tongCap.length && <span className="nhat">Chưa có mã nào cần chuyển</span>}
          </div>
          {phieuSua && <span className="co-dang-sua">Đang sửa nháp {phieuSua.ma_phieu} <button className="co-link" onClick={() => { setPhieuSua(null); setSua({}); }}>Bỏ</button></span>}
          <button className="btn btn-ghost" disabled={!dongChuyen.length} onClick={() => xuatExcel()}><IcDown /> Excel</button>
          <button className="btn btn-ghost" disabled={!dongChuyen.length || dangLuu} onClick={luuNhap}>Lưu nháp</button>
          <button className="btn btn-ai co-gui" disabled={!dongChuyen.length || dangLuu} onClick={taoDon}><IcGuiLen /> {dangLuu ? 'Đang lưu…' : 'Tạo đơn Odoo'}</button>
        </div>
      </>)}

      {kq && tab === 'kho' && <SucKhoe ds={ds} kq={kq} P={P} />}
      {tab === 'phieu' && <DsPhieu ds={phieuDs} user={user} baoToast={baoToast} taiLai={taiPhieu} odoo={odoo} guiOdoo={guiOdoo} xuatExcel={xuatExcel}
        moSua={async (ph) => {
          const { data, error } = await sb.rpc('fn_ol_phieu_ct', { p_token: user.token, p_id: ph.id });
          if (error) { baoToast(error.message); return; }
          const s = {};
          (data || []).forEach((d) => { s[d.barcode] = { sl: (s[d.barcode]?.sl || 0) + d.sl, nguon: s[d.barcode]?.nguon || d.tu }; });
          setSua(s); setPhieuSua({ id: ph.id, ma_phieu: ph.ma_phieu }); setLoc('can'); setTab('chia');
          baoToast(`Đã mở ${ph.ma_phieu} — sửa xong bấm Lưu nháp / Tạo đơn Odoo (phiếu cũ tự huỷ, thay bằng phiếu mới)`);
        }} />}
    </div>
  );
}

// ============================================================================
// SỨC KHOẺ KHO ONLINE
// ============================================================================
const NHOM_PHU = [['het', 'Hết hàng'], ['gap', 'Sắp hết'], ['thap', 'Thấp'], ['du', 'Ổn'], ['thua', 'Tồn nhiều'], ['cham', 'Không bán']];
function SucKhoe({ ds, kq, P }) {
  const theoNganh = useMemo(() => Object.keys(NGANH).map((n) => {
    const a = ds.filter((m) => m.r.n === n && m.tt);
    const dem = Object.fromEntries(NHOM_PHU.map(([k]) => [k, a.filter((m) => m.tt === k).length]));
    const v = tong(a.map((m) => m.v)), co = tong(a.map((m) => m.co));
    return { n, a, dem, tong: a.length, v, co, phu: v > 0 ? co / v : 0 };
  }), [ds]);
  const thua = useMemo(() => ds.filter((m) => m.tt === 'thua' || m.tt === 'cham')
    .map((m) => ({ m, giaTri: m.co * (m.r.gs || m.r.g || 0) })).sort((a, b) => b.giaTri - a.giaTri).slice(0, 40), [ds]);
  const chay = useMemo(() => ds.filter((m) => m.v > 0).sort((a, b) => b.v - a.v).slice(0, 20), [ds]);
  const lt = kq.lt || {};
  return (
    <div className="co-sk">
      <div className="card co-sk-o">
        <h3>Kho online đang đủ bán bao lâu</h3>
        <p className="co-mo">Mỗi mã có bán xếp theo số ngày đủ bán (có thể bán ÷ bán/ngày), so với thời gian về + {P.phu} ngày phủ</p>
        {theoNganh.map((g) => (
          <div key={g.n} className="co-sk-dong">
            <div className="ten"><b>{NGANH[g.n]}</b><small>{fmtN(g.co)} cái · ~{fmt1(g.phu)} ngày · {fmtN(g.v)}/ngày</small></div>
            <div className="thanh">
              {NHOM_PHU.map(([k, t]) => g.dem[k] ? (
                <i key={k} className={'co-k-' + k} style={{ flexGrow: g.dem[k] }} title={`${t}: ${g.dem[k]} mã`}>{g.dem[k] >= Math.max(3, g.tong * 0.05) ? g.dem[k] : ''}</i>
              ) : null)}
            </div>
          </div>
        ))}
        <div className="co-chu">{NHOM_PHU.map(([k, t]) => <span key={k}><i className={'co-k-' + k} />{t}</span>)}</div>
      </div>

      <div className="card co-sk-o">
        <h3>Thời gian hàng về thật</h3>
        <p className="co-mo">Từ lúc tạo phiếu Odoo tới lúc kho online nhập ở Nhanh — 30 ngày gần nhất, máy tính dùng số này cho từng kho nguồn</p>
        <div className="co-lt">
          {Object.keys(lt).length ? Object.entries(lt).sort((a, b) => a[1] - b[1]).map(([k, v]) => (
            <div key={k}><b>{fmt1(v)}</b><small>ngày</small><span>{k}<em>{TEN_KHO[k] || ''}</em></span></div>
          )) : <span className="nhat">Chưa đủ phiếu để đo — tạm dùng 2 ngày</span>}
        </div>
      </div>

      <div className="card co-sk-o rong">
        <h3>Phiếu treo <span className="co-dem2">{(kq.treo || []).length}</span></h3>
        <p className="co-mo">Phiếu Odoo → kho online đã xuất hơn 4 ngày mà Nhanh chưa thấy phiếu nhập (khớp mã PDCK / XKDC ở diễn giải). Kho KOL trên Odoo chỉ để trừ tồn kho tổng — hàng chỉ thành tồn online khi đã NHẬP vào Nhanh. Kiểm tra với kho online: hàng tới chưa nhập Nhanh, hay đã nhập mà không ghi mã phiếu. Máy tính KHÔNG cộng các phiếu này vào đang về.</p>
        {(kq.treo || []).length ? (
          <table className="co-bang nho"><thead><tr><th className="l">Phiếu</th><th>Kho nguồn</th><th>Kho online</th><th>Tạo</th><th>Xuất</th><th>Mã</th><th>Số lượng</th></tr></thead>
            <tbody>{kq.treo.map((x) => <tr key={x.ma_phieu}><td className="l"><b>{x.ma_phieu}</b></td><td>{x.nguon}</td><td>{x.den}</td><td>{ngayNgan(x.ngay_tao)}</td><td>{ngayNgan(x.ngay_xuat)}</td><td>{x.so_ma}</td><td className="so"><b>{fmtN(x.sl)}</b></td></tr>)}</tbody></table>
        ) : <p className="nhat">Không có phiếu treo 👌</p>}
      </div>

      <div className="card co-sk-o">
        <h3>Bán chạy nhất online</h3>
        <table className="co-bang nho"><thead><tr><th className="l">Mã</th><th>Bán/ngày</th><th>Có thể bán</th><th>Đủ bán</th></tr></thead>
          <tbody>{chay.map((m) => <tr key={m.r.b} className={'co-r-' + m.tt}><td className="l"><b>{m.r.m}</b></td><td className="so">{fmt1(m.v)}{m.xh >= 1.25 ? <em className="len"> ↑</em> : m.xh <= 0.75 ? <em className="xuong"> ↓</em> : null}</td>
            <td className="so">{fmtN(m.co)}</td><td className="so"><span className={'co-tt ' + (TT[m.tt]?.[1] || '')}>{m.phu === Infinity ? '—' : fmt1(m.phu) + ' ngày'}</span></td></tr>)}</tbody></table>
      </div>

      <div className="card co-sk-o">
        <h3>Tồn nhiều / không bán</h3>
        <p className="co-mo">Đủ bán &gt; 45 ngày hoặc 28 ngày không bán — cân nhắc đẩy live / trả về kho. Xếp theo giá trị tồn.</p>
        <table className="co-bang nho"><thead><tr><th className="l">Mã</th><th>Có thể bán</th><th>Bán/ngày</th><th>Giá trị</th></tr></thead>
          <tbody>{thua.map(({ m, giaTri }) => <tr key={m.r.b}><td className="l"><b>{m.r.m}</b><small> {NGANH[m.r.n]}</small></td><td className="so">{fmtN(m.co)}</td>
            <td className="so">{m.v > 0 ? fmt1(m.v) : '0'}</td><td className="so">{giaTri ? kGia(giaTri) : '—'}</td></tr>)}</tbody></table>
      </div>
    </div>
  );
}

// ============================================================================
// PHIẾU ĐÃ CHIA
// ============================================================================
function DsPhieu({ ds, user, baoToast, taiLai, odoo, guiOdoo, xuatExcel, moSua }) {
  const [mo, setMo] = useState(null);
  const [ct, setCt] = useState({});
  const xemCt = async (ph) => {
    if (mo === ph.id) { setMo(null); return; }
    setMo(ph.id);
    if (!ct[ph.id]) {
      const { data, error } = await sb.rpc('fn_ol_phieu_ct', { p_token: user.token, p_id: ph.id });
      if (error) { baoToast(error.message); return; }
      setCt((c) => ({ ...c, [ph.id]: data || [] }));
    }
  };
  const layCt = async (ph) => {
    if (ct[ph.id]) return ct[ph.id];
    const { data, error } = await sb.rpc('fn_ol_phieu_ct', { p_token: user.token, p_id: ph.id });
    if (error) { baoToast(error.message); return null; }
    setCt((c) => ({ ...c, [ph.id]: data || [] }));
    return data || [];
  };
  const huy = async (ph) => {
    const { error } = await sb.rpc('fn_ol_phieu_huy', { p_token: user.token, p_id: ph.id });
    baoToast(error ? error.message : `Đã huỷ nháp ${ph.ma_phieu}`);
    taiLai();
  };
  if (!ds) return <div className="card dsl-trong">Đang tải phiếu…</div>;
  if (!ds.length) return <div className="card dsl-trong">Chưa có phiếu chia online nào trong 30 ngày — tạo ở tab Đề xuất chuyển.</div>;
  const TTP = { nhap: ['Nháp', 'nhap'], da_gui: ['Đã lên Odoo', 'ok'], huy: ['Đã huỷ', 'huy'] };
  return (
    <>
    <div className="co-bao"><IcAlert />
      <span>Mỗi lần chuyển online làm <b>đồng thời 2 việc</b>: ① đơn Odoo về KOL05002 / KOL05001 (chỉ để trừ tồn kho tổng) · ② kho online <b>nhập phiếu vào Nhanh</b>, diễn giải ghi mã phiếu Odoo (PDCK…). Tồn Nhanh là tồn thật — app khớp phiếu nhập Nhanh để biết hàng đã vào online.</span>
    </div>
    <div className="card co-bang-khung">
      <table className="co-bang co-phieu">
        <thead><tr><th className="l">Phiếu</th><th>Trạng thái</th><th>Mã</th><th>Số lượng</th><th className="l">Đơn Odoo</th><th className="l">Người · lúc</th><th></th></tr></thead>
        <tbody>
          {ds.map((ph) => [
            <tr key={ph.id} className={mo === ph.id ? 'mo' : ''}>
              <td className="l" onClick={() => xemCt(ph)} style={{ cursor: 'pointer' }}><b>{ph.ma_phieu}</b><small>{ph.ghi_chu || ''}</small></td>
              <td><span className={'co-tt ' + TTP[ph.tt][1]}>{TTP[ph.tt][0]}</span>{ph.n_loi ? <small className="thieu">{ph.n_loi} đơn lỗi</small> : null}</td>
              <td className="so">{fmtN(ph.so_ma)}</td>
              <td className="so"><b>{fmtN(ph.tong_sl)}</b></td>
              <td className="l odoo">{(ph.ds || []).map((o) => {
                // NEW - 3.157.1: mỗi đơn chuyển online phải đủ 2 bước — Odoo xuất (trừ kho nguồn) + Nhanh nhập (cộng tồn online)
                const nh = o.nhap; const xu = o.xuat;
                const buoc = o.tt !== 'thanh_cong' ? null : nh ? (nh.sl >= (xu?.sl || o.sl) ? 'du' : 'thieu') : 'chua';
                return (
                  <span key={o.id} className={'co-od ' + o.tt + (buoc ? ' nh-' + buoc : '')} title={o.loi || o.ct || ''}>
                    {o.name}<small>{o.tu}→{o.den} · {fmtN(o.sl)}</small>
                    {o.tt === 'thanh_cong' && <small className="buoc">Odoo: {xu?.tt || 'chờ đồng bộ'}{xu?.sl ? ` ${fmtN(xu.sl)}` : ''}</small>}
                    {buoc && <small className="buoc nhanh">Nhanh: {buoc === 'chua' ? 'CHƯA nhập' : `đã nhập ${fmtN(nh.sl)}${buoc === 'thieu' ? ' (thiếu)' : ''} · ${ngayNgan(nh.ngay)}`}</small>}
                  </span>);
              })}
                {!(ph.ds || []).length && <span className="nhat">—</span>}</td>
              <td className="l"><small>{ph.nguoi} · {gioNgay(ph.tao_luc)}</small></td>
              <td className="nut">
                {ph.tt === 'nhap' && odoo && <button className="btn btn-ai" onClick={async () => { const d = await layCt(ph); if (d?.length) guiOdoo(ph, d); }}><IcGuiLen /> Tạo đơn Odoo</button>}
                {ph.tt === 'nhap' && <button className="btn btn-ghost" onClick={() => moSua(ph)}>Sửa</button>}
                <button className="btn btn-ghost" title="Excel: đơn Odoo + danh sách nhập Nhanh" onClick={async () => { const d = await layCt(ph); if (d) xuatExcel(ph.ma_phieu, d, null, ph.ds); }}><IcDown /></button>
                {ph.tt === 'nhap' && <button className="btn btn-ghost do" onClick={() => huy(ph)}>Huỷ</button>}
              </td>
            </tr>,
            mo === ph.id && (
              <tr key={ph.id + '-ct'} className="co-ct"><td colSpan={7}>
                {!ct[ph.id] ? 'Đang tải…' : (
                  <table className="co-bang nho"><thead><tr><th className="l">Mã</th><th>Từ</th><th>Đến</th><th>Chuyển</th><th>Máy tính</th><th className="l">Vì sao</th></tr></thead>
                    <tbody>{ct[ph.id].map((d, i) => <tr key={i}><td className="l"><b>{d.ma}</b></td><td>{d.tu}</td><td>{d.den}</td><td className="so"><b>{fmtN(d.sl)}</b></td>
                      <td className="so">{d.de_xuat != null ? fmtN(d.de_xuat) : '—'}</td><td className="l"><small>{d.ly_do || ''}</small></td></tr>)}</tbody></table>
                )}
              </td></tr>
            ),
          ])}
        </tbody>
      </table>
    </div>
    </>
  );
}

// NEW - 3.157: máy tính dùng lại được (kiểm thử)
export { tinhMa };
