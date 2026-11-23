import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { IcRadar, IcCheck, IcAlert, IcFlash, IcRefresh, IcPuzzle, IcBox, IcTeam, IcTarget, IcClock } from '../lib/icons.jsx';
import { fmtN, tenNgan, gio } from './dsChung.jsx';

// ============================================================================
// TRUNG TÂM GỢI Ý THÙNG (v3.111.0) — chọn đội -> máy chủ chấm điểm mọi thùng sẵn sàng
// theo nhu cầu thật của đội (SQL 200: fn_ds_thung_goi_y), xếp hạng, giải thích, so đội,
// gợi ý ghép thùng. Chỉ ĐỌC: xem / chọn không đổi tồn kho.
//   Trạng thái thùng:  Được đề xuất  →  Đã chọn (tick trong bảng gợi ý, chỉ trên máy)
//                      →  Chờ xác nhận (đã đưa vào bàn chia = nháp)  →  Đã phân bổ (bấm Xác nhận ở bàn chia)
// ============================================================================

const r1 = (n) => Math.round(n * 10) / 10;
export const mucDiem = (d, cfg = {}) => (d >= (cfg.nguong_rat ?? 75) ? 'rat' : d >= (cfg.nguong_hop ?? 55) ? 'hop'
  : d >= (cfg.nguong_co_the ?? 35) ? 'cothe' : 'it');
const TEN_MUC = { rat: 'Rất phù hợp', hop: 'Phù hợp', cothe: 'Có thể', it: 'Ít phù hợp' };
const TT = { de_xuat: 'Được đề xuất', chon: 'Đã chọn', cho_xn: 'Chờ xác nhận' };
const LOAI = {
  gap: ['Đội sắp hết / đã hết', 'gap'], ban: ['Đội đang bán', 'ban'], chet: ['Đội còn tồn mà không bán', 'chet'],
  moi_tot: ['Đội chưa có — đội khác bán tốt', 'moi'], moi: ['Đội chưa có, chưa ai bán', 'moi0'], cc: ['Chưa nhận diện mã', 'cc'],
};

// ---------------------------------------------------------------------------
// Hook: gọi máy chủ khi đổi đội / tham số / nháp bàn chia. Giữ số cũ khi đang tính lại.
// ---------------------------------------------------------------------------
export function useGoiYThung({ doi, cuaSo, mucTieu, heSo, sapHet, nguoi, thung, sua, mo }) {
  const [kq, setKq] = useState(null);
  const [dang, setDang] = useState(false);
  const [loi, setLoi] = useState('');
  const lan = useRef(0);
  const thamSo = useRef({});
  thamSo.current = { doi, cuaSo, mucTieu, heSo, sapHet, nguoi, thung, sua };

  const tai = useCallback(async () => {
    const t = thamSo.current;
    if (!t.doi) return;
    const id = ++lan.current;
    setDang(true); setLoi('');
    const goi = () => sb.rpc('fn_ds_thung_goi_y', {
      p_doi: t.doi, p_cua_so: t.cuaSo, p_muc_tieu: t.mucTieu, p_he_so: t.heSo, p_sap_het: t.sapHet,
      p_nguoi: t.nguoi || null, p_thung: t.thung || [], p_sua: t.sua || {}, p_top: 40 });
    let { data, error } = await goi();
    if (error && (error.code === '57014' || /timeout|time out/i.test(error.message || ''))) {
      await new Promise((r) => setTimeout(r, 500));
      ({ data, error } = await goi());
    }
    if (id !== lan.current) return;          // đã có lượt mới hơn (đổi đội nhanh)
    setDang(false);
    if (error) {
      setLoi(/fn_ds_thung_goi_y|schema cache|does not exist/i.test(error.message)
        ? 'Chưa có hàm gợi ý trên máy chủ — cần chạy SQL 200'
        : error.code === '57014' || /timeout/i.test(error.message || '') ? 'Máy chủ đang bận — bấm làm mới để thử lại'
        : 'Lỗi: ' + error.message);
      return;
    }
    if (data?.loi) { setLoi(data.loi); return; }
    setKq(data);
  }, []);

  // đổi đội / tham số: tính ngay
  useEffect(() => { if (doi) tai(); }, [doi, cuaSo, mucTieu, heSo, sapHet]);   // eslint-disable-line
  // nháp bàn chia đổi (thêm/bớt thùng; số chia thêm chỉ theo dõi khi đang mở bảng gợi ý): tính lại sau khi ngừng thao tác
  const khoaNhap = (thung || []).join('|') + '#' + (mo ? JSON.stringify(sua || {}) : '');
  const dau = useRef(true);
  useEffect(() => {
    if (dau.current) { dau.current = false; return undefined; }
    const h = setTimeout(tai, (thung || []).length ? 700 : 1500);
    return () => clearTimeout(h);
  }, [khoaNhap]);   // eslint-disable-line
  // đang mở bảng gợi ý: 90 giây tính lại 1 lần + khi quay lại cửa sổ (đội khác có thể vừa chọn / xác nhận thùng)
  useEffect(() => {
    if (!mo) return undefined;
    const h = setInterval(() => { if (!document.hidden) tai(); }, 90000);
    const f = () => { if (!document.hidden) tai(); };
    window.addEventListener('focus', f);
    return () => { clearInterval(h); window.removeEventListener('focus', f); };
  }, [mo, tai]);
  return { kq: kq && kq.doi === doi ? kq : null, kqCu: kq, dang, loi, tai };
}

