/*
 * 말씀 라이브러리: data/verses.json의 참조 목록(본문은 비어 있음) + 사용자가 직접 입력한 본문.
 * 입력한 본문과 직접 추가한 말씀은 이 기기 localStorage에만 저장되고 서버로 전송되지 않는다.
 * 앱은 성경 본문을 제공하지 않는다. 본문은 모두 사용자가 입력한 것이다.
 */
(function (global) {
  'use strict';

  var STORE_KEY = 'library';
  var THEMES = ['위로', '평안', '소망', '감사', '회복·치유', '인도하심', '함께하심', '믿음', '사랑', '기쁨', '새 힘', '축복'];
  var FORMAT = 'verse-card-library';

  var base = [];
  var data = { texts: {}, custom: [] };

  function persist() { return global.VerseStore.set(STORE_KEY, data); }

  function load() {
    return fetch('data/verses.json')
      .then(function (r) { if (!r.ok) throw new Error('verses.json ' + r.status); return r.json(); })
      .then(function (list) {
        base = list;
        var saved = global.VerseStore.get(STORE_KEY, null);
        if (saved && typeof saved === 'object') {
          data.texts = saved.texts && typeof saved.texts === 'object' ? saved.texts : {};
          data.custom = Array.isArray(saved.custom) ? saved.custom : [];
        }
        return list;
      });
  }

  // 화면에 보여줄 전체 목록 (참조 목록 + 직접 추가한 말씀)
  function list() {
    var items = base.map(function (v) {
      return { id: v.id, theme: v.theme || [], ref: v.ref, text: data.texts[v.id] || '', custom: false };
    });
    data.custom.forEach(function (c) {
      items.push({ id: c.id, theme: c.theme || [], ref: c.ref, text: c.text || '', custom: true });
    });
    return items;
  }

  function setText(id, text) {
    var c = data.custom.filter(function (x) { return x.id === id; })[0];
    if (c) {
      c.text = text;
    } else if (text.trim()) {
      data.texts[id] = text;
    } else {
      delete data.texts[id];
    }
    return persist();
  }

  function addCustom(entry) {
    var id = 'custom-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    data.custom.push({ id: id, ref: entry.ref, theme: entry.theme || [], text: entry.text || '' });
    persist();
    return id;
  }

  function removeCustom(id) {
    data.custom = data.custom.filter(function (x) { return x.id !== id; });
    return persist();
  }

  function filledCount() {
    return list().filter(function (v) { return v.text.trim(); }).length;
  }

  // 휴대폰 ↔ Mac 이동용 내보내기/가져오기
  function exportJson() {
    return JSON.stringify({
      format: FORMAT,
      version: 1,
      exportedAt: new Date().toISOString(),
      texts: data.texts,
      custom: data.custom
    }, null, 2);
  }

  // 반환: { updated, added } 또는 형식이 맞지 않으면 예외
  function importJson(text) {
    var obj = JSON.parse(text);
    if (!obj || obj.format !== FORMAT || typeof obj.texts !== 'object') {
      throw new Error('말씀카드 라이브러리 파일이 아닙니다.');
    }
    var knownIds = {};
    base.forEach(function (v) { knownIds[v.id] = true; });
    var updated = 0, added = 0;

    Object.keys(obj.texts).forEach(function (id) {
      var t = obj.texts[id];
      if (knownIds[id] && typeof t === 'string' && t.trim()) {
        data.texts[id] = t;
        updated++;
      }
    });
    (Array.isArray(obj.custom) ? obj.custom : []).forEach(function (c) {
      if (!c || typeof c.ref !== 'string' || !c.ref.trim()) return;
      var existing = data.custom.filter(function (x) { return x.id === c.id; })[0];
      var clean = {
        id: String(c.id || ('custom-' + Date.now().toString(36) + added)),
        ref: c.ref,
        theme: Array.isArray(c.theme) ? c.theme.filter(function (t) { return THEMES.indexOf(t) >= 0; }) : [],
        text: typeof c.text === 'string' ? c.text : ''
      };
      if (existing) {
        existing.ref = clean.ref; existing.theme = clean.theme; existing.text = clean.text;
        updated++;
      } else {
        data.custom.push(clean);
        added++;
      }
    });
    persist();
    return { updated: updated, added: added };
  }

  global.VerseLibrary = {
    THEMES: THEMES,
    load: load,
    list: list,
    setText: setText,
    addCustom: addCustom,
    removeCustom: removeCustom,
    filledCount: filledCount,
    exportJson: exportJson,
    importJson: importJson
  };
})(window);
