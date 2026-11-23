// ============================================================================
// NEW - 3.129 SIÊU TRÍ TUỆ · nhập giọng nói (Web Speech, tiếng Việt)
//   - Nói dài liên tục: máy nhận dạng tự ngắt (im lặng / hết ~1 phút) -> tự mở lại và NỐI tiếp chữ đã nói
//   - Chạm micro lần nữa = dừng & chốt chữ · Huỷ = trả ô về như trước khi nói · Gửi = dừng ngay, bỏ kết quả đến muộn
//   - Chữ đi thẳng vào ô nhập (ô nhập tự lưu nháp) -> có sự cố cũng không mất
// NEW - 3.134 IPHONE: sửa "lần 1 ngon, lần 2–3 micro vẫn bật mà không ra chữ"
//   Nguyên nhân: lỗi của Safari iOS (WebKit bug 321436) — phiên nhận giọng nào bị CẮT bằng stop()/abort()
//   thì mọi phiên sau đều "điếc" (vẫn bật micro, không trả chữ) tới khi chờ ~1 phút hoặc tắt hẳn app.
//   Cách làm trên iPhone:
//     1. KHÔNG BAO GIỜ gọi stop()/abort(): chạm dừng = chốt chữ + ngừng nhận, phiên tự kết thúc khi máy nhả.
//     2. Phiên còn sống thì lượt nói sau DÙNG LẠI phiên đó (không mở phiên mới) — chỉ lấy phần chữ nói sau mốc.
//     3. Phải mở phiên mới (sau lần đầu) thì máy đọc 1 câu ngắn trước rồi mới mở micro (cách vượt lỗi đã được xác nhận).
//     4. 8 giây không ra chữ -> hiện gợi ý dùng micro trên bàn phím (luôn chạy được).
//   Android / máy tính: giữ nguyên cách cũ.
// ============================================================================
import { useEffect, useRef, useState } from 'react';

const chuan = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// nối 2 đoạn chữ, chống lặp (iPhone hay trả lại cả câu đã tích luỹ)
export function ghep(a, b) {
  a = String(a || '').trim(); b = String(b || '').trim();
  if (!a) return b;
  if (!b) return a;
  const A = chuan(a), B = chuan(b);
  if (B.startsWith(A)) return b;
  if (B.length >= 6 && A.endsWith(B)) return a;
  return a + ' ' + b;
}
const ghepDs = (ds) => ds.reduce((s, t) => ghep(s, t), '');
// phần chữ nói SAU mốc (phiên dùng lại cho lượt mới): bỏ các từ đầu trùng với mốc
export function sauMoc(all, moc) {
  all = String(all || '').trim(); moc = String(moc || '').trim();
  if (!moc) return all;
  if (all.startsWith(moc)) return all.slice(moc.length).trim();
  const a = all.split(/\s+/), b = moc.split(/\s+/);
  let k = 0;
  while (k < a.length && k < b.length && chuan(a[k]) === chuan(b[k])) k++;
  return a.slice(k).join(' ');
}

