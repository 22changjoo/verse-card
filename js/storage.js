/*
 * localStorage 래퍼. 값은 기본적으로 이 기기 브라우저에만 저장된다.
 * (구글 드라이브 동기화를 켠 경우에만, 동기화 대상 항목이 사용자 본인의 드라이브에 저장된다 — js/sync.js)
 * 저장소를 쓸 수 없는 환경(비공개 모드 등)에서도 앱이 멈추지 않도록 try/catch로 감싼다.
 */
(function (global) {
  'use strict';

  var PREFIX = 'verseCard.';

  // 동기화 대상 항목. 이 값이 사용자 조작으로 바뀌면 'verse-store-changed' 이벤트를 보내 자동 동기화를 예약한다.
  var SYNC_KEYS = {
    library: 1, history: 1, recent: 1, recentClearedAt: 1,
    sender: 1, closing: 1, design: 1, favorites: 1, settingsAt: 1,
    logo: 1, logoMono: 1, logoAt: 1
  };

  function notify(key) {
    if (!SYNC_KEYS[key]) return;
    try { document.dispatchEvent(new CustomEvent('verse-store-changed', { detail: { key: key } })); } catch (e) { /* 무시 */ }
  }

  function get(key, fallback) {
    try {
      var raw = localStorage.getItem(PREFIX + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function set(key, value) {
    var ok = write(key, value);
    if (ok) notify(key);
    return ok;
  }

  // 동기화로 받은 값을 반영할 때 쓴다(다시 동기화를 예약하지 않는다).
  function setSilent(key, value) { return write(key, value); }

  function remove(key) {
    try { localStorage.removeItem(PREFIX + key); } catch (e) { /* 무시 */ }
    notify(key);
  }

  function removeSilent(key) {
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

  global.VerseStore = {
    get: get, set: set, setSilent: setSilent, remove: remove, removeSilent: removeSilent,
    clearAll: clearAll, SYNC_KEYS: SYNC_KEYS
  };
})(window);
