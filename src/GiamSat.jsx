import { useEffect, useMemo, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { Sel, DateBox } from '../lib/ui.jsx';
import { IcAlert, IcRefresh, IcBox, IcSearch, IcCheck, IcTruck } from '../lib/icons.jsx';
import { useApp } from '../App.jsx';

// ============ PHÂN HỆ THIẾU HÀNG ============
// Kiểm tra, cảnh báo, điều chuyển. Độc lập với phân hệ Đề nghị hàng.
const iso = (d) => d.toISOString().slice(0, 10);
const homQua = () => { const d = new Date(); d.setDate(d.getDate() - 1); return iso(d); };

export default function GiamSat() {
  const { user, baoToast } = useApp();
  const [dsCH, setDsCH] = useState([]);
  const [maCH, setMaCH] = useState(user.vai_tro === 'CH' ? user.ma_ch : '');
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
    }
  }, []);

  const quet = async () => {
    if (!maCH) { baoToast('Chọn cửa hàng để kiểm tra'); return; }
    setBusy(true); setLocThe('ALL'); setSortBy(null);
    const { data, error } = await sb.rpc('fn_thieu_hang', { p_ma_ch: maCH, p_tu: tu, p_den: den });
    setBusy(false);
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    setRows(data || []);
  };

  const nhomCua = (r) => (r.nhom_hang === 'BH' ? 'BH' : 'NV');

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
      v = v.filter((r) => [r.barcode, r.sku, r.ma_tham_chieu, r.nganh_3].some((x) => (x || '').toUpperCase().includes(k)));
    }
    if (sortBy) {
      const get = {
        sp: (r) => r.ma_tham_chieu || r.sku || '',
        gia: (r) => r.la_hang_sale ? r.gia_sale : r.gia_niem_yet,
        ban: (r) => r.sl_ban, ban30: (r) => r.ban_30,
        that: (r) => r.ton_that, kho: (r) => r.kho_tong,
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
  const sortIc = (col) => sortBy?.col === col ? (sortBy.dir === 'asc' ? ' \u25B2' : ' \u25BC') : '';
  const bacThe = (id) => setLocThe((v) => v === id ? 'ALL' : id);

  const moNguon = async (r) => {
    setChiTiet({ r, ds: null });
    const { data } = await sb.rpc('fn_nguon_gan', { p_ma_ch: maCH, p_barcode: r.barcode });
    setChiTiet((c) => c && c.r.barcode === r.barcode ? { r, ds: data || [] } : c);
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
    const { data, error } = await sb.rpc('fn_can_san_xuat', { p_so_ngay: 30 });
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
          <h2>Thi\u1ebfu h\u00e0ng</h2>
          <p>Ki\u1ec3m tra t\u00ecnh tr\u1ea1ng thi\u1ebfu h\u00e0ng theo kho\u1ea3ng th\u1eddi gian \u2014 \u0111\u1ec1 ngh\u1ecb b\u1ed5 sung, c\u1ea3nh b\u00e1o, t\u00ecm ngu\u1ed3n \u0111i\u1ec1u chuy\u1ec3n g\u1ea7n nh\u1ea5t.</p>
        </div>
        <div className="cmd-row">
          {user.vai_tro !== 'CH' && (
            <Sel value={maCH} onChange={setMaCH} placeholder="Ch\u1ecdn c\u1eeda h\u00e0ng"
              options={dsCH.map((c) => ({ value: c.ma_ch, label: `${c.ten} (${c.ma_ch})` }))} style={{ minWidth: 260 }} />
          )}
          <DateBox label="Ng\u00e0y t\u1eeb" value={tu} onChange={setTu} />
          <DateBox label="Ng\u00e0y \u0111\u1ebfn" value={den} onChange={setDen} />
          <button className="btn btn-primary" onClick={quet} disabled={busy}>
            <IcSearch /> {busy ? '\u0110ang ki\u1ec3m tra\u2026' : 'Ki\u1ec3m tra thi\u1ebfu h\u00e0ng'}
          </button>
          {rows && <span className="sla-chip">{hien.length} m\u00e3</span>}
        </div>
      </div>

      {rows && (
        <>
          <div className="th-cards">
            <TheTK id="BO_SUNG" on={locThe} set={bacThe} so={tk.boSung} nhan="C\u1ea7n b\u1ed5 sung" mau="magenta" />
            <TheTK id="CANH_BAO" on={locThe} set={bacThe} so={tk.canhBao} nhan="C\u1ea3nh b\u00e1o" mau="gold" />
            <TheTK id="HET7" on={locThe} set={bacThe} so={tk.het7} nhan="H\u1ebft > 7 ng\u00e0y" mau="magenta" />
            <TheTK id="CHUYEN" on={locThe} set={bacThe} so={tk.chuyen} nhan="\u0110ang \u0111i\u1ec1u chuy\u1ec3n" mau="teal" />
            <TheTK id="KHO" on={locThe} set={bacThe} so={tk.khoCon} nhan="Kho t\u1ed5ng c\u00f2n" mau="teal" />
            <TheTK id="CH_KHAC" on={locThe} set={bacThe} so={tk.chKhac} nhan="CH kh\u00e1c c\u00f2n" mau="teal" />
          </div>

          <div className="toolbar">
            <div className="nhom-tabs" style={{ margin: 0 }}>
              {['ALL', 'BH', 'NV'].map((n) => (
                <button key={n} className={'nhom-tab' + (nhomXem === n ? ' on' : '')} onClick={() => setNhomXem(n)}>
                  {n === 'ALL' ? 'T\u1ea5t c\u1ea3' : n === 'BH' ? 'B\u1ea3o hi\u1ec3m' : 'N\u00f3n v\u1ea3i'}
                </button>
              ))}
            </div>
            <div style={{ position: 'relative' }}>
              <input type="search" placeholder="T\u00ecm m\u00e3 / SKU / nh\u00f3m" value={q}
                onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 34, width: 220 }} />
              <span style={{ position: 'absolute', left: 10, top: 10, color: 'var(--ink-2)' }}><IcSearch /></span>
            </div>
            {locThe !== 'ALL' && <button className="btn btn-ghost" onClick={() => setLocThe('ALL')}>B\u1ecf l\u1ecdc th\u1ebt</button>}
            <button className="btn btn-gold" style={{ marginLeft: 'auto' }} onClick={xuatExcel}>Xu\u1ea5t Excel</button>
          </div>

          <div className="card" style={{ padding: 0 }}>
            <div className="tbl-wrap" style={{ maxHeight: '68vh' }}>
              <table className="tbl">
                <thead><tr>
                  <th className="sortable" onClick={() => doiSort('sp')}>S\u1ea3n ph\u1ea9m{sortIc('sp')}</th>
                  <th className="num sortable" onClick={() => doiSort('gia')}>Gi\u00e1{sortIc('gia')}</th>
                  <th className="num sortable" onClick={() => doiSort('ban')}>SL b\u00e1n k\u1ef3{sortIc('ban')}</th>
                  <th className="num sortable" onClick={() => doiSort('ban30')}>B\u00e1n 30N{sortIc('ban30')}</th>
                  <th className="num sortable" onClick={() => doiSort('that')}>T\u1ed3n th\u1ef1c{sortIc('that')}</th>
                  <th className="num">T\u1ed3n d\u1ef1 ki\u1ebfn</th>
                  <th className="num sortable" onClick={() => doiSort('kho')}>Kho t\u1ed5ng{sortIc('kho')}</th>
                  <th className="num sortable" onClick={() => doiSort('chk')}>CH kh\u00e1c{sortIc('chk')}</th>
                  <th className="num sortable" onClick={() => doiSort('het')}>Ng\u00e0y h\u1ebft{sortIc('het')}</th>
                  <th>T\u00ecnh tr\u1ea1ng</th>
                  <th>Ngu\u1ed3n g\u1ea7n</th>
                </tr></thead>
                <tbody>
                  {dsBoSung.length > 0 && <RowNhom ten="\u0110\u1ec0 NGH\u1eca B\u1ed4 SUNG \u2014 kh\u1ea9n c\u1ea5p" mau="magenta" />}
                  {dsBoSung.map((r) => <RowSP key={r.barcode} r={r} anhProps={anhProps} moNguon={moNguon} />)}
                  {dsCanhBao.length > 0 && <RowNhom ten="C\u1ea2NH B\u00c1O \u2014 c\u00f2n t\u1ed3n nh\u01b0ng thi\u1ebfu" mau="gold" />}
                  {dsCanhBao.map((r) => <RowSP key={r.barcode} r={r} anhProps={anhProps} moNguon={moNguon} />)}
                  {dsDu.length > 0 && locThe === 'ALL' && <RowNhom ten="\u0110\u1ee6 H\u00c0NG" mau="teal" />}
                  {locThe === 'ALL' && dsDu.map((r) => <RowSP key={r.barcode} r={r} anhProps={anhProps} moNguon={moNguon} />)}
                </tbody>
              </table>
            </div>
            {!hien.length && <div className="empty">
              <div className="t">Kh\u00f4ng c\u00f3 m\u00e3 n\u00e0o theo b\u1ed9 l\u1ecdc</div>
              Th\u1eed \u0111\u1ed5i kho\u1ea3ng ng\u00e0y ho\u1eb7c b\u1ecf l\u1ecdc th\u1ebt.
            </div>}
          </div>

          {/* ===== C\u1ea7n s\u1ea3n xu\u1ea5t / t\u00e1i b\u1ea3n \u2014 to\u00e0n h\u1ec7 th\u1ed1ng ===== */}
          <div className="card" style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--navy)' }}>C\u1ea7n s\u1ea3n xu\u1ea5t / t\u00e1i b\u1ea3n</div>
                <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                  M\u00e3 c\u00f3 b\u00e1n 30 ng\u00e0y (to\u00e0n h\u1ec7 th\u1ed1ng) nh\u01b0ng kho t\u1ed5ng \u0111\u00e3 c\u1ea1n \u2014 t\u00edn hi\u1ec7u s\u1ea3n xu\u1ea5t l\u1ea1i, x\u1ebfp theo m\u1ee9c b\u00e1n gi\u1ea3m d\u1ea7n.
                </div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                {!moSX && <button className="btn btn-primary" onClick={taiCanSX}>Qu\u00e9t to\u00e0n h\u1ec7 th\u1ed1ng</button>}
                {moSX && canSX?.length > 0 && <button className="btn btn-gold" onClick={xuatCanSX}>Xu\u1ea5t Excel ({canSX.length})</button>}
              </div>
            </div>
            {moSX && (canSX?.length > 0 ? (
              <div className="tbl-wrap" style={{ marginTop: 10, maxHeight: 360 }}>
                <table className="tbl">
                  <thead><tr>
                    <th>S\u1ea3n ph\u1ea9m</th><th className="num">B\u00e1n 30N</th><th className="num">S\u1ed1 CH b\u00e1n</th>
                    <th className="num">T\u1ed3n c\u00f2n CH</th><th className="num">Kho t\u1ed5ng</th>
                  </tr></thead>
                  <tbody>
                    {canSX.map((r) => (
                      <tr key={r.barcode}>
                        <td><div className="mono" style={{ fontWeight: 600 }}>{r.ma_tham_chieu || r.sku}</div>
                          <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>{r.nganh_3}{r.la_hang_sale ? ' \u00b7 sale' : ''}</div></td>
                        <td className="num" style={{ fontWeight: 700, color: 'var(--teal-deep)' }}>{r.ban_toan_ht}</td>
                        <td className="num">{r.so_ch_ban}</td>
                        <td className="num">{r.ton_con_o_ch}</td>
                        <td className="num" style={{ color: 'var(--magenta)', fontWeight: 700 }}>{r.kho_tong}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="empty" style={{ marginTop: 10 }}>
                <div className="t">Kh\u00f4ng c\u00f3 m\u00e3 n\u00e0o c\u1ea7n s\u1ea3n xu\u1ea5t</div>M\u1ecdi m\u00e3 \u0111ang b\u00e1n \u0111\u1ec1u c\u00f2n ngu\u1ed3n \u1edf kho t\u1ed5ng.</div>)}
          </div>
        </>
      )}

      {!rows && !busy && (
        <div className="empty" style={{ marginTop: 30 }}>
          <div className="t">Ch\u1ecdn c\u1eeda h\u00e0ng v\u00e0 kho\u1ea3ng ng\u00e0y, r\u1ed3i b\u1ea5m "Ki\u1ec3m tra thi\u1ebfu h\u00e0ng"</div>
          H\u1ec7 th\u1ed1ng qu\u00e9t m\u00e3 \u0111\u00e3 b\u00e1n / h\u1ebft h\u00e0ng / c\u00f2n t\u1ed3n nh\u01b0ng thi\u1ebfu, k\u00e8m ngu\u1ed3n \u0111i\u1ec1u chuy\u1ec3n g\u1ea7n nh\u1ea5t.
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
                <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>{chiTiet.r.nganh_3} \u00b7 Ngu\u1ed3n c\u00f2n h\u00e0ng g\u1ea7n nh\u1ea5t</div>
              </div>
              <button className="ng-close" onClick={() => setChiTiet(null)}>\u2715</button>
            </div>
            <div className="ng-sum">
              <span>Kho t\u1ed5ng: <b style={{ color: chiTiet.r.kho_tong > 0 ? 'var(--teal-deep)' : 'var(--magenta)' }}>{chiTiet.r.kho_tong}</b></span>
              <span>T\u1ed3n \u1edf CH kh\u00e1c: <b>{chiTiet.r.ton_ch_khac}</b> ({chiTiet.r.so_ch_khac} CH)</span>
            </div>
            {!chiTiet.ds ? <div className="empty" style={{ padding: 20 }}>\u0110ang t\u00ecm ngu\u1ed3n g\u1ea7n\u2026</div>
              : chiTiet.ds.length === 0 ? <div className="empty" style={{ padding: 20 }}>
                  <div className="t">Kh\u00f4ng n\u01a1i n\u00e0o c\u00f2n h\u00e0ng</div>C\u1ea7n s\u1ea3n xu\u1ea5t / t\u00e1i b\u1ea3n m\u00e3 n\u00e0y.</div>
              : (
                <div className="ng-list">
                  {chiTiet.ds.map((n) => (
                    <div key={n.ma_ch} className="ng-item">
                      <div className="ng-item-l">
                        {n.la_kho_tong
                          ? <span className="chip teal" style={{ marginRight: 6 }}>KHO T\u1ed4NG</span>
                          : <span className="ng-dist">{n.khoang_cach != null ? n.khoang_cach.toFixed(1) + ' km' : '\u2014'}</span>}
                        <span>{n.ten}</span>
                      </div>
                      <div className="ng-item-r"><b>{n.ton}</b><span className="ng-du"> (d\u1ef1 {n.ton_du_kien})</span></div>
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
  return (<tr className="row-nhom"><td colSpan={11}><span className={'row-nhom-tag row-nhom-' + mau}>{ten}</span></td></tr>);
}

function RowSP({ r, anhProps, moNguon }) {
  const gia = r.la_hang_sale ? r.gia_sale : r.gia_niem_yet;
  const bac = r.dang === 'BO_SUNG' ? 'can-chia' : r.dang === 'CANH_BAO' ? 'thuong' : '';
  const tt = r.ton_that === 0
    ? (r.ban_30 > 0 ? `H\u1ebft h\u00e0ng ${r.ngay_het} ng\u00e0y` : 'H\u1ebft h\u00e0ng')
    : r.dang === 'CANH_BAO' ? `S\u1eafp h\u1ebft \u2014 \u0111\u1ee7 ~${r.muc} ng\u00e0y` : '\u0110\u1ee7 h\u00e0ng';
  const ttMau = r.ton_that === 0 ? 'tt-het' : r.dang === 'CANH_BAO' ? 'tt-cham' : 'tt-tot';
  const dangChuyen = r.dang_chuyen > 0;
  return (
    <tr className={bac ? 'row-' + bac : undefined}>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div className="sp-thumb" {...anhProps(r)}>
            {r.hinh_url ? <img src={r.hinh_url} alt="" /> : <IcBox />}
          </div>
          <div>
            <div className="mono" style={{ fontWeight: 600 }}>{r.ma_tham_chieu || r.sku}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>{r.nganh_3}{r.la_hang_sale ? ' \u00b7 sale' : ''}</div>
          </div>
        </div>
      </td>
      <td className="num">{gia ? gia.toLocaleString('vi-VN') + '\u0111' : '\u2014'}</td>
      <td className="num" style={{ fontWeight: 700 }}>{r.sl_ban}</td>
      <td className="num" style={{ color: 'var(--ink-2)' }}>{r.ban_30}</td>
      <td className="num" style={{ fontWeight: 700, color: r.ton_that === 0 ? 'var(--magenta)' : 'var(--ink)' }}>{r.ton_that}</td>
      <td className="num">
        {dangChuyen
          ? <span className="badge-chuyen" title={`\u0110ang \u0111i\u1ec1u chuy\u1ec3n ${r.dang_chuyen}`}><IcTruck style={{ verticalAlign: -2, width: 13, height: 13 }} /> {r.ton_du_kien}</span>
          : <span style={{ color: 'var(--ink-2)' }}>{r.ton_du_kien}</span>}
      </td>
      <td className="num" style={{ color: r.kho_tong > 0 ? 'var(--teal-deep)' : 'var(--magenta)', fontWeight: 600 }}>{r.kho_tong}</td>
      <td className="num">{r.ton_ch_khac > 0 ? <span style={{ color: 'var(--teal-deep)' }}>{r.ton_ch_khac}</span> : <span style={{ color: 'var(--ink-2)' }}>0</span>}</td>
      <td className="num">{r.ton_that === 0 && r.ngay_het > 0 ? <b>{r.ngay_het}d</b> : '\u2014'}</td>
      <td><span className={'tt ' + ttMau}>{tt}</span></td>
      <td>
        {(r.kho_tong > 0 || r.ton_ch_khac > 0)
          ? <button className="btn-mini" onClick={() => moNguon(r)}>T\u00ecm ngu\u1ed3n</button>
          : <span style={{ fontSize: 11, color: 'var(--magenta)' }}>C\u1ea7n SX</span>}
      </td>
    </tr>
  );
}