// ---------------------------------------------------------------------------
// Tính "phần còn lấp" khi đã chọn vài thùng (các thùng trùng mã không đếm 2 lần)
// ---------------------------------------------------------------------------
export function nhuCauMa(ds) {   // NEW - 3.127: dùng chung cho SIÊU TRÍ TUỆ (dsAiChiaDoi.js)
  // ct: [mã, SL, lấp, bán/ngày, đang có, tồn, loại, còn cần] — còn cần (ct[7]) có từ SQL 200 bản mới;
  // bản cũ chưa có thì lấy cận dưới = lấp lớn nhất mã đó trong các thùng
  const m = {};
  ds.forEach((b) => (b.ct || []).forEach((c) => {
    if (c[6] === 'cc') return;
    const can = c[7] != null ? c[7] : c[2];
    m[c[0]] = Math.max(m[c[0]] ?? 0, can);
  }));
  return m;
}
export function layTu(b, con) {     // lấy từ 1 thùng theo nhu cầu còn lại -> {lap, lay: {mã: sl}}
  let lap = 0; const lay = {};
  (b.ct || []).forEach((c) => {
    const k = Math.min(c[1], Math.max(0, con[c[0]] ?? 0));
    if (k > 0) { lap += k; lay[c[0]] = k; }
  });
  return { lap, lay };
}
export function tru(con, lay) { const n = { ...con }; Object.entries(lay).forEach(([m, k]) => { n[m] = Math.max(0, (n[m] ?? 0) - k); }); return n; }

