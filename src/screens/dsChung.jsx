import { useCallback, useEffect, useRef, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { IcDown, IcGuiLen } from '../lib/icons.jsx';
import { useApp } from '../App.jsx';
import { useOdooCfg, moOdoo, gomDon, odooTheoNguon } from '../lib/odoo.js';

// Dùng chung cho Chia hàng đội sale + Kho thùng (tách từ DsChiaHang v3.103.0)
export const fmtN = (n) => (n == null || n === '' ? '—' : Number(n).toLocaleString('vi'));
export const tenNgan = (t) => (t || '').replace(/^Đội SALE\s*/i, 'Đội ');
export const KHO_TEN = { SA05001: 'Kho Sale Bảo Hiểm Offline', SA05002: 'Kho Sale Nón vải', PK05001: 'Kho phụ kiện' };
export const gio = (s) => (s ? new Date(s).toLocaleTimeString('vi', { hour: '2-digit', minute: '2-digit' }) : '');
export const ngayGio = (s) => (s ? new Date(s).toLocaleString('vi', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—');
export const lsGet = (k) => { try { return JSON.parse(localStorage.getItem('dsch.' + k) || 'null'); } catch { return null; } };
export const lsSet = (k, v) => { try { localStorage.setItem('dsch.' + k, JSON.stringify(v)); } catch { /* bỏ qua */ } };
export const lsDel = (k) => { try { localStorage.removeItem('dsch.' + k); } catch { /* bỏ qua */ } };
export const so = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : 0; };

// ---------------------------------------------------------------------------
// Tự lưu bản nháp: máy (ngay lập tức) + máy chủ (sau 1,2 giây ngừng gõ)
// ---------------------------------------------------------------------------
export function useNhap(nguoi, khoa, macDinh) {
  const [dl, setDl] = useState(() => lsGet(khoa)?.du_lieu || macDinh);
  const [tt, setTt] = useState({ trang: 'yen', luc: lsGet(khoa)?.luc || null });
  const hen = useRef(null);
  const khoaRef = useRef(khoa);

  // đổi khoá (đổi đội): nạp nháp của khoá mới — máy chủ thắng nếu mới hơn
  useEffect(() => {
    khoaRef.current = khoa;
    const may = lsGet(khoa);
    setDl(may?.du_lieu || macDinh);
    setTt({ trang: 'yen', luc: may?.luc || null });
    let huy = false;
    sb.rpc('fn_ds_nhap_lay', { p_nguoi: nguoi }).then(({ data }) => {
      if (huy || !data?.[khoa]) return;
      const chu = data[khoa];
      if (!may?.luc || new Date(chu.cap_nhat) > new Date(may.luc)) {
        setDl(chu.du_lieu); lsSet(khoa, { du_lieu: chu.du_lieu, luc: chu.cap_nhat });
        setTt({ trang: 'da_luu', luc: chu.cap_nhat });
      }
    });
    return () => { huy = true; };
  }, [khoa]);   // eslint-disable-line

  const dat = useCallback((fn) => {
    setDl((cu) => {
      const moi = typeof fn === 'function' ? fn(cu) : fn;
      const k = khoaRef.current, luc = new Date().toISOString();
      lsSet(k, { du_lieu: moi, luc });
      setTt({ trang: 'dang_luu', luc });
      clearTimeout(hen.current);
      hen.current = setTimeout(async () => {
        const { data, error } = await sb.rpc('fn_ds_nhap_luu', { p_nguoi: nguoi, p_khoa: k, p_du_lieu: moi });
        setTt(error ? { trang: 'loi', luc } : { trang: 'da_luu', luc: data || luc });
      }, 1200);
      return moi;
    });
  }, [nguoi]);

  const xoa = useCallback(async () => {
    clearTimeout(hen.current);
    lsDel(khoaRef.current);
    setDl(macDinh); setTt({ trang: 'yen', luc: null });
    await sb.rpc('fn_ds_nhap_xoa', { p_nguoi: nguoi, p_khoa: khoaRef.current });
  }, [nguoi]);   // eslint-disable-line
  return [dl, dat, tt, xoa];
}

export function TrangThaiLuu({ tt }) {
  if (tt.trang === 'dang_luu') return <span className="ch-luu dang">● Đang lưu…</span>;
  if (tt.trang === 'loi') return <span className="ch-luu loi" title="Số vẫn giữ trên máy này; có mạng sẽ lưu lại">● Chưa lưu lên máy chủ — vẫn giữ trên máy</span>;
  if (tt.luc) return <span className="ch-luu ok">✓ Đã lưu {gio(tt.luc)}</span>;
  return <span className="ch-luu">Tự lưu khi nhập</span>;
}

// Ghi chú file xuất (v3.112.0): ghi vào Ô TRỐNG ĐẦU TIÊN của dòng 1, ngay sau cột tiêu đề cuối —
// không ghi đè ô nào, không dời cột, không thêm dòng -> khuôn nhập Odoo giữ nguyên (cột thừa bỏ qua khi nhập)
export function ghiDong1(XLSX, ws, ghiChu) {
  const t = String(ghiChu || '').trim();
  if (!ws || !t) return null;
  const r = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
  const c = r.e.c + 1;   // cột đầu tiên còn trống hoàn toàn (sau mọi cột có dữ liệu — không chen vào giữa bảng)
  const o = XLSX.utils.encode_cell({ r: 0, c });
  ws[o] = { t: 's', v: t };
  r.e.c = c; ws['!ref'] = XLSX.utils.encode_range(r);
  ws['!cols'] = ws['!cols'] || [];
  ws['!cols'][c] = { wch: Math.min(60, Math.max(18, t.length + 2)) };
  return o;
}

// Xuất Excel từ phiếu đã xác nhận (khuôn nhập Odoo như Yêu cầu ĐP)
export async function xuatPhieu(id, maPhieu, ghiChu) {
  const { data, error } = await sb.rpc('fn_ds_phieu_ct', { p_id: id });
  if (error) throw error;
  const XLSX = await import('xlsx');
  if (data?.[0]?.nguon === 'TK') return xuatPhieuThung(XLSX, data, maPhieu, ghiChu);
  const dong = (data || []).map((r) => ({
    'Kho chuyển': r.tu_kho, 'Tên kho chuyển': KHO_TEN[r.tu_kho] || r.tu_kho,
    'Cửa hàng nhận': r.ma_ch, 'Tên cửa hàng nhận': r.ten_ch,
    Barcode: r.barcode, 'Mã tham chiếu': r.ma_tham_chieu || '', 'Sản phẩm': r.nganh_3 || '',
    'Số lượng': r.sl, 'Ghi chú': maPhieu + (r.sl_thung ? ` · thùng ${r.thung || ''} (${r.sl_thung})` : ''),
  }));
  const doi = {};
  (data || []).forEach((r) => {
    const x = (doi[r.ma_ch] = doi[r.ma_ch] || { 'Đội': r.ma_ch, 'Tên đội': r.ten_ch, 'Số mã': 0, 'Trong thùng': 0, 'Chia thêm': 0, 'Tổng': 0 });
    x['Số mã'] += 1; x['Trong thùng'] += r.sl_thung; x['Chia thêm'] += r.sl - r.sl_thung; x['Tổng'] += r.sl;
  });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(dong);
  ghiDong1(XLSX, ws, ghiChu);
  XLSX.utils.book_append_sheet(wb, ws, 'DieuChuyen');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Object.values(doi)), 'TongHopDoi');
  XLSX.writeFile(wb, `${maPhieu}.xlsx`);
  return dong.length;
}

