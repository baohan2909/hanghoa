import { useEffect, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { isoVN, DateBox } from '../lib/ui.jsx';

const fmtN = (n) => n == null ? '—' : Number(n).toLocaleString('vi');
const NHAN = {
  DAT: { t: 'Đạt định mức', c: 'cl-dat' },
  CON_THIEU: { t: 'Còn thiếu', c: 'cl-thieu' },
  VUOT: { t: 'Vượt trần', c: 'cl-vuot' },
  CHUA_DN: { t: 'Chưa đề nghị', c: 'cl-chua' },
};

export default function ChatLuongDN() {
  const [tu, setTu] = useState(isoVN());
  const [den, setDen] = useState(isoVN());
  const [rows, setRows] = useState(null);
  const [loc, setLoc] = useState('ALL');
  const [q, setQ] = useState('');
  const [mo, setMo] = useState(null);
  const [nhom, setNhom] = useState(null);
  const [tai, setTai] = useState(false);

  const nap = async () => {
    setTai(true);
    const { data, error } = await sb.rpc('fn_chat_luong_dn', { p_tu: tu, p_den: den });
    if (!error) setRows(data || []);
    setTai(false);
  };
  useEffect(() => { nap(); }, [tu, den]);   // eslint-disable-line

  const xoNhom = async (r) => {
    if (mo === r.ma_ch) { setMo(null); setNhom(null); return; }
    setMo(r.ma_ch); setNhom(null);
    const { data } = await sb.rpc('fn_cldn_nhom', { p_ma_ch: r.ma_ch, p_tu: tu, p_den: den });
    setNhom(data || []);
  };

  const ds = (rows || []).filter((r) =>
    (loc === 'ALL' || r.danh_gia === loc) &&
    (!q.trim() || (r.ten + ' ' + r.ma_ch + ' ' + (r.khu_vuc || '')).toLowerCase().includes(q.trim().toLowerCase())));

  const dem = (k) => (rows || []).filter((r) => r.danh_gia === k).length;
  const daDN = (rows || []).filter((r) => r.danh_gia !== 'CHUA_DN').length;
  const tongThieu = (rows || []).reduce((s, r) => s + (r.thieu_bh || 0) + (r.thieu_nv || 0), 0);

  return (
    <>
      <div className="cmdbar">
        <div className="cmd-title">
          <h2>Chất lượng đề nghị hàng</h2>
          <p>Sau khi đề nghị, cơ cấu hàng hóa của nơi bán đã đủ so định mức chưa</p>
        </div>
      </div>

      <div className="toolbar">
        <DateBox label="Từ" value={tu} onChange={setTu} />
        <DateBox label="Đến" value={den} onChange={setDen} />
        <input className="flt-in" placeholder="Tìm nơi bán / khu vực…" value={q}
          onChange={(e) => setQ(e.target.value)} style={{ height: 40, minWidth: 200, flex: 1 }} />
        <button className="btn btn-ai" onClick={nap}>↻ Làm mới</button>
      </div>

      <div className="the-hang the-hang-wrap" style={{ marginBottom: 14 }}>
        {[
          ['ALL', 'Tất cả nơi bán', rows?.length || 0, ''],
          ['CON_THIEU', 'Còn thiếu sau đề nghị', dem('CON_THIEU'), 'cl-so-thieu'],
          ['DAT', 'Đạt định mức', dem('DAT'), 'cl-so-dat'],
          ['VUOT', 'Vượt trần', dem('VUOT'), 'cl-so-vuot'],
          ['CHUA_DN', 'Chưa đề nghị', dem('CHUA_DN'), 'cl-so-chua'],
        ].map(([k, t, n, cls]) => (
          <div key={k} className={'the-g tq-bam' + (loc === k ? ' cl-on' : '')} onClick={() => setLoc(k)}>
            <div className="the-g-nhan">{t}</div>
            <div className={'the-g-so ' + cls}>{fmtN(n)}</div>
          </div>
        ))}
        <div className="the-g">
          <div className="the-g-nhan">Tổng SP còn hụt</div>
          <div className="the-g-so cl-so-thieu">{fmtN(tongThieu)}</div>
          <div className="tq-ghi">{fmtN(daDN)} nơi đã đề nghị</div>
        </div>
      </div>

      <div className="card">
        {tai && <div className="tq-ghi" style={{ padding: 8 }}>Đang tính…</div>}
        <table className="tbl">
          <thead>
            <tr>
              <th>Nơi bán</th>
              <th>Khu vực</th>
              <th className="num">Tồn BH</th>
              <th className="num">ĐN BH</th>
              <th className="num">Sau ĐN / Định mức</th>
              <th className="num">Tồn NV</th>
              <th className="num">ĐN NV</th>
              <th className="num">Sau ĐN / Định mức</th>
              <th className="num" style={{ width: '1%' }}>Mã ĐN</th>
              <th style={{ width: '1%' }}>Đánh giá</th>
            </tr>
          </thead>
          <tbody>
            {ds.map((r) => {
              const n = NHAN[r.danh_gia] || NHAN.CHUA_DN;
              return (
                <tr key={r.ma_ch} className="cl-row" onClick={() => xoNhom(r)}>
                  <td><b>{r.ten}</b></td>
                  <td>{r.khu_vuc}</td>
                  <td className="num">{fmtN(r.ton_bh)}</td>
                  <td className="num">{r.dn_bh > 0 ? <b className="cl-dn">+{fmtN(r.dn_bh)}</b> : '—'}</td>
                  <td className="num">
                    <b className={r.thieu_bh > 0 ? 'hh-do' : r.du_bh > 0 ? 'hh-cam' : 'hh-ok'}>{fmtN(r.sau_bh)}</b>
                    <span className="tq-ghi"> /{fmtN(r.bh_min)}
                      {r.bh_max < 999998 ? '–' + fmtN(r.bh_max) : ''}</span>
                    {r.thieu_bh > 0 && <span className="cl-hut"> hụt {fmtN(r.thieu_bh)}</span>}
                  </td>
                  <td className="num">{fmtN(r.ton_nv)}</td>
                  <td className="num">{r.dn_nv > 0 ? <b className="cl-dn">+{fmtN(r.dn_nv)}</b> : '—'}</td>
                  <td className="num">
                    <b className={r.thieu_nv > 0 ? 'hh-do' : r.du_nv > 0 ? 'hh-cam' : 'hh-ok'}>{fmtN(r.sau_nv)}</b>
                    <span className="tq-ghi"> /{fmtN(r.nv_min)}
                      {r.nv_max < 999998 ? '–' + fmtN(r.nv_max) : ''}</span>
                    {r.thieu_nv > 0 && <span className="cl-hut"> hụt {fmtN(r.thieu_nv)}</span>}
                  </td>
                  <td className="num">{r.so_ma_dn > 0 ? <>{fmtN(r.so_ma_dn)}<span className="tq-ghi"> · {r.so_nhom_dn} nhóm</span></> : '—'}</td>
                  <td><span className={'cl-badge ' + n.c}>{n.t}</span></td>
                </tr>
              );
            })}
            {mo && nhom && (
              <tr className="cl-xo"><td colSpan={10}>
                <div className="cl-nhom-tit">Cơ cấu nhóm hàng sau đề nghị — {(rows || []).find((x) => x.ma_ch === mo)?.ten}</div>
                <div className="cl-nhom-luoi">
                  {nhom.map((g) => (
                    <div key={g.nganh_3} className={'cl-nhom-o' + (g.sau === 0 ? ' trong' : '')}>
                      <div className="cl-nhom-ten">{g.nganh_3 || '(không rõ)'}</div>
                      <div className="cl-nhom-so">
                        <b>{fmtN(g.sau)}</b>
                        <span className="tq-ghi">tồn {fmtN(g.ton)}{g.dn > 0 ? ` +${fmtN(g.dn)}` : ''}</span>
                      </div>
                      <div className="tq-ghi">bán 30n: {fmtN(g.ban30)}</div>
                      {g.ban30 > 0 && g.sau === 0 && <div className="cl-nhom-cb">⚠ Bán được mà hết sạch</div>}
                    </div>
                  ))}
                  {!nhom.length && <div className="tq-ghi">Không có dữ liệu nhóm hàng</div>}
                </div>
              </td></tr>
            )}
            {!ds.length && !tai && <tr><td colSpan={10} className="tq-ghi" style={{ padding: 16 }}>Không có nơi bán nào khớp bộ lọc</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
