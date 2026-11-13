/* Service worker Kas Bandhits — aset statis instan dari cache, data selalu dari server. */
const VERSI = 'kb-a4ffec8dfc';
const ASET = ["./", "./index.html", "./admin.html", "./manifest.json", "./manifest-admin.json", "./assets/logo.svg", "./assets/icon-192.png", "./assets/apple-touch-icon.png", "./css/app.css?v=b51285f0", "./js/config.js?v=64ec8ffa", "./js/inti.js?v=5a933998", "./js/publik.js?v=fc87ccd1", "./js/tema.js?v=dfef444d", "./js/hitung.js?v=e06bb13a", "./js/admin.js?v=748c52cd"];
const FONT = 'kb-font-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSI).then((c) => c.addAll(ASET)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSI && k !== FONT).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Font Google: cache-first (berubah sangat jarang).
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONT).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }))));
    return;
  }
  if (url.origin !== self.location.origin) return;           // Apps Script & Google Sign-In: selalu jaringan
  // Halaman: cache dulu (instan), perbarui di latar belakang.
  if (req.mode === 'navigate') {
    const kunci = url.pathname.endsWith('/admin.html') ? './admin.html' : './index.html';
    e.respondWith(caches.open(VERSI).then((c) => c.match(kunci).then((hit) => {
      const jaringan = fetch(req).then((res) => { if (res.ok) c.put(kunci, res.clone()); return res; }).catch(() => hit);
      return hit || jaringan;
    })));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok && /\/(css|js|assets)\//.test(url.pathname)) { const salin = res.clone(); caches.open(VERSI).then((c) => c.put(req, salin)); }
    return res;
  })));
});
