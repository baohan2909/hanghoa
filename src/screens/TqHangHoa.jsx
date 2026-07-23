import { useEffect, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { IcBox, IcAlert } from '../lib/icons.jsx';

const fmtN = (n) => n == null ? '—' : Number(n).toLocaleString('vi');

/* ===== Ô XOAY VÒNG: top bán chạy hôm nay, tự đổi mỗi 6 giây ===== */
function BangVang({ ds }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!ds?.length) return;
    const t = setInterval(() => setI((x) => (x + 1) % ds.length), 6000);
    return () => clearInterval(t);
  }, [ds]);
  if (!ds?.length) return (
    <div className="card hh-vang trong">
      <div className="hh-vang-tit">★ Bán chạy nhất hôm nay</div>
      <div className="tq-ghi" style={{ padding: '18px 0' }}>Hôm nay chưa có giao dịch nào</div>
    </div>
  );
  const s = ds[i];
  return (
    <div className="card hh-vang">
      <div className="hh-vang-tit">★ Bán chạy nhất hôm nay <span className="hh-vang-dem">{i + 1}/{ds.length}</span></div>
      <div className="hh-vang-body" key={i}>
        <div className="hh-vang-hang">#{i + 1}</div>
        {s.hinh_url
          ? <img className="hh-vang-anh" src={s.hinh_url} alt="" onError={(e) => { e.target.style.visibility = 'hidden'; }} />
          : <span className="hh-vang-anh trong"><IcBox /></span>}
        <div className="hh-vang-tt">
          <div className="hh-vang-ma mono">{s.ma_tham_chieu}</div>
          <div className="tq-ghi">{s.nganh_3 || ''}</div>
          <div className="hh-vang-so">
            <span><b>{fmtN(s.sl)}</b> sp bán</span>
            <span><b>{fmtN(s.so_ch)}</b> nơi bán</span>
            <span className={s.ton_he > 0 ? '' : 'het'}><b>{fmtN(s.ton_he)}</b> tồn hệ thống</span>
          </div>
        </div>
      </div>
      <div className="hh-vang-dots">
        {ds.map((_, k) => <i key={k} className={k === i ? 'on' : ''} onClick={() => setI(k)} />)}
      </div>
    </div>
  );
}

/* ===== Thanh phân bố 3 mức (thiếu / đạt / vượt) ===== */
function ThanhCC({ nhan, thieu, dat, vuot }) {
  const t = thieu + dat + vuot || 1;
  return (
    <div className="hh-cc">
      <div className="hh-cc-nhan">{nhan}</div>
      <div className="hh-cc-bar">
        <div className="thieu" style={{ width: (thieu / t) * 100 + '%' }} title={`Thiếu: ${thieu}`} />
        <div className="dat" style={{ width: (dat / t) * 100 + '%' }} title={`Đạt: ${dat}`} />
        <div className="vuot" style={{ width: (vuot / t) * 100 + '%' }} title={`Vượt: ${vuot}`} />
      </div>
      <div className="hh-cc-so">
        <span className="do">{thieu} thiếu</span>
        <span className="ok">{dat} đạt</span>
        <span className="cam">{vuot} vượt</span>
      </div>
    </div>
  );
}

/* ===== Bảng nhỏ dùng chung ===== */
function BangMini({ tit, cot, rows, rong }) {
  return (
    <div className="card tq-card hh-bang">
      <div className="tq-card-tit">{tit}</div>
      {rows?.length ? (
        <table className="tbl hh-tbl">
          <thead><tr>{cot.map((c) => <th key={c.k} style={c.w ? { width: c.w } : undefined}
            className={c.num ? 'num' : ''}>{c.t}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>{cot.map((c) => (
                <td key={c.k} className={(c.num ? 'num ' : '') + (c.cls ? c.cls(r) : '')}>
                  {c.render ? c.render(r) : r[c.k]}
                </td>
              ))}</tr>
            ))}
          </tbody>
        </table>
      ) : <div className="tq-ghi" style={{ padding: '10px 2px' }}>{rong || 'Không có trường hợp nào'}</div>}
    </div>
  );
}

