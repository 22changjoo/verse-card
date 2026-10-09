(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var state = { theme: '', filledOnly: false };
  var addThemes = [];
  var saveTimers = {};

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.hidden = true; }, 3500);
  }

  function chip(value, label, pressed) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.value = value;
    b.textContent = label;
    b.setAttribute('aria-pressed', String(!!pressed));
    return b;
  }

  function buildThemeChips() {
    var box = $('themeChips');
    box.appendChild(chip('', '전체', true));
    VerseLibrary.THEMES.forEach(function (t) { box.appendChild(chip(t, t, false)); });
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-value]');
      if (!b) return;
      state.theme = b.dataset.value;
      box.querySelectorAll('[data-value]').forEach(function (c) {
        c.setAttribute('aria-pressed', String(c === b));
      });
      render();
    });

    var addBox = $('addThemes');
    VerseLibrary.THEMES.forEach(function (t) { addBox.appendChild(chip(t, t, false)); });
    addBox.addEventListener('click', function (e) {
      var b = e.target.closest('[data-value]');
      if (!b) return;
      var on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      var t = b.dataset.value;
      addThemes = addThemes.filter(function (x) { return x !== t; });
      if (on) addThemes.push(t);
    });
  }

  function updateState(item, el) {
    var filled = !!item.text.trim();
    el.textContent = filled ? '입력됨' : '비어 있음';
    el.classList.toggle('filled', filled);
  }

  function makeItem(item) {
    var li = document.createElement('li');
    var d = document.createElement('details');
    d.className = 'verse-item';

    var sum = document.createElement('summary');
    var ref = document.createElement('span');
    ref.className = 'verse-ref';
    ref.textContent = item.ref;
    var themes = document.createElement('span');
    themes.className = 'verse-themes';
    themes.textContent = item.theme.join(' · ');
    var st = document.createElement('span');
    st.className = 'verse-state';
    updateState(item, st);
    sum.appendChild(ref); sum.appendChild(themes); sum.appendChild(st);
    d.appendChild(sum);

    var body = document.createElement('div');
    body.className = 'verse-body';
    var ta = document.createElement('textarea');
    ta.value = item.text;
    ta.setAttribute('aria-label', item.ref + ' 본문');
    ta.placeholder = '본문을 직접 입력하거나 붙여넣어 주세요. 절마다 줄을 바꿔 두면 긴 말씀을 절 단위로 나눌 수 있습니다.';
    body.appendChild(ta);

    var foot = document.createElement('div');
    foot.className = 'verse-foot';
    var saved = document.createElement('span');
    saved.className = 'saved';
    foot.appendChild(saved);
    if (item.custom) {
      var del = document.createElement('button');
      del.type = 'button';
      del.textContent = '이 말씀 삭제';
      del.addEventListener('click', function () {
        if (!confirm(item.ref + ' 항목을 삭제할까요?')) return;
        VerseLibrary.removeCustom(item.id);
        render();
      });
      foot.appendChild(del);
    }
    body.appendChild(foot);
    d.appendChild(body);

    ta.addEventListener('input', function () {
      item.text = ta.value;
      updateState(item, st);
      saved.textContent = '저장 중…';
      clearTimeout(saveTimers[item.id]);
      saveTimers[item.id] = setTimeout(function () {
        var ok = VerseLibrary.setText(item.id, ta.value);
        saved.textContent = ok ? '저장됨' : '저장하지 못했습니다';
        renderSummary();
      }, 400);
    });

    li.appendChild(d);
    return li;
  }

  function renderSummary() {
    var all = VerseLibrary.list();
    $('summary').textContent = '전체 ' + all.length + '개 중 ' + VerseLibrary.filledCount() + '개 입력됨';
  }

  function render() {
    var ul = $('verseList');
    ul.replaceChildren();
    var items = VerseLibrary.list().filter(function (v) {
      if (state.theme && v.theme.indexOf(state.theme) < 0) return false;
      if (state.filledOnly && !v.text.trim()) return false;
      return true;
    });
    if (!items.length) {
      var li = document.createElement('li');
      li.className = 'empty';
      li.textContent = state.filledOnly ? '본문이 입력된 말씀이 아직 없습니다.' : '해당하는 말씀이 없습니다.';
      ul.appendChild(li);
    }
    items.forEach(function (v) { ul.appendChild(makeItem(v)); });
    renderSummary();
  }

  // 중복 정리: 무엇을 할지 먼저 보여 주고, 확인하면 정리한다. (정리 전 상태는 되돌릴 수 있음)
  function onDedupe() {
    var plan = VerseLibrary.planDedupe();
    if (!plan.remove.length && !plan.conflicts.length) { toast('중복된 말씀이 없습니다.'); return; }

    var lines = [];
    if (plan.remove.length) {
      lines.push('정리할 중복: ' + plan.remove.length + '건');
      plan.remove.slice(0, 10).forEach(function (r) { lines.push(' · ' + r.ref + ' — ' + r.why); });
      if (plan.remove.length > 10) lines.push(' · 외 ' + (plan.remove.length - 10) + '건');
    }
    if (plan.conflicts.length) {
      if (lines.length) lines.push('');
      lines.push('본문이 서로 달라서 지우지 않고 남겨 두는 것: ' + plan.conflicts.length + '건');
      plan.conflicts.slice(0, 6).forEach(function (c) { lines.push(' · ' + c.ref); });
      lines.push('(직접 확인하고 필요 없는 쪽을 삭제해 주세요)');
    }
    if (!plan.remove.length) { alert(lines.join('\n')); return; }
    lines.push('');
    lines.push('정리한 뒤에도 "정리 되돌리기"로 이전 상태로 돌아갈 수 있습니다.');
    if (!confirm(lines.join('\n') + '\n\n정리할까요?')) return;

    var res = VerseLibrary.applyDedupe(plan);
    toast('중복 ' + res.removed + '건을 정리했습니다.' + (res.conflicts ? ' (본문이 다른 ' + res.conflicts + '건은 남겨 둠)' : ''));
    updateUndo();
    render();
  }

  function onUndo() {
    if (!confirm('중복 정리 전 상태로 되돌릴까요?\n정리한 뒤에 입력하거나 고친 내용은 사라집니다.')) return;
    if (VerseLibrary.restoreBackup()) toast('정리 전 상태로 되돌렸습니다.');
    updateUndo();
    render();
  }

  function updateUndo() { $('undoBtn').hidden = !VerseLibrary.hasBackup(); }

  function onAdd() {
    var ref = $('addRef').value.trim();
    if (!ref) { toast('장절을 입력해 주세요.'); return; }

    // 같은 말씀이 이미 있으면 새로 만들지 않는다.
    var dup = VerseLibrary.findByRef(ref);
    if (dup) {
      var text = $('addText').value;
      if (text.trim() && !dup.text.trim()) {
        VerseLibrary.setText(dup.id, text);
        toast('"' + dup.ref + '"은(는) 이미 목록에 있어서, 그 항목에 본문을 채웠습니다.');
        $('addRef').value = ''; $('addText').value = ''; $('addBox').open = false;
        render();
      } else {
        toast('"' + dup.ref + '"은(는) 이미 목록에 있습니다. 목록에서 찾아 수정해 주세요.');
      }
      return;
    }

    VerseLibrary.addCustom({ ref: ref, theme: addThemes.slice(), text: $('addText').value });
    $('addRef').value = '';
    $('addText').value = '';
    addThemes = [];
    $('addThemes').querySelectorAll('[data-value]').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
    $('addBox').open = false;
    toast('추가했습니다.');
    render();
  }

  function onExport() {
    var blob = new Blob([VerseLibrary.exportJson()], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var d = new Date();
    var ymd = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    var a = document.createElement('a');
    a.href = url;
    a.download = '말씀라이브러리_' + ymd + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    toast('파일로 내보냈습니다.');
  }

  function onImport() {
    var file = this.files && this.files[0];
    this.value = '';
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var res = VerseLibrary.importJson(String(reader.result));
        toast('가져왔습니다. 갱신 ' + res.updated + '개, 추가 ' + res.added + '개');
        render();
      } catch (err) {
        toast(err && err.message ? err.message : '파일을 읽을 수 없습니다.');
      }
    };
    reader.onerror = function () { toast('파일을 읽을 수 없습니다.'); };
    reader.readAsText(file);
  }

  function init() {
    buildThemeChips();
    $('filledOnly').addEventListener('change', function () { state.filledOnly = this.checked; render(); });
    $('addBtn').addEventListener('click', onAdd);
    $('dedupeBtn').addEventListener('click', onDedupe);
    $('undoBtn').addEventListener('click', onUndo);
    updateUndo();
    $('exportBtn').addEventListener('click', onExport);
    $('importFile').addEventListener('change', onImport);
    render();
  }

  VerseLibrary.load().then(init).catch(function (err) {
    console.error(err);
    toast('말씀 목록을 불러오지 못했습니다. 로컬 서버로 열어 주세요.');
  });
})();
