// ============================================================================
// NEW - 3.159.2: BÀN CHIA ĐỘI SALE TRÊN ĐIỆN THOẠI (≤ 760px)
//   Anh: "xem trên điện thoại phải gọn, không cuộn ngang, không phải zoom, nhìn là biết chia đúng hay sai".
//   - Không bảng nhiều cột: mỗi mã 1 thẻ — bán/ngày · đang có · thùng · kho, dòng KẾT LUẬN (✓ đủ / ✕ thiếu / ⚠ cần xem), ô Chia.
//   - Khối KIỂM TRA ở đầu: bao nhiêu mã đang bán đủ "Chia đủ" ngày, bao nhiêu thiếu (vì sao), vượt kho, thùng đúng nhu cầu / dư.
//   - Dùng NGUYÊN số của bàn chia (dong / tong) — không tính lại riêng.
//   - Ô nhập chữ 16px (iPhone không tự phóng to khi bấm vào ô).
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { IcAlert, IcCheck, IcDown, IcSpark, IcBox } from '../lib/icons.jsx';
import { fmtN, soFile } from './dsChung.jsx';
import { kGia } from './dsLamTron.js';
import { kiemPhuongAn, danhGiaDong, laMaBan, boDau } from './dsAiChiaDoi.js';

const HEP = '(max-width: 760px)';
export function useHep() {
  const [hep, setHep] = useState(() => typeof window !== 'undefined' && window.matchMedia(HEP).matches);
  useEffect(() => {
    const m = window.matchMedia(HEP);
    const f = () => setHep(m.matches);
    m.addEventListener?.('change', f);
    return () => m.removeEventListener?.('change', f);
  }, []);
  return hep;
}

const n1 = (v) => (v == null ? '—' : v > 365 ? '>1 năm' : (Math.round(v * 10) / 10).toLocaleString('vi'));
const TAB = [['chia', 'Đang chia'], ['thieu', 'Còn thiếu'], ['canh', 'Cần xem'], ['tat', 'Tất cả']];

function Dong({ x, d, mucTieu, cuaSo, datSo }) {
  const sauCai = x.co + x.nhan;
  const sauNgay = x.v > 0 ? sauCai / x.v : null;
  let kq;
  if (d === 'vuot') kq = `Chia ${fmtN(x.them)} vượt kho — kho chỉ còn ${fmtN(x.kd)}`;
  else if (d === 'thieu') {
    kq = `Sau chia ${fmtN(sauCai)} cái — đủ ${n1(sauNgay)} ngày, THIẾU ${fmtN(x.muc - sauCai)} cái`
      + (x.thieu > 0 ? ` (kho chỉ còn ${fmtN(x.kd)})` : x.them < x.goiY ? ' (chưa chia đủ gợi ý)' : '');
  } else if (laMaBan(x)) kq = `Sau chia ${fmtN(sauCai)} cái — đủ ${n1(sauNgay)} ngày`;
  else if (x.ban === 0 && !x.pk) kq = x.nhan ? `Đội không bán ${cuaSo} ngày — vẫn nhận ${fmtN(x.nhan)}` : `Không bán ${cuaSo} ngày`;
  else kq = x.nhan ? `Nhận ${fmtN(x.nhan)}` : '';
  return (
    <div className={'cdt-dong d-' + (d || 'tron')}>
      <div className="cdt-trai">
        <div className="cdt-ma">
          <b>{x.mtc}</b>
          {x.chay && <i className="chay" title="Bán chạy">●</i>}
          {x.pk && <i className="pk">PK</i>}
          {x.moi && <i className="moi">mới</i>}
          {!x.pk && x.gia ? <em>{kGia(x.gia)}</em> : null}
        </div>
        <div className="cdt-so">
          <span>Bán <b>{x.v ? n1(x.v) : 0}</b>/ngày</span>
          <span>Đang có <b>{fmtN(x.co)}</b></span>
          {x.th > 0 && <span className="th">Thùng <b>{fmtN(x.th)}</b></span>}
          <span>Kho <b>{fmtN(x.kd)}</b></span>
        </div>
        {kq && <div className="cdt-kq">{d === 'ok' ? <IcCheck /> : d === 'thieu' || d === 'vuot' ? <IcAlert /> : null}<span>{kq}</span></div>}
        {d === 'canh' && x.canh?.[0] && <div className="cdt-canh"><IcAlert /><span>{x.canh[0]}</span></div>}
      </div>
      <div className="cdt-phai">
        <input inputMode="numeric" pattern="[0-9]*" aria-label={`Chia thêm ${x.mtc}`} value={x.them || ''} placeholder="0"
          onFocus={(e) => e.target.select()} onChange={(e) => datSo(x.bc, e.target.value.replace(/\D/g, ''))} />
        {x.goiY > 0 && x.goiY !== x.them
          ? <button type="button" className="cdt-gy" onClick={() => datSo(x.bc, x.goiY)}>gợi ý {fmtN(x.goiY)}</button>
          : <small>{x.goiY > 0 ? 'đúng gợi ý' : laMaBan(x) && mucTieu ? `cần ${fmtN(x.muc)}` : ''}</small>}
      </div>
    </div>
  );
}

