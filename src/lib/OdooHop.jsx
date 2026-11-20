// Hộp "Tạo đơn điều chuyển Odoo" — dùng chung mọi màn hình (v3.114.0, thử nghiệm)
//   App gắn <OdooHost user baoToast /> một lần; màn hình gọi moOdoo({...}) (lib/odoo.js) để mở.
//   Luồng: xem lại đơn (tick chọn) -> chọn Lý do / Người tạo / Ghi chú -> [Xem JSON] -> [Gửi N đơn lên Odoo]
//          -> kết quả từng đơn (✓ Đã tạo · ⚠ Cần xem · ✕ Lỗi) -> [Gửi lại đơn lỗi] (giữ nguyên tên đơn, không tạo trùng)
import { useEffect, useMemo, useState } from 'react';
import { goiOdoo, layCfgOdoo, thanhRequest } from './odoo.js';
import { IcAlert, IcCheck, IcDown, IcGuiLen } from './icons.jsx';

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

function HopOdoo({ opts, user, baoToast, onDong }) {
  const [cfg, setCfg] = useState(null);
  const [don, setDon] = useState(() => (opts.don || []).map((d, i) => ({ ...d, _i: i })));
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
  const [phanHoi, setPhanHoi] = useState(null);
  const [mo, setMo] = useState(() => new Set());

  useEffect(() => {
    layCfgOdoo(user.token).then((c) => {
      setCfg(c || {});
      const ds = c?.ly_do || [];
      const md = c?.ly_do_mac_dinh?.[opts.lyDo] || (ds.includes(opts.lyDo) ? opts.lyDo : '') || ds[0] || '';
      setLyDo((v) => v || md);
      setNguoiTao((v) => v || c?.nguoi_tao || '');
    });
  }, [user.token]);   // eslint-disable-line

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
      kqMoi[d._i] = x ? { trang_thai: x.trang_thai, loi: x.loi || '' } : { trang_thai: 'loi', loi: r.loi || 'Không thấy kết quả của đơn này' };
      if (x?.trang_thai === 'thanh_cong') okMoi.push(d);
    });
    setKq((m) => ({ ...m, ...kqMoi }));
    if (r.loi) setLoi(r.loi);
    const nLoi = ds.length - okMoi.length;
    baoToast(`Odoo: ${okMoi.length ? `✓ tạo ${okMoi.length} đơn` : ''}${okMoi.length && nLoi ? ' · ' : ''}${nLoi ? `${nLoi} đơn chưa tạo được — xem từng đơn` : ''}`);
    if (okMoi.length && opts.onThanhCong) {
      try { await opts.onThanhCong(okMoi); } catch (e) { baoToast('Đã tạo đơn Odoo nhưng bước lưu sau đó lỗi: ' + (e?.message || e)); }
    }
  };

  const xongHet = soOk > 0 && conGui.length === 0;   // không còn đơn nào đang chọn mà chưa tạo

  return (
    <div className="kt-modal gc-nen" onMouseDown={(e) => { if (e.target === e.currentTarget && !dangGui) onDong(); }}>
      <div className="od-hop" role="dialog" aria-label="Tạo đơn điều chuyển Odoo">
        <div className="od-dau">
          <div>
            <small>TẠO ĐƠN ĐIỀU CHUYỂN ODOO {cfg?.thu_nghiem && <em className="od-thu">THỬ NGHIỆM · {cfg.ma}</em>}</small>
            <b>{opts.tieuDe || 'Đơn điều chuyển'}</b>
            <span>{don.length} đơn · {fmt(don.reduce((s, d) => s + d.chi_tiet.length, 0))} dòng · {fmt(don.reduce((s, d) => s + tongDon(d), 0))} cái
              {soOk > 0 && <> · <i>đã tạo {soOk}</i></>}</span>
          </div>
          <button className="kt-dong" onClick={() => !dangGui && onDong()} aria-label="Đóng">×</button>
        </div>

        <div className="od-than">
          <div className="od-cai">
            <label><span>Lý do <b className="od-bb">*</b></span>
              <select value={lyDo} onChange={(e) => setLyDo(e.target.value)} disabled={dangGui}>
                {!lyDo && <option value="">— chọn lý do —</option>}
                {(cfg?.ly_do || []).map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>
            <label>Người tạo
              <input value={nguoiTao} maxLength={40} disabled={dangGui} placeholder="Để trống = user của kho yêu cầu"
                onChange={(e) => setNguoiTao(e.target.value)} />
            </label>
            <label className="rong">Ghi chú chung
              <input value={ghiChu} maxLength={300} disabled={dangGui} placeholder="Vd: Giao gấp trước 15h (có thể để trống)"
                onChange={(e) => setGhiChu(e.target.value)} />
            </label>
          </div>

          {loi && <div className="od-bao loi"><IcAlert /> {loi}</div>}
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
                    </div>
                    <div className="od-so"><b>{fmt(tongDon(d))}</b> cái<small>{d.chi_tiet.length} dòng</small></div>
                    <div className="od-kq">
                      {tt ? <span className={'od-chip ' + tt[1]}>{k.trang_thai === 'thanh_cong' ? <IcCheck /> : k.trang_thai === 'dang_gui' ? null : <IcAlert />} {tt[0]}</span>
                        : <span className="od-chip cho">Chờ gửi</span>}
                    </div>
                    <button className="od-mo" onClick={() => doiMo(d._i)}>{mo.has(d._i) ? 'Ẩn' : 'Chi tiết'}</button>
                  </div>
                  {k?.loi && k.trang_thai !== 'thanh_cong' && <div className="od-don-loi">{k.loi}</div>}
                  {mo.has(d._i) && (
                    <div className="od-ct-bao">
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

          {json && (
            <details className="od-raw" open>
              <summary>JSON sẽ gửi ({json.length} đơn) — đơn chưa có tên sẽ được cấp lại lúc gửi thật</summary>
              <pre>{JSON.stringify({ requests: json }, null, 2)}</pre>
            </details>
          )}
          {phanHoi && (
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
          {!xongHet && <button className="btn btn-ghost" disabled={dangGui || !conGui.length} onClick={xemJson}>Xem JSON</button>}
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