// File HÀNG ĐÓNG THÙNG: kho chuyển trên phiếu = SA, hàng thực lấy ở TK05005 (kho tự chuyển TK -> SA trước khi xuất)
//   Sheet 1 "DieuChuyen" : bảng phẳng (giữ khuôn nhập Odoo), cột Mã thùng đứng đầu
//   Sheet 2 "PhieuThung" : bản cho kho đọc — đầu phiếu (đội, tổng thùng, tổng SL, danh sách thùng) + từng thùng có dòng cộng
export const NHAN_DIEN = { ton_kho: 'Có trong dữ liệu tồn kho', danh_muc: 'Chỉ có trong DATA SẢN PHẨM', chua_co: 'Chưa nhận diện' };
export const NHAN_RUT = 'RÚT KHỎI THÙNG (thu hồi đội sale): ';
export function tachRut(ghiChu) {
  const g = String(ghiChu || ''); const i = g.indexOf(NHAN_RUT);
  if (i < 0) return {};
  const m = {};
  g.slice(i + NHAN_RUT.length).split(' ; ').forEach((x) => { const j = x.indexOf(': '); if (j > 0) m[x.slice(0, j).trim()] = x.slice(j + 2).trim(); });
  return m;
}
export function xuatPhieuThung(XLSX, data, maPhieu, ghiChu) {
  const rut = tachRut(ghiChu);   // v3.113.0: mã thu hồi đội sale đã rút khỏi từng thùng
  const theoThung = [];
  const idx = {};
  data.forEach((r) => {
    const k = r.thung || '(không mã thùng)';
    if (!(k in idx)) { idx[k] = theoThung.length; theoThung.push({ ma: k, dong: [], sl: 0 }); }
    const t = theoThung[idx[k]]; t.dong.push(r); t.sl += r.sl;
  });
  const tong = theoThung.reduce((a, t) => a + t.sl, 0);
  const soThung = theoThung.length;
  const doiTen = [...new Set(data.map((r) => `${r.ten_ch || r.ma_ch} (${r.ma_ch})`))].join(', ');
  const khoGiay = [...new Set(data.map((r) => r.tu_kho))].map((k) => `${k} ${KHO_TEN[k] || ''}`.trim()).join(', ');

  // Sheet 1: phẳng
  const dong = [];
  theoThung.forEach((t) => t.dong.forEach((r) => dong.push({
    'Mã thùng': t.ma, 'Kho chuyển': r.tu_kho, 'Tên kho chuyển': KHO_TEN[r.tu_kho] || r.tu_kho,
    'Cửa hàng nhận': r.ma_ch, 'Tên cửa hàng nhận': r.ten_ch,
    Barcode: r.barcode || '', 'Mã tham chiếu': r.ma_tham_chieu || '', 'Sản phẩm': r.ten || r.nganh_3 || '',
    'Số lượng': r.sl, 'Kho lấy hàng thực tế': 'TK05005', 'Nhận diện mã': NHAN_DIEN[r.nhan_dien] || '',
    'Ghi chú': `${maPhieu} · thùng ${t.ma} · chuyển TK05005 → ${r.tu_kho} trước khi xuất`
      + (r.nhan_dien === 'chua_co' ? ' · MÃ CHƯA NHẬN DIỆN — kho kiểm & chỉnh mã khi xuất' : ''),
  })));

  // Sheet 2: phiếu đọc nhanh theo thùng
  const aoa = [
    [`PHIẾU CẤP HÀNG ĐÓNG THÙNG — ${maPhieu}`],
    ['Đội nhận', doiTen],
    ['Tổng cộng', `${soThung} thùng – ${tong} sản phẩm`],
    ['Danh sách thùng', theoThung.map((t) => `${t.ma} (${t.sl})`).join(', ')],
    ['Kho trên phiếu', `${khoGiay} · hàng lấy ở TK05005 — chuyển TK05005 → SA trước khi xuất`],
    ['Ngày xuất file', new Date().toLocaleString('vi')],
    ...(Object.keys(rut).length ? [['⚠ RÚT KHỎI THÙNG', `Thu hồi đội sale — KHÔNG giao: ${Object.entries(rut).map(([t, v]) => `${t}: ${v}`).join(' ; ')}`]] : []),
    [],
    ['STT', 'Mã thùng', 'Mã tham chiếu', 'Barcode', 'Sản phẩm', 'Số lượng', 'Ghi chú'],
  ];
  const gop = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
  for (let i = 1; i <= (Object.keys(rut).length ? 6 : 5); i++) gop.push({ s: { r: i, c: 1 }, e: { r: i, c: 6 } });
  let stt = 0;
  theoThung.forEach((t, i) => {
    gop.push({ s: { r: aoa.length, c: 0 }, e: { r: aoa.length, c: 6 } });
    aoa.push([`THÙNG ${i + 1}/${soThung} — ${t.ma} — ${t.sl} sản phẩm · ${t.dong.length} mã`]);
    if (rut[t.ma]) {
      gop.push({ s: { r: aoa.length, c: 0 }, e: { r: aoa.length, c: 6 } });
      aoa.push([`⚠ RÚT RA KHỎI THÙNG (thu hồi đội sale, không giao): ${rut[t.ma]}`]);
    }
    t.dong.forEach((r) => aoa.push([++stt, t.ma, r.ma_tham_chieu || '', r.barcode || '', r.ten || r.nganh_3 || '', r.sl,
      r.nhan_dien === 'chua_co' ? 'Mã chưa nhận diện — kho kiểm' : '']));
    aoa.push(['', '', '', '', `Cộng thùng ${t.ma}`, t.sl, '']);
    aoa.push([]);
  });
  aoa.push(['', `TỔNG: ${soThung} thùng`, '', '', '', tong, '']);
  const ws2 = XLSX.utils.aoa_to_sheet(aoa);
  ws2['!merges'] = gop;
  ws2['!cols'] = [{ wch: 6 }, { wch: 18 }, { wch: 24 }, { wch: 16 }, { wch: 34 }, { wch: 10 }, { wch: 28 }];
  const ws1 = XLSX.utils.json_to_sheet(dong);
  ws1['!cols'] = [{ wch: 16 }, { wch: 10 }, { wch: 26 }, { wch: 12 }, { wch: 18 }, { wch: 15 }, { wch: 22 }, { wch: 30 }, { wch: 9 }, { wch: 12 }, { wch: 22 }, { wch: 50 }];
  ghiDong1(XLSX, ws1, ghiChu);
  ghiDong1(XLSX, ws2, ghiChu);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, 'DieuChuyen');
  XLSX.utils.book_append_sheet(wb, ws2, 'PhieuThung');
  XLSX.writeFile(wb, `${maPhieu}.xlsx`);
  return dong.length;
}
// Xuất đủ file của 1 lần xác nhận — mỗi nguồn 1 file riêng: Sale (SA) → Phụ kiện (PK05001) → Thùng (TK05005)
export async function xuatCacFile(kq, ghiChu) {
  const ds = [[kq.id, kq.ma_phieu], [kq.id_pk, kq.ma_phieu_pk], [kq.id_thung, kq.ma_phieu_thung]].filter(([id]) => id);
  for (let i = 0; i < ds.length; i++) {
    if (i) await new Promise((r) => setTimeout(r, 600));
    // phiếu thùng: dùng ghi chú máy chủ trả về (đã kèm "RÚT KHỎI THÙNG …" nếu có)
    await xuatPhieu(ds[i][0], ds[i][1], ds[i][0] === kq.id_thung && kq.ghi_chu_thung != null ? kq.ghi_chu_thung : ghiChu);
  }
  return ds.length;
}
export const xuatHaiFile = xuatCacFile;
export const tenPhieu = (kq) => [kq.ma_phieu, kq.ma_phieu_pk, kq.ma_phieu_thung].filter(Boolean).join(' + ');
export const soFile = (kq) => [kq.id, kq.id_pk, kq.id_thung].filter(Boolean).length;

