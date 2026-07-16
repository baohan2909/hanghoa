import { useEffect, useMemo, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { Sel, DateBox } from '../lib/ui.jsx';
import { IcAlert, IcRefresh, IcBox, IcSearch, IcCheck, IcTruck } from '../lib/icons.jsx';
import { useApp } from '../App.jsx';

// ============ PHÂN HỆ THIẾU HÀNG ============
// Kiểm tra, cảnh báo, điều chuyển. Độc lập với phân hệ Đề nghị hàng.
const iso = (d) => d.toISOString().slice(0, 10);
// Server Supabase chặn tối đa 1000 dòng/lượt -> tự phân trang gộp đủ toàn bộ
const rpcAll = async (fn, args, onProgress) => {
  const KHOI = 1000; let tat = []; let i = 0;
  for (;;) {
    const { data, error } = await sb.rpc(fn, args).range(i * KHOI, i * KHOI + KHOI - 1);
    if (error) return { data: null, error };
    tat = tat.concat(data || []);
    if (onProgress) onProgress(tat.length);
    if (!data || data.length < KHOI || i > 300) break;   // i>300 = van an toàn 300k dòng
    i++;
  }
  return { data: tat, error: null };
};
const homQua = () => { const d = new Date(); d.setDate(d.getDate() - 1); return iso(d); };

export default function GiamSat() {
  const { user, baoToast } = useApp();
  const [dsCH, setDsCH] = useState([]);
  const [dsKV, setDsKV] = useState([]);
  const [pham, setPham] = useState(user.vai_tro === 'CH' ? 'ch' : 'all'); // 'ch' | 'kv' | 'all'
  const [maCH, setMaCH] = useState(user.vai_tro === 'CH' ? user.ma_ch : '');
  const [khuVuc, setKhuVuc] = useState('');
  const [tu, setTu] = useState(iso(new Date(Date.now() - 30 * 864e5)));
  const [den, setDen] = useState(homQua());
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [nhomXem, setNhomXem] = useState('ALL');
  const [locThe, setLocThe] = useState('ALL');
  const [sortBy, setSortBy] = useState(null);
  const [hoverAnh, setHoverAnh] = useState(null);
  const [xemAnh, setXemAnh] = useState(null);
  const [chiTiet, setChiTiet] = useState(null);
  const [canSX, setCanSX] = useState(null);
  const [moSX, setMoSX] = useState(false);

  useEffect(() => {
    if (user.vai_tro !== 'CH') {
      sb.from('cua_hang').select('ma_ch, ten').like('ma_ch', 'CH%')
        .eq('hoat_dong', true).order('ten').then(({ data }) => setDsCH(data || []));
      sb.rpc('fn_ds_khu_vuc').then(({ data }) => setDsKV(data || []));
    }
  }, []);

  const [daTai, setDaTai] = useState(0);
  const quet = async () => {
    const args = { p_tu: tu, p_den: den };
    if (pham === 'ch') { if (!maCH) { baoToast('Chọn cửa hàng'); return; } args.p_ma_ch = maCH; }
    else if (pham === 'kv') { if (!khuVuc) { baoToast('Chọn khu vực'); return; } args.p_khu_vuc = khuVuc; }
    // pham === 'all' -> không truyền gì = toàn hệ thống
    setBusy(true); setLocThe('ALL'); setSortBy(null); setDaTai(0); setRows(null);
    const { data, error } = await rpcAll('fn_canh_bao', args, setDaTai);
    setBusy(false);
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    setRows(data || []);
  };
  const nhieuCH = pham !== 'ch';
  const [xem, setXem] = useState('ch');   // 'ch' theo cửa hàng | 'ma' thống kê theo mã

  // THỐNG KÊ THEO MÃ: gom các dòng thiếu theo barcode, đếm số CH hết
  const theoMa = useMemo(() => {
    if (!rows) return [];
    const m = {};
    rows.forEach((r) => {
      let g = m[r.barcode];
      if (!g) g = m[r.barcode] = {
        barcode: r.barcode, sku: r.sku, ma_tham_chieu: r.ma_tham_chieu,
        nganh_3: r.nganh_3, nhom_hang: r.nhom_hang, la_hang_sale: r.la_hang_sale,
        gia_niem_yet: r.gia_niem_yet, gia_sale: r.gia_sale, hinh_url: r.hinh_url,
        kho_tong: r.kho_tong, ton_ch_khac: r.ton_ch_khac,
        so_ch_het: 0, so_ch_canh: 0, ban_tong: 0, ds_ch: [],
      };
      if (r.ton_that === 0) g.so_ch_het++; else g.so_ch_canh++;
      g.ban_tong += r.ban_30 || 0;
      g.ds_ch.push({ ten: r.ten_ch, ma: r.ma_ch, khu: r.khu_vuc, ton: r.ton_that, ngay: r.ngay_het });
    });
    return Object.values(m).map((g) => {
      // phân loại: kho/CH khác còn nhiều mà nhiều CH hết = PHÂN BỔ SAI; kho cạn = HOT cần SX
      const nguonCon = g.kho_tong + g.ton_ch_khac;
      g.loai = (g.so_ch_het >= 2 && g.kho_tong <= 0) ? 'HOT'
        : (g.so_ch_het >= 2 && nguonCon > 0) ? 'PHAN_BO'
        : 'THUONG';
      return g;
    }).sort((a, b) => b.so_ch_het - a.so_ch_het || b.ban_tong - a.ban_tong);
  }, [rows]);

  const nhomCua = (r) => (r.nhom_hang === 'BH' ? 'BH' : 'NV') + '_' + (r.la_hang_sale ? 'S' : 'C');

  const tk = useMemo(() => {
    const d = { boSung: 0, canhBao: 0, chuyen: 0, khoCon: 0, chKhac: 0, het7: 0 };
    (rows || []).forEach((r) => {
      if (r.dang === 'BO_SUNG') d.boSung++;
      if (r.dang === 'CANH_BAO') d.canhBao++;
      if (r.dang_chuyen > 0) d.chuyen++;
      if (r.ton_that === 0 && r.kho_tong > 0) d.khoCon++;
      if (r.ton_that === 0 && r.ton_ch_khac > 0) d.chKhac++;
      if (r.ngay_het >= 7) d.het7++;
    });
    return d;
  }, [rows]);

  const hien = useMemo(() => {
    if (!rows) return [];
    let v = rows;
    if (nhomXem !== 'ALL') v = v.filter((r) => nhomCua(r) === nhomXem);
    const fThe = {
      BO_SUNG: (r) => r.dang === 'BO_SUNG',
      CANH_BAO: (r) => r.dang === 'CANH_BAO',
      CHUYEN: (r) => r.dang_chuyen > 0,
      KHO: (r) => r.ton_that === 0 && r.kho_tong > 0,
      CH_KHAC: (r) => r.ton_that === 0 && r.ton_ch_khac > 0,
      HET7: (r) => r.ngay_het >= 7,
    }[locThe];
    if (fThe) v = v.filter(fThe);
    if (q) {
      const k = q.toUpperCase();
      v = v.filter((r) => [r.barcode, r.sku, r.ma_tham_chieu, r.nganh_3, r.ten_ch, r.ma_ch].some((x) => (x || '').toUpperCase().includes(k)));
    }
    if (sortBy) {
      const get = {
        ch: (r) => r.ten_ch || '', sp: (r) => r.ma_tham_chieu || r.sku || '',
        gia: (r) => r.la_hang_sale ? r.gia_sale : r.gia_niem_yet,
        ban: (r) => r.sl_ban, ban30: (r) => r.ban_30,
        that: (r) => r.ton_that, diduong: (r) => (r.ton_du_kien ?? 0) - (r.ton_that ?? 0), kho: (r) => r.kho_tong,
        chk: (r) => r.ton_ch_khac, het: (r) => r.ngay_het, muc: (r) => r.muc,
      }[sortBy.col];
      v = [...v].sort((a, b) => {
        const x = get(a), y = get(b);
        const c = typeof x === 'string' ? x.localeCompare(y) : x - y;
        return sortBy.dir === 'asc' ? c : -c;
      });
    }
    return v;
  }, [rows, nhomXem, locThe, q, sortBy]);

  const doiSort = (col) => setSortBy((s) =>
    s && s.col === col ? (s.dir === 'asc' ? { col, dir: 'desc' } : null) : { col, dir: 'asc' });
  const sortIc = (col) => sortBy?.col === col ? (sortBy.dir === 'asc' ? ' ▲' : ' ▼') : '';
  const bacThe = (id) => setLocThe((v) => v === id ? 'ALL' : id);

  const moNguon = async (r) => {
    setChiTiet({ r, ds: null });
    const { data } = await sb.rpc('fn_nguon_gan', { p_ma_ch: r.ma_ch, p_barcode: r.barcode });
    setChiTiet((c) => c && c.r.barcode === r.barcode && c.r.ma_ch === r.ma_ch ? { r, ds: data || [] } : c);
  };

  const xuatExcel = async () => {
    if (!hien.length) return;
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(hien.map((r) => ({
      'Barcode': r.barcode, 'Ma': r.ma_tham_chieu || r.sku, 'Nganh': r.nganh_1, 'Nhom': r.nganh_3,
      'Dang': r.dang === 'BO_SUNG' ? 'De nghi bo sung' : r.dang === 'CANH_BAO' ? 'Canh bao' : 'Du',
      'SL ban ky': r.sl_ban, 'Ban 30 ngay': r.ban_30,
      'Ton thuc te': r.ton_that, 'Ton du kien': r.ton_du_kien, 'Dang chuyen': r.dang_chuyen,
      'Kho tong': r.kho_tong, 'Ton CH khac': r.ton_ch_khac, 'So ngay het': r.ngay_het,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'THIEU_HANG');
    XLSX.writeFile(wb, `THIEUHANG_${maCH}_${iso(new Date())}.xlsx`);
    baoToast(`Da xuat ${hien.length} ma`);
  };

  const taiCanSX = async () => {
    const { data, error } = await rpcAll('fn_can_san_xuat', { p_so_ngay: 30 });
    if (!error) { setCanSX(data || []); setMoSX(true); } else baoToast('Loi: ' + error.message);
  };
  const xuatCanSX = async () => {
    if (!canSX?.length) return;
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(canSX.map((r) => ({
      'Barcode': r.barcode, 'Ma': r.ma_tham_chieu || '', 'SKU': r.sku || '',
      'Nganh': r.nganh_1 || '', 'Nhom': r.nganh_3 || '',
      'Ban 30 ngay (toan HT)': r.ban_toan_ht, 'So CH ban': r.so_ch_ban,
      'Ton con o CH': r.ton_con_o_ch, 'Kho tong': r.kho_tong, 'Ban gan nhat': r.ngay_ban_cuoi,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'CAN_SAN_XUAT');
    XLSX.writeFile(wb, `CAN_SAN_XUAT_${iso(new Date())}.xlsx`);
    baoToast(`Da xuat ${canSX.length} ma can san xuat`);
  };

  const anhProps = (r) => ({
    onMouseEnter: (e) => r.hinh_url && setHoverAnh({ url: r.hinh_url, x: e.clientX + 20, y: e.clientY - 80 }),
    onMouseLeave: () => setHoverAnh(null),
    onClick: () => r.hinh_url && setXemAnh(r.hinh_url),
  });

  const dsBoSung = hien.filter((r) => r.dang === 'BO_SUNG');
  const dsCanhBao = hien.filter((r) => r.dang === 'CANH_BAO');
  const dsDu = hien.filter((r) => r.dang === 'DU');

  return (
    <>
      <div className="cmdbar">
        <div className="cmd-title">
          <h2>Thiếu hàng</h2>
          <p>Kiểm tra tình trạng thiếu hàng theo khoảng thời gian — đề nghị bổ sung, cảnh báo, tìm nguồn điều chuyển gần nhất.</p>
        </div>
        <div className="cmd-row">
          {user.vai_tro !== 'CH' && (
            <>
              <Sel value={pham} onChange={setPham} placeholder="Phạm vi"
                options={[{ value: 'all', label: 'Tất cả cửa hàng' }, { value: 'kv', label: 'Theo khu vực' }, { value: 'ch', label: 'Một cửa hàng' }]}
                style={{ minWidth: 150 }} />
              {pham === 'kv' && (
                <Sel value={khuVuc} onChange={setKhuVuc} placeholder="Chọn khu vực"
                  options={dsKV.map((k) => ({ value: k.khu_vuc, label: `${k.khu_vuc} (${k.so_ch} CH)` }))} style={{ minWidth: 220 }} />
              )}
              {pham === 'ch' && (
                <Sel value={maCH} onChange={setMaCH} placeholder="Chọn cửa hàng"
                  options={dsCH.map((c) => ({ value: c.ma_ch, label: `${c.ten} (${c.ma_ch})` }))} style={{ minWidth: 240 }} />
              )}
            </>
          )}
          <DateBox label="Ngày từ" value={tu} onChange={setTu} />
          <DateBox label="Ngày đến" value={den} onChange={setDen} />
          <button className="btn btn-primary" onClick={quet} disabled={busy}>
            <IcSearch /> {busy ? 'Đang kiểm tra…' : 'Kiểm tra thiếu hàng'}
          </button>
          {rows && <span className="sla-chip">{hien.length} mã</span>}
        </div>
      </div>

      {rows && (
        <>
          <div className="th-cards">
            <TheTK id="BO_SUNG" on={locThe} set={bacThe} so={tk.boSung} nhan="Cần bổ sung" mau="magenta" />
            <TheTK id="CANH_BAO" on={locThe} set={bacThe} so={tk.canhBao} nhan="Cảnh báo" mau="gold" />
            <TheTK id="HET7" on={locThe} set={bacThe} so={tk.het7} nhan="Hết > 7 ngày" mau="magenta" />
            <TheTK id="CHUYEN" on={locThe} set={bacThe} so={tk.chuyen} nhan="Đang điều chuyển" mau="teal" />
            <TheTK id="KHO" on={locThe} set={bacThe} so={tk.khoCon} nhan="Kho tổng còn" mau="teal" />
            <TheTK id="CH_KHAC" on={locThe} set={bacThe} so={tk.chKhac} nhan="CH khác còn" mau="teal" />
          </div>

          <div className="toolbar">
            {nhieuCH && (
              <div className="nhom-tabs" style={{ margin: 0 }}>
                <button className={'nhom-tab' + (xem === 'ch' ? ' on' : '')} onClick={() => setXem('ch')}>Theo cửa hàng</button>
                <button className={'nhom-tab' + (xem === 'ma' ? ' on' : '')} onClick={() => setXem('ma')}>Thống kê theo mã</button>
                <button className={'nhom-tab' + (xem === 'sx' ? ' on' : '')}
                  onClick={() => { setXem('sx'); if (!canSX) taiCanSX(); }}>Cần sản xuất</button>
              </div>
            )}
            <div className="nhom-tabs" style={{ margin: 0 }}>
              {[['ALL', 'Tất cả'], ['BH_C', 'BH chính'], ['BH_S', 'BH sale'], ['NV_C', 'NV chính'], ['NV_S', 'NV sale']].map(([n, ten]) => (
                <button key={n} className={'nhom-tab' + (nhomXem === n ? ' on' : '')} onClick={() => setNhomXem(n)}>
                  {ten}
                </button>
              ))}
            </div>
            <div style={{ position: 'relative' }}>
              <input type="search" placeholder="Barcode, SKU, mã" value={q}
                onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 34, width: 220 }} />
              <span style={{ position: 'absolute', left: 10, top: 10, color: 'var(--ink-2)' }}><IcSearch /></span>
            </div>
            {locThe !== 'ALL' && <button className="btn btn-ghost" onClick={() => setLocThe('ALL')}>Bỏ lọc thẻ</button>}
            <button className="btn btn-gold" style={{ marginLeft: 'auto' }} onClick={xuatExcel}>Xuất Excel</button>
          </div>

          {xem === 'sx' ? (
            <BangCanSX ds={canSX} busy={!canSX} xuat={xuatCanSX}
              q={q} nhomXem={nhomXem} />
          ) : xem === 'ma' && nhieuCH ? (
            <BangTheoMa ds={theoMa.filter((g) => nhomXem === 'ALL' || (g.nhom_hang === 'BH' ? 'BH' : 'NV') + '_' + (g.la_hang_sale ? 'S' : 'C') === nhomXem)
              .filter((g) => !q || [g.barcode, g.sku, g.ma_tham_chieu, g.nganh_3].some((x) => (x || '').toUpperCase().includes(q.toUpperCase())))} />
          ) : (
          <div className="card" style={{ padding: 0 }}>
            <div className="tbl-wrap" style={{ maxHeight: '68vh' }}>
              <table className="tbl">
                <thead><tr>
                  {nhieuCH && <th className="sortable" onClick={() => doiSort('ch')}>Cửa hàng{sortIc('ch')}</th>}
                  <th className="sortable col-sp" onClick={() => doiSort('sp')}>Sản phẩm{sortIc('sp')}</th>
                  <th className="num sortable" onClick={() => doiSort('gia')}>Giá{sortIc('gia')}</th>
                  <th className="num sortable" onClick={() => doiSort('ban')}>SL bán kỳ{sortIc('ban')}</th>
                  <th className="num sortable" onClick={() => doiSort('ban30')}>Bán 30N{sortIc('ban30')}</th>
                  <th className="num sortable" onClick={() => doiSort('that')}>Tồn CH{sortIc('that')}</th>
                                    <th className="num sortable" onClick={() => doiSort('kho')}>Kho tổng{sortIc('kho')}</th>
                  <th className="num sortable" onClick={() => doiSort('chk')}>CH khác{sortIc('chk')}</th>
                  <th className="num sortable" onClick={() => doiSort('het')}>Ngày hết{sortIc('het')}</th>
                  <th className="center">Tình trạng</th>
                  <th className="center">Nguồn gần</th>
                </tr></thead>
                <tbody>
                  {dsBoSung.length > 0 && <RowNhom ten="ĐỀ NGHỊ BỔ SUNG — khẩn cấp" mau="magenta" />}
                  {dsBoSung.map((r) => <RowSP key={r.ma_ch+r.barcode} r={r} anhProps={anhProps} moNguon={moNguon} nhieuCH={nhieuCH} />)}
                  {dsCanhBao.length > 0 && <RowNhom ten="CẢNH BÁO — còn tồn nhưng thiếu" mau="gold" />}
                  {dsCanhBao.map((r) => <RowSP key={r.ma_ch+r.barcode} r={r} anhProps={anhProps} moNguon={moNguon} nhieuCH={nhieuCH} />)}
                  {dsDu.length > 0 && locThe === 'ALL' && <RowNhom ten="ĐỦ HÀNG" mau="teal" />}
                  {locThe === 'ALL' && dsDu.map((r) => <RowSP key={r.ma_ch+r.barcode} r={r} anhProps={anhProps} moNguon={moNguon} nhieuCH={nhieuCH} />)}
                </tbody>
              </table>
            </div>
            {!hien.length && <div className="empty">
              <div className="t">Không có mã nào theo bộ lọc</div>
              Thử đổi khoảng ngày hoặc bỏ lọc thẻ.
            </div>}
          </div>
          )}

        </>
      )}

      {busy && (
        <div className="card quet-load" style={{ marginTop: 20 }}>
          <div className="quet-ring" />
          <div className="quet-t">Đang quét thiếu hàng…</div>
          <div className="quet-s">{daTai > 0 ? `đã tải ${daTai.toLocaleString('vi-VN')} mã` : 'đang kết nối dữ liệu'}</div>
        </div>
      )}

      {!rows && !busy && (
        <div className="empty" style={{ marginTop: 30 }}>
          <div className="t">Chọn cửa hàng và khoảng ngày, rồi bấm "Kiểm tra thiếu hàng"</div>
          Hệ thống quét mã đã bán / hết hàng / còn tồn nhưng thiếu, kèm nguồn điều chuyển gần nhất.
        </div>
      )}

      {hoverAnh && (
        <img className="sp-zoom" src={hoverAnh.url} alt=""
          style={{ left: Math.min(hoverAnh.x, window.innerWidth - 210), top: Math.max(hoverAnh.y, 10) }} />
      )}
      {xemAnh && (
        <div className="img-lightbox" onClick={() => setXemAnh(null)}>
          <img src={xemAnh} alt="" />
        </div>
      )}

      {chiTiet && (
        <div className="ng-overlay" onClick={() => setChiTiet(null)}>
          <div className="ng-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ng-head">
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{chiTiet.r.ma_tham_chieu || chiTiet.r.sku}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>{chiTiet.r.nganh_3} · Nguồn còn hàng gần nhất</div>
              </div>
              <button className="ng-close" onClick={() => setChiTiet(null)}>✕</button>
            </div>
            <div className="ng-sum">
              <span>Kho tổng: <b style={{ color: chiTiet.r.kho_tong > 0 ? 'var(--teal-deep)' : 'var(--magenta)' }}>{chiTiet.r.kho_tong}</b></span>
              <span>Tồn ở CH khác: <b>{chiTiet.r.ton_ch_khac}</b> ({chiTiet.r.so_ch_khac} CH)</span>
            </div>
            {!chiTiet.ds ? <div className="empty" style={{ padding: 20 }}>Đang tìm nguồn gần…</div>
              : chiTiet.ds.length === 0 ? <div className="empty" style={{ padding: 20 }}>
                  <div className="t">Không nơi nào còn hàng</div>Cần sản xuất / tái bản mã này.</div>
              : (
                <div className="ng-list">
                  {chiTiet.ds.map((n) => (
                    <div key={n.ma_ch} className="ng-item">
                      <div className="ng-item-l">
                        {n.la_kho_tong
                          ? <span className="chip teal" style={{ marginRight: 6 }}>KHO TỔNG</span>
                          : <span className="ng-dist">{n.khoang_cach != null ? n.khoang_cach.toFixed(1) + ' km' : '—'}</span>}
                        <span>{n.ten}</span>
                      </div>
                      <div className="ng-item-r"><b>{n.ton}</b>{(n.ton_du_kien - n.ton) > 0 && <span className="ng-du"> (+{n.ton_du_kien - n.ton} đi đường)</span>}</div>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </div>
      )}
    </>
  );
}

function TheTK({ id, on, set, so, nhan, mau }) {
  return (
    <button className={'th-card th-' + mau + (on === id ? ' on' : '')} onClick={() => set(id)}>
      <span className="th-so">{so}</span>
      <span className="th-nhan">{nhan}</span>
    </button>
  );
}

function RowNhom({ ten, mau }) {
  return (<tr className="row-nhom"><td colSpan={12}><span className={'row-nhom-tag row-nhom-' + mau}>{ten}</span></td></tr>);
}

function RowSP({ r, anhProps, moNguon, nhieuCH }) {
  const gia = r.la_hang_sale ? r.gia_sale : r.gia_niem_yet;
  const bac = r.dang === 'BO_SUNG' ? 'can-chia' : r.dang === 'CANH_BAO' ? 'thuong' : '';
  const hetNgay = r.ton_that === 0 && r.ngay_het > 0;
  const tt = r.ton_that === 0
    ? (r.ngay_het === 0 ? <>Hết hàng<br/>trong ngày</> : <>Hết hàng<br/>{r.ngay_het} ngày</>)
    : r.dang === 'CANH_BAO' ? <>Sắp hết<br/>~{r.muc} ngày</> : 'Đủ hàng';
  const ttMau = r.ton_that === 0 ? 'tt-het' : r.dang === 'CANH_BAO' ? 'tt-cham' : 'tt-tot';
  const dangChuyen = r.dang_chuyen > 0;
  return (
    <tr className={bac ? 'row-' + bac : undefined}>
      {nhieuCH && <td>
        <div style={{ fontWeight: 600, fontSize: 12.5 }}>{r.ten_ch}</div>
        <div style={{ fontSize: 11, color: 'var(--ink-2)' }} className="mono">{r.khu_vuc || r.ma_ch}</div>
      </td>}
      <td className="col-sp">
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div className="sp-thumb" {...anhProps(r)}>
            {r.hinh_url ? <img src={r.hinh_url} alt="" onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.insertAdjacentHTML('beforeend', '<span style="color:var(--ink-2)">▢</span>'); }} /> : <IcBox />}
          </div>
          <div>
            <div className="mono" style={{ fontWeight: 600 }}>{r.ma_tham_chieu || r.sku}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>{r.nganh_3}{r.la_hang_sale ? ' · sale' : ''}</div>
          </div>
        </div>
      </td>
      <td className="num">{gia ? gia.toLocaleString('vi-VN') + 'đ' : '—'}</td>
      <td className="num" style={{ fontWeight: 700 }}>{r.sl_ban}</td>
      <td className="num" style={{ color: 'var(--ink-2)' }}>{r.ban_30}</td>
      <td className="num" style={{ fontWeight: 700 }}>
        <span style={{ color: r.ton_that === 0 ? 'var(--magenta)' : 'var(--ink)' }}>{r.ton_that}</span>
        {(() => { const di = (r.ton_du_kien ?? 0) - (r.ton_that ?? 0);
          return di !== 0
            ? <b style={{ color: di > 0 ? 'var(--teal-deep)' : 'var(--magenta)', marginLeft: 3, fontSize: 12 }}>{di > 0 ? '+' + di : di}</b>
            : null; })()}
      </td>
      <td className="num" style={{ color: r.kho_tong > 0 ? 'var(--teal-deep)' : 'var(--magenta)', fontWeight: 600 }}>{r.kho_tong}</td>
      <td className="num">{r.ton_ch_khac > 0 ? <span style={{ color: 'var(--teal-deep)' }}>{r.ton_ch_khac}</span> : <span style={{ color: 'var(--ink-2)' }}>0</span>}</td>
      <td className="num">{r.ton_that === 0 && r.ngay_het > 0 ? <b>{r.ngay_het}d</b> : '—'}</td>
      <td className="center"><span className={'tt ' + ttMau}>{tt}</span></td>
      <td className="center">
        {(r.kho_tong > 0 || r.ton_ch_khac > 0)
          ? <button className="btn-mini" onClick={() => moNguon(r)}>Tìm nguồn</button>
          : <span style={{ fontSize: 11, color: 'var(--magenta)' }}>Cần SX</span>}
      </td>
    </tr>
  );
}


// ===== Bảng CẦN SẢN XUẤT / TÁI BẢN — toàn hệ thống (chế độ xem riêng) =====
function BangCanSX({ ds, busy, xuat, q, nhomXem }) {
  if (busy) return <div className="empty" style={{ marginTop: 12 }}>
    <div className="t">Đang quét toàn hệ thống…</div>Mã có bán 30 ngày nhưng kho tổng đã cạn.</div>;
  let v = ds || [];
  if (nhomXem !== 'ALL') v = v.filter((g) => ((g.nhom_hang === 'BH' ? 'BH' : 'NV') + '_' + (g.la_hang_sale ? 'S' : 'C')) === nhomXem);
  if (q) { const k = q.toUpperCase();
    v = v.filter((g) => [g.barcode, g.sku, g.ma_tham_chieu, g.nganh_3].some((x) => (x || '').toUpperCase().includes(k))); }
  if (!v.length) return <div className="empty" style={{ marginTop: 12 }}>
    <div className="t">Không có mã nào cần sản xuất</div>Mọi mã đang bán đều còn nguồn ở kho tổng.</div>;
  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
          Mã có bán trong 30 ngày (toàn hệ thống) nhưng <b style={{ color: 'var(--magenta)' }}>kho tổng đã cạn</b> — xếp theo mức bán giảm dần, bán càng nhiều càng cần sản xuất gấp.
        </div>
        <button className="btn btn-gold" style={{ marginLeft: 'auto', flexShrink: 0 }} onClick={xuat}>Xuất Excel ({v.length})</button>
      </div>
      <div className="tbl-wrap" style={{ maxHeight: '62vh' }}>
        <table className="tbl">
          <thead><tr>
            <th className="col-sp">Sản phẩm</th><th className="num">Bán 30N</th><th className="num">Số CH bán</th>
            <th className="num">Tồn còn ở CH</th><th className="num">Kho tổng</th><th>Bán gần nhất</th>
          </tr></thead>
          <tbody>
            {v.map((r) => (
              <tr key={r.barcode}>
                <td className="col-sp"><div className="mono" style={{ fontWeight: 600 }}>{r.ma_tham_chieu || r.sku}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>{r.nganh_3}{r.la_hang_sale ? ' · sale' : ''}</div></td>
                <td className="num" style={{ fontWeight: 700, color: 'var(--teal-deep)' }}>{r.ban_toan_ht}</td>
                <td className="num">{r.so_ch_ban}</td>
                <td className="num">{r.ton_con_o_ch}</td>
                <td className="num" style={{ color: 'var(--magenta)', fontWeight: 700 }}>{r.kho_tong}</td>
                <td>{r.ngay_ban_cuoi ? String(r.ngay_ban_cuoi).split('-').reverse().join('/') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===== Bảng THỐNG KÊ THEO MÃ: mã hot / phân bổ sai =====
function BangTheoMa({ ds }) {
  const [moRong, setMoRong] = useState({});
  const nhan = { HOT: 'Mã HOT — cần sản xuất', PHAN_BO: 'Phân bổ sai — điều chuyển', THUONG: '' };
  const mau = { HOT: 'row-nhom-magenta', PHAN_BO: 'row-nhom-gold', THUONG: '' };
  if (!ds.length) return <div className="empty" style={{ marginTop: 12 }}>
    <div className="t">Chưa có mã nào thiếu ở nhiều cửa hàng</div></div>;
  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="tbl-wrap" style={{ maxHeight: '68vh' }}>
        <table className="tbl">
          <thead><tr>
            <th>Sản phẩm</th><th className="num">Số CH hết</th><th className="num">CH cảnh báo</th>
            <th className="num">Bán 30N (tổng)</th><th className="num">Kho tổng</th><th className="num">CH khác còn</th>
            <th>Phân loại</th><th></th>
          </tr></thead>
          <tbody>
            {ds.map((g) => (
              <>
                <tr key={g.barcode} className={g.loai === 'HOT' ? 'row-can-chia' : g.loai === 'PHAN_BO' ? 'row-thuong' : undefined}>
                  <td>
                    <div className="mono" style={{ fontWeight: 600 }}>{g.ma_tham_chieu || g.sku}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>{g.nganh_3}{g.la_hang_sale ? ' · sale' : ''}</div>
                  </td>
                  <td className="num"><b style={{ fontSize: 16, color: 'var(--magenta)' }}>{g.so_ch_het}</b></td>
                  <td className="num" style={{ color: 'var(--ink-2)' }}>{g.so_ch_canh}</td>
                  <td className="num" style={{ fontWeight: 600, color: 'var(--teal-deep)' }}>{g.ban_tong}</td>
                  <td className="num" style={{ color: g.kho_tong > 0 ? 'var(--teal-deep)' : 'var(--magenta)', fontWeight: 600 }}>{g.kho_tong}</td>
                  <td className="num">{g.ton_ch_khac}</td>
                  <td>{g.loai !== 'THUONG'
                    ? <span className={'row-nhom-tag ' + mau[g.loai]}>{nhan[g.loai]}</span>
                    : <span style={{ fontSize: 11, color: 'var(--ink-2)' }}>—</span>}</td>
                  <td>
                    <button className="btn-mini" onClick={() => setMoRong((m) => ({ ...m, [g.barcode]: !m[g.barcode] }))}>
                      {moRong[g.barcode] ? 'Ẩn' : `${g.ds_ch.length} CH`}
                    </button>
                  </td>
                </tr>
                {moRong[g.barcode] && (
                  <tr><td colSpan={8} style={{ background: 'var(--bg)', padding: '6px 12px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {g.ds_ch.map((c, i) => (
                        <span key={i} className="ch-tag">
                          {c.ten} <b style={{ color: c.ton === 0 ? 'var(--magenta)' : 'var(--ink)' }}>
                            {c.ton === 0 ? `hết ${c.ngay}d` : `còn ${c.ton}`}</b>
                        </span>
                      ))}
                    </div>
                  </td></tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
