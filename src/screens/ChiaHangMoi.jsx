import { isoVN, Sel } from '../lib/ui.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  qTC: '', goiYTC: [], thamChieu: null, tong: '', ct: null, batchId: null, moRong: true });

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
  const [tc, setTc] = useState({ q: '', chon: null, goiY: [], sl: null });  // dòng tham chiếu
  const tcRef = useRef(null);
  const [tdCH, setTdCH] = useState({});   // ma_ch -> sp/ngày (cột tham chiếu)
  const timRef = useRef({});

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
  }, []);

  const capNhat = (id, patch) => setDong((ds) => ds.map((d) => d.id === id ? { ...d, ...patch } : d));

  const goTim = (id, field, v) => {
    capNhat(id, field === 'sp' ? { q: v, sp: null } : { qTC: v, thamChieu: null });
    const key = id + field;
    clearTimeout(timRef.current[key]);
    if (v.trim().length < 1) { capNhat(id, field === 'sp' ? { goiY: [] } : { goiYTC: [] }); return; }
    timRef.current[key] = setTimeout(async () => {
      const { data, error } = await sb.rpc('fn_tim_sp', { p_q: v.trim() });
      if (error) { baoToast('Lỗi tìm kiếm: ' + error.message); return; }
      capNhat(id, field === 'sp' ? { goiY: data || [] } : { goiYTC: data || [] });
    }, 300);
  };
  const chonSP = (id, g) => capNhat(id, { sp: g, q: g.ma_tham_chieu || g.sku || g.barcode, goiY: [], nganh3: g.nganh_3 || '' });
  const chonTC = (id, g) => capNhat(id, { thamChieu: g, qTC: g.ma_tham_chieu || g.sku || g.barcode, goiYTC: [] });

  const chiaDong = async (d) => {
    if (!d.sp || !d.tong || (!d.nganh3 && !d.thamChieu)) {
      baoToast('Dòng thiếu: sản phẩm, tổng SL và (ngành cấp 3 hoặc mã tham chiếu)'); return false;
    }
    const gọiChia = () => sb.rpc('fn_chia_hang_moi_v2', {
      p_barcode: d.sp.barcode, p_nganh3: d.nganh3 || null, p_tong: parseInt(d.tong),
      p_nguoi: user.ma_dang_nhap, p_tham_chieu: d.thamChieu?.barcode || null,
      p_tham_chieu_ma: d.thamChieu?.ma_tham_chieu || null });
    let { data: id, error } = await gọiChia();
    // 57014 = statement timeout: lần đầu làm nóng bộ đệm, thử lại một lần nữa
    if (error && (error.code === '57014' || /timeout/i.test(error.message || ''))) {
      await new Promise((r) => setTimeout(r, 400));
      ({ data: id, error } = await gọiChia());
    }
    if (error) {
      baoToast(error.code === '57014' || /timeout/i.test(error.message || '')
        ? 'Máy chủ đang bận, thử lại sau giây lát'
        : 'Lỗi: ' + error.message);
      return false;
    }
    const { data, error: e2 } = await sb.from('chia_hang_moi_ct')
      .select('*').eq('batch_id', id).order('sl_de_xuat', { ascending: false });
    if (e2) { baoToast('Lỗi đọc kết quả: ' + e2.message); return false; }
    if (!data || !data.length) {
      baoToast(d.thamChieu ? 'Mã tham chiếu chưa có bán 60 ngày — thử mã khác' : 'Ngành này chưa có bán 60 ngày — hãy chọn MÃ THAM CHIẾU tương tự để chia');
    }
    capNhat(d.id, { ct: data || [], batchId: id });
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
    const daChia = dong.filter((d) => d.ct && d.batchId);
    if (!daChia.length) { baoToast('Chưa có dòng nào được chia'); return; }
    for (const d of daChia) {
      await Promise.all(d.ct.map((r) => sb.from('chia_hang_moi_ct').update({ sl_chot: r.sl_chot }).eq('id', r.id)));
      await sb.from('chia_hang_moi').update({ trang_thai: 'CHOT' }).eq('id', d.batchId);
    }
    // Mã phiếu cột E: HM + YYYYMMDD + kho cho + kho nhận + STT trong ngày
    // STT tăng dần theo TỪNG CẶP (kho cho, kho nhận) trong lần xuất này
    const ngay = isoVN().replace(/-/g, '');
    const dem = {};
    const rowsX = [];
    daChia.forEach((d) => {
      const khoCho = khoNguon(d.sp) || 'KHO';
      d.ct.filter((r) => r.sl_chot > 0).forEach((r) => {
        const cap = khoCho + '|' + r.ma_ch;
        dem[cap] = (dem[cap] || 0) + 1;
        const stt = String(dem[cap]).padStart(2, '0');
        const maPhieu = `HM${ngay}-${khoCho}-${r.ma_ch}-${stt}`;
        rowsX.push({
          'Kho nguồn': khoCho,
          'Kho đích': r.ma_ch,
          'SKU/ Barcode': d.sp.sku || d.sp.barcode,
          'Số lượng': r.sl_chot,
          'Mã phiếu': maPhieu,
        });
      });
    });
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(rowsX, {
      header: ['Kho nguồn', 'Kho đích', 'SKU/ Barcode', 'Số lượng', 'Mã phiếu'] });
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
      setTdCH(Object.fromEntries((data || []).map((x) => [x.ma_ch, x.moi_ngay])));
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

      {dong.map((d, i) => (
        <div key={d.id} className="card" style={{ marginTop: 12, padding: 14 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ position: 'relative', flex: '1 1 240px' }}>
              <div className="lbl">Mã hàng mới #{i + 1}</div>
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
              <div className="lbl">Mã tham chiếu (tùy chọn — ưu tiên hơn ngành)</div>
              <input className="inp" style={{ width: '100%' }}
                placeholder="Mã cũ tương tự…" value={d.qTC} onChange={(e) => goTim(d.id, 'tc', e.target.value)} />
              {d.goiYTC.length > 0 && (
                <div className="goiy-pop">
                  {d.goiYTC.map((g) => (
                    <div key={g.barcode} className="goiy-item" style={{ cursor: 'pointer' }} onClick={() => chonTC(d.id, g)}>
                      <AnhMini url={g.hinh_url} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="mono" style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--teal-deep)' }}>{g.ma_tham_chieu || g.sku}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>{g.nganh_3}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ flex: '0 0 110px' }}>
              <div className="lbl">Tổng SL</div>
              <input className="inp" type="number" min="1" style={{ width: '100%' }}
                value={d.tong} onChange={(e) => capNhat(d.id, { tong: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {!d.ct && <button className="btn btn-primary" disabled={busy} onClick={() => chiaDong(d)}>Chia</button>}
              {dong.length > 1 && <button className="btn-mini btn-danger" onClick={() => setDong((ds) => ds.filter((x) => x.id !== d.id))}>－</button>}
            </div>
          </div>

          {d.thamChieu && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--teal-deep)' }}>
              Chia theo tỷ trọng bán của <b className="mono">{d.thamChieu.ma_tham_chieu || d.thamChieu.sku}</b> (60 ngày)
            </div>
          )}

          {d.ct && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <b style={{ fontSize: 13 }}>Kết quả: {d.ct.length} cửa hàng · {d.ct.reduce((s, r) => s + (r.sl_chot || 0), 0)} sp</b>
                <button className="btn-mini" onClick={() => capNhat(d.id, { moRong: !d.moRong })}>{d.moRong ? 'Thu gọn' : 'Mở rộng'}</button>
                <button className="btn-mini" onClick={() => capNhat(d.id, { ct: null, batchId: null })}>Chia lại</button>
              </div>
              {d.moRong && (
                <div className="tbl-wrap" style={{ maxHeight: '40vh' }}>
                  <table className="tbl">
                    <thead><tr><th>Cửa hàng</th><th className="ct-giua">Khu vực</th>
                      <th className="ct-giua">Tỷ lệ</th><th className="ct-giua">Đề xuất</th>
                      <th className="ct-giua">Chốt</th><th style={{ width: 34 }}></th></tr></thead>
                    <tbody>
                      {d.ct.map((r) => (
                        <tr key={r.id}>
                          <td><b>{tenCH[r.ma_ch] || r.ma_ch}</b> <span style={{ color: 'var(--ink-2)', fontSize: 11 }}>{r.ma_ch}</span></td>
                          <td className="ct-giua">{kvCH[r.ma_ch] || '—'}</td>
                          <td className="ct-giua">{Math.round((r.ty_le || 0) * 100)}%</td>
                          <td className="ct-giua">{r.sl_de_xuat}</td>
                          <td className="ct-giua"><input className="qty-input" type="number" min="0" value={r.sl_chot}
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
              <span className="ds-tc-lbl">Cột Bán/ngày tính theo:</span>
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
                  <b>{tc.sl.moi_ngay}</b><span>sp/ngày</span>
                  <i>· {fmtN(tc.sl.ban_30)} bán 30n · {tc.sl.so_ch} cửa hàng</i>
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
                    <th className="ds-ch ds-sort" onClick={() => sortCot('ten')}>
                      Cửa hàng{muiTen('ten')}</th>
                    <th className="ds-kv ds-sort" onClick={() => sortCot('kv')}>
                      Khu vực{muiTen('kv')}</th>
                    <th className="ds-tc-col ds-sort" onClick={() => sortCot('tc')}
                      title={tc.chon ? `Tốc độ bán ${tc.chon.nhan} mỗi ngày tại từng cửa hàng`
                                     : 'Tốc độ bán mỗi ngày tại từng cửa hàng'}>
                      Bán/ngày{muiTen('tc')}
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
                  {banDS.hang.map((h) => (
                    <tr key={h.ma_ch}>
                      <td className="ds-ch"><b>{h.ten}</b><span className="ds-ch-ma">{h.ma_ch}</span></td>
                      <td className="ds-kv">{h.khu_vuc || '—'}</td>
                      <td className="ds-tc-col">{tdCH[h.ma_ch] != null
                        ? <b>{tdCH[h.ma_ch]}</b> : <span className="ds-khong">·</span>}</td>
                      {banDS.ma.map((m) => (
                        <td key={m.id} className="ds-o">
                          {h.o[m.id] != null ? (
                            <input className={'ds-in ' + (m.bh ? 'bh' : 'nv')} type="number" min="0" value={h.o[m.id]}
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
                    <td className="ds-ch">Tổng</td>
                    <td className="ds-kv" />
                    <td className="ds-tc-col" />
                    {banDS.cotTong.map((c, i2) => (
                      <td key={c.id} className={'ds-tong-cot ' + (banDS.ma[i2]?.bh ? 'bh' : 'nv')}>{c.tong}</td>
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
    </div>
  );
}
