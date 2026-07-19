import { useEffect, useMemo, useRef, useState } from 'react';
import { sb, rpcHet } from '../lib/supabase.js';
import { IcClock, IcRefresh } from '../lib/icons.jsx';
import { DateBox, Sel } from '../lib/ui.jsx';
import { useApp } from '../App.jsx';

// LỊCH ĐỀ NGHỊ theo NGÀY CỤ THỂ — ma trận kiểm soát + import/sinh lịch + tuân thủ.
// N1: 2 lần/tuần thứ cố định · N2: 1 lần/tuần · N3: chu kỳ ~11 ngày phân bổ.
// Không xếp T7/CN (kho lấy hôm sau: T7 nửa ngày, CN nghỉ).
const isoNgay = (d) => d.toISOString().slice(0, 10);
const fmtDM = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
const THU2 = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export default function Lich() {
  const { user, baoToast } = useApp();
  const homNay = isoNgay(new Date());
  // Kỳ mặc định: hôm nay -> +31 ngày; nếu đã có lịch thì tự bám theo min/max quanh hôm nay
  const [tu, setTu] = useState(homNay);
  const [den, setDen] = useState(isoNgay(new Date(Date.now() + 31 * 864e5)));
  const [tab, setTab] = useState('MATRAN');
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState(null);        // fn_lich_matran
  const [nhomXem, setNhomXem] = useState('ALL');
  const [kv, setKv] = useState('ALL');
  const [q, setQ] = useState('');

  const tai = async () => {
    setBusy(true);
    const { data, error } = await rpcHet('fn_lich_matran', { p_tu: tu, p_den: den });
    setBusy(false);
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    setRows(data || []);
  };
  useEffect(() => { tai(); }, [tu, den]);

  // Dãy ngày trong kỳ
  const dsNgay = useMemo(() => {
    const out = []; let d = new Date(tu + 'T00:00:00'); const e = new Date(den + 'T00:00:00');
    while (d <= e && out.length < 62) { out.push(isoNgay(d)); d = new Date(d.getTime() + 864e5); }
    return out;
  }, [tu, den]);

  const dsKV = useMemo(() => [...new Set((rows || []).map((r) => r.khu_vuc).filter(Boolean))].sort(), [rows]);
  const hien = useMemo(() => {
    let v = rows || [];
    if (nhomXem !== 'ALL') v = v.filter((r) => String(r.nhom_ch) === nhomXem);
    if (kv !== 'ALL') v = v.filter((r) => r.khu_vuc === kv);
    const k = q.trim().toLowerCase();
    if (k) v = v.filter((r) => (r.ten + ' ' + r.ma_ch).toLowerCase().includes(k));
    return v;
  }, [rows, nhomXem, kv, q]);

  // Tổng theo ngày (hàng đầu ma trận)
  const tongNgay = useMemo(() => {
    const m = {};
    dsNgay.forEach((n) => { m[n] = 0; });
    (hien || []).forEach((r) => (r.ngay_lich || []).forEach((n) => { if (n in m) m[n]++; }));
    return m;
  }, [hien, dsNgay]);

  // TÓM TẮT KIỂM SOÁT: hôm nay ai tới lịch, ai chưa gửi; tuân thủ toàn kỳ (đã qua)
  const tomTat = useMemo(() => {
    const v = rows || [];
    const homNayLich = v.filter((r) => (r.ngay_lich || []).includes(homNay));
    const homNayChuaGui = homNayLich.filter((r) => !(r.ngay_gui || []).includes(homNay));
    let lichQua = 0, dungQua = 0;
    v.forEach((r) => {
      const gui = new Set(r.ngay_gui || []);
      (r.ngay_lich || []).forEach((n) => {
        if (n < homNay) { lichQua++; if (gui.has(n)) dungQua++; }
      });
    });
    return {
      homNayTong: homNayLich.length,
      homNayChuaGui: homNayChuaGui.map((r) => r).sort((a, b) => a.nhom_ch - b.nhom_ch),
      pct: lichQua ? Math.round(100 * dungQua / lichQua) : null,
      boLo: lichQua - dungQua,
    };
  }, [rows, homNay]);

  const toggleO = async (r, ngay) => {
    if (!['DIEU_PHOI', 'ADMIN'].includes(user.vai_tro)) return;
    const co = (r.ngay_lich || []).includes(ngay);
    const { error } = await sb.rpc('fn_sua_lich_ngay',
      { p_token: user.token, p_ma_ch: r.ma_ch, p_ngay: ngay, p_co: !co });
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    setRows((rs) => rs.map((x) => x.ma_ch !== r.ma_ch ? x : {
      ...x, ngay_lich: co ? x.ngay_lich.filter((n) => n !== ngay) : [...x.ngay_lich, ngay].sort(),
    }));
  };

  return (
    <>
      <div className="cmdbar">
        <h1>Lịch đề nghị hàng hóa</h1>
        <div className="sub">N1: 2 lần/tuần · N2: 1 lần/tuần · N3: chu kỳ ~11 ngày — không xếp T7/CN (kho lấy hôm sau).</div>
        <div className="row">
          <DateBox label="Từ" value={tu} onChange={setTu} />
          <DateBox label="Đến" value={den} onChange={setDen} />
          <button className="btn" onClick={tai} disabled={busy}><IcRefresh /> Tải lại</button>
        </div>
      </div>

      <div className="nhom-tabs" style={{ marginTop: 14 }}>
        <button className={'nhom-tab' + (tab === 'MATRAN' ? ' on' : '')} onClick={() => setTab('MATRAN')}>Ma trận lịch</button>
        <button className={'nhom-tab' + (tab === 'NHAP' ? ' on' : '')} onClick={() => setTab('NHAP')}>Nhập & sinh lịch</button>
        <button className={'nhom-tab' + (tab === 'TUANTHU' ? ' on' : '')} onClick={() => setTab('TUANTHU')}>Tuân thủ</button>
      </div>

      {tab === 'MATRAN' && (
        <MaTran hien={hien} dsNgay={dsNgay} tongNgay={tongNgay} homNay={homNay} tomTat={tomTat} setTab={setTab}
          nhomXem={nhomXem} setNhomXem={setNhomXem} kv={kv} setKv={setKv} dsKV={dsKV}
          q={q} setQ={setQ} toggleO={toggleO} suaDuoc={['DIEU_PHOI', 'ADMIN'].includes(user.vai_tro)} />
      )}
      {tab === 'NHAP' && <NhapSinh tu={tu} den={den} taiLai={tai} />}
      {tab === 'TUANTHU' && <TuanThu tu={tu} den={den} />}
    </>
  );
}

