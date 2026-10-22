/*
================================================================================
Google Apps Script 코드 — 아래 코드를 복사하여 GAS 프로젝트에 붙여넣고
[배포 > 새 배포 > 웹앱] 으로 배포 후 URL을 아래 GAS_URL 변수에 입력하세요.
액세스 권한: "모든 사용자"로 설정해야 합니다.

시트 구조:
    점검 결과 시트 (예: "26년 4월")
        - 8행  : 날짜 헤더 (예: "04.27(일)") — D열부터 오른쪽으로 날짜 순
        - B열  : 제품 ID (9행부터)

    제품 리스트 시트 ("제품 리스트")
        - 3행  : 헤더 (B=제품ID, C=영역명, D=설치장소)
        - 4행~ : 데이터

    점검요청이력 시트 ("점검요청이력") — 주간 점검 요청서 생성 시 자동 기록됨.
    시트가 없으면 직접 만들어두세요 — 1행 공백, 2행에 헤더(B열부터), 3행부터 데이터:
        B          C     D      E       F      G         H    I      J     K
        생성일     제품ID 오류코드 오류발생일 신규여부 한달이상여부 영역 설치장소 요청자 비고

    점검표 — 현장 점검표(매트/집진기/소모품) 제출 시 자동 기록됨. 이 스크립트가 붙어있는(container-bound)
    스프레드시트가 아니라, "Air Max 점검표"라는 이름의 완전히 별도인 새 스프레드시트를 최초 제출 시
    자동으로 생성해서 그쪽에 쌓는다(그 안의 "점검표" 시트, 1행 헤더/2행부터 데이터). 새로 만들어진
    스프레드시트의 ID는 스크립트 속성(PropertiesService)에 저장해 이후 제출부터 재사용한다.
    이 스프레드시트는 스크립트가 "실행 계정"으로 배포된 계정의 내 드라이브에 생성되므로, 필요하면
    직접 찾아서(제출 성공 응답에 포함되는 링크 참고) 다른 사람과 공유해줘야 한다.
    같은 스프레드시트에 제출 시마다 자동으로 아래 시트도 만들어지고 갱신된다:
        "통계"          — 점검 현황판(장소별 최근 점검 ✓/✗) / 이상 발생 항목 + 차트 / 월별 점검 현황 + 차트
        "장소-<점검장소>" — 해당 장소의 점검 기록만 모아 보기 (원본 "점검표"를 FILTER 수식으로 참조)
    기존 데이터로 처음 만들 때는 GAS 편집기에서 rebuildChecklistReports() 함수를 한 번 직접 실행하면 된다.
    세부구역 열이 생기기 전 "장소(구역)"처럼 괄호로 적은 데이터는 splitChecklistLocationParens()로 나눌 수 있다.
    업체 담당자 서명 PDF는 드라이브 "Air Max 점검표 서명" 폴더에 저장되고, 담당자 이메일이 있으면 메일로도 발송된다
    (참조/답장 주소는 CHECKLIST_MAIL_CC / CHECKLIST_MAIL_REPLY_TO). 처음 한 번 authorizeDrive(), authorizeMail() 실행 필요.
    관리자 비밀번호는 코드가 아니라 스크립트 속성 ADMIN_PASSWORD / SUPER_ADMIN_PASSWORD에 저장한다(관리자 전용 요청은 서버에서 토큰 확인).
    점검표는 등록된 점검자 이름으로만 제출된다 — 명단은 스크립트 속성(CHECKLIST_INSPECTORS)에 저장되고 앱의 관리자 "점검자 관리"에서 추가/삭제.
================================================================================
*/
// GET 요청 — 제품 리스트 시트에서 영역/설치장소 + 월별 점검 시트 목록 반환
// 반환 형식: { success, zones:[{name,ids[]}], locations:{id:loc}, monthSheets:[name,...] }
function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var productMap = getProductList(ss);
    var zoneMap = {}, zoneOrder = [], locations = {};
    Object.keys(productMap).forEach(function(id) {
      var p = productMap[id];
      if (p.zone) {
        if (!zoneMap[p.zone]) { zoneMap[p.zone] = []; zoneOrder.push(p.zone); }
        zoneMap[p.zone].push(id);
      }
      if (p.loc) locations[id] = p.loc;
    });
    var zones = zoneOrder.map(function(name) { return { name: name, ids: zoneMap[name] }; });
    var monthSheets = listMonthSheetsAsc(ss).map(function(m) { return m.name; });
    return buildJson({ success: true, zones: zones, locations: locations, monthSheets: monthSheets });
  } catch(err) {
    return buildJson({ success: false, error: err.message });
  }
}

// POST 요청 — action에 따라 처리
function doPost(e) {
try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action || 'saveResults';

    if (action === 'adminLogin')  return handleAdminLogin(data);
    if (action === 'adminCheck')  return handleAdminCheck(data);
    if (action === 'adminLogout') return handleAdminLogout(data);
    // 관리자 전용 요청 — 앱 화면에서 버튼을 숨기는 것만으로는 막을 수 없으므로 서버에서 관리자 토큰을 확인
    if (ADMIN_ONLY_ACTIONS[action] && !getAdminLevel(data.adminToken)) {
        return buildJson({ success: false, code: 'ADMIN_REQUIRED', error: '관리자 인증이 필요합니다. 관리자 비밀번호로 다시 로그인해주세요.' });
    }

    if (action === 'addProduct')          return handleAddProduct(data);
    if (action === 'updateProduct')       return handleUpdateProduct(data);
    if (action === 'deleteProduct')       return handleDeleteProduct(data);
    if (action === 'getMonthGrid')        return getMonthGrid(data);
    if (action === 'getWeeklyReportDraft')return getWeeklyReportDraft(data);
    if (action === 'saveWeeklyReport')    return saveWeeklyReport(data);
    if (action === 'submitChecklist')     return handleSubmitChecklist(data);
    if (action === 'getChecklistPlaces')  return getChecklistPlaces();
    if (action === 'attachChecklistSignature') return handleAttachChecklistSignature(data);
    if (action === 'gameLogin' || action === 'gameLoad' || action === 'gameSave' || action === 'gameRanking') return handleGameAction(data);
    if (action === 'listChecklists' || action === 'getChecklist' || action === 'getChecklistPdf' || action === 'resendChecklistMail') return handleChecklistRecords(data);
    if (action === 'getInspectors' || action === 'addInspector' || action === 'removeInspector') return handleInspectorAction(data);
    // 모르는 요청이 아래 점검 결과 저장으로 흘러가 엉뚱한 오류가 나지 않게 막음 (앱만 새 버전이고 GAS가 예전 코드일 때 등)
    if (action !== 'saveResults' || !Array.isArray(data.results)) {
        return buildJson({ success: false, error: '알 수 없는 요청입니다: ' + action + ' — GAS 코드가 최신 버전인지 확인해주세요.' });
    }

    // 저장 요청 시각 기준으로 KST 날짜 산출
    var savedDate = data.savedAt ? new Date(data.savedAt) : new Date();
    var DAYS = ['일','월','화','수','목','금','토'];
    var month = Utilities.formatDate(savedDate, 'Asia/Seoul', 'MM');
    var day   = Utilities.formatDate(savedDate, 'Asia/Seoul', 'dd');
    var kstYMD = Utilities.formatDate(savedDate, 'Asia/Seoul', 'yyyy-MM-dd').split('-');
    var kstDate = new Date(parseInt(kstYMD[0]), parseInt(kstYMD[1]) - 1, parseInt(kstYMD[2]));
    var todayStr = month + '.' + day + '(' + DAYS[kstDate.getDay()] + ')';  // 예: "04.27(일)"

    // 시트명: "YY년 M월"
    var sheetName = (parseInt(kstYMD[0]) % 100) + '년 ' + parseInt(kstYMD[1]) + '월';
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
    return buildJson({ success: false, error: '시트 없음: ' + sheetName });
    }

    // 8행에서 오늘 날짜와 일치하는 열 찾기 — 날짜 서식 셀은 원본이 Date 객체라 getValues()로 비교하면
    // 항상 실패하므로, 시트에 실제로 표시되는 문자열(getDisplayValues())로 비교해야 함
    var lastCol    = sheet.getLastColumn();
    var headerVals = sheet.getRange(8, 1, 1, lastCol).getDisplayValues()[0];
    var targetCol  = -1;
    for (var c = 0; c < headerVals.length; c++) {
    if (String(headerVals[c]).trim() === todayStr) {
        targetCol = c + 1;  // 1-based
        break;
    }
    }
    if (targetCol === -1) {
    return buildJson({ success: false, error: '날짜 열 없음: ' + todayStr + ' (시트: ' + sheetName + ')' });
    }

    // B열에서 제품 ID 찾기 (9행부터)
    var lastRow = sheet.getLastRow();
    var idVals  = lastRow >= 9 ? sheet.getRange(9, 2, lastRow - 8, 1).getValues() : [];

    var updated = 0;
    var notFound = [];
    data.results.forEach(function(r) {
    var found = false;
    for (var i = 0; i < idVals.length; i++) {
        if (String(idVals[i][0]).trim() === String(r.id).trim()) {
        sheet.getRange(i + 9, targetCol).setValue(String(r.status).toUpperCase());
        updated++;
        found = true;
        break;
        }
    }
    if (!found) notFound.push(r.id);
    });

    return buildJson({
    success: true,
    updated: updated,
    total: data.results.length,
    notFound: notFound,
    sheet: sheetName,
    col: todayStr
    });
} catch(err) {
    return buildJson({ success: false, error: err.message });
}
}

// 제품 리스트 시트 전체를 {id: {zone, loc}} 형태로 읽어옴 (B=id, C=영역, D=설치장소)
function getProductList(ss) {
    var sheet = ss.getSheetByName('제품 리스트');
    var map = {};
    if (!sheet) return map;
    var lastRow = sheet.getLastRow();
    if (lastRow < 4) return map;
    var rows = sheet.getRange(4, 2, lastRow - 3, 3).getValues();
    rows.forEach(function(row) {
        var id = String(row[0]).trim();
        if (!id) return;
        map[id] = { zone: String(row[1]).trim(), loc: String(row[2]).trim() };
    });
    return map;
}

// 제품 리스트 시트에서 ID로 행 번호 찾기 (없으면 -1)
function findProductRow(sheet, id) {
    var lastRow = sheet.getLastRow();
    if (lastRow < 4) return -1;
    var ids = sheet.getRange(4, 2, lastRow - 3, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
        if (String(ids[i][0]).trim() === String(id).trim()) return i + 4;
    }
    return -1;
}

function handleAddProduct(data) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('제품 리스트');
    if (!sheet) return buildJson({ success: false, error: '제품 리스트 시트 없음' });
    // 중복 체크
    if (findProductRow(sheet, data.id) !== -1)
        return buildJson({ success: false, error: '이미 존재하는 ID: ' + data.id });
    var nextRow = sheet.getLastRow() + 1;
    sheet.getRange(nextRow, 2, 1, 3).setValues([[data.id, data.zone || '', data.location || '']]);
    return buildJson({ success: true, id: data.id });
}

function handleUpdateProduct(data) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('제품 리스트');
    if (!sheet) return buildJson({ success: false, error: '제품 리스트 시트 없음' });
    var row = findProductRow(sheet, data.id);
    if (row === -1) return buildJson({ success: false, error: 'ID 없음: ' + data.id });
    sheet.getRange(row, 3, 1, 2).setValues([[data.zone || '', data.location || '']]);
    return buildJson({ success: true, id: data.id });
}

function handleDeleteProduct(data) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('제품 리스트');
    if (!sheet) return buildJson({ success: false, error: '제품 리스트 시트 없음' });
    var row = findProductRow(sheet, data.id);
    if (row === -1) return buildJson({ success: false, error: 'ID 없음: ' + data.id });
    sheet.deleteRow(row);
    return buildJson({ success: true, id: data.id });
}

