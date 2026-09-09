import { useEffect, useState } from 'react';
import { sb, fmtDT } from '../lib/supabase.js';
import { useApp } from '../App.jsx';
import { IcChat2, IcRefresh } from '../lib/icons.jsx';

// Mô tả từng loại nhóm
const LOAI = {
  TAT_CA:    { ten: 'Tất cả lượt bán',   mo: 'Mọi sản phẩm bán ra đều được báo về nhóm này.',                 cn: 'all' },
  DANH_SACH: { ten: 'Danh sách chọn',    mo: 'Chỉ báo các mã trong danh sách — chọn mã là tự lấy hết đuôi màu.', cn: 'list' },
  HET_HANG:  { ten: 'Bán xong hết hàng', mo: 'Chỉ báo khi mã vừa bán mà tồn tại cửa hàng về 0.',              cn: 'het' },
};

// ===== PHÂN HỆ BÁO CÁO TELEGRAM — quản lý 3 nhóm nhận báo bán hàng =====
export default function BaoCaoTelegram() {
  const { baoToast } = useApp();
  const [nhom, setNhom] = useState(null);
  const [mo, setMo] = useState(null);          // nhom_id đang mở quản lý mã
  const [dsMa, setDsMa] = useState({});        // nhom_id -> [{ma, so_bien_the}]
  const [them, setThem] = useState('');        // ô textarea thêm mã
  const [chatEdit, setChatEdit] = useState({});// nhom_id -> chat_id đang gõ

  const tai = async () => {
    const { data, error } = await sb.rpc('fn_tg_thong_ke');
    if (error) { baoToast('Lỗi: ' + error.message); setNhom([]); return; }
    setNhom(data || []);
    const ce = {}; (data || []).forEach((n) => (ce[n.id] = n.chat_id || ''));
    setChatEdit(ce);
  };
  useEffect(() => { tai(); }, []);   // eslint-disable-line

  const doiCo = async (n, field, val) => {
    const p = { p_nhom: n.id, p_chat: null, p_che_do: null, p_bat: null };
    if (field === 'bat') p.p_bat = val;
    if (field === 'che_do') p.p_che_do = val;
    if (field === 'chat') p.p_chat = val;
    const { error } = await sb.rpc('fn_tg_set_nhom', p);
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    baoToast('Đã lưu');
    tai();
  };

  const napMa = async (id) => {
    const { data } = await sb.rpc('fn_tg_ds_ma', { p_nhom: id });
    setDsMa((m) => ({ ...m, [id]: data || [] }));
  };
  const moMa = async (id) => {
    if (mo === id) { setMo(null); return; }
    setMo(id); setThem('');
    if (!dsMa[id]) napMa(id);
  };
  const themMa = async (id) => {
    if (!them.trim()) return;
    const { data, error } = await sb.rpc('fn_tg_them_ma_loat', { p_nhom: id, p_ds: them });
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    baoToast(`Đã thêm ${data} mã`);
    setThem(''); await napMa(id); tai();
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
          <button className="btn-hd" onClick={tai}><IcRefresh /> Làm mới</button>
        </div>
      </div>

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
                    <div className="tg-ma-them">
                      <textarea value={them} rows={2}
                        placeholder="Dán mã — mỗi mã 1 dòng hoặc cách nhau dấu phẩy (VD: MC037, XH009)…"
                        onChange={(e) => setThem(e.target.value)} />
                      <button className="btn btn-teal" onClick={() => themMa(n.id)}>Thêm</button>
                    </div>
                    <div className="tg-ma-ds">
                      {list.length === 0 ? <span className="tg-ma-trong">Chưa có mã nào — thêm ở ô trên</span> : (
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
