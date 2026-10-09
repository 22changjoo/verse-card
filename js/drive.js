/*
 * 구글 드라이브 "앱 전용 숨김 폴더(appDataFolder)"에 동기화 파일 하나를 읽고 쓴다.
 *  - 권한(scope)은 drive.appdata 하나뿐이라, 이 앱은 사용자의 다른 드라이브 파일·폴더를 볼 수도 없다.
 *  - 파일은 드라이브 화면에는 보이지 않고, 이 앱(같은 클라이언트 ID)만 접근한다.
 * 토큰은 호출할 때마다 getToken()으로 받아 쓰며, 저장하지 않는다.
 */
(function (global) {
  'use strict';

  var FILE_NAME = 'verse-card-sync.json';

  function DriveStore(getToken, apiBase) {
    var base = (apiBase || 'https://www.googleapis.com').replace(/\/$/, '');

    function authError() { var e = new Error('로그인이 필요합니다.'); e.code = 'auth'; return e; }

    async function call(url, opts) {
      var token = await getToken();
      var headers = Object.assign({ Authorization: 'Bearer ' + token }, (opts && opts.headers) || {});
      var res = await fetch(url, Object.assign({}, opts, { headers: headers }));
      if (res.status === 401) throw authError();
      if (!res.ok) {
        var text = '';
        try { text = await res.text(); } catch (e) { /* 무시 */ }
        var err = new Error('구글 드라이브 오류 (' + res.status + ')' + (text ? ': ' + text.slice(0, 200) : ''));
        err.code = res.status === 403 ? 'forbidden' : 'http';
        err.status = res.status;
        throw err;
      }
      return res;
    }

    function revOf(meta) { return (meta.modifiedTime || '') + '|' + (meta.md5Checksum || ''); }

    // 현재 파일 읽기 → { fileId, rev, snapshot(없으면 null) }
    async function read() {
      var q = encodeURIComponent("name='" + FILE_NAME + "' and trashed=false");
      var listUrl = base + '/drive/v3/files?spaces=appDataFolder&q=' + q +
        '&fields=' + encodeURIComponent('files(id,modifiedTime,md5Checksum)') + '&orderBy=createdTime&pageSize=10';
      var list = await (await call(listUrl)).json();
      var file = (list.files || [])[0];
      if (!file) return { fileId: null, rev: '', snapshot: null };

      var res = await call(base + '/drive/v3/files/' + encodeURIComponent(file.id) + '?alt=media');
      var text = await res.text();
      var snapshot = null;
      try { snapshot = JSON.parse(text); } catch (e) { snapshot = null; } // 망가진 파일이면 비어 있는 것으로 보고 새로 쓴다
      return { fileId: file.id, rev: revOf(file), snapshot: snapshot };
    }

    // 쓰기 직전에 다른 기기가 먼저 바꿨는지 확인하기 위한 가벼운 조회
    async function head(fileId) {
      var url = base + '/drive/v3/files/' + encodeURIComponent(fileId) + '?fields=' + encodeURIComponent('id,modifiedTime,md5Checksum');
      var meta = await (await call(url)).json();
      return { rev: revOf(meta) };
    }

    // 쓰기 → { fileId, rev }
    async function write(snapshot, fileId) {
      var body = JSON.stringify(snapshot);
      var fields = encodeURIComponent('id,modifiedTime,md5Checksum');
      var meta;
      if (fileId) {
        meta = await (await call(base + '/upload/drive/v3/files/' + encodeURIComponent(fileId) + '?uploadType=media&fields=' + fields, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: body
        })).json();
      } else {
        var boundary = 'vc' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        var metadata = JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' });
        var multipart = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + metadata + '\r\n' +
          '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + body + '\r\n--' + boundary + '--';
        meta = await (await call(base + '/upload/drive/v3/files?uploadType=multipart&fields=' + fields, {
          method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body: multipart
        })).json();
      }
      return { fileId: meta.id, rev: revOf(meta) };
    }

    return { read: read, head: head, write: write };
  }

  global.VerseDrive = { FILE_NAME: FILE_NAME, DriveStore: DriveStore };
})(window);
