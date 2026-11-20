import { useCallback, useEffect, useRef, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { IcCheck, IcLoc } from '../lib/icons.jsx';
import { fmtN, lsGet, lsSet } from './dsChung.jsx';

// ============================================================================
// TÙY CHỈNH BÀN LÀM VIỆC THEO TÀI KHOẢN (v3.112.0)
//   · Bộ lọc nhanh: ẩn / hiện, kéo thả đổi thứ tự
//   · Bộ lọc của tôi: lưu tổ hợp lọc đang dùng (chip + ô lọc cột + tab + sắp xếp) thành 1 nút
//   · Bộ lọc mã: ẩn bộ lọc chung khỏi menu; Admin đặt / bỏ chung, sửa, xoá bộ lọc chung
//   · Cột bảng: ẩn / hiện, kéo thả đổi thứ tự (không xoá dữ liệu — cột ẩn vẫn tính như cũ)
//   Lưu: máy chủ ds_tuy_chinh (SQL 202) theo tài khoản + bản sao trên máy (chạy được cả khi chưa có SQL 202)
// ============================================================================

export function useTuyChinh(nguoi, khoa) {
  const kLs = 'tc.' + (nguoi || '-') + '.' + khoa;
  const [tc, setTc] = useState(() => lsGet(kLs) || {});
  const [mayChu, setMayChu] = useState(null);   // null: chưa biết · true: lưu được máy chủ · false: chỉ lưu trên máy
  const hen = useRef(null);
  useEffect(() => {
    let huy = false;
    sb.rpc('fn_ds_tc_lay', { p_nguoi: nguoi }).then(({ data, error }) => {
      if (huy) return;
      setMayChu(!error);
      if (!error && data && data[khoa]) { setTc(data[khoa]); lsSet(kLs, data[khoa]); }
    });
    return () => { huy = true; };
  }, [nguoi, khoa]);   // eslint-disable-line
  const dat = useCallback((fn) => {
    setTc((cu) => {
      const moi = typeof fn === 'function' ? fn(cu) : fn;
      lsSet(kLs, moi);
      clearTimeout(hen.current);
      hen.current = setTimeout(() => {
        sb.rpc('fn_ds_tc_luu', { p_nguoi: nguoi, p_khoa: khoa, p_du_lieu: moi }).then(({ error }) => setMayChu(!error));
      }, 700);
      return moi;
    });
  }, [nguoi, khoa, kLs]);
  return [tc, dat, mayChu];
}

// Ghép danh sách mặc định [{k, an?}] với thứ tự / ẩn hiện đã lưu [{k, hien}] — mục mới thêm vào đúng chỗ mặc định
export function sapTheo(macDinh, luu) {
  if (!Array.isArray(luu) || !luu.length) return macDinh.map((d) => ({ ...d, hien: !d.an }));
  const daCo = new Map(luu.map((x) => [x.k, x]));
  const ra = luu.filter((x) => macDinh.some((d) => d.k === x.k)).map((x) => ({ ...macDinh.find((d) => d.k === x.k), hien: x.hien !== false }));
  macDinh.forEach((d, i) => {
    if (daCo.has(d.k)) return;
    const truoc = macDinh.slice(0, i).reverse().find((t) => ra.some((r) => r.k === t.k));
    const vt = truoc ? ra.findIndex((r) => r.k === truoc.k) + 1 : 0;
    ra.splice(vt, 0, { ...d, hien: !d.an });
  });
  ra.forEach((x) => { if (x.khoa) x.hien = true; });
  return ra;
}
const gon = (ds) => ds.map((x) => ({ k: x.k, hien: !!x.hien }));

// Danh sách kéo thả + bật tắt
function DsKeo({ ds, onDoi }) {
  const [keo, setKeo] = useState(null);
  const doiCho = (i, j) => { if (j < 0 || j >= ds.length) return; const n = [...ds]; const [m] = n.splice(i, 1); n.splice(j, 0, m); onDoi(n); };
  return (
    <div className="tc-ds">
      {ds.map((x, i) => (
        <div key={x.k} className={'tc-dong' + (keo === i ? ' keo' : '') + (x.hien ? '' : ' tat')} draggable
          onDragStart={(e) => { setKeo(i); e.dataTransfer.effectAllowed = 'move'; }}
          onDragOver={(e) => { e.preventDefault(); if (keo == null || keo === i) return; doiCho(keo, i); setKeo(i); }}
          onDragEnd={() => setKeo(null)}>
          <span className="tc-keo" title="Kéo để đổi thứ tự">⋮⋮</span>
          <div className="tc-ten"><b>{x.ten}</b>{x.mo && <small>{x.mo}</small>}</div>
          <div className="tc-mui">
            <button onClick={() => doiCho(i, i - 1)} disabled={i === 0} title="Lên">↑</button>
            <button onClick={() => doiCho(i, i + 1)} disabled={i === ds.length - 1} title="Xuống">↓</button>
          </div>
          <label className={'tc-bat' + (x.khoa ? ' khoa' : '')} title={x.khoa ? 'Luôn hiện' : x.hien ? 'Đang hiện — bấm để ẩn' : 'Đang ẩn — bấm để hiện'}>
            <input type="checkbox" checked={!!x.hien} disabled={!!x.khoa}
              onChange={() => onDoi(ds.map((y, j) => (j === i ? { ...y, hien: !y.hien } : y)))} />
            <i />
          </label>
        </div>
      ))}
    </div>
  );
}

// Hộp Tùy chỉnh Bàn làm việc
//   locDs / cotDs: danh sách đã ghép (sapTheo) — mỗi mục {k, ten, mo, hien, khoa}
//   hienTai: tổ hợp lọc đang dùng {loc, locCot, nguonXem, sap} -> lưu thành "Bộ lọc của tôi"
export function HopTuyChinh({ tc, datTc, locDs, cotDs, locMacDinh, cotMacDinh, dsBoLoc, laAdmin, token, taiBoLoc, hienTai, moTaHienTai,
  mayChu, onSuaBoLoc, onDong, baoToast, tabDau }) {
  const [tab, setTab] = useState(tabDau || 'loc');
  const [tenMau, setTenMau] = useState('');
  const an = tc.bo_loc_an || [];
  const mau = tc.mau || [];
  const coLoc = hienTai && ((hienTai.loc || []).length || Object.values(hienTai.locCot || {}).some((v) => String(v || '').trim()) || hienTai.nguonXem !== 'tat');
  const luuMau = () => {
    const ten = tenMau.trim() || moTaHienTai || 'Bộ lọc của tôi';
    datTc((t) => ({ ...t, mau: [...(t.mau || []), { id: Date.now().toString(36), ten, ...hienTai }] }));
    setTenMau(''); baoToast(`Đã lưu “${ten}” — bấm nút ★ ${ten} trên thanh lọc để dùng lại`);
  };
  const datChung = async (b, chung) => {
    const { error } = await sb.rpc('fn_ds_bo_loc_chung', { p_token: token, p_id: b.id, p_ten: null, p_ma: null, p_tu_khoa: null, p_chung: chung });
    if (error) { baoToast('Không đổi được: ' + error.message); return; }
    baoToast(chung ? `“${b.ten}” đã thành bộ lọc chung — mọi tài khoản đều thấy` : `“${b.ten}” không còn là bộ lọc chung`);
    taiBoLoc();
  };
  const TAB = [['loc', 'Bộ lọc nhanh'], ['mau', 'Bộ lọc của tôi'], ['bl', 'Bộ lọc mã'], ['cot', 'Cột bảng']];
  return (
    <div className="kt-modal" onMouseDown={(e) => { if (e.target === e.currentTarget) onDong(); }}>
      <div className="tc-hop">
        <div className="tc-dau">
          <div><b>Tùy chỉnh Bàn làm việc</b>
            <small>{mayChu === false ? 'Đang lưu trên máy này (máy chủ chưa có SQL 202)' : 'Tự lưu theo tài khoản — đăng nhập máy khác vẫn giữ'}</small></div>
          <button className="kt-dong" onClick={onDong}>×</button>
        </div>
        <div className="tc-tab">
          {TAB.map(([k, t]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t}</button>)}
        </div>
        <div className="tc-than">
          {tab === 'loc' && (<>
            <p className="tc-ghi">Tắt nút lọc nhanh không dùng — <b>chỉ ẩn trên tài khoản của anh</b>, người khác không đổi. Kéo ⋮⋮ (hoặc ↑ ↓) để đổi thứ tự.</p>
            <DsKeo ds={locDs} onDoi={(n) => datTc((t) => ({ ...t, loc: gon(n) }))} />
            <button className="tc-mac-dinh" onClick={() => datTc((t) => ({ ...t, loc: gon(locMacDinh.map((d) => ({ ...d, hien: !d.an }))) }))}>Khôi phục mặc định</button>
          </>)}
          {tab === 'mau' && (<>
            <p className="tc-ghi">Lưu tổ hợp lọc đang dùng (nút lọc + ô lọc cột + tab nguồn + sắp xếp) thành 1 nút ★ trên thanh lọc.</p>
            <div className="tc-luu-mau">
              <input value={tenMau} onChange={(e) => setTenMau(e.target.value)} placeholder={moTaHienTai || 'Tên bộ lọc, vd Bán chạy tồn thấp 250k'}
                onKeyDown={(e) => { if (e.key === 'Enter' && coLoc) luuMau(); }} />
              <button className="btn btn-ai" disabled={!coLoc} onClick={luuMau} title={coLoc ? '' : 'Chọn ít nhất 1 lọc trên bàn làm việc trước'}><IcCheck /> Lưu bộ lọc đang dùng</button>
            </div>
            {!coLoc && <div className="tc-ghi nho">Đang không lọc gì — chọn lọc trên bàn làm việc rồi quay lại đây để lưu.</div>}
            <div className="tc-ds">
              {mau.length === 0 && <div className="tc-trong">Chưa có bộ lọc riêng.</div>}
              {mau.map((m, i) => (
                <div key={m.id} className="tc-dong">
                  <span className="tc-sao">★</span>
                  <div className="tc-ten">
                    <input className="tc-ten-o" value={m.ten} onChange={(e) => datTc((t) => ({ ...t, mau: t.mau.map((x) => (x.id === m.id ? { ...x, ten: e.target.value } : x)) }))} />
                    <small>{[...(m.loc || []).map((k) => locMacDinh.find((d) => d.k === k)?.ten || k),
                      ...Object.entries(m.locCot || {}).filter(([, v]) => String(v || '').trim()).map(([k, v]) => `${k}: ${v}`),
                      m.nguonXem && m.nguonXem !== 'tat' ? `tab ${m.nguonXem === 'pk' ? 'Phụ kiện' : 'Hàng Sale'}` : null].filter(Boolean).join(' · ') || 'không lọc'}</small>
                  </div>
                  <div className="tc-mui">
                    <button onClick={() => datTc((t) => { const n = [...t.mau]; if (i > 0) [n[i - 1], n[i]] = [n[i], n[i - 1]]; return { ...t, mau: n }; })} disabled={i === 0}>↑</button>
                    <button className="xoa" onClick={() => datTc((t) => ({ ...t, mau: t.mau.filter((x) => x.id !== m.id) }))} title="Xoá">×</button>
                  </div>
                </div>
              ))}
            </div>
          </>)}
          {tab === 'bl' && (<>
            <p className="tc-ghi">Bộ lọc chung do Admin tạo: anh chỉ ẩn / hiện được. Bộ lọc của anh: sửa, xoá thoải mái.{laAdmin ? ' (Admin: đặt / bỏ chung, sửa, xoá bộ lọc chung.)' : ''}</p>
            <div className="tc-ds">
              {dsBoLoc.length === 0 && <div className="tc-trong">Chưa có bộ lọc mã nào.</div>}
              {dsBoLoc.map((b) => {
                const hien = !an.includes(b.id);
                const cuaToi = b.cua_toi !== false && !b.chung;
                return (
                  <div key={b.id} className={'tc-dong' + (hien ? '' : ' tat')}>
                    <span className="tc-sao"><IcLoc /></span>
                    <div className="tc-ten"><b>{b.ten} {b.chung ? <i className="tc-nhan chung">Chung</i> : <i className="tc-nhan">Riêng</i>}</b>
                      <small>{fmtN(b.ma.length)} SKU{b.chung && b.nguoi ? ` · tạo bởi ${b.nguoi}` : ''}</small></div>
                    <div className="tc-mui rong">
                      {(cuaToi || laAdmin) && <button onClick={() => onSuaBoLoc(b)}>Sửa</button>}
                      {laAdmin && <button onClick={() => datChung(b, !b.chung)}>{b.chung ? 'Bỏ chung' : 'Đặt chung'}</button>}
                    </div>
                    <label className="tc-bat" title={hien ? 'Đang hiện trong menu — bấm để ẩn' : 'Đang ẩn — bấm để hiện'}>
                      <input type="checkbox" checked={hien} onChange={() => datTc((t) => ({ ...t, bo_loc_an: hien ? [...(t.bo_loc_an || []), b.id] : (t.bo_loc_an || []).filter((x) => x !== b.id) }))} />
                      <i />
                    </label>
                  </div>
                );
              })}
            </div>
          </>)}
          {tab === 'cot' && (<>
            <p className="tc-ghi">Ẩn cột chỉ ẩn khỏi màn hình — số liệu và cách tính vẫn giữ nguyên. Cột <b>Chia thêm</b> luôn hiện.</p>
            <DsKeo ds={cotDs} onDoi={(n) => datTc((t) => ({ ...t, cot: gon(n) }))} />
            <button className="tc-mac-dinh" onClick={() => datTc((t) => ({ ...t, cot: gon(cotMacDinh.map((d) => ({ ...d, hien: !d.an }))) }))}>Khôi phục mặc định</button>
          </>)}
        </div>
        <div className="tc-chan">
          <span>{mayChu === false ? 'Chỉ lưu trên máy này' : '✓ Tự lưu'}</span>
          <button className="btn btn-ai" onClick={onDong}><IcCheck /> Xong</button>
        </div>
      </div>
    </div>
  );
}
