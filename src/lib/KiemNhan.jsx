// ============================================================================
// NEW - 3.164.0 KIỂM NHẬN HÀNG (anh yêu cầu 26/11 15:15) — thay hộp "Nhận hàng" cũ
//   Hàng về tới cửa hàng → mở phiếu → "Nhận hàng" → màn kiểm toàn màn hình:
//   - BẮN MÃ VẠCH (súng quét / gõ mã + Enter / camera nếu máy hỗ trợ): mỗi lần bắn +1 cái của mã đó, bắn liên tục không cần bấm gì.
//   - TICK TỪNG MÃ (ưu tiên): bấm ✓ = đủ số kho đã xuất của mã đó; bấm lại = bỏ; −/+ chỉnh từng cái.
//   - NHẬN ĐỦ CẢ PHIẾU: 1 nút đánh dấu đủ mọi mã.
//   - Thẻ "vừa kiểm": hình sản phẩm, mã, số của mã (3 / 5), tổng phiếu (12 / 14); kêu + rung khi đủ / khi sai mã / khi thừa.
//   - Số đang kiểm lưu trên máy (đóng app mở lại vẫn còn, 3 ngày). Kiểm xong → Xác nhận → (thiếu thì ghi lý do) → gửi Odoo (SQL 303).
// ============================================================================
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useApp } from '../App.jsx';
import { nhanOdoo } from './odoo.js';
import { IcAlert, IcCheck } from './icons.jsx';

const fmt = (n) => Number(n || 0).toLocaleString('vi');
const chuan = (s) => String(s || '').trim().toLowerCase();
const KHOA = (name) => 'ns_kiem_nhan_' + name;

// Âm báo + rung: ok (1 tiếng) · du (2 tiếng cao) · loi (tiếng trầm)
let ac = null;
function keu(loai) {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    const ds = loai === 'loi' ? [[200, 0, 0.18]] : loai === 'du' ? [[988, 0, 0.07], [1319, 0.09, 0.11]] : [[880, 0, 0.06]];
    ds.forEach(([f, t, d]) => {
      const o = ac.createOscillator(); const g = ac.createGain();
      o.type = loai === 'loi' ? 'square' : 'sine'; o.frequency.value = f;
      const t0 = ac.currentTime + t;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      o.connect(g); g.connect(ac.destination); o.start(t0); o.stop(t0 + d + 0.02);
    });
  } catch { /* máy không cho phát âm — bỏ qua */ }
  try { navigator.vibrate?.(loai === 'loi' ? [70, 50, 70] : loai === 'du' ? [25, 40, 25] : 18); } catch { /* bỏ qua */ }
}

function Anh({ url, ma, co }) {
  const [hong, setHong] = useState(false);
  if (!url || hong) return <span className="kn-anh trong" style={{ width: co, height: co }}>{String(ma || '').slice(0, 2)}</span>;
  return <img className="kn-anh" style={{ width: co, height: co }} src={url} alt={ma} loading="lazy" decoding="async" onError={() => setHong(true)} />;
}

// Vòng tiến độ tổng phiếu
function Vong({ pt, tong, tongCon, nho }) {
  const r = nho ? 22 : 40; const w = nho ? 6 : 9; const c = 2 * Math.PI * r; const kt = (r + w) * 2;
  return (
    <div className={'kn-vong' + (nho ? ' nho' : '') + (pt >= 100 ? ' du' : '')} style={{ width: kt, height: kt }}>
      <svg width={kt} height={kt} viewBox={`0 0 ${kt} ${kt}`} aria-hidden="true">
        <defs><linearGradient id="kn-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3FB6A8" /><stop offset="1" stopColor="#9BE3D8" /></linearGradient></defs>
        <circle cx={kt / 2} cy={kt / 2} r={r} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth={w} />
        <circle cx={kt / 2} cy={kt / 2} r={r} fill="none" stroke="url(#kn-g)" strokeWidth={w} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(pt, 100) / 100)} transform={`rotate(-90 ${kt / 2} ${kt / 2})`} />
      </svg>
      <div className="kn-vong-so">{nho ? <b>{pt}%</b> : <><b>{pt}%</b><span>{fmt(tong)} / {fmt(tongCon)}</span></>}</div>
    </div>
  );
}

