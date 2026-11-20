import { useEffect, useMemo, useRef, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { useApp } from '../App.jsx';
import { IcCheck, IcDown, IcAlert, IcSearch } from '../lib/icons.jsx';
import { AnhSP } from './DsBanChia.jsx';
import { TrangThaiLuu, baoLoiXacNhan, fmtN, lsGet, lsSet, so, tenNgan, useNhap, xuatHaiFile, tenPhieu, soFile, useHoiGhiChu } from './dsChung.jsx';
import { useLamTron, quyTac, chiaTyTrong, kGia, moTaMuc } from './dsLamTron.js';

// ============================================================================
// CHIA HÀNG MỚI CHO ĐỘI SALE (v3.112.0 — làm lại theo giao diện "Hàng mới" của Chia hàng cửa hàng)
//   · Mỗi mã 1 thẻ: Mã hàng mới · Mã tham chiếu (tùy chọn) · Tổng SL · Min/đội · Max/đội · Chia
//   · Tỷ trọng: bán mã tham chiếu theo đội / sức bán đội / bán chính mã này / chia đều
//   · Bảng kết quả từng đội: Đang có (tồn) · Bán (cơ sở) · Tỷ lệ · ĐỀ NGHỊ (AI) · THỰC CHIA (sửa) · Sau chia
//   · Làm tròn theo giá sale (250k 5,10… · 350k 3,5,10… · ≥400k 5,10…), không vượt kho SA
//   · Bảng đối soát đội × mã · Xác nhận = giữ tồn SA + xuất file (ghi chú ở dòng 1)
//   Nháp 'loat' (giữ tương thích bản cũ): {doi, ma, sua:{'bc|đội': n}, cfg:{bc:{tong,min,max,tc,cs}}, dx:{bc:{đội:n}}}
//   SQL: fn_ds_sp_tim · fn_ds_chia_loat (202: thêm giá) · fn_ds_ban_tham_chieu (202) · fn_td_goi_y · fn_ds_xac_nhan
// ============================================================================
const CO_SO = [['tc', 'Mã tham chiếu'], ['ban', 'Sức bán đội'], ['ma', 'Bán mã này'], ['deu', 'Chia đều']];

export default function DsChiaMoi({ dsDoi, ts }) {
  const { user, baoToast } = useApp();
  const nguoi = user?.ma_dang_nhap || '';
  const cuaSo = ts.cua_so || 28;
  const cfgLT = useLamTron();
  const [nhap, datNhap, ttLuu, xoaNhap] = useNhap(nguoi, 'loat', { doi: [], ma: [], sua: {}, cfg: {}, dx: {} });
  const chonDoi = nhap.doi || [], dsMa = nhap.ma || [], sua = nhap.sua || {}, cfg = nhap.cfg || {}, dx = nhap.dx || {};
  const [sp, setSp] = useState([]);
  const [tcDl, setTcDl] = useState({});        // mã tham chiếu -> {tc, tong, so_sku}
  const [tongDoi, setTongDoi] = useState(null); // sức bán đội (mọi mã bán, trừ phụ kiện)
  const [chiMoi, setChiMoi] = useState(false);
  const [gui, setGui] = useState(false);
  const [moDS, setMoDS] = useState(false);
  const [xong, setXong] = useState(null);
  const [hoiGhiChu, hopGhiChu] = useHoiGhiChu();
  const doiSx = useMemo(() => [...dsDoi].sort((a, b) => a.ma_ch.localeCompare(b.ma_ch)), [dsDoi]);
  const tenDoi = (m) => tenNgan(dsDoi.find((d) => d.ma_ch === m)?.ten || m);

  // ---------- dữ liệu ----------
  const taiSp = () => {
    if (!dsMa.length) { setSp([]); return; }
    sb.rpc('fn_ds_chia_loat', { p_doi: chonDoi.length ? chonDoi : ['-'], p_barcodes: dsMa, p_cua_so: cuaSo })
      .then(({ data, error }) => { if (error) baoToast('Lỗi: ' + error.message); else setSp(data || []); });
  };
  useEffect(() => { taiSp(); }, [dsMa.join(','), chonDoi.join(',')]);   // eslint-disable-line
  const layTc = (q) => {
    const k = String(q || '').trim().toUpperCase();
    if (!k || tcDl[k]) return;
    sb.rpc('fn_ds_ban_tham_chieu', { p_q: k, p_cua_so: cuaSo }).then(({ data, error }) => {
      setTcDl((m) => ({ ...m, [k]: error ? { loi: true } : data }));
      if (!error && data?.tong) setTongDoi(data.tong);
    });
  };
  useEffect(() => {
    // sức bán đội: lấy kèm lần gọi tham chiếu đầu tiên (hàm 202); chưa có mã tham chiếu thì gọi 1 lần với mã rỗng
    if (!tongDoi) sb.rpc('fn_ds_ban_tham_chieu', { p_q: '', p_cua_so: cuaSo }).then(({ data, error }) => setTongDoi(error ? {} : (data?.tong || {})));
    Object.values(cfg).forEach((c) => c?.tc && layTc(c.tc));
  }, [JSON.stringify(Object.values(cfg).map((c) => c?.tc))]);   // eslint-disable-line

  const spMap = useMemo(() => Object.fromEntries(sp.map((r) => [r.barcode, r])), [sp]);
  const k = (bc, m) => bc + '|' + m;
  const gt = (bc, m) => sua[k(bc, m)] || 0;

  // ---------- cơ sở tỷ trọng + chia 1 mã ----------
  const coSoCua = (bc) => {
    const c = cfg[bc] || {};
    if (c.cs) return c.cs;
    if (c.tc) return 'tc';
    const r = spMap[bc];
    return r && chonDoi.some((m) => (r.o?.[m]?.[1] || 0) > 0) ? 'ma' : 'ban';
  };
  const trongSo = (bc, m) => {
    const cs = coSoCua(bc), r = spMap[bc], c = cfg[bc] || {};
    if (cs === 'tc') { const d = tcDl[String(c.tc || '').trim().toUpperCase()]; return d?.tc?.[m] || 0; }
    if (cs === 'ma') return r?.o?.[m]?.[1] || 0;
    if (cs === 'ban') return tongDoi?.[m] || 0;
    return 1;
  };
  const qtCua = (r) => quyTac({ pk: /phụ kiện|phu kien/i.test(r?.nganh_1 || ''), n3: r?.nganh_3, mtc: r?.ma_tham_chieu, gia: r?.gia }, cfgLT);
  const keHoach = (bc) => {
    const r = spMap[bc]; const c = cfg[bc] || {};
    if (!r || !chonDoi.length) return null;
    const kho = (r.kd1 || 0) + (r.kd2 || 0);
    const tong = so(c.tong);
    const T = Math.min(tong, kho);
    let w = chonDoi.map((m) => ({ k: m, w: trongSo(bc, m) }));
    const W = w.reduce((s, x) => s + x.w, 0);
    const chiaDeu = W <= 0;
    if (chiaDeu) w = w.map((x) => ({ ...x, w: 1 }));
    const kq = chiaTyTrong(T, w.map((x) => ({ ...x, min: so(c.min) || 0, max: so(c.max) || Infinity })), qtCua(r));
    return { ...kq, T, tong, kho, W: chiaDeu ? chonDoi.length : W, chiaDeu, w: Object.fromEntries(w.map((x) => [x.k, x.w])) };
  };
  const chiaMa = (bc, im) => {
    const kh = keHoach(bc);
    if (!kh) return;
    if (!kh.tong) { if (!im) baoToast('Nhập Tổng SL trước khi chia'); return false; }
    datNhap((d) => {
      const s = { ...(d.sua || {}) };
      chonDoi.forEach((m) => { if (kh.a[m] > 0) s[k(bc, m)] = kh.a[m]; else delete s[k(bc, m)]; });
      return { ...d, sua: s, dx: { ...(d.dx || {}), [bc]: kh.a } };
    });
    if (!im) {
      const r = spMap[bc];
      baoToast(`${r?.ma_tham_chieu || bc}: chia ${fmtN(kh.T)} cho ${chonDoi.filter((m) => kh.a[m] > 0).length} đội`
        + (kh.tong > kh.kho ? ` — tổng ${fmtN(kh.tong)} vượt kho ${fmtN(kh.kho)}, chỉ chia tối đa kho` : '')
        + (kh.lech ? ` · lệch ${kh.lech} do làm tròn` : '') + (kh.chiaDeu ? ' · chưa có số bán → chia đều' : ''));
    }
    return true;
  };
  const chiaTatCa = () => {
    const ds = dsMa.filter((bc) => so(cfg[bc]?.tong) > 0);
    if (!ds.length) { baoToast('Chưa mã nào có Tổng SL'); return; }
    ds.forEach((bc) => chiaMa(bc, true));
    baoToast(`Đã chia tự động ${ds.length} mã cho ${chonDoi.length} đội — sửa số ở cột Thực chia nếu cần`);
  };

  // ---------- sửa nháp ----------
  const datCfg = (bc, o) => datNhap((d) => ({ ...d, cfg: { ...(d.cfg || {}), [bc]: { ...((d.cfg || {})[bc] || {}), ...o } } }));
  const themMa = (bc, macDinh) => {
    if (dsMa.includes(bc)) { baoToast('Mã đã có trong danh sách'); return; }
    datNhap((d) => ({ ...d, ma: [...(d.ma || []), bc], cfg: { ...(d.cfg || {}), [bc]: { ...(macDinh || {}) } } }));
  };
  const boMa = (bc) => datNhap((d) => {
    const s = { ...(d.sua || {}) }; Object.keys(s).forEach((x) => { if (x.startsWith(bc + '|')) delete s[x]; });
    const c = { ...(d.cfg || {}) }; delete c[bc]; const x = { ...(d.dx || {}) }; delete x[bc];
    return { ...d, ma: (d.ma || []).filter((y) => y !== bc), sua: s, cfg: c, dx: x };
  });
  const togDoi = (m) => datNhap((d) => ({ ...d, doi: (d.doi || []).includes(m) ? d.doi.filter((x) => x !== m) : [...(d.doi || []), m].sort() }));
  const datO = (bc, m, v) => datNhap((d) => { const s = { ...(d.sua || {}) }; const n = so(v); if (n) s[k(bc, m)] = n; else delete s[k(bc, m)]; return { ...d, sua: s }; });
  const apDeNghi = (bc) => datNhap((d) => {
    const s = { ...(d.sua || {}) }; const a = (d.dx || {})[bc] || {};
    chonDoi.forEach((m) => { if (a[m] > 0) s[k(bc, m)] = a[m]; else delete s[k(bc, m)]; });
    return { ...d, sua: s };
  });
  const xoaTatCa = async () => {
    if (!window.confirm('Xoá mọi mã và số đang chia hàng mới? (giữ danh sách đội)')) return;
    datNhap((d) => ({ doi: d.doi || [], ma: [], sua: {}, cfg: {}, dx: {} }));
  };

  // ---------- tổng ----------
  const dongMa = dsMa.map((bc) => {
    const r = spMap[bc];
    const tong = chonDoi.reduce((a, m) => a + gt(bc, m), 0);
    const kho = r ? (r.kd1 || 0) + (r.kd2 || 0) : 0;
    const dn = chonDoi.reduce((a, m) => a + (dx[bc]?.[m] || 0), 0);
    return { bc, r, tong, kho, con: kho - tong, dn, sua: dx[bc] && chonDoi.some((m) => (dx[bc]?.[m] || 0) !== gt(bc, m)) };
  });
  const tongAll = dongMa.reduce((a, x) => a + x.tong, 0);
  const vuot = dongMa.filter((x) => x.r && x.con < 0);

  // ---------- xác nhận ----------
  const xacNhan = async () => {
    const dongGui = [];
    dongMa.forEach((x) => chonDoi.forEach((m) => { const v = gt(x.bc, m); if (v > 0) dongGui.push({ ma_ch: m, barcode: x.bc, sl: v, sl_thung: 0 }); }));
    if (!dongGui.length) { baoToast('Chưa có số nào'); return; }
    if (vuot.length) { baoToast(`${vuot.length} mã chia vượt kho khả dụng — sửa trước khi xác nhận`); return; }
    const soDoi = new Set(dongGui.map((d) => d.ma_ch)).size;
    const ghiChu = await hoiGhiChu({ macDinh: lsGet('ghi_chu.loat') ?? `Chia hàng mới – ${soDoi} đội`, tieuDe: 'Ghi chú file xuất — Chia hàng mới đội sale',
      nutXong: `Xác nhận & xuất (${fmtN(tongAll)})`, phu: `${dsMa.length} mã × ${soDoi} đội · ${fmtN(tongAll)} cái — giữ tồn kho SA ngay khi xác nhận` });
    if (ghiChu === null) return;
    lsSet('ghi_chu.loat', ghiChu);
    setGui(true);
    const { data, error } = await sb.rpc('fn_ds_xac_nhan', { p: { loai: 'loat', nguoi, khoa_nhap: 'loat', ghi_chu: ghiChu || null, dong: dongGui, thung: [] } });
    setGui(false);
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    if (!data?.ok) { baoLoiXacNhan(data, baoToast); taiSp(); return; }
    try { await xuatHaiFile(data, ghiChu); } catch { baoToast('Đã giữ tồn, xuất file lỗi — tải lại ở tab Phiếu đã chia'); }
    await xoaNhap();
    setXong({ ...data, sl: tongAll, doi: soDoi });
    baoToast(`Đã xác nhận ${tenPhieu(data)}: ${fmtN(tongAll)} cái cho ${soDoi} đội`);
  };

  return (
    <div className="cm">
      {hopGhiChu}
      <div className="cmdbar cm-dau">
        <div className="cmd-title">
          <h2>Chia hàng mới cho đội sale</h2>
          <p>Thêm nhiều mã một lần — chia theo tỷ trọng bán mã tham chiếu hoặc sức bán từng đội, làm tròn theo giá sale, không vượt kho SA. Sửa tay ở cột Thực chia.</p>
        </div>
        <div className="cm-dau-nut">
          <TrangThaiLuu tt={ttLuu} />
          <button className="btn btn-ai" onClick={chiaTatCa} disabled={!dsMa.length || !chonDoi.length}>✦ Chia tự động tất cả</button>
          <button className="btn btn-ai" onClick={() => setMoDS(true)} disabled={!dsMa.length || !chonDoi.length}>Bảng đối soát{chonDoi.length ? ` (${chonDoi.length} đội)` : ''}</button>
          <button className="btn btn-xoahet" onClick={xoaTatCa} disabled={!dsMa.length}>Xoá tất cả</button>
        </div>
      </div>

      {xong && (
        <div className="chm-khoiphuc cm-xong">
          <b><IcCheck /> Đã xác nhận {tenPhieu(xong)}</b><span>{fmtN(xong.sl)} cái · {xong.doi} đội · {soFile(xong)} file</span>
          <button className="chm-kp-an" onClick={() => setXong(null)}>✕</button>
        </div>
      )}

      <div className="card cm-doi">
        <div className="cm-doi-dau"><b>Đội nhận</b><span className="tq-ghi">{chonDoi.length} / {doiSx.length} đội</span>
          <div className="bc-nhanh">
            <button onClick={() => datNhap((d) => ({ ...d, doi: doiSx.map((x) => x.ma_ch) }))}>Tất cả</button>
            <button onClick={() => datNhap((d) => ({ ...d, doi: doiSx.filter((x) => !x.moi).map((x) => x.ma_ch) }))}>Trừ đội mới</button>
            <button onClick={() => datNhap((d) => ({ ...d, doi: [] }))}>Bỏ chọn</button>
          </div>
        </div>
        <div className="bc-chips">
          {doiSx.map((d) => (
            <button key={d.ma_ch} className={'bc-chip' + (chonDoi.includes(d.ma_ch) ? ' on' : '')} onClick={() => togDoi(d.ma_ch)}>
              {chonDoi.includes(d.ma_ch) && <IcCheck />}<span>{tenNgan(d.ten)}</span>
            </button>
          ))}
        </div>
      </div>

      {dsMa.map((bc, i) => (
        <TheMa key={bc} i={i} bc={bc} r={spMap[bc]} c={cfg[bc] || {}} kh={keHoach(bc)} coSo={coSoCua(bc)} qt={qtCua(spMap[bc])}
          chonDoi={chonDoi} tenDoi={tenDoi} gt={gt} dx={dx[bc] || {}} tcD={tcDl[String(cfg[bc]?.tc || '').trim().toUpperCase()]} cuaSo={cuaSo}
          onCfg={(o) => datCfg(bc, o)} onChia={() => chiaMa(bc)} onApDn={() => apDeNghi(bc)} onO={(m, v) => datO(bc, m, v)} onBo={() => boMa(bc)}
          onTc={layTc} />
      ))}
      <TheTim chiMoi={chiMoi} setChiMoi={setChiMoi} daCo={dsMa} so={dsMa.length + 1}
        onChon={(x) => themMa(x.barcode, dsMa.length ? { ...(cfg[dsMa[dsMa.length - 1]] || {}), tc: '' } : {})} />

      {moDS && (
        <BangDoiSoat dsMa={dongMa} chonDoi={chonDoi} tenDoi={tenDoi} gt={gt} onO={datO} onDong={() => setMoDS(false)} />
      )}

      <div className="ch-chan cm-chan">
        <div className="ch-chan-so">
          <span><b>{dsMa.length}</b> mã × <b>{chonDoi.length}</b> đội</span>
          <span className="tong">Tổng thực chia <b>{fmtN(tongAll)}</b> cái</span>
          {vuot.length > 0 && <span className="ch-canh-nut do"><IcAlert /> {vuot.length} mã vượt kho</span>}
        </div>
        <button className="btn btn-ai ch-xn" disabled={gui || !tongAll} onClick={xacNhan}>
          <IcDown /> {gui ? 'Đang giữ tồn…' : `Xác nhận & xuất file (${fmtN(tongAll)})`}
        </button>
      </div>
    </div>
  );
}

// Thẻ tìm mã mới (cuối danh sách)
function TheTim({ chiMoi, setChiMoi, daCo, so: thuTu, onChon }) {
  const [q, setQ] = useState('');
  const [kq, setKq] = useState([]);
  const [mo, setMo] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => sb.rpc('fn_ds_sp_tim', { p_q: q, p_moi: chiMoi, p_gioi_han: 30 }).then(({ data }) => setKq(data || [])), 220);
    return () => clearTimeout(t);
  }, [q, chiMoi]);
  const ds = kq.filter((x) => !daCo.includes(x.barcode)).slice(0, 12);
  return (
    <div className="card cm-the cm-the-moi">
      <div className="cm-hang">
        <div className="cm-o cm-o-ma">
          <div className="lbl">Mã hàng mới #{thuTu}</div>
          <div className="cm-tim">
            <IcSearch />
            <input className="inp" placeholder="Barcode, SKU, mã — Enter thêm mã đầu tiên" value={q} onFocus={() => setMo(true)} onBlur={() => setTimeout(() => setMo(false), 150)}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && ds[0]) { e.preventDefault(); onChon(ds[0]); setQ(''); } }} />
          </div>
          {mo && ds.length > 0 && (
            <div className="goiy-pop">
              {ds.map((x) => (
                <div key={x.barcode} className="goiy-item" onMouseDown={(e) => { e.preventDefault(); onChon(x); setQ(''); }}>
                  <AnhSP url={x.hinh_url} ten={x.ma_tham_chieu} />
                  <div className="cm-goiy-ten"><b>{x.ma_tham_chieu}</b><small>{x.nganh_3} · kho {fmtN((x.kd1 || 0) + (x.kd2 || 0))}</small></div>
                </div>
              ))}
            </div>
          )}
        </div>
        <label className="bc-tick"><input type="checkbox" checked={chiMoi} onChange={(e) => setChiMoi(e.target.checked)} /> Chỉ mã mới (45 ngày)</label>
      </div>
    </div>
  );
}

