// NEW - 3.154: BÁO CÁO + DỮ LIỆU XUẤT cho màn TikTok Shop. Dựng từ đúng số liệu đang xem (fn_tt_bao_cao) + dòng chi tiết (fn_tt_xuat).
import { tien, ngayVN, ngayNgan, tbN, tbTien, TT_KENH, TT_LOAI, TT_TRANG_THAI } from './hangSo.js';
import { MAU, NUA, so, tyTrong, khoi, muc, dauTrang, luoiKpi, diemChinh, thanhTyTrong, bieuDoCot, thanhO, bang, chamChu, haiCot, taiLieu } from './pdf.js';

const W_TIEN = 64;
const cat = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');
const soNgay = (tu, den) => Math.round((new Date(den + 'T00:00:00') - new Date(tu + 'T00:00:00')) / 864e5) + 1;
const tb1 = (x, n) => (x == null ? null : Math.round(((Number(x) || 0) / Math.max(1, n)) * 10) / 10);   // NEW - 3.157 TB / ngày (Excel)
const tenNb = (bc, h) => (h ? (bc.ten_nb?.[h] || '@' + h) : 'Không qua người bán');
const KTH = ['live', 'video', 'the', 'khac'];

// gộp người bán từ 3 nguồn (đơn + thống kê LIVE + thống kê video) — giống bảng Người bán trên màn hình
function dsNguoiBan(bc) {
  const m = new Map();
  for (const r of bc.nb || []) m.set(r.nb, { ...r });
  const them = (h) => { if (!m.has(h)) m.set(h, { nb: h, don: 0, sl: 0, dt: 0, huy: 0 }); return m.get(h); };
  for (const [h, v] of Object.entries(bc.live_nb || {})) Object.assign(them(h), { lv_phien: v.so_phien, lv_dt: v.dt, lv_sl: v.sl, lv_don: v.don, lv_xem: v.xem });
  for (const [h, v] of Object.entries(bc.video_nb || {})) Object.assign(them(h), { vd_so: v.so_video, vd_don: v.don, vd_sl: v.sl, vd_dt: v.dt, vd_xem: v.xem });
  for (const r of m.values()) {
    const tt = bc.nb_tt?.[r.nb];
    if (tt) { r.loai = r.loai || tt.loai; r.ma_ch = r.ma_ch || tt.ma_ch; r.ten_ch = r.ten_ch || tt.ten_ch; }
    r.ten = tenNb(bc, r.nb);
  }
  return [...m.values()].sort((a, b) => (b.dt || 0) - (a.dt || 0) || (b.lv_dt || 0) - (a.lv_dt || 0));
}

// NEW - 3.156: chia người bán thành 3 nhóm — mỗi ID thuộc ĐÚNG 1 nhóm, mỗi đơn tính cho 1 ID (SQL 269) → cộng 3 nhóm = tổng shop
const NHOM_LON = { cty: 'Công ty', ch: 'Cửa hàng', khac: 'Tài khoản khác' };
const MAU_NHOM = { cty: MAU.tealDam, ch: MAU.teal, khac: MAU.vang };
const NHOM_CON = { kenh: 'Kênh công ty', doi: 'Đội sale', the: 'Mua qua thẻ sản phẩm', ch: 'Cửa hàng', kol: 'Nhà sáng tạo ngoài', ch_chua: 'ID cửa hàng chưa chọn cửa hàng', khac: 'Khác', chua: 'Chưa phân loại' };
const THU_TU_CON = ['kenh', 'doi', 'the', 'ch', 'kol', 'ch_chua', 'khac', 'chua'];
const tenDoi = (ma) => { const m = /^DOISALE0*(\d+)$/i.exec(ma || ''); return m ? 'Đội Sale ' + m[1].padStart(2, '0') : ''; };
function phanNhom(r) {
  const ma = r.ma_ch || '';
  if (r.nb === '') return ['cty', 'the'];
  if (r.loai === 'KENH') return ['cty', 'kenh'];
  if (r.loai === 'DOISALE' || /^DOISALE/i.test(ma)) return ['cty', 'doi'];
  if (ma && (r.loai === 'CH' || !r.loai)) return ['ch', 'ch'];
  if (r.loai === 'KOL') return ['khac', 'kol'];
  if (r.loai === 'CH') return ['khac', 'ch_chua'];
  if (r.loai === 'KHAC') return ['khac', 'khac'];
  return ['khac', 'chua'];
}
const TRUONG = ['don', 'huy', 'sl', 'dt', 'dt_live', 'dt_video', 'lv_phien', 'lv_dt', 'vd_so', 'vd_dt'];   // NEW - 3.156.4 dt_live / dt_video = theo đơn
const cong = (ds) => Object.fromEntries(TRUONG.map((f) => [f, ds.reduce((s, r) => s + (Number(r[f]) || 0), 0)]));
const coDon = (r) => (r.don || 0) > 0;
function chiaNhom(bc, nb) {
  for (const r of nb) { [r.nl, r.nc] = phanNhom(r); r.thuoc = r.nc === 'doi' ? tenDoi(r.ma_ch) || 'Đội sale' : r.nc === 'the' ? 'Shop' : NHOM_CON[r.nc]; }
  const ds = nb.filter((r) => (r.don || 0) + (r.huy || 0) + (r.lv_phien || 0) + (r.vd_so || 0) > 0 || (r.dt || 0) > 0);
  const chMa = new Map((bc.ch || []).map((c) => [c.ma_ch, c]));
  const m = new Map();
  for (const r of ds.filter((x) => x.nl === 'ch')) {
    if (!m.has(r.ma_ch)) { const c = chMa.get(r.ma_ch) || {}; m.set(r.ma_ch, { ma_ch: r.ma_ch, ten: c.ten || r.ten_ch || r.ma_ch, kv: c.kv || '', ids: [] }); }
    m.get(r.ma_ch).ids.push(r);
  }
  const cuaHang = [...m.values()].map((c) => ({ ...c, ...cong(c.ids), so_id: c.ids.filter(coDon).length || c.ids.length }))
    .sort((a, b) => b.dt - a.dt || b.don - a.don);
  const nhom = {};
  for (const k of Object.keys(NHOM_LON)) {
    const ids = ds.filter((r) => r.nl === k).sort((a, b) => (b.dt || 0) - (a.dt || 0) || (b.lv_dt || 0) - (a.lv_dt || 0));
    const con = THU_TU_CON.map((c) => { const z = ids.filter((r) => r.nc === c); return z.length ? { k: c, ten: NHOM_CON[c], ...cong(z), so_id: z.filter((r) => r.nb && coDon(r)).length } : null; }).filter(Boolean);
    nhom[k] = { k, ten: NHOM_LON[k], ids, con, ...cong(ids), so_id: ids.filter((r) => r.nb && coDon(r)).length };
  }
  return { nhom, cuaHang, tong: { ...cong(ds), so_id: ds.filter((r) => r.nb && coDon(r)).length } };
}

