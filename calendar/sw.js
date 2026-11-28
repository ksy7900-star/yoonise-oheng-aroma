/* ==========================================================
   타이밍달력 · 윤이세사주 — Service Worker
   network-first : 항상 최신을 먼저 받고, 끊기면 캐시로 연다.

   · HTML·JS·CSS 는 fetch(req, { cache: 'no-store' }) 로 받는다.
     깃허브 페이지가 HTML·JS·CSS 에 cache-control: max-age=600 을 붙여 주기 때문에,
     서비스 워커가 없거나(first 방문) 예전 워커가 도는 순간에는 배포 직후
     10분 동안 예전 화면이 그대로 보인다(2026-11-23 제보 #16176).
     문서뿐 아니라 스크립트·스타일·매니페스트까지 브라우저 HTTP 캐시를 건너뛴다.
     (2026-11-24 #18768 — JS/CSS 는 ?v= 가 붙어 오지만, 주소 없이 열린 화면이나
      옛 화면이 부르는 예전 주소도 새 배포를 따라가게 하기 위해서다.)
   · skipWaiting + clients.claim : 새 버전이 이전 버전에 막히지 않게.
   · activate 에서 이전 버전 캐시(yoonise-cal-*)를 전부 지운다.
     (같은 오리진의 다른 앱 캐시는 건드리지 않는다 — 이름 앞자리로만 지운다)
   · APP_VERSION = VERSION — 화면(pwa.js)이 지금 서버의 sw.js VERSION 과
     자기 화면 ?v= 를 견줘 한 단계 더 최신으로 넘어갈 때 쓴다.
   ========================================================== */
var VERSION = '20261128j';
var APP_VERSION = VERSION;
var CACHE = 'yoonise-cal-' + VERSION;
var CACHE_PREFIX = 'yoonise-cal-';

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
      /* 하나가 실패해도 설치는 계속 — 나머지는 fetch 때 채워진다
         (cache:'reload' = HTTP 캐시를 쓰지 말고 서버에서 다시 받는다) */
      return Promise.all(SHELL.map(function (url) {
        return cache.add(new Request(url, { cache: 'reload' })).catch(function () {});
      }));
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      /* 이전 버전 캐시를 확실히 지운다 — 하나라도 남으면 그 안의 옛 HTML/CSS 가
         오프라인 fallback 으로 다시 튀어나온다 */
      return Promise.all(keys.map(function (key) {
        if (key === CACHE) return null;
        if (key.indexOf(CACHE_PREFIX) !== 0) return null;
        return caches.delete(key);
      }));
    }).then(function () {
      /* 지금 열려 있는 화면까지 새 워커가 맡는다 (새로 고치면 바로 최신) */
      return self.clients.claim();
    }).then(function () {
      return self.clients.matchAll({ type: 'window' }).then(function (list) {
        list.forEach(function (client) {
          try { client.postMessage({ type: 'sw-activated', version: VERSION }); } catch (e) {}
        });
      });
    }).catch(function () {})
  );
});

self.addEventListener('message', function (event) {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  /* 화면이 물어보면 지금 버전을 알려 준다 — ?v= 비교가 막힌 환경의 마지막 길 */
  if (event.data === 'GET_VERSION') {
    try { event.source.postMessage({ type: 'sw-version', version: VERSION }); } catch (e) {}
  }
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  /* 문서 요청 — 브라우저에 따라 mode 가 navigate 로 안 오는 경우도 있어
     destination === 'document' 까지 함께 본다 */
  var isNavigation = req.mode === 'navigate' || req.destination === 'document';
  /* HTTP 캐시(max-age=600)를 건너뛰어야 하는 것 — 화면을 그리는 파일들.
     이미지·폰트는 그대로 둬서 다시 열 때 빠르게 뜨게 한다. */
  var dest = req.destination || '';
  var noStore = isNavigation || dest === 'script' || dest === 'style' || dest === 'manifest';
  event.respondWith(networkFirst(req, isNavigation, noStore));
});

function networkFirst(req, isNavigation, noStore) {
  /* 문서·JS·CSS·매니페스트는 no-store — HTTP 캐시도, 중간 캐시도 건너뛰고 서버에서 받는다 */
  var init = noStore ? { cache: 'no-store' } : undefined;
  return fetch(req, init).then(function (res) {
    if (res && res.status === 200 && res.type === 'basic') {
      var copy = res.clone();
      caches.open(CACHE).then(function (cache) { cache.put(req, copy); }).catch(function () {});
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
