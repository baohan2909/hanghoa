import { useEffect, useRef, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { IcSearch, IcBox } from '../lib/icons.jsx';
import { useApp } from '../App.jsx';

// ===== HÀNG ĐẶC BIỆT — Thu hồi & Hàng mới (Điều phối kiểm soát, KHÔNG chia tự động) =====
const fmtVND = (n) => (n || 0).toLocaleString('vi-VN') + 'đ';
const fmtNgay = (d) => d ? String(d).split('T')[0].split('-').reverse().join('/') : '—';

const BadgeNganh = ({ n1 }) => {
  const bh = (n1 || '').includes('bảo hiểm') || (n1 || '').includes('Mũ');
  return <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
    background: bh ? '#E4F5F0' : '#F7EFDE', color: bh ? 'var(--teal-deep)' : '#8A6D2F' }}>
    {bh ? 'BH' : 'NV'}</span>;
};

export default function DacBiet() {
  const { user, baoToast } = useApp();
  const [tab, setTab] = useState('THU_HOI');
  const [ds, setDs] = useState(null);
  // tìm để thêm
  const [q, setQ] = useState('');
  const [goiY, setGoiY] = useState([]);
  const timRef = useRef(null);
  // khối mã tạo gần đây (tab HANG_MOI)
  const [soNgay, setSoNgay] = useState(30);
  const [maMoi, setMaMoi] = useState(null);
  const [locNganh, setLocNganh] = useState('ALL');
  const [qMoi, setQMoi] = useState('');

  const taiDS = async () => {
    const { data, error } = await sb.rpc('fn_dacbiet_ds');
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    setDs(data || []);
  };
  useEffect(() => { taiDS(); }, []);

  const taiMaMoi = async (n) => {
    setMaMoi(null);
    const { data, error } = await sb.rpc('fn_ma_moi_ds', { p_so_ngay: n });
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    setMaMoi(data || []);
  };
  useEffect(() => { if (tab === 'HANG_MOI') taiMaMoi(soNgay); }, [tab, soNgay]);

  // Tìm gợi ý (debounce 300ms)
  const goTim = (v) => {
    setQ(v);
    clearTimeout(timRef.current);
    if (v.trim().length < 3) { setGoiY([]); return; }
    timRef.current = setTimeout(async () => {
      const { data } = await sb.rpc('fn_tim_sp', { p_q: v.trim() });
      setGoiY(data || []);
    }, 300);
  };

  const them = async (bc) => {
    const { error } = await sb.rpc('fn_dacbiet_them', {
      p_barcode: bc, p_loai: tab, p_nguoi: user.ma_dang_nhap });
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    baoToast('Đã thêm vào danh sách'); setQ(''); setGoiY([]); taiDS();
  };
  const xoa = async (bc) => {
    const { error } = await sb.rpc('fn_dacbiet_xoa', { p_barcode: bc });
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    baoToast('Đã gỡ khỏi danh sách'); taiDS();
  };

  const dsTab = (ds || []).filter((r) => r.loai === tab);
  const maMoiLoc = (maMoi || []).filter((r) => {
    if (locNganh !== 'ALL') {
      const bh = (r.nganh_1 || '').includes('bảo hiểm') || (r.nganh_1 || '').includes('Mũ');
      if (locNganh === 'BH' !== bh) return false;
    }
    if (qMoi.trim()) {
      const k = qMoi.trim().toUpperCase();
      if (![r.barcode, r.sku, r.ma_tham_chieu, r.nganh_3].some((x) => (x || '').toUpperCase().includes(k))) return false;
    }
    return true;
  });

  return (
    <div>
      <div className="cmdbar">
        <div className="cmd-title">
          <h2><IcBox style={{ verticalAlign: -3, marginRight: 8 }} />Hàng đặc biệt</h2>
          <p>Hàng KHÔNG chia tự động — phòng Điều phối kiểm soát trực tiếp. Cửa hàng vẫn thấy mã nhưng bị khóa ô đề nghị.</p>
        </div>
      </div>

      {/* 2 tab loại */}
      <div className="nhom-tabs" style={{ marginTop: 14 }}>
        <button className={'nhom-tab' + (tab === 'THU_HOI' ? ' on' : '')} onClick={() => setTab('THU_HOI')}>
          Hàng thu hồi {ds && <b style={{ marginLeft: 4 }}>{(ds || []).filter((r) => r.loai === 'THU_HOI').length}</b>}
        </button>
        <button className={'nhom-tab' + (tab === 'HANG_MOI' ? ' on' : '')} onClick={() => setTab('HANG_MOI')}>
          Hàng mới / tái bản {ds && <b style={{ marginLeft: 4 }}>{(ds || []).filter((r) => r.loai === 'HANG_MOI').length}</b>}
        </button>
      </div>

      {/* Ô tìm + thêm */}
      <div className="card" style={{ marginTop: 12, padding: 14, position: 'relative' }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8, color: 'var(--ink)' }}>
          {tab === 'THU_HOI' ? 'Thêm sản phẩm thu hồi' : 'Thêm mã tái bản (ngày tạo cũ nhưng cần ĐP chia)'}
        </div>
        <div style={{ position: 'relative', maxWidth: 520 }}>
          <IcSearch style={{ position: 'absolute', left: 12, top: 11, width: 16, height: 16, color: 'var(--ink-2)' }} />
          <input className="inp" style={{ paddingLeft: 36, width: '100%' }}
            placeholder="Barcode, SKU, mã — gõ để tìm" value={q} onChange={(e) => goTim(e.target.value)} />
          {goiY.length > 0 && (
            <div className="goiy-pop">
              {goiY.map((g) => (
                <div key={g.barcode} className="goiy-item">
                  {g.hinh_url ? <img src={g.hinh_url} alt="" /> : <div className="noimg" />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="mono" style={{ fontWeight: 600, fontSize: 12.5 }}>{g.ma_tham_chieu || g.sku}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>{g.nganh_3} · kho tổng {g.kho_tong}</div>
                  </div>
                  <BadgeNganh n1={g.nganh_1} />
                  {g.dac_biet
                    ? <span style={{ fontSize: 11, color: 'var(--ink-2)' }}>đã trong DS</span>
                    : <button className="btn-mini" onClick={() => them(g.barcode)}>＋ Thêm</button>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Danh sách hiện tại của tab */}
      <div className="card" style={{ marginTop: 12, padding: 0 }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', fontWeight: 700, fontSize: 13.5 }}>
          Danh sách {tab === 'THU_HOI' ? 'thu hồi' : 'hàng mới thêm tay'} ({dsTab.length})
        </div>
        {!dsTab.length ? (
          <div className="empty" style={{ margin: 14 }}>Chưa có sản phẩm nào trong danh sách.</div>
        ) : (
          <div className="tbl-wrap" style={{ maxHeight: '46vh' }}>
            <table className="tbl">
              <thead><tr>
                <th className="col-sp">Sản phẩm</th><th className="center">Ngành</th>
                <th className="num">Giá</th><th className="num">Kho tổng</th>
                <th>Người thêm</th><th>Ngày thêm</th><th className="center">Gỡ</th>
              </tr></thead>
              <tbody>
                {dsTab.map((r) => (
                  <tr key={r.barcode}>
                    <td className="col-sp">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        {r.hinh_url ? <img className="sp" src={r.hinh_url} alt="" /> : <div className="noimg" />}
                        <div>
                          <div className="mono" style={{ fontWeight: 600 }}>{r.ma_tham_chieu || r.sku}</div>
                          <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>{r.nganh_3}</div>
                        </div>
                      </div>
                    </td>
                    <td className="center"><BadgeNganh n1={r.nganh_1} /></td>
                    <td className="num">{fmtVND(r.gia_niem_yet)}</td>
                    <td className="num">{r.kho_tong}</td>
                    <td>{r.nguoi_tao || '—'}</td>
                    <td>{fmtNgay(r.tao_luc)}</td>
                    <td className="center"><button className="btn-mini btn-danger" onClick={() => xoa(r.barcode)}>－ Gỡ</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Tab HÀNG MỚI: khối mã tạo gần đây (tự động khóa theo ngưỡng) */}
      {tab === 'HANG_MOI' && (
        <div className="card" style={{ marginTop: 12, padding: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>Mã tạo gần đây</div>
            <span style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>
              (mã tạo ≤ 30 ngày <b>tự động</b> khóa chia — không cần thêm tay)
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="nhom-tabs" style={{ margin: 0 }}>
                {[['ALL', 'Tất cả'], ['BH', 'Bảo hiểm'], ['NV', 'Nón vải']].map(([k, ten]) => (
                  <button key={k} className={'nhom-tab' + (locNganh === k ? ' on' : '')} onClick={() => setLocNganh(k)}>{ten}</button>
                ))}
              </div>
              {[14, 30, 60, 90].map((n) => (
                <button key={n} className={'nhom-tab' + (soNgay === n ? ' on' : '')} onClick={() => setSoNgay(n)}>{n} ngày</button>
              ))}
              <input className="inp" style={{ width: 180 }} placeholder="Barcode, SKU, mã"
                value={qMoi} onChange={(e) => setQMoi(e.target.value)} />
            </div>
          </div>
          {!maMoi ? (
            <div className="quet-load"><div className="quet-ring" /><div className="quet-s">đang tải…</div></div>
          ) : !maMoiLoc.length ? (
            <div className="empty" style={{ margin: 14 }}>Không có mã nào tạo trong {soNgay} ngày qua.</div>
          ) : (
            <div className="tbl-wrap" style={{ maxHeight: '52vh' }}>
              <table className="tbl">
                <thead><tr>
                  <th className="col-sp">Sản phẩm</th><th className="center">Ngành</th>
                  <th>Ngày tạo mã</th><th className="num">Giá</th>
                  <th className="num">Kho tổng</th><th className="num">Đã bán 30N</th>
                </tr></thead>
                <tbody>
                  {maMoiLoc.map((r) => (
                    <tr key={r.barcode}>
                      <td className="col-sp">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          {r.hinh_url ? <img className="sp" src={r.hinh_url} alt="" /> : <div className="noimg" />}
                          <div>
                            <div className="mono" style={{ fontWeight: 600 }}>{r.ma_tham_chieu || r.sku}</div>
                            <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>{r.nganh_3}</div>
                          </div>
                        </div>
                      </td>
                      <td className="center"><BadgeNganh n1={r.nganh_1} /></td>
                      <td><b style={{ color: 'var(--teal-deep)' }}>{fmtNgay(r.ngay_tao_ma)}</b></td>
                      <td className="num">{fmtVND(r.gia_niem_yet)}</td>
                      <td className="num">{r.kho_tong}</td>
                      <td className="num">{r.da_ban_30}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
