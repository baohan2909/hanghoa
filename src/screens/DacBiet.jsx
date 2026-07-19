import { isoVN } from '../lib/ui.jsx';
import { useEffect, useRef, useState } from 'react';
import { sb, rpcHet } from '../lib/supabase.js';
import { IcSearch, IcBox } from '../lib/icons.jsx';
import { useApp } from '../App.jsx';
import BaoCaoMaMoi from './BaoCaoMaMoi.jsx';

// ===== HÀNG ĐẶC BIỆT — Thu hồi & Hàng mới (Điều phối kiểm soát, KHÔNG chia tự động) =====
const fmtVND = (n) => (n || 0).toLocaleString('vi-VN') + 'đ';
const fmtNgay = (d) => d ? String(d).split('T')[0].split('-').reverse().join('/') : '—';
const laBH = (n1) => (n1 || '').includes('bảo hiểm') || (n1 || '').includes('Mũ');

const BadgeNganh = ({ n1 }) => {
  const bh = laBH(n1);
  return <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 10px', borderRadius: 10, whiteSpace: 'nowrap',
    background: bh ? '#E4F5F0' : '#F7EFDE', color: bh ? 'var(--teal-deep)' : '#8A6D2F' }}>
    {bh ? 'Mũ bảo hiểm' : 'Nón vải'}</span>;
};

