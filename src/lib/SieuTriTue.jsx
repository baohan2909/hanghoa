// ============================================================================
// NEW - 3.127 SIÊU TRÍ TUỆ — trợ lý AI điều hành, có ở MỌI tab
//   PC: tay nắm dọc mép phải -> ngăn kéo 440px (mở rộng 70%) · Điện thoại: nút góc trên -> toàn màn hình
//   Giao việc bằng chữ hoặc giọng nói -> tiến độ % + bước đang làm (luồng NDJSON từ máy chủ)
//   -> công cụ màn hình chạy bằng engine sẵn có (sttCau.js) -> thẻ kết quả + phiếu chờ duyệt
//   -> Duyệt & thực hiện (chỉ lúc này mới ghi) · Lịch sử: mọi việc, từng bước, thao tác đã thực hiện · Cài đặt (Quản trị)
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IcBrain, IcCheck, IcAlert, IcClock, IcGear, IcMoRong, IcThuNho, IcRefresh, IcSpark, IcBox } from './icons.jsx';
import { Sel } from './ui.jsx';
import { layCau, choCau, datMo } from './sttCau.js';
import { goiLuong, goiJson, aiQuyen, aiLichSu, aiViecCt, aiPhienTin, aiDuyet, aiXong, aiHuy, aiCauHinh, aiCauHinhLuu, aiLuuKhoa } from './sttApi.js';