const LOI_DUNG = {
  'not-allowed': 'Chưa cho phép dùng micro — bật quyền micro cho trang này rồi bấm lại',
  'service-not-allowed': 'Máy chưa bật Đọc chính tả (Cài đặt › Cài đặt chung › Bàn phím › Bật Đọc chính tả) — hoặc dùng nút micro trên bàn phím',
  'audio-capture': 'Không mở được micro — có ứng dụng khác đang dùng micro?',
  'language-not-supported': 'Máy chưa hỗ trợ nhận giọng nói tiếng Việt',
};
const IM_TOI_DA = 30000;          // im lặng 30 giây -> tự dừng (tránh quên tắt micro)
const NOI_TOI_DA = 15 * 60000;    // 1 lượt nói tối đa 15 phút
const CHO_CHU = 8000;             // NEW - 3.134 iPhone: 8 giây không ra chữ -> gợi ý micro bàn phím
const laIOS = () => typeof navigator !== 'undefined' && (/iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

// NEW - 3.134 đọc 1 câu ngắn rồi mới mở micro (vượt lỗi iPhone), tối đa chờ 2,8 giây
function docMoi(cb) {
  const S = typeof window !== 'undefined' ? window.speechSynthesis : null;
  if (!S || typeof window.SpeechSynthesisUtterance === 'undefined') { cb(); return; }
  let xong = false;
  const di = () => { if (xong) return; xong = true; setTimeout(cb, 400); };
  try {
    const u = new window.SpeechSynthesisUtterance('Em đang nghe ạ');
    u.lang = 'vi-VN'; u.rate = 1.05; u.volume = 0.7;
    u.onend = di; u.onerror = di;
    S.cancel(); S.speak(u);
    setTimeout(di, 2800);
  } catch { di(); }
}

export function useGiong({ layNhap, datNhap, bao }) {
  const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
  const laAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
  const ios = laIOS();
  const [nghe, setNghe] = useState(false);
  const [tu, setTu] = useState(0);
  const [canh, setCanh] = useState(null);   // NEW - 3.134 gợi ý khi micro không ra chữ
  const ss = useRef(null);
  const song = useRef(null);                // NEW - 3.134 iPhone: phiên nhận giọng đang sống
  const daMo = useRef(false);               // NEW - 3.134 đã từng mở phiên trong lần mở app này
  const fn = useRef({});

  const viet = (s) => {
    const moi = ghep(s.chot, ghep(s.fin, s.tam));
    datNhap(s.goc ? (moi ? s.goc + ' ' + moi : s.goc) : moi);
  };
  const ket = (s, thongBao) => {
    if (s.xong) return;
    s.xong = true;
    clearTimeout(s.tIm); clearTimeout(s.tDung); clearTimeout(s.tMax); clearTimeout(s.tCho);
    if (!s.ios) { try { s.r?.abort(); } catch { /* */ } }   // iPhone: tuyệt đối không cắt phiên
    if (ss.current === s) { ss.current = null; setNghe(false); setCanh(null); }
    if (thongBao) bao?.(thongBao);
  };
  const henIm = (s) => { clearTimeout(s.tIm); s.tIm = setTimeout(() => { if (ss.current === s) fn.current.dung(); }, IM_TOI_DA); };
  const henCho = (s, ly) => {   // iPhone: canh "micro bật mà không ra chữ"
    clearTimeout(s.tCho);
    s.tCho = setTimeout(() => { if (ss.current === s && !s.coChu) setCanh(ly || 'khong_chu'); }, CHO_CHU);
  };

  // ---------------- Android / máy tính (giữ nguyên cách cũ) ----------------
  const khoi = (s) => {
    let r;
    try { r = new SR(); } catch { ket(s, 'Không mở được nhận giọng nói trên máy này'); return; }
    s.r = r; s.fin = ''; s.tam = ''; s.batDauCon = Date.now();
    r.lang = 'vi-VN'; r.interimResults = true; r.continuous = !laAndroid; r.maxAlternatives = 1;
    r.onresult = (ev) => {
      if (ss.current !== s || s.r !== r) return;
      const f = [], t = [];
      for (let i = 0; i < ev.results.length; i++) { const x = ev.results[i]; (x.isFinal ? f : t).push(x[0]?.transcript || ''); }
      s.fin = ghepDs(f); s.tam = ghepDs(t);
      viet(s); henIm(s);
    };
    r.onerror = (ev) => {
      if (ss.current !== s || s.r !== r) return;
      const e = ev?.error || '';
      if (LOI_DUNG[e]) { s.giu = false; s.loiDung = LOI_DUNG[e]; }
      if (e === 'network') s.loiMang = (s.loiMang || 0) + 1;
    };
    r.onend = () => {
      if (ss.current !== s || s.r !== r) return;
      s.chot = ghep(s.chot, ghep(s.fin, s.tam)); s.fin = ''; s.tam = '';
      viet(s);
      s.chetNhanh = Date.now() - s.batDauCon < 1200 ? (s.chetNhanh || 0) + 1 : 0;
      if (s.giu && s.chetNhanh < 4 && (s.loiMang || 0) < 4 && s.lan < 300) {
        s.lan++;
        setTimeout(() => { if (ss.current === s && s.giu) khoi(s); }, 120);
      } else {
        ket(s, s.loiDung || (s.chetNhanh >= 4 ? 'Micro ngắt liên tục — anh bấm lại, hoặc dùng micro trên bàn phím'
          : (s.loiMang || 0) >= 4 ? 'Mạng yếu nên nhận giọng nói dừng — chữ đã nói vẫn giữ trong ô' : null));
      }
    };
    try { r.start(); } catch {
      setTimeout(() => { if (ss.current === s && s.r === r) { try { r.start(); } catch { ket(s, 'Micro đang bận — anh bấm lại giúp em'); } } }, 350);
    }
  };

  // ---------------- iPhone ----------------
  // gắn lượt nói vào 1 phiên đang sống: chỉ lấy chữ nói sau mốc
  const ganIOS = (s, p) => {
    s.ph = p; s.moc = p.toanBo; s.tam = '';
    if (!p.coKq && Date.now() - p.batDau >= CHO_CHU) setCanh('ket');   // phiên mở lâu mà chưa từng ra chữ = micro đang kẹt
    else henCho(s);
  };
  const moIOS = (s, doc) => {
    const mo = () => {
      if (ss.current !== s || !s.giu) return;
      let r;
      try { r = new SR(); } catch { ket(s, 'Không mở được nhận giọng nói trên máy này'); return; }
      const p = { r, toanBo: '', coKq: false, batDau: Date.now(), song: true };
      song.current = p; daMo.current = true;
      r.lang = 'vi-VN'; r.interimResults = true; r.continuous = true; r.maxAlternatives = 1;
      r.onresult = (ev) => {
        const ds = [];
        for (let i = 0; i < ev.results.length; i++) ds.push(ev.results[i][0]?.transcript || '');
        p.toanBo = ghepDs(ds); p.coKq = true;
        const t = ss.current;
        if (!t || t.ph !== p || !t.giu) return;
        t.tam = sauMoc(p.toanBo, t.moc);
        if (t.tam) { t.coChu = true; clearTimeout(t.tCho); setCanh(null); }
        viet(t); henIm(t);
      };
      r.onerror = (ev) => {
        const e = ev?.error || '';
        const t = ss.current;
        if (t && t.ph === p && LOI_DUNG[e]) { t.giu = false; t.loiDung = LOI_DUNG[e]; }
      };
      r.onend = () => {
        p.song = false;
        if (song.current === p) song.current = null;
        const t = ss.current;
        if (!t || t.ph !== p) return;
        t.chot = ghep(t.chot, t.tam); t.tam = ''; t.ph = null;
        viet(t);
        if (t.loiDung) { ket(t, t.loiDung); return; }
        // máy tự nhả giữa chừng mà anh vẫn đang nói -> mở phiên mới (có đọc câu mồi)
        t.chetNhanh = Date.now() - p.batDau < 1500 ? (t.chetNhanh || 0) + 1 : 0;
        if (t.giu && t.chetNhanh < 3 && t.lan < 60) { t.lan++; moIOS(t, true); }
        else ket(t, t.chetNhanh >= 3 ? 'Micro ngắt liên tục — anh dùng micro trên bàn phím giúp em' : null);
      };
      s.ph = p; s.moc = ''; s.tam = '';
      henCho(s);
      try { r.start(); } catch { ket(s, 'Micro đang bận — anh chờ chút rồi bấm lại, hoặc dùng micro trên bàn phím'); }
    };
    if (doc) docMoi(mo); else mo();
  };

  const batDau = () => {
    if (!SR) { bao?.('Trình duyệt này chưa hỗ trợ nhập giọng nói — dùng Safari / Chrome bản mới, hoặc micro trên bàn phím'); return; }
    const s = { goc: String(layNhap() || '').trim(), chot: '', fin: '', tam: '', giu: true, lan: 0, ios };
    ss.current = s; setNghe(true); setTu(Date.now()); setCanh(null);
    henIm(s);
    s.tMax = setTimeout(() => { if (ss.current === s) fn.current.dung(); }, NOI_TOI_DA);
    if (!ios) { khoi(s); return; }
    const p = song.current;
    if (p && p.song) ganIOS(s, p);          // phiên cũ còn sống -> dùng lại, không mở mới
    else moIOS(s, daMo.current);            // lần đầu mở thẳng; các lần sau đọc câu mồi trước
  };
  // chạm dừng: chốt chữ
  const dung = () => {
    const s = ss.current; if (!s) return;
    s.giu = false;
    if (s.ios) {   // iPhone: chốt ngay, không cắt phiên (phiên tự hết, chữ đến sau bị bỏ)
      s.chot = ghep(s.chot, ghep(s.fin, s.tam)); s.fin = ''; s.tam = ''; s.ph = null;
      viet(s); ket(s); return;
    }
    try { s.r?.stop(); } catch { /* */ }
    clearTimeout(s.tDung);
    s.tDung = setTimeout(() => {
      if (ss.current !== s) return;
      s.chot = ghep(s.chot, ghep(s.fin, s.tam)); s.fin = ''; s.tam = '';
      viet(s); ket(s);
    }, 1500);
  };
  // gửi đi / đóng: dừng ngay, kết quả đến muộn bị bỏ
  const huy = () => { const s = ss.current; if (s) { s.giu = false; s.ph = null; ket(s); } };
  // huỷ lượt nói: trả ô nhập về như trước khi nói
  const boLuot = () => { const s = ss.current; if (s) { s.giu = false; s.ph = null; ket(s); datNhap(s.goc); } };
  fn.current = { dung, huy };

  // chuyển sang app khác / khoá máy: chốt chữ, nhả micro
  useEffect(() => {
    const f = () => { if (document.visibilityState === 'hidden' && ss.current) fn.current.dung(); };
    document.addEventListener('visibilitychange', f);
    return () => { document.removeEventListener('visibilitychange', f); fn.current.huy(); };
  }, []);

  return { co: !!SR, nghe, tu, canh, ios, bam: () => (ss.current ? dung() : batDau()), dung, huy, boLuot };
}
