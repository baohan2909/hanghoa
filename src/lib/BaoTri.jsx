// BẢO TRÌ HỆ THỐNG — KHOÁ APP (v3.119.0 — SQL 211)
//   Quản trị bật ở Tham số › Bảo trì hệ thống: tài khoản thuộc vai trò bị khoá thấy màn "Hệ thống đang nâng cấp"
//   thay cho toàn bộ app; máy chủ (fn_kiem) cũng từ chối mọi thao tác của các vai trò đó. Quản trị không bị khoá.
//   App tự hỏi lại mỗi phút + khi quay lại app -> mở khoá là cửa hàng dùng lại ngay, không cần tải lại.
import { useCallback, useEffect, useState } from 'react';
import { sb } from './supabase.js';
import { IcTool, IcRefresh, IcOut, IcAlert, IcCheck } from './icons.jsx';

const VAI_TRO = [['CH', 'Cửa hàng'], ['KHO', 'Kho tổng'], ['DIEU_PHOI', 'Điều phối']];
const gioNgay = (s) => { try { return s ? new Date(s).toLocaleString('vi', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : ''; } catch { return ''; } };

export function useBaoTri(user) {
  const [bt, setBt] = useState(null);
  const hoi = useCallback(async () => {
    if (!user?.token) { setBt(null); return; }
    const { data, error } = await sb.rpc('fn_bao_tri', { p_token: user.token });
    if (!error && data) setBt(data);
  }, [user?.token]);
  useEffect(() => {
    hoi();
    const t = setInterval(hoi, 60000);
    const v = () => { if (document.visibilityState === 'visible') hoi(); };
    document.addEventListener('visibilitychange', v);
    window.addEventListener('ns-bao-tri-hoi', hoi);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', v); window.removeEventListener('ns-bao-tri-hoi', hoi); };
  }, [hoi]);
  return { bt, hoi };
}

export function ManBaoTri({ bt, user, onKiem, dangXuat, onDong }) {
  const [dang, setDang] = useState(false);
  const kiem = async () => { if (!onKiem) return; setDang(true); await onKiem(); setTimeout(() => setDang(false), 600); };
  return (
    <div className={'btr' + (onDong ? ' xem' : '')} role="alertdialog" aria-label={bt?.tieu_de}>
      <div className="btr-the">
        <i className="btr-ic"><IcTool /></i>
        <small>Nón Sơn · Điều phối hàng hóa</small>
        <h1>{bt?.tieu_de || 'Hệ thống đang nâng cấp tính năng mới'}</h1>
        {bt?.noi_dung && <p>{bt.noi_dung}</p>}
        {bt?.du_kien && <span className="btr-du-kien">Dự kiến mở lại: <b>{bt.du_kien}</b></span>}
        <div className="btr-nut">
          {onDong ? <button className="btr-chinh" onClick={onDong}>Đóng xem trước</button> : <>
            <button className="btr-chinh" onClick={kiem} disabled={dang}><IcRefresh /> {dang ? 'Đang kiểm tra…' : 'Kiểm tra lại'}</button>
            {dangXuat && <button className="btr-phu" onClick={dangXuat}><IcOut /> Đăng xuất</button>}
          </>}
        </div>
        <em>{user?.ma_dang_nhap ? `Tài khoản ${user.ma_dang_nhap} · ` : ''}app tự kiểm tra lại mỗi phút — mở khoá là dùng được ngay</em>
      </div>
    </div>
  );
}

// Dải nhắc cho Quản trị / Điều phối khi đang khoá
export function DaiBaoTri({ bt, chonTab }) {
  if (!bt?.dang_bat || bt?.khoa) return null;
  const ten = (bt.vai_tro || []).map((v) => VAI_TRO.find((x) => x[0] === v)?.[1] || v).join(', ');
  return (
    <div className="btr-dai" role="status"><IcAlert />
      <span><b>Đang bảo trì</b> — {ten} đang bị khoá app{bt.bat_luc ? ` từ ${gioNgay(bt.bat_luc)}` : ''}.</span>
      {chonTab && <button onClick={() => chonTab('thamso')}>Mở Tham số</button>}
    </div>
  );
}

/* ============ Cài đặt (Tham số — Quản trị) ============ */
export function BaoTriCaiDat({ user, baoToast }) {
  const [cfg, setCfg] = useState(null);
  const [dang, setDang] = useState(false);
  const [xem, setXem] = useState(false);
  const tai = useCallback(async () => {
    const { data } = await sb.from('tham_so').select('gia_tri').eq('key', 'bao_tri').eq('pham_vi', 'GLOBAL');
    const g = (Array.isArray(data) ? data[0]?.gia_tri : null) || {};
    setCfg({ bat: !!g.bat, vai_tro: g.vai_tro || ['CH'], tieu_de: g.tieu_de || 'Hệ thống đang nâng cấp tính năng mới',
      noi_dung: g.noi_dung || '', du_kien: g.du_kien || '', bat_luc: g.bat_luc || null, nguoi: g.nguoi || '' });
  }, []);
  useEffect(() => { tai(); }, [tai]);
  const dat = (gia) => setCfg((c) => ({ ...c, ...gia }));
  const doiVt = (v) => dat({ vai_tro: cfg.vai_tro.includes(v) ? cfg.vai_tro.filter((x) => x !== v) : [...cfg.vai_tro, v] });

  const luu = async (bat, tb) => {
    setDang(true);
    const { data, error } = await sb.rpc('fn_bao_tri_luu', { p_token: user.token, p_cfg: { ...cfg, bat } });
    setDang(false);
    if (error || !data?.ok) { baoToast?.(error?.message || data?.loi || 'Không lưu được'); return; }
    baoToast?.(tb); tai(); window.dispatchEvent(new CustomEvent('ns-bao-tri-hoi'));
  };
  if (!cfg) return <div className="card btc"><p className="btc-trong">Đang tải bảo trì…</p></div>;
  return (
    <div className={'card btc btr-cd' + (cfg.bat ? ' khoa' : '')}>
      <div className="btc-dau">
        <div><h3><IcTool /> Bảo trì hệ thống (khoá app)</h3>
          <p>Bật khoá: tài khoản thuộc vai trò được chọn chỉ thấy màn thông báo bên dưới, máy chủ từ chối mọi thao tác của họ
            (kể cả máy đang mở bản app cũ). Quản trị không bao giờ bị khoá. Tắt khoá là dùng lại được ngay.</p></div>
        <span className={'btr-tt' + (cfg.bat ? ' on' : '')}>{cfg.bat ? `Đang khoá${cfg.bat_luc ? ' từ ' + gioNgay(cfg.bat_luc) : ''}` : 'Đang mở'}</span>
      </div>
      <div className="btc-than btr-o">
        <div className="btc-luoi">
          <div><span>Khoá vai trò</span>
            <div className="btc-chon">{VAI_TRO.map(([v, t]) => <button key={v} type="button" className={cfg.vai_tro.includes(v) ? 'on' : ''} onClick={() => doiVt(v)}>{t}</button>)}</div></div>
          <label className="btr-nhan"><span>Dự kiến mở lại (không bắt buộc)</span>
            <input value={cfg.du_kien} maxLength={80} onChange={(e) => dat({ du_kien: e.target.value })} placeholder="Vd: 14:00 hôm nay" /></label>
        </div>
        <label>Tiêu đề màn khoá<input value={cfg.tieu_de} maxLength={120} onChange={(e) => dat({ tieu_de: e.target.value })} /></label>
        <label>Nội dung<textarea rows={3} value={cfg.noi_dung} maxLength={500} onChange={(e) => dat({ noi_dung: e.target.value })}
          placeholder="Vd: App tạm khoá để nâng cấp. Sẽ có thông báo khi hoàn tất." /></label>
      </div>
      <div className="btr-chan">
        <button className="odn-nut-phu" onClick={() => setXem(true)}>Xem trước</button>
        {cfg.bat && <button className="odn-nut-phu" disabled={dang} onClick={() => luu(true, 'Đã cập nhật nội dung màn khoá')}>Lưu nội dung</button>}
        {cfg.bat
          ? <button className={'btn btn-ai odn-nut-chinh' + (dang ? ' dang-chay' : '')} disabled={dang} onClick={() => luu(false, 'Đã mở khoá — cửa hàng dùng lại được ngay')}><IcCheck /> Mở khoá app</button>
          : <button className={'btn btn-ai odn-nut-chinh' + (dang ? ' dang-chay' : '')} disabled={dang || !cfg.vai_tro.length} onClick={() => luu(true, 'Đã khoá app — tài khoản bị khoá thấy thông báo trong tối đa 1 phút')}><IcTool /> Khoá app ngay</button>}
      </div>
      {xem && <ManBaoTri bt={cfg} user={null} onDong={() => setXem(false)} />}
    </div>
  );
}
