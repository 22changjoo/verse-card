/*
 * 보낸 내역: 카드를 실제로 저장·공유·인쇄했을 때 한 줄씩 남긴다.
 * 이 기기에 저장되고, 구글 드라이브 동기화를 켠 경우에만 사용자 본인의 드라이브로 옮겨진다.
 *
 * 한 건: { id, at, via, type, season, situation, recipients:[{name, honorific}], ref, version, size, template, pages }
 *   via: 'save' | 'share' | 'print'   type: 'visit' | 'season'
 * 삭제는 "삭제 표시(deleted)"로 남겨 다른 기기에서도 사라지게 한다.
 */
(function (global) {
  'use strict';

  var KEY = 'history';

  function read() {
    var d = global.VerseStore.get(KEY, null);
    if (!d || typeof d !== 'object') d = {};
    return {
      entries: Array.isArray(d.entries) ? d.entries : [],
      deleted: d.deleted && typeof d.deleted === 'object' ? d.deleted : {}
    };
  }

  function write(d) { return global.VerseStore.set(KEY, d); }

  function newId() { return 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  // 새 내역 추가. 같은 카드를 연달아 저장한 경우(30초 이내, 같은 받는 분·말씀·방식)는 한 건으로 본다.
  function add(entry) {
    var d = read();
    var now = Date.now();
    var key = signature(entry);
    var recent = d.entries.slice(-3).filter(function (e) { return now - e.at < 30000 && signature(e) === key; })[0];
    if (recent) return recent.id;
    var item = Object.assign({ id: newId(), at: now }, entry);
    d.entries.push(item);
    write(d);
    return item.id;
  }

  function signature(e) {
    return [(e.recipients || []).map(function (r) { return r.name; }).join('+'), e.ref || '', e.via || '', e.size || '', e.pages || 1].join('|');
  }

  // 최신순 목록
  function list() {
    return read().entries.slice().sort(function (a, b) { return b.at - a.at; });
  }

  function remove(id) {
    var d = read();
    d.entries = d.entries.filter(function (e) { return e.id !== id; });
    d.deleted[id] = Date.now();
    return write(d);
  }

  function clear() {
    var d = read();
    var t = Date.now();
    d.entries.forEach(function (e) { d.deleted[e.id] = t; });
    d.entries = [];
    return write(d);
  }

  // 이 받는 분들께 같은 말씀을 이미 보냈는지 찾는다. names: 받는 분 이름들, refKey: VerseLibrary.refKey(출처)
  function findSent(names, refKeyValue, refKeyFn) {
    var wanted = (names || []).map(function (n) { return String(n).trim(); }).filter(Boolean);
    if (!wanted.length || !refKeyValue) return [];
    return list().filter(function (e) {
      if (!e.ref || refKeyFn(e.ref) !== refKeyValue) return false;
      var got = (e.recipients || []).map(function (r) { return r.name; });
      return wanted.some(function (n) { return got.indexOf(n) >= 0; });
    });
  }

  function recipientsText(e) {
    var rs = (e.recipients || []).map(function (r) { return r.name + (r.honorific ? ' ' + r.honorific : ''); });
    return rs.length ? rs.join(' · ') : '이름 없음';
  }

  global.VerseHistory = { add: add, list: list, remove: remove, clear: clear, findSent: findSent, recipientsText: recipientsText };
})(window);