export default function TqHangHoa({ chonTab = () => {} }) {
  const [d, setD] = useState(null);
  const [tabLau, setTabLau] = useState('all');

  useEffect(() => {
    let huy = false;
    sb.rpc('fn_tq_hang_hoa').then(({ data }) => { if (!huy && data) setD(data); });
    return () => { huy = true; };
  }, []);

  if (!d) return (
    <div className="card tq-card" style={{ marginBottom: 14, padding: 26, textAlign: 'center', color: 'var(--ink-2)' }}>
      Đang phân tích hàng hóa toàn hệ thống…
    </div>
  );

  const sk = d.suc_khoe || {}, cc = d.co_cau_dm || {}, lt = d.lau_tong || {};
  const tongSK = (sk.nguy || 0) + (sk.tot || 0) + (sk.cham || 0) + (sk.u || 0) + (sk.ko_ban || 0) || 1;
  const lauDs = tabLau === 'bh' ? d.lau_bh : tabLau === 'nv' ? d.lau_nv : d.lau_all;

  return (
    <>
      {/* ===== Ô xoay vòng + sức khỏe tồn ===== */}
      <div className="hh-hang1">
        <BangVang ds={d.top_ngay} />

        <div className="card tq-card">
          <div className="tq-card-tit">Sức khỏe tồn kho · toàn hệ thống</div>
          <div className="hh-sk">
            {[
              { k: 'nguy', t: 'Dưới 7 ngày', mo: 'nguy cơ trống kệ', mau: 'do' },
              { k: 'tot', t: '7 – 45 ngày', mo: 'lành mạnh', mau: 'xanh' },
              { k: 'cham', t: '45 – 90 ngày', mo: 'bán chậm', mau: 'vang' },
              { k: 'u', t: 'Trên 90 ngày', mo: 'ứ đọng', mau: 'cam' },
              { k: 'ko_ban', t: 'Không bán 30 ngày', mo: 'đóng băng', mau: 'xam' },
            ].map((m) => (
              <div key={m.k} className="hh-sk-dong">
                <span className={'hh-sk-cham ' + m.mau} />
                <span className="hh-sk-ten">{m.t}<span className="tq-ghi"> · {m.mo}</span></span>
                <div className="hh-sk-bar"><div className={'f ' + m.mau}
                  style={{ width: ((sk[m.k] || 0) / tongSK) * 100 + '%' }} /></div>
                <b className="hh-sk-so">{fmtN(sk[m.k] || 0)}</b>
              </div>
            ))}
          </div>
          <div className="hh-cc-wrap">
            <ThanhCC nhan="Mũ bảo hiểm — so định mức" thieu={cc.bh_thieu || 0} dat={cc.bh_dat || 0} vuot={cc.bh_vuot || 0} />
            <ThanhCC nhan="Nón vải — so định mức" thieu={cc.nv_thieu || 0} dat={cc.nv_dat || 0} vuot={cc.nv_vuot || 0} />
          </div>
        </div>
      </div>

      {/* ===== Biến động trong ngày ===== */}
      <div className="tq-hang2" style={{ marginBottom: 14 }}>
        <BangMini tit="▲ Tăng đột biến hôm nay" rows={d.tang_ngay}
          rong="Chưa có mã nào tăng đột biến"
          cot={[
            { k: 'ma_tham_chieu', t: 'Mã', render: (r) => <span className="mono">{r.ma_tham_chieu}</span> },
            { k: 'nganh_3', t: 'Nhóm' },
            { k: 'tb7', t: 'TB/ngày', num: true, w: '1%' },
            { k: 'sl', t: 'Hôm nay', num: true, w: '1%', render: (r) => <b>{fmtN(r.sl)}</b> },
            { k: 'pct', t: '', num: true, w: '1%', render: (r) => <span className="hh-up">+{r.pct}%</span> },
          ]} />
        <BangMini tit="▼ Giảm sâu hôm nay" rows={d.giam_ngay}
          rong="Không có mã nào giảm bất thường"
          cot={[
            { k: 'ma_tham_chieu', t: 'Mã', render: (r) => <span className="mono">{r.ma_tham_chieu}</span> },
            { k: 'nganh_3', t: 'Nhóm' },
            { k: 'tb7', t: 'TB/ngày', num: true, w: '1%' },
            { k: 'sl', t: 'Hôm nay', num: true, w: '1%', render: (r) => <b>{fmtN(r.sl)}</b> },
            { k: 'pct', t: '', num: true, w: '1%', render: (r) => <span className="hh-down">{r.pct}%</span> },
          ]} />
      </div>

      {/* ===== Thiếu / Vượt định mức ===== */}
      <div className="tq-hang2" style={{ marginBottom: 14 }}>
        <BangMini tit={<><IcAlert /> Nơi bán THIẾU hàng nghiêm trọng · {fmtN(d.ch_thieu_n)} nơi</>}
          rows={d.ch_thieu} rong="Không nơi nào hụt định mức ≥30%"
          cot={[
            { k: 'ten', t: 'Nơi bán' },
            { k: 'khu_vuc', t: 'Khu vực' },
            { k: 'bh', t: 'Mũ BH', num: true, render: (r) => <span className={r.hut_bh > 0 ? 'hh-do' : ''}>{fmtN(r.ton_bh)}<span className="tq-ghi">/{fmtN(r.bh_min)}</span></span> },
            { k: 'nv', t: 'Nón vải', num: true, render: (r) => <span className={r.hut_nv > 0 ? 'hh-do' : ''}>{fmtN(r.ton_nv)}<span className="tq-ghi">/{fmtN(r.nv_min)}</span></span> },
            { k: 'hut', t: 'Hụt', num: true, w: '1%', render: (r) => <b className="hh-down">−{r.hut}%</b> },
          ]} />
        <BangMini tit={<><IcAlert /> Nơi bán VƯỢT định mức · {fmtN(d.ch_vuot_n)} nơi{d.ch_vuot_nang_n > 0 ? ` (${d.ch_vuot_nang_n} vượt ≥100%)` : ''}</>}
          rows={d.ch_vuot} rong="Không nơi nào vượt trần ≥20%"
          cot={[
            { k: 'ten', t: 'Nơi bán' },
            { k: 'bh', t: 'Mũ BH', num: true, render: (r) => <span className={r.vuot_bh > 0 ? 'hh-cam' : ''}>{fmtN(r.ton_bh)}<span className="tq-ghi">/{fmtN(r.bh_max)}</span></span> },
            { k: 'nv', t: 'Nón vải', num: true, render: (r) => <span className={r.vuot_nv > 0 ? 'hh-cam' : ''}>{fmtN(r.ton_nv)}<span className="tq-ghi">/{fmtN(r.nv_max)}</span></span> },
            { k: 'ngay_ton', t: 'Ngày tồn', num: true, w: '1%', render: (r) => r.ngay_ton == null ? '—' : fmtN(r.ngay_ton) },
            { k: 'vuot', t: 'Vượt', num: true, w: '1%', render: (r) => <b className={r.vuot >= 100 ? 'hh-do' : 'hh-cam'}>+{r.vuot}%</b> },
          ]} />
      </div>

      {/* ===== Tồn lâu không bán ===== */}
      <div className="card tq-card" style={{ marginBottom: 14 }}>
        <div className="hh-lau-head">
          <div className="tq-card-tit" style={{ marginBottom: 0 }}>Mã tồn lâu không bán (≥45 ngày)</div>
          <div className="hh-lau-tong">
            <span><b>{fmtN(lt.so_ma)}</b> mã</span>
            <span><b>{fmtN(lt.ton)}</b> sp đóng băng</span>
            <span className="tq-ghi">BH {fmtN(lt.ton_bh)} · NV {fmtN(lt.ton_nv)}</span>
          </div>
          <div className="hh-tabs">
            {[['all', 'Toàn hệ thống'], ['bh', 'Mũ bảo hiểm'], ['nv', 'Nón vải']].map(([k, t]) => (
              <button key={k} className={'hh-tab' + (tabLau === k ? ' on' : '')} onClick={() => setTabLau(k)}>{t}</button>
            ))}
          </div>
        </div>
        {lauDs?.length ? (
          <table className="tbl hh-tbl">
            <thead><tr>
              <th>Mã tham chiếu</th><th>Nhóm hàng</th>
              <th className="num" style={{ width: '1%' }}>Tồn</th>
              <th className="num" style={{ width: '1%' }}>Nơi giữ</th>
              <th className="num" style={{ width: '1%' }}>Im lặng</th>
            </tr></thead>
            <tbody>
              {lauDs.map((r) => (
                <tr key={r.ma_tham_chieu}>
                  <td className="mono">{r.ma_tham_chieu}</td>
                  <td>{r.nganh_3 || ''}</td>
                  <td className="num"><b>{fmtN(r.ton)}</b></td>
                  <td className="num">{fmtN(r.so_ch)}</td>
                  <td className="num"><span className={r.ngay_im >= 90 ? 'hh-do' : 'hh-cam'}>
                    {r.ngay_im >= 999 ? '90+' : r.ngay_im} ngày</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="tq-ghi">Không có mã nào tồn lâu — rất tốt</div>}
      </div>

      {/* ===== Phân bổ chưa hợp lý + nơi bán ít mã ===== */}
      <div className="tq-hang2">
        <BangMini tit={<>Phân bổ chưa hợp lý · {fmtN(d.phan_bo_n)} mã</>}
          rows={d.phan_bo}
          rong="Phân bổ đang hợp lý"
          cot={[
            { k: 'ma_tham_chieu', t: 'Mã', render: (r) => <span className="mono">{r.ma_tham_chieu}</span> },
            { k: 'ch_het_ban', t: 'Nơi hết mà vẫn bán', num: true, render: (r) => <b className="hh-do">{r.ch_het_ban}</b> },
            { k: 'ton_cao_nhat', t: 'Nơi ôm nhiều nhất', num: true, render: (r) => <span><b className="hh-cam">{fmtN(r.ton_cao_nhat)}</b> <span className="tq-ghi">{r.ten_ch_om || ''}</span></span> },
          ]} />
        <BangMini tit={<>Nơi bán có ÍT MÃ nhất · trung bình {fmtN(d.ma_tb)} mã/nơi</>}
          rows={d.it_ma}
          cot={[
            { k: 'ten', t: 'Nơi bán' },
            { k: 'khu_vuc', t: 'Khu vực' },
            { k: 'so_ma', t: 'Số mã', num: true, w: '1%', render: (r) => <b className={r.so_ma < (d.ma_tb || 0) * 0.5 ? 'hh-do' : 'hh-cam'}>{fmtN(r.so_ma)}</b> },
            { k: 'ton_all', t: 'Tồn', num: true, w: '1%', render: (r) => fmtN(r.ton_all) },
            { k: 'ban30', t: 'Bán 30n', num: true, w: '1%', render: (r) => fmtN(r.ban30) },
          ]} />
      </div>

      {/* Nơi bán nhiều mã tồn lâu */}
      <BangMini tit="Nơi bán ôm nhiều mã chết (không bán ≥45 ngày)"
        rows={d.ch_ton_lau} rong="Không nơi nào ôm quá 5 mã chết"
        cot={[
          { k: 'ten', t: 'Nơi bán' },
          { k: 'khu_vuc', t: 'Khu vực' },
          { k: 'so_ma_im', t: 'Mã chết', num: true, w: '1%', render: (r) => <b className="hh-do">{fmtN(r.so_ma_im)}</b> },
          { k: 'so_ma', t: 'Tổng mã', num: true, w: '1%', render: (r) => fmtN(r.so_ma) },
          { k: 'pct_im', t: 'Tỷ lệ', num: true, w: '1%', render: (r) => <b className={r.pct_im >= 50 ? 'hh-do' : 'hh-cam'}>{r.pct_im}%</b> },
          { k: 'ton_im', t: 'SP đóng băng', num: true, w: '1%', render: (r) => fmtN(r.ton_im) },
        ]} />
    </>
  );
}
