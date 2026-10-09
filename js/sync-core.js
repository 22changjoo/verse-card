/*
 * 동기화 핵심 규칙 — 화면·네트워크와 무관한 순수 함수만 모았다. (브라우저와 Node 시험에서 모두 쓴다)
 *
 * 두 기기의 내용을 합치는 원칙:
 *  - 항목마다 마지막 수정 시각(at, ms)이 있고, 같은 항목이 양쪽에서 다르면 "더 나중에 고친 쪽"이 이긴다. 같으면 이 기기 쪽.
 *  - 지운 것은 "삭제 시각"을 남겨(tombstone), 다른 기기에서도 사라지게 한다. 삭제 뒤에 다시 고친 항목은 되살아난다.
 *  - 보낸 내역은 한 번 만들면 바뀌지 않는 기록이라 양쪽을 합치기만 한다(삭제 표시가 있으면 제외).
 *  - 최근 받는 분은 이름별로 더 최근 것을 쓰고, "기록 지우기" 시각 이전 것은 제외한다. 최대 10명.
 *
 * 스냅샷(드라이브에 저장되는 한 파일의 내용):
 * {
 *   format:'verse-card-sync', version:1,
 *   library:{ texts:{id:{t,at}}, custom:{id:{ref,theme,text,at}}, deleted:{id:at} },
 *   history:{ entries:{id:{...}}, deleted:{id:at} },
 *   recent:{ items:{name:{honorific,at}}, clearedAt },
 *   settings:{ at, sender, closing, design, favorites } | null,
 *   logo:{ at, orig, mono } | {at, removed:true} | null
 * }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VerseSyncCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FORMAT = 'verse-card-sync';
  var RECENT_MAX = 10;

  function emptySnapshot() {
    return {
      format: FORMAT, version: 1,
      library: { texts: {}, custom: {}, deleted: {} },
      history: { entries: {}, deleted: {} },
      recent: { items: {}, clearedAt: 0 },
      settings: null,
      logo: null
    };
  }

  function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : 0; }

  // 밖에서 읽어 온 값(드라이브 파일)을 믿지 않고, 빠진 부분을 채워 안전한 모양으로 만든다.
  function normalize(s) {
    var out = emptySnapshot();
    if (!s || typeof s !== 'object' || s.format !== FORMAT) return out;
    var lib = obj(s.library), hist = obj(s.history), rec = obj(s.recent);
    Object.keys(obj(lib.texts)).forEach(function (id) {
      var x = obj(lib.texts[id]);
      out.library.texts[id] = { t: typeof x.t === 'string' ? x.t : '', at: num(x.at) };
    });
    Object.keys(obj(lib.custom)).forEach(function (id) {
      var x = obj(lib.custom[id]);
      if (typeof x.ref !== 'string' || !x.ref.trim()) return;
      out.library.custom[id] = {
        ref: x.ref, theme: Array.isArray(x.theme) ? x.theme.filter(function (t) { return typeof t === 'string'; }) : [],
        text: typeof x.text === 'string' ? x.text : '', at: num(x.at)
      };
    });
    Object.keys(obj(lib.deleted)).forEach(function (id) { out.library.deleted[id] = num(lib.deleted[id]); });
    Object.keys(obj(hist.entries)).forEach(function (id) {
      var e = obj(hist.entries[id]);
      if (!e.id) return;
      out.history.entries[id] = e;
    });
    Object.keys(obj(hist.deleted)).forEach(function (id) { out.history.deleted[id] = num(hist.deleted[id]); });
    Object.keys(obj(rec.items)).forEach(function (name) {
      var x = obj(rec.items[name]);
      out.recent.items[name] = { honorific: typeof x.honorific === 'string' ? x.honorific : '', at: num(x.at) };
    });
    out.recent.clearedAt = num(rec.clearedAt);
    if (s.settings && typeof s.settings === 'object') {
      out.settings = {
        at: num(s.settings.at), sender: typeof s.settings.sender === 'string' ? s.settings.sender : '',
        closing: s.settings.closing && typeof s.settings.closing === 'object' ? s.settings.closing : null,
        design: s.settings.design && typeof s.settings.design === 'object' ? s.settings.design : null,
        favorites: Array.isArray(s.settings.favorites) ? s.settings.favorites : []
      };
    }
    if (s.logo && typeof s.logo === 'object') {
      out.logo = s.logo.removed
        ? { at: num(s.logo.at), removed: true }
        : { at: num(s.logo.at), orig: typeof s.logo.orig === 'string' ? s.logo.orig : '', mono: typeof s.logo.mono === 'string' ? s.logo.mono : '' };
    }
    return out;
  }

  // 더 나중에 고친 쪽(at이 큰 쪽)을 고른다. 같으면 a(이 기기).
  function newer(a, b) {
    if (!a) return b;
    if (!b) return a;
    return num(b.at) > num(a.at) ? b : a;
  }

  function mergeDeleted(a, b) {
    var out = {};
    Object.keys(a).concat(Object.keys(b)).forEach(function (id) { out[id] = Math.max(num(a[id]), num(b[id])); });
    return out;
  }

  // local: 이 기기 스냅샷, remote: 드라이브 스냅샷 → 합친 스냅샷
  function merge(local, remote) {
    var a = normalize(local), b = normalize(remote);
    var out = emptySnapshot();

    // 말씀 라이브러리: 기본 목록 본문
    Object.keys(a.library.texts).concat(Object.keys(b.library.texts)).forEach(function (id) {
      out.library.texts[id] = newer(a.library.texts[id], b.library.texts[id]);
    });
    // 직접 추가한 말씀 (삭제 표시가 더 늦으면 제외)
    out.library.deleted = mergeDeleted(a.library.deleted, b.library.deleted);
    Object.keys(a.library.custom).concat(Object.keys(b.library.custom)).forEach(function (id) {
      var item = newer(a.library.custom[id], b.library.custom[id]);
      if (num(out.library.deleted[id]) >= num(item.at) && id in out.library.deleted) return;
      out.library.custom[id] = item;
    });

    // 보낸 내역: 합치기만, 삭제 표시가 있으면 제외
    out.history.deleted = mergeDeleted(a.history.deleted, b.history.deleted);
    Object.keys(a.history.entries).concat(Object.keys(b.history.entries)).forEach(function (id) {
      if (id in out.history.deleted) return;
      out.history.entries[id] = a.history.entries[id] || b.history.entries[id];
    });

    // 최근 받는 분
    out.recent.clearedAt = Math.max(a.recent.clearedAt, b.recent.clearedAt);
    var names = {};
    Object.keys(a.recent.items).concat(Object.keys(b.recent.items)).forEach(function (name) {
      var item = newer(a.recent.items[name], b.recent.items[name]);
      if (item.at > out.recent.clearedAt) names[name] = item;
    });
    Object.keys(names).sort(function (x, y) { return names[y].at - names[x].at; }).slice(0, RECENT_MAX)
      .forEach(function (name) { out.recent.items[name] = names[name]; });

    out.settings = newer(a.settings, b.settings);
    out.logo = newer(a.logo, b.logo);
    return out;
  }

  // 키 순서와 상관없이 같은 내용이면 같은 글자가 되게 한다(변경 여부 비교용).
  function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
    }
    return JSON.stringify(v);
  }

  function equal(a, b) { return stable(normalize(a)) === stable(normalize(b)); }

  // ── 이 기기 저장값 ↔ 스냅샷 ──
  // parts: { library:{texts,custom,meta,deleted}, history:{entries,deleted}, recent:[{name,honorific,at}], recentClearedAt,
  //          settings:{at,sender,closing,design}|null, logo:{at,orig,mono}|null }
  function fromParts(parts) {
    var s = emptySnapshot();
    var lib = parts.library || {};
    var texts = obj(lib.texts), meta = obj(lib.meta);
    Object.keys(meta).concat(Object.keys(texts)).forEach(function (id) {
      s.library.texts[id] = { t: typeof texts[id] === 'string' ? texts[id] : '', at: num(meta[id]) };
    });
    (Array.isArray(lib.custom) ? lib.custom : []).forEach(function (c) {
      if (!c || !c.id) return;
      s.library.custom[c.id] = { ref: c.ref, theme: c.theme || [], text: c.text || '', at: num(c.at) };
    });
    s.library.deleted = Object.assign({}, obj(lib.deleted));

    var h = parts.history || {};
    (Array.isArray(h.entries) ? h.entries : []).forEach(function (e) { if (e && e.id) s.history.entries[e.id] = e; });
    s.history.deleted = Object.assign({}, obj(h.deleted));

    (Array.isArray(parts.recent) ? parts.recent : []).forEach(function (r) {
      if (r && r.name) s.recent.items[r.name] = { honorific: r.honorific || '', at: num(r.at) };
    });
    s.recent.clearedAt = num(parts.recentClearedAt);
    s.settings = parts.settings || null;
    s.logo = parts.logo || null;
    return normalize(s);
  }

  function toParts(snapshot) {
    var s = normalize(snapshot);
    var texts = {}, meta = {};
    Object.keys(s.library.texts).forEach(function (id) {
      var x = s.library.texts[id];
      meta[id] = x.at;
      if (x.t.trim()) texts[id] = x.t;
    });
    var custom = Object.keys(s.library.custom).map(function (id) {
      var c = s.library.custom[id];
      return { id: id, ref: c.ref, theme: c.theme, text: c.text, at: c.at };
    });
    var entries = Object.keys(s.history.entries).map(function (id) { return s.history.entries[id]; });
    var recent = Object.keys(s.recent.items).map(function (name) {
      return { name: name, honorific: s.recent.items[name].honorific, at: s.recent.items[name].at };
    }).sort(function (x, y) { return y.at - x.at; });
    return {
      library: { texts: texts, custom: custom, meta: meta, deleted: s.library.deleted },
      history: { entries: entries, deleted: s.history.deleted },
      recent: recent, recentClearedAt: s.recent.clearedAt,
      settings: s.settings, logo: s.logo
    };
  }

  return { FORMAT: FORMAT, emptySnapshot: emptySnapshot, normalize: normalize, merge: merge, equal: equal, stable: stable, fromParts: fromParts, toParts: toParts };
});
