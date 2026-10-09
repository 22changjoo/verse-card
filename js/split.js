/*
 * 긴 말씀 자동 분할 — 절 경계에서만 나눈다.
 *
 * 절 구분 방법(둘 중 하나):
 *   1) 사용자가 줄바꿈으로 절을 구분한 경우: 한 줄 = 한 절
 *   2) 본문 앞에서부터 절 번호가 1 2 3 … 처럼 이어지는 경우: 번호마다 한 절
 * 둘 다 아니면 나눌 수 없다(한 덩어리).
 *
 * 나누는 기준: 각 장이 "편안한 글자 크기"(기본 크기의 약 88%, 최소 34px) 이상으로 들어가도록 채운 뒤,
 * 장 수가 정해지면 장마다 분량이 고르게 되도록 다시 나눈다.
 * 이어지는 장(2장~)에는 제목·받는 분·인사말을 반복하지 않고, 출처는 마지막 장에만 표기한다.
 */
(function (global) {
  'use strict';

  var COMFORT_RATIO = 0.88;
  var stageEl = null;

  function stage() {
    if (!stageEl) {
      stageEl = document.createElement('div');
      stageEl.setAttribute('aria-hidden', 'true');
      stageEl.style.cssText = 'position:fixed;left:0;top:0;z-index:-1;pointer-events:none;opacity:0';
      document.body.appendChild(stageEl);
    }
    return stageEl;
  }

  // 본문을 절 단위 조각으로 나눈다. 나눌 수 없으면 길이 1의 배열.
  function units(text) {
    var t = (text || '').replace(/\r\n?/g, '\n').trim();
    if (!t) return [];

    var lines = t.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    if (lines.length > 1) return lines;

    var re = /(^|\s)(\d{1,3})(?=\s)/g;
    var cands = [], m;
    while ((m = re.exec(t))) cands.push({ num: parseInt(m[2], 10), idx: m.index + m[1].length });
    if (!cands.length || cands[0].idx !== 0) return [t];

    var chain = [cands[0]];
    for (var i = 1; i < cands.length; i++) {
      if (cands[i].num === chain[chain.length - 1].num + 1) chain.push(cands[i]);
    }
    if (chain.length < 2) return [t];

    return chain.map(function (c, k) {
      var end = k + 1 < chain.length ? chain[k + 1].idx : t.length;
      return t.slice(c.idx, end).trim();
    });
  }

  // 장 하나에 들어갈 데이터. i: 장 번호(0부터), n: 전체 장 수
  function pageData(data, i, n, verseText, showNo) {
    var d = Object.assign({}, data);
    d.verse = verseText;
    if (i > 0) { d.seasonTitle = ''; d.recipient = ''; d.recipient2 = ''; d.greeting = ''; }
    if (i < n - 1) d.ref = '';
    d.pageLabel = showNo && n > 1 ? (i + 1) + '/' + n : '';
    return d;
  }

  function fits(data, design, verseText, i, comfort, showNo) {
    var d = pageData(data, i, 2, verseText, showNo);
    d.ref = data.ref;                       // 출처 자리는 항상 남겨 둔다(마지막 장 기준)
    if (showNo) d.pageLabel = '0/0';
    var st = stage();
    var card = global.VerseCard.renderCard(d, design);
    st.replaceChildren(card);
    var r = global.VerseCard.fitCard(card);
    st.replaceChildren();
    return !r.overflow && r.size >= comfort;
  }

  // 들어가는 만큼 앞에서부터 채운다(장 수를 최소로).
  function pack(us, data, design, comfort, showNo) {
    var pages = [], cur = [];
    us.forEach(function (u) {
      if (cur.length && !fits(data, design, cur.concat([u]).join('\n'), pages.length, comfort, showNo)) {
        pages.push(cur); cur = [];
      }
      cur.push(u);
    });
    if (cur.length) pages.push(cur);
    return pages;
  }

  // 글자 수 기준으로 장 분량을 고르게 나눈다. 첫 장은 제목·인사말 때문에 자리가 적어 가중치를 둔다.
  function charPack(us, cap, firstFactor) {
    var pages = [], cur = [], len = 0;
    us.forEach(function (u) {
      var limit = pages.length === 0 ? cap * firstFactor : cap;
      if (cur.length && len + u.length > limit) { pages.push(cur); cur = []; len = 0; }
      cur.push(u); len += u.length;
    });
    if (cur.length) pages.push(cur);
    return pages;
  }

  // k장으로 고르게 나누되, 모든 장이 편안한 크기로 들어가는 조합만 채택한다. 없으면 null.
  function balance(us, k, data, design, comfort, showNo) {
    var total = us.reduce(function (s, u) { return s + u.length; }, 0);
    var hasHead = !!((data.greeting || '').trim() || (data.recipient || '').trim() || (data.seasonTitle || '').trim());
    var firstFactor = hasHead ? 0.75 : 1;
    var step = Math.max(2, Math.round(total / (k * 20)));
    var seen = {};
    for (var cap = Math.ceil(total / k); cap <= total; cap += step) {
      var p = charPack(us, cap, firstFactor);
      if (p.length < k) break;
      if (p.length !== k) continue;
      var key = p.map(function (x) { return x.length; }).join(',');
      if (seen[key]) continue;
      seen[key] = true;
      var ok = p.every(function (page, i) {
        return fits(data, design, page.join('\n'), i, comfort, showNo);
      });
      if (ok) return p;
    }
    return null;
  }

  // 나눈 결과: 장별 데이터 배열. 나눌 수 없으면 원본 한 장.
  function split(data, design, showNo) {
    var us = units(data.verse);
    if (us.length < 2) return [pageData(data, 0, 1, data.verse, false)];

    var comfort = Math.max(global.VerseCard.MIN_VERSE_PX, Math.round(global.VerseCard.sizeOf(design).verseSize * COMFORT_RATIO));
    var pages = pack(us, data, design, comfort, showNo);

    // 장 수가 정해졌으면 분량을 고르게 맞춘다(고르게 나눈 조합이 안 들어가면 처음 결과 유지).
    if (pages.length > 1) {
      var even = balance(us, pages.length, data, design, comfort, showNo);
      if (even) pages = even;
    }

    var n = pages.length;
    return pages.map(function (units2, i) {
      return pageData(data, i, n, units2.join('\n'), showNo);
    });
  }

  global.VerseSplit = { units: units, split: split };
})(window);
