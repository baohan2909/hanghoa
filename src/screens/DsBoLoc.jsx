import { useEffect, useMemo, useRef, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { useApp } from '../App.jsx';
import { IcLoc, IcCheck } from '../lib/icons.jsx';
import { fmtN } from './dsChung.jsx';

// ============================================================================
// BỘ LỌC RIÊNG (v3.106.0) — người điều phối tự gom nhóm SKU hay chia (theo màu, mẫu…)
//   · Tạo: gõ 1 phần mã (XM156, ĐN052, 156…) -> hiện mọi SKU khớp, gom theo mẫu-màu,
//     chọn từng size / cả nhóm / tất cả -> đặt tên -> lưu (máy chủ, theo người dùng)
//   · Dùng: bấm tên bộ lọc -> bảng chia chỉ còn các SKU đã lưu (kết hợp được với lọc khác)
//   · Sửa: thêm / bớt SKU, đổi tên, xoá bộ lọc
// SQL 197: ds_bo_loc, fn_ds_bo_loc_ds / _luu / _xoa / _tim
// ============================================================================

export const SIZE_THU_TU = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', 'XXXL', '3XL', '4XL', 'FS', 'F'];
// Tách "Mã mẫu-Mã màu-Size": chỉ bỏ đoạn cuối khi đúng là size chuẩn (không đoán)
export function tachSize(ma) {
  const s = ma || '';
  const i = s.lastIndexOf('-');
  if (i > 0) { const z = s.slice(i + 1).toUpperCase(); if (SIZE_THU_TU.includes(z)) return [s.slice(0, i), z]; }
  return [s, ''];
}
export const thuTuSize = (z) => { const i = SIZE_THU_TU.indexOf(z); return i < 0 ? 99 : i; };

const IcNguoi = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" /></svg>);
const IcNhom = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="8.5" r="3" /><path d="M3 19.5c.6-3 2.9-4.7 6-4.7s5.4 1.7 6 4.7" /><path d="M15.5 5.6a3 3 0 0 1 0 5.8 M17.5 14.9c1.9.6 3.1 2.2 3.5 4.6" /></svg>);

// Hook: danh sách bộ lọc của người dùng
export function useBoLoc(nguoi) {
  const [ds, setDs] = useState([]);
  const tai = () => sb.rpc('fn_ds_bo_loc_ds', { p_nguoi: nguoi }).then(({ data }) => setDs(data || []));
  useEffect(() => { tai(); }, [nguoi]);   // eslint-disable-line
  return [ds, tai];
}

