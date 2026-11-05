// ĐẤU TRƯỜNG NÓN SƠN — khuôn 5 vòng + sinh đề từ bộ câu hỏi sẵn có của Đấu trường.
// Đề sinh ở máy Admin (dùng lại các hàm sinh câu của DauTruong.jsx, truyền vào qua `sinh`),
// rồi gửi lên máy chủ khoá lại. Người chơi KHÔNG bao giờ nhận đáp án trước giờ công bố.

export const VONG = [
  { so: 1, ten: 'Khởi động', mo: 'Kiến thức sản phẩm cơ bản — giá, mã, ngành, hình.',
    luat: ['8 câu · 15 giây/câu', 'Đúng +100 điểm', 'Sai không bị trừ'] },
  { so: 2, ten: 'Quan sát & ghi nhớ', mo: 'Kệ hàng hiện 6 giây rồi biến mất — nhớ hình, tên và giá.',
    luat: ['3 kệ × 2 câu · 12 giây/câu', 'Đúng +150 điểm', 'Kệ chỉ hiện một lần'] },
  { so: 3, ten: 'Phản xạ nhanh', mo: 'ĐÚNG hay SAI — bấm thật nhanh.',
    luat: ['10 câu · 7 giây/câu', 'Đúng +100 và thưởng tốc độ tới +100', 'Sai −30 · 3 câu đúng liền ×1,5'] },
  { so: 4, ten: 'Tình huống', mo: 'Tư vấn khách và xử lý tình huống tại cửa hàng.',
    luat: ['5 câu · 25 giây/câu', 'Đúng +200 điểm', 'Đọc kỹ nhu cầu của khách'] },
  { so: 5, ten: 'Quyết định', mo: 'Đặt cược trước mỗi câu — dám chắc thì dám cược.',
    luat: ['5 câu · 15 giây/câu', 'Đúng +250 + tốc độ ± tiền cược', 'Câu cuối là CÂU VÀNG ×2'] },
];

// cấu hình từng câu theo vòng (CK = chung kết: khó hơn một bậc, cược lớn hơn)
export function khuon(ck = false) {
  const k = [];
  const cap = (c) => Math.min(3, c + (ck ? 1 : 0));
  for (let i = 0; i < 8; i++) k.push({ vong: 1, giay: 15, diem: 100, sai: 0, cap: cap(i < 4 ? 0 : 1) });
  for (let i = 0; i < 6; i++) k.push({ vong: 2, giay: 12, diem: 150, sai: 0, truoc_ms: i % 2 === 0 ? 6000 : 0 });
  for (let i = 0; i < 10; i++) k.push({ vong: 3, giay: 7, diem: 100, sai: 30, toc_do: true, chuoi: true });
  for (let i = 0; i < 5; i++) k.push({ vong: 4, giay: 25, diem: 200, sai: 0, cap: cap(2) });
  for (let i = 0; i < 5; i++) k.push({ vong: 5, giay: 15, diem: 250, sai: 0, toc_do: true, cuoc: true,
    cuoc_muc: ck ? [0, 100, 200] : [0, 50, 100], vang: i === 4, truoc_ms: 4000, cap: 3 });
  return k;
}

// Ước thời lượng phiên (khớp cách máy chủ tính): 15s giới thiệu/nghỉ mỗi vòng + công bố 4s (3s nếu câu < 10s)
export function thoiLuongMs(de) {
  let t = 0, truoc = 0;
  for (const q of de) {
    if (q.vong !== truoc) t += 15000;
    t += (q.truoc_ms || 0) + q.giay * 1000 + (q.giay < 10 ? 3000 : 4000);
    truoc = q.vong;
  }
  return t;
}

const xaoTron = (a) => { const v = [...a]; for (let i = v.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [v[i], v[j]] = [v[j], v[i]]; } return v; };

