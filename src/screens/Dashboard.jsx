import { useEffect, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { IcRefresh, IcAlert, IcClock, IcBox, IcPulse } from '../lib/icons.jsx';

const fmtN = (n) => n == null ? '—' : Number(n).toLocaleString('vi');
const fmtTr = (n) => { const v = Number(n) || 0; return v >= 1e6 ? (v / 1e6).toFixed(v % 1e6 ? 1 : 0).replace('.', ',') + ' triệu' : fmtN(v); };

/* Ảnh sản phẩm: rê chuột phóng to, bấm xem toàn màn hình */
function AnhSP({ url, ten, onMo }) {
  if (!url) return <span className="tqa tqa-trong"><IcBox /></span>;
  return (
    <span className="tqa-boc">
      <img className="tqa" src={url} alt="" loading="lazy" onClick={() => onMo(url, ten)}
        onError={(e) => { e.target.style.visibility = 'hidden'; }} />
      <span className="tqa-to"><img src={url} alt="" /></span>
    </span>
  );
}

function Delta({ nay, truoc, nhan }) {
  if (!truoc) return <span className="tq-ghi">{nhan}</span>;
  const pct = Math.round(((nay - truoc) / truoc) * 100);
  return (
    <span className={'tq-delta ' + (pct > 3 ? 'tang' : pct < -3 ? 'giam' : 'bang')}>
      {pct > 0 ? '▲' : pct < 0 ? '▼' : '='} {Math.abs(pct)}% <i>{nhan}</i>
    </span>
  );
}

/* Biểu đồ 14 ngày — số nằm TRONG cột, tổng ở trên */
function Chart({ data }) {
  if (!data?.length) return null;
  const W = 760, H = 230, PAD = 30, BW = (W - PAD * 2) / data.length;
  const max = Math.max(...data.map((d) => d.bh + d.nv), 1);
  return (
    <svg viewBox={`0 0 ${W} ${H + 38}`} className="tq-chart" preserveAspectRatio="xMidYMid meet">
      {[0.5, 1].map((p) => (
        <line key={p} x1={PAD} x2={W - PAD} y1={H - H * p * 0.84} y2={H - H * p * 0.84} className="tq-grid" />
      ))}
      {data.map((d, i) => {
        const tong = d.bh + d.nv;
        const hB = (d.bh / max) * H * 0.84, hN = (d.nv / max) * H * 0.84;
        const x = PAD + i * BW + BW * 0.14, w = BW * 0.72;
        const cuoi = i === data.length - 1;
        return (
          <g key={d.ngay}>
            <title>{d.ngay}: {fmtN(tong)} sp — mũ bảo hiểm {fmtN(d.bh)}, nón vải {fmtN(d.nv)}</title>
            {d.nv > 0 && <rect x={x} y={H - hB - hN} width={w} height={Math.max(hN, 2)} rx={3} className="tq-bar-nv" />}
            {d.bh > 0 && <rect x={x} y={H - hB} width={w} height={Math.max(hB, 2)} rx={3}
              className={'tq-bar' + (cuoi ? ' nay' : '')} />}
            {tong > 0 && <text x={x + w / 2} y={H - hB - hN - 6} className="tq-bar-tong" textAnchor="middle">{fmtN(tong)}</text>}
            {hB > 18 && <text x={x + w / 2} y={H - hB / 2 + 4} className="tq-bar-so" textAnchor="middle">{fmtN(d.bh)}</text>}
            {hN > 18 && <text x={x + w / 2} y={H - hB - hN / 2 + 4} className="tq-bar-so nv" textAnchor="middle">{fmtN(d.nv)}</text>}
            <text x={x + w / 2} y={H + 15} className="tq-truc" textAnchor="middle">{d.ngay.slice(8, 10)}/{d.ngay.slice(5, 7)}</text>
          </g>
        );
      })}
      <rect x={PAD} y={H + 26} width={10} height={10} rx={3} className="tq-bar" />
      <text x={PAD + 15} y={H + 35} className="tq-truc">Mũ bảo hiểm</text>
      <rect x={PAD + 100} y={H + 26} width={10} height={10} rx={3} className="tq-bar-nv" />
      <text x={PAD + 115} y={H + 35} className="tq-truc">Nón vải</text>
    </svg>
  );
}

export default function Dashboard({ chonTab = () => {} }) {
  const [d, setD] = useState(null);
  const [luc, setLuc] = useState(null);
  const [tai, setTai] = useState(false);
  const [anh, setAnh] = useState(null);
  const [modal, setModal] = useState(null);      // { loai, ds }

  const nap = async (im) => {
    if (!im) setTai(true);
    const { data } = await sb.rpc('fn_tong_quan');
    if (data) { setD(data); setLuc(new Date()); }
    setTai(false);
  };
  useEffect(() => { nap(); const t = setInterval(() => nap(true), 120000); return () => clearInterval(t); }, []);

  const moMa = async (loai) => {
    setModal({ loai, ds: null });
    const { data } = await sb.rpc('fn_tq_ma_van_de', { p_loai: loai });
    setModal({ loai, ds: data || [] });
  };

  if (!d) return (
    <>
      <div className="cmdbar"><div className="cmd-title"><h2>Tổng quan hàng hóa</h2><p>Đang tải…</p></div></div>
      <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--ink-2)' }}>Đang tổng hợp…</div>
    </>
  );

  const hn = d.hom_nay || {}, ct = d.cung_thu || {}, th = d.thieu || {},
        cc = d.cao_cap || {}, li = d.lich || {}, kc = d.kc || {}, cl = d.cldn || {};
  const chuaGui = Math.max((li.so_lich || 0) - (li.da_gui || 0) - (li.kdn || 0), 0);
  const heThongOK = !(d.sync || []).some((s) => s.tt === 'LOI') && !(d.doi_soat || []).some((x) => !x.khop);

  return (
    <>
      <div className="cmdbar">
        <div className="cmd-title">
          <h2>Tổng quan hàng hóa</h2>
          <p>Hàng có đủ không · thiếu ở đâu · mã nào đang có vấn đề</p>
        </div>
        <div className="cmd-row">
          <span className="hd-gio"><IcClock /> {luc ? luc.toLocaleTimeString('vi', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
          <button className="btn-hd" onClick={() => nap()} disabled={tai}>
            <IcRefresh /> {tai ? 'Đang tải…' : 'Làm mới'}
          </button>
        </div>
      </div>

      {/* ===== TẦNG 1: NHỊP BÁN HÔM NAY + CẢNH BÁO HÀNG ===== */}
      <div className="tq-kpi4">
        <div className="tq-lon">
          <div className="tq-lon-nhan">Bán hôm nay</div>
          <div className="tq-lon-so">{fmtN(hn.tong)}<i>sp</i></div>
          <Delta nay={hn.tong} truoc={ct.tb} nhan="so cùng thứ 4 tuần" />
          <div className="tq-tach">
            <span><b>{fmtN(hn.bh)}</b> mũ bảo hiểm <Delta nay={hn.bh} truoc={ct.tb_bh} nhan="" /></span>
            <span><b>{fmtN(hn.nv)}</b> nón vải <Delta nay={hn.nv} truoc={ct.tb_nv} nhan="" /></span>
          </div>
        </div>

        <div className="tq-lon canh-bao tq-bam" onClick={() => chonTab('giamsat')}>
          <div className="tq-lon-nhan">Cửa hàng đang thiếu hàng</div>
          <div className="tq-lon-so">{fmtN(th.so_ch)}<i>/{fmtN(th.tong_ch)} nơi</i></div>
          <div className="tq-ghi">còn hụt <b>{fmtN(th.sp_hut)}</b> sản phẩm so định mức tối thiểu</div>
        </div>

        <div className="tq-lon canh-bao tq-bam" onClick={() => moMa('CHAY')}>
          <div className="tq-lon-nhan">Mã cháy hàng — kho còn</div>
          <div className="tq-lon-so">{fmtN(d.chay_hang)}<i>mã</i></div>
          <div className="tq-ghi">bán được nhưng nơi bán đã hết · <b>bấm xem ngay</b></div>
        </div>

        <div className="tq-lon tq-bam" onClick={() => moMa('SX')}>
          <div className="tq-lon-nhan">Hết sạch toàn hệ thống</div>
          <div className="tq-lon-so">{fmtN(d.can_sx)}<i>mã</i></div>
          <div className="tq-ghi">kho tổng cũng không còn · cần sản xuất</div>
        </div>
      </div>

      {/* ===== TẦNG 2: BIỂU ĐỒ + KIỂM SOÁT ===== */}
      <div className="tq-hang2">
        <div className="card tq-card">
          <div className="tq-card-tit"><IcPulse /> Sản lượng 14 ngày</div>
          <Chart data={d.ban_14n} />
        </div>

        <div className="card tq-card">
          <div className="tq-card-tit"><IcAlert /> Đề nghị hàng hôm nay</div>

          <div className="tq-dn">
            <div className="tq-dn-o">
              <div className="tq-dn-n">{fmtN(li.da_gui)}<span>/{fmtN(li.so_lich)}</span></div>
              <div className="tq-dn-t">Đã gửi theo lịch</div>
              {chuaGui > 0 && <div className="tq-dn-c">còn {fmtN(chuaGui)} nơi chưa gửi</div>}
              {li.kdn > 0 && <div className="tq-ghi">⊘ {fmtN(li.kdn)} báo không cần</div>}
            </div>
            <div className={'tq-dn-o' + ((kc.phieu_hn || 0) + (kc.app_hn || 0) > 0 ? ' khan' : '')}>
              <div className="tq-dn-n">{fmtN((kc.phieu_hn || 0) + (kc.app_hn || 0))}</div>
              <div className="tq-dn-t">Đơn khẩn cấp hôm nay</div>
              <div className="tq-ghi">7 ngày: <b>{fmtN(kc.phieu_7n)}</b> phiếu · <b>{fmtN(kc.ch_7n)}</b> nơi bán</div>
            </div>
          </div>

          <div className="tq-ks">
            <div className="tq-ks-dong">
              <span className="tq-ks-ten">Chất lượng đề nghị hôm nay</span>
              <span className="tq-ks-so">
                {cl.so_dn > 0 ? <>
                  <b className="ok">{fmtN(cl.dat)} đủ</b>
                  {cl.con_thieu > 0 && <b className="xau"> · {fmtN(cl.con_thieu)} vẫn thiếu</b>}
                  <span className="tq-ghi"> /{fmtN(cl.so_dn)} nơi</span>
                </> : <span className="tq-ghi">chưa có đơn</span>}
              </span>
            </div>
            <div className="tq-ks-dong tq-bam" onClick={() => chonTab('chatluong')}>
              <span className="tq-ks-ten">Xem chi tiết đánh giá đề nghị</span>
              <span className="tq-ks-so tq-ghi">→</span>
            </div>
            <div className="tq-ks-dong tq-bam" onClick={() => chonTab('ycdp')}>
              <span className="tq-ks-ten">Yêu cầu điều phối chờ xử lý</span>
              <span className="tq-ks-so"><b className={d.ycdp_cho > 0 ? 'xau' : 'ok'}>{fmtN(d.ycdp_cho)}</b></span>
            </div>
            <div className="tq-ks-dong tq-bam" onClick={() => chonTab('lich')}>
              <span className="tq-ks-ten">Phiếu điều chuyển đang chạy</span>
              <span className="tq-ks-so"><b>{fmtN(d.dck_chay)}</b>
                <span className="tq-ghi"> · 7 ngày {fmtN(kc.dk_7n)} định kỳ / {fmtN(kc.phieu_7n)} khẩn</span></span>
            </div>
          </div>
        </div>
      </div>

      {/* ===== TẦNG 3: HÀNG CAO CẤP ===== */}
      <div className="card tq-card" style={{ marginBottom: 14 }}>
        <div className="tq-card-tit">
          Hàng cao cấp từ {fmtTr(cc.nguong)} — bán hôm nay
          <span className="tq-tit-phu">{fmtN(cc.ma_hn)} mã · {fmtN(cc.sl_hn)} sản phẩm</span>
        </div>
        {(cc.ds || []).length ? (
          <div className="tq-luoi-sp">
            {cc.ds.map((s) => (
              <div key={s.ma_tham_chieu} className="tq-sp-o">
                <AnhSP url={s.hinh_url} ten={s.ma_tham_chieu} onMo={(u, t) => setAnh({ u, t })} />
                <div className="tq-sp-tt">
                  <div className="mono tq-sp-ma">{s.ma_tham_chieu}</div>
                  <div className="tq-ghi">{s.nganh_3 || ''} · {fmtTr(s.gia)}</div>
                </div>
                <div className="tq-sp-sl"><b>{fmtN(s.sl)}</b><span>sp</span></div>
              </div>
            ))}
          </div>
        ) : <div className="tq-ghi">Hôm nay chưa bán mã cao cấp nào</div>}
      </div>

      {/* ===== TẦNG 4: PHÂN BỔ CHƯA HỢP LÝ + CH THIẾU ===== */}
      <div className="tq-hang2">
        <div className="card tq-card">
          <div className="tq-card-tit">Mã phân bổ chưa hợp lý — nhiều nơi cần mà hết hàng</div>
          {(d.thieu_ma || []).length ? (
            <table className="tbl hh-tbl">
              <thead><tr><th></th><th>Mã</th><th className="num">Nơi hết</th>
                <th className="num">Bán 30n</th><th className="num">Kho tổng</th></tr></thead>
              <tbody>
                {d.thieu_ma.map((r) => (
                  <tr key={r.ma_tham_chieu}>
                    <td style={{ width: 40 }}>
                      <AnhSP url={r.hinh_url} ten={r.ma_tham_chieu} onMo={(u, t) => setAnh({ u, t })} />
                    </td>
                    <td className="mono">{r.ma_tham_chieu}<div className="tq-ghi">{r.nganh_3 || ''}</div></td>
                    <td className="num"><b className="hh-do">{r.ch_het}</b></td>
                    <td className="num">{fmtN(r.ban_30)}</td>
                    <td className="num">
                      <b className={r.ton_kho > 0 ? 'hh-ok' : 'hh-do'}>{fmtN(r.ton_kho)}</b>
                      {r.ton_kho > 0 ? <div className="tq-ghi">chia được</div> : <div className="tq-ghi">hết</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="tq-ghi">Phân bổ đang hợp lý</div>}
        </div>

        <div className="card tq-card">
          <div className="tq-card-tit">Nơi bán thiếu nhiều nhất so định mức</div>
          {(th.top_ch || []).length ? (
            <table className="tbl hh-tbl">
              <thead><tr><th>Nơi bán</th><th>Khu vực</th>
                <th className="num">Mũ BH</th><th className="num">Nón vải</th><th className="num">Hụt</th></tr></thead>
              <tbody>
                {th.top_ch.map((r, i) => (
                  <tr key={i}>
                    <td><b>{r.ten}</b></td>
                    <td className="tq-ghi">{r.khu_vuc}</td>
                    <td className="num"><span className={r.ton_bh < r.bh_min ? 'hh-do' : ''}>{fmtN(r.ton_bh)}</span>
                      <span className="tq-ghi">/{fmtN(r.bh_min)}</span></td>
                    <td className="num"><span className={r.ton_nv < r.nv_min ? 'hh-do' : ''}>{fmtN(r.ton_nv)}</span>
                      <span className="tq-ghi">/{fmtN(r.nv_min)}</span></td>
                    <td className="num"><b className="hh-do">{fmtN(r.hut)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="tq-ghi">Mọi nơi đều đạt định mức</div>}
        </div>
      </div>

      {/* Sức khỏe hệ thống */}
      <div className={'card tq-suckhoe' + (heThongOK ? '' : ' loi')}>
        <div className="tq-sk-trai">
          <span className={'tq-sk-den' + (heThongOK ? '' : ' do')} />
          <b>{heThongOK ? 'Dữ liệu đồng bộ bình thường' : 'Dữ liệu có vấn đề — cần kiểm tra'}</b>
        </div>
        <span className="tq-sk-muc tq-bam" onClick={() => chonTab('doisoat')}>Xem đối soát →</span>
      </div>

      {/* Xem ảnh toàn màn hình */}
      {anh && (
        <div className="tq-anh-full" onClick={() => setAnh(null)}>
          <img src={anh.u} alt="" />
          <div className="tq-anh-ten">{anh.t}</div>
        </div>
      )}

      {/* Danh sách mã cháy hàng / cần sản xuất */}
      {modal && (
        <div className="tq-modal" onClick={() => setModal(null)}>
          <div className="tq-modal-in" onClick={(e) => e.stopPropagation()}>
            <div className="tq-modal-tit">
              {modal.loai === 'CHAY' ? 'Mã cháy hàng — kho tổng còn, cần chia gấp'
                                     : 'Mã hết sạch toàn hệ thống — cần sản xuất'}
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Đóng</button>
            </div>
            {modal.ds === null ? <div className="tq-ghi">Đang tải…</div> : (
              <div className="tq-modal-body">
                <div className="tq-ghi" style={{ marginBottom: 8 }}>{fmtN(modal.ds.length)} mã</div>
                <table className="tbl hh-tbl">
                  <thead><tr><th></th><th>Mã</th><th>Nhóm</th><th className="num">Bán 30n</th>
                    <th className="num">Nơi từng bán</th><th className="num">Tồn nơi bán</th><th className="num">Kho tổng</th></tr></thead>
                  <tbody>
                    {modal.ds.map((r) => (
                      <tr key={r.ma_tham_chieu}>
                        <td style={{ width: 40 }}>
                          <AnhSP url={r.hinh_url} ten={r.ma_tham_chieu} onMo={(u, t) => setAnh({ u, t })} />
                        </td>
                        <td className="mono">{r.ma_tham_chieu}</td>
                        <td className="tq-ghi">{r.nganh_3 || ''}</td>
                        <td className="num"><b>{fmtN(r.ban_30)}</b></td>
                        <td className="num">{fmtN(r.so_ch_ban)}</td>
                        <td className="num"><b className="hh-do">{fmtN(r.ton_nb)}</b></td>
                        <td className="num"><b className={r.ton_kho > 0 ? 'hh-ok' : 'hh-do'}>{fmtN(r.ton_kho)}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
