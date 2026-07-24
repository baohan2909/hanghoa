import { useEffect, useState } from 'react';
import { sb } from '../lib/supabase.js';
import { IcRefresh, IcAlert, IcClock, IcBox, IcPulse } from '../lib/icons.jsx';

const fmtN = (n) => n == null ? '—' : Number(n).toLocaleString('vi');
const CO_TEN = { KHO_CON: 'kho còn, nơi bán hết', SAP_HET: 'sắp hết', NAM_IM: 'nằm im',
  DON_CHO: 'dồn một chỗ', CHUA_BAN: 'chưa bán' };
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
  const nhieu = data.length > 20;                       // nhiều ngày -> chữ nhỏ, nhãn thưa
  const buoc = data.length > 60 ? 7 : data.length > 30 ? 3 : data.length > 20 ? 2 : 1;
  const yTb = (v) => H - (v / max) * H * 0.84;
  const duong = data.map((d, i) => `${PAD + i * BW + BW / 2},${yTb(d.tb7 ?? (d.bh + d.nv))}`).join(' ');
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
            {tong > 0 && !nhieu && <text x={x + w / 2} y={H - hB - hN - 6} className="tq-bar-tong" textAnchor="middle">{fmtN(tong)}</text>}
            {hB > 18 && !nhieu && <text x={x + w / 2} y={H - hB / 2 + 4} className="tq-bar-so" textAnchor="middle">{fmtN(d.bh)}</text>}
            {hN > 18 && !nhieu && <text x={x + w / 2} y={H - hB - hN / 2 + 4} className="tq-bar-so nv" textAnchor="middle">{fmtN(d.nv)}</text>}
            {i % buoc === 0 && <text x={x + w / 2} y={H + 15} className="tq-truc" textAnchor="middle">{d.ngay.slice(8, 10)}/{d.ngay.slice(5, 7)}</text>}
          </g>
        );
      })}
      <polyline points={duong} className="tq-tb7" />
      <rect x={PAD} y={H + 26} width={10} height={10} rx={3} className="tq-bar" />
      <text x={PAD + 15} y={H + 35} className="tq-truc">Mũ bảo hiểm</text>
      <rect x={PAD + 100} y={H + 26} width={10} height={10} rx={3} className="tq-bar-nv" />
      <text x={PAD + 115} y={H + 35} className="tq-truc">Nón vải</text>
      <line x1={PAD + 180} x2={PAD + 200} y1={H + 31} y2={H + 31} className="tq-tb7" />
      <text x={PAD + 205} y={H + 35} className="tq-truc">Trung bình 7 ngày</text>
    </svg>
  );
}

