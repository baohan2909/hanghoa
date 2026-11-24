// NEW - 3.154: BÁO CÁO + DỮ LIỆU XUẤT cho màn TikTok Shop. Dựng từ đúng số liệu đang xem (fn_tt_bao_cao) + dòng chi tiết (fn_tt_xuat).
import { tien, ngayVN, ngayNgan, TT_KENH, TT_LOAI, TT_TRANG_THAI } from './hangSo.js';
import { MAU, NUA, so, tyTrong, khoi, muc, dauTrang, luoiKpi, diemChinh, thanhTyTrong, bieuDoCot, thanhO, bang, chamChu, haiCot, taiLieu } from './pdf.js';

const W_TIEN = 64;
const cat = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');
const soNgay = (tu, den) => Math.round((new Date(den + 'T00:00:00') - new Date(tu + 'T00:00:00')) / 864e5) + 1;
const tenNb = (bc, h) => (h ? (bc.ten_nb?.[h] || '@' + h) : 'Không qua người bán');
const NHOM_LOAI = { KENH: 'Kênh công ty', DOISALE: 'Đội sale', KOL: 'Nhà sáng tạo ngoài', KHAC: 'Khác', CH: 'Cửa hàng — chưa chọn' };
const nhomCh = (r) => (r.nb === '' ? 'Thẻ sản phẩm' : r.ten_ch || (r.loai && NHOM_LOAI[r.loai]) || 'Chưa gán');
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
    r.nhom = nhomCh(r); r.ten = tenNb(bc, r.nb);
  }
  return [...m.values()].sort((a, b) => (b.dt || 0) - (a.dt || 0) || (b.lv_dt || 0) - (a.lv_dt || 0));
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