// ---------------------------------------------------------------------------
// Vòng điểm 0–100
// ---------------------------------------------------------------------------
function VongDiem({ d, muc, nho }) {
  const R = nho ? 13 : 22, C = 2 * Math.PI * R, w = nho ? 4 : 5, s = (R + w) * 2;
  const [hien, setHien] = useState(0);
  useEffect(() => { const h = requestAnimationFrame(() => setHien(d)); return () => cancelAnimationFrame(h); }, [d]);
  return (
    <svg className={'gy-vong m-' + muc} width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-label={`${d} điểm`}>
      <defs>
        <linearGradient id="gyVongRat" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3FB6A8" /><stop offset="1" stopColor="#CBA45A" /></linearGradient>
      </defs>
      <circle cx={s / 2} cy={s / 2} r={R} className="nen" strokeWidth={w} fill="none" />
      <circle cx={s / 2} cy={s / 2} r={R} className="cung" strokeWidth={w} fill="none" strokeLinecap="round"
        strokeDasharray={C} strokeDashoffset={C * (1 - hien / 100)} transform={`rotate(-90 ${s / 2} ${s / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle">{d}</text>
    </svg>
  );
}

// Thanh cơ cấu thùng: lấp gấp · lấp · dư (đội vẫn bán) · tồn đọng · đội chưa có · chưa nhận diện
function ThanhCoCau({ b }) {
  const s = { gap: 0, lap: 0, du: 0, chet: 0, moi: 0, cc: 0 };
  (b.ct || []).forEach((c) => {
    const [, q, lap, , , , l] = c;
    if (l === 'cc') { s.cc += q; return; }
    if (l === 'chet') { s.chet += q; return; }
    if (l === 'moi' || l === 'moi_tot') { s.moi += q; return; }
    if (l === 'gap') s.gap += lap; else s.lap += lap;
    s.du += q - lap;
  });
  const t = b.n || 1;
  const nhan = { gap: 'lấp mã sắp hết', lap: 'lấp nhu cầu', du: 'dư (đội vẫn bán)', chet: 'đội không bán, còn tồn', moi: 'đội chưa có', cc: 'chưa nhận diện' };
  return (
    <div className="gy-cc" title={Object.entries(s).filter(([, v]) => v > 0).map(([k, v]) => `${v} cái ${nhan[k]}`).join('\n')}>
      {Object.entries(s).map(([k, v]) => (v > 0 ? <i key={k} className={'c-' + k} style={{ flex: v / t }} /> : null))}
    </div>
  );
}

function lyDo(b, ts) {
  const r = [];
  const fit = b.n ? Math.round((b.u / b.n) * 100) : 0;
  if (b.u > 0) r.push(['lap', <>Lấp <b>{fmtN(b.u)}/{fmtN(b.n)}</b> cái nhu cầu ({fit}%) · <b>{b.m_thieu}</b> mã đội đang thiếu</>]);
  if (b.m_urg > 0) r.push(['gap', <><b>{b.m_urg}</b> mã sắp hết (&lt; {ts.sh} ngày) — {fmtN(b.urg)} cái</>]);
  if (b.q_ban > 0) r.push(['ban', <>{Math.round((b.q_ban / b.n) * 100)}% thùng là mã đội đang bán ({b.m_ban} mã)</>]);
  if (b.m_moi > 0) r.push(['moi', <><b>{b.m_moi}</b> mã đội chưa có, đội khác bán tốt ({b.q_moi} cái)</>]);
  if (!r.length) r.push(['it', <>Đội chưa bán mã nào trong thùng {ts.w} ngày qua</>]);
  return r;
}
function canhBao(b, cfg, ts, marg) {
  const c = [];
  const cach = cfg.cach_doi_hon ?? 10;
  if (b.tot && b.tot.diem - b.diem >= cach) c.push(`${tenNgan(b.tot.ten)} cần hơn (${b.tot.diem} điểm)`);
  if (b.q_chet > 0) c.push(`${b.q_chet} cái · ${b.m_chet} mã đội còn tồn mà không bán ${ts.w} ngày`);
  const du = b.n - b.u - (b.cc || 0);
  if (b.u > 0 && du > 0 && b.u / b.n < 0.6) c.push(`Dư ${du} cái so với nhu cầu ${ts.t} ngày`);
  if (marg != null && marg < b.u) c.push(`Trùng mã với thùng đã chọn — chỉ lấp thêm ${marg}/${b.u} cái`);
  if (b.cc > 0) c.push(`${b.cc} cái mã chưa nhận diện`);
  // 204: mã thu hồi đội sale — không tính điểm, vẫn chọn được, rút ra khi cấp
  if (b.th?.length) c.push(`Thu hồi: rút ${b.th.length} mã (${b.th_q} cái) khi cấp — ${b.th.map((x) => `${x.m} ×${x.s}`).join(', ')}`);
  return c;
}

const BUOC = (kq, w) => [
  `Đọc sức bán ${w} ngày của đội`,
  'Đối chiếu tồn, hàng đang về, nháp đang chia',
  `Chấm điểm ${kq?.dem?.san ? fmtN(kq.dem.san) + ' ' : ''}thùng sẵn sàng`,
  'So mức cần với các đội khác',
];

// ===========================================================================
// BẢNG GỢI Ý (ngăn kéo bên phải bàn chia)
// ===========================================================================
export default function GoiYThung({ gy, doi, tenDoi, cuaSo, onDong, onDoiTiep, daChon = [], onThem, onBo }) {
  const { kq, kqCu, dang, loi, tai } = gy;
  const [tab, setTab] = useState('de');
  const [sap, setSap] = useState('diem');
  const [chon, setChon] = useState([]);        // tick tạm (Đã chọn)
  const [moCt, setMoCt] = useState(null);
  // hiệu ứng "đang phân tích": chạy ít nhất 650ms mỗi khi đổi đội
  const [quet, setQuet] = useState(true);
  const [buoc, setBuoc] = useState(0);
  useEffect(() => {
    setQuet(true); setBuoc(0); setChon([]); setMoCt(null);
    const t = [setTimeout(() => setBuoc(1), 160), setTimeout(() => setBuoc(2), 330), setTimeout(() => setBuoc(3), 500), setTimeout(() => setBuoc(4), 650)];
    return () => t.forEach(clearTimeout);
  }, [doi]);
  useEffect(() => { if (buoc >= 4 && kq) setQuet(false); }, [buoc, kq]);
  useEffect(() => { const f = (e) => { if (e.key === 'Escape') onDong(); }; window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, [onDong]);

  const cfg = kq?.cfg || {};
  const ts = kq?.ts || { w: cuaSo, t: 21, sh: 7 };
  const ds = useMemo(() => kq?.ds || [], [kq]);
  const deXuat = useMemo(() => ds.filter((b) => b.st === 'de_xuat'), [ds]);
  const choXn = useMemo(() => ds.filter((b) => b.st === 'cho_xn'), [ds]);
  // tick tạm chỉ giữ thùng còn đang được đề xuất
  useEffect(() => {
    setChon((c) => { const n = c.filter((t) => deXuat.some((b) => b.t === t)); return n.length === c.length ? c : n; });
  }, [deXuat]);

  // ----- phần còn lấp sau khi chọn (theo thứ tự tick) -----
  const can = useMemo(() => nhuCauMa(ds.filter((b) => b.st === 'de_xuat')), [ds]);
  const tinh = useMemo(() => {
    let con = { ...can }; const gop = {}; let lap = 0, cai = 0;
    chon.forEach((t) => {
      const b = deXuat.find((x) => x.t === t); if (!b) return;
      const r = layTu(b, con); gop[t] = r.lap; lap += r.lap; cai += b.n; con = tru(con, r.lay);
    });
    const marg = {};
    deXuat.forEach((b) => { if (!chon.includes(b.t)) marg[b.t] = layTu(b, con).lap; });
    return { con, gop, lap, cai, marg };
  }, [can, chon, deXuat]);

  // ----- ghép thùng (tham lam): mỗi bước lấy thùng lấp thêm nhiều nhất, thùng phải lấp ≥ 60% -----
  const ghep = useMemo(() => {
    let con = { ...can }; const bo = []; let lap = 0, cai = 0;
    const ung = deXuat.filter((b) => (b.ct || []).length);
    for (let i = 0; i < 10; i++) {
      let tot = null;
      ung.forEach((b) => {
        if (bo.some((x) => x.b.t === b.t)) return;
        const r = layTu(b, con);
        if (r.lap < Math.max(8, 0.6 * b.n)) return;
        const diemGhep = r.lap * 1000 + b.diem;
        if (!tot || diemGhep > tot.k) tot = { b, r, k: diemGhep };
      });
      if (!tot) break;
      con = tru(con, tot.r.lay); lap += tot.r.lap; cai += tot.b.n;
      bo.push({ b: tot.b, lap: tot.r.lap, luyKe: lap });
    }
    return { bo, lap, cai, du: cai - lap };
  }, [can, deXuat]);

  const nong = (b) => b.st === 'de_xuat' && b.diem >= (cfg.nguong_rat ?? 75)
    && (!b.tot || b.tot.diem - b.diem < (cfg.cach_doi_hon ?? 10)) && (tinh.marg[b.t] ?? b.u) >= 0.75 * b.n;

  const hien = useMemo(() => {
    const v = [...deXuat];
    if (sap === 'can_nhat') v.sort((a, b) => (a.thu_hang_doi - b.thu_hang_doi) || b.diem - a.diem || a.hang - b.hang);
    else if (sap === 'lap') v.sort((a, b) => (tinh.marg[b.t] ?? b.u) - (tinh.marg[a.t] ?? a.u) || a.hang - b.hang);
    else v.sort((a, b) => a.hang - b.hang);
    return v;
  }, [deXuat, sap, tinh.marg]);

  const batChon = (t) => setChon((c) => (c.includes(t) ? c.filter((x) => x !== t) : [...c, t]));
  const chonBo = () => { setChon(ghep.bo.map((x) => x.b.t)); setTab('de'); };
  const dua = (ds2) => {
    const moi = ds2.filter((t) => !daChon.includes(t));
    if (!moi.length) return;
    onThem(moi); setChon([]);
  };

  // cảnh báo các thùng đã tick (chỉ cảnh báo — anh vẫn quyết)
  const canhChon = useMemo(() => chon.map((t) => {
    const b = deXuat.find((x) => x.t === t); if (!b) return null;
    const c = [];
    if (b.diem < (cfg.nguong_co_the ?? 35)) c.push(`điểm thấp (${b.diem})`);
    if (b.tot && b.tot.diem - b.diem >= (cfg.cach_doi_hon ?? 10)) c.push(`${tenNgan(b.tot.ten)} cần hơn (${b.tot.diem})`);
    if (b.q_chet / (b.n || 1) >= 0.2) c.push(`${b.q_chet} cái mã đội không bán`);
    const g = tinh.gop[t] ?? 0;
    if (g < 0.5 * b.n) c.push(`chỉ lấp ${g}/${b.n} cái (trùng thùng khác hoặc dư)`);
    if (b.th?.length) c.push(`rút ${b.th.length} mã thu hồi (${b.th_q} cái)`);
    return c.length ? { t, c } : null;
  }).filter(Boolean), [chon, deXuat, tinh.gop, cfg]);

  const tong = kq?.tong || {};
  const dem = kq?.dem || {};
  const giu = kq?.giu || [];
  const coDuLieuMoi = !!kq;
  const tyLeLap = tong.trong_thung > 0 ? Math.min(100, Math.round((ghep.lap / tong.trong_thung) * 100)) : 0;

  return (
    <aside className="gyt" role="dialog" aria-label="Trung tâm gợi ý thùng">
      {/* ===== Đầu: nền tối công nghệ ===== */}
      <header className="gy-dau">
        <div className="gy-dau1">
          <span className="gy-nhan"><i className={'gy-song' + (dang ? ' chay' : '')} /> Trung tâm gợi ý thùng</span>
          <span className="gy-luc" title="Lần tính gần nhất trên máy chủ">{dang ? 'đang tính…' : kqCu?.luc ? 'tính lúc ' + gio(kqCu.luc) : ''}</span>
          <button className="gy-icon" onClick={tai} disabled={dang} title="Tính lại ngay"><IcRefresh /></button>
          <button className="gy-icon" onClick={onDong} title="Đóng (Esc)">×</button>
        </div>
        <div className="gy-dau2">
          <button className="gy-mui" onClick={() => onDoiTiep(-1)} title="Đội trước">‹</button>
          <div className="gy-doi"><b>{tenNgan(tenDoi)}</b>
            <small>{kq ? <>Sức bán {ts.w} ngày · chia đủ {ts.t} ngày · {kq.ts?.h ?? 100}%{kq.che_do === 'moi' ? ` · đội mới bán ${kq.ngay_ban || 0} ngày — sức bán lấy theo trung bình các đội` : ''}</> : 'Đang phân tích…'}</small>
          </div>
          <button className="gy-mui" onClick={() => onDoiTiep(1)} title="Đội sau">›</button>
        </div>
        <div className="gy-kpi">
          <div title={`Nhu cầu chia đủ ${ts.t} ngày còn thiếu (không tính phụ kiện), đã trừ hàng trong nháp bàn chia`}>
            <small>Còn thiếu</small><b>{coDuLieuMoi ? fmtN(tong.can) : '—'}</b><span>cái · {coDuLieuMoi ? fmtN(tong.can_ma) : '—'} mã</span></div>
          <div title="Phần nhu cầu còn thiếu mà các thùng sẵn sàng (chưa ai chọn) có thể lấp">
            <small>Thùng lấp được</small><b>{coDuLieuMoi ? fmtN(tong.trong_thung) : '—'}</b><span>cái · {coDuLieuMoi ? fmtN(tong.trong_thung_ma) : '—'} mã</span></div>
          <div className="nhan" title={`Rất phù hợp ≥ ${cfg.nguong_rat ?? 75} điểm · Phù hợp ≥ ${cfg.nguong_hop ?? 55} điểm`}>
            <small>Rất phù hợp</small><b>{coDuLieuMoi ? fmtN(dem.rat) : '—'}</b><span>thùng · {coDuLieuMoi ? fmtN(dem.hop) : '—'} phù hợp</span></div>
          <div title="Thùng đã nằm trong bàn chia của đội này (chờ xác nhận) · thùng đang nằm trong nháp của đội khác">
            <small>Chờ xác nhận</small><b>{coDuLieuMoi ? fmtN(dem.cho_xn) : '—'}</b><span>thùng · {coDuLieuMoi ? fmtN(dem.doi_khac) : '—'} đội khác giữ</span></div>
        </div>
      </header>

      {/* ===== Thanh chọn xem ===== */}
      <nav className="gy-tab">
        <div className="gy-seg">
          <button className={tab === 'de' ? 'on' : ''} onClick={() => setTab('de')}>Đề xuất<i>{deXuat.length}</i></button>
          <button className={tab === 'ghep' ? 'on' : ''} onClick={() => setTab('ghep')}><IcPuzzle /> Ghép thùng</button>
          <button className={tab === 'chon' ? 'on' : ''} onClick={() => setTab('chon')}>Đã chọn<i>{chon.length + choXn.length}</i></button>
          <button className={tab === 'giu' ? 'on' : ''} onClick={() => setTab('giu')}>Đội khác giữ<i>{giu.length}</i></button>
        </div>
        {tab === 'de' && (
          <div className="gy-seg nho" title="Cách xếp">
            {[['diem', 'Điểm cao'], ['can_nhat', 'Đội này cần nhất'], ['lap', 'Lấp nhiều']].map(([k, t]) => (
              <button key={k} className={sap === k ? 'on' : ''} onClick={() => setSap(k)}>{t}</button>
            ))}
          </div>
        )}
      </nav>

      {/* ===== Thân ===== */}
      <div className="gy-than">
        {loi && <div className="gy-loi"><IcAlert /> {loi} <button onClick={tai}>Thử lại</button></div>}
        {(!kq && loi) ? null : (quet || !kq) ? (
          <div className="gy-quet">
            <div className="gy-radar"><i className="quet" /><i className="d1" /><i className="d2" /><i className="d3" /><IcRadar /></div>
            <ul>
              {BUOC(kqCu, cuaSo).map((t, i) => (
                <li key={i} className={buoc > i ? 'xong' : buoc === i ? 'dang' : ''}>
                  <span>{buoc > i ? <IcCheck /> : <i />}</span>{t}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className={'gy-ds' + (dang ? ' dang-cap-nhat' : '')} key={kq.doi}>
            {/* ---------- ĐỀ XUẤT ---------- */}
            {tab === 'de' && (<>
              {deXuat.length === 0 && <div className="gy-trong">Không còn thùng sẵn sàng nào để đề xuất.</div>}
              {deXuat.length > 0 && hien[0]?.diem < (cfg.nguong_co_the ?? 35) && (
                <div className="gy-ghi canh"><IcAlert /> Chưa có thùng nào thật sự hợp đội — đội đang thiếu chủ yếu mã không có trong thùng. Nên chia thêm từ kho SA ở bàn chia.</div>
              )}
              {hien.map((b, i) => (
                <TheGoiY key={b.t} b={b} i={i} cfg={cfg} ts={ts} nong={nong(b)} chon={chon.includes(b.t)}
                  marg={chon.length ? tinh.marg[b.t] : null} mo={moCt === b.t}
                  onMo={() => setMoCt(moCt === b.t ? null : b.t)} onChon={() => batChon(b.t)} />
              ))}
              {deXuat.length > 0 && (
                <details className="gy-cach">
                  <summary>Cách chấm điểm (0–100) — số liệu thật, không đoán</summary>
                  <p><b>Nhu cầu</b> mỗi mã = bán/ngày × {ts.t} ngày × {kq.ts?.h ?? 100}% − (tồn + đang về + đã giữ/phân bổ chưa xuất) − số chia thêm đang nhập − hàng trong các thùng đã đưa vào bàn chia.
                    Sức bán tính trên {ts.w} ngày (đội bán chưa đủ thì tính trên số ngày đã bán; đội mới dưới {cfg.ngay_doi_moi ?? 7} ngày lấy theo trung bình các đội).</p>
                  <ul>
                    <li><b>{cfg.w_fit ?? 35}</b> × phần thùng lấp đúng nhu cầu</li>
                    <li><b>{cfg.w_imp ?? 25}</b> × số cái lấp được (đủ điểm khi lấp ≥ {cfg.q_ref ?? 40} cái)</li>
                    <li><b>{cfg.w_urg ?? 20}</b> × cái lấp cho mã đội còn dưới {ts.sh} ngày bán (đủ khi ≥ {cfg.urg_ref ?? 15} cái)</li>
                    <li><b>{cfg.w_ban ?? 20}</b> × phần thùng là mã đội đang bán</li>
                    <li><b>+{cfg.w_moi ?? 5}</b> × phần mã đội chưa có mà các đội khác bán tốt</li>
                    <li><b>−{cfg.k_chet ?? 30}</b> × phần mã đội còn tồn mà không bán · <b>−{cfg.k_cc ?? 10}</b> × phần mã chưa nhận diện</li>
                  </ul>
                  <p>Mốc: Rất phù hợp ≥ {cfg.nguong_rat ?? 75} · Phù hợp ≥ {cfg.nguong_hop ?? 55} · Có thể ≥ {cfg.nguong_co_the ?? 35}. “Nên phân bổ ngay” = rất phù hợp, không đội nào cần hơn ≥ {cfg.cach_doi_hon ?? 10} điểm và còn lấp ≥ 75% thùng.
                    Trọng số lưu ở tham số <code>thung_goi_y</code> — đổi được, không cần sửa phần mềm.</p>
                </details>
              )}
            </>)}

            {/* ---------- GHÉP THÙNG ---------- */}
            {tab === 'ghep' && (
              <div className="gy-ghep">
                <div className="gy-ghep-dau">
                  <div className="gy-ghep-tom"><IcPuzzle />
                    <div><b>Bộ ghép đề xuất: {ghep.bo.length} thùng · {fmtN(ghep.cai)} cái</b>
                      <small>Mỗi bước lấy thùng lấp thêm nhiều nhất phần nhu cầu CÒN LẠI (mã trùng giữa các thùng chỉ tính 1 lần); thùng phải lấp ≥ 60% mới được ghép — không đẩy hàng vượt nhu cầu.</small></div>
                  </div>
                  <div className="gy-tien">
                    <div className="gy-tien-nhan"><span>Lấp nhu cầu có thể lấp bằng thùng</span><b>{fmtN(ghep.lap)}<em>/ {fmtN(tong.trong_thung)} cái</em></b></div>
                    <div className="kt-bar"><div className="kt-fill" style={{ width: tyLeLap + '%' }}><i className="kt-song" /></div><span className={'kt-pct' + (tyLeLap < 18 ? ' toi' : '')}>{tyLeLap}%</span></div>
                    <div className="gy-tien-phu">Dư {fmtN(ghep.du)} cái (đội vẫn bán / chưa cần trong {ts.t} ngày) · còn thiếu {fmtN(Math.max(0, (tong.can || 0) - ghep.lap))} cái chia từ kho SA</div>
                  </div>
                </div>
                {ghep.bo.length === 0 ? <div className="gy-trong">Không ghép được bộ nào — các thùng còn lại đều lấp dưới 60% nhu cầu đội.</div> : (
                  <ol className="gy-ghep-ds">
                    {ghep.bo.map((x, i) => (
                      <li key={x.b.t}>
                        <span className="so">{i + 1}</span>
                        <VongDiem d={x.b.diem} muc={mucDiem(x.b.diem, cfg)} nho />
                        <div><b>{x.b.t}</b><small>{x.b.g} · {x.b.n} cái</small></div>
                        <div className="gy-ghep-lap"><b>+{fmtN(x.lap)}</b><small>lấp thêm · lũy kế {fmtN(x.luyKe)}</small></div>
                        <div className="gy-ghep-thanh"><i style={{ width: Math.round((x.lap / x.b.n) * 100) + '%' }} /></div>
                      </li>
                    ))}
                  </ol>
                )}
                {ghep.bo.length > 0 && <button className="btn btn-ai gy-ghep-nut" onClick={chonBo}><IcCheck /> Chọn cả bộ {ghep.bo.length} thùng</button>}
              </div>
            )}

            {/* ---------- ĐÃ CHỌN ---------- */}
            {tab === 'chon' && (<>
              <div className="gy-muc"><span className="gy-tt chon">Đã chọn</span> tick trong bảng gợi ý — chưa vào bàn chia</div>
              {chon.length === 0 && <div className="gy-trong nho">Chưa tick thùng nào.</div>}
              {chon.map((t) => { const b = deXuat.find((x) => x.t === t); return b ? (
                <div key={t} className="gy-dong"><VongDiem d={b.diem} muc={mucDiem(b.diem, cfg)} nho />
                  <div><b>{t}</b><small>{b.n} cái · lấp {tinh.gop[t] ?? 0} cái</small></div>
                  <button className="gy-x" onClick={() => batChon(t)} title="Bỏ chọn">×</button></div>) : null; })}
              <div className="gy-muc"><span className="gy-tt cho">Chờ xác nhận</span> đã nằm trong bàn chia — chưa trừ kho, phân bổ khi bấm Xác nhận</div>
              {choXn.length === 0 && <div className="gy-trong nho">Bàn chia chưa có thùng nào.</div>}
              {choXn.map((b) => (
                <div key={b.t} className="gy-dong"><VongDiem d={b.diem} muc={mucDiem(b.diem, cfg)} nho />
                  <div><b>{b.t}</b><small>{b.n} cái · lấp {b.u} cái nhu cầu · {TEN_MUC[mucDiem(b.diem, cfg)]}</small></div>
                  <button className="gy-x" onClick={() => onBo(b.t)} title="Bỏ khỏi bàn chia">×</button></div>
              ))}
              {choXn.length > 0 && <button className="btn btn-ghost gy-ve" onClick={onDong}>Về bàn chia để Xác nhận &amp; xuất →</button>}
              {daChon.filter((t) => !choXn.some((b) => b.t === t)).length > 0 && (
                <div className="gy-ghi">Thùng khác trong bàn chia không còn ở trạng thái sẵn sàng (đã phân bổ / cần kiểm tra): {daChon.filter((t) => !choXn.some((b) => b.t === t)).join(', ')}</div>
              )}
            </>)}

            {/* ---------- ĐỘI KHÁC GIỮ ---------- */}
            {tab === 'giu' && (<>
              <div className="gy-ghi">Các thùng đang nằm trong nháp chia của đội khác ({cfg.ngay_nhap ?? 3} ngày gần đây) — không đề xuất cho {tenNgan(tenDoi)} để tránh chia trùng.</div>
              {giu.length === 0 && <div className="gy-trong nho">Không có thùng nào đang được đội khác chọn.</div>}
              {giu.map((g) => (
                <div key={g.t} className="gy-dong"><VongDiem d={g.diem} muc={mucDiem(g.diem, cfg)} nho />
                  <div><b>{g.t}</b><small><IcTeam /> {tenNgan(g.ten) || g.doi} đang chọn{g.nguoi ? ` · ${g.nguoi}` : ''}{g.luc ? ` · ${gio(g.luc)}` : ''}</small></div>
                  <span className="gy-giu-ghi">điểm với đội này</span></div>
              ))}
            </>)}
          </div>
        )}
      </div>

      {/* ===== Chân: chọn & đưa vào bàn chia ===== */}
      <footer className="gy-chan">
        {canhChon.length > 0 && (
          <div className="gy-chan-canh">
            {canhChon.map((x) => <div key={x.t}><IcAlert /> <b>{x.t}</b>: {x.c.join(' · ')}</div>)}
            <em>Chỉ là cảnh báo — anh vẫn toàn quyền quyết định.</em>
          </div>
        )}
        <div className="gy-chan1">
          <div className="gy-chan-so">
            {chon.length ? <><b>{chon.length}</b> thùng · <b>{fmtN(tinh.cai)}</b> cái · lấp <b>{fmtN(tinh.lap)}</b> cái nhu cầu ({tinh.cai ? Math.round((tinh.lap / tinh.cai) * 100) : 0}%)</>
              : <span>Tick ô tròn trên thẻ để chọn thùng</span>}
          </div>
          {chon.length > 0 && <button className="btn btn-ghost" onClick={() => setChon([])}>Bỏ chọn</button>}
          <button className="btn btn-ai" disabled={!chon.length} onClick={() => dua(chon)}><IcBox /> Đưa {chon.length || ''} thùng vào bàn chia</button>
        </div>
        <div className="gy-chan-ghi"><IcClock /><span>Xem / chọn không đổi tồn kho. Thùng vào bàn chia = <b>Chờ xác nhận</b>; chỉ khi bấm <b>Xác nhận &amp; xuất</b> ở bàn chia mới phân bổ chính thức.</span></div>
      </footer>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Thẻ 1 thùng gợi ý
// ---------------------------------------------------------------------------
function TheGoiY({ b, i, cfg, ts, nong, chon, marg, mo, onMo, onChon }) {
  const muc = mucDiem(b.diem, cfg);
  const st = chon ? 'chon' : b.st;
  const canh = canhBao(b, cfg, ts, marg);
  const ly = lyDo(b, ts);
  return (
    <div className={`gy-the m-${muc}${nong ? ' nong' : ''}${chon ? ' chon' : ''}${marg != null && marg < 0.5 * b.u ? ' mo-nhat' : ''}`} style={{ '--i': Math.min(i, 14) }}>
      {nong && <div className="gy-nong"><IcFlash /> Nên phân bổ ngay</div>}
      <div className="gy-the-tren">
        <div className="gy-the-diem">
          <VongDiem d={b.diem} muc={muc} />
          <small>{TEN_MUC[muc]}</small>
        </div>
        <div className="gy-the-giua">
          <div className="gy-the-dau">
            <span className="gy-hang">#{b.hang}</span>
            <b className="gy-ma">{b.t}</b>
            <span className="gy-g">{b.g || '—'}</span>
            <span className={'gy-tt ' + (st === 'chon' ? 'chon' : st === 'cho_xn' ? 'cho' : 'de')}>{TT[st]}</span>
          </div>
          <div className="gy-the-so">{fmtN(b.n)} cái · {b.sm} mã
            {b.dt ? <span title="Doanh thu ước tính nếu bán hết phần lấp nhu cầu (giá sale thực tế của đội sale 28 ngày)"> · ≈ {r1(b.dt / 1e6).toLocaleString('vi')} tr</span> : null}
            {b.thu_hang_doi === 1 ? <em className="gy-hang-doi top" title="So mức cần thùng này giữa các đội">đội cần nhất</em>
              : <em className="gy-hang-doi" title={'So mức cần thùng này giữa các đội — đội cần nhất: ' + (b.tot ? `${tenNgan(b.tot.ten)} (${b.tot.diem} điểm)` : '—')}>đội cần thứ {b.thu_hang_doi}</em>}
          </div>
          <ul className="gy-ly">{ly.slice(0, 3).map(([k, t], j) => <li key={j} className={'l-' + k}><i /><span>{t}</span></li>)}</ul>
          <ThanhCoCau b={b} />
          {canh.length > 0 && <div className="gy-canh">{canh.map((c, j) => <span key={j}><IcAlert /> {c}</span>)}</div>}
        </div>
        <div className="gy-the-nut">
          <button className={'gy-tick' + (chon ? ' on' : '')} onClick={onChon} title={chon ? 'Bỏ chọn' : 'Chọn thùng này'}>{chon && <IcCheck />}</button>
          <button className={'gy-xem' + (mo ? ' on' : '')} onClick={onMo} title="Xem ruột thùng">{mo ? 'Ẩn' : 'Xem'}</button>
        </div>
      </div>
      {mo && (
        <div className="gy-ct">
          <table>
            <thead><tr><th className="l">Mã trong thùng</th><th>SL</th><th title="Phần lấp nhu cầu đội">Lấp</th><th title="Đội đang có (tồn + đang về)">Đội có</th><th>Bán/ngày</th></tr></thead>
            <tbody>
              {(b.ct || []).map((c) => (
                <tr key={c[0]} className={'l-' + (LOAI[c[6]]?.[1] || 'moi0')} title={LOAI[c[6]]?.[0]}>
                  <td className="l"><i className="cham" />{c[0]}</td>
                  <td>{c[1]}</td>
                  <td className={c[2] ? 'dam' : 'mo'}>{c[2] || '·'}</td>
                  <td>{c[4] || <span className="mo">0</span>}</td>
                  <td>{c[3] ? r1(c[3]) : <span className="mo">·</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {b.top3?.length > 0 && (
            <div className="gy-so-doi"><IcTarget /> <span>Các đội cần nhất:</span>
              {b.top3.map((x) => <em key={x.doi} className={x.diem > b.diem ? 'hon' : ''}>{tenNgan(x.ten)} · {x.diem}</em>)}
              <em className="minh">{'Đội này'} · {b.diem}</em>
              {b.so_doi_hop > 0 && <span className="phu">{b.so_doi_hop} đội khác cũng hợp (≥ {cfg.nguong_hop ?? 55})</span>}
            </div>
          )}
          <div className="gy-chu-giai">
            {['gap', 'ban', 'chet', 'moi_tot', 'moi'].map((k) => <span key={k} className={'l-' + LOAI[k][1]}><i className="cham" />{LOAI[k][0]}</span>)}
          </div>
        </div>
      )}
    </div>
  );
}

// Nút mở trung tâm gợi ý (đặt ở khu thùng của bàn chia)
export function NutGoiY({ gy, onMo, gon }) {
  const k = gy.kq;
  const n = k?.dem?.rat ?? 0;
  const [nhay, setNhay] = useState(false);
  const truoc = useRef(null);
  useEffect(() => {
    if (!k) return undefined;
    if (truoc.current !== k.doi) { truoc.current = k.doi; setNhay(true); const h = setTimeout(() => setNhay(false), 1400); return () => clearTimeout(h); }
    return undefined;
  }, [k]);
  return (
    <button className={'gy-mo-nut' + (nhay ? ' nhay' : '') + (gy.dang && !k ? ' dang' : '')} onClick={onMo}
      title={k ? `${n} thùng rất phù hợp · ${k.dem?.hop ?? 0} thùng phù hợp với đội — bấm để xem gợi ý` : 'Đang phân tích thùng cho đội…'}>
      <IcRadar /><span className={gon ? 'ch-an-hep' : ''}>{gon ? ' Gợi ý' : ' Gợi ý thùng'}</span>
      {k ? <i>{n}</i> : <i className="cho">…</i>}
    </button>
  );
}
