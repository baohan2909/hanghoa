import { useEffect, useMemo, useRef, useState } from 'react';
import { sb, rpcHet } from '../lib/supabase.js';
import { IcTrophy, IcFlash, IcTarget, IcHeart, IcRefresh } from '../lib/icons.jsx';
import { DateBox, Sel } from '../lib/ui.jsx';
import { useApp } from '../App.jsx';

// ĐẤU TRƯỜNG — thi đua kiến thức sản phẩm toàn hệ thống.
// 3 chế độ: TOCDO 60s · CHINHXAC 90s (sai -50) · SINHTON 3 mạng, 7s/câu.
// Câu hỏi sinh client từ pool san_pham (fn_thi_pool): giá / tên từ hình / ngành / so sánh giá.
// Điểm = (100 + bonus nhanh tối đa 50) × hệ số combo (1 + 0.1×combo, trần ×2).

const CHE_DO = {
  TOCDO:    { ten: 'Tốc độ',     Ic: IcFlash,  giay: 60,  mota: '60 giây — trả lời càng nhiều càng tốt. Sai không trừ điểm nhưng mất chuỗi combo.' },
  CHINHXAC: { ten: 'Chính xác',  Ic: IcTarget, giay: 90,  mota: '90 giây — đúng +điểm, sai −50. Dành cho người chắc kiến thức.' },
  SINHTON:  { ten: 'Sinh tồn',   Ic: IcHeart,  giay: 0,   mota: 'Không giới hạn giờ — 3 mạng, mỗi câu chỉ 7 giây. Sai hoặc hết giờ mất 1 mạng.' },
};
const fmtVND = (n) => Number(n).toLocaleString('vi') + ' đ';
const xao = (a) => { const v = [...a]; for (let i = v.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [v[i], v[j]] = [v[j], v[i]]; } return v; };
const lay = (a, n, loai) => xao(a.filter((x) => x !== loai)).slice(0, n);

// ---- Sinh 1 câu hỏi từ pool ----
function sinhCau(pool, daDung) {
  // chọn SP chưa dùng gần đây
  const ung = pool.filter((s) => !daDung.has(s.barcode));
  const sp = (ung.length ? ung : pool)[Math.floor(Math.random() * (ung.length ? ung.length : pool.length))];
  const hopLeHinh = (u) => typeof u === 'string' && /^https?:\/\//.test(u.trim());
  const coHinh = hopLeHinh(sp.hinh_url);
  // loại câu khả dụng
  const loai = [];
  loai.push('GIA');
  if (coHinh) loai.push('TEN', 'TEN');           // ưu tiên câu hình
  if (sp.nganh_3) loai.push('NGANH');
  const spKhacGia = pool.filter((x) => x.barcode !== sp.barcode && hopLeHinh(x.hinh_url)
    && Math.abs(x.gia - sp.gia) / Math.max(x.gia, sp.gia) >= 0.1);
  if (coHinh && spKhacGia.length) loai.push('SOSANH');
  const l = loai[Math.floor(Math.random() * loai.length)];

  if (l === 'SOSANH') {
    const b = spKhacGia[Math.floor(Math.random() * spKhacGia.length)];
    const cap = xao([sp, b]);
    return { loai: l, hoi: 'Sản phẩm nào có giá niêm yết CAO hơn?', sp,
      dapAn: cap.map((x) => ({ nhan: x.ten, hinh: x.hinh_url, dung: x.gia === Math.max(sp.gia, b.gia) })) };
  }
  if (l === 'TEN') {
    const nhieu = lay(pool.filter((x) => x.barcode !== sp.barcode &&
      (x.nganh_3 === sp.nganh_3 || x.nganh_1 === sp.nganh_1)).map((x) => x.ten), 3)
      .concat(lay(pool.filter((x) => x.barcode !== sp.barcode).map((x) => x.ten), 3)).slice(0, 3);
    return { loai: l, hoi: 'Sản phẩm trong hình là mã nào?', sp, hinh: sp.hinh_url,
      dapAn: xao([{ nhan: sp.ten, dung: true }, ...nhieu.map((t) => ({ nhan: t, dung: false }))]) };
  }
  if (l === 'NGANH') {
    const dsN = [...new Set(pool.map((x) => x.nganh_3).filter(Boolean))];
    const nhieu = lay(dsN, 3, sp.nganh_3);
    return { loai: l, hoi: `“${sp.ten}” thuộc ngành hàng nào?`, sp,
      dapAn: xao([{ nhan: sp.nganh_3, dung: true }, ...nhieu.map((t) => ({ nhan: t, dung: false }))]) };
  }
  // GIA
  const gia = Number(sp.gia);
  const cungNganh = pool.filter((x) => x.barcode !== sp.barcode && x.nganh_1 === sp.nganh_1
    && Math.abs(x.gia - gia) / gia >= 0.08).map((x) => Number(x.gia));
  let nhieu = [...new Set(cungNganh)].slice(0, 3);
  const heSo = [0.75, 1.25, 1.5, 0.6, 1.35];
  let i = 0;
  while (nhieu.length < 3 && i < heSo.length) {
    const g = Math.round(gia * heSo[i] / 1000) * 1000;
    if (g !== gia && !nhieu.includes(g)) nhieu.push(g);
    i++;
  }
  return { loai: l, hoi: `Giá niêm yết của “${sp.ten}” là?`, sp,
    dapAn: xao([{ nhan: fmtVND(gia), dung: true }, ...nhieu.slice(0, 3).map((g) => ({ nhan: fmtVND(g), dung: false }))]) };
}

