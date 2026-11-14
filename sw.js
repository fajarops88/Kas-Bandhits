/* Service worker Kas Bandhits — aset statis instan dari cache, data selalu dari server. */
const VERSI = 'kb-738dd452dd';
const ASET = ["./", "./index.html", "./admin.html", "./manifest.json", "./manifest-admin.json", "./assets/logo.svg", "./assets/icon-192.png", "./assets/apple-touch-icon.png", "./css/app.css?v=4be57271", "./js/config.js?v=64ec8ffa", "./js/inti.js?v=2d9173ae", "./js/publik.js?v=9a4a1ed5", "./js/tema.js?v=dfef444d", "./js/hitung.js?v=68321951", "./js/admin.js?v=2a952589"];
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
  // Hanya untuk alamat halaman ( / , index.html, admin.html ). Membuka berkas lain langsung di tab
  // (mis. js/publik.js) dilayani jaringan biasa, dan cache halaman hanya diisi respons HTML —
  // supaya halaman tidak pernah tertimpa isi berkas lain.
  if (req.mode === 'navigate') {
    if (!/\/(index\.html|admin\.html)?$/.test(url.pathname)) return;
    const kunci = url.pathname.endsWith('/admin.html') ? './admin.html' : './index.html';
    e.respondWith(caches.open(VERSI).then((c) => c.match(kunci).then((hit) => {
      const jaringan = fetch(req).then((res) => {
        if (res.ok && /text\/html/.test(res.headers.get('content-type') || '')) c.put(kunci, res.clone());
        return res;
      }).catch(() => hit);
      return hit || jaringan;
    })));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok && /\/(css|js|assets)\//.test(url.pathname)) { const salin = res.clone(); caches.open(VERSI).then((c) => c.put(req, salin)); }
    return res;
  })));
});
