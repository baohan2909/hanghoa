// ============================================================================
// NEW - 3.139 BẤM SỐ "ĐANG VỀ" -> XEM TỪNG PHIẾU (SQL 229 · fn_dang_ve_ct)
//   Dùng chung cho Chia từng đội (đội sale) và Đề nghị hàng (cửa hàng).
//   Đang về = số lớn hơn giữa (phiếu Odoo chưa nhận) và (tồn dự tính − tồn hiện tại);
//   NEW - 3.156.3 (SQL 272): phiếu nháp trên app chưa đẩy Odoo KHÔNG cộng vào đang về — chỉ liệt kê để biết
//   NEW - 3.157.3 (SQL 281) QUY TẮC: đơn CHƯA ĐẨY / CHƯA DUYỆT trên Odoo tuyệt đối KHÔNG tính đang về —
//     yêu cầu nháp trên Odoo ("Chưa chuyển · Yêu cầu điều chuyển") và giữ chỗ trên app chỉ liệt kê để biết.
//   đơn vị đang trả hàng đi thì trừ.
// ============================================================================
import { useEffect, useState } from 'react';
import { sb } from './supabase.js';

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('vi'));
const ngay = (s) => (s ? String(s).slice(8, 10) + '/' + String(s).slice(5, 7) : '—');

export default function DangVeCt({ maCh, barcode, onDong }) {
  const [d, setD] = useState(null);
  const [loi, setLoi] = useState('');
  useEffect(() => {
    let huy = false;
    (async () => {
      const { data, error } = await sb.rpc('fn_dang_ve_ct', { p_ma_ch: maCh, p_barcode: barcode });
      if (huy) return;
      if (error) setLoi(error.message); else setD(data);
    })();
    return () => { huy = true; };
  }, [maCh, barcode]);
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onDong(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onDong]);

  const t = d?.tong || {};
  const tongPhieu = (d?.phieu || []).reduce((s, p) => s + (p.con_ve || 0), 0);
  const tongApp = (d?.chua_len_odoo || []).reduce((s, p) => s + (p.sl || 0), 0);
  const tongYc = (d?.yc_odoo || []).reduce((s, p) => s + (p.sl || 0), 0);
  return (
    <div className="modal-nen" onClick={onDong}>
      <div className="modal-hop dvc" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Chi tiết hàng đang về">
        <div className="modal-dau">
          <div>
            <div className="mono dvc-ma">{d?.ma || barcode}</div>
            <div className="dvc-phu">{maCh} · đang về <b>{fmt(t.ve)}</b> · tồn hiện tại {fmt(t.ton)}</div>
          </div>
          <button className="modal-x" onClick={onDong} aria-label="Đóng">✕</button>
        </div>
        <div className="modal-than">
          {loi && <div className="dvc-loi">Không tải được: {loi}</div>}
          {!d && !loi && <div className="dvc-trong">Đang tải…</div>}
          {d && (
            <>
              <div className="dvc-cach">
                <span>Phiếu Odoo chưa nhận <b>{fmt(tongPhieu)}</b></span>
                <span>Odoo: dự tính − hiện tại <b>{fmt(t.lech)}</b></span>
                <span className="dvc-kq">Lấy số lớn hơn{(t.lech ?? 0) < 0 ? ', trừ phần trả đi' : ''} = <b>{fmt(t.ve)}</b></span>
              </div>

              <div className="dvc-tit">Phiếu Odoo tới {maCh}</div>
              {(d.phieu || []).length === 0 ? <div className="dvc-trong">Không có phiếu nào đang về.</div> : (
                <table className="tbl tbl-fit dvc-bang">
                  <thead><tr><th>Phiếu</th><th>Trạng thái</th><th className="num">Nhu cầu</th><th className="num">Đã xuất</th>
                    <th className="num">Đã nhận</th><th className="num">Còn về</th></tr></thead>
                  <tbody>
                    {d.phieu.map((p) => (
                      <tr key={p.ma_phieu}>
                        <td><div className="mono dvc-phieu">{p.ma_phieu}</div><div className="dvc-phu">từ {p.tu} · {ngay(p.ngay_tao)}</div></td>
                        <td><span className={'dvc-tt ' + (p.trang_thai === 'Đã xuất' || p.trang_thai === 'Một phần' ? 'xuat' : 'cho')}>{p.trang_thai}</span></td>
                        <td className="num">{fmt(p.nhu_cau)}</td><td className="num">{fmt(p.da_xuat)}</td>
                        <td className="num">{fmt(p.da_nhan)}</td><td className="num"><b>{fmt(p.con_ve)}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {(d.yc_odoo || []).length > 0 && (
                <>
                  <div className="dvc-tit">Yêu cầu trên Odoo CHƯA DUYỆT — không tính vào đang về ({fmt(tongYc)})</div>
                  <ul className="dvc-ds">
                    {d.yc_odoo.map((p) => <li key={p.ma_phieu}><span className="mono">{p.ma_phieu}</span> · từ {p.tu} · {ngay(p.ngay_tao)} <b>{fmt(p.sl)}</b></li>)}
                  </ul>
                </>
              )}

              {(d.chua_len_odoo || []).length > 0 && (
                <>
                  <div className="dvc-tit">Phiếu nháp trên app chưa đẩy Odoo — không tính vào Về / đi ({fmt(tongApp)})</div>
                  <ul className="dvc-ds">
                    {d.chua_len_odoo.map((p) => <li key={p.ma_phieu}><span className="mono">{p.ma_phieu}</span> <b>{fmt(p.sl)}</b></li>)}
                  </ul>
                </>
              )}

              {(d.tra_di || []).length > 0 && (
                <>
                  <div className="dvc-tit dvc-tit-di">Đang trả đi khỏi {maCh}</div>
                  <ul className="dvc-ds">
                    {d.tra_di.map((p) => (
                      <li key={p.ma_phieu}><span className="mono">{p.ma_phieu}</span> → {p.den} · {p.trang_thai} <b>{fmt(p.sl)}</b></li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
