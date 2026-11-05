// Icon riêng của Đấu Trường Nón Sơn — cùng kiểu stroke với src/lib/icons.jsx
const I = ({ d, ...p }) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" {...p}><path d={d} /></svg>
);
export const IcMat     = (p) => <I d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" {...p} />;
export const IcNguoi   = (p) => <I d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1 M16 3.5a4 4 0 0 1 0 7.5 M22 21v-1a6 6 0 0 0-4-5.6" {...p} />;
export const IcLoa     = (p) => <I d="M11 5 6 9H3v6h3l5 4V5z M15.5 8.5a5 5 0 0 1 0 7 M18.5 5.5a9 9 0 0 1 0 13" {...p} />;
export const IcLoaTat  = (p) => <I d="M11 5 6 9H3v6h3l5 4V5z M22 9l-6 6 M16 9l6 6" {...p} />;
export const IcDung    = (p) => <I d="M8 5v14 M16 5v14" {...p} />;
export const IcChay    = (p) => <I d="M7 4l13 8-13 8V4z" {...p} />;
export const IcVe      = (p) => <I d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4V8z M13 6v2 M13 11v2 M13 16v2" {...p} />;
export const IcXoa     = (p) => <I d="M4 7h16 M10 11v6 M14 11v6 M6 7l1 13h10l1-13 M9 7V4h6v3" {...p} />;
export const IcSua     = (p) => <I d="M4 20h4L19 9l-4-4L4 16v4z M13.5 6.5l4 4" {...p} />;
export const IcCong    = (p) => <I d="M12 5v14 M5 12h14" {...p} />;
export const IcTaiLen  = (p) => <I d="M12 21V9 M6 13l6-6 6 6 M4 3h16" {...p} />;
export const IcTaiVe   = (p) => <I d="M12 3v12 M6 11l6 6 6-6 M4 21h16" {...p} />;
export const IcMuiTen  = (p) => <I d="M15 18l-6-6 6-6" {...p} />;
export const IcLich    = (p) => <I d="M4 6h16v14H4z M4 10h16 M8 3v5 M16 3v5" {...p} />;
export const IcCo      = (p) => <I d="M5 21V4 M5 4h11l-2 4 2 4H5" {...p} />;
export const IcLen     = (p) => <I d="M12 19V5 M6 11l6-6 6 6" {...p} />;
export const IcXuong   = (p) => <I d="M12 5v14 M6 13l6 6 6-6" {...p} />;
export const IcXao     = (p) => <I d="M16 3h5v5 M4 20 21 3 M21 16v5h-5 M15 15l6 6 M4 4l5 5" {...p} />;
export const IcKhoa    = (p) => <I d="M6 11h12v10H6z M8 11V7a4 4 0 0 1 8 0v4" {...p} />;
export const IcSanKhau = (p) => <I d="M3 4h18 M5 4v4a7 7 0 0 0 14 0V4 M3 20h18 M7 20v-3h10v3" {...p} />;
export const IcToanMan = (p) => <I d="M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5" {...p} />;
