// NS CARE — AI gợi ý câu trả lời CSKH (Vercel Edge). Gọi Claude, khóa ở env.
export const config = { runtime: 'edge' };
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AI_KEY = process.env.ANTHROPIC_API_KEY || '';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type' };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json', ...CORS } });

async function rpc(fn, body) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, { method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', 'Content-Profile': 'care' },
    body: JSON.stringify(body) });
  return { ok: r.ok, data: r.ok ? await r.json().catch(() => null) : null };
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, loi: 'POST only' }, 405);
  try {
    const b = await req.json().catch(() => ({}));
    const ma = await rpc('fn_phien_ma', { p_token: b.token || '' });
    if (!ma.ok || !ma.data) return json({ ok: false, loi: 'PHIEN_KHONG_HOP_LE' }, 401);
    if (!AI_KEY) return json({ ok: false, loi: 'CHUA_CO_AI_KEY' });

    // b.hoi_thoai_id (ưu tiên, lấy ngữ cảnh giàu từ DB) hoặc b.lich_su
    let lichSu = b.lich_su || [], khach = null, donTxt = '', loiDan = '';
    if (b.hoi_thoai_id) {
      const nl = await rpc('fn_ht_ai_nguyen_lieu', { p_ht: b.hoi_thoai_id });
      const d = nl && nl.data !== undefined ? nl.data : nl;
      if (d) {
        lichSu = d.tin || lichSu; khach = d.khach; loiDan = d.ai_loi_dan || '';
        globalThis.__triThuc = d.ai_tri_thuc || ''; globalThis.__model = d.ai_model || 'claude-haiku-4-5'; globalThis.__phong = d.ai_phong_cach || '';
        donTxt = (d.don_gan_nhat || []).map(x => '- Đơn ' + (x.ma_don || '') + ' ngày ' + String(x.ngay_mua || '').slice(0, 10) + ': ' + (x.san_pham || '')).join('\n');
      }
    }
    const hoiThoai = (lichSu || []).map(t => (t.chieu === 'den' ? 'Khách: ' : 'CSKH: ') + t.noi_dung).join('\n');
    const tomTat = b.che_do === 'tom_tat';
    const triThuc = globalThis.__triThuc || '';
    const prompt = (triThuc ? triThuc + '\n\n' : 'Bạn là nhân viên chăm sóc khách hàng của Nón Sơn (thương hiệu mũ bảo hiểm và nón vải Việt Nam).\n')
      + (tomTat
        ? 'Hãy TÓM TẮT hội thoại dưới đây trong 3-5 gạch đầu dòng tiếng Việt: khách là ai, cần gì, đã hứa/xử lý gì, việc còn phải làm. Chỉ trả về JSON thuần: {"tom_tat":"nội dung tóm tắt"} — không markdown.\n'
        : 'Dưới đây là hội thoại với khách trên Zalo. Hãy đề xuất ' + (b.goi_y_so || 3)
          + ' câu trả lời NGẮN GỌN, LỊCH SỰ, xưng "em" gọi khách "anh/chị"'
          + (khach && khach.ten ? ' (tên khách: ' + khach.ten + ')' : '')
          + ', thuần Việt, phù hợp nghiệp vụ bán lẻ.\n'
          + (loiDan ? loiDan + '\n' : '')
          + (donTxt ? 'Đơn hàng gần đây của khách:\n' + donTxt + '\n' : '')
          + 'Chỉ trả về JSON thuần: {"goi_y":["câu 1","câu 2","câu 3"]} — không giải thích, không markdown.\n')
      + '\nHội thoại:\n' + hoiThoai;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': AI_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: (tomTat ? 'claude-sonnet-5' : (globalThis.__model || 'claude-haiku-4-5')), max_tokens: 600, messages: [{ role: 'user', content: prompt }] })
    });
    const j = await r.json();
    const txt = (j.content || []).filter(x => x.type === 'text').map(x => x.text).join('').replace(/```json|```/g, '').trim();
    let goi_y = [], tom_tat_kq = null;
    try { const p = JSON.parse(txt); goi_y = p.goi_y || []; tom_tat_kq = p.tom_tat || null; }
    catch (_) { if (tomTat) tom_tat_kq = txt; else goi_y = txt ? [txt] : []; }
    return json({ ok: true, goi_y, tom_tat: tom_tat_kq });
  } catch (e) {
    return json({ ok: false, loi: String(e?.message || e) });
  }
}
