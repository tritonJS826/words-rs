// Service Worker: приложение открывается и работает без интернета.
// При изменении файлов приложения увеличьте номер версии — старый кэш удалится.
const VERSION = 'v2';
const CACHE = 'srpski-app-' + VERSION;
const TTS_CACHE = 'srpski-tts';
const ASSETS = [
  './', 'index.html', 'feedback.html', 'manifest.webmanifest',
  'data/words.json', 'data/dialogs.json', 'data/lessons.json',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== TTS_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const put = (cache, req, res) => caches.open(cache).then(c => c.put(req, res)).catch(() => {});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Озвучка: сначала сеть; услышанные слова сохраняются и звучат потом без интернета
  if (url.pathname.startsWith('/.netlify/functions/tts')) {
    e.respondWith(
      fetch(req)
        .then(res => { if (res.status === 200) put(TTS_CACHE, req, res.clone()); return res; })
        .catch(() => caches.match(req, { ignoreVary: true }).then(r => r || Response.error()))
    );
    return;
  }

  // Страницы: сначала сеть (чтобы сразу видеть обновления), без сети — из кэша
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => { if (res.ok) put(CACHE, req, res.clone()); return res; })
        .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
    );
    return;
  }

  // Иконки, шрифты и прочее: из кэша, а в фоне обновляем
  e.respondWith(
    caches.match(req).then(cached => {
      const net = fetch(req)
        .then(res => { if (res.ok || res.type === 'opaque') put(CACHE, req, res.clone()); return res; })
        .catch(() => cached || Response.error());
      return cached || net;
    })
  );
});
