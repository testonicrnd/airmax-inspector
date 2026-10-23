/*
================================================================================
Air Max — 게임 전용 Google Apps Script (점검표 서버와 분리, 2026-10-23)

왜 따로: 점검표 서버와 같은 프로젝트면 게임 저장·방 요청이 점검표 제출과 같은 잠금(LockService)과
실행 한도를 나눠 써서, 게임하는 사람이 늘면 점검표 제출이 느려질 수 있음. 게임은 이 프로젝트만 씀.

처음 설치:
  1. script.google.com 에서 새 프로젝트 → 이 파일 전체를 붙여넣고 저장
  2. 프로젝트 설정 → 스크립트 속성에 추가
       GAME_SHEET_ID     — 점검표 프로젝트의 같은 이름 속성 값을 그대로 복사(게임 DB 시트)
       CHECKLIST_GAS_URL — 점검표 웹앱 주소(script.js의 GAS_URL). 관리자 토큰 확인에 씀
       OC_STATS, BS_STATS — 점검표 프로젝트에 있으면 값을 그대로 복사(원카드·해전 같이 하기 전적)
  3. 편집기에서 gameDbInfo 실행 → 권한 허용, 게임 DB가 맞게 열리는지 확인
  4. setupGameBackupTrigger 실행(매일 새벽 백업)
  5. 배포 → 새 배포 → 웹앱, 실행: 나, 액세스: 모든 사용자 → 나온 URL을 easterEgg.js의 GAME_GAS_URL에

관리자 확인: 게임 관리 화면은 점검표 앱의 관리자 로그인 토큰을 그대로 씀. 이 서버는 비밀번호를 갖지 않고,
점검표 서버에 adminCheck로 물어서 'super'인지 확인(5분 캐시).
이 파일은 googleDrive.js의 게임 부분에서 옮겨 왔음 — 게임 서버 코드는 이제 이 파일만 고치면 됨.
================================================================================
*/
function doGet(e) { return buildJson({ success: true, service: 'airmax-game' }); }

function doPost(e) {
    try {
        var data = JSON.parse(e.postData.contents);
        var action = data.action || '';
        if (action === 'gameLogin' || action === 'gameLoad' || action === 'gameSave' || action === 'gameRanking') return handleGameAction(data);
        if (GAME_ADMIN_ACTIONS[action]) return handleGameAdmin(data);
        if (/^oc(Lobby|Create|Join|Leave|Start|State|Play|Take|Call|Emote)$/.test(action)) return handleOneCard(data);
        if (/^bs(Lobby|Create|Join|Leave|State|Place|Shoot)$/.test(action)) return handleBattleship(data);
        return buildJson({ success: false, error: '알 수 없는 요청입니다: ' + action });
    } catch (err) {
        return buildJson({ success: false, error: err.message });
    }
}

// 게임 관리(슈퍼 관리자 전용) 요청
var GAME_ADMIN_ACTIONS = {
    gameAdminList: true, gameAdminReset: true, gameAdminDelete: true,
    gameAdminUnlock: true, gameAdminBackup: true, gameAdminResetAll: true, gameAdminEvent: true, gameAdminGrant: true
};
// 관리자 토큰 확인 — 점검표 서버에 adminCheck로 물어봄(토큰·비밀번호는 점검표 서버에만 있음). 성공만 5분 캐시.
// GAS 웹앱은 POST에 302로 답하고 결과는 그 주소를 GET해야 받음 → 직접 두 단계로(자동 따라가기는 POST를 다시 보내 실패할 수 있음)
var ADMIN_CHECK_WHY = '';
function getAdminLevel(token) {
    token = String(token || ''); ADMIN_CHECK_WHY = '';
    if (!token) { ADMIN_CHECK_WHY = '관리자 로그인 토큰 없음'; return null; }
    var cache = CacheService.getScriptCache(), ck = 'adm_' + Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)).slice(0, 40);
    var hit = cache.get(ck);
    if (hit) return hit;
    var url = PropertiesService.getScriptProperties().getProperty('CHECKLIST_GAS_URL');
    if (!url) { ADMIN_CHECK_WHY = '스크립트 속성 CHECKLIST_GAS_URL 없음'; return null; }
    try {
        var res = UrlFetchApp.fetch(url.trim(), { method: 'post', contentType: 'text/plain', payload: JSON.stringify({ action: 'adminCheck', adminToken: token }), muteHttpExceptions: true, followRedirects: false });
        var code = res.getResponseCode();
        if (code === 301 || code === 302 || code === 303 || code === 307) {
            var h = res.getHeaders(), loc = h.Location || h.location;
            res = UrlFetchApp.fetch(loc, { method: 'get', muteHttpExceptions: true, followRedirects: true });
            code = res.getResponseCode();
        }
        var text = res.getContentText(), j = null;
        try { j = JSON.parse(text); } catch (e) { ADMIN_CHECK_WHY = '점검표 서버 응답 ' + code + ': ' + text.slice(0, 60); return null; }
        if (j && j.success && (j.level === 'super' || j.level === 'admin')) { cache.put(ck, j.level, 300); return j.level; }
        ADMIN_CHECK_WHY = '점검표 서버가 토큰을 거절(' + ((j && (j.code || j.error)) || '?') + ') — 점검 앱에서 관리자 로그인을 다시 해 보세요';
    } catch (e) { ADMIN_CHECK_WHY = '점검표 서버 호출 실패: ' + e.message; }
    return null;
}
// 편집기에서 실행해 보는 용 — 점검표 서버와 연결이 되는지(토큰 없이 물어서 ADMIN_REQUIRED가 오면 연결 정상)
function testChecklistLink() {
    getAdminLevel('연결-확인용-가짜-토큰');
    Logger.log(ADMIN_CHECK_WHY);
}
// 랭킹 닉네임 정리(점검표 서버의 같은 이름 함수와 같은 규칙)
function normalizeChecklistLocation(loc) {
    return String(loc || '').replace(/ +/g, ' ').trim();
}

function buildJson(obj) {
    return ContentService.createTextOutput(JSON.stringify(obj))
        .setMimeType(ContentService.MimeType.JSON);
}

