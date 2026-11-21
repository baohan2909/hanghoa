// ============================================================================
// AI GHÉP TỔ HỢP THÙNG cho đội mới (v3.123.0 · mở rộng v3.125.0)
//   Đích: bộ hàng đầu tiên AI đã lập (nhu cầu từng mã + định mức từng nhóm giá).
//   Mỗi tổ hợp được chấm TỔNG THỂ (không cộng điểm từng thùng):
//     · đúng mã đang cần (đủ 1 điểm) · cùng mẫu-màu khác size (0,6) · đúng nhóm giá nhưng mã khác (0,3)
//     · hàng dư / ngoài cơ cấu / phụ kiện / trùng giữa các thùng = lãng phí (trừ)
//     · đa dạng mẫu (1 − HHI) so với chính kế hoạch
//   ghepThung   : theo SỐ THÙNG (1–4 mặc định, hoặc N bất kỳ anh chọn) — beam search, beam tự co theo N
//   ghepTheoGia : NEW - 3.125 theo TỔ HỢP GIÁ SALE (vd 250k 200 · 400k 172 · 500k 72) — số thùng tự do,
//                 bám sát số cái từng nhóm giá (tương đối), ưu tiên thùng có mã đang cần, đa dạng mẫu; trả 3 phương án khác nhau
//   chamBo      : NEW - 3.125 chấm lại 1 bộ thùng bất kỳ (khi anh tick bỏ bớt thùng trong 1 tổ hợp)
//   Phần kế hoạch thùng không phủ -> lấy bổ sung từ kho SA (lapKeHoach tính lại với số thùng đã chọn).
// ============================================================================
import { tachSize } from './DsBoLoc.jsx';
import { mauMa, kGia } from './dsLamTron.js';

const W_SEMI = 0.6, W_NHOM = 0.3, W_PHI = 0.6;