export function baoLoiXacNhan(kq, baoToast) {
  if (kq?.loi === 'vuot_ton') {
    baoToast(`Vượt tồn kho khả dụng ${kq.chi_tiet.length} mã: ` + kq.chi_tiet.slice(0, 4).map((x) => `${x.ma_tham_chieu}${x.nguon === 'PK' ? ' (kho phụ kiện)' : ''} cần ${x.can}/còn ${x.con}`).join(' · '));
  } else if (kq?.loi === 'thung_trung') {
    baoToast('Thùng đã giao cho phiếu khác: ' + kq.chi_tiet.map((x) => `${x.ma_thung} → ${tenNgan(x.ma_ch)} (${x.ma_phieu})`).join(' · '));
  } else if (kq?.loi === 'thung_can_kiem_tra') {
    baoToast('Thùng đang chờ kiểm tra (file nguồn lệch quy tắc) — sửa sheet hoặc bấm “Đã kiểm tra” ở Kho thùng: ' + kq.chi_tiet.join(', '));
  } else if (kq?.loi === 'thung_khong_co') {
    baoToast('Thùng không còn trong danh sách thùng đóng sẵn: ' + kq.chi_tiet.join(', '));
  } else if (kq?.loi === 'trong') baoToast('Chưa có số nào để xác nhận');
  else baoToast('Không xác nhận được: ' + (kq?.loi || 'lỗi lạ'));
}