// ---------- chuẩn hoá câu từ các bộ sinh cũ sang khuôn máy chủ ----------
function tuCauThuong(c) {
  const dung = c.dapAn.findIndex((d) => d.dung);
  if (dung < 0) return null;
  const o = { loai: c.loai, hoi: c.hoi, dung,
    dapAn: c.dapAn.map((d) => { const x = {}; if (d.nhan) x.nhan = String(d.nhan); if (d.hinh) x.hinh = d.hinh; return x; }) };
  if (c.hinh) o.hinh = c.hinh;
  if (c.giaiThich) o.giai = c.giaiThich;
  return o;
}
function tuCauDS(c, fmtVND) {
  const o = { loai: 'DS', hoi: 'Thông tin dưới đây ĐÚNG hay SAI?', the: { ten: c.phatBieu.ten, dong: c.phatBieu.dong },
    dapAn: [{ nhan: 'ĐÚNG' }, { nhan: 'SAI' }], dung: c.dung ? 0 : 1 };
  if (c.hinh) o.hinh = c.hinh;
  if (!c.dung && c.sp) {
    o.giai = /^Ngành/.test(c.phatBieu.dong)
      ? `“${c.sp.ten}” thuộc ngành ${c.sp.nganh_3}.`
      : `Giá niêm yết đúng là ${fmtVND(c.sp.gia)}.`;
  }
  return o;
}
function tuBoKyUc(bo, fmtVND) {
  const ke = bo.ke.map((sp) => ({ hinh: sp.hinh, ten: sp.ten, gia: fmtVND(sp.gia) }));
  return bo.cauHoi.slice(0, 2).map((q, i) => {
    const o = { loai: 'KY', hoi: q.hoi, dung: q.dapAn.findIndex((d) => d.dung),
      dapAn: q.dapAn.map((d) => (d.hinh ? { hinh: d.hinh } : { nhan: d.nhan })) };
    if (i === 0) o.ke = ke;
    return o;
  });
}
function tuKhachTV(kh, fmtGiaKT) {
  const lua = [kh.dich, ...xaoTron(kh.luaChon.filter((x) => x !== kh.dich)).slice(0, 3)];
  const ds = xaoTron(lua);
  const nhan = (x) => {
    const d = x.du_lieu || {};
    return [d.ma, d.chu_de, d.cl, fmtGiaKT(d.gia)].filter(Boolean).join(' · ');
  };
  const dd = kh.dich.du_lieu || {};
  return { loai: 'TV', hoi: `${kh.khach} vào cửa hàng: ${kh.tieuChi.join(', ')}. Bạn tư vấn mã nào phù hợp nhất?`,
    dapAn: ds.map((x) => ({ nhan: nhan(x) })), dung: ds.indexOf(kh.dich),
    giai: `${dd.ma} khớp đủ nhu cầu: ${kh.tieuChi.join(', ')}.` };
}

// dạng câu dựa số liệu bán/tồn: tối đa 1 câu mỗi loại trong cả đề
const MOT_LAN = new Set(['BANCHAY', 'CHAYHANG', 'TONNHIEU']);

// ---------- sinh 1 câu cho một ô của khuôn ----------
function sinhMot(o, ctx) {
  const { sinh, sp, kt } = ctx;
  if (o.vong === 1 || o.vong === 5 || o.loaiDuPhong) {
    for (let t = 0; t < 6; t++) {
      const c = sinh.sinhCau(sp, ctx.daDung, ctx.daCau, o.cap ?? 0, ctx.loaiTruoc.slice(-2));
      if (!c) continue;
      if (MOT_LAN.has(c.loai)) { if (ctx.motLan.has(c.loai)) continue; ctx.motLan.add(c.loai); }
      if (c.sp) ctx.daDung.add(c.sp.barcode);
      ctx.daCau.add(c.chuKy); ctx.loaiTruoc.push(c.loai);
      const x = tuCauThuong(c); if (x) return { cau: x, nguon: 'Sản phẩm · ' + c.loai, ky: c.chuKy, bc: c.sp?.barcode };
    }
    return null;
  }
  if (o.vong === 3) {
    const c = sinh.sinhCauDS(sp, ctx.daKy);
    return c ? { cau: tuCauDS(c, sinh.fmtVND), nguon: 'Đúng/Sai · ' + (/^Ngành/.test(c.phatBieu.dong) ? 'ngành' : 'giá') } : null;
  }
  if (o.vong === 4) {
    // ưu tiên: ngân hàng câu tình huống (Admin soạn) -> khách tư vấn -> kiến thức -> câu sản phẩm khó
    const nh = ctx.nganHang.shift();
    if (nh) return { cau: nh.cau, nguon: 'Ngân hàng · ' + (nh.chu_de || 'tình huống'), nh_id: nh.id };
    if (ctx.soTV < 2 && kt.length) {
      const kh = sinh.sinhKhachTV(kt, ctx.daKy);
      if (kh) { ctx.soTV++; return { cau: tuKhachTV(kh, sinh.fmtGiaKT), nguon: 'Tư vấn khách' }; }
    }
    if (kt.length) {
      const c = sinh.sinhCauKienThuc(kt, ctx.daKy);
      if (c) return { cau: tuCauThuong(c), nguon: 'Kiến thức sản phẩm' };
    }
    return sinhMot({ ...o, loaiDuPhong: true }, ctx);
  }
  return null;
}

