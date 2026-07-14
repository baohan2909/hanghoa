import { useEffect, useMemo, useRef, useState } from 'react';
import { sb, fmtVND, LY_DO } from '../lib/supabase.js';
import { IcSpark, IcSearch, IcBox, IcClock, IcAlert, IcDown, IcCheck, IcRefresh } from '../lib/icons.jsx';
import { Sel, DateBox } from '../lib/ui.jsx';
import { useApp } from '../App.jsx';

// ===== Màn ĐỀ NGHỊ HÀNG HÓA (10 mục hoàn thiện) =====
// 4 nhóm: BH-chính / BH-sale / NV-chính / NV-sale (mục 4), mỗi nhóm 1 kho tổng (mục 5).
// Auto-save nháp vào localStorage theo cửa hàng (mục 6). Xuất 1 nhóm hoặc cả 4 file (mục 7).

const NHOM = [
  { id: 'BH_C', ten: 'Bảo hiểm — chính', nhom: 'BH', sale: false },
  { id: 'BH_S', ten: 'Bảo hiểm — sale',  nhom: 'BH', sale: true  },
  { id: 'NV_C', ten: 'Nón vải — chính',  nhom: 'NV', sale: false },
  { id: 'NV_S', ten: 'Nón vải — sale',   nhom: 'NV', sale: true  },
];
const nhomCua = (r) => (r.nhom_hang === 'BH' ? 'BH' : 'NV') + '_' + (r.la_hang_sale ? 'S' : 'C');
const KEY = (ma) => 'nsflow_draft_' + ma;

