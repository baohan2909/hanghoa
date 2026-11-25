// ============================================================================
// NEW - 3.157 CHIA HÀNG ONLINE
//   Chuyển hàng từ kho nguồn (Odoo) → kho online, đúng số, đúng kho nguồn, đúng lúc:
//     Bán online mỗi ngày (Nhanh, mọi kênh)  ·  Tồn online THẬT (Nhanh kho giao online)  ·  Đang về (phiếu Odoo chưa nhập Nhanh)
//     → dự báo bán (7/14/28 ngày, TÍNH ĐỦ mọi ngày — kể cả ngày sale lớn 11/11, 12/12) × (thời gian về thật + số ngày phủ) + mức an toàn
//   NEW - 3.157.1: kho KOL05001 / KOL05002 trên Odoo chỉ là kho "bù nhìn" để trừ tồn kho tổng — TỒN THẬT CỦA ONLINE = TỒN NHANH.
//     Mỗi lần chuyển online làm đồng thời 2 việc: đơn Odoo (trừ kho nguồn) + phiếu NHẬP ở Nhanh (cộng tồn online, ghi mã phiếu PDCK… vào diễn giải).
//     App theo dõi từng đơn: Odoo đã xuất chưa → Nhanh đã nhập chưa (đủ số chưa).
//     → trừ tồn có thể bán + đang về → làm tròn → lấy từ kho nguồn quen của mã (còn khả dụng) → đơn Odoo
//   NEW - 3.159 (SQL 284) CHIA THEO NHÓM KHO giống Đề nghị hàng (cửa hàng) / Chia hàng đội sale: 5 nhóm Bảo hiểm chính / sale ·
//     Nón vải chính / sale · Phụ kiện — mỗi nhóm lấy từ ĐÚNG 1 kho tổng (kho_tong_ma, dùng chung với cửa hàng); cột tồn như cửa hàng:
//     Tồn online (có thể bán + đang về = tổng) · Kho tổng (khả dụng kho của nhóm, còn lại sau chia) · AI đề xuất · Chuyển · Sau nhận.
//   NEW - 3.159.4 LÀM THEO ĐỘI SALE: 3 ô gõ số Sức bán N ngày · Chia đủ N ngày · Tỷ lệ % (bỏ thanh kéo, bỏ mức an toàn);
//     ô Chuyển TRỐNG tới khi bấm "Tự động chia" (cột Gợi ý bấm là lấy) · Điền lại / Xoá số · dòng cuối 1 hàng mỏng · bỏ Lưu nháp (tự lưu trên máy).
//   Số liệu: fn_ol_du_lieu (SQL 277, tính sẵn ở máy chủ, làm mới nền mỗi lượt kéo Nhanh). Máy tính chạy ngay trên máy:
//   kéo "Số ngày phủ" / "Mức an toàn" là thấy số mới tức thì.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { useApp } from '../App.jsx';
import { IcRefresh, IcDown, IcAlert, IcClock, IcSpark, IcGuiLen, IcBox, IcGrid, IcRadar, IcCheck } from '../lib/icons.jsx';
import { useOdooCfg, moOdoo, gomDon } from '../lib/odoo.js';
import { isoVN } from '../lib/ui.jsx';

const NGANH = { BH: 'Nón bảo hiểm', NV: 'Nón vải', PK: 'Phụ kiện' };
// NEW - 3.159: nhóm kho giống Đề nghị hàng — mỗi nhóm 1 kho tổng
const NHOM = [['BH_C', 'Bảo hiểm — chính'], ['BH_S', 'Bảo hiểm — sale'], ['NV_C', 'Nón vải — chính'], ['NV_S', 'Nón vải — sale'], ['PK', 'Phụ kiện']];
const TEN_NHOM = { BH_C: 'BH chính', BH_S: 'BH sale', NV_C: 'NV chính', NV_S: 'NV sale', PK: 'Phụ kiện' };
const KHO_NHOM_MD = { BH_C: 'TP05006', BH_S: 'SA05001', NV_C: 'TP05002', NV_S: 'SA05002', PK: 'PK05001' };
const nhomCua = (r) => (r.n === 'PK' ? 'PK' : (r.n === 'BH' ? 'BH' : 'NV') + '_' + (r.s ? 'S' : 'C'));
const TEN_KHO = {
  KOL05002: 'Kho Online - Bảo hiểm', KOL05001: 'Kho Online - Nón vải',
  SA05001: 'Kho Sale Bảo hiểm', TP05006: 'Kho Xuất Nón bảo hiểm', PK05001: 'Kho Phụ kiện',
  TP05002: 'Kho Thành phẩm Nón vải', SA05002: 'Kho Sale Nón vải',
};
const TT = {
  het: ['Hết hàng', 'het'], gap: ['Sắp hết', 'gap'], thap: ['Chưa đủ', 'thap'], du: ['Ổn', 'du'],
  thua: ['Tồn nhiều', 'thua'], cham: ['Không bán', 'cham'],
};
const THU_TT = { het: 0, gap: 1, thap: 2, du: 3, thua: 4, cham: 5 };