// 현장 점검표(매트/집진기/소모품) 제출 저장 — 기존 시트(제품 리스트 등)와는 별도로 전용 스프레드시트를
// 하나 새로 만들어 거기에 저장한다. 최초 제출 시 자동 생성되고, 그 스프레드시트 ID를
// PropertiesService(스크립트 속성)에 저장해뒀다가 이후 제출부터는 같은 시트를 계속 재사용한다.
// (스프레드시트가 삭제되는 등 ID로 더 이상 열 수 없게 되면 다음 제출 시 자동으로 새로 하나 더 생성됨)
//
// 세로형(long format) — 제출 1건을 한 행에 다 욱여넣으면(항목이 30개라 가로로 계속 스크롤해야 함)
// 열람하기 너무 불편해서, 제출 1건당 "항목 하나 = 행 하나"로 풀어서 저장한다. 제출시각/장소 등
// 공통 정보는 각 항목 행마다 반복해서 넣어 같은 제출 건을 필터/정렬로 쉽게 묶어볼 수 있게 한다.
// 원본 절차서 종이 양식(항목을 위→아래로 쭉 읽는 표)과 같은 느낌으로 보이는 게 목표.
var CHECKLIST_LONG_HEADERS = ['제출ID', '제출시각', '점검장소', '세부구역', '점검일자', '점검자', '점검구분', '구분', '항목', '결과', '비고'];
var CHECKLIST_SCHEMA_VERSION = 'v2-long'; // 열 구성이 바뀌면 이 값을 올릴 것 — 값이 다르면 시트를 새 구성으로 초기화함
var CHECKLIST_SHEET_ID_PROP = 'CHECKLIST_SHEET_ID';
var CHECKLIST_SCHEMA_VERSION_PROP = 'CHECKLIST_SCHEMA_VERSION';

// 헤더를 굵게/배경색/줄바꿈 처리하고, 항목 성격에 맞게 열 너비를 다르게 줘서 가독성을 높인다.
// "결과"가 이상/NO인 행은 옅은 빨강으로 강조해서 문제 항목이 한눈에 보이게 조건부 서식도 건다.
// 서식 작업 자체가 실패해도 실제 데이터 저장엔 영향 없도록 호출부에서 try/catch로 감쌈.
function formatChecklistSheet(sheet) {
    var numCols = CHECKLIST_LONG_HEADERS.length;
    var headerRange = sheet.getRange(1, 1, 1, numCols);
    headerRange.setFontWeight('bold').setBackground('#434343').setFontColor('#ffffff')
        .setWrap(true).setVerticalAlignment('middle').setHorizontalAlignment('center');
    sheet.setRowHeight(1, 40);
    sheet.setFrozenRows(1);
    var widths = { '제출ID': 130, '제출시각': 140, '점검장소': 160, '세부구역': 130, '점검일자': 95, '점검자': 85,
        '점검구분': 85, '구분': 75, '항목': 230, '결과': 90, '비고': 280 };
    for (var c = 1; c <= numCols; c++) sheet.setColumnWidth(c, widths[CHECKLIST_LONG_HEADERS[c - 1]] || 100);
    // 새 시트는 기본 1000행이라 그보다 큰 범위를 잡으면 오류가 나므로 행을 먼저 늘려둠
    var FORMAT_ROWS = 5000;
    if (sheet.getMaxRows() < FORMAT_ROWS + 1) sheet.insertRowsAfter(sheet.getMaxRows(), FORMAT_ROWS + 1 - sheet.getMaxRows());
    var bigRange = sheet.getRange(2, 1, FORMAT_ROWS, numCols);
    bigRange.clearFormat();
    // 날짜 열에 서식이 없으면 46301.507 같은 날짜 일련번호로 보이므로 표시 형식을 명시
    sheet.getRange(2, CHECKLIST_LONG_HEADERS.indexOf('제출시각') + 1, FORMAT_ROWS, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
    sheet.getRange(2, CHECKLIST_LONG_HEADERS.indexOf('점검일자') + 1, FORMAT_ROWS, 1).setNumberFormat('yyyy-mm-dd');
    var resultCol = CHECKLIST_LONG_HEADERS.indexOf('결과') + 1;
    var colLetter = String.fromCharCode(64 + resultCol);
    var rules = [
        SpreadsheetApp.newConditionalFormatRule()
            .whenFormulaSatisfied('=OR($' + colLetter + '2="이상",$' + colLetter + '2="NO")')
            .setBackground('#fce8e6').setRanges([bigRange]).build()
    ];
    sheet.setConditionalFormatRules(rules);
}
function getOrCreateChecklistSpreadsheet() {
    var props = PropertiesService.getScriptProperties();
    var id = props.getProperty(CHECKLIST_SHEET_ID_PROP);
    var ss = null;
    if (id) {
        try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; }
    }
    var needsInit = false;
    if (!ss) {
        ss = SpreadsheetApp.create('Air Max 점검표');
        props.setProperty(CHECKLIST_SHEET_ID_PROP, ss.getId());
        needsInit = true;
    }
    var sheet = ss.getSheetByName('점검표');
    if (!sheet) {
        sheet = ss.getSheets()[0];
        sheet.setName('점검표');
        needsInit = true;
    }
    // 열 구성 버전이 다르면(최초 생성 포함) 시트를 새 구성으로 초기화 — 기존 데이터가 있다면 주의:
    // 구성이 완전히 바뀌는 경우라 이전 데이터는 보존하지 않고 헤더부터 다시 씀
    if (props.getProperty(CHECKLIST_SCHEMA_VERSION_PROP) !== CHECKLIST_SCHEMA_VERSION) {
        sheet.clear();
        sheet.getRange(1, 1, 1, CHECKLIST_LONG_HEADERS.length).setValues([CHECKLIST_LONG_HEADERS]);
        try { formatChecklistSheet(sheet); } catch (e) { /* 서식 실패는 무시하고 데이터 저장은 계속 진행 */ }
        props.setProperty(CHECKLIST_SCHEMA_VERSION_PROP, CHECKLIST_SCHEMA_VERSION);
    }
    // 세부구역 열이 생기기 전에 만들어진 시트 — 기존 데이터는 그대로 두고 점검장소 오른쪽에 빈 열을 끼워 넣음.
    // 장소 시트들도 열이 하나 늘어난 구성으로 헤더/수식을 다시 씀
    var areaCol = CHECKLIST_LONG_HEADERS.indexOf('세부구역') + 1;
    if (sheet.getRange(1, areaCol).getValue() !== '세부구역') {
        sheet.insertColumnBefore(areaCol);
        sheet.getRange(1, 1, 1, CHECKLIST_LONG_HEADERS.length).setValues([CHECKLIST_LONG_HEADERS]);
        try { formatChecklistSheet(sheet); } catch (e) { /* 서식 실패는 무시 */ }
        readChecklistSubmissions(ss).forEach(function(s) {
            if (s.location && ss.getSheetByName(locationSheetName(s.location))) getOrCreateLocationSheet(ss, s.location, true);
        });
    }
    return ss;
}
// data(제출된 점검표 1건)를 (구분, 항목, 결과, 비고) 행 목록으로 풀어낸다 — 값이 아예 없는 항목은
// 빈 행을 만들지 않고 건너뛴다(입력 안 한 소모품 사용률 등)
function buildChecklistItemRows(base, data) {
    var rows = [];
    function add(section, item, result, note) {
        if (!result && !note) return;
        rows.push(base.concat([section, item, result || '', note || '']));
    }
    add('매트', '① 볼 상태 점검', data.ballResult, data.ballIssue);
    add('매트', '② 상판/경사면', data.matResult, data.matIssue);
    add('매트', '③ 스프링 상태 점검', data.springResult, data.springIssue);
    add('매트', '④ 흡입력(풍속 측정)', data.windTest || '', data.windTest === '실시' ? (data.windTestDetail || '-') : '');
    add('매트', '⑤ 호스 상태 점검', data.hoseResult, data.hoseIssue);
    add('집진기', '① 전원 및 동작상태', data.powerResult, data.powerIssue);
    add('집진기', '② 센서 상태', data.sensorResult, data.sensorIssue);
    add('집진기', '제품 종류', data.displayType, '');
    if (data.displayType === 'LED') {
        add('집진기', '③ LED 표시상태', data.ledResult, data.ledIssue);
    } else if (data.displayType === 'LCD') {
        add('집진기', 'LCD 버전', data.lcdVersion ? data.lcdVersion + ' 로고' : '', '');
        add('집진기', '③ LCD 표시상태', data.lcdResult, data.lcdIssue);
        // 구형 로고 제품은 모뎀이 없어 모뎀/통신 항목을 기록하지 않음
        if (data.lcdVersion !== '구형') add('집진기', '모뎀 설치 여부', data.modemInstalled, '');
        if (data.lcdVersion !== '구형' && data.modemInstalled === 'O') {
            add('집진기', '④ 통신상태', data.commResult, data.commIssue);
            add('집진기', '④ 공기질 센서 상태', data.airSensorResult, data.airSensorIssue);
        }
    }
    // 구형 로고 LCD 제품은 사용률(%) 대신 사용시간(Hr)을 기록함 — 항목 이름으로 단위를 구분
    // (구형 버전을 골랐는데 usageUnit을 보내지 않는 예전 앱 화면이 남아 있어도 시간으로 기록되도록 버전도 함께 확인)
    var isHours = data.usageUnit === 'Hr' || (data.displayType === 'LCD' && data.lcdVersion === '구형');
    var usageSuffix = isHours ? ' 사용시간(Hr)' : ' 사용률(%)';
    add('소모품', '먼지봉투' + usageSuffix, data.bagRate, '');
    add('소모품', 'HEPA필터' + usageSuffix, data.hepaRate, '');
    add('소모품', '모터' + usageSuffix, data.motorRate, '');
    add('소모품', '먼지봉투 포집량 측정값(g)', data.bagWeight, '');
    add('소모품', '먼지봉투 교체', data.bagReplaced ? '교체' : '', '');
    add('소모품', 'HEPA필터 교체', data.hepaReplaced ? '교체' : '', '');
    add('소모품', '모터 교체', data.motorReplaced ? '교체' : '', '');
    add('소모품', '집진기 입력완료', data.inputDone ? '완료' : '', '');
    add('완료보고', '특이사항', '', data.remark);
    // 서명을 받는 경우 실제 서명은 제출 후 완료 보고 화면에서 받고, 그때 '업체 담당자 확인' 행이 따로 추가됨
    add('완료보고', '업체 담당자 서명', data.signMode === 'Y' ? '서명 받음' : (data.signMode === 'N' ? '서명 없음' : ''), '');
    return rows;
}
// 모바일 환경에선 저장은 성공했는데 응답만 유실되는 경우가 있어, 클라이언트가 같은 clientSubmissionId로
// 재시도/재제출해도 중복 행이 쌓이지 않도록 CacheService로 최근 처리된 제출을 10분간 기억해둔다
function handleSubmitChecklist(data) {
    try {
        var cache = CacheService.getScriptCache();
        var dedupeKey = data.clientSubmissionId ? ('cl_sub_' + data.clientSubmissionId) : null;
        var cached = dedupeKey ? cache.get(dedupeKey) : null;
        if (cached) {
            // 이미 처리된 제출 — 다시 저장하지 않고, 처음 저장할 때의 제출번호/시각만 돌려줌
            var prev = cached.split('|');
            return buildJson({ success: true, submissionId: prev[0] || '', submittedAt: prev[1] || '' });
        }
        // 등록된 점검자만 제출 가능 — QR로 누구나 점검표에 들어올 수 있어 장난 제출을 막기 위함
        var inspector = normalizeChecklistLocation(data.inspector);
        if (getInspectorList().indexOf(inspector) === -1) {
            return buildJson({ success: false, code: 'UNKNOWN_INSPECTOR', error: '등록되지 않은 점검자입니다: ' + (inspector || '(이름 없음)') });
        }
        var ss = getOrCreateChecklistSpreadsheet();
        var sheet = ss.getSheetByName('점검표') || ss.getSheets()[0];
        var savedDate = data.savedAt ? new Date(data.savedAt) : new Date();
        var submittedAt = Utilities.formatDate(savedDate, 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
        var submissionId = Utilities.formatDate(savedDate, 'Asia/Seoul', 'yyyyMMddHHmmss') + '-' + Math.floor(Math.random() * 900 + 100);
        var location = normalizeChecklistLocation(data.location);
        var area = normalizeChecklistLocation(data.area);
        var base = [submissionId, submittedAt, location, area, data.date || '', inspector, data.type || ''];
        var rows = buildChecklistItemRows(base, data);
        // 동시 제출 시 getLastRow() 기준으로 같은 행에 덮어쓰지 않도록 잠금
        var lock = LockService.getScriptLock();
        lock.waitLock(20000);
        try {
            if (rows.length) {
                var startRow = sheet.getLastRow() + 1;
                // 시트 최대 행 수를 넘어서 쓰면 오류가 나므로 부족하면 행을 늘림
                if (startRow + rows.length - 1 > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 1000);
                sheet.getRange(startRow, 1, rows.length, CHECKLIST_LONG_HEADERS.length).setValues(rows);
            }
            if (dedupeKey) cache.put(dedupeKey, submissionId + '|' + submittedAt, 600);
            // 장소별 시트/통계 시트 갱신 — 실패해도 원본 저장은 이미 끝났으므로 제출은 성공으로 응답
            try {
                if (location) getOrCreateLocationSheet(ss, location);
                refreshChecklistStats(ss);
            } catch (e) { /* 통계 갱신 실패는 무시 — rebuildChecklistReports()로 언제든 재생성 가능 */ }
        } finally {
            lock.releaseLock();
        }
        return buildJson({ success: true, submissionId: submissionId, submittedAt: submittedAt });
    } catch(err) {
        return buildJson({ success: false, error: err.message });
    }
}

/* ===================================================================
   점검표 장소별 시트 / 통계 시트
   - "장소-<점검장소>" 시트: 원본 "점검표" 시트를 FILTER 수식으로 보여주므로 원본이 바뀌면 자동 반영됨.
     새 장소로 제출이 들어오면 그때 시트가 생성됨.
   - "통계" 시트: 제출될 때마다 원본 전체를 다시 읽어 장소별 요약 / 항목별 이상률 / 월별 점검 현황을 새로 씀.
   - 기존에 쌓인 데이터로 처음 만들거나 꼬였을 때는 GAS 편집기에서 rebuildChecklistReports()를 직접 실행.
   =================================================================== */
var CHECKLIST_MAIN_SHEET = '점검표';
var CHECKLIST_STATS_SHEET = '통계';
var CHECKLIST_LOCATION_PREFIX = '장소-';

// 같은 장소가 띄어쓰기 차이로 다른 장소로 갈라지지 않도록 공백을 정리 — 시트의 TRIM()과 같은 규칙
function normalizeChecklistLocation(loc) {
    return String(loc || '').replace(/ +/g, ' ').trim();
}
// 시트 이름에 쓸 수 없는 문자([ ] * ? / \ :)는 _로 바꾸고, 길이 제한(100자) 안으로 자름
function locationSheetName(loc) {
    return (CHECKLIST_LOCATION_PREFIX + loc.replace(/[\[\]\*\?\/\\:]/g, '_')).substring(0, 99);
}
// reformat=true면 이미 있는 시트도 헤더/수식/서식을 다시 씀 (rebuildChecklistReports, 열 구성 변경 시 사용)
function getOrCreateLocationSheet(ss, loc, reformat) {
    var name = locationSheetName(loc);
    var sheet = ss.getSheetByName(name);
    if (sheet && !reformat) return sheet;
    if (!sheet) sheet = ss.insertSheet(name, ss.getNumSheets()); // 항상 맨 뒤에 추가 — 통계/점검표 탭 순서를 밀지 않게
    else sheet.getRange(1, 1, 1, sheet.getMaxColumns()).clearContent();
    sheet.getRange(1, 1, 1, CHECKLIST_LONG_HEADERS.length).setValues([CHECKLIST_LONG_HEADERS]);
    var lastColLetter = String.fromCharCode(64 + CHECKLIST_LONG_HEADERS.length);
    var locColLetter = String.fromCharCode(64 + CHECKLIST_LONG_HEADERS.indexOf('점검장소') + 1);
    var src = "'" + CHECKLIST_MAIN_SHEET + "'!";
    // 같은 장소 안에서 세부구역별로 모여 보이도록 세부구역 → 제출ID(시간순) 순으로 정렬
    var areaColIdx = CHECKLIST_LONG_HEADERS.indexOf('세부구역') + 1;
    sheet.getRange(2, 1).setFormula('=IFERROR(SORT(FILTER(' + src + 'A2:' + lastColLetter + ', TRIM(' + src + locColLetter + '2:' + locColLetter + ')="' +
        loc.replace(/"/g, '""') + '"), ' + areaColIdx + ', TRUE, 1, TRUE), "")');
    try { formatChecklistSheet(sheet); } catch (e) { /* 서식 실패는 무시 */ }
    return sheet;
}

