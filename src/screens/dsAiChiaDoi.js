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
      vuot_kho: tong.vuot, dong_can_xem: tong.canh,
      thu_hoi_rut: trongThung.rut.map((r) => `${r.t}: ${r.m} ×${r.s}`),
      mau_canh_bao: canh.slice(0, 6).map((x) => `${x.mtc}: ${x.canh[0]}`),
    },
    top: dong.filter((x) => x.them > 0).sort((a, b) => b.them - a.them).slice(0, 8).map((x) => [x.mtc, x.them, r1(x.ndSau)]),
  };
}
