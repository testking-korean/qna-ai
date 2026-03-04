/**
 * SeedData.gs
 * ClickLog 더미 데이터 생성 유틸리티
 *
 * 질문 데이터는 스프레드시트에서 직접 관리합니다.
 * 스프레드시트: https://docs.google.com/spreadsheets/d/1hnyzcH5dcOd08HeyacJDABwhe-tW5L5xv3gFt3AZtvo/edit
 *
 * 이 파일은 기존 Questions 데이터를 읽어서 ClickLog를 생성하는 함수만 포함합니다.
 */

var SPREADSHEET_ID = '1hnyzcH5dcOd08HeyacJDABwhe-tW5L5xv3gFt3AZtvo';

/**
 * 기존 Questions 데이터를 읽어서 ClickLog 생성
 *
 * - 기존 ClickLog를 지우고 새로 생성
 * - 500명의 가상 멤버가 각 10~20개 질문 클릭
 * - 총 약 5,000~10,000개 ClickLog 행 생성
 *
 * Apps Script 에디터에서 이 함수를 선택하고 실행하세요.
 */
function seedClickLog() {
  // 기존 ClickLog 클리어
  clearSheetData('ClickLog');

  // 기존 Questions에서 question_id 목록 읽기
  var questionsSheet = getOrCreateSheet('Questions');
  var qData = questionsSheet.getDataRange().getValues();
  if (qData.length <= 1) {
    Logger.log('Questions 시트에 데이터가 없습니다.');
    return;
  }

  var headers = qData[0];
  var qIdIndex = headers.indexOf('question_id');
  if (qIdIndex === -1) {
    Logger.log('question_id 컬럼을 찾을 수 없습니다.');
    return;
  }

  var questionIds = [];
  for (var i = 1; i < qData.length; i++) {
    var qId = qData[i][qIdIndex];
    if (qId) questionIds.push(String(qId));
  }

  Logger.log('기존 질문 수: ' + questionIds.length);

  // ClickLog 시트 준비
  var clickLogSheet = getOrCreateSheet('ClickLog');
  var clickHeaders = clickLogSheet.getRange(1, 1, 1, clickLogSheet.getLastColumn()).getValues()[0];

  // 500명 가상 멤버, 각 10~20개 질문 클릭
  var totalMembers = 500;
  var clickRows = [];

  for (var m = 1; m <= totalMembers; m++) {
    var memberId = 'MEM_' + String(m).padStart(5, '0');
    var clickCount = Math.floor(Math.random() * 11) + 10; // 10~20개 클릭

    // 랜덤하게 질문 선택 (중복 없이)
    var shuffled = questionIds.slice().sort(function() { return 0.5 - Math.random(); });
    var picked = shuffled.slice(0, Math.min(clickCount, shuffled.length));

    picked.forEach(function(qId) {
      var daysAgo = Math.floor(Math.random() * 90);
      var clickDate = new Date();
      clickDate.setDate(clickDate.getDate() - daysAgo);
      var hours = Math.floor(Math.random() * 24);
      var mins = Math.floor(Math.random() * 60);
      clickDate.setHours(hours, mins);

      var logId = 'CL_' + Date.now() + '_' + Math.floor(Math.random() * 100000);

      var logData = {
        log_id: logId,
        question_id: qId,
        session_id: 'sess_' + memberId,
        member_id: memberId,
        clicked_at: clickDate.toISOString()
      };

      var row = clickHeaders.map(function(h) { return logData[h] !== undefined ? logData[h] : ''; });
      clickRows.push(row);
    });
  }

  // 배치로 삽입
  if (clickRows.length > 0) {
    var batchSize = 10000;
    for (var b = 0; b < clickRows.length; b += batchSize) {
      var batch = clickRows.slice(b, b + batchSize);
      var startRow = clickLogSheet.getLastRow() + 1;
      clickLogSheet.getRange(startRow, 1, batch.length, clickHeaders.length).setValues(batch);
    }
  }

  Logger.log('ClickLog 생성 완료! 멤버: ' + totalMembers + '명, 총 클릭 로그: ' + clickRows.length + '건, 대상 질문: ' + questionIds.length + '개');
}

/**
 * 시트 데이터 클리어 (헤더는 유지)
 */
function clearSheetData(sheetName) {
  var sheet = getOrCreateSheet(sheetName);
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }
}