function isChecklistBadResult(r) { return r === '이상' || r === 'NO'; }
// 시트가 '2026-10-07' 같은 값을 날짜로 자동 변환해 Date로 읽히므로 스프레드시트 시간대 기준으로 다시 문자열화
function checklistCellText(v, tz) {
    if (v instanceof Date) return Utilities.formatDate(v, tz || 'Asia/Seoul', 'yyyy-MM-dd');
    return String(v == null ? '' : v).trim();
}

// 원본 "점검표" 시트(항목 1개 = 행 1개)를 제출 건 단위로 묶어서 반환 — 점검일자/제출시각 오름차순
function readChecklistSubmissions(ss) {
    var sheet = ss.getSheetByName(CHECKLIST_MAIN_SHEET);
    if (!sheet || sheet.getLastRow() < 2) return [];
    var H = CHECKLIST_LONG_HEADERS;
    var col = function(name) { return H.indexOf(name); };
    var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, H.length).getValues();
    var tz = ss.getSpreadsheetTimeZone();
    var byId = {}, order = [];
    values.forEach(function(row) {
        var id = checklistCellText(row[col('제출ID')]);
        if (!id) return;
        var s = byId[id];
        if (!s) {
            s = byId[id] = {
                id: id,
                submittedAt: row[col('제출시각')] instanceof Date
                    ? Utilities.formatDate(row[col('제출시각')], tz, 'yyyy-MM-dd HH:mm:ss')
                    : checklistCellText(row[col('제출시각')]),
                location: normalizeChecklistLocation(checklistCellText(row[col('점검장소')])),
                area: normalizeChecklistLocation(checklistCellText(row[col('세부구역')])),
                date: checklistCellText(row[col('점검일자')], tz),
                inspector: checklistCellText(row[col('점검자')]),
                type: checklistCellText(row[col('점검구분')]),
                items: []
            };
            order.push(s);
        }
        s.items.push({
            section: checklistCellText(row[col('구분')]),
            item: checklistCellText(row[col('항목')]),
            result: checklistCellText(row[col('결과')]),
            note: checklistCellText(row[col('비고')])
        });
    });
    order.forEach(function(s) { if (!s.date) s.date = s.submittedAt.substring(0, 10); });
    order.sort(function(a, b) {
        return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.submittedAt < b.submittedAt ? -1 : a.submittedAt > b.submittedAt ? 1 : 0);
    });
    return order;
}

// 통계 시트 "현황판"의 점검 항목 열 — 장소마다 최근 점검 결과를 ✓/✗로 한 줄에 보여줌.
// items에 여러 개를 넣으면 그 중 있는 결과를 사용(LED/LCD 표시상태처럼 제품별로 이름만 다른 항목)
var CHECKLIST_BOARD_ITEMS = [
    { header: '매트\n볼',         section: '매트',   items: ['① 볼 상태 점검'] },
    { header: '매트\n상판/경사면', section: '매트',   items: ['② 상판/경사면'] },
    { header: '매트\n스프링',      section: '매트',   items: ['③ 스프링 상태 점검'] },
    { header: '매트\n호스',        section: '매트',   items: ['⑤ 호스 상태 점검'] },
    { header: '집진기\n전원/동작', section: '집진기', items: ['① 전원 및 동작상태'] },
    { header: '집진기\n센서',      section: '집진기', items: ['② 센서 상태'] },
    { header: '집진기\n표시상태',  section: '집진기', items: ['③ LED 표시상태', '③ LCD 표시상태'] },
    { header: '집진기\n통신',      section: '집진기', items: ['④ 통신상태'] },
    { header: '집진기\n공기질센서', section: '집진기', items: ['④ 공기질 센서 상태'] }
];
var STATS_COLOR = { ok: '#e6f4ea', okText: '#137333', bad: '#fce8e6', badText: '#c5221f', na: '#f1f3f4', naText: '#9aa0a6',
    header: '#434343', title: '#202124', sub: '#5f6368' };

// 탭 순서를 "통계 → 점검표 → 장소-…"로 고정 — 이미 제자리면 아무것도 하지 않음
function fixChecklistSheetOrder(ss) {
    [CHECKLIST_STATS_SHEET, CHECKLIST_MAIN_SHEET].forEach(function(name, i) {
        var sh = ss.getSheetByName(name);
        if (!sh || sh.getIndex() === i + 1) return;
        ss.setActiveSheet(sh);
        ss.moveActiveSheet(i + 1);
    });
}