const fmt = (n) => (n == null || n === '' ? '—' : Number(n).toLocaleString('vi'));
const giay = (ms) => (ms == null ? '' : ms < 1000 ? `${Math.max(1, Math.round(ms / 10) * 10)}ms` : `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`);
const gioPhut = (t) => { if (!t) return ''; const d = new Date(t); return d.toLocaleTimeString('vi', { hour: '2-digit', minute: '2-digit' }); };
const ngayGio = (t) => { if (!t) return ''; const d = new Date(t); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${gioPhut(t)}`; };
const lsG = (k, d) => { try { const v = localStorage.getItem('stt_' + k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsS = (k, v) => { try { if (v == null) localStorage.removeItem('stt_' + k); else localStorage.setItem('stt_' + k, JSON.stringify(v)); } catch { /* */ } };
const TT_VIEC = { dang_chay: 'Đang chạy', cho_man: 'Đang thao tác màn hình', xong: 'Xong', loi: 'Lỗi', dung: 'Đã dừng', dang: 'Đang chạy' };
const TT_PHIEU = { cho_duyet: 'Chờ duyệt', dang_chay: 'Đang thực hiện', da_chay: 'Đã thực hiện', loi: 'Thực hiện lỗi', huy: 'Đã huỷ' };
const NOI = { ai: 'AI', may_chu: 'Máy chủ', man_hinh: 'Màn hình' };
const GOI_Y = [
  'Chia đội 1 tầm 3–5 thùng, chia đủ 15 ngày, tổng tồn sau chia không quá 500',
  'Tình hình đội 3 thế nào? Mã nào sắp hết?',
  'Top 10 cửa hàng bán nhiều nhất tuần này, kèm tồn hiện tại',
  'Cửa hàng Nguyễn Trãi 5 còn phiếu nào chưa nhận?',
];

// chữ trả lời: "- " -> gạch đầu dòng, **đậm**
function Chu({ text }) {
  const dong = String(text || '').split('\n');
  const inl = (s, k) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <b key={k + '-' + i}>{p.slice(2, -2)}</b> : p));
  const out = []; let ds = [];
  const day = () => { if (ds.length) { out.push(<ul key={'u' + out.length}>{ds}</ul>); ds = []; } };
  dong.forEach((d, i) => {
    const m = /^\s*[-•*]\s+(.*)$/.exec(d);
    if (m) { ds.push(<li key={i}>{inl(m[1], i)}</li>); return; }
    day();
    if (d.trim()) out.push(<p key={i}>{inl(d, i)}</p>);
  });
  day();
  return <div className="stt-chu">{out}</div>;
}

// thanh tiến độ: nhích dần từ pt tới pt_toi trong lúc chờ, không bao giờ vượt pt_toi
function ThanhTienDo({ pt, ptToi, dang }) {
  const [hien, setHien] = useState(pt || 0);
  const ref = useRef({ pt, ptToi });
  ref.current = { pt, ptToi };
  useEffect(() => { setHien((h) => Math.max(h, pt || 0)); }, [pt]);
  useEffect(() => {
    if (!dang) { setHien(pt || 0); return undefined; }
    const h = setInterval(() => setHien((v) => {
      const { pt: a, ptToi: b } = ref.current;
      const tran = Math.max(a || 0, (b ?? a ?? 0) - 0.6);
      if (v >= tran) return Math.max(v, a || 0);
      return Math.min(tran, Math.max(v, a || 0) + Math.max(0.12, (tran - v) * 0.045));
    }), 200);
    return () => clearInterval(h);
  }, [dang, pt]);
  const v = Math.max(0, Math.min(100, dang ? hien : pt || 0));
  return (
    <div className="stt-td" role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <b className="stt-td-so">{Math.floor(v)}<small>%</small></b>
      <div className="stt-td-ray"><i style={{ width: v + '%' }} /></div>
    </div>
  );
}

function DongBuoc({ b }) {
  return (
    <li className={'stt-b ' + (b.trang_thai || 'dang') + ' n-' + (b.noi || 'ai')}>
      <span className="stt-b-ic">{b.trang_thai === 'xong' ? <IcCheck /> : b.trang_thai === 'loi' ? <IcAlert /> : <i className="stt-quay" />}</span>
      <span className="stt-b-txt">{b.nhan}{b.loi && <em> — {b.loi}</em>}</span>
      <span className="stt-b-noi">{NOI[b.noi] || ''}{b.ms != null && b.trang_thai !== 'dang' ? ' · ' + giay(b.ms) : ''}</span>
      {b.con?.length > 0 && <ul className="stt-b-con">{b.con.map((c, i) => <DongBuoc key={i} b={c} />)}</ul>}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Thẻ phương án chia đội (xem trước + Duyệt & thực hiện)
// ---------------------------------------------------------------------------
function TheChiaDoi({ the, tt, onDuyet, onHuy, onXem, gon }) {
  const [moTop, setMoTop] = useState(false);
  if (!the) return null;
  const trang = tt?.trang || (the.thao_tac_id ? 'cho_duyet' : 'khong');
  const nd = (v) => (v == null ? '—' : v > 365 ? '>1 năm' : String(v).replace('.', ','));
  return (
    <div className={'stt-the t-' + trang}>
      <div className="stt-the-dau">
        <div><small>Phương án chia</small><b>{the.ten_doi || the.doi}</b></div>
        <span className={'stt-chip c-' + trang}>{trang === 'khong' ? 'Chưa tạo phiếu' : TT_PHIEU[trang] || trang}</span>
      </div>
      <div className="stt-the-so">
        <div><small>Tồn hàng sale</small><b>{fmt(the.truoc?.ton)}<i>→</i>{fmt(the.sau?.ton)}</b></div>
        <div><small>Đủ bán (ngày)</small><b>{nd(the.truoc?.du_ngay)}<i>→</i>{nd(the.sau?.du_ngay)}</b></div>
        <div className="rong"><small>Giao lần này</small><b>{fmt(the.chia?.tong)} cái</b>
          <span>sale {fmt(the.chia?.sale)} · phụ kiện {fmt(the.chia?.phu_kien)} · thùng {fmt(the.chia?.thung)} · {fmt(the.chia?.so_ma)} mã</span></div>
      </div>
      {the.thung?.length > 0 && (
        <div className="stt-the-hang"><small>Thùng ({the.thung.length})</small>
          <div className="stt-the-chips">{the.thung.map((t) => (
            <span key={t.ma} className={'stt-thung' + (t.loi ? ' loi' : '')} title={t.loi || ''}><IcBox />{t.ma}{t.n ? <em>{t.n} cái</em> : null}{t.diem != null ? <em>{t.diem}đ</em> : null}</span>
          ))}</div>
          {the.ghep && <p className="stt-nho">Công thức Gợi ý thùng: lấp {fmt(the.ghep.lap)}/{fmt(the.ghep.cai)} cái nhu cầu{the.ghep.noi ? ` · ${the.ghep.noi} thùng nới ngưỡng` : ''}</p>}
        </div>
      )}
      {the.rang_buoc?.length > 0 && (
        <div className="stt-the-hang"><small>Yêu cầu đã áp</small>
          <div className="stt-the-chips">{the.rang_buoc.map((r) => <span key={r} className="stt-rb">{r}</span>)}</div></div>
      )}
      {the.ghi?.length > 0 && <ul className="stt-the-ghi">{the.ghi.map((g, i) => <li key={i}>{g}</li>)}</ul>}
      {(the.canh?.length > 0 || the.kiem_tra?.thu_hoi_rut?.length > 0) && (
        <ul className="stt-the-canh">
          {(the.canh || []).map((c, i) => <li key={'c' + i}><IcAlert />{c}</li>)}
          {(the.kiem_tra?.thu_hoi_rut || []).map((c, i) => <li key={'r' + i}><IcAlert />Rút mã thu hồi khỏi thùng — {c}</li>)}
        </ul>
      )}
      {the.kiem_tra && <p className="stt-nho">Kiểm tra: {the.kiem_tra.vuot_kho ? `${the.kiem_tra.vuot_kho} mã vượt kho` : 'không vượt kho'} · {fmt(the.kiem_tra.dong_can_xem)} dòng cần xem trên bàn chia</p>}
      {the.top?.length > 0 && (
        <div className="stt-the-top">
          <button className="stt-lk" onClick={() => setMoTop((v) => !v)}>{moTop ? 'Ẩn' : 'Xem'} mã chia thêm nhiều nhất</button>
          {moTop && <table><tbody>{the.top.map(([m, s, n]) => <tr key={m}><td>{m}</td><td>{s}</td><td>{n == null ? '—' : String(n).replace('.', ',') + ' ngày'}</td></tr>)}</tbody></table>}
        </div>
      )}
      {tt?.loi && <p className="stt-the-loi"><IcAlert />{tt.loi}</p>}
      {tt?.ket_qua?.ok && <p className="stt-the-ok"><IcCheck />Đã xác nhận {tt.ket_qua.phieu || ''}: {fmt(tt.ket_qua.sl)} cái{tt.ket_qua.odoo ? ' · đang gửi đơn Odoo' : ''} · file tải lại ở tab Phiếu đã chia</p>}
      {tt?.buoc && trang === 'dang_chay' && <p className="stt-nho"><i className="stt-quay" /> {tt.buoc}</p>}
      <div className={'stt-the-nut' + (gon ? ' gon' : '')}>
        {trang === 'cho_duyet' && <button className="btn btn-ai" onClick={onDuyet}><IcCheck /> Duyệt & thực hiện</button>}
        <button className="btn btn-ghost" onClick={onXem}>Xem trên màn</button>
        {trang === 'cho_duyet' && <button className="btn btn-ghost stt-huy" onClick={onHuy}>Huỷ phiếu</button>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Một lượt AI trong khung trò chuyện
// ---------------------------------------------------------------------------
function LuotAI({ m, onDung, onDuyet, onHuy, onXem, onCt }) {
  const dang = m.trang_thai === 'dang';
  const [moBuoc, setMoBuoc] = useState(false);
  const [dem, setDem] = useState(0);
  useEffect(() => {
    if (!dang) return undefined;
    const h = setInterval(() => setDem(Date.now() - (m.bat_dau || Date.now())), 500);
    return () => clearInterval(h);
  }, [dang, m.bat_dau]);
  const hienBuoc = dang || moBuoc;
  return (
    <div className={'stt-luot ' + m.trang_thai}>
      <div className="stt-ava"><IcBrain /></div>
      <div className="stt-luot-than">
        {(dang || (m.buoc?.length > 0 && m.trang_thai !== 'xong')) && (
          <div className="stt-tien">
            <ThanhTienDo pt={m.pt} ptToi={m.ptToi} dang={dang} />
            <div className="stt-buoc-hien">{dang ? m.buoc_hien || 'Đang xử lý' : m.trang_thai === 'loi' ? 'Dừng vì lỗi' : 'Đã dừng'}</div>
          </div>
        )}
        {m.ke_hoach && <p className="stt-kh"><IcSpark />{m.ke_hoach}</p>}
        {m.buoc?.length > 0 && (
          <>
            {!dang && <button className="stt-lk" onClick={() => setMoBuoc((v) => !v)}>{moBuoc ? 'Ẩn' : 'Xem'} {m.buoc.length} bước đã làm</button>}
            {hienBuoc && <ul className="stt-bds">{m.buoc.map((b) => <DongBuoc key={b.stt} b={b} />)}</ul>}
          </>
        )}
        {dang && <div className="stt-dang-chan"><span><IcClock /> {giay(dem)}</span><button className="stt-lk" onClick={onDung}>Dừng</button></div>}
        {m.trang_thai === 'loi' && <p className="stt-loi"><IcAlert />{m.loi}</p>}
        {m.trang_thai === 'dung' && <p className="stt-nho">Đã dừng theo yêu cầu.</p>}
        {m.tra_loi && <Chu text={m.tra_loi} />}
        {m.the?.loai === 'chia_doi' && <TheChiaDoi the={m.the} tt={m.tt} onDuyet={onDuyet} onHuy={onHuy} onXem={onXem} />}
        {!dang && m.viec_id && (
          <div className="stt-luot-chan">
            {m.ket_thuc && m.bat_dau && <span>{giay(m.ket_thuc - m.bat_dau)}</span>}
            {m.token && (m.token.vao + m.token.ra) > 0 && <span>{fmt(m.token.vao + m.token.ra)} token</span>}
            <button className="stt-lk" onClick={onCt}>Chi tiết</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HOST
// ---------------------------------------------------------------------------
export function SieuTriTueHost({ user, tab, chonTab, tabsDuoc, baoToast }) {
  const token = user?.token;
  const [quyen, setQuyen] = useState(null);
  const [mo, setMo] = useState(false);
  const [rong, setRong] = useState(() => lsG('rong', false));
  const [view, setView] = useState('chat');   // chat | ls | ct | cai
  const [tin, setTin] = useState([]);
  const [phien, setPhien] = useState(() => lsG('phien:' + (user?.ma_dang_nhap || ''), null));
  const [nhap, setNhap] = useState('');
  const [nghe, setNghe] = useState(false);
  const [ctId, setCtId] = useState(null);
  const acRef = useRef(null);
  const phienRef = useRef(phien); phienRef.current = phien;
  const phuongAn = useRef(lsG('pa', null));
  const khungRef = useRef(null);
  const oNhap = useRef(null);
  const daNapPhien = useRef(false);
  const dangChay = tin.some((m) => m.vai === 'ai' && m.trang_thai === 'dang');
  const jobDang = [...tin].reverse().find((m) => m.vai === 'ai' && m.trang_thai === 'dang');

  useEffect(() => { if (token) aiQuyen(token).then(setQuyen, () => setQuyen(null)); }, [token]);
  useEffect(() => { lsS('phien:' + (user?.ma_dang_nhap || ''), phien); }, [phien, user?.ma_dang_nhap]);
  useEffect(() => { lsS('rong', rong); }, [rong]);

  // mở lần đầu: nạp lại cuộc trò chuyện đang dở
  useEffect(() => {
    if (!mo || daNapPhien.current || !phien || !token) return;
    daNapPhien.current = true;
    aiPhienTin(token, phien).then((ds) => {
      if (!Array.isArray(ds) || !ds.length) return;
      setTin((cu) => (cu.length ? cu : ds.map((x) => (x.vai === 'nguoi'
        ? { id: 'n' + x.id, vai: 'nguoi', text: x.noi_dung }
        : { id: 'a' + x.id, vai: 'ai', trang_thai: 'xong', tra_loi: x.noi_dung, the: x.viec?.the || null, viec_id: x.viec_id, pt: 100,
          bat_dau: x.viec?.bat_dau ? new Date(x.viec.bat_dau).getTime() : null, ket_thuc: x.viec?.ket_thuc ? new Date(x.viec.ket_thuc).getTime() : null,
          token: x.viec ? { vao: x.viec.token_vao || 0, ra: x.viec.token_ra || 0 } : null, buoc: [], canTt: !!x.viec?.the?.thao_tac_id }))));
    }).catch(() => { /* phiên cũ không còn: bỏ qua */ });
  }, [mo, phien, token]);

  // trạng thái phiếu của thẻ nạp lại (duyệt ở máy khác / lần trước)
  useEffect(() => {
    tin.filter((m) => m.canTt && m.viec_id).forEach((m) => {
      capNhat(m.id, { canTt: false });
      aiViecCt(token, m.viec_id).then((ct) => {
        const t = (ct?.thao_tac || []).find((x) => x.id === m.the?.thao_tac_id);
        if (t) capNhat(m.id, { tt: { trang: t.trang_thai, loi: t.loi, ket_qua: t.ket_qua } });
      }).catch(() => {});
    });
  }, [tin]);   // eslint-disable-line

  // cuộn xuống cuối khi có tin mới
  useEffect(() => { const el = khungRef.current; if (el && view === 'chat') el.scrollTop = el.scrollHeight; }, [tin, view, mo]);
  // Esc đóng (PC)
  useEffect(() => {
    if (!mo) return undefined;
    const f = (e) => { if (e.key === 'Escape' && !document.querySelector('.kt-modal')) setMo(false); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [mo]);

  const capNhat = useCallback((id, fn) => setTin((t) => t.map((m) => (m.id === id ? { ...m, ...(typeof fn === 'function' ? fn(m) : fn) } : m))), []);
  const tenTab = useCallback((id) => (tabsDuoc || []).find((t) => t.id === id)?.ten || id, [tabsDuoc]);

  // ----- mở màn (dùng cho công cụ mo_man, chia_doi, Xem trên màn) -----
  const moMan = useCallback(async (t, che) => {
    if (!(tabsDuoc || []).some((x) => x.id === t)) return { ok: false, loi: `Tài khoản không có màn "${t}"` };
    if (tab !== t) chonTab(t);
    if (t === 'doisale') datMo({ man: 'ban', che: che || 'doi' });
    await new Promise((r) => setTimeout(r, 250));
    return { ok: true, tab: t, ten: tenTab(t) };
  }, [tab, chonTab, tabsDuoc, tenTab]);
  const moChiaDoi = useCallback(async () => {
    let c = layCau('chia_doi');
    if (!c) { const r = await moMan('doisale', 'doi'); if (!r.ok) return null; c = await choCau('chia_doi', 15000); }
    return c;
  }, [moMan]);
  const laDt = () => window.matchMedia('(max-width: 900px)').matches;

  const nguCanh = () => {
    const c = layCau('chia_doi');
    return { tab, ten_man: tenTab(tab), ...(c ? { chia_tung_doi: c.nguCanh() } : {}),
      ...(phuongAn.current ? { phuong_an_gan_nhat: phuongAn.current } : {}) };
  };

  // ----- chạy công cụ màn hình -----
  const chayCongCu = async (g, jobId, ptTu, ptDen, viecId) => {
    const stt = 'c-' + g.id;
    const buocCon = [];
    const datBuoc = (patch) => capNhat(jobId, (m) => ({ buoc: (m.buoc || []).map((b) => (b.stt === stt ? { ...b, ...patch } : b)) }));
    capNhat(jobId, (m) => ({ buoc: [...(m.buoc || []), { stt, noi: 'man_hinh', nhan: g.nhan, trang_thai: 'dang', con: [] }], buoc_hien: g.nhan, pt: ptTu, ptToi: ptTu + 2 }));
    let t0 = performance.now();
    const bao = (f, text) => {
      const pt = Math.round(ptTu + (ptDen - ptTu) * Math.max(0, Math.min(1, f)));
      const now = performance.now();
      if (buocCon.length) { const tr = buocCon[buocCon.length - 1]; tr.trang_thai = 'xong'; tr.ms = Math.round(now - t0); }
      if (text) buocCon.push({ nhan: text, trang_thai: f >= 1 ? 'xong' : 'dang', noi: 'man_hinh' });
      t0 = now;
      capNhat(jobId, { pt, ptToi: Math.min(ptDen, pt + Math.max(3, (ptDen - ptTu) * 0.18)), buoc_hien: text || g.nhan });
      datBuoc({ con: buocCon.map((x) => ({ ...x })) });
    };
    const bd = performance.now();
    let r;
    try {
      if (g.ten === 'mo_man') {
        const x = await moMan(String(g.tham_so?.tab || ''), g.tham_so?.che);
        r = x.ok ? { ket_qua: x, buoc: [{ nhan: 'Mở màn ' + x.ten, ms: 250 }] } : { loi: x.loi };
      } else if (g.ten === 'chia_doi') {
        bao(0.02, 'Mở màn Chia từng đội');
        const c = await moChiaDoi();
        if (!c) r = { loi: 'Không mở được màn Chia từng đội (tài khoản không có màn Đội Sale?)' };
        else {
          r = await c.chuanBi(g.tham_so || {}, bao, { viec_id: viecId });
          phuongAn.current = { ...(g.tham_so || {}) }; lsS('pa', phuongAn.current);
          if (laDt() && r?.the) { /* điện thoại: giữ khung trợ lý, thẻ kết quả có nút Xem trên màn */ }
        }
      } else if (g.ten === 'doc_man') {
        const c = layCau('chia_doi');
        r = c ? c.doc() : { ket_qua: { ok: false, loi: 'Màn Chia từng đội chưa mở — gọi chia_doi hoặc mo_man trước' } };
      } else r = { loi: 'App chưa có công cụ ' + g.ten };
    } catch (e) { r = { loi: 'Lỗi trên màn hình: ' + (e?.message || e) }; }
    const ms = Math.round(performance.now() - bd);
    if (buocCon.length) { const tr = buocCon[buocCon.length - 1]; if (tr.trang_thai === 'dang') { tr.trang_thai = 'xong'; tr.ms = Math.round(performance.now() - t0); } }
    datBuoc({ trang_thai: r?.loi ? 'loi' : 'xong', ms, loi: r?.loi, con: buocCon.map((x) => ({ ...x })) });
    if (r?.the) {
      // phiếu cũ cùng đội còn chờ duyệt -> máy chủ đã huỷ (SQL 215b), thẻ cũ hiện "Đã huỷ"
      if (r.the.thao_tac_id) setTin((t) => t.map((m) => (m.id !== jobId && m.the?.loai === 'chia_doi' && m.the.doi === r.the.doi && m.the.thao_tac_id
        && (m.tt?.trang || 'cho_duyet') === 'cho_duyet' ? { ...m, tt: { trang: 'huy', loi: 'Đã thay bằng phương án mới bên dưới' } } : m)));
      capNhat(jobId, { the: r.the, tt: null });
    }
    return { id: g.id, ten: g.ten, ket_qua: r?.ket_qua, the: r?.the, buoc: r?.buoc, loi: r?.loi };
  };

  // ----- giao việc -----
  const giao = async (text) => {
    const yeuCau = String(text || '').trim();
    if (!yeuCau || dangChay) return;
    setNhap('');
    setView('chat');
    const id = 'j' + Date.now();
    setTin((t) => [...t, { id: 'u' + id, vai: 'nguoi', text: yeuCau }, { id, vai: 'ai', trang_thai: 'dang', pt: 1, ptToi: 4, buoc_hien: 'Gửi yêu cầu', buoc: [], bat_dau: Date.now() }]);
    const ac = new AbortController(); acRef.current = ac;
    let viecId = null;
    const onE = (e) => {
      if (e.t === 'viec') { viecId = e.viec_id; capNhat(id, { viec_id: e.viec_id }); if (e.phien_id && e.phien_id !== phienRef.current) setPhien(e.phien_id); }
      else if (e.t === 'tien_do') capNhat(id, (m) => ({ pt: Math.max(m.pt || 0, e.pt || 0), ptToi: e.pt_toi ?? e.pt, buoc_hien: e.buoc || m.buoc_hien }));
      else if (e.t === 'ke_hoach') capNhat(id, { ke_hoach: e.text });
      else if (e.t === 'buoc') capNhat(id, (m) => {
        const ds = [...(m.buoc || [])]; const i = ds.findIndex((b) => b.stt === e.stt);
        if (i >= 0) ds[i] = { ...ds[i], ...e }; else ds.push(e);
        return { buoc: ds };
      });
      else if (e.t === 'xong') capNhat(id, (m) => ({ trang_thai: 'xong', pt: 100, ptToi: 100, tra_loi: e.tra_loi, the: e.the || m.the, token: e.token, ket_thuc: Date.now() }));
      else if (e.t === 'loi') capNhat(id, { trang_thai: 'loi', loi: e.loi, ket_thuc: Date.now() });
    };
    let res = await goiLuong({ token, hanh_dong: 'chay', yeu_cau: yeuCau, phien_id: phienRef.current, man: tenTab(tab), ngu_canh: nguCanh() }, onE, ac.signal);
    for (let vong = 0; res.client && !ac.signal.aborted && vong < 12; vong++) {
      const ketQua = [];
      for (const g of res.client.goi) {
        if (ac.signal.aborted) break;
        const n = res.client.goi.length, k = ketQua.length;
        const tu = res.client.pt_tu + ((res.client.pt_den - res.client.pt_tu) * k) / n, den = res.client.pt_tu + ((res.client.pt_den - res.client.pt_tu) * (k + 1)) / n;
        ketQua.push(await chayCongCu(g, id, Math.round(tu), Math.round(den), viecId));
      }
      if (ac.signal.aborted) break;
      res = await goiLuong({ token, hanh_dong: 'tiep', viec_id: res.viec_id || viecId, ket_qua: ketQua }, onE, ac.signal);
    }
    if (ac.signal.aborted) capNhat(id, { trang_thai: 'dung', ket_thuc: Date.now() });
    else if (res.loi && !res.xong) capNhat(id, (m) => (m.trang_thai === 'dang' ? { trang_thai: 'loi', loi: res.loi, ket_thuc: Date.now() } : {}));
    acRef.current = null;
  };
  const dung = async (m) => {
    acRef.current?.abort();
    capNhat(m.id, { trang_thai: 'dung', ket_thuc: Date.now() });
    if (m.viec_id) goiJson({ token, hanh_dong: 'dung', viec_id: m.viec_id });
  };

  // ----- duyệt / huỷ phiếu -----
  const duyet = async (m) => {
    const the = m.the; if (!the?.thao_tac_id) return;
    capNhat(m.id, { tt: { trang: 'dang_chay', buoc: 'Khoá phiếu' } });
    let d;
    try { d = await aiDuyet(token, the.thao_tac_id); } catch (e) { capNhat(m.id, { tt: { trang: 'cho_duyet', loi: e.message } }); return; }
    if (!d?.ok) { capNhat(m.id, { tt: { trang: d?.trang_thai || 'cho_duyet', loi: d?.loi } }); return; }
    const c = await moChiaDoi();
    let kq;
    if (!c) kq = { ok: false, loi: 'Không mở được màn Chia từng đội' };
    else {
      try { kq = await c.thucHien({ xem_truoc: the, dau_van: the.dau_van }, (f, text) => capNhat(m.id, { tt: { trang: 'dang_chay', buoc: text } })); }
      catch (e) { kq = { ok: false, loi: 'Lỗi khi thực hiện: ' + (e?.message || e) }; }
    }
    kq = kq || { ok: false, loi: 'Không có kết quả' };
    await aiXong(token, the.thao_tac_id, !!kq.ok, kq, kq.ok ? null : kq.loi).catch(() => {});
    capNhat(m.id, { tt: { trang: kq.ok ? 'da_chay' : 'loi', ket_qua: kq, loi: kq.ok ? null : kq.loi } });
    if (kq.ok) baoToast?.(`SIÊU TRÍ TUỆ: đã xác nhận ${kq.phieu || ''} — ${fmt(kq.sl)} cái`);
  };
  const huy = async (m) => {
    const id = m.the?.thao_tac_id; if (!id) return;
    try { await aiHuy(token, id); capNhat(m.id, { tt: { trang: 'huy' } }); } catch (e) { baoToast?.('Chưa huỷ được: ' + e.message); }
  };
  const xem = async () => { await moChiaDoi(); if (laDt()) setMo(false); };

  // ----- giọng nói (Web Speech, tiếng Việt) -----
  const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
  const ngheRef = useRef(null);
  const batNghe = () => {
    if (!SR) { baoToast?.('Trình duyệt này chưa hỗ trợ nhập giọng nói — dùng Chrome / Edge / Safari mới'); return; }
    if (nghe) { ngheRef.current?.stop(); return; }
    const r = new SR();
    r.lang = 'vi-VN'; r.interimResults = true; r.continuous = false;
    const goc = nhap ? nhap.trim() + ' ' : '';
    r.onresult = (ev) => { let s = ''; for (let i = 0; i < ev.results.length; i++) s += ev.results[i][0].transcript; setNhap(goc + s); };
    r.onerror = (ev) => { setNghe(false); if (ev.error === 'not-allowed') baoToast?.('Chưa cho phép dùng micro — bật quyền micro cho trang này'); };
    r.onend = () => { setNghe(false); setTimeout(() => oNhap.current?.focus(), 50); };
    ngheRef.current = r;
    try { r.start(); setNghe(true); } catch { setNghe(false); }
  };

  const cuocMoi = () => { if (dangChay) return; setTin([]); setPhien(null); phuongAn.current = null; lsS('pa', null); daNapPhien.current = true; setView('chat'); };

  if (!quyen || (!quyen.ok && !quyen.admin)) return null;
  const choDung = !quyen.ok;   // Quản trị khi AI tắt: vẫn vào được Cài đặt

  return (
    <>
      {!mo && (
        <button className={'stt-tay' + (jobDang ? ' chay' : '')} onClick={() => setMo(true)} aria-label="Mở SIÊU TRÍ TUỆ" title="SIÊU TRÍ TUỆ — giao việc bằng chữ hoặc giọng nói">
          <IcBrain />
          <span className="stt-tay-chu">{jobDang ? `${Math.floor(jobDang.pt || 0)}%` : 'SIÊU TRÍ TUỆ'}</span>
          {jobDang && <i className="stt-tay-ray" style={{ height: (jobDang.pt || 0) + '%' }} />}
        </button>
      )}
      {mo && (
        <div className={'stt-ngan' + (rong ? ' rong' : '')} role="dialog" aria-label="SIÊU TRÍ TUỆ">
          <header className="stt-dau">
            <div className="stt-dau-ten">
              <span className="stt-logo"><IcBrain /></span>
              <div><b>SIÊU TRÍ TUỆ</b><small>{view === 'ls' ? 'Lịch sử giao việc' : view === 'ct' ? 'Chi tiết việc' : view === 'cai' ? 'Cài đặt' : `Đang ở: ${tenTab(tab)}`}</small></div>
            </div>
            <div className="stt-dau-nut">
              {view !== 'chat' && <button onClick={() => setView('chat')} title="Về trò chuyện">Trò chuyện</button>}
              {view === 'chat' && tin.length > 0 && !dangChay && <button onClick={cuocMoi} title="Bắt đầu cuộc trò chuyện mới"><IcSpark /><span>Mới</span></button>}
              {view === 'chat' && <button onClick={() => setView('ls')} title="Lịch sử"><IcClock /><span>Lịch sử</span></button>}
              {quyen.admin && view !== 'cai' && <button onClick={() => setView('cai')} title="Cài đặt"><IcGear /></button>}
              <button className="stt-an-dt" onClick={() => setRong((v) => !v)} title={rong ? 'Thu hẹp' : 'Mở rộng'}>{rong ? <IcThuNho /> : <IcMoRong />}</button>
              <button onClick={() => setMo(false)} title="Thu nhỏ (việc vẫn chạy)" aria-label="Đóng">×</button>
            </div>
            {jobDang && <i className="stt-dau-ray" style={{ width: (jobDang.pt || 0) + '%' }} />}
          </header>

          {view === 'chat' && (
            <>
              <div className="stt-khung" ref={khungRef}>
                {choDung && <div className="stt-bao"><IcAlert />{quyen.loi || 'SIÊU TRÍ TUỆ đang tắt'} — vào Cài đặt để bật.</div>}
                {quyen.ok && !quyen.co_khoa && <div className="stt-bao"><IcAlert />Chưa có khoá FableAI. {quyen.admin ? 'Vào Cài đặt (bánh răng) để dán khoá.' : 'Nhờ Quản trị dán khoá ở Cài đặt.'}</div>}
                {quyen.dung_khan && <div className="stt-bao do"><IcAlert />Quản trị đang bật DỪNG KHẨN CẤP — AI chỉ chuẩn bị, không thực hiện thao tác ghi.</div>}
                {tin.length === 0 && (
                  <div className="stt-chao">
                    <b>Anh giao việc, em làm trên màn hình rồi báo lại.</b>
                    <p>Hỏi gì về đội, cửa hàng, kho, sản phẩm em cũng tra được. Thao tác chia hàng dùng đúng công thức của app; việc ghi dữ liệu luôn chờ anh bấm Duyệt.</p>
                    <div className="stt-goi-y">{GOI_Y.map((g) => <button key={g} onClick={() => giao(g)} disabled={choDung}>{g}</button>)}</div>
                  </div>
                )}
                {tin.map((m) => (m.vai === 'nguoi'
                  ? <div key={m.id} className="stt-nguoi"><p>{m.text}</p></div>
                  : <LuotAI key={m.id} m={m} onDung={() => dung(m)} onDuyet={() => duyet(m)} onHuy={() => huy(m)} onXem={xem}
                      onCt={() => { setCtId(m.viec_id); setView('ct'); }} />))}
              </div>
              <form className="stt-nhap" onSubmit={(e) => { e.preventDefault(); giao(nhap); }}>
                <textarea ref={oNhap} rows={1} value={nhap} disabled={choDung} placeholder={nghe ? 'Đang nghe… anh nói đi' : 'Giao việc cho SIÊU TRÍ TUỆ…'}
                  onChange={(e) => setNhap(e.target.value)}
                  onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = Math.min(140, e.target.scrollHeight) + 'px'; }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); giao(nhap); } }} />
                <button type="button" className={'stt-mic' + (nghe ? ' on' : '')} onClick={batNghe} disabled={choDung} title={SR ? (nghe ? 'Dừng nghe' : 'Nói yêu cầu') : 'Trình duyệt chưa hỗ trợ giọng nói'} aria-label="Nhập giọng nói">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
                </button>
                <button type="submit" className="stt-gui" disabled={!nhap.trim() || dangChay || choDung} aria-label="Giao việc">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </button>
              </form>
            </>
          )}
          {view === 'ls' && <LichSu token={token} admin={quyen.admin} onMo={(id) => { setCtId(id); setView('ct'); }} />}
          {view === 'ct' && ctId && <ChiTiet token={token} id={ctId} onVe={() => setView('ls')}
            onDuyet={async (t) => { const m = { id: 'ct', the: t.xem_truoc ? { ...t.xem_truoc, thao_tac_id: t.id } : null }; if (m.the) { setView('chat'); const jid = 'd' + Date.now(); setTin((x) => [...x, { id: jid, vai: 'ai', trang_thai: 'xong', tra_loi: 'Duyệt lại phiếu từ Lịch sử:', the: m.the, pt: 100, buoc: [] }]); setTimeout(() => duyet({ id: jid, the: m.the }), 50); } }} />}
          {view === 'cai' && quyen.admin && <CaiDat token={token} onDoi={() => aiQuyen(token).then(setQuyen, () => {})} baoToast={baoToast} />}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// LỊCH SỬ
// ---------------------------------------------------------------------------
function LichSu({ token, admin, onMo }) {
  const [ds, setDs] = useState(null);
  const [tatCa, setTatCa] = useState(false);
  const [loi, setLoi] = useState('');
  const tai = useCallback(() => { setLoi(''); aiLichSu(token, tatCa, 100).then(setDs, (e) => setLoi(e.message)); }, [token, tatCa]);
  useEffect(() => { tai(); }, [tai]);
  return (
    <div className="stt-khung stt-ls">
      <div className="stt-ls-dau">
        {admin && <div className="stt-cong"><button className={!tatCa ? 'on' : ''} onClick={() => setTatCa(false)}>Của tôi</button><button className={tatCa ? 'on' : ''} onClick={() => setTatCa(true)}>Mọi người</button></div>}
        <button className="stt-lk" onClick={tai}><IcRefresh /> Làm mới</button>
      </div>
      {loi && <p className="stt-loi"><IcAlert />{loi}</p>}
      {ds && ds.length === 0 && <p className="stt-trong">Chưa có việc nào. Giao việc đầu tiên ở khung trò chuyện.</p>}
      {(ds || []).map((v) => (
        <button key={v.id} className={'stt-ls-dong t-' + v.trang_thai} onClick={() => onMo(v.id)}>
          <div className="stt-ls-1"><span className={'stt-chip c-' + v.trang_thai}>{TT_VIEC[v.trang_thai] || v.trang_thai}</span><small>{ngayGio(v.bat_dau)}{tatCa ? ' · ' + v.nguoi : ''}</small></div>
          <p>{v.yeu_cau}</p>
          <div className="stt-ls-2">
            <span>{v.so_buoc} bước</span>
            {v.ket_thuc && <span>{giay(new Date(v.ket_thuc) - new Date(v.bat_dau))}</span>}
            {v.token > 0 && <span>{fmt(v.token)} token</span>}
            {(v.thao_tac || []).map((t, i) => <span key={i} className={'stt-chip nho c-' + t.trang_thai}>{TT_PHIEU[t.trang_thai] || t.trang_thai}</span>)}
          </div>
        </button>
      ))}
    </div>
  );
}

function ChiTiet({ token, id, onVe, onDuyet }) {
  const [ct, setCt] = useState(null);
  const [loi, setLoi] = useState('');
  useEffect(() => { aiViecCt(token, id).then(setCt, (e) => setLoi(e.message)); }, [token, id]);
  if (loi) return <div className="stt-khung"><p className="stt-loi"><IcAlert />{loi}</p><button className="stt-lk" onClick={onVe}>← Lịch sử</button></div>;
  if (!ct) return <div className="stt-khung"><p className="stt-trong"><i className="stt-quay" /> Đang tải…</p></div>;
  const v = ct.viec;
  return (
    <div className="stt-khung stt-ct">
      <button className="stt-lk" onClick={onVe}>← Lịch sử</button>
      <div className="stt-ct-dau">
        <span className={'stt-chip c-' + v.trang_thai}>{TT_VIEC[v.trang_thai] || v.trang_thai}</span>
        <small>{ngayGio(v.bat_dau)} · {v.nguoi}{v.man ? ' · ' + v.man : ''}</small>
      </div>
      <div className="stt-nguoi"><p>{v.yeu_cau}</p></div>
      <div className="stt-ct-so">
        <span><b>{v.ket_thuc ? giay(new Date(v.ket_thuc) - new Date(v.bat_dau)) : '—'}</b> thời gian</span>
        <span><b>{fmt(v.so_luot)}</b> lượt AI</span>
        <span><b>{fmt((v.token_vao || 0) + (v.token_ra || 0))}</b> token</span>
        {v.mo_hinh && <span><b>{v.mo_hinh}</b></span>}
      </div>
      <h4>Các bước đã làm</h4>
      <ol className="stt-tl">
        {ct.buoc.map((b) => (
          <li key={b.id} className={'n-' + b.noi + ' ' + (b.trang_thai || '')}>
            <span className="stt-tl-noi">{NOI[b.noi] || b.noi}</span>
            <div><p>{b.nhan}</p><small>{gioPhut(b.luc)}{b.ms != null ? ' · ' + giay(b.ms) : ''}{b.noi === 'may_chu' && b.tham_so?.sql ? ' · ' : ''}</small>
              {b.noi === 'may_chu' && b.tham_so?.sql && <code>{b.tham_so.sql}</code>}
              {b.ket_qua?.loi && <em className="stt-loi-nho">{b.ket_qua.loi}</em>}
            </div>
          </li>
        ))}
        {ct.buoc.length === 0 && <li className="stt-trong">Chưa có bước nào.</li>}
      </ol>
      {ct.thao_tac.length > 0 && (
        <>
          <h4>Thao tác ghi (phiếu duyệt)</h4>
          {ct.thao_tac.map((t) => (
            <div key={t.id} className={'stt-tt t-' + t.trang_thai}>
              <div className="stt-ls-1"><span className={'stt-chip c-' + t.trang_thai}>{TT_PHIEU[t.trang_thai] || t.trang_thai}</span><small>{ngayGio(t.tao_luc)}</small></div>
              <p>{t.mo_ta}</p>
              {t.nguoi_duyet && <small>Duyệt bởi {t.nguoi_duyet} lúc {ngayGio(t.duyet_luc)}</small>}
              {t.ket_qua?.phieu && <small> · Phiếu {t.ket_qua.phieu} · {fmt(t.ket_qua.sl)} cái{t.ket_qua.odoo ? ' · đã mở gửi Odoo' : ''}</small>}
              {t.loi && <em className="stt-loi-nho">{t.loi}</em>}
              {t.trang_thai === 'cho_duyet' && <div className="stt-the-nut"><button className="btn btn-ai" onClick={() => onDuyet(t)}><IcCheck /> Duyệt & thực hiện</button></div>}
            </div>
          ))}
        </>
      )}
      {v.tra_loi && <><h4>Trả lời</h4><Chu text={v.tra_loi} /></>}
      {v.loi && <p className="stt-loi"><IcAlert />{v.loi}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CÀI ĐẶT (Quản trị)
// ---------------------------------------------------------------------------
const VAI = [['ADMIN', 'Quản trị'], ['DIEU_PHOI', 'Điều phối'], ['KHO', 'Kho tổng'], ['CH', 'Cửa hàng']];
function CaiDat({ token, onDoi, baoToast }) {
  const [d, setD] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [khoa, setKhoa] = useState('');
  const [thu, setThu] = useState(null);
  const [dang, setDang] = useState('');
  const [loi, setLoi] = useState('');
  const tai = useCallback(() => aiCauHinh(token).then((x) => { setD(x); setCfg(x.cfg || {}); }, (e) => setLoi(e.message)), [token]);
  useEffect(() => { tai(); }, [tai]);
  const luu = async (patch) => {
    setDang('luu');
    try { const c = await aiCauHinhLuu(token, patch); setCfg(c); onDoi?.(); baoToast?.('Đã lưu cài đặt SIÊU TRÍ TUỆ'); } catch (e) { baoToast?.('Chưa lưu được: ' + e.message); }
    setDang('');
  };
  const luuKhoa = async () => {
    setDang('khoa');
    try { const r = await aiLuuKhoa(token, khoa); setKhoa(''); baoToast?.(`Đã lưu khoá (…${r.khoa_cuoi})`); await tai(); onDoi?.(); } catch (e) { baoToast?.('Chưa lưu khoá: ' + e.message); }
    setDang('');
  };
  const thuNoi = async () => { setDang('thu'); setThu(null); setThu(await goiJson({ token, hanh_dong: 'thu' })); setDang(''); };
  const tongNgay = useMemo(() => {
    const m = {};
    (d?.token || []).forEach((t) => { m[t.ngay] = (m[t.ngay] || 0) + Number(t.vao) + Number(t.ra); });
    return Object.entries(m).slice(0, 7);
  }, [d]);
  if (loi) return <div className="stt-khung"><p className="stt-loi"><IcAlert />{loi}</p></div>;
  if (!cfg) return <div className="stt-khung"><p className="stt-trong"><i className="stt-quay" /> Đang tải…</p></div>;
  const vai = cfg.vai_tro || [];
  return (
    <div className="stt-khung stt-cai">
      <section>
        <h4 className="stt-h-khoa">Khoá FableAI {d?.khoa_cuoi ? <span className="stt-chip c-xong">…{d.khoa_cuoi}</span> : <span className="stt-chip c-loi">chưa có</span>}</h4>
        <div className="stt-hang">
          <input type="password" autoComplete="off" value={khoa} onChange={(e) => setKhoa(e.target.value)} placeholder="Dán khoá mới (sk-…)" />
          <button className="btn btn-ai" disabled={khoa.trim().length < 20 || dang === 'khoa'} onClick={luuKhoa}>{dang === 'khoa' ? 'Đang lưu…' : 'Lưu khoá'}</button>
        </div>
        <button className="btn btn-ghost" onClick={thuNoi} disabled={dang === 'thu' || !d?.khoa_cuoi}><IcSpark /> {dang === 'thu' ? 'Đang thử 2 kiểu API…' : 'Thử kết nối'}</button>
        {thu && (
          <div className="stt-thu">
            {thu.loi && <p className="stt-loi"><IcAlert />{thu.loi}</p>}
            {['anthropic', 'openai'].map((k) => thu[k] && (
              <div key={k} className={'stt-thu-dong ' + (thu[k].ok ? 'ok' : 'hong')}>
                <b>{k === 'anthropic' ? 'Kiểu Anthropic (/v1/messages)' : 'Kiểu OpenAI (/v1/chat/completions)'}</b>
                <span>{thu[k].ok ? `Gọi công cụ được · ${giay(thu[k].ms)}` : thu[k].loi || 'Không gọi công cụ'}</span>
                {thu[k].ok && cfg.kieu !== k && <button className="stt-lk" onClick={() => luu({ kieu: k })}>Dùng kiểu này</button>}
              </div>
            ))}
            {Array.isArray(thu.models) && thu.models.length > 0 && <p className="stt-nho">Mô hình có sẵn: {thu.models.join(', ')}</p>}
            {thu.models?.loi && <p className="stt-nho">Danh sách mô hình: {thu.models.loi}</p>}
          </div>
        )}
      </section>
      <section>
        <h4>Hoạt động</h4>
        <label className="stt-bat"><input type="checkbox" checked={!!cfg.bat} onChange={(e) => luu({ bat: e.target.checked })} /> Bật SIÊU TRÍ TUỆ</label>
        <label className="stt-bat do"><input type="checkbox" checked={!!cfg.dung_khan} onChange={(e) => luu({ dung_khan: e.target.checked })} /> DỪNG KHẨN CẤP — không cho thực hiện thao tác ghi</label>
        <small className="stt-nho">Vai trò được dùng</small>
        <div className="stt-cong">{VAI.map(([k, t]) => (
          <button key={k} className={vai.includes(k) ? 'on' : ''} onClick={() => luu({ vai_tro: vai.includes(k) ? vai.filter((x) => x !== k) : [...vai, k] })}>{t}</button>
        ))}</div>
      </section>
      <section>
        <h4>Kết nối</h4>
        <div className="stt-luoi">
          <label>Kiểu API<Sel value={cfg.kieu || 'anthropic'} onChange={(v) => luu({ kieu: v })} options={[{ value: 'anthropic', label: 'Anthropic (/v1/messages)' }, { value: 'openai', label: 'OpenAI (/v1/chat/completions)' }]} /></label>
          <label>Địa chỉ<OChu gt={cfg.url} onLuu={(v) => luu({ url: v })} /></label>
          <label>Mô hình chính<OChu gt={cfg.mo_hinh} onLuu={(v) => luu({ mo_hinh: v })} /></label>
          <label>Mô hình dự phòng<OChu gt={cfg.mo_hinh_du_phong} onLuu={(v) => luu({ mo_hinh_du_phong: v })} /></label>
          <label>Trần token / người / ngày<OChu so gt={cfg.tran_token_ngay} onLuu={(v) => luu({ tran_token_ngay: Number(v) || 0 })} /></label>
          <label>Số lượt AI tối đa / việc<OChu so gt={cfg.max_vong} onLuu={(v) => luu({ max_vong: Math.max(2, Math.min(15, Number(v) || 8)) })} /></label>
        </div>
      </section>
      <section>
        <h4>Token 7 ngày gần nhất</h4>
        {tongNgay.length === 0 ? <p className="stt-trong">Chưa dùng.</p> : (
          <table className="stt-bang"><tbody>{tongNgay.map(([n, v]) => <tr key={n}><td>{n.slice(8, 10)}/{n.slice(5, 7)}</td><td>{fmt(v)}</td></tr>)}</tbody></table>
        )}
      </section>
    </div>
  );
}
function OChu({ gt, onLuu, so }) {
  const [v, setV] = useState(gt ?? '');
  useEffect(() => { setV(gt ?? ''); }, [gt]);
  return <input inputMode={so ? 'numeric' : undefined} value={v} onChange={(e) => setV(e.target.value)}
    onBlur={() => { if (String(v) !== String(gt ?? '')) onLuu(v); }} onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }} />;
}
