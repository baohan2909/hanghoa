/* NS CARE service worker — network-first, cache dự phòng khi rớt mạng.
   Đổi CACHE khi phát hành bản lớn để dọn cache cũ. */
const CACHE = 'nscare-v1'

self.addEventListener('install', (e) => { self.skipWaiting() })
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  // Không đụng API Supabase — luôn đi mạng
  if (e.request.method !== 'GET' || url.pathname.includes('/rest/')) return
  e.respondWith(
    fetch(e.request).then(res => {
      const clone = res.clone()
      caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {})
      return res
    }).catch(() => caches.match(e.request))
  )
})
