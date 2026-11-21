import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { useApp } from '../App.jsx';
import { Sel } from '../lib/ui.jsx';
import { IcSearch, IcAlert, IcCheck, IcGuiLen, IcDown, IcBox } from '../lib/icons.jsx';
import { moOdoo, ghiChuGanDay, nhoGhiChu, saleChCuaDoi, nhoSaleCh } from '../lib/odoo.js';

// ============================================================================
// TẠO ĐƠN ĐIỀU CHUYỂN TRỰC TIẾP (v3.117.0 — SQL 207)
//   Chọn kho → tìm mã (gõ / quét mã vạch) → nhập số lượng, thấy NGAY tồn khả dụng của kho cung ứng
//   (tồn thực − hàng đã hứa xuất − đã xuất chưa cập nhật) → gửi qua hộp Odoo chung (chống trùng, hỏi xác nhận khi vượt tồn,
//   giữ chỗ tồn ngay lúc gửi). Tên đơn cấp CHUNG dãy số với file Excel (fn_cap_so_phieu) -> không trùng tên phiếu.
//   Tài khoản cửa hàng: kho yêu cầu cố định là cửa hàng mình, người tạo trên Odoo = mã cửa hàng.
// ============================================================================

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('vi'));
const lsGet = (k, d = '') => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* bỏ qua */ } };
const laDoiSale = (k) => /^DOISALE/i.test(String(k || ''));
const ymd = () => { const d = new Date(); return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'); };

export default function TaoDon({ onDong, onXong, khoDau = '', maDau = null }) {
  const { user, baoToast } = useApp();
  const laCH = user.vai_tro === 'CH' && !!user.ma_ch;
  const [dm, setDm] = useState(null);                 // danh mục kho / CH / lý do (fn_ton_kho_ds)
  const [cung, setCung] = useState(() => khoDau || lsGet('ns_td_cung'));
  const [yeu, setYeu] = useState(() => (laCH ? user.ma_ch : lsGet('ns_td_yeu')));
  const [loai, setLoai] = useState('DK');             // DK định kỳ · KC khẩn cấp (tiền tố tên đơn)
  const [lyDo, setLyDo] = useState('');
  const [ghiChu, setGhiChu] = useState('');
  const [sale, setSale] = useState('');
  const [q, setQ] = useState('');
  const [kq, setKq] = useState(null);                 // kết quả tìm
  const [chonKq, setChonKq] = useState(0);
  const [dong, setDong] = useState([]);               // [{barcode, ma, ten, sku, sl}]
  const [kd, setKd] = useState({});                   // barcode -> {ton_thuc, cho_xuat, giu_khac, kha_dung}
  const [dangTim, setDangTim] = useState(false);
  const [xong, setXong] = useState(null);             // đơn vừa tạo
  const [gcGan] = useState(() => ghiChuGanDay());
  const oTim = useRef(null);
  const hen = useRef(null);

  useEffect(() => {
    sb.rpc('fn_ton_kho_ds', { p_token: user.token }).then(({ data, error }) => {
      if (error) { baoToast('Không tải được danh mục kho: ' + error.message); return; }
      // thứ tự kho tổng quen dùng: BH chính, NV chính, phụ kiện, sale BH, sale NV
      const UU = ['TP05006', 'TP05002', 'PK05001', 'SA05001', 'SA05002'];
      const kt = [...(data?.kho_tong || [])].sort((x, y) => ((UU.indexOf(x.ma) + 1) || 99) - ((UU.indexOf(y.ma) + 1) || 99));
      setDm({ ...data, kho_tong: kt });
      setCung((c) => c || kt[0]?.ma || '');
    });
  }, [user.token]);   // eslint-disable-line

  // lý do mặc định theo loại đơn
  useEffect(() => {
    if (!dm) return;
    const ds = dm.ly_do || [];
    const md = loai === 'KC' ? (dm.ly_do_mac_dinh?.khan_cap || 'KHẨN CẤP') : (dm.ly_do_mac_dinh?.de_nghi || 'ĐỊNH KỲ');
    setLyDo(ds.includes(md) ? md : ds[0] || '');
  }, [dm, loai]);
  useEffect(() => { if (laDoiSale(yeu)) setSale(saleChCuaDoi(yeu)); else setSale(''); }, [yeu]);
  useEffect(() => { if (cung) lsSet('ns_td_cung', cung); }, [cung]);
  useEffect(() => { if (yeu && !laCH) lsSet('ns_td_yeu', yeu); }, [yeu, laCH]);
  useEffect(() => { const h = (e) => { if (e.key === 'Escape' && !document.querySelector('.od-hop')) onDong(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onDong]);

  // tìm sản phẩm (gõ hoặc quét) — kèm khả dụng ở kho cung ứng
  useEffect(() => {
    clearTimeout(hen.current);
    const t = q.trim();
    if (t.length < 2 || !cung) { setKq(null); return undefined; }
    hen.current = setTimeout(async () => {
      setDangTim(true);
      const { data, error } = await sb.rpc('fn_ton_tim', { p_token: user.token, p_kho: cung, p_q: t, p_gioi_han: 30 });
      setDangTim(false);
      if (error) { baoToast('Tìm lỗi: ' + error.message); return; }
      setKq(data || []); setChonKq(0);
    }, 250);
    return () => clearTimeout(hen.current);
  }, [q, cung, user.token]);   // eslint-disable-line

  // khả dụng trực tiếp của các mã trong đơn (đổi kho / thêm mã / 30 giây một lần)
  const maTrongDon = useMemo(() => dong.map((d) => d.barcode).join(','), [dong]);
  const taiKd = useCallback(async () => {
    if (!cung || !dong.length) { setKd({}); return; }
    const { data } = await sb.rpc('fn_ton_kd_ma', { p_token: user.token, p_kho: cung, p_barcodes: dong.map((d) => d.barcode) });
    setKd(data || {});
  }, [cung, maTrongDon, user.token]);   // eslint-disable-line
  useEffect(() => { taiKd(); const t = setInterval(taiKd, 30000); return () => clearInterval(t); }, [taiKd]);

  useEffect(() => {
    if (maDau?.barcode) themMa(maDau);
  }, []);   // eslint-disable-line

  const themMa = (sp) => {
    setXong(null);
    setDong((ds) => {
      const i = ds.findIndex((d) => d.barcode === sp.barcode);
      if (i >= 0) return ds.map((d, j) => (j === i ? { ...d, sl: (Number(d.sl) || 0) + 1 } : d));   // quét lại = +1
      return [...ds, { barcode: sp.barcode, ma: sp.ma || sp.barcode, ten: sp.ten || sp.nganh_3 || '', sku: sp.sku || '', sl: 1 }];
    });
    if (sp.kha_dung != null) setKd((m) => ({ ...m, [sp.barcode]: { ton_thuc: sp.ton_thuc, cho_xuat: sp.cho_xuat, giu_khac: sp.giu_khac, kha_dung: sp.kha_dung } }));
    setQ(''); setKq(null);
    setTimeout(() => oTim.current?.focus(), 0);
  };
  const phimTim = (e) => {
    if (!kq?.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setChonKq((i) => Math.min(i + 1, kq.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setChonKq((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); themMa(kq[chonKq] || kq[0]); }
  };

  const khoOpts = useMemo(() => {
    if (!dm) return [];
    const kt = (dm.kho_tong || []).map((k) => ({ value: k.ma, label: `${k.ma} · ${k.ten}`, sub: 'Kho tổng' }));
    const ch = (dm.cua_hang || []).map((c) => ({ value: c.ma, label: `${c.ma} · ${c.ten}`, sub: c.khu_vuc || '' }));
    return [...kt, ...ch];
  }, [dm]);
  const yeuOpts = useMemo(() => {
    if (!dm) return [];
    const ch = (dm.cua_hang || []).map((c) => ({ value: c.ma, label: `${c.ma} · ${c.ten}`, sub: c.khu_vuc || '' }));
    const ds = (dm.doi_sale || []).map((d) => ({ value: d, label: d, sub: 'Đội sale' }));
    const kt = (dm.kho_tong || []).map((k) => ({ value: k.ma, label: `${k.ma} · ${k.ten}`, sub: 'Kho tổng' }));
    return [...ch, ...ds, ...kt];
  }, [dm]);
  const tenYeu = useMemo(() => (dm?.cua_hang || []).find((c) => c.ma === yeu)?.ten || '', [dm, yeu]);

  const tong = dong.reduce((s, d) => s + (Number(d.sl) || 0), 0);
  const vuot = dong.filter((d) => kd[d.barcode] && (Number(d.sl) || 0) > kd[d.barcode].kha_dung);
  const thieu = !cung ? 'Chọn kho cung ứng' : !yeu ? 'Chọn kho yêu cầu' : cung === yeu ? 'Kho cung ứng trùng kho yêu cầu'
    : !dong.length ? 'Thêm ít nhất 1 mã hàng' : dong.some((d) => !(Number(d.sl) > 0)) ? 'Có dòng số lượng bằng 0' : !lyDo ? 'Chọn lý do' : '';

  const capTen = async () => {
    const { data, error } = await sb.rpc('fn_cap_so_phieu', { p_ma_ch: yeu, p_so_luong: 1 });
    if (error) { baoToast('Không cấp được số phiếu: ' + error.message); return null; }
    return `${loai}${ymd()}-${cung}-${yeu}-${String(data || 1).padStart(2, '0')}`;
  };
  const chiTiet = () => dong.map((d) => ({ sku: d.sku || '', barcode: d.barcode, nhu_cau: Math.floor(Number(d.sl) || 0), ma: d.ma }));

  const xuatExcel = async (tenSan) => {
    const name = tenSan || await capTen(); if (!name) return;
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(dong.map((d) => ({ 'Kho nguồn': cung, 'Kho đích': yeu, 'SKU/ Barcode': d.sku || d.barcode, 'Số lượng': Math.floor(Number(d.sl) || 0), 'Mã kho': name })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Trang tính1');
    XLSX.writeFile(wb, `DIEUCHUYEN_${yeu}_${cung}.xlsx`);
    // như Đề nghị hàng: xuất file = giữ hàng tạm trong lúc chờ nhập Odoo
    try { await sb.rpc('fn_giu_hang', { p_token: user.token, p_ma_ch: yeu, p_kho_ma: cung, p_lines: dong.map((d) => ({ barcode: d.barcode, so_luong: Math.floor(Number(d.sl) || 0) })) }); } catch { /* đã xuất file */ }
    nhoGhiChu(ghiChu);
    baoToast(`Đã xuất ${name} (${dong.length} dòng) — nhập file vào Odoo`);
  };

  const gui = async () => {
    if (thieu) { baoToast(thieu); return; }
    const name = await capTen(); if (!name) return;
    if (laDoiSale(yeu) && sale) nhoSaleCh(yeu, sale);
    const loaiTen = loai === 'KC' ? 'KHẨN CẤP ' : '';
    moOdoo({
      tieuDe: `Tạo đơn ${loaiTen}${cung} → ${yeu}${tenYeu ? ' · ' + tenYeu : ''}`, man: 'tao_don', lyDo,
      don: [{ name, tai_lieu_nguon: name, kho_cung_ung: cung, kho_yeu_cau: yeu, ten_yeu_cau: tenYeu, ghi_chu: ghiChu.trim(),
        sale_tai_cua_hang: laDoiSale(yeu) ? sale : '', chi_tiet: chiTiet() }],
      onExcel: dm?.odoo_bat ? () => xuatExcel(name) : null,
      onThanhCong: async (ok) => {
        nhoGhiChu(ghiChu);
        setXong({ name: ok?.[0]?.name || name, sl: tong, dong: dong.length });
        setDong([]); setKd({});
        try { onXong && onXong(); } catch { /* bỏ qua */ }
      },
    });
  };

  return (
    <div className="kt-modal td-nen" onMouseDown={(e) => { if (e.target === e.currentTarget) onDong(); }}>
      <div className="td-hop" role="dialog" aria-label="Tạo đơn điều chuyển">
        <header className="td-dau">
          <div>
            <small>Tạo đơn điều chuyển</small>
            <b>{cung || '…'} → {yeu || '…'}{tenYeu ? <em> · {tenYeu}</em> : null}</b>
            <span>Khả dụng = tồn thực − hàng đã hứa xuất (phiếu chờ xuất) — trừ ngay khi đơn gửi thành công</span>
          </div>
          <button className="odn-x" onClick={onDong} aria-label="Đóng">×</button>
        </header>

        <div className="td-than">
          {/* Cài đặt đơn */}
          <section className="td-cai">
            <div className="td-o"><span>Kho cung ứng</span>
              <Sel value={cung} onChange={(v) => { setCung(v); setXong(null); }} options={khoOpts} placeholder="Chọn kho xuất" timKiem /></div>
            <div className="td-o"><span>Kho yêu cầu {laCH && <i className="td-khoa">cửa hàng của bạn</i>}</span>
              {laCH ? <div className="td-co-dinh">{yeu} · {tenYeu}</div>
                : <Sel value={yeu} onChange={(v) => { setYeu(v); setXong(null); }} options={yeuOpts} placeholder="Chọn cửa hàng / đội / kho nhận" timKiem />}</div>
            <div className="td-o"><span>Loại đơn</span>
              <div className="td-seg">
                <button className={loai === 'DK' ? 'on' : ''} onClick={() => setLoai('DK')}>Định kỳ</button>
                <button className={loai === 'KC' ? 'on kc' : ''} onClick={() => setLoai('KC')}>Khẩn cấp</button>
              </div></div>
            <div className="td-o"><span>Lý do trên Odoo</span>
              <Sel value={lyDo} onChange={setLyDo} options={(dm?.ly_do || []).map((x) => ({ value: x, label: x }))} placeholder="— chọn lý do —" /></div>
            {laDoiSale(yeu) && (
              <div className="td-o"><span>CH đội đang sale</span>
                <Sel value={sale} onChange={setSale} timKiem placeholder="— không ghi —"
                  options={[{ value: '', label: '— không ghi —' }, ...(dm?.cua_hang || []).map((c) => ({ value: c.ma, label: `${c.ma} · ${c.ten}` }))]} /></div>)}
            <div className="td-o rong"><span>Ghi chú cho kho <small>{ghiChu.length}/300</small></span>
              <textarea value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} maxLength={300} rows={2}
                placeholder="Vd: Giao gấp trước 15h · Hàng khách đặt · Gom chuyến xe chiều" />
              {gcGan.length > 0 && <div className="td-gc-nhanh">{gcGan.filter((g) => g !== ghiChu).slice(0, 6).map((g) => (
                <button key={g} type="button" onClick={() => setGhiChu(g)}>{g}</button>))}</div>}
            </div>
            <p className="td-nguoi">Người tạo trên Odoo: <b>{laCH ? user.ma_ch : 'user của kho yêu cầu'}</b>{!laCH && ' (đổi được ở bước gửi)'} · người gửi {user.ma_dang_nhap || user.ma}</p>
          </section>

          {/* Mã hàng */}
          <section className="td-hang">
            <div className="td-tim-khung">
              <label className="odn-tim td-tim"><IcSearch />
                <input ref={oTim} autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={phimTim}
                  placeholder={cung ? 'Gõ mã / tên / quét mã vạch rồi Enter…' : 'Chọn kho cung ứng trước'} disabled={!cung} />
                {dangTim && <span className="td-dang">đang tìm…</span>}
              </label>
              {kq && (
                <div className="td-kq">
                  {kq.length === 0 ? <div className="td-kq-trong">Không thấy mã nào khớp "{q}" trong DATA SẢN PHẨM.</div>
                    : kq.map((r, i) => (
                      <button key={r.barcode} className={'td-kq-h' + (i === chonKq ? ' on' : '')} onMouseEnter={() => setChonKq(i)} onMouseDown={(e) => { e.preventDefault(); themMa(r); }}>
                        <span className="td-kq-ma"><b>{r.ma || r.barcode}</b><small>{r.ten || r.nganh_3 || ''} · {r.barcode}</small></span>
                        <span className="td-kq-so"><i>Tồn {fmt(r.ton_thuc)}</i>{r.cho_xuat > 0 && <i>chờ xuất {fmt(r.cho_xuat)}</i>}
                          <b className={r.kha_dung > 0 ? '' : 'het'}>Khả dụng {fmt(Math.max(r.kha_dung, 0))}</b></span>
                      </button>))}
                </div>)}
            </div>

            {xong && (
              <div className="odn-bao xanh td-xong"><IcCheck /><div><b>Đã tạo {xong.name} trên Odoo — {fmt(xong.sl)} cái / {xong.dong} dòng.</b>
                Tồn khả dụng kho {cung} đã trừ ngay. Tạo đơn tiếp bằng cách thêm mã mới.</div></div>)}

            {dong.length === 0 ? (
              <div className="td-trong"><IcBox /><b>Chưa có mã nào</b><span>Gõ mã hàng, tên hoặc quét mã vạch ở ô trên. Quét lại cùng mã = cộng thêm 1.</span></div>
            ) : (
              <div className="td-bang-khung">
                <table className="td-bang">
                  <thead><tr><th>Mã hàng</th><th className="so">Tồn thực</th><th className="so">Chờ xuất</th><th className="so">Khả dụng</th><th className="so">Số lượng</th><th /></tr></thead>
                  <tbody>{dong.map((d, i) => {
                    const k = kd[d.barcode]; const sl = Number(d.sl) || 0; const qua = k && sl > k.kha_dung;
                    return (
                      <tr key={d.barcode} className={qua ? 'vuot' : ''}>
                        <td><b>{d.ma}</b><span>{d.ten ? d.ten + ' · ' : ''}{d.barcode}</span></td>
                        <td className="so">{k ? fmt(k.ton_thuc) : '…'}</td>
                        <td className="so">{k ? fmt(k.cho_xuat + (k.giu_khac || 0)) : '…'}</td>
                        <td className="so"><b className={k && k.kha_dung <= 0 ? 'het' : ''}>{k ? fmt(Math.max(k.kha_dung, 0)) : '…'}</b>
                          {qua && <em className="td-vuot">vượt {fmt(sl - Math.max(k.kha_dung, 0))}</em>}</td>
                        <td className="so"><input type="number" min="0" inputMode="numeric" value={d.sl}
                          onChange={(e) => setDong((ds) => ds.map((x, j) => (j === i ? { ...x, sl: e.target.value.replace(/[^\d]/g, '') } : x)))}
                          onFocus={(e) => e.target.select()} aria-label={'Số lượng ' + d.ma} /></td>
                        <td><button className="td-xoa" onClick={() => setDong((ds) => ds.filter((_, j) => j !== i))} aria-label={'Bỏ ' + d.ma}>×</button></td>
                      </tr>);
                  })}</tbody>
                </table>
              </div>)}
          </section>
        </div>

        <footer className="td-chan">
          <span className="td-tong"><b>{fmt(dong.length)}</b> mã · <b>{fmt(tong)}</b> cái
            {vuot.length > 0 && <em className="td-canh"><IcAlert /> {vuot.length} dòng vượt khả dụng</em>}
            {thieu && dong.length > 0 && <em className="td-thieu">{thieu}</em>}</span>
          <button className="odn-nut-phu" disabled={!!thieu} onClick={() => xuatExcel()}><IcDown /> Xuất Excel</button>
          {dm?.odoo_bat
            ? <button className="btn btn-ai odn-nut-chinh" disabled={!!thieu} onClick={gui}><IcGuiLen /> Gửi lên Odoo</button>
            : <button className="btn btn-ai odn-nut-chinh" disabled title="Tài khoản chưa được mở tạo đơn Odoo"><IcGuiLen /> Gửi lên Odoo (chưa mở)</button>}
        </footer>
      </div>
    </div>
  );
}
