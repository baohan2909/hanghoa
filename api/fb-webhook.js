// zalooa v4.8 (29/07) - fix fb-webhook schema care + not-iterable
// NS CARE — Webhook Facebook Messenger (Fanpage Nón Sơn)
// GET  : Facebook verify (hub.mode=subscribe & hub.verify_token khớp FB_VERIFY_TOKEN → trả hub.challenge)
// POST : sự kiện messaging — khách nhắn → ghi hộp chat → AI trả lời nếu được phân công
// Env cần: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FB_PAGE_TOKEN, FB_VERIFY_TOKEN, ANTHROPIC_API_KEY
export const config = { runtime: 'edge' };

const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const AI_KEY = () => process.env.ANTHROPIC_API_KEY || '';
const PAGE_TOKEN = () => process.env.FB_PAGE_TOKEN || '';

const rpc = async (fn, body) => {
  const r = await fetch(`${SB()}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: KEY(), Authorization: `Bearer ${KEY()}`, 'Content-Profile': 'care' },
    body: JSON.stringify(body)
  });
  return r.json().catch(() => null);
};
const db = (path) => fetch(`${SB()}/rest/v1/${path}`, {
  headers: { apikey: KEY(), Authorization: `Bearer ${KEY()}`, 'Accept-Profile': 'care' }
});

// gửi tin text qua FB Send API
async function fbGuiText(psid, text) {
  const r = await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_TOKEN()}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { id: psid }, messaging_type: 'RESPONSE', message: { text: String(text).slice(0, 1900) } })
  });
  const j = await r.json().catch(() => ({}));
  return { ok: !j.error, ma: j.error ? String(j.error.code) : null };
}

// lấy tên + avatar từ Graph
async function fbLayTen(psid) {
  try {
    const r = await fetch(`https://graph.facebook.com/${psid}?fields=first_name,last_name,profile_pic&access_token=${PAGE_TOKEN()}`);
    const j = await r.json();
    if (j && !j.error) {
      const ten = [j.last_name, j.first_name].filter(Boolean).join(' ') || null;
      if (ten || j.profile_pic)
        await rpc('fn_ht_cap_nhat_ten', { p_zalo_user_id: psid, p_ten: ten, p_avatar: j.profile_pic || null });
    }
  } catch (e) { console.error('fbLayTen:', e?.message); }
}

