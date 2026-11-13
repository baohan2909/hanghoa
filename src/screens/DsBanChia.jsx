import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { sb } from '../lib/supabase.js';
import { useApp } from '../App.jsx';
import { Sel } from '../lib/ui.jsx';
import { IcSpark, IcDown, IcCheck, IcAlert } from '../lib/icons.jsx';

// ============================================================================
// BÀN CHIA HÀNG ĐỘI SALE — ma trận SẢN PHẨM (dòng) × ĐỘI (cột)
//  · Mỗi ô 1 con số: + nhận / − cho. AI (fn_ds_ban_chia) điền sẵn, điều phối sửa.
//  · Không phải nhập "từ đâu đến đâu": hệ thống tự ghép bên cho → bên nhận theo
//    độ gấp; thiếu thì lấy kho SA, thừa thì trả về kho.
//  · Chân bảng (dính đáy): mỗi đội nhận bao nhiêu, cho bao nhiêu, đủ bao nhiêu ngày SAU chia.
//  · Xuất: xem trước các lệnh → file Excel cùng khuôn Yêu cầu ĐP (Odoo) + lưu lệnh (fn_dp_luu).
// ============================================================================

const fmtN = (n) => (n == null ? '—' : Number(n).toLocaleString('vi'));
const tenNgan = (t) => (t || '').replace(/^Đội SALE\s*/i, 'Đội ');
const KHO_TEN = { SA05001: 'Kho Sale Bảo Hiểm Offline', SA05002: 'Kho Sale Nón vải' };
const LS_KEY = 'dsBanChia.v1';
const lsGet = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { return null; } };
const lsSet = (v) => { try { localStorage.setItem(LS_KEY, JSON.stringify(v)); } catch { /* bỏ qua */ } };

// Ngày đủ sau chia: (có + net) / sức bán
const ngaySau = (o, net) => (o && o.v > 0 ? Math.round(((o.t + o.d + net) / o.v) * 10) / 10 : null);
const mauNgay = (n, ts) => (n == null ? 'var(--ink-3, #9AA3B2)' : n < ts.sap_het ? 'var(--magenta)'
  : n < ts.muc_tieu ? '#B7791F' : n > ts.ton_lau ? '#8A93A3' : 'var(--teal-deep)');

// Ghép 1 dòng sản phẩm thành các lệnh tu -> den (bên cho → bên nhận, gấp trước; thiếu lấy kho; thừa trả kho)
function ghepDong(sp, cot, giaTri) {
  const nhan = [], cho = [];
  cot.forEach((d) => {
    const v = giaTri(sp.barcode, d.ma_ch);
    if (v > 0) nhan.push({ ma: d.ma_ch, ten: d.ten, sl: v, nd: sp.o?.[d.ma_ch]?.nd ?? -1 });
    else if (v < 0) cho.push({ ma: d.ma_ch, ten: d.ten, sl: -v });
  });
  nhan.sort((a, b) => a.nd - b.nd);
  cho.sort((a, b) => b.sl - a.sl);
  const lenh = [];
  for (const n of nhan) {
    let con = n.sl;
    for (const c of cho) {
      if (!con) break;
      if (!c.sl) continue;
      const lay = Math.min(con, c.sl);
      lenh.push({ tu: c.ma, tu_ten: c.ten, den: n.ma, den_ten: n.ten, sl: lay, loai: 'doi' });
      c.sl -= lay; con -= lay;
    }
    n.con = con;
  }
  // Còn thiếu -> kho SA (ưu tiên kho nhiều hàng hơn, hết thì kho còn lại)
  const kho = { SA05001: sp.sa1 || 0, SA05002: sp.sa2 || 0 };
  let thieuKho = 0;
  for (const n of nhan) {
    let con = n.con || 0;
    for (const k of Object.keys(kho).sort((a, b) => kho[b] - kho[a])) {
      if (!con) break;
      const lay = Math.min(con, kho[k]);
      if (lay > 0) { lenh.push({ tu: k, tu_ten: KHO_TEN[k], den: n.ma, den_ten: n.ten, sl: lay, loai: 'kho' }); kho[k] -= lay; con -= lay; }
    }
    thieuKho += con;
  }
  // Còn dư bên cho -> trả về kho (kho đang giữ mã này nhiều hơn; mũ BH mặc định SA05001)
  const khoTra = (sp.sa2 || 0) > (sp.sa1 || 0) || (!sp.sa1 && !/bảo hiểm/i.test(sp.nganh_1 || '')) ? 'SA05002' : 'SA05001';
  let traKho = 0;
  for (const c of cho) if (c.sl > 0) {
    lenh.push({ tu: c.ma, tu_ten: c.ten, den: khoTra, den_ten: KHO_TEN[khoTra], sl: c.sl, loai: 'tra' });
    traKho += c.sl;
  }
  return { lenh, thieuKho, traKho };
}

