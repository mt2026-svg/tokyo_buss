// 都営バス NAVI - Service Worker
const CACHE_NAME = 'toei-bus-navi-v1';
const ASSETS = [
  '/tokyo_buss/',
  '/tokyo_buss/index.html',
  '/tokyo_buss/app.js',
  '/tokyo_buss/manifest.json',
  '/tokyo_buss/icon-192.png',
  '/tokyo_buss/icon-512.png',
];

// インストール時：静的ファイルをキャッシュ
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// アクティベート時：古いキャッシュを削除
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// フェッチ：キャッシュ優先、なければネットワーク
self.addEventListener('fetch', event => {
  // ODPTのAPIリクエストはキャッシュしない
  if (event.request.url.includes('odpt') || event.request.url.includes('workers.dev')) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