export default function BanDt({ doi, tenDoi, doiTiep, dsDai, thamSo, ttLuu, dong, tong, trongThung, mucTieu, cuaSo, kq, dang,
  datSo, xacNhan, gui, phieuMoi, tuDong, xoaSo, oThung, nutKho, theThung }) {
  const k = useMemo(() => kiemPhuongAn(dong, tong.th), [dong, tong.th]);
  const dg = useMemo(() => new Map(dong.map((x) => [x.bc, danhGiaDong(x)])), [dong]);
  const dem = useMemo(() => {
    let chia = 0, canh = 0;
    dong.forEach((x) => { if (x.nhan > 0) chia++; const d = dg.get(x.bc); if (d === 'vuot' || d === 'canh') canh++; });
    return { chia, thieu: k.thieu_sau, canh, tat: dong.length };
  }, [dong, dg, k.thieu_sau]);
  const [tab, setTab] = useState(null);
  const tabDung = tab || (dem.chia ? 'chia' : 'thieu');
  const [q, setQ] = useState('');
  const [soHien, setSoHien] = useState(40);
  useEffect(() => { setSoHien(40); }, [tabDung, q, doi]);
  const ds = useMemo(() => {
    let v = dong.filter((x) => {
      const d = dg.get(x.bc);
      if (tabDung === 'chia') return x.nhan > 0;
      if (tabDung === 'thieu') return d === 'thieu';
      if (tabDung === 'canh') return d === 'vuot' || d === 'canh';
      return true;
    });
    const Q = boDau(q).trim();
    if (Q) v = v.filter((x) => boDau(`${x.mtc} ${x.n3 || ''} ${x.n1 || ''} ${x.bc}`).includes(Q));
    return v.sort(tabDung === 'thieu'
      ? (a, b) => (b.muc - b.co - b.nhan) - (a.muc - a.co - a.nhan) || b.ban - a.ban
      : (a, b) => b.ban - a.ban || a.mtc.localeCompare(b.mtc));
  }, [dong, dg, tabDung, q]);

  // ---- khối kiểm tra: nhìn là biết đúng / sai ----
  const dongKiem = [];
  if (k.ma_ban) {
    dongKiem.push(k.thieu_sau
      ? { c: 'do', t: `${fmtN(k.thieu_sau)} mã đang bán vẫn thiếu sau chia (${fmtN(k.cai_thieu)} cái)`, p: (k.thieu_kho ? `${fmtN(k.thieu_kho)} mã kho hết` : '') + (k.thieu_kho && k.thieu_chua_chia ? ' · ' : '') + (k.thieu_chua_chia ? `${fmtN(k.thieu_chua_chia)} mã chưa chia` : ''), tab: 'thieu' }
      : { c: 'ok', t: `Mọi mã đang bán đều đủ ${mucTieu} ngày sau chia`, p: `${fmtN(k.ma_ban)} mã` });
    if (k.thieu_sau) dongKiem.push({ c: 'ok', t: `${fmtN(k.dat_sau)}/${fmtN(k.ma_ban)} mã đang bán đủ ${mucTieu} ngày` });
  }
  dongKiem.push(k.vuot_kho ? { c: 'do', t: `${fmtN(k.vuot_kho)} mã chia vượt kho`, tab: 'canh' } : { c: 'ok', t: 'Không mã nào vượt kho' });
  if (tong.th > 0) dongKiem.push({ c: k.thung_du > tong.th * 0.4 ? 'vang' : 'ok', t: `Thùng ${fmtN(tong.th)} cái: ${fmtN(k.thung_dung)} đúng nhu cầu · ${fmtN(k.thung_du)} dư` });
  if (k.nhan_khong_ban) dongKiem.push({ c: 'vang', t: `${fmtN(k.nhan_khong_ban)} mã đội không bán mà vẫn nhận`, tab: 'canh' });
  const xau = dongKiem.some((d) => d.c === 'do') ? 'do' : dongKiem.some((d) => d.c === 'vang') ? 'vang' : 'ok';
  const coSo = tong.nhan > 0;

  return (
    <div className="cdt">
      <div className="cdt-dai">{dsDai}</div>
      <div className="cdt-dau">
        <button type="button" className="cdt-mui" onClick={() => doiTiep(-1)} aria-label="Đội trước">‹</button>
        <div className="cdt-ten"><b>{tenDoi}</b>
          <small>{fmtN(tong.banNgay ? Math.round(tong.banNgay * 10) / 10 : 0)} bán/ngày · đang có {fmtN(tong.co)} · đủ {n1(tong.ndTruoc)} ngày</small></div>
        <button type="button" className="cdt-mui" onClick={() => doiTiep(1)} aria-label="Đội sau">›</button>
      </div>
      <div className="cdt-ts">{thamSo}{ttLuu}</div>

      {dang && !kq ? <div className="cdt-trong">Đang tải số liệu đội…</div> : (<>
        {coSo && (
          <div className={'cdt-kiem k-' + xau}>
            <div className="cdt-kiem-dau"><span>Kiểm tra phương án</span><b>{xau === 'ok' ? 'Đúng' : xau === 'vang' ? 'Cần xem' : 'Có chỗ sai'}</b></div>
            {dongKiem.map((d, i) => (
              <button type="button" key={i} className={'cdt-kiem-d ' + d.c} disabled={!d.tab} onClick={() => d.tab && setTab(d.tab)}>
                {d.c === 'ok' ? <IcCheck /> : <IcAlert />}<span>{d.t}{d.p ? <small>{d.p}</small> : null}</span>
              </button>
            ))}
          </div>
        )}

        <details className="cdt-thung">
          <summary><IcBox /><span>Thùng đóng sẵn</span><b>{trongThung.soThung ? `${trongThung.soThung} thùng · ${fmtN(tong.th)} cái` : 'chưa chọn'}</b></summary>
          <div className="cdt-thung-in">{oThung}{nutKho}{theThung}</div>
        </details>

        <div className="cdt-cong">
          <button type="button" className="btn btn-ai" onClick={() => tuDong(false)}><IcSpark /> Tự động chia</button>
          <button type="button" className="btn btn-ghost" onClick={xoaSo}>Xoá số</button>
        </div>

        <div className="cdt-tab" role="tablist">
          {TAB.map(([t, ten]) => (
            <button type="button" key={t} role="tab" aria-selected={tabDung === t} className={(tabDung === t ? 'on ' : '') + (t === 'thieu' && dem.thieu ? 'do' : t === 'canh' && dem.canh ? 'vang' : '')}
              onClick={() => setTab(t)}>{ten}<i>{fmtN(dem[t])}</i></button>
          ))}
        </div>
        <input className="cdt-tim" type="search" placeholder="Tìm mã, tên, màu…" value={q} onChange={(e) => setQ(e.target.value)} />

        <div className="cdt-ds">
          {ds.slice(0, soHien).map((x) => <Dong key={x.bc} x={x} d={dg.get(x.bc)} mucTieu={mucTieu} cuaSo={cuaSo} datSo={datSo} />)}
          {!ds.length && <div className="cdt-trong">{tabDung === 'chia' ? 'Chưa chia mã nào — bấm “Tự động chia” hoặc nhập số ở tab Tất cả' : tabDung === 'thieu' ? 'Không mã nào thiếu 👌' : tabDung === 'canh' ? 'Không có gì cần xem 👌' : 'Không có mã nào khớp'}</div>}
          {ds.length > soHien && <button type="button" className="cdt-them" onClick={() => setSoHien((v) => v + 60)}>Xem thêm {fmtN(Math.min(60, ds.length - soHien))} mã (còn {fmtN(ds.length - soHien)})</button>}
        </div>
      </>)}

      <div className="cdt-chan">
        <div className="cdt-chan-so">
          <b>{fmtN(tong.nhan)}</b><span>cái · {fmtN(tong.ma)} mã</span>
          <small>Sale {fmtN(tong.sa)} · PK {fmtN(tong.pk)} · Thùng {fmtN(tong.th)}</small>
        </div>
        {phieuMoi && phieuMoi.doi === doi
          ? <div className="cdt-xong"><IcCheck /><span>Đã xuất {soFile(phieuMoi)} file</span><button type="button" className="btn btn-ai" onClick={() => doiTiep(1)}>Đội tiếp</button></div>
          : <button type="button" className={'cdt-xn ' + (coSo ? 'k-' + xau : '')} disabled={gui || !coSo} onClick={() => xacNhan()}>
              <IcDown /><span>{gui ? 'Đang xác nhận…' : coSo ? `Xác nhận · ${tong.soPhieu} file` : 'Chưa có số'}</span></button>}
      </div>
    </div>
  );
}
