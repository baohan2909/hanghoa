// NEW - 3.154: KHUNG BÁO CÁO PDF (pdfmake) — khổ A4 dọc, chữ Be Vietnam Pro (cùng chữ với app), màu theo giao diện.
// Chỉ dựng "docDefinition" (dữ liệu thuần) ở đây; phần vẽ ra file nằm ở taoPdfBlob — chỉ tải pdfmake + font khi anh bấm xuất.
import { fmt, tien, tyLe } from './hangSo.js';

export const MAU = {
  ink: '#14213A', ink2: '#4A5670', mo: '#8A94A8', vien: '#E3E7EE', nen: '#F4F6F9', nen2: '#FAFBFC',
  teal: '#3FB6A8', tealDam: '#1E5F63', vang: '#CBA45A', do: '#C6373C', xanh: '#2E8B57', hong: '#D6006C',
};
export const KHO = { rong: 595.28, cao: 841.89, le: 36 };
export const RONG = KHO.rong - KHO.le * 2;          // bề rộng vùng nội dung (523pt)

/* ---------- định dạng ---------- */
export const so = (n) => (n == null || n === '' || Number.isNaN(Number(n)) ? '—' : Math.round(Number(n)).toLocaleString('vi'));
export const tyTrong = (a, b) => (b > 0 ? ((a / b) * 100).toLocaleString('vi', { maximumFractionDigits: 1 }) + '%' : '—');
export const tienGon = tien;
export { fmt };
// chênh lệch so kỳ trước: +12,4% (xanh) / −3,1% (đỏ); "nguoc" = số tăng là xấu (huỷ, hoàn)
export function lech(moi, cu, nguoc = false) {
  const v = tyLe(Number(moi) || 0, Number(cu) || 0);
  if (v == null) return { text: 'mới', color: MAU.mo };
  if (Math.abs(v) < 0.5) return { text: '±0%', color: MAU.mo };
  const tot = nguoc ? v < 0 : v > 0;
  return { text: (v > 0 ? '+' : '−') + Math.abs(v).toLocaleString('vi', { maximumFractionDigits: 1 }) + '%', color: tot ? MAU.xanh : MAU.do };
}

/* ---------- khối dựng sẵn ---------- */
// Tiêu đề mục: chữ đậm + gạch mảnh; phụ = ghi chú nhỏ bên phải
export function muc(tieu, phu, { truocTrang = false, rong = RONG } = {}) {
  return {
    pageBreak: truocTrang ? 'before' : undefined, margin: [0, 14, 0, 6], unbreakable: true, headlineLevel: 1,
    stack: [
      { columns: [{ text: tieu, style: 'muc', width: '*' }, phu ? { text: phu, style: 'mucPhu', width: 'auto', alignment: 'right', margin: [0, 4, 0, 0] } : { text: '', width: 0 }] },
      { canvas: [{ type: 'line', x1: 0, y1: 3, x2: rong, y2: 3, lineWidth: 0.6, lineColor: MAU.vien }, { type: 'line', x1: 0, y1: 3, x2: 28, y2: 3, lineWidth: 1.6, lineColor: MAU.teal }] },
    ],
  };
}

// Dải đầu trang 1 (nền navy) — vẽ ở background để tràn mép
export function nenTrangDau(cao = 150) {
  return (trang) => (trang === 1 ? {
    canvas: [
      { type: 'rect', x: 0, y: 0, w: KHO.rong, h: cao, color: MAU.ink },
      { type: 'rect', x: 0, y: cao - 4, w: KHO.rong * 0.62, h: 4, color: MAU.tealDam },
      { type: 'rect', x: KHO.rong * 0.62, y: cao - 4, w: KHO.rong * 0.38, h: 4, color: MAU.teal },
    ],
  } : null);
}

// Nội dung đầu trang 1: thương hiệu · tiêu đề lớn · kỳ báo cáo · bộ lọc
export function dauTrang({ tieuDe, ky, soSanh, loc }) {
  return {
    margin: [0, -18, 0, 0], stack: [
      { text: 'NÓN SƠN', color: MAU.teal, bold: true, fontSize: 8.5, characterSpacing: 2 },
      { text: tieuDe, color: '#FFFFFF', bold: true, fontSize: 24, margin: [0, 6, 0, 2] },
      { text: [{ text: ky, color: '#FFFFFF', bold: true, italics: true }, soSanh ? { text: '   ·   so với ' + soSanh, color: '#B9C2D3' } : ''], fontSize: 10 },
      { margin: [0, 7, 0, 0], fontSize: 7.8, text: [{ text: 'Phạm vi   ', color: MAU.teal, bold: true, italics: true }, { text: loc || 'Toàn bộ', color: '#DCE3EE' }] },
    ],
  };
}

