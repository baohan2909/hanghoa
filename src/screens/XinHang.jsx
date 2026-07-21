import { useEffect, useMemo, useRef, useState } from 'react';
import { sb, fmtVND, LY_DO } from '../lib/supabase.js';
import { IcSpark, IcSearch, IcBox, IcClock, IcAlert, IcDown, IcCheck, IcRefresh } from '../lib/icons.jsx';
import { Sel, DateBox, isoVN } from '../lib/ui.jsx';
import { useApp } from '../App.jsx';

// ===== Màn ĐỀ NGHỊ HÀNG HÓA (10 mục hoàn thiện) =====
// 4 nhóm: BH-chính / BH-sale / NV-chính / NV-sale (mục 4), mỗi nhóm 1 kho tổng (mục 5).
// Auto-save nháp vào localStorage theo cửa hàng (mục 6). Xuất 1 nhóm hoặc cả 4 file (mục 7).

const NHOM = [
  { id: 'BH_C', ten: 'Bảo hiểm — chính', nhom: 'BH', sale: false },
  { id: 'BH_S', ten: 'Bảo hiểm — sale',  nhom: 'BH', sale: true  },
  { id: 'NV_C', ten: 'Nón vải — chính',  nhom: 'NV', sale: false },
  { id: 'NV_S', ten: 'Nón vải — sale',   nhom: 'NV', sale: true  },
  { id: 'PK',   ten: 'Phụ kiện',         nhom: 'PK', sale: false },
];
const nhomCua = (r) => r.nhom_hang === 'PK' ? 'PK' : (r.nhom_hang === 'BH' ? 'BH' : 'NV') + '_' + (r.la_hang_sale ? 'S' : 'C');
// Nhãn ngắn cho badge nhóm (hiện khi đang tìm)
const TEN_NHOM = { BH_C: 'BH chính', BH_S: 'BH sale', NV_C: 'NV chính', NV_S: 'NV sale', PK: 'Phụ kiện' };
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

