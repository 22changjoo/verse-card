(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var VIA = { save: '이미지 저장', share: '공유', print: '인쇄' };

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.hidden = true; }, 3500);
  }

  function fmt(ts) {
    var d = new Date(ts);
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
  }

  function matches(e, q) {
    if (!q) return true;
    var hay = [VerseHistory.recipientsText(e), e.ref, e.label, e.sizeName].join(' ').toLowerCase();
    return q.toLowerCase().split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; });
  }

  function row(e) {
    var li = document.createElement('li');
    li.className = 'verse-item history-item';
    var box = document.createElement('div');
    box.className = 'history-box';

    var main = document.createElement('div');
    main.className = 'history-main';
    var who = document.createElement('div');
    who.className = 'history-who';
    who.textContent = VerseHistory.recipientsText(e) + '께';
    var sub = document.createElement('div');
    sub.className = 'history-sub wrap';
    sub.textContent = [e.ref ? e.ref + (e.version ? ' · ' + e.version : '') : '말씀 없음', e.label,
      (e.sizeName || '') + (e.pages > 1 ? ' ' + e.pages + '장' : ''), VIA[e.via] || ''].filter(Boolean).join(' · ');
    var when = document.createElement('div');
    when.className = 'history-sub';
    when.textContent = fmt(e.at);
    main.appendChild(who); main.appendChild(sub); main.appendChild(when);

    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'icon-btn small';
    del.setAttribute('aria-label', '이 내역 삭제');
    del.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/></svg>';
    del.addEventListener('click', function () {
      if (!confirm('이 내역을 지울까요?\n(' + VerseHistory.recipientsText(e) + '께 · ' + (e.ref || '말씀 없음') + ')')) return;
      VerseHistory.remove(e.id);
      render();
      toast('지웠습니다.');
    });

    box.appendChild(main); box.appendChild(del);
    li.appendChild(box);
    return li;
  }

  function render() {
    var q = $('histSearch').value.trim();
    var all = VerseHistory.list();
    var items = all.filter(function (e) { return matches(e, q); });
    var ul = $('histList');
    ul.replaceChildren();
    if (!items.length) {
      var li = document.createElement('li');
      li.className = 'empty';
      li.textContent = all.length ? '찾는 내역이 없습니다.' : '아직 보낸 내역이 없어요. 카드를 저장·공유·인쇄하면 기록돼요.';
      ul.appendChild(li);
    }
    items.forEach(function (e) { ul.appendChild(row(e)); });
    $('histSummary').textContent = '전체 ' + all.length + '건' + (q ? ' 중 ' + items.length + '건 찾음' : '');
    $('histClear').disabled = !all.length;
  }

  function init() {
    $('histSearch').addEventListener('input', render);
    $('histClear').addEventListener('click', function () {
      if (!confirm('보낸 내역을 모두 지울까요?\n동기화를 켜 두었다면 다른 기기에서도 지워집니다.')) return;
      VerseHistory.clear();
      render();
      toast('모두 지웠습니다.');
    });
    document.addEventListener('verse-sync-applied', render);
    if (window.VerseSync) VerseSync.mountPanel($('syncPanel'));
    render();
  }

  init();
})();
