// NEW - 3.154: NÚT XUẤT dùng chung (Online, TikTok Shop) — 2 lựa chọn: Báo cáo PDF (đẹp, chi tiết) · Dữ liệu Excel (đủ số liệu).
// Dựng file ngay trên máy theo đúng bộ lọc đang xem; hộp tiến độ → xong thì tải về (máy tính) hoặc Lưu / Chia sẻ (iPhone).
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const laIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const coLon = (b) => (b >= 1048576 ? (b / 1048576).toLocaleString('vi', { maximumFractionDigits: 1 }) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
function taiXuong(blob, ten) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = u; a.download = ten; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 120000);
}

const IcTai = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>);
const IcPdf = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M8 13h8M8 17h5" /></svg>);
const IcBang = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M9 4v16" /></svg>);

const LOAI = {
  pdf: { ten: 'Báo cáo PDF', Ic: IcPdf, mo: 'Bản trình bày: chỉ số so kỳ trước, điểm chính, biểu đồ, kênh, sản phẩm, người bán… — để gửi, in, trình bày.' },
  excel: { ten: 'Dữ liệu Excel', Ic: IcBang, mo: 'Đủ số liệu nhiều sheet + từng dòng hàng của từng đơn — để lọc, cộng, làm pivot.' },
};

export default function NutXuat({ sanSang, taoBaoCao, taoDuLieu, ghiChu }) {
  const [mo, setMo] = useState(false);
  const [viec, setViec] = useState(null);   // { loai, buoc, pt, file:{blob,ten}, loi }
  const vung = useRef(null);
  useEffect(() => {
    if (!mo) return undefined;
    const dong = (e) => { if (vung.current && !vung.current.contains(e.target)) setMo(false); };
    const phim = (e) => { if (e.key === 'Escape') setMo(false); };
    document.addEventListener('pointerdown', dong); document.addEventListener('keydown', phim);
    return () => { document.removeEventListener('pointerdown', dong); document.removeEventListener('keydown', phim); };
  }, [mo]);

  const chay = async (loai) => {
    setMo(false);
    setViec({ loai, buoc: 'Đang chuẩn bị…', pt: null });
    const bao = (buoc, pt = null) => setViec((v) => (v && v.loai === loai ? { ...v, buoc, pt } : v));
    try {
      const f = await (loai === 'pdf' ? taoBaoCao : taoDuLieu)(bao);
      setViec((v) => (v ? { ...v, file: f, buoc: 'Xong' } : v));
      if (!laIos()) taiXuong(f.blob, f.ten);
    } catch (e) {
      setViec((v) => (v ? { ...v, loi: e?.message || String(e) } : v));
    }
  };
  const luu = async () => {
    const f = viec?.file; if (!f) return;
    if (laIos() && navigator.canShare) {
      const file = new File([f.blob], f.ten, { type: f.blob.type });
      if (navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: f.ten }); return; } catch (e) { if (e?.name === 'AbortError') return; } }
    }
    taiXuong(f.blob, f.ten);
  };
  const xemThu = () => { const f = viec?.file; if (!f) return; const u = URL.createObjectURL(f.blob); window.open(u, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(u), 300000); };
  const dangLam = viec && !viec.file && !viec.loi;
  const L = viec ? LOAI[viec.loai] : null;

  return (
    <div className="xuat" ref={vung}>
      <button className="odn-nut-phu xuat-nut" disabled={!sanSang || dangLam} aria-haspopup="menu" aria-expanded={mo} onClick={() => setMo((x) => !x)}
        title={sanSang ? 'Xuất theo đúng bộ lọc đang xem' : 'Chờ tải xong số liệu'}><IcTai /> Xuất</button>
      {mo && (
        <div className="xuat-menu" role="menu">
          {Object.entries(LOAI).map(([k, x]) => (
            <button key={k} role="menuitem" className="xuat-muc" onClick={() => chay(k)}>
              <span className={'xuat-ic ' + k}><x.Ic /></span>
              <span><b>{x.ten}</b><small>{x.mo}</small></span>
            </button>
          ))}
          {ghiChu && <div className="xuat-ghi">{ghiChu}</div>}
        </div>
      )}
      {viec && createPortal(
        <div className="modal-nen" onClick={() => !dangLam && setViec(null)}>
          <div className="modal-hop xuat-hop" role="dialog" aria-label={L.ten} onClick={(e) => e.stopPropagation()}>
            <div className="modal-dau"><b>{L.ten}</b>
              <button className="modal-x" onClick={() => setViec(null)} disabled={dangLam} aria-label="Đóng">✕</button></div>
            <div className="modal-than">
              <div className={'xuat-the' + (viec.loi ? ' loi' : viec.file ? ' xong' : '')}>
                <span className={'xuat-ic lon ' + viec.loai}><L.Ic /></span>
                <div className="xuat-the-than">
                  {viec.loi ? (<><b>Chưa xuất được</b><span className="xuat-loi">{viec.loi}</span></>)
                    : viec.file ? (<><b title={viec.file.ten}>{viec.file.ten}</b><span>{coLon(viec.file.blob.size)} · {laIos() ? 'bấm Lưu / Chia sẻ để cất vào Tệp, gửi Zalo, email…' : 'đã tải về thư mục Tải xuống'}</span></>)
                      : (<><b>{viec.buoc}</b><div className="xuat-thanh"><i style={viec.pt != null ? { width: Math.max(4, Math.round(viec.pt * 100)) + '%' } : undefined} className={viec.pt == null ? 'chay' : ''} /></div></>)}
                </div>
              </div>
              <div className="xuat-nut-ds">
                {viec.loi && <button className="btn btn-ai" onClick={() => chay(viec.loai)}>Thử lại</button>}
                {viec.file && <button className="btn btn-ai" onClick={luu}><IcTai /> {laIos() ? 'Lưu / Chia sẻ' : 'Tải lại'}</button>}
                {viec.file && viec.loai === 'pdf' && <button className="odn-nut-phu" onClick={xemThu}>Xem</button>}
                {!dangLam && <button className="odn-nut-phu" onClick={() => setViec(null)}>Đóng</button>}
              </div>
            </div>
          </div>
        </div>, document.body)}
    </div>
  );
}
