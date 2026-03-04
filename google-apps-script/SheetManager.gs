/**
 * SheetManager.gs
 * Google 스프레드시트 CRUD 유틸리티
 * QnA Insight SaaS - 데이터 레이어
 */

// ============================================
// 스프레드시트 초기화 & 설정
// ============================================

/**
 * 현재 스프레드시트 반환 (바인딩된 스크립트용)
 */
function getSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * 특정 시트 반환 (없으면 생성)
 */
function getOrCreateSheet(sheetName) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  return sheet;
}

/**
 * 스프레드시트 초기 셋업 - 모든 시트와 헤더를 생성
 * 셀러가 처음 설정할 때 한 번 실행
 */
function initializeSheets() {
  var sheets = {
    'Products': ['product_id', 'product_name', 'seller_id', 'created_at'],
    'Categories': ['category_id', 'parent_id', 'level', 'name', 'product_id', 'sort_order'],
    'Questions': [
      '질문ID', '제품ID', '질문유형', '질문세부유형', '대표질문그룹', '질문내용', '답변내용',
      '작성자', '작성일', '상태', '클릭수', '관련질문수'
    ],
    'Settings': ['key', 'value']
  };

  for (var sheetName in sheets) {
    var sheet = getOrCreateSheet(sheetName);
    var headers = sheets[sheetName];
    // 헤더가 없을 때만 삽입
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
  }

  // 기본 설정값 세팅
  var settingsSheet = getOrCreateSheet('Settings');
  if (settingsSheet.getLastRow() <= 1) {
    settingsSheet.appendRow(['items_per_page', '10']);
    settingsSheet.appendRow(['allow_anonymous_questions', 'true']);
    settingsSheet.appendRow(['require_answer_approval', 'true']);
  }

  // 사용법 시트 생성
  fillGuideSheet();

  return { success: true, message: '시트 초기화 완료' };
}

/**
 * 사용법 시트에 가이드 내용 채우기
 */
