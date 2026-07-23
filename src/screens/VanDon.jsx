import { Fragment, useEffect, useMemo, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { isoVN, DateBox, Sel } from '../lib/ui.jsx';
import { GHTK_QUET_FN, GHTK_NHAN_FN, SUPABASE_ANON } from '../config.js';
import { useApp } from '../App.jsx';
import { IcTruck, IcSearch } from '../lib/icons.jsx';

const fmtN = (n) => n == null ? '—' : Number(n).toLocaleString('vi');
const tenGon = (t) => (t || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
const fmtNg = (d) => d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '—';
const fmtGio = (t) => t ? new Date(t).toLocaleString('vi', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

// 4 chặng của lộ trình giao hàng
const CHANG = [
  { k: 'CHO_LAY',   t: 'Chờ lấy' },
  { k: 'DANG_CHAY', t: 'Đang giao' },
  { k: 'GIAO_XONG', t: 'Đã giao' },
];
const NHOM = {
  CHO_LAY:   { t: 'Chờ lấy',   c: 'vd-cho' },
  DANG_CHAY: { t: 'Đang giao', c: 'vd-giao' },
  GIAO_XONG: { t: 'Đã giao',   c: 'vd-xong' },
  SU_CO:     { t: 'Sự cố',     c: 'vd-suco' },
  TRA_HANG:  { t: 'Trả hàng',  c: 'vd-tra' },
  HUY:       { t: 'Đã hủy',    c: 'vd-huy' },
};

export default function VanDon() {
  const { baoToast } = useApp();
  const [tu, setTu] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return isoVN(d); });
  const [den, setDen] = useState(isoVN());
  const [rows, setRows] = useState(null);
  const [tk, setTk] = useState(null);
  const [wh, setWh] = useState(null);
  const [nhom, setNhom] = useState(null);
  const [q, setQ] = useState('');
  const [kv, setKv] = useState('');
  const [ch, setCh] = useState('');
  const [chiCham, setChiCham] = useState(false);
  const [sort, setSort] = useState({ c: 'action_time', d: 'desc' });
  const [mo, setMo] = useState(null);
  const [ht, setHt] = useState(null);
  const [quet, setQuet] = useState(false);
  const [lanCuoi, setLanCuoi] = useState(null);
  const [moCC, setMoCC] = useState(false);
  const [txtMa, setTxtMa] = useState('');
  const [txtHoc, setTxtHoc] = useState('');
  const [diem, setDiem] = useState([]);
  const [dsCH, setDsCH] = useState([]);
  const [dangCC, setDangCC] = useState(false);
  const [daGan, setDaGan] = useState([]);

  const tai = async () => {
    const [a, b, c] = await Promise.all([
      sb.rpc('fn_vd_ds', { p_tu: tu, p_den: den, p_ma_ch: null, p_nhom: null }),
      sb.rpc('fn_vd_tk', { p_tu: tu, p_den: den }),
      sb.rpc('fn_vd_wh_tinh_trang'),
    ]);
    setRows(a.data || []); setTk(b.data || null); setWh(c.data || null);
  };
  useEffect(() => { tai(); }, [tu, den]);   // eslint-disable-line
  // Làm mới số liệu mỗi 2 phút; tự gọi cập nhật từ hãng vận chuyển mỗi 15 phút
  useEffect(() => {
    const t1 = setInterval(() => { tai(); }, 120000);
    const t2 = setInterval(() => { chayQuet(true); }, 900000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, []);   // eslint-disable-line

  const taiDiem = async () => {
    const [a, b] = await Promise.all([
      sb.rpc('fn_vd_ten_la'),
      sb.from('cua_hang').select('ma_ch, ten').or('ma_ch.like.CH%,ma_ch.like.DB%')
        .eq('hoat_dong', true).order('ten'),
    ]);
    setDiem(a.data || []); setDsCH(b.data || []);
    const g = await sb.rpc('fn_vd_ten_da_gan');
    setDaGan(g.data || []);
  };

  const goGan = async (ten) => {
    const { data, error } = await sb.rpc('fn_vd_go_gan', { p_ten: ten });
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    baoToast(`Đã gỡ ${data ?? 0} đơn — hệ thống sẽ tự xác định lại`);
    tai(); taiDiem();
  };
  useEffect(() => { if (moCC) taiDiem(); }, [moCC]);   // eslint-disable-line

  const xoHT = async (r) => {
    if (mo === r.label_id) { setMo(null); setHt(null); return; }
    setMo(r.label_id); setHt(null);
    const { data } = await sb.rpc('fn_vd_hanh_trinh', { p_label: r.label_id });
    setHt(data || []);
  };

  const goi = async (url, payload) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + SUPABASE_ANON },
      body: JSON.stringify(payload),
    });
    return res.json();
  };

  const chayQuet = async (imLang) => {
    setQuet(true);
    try {
      const a = await goi(GHTK_QUET_FN, { so: 150 });
      if (a.error) { if (!imLang) baoToast('Lỗi lấy trạng thái: ' + a.error); setQuet(false); return; }
      if (!imLang) baoToast(`Đã cập nhật ${a.cap_nhat ?? 0}/${a.so_luong ?? 0} đơn — đang xác định cửa hàng…`);
      tai();
      const b = await goi(GHTK_NHAN_FN, { so: 200 });
      if (!imLang) {
        if (b.error) baoToast('Lỗi xác định cửa hàng: ' + b.error);
        else if ((b.can_xu_ly ?? 0) === 0) baoToast('Xong — mọi đơn đã rõ cửa hàng');
        else baoToast(`Xong — xác định thêm ${b.ro_cua_hang ?? 0} đơn${b.chua_ro ? ` · ${b.chua_ro} chưa rõ` : ''}`);
      }
      setLanCuoi(new Date());
      tai(); if (moCC) taiDiem();
    } catch (e) { if (!imLang) baoToast('Không gọi được: ' + e.message); }
    setQuet(false);
  };

  const napMa = async () => {
    const ds = txtMa.split(/[\n,;\t]+/).map((x) => x.trim()).filter((x) => x.length > 8);
    if (!ds.length) { baoToast('Chưa có mã nào hợp lệ'); return; }
    setDangCC(true);
    const { data, error } = await sb.rpc('fn_vd_nap_ma', { p: ds });
    if (error) { baoToast('Lỗi: ' + error.message); setDangCC(false); return; }
    baoToast(`Đã thêm ${data?.da_nhan ?? 0} đơn — đang lấy trạng thái…`);
    try {
      const j = await goi(GHTK_QUET_FN, { ma: ds });
      baoToast(j.error ? 'Lỗi: ' + j.error : `Xong: cập nhật ${j.cap_nhat}/${j.so_luong} đơn`);
    } catch (e) { baoToast('Không gọi được: ' + e.message); }
    setTxtMa(''); setDangCC(false); tai(); taiDiem();
  };

  const hocDiem = async () => {
    const ds = txtHoc.split(/\n+/).map((d) => {
      const c = d.split(/\t|;|\s{2,}/).map((x) => x.trim()).filter(Boolean);
      if (c.length < 2) return null;
      const label = c.find((x) => /^S\d/.test(x)) || c[0];
      const ten = c.filter((x) => x !== label).join(' ').trim();
      return label && ten ? { label, ten } : null;
    }).filter(Boolean);
    if (!ds.length) { baoToast('Cần: mã đơn và tên cửa hàng trên cùng một dòng'); return; }
    setDangCC(true);
    const { data, error } = await sb.rpc('fn_vd_gan_ten', { p: ds });
    setDangCC(false);
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    baoToast(`Đã xử lý ${data?.map_duoc ?? 0} đơn${data?.chua_map ? ` · ${data.chua_map} chưa rõ cửa hàng` : ''}`);
    setTxtHoc(''); tai(); taiDiem();
  };

  const ganDiem = async (ten, ma_ch) => {
    if (!ma_ch) return;
    const { data, error } = await sb.rpc('fn_vd_gan_ten_ch', { p_ten: ten, p_ma_ch: ma_ch });
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    baoToast(`Đã gán ${data ?? 0} đơn`);
    tai(); taiDiem();
  };

  // ===== lọc + sắp xếp =====
  const dsKV = useMemo(() => [...new Set((rows || []).map((r) => r.khu_vuc).filter(Boolean))].sort(), [rows]);
  const dsNoi = useMemo(() => [...new Set((rows || [])
    .map((r) => r.ten_ch || tenGon(r.ten_nhan)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')), [rows]);
  const ds = useMemo(() => {
    let x = (rows || []).filter((r) =>
      (!nhom || r.nhom === nhom) &&
      (!kv || r.khu_vuc === kv) &&
      (!ch || (r.ten_ch || tenGon(r.ten_nhan)) === ch) &&
      (!chiCham || (r.so_ngay != null && r.so_ngay >= 5)) &&
      (!q.trim() || (r.label_id + ' ' + (r.ten_ch || '') + ' ' + tenGon(r.ten_nhan) + ' ' + (r.khu_vuc || ''))
        .toLowerCase().includes(q.trim().toLowerCase())));
    const { c, d } = sort, h = d === 'asc' ? 1 : -1;
    const val = (r) => c === 'noi' ? (r.ten_ch || tenGon(r.ten_nhan) || '')
      : c === 'so_ngay' || c === 'so_luong' ? (r[c] ?? -1) : (r[c] ?? '');
    return x.sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va === vb) return 0;
      return (typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'vi')) * h;
    });
  }, [rows, nhom, kv, ch, chiCham, q, sort]);

  const doiSort = (c) => setSort((s) => s.c === c ? { c, d: s.d === 'asc' ? 'desc' : 'asc' } : { c, d: 'asc' });
  const Th = ({ c, children, num }) => (
    <th className={'sortable' + (num ? ' num' : '')} onClick={() => doiSort(c)}>
      {children}{sort.c === c ? (sort.d === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  );

  // ===== lộ trình =====
  const tong = tk?.tong || 0;
  const xong = tk?.giao_xong || 0;
  const pct = tong ? Math.round((xong / tong) * 100) : 0;

  return (
    <>
      <div className="cmdbar">
        <div className="cmd-title">
          <h2>Vận đơn</h2>
          <p>Theo dõi hàng đi từ kho tới cửa hàng — cập nhật tự động</p>
        </div>

      </div>

      {/* ===== LỘ TRÌNH GIAO HÀNG — xe chạy trên thanh tiến độ ===== */}
      {tk && (
        <div className="card vd-lotrinh">
          <div className="kt-info">
            <span className="kt-nhan">Lộ trình giao hàng</span>
            <span className="vd-lt-phai">
              <span className="kt-so"><b>{fmtN(xong)}</b><span>/{fmtN(tong)} đơn đã tới cửa hàng</span></span>
              <button className="btn btn-ai vd-btn-nho" onClick={() => chayQuet()} disabled={quet}>
                {quet ? 'Đang cập nhật…' : '↻ Cập nhật ngay'}
              </button>
            </span>
          </div>
          <div className="vd-duong">
            <div className="kt-bar">
              <div className="kt-fill" style={{ width: Math.max(pct, 2) + '%' }}>
                <span className="kt-song" />
              </div>
              <span className="kt-pct">{pct}%</span>
            </div>
            <span className="vd-xe" style={{ left: `calc(${Math.min(Math.max(pct, 2), 97)}% - 16px)` }}>
              <IcTruck />
            </span>
          </div>
          <div className="vd-moc">
            <span><b>{fmtN(tk.cho_lay)}</b> chờ lấy tại kho</span>
            <span><b>{fmtN(tk.dang_giao)}</b> đang trên đường</span>
            <span><b>{fmtN(xong)}</b> đã tới nơi</span>
          </div>
          <div className="vd-chan">
            <span className={'vd-ket-noi' + (wh?.lan_cuoi ? '' : ' tat')}>
              <i className="vd-cham" />{wh?.lan_cuoi ? 'Đã kết nối' : 'Chưa có kết nối'}
            </span>
            <span className="tq-ghi">Tự cập nhật mỗi 15 phút{lanCuoi ? ' · vừa chạy ' +
              lanCuoi.toLocaleTimeString('vi', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
          </div>
        </div>
      )}

      {/* ===== THẺ LỌC ===== */}
      <div className="the-hang the-hang-wrap vd-the-hang">
        <button className={'the-g' + (!nhom && !chiCham ? ' on' : '')}
          onClick={() => { setNhom(null); setChiCham(false); }}>
          <span className="the-g-n">{fmtN(tong)}</span>
          <span className="the-g-t">Tất cả<small>{fmtN(tk?.dang_chay)} chưa xong</small></span>
        </button>
        {[['CHO_LAY', 'Chờ lấy', tk?.cho_lay, 'chưa rời kho'],
          ['DANG_CHAY', 'Đang giao', tk?.dang_giao, 'trên đường'],
          ['GIAO_XONG', 'Đã giao', tk?.giao_xong, 'tới cửa hàng'],
          ['SU_CO', 'Sự cố', tk?.su_co, 'cần xử lý'],
          ['TRA_HANG', 'Trả hàng', tk?.tra_hang, 'quay về kho']].map(([k, t, n, g]) => (
          <button key={k} className={'the-g' + (nhom === k ? ' on' : '')}
            onClick={() => { setNhom(nhom === k ? null : k); setChiCham(false); }}>
            <span className="the-g-n">{fmtN(n)}</span>
            <span className="the-g-t">{t}<small>{g}</small></span>
          </button>
        ))}
        <button className={'the-g' + (chiCham ? ' on' : '')}
          onClick={() => { setChiCham(!chiCham); setNhom(null); }}>
          <span className="the-g-n">{fmtN(tk?.cham)}</span>
          <span className="the-g-t">Đi lâu<small>từ 5 ngày trở lên</small></span>
        </button>
      </div>

      {/* ===== BỘ LỌC ===== */}
      <div className="toolbar vd-loc">
        <DateBox label="Từ" value={tu} onChange={setTu} />
        <DateBox label="Đến" value={den} onChange={setDen} />
        <Sel value={kv} onChange={setKv} placeholder="Tất cả khu vực" style={{ minWidth: 168 }}
          options={[{ value: '', label: 'Tất cả khu vực' }, ...dsKV.map((k) => ({ value: k, label: k }))]} />
        <Sel value={ch} onChange={setCh} placeholder="Tất cả cửa hàng" style={{ minWidth: 190 }} timKiem
          options={[{ value: '', label: 'Tất cả cửa hàng' },
            ...dsNoi.map((n) => ({ value: n, label: n }))]} />
        <div className="vd-tim">
          <IcSearch />
          <input className="flt-in" placeholder="Tìm mã đơn, cửa hàng, khu vực…" value={q}
            onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="sla-chip">{fmtN(ds.length)} đơn</span>
        {tk?.chua_map > 0 && (
          <span className="sla-chip vd-canhbao" onClick={() => setMoCC(true)} style={{ cursor: 'pointer' }}>
            {tk.chua_map} chưa rõ cửa hàng
          </span>
        )}
        <button className="btn btn-ghost" onClick={() => setMoCC(!moCC)}>⚙ Công cụ</button>
      </div>

      {/* ===== CÔNG CỤ ===== */}
      {moCC && (
        <div className="card vd-cc">
          <div className="vd-cc-luoi">
            <div>
              <div className="tq-card-tit">Thêm đơn cũ</div>
              <div className="tq-ghi" style={{ marginBottom: 6 }}>
                Đơn phát sinh trước khi kết nối sẽ không tự về. Dán mã đơn (mỗi dòng một mã)
                để bổ sung — hệ thống tự lấy trạng thái và cửa hàng.
              </div>
              <textarea className="flt-in vd-ta" rows={4} value={txtMa}
                onChange={(e) => setTxtMa(e.target.value)}
                placeholder={'S22987195.MN6-06-E100.1238155346'} />
              <button className="btn btn-ai" onClick={napMa} disabled={dangCC} style={{ marginTop: 8 }}>
                {dangCC ? 'Đang xử lý…' : 'Thêm vào hệ thống'}
              </button>
            </div>
            <div>
              <div className="tq-card-tit">Thêm đơn kèm sẵn tên cửa hàng</div>
              <div className="tq-ghi" style={{ marginBottom: 6 }}>
                Nếu có file ghi mã đơn và tên cửa hàng (cách nhau bằng Tab), dán vào đây
                để xác định ngay. Bình thường không cần — hệ thống tự làm.
              </div>
              <textarea className="flt-in vd-ta" rows={4} value={txtHoc}
                onChange={(e) => setTxtHoc(e.target.value)}
                placeholder={'S22987195.MN13-09-D00.1987295283\tAGG Cái Dầu'} />
              <button className="btn btn-ai" onClick={hocDiem} disabled={dangCC} style={{ marginTop: 8 }}>
                {dangCC ? 'Đang xử lý…' : 'Thêm và xác định'}
              </button>
            </div>
          </div>

          {daGan.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="tq-card-tit">Đã gán thủ công · {daGan.length}</div>
              <div className="tq-ghi" style={{ marginBottom: 8 }}>
                Gán nhầm thì gỡ ra, hệ thống sẽ tự xác định lại theo tên trên phiếu.
              </div>
              <div className="vd-diem-luoi">
                {daGan.map((g) => (
                  <div key={g.ten_nhan} className="vd-diem-o">
                    <div className="vd-diem-ma" title={g.ten_nhan}>{tenGon(g.ten_nhan)}</div>
                    <div className="tq-ghi">→ {g.ten_ch} · {g.so_don} đơn</div>
                    <button className="btn btn-ghost vd-goiy" onClick={() => goGan(g.ten_nhan)}>✕ Gỡ gán</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {diem.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="tq-card-tit">Chưa xác định được cửa hàng · {diem.length} tên</div>
              <div className="tq-ghi" style={{ marginBottom: 8 }}>
                Tên ghi trên phiếu giao không trùng tên cửa hàng trong hệ thống.
                Chọn đúng một lần, mọi đơn cùng tên sẽ tự theo.
              </div>
              <div className="vd-diem-luoi">
                {diem.map((d) => (
                  <div key={d.ten_nhan} className="vd-diem-o">
                    <div className="vd-diem-ma" title={d.ten_nhan}>{tenGon(d.ten_nhan)}</div>
                    <div className="tq-ghi">{d.so_don} đơn</div>
                    {d.goi_y_ma && (
                      <button className="btn btn-ghost vd-goiy" onClick={() => ganDiem(d.ten_nhan, d.goi_y_ma)}
                        title="Gán nhanh theo gợi ý">→ {d.goi_y_ten}</button>
                    )}
                    <select className="flt-in" defaultValue="" onChange={(e) => ganDiem(d.ten_nhan, e.target.value)}>
                      <option value="">— chọn cửa hàng —</option>
                      {dsCH.map((c) => <option key={c.ma_ch} value={c.ma_ch}>{c.ten}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== BẢNG ===== */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="tbl-wrap" style={{ maxHeight: '62vh', overflow: 'auto' }}>
          <table className="tbl">
            <thead><tr>
              <Th c="label_id">Mã đơn</Th>
              <Th c="noi">Nơi nhận</Th>
              <Th c="khu_vuc">Khu vực</Th>
              <Th c="nhom">Trạng thái</Th>
              <Th c="ngay_tao" num>Tạo</Th>
              <Th c="pick_date" num>Lấy</Th>
              <Th c="deliver_date" num>Giao</Th>
              <Th c="so_luong" num>SL</Th>
              <Th c="so_ngay" num>Ngày đi</Th>
            </tr></thead>
            <tbody>
              {ds.map((r) => (
                <Fragment key={r.label_id}>
                  <tr className="cl-row" onClick={() => xoHT(r)}>
                    <td className="mono" style={{ fontSize: 11 }}>{r.label_id}</td>
                    <td><b>{r.ten_ch || tenGon(r.ten_nhan) || <span className="tq-ghi">chưa rõ</span>}</b></td>
                    <td>{r.khu_vuc || ''}</td>
                    <td>
                      <span className={'vd-badge ' + (NHOM[r.nhom]?.c || '')}>{r.status_text || '—'}</span>
                      {r.ly_do && <div className="vd-lydo" title={r.ly_do}>{r.ly_do}</div>}
                    </td>
                    <td className="num">{fmtNg(r.ngay_tao)}</td>
                    <td className="num">{fmtNg(r.pick_date)}</td>
                    <td className="num">{fmtNg(r.deliver_date)}</td>
                    <td className="num">{r.so_luong == null ? '—' : fmtN(r.so_luong)}</td>
                    <td className="num">
                      {r.so_ngay == null ? '—'
                        : <b className={r.so_ngay >= 5 ? 'hh-do' : r.so_ngay >= 3 ? 'hh-cam' : ''}>{r.so_ngay}</b>}
                    </td>
                  </tr>
                  {mo === r.label_id && (
                    <tr className="cl-xo"><td colSpan={9}>
                      <div className="cl-nhom-tit">Hành trình {r.label_id}
                        {(r.ten_ch || r.ten_nhan) ? ' — ' + (r.ten_ch || tenGon(r.ten_nhan)) : ''}</div>
                      {ht === null ? <div className="tq-ghi">Đang tải…</div>
                        : ht.length ? (
                          <div className="vd-ht">
                            {ht.map((h, i) => (
                              <div key={i} className={'vd-ht-b' + (i === ht.length - 1 ? ' cuoi' : '')}>
                                <span className="vd-ht-cham" />
                                <div>
                                  <div className="vd-ht-tt">{h.status_text}</div>
                                  <div className="tq-ghi">{fmtGio(h.action_time)}{h.ly_do ? ' · ' + h.ly_do : ''}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : <div className="tq-ghi">Chưa ghi nhận chặng nào cho đơn này.</div>}
                    </td></tr>
                  )}
                </Fragment>
              ))}
              {!ds.length && <tr><td colSpan={9} className="tq-ghi" style={{ padding: 16 }}>
                Không có đơn nào khớp bộ lọc.
              </td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