export default function DacBiet() {
  const { user, baoToast } = useApp();
  const [tab, setTab] = useState('THU_HOI');
  const [ds, setDs] = useState(null);
  // tìm để thêm
  const [q, setQ] = useState('');
  const [goiY, setGoiY] = useState(null);        // null = chưa tìm, [] = không thấy
  const [dangTim, setDangTim] = useState(false);
  const timRef = useRef(null);
  // khối mã tạo gần đây
  const [soNgay, setSoNgay] = useState(30);
  const [tatCa, setTatCa] = useState(false);
  const [tuMM, setTuMM] = useState('');   // khoảng ngày tạo mã (tùy chọn)
  const [denMM, setDenMM] = useState('');
  const [maMoi, setMaMoi] = useState(null);
  const [locNganh, setLocNganh] = useState('ALL');
  const [qMoi, setQMoi] = useState('');
  const [sortMoi, setSortMoi] = useState({ key: 'ngay', dir: -1 });
  // ảnh hover + lightbox (như Đề nghị hàng)
  const [hoverAnh, setHoverAnh] = useState(null);
  const [xemAnh, setXemAnh] = useState(null);
  // Panel bán theo cửa hàng (kiểm soát hàng mới toàn diện — CHỈ số lượng)
  const [xemBan, setXemBan] = useState(null);   // {sp, rows|null, tu, den}
  const [theBan, setTheBan] = useState('ban');   // thẻ: ban | ton | het
  const [sortP, setSortP] = useState({ k: null, d: -1 });   // sort bảng panel
  const doiSortP = (k) => setSortP((c) => ({ k, d: c.k === k ? -c.d : -1 }));
  const icSortP = (k) => <span style={{ opacity: sortP.k === k ? 1 : .3, fontSize: 10 }}>{sortP.k === k && sortP.d === 1 ? ' ▲' : ' ▼'}</span>;
  const isoD = (d) => isoVN(d);
  const moBan = async (sp, tu, den) => {
    tu = tu || isoD(new Date(Date.now() - 30 * 864e5));
    den = den || isoD(new Date());
    setTheBan('ban');
    setXemBan({ sp, rows: null, tu, den });
    const { data, error } = await sb.rpc('fn_ban_theo_ch',
      { p_barcode: sp.barcode, p_ma_tc: sp.ma_tham_chieu, p_tu: tu, p_den: den });
    if (error) { baoToast('Lỗi: ' + error.message); setXemBan(null); return; }
    setXemBan({ sp, rows: data || [], tu, den });
  };
  const doiNgayBan = (tu, den) => xemBan && moBan(xemBan.sp, tu, den);
  const anhProps = (url) => ({
    onMouseEnter: (e) => url && setHoverAnh({ url, x: e.clientX + 20, y: e.clientY - 80 }),
    onMouseLeave: () => setHoverAnh(null),
    onClick: (e) => { if (url) { e.stopPropagation(); setXemAnh(url); } },
    style: url ? { cursor: 'zoom-in' } : undefined,
  });

  const taiDS = async () => {
    const { data, error } = await sb.rpc('fn_dacbiet_ds');
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    setDs(data || []);
  };
  useEffect(() => { taiDS(); }, []);

  const taiMaMoi = async (n, all, tu, den) => {
    setMaMoi(null);
    const arg = tu && den
      ? { p_tu: tu, p_den: den }
      : { p_so_ngay: n, p_tat_ca: !!all };
    const { data, error } = await rpcHet('fn_ma_moi_ds', arg);
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    setMaMoi(data || []);
  };
  useEffect(() => { if (tab === 'HANG_MOI') taiMaMoi(soNgay, tatCa, tuMM, denMM); }, [tab, soNgay, tatCa, tuMM, denMM]);

  // Tìm gợi ý (debounce 300ms, từ 2 ký tự, báo rõ trạng thái)
  const goTim = (v) => {
    setQ(v);
    clearTimeout(timRef.current);
    if (v.trim().length < 1) { setGoiY(null); setDangTim(false); return; }
    setDangTim(true);
    timRef.current = setTimeout(async () => {
      const { data, error } = await sb.rpc('fn_tim_sp', { p_q: v.trim() });
      setDangTim(false);
      if (error) { baoToast('Lỗi tìm kiếm: ' + error.message); setGoiY([]); return; }
      setGoiY(data || []);
    }, 300);
  };

  const them = async (bc, loai) => {
    const { error } = await sb.rpc('fn_dacbiet_them', {
      p_barcode: bc, p_loai: loai || tab, p_nguoi: user.ma_dang_nhap });
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    baoToast('Đã thêm vào danh sách'); setQ(''); setGoiY(null); taiDS();
    if (tab === 'HANG_MOI') taiMaMoi(soNgay, tatCa, tuMM, denMM);
  };
  const importThuHoi = async (file) => {
    if (!file) return;
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
      // Cột A = Barcode, Cột B = Áp dụng (CH / DB / CH-DB / CH_DB). Mặc định CH_DB nếu trống.
      const chuan = (v) => {
        const t = String(v || '').trim().toUpperCase().replace(/[\s\-–]/g, '_');
        if (t === 'CH') return 'CH';
        if (t === 'DB') return 'DB';
        if (t === 'CH_DB' || t === 'DB_CH' || t === 'CHDB') return 'CH_DB';
        return 'CH_DB';
      };
      // Bỏ dòng tiêu đề nếu có: dòng 1 chứa chữ "barcode"/"mã"/"áp dụng" -> là tiêu đề.
      // Nếu dòng 1 đã là mã thật (không phải chữ tiêu đề) thì giữ lại, không mất mã.
      const o1 = String(rows[0]?.[0] || '').trim().toLowerCase();
      const laTieuDe = /barcode|mã|ma\b|áp dụng|ap dung|code/.test(o1) || !/\d/.test(o1);
      const batDau = laTieuDe ? 1 : 0;
      const data = rows.slice(batDau)
        .map((r) => ({ bc: String(r[0] || '').trim(), ap: chuan(r[1]) }))
        .filter((x) => x.bc);
      if (!data.length) { baoToast('File không có mã nào ở cột A'); return; }
      let ok = 0, loi = 0;
      for (const { bc, ap } of data) {
        const { error } = await sb.rpc('fn_dacbiet_them',
          { p_barcode: bc, p_loai: 'THU_HOI', p_nguoi: user.ma_dang_nhap, p_ghi_chu: 'Import Excel', p_ap_dung: ap });
        if (error) loi++; else ok++;
      }
      baoToast(`Import xong: ${ok} mã thu hồi${loi ? `, ${loi} lỗi (mã không có?)` : ''}`);
      taiDS();
    } catch (e) { baoToast('Lỗi đọc file: ' + e.message); }
  };
  const taiMauThuHoi = async () => {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([
      ['Barcode', 'Áp dụng'],
      ['8938501234567', 'CH'],
      ['8938507654321', 'DB'],
      ['8938509999999', 'CH-DB'],
    ]);
    ws['!cols'] = [{ wch: 20 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Thu hồi');
    XLSX.writeFile(wb, 'MAU_THU_HOI.xlsx');
  };
  const xoa = async (bc, loai) => {
    // Gỡ = BỎ HẠN CHẾ hoàn toàn. THU_HOI xóa hẳn. HANG_MOI: mã ≤30 ngày còn bị
    // engine tự khóa theo ngày -> đánh dấu CHO_CHIA (ngầm) để bỏ khóa tự động luôn.
    if (loai === 'HANG_MOI') {
      const { error } = await sb.rpc('fn_dacbiet_them',
        { p_barcode: bc, p_loai: 'CHO_CHIA', p_nguoi: user.ma_dang_nhap, p_ghi_chu: 'Đã gỡ hạn chế' });
      if (error) { baoToast('Lỗi: ' + error.message); return; }
      baoToast('Đã gỡ hạn chế'); taiDS();
      if (tab === 'HANG_MOI') taiMaMoi(soNgay, tatCa, tuMM, denMM);
      return;
    }
    const { error } = await sb.rpc('fn_dacbiet_xoa', { p_barcode: bc, p_nguoi: user.ma_dang_nhap });
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    baoToast('Đã gỡ khỏi danh sách'); taiDS();
  };

  const dsTab = (ds || []).filter((r) => r.loai === tab);

  // Lọc + sort mã tạo gần đây
  const sortVal = { ngay: (r) => r.ngay_tao_ma || '', gia: (r) => r.gia_niem_yet || 0,
    kho: (r) => r.kho_tong || 0, ban: (r) => r.da_ban_30 || 0, tonch: (r) => r.ton_ch || 0, soch: (r) => r.so_ch_pb || 0,
    nganh: (r) => (laBH(r.nganh_1) ? 0 : 1), sp: (r) => r.ma_tham_chieu || r.sku || '' };
  const doiSortMoi = (key) => setSortMoi((c) => ({ key, dir: c.key === key ? -c.dir : -1 }));
  const icSort = (key) => <span style={{ opacity: sortMoi.key === key ? 1 : .3, fontSize: 10 }}>{sortMoi.key === key && sortMoi.dir === 1 ? ' ▲' : ' ▼'}</span>;
  let maMoiLoc = (maMoi || []).filter((r) => {
    if (locNganh !== 'ALL' && (locNganh === 'BH') !== laBH(r.nganh_1)) return false;
    if (qMoi.trim()) {
      const k = qMoi.trim().toUpperCase();
      if (![r.barcode, r.sku, r.ma_tham_chieu, r.nganh_3].some((x) => (x || '').toUpperCase().includes(k))) return false;
    }
    return true;
  });
  maMoiLoc = [...maMoiLoc].sort((a, b) => {
    const va = sortVal[sortMoi.key](a), vb = sortVal[sortMoi.key](b);
    return (va < vb ? -1 : va > vb ? 1 : 0) * sortMoi.dir;
  });

  const AnhSP = ({ url }) => {
    const [loi, setLoi] = useState(false);
    if (!url || loi) return <div className="noimg" />;
    return <img className="sp" src={url} alt="" {...anhProps(url)} onError={() => setLoi(true)} />;
  };

  return (
    <div>
      <div className="cmdbar">
        <div className="cmd-title">
          <h2><IcBox style={{ verticalAlign: -3, marginRight: 8 }} />Hàng đặc biệt</h2>
          <p>Hàng KHÔNG chia tự động — phòng Điều phối kiểm soát trực tiếp. Cửa hàng vẫn thấy mã nhưng bị khóa ô đề nghị.</p>
        </div>
      </div>

      <div className="nhom-tabs" style={{ marginTop: 14 }}>
        <button className={'nhom-tab' + (tab === 'THU_HOI' ? ' on' : '')} onClick={() => { setTab('THU_HOI'); setQ(''); setGoiY(null); }}>
          Hàng thu hồi {ds && <b style={{ marginLeft: 4 }}>{(ds || []).filter((r) => r.loai === 'THU_HOI').length}</b>}
        </button>
        <button className={'nhom-tab' + (tab === 'HANG_MOI' ? ' on' : '')} onClick={() => { setTab('HANG_MOI'); setQ(''); setGoiY(null); }}>
          Hàng mới / tái bản {ds && <b style={{ marginLeft: 4 }}>{(ds || []).filter((r) => r.loai === 'HANG_MOI').length}</b>}
        </button>
        <button className={'nhom-tab' + (tab === 'BAOCAO' ? ' on' : '')} onClick={() => { setTab('BAOCAO'); setQ(''); setGoiY(null); }}>
          Báo cáo mã mới
        </button>
      </div>

      {tab === 'BAOCAO' && <BaoCaoMaMoi />}

      {tab !== 'BAOCAO' && (<>
      {/* Ô tìm + thêm */}
      <div className="card" style={{ marginTop: 12, padding: 14, position: 'relative' }}>
        <div className="lbl" style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>{tab === 'THU_HOI' ? 'Thêm sản phẩm thu hồi' : 'Thêm mã tái bản (ngày tạo cũ nhưng cần ĐP chia)'}</span>
          {tab === 'THU_HOI' && (
            <>
              <label className="btn-mini" style={{ cursor: 'pointer', margin: 0 }}>
                ⇪ Import Excel (A=Barcode, B=Áp dụng)
                <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
                  onChange={(e) => importThuHoi(e.target.files?.[0])} />
              </label>
              <button className="btn-mini" style={{ margin: 0 }} onClick={taiMauThuHoi}>⬇ Tải file mẫu</button>
            </>
          )}
        </div>
        <div style={{ position: 'relative', maxWidth: 520 }}>
          <IcSearch style={{ position: 'absolute', left: 11, top: 12, width: 16, height: 16, color: 'var(--ink-2)', pointerEvents: 'none' }} />
          <input className="inp" style={{ paddingLeft: 36, width: '100%' }}
            placeholder="Barcode, SKU, mã — gõ để tìm" value={q} onChange={(e) => goTim(e.target.value)} />
          {(dangTim || goiY) && q.trim().length >= 1 && (
            <div className="goiy-pop">
              {dangTim && <div className="goiy-item" style={{ color: 'var(--ink-2)', fontSize: 12.5 }}>Đang tìm…</div>}
              {!dangTim && goiY && !goiY.length &&
                <div className="goiy-item" style={{ color: 'var(--ink-2)', fontSize: 12.5 }}>Không tìm thấy sản phẩm khớp "{q.trim()}"</div>}
              {!dangTim && (goiY || []).map((g) => (
                <div key={g.barcode} className="goiy-item">
                  <AnhSP url={g.hinh_url} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="mono" style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--teal-deep)' }}>{g.ma_tham_chieu || g.sku}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>{g.nganh_3} · kho tổng {g.kho_tong}</div>
                  </div>
                  <BadgeNganh n1={g.nganh_1} />
                  {g.dac_biet
                    ? <span style={{ fontSize: 11, color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>đã trong DS</span>
                    : <button className="btn-mini" onClick={() => them(g.barcode)}>＋ Thêm</button>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Danh sách của tab */}
      <div className="card" style={{ marginTop: 12, padding: 0 }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', fontWeight: 700, fontSize: 13.5 }}>
          Danh sách {tab === 'THU_HOI' ? 'thu hồi' : 'hàng mới thêm tay'} ({dsTab.length})
        </div>
        {!dsTab.length ? (
          <div className="empty" style={{ margin: 14 }}>Chưa có sản phẩm nào trong danh sách.</div>
        ) : (
          <div className="tbl-wrap" style={{ maxHeight: '46vh' }}>
            <table className="tbl">
              <thead><tr>
                <th className="col-sp">Sản phẩm</th><th className="center">Ngành</th>
                {tab === 'THU_HOI' && <th className="center">Áp dụng</th>}
                <th className="center">Giá</th><th className="center">Kho tổng</th>
                <th className="center">Người thêm</th><th className="center">Ngày thêm</th><th className="center">Gỡ</th>
              </tr></thead>
              <tbody>
                {dsTab.map((r) => (
                  <tr key={r.barcode}>
                    <td className="col-sp">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <AnhSP url={r.hinh_url} />
                        <div>
                          <div className="mono" style={{ fontWeight: 700, color: 'var(--teal-deep)' }}>{r.ma_tham_chieu || r.sku}</div>
                          <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>{r.nganh_3}</div>
                        </div>
                      </div>
                    </td>
                    <td className="center"><BadgeNganh n1={r.nganh_1} /></td>
                    {tab === 'THU_HOI' && <td className="center"><span className={'apd-badge apd-' + (r.ap_dung || 'CH_DB')}>{{ CH: 'Cửa hàng', DB: 'Điểm bán', CH_DB: 'Cả hai' }[r.ap_dung] || 'Cả hai'}</span></td>}
                    <td className="num">{fmtVND(r.gia_niem_yet)}</td>
                    <td className="num">{r.kho_tong}</td>
                    <td className="center">{r.nguoi_tao || '—'}</td>
                    <td className="center">{fmtNgay(r.tao_luc)}</td>
                    <td className="center"><button className="btn-mini btn-danger" onClick={() => xoa(r.barcode, r.loai)}>－ Gỡ</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Tab HÀNG MỚI: mã tạo gần đây */}
      {tab === 'HANG_MOI' && (
        <div className="card" style={{ marginTop: 12, padding: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>Mã tạo gần đây</div>
            <span style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>
              (mã tạo ≤ 30 ngày <b>tự động</b> khóa chia — bấm ＋ chỉ khi muốn giữ khóa lâu hơn 30 ngày)
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', width: '100%', marginTop: 4 }}>
              <div className="nhom-tabs" style={{ margin: 0 }}>
                {[['ALL', 'Tất cả'], ['BH', 'Mũ bảo hiểm'], ['NV', 'Nón vải']].map(([k, ten]) => (
                  <button key={k} className={'nhom-tab' + (locNganh === k ? ' on' : '')} onClick={() => setLocNganh(k)}>{ten}</button>
                ))}
              </div>
              <div className="nhom-tabs" style={{ margin: 0 }}>
                {[14, 30, 60, 90].map((n) => (
                  <button key={n} className={'nhom-tab' + (!tatCa && soNgay === n ? ' on' : '')} onClick={() => { setTatCa(false); setTuMM(''); setDenMM(''); setSoNgay(n); }}>{n} ngày</button>
                ))}
                <button className={'nhom-tab' + (tatCa ? ' on' : '')} onClick={() => { setTuMM(''); setDenMM(''); setTatCa(true); }}>Tất cả mã</button>
              </div>
              {/* Chọn khoảng ngày tạo mã — mini */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--ink-2)' }}>
                <span>Tạo từ</span>
                <label className="date-vi" onClick={(e) => { const i = e.currentTarget.querySelector("input"); i && i.showPicker && i.showPicker(); }}>
                  <span>{tuMM ? tuMM.split('-').reverse().join('/') : 'dd/mm/yyyy'}</span>
                  <input type="date" value={tuMM} onChange={(e) => setTuMM(e.target.value)} />
                </label>
                <span>đến</span>
                <label className="date-vi" onClick={(e) => { const i = e.currentTarget.querySelector("input"); i && i.showPicker && i.showPicker(); }}>
                  <span>{denMM ? denMM.split('-').reverse().join('/') : 'dd/mm/yyyy'}</span>
                  <input type="date" value={denMM} onChange={(e) => setDenMM(e.target.value)} />
                </label>
              </div>
              <div style={{ position: 'relative' }}>
                <IcSearch style={{ position: 'absolute', left: 10, top: 12, width: 15, height: 15, color: 'var(--ink-2)', pointerEvents: 'none' }} />
                <input className="inp" style={{ width: 190, paddingLeft: 33 }} placeholder="Barcode, SKU, mã"
                  value={qMoi} onChange={(e) => setQMoi(e.target.value)} />
              </div>
            </div>
          </div>
          {!maMoi ? (
            <div className="quet-load"><div className="quet-ring" /><div className="quet-s">đang tải…</div></div>
          ) : !maMoiLoc.length ? (
            <div className="empty" style={{ margin: 14 }}>Không có mã nào khớp trong {soNgay} ngày qua.</div>
          ) : (
            <div className="tbl-wrap" style={{ maxHeight: '52vh' }}>
              <table className="tbl">
                <thead><tr>
                  <th className="col-sp sortable" onClick={() => doiSortMoi('sp')}>Sản phẩm{icSort('sp')}</th>
                  <th className="center sortable" onClick={() => doiSortMoi('nganh')}>Ngành{icSort('nganh')}</th>
                  <th className="center sortable" onClick={() => doiSortMoi('ngay')}>Ngày tạo mã{icSort('ngay')}</th>
                  <th className="center sortable" onClick={() => doiSortMoi('gia')}>Giá{icSort('gia')}</th>
                  <th className="center sortable" onClick={() => doiSortMoi('kho')}>Kho tổng{icSort('kho')}</th>
                  <th className="center sortable" onClick={() => doiSortMoi('tonch')}>Tồn CH{icSort('tonch')}</th>
                  <th className="center sortable" onClick={() => doiSortMoi('soch')}>Số CH phân bổ{icSort('soch')}</th>
                  <th className="center sortable" onClick={() => doiSortMoi('ban')}>Đã bán 30N{icSort('ban')}</th>
                  <th className="center">Thêm DS</th>
                </tr></thead>
                <tbody>
                  {maMoiLoc.map((r) => (
                    <tr key={r.barcode} className="row-click" onClick={() => moBan(r)} title="Bấm xem bán tại từng cửa hàng">
                      <td className="col-sp">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <AnhSP url={r.hinh_url} />
                          <div>
                            <div className="mono" style={{ fontWeight: 700, color: 'var(--teal-deep)' }}>{r.ma_tham_chieu || r.sku}</div>
                            <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>{r.nganh_3}</div>
                          </div>
                        </div>
                      </td>
                      <td className="center"><BadgeNganh n1={r.nganh_1} /></td>
                      <td className="center"><b style={{ color: 'var(--teal-deep)' }}>{fmtNgay(r.ngay_tao_ma)}</b></td>
                      <td className="num">{fmtVND(r.gia_niem_yet)}</td>
                      <td className="num">{r.kho_tong}</td>
                      <td className="num">{r.ton_ch ?? 0}</td>
                      <td className="num">{r.so_ch_pb ?? 0}</td>
                      <td className="num">{r.da_ban_30}</td>
                      <td className="center">
                        {r.dac_biet === 'THU_HOI' || r.dac_biet === 'HANG_MOI'
                          ? <div><span style={{ fontSize: 11, color: 'var(--ink-2)' }}>đã có</span>
                              {r.vet_luc && <div style={{ fontSize: 9.5, color: 'var(--magenta)' }}>hạn chế {fmtNgay(r.vet_luc)}</div>}</div>
                          : <div>
                              <button className="btn-mini" title="Thêm vào danh sách hạn chế" onClick={(e) => { e.stopPropagation(); them(r.barcode, 'HANG_MOI'); }}>＋</button>
                              {r.vet_hanh_dong === 'GO_HAN_CHE' && r.vet_luc && <div style={{ fontSize: 9.5, color: 'var(--ink-2)' }}>gỡ {fmtNgay(r.vet_luc)}</div>}
                            </div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      </>)}

      {/* Ảnh hover phóng to + lightbox — như Đề nghị hàng */}
      {hoverAnh && (
        <img className="sp-zoom" src={hoverAnh.url} alt=""
          style={{ left: Math.min(hoverAnh.x, window.innerWidth - 340), top: Math.max(10, hoverAnh.y) }} />
      )}
      {xemAnh && (
        <div className="img-lightbox" onClick={() => setXemAnh(null)}>
          <img src={xemAnh} alt="" />
        </div>
      )}

      {/* Panel kiểm soát — 3 thẻ gọn + chọn ngày, 1 lần gọi */}
      {xemBan && (() => {
        const R = xemBan.rows || [];
        const daBan = R.filter((r) => Number(r.sl_ban_ky) > 0).sort((a, b) => b.sl_ban_ky - a.sl_ban_ky);
        const conTon = R.filter((r) => Number(r.ton_hien_tai) > 0).sort((a, b) => b.ton_hien_tai - a.ton_hien_tai);
        const hetTon = R.filter((r) => Number(r.ton_hien_tai) === 0)
                        .sort((a, b) => (b.da_ban - a.da_ban) || (b.tong_ban_all - a.tong_ban_all));
        const dem = (arr) => { const ch = arr.filter((r) => r.loai_diem === 'CH').length;
          const db = arr.length - ch; return db > 0 ? ch + ' cửa hàng · ' + db + ' điểm bán' : ch + ' cửa hàng'; };
        let cur = theBan === 'ban' ? daBan : theBan === 'ton' ? conTon : hetTon;
        if (sortP.k) {
          const sv = { ch: (r) => r.ten_ch || '', kv: (r) => r.khu_vuc || '',
            ban: (r) => Number(r.sl_ban_ky), ton: (r) => Number(r.ton_hien_tai),
            ngay: (r) => r.lan_cuoi || '' };
          cur = [...cur].sort((a, b) => { const x = sv[sortP.k](a), y = sv[sortP.k](b);
            return (x < y ? -1 : x > y ? 1 : 0) * sortP.d; });
        }
        const tongBanKy = daBan.reduce((s, r) => s + Number(r.sl_ban_ky), 0);
        const tongTon = conTon.reduce((s, r) => s + Number(r.ton_hien_tai), 0);
        return (
        <div className="modal-nen" onClick={() => setXemBan(null)}>
          <div className="modal-hop" onClick={(e) => e.stopPropagation()}>
            <div className="modal-dau">
              <div>
                <div className="mono" style={{ fontWeight: 700, color: 'var(--teal-deep)', fontSize: 15 }}>
                  {xemBan.sp.ma_tham_chieu || xemBan.sp.sku}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>{xemBan.sp.nganh_3}</div>
              </div>
              {/* Chọn ngày mini — hiển thị dd/mm/yyyy */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <span style={{ color: 'var(--ink-2)' }}>Bán từ</span>
                <label className="date-vi" onClick={(e) => { const i = e.currentTarget.querySelector("input"); i && i.showPicker && i.showPicker(); }}>
                  <span>{xemBan.tu.split('-').reverse().join('/')}</span>
                  <input type="date" value={xemBan.tu} onChange={(e) => doiNgayBan(e.target.value, xemBan.den)} />
                </label>
                <span style={{ color: 'var(--ink-2)' }}>đến</span>
                <label className="date-vi" onClick={(e) => { const i = e.currentTarget.querySelector("input"); i && i.showPicker && i.showPicker(); }}>
                  <span>{xemBan.den.split('-').reverse().join('/')}</span>
                  <input type="date" value={xemBan.den} onChange={(e) => doiNgayBan(xemBan.tu, e.target.value)} />
                </label>
                <button className="btn-mini" onClick={() => setXemBan(null)} style={{ marginLeft: 6 }}>Đóng</button>
              </div>
            </div>
            <div className="modal-than">
              {!xemBan.rows ? (
                <div className="quet-load"><div className="quet-ring" /><div className="quet-s">đang tải…</div></div>
              ) : (
                <>
                  {/* 3 THẺ GỌN — số to bên trái, nhãn bên phải, đồng màu teal */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    <button className={'the-g' + (theBan === 'ban' ? ' on' : '')} onClick={() => setTheBan('ban')}>
                      <span className="the-g-n">{tongBanKy}</span>
                      <span className="the-g-t">Đã bán<small>{dem(daBan)}</small></span>
                    </button>
                    <button className={'the-g' + (theBan === 'ton' ? ' on' : '')} onClick={() => setTheBan('ton')}>
                      <span className="the-g-n">{conTon.length}</span>
                      <span className="the-g-t">Đang còn tồn<small>{dem(conTon)}</small></span>
                    </button>
                    <button className={'the-g' + (theBan === 'het' ? ' on' : '')} onClick={() => setTheBan('het')}>
                      <span className="the-g-n">{hetTon.length}</span>
                      <span className="the-g-t">Không tồn<small>{dem(hetTon)}</small></span>
                    </button>
                  </div>

                  {!cur.length ? (
                    <div className="empty">
                      {theBan === 'ban' ? 'Không có bán trong khoảng chọn.'
                        : theBan === 'ton' ? 'Không cửa hàng nào có tồn.'
                        : 'Mọi cửa hàng đều còn tồn.'}
                    </div>
                  ) : (
                    <div className="tbl-wrap" style={{ maxHeight: '48vh' }}>
                      <table className="tbl">
                        <thead><tr>
                          <th className="sortable" onClick={() => doiSortP('ch')}>Cửa hàng{icSortP('ch')}</th>
                          <th className="center sortable" onClick={() => doiSortP('kv')}>Khu vực{icSortP('kv')}</th>
                          <th className="center sortable" onClick={() => doiSortP('ban')}>Bán (kỳ){icSortP('ban')}</th>
                          <th className="center sortable" onClick={() => doiSortP('ton')}>Tồn{icSortP('ton')}</th>
                          {theBan === 'het'
                            ? <th className="center">Tình trạng</th>
                            : <th className="center sortable" onClick={() => doiSortP('ngay')}>Bán gần nhất{icSortP('ngay')}</th>}
                        </tr></thead>
                        {theBan === 'het' && hetTon.some((r) => r.da_ban) && (
                          <thead><tr><th colSpan={5} style={{ background: '#FCE8EF', fontSize: 11, fontWeight: 700,
                            color: 'var(--magenta)', padding: '5px 8px', textAlign: 'left', textTransform: 'none', letterSpacing: 0 }}>
                            Đã BÁN HẾT — cần bổ sung ({hetTon.filter((r) => r.da_ban).length})</th></tr></thead>
                        )}
                        <tbody>
                          {cur.map((r, idx) => {
                            const het = Number(r.ton_hien_tai) === 0;
                            const dauNhomChua = theBan === 'het' && !r.da_ban
                              && (idx === 0 || cur[idx - 1].da_ban);
                            return (
                            <>
                              {dauNhomChua && (
                                <tr><td colSpan={5} style={{ background: '#EEF0F3', fontSize: 11, fontWeight: 700,
                                  color: 'var(--ink-2)', padding: '5px 8px' }}>Chưa phân bổ bao giờ ({hetTon.filter((r2) => !r2.da_ban).length})</td></tr>
                              )}
                              <tr key={r.ma_ch} style={theBan === 'het' ? (r.da_ban ? { background: '#FDF3F7' } : { background: '#F7F8FA' }) : undefined}>
                                <td><b>{r.ten_ch}</b> <span style={{ color: 'var(--ink-2)', fontSize: 11 }}>{r.ma_ch}</span></td>
                                <td className="center">{r.khu_vuc || '—'}</td>
                                <td className="num" style={{ fontWeight: 700, color: Number(r.sl_ban_ky) > 0 ? 'var(--teal-deep)' : 'var(--ink-2)' }}>{r.sl_ban_ky}</td>
                                <td className="num" style={{ fontWeight: het ? 400 : 700, color: het ? 'var(--magenta)' : 'var(--ink)' }}>{r.ton_hien_tai}</td>
                                {theBan === 'het'
                                  ? <td className="center">{r.da_ban
                                      ? <span className="tt tt-het" style={{ fontSize: 10.5, whiteSpace: 'nowrap' }}>Bán hết</span>
                                      : <span className="tt" style={{ fontSize: 10.5, background: '#EEF0F3', color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>Chưa phân bổ</span>}</td>
                                  : <td className="center">{fmtNgay(r.lan_cuoi)}</td>}
                              </tr>
                            </>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}