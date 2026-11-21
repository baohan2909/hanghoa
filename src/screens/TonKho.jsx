import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { useApp } from '../App.jsx';
import { IcRefresh, IcSearch, IcAlert, IcClock, IcCheck, IcGuiLen } from '../lib/icons.jsx';
import { NganChiTiet } from './OdooDon.jsx';
import { useOdooCfg } from '../lib/odoo.js';

const TaoDon = lazy(() => import('./TaoDon.jsx'));

// ============================================================================
// TỒN KHẢ DỤNG KHO TỔNG (v3.117.0 — SQL 207)
//   Khả dụng = tồn thực (ảnh chụp tồn đồng bộ) − hàng CHỜ XUẤT (phiếu đã gửi / đã duyệt, kho chưa xuất)
//              − hàng ĐÃ XUẤT sau lúc chụp tồn (tồn chưa kịp cập nhật) − tạm giữ − giữ hàng Excel.
//   Phần đã xuất TRƯỚC lúc chụp tồn đã nằm trong tồn thực -> không trừ lặp.
//   Mọi tăng / giảm khả dụng có nhật ký: phiếu, người, giờ, lý do.
// ============================================================================

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('vi'));
const gioNgay = (s) => (s ? new Date(s).toLocaleString('vi', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—');
const phutTruoc = (s) => { if (!s) return null; const p = Math.round((Date.now() - new Date(s).getTime()) / 60000); return p < 1 ? 'vừa xong' : p < 60 ? p + ' phút trước' : Math.round(p / 60) + ' giờ trước'; };

const LOC = [['cam_ket', 'Đang bị trừ'], ['vuot', 'Vượt tồn'], ['chua_cn', 'Đã xuất, tồn chưa cập nhật'], ['tat_ca', 'Tất cả mã']];
const TT_CK = {
  giu_cho: ['Đang gửi Odoo', 'xanh'], cho_xuat: ['Chờ kho xuất', 'vang'], tam_giu: ['Tạm giữ', 'xam'], nhap: ['Odoo để nháp', 'xam'],
  xong: ['Đã xuất / đóng', 'ok'], huy: ['Đã huỷ / trả lại', 'xam'], het_tam: ['Hết tạm giữ', 'xam'],
};
const LOAI_NK = {
  KHOI_TAO: ['Khởi tạo sổ', 'tru'], PHAT_HIEN: ['Phiếu Odoo mới', 'tru'], GIU_CHO: ['Giữ chỗ khi gửi', 'tru'], CAM_KET: ['Odoo nhận đơn', 'giu'],
  XUAT: ['Kho xuất', 'xuat'], NHAP: ['Odoo để nháp', 'tra'], DIEU_CHINH: ['Điều chỉnh SL', 'giu'], HOAN: ['Trả lại khả dụng', 'tra'], HET_TAM: ['Hết tạm giữ', 'xuat'],
};

export default function TonKho({ nhung = false }) {
  const { user, baoToast } = useApp();
  const odoo = useOdooCfg(user);
  const [tq, setTq] = useState(null);
  const [kho, setKho] = useState('tat_ca');
  const [loc, setLoc] = useState('cam_ket');
  const [q, setQ] = useState('');
  const [qTre, setQTre] = useState('');
  const [ds, setDs] = useState(null);
  const [dangTai, setDangTai] = useState(false);
  const [loi, setLoi] = useState('');
  const [ma, setMa] = useState(null);           // {kho, barcode}
  const [tao, setTao] = useState(null);         // mở Tạo đơn: {kho, sp}
  const [sap, setSap] = useState({ k: '', d: -1 });
  const hen = useRef(null);
  useEffect(() => { clearTimeout(hen.current); hen.current = setTimeout(() => setQTre(q.trim()), 300); return () => clearTimeout(hen.current); }, [q]);

  const taiTq = useCallback(async () => {
    const { data, error } = await sb.rpc('fn_ton_tong_quan', { p_token: user.token });
    if (error) { setLoi(error.message); return; }
    setTq(data);
  }, [user.token]);
  const taiDs = useCallback(async () => {
    setDangTai(true);
    const { data, error } = await sb.rpc('fn_ton_ds', { p_token: user.token, p_loc: { kho, loc, q: qTre, gioi_han: 500 } });
    setDangTai(false);
    if (error) { setLoi(error.message); return; }
    setLoi(''); setDs(data);
  }, [user.token, kho, loc, qTre]);
  useEffect(() => { taiTq(); }, [taiTq]);
  useEffect(() => { taiDs(); }, [taiDs]);

  const lamMoi = async () => {
    setDangTai(true);
    const { error } = await sb.rpc('fn_ton_lam_moi', { p_token: user.token });
    if (error) { setDangTai(false); baoToast('Không làm mới được: ' + error.message); return; }
    await Promise.all([taiTq(), taiDs()]);
    baoToast('Đã đối chiếu lại với dữ liệu Odoo mới nhất');
  };

  const rows = useMemo(() => {
    const a = [...(ds?.rows || [])];
    if (!sap.k) return a;
    a.sort((x, y) => { const p = x[sap.k] ?? 0, r = y[sap.k] ?? 0; return (p < r ? -1 : p > r ? 1 : 0) * sap.d; });
    return a;
  }, [ds, sap]);
  const bamCot = (k) => setSap((s) => (s.k === k ? { k, d: -s.d } : { k, d: k === 'ma' ? 1 : -1 }));
  const mt = (k) => (sap.k === k ? (sap.d === 1 ? ' ▲' : ' ▼') : '');
  const db = tq?.dong_bo || {};
  const khoTen = (k) => (tq?.kho || []).find((x) => x.kho === k)?.ten || k;

  const noiDung = (
    <div className={'tk' + (nhung ? ' nhung' : '')}>
      {/* Độ mới số liệu */}
      <div className="odn-dong-bo">
        <span className="odn-db-i"><IcClock /> Tồn kho chụp lúc <b>{gioNgay(db.ton_luc)}</b><em>{phutTruoc(db.ton_luc)} · đồng bộ 1 giờ/lần</em></span>
        <span className="odn-db-i">Phiếu điều chuyển Odoo <b>{gioNgay(db.dck_luc)}</b><em>~10 phút/lần</em></span>
        <span className="odn-db-i">Sổ cam kết đối chiếu <b>{gioNgay(db.hop_nhat?.luc)}</b></span>
        <button className="odn-nut-phu tk-lm" onClick={lamMoi} disabled={dangTai}><IcRefresh /> Làm mới</button>
      </div>

      {(tq?.canh || []).map((c, i) => (
        <div key={i} className={'odn-bao ' + (c.muc === 'cao' ? 'do' : c.muc === 'vua' ? 'vang' : 'xam')}><IcAlert /><div>{c.noi_dung}
          {c.loai === 'vuot' && loc !== 'vuot' && <button onClick={() => setLoc('vuot')}>Xem các mã vượt</button>}
          {c.loai === 'cho_lau' && <span className="tk-goi-y"> Mở từng mã để xem phiếu nào chờ lâu.</span>}</div></div>
      ))}

      {/* Thẻ kho */}
      <div className="tk-kho">
        <button className={'tk-k tat' + (kho === 'tat_ca' ? ' on' : '')} onClick={() => setKho('tat_ca')}>
          <span>5 kho tổng</span>
          <b>{tq ? fmt((tq.kho || []).reduce((s, k) => s + (k.kha_dung || 0), 0)) : '…'}</b>
          <small>khả dụng · đang trừ {tq ? fmt((tq.kho || []).reduce((s, k) => s + k.cho_xuat + k.xuat_chua_cn + k.tam_giu + k.giu_excel, 0)) : '…'}</small>
        </button>
        {(tq?.kho || []).map((k) => {
          const tru = k.cho_xuat + k.xuat_chua_cn + k.tam_giu + k.giu_excel;
          return (
            <button key={k.kho} className={'tk-k' + (kho === k.kho ? ' on' : '') + (k.so_vuot > 0 ? ' co-vuot' : '')} onClick={() => setKho(k.kho)}>
              <span>{k.ten}<i>{k.kho}</i></span>
              <b>{fmt(k.kha_dung)}</b>
              <small>tồn {fmt(k.ton_thuc)} − đang trừ {fmt(tru)}</small>
              <div className="tk-k-thanh" aria-hidden="true"><i style={{ width: (k.ton_thuc > 0 ? Math.min(100, (tru / k.ton_thuc) * 100) : 0) + '%' }} /></div>
              <em>{fmt(k.so_phieu)} phiếu chờ xuất{k.so_vuot > 0 ? <strong> · {k.so_vuot} mã vượt</strong> : ''}</em>
            </button>);
        })}
      </div>
      <p className="tk-cong-thuc">Khả dụng = tồn thực − chờ xuất − đã xuất nhưng tồn chưa cập nhật − tạm giữ − giữ hàng Excel. Phần kho đã xuất trước lúc chụp tồn đã nằm trong tồn thực nên không trừ lặp.</p>

      {/* Lọc */}
      <div className="odn-loc">
        <label className="odn-tim"><IcSearch />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mã hàng, tên, barcode, SKU…" /></label>
        <div className="tk-seg">{LOC.map(([k, t]) => (
          <button key={k} className={loc === k ? 'on' : ''} onClick={() => setLoc(k)}>{t}</button>))}</div>
        {odoo && <button className="btn btn-ai odn-nut-chinh" onClick={() => setTao({ kho: kho === 'tat_ca' ? '' : kho })}><IcGuiLen /> Tạo đơn</button>}
      </div>

      {loi && <div className="odn-bao do"><IcAlert /> Không tải được: {loi} <button onClick={() => { taiTq(); taiDs(); }}>Thử lại</button></div>}

      <div className="odn-bang-khung">
        <table className="odn-bang tk-bang">
          <thead><tr>
            <th className="sap" onClick={() => bamCot('ma')}>Mã hàng{mt('ma')}</th>
            {kho === 'tat_ca' && <th className="c-kho">Kho</th>}
            <th className="sap so" onClick={() => bamCot('ton_thuc')}>Tồn thực{mt('ton_thuc')}</th>
            <th className="sap so" onClick={() => bamCot('cho_xuat')}>Chờ xuất{mt('cho_xuat')}</th>
            <th className="sap so c-an" onClick={() => bamCot('xuat_chua_cn')} title="Kho đã xuất sau lúc chụp tồn — tồn thực chưa trừ kịp">Đã xuất chưa CN{mt('xuat_chua_cn')}</th>
            <th className="sap so c-an" onClick={() => bamCot('giu_excel')} title="Giữ hàng sau khi xuất file Excel + tạm giữ">Giữ khác{mt('giu_excel')}</th>
            <th className="sap so" onClick={() => bamCot('kha_dung')}>Khả dụng{mt('kha_dung')}</th>
            <th className="sap so c-an" onClick={() => bamCot('so_phieu')}>Phiếu{mt('so_phieu')}</th>
          </tr></thead>
          <tbody>
            {ds == null ? <tr><td colSpan={8} className="odn-trong">Đang tính tồn khả dụng…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={8} className="odn-trong">{loc === 'vuot' ? 'Không có mã nào bị hứa xuất vượt tồn.' : 'Không có mã khớp bộ lọc.'}</td></tr>
              : rows.map((r) => (
                <tr key={r.kho + r.barcode} className={r.kha_dung < 0 ? 'tk-am' : ''} onClick={() => setMa({ kho: r.kho, barcode: r.barcode })}>
                  <td><div className="odn-ten">{r.ma || r.barcode}</div><div className="odn-phu">{r.ten || r.nganh_3 || ''}{r.ten || r.nganh_3 ? ' · ' : ''}{r.barcode}</div></td>
                  {kho === 'tat_ca' && <td className="c-kho"><span className="odn-ten nho">{r.kho}</span></td>}
                  <td className="so">{fmt(r.ton_thuc)}</td>
                  <td className="so">{r.cho_xuat ? <b className="tk-tru">−{fmt(r.cho_xuat)}</b> : '—'}</td>
                  <td className="so c-an">{r.xuat_chua_cn ? <b className="tk-tru">−{fmt(r.xuat_chua_cn)}</b> : '—'}</td>
                  <td className="so c-an">{r.giu_excel + r.tam_giu ? <b className="tk-tru">−{fmt(r.giu_excel + r.tam_giu)}</b> : '—'}</td>
                  <td className="so"><b className={'tk-kd' + (r.kha_dung < 0 ? ' am' : r.kha_dung === 0 ? ' het' : '')}>{fmt(r.kha_dung)}</b></td>
                  <td className="so c-an">{r.so_phieu || '—'}</td>
                </tr>))}
          </tbody>
          {ds?.cong && rows.length > 0 && (
            <tfoot><tr>
              <td>Cộng {fmt(ds.tong)} mã</td>{kho === 'tat_ca' && <td className="c-kho" />}
              <td className="so">{fmt(ds.cong.ton_thuc)}</td><td className="so">−{fmt(ds.cong.cho_xuat)}</td>
              <td className="so c-an">−{fmt(ds.cong.xuat_chua_cn)}</td><td className="so c-an">−{fmt(ds.cong.giu_excel + ds.cong.tam_giu)}</td>
              <td className="so">{fmt(ds.cong.kha_dung)}</td><td className="c-an" />
            </tr></tfoot>)}
        </table>
        {ds && ds.tong > rows.length && <div className="odn-phu odn-chan-bang">Đang hiện {rows.length}/{fmt(ds.tong)} mã — tìm theo mã để thu hẹp.</div>}
      </div>

      {ma && <NganMa kho={ma.kho} barcode={ma.barcode} tenKho={khoTen(ma.kho)} dong={() => setMa(null)} odoo={odoo}
        doi={() => { taiTq(); taiDs(); }} taoDon={odoo ? (sp) => setTao({ kho: ma.kho, sp }) : null} />}
      {tao && <Suspense fallback={null}><TaoDon khoDau={tao.kho} maDau={tao.sp} onDong={() => setTao(null)} onXong={() => { taiTq(); taiDs(); }} /></Suspense>}
    </div>
  );

  if (nhung) return noiDung;
  return (
    <>
      <div className="cmdbar">
        <h1>Tồn khả dụng</h1>
        <div className="sub">Tồn kho tổng đã trừ hàng đang hứa xuất — số dùng để chia, đề nghị và tạo đơn.</div>
      </div>
      {noiDung}
    </>
  );
}

/* ================= Ngăn chi tiết 1 mã ở 1 kho ================= */
function NganMa({ kho, barcode, tenKho, dong, doi, taoDon, odoo }) {
  const { user, baoToast } = useApp();
  const [ct, setCt] = useState(null);
  const [loi, setLoi] = useState('');
  const [don, setDon] = useState(null);         // id đơn app đang mở
  const [nha, setNha] = useState(null);         // tên phiếu đang giải phóng
  const [lyDo, setLyDo] = useState('');
  const tai = useCallback(async () => {
    const { data, error } = await sb.rpc('fn_ton_ct', { p_token: user.token, p_kho: kho, p_barcode: barcode });
    if (error) { setLoi(error.message); return; }
    setCt(data);
  }, [kho, barcode, user.token]);
  useEffect(() => { tai(); }, [tai]);
  useEffect(() => { const h = (e) => { if (e.key === 'Escape' && !don && !nha) dong(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [dong, don, nha]);

  const giaiPhong = async () => {
    const { data, error } = await sb.rpc('fn_ton_nha', { p_token: user.token, p_name: nha, p_ly_do: lyDo });
    if (error || !data?.ok) { baoToast(error?.message || data?.loi || 'Không giải phóng được'); return; }
    baoToast(`Đã giải phóng ${nha} — trả lại khả dụng`); setNha(null); setLyDo(''); tai(); doi();
  };

  const s = ct?.so;
  const dangGiu = (ct?.phieu || []).filter((p) => p.dang_tru > 0);
  const daXong = (ct?.phieu || []).filter((p) => !(p.dang_tru > 0));
  const ql = user.vai_tro === 'ADMIN' || user.vai_tro === 'DIEU_PHOI';
  return (
    <div className="kt-modal odn-nen" onMouseDown={(e) => { if (e.target === e.currentTarget) dong(); }}>
      <aside className="odn-ngan" role="dialog" aria-label="Chi tiết tồn khả dụng">
        {!ct ? <div className="odn-ngan-tai">{loi ? <><IcAlert /> {loi}</> : 'Đang tải…'}<button className="odn-x" onClick={dong}>×</button></div> : (
          <>
            <header className="odn-ngan-dau">
              <div>
                <small>{tenKho} · {kho}</small>
                <h2>{ct.sp?.ma || barcode}</h2>
                <p>{ct.sp?.ten || ct.sp?.nganh_3 || ''}{ct.sp?.ten || ct.sp?.nganh_3 ? ' · ' : ''}{barcode}{ct.sp?.sku ? ' · SKU ' + ct.sp.sku : ''}</p>
              </div>
              <button className="odn-x" onClick={dong} aria-label="Đóng">×</button>
            </header>
            <div className="odn-ngan-than">
              {/* Phép tính khả dụng */}
              <section className="tk-pt">
                <div><span>Tồn thực</span><b>{fmt(s?.ton_thuc)}</b><small>chụp {gioNgay(ct.snap)}</small></div>
                <i>−</i>
                <div><span>Chờ xuất</span><b>{fmt(s?.cho_xuat)}</b><small>{dangGiu.filter((p) => ['giu_cho', 'cho_xuat'].includes(p.trang_thai)).length} phiếu</small></div>
                <i>−</i>
                <div><span>Đã xuất chưa CN</span><b>{fmt(s?.xuat_chua_cn)}</b><small>tới lần chụp tồn sau</small></div>
                <i>−</i>
                <div><span>Giữ khác</span><b>{fmt((s?.tam_giu || 0) + (s?.giu_excel || 0))}</b><small>tạm giữ + Excel</small></div>
                <i>=</i>
                <div className={'kq' + ((s?.kha_dung || 0) < 0 ? ' am' : '')}><span>Khả dụng</span><b>{fmt(s?.kha_dung)}</b><small>{(s?.kha_dung || 0) < 0 ? 'đã hứa vượt tồn' : 'còn chia được'}</small></div>
              </section>
              {taoDon && <div className="odn-tac"><button className="btn btn-ai odn-nut-chinh" onClick={() => taoDon({ barcode, ma: ct.sp?.ma, ten: ct.sp?.ten, sku: ct.sp?.sku, ...(s || {}), giu_khac: (s?.xuat_chua_cn || 0) + (s?.tam_giu || 0) + (s?.giu_excel || 0) })}><IcGuiLen /> Tạo đơn từ kho này</button></div>}

              <section className="odn-muc">
                <h3>Phiếu đang giữ tồn <span>{dangGiu.length} phiếu · {fmt(dangGiu.reduce((a, p) => a + p.dang_tru, 0))} cái</span></h3>
                {dangGiu.length === 0 ? <p className="odn-phu">Không có phiếu nào đang giữ mã này.</p> : (
                  <table className="odn-ct">
                    <thead><tr><th>Phiếu</th><th className="so">Đặt</th><th className="so">Đã xuất</th><th className="so">Đang trừ</th><th /></tr></thead>
                    <tbody>{dangGiu.map((p) => (
                      <tr key={p.name}>
                        <td><b>{p.name}</b><span>→ {p.kho_den}{p.ten_den && p.ten_den !== p.kho_den ? ' · ' + p.ten_den : ''} · <i className={'tk-tt ' + (TT_CK[p.trang_thai]?.[1] || '')}>{TT_CK[p.trang_thai]?.[0] || p.trang_thai}</i>
                          {p.odoo_tt ? ' · Odoo: ' + p.odoo_tt + (p.odoo_ct ? ' / ' + p.odoo_ct : '') : ''} · {p.nguon === 'app' ? 'đơn app, chưa thấy trên Odoo' : 'theo dữ liệu Odoo'} · từ {gioNgay(p.tao_luc)}</span>
                          {p.ghi_chu && <span className="tk-gc">✎ {p.ghi_chu}</span>}</td>
                        <td className="so">{fmt(p.sl_dat)}</td><td className="so">{fmt(p.sl_xuat)}</td><td className="so"><b>{fmt(p.dang_tru)}</b></td>
                        <td className="tk-tac">
                          {p.don_id && <button className="odn-link" onClick={() => setDon(p.don_id)}>Mở đơn</button>}
                          {ql && <button className="odn-link do" onClick={() => setNha(p.name)}>Giải phóng</button>}
                        </td>
                      </tr>))}</tbody>
                  </table>)}
              </section>

              {(ct.giu || []).length > 0 && (
                <section className="odn-muc">
                  <h3>Giữ hàng sau khi xuất Excel <span>tự hết sau 60 phút hoặc khi tồn đồng bộ</span></h3>
                  <table className="odn-ct"><tbody>{ct.giu.map((g, i) => (
                    <tr key={i}><td><b>{g.ma_ch}</b><span>{g.nguoi} · {gioNgay(g.tao_luc)} → hết {gioNgay(g.het_han)}{g.dang_tru ? '' : ' · tồn đã cập nhật, không trừ nữa'}</span></td><td className="so">{fmt(g.so_luong)}</td></tr>))}</tbody></table>
                </section>)}

              <section className="odn-muc">
                <h3>Nhật ký tăng / giảm khả dụng <span>{(ct.nhat_ky || []).length} sự kiện</span></h3>
                <ol className="tk-nk">{(ct.nhat_ky || []).map((n) => {
                  const l = LOAI_NK[n.loai] || [n.loai, ''];
                  return (
                    <li key={n.id} className={l[1]}>
                      <span className="t">{gioNgay(n.luc)}</span>
                      <div>
                        <b>{l[0]} {n.anh_huong !== 0 && <em className={n.anh_huong < 0 ? 'giam' : 'tang'}>{n.anh_huong > 0 ? '+' : '−'}{fmt(Math.abs(n.anh_huong))}</em>}
                          {n.loai === 'XUAT' && <em className="xuat">{fmt(n.sl)} cái{n.da_phan_anh ? ' · đã vào tồn thực' : ' · chờ tồn cập nhật'}</em>}</b>
                        <span>{n.noi_dung}</span>
                        <small>{n.name}{n.nguoi ? ' · ' + n.nguoi : ''}</small>
                      </div>
                    </li>);
                })}</ol>
              </section>

              {daXong.length > 0 && (
                <details className="odn-tho"><summary>{daXong.length} phiếu đã xong / đã trả lại</summary>
                  <table className="odn-ct"><tbody>{daXong.map((p) => (
                    <tr key={p.name}><td><b>{p.name}</b><span>→ {p.kho_den} · {TT_CK[p.trang_thai]?.[0] || p.trang_thai} · cập nhật {gioNgay(p.cap_nhat)}</span></td>
                      <td className="so">{fmt(p.sl_dat)}</td><td className="so">{fmt(p.sl_xuat)}</td></tr>))}</tbody></table>
                </details>)}
            </div>
          </>)}
        {nha && (
          <div className="odn-hop-nen" onMouseDown={(e) => { if (e.target === e.currentTarget) setNha(null); }}>
            <div className="odn-hop">
              <b>Giải phóng tồn đang giữ — {nha}</b>
              <p>Trả lại khả dụng mọi dòng của phiếu này. Dùng khi kho đã báo sẽ không xuất (phiếu treo lâu, đã huỷ ngoài hệ thống…).
                Nếu dữ liệu Odoo sau đó vẫn thấy đơn app đang chờ xuất, hệ thống tự trừ lại.</p>
              <textarea autoFocus value={lyDo} onChange={(e) => setLyDo(e.target.value)} placeholder="Lý do giải phóng (bắt buộc)" rows={3} maxLength={300} />
              <div className="odn-hop-chan">
                <button className="odn-nut-phu" onClick={() => setNha(null)}>Huỷ</button>
                <button className="btn btn-ai odn-nut-chinh" disabled={lyDo.trim().length < 3} onClick={giaiPhong}><IcCheck /> Giải phóng</button>
              </div>
            </div>
          </div>)}
      </aside>
      {don && <NganChiTiet id={don} dong={() => setDon(null)} odoo={odoo} saiXong={() => { tai(); doi(); }} />}
    </div>
  );
}
