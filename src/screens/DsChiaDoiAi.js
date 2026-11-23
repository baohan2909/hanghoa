// ============================================================================
// NEW - 3.127 SIÊU TRÍ TUỆ · cầu nối màn "Chia từng đội"
//   chuanBi : chọn đội -> đặt tham số -> chọn thùng (công thức Gợi ý thùng) -> điền Gợi ý -> áp ràng buộc
//             -> kiểm tra -> tạo PHIẾU CHỜ DUYỆT (fn_ai_thao_tac_tao). Không xác nhận, không ghi tồn.
//   thucHien: người dùng đã bấm Duyệt -> so dấu vân nháp -> xacNhan({tuDong}) của chính màn (Odoo tự gửi nếu tài khoản bật).
//   doc / nguCanh: tóm tắt bàn chia cho AI kiểm tra.
// ============================================================================
import { useEffect, useRef } from 'react';
import { sb } from '../lib/supabase.js';
import { dangKyCau, cho } from '../lib/sttCau.js';
import { tenNgan } from './dsChung.jsx';
import { timDoi, ghepTheoKhoang, apRangBuoc, dauVan, tomBan } from './dsAiChiaDoi.js';

const kep = (v, a, b) => (v == null || v === '' || !Number.isFinite(+v) ? null : Math.max(a, Math.min(b, Math.round(+v))));
const giongSua = (a, b) => {
  const ka = Object.keys(a || {}).filter((k) => a[k] > 0), kb = Object.keys(b || {}).filter((k) => b[k] > 0);
  return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
};
const giongDs = (a, b) => (a || []).length === (b || []).length && (a || []).every((x) => (b || []).includes(x));

function tomRangBuoc(p) {
  const r = [];
  if (p.chia_du_ngay) r.push(`Chia đủ ${p.chia_du_ngay} ngày`);
  if (p.suc_ban_ngay) r.push(`Sức bán ${p.suc_ban_ngay} ngày`);
  if (p.ty_le) r.push(`Tỷ lệ ${p.ty_le}%`);
  if (p.thung) r.push(`${p.thung.so_min ?? p.thung.so_max}–${p.thung.so_max ?? p.thung.so_min} thùng`);
  if (p.ma_thung?.length) r.push(`Thùng: ${p.ma_thung.join(', ')}`);
  if (p.bo_thung) r.push('Không dùng thùng');
  if (p.tran_ton_sau) r.push(`Tồn sau ≤ ${p.tran_ton_sau}`);
  if (p.tran_giao) r.push(`Giao ≤ ${p.tran_giao}`);
  if (p.toi_da_moi_ma) r.push(`Tối đa ${p.toi_da_moi_ma}/mã`);
  if (p.uu_tien?.length) r.push(`Ưu tiên: ${p.uu_tien.join(', ')}`);
  if (p.chi_ma?.length) r.push(`Chỉ mã: ${p.chi_ma.join(', ')}`);
  if (p.loai_bo?.length) r.push(`Loại: ${p.loai_bo.join(', ')}`);
  if (p.bo_du_qua_ngay) r.push(`Bỏ mã đủ > ${p.bo_du_qua_ngay} ngày`);
  if (p.nguon && p.nguon !== 'tat') r.push(p.nguon === 'pk' ? 'Chỉ phụ kiện' : 'Chỉ hàng sale');
  return r;
}

export function useCauChiaDoi(s) {
  const ref = useRef(s);
  ref.current = s;
  useEffect(() => dangKyCau('chia_doi', {
    nguCanh: () => nguCanh(ref.current),
    doc: () => ({ ket_qua: docBan(ref.current) }),
    chuanBi: (p, bao, mo) => chuanBi(ref, p || {}, bao || (() => {}), mo || {}),
    thucHien: (tt, bao) => thucHien(ref, tt, bao || (() => {})),
  }), []);
}