function fillGuideSheet() {
  var sheet = getOrCreateSheet('사용법');
  sheet.clear();

  var guide = [
    ['═══════════════════════════════════════════════════════════════'],
    ['QnA Insight - 사용법 가이드'],
    ['═══════════════════════════════════════════════════════════════'],
    [''],
    ['■ 전체 구조'],
    ['카페24 상세페이지 → QnA 위젯(HTML/JS) → 이 스프레드시트에서 데이터를 읽고 씀'],
    [''],
    ['───────────────────────────────────────────────────────────────'],
    ['■ 시트별 역할'],
    ['───────────────────────────────────────────────────────────────'],
    [''],
    ['1. Products (제품 목록)'],
    ['   - 카페24 상품번호를 product_id로 등록'],
    ['   - 컬럼: product_id | product_name | seller_id | created_at'],
    ['   - 예시: PROD_001 | 프리미엄 코튼 맨투맨 | SELLER_001 | 2026-03-01'],
    [''],
    ['2. Categories (카테고리 계층)'],
    ['   - 질문을 분류하는 트리 구조'],
    ['   - 컬럼: category_id | parent_id | level | name | product_id | sort_order'],
    ['   - level 1 = 대분류, level 2 = 중분류, level 3 = 소분류, level 4 = 세부'],
    ['   - parent_id = 상위 카테고리의 category_id (1차 카테고리는 비워두기)'],
    ['   - 예시: CAT_1 | (비움) | 1 | 배송/교환 | PROD_001 | 1'],
    ['   - 예시: CAT_1_1 | CAT_1 | 2 | 교환절차 | PROD_001 | 1'],
    [''],
    ['3. Questions (질문 데이터) ★ 핵심 시트'],
    ['   - 모든 질문과 답변, 클릭수가 저장됨'],
    ['   - 컬럼: 질문ID | 제품ID | 질문유형 | 질문세부유형 | 대표질문그룹 | 질문내용 | 답변내용 | 작성자 | 작성일 | 상태 | 클릭수 | 관련질문수'],
    ['   - 질문유형: 대분류 (예: 배송/교환, 사이즈)'],
    ['   - 질문세부유형: 중분류 (예: 교환절차, 사이즈표)'],
    ['   - 대표질문그룹: AI가 유사 질문을 그룹화한 대표 질문'],
    ['   - 상태 값: pending(답변대기) / answered(답변완료) / hidden(숨김)'],
    ['   - 클릭수는 위젯이 자동으로 업데이트함'],
    [''],
    ['4. Settings (설정)'],
    ['   - items_per_page: 한 페이지에 표시할 질문 수 (기본 10)'],
    ['   - allow_anonymous_questions: 익명 질문 허용 여부 (true/false)'],
    ['   - require_answer_approval: 답변 승인 필요 여부 (true/false)'],
    [''],
    ['───────────────────────────────────────────────────────────────'],
    ['■ 셀러가 직접 해야 하는 작업'],
    ['───────────────────────────────────────────────────────────────'],
    [''],
    ['① 제품 등록 → Products 시트에 행 추가'],
    ['② 카테고리 설정 → Categories 시트에 행 추가'],
    ['③ 기존 QnA 입력 → Questions 시트에 행 추가 (question_id는 아무 고유값)'],
    ['④ 답변 등록 → Questions 시트에서 answer_text 입력, status를 answered로 변경'],
    ['⑤ 질문 숨기기 → Questions 시트에서 status를 hidden으로 변경'],
    [''],
    ['───────────────────────────────────────────────────────────────'],
    ['■ 위젯이 자동으로 하는 작업 (건드리지 않아도 됨)'],
    ['───────────────────────────────────────────────────────────────'],
    [''],
    ['- 고객이 질문 등록 → Questions에 새 행 자동 추가'],
    ['- 고객이 질문 클릭 → Questions 시트의 클릭수 +1 (쿠키로 유니크 체크)'],
    [''],
    ['───────────────────────────────────────────────────────────────'],
    ['■ 카페24 삽입 코드'],
    ['───────────────────────────────────────────────────────────────'],
    [''],
    ['아래 코드를 카페24 상품 상세페이지 HTML에 붙여넣기:'],
    [''],
    ['<link rel="stylesheet" href="https://[호스팅URL]/qna-widget.css">'],
    ['<div id="qna-insight-widget"'],
    ['     data-product-id="{$product_no}"'],
    ['     data-api-url="https://script.google.com/macros/s/[배포ID]/exec">'],
    ['</div>'],
    ['<script src="https://[호스팅URL]/qna-widget.js"></script>'],
    [''],
    ['- [호스팅URL] = 위젯 파일을 올린 주소 (GitHub Pages, Netlify 등)'],
    ['- [배포ID] = Apps Script 배포 시 생성되는 ID'],
    ['- {$product_no} = 카페24가 자동으로 상품번호를 넣어주는 변수'],
    [''],
    ['───────────────────────────────────────────────────────────────'],
    ['■ 문제 해결'],
    ['───────────────────────────────────────────────────────────────'],
    [''],
    ['위젯이 로딩만 됨 → Apps Script 배포 URL 확인, 액세스가 "모든 사용자"인지 확인'],
    ['데이터가 안 보임 → Products/Questions에 해당 product_id 데이터가 있는지 확인'],
    ['질문 등록 안 됨 → Apps Script 실행 권한이 "나"로 설정되어 있는지 확인'],
    [''],
    ['═══════════════════════════════════════════════════════════════'],
  ];

  sheet.getRange(1, 1, guide.length, 1).setValues(guide);

  // 스타일링
  sheet.getRange('A1:A3').setFontWeight('bold').setFontSize(14);
  sheet.getRange('A5').setFontWeight('bold').setFontSize(11);
  sheet.getRange('A9').setFontWeight('bold').setFontSize(11);
  sheet.getRange('A12').setFontWeight('bold');
  sheet.getRange('A17').setFontWeight('bold');
  sheet.getRange('A25').setFontWeight('bold');
  sheet.getRange('A31').setFontWeight('bold');
  sheet.getRange('A35').setFontWeight('bold');
  sheet.getRange('A41').setFontWeight('bold').setFontSize(11);
  sheet.getRange('A51').setFontWeight('bold').setFontSize(11);
  sheet.getRange('A58').setFontWeight('bold').setFontSize(11);
  sheet.getRange('A75').setFontWeight('bold').setFontSize(11);
  sheet.setFrozenRows(0);
}

