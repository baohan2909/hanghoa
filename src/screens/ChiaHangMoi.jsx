import { isoVN, Sel } from '../lib/ui.jsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { IcSplit, IcDown, IcSearch } from '../lib/icons.jsx';
import { useApp } from '../App.jsx';

// ===== CHIA HÀNG MỚI v2 — nhiều mã một lần · ngành cấp 3 HOẶC mã tham chiếu · xuất tất cả =====
function AnhMini({ url }) {
  const [loi, setLoi] = useState(false);
  if (!url || loi) return <div className="noimg" />;
  return <img src={url} alt="" onError={() => setLoi(true)} />;
}
let seq = 1;
const fmtN = (n) => (n == null ? '0' : Number(n).toLocaleString('vi'));
const dongMoi = () => ({ id: seq++, q: '', goiY: [], sp: null, nganh3: '',
  qTC: '', goiYTC: [], thamChieu: null, tong: '', ct: null, batchId: null, moRong: true,
  phamVi: null, chiaMin: '', chiaMax: '' });   // phamVi riêng; null = dùng phamViChung

export default function ChiaHangMoi() {
  const { user, baoToast, datBan } = useApp();
  const [dsNganh3, setDsNganh3] = useState([]);
  const [dong, setDong] = useState([dongMoi()]);
  const [busy, setBusy] = useState(false);
  const [khoMap, setKhoMap] = useState({});
  const [moDS, setMoDS] = useState(false);   // mở bảng đối soát tổng hợp
  const [kvCH, setKvCH] = useState({});      // ma_ch -> khu_vuc
  const [themCH, setThemCH] = useState([]);  // cửa hàng thêm tay vào bảng đối soát
  const [sortDS, setSortDS] = useState({ col: 'tong', dir: 'desc' });
  const [sortCt, setSortCt] = useState({ col: 'sl_de_xuat', dir: 'desc' });
  const dsCt = (c) => setSortCt((s) => ({ col: c, dir: s.col === c && s.dir === 'desc' ? 'asc' : 'desc' }));
  const icCt = (c) => sortCt.col === c ? <i className="sort-ic">{sortCt.dir === 'asc' ? '▲' : '▼'}</i> : null;
  const sapCt = (ct) => {
    const g = { cuahang: (r) => (tenCH[r.ma_ch] || r.ma_ch), khuvuc: (r) => (kvCH[r.ma_ch] || ''),
      ton_dang_co: (r) => r.ton_dang_co || 0, ty_le: (r) => r.ty_le || 0,
      sl_de_xuat: (r) => r.sl_de_xuat || 0, sl_chot: (r) => r.sl_chot || 0 }[sortCt.col];
    if (!g) return ct;
    return [...ct].sort((a, b) => { const x = g(a), y = g(b);
      const c = typeof x === 'string' ? x.localeCompare(y, 'vi') : x - y;
      return sortCt.dir === 'asc' ? c : -c; });
  };
  const [tc, setTc] = useState({ q: '', chon: null, goiY: [], sl: null });  // dòng tham chiếu
  const tcRef = useRef(null);
  const [tdCH, setTdCH] = useState({});   // ma_ch -> bán 30 ngày (cột tham chiếu)
  const timRef = useRef({});
  // Phạm vi CHUNG áp cho mọi mã (mã nào có phamVi riêng thì ghi đè)
  const [phamViChung, setPhamViChung] = useState({ loai: 'TAT_CA', giaTri: null, ds: null });
  const [nguonBan, setNguonBan] = useState('TRONG_PHAM_VI');   // mặc định chia HẾT tổng cho nhóm đã chọn | TOAN_HE = chỉ chia phần tỷ trọng toàn hệ
  const [moPV, setMoPV] = useState(null);   // đang mở bộ chọn phạm vi cho: 'chung' | id mã
  const [dsKhuVuc, setDsKhuVuc] = useState([]);
  const [dsNhom, setDsNhom] = useState([]);

  // Báo cho App biết đang chia dở -> không tự cập nhật phiên bản giữa chừng
  useEffect(() => {
    const co = dong.some((d) => d.sp || d.thamChieu || String(d.tong || '').trim() || d.ct);
    datBan?.('chiamoi', co);
    return () => datBan?.('chiamoi', false);
  }, [dong]);   // eslint-disable-line

  const [tenCH, setTenCH] = useState({});
  useEffect(() => {
    sb.from('cua_hang').select('ma_ch, ten, khu_vuc').or('ma_ch.like.CH%,ma_ch.like.DB%')
      .then(({ data }) => {
        setTenCH(Object.fromEntries((data || []).map((c) => [c.ma_ch, c.ten])));
        setKvCH(Object.fromEntries((data || []).map((c) => [c.ma_ch, c.khu_vuc])));
      });
    sb.rpc('fn_ds_nganh3')
      .then(({ data }) => setDsNganh3((data || []).map((x) => x.nganh_3)));
    sb.from('tham_so').select('gia_tri').eq('key', 'kho_tong_ma').eq('pham_vi', 'GLOBAL').single()
      .then(({ data }) => setKhoMap(data?.gia_tri || {}));
    sb.from('cua_hang').select('khu_vuc, nhom_ch').or('ma_ch.like.CH%,ma_ch.like.DB%')
      .then(({ data }) => {
        const kv = [...new Set((data || []).map((c) => c.khu_vuc).filter(Boolean))].sort();
        const nh = [...new Set((data || []).map((c) => c.nhom_ch).filter((x) => x != null))].sort((a, b) => a - b);
        setDsKhuVuc(kv); setDsNhom(nh);
      });
  }, []);

  const capNhat = (id, patch) => setDong((ds) => ds.map((d) => d.id === id ? { ...d, ...patch } : d));

  // Copy TOÀN BỘ cấu hình của 1 dòng đã chia -> dòng mới, CHỈ để trống MÃ HÀNG
  const copyNhom = (d) => {
    const moi = {
      ...dongMoi(),
      phamVi: d.phamVi,                       // phạm vi/nhóm cửa hàng
      chiaMin: d.chiaMin, chiaMax: d.chiaMax,  // min/max
      nganh3: d.nganh3,                        // ngành chia
      thamChieu: d.thamChieu, qTC: d.qTC,      // mã tham chiếu
      tong: d.tong,                            // GIỮ LUÔN số lượng
      // để trống: q, sp (mã hàng), ct, batchId -> chỉ cần nhập mã mới rồi Chia
    };
    setDong((ds) => {
      const i = ds.findIndex((x) => x.id === d.id);
      const out = [...ds]; out.splice(i + 1, 0, moi); return out;
    });
    baoToast('Đã copy toàn bộ cấu hình — chỉ cần nhập MÃ HÀNG mới rồi bấm Chia.');
  };

  // COPY KHUÔN: nhân bản NGUYÊN bảng chia (danh sách CH + số lượng) sang dòng mới,
  // KHÔNG chia lại — chỉ cần nhập mã hàng mới. Dùng khi nhiều mã chia y hệt nhau.
  const copyKhuon = (d) => {
    if (!d.ct || !d.ct.length) { baoToast('Dòng này chưa có bảng chia để làm khuôn'); return; }
    const moi = {
      ...dongMoi(),
      phamVi: d.phamVi, chiaMin: d.chiaMin, chiaMax: d.chiaMax, nganh3: d.nganh3,
      thamChieu: d.thamChieu, qTC: d.qTC, tong: d.tong,
      // GIỮ NGUYÊN bảng chia — clone ct với id mới, sl_chot y hệt; batchId=null (tạo khi xuất)
      ct: d.ct.map((r) => ({ ...r, id: 'khuon_' + (seq) + '_' + r.ma_ch, sl_de_xuat: r.sl_chot })),
      batchId: null, laKhuon: true, moRong: true,
      // để trống mã hàng: q, sp
    };
    setDong((ds) => {
      const i = ds.findIndex((x) => x.id === d.id);
      const out = [...ds]; out.splice(i + 1, 0, moi); return out;
    });
    baoToast('Đã sao chép bảng chia y hệt — chỉ cần nhập MÃ HÀNG mới cho dòng này (không chia lại).');
  };

  const goTim = (id, field, v) => {
    capNhat(id, field === 'sp' ? { q: v, sp: null } : { qTC: v, thamChieu: null });
    const key = id + field;
    clearTimeout(timRef.current[key]);
    if (v.trim().length < 1) { capNhat(id, field === 'sp' ? { goiY: [] } : { goiYTC: [] }); return; }
    timRef.current[key] = setTimeout(async () => {
      if (field === 'tc') {
        const { data, error } = await sb.rpc('fn_td_goi_y', { p_tu: v.trim() });
        if (error) { baoToast('Lỗi tìm kiếm: ' + error.message); return; }
        capNhat(id, { goiYTC: data || [] });
      } else {
        const { data, error } = await sb.rpc('fn_tim_sp', { p_q: v.trim() });
        if (error) { baoToast('Lỗi tìm kiếm: ' + error.message); return; }
        capNhat(id, { goiY: data || [] });
      }
    }, 300);
  };
  // Giải một phạm vi {loai,giaTri,ds} thành danh sách ma_ch qua fn_ds_cua_hang.
  // ds != null nghĩa là người dùng đã tinh chỉnh thủ công (thêm/bớt) -> dùng thẳng.
  const giaiPhamVi = async (pv) => {
    if (!pv || pv.loai === 'TAT_CA') return null;   // null = tất cả nơi bán
    if (pv.ds) return pv.ds;                         // đã chốt danh sách tay
    const gt = pv.loai === 'DANH_SACH' ? (pv.giaTri || []).join(',') : (pv.giaTri ?? '');
    const { data } = await sb.rpc('fn_ds_cua_hang', { p_loai: pv.loai, p_gia_tri: String(gt) });
    return (data || []).map((c) => c.ma_ch);
  };


  const tenPV = (pv) => {
    if (!pv || pv.loai === 'TAT_CA') return 'Tất cả cửa hàng';
    if (pv.ds) return `${pv.ds.length} cửa hàng đã chọn`;
    if (pv.loai === 'KHU_VUC') return `Khu vực: ${pv.giaTri}`;
    if (pv.loai === 'NHOM') return `Nhóm ${pv.giaTri}`;
    if (pv.loai === 'NGAY') return `Đề nghị ngày ${pv.giaTri}`;
    if (pv.loai === 'DANH_SACH') return `${(pv.giaTri || []).length} cửa hàng`;
    return 'Tất cả cửa hàng';
  };

  const chonSP = (id, g) => capNhat(id, { sp: g, q: g.ma_tham_chieu || g.sku || g.barcode, goiY: [], nganh3: g.nganh_3 || '' });
  const chonTC = (id, g) => capNhat(id, { thamChieu: { ma_tham_chieu: g.ma, la_dong: g.la_dong, barcode: null }, qTC: g.ma, goiYTC: [] });

  const chiaDong = async (d) => {
    if (!d.sp || !d.tong || (!d.nganh3 && !d.thamChieu)) {
      baoToast('Dòng thiếu: sản phẩm, tổng SL và (ngành cấp 3 hoặc mã tham chiếu)'); return false;
    }
    const dsCh = await giaiPhamVi(d.phamVi || phamViChung);
    const gọiChia = () => sb.rpc('fn_chia_hang_moi_v3', {
      p_barcode: d.sp.barcode, p_nganh3: d.nganh3 || null, p_tong: parseInt(d.tong),
      p_nguoi: user.ma_dang_nhap, p_tham_chieu: d.thamChieu?.barcode || null,
      p_tham_chieu_ma: d.thamChieu?.ma_tham_chieu || null,
      p_ds_ch: dsCh, p_nguon_ban: nguonBan,
      p_min: parseInt(d.chiaMin) || 0, p_max: d.chiaMax ? parseInt(d.chiaMax) : null });
    let { data: id, error } = await gọiChia();
    // 57014 = statement timeout: lần đầu làm nóng bộ đệm, thử lại một lần nữa
    if (error && (error.code === '57014' || /timeout/i.test(error.message || ''))) {
      await new Promise((r) => setTimeout(r, 400));
      ({ data: id, error } = await gọiChia());
    }
    if (error) {
      baoToast(/THU HỒI|thu hồi|đủ hàng|quá thấp|cửa hàng/i.test(error.message || '')
        ? error.message
        : error.code === '57014' || /timeout/i.test(error.message || '')
        ? 'Máy chủ đang bận, thử lại sau giây lát'
        : 'Lỗi: ' + error.message);
      return false;
    }
    const { data, error: e2 } = await sb.from('chia_hang_moi_ct')
      .select('*').eq('batch_id', id).order('sl_de_xuat', { ascending: false });
    if (e2) { baoToast('Lỗi đọc kết quả: ' + e2.message); return false; }
    // Lấy TỒN của mã này ở các cửa hàng -> đối chiếu CH nào ĐÃ CÓ hàng.
    // ton_du_tinh = tồn thực + hàng ĐANG ĐI ĐƯỜNG (đã xin/đã chia, chưa nhận).
    let tonMap = {};
    if (data && data.length) {
      const { data: tk } = await sb.from('ton_kho')
        .select('ma_ch, ton_hien_tai, ton_du_tinh').eq('barcode', d.sp.barcode);
      tonMap = Object.fromEntries((tk || []).map((t) => {
        const thuc = t.ton_hien_tai || 0;
        const duTinh = (t.ton_du_tinh == null ? thuc : t.ton_du_tinh);   // gồm đi đường
        return [t.ma_ch, { thuc, duTinh, tren_duong: Math.max(0, duTinh - thuc) }];
      }));
    }
    const ctData = (data || []).map((r) => {
      const m = tonMap[r.ma_ch];
      return { ...r, ton_dang_co: m ? m.duTinh : 0, ton_thuc: m ? m.thuc : 0, ton_duong: m ? m.tren_duong : 0 };
    });
    if (!data || !data.length) {
      baoToast(d.thamChieu ? 'Mã tham chiếu chưa có bán 60 ngày — thử mã khác' : 'Ngành này chưa có bán 60 ngày — hãy chọn MÃ THAM CHIẾU tương tự để chia');
    }
    capNhat(d.id, { ct: ctData, batchId: id, tonMap });
    return true;
  };

  const [tienDo, setTienDo] = useState(null);
  const chiaTatCa = async () => {
    setBusy(true);
    const canChia = dong.filter((d) => !d.ct && d.sp && d.tong);
    let i = 0;
    for (const d of canChia) {
      i++; setTienDo(`${i}/${canChia.length}`);
      await chiaDong(d);
      if (i < canChia.length) await new Promise((r) => setTimeout(r, 150));
    }
    setTienDo(null); setBusy(false);
  };

  const suaChot = (id, idRow, v) => setDong((ds) => ds.map((d) => d.id !== id ? d : {
    ...d, ct: d.ct.map((r) => r.id === idRow ? { ...r, sl_chot: Math.max(0, parseInt(v) || 0) } : r) }));

  const khoNguon = (sp) => {
    const bh = (sp?.nganh_1 || '').includes('bảo hiểm') || (sp?.nganh_1 || '').includes('Mũ');
    return bh ? (khoMap.BH_CHINH || '') : (khoMap.NV_CHINH || '');
  };

  const xuatTatCa = async () => {
    // Gồm cả dòng đã chia (có batchId) LẪN dòng khuôn (ct sẵn, có sp, chưa batchId)
    const daChia = dong.filter((d) => d.ct && d.ct.length && d.sp);
    if (!daChia.length) { baoToast('Chưa có dòng nào có bảng chia + mã hàng'); return; }

    // CẢNH BÁO THIẾU: tổng số lượng chia của từng mã so với kho tổng của mã đó
    const thieu = daChia.map((d) => {
      const tong = d.ct.reduce((s, r) => s + (r.sl_chot || 0), 0);
      const kho = Number(d.sp.kho_tong ?? d.sp.kho ?? NaN);
      return { ma: d.sp.ma_tham_chieu || d.sp.sku || d.sp.barcode, tong, kho, thieu: Number.isFinite(kho) ? tong - kho : null };
    }).filter((x) => x.thieu != null && x.thieu > 0);

    if (thieu.length) {
      const ds = thieu.map((x) => `• ${x.ma}: chia ${x.tong} nhưng kho tổng chỉ ${x.kho} (thiếu ${x.thieu})`).join('\n');
      const ok = window.confirm(`⚠ CẢNH BÁO KHO TỔNG KHÔNG ĐỦ cho ${thieu.length} mã:\n\n${ds}\n\nVẫn xuất file? (Bấm Hủy để chỉnh số lượng trước)`);
      if (!ok) return;
    }

    for (const d of daChia) {
      // dòng đã chia (có batchId thật) -> chốt DB; dòng khuôn -> xuất thẳng, không lưu DB
      if (d.batchId && !d.laKhuon) {
        await Promise.all(d.ct.map((r) => r.id && !String(r.id).startsWith('khuon_') && !String(r.id).startsWith('moi_')
          ? sb.from('chia_hang_moi_ct').update({ sl_chot: r.sl_chot }).eq('id', r.id) : Promise.resolve()));
        await sb.from('chia_hang_moi').update({ trang_thai: 'CHOT' }).eq('id', d.batchId);
      }
    }

    const ngay = isoVN().replace(/-/g, '');
    const rowsX = [];
    daChia.forEach((d) => {
      const khoCho = khoNguon(d.sp) || 'KHO';
      d.ct.filter((r) => r.sl_chot > 0).forEach((r) => {
        rowsX.push({
          'Kho nguồn': khoCho, 'Kho đích': r.ma_ch,
          'SKU/ Barcode': d.sp.sku || d.sp.barcode, 'Số lượng': r.sl_chot,
          'Mã phiếu': `HM${ngay}-${khoCho}-${r.ma_ch}`,
        });
      });
    });
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(rowsX, { header: ['Kho nguồn', 'Kho đích', 'SKU/ Barcode', 'Số lượng', 'Mã phiếu'] });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Trang tính1');
    XLSX.writeFile(wb, `CHIAMOI_${isoVN()}.xlsx`);
    baoToast(`Đã chốt & xuất ${rowsX.length} dòng điều chuyển`);
  };

  const tongTatCa = dong.reduce((s, d) => s + (d.ct || []).reduce((x, r) => x + (r.sl_chot || 0), 0), 0);

  const laBH = (sp) => (sp?.nganh_1 || '').includes('bảo hiểm') || (sp?.nganh_1 || '').includes('Mũ');

  // Bảng đối soát: mỗi cửa hàng một dòng, mỗi mã một cột, cộng dồn toàn bộ.
  // Cột mã xếp mũ bảo hiểm trước, nón vải sau.
  const banDS = useMemo(() => {
    const ma = dong.filter((d) => d.sp && d.ct && d.ct.length)
      .map((d) => ({ id: d.id, sp: d.sp, bh: laBH(d.sp),
        nhan: d.sp.ma_tham_chieu || d.sp.sku || d.sp.barcode, ct: d.ct }))
      .sort((a, b) => (a.bh === b.bh ? a.nhan.localeCompare(b.nhan, 'vi') : (a.bh ? -1 : 1)));
    if (!ma.length) return null;

    const oCH = {};   // ma_ch -> { ten, khu_vuc, o: { colId: sl } }
    ma.forEach((m) => m.ct.forEach((r) => {
      if (!oCH[r.ma_ch]) oCH[r.ma_ch] = {
        ma_ch: r.ma_ch, ten: tenCH[r.ma_ch] || r.ma_ch,
        khu_vuc: kvCH[r.ma_ch] || r.khu_vuc || '', o: {} };
      oCH[r.ma_ch].o[m.id] = (oCH[r.ma_ch].o[m.id] || 0) + (r.sl_chot || 0);
    }));
    // Cửa hàng thêm tay (chưa có mã nào) vẫn hiện để nhập
    themCH.forEach((c) => {
      if (!oCH[c.ma_ch]) oCH[c.ma_ch] = {
        ma_ch: c.ma_ch, ten: c.ten || tenCH[c.ma_ch] || c.ma_ch,
        khu_vuc: c.khu_vuc || kvCH[c.ma_ch] || '', o: {} };
    });
    let hang = Object.values(oCH)
      .map((h) => ({ ...h, tong: ma.reduce((s, m) => s + (h.o[m.id] || 0), 0) }));

    // Sắp xếp: theo cột đang chọn, mặc định tổng giảm dần
    const dau = sortDS.dir === 'asc' ? 1 : -1;
    hang.sort((a, b) => {
      if (sortDS.col === 'ten') return dau * a.ten.localeCompare(b.ten, 'vi');
      if (sortDS.col === 'kv') return dau * (a.khu_vuc || '').localeCompare(b.khu_vuc || '', 'vi');
      if (sortDS.col === 'tc') return dau * ((tdCH[a.ma_ch] || 0) - (tdCH[b.ma_ch] || 0));
      if (sortDS.col === 'tong') return dau * (a.tong - b.tong);
      if (typeof sortDS.col === 'number') return dau * ((a.o[sortDS.col] || 0) - (b.o[sortDS.col] || 0));
      return b.tong - a.tong;
    });

    const cotTong = ma.map((m) => ({ id: m.id,
      tong: hang.reduce((s, h) => s + (h.o[m.id] || 0), 0) }));
    return { ma, hang, cotTong, tongCuoi: hang.reduce((s, h) => s + h.tong, 0) };
  }, [dong, tenCH, kvCH, themCH, sortDS, tdCH]);

  const sortCot = (col) => setSortDS((s) =>
    s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' });

  // Sửa số trong bảng đối soát -> ghi ngược về đúng dòng chi tiết
  useEffect(() => {
    if (!moDS) return;
    if (tcGoiYDau.length && !tc.chon) chonTC2(tcGoiYDau[0]);
  }, [moDS]);   // eslint-disable-line

  // Cột tham chiếu: tốc độ bán mỗi ngày của từng cửa hàng trong bảng
  useEffect(() => {
    if (!moDS || !banDS) return;
    const dsCH = banDS.hang.map((h) => h.ma_ch);
    if (!dsCH.length) return;
    sb.rpc('fn_ds_toc_do_ch', {
      p_loai: tc.chon?.loai || null, p_gia_tri: tc.chon?.gia_tri || null, p_ma_ch: dsCH,
    }).then(({ data }) => {
      setTdCH(Object.fromEntries((data || []).map((x) => [x.ma_ch, x.ban_30])));
    });
  }, [moDS, tc.chon, banDS?.hang.length]);   // eslint-disable-line

  const suaODS = (colId, ma_ch, v, taoMoi) => {
    const sl = Math.max(0, parseInt(v) || 0);
    setDong((ds) => ds.map((d) => {
      if (d.id !== colId) return d;
      const co = d.ct.some((r) => r.ma_ch === ma_ch);
      if (co) return { ...d, ct: d.ct.map((r) => r.ma_ch === ma_ch ? { ...r, sl_chot: sl } : r) };
      if (!taoMoi) return d;
      return { ...d, ct: [...d.ct, {
        id: 'moi_' + colId + '_' + ma_ch, ma_ch, ty_le: 0, sl_de_xuat: 0, sl_chot: sl }] };
    }));
  };

  const muiTen = (col) => sortDS.col === col
    ? <i className="ds-sort-ic">{sortDS.dir === 'asc' ? '▲' : '▼'}</i> : null;

  // ===== THAM CHIẾU: gõ mã/ngành -> tốc độ bán mỗi ngày =====
  const timTC = (v) => {
    setTc((t) => ({ ...t, q: v, chon: null, sl: null }));
    clearTimeout(tcRef.current);
    if (v.trim().length < 1) { setTc((t) => ({ ...t, goiY: [] })); return; }
    tcRef.current = setTimeout(async () => {
      const { data } = await sb.rpc('fn_tc_goi_y', { p_q: v.trim(), p_gioi_han: 8 });
      setTc((t) => ({ ...t, goiY: data || [] }));
    }, 300);
  };
  const chonTC2 = async (g) => {
    setTc({ q: g.nhan, chon: g, goiY: [], sl: null });
    const { data } = await sb.rpc('fn_tc_toc_do', { p_loai: g.loai, p_gia_tri: g.gia_tri });
    setTc((t) => ({ ...t, sl: data || null }));
  };

  // Gợi ý ban đầu cho ô tham chiếu: các mã tham chiếu / ngành từ mã vừa chia
  const tcGoiYDau = useMemo(() => {
    const ra = [];
    dong.forEach((d) => {
      if (d.thamChieu) ra.push({ loai: 'ma', gia_tri: d.thamChieu.barcode,
        nhan: d.thamChieu.ma_tham_chieu || d.thamChieu.sku, phu: 'mã tham chiếu đã chọn' });
      else if (d.nganh3) ra.push({ loai: 'nganh', gia_tri: d.nganh3, nhan: d.nganh3, phu: 'ngành đã chọn' });
    });
    const thay = new Set(); return ra.filter((x) => {
      const k = x.loai + x.gia_tri; if (thay.has(k)) return false; thay.add(k); return true; });
  }, [dong]);

  const chChuaCo = useMemo(() => {
    const daCo = new Set((banDS?.hang || []).map((h) => h.ma_ch));
    return Object.entries(tenCH)
      .filter(([ma]) => !daCo.has(ma))
      .map(([ma_ch, ten]) => ({ ma_ch, ten, khu_vuc: kvCH[ma_ch] || '' }))
      .sort((a, b) => a.ten.localeCompare(b.ten, 'vi'));
  }, [banDS, tenCH, kvCH]);

  return (
    <div>
      <div className="cmdbar">
        <div className="cmd-title">
          <h2><IcSplit style={{ verticalAlign: -3, marginRight: 8 }} />Chia hàng mới</h2>
          <p>Thêm nhiều mã một lần — chia theo tỷ trọng bán ngành cấp 3, hoặc theo mã tham chiếu tương tự. Chỉnh tay được sau khi chia.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-ai" disabled={busy} onClick={chiaTatCa}>
            {busy ? `Đang chia… ${tienDo || ''}` : '✦ Chia tự động tất cả'}
          </button>
          <button className="btn btn-ai" onClick={() => setMoDS(true)} disabled={!banDS}>
            Bảng đối soát{banDS ? ` (${banDS.hang.length} CH)` : ''}
          </button>
          <button className="btn btn-ai" onClick={xuatTatCa}>
            <IcDown style={{ verticalAlign: -3 }} /> Xuất tất cả{tongTatCa > 0 ? ` (${tongTatCa} sp)` : ''}
          </button>
        </div>
      </div>

      <div className="pv-thanh">
        <div className="pv-thanh-l">
          <span className="pv-lbl">Phạm vi chia (chung):</span>
          <button className="pv-chip-chon" onClick={() => setMoPV('chung')}>
            <IcSearch style={{ width: 14, height: 14, verticalAlign: -2, marginRight: 5 }} />
            {tenPV(phamViChung)}
          </button>
          <span className="tq-ghi">— áp cho mọi mã, trừ mã đặt riêng</span>
        </div>
        <div className="pv-thanh-r">
          <span className="pv-lbl">Tỷ trọng theo:</span>
          <button className={'pv-seg' + (nguonBan === 'TOAN_HE' ? ' on' : '')}
            onClick={() => setNguonBan('TOAN_HE')}>Toàn hệ thống</button>
          <button className={'pv-seg' + (nguonBan === 'TRONG_PHAM_VI' ? ' on' : '')}
            onClick={() => setNguonBan('TRONG_PHAM_VI')}>Trong phạm vi</button>
        </div>
      </div>

      {dong.map((d, i) => (
        <div key={d.id} className="card" style={{ marginTop: 12, padding: 14 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ position: 'relative', flex: '1 1 240px' }}>
              <div className="lbl">Mã hàng mới #{i + 1}{d.laKhuon && <span style={{ marginLeft: 6, color: 'var(--gold)', fontWeight: 700, fontSize: 11 }}>⧉ dùng khuôn — nhập mã là xong, khỏi chia</span>}</div>
              <div style={{ position: 'relative' }}>
                <IcSearch style={{ position: 'absolute', left: 11, top: 12, width: 16, height: 16, color: 'var(--ink-2)', pointerEvents: 'none' }} />
                <input className="inp" style={{ paddingLeft: 32, width: '100%' }}
                  placeholder="Barcode, SKU, mã" value={d.q} onChange={(e) => goTim(d.id, 'sp', e.target.value)} />
              </div>
              {d.goiY.length > 0 && (
                <div className="goiy-pop">
                  {d.goiY.map((g) => (
                    <div key={g.barcode} className="goiy-item" style={{ cursor: 'pointer' }} onClick={() => chonSP(d.id, g)}>
                      <AnhMini url={g.hinh_url} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="mono" style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--teal-deep)' }}>{g.ma_tham_chieu || g.sku}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>{g.nganh_3} · kho {g.kho_tong}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ flex: '1 1 200px' }}>
              <div className="lbl">Ngành cấp 3 (tự nhận)</div>
              <select className="inp" style={{ width: '100%' }} value={d.nganh3} onChange={(e) => capNhat(d.id, { nganh3: e.target.value })}>
                <option value="">— chọn —</option>
                {dsNganh3.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div style={{ position: 'relative', flex: '1 1 220px' }}>
              <div className="lbl">Mã tham chiếu (tùy chọn — gõ MC037 để lấy cả dòng)</div>
              <input className="inp" style={{ width: '100%' }}
                placeholder="Mã dòng hoặc mã màu tương tự…" value={d.qTC} onChange={(e) => goTim(d.id, 'tc', e.target.value)} />
              {d.goiYTC.length > 0 && (
                <div className="goiy-pop">
                  {d.goiYTC.map((g) => (
                    <div key={g.ma} className="goiy-item" style={{ cursor: 'pointer' }} onClick={() => chonTC(d.id, g)}>
                      <AnhMini url={g.hinh_url} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="mono" style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--teal-deep)' }}>{g.ma}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>{g.la_dong ? `cả dòng · ${g.so_bien_the} màu` : (g.ten_sp || 'một màu')}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ flex: '0 0 90px' }}>
              <div className="lbl">Tổng SL</div>
              <input className="inp" type="number" min="1" style={{ width: '100%' }}
                value={d.tong} onChange={(e) => capNhat(d.id, { tong: e.target.value })} />
            </div>
            <div style={{ flex: '0 0 76px' }}>
              <div className="lbl" title="Mỗi cửa hàng nhận ÍT NHẤT bao nhiêu (kể cả CH không bán). Để trống = không ràng buộc">Min/CH</div>
              <input className="inp" type="number" min="0" placeholder="—" style={{ width: '100%' }}
                value={d.chiaMin} onChange={(e) => capNhat(d.id, { chiaMin: e.target.value })} />
            </div>
            <div style={{ flex: '0 0 76px' }}>
              <div className="lbl" title="Mỗi cửa hàng nhận TỐI ĐA bao nhiêu. Để trống = không giới hạn">Max/CH</div>
              <input className="inp" type="number" min="0" placeholder="—" style={{ width: '100%' }}
                value={d.chiaMax} onChange={(e) => capNhat(d.id, { chiaMax: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {!d.ct && <button className="btn btn-primary" disabled={busy} onClick={() => chiaDong(d)}>Chia</button>}
              {d.ct && <button className="btn-mini btn-teal" onClick={() => copyNhom(d)} title="Copy toàn bộ cấu hình, chỉ nhập mã hàng mới">＋ Mã mới (giữ cấu hình)</button>}
              {d.ct && <button className="btn-mini btn-gold" onClick={() => copyKhuon(d)} title="Nhân bản NGUYÊN bảng chia (giữ số lượng), không chia lại — chỉ nhập mã">⧉ Nhân bản khuôn</button>}
              {dong.length > 1 && <button className="btn-mini btn-danger" onClick={() => setDong((ds) => ds.filter((x) => x.id !== d.id))}>－</button>}
            </div>
          </div>

          {d.thamChieu && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--teal-deep)' }}>
              Chia theo tỷ trọng bán của <b className="mono">{d.thamChieu.ma_tham_chieu}</b>{d.thamChieu.la_dong ? ' (cả dòng, mọi màu)' : ''} (60 ngày)
            </div>
          )}

          <div className="pv-rieng">
            <span className="tq-ghi">Phạm vi:</span>
            {d.phamVi
              ? <button className="pv-chip-chon nho" onClick={() => setMoPV(d.id)}>{tenPV(d.phamVi)}</button>
              : <button className="pv-chip-chung" onClick={() => setMoPV(d.id)}>
                  Theo chung ({tenPV(phamViChung)})</button>}
            {d.phamVi && (
              <button className="pv-bo" title="Bỏ phạm vi riêng, dùng chung"
                onClick={() => capNhat(d.id, { phamVi: null })}>✕ riêng</button>
            )}
          </div>

          {d.ct && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                {(() => { const tong = d.ct.reduce((s, r) => s + (r.sl_chot || 0), 0);
                  const nhap = parseInt(d.tong) || 0; const giu = nhap - tong;
                  return <b style={{ fontSize: 13 }}>Kết quả: {d.ct.length} cửa hàng · {tong} sp
                    {giu > 0 && <span style={{ color: 'var(--gold)', fontWeight: 600 }}> · giữ {giu} (Toàn hệ thống chia theo tỷ trọng)</span>}</b>; })()}
                <button className="btn-mini" onClick={() => capNhat(d.id, { moRong: !d.moRong })}>{d.moRong ? 'Thu gọn' : 'Mở rộng'}</button>
                <button className="btn-mini" onClick={() => capNhat(d.id, { ct: null, batchId: null })}>Chia lại</button>
              </div>
              {d.moRong && (
                <div className="tbl-wrap" style={{ maxHeight: '40vh' }}>
                  <table className="tbl">
                    <thead><tr><th className="ct-stt">#</th>
                      <th className="sortable" onClick={() => dsCt('cuahang')}>Cửa hàng{icCt('cuahang')}</th>
                      <th className="ct-giua sortable" style={{ width: 150 }} onClick={() => dsCt('khuvuc')}>Khu vực{icCt('khuvuc')}</th>
                      <th className="ct-giua sortable" style={{ width: 82 }} onClick={() => dsCt('ton_dang_co')} title="Tồn thực + hàng đang đi đường (đã xin/đã chia chưa nhận) của mã này ở cửa hàng. Số cam = tồn thực; ✈ = đang về.">Đã có{icCt('ton_dang_co')}</th>
                      <th className="ct-giua sortable" style={{ width: 72 }} onClick={() => dsCt('ty_le')}>Tỷ lệ{icCt('ty_le')}</th>
                      <th className="ct-giua sortable" style={{ width: 80 }} onClick={() => dsCt('sl_de_xuat')}>Đề xuất{icCt('sl_de_xuat')}</th>
                      <th className="ct-giua sortable" style={{ width: 90 }} onClick={() => dsCt('sl_chot')}>Chốt{icCt('sl_chot')}</th>
                      <th style={{ width: 34 }}></th></tr></thead>
                    <tbody>
                      {sapCt(d.ct).map((r, i3) => (
                        <tr key={r.id}>
                          <td className="ct-stt">{i3 + 1}</td>
                          <td><b>{tenCH[r.ma_ch] || r.ma_ch}</b> <span style={{ color: 'var(--ink-2)', fontSize: 11 }}>{r.ma_ch}</span></td>
                          <td className="ct-giua">{kvCH[r.ma_ch] || '—'}</td>
                          <td className="ct-giua">{r.ton_dang_co > 0
                            ? <span className="ct-dacoz">
                                <b className="ct-dacos">{r.ton_dang_co}</b>
                                {r.ton_duong > 0 && <small className="ct-duong" title={`${r.ton_thuc} tồn thực + ${r.ton_duong} đang về`}>✈{r.ton_duong}</small>}
                              </span>
                            : <span className="ct-khong">·</span>}</td>
                          <td className="ct-giua">{Math.round((r.ty_le || 0) * 100)}%</td>
                          <td className="ct-giua">{r.sl_de_xuat}</td>
                          <td className="ct-giua"><input className="qty-input ct-inp" type="number" min="0" value={r.sl_chot}
                            onChange={(e) => suaChot(d.id, r.id, e.target.value)} /></td>
                          <td className="ct-giua"><button className="btn-mini" title="Bỏ cửa hàng này"
                            onClick={() => capNhat(d.id, { ct: d.ct.filter((x) => x.id !== r.id) })}>✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="ct-them">
                    <span className="tq-ghi">Thêm cửa hàng chưa có:</span>
                    <div className="ct-them-sel">
                      <Sel value="" timKiem placeholder="Tìm cửa hàng…"
                        options={Object.entries(tenCH)
                          .filter(([ma]) => !d.ct.some((r) => r.ma_ch === ma))
                          .sort((a, b) => a[1].localeCompare(b[1], 'vi'))
                          .map(([ma, ten]) => ({ value: ma, label: `${ten} · ${kvCH[ma] || ''}` }))}
                        onChange={(v) => v && capNhat(d.id, { ct: [...d.ct, {
                          id: 'moi_' + d.id + '_' + v, ma_ch: v, ty_le: 0, sl_de_xuat: 0, sl_chot: 0 }] })} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      <button className="btn" style={{ marginTop: 12 }} onClick={() => setDong((ds) => [...ds, dongMoi()])}>
        ＋ Thêm mã hàng mới
      </button>

      {moDS && banDS && (
        <div onClick={() => setMoDS(false)} style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 3000,
          background: 'rgba(20,18,14,.55)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 16, width: 'min(1280px, 97vw)', maxHeight: '90vh',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            boxShadow: '0 20px 60px rgba(20,33,58,.3)' }}>
            <div className="lp-dau">
              <div><b>Bảng đối soát chia hàng mới</b>
                <div className="lp-phu">{banDS.hang.length} cửa hàng · {banDS.ma.length} mã · {banDS.tongCuoi} sp — sửa số ngay trong bảng, bấm tiêu đề để sắp xếp</div></div>
              <button className="lp-dong" onClick={() => setMoDS(false)}>✕</button>
            </div>
            <div className="ds-tc">
              <span className="ds-tc-lbl">Cột Bán/tháng tính theo:</span>
              <div className="ds-tc-o">
                <input className="inp ds-tc-in" placeholder="Gõ mã sản phẩm hoặc ngành hàng…"
                  value={tc.q} onChange={(e) => timTC(e.target.value)} />
                {tc.goiY.length > 0 && (
                  <div className="goiy-pop ds-tc-pop">
                    {tc.goiY.map((g, i2) => (
                      <div key={i2} className="goiy-item" style={{ cursor: 'pointer' }} onClick={() => chonTC2(g)}>
                        <span className={'ds-tc-loai ' + g.loai}>{g.loai === 'ma' ? 'MÃ' : 'NGÀNH'}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="mono" style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--teal-deep)' }}>{g.nhan}</div>
                          <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>{g.phu}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {tc.chon && tc.sl && (
                <div className="ds-tc-kq">
                  <b>{fmtN(tc.sl.ban_30)}</b><span>sp/tháng</span>
                  <i>· {tc.sl.moi_ngay}/ngày · {tc.sl.so_ch} cửa hàng</i>
                </div>
              )}
              <div className="ds-tc-nhanh">
                <button className={'ds-tc-chip' + (!tc.chon ? ' on' : '')}
                  onClick={() => setTc({ q: '', chon: null, goiY: [], sl: null })}>Tất cả hàng</button>
                {tcGoiYDau.map((g, i2) => (
                  <button key={i2} className={'ds-tc-chip' + (tc.chon?.gia_tri === g.gia_tri ? ' on' : '')}
                    onClick={() => chonTC2(g)}>{g.nhan}</button>
                ))}
              </div>
            </div>
            <div className="lp-cuon">
              <table className="tbl ds-pivot">
                <thead>
                  <tr>
                    <th className="ds-stt">#</th>
                    <th className="ds-ch ds-sort" onClick={() => sortCot('ten')}>
                      Cửa hàng{muiTen('ten')}</th>
                    <th className="ds-kv ds-sort" onClick={() => sortCot('kv')}>
                      Khu vực{muiTen('kv')}</th>
                    <th className="ds-tc-col ds-sort" onClick={() => sortCot('tc')}
                      title={tc.chon ? `Số bán ${tc.chon.nhan} trong 30 ngày tại từng cửa hàng`
                                     : 'Số bán 30 ngày tại từng cửa hàng'}>
                      Bán/tháng{muiTen('tc')}
                      {tc.chon && <span className="ds-tc-col-phu">{tc.chon.nhan}</span>}</th>
                    {banDS.ma.map((m) => (
                      <th key={m.id} className={'ds-ma ds-sort ' + (m.bh ? 'bh' : 'nv')}
                        title={m.sp.nganh_1 || ''} onClick={() => sortCot(m.id)}>
                        <span className="ds-ma-nhan">{m.nhan}{muiTen(m.id)}</span>
                      </th>
                    ))}
                    <th className="ds-tong ds-sort" onClick={() => sortCot('tong')}>
                      Tổng{muiTen('tong')}</th>
                  </tr>
                </thead>
                <tbody>
                  {banDS.hang.map((h, i2) => (
                    <tr key={h.ma_ch}>
                      <td className="ds-stt">{i2 + 1}</td>
                      <td className="ds-ch"><b>{h.ten}</b><span className="ds-ch-ma">{h.ma_ch}</span></td>
                      <td className="ds-kv">{h.khu_vuc || '—'}</td>
                      <td className="ds-tc-col">{tdCH[h.ma_ch] != null
                        ? <b>{fmtN(tdCH[h.ma_ch])}</b> : <span className="ds-khong">·</span>}</td>
                      {banDS.ma.map((m) => (
                        <td key={m.id} className="ds-o">
                          {h.o[m.id] != null ? (
                            <input className="ds-in" type="number" min="0" value={h.o[m.id]}
                              onChange={(e) => suaODS(m.id, h.ma_ch, e.target.value)} />
                          ) : (
                            <button className="ds-them-o" title="Thêm mã này cho cửa hàng"
                              onClick={() => suaODS(m.id, h.ma_ch, 0, true)}>+</button>
                          )}
                        </td>
                      ))}
                      <td className="ds-tong"><b>{h.tong}</b></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="ds-stt" />
                    <td className="ds-ch">Tổng</td>
                    <td className="ds-kv" />
                    <td className="ds-tc-col" />
                    {banDS.cotTong.map((c) => (
                      <td key={c.id} className="ds-tong-cot">{c.tong}</td>
                    ))}
                    <td className="ds-tong-cuoi">{banDS.tongCuoi}</td>
                  </tr>
                </tfoot>
              </table>

              <div className="ds-them">
                <span className="ds-them-lbl">Thêm cửa hàng chưa có trong bảng:</span>
                <div className="ds-them-sel">
                  <Sel value="" timKiem placeholder="Tìm cửa hàng…"
                    options={chChuaCo.map((c) => ({ value: c.ma_ch, label: `${c.ten} · ${c.khu_vuc || ''}` }))}
                    onChange={(v) => {
                      const c = chChuaCo.find((x) => x.ma_ch === v);
                      if (c) setThemCH((ds) => [...ds, c]);
                    }} />
                </div>
                <span className="tq-ghi">còn {chChuaCo.length} nơi chưa có trong bảng</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {moPV != null && (
        <PhamViModal
          pv={moPV === 'chung' ? phamViChung : (dong.find((d) => d.id === moPV)?.phamVi || null)}
          dsKhuVuc={dsKhuVuc} dsNhom={dsNhom} tenCH={tenCH} kvCH={kvCH} laChung={moPV === 'chung'}
          onClose={() => setMoPV(null)}
          onLuu={(pv, apTatCa) => {
            if (apTatCa) {
              // Áp cho MỌI mã: đặt chung + xóa phạm vi riêng của từng mã
              setPhamViChung(pv);
              setDong((ds) => ds.map((d) => ({ ...d, phamVi: null })));
            } else if (moPV === 'chung') setPhamViChung(pv);
            else capNhat(moPV, { phamVi: pv });
            setMoPV(null);
          }}
        />
      )}
    </div>
  );
}

function PhamViModal({ pv, dsKhuVuc, dsNhom, tenCH, kvCH, laChung, onClose, onLuu }) {
  // Mô hình GIỎ: gio = tập ma_ch đang chọn (Set). Nhặt vào từ nhiều nguồn, bỏ ra tự do.
  const [gio, setGio] = useState(() => new Set(pv?.ds || []));
  const [nguon, setNguon] = useState('TAT_CA');   // tab NHẶT: TAT_CA|KHU_VUC|NHOM|NGAY|TIM
  const [tim, setTim] = useState('');
  const [sapXep, setSapXep] = useState('kv');
  const [metaCH, setMetaCH] = useState({});   // ma_ch -> {ten,khu_vuc,nhom_ch,lich_gan,so_ngay_toi_lich}
  const [goiY, setGoiY] = useState([]);       // kết quả nguồn đang xem (để nhặt)
  const [lichMap, setLichMap] = useState({});   // ma_ch -> ngày đề nghị gần nhất (YYYY-MM-DD) từ fn_lich_matran
  const [allCH, setAllCH] = useState(null);     // toàn bộ CH, tải MỘT lần, mọi tab lọc tại chỗ (hết giật)
  const timRef2 = useRef(null);

  // Nếu phạm vi cũ là nhóm/khu vực chưa "giải" ra ds -> giải một lần lúc mở
  useEffect(() => {
    if (pv && !pv.ds && pv.loai && pv.loai !== 'TAT_CA') {
      const gt = pv.loai === 'DANH_SACH' ? '' : (pv.giaTri ?? '');
      sb.rpc('fn_ds_cua_hang', { p_loai: pv.loai, p_gia_tri: String(gt) }).then(({ data }) => {
        const ds = (data || []).map((c) => c.ma_ch);
        setGio(new Set(ds));
        napMeta(data || []);
      });
    }
  }, []);   // eslint-disable-line

  // Mở modal -> tải TOÀN BỘ cửa hàng MỘT lần; mọi tab lọc từ đây (không gọi lại API -> hết giật)
  useEffect(() => {
    sb.rpc('fn_ds_cua_hang', { p_loai: 'TAT_CA', p_gia_tri: '' }).then(({ data }) => {
      setAllCH(data || []); napMeta(data || []); setGoiY(data || []);
    });
  }, []);   // eslint-disable-line

  // Nạp LỊCH ĐỀ NGHỊ thật từ fn_lich_matran (nguồn màn Lịch dùng), 45 ngày tới.
  // Lấy ngày đề nghị GẦN NHẤT ≥ hôm nay cho mỗi cửa hàng.
  useEffect(() => {
    const homNay = new Date().toISOString().slice(0, 10);
    const den = new Date(); den.setDate(den.getDate() + 45);
    sb.rpc('fn_lich_matran', { p_tu: homNay, p_den: den.toISOString().slice(0, 10) })
      .then(({ data }) => {
        const m = {};
        (data || []).forEach((r) => {
          const ngay = (r.ngay_lich || []).filter((n) => n >= homNay).sort();
          if (ngay.length) m[r.ma_ch] = ngay[0];
        });
        setLichMap(m);
      });
  }, []);   // eslint-disable-line

  const homNayISO = new Date().toISOString().slice(0, 10);
  const soNgayToi = (ngay) => {
    if (!ngay) return null;
    return Math.round((new Date(ngay) - new Date(homNayISO)) / 86400000);
  };
  // gắn lịch đề nghị (lichMap) vào từng dòng CH
  const napMeta = (rows) => setMetaCH((m) => {
    const n = { ...m };
    rows.forEach((r) => {
      const lg = lichMap[r.ma_ch] || null;
      n[r.ma_ch] = { ...r, lich_gan: lg, so_ngay_toi_lich: soNgayToi(lg) };
    });
    return n;
  });

  // Nạp gợi ý theo nguồn — LỌC TẠI CHỖ từ allCH (đã tải sẵn), không gọi API -> không giật
  const napNguon = (loai, gt) => {
    const nguonData = allCH || [];
    let data = [];
    if (loai === 'TAT_CA') data = nguonData;
    else if (loai === 'KHU_VUC') data = nguonData.filter((c) => c.khu_vuc === gt);
    else if (loai === 'NHOM') data = nguonData.filter((c) => String(c.nhom_ch) === String(gt));
    else if (loai === 'NGAY') {
      const homNay = new Date().toISOString().slice(0, 10);
      const den = new Date(); den.setDate(den.getDate() + (gt || 0));
      const denS = den.toISOString().slice(0, 10);
      data = nguonData.filter((c) => { const lg = lichMap[c.ma_ch]; return lg && lg >= homNay && lg <= denS; });
    } else if (loai === 'TIM') {
      if (!gt || gt.trim().length < 1) { setGoiY([]); return; }
      const q = gt.toLowerCase();
      data = nguonData.filter((c) =>
        (c.ten || '').toLowerCase().includes(q) || (c.khu_vuc || '').toLowerCase().includes(q) || c.ma_ch.toLowerCase().includes(q));
    }
    setGoiY(data);
  };

  const nhatNhom = () => { goiY.forEach((c) => gio.add(c.ma_ch)); setGio(new Set(gio)); };
  const boNhom = () => { goiY.forEach((c) => gio.delete(c.ma_ch)); setGio(new Set(gio)); };
  const nhat1 = (ma) => { gio.add(ma); setGio(new Set(gio)); };
  const bo1 = (ma) => { gio.delete(ma); setGio(new Set(gio)); };

  // Khi lichMap về (sau khi meta đã nạp) -> vá lịch vào mọi dòng meta
  useEffect(() => {
    if (!Object.keys(lichMap).length) return;
    setMetaCH((m) => {
      const n = {};
      Object.entries(m).forEach(([ma, r]) => {
        const lg = lichMap[ma] || null;
        n[ma] = { ...r, lich_gan: lg, so_ngay_toi_lich: soNgayToi(lg) };
      });
      return n;
    });
  }, [lichMap]);   // eslint-disable-line

  // Danh sách trong GIỎ để hiển thị (kèm meta + lọc tìm + sắp xếp)
  const trongGio = useMemo(() => {
    let r = [...gio].map((ma) => {
      const base = metaCH[ma] || { ma_ch: ma, ten: tenCH[ma] || ma, khu_vuc: kvCH[ma] || '' };
      const lg = lichMap[ma] || base.lich_gan || null;
      return { ...base, lich_gan: lg, so_ngay_toi_lich: soNgayToi(lg) };
    });
    if (tim.trim() && nguon !== 'TIM') {
      const q = tim.toLowerCase();
      r = r.filter((x) => (x.ten || '').toLowerCase().includes(q) || (x.khu_vuc || '').toLowerCase().includes(q) || x.ma_ch.toLowerCase().includes(q));
    }
    return r.sort((a, b) => sapXep === 'lich'
      ? ((a.so_ngay_toi_lich ?? 9999) - (b.so_ngay_toi_lich ?? 9999))
      : (a.khu_vuc || '').localeCompare(b.khu_vuc || '', 'vi'));
  }, [gio, metaCH, tim, sapXep, nguon, tenCH, kvCH, lichMap]);

  const fmtLich = (r) => {
    if (r.lich_gan == null) return <span className="tq-ghi">chưa có</span>;
    const n = r.so_ngay_toi_lich;
    const nhan = n === 0 ? 'hôm nay' : n === 1 ? 'ngày mai' : `${n} ngày nữa`;
    const dm = r.lich_gan.slice(8, 10) + '/' + r.lich_gan.slice(5, 7);
    return <span className={'pv-lich' + (n <= 1 ? ' gan' : n <= 7 ? ' vua' : '')}>
      <b>{dm}</b> · {nhan}</span>;
  };

  // Bao nhiêu CH trong nhóm gợi ý đã nằm trong giỏ
  const daNhat = goiY.filter((c) => gio.has(c.ma_ch)).length;

  const chot = (apTatCa) => {
    const ds = [...gio];
    const pvOut = ds.length ? { loai: 'DANH_SACH', giaTri: null, ds } : { loai: 'TAT_CA', giaTri: null, ds: null };
    onLuu(pvOut, apTatCa);
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 3200,
      background: 'rgba(20,18,14,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16,
        width: 'min(900px, 97vw)', height: '86vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(20,33,58,.3)' }}>
        <div className="lp-dau">
          <div><b>Chọn cửa hàng để chia</b>
            <div className="lp-phu">Nhặt nhanh theo nhóm/khu vực/ngày rồi thêm-bớt tùy ý · đang chọn <b>{gio.size}</b> cửa hàng</div></div>
          <button className="lp-dong" onClick={onClose}>✕</button>
        </div>

        <div className="pv2">
          {/* CỘT TRÁI: nguồn để nhặt */}
          <div className="pv2-trai">
            <div className="pv2-tab">
              {[['TAT_CA', 'Tất cả CH'], ['KHU_VUC', 'Khu vực'], ['NHOM', 'Nhóm'],
                ['NGAY', 'Ngày đề nghị'], ['TIM', 'Tìm cửa hàng']].map(([k, t]) => (
                <button key={k} className={'pv2-tab-nut' + (nguon === k ? ' on' : '')}
                  onClick={() => { setNguon(k);
                    if (k === 'TAT_CA') napNguon('TAT_CA', '');
                    else if (k === 'NGAY') napNguon('NGAY', 0);
                    else setGoiY([]); }}>{t}</button>
              ))}
            </div>

            <div className="pv2-nguon">
              {nguon === 'TAT_CA' && (
                <div className="tq-ghi" style={{ padding: '2px' }}>Toàn bộ cửa hàng — bấm "+ Thêm tất cả" bên dưới để chọn hết.</div>
              )}
              {nguon === 'KHU_VUC' && (
                <div className="pv-pills">
                  {dsKhuVuc.map((kv) => (
                    <button key={kv} className="pv-pill" onClick={() => napNguon('KHU_VUC', kv)}>{kv}</button>
                  ))}
                </div>
              )}
              {nguon === 'NHOM' && (
                <div className="pv-pills">
                  {dsNhom.map((n) => (
                    <button key={n} className="pv-pill" onClick={() => napNguon('NHOM', n)}>Nhóm {n}</button>
                  ))}
                </div>
              )}
              {nguon === 'NGAY' && (
                <div className="pv-pills">
                  {[['Đề nghị hôm nay', 0], ['Đến ngày mai', 1], ['7 ngày tới', 7], ['30 ngày tới', 30]].map(([t, n]) => (
                    <button key={n} className="pv-pill" onClick={() => napNguon('NGAY', n)}>{t}</button>
                  ))}
                </div>
              )}
              {nguon === 'TIM' && (
                <input className="inp" style={{ width: '100%', height: 38 }} autoFocus
                  placeholder="Gõ tên cửa hàng hoặc khu vực (vd: Hà Nội)…"
                  onChange={(e) => { clearTimeout(timRef2.current); const v = e.target.value;
                    timRef2.current = setTimeout(() => napNguon('TIM', v), 300); }} />
              )}
            </div>

            {/* Kết quả nguồn -> nhặt */}
            <div className="pv2-ketqua">
              {!allCH ? <div className="tq-ghi" style={{ padding: 16, textAlign: 'center' }}>Đang tải…</div>
                : goiY.length === 0 ? <div className="tq-ghi" style={{ padding: 16, textAlign: 'center' }}>
                    {nguon === 'TIM' ? 'Gõ để tìm cửa hàng' : nguon === 'NGAY' ? 'Không có cửa hàng đề nghị trong khoảng này' : 'Chọn một mục bên trên để xem cửa hàng'}</div>
                : (<>
                  <div className="pv2-nhom-bar">
                    <span>{goiY.length} cửa hàng · đã chọn {daNhat}</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="pv-seg on" onClick={nhatNhom}>+ Thêm tất cả</button>
                      {daNhat > 0 && <button className="pv-seg" onClick={boNhom}>− Bỏ tất cả</button>}
                    </div>
                  </div>
                  {goiY.map((c) => {
                    const co = gio.has(c.ma_ch);
                    return (
                      <div key={c.ma_ch} className="pv2-gy">
                        <div className="pv2-gy-tt">
                          <div className="pv-o-ten">{c.ten}</div>
                          <div className="pv-o-meta"><span className="mono">{c.ma_ch}</span> · {c.khu_vuc || '—'} · {fmtLich(c)}</div>
                        </div>
                        <button className={'pv2-nhat' + (co ? ' co' : '')}
                          onClick={() => co ? bo1(c.ma_ch) : nhat1(c.ma_ch)}>{co ? '✓ Đã chọn' : '+ Thêm'}</button>
                      </div>
                    );
                  })}
                </>)}
            </div>
          </div>

          {/* CỘT PHẢI: giỏ đang chọn */}
          <div className="pv2-phai">
            <div className="pv2-gio-dau">
              <b>Đang chọn: {gio.size}</b>
              {gio.size > 0 && <button className="pv-bo" onClick={() => setGio(new Set())}>Xóa hết</button>}
            </div>
            <div className="pv2-gio-loc">
              <input className="inp" style={{ height: 32, flex: 1 }} placeholder="Lọc trong giỏ…"
                value={tim} onChange={(e) => setTim(e.target.value)} />
            </div>
            {/* Thanh tiêu đề bảng giỏ — bấm để sort, ô thoáng */}
            <div className="pv2-th">
              <button className={'pv2-th-ten' + (sapXep === 'kv' ? ' on' : '')} onClick={() => setSapXep('kv')}>
                Cửa hàng {sapXep === 'kv' && <i>▾</i>}</button>
              <button className={'pv2-th-lich' + (sapXep === 'lich' ? ' on' : '')} onClick={() => setSapXep('lich')}>
                Lịch gần nhất {sapXep === 'lich' && <i>▾</i>}</button>
              <span className="pv2-th-x" />
            </div>
            <div className="pv2-gio-ds">
              {trongGio.length === 0
                ? <div className="tq-ghi" style={{ padding: 20, textAlign: 'center' }}>Chưa chọn cửa hàng nào.<br/>Nhặt từ cột bên trái.</div>
                : trongGio.map((r) => (
                  <div key={r.ma_ch} className="pv2-hang">
                    <div className="pv2-hang-ten">
                      <div className="pv-o-ten">{r.ten}</div>
                      <div className="pv-o-meta"><span className="mono">{r.ma_ch}</span> · {r.khu_vuc || '—'}</div>
                    </div>
                    <div className="pv2-hang-lich">{fmtLich(r)}</div>
                    <button className="pv-o-bo" title="Bỏ khỏi giỏ" onClick={() => bo1(r.ma_ch)}>✕</button>
                  </div>
                ))}
            </div>
          </div>
        </div>

        <div className="pv-chan">
          <span className="tq-ghi" style={{ marginRight: 'auto' }}>
            {gio.size === 0 ? 'Chưa chọn — sẽ chia cho TẤT CẢ cửa hàng' : `Chia cho ${gio.size} cửa hàng đã chọn`}</span>
          <button className="btn pv-huy" onClick={onClose}>Hủy</button>
          {!laChung && (
            <button className="btn pv-vien" onClick={() => chot(true)}
              title="Đặt phạm vi này làm chung cho mọi mã">Áp cho tất cả mã</button>
          )}
          <button className="btn btn-ai" onClick={() => chot(false)}>
            {laChung ? 'Dùng cho tất cả mã' : 'Dùng cho mã này'}</button>
        </div>
      </div>
    </div>
  );
}
