// NEW - 3.154: BÁO CÁO + DỮ LIỆU XUẤT cho màn Online (Nhanh.vn). Dựng từ đúng số liệu đang xem (fn_nh_bao_cao) + dòng chi tiết (fn_nh_xuat).
import { tien, ngayVN, ngayNgan, THU_TU_KENH, kenhTen, kenhMau, NHOM_KENH, NGANH, CS, LY_DO } from './hangSo.js';
import { MAU, NUA, so, tyTrong, lech, khoi, muc, dauTrang, luoiKpi, diemChinh, thanhTyTrong, bieuDoCot, thanhO, bang, chamChu, haiCot, taiLieu } from './pdf.js';

const NHOM_NGAN = { san: 'Sàn TMĐT', web: 'Web · FB · Zalo' };
const W_TIEN = 64;   // đủ chỗ 14 ký tự số (99.999.999.999)
const TT_NHOM = { tc: 'Thành công', giao: 'Đang giao', xl: 'Đang xử lý', hoan: 'Hoàn', tb: 'Thất bại', huy: 'Huỷ' };
const soNgay = (tu, den) => Math.round((new Date(den + 'T00:00:00') - new Date(tu + 'T00:00:00')) / 864e5) + 1;
const cat = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');
const ptSo = (a, b) => (b > 0 ? a / b : null);

// gom theo_ngay (ngày × kênh) → cột theo ngày (hoặc theo tuần khi > 62 ngày)
function cotTheoNgay(bc) {
  const kenhCo = [...new Set((bc.theo_ngay || []).map((x) => x.kenh))];
  const thuTu = [...THU_TU_KENH.filter((k) => kenhCo.includes(k)), ...kenhCo.filter((k) => !THU_TU_KENH.includes(k))];
  const m = new Map();
  for (const x of bc.theo_ngay || []) { const o = m.get(x.k) || {}; o[x.kenh] = (o[x.kenh] || 0) + (Number(x.dt) || 0); m.set(x.k, o); }
  // dựng chuỗi ngày theo lịch (không qua toISOString để khỏi lệch múi giờ)
  const ds = []; const d2 = new Date(Number(bc.tu.slice(0, 4)), Number(bc.tu.slice(5, 7)) - 1, Number(bc.tu.slice(8, 10)));
  for (let i = 0, n = Math.min(soNgay(bc.tu, bc.den), 800); i < n; i++) {
    const k = `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, '0')}-${String(d2.getDate()).padStart(2, '0')}`;
    ds.push({ k, o: m.get(k) || {} }); d2.setDate(d2.getDate() + 1);
  }
  let cot = ds.map((x) => ({ nhan: x.k.slice(8, 10), nhanDu: ngayVN(x.k), o: x.o }));
  if (ds.length > 62) {
    cot = [];
    for (let i = 0; i < ds.length; i += 7) {
      const g = ds.slice(i, i + 7); const o = {};
      for (const x of g) for (const [k, v] of Object.entries(x.o)) o[k] = (o[k] || 0) + v;
      cot.push({ nhan: ngayNgan(g[0].k), nhanDu: `tuần ${ngayNgan(g[0].k)}–${ngayNgan(g[g.length - 1].k)}`, o });
    }
  }
  return { thuTu, cot: cot.map((c) => ({ ...c, phan: thuTu.map((k) => ({ v: c.o[k] || 0, mau: kenhMau(k) })) })), theoTuan: ds.length > 62 };
}