// spT: { bc: { mtc, gia, n3, img, pk } } · ds: [[ma, nhom, vi_tri, thu_tu, [[bc, sl, thu_hoi]]]]
// dich: { D: { bc: nhu cầu }, Qg: { gia: định mức }, mtc: { bc: mã } }
function chuanBi(ds, spT, dich) {
  const D = dich?.D || {}, Qg = dich?.Qg || {};
  const Qt = Object.values(Qg).reduce((a, b) => a + b, 0);
  const ma = (bc) => spT[bc]?.mtc || dich?.mtc?.[bc] || bc;
  const nmCache = {}, mauCache = {};
  const nm = (bc) => (nmCache[bc] ??= tachSize(ma(bc))[0]);
  const mau = (bc) => (mauCache[bc] ??= mauMa(ma(bc)));
  const giaCua = (bc) => spT[bc]?.gia ?? dich?.gia?.[bc] ?? null;

  // nhu cầu theo mẫu-màu (để chấm hàng cùng mẫu khác size)
  const bcTheoNm = {};
  Object.keys(D).forEach((bc) => { (bcTheoNm[nm(bc)] ||= []).push(bc); });
  // đa dạng của chính kế hoạch (chuẩn để so)
  const hhi = (m) => { const v = Object.values(m); const t = v.reduce((a, b) => a + b, 0); return t ? 1 - v.reduce((a, b) => a + (b / t) ** 2, 0) : 0; };
  const mauKH = {};
  Object.entries(D).forEach(([bc, q]) => { if (q > 0) mauKH[mau(bc)] = (mauKH[mau(bc)] || 0) + q; });
  const dvKH = Math.max(0.05, hhi(mauKH));

  // chuẩn bị thùng (mọi thùng có hàng — lọc theo kế hoạch do từng hàm tự làm)
  const B = (ds || []).map(([t, nhom, vt, tt, ct], i) => {
    const it = []; let rut = 0, n = 0, dung = 0;
    const gia = {}; let khac = 0; const mauB = {};
    (ct || []).forEach(([bc, sl, th]) => {
      if (!(sl > 0)) return;
      if (th) { rut += sl; return; }   // mã thu hồi đội sale: rút khỏi phiếu khi giao
      it.push({ bc, sl }); n += sl;
      dung += Math.min(sl, D[bc] || 0);
      const s = spT[bc] || {}, g = giaCua(bc);
      if (s.pk || !g) khac += sl; else gia[g] = (gia[g] || 0) + sl;
      mauB[mau(bc)] = (mauB[mau(bc)] || 0) + sl;
    });
    const mauChinh = Object.entries(mauB).sort((u, v) => v[1] - u[1])[0]?.[0] || '';
    return { i, t, nhom, vt, tt, it, n, rut, dung, gia, khac, mauChinh };
  }).filter((b) => b.n > 0);

  const danhGia = (combo) => {
    const C = new Map(), soThung = new Map();
    combo.forEach((b) => b.it.forEach(({ bc, sl }) => { C.set(bc, (C.get(bc) || 0) + sl); soThung.set(bc, (soThung.get(bc) || 0) + 1); }));
    let N = 0, exact = 0, ngoai = 0, pk = 0, trung = 0, khongGia = 0;
    const Lnm = {}, Cg = {}, mauQ = {}, Ctat = {};
    for (const [bc, q] of C) {
      N += q;
      const d = D[bc] || 0, e = Math.min(q, d);
      exact += e;
      if (q > e) Lnm[nm(bc)] = (Lnm[nm(bc)] || 0) + (q - e);
      if (soThung.get(bc) > 1 && q > d) trung += q - d;
      const s = spT[bc] || {}, g = giaCua(bc);
      if (s.pk) { pk += q; continue; }
      if (!g) { khongGia += q; ngoai += q; continue; }
      Ctat[g] = (Ctat[g] || 0) + q;
      if (Qg[g] == null) { ngoai += q; continue; }
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
    return { ds: combo, J, N, exact, semi, nhomDu, useful, phi, ngoai, pk, khongGia, trung, G, Cg, Ctat, soMau: Object.keys(mauQ).length, dvRel, P,
      U: Qt ? useful / Qt : 0, diem, soMa: C.size };
  };

  const moTa = (c, mt) => {
    const ly = [];
    if (mt) {
      const lech = mt.reduce((a, x) => a + Math.abs(x.c - x.T), 0), tongT = mt.reduce((a, x) => a + x.T, 0);
      ly.push(`Sát tổ hợp giá ${Math.max(0, Math.round((1 - lech / Math.max(1, tongT)) * 100))}% — ${lech ? `lệch ${lech} cái` : 'đúng từng cái'}`);
      const ngoaiMt = Object.entries(c.Ctat).filter(([g]) => !mt.some((x) => String(x.gia) === String(g))).reduce((a, [, v]) => a + v, 0) + c.pk + c.khongGia;
      if (ngoaiMt) ly.push(`${ngoaiMt} cái ngoài các giá của tổ hợp`);
    }
    if (Qt) ly.push(`Phủ ${Math.round(c.U * 100)}% kế hoạch — ${Math.round(c.useful)} / ${Qt} cái dùng được`);
    ly.push(`${c.exact} cái đúng mã đang cần${c.semi ? ` · ${c.semi} cái cùng mẫu-màu khác size` : ''}`);
    if (c.nhomDu && !mt) ly.push(`${c.nhomDu} cái đúng nhóm giá, mẫu khác kế hoạch`);
    ly.push(`${c.soMau} mẫu · ${c.soMa} mã${c.trung ? ` · trùng ${c.trung} cái giữa các thùng` : ' · không trùng thừa giữa các thùng'}`);
    if (!mt && c.ngoai) ly.push(`${c.ngoai} cái ngoài cơ cấu giá`);
    if (!mt && c.pk) ly.push(`${c.pk} cái phụ kiện`);
    const du = Object.entries(c.Cg).filter(([g, v]) => v > Qg[g]);
    if (du.length) ly.push('Vượt định mức nhóm: ' + du.map(([g, v]) => `${kGia(+g)} +${v - Qg[g]}`).join(', '));
    const rut = c.ds.reduce((a, b) => a + b.rut, 0);
    if (rut) ly.push(`Rút ${rut} cái thu hồi đội sale khi giao`);
    if (Qt) ly.push(`Còn ~${Math.max(0, Qt - Math.round(c.useful))} cái lấy bổ sung từ kho SA`);
    return ly;
  };
  // mt: [{gia, T}] (tổ hợp giá) -> thêm c (đã đạt) từng giá
  const ra = (c, mtGoc) => {
    if (!c) return null;
    const mt = mtGoc ? mtGoc.map((x) => ({ gia: x.gia, T: x.T, c: c.Ctat[x.gia] || 0 })) : null;
    return { thung: c.ds.map((b) => b.t), chiTiet: c.ds.map((b) => ({ t: b.t, nhom: b.nhom, vt: b.vt, n: b.n })),
      n: c.N, dung: Math.round(c.useful), dungMa: c.exact, semi: c.semi, phi: Math.round(c.phi), ngoai: c.ngoai, pk: c.pk, trung: c.trung,
      phu: c.U, diem: c.diem, soMau: c.soMau, soMa: c.soMa, nhom: Object.entries(Qg).map(([g, q]) => ({ gia: +g, c: c.Cg[g] || 0, Q: q })),
      mt, lech: mt ? mt.reduce((a, x) => a + Math.abs(x.c - x.T), 0) : null, ly: moTa(c, mt), J: c.J };
  };
  return { B, D, Qg, Qt, danhGia, ra };
}

// Theo SỐ THÙNG. soThung: danh sách số thùng cần trả (vd [1,2,3,4] hoặc [7])
export function ghepThung(ds, spT, dich, { soThung = [1, 2, 3, 4], beam, pool } = {}) {
  const cb = chuanBi(ds, spT, dich);
  const { Qt, danhGia, ra } = cb;
  if (!Qt || !cb.B.length) return null;
  const toiDa = Math.max(...soThung);
  beam ??= toiDa <= 4 ? 24 : toiDa <= 8 ? 12 : 8;    // N lớn: beam nhỏ lại cho nhanh (vài trăm ms)
  pool ??= toiDa <= 4 ? 120 : toiDa <= 8 ? 90 : 70;
  const B = cb.B.filter((b) => b.n <= Qt * 1.1);
  // tầng 1: từng thùng
  const don = B.map((b) => danhGia([b])).sort((a, b) => b.J - a.J);
  const hop = don.filter((x) => x.J > 0).slice(0, pool).map((x) => x.ds[0]);
  const theoSo = { 1: don.slice(0, 3) };
  let tang = don.slice(0, beam);
  for (let k = 2; k <= toiDa && hop.length >= k; k++) {
    const gap = new Map();
    tang.forEach((c) => {
      const co = new Set(c.ds.map((b) => b.i));
      hop.forEach((b) => {
        if (co.has(b.i)) return;
        if (c.N + b.n > Qt * 1.1) return;
        const ds2 = [...c.ds, b];
        const khoa = ds2.map((x) => x.i).sort((u, v) => u - v).join(',');
        if (gap.has(khoa)) return;
        gap.set(khoa, danhGia(ds2));
      });
    });
    tang = [...gap.values()].sort((a, b) => b.J - a.J).slice(0, beam);
    if (!tang.length) break;
    theoSo[k] = tang.slice(0, 3);
  }
  const tungSo = {};
  soThung.forEach((k) => { if (theoSo[k]) tungSo[k] = theoSo[k].map((c) => ra(c)); });
  const tatCa = Object.values(tungSo).flat().filter(Boolean);
  const tot = tatCa.reduce((m, c) => (!m || c.J > m.J ? c : m), null);
  return { tungSo, tot, Qt, soThung: B.length, xepDon: don.slice(0, 80).map((x) => ({ t: x.ds[0].t, n: x.N, diem: x.diem, phu: x.U })) };
}

// NEW - 3.125: theo TỔ HỢP GIÁ SALE. muc: [{ gia, sl }] — số cái mong muốn từng nhóm giá (tương đối)
//   Sai số = thiếu (×1) + dư (×1,25) từng giá + hàng ngoài các giá của tổ hợp (×0,9)
//   B1: mỗi giá giải bài toán "chọn thùng cho đủ đúng số cái" (quy hoạch động 0/1 — thùng 50 / 36 / 35 cái ghép sát nhất),
//       cùng sai số thì lấy bộ có nhiều mã đang cần hơn
//   B2: đổi chéo từng thùng (cùng giá chính) để giảm sai số chung + bớt lặp mẫu giữa các thùng
//   Phương án 2, 3: chạy lại, thùng đã nằm ở phương án trước bị trừ điểm -> ra bộ khác hẳn nếu kho thùng cho phép
export function ghepTheoGia(ds, spT, dich, muc, { soPA = 3 } = {}) {
  const cb = chuanBi(ds, spT, dich);
  const mt = (muc || []).filter((x) => +x.gia > 0 && +x.sl > 0).map((x) => ({ gia: +x.gia, T: Math.round(+x.sl) }));
  if (!mt.length || !cb.B.length) return null;
  const keys = mt.map((x) => x.gia);
  const T = keys.map((g) => mt.find((x) => x.gia === g).T);
  const Tt = T.reduce((a, b) => a + b, 0);
  // thùng ứng viên: ≥ 60% hàng thuộc các giá của tổ hợp; giá chính = giá nhiều cái nhất trong thùng
  const U = cb.B.map((b) => {
    const v = keys.map((g) => b.gia[g] || 0);
    const trong = v.reduce((a, x) => a + x, 0);
    const j = v.indexOf(Math.max(...v));
    return { b, v, ng: b.n - trong, j, gt: (b.dung - 2 * (b.n - trong)) };
  }).filter((u) => u.v[u.j] > 0 && u.b.n - u.ng >= u.b.n * 0.6 && u.b.n <= Tt * 1.15);
  if (!U.length) return { pa: [], Tt, mt, soThung: 0 };
  const saiSo = (C, ng) => C.reduce((a, c, j) => a + (c < T[j] ? T[j] - c : 1.25 * (c - T[j])), 0) + 0.9 * ng;
  const tongJ = (bo) => {
    const C = keys.map(() => 0); let ng = 0, dung = 0, lap = 0; const mau = new Set();
    bo.forEach((u) => { u.v.forEach((x, j) => { C[j] += x; }); ng += u.ng; dung += u.b.dung; if (mau.has(u.b.mauChinh)) lap++; else mau.add(u.b.mauChinh); });
    return -saiSo(C, ng) + 0.02 * dung - 1.5 * lap;
  };
  const daDung = new Map();   // thùng -> số phương án đã dùng
  const motPA = () => {
    const giaTri = (u) => u.gt - 300 * (daDung.get(u.b.i) || 0);
    let bo = [];
    keys.forEach((g, j) => {
      const ds2 = U.filter((u) => u.j === j);
      const Smax = Math.round(T[j] * 1.25) + 1;
      // dp[s] = giá trị tốt nhất khi tổng đúng s cái (giá này); lấy[k][s] = có lấy thùng k
      const dp = new Float64Array(Smax + 1).fill(-Infinity); dp[0] = 0;
      const lay = ds2.map(() => new Uint8Array(Smax + 1));
      ds2.forEach((u, k) => {
        const w = u.v[j], val = giaTri(u);
        for (let s = Smax; s >= w; s--) if (dp[s - w] > -Infinity && dp[s - w] + val > dp[s]) { dp[s] = dp[s - w] + val; lay[k][s] = 1; }
      });
      let tot = 0, totD = -Infinity;
      for (let s = 0; s <= Smax; s++) {
        if (dp[s] === -Infinity) continue;
        const d = -(s < T[j] ? T[j] - s : 1.25 * (s - T[j])) + 0.02 * dp[s];
        if (d > totD) { totD = d; tot = s; }
      }
      // lần ngược
      let s = tot;
      for (let k = ds2.length - 1; k >= 0 && s > 0; k--) if (lay[k][s]) { bo.push(ds2[k]); s -= ds2[k].v[j]; }
    });
    // B2: đổi chéo / bỏ bớt / thêm — tới khi không cải thiện
    const coSet = () => new Set(bo.map((u) => u.b.i));
    let J = tongJ(bo) - 0.02 * 300 * bo.reduce((a, u) => a + (daDung.get(u.b.i) || 0), 0);
    const Jp = (x) => tongJ(x) - 0.02 * 300 * x.reduce((a, u) => a + (daDung.get(u.b.i) || 0), 0);
    for (let vong = 0; vong < 40; vong++) {
      let totJ = J, totBo = null;
      const co = coSet();
      bo.forEach((u, k) => {
        const bot = bo.filter((_, q) => q !== k);
        const jb = Jp(bot); if (jb > totJ + 1e-9) { totJ = jb; totBo = bot; }
        U.forEach((w) => { if (co.has(w.b.i) || w.j !== u.j) return; const thay = [...bot, w]; const jt = Jp(thay); if (jt > totJ + 1e-9) { totJ = jt; totBo = thay; } });
      });
      U.forEach((w) => { if (co.has(w.b.i)) return; const them = [...bo, w]; const jt = Jp(them); if (jt > totJ + 1e-9) { totJ = jt; totBo = them; } });
      if (!totBo) break;
      bo = totBo; J = totJ;
    }
    return bo;
  };
  const pa = [], khoa = new Set();
  for (let k = 0; k < soPA; k++) {
    const bo = motPA();
    if (!bo.length) break;
    const kh = bo.map((u) => u.b.i).sort((p, q) => p - q).join(',');
    bo.forEach((u) => daDung.set(u.b.i, (daDung.get(u.b.i) || 0) + 1));
    if (khoa.has(kh)) continue;
    khoa.add(kh);
    pa.push(cb.ra(cb.danhGia(bo.map((u) => u.b)), mt));
  }
  pa.sort((p, q) => p.lech - q.lech || q.dung - p.dung);
  return { pa, Tt, mt, soThung: U.length };
}

// NEW - 3.125: chấm 1 bộ thùng bất kỳ (tick bỏ bớt thùng trong tổ hợp) — muc: tổ hợp giá (nếu có)
export function chamBo(ds, spT, dich, chon, muc) {
  const cb = chuanBi(ds, spT, dich);
  const set = new Set(chon || []);
  const combo = cb.B.filter((b) => set.has(b.t));
  if (!combo.length) return null;
  const mt = muc ? muc.filter((x) => +x.gia > 0 && +x.sl > 0).map((x) => ({ gia: +x.gia, T: Math.round(+x.sl) })) : null;
  return cb.ra(cb.danhGia(combo), mt && mt.length ? mt : null);
}

// NEW - 3.125: tóm tắt từng thùng cho bảng "Kho thùng" (số cái, cơ cấu giá, số mã cần, độ hợp)
export function tomThung(ds, spT, dich) {
  const cb = chuanBi(ds, spT, dich);
  return cb.B.map((b) => {
    const c = cb.danhGia([b]);
    const giaTxt = Object.entries(b.gia).sort((u, v) => v[1] - u[1]).map(([g, v]) => `${kGia(+g)} ${v}`).concat(b.khac ? [`khác ${b.khac}`] : []).join(' · ');
    const giaChinh = +(Object.entries(b.gia).sort((u, v) => v[1] - u[1])[0]?.[0] || 0);
    return { t: b.t, nhom: b.nhom || '', vt: b.vt || '', tt: b.tt, n: b.n, rut: b.rut, soMa: b.it.length, dung: b.dung, giaTxt, giaChinh, diem: c.diem, gia: b.gia };
  });
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
