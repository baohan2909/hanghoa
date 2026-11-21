import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { useApp } from '../App.jsx';
import { IcSpark, IcDown, IcAlert, IcCheck, IcBox, IcClock, IcGrid, IcMoRong, IcThuNho, IcLoc, IcGuiLen } from '../lib/icons.jsx';
import { useOdooCfg, odooTheoNguon } from '../lib/odoo.js';
import { AnhSP } from './DsBanChia.jsx';
import { KHO_TEN, TrangThaiLuu, baoLoiXacNhan, fmtN, gio, lsDel, lsGet, lsSet, ngayGio, so, tenNgan, tenPhieu, soFile, useNhap, xuatHaiFile, xuatPhieu, xuatPhieuThung,
  useHoiGhiChu, ghiChuMacDinh, nhoGhiChu, odooTuKq, odooTuPhieu } from './dsChung.jsx';
import { useLamTron, quyTac, lenMuc, xuongMuc, hoMau, kGia } from './dsLamTron.js';
import { useTuyChinh, sapTheo, HopTuyChinh } from './DsTuyChinh.jsx';
import DsDoiMoi from './DsDoiMoi.jsx';
import DsChiaMoi from './DsChiaMoi.jsx';
import KhoThung from './DsKhoThung.jsx';
import { tachSize, thuTuSize, useBoLoc, MenuBoLoc, HopBoLoc } from './DsBoLoc.jsx';
import DsBanChia from './DsBanChia.jsx';
import GoiYThung, { useGoiYThung, NutGoiY, mucDiem } from './DsGoiYThung.jsx';

// ============================================================================
// CHIA HÀNG ĐỘI SALE (bản làm lại v3.102.0; v3.104.0 Kho thùng; v3.112.0 nâng cấp) — 6 chế độ:
//   1. Chia từng đội    : việc hằng ngày. AI đề nghị làm tròn theo giá sale (dsLamTron.js), chỉ cho tab đang chọn,
//                          không vượt kho (thiếu -> ⇄ mã thay thế), cột "Tồn kho sale" trước "Chia thêm",
//                          Tùy chỉnh Bàn làm việc theo tài khoản (DsTuyChinh.jsx), ghi chú khi xuất file.
//   2. Kho thùng        : DsKhoThung.jsx
//   3. Chia hàng mới    : DsChiaMoi.jsx (giao diện như "Hàng mới" cửa hàng: đề nghị / thực chia, bảng đối soát)
//   4. Đội mới · chia trước : DsDoiMoi.jsx (cơ cấu giá, đội tham chiếu, điểm phù hợp, nháp)
//   5. Phiếu đã chia    : phiếu đang giữ tồn / đã xuất / huỷ, tải lại file (kèm ghi chú dòng 1).
//   6. Cân đối giữa đội : DsBanChia.jsx (bản cũ, giữ nguyên).
// Mọi số đang nhập TỰ LƯU (máy + máy chủ), lọc/tìm/đổi chế độ không mất số.
// SQL: 194_chia_hang_doi_sale.sql + 195_kho_tk05005_thung.sql (2 nguồn: SA và thùng TK05005 — 2 phiếu, 2 file) + 202_nang_cap_doi_sale.sql
// ============================================================================

// ============================================================================
// VỎ: chọn chế độ
// ============================================================================
export default function DsChiaHang({ dsDoi, ts }) {
  const [che, setChe] = useState(() => lsGet('che') || 'doi');
  useEffect(() => { lsSet('che', che); }, [che]);
  const CHE = [['doi', 'Chia từng đội'], ['thung', 'Kho thùng'], ['loat', 'Chia hàng mới'], ['doimoi', 'Đội mới · chia trước'], ['phieu', 'Phiếu đã chia'], ['can', 'Cân đối giữa đội']];
  return (
    <div className="ch">
      <div className="ch-che">
        {CHE.map(([k, t]) => <button key={k} className={che === k ? 'on' : ''} onClick={() => setChe(k)}>{t}</button>)}
      </div>
      {che === 'doi' && <ChiaDoi dsDoi={dsDoi} ts={ts} />}
      {che === 'thung' && <KhoThung dsDoi={dsDoi} />}
      {che === 'loat' && <DsChiaMoi dsDoi={dsDoi} ts={ts} />}
      {che === 'doimoi' && <DsDoiMoi dsDoi={dsDoi} ts={ts} />}
      {che === 'phieu' && <DsPhieu />}
      {che === 'can' && <DsBanChia dsDoi={dsDoi} ts={ts} />}
    </div>
  );
}

// ============================================================================
// 1. CHIA TỪNG ĐỘI
// ============================================================================
const LOC = [
  ['canh', 'Dòng cần xem', 'Dòng nền hồng: vượt kho, bán chạy mà vẫn thiếu, thùng + chia thêm vượt mục tiêu, đội đang dư mà vẫn nhận'],
  ['chay', 'Bán chạy', 'Top 15% mã bán nhiều nhất của đội'],
  ['thap', 'Bán tốt tồn thấp', 'Đang bán nhưng còn dưới ngưỡng sắp hết'],
  ['het', 'Đã hết', 'Có bán mà đội đang 0 hàng'],
  ['kho', 'Kho có hàng', 'Kho SA còn khả dụng (không tính kho thùng TK05005)'],
  ['thung', 'Có trong thùng', 'Mã nằm trong các thùng đã chọn'],
  ['nhap', 'Đã nhập', 'Đã nhập số chia thêm'],
  ['chua', 'Cần mà chưa chia', 'Gợi ý > 0 nhưng chưa nhập số'],
  ['thieu', 'Thiếu kho', 'Đề nghị bị giới hạn vì kho không đủ — bấm ⇄ ở cột Gợi ý để chọn mã thay thế'],
  ['lau', 'Tồn lâu', 'Không bán trong cửa sổ hoặc còn quá ngưỡng tồn lâu'],
  ['moi', 'Mã mới', 'Mã tạo trong 45 ngày'],
];
const SAP = [
  ['ban_g', 'Theo số lượng bán (từng SKU)'], ['ma_nhom', 'Theo mã sản phẩm (gộp size)'],
  ['ban_t', 'Bán ít → nhiều'], ['nd_t', 'Bán chạy mà tồn thấp'],
  ['ton_g', 'Tồn nhiều → ít'], ['ton_t', 'Tồn ít → nhiều'], ['kho_g', 'Kho còn nhiều'], ['ma', 'Mã A → Z'], ['nhom', 'Nhóm hàng'],
];
const NGUON_XEM = [['tat', 'Tất cả'], ['sa', 'Hàng Sale'], ['pk', 'Phụ kiện']];
const ROW_H = 46;
const ROW_H_GON = 38;

// Lọc nhanh (chip) — dùng chung cho lọc và đếm số dòng mỗi chip
function khopLoc(l, x, sapHet, tonLau) {
  switch (l) {
    case 'canh': return x.canh.length > 0;
    case 'chay': return x.chay;
    case 'thap': return x.v > 0 && (x.nd ?? 0) < sapHet;
    case 'het': return x.ban > 0 && x.co <= 0;
    case 'kho': return x.kd > 0;
    case 'thung': return x.th > 0;
    case 'nhap': return x.them > 0;
    case 'chua': return x.goiY > 0 && !x.them;
    case 'thieu': return x.thieu > 0;
    case 'lau': return x.ton > 0 && (x.ban === 0 || (x.nd ?? 0) > tonLau);
    case 'moi': return !!x.moi;
    default: return true;
  }
}
// Ô lọc dưới tiêu đề cột: giá trị đúng như đang hiện trên bảng
const r1 = (n) => Math.round(n * 10) / 10;
const COT_SO = {
  ban: (x) => x.ban, v: (x) => (x.v ? r1(x.v) : 0), ton: (x) => x.ton, ve: (x) => x.ve,
  nd: (x) => (x.nd == null ? null : r1(x.nd)), th: (x) => x.th, them: (x) => x.them, goiY: (x) => x.goiY,
  nhan: (x) => x.nhan, ndSau: (x) => (x.nhan && x.ndSau != null ? r1(x.ndSau) : null), khoCon: (x) => x.khoCon, kd: (x) => x.kd,
};
// Cột bảng (v3.112.0): "Tồn kho sale" đứng ngay trước "Chia thêm"; /ngày, Đủ ngày, Tổng nhận ẩn mặc định —
// bật lại ở Tùy chỉnh Bàn làm việc (chỉ ẩn khỏi màn hình, số liệu và cách tính giữ nguyên)
const COT_MAC_DINH = [
  { k: 'ban', ten: 'Bán (cửa sổ)', mo: 'Số bán trong cửa sổ sức bán', w: 70 },
  { k: 'v', ten: '/ngày', mo: 'Bán trung bình mỗi ngày', w: 62, an: true },
  { k: 'ton', ten: 'Tồn', mo: 'Tồn hiện tại của đội', w: 64 },
  { k: 've', ten: 'Đang về', mo: 'Đang về + đã giữ cho đội, chưa xuất', w: 70 },
  { k: 'nd', ten: 'Đủ (ngày)', mo: 'Số ngày đủ bán với hàng đang có', w: 70, an: true },
  { k: 'th', ten: 'Thùng', mo: 'Số trong các thùng đã chọn', w: 66 },
  { k: 'kd', ten: 'Tồn kho sale', mo: 'Kho SA (phụ kiện: PK05001) còn khả dụng; dòng nhỏ = còn lại sau khi chia', w: 96 },
  { k: 'them', ten: 'Chia thêm', mo: 'Số chia thêm từ kho — luôn hiện', w: 92, khoa: true },
  { k: 'goiY', ten: 'Gợi ý', mo: 'AI đề nghị: làm tròn theo giá sale, không vượt kho', w: 76 },
  { k: 'nhan', ten: 'Tổng nhận', mo: 'Thùng + chia thêm', w: 74, an: true },
  { k: 'ndSau', ten: 'Sau nhận', mo: 'Số ngày đủ bán sau khi nhận', w: 74 },
];
const LOC_MAC_DINH = LOC.map(([k, t, g]) => ({ k, ten: t, mo: g }));
const IcMat = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></svg>);
// "5" = bằng 5 · ">5" ">=5" "<3" "<=3" "!=0" · "5-10" khoảng · trả 'sai' nếu gõ không hiểu
function boLocSo(chuoi) {
  const t = String(chuoi || '').replace(/\s+/g, '').replace(',', '.');
  if (!t) return null;
  let m = t.match(/^(>=|<=|>|<|=|!=|≠)?(-?\d+(?:\.\d+)?)$/);
  if (m) {
    const op = m[1] || '=', n = +m[2];
    return (v) => v != null && (op === '>' ? v > n : op === '>=' ? v >= n : op === '<' ? v < n : op === '<=' ? v <= n
      : op === '!=' || op === '≠' ? v !== n : v === n);
  }
  m = t.match(/^(-?\d+(?:\.\d+)?)(?:-|\.\.|~)(-?\d+(?:\.\d+)?)$/);
  if (m) { const a = Math.min(+m[1], +m[2]), b = Math.max(+m[1], +m[2]); return (v) => v != null && v >= a && v <= b; }
  return 'sai';
}