function cauNhanXet(bc) {
  const t = bc.tong || {}, tr = bc.truoc || {};
  const kenh = [...(bc.kenh || [])].sort((a, b) => b.dt - a.dt);
  const tongDt = t.dt || 0;
  const c = [];
  const l = lech(t.dt, tr.dt);
  c.push(`Doanh số ${tien(t.dt)} từ ${so(t.don)} đơn, ${so(t.sl)} sản phẩm` + (tr.dt > 0 ? ` — ${l.text.startsWith('+') ? 'tăng' : l.text.startsWith('−') ? 'giảm' : 'ngang'} ${l.text.replace(/^[+−]/, '')} so với kỳ trước (${tien(tr.dt)}).` : '.'));
  if (kenh.length) {
    const san = kenh.filter((k) => k.nhom === 'san').reduce((s, k) => s + k.dt, 0);
    c.push(`${kenh[0].ten || kenhTen(kenh[0].k)} dẫn đầu với ${tyTrong(kenh[0].dt, tongDt)} doanh số` + (kenh[1] ? `, tiếp theo ${kenh[1].ten || kenhTen(kenh[1].k)} ${tyTrong(kenh[1].dt, tongDt)}` : '') + `. Sàn TMĐT chiếm ${tyTrong(san, tongDt)}, Web + Facebook + Zalo + Admin ${tyTrong(tongDt - san, tongDt)}.`);
  }
  const ngay = new Map(); for (const x of bc.theo_ngay || []) { const o = ngay.get(x.k) || { dt: 0, don: 0 }; o.dt += Number(x.dt) || 0; o.don += Number(x.don) || 0; ngay.set(x.k, o); }
  const ds = [...ngay.entries()].sort((a, b) => b[1].dt - a[1].dt);
  if (ds.length > 1) c.push(`Ngày bán cao nhất ${ngayVN(ds[0][0])}: ${tien(ds[0][1].dt)} (${so(ds[0][1].don)} đơn); trung bình ${tien(tongDt / soNgay(bc.tu, bc.den))} / ngày.`);
  const gio = [...(bc.gio || [])].sort((a, b) => b.don - a.don);
  if (gio[0]?.don > 0) {
    const tongG = (bc.gio || []).reduce((s, x) => s + x.don, 0);
    c.push(`Khung giờ chốt đơn nhiều nhất: ${gio[0].g}h–${gio[0].g + 1}h (${tyTrong(gio[0].don, tongG)} đơn)` + (gio[1]?.don > 0 ? `, kế đến ${gio[1].g}h–${gio[1].g + 1}h.` : '.'));
  }
  const sp = bc.sp || [];
  if (sp.length) {
    const top10 = sp.slice(0, 10).reduce((s, x) => s + x.dt, 0);
    const tongSp = sp.reduce((s, x) => s + x.dt, 0);
    c.push(`Bán chạy nhất ${sp[0].ma} — ${so(sp[0].sl)} sản phẩm, ${tien(sp[0].dt)}; 10 mã dẫn đầu chiếm ${tyTrong(top10, tongSp)} doanh số trên ${so(sp.length)} mã có bán.`);
  }
  const nc = bc.nganh_cs || [];
  const tongNc = nc.reduce((s, x) => s + x.dt, 0);
  if (tongNc > 0) {
    const sale = nc.filter((x) => x.cs === 'sale').reduce((s, x) => s + x.dt, 0);
    const ng = Object.entries(nc.reduce((m, x) => ({ ...m, [x.nganh]: (m[x.nganh] || 0) + x.dt }), {})).sort((a, b) => b[1] - a[1]);
    c.push(`Hàng sale chiếm ${tyTrong(sale, tongNc)} doanh số; ngành ${NGANH[ng[0][0]] || ng[0][0]} lớn nhất (${tyTrong(ng[0][1], tongNc)}).`);
  }
  if (t.don > 0) {
    const hvc = (bc.hvc || []).filter((x) => x.don >= 30 && x.ten !== 'Chưa có hãng VC').sort((a, b) => b.hoan / b.don - a.hoan / a.don);
    c.push(`Tỷ lệ hoàn ${tyTrong(t.don_hoan || 0, t.don)} đơn (${so(t.don_hoan)} đơn, ${tien(t.dt_hoan)})` + (hvc[0]?.hoan > 0 ? `; hãng hoàn cao nhất ${hvc[0].ten} ${tyTrong(hvc[0].hoan, hvc[0].don)}.` : '.'));
  }
  const tongDat = (t.don || 0) + (t.don_huy || 0);
  if (t.don_huy > 0) {
    const ld = (bc.ly_do || []).filter((x) => x.ttn === 'huy').sort((a, b) => b.don - a.don)[0];
    c.push(`Huỷ ${so(t.don_huy)} đơn — ${tyTrong(t.don_huy, tongDat)} tổng đơn đặt` + (ld ? `; lý do nhiều nhất: ${LY_DO[ld.k] || 'mã ' + ld.k}.` : '.'));
  }
  if (t.khach > 0) c.push(`${so(t.khach)} khách có số điện thoại, ${so(t.khach_lap)} khách mua từ 2 đơn trở lên trong kỳ.`);
  return c;
}

