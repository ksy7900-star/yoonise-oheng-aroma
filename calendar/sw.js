/* ==========================================================
   타이밍달력 · 윤이세사주 — Service Worker
   network-first : 항상 최신을 먼저 받고, 끊기면 캐시로 연다.
   skipWaiting + clients.claim : 새 버전이 이전 버전에 막히지 않게.
   ========================================================== */
var VERSION = '20261122s';
var CACHE = 'yoonise-cal-' + VERSION;

var SHELL = [
  '/yoonise-oheng-aroma/calendar/',
  '/yoonise-oheng-aroma/calendar/index.html',
  '/yoonise-oheng-aroma/calendar/manifest.webmanifest',
  '/yoonise-oheng-aroma/calendar/assets/icon-192.png',
  '/yoonise-oheng-aroma/calendar/assets/icon-512.png',
  '/yoonise-oheng-aroma/calendar/assets/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      /* 하나가 실패해도 설치는 계속 — 나머지는 fetch 때 채워진다 */
      return Promise.all(SHELL.map(function (url) {
        return cache.add(new Request(url, { cache: 'reload' })).catch(function () {});
      }));
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE) return caches.delete(key);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('message', function (event) {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  var isNavigation = req.mode === 'navigate';
  event.respondWith(networkFirst(req, isNavigation));
});

function networkFirst(req, isNavigation) {
  return fetch(req, isNavigation ? { cache: 'no-store' } : undefined).then(function (res) {
    if (res && res.status === 200 && res.type === 'basic') {
      var copy = res.clone();
      caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
    }
    return res;
  }).catch(function () {
    return caches.open(CACHE).then(function (cache) {
      return cache.match(req, { ignoreSearch: true }).then(function (hit) {
        if (hit) return hit;
        if (isNavigation) {
          return cache.match('/yoonise-oheng-aroma/calendar/index.html', { ignoreSearch: true })
            .then(function (shell) {
              return shell || cache.match('/yoonise-oheng-aroma/calendar/', { ignoreSearch: true });
            });
        }
        return undefined;
      });
    }).then(function (hit) {
      if (hit) return hit;
      return new Response('오프라인 상태예요. 연결을 확인한 뒤 다시 열어 주세요.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    });
  });
}