// Nút + bảng thả danh sách bộ lọc — bộ lọc CHUNG (Admin quản) + bộ lọc RIÊNG; ẩn theo Tùy chỉnh (v3.112.0)
//   v3.115.0: mỗi dòng có nút Ẩn (chỉ ẩn với tài khoản mình) · tiêu đề nhóm ghi rõ ai thấy
export function MenuBoLoc({ ds, dangDung, onDung, onTao, onSua, an = [], laAdmin = false, onTuyChinh, onAn }) {
  const [mo, setMo] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!mo) return undefined;
    const f = (e) => { if (ref.current && !ref.current.contains(e.target)) setMo(false); };
    document.addEventListener('mousedown', f);
    return () => document.removeEventListener('mousedown', f);
  }, [mo]);
  const hien = ds.filter((b) => !an.includes(b.id));
  const chung = hien.filter((b) => b.chung), rieng = hien.filter((b) => !b.chung);
  const dongBL = (b) => (
    <div key={b.id} className={'bl-dong' + (dangDung === b.id ? ' on' : '')}>
      <button className="bl-ten" onClick={() => { onDung(dangDung === b.id ? null : b.id); setMo(false); }}>
        {dangDung === b.id && <IcCheck />}<b>{b.ten}</b><span>{fmtN(b.ma.length)} SKU</span>
      </button>
      {(b.cua_toi !== false && !b.chung) || laAdmin
        ? <button className="bl-sua" onClick={() => { onSua(b); setMo(false); }} title={b.chung ? 'Sửa / xoá / thôi chia sẻ bộ lọc chung (Admin)' : 'Sửa / xoá / chia sẻ'}>Sửa</button> : null}
      {onAn && <button className="bl-an" onClick={() => { if (dangDung === b.id) onDung(null); onAn(b.id); }}
        title="Ẩn bộ lọc này khỏi menu CỦA ANH (người khác không đổi) — hiện lại ở “Ẩn / hiện bộ lọc…”">Ẩn</button>}
    </div>
  );
  return (
    <div className="bl-menu" ref={ref}>
      <button className={'bl-nut' + (dangDung ? ' on' : '')} onClick={() => setMo((v) => !v)}>
        <IcLoc /> Bộ lọc mã{hien.length > 0 && <i>{hien.length}</i>}
      </button>
      {mo && (
        <div className="bl-tha">
          {chung.length > 0 && <><div className="bl-tha-dau">Bộ lọc chung <em className="bl-chung">· mọi người đều thấy</em></div>{chung.map(dongBL)}</>}
          <div className="bl-tha-dau">Bộ lọc của tôi <em className="bl-chung">· chỉ mình tôi thấy</em></div>
          {rieng.length === 0 && <div className="bl-tha-trong">Chưa có bộ lọc riêng. Tạo bộ lọc để gom các mã hay chia (theo màu, theo mẫu…).</div>}
          {rieng.map(dongBL)}
          <button className="bl-tao" onClick={() => { onTao(); setMo(false); }}>+ Tạo bộ lọc</button>
          {onTuyChinh && <button className="bl-tao phu" onClick={() => { onTuyChinh('bl'); setMo(false); }}>Ẩn / hiện bộ lọc…</button>}
          {an.length > 0 && <div className="bl-tha-trong">Đang ẩn {an.length} bộ lọc — mở Tùy chỉnh để hiện lại.</div>}
        </div>
      )}
    </div>
  );
}

