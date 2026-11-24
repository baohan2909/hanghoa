// NEW - 3.154: XUẤT DỮ LIỆU EXCEL — nhiều sheet, mỗi sheet: dòng tiêu đề + ghi chú bộ lọc, hàng tên cột có bộ lọc (autofilter),
// độ rộng cột hợp lý, số để dạng số thật (cộng / lọc / pivot được), tiền có dấu phân cách nghìn.
// sheet = { ten, tieuDe?, ghiChu?, cot:[{ ten, k | f(row), w, kieu:'so'|'tien'|'pt'|'chu'|'ngay' }], dong:[...], tong?: hàng tổng (nằm dưới, ngoài vùng lọc) }

const DANG = { so: '#,##0', tien: '#,##0', pt: '0.0%', thap: '#,##0.0' };

export async function excelBlob(sheets) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const daDung = new Set();
  for (const sh of sheets) {
    const aoa = [];
    if (sh.tieuDe) aoa.push([sh.tieuDe]);
    if (sh.ghiChu) aoa.push([sh.ghiChu]);
    if (aoa.length) aoa.push([]);
    const hDau = aoa.length;
    aoa.push(sh.cot.map((c) => c.ten));
    const hang = (r) => sh.cot.map((c, i) => {
      let v = c.f ? c.f(r) : Array.isArray(r) ? r[c.k ?? i] : r[c.k];
      if (v === undefined || v === '') v = null;
      if (v != null && (c.kieu === 'so' || c.kieu === 'tien' || c.kieu === 'thap' || c.kieu === 'pt')) { const n = Number(v); v = Number.isFinite(n) ? n : v; }
      return v;
    });
    for (const r of sh.dong) aoa.push(hang(r));
    const cuoiLoc = aoa.length - 1;
    if (sh.tong) aoa.push(hang(sh.tong));   // NEW - 3.156: hàng tổng ngay dưới dữ liệu, không nằm trong vùng lọc
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = sh.cot.map((c) => ({ wch: c.w || 12 }));
    sh.cot.forEach((c, j) => {
      const z = DANG[c.kieu];
      if (!z) return;
      for (let i = hDau + 1; i < aoa.length; i++) {
        const o = ws[XLSX.utils.encode_cell({ r: i, c: j })];
        if (o && o.t === 'n') o.z = z;
      }
    });
    if (sh.dong.length) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: hDau, c: 0 }, e: { r: cuoiLoc, c: sh.cot.length - 1 } }) };
    let ten = String(sh.ten).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet';
    while (daDung.has(ten)) ten = ten.slice(0, 28) + ' ' + (daDung.size + 1);
    daDung.add(ten);
    XLSX.utils.book_append_sheet(wb, ws, ten);
  }
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true, bookSST: true });
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// Lấy hết các trang dữ liệu chi tiết từ hàm xuất (fn_nh_xuat / fn_tt_xuat): 10.000 dòng / lần, báo tiến độ
export async function layHetDong(sb, ham, args, tienDo) {
  const so = 10000; let bo = 0; let tong = null; const ds = [];
  for (let lan = 0; lan < 60; lan++) {
    const { data, error } = await sb.rpc(ham, { ...args, p_bo_qua: bo, p_so: so });
    if (error) throw new Error(error.message);
    tong = Number(data?.tong) || 0;
    const d = data?.dong || [];
    ds.push(...d);
    bo += d.length;
    tienDo?.(Math.min(bo, tong), tong);
    if (!d.length || bo >= tong) break;
  }
  return ds;
}
