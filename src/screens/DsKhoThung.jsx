import { useEffect, useMemo, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { useApp } from '../App.jsx';
import { IcBox, IcCheck, IcAlert, IcDown, IcRefresh } from '../lib/icons.jsx';
import { fmtN, tenNgan, ngayGio, lsGet, lsSet, useNhap, TrangThaiLuu, xuatHaiFile, xuatPhieu, tenPhieu, baoLoiXacNhan, NHAN_DIEN,
  useHoiGhiChu, ghiChuMacDinh, nhoGhiChu } from './dsChung.jsx';
import { mucDiem } from './DsGoiYThung.jsx';

// ============================================================================
// KHO THÙNG (v3.104.0) — quản lý & phân bổ thùng hàng đóng sẵn (hàng ở TK05005)
//   · Ô tổng quan: tổng thùng, chưa phân bổ, đã phân bổ (chờ xuất), đã xuất, cần kiểm tra
//   · Lưới THẺ THÙNG: mã, số cái thực (cộng ruột), số mã, thanh nhận diện mã, cảnh báo
//   · Bấm thẻ -> bảng chi tiết bên phải: ruột thùng, giá, giá sale, tồn TK05005, nhận diện
//   · Chọn đội -> tick thùng -> xem trước -> Xác nhận: tạo phiếu thùng (kho SA trên phiếu) + file
//   · Dùng lại làm "bộ chọn thùng" trong bàn Chia từng đội (prop chon)
// Dữ liệu: fn_ds_thung_bang / fn_ds_thung_lay / fn_ds_thung_duyet / fn_ds_xac_nhan (SQL 196)
// Phân bổ lưu bền ở phiếu — đồng bộ file thùng không làm thùng đã chia quay lại "chưa phân bổ".
// ============================================================================

const ST = {
  san: ['Chưa phân bổ', 'san'], kiem: ['Cần kiểm tra', 'kiem'], giao: ['Đã phân bổ · chờ xuất', 'giao'], xuat: ['Đã xuất', 'xuat'],
};
export const CANH = {
  chua_to_mau: ['Dòng thùng chưa tô màu', 'Dòng mã thùng trong file chưa được tô màu nên hệ thống chưa chắc đây là thùng. Tô màu dòng thùng trong sheet rồi đồng bộ lại, hoặc kiểm tra xong bấm “Đã kiểm tra — cho chia”.', 'kiem'],
  giong_ma_hang: ['Dòng tô màu giống mã hàng', 'Dòng này được tô màu (coi là thùng) nhưng trông giống mã hàng NS…. Có thể tô nhầm — kiểm tra file nguồn.', 'kiem'],
  ke_dong_nghi_van: ['Ruột có thể bị cắt', 'Dòng ngay sau thùng này bị nghi tô màu nhầm — ruột thùng có thể bị thiếu. Kiểm tra file nguồn.', 'kiem'],
  da_duyet: ['Đã kiểm tra', 'Người quản trị đã kiểm tra và cho phép chia thùng này.', 'ok'],
  lech_tong: ['Lệch số ghi', 'Số ghi ở dòng thùng khác tổng các dòng ruột — hệ thống LẤY THEO RUỘT THÙNG.', 'lech'],
  roi_nguon: ['Đã rời file nguồn', 'Thùng đã giao nhưng không còn trong file thùng đóng sẵn. Kiểm tra kho đã xuất chưa, rồi bấm “Đã xuất” ở Phiếu đã chia.', 'do'],
  doi_nd: ['File nguồn đổi ruột', 'Ruột thùng trong file đã đổi SAU khi giao. Phiếu vẫn giữ số lúc giao — kiểm tra lại; cần thì huỷ phiếu rồi chia lại.', 'do'],
};
const SAP = [['tt', 'Thứ tự trong file'], ['hop', 'Hợp với đội nhất (điểm)'], ['khop', 'Nhiều số khớp tìm nhất'], ['n_g', 'Nhiều cái nhất'], ['sm_g', 'Nhiều mã nhất'], ['ma', 'Mã thùng A → Z']];
// so khớp: chữ hoa, bỏ dấu, Đ = D, bỏ khoảng trắng — gõ "dn052", "ĐN052", "156" đều ra
const chuan = (s) => (s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/Đ/g, 'D').replace(/\s+/g, '');
// 'mã:sl|mã:sl' (SQL 197) -> [{m, s}]; bản cũ chỉ có 'mã|mã' vẫn đọc được (s = 0)
const tachMa = (chuoi) => (chuoi ? chuoi.split('|').filter(Boolean).map((p) => {
  const i = p.lastIndexOf(':'); const so = i > 0 ? +p.slice(i + 1) : NaN;
  return Number.isFinite(so) ? { m: p.slice(0, i), s: so } : { m: p, s: 0 };
}) : []);
const doiTen = (m) => (m || '').replace(/^DOISALE/, 'Đội ');
const oSheet = (vt) => (vt ? 'ô ' + vt.split('!').pop() : '');
const tien = (n) => (n ? Math.round(n / 1000).toLocaleString('vi') + 'k' : '—');

export default function KhoThung({ dsDoi = [], chon = null }) {
  const { user, baoToast } = useApp();
  const nguoi = user?.ma_dang_nhap || '';
  const [bang, setBang] = useState(null);
  const [dang, setDang] = useState(false);
  const [loc, setLoc] = useState(() => (chon ? 'san' : lsGet('kt_loc') || 'san'));
  const [nhom, setNhom] = useState('');
  const [q, setQ] = useState('');
  const [sap, setSap] = useState(() => (chon?.diem ? 'hop' : lsGet('kt_sap') || 'tt'));
  const [mo, setMo] = useState(null);
  const [ctMap, setCtMap] = useState({});
  const [doi, setDoi] = useState(() => chon?.doi || lsGet('kt_doi') || '');
  const [xemTruoc, setXemTruoc] = useState(false);
  const [gui, setGui] = useState(false);
  const [hoiGhiChu, hopGhiChu] = useHoiGhiChu();
  const [xong, setXong] = useState(null);
  const [soHien, setSoHien] = useState(240);

  useEffect(() => { if (!chon) { lsSet('kt_loc', loc); lsSet('kt_sap', sap); lsSet('kt_doi', doi); } }, [loc, sap, doi, chon]);

  // Giỏ thùng: bàn Kho thùng -> nháp bền theo đội (máy + máy chủ); bộ chọn trong bàn chia -> tạm
  const [nhap, datNhap, ttLuu, xoaNhap] = useNhap(nguoi, 'thung:' + (doi || '-'), { thung: [] });
  const [chonTam, setChonTam] = useState(() => chon?.daChon || []);
  const gio = chon ? chonTam : (nhap.thung || []);
  const datGio = (fn) => (chon ? setChonTam(fn) : datNhap((d) => ({ ...d, thung: fn(d.thung || []) })));

  // ĐIỂM PHÙ HỢP với đội đang chọn (SQL 200): bộ chọn trong bàn chia nhận sẵn; bàn Kho thùng tự hỏi máy chủ
  const [diemTu, setDiemTu] = useState(null);
  useEffect(() => {
    if (chon || !doi) { setDiemTu(null); return undefined; }
    let huy = false;
    sb.rpc('fn_ds_thung_goi_y', { p_doi: doi, p_cua_so: lsGet('cua_so') || 28, p_muc_tieu: lsGet('muc_tieu') || 21,
      p_he_so: lsGet('he_so') || 100, p_top: 10 })
      .then(({ data }) => { if (!huy && data && !data.loi) setDiemTu({ diem: data.diem || {}, cfg: data.cfg || {}, giu: data.giu || [] }); });
    return () => { huy = true; };
  }, [doi, chon]);   // eslint-disable-line
  const diemMap = chon ? chon.diem : diemTu?.diem;
  const cfgDiem = (chon ? chon.cfg : diemTu?.cfg) || {};

  const tai = async () => {
    setDang(true);
    const { data, error } = await sb.rpc('fn_ds_thung_bang');
    setDang(false);
    if (error) {
      baoToast(/fn_ds_thung_bang|schema cache|does not exist/i.test(error.message)
        ? 'Kho thùng chưa sẵn sàng — cần chạy SQL 196 trên Supabase' : 'Lỗi tải kho thùng: ' + error.message);
      setBang((b) => b || { ds: [] }); return;
    }
    setBang(data); setCtMap({});
  };
  useEffect(() => { tai(); }, []);   // eslint-disable-line

  const ds = useMemo(() => (bang?.ds || []).map((b) => {
    const items = tachMa(b.ma);
    return { ...b, items, itemsC: items.map((x) => chuan(x.m)), tC: chuan(b.t) };
  }), [bang]);
  const theoMa = useMemo(() => Object.fromEntries(ds.map((b) => [b.t, b])), [ds]);

  // nạp chi tiết thùng đang mở + thùng trong giỏ (khi xem trước)
  const canCt = useMemo(() => [...new Set([mo, ...(xemTruoc ? gio : [])].filter((t) => t && theoMa[t] && !ctMap[t]))], [mo, xemTruoc, gio, theoMa, ctMap]);
  useEffect(() => {
    if (!canCt.length) return;
    sb.rpc('fn_ds_thung_lay', { p_ma: canCt }).then(({ data, error }) => {
      if (error) { baoToast('Lỗi tải ruột thùng: ' + error.message); return; }
      setCtMap((m) => { const n = { ...m }; (data || []).forEach((x) => { n[x.ma_thung] = x; }); return n; });
    });
  }, [canCt.join('|')]);   // eslint-disable-line

  // ---------- tổng quan ----------
  const kpi = useMemo(() => {
    const k = { tong: 0, cai: 0, san: 0, sanCai: 0, sanMa: new Set(), giao: 0, giaoCai: 0, xuat: 0, kiem: 0, canhDo: 0, lech: 0, cc: 0, dm: 0, dmMa: 0 };
    ds.forEach((b) => {
      if (b.st !== 'xuat') { k.tong++; k.cai += b.n; }
      k[b.st]++;
      if (b.st === 'san') { k.sanCai += b.n; b.items.forEach((x) => k.sanMa.add(x.m)); }
      if (b.st === 'giao') k.giaoCai += b.n;
      if (b.canh.includes('doi_nd') || b.canh.includes('roi_nguon')) k.canhDo++;
      if (b.st !== 'xuat' && b.canh.includes('lech_tong')) k.lech++;
      if (b.st !== 'xuat' && b.cc) k.cc++;
      if (b.st !== 'xuat' && b.dm) { k.dm++; k.dmMa += b.dm; }
    });
    return k;
  }, [ds]);

  // ---------- lọc / tìm / sắp ----------
  const qq = chuan(q);
  const hopLoc = (b) => loc === 'tat' ? true
    : loc === 'canh' ? (b.canh.includes('doi_nd') || b.canh.includes('roi_nguon'))
    : loc === 'lech' ? (b.st !== 'xuat' && b.canh.includes('lech_tong'))
    : loc === 'dm' ? (b.st !== 'xuat' && b.dm > 0)
    : loc === 'cc' ? (b.st !== 'xuat' && b.cc > 0)
    : b.st === loc;
  const nhomDs = useMemo(() => {
    const m = {};
    ds.forEach((b) => { if (hopLoc(b)) m[b.g || '—'] = (m[b.g || '—'] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [ds, loc]);   // eslint-disable-line
  // Tìm: theo mã thùng HOẶC 1 phần mã sản phẩm trong ruột (XM156, 156, XM156-M, mã đầy đủ).
  // Mỗi thùng tính SỐ KHỚP = cộng số lượng các mã khớp (khớp mã thùng -> cả thùng).
  const khopTim = useMemo(() => {
    if (!qq) return null;
    const m = {};
    ds.forEach((b) => {
      if (b.tC.includes(qq)) { m[b.t] = { sl: b.n, ma: b.items.length, theoThung: true, ds: [] }; return; }
      const ds2 = b.items.filter((x, i) => b.itemsC[i].includes(qq));
      if (ds2.length) m[b.t] = { sl: ds2.reduce((a, x) => a + x.s, 0), ma: ds2.length, theoThung: false, ds: ds2 };
    });
    return m;
  }, [ds, qq]);
  const hien = useMemo(() => {
    const v = ds.filter((b) => hopLoc(b) && (!nhom || (b.g || '—') === nhom) && (!khopTim || khopTim[b.t]));
    const f = { tt: (a, b) => a.tt - b.tt, n_g: (a, b) => b.n - a.n || a.tt - b.tt, sm_g: (a, b) => b.sm - a.sm || a.tt - b.tt,
      ma: (a, b) => a.t.localeCompare(b.t), khop: (a, b) => (khopTim?.[b.t]?.sl || 0) - (khopTim?.[a.t]?.sl || 0) || a.tt - b.tt,
      hop: (a, b) => (diemMap?.[b.t] ?? -1) - (diemMap?.[a.t] ?? -1) || a.tt - b.tt }[sap];
    return v.sort(f);
  }, [ds, loc, nhom, khopTim, sap, diemMap]);   // eslint-disable-line
  const tongKhop = useMemo(() => (khopTim ? hien.reduce((a, b) => a + (khopTim[b.t]?.sl || 0), 0) : 0), [hien, khopTim]);
  // đang tìm mà vẫn xếp "thứ tự file" -> tự chuyển sang "nhiều số khớp nhất"; xoá tìm -> trả lại
  const [sapTruocTim, setSapTruocTim] = useState(null);
  useEffect(() => {
    if (qq && sapTruocTim == null) { setSapTruocTim(sap); if (sap === 'tt') setSap('khop'); }
    if (!qq && sapTruocTim != null) { if (sap === 'khop') setSap(sapTruocTim === 'khop' ? 'tt' : sapTruocTim); setSapTruocTim(null); }
  }, [qq]);   // eslint-disable-line
  useEffect(() => { setSoHien(240); }, [loc, nhom, qq, sap]);

  // ---------- giỏ ----------
  const gioHopLe = gio.filter((t) => theoMa[t]?.st === 'san');
  const gioLoi = gio.filter((t) => !theoMa[t] || theoMa[t].st !== 'san');
  const tongGio = useMemo(() => {
    const ma = new Set(); let cai = 0, cc = 0;
    gioHopLe.forEach((t) => { const b = theoMa[t]; cai += b.n; cc += b.cc; b.items.forEach((x) => ma.add(x.m)); });
    return { cai, ma: ma.size, cc };
  }, [gioHopLe.join('|'), theoMa]);   // eslint-disable-line
  const doiSx = useMemo(() => [...dsDoi].sort((a, b) => a.ma_ch.localeCompare(b.ma_ch)), [dsDoi]);
  const tenDoi = tenNgan(doiSx.find((d) => d.ma_ch === doi)?.ten) || doi;

  const batChon = (b) => {
    if (b.st !== 'san') {
      baoToast(b.st === 'kiem' ? `Thùng ${b.t} đang chờ kiểm tra — mở thùng để xem lý do` : `Thùng ${b.t} đã phân bổ cho ${doiTen(b.doi)}`);
      return;
    }
    if (!doi) { baoToast('Chọn đội nhận ở thanh dưới trước'); return; }
    const dang = gio.includes(b.t);
    datGio((g) => (g.includes(b.t) ? g.filter((x) => x !== b.t) : [...g, b.t]));
    // cảnh báo nhẹ khi chọn thùng ít hợp đội (vẫn cho chọn)
    const d = diemMap?.[b.t];
    if (!dang && d != null && mucDiem(d, cfgDiem) === 'it') baoToast(`Lưu ý: thùng ${b.t} ít phù hợp với ${tenDoi} (${d} điểm) — vẫn đã chọn`);
  };

  // ---------- duyệt thùng nghi vấn ----------
  const duyet = async (b, bo) => {
    const hoi = bo ? `Bỏ đánh dấu “đã kiểm tra” của thùng ${b.t}?`
      : `Xác nhận đã kiểm tra thùng ${b.t} (sheet ${b.g || ''}, ${oSheet(b.vt)}) và cho phép chia?\nNếu sau này file đổi lại cờ khác, thùng sẽ phải kiểm tra lại.`;
    if (!window.confirm(hoi)) return;
    const { data, error } = await sb.rpc('fn_ds_thung_duyet', { p_ma: b.t, p_nguoi: nguoi, p_bo: !!bo });
    if (error || !data?.ok) { baoToast('Không cập nhật được: ' + (error?.message || data?.loi)); return; }
    baoToast(bo ? 'Đã bỏ đánh dấu' : `Thùng ${b.t} đã được cho phép chia`);
    tai();
  };

  // ---------- xác nhận ----------
  const xacNhan = async () => {
    if (chon) { chon.onXong(gioHopLe); chon.onDong(); return; }
    if (!doi) { baoToast('Chọn đội nhận'); return; }
    if (!gioHopLe.length) { baoToast('Chưa chọn thùng nào còn chia được'); return; }
    // v3.112.0: hộp ghi chú thay cho hộp hỏi lại — Huỷ = không cấp
    const ghiChu = await hoiGhiChu({ macDinh: ghiChuMacDinh(doi, doiSx.find((d) => d.ma_ch === doi)?.ten || tenDoi), tieuDe: `Cấp ${gioHopLe.length} thùng · ${fmtN(tongGio.cai)} cái cho ${tenDoi}`,
      nutXong: 'Cấp thùng & xuất file', phu: 'Phiếu ghi kho SA, hàng lấy ở TK05005. Tạo phiếu thùng + xuất file.' });
    if (ghiChu === null) return;
    nhoGhiChu(doi, ghiChu);
    setGui(true);
    const { data, error } = await sb.rpc('fn_ds_xac_nhan', { p: { loai: 'doi', nguoi, khoa_nhap: 'thung:' + doi, dong: [], ghi_chu: ghiChu || null,
      thung: gioHopLe.map((t) => ({ ma_thung: t, ma_ch: doi })) } });
    setGui(false);
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    if (!data?.ok) { baoLoiXacNhan(data, baoToast); tai(); return; }
    try { await xuatHaiFile(data, ghiChu); } catch { baoToast('Đã xác nhận nhưng xuất file lỗi — tải lại ở Phiếu đã chia'); }
    await xoaNhap();
    setXong({ ...data, doi, so: gioHopLe.length, cai: tongGio.cai });
    setXemTruoc(false);
    baoToast(`Đã cấp ${gioHopLe.length} thùng cho ${tenDoi} — ${tenPhieu(data)}`);
    tai();
  };

  const bMo = mo ? theoMa[mo] : null;

  return (
    <div className={'kt' + (chon ? ' kt-chon' : '')}>
      {hopGhiChu}
      {/* ===== Tổng quan ===== */}
      <div className="kt-kpi">
        <button className={'kt-o o-tong' + (loc === 'tat' ? ' on' : '')} onClick={() => setLoc('tat')}>
          <small>Thùng hiện có</small><b>{fmtN(kpi.tong)}</b><span>{fmtN(kpi.cai)} cái trong thùng</span>
        </button>
        <button className={'kt-o o-san' + (loc === 'san' ? ' on' : '')} onClick={() => setLoc('san')}>
          <small>Chưa phân bổ</small><b>{fmtN(kpi.san)}</b><span>{fmtN(kpi.sanCai)} cái · {fmtN(kpi.sanMa.size)} mã</span>
        </button>
        <button className={'kt-o o-giao' + (loc === 'giao' ? ' on' : '')} onClick={() => setLoc('giao')}>
          <small>Đã phân bổ · chờ xuất</small><b>{fmtN(kpi.giao)}</b><span>{fmtN(kpi.giaoCai)} cái · đã xuất {fmtN(kpi.xuat)}</span>
        </button>
        <button className={'kt-o o-kiem' + (loc === 'kiem' ? ' on' : '')} onClick={() => setLoc('kiem')}>
          <small>Chờ xử lý · cần kiểm tra</small><b>{fmtN(kpi.kiem)}</b><span>file lệch quy tắc — chặn chia</span>
        </button>
        <button className={'kt-o o-canh' + (loc === 'canh' ? ' on' : '') + (kpi.canhDo ? ' co' : '')} onClick={() => setLoc('canh')}>
          <small>Thùng đã giao bị đổi</small><b>{fmtN(kpi.canhDo)}</b><span>file nguồn đổi ruột / mất thùng</span>
        </button>
      </div>
      {(kpi.lech > 0 || kpi.cc > 0 || kpi.dm > 0) && (
        <div className="kt-ghi-nho">
          {kpi.lech > 0 && <button className={loc === 'lech' ? 'on' : ''} onClick={() => setLoc(loc === 'lech' ? 'san' : 'lech')}>
            <i className="d-lech" />{kpi.lech} thùng số ghi ≠ cộng ruột — đã lấy theo ruột</button>}
          {kpi.dm > 0 && <button className={loc === 'dm' ? 'on' : ''} onClick={() => setLoc(loc === 'dm' ? 'san' : 'dm')}
            title="Mã có trong DATA SẢN PHẨM nhưng không có trong dữ liệu tồn kho (không kho nào có) — kho kiểm khi xuất">
            <i className="d-dm" />{kpi.dm} thùng có {kpi.dmMa} mã chỉ có trong DATA SẢN PHẨM — bấm để xem</button>}
          {kpi.cc > 0 && <button className={loc === 'cc' ? 'on' : ''} onClick={() => setLoc(loc === 'cc' ? 'san' : 'cc')}>
            <i className="d-cc" />{kpi.cc} thùng có mã chưa nhận diện — vẫn giữ mã, vẫn chia được</button>}
        </div>
      )}

      {/* ===== Lọc ===== */}
      <div className="kt-tool">
        <input className="flt-in" placeholder="Tìm mã thùng hoặc mã sản phẩm trong thùng (vd TG-5020, XM179)…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="ch-sel" value={sap} onChange={(e) => setSap(e.target.value)}>
          {SAP.filter(([k]) => k !== 'hop' || diemMap).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select>
        <button className="btn btn-ghost" onClick={tai} disabled={dang}><IcRefresh /> {dang ? 'Đang tải…' : 'Tải lại'}</button>
        <span className="ch-dem">{khopTim ? <><b className="kt-tim-tong">{fmtN(tongKhop)}</b> cái khớp “{q.trim()}” trong </> : null}{fmtN(hien.length)} thùng</span>
      </div>
      {nhomDs.length > 1 && (
        <div className="kt-nhom">
          <button className={!nhom ? 'on' : ''} onClick={() => setNhom('')}>Tất cả nhóm</button>
          {nhomDs.map(([g, n]) => <button key={g} className={nhom === g ? 'on' : ''} onClick={() => setNhom(nhom === g ? '' : g)}>{g} <i>{n}</i></button>)}
        </div>
      )}

      <div className={'kt-wrap' + (bMo ? ' co-mo' : '')}>
        {/* ===== Lưới thẻ thùng ===== */}
        <div>
          {!bang ? <div className="card dsl-trong">Đang tải kho thùng…</div>
            : hien.length === 0 ? <div className="card dsl-trong">Không có thùng nào khớp.</div> : (
            <div className="kt-luoi">
              {hien.slice(0, soHien).map((b) => (
                <TheThung key={b.t} b={b} khop={khopTim?.[b.t]} chon={gio.includes(b.t)} dangMo={mo === b.t} diem={diemMap?.[b.t]} cfgDiem={cfgDiem}
                  onMo={() => setMo(mo === b.t ? null : b.t)} onChon={() => batChon(b)} coDoi={!!doi} />
              ))}
            </div>
          )}
          {hien.length > soHien && <button className="btn kt-them" onClick={() => setSoHien((n) => n + 240)}>Xem thêm {fmtN(hien.length - soHien)} thùng</button>}
        </div>

        {/* ===== Chi tiết thùng ===== */}
        {bMo && (
          <ChiTiet b={bMo} ct={ctMap[bMo.t]} qq={qq} q={q} khop={khopTim?.[bMo.t]} trongGio={gio.includes(bMo.t)} coDoi={!!doi} tenDoi={tenDoi}
            onDong={() => setMo(null)} onChon={() => batChon(bMo)} onDuyet={(bo) => duyet(bMo, bo)} />
        )}
      </div>

      {/* ===== Xem trước giỏ ===== */}
      {xemTruoc && gioHopLe.length > 0 && <XemTruoc gio={gioHopLe} ctMap={ctMap} onDong={() => setXemTruoc(false)} />}

      {/* ===== Giỏ thùng / xác nhận ===== */}
      <div className="kt-gio">
        <div className="kt-gio-doi">
          <span>{chon ? 'Chọn thùng cho' : 'Cấp thùng cho'}</span>
          {chon ? <b>{tenDoi}</b> : (
            <select value={doi} onChange={(e) => { setDoi(e.target.value); setXong(null); }}>
              <option value="">— chọn đội —</option>
              {doiSx.map((d) => <option key={d.ma_ch} value={d.ma_ch}>{tenNgan(d.ten)}</option>)}
            </select>
          )}
          {!chon && doi && <TrangThaiLuu tt={ttLuu} />}
        </div>
        <div className="kt-gio-so">
          {gioHopLe.length ? <><b>{gioHopLe.length}</b> thùng · <b>{fmtN(tongGio.cai)}</b> cái · {fmtN(tongGio.ma)} mã</> : <span className="mo">Bấm ô tròn trên thẻ để chọn thùng</span>}
          {tongGio.cc > 0 && <em className="kt-tag do">{tongGio.cc} mã chưa nhận diện — vẫn vào phiếu</em>}
          {gioLoi.length > 0 && (
            <em className="kt-tag do" title={gioLoi.join(', ')}>{gioLoi.length} thùng không còn chia được — tự bỏ qua
              <button className="kt-x" onClick={() => datGio((g) => g.filter((t) => !gioLoi.includes(t)))}>bỏ</button></em>
          )}
        </div>
        <div className="kt-gio-chip">
          {gioHopLe.slice(0, 8).map((t) => (
            <span key={t} className="ch-thung-chip"><b>{t}</b> {theoMa[t]?.n}
              <button onClick={() => datGio((g) => g.filter((x) => x !== t))} title="Bỏ thùng">×</button></span>
          ))}
          {gioHopLe.length > 8 && <span className="ch-thung-chip">+{gioHopLe.length - 8}</span>}
        </div>
        <div className="kt-gio-nut">
          {xong && !chon && xong.doi === doi && !gioHopLe.length ? (
            <span className="kt-xong"><IcCheck /> {xong.ma_phieu_thung} · {xong.so} thùng · {fmtN(xong.cai)} cái · đã xuất file
              <button className="btn btn-ghost" onClick={() => xuatPhieu(xong.id_thung, xong.ma_phieu_thung, lsGet('ghi_chu.' + xong.doi)).catch((e) => baoToast('Lỗi: ' + e.message))}><IcDown /> Tải lại</button></span>
          ) : <>
            <button className="btn btn-ghost" disabled={!gioHopLe.length} onClick={() => setXemTruoc((v) => !v)}>{xemTruoc ? 'Ẩn xem trước' : 'Xem trước ruột'}</button>
            {gio.length > 0 && <button className="btn btn-ghost" onClick={() => datGio(() => [])}>Bỏ hết</button>}
            {chon && <button className="btn btn-ghost" onClick={chon.onDong}>Đóng</button>}
            <button className="btn btn-ai" disabled={gui || (!chon && !gioHopLe.length)} onClick={xacNhan}>
              {chon ? <><IcCheck /> Đưa {gioHopLe.length} thùng vào bàn chia</> : <><IcDown /> {gui ? 'Đang tạo phiếu…' : `Xác nhận cấp ${gioHopLe.length || ''} thùng & xuất file`}</>}
            </button>
          </>}
        </div>
      </div>
      {!chon && (
        <div className="tq-ghi ch-ghi">
          Số trên thẻ = cộng các dòng ruột thùng (không lấy số ghi ở dòng thùng). Thanh màu: <i className="d-tk" /> có trong tồn kho
          · <i className="d-dm" /> chỉ có trong DATA SẢN PHẨM · <i className="d-cc" /> chưa nhận diện (vẫn giữ mã, kho kiểm khi xuất).
          Phiếu thùng ghi kho SA (mũ BH SA05001 / nón vải SA05002), hàng lấy ở TK05005, không cần SA đủ tồn. Thùng đã cấp không quay lại “chưa phân bổ” khi đồng bộ.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Thẻ thùng
// ---------------------------------------------------------------------------
function TheThung({ b, khop, chon, dangMo, onMo, onChon, coDoi, diem, cfgDiem }) {
  const ok = b.sm - b.cc - b.dm;
  const theoMa = khop && !khop.theoThung;
  const canhDo = b.canh.filter((c) => c === 'doi_nd' || c === 'roi_nguon');
  return (
    <div className={`kt-the st-${b.st}${chon ? ' chon' : ''}${dangMo ? ' mo' : ''}`} onClick={onMo} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onMo(); if (e.key === ' ') { e.preventDefault(); onChon(); } }}>
      {b.st === 'san' && (
        <button className={'kt-tick' + (coDoi ? '' : ' mo-nhat')} onClick={(e) => { e.stopPropagation(); onChon(); }}
          title={coDoi ? (chon ? 'Bỏ khỏi đợt chia' : 'Chọn thùng này') : 'Chọn đội nhận trước'}>{chon && <IcCheck />}</button>
      )}
      <div className="kt-ma">{b.t}</div>
      {diem != null && b.st === 'san' && <span className={'kt-diem gy-chip m-' + mucDiem(diem, cfgDiem)} title={`Điểm phù hợp với đội đang chọn: ${diem}/100`}>{diem}</span>}
      {theoMa ? (
        <div className="kt-so khop"><b>{fmtN(khop.sl)}</b><span>cái khớp · {khop.ma} mã<small>/ {fmtN(b.n)} cả thùng</small></span></div>
      ) : (
        <div className="kt-so"><b>{fmtN(b.n)}</b><span>cái · {b.sm} mã</span></div>
      )}
      <div className="kt-thanh" title={`${ok} mã có trong tồn kho · ${b.dm} mã chỉ có trong DATA SẢN PHẨM · ${b.cc} mã chưa nhận diện`}>
        <i className="i-tk" style={{ flex: ok }} />{b.dm > 0 && <i className="i-dm" style={{ flex: b.dm }} />}{b.cc > 0 && <i className="i-cc" style={{ flex: b.cc }} />}
      </div>
      {theoMa && <div className="kt-khop" title={khop.ds.map((x) => `${x.m}: ${x.s}`).join('\n')}>
        {khop.ds.slice(0, 3).map((x) => `${x.m.replace(/^NS\d{3}/, '')} ×${x.s}`).join(' · ')}{khop.ds.length > 3 ? ` +${khop.ds.length - 3}` : ''}</div>}
      <div className="kt-chan">
        <span className="kt-g">{b.g || '—'}</span>
        {(b.st === 'giao' || b.st === 'xuat') && <span className="kt-tag doi">{doiTen(b.doi)}</span>}
        {b.st === 'kiem' && <span className="kt-tag lech"><IcAlert /> kiểm tra</span>}
        {b.canh.includes('da_duyet') && <span className="kt-tag ok">đã kiểm</span>}
        {b.canh.includes('lech_tong') && <span className="kt-tag lech" title={`Dòng thùng ghi ${b.ghi}, cộng ruột ${b.n} → lấy ${b.n}`}>ghi {b.ghi}</span>}
        {b.dm > 0 && <span className="kt-tag lech" title="Mã chỉ có trong DATA SẢN PHẨM (không có trong tồn kho)">{b.dm} mã DM</span>}
        {b.cc > 0 && <span className="kt-tag do">{b.cc} mã ?</span>}
        {canhDo.length > 0 && <span className="kt-tag do"><IcAlert /> {CANH[canhDo[0]][0]}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bảng chi tiết 1 thùng
// ---------------------------------------------------------------------------
function ChiTiet({ b, ct, qq, q, khop, trongGio, coDoi, tenDoi, onDong, onChon, onDuyet }) {
  const { baoToast } = useApp();
  const daGiao = b.st === 'giao' || b.st === 'xuat';
  const dongGoc = (daGiao ? ct?.ct_giao || ct?.ct : ct?.ct) || [];
  // đang tìm theo mã sản phẩm: dòng khớp nổi lên đầu + tô sáng
  const timMa = !!(qq && khop && !khop.theoThung);
  const laKhop = (x) => timMa && chuan(x.m).includes(qq);
  const dong = timMa ? [...dongGoc].sort((a, c) => laKhop(c) - laKhop(a)) : dongGoc;
  const theoNguon = useMemo(() => Object.fromEntries((ct?.ct_nguon || []).map((x) => [x.m, x.s])), [ct]);
  const soSanh = daGiao && b.canh.includes('doi_nd');
  const moiTrongNguon = soSanh ? (ct?.ct_nguon || []).filter((x) => !dong.some((d) => d.m === x.m)) : [];
  const nghiVan = b.canh.filter((c) => ['chua_to_mau', 'giong_ma_hang', 'ke_dong_nghi_van'].includes(c));
  return (
    <aside className="kt-ct card">
      <div className={'kt-ct-dau st-' + b.st}>
        <div>
          <span className={'kt-pill ' + ST[b.st][1]}>{ST[b.st][0]}</span>
          <h4>{b.t}</h4>
          <small>Sheet “{b.g || '—'}”{b.vt ? ' · ' + oSheet(b.vt) : ''}</small>
        </div>
        <button className="kt-dong" onClick={onDong} title="Đóng">×</button>
      </div>
      <div className="kt-ct-so">
        <div><b>{fmtN(b.n)}</b><span>cái thực (cộng ruột)</span></div>
        <div><b>{b.ghi ?? '—'}</b><span>số ghi ở dòng thùng</span></div>
        <div><b>{b.sm}</b><span>mã khác nhau</span></div>
      </div>
      {timMa && (
        <div className="kt-ct-khop"><b>{fmtN(khop.sl)}</b> cái khớp “{q.trim()}” · {khop.ma} mã <span>/ {fmtN(b.n)} cả thùng — dòng khớp tô sáng, xếp lên đầu</span></div>
      )}
      {daGiao && (
        <div className="kt-ct-giao">
          <IcBox /> Đã giao <b>{doiTen(b.doi)}</b> · {b.mp} · {ngayGio(b.luc)} · {b.ng || '—'}
          <button className="btn btn-ghost" onClick={() => xuatPhieu(b.pid, b.mp).catch((e) => baoToast('Lỗi: ' + e.message))}><IcDown /> File phiếu</button>
        </div>
      )}
      {b.canh.length > 0 && (
        <div className="kt-canh-ds">
          {b.canh.map((c) => CANH[c] && (
            <div key={c} className={'kt-canh ' + CANH[c][2]}>
              <b>{CANH[c][0]}{c === 'lech_tong' ? `: ghi ${b.ghi}, ruột ${b.n} → lấy ${b.n}` : ''}</b>
              <span>{CANH[c][1]}</span>
            </div>
          ))}
        </div>
      )}
      <div className="kt-sp">
        {!ct ? <div className="dsl-trong">Đang tải ruột thùng…</div> : (
          <table className="kt-tbl">
            <thead><tr><th className="l">Mã · tên</th><th>SL</th>{soSanh && <th title="Số trong file nguồn hiện tại">File nay</th>}<th>Giá</th><th>Sale</th><th title="Tồn kho lưu hàng trả TK05005">TK</th></tr></thead>
            <tbody>
              {dong.map((x) => {
                const nay = soSanh ? theoNguon[x.m] ?? 0 : null;
                return (
                  <tr key={x.m} className={'nd-' + x.nd + (soSanh && nay !== x.s ? ' doi' : '') + (laKhop(x) ? ' khop' : '')}>
                    <td className="l">
                      <b>{x.m}</b>
                      {x.nd !== 'ton_kho' && <i className={'kt-nd ' + x.nd} title={NHAN_DIEN[x.nd]}>{x.nd === 'chua_co' ? 'chưa nhận diện' : 'danh mục'}</i>}
                      <small>{x.ten || x.n3 || (x.nd === 'chua_co' ? 'Không có trong tồn kho lẫn DATA SẢN PHẨM — giữ nguyên mã' : '—')}</small>
                    </td>
                    <td className="dam">{x.s}</td>
                    {soSanh && <td className={nay !== x.s ? 'vuot' : 'mo'}>{nay}</td>}
                    <td className="phu">{tien(x.gia)}</td>
                    <td className={x.sale ? 'sale' : 'mo'}>{x.sale ? tien(x.sale) : '·'}</td>
                    <td className={x.b && (x.tk ?? 0) < x.s ? 'vuot' : 'phu'} title={x.b ? `TK05005 còn ${x.tk ?? 0}` : 'Chưa có barcode'}>{x.b ? x.tk ?? 0 : '—'}</td>
                  </tr>
                );
              })}
              {moiTrongNguon.map((x) => (
                <tr key={'moi' + x.m} className="doi"><td className="l"><b>{x.m}</b><small>chỉ có trong file nay (lúc giao không có)</small></td>
                  <td className="mo">0</td><td className="vuot">{x.s}</td><td /><td /><td /></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="kt-ct-chan">
        {b.st === 'san' && (
          <button className={'btn ' + (trongGio ? 'btn-ghost' : 'btn-ai')} onClick={onChon} disabled={!coDoi} title={coDoi ? '' : 'Chọn đội nhận ở thanh dưới trước'}>
            {trongGio ? 'Bỏ khỏi đợt chia' : <><IcCheck /> Chọn cho {coDoi ? tenDoi : '…'}</>}
          </button>
        )}
        {b.st === 'kiem' && nghiVan.length > 0 && <button className="btn btn-ai" onClick={() => onDuyet(false)}><IcCheck /> Đã kiểm tra — cho chia</button>}
        {b.canh.includes('da_duyet') && b.st === 'san' && <button className="btn btn-ghost" onClick={() => onDuyet(true)}>Bỏ đánh dấu đã kiểm</button>}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Xem trước ruột các thùng đã chọn (gộp theo mã)
// ---------------------------------------------------------------------------
function XemTruoc({ gio, ctMap, onDong }) {
  const dong = useMemo(() => {
    const m = {};
    gio.forEach((t) => (ctMap[t]?.ct || []).forEach((x) => {
      const d = (m[x.m] = m[x.m] || { m: x.m, ten: x.ten || x.n3, nd: x.nd, s: 0, thung: [] });
      d.s += x.s; d.thung.push(t);
    }));
    return Object.values(m).sort((a, b) => b.s - a.s || a.m.localeCompare(b.m));
  }, [gio, ctMap]);
  const thieu = gio.filter((t) => !ctMap[t]).length;
  return (
    <div className="card kt-xt">
      <div className="kt-xt-dau"><b>Ruột {gio.length} thùng — {dong.length} mã</b>{thieu > 0 && <span className="mo"> · đang tải {thieu} thùng…</span>}
        <button className="kt-dong" onClick={onDong}>×</button></div>
      <table className="kt-tbl">
        <thead><tr><th className="l">Mã · tên</th><th>Tổng SL</th><th className="l">Từ thùng</th></tr></thead>
        <tbody>
          {dong.map((x) => (
            <tr key={x.m} className={'nd-' + x.nd}>
              <td className="l"><b>{x.m}</b>{x.nd === 'chua_co' && <i className="kt-nd chua_co">chưa nhận diện</i>}<small>{x.ten || '—'}</small></td>
              <td className="dam">{x.s}</td>
              <td className="l phu">{x.thung.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