// Hộp tạo / sửa bộ lọc
export function HopBoLoc({ ban, onDong, onXong }) {
  const { user, baoToast } = useApp();
  const nguoi = user?.ma_dang_nhap || '';
  const laAdmin = user?.vai_tro === 'ADMIN';
  const [chung, setChung] = useState(!!ban?.chung);
  const [ten, setTen] = useState(ban?.ten || '');
  const [q, setQ] = useState(ban?.tu_khoa || '');
  const [kq, setKq] = useState(null);
  const [dang, setDang] = useState(false);
  const [chon, setChon] = useState(() => Object.fromEntries((ban?.ma || []).map((x) => [x.b, x])));
  const [gui, setGui] = useState(false);
  const oTim = useRef(null);
  useEffect(() => { setTimeout(() => oTim.current?.focus(), 50); }, []);

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) { setKq(null); return undefined; }
    setDang(true);
    const h = setTimeout(() => sb.rpc('fn_ds_bo_loc_tim', { p_q: t, p_gioi_han: 400 }).then(({ data, error }) => {
      setDang(false);
      if (error) { baoToast('Lỗi tìm: ' + error.message); return; }
      setKq(data || []);
    }), 250);
    return () => clearTimeout(h);
  }, [q]);   // eslint-disable-line

  // gom kết quả theo mẫu-màu (bỏ size)
  const nhom = useMemo(() => {
    const m = {};
    (kq || []).forEach((x) => {
      const [g, z] = tachSize(x.m);
      (m[g] = m[g] || { g, n3: x.n3, ds: [] }).ds.push({ ...x, z });
    });
    Object.values(m).forEach((g) => g.ds.sort((a, b) => thuTuSize(a.z) - thuTuSize(b.z) || a.m.localeCompare(b.m)));
    return Object.values(m).sort((a, b) => a.g.localeCompare(b.g));
  }, [kq]);
  const daChon = Object.values(chon);
  const nhomChon = useMemo(() => {
    const m = {};
    daChon.forEach((x) => { const [g, z] = tachSize(x.m); (m[g] = m[g] || []).push({ ...x, z }); });
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]));
  }, [chon]);   // eslint-disable-line

  const bat = (x) => setChon((c) => { const n = { ...c }; if (n[x.b]) delete n[x.b]; else n[x.b] = { b: x.b, m: x.m }; return n; });
  const batNhom = (g) => setChon((c) => {
    const n = { ...c }; const du = g.ds.every((x) => n[x.b]);
    g.ds.forEach((x) => { if (du) delete n[x.b]; else n[x.b] = { b: x.b, m: x.m }; });
    return n;
  });
  const chonHet = (co) => setChon((c) => { const n = { ...c }; (kq || []).forEach((x) => { if (co) n[x.b] = { b: x.b, m: x.m }; else delete n[x.b]; }); return n; });

  const luu = async () => {
    if (!ten.trim()) { baoToast('Đặt tên cho bộ lọc'); return; }
    if (!daChon.length) { baoToast('Chưa chọn SKU nào'); return; }
    setGui(true);
    const ma = daChon.sort((a, b) => a.m.localeCompare(b.m));
    // Admin: bộ lọc chung (hoặc đang sửa bộ lọc chung) đi qua hàm kiểm quyền Admin trên máy chủ
    const quaAdmin = laAdmin && (chung || ban?.chung);
    const { data, error } = quaAdmin
      ? await sb.rpc('fn_ds_bo_loc_chung', { p_token: user?.token, p_id: ban?.id || null, p_ten: ten.trim(), p_ma: ma, p_tu_khoa: q.trim() || null, p_chung: chung })
      : await sb.rpc('fn_ds_bo_loc_luu', { p_nguoi: nguoi, p_id: ban?.id || null, p_ten: ten.trim(), p_ma: ma, p_tu_khoa: q.trim() || null });
    setGui(false);
    if (error) { baoToast('Không lưu được: ' + error.message); return; }
    baoToast(`Đã lưu “${ten.trim()}” — ${daChon.length} SKU · ${chung ? 'MỌI NGƯỜI đều thấy' : 'chỉ mình anh thấy'}`);
    onXong(data);
  };
  const xoa = async () => {
    if (!window.confirm(ban.chung ? `Xoá bộ lọc CHUNG “${ban.ten}”? Mọi người sẽ không còn thấy bộ lọc này.` : `Xoá bộ lọc “${ban.ten}”?`)) return;
    const { error } = ban.chung
      ? await sb.rpc('fn_ds_bo_loc_chung_xoa', { p_token: user?.token, p_id: ban.id })
      : await sb.rpc('fn_ds_bo_loc_xoa', { p_nguoi: nguoi, p_id: ban.id });
    if (error) { baoToast('Không xoá được: ' + error.message); return; }
    baoToast('Đã xoá bộ lọc'); onXong(null, true);
  };

  const soKq = kq?.length || 0;
  const daChonTrongKq = (kq || []).filter((x) => chon[x.b]).length;
  return (
    <div className="kt-modal" onMouseDown={(e) => { if (e.target === e.currentTarget) onDong(); }}>
      <div className="bl-hop">
        <div className="bl-hop-dau">
          <div><small>{ban ? (ban.chung ? 'Sửa bộ lọc CHUNG (Admin)' : 'Sửa bộ lọc') : 'Tạo bộ lọc mới'}</small>
            <input className="bl-ten-o" value={ten} onChange={(e) => setTen(e.target.value)} placeholder="Tên bộ lọc (vd Màu xám 156)" /></div>
          <button className="kt-dong" onClick={onDong}>×</button>
        </div>
        {/* v3.115.0: Ai thấy bộ lọc này — chọn rõ ràng thay cho ô tick dưới chân hộp */}
        <div className="bl-ai-thay">
          <b>Ai thấy bộ lọc này?</b>
          <div className="bl-ai-chon" role="radiogroup" aria-label="Ai thấy bộ lọc này">
            <button role="radio" aria-checked={!chung} className={!chung ? 'on' : ''} onClick={() => setChung(false)}>
              <IcNguoi /> Chỉ mình tôi</button>
            <button role="radio" aria-checked={chung} className={chung ? 'on' : ''} disabled={!laAdmin} onClick={() => laAdmin && setChung(true)}
              title={laAdmin ? 'Mọi tài khoản đều thấy trong menu Bộ lọc mã; ai không cần thì tự Ẩn' : 'Chỉ tài khoản Quản trị (Admin) được chia sẻ bộ lọc cho mọi người'}>
              <IcNhom /> Mọi người thấy</button>
          </div>
          <small>{chung ? 'Hiện trong mục “Bộ lọc chung” của mọi tài khoản · chỉ Admin sửa / xoá · ai không dùng thì tự ẩn'
            : laAdmin ? 'Chỉ hiện trong menu của anh' : 'Chỉ hiện trong menu của anh · muốn chia sẻ cho mọi người: nhờ Admin'}</small>
        </div>
        <div className="bl-hop-than">
          {/* ---- Tìm & chọn ---- */}
          <div className="bl-tim">
            <div className="bl-tim-o">
              <input ref={oTim} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Gõ 1 phần mã: XM156, ĐN052, 156, TUIGIAY…" />
              <span>{dang ? 'đang tìm…' : kq ? `${fmtN(soKq)} SKU · ${nhom.length} nhóm` : 'gõ ít nhất 2 ký tự'}</span>
            </div>
            {soKq > 0 && (
              <div className="bl-tim-nut">
                <button className="btn btn-ai" onClick={() => chonHet(true)}><IcCheck /> Chọn tất cả {fmtN(soKq)} SKU</button>
                {daChonTrongKq > 0 && <button className="btn btn-ghost" onClick={() => chonHet(false)}>Bỏ chọn kết quả này</button>}
              </div>
            )}
            <div className="bl-kq">
              {kq && soKq === 0 && <div className="dsl-trong">Không có SKU nào chứa “{q}”.</div>}
              {nhom.map((g) => {
                const du = g.ds.every((x) => chon[x.b]); const mot = g.ds.some((x) => chon[x.b]);
                return (
                  <div key={g.g} className={'bl-nhom' + (du ? ' du' : mot ? ' mot' : '')}>
                    <button className="bl-nhom-dau" onClick={() => batNhom(g)} title="Chọn / bỏ cả nhóm (mọi size)">
                      <span className="bl-o">{du ? <IcCheck /> : mot ? '–' : ''}</span>
                      <b>{g.g}</b><small>{g.n3 || ''} · {g.ds.length} SKU</small>
                    </button>
                    <div className="bl-size">
                      {g.ds.map((x) => (
                        <button key={x.b} className={chon[x.b] ? 'on' : ''} onClick={() => bat(x)} title={x.m}>{x.z || x.m.slice(g.g.length) || x.m}</button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {/* ---- Đã chọn ---- */}
          <div className="bl-chon">
            <div className="bl-chon-dau"><b>Đã chọn {fmtN(daChon.length)} SKU</b>
              {daChon.length > 0 && <button onClick={() => setChon({})}>Xoá hết</button>}</div>
            <div className="bl-chon-ds">
              {daChon.length === 0 && <div className="bl-tha-trong">Bấm size hoặc cả nhóm bên trái để thêm vào bộ lọc.</div>}
              {nhomChon.map(([g, ds]) => (
                <div key={g} className="bl-chon-nhom">
                  <b>{g}</b>
                  <div>{ds.sort((a, b) => thuTuSize(a.z) - thuTuSize(b.z)).map((x) => (
                    <span key={x.b}>{x.z || x.m}<button onClick={() => bat(x)} title="Bỏ">×</button></span>
                  ))}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="bl-hop-chan">
          {ban && (!ban.chung || laAdmin) && <button className="btn btn-ghost bl-xoa" onClick={xoa}>Xoá bộ lọc</button>}
          <span />
          <button className="btn btn-ghost" onClick={onDong}>Huỷ</button>
          <button className="btn btn-ai" disabled={gui} onClick={luu}><IcCheck /> {gui ? 'Đang lưu…' : ban ? 'Lưu thay đổi' : 'Lưu bộ lọc'}</button>
        </div>
      </div>
    </div>
  );
}
