// ============================================================================
// AI GHÉP TỔ HỢP THÙNG cho đội mới (v3.123.0)
//   Đích: bộ hàng đầu tiên AI đã lập (nhu cầu từng mã + định mức từng nhóm giá).
//   Mỗi tổ hợp 1–4 thùng được chấm TỔNG THỂ (không cộng điểm từng thùng):
//     · đúng mã đang cần (đủ 1 điểm) · cùng mẫu-màu khác size (0,6) · đúng nhóm giá nhưng mã khác (0,3)
//     · hàng dư / ngoài cơ cấu / phụ kiện / trùng giữa các thùng = lãng phí (trừ)
//     · đa dạng mẫu (1 − HHI) so với chính kế hoạch
//   Tìm bằng beam search (giữ 30 tổ hợp tốt nhất mỗi tầng, mở rộng bằng 150 thùng hợp nhất) — vài chục ms.
//   Phần kế hoạch thùng không phủ -> lấy bổ sung từ kho SA (lapKeHoach tính lại với số thùng đã chọn).
// ============================================================================
import { tachSize } from './DsBoLoc.jsx';
import { mauMa } from './dsLamTron.js';

const W_SEMI = 0.6, W_NHOM = 0.3, W_PHI = 0.6;

// spT: { bc: { mtc, gia, n3, img, pk } } · ds: [[ma, nhom, vi_tri, thu_tu, [[bc, sl, thu_hoi]]]]
// dich: { D: { bc: nhu cầu }, Qg: { gia: định mức }, mtc: { bc: mã } }
export function ghepThung(ds, spT, dich, { toiDa = 4, beam = 30, pool = 150 } = {}) {
  const { D, Qg } = dich;
  const Qt = Object.values(Qg).reduce((a, b) => a + b, 0);
  if (!Qt || !ds?.length) return null;
  const ma = (bc) => spT[bc]?.mtc || dich.mtc?.[bc] || bc;
  const nmCache = {}, mauCache = {};
  const nm = (bc) => (nmCache[bc] ??= tachSize(ma(bc))[0]);
  const mau = (bc) => (mauCache[bc] ??= mauMa(ma(bc)));
  const giaCua = (bc) => spT[bc]?.gia ?? dich.gia?.[bc] ?? null;

  // nhu cầu theo mẫu-màu (để chấm hàng cùng mẫu khác size)
  const bcTheoNm = {};
  Object.keys(D).forEach((bc) => { (bcTheoNm[nm(bc)] ||= []).push(bc); });
  // đa dạng của chính kế hoạch (chuẩn để so)
  const hhi = (m) => { const v = Object.values(m); const t = v.reduce((a, b) => a + b, 0); return t ? 1 - v.reduce((a, b) => a + (b / t) ** 2, 0) : 0; };
  const mauKH = {};
  Object.entries(D).forEach(([bc, q]) => { if (q > 0) mauKH[mau(bc)] = (mauKH[mau(bc)] || 0) + q; });
  const dvKH = Math.max(0.05, hhi(mauKH));

  // chuẩn bị thùng
  const B = ds.map(([t, nhom, vt, tt, ct], i) => {
    const it = []; let rut = 0, n = 0;
    (ct || []).forEach(([bc, sl, th]) => {
      if (!(sl > 0)) return;
      if (th) { rut += sl; return; }   // mã thu hồi đội sale: rút khỏi phiếu khi giao
      it.push({ bc, sl }); n += sl;
    });
    return { i, t, nhom, vt, tt, it, n, rut };
  }).filter((b) => b.n > 0 && b.n <= Qt * 1.1);

  const danhGia = (combo) => {
    const C = new Map(), soThung = new Map();
    combo.forEach((b) => b.it.forEach(({ bc, sl }) => { C.set(bc, (C.get(bc) || 0) + sl); soThung.set(bc, (soThung.get(bc) || 0) + 1); }));
    let N = 0, exact = 0, ngoai = 0, pk = 0, trung = 0;
    const Lnm = {}, Cg = {}, mauQ = {};
    for (const [bc, q] of C) {
      N += q;
      const d = D[bc] || 0, e = Math.min(q, d);
      exact += e;
      if (q > e) Lnm[nm(bc)] = (Lnm[nm(bc)] || 0) + (q - e);
      if (soThung.get(bc) > 1 && q > d) trung += q - d;
      const s = spT[bc] || {}, g = giaCua(bc);
      if (s.pk) { pk += q; continue; }
      if (g == null || Qg[g] == null) { ngoai += q; continue; }
      Cg[g] = (Cg[g] || 0) + q;
      mauQ[mau(bc)] = (mauQ[mau(bc)] || 0) + q;
    }
    let semi = 0;
    Object.entries(Lnm).forEach(([k, L]) => {
      const rd = (bcTheoNm[k] || []).reduce((a, bc) => a + Math.max(0, (D[bc] || 0) - (C.get(bc) || 0)), 0);
      semi += Math.min(L, rd);
    });
    const G = Object.entries(Cg).reduce((a, [g, c]) => a + Math.min(c, Qg[g]), 0);
    const nhomDu = Math.max(0, G - exact - semi);
    const useful = exact + W_SEMI * semi + W_NHOM * nhomDu;
    const phi = Math.max(0, N - useful);
    const dvRel = Math.min(1, hhi(mauQ) / dvKH);
    const J = useful - W_PHI * phi + 12 * dvRel;
    const P = N ? useful / N : 0;
    const Gfit = N ? G / N : 0;
    const diem = Math.round(100 * Math.max(0, Math.min(1, 0.6 * P + 0.25 * dvRel + 0.15 * Gfit)));
    return { J, N, exact, semi, nhomDu, useful, phi, ngoai, pk, trung, G, Cg, soMau: Object.keys(mauQ).length, dvRel, P, U: useful / Qt, diem, soMa: C.size };
  };

  // tầng 1: từng thùng
  const don = B.map((b) => ({ ds: [b], ...danhGia([b]) })).sort((a, b) => b.J - a.J);
  const hop = don.filter((x) => x.J > 0).slice(0, pool).map((x) => x.ds[0]);
  const theoSo = { 1: don.slice(0, 3) };
  let tang = don.slice(0, beam);
  for (let k = 2; k <= toiDa && hop.length >= k; k++) {
    const gap = new Map();
    tang.forEach((c) => {
      const co = new Set(c.ds.map((b) => b.i));
      hop.forEach((b) => {
        if (co.has(b.i)) return;
        const ds2 = [...c.ds, b];
        const khoa = ds2.map((x) => x.i).sort((u, v) => u - v).join(',');
        if (gap.has(khoa)) return;
        if (ds2.reduce((a, x) => a + x.n, 0) > Qt * 1.1) return;
        gap.set(khoa, { ds: ds2, ...danhGia(ds2) });
      });
    });
    tang = [...gap.values()].sort((a, b) => b.J - a.J).slice(0, beam);
    if (!tang.length) break;
    theoSo[k] = tang.slice(0, 3);
  }
  const moTa = (c) => {
    const ly = [];
    ly.push(`Phủ ${Math.round(c.U * 100)}% kế hoạch — ${Math.round(c.useful)} / ${Qt} cái dùng được`);
    ly.push(`${c.exact} cái đúng mã đang cần${c.semi ? ` · ${c.semi} cái cùng mẫu-màu khác size` : ''}`);
    if (c.nhomDu) ly.push(`${c.nhomDu} cái đúng nhóm giá, mẫu khác kế hoạch`);
    ly.push(`${c.soMau} mẫu · ${c.soMa} mã${c.trung ? ` · trùng ${c.trung} cái giữa các thùng` : ' · không trùng thừa giữa các thùng'}`);
    if (c.ngoai) ly.push(`${c.ngoai} cái ngoài cơ cấu giá`);
    if (c.pk) ly.push(`${c.pk} cái phụ kiện`);
    const du = Object.entries(c.Cg).filter(([g, v]) => v > Qg[g]);
    if (du.length) ly.push('Vượt định mức nhóm: ' + du.map(([g, v]) => `${Math.round(g / 1000)}k +${v - Qg[g]}`).join(', '));
    const rut = c.ds.reduce((a, b) => a + b.rut, 0);
    if (rut) ly.push(`Rút ${rut} cái thu hồi đội sale khi giao`);
    ly.push(`Còn ~${Math.max(0, Qt - Math.round(c.useful))} cái lấy bổ sung từ kho SA`);
    return ly;
  };
  const ra = (c) => c && ({ thung: c.ds.map((b) => b.t), chiTiet: c.ds.map((b) => ({ t: b.t, nhom: b.nhom, vt: b.vt, n: b.n })),
    n: c.N, dung: Math.round(c.useful), dungMa: c.exact, semi: c.semi, phi: Math.round(c.phi), ngoai: c.ngoai, pk: c.pk, trung: c.trung,
    phu: c.U, diem: c.diem, soMau: c.soMau, soMa: c.soMa, nhom: Object.entries(Qg).map(([g, q]) => ({ gia: +g, c: c.Cg[g] || 0, Q: q })), ly: moTa(c), J: c.J });
  const tungSo = {};
  Object.entries(theoSo).forEach(([k, arr]) => { tungSo[k] = arr.map(ra); });
  const tatCa = Object.values(tungSo).flat().filter(Boolean);
  const tot = tatCa.reduce((m, c) => (!m || c.J > m.J ? c : m), null);
  return { tungSo, tot, Qt, soThung: B.length, xepDon: don.slice(0, 80).map((x) => ({ t: x.ds[0].t, n: x.N, diem: x.diem, phu: x.U })) };
}

// Ruột các thùng đã chọn -> { san: { bc: sl dùng được }, rut: sl thu hồi, tong }
export function ruotThung(ds, chon) {
  const set = new Set(chon || []);
  const san = {}; let rut = 0, tong = 0;
  (ds || []).forEach(([t, , , , ct]) => {
    if (!set.has(t)) return;
    (ct || []).forEach(([bc, sl, th]) => { if (!(sl > 0)) return; if (th) { rut += sl; return; } san[bc] = (san[bc] || 0) + sl; tong += sl; });
  });
  return { san, rut, tong };
}