// ---------------------------------------------------------------------------
// Hỏi ghi chú trước khi xuất file (v3.112.0) — const [hoiGhiChu, hopGhiChu] = useHoiGhiChu();
//   const g = await hoiGhiChu({ macDinh: 'Đội Sale 01 – ' }); if (g === null) return;   // null = huỷ, '' = không ghi chú
// ---------------------------------------------------------------------------
//   v3.114.0: hoiGhiChu({ ..., odoo: true }) -> tài khoản đang thử Odoo thấy ô "Đồng thời tạo đơn trên Odoo";
//   phần tử thứ 3 (ref) = true nếu người dùng chọn ô đó ở lần hỏi gần nhất.
export function useHoiGhiChu() {
  const { user } = useApp();
  const odoo = useOdooCfg(user);
  const [hoi, setHoi] = useState(null);
  const chonOdoo = useRef(false);
  const ask = useCallback((o = {}) => new Promise((resolve) => { chonOdoo.current = false; setHoi({ ...o, resolve }); }), []);
  const el = hoi ? <HopGhiChu key="gc" {...hoi} coOdoo={!!(hoi.odoo && odoo)}
    onXong={(v, od) => { chonOdoo.current = !!(od && v !== null); hoi.resolve(v); setHoi(null); }} /> : null;
  return [ask, el, chonOdoo];
}