// ============================================
// 범용 CRUD 함수
// ============================================

/**
 * 시트의 모든 데이터를 객체 배열로 반환
 */
function getAllRows(sheetName) {
  var sheet = getOrCreateSheet(sheetName);
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  var headers = data[0];
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var row = {};
    for (var j = 0; j < headers.length; j++) {
      row[headers[j]] = data[i][j];
    }
    rows.push(row);
  }
  return rows;
}

/**
 * 조건에 맞는 행들 필터링
 */
function findRows(sheetName, filterFn) {
  var allRows = getAllRows(sheetName);
  return allRows.filter(filterFn);
}

/**
 * 특정 컬럼 값으로 행 찾기
 */
function findRowsByColumn(sheetName, columnName, value) {
  return findRows(sheetName, function(row) {
    return String(row[columnName]) === String(value);
  });
}

/**
 * 새 행 추가 (자동 ID 생성)
 */
function addRow(sheetName, rowData, idColumn) {
  var sheet = getOrCreateSheet(sheetName);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  // 자동 ID 생성
  if (idColumn && !rowData[idColumn]) {
    rowData[idColumn] = generateId(sheetName);
  }

  var newRow = headers.map(function(header) {
    return rowData[header] !== undefined ? rowData[header] : '';
  });

  sheet.appendRow(newRow);
  return rowData[idColumn] || true;
}

/**
 * 특정 행 업데이트 (ID 기반)
 */
function updateRow(sheetName, idColumn, idValue, updates) {
  var sheet = getOrCreateSheet(sheetName);
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idColIndex = headers.indexOf(idColumn);

  if (idColIndex === -1) return false;

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idColIndex]) === String(idValue)) {
      for (var key in updates) {
        var colIndex = headers.indexOf(key);
        if (colIndex !== -1) {
          sheet.getRange(i + 1, colIndex + 1).setValue(updates[key]);
        }
      }
      return true;
    }
  }
  return false;
}

/**
 * 특정 셀 값 증가 (클릭 카운트 등)
 */
function incrementCell(sheetName, idColumn, idValue, targetColumn, amount) {
  var sheet = getOrCreateSheet(sheetName);
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idColIndex = headers.indexOf(idColumn);
  var targetColIndex = headers.indexOf(targetColumn);

  if (idColIndex === -1 || targetColIndex === -1) return false;

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idColIndex]) === String(idValue)) {
      var currentVal = Number(data[i][targetColIndex]) || 0;
      sheet.getRange(i + 1, targetColIndex + 1).setValue(currentVal + (amount || 1));
      return currentVal + (amount || 1);
    }
  }
  return false;
}

// ============================================
// ID 생성
// ============================================

/**
 * 유니크 ID 생성 (타임스탬프 + 랜덤)
 */
function generateId(prefix) {
  var timestamp = new Date().getTime();
  var random = Math.floor(Math.random() * 10000);
  return (prefix ? prefix.substring(0, 3).toUpperCase() : 'ID') + '_' + timestamp + '_' + random;
}

// ============================================
// 설정 관리
// ============================================

function getSetting(key) {
  var rows = findRowsByColumn('Settings', 'key', key);
  return rows.length > 0 ? rows[0].value : null;
}

function setSetting(key, value) {
  var sheet = getOrCreateSheet('Settings');
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return true;
    }
  }
  sheet.appendRow([key, value]);
  return true;
}