function cotTheo(bc) {
  const m = new Map((bc.theo || []).map((x) => [x.k, x]));
  const phan = (x) => {
    const khac = Math.max((x.sl || 0) - (x.live || 0) - (x.video || 0) - (x.the || 0), 0);
    return [{ v: x.live || 0, mau: TT_KENH.live[1] }, { v: x.video || 0, mau: TT_KENH.video[1] }, { v: x.the || 0, mau: TT_KENH.the[1] }, { v: khac, mau: TT_KENH.khac[1] }];
  };
  if (bc.tu === bc.den) return { cot: Array.from({ length: 24 }, (_, h) => { const x = m.get(String(h).padStart(2, '0')) || {}; return { nhan: String(h), nhanDu: `${h}h`, phan: phan(x), x }; }), kieu: 'giờ' };
  const ds = []; const d = new Date(Number(bc.tu.slice(0, 4)), Number(bc.tu.slice(5, 7)) - 1, Number(bc.tu.slice(8, 10)));
  for (let i = 0, n = Math.min(soNgay(bc.tu, bc.den), 800); i < n; i++) {
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    ds.push({ k, x: m.get(k) || {} }); d.setDate(d.getDate() + 1);
  }
  if (ds.length <= 62) return { cot: ds.map((z) => ({ nhan: z.k.slice(8, 10), nhanDu: ngayVN(z.k), phan: phan(z.x), x: z.x })), kieu: 'ngày' };
  const cot = [];
  for (let i = 0; i < ds.length; i += 7) {
    const g = ds.slice(i, i + 7); const x = {};
    for (const z of g) for (const f of ['don', 'huy', 'sl', 'dt', 'live', 'video', 'the']) x[f] = (x[f] || 0) + (z.x[f] || 0);
    cot.push({ nhan: ngayNgan(g[0].k), nhanDu: `tuần ${ngayNgan(g[0].k)}–${ngayNgan(g[g.length - 1].k)}`, phan: phan(x), x });
  }
  return { cot, kieu: 'tuần' };
}

function cauNhanXet(bc, nb, cn) {
  const t = bc.tong || {};
  const c = [];
  const tongDon = (t.don || 0) + (t.don_huy || 0);
  c.push(`Doanh thu shop ${tien(t.dt)} từ ${so(t.don)} đơn hợp lệ, ${so(t.sl)} sản phẩm` + (t.don ? ` — trung bình ${tien(t.dt / t.don)} / đơn.` : '.') + (t.khach_tra ? ` Khách trả ${tien(t.khach_tra)}, sàn hỗ trợ ${tien(t.san_ho_tro)}.` : ''));
  const kenh = bc.kenh || []; const tongSl = kenh.reduce((s, x) => s + (x.sl || 0), 0);
  if (tongSl > 0) c.push('Theo kênh (số sản phẩm): ' + KTH.map((k) => kenh.find((x) => x.k === k)).filter((x) => x && x.sl > 0).map((x) => `${(TT_KENH[x.k] || TT_KENH.khac)[0]} ${tyTrong(x.sl, tongSl)}`).join(', ') + '.');
  // NEW - 3.156: theo 3 nhóm người bán
  const g = cn.nhom;
  if (cn.tong.dt > 0) c.push('Theo nhóm người bán: ' + ['cty', 'ch', 'khac'].map((k) => `${g[k].ten} ${tien(g[k].dt)} (${tyTrong(g[k].dt, cn.tong.dt)})`).join(', ') + '.');
  const ch = cn.cuaHang;
  if (ch[0]?.dt > 0) {
    const top5 = ch.slice(0, 5).reduce((a, x) => a + x.dt, 0);
    c.push(`Cửa hàng dẫn đầu ${ch[0].ten}: ${tien(ch[0].dt)}, ${so(ch[0].don)} đơn; 5 cửa hàng đầu chiếm ${tyTrong(top5, g.ch.dt)} doanh thu nhóm Cửa hàng (${so(ch.filter(coDon).length)} cửa hàng có đơn).`);
  }

  const ngay = (bc.theo || []).filter((x) => /^\d{4}-/.test(x.k)).sort((a, b) => b.dt - a.dt);
  if (ngay.length > 1) c.push(`Ngày cao nhất ${ngayVN(ngay[0].k)}: ${tien(ngay[0].dt)}, ${so(ngay[0].sl)} sản phẩm; trung bình ${tien(t.dt / soNgay(bc.tu, bc.den))} / ngày.`);
  const sp = [...(bc.sp || [])].sort((a, b) => b.sl - a.sl);
  if (sp.length) {
    const tongSpSl = sp.reduce((s, x) => s + x.sl, 0); const top10 = sp.slice(0, 10).reduce((s, x) => s + x.sl, 0);
    c.push(`Bán chạy nhất ${sp[0].ma} — ${so(sp[0].sl)} sản phẩm, ${tien(sp[0].dt)}; 10 mã đầu chiếm ${tyTrong(top10, tongSpSl)} số sản phẩm trên ${so(sp.length)} mã.`);
  }
  const dm = [...(bc.dm || [])].sort((a, b) => b.dt - a.dt);
  if (dm[0]?.dt > 0) c.push(`Loại hàng lớn nhất ${dm[0].k || 'Chưa rõ'}: ${tyTrong(dm[0].dt, t.dt)} doanh thu.`);
  if (t.don_huy > 0) {
    const huy = [...(bc.huy || [])].sort((a, b) => b.n - a.n);
    const ai = huy.reduce((s, x) => ({ kh: s.kh + (x.kh || 0), ht: s.ht + (x.ht || 0), shop: s.shop + (x.shop || 0) }), { kh: 0, ht: 0, shop: 0 });
    c.push(`Huỷ ${so(t.don_huy)} đơn — ${tyTrong(t.don_huy, tongDon)} tổng đơn (khách ${so(ai.kh)}, hệ thống ${so(ai.ht)}, shop ${so(ai.shop)})` + (huy[0] ? `; lý do nhiều nhất: ${huy[0].k}.` : '.'));
  }
  const tinh = (bc.tinh || []).filter((x) => x.k && x.don > 0);
  if (tinh.length) c.push(`Tỉnh nhiều đơn nhất ${tinh[0].k}: ${tyTrong(tinh[0].don, t.don)} đơn; 5 tỉnh đầu chiếm ${tyTrong(tinh.slice(0, 5).reduce((a, x) => a + x.don, 0), t.don)} đơn.`);
  if (bc.chua_gan > 0) c.push(`Còn ${so(bc.chua_gan)} ID người bán chưa gán cửa hàng — gán ở thẻ "Gán cửa hàng" để số theo cửa hàng đủ.`);
  const live = bc.live_top || [];
  if (live.length) c.push(`${so(live.length)} phiên LIVE có đơn, TikTok thống kê ${tien(live.reduce((s, x) => s + (x.dt || 0), 0))} doanh số gộp; ${so((bc.video_top || []).length)} video có đơn.`);
  return c;
}

