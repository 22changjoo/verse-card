/*
 * 서비스 워커 — 정적 파일만 캐시해서 홈 화면에 추가한 뒤 오프라인에서도 열리게 한다.
 * 입력한 내용(이름·말씀 등)은 캐시하지 않는다. (요청에 담기지도 않는다)
 *
 * 파일을 수정해서 배포할 때는 아래 VERSION 숫자를 올려 주세요. 그래야 기존 사용자의 캐시가 새로 바뀝니다.
 */
var VERSION = 'v14';
var APP_CACHE = 'verse-card-app-' + VERSION;
var FONT_CACHE = 'verse-card-fonts-v1';

var APP_FILES = [
  './',
  'index.html',
  'library.html',
  'history.html',
  'manifest.json',
  'css/app.css',
  'css/templates.css',
  'css/library.css',
  'js/vendor/modern-screenshot.js',
  'js/theme.js',
  'js/storage.js',
  'js/render.js',
  'js/split.js',
  'js/library.js',
  'js/history.js',
  'js/sync-core.js',
  'js/drive.js',
  'js/sync-config.js',
  'js/sync.js',
  'js/export.js',
  'js/print.js',
  'js/logo.js',
  'js/app.js',
  'js/library-page.js',
  'js/history-page.js',
  'js/pwa.js',
  'data/templates.json',
  'data/greetings.json',
  'data/verses.json',
  'assets/logo/leaf.png',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-maskable-512.png',
  'assets/icons/apple-touch-icon.png',
  'assets/icons/favicon-32.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then(function (cache) { return cache.addAll(APP_FILES); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        var old = k.indexOf('verse-card-app-') === 0 && k !== APP_CACHE;
        return old ? caches.delete(k) : null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // 구글 폰트: 한 번 받으면 저장해 두고 이후엔 저장본을 쓴다(오프라인에서도 같은 글꼴).
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then(function (cache) {
        return cache.match(req).then(function (hit) {
          if (hit) return hit;
          return fetch(req).then(function (res) {
            if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
            return res;
          });
        });
      })
    );
    return;
  }

  // 같은 출처의 정적 파일: 항상 서버의 최신 파일을 먼저 받는다. (예전 화면과 새 코드가 섞여 버튼이 안 먹는 일을 막기 위함)
  // 인터넷이 없거나 4초 안에 응답이 없을 때만 저장해 둔 파일을 쓴다.
  if (url.origin === location.origin) {
    event.respondWith(networkFirst(req));
    return;
  }
  // 그 밖의 외부 요청은 건드리지 않는다.
});

var NETWORK_TIMEOUT_MS = 4000;

function networkFirst(req) {
  return caches.open(APP_CACHE).then(function (cache) {
    return new Promise(function (resolve) {
      var settled = false;
      var finish = function (res) { if (!settled) { settled = true; clearTimeout(timer); resolve(res); } };
      var fromCache = function () { return cache.match(req, { ignoreSearch: true }); };

      var timer = setTimeout(function () {
        fromCache().then(function (hit) { if (hit) finish(hit); });
      }, NETWORK_TIMEOUT_MS);

      // cache: 'no-cache' → 브라우저 임시 저장본이 아니라 서버에서 변경 여부를 확인한다.
      fetch(req, { cache: 'no-cache' }).then(function (res) {
        if (res && res.ok) cache.put(req, res.clone());
        finish(res);
      }).catch(function () {
        fromCache().then(function (hit) { finish(hit || Response.error()); });
      });
    });
  });
}
