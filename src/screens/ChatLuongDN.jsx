import { useEffect, useState, useMemo, Fragment } from 'react';
import { sb, rpcHet } from '../lib/supabase.js';
import { isoVN, DateBox } from '../lib/ui.jsx';
import { IcAlert, IcBox, IcRefresh, IcTarget } from '../lib/icons.jsx';

const fmtN = (n) => (n == null ? '—' : Number(n).toLocaleString('vi'));
const d1 = (n) => (n == null ? '—' : Number(n).toFixed(1).replace('.0', ''));

const CB = {
  MAT_MA: { t: 'Mất mã trọng yếu', c: 'cl-cb-mat' },
  HUT_SAU: { t: 'Không đủ tới kỳ sau', c: 'cl-cb-hut' },
  SAP_HET: { t: 'Có mã sắp hết', c: 'cl-cb-sap' },
  CHUA_DN: { t: 'Chưa đề nghị', c: 'cl-cb-chua' },
  CHUA_DU_LIEU: { t: 'Chưa đủ dữ liệu', c: 'cl-cb-nodata' },
  ON: { t: 'Ổn', c: 'cl-cb-on' },
};
const TT_MA = { MAT: 'Đã hết sạch', SAP_HET: 'Sắp hết', DU: 'Đủ' };

/* 6 chỉ số chấm điểm — rê chuột vào tiêu đề cột để xem ý nghĩa */
const CHI_SO = [
  ['d_phu', 'Phủ mã trọng yếu', 'bao nhiêu % mã xương sống có hàng sau đề nghị', 30],
  ['d_sau', 'Đủ tới kỳ sau', 'hàng sau đề nghị bán được bao lâu so chu kỳ của nơi đó', 25],
  ['d_dung', 'Đề nghị đúng mã', 'phần trăm số lượng đề nghị rơi vào mã xương sống', 15],
  ['d_cocau', 'Cân đối cơ cấu', 'tỷ trọng bảo hiểm / nón vải có khớp thực tế bán không', 10],
  ['d_dinhmuc', 'Đạt định mức', 'tồn sau đề nghị so định mức tối thiểu', 10],
  ['d_sat', 'Đề nghị sát thực tế', 'xin bao nhiêu thì được duyệt bấy nhiêu', 10],
];


