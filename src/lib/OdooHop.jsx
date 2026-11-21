// Hộp "Tạo đơn điều chuyển Odoo" — dùng chung mọi màn hình (v3.114.0; chính thức từ v3.118.0)
//   App gắn <OdooHost user baoToast /> một lần; màn hình gọi moOdoo({...}) (lib/odoo.js) để mở.
//   Luồng: xem lại đơn (tick chọn) -> chọn Lý do / Người tạo / Ghi chú -> [Xem JSON] -> [Gửi N đơn lên Odoo]
//          -> kết quả từng đơn (✓ Đã tạo · ⚠ Cần xem · ✕ Lỗi) -> [Gửi lại đơn lỗi] (giữ nguyên tên đơn, không tạo trùng)
import { useEffect, useMemo, useState } from 'react';
import { sb } from './supabase.js';
import { goiOdoo, layCfgOdoo, thanhRequest, ghiChuGanDay, nhoGhiChu, saleChCuaDoi, nhoSaleCh } from './odoo.js';
import { IcAlert, IcCheck, IcDown, IcGuiLen } from './icons.jsx';
import { Sel } from './ui.jsx';

const fmt = (n) => Number(n || 0).toLocaleString('vi');
const TT = {
  thanh_cong: ['Đã tạo trên Odoo', 'ok'],
  can_xem: ['Cần xem lại', 'xem'],
  loi: ['Lỗi', 'loi'],
  dang_gui: ['Đang gửi…', 'gui'],
};

export function OdooHost({ user, baoToast }) {
  const [opts, setOpts] = useState(null);
  useEffect(() => {
    const nghe = (e) => setOpts({ ...(e.detail || {}), _k: Date.now() });
    window.addEventListener('ns-odoo-mo', nghe);
    return () => window.removeEventListener('ns-odoo-mo', nghe);
  }, []);
  if (!opts || !user) return null;
  return <HopOdoo key={opts._k} opts={opts} user={user} baoToast={baoToast}
    onDong={() => { const f = opts.onDong; setOpts(null); try { f && f(); } catch { /* bỏ qua */ } }} />;
}

const laDoiSale = (k) => /^DOISALE/i.test(String(k || ''));