// Thẻ 1 mã: cấu hình + bảng kết quả từng đội
function TheMa({ i, bc, r, c, kh, coSo, qt, chonDoi, tenDoi, gt, dx, tcD, cuaSo, onCfg, onChia, onApDn, onO, onBo, onTc }) {
  const [moRong, setMoRong] = useState(true);
  const [locD, setLocD] = useState('');
  const [sap, setSap] = useState({ k: 'w', g: -1 });
  const [qTc, setQTc] = useState(c.tc || '');
  const [goiTc, setGoiTc] = useState([]);
  const hTc = useRef(null);
  useEffect(() => { setQTc(c.tc || ''); }, [c.tc]);
  const timTc = (v) => {
    setQTc(v); clearTimeout(hTc.current);
    if (v.trim().length < 2) { setGoiTc([]); return; }
    hTc.current = setTimeout(() => sb.rpc('fn_td_goi_y', { p_tu: v.trim(), p_gioi_han: 8 }).then(({ data }) => setGoiTc(data || [])), 250);
  };
  const chonTc = (ma) => { setGoiTc([]); setQTc(ma); onCfg({ tc: ma, cs: 'tc' }); onTc(ma); };
  const kho = r ? (r.kd1 || 0) + (r.kd2 || 0) : 0;
  const tongThuc = chonDoi.reduce((a, m) => a + gt(bc, m), 0);
  const tongDn = chonDoi.reduce((a, m) => a + (dx[m] || 0), 0);
  const coDn = Object.keys(dx).length > 0;
  const dong = chonDoi.map((m) => {
    const co = r?.o?.[m]?.[0] || 0, w = kh?.w?.[m] || 0;
    const tl = kh && kh.W > 0 ? w / kh.W : 0;
    return { m, ten: tenDoi(m), co, w, tl, dn: dx[m] || 0, th: gt(bc, m), sau: co + gt(bc, m) };
  }).filter((d) => !locD.trim() || d.ten.toLowerCase().includes(locD.trim().toLowerCase()) || d.m.toLowerCase().includes(locD.trim().toLowerCase()))
    .sort((a, b) => sap.g * ((a[sap.k] > b[sap.k]) - (a[sap.k] < b[sap.k])) || a.m.localeCompare(b.m));
  const th = (key, ten, title) => (
    <th className="ct-giua sortable" title={title} onClick={() => setSap((s) => ({ k: key, g: s.k === key ? -s.g : -1 }))}>{ten}{sap.k === key ? (sap.g < 0 ? ' ↓' : ' ↑') : ''}</th>
  );
  const nhanCs = { tc: c.tc ? `bán ${c.tc}` : 'mã tham chiếu', ban: 'sức bán đội', ma: 'bán mã này', deu: 'chia đều' }[coSo];
  const tcRong = coSo === 'tc' && tcD && !tcD.loi && !Object.keys(tcD.tc || {}).length;
  return (
    <div className="card cm-the">
      <div className="cm-hang">
        <div className="cm-o cm-o-ma">
          <div className="lbl">Mã hàng mới #{i + 1}</div>
          <div className="cm-ma">
            <AnhSP url={r?.hinh_url} ten={r?.ma_tham_chieu || bc} />
            <div><b>{r?.ma_tham_chieu || bc}</b><small>{r?.nganh_3 || 'đang tải…'}</small></div>
          </div>
        </div>
        <div className="cm-o cm-o-tc">
          <div className="lbl">Mã tham chiếu (tùy chọn — gõ NS008ATG lấy cả mẫu)</div>
          <input className="inp" placeholder="Mẫu / mã màu tương tự…" value={qTc} onChange={(e) => timTc(e.target.value)}
            onBlur={() => setTimeout(() => setGoiTc([]), 150)}
            onKeyDown={(e) => { if (e.key === 'Enter' && qTc.trim()) { e.preventDefault(); chonTc((goiTc[0]?.ma || qTc).trim().toUpperCase()); } }} />
          {goiTc.length > 0 && (
            <div className="goiy-pop">
              {goiTc.map((g) => (
                <div key={g.ma} className="goiy-item" onMouseDown={(e) => { e.preventDefault(); chonTc(g.ma); }}>
                  <AnhSP url={g.hinh_url} ten={g.ma} />
                  <div className="cm-goiy-ten"><b>{g.ma}</b><small>{g.la_dong ? `cả mẫu · ${g.so_bien_the} màu` : (g.ten_sp || 'một màu')}</small></div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="cm-o cm-o-so">
          <div className="lbl" title={`Kho SA khả dụng ${fmtN(kho)}`}>Tổng SL</div>
          <input className="inp" type="number" min="1" placeholder={`≤ ${fmtN(kho)}`} value={c.tong || ''} onChange={(e) => onCfg({ tong: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') onChia(); }} />
        </div>
        <div className="cm-o cm-o-nho">
          <div className="lbl" title="Mỗi đội nhận ÍT NHẤT (kể cả đội chưa bán). Để trống = không ràng buộc">Min/đội</div>
          <input className="inp" type="number" min="0" placeholder="—" value={c.min || ''} onChange={(e) => onCfg({ min: e.target.value })} />
        </div>
        <div className="cm-o cm-o-nho">
          <div className="lbl" title="Mỗi đội nhận TỐI ĐA. Để trống = không giới hạn">Max/đội</div>
          <input className="inp" type="number" min="0" placeholder="—" value={c.max || ''} onChange={(e) => onCfg({ max: e.target.value })} />
        </div>
        <div className="cm-nut">
          <button className="btn btn-ai" onClick={onChia} disabled={!chonDoi.length}>{coDn ? 'Chia lại' : 'Chia'}</button>
          <button className="btn-mini btn-danger" onClick={onBo} title="Bỏ mã này">－</button>
        </div>
      </div>

      <div className="cm-tt">
        <span className="cm-chip">Kho SA <b>{fmtN(kho)}</b></span>
        <span className="cm-chip" title={qt.nhan}>{r?.gia ? `Giá ${kGia(r.gia)}` : 'Chưa có giá sale'} · làm tròn {moTaMuc(qt)}</span>
        <span className="cm-cs">
          Tỷ trọng theo:
          {CO_SO.map(([kk, t]) => (
            <button key={kk} className={'pv-seg' + (coSo === kk ? ' on' : '')} onClick={() => { onCfg({ cs: kk }); if (kk === 'tc' && c.tc) onTc(c.tc); }}
              disabled={kk === 'tc' && !c.tc} title={kk === 'tc' && !c.tc ? 'Nhập mã tham chiếu trước' : ''}>{t}</button>
          ))}
        </span>
        {kh?.tong > kh?.kho && <span className="cm-chip do"><IcAlert /> Tổng {fmtN(kh.tong)} vượt kho {fmtN(kh.kho)} — chỉ chia tối đa kho</span>}
        {tcRong && <span className="cm-chip vang"><IcAlert /> {c.tc} chưa bán ở đội nào {cuaSo} ngày — sẽ chia đều</span>}
        {tcD?.loi && coSo === 'tc' && <span className="cm-chip vang">Chưa tải được số bán tham chiếu (cần SQL 202)</span>}
      </div>

      {chonDoi.length > 0 && (coDn || tongThuc > 0) && (
        <div className="cm-kq">
          <div className="cm-kq-dau">
            <b>Kết quả: {chonDoi.filter((m) => gt(bc, m) > 0).length} đội · thực chia {fmtN(tongThuc)}{coDn ? ` · đề nghị ${fmtN(tongDn)}` : ''}</b>
            <span className={'cm-con' + (kho - tongThuc < 0 ? ' do' : '')}>kho còn {fmtN(kho - tongThuc)}</span>
            {coDn && tongDn !== tongThuc && <button className="btn-mini" onClick={onApDn} title="Đặt lại Thực chia = Đề nghị">Áp đề nghị</button>}
            <input className="cm-loc-doi" placeholder="Lọc đội…" value={locD} onChange={(e) => setLocD(e.target.value)} />
            <button className="btn-mini" onClick={() => setMoRong((v) => !v)}>{moRong ? 'Thu gọn' : 'Mở rộng'}</button>
          </div>
          {moRong && (
            <div className="tbl-wrap cm-bang">
              <table className="tbl">
                <thead>
                  <tr>
                    <th className="ct-stt">#</th>
                    {th('ten', 'Đội')}
                    {th('co', 'Đang có', 'Tồn + đang về + đã giữ chưa xuất của mã này ở đội')}
                    {th('w', `Bán (${nhanCs})`, `Cơ sở tỷ trọng: ${nhanCs} · ${cuaSo} ngày`)}
                    {th('tl', 'Tỷ lệ')}
                    {th('dn', 'Đề nghị', 'AI đề nghị: theo tỷ trọng, làm tròn theo giá, không vượt kho')}
                    {th('th', 'Thực chia', 'Số sẽ xác nhận — sửa thoải mái')}
                    {th('sau', 'Sau chia', 'Đang có + thực chia')}
                  </tr>
                </thead>
                <tbody>
                  {dong.map((d, j) => (
                    <tr key={d.m} className={d.th !== d.dn && coDn ? 'cm-sua' : ''}>
                      <td className="ct-stt">{j + 1}</td>
                      <td><b>{d.ten}</b> <span className="cm-ma-doi">{d.m}</span></td>
                      <td className="ct-giua">{d.co || <span className="ct-khong">·</span>}</td>
                      <td className="ct-giua">{kh?.chiaDeu ? <span className="ct-khong">—</span> : (d.w || <span className="ct-khong">·</span>)}</td>
                      <td className="ct-giua">{d.tl ? Math.round(d.tl * 100) + '%' : <span className="ct-khong">·</span>}</td>
                      <td className="ct-giua cm-dn">{d.dn || <span className="ct-khong">·</span>}</td>
                      <td className="ct-giua"><input className="qty-input ct-inp" type="number" min="0" value={d.th || ''} placeholder="·"
                        onChange={(e) => onO(d.m, e.target.value)} onFocus={(e) => e.target.select()} /></td>
                      <td className="ct-giua">{d.sau || <span className="ct-khong">·</span>}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td /><td><b>Tổng</b></td><td /><td /><td /><td className="ct-giua"><b>{fmtN(tongDn)}</b></td><td className="ct-giua"><b>{fmtN(tongThuc)}</b></td><td /></tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Bảng đối soát: đội × mã (sửa thẳng)
function BangDoiSoat({ dsMa, chonDoi, tenDoi, gt, onO, onDong }) {
  const [sap, setSap] = useState({ k: 'ten', g: 1 });
  const hang = chonDoi.map((m) => ({ m, ten: tenDoi(m), tong: dsMa.reduce((a, x) => a + gt(x.bc, m), 0), ...Object.fromEntries(dsMa.map((x) => [x.bc, gt(x.bc, m)])) }))
    .sort((a, b) => sap.g * ((a[sap.k] > b[sap.k]) - (a[sap.k] < b[sap.k])));
  const muiTen = (key) => (sap.k === key ? (sap.g < 0 ? ' ↓' : ' ↑') : '');
  const doiSap = (key) => setSap((s) => ({ k: key, g: s.k === key ? -s.g : -1 }));
  return (
    <div className="kt-modal" onMouseDown={(e) => { if (e.target === e.currentTarget) onDong(); }}>
      <div className="cm-ds">
        <div className="lp-dau">
          <div><b>Bảng đối soát — chia hàng mới đội sale</b>
            <div className="lp-phu">{chonDoi.length} đội · {dsMa.length} mã · {fmtN(dsMa.reduce((a, x) => a + x.tong, 0))} cái — sửa số ngay trong bảng, bấm tiêu đề để sắp xếp</div></div>
          <button className="lp-dong" onClick={onDong}>✕</button>
        </div>
        <div className="lp-cuon">
          <table className="tbl ds-pivot">
            <thead>
              <tr>
                <th className="ds-stt">#</th>
                <th className="ds-ch ds-sort" onClick={() => doiSap('ten')}>Đội{muiTen('ten')}</th>
                {dsMa.map((x) => <th key={x.bc} className="ds-ma ds-sort" onClick={() => doiSap(x.bc)} title={x.r?.nganh_3 || ''}><span className="ds-ma-nhan">{x.r?.ma_tham_chieu || x.bc}{muiTen(x.bc)}</span></th>)}
                <th className="ds-tong ds-sort" onClick={() => doiSap('tong')}>Tổng{muiTen('tong')}</th>
              </tr>
            </thead>
            <tbody>
              {hang.map((h, i) => (
                <tr key={h.m}>
                  <td className="ds-stt">{i + 1}</td>
                  <td className="ds-ch"><b>{h.ten}</b><span className="ds-ch-ma">{h.m}</span></td>
                  {dsMa.map((x) => (
                    <td key={x.bc} className="ds-o"><input className="ds-in" type="number" min="0" value={h[x.bc] || ''} placeholder="·" onChange={(e) => onO(x.bc, h.m, e.target.value)} /></td>
                  ))}
                  <td className="ds-tong"><b>{fmtN(h.tong)}</b></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="ds-stt" /><td className="ds-ch">Tổng</td>
                {dsMa.map((x) => <td key={x.bc} className="ds-tong-cot">{fmtN(x.tong)}</td>)}
                <td className="ds-tong-cuoi">{fmtN(dsMa.reduce((a, x) => a + x.tong, 0))}</td>
              </tr>
              <tr className="cm-ds-kho">
                <td className="ds-stt" /><td className="ds-ch">Kho còn</td>
                {dsMa.map((x) => <td key={x.bc} className={'ds-tong-cot' + (x.con < 0 ? ' do' : '')}>{fmtN(x.con)}</td>)}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