// ================= MA TRẬN =================
function MaTran({ hien, dsNgay, tongNgay, homNay, tomTat, setTab, nhomXem, setNhomXem, kv, setKv, dsKV, q, setQ, toggleO, suaDuoc }) {
  const fmtDM2 = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
  return (
    <>
      {/* THANH TÓM TẮT KIỂM SOÁT */}
      <div className="lich-tomtat">
        <div className="lich-tt-o">
          <div className="lich-tt-so" style={{ color: 'var(--navy)' }}>{tomTat.homNayTong}</div>
          <div className="lich-tt-ten">nơi bán tới lịch <b>hôm nay</b></div>
        </div>
        <div className={'lich-tt-o' + (tomTat.homNayChuaGui.length ? ' nhac' : '')}>
          <div className="lich-tt-so" style={{ color: tomTat.homNayChuaGui.length ? 'var(--magenta)' : 'var(--teal-deep)' }}>
            {tomTat.homNayChuaGui.length}
          </div>
          <div className="lich-tt-ten">chưa gửi <b>hôm nay</b></div>
        </div>
        <div className="lich-tt-o">
          <div className="lich-tt-so" style={{ color: tomTat.pct == null ? 'var(--ink-2)' : tomTat.pct >= 80 ? 'var(--teal-deep)' : tomTat.pct >= 50 ? '#a8842c' : 'var(--magenta)' }}>
            {tomTat.pct == null ? '—' : tomTat.pct + '%'}
          </div>
          <div className="lich-tt-ten">tuân thủ kỳ · <button className="lnk" onClick={() => setTab('TUANTHU')}>chi tiết</button></div>
        </div>
        <div className="lich-tt-o">
          <div className="lich-tt-so" style={{ color: tomTat.boLo ? 'var(--magenta)' : 'var(--teal-deep)' }}>{tomTat.boLo}</div>
          <div className="lich-tt-ten">lượt bỏ lỡ (đã qua)</div>
        </div>
      </div>

      {/* CẦN CHÚ Ý HÔM NAY — chip từng nơi bán chưa gửi */}
      {tomTat.homNayChuaGui.length > 0 && (
        <div className="card lich-canchuy">
          <div className="lich-cc-tit">⚠ {tomTat.homNayChuaGui.length} nơi bán tới lịch hôm nay nhưng chưa gửi phiếu</div>
          <div className="lich-cc-chips">
            {tomTat.homNayChuaGui.map((r) => (
              <span key={r.ma_ch} className="lich-cc-chip" title={r.ma_ch + ' · ' + (r.khu_vuc || '')}>
                <span className={'tag-n tag-n' + r.nhom_ch}>N{r.nhom_ch}</span> {r.ten}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 12, padding: 0, overflow: 'hidden' }}>
        {/* THANH LỌC — mỗi control tách bạch */}
        <div className="lich-loc">
          <div className="nhom-tabs" style={{ margin: 0 }}>
            {[['ALL', 'Tất cả'], ['1', 'Nhóm 1'], ['2', 'Nhóm 2'], ['3', 'Nhóm 3']].map(([v, t]) => (
              <button key={v} className={'nhom-tab' + (nhomXem === v ? ' on' : '')} onClick={() => setNhomXem(v)}>{t}</button>
            ))}
          </div>
          <div className="lich-loc-r">
            <Sel value={kv} onChange={setKv} placeholder="Khu vực"
              options={[{ value: 'ALL', label: 'Mọi khu vực' }, ...dsKV.map((k) => ({ value: k, label: k }))]} style={{ minWidth: 200 }} />
            <input className="inp" placeholder="Tìm cửa hàng…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 210 }} />
            <span className="sla-chip">{hien.length} nơi bán</span>
          </div>
        </div>

        {/* CHÚ THÍCH */}
        <div className="lich-chuthich">
          <span><i className="lich-dot co" /> Có lịch</span>
          <span><i className="lich-dot gui" /> Đã gửi đúng lịch</span>
          <span><i className="lich-dot lo" /> Bỏ lỡ</span>
          <span><i className="lich-dot ngoai" /> Gửi ngoài lịch</span>
          {suaDuoc && <span style={{ marginLeft: 'auto', opacity: .7, fontStyle: 'italic' }}>Bấm ô để thêm / bỏ lịch</span>}
        </div>

        <div className="tbl-wrap" style={{ maxHeight: '64vh', overflow: 'auto' }}>
        <table className="tbl lich-mt">
          <thead>
            <tr>
              <th className="lich-colten">Cửa hàng</th>
              <th style={{ width: 44 }}>Nhóm</th>
              {dsNgay.map((n) => {
                const dow = new Date(n + 'T00:00:00').getDay();
                const cuoiTuan = dow === 0 || dow === 6;
                return (
                  <th key={n} className={'lich-colngay' + (n === homNay ? ' homnay' : '') + (cuoiTuan ? ' cuoituan' : '')}>
                    <div>{fmtDM(n)}</div><div className="lich-thu">{THU2[dow]}</div>
                  </th>
                );
              })}
            </tr>
            <tr className="lich-tong">
              <th className="lich-colten" style={{ fontWeight: 600 }}>Tổng CH có lịch</th>
              <th />
              {dsNgay.map((n) => <th key={n} className={n === homNay ? 'homnay' : ''}>{tongNgay[n] || ''}</th>)}
            </tr>
          </thead>
          <tbody>
            {hien.map((r) => {
              const lich = new Set(r.ngay_lich || []);
              const gui = new Set(r.ngay_gui || []);
              return (
                <tr key={r.ma_ch}>
                  <td className="lich-colten" title={r.ma_ch + ' · ' + (r.khu_vuc || '')}>
                    <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.ten}</div>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--ink-2)' }}>{r.ma_ch}</div>
                  </td>
                  <td className="center"><span className={'tag-n tag-n' + r.nhom_ch}>N{r.nhom_ch}</span></td>
                  {dsNgay.map((n) => {
                    const co = lich.has(n), daGui = gui.has(n);
                    let cls = '';
                    if (co && daGui) cls = 'o-gui';
                    else if (co && n < homNay) cls = 'o-lo';
                    else if (co) cls = 'o-co';
                    else if (daGui) cls = 'o-ngoai';
                    return (
                      <td key={n} className={'lich-o ' + cls + (n === homNay ? ' homnay' : '')}
                        style={{ cursor: suaDuoc ? 'pointer' : 'default' }}
                        onClick={() => suaDuoc && toggleO(r, n)}
                        title={r.ten + ' · ' + fmtDM(n) + (co ? ' — có lịch' : '') + (daGui ? ' — đã gửi' : '')}>
                        {co && daGui ? '✓' : co && n < homNay ? '✕' : co ? '●' : daGui ? '△' : ''}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    </>
  );
}

// ================= NHẬP & SINH LỊCH =================
function NhapSinh({ tu, den, taiLai }) {
  const { user, baoToast } = useApp();
  const [preview, setPreview] = useState(null);   // {rows, khongKhop, tuF, denF}
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const docFile = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const all = XLSX.utils.sheet_to_json(ws, { header: 1 });
      const hdr = all[0] || [];
      // Cột ngày: các cột có dạng dd/mm (từ cột E trở đi thường)
      const colNgay = [];   // {idx, dd, mm}
      hdr.forEach((h, i) => {
        const m = String(h || '').trim().match(/^(\d{1,2})\/(\d{1,2})$/);
        if (m) colNgay.push({ idx: i, dd: +m[1], mm: +m[2] });
      });
      if (!colNgay.length) { baoToast('Không thấy cột ngày dạng dd/mm ở dòng 1'); setBusy(false); return; }
      // Suy năm: bám theo "Từ" đang chọn; nếu tháng nhảy ngược (12 -> 1) thì +1 năm
      const namGoc = +tu.slice(0, 4);
      let nam = namGoc, truoc = colNgay[0].mm;
      const ngayCua = colNgay.map((c) => {
        if (c.mm < truoc) nam++;   // 12 -> 01
        truoc = c.mm;
        return { idx: c.idx, iso: `${nam}-${String(c.mm).padStart(2, '0')}-${String(c.dd).padStart(2, '0')}` };
      });
      // Map tên CH -> ma_ch
      const { data: dsCH } = await sb.from('cua_hang').select('ma_ch, ten')
        .or('ma_ch.like.CH%,ma_ch.like.DB%');
      const map = {}; (dsCH || []).forEach((c) => { map[c.ten.trim().toUpperCase()] = c.ma_ch; });
      const out = []; const khongKhop = [];
      for (let i = 1; i < all.length; i++) {
        const r = all[i]; const ten = String(r?.[1] || '').trim();
        if (!ten) continue;
        const ma = map[ten.toUpperCase()];
        if (!ma) { if (String(r?.[0] || '').match(/^\d+$/)) khongKhop.push(ten); continue; }
        ngayCua.forEach(({ idx, iso }) => {
          if (String(r[idx] || '').trim().toLowerCase() === 'x') out.push({ ma_ch: ma, ngay: iso });
        });
      }
      const cacNgay = out.map((o) => o.ngay).sort();
      setPreview({ rows: out, khongKhop, tuF: cacNgay[0], denF: cacNgay[cacNgay.length - 1],
        soCH: new Set(out.map((o) => o.ma_ch)).size });
    } catch (e) { baoToast('Lỗi đọc file: ' + e.message); }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const ghi = async () => {
    if (!preview?.rows?.length) return;
    setBusy(true);
    const { data, error } = await sb.rpc('fn_lich_import', {
      p_token: user.token, p_tu: preview.tuF, p_den: preview.denF,
      p_rows: preview.rows,
    });
    setBusy(false);
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    baoToast(`Đã nhập lịch: ${data?.them_moi} ngày (thay ${data?.xoa_cu} dòng cũ trong kỳ)`);
    setPreview(null); taiLai();
  };

  const sinhTiep = async () => {
    setBusy(true);
    const { data, error } = await sb.rpc('fn_lich_sinh_tiep', { p_token: user.token, p_tu: tu, p_den: den });
    setBusy(false);
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    baoToast(`Đã sinh lịch ${data?.so_ngay_sinh} ngày cho ${data?.so_ch} nơi bán (${tu} → ${den})`);
    taiLai();
  };

  const taiMau = async () => {
    const XLSX = await import('xlsx');
    const { data } = await rpcHet('fn_lich_matran', { p_tu: tu, p_den: den });
    const dsN = []; let d = new Date(tu + 'T00:00:00'); const e = new Date(den + 'T00:00:00');
    while (d <= e) { dsN.push(isoNgay(d)); d = new Date(d.getTime() + 864e5); }
    const hdr = ['STT', 'TÊN CỬA HÀNG', 'KHU VỰC', 'NHÓM', ...dsN.map(fmtDM), 'TỔNG/CH'];
    const rowsX = (data || []).map((r, i) => {
      const lich = new Set(r.ngay_lich || []);
      const cells = dsN.map((n) => lich.has(n) ? 'x' : '');
      return [i + 1, r.ten, r.khu_vuc, 'N' + r.nhom_ch, ...cells, cells.filter(Boolean).length];
    });
    const ws = XLSX.utils.aoa_to_sheet([hdr, ...rowsX]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ma trận theo ngày');
    XLSX.writeFile(wb, `LICH_DE_NGHI_${tu}_${den}.xlsx`);
  };

  return (
    <div className="card" style={{ marginTop: 12, padding: 16 }}>
      <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <div>
          <div className="lbl" style={{ fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>⇪ Nhập lịch từ file ma trận</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 10, lineHeight: 1.5 }}>
            File Excel: dòng 1 tiêu đề có các cột ngày <b>dd/mm</b>; cột B = tên cửa hàng; đánh <b>x</b> vào ngày có lịch.
            Nhập kỳ mới sẽ <b>thay toàn bộ</b> lịch trong khoảng ngày của file.
          </div>
          <label className="btn" style={{ cursor: 'pointer' }}>
            Chọn file Excel…
            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
              onChange={(e) => docFile(e.target.files?.[0])} />
          </label>
          {preview && (
            <div style={{ marginTop: 12, padding: 12, background: 'var(--mist)', borderRadius: 10, fontSize: 13 }}>
              <div><b>{preview.soCH}</b> nơi bán · <b>{preview.rows.length}</b> ngày-lịch · kỳ <b>{fmtDM(preview.tuF)} → {fmtDM(preview.denF)}</b></div>
              {preview.khongKhop.length > 0 && (
                <div style={{ color: 'var(--magenta)', marginTop: 6 }}>
                  ⚠ {preview.khongKhop.length} tên không khớp danh bạ: {preview.khongKhop.slice(0, 5).join(', ')}{preview.khongKhop.length > 5 ? '…' : ''}
                </div>
              )}
              <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={ghi} disabled={busy}>Ghi lịch vào hệ thống</button>
                <button className="btn" onClick={() => setPreview(null)}>Hủy</button>
              </div>
            </div>
          )}
        </div>
        <div>
          <div className="lbl" style={{ fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>⚙ Sinh lịch tự động kỳ tiếp</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 10, lineHeight: 1.5 }}>
            Sinh lịch cho khoảng <b>{fmtDM(tu)} → {fmtDM(den)}</b> (chỉnh ở 2 ô ngày trên cùng) dựa trên kỳ trước:
            N1/N2 giữ đúng <b>thứ</b> cũ · N3 tiếp diễn <b>chu kỳ ~11 ngày</b> · tự né T7 &amp; CN.
            Không đè ngày đã có — sinh xong vẫn sửa tay từng ô ở Ma trận.
          </div>
          <button className="btn btn-primary" onClick={sinhTiep} disabled={busy}>Sinh lịch {fmtDM(tu)} → {fmtDM(den)}</button>
        </div>
        <div>
          <div className="lbl" style={{ fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>⬇ Tải file mẫu / lịch hiện tại</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 10, lineHeight: 1.5 }}>
            Xuất ma trận kỳ đang xem ra Excel đúng định dạng nhập — sửa ngoài file rồi nhập lại, hoặc dùng làm mẫu trắng.
          </div>
          <button className="btn" onClick={taiMau} disabled={busy}>Tải Excel kỳ {fmtDM(tu)} → {fmtDM(den)}</button>
        </div>
      </div>
    </div>
  );
}

// ================= TUÂN THỦ =================
function TuanThu({ tu, den }) {
  const { baoToast } = useApp();
  const [rows, setRows] = useState(null);
  const [sortC, setSortC] = useState({ col: 'pct', dir: 'asc' });
  useEffect(() => { (async () => {
    const { data, error } = await rpcHet('fn_lich_tuanthu', { p_tu: tu, p_den: den });
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    setRows(data || []);
  })(); }, [tu, den]);

  const homNayLo = useMemo(() => (rows || []).filter((r) => r.bo_lo > 0), [rows]);
  const tk = useMemo(() => {
    const v = rows || [];
    const tongLich = v.reduce((s, r) => s + (r.so_lich || 0), 0);
    const dung = v.reduce((s, r) => s + (r.dung_lich || 0), 0);
    const lo = v.reduce((s, r) => s + (r.bo_lo || 0), 0);
    const ngoai = v.reduce((s, r) => s + (r.ngoai_lich || 0), 0);
    return { tongLich, dung, lo, ngoai };
  }, [rows]);

  const doiSort = (col) => setSortC((s) => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }));
  const hien = useMemo(() => {
    const v = [...(rows || [])];
    const get = { ten: (r) => r.ten, nhom: (r) => r.nhom_ch, lich: (r) => r.so_lich,
      dung: (r) => r.dung_lich, lo: (r) => r.bo_lo, ngoai: (r) => r.ngoai_lich,
      pct: (r) => r.pct ?? -1 }[sortC.col];
    v.sort((a, b) => { const x = get(a), y = get(b);
      const c = typeof x === 'string' ? x.localeCompare(y) : x - y;
      return sortC.dir === 'asc' ? c : -c; });
    return v;
  }, [rows, sortC]);
  const ic = (c) => sortC.col === c ? (sortC.dir === 'asc' ? ' ▲' : ' ▼') : '';

  return (
    <>
      <div className="the-hang" style={{ marginTop: 12 }}>
        <div className="the-g"><div className="the-so">{tk.dung}<span className="the-sub">/{tk.tongLich}</span></div><div className="the-ten">Gửi đúng lịch</div></div>
        <div className="the-g"><div className="the-so" style={{ color: 'var(--magenta)' }}>{tk.lo}</div><div className="the-ten">Bỏ lỡ lịch (quá ngày chưa gửi)</div></div>
        <div className="the-g"><div className="the-so" style={{ color: 'var(--gold-deep, #a8842c)' }}>{tk.ngoai}</div><div className="the-ten">Gửi ngoài lịch</div></div>
      </div>
      <div className="card" style={{ marginTop: 12, padding: 14 }}>
        <div className="lbl" style={{ fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>
          Tuân thủ theo nơi bán ({fmtDM(tu)} → {fmtDM(den)}) — bấm cột để sắp xếp
        </div>
        <div className="tbl-wrap" style={{ maxHeight: '58vh', overflow: 'auto' }}>
          <table className="tbl tbl-fit">
            <thead><tr>
              <th className="sortable" onClick={() => doiSort('ten')}>Cửa hàng{ic('ten')}</th>
              <th className="center sortable" onClick={() => doiSort('nhom')}>Nhóm{ic('nhom')}</th>
              <th className="num sortable" onClick={() => doiSort('lich')}>Số lịch{ic('lich')}</th>
              <th className="num sortable" onClick={() => doiSort('dung')}>Đúng lịch{ic('dung')}</th>
              <th className="num sortable" onClick={() => doiSort('lo')}>Bỏ lỡ{ic('lo')}</th>
              <th className="num sortable" onClick={() => doiSort('ngoai')}>Ngoài lịch{ic('ngoai')}</th>
              <th className="num sortable" onClick={() => doiSort('pct')}>% tuân thủ{ic('pct')}</th>
            </tr></thead>
            <tbody>
              {hien.map((r) => (
                <tr key={r.ma_ch} className={r.bo_lo > 0 ? 'row-lo' : ''}>
                  <td><div style={{ fontWeight: 600 }}>{r.ten}</div>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--ink-2)' }}>{r.ma_ch} · {r.khu_vuc}</div></td>
                  <td className="center"><span className={'tag-n tag-n' + r.nhom_ch}>N{r.nhom_ch}</span></td>
                  <td className="num">{r.so_lich}</td>
                  <td className="num" style={{ color: 'var(--teal-deep)', fontWeight: 700 }}>{r.dung_lich}</td>
                  <td className="num" style={{ color: r.bo_lo > 0 ? 'var(--magenta)' : undefined, fontWeight: r.bo_lo > 0 ? 700 : 400 }}>{r.bo_lo}</td>
                  <td className="num">{r.ngoai_lich}</td>
                  <td className="num" style={{ fontWeight: 700,
                    color: r.pct == null ? 'var(--ink-2)' : r.pct >= 80 ? 'var(--teal-deep)' : r.pct >= 50 ? '#a8842c' : 'var(--magenta)' }}>
                    {r.pct == null ? '—' : r.pct + '%'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