function HopOdoo({ opts, user, baoToast, onDong }) {
  const [cfg, setCfg] = useState(null);
  // v3.118.0: tài khoản CỬA HÀNG — giao diện gọn: người tạo cố định = mã CH, không có Xem JSON / phản hồi kỹ thuật,
  //   dòng vượt tồn khả dụng KHÔNG gửi được (máy chủ chặn) -> chỉ có "Bỏ đơn vượt" / "Quay lại sửa số lượng"
  const laCH = user.vai_tro === 'CH';
  // đội sale: cửa hàng đội đang bán — nhớ theo từng đội (gửi Odoo "sale_tai_cua_hang")
  const [don, setDon] = useState(() => (opts.don || []).map((d, i) => ({
    ...d, _i: i, sale_tai_cua_hang: d.sale_tai_cua_hang || (laDoiSale(d.kho_yeu_cau) ? saleChCuaDoi(d.kho_yeu_cau) : ''),
  })));
  // đơn đã có trên nhật ký (d._tt): đã tạo thành công -> không tick, không gửi lại
  const [chon, setChon] = useState(() => new Set((opts.don || []).map((d, i) => (d._tt?.trang_thai === 'thanh_cong' ? -1 : i)).filter((i) => i >= 0)));
  const [kq, setKq] = useState(() => {
    const m = {}; (opts.don || []).forEach((d, i) => { if (d._tt) m[i] = d._tt; }); return m;
  });            // _i -> { trang_thai, loi }
  const [lyDo, setLyDo] = useState('');
  const [nguoiTao, setNguoiTao] = useState('');
  const [ghiChu, setGhiChu] = useState(opts.ghiChu || '');
  const [dangGui, setDangGui] = useState(false);
  const [loi, setLoi] = useState('');
  const [canhSv, setCanhSv] = useState([]);
  const [json, setJson] = useState(null);
  const [trung, setTrung] = useState(null);   // SQL 206: đơn giống hệt đơn đã tạo trong 48 giờ -> phải xác nhận
  const [vuot, setVuot] = useState(null);     // SQL 207: dòng vượt tồn khả dụng của kho (đã trừ hàng chờ xuất) -> phải xác nhận
  const [chanVuot, setChanVuot] = useState(false);   // SQL 209: tài khoản cửa hàng — vượt là chặn, không có "vẫn gửi"
  const [dsCh, setDsCh] = useState(null);     // danh sách cửa hàng cho ô "CH đội đang sale"
  const [gcGan] = useState(() => ghiChuGanDay());
  const coDoiSale = don.some((d) => laDoiSale(d.kho_yeu_cau));
  const [phanHoi, setPhanHoi] = useState(null);
  const [mo, setMo] = useState(() => new Set());

  useEffect(() => {
    layCfgOdoo(user.token).then((c) => {
      setCfg(c || {});
      const ds = c?.ly_do || [];
      const md = c?.ly_do_mac_dinh?.[opts.lyDo] || (ds.includes(opts.lyDo) ? opts.lyDo : '') || ds[0] || '';
      setLyDo((v) => v || md);
      // tài khoản CỬA HÀNG tạo đơn -> mặc định cửa hàng là người tạo trên Odoo
      setNguoiTao((v) => v || (user.vai_tro === 'CH' && user.ma_ch ? user.ma_ch : '') || c?.nguoi_tao || '');
    });
  }, [user.token]);   // eslint-disable-line
  useEffect(() => {
    if (!coDoiSale || dsCh) return;
    sb.rpc('fn_ton_kho_ds', { p_token: user.token }).then(({ data }) => setDsCh(data?.cua_hang || []));
  }, [coDoiSale, dsCh, user.token]);
  const doiDon = (i, gia) => setDon((ds) => ds.map((d) => (d._i === i ? { ...d, ...gia } : d)));

  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape' && !dangGui) onDong(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [dangGui, onDong]);

  const tongDon = (d) => d.chi_tiet.reduce((s, c) => s + (Number(c.nhu_cau) || 0), 0);
  const conGui = don.filter((d) => chon.has(d._i) && kq[d._i]?.trang_thai !== 'thanh_cong');
  const coLoi = don.some((d) => kq[d._i] && kq[d._i].trang_thai !== 'thanh_cong');
  const soOk = don.filter((d) => kq[d._i]?.trang_thai === 'thanh_cong').length;
  const tong = useMemo(() => ({
    don: conGui.length, dong: conGui.reduce((s, d) => s + d.chi_tiet.length, 0), sl: conGui.reduce((s, d) => s + tongDon(d), 0),
  }), [conGui.length, don, kq, chon]);   // eslint-disable-line
  const canh = [...(opts.canh || []), ...canhSv];
  const chung = { lyDo, nguoiTao, ghiChu };

  const doiChon = (i) => setChon((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const doiMo = (i) => setMo((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });

  const xemJson = async () => {
    if (!conGui.length) return;
    setLoi(''); setDangGui(true);
    const r = await goiOdoo({ token: user.token, man: opts.man, requests: conGui.map((d) => thanhRequest(d, chung)), xemTruoc: true });
    setDangGui(false);
    if (!r?.ok) { setLoi(r?.loi || 'Không xem trước được'); return; }
    setCanhSv(r.canh || []);
    setJson(r.requests || []);
  };

  const gui = async () => {
    const ds = conGui;
    if (!ds.length || dangGui) return;
    if (!lyDo) { setLoi('Chọn lý do trước khi gửi'); return; }
    setLoi(''); setDangGui(true); setJson(null);
    setKq((m) => { const n = { ...m }; ds.forEach((d) => { n[d._i] = { trang_thai: 'dang_gui' }; }); return n; });
    const r = await goiOdoo({ token: user.token, man: opts.man, requests: ds.map((d) => thanhRequest(d, chung)) });
    setDangGui(false);
    if (r?.canh) setCanhSv(r.canh);
    if (r?.http != null || r?.phan_hoi != null) setPhanHoi({ http: r.http, body: r.phan_hoi });

    // tên đơn máy chủ đã cấp -> ghi lại để gửi lại vẫn đúng tên (không tạo trùng)
    const ten = {};
    if (Array.isArray(r?.requests)) ds.forEach((d, j) => { if (r.requests[j]?.name) ten[d._i] = r.requests[j].name; });
    const donMoi = don.map((d) => (ten[d._i] && !d.name ? { ...d, name: ten[d._i] } : d));
    setDon(donMoi);

    if ((Array.isArray(r?.trung) && r.trung.length) || (Array.isArray(r?.vuot) && r.vuot.length)) {
      // chưa gửi gì — hỏi xác nhận: đơn trùng nội dung / dòng vượt tồn khả dụng
      setKq((m) => { const n = { ...m }; ds.forEach((d) => { delete n[d._i]; }); return n; });
      setTrung(r.trung?.length ? r.trung.map((t) => ({ ...t, _i: ds[t.i - 1]?._i })) : null);
      setVuot(r.vuot?.length ? r.vuot.map((t) => ({ ...t, _i: ds[t.i - 1]?._i })) : null);
      setChanVuot(!!r.chan_vuot);
      setLoi(r.loi);
      return;
    }
    setTrung(null); setVuot(null);
    if (!Array.isArray(r?.ket_qua)) {
      setKq((m) => { const n = { ...m }; ds.forEach((d) => { n[d._i] = { trang_thai: 'loi', loi: r?.loi || 'Không gửi được' }; }); return n; });
      setLoi(r?.loi || 'Không gửi được');
      return;
    }
    const theoTen = {};
    r.ket_qua.forEach((x) => { theoTen[x.name] = x; });
    const kqMoi = {}; const okMoi = [];
    donMoi.forEach((d) => {
      if (!ds.some((x) => x._i === d._i)) return;
      const x = theoTen[d.name];
      kqMoi[d._i] = x ? { trang_thai: x.trang_thai, loi: x.loi || '', duyet: x.odoo_duyet || '', odoo_id: x.odoo_id || null } : { trang_thai: 'loi', loi: r.loi || 'Không thấy kết quả của đơn này' };
      if (x?.trang_thai === 'thanh_cong') okMoi.push(d);
    });
    setKq((m) => ({ ...m, ...kqMoi }));
    if (r.loi) setLoi(r.loi);
    const nLoi = ds.length - okMoi.length;
    if (okMoi.length) { nhoGhiChu(ghiChu); ds.forEach((d) => { if (laDoiSale(d.kho_yeu_cau) && d.sale_tai_cua_hang) nhoSaleCh(d.kho_yeu_cau, d.sale_tai_cua_hang); }); }
    baoToast(`Odoo: ${okMoi.length ? `✓ tạo ${okMoi.length} đơn${laCH ? '' : ' — đã trừ tồn khả dụng kho'}` : ''}${okMoi.length && nLoi ? ' · ' : ''}${nLoi ? `${nLoi} đơn chưa tạo được — xem từng đơn` : ''}`);
    if (okMoi.length && opts.onThanhCong) {
      try { await opts.onThanhCong(okMoi); } catch (e) { baoToast('Đã tạo đơn Odoo nhưng bước lưu sau đó lỗi: ' + (e?.message || e)); }
    }
  };

  const xongHet = soOk > 0 && conGui.length === 0;   // không còn đơn nào đang chọn mà chưa tạo
  // Kết quả lần gửi: báo rõ THÀNH CÔNG / THẤT BẠI ngay đầu hộp
  const daGui = don.filter((d) => kq[d._i] && kq[d._i].trang_thai !== 'dang_gui');
  const guiLoi = daGui.filter((d) => kq[d._i].trang_thai !== 'thanh_cong');
  const guiOk = daGui.filter((d) => kq[d._i].trang_thai === 'thanh_cong');

  return (
    <div className="kt-modal gc-nen" onMouseDown={(e) => { if (e.target === e.currentTarget && !dangGui) onDong(); }}>
      <div className="od-hop" role="dialog" aria-label="Tạo đơn điều chuyển Odoo">
        <div className="od-dau">
          <div>
            <small>TẠO ĐƠN ĐIỀU CHUYỂN ODOO</small>
            <b>{opts.tieuDe || 'Đơn điều chuyển'}</b>
            <span>{don.length} đơn · {fmt(don.reduce((s, d) => s + d.chi_tiet.length, 0))} dòng · {fmt(don.reduce((s, d) => s + tongDon(d), 0))} cái
              {soOk > 0 && <> · <i>đã tạo {soOk}</i></>}</span>
          </div>
          <button className="kt-dong" onClick={() => !dangGui && onDong()} aria-label="Đóng">×</button>
        </div>

        <div className="od-than">
          <div className="od-cai">
            <label><span>Lý do <b className="od-bb">*</b></span>
              <Sel value={lyDo} onChange={(v) => !dangGui && setLyDo(v)} placeholder="— chọn lý do —"
                options={(cfg?.ly_do || []).map((x) => ({ value: x, label: x }))} />
            </label>
            {laCH ? (
              <label>Người tạo trên Odoo
                <div className="od-co-dinh">{user.ma_ch} <small>cửa hàng của bạn</small></div>
              </label>
            ) : (
              <label>Người tạo trên Odoo
                <input value={nguoiTao} maxLength={40} disabled={dangGui} placeholder="Để trống = user của kho yêu cầu"
                  onChange={(e) => setNguoiTao(e.target.value)} />
              </label>)}
            <label className="rong">Ghi chú chung <small className="od-dem">{ghiChu.length}/300</small>
              <textarea value={ghiChu} maxLength={300} rows={2} disabled={dangGui} placeholder="Vd: Giao gấp trước 15h · Hàng khách đặt · Gom chung chuyến xe chiều"
                onChange={(e) => setGhiChu(e.target.value)} />
              {gcGan.length > 0 && !dangGui && (
                <span className="od-gc-nhanh">{gcGan.filter((g) => g !== ghiChu).slice(0, 6).map((g) => (
                  <button key={g} type="button" onClick={() => setGhiChu(g)} title="Điền ghi chú đã dùng gần đây">{g}</button>))}</span>)}
            </label>
          </div>

          {!dangGui && daGui.length > 0 && (guiLoi.length === 0
            ? <div className="od-ket ok"><IcCheck /><div><b>Thành công — đã tạo {guiOk.length} đơn trên Odoo</b>
                {guiOk.map((d) => <span key={d._i}>{d.name}{kq[d._i].odoo_id ? ` · mã Odoo #${kq[d._i].odoo_id}` : ''}</span>)}</div></div>
            : <div className="od-ket loi"><IcAlert /><div><b>Thất bại — {guiLoi.length} đơn chưa tạo được{guiOk.length ? ` (${guiOk.length} đơn đã tạo)` : ''}</b>
                <span>Lý do ghi dưới từng đơn. Sửa xong bấm "Gửi lại" — tên đơn giữ nguyên nên không tạo trùng.</span></div></div>)}
          {loi && !trung && !vuot && !(daGui.length > 0 && guiLoi.length > 0) && <div className="od-bao loi"><IcAlert /> {loi}</div>}
          {trung && (
            <div className="od-bao canh od-trung"><IcAlert /><div>
              <b>Kiểm tra trước khi gửi — có thể là đơn gửi trùng:</b>
              {trung.map((t) => <div key={t.name}>• {t.name} giống hệt <b>{t.trung_voi}</b> (đã tạo {t.luc})</div>)}
              <div className="od-trung-nut">
                <button className="btn btn-ghost" onClick={() => { setChon((s) => { const n = new Set(s); trung.forEach((t) => n.delete(t._i)); return n; }); setTrung(null); setLoi(''); }}>Bỏ các đơn trùng</button>
                <button className="btn btn-ai od-gui" onClick={() => { const ids = new Set(trung.map((t) => t._i)); setDon((ds) => ds.map((d) => (ids.has(d._i) ? { ...d, cho_trung: true } : d))); setTrung(null); setLoi(''); }}>
                  <IcCheck /> Đã kiểm tra — vẫn gửi</button>
              </div>
            </div></div>
          )}
          {vuot && (
            <div className="od-bao canh od-trung od-vuot"><IcAlert /><div>
              <b>{chanVuot ? 'Kho không đủ hàng cho các dòng này:' : 'Vượt tồn khả dụng — kho không đủ hàng cho các dòng này (đã trừ hàng của phiếu đang chờ xuất):'}</b>
              {vuot.slice(0, 12).map((t, j) => <div key={j}>• {t.name}: <b>{t.ma}</b> cần {fmt(t.can)} · kho {t.kho} còn khả dụng <b className={t.kha_dung > 0 ? '' : 'het'}>{fmt(Math.max(t.kha_dung, 0))}</b>{t.kha_dung < 0 ? ` (đã hứa vượt ${fmt(-t.kha_dung)})` : ''}</div>)}
              {vuot.length > 12 && <div>… và {vuot.length - 12} dòng khác</div>}
              {chanVuot
                ? <p className="od-vuot-ghi">Kho không đủ hàng cho các dòng này. Giảm số lượng ở phiếu rồi tạo lại đơn, hoặc bỏ các đơn vượt để gửi phần còn lại.</p>
                : <p className="od-vuot-ghi">Vẫn gửi được (vd chia trước khi kho nhận hàng) — Odoo sẽ giữ NHÁP nếu kho thiếu hàng lúc duyệt.</p>}
              <div className="od-trung-nut">
                <button className="btn btn-ghost" onClick={() => { setChon((s) => { const n = new Set(s); vuot.forEach((t) => n.delete(t._i)); return n; }); setVuot(null); setLoi(''); }}>Bỏ các đơn vượt</button>
                {chanVuot
                  ? <button className="btn btn-ghost" onClick={onDong}>Quay lại sửa số lượng</button>
                  : <button className="btn btn-ai od-gui" onClick={() => { const ids = new Set(vuot.map((t) => t._i)); setDon((ds) => ds.map((d) => (ids.has(d._i) ? { ...d, cho_vuot: true } : d))); setVuot(null); setLoi(''); }}>
                      <IcCheck /> Đã kiểm tra — vẫn gửi</button>}
              </div>
            </div></div>
          )}
          {canh.length > 0 && <div className="od-bao canh"><IcAlert /> <div>{canh.map((c, i) => <div key={i}>{c}</div>)}</div></div>}

          <div className="od-ds">
            {don.map((d) => {
              const k = kq[d._i]; const tt = k ? TT[k.trang_thai] || TT.loi : null;
              const daTao = k?.trang_thai === 'thanh_cong';
              return (
                <div key={d._i} className={'od-don' + (chon.has(d._i) ? '' : ' bo') + (tt ? ' ' + tt[1] : '')}>
                  <div className="od-don-hang">
                    <input type="checkbox" checked={chon.has(d._i)} disabled={dangGui || daTao} onChange={() => doiChon(d._i)}
                      aria-label={'Chọn đơn ' + (d.name || d.kho_yeu_cau)} />
                    <div className="od-ten">
                      <b>{d.name || <span className="od-tu-cap">{(d.prefix || 'DK')}…-{d.kho_cung_ung}-{d.kho_yeu_cau}-NN <small>(tự cấp khi gửi)</small></span>}</b>
                      <small>{d.kho_cung_ung} → {d.kho_yeu_cau}{d.ten_yeu_cau ? ' · ' + d.ten_yeu_cau : ''}
                        {d.ly_do && <span className="od-ly"> · lý do riêng: {d.ly_do}</span>}
                        {d.tai_lieu_nguon && d.tai_lieu_nguon !== d.name && <span> · nguồn {d.tai_lieu_nguon}</span>}</small>
                      {d.ghi_chu && <small className="od-gc">✎ {d.ghi_chu}</small>}
                      {laDoiSale(d.kho_yeu_cau) && (
                        <div className="od-sale"><span>CH đội đang sale</span>
                          <Sel value={d.sale_tai_cua_hang || ''} timKiem placeholder="— không ghi —"
                            onChange={(v) => { if (!dangGui && !daTao) doiDon(d._i, { sale_tai_cua_hang: v }); }}
                            options={[{ value: '', label: '— không ghi —' },
                              ...(d.sale_tai_cua_hang && !(dsCh || []).some((c) => c.ma === d.sale_tai_cua_hang) ? [{ value: d.sale_tai_cua_hang, label: d.sale_tai_cua_hang }] : []),
                              ...(dsCh || []).map((c) => ({ value: c.ma, label: c.ma + ' · ' + c.ten }))]} />
                        </div>)}
                    </div>
                    <div className="od-so"><b>{fmt(tongDon(d))}</b> cái<small>{d.chi_tiet.length} dòng</small></div>
                    <div className="od-kq">
                      {tt ? <span className={'od-chip ' + tt[1]}>{k.trang_thai === 'thanh_cong' ? <IcCheck /> : k.trang_thai === 'dang_gui' ? null : <IcAlert />} {tt[0]}{k.odoo_id ? ` · #${k.odoo_id}` : ''}</span>
                        : <span className="od-chip cho">Chờ gửi</span>}
                      {k?.duyet === 'da_duyet' && <span className="od-duyet ok">Odoo tự duyệt</span>}
                      {k?.duyet === 'giu_nhap' && <span className="od-duyet nhap" title={k.loi}>Odoo giữ NHÁP</span>}
                    </div>
                    <button className="od-mo" onClick={() => doiMo(d._i)}>{mo.has(d._i) ? 'Ẩn' : 'Chi tiết'}</button>
                  </div>
                  {k?.loi && k.trang_thai !== 'thanh_cong' && <div className="od-don-loi">{k.loi}</div>}
                  {mo.has(d._i) && (
                    <div className="od-ct-bao">
                      {!daTao && (
                        <label className="od-gc-rieng">Ghi chú riêng đơn này
                          <input value={d.ghi_chu || ''} maxLength={200} disabled={dangGui} placeholder="Chỉ ghi vào đơn này (ghép với ghi chú chung)"
                            onChange={(e) => doiDon(d._i, { ghi_chu: e.target.value })} />
                        </label>)}
                      <table className="od-ct">
                        <thead><tr><th>Mã</th><th>SKU</th><th>Barcode</th><th className="num">SL</th></tr></thead>
                        <tbody>
                          {d.chi_tiet.slice(0, 300).map((c, j) => (
                            <tr key={j}><td>{c.ma || '—'}</td><td className="mono">{c.sku || <i className="od-mo-nhat">tự điền</i>}</td>
                              <td className="mono">{c.barcode || '—'}</td><td className="num">{fmt(c.nhu_cau)}</td></tr>))}
                          {d.chi_tiet.length > 300 && <tr><td colSpan={4} className="od-mo-nhat">… còn {d.chi_tiet.length - 300} dòng</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {json && !laCH && (
            <details className="od-raw" open>
              <summary>JSON sẽ gửi ({json.length} đơn) — đơn chưa có tên sẽ được cấp lại lúc gửi thật</summary>
              <pre>{JSON.stringify({ requests: json }, null, 2)}</pre>
            </details>
          )}
          {phanHoi && !laCH && (
            <details className="od-raw">
              <summary>Phản hồi Odoo · HTTP {phanHoi.http || '—'}</summary>
              <pre>{JSON.stringify(phanHoi.body, null, 2)?.slice(0, 20000) || '(trống)'}</pre>
            </details>
          )}
        </div>

        <div className="od-chan">
          <span className="od-ghi">{xongHet ? 'Đã tạo xong trên Odoo.' : 'Đơn tạo THẬT trên Odoo — kiểm tra kỹ trước khi gửi.'}</span>
          {opts.onExcel && !xongHet && (
            <button className="btn btn-ghost" disabled={dangGui} onClick={() => { const f = opts.onExcel; onDong(); f(); }}>
              <IcDown /> Xuất Excel thay thế</button>)}
          {!xongHet && !laCH && <button className="btn btn-ghost" disabled={dangGui || !conGui.length} onClick={xemJson}>Xem JSON</button>}
          {xongHet
            ? <button className="btn btn-ai od-gui" onClick={onDong}><IcCheck /> Xong</button>
            : <button className={'btn btn-ai od-gui' + (dangGui ? ' dang-chay' : '')} disabled={dangGui || !conGui.length || !lyDo} onClick={gui}>
                <IcGuiLen /> {dangGui ? 'Đang gửi…' : coLoi ? `Gửi lại ${tong.don} đơn` : `Gửi ${tong.don} đơn lên Odoo`}
              </button>}
        </div>
      </div>
    </div>
  );
}