// AI trả lời (dùng chung bộ não cẩm nang, gửi qua FB)
async function aiTraLoi(htId, psid) {
  try {
    if (!AI_KEY()) return;
    const nl = await rpc('fn_ht_ai_nguyen_lieu', { p_ht: htId });
    if (!nl || !nl.tin) return;
    const hoiThoai = (nl.tin || []).map(t => (t.chieu === 'den' ? 'Khách: ' : 'Nón Sơn: ') + t.noi_dung).join('\n');
    const donTxt = (nl.don_gan_nhat || []).map(d => `- ${d.ma_don || ''} (${String(d.ngay_mua || '').slice(0, 10)}): ${d.san_pham || ''}`).join('\n');
    const prompt = (nl.ai_tri_thuc ? nl.ai_tri_thuc + '\n\n' : '')
      + 'PHONG CÁCH: ' + (nl.ai_phong_cach || 'Thân thiện, chuyên nghiệp, xưng "em" gọi khách "anh/chị".') + '\n'
      + (nl.ai_loi_dan ? nl.ai_loi_dan + '\n' : '')
      + (nl.khach && nl.khach.ten ? 'Tên khách: ' + nl.khach.ten + '\n' : '')
      + (donTxt ? 'Đơn hàng gần đây của khách:\n' + donTxt + '\n' : '')
      + spPrompt(nl)
      + 'Kênh đang chat: Facebook Messenger.\n'
      + 'Trả lời NGẮN GỌN (1-3 câu). Chỉ trả về đúng NỘI DUNG tin nhắn gửi khách — không giải thích, không markdown, không ngoặc kép bao ngoài.\n\n'
      + 'Hội thoại:\n' + hoiThoai + '\nNón Sơn:';
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': AI_KEY(), 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: nl.ai_model || 'claude-haiku-4-5', max_tokens: 400, messages: [{ role: 'user', content: prompt }] })
    });
    const j = await r.json().catch(() => null);
    const textTho = j?.content?.[0]?.text?.trim();
    if (!textTho) { console.error('AI FB rỗng:', JSON.stringify(j?.error || j).slice(0, 300)); return; }
    const { text, anhDs } = xuLyText(textTho, nl);
    const g = await fbGuiText(psid, text);
    await rpc('fn_ht_ghi_tin_di', { p_hoi_thoai_id: htId, p_noi_dung: text,
      p_nguoi_gui: 'AI', p_trang_thai: g.ok ? 'da_gui' : 'loi', p_ma_loi: g.ok ? null : g.ma, p_anh_url: null });

    // ==== GỬI ẢNH theo đúng mã AI đã đánh dấu ====
    for (const a of anhDs) {
      const ra = await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_TOKEN()}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: { id: psid }, messaging_type: 'RESPONSE',
          message: { attachment: { type: 'image', payload: { url: a.url, is_reusable: true } } } })
      });
      const raj = await ra.json().catch(() => ({}));
      const okA = !raj.error;
      await rpc('fn_ht_ghi_tin_di', { p_hoi_thoai_id: htId,
        p_noi_dung: '[Ảnh ' + a.ma + (a.mau ? ' — ' + a.mau : '') + ']',
        p_nguoi_gui: 'AI', p_trang_thai: okA ? 'da_gui' : 'loi',
        p_ma_loi: okA ? null : String(raj.error?.code), p_anh_url: a.url });
    }
  } catch (e) { console.error('aiTraLoi FB:', e?.message); }
}

function spPrompt(nl) {
  const ds = nl.sp_lien_quan || [];
  if (!ds.length) return '';
  const kh = ds.map(s => {
    const mau = (s.mau_co || []).map(m => (m.ma || '') + '=' + (m.ten || '')).join(', ');
    return '· ' + s.ma_sp + (s.loai ? ' (' + s.loai + ')' : '') +
      (s.gia ? ' — giá ' + s.gia + ' nghìn đồng' : '') +
      (s.vong_dau ? ' — vòng đầu ' + s.vong_dau : '') +
      (s.chat_lieu ? '\n  Chất liệu: ' + s.chat_lieu : '') +
      (s.phu_kien ? '\n  Phụ kiện: ' + s.phu_kien : '') +
      (s.cach_giat ? '\n  Cách giặt: ' + s.cach_giat : '') +
      (mau ? '\n  Màu hiện có: ' + mau : '');
  }).join('\n');
  return 'THÔNG TIN SẢN PHẨM LIÊN QUAN (dữ liệu chuẩn từ kho, dùng để tư vấn - giá đơn vị NGHÌN ĐỒNG, ví dụ 1250 = 1.250.000đ):\n' + kh + '\n'
    + 'Khi muốn gửi hình mã nào cho khách, thêm cuối tin dòng [[ANH:MÃ]] hoặc [[ANH:MÃ|màu]] (chỉ với mã có trong danh sách trên). Chỉ gửi khi khách thực sự muốn xem hoặc giúp chốt đơn.\n';
}
function xuLyText(textTho, nl) {
  const sps = nl.sp_lien_quan || [];
  const anhDs = [];
  let text = textTho.replace(/\[\[\s*ANH\s*:\s*([^\]]+?)\s*\]\]/gi, (m, g) => {
    const [maRaw, mauRaw] = g.split('|').map(x => (x || '').trim());
    const ma = (maRaw || '').toUpperCase();
    const mau = mauRaw || null;
    const sp = sps.find(s => s.ma_sp === ma) ||
               sps.find(s => s.ma_sp.replace(/[^A-Z0-9Đ]/g, '') === ma.replace(/[^A-Z0-9Đ]/g, ''));
    if (sp) {
      let anh = sp.anh || [];
      if (mau) { const k = anh.filter(a => a.mau && String(a.mau).toLowerCase().includes(mau.toLowerCase())); if (k.length) anh = k; }
      anh.slice(0, 8).forEach(a => anhDs.push({ url: a.url, ma: sp.ma_sp, mau: a.mau }));
    }
    return '';
  });
  // làm sạch markdown (Zalo/FB không hiểu) + gạch dài
  text = text
    .replace(/\*\*([^*]+)\*\*/g, '$1')   // **đậm**
    .replace(/(?<!\*)\*(?!\*)([^*\n]+)\*(?!\*)/g, '$1') // *nghiêng*
    .replace(/__([^_]+)__/g, '$1')       // __gạch chân__
    .replace(/^#{1,6}\s+/gm, '')          // # tiêu đề
    .replace(/^\s*[-*]\s+/gm, '- ')       // bullet -> gạch ngắn
    .replace(/[—–]/g, '-')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { text: text || 'Dạ em gửi anh/chị tham khảo ạ.', anhDs };
}

