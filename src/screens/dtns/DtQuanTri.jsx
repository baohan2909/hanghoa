import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sb } from '../../lib/supabase.js';
import { IcTrophy, IcClock, IcRefresh, IcCheck, IcAlert, IcFlash, IcGear, IcPulse, IcSearch, IcBox } from '../../lib/icons.jsx';
import { Sel, DateBox, isoVN } from '../../lib/ui.jsx';
import { useApp } from '../../App.jsx';
import { goi, BangXH, so, gioPhut, ngayThang, LOAI_PHIEN, demNguoc } from './DtNS.jsx';
import { VONG, sinhDe, doiCau, thoiLuongMs } from './dtSinhDe.js';
import { IcMat, IcNguoi, IcDung, IcChay, IcVe, IcXoa, IcSua, IcCong, IcTaiLen, IcTaiVe, IcXao, IcKhoa, IcLich } from './dtIcons.jsx';
import './dtns.css';

// QUẢN TRỊ ĐẤU TRƯỜNG NÓN SƠN (chỉ ADMIN): bật/tắt trò chơi · phiên & giải · soạn đề · điều khiển trực tiếp · ngân hàng câu · lịch sử

const TT = { NHAP: 'Nháp — chưa có đề', SAN_SANG: 'Đã khoá đề', DANG: 'Đang thi', XONG: 'Đã kết thúc', HUY: 'Đã huỷ' };
const PHA = { CHO: 'Phòng chờ', NGHI: 'Giới thiệu vòng', TRUOC: 'Xem kệ / đặt cược', TRA_LOI: 'Đang trả lời', CONG_BO: 'Công bố đáp án', KET_THUC: 'Kết thúc' };
const gioVN = (ts) => { const d = new Date(ts); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const thanhIso = (ngay, gio) => `${ngay}T${gio}:00+07:00`;

// baoToast của App đổi danh tính mỗi lần App vẽ lại -> bọc lại cho ổn định, tránh effect chạy lại (xoá đề đang soạn)
function useBao() {
  const { baoToast } = useApp();
  const r = useRef(baoToast); r.current = baoToast;
  return useCallback((m) => r.current(m), []);
}

function XacNhan({ chu, onCo, onThoi, nutCo = 'Đồng ý' }) {
  return (
    <div className="ns-xn"><IcAlert width={15} /> <span style={{ flex: 1 }}>{chu}</span>
      <button className="btn btn-primary" onClick={onCo}>{nutCo}</button>
      <button className="btn btn-ghost" onClick={onThoi}>Thôi</button>
    </div>
  );
}
function Gat({ on, onChange, chu }) {
  return <button type="button" className={'ns-gat' + (on ? ' on' : '')} onClick={() => onChange(!on)}><i />{chu}</button>;
}

export default function DtQuanTri({ sinh, games }) {
  const [tab, setTab] = useState('PHIEN');
  const [liveId, setLiveId] = useState(null);
  return (
    <div className="ns-qt">
      <div className="nhom-tabs" style={{ marginTop: 12 }}>
        <button className={'nhom-tab' + (tab === 'PHIEN' ? ' on' : '')} onClick={() => setTab('PHIEN')}><IcLich width={15} /> Phiên &amp; giải</button>
        <button className={'nhom-tab' + (tab === 'LIVE' ? ' on' : '')} onClick={() => setTab('LIVE')}><IcPulse width={15} /> Điều khiển trực tiếp</button>
        <button className={'nhom-tab' + (tab === 'CAU' ? ' on' : '')} onClick={() => setTab('CAU')}><IcBox width={15} /> Ngân hàng câu</button>
        <button className={'nhom-tab' + (tab === 'LS' ? ' on' : '')} onClick={() => setTab('LS')}><IcTrophy width={15} /> Lịch sử &amp; xuất file</button>
        <button className={'nhom-tab' + (tab === 'GAME' ? ' on' : '')} onClick={() => setTab('GAME')}><IcGear width={15} /> Bật / tắt trò chơi</button>
      </div>
      {tab === 'PHIEN' && <TabPhien sinh={sinh} onDieuKhien={(id) => { setLiveId(id); setTab('LIVE'); }} />}
      {tab === 'LIVE' && <TabLive phienId={liveId} setPhienId={setLiveId} />}
      {tab === 'CAU' && <TabCau />}
      {tab === 'LS' && <TabLichSu />}
      {tab === 'GAME' && <TabGame games={games} />}
    </div>
  );
}

// ============================================================ BẬT / TẮT TRÒ CHƠI
function TabGame({ games }) {
  const { user } = useApp(); const baoToast = useBao();
  const macDinh = useMemo(() => games.filter((g) => g.thuNghiem).map((g) => g.id), [games]);
  const [an, setAn] = useState(null);
  const [goc, setGoc] = useState(null);
  const [luu, setLuu] = useState(false);
  useEffect(() => {
    goi('fn_dt_game_an', {}).then((d) => { const v = Array.isArray(d) ? d : macDinh; setAn(v); setGoc(v); })
      .catch((e) => { baoToast('Chưa đọc được cấu hình: ' + e.message); setAn(macDinh); setGoc(null); });
  }, [macDinh, baoToast]);
  if (!an) return <div className="ns-trong">Đang tải…</div>;
  const doi = JSON.stringify([...an].sort()) !== JSON.stringify([...(goc || [])].sort());
  const ghi = async () => {
    setLuu(true);
    try { await goi('fn_dt_ad_game_an', { p_token: user.token, p_ds: an }); setGoc(an); baoToast('Đã lưu — cửa hàng thấy thay đổi ở lần mở Đấu trường kế tiếp'); }
    catch (e) { baoToast(e.message); }
    setLuu(false);
  };
  return (
    <div className="card">
      <div className="ns-qt-tit"><IcGear width={17} /> Trò chơi hiển thị cho cửa hàng
        <div className="ns-qt-phai">
          {doi && <span className="chip warn">Chưa lưu</span>}
          <button className="btn btn-ai" disabled={!doi || luu} onClick={ghi}><IcCheck width={15} /> Lưu thay đổi</button>
        </div>
      </div>
      <div className="ns-mo" style={{ marginBottom: 12 }}>Tắt = ẩn khỏi sảnh của cửa hàng, KHÔNG xoá dữ liệu, bảng vàng hay lịch sử. Admin luôn thấy đủ để thử trước khi bật.</div>
      <div className="ns-game-ds">
        {games.map((g) => {
          const dangAn = an.includes(g.id);
          return (
            <div key={g.id} className={'ns-game' + (dangAn ? ' an' : '')}>
              <div className="ns-game-ic"><g.Ic width={20} /></div>
              <div className="ns-game-noi">
                <div className="ns-game-ten">{g.ten}{g.id === 'DTNS' && <span className="chip gold">Phòng thi trực tiếp</span>}</div>
                <div className="ns-game-mo">{g.mota}</div>
                <Gat on={!dangAn} chu={dangAn ? 'Đang ẩn' : 'Đang hiện'}
                  onChange={(v) => setAn((a) => (v ? a.filter((x) => x !== g.id) : [...a, g.id]))} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================ PHIÊN & GIẢI
function TabPhien({ sinh, onDieuKhien }) {
  const { user } = useApp(); const baoToast = useBao();
  const [d, setD] = useState(null);
  const [form, setForm] = useState(null);       // phiên đang tạo/sửa
  const [gform, setGform] = useState(null);     // giải đang tạo/sửa
  const [soanDe, setSoanDe] = useState(null);   // phiên đang soạn đề
  const [hoi, setHoi] = useState(null);         // {chu, lam}
  const [ck, setCk] = useState(null);           // xem trước vé chung kết {giai, ds}
  const [loc, setLoc] = useState('');
  const tai = useCallback(async () => {
    try { setD(await goi('fn_dt_ad_ds', { p_token: user.token })); } catch (e) { baoToast(e.message); setD({ giai: [], phien: [] }); }
  }, [user.token, baoToast]);
  useEffect(() => { tai(); }, [tai]);

  const host = async (id, lenh, tham = {}) => {
    try { await goi('fn_dt_ad_host', { p_token: user.token, p_phien: id, p_lenh: lenh, p_tham: tham }); baoToast('Đã thực hiện'); tai(); }
    catch (e) { baoToast(e.message); }
  };
  const moForm = (p) => {
    const bd = p ? new Date(p.bat_dau) : new Date(Date.now() + 86400000);
    const mo = p ? Math.round((new Date(p.bat_dau) - new Date(p.mo_cua)) / 60000) : 15;
    setForm({ id: p?.id || null, ten: p?.ten || '', loai: p?.loai || 'LE', giai_id: p?.giai_id || null,
      ngay: isoVN(bd), gio: p ? gioVN(p.bat_dau) : '20:00', mo_truoc: [5, 10, 15, 30, 60].includes(mo) ? mo : 15,
      so_ghe: p?.so_ghe || 20, tran_kg: p?.tran_kg ?? 200, cho_ql_choi: !!p?.cho_ql_choi });
  };
  const luuPhien = async () => {
    const f = form;
    if (!f.ten.trim()) { baoToast('Đặt tên phiên'); return; }
    const bd = thanhIso(f.ngay, f.gio);
    const mo = new Date(new Date(bd).getTime() - f.mo_truoc * 60000).toISOString();
    try {
      const id = await goi('fn_dt_ad_phien_luu', { p_token: user.token, p_phien: {
        id: f.id, ten: f.ten.trim(), loai: f.loai, giai_id: f.loai === 'LE' ? null : f.giai_id, bat_dau: bd, mo_cua: mo,
        so_ghe: Number(f.so_ghe) || 20, tran_kg: Number(f.tran_kg) || 0, cho_ql_choi: f.cho_ql_choi } });
      baoToast(f.id ? 'Đã lưu phiên' : 'Đã tạo phiên — bước tiếp: Soạn đề');
      setForm(null); await tai();
      if (!f.id) { const p = { id, ten: f.ten.trim(), loai: f.loai }; setSoanDe(p); }
    } catch (e) { baoToast(e.message); }
  };
  const luuGiai = async () => {
    const g = gform;
    if (!g.ten.trim()) { baoToast('Đặt tên giải'); return; }
    try {
      await goi('fn_dt_ad_giai_luu', { p_token: user.token, p_giai: { ...g, ten: g.ten.trim() } });
      baoToast('Đã lưu giải'); setGform(null); tai();
    } catch (e) { baoToast(e.message); }
  };
  const xemCk = async (g) => {
    try { setCk({ giai: g, ds: await goi('fn_dt_ad_chot_ck', { p_token: user.token, p_giai: g.id, p_luu: false }) }); }
    catch (e) { baoToast(e.message); }
  };
  const chotCk = async () => {
    try { await goi('fn_dt_ad_chot_ck', { p_token: user.token, p_giai: ck.giai.id, p_luu: true }); baoToast(`Đã cấp ${ck.ds.length} vé chung kết`); setCk(null); tai(); }
    catch (e) { baoToast(e.message); }
  };

  if (soanDe) return <SoanDe phien={soanDe} sinh={sinh} onXong={() => { setSoanDe(null); tai(); }} />;
  if (!d) return <div className="ns-trong">Đang tải…</div>;
  const giaiOpt = d.giai.filter((g) => g.trang_thai !== 'XONG').map((g) => ({ value: g.id, label: g.ten }));
  const ds = d.phien.filter((p) => !loc || p.trang_thai === loc);

  return (
    <div className="ns-qt-luoi">
      <div>
        {hoi && <XacNhan chu={hoi.chu} onCo={() => { hoi.lam(); setHoi(null); }} onThoi={() => setHoi(null)} />}
        <div className="card ns-qt-the">
          <div className="ns-qt-tit"><IcLich width={17} /> Phiên thi
            <div className="ns-qt-phai">
              <Sel value={loc} onChange={setLoc} style={{ minWidth: 170 }} options={[{ value: '', label: 'Mọi trạng thái' },
                ...Object.entries(TT).map(([k, v]) => ({ value: k, label: v }))]} />
              <button className="btn btn-ghost" onClick={tai}><IcRefresh width={15} /></button>
              <button className="btn btn-ai" onClick={() => moForm(null)}><IcCong width={15} /> Tạo phiên</button>
            </div>
          </div>
          <BangXH khoa="id" dong={ds} rong="Chưa có phiên nào — bấm Tạo phiên"
            cot={[
              { k: 'ten', ten: 'Phiên', ve: (p) => <div><b>{p.ten}</b><div className="ns-mo">{LOAI_PHIEN[p.loai]}{p.ten_giai ? ' · ' + p.ten_giai : ''}</div></div> },
              { k: 'bat_dau', ten: 'Bắt đầu', gt: (p) => new Date(p.bat_dau).getTime(), ve: (p) => <span>{gioPhut(p.bat_dau)} · {ngayThang(p.bat_dau)}</span> },
              { k: 'trang_thai', ten: 'Trạng thái', ve: (p) => <span className={'ns-tt ' + p.trang_thai.toLowerCase()}>{TT[p.trang_thai]}</span> },
              { k: 'so_cau', ten: 'Câu', so: true },
              { k: 'so_choi', ten: 'Thi', so: true },
              { k: 'nhat', ten: 'Vô địch', ve: (p) => p.nhat || '' },
              { k: 'thao_tac', ten: '', ve: (p) => (
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {['NHAP', 'SAN_SANG'].includes(p.trang_thai) && <>
                    <button className="btn-mini" onClick={() => setSoanDe(p)}>{p.so_cau ? 'Xem / đổi đề' : 'Soạn đề'}</button>
                    <button className="btn-mini" onClick={() => moForm(p)}>Sửa</button>
                  </>}
                  {p.trang_thai === 'SAN_SANG' && <>
                    <button className="btn-mini" onClick={() => setHoi({ chu: `Mở cửa phòng "${p.ten}" ngay cho mọi người vào giữ ghế?`, lam: () => host(p.id, 'MO_CUA_NGAY') })}>Mở cửa ngay</button>
                    <button className="btn-mini" onClick={() => setHoi({ chu: `Bắt đầu "${p.ten}" NGAY? Danh sách ghế sẽ khoá.`, lam: () => host(p.id, 'BAT_DAU_NGAY') })}>Bắt đầu ngay</button>
                  </>}
                  {['NHAP', 'SAN_SANG'].includes(p.trang_thai) && <button className="btn-mini" onClick={() => setHoi({ chu: `Huỷ phiên "${p.ten}"?`, lam: () => host(p.id, 'HUY') })}>Huỷ</button>}
                  {['SAN_SANG', 'DANG'].includes(p.trang_thai) && <button className="btn-mini" onClick={() => onDieuKhien(p.id)}>Điều khiển</button>}
                </div>) },
            ]} />
        </div>
      </div>

      <div>
        {form && (
          <div className="card ns-qt-the">
            <div className="ns-qt-tit"><IcSua width={16} /> {form.id ? 'Sửa phiên' : 'Tạo phiên mới'}</div>
            <div className="ns-form">
              <div className="ca"><div className="lbl">Tên phiên</div><input className="inp" value={form.ten} placeholder="VD: Vòng loại 1 — tối thứ Sáu" onChange={(e) => setForm({ ...form, ten: e.target.value })} /></div>
              <div><div className="lbl">Loại</div><Sel value={form.loai} onChange={(v) => setForm({ ...form, loai: v })}
                options={Object.entries(LOAI_PHIEN).map(([k, v]) => ({ value: k, label: v }))} /></div>
              <div><div className="lbl">Thuộc giải</div><Sel value={form.giai_id} onChange={(v) => setForm({ ...form, giai_id: v })} placeholder={form.loai === 'LE' ? 'Không cần' : 'Chọn giải…'}
                options={giaiOpt} /></div>
              <div><div className="lbl">Ngày thi</div><DateBox value={form.ngay} onChange={(v) => setForm({ ...form, ngay: v })} /></div>
              <div><div className="lbl">Giờ bắt đầu</div><input className="inp" type="time" value={form.gio} onChange={(e) => setForm({ ...form, gio: e.target.value })} /></div>
              <div><div className="lbl">Mở cửa phòng chờ</div><Sel value={form.mo_truoc} onChange={(v) => setForm({ ...form, mo_truoc: v })}
                options={[5, 10, 15, 30, 60].map((m) => ({ value: m, label: `${m} phút trước giờ thi` }))} /></div>
              <div><div className="lbl">Số ghế thi</div><input className="inp" type="number" min={2} max={40} value={form.so_ghe} onChange={(e) => setForm({ ...form, so_ghe: e.target.value })} /></div>
              <div><div className="lbl">Trần khán giả</div><input className="inp" type="number" min={0} value={form.tran_kg} onChange={(e) => setForm({ ...form, tran_kg: e.target.value })} /></div>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 9 }}><Gat on={form.cho_ql_choi} onChange={(v) => setForm({ ...form, cho_ql_choi: v })} chu="Cho Admin / Điều phối giữ ghế" /></div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button className="btn btn-ai" onClick={luuPhien}><IcCheck width={15} /> {form.id ? 'Lưu' : 'Tạo phiên'}</button>
              <button className="btn btn-ghost" onClick={() => setForm(null)}>Đóng</button>
            </div>
          </div>
        )}

        <div className="card ns-qt-the">
          <div className="ns-qt-tit"><IcVe width={17} /> Giải đấu
            <div className="ns-qt-phai"><button className="btn-mini" onClick={() => setGform({ id: null, ten: '', mo_ta: '', tu_ngay: isoVN(), den_ngay: '', top_moi_phien: 3, so_ck: 20, toi_da_phien: 2 })}>+ Giải mới</button></div>
          </div>
          {gform && (
            <div style={{ marginBottom: 14 }}>
              <div className="ns-form">
                <div className="ca"><div className="lbl">Tên giải</div><input className="inp" value={gform.ten} onChange={(e) => setGform({ ...gform, ten: e.target.value })} placeholder="VD: Đấu Trường Nón Sơn tháng 11" /></div>
                <div className="ca"><div className="lbl">Mô tả / giải thưởng</div><input className="inp" value={gform.mo_ta || ''} onChange={(e) => setGform({ ...gform, mo_ta: e.target.value })} /></div>
                <div><div className="lbl">Từ ngày</div><DateBox value={gform.tu_ngay || ''} onChange={(v) => setGform({ ...gform, tu_ngay: v })} /></div>
                <div><div className="lbl">Đến ngày</div><DateBox value={gform.den_ngay || ''} onChange={(v) => setGform({ ...gform, den_ngay: v })} /></div>
                <div><div className="lbl">Top mỗi phiên loại vào CK</div><input className="inp" type="number" min={1} value={gform.top_moi_phien} onChange={(e) => setGform({ ...gform, top_moi_phien: e.target.value })} /></div>
                <div><div className="lbl">Tổng vé chung kết</div><input className="inp" type="number" min={2} value={gform.so_ck} onChange={(e) => setGform({ ...gform, so_ck: e.target.value })} /></div>
                <div><div className="lbl">Mỗi người thi tối đa (phiên loại)</div><input className="inp" type="number" min={1} value={gform.toi_da_phien} onChange={(e) => setGform({ ...gform, toi_da_phien: e.target.value })} /></div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn btn-ai" onClick={luuGiai}><IcCheck width={15} /> Lưu giải</button>
                <button className="btn btn-ghost" onClick={() => setGform(null)}>Đóng</button>
              </div>
            </div>
          )}
          {!d.giai.length && !gform && <div className="ns-mo">Chưa có giải. Phiên giao hữu không cần giải; vòng loại và chung kết phải thuộc một giải.</div>}
          {d.giai.map((g) => (
            <div key={g.id} className="ns-de-cau" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
              <div>
                <b>{g.ten}</b>
                <div className="ns-mo">{g.so_phien} phiên · top {g.top_moi_phien}/phiên · {g.so_ck} vé CK · {g.so_ve ? `đã cấp ${g.so_ve} vé` : 'chưa chốt vé'}</div>
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button className="btn-mini" onClick={() => setGform({ ...g })}>Sửa</button>
                <button className="btn-mini" onClick={() => xemCk(g)}>Chốt vé CK</button>
              </div>
            </div>
          ))}
          {ck && (
            <div style={{ marginTop: 10 }}>
              <div className="ns-qt-tit" style={{ marginBottom: 4 }}><IcVe width={15} /> Xem trước vé — {ck.giai.ten}</div>
              <div className="ns-mo">{ck.ds.filter((x) => x.nguon === 'TOP').length} người top phiên + {ck.ds.filter((x) => x.nguon === 'VOT').length} vé vớt theo điểm cao nhất.</div>
              <div className="ns-ds-ve">
                {ck.ds.map((v) => (
                  <div key={v.ma}><b>{v.thu_tu}</b><span>{v.ten}<span className="ns-mo"> · {v.ten_phien}</span></span>
                    <span className={'chip ' + (v.nguon === 'TOP' ? 'gold' : 'teal')}>{v.nguon === 'TOP' ? 'Top ' + v.hang_phien : 'Vé vớt'}</span><b>{so(v.diem)}</b></div>
                ))}
              </div>
              {!ck.ds.length ? <div className="ns-mo">Chưa có phiên vòng loại nào kết thúc.</div> : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ai" onClick={chotCk}><IcVe width={15} /> Cấp {ck.ds.length} vé</button>
                  <button className="btn btn-ghost" onClick={() => setCk(null)}>Đóng</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- SOẠN ĐỀ ----------
function tuDongDe(r) {
  return { vong: r.vong, giay: r.giay, diem: r.diem, sai: r.sai, toc_do: r.toc_do, chuoi: r.chuoi, cuoc: r.cuoc,
    cuoc_muc: r.cuoc_muc, vang: r.vang, truoc_ms: r.truoc_ms, cau: r.cau, nguon: r.nh_id ? 'Ngân hàng' : 'Đã khoá', ...(r.nh_id ? { nh_id: r.nh_id } : {}) };
}
function SoanDe({ phien, sinh, onXong }) {
  const { user } = useApp(); const baoToast = useBao();
  const [de, setDe] = useState(null);
  const [daKhoa, setDaKhoa] = useState(false);
  const [dang, setDang] = useState('');
  const pools = useRef(null);
  const ck = phien.loai === 'CK';
  useEffect(() => {
    goi('fn_dt_ad_de_xem', { p_token: user.token, p_phien: phien.id })
      .then((r) => { setDe((cu) => cu ?? (r?.length ? r.map(tuDongDe) : [])); if (r?.length) setDaKhoa(true); })
      .catch((e) => { baoToast(e.message); setDe((cu) => cu ?? []); });
  }, [phien.id, user.token, baoToast]);
  const napPool = async () => {
    if (pools.current) return pools.current;
    setDang('Đang nạp kho sản phẩm & kiến thức…');
    const [sp, kt, nh] = await Promise.all([
      sb.rpc('fn_thi_pool', { p_so: 160 }),
      sb.schema('kienthuc').rpc('fn_kt_pool', { p_loai: null, p_so: 500 }),
      goi('fn_dt_ad_cau_ds', { p_token: user.token }).catch(() => []),
    ]);
    if (sp.error || !sp.data?.length) throw new Error('Chưa tải được kho sản phẩm: ' + (sp.error?.message || 'trống'));
    pools.current = { sp: sp.data, kt: Array.isArray(kt.data) ? kt.data.filter((x) => x && x.du_lieu) : [], nganHang: nh || [] };
    pools.current.sp.filter((s) => s.hinh_url).slice(0, 40).forEach((s) => { const im = new Image(); im.src = sinh.nenHinh(s.hinh_url); });
    return pools.current;
  };
  const sinhMoi = async () => {
    try {
      const p = await napPool(); setDang('Đang sinh đề…');
      setDe(sinhDe(sinh, p, ck)); setDaKhoa(false);
    } catch (e) { baoToast(e.message); }
    setDang('');
  };
  const doi = async (i) => {
    try { const p = await napPool(); setDe(doiCau(sinh, p, de, i)); setDaKhoa(false); } catch (e) { baoToast(e.message); }
    setDang('');
  };
  const khoa = async () => {
    setDang('Đang khoá đề…');
    try {
      const r = await goi('fn_dt_ad_de_luu', { p_token: user.token, p_phien: phien.id,
        p_de: de.map(({ nguon, ky, bc, ...x }) => x) });   // eslint-disable-line no-unused-vars
      baoToast(`Đã khoá ${r.so_cau} câu · phiên dài ${Math.round(r.tong_ms / 60000)} phút. Phiên sẵn sàng.`);
      onXong();
    } catch (e) { baoToast(e.message); }
    setDang('');
  };
  if (!de) return <div className="ns-trong">Đang tải đề…</div>;
  const theoVong = VONG.map((v) => ({ v, ds: de.map((q, i) => ({ q, i })).filter((x) => x.q.vong === v.so) }));
  return (
    <div className="card">
      <div className="ns-qt-tit"><IcXao width={17} /> Đề thi · {phien.ten}
        <div className="ns-qt-phai">
          {de.length > 0 && <span className="chip dim"><IcClock width={12} /> {de.length} câu · ~{Math.round(thoiLuongMs(de) / 60000)} phút</span>}
          {daKhoa && <span className="chip teal"><IcKhoa width={12} /> Đã khoá</span>}
          <button className="btn btn-ghost" onClick={sinhMoi} disabled={!!dang}><IcRefresh width={15} /> {de.length ? 'Sinh lại toàn bộ' : 'Sinh đề tự động'}</button>
          {de.length > 0 && !daKhoa && <button className="btn btn-ai" onClick={khoa} disabled={!!dang}><IcKhoa width={15} /> Khoá đề &amp; mở phiên</button>}
          <button className="btn btn-ghost" onClick={onXong}>Đóng</button>
        </div>
      </div>
      {dang && <div className="ns-mo" style={{ marginBottom: 8 }}><span className="ns-tai-vong" style={{ width: 14, height: 14, borderWidth: 2, display: 'inline-block', verticalAlign: -2, marginRight: 6 }} />{dang}</div>}
      {!de.length && <div className="ns-trong-lon"><IcXao width={30} height={30} /><b>Chưa có đề</b><span>Bấm “Sinh đề tự động”: 34 câu chia 5 vòng, lấy từ kho sản phẩm (giá, mã, hình), kho kiến thức và ngân hàng câu tình huống. Xem trước, đổi từng câu, rồi khoá.{ck ? ' Chung kết khó hơn một bậc, cược 0/100/200.' : ''}</span></div>}
      {theoVong.map(({ v, ds }) => ds.length > 0 && (
        <div key={v.so} className="ns-de-vong">
          <div className="ns-de-vong-tit"><span className="ns-luat-so">{v.so}</span> {v.ten} <span className="ns-mo">· {v.luat.join(' · ')}</span></div>
          {ds.map(({ q, i }) => (
            <div key={i} className="ns-de-cau">
              <div className="ns-de-stt">{i + 1}</div>
              <div style={{ minWidth: 0 }}>
                <div className="ns-de-hoi">{q.cau.hoi}{q.vang && <span className="chip gold" style={{ marginLeft: 6 }}>Câu vàng</span>}</div>
                <div className="ns-de-nguon">{q.nguon} · {q.giay}s · +{q.diem}{q.truoc_ms ? ` · chuẩn bị ${q.truoc_ms / 1000}s` : ''}</div>
                {q.cau.the && <div className="ns-de-nguon"><b>{q.cau.the.ten}</b> — {q.cau.the.dong}</div>}
                {q.cau.hinh && <img className="ns-de-thehinh" src={q.cau.hinh} alt="" />}
                {q.cau.ke && <div className="ns-de-ke">{q.cau.ke.map((k, j) => <img key={j} src={k.hinh} alt="" title={`${k.ten} · ${k.gia}`} />)}</div>}
                <div className="ns-de-da">
                  {q.cau.dapAn.map((a, j) => (
                    <span key={j} className={j === q.cau.dung ? 'dung' : ''}>{'ABCDEF'[j]}. {a.hinh && <img src={a.hinh} alt="" />}{a.nhan}</span>
                  ))}
                </div>
                {q.cau.giai && <div className="ns-de-nguon" style={{ marginTop: 5 }}>Giải thích: {q.cau.giai}</div>}
              </div>
              <div><button className="btn-mini" onClick={() => doi(i)} disabled={!!dang}>{q.vong === 2 ? 'Đổi kệ' : 'Đổi câu'}</button></div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ============================================================ ĐIỀU KHIỂN TRỰC TIẾP
function TabLive({ phienId, setPhienId }) {
  const { user } = useApp(); const baoToast = useBao();
  const [ds, setDs] = useState(null);
  const [td, setTd] = useState(null);
  const [hoi, setHoi] = useState(null);
  const [tim, setTim] = useState('');
  const timer = useRef(null);
  useEffect(() => {
    goi('fn_dt_ad_ds', { p_token: user.token }).then((d) => {
      const live = d.phien.filter((p) => ['SAN_SANG', 'DANG'].includes(p.trang_thai));
      setDs(live);
      if (!phienId && live.length) setPhienId((live.find((p) => p.trang_thai === 'DANG') || live[0]).id);
    }).catch((e) => { baoToast(e.message); setDs([]); });
  }, [user.token]);   // eslint-disable-line react-hooks/exhaustive-deps
  const tai = useCallback(async () => {
    clearTimeout(timer.current);
    if (!phienId) return;
    try { setTd(await goi('fn_dt_ad_theo_doi', { p_token: user.token, p_phien: phienId })); } catch (e) { setTd((x) => x && { ...x, loi: e.message }); }
    timer.current = setTimeout(tai, 2000);
  }, [phienId, user.token]);
  useEffect(() => { setTd(null); tai(); return () => clearTimeout(timer.current); }, [tai]);
  const host = async (lenh, tham = {}) => {
    try { await goi('fn_dt_ad_host', { p_token: user.token, p_phien: phienId, p_lenh: lenh, p_tham: tham }); baoToast('Đã thực hiện'); tai(); }
    catch (e) { baoToast(e.message); }
  };
  if (!ds) return <div className="ns-trong">Đang tải…</div>;
  if (!ds.length && !phienId) return <div className="card ns-trong-lon"><IcPulse width={30} height={30} /><b>Không có phiên nào đang mở</b><span>Phiên đã khoá đề sẽ hiện ở đây để theo dõi phòng chờ và điều khiển khi thi.</span></div>;
  const ghe = td?.ghe || [];
  const diem = Object.fromEntries(ghe.map((g) => [g.ma, g]));
  const nguoi = (td?.ds || []).filter((n) => !tim || (n.ten + n.ma).toLowerCase().includes(tim.toLowerCase()));
  const c = td?.cau_hien;
  const tongTl = Object.values(td?.dem_hien || {}).reduce((a, b) => a + b, 0);
  return (
    <div>
      <div className="toolbar">
        <Sel value={phienId} onChange={setPhienId} style={{ minWidth: 300 }} placeholder="Chọn phiên…"
          options={ds.map((p) => ({ value: p.id, label: `${p.ten} · ${gioPhut(p.bat_dau)} ${ngayThang(p.bat_dau)}`, sub: TT[p.trang_thai] }))} />
        {td && <span className={'ns-tt ' + td.phien.trang_thai.toLowerCase()}>{TT[td.phien.trang_thai]}</span>}
        {td?.loi && <span className="chip warn">{td.loi}</span>}
      </div>
      {hoi && <XacNhan chu={hoi.chu} onCo={() => { hoi.lam(); setHoi(null); }} onThoi={() => setHoi(null)} />}
      {!td ? <div className="ns-trong">Đang kết nối…</div> : (
        <div className="ns-live">
          <div>
            <div className="ns-live-so">
              <div><span>Pha</span><b style={{ fontSize: 16 }}>{td.phien.dung ? 'TẠM DỪNG' : PHA[td.pha] || td.pha}</b></div>
              <div><span>Câu</span><b>{td.stt || 0}<span style={{ display: 'inline', fontSize: 13 }}>/{td.phien.tong_cau}</span></b></div>
              <div><span>Còn lại</span><b>{td.con_ms != null ? demNguoc(td.con_ms) : '—'}</b></div>
              <div><span>Thi · chờ · xem</span><b style={{ fontSize: 17 }}>{ghe.length} · {td.so_cho} · {td.so_xem}</b></div>
            </div>
            <div className="ns-live-nut">
              {td.phien.trang_thai === 'SAN_SANG' && <>
                <button className="btn btn-ghost" onClick={() => host('MO_CUA_NGAY')}><IcMat width={15} /> Mở cửa ngay</button>
                <button className="btn btn-ai" onClick={() => setHoi({ chu: 'Bắt đầu ngay? Danh sách ghế khoá lại, người chờ chuyển sang xem.', lam: () => host('BAT_DAU_NGAY') })}><IcChay width={15} /> Bắt đầu ngay</button>
              </>}
              {td.phien.trang_thai === 'DANG' && <>
                {td.phien.dung
                  ? <button className="btn btn-ai" onClick={() => host('TIEP')}><IcChay width={15} /> Tiếp tục</button>
                  : <button className="btn btn-gold" onClick={() => host('DUNG')}><IcDung width={15} /> Tạm dừng</button>}
                {td.stt && <button className="btn btn-ghost" onClick={() => setHoi({ chu: `Huỷ câu ${td.stt}? Câu này không tính điểm cho bất kỳ ai.`, lam: () => host('BO_CAU', { stt: td.stt }) })}><IcXoa width={15} /> Huỷ câu {td.stt}</button>}
                <button className="btn btn-ghost" onClick={() => setHoi({ chu: 'Kết thúc phiên ngay và chốt kết quả theo điểm hiện tại?', lam: () => host('KET_THUC') })}><IcTrophy width={15} /> Kết thúc sớm</button>
              </>}
            </div>
            {c && (
              <div className="card ns-qt-the">
                <div className="ns-qt-tit"><IcFlash width={16} /> Câu {c.stt} · vòng {c.vong}{c.bo && <span className="chip warn">Đã huỷ</span>}
                  <div className="ns-qt-phai"><span className="chip dim">{tongTl}/{ghe.length} đã trả lời</span></div></div>
                <div className="ns-de-hoi">{c.cau.hoi}</div>
                {c.cau.the && <div className="ns-de-nguon"><b>{c.cau.the.ten}</b> — {c.cau.the.dong}</div>}
                <div className="ns-de-da">
                  {c.cau.dapAn.map((a, j) => (
                    <span key={j} className={j === c.cau.dung ? 'dung' : ''}>{'ABCDEF'[j]}. {a.hinh && <img src={a.hinh} alt="" />}{a.nhan} · <b>{td.dem_hien?.[j] || 0}</b></span>
                  ))}
                </div>
              </div>
            )}
            <div className="card">
              <div className="ns-qt-tit"><IcNguoi width={16} /> Người trong phòng ({(td.ds || []).length})
                <div className="ns-qt-phai"><input className="inp" style={{ height: 34 }} placeholder="Tìm tên…" value={tim} onChange={(e) => setTim(e.target.value)} /></div></div>
              <BangXH dong={nguoi} rong="Chưa có ai"
                cot={[
                  { k: 'ghe', ten: 'Ghế', so: true, ve: (n) => n.ghe || '' },
                  { k: 'ten', ten: 'Tên', ve: (n) => <span>{n.ten}<span className="ns-mo"> · {n.ma}</span></span> },
                  { k: 'vai', ten: 'Vai', ve: (n) => n.moi_ra ? <span className="chip warn">Đã mời ra</span> : n.vai === 'CHOI' ? <span className="chip teal">Thi</span> : n.vai === 'CHO' ? <span className="chip gold">Chờ #{n.thu_tu_cho}</span> : <span className="chip dim">Xem</span> },
                  { k: 'giay_nhip', ten: 'Tín hiệu', so: true, ve: (n) => <span style={{ color: n.giay_nhip > 25 ? 'var(--magenta)' : 'var(--teal-deep)', fontWeight: 700 }}>{n.giay_nhip > 25 ? `mất ${n.giay_nhip}s` : 'trực tuyến'}</span> },
                  { k: 'diem', ten: 'Điểm', so: true, gt: (n) => diem[n.ma]?.diem ?? -1, ve: (n) => diem[n.ma] ? <b>{so(diem[n.ma].diem)}</b> : '' },
                  { k: 'x', ten: '', ve: (n) => (n.vai === 'CHOI' || n.vai === 'CHO') && !n.moi_ra && td.phien.trang_thai !== 'XONG'
                    ? <button className="btn-mini" onClick={() => setHoi({ chu: `Mời "${n.ten}" ra khỏi phiên? Người này không được thi tiếp và không tính điểm.`, lam: () => host('MOI_RA', { ma: n.ma }) })}>Mời ra</button> : null },
                ]} />
            </div>
          </div>
          <div className="card">
            <div className="ns-qt-tit"><IcSearch width={16} /> Nhật ký phiên</div>
            <div className="ns-nk">
              {(td.nhat_ky || []).map((k, i) => (
                <div key={i}><b>{new Date(k.luc).toLocaleTimeString('vi')}</b> · {k.hanh_dong.replace('HOST_', '')}{k.ma ? ' · ' + k.ma : ''}{k.chi_tiet && Object.keys(k.chi_tiet).length ? ' · ' + JSON.stringify(k.chi_tiet).slice(0, 80) : ''}</div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================ NGÂN HÀNG CÂU
const CAU_TRONG = { id: null, chu_de: '', vong: 4, do_kho: 2, hoi: '', da: ['', '', '', ''], dung: 0, giai: '', trang_thai: 'DUNG' };
function TabCau() {
  const { user } = useApp(); const baoToast = useBao();
  const [ds, setDs] = useState(null);
  const [f, setF] = useState(null);
  const [hoi, setHoi] = useState(null);
  const [tim, setTim] = useState('');
  const file = useRef(null);
  const tai = useCallback(async () => { try { setDs(await goi('fn_dt_ad_cau_ds', { p_token: user.token })); } catch (e) { baoToast(e.message); setDs([]); } }, [user.token, baoToast]);
  useEffect(() => { tai(); }, [tai]);
  const luu = async () => {
    const da = f.da.map((x) => x.trim()).filter(Boolean);
    if (!f.hoi.trim()) { baoToast('Nhập câu hỏi'); return; }
    if (da.length < 2) { baoToast('Cần ít nhất 2 đáp án'); return; }
    if (!f.da[f.dung]?.trim()) { baoToast('Đáp án đúng đang để trống'); return; }
    const dungMoi = da.indexOf(f.da[f.dung].trim());
    try {
      await goi('fn_dt_ad_cau_luu', { p_token: user.token, p_cau: { id: f.id, chu_de: f.chu_de, vong: f.vong || null, do_kho: f.do_kho, trang_thai: f.trang_thai,
        cau: { loai: 'NH', hoi: f.hoi.trim(), dapAn: da.map((n) => ({ nhan: n })), dung: dungMoi, ...(f.giai.trim() ? { giai: f.giai.trim() } : {}) } } });
      baoToast('Đã lưu câu'); setF(null); tai();
    } catch (e) { baoToast(e.message); }
  };
  const xoa = async (id) => { try { await goi('fn_dt_ad_cau_xoa', { p_token: user.token, p_id: id }); tai(); } catch (e) { baoToast(e.message); } };
  const mauExcel = async () => {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([
      ['Chủ đề', 'Vòng (1-5, để trống = vòng 4)', 'Độ khó (1-3)', 'Câu hỏi', 'A', 'B', 'C', 'D', 'Đáp án đúng (A-D)', 'Giải thích'],
      ['Tình huống bán hàng', 4, 2, 'Khách mua nón bảo hiểm cho bé 6 tuổi, nên tư vấn gì đầu tiên?', 'Mẫu đang khuyến mãi', 'Đo vòng đầu, chọn đúng size trẻ em', 'Mẫu màu bé thích', 'Mẫu đắt nhất', 'B', 'An toàn phụ thuộc vừa vặn — luôn đo vòng đầu trước.'],
    ]);
    ws['!cols'] = [18, 14, 10, 50, 22, 22, 22, 22, 14, 40].map((w) => ({ wch: w }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Cau hoi');
    XLSX.writeFile(wb, 'mau_cau_hoi_dau_truong_non_son.xlsx');
  };
  const nhapExcel = async (e) => {
    const tep = e.target.files?.[0]; e.target.value = '';
    if (!tep) return;
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await tep.arrayBuffer());
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
      const out = [];
      rows.slice(1).forEach((r, i) => {
        if (!String(r[3] || '').trim()) return;
        const goc = [r[4], r[5], r[6], r[7]].map((x) => String(x ?? '').trim());
        const ky = String(r[8] || '').trim().toUpperCase();
        const iDung = 'ABCD'.indexOf(ky);
        const da = goc.filter(Boolean);
        out.push({ dong: i + 2, chu_de: String(r[0] || '').trim(), vong: r[1] === '' ? 4 : Number(r[1]) || null, do_kho: Number(r[2]) || 2,
          cau: { loai: 'NH', hoi: String(r[3]).trim(), dapAn: da.map((n) => ({ nhan: n })), dung: iDung >= 0 && goc[iDung] ? da.indexOf(goc[iDung]) : -1,
            ...(String(r[9] || '').trim() ? { giai: String(r[9]).trim() } : {}) } });
      });
      if (!out.length) { baoToast('File không có dòng câu hỏi nào'); return; }
      const kq = await goi('fn_dt_ad_cau_nhap', { p_token: user.token, p_ds: out });
      baoToast(`Đã thêm ${kq.them} câu` + (kq.loi?.length ? ` · ${kq.loi.length} dòng lỗi: ` + kq.loi.slice(0, 4).map((l) => `dòng ${l.dong} (${l.ly_do})`).join(', ') : ''));
      tai();
    } catch (err) { baoToast('Không đọc được file: ' + err.message); }
  };
  if (!ds) return <div className="ns-trong">Đang tải…</div>;
  const loc = ds.filter((q) => !tim || (q.cau?.hoi + ' ' + q.chu_de).toLowerCase().includes(tim.toLowerCase()));
  return (
    <div className="ns-qt-luoi">
      <div className="card">
        <div className="ns-qt-tit"><IcBox width={17} /> Ngân hàng câu tình huống ({ds.length})
          <div className="ns-qt-phai">
            <input className="inp" style={{ height: 36 }} placeholder="Tìm câu…" value={tim} onChange={(e) => setTim(e.target.value)} />
            <button className="btn btn-ghost" onClick={mauExcel}><IcTaiVe width={15} /> File mẫu</button>
            <button className="btn btn-ghost" onClick={() => file.current?.click()}><IcTaiLen width={15} /> Nhập Excel</button>
            <input ref={file} type="file" accept=".xlsx,.xls" hidden onChange={nhapExcel} />
            <button className="btn btn-ai" onClick={() => setF({ ...CAU_TRONG, da: ['', '', '', ''] })}><IcCong width={15} /> Thêm câu</button>
          </div>
        </div>
        <div className="ns-mo" style={{ marginBottom: 10 }}>Câu ở đây được ưu tiên đưa vào VÒNG 4 — Tình huống (tối đa 2 câu/phiên, câu ít ra nhất được chọn trước). Phần còn lại của đề tự sinh từ kho sản phẩm và kiến thức.</div>
        {hoi && <XacNhan chu={hoi.chu} onCo={() => { hoi.lam(); setHoi(null); }} onThoi={() => setHoi(null)} nutCo="Xoá" />}
        <BangXH dong={loc} khoa="id" rong="Chưa có câu nào — thêm tay hoặc nhập Excel"
          cot={[
            { k: 'chu_de', ten: 'Chủ đề', w: 130 },
            { k: 'hoi', ten: 'Câu hỏi', gt: (q) => q.cau?.hoi, ve: (q) => <div><div style={{ fontWeight: 600 }}>{q.cau?.hoi}</div><div className="ns-mo">Đúng: {q.cau?.dapAn?.[q.cau?.dung]?.nhan}</div></div> },
            { k: 'vong', ten: 'Vòng', so: true, ve: (q) => q.vong || 'Tự do' },
            { k: 'do_kho', ten: 'Độ khó', so: true },
            { k: 'so_lan_ra', ten: 'Đã ra', so: true },
            { k: 'trang_thai', ten: 'Dùng', ve: (q) => q.trang_thai === 'DUNG' ? <span className="chip teal">Dùng</span> : <span className="chip dim">Nghỉ</span> },
            { k: 'x', ten: '', ve: (q) => (
              <div style={{ display: 'flex', gap: 5 }}>
                <button className="btn-mini" onClick={() => setF({ id: q.id, chu_de: q.chu_de || '', vong: q.vong, do_kho: q.do_kho, trang_thai: q.trang_thai,
                  hoi: q.cau.hoi, da: [0, 1, 2, 3].map((j) => q.cau.dapAn[j]?.nhan || ''), dung: q.cau.dung, giai: q.cau.giai || '' })}>Sửa</button>
                <button className="btn-mini" onClick={() => setHoi({ chu: 'Xoá câu này khỏi ngân hàng?', lam: () => xoa(q.id) })}><IcXoa width={12} /></button>
              </div>) },
          ]} />
      </div>
      <div>
        {f && (
          <div className="card ns-qt-the">
            <div className="ns-qt-tit"><IcSua width={16} /> {f.id ? 'Sửa câu' : 'Câu mới'}</div>
            <div className="ns-form">
              <div><div className="lbl">Chủ đề</div><input className="inp" value={f.chu_de} onChange={(e) => setF({ ...f, chu_de: e.target.value })} placeholder="VD: Đổi trả, Bảo hành" /></div>
              <div><div className="lbl">Vòng</div><Sel value={f.vong || 0} onChange={(v) => setF({ ...f, vong: v })} options={[{ value: 0, label: 'Tự do' }, ...VONG.map((v) => ({ value: v.so, label: `${v.so} · ${v.ten}` }))]} /></div>
              <div className="ca"><div className="lbl">Câu hỏi</div><textarea className="inp" rows={3} value={f.hoi} onChange={(e) => setF({ ...f, hoi: e.target.value })} /></div>
              {f.da.map((a, j) => (
                <div key={j}><div className="lbl">Đáp án {'ABCD'[j]}{j < 2 ? '' : ' (không bắt buộc)'}</div>
                  <input className="inp" value={a} onChange={(e) => { const da = [...f.da]; da[j] = e.target.value; setF({ ...f, da }); }} /></div>
              ))}
              <div><div className="lbl">Đáp án đúng</div><Sel value={f.dung} onChange={(v) => setF({ ...f, dung: v })} options={[0, 1, 2, 3].map((j) => ({ value: j, label: 'Đáp án ' + 'ABCD'[j] }))} /></div>
              <div><div className="lbl">Độ khó</div><Sel value={f.do_kho} onChange={(v) => setF({ ...f, do_kho: v })} options={[1, 2, 3].map((j) => ({ value: j, label: ['Dễ', 'Vừa', 'Khó'][j - 1] }))} /></div>
              <div className="ca"><div className="lbl">Giải thích (hiện sau khi công bố)</div><input className="inp" value={f.giai} onChange={(e) => setF({ ...f, giai: e.target.value })} /></div>
              <div className="ca"><Gat on={f.trang_thai === 'DUNG'} onChange={(v) => setF({ ...f, trang_thai: v ? 'DUNG' : 'NGHI' })} chu={f.trang_thai === 'DUNG' ? 'Đang dùng' : 'Tạm nghỉ — không đưa vào đề'} /></div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button className="btn btn-ai" onClick={luu}><IcCheck width={15} /> Lưu câu</button>
              <button className="btn btn-ghost" onClick={() => setF(null)}>Đóng</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================ LỊCH SỬ & XUẤT FILE
function TabLichSu() {
  const { user } = useApp(); const baoToast = useBao();
  const [ds, setDs] = useState(null);
  const [chon, setChon] = useState(null);
  const [kq, setKq] = useState(null);
  useEffect(() => {
    goi('fn_dt_ad_ds', { p_token: user.token }).then((d) => setDs(d.phien.filter((p) => p.trang_thai === 'XONG'))).catch((e) => { baoToast(e.message); setDs([]); });
  }, [user.token, baoToast]);
  useEffect(() => {
    if (!chon) return;
    setKq(null);
    goi('fn_dt_bxh_phien', { p_token: user.token, p_phien: chon.id }).then(setKq).catch((e) => baoToast(e.message));
  }, [chon, user.token, baoToast]);
  const xuat = async () => {
    const XLSX = await import('xlsx');
    const aoa = [['Hạng', 'Mã', 'Người chơi', 'Điểm', 'Số câu đúng', 'Tổng giây câu đúng', 'Vòng 1', 'Vòng 2', 'Vòng 3', 'Vòng 4', 'Vòng 5'],
      ...kq.map((r) => [r.hang, r.ma, r.ten, r.diem, r.so_dung, Math.round(r.ms_dung / 100) / 10, ...[1, 2, 3, 4, 5].map((v) => r.diem_vong?.[v] || 0)])];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [6, 14, 26, 9, 11, 14, 8, 8, 8, 8, 8].map((w) => ({ wch: w }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Ket qua');
    XLSX.writeFile(wb, `ket_qua_${chon.ten.replace(/[^\p{L}\p{N}]+/gu, '_')}.xlsx`);
  };
  if (!ds) return <div className="ns-trong">Đang tải…</div>;
  return (
    <div className="ns-qt-luoi">
      <div className="card">
        <div className="ns-qt-tit"><IcTrophy width={17} /> Phiên đã kết thúc ({ds.length})</div>
        <BangXH khoa="id" dong={ds} rong="Chưa có phiên nào kết thúc"
          cot={[
            { k: 'ten', ten: 'Phiên', ve: (p) => <div><b>{p.ten}</b><div className="ns-mo">{LOAI_PHIEN[p.loai]}{p.ten_giai ? ' · ' + p.ten_giai : ''}</div></div> },
            { k: 'bat_dau', ten: 'Ngày', gt: (p) => new Date(p.bat_dau).getTime(), ve: (p) => `${gioPhut(p.bat_dau)} · ${ngayThang(p.bat_dau)}` },
            { k: 'so_choi', ten: 'Số người', so: true },
            { k: 'nhat', ten: 'Vô địch' },
            { k: 'x', ten: '', ve: (p) => <button className="btn-mini" onClick={() => setChon(p)}>Xem kết quả</button> },
          ]} />
      </div>
      <div>
        {chon && (
          <div className="card">
            <div className="ns-qt-tit"><IcTrophy width={16} /> {chon.ten}
              <div className="ns-qt-phai">{kq?.length > 0 && <button className="btn btn-ghost" onClick={xuat}><IcTaiVe width={15} /> Xuất Excel</button>}</div></div>
            {!kq ? <div className="ns-trong">Đang tải…</div> : (
              <BangXH dong={kq}
                cot={[
                  { k: 'ten', ten: 'Người chơi' },
                  { k: 'diem', ten: 'Điểm', so: true, ve: (r) => <b>{so(r.diem)}</b> },
                  { k: 'so_dung', ten: 'Đúng', so: true },
                ]} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