function nguCanh(x) {
  const c = { man: 'Chia từng đội', ds_doi: x.dsDoi.slice(0, 60).map((d) => `${d.ma_ch}=${tenNgan(d.ten)}`).join('; ') };
  if (!x.doi) return { ...c, doi: null };
  return { ...c, doi: x.doi, ten_doi: x.tenDoi, tham_so: { suc_ban_ngay: x.cuaSo, chia_du_ngay: x.mucTieu, ty_le: x.heSo },
    nhap: { thung: x.thung, so_ma_chia_them: Object.values(x.sua || {}).filter((v) => v > 0).length, tong_nhan: x.tong?.nhan } };
}
function docBan(x) {
  if (!x.doi || !x.kq) return { ok: true, doi: null, ghi_chu: 'Chưa chọn đội trên màn Chia từng đội' };
  return { ok: true, ...tomBan({ ...x, gyDs: x.gy?.kq?.ds }) };
}

async function choTai(ref, maDoi) {
  return cho(() => {
    const x = ref.current;
    return x.doi === maDoi && x.kq && x.kq._doi === maDoi && x.kq._cs === x.cuaSo && !x.dang && x.napXong();
  }, 30000);
}

async function chuanBi(ref, p, bao, mo) {
  const S = () => ref.current;
  const buoc = [];
  let t = performance.now();
  const xong = (nhan, ct) => { const n = performance.now(); buoc.push({ nhan, ms: Math.round(n - t), ...(ct ? { ct } : {}) }); t = n; };
  const hong = (loi) => ({ loi, ket_qua: { ok: false, loi }, buoc });

  // 1. đội
  bao(0.04, 'Tìm đội');
  await cho(() => S().dsDoi.length > 0, 8000);
  const d = timDoi(S().dsDoi, p.doi);
  if (!d) return { ...hong(`Không thấy đội "${p.doi}"`), ket_qua: { ok: false, loi: `Không thấy đội "${p.doi}"`, cac_doi: S().dsDoi.slice(0, 60).map((x) => x.ma_ch) } };
  const ten = tenNgan(d.ten) || d.ma_ch;
  const cs = kep(p.suc_ban_ngay, 1, 180), mt = kep(p.chia_du_ngay, 1, 180), hs = kep(p.ty_le, 10, 300);
  if (S().doi !== d.ma_ch) S().setDoi(d.ma_ch);
  if (cs && cs !== S().cuaSo) S().setCuaSo(cs);
  if (mt && mt !== S().mucTieu) S().setMucTieu(mt);
  if (hs && hs !== S().heSo) S().setHeSo(hs);
  xong(`Chọn ${ten}` + [cs && `sức bán ${cs} ngày`, mt && `chia đủ ${mt} ngày`, hs && `tỷ lệ ${hs}%`].filter(Boolean).map((v) => ' · ' + v).join(''));

  // 2. số liệu đội (fn_ds_chia_doi) + nháp
  bao(0.1, `Tải sức bán, tồn, kho của ${ten}`);
  if (!(await choTai(ref, d.ma_ch))) return hong('Tải số liệu đội quá lâu — anh thử lại giúp em');
  if (mt) await cho(() => S().mucTieu === mt, 2000);
  if (hs) await cho(() => S().heSo === hs, 2000);
  xong(`Tải số liệu ${ten}: ${S().kq.rows?.length || 0} mã, sức bán ${S().cuaSo} ngày`);

  // 3. thùng
  let thungMoi = S().thung;
  let ghep = null, gyDs = S().gy?.kq?.ds || null;
  if (p.bo_thung) { thungMoi = []; xong('Bỏ toàn bộ thùng'); }
  else if (Array.isArray(p.ma_thung) && p.ma_thung.length) { thungMoi = [...new Set(p.ma_thung.map((x) => String(x).trim()).filter(Boolean))]; xong(`Dùng thùng chỉ định: ${thungMoi.join(', ')}`); }
  else if (p.thung && (p.thung.so_min != null || p.thung.so_max != null)) {
    const a = kep(p.thung.so_min ?? p.thung.so_max, 0, 30), b = kep(p.thung.so_max ?? p.thung.so_min, 0, 30);
    bao(0.25, `Chấm điểm thùng sẵn sàng theo nhu cầu ${ten}`);
    const goi = () => sb.rpc('fn_ds_thung_goi_y', { p_doi: d.ma_ch, p_cua_so: S().cuaSo, p_muc_tieu: S().mucTieu, p_he_so: S().heSo,
      p_sap_het: S().sapHet, p_nguoi: S().nguoi || null, p_thung: [], p_sua: {}, p_top: 40 });
    let { data, error } = await goi();
    if (error && (error.code === '57014' || /timeout/i.test(error.message || ''))) ({ data, error } = await goi());
    if (error || data?.loi) return hong('Gợi ý thùng lỗi: ' + (error?.message || data?.loi));
    // thùng đang giữ cho chính đội này (nháp cũ) cũng là ứng viên — tính lại từ đầu
    const ds = (data?.ds || []).map((x) => (x.st === 'cho_xn' ? { ...x, st: 'de_xuat' } : x));
    gyDs = ds;
    // trần tồn sau / trần giao là ràng buộc CỨNG, số thùng là "tầm" -> không thêm thùng làm vượt trần
    const coSa = S().dong.filter((y) => !y.pk).reduce((q, y) => q + Math.max(0, y.co), 0);
    let tranCai = Infinity;
    if (p.tran_ton_sau > 0) tranCai = Math.min(tranCai, p.tran_ton_sau - coSa);
    if (p.tran_giao > 0) tranCai = Math.min(tranCai, p.tran_giao);
    ghep = ghepTheoKhoang(ds, Math.min(a, b), Math.max(a, b), Math.max(0, tranCai));
    ghep.tranCai = tranCai;
    thungMoi = ghep.bo.map((x) => x.b.t);
    xong(`Ghép ${thungMoi.length} thùng (khoảng ${Math.min(a, b)}–${Math.max(a, b)}) theo công thức Gợi ý thùng: lấp ${ghep.lap}/${ghep.cai} cái nhu cầu`
      + (ghep.noi ? ` · ${ghep.noi} thùng nới ngưỡng để đủ số tối thiểu` : ''), { thung: ghep.bo.map((x) => [x.b.t, x.b.n, x.lap, x.b.diem]) });
  }
  if (!giongDs(thungMoi, S().thung)) {
    bao(0.45, 'Đưa thùng vào bàn chia, đọc ruột thùng');
    S().datNhap((n) => ({ ...n, thung: thungMoi }));
  }
  const okThung = await cho(() => giongDs(S().thung, thungMoi) && thungMoi.every((x) => S().thungCt[x]), 15000);
  if (!okThung) return hong('Chưa đọc được ruột thùng — anh thử lại giúp em');
  const thungLoi = thungMoi.filter((x) => { const c = S().thungCt[x]; return c.khong_co || c.da_giao || c.kiem; });

  // 4. điền Gợi ý + ràng buộc
  bao(0.62, 'Điền số đề nghị (làm tròn theo giá sale, không vượt kho) và áp ràng buộc');
  const r = apRangBuoc(S().dong, p, S().trongThung.tong);
  const suaMoi = {};
  Object.entries(S().sua || {}).forEach(([bc, v]) => { if (!r.trongPhamVi.has(bc) && v > 0) suaMoi[bc] = v; });
  Object.assign(suaMoi, r.sua);
  S().datNhap((n) => ({ ...n, thung: thungMoi, sua: suaMoi }));
  await cho(() => giongSua(S().sua, suaMoi), 4000);
  xong(`Điền ${Object.keys(r.sua).length} mã chia thêm` + (r.ghi.length ? ' · ' + r.ghi.join(' · ') : ''), r.cat.length ? { cat: r.cat } : null);

  // 5. kiểm tra
  bao(0.8, 'Kiểm tra: vượt kho, dòng cảnh báo, mã thu hồi, trần tồn');
  const x = S();
  const tom = tomBan({ ...x, gyDs });
  const canh = [];
  if (x.tong.vuot) canh.push(`${x.tong.vuot} mã vượt kho`);
  if (thungLoi.length) canh.push(`Thùng không dùng được: ${thungLoi.join(', ')}`);
  if (r.tranCanh) canh.push(r.tranCanh);
  if (!r.tranCanh && p.tran_ton_sau && tom.sau.ton > p.tran_ton_sau) canh.push(`Tồn sau ${tom.sau.ton} vẫn vượt trần ${p.tran_ton_sau}${tom.chia.thung ? ' (do thùng)' : ''}`);
  if (!r.tranCanh && p.tran_giao && tom.chia.tong > p.tran_giao) canh.push(`Tổng giao ${tom.chia.tong} vẫn vượt trần ${p.tran_giao}${tom.chia.thung ? ' (do thùng)' : ''}`);
  if (ghep && ghep.bo.length < (p.thung.so_min ?? 0)) {
    canh.push(ghep.chanTran || ghep.tranCai <= 0
      ? `Chỉ lấy ${ghep.bo.length} thùng (yêu cầu ${p.thung.so_min}–${p.thung.so_max}) để không vượt trần ${p.tran_ton_sau ? 'tồn sau ' + p.tran_ton_sau : 'giao ' + p.tran_giao}`
      : `Chỉ ghép được ${ghep.bo.length} thùng phù hợp (ít hơn ${p.thung.so_min})`);
  }
  xong(`Kiểm tra xong: ${x.tong.canh} dòng cần xem${canh.length ? ' · ' + canh.join(' · ') : ' · không vượt kho'}`);

  // 6. phiếu chờ duyệt
  const dv = dauVan(d.ma_ch, thungMoi, suaMoi);
  const the = { loai: 'chia_doi', ...tom, rang_buoc: tomRangBuoc(p), ghi: r.ghi, cat: r.cat, canh,
    ghep: ghep ? { so: ghep.bo.length, lap: ghep.lap, cai: ghep.cai, noi: ghep.noi } : null, dau_van: dv, luc: new Date().toISOString() };
  const coViec = tom.chia.tong > 0;
  if (coViec && !x.tong.vuot) {
    bao(0.92, 'Tạo phiếu chờ duyệt');
    const { data: tt, error } = await sb.rpc('fn_ai_thao_tac_tao', { p_token: x.user?.token, p_viec: mo.viec_id || null, p_loai: 'xac_nhan_chia_doi',
      p_mo_ta: `Xác nhận chia ${ten}: ${tom.chia.tong} cái (sale ${tom.chia.sale} · phụ kiện ${tom.chia.phu_kien} · thùng ${tom.chia.thung})`,
      p_xem_truoc: the, p_dau_van: dv });
    if (error) return hong('Chưa tạo được phiếu chờ duyệt: ' + error.message);
    the.thao_tac_id = tt?.id;
    xong('Tạo phiếu chờ duyệt — chờ anh bấm Duyệt & thực hiện');
  } else xong(coViec ? 'Chưa tạo phiếu duyệt vì còn mã vượt kho' : 'Không có số nào để chia — không tạo phiếu');
  bao(1, 'Xong phần màn hình');
  return {
    the, buoc,
    ket_qua: { ok: true, ...tom, rang_buoc_da_ap: the.rang_buoc, ghi_chu_ap: r.ghi, cat_bot_nhieu_nhat: r.cat, canh_bao: canh,
      thung_ghep: ghep ? ghep.bo.map((y) => ({ ma: y.b.t, cai: y.b.n, lap: y.lap, diem: y.b.diem })) : undefined,
      phieu_cho_duyet: the.thao_tac_id ? 'đã tạo — chờ người dùng bấm Duyệt' : 'không tạo' },
  };
}

async function thucHien(ref, tt, bao) {
  const S = () => ref.current;
  const x0 = tt.xem_truoc || {};
  bao(0.1, 'Mở đúng đội trên bàn chia');
  if (S().doi !== x0.doi) S().setDoi(x0.doi);
  if (x0.tham_so?.suc_ban_ngay && S().cuaSo !== x0.tham_so.suc_ban_ngay) S().setCuaSo(x0.tham_so.suc_ban_ngay);
  if (!(await choTai(ref, x0.doi))) return { ok: false, loi: 'Không mở được bàn chia của đội' };
  await cho(() => (S().thung || []).every((t) => S().thungCt[t]), 10000);
  bao(0.3, 'So nháp với phương án đã duyệt');
  if (dauVan(S().doi, S().thung, S().sua) !== tt.dau_van) {
    return { ok: false, loi: 'Nháp trên bàn chia đã thay đổi sau khi SIÊU TRÍ TUỆ chuẩn bị — không thực hiện. Anh giao lại hoặc xác nhận tay.' };
  }
  bao(0.5, 'Xác nhận phiếu chia (giữ tồn)');
  const o = S().odooCfg;
  return S().xacNhan({ tuDong: true, odoo: !!(o?.cho_phep && o?.kem !== false) });
}