function cauNhanXet(bc, nb) {
  const t = bc.tong || {};
  const c = [];
  const tongDon = (t.don || 0) + (t.don_huy || 0);
  c.push(`Doanh thu shop ${tien(t.dt)} từ ${so(t.don)} đơn hợp lệ, ${so(t.sl)} sản phẩm` + (t.don ? ` — trung bình ${tien(t.dt / t.don)} / đơn.` : '.') + (t.khach_tra ? ` Khách trả ${tien(t.khach_tra)}, sàn hỗ trợ ${tien(t.san_ho_tro)}.` : ''));
  const kenh = bc.kenh || []; const tongSl = kenh.reduce((s, x) => s + (x.sl || 0), 0);
  if (tongSl > 0) c.push('Theo kênh (số sản phẩm): ' + KTH.map((k) => kenh.find((x) => x.k === k)).filter((x) => x && x.sl > 0).map((x) => `${(TT_KENH[x.k] || TT_KENH.khac)[0]} ${tyTrong(x.sl, tongSl)}`).join(', ') + '.');
  const coDon = nb.filter((r) => r.nb && r.dt > 0);
  if (coDon.length) {
    const top5 = coDon.slice(0, 5).reduce((s, r) => s + r.dt, 0);
    c.push(`Người bán dẫn đầu ${coDon[0].ten}${coDon[0].ten_ch ? ' (' + coDon[0].ten_ch + ')' : ''}: ${tien(coDon[0].dt)}, ${so(coDon[0].don)} đơn; 5 ID đầu chiếm ${tyTrong(top5, t.dt)} doanh thu trên ${so(coDon.length)} ID có đơn.`);
  }
  const ch = [...(bc.ch || [])].sort((a, b) => b.dt - a.dt);
  if (ch[0]?.dt > 0) c.push(`Cửa hàng dẫn đầu ${ch[0].ten || ch[0].ma_ch}: ${tien(ch[0].dt)} (${so(ch[0].don)} đơn, ${so(ch[0].so_nb)} ID).`);
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
  const live = bc.live_top || [];
  if (live.length) c.push(`${so(live.length)} phiên LIVE có đơn, TikTok thống kê ${tien(live.reduce((s, x) => s + (x.dt || 0), 0))} doanh số gộp; ${so((bc.video_top || []).length)} video có đơn.`);
  if (bc.chua_gan > 0) c.push(`Còn ${so(bc.chua_gan)} ID người bán chưa gán cửa hàng — gán ở thẻ "Gán cửa hàng" để số theo cửa hàng đủ.`);
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
    { ten: 'Doanh thu shop', so: tien(t.dt), phu: 'giá niêm yết − shop giảm' },
    { ten: 'Đơn hợp lệ', so: so(t.don), phu: `${so(t.so_nb)} người bán · ${so(t.so_sp)} mã` },
    { ten: 'Sản phẩm bán', so: so(t.sl), phu: `đặt ${so(t.sl_dat)} · trả ${so(t.sl_tra)}` },
    { ten: 'Giá trị TB / đơn', so: t.don ? tien(t.dt / t.don) : '—', phu: `${t.don ? (t.sl / t.don).toLocaleString('vi', { maximumFractionDigits: 2 }) : 0} sp / đơn` },
    { ten: 'Khách trả', so: tien(t.khach_tra), phu: `sàn hỗ trợ ${tien(t.san_ho_tro)}` },
    { ten: 'Đơn huỷ', so: so(t.don_huy), phu: `${tyTrong(t.don_huy || 0, tongDon)} tổng đơn`, mau: t.don_huy ? MAU.do : undefined },
    { ten: 'Chờ gửi / đang giao', so: so((t.cho_gui || 0) + (t.dang_giao || 0)), phu: `chờ gửi ${so(t.cho_gui)} · đang giao ${so(t.dang_giao)}` },
    { ten: 'Đã giao', so: so(t.da_giao), phu: `${tyTrong(t.da_giao || 0, t.don || 0)} đơn hợp lệ`, mau: MAU.xanh },
  ];

  // ----- kênh + loại hàng + lý do huỷ -----
  const bangKenh = bang([
    { ten: 'Kênh', rong: '*', f: (r) => chamChu((TT_KENH[r.k] || TT_KENH.khac)[1], (TT_KENH[r.k] || TT_KENH.khac)[0]) },
    { ten: 'Đơn', rong: 34, canh: 'right', f: (r) => so(r.don) },
    { ten: 'SL', rong: 34, canh: 'right', f: (r) => so(r.sl) },
    { ten: 'Doanh thu', rong: 44, canh: 'right', f: (r) => ({ text: tien(r.dt), bold: true }) },
    { ten: 'Tỷ trọng', rong: 34, canh: 'right', f: (r) => tyTrong(r.sl, tongSl) },
  ], [...kenh].sort((a, b) => KTH.indexOf(a.k) - KTH.indexOf(b.k)));
  const dm = [...(bc.dm || [])].sort((a, b) => b.dt - a.dt);
  const bangDm = bang([
    { ten: 'Loại hàng', rong: '*', f: (r) => cat(r.k || 'Chưa rõ', 24) },
    { ten: 'Đơn', rong: 34, canh: 'right', f: (r) => so(r.don) },
    { ten: 'SL', rong: 34, canh: 'right', f: (r) => so(r.sl) },
    { ten: 'Doanh thu', rong: 44, canh: 'right', f: (r) => ({ text: tien(r.dt), bold: true }) },
  ], dm);
  const huy = [...(bc.huy || [])].sort((a, b) => b.n - a.n).slice(0, 10);
  const bangHuy = bang([
    { ten: 'Lý do huỷ', rong: '*', f: (r) => cat(r.k, 30) },
    { ten: 'Đơn', rong: 32, canh: 'right', f: (r) => so(r.n) },
    { ten: 'Khách', rong: 30, canh: 'right', f: (r) => so(r.kh) },
    { ten: 'Hệ thống', rong: 34, canh: 'right', f: (r) => so(r.ht) },
    { ten: 'Shop', rong: 26, canh: 'right', f: (r) => so(r.shop) },
  ], huy, { rongTrong: 'Không có đơn huỷ' });

  // ----- người bán -----
  const nbTop = nb.filter((r) => (r.don || 0) + (r.lv_phien || 0) + (r.vd_so || 0) > 0).slice(0, 30);
  const maxNb = Math.max(1, ...nbTop.map((r) => r.dt || 0));
  const cong = (k) => nb.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const bangNb = bang([
    { ten: 'Cửa hàng / nhóm', rong: 84, f: (r) => ({ text: cat(r.nhom, 22), color: r.nhom === 'Chưa gán' ? MAU.do : MAU.ink }) },
    { ten: 'Người bán', rong: '*', f: (r) => ({ stack: [{ text: cat(r.ten, 26), bold: true }, r.nb ? { text: '@' + cat(r.nb, 26) + (r.loai ? ' · ' + (TT_LOAI[r.loai] || r.loai) : ''), color: MAU.mo, fontSize: 6.2 } : { text: 'mua qua thẻ sản phẩm', color: MAU.mo, fontSize: 6.2 }] }) },
    { ten: 'Đơn', rong: 34, canh: 'right', f: (r) => so(r.don) },
    { ten: 'SL', rong: 34, canh: 'right', f: (r) => so(r.sl) },
    { ten: 'Doanh thu', rong: W_TIEN, canh: 'right', f: (r) => ({ stack: [{ text: so(r.dt), bold: true }, thanhO(r.dt || 0, maxNb, MAU.teal, 56)] }) },
    { ten: 'Huỷ', rong: 26, canh: 'right', f: (r) => (r.huy ? { text: so(r.huy), color: MAU.do } : '—') },
    { ten: 'LIVE · phiên', rong: 34, canh: 'right', f: (r) => (r.lv_phien ? so(r.lv_phien) : '—') },
    { ten: 'LIVE · DS', rong: 52, canh: 'right', f: (r) => (r.lv_dt ? tien(r.lv_dt) : '—') },
    { ten: 'Video · DS', rong: 44, canh: 'right', f: (r) => (r.vd_dt ? tien(r.vd_dt) : '—') },
  ], nbTop, { coChu: 7.2, tong: { nhom: 'Tổng cộng', ten: `${so(nb.filter((r) => r.nb !== '').length)} người bán`, nb: '', don: t.don, sl: t.sl, dt: t.dt, huy: t.don_huy, lv_phien: cong('lv_phien'), lv_dt: cong('lv_dt'), vd_dt: cong('vd_dt') } });
  bangNb.table.body[bangNb.table.body.length - 1][1] = { text: `${so(nb.filter((r) => r.nb !== '').length)} người bán`, bold: true };
  bangNb.table.body[bangNb.table.body.length - 1][4] = { text: so(t.dt), bold: true, alignment: 'right' };

  // ----- cửa hàng -----
  const ch = [...(bc.ch || [])].sort((a, b) => b.dt - a.dt);
  const maxCh = Math.max(1, ...ch.map((x) => x.dt));
  const bangCh = bang([
    { ten: '#', rong: 14, canh: 'right', f: (r) => ({ text: String(ch.indexOf(r) + 1), color: MAU.mo }) },
    { ten: 'Cửa hàng', rong: '*', f: (r) => ({ stack: [{ text: cat(r.ten || r.ma_ch, 34), bold: true }, { text: r.ma_ch || '', color: MAU.mo, fontSize: 6.2 }] }) },
    { ten: 'Khu vực', rong: 70, f: (r) => cat(r.kv || '—', 18) },
    { ten: 'ID', rong: 26, canh: 'right', f: (r) => so(r.so_nb) },
    { ten: 'Đơn', rong: 36, canh: 'right', f: (r) => so(r.don) },
    { ten: 'SL', rong: 36, canh: 'right', f: (r) => so(r.sl) },
    { ten: 'Doanh thu', rong: W_TIEN, canh: 'right', f: (r) => ({ text: so(r.dt), bold: true }) },
    { ten: '', rong: 50, f: (r) => thanhO(r.dt, maxCh, MAU.tealDam, 48) },
    { ten: 'Huỷ', rong: 26, canh: 'right', f: (r) => so(r.huy) },
  ], ch.slice(0, 30), { rongTrong: 'Chưa gán ID người bán với cửa hàng' });

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

  // ----- tỉnh + vận chuyển / thanh toán -----
  const tinh = (bc.tinh || []).slice(0, 14);
  const maxTinh = Math.max(1, ...tinh.map((x) => x.don));
  const bangTinh = bang([
    { ten: 'Tỉnh / thành', rong: '*', f: (r) => cat(r.k || 'Chưa rõ', 20) },
    { ten: 'Đơn', rong: 36, canh: 'right', f: (r) => so(r.don) },
    { ten: 'Doanh thu', rong: W_TIEN, canh: 'right', f: (r) => so(r.dt) },
    { ten: '', rong: 30, f: (r) => thanhO(r.don, maxTinh, MAU.ink, 28) },
  ], tinh);
  const vc = [...(bc.dvvc || []).filter((x) => x.don > 0).map((x) => ({ ...x, nhom: 'Vận chuyển' })), ...(bc.thanh_toan || []).filter((x) => x.don > 0).map((x) => ({ ...x, nhom: 'Thanh toán' }))];
  const bangVc = bang([
    { ten: 'Vận chuyển / thanh toán', rong: '*', f: (r) => cat(r.k || 'Chưa rõ', 26) },
    { ten: 'Loại', rong: 50, f: (r) => ({ text: r.nhom, color: MAU.ink2 }) },
    { ten: 'Đơn', rong: 36, canh: 'right', f: (r) => so(r.don) },
    { ten: 'Tỷ lệ', rong: 34, canh: 'right', f: (r) => tyTrong(r.don, t.don || 0) },
  ], vc);

  const tk = bc.tk || {};
  const noiDung = [
    dauTrang({ tieuDe: 'Báo cáo TikTok Shop', ky: `${ngayVN(bc.tu)} – ${ngayVN(bc.den)} (${n} ngày)`, loc: meta.loc }),
    luoiKpi(kpi),
    diemChinh(cauNhanXet(bc, nb).slice(0, 9)),
    muc(`Sản phẩm bán theo ${td.kieu}`, 'chia theo kênh: LIVE · Video · Thẻ sản phẩm'),
    bieuDoCot(td.cot, { cao: 115, dinhDang: (v) => so(v) + ' sp', chuThich: KTH.map((k) => ({ ten: TT_KENH[k][0], mau: TT_KENH[k][1] })) }),
    khoi({ text: 'Tỷ trọng sản phẩm bán cả kỳ', fontSize: 7.5, bold: true, italics: true, color: MAU.ink2, margin: [0, 12, 0, 4] }, thanhTyTrong(KTH.map((k) => kenh.find((x) => x.k === k)).filter(Boolean).map((x) => ({ ten: TT_KENH[x.k][0], v: x.sl, mau: TT_KENH[x.k][1] })))),

    muc('Người bán', `${nbTop.length < nb.length ? `${so(nbTop.length)} / ${so(nb.length)} ID doanh thu cao nhất` : `${so(nb.length)} ID`} · LIVE / Video = TikTok thống kê${tk.live_den ? ', có tới ' + ngayVN(tk.live_den) : ''}`, { truocTrang: true }),
    bangNb,
    muc('Cửa hàng', `${ch.length > 30 ? `30 / ${so(ch.length)} cửa hàng` : `${so(ch.length)} cửa hàng`} · cộng các ID đã gán cho từng cửa hàng`),
    { text: 'Cùng số đơn với bảng Người bán ở trên, chỉ gom theo cửa hàng — không cộng hai bảng với nhau. ID đội sale, kênh công ty, nhà sáng tạo ngoài và đơn qua thẻ sản phẩm không thuộc cửa hàng nào nên không có ở đây.', fontSize: 6.8, color: MAU.mo, margin: [0, -2, 0, 6] },
    bangCh,
    muc('Sản phẩm bán chạy', sp.length > 40 ? `40 / ${so(sp.length)} mã nhiều sản phẩm nhất` : `${so(sp.length)} mã`, { truocTrang: true }),
    bangSp,
    chuThichKenh(),
    haiCot([muc('Kênh bán', null, { rong: NUA }), bangKenh, muc('Loại hàng', null, { rong: NUA }), bangDm], [muc('Lý do huỷ', null, { rong: NUA }), bangHuy]),
    muc('Phiên LIVE có đơn', `${live.length < (bc.live_top || []).length ? `15 / ${so((bc.live_top || []).length)} phiên doanh số cao nhất · ` : ''}TikTok thống kê, chốt chậm 1–2 ngày`),
    bangLive,
    muc('Video có đơn', `${video.length < (bc.video_top || []).length ? `12 / ${so((bc.video_top || []).length)} video doanh số cao nhất · ` : ''}TikTok thống kê`),
    bangVideo,
    haiCot([muc('Tỉnh / thành nhiều đơn', null, { rong: NUA }), bangTinh], [muc('Vận chuyển & thanh toán', null, { rong: NUA }), bangVc]),
    { margin: [0, 18, 0, 0], unbreakable: true, stack: [
      { text: 'Cách tính', bold: true, fontSize: 8, color: MAU.ink2, margin: [0, 0, 0, 3] },
      { ul: [
        'Doanh thu shop = giá niêm yết − shop giảm, chỉ tính đơn hợp lệ (không huỷ). Khách trả = số tiền khách thanh toán (đã trừ cả sàn hỗ trợ).',
        'Đơn của người bán = đơn khách mua trực tiếp từ LIVE / video của ID đó (đúng cách Seller Center ghi nhận); đơn mua qua thẻ sản phẩm tính "Không qua người bán".',
        'LIVE / Video (TikTok thống kê) là doanh số gộp TikTok tự tính theo phiên / video, có cả đơn chưa thanh toán hoặc sẽ huỷ — dùng xem hiệu quả nội dung, không cộng với doanh thu đơn.',
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
  const ghi = `Kỳ ${ngayVN(bc.tu)} – ${ngayVN(bc.den)} · ${meta.loc || 'không lọc'} · xuất lúc ${meta.luc || ''}`;
  const nb = dsNguoiBan(bc);
  const sp = [...(bc.sp || [])].sort((a, b) => b.sl - a.sl);
  const sku = sp.flatMap((r) => (r.co || []).map((c) => ({ ma: r.ma, ten: r.ten, dm: r.dm, ...c })));
  const chiSo = [
    ['Doanh thu shop (đơn hợp lệ)', t.dt], ['Đơn hợp lệ', t.don], ['Sản phẩm bán (sau trả)', t.sl], ['Sản phẩm đặt', t.sl_dat], ['Sản phẩm trả', t.sl_tra],
    ['Khách trả', t.khach_tra], ['Sàn hỗ trợ', t.san_ho_tro], ['Giá trị TB / đơn', t.don ? Math.round(t.dt / t.don) : null], ['Đơn huỷ', t.don_huy],
    ['Chờ gửi hàng', t.cho_gui], ['Đang giao', t.dang_giao], ['Đã giao', t.da_giao], ['Số người bán có đơn', t.so_nb], ['Số mã có bán', t.so_sp],
  ];
  return [
    { ten: 'Tổng quan', tieuDe: 'BÁO CÁO TIKTOK SHOP — NÓN SƠN', ghiChu: ghi, cot: [{ ten: 'Chỉ số', w: 30 }, { ten: 'Giá trị', w: 18, kieu: 'tien' }], dong: chiSo },
    { ten: 'Theo ngày', ghiChu: ghi, cot: [{ ten: bc.tu === bc.den ? 'Giờ' : 'Ngày', k: 'k', w: 12 }, { ten: 'Đơn', k: 'don', kieu: 'so' }, { ten: 'Huỷ', k: 'huy', kieu: 'so' },
      { ten: 'SL', k: 'sl', kieu: 'so' }, { ten: 'Doanh thu', k: 'dt', w: 15, kieu: 'tien' }, { ten: 'SL LIVE', k: 'live', kieu: 'so' }, { ten: 'SL Video', k: 'video', kieu: 'so' }, { ten: 'SL Thẻ SP', k: 'the', kieu: 'so' }],
      dong: [...(bc.theo || [])].sort((a, b) => (a.k < b.k ? -1 : 1)) },
    { ten: 'Kênh', ghiChu: ghi, cot: [{ ten: 'Kênh', f: (r) => (TT_KENH[r.k] || TT_KENH.khac)[0], w: 20 }, { ten: 'Đơn', k: 'don', kieu: 'so' }, { ten: 'SL', k: 'sl', kieu: 'so' }, { ten: 'Doanh thu', k: 'dt', w: 15, kieu: 'tien' }], dong: bc.kenh || [] },
    { ten: 'Người bán', ghiChu: ghi + ' · LIVE / Video = TikTok thống kê', cot: [{ ten: 'Cửa hàng / nhóm', k: 'nhom', w: 24 }, { ten: 'Mã cửa hàng', k: 'ma_ch', w: 12 }, { ten: 'ID người bán', k: 'nb', w: 24 },
      { ten: 'Tên gọi', k: 'ten', w: 22 }, { ten: 'Loại', f: (r) => TT_LOAI[r.loai] || r.loai || '', w: 16 }, { ten: 'Đơn', k: 'don', kieu: 'so' }, { ten: 'SL', k: 'sl', kieu: 'so' },
      { ten: 'Doanh thu', k: 'dt', w: 15, kieu: 'tien' }, { ten: 'Đơn huỷ', k: 'huy', kieu: 'so' }, { ten: 'SL qua LIVE', k: 'live', kieu: 'so' }, { ten: 'SL qua Video', k: 'video', kieu: 'so' },
      { ten: 'Phiên LIVE', k: 'lv_phien', kieu: 'so' }, { ten: 'LIVE · đơn', k: 'lv_don', kieu: 'so' }, { ten: 'LIVE · SL', k: 'lv_sl', kieu: 'so' }, { ten: 'LIVE · doanh số', k: 'lv_dt', w: 15, kieu: 'tien' },
      { ten: 'LIVE · người xem', k: 'lv_xem', w: 14, kieu: 'so' }, { ten: 'Số video', k: 'vd_so', kieu: 'so' }, { ten: 'Video · đơn', k: 'vd_don', kieu: 'so' }, { ten: 'Video · SL', k: 'vd_sl', kieu: 'so' },
      { ten: 'Video · doanh số', k: 'vd_dt', w: 15, kieu: 'tien' }, { ten: 'Video · lượt xem', k: 'vd_xem', w: 14, kieu: 'so' }], dong: nb },
    { ten: 'Cửa hàng', ghiChu: ghi, cot: [{ ten: 'Mã cửa hàng', k: 'ma_ch', w: 12 }, { ten: 'Cửa hàng', k: 'ten', w: 30 }, { ten: 'Khu vực', k: 'kv', w: 16 }, { ten: 'Số ID', k: 'so_nb', kieu: 'so' },
      { ten: 'Đơn', k: 'don', kieu: 'so' }, { ten: 'SL', k: 'sl', kieu: 'so' }, { ten: 'Doanh thu', k: 'dt', w: 15, kieu: 'tien' }, { ten: 'Đơn huỷ', k: 'huy', kieu: 'so' }], dong: [...(bc.ch || [])].sort((a, b) => b.dt - a.dt) },
    { ten: 'Sản phẩm', ghiChu: ghi + ' · gộp theo mã mẹ', cot: [{ ten: 'Mã mẹ', k: 'ma', w: 16 }, { ten: 'Tên sản phẩm', k: 'ten', w: 48 }, { ten: 'Loại hàng', k: 'dm', w: 16 },
      { ten: 'SL bán', k: 'sl', kieu: 'so' }, { ten: 'SL đặt', k: 'dat', kieu: 'so' }, { ten: 'Đơn', k: 'don', kieu: 'so' }, { ten: 'Doanh thu', k: 'dt', w: 15, kieu: 'tien' },
      { ten: 'Đơn huỷ', k: 'huy', kieu: 'so' }, { ten: 'SL trả', k: 'tra', kieu: 'so' }, { ten: 'SL LIVE', k: 'live', kieu: 'so' }, { ten: 'SL Video', k: 'video', kieu: 'so' },
      { ten: 'SL Thẻ SP', k: 'the', kieu: 'so' }, { ten: 'Số người bán', k: 'so_nb', kieu: 'so' }], dong: sp },
    { ten: 'Phân loại (SKU)', ghiChu: ghi, cot: [{ ten: 'Mã mẹ', k: 'ma', w: 16 }, { ten: 'SKU', k: 'sku', w: 20 }, { ten: 'Phân loại', k: 'pl', w: 32 }, { ten: 'Loại hàng', k: 'dm', w: 16 },
      { ten: 'SL bán', k: 'sl', kieu: 'so' }, { ten: 'SL đặt', k: 'dat', kieu: 'so' }], dong: sku },
    { ten: 'Loại hàng', ghiChu: ghi, cot: [{ ten: 'Loại hàng', f: (r) => r.k || 'Chưa rõ', w: 22 }, { ten: 'Đơn', k: 'don', kieu: 'so' }, { ten: 'SL', k: 'sl', kieu: 'so' }, { ten: 'Doanh thu', k: 'dt', w: 15, kieu: 'tien' }], dong: bc.dm || [] },
    { ten: 'Lý do huỷ', ghiChu: ghi, cot: [{ ten: 'Lý do', k: 'k', w: 36 }, { ten: 'Đơn', k: 'n', kieu: 'so' }, { ten: 'Khách huỷ', k: 'kh', kieu: 'so' }, { ten: 'Hệ thống huỷ', k: 'ht', kieu: 'so' }, { ten: 'Shop huỷ', k: 'shop', kieu: 'so' }], dong: bc.huy || [] },
    { ten: 'Tỉnh thành', ghiChu: ghi, cot: [{ ten: 'Tỉnh / thành', f: (r) => r.k || 'Chưa rõ', w: 22 }, { ten: 'Đơn', k: 'don', kieu: 'so' }, { ten: 'Doanh thu', k: 'dt', w: 15, kieu: 'tien' }], dong: bc.tinh || [] },
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
