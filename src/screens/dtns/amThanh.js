// Âm thanh tổng hợp bằng Web Audio — không tải file, không phụ thuộc mạng.
// Trình duyệt chỉ cho phát sau một cú bấm của người dùng -> gọi moKhoa() trong sự kiện bấm "Vào thi / Xem".

const KHOA = 'dtns_am';
let ctx = null;
let bat = (() => { try { return localStorage.getItem(KHOA) !== '0'; } catch { return true; } })();

export const amDangBat = () => bat;
export function datAm(v) {
  bat = !!v;
  try { localStorage.setItem(KHOA, bat ? '1' : '0'); } catch { /* bỏ qua */ }
}
export function moKhoa() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { ctx = null; }
}

function not(tan, batDau, dai, { loai = 'sine', am = 0.12, truot = null } = {}) {
  if (!bat || !ctx) return;
  const t0 = ctx.currentTime + batDau;
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = loai; o.frequency.setValueAtTime(tan, t0);
  if (truot) o.frequency.exponentialRampToValueAtTime(truot, t0 + dai);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(am, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dai);
  o.connect(g).connect(ctx.destination);
  o.start(t0); o.stop(t0 + dai + 0.02);
}

export const am = {
  tich: () => not(880, 0, 0.07, { loai: 'square', am: 0.04 }),
  tichGap: () => not(1320, 0, 0.09, { loai: 'square', am: 0.06 }),
  bam: () => not(520, 0, 0.06, { loai: 'triangle', am: 0.08 }),
  dung: () => { not(660, 0, 0.12); not(880, 0.09, 0.12); not(1320, 0.18, 0.22, { am: 0.1 }); },
  sai: () => { not(220, 0, 0.28, { loai: 'sawtooth', am: 0.06, truot: 140 }); },
  congBo: () => not(300, 0, 0.35, { loai: 'triangle', am: 0.07, truot: 900 }),
  vong: () => { [523, 659, 784, 1047].forEach((f, i) => not(f, i * 0.11, 0.18, { loai: 'triangle', am: 0.09 })); },
  ketThuc: () => {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => not(f, i * 0.14, 0.24, { loai: 'triangle', am: 0.1 }));
    not(1568, 0.9, 0.6, { am: 0.07 });
  },
  vao: () => { not(392, 0, 0.1, { loai: 'triangle' }); not(587, 0.08, 0.16, { loai: 'triangle' }); },
};
