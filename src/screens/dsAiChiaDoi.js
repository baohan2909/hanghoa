// ============================================================================
// NEW - 3.127 SIÊU TRÍ TUỆ · phần tính thuần cho công cụ chia_doi (không React, không gọi máy chủ)
//   Dùng lại nguyên engine sẵn có: số Gợi ý (goiY) của bàn chia, quy tắc làm tròn theo giá sale (dsLamTron),
//   công thức "Ghép thùng" của Gợi ý thùng (DsGoiYThung: lấp nhu cầu tham lam, thùng phải lấp ≥ 60%).
//   Ở đây chỉ thêm: chọn số thùng trong khoảng min–max và áp ràng buộc người dùng giao (trần tồn / trần giao / bỏ mã…).
// ============================================================================
import { xuongMuc } from './dsLamTron.js';
import { nhuCauMa, layTu, tru } from './DsGoiYThung.jsx';

// ---------- so khớp mã / từ khoá: bỏ dấu, không phân biệt hoa thường ----------
export const boDau = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toUpperCase();
export function taoKhop(ds) {
  const tu = (Array.isArray(ds) ? ds : ds ? [ds] : []).map((t) => boDau(t).trim()).filter(Boolean);
  if (!tu.length) return null;
  return (x) => { const h = boDau(`${x.mtc} ${x.bc} ${x.n3 || ''} ${x.n1 || ''} ${x.hm || ''}`); return tu.some((t) => h.includes(t)); };
}

// ---------- tìm đội theo số / mã / tên ----------
export function timDoi(dsDoi, q) {
  const s = String(q ?? '').trim();
  if (!s) return null;
  const n = /^\d{1,3}$/.test(s) ? parseInt(s, 10) : (/^(?:doi|đội|doisale|đội sale|sale)\s*0*(\d{1,3})$/i.exec(s.replace(/\s+/g, ' ')) || [])[1];
  if (n != null) {
    const so = parseInt(n, 10);
    const d = dsDoi.find((x) => parseInt(String(x.ma_ch).replace(/\D/g, ''), 10) === so && /^DOISALE/i.test(x.ma_ch));
    if (d) return d;
  }
  const S = boDau(s);
  return dsDoi.find((x) => boDau(x.ma_ch) === S) || dsDoi.find((x) => boDau(x.ten) === S)
    || dsDoi.find((x) => boDau(x.ten).includes(S)) || null;
}

// ---------- chọn thùng trong khoảng [min, max] theo công thức Ghép thùng ----------
// ds: kq.ds của fn_ds_thung_goi_y (đã tính với nháp KHÔNG thùng) -> {bo:[{b, lap}], lap, cai, noi}
export function ghepTheoKhoang(ds, soMin, soMax, tranCai = Infinity) {   // tranCai: tổng cái thùng tối đa (từ trần tồn sau / trần giao)
  const max = Math.max(0, Math.min(30, Math.round(soMax ?? soMin ?? 0)));
  const min = Math.max(0, Math.min(max, Math.round(soMin ?? 0)));
  const deXuat = (ds || []).filter((b) => b.st === 'de_xuat' && (b.ct || []).length);
  let con = nhuCauMa(deXuat);
  const bo = []; let lap = 0, cai = 0, noi = 0;
  const vuotTran = new Set();
  const lam = (nguong, laNoi) => {
    while (bo.length < max) {
      let tot = null;
      deXuat.forEach((b) => {
        if (bo.some((x) => x.b.t === b.t)) return;
        if (cai + b.n > tranCai) { vuotTran.add(b.t); return; }
        const r = layTu(b, con);
        if (r.lap < nguong(b)) return;
        const k = r.lap * 1000 + (b.diem || 0);
        if (!tot || k > tot.k) tot = { b, r, k };
      });
      if (!tot) break;
      con = tru(con, tot.r.lay); lap += tot.r.lap; cai += tot.b.n;
      bo.push({ b: tot.b, lap: tot.r.lap, noi: laNoi });
      if (laNoi) noi++;
    }
  };
  lam((b) => Math.max(8, 0.6 * b.n), false);            // đúng công thức chung
  if (bo.length < min) lam((b) => Math.max(1, 0.3 * b.n), true);   // chưa đủ số tối thiểu: nới ngưỡng lấp
  if (bo.length < min) lam(() => 0, true);               // vẫn thiếu: lấy thùng điểm cao nhất còn lại
  return { bo, lap, cai, du: cai - lap, noi, soDeXuat: deXuat.length, chanTran: bo.length < max && vuotTran.size > 0 };
}