function refreshChecklistStats(ss) {
    var subs = readChecklistSubmissions(ss);
    var sheet = ss.getSheetByName(CHECKLIST_STATS_SHEET);
    if (!sheet) sheet = ss.insertSheet(CHECKLIST_STATS_SHEET, 0);
    fixChecklistSheetOrder(ss);
    sheet.getCharts().forEach(function(c) { sheet.removeChart(c); }); // clear()로는 차트가 안 지워짐
    var oldFilter = sheet.getFilter(); // 현황판 헤더 필터 — 표 크기가 매번 달라지므로 지우고 아래에서 새로 만듦
    if (oldFilter) oldFilter.remove();
    sheet.clear();
    sheet.clearNotes();
    sheet.setConditionalFormatRules([]);
    sheet.setRowHeights(1, sheet.getMaxRows(), 21); // 이전 갱신 때 늘려둔 헤더 행 높이 초기화

    var findItem = function(s, section, names) {
        for (var i = 0; i < s.items.length; i++) {
            var it = s.items[i];
            if ((!section || it.section === section) && names.indexOf(it.item) !== -1) return it;
        }
        return null;
    };
    var itemValue = function(s, name) { var it = findItem(s, null, [name]); return it ? it.result : ''; };
    var badItemsOf = function(s) { return s.items.filter(function(it) { return isChecklistBadResult(it.result); }); };
    // 제품 종류 칸 — LCD는 버전까지 "LCD (신형)"처럼 표시. '표시 방식'은 이름 변경 전 기존 데이터
    var productTypeLabel = function(s) {
        var type = itemValue(s, '제품 종류') || itemValue(s, '표시 방식');
        var ver = itemValue(s, 'LCD 버전');
        return type === 'LCD' && ver ? 'LCD (' + ver.replace(' 로고', '') + ')' : type;
    };
    var num = function(v) { return v === '' || isNaN(Number(v)) ? '' : Number(v); };

    // 장소+세부구역(제품 1대) 단위로 묶기 — subs가 날짜 오름차순이라 마지막에 남는 게 최근 점검
    var locMap = {}, locOrder = [];
    subs.forEach(function(s) {
        if (!s.location) return;
        var key = s.location + ' // ' + s.area;
        var L = locMap[key];
        if (!L) { L = locMap[key] = { name: s.location, area: s.area, count: 0, last: null }; locOrder.push(L); }
        L.count++;
        L.last = s;
    });
    // 최근에 점검한 곳이 위로 오도록 정렬 (점검일 → 제출시각 내림차순). 다른 기준은 헤더 필터로 정렬
    locOrder.forEach(function(L) { L.lastBad = badItemsOf(L.last).length; });
    var cmp = function(a, b) { return a < b ? -1 : a > b ? 1 : 0; };
    locOrder.sort(function(a, b) {
        return cmp(b.last.date, a.last.date) || cmp(b.last.submittedAt, a.last.submittedAt) || cmp(a.name, b.name);
    });
    var placeCount = Object.keys(locOrder.reduce(function(m, L) { m[L.name] = 1; return m; }, {})).length;

    var thisMonth = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM');
    var monthCount = subs.filter(function(s) { return s.date.substring(0, 7) === thisMonth; }).length;
    var badLocCount = locOrder.filter(function(L) { return L.lastBad > 0; }).length;

    var row = 1;
    sheet.getRange(row, 1).setValue('점검 현황판').setFontSize(16).setFontWeight('bold').setFontColor(STATS_COLOR.title);
    sheet.getRange(row, 3).setValue('마지막 업데이트 ' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm'))
        .setFontColor(STATS_COLOR.sub);
    row += 2;

    // ── 요약 숫자 ─────────────────────────────────────────────
    var kpis = [['총 점검', subs.length + '건'], ['점검 장소', placeCount + '곳' + (locOrder.length > placeCount ? ' / ' + locOrder.length + '구역' : '')],
        ['이번 달 점검', monthCount + '건'], ['최근 점검 이상', badLocCount + '곳']];
    // 1열을 고정해두면 고정선을 넘는 셀 병합이 안 되므로, 병합 없이 한 칸씩 사용
    kpis.forEach(function(k, i) {
        var col = 1 + i;
        sheet.getRange(row, col).setValue(k[0]).setFontColor(STATS_COLOR.sub).setHorizontalAlignment('center')
            .setBackground('#f8f9fa').setWrap(true);
        sheet.getRange(row + 1, col).setValue(k[1]).setFontSize(20).setFontWeight('bold')
            .setHorizontalAlignment('center').setBackground('#f8f9fa')
            .setFontColor(i === 3 && badLocCount > 0 ? STATS_COLOR.badText : STATS_COLOR.title);
    });
    sheet.setRowHeight(row + 1, 42);
    row += 3;

    // ── 점검자별 마지막 점검 일시 — 처음 제출한 순서대로 오른쪽으로 한 칸씩 늘어남 ──
    var inspMap = {}, inspOrder = [];
    subs.forEach(function(s) {
        if (!s.inspector) return;
        if (!inspMap[s.inspector]) { inspMap[s.inspector] = { name: s.inspector, last: '' }; inspOrder.push(inspMap[s.inspector]); }
        if (s.submittedAt > inspMap[s.inspector].last) inspMap[s.inspector].last = s.submittedAt;
    });
    sheet.getRange(row, 1, 2, 1).setValues([['점검자'], ['마지막 점검']])
        .setFontWeight('bold').setFontColor(STATS_COLOR.sub).setBackground('#f8f9fa').setVerticalAlignment('middle');
    if (inspOrder.length) {
        var inspRange = sheet.getRange(row, 2, 2, inspOrder.length);
        inspRange.setNumberFormat('@') // 일시가 날짜로 자동 변환되지 않게
            .setValues([
                inspOrder.map(function(p) { return p.name; }),
                inspOrder.map(function(p) { return p.last.replace(' ', '\n'); }) // 좁은 열에서도 보이게 날짜/시간 두 줄로
            ])
            .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true).setBackground('#f8f9fa')
            .setBorder(true, true, true, true, true, true, '#dadce0', SpreadsheetApp.BorderStyle.SOLID);
        sheet.getRange(row, 2, 1, inspOrder.length).setFontWeight('bold');
    }
    sheet.setRowHeight(row + 1, 36);
    row += 3;

    function writeTitle(text, sub) {
        sheet.getRange(row, 1).setValue(text).setFontSize(12).setFontWeight('bold').setFontColor(STATS_COLOR.title);
        if (sub) sheet.getRange(row, 3).setValue(sub).setFontColor(STATS_COLOR.sub);
        row++;
    }
    function writeHeader(header) {
        sheet.getRange(row, 1, 1, header.length).setValues([header])
            .setFontWeight('bold').setBackground(STATS_COLOR.header).setFontColor('#ffffff')
            .setWrap(true).setVerticalAlignment('middle').setHorizontalAlignment('center');
        sheet.setRowHeight(row, 40);
        row++;
    }

    // 차트가 있는 요약 표(이상 발생 항목/월별 현황)를 위에, 계속 길어지는 장소별 현황판을 맨 아래에 둠 —
    // 길어지는 표 아래에 차트를 두면 현황판 길이가 바뀔 때 차트가 표 위로 떠서 점검 항목을 덮는 문제가 있었음
    var CHART_ROWS = 16; // 차트(높이 300px)가 다음 표를 가리지 않도록 확보하는 행 수
    var CHART_COL = 5;
    var placeLabel = function(s) { return s.area ? s.location + ' / ' + s.area : s.location; };
    // 숫자 칸 메모 — 어느 장소에서 생긴 이상인지 최근 것부터 보여줌. 메모가 너무 길어지지 않게 개수 제한
    var NOTE_LIMIT = 30;
    var noteLines = function(lines) {
        var shown = lines.slice(0, NOTE_LIMIT);
        if (lines.length > NOTE_LIMIT) shown.push('… 외 ' + (lines.length - NOTE_LIMIT) + '건');
        return shown.join('\n');
    };
    var byRecent = function(a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; };

    // ── 1) 이상 발생 항목 (누적) — 이상이 한 번이라도 나온 항목만 ────────────
    var badMap = {}, badOrder = [];
    subs.forEach(function(s) {
        badItemsOf(s).forEach(function(it) {
            var k = it.section + ' ' + it.item;
            var m = badMap[k];
            if (!m) { m = badMap[k] = { key: k, count: 0, locs: {}, entries: [] }; badOrder.push(m); }
            m.count++;
            var pl = placeLabel(s);
            m.locs[pl] = (m.locs[pl] || 0) + 1;
            m.entries.push({ date: s.date, text: s.date + '  ' + pl + (it.note ? ' — ' + it.note : '') });
        });
    });
    badOrder.sort(function(a, b) { return b.count - a.count; });
    writeTitle('이상 발생 항목 (누적)', '숫자 칸에 마우스를 올리면 장소와 이상 내용이 보입니다');
    var badHeader = ['항목', '이상 건수', '발생 장소 수'];
    var blockStart = row;
    writeHeader(badHeader);
    if (badOrder.length) {
        var badRows = badOrder.map(function(m) { return [m.key, m.count, Object.keys(m.locs).length]; });
        sheet.getRange(row, 1, badRows.length, badHeader.length).setValues(badRows)
            .setBorder(true, true, true, true, true, true, '#dadce0', SpreadsheetApp.BorderStyle.SOLID);
        sheet.getRange(row, 2, badRows.length, 2).setHorizontalAlignment('center');
        sheet.getRange(row, 2, badRows.length, 2).setNotes(badOrder.map(function(m) {
            var countNote = noteLines(m.entries.sort(byRecent).map(function(e) { return e.text; }));
            var locNote = noteLines(Object.keys(m.locs).sort(function(a, b) { return m.locs[b] - m.locs[a]; })
                .map(function(pl) { return pl + ' (' + m.locs[pl] + '건)'; }));
            return [countNote, locNote];
        }));
        sheet.insertChart(sheet.newChart().setChartType(Charts.ChartType.BAR)
            .addRange(sheet.getRange(row - 1, 1, badRows.length + 1, 2))
            .setNumHeaders(1)
            .setPosition(blockStart, CHART_COL, 0, 0)
            .setOption('title', '항목별 이상 건수')
            .setOption('legend', { position: 'none' })
            .setOption('colors', ['#d93025'])
            .setOption('width', 560).setOption('height', 300)
            .build());
        row += Math.max(badRows.length, CHART_ROWS - 1);
    } else {
        sheet.getRange(row, 1).setValue('이상 항목 없음').setFontColor(STATS_COLOR.okText);
        row++;
    }
    row += 2;

    // ── 2) 월별 점검 현황 ────────────────────────────────────
    var monthMap = {}, monthOrder = [];
    subs.forEach(function(s) {
        var ym = s.date.substring(0, 7);
        var m = monthMap[ym];
        if (!m) { m = monthMap[ym] = { ym: ym, count: 0, withBad: 0, entries: [] }; monthOrder.push(m); }
        m.count++;
        var bad = badItemsOf(s);
        if (bad.length) {
            m.withBad++;
            m.entries.push({ date: s.date, text: s.date.substring(5) + '  ' + placeLabel(s) + ': ' +
                bad.map(function(it) { return it.section + ' ' + it.item; }).join(', ') });
        }
    });
    writeTitle('월별 점검 현황', '이상 발견 건수 칸에 마우스를 올리면 장소가 보입니다');
    var monthHeader = ['월', '점검 건수', '이상 발견 건수'];
    blockStart = row;
    writeHeader(monthHeader);
    if (monthOrder.length) {
        var monthRows = monthOrder.map(function(m) { return [m.ym, m.count, m.withBad]; });
        sheet.getRange(row, 1, monthRows.length, 1).setNumberFormat('@'); // '2026-10'이 날짜로 자동 변환되지 않게
        sheet.getRange(row, 1, monthRows.length, monthHeader.length).setValues(monthRows)
            .setBorder(true, true, true, true, true, true, '#dadce0', SpreadsheetApp.BorderStyle.SOLID);
        sheet.getRange(row, 1, monthRows.length, monthHeader.length).setHorizontalAlignment('center');
        sheet.getRange(row, 3, monthRows.length, 1).setNotes(monthOrder.map(function(m) {
            return [noteLines(m.entries.sort(byRecent).map(function(e) { return e.text; }))];
        }));
        sheet.insertChart(sheet.newChart().setChartType(Charts.ChartType.COLUMN)
            .addRange(sheet.getRange(row - 1, 1, monthRows.length + 1, monthHeader.length))
            .setNumHeaders(1)
            .setPosition(blockStart, CHART_COL, 0, 0)
            .setOption('title', '월별 점검 / 이상 발견 건수')
            .setOption('legend', { position: 'bottom' })
            .setOption('colors', ['#1a73e8', '#d93025'])
            .setOption('width', 560).setOption('height', 300)
            .build());
        row += Math.max(monthRows.length, CHART_ROWS - 1);
    } else {
        sheet.getRange(row, 1).setValue('데이터 없음').setFontColor(STATS_COLOR.naText);
    }
    row += 2;

    // ── 3) 장소별 현황판 ──────────────────────────────────────
    // 장소 1곳 = 1줄. 최근 점검 결과를 항목마다 ✓/✗로 보여주고, ✗ 칸에 마우스를 올리면 이상 내용(메모)이 보임
    writeTitle('장소·구역별 현황 (최근 점검 기준)', '✗ 칸에 마우스를 올리면 이상 내용이 보입니다 · 장소명을 누르면 장소 시트로 이동');
    var infoHeader = ['점검장소 / 세부구역', '상태', '최근 점검일', '최근 점검자', '제품 종류', '누적 점검'];
    var usageHeader = ['먼지봉투\n사용률/시간', 'HEPA\n사용률/시간', '모터\n사용률/시간'];
    var boardHeader = infoHeader.concat(CHECKLIST_BOARD_ITEMS.map(function(b) { return b.header; }), usageHeader);
    writeHeader(boardHeader);
    var boardStart = row;
    var itemCol0 = infoHeader.length + 1;
    var usageCol0 = itemCol0 + CHECKLIST_BOARD_ITEMS.length;
    if (locOrder.length) {
        var values = [], bgs = [], fcs = [], notes = [];
        locOrder.forEach(function(L) {
            var last = L.last;
            var sheetRef = ss.getSheetByName(locationSheetName(L.name));
            var label = L.area ? L.name + ' / ' + L.area : L.name;
            var nameCell = sheetRef
                ? '=HYPERLINK("#gid=' + sheetRef.getSheetId() + '","' + label.replace(/"/g, '""') + '")'
                : label;
            var status = L.lastBad ? '이상 ' + L.lastBad + '건' : '정상';
            var v = [nameCell, status, last.date, last.inspector,
                productTypeLabel(last), L.count];
            var bg = ['#ffffff', L.lastBad ? STATS_COLOR.bad : STATS_COLOR.ok, '#ffffff', '#ffffff', '#ffffff', '#ffffff'];
            var fc = ['#1a73e8', L.lastBad ? STATS_COLOR.badText : STATS_COLOR.okText, '#202124', '#202124', '#202124', '#202124'];
            var nt = ['', L.lastBad ? badItemsOf(last).map(function(it) {
                return it.section + ' ' + it.item + (it.note ? ' — ' + it.note : '');
            }).join('\n') : '', '', '', '', ''];
            CHECKLIST_BOARD_ITEMS.forEach(function(b) {
                var it = findItem(last, b.section, b.items);
                if (!it || !it.result) { v.push('-'); bg.push(STATS_COLOR.na); fc.push(STATS_COLOR.naText); nt.push(''); }
                else if (isChecklistBadResult(it.result)) { v.push('✗'); bg.push(STATS_COLOR.bad); fc.push(STATS_COLOR.badText); nt.push(it.note || ''); }
                else { v.push('✓'); bg.push(STATS_COLOR.ok); fc.push(STATS_COLOR.okText); nt.push(''); }
            });
            // %는 숫자로 넣어 색 단계가 적용되게 하고, 구형 제품의 사용시간은 "120 Hr" 글자로 넣어 색 단계에서 빠지게 함
            ['먼지봉투', 'HEPA필터', '모터'].forEach(function(name) {
                var pct = num(itemValue(last, name + ' 사용률(%)'));
                var hr = itemValue(last, name + ' 사용시간(Hr)');
                v.push(pct !== '' ? pct : (hr !== '' ? hr + ' Hr' : '')); bg.push('#ffffff'); fc.push('#202124'); nt.push('');
            });
            values.push(v); bgs.push(bg); fcs.push(fc); notes.push(nt);
        });
        var n = values.length;
        sheet.getRange(boardStart, 3, n, 1).setNumberFormat('@'); // 최근 점검일이 날짜로 자동 변환되지 않게
        var boardRange = sheet.getRange(boardStart, 1, n, boardHeader.length);
        boardRange.setValues(values).setBackgrounds(bgs).setFontColors(fcs).setNotes(notes)
            .setVerticalAlignment('middle').setBorder(true, true, true, true, true, true, '#dadce0', SpreadsheetApp.BorderStyle.SOLID);
        sheet.getRange(boardStart, 2, n, boardHeader.length - 1).setHorizontalAlignment('center');
        sheet.getRange(boardStart, itemCol0, n, CHECKLIST_BOARD_ITEMS.length).setFontWeight('bold').setFontSize(12);
        sheet.getRange(boardStart, 2, n, 1).setFontWeight('bold');
        // 소모품 사용률은 초록(낮음) → 빨강(높음) 색 단계로 교체 시기를 한눈에
        sheet.setConditionalFormatRules([
            SpreadsheetApp.newConditionalFormatRule()
                .setGradientMinpointWithValue('#e6f4ea', SpreadsheetApp.InterpolationType.NUMBER, '0')
                .setGradientMidpointWithValue('#fef7e0', SpreadsheetApp.InterpolationType.NUMBER, '60')
                .setGradientMaxpointWithValue('#f4c7c3', SpreadsheetApp.InterpolationType.NUMBER, '100')
                .setRanges([sheet.getRange(boardStart, usageCol0, n, usageHeader.length)]).build()
        ]);
        sheet.getRange(boardStart, usageCol0, n, usageHeader.length).setNumberFormat('0"%"');
        // 헤더에 필터를 자동으로 걸어둠 — 다시 그릴 때마다 사라지므로 매번 새로 생성 (시트당 필터는 1개만 가능)
        sheet.getRange(boardStart - 1, 1, n + 1, boardHeader.length).createFilter();
        row += n;
    } else {
        sheet.getRange(row, 1).setValue('데이터 없음').setFontColor(STATS_COLOR.naText);
        row++;
    }
    row += 2;

    // 헤더 필터 아이콘(약 24px)이 글자를 가리지 않도록 여유 있게 잡음
    sheet.setColumnWidth(1, 240);
    for (var c = 3; c <= boardHeader.length; c++) {
        sheet.setColumnWidth(c, c < itemCol0 ? 120 : (c < usageCol0 ? 95 : 110));
    }
    sheet.setColumnWidth(4, 95); // 최근 점검자
    sheet.setColumnWidth(5, 80); // 제품 종류
    sheet.setColumnWidth(6, 80); // 누적 점검
    sheet.setColumnWidth(2, 180); // 상태 열 — B4 요약 숫자 "N곳 / N구역"(큰 글씨)도 잘리지 않는 너비
    sheet.setFrozenColumns(1);
    sheet.setHiddenGridlines(true);
}

