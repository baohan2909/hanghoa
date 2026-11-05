import { memo } from 'react';

// NHÂN VẬT thi đấu: áo thun trắng cổ tròn, quần đen. Ngoại hình (tóc, da, kính) cố định theo mã người chơi.
// mood: cho | nghi | da-tl | dung | sai | thang | mat (mất kết nối)
const DA = ['#F6D3B3', '#EBBE96', '#CB9168'];
const TOC = ['#1E1B1A', '#3A2A20', '#2B2B33', '#55392A'];

function bam(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function TocSau({ kieu, mau }) {
  if (kieu === 2) return <path d="M18 22 Q16.5 7.5 32 8 Q47.5 7.5 46 22 L47.5 37 Q43 39.5 41 34 L41 21 Q32 14 23 21 L23 34 Q21 39.5 16.5 37 Z" fill={mau} />;
  if (kieu === 3) return <path d="M18.5 23 Q17 8 32 8.5 Q47 8 45.5 23 L45.5 30.5 Q42.5 32 41 28 L41 21 Q32 15 23 21 L23 28 Q21.5 32 18.5 30.5 Z" fill={mau} />;
  return null;
}
function TocTruoc({ kieu, mau }) {
  switch (kieu) {
    case 0: return <path d="M19.4 21.5 Q18.6 8.6 32 8.8 Q45.4 8.6 44.6 21.5 Q41.5 13.8 32 14.4 Q23.5 13.8 19.4 21.5 Z" fill={mau} />;
    case 1: return <path d="M19.4 22 Q18.4 8 33 8.8 Q46 9.8 44.6 22 Q43.2 14.6 38.4 13.4 Q30 18.6 21 16.2 Z" fill={mau} />;
    case 2: return <path d="M20 19 Q21 9 32 9 Q43 9 44 19 Q38 12.5 31 15.5 Q25 12.5 20 19 Z" fill={mau} />;
    case 3: return <path d="M19.6 20.5 Q20.5 9 32 9 Q43.5 9 44.4 20.5 L42 17 Q32 12 22 17 Z" fill={mau} />;
    case 4: return (<g fill={mau}>
      <circle cx="32" cy="7.2" r="4.6" />
      <path d="M19.6 20.5 Q19.4 9.6 32 9.8 Q44.6 9.6 44.4 20.5 Q40 14.6 32 15 Q24 14.6 19.6 20.5 Z" /></g>);
    default: return <path d="M20 19.5 L22 11.5 L25 15 L28 9 L31 13.5 L34 8.2 L37 13.5 L40 10 L42 15.5 L44 19.5 Q32 13.4 20 19.5 Z" fill={mau} />;
  }
}

function NhanVat({ seed = '', mood = 'cho', vang = false, toi = false }) {
  const h = bam(String(seed));
  const kieu = h % 6, da = DA[(h >>> 3) % 3], toc = TOC[(h >>> 5) % 4], kinh = ((h >>> 7) % 4) === 0;
  const tayLen = mood === 'dung' || mood === 'thang';
  const tayCam = mood === 'nghi';
  const mieng = {
    dung: <path d="M27.4 27.2 Q32 33.6 36.6 27.2 Z" fill="#8E2E2E" />,
    thang: <path d="M27 26.8 Q32 34.4 37 26.8 Z" fill="#8E2E2E" />,
    sai: <path d="M28.4 30.4 Q32 27.4 35.6 30.4" stroke="#2A1E1E" strokeWidth="1.4" fill="none" strokeLinecap="round" />,
    nghi: <path d="M29 29.2 L34.4 28.4" stroke="#2A1E1E" strokeWidth="1.4" strokeLinecap="round" />,
    mat: <path d="M29 29 L35 29" stroke="#2A1E1E" strokeWidth="1.3" strokeLinecap="round" />,
  }[mood] || <path d="M28.6 27.8 Q32 30.8 35.4 27.8" stroke="#2A1E1E" strokeWidth="1.4" fill="none" strokeLinecap="round" />;
  const may = mood === 'sai'
    ? <g stroke="#2A1E1E" strokeWidth="1.2" strokeLinecap="round"><path d="M25.4 17.6 L29.4 18.8" /><path d="M38.6 17.6 L34.6 18.8" /></g>
    : tayLen
      ? <g stroke="#2A1E1E" strokeWidth="1.2" strokeLinecap="round"><path d="M25.6 17.2 Q27.6 15.8 29.6 17" /><path d="M34.4 17 Q36.4 15.8 38.4 17.2" /></g>
      : <g stroke="#2A1E1E" strokeWidth="1.2" strokeLinecap="round"><path d="M25.8 18 L29.4 17.6" /><path d="M34.6 17.6 L38.2 18" /></g>;
  return (
    <svg className={'nv nv-' + mood + (toi ? ' nv-toi' : '')} viewBox="0 0 64 94" aria-hidden="true">
      <ellipse cx="32" cy="89.5" rx="15" ry="2.6" className="nv-bong" />
      <g className="nv-than">
        {/* chân + quần đen + giày */}
        <path d="M19.4 62 L44.6 62 L44.6 70 L41.2 86 L34 86 L32 72.5 L30 86 L22.8 86 L19.4 70 Z" fill="#1C2130" />
        <path d="M32 64 L32 72" stroke="#0E1119" strokeWidth=".8" />
        <ellipse cx="26.2" cy="87.2" rx="5" ry="2.3" fill="#E9EDF3" />
        <ellipse cx="37.8" cy="87.2" rx="5" ry="2.3" fill="#E9EDF3" />
        {/* tay (sau áo) */}
        <g stroke={da} strokeWidth="4.6" strokeLinecap="round" fill="none" className="nv-tay">
          {tayLen ? (<><path d="M15 46 L8.5 30" /><path d="M49 46 L55.5 30" /></>)
            : tayCam ? (<><path d="M15.4 48 L16 61" /><path d="M48.6 47.5 L45.5 41.5 L37.6 34.2" /></>)
            : (<><path d="M15.4 48 L16 61" /><path d="M48.6 48 L48 61" /></>)}
        </g>
        <g fill={da}>
          {tayLen ? (<><circle cx="8" cy="28.6" r="3" /><circle cx="56" cy="28.6" r="3" /></>)
            : tayCam ? (<><circle cx="16.1" cy="62.3" r="2.9" /><circle cx="36.6" cy="33.4" r="2.9" /></>)
            : (<><circle cx="16.1" cy="62.3" r="2.9" /><circle cx="47.9" cy="62.3" r="2.9" /></>)}
        </g>
        {/* áo thun trắng cổ tròn */}
        <path d="M20.6 37.6 Q32 34.6 43.4 37.6 L52 44.2 L48.2 50 L44.8 47.4 L44.8 63 Q32 65.2 19.2 63 L19.2 47.4 L15.8 50 L12 44.2 Z"
          fill="#FFFFFF" stroke="#C9D1DD" strokeWidth=".9" strokeLinejoin="round" />
        <path d="M27.2 37 Q32 41.6 36.8 37" fill="none" stroke="#C9D1DD" strokeWidth="1.2" strokeLinecap="round" />
        {/* cổ + đầu */}
        <rect x="28.6" y="31" width="6.8" height="6.4" rx="2" fill={da} />
        <g className="nv-dau">
          <TocSau kieu={kieu} mau={toc} />
          <circle cx="32" cy="22" r="12.6" fill={da} />
          <ellipse cx="19.6" cy="23" rx="1.8" ry="2.6" fill={da} />
          <ellipse cx="44.4" cy="23" rx="1.8" ry="2.6" fill={da} />
          <TocTruoc kieu={kieu} mau={toc} />
          {may}
          <g className="nv-doimat" fill="#1B1F2A">
            {mood === 'thang' || mood === 'dung'
              ? (<><path d="M25.8 22.4 Q27.6 20.2 29.4 22.4" stroke="#1B1F2A" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                  <path d="M34.6 22.4 Q36.4 20.2 38.2 22.4" stroke="#1B1F2A" strokeWidth="1.5" fill="none" strokeLinecap="round" /></>)
              : (<><circle cx="27.6" cy="22" r="1.65" /><circle cx="36.4" cy="22" r="1.65" /></>)}
          </g>
          {kinh && (<g fill="none" stroke="#1B1F2A" strokeWidth="1"><circle cx="27.6" cy="22" r="3.3" /><circle cx="36.4" cy="22" r="3.3" /><path d="M30.9 21.6 L33.1 21.6" /></g>)}
          {(mood === 'dung' || mood === 'thang') && (<g fill="#F08A8A" opacity=".45"><circle cx="24.6" cy="26" r="2" /><circle cx="39.4" cy="26" r="2" /></g>)}
          {mieng}
          {vang && (
            <g className="nv-non">
              <path d="M19.2 18.6 Q19 6.6 32 6.6 Q45 6.6 44.8 18.6 Z" fill="url(#nvVang)" />
              <path d="M31 17.4 Q44.6 15 52.4 19.2 Q45 21.8 31 19.6 Z" fill="#B88A3A" />
              <path d="M24 11.6 Q32 9.6 40 11.6" stroke="#FFF2CF" strokeWidth=".9" fill="none" opacity=".8" />
              <circle cx="32" cy="6.8" r="1.4" fill="#FFF2CF" />
            </g>
          )}
        </g>
      </g>
      {/* huy hiệu trạng thái */}
      {mood === 'da-tl' && (<g className="nv-huy"><circle cx="53" cy="9" r="6.4" fill="#3FB6A8" /><path d="M50.2 9.2 L52.3 11.3 L56 7.2" stroke="#fff" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" /></g>)}
      {mood === 'nghi' && (<g className="nv-huy nv-nghi-bong"><circle cx="45.4" cy="11.6" r="1.4" fill="#fff" /><ellipse cx="53.4" cy="6.8" rx="7.2" ry="5.2" fill="#fff" />
        <g fill="#4A5670"><circle cx="50.6" cy="7" r=".95" /><circle cx="53.4" cy="7" r=".95" /><circle cx="56.2" cy="7" r=".95" /></g></g>)}
      {mood === 'sai' && (<g className="nv-huy"><circle cx="53" cy="9" r="6.4" fill="#D6006C" /><path d="M50.6 6.6 L55.4 11.4 M55.4 6.6 L50.6 11.4" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" /></g>)}
      {mood === 'mat' && (<g className="nv-huy"><circle cx="53" cy="9" r="6.4" fill="#8A93A6" />
        <path d="M49.4 8.4 Q53 5.4 56.6 8.4 M50.9 10.2 Q53 8.6 55.1 10.2" stroke="#fff" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        <path d="M49.6 5.6 L56.4 12.4" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" /></g>)}
      <defs>
        <linearGradient id="nvVang" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F2D58E" /><stop offset="1" stopColor="#CBA45A" /></linearGradient>
      </defs>
    </svg>
  );
}

export default memo(NhanVat);