export function docTikTok(bc, meta = {}) {
  const t = bc.tong || {};
  const n = soNgay(bc.tu, bc.den);
  const tongDon = (t.don || 0) + (t.don_huy || 0);
  const nb = dsNguoiBan(bc);
  const td = cotTheo(bc);
  const kenh = bc.kenh || [];
  const tongSl = kenh.reduce((s, x) => s + (x.sl || 0), 0);

  const kpi = [
    { ten: 'Doanh thu shop', so: tien(t.dt), phu: `TB ${tbTien(t.dt, n)} / ngày` },
    { ten: 'Đơn hợp lệ', so: so(t.don), phu: `TB ${tbN(t.don, n)} đơn / ngày · ${so(t.so_nb)} người bán` },
    { ten: 'Sản phẩm bán', so: so(t.sl), phu: `TB ${tbN(t.sl, n)} / ngày · đặt ${so(t.sl_dat)} · trả ${so(t.sl_tra)}` },
    { ten: 'Giá trị TB / đơn', so: t.don ? tien(t.dt / t.don) : '—', phu: `${t.don ? (t.sl / t.don).toLocaleString('vi', { maximumFractionDigits: 2 }) : 0} sp / đơn` },
    { ten: 'Khách trả', so: tien(t.khach_tra), phu: `sàn hỗ trợ ${tien(t.san_ho_tro)}` },
    { ten: 'Đơn huỷ', so: so(t.don_huy), phu: `${tyTrong(t.don_huy || 0, tongDon)} tổng đơn · TB ${tbN(t.don_huy, n)}/ngày`, mau: t.don_huy ? MAU.do : undefined },
    { ten: 'Chờ gửi / đang giao', so: so((t.cho_gui || 0) + (t.dang_giao || 0)), phu: `chờ gửi ${so(t.cho_gui)} · đang giao ${so(t.dang_giao)}` },
    { ten: 'Đã giao', so: so(t.da_giao), phu: `${tyTrong(t.da_giao || 0, t.don || 0)} đơn hợp lệ`, mau: MAU.xanh },
  ];

  // ----- kênh + loại hàng + lý do huỷ -----
  const bangKenh = bang([
    { ten: 'Kênh', rong: '*', f: (r) => chamChu((TT_KENH[r.k] || TT_KENH.khac)[1], (TT_KENH[r.k] || TT_KENH.khac)[0]) },
    { ten: 'Đơn', rong: 34, canh: 'right', f: (r) => so(r.don) },
    { ten: 'SL', rong: 34, canh: 'right', f: (r) => so(r.sl) },
    { ten: 'Doanh thu', rong: 44, canh: 'right', f: (r) => ({ text: tien(r.dt), bold: true }) },
    { ten: 'DT / ngày', rong: 42, canh: 'right', f: (r) => ({ text: tbTien(r.dt, n), color: MAU.tealDam }) },   // NEW - 3.157
    { ten: 'Tỷ trọng', rong: 34, canh: 'right', f: (r) => tyTrong(r.sl, tongSl) },
  ], [...kenh].sort((a, b) => KTH.indexOf(a.k) - KTH.indexOf(b.k)));
  const dm = [...(bc.dm || [])].sort((a, b) => b.dt - a.dt);
  const bangDm = bang([
    { ten: 'Loại hàng', rong: '*', f: (r) => cat(r.k || 'Chưa rõ', 24) },
    { ten: 'Đơn', rong: 34, canh: 'right', f: (r) => so(r.don) },
    { ten: 'SL', rong: 34, canh: 'right', f: (r) => so(r.sl) },
    { ten: 'Doanh thu', rong: 44, canh: 'right', f: (r) => ({ text: tien(r.dt), bold: true }) },
    { ten: 'DT / ngày', rong: 42, canh: 'right', f: (r) => ({ text: tbTien(r.dt, n), color: MAU.tealDam }) },   // NEW - 3.157
  ], dm);
  const huy = [...(bc.huy || [])].sort((a, b) => b.n - a.n).slice(0, 10);
  const bangHuy = bang([
    { ten: 'Lý do huỷ', rong: '*', f: (r) => cat(r.k, 30) },
    { ten: 'Đơn', rong: 32, canh: 'right', f: (r) => so(r.n) },
    { ten: 'Khách', rong: 30, canh: 'right', f: (r) => so(r.kh) },
    { ten: 'Hệ thống', rong: 34, canh: 'right', f: (r) => so(r.ht) },
    { ten: 'Shop', rong: 26, canh: 'right', f: (r) => so(r.shop) },
  ], huy, { rongTrong: 'Không có đơn huỷ' });

  // ----- người bán theo 3 nhóm (NEW - 3.156) -----
  const cn = chiaNhom(bc, nb);
  const tongDt = cn.tong.dt;
  const pt = (v) => tyTrong(v || 0, tongDt);
  const hangNhom = [];
  for (const k of ['cty', 'ch', 'khac']) {
    const g = cn.nhom[k];
    hangNhom.push({ ...g, cap: 0, phu: k === 'ch' ? `${so(cn.cuaHang.filter(coDon).length)} cửa hàng` : '' });
    if (k !== 'ch') for (const c of g.con) if (c.don || c.huy || c.dt) hangNhom.push({ ...c, cap: 1, nl: k });
  }
  const bangNhom = bang([
    { ten: 'Nhóm người bán', rong: '*', f: (r) => (r.cap ? { text: r.ten, color: MAU.ink2, margin: [12, 0, 0, 0] }
      : { text: [{ text: '• ', color: MAU_NHOM[r.k], fontSize: 10 }, { text: r.ten, bold: true, fontSize: 8.2 }, r.phu ? { text: '   ' + r.phu, color: MAU.mo, fontSize: 6.6 } : ''] }) },
    { ten: 'ID có đơn', rong: 36, canh: 'right', f: (r) => (r.k === 'the' ? '—' : { text: so(r.so_id), bold: !r.cap }) },
    { ten: 'Đơn', rong: 40, canh: 'right', f: (r) => ({ text: so(r.don), bold: !r.cap }) },
    { ten: 'SL', rong: 40, canh: 'right', f: (r) => ({ text: so(r.sl), bold: !r.cap }) },
    { ten: 'Doanh thu', rong: 64, canh: 'right', f: (r) => ({ text: so(r.dt), bold: !r.cap }) },
    { ten: 'Tỷ trọng', rong: 76, f: (r) => ({ columns: [{ width: 30, text: pt(r.dt), alignment: 'right', bold: !r.cap }, { width: 40, margin: [4, 1, 0, 0], ...thanhO(r.dt, tongDt, r.cap ? '#B9C7D3' : MAU_NHOM[r.k], 40) }] }) },
    { ten: 'Huỷ', rong: 34, canh: 'right', f: (r) => (r.huy ? { text: so(r.huy), color: MAU.do } : '—') },
    { ten: 'DT / ngày', rong: 46, canh: 'right', f: (r) => ({ text: tbTien(r.dt, n), color: MAU.tealDam, bold: !r.cap }) },   // NEW - 3.157
  ], hangNhom, { coChu: 7.4, nenDong: (r) => (r.cap ? null : '#F6F8FA'),
    tong: { cap: 0, ten: 'Tổng cộng', so_id: cn.tong.so_id, don: cn.tong.don, sl: cn.tong.sl, dt: cn.tong.dt, huy: cn.tong.huy, k: 'tong' } });
  bangNhom.table.body[bangNhom.table.body.length - 1][0] = { text: 'Tổng cộng', bold: true };
  bangNhom.table.body[bangNhom.table.body.length - 1][5] = { text: '100%', bold: true, alignment: 'right', margin: [0, 0, 44, 0] };

  // bảng từng ID của 1 nhóm (Công ty / Tài khoản khác)
  const tenId = (r) => (r.nb ? { stack: [{ text: cat(r.ten, 24), bold: true }, r.ten !== '@' + r.nb ? { text: '@' + cat(r.nb, 28), color: MAU.mo, fontSize: 6.2 } : ''] }
    : { stack: [{ text: 'Mua qua thẻ sản phẩm', bold: true }, { text: 'khách mua thẳng trên shop, không qua ID', color: MAU.mo, fontSize: 6.2 }] });
  const cotSo = (max, mau) => [
    { ten: 'Đơn', rong: 34, canh: 'right', f: (r) => so(r.don) },
    { ten: 'SL', rong: 34, canh: 'right', f: (r) => so(r.sl) },
    { ten: 'Doanh thu', rong: W_TIEN, canh: 'right', f: (r) => (r.la_tong ? { text: so(r.dt), bold: true } : { stack: [{ text: so(r.dt), bold: true }, thanhO(r.dt || 0, max, mau, 56)] }) },
    { ten: 'DT / ngày', rong: 44, canh: 'right', f: (r) => ({ text: tbTien(r.dt, n), color: MAU.tealDam }) },   // NEW - 3.157
    { ten: '% shop', rong: 32, canh: 'right', f: (r) => pt(r.dt) },
    { ten: 'Huỷ', rong: 26, canh: 'right', f: (r) => (r.huy ? { text: so(r.huy), color: r.la_tong ? MAU.ink : MAU.do } : '—') },
    // NEW - 3.156.4: doanh thu từ LIVE / từ video tính theo đơn (có ngay trong ngày) thay cho số TikTok tự đếm (video chậm ~2 ngày)
    { ten: 'Từ LIVE', rong: 50, canh: 'right', f: (r) => (r.dt_live ? tien(r.dt_live) : '—') },
    { ten: 'Từ video', rong: 46, canh: 'right', f: (r) => (r.dt_video ? tien(r.dt_video) : '—') },
  ];
  const conLai = (ds, n, ten) => (ds.length > n ? [{ ...cong(ds.slice(n)), la_con: true, ten: `${ten} ${so(ds.length - n)}` }] : []);
  const bangId = (g, n = 30) => {
    const ds = g.ids;
    const max = Math.max(1, ...ds.map((r) => r.dt || 0));
    const dong = [...ds.slice(0, n), ...conLai(ds, n, 'Còn lại')];
    const b = bang([
      { ten: 'Người bán', rong: '*', f: (r) => (r.la_con ? { text: r.ten + ' ID', italics: true, color: MAU.ink2 } : r.la_tong ? { text: r.ten, bold: true } : tenId(r)) },
      { ten: 'Thuộc', rong: 62, f: (r) => (r.la_con || r.la_tong ? { text: '' } : { text: cat(r.thuoc, 22), color: MAU.ink2 }) },
      ...cotSo(max, MAU_NHOM[g.k]),
    ], dong, { coChu: 7.2, rongTrong: 'Không có người bán trong nhóm này', tong: ds.length ? { ...cong(ds), la_tong: true, ten: `Tổng ${g.ten}` } : null });
    return b;
  };
  const bangCty = bangId(cn.nhom.cty);
  const bangKhac = bangId(cn.nhom.khac);

  // cửa hàng: cộng các ID gán cho cùng cửa hàng (mỗi ID chỉ ở 1 cửa hàng)
  const ch = cn.cuaHang;
  const maxCh = Math.max(1, ...ch.map((x) => x.dt));
  const N_CH = 40;
  const bangCh = bang([
    { ten: '#', rong: 14, canh: 'right', f: (r) => (r.la_con || r.la_tong ? { text: '' } : { text: String(ch.indexOf(r) + 1), color: MAU.mo }) },
    { ten: 'Cửa hàng', rong: '*', f: (r) => (r.la_con ? { text: r.ten + ' cửa hàng', italics: true, color: MAU.ink2 } : r.la_tong ? { text: r.ten, bold: true }
      : { stack: [{ text: cat(r.ten, 34), bold: true }, { text: (r.ids.length > 1 ? `${r.ids.length} ID: ` : '') + r.ids.map((x) => '@' + x.nb).join(' · '), color: MAU.mo, fontSize: 6.2 }] }) },
    ...cotSo(maxCh, MAU_NHOM.ch),
  ], [...ch.slice(0, N_CH), ...conLai(ch, N_CH, 'Còn lại')], { coChu: 7.2, rongTrong: 'Chưa gán ID người bán với cửa hàng',
    tong: ch.length ? { ...cong(ch), la_tong: true, ten: `Tổng ${so(ch.filter(coDon).length)} cửa hàng` } : null });

  // ----- sản phẩm -----
  const sp = [...(bc.sp || [])].sort((a, b) => b.sl - a.sl || b.dt - a.dt);
  const tongSpDt = sp.reduce((s, x) => s + x.dt, 0);
  const mix = (r) => {
    const tong = (r.live || 0) + (r.video || 0) + (r.the || 0); const khac = Math.max((r.sl || 0) - tong, 0); const all = tong + khac;
    if (!all) return '—';
    let x = 0; const rect = [];
    for (const [k, v] of [['live', r.live], ['video', r.video], ['the', r.the], ['khac', khac]]) {
      if (!(v > 0)) continue; const w = (v / all) * 50; rect.push({ type: 'rect', x, y: 2, w: Math.max(w - 0.6, 0.4), h: 6, color: TT_KENH[k][1] }); x += w;
    }
    return { canvas: rect };
  };
  const bangSp = bang([
    { ten: '#', rong: 14, canh: 'right', f: (r) => ({ text: String(sp.indexOf(r) + 1), color: MAU.mo }) },
    { ten: 'Sản phẩm', rong: '*', f: (r) => ({ stack: [{ text: r.ma, bold: true }, { text: cat((r.ten || '').replace(/^(ƯU ĐÃI\s*-\s*)/i, ''), 46), color: MAU.mo, fontSize: 6.2 }] }) },
    { ten: 'Loại hàng', rong: 58, f: (r) => ({ text: cat(r.dm || '—', 16), color: MAU.ink2 }) },
    { ten: 'SL', rong: 32, canh: 'right', f: (r) => ({ text: so(r.sl), bold: true }) },
    { ten: 'SL / ngày', rong: 34, canh: 'right', f: (r) => ({ text: tbN(r.sl, n), color: MAU.tealDam }) },   // NEW - 3.157
    { ten: 'Đơn', rong: 32, canh: 'right', f: (r) => so(r.don) },
    { ten: 'Doanh thu', rong: W_TIEN, canh: 'right', f: (r) => so(r.dt) },
    { ten: 'Tỷ trọng', rong: 34, canh: 'right', f: (r) => tyTrong(r.dt, tongSpDt) },
    { ten: 'Huỷ / trả', rong: 36, canh: 'right', f: (r) => ({ text: `${so(r.huy || 0)} / ${so(r.tra || 0)}`, color: r.huy || r.tra ? MAU.do : MAU.mo }) },
    { ten: 'Kênh', rong: 52, f: mix },
  ], sp.slice(0, 40), { coChu: 7.2 });

  // ----- LIVE + video -----
  const live = (bc.live_top || []).slice(0, 15);
  const bangLive = bang([
    { ten: 'Người bán', rong: 96, f: (r) => ({ stack: [{ text: cat(tenNb(bc, r.username), 22), bold: true }, { text: cat(r.ten_ch || 'chưa gán cửa hàng', 26), color: MAU.mo, fontSize: 6.2 }] }) },
    { ten: 'Phiên LIVE', rong: '*', f: (r) => ({ stack: [{ text: cat(r.tieu_de || '—', 52) }, { text: r.bat_dau ? new Date(r.bat_dau).toLocaleString('vi', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '', color: MAU.mo, fontSize: 6.2 }] }) },
    { ten: 'Đơn', rong: 32, canh: 'right', f: (r) => so(r.don) },
    { ten: 'SL', rong: 32, canh: 'right', f: (r) => so(r.sl) },
    { ten: 'Doanh số', rong: 54, canh: 'right', f: (r) => ({ text: tien(r.dt), bold: true }) },
    { ten: 'Người xem', rong: 44, canh: 'right', f: (r) => so(r.xem) },
  ], live, { coChu: 7.2, rongTrong: 'Chưa có phiên LIVE có đơn trong khoảng này' });
  const video = (bc.video_top || []).slice(0, 12);
  const bangVideo = bang([
    { ten: 'Người bán', rong: 96, f: (r) => ({ stack: [{ text: cat(tenNb(bc, r.username), 22), bold: true }, { text: cat(r.ten_ch || 'chưa gán cửa hàng', 26), color: MAU.mo, fontSize: 6.2 }] }) },
    { ten: 'Video', rong: '*', f: (r) => ({ stack: [{ text: cat(r.tieu_de || '—', 52) }, { text: cat((r.san_pham || [])[0]?.name || '', 56), color: MAU.mo, fontSize: 6.2 }] }) },
    { ten: 'Đơn', rong: 32, canh: 'right', f: (r) => so(r.don) },
    { ten: 'SL', rong: 32, canh: 'right', f: (r) => so(r.sl) },
    { ten: 'Doanh số', rong: 54, canh: 'right', f: (r) => ({ text: tien(r.dt), bold: true }) },
    { ten: 'Lượt xem', rong: 44, canh: 'right', f: (r) => so(r.xem) },
  ], video, { coChu: 7.2, rongTrong: 'Chưa có video có đơn trong khoảng này' });

  // ----- tỉnh + vận chuyển / thanh toán (NEW - 3.156: 34 tỉnh mới, có tỷ lệ + dòng tổng) -----
  const tinh = [...(bc.tinh || [])].filter((x) => x.don > 0).sort((a, b) => (!a.k) - (!b.k) || b.don - a.don);
  const tTinh = { don: tinh.reduce((a, x) => a + x.don, 0), dt: tinh.reduce((a, x) => a + x.dt, 0) };
  const maxTinh = Math.max(1, ...tinh.map((x) => x.dt));
  const bangTinh = bang([
    { ten: '#', rong: 14, canh: 'right', f: (r) => (r.la_tong || !r.k ? { text: '' } : { text: String(tinh.indexOf(r) + 1), color: MAU.mo }) },
    { ten: 'Tỉnh / thành', rong: '*', f: (r) => (r.la_tong ? { text: r.ten, bold: true } : r.k ? { text: r.k, bold: tinh.indexOf(r) < 5 } : { text: 'Chưa có địa chỉ', color: MAU.mo, italics: true }) },
    { ten: 'Đơn', rong: 40, canh: 'right', f: (r) => so(r.don) },
    { ten: 'Đơn / ngày', rong: 40, canh: 'right', f: (r) => ({ text: tbN(r.don, n), color: MAU.tealDam }) },   // NEW - 3.157
    { ten: '% đơn', rong: 36, canh: 'right', f: (r) => tyTrong(r.don, tTinh.don) },
    { ten: 'Doanh thu', rong: W_TIEN, canh: 'right', f: (r) => so(r.dt) },
    { ten: '% doanh thu', rong: 44, canh: 'right', f: (r) => ({ text: tyTrong(r.dt, tTinh.dt), bold: !r.la_tong }) },
    { ten: 'TB / đơn', rong: 50, canh: 'right', f: (r) => (r.don ? tien(r.dt / r.don) : '—') },
    { ten: '', rong: 66, f: (r) => (r.la_tong ? { text: '' } : thanhO(r.dt, maxTinh, MAU.ink, 64)) },
  ], tinh, { coChu: 7.2, tong: { ...tTinh, la_tong: true, ten: `Tổng ${so(tinh.filter((x) => x.k).length)} tỉnh / thành` } });
  const bangTt = (ds, ten) => {
    const d = ds.filter((x) => x.don > 0); const tg = d.reduce((a, x) => a + x.don, 0);
    return bang([
      { ten, rong: '*', f: (r) => (r.la_tong ? { text: 'Tổng cộng', bold: true } : cat(r.k || 'Chưa rõ', 30)) },
      { ten: 'Đơn', rong: 40, canh: 'right', f: (r) => so(r.don) },
      { ten: 'Tỷ lệ', rong: 36, canh: 'right', f: (r) => tyTrong(r.don, tg) },
    ], d, { tong: d.length ? { don: tg, la_tong: true } : null });
  };
  const bangVc = bangTt(bc.dvvc || [], 'Đơn vị vận chuyển');
  const bangTtoan = bangTt(bc.thanh_toan || [], 'Hình thức thanh toán');

  const noiDung = [
    dauTrang({ tieuDe: 'Báo cáo TikTok Shop', ky: `${ngayVN(bc.tu)} – ${ngayVN(bc.den)} (${n} ngày)`, loc: meta.loc }),
    luoiKpi(kpi),
    diemChinh(cauNhanXet(bc, nb, cn).slice(0, 10)),
    muc(`Sản phẩm bán theo ${td.kieu}`, 'chia theo kênh: LIVE · Video · Thẻ sản phẩm'),
    bieuDoCot(td.cot, { cao: 115, dinhDang: (v) => so(v) + ' sp', chuThich: KTH.map((k) => ({ ten: TT_KENH[k][0], mau: TT_KENH[k][1] })) }),
    khoi({ text: 'Tỷ trọng sản phẩm bán cả kỳ', fontSize: 7.5, bold: true, italics: true, color: MAU.ink2, margin: [0, 12, 0, 4] }, thanhTyTrong(KTH.map((k) => kenh.find((x) => x.k === k)).filter(Boolean).map((x) => ({ ten: TT_KENH[x.k][0], v: x.sl, mau: TT_KENH[x.k][1] })))),

    // NEW - 3.156: 3 nhóm người bán — mỗi ID ở đúng 1 nhóm, cộng 3 nhóm = tổng shop
    muc('Người bán theo nhóm', `${so(cn.tong.so_id)} ID có đơn · cộng 3 nhóm = tổng doanh thu shop`, { truocTrang: true }),
    khoi(thanhTyTrong(['cty', 'ch', 'khac'].map((k) => ({ ten: NHOM_LON[k], v: cn.nhom[k].dt, mau: MAU_NHOM[k] }))), { text: '', margin: [0, 0, 0, 6] }, bangNhom),
    { text: 'Công ty = kênh công ty, đội sale và khách mua thẳng qua thẻ sản phẩm. Cửa hàng = các ID đã gán cửa hàng. Tài khoản khác = nhà sáng tạo ngoài và ID chưa phân loại. Mỗi đơn chỉ tính cho một ID.', fontSize: 6.8, color: MAU.mo, margin: [0, 4, 0, 0] },
    muc('Công ty', `${so(cn.nhom.cty.so_id)} ID có đơn · ${pt(cn.nhom.cty.dt)} doanh thu shop · Từ LIVE / Từ video = doanh thu theo đơn`),
    bangCty,
    muc('Cửa hàng', `${ch.length > N_CH ? `${N_CH} / ${so(ch.length)} cửa hàng doanh thu cao nhất` : `${so(ch.length)} cửa hàng`} · ${pt(cn.nhom.ch.dt)} doanh thu shop · cửa hàng nhiều ID thì cộng các ID lại`, { truocTrang: true }),
    bangCh,
    muc('Tài khoản khác', `${so(cn.nhom.khac.so_id)} ID có đơn · ${pt(cn.nhom.khac.dt)} doanh thu shop`),
    bangKhac,
    muc('Sản phẩm bán chạy', sp.length > 40 ? `40 / ${so(sp.length)} mã nhiều sản phẩm nhất` : `${so(sp.length)} mã`, { truocTrang: true }),
    bangSp,
    chuThichKenh(),
    haiCot([muc('Kênh bán', null, { rong: NUA }), bangKenh, muc('Loại hàng', null, { rong: NUA }), bangDm], [muc('Lý do huỷ', null, { rong: NUA }), bangHuy]),
    muc('Phiên LIVE có đơn', `${live.length < (bc.live_top || []).length ? `15 / ${so((bc.live_top || []).length)} phiên doanh số cao nhất · ` : ''}TikTok thống kê, chốt chậm 1–2 ngày`),
    bangLive,
    muc('Video có đơn', `${video.length < (bc.video_top || []).length ? `12 / ${so((bc.video_top || []).length)} video doanh số cao nhất · ` : ''}TikTok thống kê`),
    bangVideo,
    muc('Tỉnh / thành', `${so(tinh.filter((x) => x.k).length)} / 34 tỉnh thành có đơn · gộp tên tỉnh cũ về tỉnh mới (sáp nhập 2025)`, { truocTrang: true }),
    bangTinh,
    haiCot([muc('Vận chuyển', null, { rong: NUA }), bangVc], [muc('Thanh toán', null, { rong: NUA }), bangTtoan]),
    { margin: [0, 18, 0, 0], unbreakable: true, stack: [
      { text: 'Cách tính', bold: true, fontSize: 8, color: MAU.ink2, margin: [0, 0, 0, 3] },
      { ul: [
        'Doanh thu shop = giá niêm yết − shop giảm, chỉ tính đơn hợp lệ (không huỷ). Khách trả = số tiền khách thanh toán (đã trừ cả sàn hỗ trợ).',
        `Trung bình / ngày (cột "… / ngày", dòng "TB") = tổng của kỳ ÷ ${n} ngày (tính cả ngày đầu và ngày cuối).`,
        'Đơn của người bán = đơn khách mua trực tiếp từ LIVE / video của ID đó (đúng cách Seller Center ghi nhận); đơn mua qua thẻ sản phẩm tính "Mua qua thẻ sản phẩm" (nhóm Công ty). Đơn có hàng của 2 ID tính cho ID có doanh thu lớn hơn; doanh thu, SL vẫn chia theo từng dòng hàng.',
        'Tỉnh / thành theo địa chỉ nhận hàng, gộp về 34 tỉnh thành mới; đơn chưa thanh toán chưa có địa chỉ ghi "Chưa có địa chỉ".',
        'Từ LIVE / Từ video = phần doanh thu theo đơn khách mua trực tiếp trong LIVE / từ video của ID (có ngay trong ngày). Riêng mục Phiên LIVE / Video có đơn là số TikTok tự đếm: tiền khách trả, có cả đơn chưa thanh toán hoặc sẽ huỷ, video TikTok trả chậm ~2 ngày — không cộng với doanh thu đơn.',
        `Dữ liệu đơn trong app: ${so(bc.kho?.tong_don)} đơn từ ${ngayVN(bc.kho?.tu)} đến ${ngayVN(bc.kho?.den)}.`,
      ], fontSize: 6.8, color: MAU.mo },
    ] },
  ];
  return taiLieu({ tieuDeTrang: `Báo cáo TikTok Shop · ${ngayVN(bc.tu)} – ${ngayVN(bc.den)}`, nguoi: meta.nguoi, luc: meta.luc, noiDung });
}
function chuThichKenh() {
  return { margin: [0, 4, 0, 0], fontSize: 6.8, color: MAU.mo, text: 'Cột Kênh: tỷ lệ sản phẩm bán qua LIVE (hồng) · Video (xanh ngọc) · Thẻ sản phẩm (vàng) · không qua người bán (xám).' };
}

/* ================= DỮ LIỆU EXCEL ================= */
export const COT_DONG_TIKTOK = [
  { ten: 'Ngày giờ đặt', w: 16 }, { ten: 'Mã đơn', w: 21 }, { ten: 'Trạng thái', w: 14 }, { ten: 'Kênh', w: 14 }, { ten: 'ID người bán', w: 22 },
  { ten: 'Tên người bán', w: 22 }, { ten: 'Loại người bán', w: 16 }, { ten: 'Mã cửa hàng', w: 12 }, { ten: 'Cửa hàng', w: 24 }, { ten: 'SKU người bán', w: 18 },
  { ten: 'Mã mẹ', w: 14 }, { ten: 'Tên sản phẩm', w: 48 }, { ten: 'Phân loại', w: 28 }, { ten: 'Loại hàng', w: 16 }, { ten: 'SL đặt', w: 7, kieu: 'so' },
  { ten: 'SL trả', w: 7, kieu: 'so' }, { ten: 'SL bán', w: 7, kieu: 'so' }, { ten: 'Giá trước giảm', w: 13, kieu: 'tien' }, { ten: 'Shop giảm', w: 11, kieu: 'tien' },
  { ten: 'Sàn giảm', w: 11, kieu: 'tien' }, { ten: 'Khách trả', w: 12, kieu: 'tien' }, { ten: 'Doanh thu shop (tính)', w: 15, kieu: 'tien' },
  { ten: 'Tỉnh / thành', w: 16 }, { ten: 'Đơn vị vận chuyển', w: 18 }, { ten: 'Thanh toán', w: 18 }, { ten: 'Lý do huỷ', w: 26 }, { ten: 'Huỷ bởi', w: 10 },
];

export function sheetsTikTok(bc, dong, meta = {}) {
  const t = bc.tong || {};
  const nX = soNgay(bc.tu, bc.den);   // NEW - 3.157 số ngày → cột TB / ngày
  const ghi = `Kỳ ${ngayVN(bc.tu)} – ${ngayVN(bc.den)} (${nX} ngày — TB / ngày = tổng ÷ ${nX}) · ${meta.loc || 'không lọc'} · xuất lúc ${meta.luc || ''}`;
  const nb = dsNguoiBan(bc);
  const cn = chiaNhom(bc, nb);   // NEW - 3.156
  const tdt = cn.tong.dt || 0;
  const tl = (v, tong) => (tong > 0 ? (v || 0) / tong : null);
  const hangNhom = ['cty', 'ch', 'khac'].flatMap((k) => [{ ...cn.nhom[k], chi: '' }, ...(k === 'ch' ? [] : cn.nhom[k].con.filter((c) => c.don || c.huy || c.dt).map((c) => ({ ...c, ten: NHOM_LON[k], chi: c.ten })))]);
  const tinh = [...(bc.tinh || [])].filter((x) => x.don > 0);
  const tTinh = { don: tinh.reduce((a, x) => a + x.don, 0), dt: tinh.reduce((a, x) => a + x.dt, 0) };
  const sp = [...(bc.sp || [])].sort((a, b) => b.sl - a.sl);
  const sku = sp.flatMap((r) => (r.co || []).map((c) => ({ ma: r.ma, ten: r.ten, dm: r.dm, ...c })));
  const chiSo = [
    ['Doanh thu shop (đơn hợp lệ)', t.dt], ['Đơn hợp lệ', t.don], ['Sản phẩm bán (sau trả)', t.sl], ['Sản phẩm đặt', t.sl_dat], ['Sản phẩm trả', t.sl_tra],
    ['Khách trả', t.khach_tra], ['Sàn hỗ trợ', t.san_ho_tro], ['Giá trị TB / đơn', t.don ? Math.round(t.dt / t.don) : null], ['Đơn huỷ', t.don_huy],
    ['Chờ gửi hàng', t.cho_gui], ['Đang giao', t.dang_giao], ['Đã giao', t.da_giao], ['Số người bán có đơn', t.so_nb], ['Số mã có bán', t.so_sp],
  ];
  return [
    { ten: 'Tổng quan', tieuDe: 'BÁO CÁO TIKTOK SHOP — NÓN SƠN', ghiChu: ghi, cot: [{ ten: 'Chỉ số', w: 30 }, { ten: 'Giá trị', w: 18, kieu: 'tien' }, { ten: 'TB / ngày', w: 14, kieu: 'thap' }],
      dong: chiSo.map(([a, v]) => [a, v ?? null, /TB \/ đơn|Số người|Số mã/.test(a) ? null : tb1(v, nX)]) },
    { ten: 'Theo ngày', ghiChu: ghi, cot: [{ ten: bc.tu === bc.den ? 'Giờ' : 'Ngày', k: 'k', w: 12 }, { ten: 'Đơn', k: 'don', kieu: 'so' }, { ten: 'Huỷ', k: 'huy', kieu: 'so' },
      { ten: 'SL', k: 'sl', kieu: 'so' }, { ten: 'Doanh thu', k: 'dt', w: 15, kieu: 'tien' }, { ten: 'SL LIVE', k: 'live', kieu: 'so' }, { ten: 'SL Video', k: 'video', kieu: 'so' }, { ten: 'SL Thẻ SP', k: 'the', kieu: 'so' }],
      dong: [...(bc.theo || [])].sort((a, b) => (a.k < b.k ? -1 : 1)) },
    { ten: 'Kênh', ghiChu: ghi, cot: [{ ten: 'Kênh', f: (r) => (TT_KENH[r.k] || TT_KENH.khac)[0], w: 20 }, { ten: 'Đơn', k: 'don', kieu: 'so' }, { ten: 'Đơn / ngày', f: (r) => tb1(r.don, nX), kieu: 'thap' }, { ten: 'SL', k: 'sl', kieu: 'so' }, { ten: 'SL / ngày', f: (r) => tb1(r.sl, nX), kieu: 'thap' }, { ten: 'Doanh thu', k: 'dt', w: 15, kieu: 'tien' }, { ten: 'DT / ngày', f: (r) => tb1(r.dt, nX), w: 14, kieu: 'tien' }], dong: bc.kenh || [] },
    { ten: 'Theo nhóm', ghiChu: ghi + ' · mỗi ID thuộc đúng 1 nhóm, mỗi đơn tính cho 1 ID → cộng các nhóm = tổng shop',
      cot: [{ ten: 'Nhóm', k: 'ten', w: 18 }, { ten: 'Chi tiết', k: 'chi', w: 30 }, { ten: 'ID có đơn', f: (r) => (r.k === 'the' ? null : r.so_id), kieu: 'so' }, { ten: 'Đơn', k: 'don', kieu: 'so' },
        { ten: 'SL', k: 'sl', kieu: 'so' }, { ten: 'Doanh thu', k: 'dt', w: 16, kieu: 'tien' }, { ten: 'DT / ngày', f: (r) => tb1(r.dt, nX), w: 14, kieu: 'tien' }, { ten: 'Tỷ trọng', f: (r) => tl(r.dt, tdt), kieu: 'pt' }, { ten: 'Đơn huỷ', k: 'huy', kieu: 'so' },
        { ten: 'Doanh thu từ LIVE', k: 'dt_live', w: 15, kieu: 'tien' }, { ten: 'Doanh thu từ video', k: 'dt_video', w: 15, kieu: 'tien' }],
      dong: hangNhom, tong: { ten: 'Tổng cộng', chi: '', ...cn.tong } },
    { ten: 'Người bán', ghiChu: ghi + ' · LIVE / Video = TikTok thống kê', cot: [{ ten: 'Nhóm', f: (r) => NHOM_LON[r.nl] || '', w: 15 }, { ten: 'Thuộc', k: 'thuoc', w: 22 },
      { ten: 'Mã cửa hàng', k: 'ma_ch', w: 12 }, { ten: 'Cửa hàng', k: 'ten_ch', w: 24 }, { ten: 'ID người bán', f: (r) => r.nb || '(mua qua thẻ sản phẩm)', w: 24 },
      { ten: 'Tên gọi', k: 'ten', w: 22 }, { ten: 'Loại', f: (r) => TT_LOAI[r.loai] || r.loai || '', w: 16 }, { ten: 'Đơn', k: 'don', kieu: 'so' }, { ten: 'SL', k: 'sl', kieu: 'so' },
      { ten: 'Doanh thu', k: 'dt', w: 15, kieu: 'tien' }, { ten: 'DT / ngày', f: (r) => tb1(r.dt, nX), w: 14, kieu: 'tien' }, { ten: 'Doanh thu từ LIVE', k: 'dt_live', w: 15, kieu: 'tien' }, { ten: 'Doanh thu từ video', k: 'dt_video', w: 15, kieu: 'tien' },
      { ten: 'Đơn huỷ', k: 'huy', kieu: 'so' }, { ten: 'SL qua LIVE', k: 'live', kieu: 'so' }, { ten: 'SL qua Video', k: 'video', kieu: 'so' },
      { ten: 'Phiên LIVE', k: 'lv_phien', kieu: 'so' }, { ten: 'LIVE · đơn', k: 'lv_don', kieu: 'so' }, { ten: 'LIVE · SL', k: 'lv_sl', kieu: 'so' }, { ten: 'LIVE · doanh số', k: 'lv_dt', w: 15, kieu: 'tien' },
      { ten: 'LIVE · người xem', k: 'lv_xem', w: 14, kieu: 'so' }, { ten: 'Số video', k: 'vd_so', kieu: 'so' }, { ten: 'Video · đơn', k: 'vd_don', kieu: 'so' }, { ten: 'Video · SL', k: 'vd_sl', kieu: 'so' },
      { ten: 'Video · doanh số', k: 'vd_dt', w: 15, kieu: 'tien' }, { ten: 'Video · lượt xem', k: 'vd_xem', w: 14, kieu: 'so' }], dong: nb },
    { ten: 'Cửa hàng', ghiChu: ghi + ' · cộng các ID đã gán cho từng cửa hàng (không gồm đội sale, kênh công ty)',
      cot: [{ ten: 'Mã cửa hàng', k: 'ma_ch', w: 12 }, { ten: 'Cửa hàng', k: 'ten', w: 30 }, { ten: 'Khu vực', k: 'kv', w: 20 }, { ten: 'Số ID', f: (r) => (r.ids ? r.ids.length : null), kieu: 'so' },
        { ten: 'ID người bán', f: (r) => (r.ids ? r.ids.map((x) => x.nb).join(', ') : ''), w: 34 }, { ten: 'Đơn', k: 'don', kieu: 'so' }, { ten: 'SL', k: 'sl', kieu: 'so' },
        { ten: 'Doanh thu', k: 'dt', w: 15, kieu: 'tien' }, { ten: 'DT / ngày', f: (r) => tb1(r.dt, nX), w: 14, kieu: 'tien' }, { ten: '% doanh thu shop', f: (r) => tl(r.dt, tdt), w: 14, kieu: 'pt' }, { ten: 'Đơn huỷ', k: 'huy', kieu: 'so' },
        { ten: 'Doanh thu từ LIVE', k: 'dt_live', w: 15, kieu: 'tien' }, { ten: 'Doanh thu từ video', k: 'dt_video', w: 15, kieu: 'tien' }],
      dong: cn.cuaHang, tong: { ma_ch: 'Tổng', ten: `${cn.cuaHang.filter(coDon).length} cửa hàng có đơn`, ...cong(cn.cuaHang) } },
    { ten: 'Sản phẩm', ghiChu: ghi + ' · gộp theo mã mẹ', cot: [{ ten: 'Mã mẹ', k: 'ma', w: 16 }, { ten: 'Tên sản phẩm', k: 'ten', w: 48 }, { ten: 'Loại hàng', k: 'dm', w: 16 },
      { ten: 'SL bán', k: 'sl', kieu: 'so' }, { ten: 'SL / ngày', f: (r) => tb1(r.sl, nX), kieu: 'thap' }, { ten: 'SL đặt', k: 'dat', kieu: 'so' }, { ten: 'Đơn', k: 'don', kieu: 'so' }, { ten: 'Doanh thu', k: 'dt', w: 15, kieu: 'tien' }, { ten: 'DT / ngày', f: (r) => tb1(r.dt, nX), w: 14, kieu: 'tien' },
      { ten: 'Đơn huỷ', k: 'huy', kieu: 'so' }, { ten: 'SL trả', k: 'tra', kieu: 'so' }, { ten: 'SL LIVE', k: 'live', kieu: 'so' }, { ten: 'SL Video', k: 'video', kieu: 'so' },
      { ten: 'SL Thẻ SP', k: 'the', kieu: 'so' }, { ten: 'Số người bán', k: 'so_nb', kieu: 'so' }], dong: sp },
    { ten: 'Phân loại (SKU)', ghiChu: ghi, cot: [{ ten: 'Mã mẹ', k: 'ma', w: 16 }, { ten: 'SKU', k: 'sku', w: 20 }, { ten: 'Phân loại', k: 'pl', w: 32 }, { ten: 'Loại hàng', k: 'dm', w: 16 },
      { ten: 'SL bán', k: 'sl', kieu: 'so' }, { ten: 'SL / ngày', f: (r) => tb1(r.sl, nX), kieu: 'thap' }, { ten: 'SL đặt', k: 'dat', kieu: 'so' }], dong: sku },
    { ten: 'Loại hàng', ghiChu: ghi, cot: [{ ten: 'Loại hàng', f: (r) => r.k || 'Chưa rõ', w: 22 }, { ten: 'Đơn', k: 'don', kieu: 'so' }, { ten: 'SL', k: 'sl', kieu: 'so' }, { ten: 'SL / ngày', f: (r) => tb1(r.sl, nX), kieu: 'thap' }, { ten: 'Doanh thu', k: 'dt', w: 15, kieu: 'tien' }, { ten: 'DT / ngày', f: (r) => tb1(r.dt, nX), w: 14, kieu: 'tien' }], dong: bc.dm || [] },
    { ten: 'Lý do huỷ', ghiChu: ghi, cot: [{ ten: 'Lý do', k: 'k', w: 36 }, { ten: 'Đơn', k: 'n', kieu: 'so' }, { ten: 'Khách huỷ', k: 'kh', kieu: 'so' }, { ten: 'Hệ thống huỷ', k: 'ht', kieu: 'so' }, { ten: 'Shop huỷ', k: 'shop', kieu: 'so' }], dong: bc.huy || [] },
    { ten: 'Tỉnh thành', ghiChu: ghi + ' · 34 tỉnh thành mới (tên tỉnh cũ đã gộp về tỉnh mới)',
      cot: [{ ten: 'Tỉnh / thành', f: (r) => r.ten || r.k || 'Chưa có địa chỉ', w: 22 }, { ten: 'Đơn', k: 'don', kieu: 'so' }, { ten: 'Đơn / ngày', f: (r) => tb1(r.don, nX), kieu: 'thap' }, { ten: '% đơn', f: (r) => tl(r.don, tTinh.don), kieu: 'pt' },
        { ten: 'Doanh thu', k: 'dt', w: 16, kieu: 'tien' }, { ten: 'DT / ngày', f: (r) => tb1(r.dt, nX), w: 14, kieu: 'tien' }, { ten: '% doanh thu', f: (r) => tl(r.dt, tTinh.dt), kieu: 'pt' }, { ten: 'TB / đơn', f: (r) => (r.don ? Math.round(r.dt / r.don) : null), w: 12, kieu: 'tien' }],
      dong: tinh, tong: { ten: 'Tổng cộng', ...tTinh } },
    { ten: 'Phiên LIVE', ghiChu: ghi + ' · TikTok thống kê', cot: [{ ten: 'ID người bán', k: 'username', w: 22 }, { ten: 'Tên gọi', f: (r) => bc.ten_nb?.[r.username] || '', w: 20 }, { ten: 'Cửa hàng', k: 'ten_ch', w: 24 },
      { ten: 'Tiêu đề', k: 'tieu_de', w: 40 }, { ten: 'Bắt đầu', f: (r) => (r.bat_dau ? String(r.bat_dau).slice(0, 16).replace('T', ' ') : ''), w: 16 }, { ten: 'Kết thúc', f: (r) => (r.ket_thuc ? String(r.ket_thuc).slice(0, 16).replace('T', ' ') : ''), w: 16 },
      { ten: 'Số mã', k: 'so_sp', kieu: 'so' }, { ten: 'Đơn', k: 'don', kieu: 'so' }, { ten: 'SL', k: 'sl', kieu: 'so' }, { ten: 'Doanh số', k: 'dt', w: 15, kieu: 'tien' },
      { ten: 'Khách', k: 'khach', kieu: 'so' }, { ten: 'Người xem', k: 'xem', kieu: 'so' }], dong: bc.live_top || [] },
    { ten: 'Video', ghiChu: ghi + ' · TikTok thống kê', cot: [{ ten: 'ID người bán', k: 'username', w: 22 }, { ten: 'Tên gọi', f: (r) => bc.ten_nb?.[r.username] || '', w: 20 }, { ten: 'Cửa hàng', k: 'ten_ch', w: 24 },
      { ten: 'Tiêu đề', k: 'tieu_de', w: 40 }, { ten: 'Đăng lúc', f: (r) => (r.dang_luc ? String(r.dang_luc).slice(0, 16).replace('T', ' ') : ''), w: 16 },
      { ten: 'Sản phẩm', f: (r) => (r.san_pham || []).map((x) => x.name).join(' · '), w: 50 }, { ten: 'Đơn', k: 'don', kieu: 'so' }, { ten: 'SL', k: 'sl', kieu: 'so' },
      { ten: 'Doanh số', k: 'dt', w: 15, kieu: 'tien' }, { ten: 'Lượt xem', k: 'xem', kieu: 'so' }], dong: bc.video_top || [] },
    { ten: 'Chi tiết dòng hàng', ghiChu: ghi + ' · 1 dòng / SKU trong đơn · gồm cả đơn huỷ (doanh thu tính = 0)', cot: COT_DONG_TIKTOK,
      dong: dong.map((r) => { const x = [...r]; x[2] = TT_TRANG_THAI[x[2]] || x[2]; x[3] = (TT_KENH[x[3]] || [x[3]])[0]; x[6] = TT_LOAI[x[6]] || x[6]; return x; }) },
  ];
}