// Ảnh sản phẩm: rê chuột / chạm để phóng to (vẽ nổi trên cùng trang, không bị bảng che)
function AnhSP({ url, ten }) {
  const [loi, setLoi] = useState(false);
  const [to, setTo] = useState(null);
  if (!url || loi) return <div className="bc-anh bc-anh-trong">{(ten || '?').slice(0, 2)}</div>;
  const mo = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const W = 250, H = 270;
    const left = r.right + 10 + W > window.innerWidth ? Math.max(8, r.left - W - 10) : r.right + 10;
    const top = Math.min(Math.max(8, r.top - 60), window.innerHeight - H - 8);
    setTo({ left, top });
  };
  return (
    <div className="bc-anh" tabIndex={0} onMouseEnter={mo} onMouseLeave={() => setTo(null)}
      onFocus={mo} onBlur={() => setTo(null)}>
      <img src={url} alt={ten} loading="lazy" onError={() => setLoi(true)} />
      {to && createPortal(
        <div className="bc-anh-to" style={{ left: to.left, top: to.top }}><img src={url} alt="" /><span>{ten}</span></div>,
        document.body)}
    </div>
  );
}

// Bảng phân tích 1 ô — tính theo SỐ ĐANG NHẬP (không phải số gốc AI), cập nhật ngay khi sửa
function TipO({ tip, sp, d, v, T, lenh }) {
  const o = sp?.o?.[d.ma_ch];
  const W = 300;
  const left = tip.r.right + 8 + W > window.innerWidth ? Math.max(8, tip.r.left - W - 8) : tip.r.right + 8;
  const top = Math.min(Math.max(8, tip.r.top - 10), window.innerHeight - 330);
  const ten = tenNgan(d.ten);
  if (!o) {
    return createPortal(<div className="bc-tip" style={{ left, top, width: W }}>
      <b>{ten} · {sp.ma_tham_chieu}</b><p>Đội chưa có mã này (không tồn, không bán).</p>
      {v > 0 && <p>Chia <b className="ch-nhan">+{v}</b> → có {v} cái, chưa có số bán để tính ngày.</p>}
    </div>, document.body);
  }
  const coTruoc = o.t + o.d, coSau = coTruoc + v;
  const ndT = o.v > 0 ? Math.round((coTruoc / o.v) * 10) / 10 : null;
  const ndS = o.v > 0 ? Math.round((coSau / o.v) * 10) / 10 : null;
  const muc = Math.ceil(o.v * T.muc_tieu);
  const ai = o.dx || 0;
  const nguon = lenh.filter((l) => l.den === d.ma_ch).map((l) => `${tenNgan(l.tu_ten)} ${l.sl}`);
  const dich = lenh.filter((l) => l.tu === d.ma_ch).map((l) => `${tenNgan(l.den_ten)} ${l.sl}`);
  const canh = [];
  if (v < 0 && -v > o.t) canh.push(`Cho ${-v} nhưng chỉ đang có ${o.t} cái thực (hàng đang về chưa tới).`);
  if (v < 0 && o.moi) canh.push('Đội mới — chưa đủ thời gian bán, lấy hàng đi là sớm.');
  if (o.v > 0 && coSau < muc) canh.push(`Sau chia còn thiếu ${muc - coSau} cái để đủ ${T.muc_tieu} ngày.`);
  if (v > 0 && o.v > 0 && coSau > muc + Math.max(2, Math.ceil(o.v * 3))) canh.push(`Nhận dư ${coSau - muc} cái so với mục tiêu ${T.muc_tieu} ngày.`);
  if (v > 0 && o.v === 0) canh.push(`Đội không bán mã này ${T.cua_so} ngày qua — nhận thêm có thể nằm kho.`);
  const nd = (n) => (n == null ? '—' : n > 365 ? '>1 năm' : n + ' ngày');
  return createPortal(
    <div className="bc-tip" style={{ left, top, width: W }}>
      <b>{ten} · {sp.ma_tham_chieu}</b>
      <div className="bc-tip-g">
        <span>Bán</span><em>{o.b} cái / {T.cua_so} ngày · {o.v}/ngày</em>
        <span>Trước chia</span><em>{o.d ? <>{o.t}{o.d > 0 ? ` + ${o.d} đang về` : ` − ${-o.d} đang đi`} = </> : null}<b>{coTruoc}</b> cái · đủ <b style={{ color: mauNgay(ndT, T) }}>{nd(ndT)}</b></em>
        <span>Chia</span><em><b className={v > 0 ? 'ch-nhan' : v < 0 ? 'ch-cho' : ''}>{v > 0 ? '+' + v : v || 0}</b>
          {v !== ai ? <> · AI đề xuất {ai > 0 ? '+' + ai : ai}</> : <> · đúng số AI</>}</em>
        <span>Sau chia</span><em><b>{coSau}</b> cái · đủ <b style={{ color: mauNgay(ndS, T) }}>{nd(ndS)}</b>{o.v > 0 ? ` (mục tiêu ${muc} = ${T.muc_tieu} ngày)` : ''}</em>
        {nguon.length > 0 && <><span>Nhận từ</span><em>{nguon.join(' · ')}</em></>}
        {dich.length > 0 && <><span>Cho đến</span><em>{dich.join(' · ')}</em></>}
      </div>
      {canh.length > 0 ? canh.map((c, i) => <p key={i} className="bc-tip-canh">{c}</p>)
        : <p className="bc-tip-ok">Số chia hợp lý với sức bán.</p>}
    </div>, document.body);
}

