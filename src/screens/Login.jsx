import { useState } from 'react';
import { sb } from '../lib/supabase.js';

export default function Login({ onOk }) {
  const [u, setU] = useState(''); const [p, setP] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);

  const vao = async () => {
    if (!u || !p) { setErr('Nhập mã đăng nhập và mật khẩu'); return; }
    setBusy(true); setErr('');
    const { data, error } = await sb.rpc('fn_dang_nhap', { p_user: u, p_pass: p });
    setBusy(false);
    if (error) { setErr(error.message.replace(/^.*?: /, '')); return; }
    if (!data?.token) { setErr('Sai mã đăng nhập hoặc mật khẩu'); return; }
    onOk(data);
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>NS FLOW</h1>
        <div style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 4 }}>
          Đề nghị & điều chuyển hàng hóa — Nón Sơn
        </div>
        <div className="field">
          <label htmlFor="u">Mã đăng nhập</label>
          <input id="u" className="mono" value={u} autoCapitalize="characters"
            onChange={(e) => setU(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && vao()} placeholder="Mã CH hoặc mã quản lý" />
        </div>
        <div className="field">
          <label htmlFor="p">Mật khẩu</label>
          <input id="p" type="password" value={p} onChange={(e) => setP(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && vao()} />
        </div>
        {err && <div className="login-err">{err}</div>}
        <button className="btn btn-primary" style={{ width: '100%', marginTop: 18, justifyContent: 'center' }}
          onClick={vao} disabled={busy}>{busy ? 'Đang kiểm tra…' : 'Đăng nhập'}</button>
      </div>
    </div>
  );
}