export default function DauTruong() {
  const { user, baoToast } = useApp();
  const [view, setView] = useState('SANH');          // SANH | DEM | CHOI | KETQUA
  const [sanhTab, setSanhTab] = useState('CHOI');    // CHOI | LOG (admin)
  const laAdmin = user.vai_tro === 'ADMIN';
  const [cheDo, setCheDo] = useState('TOCDO');
  const [tabTop, setTabTop] = useState('TOCDO');
  const [top, setTop] = useState(null);
  const [pool, setPool] = useState(null);
  const [dem, setDem] = useState(3);

  // trạng thái lượt chơi
  const [cau, setCau] = useState(null);
  const [diem, setDiem] = useState(0);
  const [soCau, setSoCau] = useState(0);
  const [soDung, setSoDung] = useState(0);
  const [combo, setCombo] = useState(0);
  const [comboMax, setComboMax] = useState(0);
  const [mang, setMang] = useState(3);
  const [tgConLai, setTgConLai] = useState(60);
  const [tgCau, setTgCau] = useState(7);             // sinh tồn: giờ mỗi câu
  const [chon, setChon] = useState(null);            // index đã chọn (hiện feedback)
  const [kq, setKq] = useState(null);                // {hang, best}
  const daDung = useRef(new Set());
  const dangChoi = useRef(false);
  const tRef = useRef(null);
  const tCauRef = useRef(null);
  const batDauCau = useRef(0);

  const taiTop = async (cd) => {
    const { data } = await sb.rpc('fn_thi_top', { p_che_do: cd });
    setTop(data || []);
  };
  useEffect(() => { taiTop(tabTop); }, [tabTop]);

  // ---- bắt đầu lượt ----
  const batDau = async () => {
    const { data, error } = await sb.rpc('fn_thi_pool', { p_so: 60 });
    if (error || !data || data.length < 12) { baoToast('Chưa đủ dữ liệu sản phẩm để thi'); return; }
    setPool(data);
    // preload 20 hình đầu (ảnh nét/nặng — tải sẵn để không khựng giữa trận)
    data.filter((s) => /^https?:\/\//.test((s.hinh_url || '').trim())).slice(0, 20)
      .forEach((s) => { const im = new Image(); im.src = s.hinh_url; });
    daDung.current = new Set();
    setDiem(0); setSoCau(0); setSoDung(0); setCombo(0); setComboMax(0); setMang(3); setChon(null); setKq(null);
    setTgConLai(CHE_DO[cheDo].giay || 0); setTgCau(7);
    setDem(3); dangChoi.current = true; setView('DEM');
  };

  // đếm ngược 3-2-1
  useEffect(() => {
    if (view !== 'DEM') return;
    if (dem <= 0) { setView('CHOI'); return; }
    const t = setTimeout(() => setDem((d) => d - 1), 700);
    return () => clearTimeout(t);
  }, [view, dem]);

  // đồng hồ tổng (TOCDO/CHINHXAC)
  useEffect(() => {
    if (view !== 'CHOI' || cheDo === 'SINHTON') return;
    tRef.current = setInterval(() => setTgConLai((t) => {
      if (t <= 0.1) { clearInterval(tRef.current); ketThuc(); return 0; }
      return +(t - 0.1).toFixed(1);
    }), 100);
    return () => clearInterval(tRef.current);
  }, [view]);   // eslint-disable-line

  // đồng hồ mỗi câu (SINHTON)
  useEffect(() => {
    if (view !== 'CHOI' || cheDo !== 'SINHTON' || chon !== null) return;
    tCauRef.current = setInterval(() => setTgCau((t) => {
      if (t <= 0.1) { clearInterval(tCauRef.current); traLoi(-1); return 0; }
      return +(t - 0.1).toFixed(1);
    }), 100);
    return () => clearInterval(tCauRef.current);
  }, [view, cau, chon]);   // eslint-disable-line

  // sinh câu đầu khi vào CHOI
  useEffect(() => {
    if (view === 'CHOI' && !cau && pool) cauMoi();
  }, [view]);   // eslint-disable-line

  const cauMoi = () => {
    const c = sinhCau(pool, daDung.current);
    daDung.current.add(c.sp.barcode);
    if (daDung.current.size > pool.length - 8) daDung.current = new Set();
    // preload hình 4 SP ngẫu nhiên tiếp (mượt hơn)
    xao(pool).filter((s) => /^https?:\/\//.test((s.hinh_url || '').trim())).slice(0, 4)
      .forEach((s) => { const im = new Image(); im.src = s.hinh_url; });
    setCau(c); setChon(null); setTgCau(7);
    batDauCau.current = Date.now();
  };

  const traLoi = (idx) => {
    if (chon !== null || !cau) return;
    clearInterval(tCauRef.current);
    const dung = idx >= 0 && cau.dapAn[idx]?.dung;
    setChon(idx);
    setSoCau((n) => n + 1);
    if (dung) {
      const giay = (Date.now() - batDauCau.current) / 1000;
      const bonus = Math.max(0, Math.round(50 * (1 - Math.min(giay, 3) / 3)));
      const heSo = 1 + 0.1 * Math.min(combo, 10);
      setDiem((d) => d + Math.round((100 + bonus) * heSo));
      setSoDung((n) => n + 1);
      setCombo((c) => { const nc = c + 1; setComboMax((m) => Math.max(m, nc)); return nc; });
    } else {
      setCombo(0);
      if (cheDo === 'CHINHXAC') setDiem((d) => Math.max(0, d - 50));
      if (cheDo === 'SINHTON') {
        setMang((m) => {
          if (m - 1 <= 0) { setTimeout(() => ketThuc(0), 550); }
          return m - 1;
        });
      }
    }
    setTimeout(() => { if (dangChoi.current) cauMoi(); }, 550);
  };

  const dangLuu = useRef(false);
  const ketThuc = async () => {
    if (dangLuu.current) return; dangLuu.current = true; dangChoi.current = false;
    clearInterval(tRef.current); clearInterval(tCauRef.current);
    setView('KETQUA'); setCau(null);
    // đọc state mới nhất qua functional set (đảm bảo đúng số cuối)
    let d, sc, sd, cm;
    setDiem((x) => (d = x, x)); setSoCau((x) => (sc = x, x));
    setSoDung((x) => (sd = x, x)); setComboMax((x) => (cm = x, x));
    setTimeout(async () => {
      const { data, error } = await sb.rpc('fn_thi_luu', {
        p_token: user.token, p_che_do: cheDo, p_diem: d, p_so_cau: sc, p_so_dung: sd, p_combo: cm });
      if (error) baoToast('Không lưu được kết quả: ' + error.message);
      else { setKq(data); taiTop(cheDo); setTabTop(cheDo); }
      dangLuu.current = false;
    }, 50);
  };

  // ================= RENDER =================
  if (view === 'DEM') return (
    <div className="dt-dem"><div className="dt-dem-so" key={dem}>{dem === 0 ? 'BẮT ĐẦU!' : dem}</div></div>
  );

  if (view === 'CHOI' && cau) {
    const CD = CHE_DO[cheDo];
    const pct = cheDo === 'SINHTON' ? (tgCau / 7) * 100 : (tgConLai / CD.giay) * 100;
    return (
      <div className="dt-choi">
        <div className="dt-bar">
          <div className="dt-bar-tg">
            <div className="dt-bar-fill" style={{ width: pct + '%', background: pct < 25 ? 'var(--magenta)' : 'var(--grad)' }} />
            <span className="dt-bar-txt">{cheDo === 'SINHTON' ? tgCau.toFixed(1) : Math.ceil(tgConLai)}s</span>
          </div>
          <div className="dt-diem">{diem.toLocaleString('vi')}</div>
          {combo >= 2 && <div className="dt-combo" key={combo}>×{combo}</div>}
          {cheDo === 'SINHTON' && (
            <div className="dt-mang">{[1, 2, 3].map((i) => <IcHeart key={i} width={18} style={{ opacity: i <= mang ? 1 : .18, color: 'var(--magenta)' }} />)}</div>
          )}
        </div>

        <div className="dt-hoi">{cau.hoi}</div>

        {cau.loai === 'SOSANH' ? (
          <div className="dt-sosanh">
            {cau.dapAn.map((a, i) => (
              <button key={i} onClick={() => traLoi(i)}
                className={'dt-ss-the' + (chon === null ? '' : a.dung ? ' dung' : chon === i ? ' sai' : ' mo')}>
                <div className="dt-ss-hinh"><img src={a.hinh} alt="" loading="eager"
                  onError={() => { if (chon === null) cauMoi(); }} /></div>
                <div className="dt-ss-ten">{a.nhan}</div>
              </button>
            ))}
          </div>
        ) : (
          <>
            {cau.hinh && <div className="dt-hinh"><img src={cau.hinh} alt="" loading="eager"
              className="dt-hinh-img" onLoad={(e) => e.currentTarget.classList.add('san')}
              onError={() => { if (chon === null) cauMoi(); }} /></div>}
            <div className="dt-dapan">
              {cau.dapAn.map((a, i) => (
                <button key={i} onClick={() => traLoi(i)}
                  className={'dt-da' + (chon === null ? '' : a.dung ? ' dung' : chon === i ? ' sai' : ' mo')}>
                  {a.nhan}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  if (view === 'KETQUA') {
    const acc = soCau ? Math.round(100 * soDung / soCau) : 0;
    return (
      <div className="dt-kq">
        <div className="dt-kq-tit">KẾT THÚC — {CHE_DO[cheDo].ten.toUpperCase()}</div>
        <div className="dt-kq-diem">{diem.toLocaleString('vi')}</div>
        {kq && kq.hang <= 10 && <div className="dt-kq-top"><IcTrophy width={16} /> LỌT TOP {kq.hang} TOÀN HỆ THỐNG!</div>}
        <div className="the-hang" style={{ justifyContent: 'center', marginTop: 18 }}>
          <div className="the-g"><span className="the-g-n">{soCau}</span><span className="the-g-t">câu đã trả lời</span></div>
          <div className="the-g"><span className="the-g-n" style={{ color: 'var(--teal-deep)' }}>{soDung}</span><span className="the-g-t">trả lời đúng</span></div>
          <div className="the-g"><span className="the-g-n">{acc}%</span><span className="the-g-t">độ chính xác</span></div>
          <div className="the-g"><span className="the-g-n" style={{ color: 'var(--gold)' }}>×{comboMax}</span><span className="the-g-t">combo cao nhất</span></div>
        </div>
        {kq && <div className="dt-kq-best">Hạng lượt này: <b>#{kq.hang}</b> · Kỷ lục của bạn: <b>{Number(kq.best).toLocaleString('vi')}</b></div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
          <button className="btn btn-ai" onClick={batDau}><IcRefresh width={15} /> Chơi lại</button>
          <button className="btn btn-ghost" onClick={() => { setView('SANH'); taiTop(tabTop); }}>Về sảnh</button>
        </div>
      </div>
    );
  }

  // ---- SẢNH ----
  return (
    <>
      <div className="cmdbar">
        <h1>Đấu trường sản phẩm</h1>
        <div className="sub">Thi đua tốc độ &amp; kiến thức sản phẩm toàn hệ thống — vừa chơi vừa thuộc giá, thuộc mã. Top 10 ghi danh bảng vàng.</div>
      </div>

      {laAdmin && (
        <div className="nhom-tabs" style={{ marginTop: 14, marginBottom: 0 }}>
          <button className={'nhom-tab' + (sanhTab === 'CHOI' ? ' on' : '')} onClick={() => setSanhTab('CHOI')}>Chơi &amp; Bảng vàng</button>
          <button className={'nhom-tab' + (sanhTab === 'LOG' ? ' on' : '')} onClick={() => setSanhTab('LOG')}>Nhật ký cửa hàng</button>
        </div>
      )}

      {laAdmin && sanhTab === 'LOG' ? <NhatKy /> : (
      <div className="dt-sanh">
        <div>
          <div className="dt-modes">
            {Object.entries(CHE_DO).map(([id, cd]) => (
              <button key={id} className={'dt-mode' + (cheDo === id ? ' on' : '')} onClick={() => setCheDo(id)}>
                <cd.Ic width={26} />
                <div className="dt-mode-ten">{cd.ten}</div>
                <div className="dt-mode-mota">{cd.mota}</div>
              </button>
            ))}
          </div>
          <div className="dt-luat">
            Điểm mỗi câu = <b>100</b> + thưởng tốc độ (tối đa <b>+50</b>) × hệ số chuỗi combo (tối đa <b>×2</b>).
            Câu hỏi sinh ngẫu nhiên từ dữ liệu thật: giá niêm yết, nhận diện hình, ngành hàng, so sánh giá.
          </div>
          <button className="btn btn-ai dt-batdau" onClick={batDau}>
            <IcFlash width={16} /> VÀO TRẬN — {CHE_DO[cheDo].ten}
          </button>
        </div>

        <div className="card dt-top">
          <div className="dt-top-head">
            <IcTrophy width={18} style={{ color: 'var(--gold)' }} />
            <span>Bảng vàng Top 10</span>
          </div>
          <div className="nhom-tabs" style={{ margin: '10px 0' }}>
            {Object.entries(CHE_DO).map(([id, cd]) => (
              <button key={id} className={'nhom-tab' + (tabTop === id ? ' on' : '')} style={{ height: 32, padding: '0 12px', fontSize: 12 }}
                onClick={() => setTabTop(id)}>{cd.ten}</button>
            ))}
          </div>
          {!top ? <div className="dt-top-trong">Đang tải…</div>
            : top.length === 0 ? <div className="dt-top-trong">Chưa có ai ghi danh — hãy là người đầu tiên!</div>
            : (
              <div className="dt-top-list">
                {top.map((r, i) => (
                  <div key={r.ma_nguoi} className={'dt-top-item' + (r.ma_nguoi === user.ma_dang_nhap ? ' toi' : '') + (i < 3 ? ' top3' : '')}>
                    <span className={'dt-hang h' + (i + 1)}>{i + 1}</span>
                    <div className="dt-top-ten">
                      <div>{r.ten_nguoi}</div>
                      <div className="dt-top-sub">{r.ma_ch || r.ma_nguoi} · đúng {r.so_dung}/{r.so_cau} · combo ×{r.combo_max}</div>
                    </div>
                    <b className="dt-top-diem">{Number(r.diem).toLocaleString('vi')}</b>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>
      )}
    </>
  );
}

// ============ NHẬT KÝ QUẢN TRỊ ============
const iso2 = (d) => d.toISOString().slice(0, 10);
const fmtGio = (ts) => { const d = new Date(ts); return d.toLocaleString('vi', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };

function NhatKy() {
  const { baoToast } = useApp();
  const [tu, setTu] = useState(iso2(new Date(Date.now() - 30 * 864e5)));
  const [den, setDen] = useState(iso2(new Date()));
  const [rows, setRows] = useState(null);
  const [chiTiet, setChiTiet] = useState(null);       // ma_ch đang mở chi tiết
  const [ct, setCt] = useState(null);
  const [sortC, setSortC] = useState({ col: 'so_luot', dir: 'desc' });
  const [chiChoi, setChiChoi] = useState(false);       // lọc chỉ CH đã chơi

  useEffect(() => { (async () => {
    const { data, error } = await rpcHet('fn_thi_log_ch', { p_tu: tu, p_den: den });
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    setRows(data || []);
  })(); }, [tu, den]);

  const moChiTiet = async (ma_ch) => {
    setChiTiet(ma_ch); setCt(null);
    const { data } = await rpcHet('fn_thi_log_chitiet', { p_tu: tu, p_den: den, p_ma_ch: ma_ch });
    setCt(data || []);
  };

  const tk = useMemo(() => {
    const v = rows || [];
    return {
      luot: v.reduce((s, r) => s + Number(r.so_luot), 0),
      choi: v.filter((r) => Number(r.so_luot) > 0).length,
      chua: v.filter((r) => Number(r.so_luot) === 0).length,
    };
  }, [rows]);

  const hien = useMemo(() => {
    let v = [...(rows || [])];
    if (chiChoi) v = v.filter((r) => Number(r.so_luot) > 0);
    const g = { ten: (r) => r.ten_ch, luot: (r) => Number(r.so_luot), nguoi: (r) => Number(r.so_nguoi),
      max: (r) => r.diem_max, tb: (r) => Number(r.diem_tb), gan: (r) => r.lan_gan_nhat || '' }[sortC.col];
    v.sort((a, b) => { const x = g(a), y = g(b); const c = typeof x === 'string' ? x.localeCompare(y) : (x > y ? 1 : x < y ? -1 : 0); return sortC.dir === 'asc' ? c : -c; });
    return v;
  }, [rows, chiChoi, sortC]);
  const ds = (c) => setSortC((s) => ({ col: c, dir: s.col === c && s.dir === 'desc' ? 'asc' : 'desc' }));
  const ic = (c) => sortC.col === c ? (sortC.dir === 'asc' ? ' ▲' : ' ▼') : '';

  const xuat = async () => {
    const XLSX = await import('xlsx');
    const hdr = ['Mã CH', 'Cửa hàng', 'Khu vực', 'Nhóm', 'Số lượt', 'Số người', 'Điểm cao nhất', 'Điểm TB', 'Lần gần nhất'];
    const data = hien.map((r) => [r.ma_ch, r.ten_ch, r.khu_vuc, 'N' + r.nhom_ch, Number(r.so_luot), Number(r.so_nguoi), r.diem_max, Number(r.diem_tb), r.lan_gan_nhat ? fmtGio(r.lan_gan_nhat) : '']);
    const ws = XLSX.utils.aoa_to_sheet([hdr, ...data]); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Nhật ký Đấu trường'); XLSX.writeFile(wb, `NhatKy_DauTruong_${tu}_${den}.xlsx`);
  };

  return (
    <>
      <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <DateBox label="Từ" value={tu} onChange={setTu} />
        <DateBox label="Đến" value={den} onChange={setDen} />
        <button className={'nhom-tab' + (chiChoi ? ' on' : '')} onClick={() => setChiChoi((v) => !v)} style={{ height: 40 }}>Chỉ CH đã chơi</button>
        <button className="btn btn-ghost" onClick={xuat} style={{ marginLeft: 'auto' }}>Xuất Excel</button>
      </div>

      <div className="the-hang" style={{ marginTop: 12 }}>
        <div className="the-g"><span className="the-g-n">{tk.luot}</span><span className="the-g-t">tổng lượt chơi</span></div>
        <div className="the-g"><span className="the-g-n" style={{ color: 'var(--teal-deep)' }}>{tk.choi}</span><span className="the-g-t">cửa hàng có tham gia</span></div>
        <div className="the-g"><span className="the-g-n" style={{ color: tk.chua ? 'var(--magenta)' : 'var(--teal-deep)' }}>{tk.chua}</span><span className="the-g-t">cửa hàng chưa chơi lần nào</span></div>
      </div>

      <div className="card" style={{ marginTop: 12, padding: 0, overflow: 'hidden' }}>
        <div className="tbl-wrap" style={{ maxHeight: '58vh', overflow: 'auto' }}>
          <table className="tbl tbl-fit">
            <thead><tr>
              <th className="sortable" onClick={() => ds('ten')}>Cửa hàng{ic('ten')}</th>
              <th className="num sortable" onClick={() => ds('luot')}>Số lượt{ic('luot')}</th>
              <th className="num sortable" onClick={() => ds('nguoi')}>Số người{ic('nguoi')}</th>
              <th className="num sortable" onClick={() => ds('max')}>Điểm cao nhất{ic('max')}</th>
              <th className="num sortable" onClick={() => ds('tb')}>Điểm TB{ic('tb')}</th>
              <th className="sortable" onClick={() => ds('gan')}>Lần gần nhất{ic('gan')}</th>
              <th></th>
            </tr></thead>
            <tbody>
              {hien.map((r) => (
                <tr key={r.ma_ch} className={Number(r.so_luot) === 0 ? 'row-lo' : ''}>
                  <td><div style={{ fontWeight: 600 }}>{r.ten_ch}</div><div className="mono" style={{ fontSize: 10, color: 'var(--ink-2)' }}>{r.ma_ch} · {r.khu_vuc}</div></td>
                  <td className="num" style={{ fontWeight: 700, color: Number(r.so_luot) ? 'var(--teal-deep)' : 'var(--magenta)' }}>{Number(r.so_luot)}</td>
                  <td className="num">{Number(r.so_nguoi)}</td>
                  <td className="num">{r.diem_max ? Number(r.diem_max).toLocaleString('vi') : '—'}</td>
                  <td className="num">{Number(r.diem_tb) ? Number(r.diem_tb).toLocaleString('vi') : '—'}</td>
                  <td style={{ fontSize: 12 }}>{r.lan_gan_nhat ? fmtGio(r.lan_gan_nhat) : <span style={{ color: 'var(--magenta)' }}>chưa chơi</span>}</td>
                  <td>{Number(r.so_luot) > 0 && <button className="btn-mini btn-mini-teal" onClick={() => moChiTiet(r.ma_ch)}>Chi tiết</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {chiTiet && (
        <div className="modal-bg" onClick={() => setChiTiet(null)}>
          <div className="modal" style={{ maxWidth: 640, width: '94vw' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div style={{ flex: 1 }}><b>Chi tiết lượt chơi</b> — {(rows || []).find((r) => r.ma_ch === chiTiet)?.ten_ch}</div>
              <button className="modal-x" onClick={() => setChiTiet(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '60vh', overflow: 'auto', padding: 0 }}>
              {!ct ? <div className="dt-top-trong">Đang tải…</div> : (
                <table className="tbl tbl-fit">
                  <thead><tr><th>Thời điểm</th><th>Người chơi</th><th className="center">Chế độ</th><th className="num">Điểm</th><th className="num">Đúng/Câu</th><th className="num">Combo</th></tr></thead>
                  <tbody>
                    {ct.map((r, i) => (
                      <tr key={i}>
                        <td style={{ fontSize: 12 }}>{fmtGio(r.tao_luc)}</td>
                        <td style={{ fontWeight: 600 }}>{r.ten_nguoi}</td>
                        <td className="center"><span className="tag-n tag-n2">{r.che_do}</span></td>
                        <td className="num" style={{ fontWeight: 700, color: 'var(--teal-deep)' }}>{Number(r.diem).toLocaleString('vi')}</td>
                        <td className="num">{r.so_dung}/{r.so_cau}</td>
                        <td className="num">×{r.combo_max}</td>
                      </tr>
                    ))}
                    {ct.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 20, color: 'var(--ink-2)' }}>Không có lượt nào.</td></tr>}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
