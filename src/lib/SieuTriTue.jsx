// ============================================================================
// NEW - 3.127 SIÊU TRÍ TUỆ — trợ lý AI điều hành, có ở MỌI tab
//   PC: tay nắm dọc mép phải -> ngăn kéo 440px (mở rộng 70%) · Điện thoại: nút góc trên -> toàn màn hình
//   Giao việc bằng chữ hoặc giọng nói -> tiến độ % + bước đang làm (luồng NDJSON từ máy chủ)
//   -> công cụ màn hình chạy bằng engine sẵn có (sttCau.js) -> thẻ kết quả + phiếu chờ duyệt
//   -> Duyệt & thực hiện (chỉ lúc này mới ghi) · Lịch sử: mọi việc, từng bước, thao tác đã thực hiện · Cài đặt (Quản trị)
// ============================================================================
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { IcBrain, IcCheck, IcAlert, IcClock, IcGear, IcMoRong, IcThuNho, IcRefresh, IcSpark, IcBox } from './icons.jsx';
import { Sel } from './ui.jsx';
import { layCau, choCau, datMo } from './sttCau.js';
import { goiLuong, goiJson, aiQuyen, aiLichSu, aiViecCt, aiPhienTin, aiDuyet, aiXong, aiHuy, aiCauHinh, aiCauHinhLuu, aiLuuKhoa, aiDsPhien, aiPhienSua, aiDoiChieu, aiBaoSai, aiDsBaoSai, aiTriThucDs, aiTriThucLuu, aiNguoiDs, aiVanDe, aiHocXem, aiHocCauHinh } from './sttApi.js';
import { useGiong } from './sttGiong.js';   // NEW - 3.129 giọng nói nói dài, bấm nhiều lần

