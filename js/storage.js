/*
 * localStorage 래퍼. 모든 값은 이 기기 브라우저에만 저장되고 서버로 전송되지 않는다.
 * 저장소를 쓸 수 없는 환경(비공개 모드 등)에서도 앱이 멈추지 않도록 try/catch로 감싼다.
 */
(function (global) {
  'use strict';

  var PREFIX = 'verseCard.';

  function get(key, fallback) {
    try {
      var raw = localStorage.getItem(PREFIX + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function remove(key) {
    try { localStorage.removeItem(PREFIX + key); } catch (e) { /* 무시 */ }
  }

  // 이 앱이 저장한 모든 값 삭제 (다른 사이트 데이터는 건드리지 않는다)
  function clearAll() {
    try {
      Object.keys(localStorage)
        .filter(function (k) { return k.indexOf(PREFIX) === 0; })
        .forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) { /* 무시 */ }
  }

  global.VerseStore = { get: get, set: set, remove: remove, clearAll: clearAll };
})(window);
