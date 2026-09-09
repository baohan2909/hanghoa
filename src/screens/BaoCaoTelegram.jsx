import { useEffect, useState } from 'react';
import { sb, fmtDT } from '../lib/supabase.js';
import { useApp } from '../App.jsx';
import { IcChat2, IcRefresh, IcSearch } from '../lib/icons.jsx';

const LOAI = {
  TAT_CA:    { ten: 'Tất cả lượt bán',   mo: 'Mọi sản phẩm bán ra đều được báo về nhóm này.',                 cn: 'all' },
  DANH_SACH: { ten: 'Danh sách chọn',    mo: 'Chỉ báo các mã trong danh sách — chọn mã là tự lấy hết đuôi màu.', cn: 'list' },
  HET_HANG:  { ten: 'Bán xong hết hàng', mo: 'Chỉ báo khi mã vừa bán mà tồn tại cửa hàng về 0.',              cn: 'het' },
};

const MAU_TIN = `09/09/2026

1 - Mũ bảo hiểm
NS008BTG-XH542-L ● 1
Giờ bán:  13:38
Cửa hàng:  HCM Tỉnh Lộ 8-2 · Hồ Chí Minh
Giá:  750.000 đ
Bán/Tồn  1 / 2
Tháng  1
Lưu ý:  SẮP HẾT - còn 2`;

