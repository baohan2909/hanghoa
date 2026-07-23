import { Fragment, useEffect, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { isoVN, DateBox } from '../lib/ui.jsx';
import { GHTK_QUET_FN, SUPABASE_ANON } from '../config.js';
import { useApp } from '../App.jsx';

const fmtN = (n) => n == null ? '—' : Number(n).toLocaleString('vi');
const NHOM = {
  CHO_LAY:   { t: 'Chờ lấy',    c: 'vd-cho' },
  DANG_CHAY: { t: 'Đang giao',  c: 'vd-giao' },
  GIAO_XONG: { t: 'Đã giao',    c: 'vd-xong' },
  SU_CO:     { t: 'Sự cố',      c: 'vd-suco' },
  TRA_HANG:  { t: 'Trả hàng',   c: 'vd-tra' },
  HUY:       { t: 'Đã hủy',     c: 'vd-huy' },
};
const fmtNg = (d) => d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '—';
const fmtGio = (t) => t ? new Date(t).toLocaleString('vi', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

export default function VanDon() {
  const { baoToast } = useApp();
  const [tu, setTu] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return isoVN(d); });
  const [den, setDen] = useState(isoVN());
  const [rows, setRows] = useState(null);
  const [tk, setTk] = useState(null);
  const [wh, setWh] = useState(null);
  const [nhom, setNhom] = useState(null);
  const [q, setQ] = useState('');
  const [mo, setMo] = useState(null);
  const [ht, setHt] = useState(null);
  const [quet, setQuet] = useState(false);
  const [moCC, setMoCC] = useState(false);
  const [txtMa, setTxtMa] = useState('');
  const [txtHoc, setTxtHoc] = useState('');
  const [diem, setDiem] = useState([]);
  const [dsCH, setDsCH] = useState([]);
  const [dangCC, setDangCC] = useState(false);

  const tai = async () => {
    const [a, b, c] = await Promise.all([
      sb.rpc('fn_vd_ds', { p_tu: tu, p_den: den, p_ma_ch: null, p_nhom: nhom }),
      sb.rpc('fn_vd_tk', { p_tu: tu, p_den: den }),
      sb.rpc('fn_vd_wh_tinh_trang'),
    ]);
    setRows(a.data || []);
    setTk(b.data || null);
    setWh(c.data || null);
  };
  useEffect(() => { tai(); }, [tu, den, nhom]);   // eslint-disable-line

  const taiDiem = async () => {
    const [a, b] = await Promise.all([
      sb.rpc('fn_vd_ten_la'),
      sb.from('cua_hang').select('ma_ch, ten').or('ma_ch.like.CH%,ma_ch.like.DB%')
        .eq('hoat_dong', true).order('ten'),
    ]);
    setDiem(a.data || []);
    setDsCH(b.data || []);
  };
  useEffect(() => { if (moCC) taiDiem(); }, [moCC]);   // eslint-disable-line

  // Nạp danh sách mã đơn cũ: ghi mã vào DB rồi nhờ GHTK trả chi tiết
  const napMa = async () => {
    const ds = txtMa.split(/[\n,;\t]+/).map((x) => x.trim())
      .filter((x) => x.length > 8);
    if (!ds.length) { baoToast('Chưa có mã nào hợp lệ'); return; }
    setDangCC(true);
    const { data, error } = await sb.rpc('fn_vd_nap_ma', { p: ds });
    if (error) { baoToast('Lỗi: ' + error.message); setDangCC(false); return; }
    baoToast(`Đã ghi nhận ${data?.da_nhan ?? 0} mã — đang hỏi GHTK…`);
    try {
      const res = await fetch(GHTK_QUET_FN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + SUPABASE_ANON },
        body: JSON.stringify({ ma: ds }),
      });
      const j = await res.json();
      baoToast(j.error ? 'GHTK lỗi: ' + j.error
        : `Xong: hỏi ${j.so_luong} đơn · cập nhật ${j.cap_nhat}${j.loi ? ` · lỗi ${j.loi}` : ''}`);
    } catch (e) { baoToast('Không gọi được GHTK: ' + e.message); }
    setTxtMa(''); setDangCC(false); tai(); taiDiem();
  };

  // Học ánh xạ điểm giao từ danh sách "mã đơn <tab> tên cửa hàng"
  const hocDiem = async () => {
    const rows = txtHoc.split(/\n+/).map((d) => {
      const c = d.split(/\t|;|\s{2,}|,(?=\s*[A-ZĐ])/).map((x) => x.trim()).filter(Boolean);
      if (c.length < 2) return null;
      const label = c.find((x) => /^S\d/.test(x)) || c[0];
      const ten = c.filter((x) => x !== label).join(' ').trim();
      return label && ten ? { label, ten } : null;
    }).filter(Boolean);
    if (!rows.length) { baoToast('Không đọc được dòng nào (cần: mã đơn + tên cửa hàng)'); return; }
    setDangCC(true);
    const { data, error } = await sb.rpc('fn_vd_gan_ten', { p: rows });
    setDangCC(false);
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    baoToast(`Gán được ${data?.map_duoc ?? 0} đơn${data?.chua_map ? ` · ${data.chua_map} tên chưa khớp cửa hàng` : ''}`);
    setTxtHoc(''); tai(); taiDiem();
  };

  const ganDiem = async (ten, ma_ch) => {
    if (!ma_ch) return;
    const { data, error } = await sb.rpc('fn_vd_gan_ten_ch', { p_ten: ten, p_ma_ch: ma_ch });
    if (error) { baoToast('Lỗi: ' + error.message); return; }
    baoToast(`Đã gán ${data ?? 0} đơn cho cửa hàng này`);
    tai(); taiDiem();
  };

  const xoHT = async (r) => {
    if (mo === r.label_id) { setMo(null); setHt(null); return; }
    setMo(r.label_id); setHt(null);
    const { data } = await sb.rpc('fn_vd_hanh_trinh', { p_label: r.label_id });
    setHt(data || []);
  };

  const chayQuet = async () => {
    setQuet(true);
    try {
      const res = await fetch(GHTK_QUET_FN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + SUPABASE_ANON },
        body: JSON.stringify({ so: 150 }),
      });
      const j = await res.json();
      if (j.error) baoToast('GHTK lỗi: ' + j.error);
      else baoToast(`Đã hỏi GHTK ${j.so_luong} đơn · cập nhật ${j.cap_nhat}${j.loi ? ` · lỗi ${j.loi}` : ''}`);
      tai();
    } catch (e) { baoToast('Không gọi được: ' + e.message); }
    setQuet(false);
  };

  const ds = (rows || []).filter((r) => !q.trim() ||
    (r.label_id + ' ' + (r.ten_ch || '') + ' ' + (r.ten_nhan || '') + ' ' + (r.khu_vuc || ''))
      .toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <>
      <div className="cmdbar">
        <div className="cmd-title">
          <h2>Vận đơn GHTK</h2>
          <p>Trạng thái &amp; hành trình cập nhật trực tiếp từ Giao Hàng Tiết Kiệm</p>
        </div>
      </div>

      <div className="toolbar">
        <DateBox label="Từ" value={tu} onChange={setTu} />
        <DateBox label="Đến" value={den} onChange={setDen} />
        <input className="flt-in" placeholder="Tìm mã vận đơn / cửa hàng…" value={q}
          onChange={(e) => setQ(e.target.value)} style={{ height: 40, minWidth: 200, flex: 1 }} />
        {tk?.chua_map > 0 && <span className="sla-chip vd-canhbao">{tk.chua_map} đơn chưa nhận diện cửa hàng</span>}
        <button className="btn btn-ghost" onClick={() => setMoCC(!moCC)}>⚙ Nạp &amp; ánh xạ</button>
        <button className="btn btn-ai" onClick={chayQuet} disabled={quet}>
          {quet ? 'Đang hỏi GHTK…' : '↻ Cập nhật từ GHTK'}
        </button>
      </div>

      {wh && (
        <div className={'vd-wh' + (wh.tong_24h > 0 && !wh.loi_24h ? ' ok' : wh.loi_24h > 0 ? ' loi' : ' cho')}>
          <span className="vd-wh-den" />
          {wh.lan_cuoi ? (
            <>
              <b>Webhook GHTK đang hoạt động</b>
              <span className="tq-ghi">
                nhận {fmtN(wh.tong_24h)} tin trong 24 giờ · gần nhất{' '}
                {wh.phut_truoc < 1 ? 'vừa xong'
                  : wh.phut_truoc < 60 ? Math.round(wh.phut_truoc) + ' phút trước'
                  : Math.round(wh.phut_truoc / 60) + ' giờ trước'}
                {wh.loi_24h > 0 ? ` · ${fmtN(wh.loi_24h)} tin lỗi` : ''}
              </span>
            </>
          ) : (
            <>
              <b>Chưa nhận được tin nào từ GHTK</b>
              <span className="tq-ghi">Kiểm tra lại cấu hình webhook bên GHTK (URL + header X-NS-Key)</span>
            </>
          )}
        </div>
      )}

      {moCC && (
        <div className="card vd-cc">
          <div className="vd-cc-luoi">
            <div>
              <div className="tq-card-tit">1 · Nạp đơn cũ</div>
              <div className="tq-ghi" style={{ marginBottom: 6 }}>
                Dán danh sách mã vận đơn (mỗi dòng một mã, hoặc phân cách bằng dấu phẩy).
                Hệ thống sẽ hỏi GHTK để lấy trạng thái &amp; ngày tháng.
              </div>
              <textarea className="flt-in vd-ta" rows={5} value={txtMa}
                onChange={(e) => setTxtMa(e.target.value)}
                placeholder={'S22987195.MN6-06-E100.1238155346\nS22987195.MN14-01-S1.1046975540'} />
              <button className="btn btn-ai" onClick={napMa} disabled={dangCC} style={{ marginTop: 8 }}>
                {dangCC ? 'Đang xử lý…' : 'Nạp danh sách'}
              </button>
            </div>
            <div>
              <div className="tq-card-tit">2 · Gán cửa hàng từ file có sẵn</div>
              <div className="tq-ghi" style={{ marginBottom: 6 }}>
                Nếu đã có file kèm tên cửa hàng, dán vào đây để gán ngay — <b>khỏi phải đọc nhãn</b>.
                Mỗi dòng: <b>mã đơn</b> rồi <b>tên cửa hàng</b> (cách nhau bằng Tab).
                Đơn nào không có trong file thì hệ thống tự đọc nhãn mỗi giờ.
              </div>
              <textarea className="flt-in vd-ta" rows={5} value={txtHoc}
                onChange={(e) => setTxtHoc(e.target.value)}
                placeholder={'S22987195.MN13-09-D00.1987295283\tAGG Cái Dầu (Cửa Hàng Nón Sơn)'} />
              <button className="btn btn-ai" onClick={hocDiem} disabled={dangCC} style={{ marginTop: 8 }}>
                {dangCC ? 'Đang xử lý…' : 'Gán cửa hàng'}
              </button>
            </div>
          </div>

          {diem.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="tq-card-tit">Tên trên nhãn chưa khớp cửa hàng nào · {diem.length}</div>
              <div className="vd-diem-luoi">
                {diem.map((d) => (
                  <div key={d.ten_nhan} className="vd-diem-o">
                    <div className="vd-diem-ma">{d.ten_nhan}</div>
                    <div className="tq-ghi">{d.so_don} đơn</div>
                    <select className="flt-in" defaultValue=""
                      onChange={(e) => ganDiem(d.ten_nhan, e.target.value)}>
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

      {tk && (
        <div className="the-hang the-hang-wrap" style={{ marginBottom: 14 }}>
          <div className={'the-g tq-bam' + (nhom === null ? ' cl-on' : '')} onClick={() => setNhom(null)}>
            <div className="the-g-nhan">Tổng vận đơn</div>
            <div className="the-g-so">{fmtN(tk.tong)}</div>
            <div className="tq-ghi">{fmtN(tk.dang_chay)} đang chạy</div>
          </div>
          {[['CHO_LAY', 'Chờ lấy', tk.cho_lay], ['DANG_CHAY', 'Đang giao', tk.dang_giao],
            ['GIAO_XONG', 'Đã giao', tk.giao_xong], ['SU_CO', 'Sự cố', tk.su_co],
            ['TRA_HANG', 'Trả hàng', tk.tra_hang], ['HUY', 'Đã hủy', tk.huy]].map(([k, t, n]) => (
            <div key={k} className={'the-g tq-bam' + (nhom === k ? ' cl-on' : '')} onClick={() => setNhom(nhom === k ? null : k)}>
              <div className="the-g-nhan">{t}</div>
              <div className={'the-g-so ' + (NHOM[k]?.c || '')}>{fmtN(n)}</div>
            </div>
          ))}
          <div className="the-g">
            <div className="the-g-nhan">Chậm ≥5 ngày</div>
            <div className="the-g-so vd-suco">{fmtN(tk.cham)}</div>
            <div className="tq-ghi">chưa chốt</div>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="tbl-wrap" style={{ maxHeight: '62vh', overflow: 'auto' }}>
          <table className="tbl">
            <thead><tr>
              <th>Mã vận đơn</th>
              <th>Nơi nhận</th>
              <th>Khu vực</th>
              <th>Trạng thái</th>
              <th className="num" style={{ width: '1%' }}>Tạo</th>
              <th className="num" style={{ width: '1%' }}>Lấy</th>
              <th className="num" style={{ width: '1%' }}>Giao</th>
              <th className="num" style={{ width: '1%' }}>SL</th>
              <th className="num" style={{ width: '1%' }}>Ngày chạy</th>
            </tr></thead>
            <tbody>
              {ds.map((r) => (
                <Fragment key={r.label_id}>
                  <tr className="cl-row" onClick={() => xoHT(r)}>
                    <td className="mono" style={{ fontSize: 11 }}>{r.label_id}</td>
                    <td><b>{r.ten_ch || r.ten_nhan || <span className="tq-ghi">chưa nhận diện</span>}</b></td>
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
                      <div className="cl-nhom-tit">Hành trình đơn {r.label_id}</div>
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
                        ) : <div className="tq-ghi">Chưa có chặng nào — hành trình được ghi từ khi bật webhook.</div>}
                    </td></tr>
                  )}
                </Fragment>
              ))}
              {!ds.length && <tr><td colSpan={9} className="tq-ghi" style={{ padding: 16 }}>
                Chưa có vận đơn nào trong khoảng này. Bấm "Cập nhật từ GHTK" để nạp.
              </td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