// Lưới chỉ số: mỗi ô = { ten, so, phu, lech:{text,color}, mau } — 4 ô / hàng
export function luoiKpi(o, soCot = 4) {
  const hang = [];
  for (let i = 0; i < o.length; i += soCot) {
    const r = o.slice(i, i + soCot);
    while (r.length < soCot) r.push(null);
    hang.push(r.map((x) => (x ? {
      stack: [
        { text: x.ten, fontSize: 7.5, color: MAU.ink2, bold: true, italics: true },
        { text: x.so, fontSize: 15, bold: true, color: x.mau || MAU.ink, margin: [0, 3, 0, 1] },
        { text: [x.lech ? { text: x.lech.text + '  ', color: x.lech.color, bold: true } : '', { text: x.phu || '', color: MAU.mo }], fontSize: 7 },
      ],
      fillColor: MAU.nen, margin: [9, 8, 9, 8],
    } : { text: '', fillColor: '#FFFFFF' })));
  }
  return {
    table: { widths: Array(soCot).fill('*'), body: hang },
    // khe trắng 4pt giữa các ô; không kẻ viền ngoài (khỏi đè lên dải đầu trang)
    layout: { hLineWidth: (i, n) => (i === 0 || i === n.table.body.length ? 0 : 4), vLineWidth: (i, n) => (i === 0 || i === n.table.widths.length ? 0 : 4),
      hLineColor: () => '#FFFFFF', vLineColor: () => '#FFFFFF', paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
    margin: [0, 30, 0, 0],
  };
}

// Hộp "Điểm chính" — các câu nhận xét tự rút từ số liệu
export function diemChinh(cau, tieu = 'Điểm chính') {
  const ds = cau.filter(Boolean);
  if (!ds.length) return null;
  return {
    margin: [0, 12, 0, 0], unbreakable: true,
    table: { widths: [3, '*'], body: [[{ text: '', fillColor: MAU.teal }, {
      stack: [{ text: tieu, bold: true, fontSize: 9.5, color: MAU.ink, margin: [0, 0, 0, 4] },
        { ul: ds.map((c) => ({ text: c, margin: [0, 1.5, 0, 1.5] })), fontSize: 8.5, color: MAU.ink, markerColor: MAU.tealDam }],
      fillColor: '#F2FAF9', margin: [10, 8, 10, 8],
    }]] },
    layout: 'noBorders',
  };
}

// Thanh tỷ trọng ngang (100%) chia màu + chú thích bên dưới
export function thanhTyTrong(phan, { rong = RONG, cao = 12 } = {}) {
  const tong = phan.reduce((s, p) => s + (p.v > 0 ? p.v : 0), 0) || 1;
  let x = 0; const rect = [];
  for (const p of phan) {
    if (!(p.v > 0)) continue;
    const w = (p.v / tong) * rong;
    rect.push({ type: 'rect', x, y: 0, w: Math.max(w - 1.5, 0.5), h: cao, color: p.mau });
    x += w;
  }
  return {
    stack: [
      { canvas: rect },
      chuGiai(phan.filter((p) => p.v > 0).map((p) => ({ ten: p.ten, phu: tyTrong(p.v, tong), mau: p.mau, dam: true }))),
    ],
  };
}

// Biểu đồ cột (chồng nhiều phần): cot = [{ nhan, phan:[{v, mau}], tieuDiem? }]; vẽ bằng bảng N cột để nhãn thẳng hàng cột
export function bieuDoCot(cot, { cao = 120, rong = RONG, dinhDang = tien, chuThich = null, nhanMoi = null } = {}) {
  const n = Math.max(cot.length, 1);
  const w = rong / n;
  const tongCot = cot.map((c) => c.phan.reduce((s, p) => s + (p.v > 0 ? p.v : 0), 0));
  const max = Math.max(1, ...tongCot);
  const buoc = nhanMoi || (n > 40 ? 7 : n > 20 ? 2 : 1);
  const be = Math.min(Math.max(w * 0.62, 2), 18);
  const luoi = [0.25, 0.5, 0.75, 1].map((t) => ({ type: 'line', x1: 0, y1: cao - cao * t, x2: w, y2: cao - cao * t, lineWidth: 0.4, lineColor: MAU.vien, dash: { length: 2 } }));
  const iMax = tongCot.indexOf(Math.max(...tongCot));
  const o = cot.map((c) => {
    let y = cao; const r = [...luoi, { type: 'line', x1: 0, y1: cao, x2: w, y2: cao, lineWidth: 0.6, lineColor: MAU.mo }];
    for (const p of c.phan) {
      if (!(p.v > 0)) continue;
      const h = (p.v / max) * (cao - 10);
      y -= h;
      r.push({ type: 'rect', x: (w - be) / 2, y, w: be, h: Math.max(h - 0.6, 0.3), color: p.mau });
    }
    return { canvas: r };
  });
  const nhan = cot.map((c, i) => ({ text: i % buoc === 0 || i === n - 1 ? c.nhan : '', fontSize: n > 24 ? 5.8 : 6.5, color: i === iMax ? MAU.ink : MAU.mo, bold: i === iMax, alignment: 'center' }));
  const dinh = tongCot[iMax] > 0 ? `Cao nhất: ${dinhDang(tongCot[iMax])} (${cot[iMax].nhanDu || cot[iMax].nhan})` : '';
  return {
    unbreakable: true, stack: [
      { text: dinh, fontSize: 7, color: MAU.ink2, alignment: 'right', margin: [0, 0, 0, 3] },
      { table: { widths: Array(n).fill(w), body: [o, nhan] }, layout: { defaultBorder: false, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: (r) => (r === 1 ? 3 : 0), paddingBottom: () => 0 } },
      chuThich ? chuGiai(chuThich) : '',
    ],
  };
}

// Thanh ngang nhỏ trong ô bảng (so với giá trị lớn nhất)
export function thanhO(v, max, mau = MAU.teal, rong = 54) {
  const w = max > 0 ? Math.max((v / max) * rong, v > 0 ? 1 : 0) : 0;
  return { canvas: [{ type: 'rect', x: 0, y: 2, w: rong, h: 5, color: '#EEF1F5' }, ...(w > 0 ? [{ type: 'rect', x: 0, y: 2, w, h: 5, color: mau }] : [])] };
}

// Bảng số liệu: cot = [{ ten, rong, canh:'left'|'right'|'center', k | f(row) }], dong = mảng hàng, tong = hàng tổng (tuỳ chọn)
export function bang(cot, dong, { tong = null, coChu = 7.5, rongTrong = 'Không có dữ liệu' } = {}) {
  const dau = cot.map((c) => ({ text: c.ten, style: 'bangDau', alignment: c.canh || 'left' }));
  const o = (c, r) => {
    const v = c.f ? c.f(r) : r[c.k];
    if (v && typeof v === 'object' && !Array.isArray(v)) return { alignment: c.canh || 'left', ...v };
    return { text: v == null || v === '' ? '—' : String(v), alignment: c.canh || 'left' };
  };
  const body = [dau, ...dong.map((r) => cot.map((c) => o(c, r)))];
  if (!dong.length) body.push([{ text: rongTrong, colSpan: cot.length, color: MAU.mo, alignment: 'center', margin: [0, 6, 0, 6] }, ...Array(cot.length - 1).fill('')]);
  if (tong) body.push(cot.map((c) => ({ ...o(c, tong), bold: true, color: MAU.ink })));
  const nDong = body.length;
  return {
    fontSize: coChu, color: MAU.ink,
    table: { headerRows: 1, widths: cot.map((c) => c.rong || '*'), body, dontBreakRows: true },
    layout: {
      hLineWidth: (i) => (i === 1 ? 0.8 : tong && i === nDong - 1 ? 0.8 : i === 0 || i === nDong ? 0 : 0.4),
      vLineWidth: () => 0,
      hLineColor: (i) => (i === 1 || (tong && i === nDong - 1) ? MAU.ink : MAU.vien),
      fillColor: (i) => (i === 0 ? MAU.nen : tong && i === nDong - 1 ? '#EEF6F5' : null),
      paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 3.2, paddingBottom: () => 3.2,
    },
  };
}

// Chấm màu + chữ (ô kênh)
export const chamChu = (mau, chu, them = {}) => ({ text: [{ text: '• ', color: mau, bold: true, fontSize: 9.5 }, { text: chu }], ...them });
// Chú giải màu: chấm + chữ (+ số), xếp hàng ngang, tự xuống dòng khi dài
export function chuGiai(ds, { coChu = 7.5 } = {}) {
  return { margin: [0, 6, 0, 0], fontSize: coChu, color: MAU.ink, lineHeight: 1.35, text: ds.flatMap((p, i) => [
    i ? { text: '      ' } : '', { text: '• ', color: p.mau, bold: true, fontSize: coChu + 2.5 }, { text: p.ten, bold: !!p.dam }, p.phu ? { text: ' ' + p.phu, color: MAU.ink2 } : '',
  ]) };
}

// Gói tiêu đề + bảng nhỏ không tách trang
export const khoi = (...ds) => ({ unbreakable: true, stack: ds.filter(Boolean) });

// Hai khối đặt cạnh nhau
export const NUA = (RONG - 16) / 2;   // bề rộng 1 cột khi đặt 2 khối cạnh nhau
export const haiCot = (a, b, khoang = 16) => ({ unbreakable: true, columns: [{ width: '*', stack: [a].flat().filter(Boolean) }, { width: '*', stack: [b].flat().filter(Boolean) }], columnGap: khoang });

/* ---------- tài liệu ---------- */
export function taiLieu({ tieuDeTrang, nguoi, luc, noiDung, caoDau = 134 }) {
  return {
    pageSize: 'A4', pageOrientation: 'portrait', pageMargins: [KHO.le, 46, KHO.le, 40],
    info: { title: tieuDeTrang, author: 'Nón Sơn — NS FLOW', creator: 'NS FLOW' },
    background: nenTrangDau(caoDau),
    header: (trang) => (trang === 1 ? null : {
      margin: [KHO.le, 18, KHO.le, 0], columns: [
        { text: tieuDeTrang, fontSize: 7.5, color: MAU.ink2, bold: true, italics: true },
        { text: 'NÓN SƠN', fontSize: 7, color: MAU.tealDam, bold: true, characterSpacing: 1.6, alignment: 'right' },
      ],
    }),
    footer: (trang, tong) => ({
      margin: [KHO.le, 12, KHO.le, 0], columns: [
        { text: `NS FLOW · xuất lúc ${luc}${nguoi ? ' · ' + nguoi : ''}`, fontSize: 6.8, color: MAU.mo },
        { text: `Trang ${trang} / ${tong}`, fontSize: 6.8, color: MAU.mo, alignment: 'right' },
      ],
    }),
    content: noiDung.filter(Boolean),
    defaultStyle: { font: 'BVP', fontSize: 8.5, color: MAU.ink, lineHeight: 1.18 },
    styles: {
      muc: { fontSize: 12, bold: true, color: MAU.ink },
      mucPhu: { fontSize: 7.5, color: MAU.mo },
      bangDau: { fontSize: 7, bold: true, italics: true, color: MAU.ink2 },
      ghi: { fontSize: 7, color: MAU.mo },
    },
  };
}

// italics = Medium, bolditalics = SemiBold (dùng như 2 độ đậm trung gian)
export const FONT_BVP = { normal: 'BeVietnamPro-Regular.ttf', bold: 'BeVietnamPro-Bold.ttf', italics: 'BeVietnamPro-Medium.ttf', bolditalics: 'BeVietnamPro-SemiBold.ttf' };

/* ---------- dựng file (trình duyệt) ---------- */
let sanSang = null;
async function napPdfMake() {
  if (!sanSang) sanSang = (async () => {
    const pdfMake = (await import('pdfmake/build/pdfmake')).default;
    const goc = (import.meta.env?.BASE_URL || '/') + 'fonts/';
    const vfs = {};
    await Promise.all(Object.values(FONT_BVP).map(async (f) => {
      const r = await fetch(goc + f);
      if (!r.ok) throw new Error('Không tải được font ' + f);
      const b = new Uint8Array(await r.arrayBuffer());
      let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
      vfs[f] = btoa(s);
    }));
    pdfMake.vfs = vfs;
    pdfMake.fonts = { BVP: FONT_BVP };
    return pdfMake;
  })().catch((e) => { sanSang = null; throw e; });
  return sanSang;
}
export async function taoPdfBlob(doc) {
  const pdfMake = await napPdfMake();
  return new Promise((ok, loi) => {
    try { pdfMake.createPdf(doc).getBlob((b) => ok(b)); } catch (e) { loi(e); }
  });
}