export default function DsBanChia({ dsDoi, ts, initChon }) {
  const { user, baoToast } = useApp();
  const daLuu = useRef(lsGet());
  const [chon, setChon] = useState(() => initChon?.length ? initChon : (daLuu.current?.chon || []));
  const [kq, setKq] = useState(null);
  const [dang, setDang] = useState(false);
  const [sua, setSua] = useState(() => daLuu.current?.sua || {});   // "barcode|ma_ch" -> số
  const [tatCa, setTatCa] = useState(false);
  const [nganh, setNganh] = useState('');
  const [q, setQ] = useState('');
  const [chiCo, setChiCo] = useState(false);       // chỉ dòng đang có số
  const [xemTruoc, setXemTruoc] = useState(false);
  const [tipO, setTipO] = useState(null);           // ô đang rê chuột: { bc, ma, left, top }

  // Lưu nháp: đội đã chọn + số đã sửa (tải lại trang không mất)
  useEffect(() => { lsSet({ chon, sua }); }, [chon, sua]);
  useEffect(() => { if (initChon?.length) setChon(initChon); }, [initChon]);   // eslint-disable-line

  const tai = async (giuSua = true) => {
    if (!chon.length) { setKq(null); return; }
    setDang(true);
    const { data, error } = await sb.rpc('fn_ds_ban_chia', {
      p_doi: chon, p_cua_so: ts.cua_so, p_muc_tieu: ts.muc_tieu, p_sap_het: ts.sap_het,
      p_ton_lau: ts.ton_lau, p_tat_ca: tatCa,
    });
    setDang(false);
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    setKq(data);
    if (!giuSua) setSua({});
  };
  useEffect(() => { tai(true); }, [chon.join(','), tatCa, ts.cua_so, ts.muc_tieu, ts.sap_het, ts.ton_lau]);   // eslint-disable-line

  const T = kq?.tham_so || ts;
  const cot = useMemo(() => {
    const m = Object.fromEntries((kq?.doi || []).map((d) => [d.ma_ch, d]));
    return chon.map((c) => m[c]).filter(Boolean);
  }, [kq, chon]);

  const spMap = useMemo(() => new Map((kq?.sp || []).map((s) => [s.barcode, s])), [kq]);
  const giaTri = (bc, ma) => {
    const k = bc + '|' + ma;
    if (k in sua) return sua[k];
    return spMap.get(bc)?.o?.[ma]?.dx || 0;
  };

  const dsNganh = useMemo(() => [...new Set((kq?.sp || []).map((s) => s.nganh_1).filter(Boolean))], [kq]);
  const dong = useMemo(() => (kq?.sp || []).filter((s) => {
    if (nganh && s.nganh_1 !== nganh) return false;
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      if (![s.ma_tham_chieu, s.barcode, s.nganh_3].some((x) => (x || '').toLowerCase().includes(t))) return false;
    }
    if (chiCo && !cot.some((d) => giaTri(s.barcode, d.ma_ch) !== 0)) return false;
    return true;
  }), [kq, nganh, q, chiCo, sua, cot]);   // eslint-disable-line

  // Ghép toàn bộ đợt -> lệnh + tổng theo đội (cập nhật theo từng lần sửa)
  const tong = useMemo(() => {
    const doi = Object.fromEntries(cot.map((d) => [d.ma_ch, { nhan: 0, cho: 0, net: 0, coSau: d.ton + d.duong, v: d.ban_ngay }]));
    let lenh = [], thieuKho = 0, traKho = 0, tuKho = 0, giuaDoi = 0;
    (kq?.sp || []).forEach((s) => {
      cot.forEach((d) => {
        const v = giaTri(s.barcode, d.ma_ch);
        if (!v) return;
        const x = doi[d.ma_ch];
        if (v > 0) x.nhan += v; else x.cho -= v;
        x.net += v; x.coSau += v;
      });
      const g = ghepDong(s, cot, giaTri);
      g.lenh.forEach((l) => { l.sp = s; if (l.loai === 'doi') giuaDoi += l.sl; if (l.loai === 'kho') tuKho += l.sl; });
      lenh = lenh.concat(g.lenh); thieuKho += g.thieuKho; traKho += g.traKho;
    });
    Object.values(doi).forEach((x) => { x.ndSau = x.v > 0 ? Math.round(x.coSau / x.v) : null; });
    return { doi, lenh, thieuKho, traKho, tuKho, giuaDoi };
  }, [kq, sua, cot]);   // eslint-disable-line

  const datSo = (bc, ma, v) => setSua((m) => ({ ...m, [bc + '|' + ma]: v }));
  const aiLai = () => { setSua({}); baoToast('Đã trả về số AI đề xuất'); };
  const xoaHet = () => {
    const m = {};
    (kq?.sp || []).forEach((s) => cot.forEach((d) => { m[s.barcode + '|' + d.ma_ch] = 0; }));
    setSua(m); baoToast('Đã xoá hết số — nhập tay hoặc bấm AI đề xuất');
  };

  const xuat = async () => {
    const ds = tong.lenh.filter((l) => l.sl > 0);
    if (!ds.length) { baoToast('Chưa có số nào để xuất'); return; }
    const XLSX = await import('xlsx');
    const d = new Date();
    const maLenh = 'DSC' + d.toISOString().slice(0, 10).replace(/-/g, '') + '-'
      + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
    const hang = ds.map((l) => ({
      'Kho chuyển': l.tu, 'Tên kho chuyển': l.tu_ten, 'Cửa hàng nhận': l.den, 'Tên cửa hàng nhận': l.den_ten,
      Barcode: l.sp.barcode, 'Mã tham chiếu': l.sp.ma_tham_chieu || '', 'Sản phẩm': l.sp.nganh_3 || '',
      'Số lượng': l.sl, 'Ghi chú': maLenh + (l.loai === 'kho' ? ' · từ kho' : l.loai === 'tra' ? ' · trả kho' : ''),
    }));
    const tongHop = cot.map((c) => ({
      'Đội': c.ma_ch, 'Tên đội': c.ten, 'Nhận': tong.doi[c.ma_ch].nhan, 'Cho đi': tong.doi[c.ma_ch].cho,
      'Chênh lệch': tong.doi[c.ma_ch].net, 'Có trước chia': c.ton + c.duong, 'Có sau chia': tong.doi[c.ma_ch].coSau,
      'Bán/ngày': c.ban_ngay, 'Đủ ngày sau chia': tong.doi[c.ma_ch].ndSau ?? '',
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hang), 'DieuChuyen');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tongHop), 'TongHopDoi');
    XLSX.writeFile(wb, `${maLenh}.xlsx`);
    const { error } = await sb.rpc('fn_dp_luu', {
      p_ma_lenh: maLenh, p_nguoi: user?.ma_dang_nhap || '',
      p_rows: ds.map((l) => ({ barcode: l.sp.barcode, tu: l.tu, den: l.den, sl: l.sl })),
    });
    if (error) baoToast('Đã xuất file nhưng chưa lưu được lệnh: ' + error.message);
    else baoToast(`Đã xuất ${maLenh} — ${ds.length} dòng, ${fmtN(ds.reduce((a, l) => a + l.sl, 0))} cái`);
    setXemTruoc(false);
  };

  const togDoi = (ma) => setChon((c) => (c.includes(ma) ? c.filter((x) => x !== ma) : [...c, ma].sort()));
  const coThayDoi = Object.keys(sua).length > 0;

  return (
    <div className="bc">
      {/* ===== 1. Chọn đội ===== */}
      <div className="bc-chon">
        <div className="bc-chon-dau">
          <b>Chọn đội chia hàng</b>
          <span className="tq-ghi">{chon.length} / {dsDoi.length} đội</span>
          <div className="bc-nhanh">
            <button title="Đội đang thiếu hàng + đội có hàng nên chuyển đi" onClick={() => setChon(dsDoi.filter((d) => d.ma_sap_het > 0 || d.ma_het > 0 || d.chuyen_di > 0 || d.nhan_ve > 0).map((d) => d.ma_ch).sort())}>Đội có vấn đề</button>
            <button onClick={() => setChon(dsDoi.map((d) => d.ma_ch).sort())}>Tất cả</button>
            <button onClick={() => setChon([])}>Bỏ chọn</button>
          </div>
        </div>
        <div className="bc-chips">
          {[...dsDoi].sort((a, b) => a.ma_ch.localeCompare(b.ma_ch)).map((d) => {
            const st = d.moi ? 'moi' : d.ma_sap_het > 0 || d.ma_het > 0 ? 'do' : d.ngay_du > T.ton_lau ? 'vang' : 'ok';
            return (
              <button key={d.ma_ch} className={'bc-chip st-' + st + (chon.includes(d.ma_ch) ? ' on' : '')} onClick={() => togDoi(d.ma_ch)}>
                {chon.includes(d.ma_ch) && <IcCheck />}
                <span>{tenNgan(d.ten)}</span>
                <small>{d.moi ? 'mới' : d.ngay_du == null ? '—' : d.ngay_du > 365 ? '>1 năm' : d.ngay_du + 'n'}</small>
              </button>
            );
          })}
        </div>
      </div>

      {!chon.length ? (
        <div className="card dsl-trong" style={{ padding: 28 }}>Chọn ít nhất 1 đội — hoặc bấm <b>Đội có vấn đề</b> để AI tự chọn.</div>
      ) : (<>
        {/* ===== 2. Thanh công cụ + số tổng của đợt ===== */}
        <div className="bc-tool">
          <button className={'btn btn-ai' + (dang ? ' dang-chay' : '')} onClick={() => { if (coThayDoi) aiLai(); else tai(false); }} disabled={dang}>
            <IcSpark /> {dang ? 'AI đang tính…' : coThayDoi ? 'Trả về số AI' : 'AI đề xuất'}
          </button>
          <button className="btn" onClick={xoaHet}>Xoá hết số</button>
          <Sel value={tatCa ? 'all' : 'vd'} onChange={(v) => setTatCa(v === 'all')}
            options={[{ value: 'vd', label: 'Mã cần xử lý' }, { value: 'all', label: 'Tất cả mã' }]} />
          <Sel value={nganh} onChange={setNganh}
            options={[{ value: '', label: 'Mọi nhóm hàng' }, ...dsNganh.map((n) => ({ value: n, label: n }))]} />
          <label className="bc-tick"><input type="checkbox" checked={chiCo} onChange={(e) => setChiCo(e.target.checked)} /> Chỉ dòng có số</label>
          <input className="flt-in" placeholder="Tìm mã / sản phẩm…" value={q} onChange={(e) => setQ(e.target.value)}
            style={{ height: 40, minWidth: 150, flex: 1 }} />
          <button className="btn btn-ai" style={{ marginLeft: 'auto' }} disabled={!tong.lenh.length} onClick={() => setXemTruoc(true)}>
            <IcDown /> Xem lệnh & xuất ({tong.lenh.length})
          </button>
        </div>

        <div className="bc-tongdot">
          <span><b>{fmtN(dong.length)}</b> mã</span>
          <span className="t-teal">Chuyển giữa đội <b>{fmtN(tong.giuaDoi)}</b></span>
          <span className="t-ink">Từ kho <b>{fmtN(tong.tuKho)}</b></span>
          {tong.traKho > 0 && <span className="t-vang">Trả về kho <b>{fmtN(tong.traKho)}</b></span>}
          {tong.thieuKho > 0 && <span className="t-do"><IcAlert /> Kho không đủ <b>{fmtN(tong.thieuKho)}</b></span>}
          <span className="tq-ghi bc-chu">Ô: <i className="ch-nhan">+ nhận</i> · <i className="ch-cho">− cho</i> · nền hồng = đội thiếu, nền vàng = đội dư · rê vào ô xem chi tiết</span>
        </div>

        {/* ===== 3. Ma trận ===== */}
        <div className="card bc-wrap">
          {dang && !kq ? <div className="dsl-trong">AI đang tính…</div> : (
          <table className="bc-tbl">
            <thead>
              <tr>
                <th className="bc-sp-h">Sản phẩm</th>
                {cot.map((d) => (
                  <th key={d.ma_ch} className="bc-doi-h">
                    <b>{tenNgan(d.ten)}</b>
                    <small>{fmtN(d.ban_ngay)}/ngày · đủ {d.nd == null ? '—' : d.nd > 365 ? '>1 năm' : d.nd + 'n'}</small>
                  </th>
                ))}
                <th className="bc-kho-h">Kho SA<small>lấy / còn</small></th>
              </tr>
            </thead>
            <tbody>
              {dong.length === 0 ? (
                <tr><td colSpan={cot.length + 2} className="dsl-trong">Không có mã nào cần xử lý giữa các đội đã chọn.</td></tr>
              ) : dong.map((s, ri) => {
                const g = ghepDong(s, cot, giaTri);
                const layKho = g.lenh.filter((l) => l.loai === 'kho').reduce((a, l) => a + l.sl, 0);
                return (
                  <tr key={s.barcode}>
                    <td className="bc-sp">
                      <AnhSP url={s.hinh_url} ten={s.ma_tham_chieu} />
                      <div className="bc-sp-t">
                        <b>{s.ma_tham_chieu || s.barcode}</b>
                        <small>{s.nganh_3 || s.nganh_1}</small>
                      </div>
                    </td>
                    {cot.map((d, ci) => {
                      const o = s.o?.[d.ma_ch];
                      const v = giaTri(s.barcode, d.ma_ch);
                      const ai = o?.dx || 0;
                      const nd2 = ngaySau(o, v);
                      // Màu ô theo SỐ ĐÃ CHIA: còn thiếu sau chia = hồng, vẫn dư = vàng, ổn = trắng
                      const st = !o ? '' : (o.v > 0 && nd2 < T.sap_het) ? ' thieu'
                        : (o.t + v > 0 && (o.b === 0 || (nd2 != null && nd2 > T.ton_lau)) && !o.moi && (o.t + v) - Math.ceil(o.v * T.muc_tieu) >= (T.min_sl || 3)) ? ' du' : '';
                      return (
                        <td key={d.ma_ch} className={'bc-o' + st + (v > 0 ? ' co-nhan' : v < 0 ? ' co-cho' : '')}
                          onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); setTipO({ bc: s.barcode, ma: d.ma_ch, r }); }}
                          onMouseLeave={() => setTipO(null)}>
                          <input type="number" inputMode="numeric" value={v === 0 ? '' : v} placeholder="·"
                            data-r={ri} data-c={ci}
                            onChange={(e) => datSo(s.barcode, d.ma_ch, parseInt(e.target.value, 10) || 0)}
                            onKeyDown={(e) => {
                              if (e.key !== 'Enter') return;
                              e.preventDefault();
                              const t = document.querySelector(`.bc-tbl input[data-r="${ri + (e.shiftKey ? -1 : 1)}"][data-c="${ci}"]`);
                              if (t) { t.focus(); t.scrollIntoView({ block: 'nearest' }); } else e.currentTarget.blur();
                            }}
                            onFocus={(e) => e.target.select()} />
                          {v !== ai && <span className="bc-ai" onClick={() => datSo(s.barcode, d.ma_ch, ai)} title="Bấm để lấy lại số AI">AI {ai > 0 ? '+' + ai : ai}</span>}
                          <div className="bc-o-ph">
                            {o ? <>{o.t + o.d}<span> · {o.v}/n</span></> : <span>—</span>}
                          </div>
                          {o?.v > 0 && <div className="bc-thanh" title={`Đủ ${nd2} ngày sau chia`}>
                            <i style={{ width: Math.min(100, ((nd2 || 0) / (T.muc_tieu * 1.5)) * 100) + '%', background: mauNgay(nd2, T) }} />
                          </div>}
                        </td>
                      );
                    })}
                    <td className={'bc-kho' + (g.thieuKho ? ' thieu' : '')}>
                      {layKho ? <b>+{layKho}</b> : <span className="tq-ghi">·</span>}
                      <small>BH {fmtN(s.sa1)} · NV {fmtN(s.sa2)}</small>
                      {g.thieuKho > 0 && <small className="t-do">thiếu {g.thieuKho}</small>}
                      {g.traKho > 0 && <small className="t-vang">trả kho {g.traKho}</small>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="bc-sp bc-foot-l"><b>Tổng đợt chia</b><small>nhận · cho · đủ ngày sau chia</small></td>
                {cot.map((d) => {
                  const x = tong.doi[d.ma_ch] || {};
                  return (
                    <td key={d.ma_ch} className="bc-foot">
                      <div className="bc-f1"><span className="ch-nhan">+{fmtN(x.nhan)}</span> <span className="ch-cho">−{fmtN(x.cho)}</span></div>
                      <div className="bc-f2" style={{ color: mauNgay(x.ndSau, T) }}>
                        {x.ndSau == null ? '—' : x.ndSau > 365 ? '>1 năm' : x.ndSau + ' ngày'}
                        <span className="tq-ghi"> (trước {d.nd == null ? '—' : d.nd > 365 ? '>1 năm' : d.nd})</span>
                      </div>
                    </td>
                  );
                })}
                <td className="bc-foot bc-kho"><b>+{fmtN(tong.tuKho)}</b>{tong.traKho > 0 && <small className="t-vang">trả {fmtN(tong.traKho)}</small>}</td>
              </tr>
            </tfoot>
          </table>)}
        </div>
        <div className="tq-ghi" style={{ marginTop: 8 }}>
          AI đề xuất: đội còn &lt; {T.sap_het} ngày hàng được bù đủ {T.muc_tieu} ngày; lấy trước từ đội dư (không bán {T.cua_so} ngày
          hoặc còn &gt; {T.ton_lau} ngày, chỉ lấy hàng đang có, giữ lại đủ {T.muc_tieu} ngày, đội mới không lấy), thiếu nữa mới lấy kho SA.
          Sửa số trong ô, hệ thống tự ghép bên cho → bên nhận khi xuất.
        </div>
      </>)}

      {/* ===== 4. Xem lệnh trước khi xuất ===== */}
      {xemTruoc && (
        <div className="bc-modal" onClick={() => setXemTruoc(false)}>
          <div className="bc-modal-in" onClick={(e) => e.stopPropagation()}>
            <div className="bc-modal-dau">
              <b>Lệnh điều chuyển ({tong.lenh.length} dòng · {fmtN(tong.lenh.reduce((a, l) => a + l.sl, 0))} cái)</b>
              <button className="btn" onClick={() => setXemTruoc(false)}>Đóng</button>
            </div>
            {tong.thieuKho > 0 && <div className="dsl-canh"><IcAlert /> Kho SA không đủ {fmtN(tong.thieuKho)} cái — phần này không có trong file.</div>}
            <div className="bc-modal-ds">
              {Object.entries(tong.lenh.reduce((m, l) => { const k = l.tu + '→' + l.den; (m[k] = m[k] || []).push(l); return m; }, {}))
                .sort((a, b) => b[1].length - a[1].length)
                .map(([k, ls]) => (
                  <details key={k} className={'bc-cap ' + ls[0].loai}>
                    <summary>
                      <span>{tenNgan(ls[0].tu_ten)}</span> → <span>{tenNgan(ls[0].den_ten)}</span>
                      <em>{ls.length} mã · {fmtN(ls.reduce((a, l) => a + l.sl, 0))} cái</em>
                    </summary>
                    {ls.map((l, i) => <div key={i} className="bc-cap-d"><span>{l.sp.ma_tham_chieu}</span><b>{l.sl}</b></div>)}
                  </details>
                ))}
            </div>
            <div className="bc-modal-chan">
              <span className="tq-ghi">File gồm 2 sheet: DieuChuyen (khuôn nhập Odoo như Yêu cầu ĐP) + TongHopDoi. Lệnh được lưu để đối chiếu phiếu.</span>
              <button className="btn btn-ai" onClick={xuat}><IcDown /> Xuất Excel + lưu lệnh</button>
            </div>
          </div>
        </div>
      )}
      {tipO && spMap.get(tipO.bc) && (() => {
        const sp = spMap.get(tipO.bc);
        const d = cot.find((x) => x.ma_ch === tipO.ma);
        if (!d) return null;
        const g = ghepDong(sp, cot, giaTri);
        return <TipO tip={tipO} sp={sp} d={d} v={giaTri(tipO.bc, tipO.ma)} T={T} lenh={g.lenh} />;
      })()}
    </div>
  );
}