function ChiaDoi({ dsDoi, ts }) {
  const { user, baoToast } = useApp();
  const nguoi = user?.ma_dang_nhap || '';
  const [doi, setDoi] = useState(() => lsGet('doi_dang') || null);
  const [cuaSo, setCuaSo] = useState(() => lsGet('cua_so') || ts.cua_so || 28);
  const [mucTieu, setMucTieu] = useState(() => lsGet('muc_tieu') || ts.muc_tieu || 21);
  const [heSo, setHeSo] = useState(() => lsGet('he_so') || 100);
  const [kq, setKq] = useState(null);
  const [dang, setDang] = useState(false);
  const [loc, setLoc] = useState(() => lsGet('loc') || []);
  const [sap, setSap] = useState(() => lsGet('sap') || 'ban_g');
  const [thungCt, setThungCt] = useState({});     // ma_thung -> {ct, da_giao, ...}
  const [gui, setGui] = useState(false);
  const [phieuMoi, setPhieuMoi] = useState(null);
  const [nhapDs, setNhapDs] = useState({});
  const [moKho, setMoKho] = useState(false);
  const [locCot, setLocCot] = useState(() => lsGet('loc_cot') || {});
  const [toan, setToan] = useState(() => !!lsGet('toan'));
  const [moGhi, setMoGhi] = useState(false);
  const [nguonXem, setNguonXem] = useState(() => lsGet('nguon_xem') || 'tat');
  const [boLocDung, setBoLocDung] = useState(() => lsGet('bo_loc_dung') || null);
  const [suaBoLoc, setSuaBoLoc] = useState(null);   // null | 'moi' | {bộ lọc}
  const [dsBoLoc, taiBoLoc] = useBoLoc(nguoi);
  const [moDsThung, setMoDsThung] = useState(false);
  const [moGy, setMoGy] = useState(() => !!lsGet('mo_gy'));   // trung tâm gợi ý thùng (ngăn kéo phải)
  useEffect(() => { lsSet('mo_gy', moGy); }, [moGy]);
  // v3.112.0: tùy chỉnh theo tài khoản · làm tròn theo giá · ghi chú khi xuất · mã thay thế khi thiếu kho
  const laAdmin = user?.vai_tro === 'ADMIN';
  const [tc, datTc, mayChu] = useTuyChinh(nguoi, 'ban_lam_viec');
  const [moTc, setMoTc] = useState(false);
  const cotDs = useMemo(() => sapTheo(COT_MAC_DINH, tc.cot), [tc.cot]);
  const cotHien = useMemo(() => cotDs.filter((c) => c.hien), [cotDs]);
  const locDs = useMemo(() => sapTheo(LOC_MAC_DINH, tc.loc), [tc.loc]);
  const cfgLT = useLamTron();
  const [hoiGhiChu, hopGhiChu, chonOdoo] = useHoiGhiChu();
  const [thayThe, setThayThe] = useState(null);   // barcode đang xem mã thay thế
  // THU GỌN đầu bàn: gộp đội + số liệu + tham số + thùng vào 1 hàng, dòng bảng thấp hơn -> thêm chỗ chia
  const [gon, setGon] = useState(() => lsGet('gon') ?? true);
  useEffect(() => { lsSet('gon', gon); }, [gon]);
  const rowH = gon ? ROW_H_GON : ROW_H;
  useEffect(() => { lsSet('nguon_xem', nguonXem); lsSet('bo_loc_dung', boLocDung); }, [nguonXem, boLocDung]);
  const sapHet = ts.sap_het || 7, tonLau = ts.ton_lau || 60;

  useEffect(() => { lsSet('doi_dang', doi); }, [doi]);
  useEffect(() => { lsSet('cua_so', cuaSo); lsSet('muc_tieu', mucTieu); lsSet('he_so', heSo); }, [cuaSo, mucTieu, heSo]);
  useEffect(() => { lsSet('loc', loc); lsSet('sap', sap); lsSet('loc_cot', locCot); }, [loc, sap, locCot]);
  useEffect(() => { lsSet('toan', toan); }, [toan]);

  // ---------- bàn chia toàn màn hình ----------
  const batToan = (v) => {
    setToan(v);
    try {
      if (v && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
      if (!v && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    } catch { /* trình duyệt không hỗ trợ: vẫn phủ kín cửa sổ */ }
  };
  useEffect(() => {
    if (!toan) return undefined;
    document.body.classList.add('ch-khoa-cuon');
    const f = (e) => { if (e.key === 'Escape' && !moKho && !document.fullscreenElement) setToan(false); };
    window.addEventListener('keydown', f);
    return () => { document.body.classList.remove('ch-khoa-cuon'); window.removeEventListener('keydown', f); };
  }, [toan, moKho]);

  const khoa = 'doi:' + (doi || '-');
  const [nhap, datNhap, ttLuu, xoaNhap] = useNhap(nguoi, khoa, { thung: [], sua: {} });
  const sua = nhap.sua || {};
  const thung = nhap.thung || [];
  // gợi ý thùng: tự phân tích khi đổi đội / tham số / nháp (SQL 200)
  const gy = useGoiYThung({ doi, cuaSo, mucTieu, heSo, sapHet: ts.sap_het || 7, nguoi, thung, sua, mo: moGy });
  const diemThung = gy.kq?.diem || {};

  // danh sách nháp (đánh dấu đội đang dở)
  const taiNhapDs = () => sb.rpc('fn_ds_nhap_lay', { p_nguoi: nguoi }).then(({ data }) => setNhapDs(data || {}));
  useEffect(() => { taiNhapDs(); }, [doi]);   // eslint-disable-line

  const tai = async () => {
    if (!doi) return;
    setDang(true);
    const { data, error } = await sb.rpc('fn_ds_chia_doi', { p_ma_ch: doi, p_cua_so: cuaSo });
    setDang(false);
    if (error) { baoToast('Lỗi tải: ' + error.message); return; }
    setKq(data);
  };
  useEffect(() => { setKq(null); setPhieuMoi(null); tai(); }, [doi, cuaSo]);   // eslint-disable-line

  // chi tiết các thùng đã chọn
  useEffect(() => {
    const thieu = thung.filter((t) => !thungCt[t]);
    if (!thieu.length) return;
    sb.rpc('fn_ds_thung_lay', { p_ma: thieu }).then(({ data }) => {
      setThungCt((m) => { const n = { ...m }; (data || []).forEach((t) => { n[t.ma_thung] = t; }); thieu.forEach((t) => { if (!n[t]) n[t] = { ma_thung: t, khong_co: true, ct: [] }; }); return n; });
    });
  }, [thung.join('|')]);   // eslint-disable-line

  // số trong thùng theo barcode (chỉ thùng hợp lệ, chưa giao cho phiếu khác)
  const trongThung = useMemo(() => {
    const m = {}, khongMa = [], ma = new Set(), rut = [];
    let tong = 0, soThung = 0;
    thung.forEach((t) => {
      const x = thungCt[t];
      if (!x || x.khong_co || x.da_giao || x.kiem) return;
      soThung++;
      x.ct.forEach((c) => {
        if (c.th) { rut.push({ t, m: c.m, s: c.s }); return; }   // mã thu hồi đội sale: rút khỏi thùng khi giao
        tong += c.s; ma.add(c.m); if (c.b) m[c.b] = (m[c.b] || 0) + c.s; else khongMa.push(c.m);
      });
    });
    return { m, khongMa, tong, soThung, soMa: ma.size, rut };
  }, [thung, thungCt]);

  // dòng: [barcode, mtc, n1, n3, img, ban, ban7, banCuoi, ton, ve, kd1, kd2, moi, kd_phu_kien, la_phu_kien, gia_sale, nguon_gia, ban_mang]
  // Phụ kiện: chia từ kho PK05001 (tồn khả dụng riêng), hàng Sale: SA05001 + SA05002
  const dong = useMemo(() => {
    const rows = (kq?.rows || []).map((r) => {
      const pk = !!r[14];
      const ban = r[5], v = ban / cuaSo, co = r[8] + r[9], kd = pk ? (r[13] || 0) : r[10] + r[11];
      const th = trongThung.m[r[0]] || 0;
      const muc = Math.ceil(v * mucTieu * heSo / 100);
      // Hàng thùng lấy từ TK05005 -> KHÔNG trừ kho SA. Gợi ý chia thêm chỉ giới hạn bởi kho SA.
      // v3.112.0: nhu cầu -> làm tròn LÊN mức hợp lệ theo giá sale (lưỡi bội 5, túi ráp S/M bước 200) -> không vượt kho
      const gia = r[15] ?? null;
      const qt = quyTac({ pk, n3: r[3], mtc: r[1], gia }, cfgLT);
      const thuHoi = !!r[18];   // 204: mã thu hồi đội sale — AI không đề nghị
      let can = ban > 0 && !thuHoi ? Math.max(0, muc - co - th) : 0;
      let tuiMacDinh = false;
      if (qt.loai === 'tui') {
        if (!qt.cho) can = 0;
        else if (ban <= 0 && co < qt.macDinh) { can = qt.macDinh; tuiMacDinh = true; }
      }
      const len = lenMuc(can, qt);
      const goiY = Math.min(len, xuongMuc(kd, qt));
      const thieu = len - goiY;
      const them = sua[r[0]] ?? 0;
      const nhan = th + them;
      const nd = v > 0 ? co / v : null;
      const ndSau = v > 0 ? (co + nhan) / v : null;
      const khoCon = kd - them;   // chỉ phần chia thêm dùng kho (SA hoặc PK05001) — thùng không trừ
      const [nhomMa, size] = tachSize(r[1]);
      return { bc: r[0], mtc: r[1], n1: r[2], n3: r[3], img: r[4], ban, ban7: r[6], banCuoi: r[7], ton: r[8], ve: r[9], kd, v, co, nd, th, muc, goiY, them, nhan, ndSau, khoCon, moi: r[12],
        pk, nhomMa, size, gia, nguonGia: r[16] || null, banMang: r[17] || 0, qt, can, len, thieu, tuiMacDinh, hm: pk ? '' : hoMau(r[1]), thuHoi,
        lechMuc: them > 0 && qt.buoc > 1 && lenMuc(them, qt) !== them };
    });
    // tổng bán theo nhóm mã (mẫu + màu, bỏ size) — cho chế độ "Theo mã sản phẩm"
    const banNhom = {}, soNhom = {};
    rows.forEach((x) => { banNhom[x.nhomMa] = (banNhom[x.nhomMa] || 0) + x.ban; soNhom[x.nhomMa] = (soNhom[x.nhomMa] || 0) + 1; });
    rows.forEach((x) => { x.banNhom = banNhom[x.nhomMa]; x.soNhom = soNhom[x.nhomMa]; });
    const sorted = [...rows].sort((a, b) => b.ban - a.ban);
    const nguongChay = sorted.length ? sorted[Math.max(0, Math.floor(sorted.filter((x) => x.ban > 0).length * 0.15) - 1)]?.ban || 1 : 1;
    rows.forEach((x) => {
      x.chay = x.ban > 0 && x.ban >= nguongChay;
      const c = [];
      if (x.khoCon < 0) c.push(`Chia thêm vượt ${x.pk ? 'kho phụ kiện PK05001' : 'kho SA'} khả dụng ${-x.khoCon} cái (kho còn ${x.kd})`);
      if (x.v > 0 && (x.ndSau ?? 0) < sapHet && x.chay) c.push(`Bán chạy mà sau chia chỉ đủ ${(x.ndSau ?? 0).toFixed(1)} ngày`);
      if (x.th > 0 && x.them > 0 && x.co + x.nhan > x.muc + Math.max(2, Math.ceil(x.v * 3))) c.push(`Đã có ${x.th} trong thùng mà còn chia thêm ${x.them} — vượt mục tiêu ${x.muc}`);
      if (x.nhan > 0 && x.nd != null && x.nd > tonLau) c.push(`Đội đang dư (đủ ${Math.round(x.nd)} ngày) mà vẫn nhận thêm`);
      if (x.nhan > 0 && x.ban === 0 && x.ton > 0 && !x.pk) c.push(`Đội không bán mã này ${cuaSo} ngày, vẫn còn ${x.ton}`);
      if (x.them > 0 && x.qt.loai === 'tui' && !x.qt.cho) c.push(x.qt.nhan);
      if (x.them > 0 && x.thuHoi) c.push('Mã THU HỒI đội sale (Hàng đặc biệt) — không nên chia');
      x.canh = c;
    });
    return rows;
  }, [kq, sua, trongThung, cuaSo, mucTieu, heSo, sapHet, tonLau, cfgLT]);

  // ô lọc theo cột (hàng trống dưới tiêu đề)
  const locCotFn = useMemo(() => {
    const fs = [], sai = {};
    const dangHien = new Set(['sp', ...cotHien.map((c) => c.k)]);
    Object.entries(locCot).forEach(([k, chuoi]) => {
      if (!chuoi || !String(chuoi).trim() || !dangHien.has(k)) return;   // cột đang ẩn: không lọc ngầm
      if (k === 'sp') {
        const tu = String(chuoi).toLowerCase().split(/\s+/).filter(Boolean);
        fs.push((x) => { const h = `${x.mtc} ${x.n3 || ''} ${x.n1 || ''} ${x.bc}`.toLowerCase(); return tu.every((w) => h.includes(w)); });
        return;
      }
      const fn = boLocSo(chuoi);
      if (fn === 'sai') { sai[k] = true; return; }
      if (fn && COT_SO[k]) fs.push((x) => fn(COT_SO[k](x)));
    });
    return { fs, sai, co: fs.length > 0 || Object.keys(sai).length > 0 };
  }, [locCot, cotHien]);
  const demLoc = useMemo(() => {
    const d = {};
    LOC.forEach(([k]) => { d[k] = 0; });
    dong.forEach((x) => LOC.forEach(([k]) => { if (khopLoc(k, x, sapHet, tonLau)) d[k]++; }));
    return d;
  }, [dong, sapHet, tonLau]);

  const boLoc = dsBoLoc.find((b) => b.id === boLocDung) || null;
  const boLocSet = useMemo(() => (boLoc ? new Set(boLoc.ma.flatMap((x) => [x.b, x.m])) : null), [boLoc]);
  const demNguon = useMemo(() => ({ tat: dong.length, sa: dong.filter((x) => !x.pk).length, pk: dong.filter((x) => x.pk).length }), [dong]);

  const hien = useMemo(() => {
    let v = dong.filter((x) => (nguonXem === 'tat' || (nguonXem === 'pk') === x.pk)
      && (!boLocSet || boLocSet.has(x.bc) || boLocSet.has(x.mtc))
      && loc.every((l) => khopLoc(l, x, sapHet, tonLau)) && locCotFn.fs.every((fn) => fn(x)));
    const f = {
      ban_g: (a, b) => b.ban - a.ban || a.mtc.localeCompare(b.mtc), ban_t: (a, b) => a.ban - b.ban || a.mtc.localeCompare(b.mtc),
      // gộp size: nhóm bán nhiều (cộng mọi size) đứng trước, các size nằm liền nhau theo S, M, L, XL…
      ma_nhom: (a, b) => b.banNhom - a.banNhom || a.nhomMa.localeCompare(b.nhomMa) || thuTuSize(a.size) - thuTuSize(b.size) || a.mtc.localeCompare(b.mtc),
      nd_t: (a, b) => ((a.v > 0 ? a.nd : 1e9) - (b.v > 0 ? b.nd : 1e9)) || b.ban - a.ban,
      ton_g: (a, b) => b.co - a.co, ton_t: (a, b) => a.co - b.co, kho_g: (a, b) => b.kd - a.kd,
      ma: (a, b) => a.mtc.localeCompare(b.mtc), nhom: (a, b) => (a.n3 || '').localeCompare(b.n3 || '') || b.ban - a.ban,
    }[sap];
    return v.sort(f);
  }, [dong, loc, locCotFn, sap, sapHet, tonLau, nguonXem, boLocSet]);

  const tong = useMemo(() => {
    const t = { ma: 0, maSa: 0, maPk: 0, th: 0, them: 0, sa: 0, pk: 0, nhan: 0, vuot: 0, vuotPk: 0, canh: 0, banNgay: 0, co: 0, maBan: 0 };
    dong.forEach((x) => {
      if (x.them > 0 || x.th > 0) t.ma++;
      if (x.them > 0) { if (x.pk) { t.maPk++; t.pk += x.them; } else { t.maSa++; t.sa += x.them; } }
      if (x.khoCon < 0) { t.vuot++; if (x.pk) t.vuotPk++; } if (x.canh.length) t.canh++;
      if (!x.pk) { t.banNgay += x.v; t.co += Math.max(0, x.co); if (x.ban > 0) t.maBan++; }   // đủ ngày: chỉ tính hàng bán (không tính túi, lưỡi…)
    });
    t.th = trongThung.tong;   // cả mã chỉ có ở danh mục / chưa nhận diện (không có dòng trong bảng) vẫn tính
    t.them = t.sa + t.pk;
    t.nhan = t.th + t.them;
    t.ndTruoc = t.banNgay > 0 ? t.co / t.banNgay : null;
    t.ndSau = t.banNgay > 0 ? (t.co + t.th + t.sa) / t.banNgay : null;
    t.soPhieu = (t.sa > 0) + (t.pk > 0) + (t.th > 0);
    return t;
  }, [dong, trongThung]);

  const datSo = (bc, v) => datNhap((d) => ({ ...d, sua: { ...(d.sua || {}), [bc]: so(v) } }));
  // AI đề nghị CHỈ cho tab đang chọn (Tất cả / Hàng Sale / Phụ kiện) — tab khác giữ nguyên số
  const trongTab = (x) => nguonXem === 'tat' || (nguonXem === 'pk') === x.pk;
  const tenTab = (NGUON_XEM.find(([k]) => k === nguonXem) || [])[1] || 'Tất cả';
  const tuDong = (deCaSoTay) => {
    const ds = dong.filter(trongTab);
    const dien = ds.filter((x) => (deCaSoTay ? true : !(x.bc in sua) && x.goiY > 0));
    const thieu = ds.filter((x) => x.thieu > 0).length;
    datNhap((d) => {
      const s = { ...(d.sua || {}) };
      ds.forEach((x) => {
        if (deCaSoTay) { if (x.goiY > 0) s[x.bc] = x.goiY; else delete s[x.bc]; }
        else if (!(x.bc in s) && x.goiY > 0) s[x.bc] = x.goiY;
      });
      return { ...d, sua: s };
    });
    baoToast(`${deCaSoTay ? 'Đã điền lại' : 'Đã điền đề nghị'} tab ${tenTab}: ${fmtN(dien.filter((x) => x.goiY > 0).length)} mã`
      + `${deCaSoTay ? '' : ' chưa nhập'} — ${nguonXem === 'tat' ? 'mọi tab' : 'tab khác giữ nguyên'}`
      + (thieu ? ` · ${thieu} mã thiếu kho (lọc “Thiếu kho” → ⇄ chọn mã thay thế)` : ''));
  };
  const xoaSo = () => {
    datNhap((d) => {
      if (nguonXem === 'tat') return { ...d, sua: {} };
      const s = { ...(d.sua || {}) };
      dong.forEach((x) => { if (trongTab(x)) delete s[x.bc]; });
      return { ...d, sua: s };
    });
    baoToast(nguonXem === 'tat' ? 'Đã xoá số chia thêm (giữ thùng)' : `Đã xoá số chia thêm tab ${tenTab} — tab khác giữ nguyên`);
  };
  // Bộ lọc của tôi (★): tổ hợp lọc đã lưu ở Tùy chỉnh
  const locHienTai = { loc, locCot: Object.fromEntries(Object.entries(locCot).filter(([, v]) => String(v || '').trim())), nguonXem, sap };
  const khoaMau = (m) => JSON.stringify([[...(m.loc || [])].sort(), Object.entries(m.locCot || {}).filter(([, v]) => String(v || '').trim()).sort(), m.nguonXem || 'tat']);
  const mauDang = (tc.mau || []).find((m) => khoaMau(m) === khoaMau(locHienTai));
  const dungMau = (m) => {
    if (mauDang?.id === m.id) { setLoc([]); setLocCot({}); return; }
    setLoc(m.loc || []); setLocCot(m.locCot || {}); if (m.nguonXem) setNguonXem(m.nguonXem); if (m.sap) setSap(m.sap);
  };
  const moTaLoc = [...loc.map((k) => LOC_MAC_DINH.find((d) => d.k === k)?.ten || k), nguonXem !== 'tat' ? tenTab : null].filter(Boolean).join(' + ');

  // ---------- thùng ----------
  const [tq, setTq] = useState('');
  const [goiYThung, setGoiYThung] = useState([]);
  useEffect(() => {
    const t = tq.trim();
    if (t.length < 2) { setGoiYThung([]); return; }
    const h = setTimeout(() => sb.rpc('fn_ds_thung_tim', { p_q: t, p_gioi_han: 12 }).then(({ data }) => setGoiYThung(data || [])), 180);
    return () => clearTimeout(h);
  }, [tq]);
  const themThung = (ma) => {
    const m = (ma || '').trim();
    if (!m) return;
    if (thung.includes(m)) { baoToast('Thùng ' + m + ' đã có trong danh sách'); return; }
    datNhap((d) => ({ ...d, thung: [...(d.thung || []), m] }));
    setTq(''); setGoiYThung([]);
    const d = diemThung[m];
    if (d != null && mucDiem(d, gy.kq?.cfg) === 'it') baoToast(`Đã thêm ${m} — lưu ý: thùng ít phù hợp với ${tenNgan(gy.kq?.ten)} (${d} điểm). Mở Gợi ý thùng để xem lý do.`);
  };
  // thùng vừa tải ruột có mã thu hồi -> cảnh báo 1 lần / thùng
  const daBaoRut = useRef(new Set());
  useEffect(() => {
    thung.forEach((t) => {
      const x = thungCt[t];
      if (!x || x.khong_co || x.da_giao || daBaoRut.current.has(t)) return;
      const r = (x.ct || []).filter((c) => c.th);
      daBaoRut.current.add(t);
      if (r.length) baoToast(`⚠ Thùng ${t} có ${r.length} mã THU HỒI đội sale (${r.reduce((a, c) => a + c.s, 0)} cái): ${r.map((c) => `${c.m} ×${c.s}`).join(', ')} — vẫn cấp cả thùng nhưng RÚT các mã này ra, ghi vào ghi chú phiếu thùng`);
    });
  }, [thung, thungCt]);   // eslint-disable-line
  const boThung = (ma) => datNhap((d) => ({ ...d, thung: (d.thung || []).filter((x) => x !== ma) }));

  // ---------- xác nhận ----------
  const xacNhan = async () => {
    // Nguồn 1: chia thêm từ kho SA (kiểm tồn SA). Nguồn 2: thùng (TK05005, không kiểm SA) -> server tách 2 phiếu
    // 3 nguồn: SA (sl_sa) · Phụ kiện PK05001 (sl_pk) · Thùng TK05005 (thung) -> server tách tối đa 3 phiếu
    const dongGui = dong.filter((x) => x.them > 0).map((x) => (x.pk ? { ma_ch: doi, barcode: x.bc, sl_pk: x.them } : { ma_ch: doi, barcode: x.bc, sl_sa: x.them }));
    const thungHopLe = thung.filter((t) => thungCt[t] && !thungCt[t].khong_co && !thungCt[t].da_giao && !thungCt[t].kiem);
    if (!dongGui.length && !thungHopLe.length) { baoToast('Chưa có số nào'); return; }
    if (tong.vuot) { baoToast(`Còn ${tong.vuot} mã chia thêm vượt kho (SA / phụ kiện) — sửa trước khi xác nhận (lọc theo dòng hồng)`); return; }
    const ghiChu = await hoiGhiChu({ odoo: true, macDinh: ghiChuMacDinh(doi, tenDoi), tieuDe: `Ghi chú file xuất — ${tenNgan(tenDoi)}`,
      nutXong: `Xác nhận & xuất ${tong.soPhieu} file`,
      phu: <>{fmtN(tong.nhan)} cái · {[tong.sa > 0 && 'Sale', tong.pk > 0 && 'Phụ kiện', tong.th > 0 && 'Thùng'].filter(Boolean).join(' + ')}
        {trongThung.rut.length > 0 && <span className="gc-rut">⚠ Rút khỏi thùng (thu hồi đội sale) — tự ghi vào ghi chú phiếu thùng: {Object.entries(trongThung.rut.reduce((g, r) => { (g[r.t] = g[r.t] || []).push(`${r.m} ×${r.s}`); return g; }, {})).map(([t, ds]) => `${t}: ${ds.join(', ')}`).join(' ; ')}</span>}</> });
    if (ghiChu === null) return;
    nhoGhiChu(doi, ghiChu);
    setGui(true);
    const { data, error } = await sb.rpc('fn_ds_xac_nhan', { p: { loai: 'doi', nguoi, khoa_nhap: khoa, ghi_chu: ghiChu || null, dong: dongGui, thung: thungHopLe.map((t) => ({ ma_thung: t, ma_ch: doi })) } });
    setGui(false);
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    if (!data?.ok) { baoLoiXacNhan(data, baoToast); tai(); return; }
    try { await xuatHaiFile(data, ghiChu); } catch (e) { baoToast('Đã xác nhận nhưng xuất file lỗi — tải lại ở tab Phiếu đã chia'); }
    if (chonOdoo.current) odooTuKq(data, ghiChu).catch((e) => baoToast('Đã xác nhận, chưa mở được hộp Odoo: ' + (e?.message || e) + ' — gửi lại ở Phiếu đã chia'));
    lsDel(khoa); await xoaNhap();
    setThungCt({});
    setPhieuMoi({ ...data, doi, sl: tong.nhan, ma: tong.ma, sa: tong.sa, pk: tong.pk, th: tong.th });
    baoToast(`Đã xác nhận ${tenPhieu(data)}: ${fmtN(tong.nhan)} cái — ${soFile(data)} file`);
    tai(); taiNhapDs();
  };

  // ---------- danh sách đội ----------
  const doiSx = useMemo(() => [...dsDoi].sort((a, b) => a.ma_ch.localeCompare(b.ma_ch)), [dsDoi]);
  const doiTiep = (buoc = 1) => {
    const i = doiSx.findIndex((d) => d.ma_ch === doi);
    const n = doiSx[(i + buoc + doiSx.length) % doiSx.length];
    if (n) setDoi(n.ma_ch);
  };
  const doiInfo = dsDoi.find((d) => d.ma_ch === doi);

  // ---------- bảng ảo hoá ----------
  const khung = useRef(null);
  const [cuon, setCuon] = useState(0);
  const [cao, setCao] = useState(600);
  useEffect(() => {
    const el = khung.current; if (!el) return;
    const ro = new ResizeObserver(() => setCao(el.clientHeight));
    ro.observe(el); return () => ro.disconnect();
  }, [kq]);
  const dau = Math.max(0, Math.floor(cuon / rowH) - 8);
  const cuoi = Math.min(hien.length, Math.ceil((cuon + cao) / rowH) + 8);
  const diDen = (i) => {
    if (i < 0 || i >= hien.length) return;
    const el = khung.current;
    const top = i * rowH, vung = el.clientHeight - rowH * 2 - 30;   // trừ 2 hàng tiêu đề + ô lọc dính trên
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top > el.scrollTop + vung) el.scrollTop = top - vung;
    setTimeout(() => { const o = el.querySelector(`input[data-r="${i}"]`); if (o) { o.focus(); o.select(); } }, 40);
  };

  // ---------- ô theo cột (thứ tự / ẩn hiện theo Tùy chỉnh) ----------
  const giaiThich = (x) => {
    if (x.thuHoi) return 'Mã thu hồi đội sale (Hàng đặc biệt) — không đề nghị chia';
    if (x.qt.loai === 'tui' && !x.qt.cho) return x.qt.nhan;
    const l = [];
    if (x.ban > 0) l.push(`Nhu cầu ${x.v.toFixed(1)}/ngày × ${mucTieu} ngày × ${heSo}% = ${x.muc}`, `− đang có ${x.co}${x.th ? ` − thùng ${x.th}` : ''} → cần ${x.can}`);
    else if (x.tuiMacDinh) l.push(`Chưa có số bán túi — dùng mặc định ${x.can} (đội đang có ${x.co})`);
    else l.push(`Không bán trong ${cuaSo} ngày — không đề nghị`);
    if (x.can > 0) l.push(`Làm tròn lên (${x.qt.nhan}) → ${x.len}`);
    if (x.thieu > 0) l.push(`Kho chỉ còn ${fmtN(x.kd)} → đề nghị ${x.goiY}, thiếu ${x.thieu}${x.pk ? '' : ' — bấm ⇄ chọn mã thay thế'}`);
    else if (x.goiY) l.push(`Bấm để lấy ${x.goiY} (hoặc phím Space trong ô Chia thêm)`);
    return l.join('\n');
  };
  const oCot = (k, x, i) => {
    switch (k) {
      case 'ban': return <td key={k} className={x.ban ? 'dam' : 'mo'}>{x.ban || '·'}</td>;
      case 'v': return <td key={k} className={x.v ? 'phu' : 'mo'}>{x.v ? x.v.toFixed(1) : '·'}</td>;
      case 'ton': return <td key={k} className={x.ton ? '' : 'mo'}>{x.ton || '·'}</td>;
      case 've': return <td key={k} className={x.ve ? 've' : 'mo'}>{x.ve ? (x.ve > 0 ? '+' + x.ve : x.ve) : '·'}</td>;
      case 'nd': return <td key={k}><Ngay n={x.nd} sapHet={sapHet} mucTieu={mucTieu} tonLau={tonLau} /></td>;
      case 'th': return <td key={k} className="c-thung">{x.th || <span className="mo">·</span>}</td>;
      case 'kd': return (
        <td key={k} className={'c-kd ' + (x.khoCon < 0 ? 'vuot' : x.kd ? '' : 'mo')}
          title={(x.canh.length ? x.canh.join('\n') + '\n' : '') + `${x.pk ? 'Kho phụ kiện PK05001' : 'Kho SA'} khả dụng ${fmtN(x.kd)}${x.them ? ` − chia ${x.them} = còn ${fmtN(x.khoCon)}` : ''}`}>
          {x.canh.length > 0 && <IcAlert className="ch-i-canh" />}
          <span className="kd-so"><b>{x.kd ? fmtN(x.kd) : '·'}</b>{x.them > 0 && <small>còn {fmtN(x.khoCon)}</small>}</span>
        </td>);
      case 'them': return (
        <td key={k} className="c-them">
          <input type="number" inputMode="numeric" min={0} data-r={i} value={x.them || ''} placeholder="·"
            className={x.lechMuc ? 'lech-muc' : ''} title={x.lechMuc ? `${x.them} chưa đúng mức làm tròn (${x.qt.nhan}) — vẫn xuất được nếu anh muốn` : ''}
            onChange={(e) => datSo(x.bc, e.target.value)}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); diDen(i + (e.shiftKey && e.key === 'Enter' ? -1 : 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); diDen(i - 1); }
              else if (e.key === ' ' || e.key === '+') { e.preventDefault(); datSo(x.bc, x.goiY); }
            }} />
        </td>);
      case 'goiY': return (
        <td key={k} className={(x.goiY ? 'gy' : 'mo') + (x.thieu > 0 ? ' thieu' : '')} onClick={() => x.goiY && datSo(x.bc, x.goiY)} title={giaiThich(x)}>
          {x.goiY || '·'}
          {x.thieu > 0 && !x.pk && <button className="ch-tt-nut" onClick={(e) => { e.stopPropagation(); setThayThe(x.bc); }} title={`Thiếu ${x.thieu} — xem mã thay thế`}>⇄</button>}
          {x.thieu > 0 && x.pk && <i className="ch-thieu-pk" title={giaiThich(x)}>−{x.thieu}</i>}
        </td>);
      case 'nhan': return <td key={k} className={x.nhan ? 'dam' : 'mo'}>{x.nhan || '·'}</td>;
      case 'ndSau': return <td key={k}><Ngay n={x.nhan ? x.ndSau : null} sapHet={sapHet} mucTieu={mucTieu} tonLau={tonLau} /></td>;
      default: return <td key={k} />;
    }
  };

  if (!doi) {
    return (
      <div className="ch-chon-doi card">
        <b>Chọn đội để chia hàng</b>
        <div className="ch-doi-luoi">
          {doiSx.map((d) => (
            <button key={d.ma_ch} onClick={() => setDoi(d.ma_ch)} className={nhapDs['doi:' + d.ma_ch] ? 'co-nhap' : ''}>
              <b>{tenNgan(d.ten)}</b>
              <small>{d.moi ? 'đội mới' : d.ngay_du == null ? '—' : `đủ ${d.ngay_du > 365 ? '>1 năm' : d.ngay_du + ' ngày'}`}</small>
              {nhapDs['doi:' + d.ma_ch] && <i>nháp</i>}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const tenDoi = kq?.ten || tenNgan(doiInfo?.ten) || doi;
  const banChuaDu = kq?.ban_dau && new Date(kq.ban_dau) > new Date(Date.now() - cuaSo * 864e5);

  // ---- mảnh dùng chung cho 2 kiểu đầu bàn (đầy đủ / thu gọn) ----
  const thamSo = (
    <div className="ch-ts2">
      <label title={'Số ngày lấy sức bán (1–180) — tính cả hôm nay: 1 = chỉ hôm nay (đang bán dở), 2 = hôm qua + hôm nay'}>Sức bán<span><OSoTs gt={cuaSo} min={1} max={180} onDat={setCuaSo} />ngày</span></label>
      <label title="Chia cho đội đủ bán bao nhiêu ngày (1–180)">Chia đủ<span><OSoTs gt={mucTieu} min={1} max={180} onDat={setMucTieu} />ngày</span></label>
      <label title="Tỷ lệ bổ sung so với nhu cầu: 100% = đúng nhu cầu, 120% = chia dư 20% (10–300)">Tỷ lệ<span><OSoTs gt={heSo} min={10} max={300} onDat={setHeSo} />%</span></label>
    </div>
  );
  const oThung = (
    <div className="ch-th-tim">
      <input placeholder={gon ? 'Mã thùng + Enter…' : 'Gõ mã thùng rồi Enter (vd TG-5020)…'} value={tq}
        onChange={(e) => setTq(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); themThung(goiYThung.find((g) => g.uu === 0)?.ma_thung || goiYThung[0]?.ma_thung || tq); } }} />
      {goiYThung.length > 0 && (
        <div className="ch-thung-gy">
          {goiYThung.map((g) => (
            <button key={g.ma_thung} onMouseDown={(e) => { e.preventDefault(); if (!g.da_giao && !g.kiem) themThung(g.ma_thung); }} disabled={!!g.da_giao || !!g.kiem}>
              <b>{g.ma_thung}</b><span>{g.tong_sl} cái · {g.so_ma} mã · {g.nhom}{g.tong_ghi != null && g.tong_ghi !== g.tong_sl ? ` · ghi ${g.tong_ghi} ≠ thực ${g.tong_sl}` : ''}</span>
              {g.da_giao ? <em>đã giao {tenNgan(g.da_giao.ma_ch)}</em> : g.kiem ? <em>cần kiểm tra</em> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
  const nutKho = <button className="ch-th-kho" onClick={() => setMoKho(true)} title="Mở kho thùng dạng thẻ để chọn"><IcGrid /><span className="ch-an-hep"> Kho thùng</span></button>;
  // Chưa chọn thùng: không hiện gì (ô gõ mã đã ghi sẵn hướng dẫn) — đỡ chiếm chỗ đầu bàn
  const theThung = thung.length === 0 ? null : (
    <div className="ch-th-ds">
      {thung.map((t) => {
        const x = thungCt[t];
        const loi = x?.khong_co ? 'không có trong file' : x?.da_giao ? `đã giao ${tenNgan(x.da_giao.ma_ch)}`
          : x?.kiem ? 'cần kiểm tra' : '';
        const lech = x && !loi && x.tong_ghi != null && x.tong_ghi !== x.tong_sl;
        const thieuTk = x && !loi ? x.ct.filter((c) => c.b && (c.tk ?? 0) < c.s) : [];
        const chuaCo = x && !loi ? x.ct.filter((c) => !c.b).length : 0;
        const goi = x?.ct?.map((c) => `${c.m}: ${c.s}` + (c.th ? '  (THU HỒI — rút ra)' : !c.b ? '  (chưa nhận diện)' : (c.tk ?? 0) < c.s ? `  (TK05005 còn ${c.tk ?? 0})` : '')).join('\n');
        const rutT = x && !loi ? x.ct.filter((c) => c.th) : [];
        return (
          <div key={t} className={'ch-tt' + (loi ? ' loi' : '') + (!loi && (lech || thieuTk.length || chuaCo || rutT.length) ? ' co-canh' : '')}
            title={(loi ? 'Thùng này sẽ KHÔNG vào phiếu: ' + loi + '\n' : '') + (rutT.length ? `RÚT ${rutT.length} mã thu hồi đội sale (${rutT.reduce((a, c) => a + c.s, 0)} cái) khi giao\n` : '')
              + (lech ? `Dòng thùng ghi ${x.tong_ghi}, cộng ruột = ${x.tong_sl} → lấy ${x.tong_sl}\n` : '')
              + (chuaCo ? `${chuaCo} mã chưa nhận diện\n` : '') + (thieuTk.length ? `${thieuTk.length} mã TK05005 chưa đủ\n` : '') + (goi || '')}>
            <div className="ch-tt-ma">{t}{diemThung[t] != null && !loi && (
              <i className={'gy-chip m-' + mucDiem(diemThung[t], gy.kq?.cfg)} title={`Điểm phù hợp với đội: ${diemThung[t]}/100`}>{diemThung[t]}</i>)}</div>
            <div className="ch-tt-so">{x ? (loi ? <em className="do">{loi}</em>
              : <><b>{x.tong_sl - rutT.reduce((a, c) => a + c.s, 0)}</b> cái · {x.ct.length - rutT.length} mã</>) : '…'}</div>
            {!loi && (lech || thieuTk.length > 0 || chuaCo > 0 || rutT.length > 0) && (
              <div className="ch-tt-canh">
                {rutT.length > 0 && <i className="do">rút {rutT.length} mã thu hồi</i>}
                {lech && <i className="lech">ghi {x.tong_ghi}</i>}
                {chuaCo > 0 && <i className="do">{chuaCo} mã ?</i>}
                {thieuTk.length > 0 && <i className="lech">TK thiếu {thieuTk.length}</i>}
              </div>
            )}
            <button className="ch-tt-x" onClick={() => boThung(t)} title="Bỏ thùng">×</button>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className={'ch-ban' + (toan ? ' toan' : '') + (gon ? ' gon' : '')}>
      {/* ===== Dải đội + nút thu gọn / toàn màn hình ===== */}
      <div className="ch-top">
        <div className="ch-dai">
          {doiSx.map((d) => (
            <button key={d.ma_ch} className={(d.ma_ch === doi ? 'on ' : '') + (nhapDs['doi:' + d.ma_ch] ? 'co-nhap' : '')}
              onClick={() => setDoi(d.ma_ch)} title={tenNgan(d.ten) + (nhapDs['doi:' + d.ma_ch] ? ' — có bản nháp đang dở' : '')}>
              {tenNgan(d.ten).replace('Đội ', '')}
            </button>
          ))}
        </div>
        <button className="ch-gon-nut" onClick={() => setGon(!gon)} title={gon ? 'Mở rộng đầu bàn (thẻ thùng, số liệu đầy đủ)' : 'Thu gọn đầu bàn để bảng chia rộng hơn'}>
          {gon ? '⌄ Mở rộng' : '⌃ Thu gọn'}
        </button>
        <button className="ch-toan-nut" onClick={() => batToan(!toan)} title={toan ? 'Thu về (Esc)' : 'Mở bàn chia toàn màn hình'}>
          {toan ? <><IcThuNho /> Thu nhỏ</> : <><IcMoRong /> Toàn màn hình</>}
        </button>
      </div>

      {gon ? (
        /* ===== Đầu bàn THU GỌN: 1 hàng ===== */
        <div className="ch-gon">
          <div className="ch-gon-doi">
            <button className="ch-mui" onClick={() => doiTiep(-1)} title="Đội trước">‹</button>
            <b title={`${fmtN(dong.length)} mã · ${fmtN(tong.maBan)} mã có bán`}>{tenNgan(tenDoi)}</b>
            <button className="ch-mui" onClick={() => doiTiep(1)} title="Đội sau">›</button>
          </div>
          <div className="ch-gon-so">
            <span><b>{tong.banNgay ? tong.banNgay.toFixed(1) : '—'}</b> /ngày</span>
            <span><b>{fmtN(tong.co)}</b> đang có</span>
            <span>đủ <b><Ngay n={tong.ndTruoc} sapHet={sapHet} mucTieu={mucTieu} tonLau={tonLau} /></b> ngày</span>
            {banChuaDu && <i className="ch-chu-y" title={`Đội bán từ ${kq.ban_dau.slice(8, 10)}/${kq.ban_dau.slice(5, 7)}`}>bán chưa đủ {cuaSo} ngày</i>}
          </div>
          {thamSo}
          <div className="ch-gon-th">
            <span className="ch-th-ic" title="Thùng đóng sẵn — hàng ở TK05005, phiếu riêng ghi kho SA"><IcBox /></span>
            {oThung}
            <NutGoiY gy={gy} onMo={() => setMoGy(true)} gon />
            {nutKho}
            {theThung}
            {thung.length > 0 && <span className="ch-gon-th-tong" title={`${trongThung.soMa} mã trong thùng`}><b>{fmtN(tong.th)}</b> cái · {trongThung.soThung} thùng</span>}
          </div>
          <TrangThaiLuu tt={ttLuu} />
        </div>
      ) : (<>
        {/* ===== Đầu bàn đầy đủ ===== */}
        <div className="ch-dau2">
          <div className="ch-dau2-doi">
            <button className="ch-mui" onClick={() => doiTiep(-1)} title="Đội trước">‹</button>
            <div>
              <h3>{tenDoi}</h3>
              {banChuaDu ? <small className="ch-chu-y">bán từ {kq.ban_dau.slice(8, 10)}/{kq.ban_dau.slice(5, 7)} — chưa đủ {cuaSo} ngày</small>
                : <small>{fmtN(dong.length)} mã · {fmtN(tong.maBan)} mã có bán</small>}
            </div>
            <button className="ch-mui" onClick={() => doiTiep(1)} title="Đội sau">›</button>
          </div>
          <div className="ch-dau2-so">
            <div><b>{tong.banNgay ? tong.banNgay.toFixed(1) : '—'}</b><span>bán / ngày</span></div>
            <div><b>{fmtN(tong.co)}</b><span>đang có (tồn + về)</span></div>
            <div><b><Ngay n={tong.ndTruoc} sapHet={sapHet} mucTieu={mucTieu} tonLau={tonLau} /></b><span>đủ ngày hiện tại</span></div>
          </div>
          {thamSo}
          <TrangThaiLuu tt={ttLuu} />
        </div>
        <div className="ch-th">
          <div className="ch-th-nhan">
            <span className="ch-th-ic"><IcBox /></span>
            <div><b>Thùng đóng sẵn</b><small>Hàng ở TK05005 · phiếu riêng ghi kho SA</small></div>
          </div>
          {oThung}
          <NutGoiY gy={gy} onMo={() => setMoGy(true)} />
          {nutKho}
          {theThung}
          <div className="ch-th-tong">
            <b>{fmtN(tong.th)}</b>
            <span>cái · {trongThung.soThung} thùng · {trongThung.soMa} mã</span>
          </div>
        </div>
      </>)}

      {moKho && (
        <div className="kt-modal" onClick={(e) => { if (e.target === e.currentTarget) setMoKho(false); }}>
          <div className="kt-modal-in">
            <div className="kt-modal-dau"><b>Kho thùng — chọn thùng cho {tenDoi}</b>
              <button className="kt-dong" onClick={() => setMoKho(false)}>×</button></div>
            <KhoThung dsDoi={dsDoi} chon={{ doi, daChon: thung, diem: gy.kq?.diem, cfg: gy.kq?.cfg,
              onXong: (ds) => { datNhap((d) => ({ ...d, thung: ds })); baoToast(`Đã đưa ${ds.length} thùng vào bàn chia`); },
              onDong: () => setMoKho(false) }} />
          </div>
        </div>
      )}

      {moGy && (
        <GoiYThung gy={gy} doi={doi} tenDoi={tenDoi} cuaSo={cuaSo} onDong={() => setMoGy(false)} onDoiTiep={doiTiep}
          daChon={thung} onBo={boThung}
          onThem={(ds) => { datNhap((d) => ({ ...d, thung: [...new Set([...(d.thung || []), ...ds])] }));
            baoToast(`Đã đưa ${ds.length} thùng vào bàn chia ${tenNgan(tenDoi)} — trạng thái Chờ xác nhận`); }} />
      )}

      {suaBoLoc && (
        <HopBoLoc ban={suaBoLoc === 'moi' ? null : suaBoLoc} onDong={() => setSuaBoLoc(null)}
          onXong={(id, daXoa) => { setSuaBoLoc(null); taiBoLoc(); if (daXoa) { if (boLocDung === suaBoLoc.id) setBoLocDung(null); } else if (id) setBoLocDung(id); }} />
      )}

      {moTc && (
        <HopTuyChinh tc={tc} datTc={datTc} mayChu={mayChu} locDs={locDs} cotDs={cotDs} locMacDinh={LOC_MAC_DINH} cotMacDinh={COT_MAC_DINH}
          dsBoLoc={dsBoLoc} laAdmin={laAdmin} token={user?.token} taiBoLoc={taiBoLoc} hienTai={locHienTai} moTaHienTai={moTaLoc}
          onSuaBoLoc={(b) => setSuaBoLoc(b)} onDong={() => setMoTc(false)} baoToast={baoToast} tabDau={typeof moTc === 'string' ? moTc : 'loc'} />
      )}

      {thayThe && dong.find((x) => x.bc === thayThe) && (
        <HopThayThe x={dong.find((x) => x.bc === thayThe)} dong={dong} cuaSo={cuaSo} tenDoi={tenNgan(tenDoi)}
          onThem={(bc, sl) => datSo(bc, sl)} onDong={() => setThayThe(null)} baoToast={baoToast} />
      )}
      {hopGhiChu}

      {/* ===== Lọc nhanh + thao tác ===== */}
      <div className="ch-cong">
        <div className="ch-xem" title="Xem theo nguồn hàng: Hàng Sale (kho SA05001/SA05002) hoặc Phụ kiện (kho PK05001)">
          {NGUON_XEM.map(([k, t]) => (
            <button key={k} className={nguonXem === k ? 'on' : ''} onClick={() => setNguonXem(k)}>{t}<i>{fmtN(demNguon[k])}</i></button>
          ))}
        </div>
        <div className="ch-loc2">
          {boLoc && (
            <button className="on bl-chip" onClick={() => setBoLocDung(null)} title="Đang dùng bộ lọc riêng — bấm để bỏ">
              <IcLoc /> {boLoc.ten}<i>{fmtN(hien.length)}</i><span className="x">×</span>
            </button>
          )}
          {(tc.mau || []).map((m) => (
            <button key={m.id} className={'ch-mau' + (mauDang?.id === m.id ? ' on' : '')} onClick={() => dungMau(m)} title="Bộ lọc của tôi — bấm để dùng / bỏ">
              ★ {m.ten}
            </button>
          ))}
          {locDs.filter((c) => c.hien || loc.includes(c.k)).map(({ k, ten: t, mo: g }) => (
            <button key={k} title={g} className={(loc.includes(k) ? 'on ' : '') + (k === 'canh' && demLoc.canh ? 'nong ' : '') + (k === 'thieu' && demLoc.thieu ? 'am' : '')}
              onClick={() => setLoc((l) => (l.includes(k) ? l.filter((x) => x !== k) : [...l, k]))}>
              {t}<i>{fmtN(demLoc[k])}</i>
            </button>
          ))}
          {(loc.length > 0 || locCotFn.co || boLoc) && <button className="bo" onClick={() => { setLoc([]); setLocCot({}); setBoLocDung(null); }}>Bỏ mọi lọc</button>}
        </div>
        <button className="ch-loc-an" onClick={() => setMoTc('loc')} title="Ẩn / hiện, sắp lại các nút lọc nhanh — chỉ áp cho tài khoản của anh, người khác không đổi">
          <IcMat /><span className="ch-an-hep"> Ẩn / hiện</span>{locDs.some((c) => !c.hien) ? <i>{locDs.filter((c) => !c.hien).length}</i> : null}</button>
        <div className="ch-cong-nut">
          <MenuBoLoc ds={dsBoLoc} dangDung={boLocDung} onDung={setBoLocDung} onTao={() => setSuaBoLoc('moi')} onSua={(b) => setSuaBoLoc(b)}
            an={tc.bo_loc_an || []} laAdmin={laAdmin} onTuyChinh={(t) => setMoTc(t || 'loc')}
            onAn={(id) => { datTc((t) => ({ ...t, bo_loc_an: [...new Set([...(t.bo_loc_an || []), id])] })); baoToast('Đã ẩn bộ lọc khỏi menu của anh — hiện lại ở “Ẩn / hiện bộ lọc…”'); }} />
          <select className={'ch-sel' + (sap === 'ma_nhom' ? ' on' : '')} value={sap} onChange={(e) => setSap(e.target.value)} title="Sắp xếp">
            {SAP.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
          <button className="ch-tc-nut" onClick={() => setMoTc(true)} title="Tùy chỉnh Bàn làm việc: ẩn / hiện, sắp lại bộ lọc và cột, lưu bộ lọc của tôi (theo tài khoản)">⚙<span className="ch-an-hep"> Tùy chỉnh</span></button>
          <button className="btn btn-ai" onClick={() => tuDong(false)} title={`AI đề nghị cho tab ${tenTab}: điền vào mã CHƯA nhập — số đã nhập giữ nguyên${nguonXem === 'tat' ? '' : ', tab khác không đổi'}. Làm tròn theo giá sale, không vượt kho.`}>
            <IcSpark /> Tự động chia{nguonXem !== 'tat' ? <em className="ch-tab-nho">{tenTab}</em> : null}</button>
          <button className="btn btn-ghost" onClick={() => tuDong(true)} title={`Ghi đè tab ${tenTab} bằng đề nghị AI`}>{gon ? 'Điền lại' : `Điền lại ${nguonXem === 'tat' ? 'tất cả' : 'tab'}`}</button>
          <button className="btn btn-ghost" onClick={xoaSo} title={`Xoá số chia thêm tab ${tenTab}`}>Xoá số</button>
        </div>
      </div>

      {/* ===== Bảng ===== */}
      <div className="card ch-bang" ref={khung} onScroll={(e) => setCuon(e.currentTarget.scrollTop)}>
        {dang && !kq ? <div className="dsl-trong">Đang tải số liệu đội…</div> : (
        <table className="ch-tbl">
          <colgroup>
            <col style={{ width: 40 }} /><col style={{ width: 52 }} /><col style={{ width: 240 }} />
            {cotHien.map((c) => <col key={c.k} style={{ width: c.w }} />)}
          </colgroup>
          <thead>
            <tr className="ten">
              <th>#</th><th></th><th className="l">Sản phẩm <span className="ch-dem2">{fmtN(hien.length)}/{fmtN(dong.length)}</span></th>
              {cotHien.map((c) => (
                <th key={c.k} className={{ th: 'c-thung', them: 'c-them', kd: 'c-kd' }[c.k] || ''} title={c.k === 'ban' ? `Bán trong ${cuaSo} ngày` : c.mo}>
                  {c.k === 'ban' ? `Bán ${cuaSo}n` : c.ten}
                </th>
              ))}
            </tr>
            <tr className="loc">
              <th colSpan={2}>
                {locCotFn.co ? <button className="ch-loc-xoa" onClick={() => setLocCot({})} title="Xoá các ô lọc cột">×</button>
                  : <IcLoc className="ch-loc-ic" />}
              </th>
              <th className="l">
                <input value={locCot.sp || ''} placeholder="Lọc mã, tên, màu…" onChange={(e) => setLocCot((c) => ({ ...c, sp: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); diDen(0); } }} />
              </th>
              {cotHien.map(({ k }) => (
                <th key={k} className={{ th: 'c-thung', them: 'c-them', kd: 'c-kd' }[k] || ''}>
                  <input className={locCotFn.sai[k] ? 'sai' : locCot[k] ? 'co' : ''} value={locCot[k] || ''} inputMode="text"
                    title={'Lọc cột: gõ 5 (bằng), >5, >=5, <3, <=3, !=0, hoặc khoảng 5-10' + (locCotFn.sai[k] ? '\nChưa hiểu cách gõ này — đang bỏ qua' : '')}
                    onChange={(e) => setLocCot((c) => ({ ...c, [k]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); diDen(0); } }} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dau > 0 && <tr style={{ height: dau * rowH }}><td colSpan={3 + cotHien.length} /></tr>}
            {hien.slice(dau, cuoi).map((x, j) => {
              const i = dau + j;
              const dauNhom = sap === 'ma_nhom' && (i === 0 || hien[i - 1].nhomMa !== x.nhomMa);
              return (
                <tr key={x.bc} className={(x.canh.length ? 'canh ' : '') + (x.them > 0 ? 'co-so ' : '') + (dauNhom ? 'dau-nhom ' : '') + (sap === 'ma_nhom' && !dauNhom ? 'trong-nhom' : '')} style={{ height: rowH }}>
                  <td className="stt">{i + 1}</td>
                  <td><AnhSP url={x.img} ten={x.mtc} /></td>
                  <td className="l sp">
                    <b>{x.mtc}{x.chay && <i className="ch-chay" title="Bán chạy (top 15%)">●</i>}{x.moi && <i className="ch-moi">mới</i>}
                      {x.pk && <i className="ch-pk" title="Phụ kiện — chia từ kho PK05001, phiếu riêng">PK</i>}
                      {x.thuHoi && <i className="ch-th-hoi" title="Mã thu hồi đội sale (Hàng đặc biệt) — AI không đề nghị, thùng có mã này sẽ rút ra khi giao">Thu hồi</i>}
                      {!x.pk && x.gia ? <i className={'ch-gia' + (x.nguonGia && x.nguonGia !== 'sp' ? ' uoc' : '')}
                        title={x.nguonGia === 'sp' ? `Giá sale ${kGia(x.gia)} (DATA SẢN PHẨM)` : `Giá sale ${kGia(x.gia)} — lấy theo ${x.nguonGia === 'ban' ? 'giá bán nhiều nhất 90 ngày' : 'giá chung của mẫu'} (DATA SẢN PHẨM chưa có)`}>{kGia(x.gia)}</i> : null}
                      {x.canh.length > 0 && !cotHien.some((c) => c.k === 'kd') && <IcAlert className="ch-i-canh" />}</b>
                    <small>{dauNhom && x.soNhom > 1 ? <span className="ch-nhom-tong" title={`Nhóm ${x.nhomMa}: cộng bán ${x.soNhom} size`}>Σ {x.nhomMa} bán {fmtN(x.banNhom)} · {x.soNhom} size · </span> : null}{x.n3 || x.n1}</small>
                  </td>
                  {cotHien.map(({ k }) => oCot(k, x, i))}
                </tr>
              );
            })}
            {cuoi < hien.length && <tr style={{ height: (hien.length - cuoi) * rowH }}><td colSpan={3 + cotHien.length} /></tr>}
            {hien.length === 0 && kq && <tr><td colSpan={3 + cotHien.length} className="dsl-trong">Không có mã nào khớp bộ lọc.</td></tr>}
          </tbody>
        </table>)}
      </div>

      {/* ===== Bảng tổng (1 hàng mỏng): tổng · 3 nguồn · đủ ngày · cảnh báo · xác nhận ===== */}
      <div className="ch-tong3">
        <div className="ch-t3-tong" title={`Tổng giao ${tenNgan(tenDoi)}`}>
          <b>{fmtN(tong.nhan)}</b><span>cái giao<br />{fmtN(tong.ma + new Set(trongThung.khongMa).size)} mã</span>
        </div>
        <div className="ch-t3-nguon">
          <div className="ch-t3-o" title="Hàng Sale — xuất từ SA05001 / SA05002, phiếu Sale">
            <i className="sa" /><span>Sale</span><b>{fmtN(tong.sa)}</b><em>{tong.maSa ? `${tong.maSa} mã` : ''}</em>
          </div>
          <div className="ch-t3-o" title="Phụ kiện — xuất từ PK05001, phiếu riêng">
            <i className="pk" /><span>Phụ kiện</span><b>{fmtN(tong.pk)}</b><em>{tong.maPk ? `${tong.maPk} mã` : ''}</em>
          </div>
          <div className="ch-t3-o ch-ds-thung-o" title="Hàng đóng thùng — hàng ở TK05005, phiếu riêng ghi kho SA">
            <i className="th" /><span>Thùng</span><b>{fmtN(tong.th)}</b>
            {trongThung.soThung ? <button onClick={() => setMoDsThung((v) => !v)}>{trongThung.soThung} thùng ▾</button> : <em />}
            {moDsThung && trongThung.soThung > 0 && (
              <div className="ch-ds-thung" onMouseLeave={() => setMoDsThung(false)}>
                <b>{trongThung.soThung} thùng · {fmtN(tong.th)} cái</b>
                {thung.filter((t) => thungCt[t] && !thungCt[t].khong_co && !thungCt[t].da_giao && !thungCt[t].kiem).map((t, i) => (
                  <div key={t}><span>{i + 1}.</span><b>{t}</b><em>{thungCt[t].tong_sl} cái · {thungCt[t].ct.length} mã</em>
                    <button onClick={() => boThung(t)} title="Bỏ thùng">×</button></div>
                ))}
              </div>
            )}
          </div>
          <div className="ch-tong-thanh">
            {tong.nhan > 0 ? <>
              <i className="sa" style={{ width: (tong.sa / tong.nhan) * 100 + '%' }} />
              <i className="pk" style={{ width: (tong.pk / tong.nhan) * 100 + '%' }} />
              <i className="th" style={{ width: (tong.th / tong.nhan) * 100 + '%' }} />
            </> : <i className="rong" />}
          </div>
        </div>
        <div className="ch-t3-nd" title={`Đội đủ bán (chỉ tính hàng bán) — mục tiêu ${mucTieu} ngày`}>
          <span>Đủ bán</span>
          <Ngay n={tong.ndTruoc} sapHet={sapHet} mucTieu={mucTieu} tonLau={tonLau} /><i>→</i>
          <Ngay n={tong.nhan ? tong.ndSau : tong.ndTruoc} sapHet={sapHet} mucTieu={mucTieu} tonLau={tonLau} /><span>ngày</span>
        </div>
        <div className="ch-t3-canh">
          {tong.vuot > 0 && <button className="do" onClick={() => setLoc(['canh'])}><IcAlert /> {tong.vuot} vượt kho{tong.vuotPk ? ` (${tong.vuotPk} PK)` : ''}</button>}
          {tong.canh > 0 && <button onClick={() => setLoc(['canh'])}><IcAlert /> {tong.canh} cần xem</button>}
          {!tong.vuot && !tong.canh && <span className="ok"><IcCheck /> Ổn</span>}
          <button className="ch-t3-hoi" onClick={() => setMoGhi((v) => !v)} title="Cách tính gợi ý, phím tắt, cách gõ ô lọc">?</button>
        </div>
        <div className="ch-t3-nut">
          {phieuMoi && phieuMoi.doi === doi ? (
            <div className="ch-xong3">
              <span title={tenPhieu(phieuMoi)}><IcCheck /> Đã xuất {soFile(phieuMoi)} file · {fmtN(phieuMoi.sl)} cái</span>
              <button className="btn btn-ai" onClick={() => doiTiep(1)}>Đội tiếp →</button>
            </div>
          ) : (
            <button className="ch-xn3" disabled={gui || !tong.nhan} onClick={xacNhan}
              title={tong.nhan ? [tong.sa > 0 && 'Phiếu Sale (SA)', tong.pk > 0 && 'Phiếu phụ kiện (PK05001)', tong.th > 0 && `Phiếu thùng (${trongThung.soThung} thùng)`].filter(Boolean).join(' + ') : ''}>
              <IcDown />
              <span>
                <b>{gui ? 'Đang xác nhận…' : tong.nhan ? `Xác nhận & xuất ${tong.soPhieu} file` : 'Chưa có số'}</b>
                <small>{tong.nhan ? [tong.sa > 0 && 'Sale', tong.pk > 0 && 'Phụ kiện', tong.th > 0 && `Thùng ×${trongThung.soThung}`].filter(Boolean).join(' + ') : 'nhập số hoặc chọn thùng'}</small>
              </span>
            </button>
          )}
        </div>
      </div>
      {moGhi && (
        <div className="tq-ghi ch-ghi2">
          Gợi ý = bán/ngày × {mucTieu} ngày × {heSo}% − (tồn + đang về) − hàng trong thùng, rồi LÀM TRÒN LÊN theo giá sale: 250k → 5, 10, 15… · 350k → 3, 5, 10… · từ 400k → 5, 10…; lưỡi bội 5; túi ráp chỉ S, M bước 200 (chưa có số bán: mặc định 400). Không bao giờ vượt kho khả dụng (hàng Sale: SA; phụ kiện: PK05001) — thiếu thì cảnh báo, bấm ⇄ để chọn mã thay thế (cùng giá, cùng màu, cùng size; khác màu phải xác nhận). Mã không bán trong {cuaSo} ngày không gợi ý. “Tự động chia” chỉ điền cho tab đang chọn.
          “Đội đủ bán” chỉ tính hàng bán, không tính phụ kiện. Sắp “Theo mã sản phẩm”: gộp các size cùng mẫu-màu, nhóm bán nhiều (cộng mọi size) đứng trước, size xếp S → M → L → XL.
          Phím: Enter/↓ xuống · ↑ lên · Space điền gợi ý. Kho còn = tồn dự tính SA05001 + SA05002 − phần đang giữ − chia thêm (thùng KHÔNG trừ kho SA).
          Hàng thùng: số = cộng các dòng ruột thùng (không lấy số ghi ở dòng thùng), lấy hàng ở TK05005, phiếu riêng ghi kho SA, không cần SA đủ tồn.
          Ô lọc dưới tiêu đề: gõ 5 (bằng), &gt;5, &lt;3, &gt;=5, !=0, hoặc khoảng 5-10; cột Sản phẩm gõ chữ (nhiều từ = phải có đủ).
        </div>
      )}
    </div>
  );
}

// Ô số tham số đầu bàn (v3.112.2): gõ tự do (xoá trắng, gõ 1, 2… không bị nhảy số),
// chốt khi Enter / rời ô / ngừng gõ 0,6 giây nếu số nằm trong khoảng cho phép
function OSoTs({ gt, min, max, onDat }) {
  const [o, setO] = useState(String(gt));
  const hen = useRef(null);
  useEffect(() => { setO(String(gt)); }, [gt]);
  useEffect(() => () => clearTimeout(hen.current), []);
  const chot = (v, epVe) => {
    const n = so(v);
    if (!n) { if (epVe) setO(String(gt)); return; }
    const c = Math.max(min, Math.min(max, n));
    if (epVe) setO(String(c));
    if (c !== gt) onDat(c);
  };
  return (
    <input type="number" inputMode="numeric" min={min} max={max} value={o}
      onChange={(e) => {
        const v = e.target.value; setO(v); clearTimeout(hen.current);
        const n = so(v); if (n >= min && n <= max) hen.current = setTimeout(() => chot(v, false), 600);
      }}
      onBlur={() => { clearTimeout(hen.current); chot(o, true); }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); else if (e.key === 'Escape') { setO(String(gt)); e.currentTarget.blur(); } }}
      onFocus={(e) => e.target.select()} />
  );
}

function Ngay({ n, sapHet, mucTieu, tonLau }) {
  if (n == null) return <span className="mo">·</span>;
  const cls = n < sapHet ? 'nd do' : n < mucTieu ? 'nd vang' : n > tonLau ? 'nd xam' : 'nd xanh';
  return <span className={cls}>{n > 999 ? '999+' : n < 10 ? n.toFixed(1) : Math.round(n)}</span>;
}

// ============================================================================
// MÃ THAY THẾ khi thiếu kho (v3.112.0) — không tự lấy: anh bấm mới thêm
//   1. Cùng mẫu-màu, size khác còn kho
//   2. Cùng giá + cùng họ màu + cùng size, mẫu khác (xếp theo đội bán, rồi toàn mạng)
//   3. Cùng giá + cùng size nhưng KHÁC MÀU — phải xác nhận
// ============================================================================
function HopThayThe({ x, dong, cuaSo, tenDoi, onThem, onDong, baoToast }) {
  const coGia = x.gia != null;
  const sx = (a, b) => b.ban - a.ban || b.banMang - a.banMang || b.khoCon - a.khoCon;
  const conKho = (y) => !y.pk && y.bc !== x.bc && y.khoCon > 0;
  const nhom = [
    { k: 'size', ten: `Cùng mẫu-màu ${x.nhomMa}, size khác`, ds: dong.filter((y) => conKho(y) && y.nhomMa === x.nhomMa).sort(sx).slice(0, 6) },
    { k: 'mau', ten: coGia ? `Cùng giá ${kGia(x.gia)} · cùng màu ${x.hm || '?'} · size ${x.size || '—'}` : 'Cùng giá · cùng màu (mã này chưa có giá sale)',
      ds: coGia ? dong.filter((y) => conKho(y) && y.gia === x.gia && y.hm === x.hm && y.size === x.size && y.nhomMa !== x.nhomMa).sort(sx).slice(0, 6) : [] },
    { k: 'khac', ten: coGia ? `Cùng giá ${kGia(x.gia)} · size ${x.size || '—'} · KHÁC MÀU — cần xác nhận` : 'Khác màu', khac: true,
      ds: coGia ? dong.filter((y) => conKho(y) && y.gia === x.gia && y.hm !== x.hm && y.size === x.size).sort(sx).slice(0, 6) : [] },
  ];
  const them = (y, khac) => {
    const q = Math.min(lenMuc(x.thieu, y.qt), xuongMuc(y.khoCon, y.qt));
    if (q <= 0) { baoToast(`${y.mtc}: kho còn ${y.khoCon} — chưa đủ 1 mức làm tròn (${y.qt.nhan})`); return; }
    if (khac && !window.confirm(`Thay bằng mã KHÁC MÀU?\n\n${x.mtc} (màu ${x.hm || '?'}) thiếu ${x.thieu}\n→ thêm ${q} cái ${y.mtc} (màu ${y.hm || '?'})\n\nĐội ${tenDoi} sẽ nhận màu khác với đề nghị.`)) return;
    onThem(y.bc, (y.them || 0) + q);
    baoToast(`Đã thêm ${q} cái ${y.mtc} thay cho ${x.mtc}${khac ? ' (khác màu — đã xác nhận)' : ''}`);
  };
  return (
    <div className="kt-modal" onMouseDown={(e) => { if (e.target === e.currentTarget) onDong(); }}>
      <div className="thay-hop">
        <div className="thay-dau">
          <div>
            <small>Thiếu kho — chọn mã thay thế cho {tenDoi}</small>
            <b>{x.mtc}</b>
            <span>Đề nghị {x.len} ({x.qt.nhan}) · kho còn {fmtN(x.kd)} → chỉ chia được {x.goiY} · <em>thiếu {x.thieu}</em></span>
          </div>
          <button className="kt-dong" onClick={onDong}>×</button>
        </div>
        <div className="thay-than">
          {nhom.map((g) => (
            <div key={g.k} className={'thay-nhom' + (g.khac ? ' khac' : '')}>
              <div className="thay-nhom-dau">{g.khac ? <IcAlert /> : <IcCheck />}<b>{g.ten}</b><span>{g.ds.length ? `${g.ds.length} mã` : 'không có'}</span></div>
              {g.ds.map((y) => {
                const q = Math.min(lenMuc(x.thieu, y.qt), xuongMuc(y.khoCon, y.qt));
                return (
                  <div key={y.bc} className="thay-dong">
                    <AnhSP url={y.img} ten={y.mtc} />
                    <div className="thay-ma"><b>{y.mtc}</b><small>{y.n3 || ''}{y.gia ? ` · ${kGia(y.gia)}` : ''}</small></div>
                    <div className="thay-so"><span>Đội bán <b>{fmtN(y.ban)}</b></span><span>Mạng <b>{fmtN(y.banMang)}</b>/{cuaSo}n</span><span>Kho <b>{fmtN(y.khoCon)}</b></span>
                      {y.them > 0 && <span className="dang">đang chia {y.them}</span>}</div>
                    <button className={'thay-nut' + (g.khac ? ' khac' : '')} disabled={q <= 0} onClick={() => them(y, g.khac)}
                      title={q > 0 ? `Thêm ${q} vào Chia thêm của ${y.mtc}` : 'Kho chưa đủ 1 mức làm tròn'}>
                      {q > 0 ? `+${q}` : '—'}{g.khac ? ' · xác nhận' : ''}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="thay-chan">Không tự lấy hàng thay thế: chỉ thêm khi anh bấm. Số thêm = phần thiếu, làm tròn lên theo giá của mã thay thế, không vượt kho của mã đó.</div>
      </div>
    </div>
  );
}

// ============================================================================
// 3. PHIẾU ĐÃ CHIA
// ============================================================================
function DsPhieu() {
  const { user, baoToast } = useApp();
  const odoo = useOdooCfg(user);   // v3.114.0: gửi Odoo từng phiếu + trạng thái đơn Odoo (mở theo tham số odoo_api)
  const [ds, setDs] = useState(null);
  const [odDon, setOdDon] = useState({});   // ma_phieu -> [đơn odoo]
  const tai = () => sb.rpc('fn_ds_phieu_ds', { p_ngay: 30 }).then(({ data, error }) => { if (error) baoToast('Lỗi: ' + error.message); setDs(data || []); });
  useEffect(() => { tai(); }, []);   // eslint-disable-line
  const taiOdoo = useCallback(async () => {
    if (!odoo || !ds?.length) return;
    const m = {};
    (await odooTheoNguon(user.token, ds.map((p) => p.ma_phieu))).forEach((d) => { (m[d.tai_lieu_nguon] = m[d.tai_lieu_nguon] || []).push(d); });
    setOdDon(m);
  }, [odoo, ds, user.token]);
  useEffect(() => { taiOdoo(); }, [taiOdoo]);
  const guiOdoo = (p) => odooTuPhieu([{ id: p.id, ma_phieu: p.ma_phieu, ghi_chu: p.ghi_chu }], 'Phiếu ' + p.ma_phieu, taiOdoo, user.token)
    .catch((e) => baoToast('Lỗi: ' + (e?.message || e)));
  const odChip = (p) => {
    const d = odDon[p.ma_phieu]; if (!d?.length) return null;
    const ok = d.filter((x) => x.trang_thai === 'thanh_cong').length;
    const loi = d.filter((x) => x.trang_thai === 'loi').length;
    const xem = d.filter((x) => x.trang_thai === 'can_xem').length;
    const cls = loi ? 'loi' : xem ? 'xem' : ok ? 'ok' : 'gui';
    return <span className={'od-chip nho ' + cls} title={d.map((x) => `${x.name}: ${x.trang_thai}${x.loi ? ' — ' + x.loi : ''}`).join('\n')}>
      Odoo {ok ? `✓ ${ok}` : ''}{xem ? ` ⚠ ${xem}` : ''}{loi ? ` ✕ ${loi}` : ''}</span>;
  };
  const doiTt = async (p, tt) => {
    const hoi = p.nguon === 'TK'
      ? (tt === 'huy' ? `Huỷ phiếu thùng ${p.ma_phieu}? Các thùng (${(p.thung || []).join(', ')}) sẽ được trả lại để giao đội khác.` : `Đánh dấu phiếu thùng ${p.ma_phieu} đã xuất kho?`)
      : tt === 'huy' ? `Huỷ ${p.ma_phieu}? Tồn ${p.nguon === 'PK' ? 'kho phụ kiện' : 'SA'} đang giữ (${p.con_giu}) sẽ được trả lại.` : `Đánh dấu ${p.ma_phieu} đã xuất kho? Phần còn giữ (${p.con_giu}) sẽ được nhả.`;
    if (!window.confirm(hoi)) return;
    const { data, error } = await sb.rpc('fn_ds_phieu_doi_tt', { p_id: p.id, p_tt: tt, p_nguoi: user?.ma_dang_nhap || '' });
    if (error || !data?.ok) baoToast('Không đổi được: ' + (error?.message || data?.loi)); else { baoToast('Đã cập nhật ' + p.ma_phieu); tai(); }
  };
  const TT = { xac_nhan: ['Đang giữ tồn', 'giu'], da_xuat: ['Đã xuất', 'xong'], huy: ['Đã huỷ', 'huy'] };
  const ttTen = (p) => (p.nguon === 'TK' && p.trang_thai === 'xac_nhan' ? 'Chờ xuất thùng' : TT[p.trang_thai][0]);
  return (
    <div className="card" style={{ padding: 0, overflow: 'auto' }}>
      <table className="tbl ch-phieu">
        <thead><tr><th>Phiếu</th><th>Trạng thái</th><th>Đội</th><th className="num">Mã</th><th className="num">Tổng</th><th className="num">Còn giữ</th><th>Thùng</th><th>Người · lúc</th><th /></tr></thead>
        <tbody>
          {ds == null ? <tr><td colSpan={9} className="dsl-trong">Đang tải…</td></tr>
            : ds.length === 0 ? <tr><td colSpan={9} className="dsl-trong">Chưa có phiếu nào trong 30 ngày.</td></tr>
            : ds.map((p) => (
              <tr key={p.id}>
                <td><b>{p.ma_phieu}</b> <span className={'ch-nguon ' + ({ TK: 'tk', PK: 'pk' }[p.nguon] || 'sa')}>{{ TK: 'Thùng · TK05005', PK: 'Phụ kiện · PK05001' }[p.nguon] || 'Sale · SA'}</span>
                  <div className="tq-ghi">{p.loai === 'loat' ? 'Chia hàng mới' : 'Từng đội'}{p.ma_lien_quan ? ` · đi cùng ${p.ma_lien_quan}` : ''}</div>
                  {p.ghi_chu && <div className="ch-phieu-gc" title="Ghi chú — ghi ở dòng 1 của file">✎ {p.ghi_chu}</div>}
                  {odoo && odChip(p)}</td>
                <td><span className={'ch-tt ' + TT[p.trang_thai][1]}>{ttTen(p)}</span></td>
                <td>{(p.doi || []).map(tenNgan).join(', ')}</td>
                <td className="num">{fmtN(p.so_ma)}</td>
                <td className="num"><b>{fmtN(p.tong)}</b></td>
                <td className="num">{p.trang_thai === 'xac_nhan' && p.nguon !== 'TK' ? fmtN(p.con_giu) : '—'}</td>
                <td className="tq-ghi">{(p.thung || []).join(', ') || '—'}</td>
                <td className="tq-ghi">{p.nguoi || '—'} · {ngayGio(p.tao_luc)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn" onClick={() => xuatPhieu(p.id, p.ma_phieu, p.ghi_chu).catch((e) => baoToast('Lỗi: ' + e.message))}><IcDown /> File</button>
                  {odoo && p.trang_thai !== 'huy' && <button className="btn od-nut-nho" onClick={() => guiOdoo(p)} title="Tạo đơn điều chuyển Odoo từ phiếu này"><IcGuiLen /> Odoo</button>}
                  {p.trang_thai === 'xac_nhan' && <>
                    <button className="btn" onClick={() => doiTt(p, 'da_xuat')}><IcCheck /> Đã xuất</button>
                    <button className="btn" onClick={() => doiTt(p, 'huy')}>Huỷ</button>
                  </>}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
      <div className="tq-ghi" style={{ padding: '8px 12px' }}>
        <IcClock /> Phiếu Sale (SA) và Phụ kiện (PK05001): tồn đang giữ tự nhả khi tồn dự tính của kho giảm — đủ thì tự “Đã xuất” (PK05001 còn cấp cho cửa hàng nên có thể nhả sớm). Phiếu Thùng (TK05005): không giữ tồn; thùng đã rời file hoặc đổi ruột chỉ cảnh báo ở Kho thùng — bấm “Đã xuất” tay.
      </div>
    </div>
  );
}