// ===== 업체 담당자 서명 =====
// 서명이 담긴 점검 완료 보고서 PDF는 "Air Max 점검표" 스프레드시트와 같은 폴더 안의 "Air Max 점검표 서명" 폴더에 저장.
// 폴더 ID는 스크립트 속성에 기억해 두고 재사용함. 파일은 스프레드시트와 같은 계정 소유라 공유 설정도 같이 따라감
var CHECKLIST_SIGN_FOLDER_PROP = 'CHECKLIST_SIGN_FOLDER_ID';
function getChecklistSignatureFolder(ss) {
    var props = PropertiesService.getScriptProperties();
    var id = props.getProperty(CHECKLIST_SIGN_FOLDER_PROP);
    if (id) {
        try { return DriveApp.getFolderById(id); } catch (e) { /* 폴더가 지워졌으면 새로 만듦 */ }
    }
    var parents = DriveApp.getFileById(ss.getId()).getParents();
    var parent = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
    var folder = parent.createFolder('Air Max 점검표 서명');
    props.setProperty(CHECKLIST_SIGN_FOLDER_PROP, folder.getId());
    return folder;
}
// ===== 점검표 메일 발송 설정 =====
var CHECKLIST_MAIL_CC = 'rnd@testonic.co.kr';     // 모든 점검표 메일의 참조
var CHECKLIST_MAIL_REPLY_TO = '';                 // 고객이 답장하면 받을 주소 — 정해지면 여기에 입력 (비워두면 이 GAS 계정 주소로 감)
var CHECKLIST_MAIL_SENDER_NAME = '테스토닉 Air Max 점검';