export default function Dashboard({ chonTab = () => {} }) {
  const [d, setD] = useState(null);
  const [luc, setLuc] = useState(null);
  const [tai, setTai] = useState(false);
  const [anh, setAnh] = useState(null);
  const [modal, setModal] = useState(null);      // { loai, ds }
  const [cu, setCu] = useState(false);          // số liệu đang là bản cache cũ
  const [loi, setLoi] = useState(null);
  const [sp, setSp] = useState(null);           // khối sản phẩm: null | 'dang' | {..}
  const [chuoi, setChuoi] = useState(null);     // khối chuỗi giao hàng
  const [bd, setBd] = useState(null);           // dữ liệu biểu đồ theo p_ngay
  const [soNgay, setSoNgay] = useState(30);
  const [ho, setHo] = useState(null);           // modal lỗ hổng: {ten, ds}
  const [cc, setCc] = useState(null);           // khối hàng cao cấp
  const [ccLoc, setCcLoc] = useState(null);     // nhóm cảnh báo đang xem
  const [ccDs, setCcDs] = useState(null);       // danh sách đầy đủ của nhóm
  const [ccMa, setCcMa] = useState(null);       // modal phân bổ 1 mã

  // Mỗi khối nạp ĐỘC LẬP: khối nào lỗi chỉ khối đó báo lỗi, các khối khác vẫn hiện.
  const nap = async (im) => {
    if (!im) setTai(true);
    const { data, error } = await sb.rpc('fn_tq_doc', { p_khoi: 'tong_quan', p_han_giay: 300 });
    if (error) setLoi(error.message);
    else if (data?.du_lieu) {
      setD(data.du_lieu); setLuc(data.tinh_luc ? new Date(data.tinh_luc) : new Date());
      setCu(!!data.cu); setLoi(data.loi || null);
    } else setLoi(data?.loi || 'Không lấy được số liệu');
    setTai(false);
  };
  const napSP = async () => {
    setSp('dang');
    const { data, error } = await sb.rpc('fn_tq_doc', { p_khoi: 'san_pham', p_han_giay: 300 });
    setSp(error ? { loi: error.message } : (data?.du_lieu ? { ...data.du_lieu, _cu: data.cu } : { loi: data?.loi || 'Chưa có số liệu' }));
  };
  const napCC = async () => {
    setCc('dang');
    const { data, error } = await sb.rpc('fn_tq_doc', { p_khoi: 'cao_cap', p_han_giay: 300 });
    setCc(error ? { loi: error.message } : (data?.du_lieu || { loi: data?.loi || 'Chưa có số liệu' }));
  };
  // Bấm thẻ cảnh báo -> lấy ĐỦ danh sách nhóm đó (không giới hạn dòng)
  const xemNhom = async (ma, ten) => {
    if (ccLoc?.ma === ma) { setCcLoc(null); setCcDs(null); return; }
    setCcLoc({ ma, ten }); setCcDs(null);
    const { data } = await sb.rpc('fn_tq_cao_cap_nhom', { p_co: ma });
    setCcDs(data || []);
  };
  const xemPhanBo = async (r) => {
    setCcMa({ sp: r, ds: null });
    const { data } = await sb.rpc('fn_tq_cao_cap_ch', { p_barcode: r.barcode });
    setCcMa({ sp: r, ds: data || [] });
  };

  const napChuoi = async () => {
    setChuoi('dang');
    const { data, error } = await sb.rpc('fn_tq_doc', { p_khoi: 'chuoi', p_han_giay: 300 });
    setChuoi(error ? { loi: error.message } : (data?.du_lieu ? data.du_lieu : { loi: data?.loi || 'Chưa có số liệu' }));
  };
  // Lấy MỘT lần 90 ngày rồi cắt tại chỗ -> bấm 14/30/90 đổi tức thì, không gọi lại server.
  const napBieuDo = async () => {
    setBd(null);
    const { data } = await sb.rpc('fn_tq_doc', { p_khoi: 'bieu_do', p_han_giay: 300 });
    setBd(data?.du_lieu || []);
  };
  useEffect(() => {
    nap(); napSP(); napCC(); napChuoi(); napBieuDo();
    const t = setInterval(() => nap(true), 120000);
    return () => clearInterval(t);
  }, []);   // eslint-disable-line

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
        li = d.lich || {}, kc = d.kc || {}, cl = d.cldn || {};
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
          <span className="hd-gio"><IcClock /> số liệu lúc {luc ? luc.toLocaleTimeString('vi', { hour: '2-digit', minute: '2-digit' }) : ''}
            {cu ? ' · bản lưu' : ''}</span>
          <button className="btn-hd" onClick={() => { nap(); napSP(); napCC(); napChuoi(); napBieuDo(); }} disabled={tai}>
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
          <div className="tq-card-tit"><IcPulse /> Sản lượng {soNgay} ngày
            <span className="tq-tit-phu">
              {[14, 30, 90].map((n) => (
                <button key={n} className={'tq-ng' + (soNgay === n ? ' on' : '')}
                  onClick={() => setSoNgay(n)}>{n} ngày</button>
              ))}
            </span>
          </div>
          {bd === null ? <div className="tq-ghi">Đang vẽ…</div>
            : <Chart data={bd.length ? bd.slice(-soNgay) : d.ban_14n} />}
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
            <div className="tq-ks-dong tq-cl-dong">
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

      {/* ===== TẦNG 3: CHUỖI GIAO HÀNG (đấu nối vận đơn <-> phiếu) ===== */}
      <div className="card tq-card" style={{ marginBottom: 14 }}>
        <div className="tq-card-tit">Chuỗi giao hàng 30 ngày
          <span className="tq-tit-phu">kho xuất → vận chuyển lấy → giao → cửa hàng xác nhận</span>
        </div>
        {chuoi === null || chuoi === 'dang' ? <div className="tq-ghi">Đang tổng hợp…</div>
          : chuoi.loi ? <div className="tq-ghi">Chưa có số liệu chuỗi giao hàng ({chuoi.loi}). Cần chạy SQL 121.</div>
          : (
            <>
              <div className="tq-moc">
                {[['phieu_xuat', 'phiếu đã xuất kho'], ['co_van_don', 'đã có vận đơn'],
                  ['da_giao', 'đơn vị VC đã giao'], ['da_nhan', 'cửa hàng đã xác nhận']].map(([k, t], i) => (
                  <div key={k} className="tq-moc-o">
                    <span className="tq-moc-n">{i + 1}</span>
                    <b>{fmtN(chuoi.moc?.[k])}</b><span>{t}</span>
                  </div>
                ))}
              </div>
              <div className="the-hang the-hang-wrap" style={{ marginTop: 12 }}>
                <button className="the-g" onClick={() => setHo({ ten: 'Kho đã xuất nhưng chưa ai tới lấy', ds: chuoi.ho_kho?.ds || [] })}>
                  <span className="the-g-n" style={{ color: 'var(--gold)' }}>{fmtN(chuoi.ho_kho?.so)}</span>
                  <span className="the-g-t">kho chưa bàn giao<small>xuất ≥ 2 ngày, chưa có vận đơn</small></span>
                </button>
                <button className="the-g" onClick={() => setHo({ ten: 'Hàng đã giao — cửa hàng chưa xác nhận trên Odoo', ds: chuoi.ho_treo?.ds || [] })}>
                  <span className="the-g-n" style={{ color: 'var(--magenta)' }}>{fmtN(chuoi.ho_treo?.so)}</span>
                  <span className="the-g-t">phiếu treo<small>có bằng chứng giờ giao</small></span>
                </button>
                <button className="the-g" onClick={() => setHo({ ten: 'Đang đi quá lâu chưa giao', ds: chuoi.ho_cham?.ds || [] })}>
                  <span className="the-g-n" style={{ color: '#c47a1e' }}>{fmtN(chuoi.ho_cham?.so)}</span>
                  <span className="the-g-t">vận chuyển chậm<small>đã lấy ≥ 5 ngày</small></span>
                </button>
                <button className="the-g" onClick={() => setHo({ ten: 'Vận đơn chưa rõ chở phiếu nào', ds: chuoi.vd_mo?.ds || [] })}>
                  <span className="the-g-n" style={{ color: 'var(--ink-2)' }}>{fmtN(chuoi.vd_mo?.so)}</span>
                  <span className="the-g-t">chưa rõ nội dung<small>vào Vận đơn gán tay</small></span>
                </button>
              </div>
            </>
          )}
      </div>

      {/* ===== TẦNG 4: SẢN PHẨM — mã mới trong tháng + hàng theo dõi đặc biệt ===== */}
      {sp && sp !== 'dang' && !sp.loi && (
        <>
          <div className="card tq-card" style={{ marginBottom: 14 }}>
            <div className="tq-card-tit">Mã mới trong tháng
              <span className="tq-tit-phu">
                {fmtN(sp.ma_moi?.so)} mã · đã bán {fmtN(sp.ma_moi?.da_ban)} sp ·
                tốc độ trung bình <b>{sp.ma_moi?.toc_do_tb}</b> sp/ngày
                {sp.ma_moi?.toc_do_thang_truoc > 0 && (
                  <Delta nay={sp.ma_moi?.toc_do_tb} truoc={sp.ma_moi?.toc_do_thang_truoc} nhan="so mã mới tháng trước" />
                )}
              </span>
            </div>
            {(sp.ma_moi?.ds || []).length ? (
              <div className="tq-luoi-sp">
                {sp.ma_moi.ds.map((r) => (
                  <div key={r.barcode} className="tq-sp-o">
                    <AnhSP url={r.hinh_url} ten={r.sku} onMo={(u, t) => setAnh({ u, t })} />
                    <div className="tq-sp-tt">
                      <div className="mono tq-sp-ma">{r.sku || r.barcode}</div>
                      <div className="tq-ghi">{r.nganh_3 || ''} · {r.tuoi_ngay} ngày tuổi · có mặt {r.so_noi_co} nơi</div>
                    </div>
                    <div className="tq-sp-sl">
                      <b>{r.toc_do}</b><span>sp/ngày</span>
                      <i className="tq-ghi">tồn {fmtN(r.ton)}{r.ton_kho > 0 ? ` · kho ${fmtN(r.ton_kho)}` : ''}</i>
                    </div>
                  </div>
                ))}
              </div>
            ) : <div className="tq-ghi">Tháng này chưa có mã mới nào.</div>}
          </div>

        </>
      )}
      {sp === 'dang' && <div className="card tq-card" style={{ marginBottom: 14 }}>
        <div className="tq-ghi">Đang tổng hợp sản phẩm…</div></div>}
      {sp?.loi && <div className="card tq-card" style={{ marginBottom: 14 }}>
        <div className="tq-ghi">Không tải được khối sản phẩm: {sp.loi}</div></div>}

      {/* ===== HÀNG CAO CẤP — THEO DÕI SÂU ===== */}
      {cc && cc !== 'dang' && !cc.loi && (
        <div className="card tq-card" style={{ marginBottom: 14 }}>
          <div className="tq-card-tit">Theo dõi hàng cao cấp — từ {fmtTr(cc.nguong)} trở lên
            <span className="tq-tit-phu">
              {fmtN(cc.tong?.so_ma)} mã · bán hôm nay <b>{fmtN(cc.tong?.ban_hn)}</b> · tồn nơi bán <b>{fmtN(cc.tong?.ton_nb)}</b> · kho <b>{fmtN(cc.tong?.ton_kho)}</b>
              {cc.tong?.dang_di > 0 && <> · đang trên đường <b>{fmtN(cc.tong.dang_di)}</b></>}
              {cc.tong?.co_van_de > 0 && <b className="tq-do"> · {fmtN(cc.tong.co_van_de)} mã cần xử lý</b>}
            </span>
          </div>

          <div className="cc-tang">
            {(cc.tang || []).map((t) => (
              <div key={t.bac} className="cc-tang-o">
                <span className="cc-tang-n">{t.bac === 1 ? `${fmtTr(cc.nguong)} – ${fmtTr(cc.nguong * 2)}`
                  : t.bac === 2 ? `${fmtTr(cc.nguong * 2)} – ${fmtTr(cc.nguong * 3)}`
                  : `trên ${fmtTr(cc.nguong * 3)}`}</span>
                <b>{fmtN(t.so_ma)}</b><span>mã · tồn {fmtN(t.ton)} · bán 30n {fmtN(t.ban_30)}</span>
              </div>
            ))}
          </div>

          <div className="the-hang the-hang-wrap" style={{ marginTop: 12 }}>
            {[['KHO_CON', cc.canh_bao?.khocon, 'kho còn — nơi bán hết', 'chia được ngay', 'var(--magenta)'],
              ['SAP_HET', cc.canh_bao?.saphet, 'sắp hết hàng', 'còn dưới 7 ngày bán', '#c47a1e'],
              ['NAM_IM', cc.canh_bao?.im, 'nằm im ≥ 30 ngày', 'đang chôn vốn', 'var(--gold)'],
              ['DON_CHO', cc.canh_bao?.dondep, 'dồn một chỗ', 'một nơi giữ quá nửa', 'var(--teal-deep)'],
              ['CHUA_BAN', cc.canh_bao?.chuaban, 'chưa bán bao giờ', 'nhập về rồi để đó', 'var(--ink-2)']]
              .map(([ma, so, ten, phu, mau]) => (
              <button key={ma} className={'the-g' + (ccLoc?.ma === ma ? ' on' : '')}
                onClick={() => xemNhom(ma, ten)}>
                <span className="the-g-n" style={{ color: mau }}>{fmtN(so)}</span>
                <span className="the-g-t">{ten}<small>{phu}</small></span>
              </button>
            ))}
          </div>

          {ccLoc ? (
            <div style={{ marginTop: 12 }}>
              <div className="tq-ghi" style={{ marginBottom: 6 }}>
                {ccLoc.ten} · {ccDs === null ? 'đang tải…' : `${ccDs.length} mã`} — bấm một dòng để xem hàng đang nằm ở đâu
              </div>
              {ccDs !== null && (
                <div className="tbl-wrap" style={{ maxHeight: '46vh', overflow: 'auto' }}>
                  <table className="tbl tbl-fit">
                    <thead><tr><th></th><th>Mã</th><th>Nhóm</th><th className="num">Giá niêm yết</th>
                      <th className="num">Tồn nơi bán</th><th className="num">Kho</th><th className="num">Bán 30n</th>
                      <th className="num">Còn bán</th><th>Tình trạng</th></tr></thead>
                    <tbody>
                      {ccDs.map((r) => (
                        <tr key={r.barcode} className="cl-row" onClick={() => xemPhanBo(r)}>
                          <td style={{ width: 40 }}><AnhSP url={r.hinh_url} ten={r.sku} onMo={(u, t) => setAnh({ u, t })} /></td>
                          <td className="mono" style={{ fontSize: 11 }}>{r.sku || r.barcode}</td>
                          <td style={{ fontSize: 12 }}>{r.nganh_3 || ''}</td>
                          <td className="num">{fmtTr(r.gia)}</td>
                          <td className="num"><b>{fmtN(r.ton)}</b>{r.so_noi_co > 0 && <div className="tq-ghi">{r.so_noi_co} nơi</div>}</td>
                          <td className="num">{fmtN(r.ton_kho)}</td>
                          <td className="num">{fmtN(r.ban_30)}</td>
                          <td className="num">{r.ngay_con_lai == null ? <span className="tq-ghi">—</span>
                            : <b className={r.ngay_con_lai <= 7 ? 'hh-do' : ''}>{r.ngay_con_lai} ngày</b>}</td>
                          <td>{(r.co || []).map((c) => <span key={c} className={'cc-co cc-' + c.toLowerCase()}>{CO_TEN[c] || c}</span>)}</td>
                        </tr>
                      ))}
                      {ccDs.length === 0 && <tr><td colSpan={9} className="tq-ghi" style={{ padding: 14 }}>Không có mã nào — tốt.</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="tq-luoi-sp" style={{ marginTop: 12 }}>
              {(cc.ds_top || []).map((r) => (
                <div key={r.barcode} className={'tq-sp-o tq-bam' + ((r.co || []).length ? ' tq-sp-do' : '')}
                  onClick={() => xemPhanBo(r)}>
                  <AnhSP url={r.hinh_url} ten={r.sku} onMo={(u, t) => setAnh({ u, t })} />
                  <div className="tq-sp-tt">
                    <div className="mono tq-sp-ma">{r.sku || r.barcode}</div>
                    <div className="tq-ghi">{fmtTr(r.gia)} · {r.so_noi_co} nơi có hàng
                      {r.om_ten ? ` · ${r.om_ten} giữ ${fmtN(r.om_ton)}` : ''}</div>
                  </div>
                  <div className="tq-sp-sl">
                    <b>{fmtN(r.ton + r.ton_kho)}</b><span>tồn</span>
                    <i className="tq-ghi">{r.im_ngay == null ? 'chưa bán' : `im ${r.im_ngay} ngày`}</i>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {cc === 'dang' && <div className="card tq-card" style={{ marginBottom: 14 }}>
        <div className="tq-ghi">Đang tổng hợp hàng cao cấp…</div></div>}

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
      {ccMa && (
        <div className="modal-bg" onClick={() => setCcMa(null)}>
          <div className="modal" style={{ maxWidth: 760, width: '94vw' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <b>{ccMa.sp.sku || ccMa.sp.barcode} · {fmtTr(ccMa.sp.gia)}</b>
              <button className="modal-x" onClick={() => setCcMa(null)}>✕</button>
            </div>
            <div className="tq-ghi" style={{ padding: '0 2px 8px' }}>
              {ccMa.sp.nganh_3 || ''} · tồn nơi bán {fmtN(ccMa.sp.ton)} · kho {fmtN(ccMa.sp.ton_kho)}
              {ccMa.sp.dang_di > 0 && <> · đang trên đường {fmtN(ccMa.sp.dang_di)}</>}
            </div>
            {ccMa.ds === null ? <div className="tq-ghi" style={{ padding: 14 }}>Đang tải…</div> : (
              <div className="tbl-wrap" style={{ maxHeight: '56vh', overflow: 'auto' }}>
                <table className="tbl tbl-fit">
                  <thead><tr><th>Nơi</th><th>Khu vực</th><th className="num">Tồn</th>
                    <th className="num">Bán 30n</th><th className="num">Lần bán cuối</th></tr></thead>
                  <tbody>
                    {ccMa.ds.map((r) => (
                      <tr key={r.ma_ch} className={r.la_kho ? 'cc-kho' : undefined}>
                        <td><b>{r.ten_ch}</b>{r.la_kho && <span className="chip dim" style={{ marginLeft: 6 }}>kho</span>}</td>
                        <td>{r.khu_vuc || ''}</td>
                        <td className="num"><b>{fmtN(r.ton)}</b></td>
                        <td className="num">{fmtN(r.ban_30)}</td>
                        <td className="num">{r.im_ngay == null ? <span className="tq-ghi">chưa bán</span> : `${r.im_ngay} ngày trước`}</td>
                      </tr>
                    ))}
                    {ccMa.ds.length === 0 && <tr><td colSpan={5} className="tq-ghi" style={{ padding: 14 }}>Không còn tồn ở đâu.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {ho && (
        <div className="modal-bg" onClick={() => setHo(null)}>
          <div className="modal" style={{ maxWidth: 860, width: '94vw' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><b>{ho.ten}</b>
              <button className="modal-x" onClick={() => setHo(null)}>✕</button></div>
            {ho.ds.length === 0 ? <div className="tq-ghi" style={{ padding: 14 }}>Không có trường hợp nào — tốt.</div> : (
              <div className="tbl-wrap" style={{ maxHeight: '60vh', overflow: 'auto' }}>
                <table className="tbl tbl-fit">
                  <thead><tr><th>Phiếu / vận đơn</th><th>Cửa hàng</th><th>Khu vực</th>
                    <th className="num">Số ngày</th></tr></thead>
                  <tbody>
                    {ho.ds.map((r, i2) => (
                      <tr key={i2}>
                        <td className="mono" style={{ fontSize: 11 }}>{r.ma_phieu || r.label_id}
                          {r.ma_phieu && r.label_id && <div className="tq-ghi">{r.label_id}</div>}</td>
                        <td>{r.ten_ch || r.ma_ch || '—'}</td>
                        <td>{r.khu_vuc || ''}</td>
                        <td className="num"><b className={r.so_ngay >= 5 ? 'hh-do' : ''}>{r.so_ngay ?? '—'}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

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
