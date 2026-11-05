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

// tiếng ồn ngắn (vỗ tay khán đài)
function on(batDau, dai, am = 0.05, loc = 1400) {
  if (!bat || !ctx) return;
  const t0 = ctx.currentTime + batDau;
  const n = Math.floor(ctx.sampleRate * dai);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate); const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = loc; f.Q.value = 0.8;
  const g = ctx.createGain(); g.gain.value = am;
  src.connect(f).connect(g).connect(ctx.destination); src.start(t0);
}

export const am = {
  tim: () => { not(62, 0, 0.16, { am: 0.22, truot: 44 }); not(58, 0.18, 0.14, { am: 0.16, truot: 40 }); },
  voTay: () => { for (let i = 0; i < 14; i++) on(i * 0.07 + Math.random() * 0.05, 0.06, 0.035 + Math.random() * 0.03, 1100 + Math.random() * 900); },
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
