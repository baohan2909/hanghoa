// Điều phối hàng hóa — bộ icon SVG stroke (không dùng bộ icon thường / emoji)
const I = ({ d, ...p }) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" {...p}><path d={d} /></svg>
);
export const IcPulse   = (p) => <I d="M3 12h4l3-8 4 16 3-8h4" {...p} />;
export const IcCart    = (p) => <I d="M4 5h2l2.4 11h9.8l2-8H7.2 M10 20a1 1 0 1 0 0-.01 M17 20a1 1 0 1 0 0-.01" {...p} />;
export const IcCheck   = (p) => <I d="M20 6 9 17l-5-5" {...p} />;
export const IcSplit   = (p) => <I d="M12 3v7 M12 10l-6 8 M12 10l6 8 M4 21h4 M16 21h4" {...p} />;
export const IcTruck   = (p) => <I d="M3 7h11v9H3z M14 10h4l3 3v3h-7 M7 19a1.5 1.5 0 1 0 0-.01 M17 19a1.5 1.5 0 1 0 0-.01" {...p} />;
export const IcGear    = (p) => <I d="M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5z M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.2 3h-4.4l-.4 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12a7 7 0 0 0 .1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.7h4.4l.4-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5A7 7 0 0 0 19 12z" {...p} />;
export const IcSpark   = (p) => <I d="M12 2l1.8 5.6L19.5 9l-5.7 1.4L12 16l-1.8-5.6L4.5 9l5.7-1.4z M19 16l.8 2.2 2.2.8-2.2.8L19 22l-.8-2.2-2.2-.8 2.2-.8z" {...p} />;
export const IcOut     = (p) => <I d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9" {...p} />;
export const IcDown    = (p) => <I d="M12 3v12 M6 11l6 6 6-6 M4 21h16" {...p} />;
export const IcRefresh = (p) => <I d="M21 12a9 9 0 1 1-2.6-6.4 M21 3v6h-6" {...p} />;
export const IcAlert   = (p) => <I d="M12 3 2 20h20L12 3z M12 10v4 M12 17.5v.01" {...p} />;
export const IcSearch  = (p) => <I d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M21 21l-4.7-4.7" {...p} />;
export const IcBox     = (p) => <I d="M21 8 12 3 3 8v8l9 5 9-5V8z M3 8l9 5 9-5 M12 13v8" {...p} />;
export const IcClock   = (p) => <I d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3.5 2" {...p} />;
export const IcTrophy  = (p) => <I d="M8 4h8v6a4 4 0 0 1-8 0V4z M8 5H4v2a4 4 0 0 0 4 4 M16 5h4v2a4 4 0 0 1-4 4 M12 14v4 M8 21h8 M10 18h4" {...p} />;
export const IcFlash   = (p) => <I d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" {...p} />;
export const IcTarget  = (p) => <I d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z M12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z" {...p} />;
export const IcHeart   = (p) => <I d="M12 20s-7-4.6-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.4-9 9-9 9z" {...p} />;
