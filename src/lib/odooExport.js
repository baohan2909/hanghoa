// Xuất file Odoo — cấu trúc cột đọc từ tham_so.odoo_mapping (đổi mapping, không đổi code)
import { sb } from './supabase.js';

export async function xuatFileOdoo(don, lines) {
  const XLSX = await import('xlsx');   // tải khi cần, giữ bundle nhẹ
  const { data } = await sb.from('tham_so').select('gia_tri')
    .eq('key', 'odoo_mapping').eq('pham_vi', 'GLOBAL').single();
  const mapping = data?.gia_tri || [
    { header: 'Barcode', field: 'barcode' },
    { header: 'Số lượng', field: 'sl_duyet' },
  ];
  const rows = lines
    .filter((l) => (l.sl_duyet ?? l.sl_xin) > 0)
    .map((l) => {
      const o = {};
      mapping.forEach((m) => {
        o[m.header] = m.field === 'ma_ch' ? don.ma_ch
          : m.field === 'ghi_chu' ? `NSFLOW-${don.id}`
          : (l[m.field] ?? l.sl_xin ?? '');
      });
      return o;
    });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'DonXinHang');
  XLSX.writeFile(wb, `ODOO_${don.ma_ch}_${don.id}.xlsx`);
}
