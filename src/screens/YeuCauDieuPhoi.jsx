import { Fragment, useEffect, useMemo, useState } from 'react';
import { sb, fmtDT } from '../lib/supabase.js';
import { useApp } from '../App.jsx';
import { DateBox, Sel } from '../lib/ui.jsx';
import { IcRefresh, IcSpark, IcDown } from '../lib/icons.jsx';

const fmtN = (n) => (n == null ? '—' : Number(n).toLocaleString('vi'));

// ===== YÊU CẦU ĐIỀU PHỐI — bàn ghép nơi cần với nơi cho, xuất một file tổng =====
export default function YeuCauDieuPhoi() {
  const { user, baoToast } = useApp();
  const [rows, setRows] = useState(null);
  const [tu, setTu] = useState('');
  const [den, setDen] = useState('');
  const [q, setQ] = useState('');
  const [mo, setMo] = useState(null);          // barcode đang mở
  const [ke, setKe] = useState({});            // barcode -> [{den,den_ten,den_kv,can,tu,tu_ten,sl,ly_do}]
  const [nguon, setNguon] = useState({});      // barcode -> danh sách nơi có thể cho
  const [dangGoi, setDangGoi] = useState(null);
  const [chon, setChon] = useState({});        // barcode -> true (đưa vào file tổng)

  const tai = async () => {
    setRows(null); setMo(null);
    const { data, error } = await sb.rpc('fn_ycdp_tong_hop', { p_tu: tu || null, p_den: den || null });
    if (error) { baoToast('Lỗi: ' + error.message); setRows([]); return; }
    setRows(data || []);
  };
  useEffect(() => { tai(); }, [tu, den]);   // eslint-disable-line

  // Mở một mã: lấy gợi ý ghép + danh sách nguồn còn lại
  const xo = async (bc) => {
    if (mo === bc) { setMo(null); return; }
    setMo(bc);
    if (ke[bc]) return;
    setDangGoi(bc);
    const [g, n] = await Promise.all([
      sb.rpc('fn_dp_goi_y', { p_barcode: bc }),
      sb.rpc('fn_dp_nguon', { p_barcode: bc }),
    ]);
    setKe((m) => ({ ...m, [bc]: (g.data || []).map((r) => ({
      den: r.den_ma_ch, den_ten: r.den_ten, den_kv: r.den_kv, can: r.can,
      tu: r.tu_ma_ch, tu_ten: r.tu_ten, sl: r.sl, ly_do: r.ly_do,
    })) }));
    setNguon((m) => ({ ...m, [bc]: n.data || [] }));
    setDangGoi(null);
  };

  const apLai = async (bc) => {
    setDangGoi(bc);
    const { data } = await sb.rpc('fn_dp_goi_y', { p_barcode: bc });
    setKe((m) => ({ ...m, [bc]: (data || []).map((r) => ({
      den: r.den_ma_ch, den_ten: r.den_ten, den_kv: r.den_kv, can: r.can,
      tu: r.tu_ma_ch, tu_ten: r.tu_ten, sl: r.sl, ly_do: r.ly_do,
    })) }));
    setDangGoi(null);
    baoToast('Đã áp lại gợi ý');
  };

  const suaSL = (bc, i, v) => setKe((m) => {
    const ds = [...(m[bc] || [])];
    ds[i] = { ...ds[i], sl: Math.max(0, parseInt(v) || 0) };
    return { ...m, [bc]: ds };
  });
  const doiNguon = (bc, i, maCh) => setKe((m) => {
    const ds = [...(m[bc] || [])];
    const n = (nguon[bc] || []).find((x) => x.ma_ch === maCh);
    ds[i] = { ...ds[i], tu: maCh, tu_ten: n?.ten || maCh, ly_do: n?.la_kho ? 'lấy từ kho' : 'chọn tay' };
    return { ...m, [bc]: ds };
  });
  const xoaDong = (bc, i) => setKe((m) => ({ ...m, [bc]: (m[bc] || []).filter((_, j) => j !== i) }));

  // Số lượng còn có thể lấy của từng nguồn, sau khi trừ những gì đã xếp
  const conLai = (bc) => {
    const da = {};
    (ke[bc] || []).forEach((r) => { if (r.tu) da[r.tu] = (da[r.tu] || 0) + Number(r.sl || 0); });
    return (nguon[bc] || []).map((n) => ({ ...n, con: n.co_the_cho - (da[n.ma_ch] || 0) }));
  };
  const phu = (bc, r) => {
    const co = (ke[bc] || []).filter((x) => x.tu).reduce((s, x) => s + Number(x.sl || 0), 0);
    const can = Number(r.tong_sl) || 0;
    return { co, can, pct: can > 0 ? Math.min(100, Math.round((co * 100) / can)) : 0 };
  };
  const vuot = (bc) => conLai(bc).filter((n) => n.con < 0);

  const hien = useMemo(() => {
    let v = [...(rows || [])];
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      v = v.filter((r) => (r.ma_tham_chieu || '').toLowerCase().includes(t)
        || (r.ten_sp || '').toLowerCase().includes(t) || (r.barcode || '').includes(t)
        || (r.ds_ch || '').toLowerCase().includes(t));
    }
    return v;
  }, [rows, q]);

  const tong = useMemo(() => {
    const v = rows || [];
    return { ma: v.length, sl: v.reduce((s, r) => s + Number(r.tong_sl), 0),
      ch: new Set(v.flatMap((r) => (r.ds_ch || '').split(', '))).size };
  }, [rows]);

  const daChon = Object.keys(chon).filter((k) => chon[k] && (ke[k] || []).some((r) => r.tu && r.sl > 0));

  // Xuất MỘT file tổng cho tất cả mã đã chốt + ghi lại lệnh để đối chiếu sau
  const xuatTong = async () => {
    if (!daChon.length) { baoToast('Chưa chốt mã nào'); return; }
    const XLSX = await import('xlsx');
    const now = new Date();
    const maLenh = 'DP' + now.toISOString().slice(0, 10).replace(/-/g, '')
      + '-' + String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
    const luu = [], hang = [];
    daChon.forEach((bc) => {
      const sp = (rows || []).find((r) => r.barcode === bc) || {};
      (ke[bc] || []).filter((r) => r.tu && r.sl > 0).forEach((r) => {
        hang.push({
          'Kho chuyển': r.tu, 'Tên kho chuyển': r.tu_ten,
          'Cửa hàng nhận': r.den, 'Tên cửa hàng nhận': r.den_ten,
          Barcode: bc, 'Mã tham chiếu': sp.ma_tham_chieu || '',
          'Sản phẩm': sp.ten_sp || '', 'Số lượng': r.sl, 'Ghi chú': maLenh,
        });
        luu.push({ barcode: bc, tu: r.tu, den: r.den, sl: r.sl });
      });
    });
    const ws = XLSX.utils.json_to_sheet(hang);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DieuChuyen');
    XLSX.writeFile(wb, `${maLenh}.xlsx`);

    const { error } = await sb.rpc('fn_dp_luu',
      { p_ma_lenh: maLenh, p_rows: luu, p_nguoi: user?.ma_dang_nhap || '' });
    if (error) baoToast('Đã xuất file nhưng chưa ghi được lịch sử: ' + error.message);
    else baoToast(`Đã xuất ${maLenh} — ${luu.length} dòng chuyển của ${daChon.length} mã`);
  };

  return (
    <>
      <div className="cmdbar">
        <div className="cmd-title">
          <h2>Yêu cầu điều phối</h2>
          <p>Nơi nào đang cần · lấy hàng từ đâu · chốt xong xuất một file tổng cho kho</p>
        </div>
        <div className="cmd-row">
          <button className="btn-hd" onClick={tai}><IcRefresh /> Làm mới</button>
        </div>
      </div>

      <div className="toolbar">
        <DateBox label="Từ" value={tu} onChange={setTu} />
        <DateBox label="Đến" value={den} onChange={setDen} />
        <input className="flt-in" placeholder="Tìm mã / sản phẩm / cửa hàng…" value={q}
          onChange={(e) => setQ(e.target.value)} style={{ height: 40, minWidth: 200, flex: 1 }} />
        <span className="sla-chip">{tong.ma} mã · {fmtN(tong.sl)} cái · {tong.ch} nơi bán</span>
        <button className="btn btn-ai" onClick={xuatTong} disabled={!daChon.length}>
          <IcDown /> Xuất file tổng{daChon.length ? ` (${daChon.length} mã)` : ''}
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="tbl-wrap" style={{ maxHeight: '68vh', overflow: 'auto' }}>
          <table className="tbl tbl-fit">
            <thead><tr>
              <th style={{ width: 34 }}></th>
              <th>Sản phẩm</th>
              <th className="num">Nơi cần</th>
              <th className="num">Tổng cần</th>
              <th className="num">Tồn hệ thống</th>
              <th style={{ minWidth: 150 }}>Đã xếp nguồn</th>
              <th>Mới nhất</th>
            </tr></thead>
            <tbody>
              {rows === null ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 26, color: 'var(--ink-2)' }}>Đang tải…</td></tr>
              ) : hien.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 26, color: 'var(--ink-2)' }}>Chưa có yêu cầu điều phối nào.</td></tr>
              ) : hien.map((r) => {
                const p = phu(r.barcode, r);
                return (
                  <Fragment key={r.barcode}>
                    <tr className="ycdp-row" onClick={() => xo(r.barcode)} style={{ cursor: 'pointer' }}>
                      <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
                        <input type="checkbox" checked={!!chon[r.barcode]}
                          disabled={!(ke[r.barcode] || []).some((x) => x.tu && x.sl > 0)}
                          onChange={(e) => setChon((c) => ({ ...c, [r.barcode]: e.target.checked }))} />
                      </td>
                      <td><span style={{ marginRight: 6, color: 'var(--teal-deep)' }}>{mo === r.barcode ? '▼' : '▶'}</span>
                        <b>{r.ma_tham_chieu || r.barcode}</b>
                        <div className="tq-ghi" style={{ marginLeft: 18 }}>{r.ten_sp} · {r.nganh_1}</div></td>
                      <td className="num" style={{ fontWeight: 800, color: 'var(--teal-deep)' }}>{Number(r.so_ch)}</td>
                      <td className="num" style={{ fontWeight: 800, color: 'var(--magenta)' }}>{Number(r.tong_sl)}</td>
                      <td className="num" style={{ color: Number(r.ton_he_thong) > 0 ? 'var(--teal-deep)' : 'var(--ink-3)' }}>
                        {Number(r.ton_he_thong)}</td>
                      <td>
                        {ke[r.barcode] ? (
                          <div className="dp-phu">
                            <span className="dp-phu-bar"><i style={{ width: p.pct + '%' }} /></span>
                            <b>{p.pct}%</b><span className="tq-ghi">{fmtN(p.co)}/{fmtN(p.can)}</span>
                          </div>
                        ) : <span className="tq-ghi">bấm để xếp nguồn</span>}
                      </td>
                      <td style={{ fontSize: 12 }}>{fmtDT(r.moi_nhat)}</td>
                    </tr>

                    {mo === r.barcode && (
                      <tr className="cl-xo"><td colSpan={7}>
                        {dangGoi === r.barcode || !ke[r.barcode] ? (
                          <div className="tq-ghi">Đang tìm nguồn hàng…</div>
                        ) : (
                          <>
                            <div className="dp-thanh">
                              <b>Ghép nơi cần với nơi cho</b>
                              <button className="btn-mini" onClick={() => apLai(r.barcode)}>
                                <IcSpark /> Áp gợi ý lại</button>
                              <span className="tq-ghi">
                                Ưu tiên kho tổng → nơi cùng khu vực → nơi đang dư. Nơi cho luôn được
                                giữ lại đủ hàng bán tới kỳ đề nghị kế tiếp.
                              </span>
                            </div>

                            {vuot(r.barcode).length > 0 && (
                              <div className="dp-canh">
                                Đang lấy quá khả năng của: {vuot(r.barcode).map((n) => `${n.ten} (dư ${n.co_the_cho})`).join(', ')}
                              </div>
                            )}

                            <div className="tbl-wrap">
                              <table className="tbl tbl-fit">
                                <thead><tr>
                                  <th>Nơi nhận</th><th className="num">Cần</th>
                                  <th style={{ minWidth: 190 }}>Lấy từ</th>
                                  <th className="num" style={{ width: 90 }}>Số lượng</th>
                                  <th>Vì sao</th><th style={{ width: 40 }}></th>
                                </tr></thead>
                                <tbody>
                                  {(ke[r.barcode] || []).map((x, i) => (
                                    <tr key={i} className={!x.tu ? 'dp-thieu' : undefined}>
                                      <td><b>{x.den_ten}</b><div className="tq-ghi mono">{x.den} · {x.den_kv || ''}</div></td>
                                      <td className="num">{fmtN(x.can)}</td>
                                      <td>
                                        {x.tu ? (
                                          <Sel value={x.tu} onChange={(v) => doiNguon(r.barcode, i, v)}
                                            options={conLai(r.barcode).map((n) => ({
                                              value: n.ma_ch,
                                              label: `${n.ten}${n.la_kho ? ' (kho)' : ''} — còn ${n.con} cái`,
                                            }))} />
                                        ) : <span className="dp-khong">chưa có nơi nào cho được</span>}
                                      </td>
                                      <td className="num">
                                        <input className="qty-input" type="number" min="0" value={x.sl}
                                          onChange={(e) => suaSL(r.barcode, i, e.target.value)} />
                                      </td>
                                      <td><span className={'dp-ly ' + (x.ly_do === 'lấy từ kho' ? 'kho'
                                        : x.ly_do === 'cùng khu vực' ? 'kv' : x.ly_do === 'chưa có nguồn' ? 'ko' : '')}>
                                        {x.ly_do}</span></td>
                                      <td><button className="btn-mini" onClick={() => xoaDong(r.barcode, i)}>✕</button></td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            <div className="dp-nguon">
                              <span className="tq-ghi">Nguồn còn lại:</span>
                              {conLai(r.barcode).length === 0 && <span className="tq-ghi">không nơi nào còn dư mã này</span>}
                              {conLai(r.barcode).map((n) => (
                                <span key={n.ma_ch} className={'dp-chip' + (n.la_kho ? ' kho' : '') + (n.con <= 0 ? ' het' : '')}>
                                  {n.ten}<b>{n.con}</b>
                                  <i>tồn {n.ton}{n.giu_lai > 0 ? ` · giữ ${n.giu_lai}` : ''}</i>
                                </span>
                              ))}
                            </div>
                          </>
                        )}
                      </td></tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