const fmtN = (n) => (n == null || Number.isNaN(n) ? '—' : Math.round(n).toLocaleString('vi'));
const fmt1 = (n) => (n == null || !Number.isFinite(n) ? '—' : (Math.round(n * 10) / 10).toLocaleString('vi'));
const gio = (s) => (s ? new Date(s).toLocaleTimeString('vi', { hour: '2-digit', minute: '2-digit' }) : '—');
const gioNgay = (s) => { if (!s) return '—'; const d = new Date(s); return gio(s) + ' ' + d.toLocaleDateString('vi', { day: '2-digit', month: '2-digit' }); };
const ngayNgan = (s) => (s ? s.slice(8, 10) + '/' + s.slice(5, 7) : '—');
const kGia = (g) => (g ? (g >= 1e6 ? fmt1(g / 1e6) + 'tr' : Math.round(g / 1000) + 'k') : '');
const tong = (a) => a.reduce((s, x) => s + x, 0);
const soNgay = (tu, den) => Math.round((Date.parse(den + 'T00:00:00') - Date.parse(tu + 'T00:00:00')) / 864e5);
const boDau = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
const soNguyen = (v) => { const n = parseInt(String(v ?? '').replace(/[^\d]/g, ''), 10); return Number.isFinite(n) ? n : 0; };

// NEW - 3.159.4: thông số kiểu Đội Sale (Sức bán · Chia đủ · Tỷ lệ) — khoá mới, không dùng lại thanh kéo cũ
const LS = 'ns_chia_online_ts2';
const docTs = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } };
// NEW - 3.159.4: số anh gõ ở ô Chuyển TỰ LƯU trên máy (thay nút Lưu nháp) — chỉ giữ trong ngày
const LS_SUA = 'ns_chia_online_sua';
const docSua = (homNay) => { try { const o = JSON.parse(localStorage.getItem(LS_SUA)); return o && o.ngay === homNay ? o : null; } catch { return null; } };

// ---------------------------------------------------------------------------
// MÁY TÍNH — 1 mã   (NEW - 3.159.4: cùng cách tính với Chia hàng đội sale)
//   bán/ngày  = bán N ngày gần nhất (tới hôm qua) ÷ N        — N = ô "Sức bán" (1–28); mã mới chia theo số ngày đã có
//               tính đủ mọi ngày, kể cả ngày sale lớn (11/11, 12/12…)
//   mục tiêu  = làm tròn lên (bán/ngày × "Chia đủ" × "Tỷ lệ"%)
//   gợi ý     = mục tiêu − tồn online có thể bán − đang về  → làm tròn (bán ≥ 2/ngày: theo bước ⚙) → không vượt kho tổng khả dụng
//   ô Chuyển  = TRỐNG cho tới khi anh bấm "Tự động chia" (điền = gợi ý) hoặc tự gõ / bấm số gợi ý
//   kho tổng  = đúng 1 kho của NHÓM mã (BH/NV chính → TP, sale → SA, phụ kiện → PK05001) như cửa hàng
// ---------------------------------------------------------------------------
function tinhMa(r, p, cfg, lt, homNay, sua, khoNhom = KHO_NHOM_MD) {
  const d = r.d || new Array(28).fill(0);
  const moi = r.moi && soNgay(r.moi, homNay) < 28;
  const tuoi = moi && r.nd ? Math.max(1, Math.min(28, soNgay(r.nd, homNay))) : 28;
  const n = Math.max(1, Math.min(p.sb, tuoi));
  const banN = tong(d.slice(28 - n));
  let v = banN / n;
  if (v === 0 && r.hn > 0 && tuoi <= 1) v = r.hn;   // mã mới tinh, mới bán hôm nay
  const a7 = tong(d.slice(-Math.min(7, tuoi))) / Math.min(7, tuoi);
  const a28 = tong(d.slice(28 - tuoi)) / tuoi;
  const xh = a28 > 0 ? a7 / a28 : a7 > 0 ? 2 : 1;

  const nh = nhomCua(r);
  const chinh = khoNhom?.[nh] || KHO_NHOM_MD[nh];
  const L = Math.max(1, Number(lt?.[chinh]) || 2);
  const mucTieu = v > 0 ? Math.ceil(v * p.cd * p.tl / 100 - 1e-9) : 0;
  const co = Math.max(0, r.cb || 0), ve = r.ve || 0;
  const can = Math.max(0, mucTieu - co - ve);
  const buoc = v >= 2 ? Math.max(1, p.lamTron) : 1;
  let deXuat = can > 0 ? Math.ceil(can / buoc) * buoc : 0;
  const phu = v > 0 ? co / v : Infinity;
  const phuVe = v > 0 ? (co + ve) / v : Infinity;
  if (deXuat > 0 && deXuat < (cfg.toi_thieu ?? 2) && phuVe > L + 1) deXuat = 0;

  const giu = Math.max(0, Math.min(90, Number(p.giuNguon) || 0)) / 100;
  const kd = r.ng?.[chinh] || 0;
  const kdDung = Math.max(0, Math.floor(kd * (1 - giu)));
  const goiY = Math.min(deXuat, kdDung);
  const thieu = deXuat - goiY;   // kho tổng không đủ cho số gợi ý
  const daSua = sua?.sl != null;
  const sl = daSua ? Math.max(0, Math.floor(sua.sl)) : 0;
  const vuot = sl > kdDung;
  const chia = sl > 0 && chinh ? [{ k: chinh, sl }] : [];
  const sauSl = co + ve + sl;
  const sau = v > 0 ? sauSl / v : Infinity;
  const chuaDu = v > 0 && deXuat > 0 && sauSl < mucTieu;   // sau chuyển vẫn chưa đủ "Chia đủ"
  const tt = v <= 0.05 ? (co > 0 ? 'cham' : null) : co <= 0 ? 'het' : phu < L ? 'gap' : phuVe < p.cd ? 'thap'
    : phuVe > 45 && co > 10 ? 'thua' : 'du';
  const lyDo = v > 0
    ? `Bán ${fmtN(banN)} cái / ${n} ngày = ${fmt1(v)}/ngày × chia đủ ${p.cd} ngày${p.tl !== 100 ? ` × ${p.tl}%` : ''} = ${fmtN(mucTieu)}`
      + ` − tồn ${fmtN(co)}${ve ? ` − đang về ${fmtN(ve)}` : ''} = cần ${fmtN(can)}${deXuat !== can && deXuat ? ` → làm tròn ${fmtN(deXuat)}` : ''}`
      + (thieu > 0 ? ` · kho ${chinh} chỉ còn ${fmtN(kdDung)} → gợi ý ${fmtN(goiY)}` : '')
    : '';
  return { r, v, n, banN, a7, a28, xh, L, mucTieu, co, ve, can, deXuat, goiY, sl, chia, thieu, vuot, chuaDu,
    phu, phuVe, tt, nh, kho: chinh, kd, kdDung, con: kd - sl, sau, sauSl, den: cfg.kho_dich?.[r.n] || 'KOL05002', lyDo, daSua };
}