function taoCtx(sinh, pools, daDungDe = []) {
  const nh = xaoTron((pools.nganHang || []).filter((q) => q.trang_thai === 'DUNG' && (q.vong == null || q.vong === 4)))
    .sort((a, b) => (a.so_lan_ra || 0) - (b.so_lan_ra || 0));
  return { sinh, sp: pools.sp || [], kt: pools.kt || [], nganHang: nh.slice(0, 2).filter((q) => !daDungDe.includes(q.id)),
    daDung: new Set(), daCau: new Set(), daKy: new Set(), daKyUc: new Set(), loaiTruoc: [], soTV: 0, motLan: new Set() };
}

const ghep = (o, r) => ({
  vong: o.vong, giay: o.giay, diem: o.diem, sai: o.sai || 0, toc_do: !!o.toc_do, chuoi: !!o.chuoi,
  cuoc: !!o.cuoc, cuoc_muc: o.cuoc_muc || [0, 50, 100], vang: !!o.vang, truoc_ms: o.truoc_ms || 0,
  cau: r.cau, nguon: r.nguon, ...(r.nh_id ? { nh_id: r.nh_id } : {}), ...(r.ky ? { ky: r.ky, bc: r.bc } : {}),
});

// SINH TRỌN ĐỀ 34 câu. pools = { sp: fn_thi_pool, kt: fn_kt_pool, nganHang: fn_dt_ad_cau_ds }
export function sinhDe(sinh, pools, ck = false) {
  const k = khuon(ck);
  const ctx = taoCtx(sinh, pools);
  const de = [];
  for (let i = 0; i < k.length; i++) {
    const o = k[i];
    if (o.vong === 2) {
      if (i > 0 && k[i - 1].vong === 2 && i % 2 === 1) continue;   // ô thứ 2 của bộ đã sinh cùng ô 1
      const bo = sinh.sinhBoKyUc(ctx.sp, ctx.daKyUc);
      if (!bo) throw new Error('Không đủ sản phẩm có hình để dựng kệ (vòng 2)');
      const [a, b] = tuBoKyUc(bo, sinh.fmtVND);
      de.push(ghep(o, { cau: a, nguon: 'Kệ hàng · câu 1' }), ghep(k[i + 1], { cau: b, nguon: 'Kệ hàng · câu 2' }));
      continue;
    }
    const r = sinhMot(o, ctx);
    if (!r) throw new Error(`Không sinh được câu ${i + 1} (vòng ${o.vong}) — kho câu chưa đủ`);
    de.push(ghep(o, r));
  }
  return de;
}

// ĐỔI 1 câu (vòng 2 đổi cả cặp cùng kệ). Trả đề mới.
export function doiCau(sinh, pools, de, idx) {
  const q = de[idx];
  const ctx = taoCtx(sinh, pools, de.map((x) => x.nh_id).filter(Boolean));
  de.forEach((x, j) => { if (x.ky) ctx.daCau.add(x.ky); if (x.bc) ctx.daDung.add(x.bc); if (j !== idx && MOT_LAN.has(x.cau?.loai)) ctx.motLan.add(x.cau.loai); });
  const o = { ...q };
  const moi = [...de];
  if (q.vong === 2) {
    const dau = q.cau.ke ? idx : idx - 1;
    const bo = sinh.sinhBoKyUc(ctx.sp, ctx.daKyUc);
    if (!bo) throw new Error('Không đủ sản phẩm có hình để dựng kệ');
    const [a, b] = tuBoKyUc(bo, sinh.fmtVND);
    moi[dau] = { ...de[dau], cau: a, nguon: 'Kệ hàng · câu 1' };
    moi[dau + 1] = { ...de[dau + 1], cau: b, nguon: 'Kệ hàng · câu 2' };
    return moi;
  }
  if (q.vong === 4 && q.nh_id) ctx.nganHang = [];      // đang là câu ngân hàng -> đổi sang câu tự sinh
  const cap = q.vong === 1 ? (idx < 4 ? 0 : 1) : q.vong === 5 ? 3 : 2;
  const r = sinhMot({ ...o, cap: Math.min(3, cap + (q.cuoc_muc && q.cuoc_muc[2] === 200 ? 1 : 0)) }, ctx);
  if (!r) throw new Error('Kho câu đã cạn cho vị trí này');
  const { nh_id, ky, bc, ...con } = q;   // eslint-disable-line no-unused-vars
  moi[idx] = { ...con, cau: r.cau, nguon: r.nguon, ...(r.nh_id ? { nh_id: r.nh_id } : {}), ...(r.ky ? { ky: r.ky, bc: r.bc } : {}) };
  return moi;
}