// 앱의 점검 완료 보고 화면에서 업체 담당자 서명이 담긴 PDF를 받아
//  ① 드라이브에 저장하고  ② 담당자 이메일이 있으면 PDF를 첨부해 메일로 보내고(참조 CHECKLIST_MAIL_CC)
//  ③ 같은 제출 건에 '업체 담당자 확인'(이름 + PDF 링크), '업체 담당자 이메일'(주소 + 발송 결과) 행을 기록함.
// 같은 제출 건에 다시 서명하면 새 행을 만들지 않고 기존 행을 고쳐 씀. 드라이브 저장과 메일 발송은 서로 독립적으로
// 시도해서, 하나가 실패해도 다른 하나는 진행됨
function handleAttachChecklistSignature(data) {
    try {
        var submissionId = String(data.submissionId || '').trim();
        if (!submissionId) return buildJson({ success: false, error: '제출번호가 없습니다.' });
        if (!data.file) return buildJson({ success: false, error: 'PDF가 없습니다.' });
        var email = String(data.email || '').trim();
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return buildJson({ success: false, error: '이메일 주소 형식이 올바르지 않습니다: ' + email });
        var ss = getOrCreateChecklistSpreadsheet();
        var sheet = ss.getSheetByName(CHECKLIST_MAIN_SHEET);
        var H = CHECKLIST_LONG_HEADERS;
        var lastRow = sheet.getLastRow();
        if (lastRow < 2) return buildJson({ success: false, error: '점검표 데이터가 없습니다.' });
        var values = sheet.getRange(2, 1, lastRow - 1, H.length).getValues();
        var idCol = H.indexOf('제출ID'), itemCol = H.indexOf('항목'), sectionCol = H.indexOf('구분');
        var baseRow = null, existing = {};
        values.forEach(function(row, i) {
            if (String(row[idCol]).trim() !== submissionId) return;
            if (!baseRow) baseRow = row;
            var item = String(row[itemCol]).trim();
            if (item === '업체 담당자 확인' || item === '업체 담당자 이메일') existing[item] = i;
        });
        if (!baseRow) return buildJson({ success: false, error: '해당 제출 건을 찾지 못했습니다: ' + submissionId });
        var managerName = normalizeChecklistLocation(data.managerName);
        var fileName = String(data.fileName || ('점검보고서_' + submissionId + '.pdf')).replace(/[\\\/:*?"<>|]/g, '_');
        var blob = Utilities.newBlob(Utilities.base64Decode(String(data.file)), 'application/pdf', fileName);

        var url = '', driveError = '';
        try { url = getChecklistSignatureFolder(ss).createFile(blob.copyBlob()).getUrl(); }
        catch (e) { driveError = e.message; }

        var mailed = false, mailError = '';
        if (email) {
            try {
                sendChecklistReportMail(email, blob, baseRow, managerName);
                mailed = true;
            } catch (e) { mailError = e.message; }
        }

        var base = baseRow.slice(0, sectionCol);
        var rowsToWrite = [
            ['업체 담당자 확인', base.concat(['완료보고', '업체 담당자 확인', managerName, url || ('PDF 저장 실패: ' + driveError)])]
        ];
        if (email) {
            rowsToWrite.push(['업체 담당자 이메일', base.concat(['완료보고', '업체 담당자 이메일', email,
                mailed ? ('메일 발송 완료 (참조 ' + CHECKLIST_MAIL_CC + ')') : ('메일 발송 실패: ' + mailError)])]);
        }
        var lock = LockService.getScriptLock();
        lock.waitLock(20000);
        try {
            rowsToWrite.forEach(function(x) {
                if (existing[x[0]] !== undefined) {
                    sheet.getRange(existing[x[0]] + 2, 1, 1, H.length).setValues([x[1]]);
                } else {
                    var startRow = sheet.getLastRow() + 1;
                    if (startRow > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 1000);
                    sheet.getRange(startRow, 1, 1, H.length).setValues([x[1]]);
                }
            });
        } finally {
            lock.releaseLock();
        }
        var errors = [];
        if (driveError) errors.push('드라이브 저장 실패: ' + driveError);
        if (mailError) errors.push('메일 발송 실패: ' + mailError);
        return buildJson({ success: !errors.length, url: url, mailed: mailed, error: errors.join(' / ') });
    } catch (err) {
        return buildJson({ success: false, error: err.message });
    }
}

// 업체 담당자에게 점검표 PDF를 첨부해 메일 발송 (참조: CHECKLIST_MAIL_CC)
function sendChecklistReportMail(email, pdfBlob, baseRow, managerName) {
    var H = CHECKLIST_LONG_HEADERS;
    var tz = Session.getScriptTimeZone();
    var cell = function(name) { return checklistCellText(baseRow[H.indexOf(name)], tz); };
    var location = cell('점검장소'), area = cell('세부구역'), date = cell('점검일자'), inspector = cell('점검자');
    var dateDot = date.replace(/-/g, '.');
    var place = location + (area ? ' ' + area : '');
    var subject = '[테스토닉] 에어맥스 클린매트 점검 결과 안내 — ' + location + (area ? ' / ' + area : '') + ' (' + dateDot + ')';
    var lines = [
        (managerName ? managerName + '님, ' : '') + '안녕하세요. ㈜테스토닉입니다.',
        '',
        place + ' 에어맥스 클린매트 점검을 완료하여 점검표를 첨부드립니다.',
        '',
        '· 업체명: ' + location,
        area ? '· 설치 장소: ' + area : null,
        '· 점검 일자: ' + dateDot,
        '· 점검자: ' + inspector,
        '',
        '문의: 031-432-4380 / www.testonic.co.kr',
        '감사합니다.'
    ].filter(function(l) { return l !== null; });
    var options = {
        cc: CHECKLIST_MAIL_CC,
        name: CHECKLIST_MAIL_SENDER_NAME,
        attachments: [pdfBlob],
        htmlBody: lines.map(function(l) {
            return l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }).join('<br>')
    };
    if (CHECKLIST_MAIL_REPLY_TO) options.replyTo = CHECKLIST_MAIL_REPLY_TO;
    MailApp.sendEmail(email, subject, lines.join('\n'), options);
}
// GAS 편집기에서 한 번 직접 실행 — 메일 발송 권한을 승인받고 오늘 남은 발송 가능 수를 확인
// (하루 한도는 "받는 사람 수" 기준: 담당자 1명 + 참조 1명 = 메일 1통당 2명)
function authorizeMail() {
    Logger.log('메일 권한 확인 완료 — 오늘 남은 발송 가능 인원: ' + MailApp.getRemainingDailyQuota() + '명');
    Logger.log('이제 [배포 관리 → 편집 → 새 버전]으로 재배포하세요.');
}
// GAS 편집기에서 한 번 직접 실행 — 서명 PDF 저장에 필요한 드라이브 권한(폴더/파일 만들기)을 승인받고,
// 실제 저장 경로와 똑같이 서명 폴더를 찾거나 만들어서 정상 동작하는지 확인함
function authorizeDrive() {
    var folder = getChecklistSignatureFolder(getOrCreateChecklistSpreadsheet());
    Logger.log('드라이브 권한 확인 완료 — 서명 폴더: ' + folder.getUrl());
    Logger.log('이제 [배포 관리 → 편집 → 새 버전]으로 재배포하세요.');
}

// ===== 숨은 미니 게임 "테스토닉 키우기" 저장소 =====
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
    var ss = null;
    if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
    if (!ss) {
        ss = SpreadsheetApp.create('Air Max 게임 DB');
        props.setProperty(GAME_SHEET_ID_PROP, ss.getId());
    }
    return ss;
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
function gameFindRow(values, playerId) {
    for (var i = 0; i < values.length; i++) if (String(values[i][0]) === playerId) return i;
    return -1;
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
function handleGameAction(data) {
    try {
        var sheet = getGameSheet();
        var readValues = function() {
            var last = sheet.getLastRow();
            return last >= 2 ? sheet.getRange(2, 1, last - 1, GAME_HEADERS.length).getValues() : [];
        };
        var values = readValues();
        var playerId = String(data.playerId || '');
        var token = String(data.token || '');

        if (data.action === 'gameRanking') {
            // 승진 순위: 가장 늦게 입사한(어려운) 직원 → 그 직원의 단계 → 레벨 → 누적 실적
            // board='stairs': 무한의 계단 최고 층수 순위 (기록 있는 사람만)
            var board = data.board === 'stairs' ? 'stairs' : 'promo';
            var list = values.filter(function(r) { return r[0] && r[1]; }).map(function(r) {
                var s = gameReadState(r) || {};
                return { nickname: String(r[1]), ch: Number(s.top) || 0, tier: Number(s.tier) || 0, stage: Number(r[2]) || 1, level: Number(r[3]) || 1, total: Number(r[4]) || 0, stairs: Number(s.stairsBest) || 0, me: String(r[0]) === playerId };
            });
            if (board === 'stairs') {
                list = list.filter(function(x) { return x.stairs > 0; });
                list.sort(function(a, b) { return b.stairs - a.stairs; });
            } else {
                list.sort(function(a, b) { return (b.tier - a.tier) || (b.stage - a.stage) || (b.level - a.level) || (b.total - a.total); });
            }
            var myRank = 0;
            list.forEach(function(x, i) { if (x.me) myRank = i + 1; });
            return buildJson({ success: true, top: list.slice(0, 10), myRank: myRank, players: list.length });
        }

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
                    return buildJson({ success: true, created: true, playerId: id, token: tok, nickname: nickname, state: null });
                }
                var row = values[at], rowId = String(row[0]);
                if (!row[8]) return buildJson({ success: false, error: '이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해주세요.' });
                if (gameHash(rowId + ':' + pin) !== String(row[8])) {
                    cache.put(failKey, String(fails + 1), GAME_PIN_LOCK_SEC);
                    return buildJson({ success: false, error: '이미 사용 중인 닉네임이거나 PIN이 틀렸습니다. (' + (GAME_PIN_MAX_FAIL - fails - 1) + '번 남음)' });
                }
                cache.remove(failKey);
                var t = String(row[9] || '');
                if (!t) { t = gameNewId(); sheet.getRange(at + 2, 10).setValue(t); }
                return buildJson({ success: true, created: false, playerId: rowId, token: t, nickname: String(row[1]), state: gameReadState(row) });
            } finally {
                lock.releaseLock();
            }
        }

        if (!/^[A-Za-z0-9-]{16,64}$/.test(playerId)) return buildJson({ success: false, error: '플레이어 정보가 올바르지 않습니다.' });
        var idx = gameFindRow(values, playerId);
        // PIN 계정은 세션 토큰이 맞아야 불러오기/저장 가능. PIN 없는 예전 행은 예전 앱(토큰 없음)이 랭킹 초기화 전까지 계속 쓸 수 있게 둠
        var legacy = idx >= 0 && !values[idx][8];
        if (idx >= 0 && !legacy && String(values[idx][9]) !== token) return buildJson({ success: false, auth: false, error: '다시 로그인해주세요.' });
        if (idx < 0 && token) return buildJson({ success: false, auth: false, error: '계정을 찾을 수 없습니다. 다시 로그인해주세요.' });

        if (data.action === 'gameLoad') {
            if (idx < 0) return buildJson({ success: true, found: false });
            var saved = gameReadState(values[idx]);
            return buildJson({ success: true, found: !!saved, nickname: String(values[idx][1]), state: saved });
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
        return buildJson({ success: true, savedAt: saveNow });
    } catch (err) {
        return buildJson({ success: false, error: err.message });
    }
}

// ===== 점검표 조회 / PDF / 메일 다시 보내기 =====
// 관리자(토큰 확인)는 전체 점검표를, 점검자는 자기 이름(등록된 점검자)으로 제출한 최근 CHECKLIST_VIEW_DAYS일 것만 볼 수 있음.
// 메일 다시 보내기는 서명 PDF가 있는 건만 가능하고, 보낼 때마다 '업체 담당자 이메일 재발송' 행을 남김
var CHECKLIST_VIEW_DAYS = 7;
var CHECKLIST_LIST_LIMIT = 300;
function checklistAccess(data) {
    if (getAdminLevel(data.adminToken)) return { admin: true };
    var name = normalizeChecklistLocation(data.inspector);
    if (name && getInspectorList().indexOf(name) !== -1) return { admin: false, inspector: name };
    return null;
}
function checklistSubmittedTime(s) {
    var t = new Date(String(s.submittedAt).replace(' ', 'T') + '+09:00').getTime();
    return isNaN(t) ? 0 : t;
}
function checklistCanSee(acc, s) {
    if (acc.admin) return true;
    return s.inspector === acc.inspector && checklistSubmittedTime(s) >= Date.now() - CHECKLIST_VIEW_DAYS * 86400000;
}
function checklistSummary(s) {
    var sum = { id: s.id, submittedAt: s.submittedAt, date: s.date, location: s.location, area: s.area,
        inspector: s.inspector, type: s.type, bad: 0, signMode: '', managerName: '', pdfUrl: '', email: '', mailStatus: '', product: '' };
    s.items.forEach(function(it) {
        if (isChecklistBadResult(it.result)) sum.bad++;
        if (it.item === '업체 담당자 서명') sum.signMode = it.result;
        if (it.item === '업체 담당자 확인') { sum.managerName = it.result; if (/^https?:/.test(it.note)) sum.pdfUrl = it.note; }
        if (it.item === '업체 담당자 이메일' || it.item === '업체 담당자 이메일 재발송') { sum.email = it.result; sum.mailStatus = it.note; }
        if (it.item === '제품 종류' || it.item === '표시 방식') sum.product = it.result;
    });
    sum.signed = !!sum.pdfUrl;
    return sum;
}
function handleChecklistRecords(data) {
    try {
        var acc = checklistAccess(data);
        if (!acc) return buildJson({ success: false, code: 'NO_ACCESS', error: '등록된 점검자 이름이나 관리자 인증이 필요합니다.' });
        var ss = getOrCreateChecklistSpreadsheet();
        var subs = readChecklistSubmissions(ss).filter(function(s) { return checklistCanSee(acc, s); });

        if (data.action === 'listChecklists') {
            if (acc.admin) {
                var from = String(data.from || ''), to = String(data.to || '');
                var who = normalizeChecklistLocation(data.inspectorFilter), q = normalizeChecklistLocation(data.q);
                subs = subs.filter(function(s) {
                    if (from && s.date < from) return false;
                    if (to && s.date > to) return false;
                    if (who && s.inspector.indexOf(who) === -1) return false;
                    if (q && (s.location + ' ' + s.area).indexOf(q) === -1) return false;
                    return true;
                });
            }
            subs.sort(function(a, b) { return a.submittedAt < b.submittedAt ? 1 : a.submittedAt > b.submittedAt ? -1 : 0; });
            var total = subs.length;
            return buildJson({ success: true, admin: acc.admin, days: CHECKLIST_VIEW_DAYS, total: total,
                items: subs.slice(0, CHECKLIST_LIST_LIMIT).map(checklistSummary) });
        }

        var id = String(data.submissionId || '');
        var s = null;
        subs.forEach(function(x) { if (x.id === id) s = x; });
        if (!s) return buildJson({ success: false, error: '점검표를 찾을 수 없거나 조회 권한이 없습니다.' });
        var sum = checklistSummary(s);

        if (data.action === 'getChecklist') {
            return buildJson({ success: true, summary: sum, items: s.items });
        }
        if (!sum.pdfUrl) return buildJson({ success: false, error: '서명한 PDF가 없는 점검표입니다.' });
        var m = sum.pdfUrl.match(/\/d\/([A-Za-z0-9_-]+)/) || sum.pdfUrl.match(/[?&]id=([A-Za-z0-9_-]+)/);
        if (!m) return buildJson({ success: false, error: 'PDF 링크를 읽을 수 없습니다.' });
        var file = DriveApp.getFileById(m[1]);

        if (data.action === 'getChecklistPdf') {
            return buildJson({ success: true, fileName: file.getName(), file: Utilities.base64Encode(file.getBlob().getBytes()) });
        }
        // resendChecklistMail
        var email = String(data.email || '').trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return buildJson({ success: false, error: '이메일 주소 형식이 올바르지 않습니다: ' + email });
        var baseRow = [s.id, s.submittedAt, s.location, s.area, s.date, s.inspector, s.type];
        var mailError = '';
        try { sendChecklistReportMail(email, file.getBlob().setName(file.getName()), baseRow, sum.managerName); }
        catch (e) { mailError = e.message; }
        var sheet = ss.getSheetByName(CHECKLIST_MAIN_SHEET);
        var now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
        var who2 = acc.admin ? '관리자' : acc.inspector;
        var row = baseRow.concat(['완료보고', '업체 담당자 이메일 재발송', email,
            (mailError ? '메일 재발송 실패: ' + mailError : '메일 재발송 완료 (참조 ' + CHECKLIST_MAIL_CC + ')') + ' · ' + now + ' · ' + who2]);
        var lock = LockService.getScriptLock();
        lock.waitLock(20000);
        try {
            var startRow = sheet.getLastRow() + 1;
            if (startRow > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 1000);
            sheet.getRange(startRow, 1, 1, CHECKLIST_LONG_HEADERS.length).setValues([row]);
        } finally {
            lock.releaseLock();
        }
        if (mailError) return buildJson({ success: false, error: '메일 발송 실패: ' + mailError });
        return buildJson({ success: true });
    } catch (err) {
        return buildJson({ success: false, error: err.message });
    }
}

// ===== 관리자 인증 =====
// 관리자 비밀번호는 코드에 두지 않고 스크립트 속성에만 저장 (⚙ 프로젝트 설정 → 스크립트 속성):
//   ADMIN_PASSWORD        — 일반 관리자 비밀번호
//   SUPER_ADMIN_PASSWORD  — 슈퍼 관리자 비밀번호
// 로그인에 성공하면 추측할 수 없는 토큰을 발급하고, 관리자 전용 요청은 이 토큰을 확인한 뒤에만 처리.
// 토큰에는 발급 당시 비밀번호의 지문(해시)을 함께 저장해서, 비밀번호를 바꾸면 기존 토큰이 모두 무효가 됨
var ADMIN_ONLY_ACTIONS = {
    addProduct: true, updateProduct: true, deleteProduct: true,
    saveResults: true, getMonthGrid: true, getWeeklyReportDraft: true, saveWeeklyReport: true,
    getInspectors: true, addInspector: true, removeInspector: true
};
var ADMIN_TOKENS_PROP = 'ADMIN_TOKENS';
var ADMIN_TOKEN_LIMIT = 50;          // 저장해 둘 최대 토큰 수 (넘으면 오래된 것부터 정리)
var ADMIN_LOGIN_MAX_FAILS = 10;      // 10분 동안 이만큼 틀리면 잠시 로그인 잠금 (무작위 대입 방지)
function adminPasswordDigest(pw) {
    return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'airmax-admin:' + pw, Utilities.Charset.UTF_8));
}
function readAdminTokens() {
    try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(ADMIN_TOKENS_PROP) || '{}'); } catch (e) { return {}; }
}
function writeAdminTokens(tokens) {
    var keys = Object.keys(tokens).sort(function(a, b) { return tokens[a].at - tokens[b].at; });
    while (keys.length > ADMIN_TOKEN_LIMIT) delete tokens[keys.shift()];
    PropertiesService.getScriptProperties().setProperty(ADMIN_TOKENS_PROP, JSON.stringify(tokens));
}
// 토큰이 유효하면 'super' | 'admin', 아니면 null
function getAdminLevel(token) {
    token = String(token || '');
    if (!token) return null;
    var t = readAdminTokens()[token];
    if (!t) return null;
    var props = PropertiesService.getScriptProperties();
    var pw = props.getProperty(t.level === 'super' ? 'SUPER_ADMIN_PASSWORD' : 'ADMIN_PASSWORD');
    if (!pw || adminPasswordDigest(pw) !== t.pw) return null; // 비밀번호가 바뀌었으면 무효
    return t.level;
}
function handleAdminLogin(data) {
    try {
        var props = PropertiesService.getScriptProperties();
        var superPw = props.getProperty('SUPER_ADMIN_PASSWORD'), adminPw = props.getProperty('ADMIN_PASSWORD');
        if (!superPw && !adminPw) {
            return buildJson({ success: false, error: '관리자 비밀번호가 아직 설정되지 않았습니다. GAS 스크립트 속성(ADMIN_PASSWORD, SUPER_ADMIN_PASSWORD)을 먼저 등록해주세요.' });
        }
        var cache = CacheService.getScriptCache();
        var fails = Number(cache.get('admin_login_fails') || 0);
        if (fails >= ADMIN_LOGIN_MAX_FAILS) {
            return buildJson({ success: false, code: 'ADMIN_LOCKED', error: '비밀번호를 여러 번 틀려 잠시 잠겼습니다. 10분 뒤에 다시 시도해주세요.' });
        }
        var pw = String(data.password || '');
        var level = (superPw && pw === superPw) ? 'super' : ((adminPw && pw === adminPw) ? 'admin' : null);
        if (!level) {
            cache.put('admin_login_fails', String(fails + 1), 600);
            return buildJson({ success: false, code: 'ADMIN_WRONG', error: '비밀번호가 올바르지 않습니다.' });
        }
        var token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
        var tokens = readAdminTokens();
        tokens[token] = { level: level, pw: adminPasswordDigest(pw), at: Date.now() };
        writeAdminTokens(tokens);
        return buildJson({ success: true, level: level, token: token });
    } catch (err) {
        return buildJson({ success: false, error: err.message });
    }
}
function handleAdminCheck(data) {
    var level = getAdminLevel(data.adminToken);
    return buildJson(level ? { success: true, level: level } : { success: false, code: 'ADMIN_REQUIRED' });
}
function handleAdminLogout(data) {
    var tokens = readAdminTokens();
    if (tokens[data.adminToken]) { delete tokens[data.adminToken]; writeAdminTokens(tokens); }
    return buildJson({ success: true });
}