// NEW - 3.159.4: ô số gõ tay giống Đội Sale (gõ xong 0,6 giây tự áp, Enter / rời ô là chốt, Esc huỷ)
function OSo({ gt, min, max, onDat }) {
  const [o, setO] = useState(String(gt));
  const hen = useRef(null);
  useEffect(() => { setO(String(gt)); }, [gt]);
  useEffect(() => () => clearTimeout(hen.current), []);
  const chot = (v, epVe) => {
    const n = soNguyen(v);
    if (!n) { if (epVe) setO(String(gt)); return; }
    const c = Math.max(min, Math.min(max, n));
    if (epVe) setO(String(c));
    if (c !== gt) onDat(c);
  };
  return (
    <input type="number" inputMode="numeric" min={min} max={max} value={o}
      onChange={(e) => {
        const v = e.target.value; setO(v); clearTimeout(hen.current);
        const n = soNguyen(v); if (n >= min && n <= max) hen.current = setTimeout(() => chot(v, false), 600);
      }}
      onBlur={() => { clearTimeout(hen.current); chot(o, true); }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); else if (e.key === 'Escape') { setO(String(gt)); e.currentTarget.blur(); } }}
      onFocus={(e) => e.target.select()} />
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
  const [p, setP] = useState({ sb: ts0.sb ?? null, cd: ts0.cd ?? null, tl: ts0.tl ?? null, lamTron: ts0.lamTron ?? null, giuNguon: ts0.giuNguon ?? null });
  const sua0 = useMemo(() => docSua(isoVN()), []);   // NEW - 3.159.4: số đã gõ dở hôm nay
  const [nhom, setNhom] = useState('');   // NEW - 3.159: '' = xem tất cả
  const [loc, setLoc] = useState('can');
  const [q, setQ] = useState('');
  const [sap, setSap] = useState({ k: '', g: -1 });
  const [sua, setSua] = useState(sua0?.sua || {});
  const [moTs, setMoTs] = useState(false);   // NEW - 3.159.4: hộp ⚙ (làm tròn · chừa cho cửa hàng · mặc định)
  const [soHien, setSoHien] = useState(250);
  const [moMa, setMoMa] = useState(null);
  const [phieuDs, setPhieuDs] = useState(null);
  const [phieuSua, setPhieuSua] = useState(sua0?.phieuSua || null);   // {id, ma_phieu} khi mở lại phiếu nháp để sửa
  const [dangLuu, setDangLuu] = useState(false);
  const songRef = useRef(true);
  const kqRef = useRef(null);
  const banRef = useRef(datBan);
  banRef.current = datBan;
  useEffect(() => () => { songRef.current = false; banRef.current?.('chiaonline', false); }, []);

  const cfg = kq?.cfg || {};
  // NEW - 3.159.4: Sức bán (1–28 ngày) · Chia đủ (ngày) · Tỷ lệ % — như Đội Sale; mặc định do Quản trị đặt
  const P = useMemo(() => ({
    sb: p.sb ?? cfg.suc_ban ?? 28, cd: p.cd ?? cfg.chia_du ?? 10, tl: p.tl ?? cfg.ty_le ?? 100,
    lamTron: p.lamTron ?? cfg.lam_tron ?? 5, giuNguon: p.giuNguon ?? cfg.giu_nguon ?? 0,
  }), [p, cfg.suc_ban, cfg.chia_du, cfg.ty_le, cfg.lam_tron, cfg.giu_nguon]);
  useEffect(() => { try { localStorage.setItem(LS, JSON.stringify(p)); } catch { /* bỏ qua */ } }, [p]);
  useEffect(() => {   // NEW - 3.159.4: tự lưu số đang gõ (thay Lưu nháp)
    try {
      if (Object.keys(sua).length || phieuSua) localStorage.setItem(LS_SUA, JSON.stringify({ ngay: isoVN(), sua, phieuSua }));
      else localStorage.removeItem(LS_SUA);
    } catch { /* bỏ qua */ }
  }, [sua, phieuSua]);
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
  const ds = useMemo(() => (kq?.rows || []).map((r) => tinhMa(r, P, cfg, kq?.lt, homNay, sua[r.b], kq?.kho_nhom)),
    [kq, P, sua]);   // eslint-disable-line

  // ===== Tổng quan =====
  const theoNganh = useMemo(() => ds.filter((m) => !nhom || m.nh === nhom), [ds, nhom]);
  const tq = useMemo(() => {   // NEW - 3.159.4: dòng cuối = mọi nhóm (đúng số sẽ tạo đơn)
    const theoNganh = ds;
    const ban = theoNganh.filter((m) => m.v > 0);
    const v = tong(ban.map((m) => m.v));
    const truoc = tong(ban.map((m) => m.co + m.ve)), sau = tong(ban.map((m) => m.sauSl));
    const chon = theoNganh.filter((m) => m.sl > 0);
    const don = new Set(chon.flatMap((m) => m.chia.map((c) => c.k + '>' + m.den)));
    return {
      v, phuTruoc: v > 0 ? truoc / v : 0, phuSau: v > 0 ? sau / v : 0,
      sl: tong(chon.map((m) => m.sl)), ma: chon.length, don: don.size,
      goiY: tong(theoNganh.map((m) => m.goiY)), maGoiY: theoNganh.filter((m) => m.goiY > 0).length,
      chuaDien: theoNganh.filter((m) => m.goiY > 0 && !m.daSua).length,
      chuaDu: theoNganh.filter((m) => m.daSua && m.chuaDu).length,
      vuot: theoNganh.filter((m) => m.vuot).length,
      thieu: theoNganh.filter((m) => m.thieu > 0).length,
    };
  }, [ds]);
  const canChuyen = (m) => m.deXuat > 0 || m.sl > 0;
  const demNhom = useMemo(() => {   // NEW - 3.159: số mã cần chuyển / số mã đang bán của từng nhóm
    const o = { '': { can: ds.filter(canChuyen).length, ma: ds.filter((m) => m.v > 0 || m.co > 0).length } };
    NHOM.forEach(([k]) => { o[k] = { can: ds.filter((m) => m.nh === k && canChuyen(m)).length, ma: ds.filter((m) => m.nh === k && (m.v > 0 || m.co > 0)).length }; });
    return o;
  }, [ds]);   // eslint-disable-line

  const LOC = [
    ['can', 'Cần chuyển', canChuyen],
    ['het', 'Hết hàng', (m) => m.tt === 'het'],
    ['gap', 'Sắp hết', (m) => m.tt === 'gap'],
    ['thap', 'Chưa đủ ngày', (m) => m.tt === 'thap'],
    ['thieu', 'Kho tổng thiếu', (m) => m.thieu > 0],
    ['ve', 'Đang về', (m) => m.ve > 0],
    ['sua', 'Đã nhập số', (m) => m.daSua],
    ['xem', 'Cần xem', (m) => m.vuot || (m.daSua && m.chuaDu)],
  ];
  const demLoc = useMemo(() => Object.fromEntries(LOC.map(([k, , f]) => [k, theoNganh.filter(f).length])), [theoNganh]);   // eslint-disable-line

  const hien = useMemo(() => {
    const f = LOC.find((x) => x[0] === loc)?.[2] || (() => true);
    const tu = boDau(q.trim());
    let a = theoNganh.filter((m) => f(m) && (!tu || boDau([m.r.m, m.r.t, m.r.b, m.r.sku].join(' ')).includes(tu)));
    const gt = { v: (m) => m.v, phu: (m) => (m.phuVe === Infinity ? 1e9 : m.phuVe), sl: (m) => m.sl, co: (m) => m.co + m.ve, ve: (m) => m.ve, xh: (m) => m.xh,
      kd: (m) => m.kd, de: (m) => m.goiY, sau: (m) => (m.sau === Infinity ? 1e9 : m.sau), gia: (m) => m.r.gs || m.r.g || 0 };
    if (sap.k && gt[sap.k]) a = [...a].sort((x, y) => (gt[sap.k](x) - gt[sap.k](y)) * sap.g);
    else a = [...a].sort((x, y) => (THU_TT[x.tt] ?? 9) - (THU_TT[y.tt] ?? 9) || y.v - x.v);
    return a;
  }, [theoNganh, loc, q, sap]);   // eslint-disable-line
  useEffect(() => { setSoHien(250); }, [loc, nhom, q]);

  // ===== Phiếu: dòng chuyển (mỗi mã × kho nguồn) =====
  const dongChuyen = useMemo(() => ds.filter((m) => m.sl > 0).flatMap((m) => m.chia.filter((c) => c.sl > 0).map((c) => ({
    barcode: m.r.b, sku: m.r.sku, ma: m.r.m, tu: c.k, den: m.den, sl: c.sl, de_xuat: m.goiY, ly_do: m.lyDo, n: m.r.n,
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
  // NEW - 3.159.4: như Đội Sale — "Tự động chia" chỉ điền ô CHƯA nhập (nhóm đang chọn), "Điền lại" ghi đè, "Xoá số" xoá nhóm đang chọn
  const tuDong = (ghiDe) => {
    const o = { ...sua }; let dien = 0, xoa = 0;
    ds.forEach((m) => {
      if (nhom && m.nh !== nhom) return;
      const b = m.r.b, co = o[b]?.sl != null;
      if (co && !ghiDe) return;
      if (m.goiY > 0) { o[b] = { ...(o[b] || {}), sl: m.goiY }; dien += 1; }
      else if (co) { const x = { ...o[b] }; delete x.sl; if (x.nguon) o[b] = x; else delete o[b]; xoa += 1; }
    });
    setSua(o); setLoc('can');
    const pv = nhom ? TEN_NHOM[nhom] : 'tất cả nhóm';
    baoToast(dien || xoa ? `Đã điền ${dien} mã (${pv})${xoa ? ` · bỏ ${xoa} mã không còn cần` : ''} — số anh đã gõ ${ghiDe ? 'đã được ghi đè' : 'giữ nguyên'}` : `Không có mã nào cần chuyển (${pv})`);
  };
  const xoaSo = () => {
    const o = {}; let xoa = 0;
    Object.entries(sua).forEach(([b, x]) => {
      const m = nhom ? ds.find((y) => y.r.b === b) : null;
      if (!nhom || m?.nh === nhom) { xoa += 1; return; }
      o[b] = x;
    });
    setSua(o); if (!Object.keys(o).length) setPhieuSua(null);
    baoToast(xoa ? `Đã xoá số ${xoa} mã${nhom ? ' (' + TEN_NHOM[nhom] + ')' : ''}` : 'Chưa có số nào để xoá');
  };

  const luuPhieu = async () => {
    if (!dongChuyen.length) { baoToast('Chưa có mã nào cần chuyển'); return null; }
    setDangLuu(true);
    const { data, error } = await sb.rpc('fn_ol_phieu_luu', { p_token: user.token, p: {
      id: phieuSua?.id || null, ghi_chu: `Sức bán ${P.sb} ngày · chia đủ ${P.cd} ngày · tỷ lệ ${P.tl}%`,
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
      onThanhCong: async () => { setSua({}); setPhieuSua(null); taiPhieu(); setTimeout(() => songRef.current && tai(true), 1500); },
      onDong: () => taiPhieu(),
    });
  };
  const taoDon = async () => {
    const ph = await luuPhieu();
    if (!ph) return;
    if (!odoo) { baoToast(`Đã lưu phiếu ${ph.ma_phieu} — tài khoản chưa được mở tạo đơn Odoo, xuất Excel để gửi kho`); return; }
    guiOdoo(ph, dongChuyen);
  };

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
        'Mã': m.r.m, 'Tên': m.r.t || '', 'Nhóm': TEN_NHOM[m.nh] || m.nh, 'Giá': m.r.gs || m.r.g || '',
        [`Bán ${m.n} ngày`]: m.banN, 'Bán/ngày': Math.round(m.v * 10) / 10, 'Online có thể bán': m.co, 'Đang về': m.ve,
        'Đủ bán trước (ngày)': m.phuVe === Infinity ? '' : Math.round(m.phuVe * 10) / 10, [`Mục tiêu (chia đủ ${P.cd} ngày × ${P.tl}%)`]: m.mucTieu,
        'Kho tổng': m.kho, 'Kho tổng khả dụng': m.kd, 'Gợi ý': m.goiY, 'Chuyển': m.sl, 'Còn lại kho tổng': m.con,
        'Sau chuyển (cái)': m.co + m.ve + (m.sl || 0), 'Sau chuyển (ngày)': m.sau === Infinity ? '' : Math.round(m.sau * 10) / 10, 'Kho đích': m.den, 'Lý do': m.lyDo,
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
  const laAdmin = user.vai_tro === 'ADMIN';
  const khacMd = p.sb != null || p.cd != null || p.tl != null || p.lamTron != null || p.giuNguon != null;
  const datMacDinh = async () => {
    const { data, error } = await sb.rpc('fn_ol_cau_hinh_luu', { p_token: user.token, p_cfg: { suc_ban: P.sb, chia_du: P.cd, ty_le: P.tl, lam_tron: P.lamTron, giu_nguon: P.giuNguon } });
    if (error) { baoToast('Chưa lưu: ' + error.message); return; }
    if (data?.cfg) setKq((k) => (k ? { ...k, cfg: data.cfg } : k));
    setP({ sb: null, cd: null, tl: null, lamTron: null, giuNguon: null });
    baoToast(`Đã đặt mặc định cho mọi người: sức bán ${P.sb} ngày · chia đủ ${P.cd} ngày · tỷ lệ ${P.tl}%`);
  };
  return (
    <div className="co-man">
      {/* NEW - 3.159.4: đầu màn 1 dòng — bỏ câu giới thiệu dài */}
      <div className="cmdbar co-dau">
        <div className="cmd-title"><h2>Chia hàng Online</h2></div>
        <div className="cmd-row">
          <span className="co-moc" title="Lúc lấy số liệu"><IcClock />
            Tồn online {gio(moc.ton_luc)} · Đơn {gio(moc.don_luc)} · Kho tổng {gio(moc.nguon_luc)}
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
        {(kq.cu || kq.treo?.length > 0 || kq.nhap_cho > 0) && (
          <div className="co-bao vang co-bao-gon">
            {kq.cu && <span><IcClock /> Số tính lúc {gio(kq.nho_luc)} — {lamMoi ? 'đang tính lại…' : 'bấm Tính lại để lấy số mới'}</span>}
            {kq.treo?.length > 0 && <span><IcAlert /> <b>{kq.treo.length} phiếu Odoo xuất &gt; 4 ngày</b> chưa nhập Nhanh ({fmtN(tong(kq.treo.map((x) => x.sl)))} cái) <button className="co-link" onClick={() => setTab('kho')}>Xem</button></span>}
            {kq.nhap_cho > 0 && <span><b>{kq.nhap_cho} phiếu nháp</b> chưa lên Odoo <button className="co-link" onClick={() => setTab('phieu')}>Xem</button></span>}
          </div>
        )}

        {/* ===== NEW - 3.159.4: hàng 1 — nhóm kho · Sức bán / Chia đủ / Tỷ lệ (gõ số, như Đội Sale) · ⚙ ===== */}
        <div className="co-cong">
          <div className="co-nhom">
            {NHOM.map(([k, t]) => (
              <button key={k} className={(nhom === k ? 'on ' : '') + (demNhom[k]?.can ? '' : 'rong')} onClick={() => setNhom(k)}
                title={`Lấy từ kho ${kq?.kho_nhom?.[k] || KHO_NHOM_MD[k]} · ${fmtN(demNhom[k]?.can)} mã cần chuyển / ${fmtN(demNhom[k]?.ma)} mã đang bán hoặc có tồn online`}>
                <span className="dai">{t}</span><span className="ngan">{TEN_NHOM[k]}</span>
                <small>{kq?.kho_nhom?.[k] || KHO_NHOM_MD[k]}</small>{demNhom[k]?.can ? <i>{fmtN(demNhom[k].can)}</i> : null}</button>
            ))}
            <button className={nhom === '' ? 'on' : ''} onClick={() => setNhom('')}>Tất cả{demNhom['']?.can ? <i>{fmtN(demNhom[''].can)}</i> : null}</button>
          </div>
          <div className="ch-ts2 co-ts">
            <label title="Sức bán = trung bình / ngày của N ngày gần nhất, tính tới hôm qua (1–28). Tính đủ cả ngày sale lớn">Sức bán<span><OSo gt={P.sb} min={1} max={28} onDat={(v) => setP((x) => ({ ...x, sb: v }))} />ngày</span></label>
            <label title="Chuyển cho online đủ bán bao nhiêu ngày — tính cả thời gian hàng về (1–90)">Chia đủ<span><OSo gt={P.cd} min={1} max={90} onDat={(v) => setP((x) => ({ ...x, cd: v }))} />ngày</span></label>
            <label title="100% = đúng nhu cầu, 120% = chia dư 20% (10–300)">Tỷ lệ<span><OSo gt={P.tl} min={10} max={300} onDat={(v) => setP((x) => ({ ...x, tl: v }))} />%</span></label>
          </div>
          <div className="co-ts-nut">
            <button className={'ch-tc-nut' + (moTs ? ' on' : '')} onClick={() => setMoTs((v) => !v)} title="Làm tròn · chừa hàng cho cửa hàng · đặt mặc định">⚙</button>
            {moTs && (
              <div className="co-ts-hop">
                <div><span>Làm tròn</span>
                  <div className="co-seg">{[1, 5, 10].map((k) => <button key={k} className={P.lamTron === k ? 'on' : ''} onClick={() => setP((x) => ({ ...x, lamTron: k }))}>{k === 1 ? 'Lẻ' : k}</button>)}</div>
                  <small>Mã bán từ 2 cái/ngày làm tròn lên theo bước này</small></div>
                <div><span>Chừa cho cửa hàng</span>
                  <div className="co-seg">{[0, 10, 20, 30].map((k) => <button key={k} className={P.giuNguon === k ? 'on' : ''} onClick={() => setP((x) => ({ ...x, giuNguon: k }))}>{k}%</button>)}</div>
                  <small>Không lấy hết kho tổng — chừa lại phần này</small></div>
                <div className="co-ts-cuoi">
                  {khacMd && <button className="co-link" onClick={() => setP({ sb: null, cd: null, tl: null, lamTron: null, giuNguon: null })}>Về mặc định</button>}
                  {laAdmin && <button className="btn btn-ghost" onClick={datMacDinh}>Đặt làm mặc định cho mọi người</button>}
                  <button className="co-link" onClick={() => setMoTs(false)}>Đóng</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ===== hàng 2 — lọc nhanh · tìm · Tự động chia / Điền lại / Xoá số ===== */}
        <div className="co-loc">
          <div className="co-chip">
            {LOC.map(([k, t]) => (
              <button key={k} className={(loc === k ? 'on ' : '') + ((k === 'het' || k === 'gap' || k === 'xem') && demLoc[k] ? 'nong' : '')} onClick={() => setLoc(loc === k ? '' : k)}>
                {t}<i>{fmtN(demLoc[k])}</i></button>
            ))}
          </div>
          <input className="co-tim" placeholder="Tìm mã, tên, màu…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="co-nut-chia">
            <button className="btn btn-ai" onClick={() => tuDong(false)}
              title={`Điền số gợi ý vào ô Chuyển CHƯA nhập — ${nhom ? 'chỉ nhóm ' + TEN_NHOM[nhom] : 'mọi nhóm'}; số đã gõ giữ nguyên`}>
              <IcSpark /> Tự động chia{nhom ? <em>{TEN_NHOM[nhom]}</em> : null}</button>
            <button className="btn btn-ghost" onClick={() => tuDong(true)} title={`Ghi đè ô Chuyển bằng số gợi ý (${nhom ? TEN_NHOM[nhom] : 'mọi nhóm'})`}>Điền lại</button>
            <button className="btn btn-ghost" onClick={xoaSo} title={`Xoá số ở ô Chuyển (${nhom ? TEN_NHOM[nhom] : 'mọi nhóm'})`}>Xoá số</button>
          </div>
        </div>

        {/* ===== Bảng — 8 cột, vừa 1 màn ===== */}
        <div className="card co-bang-khung">
          <table className="co-bang">
            <thead>
              <tr>
                <th className="l">Sản phẩm <span className="co-dem2">{fmtN(hien.length)}</span></th>
                <Th k="gia" title="Giá niêm yết · hàng sale: giá sale (đỏ)">Giá</Th>
                <Th k="v" title={`Bán ${P.sb} ngày gần nhất (tới hôm qua) · dòng nhỏ: trung bình / ngày`}>Bán {P.sb}n</Th>
                <Th k="co" title="Tồn online có thể bán (Nhanh) + đang về (phiếu Odoo đã duyệt, chưa nhập Nhanh) = tổng · dòng nhỏ: đủ bán bao nhiêu ngày">Tồn online</Th>
                <Th k="kd" title="Kho tổng của nhóm (BH / NV chính → TP, sale → SA, phụ kiện → PK05001): số còn khả dụng">Kho tổng</Th>
                <Th k="de" title={`Gợi ý = bán/ngày × ${P.cd} ngày × ${P.tl}% − tồn − đang về, làm tròn lên, không vượt kho tổng · bấm số để lấy`}>Gợi ý</Th>
                <Th k="sl" className="c-sl" title="Số chuyển — trống cho tới khi bấm Tự động chia, hoặc anh tự gõ / bấm số gợi ý">Chuyển</Th>
                <Th k="sau" title={`Sau chuyển = tồn + đang về + chuyển · dòng nhỏ: đủ bán bao nhiêu ngày (xanh: đủ ${P.cd} ngày · đỏ: chưa đủ)`}>Sau chuyển</Th>
              </tr>
            </thead>
            <tbody>
              {hien.slice(0, soHien).map((m) => {
                const r = m.r; const mo = moMa === r.b; const xem = m.vuot || (m.daSua && m.chuaDu);
                return [
                  <tr key={r.b} className={(m.tt ? 'co-r-' + m.tt : '') + (mo ? ' mo' : '') + (xem ? ' co-r-xem' : '')}>
                    <td className="l sp" onClick={() => setMoMa(mo ? null : r.b)}><div className="co-sp">
                      {r.h ? <img src={r.h} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} /> : <span className="anh" />}
                      <div>
                        <b><i className={'co-cham ' + (m.tt || 'khong')} title={m.tt ? TT[m.tt][0] : 'Không bán, không tồn'} />{r.m}
                          {r.moi && soNgay(r.moi, homNay) <= 45 ? <i className="co-moi">mới</i> : null}
                          {(!nhom || q.trim()) && <i className={'co-nhom-chip ' + m.nh}>{TEN_NHOM[m.nh]}</i>}</b>
                        <small>{(r.t || '').replace(/-[^-]*$/, '') || r.n3 || ''}</small>
                      </div>
                    </div></td>
                    <td className="so co-gia-o">{r.gs ? <><b className="sale">{kGia(r.gs)}</b><s>{kGia(r.g)}</s></> : <b>{kGia(r.g) || '—'}</b>}</td>
                    <td className="so"><b>{fmtN(m.banN)}</b>
                      {m.v > 0 ? <small>{fmt1(m.v)}/ngày{m.xh >= 1.25 ? <em className="len">↑</em> : m.xh <= 0.75 ? <em className="xuong">↓</em> : null}</small> : null}</td>
                    <td className="so co-ton" title={(r.vc || []).map((x) => `${x.p} · ${x.k} · ${x.sl} cái · ${x.tt} ${ngayNgan(x.n)}`).join('\n') || undefined}>
                      {m.ve ? <span className="co-ton-cong">{fmtN(m.co)}<b className="ve"> + {fmtN(m.ve)}</b><em> = </em><b>{fmtN(m.co + m.ve)}</b></span> : <b>{fmtN(m.co)}</b>}
                      {m.v > 0 ? <small className={m.tt === 'het' || m.tt === 'gap' ? 'thieu' : ''}>đủ {fmt1(m.phuVe)} ngày</small> : null}</td>
                    <td className={'so co-kho' + (m.vuot ? ' thieu' : '')} title={`${TEN_KHO[m.kho] || m.kho}: khả dụng ${fmtN(m.kd)}${P.giuNguon ? ` · chừa ${P.giuNguon}% → dùng được ${fmtN(m.kdDung)}` : ''}${r.ls?.[m.kho] ? ` · 60 ngày đã chuyển online ${fmtN(r.ls[m.kho])}` : ''}`}>
                      <b>{fmtN(m.kd)}</b>{m.vuot ? <small className="thieu">vượt kho</small> : null}</td>
                    <td className="so co-gy">{m.goiY > 0
                      ? <button className={m.daSua && m.sl === m.goiY ? 'dung' : ''} onClick={() => datSo(r.b, m.goiY)} title={m.lyDo}>{fmtN(m.goiY)}</button>
                      : <span className="nhat">·</span>}
                      {m.thieu > 0 ? <small className="thieu">kho thiếu {fmtN(m.thieu)}</small> : null}</td>
                    <td className="c-sl">
                      <input inputMode="numeric" value={sua[r.b]?.sl ?? ''} className={m.daSua ? 'sua' : ''}
                        onChange={(e) => datSo(r.b, e.target.value.replace(/[^\d]/g, ''))} />
                    </td>
                    <td className="so co-sau"><b className={m.daSua ? '' : 'nhat2'}>{fmtN(m.sauSl)}</b>
                      {m.v > 0 ? <small className={m.daSua ? (m.chuaDu ? 'thieu' : 'du') : ''}>đủ {fmt1(m.sau)} ngày</small> : null}</td>
                  </tr>,
                  mo && (
                    <tr key={r.b + '-ct'} className="co-ct"><td colSpan={8}>
                      <div className="co-ct-o">
                        <div><small>Cách tính</small><p>{m.lyDo || `Không bán trong ${m.n} ngày — không gợi ý chuyển.`}</p></div>
                        <div><small>Số liệu</small><p>Bán 7 ngày {fmtN(r.s7)} · 14 ngày {fmtN(r.s14)} · 28 ngày {fmtN(r.s28)}{r.hn ? ` · hôm nay ${fmtN(r.hn)}` : ''}<br />
                          Online: thực {fmtN(r.on)} · có thể bán {fmtN(r.cb)} · giữ cho đơn {fmtN(r.gi)}<br />
                          Lấy từ {m.kho} ({TEN_KHO[m.kho] || ''}) → {m.den} · hàng về mất ~{fmt1(m.L)} ngày{r.lc ? ` · lần chuyển gần nhất ${ngayNgan(r.lc)}` : ''}</p></div>
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

        {/* ===== NEW - 3.159.4: dòng cuối 1 hàng mỏng như Đội Sale — tổng · theo kho · đủ bán trước → sau · cảnh báo · nút ===== */}
        <div className="ch-tong3 co-tong3">
          <div className="ch-t3-tong" title="Tổng số đã nhập ở ô Chuyển (mọi nhóm) — đây là số sẽ tạo đơn">
            <b>{fmtN(tq.sl)}</b><span>cái chuyển<br />{fmtN(tq.ma)} mã</span>
          </div>
          <div className="ch-t3-nguon">
            {tongCap.map((c) => (
              <div key={c.tu + c.den} className="ch-t3-o" title={`${TEN_KHO[c.tu] || c.tu} → ${TEN_KHO[c.den] || c.den}`}>
                <span>{c.tu} → {c.den}</span><b>{fmtN(c.sl)}</b><em>{c.ma} mã</em></div>
            ))}
            {!tongCap.length && <div className="ch-t3-o"><em>{tq.maGoiY ? `Gợi ý ${fmtN(tq.goiY)} cái · ${fmtN(tq.maGoiY)} mã — bấm Tự động chia để điền` : 'Không có mã nào cần chuyển'}</em></div>}
          </div>
          <div className="ch-t3-nd co-t3-nd" title={`Online đủ bán (các mã có bán) trước → sau chuyển · mục tiêu ${P.cd} ngày`}>
            <span>Đủ bán</span><b>{fmt1(tq.phuTruoc)}</b><i>→</i>
            <b className={tq.sl ? (tq.phuSau >= P.cd ? 'du' : 'thieu') : ''}>{fmt1(tq.phuSau)}</b><span>ngày</span>
          </div>
          <div className="ch-t3-canh">
            {tq.vuot > 0 && <button className="do" onClick={() => { setNhom(''); setLoc('xem'); }}><IcAlert /> {tq.vuot} vượt kho</button>}
            {tq.chuaDu > 0 && <button onClick={() => { setNhom(''); setLoc('xem'); }}><IcAlert /> {tq.chuaDu} chưa đủ ngày</button>}
            {tq.sl > 0 && tq.chuaDien > 0 && <button onClick={() => { setNhom(''); setLoc('can'); }} title="Mã có gợi ý mà ô Chuyển còn trống">{tq.chuaDien} mã chưa điền</button>}
            {tq.sl > 0 && !tq.vuot && !tq.chuaDu && !tq.chuaDien && <span className="ok"><IcCheck /> Ổn</span>}
          </div>
          <div className="ch-t3-nut co-t3-nut">
            {phieuSua && <span className="co-dang-sua">Sửa {phieuSua.ma_phieu} <button className="co-link" onClick={() => { setPhieuSua(null); setSua({}); }}>Bỏ</button></span>}
            <button className="btn btn-ghost" disabled={!dongChuyen.length} onClick={() => xuatExcel()}><IcDown /> Excel</button>
            <button className="ch-xn3" disabled={!dongChuyen.length || dangLuu} onClick={taoDon}>
              <IcGuiLen /><span><b>{dangLuu ? 'Đang lưu…' : 'Tạo đơn Odoo'}</b><small>{tq.don} đơn · {fmtN(tq.sl)} cái</small></span></button>
          </div>
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
          baoToast(`Đã mở ${ph.ma_phieu} — sửa xong bấm Tạo đơn Odoo (phiếu cũ tự huỷ, thay bằng phiếu mới)`);
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
        <p className="co-mo">Mỗi mã có bán xếp theo số ngày đủ bán (có thể bán ÷ bán/ngày), so với ô Chia đủ {P.cd} ngày</p>
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
