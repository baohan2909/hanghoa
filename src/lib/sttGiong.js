// ============================================================================
// NEW - 3.129 SIÊU TRÍ TUỆ · nhập giọng nói (Web Speech, tiếng Việt)
//   - Nói dài liên tục: máy nhận dạng tự ngắt (im lặng / hết ~1 phút) -> tự mở lại và NỐI tiếp chữ đã nói
//   - Chạm micro lần nữa = dừng & chốt chữ · Huỷ = trả ô về như trước khi nói · Gửi = dừng ngay, bỏ kết quả đến muộn
//   - Có đồng hồ canh: máy không báo kết thúc vẫn tự nhả micro -> lần bấm sau luôn chạy (lỗi "chỉ nói được 1 lần")
//   - Chữ đi thẳng vào ô nhập (ô nhập tự lưu nháp) -> có sự cố cũng không mất
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

const LOI_DUNG = {
  'not-allowed': 'Chưa cho phép dùng micro — bật quyền micro cho trang này rồi bấm lại',
  'service-not-allowed': 'Máy chưa bật Đọc chính tả (Cài đặt › Cài đặt chung › Bàn phím › Bật Đọc chính tả) — hoặc dùng nút micro trên bàn phím',
  'audio-capture': 'Không mở được micro — có ứng dụng khác đang dùng micro?',
  'language-not-supported': 'Máy chưa hỗ trợ nhận giọng nói tiếng Việt',
};
const IM_TOI_DA = 30000;          // im lặng 30 giây -> tự dừng (tránh quên tắt micro)
const NOI_TOI_DA = 15 * 60000;    // 1 lượt nói tối đa 15 phút

export function useGiong({ layNhap, datNhap, bao }) {
  const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
  const laAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
  const [nghe, setNghe] = useState(false);
  const [tu, setTu] = useState(0);
  const ss = useRef(null);
  const fn = useRef({});

  const viet = (s) => {
    const moi = ghep(s.chot, ghep(s.fin, s.tam));
    datNhap(s.goc ? (moi ? s.goc + ' ' + moi : s.goc) : moi);
  };
  const ket = (s, thongBao) => {
    if (s.xong) return;
    s.xong = true;
    clearTimeout(s.tIm); clearTimeout(s.tDung); clearTimeout(s.tMax);
    try { s.r?.abort(); } catch { /* */ }
    if (ss.current === s) { ss.current = null; setNghe(false); }
    if (thongBao) bao?.(thongBao);
  };
  const henIm = (s) => { clearTimeout(s.tIm); s.tIm = setTimeout(() => { if (ss.current === s) fn.current.dung(); }, IM_TOI_DA); };

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
      // no-speech / aborted: để onend tự mở lại
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

  const batDau = () => {
    if (!SR) { bao?.('Trình duyệt này chưa hỗ trợ nhập giọng nói — dùng Safari / Chrome bản mới, hoặc micro trên bàn phím'); return; }
    const s = { goc: String(layNhap() || '').trim(), chot: '', fin: '', tam: '', giu: true, lan: 0 };
    ss.current = s; setNghe(true); setTu(Date.now());
    henIm(s);
    s.tMax = setTimeout(() => { if (ss.current === s) fn.current.dung(); }, NOI_TOI_DA);
    khoi(s);
  };
  // chạm dừng: chốt chữ (chờ kết quả cuối tối đa 1,5 giây rồi tự nhả micro)
  const dung = () => {
    const s = ss.current; if (!s) return;
    s.giu = false;
    try { s.r?.stop(); } catch { /* */ }
    clearTimeout(s.tDung);
    s.tDung = setTimeout(() => {
      if (ss.current !== s) return;
      s.chot = ghep(s.chot, ghep(s.fin, s.tam)); s.fin = ''; s.tam = '';
      viet(s); ket(s);
    }, 1500);
  };
  // gửi đi / đóng: dừng ngay, kết quả đến muộn bị bỏ
  const huy = () => { const s = ss.current; if (s) { s.giu = false; ket(s); } };
  // huỷ lượt nói: trả ô nhập về như trước khi nói
  const boLuot = () => { const s = ss.current; if (s) { s.giu = false; ket(s); datNhap(s.goc); } };
  fn.current = { dung, huy };

  // chuyển sang app khác / khoá máy: chốt chữ, nhả micro
  useEffect(() => {
    const f = () => { if (document.visibilityState === 'hidden' && ss.current) fn.current.dung(); };
    document.addEventListener('visibilitychange', f);
    return () => { document.removeEventListener('visibilitychange', f); fn.current.huy(); };
  }, []);

  return { co: !!SR, nghe, tu, bam: () => (ss.current ? dung() : batDau()), dung, huy, boLuot };
}