export default async function handler(req, context) {
  const url = new URL(req.url);

  // ===== GET: Facebook verify =====
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token === (process.env.FB_VERIFY_TOKEN || '')) {
      return new Response(challenge || 'OK', { status: 200 });
    }
    return new Response('Sai verify token', { status: 403 });
  }

  if (req.method !== 'POST') return new Response('OK', { status: 200 });

  let b = null;
  try { b = await req.json(); } catch (_) { return Response.json({ ok: true }); }

  const viec = (async () => {
    try {
      for (const entry of (b.entry || [])) {
        for (const ev of (entry.messaging || [])) {
          const psid = String(ev.sender?.id || '');
          if (!psid) continue;

          // ECHO: tin do Page gửi từ nơi khác (app FB, Meta Business) → đồng bộ 2 chiều
          if (ev.message?.is_echo) {
            const uidKhach = String(ev.recipient?.id || '');
            const text = String(ev.message?.text || '(đã gửi nội dung)');
            if (!uidKhach) continue;
            const kq169 = await (await db(`ht_hoi_thoai?kenh=eq.facebook&zalo_user_id=eq.${uidKhach}&select=id`)).json().catch(() => []);
            const ht = Array.isArray(kq169) ? kq169[0] : null;
            if (!ht?.id) continue;
            // chống trùng 30s (tin app mình gửi cũng bị echo lại)
            const moc = new Date(Date.now() - 30000).toISOString();
            const trung = await (await db(`ht_tin?hoi_thoai_id=eq.${ht.id}&chieu=eq.di&noi_dung=eq.${encodeURIComponent(text)}&tao_luc=gte.${moc}&select=id`)).json();
            if (Array.isArray(trung) && trung.length) continue;
            await rpc('fn_ht_ghi_tin_di', { p_hoi_thoai_id: ht.id, p_noi_dung: text,
              p_nguoi_gui: 'FB', p_trang_thai: 'da_gui', p_ma_loi: null, p_anh_url: null });
            continue;
          }

          // Tin khách gửi
          if (ev.message) {
            const text = ev.message.text || null;
            const anh = (ev.message.attachments || []).find(a => a.type === 'image')?.payload?.url || null;
            const loai = anh ? 'image' : (text ? 'text' : 'sticker');
            const kq = await rpc('fn_ht_nhan_tin', {
              p_uid: psid, p_noi_dung: text || (anh ? '[Hình ảnh]' : '[Sticker]'),
              p_loai: loai, p_anh_url: anh, p_ten: null, p_kenh: 'facebook'
            });
            await rpc('fn_sync_fb_su_kien', { p_psid: psid, p_loai: 'nhan_tin', p_noi_dung: text });
            if (kq?.thieu_ten) await fbLayTen(psid);
            if (kq?.ai_se_tra_loi) await aiTraLoi(kq.ht_id, psid);
          }
        }
      }
    } catch (e) { console.error('fb-webhook:', e?.message); }
  })();
  if (context?.waitUntil) context.waitUntil(viec); else await viec;

  return Response.json({ ok: true });
}
