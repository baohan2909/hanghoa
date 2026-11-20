import { useEffect, useMemo, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { useApp } from '../App.jsx';
import { IcCheck, IcDown, IcAlert, IcSpark, IcTeam, IcTarget } from '../lib/icons.jsx';
import { AnhSP } from './DsBanChia.jsx';
import { TrangThaiLuu, baoLoiXacNhan, fmtN, lsGet, lsSet, so, tenNgan, useNhap, xuatHaiFile, tenPhieu, useHoiGhiChu, ghiDong1, KHO_TEN } from './dsChung.jsx';
import { useLamTron, quyTac, lenMuc, xuongMuc, mucNho, canBang, chiaTyTrong, kGia, hoMau, mauMa, moTaMuc } from './dsLamTron.js';
import { tachSize, thuTuSize } from './DsBoLoc.jsx';

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
// ============================================================================
const ngan = (ma) => String(ma || '').replace('DOISALE', '');
const dayDu = (k) => 'DOISALE' + k;
let boNhoDl = null;   // {cuaSo, luc, data}

function macDinhNhap(cfg) {
  const dm = cfg.doi_moi || {};
  return { ten: '', ma: '', kv: '', tong: dm.tong || 1050, chinh: null, phu: [], wChinh: Math.round((dm.w_chinh ?? 0.6) * 100),
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
export function lapKeHoach(data, dl, cfg) {
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
    // xét kho + thay thế
    const theoBc = Object.fromEntries(rowsG.map((x) => [x.bc, x]));
    const kdCon = Object.fromEntries(rowsG.map((x) => [x.bc, x.kd]));
    const a = {}, thay = {}, choKhac = [];
    const sxP = (u, v2) => v2.p - u.p || v2.banMang - u.banMang;
    const tongMau = (m) => rowsG.reduce((t, y) => t + (y.mau === m ? a[y.bc] || 0 : 0), 0);
    const dongYTheoCho = {};
    Object.entries(dl.dongY || {}).forEach(([bcY, o]) => { if (theoBc[bcY] && o?.cho) (dongYTheoCho[o.cho] = dongYTheoCho[o.cho] || []).push({ bc: bcY, sl: o.sl }); });
    cand.forEach((x) => {
      const d = muon[x.bc] || 0;
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
    const dsCB = rowsDung.map((x) => ({ k: x.bc, w: cand.find((c) => c.bc === x.bc) ? x.p || 1e-9 : (a[x.bc] ? 1e-9 : 0), raw: muon[x.bc] || 0, tran: x.kd }));
    const mauCua = Object.fromEntries(rowsG.map((x) => [x.bc, x.mau]));
    const lech = Q > 0 ? canBang(a, dsCB, Q, qt, (d, tang) => tongMau(mauCua[d.k]) + tang <= capMau) : 0;
    // điểm + lý do
    const daChon = rowsG.filter((x) => (a[x.bc] || 0) > 0 || (muon[x.bc] || 0) > 0 || (dl.sua || {})[x.bc] > 0);
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
      const thieuMa = Math.max(0, (muon[x.bc] || 0) - Math.min(muon[x.bc] || 0, x.kd));
      if (thieuMa) ly.push(`Thiếu kho ${thieuMa} — đã tìm thay thế`);
      const thuc = (dl.sua || {})[x.bc] ?? dn;
      return { x, dn, muon: muon[x.bc] || 0, thuc, diem: Math.max(0, Math.min(100, diem)), ly, thay: thay[x.bc] || null, thieuMa, tuThem: !!(dl.them || {})[x.bc] };
    }).sort((u, v) => v.dn - u.dn || v.diem - u.diem || u.x.nhomMa.localeCompare(v.x.nhomMa) || thuTuSize(u.x.size) - thuTuSize(v.x.size));
    const thuc = dong.reduce((s, d) => s + (d.thuc || 0), 0);
    const ai = dong.reduce((s, d) => s + d.dn, 0);
    // cảnh báo nhóm
    const khoDu = rowsDung.reduce((s, x) => s + xuongMuc(x.kd, qt), 0);
    if (Q > 0 && khoDu < Q) canhN.push(`Nhóm ${kGia(g.gia)}: kho SA chỉ đủ ${fmtN(khoDu)}/${fmtN(Q)} — thiếu cơ cấu ${fmtN(Q - khoDu)}`);
    if (lech) canhN.push(`Nhóm ${kGia(g.gia)}: ${lech > 0 ? `còn thiếu ${lech}` : `dư ${-lech}`} so với kế hoạch (bước làm tròn / kho)`);
    const theoMauDn = {}, theoMauSacDn = {};
    dong.forEach((d) => { theoMauDn[d.x.mau] = (theoMauDn[d.x.mau] || 0) + d.thuc; theoMauSacDn[d.x.hm] = (theoMauSacDn[d.x.hm] || 0) + d.thuc; });
    const [mauTop, slMauTop] = Object.entries(theoMauDn).sort((u, v) => v[1] - u[1])[0] || [];
    const [msTop, slMsTop] = Object.entries(theoMauSacDn).sort((u, v) => v[1] - u[1])[0] || [];
    if (thuc >= 50 && slMauTop / thuc > tranMau + 0.05) canhN.push(`Nhóm ${kGia(g.gia)}: mẫu ${mauTop} chiếm ${Math.round((slMauTop / thuc) * 100)}% — tập trung 1 mẫu`);
    if (thuc >= 50 && msTop && slMsTop / thuc > tranMauSac) canhN.push(`Nhóm ${kGia(g.gia)}: màu ${msTop} chiếm ${Math.round((slMsTop / thuc) * 100)}% — tập trung 1 màu`);
    if (thuc >= 50 && Object.keys(theoMauDn).length < 3) canhN.push(`Nhóm ${kGia(g.gia)}: chỉ ${Object.keys(theoMauDn).length} mẫu — ít lựa chọn cho khách`);
    if (choKhac.length) canhN.push(`Nhóm ${kGia(g.gia)}: ${choKhac.length} mã thiếu kho chưa có hàng cùng màu thay — xem đề xuất khác màu`);
    if (refs.length && tongMixRef > 0) {
      const sRef = (mixRef[g.gia] || 0) / tongMixRef, sCC = Q / tongCC;
      if (Math.abs(sRef - sCC) > 0.12) canh.push(`Đội tham chiếu bán nhóm ${kGia(g.gia)} ${Math.round(sRef * 100)}% nhưng cơ cấu đặt ${Math.round(sCC * 100)}%`);
    }
    canh.push(...canhN);
    // tỷ trọng màu (cho thanh màu)
    const thanhMau = Object.entries(theoMauSacDn).filter(([, v]) => v > 0).sort((u, v) => v[1] - u[1]).map(([hm, v]) => ({ hm, v, pt: thuc ? v / thuc : 0 }));
    return { gia: g.gia, Q, qt, dong, thuc, ai, lech, choKhac, theoKho, canh: canhN, soMa: dong.filter((d) => d.thuc > 0).length,
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
  return { nhom, canh, refs, w };
}

// ---------------------------------------------------------------------------
export default function DsDoiMoi({ dsDoi }) {
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
  const [hoiGhiChu, hopGhiChu] = useHoiGhiChu();
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

  const kh = useMemo(() => (data ? lapKeHoach(data, d2, cfg) : null), [data, JSON.stringify(d2), cfg]);   // eslint-disable-line
  const goiY = useMemo(() => (data ? goiYDoi(data, coCau, d2.kv) : []), [data, JSON.stringify(coCau), d2.kv]);   // eslint-disable-line

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
  const tongThuc = kh ? kh.nhom.reduce((a, n) => a + n.thuc, 0) : 0;
  const soMa = kh ? kh.nhom.reduce((a, n) => a + n.soMa, 0) : 0;
  const soMau = kh ? kh.nhom.reduce((a, n) => a + n.soMau, 0) : 0;
  const doiCo = dsDoi.find((d) => d.ma_ch === (d2.ma || '').trim().toUpperCase());
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
    if (!ds.length) { baoToast('Chưa có số nào'); return; }
    const ghiChu = await hoiGhiChu({ macDinh: `${d2.ten || 'Đội mới'}${d2.kv ? ' – ' + d2.kv : ''}`, tieuDe: 'Ghi chú file chia trước (nháp)', nutXong: 'Xuất Excel nháp',
      phu: `${fmtN(tongThuc)} cái · ${soMa} mã — file nháp, CHƯA giữ tồn kho` });
    if (ghiChu === null) return;
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(ds.map(({ d, kho, sl }) => ({
      'Kho chuyển': kho, 'Tên kho chuyển': KHO_TEN[kho] || kho, 'Cửa hàng nhận': (d2.ma || '').trim().toUpperCase(), 'Tên cửa hàng nhận': d2.ten || 'Đội mới',
      Barcode: d.x.bc, 'Mã tham chiếu': d.x.mtc, 'Sản phẩm': d.x.n3 || '', 'Số lượng': sl, 'Ghi chú': `Chia trước đội mới (nháp) · ${kGia(d.x.gia)}`,
    })));
    ghiDong1(XLSX, ws, ghiChu);
    const ws2 = XLSX.utils.json_to_sheet(kh.nhom.flatMap((n) => n.dong.filter((d) => d.thuc > 0 || d.dn > 0).map((d) => ({
      'Nhóm giá': kGia(n.gia), 'Mã tham chiếu': d.x.mtc, Barcode: d.x.bc, 'Điểm phù hợp': d.diem, 'AI đề nghị': d.dn, 'Thực chia': d.thuc,
      'Bán ĐTC': d.x.banRef, 'Bán toàn mạng': d.x.banMang, 'Kho SA': d.x.kd, 'Lý do': d.ly.join(' · '),
    }))));
    const ws3 = XLSX.utils.json_to_sheet(kh.nhom.map((n) => ({ 'Nhóm giá': kGia(n.gia), 'Kế hoạch': n.Q, 'Tỷ trọng': tongKH ? Math.round((n.Q / tongKH) * 10000) / 100 + '%' : '', 'AI đề nghị': n.ai, 'Thực chia': n.thuc, 'Số mã': n.soMa, 'Số mẫu': n.soMau })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DieuChuyen');
    XLSX.utils.book_append_sheet(wb, ws2, 'KeHoach');
    XLSX.utils.book_append_sheet(wb, ws3, 'CoCau');
    const ten = (d2.ten || 'DoiMoi').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/[^\w]+/g, '_');
    XLSX.writeFile(wb, `ChiaTruoc_${ten}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    baoToast(`Đã xuất file nháp ${fmtN(tongThuc)} cái — chưa giữ tồn`);
  };
  const xacNhan = async () => {
    if (!doiCo) { baoToast('Đội chưa có mã trong hệ thống — chỉ xuất nháp được'); return; }
    const ds = kh.nhom.flatMap((n) => n.dong.filter((d) => d.thuc > 0).map((d) => ({ ma_ch: doiCo.ma_ch, barcode: d.x.bc, sl_sa: d.thuc })));
    if (!ds.length) { baoToast('Chưa có số nào'); return; }
    const vuot = kh.nhom.flatMap((n) => n.dong.filter((d) => d.thuc > d.x.kd));
    if (vuot.length) { baoToast(`${vuot.length} mã thực chia vượt kho SA — sửa trước khi xác nhận`); return; }
    const ghiChu = await hoiGhiChu({ macDinh: `${String(doiCo.ten || '').replace(/^Đội SALE/i, 'Đội Sale')}${d2.kv ? ' – ' + d2.kv : ' – '}`, tieuDe: `Xác nhận chia trước — ${tenNgan(doiCo.ten)}`,
      nutXong: `Xác nhận & xuất (${fmtN(tongThuc)})`, phu: `${fmtN(tongThuc)} cái · ${soMa} mã — giữ tồn kho SA ngay khi xác nhận` });
    if (ghiChu === null) return;
    setGui(true);
    const { data: kq, error } = await sb.rpc('fn_ds_xac_nhan', { p: { loai: 'doi', nguoi, khoa_nhap: 'doimoi:' + id, ghi_chu: ghiChu || null, dong: ds, thung: [] } });
    setGui(false);
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    if (!kq?.ok) { baoLoiXacNhan(kq, baoToast); tai(true); return; }
    try { await xuatHaiFile(kq, ghiChu); } catch { baoToast('Đã giữ tồn, xuất file lỗi — tải lại ở tab Phiếu đã chia'); }
    baoToast(`Đã xác nhận ${tenPhieu(kq)}: ${fmtN(tongThuc)} cái cho ${tenNgan(doiCo.ten)}`);
    tai(true);
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
            <label><span>Tên đội</span><input className="inp" value={d2.ten} placeholder="Vd Đội Sale 31" onChange={(e) => dat({ ten: e.target.value })} /></label>
            <label title="Khi đội đã có mã trong hệ thống (DOISALExx) thì xác nhận giữ tồn được; chưa có thì xuất file nháp">
              <span>Mã đội (nếu đã có)</span>
              <input className="inp" value={d2.ma} placeholder="Vd DOISALE31" list="dmo-ds-doi" onChange={(e) => dat({ ma: e.target.value })} />
              <datalist id="dmo-ds-doi">{dsDoi.map((d) => <option key={d.ma_ch} value={d.ma_ch}>{d.ten}</option>)}</datalist>
              {d2.ma && <small className={doiCo ? 'ok' : 'vang'}>{doiCo ? `✓ ${doiCo.ten}` : 'chưa có trong hệ thống — chỉ xuất nháp'}</small>}
            </label>
            <label><span>Khu vực dự kiến</span><input className="inp" value={d2.kv} placeholder="Vd Lạc Long Quân" onChange={(e) => dat({ kv: e.target.value })} /></label>
            <label title="Tổng số nón chia trước — đổi tổng thì cơ cấu giá tự co giãn theo tỷ trọng">
              <span>Tổng nón</span>
              <input className="inp dmo-tong" type="number" min="100" step="10" value={d2.tong || ''} onChange={(e) => doiTong(e.target.value)} />
              <small>thường 1.000 – 1.100</small>
            </label>
          </div>
          <div className="dmo-form-chan">
            <label title="Số ngày lấy số bán của đội tham chiếu">Số bán trong
              <select value={cuaSo} onChange={(e) => setCuaSo(+e.target.value)}>{[14, 28, 45, 60].map((n) => <option key={n} value={n}>{n} ngày</option>)}</select></label>
            <label title="Không mẫu nào vượt quá tỷ lệ này trong 1 nhóm giá (đa dạng mẫu)">Trần mỗi mẫu
              <select value={d2.tranMau} onChange={(e) => dat({ tranMau: +e.target.value })}>{[15, 20, 25, 30, 40, 100].map((n) => <option key={n} value={n}>{n === 100 ? 'không giới hạn' : n + '% nhóm'}</option>)}</select></label>
            {dsNhap.some((n) => n.id === id) && <button className="dmo-xoa-nhap" onClick={xoaBanNhap}>Xoá bản nháp này</button>}
          </div>
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
                  <td className="ct-giua">{n ? fmtN(n.ai) : '—'}</td>
                  <td className="ct-giua"><b>{n ? fmtN(n.thuc) : '—'}</b></td>
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
              <td /><td className="ct-giua">{fmtN(tongAI)}</td><td className="ct-giua"><b>{fmtN(tongThuc)}</b></td><td />
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

      {kh && (<>
        {/* KPI */}
        <div className="dmo-kpi">
          <div><small>Kế hoạch</small><b>{fmtN(tongKH)}</b><span>nón · {coCau.length} nhóm giá</span></div>
          <div><small>AI đề nghị</small><b>{fmtN(tongAI)}</b><span>{tongAI === tongKH ? 'khớp kế hoạch' : `lệch ${fmtN(tongAI - tongKH)}`}</span></div>
          <div className="nhan"><small>Thực chia</small><b>{fmtN(tongThuc)}</b><span>{soMa} mã · {soMau} mẫu</span></div>
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

        {kh.nhom.map((n) => {
          const mo = moNhom[n.gia] !== false;
          return (
            <div key={n.gia} className="card dmo-nhom">
              <button className="dmo-nhom-dau" onClick={() => setMoNhom((m) => ({ ...m, [n.gia]: !mo }))}>
                <span className="dmo-gia lon">{kGia(n.gia)}</span>
                <div className="dmo-nhom-so">
                  <b>{fmtN(n.thuc)}<small> / {fmtN(n.Q)}</small></b>
                  <span>{n.soMa} mã · {n.soMau} mẫu · làm tròn {moTaMuc(n.qt)}{n.theoKho ? ' · tạm theo tồn kho' : ''}</span>
                </div>
                <div className="dmo-thanh-mau" title={n.thanhMau.map((m) => `${m.hm || '?'} ${Math.round(m.pt * 100)}%`).join(' · ')}>
                  {n.thanhMau.slice(0, 8).map((m, i) => <i key={m.hm + i} className={'m' + (i % 8)} style={{ width: m.pt * 100 + '%' }}>{m.pt > 0.09 ? m.hm : ''}</i>)}
                </div>
                <span className="kt-bar dmo-tien"><span className="kt-fill" style={{ width: Math.min(100, n.Q ? (n.thuc / n.Q) * 100 : 0) + '%' }} /></span>
                <span className="dmo-mui">{mo ? '▾' : '▸'}</span>
              </button>
              {mo && (<>
                <div className="tbl-wrap dmo-bang">
                  <table className="tbl">
                    <thead><tr>
                      <th className="ct-stt">#</th><th /><th>Mã</th><th className="ct-giua" title="Điểm phù hợp 0–100: 45% bán đội tham chiếu · 25% toàn mạng · 15% đủ kho · 15% màu đang hút">Điểm</th>
                      <th className="ct-giua" title="Bán của đội tham chiếu (cộng các đội đã chọn)">Bán ĐTC</th><th className="ct-giua">Toàn mạng</th><th className="ct-giua">Kho SA</th>
                      <th className="ct-giua">Đề nghị</th><th className="ct-giua">Thực chia</th><th>Lý do</th><th />
                    </tr></thead>
                    <tbody>
                      {n.dong.map((d, i) => (
                        <tr key={d.x.bc} className={(d.thay ? 'dmo-thay ' : '') + (d.thuc !== d.dn ? 'dmo-sua ' : '') + (d.thuc > d.x.kd ? 'dmo-vuot' : '')}>
                          <td className="ct-stt">{i + 1}</td>
                          <td><AnhSP url={d.x.img} ten={d.x.mtc} /></td>
                          <td><b className="dmo-ma">{d.x.mtc}</b>{d.thay && <i className="dmo-thay-tag" title={d.thay.map((t) => `thay ${t.sl} cho ${t.cho}`).join('\n')}>thay thế</i>}
                            {d.tuThem && <i className="dmo-thay-tag tay">tự thêm</i>}<small className="dmo-n3">{d.x.n3}</small></td>
                          <td className="ct-giua"><span className={'dmo-diem ' + (d.diem >= 70 ? 'cao' : d.diem >= 45 ? 'vua' : 'thap')}>{d.diem}</span></td>
                          <td className="ct-giua">{d.x.banRef || <span className="ct-khong">·</span>}</td>
                          <td className="ct-giua">{fmtN(d.x.banMang)}</td>
                          <td className={'ct-giua' + (d.thieuMa ? ' dmo-do' : '')}>{fmtN(d.x.kd)}</td>
                          <td className="ct-giua dmo-dn">{d.dn || <span className="ct-khong">·</span>}</td>
                          <td className="ct-giua"><input className="qty-input" type="number" min="0" value={d.thuc || ''} placeholder="·" onChange={(e) => datThuc(d.x.bc, e.target.value)} onFocus={(e) => e.target.select()} /></td>
                          <td className="dmo-ly" title={d.ly.join('\n')}>{d.ly.slice(0, 3).join(' · ')}</td>
                          <td><button className="cl-bo" onClick={() => boMa(d.x.bc)} title="Bỏ mã này khỏi kế hoạch (AI chia lại phần còn lại)">×</button></td>
                        </tr>
                      ))}
                      {n.dong.length === 0 && <tr><td colSpan={11} className="dsl-trong">Chưa có mã nào trong nhóm này.</td></tr>}
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
            <span>{d2.ten || 'Đội mới'}{d2.kv ? ` · ${d2.kv}` : ''}</span>
            <span className="tong">Thực chia <b>{fmtN(tongThuc)}</b> / {fmtN(tongKH)}</span>
            <span>{soMa} mã · {soMau} mẫu</span>
          </div>
          <div className="dmo-chan-nut">
            <button className="btn btn-ghost" onClick={xuatNhap} disabled={!tongThuc}><IcDown /> Xuất Excel nháp</button>
            <button className="btn btn-ai ch-xn" onClick={xacNhan} disabled={gui || !tongThuc || !doiCo}
              title={doiCo ? 'Giữ tồn kho SA ngay + xuất file' : 'Nhập mã đội đã có trong hệ thống để xác nhận giữ tồn'}>
              <IcCheck /> {gui ? 'Đang giữ tồn…' : doiCo ? `Xác nhận & xuất (${fmtN(tongThuc)})` : 'Xác nhận (cần mã đội)'}
            </button>
          </div>
        </div>
      </>)}
    </div>
  );
}