// v3.114.0 — Tạo đơn Odoo từ phiếu đội sale đã xác nhận: mỗi (kho chuyển, đội) = 1 đơn,
//   tên DSC{ngày}-{kho}-{đội}-NN, tài liệu nguồn = mã phiếu, ghi chú = ghi chú phiếu (+ mã thùng với phiếu thùng)
//   token (gửi lại từ Phiếu đã chia): đơn đã có trên nhật ký Odoo thì DÙNG LẠI TÊN CŨ -> đơn đã tạo bị chặn, không tạo trùng
export async function odooTuPhieu(dsPhieu, tieuDe, onDong, token) {
  const don = []; let khongBc = 0;
  const cu = {};
  if (token) (await odooTheoNguon(token, dsPhieu.map((p) => p.ma_phieu))).forEach((d) => {
    const k = d.tai_lieu_nguon + '|' + d.kho_cung_ung + '>' + d.kho_yeu_cau;
    if (!cu[k] || d.trang_thai === 'thanh_cong') cu[k] = d;   // ưu tiên đơn đã tạo thành công
  });
  for (const p of dsPhieu) {
    const { data, error } = await sb.rpc('fn_ds_phieu_ct', { p_id: p.id });
    if (error) throw error;
    const rows = data || [];
    khongBc += rows.filter((r) => !r.barcode).length;
    const thung = rows[0]?.nguon === 'TK';
    const g = gomDon(rows.map((r) => ({ tu: r.tu_kho, den: r.ma_ch, den_ten: tenNgan(r.ten_ch), barcode: r.barcode || '', sl: r.sl,
      ma: r.ma_tham_chieu || r.barcode })), { prefix: 'DSC', tai_lieu_nguon: p.ma_phieu });
    g.forEach((d) => {
      const tg = thung ? [...new Set(rows.filter((r) => r.ma_ch === d.kho_yeu_cau && r.thung).map((r) => r.thung))] : [];
      d.ghi_chu = [p.ghi_chu, tg.length ? `Thùng: ${tg.join(', ')}` : ''].map((x) => String(x || '').trim()).filter(Boolean).join(' | ');
      const c = cu[p.ma_phieu + '|' + d.kho_cung_ung + '>' + d.kho_yeu_cau];
      if (c) { d.name = c.name; d._tt = { trang_thai: c.trang_thai, loi: c.loi || '' }; }
    });
    don.push(...g);
  }
  if (!don.length) throw new Error('Phiếu không có dòng nào để tạo đơn');
  moOdoo({ tieuDe, man: 'doi_sale', lyDo: 'doi_sale', don, onDong,
    canh: khongBc ? [`${khongBc} dòng chưa có barcode (mã chưa nhận diện) — không gửi lên Odoo được, cần thêm tay`] : [] });
}
// Sau 1 lần xác nhận (kq của fn_ds_xac_nhan): gom đủ phiếu Sale + Phụ kiện + Thùng
export const odooTuKq = (kq, ghiChu) => odooTuPhieu([
  kq.id && { id: kq.id, ma_phieu: kq.ma_phieu, ghi_chu: ghiChu },
  kq.id_pk && { id: kq.id_pk, ma_phieu: kq.ma_phieu_pk, ghi_chu: ghiChu },
  kq.id_thung && { id: kq.id_thung, ma_phieu: kq.ma_phieu_thung, ghi_chu: kq.ghi_chu_thung != null ? kq.ghi_chu_thung : ghiChu },
].filter(Boolean), 'Đội sale — ' + tenPhieu(kq));
// Ghi chú mặc định theo đội: nhớ ghi chú lần trước của đội, chưa có thì "Đội Sale 01 – "
export const ghiChuMacDinh = (maDoi, tenDoi) => lsGet('ghi_chu.' + (maDoi || '-'))
  ?? `${String(tenDoi || maDoi || '').replace(/^Đội SALE/i, 'Đội Sale')} – `;
