// BẢN TIN HƯỚNG DẪN CẬP NHẬT (v3.118.0 — SQL 209/210)
//   <BanTinHost>  : mở app -> có bản tin đang bật cho vai trò mình mà chưa xác nhận -> hiện bảng toàn màn hình, BẮT BUỘC đọc
//                   + xác nhận (tick + họ tên người đọc). "Nhắc lại sau 1 giờ" tối đa N lần (Quản trị đặt).
//   <BanTinHop>   : hộp đọc + xác nhận (dùng chung: popup bắt buộc, màn Hướng dẫn cập nhật, xem trước trong Tham số)
//   <BanTinTheoDoi>: theo dõi cửa hàng đã xác nhận chưa (Theo dõi online · Phòng điều hành) + xuất Excel
//   <BanTinCaiDat> : Quản trị tự soạn / bật / tắt / nhân bản / xoá bản tin (màn Tham số)
//   Nội dung: [{ tinh_nang, thao_tac: [..], luu_y }] — **chữ** = in đậm, *chữ* = nghiêng.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sb } from './supabase.js';
import { Sel } from './ui.jsx';
import { IcAlert, IcCheck, IcDown, IcGuiLen, IcRefresh, IcSearch, IcClock, IcTool, IcPulse } from './icons.jsx';

