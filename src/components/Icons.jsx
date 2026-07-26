// Bộ icon SVG nét (stroke) — không emoji, theo quy tắc design-system
const S = ({ children, size = 20, ...p }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none"
       stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"
       strokeLinejoin="round" {...p}>{children}</svg>
)
export const IcDash  = (p) => <S {...p}><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></S>
export const IcPhone = (p) => <S {...p}><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3 19.5 19.5 0 01-6-6 19.8 19.8 0 01-3-8.6A2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.4 1.8.7 2.7a2 2 0 01-.5 2.1L8.1 9.9a16 16 0 006 6l1.4-1.2a2 2 0 012.1-.4c.9.3 1.8.6 2.7.7a2 2 0 011.7 2z"/></S>
export const IcUser  = (p) => <S {...p}><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></S>
export const IcChart = (p) => <S {...p}><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></S>
export const IcForm  = (p) => <S {...p}><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></S>
export const IcGear  = (p) => <S {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 00.3 1.8 2 2 0 11-2.8 2.8 1.6 1.6 0 00-2.7.7 1.6 1.6 0 01-3.2 0 1.6 1.6 0 00-2.7-.7 2 2 0 11-2.8-2.8 1.6 1.6 0 00-.7-2.7 1.6 1.6 0 010-3.2 1.6 1.6 0 00.7-2.7 2 2 0 112.8-2.8 1.6 1.6 0 002.7-.7 1.6 1.6 0 013.2 0 1.6 1.6 0 002.7.7 2 2 0 112.8 2.8 1.6 1.6 0 00.7 2.7 1.6 1.6 0 010 3.2 1.6 1.6 0 00-1 .9z"/></S>
export const IcPlus  = (p) => <S {...p}><path d="M12 5v14M5 12h14"/></S>
export const IcSearch= (p) => <S {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></S>
export const IcCal   = (p) => <S {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></S>
export const IcDown  = (p) => <S {...p}><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16"/></S>
export const IcChevD = (p) => <S {...p}><path d="M6 9l6 6 6-6"/></S>
export const IcChevL = (p) => <S {...p}><path d="M15 18l-6-6 6-6"/></S>
export const IcCheck = (p) => <S {...p}><path d="M5 12l5 5L20 7"/></S>
export const IcBox   = (p) => <S {...p} strokeWidth="1.8"><path d="M3 9l9-6 9 6v10a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></S>
export const IcStar  = (p) => <svg viewBox="0 0 24 24" width={p.size||16} height={p.size||16} fill="currentColor"><path d="M12 2l2.4 7.4H22l-6 4.5 2.3 7.1L12 16.7 5.7 21l2.3-7.1-6-4.5h7.6z"/></svg>
export const IcClock = (p) => <S {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></S>
export const IcRefresh=(p) => <S {...p}><path d="M21 12a9 9 0 11-4.5-7.8L21 3v6h-6"/></S>
export const IcOut   = (p) => <S {...p}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></S>