// Thẻ định mức ngành: tồn hiện tại + min-max, thanh đo trực quan (bản redesign)
function ThanhDinhMuc({ ten, d }) {
  const { ton, min, max, xin } = d;
  const sau = ton + xin;
  const coDinhMuc = max > 0;
  const thangMax = coDinhMuc ? max * 1.15 : Math.max(ton, sau, 10);
  const pct = (v) => Math.min(100, Math.max(0, (v / thangMax) * 100));
  const pMin = coDinhMuc ? pct(min) : 0;
  const pMax = coDinhMuc ? pct(max) : 0;
  const tt = !coDinhMuc ? 'none'
    : sau < min ? 'thieu' : sau > max ? 'du' : 'ok';
  const mau = { thieu: '#FF6FA5', ok: '#4ED3C2', du: '#E8C377', none: 'rgba(255,255,255,.5)' }[tt];
  const mauBadge = { thieu: '#D6006C', ok: '#1E5F63', du: '#9A7B2E', none: 'transparent' }[tt];
  const nhan = { thieu: 'Dưới định mức', ok: 'Trong định mức', du: 'Vượt định mức', none: '' }[tt];
  return (
    <div className="dm-card">
      <div className="dm-head">
        <span className="dm-ten">{ten}</span>
        {coDinhMuc && <span className="dm-badge2" style={{ background: mauBadge }}>{nhan}</span>}
        <span className="dm-range">{coDinhMuc ? `${min}–${max}` : 'Chưa đặt định mức'}</span>
      </div>
      <div className="dm-body">
        <div className="dm-so">
          <b style={{ color: mau }}>{sau}</b>
          {xin > 0 && <span className="dm-delta">{ton}+{xin}</span>}
        </div>
        {coDinhMuc && (
          <div className="dm-bar">
            <div className="dm-zone" style={{ left: pMin + '%', width: (pMax - pMin) + '%' }} />
            <div className="dm-tick" style={{ left: pMin + '%' }} />
            <div className="dm-tick" style={{ left: pMax + '%' }} />
            <div className="dm-cursor" style={{ left: pct(sau) + '%', background: mau }} />
          </div>
        )}
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
  const homQua = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return isoVN(d); })();
  const [denNgay, setDenNgay] = useState(homQua);    // Ngày đến — mặc định HÔM QUA
  const [soNgayCan, setSoNgayCan] = useState('');    // tính đủ hàng cho N ngày (mặc định theo nhóm)
  const [gioiHan, setGioiHan] = useState(200);
  const [xemAnh, setXemAnh] = useState(null);
  const [hoverAnh, setHoverAnh] = useState(null);   // {url, x, y} hover phóng gấp 4
  const [giuInfo, setGiuInfo] = useState(null);     // {het_han, phut} — đang giữ hàng
  const [lichCH, setLichCH] = useState(null);       // lịch đề nghị của CH (banner nhắc)
  const [sortBy, setSortBy] = useState(null);        // {col, dir} — sort cột (mục 7)
  const [flt, setFlt] = useState({});                // filter gõ theo từng cột
  const datFlt = (col, val) => setFlt((f) => ({ ...f, [col]: val }));
  const coFlt = Object.values(flt).some((x) => (x || '').trim() !== '');
  const doiSort = (col) => setSortBy((s) =>
    s && s.col === col ? (s.dir === 'asc' ? { col, dir: 'desc' } : null) : { col, dir: 'asc' });
  const luuTimer = useRef(null);
  const napDraft = useRef(null);   // số đã nhập từ nháp, áp sau khi engine trả rows
  const [ycdp, setYcdp] = useState({});      // barcode -> {so_luong} các mã ĐANG xin điều phối
  const [slXin, setSlXin] = useState({});    // barcode -> số lượng đang gõ (chưa gửi)

  // Nạp các mã cửa hàng đang xin điều phối (để hiện nút "✓ Đã gửi")
  const taiYcdp = async (ch) => {
    if (!ch) return;
    const { data } = await sb.rpc('fn_ycdp_cua_ch', { p_ma_ch: ch });
    setYcdp(Object.fromEntries((data || []).map((x) => [x.barcode, { so_luong: x.so_luong }])));
  };
  const guiYcdp = async (r) => {
    const sl = parseInt(slXin[r.barcode]) || ycdp[r.barcode]?.so_luong || 1;
    const { data, error } = await sb.rpc('fn_ycdp_gui', {
      p_ma_ch: maCH, p_barcode: r.barcode, p_so_luong: sl,
      p_ma_tham_chieu: r.ma_tham_chieu || null, p_ten_sp: r.ten || null, p_nganh_1: r.nhom_hang || null });
    if (error) { baoToast('Lỗi gửi yêu cầu: ' + error.message); return; }
    setYcdp((m) => ({ ...m, [r.barcode]: { so_luong: sl } }));
    baoToast('Đã gửi yêu cầu điều phối: ' + (r.ma_tham_chieu || r.barcode) + ' × ' + sl);
  };
  const huyYcdp = async (r) => {
    await sb.rpc('fn_ycdp_huy', { p_ma_ch: maCH, p_barcode: r.barcode });
    setYcdp((m) => { const n = { ...m }; delete n[r.barcode]; return n; });
    baoToast('Đã hủy yêu cầu');
  };

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
      if (ch) {
        const sn = ch.chu_ky_ngay || (ch.nhom_ch === 1 ? 4 : ch.nhom_ch === 3 ? 11 : 7);
        setSoNgayCan(String(sn));
        // "Ngày từ" = "Ngày đến" lùi (số ngày nhóm − 1) -> trọn đúng N ngày kể cả 2 đầu
        const dDen = new Date(denNgay + 'T00:00:00');
        const tu = new Date(dDen); tu.setDate(dDen.getDate() - (sn - 1));
        setTuNgay(isoVN(tu));
      }
      // KHÔNG khôi phục rows từ nháp (rows cũ có thể lỗi thời khi kho đổi).
      // Chỉ nhớ số lượng đã nhập -> áp lại sau khi engine trả kết quả mới.
      try {
        const raw = localStorage.getItem(KEY(maCH));
        if (raw) { const d = JSON.parse(raw);
          napDraft.current = d.daNhap || null;
          // KHÔNG khôi phục tuNgay từ nháp — luôn tính mới theo nhóm (tránh giữ ngày cũ sai)
        } else napDraft.current = null;
      } catch { napDraft.current = null; }
      setRows(null);
    })();
  }, [maCH]);

  // Lịch đề nghị của cửa hàng (banner nhắc + lịch sắp tới 14 ngày)
  const [dckCH, setDckCH] = useState(null);   // trạng thái điều chuyển thật (mã DK) theo ngày
  useEffect(() => {
    if (!maCH) { setLichCH(null); setDckCH(null); return; }
    (async () => {
      const homNay = isoVN();
      const den14 = isoVN(new Date(Date.now() + 14 * 864e5));
      const tu14 = isoVN(new Date(Date.now() - 14 * 864e5));
      const { data } = await sb.rpc('fn_lich_cua_ch', { p_ma_ch: maCH, p_tu: homNay, p_den: den14 });
      setLichCH(data || []);
      // trạng thái điều chuyển THẬT từ Odoo (app chỉ đọc) — 14 ngày gần
      const { data: dck } = await sb.rpc('fn_dck_theo_ch', { p_ma_ch: maCH, p_tu: tu14, p_den: den14 });
      const m = {}; (dck || []).forEach((x) => { m[x.ngay_tao] = x; });
      setDckCH(m);
      taiYcdp(maCH);   // nạp mã đang xin điều phối
    })();
  }, [maCH]);

  // Auto-save mỗi khi rows đổi — CHỈ lưu số đã nhập (không lưu rows, tránh lỗi thời)
  useEffect(() => {
    if (!maCH || !rows) return;
    clearTimeout(luuTimer.current);
    luuTimer.current = setTimeout(() => {
      const daNhap = {};
      rows.forEach((r) => { if (r.sl_xin && r.sl_xin !== r.sl_ai) daNhap[r.barcode] = r.sl_xin; });
      try { localStorage.setItem(KEY(maCH), JSON.stringify({ daNhap, tuNgay, luc: Date.now() })); } catch {}
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
    // PHÂN TRANG chống cắt 1000 dòng (PostgREST Max Rows): lấy từng trang tới hết
    const layHet = async () => {
      const TRANG = 1000; let tat = []; let i = 0;
      for (;;) {
        const { data: d, error: e } = await sb.rpc('fn_goi_y_chia_hang', args)
          .range(i * TRANG, (i + 1) * TRANG - 1);
        if (e) return { data: null, error: e };
        tat = tat.concat(d || []);
        if (!d || d.length < TRANG) break;   // trang cuối
        i++;
        if (i > 20) break;                    // an toàn: tối đa 20k dòng
      }
      return { data: tat, error: null };
    };
    const [{ data, error }] = await Promise.all([layHet(), toiThieu]);
    setBusy(false);
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    setRows((data || []).map((r) => ({
      ...r,
      sl_xin: (napDraft.current && napDraft.current[r.barcode] != null) ? napDraft.current[r.barcode] : r.sl_ai,
    })));
    if (napDraft.current) { baoToast('Đã khôi phục số lượng đang nhập dở'); napDraft.current = null; }
  };

  // Số lượng theo từng nhóm để hiện badge trên tab
  const demNhom = useMemo(() => {
    const d = { BH_C: 0, BH_S: 0, NV_C: 0, NV_S: 0 };
    (rows || []).forEach((r) => { if (r.sl_xin > 0) d[nhomCua(r)] += r.sl_xin; });
    return d;
  }, [rows]);

  const hienAll = useMemo(() => {
    if (!rows) return [];
    // Loại hàng "Kho hết — cần sản xuất" (tồn 0 + kho tổng 0 + có bán) KHỎI danh sách mặc định:
    // giai đoạn này không đưa vào gợi ý chia; chúng nằm ở màn Giám sát > Cần sản xuất.
    // NHƯNG khi ĐANG TÌM -> cho hiện luôn (gõ mã là ra, kèm nhãn tình trạng "cần sản xuất").
    // Mã "Kho hết — cần sản xuất" (CH hết + kho tổng hết + đã bán): KHÔNG ẩn nữa,
    // cho hiện CUỐI nhóm (sort tt=0 đẩy xuống) kèm nút "Yêu cầu điều phối" từng dòng.
    const dangTim = q.trim() !== '';
    const base = rows;
    // Khi tìm: tìm xuyên TẤT CẢ nhóm (gõ mã là ra, kể cả mã sale ở tab khác).
    // Không tìm: lọc theo nhóm tab đang xem.
    let v = (dangTim || nhomXem === 'ALL') ? base : base.filter((r) => nhomCua(r) === nhomXem);
    if (q) {
      const k = q.toUpperCase();
      v = v.filter((r) => [r.barcode, r.sku, r.ma_tham_chieu].some((x) => (x || '').toUpperCase().includes(k)));
    }
    // FILTER theo từng cột: cột số hỗ trợ "3", ">3", "<3", "3-5"; cột chữ khớp gần đúng
    const khopSo = (val, s) => {
      s = (s || '').trim(); if (!s) return true;
      let m;
      if ((m = s.match(/^>=?\s*(-?\d+)/))) return val >= +m[1];
      if ((m = s.match(/^<=?\s*(-?\d+)/))) return val <= +m[1];
      if ((m = s.match(/^(-?\d+)\s*-\s*(-?\d+)$/))) return val >= +m[1] && val <= +m[2];
      if ((m = s.match(/^=?\s*(-?\d+)$/))) return val === +m[1];
      return String(val).includes(s);
    };
    // Cột Tồn CH đặc biệt: "+" = có hàng đi đường dương, "+2" = đi đường đúng +2,
    // "-" = đi đường âm, "-3" = đúng -3. Số thường -> lọc theo tồn CH.
    const khopTon = (r, s) => {
      s = (s || '').trim(); if (!s) return true;
      const di = (r.ton_du_tinh ?? 0) - (r.ton_truoc ?? 0);
      if (s === '+') return di > 0;
      if (s === '-') return di < 0;
      let m;
      if ((m = s.match(/^\+(\d+)$/))) return di === +m[1];
      if ((m = s.match(/^-(\d+)$/))) return di === -(+m[1]);
      return khopSo(r.ton_truoc ?? 0, s);
    };
    const khopChu = (txt, s) => !s.trim() || (txt || '').toLowerCase().includes(s.trim().toLowerCase());
    const gia = (r) => r.la_hang_sale ? r.gia_sale : r.gia_niem_yet;
    const colVal = {
      sp: (r) => [r.ma_tham_chieu, r.sku, r.barcode].filter(Boolean).join(' '),
      tt: (r) => r.tinh_trang || '',
    };
    const colNum = {
      gia: (r) => gia(r) || 0, diduong: (r) => (r.ton_du_tinh ?? 0) - (r.ton_truoc ?? 0), kho: (r) => r.kho_tong ?? 0,
      ban: (r) => r.sl_ban_ky ?? 0, ai: (r) => r.sl_ai ?? 0, sl: (r) => r.sl_xin ?? 0,
      tong: (r) => (r.ton_truoc ?? 0) + (r.sl_xin || 0),
      ngay: (r) => r.toc_do > 0 ? Math.round(((r.ton_truoc ?? 0) + (r.sl_xin || 0)) / r.toc_do) : 0,
    };
    v = v.filter((r) => {
      for (const [c, val] of Object.entries(flt)) {
        if (!(val || '').trim()) continue;
        if (c === 'ton') { if (!khopTon(r, val)) return false; continue; }
        if (colVal[c] && !khopChu(colVal[c](r), val)) return false;
        if (colNum[c] && !khopSo(colNum[c](r), val)) return false;
      }
      return true;
    });
    if (sortBy) {
      const get = {
        sp: (r) => r.ma_tham_chieu || r.sku || '',
        gia: (r) => r.la_hang_sale ? r.gia_sale : r.gia_niem_yet,
        ton: (r) => r.ton_truoc, diduong: (r) => (r.ton_du_tinh ?? 0) - (r.ton_truoc ?? 0), kho: (r) => r.kho_tong ?? 0,
        ban: (r) => r.sl_ban_ky ?? 0, ai: (r) => r.sl_ai,
        sl: (r) => r.sl_xin, tong: (r) => (r.ton_truoc ?? 0) + (r.sl_xin || 0),
        ngay: (r) => (r.toc_do > 0) ? (((r.ton_truoc ?? 0) + (r.sl_xin || 0)) / r.toc_do) : 1e9,
        tt: (r) => {
          const t = r.tinh_trang || '';
          if (t.startsWith('Hết hàng') || t === 'Vừa hết hàng' || t === 'Kho hết — cần sản xuất') return 0;
          if (t === 'Đang bán tốt') return 1;
          if (t === 'Bán đều') return 2;
          if (t === 'Bán chậm') return 3;
          if (t.startsWith('Không bán')) return 4;
          return 5;
        },
      }[sortBy.col];
      v = [...v].sort((a, b) => {
        const x = get(a), y = get(b);
        const c = typeof x === 'string' ? x.localeCompare(y) : x - y;
        return sortBy.dir === 'asc' ? c : -c;
      });
    } else {
      // Thứ tự mặc định: mã "Kho hết — cần sản xuất" (chỉ yêu cầu điều phối được,
      // không đề nghị được) đẩy xuống CUỐI nhóm — engine vốn xếp hết-hàng lên ĐẦU
      // (bậc 1 khẩn cấp) nhưng nhóm này không có nguồn để chia nên nằm cuối theo ý anh.
      const laCSX = (r) => r.nguon === 'CH' && (r.ton_truoc ?? 0) === 0
        && (r.kho_tong ?? 0) <= 0 && r.tinh_trang === 'Kho hết — cần sản xuất';
      v = [...v.filter((r) => !laCSX(r)), ...v.filter(laCSX)];
    }
    return v;
  }, [rows, nhomXem, q, sortBy, flt]);
  const hien = useMemo(() => hienAll.slice(0, gioiHan), [hienAll, gioiHan]);
  useEffect(() => { setGioiHan(200); }, [nhomXem, q]);

  const tongXin = useMemo(() => (rows || []).reduce((s, r) => s + (r.sl_xin || 0), 0), [rows]);
  // Định mức tồn 2 ngành (BH / NV): tồn hiện tại toàn ngành + min-max của cửa hàng
  const dinhMuc = useMemo(() => {
    const g = { BH: { ton: 0, min: 0, max: 0, xin: 0 }, NV: { ton: 0, min: 0, max: 0, xin: 0 } };
    (rows || []).forEach((r) => {
      if (r.nguon === 'KHO') return;                 // chỉ tính hàng cửa hàng đang có
      if (r.nhom_hang === 'PK') return;              // phụ kiện không có định mức min/max
      const k = r.nhom_hang === 'BH' ? 'BH' : 'NV';
      g[k].ton += r.ton_truoc || 0;
      g[k].xin += r.sl_xin || 0;
      if (r.muc_max > 0) { g[k].min = r.muc_min || 0; g[k].max = r.muc_max || 0; }
    });
    return g;
  }, [rows]);
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
  // Mã kho đơn: {DK|KC}{yyyymmdd}-{mã kho nguồn}-{mã CH đích}-{thứ tự đơn}
  const taoMaKho = (khoMa, thuTu) => {
    const d = new Date();
    const ymd = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    const pre = loai === 'KHAN_CAP' ? 'KC' : 'DK';
    return `${pre}${ymd}-${khoMa}-${maCH}-${String(thuTu).padStart(2, '0')}`;
  };
  const xuatNhom = async (nhomId) => {
    const XLSX = await import('xlsx');
    const info = NHOM.find((n) => n.id === nhomId);
    const dsN = rows.filter((r) => nhomCua(r) === nhomId && r.sl_xin > 0);
    if (!dsN.length) { baoToast(`Nhóm ${info.ten} chưa có dòng nào`); return; }
    const khoMa = dsN[0].kho_ma || nhomId;
    const maKho = taoMaKho(khoMa, 1);   // xuất 1 nhóm = 1 đơn
    // Template điều chuyển: Kho nguồn | Kho đích | SKU/Barcode | Số lượng | Mã kho
    const rowsX = dsN.map((r) => ({
      'Kho nguồn': r.kho_ma || khoMa,
      'Kho đích': maCH,
      'SKU/ Barcode': r.sku || r.barcode,
      'Số lượng': r.sl_xin,
      'Mã kho': maKho,
    }));
    const ws = XLSX.utils.json_to_sheet(rowsX);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Trang tính1');
    XLSX.writeFile(wb, `DIEUCHUYEN_${maCH}_${khoMa}.xlsx`);
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
    const dsAll = rows.filter((r) => r.sl_xin > 0);
    if (!dsAll.length) { baoToast('Chưa có số lượng nào để xuất'); return; }
    const XLSX = await import('xlsx');
    // Mỗi KHO NGUỒN = 1 đơn -> mã kho riêng, thứ tự tăng dần theo thứ tự kho
    const khoThuTu = {}; let stt = 0;
    dsAll.forEach((r) => { const k = r.kho_ma || nhomCua(r);
      if (!(k in khoThuTu)) { stt++; khoThuTu[k] = taoMaKho(k, stt); } });
    // 1 FILE TỔNG — mỗi dòng ghi rõ Kho nguồn + Mã kho riêng
    const rowsX = dsAll.map((r) => { const k = r.kho_ma || nhomCua(r);
      return {
        'Kho nguồn': k,
        'Kho đích': maCH,
        'SKU/ Barcode': r.sku || r.barcode,
        'Số lượng': r.sl_xin,
        'Mã kho': khoThuTu[k],
      };
    });
    const ws = XLSX.utils.json_to_sheet(rowsX);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Trang tính1');
    XLSX.writeFile(wb, `DIEUCHUYEN_${maCH}.xlsx`);
    // GIỮ HÀNG theo từng kho nguồn
    const theoKho = {};
    dsAll.forEach((r) => { const k = r.kho_ma || nhomCua(r);
      (theoKho[k] = theoKho[k] || []).push({ barcode: r.barcode, so_luong: r.sl_xin }); });
    let hetHan = null, phut = 0;
    for (const [khoMa, lines] of Object.entries(theoKho)) {
      try {
        const { data: kq } = await sb.rpc('fn_giu_hang', { p_token: user.token, p_ma_ch: maCH, p_kho_ma: khoMa, p_lines: lines });
        if (kq?.het_han) { hetHan = kq.het_han; phut = kq.phut; }
      } catch { /* im lặng, đã xuất file */ }
    }
    if (hetHan) {
      const gio = new Date(hetHan).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      setGiuInfo({ het_han: hetHan, phut });
      baoToast(`Đã xuất ${dsAll.length} dòng (1 file) — GIỮ HÀNG đến ${gio}`);
    } else baoToast(`Đã xuất ${dsAll.length} dòng (1 file tổng)`);
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
          <DateBox label="Ngày từ" value={tuNgay} onChange={setTuNgay} />
          <DateBox label="Ngày đến" value={denNgay} onChange={setDenNgay} />
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
        {rows && (
          <div className="dm-row">
            <ThanhDinhMuc ten="Bảo hiểm" d={dinhMuc.BH} />
            <ThanhDinhMuc ten="Nón vải" d={dinhMuc.NV} />
          </div>
        )}
        {loai === 'KHAN_CAP' && (
          <div className="ly-do-khan" style={{ position: 'relative', zIndex: 0, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 8, marginTop: 10 }}>
            <input value={lyDoKhan} onChange={(e) => setLyDoKhan(e.target.value)}
              placeholder="Lý do khẩn cấp (bắt buộc): bán đột biến / sắp hết mã chạy / chương trình…"
              autoComplete="off" autoCorrect="off" spellCheck={false} name="lydo-kc-ns"
              style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid var(--line)', flex: 1, minWidth: 260 }} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['Bán đột biến', 'Sắp hết mã chạy', 'Chương trình khuyến mãi', 'Lễ / cao điểm', 'Khách đặt trước'].map((g) => (
                <button key={g} className="btn-mini btn-mini-teal" style={{ margin: 0 }}
                  onClick={() => setLyDoKhan(g)}>{g}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {lichCH && lichCH.length > 0 && (() => {
        const homNay = isoVN();
        const homNayLich = lichCH.find((l) => l.ngay === homNay);
        const sapToi = lichCH.filter((l) => l.ngay > homNay).slice(0, 4);
        const fmtDM2 = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
        const THU3 = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
        const thuCua = (iso) => THU3[new Date(iso + 'T00:00:00').getDay()];
        const dckHom = dckCH && dckCH[homNay];   // phiếu điều chuyển thật hôm nay (mã DK)
        // "Đã gửi" thật = đã có phiếu DK ngày đó (dù app đánh dấu hay chưa)
        const daGuiThat = !!dckHom || (homNayLich && homNayLich.da_gui);
        return (
          <div className="lich-banner-thin" style={{
            borderLeft: homNayLich && !daGuiThat ? '3px solid var(--gold)' : '3px solid var(--teal)' }}>
            {homNayLich ? (
              dckHom
                ? <span className="lbt-txt" style={{ color: 'var(--teal-deep)', fontWeight: 700 }}>✓ Hôm nay đã gửi phiếu — kho: <b>{dckHom.trang_thai_gom}</b> ({dckHom.so_phieu} phiếu)</span>
                : daGuiThat
                ? <span className="lbt-txt" style={{ color: 'var(--teal-deep)', fontWeight: 700 }}>✓ Hôm nay tới lịch — đã gửi phiếu</span>
                : <span className="lbt-txt" style={{ color: '#a8842c', fontWeight: 800 }}>📅 HÔM NAY tới lịch đề nghị — nhớ lập &amp; gửi phiếu</span>
            ) : (
              <span className="lbt-txt" style={{ color: 'var(--ink-2)' }}>📅 Lịch sắp tới:</span>
            )}
            <div className="lbt-chips">
              {sapToi.map((l) => (
                <span key={l.ngay} className={'lbt-chip' + (l.da_gui ? ' gui' : '')}>
                  {thuCua(l.ngay)} {fmtDM2(l.ngay)}{l.da_gui ? ' ✓' : ''}
                </span>
              ))}
            </div>
          </div>
        );
      })()}

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
              <button className="btn btn-gold btn-h" onClick={xuatTatCa}><IcDown /> Xuất tất cả (1 file)</button>
            </div>
          </div>

          <div className="toolbar">
            <div style={{ position: 'relative' }}>
              <input type="search" placeholder="Barcode, SKU, mã" value={q}
                onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 34, width: 220 }} />
              <span style={{ position: 'absolute', left: 10, top: 10, color: 'var(--ink-2)' }}><IcSearch /></span>
            </div>
            {q.trim() && <span className="chip" style={{ background: 'rgba(63,182,168,.14)', color: 'var(--teal-deep)' }}
              title="Khi tìm, hệ thống tìm trong TẤT CẢ nhóm (BH chính, BH sale, Nón vải, Phụ kiện) — không chỉ tab đang xem">
              🔍 tìm trong tất cả nhóm</span>}
            <button className="btn btn-ghost" onClick={() => { setSortBy(null); baoToast('Đã xếp lại theo thứ tự ưu tiên mặc định'); }}
              disabled={!sortBy} title="Quay lại thứ tự ưu tiên ban đầu (cần cấp → đang bán → hàng chậm → kho tổng)">
              <IcRefresh /> Xếp mặc định</button>
            {coFlt && <button className="btn btn-ghost" onClick={() => setFlt({})} title="Xóa mọi bộ lọc cột">Xóa lọc</button>}
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
                <th className="th-col col-sp">
                  <span className="th-lbl sortable" onClick={() => doiSort('sp')}>Sản phẩm{sortIc('sp')}</span>
                  <input className="flt-in" placeholder="lọc mã…" value={flt.sp || ''} onChange={(e) => datFlt('sp', e.target.value)} />
                </th>
                <th className="th-col num">
                  <span className="th-lbl sortable" onClick={() => doiSort('gia')}>Giá{sortIc('gia')}</span>
                  <input className="flt-in" placeholder="giá" value={flt.gia || ''} onChange={(e) => datFlt('gia', e.target.value)} />
                </th>
                <th className="th-col num">
                  <span className="th-lbl sortable" onClick={() => doiSort('ton')}>Tồn CH{sortIc('ton')}</span>
                  <input className="flt-in num" placeholder=">0, +, -2" value={flt.ton || ''} onChange={(e) => datFlt('ton', e.target.value)} />
                </th>
                <th className="th-col num">
                  <span className="th-lbl sortable" onClick={() => doiSort('kho')}>Kho tổng{sortIc('kho')}</span>
                  <input className="flt-in num" placeholder="số" value={flt.kho || ''} onChange={(e) => datFlt('kho', e.target.value)} />
                </th>
                <th className="th-col num">
                  <span className="th-lbl sortable" onClick={() => doiSort('ban')}>SL bán{sortIc('ban')}</span>
                  <input className="flt-in num" placeholder="số" value={flt.ban || ''} onChange={(e) => datFlt('ban', e.target.value)} />
                </th>
                <th className="th-col num">
                  <span className="th-lbl sortable" onClick={() => doiSort('ai')}>AI đề xuất{sortIc('ai')}</span>
                  <input className="flt-in num" placeholder=">0" value={flt.ai || ''} onChange={(e) => datFlt('ai', e.target.value)} />
                </th>
                <th className="th-col num">
                  <span className="th-lbl sortable" onClick={() => doiSort('sl')}>SL đề nghị{sortIc('sl')}</span>
                  <input className="flt-in num" placeholder="vd 3" value={flt.sl || ''} onChange={(e) => datFlt('sl', e.target.value)} />
                </th>
                <th className="th-col num">
                  <span className="th-lbl sortable" onClick={() => doiSort('tong')}>Tổng tồn{sortIc('tong')}</span>
                  <input className="flt-in num" placeholder="số" value={flt.tong || ''} onChange={(e) => datFlt('tong', e.target.value)} />
                </th>
                <th className="th-col num">
                  <span className="th-lbl sortable" onClick={() => doiSort('ngay')}>Ngày bán{sortIc('ngay')}</span>
                  <input className="flt-in num" placeholder="số" value={flt.ngay || ''} onChange={(e) => datFlt('ngay', e.target.value)} />
                </th>
                <th className="th-col center">
                  <span className="th-lbl sortable" onClick={() => doiSort('tt')}>Tình trạng{sortIc('tt')}</span>
                  <input className="flt-in" list="dl-tt" placeholder="hết hàng…" value={flt.tt || ''} onChange={(e) => datFlt('tt', e.target.value)} />
                  <datalist id="dl-tt">
                    <option value="Hết hàng" /><option value="trong ngày" /><option value="Hàng thu hồi" /><option value="Hàng mới" /><option value="Đang bán tốt" />
                    <option value="Bán đều" /><option value="Bán chậm" /><option value="Không bán" /><option value="Chưa phát sinh" />
                  </datalist>
                </th>
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
                                onError={(e) => { e.target.style.display = 'none'; e.target.insertAdjacentHTML('afterend', '<div class="noimg"></div>'); }}
                                onMouseEnter={(e) => { const b = e.target.getBoundingClientRect();
                                  setHoverAnh({ url: r.hinh_url, x: b.right + 12, y: Math.max(8, b.top - 70) }); }}
                                onMouseLeave={() => setHoverAnh(null)} />
                            : <div className="noimg"><IcBox /></div>}
                          <div>
                            <div className="mono" style={{ fontWeight: 600 }}>{r.ma_tham_chieu || r.sku}
                              {q.trim() && <span className="chip-nhom" title="Nhóm của mã này">{TEN_NHOM[nhomCua(r)] || nhomCua(r)}</span>}
                            </div>
                            <div className="sp-desc" style={{ fontSize: 11, color: 'var(--ink-2)' }}>{r.nganh_3}</div>
                          </div>
                        </div>
                      </td>
                      <td className="num">
                        {r.la_hang_sale && r.gia_sale > 0
                          ? <><span className="price-sale">{fmtVND(r.gia_sale)}</span>
                              <span className="price-old">{fmtVND(r.gia_niem_yet)}</span></>
                          : <span style={{ fontWeight: 600 }}>{fmtVND(r.gia_niem_yet)}</span>}
                      </td>
                      <td className="num">
                        {r.ton_truoc}
                        {(() => { const di = (r.ton_du_tinh ?? 0) - (r.ton_truoc ?? 0);
                          return di !== 0
                            ? <b style={{ color: di > 0 ? 'var(--teal-deep)' : 'var(--magenta)', marginLeft: 3, fontSize: 12 }}>
                                {di > 0 ? '+' + di : di}</b>
                            : null; })()}
                      </td>
                      <td className="num" style={r.kho_tong <= 0
                        ? { color: 'var(--magenta)', fontWeight: 700 }
                        : { color: 'var(--teal-deep)', fontWeight: 600 }}>
                        {r.kho_tong}
                        {r.dang_giu > 0 && <div style={{ fontSize: 10, color: 'var(--gold)', fontWeight: 700 }}>giữ {r.dang_giu}</div>}
                      </td>
                      <td className="num" style={{ fontWeight: 600 }}>{r.sl_ban_ky ?? 0}</td>
                      <td className="num" style={{ fontWeight: 700, color: 'var(--teal-deep)' }}>{r.sl_ai}</td>
                      <td className="num">
                        <input className={'qty-input' + (vuot || vuotKho ? ' over' : '') + (r.dac_biet ? ' khoa' : '')}
                          type="number" min="0" disabled={!!r.dac_biet}
                          title={r.dac_biet ? 'Hàng đặc biệt — phòng Điều phối chia trực tiếp' : undefined}
                          data-qty={idx}
                          value={r.dac_biet ? 0 : r.sl_xin} onChange={(e) => sua(r.barcode, e.target.value)}
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
                          ? (() => { const n = Math.round(((r.ton_truoc ?? 0) + (r.sl_xin || 0)) / r.toc_do);
                              return n > 60
                                ? <span style={{ color: 'var(--ink-2)' }} title={n + ' ngày — hàng bán rất chậm'}>60d+</span>
                                : <b style={{ color: 'var(--ink)' }}>{n}d</b>; })()
                          : <span style={{ color: 'var(--ink-2)' }}>—</span>}
                      </td>
                      <td className="center">
                        {r.tinh_trang && (
                          <span className={'tt ' + (
                            r.tinh_trang.startsWith('Hàng thu hồi') ? 'tt-dp-thuhoi'
                            : r.tinh_trang.startsWith('Hàng mới') ? 'tt-dp-moi'
                            : r.tinh_trang.startsWith('Hết hàng') || r.tinh_trang === 'Vừa hết hàng' ? 'tt-het'
                            : r.tinh_trang === 'Đang bán tốt' ? 'tt-tot'
                            : r.tinh_trang === 'Bán chậm' || r.tinh_trang.startsWith('Không bán') ? 'tt-cham'
                            : 'tt-thuong')}>
                            {r.tinh_trang.startsWith('Hết hàng ') && r.tinh_trang !== 'Hết hàng, chưa từng bán'
                              ? <>Hết hàng<br/>{r.tinh_trang.replace('Hết hàng ', '')}</>
                              : r.tinh_trang.startsWith('Hàng thu hồi')
                              ? <>Hàng thu hồi<br/>ĐP xử lý</>
                              : r.tinh_trang.startsWith('Hàng mới')
                              ? <>Hàng mới<br/>{r.tinh_trang.replace(/^Hàng mới\s*[—-]\s*/, '')}</>
                              : r.tinh_trang}
                          </span>
                        )}
                        {/* Mã hết (CH=0 + kho tổng=0): nút Yêu cầu điều phối — chỉ cửa hàng bấm */}
                        {user.vai_tro === 'CH' && (r.ton_truoc ?? 0) === 0 && (r.kho_tong ?? 0) <= 0
                          && (r.tinh_trang === 'Kho hết — cần sản xuất' || r.tinh_trang.startsWith('Hết hàng')) && (
                          <div className="ycdp-box">
                            {ycdp[r.barcode] ? (
                              <button className="ycdp-btn ycdp-done" onClick={() => huyYcdp(r)}
                                title="Đã gửi yêu cầu — bấm để hủy">✓ Đã gửi ({ycdp[r.barcode].so_luong})</button>
                            ) : (
                              <>
                                <input type="number" min="1" className="ycdp-sl" placeholder="SL"
                                  value={slXin[r.barcode] ?? ''} onChange={(e) => setSlXin((m) => ({ ...m, [r.barcode]: e.target.value }))} />
                                <button className="ycdp-btn" onClick={() => guiYcdp(r)}>Yêu cầu<br/>điều phối</button>
                              </>
                            )}
                          </div>
                        )}
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
          <div className="ai-title">AI đang phân tích dữ liệu</div>
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
