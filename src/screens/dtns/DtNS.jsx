import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { sb } from '../../lib/supabase.js';
import { IcTrophy, IcClock, IcRefresh, IcOut, IcCheck, IcAlert, IcFlash, IcShield } from '../../lib/icons.jsx';
import { Sel } from '../../lib/ui.jsx';
import { useApp } from '../../App.jsx';
import NhanVat from './NhanVat.jsx';
import { am, amDangBat, datAm, moKhoa } from './amThanh.js';
import { VONG } from './dtSinhDe.js';
import { IcMat, IcNguoi, IcLoa, IcLoaTat, IcDung, IcVe, IcMuiTen, IcLich, IcLen, IcXuong, IcSanKhau, IcToanMan } from './dtIcons.jsx';
import './dtns.css';

// ĐẤU TRƯỜNG NÓN SƠN — phòng thi trực tiếp: 20 ghế + khán giả, 5 vòng, máy chủ giữ nhịp và chấm điểm.
// Không dùng realtime: hỏi trạng thái mỗi 2 giây (khán giả 3 giây) + hỏi đúng lúc hết pha.

export async function goi(fn, args) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}
export const LOAI_PHIEN = { LE: 'Phiên giao hữu', LOAI: 'Vòng loại', CK: 'Chung kết' };
export const so = (n) => Number(n || 0).toLocaleString('vi');
export const gioPhut = (ts) => new Date(ts).toLocaleTimeString('vi', { hour: '2-digit', minute: '2-digit' });
export const ngayThang = (ts) => new Date(ts).toLocaleDateString('vi', { weekday: 'short', day: '2-digit', month: '2-digit' });
export function demNguoc(ms) {
  if (ms == null) return '';
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s >= 3600) return `${Math.floor(s / 3600)} giờ ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} phút`;
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
const HINH_OK = (u) => typeof u === 'string' && /^https?:\/\//.test(u);
function napHinh(ds) { (ds || []).filter(HINH_OK).forEach((u) => { const im = new Image(); im.src = u; }); }
function hinhCuaCau(c) {
  if (!c) return [];
  return [c.hinh, ...(c.dapAn || []).map((d) => d.hinh), ...(c.ke || []).map((k) => k.hinh)].filter(Boolean);
}

