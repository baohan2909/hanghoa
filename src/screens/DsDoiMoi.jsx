import { useEffect, useMemo, useRef, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { useApp } from '../App.jsx';
import { IcCheck, IcDown, IcAlert, IcSpark, IcTeam, IcTarget } from '../lib/icons.jsx';
import { AnhSP } from './DsBanChia.jsx';
import { TrangThaiLuu, baoLoiXacNhan, fmtN, lsGet, lsSet, so, tenNgan, useNhap, xuatHaiFile, tenPhieu, useHoiGhiChu, ghiDong1, KHO_TEN, odooTuKq } from './dsChung.jsx';
import { useLamTron, quyTac, lenMuc, xuongMuc, mucNho, canBang, chiaTyTrong, kGia, hoMau, mauMa, moTaMuc } from './dsLamTron.js';
import { tachSize, thuTuSize } from './DsBoLoc.jsx';
import { ghepThung, ruotThung } from './dsGhepThung.js';
import { ThCot, useSapLoc, locVaSap } from './DsLocCot.jsx';

// ============================================================================
// CHIA TRƯỚC CHO ĐỘI MỚI (v3.112.0)
//   1. Đội mới: tên, mã (nếu đã có), khu vực dự kiến, tổng nón (mặc định 1.050)
//   2. Đội tham chiếu: AI gợi ý 3 đội giống nhất (cơ cấu giá, sức bán, độ đủ dữ liệu) · 1 đội chính + nhiều đội phụ
//   3. Cơ cấu giá: 250k 500 · 350k 50 · 400k 400 · 500k 100 (47,62% · 4,76% · 38,10% · 9,52%) — co giãn theo tổng, sửa được
//   4. Phân bổ từng nhóm giá: xếp mã theo SỐ BÁN THẬT (đội tham chiếu, chuẩn hoá theo quy mô đội + 15% toàn mạng)
//      -> tỷ trọng màu -> tỷ trọng size; trần mỗi mẫu 25% nhóm (đa dạng); làm tròn LÊN theo giá; cân đúng tổng nhóm
//      Thiếu kho: size khác cùng mẫu-màu -> mẫu khác cùng giá + cùng màu + cùng size (tự động);
//                 khác màu: chỉ đề xuất, phải bấm Đồng ý. Không dùng tồn của đội tham chiếu làm gốc.
//   5. Điểm phù hợp 0–100 + lý do từng mã · cảnh báo thiếu cơ cấu / tập trung 1 mẫu, 1 màu · tính lại ngay khi đổi
//   Nháp: ds_nhap 'doimoi:<id>' (lưu trước khi đội chính thức có mã). SQL 202: fn_ds_doi_moi_du_lieu
//   v3.123.0 (SQL 212): nhập SỐ ĐỘI (vd 35 -> DOISALE35 / Đội SALE 35, chưa có thì tự tạo khi xác nhận)
//     + AI ghép TỔ HỢP 1–4 THÙNG đóng sẵn (dsGhepThung.js) -> phần thiếu lấy bổ sung từ kho SA
//     + bảng từng nhóm giá: bấm tiêu đề sắp xếp, phễu lọc (DsLocCot.jsx)
// ============================================================================
const ngan = (ma) => String(ma || '').replace('DOISALE', '');
const dayDu = (k) => 'DOISALE' + k;
// NEW - số đội: quy tắc hiện hữu DOISALE01..99 (2 chữ số), từ 100 giữ nguyên
export const maTuSo = (n) => (n > 0 ? 'DOISALE' + (n < 10 ? '0' + n : String(n)) : '');
export const tenTuSo = (n) => (n > 0 ? 'Đội SALE ' + (n < 10 ? '0' + n : String(n)) : '');
const soTuMa = (ma) => { const m = String(ma || '').trim().toUpperCase().match(/^(?:DOISALE)?0*(\d{1,3})$/); return m ? +m[1] : null; };
let boNhoThung = null;   // {luc, data} — thùng sẵn sàng (fn_ds_thung_san)
let boNhoDl = null;   // {cuaSo, luc, data}

function macDinhNhap(cfg) {
  const dm = cfg.doi_moi || {};
  return { ten: '', ma: '', kv: '', tong: dm.tong || 1050, chinh: null, phu: [], thung: [], wChinh: Math.round((dm.w_chinh ?? 0.6) * 100),
    coCau: (dm.co_cau || []).map((g) => ({ gia: g.gia, sl: g.sl })), sua: {}, dongY: {}, bo: [], them: {}, tranMau: Math.round((dm.tran_mau ?? 0.25) * 100) };
}

// Co giãn cơ cấu về tổng mới: giữ tỷ trọng, làm tròn từng nhóm theo bước của nhóm, phần lẻ dồn vào nhóm linh hoạt (có mức 3) hoặc nhóm lớn nhất
export function coGianCoCau(coCau, tong, cfg) {
  const S = coCau.reduce((a, g) => a + (+g.sl || 0), 0);
  if (!S || !(tong > 0)) return coCau;
  const ra = coCau.map((g) => { const q = quyTac({ gia: g.gia }, cfg); const b = q.buoc || 5; return { ...g, sl: Math.round(((+g.sl || 0) * tong) / S / b) * b, q }; });
  const lech = tong - ra.reduce((a, g) => a + g.sl, 0);
  if (lech) {
    const linh = ra.find((g) => (g.q.muc || []).length) || [...ra].sort((a, b) => b.sl - a.sl)[0];
    linh.sl = Math.max(0, linh.sl + lech);
  }
  return ra.map(({ q, ...g }) => g);
}

// Gợi ý 3 đội tham chiếu
function goiYDoi(data, coCau, kv) {
  const tongCC = coCau.reduce((a, g) => a + (+g.sl || 0), 0) || 1;
  const ds = data.doi.filter((d) => d.ban > 0);
  const moiNgay = (d) => d.ban / Math.max(1, d.ngay || data.cua_so);
  const maxNgay = Math.max(1, ...ds.map(moiNgay));
  return ds.map((d) => {
    const tot = coCau.reduce((a, g) => a + (d.mix?.[g.gia] || 0), 0);
    const sim = tot ? 1 - 0.5 * coCau.reduce((a, g) => a + Math.abs((d.mix?.[g.gia] || 0) / tot - (+g.sl || 0) / tongCC), 0) : 0;
    const manh = moiNgay(d) / maxNgay, du = Math.min(1, (d.ngay || 0) / (data.cua_so * 0.75));
    const kvKhop = kv && kv.trim().length >= 2 && (d.ten || '').toLowerCase().includes(kv.trim().toLowerCase());
    const diem = Math.min(100, Math.round(100 * (0.5 * sim + 0.3 * manh + 0.2 * du)) + (kvKhop ? 5 : 0));
    return { k: ngan(d.ma), d, diem, sim, ly: [`Cơ cấu giá giống ${Math.round(sim * 100)}%`, `Bán ${fmtN(Math.round(moiNgay(d)))} cái/ngày`, `${d.ngay}/${data.cua_so} ngày có bán`, kvKhop ? 'Trùng khu vực' : null].filter(Boolean) };
  }).sort((a, b) => b.diem - a.diem);
}

// ---------------------------------------------------------------------------
// LẬP KẾ HOẠCH (chạy trên máy — tính lại ngay khi đổi bất kỳ thông số nào)
// ---------------------------------------------------------------------------
export function lapKeHoach(data, dl, cfg, tg = null) {   // tg: { san: {bc: sl trong thùng đã chọn}, sp: {bc: {mtc, gia, n3, img, pk}} }
  const dm = cfg.doi_moi || {};
  const wMang = dm.w_mang ?? 0.15;
  const tranMau = (dl.tranMau ?? 25) / 100;
  const tranMauSac = dm.tran_mau_sac ?? 0.5;
  const phu = (dl.phu || []).filter((p) => p !== dl.chinh);
  const refs = [dl.chinh, ...phu].filter(Boolean);
  const wC = phu.length ? (dl.wChinh ?? 60) / 100 : 1;
  const w = {};
  if (dl.chinh) w[dl.chinh] = wC;
  phu.forEach((p) => { w[p] = (1 - wC) / phu.length; });
  const banDoi = Object.fromEntries(data.doi.map((d) => [ngan(d.ma), d.ban || 0]));
  const bo = new Set(dl.bo || []);
  const rows = data.sp.map((r) => {
    const [nhomMa, size] = tachSize(r[1]);
    return { bc: r[0], mtc: r[1], n3: r[2], img: r[3], gia: r[4], nguonGia: r[5], kd1: r[6] || 0, kd2: r[7] || 0, kd: (r[6] || 0) + (r[7] || 0),
      banMang: r[8] || 0, o: r[9] || {}, t: r[10] || {}, mau: mauMa(r[1]), hm: hoMau(r[1]), nhomMa, size };
  });
  // NEW - 212: mã chỉ có trong thùng (kho SA không có, đội chưa bán) vẫn vào nhóm giá của nó
  const sanT = tg?.san || {};
  if (tg) {
    const co = new Set(rows.map((x) => x.bc));
    Object.keys(sanT).forEach((bc) => {
      const s = tg.sp?.[bc]; if (co.has(bc) || !s || s.pk || !s.gia) return;
      const [nhomMa, size] = tachSize(s.mtc || bc);
      rows.push({ bc, mtc: s.mtc || bc, n3: s.n3 || '', img: s.img || null, gia: s.gia, nguonGia: 'thung', kd1: 0, kd2: 0, kd: 0,
        banMang: 0, o: {}, t: {}, mau: mauMa(s.mtc || bc), hm: hoMau(s.mtc || bc), nhomMa, size, chiThung: true });
    });
  }
  rows.forEach((x) => { x.san = sanT[x.bc] || 0; });
  const tongMang = rows.reduce((a, x) => a + x.banMang, 0) || 1;
  rows.forEach((x) => {
    x.refShare = refs.reduce((a, t) => a + ((w[t] || 0) * (x.o[t] || 0)) / Math.max(1, banDoi[t] || 0), 0);
    x.netShare = x.banMang / tongMang;
    x.p = refs.length ? (1 - wMang) * x.refShare + wMang * x.netShare : x.netShare;
    x.banRef = refs.reduce((a, t) => a + (x.o[t] || 0), 0);
    x.banChinh = dl.chinh ? x.o[dl.chinh] || 0 : 0;
    x.tonRef = refs.reduce((a, t) => a + (x.t[t] || 0), 0);
  });
  const canh = [];
  // cơ cấu bán của đội tham chiếu (theo trọng số) để so với cơ cấu đặt
  const mixRef = {};
  rows.forEach((x) => { if (x.gia) mixRef[x.gia] = (mixRef[x.gia] || 0) + refs.reduce((a, t) => a + ((w[t] || 0) * (x.o[t] || 0)) / Math.max(1, banDoi[t] || 0), 0); });
  const tongMixRef = Object.values(mixRef).reduce((a, b) => a + b, 0);
  const tongCC = dl.coCau.reduce((a, g) => a + (+g.sl || 0), 0) || 1;

  const nhom = dl.coCau.map((g) => {
    const Q = +g.sl || 0;
    const qt = quyTac({ gia: g.gia }, cfg);
    const minL = mucNho(qt);
    const rowsG = rows.filter((x) => x.gia === g.gia);
    const thungG = rowsG.reduce((t, x) => t + x.san, 0);   // NEW - 212: phần thùng đã phủ trong nhóm
    const Qsa = Math.max(0, Q - thungG);                   // phần còn lại lấy từ kho SA
    const rowsDung = rowsG.filter((x) => !bo.has(x.bc));
    const canhN = [];
    let cand = rowsDung.filter((x) => x.p > 0).sort((a, b) => b.p - a.p);
    let theoKho = false;
    if (!cand.length && Q > 0) {
      cand = rowsDung.filter((x) => x.kd > 0).sort((a, b) => b.kd - a.kd).map((x) => ({ ...x, p: x.kd }));
      theoKho = true;
      if (cand.length) canhN.push(`Nhóm ${kGia(g.gia)}: chưa có số bán ở đội tham chiếu lẫn toàn mạng — tạm chia theo tồn kho SA`);
    }
    // bỏ mã quá nhỏ (dưới nửa mức làm tròn nhỏ nhất) rồi chia lại
    for (let v = 0; v < 8 && Q > 0; v++) {
      const P = cand.reduce((a, x) => a + x.p, 0) || 1;
      const giu = cand.filter((x) => (Q * x.p) / P >= minL * 0.5);
      if (!giu.length || giu.length === cand.length) break;
      cand = giu;
    }
    // mẫu bán chạy nhất nhóm (theo số bán thật) + số mẫu còn kho — cho ô gợi ý "Trần mỗi mẫu"
    const pMau = {};
    cand.forEach((x) => { pMau[x.mau] = (pMau[x.mau] || 0) + x.p; });
    const tongPM = Object.values(pMau).reduce((t, v) => t + v, 0);
    const [topMau, topP] = Object.entries(pMau).sort((u, v) => v[1] - u[1])[0] || ['', 0];
    const topPt = !theoKho && tongPM ? topP / tongPM : 0;
    const soMauKho = new Set(rowsDung.filter((x) => x.kd > 0).map((x) => x.mau)).size;
    // trần mỗi mẫu (đa dạng) — chỉ áp khi nhóm đủ lớn
    const P0 = cand.reduce((a, x) => a + x.p, 0) || 1;
    const raw = Object.fromEntries(cand.map((x) => [x.bc, (Q * x.p) / P0]));
    const capMau = Q >= 50 && new Set(cand.map((x) => x.mau)).size >= 4 ? Math.max(minL, Math.floor(Q * tranMau)) : Infinity;
    if (Number.isFinite(capMau)) {
      // cắt mẫu vượt trần; phần dư chuyển sang mẫu khác nhưng mỗi mẫu nhận tối đa 1,6× nhu cầu của chính nó
      // (không để mẫu bán ít "ăn" hơn mẫu bán chạy); không chỗ nhận thì trả lại mẫu bị cắt -> có cảnh báo tập trung
      const goc = {};
      cand.forEach((x) => { goc[x.mau] = (goc[x.mau] || 0) + raw[x.bc]; });
      const nhan = { ...goc };
      let du = 0; const cat = {};
      Object.entries(goc).forEach(([m, t]) => { if (t > capMau) { cat[m] = t - capMau; du += t - capMau; nhan[m] = capMau; } });
      const tranNhan = (m) => (cat[m] ? capMau : Math.min(capMau, goc[m] * 1.6));
      for (let v = 0; v < 8 && du > 0.01; v++) {
        const mo = Object.keys(goc).filter((m) => !cat[m] && nhan[m] < tranNhan(m) - 1e-9);
        const W = mo.reduce((t, m) => t + goc[m], 0);
        if (!W) break;
        let dung = 0;
        mo.forEach((m) => { const them = Math.min((du * goc[m]) / W, tranNhan(m) - nhan[m]); nhan[m] += them; dung += them; });
        du -= dung;
        if (dung < 1e-9) break;
      }
      if (du > 0.01) { const C = Object.values(cat).reduce((t, v) => t + v, 0); Object.keys(cat).forEach((m) => { nhan[m] += (du * cat[m]) / C; }); }
      cand.forEach((x) => { raw[x.bc] = goc[x.mau] > 0 ? (raw[x.bc] * nhan[x.mau]) / goc[x.mau] : raw[x.bc]; });
    }
    // nhu cầu lý tưởng (chưa xét kho) — làm tròn lên, cân đúng tổng nhóm
    const muon = chiaTyTrong(Q, cand.map((x) => ({ k: x.bc, w: raw[x.bc] })), qt).a;
    // NEW - 212: trừ phần thùng đã có -> nhu cầu lấy kho SA (làm tròn lên theo giá)
    const sanCua = Object.fromEntries(rowsG.map((x) => [x.bc, x.san]));
    const muonSA = {};
    Object.entries(muon).forEach(([k, v]) => { const c = Math.max(0, v - (sanCua[k] || 0)); muonSA[k] = c > 0 ? lenMuc(c, qt) : 0; });
    // xét kho + thay thế
    const theoBc = Object.fromEntries(rowsG.map((x) => [x.bc, x]));
    const kdCon = Object.fromEntries(rowsG.map((x) => [x.bc, x.kd]));
    const a = {}, thay = {}, choKhac = [];
    const sxP = (u, v2) => v2.p - u.p || v2.banMang - u.banMang;
    const tongMau = (m) => rowsG.reduce((t, y) => t + (y.mau === m ? (a[y.bc] || 0) + y.san : 0), 0);
    const dongYTheoCho = {};
    Object.entries(dl.dongY || {}).forEach(([bcY, o]) => { if (theoBc[bcY] && o?.cho) (dongYTheoCho[o.cho] = dongYTheoCho[o.cho] || []).push({ bc: bcY, sl: o.sl }); });
    cand.forEach((x) => {
      const d = muonSA[x.bc] || 0;
      if (!d) return;
      const lay = Math.min(d, xuongMuc(kdCon[x.bc], qt));
      a[x.bc] = (a[x.bc] || 0) + lay; kdCon[x.bc] -= lay;
      let thieu = d - lay;
      if (thieu <= 0) return;
      // khác màu anh đã đồng ý cho mã này
      (dongYTheoCho[x.bc] || []).forEach((o) => {
        if (thieu <= 0) return;
        const them = Math.min(lenMuc(Math.min(o.sl, thieu), qt), xuongMuc(kdCon[o.bc], qt));
        if (them <= 0) return;
        a[o.bc] = (a[o.bc] || 0) + them; kdCon[o.bc] -= them; thieu -= them;
        (thay[o.bc] = thay[o.bc] || []).push({ cho: x.mtc, sl: them, loai: 'khac' });
      });
      const A = rowsDung.filter((y) => y.bc !== x.bc && y.nhomMa === x.nhomMa && kdCon[y.bc] > 0).sort(sxP);
      // mẫu khác cùng màu: không đẩy mẫu đã chạm trần đa dạng
      const B = rowsDung.filter((y) => y.mau !== x.mau && y.hm === x.hm && y.size === x.size && kdCon[y.bc] > 0 && tongMau(y.mau) < capMau).sort(sxP);
      [['size', A], ['mau', B]].forEach(([loai, ds]) => ds.forEach((y) => {
        if (thieu <= 0) return;
        const them = Math.min(lenMuc(thieu, qt), xuongMuc(kdCon[y.bc], qt));
        if (them <= 0) return;
        a[y.bc] = (a[y.bc] || 0) + them; kdCon[y.bc] -= them; thieu -= them;
        (thay[y.bc] = thay[y.bc] || []).push({ cho: x.mtc, sl: them, loai });
      }));
      if (thieu > 0) {
        const C = rowsDung.filter((y) => y.hm !== x.hm && y.size === x.size && kdCon[y.bc] > 0).sort(sxP).slice(0, 3)
          .map((y) => ({ y, sl: Math.min(lenMuc(thieu, qt), xuongMuc(kdCon[y.bc], qt)) })).filter((o) => o.sl > 0);
        choKhac.push({ x, thieu, goiY: C });
      }
    });
    // mã anh tự thêm vào nhóm (AI vẫn cân tổng quanh các mã này)
    Object.entries(dl.them || {}).forEach(([bc, sl]) => {
      if (!theoBc[bc] || bo.has(bc) || a[bc]) return;
      const v = Math.min(lenMuc(+sl || minL, qt), xuongMuc(kdCon[bc], qt));
      if (v > 0) { a[bc] = v; kdCon[bc] -= v; }
    });
    // cân đúng tổng nhóm (giữ mức làm tròn, không vượt kho)
    const dsCB = rowsDung.map((x) => ({ k: x.bc, w: cand.find((c) => c.bc === x.bc) ? x.p || 1e-9 : (a[x.bc] ? 1e-9 : 0), raw: muonSA[x.bc] || 0, tran: x.kd }));
    const mauCua = Object.fromEntries(rowsG.map((x) => [x.bc, x.mau]));
    const lech = Qsa > 0 ? canBang(a, dsCB, Qsa, qt, (d, tang) => tongMau(mauCua[d.k]) + tang <= capMau) : 0;
    // điểm + lý do
    const daChon = rowsG.filter((x) => (a[x.bc] || 0) > 0 || (muon[x.bc] || 0) > 0 || (dl.sua || {})[x.bc] > 0 || x.san > 0);
    const maxRef = Math.max(1e-12, ...rowsG.map((x) => x.refShare));
    const maxNet = Math.max(1e-12, ...rowsG.map((x) => x.netShare));
    const mauSac = {};
    cand.forEach((x) => { mauSac[x.hm] = (mauSac[x.hm] || 0) + x.p; });
    const tongMS = Object.values(mauSac).reduce((u, v) => u + v, 0) || 1;
    const maxMS = Math.max(1e-12, ...Object.values(mauSac));
    const xepHang = Object.fromEntries([...rowsG].sort(sxP).map((x, i) => [x.bc, i + 1]));
    const dong = daChon.map((x) => {
      const dn = a[x.bc] || 0;
      const r = x.refShare / maxRef, n = x.netShare / maxNet, k = Math.min(1, x.kd / Math.max(1, dn || muon[x.bc] || 1)), c = (mauSac[x.hm] || 0) / maxMS;
      const diem = Math.round(100 * (refs.length ? 0.45 * r + 0.25 * n + 0.15 * k + 0.15 * c : 0.7 * n + 0.15 * k + 0.15 * c));
      const ly = [];
      if (x.banChinh) ly.push(`Đội ${dl.chinh} bán ${x.banChinh}`);
      if (x.banRef > x.banChinh) ly.push(`ĐTC khác bán ${x.banRef - x.banChinh}`);
      if (!x.banRef && refs.length) ly.push('Đội tham chiếu chưa bán');
      ly.push(`Toàn mạng ${fmtN(x.banMang)} · #${xepHang[x.bc]} nhóm`);
      if (x.hm) ly.push(`Màu ${x.hm} ${Math.round(((mauSac[x.hm] || 0) / tongMS) * 100)}% nhóm`);
      ly.push(`Kho ${fmtN(x.kd)}`);
      (thay[x.bc] || []).forEach((t) => ly.push(`Thay ${t.sl} cho ${t.cho}${t.loai === 'size' ? ' (khác size)' : t.loai === 'mau' ? ' (cùng màu, mẫu khác)' : ' (khác màu — đã đồng ý)'}`));
      const thieuMa = Math.max(0, (muonSA[x.bc] || 0) - Math.min(muonSA[x.bc] || 0, x.kd));
      if (thieuMa) ly.push(`Thiếu kho ${thieuMa} — đã tìm thay thế`);
      if (x.san) ly.unshift(`Thùng có ${x.san}${x.chiThung ? ' (kho SA không có)' : ''}`);
      const thuc = (dl.sua || {})[x.bc] ?? dn;
      return { x, dn, muon: muon[x.bc] || 0, thuc, th: x.san, diem: Math.max(0, Math.min(100, diem)), ly, thay: thay[x.bc] || null, thieuMa, tuThem: !!(dl.them || {})[x.bc] };
    }).sort((u, v) => (v.dn + v.th) - (u.dn + u.th) || v.diem - u.diem || u.x.nhomMa.localeCompare(v.x.nhomMa) || thuTuSize(u.x.size) - thuTuSize(v.x.size));
    const thuc = dong.reduce((s, d) => s + (d.thuc || 0), 0);
    const ai = dong.reduce((s, d) => s + d.dn, 0);
    const tong = thuc + thungG;   // nhận = thùng + kho SA
    // cảnh báo nhóm
    const khoDu = rowsDung.reduce((s, x) => s + xuongMuc(x.kd, qt), 0);
    if (Qsa > 0 && khoDu < Qsa) canhN.push(`Nhóm ${kGia(g.gia)}: kho SA chỉ đủ ${fmtN(khoDu)}/${fmtN(Qsa)}${thungG ? ' (sau phần thùng)' : ''} — thiếu cơ cấu ${fmtN(Qsa - khoDu)}`);
    if (thungG > Q) canhN.push(`Nhóm ${kGia(g.gia)}: thùng đã có ${fmtN(thungG)} > kế hoạch ${fmtN(Q)} — dư ${fmtN(thungG - Q)}`);
    if (lech) canhN.push(`Nhóm ${kGia(g.gia)}: ${lech > 0 ? `còn thiếu ${lech}` : `dư ${-lech}`} so với kế hoạch (bước làm tròn / kho)`);
    const theoMauDn = {}, theoMauSacDn = {};
    dong.forEach((d) => { const v = d.thuc + d.th; theoMauDn[d.x.mau] = (theoMauDn[d.x.mau] || 0) + v; theoMauSacDn[d.x.hm] = (theoMauSacDn[d.x.hm] || 0) + v; });
    const [mauTop, slMauTop] = Object.entries(theoMauDn).sort((u, v) => v[1] - u[1])[0] || [];
    const [msTop, slMsTop] = Object.entries(theoMauSacDn).sort((u, v) => v[1] - u[1])[0] || [];
    if (tong >= 50 && slMauTop / tong > tranMau + 0.05) canhN.push(`Nhóm ${kGia(g.gia)}: mẫu ${mauTop} chiếm ${Math.round((slMauTop / tong) * 100)}% — tập trung 1 mẫu`);
    if (tong >= 50 && msTop && slMsTop / tong > tranMauSac) canhN.push(`Nhóm ${kGia(g.gia)}: màu ${msTop} chiếm ${Math.round((slMsTop / tong) * 100)}% — tập trung 1 màu`);
    if (tong >= 50 && Object.keys(theoMauDn).length < 3) canhN.push(`Nhóm ${kGia(g.gia)}: chỉ ${Object.keys(theoMauDn).length} mẫu — ít lựa chọn cho khách`);
    if (choKhac.length) canhN.push(`Nhóm ${kGia(g.gia)}: ${choKhac.length} mã thiếu kho chưa có hàng cùng màu thay — xem đề xuất khác màu`);
    if (refs.length && tongMixRef > 0) {
      const sRef = (mixRef[g.gia] || 0) / tongMixRef, sCC = Q / tongCC;
      if (Math.abs(sRef - sCC) > 0.12) canh.push(`Đội tham chiếu bán nhóm ${kGia(g.gia)} ${Math.round(sRef * 100)}% nhưng cơ cấu đặt ${Math.round(sCC * 100)}%`);
    }
    canh.push(...canhN);
    // tỷ trọng màu (cho thanh màu)
    const thanhMau = Object.entries(theoMauSacDn).filter(([, v]) => v > 0).sort((u, v) => v[1] - u[1]).map(([hm, v]) => ({ hm, v, pt: tong ? v / tong : 0 }));
    return { gia: g.gia, Q, Qsa, thung: thungG, tong, qt, dong, thuc, ai, lech, choKhac, theoKho, canh: canhN, soMa: dong.filter((d) => d.thuc + d.th > 0).length,
      topMau, topPt, soMauKho, apTran: Number.isFinite(capMau),
      soMau: Object.keys(theoMauDn).filter((m) => theoMauDn[m] > 0).length, thanhMau,
      conLai: rowsDung.filter((x) => !daChon.includes(x) && x.kd > 0).sort(sxP) };
  });
  // mã đội tham chiếu đang bán mà chưa có giá / nhóm giá ngoài cơ cấu
  const giaCC = new Set(dl.coCau.map((g) => g.gia));
  if (refs.length) {
    const khongGia = rows.filter((x) => !x.gia && x.banRef > 0);
    if (khongGia.length) canh.push(`${khongGia.length} mã đội tham chiếu đang bán (${fmtN(khongGia.reduce((s, x) => s + x.banRef, 0))} cái) chưa có giá sale — không vào cơ cấu`);
    Object.entries(mixRef).forEach(([gia, v]) => {
      if (!giaCC.has(+gia) && tongMixRef > 0 && v / tongMixRef >= 0.05) canh.push(`Đội tham chiếu bán nhóm ${kGia(+gia)} ${Math.round((v / tongMixRef) * 100)}% — cơ cấu chưa có nhóm này`);
    });
    refs.forEach((t) => { const d = data.doi.find((x) => ngan(x.ma) === t); if (d && d.ngay < 14) canh.push(`Đội ${t} chỉ có ${d.ngay} ngày bán — số liệu tham chiếu còn mỏng`); });
  } else canh.unshift('Chưa chọn đội tham chiếu — đang đề nghị theo bán toàn mạng đội sale');
  // NEW - 212: hàng trong thùng nằm ngoài cơ cấu giá (nhóm giá chưa đặt / chưa có giá / phụ kiện) — vẫn giao theo thùng
  const ngoai = [];
  if (tg) {
    Object.entries(sanT).forEach(([bc, sl]) => {
      const s = tg.sp?.[bc] || {};
      if (s.pk) ngoai.push({ bc, mtc: s.mtc || bc, sl, ly: 'phụ kiện' });
      else if (!s.gia) ngoai.push({ bc, mtc: s.mtc || bc, sl, ly: 'chưa có giá sale' });
      else if (!giaCC.has(s.gia)) ngoai.push({ bc, mtc: s.mtc || bc, sl, ly: `nhóm ${kGia(s.gia)} chưa có trong cơ cấu` });
    });
    if (ngoai.length) canh.push(`Thùng có ${fmtN(ngoai.reduce((t, x) => t + x.sl, 0))} cái ngoài cơ cấu giá (${ngoai.length} mã) — vẫn giao theo thùng`);
  }
  return { nhom, canh, refs, w, ngoai, slNgoai: ngoai.reduce((t, x) => t + x.sl, 0) };
}

// Ô thông số: có SỐ GỢI Ý (bấm để dùng) + TỰ NHẬP + chọn nhanh
function OSoGoiY({ nhan, gt, donVi, min, max, goiY, nhanh, onDat, ten }) {
  const [o, setO] = useState(String(gt));
  useEffect(() => { setO(String(gt)); }, [gt]);
  const chot = (v) => {
    let n = Math.round(Number(String(v).replace(',', '.')));
    if (!Number.isFinite(n) || n <= 0) { setO(String(gt)); return; }
    n = Math.min(max, Math.max(min, n));
    setO(String(n));
    if (n !== gt) onDat(n);
  };
  const dung = goiY && goiY.v === gt;
  return (
    <div className="dmo-ts">
      <div className="dmo-ts-dau">
        <span>{nhan}</span>
        {goiY && (
          <button className={'dmo-ts-gy' + (dung ? ' dung' : '')} onClick={() => !dung && chot(goiY.v)} title={goiY.ly}>
            {dung ? '✓ Đang dùng gợi ý' : <>✦ Gợi ý: {ten(goiY.v)}</>}
          </button>
        )}
      </div>
      <div className="dmo-ts-hang">
        <label className="dmo-ts-o" title={`Tự nhập (${min}–${max})`}>
          <input type="number" inputMode="numeric" min={min} max={max} value={o} onChange={(e) => setO(e.target.value)}
            onBlur={() => chot(o)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); else if (e.key === 'Escape') { setO(String(gt)); e.currentTarget.blur(); } }}
            onFocus={(e) => e.target.select()} />
          <em>{gt >= max && donVi === '%' ? '= không giới hạn' : donVi}</em>
        </label>
        <div className="dmo-ts-nhanh">
          {nhanh.map(([v, t]) => <button key={v} className={gt === v ? 'on' : ''} onClick={() => chot(v)}>{t}</button>)}
        </div>
      </div>
      {goiY && <small className="dmo-ts-ly">{goiY.ly}</small>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// NEW - 212: cột bảng từng nhóm giá (sắp xếp + phễu lọc)
const COT_DM = {
  ma: { lay: (d) => d.x.mtc, loai: 'chu', tim: (d) => `${d.x.mtc} ${d.x.n3 || ''} ${d.x.bc}` },
  diem: { lay: (d) => d.diem }, ref: { lay: (d) => d.x.banRef || 0 }, mang: { lay: (d) => d.x.banMang }, kd: { lay: (d) => d.x.kd },
  th: { lay: (d) => d.th || 0 }, dn: { lay: (d) => d.dn || 0 }, thuc: { lay: (d) => d.thuc || 0 },
};

export default function DsDoiMoi({ dsDoi, ganDoi, onDaGan, taoDoi }) {
  const { user, baoToast } = useApp();
  const nguoi = user?.ma_dang_nhap || '';
  const cfg = useLamTron();
  const [cuaSo, setCuaSo] = useState(() => lsGet('dm_cua_so') || 28);
  const [data, setData] = useState(boNhoDl?.cuaSo === cuaSo ? boNhoDl.data : null);
  const [loi, setLoi] = useState(null);
  const [dangTai, setDangTai] = useState(false);
  const [id, setId] = useState(() => lsGet('doimoi_id') || Date.now().toString(36));
  const [dsNhap, setDsNhap] = useState([]);
  const [moNhom, setMoNhom] = useState({});
  const [moCanh, setMoCanh] = useState(true);
  const [gui, setGui] = useState(false);
  const [hoiGhiChu, hopGhiChu, chonOdoo] = useHoiGhiChu();
  useEffect(() => { lsSet('doimoi_id', id); }, [id]);
  useEffect(() => { lsSet('dm_cua_so', cuaSo); }, [cuaSo]);
  const macDinh = useMemo(() => macDinhNhap(cfg), [cfg]);
  const [dl, datDl, ttLuu, xoaNhap] = useNhap(nguoi, 'doimoi:' + id, macDinh);
  const coCau = dl.coCau?.length ? dl.coCau : macDinh.coCau;
  const d2 = { ...macDinh, ...dl, coCau };

  const tai = (ep) => {
    if (!ep && boNhoDl?.cuaSo === cuaSo && Date.now() - boNhoDl.luc < 5 * 60e3) { setData(boNhoDl.data); return; }
    setDangTai(true); setLoi(null);
    sb.rpc('fn_ds_doi_moi_du_lieu', { p_cua_so: cuaSo }).then(({ data: kq, error }) => {
      setDangTai(false);
      if (error) { setLoi(error.message); return; }
      boNhoDl = { cuaSo, luc: Date.now(), data: kq }; setData(kq);
    });
  };
  useEffect(() => { tai(false); }, [cuaSo]);   // eslint-disable-line
  const taiDsNhap = () => sb.rpc('fn_ds_nhap_lay', { p_nguoi: nguoi }).then(({ data: kq }) => {
    setDsNhap(Object.entries(kq || {}).filter(([k]) => k.startsWith('doimoi:')).map(([k, v]) => ({ id: k.slice(7), ten: v.du_lieu?.ten || '(chưa đặt tên)', tong: v.du_lieu?.tong, luc: v.cap_nhat }))
      .sort((a, b) => String(b.luc).localeCompare(String(a.luc))));
  });
  useEffect(() => { taiDsNhap(); }, [id, ttLuu.trang === 'da_luu']);   // eslint-disable-line

  // ---------- NEW - 212: số đội ----------
  const soDoi = soTuMa(d2.ma);
  const maDoi = soDoi ? maTuSo(soDoi) : '';
  const doiCo = dsDoi.find((d) => d.ma_ch === maDoi);
  const tenDoiMoi = doiCo?.ten || tenTuSo(soDoi);
  const [oSo, setOSo] = useState(soDoi ? String(soDoi) : '');
  useEffect(() => { setOSo(soDoi ? String(soDoi) : ''); }, [id, soDoi]);   // eslint-disable-line
  const datSoDoi = (v) => {
    setOSo(v);
    const n = parseInt(String(v).replace(/\D/g, ''), 10);
    const ma = n >= 1 && n <= 999 ? maTuSo(n) : '';
    datDl((d) => {
      const cu = { ...macDinh, ...d };
      const tuDong = !String(cu.ten || '').trim() || /^Đội SALE \d+$/i.test(String(cu.ten).trim());
      return { ...cu, ma, ten: tuDong ? (ma ? (dsDoi.find((x) => x.ma_ch === ma)?.ten || tenTuSo(n)) : '') : cu.ten };
    });
  };
  // mở từ "Chia từng đội" (đội chưa có hàng): gắn số đội vào nháp trống, không thì mở nháp mới
  const choGan = useRef(null);
  useEffect(() => {
    if (!ganDoi) return;
    const n = soTuMa(ganDoi);
    onDaGan?.();
    if (!n || soTuMa(d2.ma) === n) return;
    const trong = !d2.ma && !d2.chinh && !Object.keys(d2.sua || {}).length && !(d2.thung || []).length;
    if (trong) { datSoDoi(String(n)); return; }
    choGan.current = n; setId(Date.now().toString(36));
  }, [ganDoi]);   // eslint-disable-line
  useEffect(() => { if (choGan.current) { const n = choGan.current; choGan.current = null; datSoDoi(String(n)); } }, [id]);   // eslint-disable-line

  // ---------- NEW - 212: kho thùng sẵn sàng + AI ghép tổ hợp ----------
  const [thungDl, setThungDl] = useState(boNhoThung?.data || null);
  const [taiThung, setTaiThung] = useState(false);
  const [oThung, setOThung] = useState('');
  const taiDsThung = (ep) => {
    if (!ep && boNhoThung && Date.now() - boNhoThung.luc < 3 * 60e3) { setThungDl(boNhoThung.data); return; }
    setTaiThung(true);
    sb.rpc('fn_ds_thung_san').then(({ data: kq, error }) => {
      setTaiThung(false);
      if (error) { baoToast(/function|does not exist/i.test(error.message) ? 'Máy chủ chưa có fn_ds_thung_san — cần chạy SQL 212' : 'Chưa tải được kho thùng: ' + error.message); return; }
      boNhoThung = { luc: Date.now(), data: kq }; setThungDl(kq);
    });
  };
  useEffect(() => { taiDsThung(false); }, []);   // eslint-disable-line
  const spT = useMemo(() => { const m = {}; (thungDl?.sp || []).forEach(([bc, mtc, gia, n3, img, pk]) => { m[bc] = { mtc, gia, n3, img, pk }; }); return m; }, [thungDl]);
  const chonThung = d2.thung || [];
  const ruot = useMemo(() => ruotThung(thungDl?.thung, chonThung), [thungDl, chonThung.join('|')]);   // eslint-disable-line
  const thungMat = thungDl ? chonThung.filter((t) => !thungDl.thung.some((x) => x[0] === t)) : [];
  const dlGoc = { ...d2, sua: {}, thung: [] };
  const khGoc = useMemo(() => (data ? lapKeHoach(data, dlGoc, cfg) : null), [data, JSON.stringify(dlGoc), cfg]);   // eslint-disable-line
  const dich = useMemo(() => {
    if (!khGoc) return null;
    const D = {}, Qg = {}, mtc = {};
    khGoc.nhom.forEach((n) => { Qg[n.gia] = n.Q; n.dong.forEach((d) => { mtc[d.x.bc] = d.x.mtc; if (d.muon > 0) D[d.x.bc] = d.muon; }); });
    return { D, Qg, mtc };
  }, [khGoc]);
  const ghep = useMemo(() => (thungDl && dich ? ghepThung(thungDl.thung, spT, dich) : null), [thungDl, spT, dich]);
  const khopThung = (ds) => ds.length === chonThung.length && ds.every((t) => chonThung.includes(t));
  const dungToHop = (ds) => { dat({ thung: [...ds] }); baoToast(`Đã dùng ${ds.length} thùng — phần còn thiếu AI lấy bổ sung từ kho SA`); };
  const boThung = (t) => dat((d) => ({ thung: (d.thung || []).filter((x) => x !== t) }));
  const themThung = (v) => {
    const t = String(v || '').trim().toUpperCase();
    if (!t) return;
    const co = thungDl?.thung.find((x) => String(x[0]).toUpperCase() === t);
    if (!co) { baoToast(`Không thấy thùng ${t} trong các thùng đang sẵn sàng`); return; }
    setOThung('');
    if (chonThung.includes(co[0])) return;
    dat((d) => ({ thung: [...(d.thung || []), co[0]] }));
  };
  const soCuaThung = (t) => { const x = thungDl?.thung.find((y) => y[0] === t); return x ? x[4].reduce((a, c) => a + (c[2] ? 0 : c[1]), 0) : '?'; };
  const sl = useSapLoc('dm_bang');

  const kh = useMemo(() => (data ? lapKeHoach(data, d2, cfg, chonThung.length && thungDl ? { san: ruot.san, sp: spT } : null) : null),
    [data, JSON.stringify(d2), cfg, ruot, spT, thungDl]);   // eslint-disable-line
  const goiY = useMemo(() => (data ? goiYDoi(data, coCau, d2.kv) : []), [data, JSON.stringify(coCau), d2.kv]);   // eslint-disable-line
  // Gợi ý "Số bán trong": mặc định 28 ngày; đội tham chiếu bán ít (chưa đủ ~3.000 cái mẫu) hoặc ít ngày có bán -> lấy dài hơn
  const goiYNgay = useMemo(() => {
    if (!data) return null;
    const refs = [d2.chinh, ...(d2.phu || [])].filter(Boolean);
    const ds = refs.map((k) => data.doi.find((d) => ngan(d.ma) === k)).filter(Boolean);
    if (!ds.length) return { v: 28, ly: 'Chưa chọn đội tham chiếu — 28 ngày (4 tuần): đủ dài để xếp hạng mẫu ổn định, đủ ngắn để bám mẫu đang chạy.' };
    const banNgay = ds.reduce((t, d) => t + d.ban / Math.max(1, d.ngay || data.cua_so), 0);
    const it = ds.reduce((m, d) => (d.ngay < m.ngay ? d : m), ds[0]);
    let v = 28;
    const can = Math.ceil(3000 / Math.max(1, banNgay));
    const ly = [`Đội tham chiếu bán ~${fmtN(Math.round(banNgay))} cái/ngày`];
    if (can > 28) { v = Math.min(60, Math.ceil(can / 7) * 7); ly.push(`28 ngày chỉ ~${fmtN(Math.round(banNgay * 28))} cái — cần ~${v} ngày cho đủ ~3.000 cái để xếp hạng mẫu`); }
    if (it.ngay < data.cua_so * 0.5) { v = Math.max(v, 45); ly.push(`${tenNgan(it.ten)} chỉ có ${it.ngay}/${data.cua_so} ngày có bán — lấy dài hơn cho đủ dữ liệu`); }
    if (v === 28) ly.push(`28 ngày ≈ ${fmtN(Math.round(banNgay * 28))} cái — đủ để xếp hạng mẫu, vẫn bám mẫu đang chạy`);
    return { v, ly: ly.join(' · ') };
  }, [data, d2.chinh, JSON.stringify(d2.phu)]);   // eslint-disable-line
  // Gợi ý "Trần mỗi mẫu": theo tỷ trọng mẫu bán chạy nhất của đội tham chiếu từng nhóm giá (khách mua thật),
  // không dưới 20% và đủ chỗ cho các mẫu còn kho (≥ 100/số mẫu + 5), không quá 40% — bình quân theo số lượng nhóm
  const goiYTran = useMemo(() => {
    if (!kh) return null;
    const ds = kh.nhom.filter((n) => n.Q >= 50 && n.soMauKho >= 4 && n.topPt > 0);
    if (!ds.length) return { v: 100, ly: 'Các nhóm giá ít mẫu còn kho — không cần trần, chia đúng theo số bán.' };
    const lam5 = (x) => Math.ceil(x / 5 - 1e-9) * 5;
    let tong = 0, s = 0;
    const ct = ds.map((n) => {
      const c = Math.min(40, Math.max(20, lam5(100 / n.soMauKho + 5), lam5(n.topPt * 100)));
      tong += n.Q; s += c * n.Q;
      return `${kGia(n.gia)}: mẫu chạy nhất ${n.topMau} ${Math.round(n.topPt * 100)}%`;
    });
    const v = Math.round(s / tong / 5) * 5;
    return { v, ly: `${ct.join(' · ')} → trần ${v}%: giữ đúng mẫu khách mua nhiều, không dồn quá ${v}% nhóm vào 1 mẫu.` };
  }, [kh]);
  const dangCat = kh ? kh.nhom.filter((n) => n.apTran && n.topPt * 100 > d2.tranMau + 0.5) : [];

  // ---------- sửa ----------
  const dat = (o) => datDl((d) => ({ ...macDinh, ...d, ...(typeof o === 'function' ? o({ ...macDinh, ...d }) : o) }));
  const doiTong = (v) => { const t = so(v); dat((d) => ({ tong: t, coCau: t ? coGianCoCau(d.coCau?.length ? d.coCau : macDinh.coCau, t, cfg) : d.coCau })); };
  const datSlNhom = (i, v) => dat((d) => ({ coCau: (d.coCau?.length ? d.coCau : macDinh.coCau).map((g, j) => (j === i ? { ...g, sl: so(v) } : g)) }));
  const datPtNhom = (i, v) => dat((d) => {
    const cc = d.coCau?.length ? d.coCau : macDinh.coCau;
    const q = quyTac({ gia: cc[i].gia }, cfg);
    const sl = Math.max(0, Math.round(((parseFloat(String(v).replace(',', '.')) || 0) / 100) * (d.tong || 0) / (q.buoc || 1)) * (q.buoc || 1));
    return { coCau: cc.map((g, j) => (j === i ? { ...g, sl } : g)) };
  });
  const canVeTong = () => dat((d) => ({ coCau: coGianCoCau(d.coCau?.length ? d.coCau : macDinh.coCau, d.tong, cfg) }));
  const coCauChuan = () => dat((d) => ({ coCau: coGianCoCau((cfg.doi_moi?.co_cau || []).map((g) => ({ ...g })), d.tong || 1050, cfg) }));
  const themNhomGia = (gia) => { if (!gia || coCau.some((g) => g.gia === +gia)) return; dat((d) => ({ coCau: [...(d.coCau?.length ? d.coCau : macDinh.coCau), { gia: +gia, sl: 0 }].sort((a, b) => a.gia - b.gia) })); };
  const boNhomGia = (gia) => dat((d) => ({ coCau: (d.coCau || []).filter((g) => g.gia !== gia) }));
  const chonChinh = (k) => dat((d) => ({ chinh: k, phu: (d.phu || []).filter((p) => p !== k) }));
  const batPhu = (k) => dat((d) => ({ phu: (d.phu || []).includes(k) ? d.phu.filter((p) => p !== k) : [...(d.phu || []), k].filter((p) => p !== d.chinh) }));
  const datThuc = (bc, v) => dat((d) => ({ sua: { ...(d.sua || {}), [bc]: so(v) } }));
  const boMa = (bc) => dat((d) => { const s = { ...(d.sua || {}) }; delete s[bc]; const t = { ...(d.them || {}) }; delete t[bc]; return { bo: [...new Set([...(d.bo || []), bc])], sua: s, them: t }; });
  const themMa = (bc, sl) => dat((d) => ({ them: { ...(d.them || {}), [bc]: sl }, bo: (d.bo || []).filter((x) => x !== bc) }));
  const dongYKhacMau = (x, o) => {
    if (!window.confirm(`Đồng ý thay bằng màu KHÁC?\n\n${x.mtc} (màu ${x.hm || '?'}) thiếu kho\n→ ${o.sl} cái ${o.y.mtc} (màu ${o.y.hm || '?'})`)) return;
    dat((d) => ({ dongY: { ...(d.dongY || {}), [o.y.bc]: { cho: x.bc, sl: o.sl } } }));
  };
  const apAI = () => { dat({ sua: {} }); baoToast('Đã đặt Thực chia = AI đề nghị cho mọi mã'); };
  const nhapMoi = () => { setId(Date.now().toString(36)); baoToast('Đã mở bản nháp mới — bản cũ vẫn lưu trong danh sách nháp'); };
  const xoaBanNhap = async () => { if (!window.confirm(`Xoá bản nháp “${d2.ten || 'chưa đặt tên'}”?`)) return; await xoaNhap(); taiDsNhap(); };

  const tongKH = coCau.reduce((a, g) => a + (+g.sl || 0), 0);
  const tongAI = kh ? kh.nhom.reduce((a, n) => a + n.ai, 0) : 0;
  const tongThuc = kh ? kh.nhom.reduce((a, n) => a + n.thuc, 0) : 0;   // phần lấy kho SA
  const tongThung = kh ? kh.nhom.reduce((a, n) => a + n.thung, 0) + (kh.slNgoai || 0) : 0;
  const tongNhan = tongThuc + tongThung;
  const soMa = kh ? kh.nhom.reduce((a, n) => a + n.soMa, 0) + (kh.ngoai?.length || 0) : 0;
  const soMau = kh ? kh.nhom.reduce((a, n) => a + n.soMau, 0) : 0;
  const tenDoiTC = (k) => tenNgan(data?.doi.find((d) => ngan(d.ma) === k)?.ten || dayDu(k));
  const dongXuat = () => {
    const ra = [];
    kh?.nhom.forEach((n) => n.dong.forEach((d) => {
      if (!(d.thuc > 0)) return;
      let con = d.thuc;
      const kho = d.x.kd1 >= d.x.kd2 ? [['SA05001', d.x.kd1], ['SA05002', d.x.kd2]] : [['SA05002', d.x.kd2], ['SA05001', d.x.kd1]];
      kho.forEach(([k, c], i) => { const lay = i === kho.length - 1 ? con : Math.min(con, c); if (lay > 0) { ra.push({ n, d, kho: k, sl: lay }); con -= lay; } });
    }));
    return ra;
  };

  // ---------- xuất / xác nhận ----------
  const xuatNhap = async () => {
    const ds = dongXuat();
    if (!ds.length && !chonThung.length) { baoToast('Chưa có số nào'); return; }
    const ghiChu = await hoiGhiChu({ macDinh: `${d2.ten || 'Đội mới'}${d2.kv ? ' – ' + d2.kv : ''}`, tieuDe: 'Ghi chú file chia trước (nháp)', nutXong: 'Xuất Excel nháp',
      phu: `${fmtN(tongNhan)} cái · ${soMa} mã${chonThung.length ? ` (${chonThung.length} thùng ${fmtN(tongThung)} + kho SA ${fmtN(tongThuc)})` : ''} — file nháp, CHƯA giữ tồn kho` });
    if (ghiChu === null) return;
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(ds.map(({ d, kho, sl }) => ({
      'Kho chuyển': kho, 'Tên kho chuyển': KHO_TEN[kho] || kho, 'Cửa hàng nhận': maDoi, 'Tên cửa hàng nhận': d2.ten || tenDoiMoi || 'Đội mới',
      Barcode: d.x.bc, 'Mã tham chiếu': d.x.mtc, 'Sản phẩm': d.x.n3 || '', 'Số lượng': sl, 'Ghi chú': `Chia trước đội mới (nháp) · ${kGia(d.x.gia)}`,
    })));
    ghiDong1(XLSX, ws, ghiChu);
    const ws2 = XLSX.utils.json_to_sheet(kh.nhom.flatMap((n) => n.dong.filter((d) => d.thuc > 0 || d.dn > 0).map((d) => ({
      'Nhóm giá': kGia(n.gia), 'Mã tham chiếu': d.x.mtc, Barcode: d.x.bc, 'Điểm phù hợp': d.diem, 'Trong thùng': d.th || 0, 'AI đề nghị kho SA': d.dn, 'Thực chia kho SA': d.thuc,
      'Bán ĐTC': d.x.banRef, 'Bán toàn mạng': d.x.banMang, 'Kho SA': d.x.kd, 'Lý do': d.ly.join(' · '),
    }))));
    const ws3 = XLSX.utils.json_to_sheet(kh.nhom.map((n) => ({ 'Nhóm giá': kGia(n.gia), 'Kế hoạch': n.Q, 'Tỷ trọng': tongKH ? Math.round((n.Q / tongKH) * 10000) / 100 + '%' : '', 'Thùng': n.thung, 'AI đề nghị kho SA': n.ai, 'Thực chia kho SA': n.thuc, 'Tổng nhận': n.tong, 'Số mã': n.soMa, 'Số mẫu': n.soMau })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DieuChuyen');
    if (chonThung.length) {
      const wsT = XLSX.utils.json_to_sheet((thungDl?.thung || []).filter((t) => chonThung.includes(t[0])).flatMap(([t, nhom, , , ct]) => ct.map(([bc, s, th]) => ({
        'Mã thùng': t, 'Nhóm thùng': nhom || '', Barcode: bc, 'Mã tham chiếu': spT[bc]?.mtc || bc, 'Số lượng': s, 'Ghi chú': th ? 'THU HỒI đội sale — rút khỏi thùng khi giao' : '',
      }))));
      XLSX.utils.book_append_sheet(wb, wsT, 'Thung');
    }
    XLSX.utils.book_append_sheet(wb, ws2, 'KeHoach');
    XLSX.utils.book_append_sheet(wb, ws3, 'CoCau');
    const ten = (d2.ten || 'DoiMoi').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/[^\w]+/g, '_');
    XLSX.writeFile(wb, `ChiaTruoc_${ten}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    baoToast(`Đã xuất file nháp ${fmtN(tongThuc)} cái — chưa giữ tồn`);
  };
  const xacNhan = async () => {
    if (!soDoi) { baoToast('Nhập số đội trước (vd 35)'); return; }
    const ds = kh.nhom.flatMap((n) => n.dong.filter((d) => d.thuc > 0).map((d) => ({ barcode: d.x.bc, sl_sa: d.thuc })));
    if (!ds.length && !chonThung.length) { baoToast('Chưa có số nào'); return; }
    if (thungMat.length) { baoToast(`Thùng ${thungMat.join(', ')} không còn sẵn sàng (đã giao / cần kiểm tra) — bỏ ra rồi xác nhận`); return; }
    const vuot = kh.nhom.flatMap((n) => n.dong.filter((d) => d.thuc > d.x.kd));
    if (vuot.length) { baoToast(`${vuot.length} mã thực chia vượt kho SA — sửa trước khi xác nhận`); return; }
    const ghiChu = await hoiGhiChu({ odoo: true, macDinh: `${String(tenDoiMoi || '').replace(/^Đội SALE/i, 'Đội Sale')}${d2.kv ? ' – ' + d2.kv : ' – '}`, tieuDe: `Xác nhận chia trước — ${tenNgan(tenDoiMoi)}${doiCo ? '' : ' (đội mới — tự tạo mã ' + maDoi + ')'}`,
      nutXong: `Xác nhận & xuất (${fmtN(tongNhan)})`,
      phu: `${fmtN(tongNhan)} cái · ${soMa} mã${chonThung.length ? ` · ${chonThung.length} thùng ${fmtN(tongThung)} + kho SA ${fmtN(tongThuc)}` : ''} — giữ tồn kho SA ngay khi xác nhận` });
    if (ghiChu === null) return;
    setGui(true);
    let doi = doiCo;
    if (!doi) {
      try { doi = await taoDoi(soDoi); } catch (e) { setGui(false); baoToast('Chưa tạo được đội: ' + (e?.message || e)); return; }
      if (!doi) { setGui(false); return; }
    }
    const { data: kq, error } = await sb.rpc('fn_ds_xac_nhan', { p: { loai: 'doi', nguoi, khoa_nhap: 'doimoi:' + id, ghi_chu: ghiChu || null,
      dong: ds.map((x) => ({ ...x, ma_ch: doi.ma_ch })), thung: chonThung.map((t) => ({ ma_thung: t, ma_ch: doi.ma_ch })) } });
    setGui(false);
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    if (!kq?.ok) { baoLoiXacNhan(kq, baoToast); tai(true); taiDsThung(true); return; }
    try { await xuatHaiFile(kq, ghiChu); } catch { baoToast('Đã giữ tồn, xuất file lỗi — tải lại ở tab Phiếu đã chia'); }
    if (chonOdoo.current) odooTuKq(kq, ghiChu).catch((e) => baoToast('Đã xác nhận, chưa mở được hộp Odoo: ' + (e?.message || e) + ' — gửi lại ở Phiếu đã chia'));
    baoToast(`Đã xác nhận ${tenPhieu(kq)}: ${fmtN(tongNhan)} cái cho ${tenNgan(doi.ten)}${chonThung.length ? ` (${chonThung.length} thùng + kho SA)` : ''}`);
    tai(true); taiDsThung(true);
  };

  if (loi) {
    return (
      <div className="card dmo-loi">
        <IcAlert /><div><b>Chưa tải được số liệu chia trước</b><span>{/function|does not exist/i.test(loi) ? 'Máy chủ chưa có hàm fn_ds_doi_moi_du_lieu — cần chạy SQL 202.' : loi}</span></div>
        <button className="btn btn-ai" onClick={() => tai(true)}>Thử lại</button>
      </div>
    );
  }

  return (
    <div className="dm">
      {hopGhiChu}
      <div className="cmdbar dmo-dau">
        <div className="cmd-title">
          <h2>Chia trước cho đội mới</h2>
          <p>Lập bộ hàng đầu tiên cho đội chưa có lịch sử bán — dựa trên số bán thật của đội tham chiếu, giữ cơ cấu giá, đa dạng mẫu / màu / size, không vượt kho SA.</p>
        </div>
        <div className="dmo-nhap">
          <select className="dmo-sel" value={id} onChange={(e) => setId(e.target.value)} title="Bản nháp đã lưu (theo tài khoản)">
            {!dsNhap.some((n) => n.id === id) && <option value={id}>{d2.ten || 'Nháp mới'} (đang soạn)</option>}
            {dsNhap.map((n) => <option key={n.id} value={n.id}>{n.ten}{n.tong ? ` · ${fmtN(n.tong)}` : ''}</option>)}
          </select>
          <button className="btn btn-ghost dmo-trang" onClick={nhapMoi}>＋ Nháp mới</button>
          <TrangThaiLuu tt={ttLuu} />
        </div>
      </div>

      <div className="dmo-luoi">
        {/* 1 · Đội mới */}
        <div className="card dmo-the">
          <div className="dmo-the-dau"><span className="dmo-so">1</span><b>Đội mới</b></div>
          <div className="dmo-form">
            <label title="Gõ số đội (vd 35) — mã DOISALE35 và tên Đội SALE 35 tự đặt theo đúng quy tắc các đội hiện có. Đội chưa có trong hệ thống thì tự tạo khi bấm Xác nhận.">
              <span>Số đội</span>
              <input className="inp dmo-so-doi" inputMode="numeric" value={oSo} placeholder="Vd 35" list="dmo-ds-doi" onChange={(e) => datSoDoi(e.target.value)} />
              <datalist id="dmo-ds-doi">{dsDoi.map((d) => <option key={d.ma_ch} value={String(soTuMa(d.ma_ch) ?? '')}>{d.ten}</option>)}</datalist>
              {maDoi ? <small className={doiCo ? 'ok' : 'moi'}>{doiCo ? `✓ ${maDoi} · ${doiCo.ten}` : `${maDoi} · ${tenTuSo(soDoi)} — đội mới, tự tạo khi xác nhận`}</small>
                : oSo ? <small className="vang">Số đội từ 1 đến 999</small> : null}
            </label>
            <label><span>Tên đội</span><input className="inp" value={d2.ten} placeholder="Tự đặt theo số đội" onChange={(e) => dat({ ten: e.target.value })} /></label>
            <label><span>Khu vực dự kiến</span><input className="inp" value={d2.kv} placeholder="Vd Lạc Long Quân" onChange={(e) => dat({ kv: e.target.value })} /></label>
            <label title="Tổng số nón chia trước — đổi tổng thì cơ cấu giá tự co giãn theo tỷ trọng">
              <span>Tổng nón</span>
              <input className="inp dmo-tong" type="number" min="100" step="10" value={d2.tong || ''} onChange={(e) => doiTong(e.target.value)} />
              <small>thường 1.000 – 1.100</small>
            </label>
          </div>
          <div className="dmo-ts-luoi">
            <OSoGoiY nhan="Lấy số bán trong" gt={cuaSo} donVi="ngày" min={7} max={120} goiY={goiYNgay}
              nhanh={[[14, '14'], [28, '28'], [45, '45'], [60, '60']]} ten={(v) => `${v} ngày`} onDat={setCuaSo} />
            <OSoGoiY nhan="Trần mỗi mẫu trong 1 nhóm giá" gt={d2.tranMau} donVi="%" min={10} max={100} goiY={goiYTran}
              nhanh={[[20, '20%'], [25, '25%'], [30, '30%'], [40, '40%'], [100, 'Không giới hạn']]} ten={(v) => (v >= 100 ? 'không giới hạn' : `${v}%`)}
              onDat={(v) => dat({ tranMau: v })} />
          </div>
          {dangCat.length > 0 && (
            <div className="dmo-ts-cat">Đang cắt: {dangCat.map((n) => `${n.topMau} (${kGia(n.gia)}) ${Math.round(n.topPt * 100)}% → ${d2.tranMau}%`).join(' · ')} — phần dư chia sang mẫu bán chạy kế tiếp</div>
          )}
          {dsNhap.some((n) => n.id === id) && <div className="dmo-form-chan"><button className="dmo-xoa-nhap" onClick={xoaBanNhap}>Xoá bản nháp này</button></div>}
        </div>

        {/* 2 · Đội tham chiếu */}
        <div className="card dmo-the">
          <div className="dmo-the-dau"><span className="dmo-so">2</span><b>Đội tham chiếu</b>
            <small>AI gợi ý theo cơ cấu giá giống nhất, sức bán, độ đủ dữ liệu{d2.kv ? ', khu vực' : ''}</small></div>
          {!data ? <div className="dmo-tai"><span className="dmo-quet" />{dangTai ? 'Đang phân tích số bán các đội…' : 'Đang tải…'}</div> : (<>
            <div className="dmo-goi-y">
              {goiY.slice(0, 3).map((g, i) => {
                const laChinh = d2.chinh === g.k, laPhu = (d2.phu || []).includes(g.k);
                return (
                  <div key={g.k} className={'dmo-gy' + (laChinh ? ' chinh' : laPhu ? ' phu' : '')} style={{ animationDelay: i * 80 + 'ms' }}>
                    <div className="dmo-gy-dau"><span className="dmo-gy-hang">#{i + 1}</span><b>{tenNgan(g.d.ten)}</b><span className="dmo-gy-diem">{g.diem}</span></div>
                    <ul>{g.ly.map((l) => <li key={l}>{l}</li>)}</ul>
                    <div className="dmo-gy-nut">
                      <button className={laChinh ? 'on' : ''} onClick={() => chonChinh(g.k)}>{laChinh ? '✓ Đội chính' : 'Làm chính'}</button>
                      <button className={laPhu ? 'on' : ''} onClick={() => batPhu(g.k)} disabled={laChinh}>{laPhu ? '✓ Phụ' : '+ Phụ'}</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="dmo-chon">
              <div className="dmo-chon-ds">
                {d2.chinh && <span className="dmo-tag chinh" title="Đội chính">★ {tenDoiTC(d2.chinh)}<button onClick={() => dat({ chinh: null })}>×</button></span>}
                {(d2.phu || []).map((p) => <span key={p} className="dmo-tag">{tenDoiTC(p)}<button onClick={() => batPhu(p)}>×</button></span>)}
                <select className="dmo-sel nho" value="" onChange={(e) => { const v = e.target.value; if (!v) return; if (!d2.chinh) chonChinh(v); else batPhu(v); }}>
                  <option value="">{d2.chinh ? '+ Thêm đội phụ…' : '+ Chọn đội chính…'}</option>
                  {goiY.filter((g) => g.k !== d2.chinh && !(d2.phu || []).includes(g.k)).map((g) => <option key={g.k} value={g.k}>{tenNgan(g.d.ten)} · {g.diem} điểm</option>)}
                </select>
              </div>
              {(d2.phu || []).length > 0 && d2.chinh && (
                <label className="dmo-w" title="Trọng số đội chính; phần còn lại chia đều cho các đội phụ">
                  Đội chính <b>{d2.wChinh}%</b>
                  <input type="range" min={40} max={90} step={5} value={d2.wChinh} onChange={(e) => dat({ wChinh: +e.target.value })} />
                  phụ {100 - d2.wChinh}%
                </label>
              )}
            </div>
          </>)}
        </div>
      </div>

      {/* 3 · Cơ cấu giá */}
      <div className="card dmo-the dmo-cc">
        <div className="dmo-the-dau"><span className="dmo-so">3</span><b>Cơ cấu giá</b>
          <small>Co giãn theo tổng nón, làm tròn theo bước của từng nhóm, cân đúng tổng — sửa số hoặc % đều được</small>
          <button className="btn-mini" onClick={coCauChuan}>Cơ cấu chuẩn</button>
        </div>
        <table className="tbl dmo-cc-bang">
          <thead><tr><th>Giá sale</th><th className="ct-giua">Tỷ trọng</th><th className="ct-giua">Số lượng</th><th className="ct-giua">Làm tròn</th>
            <th className="ct-giua">Đội tham chiếu bán</th><th className="ct-giua">AI đề nghị</th><th className="ct-giua">Thực chia</th><th className="ct-giua">Kho đủ</th><th /></tr></thead>
          <tbody>
            {coCau.map((g, i) => {
              const n = kh?.nhom.find((x) => x.gia === g.gia);
              const refPt = kh && kh.refs.length ? (() => { let t = 0, v = 0; data.sp.forEach((r) => { const s = kh.refs.reduce((a, k) => a + (kh.w[k] || 0) * ((r[9] || {})[k] || 0), 0); t += r[4] ? s : 0; if (r[4] === g.gia) v += s; }); return t ? v / t : null; })() : null;
              return (
                <tr key={g.gia}>
                  <td><b className="dmo-gia">{kGia(g.gia)}</b></td>
                  <td className="ct-giua"><input className="qty-input dmo-pt" value={tongKH ? (Math.round(((+g.sl || 0) / (d2.tong || tongKH)) * 10000) / 100).toString().replace('.', ',') : ''} onChange={(e) => datPtNhom(i, e.target.value)} />%</td>
                  <td className="ct-giua"><input className="qty-input" type="number" min="0" value={g.sl || ''} onChange={(e) => datSlNhom(i, e.target.value)} /></td>
                  <td className="ct-giua dmo-mo">{moTaMuc(quyTac({ gia: g.gia }, cfg))}</td>
                  <td className="ct-giua">{refPt == null ? '—' : Math.round(refPt * 100) + '%'}</td>
                  <td className="ct-giua">{n ? fmtN(n.ai + n.thung) : '—'}</td>
                  <td className="ct-giua" title={n?.thung ? `Thùng ${fmtN(n.thung)} + kho SA ${fmtN(n.thuc)}` : ''}><b>{n ? fmtN(n.tong) : '—'}</b>{n?.thung ? <small className="dmo-cc-th">thùng {fmtN(n.thung)}</small> : null}</td>
                  <td className="ct-giua">{n ? (n.canh.some((c) => c.includes('kho SA chỉ đủ')) ? <span className="dmo-do">thiếu</span> : <span className="dmo-xanh">✓</span>) : '—'}</td>
                  <td><button className="cl-bo" onClick={() => boNhomGia(g.gia)} title="Bỏ nhóm giá">×</button></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td><b>Tổng</b></td><td className="ct-giua">{d2.tong ? Math.round((tongKH / d2.tong) * 1000) / 10 : 0}%</td>
              <td className="ct-giua"><b className={tongKH !== d2.tong ? 'dmo-do' : ''}>{fmtN(tongKH)}</b></td><td />
              <td /><td className="ct-giua">{fmtN(tongAI + tongThung - (kh?.slNgoai || 0))}</td><td className="ct-giua"><b>{fmtN(tongNhan - (kh?.slNgoai || 0))}</b></td><td />
              <td>{tongKH !== d2.tong && <button className="btn-mini" onClick={canVeTong} title={`Co giãn cơ cấu về đúng ${fmtN(d2.tong)}`}>Cân về {fmtN(d2.tong)}</button>}</td>
            </tr>
          </tfoot>
        </table>
        <div className="dmo-them-nhom">
          <span className="tq-ghi">Thêm nhóm giá:</span>
          {[150000, 200000, 300000, 450000, 550000, 600000].filter((p) => !coCau.some((g) => g.gia === p)).map((p) => (
            <button key={p} className="btn-mini" onClick={() => themNhomGia(p)}>+ {kGia(p)}</button>
          ))}
        </div>
      </div>

      {/* 4 · Thùng đóng sẵn — AI ghép tổ hợp (NEW - 212) */}
      <div className="card dmo-the dmo-tg">
        <div className="dmo-the-dau"><span className="dmo-so">4</span><b>Thùng đóng sẵn</b>
          <small>AI ghép tổ hợp 1–4 thùng sát bộ hàng đầu tiên nhất · phần còn thiếu lấy bổ sung từ kho SA</small>
          <button className="btn-mini" onClick={() => taiDsThung(true)} disabled={taiThung}>{taiThung ? 'Đang tải…' : 'Tải lại kho thùng'}</button>
        </div>
        {!thungDl ? <div className="dmo-tai"><span className="dmo-quet" />{taiThung ? 'Đang đọc kho thùng…' : 'Chưa tải được kho thùng'}</div>
          : !ghep || !Object.keys(ghep.tungSo).length ? <div className="dmo-tg-trong">Chưa có thùng sẵn sàng nào hợp với kế hoạch này.</div> : (<>
          <div className="dmo-tg-tom">Đã chấm {fmtN(ghep.soThung)} thùng sẵn sàng theo kế hoạch {fmtN(ghep.Qt)} nón — chấm cả tổ hợp: đúng mã cần, đúng cơ cấu giá, đa dạng mẫu, không trùng thừa.</div>
          <div className="dmo-tg-luoi">
            {[1, 2, 3, 4].map((k) => {
              const c = ghep.tungSo[k]?.[0];
              if (!c) return null;
              const dang = khopThung(c.thung);
              const tot = ghep.tot && ghep.tot.thung.join('|') === c.thung.join('|');
              return (
                <div key={k} className={'dmo-tg-the' + (dang ? ' dang' : '') + (tot ? ' tot' : '')}>
                  <div className="dmo-tg-dau">
                    <b>{k} thùng</b>{tot && <span className="dmo-tg-ai"><IcSpark /> AI chọn</span>}
                    <span className={'dmo-diem ' + (c.diem >= 70 ? 'cao' : c.diem >= 45 ? 'vua' : 'thap')} title="Độ hợp 0–100: đúng mã cần · đúng cơ cấu giá · đa dạng mẫu">{c.diem}</span>
                  </div>
                  <div className="dmo-tg-so">
                    <span><b>{fmtN(c.n)}</b> cái</span><span>phủ <b>{Math.round(c.phu * 100)}%</b> kế hoạch</span><span><b>{c.soMau}</b> mẫu</span>
                  </div>
                  <div className="dmo-tg-cc">
                    {c.nhom.filter((g) => g.Q > 0).map((g) => (
                      <div key={g.gia} className="dmo-tg-cc-dong" title={`Thùng ${g.c} / định mức nhóm ${g.Q}`}>
                        <span>{kGia(g.gia)}</span>
                        <span className="kt-bar"><span className={'kt-fill' + (g.c > g.Q ? ' du' : '')} style={{ width: Math.min(100, g.Q ? (g.c / g.Q) * 100 : 0) + '%' }} /></span>
                        <em>{g.c}/{g.Q}</em>
                      </div>
                    ))}
                  </div>
                  <ul className="dmo-tg-ly">{c.ly.map((l) => <li key={l}>{l}</li>)}</ul>
                  <div className="dmo-tg-ds">
                    {c.chiTiet.map((t) => <span key={t.t} className="dmo-tg-chip" title={[t.nhom, t.vt].filter(Boolean).join(' · ')}>{t.t}<i>{t.n}</i></span>)}
                  </div>
                  <button className={'btn ' + (dang || !tot ? 'btn-ghost' : 'btn-ai') + ' dmo-tg-nut'} onClick={() => dungToHop(c.thung)} disabled={dang}>
                    {dang ? <><IcCheck /> Đang dùng</> : 'Dùng tổ hợp này'}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="dmo-tg-dung">
            <b>Thùng đang dùng</b>
            {chonThung.length === 0 && <span className="tq-ghi">Chưa dùng thùng — toàn bộ lấy từ kho SA</span>}
            {chonThung.map((t) => (
              <span key={t} className={'dmo-tg-chip on' + (thungMat.includes(t) ? ' mat' : '')} title={thungMat.includes(t) ? 'Thùng không còn sẵn sàng (đã giao / cần kiểm tra) — bỏ ra' : 'Bấm × để bỏ thùng này'}>
                {t}<i>{soCuaThung(t)}</i><button onClick={() => boThung(t)} aria-label={'Bỏ thùng ' + t}>×</button>
              </span>
            ))}
            <input className="inp dmo-tg-them" list="dmo-tg-goi" placeholder="+ Thêm mã thùng" value={oThung} onChange={(e) => setOThung(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); themThung(oThung); } }} />
            <datalist id="dmo-tg-goi">{ghep.xepDon.filter((x) => !chonThung.includes(x.t)).map((x) => <option key={x.t} value={x.t}>{`${x.n} cái · hợp ${x.diem}`}</option>)}</datalist>
            {chonThung.length > 0 && (<>
              <span className="dmo-tg-tong">Thùng <b>{fmtN(ruot.tong)}</b> cái + lấy thêm kho SA <b>{fmtN(tongThuc)}</b> = <b>{fmtN(tongNhan)}</b>{ruot.rut ? ` · rút ${fmtN(ruot.rut)} cái thu hồi` : ''}</span>
              <button className="btn-mini" onClick={() => dat({ thung: [] })}>Bỏ hết thùng</button>
            </>)}
          </div>
          {kh?.ngoai?.length > 0 && (
            <div className="dmo-tg-ngoai" title={kh.ngoai.map((x) => `${x.mtc} ×${x.sl} — ${x.ly}`).join('\n')}>
              <IcAlert /> {fmtN(kh.slNgoai)} cái trong thùng ngoài cơ cấu giá: {kh.ngoai.slice(0, 6).map((x) => `${x.mtc} ×${x.sl}`).join(', ')}{kh.ngoai.length > 6 ? '…' : ''} — vẫn giao theo thùng
            </div>
          )}
        </>)}
      </div>

      {kh && (<>
        {/* KPI */}
        <div className="dmo-kpi">
          <div><small>Kế hoạch</small><b>{fmtN(tongKH)}</b><span>nón · {coCau.length} nhóm giá</span></div>
          <div><small>AI đề nghị</small><b>{fmtN(tongAI + tongThung)}</b><span>{tongAI + tongThung === tongKH ? 'khớp kế hoạch' : `lệch ${fmtN(tongAI + tongThung - tongKH)}`}</span></div>
          <div className="nhan"><small>Thực chia</small><b>{fmtN(tongNhan)}</b><span>{chonThung.length ? `thùng ${fmtN(tongThung)} + kho SA ${fmtN(tongThuc)}` : `${soMa} mã · ${soMau} mẫu`}</span></div>
          <div className={kh.canh.length ? 'canh' : 'ok'}><small>Cảnh báo</small><b>{kh.canh.length}</b><span>{kh.canh.length ? 'xem bên dưới' : 'cơ cấu ổn'}</span></div>
          <div className="dmo-kpi-nut">
            <button className="btn btn-ghost" onClick={apAI} title="Bỏ mọi số sửa tay, dùng lại AI đề nghị"><IcSpark /> Dùng lại AI</button>
          </div>
        </div>

        {kh.canh.length > 0 && (
          <div className="card dmo-canh">
            <button className="dmo-canh-dau" onClick={() => setMoCanh((v) => !v)}><IcAlert /><b>{kh.canh.length} cảnh báo cơ cấu</b><span>{moCanh ? 'Thu gọn' : 'Mở'}</span></button>
            {moCanh && <ul>{kh.canh.map((c, i) => <li key={i}>{c}</li>)}</ul>}
          </div>
        )}

        {sl.coLoc && (
          <div className="dmo-loc-bar"><IcAlert /> Bảng các nhóm giá đang lọc theo cột — dòng ẩn vẫn giữ nguyên số đã chia
            <button className="btn-mini" onClick={sl.xoaLoc}>Bỏ lọc</button></div>
        )}
        {kh.nhom.map((n) => {
          const mo = moNhom[n.gia] !== false;
          const coThung = chonThung.length > 0;
          const hienDong = locVaSap(n.dong, COT_DM, sl.sap, sl.loc);
          const thc = (k, ten, title, loai) => (
            <ThCot k={k} ten={ten} title={title} loai={loai} className={loai === 'chu' ? 'lc-trai' : 'ct-giua'} sap={sl.sap} onSap={sl.datSap}
              loc={sl.loc[k]} onLoc={(v) => sl.datLoc(k, v)} giaTri={() => n.dong.map(COT_DM[k].lay)} />
          );
          return (
            <div key={n.gia} className="card dmo-nhom">
              <button className="dmo-nhom-dau" onClick={() => setMoNhom((m) => ({ ...m, [n.gia]: !mo }))}>
                <span className="dmo-gia lon">{kGia(n.gia)}</span>
                <div className="dmo-nhom-so">
                  <b>{fmtN(n.tong)}<small> / {fmtN(n.Q)}</small></b>
                  <span>{n.thung ? `thùng ${fmtN(n.thung)} + kho SA ${fmtN(n.thuc)} · ` : ''}{n.soMa} mã · {n.soMau} mẫu · làm tròn {moTaMuc(n.qt)}{n.theoKho ? ' · tạm theo tồn kho' : ''}</span>
                </div>
                <div className="dmo-thanh-mau" title={n.thanhMau.map((m) => `${m.hm || '?'} ${Math.round(m.pt * 100)}%`).join(' · ')}>
                  {n.thanhMau.slice(0, 8).map((m, i) => <i key={m.hm + i} className={'m' + (i % 8)} style={{ width: m.pt * 100 + '%' }}>{m.pt > 0.09 ? m.hm : ''}</i>)}
                </div>
                <span className="kt-bar dmo-tien"><span className="kt-fill" style={{ width: Math.min(100, n.Q ? (n.tong / n.Q) * 100 : 0) + '%' }} /></span>
                <span className="dmo-mui">{mo ? '▾' : '▸'}</span>
              </button>
              {mo && (<>
                <div className="tbl-wrap dmo-bang">
                  <table className="tbl">
                    <thead><tr>
                      <th className="ct-stt">#</th><th />{thc('ma', 'Mã', 'Mã tham chiếu', 'chu')}
                      {thc('diem', 'Điểm', 'Điểm phù hợp 0–100: 45% bán đội tham chiếu · 25% toàn mạng · 15% đủ kho · 15% màu đang hút')}
                      {thc('ref', 'Bán ĐTC', 'Bán của đội tham chiếu (cộng các đội đã chọn)')}{thc('mang', 'Toàn mạng')}{thc('kd', 'Kho SA')}
                      {coThung && thc('th', 'Thùng', 'Số có sẵn trong các thùng đang dùng')}
                      {thc('dn', coThung ? 'Đề nghị kho' : 'Đề nghị', coThung ? 'AI đề nghị lấy thêm từ kho SA (ngoài phần thùng)' : 'AI đề nghị')}
                      {thc('thuc', coThung ? 'Thực chia kho' : 'Thực chia', coThung ? 'Số thật lấy từ kho SA (ngoài phần thùng) — sửa thoải mái' : 'Số sẽ xác nhận — sửa thoải mái')}
                      <th>Lý do</th><th />
                    </tr></thead>
                    <tbody>
                      {hienDong.map((d, i) => (
                        <tr key={d.x.bc} className={(d.thay ? 'dmo-thay ' : '') + (d.thuc !== d.dn ? 'dmo-sua ' : '') + (d.thuc > d.x.kd ? 'dmo-vuot' : '')}>
                          <td className="ct-stt">{i + 1}</td>
                          <td><AnhSP url={d.x.img} ten={d.x.mtc} /></td>
                          <td><b className="dmo-ma">{d.x.mtc}</b>{d.thay && <i className="dmo-thay-tag" title={d.thay.map((t) => `thay ${t.sl} cho ${t.cho}`).join('\n')}>thay thế</i>}
                            {d.tuThem && <i className="dmo-thay-tag tay">tự thêm</i>}<small className="dmo-n3">{d.x.n3}</small></td>
                          <td className="ct-giua"><span className={'dmo-diem ' + (d.diem >= 70 ? 'cao' : d.diem >= 45 ? 'vua' : 'thap')}>{d.diem}</span></td>
                          <td className="ct-giua">{d.x.banRef || <span className="ct-khong">·</span>}</td>
                          <td className="ct-giua">{fmtN(d.x.banMang)}</td>
                          <td className={'ct-giua' + (d.thieuMa ? ' dmo-do' : '')}>{fmtN(d.x.kd)}</td>
                          {coThung && <td className="ct-giua dmo-th">{d.th || <span className="ct-khong">·</span>}</td>}
                          <td className="ct-giua dmo-dn">{d.dn || <span className="ct-khong">·</span>}</td>
                          <td className="ct-giua"><input className="qty-input" type="number" min="0" value={d.thuc || ''} placeholder="·" onChange={(e) => datThuc(d.x.bc, e.target.value)} onFocus={(e) => e.target.select()} /></td>
                          <td className="dmo-ly" title={d.ly.join('\n')}>{d.ly.slice(0, 3).join(' · ')}</td>
                          <td><button className="cl-bo" onClick={() => boMa(d.x.bc)} title="Bỏ mã này khỏi kế hoạch (AI chia lại phần còn lại)">×</button></td>
                        </tr>
                      ))}
                      {n.dong.length === 0 && <tr><td colSpan={coThung ? 12 : 11} className="dsl-trong">Chưa có mã nào trong nhóm này.</td></tr>}
                      {n.dong.length > 0 && hienDong.length < n.dong.length && (
                        <tr><td colSpan={coThung ? 12 : 11} className="dmo-an">Đang ẩn {n.dong.length - hienDong.length} dòng do lọc — số đã chia vẫn giữ nguyên · <button className="lk" onClick={sl.xoaLoc}>Bỏ lọc</button></td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {n.choKhac.length > 0 && (
                  <div className="dmo-khac">
                    <b><IcAlert /> Thiếu kho — chỉ còn hàng KHÁC MÀU (cần anh đồng ý)</b>
                    {n.choKhac.map((c) => (
                      <div key={c.x.bc} className="dmo-khac-dong">
                        <span><b>{c.x.mtc}</b> thiếu {c.thieu}</span>
                        {c.goiY.length ? c.goiY.map((o) => (
                          <button key={o.y.bc} onClick={() => dongYKhacMau(c.x, o)} title={`Toàn mạng ${o.y.banMang} · kho ${o.y.kd}`}>Đồng ý {o.y.mtc} +{o.sl}</button>
                        )) : <em>không có mã cùng giá, cùng size còn kho</em>}
                      </div>
                    ))}
                  </div>
                )}
                {n.conLai.length > 0 && (
                  <div className="dmo-them-ma">
                    <span className="tq-ghi">Thêm mã vào nhóm {kGia(n.gia)}:</span>
                    <select className="dmo-sel nho" value="" onChange={(e) => { if (e.target.value) themMa(e.target.value, mucNho(n.qt)); }}>
                      <option value="">Chọn mã còn kho ({n.conLai.length})…</option>
                      {n.conLai.slice(0, 200).map((x) => <option key={x.bc} value={x.bc}>{x.mtc} · mạng {x.banMang} · kho {x.kd}</option>)}
                    </select>
                  </div>
                )}
              </>)}
            </div>
          );
        })}

        <div className="ch-chan dmo-chan">
          <div className="ch-chan-so">
            <span>{d2.ten || tenDoiMoi || 'Đội mới'}{maDoi ? ` · ${maDoi}` : ''}{d2.kv ? ` · ${d2.kv}` : ''}</span>
            <span className="tong">Thực chia <b>{fmtN(tongNhan)}</b> / {fmtN(tongKH)}</span>
            <span>{chonThung.length ? `${chonThung.length} thùng ${fmtN(tongThung)} + kho SA ${fmtN(tongThuc)} · ` : ''}{soMa} mã · {soMau} mẫu</span>
          </div>
          <div className="dmo-chan-nut">
            <button className="btn btn-ghost" onClick={xuatNhap} disabled={!tongNhan}><IcDown /> Xuất Excel nháp</button>
            <button className="btn btn-ai ch-xn" onClick={xacNhan} disabled={gui || !tongNhan || !soDoi}
              title={!soDoi ? 'Nhập số đội (vd 35) để xác nhận' : doiCo ? 'Giữ tồn kho SA ngay + giao thùng + xuất file' : `Tạo đội ${maDoi} rồi giữ tồn kho SA + giao thùng + xuất file`}>
              <IcCheck /> {gui ? 'Đang giữ tồn…' : !soDoi ? 'Xác nhận (cần số đội)' : `Xác nhận & xuất (${fmtN(tongNhan)})`}
            </button>
          </div>
        </div>
      </>)}
    </div>
  );
}