// ===== 숨은 미니 게임 "좆좋소 키우기" 저장소 =====
// 점검표와 완전히 분리된 "Air Max 게임 DB" 스프레드시트를 처음 저장할 때 만들고, players 시트에 플레이어 1명 = 1행으로 저장.
// 계정 = 닉네임(중복 불가, 대소문자·띄어쓰기 무시) + PIN(숫자 4~6자리). PIN은 해시만 저장하고, 로그인하면 세션 토큰을 받아 저장할 때 사용.
// PIN을 5번 틀리면 그 닉네임은 10분 동안 로그인 잠금. 진행 데이터는 JSON 문자열로 한 칸에 저장(크기 제한)
// 랭킹 초기화: GAS 편집기에서 resetGameRanking 실행 (기존 시트는 백업으로 이름만 바꿔 남김)
var GAME_SHEET_ID_PROP = 'GAME_SHEET_ID';
var GAME_HEADERS = ['플레이어ID', '닉네임', '스테이지', '레벨', '누적 실적', '저장 데이터', '최근 저장', '처음 시작', 'PIN 해시', '세션 토큰'];
var GAME_PIN_MAX_FAIL = 5, GAME_PIN_LOCK_SEC = 600;
function getGameSpreadsheet() {
    var props = PropertiesService.getScriptProperties();
    var id = props.getProperty(GAME_SHEET_ID_PROP);
    // 열기에 실패해도 새 시트를 만들지 않음 — 속성이 빈 시트 ID로 덮여서 기존 기록을 어디서도 찾지 못하게 됨(랭킹이 통째 비는 원인)
    if (id) {
        try { return SpreadsheetApp.openById(id); } catch (e) {
            throw new Error('게임 DB 시트를 열 수 없습니다 (ID ' + id + '). 시트가 휴지통에 있거나 공유 권한이 해제되지 않았는지 확인해주세요.');
        }
    }
    // 속성이 비어있어도 자동으로 만들지 않음 — 속성이 지워지거나 다른 프로젝트에 배포되었을 때 빈 DB가 조용히 생기는 것을 막기 위해
    throw new Error('게임 DB가 지정되지 않았습니다. 스크립트 속성 ' + GAME_SHEET_ID_PROP + '에 시트 ID를 넣거나, 처음 만들 때만 편집기에서 initGameDb()를 실행해주세요.');
}
// 처음 한 번만 — 게임 DB를 새로 만들어 속성에 기억. 이미 속성이 있으면 거부함(실수로 기록을 분리시키는 사고 방지)
function initGameDb() {
    var props = PropertiesService.getScriptProperties();
    var id = props.getProperty(GAME_SHEET_ID_PROP);
    if (id) throw new Error('이미 게임 DB가 지정되어 있습니다 (ID ' + id + '). 바꾸려면 스크립트 속성을 직접 수정해주세요.');
    var ss = SpreadsheetApp.create('Air Max 게임 DB');
    props.setProperty(GAME_SHEET_ID_PROP, ss.getId());
    setupGameSheet(getGameSheet());
    var msg = '게임 DB 생성 — ' + ss.getUrl();
    Logger.log(msg);
    return msg;
}
// 편집기에서 직접 실행 — Drive에서 '게임 DB' 후보를 모두 찾아 ID·만든 날짜·인원수를 찍어줌.
// 새 환경에서 빈 DB가 생기는 사고가 나서 원본 ID를 모를 때 사용. 인원수가 가장 많은 것이 원본이다
function findGameDb() {
    var inUse = PropertiesService.getScriptProperties().getProperty(GAME_SHEET_ID_PROP) || '';
    var NL = String.fromCharCode(10);
    var seen = {}, rows = [];
    var add = function(file) {
        var id = file.getId();
        if (seen[id]) return;
        seen[id] = true;
        var players = -1, sheets = '';
        try {
            var ss = SpreadsheetApp.openById(id);
            var sh = ss.getSheetByName('players');
            players = sh ? Math.max(0, sh.getLastRow() - 1) : -1;
            sheets = ss.getSheets().map(function(x) { return x.getName(); }).join(', ');
        } catch (e) { sheets = '열기 실패: ' + e.message; }
        rows.push({
            id: id, name: file.getName(), players: players,
            created: Utilities.formatDate(file.getDateCreated(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm'),
            updated: Utilities.formatDate(file.getLastUpdated(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm'),
            trashed: file.isTrashed(), sheets: sheets, inUse: id === inUse
        });
    };
    // 이름이 바띀을 수도 있으니 '게임'이 들어간 스프레드시트를 모두 후보로 봄
    var it = DriveApp.getFilesByName('Air Max 게임 DB');
    while (it.hasNext()) add(it.next());
    var it2 = DriveApp.searchFiles('mimeType = "application/vnd.google-apps.spreadsheet" and title contains "게임"');
    while (it2.hasNext()) add(it2.next());

    // 인원이 많은 순 — 맨 위가 원본일 가능성이 가장 높다
    rows.sort(function(a, b) { return b.players - a.players; });
    var out = ['현재 사용 중인 ID: ' + (inUse || '(지정 없음)'), '후보 ' + rows.length + '개 — 인원 많은 순:', ''];
    rows.forEach(function(r) {
        out.push((r.inUse ? '▶ [사용 중] ' : '  ') + r.name + (r.trashed ? ' (휴지통)' : ''));
        out.push('    ID: ' + r.id);
        out.push('    players: ' + (r.players < 0 ? '시트 없음' : r.players + '명') + ' / 시트: ' + r.sheets);
        out.push('    만들어짐: ' + r.created + ' / 마지막 수정: ' + r.updated);
        out.push('');
    });
    var msg = out.join(NL);
    Logger.log(msg);
    return msg;
}
// 편집기에서 직접 실행 — 지금 어떤 게임 DB를 사용하고 있고 몇 명이 들어있는지, 백업 시트가 있는지 확인
function gameDbInfo() {
    var ss = getGameSpreadsheet(), out = ['게임 DB: ' + ss.getName(), 'ID: ' + ss.getId(), 'URL: ' + ss.getUrl(), '시트 목록:'];
    ss.getSheets().forEach(function(sh) {
        out.push('  - ' + sh.getName() + ' — ' + Math.max(0, sh.getLastRow() - 1) + '명');
    });
    var msg = out.join(String.fromCharCode(10));
    Logger.log(msg);
    return msg;
}
// 백업 시트를 다시 players로 되돌림 — gameDbInfo가 찍어주는 '백업 …' 시트 이름을 그대로 넣어 실행.
// 지금 players 시트는 '밀려난 players …'로 이름만 바꿔 두므로 되돌리기도 가능
function restoreGameRanking(backupSheetName) {
    var ss = getGameSpreadsheet();
    var backup = ss.getSheetByName(backupSheetName);
    if (!backup) throw new Error('그런 시트가 없습니다: ' + backupSheetName + ' — gameDbInfo()로 시트 이름을 확인해주세요.');
    if (backup.getName() === 'players') throw new Error('이미 players 시트입니다.');
    var cur = ss.getSheetByName('players');
    // 백업은 이름만 바꾸지 않고 복사해서 올림 — 백업 시트는 그대로 남아있어야 함.
    // 지금 players는 '밀려난 players …'로 보존하므로 되돌리기도 가능
    if (cur) cur.setName('밀려난 players ' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HHmm'));
    var restored = backup.copyTo(ss).setName('players');
    ss.setActiveSheet(restored);
    ss.moveActiveSheet(1);
    setupGameSheet(restored);
    var msg = '랭킹 복원 완료 — ' + Math.max(0, restored.getLastRow() - 1) + '명 (' + ss.getUrl() + ')';
    Logger.log(msg);
    return msg;
}

function setupGameSheet(sheet) {
    sheet.getRange(1, 1, 1, GAME_HEADERS.length).setValues([GAME_HEADERS]).setFontWeight('bold').setBackground('#434343').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.getRange('A:A').setNumberFormat('@');
    sheet.getRange('I:J').setNumberFormat('@');
}
function getGameSheet() {
    var ss = getGameSpreadsheet();
    var sheet = ss.getSheetByName('players');
    if (!sheet) {
        sheet = ss.getSheets().length === 1 && ss.getSheets()[0].getLastRow() === 0 ? ss.getSheets()[0] : ss.insertSheet();
        sheet.setName('players');
        setupGameSheet(sheet);
    } else if (sheet.getRange(1, 9).getValue() !== GAME_HEADERS[8]) {
        sheet.getRange(1, 1, 1, GAME_HEADERS.length).setValues([GAME_HEADERS]).setFontWeight('bold').setBackground('#434343').setFontColor('#ffffff');
        sheet.getRange('I:J').setNumberFormat('@');
    }
    return sheet;
}
// 랭킹 초기화 — 지금 players 시트를 "players 백업 날짜"로 이름만 바꾸고 빈 players 시트를 새로 만듦
function resetGameRanking() {
    var ss = getGameSpreadsheet();
    var old = ss.getSheetByName('players');
    if (old) old.setName('players 백업 ' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HHmm'));
    var sheet = ss.insertSheet('players', 0);
    setupGameSheet(sheet);
    Logger.log('랭킹 초기화 완료 — ' + ss.getUrl());
}
// players 시트를 '백업 늠짜' 시트로 복사해 남김. setupGameBackupTrigger로 하루 1회 자동 실행.
// 기록이 통째 사라지는 사고가 한 번 있었으므로, 되돌릴 지점을 항상 남게 둔다
var GAME_BACKUP_KEEP = 14;
function backupGameRanking() {
    var ss = getGameSpreadsheet();
    var players = ss.getSheetByName('players');
    if (!players || players.getLastRow() < 2) return '백업할 기록이 없습니다.';
    var name = '백업 ' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
    var old = ss.getSheetByName(name);
    if (old) ss.deleteSheet(old);
    players.copyTo(ss).setName(name);
    // 오래된 백업은 GAME_BACKUP_KEEP개만 남김
    var backups = ss.getSheets().filter(function(sh) { return sh.getName().indexOf('백업 ') === 0; })
        .sort(function(a, b) { return a.getName() < b.getName() ? -1 : 1; });
    while (backups.length > GAME_BACKUP_KEEP) ss.deleteSheet(backups.shift());
    var msg = name + ' — ' + (players.getLastRow() - 1) + '명 백업';
    Logger.log(msg);
    return msg;
}
function setupGameBackupTrigger() {
    ScriptApp.getProjectTriggers().forEach(function(t) {
        if (t.getHandlerFunction() === 'backupGameRanking') ScriptApp.deleteTrigger(t);
    });
    ScriptApp.newTrigger('backupGameRanking').timeBased().atHour(4).everyDays(1).create();
    Logger.log('게임 랭킹 하루 1회 백업 트리거 설치 완료 (새벽 4시대)');
}
function gameFindRow(values, playerId) {
    for (var i = 0; i < values.length; i++) if (String(values[i][0]) === playerId) return i;
    return -1;
}
// 랭킹 응답 만들기 — 캐시에는 playerId를 담아 두고, 내보낼 때만 '나' 표시로 바꾼다
function rankOfPid(list, playerId) {
    for (var i = 0; i < list.length; i++) if (String(list[i].pid) === playerId) return i + 1;
    return 0;
}
function stripPid(x, playerId) {
    var o = {};
    for (var k in x) if (k !== 'pid') o[k] = x[k];
    o.me = String(x.pid) === playerId;
    return o;
}
function gameNickKey(nick) { return String(nick || '').replace(/\s+/g, '').toLowerCase(); }
function gameHash(text) {
    return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
        .map(function(b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}
function gameNewId() { return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''); }
function gameReadState(row) {
    try { return JSON.parse(String(row[5] || 'null')); } catch (e) { return null; }
}
// ===== 관리 기능 (슈퍼 관리자 전용) =====
// 목록 조회 / 한 사람 진행 초기화 / 삭제 / PIN 잠금 해제 / 지금 백업 / 전체 랭킹 초기화
// 돌발 이벤트 — 슈퍼 관리자가 켜면 모두에게 같은 이벤트가 걸린다. 스크립트 속성에 {ev, until}로 보관.
var GAME_EVENT_PROP = 'GAME_FORCED_EVENT';
// {ev, from, until} — from(시작 시각)이 미래면 예약 상태. 앱이 from~until 사이에만 적용
function readForcedEvent() {
    try {
        var raw = PropertiesService.getScriptProperties().getProperty(GAME_EVENT_PROP);
        if (!raw) return null;
        var o = JSON.parse(raw);
        if (!o || !o.ev || !o.until || Date.now() > o.until) return null;
        if (!o.from) o.from = o.until - 30 * 60000;
        return o;
    } catch (e) { return null; }
}
// 추천서 지급 — 슈퍼 관리자가 장수를 정해 전원에게 1번씩. [{id, count, at}] 최근 7일분만 유지, 앱이 받은 id를 기억해서 중복 지급 안 함
var GAME_GRANT_PROP = 'GAME_REF_GRANTS';
var GAME_GRANT_DAYS = 7;
function readRefGrants() {
    try {
        var list = JSON.parse(PropertiesService.getScriptProperties().getProperty(GAME_GRANT_PROP) || '[]');
        var cut = Date.now() - GAME_GRANT_DAYS * 86400000;
        return list.filter(function(g) { return g && g.at > cut; });
    } catch (e) { return []; }
}
function handleGameAdmin(data) {
    try {
        if (getAdminLevel(data.adminToken) !== 'super') {
            return buildJson({ success: false, code: 'SUPER_REQUIRED', error: '슈퍼 관리자만 사용할 수 있습니다.' + (ADMIN_CHECK_WHY ? ' [' + ADMIN_CHECK_WHY + ']' : '') });
        }
        var sheet = getGameSheet();
        var last = sheet.getLastRow();
        var values = last >= 2 ? sheet.getRange(2, 1, last - 1, GAME_HEADERS.length).getValues() : [];
        var act = data.action;

        if (act === 'gameAdminEvent') {
            var props = PropertiesService.getScriptProperties();
            if (!data.ev) { props.deleteProperty(GAME_EVENT_PROP); return buildJson({ success: true, message: '돌발 이벤트를 껐습니다.' }); }
            var mins = Math.min(Math.max(Number(data.minutes) || 30, 1), 24 * 60);
            var from = Number(data.from) || Date.now();
            if (from < Date.now() - 60000) from = Date.now();                       // 과거 시각이면 지금부터
            if (from > Date.now() + 14 * 86400000) return buildJson({ success: false, error: '시작 시각은 2주 안으로 정해주세요.' });
            var rec = { ev: String(data.ev), from: from, until: from + mins * 60000 };
            props.setProperty(GAME_EVENT_PROP, JSON.stringify(rec));
            var when = Utilities.formatDate(new Date(from), 'Asia/Seoul', 'M/d HH:mm');
            return buildJson({ success: true, message: (from > Date.now() + 60000 ? when + '부터 ' : '지금부터 ') + mins + '분 동안 돌발 이벤트를 겁니다.', forcedEvent: rec });
        }
        if (act === 'gameAdminGrant') {
            var cnt = Math.floor(Number(data.count) || 0);
            if (cnt < 1 || cnt > 500) return buildJson({ success: false, error: '지급 장수는 1~500장으로 정해주세요.' });
            var gp = PropertiesService.getScriptProperties();
            var list = readRefGrants();
            var g = { id: Utilities.getUuid().slice(0, 8), count: cnt, at: Date.now(), msg: String(data.msg || '').slice(0, 40) };
            list.push(g);
            gp.setProperty(GAME_GRANT_PROP, JSON.stringify(list.slice(-20)));
            return buildJson({ success: true, message: '전원에게 추천서 ' + cnt + '장을 지급했습니다. (접속할 때 받음, ' + GAME_GRANT_DAYS + '일 동안 유효)', refGrants: list });
        }
        if (act === 'gameAdminBackup') return buildJson({ success: true, message: backupGameRanking() });

        if (act === 'gameAdminResetAll') {
            resetGameRanking();
            return buildJson({ success: true, message: '랭킹을 초기화했습니다. 기존 기록은 백업 시트로 남아 있습니다.' });
        }

        if (act === 'gameAdminList') {
            var list = values.map(function(r, i) {
                var st = gameReadState(r) || {};
                var runs = st.runs || [];
                var done = 0, hired = 0;
                for (var k = 0; k < runs.length; k++) { if (runs[k]) { hired++; if (runs[k].done) done++; } }
                return {
                    row: i + 2, playerId: String(r[0]), nickname: String(r[1]),
                    stage: Number(r[2]) || 1, level: Number(r[3]) || 1, total: Number(r[4]) || 0,
                    saved: r[6] ? String(r[6]) : '', created: r[7] ? String(r[7]) : '',
                    tier: Number(st.tier) || 0, hired: hired, done: done,
                    stairs: Number(st.stairsBest) || 0, suika: Number(st.suikaBest) || 0, tetris: Number(st.tetrisBest) || 0
                };
            });
            list.sort(function(a, b) { return (b.done - a.done) || (b.level - a.level) || (b.stage - a.stage); });
            return buildJson({ success: true, players: list, forcedEvent: readForcedEvent(), refGrants: readRefGrants() });
        }

        // 아래는 특정 플레이어 대상 — 행이 밀렸을 수 있으므로 playerId로 다시 찾는다
        var pid = String(data.playerId || '');
        var idx = gameFindRow(values, pid);
        if (idx < 0) return buildJson({ success: false, error: '그 플레이어를 찾을 수 없습니다. 목록을 새로고침해주세요.' });
        var nickname = String(values[idx][1]);

        if (act === 'gameAdminUnlock') {
            var cache = CacheService.getScriptCache();
            cache.remove('gmfail_' + gameHash(gameNickKey(nickname)).substring(0, 32));
            return buildJson({ success: true, message: nickname + ' 님의 PIN 잠금을 풀었습니다.' });
        }

        var lock = LockService.getScriptLock();
        lock.waitLock(20000);
        try {
            if (act === 'gameAdminDelete') {
                sheet.deleteRow(idx + 2);
                return buildJson({ success: true, message: nickname + ' 님의 계정을 삭제했습니다.' });
            }
            if (act === 'gameAdminReset') {
                // 닉네임·PIN은 두고 진행만 처음으로 — 세션 토큰을 비워 지금 켜 둔 기기는 자동 로그아웃
                sheet.getRange(idx + 2, 3, 1, 5).setValues([[1, 1, 0, '', Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss')]]);
                sheet.getRange(idx + 2, 10).setValue('');
                return buildJson({ success: true, message: nickname + ' 님의 진행을 처음으로 되돌렸습니다.' });
            }
        } finally {
            lock.releaseLock();
        }
        return buildJson({ success: false, error: '알 수 없는 관리 요청입니다: ' + act });
    } catch (err) {
        return buildJson({ success: false, error: err.message });
    }
}
// ===== 랭킹 (v2.51.1 빠르게) =====
// 한 번 시트를 읽을 때 7개 판을 모두 만들어 캐시에 같이 넣음 → 다른 탭도 시트를 다시 안 읽음.
// 캐시를 시트보다 먼저 봄(예전엔 시트를 다 읽은 뒤에 캐시를 봐서 캐시가 있어도 0.6초쯤 더 걸렸음).
// board='all'이면 7개 판을 한 번에 돌려줌 → 앱은 탭을 눌러도 기다리지 않음
var RANK_BOARDS = ['promo', 'stairs', 'suika', 'tetris', 'block', 'onecard', 'battleship'];
var RANK_TTL = 60;
function rankBuildAll(values) {
    var oc = ocLoadStats(), bs = bsLoadStats(), out = {};
    var base = values.filter(function(r) { return r[0] && r[1]; }).map(function(r) {
        var s = gameReadState(r) || {}, id = String(r[0]);
        return { pid: id, nickname: String(r[1]), ch: Number(s.top) || 0, tier: Number(s.tier) || 0, stage: Number(r[2]) || 1, level: Number(r[3]) || 1, total: Number(r[4]) || 0,
            stairs: Number(s.stairsBest) || 0, suika: Number(s.suikaBest) || 0, tetris: Number(s.tetrisBest) || 0, block: Number(s.bbBest) || 0,
            ocW: (oc[id] || {}).w || 0, ocG: (oc[id] || {}).g || 0, bsW: (bs[id] || {}).w || 0, bsG: (bs[id] || {}).g || 0 };
    });
    var pick = function(x, keys) { var o = { pid: x.pid, nickname: x.nickname, ch: x.ch, tier: x.tier }; keys.forEach(function(k) { o[k] = x[k]; }); return o; };
    out.promo = base.slice().sort(function(a, b) { return (b.tier - a.tier) || (b.stage - a.stage) || (b.level - a.level) || (b.total - a.total); })
        .map(function(x) { return pick(x, ['stage', 'level']); });
    ['stairs', 'suika', 'tetris', 'block'].forEach(function(k) {
        out[k] = base.filter(function(x) { return x[k] > 0; }).sort(function(a, b) { return b[k] - a[k]; }).map(function(x) { return pick(x, [k]); });
    });
    // 원카드·해전: 같이 하기 전적(서버 기록) — 승리 수 → 승률 → 판 수 적은 순. 화면은 onecard(승)·ocGames(판) 이름을 씀
    [['onecard', 'ocW', 'ocG'], ['battleship', 'bsW', 'bsG']].forEach(function(d) {
        out[d[0]] = base.filter(function(x) { return x[d[2]] > 0; })
            .sort(function(a, b) { return (b[d[1]] - a[d[1]]) || (b[d[1]] / b[d[2]] - a[d[1]] / a[d[2]]) || (a[d[2]] - b[d[2]]); })
            .map(function(x) { var o = pick(x, []); o.onecard = x[d[1]]; o.ocGames = x[d[2]]; o[d[0]] = x[d[1]]; return o; });
    });
    return out;
}
function rankLoadAll() { // 캐시 → 없으면 시트 한 번 읽어 7개 다 만들고 캐시
    var cache = CacheService.getScriptCache(), keys = RANK_BOARDS.map(function(b) { return 'gmrank_' + b; });
    var got = cache.getAll(keys), all = {}, miss = false;
    RANK_BOARDS.forEach(function(b) { try { all[b] = JSON.parse(got['gmrank_' + b] || 'null'); } catch (e) { all[b] = null; } if (!all[b]) miss = true; });
    if (!miss) return all;
    var sheet = getGameSheet(), last = sheet.getLastRow();
    all = rankBuildAll(last >= 2 ? sheet.getRange(2, 1, last - 1, GAME_HEADERS.length).getValues() : []);
    var put = {}; RANK_BOARDS.forEach(function(b) { put['gmrank_' + b] = JSON.stringify(all[b]); });
    try { cache.putAll(put, RANK_TTL); } catch (e) { /* 너무 크면 캐시 없이 */ }
    return all;
}
function rankView(list, board, playerId) {
    var meIdx = rankOfPid(list, playerId), me = meIdx ? list[meIdx - 1] : null;
    var v = { players: list.length, myRank: meIdx, top: list.slice(0, 10).map(function(x) { return stripPid(x, playerId); }) };
    if (board === 'onecard' || board === 'battleship') v.mine = me ? { w: me.onecard, g: me.ocGames } : { w: 0, g: 0 };
    return v;
}
function handleGameRanking(data) {
    var playerId = String(data.playerId || ''), all = rankLoadAll();
    if (data.board === 'all') {
        var boards = {}; RANK_BOARDS.forEach(function(b) { boards[b] = rankView(all[b], b, playerId); });
        return buildJson({ success: true, boards: boards });
    }
    var board = RANK_BOARDS.indexOf(data.board) >= 0 ? data.board : 'promo';
    var v = rankView(all[board], board, playerId); v.success = true;
    return buildJson(v);
}
function handleGameAction(data) {
    try {
        if (data.action === 'gameRanking') return handleGameRanking(data); // 시트를 열기 전에 — 캐시가 있으면 시트를 안 읽음
        var sheet = getGameSheet();
        var readValues = function() {
            var last = sheet.getLastRow();
            return last >= 2 ? sheet.getRange(2, 1, last - 1, GAME_HEADERS.length).getValues() : [];
        };
        var values = readValues();
        var playerId = String(data.playerId || '');
        var token = String(data.token || '');

        // 닉네임 + PIN — 없는 닉네임이면 새로 가입, 있으면 PIN 확인 후 이어하기
        if (data.action === 'gameLogin') {
            var nickname = normalizeChecklistLocation(data.nickname).substring(0, 12);
            var pin = String(data.pin || '');
            if (!nickname) return buildJson({ success: false, error: '닉네임을 입력해주세요.' });
            if (!/^\d{4,6}$/.test(pin)) return buildJson({ success: false, error: 'PIN은 숫자 4~6자리로 입력해주세요.' });
            var key = gameNickKey(nickname);
            var cache = CacheService.getScriptCache(), failKey = 'gmfail_' + gameHash(key).substring(0, 32);
            var fails = Number(cache.get(failKey) || 0);
            if (fails >= GAME_PIN_MAX_FAIL) return buildJson({ success: false, error: 'PIN을 여러 번 틀려서 10분 동안 로그인할 수 없습니다.' });
            var lock = LockService.getScriptLock();
            lock.waitLock(20000);
            try {
                values = readValues(); // 같은 닉네임 동시 가입 방지 — 잠근 뒤 다시 읽음
                var at = -1;
                for (var i = 0; i < values.length; i++) if (gameNickKey(values[i][1]) === key) { at = i; break; }
                if (at < 0) {
                    var id = gameNewId(), tok = gameNewId();
                    var now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
                    sheet.getRange(sheet.getLastRow() + 1, 1, 1, GAME_HEADERS.length)
                        .setValues([[id, nickname, 1, 1, 0, '', now, now, gameHash(id + ':' + pin), tok]]);
                    return buildJson({ success: true, created: true, playerId: id, token: tok, nickname: nickname, state: null, forcedEvent: readForcedEvent(), refGrants: readRefGrants() });
                }
                var row = values[at], rowId = String(row[0]);
                if (!row[8]) return buildJson({ success: false, error: '이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해주세요.' });
                if (gameHash(rowId + ':' + pin) !== String(row[8])) {
                    cache.put(failKey, String(fails + 1), GAME_PIN_LOCK_SEC);
                    return buildJson({ success: false, error: '이미 사용 중인 닉네임이거나 PIN이 틀렸습니다. (' + (GAME_PIN_MAX_FAIL - fails - 1) + '번 남음)' });
                }
                cache.remove(failKey);
                // 로그인할 때마다 새 토큰 — 예전 기기의 토큰은 무효가 되어 그 기기는 더 이상 저장할 수 없음(동시 접속 덮어쓰기·백섭 방지)
                var t = gameNewId();
                sheet.getRange(at + 2, 10).setValue(t);
                return buildJson({ success: true, created: false, playerId: rowId, token: t, nickname: String(row[1]), state: gameReadState(row), forcedEvent: readForcedEvent(), refGrants: readRefGrants() });
            } finally {
                lock.releaseLock();
            }
        }

        if (!/^[A-Za-z0-9-]{16,64}$/.test(playerId)) return buildJson({ success: false, error: '플레이어 정보가 올바르지 않습니다.' });
        var idx = gameFindRow(values, playerId);
        // PIN 계정은 세션 토큰이 맞아야 불러오기/저장 가능. PIN 없는 예전 행은 예전 앱(토큰 없음)이 랭킹 초기화 전까지 계속 쓸 수 있게 둠
        var legacy = idx >= 0 && !values[idx][8];
        if (idx >= 0 && !legacy && String(values[idx][9]) !== token) return buildJson({ success: false, auth: false, code: 'OTHER_DEVICE', error: '다른 기기에서 로그인되어 로그아웃되었습니다.' });
        if (idx < 0 && token) return buildJson({ success: false, auth: false, error: '계정을 찾을 수 없습니다. 다시 로그인해주세요.' });

        if (data.action === 'gameLoad') {
            if (idx < 0) return buildJson({ success: true, found: false, forcedEvent: readForcedEvent(), refGrants: readRefGrants() });
            var saved = gameReadState(values[idx]);
            return buildJson({ success: true, found: !!saved, nickname: String(values[idx][1]), state: saved, forcedEvent: readForcedEvent(), refGrants: readRefGrants() });
        }

        // gameSave — 새 행은 로그인(gameLogin)으로만 만들어짐. 닉네임은 가입할 때 정한 것을 유지
        if (idx < 0) return buildJson({ success: false, error: '저장할 계정이 없습니다.' });
        var stateStr = String(data.state || '');
        if (stateStr.length > 8000) return buildJson({ success: false, error: '저장 데이터가 너무 큽니다.' });
        var state;
        try { state = JSON.parse(stateStr); } catch (e) { return buildJson({ success: false, error: '저장 데이터 형식 오류' }); }
        var saveNow = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
        var saveLock = LockService.getScriptLock();
        saveLock.waitLock(20000);
        try {
            sheet.getRange(idx + 2, 3, 1, 5).setValues([[Number(state.stage) || 1, Number(state.lv) || 1, Math.floor(Number(state.totalGold) || 0), stateStr, saveNow]]);
        } finally {
            saveLock.releaseLock();
        }
        return buildJson({ success: true, savedAt: saveNow, forcedEvent: readForcedEvent(), refGrants: readRefGrants() });
    } catch (err) {
        return buildJson({ success: false, error: err.message });
    }
}

// ===== 원카드 규칙 엔진 — easterEgg.js(혼자 하기)와 googleDriveEasterEgg.js(같이 하기 서버)에 똑같은 코드. 고칠 땐 둘 다 =====
// 카드: 'S10','HA','DK'… (S♠ H♥ D♦ C♣), 조커 'BJ'(흑백) 'CJ'(컬러)
// 공격: 2 +2 · A +3 · 흑백조커 +5 · 컬러조커 +7 — 같거나 센 공격 카드(같은 무늬·숫자, 조커는 아무 때나)로 막아 넘기거나 쌓인 만큼 먹음
// J 다음 사람 건너뛰기 · Q 방향 바꾸기 · K 한 번 더 · 7 무늬 바꾸기 · 조커 다음은 아무 카드나
// 패가 1장 남으면 "원카드!" — 본인이 먼저 외치면 안전, 남이 먼저 외치면 1장 먹음. 20장 이상이면 파산(탈락)
var OC_SUITS = ['S', 'H', 'D', 'C'];
var OC_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
var OC_SUIT_NAME = { S: '♠', H: '♥', D: '♦', C: '♣', '*': '아무거나' };
var OC_START = 7, OC_BUST = 20, OC_ONE_MS = 2500, OC_AI_MS = 1100, OC_TURN_MS = 30000;
function ocShuffle(d) { for (var i = d.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = d[i]; d[i] = d[j]; d[j] = t; } return d; }
function ocDeck() { var d = []; OC_SUITS.forEach(function(s) { OC_RANKS.forEach(function(r) { d.push(s + r); }); }); d.push('BJ', 'CJ'); return ocShuffle(d); }
function ocJoker(c) { return c === 'BJ' || c === 'CJ'; }
function ocSuit(c) { return ocJoker(c) ? '*' : c.charAt(0); }
function ocRank(c) { return ocJoker(c) ? c : c.slice(1); }
function ocPower(c) { var r = ocRank(c); return r === '2' ? 2 : r === 'A' ? 3 : r === 'BJ' ? 5 : r === 'CJ' ? 7 : 0; }
function ocName(c) { return c === 'BJ' ? '흑백 조커' : c === 'CJ' ? '컬러 조커' : OC_SUIT_NAME[ocSuit(c)] + ocRank(c); }
function ocTop(s) { return s.pile[s.pile.length - 1]; }
function ocAlive(s) { var a = []; s.players.forEach(function(p, i) { if (!p.out) a.push(i); }); return a; }
function ocLog(s, t) { s.log.push(t); if (s.log.length > 6) s.log.shift(); }
// players: [{name, face, ai, key}]
function ocNew(players, now) {
    var s = { players: players.map(function(p) { return { name: p.name, face: p.face, ai: !!p.ai, key: p.key || '', hand: [], out: false }; }),
        deck: ocDeck(), pile: [], suit: '', dir: 1, turn: 0, attack: 0, atkPow: 0, winner: -1, one: null, log: [], ver: 1, aiAt: 0, turnAt: now };
    for (var k = 0; k < OC_START; k++) s.players.forEach(function(p) { p.hand.push(s.deck.pop()); });
    var top = null;
    while (!top) { top = s.deck.pop(); if (ocPower(top) || /^(7|J|Q|K|BJ|CJ)$/.test(ocRank(top))) { s.deck.unshift(top); top = null; } } // 첫 장은 평범한 숫자 카드
    s.pile.push(top); s.suit = ocSuit(top);
    s.turn = Math.floor(Math.random() * s.players.length);
    ocLog(s, '게임 시작! ' + s.players[s.turn].name + ' 먼저');
    ocAfterTurn(s, now);
    return s;
}
function ocCanPlay(s, c) {
    var top = ocTop(s), joker = ocJoker(c);
    if (s.attack > 0) {
        var p = ocPower(c);
        if (!p || p < s.atkPow) return false;
        return joker || s.suit === '*' || ocSuit(c) === s.suit || ocRank(c) === ocRank(top);
    }
    if (joker || s.suit === '*') return true;
    return ocSuit(c) === s.suit || ocRank(c) === ocRank(top);
}
function ocNext(s, from, step) {
    var n = s.players.length, i = from;
    for (var k = 0; k < (step || 1); k++) { var g = 0; do { i = (i + s.dir + n) % n; } while (s.players[i].out && g++ < n); }
    return i;
}
function ocDraw1(s) {
    if (!s.deck.length) { var top = s.pile.pop(); s.deck = ocShuffle(s.pile); s.pile = [top]; }
    return s.deck.length ? s.deck.pop() : null;
}
function ocAfterTurn(s, now) { s.ver++; s.turnAt = now; s.aiAt = now + (s.players[s.turn].ai ? OC_AI_MS : 0); }
function ocBust(s, pi) {
    var p = s.players[pi];
    if (p.hand.length < OC_BUST || p.out) return;
    p.out = true; p.bust = p.hand.length; ocLog(s, '💥 ' + p.name + ' 파산! (' + p.hand.length + '장)');
    s.deck = ocShuffle(s.deck.concat(p.hand)); p.hand = [];                 // 파산한 사람 카드는 다시 덱으로
    var alive = ocAlive(s);
    if (alive.length === 1) { s.winner = alive[0]; ocLog(s, '🏆 ' + s.players[s.winner].name + ' 승리!'); }
}
function ocOneAi(s, owner, now) {
    var r = {};
    s.players.forEach(function(p, i) { if (p.ai && !p.out) r[i] = now + (i === owner ? 500 + Math.random() * 1500 : 900 + Math.random() * 2600); });
    return r;
}
function ocPlay(s, pi, c, chosen, now) {
    var p = s.players[pi];
    if (s.winner >= 0 || s.turn !== pi) return '내 차례가 아닙니다';
    var h = p.hand.indexOf(c);
    if (h < 0 || !ocCanPlay(s, c)) return '낼 수 없는 카드입니다';
    p.hand.splice(h, 1); s.pile.push(c);
    var r = ocRank(c), pw = ocPower(c), step = 1, again = false;
    s.suit = ocSuit(c);
    if (pw) { s.attack += pw; s.atkPow = pw; }
    if (r === '7') s.suit = OC_SUITS.indexOf(chosen) >= 0 ? chosen : s.suit;
    else if (r === 'J') step = 2;
    else if (r === 'Q') { s.dir *= -1; if (ocAlive(s).length === 2) step = 2; }
    else if (r === 'K') again = true;
    ocLog(s, p.name + ' ▶ ' + ocName(c) + (r === '7' ? ' (' + OC_SUIT_NAME[s.suit] + '로)' : pw ? ' 공격 +' + s.attack : r === 'J' ? ' 건너뛰기' : r === 'Q' ? ' 방향 전환' : r === 'K' ? ' 한 번 더' : ''));
    if (!p.hand.length) { s.winner = pi; s.one = null; ocLog(s, '🏆 ' + p.name + ' 승리!'); s.ver++; return ''; }
    if (p.hand.length === 1) s.one = { p: pi, until: now + OC_ONE_MS, ai: ocOneAi(s, pi, now) };
    if (!again) s.turn = ocNext(s, pi, step);
    ocAfterTurn(s, now);
    return '';
}
function ocTake(s, pi, now) {
    var p = s.players[pi];
    if (s.winner >= 0 || s.turn !== pi) return '내 차례가 아닙니다';
    var n = s.attack > 0 ? s.attack : 1;
    var got = 0;
    for (var i = 0; i < n; i++) { var c = ocDraw1(s); if (c) { p.hand.push(c); got++; } }
    s.stall = got ? 0 : (s.stall || 0) + 1;
    ocLog(s, p.name + ' ' + n + '장 먹음' + (s.attack > 0 ? ' 💢' : ''));
    s.attack = 0; s.atkPow = 0;
    if (s.one && s.one.p === pi) s.one = null;
    ocBust(s, pi);
    if (s.winner < 0 && s.stall >= ocAlive(s).length * 2) {                  // 아무도 못 내고 덱도 비면 패가 가장 적은 사람 승리
        var al = ocAlive(s); s.winner = al.reduce(function(a, b) { return s.players[b].hand.length < s.players[a].hand.length ? b : a; }, al[0]);
        ocLog(s, '🃏 더 낼 카드가 없어 패가 가장 적은 ' + s.players[s.winner].name + ' 승리!');
    }
    if (s.winner < 0) s.turn = ocNext(s, pi, 1);
    ocAfterTurn(s, now);
    return '';
}
// 원카드 외치기 — 본인이면 안전, 남이면 본인이 1장 먹음
function ocCall(s, caller, now) {
    var o = s.one; if (!o || s.winner >= 0) return;
    if (!s.players[caller] || s.players[caller].out) return; // 파산한 사람은 원카드·저격 불가
    if (caller === o.p) ocLog(s, '☝ ' + s.players[o.p].name + ' 원카드!');
    else { var p = s.players[o.p], c = ocDraw1(s); if (c) p.hand.push(c); ocLog(s, '🚨 ' + s.players[caller].name + ' 원카드 저격! ' + p.name + ' +1장'); }
    s.one = null; s.ver++;
}
function ocAiMove(s, pi) {
    var h = s.players[pi].hand, ok = h.filter(function(c) { return ocCanPlay(s, c); });
    if (!ok.length) return null;
    var nextN = s.players[ocNext(s, pi, 1)].hand.length;
    function score(c) {
        var pw = ocPower(c), r = ocRank(c);
        if (s.attack > 0) return -pw;                       // 막을 때는 약한 카드부터
        var v = 0;
        if (pw) v += nextN <= 3 ? 40 : -12;                 // 다음 사람 패가 적으면 공격
        if (ocJoker(c)) v -= 25;                            // 조커는 아껴 둠
        if (r === '7') v -= 6;
        if (r === 'K' || r === 'J') v += 6;
        v += h.filter(function(x) { return ocSuit(x) === ocSuit(c); }).length * 3;
        return v + Math.random() * 4;
    }
    ok.sort(function(a, b) { return score(b) - score(a); });
    var c = ok[0], su = '';
    if (ocRank(c) === '7') {
        var cnt = {}; h.forEach(function(x) { if (x !== c && !ocJoker(x)) cnt[ocSuit(x)] = (cnt[ocSuit(x)] || 0) + 1; });
        su = Object.keys(cnt).sort(function(a, b) { return cnt[b] - cnt[a]; })[0] || 'S';
    }
    return { c: c, s: su };
}
// 시간 흐름 — 원카드 판정(컴퓨터 반응), 컴퓨터 차례, 사람 시간 초과(timeoutMs가 있을 때만)
function ocTick(s, now, timeoutMs) {
    if (s.winner >= 0) return;
    if (s.one) {
        var best = -1, bt = Infinity;
        for (var k in s.one.ai) if (!s.players[+k].out && s.one.ai[k] <= now && s.one.ai[k] < bt) { bt = s.one.ai[k]; best = +k; }
        if (best >= 0) ocCall(s, best, now);
        else if (now > s.one.until) { s.one = null; s.ver++; }
    }
    var cur = s.players[s.turn];
    if (cur.ai && now >= s.aiAt) {
        var mv = ocAiMove(s, s.turn);
        if (mv) ocPlay(s, s.turn, mv.c, mv.s, now); else ocTake(s, s.turn, now);
    } else if (!cur.ai && timeoutMs && now - s.turnAt > timeoutMs) {
        ocLog(s, '⏰ ' + cur.name + ' 시간 초과'); ocTake(s, s.turn, now);
    }
}
// 한 사람에게 보여줄 화면 — 남의 패는 장수만
function ocView(s, pi, now) {
    return { me: pi, ver: s.ver, top: ocTop(s), suit: s.suit, dir: s.dir, turn: s.turn, attack: s.attack, atkPow: s.atkPow, winner: s.winner, deck: s.deck.length,
        hand: pi >= 0 ? s.players[pi].hand.slice() : [], log: s.log.slice(),
        one: s.one ? { p: s.one.p, left: Math.max(0, s.one.until - now) } : null,
        turnLeft: Math.max(0, OC_TURN_MS - (now - s.turnAt)),
        players: s.players.map(function(p) { return { name: p.name, face: p.face, ai: p.ai, n: p.out ? (p.bust || 0) : p.hand.length, out: p.out }; }) };
}
// ===== 원카드 규칙 엔진 끝 =====

// ===== 원카드 같이 하기 (방) =====
// 방 상태는 CacheService(최대 6시간)에 보관 — 시트는 쓰지 않음. 참가할 때만 시트로 계정(토큰)을 확인하고,
// 그 뒤로는 방에서 받은 자리 키(seatKey)로만 요청. 판정은 서버의 규칙 엔진(위 원카드 엔진)이 하고, 남의 패는 장수만 보냄.
// 앱은 1.5초마다 ocState로 확인 → 그때 컴퓨터 차례·원카드 판정·시간 초과도 서버가 진행
var OC_ROOM_TTL = 21600, OC_LOBBY_KEY = 'oc_lobby', OC_MAX = 4, OC_ROOM_IDLE = 15 * 60000;
function ocCache() { return CacheService.getScriptCache(); }
function ocLoadRoom(id) { try { var raw = ocCache().get('oc_r_' + id); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
function ocSaveRoom(room) { room.at = Date.now(); ocCache().put('oc_r_' + room.id, JSON.stringify(room), OC_ROOM_TTL); }
function ocLobbyIds() { try { return JSON.parse(ocCache().get(OC_LOBBY_KEY) || '[]'); } catch (e) { return []; } }
function ocSetLobby(ids) { ocCache().put(OC_LOBBY_KEY, JSON.stringify(ids.slice(-30)), OC_ROOM_TTL); }
function ocNewKey() { return Utilities.getUuid().replace(/-/g, '').slice(0, 20); }
// 대기실 유령 정리 — 대기실 화면은 1.5초마다 ocState를 보내므로, 1분 넘게 소식 없는 자리는 창을 닫고 나간 것으로 봄
var OC_SEAT_IDLE = 60000;
function ocSeatAlive(room, x, now) { return now - (x.seen || room.at || 0) < OC_SEAT_IDLE; }
var OC_SEEN_WRITE = 15000; // 대기실 '살아 있음' 기록은 15초에 한 번만(매번 쓰면 잠금을 잡아야 해서)
function ocAliveCopy(room, si, now) { // 저장하지 않고 유령 자리만 뺀 사본 — 잠금 없는 확인 응답용
    var c = JSON.parse(JSON.stringify(room));
    c.seats = c.seats.filter(function(x, k) { return k === si || ocSeatAlive(room, x, now); });
    return c;
}
// 같이 하기 전적 — 브라우저가 아니라 서버가 직접 기록(랭킹 조작 방지). { pid: {w: 승, g: 판} }
function ocLoadStats() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('OC_STATS') || '{}'); } catch (e) { return {}; } }
function ocRecord(rm) { // 끝난 판을 한 번만 기록. 잠금 안에서만 부름. 중간에 나간 사람은 패
    if (!rm.state || rm.state.winner < 0 || rm.recorded) return false;
    rm.recorded = true;
    var stats = ocLoadStats();
    rm.seats.forEach(function(x, k) {
        if (!x.pid || x.counted) return; // 중간에 나간 사람은 나갈 때 이미 패로 기록함
        var r = stats[x.pid] || { w: 0, g: 0 };
        r.g++; if (k === rm.state.winner && !x.left) r.w++;
        stats[x.pid] = r;
    });
    PropertiesService.getScriptProperties().setProperty('OC_STATS', JSON.stringify(stats));
    return true;
}
function ocSeatIndex(room, key) { for (var i = 0; i < room.seats.length; i++) if (room.seats[i].key === key) return i; return -1; }
// 게임 중 이모지 — 정해진 8개 중 번호만 받음(아무 글자나 못 보내게). 자리마다 1.2초에 한 번, 최근 8개만 6초 동안 보여 줌
var OC_EMOTE_N = 8, OC_EMOTE_GAP = 1200, OC_EMOTE_SHOW = 6000;
function ocEmotes(room, now) { return (room.emo || []).filter(function(x) { return now - x.at < OC_EMOTE_SHOW; }); }
function ocRoomInfo(room) {
    return { id: room.id, title: room.title, host: room.seats.length ? room.seats[0].nick : '', started: !!room.state, ended: !!(room.state && room.state.winner >= 0),
        seats: room.seats.map(function(x) { return { nick: x.nick, face: x.face, left: !!x.left }; }) };
}
// 계정 확인 — 게임 시트에서 playerId·토큰이 맞는지 (방 만들기·참가 때만)
function ocCheckPlayer(data) {
    var sheet = getGameSheet(), last = sheet.getLastRow();
    var values = last >= 2 ? sheet.getRange(2, 1, last - 1, GAME_HEADERS.length).getValues() : [];
    var idx = gameFindRow(values, String(data.playerId || ''));
    if (idx < 0 || String(values[idx][9]) !== String(data.token || '')) return null;
    return { pid: String(values[idx][0]), nick: String(values[idx][1]) };
}
function handleOneCard(data) {
    var act = data.action, now = Date.now();
    var lock = LockService.getScriptLock();
    try {
        if (act === 'ocLobby') {
            var list = [];
            ocLobbyIds().forEach(function(id) { var r = ocLoadRoom(id);
                if (r && !r.state && r.seats.length && now - r.at < OC_ROOM_IDLE && r.seats.some(function(x) { return ocSeatAlive(r, x, now); })) list.push(ocRoomInfo(r)); });
            return buildJson({ success: true, rooms: list });
        }
        if (act === 'ocCreate' || act === 'ocJoin') {
            var who = ocCheckPlayer(data);
            if (!who) return buildJson({ success: false, auth: false, error: '다시 로그인해주세요.' });
            lock.waitLock(15000);
            var room, key = ocNewKey(), face = Math.max(0, Math.min(7, Number(data.face) || 0));
            if (act === 'ocCreate') {
                room = { id: ocNewKey().slice(0, 8), title: String(data.title || who.nick + '의 방').slice(0, 20), seats: [], state: null, at: now };
                var ids = ocLobbyIds(); ids.push(room.id); ocSetLobby(ids);
            } else {
                room = ocLoadRoom(String(data.room || ''));
                if (!room) return buildJson({ success: false, error: '방이 없어졌습니다.' });
                if (room.state) return buildJson({ success: false, error: '이미 시작한 방입니다.' });
                var mine = room.seats.filter(function(x) { return x.pid === who.pid; })[0];
                if (mine) { ocSaveRoom(room); return buildJson({ success: true, room: ocRoomInfo(room), key: mine.key, seat: ocSeatIndex(room, mine.key) }); }
                if (room.seats.length >= OC_MAX) return buildJson({ success: false, error: '방이 꽉 찼습니다.' });
            }
            room.seats.push({ key: key, pid: who.pid, nick: who.nick, face: face, seen: now });
            ocSaveRoom(room);
            return buildJson({ success: true, room: ocRoomInfo(room), key: key, seat: room.seats.length - 1 });
        }
        // 아래는 방 안 요청 — 자리 키로 확인
        if (act === 'ocState') { // 대부분의 확인 요청은 바꿀 게 없음 → 잠금 없이 읽기만(점검표 제출·저장과 같은 잠금을 덜 씀)
            var fr = ocLoadRoom(String(data.room || ''));
            if (!fr) return buildJson({ success: false, gone: true, error: '방이 없어졌습니다.' });
            var fi = ocSeatIndex(fr, String(data.key || ''));
            if (fi < 0) return buildJson({ success: false, gone: true, error: '이 방의 참가자가 아닙니다.' });
            if (fr.state) {
                var fv = fr.state.ver;
                for (var ft = 0; ft < 4; ft++) ocTick(fr.state, now, OC_TURN_MS); // 시험 삼아 진행 — 바뀌면 버리고 아래 잠금 경로에서 다시
                if (fr.state.ver === fv && !(fr.state.winner >= 0 && !fr.recorded))
                    return buildJson({ success: true, room: ocRoomInfo(fr), view: ocView(fr.state, fi, now), emo: ocEmotes(fr, now) });
            } else if (now - (fr.seats[fi].seen || 0) < OC_SEEN_WRITE) {
                var fc = ocAliveCopy(fr, fi, now);
                return buildJson({ success: true, room: ocRoomInfo(fc), seat: ocSeatIndex(fc, String(data.key || '')) });
            }
        }
        lock.waitLock(15000);
        var rm = ocLoadRoom(String(data.room || ''));
        if (!rm) return buildJson({ success: false, gone: true, error: '방이 없어졌습니다.' });
        var si = ocSeatIndex(rm, String(data.key || ''));
        if (si < 0) return buildJson({ success: false, gone: true, error: '이 방의 참가자가 아닙니다.' });
        if (!rm.state) { // 대기실: 나는 살아 있음 표시, 오래 조용한 자리는 비움(방장이 나가면 다음 사람이 방장)
            rm.seats[si].seen = now;
            rm.seats = rm.seats.filter(function(x, k) { return k === si || ocSeatAlive(rm, x, now); });
            si = ocSeatIndex(rm, String(data.key || ''));
        }
        if (act === 'ocLeave') {
            if (!rm.state) { rm.seats.splice(si, 1); if (!rm.seats.length) { ocCache().remove('oc_r_' + rm.id); return buildJson({ success: true }); } }
            else { rm.seats[si].left = true;
                if (rm.state.winner < 0 && !rm.seats[si].counted && rm.seats[si].pid) { // 끝나기 전에 나가면 바로 패 기록(남은 사람이 없어 판이 안 끝나도 빠지지 않게)
                    var ocSt = ocLoadStats(), mr = ocSt[rm.seats[si].pid] || { w: 0, g: 0 }; mr.g++; ocSt[rm.seats[si].pid] = mr;
                    PropertiesService.getScriptProperties().setProperty('OC_STATS', JSON.stringify(ocSt)); rm.seats[si].counted = true; }
                var pl = rm.state.players[si]; if (pl && !pl.ai) { pl.ai = true; pl.name += '(컴퓨터)'; rm.state.aiAt = now; } } // 게임 중이면 컴퓨터가 이어받음
            ocSaveRoom(rm); return buildJson({ success: true });
        }
        if (act === 'ocStart') {
            if (si !== 0) return buildJson({ success: false, error: '방장만 시작할 수 있습니다.' });
            if (rm.state) return buildJson({ success: false, error: '이미 시작했습니다.' });
            var used = rm.seats.map(function(x) { return x.face; });
            var players = rm.seats.map(function(x) { return { name: x.nick, face: x.face, ai: false, key: x.key }; });
            var pool = [0, 1, 2, 3, 4, 5, 6, 7].filter(function(f) { return used.indexOf(f) < 0; });
            while (players.length < OC_MAX) { var f = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]; players.push({ name: OC_AI_NAMES[f], face: f, ai: true }); }
            rm.state = ocNew(players, now);
            ocSaveRoom(rm);
        }
        if (act === 'ocEmote') {
            var ei = Math.floor(Number(data.e));
            if (!rm.state || !(ei >= 0 && ei < OC_EMOTE_N)) return buildJson({ success: false });
            rm.emo = ocEmotes(rm, now);
            var lastMine = rm.emo.filter(function(x) { return x.s === si; }).pop();
            if (!lastMine || now - lastMine.at >= OC_EMOTE_GAP) {
                rm.emoN = (rm.emoN || 0) + 1;
                rm.emo.push({ id: rm.emoN, s: si, e: ei, at: now }); rm.emo = rm.emo.slice(-8);
                ocSaveRoom(rm);
            }
        }
        if (act === 'ocPlay' || act === 'ocTake' || act === 'ocCall') {
            if (!rm.state) return buildJson({ success: false, error: '아직 시작 전입니다.' });
            var err = act === 'ocPlay' ? ocPlay(rm.state, si, String(data.card || ''), String(data.suit || ''), now)
                    : act === 'ocTake' ? ocTake(rm.state, si, now) : (ocCall(rm.state, si, now), '');
            if (err) return buildJson({ success: false, error: err, view: ocView(rm.state, si, now) });
            ocSaveRoom(rm);
        }
        // ocState(그리고 위 요청의 응답) — 시간 흐름 진행 후 내 화면
        if (rm.state) {
            var v0 = rm.state.ver;
            for (var t = 0; t < 4; t++) ocTick(rm.state, now, OC_TURN_MS);   // 밀린 컴퓨터 차례를 조금씩 진행
            if (ocRecord(rm) || rm.state.ver !== v0) ocSaveRoom(rm);
            return buildJson({ success: true, room: ocRoomInfo(rm), view: ocView(rm.state, si, now), emo: ocEmotes(rm, now) });
        }
        if (act === 'ocState') ocSaveRoom(rm); // 대기실에 있다는 표시
        return buildJson({ success: true, room: ocRoomInfo(rm), seat: si });
    } catch (err) {
        return buildJson({ success: false, error: err.message });
    } finally {
        try { lock.releaseLock(); } catch (e) {}
    }
}
var OC_AI_NAMES = ['쉰동준', '쉰원철', '약옥녀', '삼용훈', '하달순', '쉰원옥', '천병돌', '육찬근'];

// ===== 해전(배틀쉽) 엔진 — 브라우저(easterEgg.js)와 GAS(googleDriveEasterEgg.js)에 똑같이 들어감. ES5만 사용 =====
// 8×8 바다에 배 4척(4·3·3·2칸). 서로 번갈아 한 칸씩 쏘고, 맞히면 한 번 더. 상대 배를 모두 가라앉히면 승리
// 칸 번호 = 행*8 + 열. 내가 쏜 기록(shots): 64글자 — '.' 안 쏨, 'o' 빗나감, 'x' 맞음, '#' 가라앉은 배
var BS_N = 8, BS_SHIPS = [4, 3, 3, 2], BS_AI_MS = 900, BS_PLACE_MS = 90000;
function bsEmpty() { var t = ''; for (var i = 0; i < BS_N * BS_N; i++) t += '.'; return t; }
function bsSet(str, i, ch) { return str.substr(0, i) + ch + str.substr(i + 1); }
// 배 = 칸 번호 목록. 가로/세로 일직선, 서로 겹치거나 붙지 않게(대각선 포함)
function bsShipCells(r, c, len, vert) { var a = []; for (var k = 0; k < len; k++) a.push((r + (vert ? k : 0)) * BS_N + c + (vert ? 0 : k)); return a; }
function bsFits(taken, cells, r, c, len, vert) {
    if (vert ? r + len > BS_N : c + len > BS_N) return false;
    for (var k = 0; k < cells.length; k++) if (taken[cells[k]]) return false;
    return true;
}
function bsMark(taken, cells) { // 배 칸과 그 둘레 한 칸을 막음
    cells.forEach(function(i) { var r = Math.floor(i / BS_N), c = i % BS_N;
        for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) { var rr = r + dr, cc = c + dc; if (rr >= 0 && rr < BS_N && cc >= 0 && cc < BS_N) taken[rr * BS_N + cc] = 1; } });
}
function bsRandomShips() {
    for (var tries = 0; tries < 200; tries++) {
        var taken = {}, ships = [], ok = true;
        for (var s = 0; s < BS_SHIPS.length && ok; s++) {
            var len = BS_SHIPS[s], placed = false;
            for (var t = 0; t < 100 && !placed; t++) {
                var vert = Math.random() < 0.5, r = Math.floor(Math.random() * BS_N), c = Math.floor(Math.random() * BS_N);
                var cells = bsShipCells(r, c, len, vert);
                if (bsFits(taken, cells, r, c, len, vert)) { bsMark(taken, cells); ships.push(cells); placed = true; }
            }
            if (!placed) ok = false;
        }
        if (ok) return ships;
    }
    return null;
}
// 받은 배치가 규칙에 맞는지(서버에서 꼭 확인)
function bsValidShips(ships) {
    if (!Array.isArray(ships) || ships.length !== BS_SHIPS.length) return false;
    var lens = ships.map(function(x) { return Array.isArray(x) ? x.length : 0; }).sort(function(a, b) { return b - a; });
    for (var i = 0; i < BS_SHIPS.length; i++) if (lens[i] !== BS_SHIPS[i]) return false;
    var taken = {};
    for (var s = 0; s < ships.length; s++) {
        var cells = ships[s].map(Number).slice().sort(function(a, b) { return a - b; });
        for (var k = 0; k < cells.length; k++) if (!(cells[k] >= 0 && cells[k] < BS_N * BS_N) || cells[k] !== Math.floor(cells[k])) return false;
        var r0 = Math.floor(cells[0] / BS_N), c0 = cells[0] % BS_N, vert = cells.length > 1 && cells[1] - cells[0] === BS_N;
        var want = bsShipCells(r0, c0, cells.length, vert);
        if (!bsFits(taken, want, r0, c0, cells.length, vert)) return false;
        for (k = 0; k < cells.length; k++) if (cells[k] !== want[k]) return false;
        bsMark(taken, want);
    }
    return true;
}
function bsLog(s, t) { s.log.push(t); if (s.log.length > 20) s.log.shift(); }
function bsNew(players, now) {
    var s = { phase: 'place', turn: 0, winner: -1, ver: 1, turnAt: now, aiAt: now + BS_AI_MS, last: null, log: [],
        players: players.map(function(p) { return { name: p.name, face: p.face, ai: !!p.ai, key: p.key || '', ships: null, ready: false, shots: bsEmpty(), hits: 0 }; }) };
    s.players.forEach(function(p) { if (p.ai) { p.ships = bsRandomShips(); p.ready = true; } });
    bsLog(s, '⚓ 배를 배치하세요');
    return s;
}
function bsPlace(s, pi, ships, now) {
    if (s.phase !== 'place') return '이미 시작했습니다.';
    var p = s.players[pi]; if (!p) return '자리가 없습니다.';
    if (!bsValidShips(ships)) return '배치가 올바르지 않습니다.';
    p.ships = ships.map(function(x) { return x.map(Number).sort(function(a, b) { return a - b; }); }); p.ready = true;
    s.ver++;
    if (s.players.every(function(q) { return q.ready; })) {
        s.phase = 'play'; s.turn = Math.floor(Math.random() * s.players.length); s.turnAt = now; s.aiAt = now + BS_AI_MS;
        bsLog(s, '🚩 ' + s.players[s.turn].name + ' 먼저 쏩니다');
    }
    return '';
}
function bsShipAt(p, cell) { for (var i = 0; i < p.ships.length; i++) if (p.ships[i].indexOf(cell) >= 0) return i; return -1; }
function bsSunk(shooter, ship) { for (var k = 0; k < ship.length; k++) if (shooter.shots.charAt(ship[k]) === '.' || shooter.shots.charAt(ship[k]) === 'o') return false; return true; }
function bsShoot(s, pi, cell, now) {
    if (s.phase !== 'play' || s.winner >= 0) return '지금은 쏠 수 없습니다.';
    if (s.turn !== pi) return '내 차례가 아닙니다.';
    cell = Math.floor(Number(cell));
    if (!(cell >= 0 && cell < BS_N * BS_N)) return '잘못된 칸입니다.';
    var me = s.players[pi], opp = s.players[1 - pi];
    if (me.shots.charAt(cell) !== '.') return '이미 쏜 칸입니다.';
    var si = bsShipAt(opp, cell), res = 'miss';
    if (si >= 0) {
        me.shots = bsSet(me.shots, cell, 'x'); me.hits++; res = 'hit';
        if (bsSunk(me, opp.ships[si])) { opp.ships[si].forEach(function(c) { me.shots = bsSet(me.shots, c, '#'); }); res = 'sunk';
            bsLog(s, '💥 ' + me.name + ' — ' + opp.ships[si].length + '칸 배 격침!'); }
        else bsLog(s, '🔥 ' + me.name + ' 명중! 한 번 더');
        if (me.hits >= BS_SHIPS.reduce(function(a, b) { return a + b; }, 0)) { s.winner = pi; s.phase = 'end'; bsLog(s, '🏆 ' + me.name + ' 승리!'); }
    } else { me.shots = bsSet(me.shots, cell, 'o'); s.turn = 1 - pi; bsLog(s, '💧 ' + me.name + ' 빗나감'); }
    s.last = { p: pi, cell: cell, res: res }; s.ver++; s.turnAt = now; s.aiAt = now + BS_AI_MS;
    return '';
}
// 컴퓨터 — 맞힌 자리 주변부터(두 칸 이상 맞으면 그 줄 방향), 없으면 체스판 무늬로 듬성듬성
function bsAiCell(shots) {
    var hits = [], i;
    for (i = 0; i < shots.length; i++) if (shots.charAt(i) === 'x') hits.push(i);
    var cand = [];
    function free(r, c) { return r >= 0 && r < BS_N && c >= 0 && c < BS_N && shots.charAt(r * BS_N + c) === '.'; }
    if (hits.length) {
        hits.forEach(function(h) { var r = Math.floor(h / BS_N), c = h % BS_N;
            var lineH = (c > 0 && shots.charAt(h - 1) === 'x') || (c < BS_N - 1 && shots.charAt(h + 1) === 'x');
            var lineV = (r > 0 && shots.charAt(h - BS_N) === 'x') || (r < BS_N - 1 && shots.charAt(h + BS_N) === 'x');
            var dirs = lineH ? [[0, -1], [0, 1]] : lineV ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1], [-1, 0], [1, 0]];
            dirs.forEach(function(d) { if (free(r + d[0], c + d[1])) cand.push((r + d[0]) * BS_N + c + d[1]); }); });
        if (cand.length) return cand[Math.floor(Math.random() * cand.length)];
    }
    for (i = 0; i < shots.length; i++) { var rr = Math.floor(i / BS_N), cc = i % BS_N;
        if (shots.charAt(i) === '.' && (rr + cc) % 2 === 0 && bsNearSunkOk(shots, rr, cc)) cand.push(i); }
    if (!cand.length) for (i = 0; i < shots.length; i++) if (shots.charAt(i) === '.') cand.push(i);
    return cand[Math.floor(Math.random() * cand.length)];
}
function bsNearSunkOk(shots, r, c) { // 가라앉은 배 바로 옆은 배가 붙을 수 없으니 건너뜀
    for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) { var rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < BS_N && cc >= 0 && cc < BS_N && shots.charAt(rr * BS_N + cc) === '#') return false; }
    return true;
}
// 시간 흐름 — 컴퓨터 차례 진행, 사람이 너무 오래 안 두면 대신(배치는 무작위, 쏘기는 컴퓨터처럼)
function bsTick(s, now, timeoutMs) {
    if (s.winner >= 0) return;
    if (s.phase === 'place') {
        if (timeoutMs && now - s.turnAt > BS_PLACE_MS) s.players.forEach(function(p, i) { if (!p.ready) bsPlace(s, i, bsRandomShips(), now); });
        return;
    }
    var cur = s.players[s.turn];
    if (cur.ai) { if (now >= s.aiAt) bsShoot(s, s.turn, bsAiCell(cur.shots), now); }
    else if (timeoutMs && now - s.turnAt > timeoutMs) { bsLog(s, '⏰ ' + cur.name + ' 시간 초과'); bsShoot(s, s.turn, bsAiCell(cur.shots), now); }
}
// 내 화면 — 상대 배 위치는 가라앉은 것만(끝나면 전부 공개)
function bsView(s, pi, now) {
    var me = s.players[pi], opp = s.players[1 - pi];
    var oppLeft = opp.ships ? opp.ships.map(function(sh) { return { n: sh.length, sunk: bsSunk(me, sh) }; }) : BS_SHIPS.map(function(n) { return { n: n, sunk: false }; });
    var myLeft = me.ships ? me.ships.map(function(sh) { return { n: sh.length, sunk: bsSunk(opp, sh) }; }) : [];
    return { me: pi, phase: s.phase, turn: s.turn, winner: s.winner, ver: s.ver, last: s.last, log: s.log.slice(-3),
        turnLeft: Math.max(0, 30000 - (now - s.turnAt)), placeLeft: Math.max(0, BS_PLACE_MS - (now - s.turnAt)),
        players: s.players.map(function(p) { return { name: p.name, face: p.face, ai: p.ai, ready: p.ready }; }),
        myShips: me.ships, ready: me.ready, myShots: me.shots, oppShots: opp.shots, oppLeft: oppLeft, myLeft: myLeft,
        oppShips: s.winner >= 0 ? opp.ships : null };
}

// ===== 해전 — 같이 하기 방(1:1). 원카드 방과 같은 방식: 캐시에 방, 자리 키로 확인, 바뀔 게 없는 확인은 잠금 없이 =====
// 두 번째 사람이 들어오면 바로 배치 단계로 시작. 게임 중 나가면 컴퓨터가 이어받고 그 사람은 패로 기록
var BS_LOBBY_KEY = 'bs_lobby', BS_TURN_MS = 30000;
function bsLoadRoom(id) { try { var raw = ocCache().get('bs_r_' + id); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
function bsSaveRoom(room) { room.at = Date.now(); ocCache().put('bs_r_' + room.id, JSON.stringify(room), OC_ROOM_TTL); }
function bsLobbyIds() { try { return JSON.parse(ocCache().get(BS_LOBBY_KEY) || '[]'); } catch (e) { return []; } }
function bsSetLobby(ids) { ocCache().put(BS_LOBBY_KEY, JSON.stringify(ids.slice(-30)), OC_ROOM_TTL); }
function bsRoomInfo(room) {
    return { id: room.id, title: room.title, host: room.seats.length ? room.seats[0].nick : '', started: !!room.state,
        seats: room.seats.map(function(x) { return { nick: x.nick, face: x.face, left: !!x.left }; }) };
}
function bsLoadStats() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('BS_STATS') || '{}'); } catch (e) { return {}; } }
function bsAddStat(pid, win) {
    var st = bsLoadStats(), r = st[pid] || { w: 0, g: 0 }; r.g++; if (win) r.w++; st[pid] = r;
    PropertiesService.getScriptProperties().setProperty('BS_STATS', JSON.stringify(st));
}
function bsRecord(rm) { // 끝난 판을 한 번만 기록(잠금 안에서). 중간에 나간 사람은 나갈 때 이미 패로 기록
    if (!rm.state || rm.state.winner < 0 || rm.recorded) return false;
    rm.recorded = true;
    rm.seats.forEach(function(x, k) { if (x.pid && !x.counted) bsAddStat(x.pid, k === rm.state.winner && !x.left); });
    return true;
}
function bsStart(rm, now) {
    rm.state = bsNew(rm.seats.map(function(x) { return { name: x.nick, face: x.face, ai: false, key: x.key }; }), now);
    var ids = bsLobbyIds().filter(function(id) { return id !== rm.id; }); bsSetLobby(ids);
}
function handleBattleship(data) {
    var act = data.action, now = Date.now();
    var lock = LockService.getScriptLock();
    try {
        if (act === 'bsLobby') {
            var list = [];
            bsLobbyIds().forEach(function(id) { var r = bsLoadRoom(id);
                if (r && !r.state && r.seats.length === 1 && now - r.at < OC_ROOM_IDLE && ocSeatAlive(r, r.seats[0], now)) list.push(bsRoomInfo(r)); });
            return buildJson({ success: true, rooms: list });
        }
        if (act === 'bsCreate' || act === 'bsJoin') {
            var who = ocCheckPlayer(data);
            if (!who) return buildJson({ success: false, auth: false, error: '다시 로그인해주세요.' });
            lock.waitLock(15000);
            var room, key = ocNewKey(), face = Math.max(0, Math.min(7, Number(data.face) || 0));
            if (act === 'bsCreate') {
                room = { id: ocNewKey().slice(0, 8), title: String(data.title || who.nick + '의 함대').slice(0, 20), seats: [], state: null, at: now };
                var ids = bsLobbyIds(); ids.push(room.id); bsSetLobby(ids);
            } else {
                room = bsLoadRoom(String(data.room || ''));
                if (!room) return buildJson({ success: false, error: '방이 없어졌습니다.' });
                var mine = room.seats.filter(function(x) { return x.pid === who.pid; })[0];
                if (mine) { bsSaveRoom(room); return buildJson({ success: true, room: bsRoomInfo(room), key: mine.key, seat: ocSeatIndex(room, mine.key) }); }
                if (room.state || room.seats.length >= 2) return buildJson({ success: false, error: '이미 시작했거나 꽉 찬 방입니다.' });
            }
            room.seats.push({ key: key, pid: who.pid, nick: who.nick, face: face, seen: now });
            if (room.seats.length === 2) bsStart(room, now);
            bsSaveRoom(room);
            return buildJson({ success: true, room: bsRoomInfo(room), key: key, seat: room.seats.length - 1 });
        }
        // 방 안 요청 — 자리 키로 확인. 바뀔 게 없는 확인은 잠금 없이 읽기만
        if (act === 'bsState') {
            var fr = bsLoadRoom(String(data.room || ''));
            if (!fr) return buildJson({ success: false, gone: true, error: '방이 없어졌습니다.' });
            var fi = ocSeatIndex(fr, String(data.key || ''));
            if (fi < 0) return buildJson({ success: false, gone: true, error: '이 방의 참가자가 아닙니다.' });
            if (fr.state) {
                var fv = fr.state.ver;
                bsTick(fr.state, now, BS_TURN_MS);
                if (fr.state.ver === fv && !(fr.state.winner >= 0 && !fr.recorded))
                    return buildJson({ success: true, room: bsRoomInfo(fr), view: bsView(fr.state, fi, now) });
            } else if (now - (fr.seats[fi].seen || 0) < OC_SEEN_WRITE) {
                return buildJson({ success: true, room: bsRoomInfo(fr), seat: fi });
            }
        }
        lock.waitLock(15000);
        var rm = bsLoadRoom(String(data.room || ''));
        if (!rm) return buildJson({ success: false, gone: true, error: '방이 없어졌습니다.' });
        var si = ocSeatIndex(rm, String(data.key || ''));
        if (si < 0) return buildJson({ success: false, gone: true, error: '이 방의 참가자가 아닙니다.' });
        if (!rm.state) rm.seats[si].seen = now;
        if (act === 'bsLeave') {
            if (!rm.state) { ocCache().remove('bs_r_' + rm.id); bsSetLobby(bsLobbyIds().filter(function(id) { return id !== rm.id; })); return buildJson({ success: true }); }
            var me = rm.seats[si]; me.left = true;
            if (rm.state.winner < 0 && !me.counted && me.pid) { bsAddStat(me.pid, false); me.counted = true; }
            var pl = rm.state.players[si]; if (pl && !pl.ai) { pl.ai = true; pl.name += '(컴퓨터)'; rm.state.aiAt = now; if (!pl.ready) bsPlace(rm.state, si, bsRandomShips(), now); }
            bsSaveRoom(rm); return buildJson({ success: true });
        }
        if (act === 'bsPlace' || act === 'bsShoot') {
            if (!rm.state) return buildJson({ success: false, error: '상대를 기다리는 중입니다.' });
            var err;
            if (act === 'bsPlace') { var ships; try { ships = JSON.parse(String(data.ships || '[]')); } catch (e) { ships = null; } err = bsPlace(rm.state, si, ships, now); }
            else err = bsShoot(rm.state, si, data.cell, now);
            if (err) return buildJson({ success: false, error: err, view: bsView(rm.state, si, now) });
            bsSaveRoom(rm);
        }
        if (rm.state) {
            var v0 = rm.state.ver;
            for (var t = 0; t < 3; t++) bsTick(rm.state, now, BS_TURN_MS);
            if (bsRecord(rm) || rm.state.ver !== v0) bsSaveRoom(rm);
            return buildJson({ success: true, room: bsRoomInfo(rm), view: bsView(rm.state, si, now) });
        }
        bsSaveRoom(rm); // 대기실 '살아 있음'
        return buildJson({ success: true, room: bsRoomInfo(rm), seat: si });
    } catch (err) {
        return buildJson({ success: false, error: err.message });
    } finally {
        try { lock.releaseLock(); } catch (e) {}
    }
}
