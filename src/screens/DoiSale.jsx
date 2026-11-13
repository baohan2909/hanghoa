import { useEffect, useMemo, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { useApp } from '../App.jsx';
import { IcRefresh, IcDown, IcAlert, IcTruck, IcBox, IcClock, IcGrid, IcSpark } from '../lib/icons.jsx';
import DsBanChia from './DsBanChia.jsx';

// ============================================================================
// ĐỘI SALE — màn RIÊNG cho 20 đội sale (hoạt động độc lập với CH/ĐB)
// Nhìn 1 lần biết: đội nào sắp hết, đội nào ôm hàng, mã nào nên chuyển đội nào.
// Số liệu: chiahang.fn_ds_tong_quan (SQL 191). Lệnh điều chuyển lưu bằng fn_dp_luu
// (cùng bảng dieu_phoi_ngang với Yêu cầu ĐP) + xuất file Excel cùng khuôn cho kho.
// ============================================================================

const fmtN = (n) => (n == null ? '—' : Number(n).toLocaleString('vi'));
const ngayVN = (s) => (s ? s.slice(8, 10) + '/' + s.slice(5, 7) : '—');
const gioVN = (s) => { if (!s) return '—'; const d = new Date(s); return d.toLocaleTimeString('vi', { hour: '2-digit', minute: '2-digit' }) + ' ' + d.toLocaleDateString('vi', { day: '2-digit', month: '2-digit' }); };
const tenNgan = (t) => (t || '').replace(/^Đội SALE\s*/i, 'Đội ');

// Màu "số ngày đủ hàng": đỏ < sắp hết, vàng < 2× sắp hết, xanh đủ, xám tồn lâu
const mauNgay = (n, ts) => (n == null ? 'var(--ink-2)' : n < ts.sap_het ? 'var(--magenta)'
  : n < ts.sap_het * 2 ? '#B7791F' : n > ts.ton_lau ? 'var(--ink-2)' : 'var(--teal-deep)');

// Tồn hiển thị "thực + đi đường = tổng"
function TonCong({ ton, duong }) {
  if (!duong) return <b>{fmtN(ton)}</b>;
  const ve = duong > 0;   // dương = đang về; âm = đã giữ để chuyển đi
  return (
    <span style={{ whiteSpace: 'nowrap' }}
      title={`Thực tế ${ton} · ${ve ? 'đang về' : 'đang chuyển đi'} ${Math.abs(duong)} · dự tính ${ton + duong}`}>
      {fmtN(ton)}<span className={ve ? 'dsl-duong' : 'dsl-duong di'}>{ve ? ' + ' : ' − '}{fmtN(Math.abs(duong))}</span> = <b>{fmtN(ton + duong)}</b>
    </span>
  );
}

// Biểu đồ bán 14 ngày (SVG thuần, không thư viện)
function Spark({ data }) {
  const W = 120, H = 30, n = data?.length || 0;
  if (!n) return null;
  const max = Math.max(1, ...data);
  const bw = W / n;
  return (
    <svg className="dsl-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label="Bán 14 ngày">
      {data.map((v, i) => {
        const h = v > 0 ? Math.max(2, (v / max) * (H - 2)) : 1;
        return <rect key={i} x={i * bw + 1} y={H - h} width={bw - 2} height={h} rx="1.5"
          fill={i === n - 1 ? 'var(--teal)' : v > 0 ? 'var(--teal-deep)' : 'var(--line)'} opacity={v > 0 ? 0.85 : 1} />;
      })}
    </svg>
  );
}

// Bảng sắp xếp được, có cột #
function useSort(rows, khoaMacDinh, chieuMacDinh = 'desc') {
  const [k, setK] = useState(khoaMacDinh);
  const [c, setC] = useState(chieuMacDinh);
  const sorted = useMemo(() => {
    const v = [...(rows || [])];
    v.sort((a, b) => {
      const x = a[k], y = b[k];
      if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
      const r = typeof x === 'number' || typeof y === 'number' ? Number(x) - Number(y) : String(x).localeCompare(String(y), 'vi');
      return c === 'asc' ? r : -r;
    });
    return v;
  }, [rows, k, c]);
  const Th = ({ id, children, num, style }) => (
    <th className={(num ? 'num ' : '') + 'dsl-th'} style={style}
      onClick={() => { if (k === id) setC(c === 'asc' ? 'desc' : 'asc'); else { setK(id); setC(num ? 'desc' : 'asc'); } }}>
      {children}{k === id ? (c === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  );
  return [sorted, Th];
}

function maLenhMoi(tien) {
  const d = new Date();
  return tien + d.toISOString().slice(0, 10).replace(/-/g, '') + '-'
    + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
}

// Ô nhập số ngày: gõ số, Enter hoặc rời ô mới áp dụng (không tính lại theo từng phím)
function NgayIn({ nhan, sau, value, min, max, onChange, goiY }) {
  const [v, setV] = useState(String(value));
  useEffect(() => { setV(String(value)); }, [value]);
  const chot = () => {
    const n = Math.min(max, Math.max(min, parseInt(v, 10) || value));
    setV(String(n));
    if (n !== value) onChange(n);
  };
  return (
    <label className="dsl-ngay" title={goiY}>
      <span>{nhan}</span>
      <input type="number" inputMode="numeric" min={min} max={max} value={v}
        onChange={(e) => setV(e.target.value)} onBlur={chot}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
        onFocus={(e) => e.target.select()} />
      <span>{sau}</span>
    </label>
  );
}

export default function DoiSale() {
  const { user, baoToast } = useApp();
  const [kq, setKq] = useState(null);
  const [ts, setTs] = useState({ cua_so: 28, muc_tieu: 21, sap_het: 7, ton_lau: 60 });
  const [doi, setDoi] = useState(null);         // đội đang lọc
  const [tab, setTab] = useState('dc');          // dc | kho | lau
  const [q, setQ] = useState('');
  const [sl, setSl] = useState({});              // khoá dòng -> SL sửa tay
  const [bo, setBo] = useState({});              // khoá dòng -> true = bỏ chọn
  const [sapXep, setSapXep] = useState('van_de');
  const [manHinh, setManHinh] = useState('tq');   // tq = tổng quan | ban = bàn chia hàng
  const [chonBan, setChonBan] = useState(null);

  const tai = async () => {
    setKq(null);
    const { data, error } = await sb.rpc('fn_ds_tong_quan', {
      p_cua_so: ts.cua_so, p_muc_tieu: ts.muc_tieu, p_sap_het: ts.sap_het, p_ton_lau: ts.ton_lau,
    });
    if (error) { baoToast('Lỗi: ' + error.message); setKq({ doi: [], dieu_chuyen: [], xuat_kho: [], ton_lau: [], tham_so: ts }); return; }
    setKq(data); setSl({}); setBo({});
  };
  useEffect(() => { tai(); }, [ts]);   // eslint-disable-line

  const T = kq?.tham_so || ts;
  const loc = (r, ...keys) => {
    if (doi && !keys.some((k) => r[k] === doi)) return false;
    if (!q.trim()) return true;
    const t = q.trim().toLowerCase();
    return [r.ma_tham_chieu, r.barcode, r.nganh_3, r.nganh_1].some((x) => (x || '').toLowerCase().includes(t));
  };

  const dsDoi = useMemo(() => {
    const v = [...(kq?.doi || [])];
    const diem = (d) => d.ma_sap_het * 3 + d.ma_het * 2 + (d.chuyen_di + d.nhan_ve > 0 ? 1 : 0);
    if (sapXep === 'van_de') v.sort((a, b) => diem(b) - diem(a) || a.ma_ch.localeCompare(b.ma_ch));
    else if (sapXep === 'ban') v.sort((a, b) => b.ban_ngay - a.ban_ngay);
    else if (sapXep === 'ton') v.sort((a, b) => b.co - a.co);
    else v.sort((a, b) => a.ma_ch.localeCompare(b.ma_ch));
    return v;
  }, [kq, sapXep]);

  const khoaDc = (r) => `dc|${r.barcode}|${r.tu}|${r.den}`;
  const khoaKho = (r) => `kho|${r.barcode}|${r.den}`;
  const dc = useMemo(() => (kq?.dieu_chuyen || []).filter((r) => loc(r, 'tu', 'den'))
    .map((r) => ({ ...r, k: khoaDc(r), sl_chot: sl[khoaDc(r)] ?? r.sl })), [kq, doi, q, sl]);   // eslint-disable-line
  const kho = useMemo(() => (kq?.xuat_kho || []).filter((r) => loc(r, 'den'))
    .map((r) => {
      const goiY = Math.min(r.can, Math.max(r.kho_sa1 || 0, r.kho_sa2 || 0));
      return { ...r, k: khoaKho(r), tu_kho: (r.kho_sa1 || 0) >= (r.kho_sa2 || 0) ? 'SA05001' : 'SA05002', sl_chot: sl[khoaKho(r)] ?? goiY };
    }), [kq, doi, q, sl]);   // eslint-disable-line
  const lau = useMemo(() => (kq?.ton_lau || []).filter((r) => loc(r, 'ma_ch')), [kq, doi, q]);   // eslint-disable-line

  const [dcS, ThDc] = useSort(dc, 'den_ngay_du', 'asc');
  const [khoS, ThKho] = useSort(kho, 'ngay_du', 'asc');
  const [lauS, ThLau] = useSort(lau, 'sl', 'desc');

  const tong = useMemo(() => {
    const d = kq?.doi || [];
    const s = (f) => d.reduce((a, x) => a + Number(x[f] || 0), 0);
    return {
      ton: s('ton'), duong: s('duong'), ban: s('ban'), banNgay: s('ban_ngay'),
      sapHet: s('ma_sap_het'), het: s('ma_het'), tonLau: s('sl_ton_lau'),
      dcSl: (kq?.dieu_chuyen || []).reduce((a, x) => a + x.sl, 0), dcN: (kq?.dieu_chuyen || []).length,
      khoSl: (kq?.xuat_kho || []).reduce((a, x) => a + x.can, 0), khoN: (kq?.xuat_kho || []).length,
    };
  }, [kq]);

  const thieuLichSu = kq?.tham_so?.ban_cu_nhat && kq.tham_so.ban_cu_nhat > kq.tham_so.ban_tu;
  const chuaCoBan = kq && !kq.tham_so?.ban_moi_nhat;

  // Xuất file Excel cùng khuôn Yêu cầu ĐP + lưu lệnh để đối chiếu phiếu sau này
  const xuat = async (loai) => {
    const ds = (loai === 'dc' ? dcS : khoS).filter((r) => !bo[r.k] && Number(r.sl_chot) > 0);
    if (!ds.length) { baoToast('Chưa có dòng nào để xuất'); return; }
    const XLSX = await import('xlsx');
    const maLenh = maLenhMoi(loai === 'dc' ? 'DS' : 'DSK');
    const hang = ds.map((r) => ({
      'Kho chuyển': loai === 'dc' ? r.tu : r.tu_kho,
      'Tên kho chuyển': loai === 'dc' ? r.tu_ten : (r.tu_kho === 'SA05001' ? 'Kho Sale Bảo Hiểm Offline' : 'Kho Sale Nón vải'),
      'Cửa hàng nhận': r.den, 'Tên cửa hàng nhận': r.den_ten,
      Barcode: r.barcode, 'Mã tham chiếu': r.ma_tham_chieu || '', 'Sản phẩm': r.nganh_3 || '',
      'Số lượng': Number(r.sl_chot), 'Ghi chú': maLenh,
    }));
    const ws = XLSX.utils.json_to_sheet(hang);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DieuChuyen');
    XLSX.writeFile(wb, `${maLenh}.xlsx`);
    const { error } = await sb.rpc('fn_dp_luu', {
      p_ma_lenh: maLenh, p_nguoi: user?.ma_dang_nhap || '',
      p_rows: ds.map((r) => ({ barcode: r.barcode, tu: loai === 'dc' ? r.tu : r.tu_kho, den: r.den, sl: Number(r.sl_chot) })),
    });
    if (error) baoToast('Đã xuất file nhưng chưa lưu được lệnh: ' + error.message);
    else baoToast(`Đã xuất ${maLenh} — ${ds.length} dòng, ${fmtN(ds.reduce((a, r) => a + Number(r.sl_chot), 0))} cái`);
  };

  const soChon = (rows) => rows.filter((r) => !bo[r.k] && Number(r.sl_chot) > 0);
  const nutChonHet = (rows) => {
    const het = rows.every((r) => !bo[r.k]);
    return <input type="checkbox" checked={het} onChange={() => setBo((b) => {
      const m = { ...b }; rows.forEach((r) => { m[r.k] = het; }); return m; })} />;
  };

  return (
    <>
      <div className="cmdbar">
        <div className="cmd-title">
          <h2>Đội Sale</h2>
          <p>Đội nào sắp hết · đội nào ôm hàng · mã nào nên chuyển — điều phối chốt, hệ thống gợi ý kèm lý do</p>
        </div>
        <div className="cmd-row">
          <button className="btn-hd" onClick={tai}><IcRefresh /> Làm mới</button>
        </div>
      </div>

      <div className="hh-tabs dsl-man">
        <button className={'hh-tab' + (manHinh === 'tq' ? ' on' : '')} onClick={() => setManHinh('tq')}><IcGrid /> Tổng quan</button>
        <button className={'hh-tab' + (manHinh === 'ban' ? ' on' : '')} onClick={() => setManHinh('ban')}><IcSpark /> Chia hàng đội sale</button>
      </div>

      <div className="toolbar">
        <NgayIn nhan="Sức bán" sau="ngày" value={ts.cua_so} min={3} max={180} onChange={(v) => setTs({ ...ts, cua_so: v })}
          goiY="Lấy số bán bao nhiêu ngày gần nhất để tính bán/ngày" />
        <NgayIn nhan="Chia đủ dùng" sau="ngày" value={ts.muc_tieu} min={1} max={180} onChange={(v) => setTs({ ...ts, muc_tieu: v })}
          goiY="Chia hàng để mỗi đội đủ bán bao nhiêu ngày" />
        <NgayIn nhan="Sắp hết dưới" sau="ngày" value={ts.sap_het} min={1} max={90} onChange={(v) => setTs({ ...ts, sap_het: v })}
          goiY="Đội còn ít hơn số ngày này là thiếu, cần bù" />
        <NgayIn nhan="Tồn lâu trên" sau="ngày" value={ts.ton_lau} min={7} max={365} onChange={(v) => setTs({ ...ts, ton_lau: v })}
          goiY="Đội còn nhiều hơn số ngày này (hoặc không bán) là dư, có thể cho" />
        {manHinh === 'tq' && <input className="flt-in" placeholder="Tìm mã / sản phẩm…" value={q}
          onChange={(e) => setQ(e.target.value)} style={{ height: 40, minWidth: 160, flex: 1 }} />}
        {kq && <span className="sla-chip"><IcClock /> Tồn {gioVN(kq.tham_so?.ton_luc)} · Bán tới {ngayVN(kq.tham_so?.ban_moi_nhat)}</span>}
      </div>

      {manHinh === 'ban' ? (
        <DsBanChia dsDoi={kq?.doi || []} ts={ts} initChon={chonBan} />
      ) : (<>
      {(thieuLichSu || chuaCoBan) && (
        <div className="dsl-canh">
          <IcAlert /> {chuaCoBan
            ? 'Chưa có số bán đội sale — chạy napLaiBanDoiSale() trong Apps Script để nạp từ tháng 8.'
            : `Số bán mới có từ ${ngayVN(kq.tham_so.ban_cu_nhat)} — cửa sổ ${T.cua_so} ngày chưa đủ, gợi ý có thể lệch.`}
        </div>
      )}

      {!kq ? <div className="card dsl-trong">Đang tính…</div> : (<>
        {/* ===== Dải số tổng ===== */}
        <div className="dsl-kpis">
          <div className="dsl-kpi">
            <span className="l">Tồn {(kq.doi || []).length} đội (thực + đang về)</span>
            <span className="v"><TonCong ton={tong.ton} duong={tong.duong} /></span>
            <span className="s">bán {fmtN(Math.round(tong.banNgay))} cái/ngày</span>
          </div>
          <div className={'dsl-kpi' + (tong.sapHet ? ' k-do' : '')}>
            <span className="l">Mã sắp hết (&lt; {T.sap_het} ngày)</span>
            <span className="v">{fmtN(tong.sapHet)}</span>
            <span className="s">{fmtN(tong.het)} mã đang bán mà đã hết</span>
          </div>
          <div className={'dsl-kpi k-click' + (tong.dcN ? ' k-teal' : '')} onClick={() => setTab('dc')}>
            <span className="l">Nên chuyển giữa đội</span>
            <span className="v">{fmtN(tong.dcSl)}<small> cái</small></span>
            <span className="s">{fmtN(tong.dcN)} dòng · không tốn hàng kho</span>
          </div>
          <div className="dsl-kpi k-click" onClick={() => setTab('kho')}>
            <span className="l">Cần xuất thêm từ kho</span>
            <span className="v">{fmtN(tong.khoSl)}<small> cái</small></span>
            <span className="s">{fmtN(tong.khoN)} dòng · sau khi đã chuyển đội</span>
          </div>
          <div className={'dsl-kpi k-click' + (tong.tonLau ? ' k-vang' : '')} onClick={() => setTab('lau')}>
            <span className="l">Hàng nằm lâu (&gt; {T.ton_lau} ngày / không bán)</span>
            <span className="v">{fmtN(tong.tonLau)}<small> cái</small></span>
            <span className="s">nguồn để chuyển đi</span>
          </div>
        </div>

        {/* ===== Bản đồ đội ===== */}
        <div className="dsl-head">
          <button className="btn btn-ai dsl-mo-ban" onClick={() => { setChonBan(doi ? [doi] : dsDoi.filter((d) => d.ma_sap_het > 0 || d.ma_het > 0 || d.chuyen_di > 0 || d.nhan_ve > 0).map((d) => d.ma_ch).sort()); setManHinh('ban'); }}>
            <IcSpark /> Mở chia hàng đội sale
          </button>
          <div className="hh-tabs">
            {[['van_de', 'Vấn đề trước'], ['ban', 'Bán nhanh'], ['ton', 'Tồn nhiều'], ['ma', 'Theo mã']].map(([k, t]) => (
              <button key={k} className={'hh-tab' + (sapXep === k ? ' on' : '')} onClick={() => setSapXep(k)}>{t}</button>
            ))}
          </div>
        </div>
        <div className="dsl-grid">
          {dsDoi.map((d) => {
            const moi = d.ban === 0 && d.co > 0;
            const cls = d.ma_sap_het > 0 || d.ma_het > 0 ? ' s-do' : moi ? ' s-moi' : d.ngay_du > T.ton_lau ? ' s-vang' : '';
            return (
              <button key={d.ma_ch} className={'dsl-doi' + cls + (doi === d.ma_ch ? ' s-on' : '') + (doi && doi !== d.ma_ch ? ' s-mo' : '')}
                onClick={() => setDoi(doi === d.ma_ch ? null : d.ma_ch)}>
                <div className="dsl-doi-top">
                  <span className="dsl-doi-ten">{tenNgan(d.ten)}</span>
                  <span className="dsl-doi-ngay" style={{ color: moi ? 'var(--ink-2)' : mauNgay(d.ngay_du, T) }}>
                    {moi ? 'chưa bán' : d.ngay_du == null ? '—' : d.ngay_du > 365 ? <>&gt;1<small> năm</small></> : <>{fmtN(d.ngay_du)}<small> ngày</small></>}
                  </span>
                </div>
                <div className="dsl-doi-ton"><TonCong ton={d.ton} duong={d.duong} /> <span className="tq-ghi">cái · {d.so_ma} mã</span></div>
                <Spark data={d.ban_14} />
                <div className="dsl-doi-ban">{fmtN(d.ban_ngay)}/ngày · {fmtN(d.ban)} cái {T.cua_so} ngày</div>
                <div className="dsl-chips">
                  {d.ma_sap_het > 0 && <span className="dsl-chip c-do">{d.ma_sap_het} mã sắp hết</span>}
                  {d.ma_het > 0 && <span className="dsl-chip c-do">{d.ma_het} mã hết</span>}
                  {d.ma_ton_lau > 0 && <span className="dsl-chip c-vang">{d.ma_ton_lau} mã nằm lâu</span>}
                  {d.nhan_ve > 0 && <span className="dsl-chip c-teal">↓ nhận {fmtN(d.nhan_ve)}</span>}
                  {d.chuyen_di > 0 && <span className="dsl-chip c-xam">↑ chuyển {fmtN(d.chuyen_di)}</span>}
                </div>
              </button>
            );
          })}
        </div>

        {/* ===== Danh sách việc ===== */}
        <div className="dsl-head" style={{ marginTop: 18 }}>
          <div className="hh-tabs" style={{ marginLeft: 0 }}>
            <button className={'hh-tab' + (tab === 'dc' ? ' on' : '')} onClick={() => setTab('dc')}><IcTruck /> Chuyển giữa đội ({dc.length})</button>
            <button className={'hh-tab' + (tab === 'kho' ? ' on' : '')} onClick={() => setTab('kho')}><IcBox /> Cần xuất kho ({kho.length})</button>
            <button className={'hh-tab' + (tab === 'lau' ? ' on' : '')} onClick={() => setTab('lau')}><IcClock /> Hàng nằm lâu ({lau.length})</button>
          </div>
          {tab !== 'lau' && (
            <button className="btn btn-ai" style={{ marginLeft: 'auto' }} onClick={() => xuat(tab)}
              disabled={!soChon(tab === 'dc' ? dcS : khoS).length}>
              <IcDown /> Xuất file + lưu lệnh ({soChon(tab === 'dc' ? dcS : khoS).length})
            </button>
          )}
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="tbl-wrap" style={{ maxHeight: '62vh', overflow: 'auto' }}>
            {tab === 'dc' && (
              <table className="tbl dsl-tbl">
                <thead><tr>
                  <th style={{ width: 30 }}>{nutChonHet(dcS)}</th><th className="num" style={{ width: 34 }}>#</th>
                  <ThDc id="ma_tham_chieu">Sản phẩm</ThDc>
                  <ThDc id="tu_ten">Lấy từ</ThDc>
                  <ThDc id="den_ten">Chuyển đến</ThDc>
                  <ThDc id="den_ngay_du" num>Nơi nhận còn</ThDc>
                  <ThDc id="sl" num style={{ width: 90 }}>Số lượng</ThDc>
                  <th>Vì sao</th>
                </tr></thead>
                <tbody>
                  {dcS.length === 0 ? <tr><td colSpan={8} className="dsl-trong">
                    {chuaCoBan ? 'Chưa có số bán để tính.' : 'Không có mã nào cần chuyển giữa đội với tham số hiện tại.'}</td></tr>
                    : dcS.map((r, i) => (
                    <tr key={r.k} className={bo[r.k] ? 'dsl-bo' : ''}>
                      <td><input type="checkbox" checked={!bo[r.k]} onChange={(e) => setBo((b) => ({ ...b, [r.k]: !e.target.checked }))} /></td>
                      <td className="num tq-ghi">{i + 1}</td>
                      <td><b>{r.ma_tham_chieu || r.barcode}</b><div className="tq-ghi">{r.nganh_3 || r.nganh_1}</div></td>
                      <td><b>{tenNgan(r.tu_ten)}</b><div className="tq-ghi">tồn {r.tu_ton} · bán {r.tu_ban}/{T.cua_so} ngày</div></td>
                      <td><b>{tenNgan(r.den_ten)}</b><div className="tq-ghi">có {r.den_co} · bán {fmtN(r.den_ban_ngay)}/ngày</div></td>
                      <td className="num"><b style={{ color: mauNgay(r.den_ngay_du, T) }}>{r.den_ngay_du ?? 0} ngày</b></td>
                      <td className="num"><input className="qty-input" type="number" min="0" value={r.sl_chot}
                        onChange={(e) => setSl((m) => ({ ...m, [r.k]: Math.max(0, parseInt(e.target.value) || 0) }))} /></td>
                      <td className="dsl-ly">
                        {tenNgan(r.den_ten)} chỉ đủ <b>{r.den_ngay_du ?? 0} ngày</b>;{' '}
                        {r.tu_ban === 0 ? <>{tenNgan(r.tu_ten)} <b>không bán cái nào</b> {T.cua_so} ngày</>
                          : <>{tenNgan(r.tu_ten)} đủ tới <b>{fmtN(r.tu_ngay_du)} ngày</b></>}
                        {' '}→ chuyển {r.sl} cái, nơi nhận đủ ~{T.muc_tieu} ngày
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {tab === 'kho' && (
              <table className="tbl dsl-tbl">
                <thead><tr>
                  <th style={{ width: 30 }}>{nutChonHet(khoS)}</th><th className="num" style={{ width: 34 }}>#</th>
                  <ThKho id="den_ten">Đội</ThKho>
                  <ThKho id="ma_tham_chieu">Sản phẩm</ThKho>
                  <ThKho id="ngay_du" num>Còn</ThKho>
                  <ThKho id="ban_ngay" num>Bán/ngày</ThKho>
                  <ThKho id="can" num>Cần</ThKho>
                  <ThKho id="kho_sa1" num>Kho BH (SA05001)</ThKho>
                  <ThKho id="kho_sa2" num>Kho NV (SA05002)</ThKho>
                  <th className="num" style={{ width: 90 }}>Xuất</th>
                </tr></thead>
                <tbody>
                  {khoS.length === 0 ? <tr><td colSpan={10} className="dsl-trong">Không đội nào cần xuất thêm từ kho.</td></tr>
                    : khoS.map((r, i) => (
                    <tr key={r.k} className={bo[r.k] ? 'dsl-bo' : ''}>
                      <td><input type="checkbox" checked={!bo[r.k]} onChange={(e) => setBo((b) => ({ ...b, [r.k]: !e.target.checked }))} /></td>
                      <td className="num tq-ghi">{i + 1}</td>
                      <td><b>{tenNgan(r.den_ten)}</b></td>
                      <td><b>{r.ma_tham_chieu || r.barcode}</b><div className="tq-ghi">{r.nganh_3 || r.nganh_1}</div></td>
                      <td className="num"><b style={{ color: mauNgay(r.ngay_du, T) }}>{r.ngay_du ?? 0} ngày</b></td>
                      <td className="num">{fmtN(r.ban_ngay)}</td>
                      <td className="num"><b style={{ color: 'var(--magenta)' }}>{r.can}</b></td>
                      <td className="num" style={{ color: r.kho_sa1 ? 'var(--teal-deep)' : 'var(--ink-2)' }}>{fmtN(r.kho_sa1)}</td>
                      <td className="num" style={{ color: r.kho_sa2 ? 'var(--teal-deep)' : 'var(--ink-2)' }}>{fmtN(r.kho_sa2)}</td>
                      <td className="num">{r.kho_co > 0
                        ? <input className="qty-input" type="number" min="0" value={r.sl_chot}
                            onChange={(e) => setSl((m) => ({ ...m, [r.k]: Math.max(0, parseInt(e.target.value) || 0) }))} />
                        : <span className="dsl-chip c-do">kho hết</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {tab === 'lau' && (
              <table className="tbl dsl-tbl">
                <thead><tr>
                  <th className="num" style={{ width: 34 }}>#</th>
                  <ThLau id="ten">Đội</ThLau>
                  <ThLau id="ma_tham_chieu">Sản phẩm</ThLau>
                  <ThLau id="ton" num>Tồn</ThLau>
                  <ThLau id="ban" num>Bán {T.cua_so} ngày</ThLau>
                  <ThLau id="ban_cuoi">Bán lần cuối</ThLau>
                  <ThLau id="sl" num>Dư chưa ai cần</ThLau>
                </tr></thead>
                <tbody>
                  {lauS.length === 0 ? <tr><td colSpan={7} className="dsl-trong">Không có hàng nằm lâu.</td></tr>
                    : lauS.map((r, i) => (
                    <tr key={r.ma_ch + r.barcode}>
                      <td className="num tq-ghi">{i + 1}</td>
                      <td><b>{tenNgan(r.ten)}</b></td>
                      <td><b>{r.ma_tham_chieu || r.barcode}</b><div className="tq-ghi">{r.nganh_1}</div></td>
                      <td className="num">{r.ton}</td>
                      <td className="num">{r.ban}</td>
                      <td>{r.ban_cuoi ? ngayVN(r.ban_cuoi) : <span className="tq-ghi">không bán</span>}</td>
                      <td className="num"><b style={{ color: '#B7791F' }}>{r.sl}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <div className="tq-ghi" style={{ marginTop: 8 }}>
          Cách tính: sức bán = bán {T.cua_so} ngày ÷ {T.cua_so}; có = tồn thực + đang về; còn (ngày) = có ÷ sức bán.
          Đội thiếu: còn &lt; {T.sap_het} ngày → cần đủ {T.muc_tieu} ngày. Đội cho: không bán hoặc còn &gt; {T.ton_lau} ngày,
          chỉ lấy hàng ĐANG CÓ (không lấy hàng đang về), luôn giữ lại đủ {T.muc_tieu} ngày bán. Dưới 3 cái thì bỏ qua.
          Bao bì (giá niêm yết 0đ: túi giấy, bao…) không tính.
        </div>
      </>)}
      </>)}
    </>
  );
}