// Ô chọn cửa hàng: gõ trực tiếp để lọc; dropdown render FIXED nên không bị đè/cắt (lỗi 1)
function ChonCH({ ds, value, onChange }) {
  const [mo, setMo] = useState(false);
  const [q, setQ] = useState('');
  const [pos, setPos] = useState(null);
  const wrapRef = useRef(null);
  useEffect(() => {
    const h = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setMo(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  const dinhVi = () => {
    if (!wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    setPos({ left: r.left, top: r.bottom + 6, width: r.width });
  };
  const batMo = () => { dinhVi(); setMo(true); setQ(''); };
  const chon = ds.find((c) => c.ma_ch === value);
  const text = mo ? q : (chon ? `${chon.ten} (${chon.ma_ch})` : '');
  const loc = (mo && q)
    ? ds.filter((c) => (c.ten + ' ' + c.ma_ch).toLowerCase().includes(q.toLowerCase())).slice(0, 60)
    : ds.slice(0, 60);
  return (
    <div ref={wrapRef} style={{ position: 'relative', minWidth: 280 }}>
      <div style={{ position: 'relative' }}>
        <IcSearch style={{ position: 'absolute', left: 12, top: 11, opacity: .45, pointerEvents: 'none' }} />
        <input className="ch-input" placeholder="Gõ tên hoặc mã cửa hàng…"
          value={text} onFocus={batMo}
          onChange={(e) => { if (!mo) dinhVi(); setMo(true); setQ(e.target.value); }} />
      </div>
      {mo && pos && (
        <div className="ch-pop-fixed" style={{ left: pos.left, top: pos.top, width: pos.width }}>
          {loc.map((c) => (
            <button key={c.ma_ch} className={'ch-item' + (c.ma_ch === value ? ' on' : '')}
              onMouseDown={() => { onChange(c.ma_ch); setMo(false); setQ(''); }}>
              <div>{c.ten}</div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--ink-2)' }}>{c.ma_ch}</div>
            </button>
          ))}
          {!loc.length && <div style={{ padding: 14, color: 'var(--ink-2)', fontSize: 13 }}>Không tìm thấy cửa hàng</div>}
        </div>
      )}
    </div>
  );
}

// Màn AI: danh sách trượt lên LIÊN TỤC bằng CSS animation (mượt, không giật DOM)
const AI_LOG = [
  'Kết nối kho dữ liệu chiahang',
  'Đọc lịch sử bán ròng theo từng ngày',
  'Gom giao dịch theo mã vạch, loại nhiễu',
  'Ước lượng tốc độ bán từng mã',
  'Làm mượt theo nhóm ngành cấp 3',
  'Phát hiện ngày hết hàng giữa kỳ',
  'Đối chiếu tồn cửa hàng hiện tại',
  'Đọc tồn 4 kho tổng',
  'Trừ lượng hàng đang được giữ chỗ',
  'Phân loại chính / sale theo danh mục',
  'Tính mức tồn mục tiêu theo số ngày cần',
  'Đối chiếu định mức min–max từng ngành',
  'Phát hiện mã bán hết chưa được cấp',
  'Xếp ưu tiên: sắp hết + bán nhanh lên đầu',
  'Chia 4 nhóm bảo hiểm / nón vải',
  'Soát vượt kho tổng, hoàn thiện bảng',
];
function AiSteps() {
  const trackRef = useRef(null);
  const list = [...AI_LOG, ...AI_LOG];
  useEffect(() => {
    let y = 0, raf;
    const track = trackRef.current;
    if (!track) return;
    const H = track.scrollHeight / 2;   // chiều cao 1 vòng
    const box = track.parentElement.getBoundingClientRect();
    const tam = box.top + box.height / 2;
    const tick = () => {
      y = (y + 0.32) % H;               // tốc độ cuộn mượt
      track.style.transform = `translateY(${-y}px)`;
      // dòng nào gần tâm -> to + sáng, xa -> nhỏ + mờ
      for (const line of track.children) {
        const r = line.getBoundingClientRect();
        const d = Math.abs(r.top + r.height / 2 - tam);
        const g = Math.max(0, 1 - d / 78);          // 1 ở tâm -> 0 ở xa
        line.style.transform = `scale(${0.82 + g * 0.42})`;
        line.style.opacity = `${0.32 + g * 0.68}`;
        line.style.color = g > 0.72 ? '#EAF9F5' : 'rgba(200,226,221,.6)';
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="ai-log">
      <div className="ai-track" ref={trackRef}>
        {list.map((t, k) => (
          <div key={k} className="ai-line">
            <span className="ai-line-ic">✓</span>{t}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function XinHang() {
  const { user, baoToast } = useApp();
  const [dsCH, setDsCH] = useState([]);
  const [maCH, setMaCH] = useState(user.ma_ch || '');
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [nhomXem, setNhomXem] = useState('BH_C');   // tab nhóm hiện tại | 'ALL'
  const [loai, setLoai] = useState('DINH_KY');
  const [lyDoKhan, setLyDoKhan] = useState('');
  const [lich, setLich] = useState(null);
  const [tuNgay, setTuNgay] = useState('');          // mốc thời gian từ (mục 9)
  const [denNgay, setDenNgay] = useState('');        // mốc thời gian đến (mục 3)
  const [soNgayCan, setSoNgayCan] = useState('');    // tính đủ hàng cho N ngày (mặc định theo nhóm)
  const [gioiHan, setGioiHan] = useState(200);
  const [xemAnh, setXemAnh] = useState(null);
  const [hoverAnh, setHoverAnh] = useState(null);   // {url, x, y} hover phóng gấp 4
  const [giuInfo, setGiuInfo] = useState(null);     // {het_han, phut} — đang giữ hàng
  const [sortBy, setSortBy] = useState(null);        // {col, dir} — sort cột (mục 7)
  const doiSort = (col) => setSortBy((s) =>
    s && s.col === col ? (s.dir === 'asc' ? { col, dir: 'desc' } : null) : { col, dir: 'asc' });
  const luuTimer = useRef(null);

  useEffect(() => {
    if (user.vai_tro !== 'CH') {
      sb.from('cua_hang').select('ma_ch, ten').like('ma_ch', 'CH%')
        .eq('hoat_dong', true).order('ten').then(({ data }) => setDsCH(data || []));
    }
  }, []);

  // Thông tin nhóm cửa hàng để biết chu kỳ (không cần lịch cụ thể) - lỗi 13
  useEffect(() => {
    if (!maCH) { setLich(null); setRows(null); return; }
    (async () => {
      const { data: ch } = await sb.from('cua_hang')
        .select('nhom_ch, chu_ky_ngay, ten').eq('ma_ch', maCH).single();
      setLich(ch || null);
      if (ch) setSoNgayCan(String(ch.chu_ky_ngay || (ch.nhom_ch === 1 ? 4 : ch.nhom_ch === 3 ? 11 : 7)));
      try {
        const raw = localStorage.getItem(KEY(maCH));
        if (raw) { const d = JSON.parse(raw); setRows(d.rows); setTuNgay(d.tuNgay || ''); baoToast('Đã khôi phục bản nháp đang làm dở'); }
        else setRows(null);
      } catch { setRows(null); }
    })();
  }, [maCH]);

  // Auto-save mỗi khi rows đổi (mục 6) — chống mất khi lỡ tắt
  useEffect(() => {
    if (!maCH || !rows) return;
    clearTimeout(luuTimer.current);
    luuTimer.current = setTimeout(() => {
      try { localStorage.setItem(KEY(maCH), JSON.stringify({ rows, tuNgay, luc: Date.now() })); } catch {}
    }, 600);
  }, [rows, tuNgay, maCH]);


  const goiY = async () => {
    if (!maCH) { baoToast('Chọn cửa hàng trước'); return; }
    setBusy(true);
    const args = { p_ma_ch: maCH };
    if (tuNgay) args.p_tu_ngay = tuNgay;
    if (denNgay) args.p_den_ngay = denNgay;
    if (soNgayCan) args.p_so_ngay_can = parseInt(soNgayCan);
    // Chạy engine + hiệu ứng song song, chờ CẢ HAI (hiệu ứng tối thiểu 3.8s để không qua loa)
    const toiThieu = new Promise((res) => setTimeout(res, 3800));
    const [{ data, error }] = await Promise.all([
      sb.rpc('fn_goi_y_chia_hang', args), toiThieu,
    ]);
    setBusy(false);
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    setRows((data || []).map((r) => ({ ...r, sl_xin: r.sl_ai })));
  };

  // Số lượng theo từng nhóm để hiện badge trên tab
  const demNhom = useMemo(() => {
    const d = { BH_C: 0, BH_S: 0, NV_C: 0, NV_S: 0 };
    (rows || []).forEach((r) => { if (r.sl_xin > 0) d[nhomCua(r)] += r.sl_xin; });
    return d;
  }, [rows]);

  const hienAll = useMemo(() => {
    if (!rows) return [];
    let v = nhomXem === 'ALL' ? rows : rows.filter((r) => nhomCua(r) === nhomXem);
    if (q) {
      const k = q.toUpperCase();
      v = v.filter((r) => [r.barcode, r.sku, r.ma_tham_chieu].some((x) => (x || '').toUpperCase().includes(k)));
    }
    if (sortBy) {
      const get = {
        sp: (r) => r.ma_tham_chieu || r.sku || '',
        gia: (r) => r.la_hang_sale ? r.gia_sale : r.gia_niem_yet,
        ton: (r) => r.ton_truoc, kho: (r) => r.kho_tong ?? 0,
        ban: (r) => r.sl_ban_ky ?? 0, ai: (r) => r.sl_ai,
        sl: (r) => r.sl_xin, tong: (r) => (r.ton_truoc ?? 0) + (r.sl_xin || 0),
        ngay: (r) => (r.toc_do > 0) ? (((r.ton_truoc ?? 0) + (r.sl_xin || 0)) / r.toc_do) : 1e9,
      }[sortBy.col];
      v = [...v].sort((a, b) => {
        const x = get(a), y = get(b);
        const c = typeof x === 'string' ? x.localeCompare(y) : x - y;
        return sortBy.dir === 'asc' ? c : -c;
      });
    }
    return v;
  }, [rows, nhomXem, q, sortBy]);
  const hien = useMemo(() => hienAll.slice(0, gioiHan), [hienAll, gioiHan]);
  useEffect(() => { setGioiHan(200); }, [nhomXem, q]);

  const tongXin = useMemo(() => (rows || []).reduce((s, r) => s + (r.sl_xin || 0), 0), [rows]);
  const boSot = useMemo(() => (rows || []).filter((r) =>
    r.sl_ai > 0 && (r.sl_xin || 0) === 0 && r.toc_do >= 0.5 && r.ton_truoc <= 2), [rows]);

  const sua = (barcode, val) => setRows((rs) => rs.map((r) =>
    r.barcode === barcode ? { ...r, sl_xin: Math.max(0, parseInt(val) || 0) } : r));
  // cuộn tới dòng đầu của một nhóm; nếu nhóm nằm ngoài phần đang hiển thị thì nới hết trước
  const cuonToi = (bac) => {
    // kiểm tra nhóm có tồn tại trong dữ liệu đang lọc không
    const coTrongDs = hienAll.some((r) => {
      const b = r.nguon === 'KHO' ? 'nguon-kho' : r.sl_ai > 0 ? 'can-chia' : 'thuong';
      return b === bac;
    });
    if (!coTrongDs) { baoToast('Nhóm này chưa có mã nào ở tab hiện tại'); return; }
    setGioiHan(hienAll.length);   // nới hết để dòng đầu nhóm chắc chắn được render
    setTimeout(() => {
      const el = document.getElementById('grp-' + bac);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  };

  // Xuất Excel 1 nhóm (mục 7)
  const xuatNhom = async (nhomId) => {
    const XLSX = await import('xlsx');
    const info = NHOM.find((n) => n.id === nhomId);
    const dsN = rows.filter((r) => nhomCua(r) === nhomId && r.sl_xin > 0);
    if (!dsN.length) { baoToast(`Nhóm ${info.ten} chưa có dòng nào`); return; }
    const khoMa = dsN[0].kho_ma || nhomId;
    const rowsX = dsN.map((r) => ({
      'Mã kho': khoMa, 'Barcode': r.barcode, 'Mã tham chiếu': r.ma_tham_chieu || '',
      'Sản phẩm': r.nganh_3 || '', 'Số lượng': r.sl_xin,
    }));
    const ws = XLSX.utils.json_to_sheet(rowsX);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, khoMa);
    XLSX.writeFile(wb, `DENGHI_${maCH}_${khoMa}.xlsx`);
    // GIỮ HÀNG: xuất = giữ chỗ trong DB, người khác thấy kho khả dụng đã trừ
    try {
      const { data: kq } = await sb.rpc('fn_giu_hang', {
        p_token: user.token, p_ma_ch: maCH, p_kho_ma: khoMa,
        p_lines: dsN.map((r) => ({ barcode: r.barcode, so_luong: r.sl_xin })),
      });
      if (kq?.het_han) {
        const gio = new Date(kq.het_han).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        setGiuInfo({ het_han: kq.het_han, phut: kq.phut });
        baoToast(`Đã xuất ${dsN.length} dòng — GIỮ HÀNG đến ${gio} (${kq.phut} phút)`);
      } else baoToast(`Đã xuất ${dsN.length} dòng — kho ${khoMa}`);
    } catch { baoToast(`Đã xuất ${dsN.length} dòng — kho ${khoMa}`); }
  };
  const xuatTatCa = async () => {
    const conNhom = NHOM.filter((n) => demNhom[n.id] > 0);
    if (!conNhom.length) { baoToast('Chưa có số lượng nào để xuất'); return; }
    for (const n of conNhom) await xuatNhom(n.id);
  };
  const giaiPhong = async () => {
    const { data, error } = await sb.rpc('fn_giai_phong', { p_token: user.token, p_ma_ch: maCH });
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    setGiuInfo(null);
    baoToast(`Đã giải phóng ${data} mã đang giữ — tồn khả dụng trả lại cho mọi người`);
  };

  const sortIc = (col) => sortBy?.col === col
    ? <span className="sort-ar">{sortBy.dir === 'asc' ? ' ↑' : ' ↓'}</span> : <span className="sort-ar dim"> ↕</span>;

  return (
    <>
      <div className="cmdbar">
        <h1>Đề nghị hàng hóa</h1>
        <div className="sub">
          Cửa hàng chủ động lập phiếu — chọn cửa hàng để xem đề xuất.
          {lich?.nhom_ch && <span className="tag-nhom">Nhóm {lich.nhom_ch} · chu kỳ {lich.chu_ky_ngay || (lich.nhom_ch === 1 ? 4 : lich.nhom_ch === 3 ? 11 : 7)} ngày/lần</span>}
        </div>
        <div className="row">
          {user.vai_tro !== 'CH'
            ? <ChonCH ds={dsCH} value={maCH} onChange={(v) => setMaCH(v)} />
            : null}
          <Sel value={loai} onChange={setLoai} options={[
            { value: 'DINH_KY', label: 'Định kỳ' },
            { value: 'KHAN_CAP', label: 'Khẩn cấp' },
          ]} />
          <DateBox label="Từ" value={tuNgay} onChange={setTuNgay} />
          <DateBox label="Đến" value={denNgay} onChange={setDenNgay} />
          <label className="songay-box" title="Số ngày cần đủ hàng — mặc định theo nhóm, sửa khi có lễ/chương trình">
            <input type="number" min="1" max="90" value={soNgayCan}
              onChange={(e) => setSoNgayCan(e.target.value)} />
            <span>ngày</span>
          </label>
          <button className={'btn btn-ai' + (busy ? ' dang-chay' : '')} onClick={goiY} disabled={busy || !maCH}>
            <IcSpark /> {busy ? 'Đang phân tích…' : 'AI gợi ý đề nghị'}
          </button>
          {rows && <span className="sla-chip">{tongXin} sp · {rows.filter((r) => r.sl_xin > 0).length} mã</span>}
        </div>
        {loai === 'KHAN_CAP' && (
          <div className="row">
            <input value={lyDoKhan} onChange={(e) => setLyDoKhan(e.target.value)}
              placeholder="Lý do khẩn cấp (bắt buộc): bán đột biến / sắp hết mã chạy / chương trình…"
              style={{ padding: '9px 12px', borderRadius: 10, border: 0, flex: 1, minWidth: 260 }} />
          </div>
        )}
      </div>

      {rows && boSot.length > 0 && (
        <div className="card" style={{ marginBottom: 12, borderLeft: '4px solid var(--magenta)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--magenta)', fontWeight: 700, fontSize: 13.5 }}>
            <IcAlert /> {boSot.length} mã bán nhanh sắp hết nhưng chưa được đề xuất bổ sung
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-2)', margin: '4px 0 6px' }}>
            Trưởng ca chịu trách nhiệm nếu để hàng bán chạy bị thiếu. Kiểm tra lại trước khi gửi.
          </div>
        </div>
      )}

      {rows && !busy && (
        <>
          {/* Tab 4 nhóm + Tất cả (mục 4,6) */}
          <div className="nhom-tabs">
            {NHOM.map((n) => (
              <button key={n.id} className={'nhom-tab' + (nhomXem === n.id ? ' on' : '')}
                onClick={() => setNhomXem(n.id)}>
                {n.ten}
                {demNhom[n.id] > 0 && <span className="nhom-badge">{demNhom[n.id]}</span>}
              </button>
            ))}
            <button className={'nhom-tab' + (nhomXem === 'ALL' ? ' on' : '')} onClick={() => setNhomXem('ALL')}>
              Xem tất cả
            </button>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              {nhomXem !== 'ALL' &&
                <button className="btn btn-ghost btn-h" onClick={() => xuatNhom(nhomXem)}><IcDown /> Xuất nhóm này</button>}
              <button className="btn btn-gold btn-h" onClick={xuatTatCa}><IcDown /> Xuất tất cả (4 file)</button>
            </div>
          </div>

          <div className="toolbar">
            <div style={{ position: 'relative' }}>
              <input type="search" placeholder="Tìm barcode / SKU / mã cũ" value={q}
                onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 34, width: 220 }} />
              <span style={{ position: 'absolute', left: 10, top: 10, color: 'var(--ink-2)' }}><IcSearch /></span>
            </div>
            <button className="btn btn-ghost" onClick={() => { setSortBy(null); baoToast('Đã xếp lại theo thứ tự ưu tiên mặc định'); }}
              disabled={!sortBy} title="Quay lại thứ tự ưu tiên ban đầu (cần cấp → đang bán → hàng chậm → kho tổng)">
              <IcRefresh /> Xếp mặc định</button>
            <button className="btn btn-ghost" onClick={() => {
              if (window.confirm('Xóa toàn bộ số lượng đề nghị và bản nháp — quay lại màn chọn cửa hàng?')) {
                localStorage.removeItem(KEY(maCH));
                setRows(null); setSortBy(null); setQ(''); setNhomXem('BH_C'); setGiuInfo(null);
                baoToast('Đã xóa toàn bộ — bấm AI để làm lại');
              }
            }}>Xóa toàn bộ</button>
            {giuInfo && (
              <span className="chip gold" title="Hàng đã giữ chỗ khi xuất file — người khác thấy kho khả dụng đã trừ">
                Đang giữ đến {new Date(giuInfo.het_han).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                <button onClick={giaiPhong} style={{ marginLeft: 8, border: 0, background: 'transparent',
                  color: 'var(--magenta)', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>Giải phóng</button>
              </span>
            )}
            <div className="legend" style={{ marginLeft: 'auto', padding: 0 }}>
              <button className="lg-btn" onClick={() => cuonToi('can-chia')}>
                <i className="lg-can" /> Cần bổ sung</button>
              <button className="lg-btn" onClick={() => cuonToi('thuong')}>
                <i className="lg-thuong" /> Đang bán, còn đủ</button>
              <button className="lg-btn" onClick={() => cuonToi('nguon-kho')}>
                <i className="lg-kho" /> Kho tổng còn</button>
            </div>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr>
                <th className="sortable" onClick={() => doiSort('sp')}>Sản phẩm{sortIc('sp')}</th>
                <th className="sortable" onClick={() => doiSort('gia')}>Giá{sortIc('gia')}</th>
                <th className="num sortable" onClick={() => doiSort('ton')}>Tồn CH{sortIc('ton')}</th>
                <th className="num sortable" onClick={() => doiSort('kho')}>Kho tổng{sortIc('kho')}</th>
                <th className="num sortable" onClick={() => doiSort('ban')}>SL bán{sortIc('ban')}</th>
                <th className="num sortable" onClick={() => doiSort('ai')}>AI đề xuất{sortIc('ai')}</th>
                <th className="num sortable" onClick={() => doiSort('sl')}>SL đề nghị{sortIc('sl')}</th>
                <th className="num sortable" onClick={() => doiSort('tong')}>Tổng tồn{sortIc('tong')}</th>
                <th className="num sortable" onClick={() => doiSort('ngay')}>Số ngày bán{sortIc('ngay')}</th>
              </tr></thead>
              <tbody>
                {hien.map((r, idx) => {
                  const vuot = r.ton_du_tinh + r.sl_xin > r.muc_max;
                  const vuotKho = r.sl_xin > (r.kho_tong ?? 0);
                  // Phân bậc thị giác: 'can-chia' = AI đề xuất > 0 (việc cần làm),
                  // 'thuong' = đang bán còn đủ/hàng chậm, 'nguon-kho' = gợi ý xin thêm
                  const bac = r.nguon === 'KHO' ? 'nguon-kho'
                    : r.sl_ai > 0 ? 'can-chia' : 'thuong';
                  // dòng ĐẦU mỗi nhóm -> gắn id để chú giải cuộn tới
                  const bacTruoc = idx > 0
                    ? (hien[idx - 1].nguon === 'KHO' ? 'nguon-kho'
                       : hien[idx - 1].sl_ai > 0 ? 'can-chia' : 'thuong') : null;
                  const dauNhom = bac !== bacTruoc;
                  return (
                    <tr key={r.barcode} className={'row-' + bac}
                      id={dauNhom ? 'grp-' + bac : undefined}>
                      <td>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          {r.hinh_url
                            ? <img className="sp" src={r.hinh_url} alt="" loading="lazy"
                                onClick={() => setXemAnh(r.hinh_url)}
                                onMouseEnter={(e) => { const b = e.target.getBoundingClientRect();
                                  setHoverAnh({ url: r.hinh_url, x: b.right + 12, y: Math.max(8, b.top - 70) }); }}
                                onMouseLeave={() => setHoverAnh(null)} />
                            : <div className="noimg"><IcBox /></div>}
                          <div>
                            <div className="mono" style={{ fontWeight: 600 }}>{r.ma_tham_chieu || r.sku}</div>
                            <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>{r.nganh_3}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        {r.la_hang_sale && r.gia_sale > 0
                          ? <><span className="price-sale">{fmtVND(r.gia_sale)}</span>
                              <span className="price-old">{fmtVND(r.gia_niem_yet)}</span></>
                          : <span style={{ fontWeight: 600 }}>{fmtVND(r.gia_niem_yet)}</span>}
                      </td>
                      <td className="num">{r.ton_truoc}</td>
                      <td className="num" style={r.kho_tong <= 0
                        ? { color: 'var(--magenta)', fontWeight: 700 }
                        : { color: 'var(--teal-deep)', fontWeight: 600 }}>
                        {r.kho_tong}
                        {r.dang_giu > 0 && <div style={{ fontSize: 10, color: 'var(--gold)', fontWeight: 700 }}>giữ {r.dang_giu}</div>}
                      </td>
                      <td className="num" style={{ fontWeight: 600 }}>{r.sl_ban_ky ?? 0}</td>
                      <td className="num" style={{ fontWeight: 700, color: 'var(--teal-deep)' }}>{r.sl_ai}</td>
                      <td className="num">
                        <input className={'qty-input' + (vuot || vuotKho ? ' over' : '')} type="number" min="0"
                          data-qty={idx}
                          value={r.sl_xin} onChange={(e) => sua(r.barcode, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const next = document.querySelector(`input[data-qty="${idx + 1}"]`);
                              if (next) { next.focus(); next.select(); }
                              else e.target.blur();
                            }
                          }} />
                        {vuotKho && <div style={{ fontSize: 10, color: 'var(--magenta)', marginTop: 2 }}>Vượt kho tổng {r.kho_tong}</div>}
                      </td>
                      <td className="num" style={{ fontWeight: 600 }}>{(r.ton_truoc ?? 0) + (r.sl_xin || 0)}</td>
                      <td className="num">
                        {r.toc_do > 0
                          ? <b style={{ color: 'var(--ink)' }}>{Math.round(((r.ton_truoc ?? 0) + (r.sl_xin || 0)) / r.toc_do)}d</b>
                          : <span style={{ color: 'var(--ink-2)' }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!hien.length && <div className="empty">
              <div className="t">Nhóm này chưa có mã nào</div>
              Chuyển tab nhóm khác hoặc "Xem tất cả".
            </div>}
            {hienAll.length > gioiHan && (
              <div style={{ textAlign: 'center', padding: 12 }}>
                <button className="btn btn-ghost" onClick={() => setGioiHan((g) => g + 200)}>
                  Hiện thêm ({hienAll.length - gioiHan} mã còn lại — gồm tồn kho tổng xếp từ nhiều đến ít)
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {busy && (
        <div className="card ai-stage">
          <div className="ai-grid" />
          <div className="ai-core">
            <span className="ai-ring r1" /><span className="ai-ring r2" /><span className="ai-ring r3" />
            <span className="ai-nucleus" />
            <span className="ai-scan" />
          </div>
          <div className="ai-title">AI đang phân tích dữ liệu bán</div>
          <AiSteps />
        </div>
      )}

      {!rows && !busy && (
        <div className="empty card">
          <div className="t">Bấm "AI gợi ý đề nghị" để bắt đầu</div>
          Hệ thống phân tích bán ròng, tồn cửa hàng, tồn kho tổng, định mức và kỳ đề nghị kế tiếp,
          rồi đề xuất số lượng kèm lý do — chia sẵn 4 nhóm bảo hiểm/nón vải, chính/sale.
        </div>
      )}

      {hoverAnh && (
        <img className="sp-zoom" src={hoverAnh.url} alt=""
          style={{ left: Math.min(hoverAnh.x, window.innerWidth - 210), top: hoverAnh.y }} />
      )}
      {xemAnh && (
        <div className="img-lightbox" onClick={() => setXemAnh(null)}>
          <img src={xemAnh} alt="Ảnh sản phẩm" />
        </div>
      )}
    </>
  );
}