// ===== 점검자 명단 =====
// 점검표는 여기 등록된 이름으로만 제출됨. 스크립트 속성에 JSON 배열로 저장하고, 앱의 관리자 화면에서 추가/삭제함.
// 처음 한 번은 지금까지 점검표를 제출한 점검자(통계 현황판의 점검자 줄과 같은 사람들)로 자동으로 채움
var CHECKLIST_INSPECTORS_PROP = 'CHECKLIST_INSPECTORS';
function getInspectorList() {
    var props = PropertiesService.getScriptProperties();
    var raw = props.getProperty(CHECKLIST_INSPECTORS_PROP);
    if (raw) {
        try { return JSON.parse(raw); } catch (e) { /* 깨진 값이면 아래에서 다시 채움 */ }
    }
    var seen = {}, list = [];
    readChecklistSubmissions(getOrCreateChecklistSpreadsheet()).forEach(function(s) {
        if (s.inspector && !seen[s.inspector]) { seen[s.inspector] = true; list.push(s.inspector); }
    });
    props.setProperty(CHECKLIST_INSPECTORS_PROP, JSON.stringify(list));
    return list;
}
function handleInspectorAction(data) {
    try {
        var list = getInspectorList();
        var name = normalizeChecklistLocation(data.name);
        if (data.action === 'addInspector') {
            if (!name) return buildJson({ success: false, error: '이름을 입력하세요.' });
            if (list.indexOf(name) !== -1) return buildJson({ success: false, error: '이미 등록된 점검자입니다: ' + name });
            list.push(name);
        } else if (data.action === 'removeInspector') {
            list = list.filter(function(n) { return n !== name; });
        }
        if (data.action !== 'getInspectors') {
            PropertiesService.getScriptProperties().setProperty(CHECKLIST_INSPECTORS_PROP, JSON.stringify(list));
        }
        return buildJson({ success: true, inspectors: list });
    } catch (err) {
        return buildJson({ success: false, error: err.message });
    }
}

// 점검표 앱의 장소/세부구역 선택 목록 — 지금까지 제출된 장소와 그 장소에서 쓰인 구역을 최근 점검순으로 반환
function getChecklistPlaces() {
    try {
        var ss = getOrCreateChecklistSpreadsheet();
        var map = {}, list = [];
        readChecklistSubmissions(ss).forEach(function(s) {
            if (!s.location) return;
            var p = map[s.location];
            if (!p) { p = map[s.location] = { name: s.location, areas: [], last: '', managers: [], _mgr: {} }; list.push(p); }
            if (s.area && p.areas.indexOf(s.area) === -1) p.areas.push(s.area);
            if (s.submittedAt > p.last) p.last = s.submittedAt;
            // 메일을 보낸 적 있는 업체 담당자(이름 + 이메일) — 같은 이메일은 가장 최근 이름으로 하나만
            var mName = '', mEmail = '';
            s.items.forEach(function(it) {
                if (it.item === '업체 담당자 확인') mName = it.result;
                if ((it.item === '업체 담당자 이메일' || it.item === '업체 담당자 이메일 재발송') && it.note.indexOf('실패') === -1) mEmail = it.result;
            });
            if (mEmail) {
                var m = p._mgr[mEmail];
                if (!m) { m = p._mgr[mEmail] = { name: mName, email: mEmail, last: '' }; p.managers.push(m); }
                if (s.submittedAt >= m.last) { m.last = s.submittedAt; if (mName) m.name = mName; }
            }
        });
        list.sort(function(a, b) { return a.last < b.last ? 1 : a.last > b.last ? -1 : 0; });
        list.forEach(function(p) {
            p.areas.sort();
            p.managers.sort(function(a, b) { return a.last < b.last ? 1 : a.last > b.last ? -1 : 0; });
            delete p._mgr;
        });
        return buildJson({ success: true, places: list });
    } catch (err) {
        return buildJson({ success: false, error: err.message });
    }
}

// GAS 편집기에서 직접 실행 — 기존 점검표 데이터로 장소별 시트와 통계 시트를 한꺼번에 (재)생성
// 장소명이 바뀌어(괄호 분리 등) 더 이상 해당 데이터가 없는 "장소-" 시트는 삭제함 — 장소 시트는 원본을 수식으로
// 보여주기만 하므로 지워도 데이터 손실은 없음
function rebuildChecklistReports() {
    var ss = getOrCreateChecklistSpreadsheet();
    var keep = {};
    readChecklistSubmissions(ss).forEach(function(s) {
        if (!s.location) return;
        var name = locationSheetName(s.location);
        if (!keep[name]) getOrCreateLocationSheet(ss, s.location, true);
        keep[name] = true;
    });
    ss.getSheets().forEach(function(sh) {
        var name = sh.getName();
        if (name.indexOf(CHECKLIST_LOCATION_PREFIX) === 0 && !keep[name]) {
            ss.deleteSheet(sh);
            Logger.log('사용하지 않는 장소 시트 삭제: ' + name);
        }
    });
    refreshChecklistStats(ss);
    Logger.log('완료: ' + ss.getUrl());
}

// GAS 편집기에서 한 번 직접 실행 — 세부구역 칸이 생기기 전에 "용산아이파크몰(H&M입구)"처럼 괄호로 적은
// 기존 데이터를 점검장소 "용산아이파크몰" + 세부구역 "H&M입구"로 나눈 뒤 장소 시트/통계를 다시 만듦.
// 세부구역이 이미 채워진 행은 건드리지 않으므로 여러 번 실행해도 안전함
// GAS 편집기에서 한 번 직접 실행 — 구형 로고 제품의 사용시간(Hr)이 "사용률(%)" 항목으로 잘못 저장된 기존 행을 바로잡음.
// (앱은 구형일 때 시간으로 보냈지만, 서버가 그 단위 구분을 반영하기 전 버전이었던 기간에 생긴 데이터)
// 대상: 같은 제출 건에 'LCD 버전 = 구형 로고'가 있거나, 사용률(%) 값이 100을 넘는 제출 건
// (앱은 %를 100까지만 입력받으므로 100 초과는 시간 값이 잘못 들어간 경우뿐임). 여러 번 실행해도 안전함
function fixOldLogoUsageRows() {
    var ss = getOrCreateChecklistSpreadsheet();
    var sheet = ss.getSheetByName(CHECKLIST_MAIN_SHEET);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) { Logger.log('데이터 없음'); return; }
    var H = CHECKLIST_LONG_HEADERS;
    var idCol = H.indexOf('제출ID'), itemCol = H.indexOf('항목'), resultCol = H.indexOf('결과');
    var values = sheet.getRange(2, 1, lastRow - 1, H.length).getValues();
    var PCT = ' 사용률(%)', HR = ' 사용시간(Hr)';
    var isUsagePct = function(item) { return /^(먼지봉투|HEPA필터|모터) 사용률\(%\)$/.test(item); };
    var targets = {}, reasons = {};
    values.forEach(function(row) {
        var id = String(row[idCol]).trim(), item = String(row[itemCol]).trim(), result = String(row[resultCol]).trim();
        if (item === 'LCD 버전' && result === '구형 로고') { targets[id] = true; reasons[id] = '구형 로고'; }
        if (isUsagePct(item) && Number(result) > 100) { targets[id] = true; reasons[id] = reasons[id] || ('100 초과 값(' + result + ')'); }
    });
    var count = 0;
    var itemRange = sheet.getRange(2, itemCol + 1, lastRow - 1, 1);
    var items = itemRange.getValues();
    values.forEach(function(row, i) {
        var id = String(row[idCol]).trim(), item = String(row[itemCol]).trim();
        if (!targets[id] || !isUsagePct(item)) return;
        items[i][0] = item.replace(PCT, HR);
        count++;
    });
    if (!count) { Logger.log('바꿀 행 없음'); return; }
    itemRange.setValues(items);
    Object.keys(targets).forEach(function(id) { Logger.log('제출ID ' + id + ' — ' + reasons[id]); });
    Logger.log(count + '개 행을 사용시간(Hr) 항목으로 변경함');
    refreshChecklistStats(ss);
    Logger.log('완료: ' + ss.getUrl());
}

