import React from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './context/AuthContext'
import App from './App'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './lib/config'
import './styles.css'

const root = createRoot(document.getElementById('root'))

// Chưa điền config.js -> báo rõ thay vì trắng màn
const chuaCauHinh =
  !SUPABASE_URL || SUPABASE_URL.includes('YOUR-PROJECT') ||
  !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes('YOUR-ANON')

if (chuaCauHinh) {
  root.render(
    <div style={{
      minHeight: '100vh', display: 'grid', placeItems: 'center',
      fontFamily: 'system-ui, sans-serif', background: '#F7F5F1', padding: 24
    }}>
      <div style={{
        maxWidth: 440, background: '#fff', borderRadius: 16, padding: '28px 26px',
        boxShadow: '0 12px 40px rgba(20,33,58,.12)', border: '1px solid #E6E2D8'
      }}>
        <div style={{
          fontWeight: 800, fontSize: 20, color: '#14213A', marginBottom: 8,
          background: 'linear-gradient(135deg,#14213A,#1E5F63 62%,#3FB6A8)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
        }}>NS CARE — chưa cấu hình</div>
        <p style={{ color: '#4A5670', fontSize: 14, lineHeight: 1.6, margin: '0 0 14px' }}>
          Chưa điền kết nối Supabase. Mở file <b>src/lib/config.js</b>, điền
          <b> SUPABASE_URL</b> và <b>SUPABASE_ANON_KEY</b> (Project Settings ▸ API),
          rồi build lại và deploy.
        </p>
        <div style={{
          background: '#FBFAF6', border: '1px solid #E6E2D8', borderRadius: 10,
          padding: '10px 12px', fontSize: 12.5, color: '#1E5F63', fontFamily: 'monospace'
        }}>npm run build → deploy dist/</div>
      </div>
    </div>
  )
} else {
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {})
    })
  }
  root.render(
    <React.StrictMode>
      <AuthProvider><App /></AuthProvider>
    </React.StrictMode>
  )
}