// ---------- áp ràng buộc lên số Gợi ý ----------
// dong: các dòng bàn chia (đã tính với thùng mới chọn). p: tham số công cụ. thungTong: tổng cái trong thùng hợp lệ.
// Trả { sua: {barcode: sl}, cat: [...], ghi: [...] } — sua chỉ gồm dòng trong phạm vi nguồn; dòng ngoài phạm vi giữ số cũ (xem giuNgoai)
export function apRangBuoc(dong, p = {}, thungTong = 0) {
  const nguon = p.nguon || 'tat';
  const trong = (x) => nguon === 'tat' || (nguon === 'pk') === x.pk;
  const chi = taoKhop(p.chi_ma), bo = taoKhop(p.loai_bo), uu = taoKhop(p.uu_tien);
  const ghi = [];
  const dem = { chi: 0, bo: 0, du: 0, tran: 0 };
  const ds = dong.filter(trong).map((x) => {
    let n = Math.max(0, x.goiY || 0);
    if (n > 0 && chi && !chi(x)) { n = 0; dem.chi++; }
    if (n > 0 && bo && bo(x)) { n = 0; dem.bo++; }
    if (n > 0 && p.bo_du_qua_ngay > 0 && x.v > 0 && x.nd != null && x.nd > p.bo_du_qua_ngay) { n = 0; dem.du++; }
    if (n > 0 && p.toi_da_moi_ma > 0 && n > p.toi_da_moi_ma) { n = xuongMuc(p.toi_da_moi_ma, x.qt); dem.tran++; }
    return { x, n, goc: n, uu: !!(uu && uu(x)) };
  });
  if (dem.chi) ghi.push(`Chỉ chia mã khớp ${p.chi_ma.join(', ')} — bỏ ${dem.chi} mã khác`);
  if (dem.bo) ghi.push(`Loại ${dem.bo} mã khớp ${p.loai_bo.join(', ')}`);
  if (dem.du) ghi.push(`Bỏ ${dem.du} mã đội đang đủ bán quá ${p.bo_du_qua_ngay} ngày`);
  if (dem.tran) ghi.push(`${dem.tran} mã giới hạn tối đa ${p.toi_da_moi_ma} cái/mã`);

  // cắt bớt cho vừa trần: bớt dần từng mức hợp lệ ở mã ít cần nhất (đủ ngày sau chia cao nhất), mã ưu tiên cắt sau cùng
  const catXuong = (chon, tran, ten) => {
    let tong = chon.reduce((a, r) => a + r.n, 0);
    if (tong <= tran) return 0;
    const truoc = tong;
    const ngay = (r) => (r.x.v > 0 ? (r.x.co + r.x.th + r.n) / r.x.v : 1e6 + r.n);
    while (tong > tran) {
      let toi = null;
      for (const r of chon) {
        if (r.n <= 0) continue;
        if (!toi || (toi.uu && !r.uu) || (toi.uu === r.uu && ngay(r) > ngay(toi))) toi = r;
      }
      if (!toi) break;
      const moi = xuongMuc(toi.n - 1, toi.x.qt);
      tong -= toi.n - moi; toi.n = moi;
    }
    ghi.push(`${ten}: cắt bớt ${truoc - tong} cái (mã ít cần nhất trước${uu ? ', giữ mã ưu tiên' : ''})`);
    return truoc - tong;
  };
  let tranCanh = null;
  if (p.tran_ton_sau > 0) {
    const sa = ds.filter((r) => !r.x.pk);
    const coSa = dong.filter((x) => !x.pk).reduce((a, x) => a + Math.max(0, x.co), 0);
    const conCho = p.tran_ton_sau - coSa - thungTong;
    if (conCho < 0) tranCanh = `Tồn hiện có${thungTong ? ' + thùng' : ''} (${coSa + thungTong}) đã vượt trần tồn sau ${p.tran_ton_sau} — không chia thêm hàng sale${thungTong ? '; nên bớt thùng' : ''}`;
    catXuong(sa, Math.max(0, conCho), `Trần tồn sau ${p.tran_ton_sau}`);
  }
  if (p.tran_giao > 0) {
    const conCho = p.tran_giao - thungTong;
    if (conCho < 0) tranCanh = `Riêng thùng đã ${thungTong} cái, vượt trần giao ${p.tran_giao} — nên bớt thùng`;
    catXuong(ds, Math.max(0, conCho), `Trần giao ${p.tran_giao}`);
  }
  const sua = {};
  ds.forEach((r) => { if (r.n > 0) sua[r.x.bc] = r.n; });
  const cat = ds.filter((r) => r.n < r.goc).sort((a, b) => (b.goc - b.n) - (a.goc - a.n)).slice(0, 8).map((r) => [r.x.mtc, r.goc, r.n]);
  return { sua, ghi, cat, tranCanh, uuTien: ds.filter((r) => r.uu && r.n > 0).length, trongPhamVi: new Set(ds.map((r) => r.x.bc)) };
}

