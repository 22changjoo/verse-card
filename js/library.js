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

  var BACKUP_KEY = 'libraryBackup';

  // 성경 약칭 → 정식 이름 (중복 판단 시 "요 3:16"과 "요한복음 3:16"을 같은 말씀으로 보기 위함)
  var ABBR = {
    '창': '창세기', '출': '출애굽기', '레': '레위기', '민': '민수기', '신': '신명기', '수': '여호수아', '삿': '사사기',
    '룻': '룻기', '삼상': '사무엘상', '삼하': '사무엘하', '왕상': '열왕기상', '왕하': '열왕기하', '대상': '역대상',
    '대하': '역대하', '스': '에스라', '느': '느헤미야', '에': '에스더', '욥': '욥기', '시': '시편', '잠': '잠언',
    '전': '전도서', '아': '아가', '사': '이사야', '렘': '예레미야', '애': '예레미야애가', '겔': '에스겔', '단': '다니엘',
    '호': '호세아', '욜': '요엘', '암': '아모스', '옵': '오바댜', '욘': '요나', '미': '미가', '나': '나훔', '합': '하박국',
    '습': '스바냐', '학': '학개', '슥': '스가랴', '말': '말라기', '마': '마태복음', '막': '마가복음', '눅': '누가복음',
    '요': '요한복음', '행': '사도행전', '롬': '로마서', '고전': '고린도전서', '고후': '고린도후서', '갈': '갈라디아서',
    '엡': '에베소서', '빌': '빌립보서', '골': '골로새서', '살전': '데살로니가전서', '살후': '데살로니가후서',
    '딤전': '디모데전서', '딤후': '디모데후서', '딛': '디도서', '몬': '빌레몬서', '히': '히브리서', '약': '야고보서',
    '벧전': '베드로전서', '벧후': '베드로후서', '요일': '요한일서', '요이': '요한이서', '요삼': '요한삼서',
    '유': '유다서', '계': '요한계시록'
  };

  // 장절 표기를 비교용 키로 바꾼다. 예) "요 3:16" → "요한복음3:16", "시편 23편 1-3절" → "시편23:1-3"
  function refKey(ref) {
    var s = String(ref || '').replace(/\s+/g, '');
    var m = s.match(/^([가-힣]+?)(\d+)[:장편](\d+)절?(?:[-~–—](\d+)절?)?$/);
    if (!m) return 'raw:' + s.toLowerCase();
    var book = ABBR[m[1]] || m[1];
    return book + m[2] + ':' + m[3] + (m[4] ? '-' + m[4] : '');
  }

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

  // 같은 말씀(표기만 다른 것 포함)이 이미 목록에 있으면 그 항목을 돌려준다.
  function findByRef(ref) {
    var k = refKey(ref);
    var all = list();
    for (var i = 0; i < all.length; i++) if (refKey(all[i].ref) === k) return all[i];
    return null;
  }

  function squash(t) { return String(t || '').replace(/\s+/g, ''); }

  /*
   * 중복 정리 계획 (실제로 바꾸지는 않는다).
   * 같은 말씀이 여러 개일 때 남길 항목을 정한다: 기본 목록의 항목이 있으면 그것, 없으면 본문이 있는 첫 번째 직접 추가 항목.
   * 기본 목록의 항목은 지우지 않고, 직접 추가한 중복 항목만 정리한다.
   *   - 본문이 비어 있는 중복 → 삭제
   *   - 남길 항목의 본문이 비어 있고 중복에 본문이 있음 → 본문을 남길 항목으로 옮기고 삭제
   *   - 본문이 같음 → 삭제
   *   - 본문이 서로 다름 → 지우지 않고 남겨 둠(사용자가 확인)
   */
  function planDedupe() {
    var groups = {};
    list().forEach(function (it) {
      var k = refKey(it.ref);
      (groups[k] = groups[k] || []).push(it);
    });

    var plan = { remove: [], moves: [], conflicts: [] };
    Object.keys(groups).forEach(function (k) {
      var g = groups[k];
      if (g.length < 2) return;
      var customs = g.filter(function (x) { return x.custom; });
      var winner = g.filter(function (x) { return !x.custom; })[0] ||
        customs.filter(function (x) { return x.text.trim(); })[0] || customs[0];
      var winnerText = winner.text;

      g.forEach(function (m) {
        if (m === winner || !m.custom) return;
        if (!m.text.trim()) {
          plan.remove.push({ id: m.id, ref: m.ref, why: '본문 없는 중복' });
        } else if (!winnerText.trim()) {
          plan.moves.push({ to: winner.id, text: m.text });
          plan.remove.push({ id: m.id, ref: m.ref, why: '본문을 "' + winner.ref + '" 항목으로 합침' });
          winnerText = m.text;
        } else if (squash(m.text) === squash(winnerText)) {
          plan.remove.push({ id: m.id, ref: m.ref, why: '같은 본문이 이미 있음' });
        } else {
          plan.conflicts.push({ id: m.id, ref: m.ref, with: winner.ref });
        }
      });
    });
    return plan;
  }

  // 정리하기 전 상태를 저장해 두어, 잘못 정리했을 때 되돌릴 수 있게 한다.
  function applyDedupe(plan) {
    global.VerseStore.set(BACKUP_KEY, { at: new Date().toISOString(), texts: data.texts, custom: data.custom });
    // 객체를 그대로 저장한 뒤 새 객체로 바꿔 쓰므로 백업은 영향을 받지 않는다.
    data = { texts: Object.assign({}, data.texts), custom: data.custom.map(function (c) { return Object.assign({}, c); }) };

    plan.moves.forEach(function (mv) {
      var c = data.custom.filter(function (x) { return x.id === mv.to; })[0];
      if (c) c.text = mv.text; else data.texts[mv.to] = mv.text;
    });
    var gone = {};
    plan.remove.forEach(function (r) { gone[r.id] = true; });
    data.custom = data.custom.filter(function (c) { return !gone[c.id]; });
    persist();
    return { removed: plan.remove.length, moved: plan.moves.length, conflicts: plan.conflicts.length };
  }

  function hasBackup() { return !!global.VerseStore.get(BACKUP_KEY, null); }

  function restoreBackup() {
    var b = global.VerseStore.get(BACKUP_KEY, null);
    if (!b) return false;
    data = { texts: b.texts || {}, custom: Array.isArray(b.custom) ? b.custom : [] };
    persist();
    global.VerseStore.remove(BACKUP_KEY);
    return true;
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
    findByRef: findByRef,
    refKey: refKey,
    planDedupe: planDedupe,
    applyDedupe: applyDedupe,
    hasBackup: hasBackup,
    restoreBackup: restoreBackup,
    filledCount: filledCount,
    exportJson: exportJson,
    importJson: importJson
  };
})(window);