export function docOnline(bc, meta = {}) {
  const t = bc.tong || {}, tr = bc.truoc || {};
  const n = soNgay(bc.tu, bc.den);
  const tongDat = (t.don || 0) + (t.don_huy || 0);
  const kenh = [...(bc.kenh || [])].sort((a, b) => b.dt - a.dt);
  const maxKenh = Math.max(1, ...kenh.map((x) => x.dt));
  const td = cotTheoNgay(bc);
  const motNgay = bc.tu === bc.den;
  const gio = bc.gio || [];

  const kpi = [
    { ten: 'Doanh số', so: tien(t.dt), lech: lech(t.dt, tr.dt), phu: 'không tính đơn huỷ' },
    { ten: 'Đơn hàng', so: so(t.don), lech: lech(t.don, tr.don), phu: `${so(t.so_shop)} gian hàng / kênh` },
    { ten: 'Giá trị TB / đơn', so: t.don ? tien(t.dt / t.don) : '—', lech: lech(t.don ? t.dt / t.don : 0, tr.don ? tr.dt / tr.don : 0), phu: `${t.don ? (t.sl / t.don).toLocaleString('vi', { maximumFractionDigits: 2 }) : 0} sp / đơn` },
    { ten: 'Sản phẩm bán', so: so(t.sl), lech: lech(t.sl, tr.sl), phu: `${so(t.so_ma)} mã có bán` },
    { ten: 'Thành công', so: tien(t.dt_tc), lech: lech(t.dt_tc, tr.dt_tc), phu: `${so(t.don_tc)} đơn · ${tyTrong(t.don_tc || 0, t.don || 0)}`, mau: MAU.xanh },
    { ten: 'Đang giao / xử lý', so: so((t.don_giao || 0) + (t.don_xl || 0)), phu: `${tien(t.dt_giao)} chưa chốt` },
    { ten: 'Hoàn', so: so(t.don_hoan), lech: lech(t.don_hoan, tr.don_hoan, true), phu: `${tyTrong(t.don_hoan || 0, t.don || 0)} đơn · ${tien(t.dt_hoan)}`, mau: t.don_hoan ? '#B5651D' : undefined },
    { ten: 'Huỷ', so: so(t.don_huy), lech: lech(t.don_huy, tr.don_huy, true), phu: `${tyTrong(t.don_huy || 0, tongDat)} tổng đơn đặt`, mau: t.don_huy ? MAU.do : undefined },
  ];

  // ----- bảng kênh -----
  const bangKenh = bang([
    { ten: 'Kênh', rong: 70, f: (r) => chamChu(kenhMau(r.k), r.ten || kenhTen(r.k)) },
    { ten: 'Nhóm', rong: 56, f: (r) => ({ text: NHOM_NGAN[r.nhom] || '', color: MAU.ink2 }) },
    { ten: 'Đơn', rong: 38, canh: 'right', f: (r) => so(r.don) },
    { ten: 'SL', rong: 38, canh: 'right', f: (r) => so(r.sl) },
    { ten: 'Doanh số', rong: W_TIEN, canh: 'right', f: (r) => ({ text: so(r.dt), bold: true }) },
    { ten: 'Tỷ trọng', rong: 84, f: (r) => ({ columns: [{ ...thanhO(r.dt, maxKenh, kenhMau(r.k), 46), width: 50 }, { text: tyTrong(r.dt, t.dt), width: '*', alignment: 'right' }] }) },
    { ten: 'Thành công', rong: 44, canh: 'right', f: (r) => tyTrong(r.tc, r.don) },
    { ten: 'Hoàn', rong: 30, canh: 'right', f: (r) => so(r.hoan) },
    { ten: 'Huỷ', rong: '*', canh: 'right', f: (r) => so(r.huy) },
  ], kenh, { tong: { k: 0, ten: 'Tổng cộng', nhom: '', don: t.don, sl: t.sl, dt: t.dt, tc: t.don_tc, hoan: t.don_hoan, huy: t.don_huy } });
  // dòng tổng: bỏ chấm màu + thanh
  bangKenh.table.body[bangKenh.table.body.length - 1][0] = { text: 'Tổng cộng', bold: true };
  bangKenh.table.body[bangKenh.table.body.length - 1][5] = { text: '100%', alignment: 'right', bold: true };

  // ----- gian hàng -----
  const shop = [...(bc.shop || [])].sort((a, b) => b.dt - a.dt);
  const maxShop = Math.max(1, ...shop.map((x) => x.dt));
  const bangShop = bang([
    { ten: '#', rong: 14, canh: 'right', f: (r) => ({ text: String(shop.indexOf(r) + 1), color: MAU.mo }) },
    { ten: 'Gian hàng', rong: '*', f: (r) => cat(r.shop, 34) },
    { ten: 'Kênh', rong: 62, f: (r) => chamChu(kenhMau(r.kenh), r.ten_kenh || kenhTen(r.kenh)) },
    { ten: 'Đơn', rong: 38, canh: 'right', f: (r) => so(r.don) },
    { ten: 'SL', rong: 38, canh: 'right', f: (r) => so(r.sl) },
    { ten: 'Doanh số', rong: W_TIEN, canh: 'right', f: (r) => ({ text: so(r.dt), bold: true }) },
    { ten: 'Tỷ trọng', rong: 74, f: (r) => ({ columns: [{ ...thanhO(r.dt, maxShop, kenhMau(r.kenh), 38), width: 42 }, { text: tyTrong(r.dt, t.dt), width: '*', alignment: 'right' }] }) },
    { ten: 'Hoàn', rong: 30, canh: 'right', f: (r) => so(r.hoan) },
    { ten: 'Huỷ', rong: 26, canh: 'right', f: (r) => so(r.huy) },
  ], shop.slice(0, 25));

  // ----- trạng thái -----
  const tt = [...(bc.tt || [])].sort((a, b) => b.don - a.don);
  const tongTt = tt.reduce((s, x) => s + x.don, 0);
  const bangTt = bang([
    { ten: 'Trạng thái', rong: '*', f: (r) => cat(r.ten, 22) },
    { ten: 'Nhóm', rong: 52, f: (r) => ({ text: TT_NHOM[r.nhom] || '', color: r.nhom === 'huy' || r.nhom === 'tb' ? MAU.do : r.nhom === 'tc' ? MAU.xanh : MAU.ink2 }) },
    { ten: 'Đơn', rong: 36, canh: 'right', f: (r) => so(r.don) },
    { ten: 'Tỷ lệ', rong: 34, canh: 'right', f: (r) => tyTrong(r.don, tongTt) },
  ], tt);

  // ----- giờ chốt đơn -----
  const bdGio = bieuDoCot(Array.from({ length: 24 }, (_, g) => { const x = gio.find((z) => z.g === g) || {}; return { nhan: String(g), nhanDu: `${g}h–${g + 1}h`, phan: [{ v: x.don || 0, mau: MAU.tealDam }] }; }),
    { cao: 90, rong: NUA, dinhDang: (v) => so(v) + ' đơn', nhanMoi: 3 });

  // ----- sản phẩm -----
  const sp = bc.sp || [];
  const tongSp = sp.reduce((s, x) => s + x.dt, 0);
  const maxSp = Math.max(1, ...sp.slice(0, 40).map((x) => x.dt));
  const tenGon = (r) => (r.ten || '').replace(/\s*\(.*$/, '').replace(new RegExp('\\s*(NS\\d{3})?' + (r.ma || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '.*$', 'i'), '').trim();
  const bangSp = bang([
    { ten: '#', rong: 14, canh: 'right', f: (r) => ({ text: String(sp.indexOf(r) + 1), color: MAU.mo }) },
    { ten: 'Sản phẩm', rong: '*', f: (r) => ({ stack: [{ text: r.ma, bold: true }, { text: cat(tenGon(r), 40), color: MAU.mo, fontSize: 6.3 }] }) },
    { ten: 'Ngành · C/S', rong: 52, f: (r) => ({ text: [{ text: (NGANH[r.nganh] || '—') + '\n', color: MAU.ink2 }, { text: CS[r.cs] || '—', color: r.cs === 'sale' ? MAU.hong : MAU.mo, fontSize: 6.5 }] }) },
    { ten: 'SL', rong: 32, canh: 'right', f: (r) => ({ text: so(r.sl), bold: true }) },
    { ten: 'Doanh số', rong: W_TIEN, canh: 'right', f: (r) => so(r.dt) },
    { ten: 'Tỷ trọng', rong: 60, f: (r) => ({ columns: [{ ...thanhO(r.dt, maxSp, MAU.teal, 28), width: 31 }, { text: tyTrong(r.dt, tongSp), width: '*', alignment: 'right' }] }) },
    { ten: 'Sàn / Web', rong: 44, canh: 'right', f: (r) => ({ text: `${so(r.sl_san)} / ${so(r.sl_web)}`, color: MAU.ink2 }) },
    { ten: 'Size chạy', rong: 56, f: (r) => ({ text: (r.co || []).slice(0, 2).map((c) => (c.ma || '').split('-').pop() + ' ' + so(c.sl)).join('\n'), color: MAU.ink2, fontSize: 6.5 }) },
  ], sp.slice(0, 40), { coChu: 7.2 });

  // ----- ngành × chính / sale -----
  const nc = bc.nganh_cs || [];
  const nganhDs = ['BH', 'NV', 'PK', '?'].filter((g) => nc.some((x) => x.nganh === g));
  const lay = (g, c, f) => nc.filter((x) => x.nganh === g && (c == null || x.cs === c)).reduce((s, x) => s + (x[f] || 0), 0);
  const tongNc = nc.reduce((s, x) => s + x.dt, 0);
  const bangNc = bang([
    { ten: 'Ngành', rong: '*', f: (r) => ({ text: r.ten, bold: !!r.tong }) },
    { ten: 'Chính · SL', rong: 50, canh: 'right', f: (r) => so(r.cSl) },
    { ten: 'Chính · DS', rong: W_TIEN, canh: 'right', f: (r) => so(r.cDt) },
    { ten: 'Sale · SL', rong: 50, canh: 'right', f: (r) => so(r.sSl) },
    { ten: 'Sale · DS', rong: W_TIEN, canh: 'right', f: (r) => so(r.sDt) },
    { ten: 'Tổng DS', rong: W_TIEN, canh: 'right', f: (r) => ({ text: so(r.dt), bold: true }) },
    { ten: 'Tỷ trọng', rong: 42, canh: 'right', f: (r) => tyTrong(r.dt, tongNc) },
  ], nganhDs.map((g) => ({ ten: NGANH[g], cSl: lay(g, 'chinh', 'sl'), cDt: lay(g, 'chinh', 'dt'), sSl: lay(g, 'sale', 'sl'), sDt: lay(g, 'sale', 'dt'), dt: lay(g, null, 'dt') })),
  { tong: { ten: 'Tổng', tong: true, cSl: lay('BH', 'chinh', 'sl') + lay('NV', 'chinh', 'sl') + lay('PK', 'chinh', 'sl') + lay('?', 'chinh', 'sl'), cDt: nc.filter((x) => x.cs === 'chinh').reduce((s, x) => s + x.dt, 0), sSl: nc.filter((x) => x.cs === 'sale').reduce((s, x) => s + x.sl, 0), sDt: nc.filter((x) => x.cs === 'sale').reduce((s, x) => s + x.dt, 0), dt: tongNc } });

  // ----- vận chuyển + lý do -----
  const hvc = [...(bc.hvc || [])].sort((a, b) => b.don - a.don);
  const bangHvc = bang([
    { ten: 'Hãng vận chuyển', rong: '*', f: (r) => cat(r.ten, 28) },
    { ten: 'Đơn', rong: 40, canh: 'right', f: (r) => so(r.don) },
    { ten: 'Thành công', rong: 48, canh: 'right', f: (r) => tyTrong(r.tc, r.don) },
    { ten: 'Hoàn', rong: 40, canh: 'right', f: (r) => ({ text: tyTrong(r.hoan, r.don), color: r.don >= 30 && r.hoan / r.don > 0.08 ? MAU.do : MAU.ink }) },
    { ten: 'Đang giao', rong: 44, canh: 'right', f: (r) => so(r.giao) },
    { ten: 'Giờ giao TB', rong: 52, canh: 'right', f: (r) => (r.giao_h != null ? r.giao_h.toLocaleString('vi') + ' giờ' : '—') },
    { ten: 'Phí ship TB', rong: 52, canh: 'right', f: (r) => (r.phi_ship ? so(r.phi_ship) : '—') },
  ], hvc.slice(0, 14));
  const lyDo = [...(bc.ly_do || [])].sort((a, b) => b.don - a.don).slice(0, 12);
  const bangLyDo = bang([
    { ten: 'Lý do', rong: '*', f: (r) => cat(LY_DO[r.k] || 'Mã ' + r.k, 34) },
    { ten: 'Loại', rong: 40, f: (r) => ({ text: TT_NHOM[r.ttn] || r.ttn, color: MAU.ink2 }) },
    { ten: 'Đơn', rong: 32, canh: 'right', f: (r) => so(r.don) },
  ], lyDo, { rongTrong: 'Không có lý do ghi nhận' });

  // ----- khu vực + nhân viên -----
  const tinh = (bc.tinh || []).slice(0, 16);
  const maxTinh = Math.max(1, ...tinh.map((x) => x.dt));
  const bangTinh = bang([
    { ten: 'Tỉnh / thành', rong: '*', f: (r) => cat(r.ten, 18) },
    { ten: 'Đơn', rong: 36, canh: 'right', f: (r) => so(r.don) },
    { ten: 'Doanh số', rong: W_TIEN, canh: 'right', f: (r) => so(r.dt) },
    { ten: '', rong: 34, f: (r) => thanhO(r.dt, maxTinh, MAU.ink, 32) },
  ], tinh);
  const nv = (bc.nv || []).slice(0, 20);
  const bangNv = bang([
    { ten: 'Nhân viên', rong: '*', f: (r) => cat(r.ten, 34) },
    { ten: 'Đơn', rong: 40, canh: 'right', f: (r) => so(r.don) },
    { ten: 'SL', rong: 40, canh: 'right', f: (r) => so(r.sl) },
    { ten: 'Doanh số', rong: W_TIEN, canh: 'right', f: (r) => ({ text: so(r.dt), bold: true }) },
    { ten: 'Hoàn', rong: 34, canh: 'right', f: (r) => so(r.hoan) },
    { ten: 'Huỷ', rong: 34, canh: 'right', f: (r) => so(r.huy) },
    { ten: 'Kênh', rong: 130, f: (r) => ({ text: cat(r.kenh || '', 40), color: MAU.ink2, fontSize: 6.8 }) },
  ], nv, { rongTrong: 'Không có đơn Web / Facebook / Zalo / Admin' });

  // ----- TikTok × ID -----
  const tk = bc.tiktok || {};
  const coTk = (tk.don || 0) > 0 && (tk.nb || []).length > 0;
  const LOAI_TK = { CH: 'Cửa hàng', DOISALE: 'Đội sale', KENH: 'Kênh công ty', KOL: 'Nhà sáng tạo ngoài', KHAC: 'Khác', CHUA_GAN: 'ID chưa gán', KHONG: 'Không qua người bán' };
  const tkNb = [...(tk.nb || [])].sort((a, b) => b.dt - a.dt).slice(0, 15);

  const noiDung = [
    dauTrang({ tieuDe: 'Báo cáo bán hàng online', ky: `${ngayVN(bc.tu)} – ${ngayVN(bc.den)} (${n} ngày)`, soSanh: bc.tu_truoc ? `${ngayVN(bc.tu_truoc)} – ${ngayVN(bc.den_truoc)}` : '', loc: meta.loc }),
    luoiKpi(kpi),
    diemChinh(cauNhanXet(bc).slice(0, 9)),
    muc(motNgay ? 'Đơn theo giờ' : td.theoTuan ? 'Doanh số theo tuần' : 'Doanh số theo ngày', 'chia theo kênh bán'),
    motNgay
      ? bieuDoCot(Array.from({ length: 24 }, (_, g) => { const x = gio.find((z) => z.g === g) || {}; return { nhan: String(g), nhanDu: `${g}h`, phan: [{ v: x.dt || 0, mau: MAU.tealDam }] }; }), { cao: 115 })
      : bieuDoCot(td.cot, { cao: 115, chuThich: td.thuTu.map((k) => ({ ten: kenhTen(k), mau: kenhMau(k) })) }),
    khoi({ text: 'Tỷ trọng doanh số cả kỳ', fontSize: 7.5, bold: true, italics: true, color: MAU.ink2, margin: [0, 12, 0, 4] }, thanhTyTrong(kenh.map((k) => ({ ten: k.ten || kenhTen(k.k), v: k.dt, mau: kenhMau(k.k) })))),

    muc('Kênh bán', `${so(kenh.length)} kênh`, { truocTrang: true }),
    bangKenh,
    muc('Gian hàng', shop.length > 25 ? `25 / ${so(shop.length)} gian hàng doanh số cao nhất` : `${so(shop.length)} gian hàng`),
    bangShop,
    haiCot([muc('Trạng thái đơn', null, { rong: NUA }), bangTt], [muc('Giờ chốt đơn', 'số đơn theo giờ đặt', { rong: NUA }), bdGio]),

    muc('Sản phẩm bán chạy', sp.length > 40 ? `40 / ${so(sp.length)} mã doanh số cao nhất · gộp theo mã mẹ` : `${so(sp.length)} mã · gộp theo mã mẹ`, { truocTrang: true }),
    bangSp,
    khoi(muc('Ngành hàng × Chính / Sale', 'SL = số sản phẩm · DS = doanh số'), bangNc),

    muc('Vận chuyển & hoàn', `${so(hvc.length)} hãng`),
    bangHvc,
    haiCot([muc('Lý do huỷ / hoàn / thất bại', null, { rong: NUA }), bangLyDo],
      [muc('Khu vực', (bc.tinh || []).length > 16 ? `16 / ${so((bc.tinh || []).length)} tỉnh thành` : '', { rong: NUA }), bangTinh]),
    khoi(muc('Nhân viên chốt đơn', 'đơn Web · Facebook · Zalo · Admin'), bangNv),
    coTk ? khoi(muc('TikTok Shop × ID người bán', `${so(tk.khop)} / ${so(tk.don)} đơn TikTok khớp mã đơn · ${so(tk.co_nb)} có ID người bán`), haiCot(
      bang([{ ten: 'Nhóm người bán', rong: '*', f: (r) => LOAI_TK[r.loai] || r.loai }, { ten: 'Đơn', rong: 36, canh: 'right', f: (r) => so(r.don) }, { ten: 'Doanh số', rong: W_TIEN, canh: 'right', f: (r) => so(r.dt) }],
        [...(tk.theo_loai || [])].sort((a, b) => b.dt - a.dt)),
      bang([{ ten: 'ID người bán', rong: '*', f: (r) => ({ text: [{ text: cat(r.ten || '@' + r.nb, 24) }, r.ten_ch ? { text: '\n' + cat(r.ten_ch, 30), color: MAU.mo, fontSize: 6.3 } : ''] }) },
        { ten: 'Đơn', rong: 32, canh: 'right', f: (r) => so(r.don) }, { ten: 'Doanh số', rong: W_TIEN, canh: 'right', f: (r) => so(r.dt) }], tkNb))) : null,
    { margin: [0, 18, 0, 0], unbreakable: true, stack: [
      { text: 'Cách tính', bold: true, fontSize: 8, color: MAU.ink2, margin: [0, 0, 0, 3] },
      { ul: [
        'Doanh số = tổng thành tiền các dòng hàng (đã trừ chiết khấu), không tính đơn huỷ. Đơn = đơn bán; không gồm đơn khách trả, chuyển kho.',
        `Kỳ trước = ${n} ngày liền trước (${bc.tu_truoc ? ngayVN(bc.tu_truoc) + ' – ' + ngayVN(bc.den_truoc) : '—'}). Tỷ lệ hoàn tính trên đơn không huỷ; tỷ lệ huỷ tính trên tổng đơn đặt.`,
        'Ngành và Chính / Sale lấy theo danh mục sản phẩm của NS FLOW (khớp mã tham chiếu Nhanh); mã chưa khớp ghi "Chưa rõ".',
        `Số liệu: ${so(bc.nguon?.api)} đơn từ API Nhanh.vn${bc.nguon?.excel ? `, ${so(bc.nguon.excel)} đơn tạm từ file báo cáo nhân viên` : ''}.`,
      ], fontSize: 6.8, color: MAU.mo },
    ] },
  ];

  return taiLieu({ tieuDeTrang: `Báo cáo bán hàng online · ${ngayVN(bc.tu)} – ${ngayVN(bc.den)}`, nguoi: meta.nguoi, luc: meta.luc, noiDung });
}

/* ================= DỮ LIỆU EXCEL ================= */
export const COT_DONG_ONLINE = [
  { ten: 'Ngày giờ đặt', w: 16 }, { ten: 'Mã đơn Nhanh', w: 13 }, { ten: 'Mã đơn sàn', w: 20 }, { ten: 'Kênh', w: 13 }, { ten: 'Gian hàng', w: 26 },
  { ten: 'Trạng thái', w: 14 }, { ten: 'Nhóm trạng thái', w: 13 }, { ten: 'Mã hàng', w: 20 }, { ten: 'Mã mẹ', w: 14 }, { ten: 'Tên sản phẩm', w: 44 },
  { ten: 'Ngành', w: 10 }, { ten: 'Chính / Sale', w: 10 }, { ten: 'SL', w: 6, kieu: 'so' }, { ten: 'Doanh số dòng', w: 13, kieu: 'tien' },
  { ten: 'Giá niêm yết', w: 12, kieu: 'tien' }, { ten: 'Hãng vận chuyển', w: 18 }, { ten: 'Mã vận đơn', w: 18 }, { ten: 'Tỉnh / thành', w: 16 },
  { ten: 'Nhân viên', w: 20 }, { ten: 'SĐT khách', w: 13 }, { ten: 'Phí sàn (đơn)', w: 12, kieu: 'tien' }, { ten: 'Phí ship (đơn)', w: 12, kieu: 'tien' }, { ten: 'Nguồn số liệu', w: 10 },
];

export function sheetsOnline(bc, dong, meta = {}) {
  const t = bc.tong || {}, tr = bc.truoc || {};
  const ky = `${ngayVN(bc.tu)} – ${ngayVN(bc.den)}`;
  const ghi = `Kỳ ${ky} · so với ${ngayVN(bc.tu_truoc)} – ${ngayVN(bc.den_truoc)} · ${meta.loc || 'không lọc'} · xuất lúc ${meta.luc || ''}`;
  const chiSo = [
    ['Doanh số (không tính huỷ)', t.dt, tr.dt], ['Đơn hàng', t.don, tr.don], ['Sản phẩm bán', t.sl, tr.sl],
    ['Giá trị TB / đơn', t.don ? Math.round(t.dt / t.don) : null, tr.don ? Math.round(tr.dt / tr.don) : null],
    ['Doanh số thành công', t.dt_tc, tr.dt_tc], ['Đơn thành công', t.don_tc, tr.don_tc], ['Đơn đang giao', t.don_giao, null], ['Đơn đang xử lý', t.don_xl, null],
    ['Đơn hoàn', t.don_hoan, tr.don_hoan], ['Doanh số hoàn', t.dt_hoan, null], ['Đơn huỷ', t.don_huy, tr.don_huy], ['Doanh số huỷ', t.dt_huy, null],
    ['Đơn thất bại', t.don_tb, null], ['Phí sàn', t.phi_san, null], ['Phí ship', t.phi_ship, null], ['Khách (SĐT)', t.khach, null],
    ['Khách mua ≥ 2 đơn', t.khach_lap, null], ['Số mã có bán', t.so_ma, null], ['Số gian hàng / kênh', t.so_shop, null],
  ];
  const kenhCo = THU_TU_KENH.filter((k) => (bc.theo_ngay || []).some((x) => x.kenh === k));
  const ngay = new Map();
  for (const x of bc.theo_ngay || []) { const o = ngay.get(x.k) || { k: x.k, don: 0, sl: 0, dt: 0 }; o.don += x.don; o.sl += x.sl; o.dt += Number(x.dt) || 0; o['k' + x.kenh] = (o['k' + x.kenh] || 0) + (Number(x.dt) || 0); ngay.set(x.k, o); }
  const lyDo = (bc.ly_do || []).map((x) => ({ ...x, ten: LY_DO[x.k] || 'Mã ' + x.k }));
  // gộp dòng → đơn
  const don = new Map();
  for (const r of dong) {
    const o = don.get(r[1]);
    if (o) { o[7] += 1; o[8] += Number(r[12]) || 0; o[9] += Number(r[13]) || 0; continue; }
    don.set(r[1], [r[0], r[1], r[2], r[3], r[4], r[5], r[6], 1, Number(r[12]) || 0, Number(r[13]) || 0, r[15], r[16], r[17], r[18], r[19], r[20], r[21], r[22]]);
  }
  return [
    { ten: 'Tổng quan', tieuDe: 'BÁO CÁO BÁN HÀNG ONLINE — NÓN SƠN', ghiChu: ghi,
      cot: [{ ten: 'Chỉ số', w: 28 }, { ten: 'Kỳ này', w: 16, kieu: 'tien' }, { ten: 'Kỳ trước', w: 16, kieu: 'tien' }, { ten: 'Chênh lệch', w: 12, kieu: 'pt' }],
      dong: chiSo.map(([a, b, c]) => [a, b ?? null, c ?? null, c > 0 && b != null ? (b - c) / c : null]) },
    { ten: 'Theo ngày', ghiChu: ghi, cot: [{ ten: 'Ngày', k: 'k', w: 12 }, { ten: 'Đơn', k: 'don', w: 9, kieu: 'so' }, { ten: 'SL', k: 'sl', w: 9, kieu: 'so' }, { ten: 'Doanh số', k: 'dt', w: 15, kieu: 'tien' },
      ...kenhCo.map((k) => ({ ten: 'DS ' + kenhTen(k), k: 'k' + k, w: 14, kieu: 'tien' }))], dong: [...ngay.values()].sort((a, b) => (a.k < b.k ? -1 : 1)) },
    { ten: 'Kênh', ghiChu: ghi, cot: [{ ten: 'Kênh', f: (r) => r.ten || kenhTen(r.k), w: 16 }, { ten: 'Nhóm', f: (r) => NHOM_KENH[r.nhom] || '', w: 20 }, { ten: 'Đơn', k: 'don', kieu: 'so' }, { ten: 'SL', k: 'sl', kieu: 'so' },
      { ten: 'Doanh số', k: 'dt', w: 15, kieu: 'tien' }, { ten: 'Tỷ trọng', f: (r) => ptSo(r.dt, t.dt), kieu: 'pt' }, { ten: 'DS thành công', k: 'dt_tc', w: 15, kieu: 'tien' }, { ten: 'Đơn thành công', k: 'tc', kieu: 'so' },
      { ten: 'Đơn hoàn', k: 'hoan', kieu: 'so' }, { ten: 'Đơn huỷ', k: 'huy', kieu: 'so' }, { ten: 'Đơn thất bại', k: 'tb', kieu: 'so' }, { ten: 'Phí sàn', k: 'phi_san', kieu: 'tien' }, { ten: 'Số gian hàng', k: 'so_shop', kieu: 'so' }],
      dong: [...(bc.kenh || [])].sort((a, b) => b.dt - a.dt) },
    { ten: 'Gian hàng', ghiChu: ghi, cot: [{ ten: 'Gian hàng', k: 'shop', w: 36 }, { ten: 'Kênh', f: (r) => r.ten_kenh || kenhTen(r.kenh), w: 14 }, { ten: 'Đơn', k: 'don', kieu: 'so' }, { ten: 'SL', k: 'sl', kieu: 'so' },
      { ten: 'Doanh số', k: 'dt', w: 15, kieu: 'tien' }, { ten: 'Tỷ trọng', f: (r) => ptSo(r.dt, t.dt), kieu: 'pt' }, { ten: 'Đơn thành công', k: 'tc', kieu: 'so' }, { ten: 'Đơn hoàn', k: 'hoan', kieu: 'so' },
      { ten: 'Đơn huỷ', k: 'huy', kieu: 'so' }, { ten: 'Phí sàn', k: 'phi_san', kieu: 'tien' }], dong: [...(bc.shop || [])].sort((a, b) => b.dt - a.dt) },
    { ten: 'Sản phẩm', ghiChu: ghi + ' · gộp theo mã mẹ', cot: [{ ten: 'Mã mẹ', k: 'ma', w: 16 }, { ten: 'Tên sản phẩm', k: 'ten', w: 48 }, { ten: 'Ngành', f: (r) => NGANH[r.nganh] || '', w: 10 },
      { ten: 'Chính / Sale', f: (r) => CS[r.cs] || '', w: 11 }, { ten: 'SL', k: 'sl', kieu: 'so' }, { ten: 'Đơn', k: 'don', kieu: 'so' }, { ten: 'Doanh số', k: 'dt', w: 15, kieu: 'tien' },
      { ten: 'Giá niêm yết', k: 'gny', kieu: 'tien' }, { ten: 'SL sàn TMĐT', k: 'sl_san', kieu: 'so' }, { ten: 'SL Web/FB/Zalo', k: 'sl_web', w: 14, kieu: 'so' }, { ten: 'SL hoàn', k: 'sl_hoan', kieu: 'so' },
      { ten: 'Chi tiết mã con (SL)', f: (r) => (r.co || []).map((c) => `${c.ma}: ${c.sl}`).join(' · '), w: 60 }], dong: bc.sp || [] },
    { ten: 'Ngành - Chính Sale', ghiChu: ghi, cot: [{ ten: 'Ngành', f: (r) => NGANH[r.nganh] || r.nganh, w: 12 }, { ten: 'Chính / Sale', f: (r) => CS[r.cs] || r.cs, w: 12 },
      { ten: 'SL', k: 'sl', kieu: 'so' }, { ten: 'Doanh số', k: 'dt', w: 15, kieu: 'tien' }, { ten: 'Đơn', k: 'don', kieu: 'so' }], dong: bc.nganh_cs || [] },
    { ten: 'Trạng thái', ghiChu: ghi, cot: [{ ten: 'Trạng thái', k: 'ten', w: 20 }, { ten: 'Nhóm', f: (r) => TT_NHOM[r.nhom] || '', w: 12 }, { ten: 'Đơn', k: 'don', kieu: 'so' }, { ten: 'Doanh số', k: 'dt', w: 15, kieu: 'tien' }], dong: bc.tt || [] },
    { ten: 'Vận chuyển', ghiChu: ghi, cot: [{ ten: 'Hãng vận chuyển', k: 'ten', w: 26 }, { ten: 'Đơn', k: 'don', kieu: 'so' }, { ten: 'Thành công', k: 'tc', kieu: 'so' }, { ten: 'Hoàn', k: 'hoan', kieu: 'so' },
      { ten: 'Tỷ lệ hoàn', f: (r) => ptSo(r.hoan, r.don), kieu: 'pt' }, { ten: 'Thất bại', k: 'tb', kieu: 'so' }, { ten: 'Đang giao', k: 'giao', kieu: 'so' }, { ten: 'Huỷ', k: 'huy', kieu: 'so' },
      { ten: 'Giờ giao TB', k: 'giao_h', kieu: 'thap' }, { ten: 'Phí ship TB', k: 'phi_ship', kieu: 'tien' }], dong: bc.hvc || [] },
    { ten: 'Lý do huỷ - hoàn', ghiChu: ghi, cot: [{ ten: 'Lý do', k: 'ten', w: 36 }, { ten: 'Loại', f: (r) => TT_NHOM[r.ttn] || r.ttn, w: 12 }, { ten: 'Đơn', k: 'don', kieu: 'so' }], dong: lyDo },
    { ten: 'Khu vực', ghiChu: ghi, cot: [{ ten: 'Tỉnh / thành', k: 'ten', w: 22 }, { ten: 'Đơn', k: 'don', kieu: 'so' }, { ten: 'Doanh số', k: 'dt', w: 15, kieu: 'tien' }, { ten: 'Đơn hoàn', k: 'hoan', kieu: 'so' }], dong: bc.tinh || [] },
    { ten: 'Nhân viên', ghiChu: ghi + ' · đơn Web / Facebook / Zalo / Admin', cot: [{ ten: 'Nhân viên', k: 'ten', w: 26 }, { ten: 'Đơn', k: 'don', kieu: 'so' }, { ten: 'SL', k: 'sl', kieu: 'so' },
      { ten: 'Doanh số', k: 'dt', w: 15, kieu: 'tien' }, { ten: 'Hoàn', k: 'hoan', kieu: 'so' }, { ten: 'Huỷ', k: 'huy', kieu: 'so' }, { ten: 'Kênh', k: 'kenh', w: 30 }], dong: bc.nv || [] },
    { ten: 'Theo giờ', ghiChu: ghi, cot: [{ ten: 'Giờ', f: (r) => `${r.g}h–${r.g + 1}h`, w: 10 }, { ten: 'Đơn', k: 'don', kieu: 'so' }, { ten: 'Doanh số', k: 'dt', w: 15, kieu: 'tien' }], dong: bc.gio || [] },
    { ten: 'Đơn hàng', ghiChu: ghi + ' · 1 dòng / đơn', cot: [{ ten: 'Ngày giờ đặt', w: 16 }, { ten: 'Mã đơn Nhanh', w: 13 }, { ten: 'Mã đơn sàn', w: 20 }, { ten: 'Kênh', w: 13 },
      { ten: 'Gian hàng', w: 26 }, { ten: 'Trạng thái', w: 14 }, { ten: 'Nhóm trạng thái', w: 13 }, { ten: 'Số dòng hàng', w: 8, kieu: 'so' }, { ten: 'SL', w: 6, kieu: 'so' }, { ten: 'Doanh số', w: 13, kieu: 'tien' },
      { ten: 'Hãng vận chuyển', w: 18 }, { ten: 'Mã vận đơn', w: 18 }, { ten: 'Tỉnh / thành', w: 16 }, { ten: 'Nhân viên', w: 20 }, { ten: 'SĐT khách', w: 13 }, { ten: 'Phí sàn', w: 11, kieu: 'tien' },
      { ten: 'Phí ship', w: 11, kieu: 'tien' }, { ten: 'Nguồn số liệu', w: 10 }], dong: [...don.values()].map((r) => { r[6] = TT_NHOM[r[6]] || r[6]; return r; }) },
    { ten: 'Chi tiết dòng hàng', ghiChu: ghi + ' · 1 dòng / sản phẩm trong đơn', cot: COT_DONG_ONLINE,
      dong: dong.map((r) => { const x = [...r]; x[6] = TT_NHOM[x[6]] || x[6]; x[10] = NGANH[x[10]] || x[10]; x[11] = CS[x[11]] || x[11]; return x; }) },
  ];
}