// ---------- dấu vân phương án: so lúc duyệt, nháp đổi thì không chạy ----------
export function dauVan(doi, thung, sua) {
  const s = `${doi}|${[...(thung || [])].sort().join(',')}|${Object.entries(sua || {}).filter(([, v]) => v > 0).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => k + ':' + v).join(',')}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + '.' + s.length;
}

// ---------- tóm tắt bàn chia (cho AI đọc + thẻ kết quả) ----------
const r1 = (n) => (n == null ? null : Math.round(n * 10) / 10);
export function tomBan(s) {
  const { dong, tong, trongThung, thung, thungCt, doi, tenDoi, cuaSo, mucTieu, heSo, gyDs } = s;
  const coSa = tong.co;
  const dsThung = thung.map((t) => {
    const x = thungCt[t] || {};
    const g = (gyDs || []).find((b) => b.t === t);
    return { ma: t, n: (x.ct || []).filter((c) => !c.th).reduce((a, c) => a + c.s, 0) || g?.n || null, diem: g?.diem ?? null,
      loi: x.khong_co ? 'không có' : x.da_giao ? 'đã giao phiếu khác' : x.kiem ? 'đang kiểm' : null };
  });
  const canh = dong.filter((x) => x.canh.length);
  return {
    doi, ten_doi: tenDoi, tham_so: { suc_ban_ngay: cuaSo, chia_du_ngay: mucTieu, ty_le: heSo },
    truoc: { ton: coSa, du_ngay: r1(tong.ndTruoc) },
    sau: { ton: coSa + tong.th + tong.sa, du_ngay: r1(tong.ndSau) },
    chia: { sale: tong.sa, phu_kien: tong.pk, thung: tong.th, tong: tong.nhan, so_ma: tong.ma, so_ma_sale: tong.maSa, so_ma_pk: tong.maPk, so_phieu: tong.soPhieu },
    thung: dsThung,
    kiem_tra: {
      ...kiemPhuongAn(dong, tong.th),   // NEW - 3.159.2
      vuot_kho: tong.vuot, dong_can_xem: tong.canh,
      thu_hoi_rut: trongThung.rut.map((r) => `${r.t}: ${r.m} ×${r.s}`),
      mau_canh_bao: canh.slice(0, 6).map((x) => `${x.mtc}: ${x.canh[0]}`),
    },
    top: dong.filter((x) => x.them > 0).sort((a, b) => b.them - a.them).slice(0, 8).map((x) => [x.mtc, x.them, r1(x.ndSau)]),
  };
}

// ============================================================================
// NEW - 3.159.2: CHỐT THAM SỐ TỪ CHÍNH CÂU ANH NÓI — cùng câu thì ra cùng phương án
//   Lỗi cũ: AI hiểu "đủ bán 5 ngày" thành SỨC BÁN 5 ngày (số ngày lấy trung bình bán) — Chia đủ giữ nguyên 7,
//   trung bình bán chỉ lấy 3–5 ngày gần nhất -> mỗi lần một kiểu. Giờ đọc số bằng quy tắc cố định (không đoán):
//     "đủ (bán) N ngày", "bán được N ngày", "chia đủ N ngày"         -> Chia đủ N
//     "sức bán N ngày", "trung bình N ngày", "bán N ngày gần nhất"     -> Sức bán N   (không nói -> mặc định 28 ngày)
//     "tỷ lệ N%"                                                      -> Tỷ lệ N     (không nói -> 100%)
//     "N thùng", "N–M thùng"                                          -> lấy đúng N (N–M) thùng
//     "không lấy thùng", "bỏ thùng" / câu không nhắc thùng            -> không dùng thùng (không lấy thùng còn sót trên bàn)
// ============================================================================
const SO_CHU = { mot: 1, hai: 2, ba: 3, bon: 4, tu: 4, nam: 5, lam: 5, sau: 6, bay: 7, tam: 8, chin: 9, muoi: 10 };
const SO = '(\\d{1,3}|mot|hai|ba|bon|tu|nam|lam|sau|bay|tam|chin|muoi)';
const docSo = (x) => (/^\d+$/.test(x) ? parseInt(x, 10) : SO_CHU[x] ?? null);
const thuong = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[,.;:!?]/g, ' ').replace(/\s+/g, ' ');

export function docYeuCau(text) {
  const t = ' ' + thuong(text) + ' ';
  const r = {};
  // nhiều đội trong 1 câu với số ngày khác nhau ("đội 1 đủ 5 ngày, đội 2 đủ 7 ngày") -> không ép, để AI gán từng đội
  const ds1 = [...new Set([...t.matchAll(new RegExp(`\\b(?:chia\\s+)?(?:du|ban\\s+duoc)\\s+(?:ban\\s+)?(?:duoc\\s+)?(?:trong\\s+)?(?:vong\\s+)?(?:khoang\\s+)?(?:tam\\s+)?${SO}\\s*ngay\\b`, 'g'))].map((m) => docSo(m[1])))];
  if (ds1.length === 1) r.chia_du_ngay = ds1[0];
  const m2 = new RegExp(`\\b(?:suc\\s+ban|trung\\s+binh|tinh\\s+ban|lay\\s+ban)\\s+(?:theo\\s+)?(?:trong\\s+)?(?:vong\\s+)?(?:cua\\s+)?${SO}\\s*ngay\\b`).exec(t)
    || new RegExp(`\\bban\\s+${SO}\\s*ngay\\s+(?:gan\\s+(?:day|nhat)|qua|vua\\s+qua)\\b`).exec(t);
  if (m2) r.suc_ban_ngay = docSo(m2[1]);
  const m3 = /\bty\s*le\s+(\d{1,3})\b/.exec(t);
  if (m3) r.ty_le = parseInt(m3[1], 10);
  r.noi_thung = /\bthung\b/.test(t);
  r.khong_thung = /\b(?:khong\s+(?:lay\s+|dung\s+|can\s+|chia\s+|lay\s+hang\s+)?thung|bo\s+(?:het\s+)?(?:cac\s+)?thung)\b/.test(t);
  const m4 = new RegExp(`\\b${SO}\\s*(?:-|den|toi|hoac)\\s*${SO}\\s*thung\\b`).exec(t);
  const ds5 = [...new Set([...t.matchAll(new RegExp(`\\b${SO}\\s*thung\\b`, 'g'))].map((m) => m[1]))];
  const m5 = ds5.length === 1 ? new RegExp(`\\b${SO}\\s*thung\\b`).exec(t) : null;
  if (!r.khong_thung && m4) { const a = docSo(m4[1]), b = docSo(m4[2]); if (a != null && b != null) r.thung = { so_min: Math.min(a, b), so_max: Math.max(a, b) }; }
  else if (!r.khong_thung && m5) { const a = docSo(m5[1]); if (a != null) r.thung = { so_min: a, so_max: a }; }
  return r;
}

// p: tham số AI đưa · text: câu anh nói · mac: { cua_so, ty_le } mặc định · man: { mucTieu } số đang trên bàn
// -> { p: tham số chốt (luôn đủ 3 số), nguon: { chia_du, suc_ban, ty_le, thung }, sua_ai: [...ghi lại chỗ AI hiểu khác câu nói] }
export function chotThamSo(p = {}, text = '', mac = {}, man = {}) {
  const c = docYeuCau(text);
  const q = { ...p };
  const nguon = {}, suaAi = [];
  const kep = (v, a, b) => Math.max(a, Math.min(b, Math.round(+v)));
  // Chia đủ: câu nói > AI > số đang trên bàn
  if (c.chia_du_ngay) { if (p.chia_du_ngay && +p.chia_du_ngay !== c.chia_du_ngay) suaAi.push(`Chia đủ ${p.chia_du_ngay} → ${c.chia_du_ngay} ngày`); q.chia_du_ngay = c.chia_du_ngay; nguon.chia_du = 'cau'; }
  else if (p.chia_du_ngay) nguon.chia_du = 'ai';
  else { q.chia_du_ngay = man.mucTieu || 21; nguon.chia_du = 'ban'; }
  // Sức bán: CHỈ khi câu nói có "sức bán / trung bình N ngày"; còn lại luôn = mặc định (không lấy số AI đoán, không lấy số còn sót trên bàn)
  if (c.suc_ban_ngay) { q.suc_ban_ngay = c.suc_ban_ngay; nguon.suc_ban = 'cau'; }
  else {
    if (p.suc_ban_ngay && +p.suc_ban_ngay !== (mac.cua_so || 28)) suaAi.push(`Bỏ "Sức bán ${p.suc_ban_ngay} ngày" (anh không nói sức bán) → dùng mặc định ${mac.cua_so || 28} ngày`);
    q.suc_ban_ngay = mac.cua_so || 28; nguon.suc_ban = 'mac_dinh';
  }
  // Tỷ lệ: câu nói > AI (sửa phương án) > 100%
  if (c.ty_le) { q.ty_le = c.ty_le; nguon.ty_le = 'cau'; }
  else if (p.ty_le) nguon.ty_le = 'ai';
  else { q.ty_le = mac.ty_le || 100; nguon.ty_le = 'mac_dinh'; }
  q.chia_du_ngay = kep(q.chia_du_ngay, 1, 180); q.suc_ban_ngay = kep(q.suc_ban_ngay, 1, 180); q.ty_le = kep(q.ty_le, 10, 300);
  // Thùng
  if (c.khong_thung) { q.bo_thung = true; delete q.thung; delete q.ma_thung; nguon.thung = 'cau'; }
  else if (c.thung) {
    if (p.thung && (p.thung.so_min !== c.thung.so_min || p.thung.so_max !== c.thung.so_max)) suaAi.push(`Số thùng ${p.thung.so_min}–${p.thung.so_max} → ${c.thung.so_min}–${c.thung.so_max}`);
    q.thung = c.thung; delete q.bo_thung; delete q.ma_thung; nguon.thung = 'cau';
  } else if ((p.ma_thung || []).length || p.thung) { delete q.bo_thung; nguon.thung = 'ai'; }
  else { q.bo_thung = true; nguon.thung = c.noi_thung ? 'ai' : 'khong_noi'; }
  return { p: q, nguon, suaAi };
}

// ============================================================================
// NEW - 3.159.2: KIỂM TRA PHƯƠNG ÁN — nhìn là biết chia đúng / sai (dùng chung thẻ SIÊU TRÍ TUỆ + màn điện thoại)
//   Chỉ tính mã ĐANG BÁN (bỏ mã thu hồi, túi): sau chia có đủ "Chia đủ" ngày không.
//   Thùng: phần nào đúng nhu cầu đội (≤ cần trước khi có thùng), phần nào dư.
// ============================================================================
export const laMaBan = (x) => x.ban > 0 && !x.thuHoi && x.qt?.loai !== 'tui';
export function kiemPhuongAn(dong, thungTong = 0) {
  const k = { ma_ban: 0, thieu_truoc: 0, dat_sau: 0, thieu_sau: 0, thieu_kho: 0, thieu_chua_chia: 0, cai_thieu: 0,
    thung_dung: 0, thung_du: 0, nhan_khong_ban: 0, vuot_kho: 0, canh: 0 };
  dong.forEach((x) => {
    if (x.khoCon < 0) k.vuot_kho++;
    if (x.canh?.length) k.canh++;
    if (x.th > 0) k.thung_dung += Math.min(x.th, Math.max(0, x.muc - x.co));
    if (laMaBan(x)) {
      k.ma_ban++;
      if (x.co < x.muc) k.thieu_truoc++;
      if (x.co + x.nhan >= x.muc) k.dat_sau++;
      else { k.thieu_sau++; k.cai_thieu += x.muc - x.co - x.nhan; if (x.thieu > 0) k.thieu_kho++; else k.thieu_chua_chia++; }
    } else if (x.nhan > 0 && x.ban === 0 && !x.pk) k.nhan_khong_ban++;
  });
  k.thung_du = Math.max(0, thungTong - k.thung_dung);
  return k;
}
// đánh giá 1 dòng: ok | thieu | vuot | canh | '' (không bán, không nhận)
export function danhGiaDong(x) {
  if (x.khoCon < 0) return 'vuot';
  if (laMaBan(x)) {
    if (x.co + x.nhan < x.muc) return 'thieu';
    return x.canh?.length ? 'canh' : 'ok';
  }
  if (x.canh?.length) return 'canh';
  return x.nhan > 0 ? 'ok' : '';
}