// ============================================================ BẢNG XẾP HẠNG (dùng chung)
export function BangXH({ cot, dong, toiMa, rong = 'Chưa có dữ liệu', khoa = 'ma' }) {
  const [sx, setSx] = useState(null);
  const ds = useMemo(() => {
    if (!sx) return dong;
    const c = cot.find((x) => x.k === sx.k);
    const v = (r) => (c?.gt ? c.gt(r) : r[sx.k]);
    return [...dong].sort((a, b) => {
      const x = v(a), y = v(b);
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'vi');
      return sx.tang ? r : -r;
    });
  }, [dong, sx, cot]);
  if (!dong.length) return <div className="ns-trong">{rong}</div>;
  return (
    <div className="tbl-wrap ns-tbl-wrap">
      <table className="tbl ns-tbl">
        <thead><tr>
          <th className="ns-c">#</th>
          {cot.map((c) => (
            <th key={c.k} className={(c.so ? 'ns-c ' : '') + 'ns-sx'} style={c.w ? { width: c.w } : undefined}
              onClick={() => setSx((o) => (o && o.k === c.k ? { k: c.k, tang: !o.tang } : { k: c.k, tang: !c.so }))}>
              {c.ten}{sx?.k === c.k && (sx.tang ? <IcLen width={11} /> : <IcXuong width={11} />)}
            </th>
          ))}
        </tr></thead>
        <tbody>
          {ds.map((r, i) => (
            <tr key={r[khoa] ?? i} className={r.ma && r.ma === toiMa ? 'ns-toi' : ''}>
              <td className="ns-c ns-stt">{i + 1}</td>
              {cot.map((c) => <td key={c.k} className={c.so ? 'ns-c ns-so' : ''}>{c.ve ? c.ve(r) : r[c.k]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================ VÀO ĐẤU TRƯỜNG
export default function DtNS({ onThoat }) {
  const [phong, setPhong] = useState(null);
  if (phong) return <Phong key={phong.id} id={phong.id} vaiXin={phong.vai} onRa={() => setPhong(null)} />;
  return <SanhNS onVao={(id, vai) => { moKhoa(); am.vao(); setPhong({ id, vai }); }} onThoat={onThoat} />;
}

// ============================================================ SẢNH PHIÊN
function SanhNS({ onVao, onThoat }) {
  const { user } = useApp();
  const [tab, setTab] = useState('PHIEN');
  const [sanh, setSanh] = useState(null);
  const [loi, setLoi] = useState(null);
  const [lech, setLech] = useState(0);          // giờ máy chủ - giờ máy mình
  const [, setNhip] = useState(0);
  const tai = useCallback(async () => {
    try {
      const t0 = Date.now(); const d = await goi('fn_dt_sanh', { p_token: user.token });
      setLech(d.gio - (t0 + Date.now()) / 2); setSanh(d); setLoi(null);
    } catch (e) { setLoi(e.message); }
  }, [user.token]);
  useEffect(() => { tai(); const t = setInterval(tai, 15000); const n = setInterval(() => setNhip((x) => x + 1), 1000); return () => { clearInterval(t); clearInterval(n); }; }, [tai]);
  const bay = Date.now() + lech;

  const ds = sanh?.phien || [];
  const dang = ds.filter((p) => p.trang_thai === 'DANG');
  const sap = ds.filter((p) => p.trang_thai === 'SAN_SANG');
  const xong = ds.filter((p) => p.trang_thai === 'XONG');

  return (
    <div className="ns-sanh">
      <div className="cmdbar ns-hero">
        <div className="ns-hero-noi">
          <button className="btn-hd ns-lui" onClick={onThoat}><IcMuiTen width={15} /> Đấu trường</button>
          <h1>Đấu Trường Nón Sơn</h1>
          <div className="sub">Thi trực tiếp 20 người · 5 vòng · cả hệ thống cùng theo dõi. Máy chủ giữ giờ và chấm điểm — công bằng cho mọi cửa hàng.</div>
        </div>
        <div className="ns-hero-nv" aria-hidden="true">
          {['a1', 'b7', 'c3', 'd9', 'e2'].map((s, i) => (
            <div key={s} className={'ns-hero-ng n' + i}><NhanVat seed={s} mood={i === 2 ? 'thang' : 'cho'} vang={i === 2} /></div>
          ))}
        </div>
      </div>

      <div className="nhom-tabs">
        <button className={'nhom-tab' + (tab === 'PHIEN' ? ' on' : '')} onClick={() => setTab('PHIEN')}><IcLich width={15} /> Lịch thi</button>
        <button className={'nhom-tab' + (tab === 'GIAI' ? ' on' : '')} onClick={() => setTab('GIAI')}><IcVe width={15} /> Giải đấu</button>
        <button className={'nhom-tab' + (tab === 'TONG' ? ' on' : '')} onClick={() => setTab('TONG')}><IcTrophy width={15} /> Bảng vàng</button>
        <button className={'nhom-tab' + (tab === 'LUAT' ? ' on' : '')} onClick={() => setTab('LUAT')}><IcShield width={15} /> Luật chơi</button>
      </div>

      {loi && <div className="ns-canh"><IcAlert width={16} /> Chưa tải được lịch thi: {loi}</div>}

      {tab === 'PHIEN' && (
        <div className="ns-sanh-luoi">
          <div className="ns-ds-phien">
            {!sanh && !loi && <div className="ns-trong">Đang tải lịch thi…</div>}
            {sanh && !ds.length && (
              <div className="card ns-trong-lon">
                <IcSanKhau width={34} height={34} />
                <b>Chưa có phiên thi nào được lên lịch</b>
                <span>Ban tổ chức sẽ mở phiên tiếp theo tại đây. Trong lúc chờ, luyện tay ở các trò chơi khác của Đấu trường nhé.</span>
              </div>
            )}
            {dang.length > 0 && <div className="ns-nhom-tit"><span className="ns-cham-do" /> Đang diễn ra</div>}
            {dang.map((p) => <ThePhien key={p.id} p={p} bay={bay} onVao={onVao} />)}
            {sap.length > 0 && <div className="ns-nhom-tit">Sắp diễn ra</div>}
            {sap.map((p) => <ThePhien key={p.id} p={p} bay={bay} onVao={onVao} />)}
            {xong.length > 0 && <div className="ns-nhom-tit">Vừa kết thúc</div>}
            {xong.map((p) => <ThePhien key={p.id} p={p} bay={bay} onVao={onVao} />)}
          </div>
          <div className="ns-ben">
            {(sanh?.giai || []).map((g) => (
              <div key={g.id} className="card ns-the-giai">
                <div className="ns-the-giai-tit"><IcVe width={16} /> {g.ten}</div>
                {g.mo_ta && <div className="ns-mo">{g.mo_ta}</div>}
                <div className="ns-the-giai-so">
                  <span>Top <b>{g.top_moi_phien}</b> mỗi phiên loại vào chung kết</span>
                  <span><b>{g.so_ck}</b> vé chung kết</span>
                </div>
                {g.co_ve ? <span className="chip gold"><IcVe width={12} /> Bạn đã có vé chung kết</span>
                  : g.trang_thai === 'MO' ? <span className="chip teal">Đang thi vòng loại</span> : <span className="chip dim">Đã chốt vé</span>}
                <button className="btn-mini" onClick={() => setTab('GIAI')}>Xem bảng xếp hạng giải</button>
              </div>
            ))}
            <TomTatLuat gon />
          </div>
        </div>
      )}
      {tab === 'GIAI' && <TabGiai giai={sanh?.giai || []} toiMa={sanh?.toi?.ma} />}
      {tab === 'TONG' && <TabTong toiMa={sanh?.toi?.ma} />}
      {tab === 'LUAT' && <div className="ns-luat-trang"><TomTatLuat /></div>}
    </div>
  );
}

function ThePhien({ p, bay, onVao }) {
  const truocMo = p.trang_thai === 'SAN_SANG' && bay < new Date(p.mo_cua).getTime();
  const conBd = new Date(p.bat_dau).getTime() - bay;
  const ckKhongVe = p.loai === 'CK' && !p.co_ve;
  let nut;
  if (p.trang_thai === 'XONG') {
    nut = <button className="btn btn-ghost" onClick={() => onVao(p.id, 'XEM')}><IcTrophy width={15} /> Kết quả</button>;
  } else if (p.trang_thai === 'DANG') {
    nut = p.vai_toi === 'CHOI'
      ? <button className="btn btn-ai" onClick={() => onVao(p.id, 'CHOI')}><IcFlash width={15} /> Vào lại ghế</button>
      : <button className="btn btn-ai" onClick={() => onVao(p.id, 'XEM')}><IcMat width={15} /> Xem trực tiếp</button>;
  } else if (truocMo) {
    nut = <button className="btn btn-ghost" disabled><IcClock width={15} /> Mở cửa {gioPhut(p.mo_cua)}</button>;
  } else {
    nut = (<>
      {!ckKhongVe && (
        <button className="btn btn-ai" onClick={() => onVao(p.id, 'CHOI')}>
          <IcFlash width={15} /> {p.vai_toi === 'CHOI' ? 'Về ghế của tôi' : p.vai_toi === 'CHO' ? 'Vào hàng chờ' : p.so_choi >= p.so_ghe ? 'Xếp hàng chờ' : 'Vào thi'}
        </button>
      )}
      <button className="btn btn-ghost" onClick={() => onVao(p.id, 'XEM')}><IcMat width={15} /> Xem</button>
    </>);
  }
  return (
    <div className={'card ns-phien ' + p.trang_thai.toLowerCase()}>
      <div className="ns-phien-gio">
        <b>{gioPhut(p.bat_dau)}</b>
        <span>{ngayThang(p.bat_dau)}</span>
      </div>
      <div className="ns-phien-noi">
        <div className="ns-phien-ten">{p.ten}</div>
        <div className="ns-phien-chip">
          <span className={'chip ' + (p.loai === 'CK' ? 'gold' : p.loai === 'LOAI' ? 'teal' : 'dim')}>{LOAI_PHIEN[p.loai]}{p.ten_giai ? ' · ' + p.ten_giai : ''}</span>
          {p.trang_thai === 'DANG' && <span className="chip warn"><span className="ns-cham-do" /> Đang thi</span>}
          {p.trang_thai === 'SAN_SANG' && !truocMo && <span className="chip teal"><IcClock width={12} /> Bắt đầu sau {demNguoc(conBd)}</span>}
          {ckKhongVe && p.trang_thai !== 'XONG' && <span className="chip dim">Chỉ người có vé được thi</span>}
          {p.vai_toi === 'CHOI' && p.trang_thai !== 'XONG' && <span className="chip gold">Bạn đang giữ ghế</span>}
        </div>
        <div className="ns-phien-so">
          {p.trang_thai === 'XONG' ? (<>
            <span><IcTrophy width={13} /> Vô địch: <b>{p.nhat || '—'}</b></span>
            {p.hang_toi && <span>Bạn hạng <b>{p.hang_toi}</b></span>}
          </>) : (<>
            <span><IcNguoi width={13} /> <b>{p.so_choi}</b>/{p.so_ghe} ghế</span>
            {p.so_cho > 0 && <span><b>{p.so_cho}</b> người chờ</span>}
            <span><IcMat width={13} /> <b>{p.so_xem}</b> đang xem</span>
          </>)}
        </div>
      </div>
      <div className="ns-phien-nut">{nut}</div>
    </div>
  );
}

function TomTatLuat({ gon }) {
  return (
    <div className={'card ns-luat' + (gon ? ' gon' : '')}>
      <div className="ns-luat-tit"><IcShield width={16} /> Luật chơi 5 vòng</div>
      {VONG.map((v) => (
        <div key={v.so} className="ns-luat-vong">
          <span className="ns-luat-so">{v.so}</span>
          <div>
            <b>{v.ten}</b>
            <div className="ns-mo">{v.mo}</div>
            {!gon && <div className="ns-luat-chip">{v.luat.map((l) => <span key={l} className="chip dim">{l}</span>)}</div>}
          </div>
        </div>
      ))}
      {!gon && (
        <div className="ns-luat-them">
          <div><b>Xếp hạng:</b> tổng điểm → ai trả lời đúng nhanh hơn (tổng thời gian các câu đúng) → đúng nhiều hơn ở vòng 5 → vào phòng sớm hơn.</div>
          <div><b>Ghế:</b> 20 ghế, ai vào trước giữ trước; hết ghế thì xếp hàng chờ. Rời phòng chờ quá 45 giây sẽ nhường ghế. Tới giờ, danh sách khoá — người chờ chuyển sang xem.</div>
          <div><b>Rớt mạng:</b> giữ nguyên ghế và điểm, vào lại để thi tiếp. Câu đã qua không trả lời được.</div>
          <div><b>Giải đấu:</b> mỗi phiên vòng loại lấy top đầu vào chung kết, phần vé còn lại trao cho điểm cao nhất (vé vớt).</div>
        </div>
      )}
    </div>
  );
}

function TabGiai({ giai, toiMa }) {
  const { user } = useApp();
  const [gid, setGid] = useState(giai[0]?.id || null);
  const [d, setD] = useState(null);
  useEffect(() => { if (!gid && giai[0]) setGid(giai[0].id); }, [giai, gid]);
  useEffect(() => {
    if (!gid) return;
    setD(null);
    goi('fn_dt_bxh_giai', { p_token: user.token, p_giai: gid }).then(setD).catch(() => setD({ bang: [], ve: [], chung_ket: [] }));
  }, [gid, user.token]);
  if (!giai.length) return <div className="card ns-trong-lon"><IcVe width={30} height={30} /><b>Chưa có giải đấu đang chạy</b><span>Các phiên giao hữu vẫn được tính vào Bảng vàng.</span></div>;
  return (
    <div className="ns-giai">
      <div className="toolbar">
        <Sel value={gid} onChange={setGid} options={giai.map((g) => ({ value: g.id, label: g.ten }))} style={{ minWidth: 260 }} />
        {d?.giai && <span className="chip dim">{d.giai.tu_ngay ? `${d.giai.tu_ngay.split('-').reverse().join('/')} → ${(d.giai.den_ngay || '').split('-').reverse().join('/')}` : ''}</span>}
      </div>
      {!d ? <div className="ns-trong">Đang tải…</div> : (<>
        {d.chung_ket?.length > 0 && (
          <div className="card ns-ck">
            <div className="ns-luat-tit"><IcTrophy width={16} /> Kết quả chung kết</div>
            <div className="ns-ck-buc">
              {d.chung_ket.slice(0, 3).map((r) => (
                <div key={r.ma} className={'ns-ck-o h' + r.hang}><span className="ns-ck-hang">{r.hang}</span><b>{r.ten}</b><span>{so(r.diem)} điểm</span></div>
              ))}
            </div>
          </div>
        )}
        <div className="ns-luat-tit" style={{ margin: '14px 2px 8px' }}>Bảng xếp hạng vòng loại · điểm phiên tốt nhất</div>
        <BangXH toiMa={toiMa} dong={d.bang || []} rong="Chưa có phiên vòng loại nào kết thúc"
          cot={[
            { k: 'ten', ten: 'Người chơi' },
            { k: 'diem', ten: 'Điểm tốt nhất', so: true, ve: (r) => <b>{so(r.diem)}</b> },
            { k: 'hang_phien', ten: 'Hạng trong phiên', so: true },
            { k: 'phien', ten: 'Phiên' },
            { k: 'so_phien', ten: 'Số phiên', so: true },
            { k: 've', ten: 'Vé CK', ve: (r) => r.ve === 'TOP' ? <span className="chip gold">Top phiên</span> : r.ve === 'VOT' ? <span className="chip teal">Vé vớt</span> : '' },
          ]} />
      </>)}
    </div>
  );
}

function TabTong({ toiMa }) {
  const { user } = useApp();
  const [ds, setDs] = useState(null);
  useEffect(() => { goi('fn_dt_bxh_tong', { p_token: user.token }).then(setDs).catch(() => setDs([])); }, [user.token]);
  if (!ds) return <div className="ns-trong">Đang tải…</div>;
  return (
    <BangXH toiMa={toiMa} dong={ds} rong="Chưa có phiên nào kết thúc"
      cot={[
        { k: 'ten', ten: 'Người chơi' },
        { k: 'vo_dich', ten: 'Vô địch', so: true, ve: (r) => r.vo_dich ? <b className="ns-vang">{r.vo_dich}</b> : 0 },
        { k: 'len_buc', ten: 'Lên bục (top 3)', so: true },
        { k: 'so_phien', ten: 'Số phiên', so: true },
        { k: 'diem_max', ten: 'Điểm cao nhất', so: true, ve: (r) => so(r.diem_max) },
        { k: 'diem_tb', ten: 'Điểm trung bình', so: true, ve: (r) => so(r.diem_tb) },
      ]} />
  );
}

// ============================================================ PHÒNG THI (toàn màn hình)
// Sân khấu: các bàn thi xếp theo hạng — dãy đầu là top dẫn đầu. Nhân vật ngồi sau bàn, bảng tên + điểm trên mặt bàn.
function boTriBan(n, rong, hep) {
  const moiDay = hep ? 5 : 10;
  const out = []; const day = []; let y = 0;
  for (let i = 0, t = 0; i < n; i += moiDay, t++) {
    const c = Math.min(moiDay, n - i);
    const w = Math.min(t === 0 ? (hep ? 74 : 92) : (hep ? 66 : 78), (rong - 6) / moiDay);
    const cao = w * 0.62 + (hep ? 36 : 40) + (c > 1 ? (hep ? 6 : 12) : 0);
    const le = (rong - w * c) / 2;
    for (let k = 0; k < c; k++) {
      const dx = c > 1 ? (k - (c - 1) / 2) / ((c - 1) / 2) : 0;   // -1..1: hai đầu dãy cong ra phía trước như hội trường
      out.push({ x: le + k * w, y: y + dx * dx * (hep ? 6 : 12), w, day: t });
    }
    day.push({ y, cao, t });
    y += cao + (hep ? 8 : 6);
  }
  return { o: out, cao: y, day };
}

function moodCua(g, st) {
  if (!g.ket_noi) return 'mat';
  const pha = st.pha;
  if (pha === 'KET_THUC') return g.hang && g.hang <= 3 ? 'thang' : 'cho';
  if (pha === 'CONG_BO' && st.cong_bo) {
    const k = st.cong_bo.ket?.[String(g.ghe)];
    return k === true ? 'dung' : k === false ? 'sai' : 'cho';
  }
  if (pha === 'TRA_LOI') return g.da_tl ? 'da-tl' : 'nghi';
  return 'cho';
}

const Ban = memo(function Ban({ g, vt, mood, toi, coHang, nhat }) {
  const [delta, setDelta] = useState(null);
  const truoc = useRef(g.diem);
  useEffect(() => {
    if (g.diem !== truoc.current) {
      const d = g.diem - truoc.current; truoc.current = g.diem;
      setDelta(d); const t = setTimeout(() => setDelta(null), 1800); return () => clearTimeout(t);
    }
    return undefined;
  }, [g.diem]);
  return (
    <div className={'ns-ban t' + vt.day + ' m-' + mood + (toi ? ' toi' : '') + (nhat ? ' nhat' : '')}
      style={{ transform: `translate3d(${vt.x}px, ${vt.y}px, 0)`, width: vt.w, '--w': vt.w + 'px' }}>
      {nhat && <div className="ns-ban-den" />}
      {delta != null && delta !== 0 && <span className={'ns-ban-delta' + (delta < 0 ? ' am' : '')}>{delta > 0 ? '+' : ''}{so(delta)}</span>}
      <div className="ns-ban-nv"><NhanVat seed={g.ma} mood={mood} vang={nhat} toi={toi} /></div>
      <div className="ns-ban-mat">
        <div className="ns-ban-dong">
          {coHang && <span className={'ns-ban-hang' + (g.hang <= 3 ? ' h' + g.hang : '')}>{g.hang}</span>}
          <b className="ns-ban-ten" title={g.ten}>{g.ten}</b>
        </div>
        <i className="ns-ban-diem">{coHang ? so(g.diem) : 'Ghế ' + g.ghe}{toi && <em>BẠN</em>}</i>
      </div>
    </div>
  );
});

function useRong(ref) {
  const [rong, setRong] = useState(900);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setRong(Math.round(e.contentRect.width)));
    ro.observe(el); setRong(el.clientWidth);
    return () => ro.disconnect();
  }, [ref]);
  return rong;
}

function SanKhau({ st, toiMa, cang }) {
  const ref = useRef(null);
  const rong = useRong(ref);
  const hep = rong < 640;
  const coHang = st.phien.trang_thai !== 'SAN_SANG';
  const ghe = useMemo(() => {
    const ds = [...(st.ghe || [])];
    return coHang ? ds.sort((a, b) => (a.hang ?? 999) - (b.hang ?? 999)) : ds.sort((a, b) => a.ghe - b.ghe);
  }, [st.ghe, coHang]);
  const n = Math.max(ghe.length, coHang ? 1 : Math.min(st.phien.so_ghe, 20));
  const bt = boTriBan(n, rong, hep);
  const conTrong = coHang ? 0 : Math.max(0, n - ghe.length);
  const coDiem = ghe.some((g) => g.diem > 0);
  return (
    <div className={'ns-sk' + (cang ? ' cang' : '') + ' pha-' + st.pha.toLowerCase()} ref={ref} style={{ height: bt.cao }}>
      {bt.day.map((d) => <div key={d.t} className={'ns-sk-san t' + d.t} style={{ top: d.y + d.cao - 18 }} />)}
      {ghe.map((g, i) => (
        <Ban key={g.ma} g={g} vt={bt.o[i]} mood={moodCua(g, st)} toi={g.ma === toiMa} coHang={coHang}
          nhat={coHang && g.hang === 1 && (coDiem || st.pha === 'KET_THUC')} />
      ))}
      {Array.from({ length: conTrong }).map((_, k) => {
        const vt = bt.o[ghe.length + k];
        return vt ? (
          <div key={'tr' + k} className={'ns-ban trong t' + vt.day} style={{ transform: `translate3d(${vt.x}px, ${vt.y}px, 0)`, width: vt.w, '--w': vt.w + 'px' }}>
            <div className="ns-ban-nv"><div className="ns-ban-ghe-trong" /></div>
            <div className="ns-ban-mat"><div className="ns-ban-dong"><b className="ns-ban-ten">Ghế trống</b></div><i className="ns-ban-diem">chờ người vào</i></div>
          </div>) : null;
      })}
    </div>
  );
}

// KHÁN ĐÀI (nhìn từ phía sau như ngồi trong hội trường): mỗi khán giả thật đang xem là một người ngồi ghế,
// ghế gần sân khấu trước, giữa trước; người mới vào đứng dậy ngồi xuống + được chào tên.
const MAU_KG = ['#3FB6A8', '#CBA45A', '#D6006C', '#6E8FD8', '#E9C9A6', '#2E8B57', '#F2D58E', '#9B6FC4', '#E06A6A', '#1E5F63', '#F4F1EA', '#4A5670'];
const TOC_KG = ['#1E1B1A', '#3A2A20', '#2B2B33', '#55392A', '#121212'];
const DA_KG = ['#F1CBA8', '#E2B48C', '#C98E62'];
const KhanGiaSau = memo(function KhanGiaSau({ i, co }) {
  const h = (i * 2654435761) >>> 0;
  const ao = MAU_KG[h % MAU_KG.length], toc = TOC_KG[(h >>> 5) % TOC_KG.length], da = DA_KG[(h >>> 9) % 3];
  const kieu = (h >>> 12) % 5, non = MAU_KG[(h >>> 15) % MAU_KG.length];
  return (
    <svg viewBox="0 0 40 46" className="kgs-svg" aria-hidden="true">
      {co && (
        <g className="kgs-nguoi">
          <path d="M6 46 Q7 31 20 30 Q33 31 34 46 Z" fill={ao} />
          <rect x="17" y="23" width="6" height="8" rx="2" fill={da} />
          {kieu === 1 && <path d="M11 16 Q11 7 20 7 Q29 7 29 16 L30 32 Q20 35 10 32 Z" fill={toc} />}
          <circle cx="11.6" cy="17.5" r="2" fill={da} /><circle cx="28.4" cy="17.5" r="2" fill={da} />
          <circle cx="20" cy="16" r="8.6" fill={toc} stroke="rgba(190,240,232,.38)" strokeWidth=".9" />
          {kieu === 2 && <circle cx="20" cy="6.2" r="3.6" fill={toc} />}
          {kieu === 3 && <g><path d="M11 15 Q11 6 20 6 Q29 6 29 15 Z" fill={non} /><path d="M14 15 L26 15" stroke="rgba(0,0,0,.25)" strokeWidth="1.4" /></g>}
          <g className="kgs-tay"><path d="M31 36 L35 20" stroke={da} strokeWidth="3.6" strokeLinecap="round" /><path d="M35.3 19 L37.6 4" stroke={non} strokeWidth="2.4" strokeLinecap="round" className="kgs-que" /></g>
        </g>
      )}
      <path d={co ? 'M4 40 Q4 37 8 37 L32 37 Q36 37 36 40 L36 46 L4 46 Z' : 'M5 22 Q5 18 10 18 L30 18 Q35 18 35 22 L35 46 L5 46 Z'} className="kgs-ghe" />
    </svg>
  );
});
function KhanDai({ st, cang, hep }) {
  const ref = useRef(null);
  const rong = useRong(ref);
  const n = st.so_xem || 0;
  const co = hep ? [15, 18, 22, 27] : [19, 23, 28, 34];
  // số ghế mỗi dãy (dãy sau hẹp hơn); xếp chỗ: dãy trước trước, trong dãy từ giữa ra
  const day = co.map((c, r) => ({ c, so: Math.max(4, Math.floor((rong * (0.66 + r * 0.1)) / (c * 0.98))) }));
  const thuTu = [];
  for (let r = day.length - 1; r >= 0; r--) {
    const m = day[r].so; const g = [];
    for (let k = 0; k < m; k++) g.push(k);
    g.sort((a, b) => Math.abs(a - (m - 1) / 2) - Math.abs(b - (m - 1) / 2));
    g.forEach((k) => thuTu.push([r, k]));
  }
  const ngoi = {}; thuTu.slice(0, n).forEach(([r, k], i) => { ngoi[r + ':' + k] = i; });
  const sucChua = thuTu.length;
  const [tag, setTag] = useState([]);
  const daChao = useRef(new Set());
  useEffect(() => {
    const moi = (st.kg_moi || []).filter((t) => !daChao.current.has(t));
    if (!moi.length) return undefined;
    moi.forEach((t) => daChao.current.add(t));
    const id = Date.now();
    setTag((x) => [...x, ...moi.map((t, i) => ({ id: id + i, t }))].slice(-3));
    const h = setTimeout(() => setTag((x) => x.filter((y) => y.id < id)), 4200);
    return () => clearTimeout(h);
  }, [st.kg_moi]);
  const rx = st.pha === 'KET_THUC' ? ' mung' : st.pha === 'CONG_BO' ? ' hoan-ho' : cang ? ' nin' : st.pha === 'NGHI' ? ' vo-tay' : '';
  return (
    <div className={'ns-kd' + rx} ref={ref}>
      <div className="ns-kd-tag">{tag.map((x) => <span key={x.id}>{x.t} vừa vào khán đài</span>)}</div>
      {day.map((d, r) => (
        <div key={r} className={'ns-kd-day r' + r} style={{ '--s': d.c + 'px' }}>
          {Array.from({ length: d.so }).map((_, k) => {
            const vi = ngoi[r + ':' + k];
            return (
              <i key={k} className={'kgs' + (vi != null ? ' co' + (vi % 5 === 2 ? ' que' : '') : '')}
                style={{ '--d': (((r * 31 + k * 17) % 23) / 18).toFixed(2) + 's' }}>
                <KhanGiaSau i={r * 97 + k} co={vi != null} />
              </i>
            );
          })}
        </div>
      ))}
      <div className="ns-kd-nhan"><IcMat width={13} /> <b>{n}</b> khán giả{n > sucChua ? ` (+${n - sucChua} đứng)` : ''}{st.so_cho > 0 ? ` · ${st.so_cho} chờ ghế` : ''}</div>
    </div>
  );
}

// Bảng điểm sống (cạnh màn hình câu, máy tính): thấy rõ tên + mũi tên lên/xuống hạng
function BangSong({ st, toiMa }) {
  const cu = useRef({});
  const ds = (st.ghe || []).filter((g) => g.hang).sort((a, b) => a.hang - b.hang);
  const dich = {};
  ds.forEach((g) => { const h = cu.current[g.ma]; dich[g.ma] = h ? h - g.hang : 0; });
  useEffect(() => { const m = {}; ds.forEach((g) => { m[g.ma] = g.hang; }); cu.current = m; });
  if (!ds.length) return null;
  return (
    <div className="ns-song">
      <div className="ns-song-tit"><IcTrophy width={14} /> Bảng điểm</div>
      {ds.map((g) => (
        <div key={g.ma} className={'ns-song-d' + (g.ma === toiMa ? ' toi' : '') + (!g.ket_noi ? ' mat' : '') + (g.hang <= 3 ? ' h' + g.hang : '')}>
          <span className="h">{g.hang}</span>
          <span className="t">{g.ten}</span>
          <b>{dich[g.ma] > 0 && <IcLen width={10} height={10} className="len" />}{dich[g.ma] < 0 && <IcXuong width={10} height={10} className="xuong" />}{so(g.diem)}</b>
        </div>
      ))}
    </div>
  );
}

function BangDien({ st, con, mc, amOn, setAmOn }) {
  const p = st.phien; const pha = st.pha;
  const v = VONG.find((x) => x.so === st.vong);
  const giay = con == null ? null : Math.max(0, Math.ceil(con / 1000));
  const nhan = pha === 'CHO' ? 'PHÒNG CHỜ' : pha === 'KET_THUC' ? 'KẾT THÚC' : st.vong === 1 && pha === 'NGHI' && st.stt === 1 ? 'GIỚI THIỆU' : v ? `VÒNG ${v.so}/5` : '';
  const doan = Object.values(p.vong || {}).sort((a, b) => a.tu - b.tu);
  const daXong = pha === 'KET_THUC' ? p.tong_cau : st.stt ? (pha === 'CONG_BO' ? st.stt : st.stt - 1) : 0;
  const toi = p.trang_thai !== 'SAN_SANG' ? (st.ghe || []).find((g) => g.ma === st.toi?.ma) : null;
  return (
    <div className={'ns-bang' + (p.dung ? ' dung' : '')}>
      <div className="ns-bang-hang">
        <div className="ns-bang-trai">
          <div className="ns-bang-nhan">{nhan}</div>
          <div className="ns-bang-vong">{pha === 'CHO' ? p.ten : pha === 'KET_THUC' ? p.ten : v ? v.ten : p.ten}</div>
        </div>
        <div className="ns-bang-giua">
          {pha === 'CHO'
            ? <div className="ns-led nho">{demNguoc(con)}</div>
            : pha === 'KET_THUC' ? <div className="ns-led nho"><IcTrophy width={30} height={30} /></div>
            : <div className={'ns-led' + (pha === 'TRA_LOI' && giay <= 3 ? ' gap' : '')}>{p.dung ? '||' : String(giay ?? '').padStart(2, '0')}</div>}
          <div className="ns-bang-cau">
            {pha === 'CHO' ? 'BẮT ĐẦU SAU' : pha === 'KET_THUC' ? `${p.tong_cau} CÂU` : `CÂU ${st.stt}/${p.tong_cau}`}
            {pha === 'TRUOC' && ' · CHUẨN BỊ'}{pha === 'CONG_BO' && ' · ĐÁP ÁN'}{pha === 'NGHI' && ' · SẮP BẮT ĐẦU'}
          </div>
        </div>
        <div className="ns-bang-phai">
          {toi && <span className="ns-bang-toi">Bạn #{toi.hang} · {so(toi.diem)}</span>}
          <span title="Đang thi"><IcNguoi width={14} /> {(st.ghe || []).length}</span>
          {st.so_cho > 0 && <span title="Hàng chờ"><IcClock width={14} /> {st.so_cho}</span>}
          <span title="Khán giả"><IcMat width={14} /> {st.so_xem}</span>
          <button className="ns-bang-am" onClick={() => { moKhoa(); datAm(!amOn); setAmOn(!amOn); }} title={amOn ? 'Tắt âm' : 'Bật âm'}>
            {amOn ? <IcLoa width={15} /> : <IcLoaTat width={15} />}
          </button>
        </div>
      </div>
      {doan.length > 0 && (
        <div className="ns-bang-tien">
          {doan.map((d, i) => (
            <div key={i} className="ns-bang-doan" style={{ flex: d.so }}>
              {Array.from({ length: d.so }).map((_, k) => {
                const s = d.tu + k;
                return <i key={k} className={s <= daXong ? 'xong' : s === st.stt && pha !== 'CHO' ? 'nay' : ''} />;
              })}
            </div>
          ))}
        </div>
      )}
      <div className="ns-bang-mc" key={mc[0]?.id || 0}>{mc[0]?.txt || (pha === 'CHO' ? 'Chào mừng tới Đấu Trường Nón Sơn — giữ ghế và chờ hiệu lệnh!' : ' ')}</div>
    </div>
  );
}

function Hinh({ src, className = '' }) {
  const [san, setSan] = useState(false);
  if (!HINH_OK(src)) return null;
  return (
    <div className={'ns-hinh ' + className + (san ? ' san' : '')}>
      <img src={src} alt="" onLoad={() => setSan(true)} onError={(e) => { e.currentTarget.style.visibility = 'hidden'; setSan(true); }} />
    </div>
  );
}

function ManCau({ c, st, chon, onChon, choi, cb }) {
  const q = c.cau || {};
  const coHinhDa = (q.dapAn || []).some((d) => d.hinh);
  const congBo = st.pha === 'CONG_BO' && cb;
  const dung = congBo ? cb.dung : null;
  const tong = congBo ? Math.max(1, cb.tong_tl || 0) : 1;
  const khoa = !choi || st.pha !== 'TRA_LOI' || chon != null || st.phien.dung;
  const ds = q.loai === 'DS';
  const dai = (q.dapAn || []).some((d) => (d.nhan || '').length > 24);
  return (
    <div className="ns-cau" key={c.stt}>
      <div className="ns-cau-chip">
        <span className="chip teal">Câu {c.stt} · +{c.diem}</span>
        {c.toc_do && <span className="chip dim"><IcFlash width={11} /> thưởng tốc độ</span>}
        {c.chuoi && <span className="chip dim">3 đúng liền ×1,5</span>}
        {c.sai > 0 && <span className="chip warn">sai −{c.sai}</span>}
        {c.vang && <span className="chip gold">CÂU VÀNG ×2</span>}
      </div>
      <div className="ns-cau-hoi">{q.hoi}</div>
      {q.the ? (
        <div className="ns-the-ds">
          {q.hinh && <Hinh src={q.hinh} className="vua" />}
          <div className="ns-the-ds-noi"><div className="ns-the-ds-ten">{q.the.ten}</div><div className="ns-the-ds-dong">{q.the.dong}</div></div>
        </div>
      ) : q.hinh ? <Hinh src={q.hinh} className="lon" /> : null}
      <div className={'ns-da-luoi' + (coHinhDa ? ' hinh' : '') + (ds ? ' ds' : '') + (dai ? ' dai' : '') + ((q.dapAn || []).length === 3 ? ' ba' : '') + ((q.dapAn || []).length === 2 && !ds ? ' hai' : '')}>
        {(q.dapAn || []).map((d, i) => {
          const la = chon === i;
          const cls = congBo ? (i === dung ? ' dung' : la ? ' sai' : ' mo') : la ? ' chon' : '';
          const n = congBo ? (cb.dem?.[i] || 0) : 0;
          return (
            <button key={i} className={'ns-da' + cls + (ds ? (i === 0 ? ' dd' : ' ss') : '')} disabled={khoa && !la}
              onClick={() => !khoa && onChon(i)} style={{ animationDelay: i * 50 + 'ms' }}>
              {!ds && <span className="ns-da-ky">{'ABCDEF'[i]}</span>}
              {d.hinh && <Hinh src={d.hinh} className="da" />}
              {d.nhan && <span className="ns-da-chu">{d.nhan}</span>}
              {congBo && (
                <span className="ns-da-dem"><i style={{ width: (n / tong) * 100 + '%' }} /><b>{n}</b></span>
              )}
              {la && !congBo && <span className="ns-da-chot"><IcCheck width={13} /> Đã chốt</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ManKe({ c, con }) {
  const ke = c.cau?.ke || [];
  return (
    <div className="ns-ke">
      <div className="ns-ke-tit"><IcMat width={18} height={18} /> GHI NHỚ KỆ HÀNG <span>{Math.ceil((con || 0) / 1000)}s</span></div>
      <div className="ns-ke-luoi">
        {ke.map((k, i) => (
          <div key={i} className="ns-ke-o" style={{ animationDelay: i * 70 + 'ms' }}>
            <Hinh src={k.hinh} className="ke" />
            <div className="ns-ke-ten">{k.ten}</div>
            <div className="ns-ke-gia">{k.gia}</div>
          </div>
        ))}
      </div>
      <div className="ns-ke-chu">Kệ sẽ biến mất — câu hỏi hiện ngay sau đó.</div>
    </div>
  );
}

function ManCuoc({ c, muc, onCuoc, choi, con }) {
  return (
    <div className="ns-cuoc">
      <div className="ns-cuoc-tit">{c.vang ? 'CÂU VÀNG' : 'ĐẶT CƯỢC'} · CÂU {c.stt}</div>
      <div className="ns-cuoc-mo">{c.vang ? 'Toàn bộ điểm câu này nhân đôi — kể cả tiền cược.' : 'Chưa thấy câu hỏi — chắc tay thì cược cao.'}</div>
      <div className="ns-cuoc-nut">
        {(c.cuoc_muc || [0, 50, 100]).map((m) => (
          <button key={m} className={'ns-cuoc-o' + ((muc ?? 0) === m ? ' on' : '')} disabled={!choi} onClick={() => onCuoc(m)}>
            <b>{m === 0 ? 'Không cược' : '+' + m}</b>
            <span>{m === 0 ? 'an toàn' : `đúng +${m} · sai −${m}`}</span>
          </button>
        ))}
      </div>
      <div className="ns-cuoc-dem">Chốt cược sau {Math.ceil((con || 0) / 1000)} giây</div>
    </div>
  );
}

function ManNghi({ st, con }) {
  const v = VONG.find((x) => x.so === st.vong);
  const gioiThieu = st.vong === 1 && st.stt === 1;
  return (
    <div className="ns-nghi">
      {gioiThieu ? (<>
        <div className="ns-nghi-nho">ĐẤU TRƯỜNG NÓN SƠN</div>
        <div className="ns-nghi-lon">{(st.ghe || []).length} chiến binh · 5 vòng · {st.phien.tong_cau} câu</div>
        <div className="ns-nghi-mo">Máy chủ giữ giờ và chấm điểm. Bấm chọn đáp án là chốt — không đổi được.</div>
      </>) : null}
      {v && (
        <div className={'ns-nghi-vong' + (gioiThieu ? ' phu' : '')}>
          <div className="ns-nghi-so">VÒNG {v.so}</div>
          <div className="ns-nghi-ten">{v.ten}</div>
          <div className="ns-nghi-mo">{v.mo}</div>
          <div className="ns-nghi-luat">{v.luat.map((l) => <span key={l}>{l}</span>)}</div>
        </div>
      )}
      <div className="ns-nghi-dem"><span>{Math.ceil((con || 0) / 1000)}</span> giây</div>
    </div>
  );
}

function ManCho({ st, con, onXinGhe, onRoiGhe, dangXin }) {
  const toi = st.toi || {};
  const chuaMo = st.phien.trang_thai === 'SAN_SANG';
  return (
    <div className="ns-cho">
      <div className="ns-cho-dem">
        <span>Bắt đầu sau</span>
        <b>{demNguoc(con)}</b>
        <span>{gioPhut(st.phien.bat_dau)} · {ngayThang(st.phien.bat_dau)}</span>
      </div>
      <div className={'ns-cho-toi ' + (toi.vai || 'XEM').toLowerCase()}>
        {toi.vai === 'CHOI' && (<><IcCheck width={18} height={18} /><div><b>Bạn đang giữ ghế số {toi.ghe}</b><span>Giữ trang này mở. Rời quá 45 giây trước giờ thi sẽ nhường ghế cho người chờ.</span></div></>)}
        {toi.vai === 'CHO' && (<><IcClock width={18} height={18} /><div><b>Bạn đứng thứ {toi.thu_tu_cho} trong hàng chờ</b><span>Có ghế trống bạn sẽ được xếp vào tự động.</span></div></>)}
        {(toi.vai === 'XEM' || !toi.vai) && (<><IcMat width={18} height={18} /><div><b>Bạn đang ở khán đài</b><span>{toi.moi_ra ? 'Bạn đã được ban tổ chức mời ra khỏi phiên này.' : toi.ql ? 'Tài khoản quản lý theo dõi với vai trò khán giả.' : 'Xin ghế nếu còn chỗ để cùng tranh tài.'}</span></div></>)}
      </div>
      {chuaMo && (
        <div className="ns-cho-nut">
          {toi.vai === 'CHOI' || toi.vai === 'CHO'
            ? <button className="btn btn-ghost" onClick={onRoiGhe} disabled={dangXin}><IcOut width={15} /> {toi.vai === 'CHOI' ? 'Nhường ghế' : 'Rời hàng chờ'}</button>
            : !toi.ql && !toi.moi_ra && <button className="btn btn-ai" onClick={onXinGhe} disabled={dangXin}><IcFlash width={15} /> Xin ghế thi</button>}
        </div>
      )}
      <div className="ns-cho-vong">
        {VONG.map((v) => (
          <div key={v.so} className="ns-cho-v"><span>{v.so}</span><div><b>{v.ten}</b><i>{v.luat[0]}</i></div></div>
        ))}
      </div>
    </div>
  );
}

function ManKetThuc({ st, bxh, toiMa, onRa }) {
  const ds = bxh || (st.ghe || []).map((g) => ({ ...g, diem_vong: null }));
  const top = [ds.find((r) => r.hang === 2), ds.find((r) => r.hang === 1), ds.find((r) => r.hang === 3)];
  const toi = ds.find((r) => r.ma === toiMa);
  return (
    <div className="ns-kt">
      <div className="ns-hoa" aria-hidden="true">{Array.from({ length: 26 }).map((_, i) => <i key={i} style={{ left: (i * 37) % 100 + '%', animationDelay: (i % 9) * 0.32 + 's' }} />)}</div>
      <div className="ns-kt-tit">KẾT QUẢ · {st.phien.ten}</div>
      <div className="ns-buc">
        {top.map((r, i) => r ? (
          <div key={r.ma} className={'ns-buc-o h' + r.hang}>
            <div className="ns-buc-nv"><NhanVat seed={r.ma} mood="thang" vang={r.hang === 1} toi={r.ma === toiMa} /></div>
            <div className="ns-buc-ten">{r.ten}</div>
            <div className="ns-buc-diem">{so(r.diem)}</div>
            <div className="ns-buc-be"><span>{r.hang}</span></div>
          </div>
        ) : <div key={'x' + i} className="ns-buc-o rong" />)}
      </div>
      {toi && (
        <div className="ns-kt-toi">
          <div><span>Hạng của bạn</span><b>{toi.hang}<i>/{ds.length}</i></b></div>
          <div><span>Điểm</span><b>{so(toi.diem)}</b></div>
          <div><span>Câu đúng</span><b>{toi.so_dung}<i>/{st.phien.tong_cau}</i></b></div>
        </div>
      )}
      <BangXH toiMa={toiMa} dong={ds}
        cot={[
          { k: 'ten', ten: 'Người chơi' },
          { k: 'diem', ten: 'Điểm', so: true, ve: (r) => <b>{so(r.diem)}</b> },
          { k: 'so_dung', ten: 'Đúng', so: true },
          ...[1, 2, 3, 4, 5].map((v) => ({ k: 'v' + v, ten: 'V' + v, so: true, gt: (r) => r.diem_vong?.[v] ?? 0, ve: (r) => (r.diem_vong ? so(r.diem_vong[v] || 0) : '—') })),
        ]} />
      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <button className="btn btn-ai" onClick={onRa}><IcMuiTen width={15} /> Về sảnh Nón Sơn</button>
      </div>
    </div>
  );
}

function Phong({ id, vaiXin, onRa }) {
  const { user, baoToast } = useApp();
  const [st, setSt] = useState(null);
  const [loi, setLoi] = useState(null);
  const [den, setDen] = useState(null);
  const [, setNhip] = useState(0);
  const [cauMap, setCauMap] = useState({});
  const [chonTam, setChonTam] = useState({});
  const [cuocTam, setCuocTam] = useState({});
  const [mc, setMc] = useState([]);
  const [amOn, setAmOn] = useState(amDangBat());
  const [bxh, setBxh] = useState(null);
  const [dangXin, setDangXin] = useState(false);
  const truoc = useRef(null);
  const timer = useRef(null);
  const song = useRef(true);
  const cauRef = useRef({});
  const dangLay = useRef(new Set());
  const giayBao = useRef(null);
  const mcId = useRef(0);
  const tk = user.token;

  const noi = useCallback((txt) => { mcId.current += 1; const id2 = mcId.current; setMc((m) => [{ id: id2, txt }, ...m].slice(0, 6)); }, []);

  const layCau = useCallback(async (stt, lan = 0) => {
    if (lan === 0 && dangLay.current.has(stt)) return;
    dangLay.current.add(stt);
    try {
      const c = await goi('fn_dt_cau', { p_token: tk, p_phien: id, p_stt: stt });
      const cu = cauRef.current[stt];
      if (!(cu?.cau?.dapAn && !c.cau?.dapAn)) {
        cauRef.current = { ...cauRef.current, [stt]: c };
        setCauMap(cauRef.current);
      }
      napHinh(hinhCuaCau(c.cau));
      dangLay.current.delete(stt);
    } catch {
      if (lan < 3 && song.current) setTimeout(() => layCau(stt, lan + 1), 350 + lan * 300);
      else dangLay.current.delete(stt);
    }
  }, [tk, id]);
  const thieuCau = (stt, pha) => {
    const c = cauRef.current[stt];
    if (!c) return true;
    return pha === 'TRA_LOI' || pha === 'CONG_BO' ? !c.cau?.dapAn : false;
  };

  const xuLy = useCallback((d) => {
    const p = truoc.current;
    if (p && p.phien.dung !== d.phien.dung && d.pha !== 'KET_THUC') noi(d.phien.dung ? 'Ban tổ chức tạm dừng phiên.' : 'Phiên tiếp tục!');
    const doiPha = !p || p.pha !== d.pha || p.stt !== d.stt;
    if (doiPha) {
      if (d.pha === 'NGHI' && d.vong && (!p || p.vong !== d.vong || p.pha !== 'NGHI')) {
        const v = VONG.find((x) => x.so === d.vong);
        if (p) am.vong();
        if (v) noi(`Vòng ${v.so} — ${v.ten}: ${v.luat.join(' · ')}`);
        if (d.vong === 1 && d.stt === 1) noi(`Chào mừng ${(d.ghe || []).length} chiến binh đến với ${d.phien.ten}!`);
      }
      if (d.pha === 'TRUOC' && p) {
        const c = cauRef.current[d.stt];
        if (d.vong === 5) noi(c?.vang ? 'CÂU VÀNG! Mọi điểm câu cuối nhân đôi — cược đi nào!' : `Đặt cược cho câu ${d.stt}!`);
        else if (d.vong === 2) noi('Nhìn thật kỹ kệ hàng — 6 giây thôi!');
      }
      if (d.pha === 'CONG_BO' && d.cong_bo && p) {
        am.congBo(); setTimeout(() => am.voTay(), 500);
        const ket = d.cong_bo.ket || {};
        const nDung = Object.values(ket).filter((x) => x === true).length;
        const nThi = (d.ghe || []).length;
        if (d.cong_bo.bo) noi('Ban tổ chức đã huỷ câu này — không tính điểm.');
        else if (nDung === 0) noi('Không ai trả lời đúng — câu khó nhất từ đầu phiên!');
        else if (nDung === nThi && nThi > 1) noi('Tất cả đều đúng — một câu khởi động nhẹ nhàng!');
        else noi(`${nDung}/${nThi} người trả lời đúng.`);
        const toi = d.cong_bo.toi;
        if (d.toi?.vai === 'CHOI') {
          if (toi?.dung) setTimeout(() => am.dung(), 250);
          else if (toi) setTimeout(() => am.sai(), 250);
        }
      }
      if (d.pha === 'KET_THUC' && p && p.pha !== 'KET_THUC') {
        am.ketThuc();
        const nhat = (d.ghe || []).find((g) => g.hang === 1);
        if (nhat) noi(`${nhat.ten} vô địch ${d.phien.ten}!`);
      }
    }
    // biến động bảng điểm
    if (p && p.ghe && d.ghe && d.phien.trang_thai === 'DANG') {
      const nhatCu = p.ghe.find((g) => g.hang === 1); const nhatMoi = d.ghe.find((g) => g.hang === 1);
      if (nhatMoi && nhatCu && nhatMoi.ma !== nhatCu.ma && nhatMoi.diem > 0) noi(`${nhatMoi.ten} vươn lên dẫn đầu với ${so(nhatMoi.diem)} điểm!`);
      const ma = d.toi?.ma; const cu = p.ghe.find((g) => g.ma === ma); const moi = d.ghe.find((g) => g.ma === ma);
      if (cu && moi && cu.hang && moi.hang && cu.hang - moi.hang >= 2) noi(`Bạn tăng ${cu.hang - moi.hang} hạng — đang đứng thứ ${moi.hang}!`);
    }
    if (d.cong_bo?.hinh_sau) napHinh(d.cong_bo.hinh_sau);
    truoc.current = d;
  }, [noi]);

  const poll = useCallback(async () => {
    clearTimeout(timer.current);
    const t0 = Date.now();
    let d = null;
    try { d = await goi('fn_dt_trang_thai', { p_token: tk, p_phien: id }); setLoi(null); } catch (e) { setLoi(e.message); }
    if (!song.current) return;
    const t1 = Date.now();
    let cho = 3000; let sau = null;
    if (d) {
      const tre = (t1 - t0) / 2;
      setDen(d.con_ms != null && !d.phien.dung ? t1 - tre + d.con_ms : null);
      xuLy(d); setSt(d);
      if (d.stt && ['TRUOC', 'TRA_LOI', 'CONG_BO'].includes(d.pha) && thieuCau(d.stt, d.pha)) layCau(d.stt);
      const nhip = d.toi?.vai === 'CHOI' ? 2000 : 3000;
      cho = nhip;
      if (d.con_ms != null && !d.phien.dung) {
        cho = Math.max(250, Math.min(nhip, d.con_ms + 160));
        // câu sắp mở: lấy song song với lần hỏi trạng thái kế tiếp
        if (d.con_ms + 160 <= nhip) {
          if (d.pha === 'NGHI') sau = d.stt;
          else if (d.pha === 'TRUOC') sau = d.stt;
          else if (d.pha === 'CONG_BO') { const v = d.phien.vong?.[String(d.vong)]; if (v && d.stt < v.den) sau = d.stt + 1; }
        }
      }
      if (d.pha === 'CHO' && d.con_ms > 60000) cho = 4000;
      if (d.phien.trang_thai === 'XONG') cho = 60000;
      if (d.phien.trang_thai === 'HUY') cho = 60000;
    }
    timer.current = setTimeout(() => {
      if (sau && thieuCau(sau, d.pha === 'TRUOC' ? 'TRA_LOI' : 'TRUOC')) setTimeout(() => layCau(sau), 60);
      poll();
    }, cho);
  }, [tk, id, xuLy, layCau]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    song.current = true;
    (async () => {
      try {
        const r = await goi('fn_dt_vao', { p_token: tk, p_phien: id, p_vai: vaiXin });
        if (r?.ly_do) baoToast(r.ly_do);
      } catch (e) { baoToast(e.message); }
      poll();
    })();
    const n = setInterval(() => setNhip((x) => x + 1), 250);
    return () => { song.current = false; clearTimeout(timer.current); clearInterval(n); };
  }, [id]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (st?.phien?.trang_thai === 'XONG' && !bxh) goi('fn_dt_bxh_phien', { p_token: tk, p_phien: id }).then(setBxh).catch(() => {});
  }, [st?.phien?.trang_thai, bxh, tk, id]);

  const con = den == null ? (st?.con_ms ?? null) : Math.max(0, den - Date.now());
  // tiếng tích tắc 5 giây cuối
  useEffect(() => {
    if (!st || st.pha !== 'TRA_LOI' || con == null || st.phien.dung) { giayBao.current = null; return; }
    const g = Math.ceil(con / 1000);
    if (g !== giayBao.current && g <= 5 && g > 0) { giayBao.current = g; am.tim(); if (g <= 3) am.tichGap(); else am.tich(); }
  });
  // toàn màn hình: che menu app, khoá cuộn trang nền
  useEffect(() => {
    document.body.classList.add('ns-full-mo');
    return () => { document.body.classList.remove('ns-full-mo'); if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); };
  }, []);
  const [hep, setHep] = useState(() => window.innerWidth < 900);
  useEffect(() => { const f = () => setHep(window.innerWidth < 900); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  const coFull = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen;
  const batFull = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const traLoi = async (i) => {
    const stt = st.stt;
    if (chonTam[stt] != null || st.toi?.chon != null) return;
    setChonTam((m) => ({ ...m, [stt]: i })); am.bam();
    try {
      const r = await goi('fn_dt_tra_loi', { p_token: tk, p_phien: id, p_stt: stt, p_chon: i });
      if (r && r.ok === false && r.ly_do) baoToast(r.ly_do);
    } catch (e) {
      baoToast(e.message);
      if (/Chưa mở|tạm dừng/.test(e.message)) setChonTam((m) => { const x = { ...m }; delete x[stt]; return x; });
    }
  };
  const datCuoc = async (m) => {
    const stt = st.stt; const cu = cuocTam[stt];
    setCuocTam((x) => ({ ...x, [stt]: m })); am.bam();
    try { await goi('fn_dt_cuoc', { p_token: tk, p_phien: id, p_stt: stt, p_muc: m }); }
    catch (e) { baoToast(e.message); setCuocTam((x) => ({ ...x, [stt]: cu })); }
  };
  const xinGhe = async () => {
    setDangXin(true);
    try { const r = await goi('fn_dt_vao', { p_token: tk, p_phien: id, p_vai: 'CHOI' }); if (r?.ly_do) baoToast(r.ly_do); await poll(); }
    catch (e) { baoToast(e.message); }
    setDangXin(false);
  };
  const roiGhe = async () => {
    setDangXin(true);
    try { await goi('fn_dt_roi', { p_token: tk, p_phien: id }); await poll(); } catch (e) { baoToast(e.message); }
    setDangXin(false);
  };
  const ra = async () => {
    if (st?.phien?.trang_thai === 'SAN_SANG' && (st.toi?.vai === 'CHOI' || st.toi?.vai === 'CHO')) {
      try { await goi('fn_dt_roi', { p_token: tk, p_phien: id }); } catch { /* bỏ qua */ }
    }
    onRa();
  };

  if (!st) {
    return createPortal(
      <div className="ns-full dang-tai">
        <div className="ns-tai"><div className="ns-tai-vong" /><span>{loi ? 'Không vào được phòng: ' + loi : 'Đang vào phòng thi…'}</span>
          <button className="ns-lui-toi" onClick={onRa}><IcMuiTen width={15} /> Quay lại</button></div>
      </div>, document.body);
  }

  const toi = st.toi || {};
  const choi = toi.vai === 'CHOI' && !toi.moi_ra;
  const c = st.stt ? cauMap[st.stt] : null;
  const chon = st.stt != null ? (toi.chon ?? chonTam[st.stt] ?? null) : null;
  const muc = st.stt != null ? (cuocTam[st.stt] ?? toi.muc ?? 0) : 0;
  const pha = st.pha;
  const cb = st.cong_bo;

  let man;
  if (st.phien.trang_thai === 'HUY') man = <div className="ns-trong-lon"><IcAlert width={30} height={30} /><b>Phiên đã bị huỷ</b></div>;
  else if (pha === 'CHO') man = <ManCho st={st} con={con} onXinGhe={xinGhe} onRoiGhe={roiGhe} dangXin={dangXin} />;
  else if (pha === 'KET_THUC') man = <ManKetThuc st={st} bxh={bxh} toiMa={toi.ma} onRa={ra} />;
  else if (pha === 'NGHI') man = <ManNghi st={st} con={con} />;
  else if (!c || ((pha === 'TRA_LOI' || pha === 'CONG_BO') && !c.cau?.dapAn)) man = <div className="ns-tai"><div className="ns-tai-vong" /><span>Đang mở câu {st.stt}…</span></div>;
  else if (pha === 'TRUOC' && c.cau?.ke) man = <ManKe c={c} con={con} />;
  else if (pha === 'TRUOC' && c.cuoc) man = <ManCuoc c={c} muc={muc} onCuoc={datCuoc} choi={choi} con={con} />;
  else if (pha === 'TRUOC') man = <div className="ns-tai"><span>Chuẩn bị…</span></div>;
  else man = <ManCau c={c} st={st} chon={chon} onChon={traLoi} choi={choi} cb={cb} />;

  const tienDo = pha === 'TRA_LOI' && c ? Math.max(0, Math.min(1, (con || 0) / (c.giay * 1000))) : null;
  const ketQuaToi = pha === 'CONG_BO' && cb && choi
    ? (cb.bo ? { lop: 'huy', chu: 'Câu đã huỷ — không tính điểm' }
      : cb.toi ? (cb.toi.dung ? { lop: 'dung', chu: `CHÍNH XÁC · ${(cb.toi.ms / 1000).toFixed(1)} giây` } : { lop: 'sai', chu: 'CHƯA ĐÚNG' })
      : { lop: 'trong', chu: 'Hết giờ — bạn chưa trả lời' })
    : null;

  const cang = pha === 'TRA_LOI' && !st.phien.dung && con != null && con <= 5000;
  const coBang = st.phien.trang_thai !== 'SAN_SANG' && !hep;

  return createPortal(
    <div className={'ns-full pha-' + pha.toLowerCase() + (cang ? ' cang' : '') + (st.phien.dung ? ' dung' : '')}>
      <div className="ns-den-quet" aria-hidden="true"><i /><i /><b className="tuong trai" /><b className="tuong phai" /></div>
      <div className="ns-top">
        <button className="ns-lui-toi" onClick={ra} title={pha === 'KET_THUC' ? 'Về sảnh' : 'Rời phòng'}><IcMuiTen width={15} /> <span className="chu">{pha === 'KET_THUC' ? 'Về sảnh' : 'Rời phòng'}</span></button>
        <div className="ns-phong-ten">
          <b>{st.phien.ten}</b>
          <span className={'chip ' + (st.phien.loai === 'CK' ? 'gold' : 'teal')}>{LOAI_PHIEN[st.phien.loai]}</span>
          {toi.vai === 'XEM' && <span className="chip dim"><IcMat width={12} /> Khán giả</span>}
          {toi.vai === 'CHOI' && <span className="chip gold">Ghế {toi.ghe}</span>}
        </div>
        {loi && <span className="ns-mat-mang"><IcRefresh width={13} /> Mất kết nối — đang thử lại</span>}
        {coFull && <button className="ns-lui-toi ns-nut-full" onClick={batFull} title="Toàn màn hình"><IcToanMan width={15} /></button>}
      </div>

      <BangDien st={st} con={con} mc={mc} amOn={amOn} setAmOn={setAmOn} />

      <div className={'ns-giua' + (coBang ? ' co-bang' : '')}>
        <div className="ns-man">
          {tienDo != null && <div className="ns-thanh-tg"><i className={tienDo < 0.34 ? 'gap' : ''} style={{ width: tienDo * 100 + '%' }} /></div>}
          {ketQuaToi && <div className={'ns-kq-toi ' + ketQuaToi.lop}>{ketQuaToi.chu}</div>}
          {man}
          {pha === 'CONG_BO' && cb?.giai && <div className="ns-giai-thich"><b>Giải thích:</b> {cb.giai}</div>}
          {pha === 'TRA_LOI' && !choi && <div className="ns-xem-chu"><IcMat width={14} /> Bạn đang xem — đáp án công bố khi hết giờ.</div>}
          {pha === 'TRA_LOI' && choi && chon != null && <div className="ns-xem-chu"><IcCheck width={14} /> Đã chốt. Chờ công bố đáp án…</div>}
          {st.phien.dung && <div className="ns-tam-dung"><IcDung width={34} height={34} /><b>TẠM DỪNG</b><span>Ban tổ chức đang xử lý — đồng hồ đã dừng, không ai bị mất giờ.</span></div>}
          {toi.moi_ra && pha !== 'KET_THUC' && <div className="ns-canh"><IcAlert width={15} /> Bạn đã được ban tổ chức mời ra khỏi phiên — vẫn có thể theo dõi.</div>}
        </div>
        {coBang && <BangSong st={st} toiMa={toi.ma} />}
      </div>

      <div className="ns-duoi">
        <div className="ns-sk-tit"><IcSanKhau width={14} /> {st.phien.trang_thai === 'SAN_SANG' ? `Sân thi · đã vào ${(st.ghe || []).length}/${st.phien.so_ghe} ghế` : 'Sân thi · xếp theo hạng trực tiếp'}</div>
        <SanKhau st={st} toiMa={toi.ma} cang={cang} />
        <KhanDai st={st} cang={cang} hep={hep} />
      </div>
    </div>, document.body);
}