const fmt = (n) => (n == null || n === '' ? '—' : Number(n).toLocaleString('vi'));
const giay = (ms) => (ms == null ? '' : ms < 1000 ? `${Math.max(1, Math.round(ms / 10) * 10)}ms` : `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`);
const gioPhut = (t) => { if (!t) return ''; const d = new Date(t); return d.toLocaleTimeString('vi', { hour: '2-digit', minute: '2-digit' }); };
const ngayGio = (t) => { if (!t) return ''; const d = new Date(t); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${gioPhut(t)}`; };
const laPc = () => typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;   // PC: Enter gửi · điện thoại: Enter xuống dòng
const chepChu = async (t) => {   // NEW - 3.133 chép truy vấn để anh tự chạy đối chiếu
  try { await navigator.clipboard.writeText(t); return true; } catch {
    try { const a = document.createElement('textarea'); a.value = t; a.style.position = 'fixed'; a.style.opacity = '0'; document.body.appendChild(a); a.select(); const ok = document.execCommand('copy'); a.remove(); return ok; } catch { return false; }
  }
};
const demChu = (s) => (String(s || '').trim() ? String(s).trim().split(/\s+/).length : 0);
const lsG = (k, d) => { try { const v = localStorage.getItem('stt_' + k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsS = (k, v) => { try { if (v == null) localStorage.removeItem('stt_' + k); else localStorage.setItem('stt_' + k, JSON.stringify(v)); } catch { /* */ } };
const TT_VIEC = { dang_chay: 'Đang chạy', cho_man: 'Đang thao tác màn hình', xong: 'Xong', loi: 'Lỗi', dung: 'Đã dừng', dang: 'Đang chạy' };
const TT_PHIEU = { cho_duyet: 'Chờ duyệt', dang_chay: 'Đang thực hiện', da_chay: 'Đã thực hiện', loi: 'Thực hiện lỗi', huy: 'Đã huỷ' };
const NOI = { ai: 'AI', may_chu: 'Máy chủ', man_hinh: 'Màn hình' };
// NEW - 3.132 nguồn số liệu của câu trả lời: xanh = cùng công thức màn hình / hàm chuẩn đã đối chiếu · vàng = AI tự viết truy vấn
const NGUON = {
  tong_quan: { ten: 'Cùng số liệu màn Tổng quan', chuan: true },
  lich_de_nghi: { ten: 'Cùng công thức màn Lịch đề nghị', chuan: true },
  dieu_chuyen: { ten: 'Cùng quy tắc màn Điều chuyển kho (dữ liệu Odoo)', chuan: true },   // NEW - 3.137
  chia_doi: { ten: 'Engine màn Chia từng đội', chuan: true },
  ho_so: { ten: 'Hồ sơ chuẩn (bảng gốc)', chuan: true },
  xep_hang: { ten: 'Xếp hạng chuẩn (bảng gốc)', chuan: true },
  hoi_so_lieu: { ten: 'AI tự tra bằng truy vấn riêng — nên đối chiếu', chuan: false },
};
const GOI_Y = [
  'Hôm nay app có vấn đề gì cần xử lý?',
  'Chia đội 1 tầm 3–5 thùng, chia đủ 15 ngày, tổng tồn sau chia không quá 500',
  'Tình hình đội 3 thế nào? Mã nào sắp hết?',
  'Top 10 cửa hàng bán nhiều nhất tuần này, kèm tồn hiện tại',
  'Cửa hàng Nguyễn Trãi 5 còn phiếu nào chưa nhận?',
];

// NEW - 3.130 biểu tượng riêng của khung (nét 1.9, bo tròn — cùng họ với icons.jsx)
const Sv = ({ children, ...p }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>{children}</svg>;
const IcDs = () => <Sv><path d="M4 6h16M4 12h10M4 18h16" /></Sv>;
const IcViet = () => <Sv><path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" /><path d="M17.5 3.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 8.5-8.5z" /></Sv>;
const IcVe = () => <Sv><path d="M15 5l-7 7 7 7" /></Sv>;
const IcGhim = () => <Sv><path d="M9 4h6l-1 6 4 3v2H6v-2l4-3-1-6zM12 15v6" /></Sv>;
const IcBaCham = () => <Sv><circle cx="5" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="19" cy="12" r="1.2" fill="currentColor" /></Sv>;
const IcTim = () => <Sv><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></Sv>;
const NHOM_NGAY = (t) => {
  const d = new Date(t); const h = new Date(); h.setHours(0, 0, 0, 0);
  const n = Math.floor((h - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  return n <= 0 ? 'Hôm nay' : n === 1 ? 'Hôm qua' : n < 7 ? '7 ngày qua' : n < 30 ? '30 ngày qua' : 'Cũ hơn';
};
// tin nhắn đã lưu trên máy chủ -> dạng khung trò chuyện
const tinTuMay = (ds) => (ds || []).map((x) => (x.vai === 'nguoi'
  ? { id: 'n' + x.id, vai: 'nguoi', text: x.noi_dung }
  : { id: 'a' + x.id, vai: 'ai', trang_thai: 'xong', tra_loi: x.noi_dung, the: x.viec?.the || null, viec_id: x.viec_id, pt: 100,
      bat_dau: x.viec?.bat_dau ? new Date(x.viec.bat_dau).getTime() : null, ket_thuc: x.viec?.ket_thuc ? new Date(x.viec.ket_thuc).getTime() : null,
      token: x.viec ? { vao: x.viec.token_vao || 0, ra: x.viec.token_ra || 0 } : null, nguon: x.viec?.ke_hoach?.nguon || [], cach: x.viec?.ke_hoach?.cach || [], nho: x.viec?.ke_hoach?.nho || [], tri: x.viec?.ke_hoach?.tri || [],
      buoc: [], canTt: !!x.viec?.the?.thao_tac_id }));

// chữ trả lời: "- " -> gạch đầu dòng, **đậm**
function Chu({ text }) {
  const dong = String(text || '').split('\n');
  const inl = (s, k) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <b key={k + '-' + i}>{p.slice(2, -2)}</b> : p));
  const out = []; let ds = []; let anh = [];
  const day = () => { if (ds.length) { out.push(<ul key={'u' + out.length}>{ds}</ul>); ds = []; } };
  // NEW - 3.160.1: dòng "![nhãn](link hình)" (kể cả có gạch đầu dòng) -> lưới hình sản phẩm; bấm hình mở ảnh lớn
  const dayAnh = () => {
    if (!anh.length) return;
    out.push(<div key={'a' + out.length} className="stt-anh-luoi">{anh.map((a, j) => (
      <a key={j} className="stt-anh" href={a.url} target="_blank" rel="noopener noreferrer" title={a.nhan}>
        <img src={a.url} alt={a.nhan} loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
        <span>{inl(a.nhan + (a.them ? ' ' + a.them : ''), 'a' + j)}</span>
      </a>))}</div>);
    anh = [];
  };
  dong.forEach((d, i) => {
    const h0 = /^\s*(?:[-•*]\s+)?!\[([^\]]*)\]\((https:\/\/[^)\s]+)\)\s*(.*)$/.exec(d);
    if (h0) { day(); anh.push({ nhan: h0[1], url: h0[2], them: h0[3] }); return; }
    dayAnh();
    const m = /^\s*[-•*]\s+(.*)$/.exec(d);
    if (m) { ds.push(<li key={i}>{inl(m[1], i)}</li>); return; }
    day();
    const h = /^\s*#{1,6}\s+(.*)$/.exec(d);   // NEW - 3.132 "### Tiêu đề" -> chữ đậm
    if (h) { out.push(<p key={i} className="stt-chu-tieu"><b>{h[1].replace(/\*\*/g, '')}</b></p>); return; }
    const q = /^\s*>\s?(.*)$/.exec(d);        // "> Lưu ý" -> ô ghi chú
    if (q) { if (q[1].trim()) out.push(<p key={i} className="stt-chu-ghi">{inl(q[1], i)}</p>); return; }
    if (d.trim()) out.push(<p key={i}>{inl(d, i)}</p>);
  });
  day(); dayAnh();
  return <div className="stt-chu">{out}</div>;
}

// tiến độ: nhích dần từ pt tới pt_toi trong lúc chờ, không bao giờ vượt pt_toi
function useTienDo(pt, ptToi, dang) {
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
  return Math.max(0, Math.min(100, dang ? hien : pt || 0));
}
// việc nặng: số % lớn + thanh
function ThanhTienDo({ pt, ptToi, dang }) {
  const v = useTienDo(pt, ptToi, dang);
  return (
    <div className="stt-td" role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <b className="stt-td-so">{Math.floor(v)}<small>%</small></b>
      <div className="stt-td-ray"><i style={{ width: v + '%' }} /></div>
    </div>
  );
}
// NEW - 3.129 việc nhẹ: vòng % nhỏ trên 1 dòng
const VONG_C = 2 * Math.PI * 9;
function VongTienDo({ pt, ptToi, dang }) {
  const v = useTienDo(pt, ptToi, dang);
  return (
    <span className="stt-vong" role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        <defs><linearGradient id="sttVongG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1E5F63" /><stop offset=".7" stopColor="#3FB6A8" /><stop offset="1" stopColor="#CBA45A" /></linearGradient></defs>
        <circle cx="12" cy="12" r="9" fill="none" stroke="#E8EDEE" strokeWidth="3" />
        <circle cx="12" cy="12" r="9" fill="none" stroke="url(#sttVongG)" strokeWidth="3" strokeLinecap="round"
          strokeDasharray={VONG_C} strokeDashoffset={VONG_C * (1 - v / 100)} transform="rotate(-90 12 12)" />
      </svg>
      <b>{Math.floor(v)}%</b>
    </span>
  );
}
// đồng hồ m:ss (lúc đang nghe)
function DemGio({ tu }) {
  const [, setN] = useState(0);
  useEffect(() => { const h = setInterval(() => setN((n) => n + 1), 500); return () => clearInterval(h); }, []);
  const s = Math.max(0, Math.floor((Date.now() - (tu || Date.now())) / 1000));
  return <time>{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</time>;
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

// NEW - 3.159.2: khối KIỂM TRA — nhìn là biết phương án đúng hay sai
export function KiemChia({ k, chia, du }) {
  const n = (v) => fmt(v || 0);
  const dong = [];
  dong.push(k.thieu_sau ? ['do', `${n(k.thieu_sau)} mã đang bán vẫn THIẾU sau chia (${n(k.cai_thieu)} cái)${k.thieu_kho ? ` — ${n(k.thieu_kho)} mã do kho hết` : ''}${k.thieu_chua_chia ? ` · ${n(k.thieu_chua_chia)} mã chưa chia` : ''}`]
    : ['ok', `${n(k.dat_sau)}/${n(k.ma_ban)} mã đang bán đều đủ ${du || '?'} ngày sau chia`]);
  if (k.thieu_sau) dong.push(['ok', `${n(k.dat_sau)}/${n(k.ma_ban)} mã đang bán đủ ${du || '?'} ngày`]);
  dong.push(k.vuot_kho ? ['do', `${n(k.vuot_kho)} mã chia vượt kho`] : ['ok', 'Không mã nào vượt kho']);
  if (chia?.thung > 0) dong.push([k.thung_du > chia.thung * 0.4 ? 'vang' : 'ok', `Thùng ${n(chia.thung)} cái: ${n(k.thung_dung)} đúng nhu cầu đội · ${n(k.thung_du)} dư (đội chưa cần)`]);
  if (k.nhan_khong_ban) dong.push(['vang', `${n(k.nhan_khong_ban)} mã đội không bán mà vẫn nhận (thường do có trong thùng)`]);
  const xau = dong.some((d) => d[0] === 'do') ? 'do' : dong.some((d) => d[0] === 'vang') ? 'vang' : 'ok';
  return (
    <div className={'stt-kiem k-' + xau}>
      <div className="stt-kiem-dau"><small>Kiểm tra phương án</small><b>{xau === 'ok' ? 'Đúng' : xau === 'vang' ? 'Cần xem' : 'Có chỗ sai'}</b></div>
      <ul>{dong.map(([c, t], i) => <li key={i} className={c}>{c === 'ok' ? <IcCheck /> : <IcAlert />}<span>{t}</span></li>)}</ul>
    </div>
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
      {/* NEW - 3.159.2: tham số đã dùng (kèm lấy từ đâu) + kiểm tra đúng / sai */}
      {the.tham?.length > 0 && (
        <div className="stt-the-hang"><small>Tham số đã dùng</small>
          <div className="stt-ts">{the.tham.map((t) => <span key={t.ten}><em>{t.ten}</em><b>{t.gt}</b><i>{t.ng}</i></span>)}</div>
          {the.sua_ai?.length > 0 && <p className="stt-nho stt-sua-ai">Em đã sửa theo đúng câu anh nói: {the.sua_ai.join(' · ')}</p>}
        </div>
      )}
      {the.kiem_tra?.ma_ban != null && <KiemChia k={the.kiem_tra} chia={the.chia} du={the.tham_so?.chia_du_ngay} />}
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
function LuotAI({ m, onDung, onDuyet, onHuy, onXem, onCt, onBaoSai }) {
  const dang = m.trang_thai === 'dang';
  const [moBuoc, setMoBuoc] = useState(false);
  // NEW - 3.133 cách tính + báo sai
  const [moCach, setMoCach] = useState(false);
  const [chep, setChep] = useState(-1);
  const [moBs, setMoBs] = useState(false);
  const [bs, setBs] = useState('');
  const [hocBs, setHocBs] = useState(true);
  const [guiBs, setGuiBs] = useState(false);
  const [loiBs, setLoiBs] = useState('');
  const guiBaoSai = async (e) => {
    e.preventDefault();
    if (!bs.trim() || guiBs) return;
    setGuiBs(true); setLoiBs('');
    try { await onBaoSai?.(bs.trim(), hocBs); setMoBs(false); setBs(''); } catch (er) { setLoiBs(er.message || 'Chưa gửi được'); }
    setGuiBs(false);
  };
  const [dem, setDem] = useState(0);
  useEffect(() => {
    if (!dang) return undefined;
    const h = setInterval(() => setDem(Date.now() - (m.bat_dau || Date.now())), 500);
    return () => clearInterval(h);
  }, [dang, m.bat_dau]);
  // NEW - 3.129 tiến độ tự co giãn: việc nhẹ = vòng % 1 dòng; việc nặng (thao tác màn hình, ≥3 công cụ, ≥3 lượt AI, quá 15 giây) = thẻ tiến độ đầy đủ
  const ds = m.buoc || [];
  const nangRef = useRef(false);
  if (m.nang || ds.filter((b) => b.noi !== 'ai').length >= 3 || ds.filter((b) => b.noi === 'ai').length >= 3 || (dang && dem > 15000)) nangRef.current = true;
  const nang = nangRef.current;
  const dungGiua = !dang && ds.length > 0 && (m.trang_thai === 'loi' || m.trang_thai === 'dung');
  return (
    <div className={'stt-luot ' + m.trang_thai + (nang ? ' nang' : ' nhe')}>
      <div className="stt-ava"><IcBrain /></div>
      <div className="stt-luot-than">
        {dang && !nang && (
          <div className="stt-gon">
            <VongTienDo pt={m.pt} ptToi={m.ptToi} dang />
            <span className="stt-gon-chu">{m.buoc_hien || 'Đang xử lý'}</span>
            <span className="stt-gon-gio">{Math.floor(dem / 1000)}s</span>
          </div>
        )}
        {((dang && nang) || dungGiua) && (
          <div className="stt-tien">
            <ThanhTienDo pt={m.pt} ptToi={m.ptToi} dang={dang} />
            <div className="stt-buoc-hien">{dang ? m.buoc_hien || 'Đang xử lý' : m.trang_thai === 'loi' ? 'Dừng vì lỗi' : 'Đã dừng'}</div>
          </div>
        )}
        {dang && nang && m.ke_hoach && <p className="stt-kh"><IcSpark />{m.ke_hoach}</p>}
        {dang && nang && ds.length > 0 && <ul className="stt-bds">{ds.map((b) => <DongBuoc key={b.stt} b={b} />)}</ul>}
        {dang && nang && <div className="stt-dang-chan"><span><IcClock /> {giay(dem)}</span><button className="stt-lk" onClick={onDung}>Dừng</button></div>}
        {m.trang_thai === 'loi' && <p className="stt-loi"><IcAlert />{m.loi}</p>}
        {m.trang_thai === 'dung' && <p className="stt-nho">Đã dừng theo yêu cầu.</p>}
        {m.tra_loi && <Chu text={m.tra_loi} />}
        {!dang && m.nguon?.length > 0 && (
          <div className="stt-nguon">{m.nguon.filter((n) => NGUON[n]).map((n) => (
            <span key={n} className={'stt-nguon-o ' + (NGUON[n].chuan ? 'chuan' : 'tu')}>{NGUON[n].chuan ? <IcCheck /> : <IcAlert />}{NGUON[n].ten}</span>
          ))}</div>
        )}
        {/* NEW - 3.135 câu trả lời có số mà không tra công cụ nào -> cảnh báo rõ, không để lẫn với số thật */}
        {!dang && m.tra_loi && !(m.nguon?.length) && !m.the && (String(m.tra_loi).match(/\d{2,}/g) || []).length >= 2 && (
          <div className="stt-nguon"><span className="stt-nguon-o tu"><IcAlert />Câu này không tra số liệu — số trong câu chưa được kiểm</span></div>
        )}
        {/* NEW - 3.133 cách tính đằng sau con số + tri thức đã dùng + điều AI vừa ghi nhớ */}
        {!dang && (m.cach?.length > 0 || m.tri?.length > 0) && (
          <div className="stt-cach-o">
            {m.cach?.length > 0 && <button className="stt-lk" onClick={() => setMoCach((v) => !v)} aria-expanded={moCach}>Cách tính <i className={'stt-mui' + (moCach ? ' len' : '')} /></button>}
            {m.tri?.length > 0 && <span className="stt-tri-dem" title={m.tri.map((t) => t.cum).join(', ')}><IcBrain />Dùng {m.tri.length} tri thức</span>}
          </div>
        )}
        {!dang && moCach && m.cach?.length > 0 && (
          <div className="stt-cach">
            {m.cach.map((c, i) => (
              <div key={i} className={'stt-cach-dong ' + (c.cong_cu === 'hoi_so_lieu' ? 'tu' : 'chuan')}>
                <b>{c.nhan}</b>
                <p>{c.dinh_nghia}</p>
                {c.bang?.length > 0 && <p className="stt-nho">Bảng dữ liệu: {c.bang.join(' · ')}</p>}
                {c.sql && <>
                  <pre className="stt-cach-sql">{c.sql}</pre>
                  <button className="stt-lk" onClick={async () => { if (await chepChu(c.sql)) { setChep(i); setTimeout(() => setChep(-1), 1800); } }}>{chep === i ? 'Đã chép' : 'Chép truy vấn để tự chạy'}</button>
                </>}
              </div>
            ))}
            {m.tri?.length > 0 && <p className="stt-nho">Tri thức đã nạp: {m.tri.map((t) => t.cum).join(' · ')}</p>}
          </div>
        )}
        {!dang && m.nho?.length > 0 && (
          <div className="stt-hoc-ds">{m.nho.map((x, i) => (
            <span key={i} className={'stt-hoc-o ' + (x.trang_thai === 'dung' ? 'dung' : 'cho')} title={x.noi_dung}><IcBrain />Đã ghi nhớ: {String(x.cum_tu || '').split(',')[0]}{x.trang_thai === 'dung' ? '' : ' · chờ Quản trị duyệt'}</span>
          ))}</div>
        )}
        {m.the?.loai === 'chia_doi' && <TheChiaDoi the={m.the} tt={m.tt} onDuyet={onDuyet} onHuy={onHuy} onXem={onXem} />}
        {!dang && (m.viec_id || ds.length > 0) && (
          <div className="stt-luot-chan">
            {m.ket_thuc && m.bat_dau && <span>{giay(m.ket_thuc - m.bat_dau)}</span>}
            {m.token && (m.token.vao + m.token.ra) > 0 && <span>{fmt(m.token.vao + m.token.ra)} token</span>}
            <span className="stt-chan-phai">
              {ds.length > 0 && <button className="stt-lk" onClick={() => setMoBuoc((v) => !v)} aria-expanded={moBuoc}>{ds.length} bước đã làm <i className={'stt-mui' + (moBuoc ? ' len' : '')} /></button>}
              {m.viec_id && <button className="stt-lk" onClick={onCt}>Chi tiết</button>}
              {m.viec_id && onBaoSai && !m.baoSai && <button className="stt-lk stt-lk-bs" onClick={() => setMoBs((v) => !v)} aria-expanded={moBs}>Báo sai</button>}
            </span>
          </div>
        )}
        {!dang && moBs && !m.baoSai && (
          <form className="stt-bs" onSubmit={guiBaoSai}>
            <textarea value={bs} onChange={(e) => setBs(e.target.value)} rows={3} maxLength={1000} autoFocus
              placeholder="Sai chỗ nào? Số đúng là bao nhiêu, phải hiểu hoặc tính thế nào…" />
            <label className="stt-bs-hoc"><input type="checkbox" checked={hocBs} onChange={(e) => setHocBs(e.target.checked)} /> Lưu thành bài học — câu hỏi tương tự lần sau em làm theo</label>
            {loiBs && <p className="stt-loi"><IcAlert />{loiBs}</p>}
            <div className="stt-bs-nut">
              <button type="button" className="btn btn-ghost" onClick={() => setMoBs(false)}>Huỷ</button>
              <button type="submit" className="btn btn-ai" disabled={!bs.trim() || guiBs}>{guiBs ? 'Đang gửi…' : 'Gửi báo sai'}</button>
            </div>
          </form>
        )}
        {m.baoSai && <p className="stt-bs-ok"><IcCheck />Đã ghi nhận báo sai{m.baoSai.hoc ? ' · đã lưu bài học vào tri thức' : ''}.</p>}
        {!dang && moBuoc && ds.length > 0 && (
          <div className="stt-buoc-mo">
            {m.ke_hoach && <p className="stt-kh"><IcSpark />{m.ke_hoach}</p>}
            <ul className="stt-bds">{ds.map((b) => <DongBuoc key={b.stt} b={b} />)}</ul>
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
  // NEW - 3.129 ô soạn: nháp tự lưu (có sự cố không mất chữ) · tự giãn · phóng to
  const khoaNhap = 'nhap:' + (user?.ma_dang_nhap || '');
  const [nhap, setNhap] = useState(() => String(lsG(khoaNhap, '') || ''));
  const nhapRef = useRef(nhap); nhapRef.current = nhap;
  const [to, setTo] = useState(false);
  const [dai, setDai] = useState(false);
  const [banPhim, setBanPhim] = useState(false);
  const nganRef = useRef(null);
  const [ctId, setCtId] = useState(null);
  const [moDs, setMoDs] = useState(false);       // NEW - 3.130 ngăn danh sách cuộc trò chuyện
  const [dangNap, setDangNap] = useState(false);
  const acRef = useRef(null);
  const phienRef = useRef(phien); phienRef.current = phien;
  const phuongAn = useRef(lsG('pa', null));
  const khungRef = useRef(null);
  const oNhap = useRef(null);
  const daNapPhien = useRef(false);
  const dangChay = tin.some((m) => m.vai === 'ai' && m.trang_thai === 'dang');
  const jobDang = [...tin].reverse().find((m) => m.vai === 'ai' && m.trang_thai === 'dang');

  const gi = useGiong({ layNhap: () => nhapRef.current, datNhap: setNhap, bao: baoToast });
  // NEW - 3.134 xưng hô theo tài khoản (Cài đặt › Xưng hô); chưa đặt = "anh/chị"
  const xh = quyen?.cfg?.xung_ho?.[quyen?.ma] || 'anh/chị';
  const Xh = xh.charAt(0).toUpperCase() + xh.slice(1);
  // NEW - 3.134 micro Safari kẹt -> chuyển sang micro trên bàn phím (luôn chạy được)
  const dungBanPhim = () => { gi.dung(); const el = oNhap.current; if (el) { el.readOnly = false; el.focus(); setSoanMo(true); } };
  // nháp: lưu sau 250ms + lưu ngay khi trang bị đóng / chuyển app
  useEffect(() => { const h = setTimeout(() => lsS(khoaNhap, nhap ? nhap : null), 250); return () => clearTimeout(h); }, [nhap, khoaNhap]);
  useEffect(() => {
    const f = () => lsS(khoaNhap, nhapRef.current ? nhapRef.current : null);
    window.addEventListener('pagehide', f);
    return () => window.removeEventListener('pagehide', f);
  }, [khoaNhap]);
  // điện thoại: khung bám vùng nhìn thấy khi bàn phím bật (không bị che, không bị đẩy mất đầu khung)
  useEffect(() => {
    if (!mo) return undefined;
    const vv = window.visualViewport; const el = nganRef.current;
    if (!vv || !el) return undefined;
    const f = () => {
      if (!window.matchMedia('(max-width: 900px)').matches) { el.style.removeProperty('--stt-vh'); el.style.removeProperty('--stt-vt'); setBanPhim(false); return; }
      el.style.setProperty('--stt-vh', Math.round(vv.height) + 'px');
      el.style.setProperty('--stt-vt', Math.round(vv.offsetTop) + 'px');
      setBanPhim(window.innerHeight - vv.height > 120);
    };
    f();
    // NEW - 3.160.2: iPhone bật / tắt bàn phím có hiệu ứng → đo lại sau khi bàn phím đứng yên (khỏi hở nền trang phía dưới ô soạn)
    const hen = [];
    const doLai = () => { hen.forEach(clearTimeout); hen.length = 0; [80, 320, 700].forEach((ms) => hen.push(setTimeout(f, ms))); };
    vv.addEventListener('resize', f); vv.addEventListener('scroll', f);
    window.addEventListener('focusin', doLai); window.addEventListener('focusout', doLai);
    // khoá cuộn trang phía sau khi ngăn mở trên điện thoại
    const cu = document.body.style.overflow;
    if (window.matchMedia('(max-width: 900px)').matches) document.body.style.overflow = 'hidden';
    return () => {
      vv.removeEventListener('resize', f); vv.removeEventListener('scroll', f);
      window.removeEventListener('focusin', doLai); window.removeEventListener('focusout', doLai);
      hen.forEach(clearTimeout); document.body.style.overflow = cu;
    };
  }, [mo]);
  // NEW - 3.130 ô soạn MỞ khi chạm vào ô / bấm micro; chạm ra ngoài -> THU GỌN 1 hàng (chữ dài chỉ hiện 3 dòng đầu, mờ dần)
  const [soanMo, setSoanMo] = useState(false);
  const [vuot, setVuot] = useState(false);
  const formRef = useRef(null);
  const moSoan = soanMo || gi.nghe || to;
  useEffect(() => {
    if (!soanMo) return undefined;
    const f = (e) => {
      if (formRef.current && !formRef.current.contains(e.target)) {
        setSoanMo(false); setTo(false);
        if (document.activeElement === oNhap.current) oNhap.current.blur();
      }
    };
    document.addEventListener('pointerdown', f, true);
    return () => document.removeEventListener('pointerdown', f, true);
  }, [soanMo]);
  // ô soạn tự giãn theo chữ: đang mở = đọc trọn đoạn (tối đa ~45% màn, phóng to 62%), dài hơn thì cuộn trong ô
  useLayoutEffect(() => {
    const el = oNhap.current; if (!el) return;
    el.style.height = 'auto';
    const cs = getComputedStyle(el);
    const lh = parseFloat(cs.lineHeight) || 24;
    const dem = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const vh = window.visualViewport?.height || window.innerHeight;
    const max = Math.round(!moSoan ? lh * 3 + dem : to ? vh * 0.62 : Math.min(vh * 0.45, 380));
    const sh = el.scrollHeight;
    el.style.height = (to && moSoan ? max : Math.min(sh, max)) + 'px';
    el.style.overflowY = moSoan && sh > max ? 'auto' : 'hidden';
    if (!moSoan) el.scrollTop = 0;
    else if (gi.nghe) el.scrollTop = el.scrollHeight;
    setDai(sh - dem > lh * 4.5);
    setVuot(!moSoan && sh > max + 2);
  }, [nhap, to, mo, view, gi.nghe, banPhim, moSoan]);

  useEffect(() => { if (token) aiQuyen(token).then(setQuyen, () => setQuyen(null)); }, [token]);
  // NEW - 3.159.5 SỔ VẤN ĐỀ TOÀN APP: tải sẵn khi mở app + 15 phút / lần (máy chủ giữ 10 phút, không tốn token) — AI nắm sẵn, không đợi hỏi
  const [vanDe, setVanDe] = useState(null);
  const taiVanDe = useCallback((ep = false) => { if (token) aiVanDe(token, ep).then(setVanDe, () => {}); }, [token]);
  useEffect(() => {
    if (!quyen?.ok) return undefined;
    taiVanDe();
    const t = setInterval(() => { if (document.visibilityState === 'visible') taiVanDe(); }, 15 * 60000);
    return () => clearInterval(t);
  }, [quyen?.ok, taiVanDe]);
  // NEW - 3.159.5 TỰ HỌC: mỗi lần mở app nhắc máy chủ học (máy chủ tự giới hạn: cách N giờ, trần token / ngày, 1 lượt 1 lúc)
  useEffect(() => {
    if (!quyen?.ok || !quyen.co_khoa || !token) return;
    let cuoi = 0; try { cuoi = Number(localStorage.getItem('ns_ai_hoc_goi')) || 0; } catch { /* */ }
    if (Date.now() - cuoi < 30 * 60000) return;
    try { localStorage.setItem('ns_ai_hoc_goi', String(Date.now())); } catch { /* */ }
    goiJson({ token, hanh_dong: 'hoc' }).catch(() => {});
  }, [quyen?.ok, quyen?.co_khoa, token]);
  useEffect(() => { lsS('phien:' + (user?.ma_dang_nhap || ''), phien); }, [phien, user?.ma_dang_nhap]);
  useEffect(() => { lsS('rong', rong); }, [rong]);

  // mở lần đầu: nạp lại cuộc trò chuyện đang dở
  useEffect(() => {
    if (!mo || daNapPhien.current || !phien || !token) return;
    daNapPhien.current = true;
    aiPhienTin(token, phien).then((ds) => {
      if (!Array.isArray(ds) || !ds.length) return;
      setTin((cu) => (cu.length ? cu : tinTuMay(ds)));
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
  useEffect(() => { const el = khungRef.current; if (el && view === 'chat') el.scrollTop = el.scrollHeight; }, [tin, view, mo, banPhim]);
  // Esc đóng (PC)
  useEffect(() => {
    if (!mo) return undefined;
    const f = (e) => { if (e.key === 'Escape' && !document.querySelector('.kt-modal')) setMo(false); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [mo]);

  const capNhat = useCallback((id, fn) => setTin((t) => t.map((m) => (m.id === id ? { ...m, ...(typeof fn === 'function' ? fn(m) : fn) } : m))), []);
  // NEW - 3.133 báo sai 1 câu trả lời (kèm lưu bài học vào tri thức)
  const baoSai = useCallback(async (m, ghiChu, hoc) => {
    const r = await aiBaoSai(token, m.viec_id, ghiChu, hoc);
    capNhat(m.id, { baoSai: { ghi_chu: ghiChu, hoc: !!r?.tri_thuc?.ok } });
    baoToast?.(r?.tri_thuc?.ok ? (r.tri_thuc.trang_thai === 'dung' ? 'Đã ghi nhận — em lưu bài học, câu tương tự lần sau sẽ làm theo' : 'Đã ghi nhận — bài học chờ Quản trị duyệt') : 'Đã ghi nhận báo sai');
  }, [token, capNhat, baoToast]);
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
  const chayCongCu = async (g, jobId, ptTu, ptDen, viecId, yeuCau) => {
    const stt = 'c-' + g.id;
    const buocCon = [];
    const datBuoc = (patch) => capNhat(jobId, (m) => ({ buoc: (m.buoc || []).map((b) => (b.stt === stt ? { ...b, ...patch } : b)) }));
    capNhat(jobId, (m) => ({ nang: true, buoc: [...(m.buoc || []), { stt, noi: 'man_hinh', nhan: g.nhan, trang_thai: 'dang', con: [] }], buoc_hien: g.nhan, pt: ptTu, ptToi: ptTu + 2 }));
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
          r = await c.chuanBi(g.tham_so || {}, bao, { viec_id: viecId, yeu_cau: yeuCau || '' });   // NEW - 3.159.2: gửi kèm câu anh nói để chốt tham số
          phuongAn.current = { ...(r?.p_chot || g.tham_so || {}) }; delete phuongAn.current.lam_tiep; lsS('pa', phuongAn.current);
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
    const tuO = String(text) === nhapRef.current;   // gửi từ ô soạn (không phải bấm câu gợi ý) -> mới xoá ô
    if (tuO) {
      gi.huy();   // đang nói mà bấm gửi: dừng micro ngay, bỏ kết quả đến muộn (không điền lại ô)
      setNhap(''); lsS(khoaNhap, null); setTo(false);
    }
    if (!laPc()) { oNhap.current?.blur(); setSoanMo(false); }
    setView('chat');
    const id = 'j' + Date.now();
    setTin((t) => [...t, { id: 'u' + id, vai: 'nguoi', text: yeuCau }, { id, vai: 'ai', trang_thai: 'dang', pt: 1, ptToi: 4, buoc_hien: 'Gửi yêu cầu', buoc: [], bat_dau: Date.now() }]);
    const ac = new AbortController(); acRef.current = ac;
    let viecId = null, daNhan = false;
    const onE = (e) => {
      if (e.t === 'viec') { daNhan = true; viecId = e.viec_id; capNhat(id, { viec_id: e.viec_id }); if (e.phien_id && e.phien_id !== phienRef.current) setPhien(e.phien_id); }
      else if (e.t === 'tien_do') capNhat(id, (m) => ({ pt: Math.max(m.pt || 0, e.pt || 0), ptToi: e.pt_toi ?? e.pt, buoc_hien: e.buoc || m.buoc_hien }));
      else if (e.t === 'ke_hoach') capNhat(id, { ke_hoach: e.text });
      else if (e.t === 'buoc') capNhat(id, (m) => {
        const ds = [...(m.buoc || [])]; const i = ds.findIndex((b) => b.stt === e.stt);
        if (i >= 0) ds[i] = { ...ds[i], ...e }; else ds.push(e);
        return { buoc: ds };
      });
      else if (e.t === 'xong') capNhat(id, (m) => ({ trang_thai: 'xong', pt: 100, ptToi: 100, tra_loi: e.tra_loi, the: e.the || m.the, token: e.token, nguon: e.nguon || [], cach: e.cach || [], nho: e.nho || [], tri: e.tri || [], ket_thuc: Date.now() }));
      else if (e.t === 'loi') capNhat(id, { trang_thai: 'loi', loi: e.loi, ket_thuc: Date.now() });
    };
    let res = await goiLuong({ token, hanh_dong: 'chay', yeu_cau: yeuCau, phien_id: phienRef.current, man: tenTab(tab), ngu_canh: nguCanh() }, onE, ac.signal);
    for (let vong = 0; res.client && !ac.signal.aborted && vong < 12; vong++) {
      const ketQua = [];
      for (const g of res.client.goi) {
        if (ac.signal.aborted) break;
        const n = res.client.goi.length, k = ketQua.length;
        const tu = res.client.pt_tu + ((res.client.pt_den - res.client.pt_tu) * k) / n, den = res.client.pt_tu + ((res.client.pt_den - res.client.pt_tu) * (k + 1)) / n;
        ketQua.push(await chayCongCu(g, id, Math.round(tu), Math.round(den), viecId, yeuCau));
      }
      if (ac.signal.aborted) break;
      res = await goiLuong({ token, hanh_dong: 'tiep', viec_id: res.viec_id || viecId, ket_qua: ketQua }, onE, ac.signal);
    }
    if (ac.signal.aborted) capNhat(id, { trang_thai: 'dung', ket_thuc: Date.now() });
    else if (res.loi && !res.xong) capNhat(id, (m) => (m.trang_thai === 'dang' ? { trang_thai: 'loi', loi: res.loi, ket_thuc: Date.now() } : {}));
    // máy chủ chưa nhận được yêu cầu (mất mạng…): trả chữ về ô soạn, không mất
    if (!daNhan && res.loi && !ac.signal.aborted) {
      setNhap((cu) => (cu && cu.trim() ? cu : yeuCau));
      baoToast?.('Chưa gửi được — chữ của anh đã giữ lại trong ô soạn');
    }
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

  const cuocMoi = () => {
    if (dangChay) { baoToast?.('Đang có việc chạy — chờ xong hoặc bấm Dừng rồi mới mở cuộc trò chuyện mới'); return; }
    setTin([]); setPhien(null); phuongAn.current = null; lsS('pa', null); daNapPhien.current = true; setView('chat'); setMoDs(false);
  };
  // NEW - 3.130 mở lại 1 cuộc trò chuyện cũ (nối tiếp được như ChatGPT)
  const moPhien = async (id) => {
    if (dangChay && id !== phien) { baoToast?.('Đang có việc chạy — chờ xong hoặc bấm Dừng rồi mới chuyển cuộc trò chuyện'); return; }
    setMoDs(false); setView('chat');
    if (id === phien && tin.length) return;
    setPhien(id); daNapPhien.current = true; phuongAn.current = null; lsS('pa', null);
    setTin([]); setDangNap(true);
    try { setTin(tinTuMay(await aiPhienTin(token, id))); } catch (e) { baoToast?.('Chưa mở được cuộc trò chuyện: ' + e.message); } finally { setDangNap(false); }
  };

  if (!quyen || (!quyen.ok && !quyen.admin)) return null;
  const choDung = !quyen.ok;   // Quản trị khi AI tắt: vẫn vào được Cài đặt

  return (
    <>
      {!mo && (
        <button className={'stt-tay' + (jobDang ? ' chay' : '')} onClick={() => setMo(true)} aria-label="Mở SIÊU TRÍ TUỆ" title="SIÊU TRÍ TUỆ — giao việc bằng chữ hoặc giọng nói">
          <IcBrain />
          <span className="stt-tay-chu">{jobDang ? `${Math.floor(jobDang.pt || 0)}%` : 'SIÊU TRÍ TUỆ'}</span>
          {!jobDang && vanDe?.so_do > 0 && <i className="stt-tay-vd" title={`${vanDe.so_do} vấn đề đỏ đang có trong app`}>{vanDe.so_do}</i>}
          {jobDang && <i className="stt-tay-ray" style={{ height: (jobDang.pt || 0) + '%' }} />}
        </button>
      )}
      {mo && (
        <div ref={nganRef} className={'stt-ngan' + (rong ? ' rong' : '')} role="dialog" aria-label="SIÊU TRÍ TUỆ">
          <header className="stt-dau">
            <div className="stt-dau-ten">
              {/* NEW - 3.130 trái: mở danh sách cuộc trò chuyện (ở màn trò chuyện) / quay lại (ở màn khác) */}
              {view === 'chat'
                ? <button className="stt-dau-ds" onClick={() => setMoDs(true)} title="Các cuộc trò chuyện" aria-label="Các cuộc trò chuyện"><IcDs /></button>
                : <button className="stt-dau-ds" onClick={() => setView(view === 'ct' ? 'ls' : 'chat')} title="Quay lại" aria-label="Quay lại"><IcVe /></button>}
              <span className="stt-logo"><IcBrain /></span>
              <div><b>SIÊU TRÍ TUỆ</b><small>{view === 'ls' ? 'Nhật ký việc & phiếu duyệt' : view === 'ct' ? 'Chi tiết việc' : view === 'cai' ? 'Cài đặt' : `Đang ở: ${tenTab(tab)}`}</small></div>
            </div>
            <div className="stt-dau-nut">
              {view === 'chat' && <button onClick={cuocMoi} disabled={!tin.length} title="Cuộc trò chuyện mới" aria-label="Cuộc trò chuyện mới"><IcViet /><span>Mới</span></button>}
              {quyen.admin && view !== 'cai' && <button onClick={() => setView('cai')} title="Cài đặt" aria-label="Cài đặt"><IcGear /></button>}
              <button className="stt-an-dt" onClick={() => setRong((v) => !v)} title={rong ? 'Thu hẹp' : 'Mở rộng'}>{rong ? <IcThuNho /> : <IcMoRong />}</button>
              <button onClick={() => setMo(false)} title="Thu nhỏ (việc vẫn chạy)" aria-label="Đóng">×</button>
            </div>
            {jobDang && <i className="stt-dau-ray" style={{ width: (jobDang.pt || 0) + '%' }} />}
          </header>
          {moDs && <DsHoiThoai token={token} phien={phien} dangChay={dangChay} baoToast={baoToast}
            onMo={moPhien} onMoi={cuocMoi} onDong={() => setMoDs(false)} onNhatKy={() => { setMoDs(false); setView('ls'); }}
            onDaXoa={(id) => { if (id === phien) { setTin([]); setPhien(null); daNapPhien.current = true; } }} />}

          {view === 'chat' && (
            <>
              <div className="stt-khung" ref={khungRef}>
                {choDung && <div className="stt-bao"><IcAlert />{quyen.loi || 'SIÊU TRÍ TUỆ đang tắt'} — vào Cài đặt để bật.</div>}
                {quyen.ok && !quyen.co_khoa && <div className="stt-bao"><IcAlert />Chưa có khoá FableAI. {quyen.admin ? 'Vào Cài đặt (bánh răng) để dán khoá.' : 'Nhờ Quản trị dán khoá ở Cài đặt.'}</div>}
                {quyen.dung_khan && <div className="stt-bao do"><IcAlert />Quản trị đang bật DỪNG KHẨN CẤP — AI chỉ chuẩn bị, không thực hiện thao tác ghi.</div>}
                {dangNap && <p className="stt-trong"><i className="stt-quay" /> Đang mở cuộc trò chuyện…</p>}
                {tin.length === 0 && !dangNap && (
                  <div className="stt-chao">
                    <span className="stt-chao-dau" aria-hidden="true"><IcBrain /></span>
                    <b>Anh giao việc, em làm trên màn hình rồi báo lại.</b>
                    <p>Hỏi gì về đội, cửa hàng, kho, sản phẩm em cũng tra được. Thao tác chia hàng dùng đúng công thức của app; việc ghi dữ liệu luôn chờ anh bấm Duyệt.</p>
                    <VanDeKhung vd={vanDe} onTai={() => taiVanDe(true)} onHoi={(x) => giao(`Phân tích giúp anh vấn đề này và nên xử lý thế nào: ${x.nhom} — ${x.tieu_de}${x.chi_tiet ? ' (' + x.chi_tiet + ')' : ''}`)}
                      onMo={async (x) => {
                        if (x.man === 'sieu_tri_tue') { setView('ls'); return; }
                        const t = { tong_quan: 'dashboard', lich_de_nghi: 'lich', dieu_chuyen: 'odoo', chia_online: 'chiaonline', tiktok: 'tiktok', tham_so: 'thamso' }[x.man];
                        const r = t ? await moMan(t) : { ok: false, loi: 'Chưa gắn màn' };
                        if (!r.ok) baoToast?.(r.loi); else if (laDt()) setMo(false);
                      }} choDung={choDung} />
                    <div className="stt-goi-y">{GOI_Y.map((g) => <button key={g} onClick={() => giao(g)} disabled={choDung}>{g}</button>)}</div>
                  </div>
                )}
                {tin.map((m) => (m.vai === 'nguoi'
                  ? <div key={m.id} className="stt-nguoi"><p>{m.text}</p></div>
                  : <LuotAI key={m.id} m={m} onDung={() => dung(m)} onDuyet={() => duyet(m)} onHuy={() => huy(m)} onXem={xem}
                      onCt={() => { setCtId(m.viec_id); setView('ct'); }} onBaoSai={(g, h) => baoSai(m, g, h)} />))}
              </div>
              {/* NEW - 3.129/3.130 ô soạn kiểu ChatGPT: gọn = 1 hàng [chữ][micro][gửi]; mở = chữ ở trên tự giãn, hàng nút ở dưới */}
              <form ref={formRef} className={'stt-soan' + (moSoan ? ' mo' : ' gon') + (gi.nghe ? ' nghe' : '') + (to ? ' to' : '') + (banPhim ? ' ban-phim' : '')} onSubmit={(e) => { e.preventDefault(); giao(nhap); }}>
                <div className="stt-hop" onClick={(e) => { if (e.target === e.currentTarget && !gi.nghe) oNhap.current?.focus(); }}>
                  {gi.nghe && (
                    <div className="stt-nghe" aria-live="polite">
                      <span className="stt-song" aria-hidden="true"><i /><i /><i /><i /><i /></span>
                      <b>Đang nghe</b><DemGio tu={gi.tu} />
                      <small>Cứ nói liền mạch, xong chạm nút đỏ</small>
                    </div>
                  )}
                  {gi.nghe && gi.canh && (
                    <div className="stt-nghe-canh" role="status">
                      <span>{gi.canh === 'ket'
                        ? 'Micro của Safari đang kẹt (lỗi của iPhone) — dùng micro trên bàn phím, hoặc chờ khoảng 1 phút rồi thử lại.'
                        : 'Chưa nghe ra chữ? Nếu ' + xh + ' đang nói mà chữ không hiện, dùng micro trên bàn phím cho chắc.'}</span>
                      <button type="button" className="stt-lk" onClick={dungBanPhim}>Dùng bàn phím</button>
                    </div>
                  )}
                  <textarea ref={oNhap} rows={1} value={nhap} disabled={choDung} readOnly={gi.nghe} className={vuot ? 'vuot' : undefined}
                    onFocus={() => setSoanMo(true)}
                    placeholder={gi.nghe ? Xh + ' nói đi, chữ hiện ở đây…' : 'Hỏi hoặc giao việc…'}
                    enterKeyHint={laPc() ? 'send' : 'enter'} aria-label="Nội dung giao việc"
                    onChange={(e) => setNhap(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && laPc()) { e.preventDefault(); giao(nhap); } }} />
                  <div className="stt-hop-chan">
                    <span className="stt-hop-goi">
                      {gi.nghe ? <button type="button" className="stt-lk stt-bo-luot" onClick={gi.boLuot}>Huỷ lượt nói</button>
                        : nhap.trim() ? `${fmt(demChu(nhap))} chữ` : laPc() ? 'Enter để gửi · Shift + Enter xuống dòng' : ''}
                    </span>
                    {(dai || to) && !gi.nghe && (
                      <button type="button" className="stt-nut nho" onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()} onClick={() => setTo((v) => !v)} title={to ? 'Thu nhỏ ô soạn' : 'Phóng to ô soạn'} aria-label={to ? 'Thu nhỏ ô soạn' : 'Phóng to ô soạn'}>{to ? <IcThuNho /> : <IcMoRong />}</button>
                    )}
                    <button type="button" className={'stt-nut mic' + (gi.nghe ? ' on' : '')} onClick={() => { setSoanMo(true); gi.bam(); }} disabled={choDung}
                      title={!gi.co ? 'Trình duyệt chưa hỗ trợ giọng nói' : gi.nghe ? 'Dừng nghe, giữ chữ' : 'Nói yêu cầu'} aria-label={gi.nghe ? 'Dừng nghe' : 'Nhập giọng nói'}>
                      {gi.nghe
                        ? <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2.5" fill="currentColor" /></svg>
                        : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>}
                    </button>
                    {dangChay
                      ? <button type="button" className="stt-nut gui dung" onClick={() => jobDang && dung(jobDang)} title="Dừng việc đang chạy" aria-label="Dừng việc đang chạy">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7.5" y="7.5" width="9" height="9" rx="2" fill="currentColor" /></svg></button>
                      : <button type="submit" className="stt-nut gui" disabled={!nhap.trim() || choDung} title="Gửi" aria-label="Gửi">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6" /></svg></button>}
                  </div>
                </div>
              </form>
            </>
          )}
          {view === 'ls' && <LichSu token={token} admin={quyen.admin} onMo={(id) => { setCtId(id); setView('ct'); }} />}
          {view === 'ct' && ctId && <ChiTiet token={token} id={ctId} onVe={() => setView('ls')}
            onDuyet={async (t) => { const m = { id: 'ct', the: t.xem_truoc ? { ...t.xem_truoc, thao_tac_id: t.id } : null }; if (m.the) { setView('chat'); const jid = 'd' + Date.now(); setTin((x) => [...x, { id: jid, vai: 'ai', trang_thai: 'xong', tra_loi: 'Duyệt lại phiếu từ Lịch sử:', the: m.the, pt: 100, buoc: [] }]); setTimeout(() => duyet({ id: jid, the: m.the }), 50); } }} />}
          {view === 'cai' && quyen.admin && <CaiDat token={token} onDoi={() => aiQuyen(token).then(setQuyen, () => {})} baoToast={baoToast} onCt={(id) => { setCtId(id); setView('ct'); }} />}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// LỊCH SỬ
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// NEW - 3.130 Danh sách cuộc trò chuyện (ngăn trượt từ trái, kiểu ChatGPT): mới · tìm · ghim · đổi tên · xoá
// ---------------------------------------------------------------------------
function DsHoiThoai({ token, phien, dangChay, baoToast, onMo, onMoi, onDong, onNhatKy, onDaXoa }) {
  const [ds, setDs] = useState(null);
  const [tim, setTim] = useState('');
  const [loi, setLoi] = useState('');
  const [menu, setMenu] = useState(null);
  const [sua, setSua] = useState(null);
  const [tenMoi, setTenMoi] = useState('');
  const [xoa, setXoa] = useState(null);
  const tai = useCallback((q) => { setLoi(''); aiDsPhien(token, q).then((r) => setDs(Array.isArray(r) ? r : []), (e) => { setLoi(e.message); setDs([]); }); }, [token]);
  useEffect(() => { const h = setTimeout(() => tai(tim.trim()), tim ? 300 : 0); return () => clearTimeout(h); }, [tim, tai]);
  useEffect(() => { const f = (e) => { if (e.key === 'Escape') onDong(); }; window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, [onDong]);
  const doi = async (p, patch) => {
    setMenu(null); setXoa(null);
    try {
      await aiPhienSua(token, p.id, patch);
      if (patch.an) { setDs((d) => d.filter((x) => x.id !== p.id)); onDaXoa?.(p.id); baoToast?.('Đã xoá cuộc trò chuyện'); }
      else setDs((d) => d.map((x) => (x.id === p.id ? { ...x, ...patch } : x)).sort((a, b) => (b.ghim - a.ghim) || String(b.cap_nhat).localeCompare(String(a.cap_nhat))));
    } catch (e) { baoToast?.('Chưa lưu được: ' + e.message); }
  };
  const nhom = [];
  (ds || []).forEach((p) => {
    const ten = p.ghim ? 'Đã ghim' : NHOM_NGAY(p.cap_nhat);
    if (!nhom.length || nhom[nhom.length - 1].ten !== ten) nhom.push({ ten, ds: [] });
    nhom[nhom.length - 1].ds.push(p);
  });
  return (
    <>
      <div className="stt-ds-nen" onClick={onDong} aria-hidden="true" />
      <aside className="stt-ds" role="dialog" aria-label="Các cuộc trò chuyện">
        <div className="stt-ds-dau">
          <b>Cuộc trò chuyện</b>
          <button className="stt-ds-x" onClick={onDong} aria-label="Đóng danh sách">×</button>
        </div>
        <button className="stt-ds-moi" onClick={onMoi} disabled={dangChay}><IcViet />Cuộc trò chuyện mới</button>
        <label className="stt-ds-tim"><IcTim /><input value={tim} onChange={(e) => setTim(e.target.value)} placeholder="Tìm trong các cuộc trò chuyện" aria-label="Tìm cuộc trò chuyện" /></label>
        <div className="stt-ds-ds">
          {loi && <p className="stt-loi"><IcAlert />{loi}</p>}
          {!ds && <p className="stt-trong"><i className="stt-quay" /> Đang tải…</p>}
          {ds && ds.length === 0 && !loi && <p className="stt-trong">{tim ? 'Không thấy cuộc trò chuyện nào khớp.' : 'Chưa có cuộc trò chuyện nào.'}</p>}
          {nhom.map((g) => (
            <section key={g.ten}>
              <h5>{g.ten}</h5>
              {g.ds.map((p) => (
                <div key={p.id} className={'stt-ds-dong' + (p.id === phien ? ' on' : '') + (menu === p.id ? ' mo' : '')}>
                  {sua === p.id ? (
                    <form className="stt-ds-sua" onSubmit={(e) => { e.preventDefault(); setSua(null); if (tenMoi.trim() && tenMoi.trim() !== p.tieu_de) doi(p, { tieu_de: tenMoi.trim() }); }}>
                      <input autoFocus value={tenMoi} onChange={(e) => setTenMoi(e.target.value)} onBlur={(e) => e.currentTarget.form?.requestSubmit()} maxLength={120} aria-label="Tên cuộc trò chuyện" />
                    </form>
                  ) : (
                    <button className="stt-ds-mo" onClick={() => onMo(p.id)}>
                      <span className="stt-ds-td">{p.ghim && <IcGhim />}<span>{p.tieu_de}</span></span>
                      <small>{p.dang_chay ? <em>Đang chạy…</em> : NHOM_NGAY(p.cap_nhat) === 'Hôm nay' ? gioPhut(p.cap_nhat) : ngayGio(p.cap_nhat)}{p.cuoi ? ' · ' + p.cuoi : ''}</small>
                    </button>
                  )}
                  {sua !== p.id && <button className="stt-ds-them" onClick={() => { setMenu(menu === p.id ? null : p.id); setXoa(null); }} aria-label="Tuỳ chọn" aria-expanded={menu === p.id}><IcBaCham /></button>}
                  {menu === p.id && (
                    <div className="stt-ds-menu">
                      <button onClick={() => { setMenu(null); setSua(p.id); setTenMoi(p.tieu_de); }}>Đổi tên</button>
                      <button onClick={() => doi(p, { ghim: !p.ghim })}>{p.ghim ? 'Bỏ ghim' : 'Ghim lên đầu'}</button>
                      <button className="do" onClick={() => (xoa === p.id ? doi(p, { an: true }) : setXoa(p.id))}>{xoa === p.id ? 'Chạm lần nữa để xoá' : 'Xoá'}</button>
                    </div>
                  )}
                </div>
              ))}
            </section>
          ))}
        </div>
        <button className="stt-ds-nk" onClick={onNhatKy}><IcClock />Nhật ký việc & phiếu duyệt</button>
      </aside>
    </>
  );
}

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
function CaiDat({ token, onDoi, baoToast, onCt }) {
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
  // NEW - 3.132 đối chiếu số liệu AI với công thức màn hình
  const [dc, setDc] = useState(null);
  const doiChieu = async () => { setDang('dc'); setDc(null); try { setDc(await aiDoiChieu(token)); } catch (e) { setDc({ loi: e.message }); } setDang(''); };
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
        <h4>Đối chiếu số liệu với màn hình</h4>
        <p className="stt-nho">Chạy lại các công cụ của AI rồi so với đúng công thức màn hình: Lịch đề nghị 38 ngày, bán 14 ngày theo nhóm, bán hôm nay, hồ sơ 12 cửa hàng.</p>
        <button className="btn btn-ghost" onClick={doiChieu} disabled={dang === 'dc'}><IcCheck /> {dang === 'dc' ? 'Đang đối chiếu…' : 'Đối chiếu ngay'}</button>
        {dc?.loi && <p className="stt-loi"><IcAlert />{dc.loi}</p>}
        {dc?.muc && (
          <div className="stt-thu">
            {dc.muc.map((m) => (
              <div key={m.ten} className={'stt-thu-dong ' + (m.khop === m.so ? 'ok' : 'hong')}>
                <b>{m.khop === m.so ? '✓' : '✗'} {m.ten}</b>
                <span>{m.khop}/{m.so} khớp · so với {m.so_sanh_voi} · {m.pham_vi}</span>
                {m.lech && <code className="stt-dc-lech">{JSON.stringify(m.lech).slice(0, 400)}</code>}
              </div>
            ))}
            <p className="stt-nho">Chạy lúc {gioPhut(dc.luc)} · {giay(dc.ms)}</p>
          </div>
        )}
      </section>
      <XungHo token={token} map={cfg.xung_ho || {}} onLuu={(m) => luu({ xung_ho: m })} />
      <TuHoc token={token} baoToast={baoToast} />
      <TriThuc token={token} baoToast={baoToast} />
      <BaoSaiDs token={token} onCt={onCt} />
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
// ---------------------------------------------------------------------------
// NEW - 3.159.5 VẤN ĐỀ HIỆN TẠI (sổ vấn đề toàn app — máy chủ tính từ dữ liệu, 0 token): hiện ngay khi mở khung, đỏ trước
// ---------------------------------------------------------------------------
function VanDeKhung({ vd, onTai, onHoi, onMo, choDung }) {
  const [het, setHet] = useState(false);
  if (!vd) return null;
  const ds = vd.ds || [];
  const hien = het ? ds : ds.slice(0, 6);
  return (
    <div className="stt-vd">
      <div className="stt-vd-dau">
        <b>{ds.length ? `Vấn đề hiện tại · ${vd.so_do || 0} đỏ · ${vd.so_vang || 0} vàng` : 'Chưa thấy vấn đề nào trong app'}</b>
        <button className="stt-lk" onClick={onTai} title="Tính lại ngay">{vd.tuoi_phut != null ? `${vd.tuoi_phut} phút trước` : ''} ↻</button>
      </div>
      {hien.map((x, i) => (
        <div key={i} className={'stt-vd-dong ' + (x.muc === 'do' ? 'do' : 'vang')}>
          <button className="stt-vd-ten" onClick={() => onMo(x)} title="Mở màn liên quan">
            <span>{x.nhom}</span><b>{x.tieu_de}</b>{x.chi_tiet && <small>{x.chi_tiet}</small>}</button>
          <button className="stt-vd-hoi" onClick={() => onHoi(x)} disabled={choDung} title="Hỏi AI phân tích và cách xử lý">Hỏi</button>
        </div>
      ))}
      {ds.length > 6 && <button className="stt-lk" onClick={() => setHet((v) => !v)}>{het ? 'Thu gọn' : `Xem thêm ${ds.length - 6} mục`}</button>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// NEW - 3.159.5 TỰ HỌC (Quản trị): token hôm nay (trả lời / tự học / trần), các lượt học, bật tắt, trần, Học ngay
// ---------------------------------------------------------------------------
const TT_HOC = { dang_chay: 'Đang học', xong: 'Xong', loi: 'Lỗi', bo: 'Bỏ qua' };
function TuHoc({ token, baoToast }) {
  const [d, setD] = useState(null);
  const [loi, setLoi] = useState('');
  const [dang, setDang] = useState('');
  const [tran, setTran] = useState('');
  const [gio, setGio] = useState('');
  const tai = useCallback(() => aiHocXem(token).then((x) => { setD(x); setTran(String(x?.cfg?.tran_token_ngay ?? '')); setGio(String(x?.cfg?.cach_gio ?? '')); setLoi(''); }, (e) => setLoi(e.message)), [token]);
  useEffect(() => { tai(); }, [tai]);
  useEffect(() => {   // đang học: 8 giây cập nhật 1 lần
    if (!d?.lan?.some((x) => x.trang_thai === 'dang_chay')) return undefined;
    const t = setTimeout(tai, 8000); return () => clearTimeout(t);
  }, [d, tai]);
  const luu = async (p) => {
    setDang('luu');
    try { await aiHocCauHinh(token, p); baoToast?.('Đã lưu thông số tự học'); await tai(); } catch (e) { baoToast?.('Chưa lưu được: ' + e.message); }
    setDang('');
  };
  const hocNgay = async () => {
    setDang('hoc');
    const r = await goiJson({ token, hanh_dong: 'hoc', tay: true });
    setDang('');
    baoToast?.(r?.chay ? `Đang học ${r.so_cau} câu hỏi — xong sẽ có bài học ở "Chờ duyệt"` : (r?.ly_do || r?.loi || 'Chưa học được'));
    setTimeout(tai, 1500);
  };
  if (loi) return <section><h4>Tự học</h4><p className="stt-loi"><IcAlert />{loi}</p></section>;
  if (!d) return <section><h4>Tự học</h4><p className="stt-trong"><i className="stt-quay" /> Đang tải…</p></section>;
  const c = d.cfg || {}, h = d.hom_nay || {};
  const trLoi = Number(h.tra_loi_vao || 0) + Number(h.tra_loi_ra || 0), tuHoc = Number(h.tu_hoc || 0), tranN = Number(c.tran_token_ngay || 0);
  return (
    <section>
      <h4>Tự học {c.bat === false ? <span className="stt-chip c-loi">đang tắt</span> : <span className="stt-chip c-xong">đang bật</span>}
        {d.cho_duyet > 0 && <span className="stt-chip c-cho_duyet">{d.cho_duyet} bài chờ duyệt</span>}</h4>
      <p className="stt-nho">Mỗi lần có người mở app (tối thiểu cách {c.cach_gio || 4} giờ), AI đọc lại các câu đã hỏi, câu bị sửa, báo sai, lỗi và sổ vấn đề → rút bài học (nghĩa từ, quy tắc, lỗi cần tránh, câu mẫu, kiến thức) kèm bằng chứng → nằm ở "Chờ duyệt". Anh duyệt mới dùng. Không có bằng chứng là câu hỏi thật thì bỏ.</p>
      <div className="stt-hoc-so">
        <div><small>Hôm nay · trả lời</small><b>{fmt(trLoi)}</b><em>token · {fmt(h.tra_loi_lan)} lượt gọi</em></div>
        <div><small>Hôm nay · tự học</small><b>{fmt(tuHoc)}</b><em>/ trần {fmt(tranN)} token · {fmt(h.tu_hoc_lan)} lượt</em>
          <i className="stt-hoc-thanh"><i style={{ width: Math.min(100, tranN ? (tuHoc / tranN) * 100 : 0) + '%' }} /></i></div>
      </div>
      <div className="stt-hoc-7">{(d.bay_ngay || []).map((x) => (
        <span key={x.ngay} title={`${x.ngay}: trả lời ${fmt(x.tra_loi)} · tự học ${fmt(x.tu_hoc)} token`}>
          <i style={{ height: Math.max(2, Math.min(40, (Number(x.tra_loi) + Number(x.tu_hoc)) / Math.max(1, ...(d.bay_ngay || []).map((y) => Number(y.tra_loi) + Number(y.tu_hoc))) * 40)) }}>
            <i style={{ height: (Number(x.tu_hoc) / Math.max(1, Number(x.tra_loi) + Number(x.tu_hoc))) * 100 + '%' }} /></i>
          <small>{String(x.ngay).slice(8, 10)}</small></span>
      ))}</div>
      <p className="stt-nho">Cột 7 ngày: phần xanh đậm = tự học, phần còn lại = trả lời.</p>
      <div className="stt-hang stt-hoc-ts">
        <label>Trần tự học / ngày<input inputMode="numeric" value={tran} onChange={(e) => setTran(e.target.value.replace(/[^\d]/g, ''))} /><span>token</span></label>
        <label>Học cách<input inputMode="numeric" value={gio} onChange={(e) => setGio(e.target.value.replace(/[^\d]/g, ''))} /><span>giờ</span></label>
        <button className="btn btn-ghost" disabled={dang === 'luu' || (tran === String(c.tran_token_ngay ?? '') && gio === String(c.cach_gio ?? ''))}
          onClick={() => luu({ tran_token_ngay: Number(tran) || 0, cach_gio: Number(gio) || 4 })}>Lưu</button>
        <button className="btn btn-ghost" disabled={dang === 'luu'} onClick={() => luu({ bat: c.bat === false })}>{c.bat === false ? 'Bật tự học' : 'Tắt tự học'}</button>
        <button className="btn btn-ai" disabled={dang === 'hoc' || c.bat === false} onClick={hocNgay}><IcSpark /> {dang === 'hoc' ? 'Đang gửi…' : 'Học ngay'}</button>
      </div>
      {(d.lan || []).length > 0 && (
        <ul className="stt-hoc-lan">{d.lan.map((x) => (
          <li key={x.id} className={x.trang_thai}>
            <div><b>{x.luc}</b><span className={'stt-chip c-' + (x.trang_thai === 'xong' ? 'xong' : x.trang_thai === 'loi' ? 'loi' : 'cho_duyet')}>{TT_HOC[x.trang_thai] || x.trang_thai}</span>
              <small>{x.kich_hoat === 'tay' ? 'bấm tay' : 'khi mở app'}{x.so_cau ? ` · ${x.so_cau} câu` : ''}{x.token ? ` · ${fmt(x.token)} token` : ''}{x.trang_thai === 'xong' ? ` · ${x.so_bai} bài mới${x.so_trung ? `, ${x.so_trung} trùng bỏ` : ''}` : ''}{x.giay ? ` · ${x.giay} giây` : ''}</small></div>
            {(x.tom_tat || x.loi) && <p className={x.loi ? 'stt-loi' : ''}>{x.loi || x.tom_tat}</p>}
          </li>
        ))}</ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// NEW - 3.133 TRI THỨC (bộ não): nghĩa từ ngữ / quy tắc / bài học sửa sai — xem, thêm, sửa, duyệt, tắt, xoá
// ---------------------------------------------------------------------------
const LOAI_TT = { tu_ngu: 'Từ ngữ', quy_tac: 'Quy tắc luôn áp dụng', sua_sai: 'Bài học sửa sai', cau_mau: 'Câu mẫu đã học', kien_thuc: 'Kiến thức' };   // NEW - 3.159.5: + câu mẫu, kiến thức
const NGUON_TT = { he_thong: 'Hệ thống', ai_ghi_nho: 'AI ghi nhớ', quan_tri: 'Quản trị', nguoi_dung: 'Người dùng', tu_hoc: 'AI tự học' };
const CC_TT = [['', 'Không chỉ định'], ['lich_de_nghi', 'Lịch đề nghị'], ['tong_quan', 'Tổng quan'], ['ho_so', 'Hồ sơ'], ['xep_hang', 'Xếp hạng'], ['hoi_so_lieu', 'Tự tra số liệu'], ['chia_doi', 'Chia từng đội']];
function FormTT({ v, onDoi, onLuu, onHuy, dang }) {
  const thieuCum = v.loai === 'tu_ngu' && !String(v.cum_tu || '').trim();
  return (
    <div className="stt-tt-form">
      <div className="stt-luoi">
        <label>Loại<Sel value={v.loai} onChange={(x) => onDoi({ ...v, loai: x })} options={Object.entries(LOAI_TT).map(([value, label]) => ({ value, label }))} /></label>
        <label>Công cụ nên dùng<Sel value={v.cong_cu || ''} onChange={(x) => onDoi({ ...v, cong_cu: x })} options={CC_TT.map(([value, label]) => ({ value, label }))} /></label>
      </div>
      <label>Cụm từ (cách nhau dấu phẩy){v.loai === 'tu_ngu' ? '' : ' — không bắt buộc'}<input value={v.cum_tu || ''} onChange={(e) => onDoi({ ...v, cum_tu: e.target.value })} placeholder="vd: đi hàng, chia tồn kho" /></label>
      {(v.loai === 'sua_sai' || v.loai === 'cau_mau') && <label>Câu hỏi mẫu<input value={v.cau_mau || ''} onChange={(e) => onDoi({ ...v, cau_mau: e.target.value })} placeholder={v.loai === 'sua_sai' ? 'Câu hỏi từng bị trả lời sai' : 'Câu hỏi hay gặp, đúng cách người dùng nói'} /></label>}
      <label>Nội dung — AI sẽ hiểu thế này<textarea rows={3} value={v.noi_dung || ''} onChange={(e) => onDoi({ ...v, noi_dung: e.target.value })} maxLength={800} /></label>
      <div className="stt-bs-nut">
        <button type="button" className="btn btn-ghost" onClick={onHuy}>Huỷ</button>
        <button type="button" className="btn btn-ai" disabled={dang || !String(v.noi_dung || '').trim() || thieuCum} onClick={onLuu}>{dang ? 'Đang lưu…' : 'Lưu'}</button>
      </div>
    </div>
  );
}
function TriThuc({ token, baoToast }) {
  const [ds, setDs] = useState(null);
  const [tim, setTim] = useState('');
  const [loc, setLoc] = useState('');
  const [sua, setSua] = useState(null);
  const [xoa, setXoa] = useState(null);
  const [dang, setDang] = useState(false);
  const [loi, setLoi] = useState('');
  const tai = useCallback((t) => aiTriThucDs(token, t).then((x) => { setDs(Array.isArray(x) ? x : []); setLoi(''); }, (e) => setLoi(e.message)), [token]);
  useEffect(() => { const h = setTimeout(() => tai(tim.trim()), tim ? 300 : 0); return () => clearTimeout(h); }, [tim, tai]);
  const luu = async (p, bao) => {
    setDang(true);
    try { await aiTriThucLuu(token, p); baoToast?.(bao); setSua(null); setXoa(null); await tai(tim.trim()); } catch (e) { baoToast?.('Chưa lưu được: ' + e.message); }
    setDang(false);
  };
  const luuForm = () => luu({ ...(sua.id ? { id: sua.id } : {}), loai: sua.loai, cum_tu: String(sua.cum_tu || '').trim(), noi_dung: String(sua.noi_dung || '').trim(),
    cong_cu: sua.cong_cu || '', cau_mau: sua.loai === 'sua_sai' || sua.loai === 'cau_mau' ? String(sua.cau_mau || '').trim() : '' }, sua.id ? 'Đã sửa tri thức' : 'Đã thêm — AI dùng từ câu sau');
  const dem = useMemo(() => {
    const d = ds || [];
    return { dung: d.filter((x) => x.trang_thai === 'dung').length, cho: d.filter((x) => x.trang_thai === 'cho_duyet').length, tat: d.filter((x) => x.trang_thai === 'tat').length, sua_sai: d.filter((x) => x.loai === 'sua_sai').length,
      tu_hoc: d.filter((x) => x.nguon === 'tu_hoc').length };
  }, [ds]);
  const hien = (ds || []).filter((x) => !loc || (loc === 'sua_sai' ? x.loai === 'sua_sai' : loc === 'tu_hoc' ? x.nguon === 'tu_hoc' : x.trang_thai === loc));
  // NEW - 3.159.5: duyệt 1 lượt các mục đang hiện mà còn chờ duyệt (đã xem bằng chứng từng mục)
  const choHien = hien.filter((x) => x.trang_thai === 'cho_duyet');
  const duyetHet = async () => {
    setDang(true);
    let ok = 0; for (const x of choHien) { try { await aiTriThucLuu(token, { id: x.id, trang_thai: 'dung' }); ok += 1; } catch { /* */ } }
    setDang(false); setXoa(null); baoToast?.(`Đã duyệt ${ok} mục — AI dùng từ câu sau`); tai(tim.trim());
  };
  const formEl = sua && <FormTT v={sua} onDoi={setSua} onLuu={luuForm} onHuy={() => setSua(null)} dang={dang} />;
  return (
    <section>
      <h4>Tri thức (bộ não) {dem.cho > 0 && <span className="stt-chip c-cho_duyet">{dem.cho} chờ duyệt</span>}</h4>
      <p className="stt-nho">Nghĩa từ ngữ, quy tắc và bài học sửa sai. Mỗi câu hỏi, máy chủ tự nạp các mục khớp để AI hiểu đúng ý. AI tự ghi nhớ khi được giải thích hoặc sửa — Quản trị dạy thì dùng ngay, người khác dạy thì chờ duyệt.</p>
      <div className="stt-hang">
        <input value={tim} onChange={(e) => setTim(e.target.value)} placeholder="Tìm từ ngữ, nội dung…" />
        <button className="btn btn-ai" onClick={() => setSua({ loai: 'tu_ngu', cum_tu: '', noi_dung: '', cong_cu: '' })} disabled={!!sua && !sua.id}>Thêm</button>
      </div>
      <div className="stt-cong">{[['', 'Tất cả', ds?.length || 0], ['cho_duyet', 'Chờ duyệt', dem.cho], ['tu_hoc', 'AI tự học', dem.tu_hoc], ['dung', 'Đang dùng', dem.dung], ['tat', 'Đã tắt', dem.tat], ['sua_sai', 'Bài học sửa sai', dem.sua_sai]].map(([k, t, n]) => (
        <button key={k} className={loc === k ? 'on' : ''} onClick={() => setLoc(k)}>{t} {n}</button>
      ))}</div>
      {(loc === 'cho_duyet' || loc === 'tu_hoc') && choHien.length > 1 && <button className="btn btn-ghost stt-duyet-het" disabled={dang} onClick={duyetHet}><IcCheck /> Duyệt hết {choHien.length} mục đang chờ</button>}
      {sua && !sua.id && formEl}
      {loi && <p className="stt-loi"><IcAlert />{loi}</p>}
      {!ds ? <p className="stt-trong"><i className="stt-quay" /> Đang tải…</p> : hien.length === 0 ? <p className="stt-trong">Không có mục nào.</p> : (
        <ul className="stt-tt-ds">{hien.map((x) => (sua?.id === x.id ? <li key={x.id} className="stt-tt sua">{formEl}</li> : (
          <li key={x.id} className={'stt-tt ' + x.trang_thai}>
            <div className="stt-tt-dau">
              <span className={'stt-chip tt-' + x.loai}>{LOAI_TT[x.loai] || x.loai}</span>
              {x.trang_thai === 'cho_duyet' && <span className="stt-chip c-cho_duyet">Chờ duyệt</span>}
              {x.trang_thai === 'tat' && <span className="stt-chip tt-tat">Đã tắt</span>}
              <b>{x.cum_tu || (x.cau_mau ? '“' + x.cau_mau + '”' : '—')}</b>
            </div>
            <p>{x.noi_dung}</p>
            {x.bang_chung && <small className="stt-tt-bc">Bằng chứng: {x.bang_chung.ly_do || '—'}{x.bang_chung.viec?.length ? ` · từ ${x.bang_chung.viec.length} câu hỏi` : ''}</small>}
            <small className="stt-tt-meta">{NGUON_TT[x.nguon] || x.nguon}{x.nguoi ? ' · ' + x.nguoi : ''}{x.cong_cu ? ' · dùng công cụ ' + x.cong_cu : ''} · đã nạp {fmt(x.so_lan_dung)} lần{x.dung_cuoi ? ' · gần nhất ' + ngayGio(x.dung_cuoi) : ''}</small>
            <div className="stt-tt-nut">
              {x.trang_thai === 'cho_duyet' && <button className="stt-lk" disabled={dang} onClick={() => luu({ id: x.id, trang_thai: 'dung' }, 'Đã duyệt — AI dùng từ câu sau')}>Duyệt</button>}
              <button className="stt-lk" onClick={() => { setXoa(null); setSua({ id: x.id, loai: x.loai, cum_tu: x.cum_tu || '', noi_dung: x.noi_dung || '', cong_cu: x.cong_cu || '', cau_mau: x.cau_mau || '' }); }}>Sửa</button>
              {x.trang_thai !== 'cho_duyet' && <button className="stt-lk" disabled={dang} onClick={() => luu({ id: x.id, trang_thai: x.trang_thai === 'tat' ? 'dung' : 'tat' }, x.trang_thai === 'tat' ? 'Đã bật lại' : 'Đã tắt — AI không dùng mục này nữa')}>{x.trang_thai === 'tat' ? 'Bật lại' : 'Tắt'}</button>}
              <button className={'stt-lk' + (xoa === x.id ? ' do' : '')} disabled={dang} onClick={() => (xoa === x.id ? luu({ id: x.id, xoa: true }, 'Đã xoá') : setXoa(x.id))}>{xoa === x.id ? 'Bấm lần nữa để xoá' : 'Xoá'}</button>
            </div>
          </li>
        )))}</ul>
      )}
    </section>
  );
}
// NEW - 3.134 XƯNG HÔ theo tài khoản: AI gọi "anh" / "chị"; chưa đặt thì gọi "anh/chị" (không đoán theo tên)
const XH = [['anh', 'Anh'], ['chị', 'Chị'], ['', 'Anh/chị']];
function XungHo({ token, map, onLuu }) {
  const [ds, setDs] = useState(null);
  const [tim, setTim] = useState('');
  const [loi, setLoi] = useState('');
  useEffect(() => {
    const h = setTimeout(() => aiNguoiDs(token, tim.trim()).then((x) => { setDs(Array.isArray(x) ? x : []); setLoi(''); }, (e) => setLoi(e.message)), tim ? 300 : 0);
    return () => clearTimeout(h);
  }, [token, tim]);
  const dat = (ma, v) => { const m = { ...map }; if (v) m[ma] = v; else delete m[ma]; onLuu(m); };
  return (
    <section>
      <h4>Xưng hô</h4>
      <p className="stt-nho">AI gọi từng tài khoản đúng như đặt ở đây. Tài khoản chưa đặt (thường là tài khoản dùng chung) được gọi "anh/chị" — AI không đoán theo tên.</p>
      <input value={tim} onChange={(e) => setTim(e.target.value)} placeholder="Tìm tài khoản, tên…" />
      {loi && <p className="stt-loi"><IcAlert />{loi}</p>}
      {!ds ? <p className="stt-trong"><i className="stt-quay" /> Đang tải…</p> : ds.length === 0 ? <p className="stt-trong">Không có tài khoản nào.</p> : (
        <ul className="stt-xh-ds">{ds.map((x) => (
          <li key={x.ma}>
            <div><b>{x.ten || x.ma}</b><small>{x.ma} · {x.vai_tro}</small></div>
            <div className="stt-cong">{XH.map(([v, t]) => (
              <button key={t} className={(map[x.ma] || '') === v ? 'on' : ''} onClick={() => dat(x.ma, v)}>{t}</button>
            ))}</div>
          </li>
        ))}</ul>
      )}
    </section>
  );
}
// NEW - 3.133 danh sách câu trả lời bị báo sai (Quản trị)
function BaoSaiDs({ token, onCt }) {
  const [ds, setDs] = useState(null);
  const [loi, setLoi] = useState('');
  const tai = useCallback((id) => aiDsBaoSai(token, id ?? null, id ? 'Đã xử lý' : null).then((x) => { setDs(Array.isArray(x) ? x : []); setLoi(''); }, (e) => setLoi(e.message)), [token]);
  useEffect(() => { tai(); }, [tai]);
  const chua = (ds || []).filter((x) => !x.xu_ly).length;
  return (
    <section>
      <h4>Câu trả lời bị báo sai {ds && (chua ? <span className="stt-chip c-loi">{chua} chưa xử lý</span> : ds.length > 0 && <span className="stt-chip c-xong">đã xử lý hết</span>)}</h4>
      <p className="stt-nho">Mỗi lần có người bấm Báo sai dưới câu trả lời. Dùng để sửa công cụ tận gốc; bài học tự lưu nằm ở mục Tri thức.</p>
      {loi && <p className="stt-loi"><IcAlert />{loi}</p>}
      {!ds ? <p className="stt-trong"><i className="stt-quay" /> Đang tải…</p> : ds.length === 0 ? <p className="stt-trong">Chưa có báo sai nào.</p> : (
        <ul className="stt-tt-ds">{ds.map((x) => (
          <li key={x.id} className={'stt-tt stt-bsd' + (x.xu_ly ? ' tat' : '')}>
            <div className="stt-tt-dau"><b>{x.nguoi}</b><small className="stt-tt-meta">{ngayGio(x.tao_luc)}</small></div>
            {x.yeu_cau && <p className="stt-bsd-hoi"><small>Hỏi</small>{x.yeu_cau}</p>}
            <p className="stt-bsd-sai"><small>Sai</small>{x.ghi_chu}</p>
            <div className="stt-tt-nut">
              {x.viec_id && <button className="stt-lk" onClick={() => onCt?.(x.viec_id)}>Xem việc</button>}
              {x.xu_ly ? <small className="stt-tt-meta">{x.xu_ly} · {ngayGio(x.xu_ly_luc)}</small> : <button className="stt-lk" onClick={() => tai(x.id)}>Đánh dấu đã xử lý</button>}
            </div>
          </li>
        ))}</ul>
      )}
    </section>
  );
}
function OChu({ gt, onLuu, so }) {
  const [v, setV] = useState(gt ?? '');
  useEffect(() => { setV(gt ?? ''); }, [gt]);
  return <input inputMode={so ? 'numeric' : undefined} value={v} onChange={(e) => setV(e.target.value)}
    onBlur={() => { if (String(v) !== String(gt ?? '')) onLuu(v); }} onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }} />;
}
export { VanDeKhung, TuHoc };   // NEW - 3.159.5 (dùng cho thử giao diện)
