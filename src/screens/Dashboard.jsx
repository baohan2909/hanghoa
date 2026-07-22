import { useEffect, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { IcRefresh, IcAlert, IcClock, IcBox, IcTruck, IcPulse } from '../lib/icons.jsx';

// ===== helpers =====
const fmtN = (n) => n == null ? '—' : Number(n).toLocaleString('vi');
const fmtTien = (n) => {
  const v = Number(n) || 0;
  if (v >= 1e9) return (v / 1e9).toFixed(v >= 1e10 ? 1 : 2).replace('.', ',') + ' tỷ';
  if (v >= 1e6) return Math.round(v / 1e6).toLocaleString('vi') + ' tr';
  return v.toLocaleString('vi') + 'đ';
};
const thuVN = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const nhanNgay = (iso) => { const d = new Date(iso + 'T00:00:00'); return thuVN[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1); };

// Delta ▲▼ so kỳ trước
function Delta({ nay, truoc }) {
  if (!truoc) return null;
  const pct = Math.round(((nay - truoc) / truoc) * 100);
  if (!pct) return <span className="tq-delta bang">= hôm qua</span>;
  return <span className={'tq-delta ' + (pct > 0 ? 'tang' : 'giam')}>{pct > 0 ? '▲' : '▼'} {Math.abs(pct)}%</span>;
}

// ===== Biểu đồ cột SVG thuần (không thư viện) =====
function ChartBan({ data }) {
  if (!data?.length) return null;
  const W = 700, H = 210, PAD = 26, BW = (W - PAD * 2) / data.length;
  const maxSL = Math.max(...data.map((d) => d.sl), 1);
  const homNay = data[data.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H + 34}`} className="tq-chart" preserveAspectRatio="xMidYMid meet">
      {/* lưới ngang 4 vạch */}
      {[0.25, 0.5, 0.75, 1].map((p) => (
        <g key={p}>
          <line x1={PAD} x2={W - PAD} y1={H - H * p * 0.88} y2={H - H * p * 0.88} className="tq-grid" />
          <text x={PAD - 5} y={H - H * p * 0.88 + 3} className="tq-truc" textAnchor="end">{fmtN(Math.round(maxSL * p))}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const h = Math.max((d.sl / maxSL) * H * 0.88, d.sl > 0 ? 3 : 0);
        const x = PAD + i * BW + BW * 0.16, w = BW * 0.68;
        const cuoi = i === data.length - 1;
        return (
          <g key={d.ngay}>
            <title>{nhanNgay(d.ngay)}: {fmtN(d.sl)} sp · {fmtTien(d.dt)}</title>
            <rect x={x} y={H - h} width={w} height={h} rx={Math.min(5, w / 2)}
              className={'tq-bar' + (cuoi ? ' nay' : '')} />
            {(cuoi || d.sl === maxSL) && d.sl > 0 &&
              <text x={x + w / 2} y={H - h - 6} className="tq-bar-so" textAnchor="middle">{fmtN(d.sl)}</text>}
            <text x={x + w / 2} y={H + 15} className="tq-truc" textAnchor="middle">{d.ngay.slice(8, 10)}/{d.ngay.slice(5, 7)}</text>
          </g>
        );
      })}
      <text x={W - PAD} y={H + 30} className="tq-truc" textAnchor="end">
        Hôm nay: {fmtN(homNay?.sl)} sp · {fmtTien(homNay?.dt)}
      </text>
    </svg>
  );
}

// Bar ngang mini cho Top
function BarNgang({ pct }) {
  return <div className="tq-bn"><div className="tq-bn-fill" style={{ width: Math.max(pct, 3) + '%' }} /></div>;
}

export default function Dashboard({ chonTab = () => {} }) {
  const [d, setD] = useState(null);
  const [luc, setLuc] = useState(null);
  const [dangTai, setDangTai] = useState(false);

  const tai = async (imLang) => {
    if (!imLang) setDangTai(true);
    const { data, error } = await sb.rpc('fn_tong_quan');
    if (!error && data) { setD(data); setLuc(new Date()); }
    setDangTai(false);
  };
  useEffect(() => { tai(); const t = setInterval(() => tai(true), 120000); return () => clearInterval(t); }, []);

  if (!d) return (
    <>
      <div className="cmdbar"><div className="cmd-title"><h2>Tổng quan hệ thống</h2><p>Đang tải dữ liệu…</p></div></div>
      <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--ink-2)' }}>
        {dangTai ? 'Đang tổng hợp toàn hệ thống…' : 'Không tải được dữ liệu. Bấm làm mới.'}
      </div>
    </>
  );

  const k = d.kpi || {};
  const lich = d.lich_hn || {};
  const chuaGui = Math.max((lich.so_lich || 0) - (lich.da_gui || 0) - (lich.kdn || 0), 0);
  const syncLoi = (d.sync || []).filter((s) => s.tt === 'LOI');
  const dsLech = (d.doi_soat || []).filter((x) => !x.khop);
  const heThongOK = !syncLoi.length && !dsLech.length;
  const maxTopCH = Math.max(...(d.top_ch || []).map((c) => c.sl), 1);
  const maxKV = Math.max(...(d.khu_vuc || []).map((c) => c.sl), 1);

  return (
    <>
      <div className="cmdbar">
        <div className="cmd-title">
          <h2>Tổng quan hệ thống</h2>
          <p>{fmtN(k.tong_noi_ban)} nơi bán (CH + điểm bán) · dữ liệu đồng bộ từ Odoo mỗi giờ</p>
        </div>
        <div className="cmd-row">
          <span className="sla-chip"><IcClock /> {luc ? luc.toLocaleTimeString('vi', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
          <button className="btn btn-ghost" onClick={() => tai()}><IcRefresh /> Làm mới</button>
        </div>
      </div>

      {/* ===== TẦNG 1: KPI nhịp đập ===== */}
      <div className="the-hang the-hang-wrap tq-kpi">
        <div className="the-g">
          <div className="the-g-nhan">Bán hôm nay</div>
          <div className="the-g-so">{fmtN(k.ban_hn)} <span className="tq-dv">sp</span></div>
          <Delta nay={k.ban_hn} truoc={k.ban_hq} />
        </div>
        <div className="the-g">
          <div className="the-g-nhan">Doanh thu hôm nay</div>
          <div className="the-g-so">{fmtTien(k.dt_hn)}</div>
          <Delta nay={k.dt_hn} truoc={k.dt_hq} />
        </div>
        <div className="the-g">
          <div className="the-g-nhan">Bán 7 ngày</div>
          <div className="the-g-so">{fmtN(k.ban_7n)} <span className="tq-dv">sp</span></div>
          <Delta nay={k.ban_7n} truoc={k.ban_7n_truoc} />
        </div>
        <div className="the-g">
          <div className="the-g-nhan">Nơi bán có giao dịch</div>
          <div className="the-g-so">{fmtN(k.ch_ban_hn)}<span className="tq-dv">/{fmtN(k.tong_noi_ban)}</span></div>
          <div className="tq-ghi">hôm nay</div>
        </div>
        <div className="the-g">
          <div className="the-g-nhan">Tồn nơi bán</div>
          <div className="the-g-so">{fmtN(k.ton_noi_ban)}</div>
          <div className="tq-ghi">kho tổng: {fmtN(k.ton_kho_tong)}</div>
        </div>
        <div className="the-g tq-bam" onClick={() => chonTab('lich')} title="Xem chi tiết tuân thủ">
          <div className="the-g-nhan">Tuân thủ lịch 7 ngày</div>
          <div className="the-g-so">{k.tuan_thu == null ? '—' : k.tuan_thu + '%'}</div>
          <div className="tq-ghi">trung bình toàn hệ thống</div>
        </div>
      </div>

      {/* ===== TẦNG 2: xu hướng + kiểm soát hôm nay ===== */}
      <div className="tq-hang2">
        <div className="card tq-card">
          <div className="tq-card-tit"><IcPulse /> Sản lượng bán 14 ngày</div>
          <ChartBan data={d.ban_14n} />
        </div>

        <div className="card tq-card">
          <div className="tq-card-tit"><IcAlert /> Kiểm soát hôm nay</div>
          <div className="tq-ks">
            <div className="tq-ks-dong tq-bam" onClick={() => chonTab('lich')}>
              <span className="tq-ks-ten">Lịch đề nghị hôm nay</span>
              <span className="tq-ks-so">
                {lich.so_lich ? <>
                  <b className="ok">{fmtN(lich.da_gui)} gửi</b>
                  {lich.kdn > 0 && <b className="kdn"> · {fmtN(lich.kdn)} ⊘</b>}
                  {chuaGui > 0 ? <b className="xau"> · {fmtN(chuaGui)} chưa</b> : null}
                  <span className="tq-ghi"> /{fmtN(lich.so_lich)} CH</span>
                </> : <span className="tq-ghi">không có lịch</span>}
              </span>
            </div>
            <div className="tq-ks-dong tq-bam" onClick={() => chonTab('ycdp')}>
              <span className="tq-ks-ten">Yêu cầu điều phối chờ xử lý</span>
              <span className="tq-ks-so"><b className={d.ycdp_cho > 0 ? 'xau' : 'ok'}>{fmtN(d.ycdp_cho)}</b></span>
            </div>
            <div className="tq-ks-dong tq-bam" onClick={() => chonTab('lich')}>
              <span className="tq-ks-ten">Phiếu điều chuyển đang chạy</span>
              <span className="tq-ks-so">
                <b>{fmtN(d.dck?.dang_chay)}</b>
                {d.dck?.kc > 0 && <b className="xau"> · {fmtN(d.dck.kc)} khẩn cấp</b>}
              </span>
            </div>
            <div className="tq-ks-dong tq-bam" onClick={() => chonTab('giamsat')}>
              <span className="tq-ks-ten">Mã cần sản xuất (hết toàn hệ thống)</span>
              <span className="tq-ks-so"><b className={d.can_sx > 0 ? 'xau' : 'ok'}>{fmtN(d.can_sx)}</b></span>
            </div>
            <div className="tq-ks-dong tq-bam" onClick={() => chonTab('dacbiet')}>
              <span className="tq-ks-ten">Hàng đặc biệt đang hiệu lực</span>
              <span className="tq-ks-so">
                <b className="xau">{fmtN(d.thu_hoi)}</b><span className="tq-ghi"> thu hồi</span>
                <b className="ok" style={{ marginLeft: 8 }}>{fmtN(d.hang_moi)}</b><span className="tq-ghi"> mã mới</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ===== TẦNG 3: top động lực ===== */}
      <div className="tq-hang3">
        <div className="card tq-card">
          <div className="tq-card-tit">Top nơi bán · 7 ngày</div>
          {(d.top_ch || []).map((c, i) => (
            <div key={c.ma_ch} className="tq-top-dong">
              <span className="tq-top-stt">{i + 1}</span>
              <div className="tq-top-tt">
                <div className="tq-top-ten">{c.ten}</div>
                <BarNgang pct={(c.sl / maxTopCH) * 100} />
              </div>
              <div className="tq-top-so">
                <b>{fmtN(c.sl)}</b>
                <span className="tq-ghi">{fmtTien(c.dt)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="card tq-card">
          <div className="tq-card-tit">Top sản phẩm · 7 ngày</div>
          {(d.top_sp || []).map((s, i) => (
            <div key={s.ma_tham_chieu} className="tq-top-dong">
              <span className="tq-top-stt">{i + 1}</span>
              {s.hinh_url
                ? <img className="tq-sp-anh" src={s.hinh_url} alt="" loading="lazy"
                    onError={(e) => { e.target.style.visibility = 'hidden'; }} />
                : <span className="tq-sp-anh trong"><IcBox /></span>}
              <div className="tq-top-tt">
                <div className="tq-top-ten mono">{s.ma_tham_chieu}</div>
                <div className="tq-ghi">{s.nganh_3 || ''}</div>
              </div>
              <div className="tq-top-so"><b>{fmtN(s.sl)}</b><span className="tq-ghi">sp</span></div>
            </div>
          ))}
        </div>

        <div className="card tq-card">
          <div className="tq-card-tit">Khu vực · 7 ngày</div>
          {(d.khu_vuc || []).map((v) => (
            <div key={v.khu_vuc} className="tq-top-dong">
              <div className="tq-top-tt">
                <div className="tq-top-ten">{v.khu_vuc} <span className="tq-ghi">· {v.so_ch} nơi bán</span></div>
                <BarNgang pct={(v.sl / maxKV) * 100} />
              </div>
              <div className="tq-top-so"><b>{fmtN(v.sl)}</b><span className="tq-ghi">sp</span></div>
            </div>
          ))}
        </div>
      </div>

      {/* ===== TẦNG 4: sức khỏe hệ thống ===== */}
      <div className={'card tq-suckhoe' + (heThongOK ? '' : ' loi')}>
        <div className="tq-sk-trai">
          <span className={'tq-sk-den' + (heThongOK ? '' : ' do')} />
          <b>{heThongOK ? 'Hệ thống vận hành bình thường' : 'Hệ thống có vấn đề cần kiểm tra'}</b>
          {!heThongOK && <span className="tq-ghi">
            {syncLoi.length > 0 && ` · ${syncLoi.length} bước đồng bộ lỗi`}
            {dsLech.length > 0 && ` · ${dsLech.length} bảng lệch đối soát`}
          </span>}
        </div>
        <div className="tq-sk-phai">
          <span className="tq-sk-muc tq-bam" onClick={() => chonTab('doisoat')}>
            Đồng bộ &amp; đối soát {heThongOK ? '✓' : '⚠'}
          </span>
          <span className="tq-sk-muc tq-bam" onClick={() => chonTab('online')}>
            <IcTruck /> {fmtN(d.online)} đang online
          </span>
        </div>
      </div>
    </>
  );
}