// Camera: dùng bộ đọc mã có sẵn của trình duyệt (Chrome / Android). Cùng 1 mã còn trong khung thì không đếm lặp.
function Camera({ onMa, onDong }) {
  const v = useRef(null);
  const onMaRef = useRef(onMa); onMaRef.current = onMa;
  const [loi, setLoi] = useState('');
  useEffect(() => {
    let song = true; let stream = null; let timer = null; let cuoi = { ma: '', luc: 0 };
    (async () => {
      try {
        const co = (await window.BarcodeDetector.getSupportedFormats?.()) || [];
        const muon = ['ean_13', 'ean_8', 'code_128', 'code_39', 'code_93', 'upc_a', 'upc_e', 'itf', 'codabar', 'qr_code'].filter((f) => !co.length || co.includes(f));
        const det = new window.BarcodeDetector({ formats: muon });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (!song) { stream.getTracks().forEach((t) => t.stop()); return; }
        v.current.srcObject = stream;
        await v.current.play();
        const lap = async () => {
          if (!song) return;
          try {
            const kq = await det.detect(v.current);
            const ma = kq?.[0]?.rawValue;
            const now = Date.now();
            if (ma) {
              if (ma !== cuoi.ma) onMaRef.current(ma);
              cuoi = { ma, luc: now };
            } else if (now - cuoi.luc > 450) cuoi.ma = '';   // rời khung → cái kế tiếp cùng mã được đếm
          } catch { /* khung hình lỗi — đọc khung sau */ }
          timer = setTimeout(lap, 110);
        };
        lap();
      } catch (e) {
        setLoi(e?.name === 'NotAllowedError' ? 'Chưa cho phép dùng camera — bật quyền camera cho trang này rồi thử lại'
          : 'Không mở được camera: ' + (e?.message || e));
      }
    })();
    return () => { song = false; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, []);
  return (
    <div className="kn-cam">
      <video ref={v} playsInline muted />
      <i className="kn-cam-khung" aria-hidden="true"><em /></i>
      {loi && <div className="kn-cam-loi"><IcAlert /> {loi}</div>}
      <button type="button" className="kn-cam-tat" onClick={onDong}>Tắt camera</button>
    </div>
  );
}

const LOC = [['tat', 'Tất cả'], ['chua', 'Chưa đủ'], ['du', 'Đã đủ']];

export default function KiemNhan({ ct, onDong, onXong }) {
  const { user, baoToast } = useApp();
  const ds = useMemo(() => (ct.dong4 || [])
    .map((d) => ({ ...d, con: Math.max((d.xuat || 0) - (d.nhan || 0), 0) }))
    .filter((d) => d.con > 0 && d.barcode), [ct.dong4]);
  const theoBc = useMemo(() => new Map(ds.map((d) => [d.barcode, d])), [ds]);
  const tim = useMemo(() => {
    const m = new Map();
    ds.forEach((d) => { [d.sku, d.ma, d.barcode].forEach((k) => { if (k) m.set(chuan(k), d.barcode); }); });
    return m;
  }, [ds]);
  const tongCon = ds.reduce((a, d) => a + d.con, 0);
  const vd = ct.nhan_hang?.van_don || {};

  // Số đã kiểm: giữ trong ref để bắn mã liên tục (nhiều lần trước khi vẽ lại) vẫn đúng; lưu máy để mở lại còn
  const dem = useRef(null);
  const [tiepTuc] = useState(() => {
    let cu = null;
    try { const x = JSON.parse(localStorage.getItem(KHOA(ct.name)) || 'null'); if (x && Date.now() - x.luc < 3 * 864e5) cu = x.dem; } catch { /* bỏ qua */ }
    dem.current = Object.fromEntries(ds.map((d) => [d.barcode, Math.min(Math.max(Math.floor(Number(cu?.[d.barcode]) || 0), 0), d.con)]));
    return Object.values(dem.current).some((n) => n > 0);
  });
  const [, ve] = useReducer((x) => x + 1, 0);
  const [cuoi, setCuoi] = useState(null);
  const [loc, setLoc] = useState('tat');
  const [buoc, setBuoc] = useState('kiem');
  const [ghi, setGhi] = useState('');
  const [daToi, setDaToi] = useState(false);
  const [daQuet, setDaQuet] = useState(false);
  const [dang, setDang] = useState(false);
  const [loi, setLoi] = useState('');
  const [cam, setCam] = useState(false);
  const [hoiLamLai, setHoiLamLai] = useState(false);
  const [nhap, setNhap] = useState('');
  const dongRef = useRef({});
  const coCam = typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;
  const cham = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

  const so = (bc) => dem.current[bc] || 0;
  const luu = () => { try { localStorage.setItem(KHOA(ct.name), JSON.stringify({ luc: Date.now(), dem: dem.current })); } catch { /* bỏ qua */ } };
  const cuonToi = (bc) => requestAnimationFrame(() => dongRef.current[bc]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  const dat = (bc, n, loai, cuon) => {
    dem.current = { ...dem.current, [bc]: n }; luu(); ve();
    setCuoi({ bc, loai, k: Date.now() });
    if (cuon) cuonToi(bc);
  };

  // Bắn / gõ 1 mã: +1 cái của mã đó
  const quet = (ma) => {
    const k = tim.get(chuan(ma));
    if (!k) { setCuoi({ loai: 'la', ma: String(ma).trim().slice(0, 40), k: Date.now() }); keu('loi'); return; }
    setDaQuet(true);
    const d = theoBc.get(k); const cur = so(k);
    if (cur >= d.con) { setCuoi({ bc: k, loai: 'thua', k: Date.now() }); keu('loi'); cuonToi(k); return; }
    const n = cur + 1;
    dat(k, n, n >= d.con ? 'du' : 'ok', true);
    keu(n >= d.con ? 'du' : 'ok');
  };
  const quetRef = useRef(quet); quetRef.current = quet;

  const tick = (d) => {
    if (so(d.barcode) >= d.con) { dat(d.barcode, 0, 'bo'); keu('ok'); }
    else { dat(d.barcode, d.con, 'du'); keu('du'); }
  };
  const cong = (d, x) => {
    const n = Math.min(Math.max(so(d.barcode) + x, 0), d.con);
    if (n === so(d.barcode)) { if (x > 0) { setCuoi({ bc: d.barcode, loai: 'thua', k: Date.now() }); keu('loi'); } return; }
    dat(d.barcode, n, n >= d.con ? 'du' : 'ok'); keu(n >= d.con && x > 0 ? 'du' : 'ok');
  };
  const duTatCa = () => {
    dem.current = Object.fromEntries(ds.map((d) => [d.barcode, d.con])); luu(); ve();
    setCuoi({ loai: 'tat_ca', k: Date.now() }); keu('du');
  };
  const lamLai = () => {
    dem.current = Object.fromEntries(ds.map((d) => [d.barcode, 0])); luu(); ve();
    setCuoi(null); setHoiLamLai(false); setDaQuet(false);
  };

  // Súng quét (gõ phím rất nhanh + Enter) — bắt cả khi không đứng ở ô nhập, để bắn liên tục không bị gián đoạn
  useEffect(() => {
    if (buoc !== 'kiem') return undefined;
    let buf = ''; let t = 0;
    const h = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const now = Date.now();
      if (now - t > 80) buf = '';
      t = now;
      if (e.key === 'Enter') { if (buf.length >= 3) { e.preventDefault(); quetRef.current(buf); } buf = ''; return; }
      if (e.key.length === 1) buf += e.key;
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [buoc]);
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape' && !dang) { if (cam) setCam(false); else if (buoc === 'xac_nhan') setBuoc('kiem'); else onDong(); } };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [cam, buoc, dang, onDong]);
  // khoá cuộn trang phía sau
  useEffect(() => { const c = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = c; }; }, []);

  const tong = ds.reduce((a, d) => a + so(d.barcode), 0);
  const soDu = ds.filter((d) => so(d.barcode) >= d.con).length;
  const thieu = ds.filter((d) => so(d.barcode) < d.con);
  const pt = tongCon ? Math.floor((tong * 100) / tongCon) : 0;
  const dem3 = { tat: ds.length, chua: ds.length - soDu, du: soDu };
  const hien = loc === 'chua' ? ds.filter((d) => so(d.barcode) < d.con) : loc === 'du' ? ds.filter((d) => so(d.barcode) >= d.con) : ds;

  const moXacNhan = () => { setDaToi((x) => x || daQuet); setLoi(''); setBuoc('xac_nhan'); };
  const gui = async () => {
    if (dang || tong <= 0 || !daToi || (thieu.length && ghi.trim().length < 3)) return;
    setDang(true); setLoi('');
    const r = await nhanOdoo({ token: user.token, name: ct.name, ghiChu: ghi.trim(), dong: ds.map((d) => ({ barcode: d.barcode, so_luong: so(d.barcode) })) });
    setDang(false);
    if (r?.ok) {
      try { localStorage.removeItem(KHOA(ct.name)); } catch { /* bỏ qua */ }
      baoToast(`Odoo đã nhận ${fmt(r.tong ?? tong)} cái — phiếu ${ct.name}${r.thong_bao ? ' · ' + r.thong_bao : ''}`);
      onXong(); return;
    }
    setLoi(r?.loi || 'Odoo chưa nhận phiếu này');
  };

  // Thẻ "vừa kiểm"
  const dc = cuoi?.bc ? theoBc.get(cuoi.bc) : null;
  const nc = dc ? so(dc.barcode) : 0;
  const the = !cuoi ? (
    <div className="kn-vua trong" key="trong">
      <i className="kn-vua-ic" aria-hidden="true"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><path d="M7 8v8M10 8v8M13 8v8M16 8v8" /></svg></i>
      <div><b>{tiepTuc ? 'Đang kiểm tiếp lần trước' : 'Sẵn sàng kiểm'}</b>
        <span>{cham ? 'Bấm ✓ từng mã khi đã đủ, hoặc quét bằng súng / camera.' : 'Bắn mã vạch liên tục — mỗi lần bắn +1 cái. Hoặc bấm ✓ từng mã.'}</span></div>
    </div>
  ) : cuoi.loai === 'la' ? (
    <div className="kn-vua loi" key={cuoi.k}>
      <i className="kn-vua-ic"><IcAlert /></i>
      <div><b>Mã {cuoi.ma} không có trong phiếu</b><span>Để riêng cái này ra — có thể kho gửi nhầm mã.</span></div>
    </div>
  ) : cuoi.loai === 'tat_ca' ? (
    <div className="kn-vua du" key={cuoi.k}>
      <i className="kn-vua-ic"><IcCheck /></i>
      <div><b>Đã đánh dấu đủ cả phiếu</b><span>{fmt(tongCon)} cái · {ds.length} mã</span></div>
    </div>
  ) : dc ? (
    <div className={'kn-vua ' + (cuoi.loai === 'thua' ? 'loi' : nc >= dc.con ? 'du' : cuoi.loai === 'bo' ? 'bo' : 'ok')} key={cuoi.k}>
      <Anh url={dc.hinh} ma={dc.ma} co={cham ? 64 : 92} />
      <div className="kn-vua-tt">
        <b>{dc.ma}</b><span>{dc.ten || dc.barcode}</span>
        <em>{cuoi.loai === 'thua' ? `Đã đủ ${fmt(dc.con)} — cái này THỪA, để riêng ra`
          : nc >= dc.con ? 'Đủ số kho đã xuất' : cuoi.loai === 'bo' ? 'Đã bỏ tick' : `Còn thiếu ${fmt(dc.con - nc)} cái`}</em>
      </div>
      <div className="kn-vua-so"><b>{fmt(nc)}</b><span>/ {fmt(dc.con)}</span></div>
    </div>
  ) : null;

  return (
    <div className="kn" role="dialog" aria-label={'Kiểm nhận hàng ' + ct.name}>
      <header className="kn-dau">
        <div className="kn-dau-tt">
          <small>Kiểm nhận hàng</small>
          <h2>{ct.name}</h2>
          <p>{ct.kho_cung_ung} → <b>{ct.kho_yeu_cau}</b>{ct.ten_yeu_cau ? ' · ' + ct.ten_yeu_cau : ''}</p>
        </div>
        <Vong pt={pt} tong={tong} tongCon={tongCon} nho={cham} />
        <button type="button" className="kn-x" onClick={onDong} disabled={dang} aria-label="Đóng">×</button>
      </header>

      {buoc === 'kiem' ? (
        <div className="kn-than">
          <aside className="kn-trai">
            <div className="kn-tong">
              <div><b>{fmt(tong)}</b><span>/ {fmt(tongCon)} cái</span></div>
              <div><b>{soDu}</b><span>/ {ds.length} mã đủ</span></div>
              <div className={thieu.length ? 'thieu' : 'du'}><b>{fmt(tongCon - tong)}</b><span>cái còn thiếu</span></div>
            </div>
            <div className="kn-thanh" aria-hidden="true"><i style={{ width: pt + '%' }} /></div>
            {the}
            <form className="kn-quet" onSubmit={(e) => { e.preventDefault(); if (nhap.trim()) { quet(nhap); setNhap(''); } }}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6v12M8 6v12M11 6v12M15 6v12M18 6v12M21 6v12" /></svg>
              <input value={nhap} onChange={(e) => setNhap(e.target.value)} autoFocus={!cham} placeholder="Bắn mã vạch hoặc gõ mã rồi Enter"
                autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="done" aria-label="Ô bắn mã vạch" />
              {coCam && <button type="button" className={'kn-cam-nut' + (cam ? ' on' : '')} onClick={() => setCam((x) => !x)}>{cam ? 'Tắt camera' : 'Camera'}</button>}
            </form>
            {cam && <Camera onMa={quet} onDong={() => setCam(false)} />}
          </aside>

          <section className="kn-ds">
            <div className="kn-loc">
              {LOC.map(([k, t]) => <button key={k} type="button" className={loc === k ? 'on' : ''} onClick={() => setLoc(k)}>{t}<i>{dem3[k]}</i></button>)}
              <span className="kn-loc-phai">
                {hoiLamLai ? <><button type="button" className="kn-lam-lai do" onClick={lamLai}>Xoá hết số đã kiểm</button>
                  <button type="button" className="kn-lam-lai" onClick={() => setHoiLamLai(false)}>Thôi</button></>
                  : tong > 0 && <button type="button" className="kn-lam-lai" onClick={() => setHoiLamLai(true)}>Kiểm lại từ đầu</button>}
              </span>
            </div>
            <div className="kn-dong-ds">
              {hien.map((d) => {
                const n = so(d.barcode); const du = n >= d.con;
                return (
                  <div key={d.barcode} ref={(el) => { dongRef.current[d.barcode] = el; }}
                    className={'kn-dong' + (du ? ' du' : n > 0 ? ' mot' : '') + (cuoi?.bc === d.barcode ? ' vua' : '')}>
                    <Anh url={d.hinh} ma={d.ma} co={46} />
                    <div className="kn-dong-tt">
                      <b>{d.ma}</b><span>{d.ten || d.barcode}</span>
                      <i className="kn-dong-thanh"><em style={{ width: Math.min(100, (n * 100) / d.con) + '%' }} /></i>
                    </div>
                    <div className="kn-dem">
                      <button type="button" onClick={() => cong(d, -1)} disabled={n <= 0} aria-label={'Bớt 1 ' + d.ma}>−</button>
                      <span><b>{fmt(n)}</b>/{fmt(d.con)}</span>
                      <button type="button" onClick={() => cong(d, 1)} aria-label={'Thêm 1 ' + d.ma}>+</button>
                    </div>
                    <button type="button" className={'kn-tick' + (du ? ' on' : '')} onClick={() => tick(d)}
                      aria-pressed={du} aria-label={(du ? 'Bỏ tick ' : 'Tick đủ ') + d.ma}><IcCheck /></button>
                  </div>
                );
              })}
              {hien.length === 0 && <p className="kn-trong">{loc === 'chua' ? 'Mọi mã đã đủ — bấm Xác nhận.' : 'Chưa có mã nào đủ.'}</p>}
            </div>
          </section>

          <footer className="kn-chan">
            <button type="button" className="kn-nut-phu" onClick={duTatCa} disabled={soDu === ds.length}>Nhận đủ cả phiếu</button>
            <button type="button" className="btn btn-ai odn-nut-chinh kn-nut-chinh" disabled={tong <= 0} onClick={moXacNhan}>
              Xác nhận · {fmt(tong)}/{fmt(tongCon)} cái</button>
          </footer>
        </div>
      ) : (
        <div className="kn-xn">
          <div className="kn-xn-hop">
            <div className={'kn-xn-dau' + (thieu.length ? ' thieu' : ' du')}>
              <Vong pt={pt} tong={tong} tongCon={tongCon} />
              <div><b>{thieu.length ? `Nhận ${fmt(tong)} / ${fmt(tongCon)} cái` : `Nhận đủ ${fmt(tong)} cái`}</b>
                <span>{soDu}/{ds.length} mã đủ{thieu.length ? ` · ${thieu.length} mã thiếu sẽ báo về Quản trị / Điều phối` : ''}</span>
                {thieu.length ? <i className="kn-xn-chip"><IcAlert /> Thiếu {fmt(tongCon - tong)} cái</i>
                  : <i className="kn-xn-chip du"><IcCheck /> Đủ cả phiếu</i>}</div>
            </div>
            {thieu.length > 0 && (
              <div className="kn-xn-thieu">
                {thieu.map((d) => (
                  <div key={d.barcode}><Anh url={d.hinh} ma={d.ma} co={34} /><b>{d.ma}</b><span>nhận {fmt(so(d.barcode))} / {fmt(d.con)}</span><em>thiếu {fmt(d.con - so(d.barcode))}</em></div>
                ))}
              </div>)}
            {thieu.length > 0 && (
              <textarea value={ghi} onChange={(e) => setGhi(e.target.value)} rows={2} maxLength={300} disabled={dang}
                placeholder="Lý do thiếu (bắt buộc) — vd: thùng thiếu 2 cái, 1 cái lỗi…" />)}
            {vd.so > 0 && !vd.toi && <div className="odn-bao do"><IcAlert /><div><b>GHTK chưa báo đang giao / đã giao</b>
              GHTK báo "{vd.tt || 'chưa giao'}". Chỉ nhận thay khi chắc chắn hàng đã tới cửa hàng.</div></div>}
            <label className={'nh-toi' + (daToi ? ' on' : '')}>
              <input type="checkbox" checked={daToi} disabled={dang} onChange={(e) => setDaToi(e.target.checked)} />
              <span><b>Hàng đã về tới cửa hàng</b> và tôi đã kiểm thực tế từng mã{vd.so === 0 ? ' (phiếu không có vận đơn GHTK để đối chiếu)' : ''}</span>
            </label>
            <p className="kn-xn-ghi">Bấm gửi là <b>nhập kho thẳng trên Odoo</b> — không sửa lại được từ app.</p>
            {loi && <div className="odn-bao do"><IcAlert /><div>{loi}</div></div>}
            <div className="kn-xn-nut">
              <button type="button" className="kn-nut-phu" disabled={dang} onClick={() => setBuoc('kiem')}>← Kiểm tiếp</button>
              <button type="button" className={'btn btn-ai odn-nut-chinh kn-nut-chinh' + (dang ? ' dang-chay' : '')}
                disabled={dang || tong <= 0 || !daToi || (thieu.length > 0 && ghi.trim().length < 3)} onClick={gui}>
                {dang ? 'Đang gửi Odoo…' : `Gửi Odoo · nhận ${fmt(tong)} cái`}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