function splitChecklistLocationParens() {
    var ss = getOrCreateChecklistSpreadsheet();
    var sheet = ss.getSheetByName(CHECKLIST_MAIN_SHEET);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) { Logger.log('데이터 없음'); return; }
    var locCol = CHECKLIST_LONG_HEADERS.indexOf('점검장소') + 1;
    var areaCol = CHECKLIST_LONG_HEADERS.indexOf('세부구역') + 1; // 점검장소 바로 오른쪽 열
    var range = sheet.getRange(2, locCol, lastRow - 1, 2);
    var values = range.getValues();
    var changed = {}, count = 0;
    values.forEach(function(row) {
        var loc = normalizeChecklistLocation(row[0]);
        if (String(row[1]).trim() !== '') return;
        var m = loc.match(/^(.+?)\s*\((.+)\)$/);
        if (!m) return;
        row[0] = normalizeChecklistLocation(m[1]);
        row[1] = normalizeChecklistLocation(m[2]);
        changed[loc] = row[0] + ' / ' + row[1];
        count++;
    });
    if (!count) { Logger.log('변환할 괄호 장소 없음'); return; }
    range.setValues(values);
    Object.keys(changed).forEach(function(k) { Logger.log('변환: ' + k + '  →  ' + changed[k]); });
    Logger.log(count + '개 행 변환함');
    rebuildChecklistReports();
}

/* ===================================================================
   점검 히스토리 / 주간 점검 요청서 자동 생성
   =================================================================== */

// 시트명 "YY년 M월" 파싱 → {name, year, month} (매치 안되면 null)
function parseMonthSheetName(name) {
    var m = String(name).trim().match(/^(\d{2})년\s*(\d{1,2})월$/);
    if (!m) return null;
    return { name: name, year: 2000 + parseInt(m[1], 10), month: parseInt(m[2], 10) };
}

// 스프레드시트 내 "YY년 M월" 형식 시트를 연대순(오래된 순)으로 정렬해 반환
function listMonthSheetsAsc(ss) {
    return ss.getSheets()
        .map(function(s) { return parseMonthSheetName(s.getName()); })
        .filter(function(m) { return m; })
        .sort(function(a, b) { return (a.year * 100 + a.month) - (b.year * 100 + b.month); });
}

// 월별 점검 시트에서 "제품 ID" 헤더가 있는 행을 찾음 — 시트마다 상단 요약 행 개수가 달라
// 헤더 행 번호가 고정돼 있지 않으므로, B열 값이 "제품 ID"인 행을 직접 탐색한다.
// 못 찾으면 기존 관례값(8행)으로 폴백.
function findHeaderRow(sheet) {
    var searchRows = Math.min(sheet.getLastRow(), 20);
    if (searchRows < 1) return 8;
    var colB = sheet.getRange(1, 2, searchRows, 1).getValues();
    for (var i = 0; i < colB.length; i++) {
        if (String(colB[i][0]).trim() === '제품 ID') return i + 1;
    }
    return 8;
}

// 월별 점검 시트 하나를 매트릭스로 읽음: 헤더 행(D열~)=날짜 헤더, 다음 행부터 B열=제품ID, D열~=일별 상태
function readSheetMatrix(sheet, year) {
    var headerRow = findHeaderRow(sheet);
    var dataStartRow = headerRow + 1;
    var lastCol = sheet.getLastColumn();
    var lastRow = sheet.getLastRow();
    var headers = [], dates = [];
    if (lastCol >= 4) {
        var headerRange = sheet.getRange(headerRow, 4, 1, lastCol - 3);
        var headerVals    = headerRange.getValues()[0];        // 실제 값 — 셀 서식이 날짜면 Date 객체로 옴
        var headerDisplay = headerRange.getDisplayValues()[0]; // 시트에 표시되는 문자열 그대로 ("07.13(월)")
        headerVals.forEach(function(h, idx) {
            var disp = String(headerDisplay[idx]).trim();
            headers.push(disp);
            if (Object.prototype.toString.call(h) === '[object Date]') {
                dates.push(h);
            } else {
                var m = disp.match(/^(\d{1,2})\.(\d{1,2})/);
                dates.push(m ? new Date(year, parseInt(m[1], 10) - 1, parseInt(m[2], 10)) : null);
            }
        });
    }
    var rowsById = {};
    if (lastRow >= dataStartRow && lastCol >= 4) {
        var idCol = sheet.getRange(dataStartRow, 2, lastRow - dataStartRow + 1, 1).getValues();
        var body  = sheet.getRange(dataStartRow, 4, lastRow - dataStartRow + 1, lastCol - 3).getValues();
        for (var i = 0; i < idCol.length; i++) {
            var id = String(idCol[i][0]).trim();
            if (!id) continue;
            rowsById[id] = body[i];
        }
    }
    return { headers: headers, dates: dates, rowsById: rowsById };
}

// 셀 값 분류 — 'BLANK' | 'PROBLEM:NO'|'PROBLEM:EM'|'PROBLEM:PM' | 'STOP'(OK, 제외사유 등)
function cellKind(raw) {
    var v = String(raw == null ? '' : raw).trim();
    if (!v) return 'BLANK';
    var up = v.toUpperCase();
    if (up === 'NO' || up === 'EM' || up === 'PM') return 'PROBLEM:' + up;
    return 'STOP';
}

// 특정 월 시트를 히스토리 페이지에 표시할 그리드 형태로 반환
function getMonthGrid(data) {
    try {
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var sheet = ss.getSheetByName(data.sheetName);
        if (!sheet) return buildJson({ success: false, error: '시트 없음: ' + data.sheetName });
        var meta = parseMonthSheetName(data.sheetName);
        var year = meta ? meta.year : (new Date()).getFullYear();
        var mat = readSheetMatrix(sheet, year);
        var rows = Object.keys(mat.rowsById).map(function(id) {
            return { id: id, values: mat.rowsById[id] };
        });
        return buildJson({ success: true, sheetName: data.sheetName, dates: mat.headers, rows: rows });
    } catch(err) {
        return buildJson({ success: false, error: err.message });
    }
}

// 주간 점검 요청서 초안 계산 — 연속 문제 발생 시작일, 신규여부, 30일 이상 여부까지 서버에서 전부 계산
// 신규 = 오류 발생 시점이 요청서 생성일(asOfDate) 당일인 항목. 한달 이상(30일+) 항목은 메인 목록에서 빼고
// 하단 섹션에만 담아 중복 표시하지 않는다.
// 날짜 객체를 아시아/서울 달력일 기준 "일수(day number)"로 정규화 — 시트 셀의 Date 객체가
// 스프레드시트/스크립트 타임존 차이로 자정이 아닌 시각을 가질 수 있어, getTime() 직접 비교는
// 당일 데이터가 미묘하게 하루 밀려 누락되는 원인이 됨. 반드시 이 함수로 정규화한 값끼리만 비교할 것.
function dayNumber(d) {
    var s = Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM-dd').split('-');
    return Math.round(Date.UTC(parseInt(s[0], 10), parseInt(s[1], 10) - 1, parseInt(s[2], 10)) / 86400000);
}

function getWeeklyReportDraft(data) {
    try {
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var asOfStr = data.asOfDate;
        var parts = asOfStr.split('-');
        var asOfY = parseInt(parts[0], 10), asOfM = parseInt(parts[1], 10), asOfD = parseInt(parts[2], 10);
        var asOfDayNum = Math.round(Date.UTC(asOfY, asOfM - 1, asOfD) / 86400000);
        var asOfKey = asOfY * 100 + asOfM;

        var monthSheetsMeta = listMonthSheetsAsc(ss).filter(function(m) {
            return (m.year * 100 + m.month) <= asOfKey;
        });
        if (!monthSheetsMeta.length) return buildJson({ success: false, error: '대상 월 시트가 없습니다.' });

        // 제품ID별 타임라인(연대순) 구성
        var timelines = {};
        monthSheetsMeta.forEach(function(m) {
            var sheet = ss.getSheetByName(m.name);
            if (!sheet) return;
            var mat = readSheetMatrix(sheet, m.year);
            mat.dates.forEach(function(d, colIdx) {
                if (!d || dayNumber(d) > asOfDayNum) return;
                Object.keys(mat.rowsById).forEach(function(id) {
                    if (!timelines[id]) timelines[id] = [];
                    timelines[id].push({ date: d, val: mat.rowsById[id][colIdx] });
                });
            });
        });

        var productList = getProductList(ss);
        var items = [];
        Object.keys(timelines).forEach(function(id) {
            var tl = timelines[id];
            if (!tl.length) return;
            var li = tl.length - 1;
            // asOfDate 당일 점검이 아직 안 돼 마지막 칸이 빈칸인 경우, 실제로 기록된
            // 가장 최근 값까지 건너뛰어 "현재 상태"를 판단 (월요일이 아니어도 매일 정상 조회되게)
            while (li >= 0 && cellKind(tl[li].val) === 'BLANK') li--;
            if (li < 0) return;
            var latestKind = cellKind(tl[li].val);
            if (latestKind.indexOf('PROBLEM') !== 0) return; // OK / 제외사유 → 제외
            var code = latestKind.split(':')[1];
            var since = tl[li].date;
            var i = li - 1;
            while (i >= 0) {
                var kind = cellKind(tl[i].val);
                if (kind === 'BLANK') { i--; continue; }
                if (kind.indexOf('PROBLEM') === 0) { since = tl[i].date; i--; continue; }
                break; // OK 또는 제외사유 → 연속 구간 종료
            }
            var sinceDayNum = dayNumber(since);
            var daysOpen = asOfDayNum - sinceDayNum;
            var info = productList[id] || { zone: '', loc: '' };
            items.push({
                id: id, zone: info.zone, loc: info.loc,
                code: code, since: Utilities.formatDate(since, 'Asia/Seoul', 'yy.MM.dd'),
                daysOpen: daysOpen, isOverdue: daysOpen >= 30,
                isNew: sinceDayNum === asOfDayNum
            });
        });

        var rank = function(it) { return it.code === 'NO' ? 1 : 0; };
        var byCodeThenId = function(a, b) {
            var r = rank(a) - rank(b);
            if (r !== 0) return r;
            return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
        };

        var overdueItems = items.filter(function(it) { return it.isOverdue; }).sort(byCodeThenId);
        var mainItems = items.filter(function(it) { return !it.isOverdue; }).sort(byCodeThenId);

        return buildJson({ success: true, asOfDate: asOfStr, items: mainItems, overdueItems: overdueItems });
    } catch(err) {
        return buildJson({ success: false, error: err.message });
    }
}

// 이번 주 요청서 결과를 "점검요청이력" 시트에 저장 (같은 생성일 행은 먼저 삭제 후 재기록 — 재생성 시 중복 방지)
// 시트 레이아웃: 1행 공백, 2행 헤더, 3행부터 데이터, B열부터 시작 (A열/1행은 항상 비움)
function saveWeeklyReport(data) {
    try {
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var sheet = ss.getSheetByName('점검요청이력');
        if (!sheet) return buildJson({ success: false, error: "'점검요청이력' 시트가 없습니다. 먼저 생성해주세요." });

        var lastRow = sheet.getLastRow();
        if (lastRow >= 3) {
            var dateVals = sheet.getRange(3, 2, lastRow - 2, 1).getValues(); // B열=생성일
            for (var r = dateVals.length - 1; r >= 0; r--) {
                var d = dateVals[r][0];
                var dStr = (d instanceof Date) ? Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM-dd') : String(d).trim();
                if (dStr === data.date) sheet.deleteRow(r + 3);
            }
        }

        var rows = (data.items || []).map(function(it) {
            return [data.date, it.id, it.code, it.since, it.isNew ? 'Y' : 'N', it.isOverdue ? 'Y' : 'N',
                    it.zone || '', it.loc || '', data.requester || '', it.remark || ''];
        });
        if (rows.length) {
            var startRow = Math.max(sheet.getLastRow() + 1, 3); // 최소 3행부터 (1행 공백, 2행 헤더 보호)
            sheet.getRange(startRow, 2, rows.length, rows[0].length).setValues(rows);
        }
        return buildJson({ success: true, saved: rows.length });
    } catch(err) {
        return buildJson({ success: false, error: err.message });
    }
}

function buildJson(obj) {
    return ContentService.createTextOutput(JSON.stringify(obj))
        .setMimeType(ContentService.MimeType.JSON);
}
