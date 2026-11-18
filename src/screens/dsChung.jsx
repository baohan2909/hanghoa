import { useCallback, useEffect, useRef, useState } from 'react';
import { sb } from '../lib/supabase.js';

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

// Xuất Excel từ phiếu đã xác nhận (khuôn nhập Odoo như Yêu cầu ĐP)
export async function xuatPhieu(id, maPhieu) {
  const { data, error } = await sb.rpc('fn_ds_phieu_ct', { p_id: id });
  if (error) throw error;
  const XLSX = await import('xlsx');
  if (data?.[0]?.nguon === 'TK') return xuatPhieuThung(XLSX, data, maPhieu);
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
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dong), 'DieuChuyen');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Object.values(doi)), 'TongHopDoi');
  XLSX.writeFile(wb, `${maPhieu}.xlsx`);
  return dong.length;
}

// File HÀNG ĐÓNG THÙNG: kho chuyển trên phiếu = SA, hàng thực lấy ở TK05005 (kho tự chuyển TK -> SA trước khi xuất)
//   Sheet 1 "DieuChuyen" : bảng phẳng (giữ khuôn nhập Odoo), cột Mã thùng đứng đầu
//   Sheet 2 "PhieuThung" : bản cho kho đọc — đầu phiếu (đội, tổng thùng, tổng SL, danh sách thùng) + từng thùng có dòng cộng
export const NHAN_DIEN = { ton_kho: 'Có trong dữ liệu tồn kho', danh_muc: 'Chỉ có trong DATA SẢN PHẨM', chua_co: 'Chưa nhận diện' };
export function xuatPhieuThung(XLSX, data, maPhieu) {
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
    [],
    ['STT', 'Mã thùng', 'Mã tham chiếu', 'Barcode', 'Sản phẩm', 'Số lượng', 'Ghi chú'],
  ];
  const gop = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
  for (let i = 1; i <= 5; i++) gop.push({ s: { r: i, c: 1 }, e: { r: i, c: 6 } });
  let stt = 0;
  theoThung.forEach((t, i) => {
    gop.push({ s: { r: aoa.length, c: 0 }, e: { r: aoa.length, c: 6 } });
    aoa.push([`THÙNG ${i + 1}/${soThung} — ${t.ma} — ${t.sl} sản phẩm · ${t.dong.length} mã`]);
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

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, 'DieuChuyen');
  XLSX.utils.book_append_sheet(wb, ws2, 'PhieuThung');
  XLSX.writeFile(wb, `${maPhieu}.xlsx`);
  return dong.length;
}
// Xuất đủ file của 1 lần xác nhận — mỗi nguồn 1 file riêng: Sale (SA) → Phụ kiện (PK05001) → Thùng (TK05005)
export async function xuatCacFile(kq) {
  const ds = [[kq.id, kq.ma_phieu], [kq.id_pk, kq.ma_phieu_pk], [kq.id_thung, kq.ma_phieu_thung]].filter(([id]) => id);
  for (let i = 0; i < ds.length; i++) {
    if (i) await new Promise((r) => setTimeout(r, 600));
    await xuatPhieu(ds[i][0], ds[i][1]);
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