export default function ChatLuongDN({ chonTab = () => {} }) {
  const truNgay = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  const [tu, setTu] = useState(truNgay(6));   // mặc định 7 ngày — chấm 1 ngày không nói lên gì
  const [den, setDen] = useState(isoVN());
  const [truoc, setTruoc] = useState({});     // ma_ch -> điểm kỳ liền trước
  const [maTrong, setMaTrong] = useState(null);   // mã sắp trống nhiều nơi
  const [dbNgay, setDbNgay] = useState(7);
  const [rows, setRows] = useState(null);
  const [db, setDb] = useState(null);
  const [loc, setLoc] = useState('ALL');
  const [q, setQ] = useState('');
  const [mo, setMo] = useState(null);
  const [ma, setMa] = useState(null);
  const [tai, setTai] = useState(false);
  const [sortC, setSortC] = useState({ col: 'diem', dir: 'asc' });
  const [xemDb, setXemDb] = useState(false);

  const nap = async () => {
    setTai(true); setMo(null); setMa(null);
    const [a, b, c] = await Promise.all([
      sb.rpc('fn_cldn_sosanh', { p_tu: tu, p_den: den }),
      sb.rpc('fn_cldn_du_bao', { p_ngay: dbNgay }),
      sb.rpc('fn_cldn_ma_trong', { p_ngay: dbNgay, p_so: 18 }),
    ]);
    if (a.error) {   // máy chủ chưa có hàm mới -> vẫn chạy bằng hàm cũ
      const cu = await rpcHet('fn_cldn_v2', { p_tu: tu, p_den: den });
      setRows(cu.data || []); setTruoc({});
    } else {
      setRows(a.data?.rows || []); setTruoc(a.data?.truoc || {});
    }
    setDb(b.data || []); setMaTrong(c.error ? [] : (c.data || []));
    setTai(false);
  };
  useEffect(() => { nap(); }, [tu, den, dbNgay]);   // eslint-disable-line

  const xo = async (r) => {
    if (mo === r.ma_ch) { setMo(null); setMa(null); return; }
    setMo(r.ma_ch); setMa(null);
    const { data } = await sb.rpc('fn_cldn_ma', { p_ma_ch: r.ma_ch, p_tu: tu, p_den: den });
    setMa(data || []);
  };

  const dem = (k) => (rows || []).filter((r) => r.canh_bao === k).length;
  const diemTB = useMemo(() => {
    const v = (rows || []).filter((r) => r.diem != null);
    return v.length ? v.reduce((s, r) => s + Number(r.diem), 0) / v.length : null;
  }, [rows]);

  const hien = useMemo(() => {
    let v = [...(rows || [])];
    if (loc !== 'ALL') v = v.filter((r) => r.canh_bao === loc);
    if (q.trim()) {
      const k = q.trim().toLowerCase();
      v = v.filter((r) => (r.ten + ' ' + r.ma_ch + ' ' + (r.khu_vuc || '')).toLowerCase().includes(k));
    }
    const g = {
      ten: (r) => r.ten || '', kv: (r) => r.khu_vuc || '',
      xs: (r) => Number(r.so_xs), mat: (r) => Number(r.so_mat),
      ngay: (r) => (r.ngay_ton == null ? -1 : Number(r.ngay_ton)),
      diem: (r) => (r.diem == null ? -1 : Number(r.diem)),
    }[sortC.col];
    if (g) {
      v.sort((a, b) => {
        const x = g(a), y = g(b);
        const c = typeof x === 'string' ? x.localeCompare(y, 'vi') : x - y;
        return sortC.dir === 'asc' ? c : -c;
      });
    }
    return v;
  }, [rows, loc, q, sortC]);

  const xuatExcel = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const diem = (rows || []).map((r) => ({
      'Nơi bán': r.ten, 'Mã': r.ma_ch, 'Khu vực': r.khu_vuc || '',
      'Mã trọng yếu': r.so_xs, 'Đang mất': r.so_mat,
      'Còn bán được (ngày)': r.ngay_ton, 'Điểm': r.diem, 'Xếp loại': r.xep_loai,
      'Điểm kỳ trước': truoc[r.ma_ch] ?? '', 'Tình trạng': CB[r.canh_bao]?.t || r.canh_bao,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(diem), 'Điểm đề nghị');
    if (maTrong?.length) {
      const mt = maTrong.map((m) => ({
        'Mã': m.sku || m.barcode, 'Tên': m.ten_sp || '', 'Nhóm': m.nganh_3 || '',
        'Số nơi sắp trống': m.so_noi, 'Nơi gấp nhất': m.ds_noi,
        'Tồn nơi bán': m.ton_noi_ban, 'Tồn kho tổng': m.ton_kho_tong,
        'Hướng xử lý': m.huong === 'CHIA' ? 'Chia từ kho' : m.huong === 'DIEU_PHOI' ? 'Điều phối ngang' : 'Cần sản xuất',
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mt), 'Mã sắp trống');
    }
    XLSX.writeFile(wb, `CHATLUONG_DN_${tu}_${den}.xlsx`);
  };

  const ds = (c) => setSortC((s) => ({ col: c, dir: s.col === c && s.dir === 'asc' ? 'desc' : 'asc' }));
  const ic = (c) => (sortC.col === c ? <i className="sort-ic">{sortC.dir === 'asc' ? '▲' : '▼'}</i> : null);

  return (
    <>
      <div className="cmdbar">
        <div className="cmd-title">
          <h2>Chất lượng đề nghị hàng</h2>
          <p>Sau khi đề nghị, nơi bán có đủ hàng để bán không · mã trọng yếu nào đang hụt</p>
        </div>
        <div className="cmd-row">
          <button className="btn-hd" onClick={nap} disabled={tai}>
            <IcRefresh /> {tai ? 'Đang tính…' : 'Làm mới'}
          </button>
        </div>
      </div>

      <div className="toolbar">
        {[7, 14, 30].map((n) => (
          <button key={n} className={'ds-tc-chip' + (tu === truNgay(n - 1) && den === isoVN() ? ' on' : '')}
            onClick={() => { setTu(truNgay(n - 1)); setDen(isoVN()); }}>{n} ngày</button>
        ))}
        <DateBox label="Từ" value={tu} onChange={setTu} />
        <DateBox label="Đến" value={den} onChange={setDen} />
        <input className="flt-in" placeholder="Tìm nơi bán / khu vực…" value={q}
          onChange={(e) => setQ(e.target.value)} style={{ height: 40, minWidth: 180, flex: 1 }} />
        <button className="btn btn-ai" onClick={xuatExcel} disabled={!rows?.length}>
          Xuất Excel
        </button>
      </div>

      {db && db.length > 0 && (
        <div className="card cl-dubao">
          <div className="cl-db-tit">
            <IcAlert />
            <div className="cl-db-txt">
              <b>{db.length} nơi bán sẽ trống mã trọng yếu trong {dbNgay} ngày tới</b>
              <span>tính theo tốc độ bán thật, đã cộng cả hàng đang trên đường về</span>
            </div>
            {[7, 14].map((n) => (
              <button key={n} className={'ds-tc-chip' + (dbNgay === n ? ' on' : '')}
                onClick={() => setDbNgay(n)}>{n}n</button>
            ))}
            <button className="btn btn-hd" onClick={() => setXemDb((v) => !v)}>
              {xemDb ? 'Thu gọn' : 'Xem danh sách'}
            </button>
          </div>
          {xemDb && (
            <div className="tbl-wrap" style={{ maxHeight: '40vh', overflow: 'auto', marginTop: 10 }}>
              <table className="tbl tbl-fit">
                <thead><tr><th>Nơi bán</th><th>Khu vực</th><th className="num">Mã trọng yếu</th>
                  <th className="num">Sẽ hết</th><th className="num">Còn bán được</th><th>Hết sớm nhất</th></tr></thead>
                <tbody>
                  {db.map((r) => (
                    <tr key={r.ma_ch}>
                      <td><b>{r.ten}</b><div className="tq-ghi mono">{r.ma_ch}</div></td>
                      <td>{r.khu_vuc || ''}</td>
                      <td className="num">{fmtN(r.so_xs)}</td>
                      <td className="num"><b className="hh-do">{fmtN(r.so_het)}</b></td>
                      <td className="num">{d1(r.ngay_ton)} ngày</td>
                      <td className="mono" style={{ fontSize: 11 }}>{r.ma_dau_tien || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {maTrong && maTrong.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="tq-card-tit">MÃ SẮP TRỐNG NHIỀU NƠI NHẤT
            <span className="tq-tit-phu">mã trọng yếu sẽ cạn trong {dbNgay} ngày, gom theo mã — biết ngay nên chia hay sản xuất</span></div>
          <div className="mt-bang">
            {maTrong.map((m) => (
              <div key={m.barcode} className="mt-o">
                <div className="mt-anh">
                  {m.hinh_url
                    ? <img src={m.hinh_url} alt="" loading="lazy"
                        onError={(e) => { e.target.style.display = 'none'; }} />
                    : <IcBox />}
                  <span className="mt-noi">{m.so_noi} nơi</span>
                </div>
                <div className="mt-tt">
                  <div className="mt-ten">{m.ten_sp || m.ma_tham_chieu || m.sku || m.barcode}</div>
                  <div className="mt-ds" title={m.ds_noi}>{m.ds_noi}</div>
                  <div className="mt-chan">
                    <span className="tq-ghi">kho <b>{fmtN(m.ton_kho_tong)}</b> · CH <b>{fmtN(m.ton_noi_ban)}</b></span>
                    {m.huong === 'CHIA'
                      ? <button className="mt-tag chia" onClick={() => chonTab('duyet')}>→ Chia từ kho</button>
                      : m.huong === 'DIEU_PHOI'
                        ? <button className="mt-tag dp" onClick={() => chonTab('ycdp')}>→ Điều phối ngang</button>
                        : <span className="mt-tag sx">Cần sản xuất</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="the-hang the-hang-wrap" style={{ margin: '14px 0' }}>
        <button className={'the-g' + (loc === 'ALL' ? ' on' : '')} onClick={() => setLoc('ALL')}>
          <span className="the-g-n">{fmtN(rows?.length)}</span>
          <span className="the-g-t">tất cả nơi bán<small>trong kỳ đang xem</small></span></button>
        <button className={'the-g' + (loc === 'MAT_MA' ? ' on' : '')} onClick={() => setLoc('MAT_MA')}>
          <span className="the-g-n" style={{ color: 'var(--magenta)' }}>{fmtN(dem('MAT_MA'))}</span>
          <span className="the-g-t">mất mã trọng yếu<small>hết sạch mà không đề nghị</small></span></button>
        <button className={'the-g' + (loc === 'HUT_SAU' ? ' on' : '')} onClick={() => setLoc('HUT_SAU')}>
          <span className="the-g-n" style={{ color: '#c47a1e' }}>{fmtN(dem('HUT_SAU'))}</span>
          <span className="the-g-t">không đủ tới kỳ sau<small>hàng hết trước lần đề nghị tới</small></span></button>
        <button className={'the-g' + (loc === 'SAP_HET' ? ' on' : '')} onClick={() => setLoc('SAP_HET')}>
          <span className="the-g-n" style={{ color: 'var(--gold)' }}>{fmtN(dem('SAP_HET'))}</span>
          <span className="the-g-t">có mã sắp hết<small>vài mã trọng yếu đang cạn</small></span></button>
        <button className={'the-g' + (loc === 'CHUA_DN' ? ' on' : '')} onClick={() => setLoc('CHUA_DN')}>
          <span className="the-g-n" style={{ color: 'var(--ink-2)' }}>{fmtN(dem('CHUA_DN'))}</span>
          <span className="the-g-t">chưa đề nghị<small>trong kỳ đang xem</small></span></button>
        <div className="the-g cl-diemtb">
          <span className="the-g-n">{diemTB == null ? '—' : d1(diemTB)}</span>
          <span className="the-g-t">điểm trung bình<small>thang 100</small></span></div>
      </div>

      <div className="card">
        <div className="cl-chuthich">
          <IcTarget />
          <span>Điểm gồm 6 phần: {CHI_SO.map(([, t, , w]) => t + ' ' + w + '%').join(' · ')}</span>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th className="sortable" onClick={() => ds('ten')}>Nơi bán{ic('ten')}</th>
                <th className="sortable" onClick={() => ds('kv')}>Khu vực{ic('kv')}</th>
                <th className="ct-giua sortable" onClick={() => ds('xs')}>Mã trọng yếu{ic('xs')}</th>
                <th className="ct-giua sortable" onClick={() => ds('mat')}>Đang mất{ic('mat')}</th>
                <th className="ct-giua sortable" onClick={() => ds('ngay')}>Còn bán được{ic('ngay')}</th>
                <th className="ct-giua" title={CHI_SO.map(([, t, , w]) => `${t} ${w}%`).join(' · ')}>6 chỉ số</th>
                <th className="ct-giua sortable" onClick={() => ds('diem')}>Điểm{ic('diem')}</th>
                <th style={{ width: '1%' }}>Tình trạng</th>
              </tr>
            </thead>
            <tbody>
              {rows === null && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 26, color: 'var(--ink-2)' }}>Đang tính…</td></tr>}
              {rows !== null && hien.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 26, color: 'var(--ink-2)' }}>Không có nơi bán nào khớp bộ lọc.</td></tr>}
              {hien.map((r) => (
                <Fragment key={r.ma_ch}>
                  <tr className="cl-row" onClick={() => xo(r)}>
                    <td><b>{r.ten}</b><div className="tq-ghi mono">{r.ma_ch}</div></td>
                    <td>{r.khu_vuc || ''}</td>
                    <td className="ct-giua">{fmtN(r.so_xs)}</td>
                    <td className="ct-giua">{r.so_mat > 0
                      ? <b className="hh-do">{fmtN(r.so_mat)}</b> : <span className="tq-ghi">0</span>}</td>
                    <td className="ct-giua">{r.ngay_ton == null ? <span className="tq-ghi">—</span>
                      : <b className={Number(r.ngay_ton) < Number(r.chu_ky) ? 'hh-do' : ''}>{d1(r.ngay_ton)} ngày</b>}
                      <div className="tq-ghi">kỳ {r.chu_ky} ngày</div></td>
                    <td className="ct-giua">
                      <div className="cl-6v" title={CHI_SO.map(([k, t]) => `${t}: ${r[k] == null ? '—' : Math.round(r[k])}`).join(' · ')}>
                        {CHI_SO.map(([k]) => (
                          <span key={k} className="cl-6v-cot">
                            <i style={{ height: `${Math.max(6, Math.round((r[k] || 0)))}%` }}
                              className={r[k] == null ? 'trong' : r[k] >= 70 ? 'tot' : r[k] >= 40 ? 'vua' : 'thap'} />
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="ct-giua">
                      <b className="cl-diem">{r.diem == null ? '—' : d1(r.diem)}</b>
                      {(() => {
                        const t = truoc[r.ma_ch];
                        if (r.diem == null || t == null) return null;
                        const dl = Number(r.diem) - Number(t);
                        if (Math.abs(dl) < 1) return <div className="cl-xh bang">＝</div>;
                        return <div className={'cl-xh ' + (dl > 0 ? 'len' : 'xuong')}>
                          {dl > 0 ? '▲' : '▼'} {Math.abs(dl).toFixed(0)}</div>;
                      })()}
                    </td>
                    <td>
                      <span className={'cl-xl cl-xl-' + (r.xep_loai || '').toLowerCase()}>{r.xep_loai}</span>
                      <div className={'cl-cb ' + (CB[r.canh_bao]?.c || '')}>{CB[r.canh_bao]?.t || r.canh_bao}</div>
                    </td>
                  </tr>
                  {mo === r.ma_ch && (
                    <tr className="cl-xo"><td colSpan={8}>
                      <div className="cl-nhom-tit">Mã trọng yếu của {r.ten} — những mã tạo nên 80% sản lượng 60 ngày qua</div>
                      {ma === null ? <div className="tq-ghi">Đang tải…</div>
                        : ma.length === 0 ? <div className="tq-ghi">Nơi này chưa có lịch sử bán đủ để xác định mã trọng yếu.</div> : (
                          <div className="tbl-wrap" style={{ maxHeight: '46vh', overflow: 'auto' }}>
                            <table className="tbl tbl-fit">
                              <thead><tr><th></th><th>Mã</th><th>Nhóm</th><th className="num">Bán 60 ngày</th>
                                <th className="num">Tốc độ</th><th className="num">Tồn</th><th className="num">Đã đề nghị</th>
                                <th className="num">Còn bán được</th><th>Tình trạng</th></tr></thead>
                              <tbody>
                                {ma.map((m) => (
                                  <tr key={m.barcode}>
                                    <td style={{ width: 40 }}>
                                      {m.hinh_url
                                        ? <img className="tqa" src={m.hinh_url} alt="" loading="lazy"
                                            onError={(e) => { e.target.style.visibility = 'hidden'; }} />
                                        : <span className="tqa tqa-trong"><IcBox /></span>}
                                    </td>
                                    <td className="mono" style={{ fontSize: 11 }}>{m.sku || m.barcode}</td>
                                    <td style={{ fontSize: 12 }}>{m.nganh_3 || ''}</td>
                                    <td className="num">{fmtN(m.ban_60)}</td>
                                    <td className="num">{d1(m.toc_do)}<span className="tq-ghi">/ngày</span></td>
                                    <td className="num"><b>{fmtN(m.ton)}</b></td>
                                    <td className="num">{m.da_dn > 0 ? fmtN(m.da_dn) : <span className="tq-ghi">0</span>}</td>
                                    <td className="num">{m.ngay_con == null ? <span className="tq-ghi">—</span>
                                      : <b className={m.tinh_trang !== 'DU' ? 'hh-do' : ''}>{d1(m.ngay_con)} ngày</b>}</td>
                                    <td><span className={'cl-tt cl-tt-' + m.tinh_trang.toLowerCase()}>{TT_MA[m.tinh_trang]}</span></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