// ===== PHÂN HỆ BÁO CÁO TELEGRAM — quản lý 3 nhóm nhận báo bán hàng =====
export default function BaoCaoTelegram() {
  const { baoToast } = useApp();
  const [nhom, setNhom] = useState(null);
  const [mo, setMo] = useState(null);
  const [dsMa, setDsMa] = useState({});
  const [chatEdit, setChatEdit] = useState({});
  const [tim, setTim] = useState('');
  const [goiY, setGoiY] = useState([]);
  const [xemMau, setXemMau] = useState(false);

  const tai = async () => {
    const { data, error } = await sb.rpc('fn_tg_thong_ke');
    if (error) { baoToast('Lỗi: ' + error.message); setNhom([]); return; }
    setNhom(data || []);
    const ce = {}; (data || []).forEach((n) => (ce[n.id] = n.chat_id || ''));
    setChatEdit(ce);
  };
  useEffect(() => { tai(); }, []);   // eslint-disable-line

  useEffect(() => {
    if (mo == null || tim.trim().length < 2) { setGoiY([]); return; }
    const id = setTimeout(async () => {
      const { data } = await sb.rpc('fn_td_goi_y', { p_tu: tim, p_gioi_han: 8 });
      setGoiY(data || []);
    }, 250);
    return () => clearTimeout(id);
  }, [tim, mo]);

  const doiCo = async (n, field, val) => {
    const p = { p_nhom: n.id, p_chat: null, p_che_do: null, p_bat: null };
    if (field === 'bat') p.p_bat = val;
    if (field === 'che_do') p.p_che_do = val;
    if (field === 'chat') p.p_chat = val;
    const { error } = await sb.rpc('fn_tg_set_nhom', p);
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    baoToast('Đã lưu'); tai();
  };

  const napMa = async (id) => {
    const { data } = await sb.rpc('fn_tg_ds_ma', { p_nhom: id });
    setDsMa((m) => ({ ...m, [id]: data || [] }));
  };
  const moMa = async (id) => {
    if (mo === id) { setMo(null); setTim(''); setGoiY([]); return; }
    setMo(id); setTim(''); setGoiY([]);
    if (!dsMa[id]) napMa(id);
  };
  const chonMa = async (id, ma) => {
    const { error } = await sb.rpc('fn_tg_them_ma', { p_nhom: id, p_ma: ma });
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    baoToast('Đã thêm ' + ma);
    setTim(''); setGoiY([]); await napMa(id); tai();
  };
  const botMa = async (id, ma) => {
    await sb.rpc('fn_tg_bot_ma', { p_nhom: id, p_ma: ma });
    await napMa(id); tai();
  };
  const guiThu = async (id) => {
    const { data, error } = await sb.rpc('fn_tg_gui_thu', { p_nhom: id });
    baoToast(error ? 'Lỗi: ' + error.message
      : data ? 'Đã gửi tin thử về nhóm' : 'Chưa gửi được — kiểm ID nhóm / pg_net');
  };

  return (
    <>
      <div className="cmdbar">
        <div className="cmd-title">
          <h2>Báo cáo Telegram</h2>
          <p>Ba nhóm nhận báo bán hàng · bật/tắt, đổi ID nhóm, thêm/bớt mã sản phẩm</p>
        </div>
        <div className="cmd-row">
          <button className="btn-hd" onClick={() => setXemMau((v) => !v)}>{xemMau ? 'Ẩn mẫu tin' : 'Xem mẫu tin'}</button>
          <button className="btn-hd" onClick={tai}><IcRefresh /> Làm mới</button>
        </div>
      </div>

      {xemMau && (
        <div className="tg-mau">
          <b>Cấu trúc tin gửi về nhóm</b>
          <pre>{MAU_TIN}</pre>
          <span>Số thứ tự đếm <b>theo ngành hàng</b> và <b>reset mỗi ngày</b>. Nhóm "hết hàng" có thêm dòng
            {' '}🔴 <b>BÁN XONG — ĐÃ HẾT HÀNG</b> ở đầu tin.</span>
        </div>
      )}

      {nhom === null ? <div className="tg-load">Đang tải…</div> : (
        <div className="tg-grid">
          {nhom.map((n) => {
            const L = LOAI[n.loai] || {};
            const canList = n.loai === 'DANH_SACH' || (n.loai === 'HET_HANG' && n.che_do === 'LIST');
            const list = dsMa[n.id] || [];
            return (
              <div key={n.id} className={'tg-card ' + (n.bat ? 'on' : 'off')}>
                <div className="tg-head">
                  <span className={'tg-ic ' + (L.cn || '')}><IcChat2 /></span>
                  <div className="tg-ten">
                    <b>{n.ten}</b>
                    <span className={'tg-badge ' + (L.cn || '')}>{L.ten}</span>
                  </div>
                  <label className="tg-sw" title={n.bat ? 'Đang bật' : 'Đang tắt'}>
                    <input type="checkbox" checked={n.bat} onChange={(e) => doiCo(n, 'bat', e.target.checked)} />
                    <i />
                  </label>
                </div>
                <p className="tg-mo">{L.mo}</p>

                <div className="tg-chat">
                  <label>ID nhóm Telegram</label>
                  <div className="tg-chat-row">
                    <input value={chatEdit[n.id] ?? ''} placeholder="-100xxxxxxxxxx"
                      onChange={(e) => setChatEdit((c) => ({ ...c, [n.id]: e.target.value }))} />
                    <button className="btn btn-teal" onClick={() => doiCo(n, 'chat', chatEdit[n.id])}>Lưu</button>
                  </div>
                </div>

                {n.loai === 'HET_HANG' && (
                  <div className="tg-chedo">
                    <span>Phạm vi</span>
                    <button className={n.che_do === 'ALL' ? 'on' : ''} onClick={() => doiCo(n, 'che_do', 'ALL')}>Tất cả mã hết</button>
                    <button className={n.che_do === 'LIST' ? 'on' : ''} onClick={() => doiCo(n, 'che_do', 'LIST')}>Danh sách chọn</button>
                  </div>
                )}

                <div className="tg-stat">
                  <div><b>{canList ? n.so_ma : '∞'}</b><span>{canList ? 'mã theo dõi' : 'không giới hạn'}</span></div>
                  <div><b>{n.lan_gui_cuoi ? fmtDT(n.lan_gui_cuoi) : '—'}</b><span>lần gửi gần nhất</span></div>
                </div>

                <div className="tg-act">
                  <button className="btn btn-ghost" onClick={() => guiThu(n.id)}>Gửi thử</button>
                  {canList && (
                    <button className="btn btn-primary" onClick={() => moMa(n.id)}>
                      {mo === n.id ? 'Đóng danh sách' : 'Quản lý mã'}
                    </button>
                  )}
                </div>

                {canList && mo === n.id && (
                  <div className="tg-ma">
                    <div className="tg-tim">
                      <span className="tg-tim-ic"><IcSearch /></span>
                      <input value={tim} autoFocus
                        placeholder="Gõ mã để tìm (VD: MC037 hoặc MC037-ĐN1)…"
                        onChange={(e) => setTim(e.target.value)} />
                      {goiY.length > 0 && (
                        <div className="tg-goiy">
                          {goiY.map((g) => (
                            <button key={(g.la_dong ? 'd' : 'f') + g.ma} onClick={() => chonMa(n.id, g.ma)}>
                              <b>{g.ma}</b>
                              <span className={g.la_dong ? 'dong' : 'day'}>
                                {g.la_dong ? `dòng · ${g.so_bien_the} màu` : 'một màu'}
                              </span>
                              {g.ten_sp && <em>{g.ten_sp}</em>}
                            </button>
                          ))}
                        </div>
                      )}
                      {tim.trim().length >= 2 && goiY.length === 0 && (
                        <div className="tg-goiy"><span className="tg-goiy-trong">Không tìm thấy mã khớp</span></div>
                      )}
                    </div>

                    <div className="tg-ma-ds">
                      {list.length === 0 ? <span className="tg-ma-trong">Chưa có mã nào — gõ tìm ở ô trên rồi chọn</span> : (
                        list.map((m) => (
                          <span key={m.ma} className="tg-chip">
                            {m.ma} <em>{m.so_bien_the} màu</em>
                            <button title="Bỏ mã" onClick={() => botMa(n.id, m.ma)}>×</button>
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