const fmt = (n) => Number(n || 0).toLocaleString('vi');
const gioNgay = (s) => (s ? new Date(s).toLocaleString('vi', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—');
const giayDoc = (g) => (g == null ? '—' : g < 60 ? `${g} giây` : `${Math.floor(g / 60)} phút ${g % 60 ? (g % 60) + ' giây' : ''}`.trim());
const VAI_TRO = [['CH', 'Cửa hàng'], ['KHO', 'Kho tổng'], ['DIEU_PHOI', 'Điều phối'], ['ADMIN', 'Quản trị']];
const ICON = [IcGuiLen, IcTool, IcSearch, IcPulse, IcClock, IcCheck];

function thietBi() {
  try {
    const ua = navigator.userAgent || '';
    const may = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
      : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Khác';
    const tr = /Zalo/i.test(ua) ? 'Zalo' : /CriOS|Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : /Firefox/.test(ua) ? 'Firefox' : '';
    return (may + (tr ? ' · ' + tr : '') + ' | ' + ua).slice(0, 200);
  } catch { return ''; }
}

// **đậm**, *nghiêng*
export function ChuDinhDang({ t }) {
  const phan = String(t || '').split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return <>{phan.map((p, i) => (p.startsWith('**') && p.endsWith('**') && p.length > 4 ? <b key={i}>{p.slice(2, -2)}</b>
    : p.startsWith('*') && p.endsWith('*') && p.length > 2 ? <em key={i}>{p.slice(1, -1)}</em> : <Fragment key={i}>{p}</Fragment>))}</>;
}

// Bảng 2 cột: Tính năng | Thao tác
export function BangBanTin({ noiDung }) {
  return (
    <div className="bt-bang" role="table" aria-label="Hướng dẫn">
      <div className="bt-hang bt-tieu" role="row"><span role="columnheader">Tính năng</span><span role="columnheader">Thao tác</span></div>
      {(noiDung || []).map((d, i) => {
        const Ic = ICON[i % ICON.length];
        return (
          <div key={i} className="bt-hang" role="row">
            <div className="bt-tn" role="cell"><i><Ic /></i><b>{d.tinh_nang}</b></div>
            <div className="bt-tt" role="cell">
              <ul>{(d.thao_tac || []).map((x, j) => <li key={j}><ChuDinhDang t={x} /></li>)}</ul>
              {d.luu_y && <p className="bt-luu-y"><ChuDinhDang t={d.luu_y} /></p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ============ Hộp đọc + xác nhận ============ */
//   batBuoc: không có nút đóng; xemTruoc: chỉ xem (Tham số), không ghi gì
export function BanTinHop({ bt, user, baoToast, onXong, onDong, batBuoc = false, xemTruoc = false }) {
  const [tick, setTick] = useState(false);
  const [ten, setTen] = useState('');
  const [daCuon, setDaCuon] = useState(false);
  const [dang, setDang] = useState(false);
  const [loi, setLoi] = useState('');
  const [conHoan, setConHoan] = useState(bt.con_hoan ?? 0);
  const batDau = useRef(Date.now());
  const than = useRef(null);
  const maCH = user?.ma_ch || bt.ma_ch;

  const kiemCuon = useCallback(() => {
    const el = than.current; if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 28) setDaCuon(true);
  }, []);
  useEffect(() => { const t = setTimeout(kiemCuon, 120); return () => clearTimeout(t); }, [kiemCuon]);
  useEffect(() => {
    if (batBuoc) { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }
    return undefined;
  }, [batBuoc]);

  const tenOk = ten.trim().split(/\s+/).filter(Boolean).length >= 2 && ten.trim().length >= 4;
  const duoc = !xemTruoc && daCuon && tick && tenOk && !dang;
  const thieu = !daCuon ? 'Cuộn xuống hết bảng để xác nhận' : !tick ? 'Tích ô "đã đọc và hiểu"' : !tenOk ? 'Nhập đủ họ và tên người đọc' : '';

  const xacNhan = async () => {
    if (!duoc) return;
    setDang(true); setLoi('');
    const { data, error } = await sb.rpc('fn_ban_tin_xac_nhan', {
      p_token: user.token, p_id: bt.id, p_ho_ten: ten.trim(), p_giay: Math.round((Date.now() - batDau.current) / 1000), p_thiet_bi: thietBi(),
    });
    setDang(false);
    if (error || !data?.ok) { setLoi(error?.message || data?.loi || 'Chưa ghi nhận được — thử lại'); return; }
    baoToast?.(`Đã ghi nhận — cảm ơn ${ten.trim()}`);
    onXong?.();
  };
  const hoan = async () => {
    setDang(true); setLoi('');
    const { data, error } = await sb.rpc('fn_ban_tin_hoan', { p_token: user.token, p_id: bt.id });
    setDang(false);
    if (error || !data?.ok) { setLoi(error?.message || data?.loi || 'Không hoãn được'); setConHoan(0); return; }
    baoToast?.('Sẽ nhắc lại sau 1 giờ');
    onXong?.();
  };

  return (
    <div className={'bt-nen' + (batBuoc ? ' bb' : '')} onMouseDown={(e) => { if (!batBuoc && e.target === e.currentTarget) onDong?.(); }}>
      <div className="bt-hop" role="dialog" aria-modal="true" aria-label={bt.tieu_de}>
        <header className="bt-dau">
          <div>
            <small>Hướng dẫn cập nhật{maCH ? ` · ${maCH}` : ''}{xemTruoc ? ' · xem trước' : ''}</small>
            <h2>{bt.tieu_de}</h2>
            {bt.mo_ta && <p>{bt.mo_ta}</p>}
          </div>
          {!batBuoc && <button className="bt-x" onClick={onDong} aria-label="Đóng">×</button>}
        </header>
        <div className="bt-than" ref={than} onScroll={kiemCuon}>
          <BangBanTin noiDung={bt.noi_dung} />
          <div className="bt-het" aria-hidden="true">Hết hướng dẫn</div>
        </div>
        {!xemTruoc && (
          <footer className="bt-chan">
            <label className={'bt-tick' + (tick ? ' on' : '') + (!daCuon ? ' khoa' : '')}>
              <input type="checkbox" checked={tick} disabled={!daCuon || dang} onChange={(e) => setTick(e.target.checked)} />
              <span className="bt-o" aria-hidden="true">{tick && <IcCheck />}</span>
              <span><b>{maCH ? `Cửa hàng ${maCH}` : 'Tôi'}</b> đã đọc và hiểu hướng dẫn trên</span>
            </label>
            <div className="bt-hang-nhap">
              <input className="bt-ten" value={ten} maxLength={60} disabled={dang} onChange={(e) => setTen(e.target.value)}
                placeholder="Họ và tên người đọc" autoComplete="name" aria-label="Họ và tên người đọc" />
              <button className={'btn btn-ai odn-nut-chinh bt-xn' + (dang ? ' dang-chay' : '')} disabled={!duoc} onClick={xacNhan}>
                <IcCheck /> Xác nhận đã đọc</button>
            </div>
            <div className="bt-ghi">
              {loi ? <span className="loi"><IcAlert /> {loi}</span> : thieu ? <span>{thieu}</span> : <span className="ok">Sẵn sàng xác nhận</span>}
              {batBuoc && conHoan > 0 && <button className="bt-hoan" disabled={dang} onClick={hoan}>Nhắc lại sau 1 giờ · còn {conHoan} lần</button>}
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}

/* ============ Tự hiện khi mở app ============ */
export function BanTinHost({ user, baoToast }) {
  const [bt, setBt] = useState(null);
  const dangMo = useRef(false);
  const hoi = useCallback(async () => {
    if (!user?.token || dangMo.current) return;
    const { data, error } = await sb.rpc('fn_ban_tin_cho', { p_token: user.token });
    if (error || !data?.id) return;
    dangMo.current = true; setBt(data);
  }, [user?.token]);
  useEffect(() => {
    hoi();
    const t = setInterval(hoi, 20 * 60000);
    const v = () => { if (document.visibilityState === 'visible') hoi(); };
    document.addEventListener('visibilitychange', v);
    window.addEventListener('ns-ban-tin-hoi', hoi);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', v); window.removeEventListener('ns-ban-tin-hoi', hoi); };
  }, [hoi]);
  if (!bt) return null;
  return <BanTinHop key={bt.id} bt={bt} user={user} baoToast={baoToast} batBuoc
    onXong={() => { dangMo.current = false; setBt(null); window.dispatchEvent(new CustomEvent('ns-ban-tin-xong')); setTimeout(hoi, 400); }} />;
}

/* ============ Theo dõi xác nhận ============ */
const LOC_TT = [['', 'Tất cả'], ['chua_xn', 'Chưa xác nhận'], ['da', 'Đã xác nhận'], ['nhanh', 'Đọc quá nhanh']];
const TT_TEN = { da: ['Đã xác nhận', 'ok'], da_xem: ['Đã mở, chưa xác nhận', 'vang'], chua: ['Chưa mở', 'do'] };

export function BanTinTheoDoi({ user, baoToast, nhung = false }) {
  const [id, setId] = useState(null);
  const [d, setD] = useState(null);
  const [loi, setLoi] = useState('');
  const [dang, setDang] = useState(false);
  const [loc, setLoc] = useState('');
  const [kv, setKv] = useState('');
  const [q, setQ] = useState('');
  const tai = useCallback(async () => {
    setDang(true);
    const { data, error } = await sb.rpc('fn_ban_tin_theo_doi', { p_token: user.token, p_id: id });
    setDang(false);
    if (error || !data?.ok) { setLoi(error?.message || data?.loi || 'Không tải được'); return; }
    setLoi(''); setD(data);
  }, [user.token, id]);
  useEffect(() => { tai(); }, [tai]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (d?.rows || []).filter((r) => (!loc || (loc === 'chua_xn' ? r.trang_thai !== 'da' : loc === 'nhanh' ? r.nhanh : r.trang_thai === loc))
      && (!kv || r.khu_vuc === kv)
      && (!s || [r.ma_ch, r.ten, r.khu_vuc, r.ho_ten, r.ma_tk].some((x) => String(x || '').toLowerCase().includes(s))));
  }, [d, loc, kv, q]);
  const dsKv = useMemo(() => [...new Set((d?.rows || []).map((r) => r.khu_vuc).filter(Boolean))].sort(), [d]);

  const xuat = async () => {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(rows.map((r) => ({
      'Mã CH': r.ma_ch, 'Cửa hàng': r.ten, 'Khu vực': r.khu_vuc, 'Tài khoản': r.ma_tk, 'Trạng thái': TT_TEN[r.trang_thai]?.[0] || r.trang_thai,
      'Người đọc': r.ho_ten || '', 'Xác nhận lúc': r.luc ? new Date(r.luc).toLocaleString('vi') : '', 'Thời gian đọc (giây)': r.giay_doc ?? '',
      'Đọc quá nhanh': r.nhanh ? 'Có' : '', 'Số lần nhắc lại': r.so_lan_hoan, 'Số lần mở': r.so_lan_xem, 'Thiết bị': (r.thiet_bi || '').split(' | ')[0],
    })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Xác nhận đọc');
    XLSX.writeFile(wb, `XAC_NHAN_DOC_${d?.ban_tin?.ma || 'ban_tin'}.xlsx`);
    baoToast?.(`Đã xuất ${rows.length} dòng`);
  };

  const bt = d?.ban_tin;
  const pt = d?.tong ? Math.round((d.da / d.tong) * 100) : 0;
  return (
    <section className={'btd' + (nhung ? ' nhung' : '')}>
      <div className="btd-dau">
        <div><b>Xác nhận đọc hướng dẫn</b>
          <span>{bt ? <>{bt.tieu_de} · {bt.bat ? `đang bật từ ${gioNgay(bt.bat_luc)}` : 'đang tắt'}</> : 'Chưa có bản tin nào'}</span></div>
        <div className="btd-nut">
          {(d?.ds || []).length > 1 && <Sel value={String(bt?.id || '')} onChange={(v) => setId(Number(v) || null)}
            options={(d?.ds || []).map((x) => ({ value: String(x.id), label: (x.bat ? '● ' : '') + x.tieu_de }))} />}
          <button className="odn-nut-phu" onClick={tai} disabled={dang}><IcRefresh /> Làm mới</button>
          <button className="odn-nut-phu" onClick={xuat} disabled={!rows.length}><IcDown /> Xuất Excel</button>
        </div>
      </div>
      {loi && <div className="odn-bao do"><IcAlert /><div>{loi}</div></div>}
      {d && bt && <>
        <div className="btd-kpi">
          <button className={'btd-k chinh' + (loc === 'da' ? ' on' : '')} onClick={() => setLoc(loc === 'da' ? '' : 'da')}>
            <span>Đã xác nhận</span><b>{fmt(d.da)}<small>/{fmt(d.tong)}</small></b>
            <i className="btd-thanh"><i style={{ width: pt + '%' }} /></i><em>{pt}% cửa hàng</em></button>
          <button className={'btd-k vang' + (loc === 'chua_xn' ? ' on' : '')} onClick={() => setLoc(loc === 'chua_xn' ? '' : 'chua_xn')}>
            <span>Chưa xác nhận</span><b>{fmt(d.tong - d.da)}</b><em>{fmt(d.da_xem)} đã mở · {fmt(d.chua)} chưa mở</em></button>
          <button className={'btd-k do' + (loc === 'nhanh' ? ' on' : '')} onClick={() => setLoc(loc === 'nhanh' ? '' : 'nhanh')}>
            <span>Đọc quá nhanh</span><b>{fmt(d.nhanh)}</b><em>dưới {bt.giay_toi_thieu} giây — nên nhắc đọc lại</em></button>
        </div>
        <div className="btd-loc">
          <div className="tk-seg">{LOC_TT.map(([k, t]) => <button key={k} className={loc === k ? 'on' : ''} onClick={() => setLoc(k)}>{t}</button>)}</div>
          {dsKv.length > 1 && <Sel value={kv} onChange={setKv} placeholder="Khu vực" options={[{ value: '', label: 'Mọi khu vực' }, ...dsKv.map((k) => ({ value: k, label: k }))]} />}
          <label className="odn-tim btd-tim"><IcSearch /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mã / tên cửa hàng, người đọc…" /></label>
        </div>
        <div className="btd-bang-khung">
          <table className="btd-bang">
            <thead><tr><th>Cửa hàng</th><th className="c-an">Khu vực</th><th>Trạng thái</th><th>Người đọc</th><th>Xác nhận lúc</th>
              <th className="so">Thời gian đọc</th><th className="so c-an">Nhắc lại</th><th className="c-an">Thiết bị</th></tr></thead>
            <tbody>
              {rows.length === 0 ? <tr><td colSpan={8} className="btd-trong">Không có cửa hàng khớp bộ lọc.</td></tr>
                : rows.map((r) => (
                  <tr key={r.ma_tk}>
                    <td><b>{r.ma_ch || r.ma_tk}</b><span>{r.ten}</span></td>
                    <td className="c-an">{r.khu_vuc || '—'}</td>
                    <td><span className={'odn-chip ' + (TT_TEN[r.trang_thai]?.[1] || '')}>{TT_TEN[r.trang_thai]?.[0] || r.trang_thai}</span></td>
                    <td>{r.ho_ten || <span className="btd-mo">—</span>}</td>
                    <td>{r.luc ? gioNgay(r.luc) : r.lan_dau_xem ? <span className="btd-mo">mở {gioNgay(r.lan_dau_xem)}</span> : '—'}</td>
                    <td className={'so' + (r.nhanh ? ' nhanh' : '')}>{giayDoc(r.giay_doc)}</td>
                    <td className="so c-an">{r.so_lan_hoan || '—'}</td>
                    <td className="c-an btd-tb">{(r.thiet_bi || '').split(' | ')[0] || '—'}</td>
                  </tr>))}
            </tbody>
          </table>
        </div>
      </>}
    </section>
  );
}

/* ============ Cài đặt bản tin (Tham số — Quản trị) ============ */
const BT_MOI = { id: null, tieu_de: '', mo_ta: 'Đọc khoảng 2 phút, xác nhận ở cuối trang', vai_tro: ['CH'], bat: false, so_lan_hoan: 2, giay_toi_thieu: 20,
  noi_dung: [{ tinh_nang: '', thao_tac: [''], luu_y: '' }] };

export function BanTinCaiDat({ user, baoToast }) {
  const [d, setD] = useState(null);
  const [sua, setSua] = useState(null);       // bản đang soạn
  const [xem, setXem] = useState(null);       // xem trước
  const [dang, setDang] = useState(false);
  const tai = useCallback(async () => {
    const { data, error } = await sb.rpc('fn_ban_tin_quan_ly', { p_token: user.token });
    if (error || !data?.ok) { baoToast?.(error?.message || data?.loi || 'Không tải được bản tin'); return; }
    setD(data);
  }, [user.token, baoToast]);
  useEffect(() => { tai(); }, [tai]);

  const luu = async (b, tb) => {
    setDang(true);
    const { data, error } = await sb.rpc('fn_ban_tin_luu', { p_token: user.token, p_bt: b });
    setDang(false);
    if (error || !data?.ok) { baoToast?.(error?.message || data?.loi || 'Không lưu được'); return false; }
    baoToast?.(tb || 'Đã lưu bản tin'); tai(); window.dispatchEvent(new CustomEvent('ns-ban-tin-hoi')); return true;
  };
  const xoa = async (b) => {
    if (!window.confirm(`Xoá bản tin "${b.tieu_de}"?`)) return;   // xác nhận trước khi xoá hẳn
    const { data, error } = await sb.rpc('fn_ban_tin_xoa', { p_token: user.token, p_id: b.id });
    if (error || !data?.ok) { baoToast?.(error?.message || data?.loi || 'Không xoá được'); return; }
    baoToast?.('Đã xoá bản tin'); tai();
  };
  const goi = (b) => ({ id: b.id, tieu_de: b.tieu_de, mo_ta: b.mo_ta || '', vai_tro: b.vai_tro || ['CH'], bat: b.bat,
    so_lan_hoan: b.so_lan_hoan, giay_toi_thieu: b.giay_toi_thieu, noi_dung: b.noi_dung || [] });

  return (
    <div className="card btc">
      <div className="btc-dau">
        <div><h3><IcCheck /> Bản tin hướng dẫn cập nhật</h3>
          <p>Bản tin đang bật sẽ hiện toàn màn hình khi tài khoản đúng vai trò mở app — phải đọc hết, tích và ghi họ tên mới dùng tiếp.
            Theo dõi ai đã xác nhận ở <b>Theo dõi online</b> hoặc <b>Phòng điều hành › Xác nhận đọc</b>.</p></div>
        {d?.admin && <button className="btn btn-ai odn-nut-chinh" onClick={() => setSua({ ...BT_MOI, noi_dung: BT_MOI.noi_dung.map((x) => ({ ...x })) })}>+ Bản tin mới</button>}
      </div>
      {!d ? <p className="btc-trong">Đang tải…</p> : d.ds.length === 0 ? <p className="btc-trong">Chưa có bản tin nào.</p> : (
        <div className="btc-ds">
          {d.ds.map((b) => (
            <div key={b.id} className={'btc-the' + (b.bat ? ' bat' : '')}>
              <div className="btc-the-dau">
                <span className={'btc-tt' + (b.bat ? ' on' : '')}>{b.bat ? 'Đang bật' : 'Tắt'}</span>
                <b>{b.tieu_de}</b>
                <small>{b.ma} · {b.noi_dung?.length || 0} tính năng · phải đọc: {(b.vai_tro || []).map((v) => VAI_TRO.find((x) => x[0] === v)?.[1] || v).join(', ')}</small>
                <small>{fmt(b.da_xac_nhan)} đã xác nhận · {fmt(b.da_xem)} đã mở · nhắc lại tối đa {b.so_lan_hoan} lần · cờ đọc nhanh dưới {b.giay_toi_thieu} giây{b.bat_luc ? ` · bật ${gioNgay(b.bat_luc)}` : ''}</small>
              </div>
              <div className="btc-nut">
                <button className="odn-nut-phu" onClick={() => setXem(b)}>Xem trước</button>
                {d.admin && <>
                  <button className="odn-nut-phu" onClick={() => setSua(goi(b))}>Sửa</button>
                  <button className={'odn-nut-phu' + (b.bat ? ' do' : ' xanh')} disabled={dang}
                    onClick={() => luu({ ...goi(b), bat: !b.bat }, b.bat ? 'Đã tắt bản tin' : 'Đã bật — tài khoản đúng vai trò sẽ thấy khi mở app')}>{b.bat ? 'Tắt' : 'Bật'}</button>
                  <button className="odn-nut-phu" onClick={() => setSua({ ...goi(b), id: null, bat: false, tieu_de: b.tieu_de + ' (bản mới)' })} title="Tạo bản tin mới từ bản này — mọi tài khoản phải xác nhận lại">Nhân bản</button>
                  {!b.da_xac_nhan && <button className="odn-nut-phu do" onClick={() => xoa(b)}>Xoá</button>}
                </>}
              </div>
            </div>))}
        </div>)}
      {sua && <SoanBanTin b={sua} dang={dang} onDong={() => setSua(null)} onLuu={async (b) => { if (await luu(b)) setSua(null); }} onXem={(b) => setXem(b)} />}
      {xem && <BanTinHop bt={{ ...xem, con_hoan: 0 }} user={user} xemTruoc onDong={() => setXem(null)} />}
    </div>
  );
}

function SoanBanTin({ b: b0, dang, onDong, onLuu, onXem }) {
  const [b, setB] = useState(() => ({ ...b0, noi_dung: (b0.noi_dung || []).map((x) => ({ tinh_nang: x.tinh_nang || '', thao_tac_txt: (x.thao_tac || []).join('\n'), luu_y: x.luu_y || '' })) }));
  const dat = (gia) => setB((v) => ({ ...v, ...gia }));
  const datDong = (i, gia) => setB((v) => ({ ...v, noi_dung: v.noi_dung.map((x, j) => (j === i ? { ...x, ...gia } : x)) }));
  const doiCho = (i, k) => setB((v) => { const a = [...v.noi_dung]; const j = i + k; if (j < 0 || j >= a.length) return v; [a[i], a[j]] = [a[j], a[i]]; return { ...v, noi_dung: a }; });
  const raGui = () => ({ id: b.id, tieu_de: b.tieu_de, mo_ta: b.mo_ta, vai_tro: b.vai_tro, bat: b.bat, so_lan_hoan: Number(b.so_lan_hoan) || 0,
    giay_toi_thieu: Number(b.giay_toi_thieu) || 0,
    noi_dung: b.noi_dung.map((x) => ({ tinh_nang: x.tinh_nang.trim(), thao_tac: x.thao_tac_txt.split('\n').map((s) => s.trim()).filter(Boolean), luu_y: x.luu_y.trim() }))
      .filter((x) => x.tinh_nang || x.thao_tac.length || x.luu_y) });   // bỏ dòng trống hoàn toàn
  const doiVt = (v) => dat({ vai_tro: b.vai_tro.includes(v) ? b.vai_tro.filter((x) => x !== v) : [...b.vai_tro, v] });

  return (
    <div className="kt-modal btc-nen" onMouseDown={(e) => { if (e.target === e.currentTarget && !dang) onDong(); }}>
      <div className="btc-soan" role="dialog" aria-label="Soạn bản tin">
        <header><b>{b.id ? 'Sửa bản tin' : 'Bản tin mới'}</b><button className="bt-x toi" onClick={onDong} aria-label="Đóng">×</button></header>
        <div className="btc-than">
          <label>Tiêu đề<input value={b.tieu_de} maxLength={120} onChange={(e) => dat({ tieu_de: e.target.value })} placeholder="Vd: Cập nhật mới: Tạo đơn Odoo ngay trong app" /></label>
          <label>Mô tả ngắn<input value={b.mo_ta || ''} maxLength={200} onChange={(e) => dat({ mo_ta: e.target.value })} placeholder="Vd: Đọc khoảng 2 phút, xác nhận ở cuối trang" /></label>
          <div className="btc-luoi">
            <div><span>Ai phải đọc</span>
              <div className="btc-chon">{VAI_TRO.map(([v, t]) => <button key={v} type="button" className={b.vai_tro.includes(v) ? 'on' : ''} onClick={() => doiVt(v)}>{t}</button>)}</div></div>
            <div><span>Được bấm "Nhắc lại sau 1 giờ"</span>
              <Sel value={String(b.so_lan_hoan)} onChange={(v) => dat({ so_lan_hoan: Number(v) })}
                options={[0, 1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: n === 0 ? 'Không cho hoãn' : `Tối đa ${n} lần` }))} /></div>
            <div><span>Gắn cờ "đọc quá nhanh" nếu dưới</span>
              <label className="btc-so"><input type="number" min="0" max="600" value={b.giay_toi_thieu} onChange={(e) => dat({ giay_toi_thieu: e.target.value })} /> giây</label></div>
            <div><span>Trạng thái</span>
              <div className="btc-chon">
                <button type="button" className={b.bat ? 'on' : ''} onClick={() => dat({ bat: true })}>Bật ngay</button>
                <button type="button" className={!b.bat ? 'on' : ''} onClick={() => dat({ bat: false })}>Để tắt</button></div></div>
          </div>
          <div className="btc-dong-dau"><b>Nội dung bảng</b><small>Mỗi dòng thao tác = 1 gạch đầu dòng · <code>**chữ**</code> = in đậm · <code>*chữ*</code> = nghiêng</small></div>
          {b.noi_dung.map((x, i) => (
            <div key={i} className="btc-dong">
              <div className="btc-dong-tren">
                <input value={x.tinh_nang} maxLength={80} onChange={(e) => datDong(i, { tinh_nang: e.target.value })} placeholder={`Tính năng ${i + 1} — vd: Tạo đơn mới`} />
                <button type="button" className="odn-nut-phu" disabled={i === 0} onClick={() => doiCho(i, -1)} aria-label="Lên">↑</button>
                <button type="button" className="odn-nut-phu" disabled={i === b.noi_dung.length - 1} onClick={() => doiCho(i, 1)} aria-label="Xuống">↓</button>
                <button type="button" className="odn-nut-phu do" disabled={b.noi_dung.length <= 1} onClick={() => setB((v) => ({ ...v, noi_dung: v.noi_dung.filter((_, j) => j !== i) }))}>Xoá dòng</button>
              </div>
              <textarea rows={4} value={x.thao_tac_txt} onChange={(e) => datDong(i, { thao_tac_txt: e.target.value })}
                placeholder={'Thao tác — mỗi dòng 1 bước\nVd: Vào **Đề nghị hàng hóa**, lập phiếu như bình thường'} />
              <input value={x.luu_y} maxLength={300} onChange={(e) => datDong(i, { luu_y: e.target.value })} placeholder="Lưu ý (không bắt buộc) — hiện nền vàng dưới dòng" />
            </div>))}
          <button type="button" className="odn-nut-phu xanh btc-them" onClick={() => setB((v) => ({ ...v, noi_dung: [...v.noi_dung, { tinh_nang: '', thao_tac_txt: '', luu_y: '' }] }))}>+ Thêm dòng</button>
          {b.id && <p className="btc-ghi">Sửa nội dung KHÔNG bắt cửa hàng đã xác nhận phải đọc lại. Muốn mọi tài khoản đọc lại: dùng <b>Nhân bản</b> thành bản tin mới rồi bật.</p>}
        </div>
        <footer>
          <button className="odn-nut-phu" onClick={() => onXem({ ...raGui(), id: b.id || 0 })}>Xem trước</button>
          <button className="odn-nut-phu" onClick={onDong} disabled={dang}>Đóng</button>
          <button className={'btn btn-ai odn-nut-chinh' + (dang ? ' dang-chay' : '')} disabled={dang} onClick={() => onLuu(raGui())}><IcCheck /> Lưu bản tin</button>
        </footer>
      </div>
    </div>
  );
}
