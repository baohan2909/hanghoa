import { useEffect, useMemo, useRef, useState } from 'react';
import { sb, rpcHet } from '../lib/supabase.js';
import { IcTrophy, IcFlash, IcTarget, IcHeart, IcRefresh } from '../lib/icons.jsx';
import { DateBox, isoVN } from '../lib/ui.jsx';
import { useApp } from '../App.jsx';

// ĐẤU TRƯỜNG — thi đua kiến thức sản phẩm toàn hệ thống.
// 3 chế độ: TOCDO 60s · CHINHXAC 90s (sai -50) · SINHTON 3 mạng, 7s/câu.
// Câu hỏi sinh client từ pool san_pham (fn_thi_pool): giá / tên từ hình / ngành / so sánh giá.
// Điểm = (100 + bonus nhanh tối đa 50) × hệ số combo (1 + 0.1×combo, trần ×2).

const CHE_DO = {
  TOCDO:    { ten: 'Tốc độ',     Ic: IcFlash,  giay: 60,  mota: '60 giây — trả lời càng nhiều càng tốt. Sai không trừ điểm nhưng mất chuỗi combo.' },
  CHINHXAC: { ten: 'Chính xác',  Ic: IcTarget, giay: 90,  mota: '90 giây — đúng +điểm, sai −50. Dành cho người chắc kiến thức.' },
  SINHTON:  { ten: 'Sinh tồn',   Ic: IcHeart,  giay: 0,   mota: 'Không giới hạn giờ — 3 mạng, mỗi câu chỉ 7 giây. Sai hoặc hết giờ mất 1 mạng.' },
  DAILY:    { ten: 'Thử thách ngày', Ic: IcTrophy, giay: 0, mota: 'Mỗi ngày 1 đề — 10 câu GIỐNG NHAU cho cả hệ thống, mỗi người chỉ thi 1 lần. So kè công bằng tuyệt đối.' },
};
const DAILY_SO_CAU = 10;
const HUY_HIEU = {
  TAN_BINH:   { ten: 'Tân binh',      mota: 'Hoàn thành lượt thi đầu tiên' },
  CHIEN_BINH: { ten: 'Chiến binh',    mota: 'Thi đấu 50 lượt' },
  THIEN_XA:   { ten: 'Thiện xạ',      mota: 'Chính xác ≥90% (từ 100 câu)' },
  COMBO_10:   { ten: 'Chuỗi ×10',     mota: 'Đạt combo 10 câu liên tiếp' },
  VUA_TOC_DO: { ten: 'Vua tốc độ',    mota: 'Tốc độ đạt 3.000 điểm' },
  BAT_TU:     { ten: 'Bất tử',        mota: 'Sinh tồn đạt 2.500 điểm' },
  CHUYEN_CAN: { ten: 'Chuyên cần',    mota: 'Thi đấu 5 ngày khác nhau' },
};
const fmtVND = (n) => Number(n).toLocaleString('vi') + ' đ';
// Lịch sử câu đã ra qua các VÁN GẦN ĐÂY (localStorage) — để ván mới luôn mới mẻ.
const LS_KEY = 'dt_lichsu_cau';
const LS_MAX = 220;   // nhớ ~220 câu gần nhất
function loadLichSu() {
  try { const a = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); return Array.isArray(a) ? a : []; }
  catch { return []; }
}
function luuLichSu(chuKys) {
  try {
    const cu = loadLichSu();
    // câu mới lên đầu, khử trùng, cắt còn LS_MAX
    const gop = [...chuKys, ...cu];
    const uniq = [...new Set(gop)].slice(0, LS_MAX);
    localStorage.setItem(LS_KEY, JSON.stringify(uniq));
  } catch { /* localStorage đầy/tắt -> bỏ qua, không lỗi game */ }
}
const goc = (u) => (typeof u === 'string' && /^https?:\/\//.test(u.trim())) ? u.trim() : '';
// Ảnh gốc lỗi -> đánh dấu sẵn (không khung vỡ).
function falbackGoc(e) { e.currentTarget.classList.add('san'); }
// Dùng ẢNH GỐC trực tiếp — bản proxy load chậm/lỗi hơn với ảnh nonson.vn.
const nenHinh = (u) => goc(u);
const xao = (a) => { const v = [...a]; for (let i = v.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [v[i], v[j]] = [v[j], v[i]]; } return v; };
const lay = (a, n, loai) => xao(a.filter((x) => x !== loai)).slice(0, n);

// ============================================================
// BỘ SINH CÂU HỎI v2 — cấp độ tăng dần, chống trùng tuyệt đối, không phụ kiện.
// Cấp độ theo tiến trình ván: câu 1-4 Cấp 1 (dễ) -> 5-8 Cấp 2 -> 9-12 Cấp 3 -> 13+ Cấp 4.
// Càng lên cấp: đáp án nhiễu càng GẦN đáp án đúng (giá sát hơn, mã cùng dòng khác màu).
// ============================================================

// Bảng MÃ MÀU trong mã sản phẩm (NS008ATG-ĐN052-L -> ĐN = Đen).
// Chỉ dùng mã màu ĐÃ XÁC NHẬN — mã lạ không sinh câu màu (tránh sai đáp án).
const MAU_MA = { 'ĐN': 'Đen', 'TR': 'Trắng', 'XM': 'Xám', 'BG': 'Vàng',
  'HG': 'Hồng', 'ĐO': 'Đỏ', 'NU': 'Nâu', 'XH': 'Xanh' };

// Phân tích mã: NS008ATG-ĐN052-L -> {dong:NS008ATG, mau:ĐN, so:052, size:L}
// Chấp nhận cả NS00807T-XH-463 (màu tách riêng) và MC025F-XR1 (không size).
const SIZES = new Set(['S', 'M', 'L', 'XL', 'XXL', 'F']);
function phanTichMa(ten) {
  if (typeof ten !== 'string' || !ten.includes('-')) return null;
  const parts = ten.trim().split('-');
  let size = '';
  if (parts.length > 1 && SIZES.has(parts[parts.length - 1])) size = parts.pop();
  const dong = parts[0];
  let mau = '', so = '';
  for (let i = 1; i < parts.length; i++) {
    const m = parts[i].match(/^([A-ZĐ]{2})(\d*)$/);
    if (m) { mau = m[1]; so = m[2] || (parts[i + 1] || ''); break; }
  }
  return { dong, mau, so, size };
}
// Khóa "mẫu" = dòng+màu+số (bỏ size) — nhiễu KHÔNG được trùng mẫu với đáp án
// (khác mỗi size thì mắt thường không phân biệt được).
const khoaMau = (ten) => { const p = phanTichMa(ten); return p ? `${p.dong}|${p.mau}|${p.so}` : ten; };

// ---- Sinh 1 câu hỏi: pool, sp đã dùng, chữ ký câu đã ra, cấp độ 0-3 ----
function sinhCau(pool, daDung, daCau, capDo = 0, loaiTruoc = []) {
  const hopLeHinh = (u) => typeof u === 'string' && /^https?:\/\//.test(u.trim());

  // Thử tối đa 30 lần tìm câu CHƯA TỪNG RA trong ván (chữ ký loai|đáp án đúng)
  for (let lan = 0; lan < 30; lan++) {
    const ung = pool.filter((s) => !daDung.has(s.barcode));
    const sp = (ung.length ? ung : pool)[Math.floor(Math.random() * (ung.length ? ung.length : pool.length))];
    const coHinh = hopLeHinh(sp.hinh_url);
    const pt = phanTichMa(sp.ten);

    // ---- DANH MỤC DẠNG CÂU THEO CẤP ----
    // Ưu tiên HÌNH. Câu BÁN/TỒN chỉ 1 vé mỗi loại (hiếm).
    // KHÔNG hỏi màu trực tiếp (quá dễ) — dùng mã màu để TẠO NHIỄU gần giống,
    // buộc nhìn hình kỹ mới phân biệt (TEN/CHON_HINH cấp cao lấy nhiễu cùng dòng khác màu).
    const loai = [];
    const chonHinhDs = pool.filter((x) => hopLeHinh(x.hinh_url));
    const duHinh = chonHinhDs.length >= 4;
    if (capDo === 0) {
      loai.push('GIA', 'NGANH');
      if (coHinh) loai.push('TEN', 'TEN');
      if (duHinh) loai.push('CHON_HINH', 'CHON_HINH');
      loai.push('BANCHAY');                               // 1 vé
    } else if (capDo === 1) {
      loai.push('GIA');
      if (coHinh) loai.push('TEN', 'TEN_KHO');
      if (duHinh) loai.push('CHON_HINH', 'CHON_HINH', 'SOSANH');
      loai.push('BANCHAY');                               // 1 vé
    } else if (capDo === 2) {
      loai.push('GIA');
      if (coHinh) loai.push('TEN_KHO', 'TEN_KHO', 'TEN_KHO');
      if (duHinh) loai.push('SOSANH', 'CHON_HINH_KHO', 'CHON_HINH_KHO', 'GIA_HINH', 'CHON_SAI_DONG');
      if (pt && MAU_MA[pt.mau] && coHinh) loai.push('MA_NGUOC');
      loai.push('CHAYHANG');                              // 1 vé
    } else {
      if (coHinh) loai.push('TEN_KHO', 'TEN_KHO', 'TEN_KHO');
      if (duHinh) loai.push('CHON_HINH_KHO', 'CHON_HINH_KHO', 'CHON_HINH_KHO', 'SOSANH_GAN', 'GIA_HINH', 'XEP_GIA_HINH', 'CHON_SAI_DONG', 'CHON_RE_HINH');
      if (pt && MAU_MA[pt.mau] && coHinh) loai.push('MA_NGUOC', 'MA_NGUOC');
      loai.push('GIA', 'TONNHIEU_NGANH');                 // 1 vé mỗi loại
    }
    // CẤU TRÚC ĐỔI LIÊN TỤC: tránh lặp dạng câu 2 câu gần nhất (nếu còn dạng khác để chọn).
    // GIA/TEN_KHO/CHON_HINH_KHO gộp chung "họ" để không ra 3 câu-hình hay 3 câu-giá liền nhau.
    const hoCua = (x) => x === 'GIA' || x === 'GIA_HINH' ? 'GIA'
      : (x === 'TEN' || x === 'TEN_KHO') ? 'TEN'
      : (x === 'CHON_HINH' || x === 'CHON_HINH_KHO') ? 'CHONHINH'
      : (x === 'XEP_GIA_HINH' || x === 'CHON_RE_HINH') ? 'XEPGIA'
      : x;
    const hoTruoc = new Set(loaiTruoc.map(hoCua));
    const loaiKhac = loai.filter((x) => !hoTruoc.has(hoCua(x)));
    const nguon = loaiKhac.length ? loaiKhac : loai;   // nếu lọc hết thì dùng nguyên
    const l = nguon[Math.floor(Math.random() * nguon.length)];
    const cau = thuSinh(l, sp, pool, capDo, coHinh, pt);
    if (!cau) continue;
    const kyDung = cau.dapAn.find((d) => d.dung)?.nhan || cau.dapAn.find((d) => d.dung)?.hinhGoc || cau.sp?.barcode || '';
    cau.chuKy = `${cau.loai}|${kyDung}`;
    if (daCau.has(cau.chuKy)) continue;   // câu này RA RỒI -> thử câu khác
    return cau;
  }
  return null;   // pool cạn câu mới (rất hiếm) -> caller xử lý
}

function thuSinh(l, sp, pool, capDo, coHinh, pt) {
  const hopLeHinh = (u) => typeof u === 'string' && /^https?:\/\//.test(u.trim());
  const gia = Number(sp.gia);

  if (l === 'GIA') {
    // NHIỄU = giá THẬT của sản phẩm khác (đúng giá Nón Sơn, không phải số lẻ bịa).
    // Càng lên cấp, nhiễu càng gần giá đúng (dễ nhầm hơn).
    const bien = [[0.3, 0.9], [0.15, 0.35], [0.08, 0.2], [0.04, 0.14]][capDo];
    const giaThat = [...new Set(pool.filter((x) => x.barcode !== sp.barcode && Number(x.gia) > 0
      && Number(x.gia) !== gia).map((x) => Number(x.gia)))];
    // lọc giá thật trong khoảng lệch mong muốn
    const trongKhoang = giaThat.filter((g) => {
      const d = Math.abs(g - gia) / gia; return d >= bien[0] && d <= bien[1];
    });
    let nhieu = xao(trongKhoang.length >= 3 ? trongKhoang : giaThat).slice(0, 3);
    // nếu pool thiếu giá thật -> bù bằng giá làm tròn 1000 (vẫn dạng giá niêm yết)
    if (nhieu.length < 3) {
      const bu = new Set(nhieu); let thu = 0;
      while (bu.size < 3 && thu < 40) { thu++;
        const pct = bien[0] + Math.random() * (bien[1] - bien[0]);
        const g = Math.round(gia * (Math.random() < 0.5 ? 1 - pct : 1 + pct) / 1000) * 1000;
        if (g > 0 && g !== gia) bu.add(g);
      }
      nhieu = [...bu].slice(0, 3);
    }
    if (nhieu.length < 3) return null;
    return { loai: l, hoi: `Giá niêm yết của “${sp.ten}” là?`, sp,
      dapAn: xao([{ nhan: fmtVND(gia), dung: true }, ...nhieu.map((g) => ({ nhan: fmtVND(g), dung: false }))]) };
  }

  if (l === 'NGANH') {
    if (!sp.nganh_3) return null;
    const dsN = [...new Set(pool.map((x) => x.nganh_3).filter(Boolean))];
    const nhieu = lay(dsN, 3, sp.nganh_3);
    if (nhieu.length < 3) return null;
    return { loai: l, hoi: `“${sp.ten}” thuộc ngành hàng nào?`, sp,
      dapAn: xao([{ nhan: sp.nganh_3, dung: true }, ...nhieu.map((t) => ({ nhan: t, dung: false }))]) };
  }

  if (l === 'TEN') {
    // DỄ: nhiễu KHÁC DÒNG (nhìn khác hẳn) — nhưng vẫn cùng ngành cho hợp lý
    if (!coHinh) return null;
    const khac = pool.filter((x) => x.barcode !== sp.barcode
      && (!pt || !phanTichMa(x.ten) || phanTichMa(x.ten).dong !== pt.dong));
    const nhieu = lay(khac.map((x) => x.ten), 3);
    if (nhieu.length < 3) return null;
    return { loai: l, hoi: 'Sản phẩm trong hình là mã nào?', sp, hinh: nenHinh(sp.hinh_url),
      dapAn: xao([{ nhan: sp.ten, dung: true }, ...nhieu.map((t) => ({ nhan: t, dung: false }))]) };
  }

  if (l === 'TEN_KHO') {
    // KHÓ: nhiễu CÙNG DÒNG khác màu. Ưu tiên nhiễu CÙNG SỐ chỉ KHÁC MÀU
    // (NS008ATG-ĐN052 vs NS008ATG-TR052) — khác đúng 2 ký tự màu, cực dễ nhầm.
    // TUYỆT ĐỐI không lấy nhiễu trùng mẫu chỉ khác size (mắt không nhìn ra size).
    if (!coHinh || !pt) return null;
    const kSp = khoaMau(sp.ten);
    const cungDong = pool.filter((x) => x.barcode !== sp.barcode
      && phanTichMa(x.ten)?.dong === pt.dong && khoaMau(x.ten) !== kSp);
    const daMau = new Set([kSp]); const nhieu = [];
    // (1) ƯU TIÊN: cùng dòng + cùng SỐ, chỉ khác màu (khó nhất)
    for (const x of xao(cungDong.filter((x) => { const p = phanTichMa(x.ten); return p && p.so === pt.so && p.mau !== pt.mau; }))) {
      const k = khoaMau(x.ten);
      if (!daMau.has(k)) { daMau.add(k); nhieu.push(x.ten); }
      if (nhieu.length >= 3) break;
    }
    // (2) BÙ: cùng dòng khác màu/số bất kỳ
    if (nhieu.length < 3) for (const x of xao(cungDong)) {
      const k = khoaMau(x.ten);
      if (!daMau.has(k)) { daMau.add(k); nhieu.push(x.ten); }
      if (nhieu.length >= 3) break;
    }
    // (3) BÙ tiếp: cùng ngành khác dòng
    if (nhieu.length < 3) for (const x of xao(pool.filter((x) => x.barcode !== sp.barcode && x.nganh_3 === sp.nganh_3))) {
      const k = khoaMau(x.ten);
      if (!daMau.has(k)) { daMau.add(k); nhieu.push(x.ten); }
      if (nhieu.length >= 3) break;
    }
    if (nhieu.length < 3) return null;
    return { loai: l, hoi: 'Nhìn kỹ! Sản phẩm trong hình là mã nào? (các mã rất giống nhau)', sp, hinh: nenHinh(sp.hinh_url),
      dapAn: xao([{ nhan: sp.ten, dung: true }, ...nhieu.map((t) => ({ nhan: t, dung: false }))]) };
  }

  if (l === 'MA_NGUOC') {
    // Cho MÀU + hình -> chọn đúng MÃ. Nhiễu là mã cùng dòng khác màu (mã có thực).
    if (!pt || !MAU_MA[pt.mau] || !coHinh) return null;
    const cungDong = pool.filter((x) => x.barcode !== sp.barcode)
      .map((x) => ({ x, p: phanTichMa(x.ten) }))
      .filter((o) => o.p && o.p.dong === pt.dong && o.p.mau !== pt.mau && MAU_MA[o.p.mau]);
    const daMau = new Set([khoaMau(sp.ten)]); const nhieu = [];
    for (const o of xao(cungDong)) {
      const k = khoaMau(o.x.ten);
      if (!daMau.has(k)) { daMau.add(k); nhieu.push(o.x.ten); }
      if (nhieu.length >= 3) break;
    }
    if (nhieu.length < 3) return null;
    return { loai: l, hoi: `Hình này là bản màu ${MAU_MA[pt.mau].toUpperCase()} — mã nào đúng?`, sp, hinh: nenHinh(sp.hinh_url),
      dapAn: xao([{ nhan: sp.ten, dung: true }, ...nhieu.map((t) => ({ nhan: t, dung: false }))]) };
  }

  if (l === 'SOSANH' || l === 'SOSANH_GAN') {
    if (!coHinh) return null;
    // SOSANH: giá lệch ≥25% (dễ nhìn) | SOSANH_GAN: 8-20% (phải thuộc giá)
    const [min, max] = l === 'SOSANH' ? [0.25, 9] : [0.08, 0.2];
    const ungVien = pool.filter((x) => {
      if (x.barcode === sp.barcode || !hopLeHinh(x.hinh_url)) return false;
      const d = Math.abs(x.gia - gia) / Math.max(x.gia, gia);
      return d >= min && d <= max;
    });
    if (!ungVien.length) return null;
    const b = ungVien[Math.floor(Math.random() * ungVien.length)];
    const cap = xao([sp, b]);
    return { loai: 'SOSANH', hoi: l === 'SOSANH_GAN'
        ? 'Giá RẤT GẦN nhau — sản phẩm nào có giá niêm yết CAO hơn?'
        : 'Sản phẩm nào có giá niêm yết CAO hơn?', sp,
      dapAn: cap.map((x) => ({ nhan: x.ten, hinh: nenHinh(x.hinh_url), dung: x.gia === Math.max(sp.gia, b.gia) })) };
  }

  if (l === 'BANCHAY') {
    // RANDOM bộ 4 (không phải luôn top1 toàn pool -> hết lặp): chọn 4 mã có bán,
    // hợp lệ khi nhất-của-4 ≥ 1.7× nhì-của-4 (đáp án rõ ràng, dữ liệu quá khứ chắc 100%).
    const banCo = pool.filter((x) => Number(x.ban_30) > 0);
    if (banCo.length < 4) return null;
    for (let t = 0; t < 6; t++) {
      const bo = xao(banCo).slice(0, 4).sort((a, b) => Number(b.ban_30) - Number(a.ban_30));
      if (Number(bo[0].ban_30) >= Number(bo[1].ban_30) * 1.7) {
        return { loai: l, hoi: 'Trong 4 mã sau, mã nào BÁN CHẠY NHẤT 30 ngày qua toàn hệ thống?', sp: bo[0],
          dapAn: xao(bo.map((x, i) => ({ nhan: x.ten, dung: i === 0 }))) };
      }
    }
    return null;
  }

  if (l === 'CHAYHANG') {
    const chayDs = pool.filter((x) => Number(x.ban_30) > 0 && Number(x.ton_ht) === 0);
    const tonNhieu = pool.filter((x) => Number(x.ton_ht) >= 20);
    if (!chayDs.length || tonNhieu.length < 3) return null;
    const chay = chayDs[Math.floor(Math.random() * chayDs.length)];
    const nhieu = xao(tonNhieu).slice(0, 3);
    return { loai: l, hoi: 'Mã nào đang CHÁY HÀNG — có bán trong 30 ngày nhưng toàn hệ thống đã hết tồn? (tồn cập nhật mỗi giờ)', sp: chay,
      dapAn: xao([{ nhan: chay.ten, dung: true }, ...nhieu.map((x) => ({ nhan: x.ten, dung: false }))]) };
  }

  if (l === 'TONNHIEU_NGANH') {
    // Hỏi tồn PHẢI NÊU NGÀNH + random bộ 4 trong ngành (nhất ≥ 2× nhì mới hợp lệ)
    const theoNganh = {};
    for (const x of pool) if (x.nganh_3 && Number(x.ton_ht) > 0) (theoNganh[x.nganh_3] ||= []).push(x);
    const nganhOk = xao(Object.keys(theoNganh).filter((n) => theoNganh[n].length >= 4));
    for (const ng of nganhOk.slice(0, 3)) {
      for (let t = 0; t < 4; t++) {
        const bo = xao(theoNganh[ng]).slice(0, 4).sort((a, b) => Number(b.ton_ht) - Number(a.ton_ht));
        if (Number(bo[0].ton_ht) >= Number(bo[1].ton_ht) * 2 && Number(bo[0].ton_ht) >= 10) {
          return { loai: 'TONNHIEU', hoi: `Trong ngành “${ng}”, mã nào còn TỒN NHIỀU NHẤT toàn hệ thống? (tồn cập nhật mỗi giờ)`, sp: bo[0],
            dapAn: xao(bo.map((x, i) => ({ nhan: x.ten, dung: i === 0 }))) };
        }
      }
    }
    return null;
  }

  if (l === 'CHON_HINH' || l === 'CHON_HINH_KHO') {
    // Cho TÊN mã -> chọn đúng HÌNH trong 4 hình. Đảo ngược câu nhận diện.
    // CHON_HINH: 4 hình khác dòng (dễ). CHON_HINH_KHO: 4 hình CÙNG DÒNG khác màu (khó).
    if (!coHinh) return null;
    let nhieuSp;
    if (l === 'CHON_HINH_KHO' && pt) {
      const kSp = khoaMau(sp.ten);
      const daMau = new Set([kSp]); nhieuSp = [];
      for (const x of xao(pool.filter((x) => x.barcode !== sp.barcode && hopLeHinh(x.hinh_url)
        && phanTichMa(x.ten)?.dong === pt.dong && khoaMau(x.ten) !== kSp))) {
        const k = khoaMau(x.ten);
        if (!daMau.has(k)) { daMau.add(k); nhieuSp.push(x); }
        if (nhieuSp.length >= 3) break;
      }
    } else {
      nhieuSp = xao(pool.filter((x) => x.barcode !== sp.barcode && hopLeHinh(x.hinh_url)
        && (!pt || phanTichMa(x.ten)?.dong !== pt.dong))).slice(0, 3);
    }
    if (nhieuSp.length < 3) return null;
    return { loai: l, laHinhDapAn: true,
      hoi: l === 'CHON_HINH_KHO' ? `Chọn đúng HÌNH của mã “${sp.ten}” (các mã cùng dòng, nhìn kỹ màu)` : `Đâu là hình của “${sp.ten}”?`,
      sp, dapAn: xao([{ hinh: nenHinh(sp.hinh_url), hinhGoc: goc(sp.hinh_url), dung: true },
        ...nhieuSp.map((x) => ({ hinh: nenHinh(x.hinh_url), hinhGoc: goc(x.hinh_url), dung: false }))]) };
  }

  if (l === 'GIA_HINH') {
    // Câu giá NHƯNG có hình sản phẩm -> nhiễu cũng là giá THẬT của SP khác.
    if (!coHinh) return null;
    const bien = [[0.3, 0.9], [0.15, 0.35], [0.08, 0.2], [0.04, 0.14]][capDo];
    const giaThat = [...new Set(pool.filter((x) => x.barcode !== sp.barcode && Number(x.gia) > 0
      && Number(x.gia) !== gia).map((x) => Number(x.gia)))];
    const trongKhoang = giaThat.filter((g) => { const d = Math.abs(g - gia) / gia; return d >= bien[0] && d <= bien[1]; });
    let nhieu = xao(trongKhoang.length >= 3 ? trongKhoang : giaThat).slice(0, 3);
    if (nhieu.length < 3) {
      const bu = new Set(nhieu); let thu = 0;
      while (bu.size < 3 && thu < 40) { thu++;
        const pct = bien[0] + Math.random() * (bien[1] - bien[0]);
        const g = Math.round(gia * (Math.random() < 0.5 ? 1 - pct : 1 + pct) / 1000) * 1000;
        if (g > 0 && g !== gia) bu.add(g);
      }
      nhieu = [...bu].slice(0, 3);
    }
    if (nhieu.length < 3) return null;
    return { loai: 'GIA', hoi: 'Sản phẩm trong hình có giá niêm yết là bao nhiêu?', sp,
      hinh: nenHinh(sp.hinh_url), hinhGoc: goc(sp.hinh_url),
      dapAn: xao([{ nhan: fmtVND(gia), dung: true }, ...nhieu.map((g) => ({ nhan: fmtVND(g), dung: false }))]) };
  }

  if (l === 'XEP_GIA_HINH') {
    // 3 HÌNH -> chọn hình sản phẩm ĐẮT NHẤT (đa hình, cấp cao). Giá phải cách nhau ≥12%.
    if (!coHinh) return null;
    const ds = xao(pool.filter((x) => hopLeHinh(x.hinh_url) && Number(x.gia) > 0));
    for (let t = 0; t < 8; t++) {
      const bo = xao(ds).slice(0, 3);
      const gs = bo.map((x) => Number(x.gia)).sort((a, b) => b - a);
      if (gs[0] >= gs[1] * 1.12 && gs[1] >= gs[2] * 1.12) {
        const maxg = gs[0];
        return { loai: l, laHinhDapAn: true, hoi: 'Sản phẩm nào ĐẮT NHẤT? (chọn theo hình)', sp: bo[0],
          dapAn: xao(bo.map((x) => ({ hinh: nenHinh(x.hinh_url), hinhGoc: goc(x.hinh_url), dung: Number(x.gia) === maxg }))) };
      }
    }
    return null;
  }

  if (l === 'CHON_RE_HINH') {
    // ĐẢO của XEP_GIA_HINH: 3 hình, chọn cái RẺ NHẤT.
    if (!coHinh) return null;
    const ds = xao(pool.filter((x) => hopLeHinh(x.hinh_url) && Number(x.gia) > 0));
    for (let t = 0; t < 8; t++) {
      const bo = xao(ds).slice(0, 3);
      const gs = bo.map((x) => Number(x.gia)).sort((a, b) => a - b);
      if (gs[1] >= gs[0] * 1.12 && gs[2] >= gs[1] * 1.12) {
        const ming = gs[0];
        return { loai: l, laHinhDapAn: true, hoi: 'Sản phẩm nào RẺ NHẤT? (chọn theo hình)', sp: bo[0],
          dapAn: xao(bo.map((x) => ({ hinh: nenHinh(x.hinh_url), hinhGoc: goc(x.hinh_url), dung: Number(x.gia) === ming }))) };
      }
    }
    return null;
  }

  if (l === 'CHON_SAI_DONG') {
    // ĐẢO NGƯỢC: 3 mã CÙNG DÒNG + 1 mã KHÁC DÒNG -> chọn mã KHÔNG cùng dòng (câu "chọn cái sai").
    if (!pt) return null;
    const cungDong = pool.filter((x) => x.barcode !== sp.barcode && phanTichMa(x.ten)?.dong === pt.dong
      && khoaMau(x.ten) !== khoaMau(sp.ten));
    if (cungDong.length < 2) return null;
    // sp + 2 mã cùng dòng = 3 mã cùng dòng; 1 mã khác dòng = đáp án "sai"
    const khacDong = xao(pool.filter((x) => { const p = phanTichMa(x.ten); return p && p.dong !== pt.dong; }))[0];
    if (!khacDong) return null;
    const daMau = new Set([khoaMau(sp.ten)]); const cung = [sp.ten];
    for (const x of xao(cungDong)) { const k = khoaMau(x.ten);
      if (!daMau.has(k)) { daMau.add(k); cung.push(x.ten); } if (cung.length >= 3) break; }
    if (cung.length < 3) return null;
    return { loai: l, hoi: `3 mã cùng dòng ${pt.dong}, 1 mã KHÁC — chọn mã KHÔNG cùng dòng:`, sp,
      dapAn: xao([{ nhan: khacDong.ten, dung: true }, ...cung.map((t) => ({ nhan: t, dung: false }))]) };
  }

  return null;
}export default function DauTruong() {
  const { user, baoToast } = useApp();
  const [view, setView] = useState('SANH');          // SANH | DEM | CHOI | KETQUA
  const [sanhTab, setSanhTab] = useState('CHOI');    // CHOI | LOG (admin)
  const laAdmin = user.vai_tro === 'ADMIN';
  const [cheDo, setCheDo] = useState('TOCDO');
  const [tabTop, setTabTop] = useState('TOCDO');
  const [top, setTop] = useState(null);
  const [pool, setPool] = useState(null);
  const [hoso, setHoso] = useState(null);
  const [dem, setDem] = useState(3);

  // trạng thái lượt chơi
  const [cau, setCau] = useState(null);
  const [diem, setDiem] = useState(0);
  const [soCau, setSoCau] = useState(0);
  const [soDung, setSoDung] = useState(0);
  const [combo, setCombo] = useState(0);
  const [comboMax, setComboMax] = useState(0);
  const [mang, setMang] = useState(3);
  const [tgConLai, setTgConLai] = useState(60);
  const [tgCau, setTgCau] = useState(7);             // sinh tồn: giờ mỗi câu
  const [chon, setChon] = useState(null);            // index đã chọn (hiện feedback)
  const [kq, setKq] = useState(null);                // {hang, best}
  const daDung = useRef(new Set());
  const daCau = useRef(new Set());     // chữ ký câu đã ra — không lặp trong ván
  const lichSuCau = useRef(loadLichSu());   // câu đã ra các VÁN GẦN ĐÂY (localStorage) — tránh lặp giữa ván
  const cauVanNay = useRef(new Set());      // chỉ câu MỚI sinh trong ván này (để lưu vào lịch sử)
  const loaiGanDay = useRef([]);            // 2 dạng câu gần nhất — tránh lặp cấu trúc liền nhau
  const dangChoi = useRef(false);
  const tRef = useRef(null);
  const tCauRef = useRef(null);
  const batDauCau = useRef(0);

  const taiTop = async (cd) => {
    const { data } = cd === 'DAILY'
      ? await sb.rpc('fn_thi_top_daily', {})
      : await sb.rpc('fn_thi_top', { p_che_do: cd });
    setTop(data || []);
  };
  useEffect(() => { taiTop(tabTop); }, [tabTop]);
  useEffect(() => {
    if (view === 'SANH') sb.rpc('fn_thi_hoso', { p_token: user.token }).then(({ data }) => setHoso(data));
  }, [view]);   // eslint-disable-line

  // ---- bắt đầu lượt ----
  const batDau = async () => {
    if (cheDo === 'DAILY') {
      const { data: daThi } = await sb.rpc('fn_thi_daily_da_thi', { p_token: user.token });
      if (daThi) { baoToast('Hôm nay bạn đã thi Thử thách ngày — quay lại ngày mai'); return; }
    }
    const { data, error } = cheDo === 'DAILY'
      ? await sb.rpc('fn_thi_pool_daily')
      : await sb.rpc('fn_thi_pool', { p_so: 90 });
    if (error || !data || data.length < 12) { baoToast('Chưa đủ dữ liệu sản phẩm để thi'); return; }
    setPool(data);
    // preload 20 hình đầu (ảnh nét/nặng — tải sẵn để không khựng giữa trận)
    data.filter((s) => nenHinh(s.hinh_url)).slice(0, 20)
      .forEach((s) => { const im = new Image(); im.src = nenHinh(s.hinh_url); });
    daDung.current = new Set();
    // Nạp câu đã ra các ván gần đây -> ván này tránh lặp lại chúng (mới mẻ giữa các lần chơi)
    daCau.current = new Set(lichSuCau.current);
    cauVanNay.current = new Set();
    loaiGanDay.current = [];
    setDiem(0); setSoCau(0); setSoDung(0); setCombo(0); setComboMax(0); setMang(3); setChon(null); setKq(null);
    setTgConLai(CHE_DO[cheDo].giay || 0); setTgCau(7);
    setDem(3); dangChoi.current = true; setView('DEM');
  };

  // đếm ngược 3-2-1
  useEffect(() => {
    if (view !== 'DEM') return;
    if (dem <= 0) { setView('CHOI'); return; }
    const t = setTimeout(() => setDem((d) => d - 1), 700);
    return () => clearTimeout(t);
  }, [view, dem]);

  // đồng hồ tổng (TOCDO/CHINHXAC) — tính bằng MỐC THỜI GIAN THẬT, chạy đúng cả khi ẩn app
  useEffect(() => {
    if (view !== 'CHOI' || cheDo === 'SINHTON' || cheDo === 'DAILY') return;
    const tongGiay = CHE_DO[cheDo].giay;
    const ketThucLuc = Date.now() + tgConLai * 1000;   // mốc kết thúc tuyệt đối
    tRef.current = setInterval(() => {
      const conLai = Math.max(0, (ketThucLuc - Date.now()) / 1000);
      setTgConLai(+conLai.toFixed(1));
      if (conLai <= 0) { clearInterval(tRef.current); ketThuc(); }
    }, 100);
    // khi app hiện lại (từ ẩn), cập nhật ngay
    const onVis = () => { if (!document.hidden) {
      const conLai = Math.max(0, (ketThucLuc - Date.now()) / 1000);
      setTgConLai(+conLai.toFixed(1));
      if (conLai <= 0) { clearInterval(tRef.current); ketThuc(); }
    }};
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(tRef.current); document.removeEventListener('visibilitychange', onVis); };
  }, [view]);   // eslint-disable-line

  // đồng hồ mỗi câu (SINHTON) — timestamp thật
  useEffect(() => {
    if (view !== 'CHOI' || cheDo !== 'SINHTON' || chon !== null) return;
    const hetLuc = Date.now() + tgCau * 1000;
    tCauRef.current = setInterval(() => {
      const conLai = Math.max(0, (hetLuc - Date.now()) / 1000);
      setTgCau(+conLai.toFixed(1));
      if (conLai <= 0) { clearInterval(tCauRef.current); traLoi(-1); }
    }, 100);
    return () => clearInterval(tCauRef.current);
  }, [view, cau, chon]);   // eslint-disable-line

  // sinh câu đầu khi vào CHOI
  useEffect(() => {
    if (view === 'CHOI' && !cau && pool) cauMoi();
  }, [view]);   // eslint-disable-line

  const cauMoi = () => {
    // Cấp độ tăng theo tiến trình ván: câu 1-4 = C1 ... 13+ = C4 (khó nhất)
    const capDo = Math.min(3, Math.floor(soCau / 4));
    const lt = loaiGanDay.current;   // 2 dạng câu gần nhất -> tránh lặp
    let c = sinhCau(pool, daDung.current, daCau.current, capDo, lt);
    if (!c) {
      // pool cạn SP mới -> nới daDung nhưng GIỮ daCau (vẫn cấm trùng câu)
      daDung.current = new Set();
      c = sinhCau(pool, daDung.current, daCau.current, capDo, lt)
        || sinhCau(pool, daDung.current, daCau.current, Math.max(0, capDo - 1), lt);
    }
    if (!c) {
      // Vẫn bí -> XẢ lịch sử ván cũ (giữ câu ván NÀY), thử lại. Tránh kẹt khi lịch sử phủ hết.
      daCau.current = new Set(cauVanNay.current);
      c = sinhCau(pool, daDung.current, daCau.current, capDo, lt)
        || sinhCau(pool, daDung.current, daCau.current, Math.max(0, capDo - 1), lt);
    }
    if (!c) { ketThuc(); return; }   // thật sự hết câu mới (cực hiếm) -> kết thúc đẹp
    daCau.current.add(c.chuKy);
    cauVanNay.current.add(c.chuKy);   // để lưu vào lịch sử khi kết thúc ván
    // nhớ 2 dạng gần nhất (cho câu kế tránh lặp cấu trúc)
    loaiGanDay.current = [c.loai, ...loaiGanDay.current].slice(0, 2);
    daDung.current.add(c.sp.barcode);
    if (daDung.current.size > pool.length - 8) daDung.current = new Set();
    // Preload NGAY mọi hình của CHÍNH câu này (câu.hinh + tất cả hình đáp án)
    // -> không bao giờ thiếu hình cuối. Ảnh đã cache thì hiện tức thì.
    const hinhCau = [];
    if (c.hinh) hinhCau.push(c.hinh);
    (c.dapAn || []).forEach((d) => { if (d.hinh) hinhCau.push(d.hinh); });
    hinhCau.forEach((u) => { const im = new Image(); im.src = u; });
    // preload thêm vài SP cho câu kế
    xao(pool).filter((s) => nenHinh(s.hinh_url)).slice(0, 4)
      .forEach((s) => { const im = new Image(); im.src = nenHinh(s.hinh_url); });
    setCau(c); setChon(null); setTgCau(7);
    batDauCau.current = Date.now();
  };

  const traLoi = (idx) => {
    if (chon !== null || !cau) return;
    clearInterval(tCauRef.current);
    const dung = idx >= 0 && cau.dapAn[idx]?.dung;
    setChon(idx);
    setSoCau((n) => n + 1);
    if (dung) {
      const giay = (Date.now() - batDauCau.current) / 1000;
      const bonus = Math.max(0, Math.round(50 * (1 - Math.min(giay, 3) / 3)));
      const heSo = 1 + 0.1 * Math.min(combo, 10);
      setDiem((d) => d + Math.round((100 + bonus) * heSo));
      setSoDung((n) => n + 1);
      setCombo((c) => { const nc = c + 1; setComboMax((m) => Math.max(m, nc)); return nc; });
    } else {
      setCombo(0);
      if (cheDo === 'CHINHXAC') setDiem((d) => Math.max(0, d - 50));
      if (cheDo === 'SINHTON') {
        setMang((m) => {
          if (m - 1 <= 0) { setTimeout(() => ketThuc(0), 550); }
          return m - 1;
        });
      }
    }
    if (cheDo === 'DAILY' && soCau + 1 >= DAILY_SO_CAU) {
      setTimeout(() => ketThuc(), 600);
    } else {
      setTimeout(() => { if (dangChoi.current) cauMoi(); }, 550);
    }
  };

  const dangLuu = useRef(false);
  const ketThuc = async () => {
    if (dangLuu.current) return; dangLuu.current = true; dangChoi.current = false;
    clearInterval(tRef.current); clearInterval(tCauRef.current);
    setView('KETQUA'); setCau(null);
    // Lưu câu đã ra ván này vào lịch sử (ván sau tránh lặp) — chỉ chữ ký câu MỚI ván này,
    // không gồm phần nạp từ lịch sử cũ (đã có sẵn trong localStorage).
    luuLichSu([...cauVanNay.current]);
    lichSuCau.current = loadLichSu();
    // đọc state mới nhất qua functional set (đảm bảo đúng số cuối)
    let d, sc, sd, cm;
    setDiem((x) => (d = x, x)); setSoCau((x) => (sc = x, x));
    setSoDung((x) => (sd = x, x)); setComboMax((x) => (cm = x, x));
    setTimeout(async () => {
      const { data, error } = await sb.rpc('fn_thi_luu', {
        p_token: user.token, p_che_do: cheDo, p_diem: d, p_so_cau: sc, p_so_dung: sd, p_combo: cm });
      if (error) baoToast('Không lưu được kết quả: ' + error.message);
      else { setKq(data); taiTop(cheDo); setTabTop(cheDo); }
      dangLuu.current = false;
    }, 50);
  };

  // ================= RENDER =================
  if (view === 'DEM') return (
    <div className="dt-dem"><div className="dt-dem-so" key={dem}>{dem === 0 ? 'BẮT ĐẦU!' : dem}</div></div>
  );

  if (view === 'CHOI' && cau) {
    const CD = CHE_DO[cheDo];
    const pct = cheDo === 'SINHTON' ? (tgCau / 7) * 100
      : cheDo === 'DAILY' ? ((DAILY_SO_CAU - soCau) / DAILY_SO_CAU) * 100
      : (tgConLai / CD.giay) * 100;
    return (
      <div className="dt-choi">
        <div className="dt-bar">
          <div className="dt-bar-tg">
            <div className="dt-bar-fill" style={{ width: pct + '%', background: pct < 25 ? 'var(--magenta)' : 'var(--grad)' }} />
            <span className="dt-bar-txt">{cheDo === 'SINHTON' ? tgCau.toFixed(1) + 's'
              : cheDo === 'DAILY' ? `Câu ${Math.min(soCau + 1, DAILY_SO_CAU)}/${DAILY_SO_CAU}`
              : Math.ceil(tgConLai) + 's'}</span>
          </div>
          <div className="dt-diem">{diem.toLocaleString('vi')}</div>
          <div className={'dt-cap dt-cap' + Math.min(3, Math.floor(soCau / 4))} title="Độ khó tăng dần theo tiến trình">
            C{Math.min(3, Math.floor(soCau / 4)) + 1}
          </div>
          {combo >= 2 && <div className="dt-combo" key={combo}>×{combo}</div>}
          {cheDo === 'SINHTON' && (
            <div className="dt-mang">{[1, 2, 3].map((i) => <IcHeart key={i} width={18} style={{ opacity: i <= mang ? 1 : .18, color: 'var(--magenta)' }} />)}</div>
          )}
        </div>

        <div className="dt-cau" key={soCau}>
        <div className="dt-hoi">{cau.hoi}</div>

        {cau.laHinhDapAn ? (
          // ĐÁP ÁN LÀ HÌNH: lưới 2x2 hình bấm chọn
          <div className="dt-hinh-luoi">
            {cau.dapAn.map((a, i) => (
              <button key={i} onClick={() => traLoi(i)} style={{ animationDelay: (i * 60) + 'ms' }}
                className={'dt-hinh-o dt-vao' + (chon === null ? '' : a.dung ? ' dung' : chon === i ? ' sai' : ' mo')}>
                <img src={a.hinh} alt="" loading="eager" onError={(e) => falbackGoc(e)} />
              </button>
            ))}
          </div>
        ) : cau.loai === 'SOSANH' ? (
          <div className="dt-sosanh">
            {cau.dapAn.map((a, i) => (
              <button key={i} onClick={() => traLoi(i)} style={{ animationDelay: (i * 60) + 'ms' }}
                className={'dt-ss-the dt-vao' + (chon === null ? '' : a.dung ? ' dung' : chon === i ? ' sai' : ' mo')}>
                <div className="dt-ss-hinh"><img src={a.hinh} alt="" loading="eager" onError={(e) => falbackGoc(e)} /></div>
                <div className="dt-ss-ten">{a.nhan}</div>
              </button>
            ))}
          </div>
        ) : (
          <>
            {cau.hinh && <div className="dt-hinh"><img src={cau.hinh} alt="" loading="eager"
              className="dt-hinh-img" onLoad={(e) => e.currentTarget.classList.add('san')}
              onError={(e) => falbackGoc(e)} /></div>}
            <div className="dt-dapan">
              {cau.dapAn.map((a, i) => (
                <button key={i} onClick={() => traLoi(i)} style={{ animationDelay: (i * 55) + 'ms' }}
                  className={'dt-da dt-vao' + (chon === null ? '' : a.dung ? ' dung' : chon === i ? ' sai' : ' mo')}>
                  {a.nhan}
                </button>
              ))}
            </div>
          </>
        )}
        </div>
      </div>
    );
  }

  if (view === 'KETQUA') {
    const acc = soCau ? Math.round(100 * soDung / soCau) : 0;
    return (
      <div className="dt-kq">
        <div className="dt-kq-tit">KẾT THÚC — {CHE_DO[cheDo].ten.toUpperCase()}</div>
        <div className="dt-kq-diem">{diem.toLocaleString('vi')}</div>
        {kq && kq.hang <= 10 && <div className="dt-kq-top"><IcTrophy width={16} /> LỌT TOP {kq.hang} TOÀN HỆ THỐNG!</div>}
        <div className="the-hang" style={{ justifyContent: 'center', marginTop: 18 }}>
          <div className="the-g"><span className="the-g-n">{soCau}</span><span className="the-g-t">câu đã trả lời</span></div>
          <div className="the-g"><span className="the-g-n" style={{ color: 'var(--teal-deep)' }}>{soDung}</span><span className="the-g-t">trả lời đúng</span></div>
          <div className="the-g"><span className="the-g-n">{acc}%</span><span className="the-g-t">độ chính xác</span></div>
          <div className="the-g"><span className="the-g-n" style={{ color: 'var(--gold)' }}>×{comboMax}</span><span className="the-g-t">combo cao nhất</span></div>
        </div>
        {kq && <div className="dt-kq-best">Hạng lượt này: <b>#{kq.hang}</b> · Kỷ lục của bạn: <b>{Number(kq.best).toLocaleString('vi')}</b></div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
          <button className="btn btn-ai" onClick={batDau}><IcRefresh width={15} /> Chơi lại</button>
          <button className="btn btn-ghost" onClick={() => { setView('SANH'); taiTop(tabTop); }}>Về sảnh</button>
        </div>
      </div>
    );
  }

  // ---- SẢNH ----
  return (
    <>
      <div className="cmdbar">
        <h1>Đấu trường sản phẩm</h1>
        <div className="sub">Thi đua tốc độ &amp; kiến thức sản phẩm toàn hệ thống — vừa chơi vừa thuộc giá, thuộc mã. Top 10 ghi danh bảng vàng.</div>
      </div>

      {laAdmin && (
        <div className="nhom-tabs" style={{ marginTop: 14, marginBottom: 0 }}>
          <button className={'nhom-tab' + (sanhTab === 'CHOI' ? ' on' : '')} onClick={() => setSanhTab('CHOI')}>Chơi &amp; Bảng vàng</button>
          <button className={'nhom-tab' + (sanhTab === 'GIAI' ? ' on' : '')} onClick={() => setSanhTab('GIAI')}>Giải đấu</button>
          <button className={'nhom-tab' + (sanhTab === 'LOG' ? ' on' : '')} onClick={() => setSanhTab('LOG')}>Nhật ký cửa hàng</button>
        </div>
      )}
      {!laAdmin && (
        <div className="nhom-tabs" style={{ marginTop: 14, marginBottom: 0 }}>
          <button className={'nhom-tab' + (sanhTab === 'CHOI' ? ' on' : '')} onClick={() => setSanhTab('CHOI')}>Chơi &amp; Bảng vàng</button>
          <button className={'nhom-tab' + (sanhTab === 'GIAI' ? ' on' : '')} onClick={() => setSanhTab('GIAI')}>Giải đấu</button>
        </div>
      )}

      {sanhTab === 'LOG' ? <NhatKy /> : sanhTab === 'GIAI' ? <GiaiDau /> : (
      <div className="dt-sanh">
        <div>
          <div className="dt-modes">
            {Object.entries(CHE_DO).map(([id, cd]) => (
              <button key={id} className={'dt-mode' + (cheDo === id ? ' on' : '')} onClick={() => setCheDo(id)}>
                <cd.Ic width={26} />
                <div className="dt-mode-ten">{cd.ten}</div>
                <div className="dt-mode-mota">{cd.mota}</div>
              </button>
            ))}
          </div>
          <div className="dt-luat">
            Điểm mỗi câu = <b>100</b> + thưởng tốc độ (tối đa <b>+50</b>) × hệ số chuỗi combo (tối đa <b>×2</b>).
            Câu hỏi sinh ngẫu nhiên từ dữ liệu thật: giá niêm yết, nhận diện hình, ngành hàng, so sánh giá.
          </div>
          <button className="btn btn-ai dt-batdau" onClick={batDau}>
            <IcFlash width={16} /> VÀO TRẬN — {CHE_DO[cheDo].ten}
          </button>

          {hoso && hoso.luot > 0 && (
            <div className="card dt-hoso">
              <div className="dt-hoso-head">Hồ sơ của tôi</div>
              <div className="dt-hoso-so">
                <span><b>{hoso.luot}</b> lượt</span>
                <span><b>{hoso.dung}</b>/{hoso.cau} đúng ({hoso.acc}%)</span>
                <span>combo <b>×{hoso.combo}</b></span>
                <span><b>{hoso.ngay}</b> ngày thi</span>
              </div>
              {(hoso.huy_hieu || []).length > 0 && (
                <div className="dt-hh-list">
                  {(hoso.huy_hieu || []).map((h) => HUY_HIEU[h] && (
                    <span key={h} className="dt-hh" title={HUY_HIEU[h].mota}>
                      <IcTrophy width={12} /> {HUY_HIEU[h].ten}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="card dt-top">
          <div className="dt-top-head">
            <IcTrophy width={18} style={{ color: 'var(--gold)' }} />
            <span>Bảng vàng Top 10</span>
          </div>
          <div className="nhom-tabs nhom-deu" style={{ margin: '10px 0' }}>
            {Object.entries(CHE_DO).map(([id, cd]) => (
              <button key={id} className={'nhom-tab' + (tabTop === id ? ' on' : '')} style={{ height: 34, padding: '0 6px', fontSize: 11.5 }}
                onClick={() => setTabTop(id)}>{cd.ten}</button>
            ))}
          </div>
          {!top ? <div className="dt-top-trong">Đang tải…</div>
            : top.length === 0 ? <div className="dt-top-trong">Chưa có ai ghi danh — hãy là người đầu tiên!</div>
            : (
              <div className="dt-top-list">
                {top.map((r, i) => (
                  <div key={r.ma_nguoi} className={'dt-top-item' + (r.ma_nguoi === user.ma_dang_nhap ? ' toi' : '') + (i < 3 ? ' top3' : '')}>
                    <span className={'dt-hang h' + (i + 1)}>{i + 1}</span>
                    <div className="dt-top-ten">
                      <div>{r.ten_nguoi}</div>
                      <div className="dt-top-sub">{r.ma_ch || r.ma_nguoi} · đúng {r.so_dung}/{r.so_cau} · combo ×{r.combo_max}</div>
                    </div>
                    <b className="dt-top-diem">{Number(r.diem).toLocaleString('vi')}</b>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>
      )}
    </>
  );
}

// ============ NHẬT KÝ QUẢN TRỊ ============
const iso2 = (d = new Date()) => isoVN(d);
const fmtGio = (ts) => { const d = new Date(ts); return d.toLocaleString('vi', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };

function NhatKy() {
  const { baoToast } = useApp();
  const [tu, setTu] = useState(iso2(new Date(Date.now() - 30 * 864e5)));
  const [den, setDen] = useState(iso2(new Date()));
  const [rows, setRows] = useState(null);
  const [chiTiet, setChiTiet] = useState(null);       // ma_ch đang mở chi tiết
  const [ct, setCt] = useState(null);
  const [sortC, setSortC] = useState({ col: 'luot', dir: 'desc' });
  const [chiChoi, setChiChoi] = useState(false);       // lọc chỉ CH đã chơi

  const [loi, setLoi] = useState(null);
  useEffect(() => { (async () => {
    try {
      const { data, error } = await rpcHet('fn_thi_log_ch', { p_tu: tu, p_den: den });
      if (error) { setLoi(error.message); setRows([]); return; }
      setLoi(null); setRows(data || []);
    } catch (e) { setLoi(String(e?.message || e)); setRows([]); }
  })(); }, [tu, den]);

  const moChiTiet = async (ma_ch) => {
    setChiTiet(ma_ch); setCt(null);
    const { data } = await rpcHet('fn_thi_log_chitiet', { p_tu: tu, p_den: den, p_ma_ch: ma_ch });
    setCt(data || []);
  };

  const tk = useMemo(() => {
    const v = rows || [];
    return {
      luot: v.reduce((s, r) => s + Number(r.so_luot), 0),
      choi: v.filter((r) => Number(r.so_luot) > 0).length,
      chua: v.filter((r) => Number(r.so_luot) === 0).length,
    };
  }, [rows]);

  const hien = useMemo(() => {
    let v = [...(rows || [])];
    if (chiChoi) v = v.filter((r) => Number(r.so_luot) > 0);
    const g = { ten: (r) => r.ten_ch, luot: (r) => Number(r.so_luot), nguoi: (r) => Number(r.so_nguoi),
      max: (r) => r.diem_max, tb: (r) => Number(r.diem_tb), gan: (r) => r.lan_gan_nhat || '' }[sortC.col];
    if (g) v.sort((a, b) => { const x = g(a), y = g(b); const c = typeof x === 'string' ? x.localeCompare(y) : (x > y ? 1 : x < y ? -1 : 0); return sortC.dir === 'asc' ? c : -c; });
    return v;
  }, [rows, chiChoi, sortC]);
  const ds = (c) => setSortC((s) => ({ col: c, dir: s.col === c && s.dir === 'desc' ? 'asc' : 'desc' }));
  const ic = (c) => sortC.col === c ? (sortC.dir === 'asc' ? ' ▲' : ' ▼') : '';

  const xuat = async () => {
    const XLSX = await import('xlsx');
    const hdr = ['Mã CH', 'Cửa hàng', 'Khu vực', 'Nhóm', 'Số lượt', 'Số người', 'Điểm cao nhất', 'Điểm TB', 'Lần gần nhất'];
    const data = hien.map((r) => [r.ma_ch, r.ten_ch, r.khu_vuc, 'N' + r.nhom_ch, Number(r.so_luot), Number(r.so_nguoi), r.diem_max, Number(r.diem_tb), r.lan_gan_nhat ? fmtGio(r.lan_gan_nhat) : '']);
    const ws = XLSX.utils.aoa_to_sheet([hdr, ...data]); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Nhật ký Đấu trường'); XLSX.writeFile(wb, `NhatKy_DauTruong_${tu}_${den}.xlsx`);
  };

  return (
    <>
      {loi && (
        <div className="card" style={{ marginTop: 14, padding: 14, borderLeft: '4px solid var(--magenta)', color: 'var(--magenta)', fontSize: 13 }}>
          Chưa tải được nhật ký: {loi}. Kiểm tra đã chạy SQL 084 trên Supabase chưa.
        </div>
      )}
      <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <DateBox label="Từ" value={tu} onChange={setTu} />
        <DateBox label="Đến" value={den} onChange={setDen} />
        <button className={'nhom-tab' + (chiChoi ? ' on' : '')} onClick={() => setChiChoi((v) => !v)} style={{ height: 40 }}>Chỉ CH đã chơi</button>
        <button className="btn btn-ghost" onClick={xuat} style={{ marginLeft: 'auto' }}>Xuất Excel</button>
      </div>

      <div className="the-hang" style={{ marginTop: 12 }}>
        <div className="the-g"><span className="the-g-n">{tk.luot}</span><span className="the-g-t">tổng lượt chơi</span></div>
        <div className="the-g"><span className="the-g-n" style={{ color: 'var(--teal-deep)' }}>{tk.choi}</span><span className="the-g-t">cửa hàng có tham gia</span></div>
        <div className="the-g"><span className="the-g-n" style={{ color: tk.chua ? 'var(--magenta)' : 'var(--teal-deep)' }}>{tk.chua}</span><span className="the-g-t">cửa hàng chưa chơi lần nào</span></div>
      </div>

      <div className="card" style={{ marginTop: 12, padding: 0, overflow: 'hidden' }}>
        <div className="tbl-wrap" style={{ maxHeight: '58vh', overflow: 'auto' }}>
          <table className="tbl tbl-fit">
            <thead><tr>
              <th className="sortable" onClick={() => ds('ten')}>Cửa hàng{ic('ten')}</th>
              <th className="num sortable" onClick={() => ds('luot')}>Số lượt{ic('luot')}</th>
              <th className="num sortable" onClick={() => ds('nguoi')}>Số người{ic('nguoi')}</th>
              <th className="num sortable" onClick={() => ds('max')}>Điểm cao nhất{ic('max')}</th>
              <th className="num sortable" onClick={() => ds('tb')}>Điểm TB{ic('tb')}</th>
              <th className="sortable" onClick={() => ds('gan')}>Lần gần nhất{ic('gan')}</th>
              <th></th>
            </tr></thead>
            <tbody>
              {hien.map((r) => (
                <tr key={r.ma_ch} className={Number(r.so_luot) === 0 ? 'row-lo' : ''}>
                  <td><div style={{ fontWeight: 600 }}>{r.ten_ch}</div><div className="mono" style={{ fontSize: 10, color: 'var(--ink-2)' }}>{r.ma_ch} · {r.khu_vuc}</div></td>
                  <td className="num" style={{ fontWeight: 700, color: Number(r.so_luot) ? 'var(--teal-deep)' : 'var(--magenta)' }}>{Number(r.so_luot)}</td>
                  <td className="num">{Number(r.so_nguoi)}</td>
                  <td className="num">{r.diem_max ? Number(r.diem_max).toLocaleString('vi') : '—'}</td>
                  <td className="num">{Number(r.diem_tb) ? Number(r.diem_tb).toLocaleString('vi') : '—'}</td>
                  <td style={{ fontSize: 12 }}>{r.lan_gan_nhat ? fmtGio(r.lan_gan_nhat) : <span style={{ color: 'var(--magenta)' }}>chưa chơi</span>}</td>
                  <td>{Number(r.so_luot) > 0 && <button className="btn-mini btn-mini-teal" onClick={() => moChiTiet(r.ma_ch)}>Chi tiết</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {chiTiet && (
        <div className="modal-bg" onClick={() => setChiTiet(null)}>
          <div className="modal" style={{ maxWidth: 640, width: '94vw' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div style={{ flex: 1 }}><b>Chi tiết lượt chơi</b> — {(rows || []).find((r) => r.ma_ch === chiTiet)?.ten_ch}</div>
              <button className="modal-x" onClick={() => setChiTiet(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '60vh', overflow: 'auto', padding: 0 }}>
              {!ct ? <div className="dt-top-trong">Đang tải…</div> : (
                <table className="tbl tbl-fit">
                  <thead><tr><th>Thời điểm</th><th>Người chơi</th><th className="center">Chế độ</th><th className="num">Điểm</th><th className="num">Đúng/Câu</th><th className="num">Combo</th></tr></thead>
                  <tbody>
                    {ct.map((r, i) => (
                      <tr key={i}>
                        <td style={{ fontSize: 12 }}>{fmtGio(r.tao_luc)}</td>
                        <td style={{ fontWeight: 600 }}>{r.ten_nguoi}</td>
                        <td className="center"><span className="tag-n tag-n2">{r.che_do}</span></td>
                        <td className="num" style={{ fontWeight: 700, color: 'var(--teal-deep)' }}>{Number(r.diem).toLocaleString('vi')}</td>
                        <td className="num">{r.so_dung}/{r.so_cau}</td>
                        <td className="num">×{r.combo_max}</td>
                      </tr>
                    ))}
                    {ct.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 20, color: 'var(--ink-2)' }}>Không có lượt nào.</td></tr>}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============ GIẢI ĐẤU — cá nhân tuần + xếp hạng cửa hàng/khu vực ============
function GiaiDau() {
  const { user } = useApp();
  const [muc, setMuc] = useState('TUAN');           // TUAN | CH | KV
  const [tuanOffset, setTuanOffset] = useState(0);  // 0 = tuần này, -1 tuần trước
  const [caNhan, setCaNhan] = useState(null);
  const [dsCH, setDsCH] = useState(null);
  const [dsKV, setDsKV] = useState(null);

  // mốc thứ 2 của tuần đang xem
  const dauTuan = useMemo(() => {
    const d = new Date(); const dow = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - dow + tuanOffset * 7);
    return iso2(d);
  }, [tuanOffset]);
  const cuoiTuan = useMemo(() => iso2(new Date(new Date(dauTuan + 'T00:00:00').getTime() + 6 * 864e5)), [dauTuan]);

  useEffect(() => {
    if (muc === 'TUAN') sb.rpc('fn_thi_top_tuan', { p_tuan: dauTuan }).then(({ data }) => setCaNhan(data || []));
    if (muc === 'CH') rpcHet('fn_thi_hang_ch', { p_tu: dauTuan, p_den: cuoiTuan }).then(({ data }) => setDsCH(data || []));
    if (muc === 'KV') rpcHet('fn_thi_hang_kv', { p_tu: dauTuan, p_den: cuoiTuan }).then(({ data }) => setDsKV(data || []));
  }, [muc, dauTuan, cuoiTuan]);

  const fmtNgay = (s) => s.slice(8, 10) + '/' + s.slice(5, 7);

  return (
    <>
      <div style={{ marginTop: 14, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="nhom-tabs" style={{ margin: 0 }}>
          <button className={'nhom-tab' + (muc === 'TUAN' ? ' on' : '')} onClick={() => setMuc('TUAN')}>Cá nhân tuần</button>
          <button className={'nhom-tab' + (muc === 'CH' ? ' on' : '')} onClick={() => setMuc('CH')}>Cửa hàng</button>
          <button className={'nhom-tab' + (muc === 'KV' ? ' on' : '')} onClick={() => setMuc('KV')}>Khu vực</button>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 'auto' }}>
          <button className="cal-nav" onClick={() => setTuanOffset((o) => o - 1)}>‹</button>
          <span style={{ fontSize: 13, fontWeight: 700, minWidth: 130, textAlign: 'center' }}>
            {tuanOffset === 0 ? 'Tuần này' : tuanOffset === -1 ? 'Tuần trước' : `${-tuanOffset} tuần trước`}
            <div style={{ fontSize: 11, color: 'var(--ink-2)', fontWeight: 400 }}>{fmtNgay(dauTuan)}–{fmtNgay(cuoiTuan)}</div>
          </span>
          <button className="cal-nav" onClick={() => setTuanOffset((o) => Math.min(0, o + 1))} disabled={tuanOffset >= 0}>›</button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12, padding: 16 }}>
        {muc === 'TUAN' && (
          !caNhan ? <div className="dt-top-trong">Đang tải…</div>
          : caNhan.length === 0 ? <div className="dt-top-trong">Tuần này chưa có ai thi đấu.</div>
          : <div className="dt-top-list">
              {caNhan.map((r, i) => (
                <div key={r.ma_nguoi} className={'dt-top-item' + (r.ma_nguoi === user.ma_dang_nhap ? ' toi' : '') + (i < 3 ? ' top3' : '')}>
                  <span className={'dt-hang h' + (i + 1)}>{i + 1}</span>
                  <div className="dt-top-ten"><div>{r.ten_nguoi}</div>
                    <div className="dt-top-sub">{r.ma_ch || r.ma_nguoi} · {r.che_do}</div></div>
                  <b className="dt-top-diem">{Number(r.diem).toLocaleString('vi')}</b>
                </div>
              ))}
            </div>
        )}

        {muc === 'CH' && (
          !dsCH ? <div className="dt-top-trong">Đang tải…</div>
          : dsCH.length === 0 ? <div className="dt-top-trong">Tuần này chưa cửa hàng nào thi đấu.</div>
          : <div className="dt-top-list">
              {dsCH.map((r, i) => (
                <div key={r.ma_ch} className={'dt-top-item' + (r.ma_ch === user.ma_ch ? ' toi' : '') + (i < 3 ? ' top3' : '')}>
                  <span className={'dt-hang h' + (i + 1)}>{i + 1}</span>
                  <div className="dt-top-ten"><div>{r.ten_ch}</div>
                    <div className="dt-top-sub">{r.khu_vuc} · {Number(r.so_nguoi)} người · {Number(r.so_luot)} lượt · TB {Number(r.diem_tb).toLocaleString('vi')}</div></div>
                  <b className="dt-top-diem">{Number(r.tong_diem).toLocaleString('vi')}</b>
                </div>
              ))}
            </div>
        )}

        {muc === 'KV' && (
          !dsKV ? <div className="dt-top-trong">Đang tải…</div>
          : dsKV.length === 0 ? <div className="dt-top-trong">Tuần này chưa có khu vực nào thi đấu.</div>
          : <div className="dt-top-list">
              {dsKV.map((r, i) => (
                <div key={r.khu_vuc} className={'dt-top-item' + (i < 3 ? ' top3' : '')}>
                  <span className={'dt-hang h' + (i + 1)}>{i + 1}</span>
                  <div className="dt-top-ten"><div>{r.khu_vuc}</div>
                    <div className="dt-top-sub">{Number(r.so_ch)} cửa hàng · {Number(r.so_nguoi)} người · TB {Number(r.diem_tb).toLocaleString('vi')}</div></div>
                  <b className="dt-top-diem">{Number(r.tong_diem).toLocaleString('vi')}</b>
                </div>
              ))}
            </div>
        )}
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 10, textAlign: 'center' }}>
        Xếp hạng cửa hàng &amp; khu vực tính bằng tổng điểm cao nhất của từng người trong kỳ — càng nhiều người nỗ lực, thứ hạng tập thể càng cao.
      </div>
    </>
  );
}