export const nhoGhiChu = (maDoi, v) => { if (maDoi) lsSet('ghi_chu.' + maDoi, v || ''); };

function HopGhiChu({ tieuDe, macDinh, phu, nutXong, coOdoo, onXong }) {
  const [v, setV] = useState(macDinh || '');
  const [od, setOd] = useState(() => !!lsGet('odoo_kem'));
  const kemOdoo = !!(coOdoo && od);
  const o = useRef(null);
  useEffect(() => { setTimeout(() => { const e = o.current; if (e) { e.focus(); const n = e.value.length; e.setSelectionRange(n, n); } }, 40); }, []);
  return (
    <div className="kt-modal gc-nen" onMouseDown={(e) => { if (e.target === e.currentTarget) onXong(null); }}>
      <div className="gc-hop" role="dialog" aria-label="Ghi chú file xuất">
        <div className="gc-dau">
          <div><b>{tieuDe || 'Ghi chú cho file xuất'}</b><small>Ghi vào ô trống đầu tiên của dòng 1 (sau cột tiêu đề cuối) — không đổi cột, không thêm dòng, file vẫn nhập Odoo được</small></div>
          <button className="kt-dong" onClick={() => onXong(null)}>×</button>
        </div>
        <input ref={o} className="gc-o" value={v} maxLength={200} placeholder="Vd: Đội Sale 01 – Lạc Long Quân (có thể để trống)"
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onXong(v.trim(), kemOdoo); } else if (e.key === 'Escape') onXong(null); }} />
        {phu && <div className="gc-phu">{phu}</div>}
        {coOdoo && (
          <label className={'gc-odoo' + (od ? ' on' : '')}>
            <input type="checkbox" checked={od} onChange={(e) => { setOd(e.target.checked); lsSet('odoo_kem', e.target.checked); }} />
            <IcGuiLen />
            <span><b>Đồng thời tạo đơn trên Odoo</b>
              <small>Xác nhận + xuất file xong sẽ mở hộp gửi Odoo — mỗi kho chuyển × đội = 1 đơn, xem lại rồi mới gửi</small></span>
          </label>
        )}
        <div className="gc-chan">
          <button className="btn btn-ghost" onClick={() => onXong(null)}>Huỷ</button>
          <button className="btn btn-ghost" onClick={() => onXong('', kemOdoo)} title="Xuất file không có ghi chú">Không ghi chú</button>
          <button className="btn btn-ai gc-xong" onClick={() => onXong(v.trim(), kemOdoo)}>{kemOdoo ? <IcGuiLen /> : <IcDown />} {nutXong || 'Xác nhận & xuất'}{kemOdoo ? ' + Odoo' : ''}</button>
        </div>
      </div>
    </div>
  );
}
