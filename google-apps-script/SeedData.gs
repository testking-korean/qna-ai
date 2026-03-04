/**
 * SeedData.gs
 * 데이터 관리 유틸리티
 *
 * 스프레드시트: https://docs.google.com/spreadsheets/d/1hnyzcH5dcOd08HeyacJDABwhe-tW5L5xv3gFt3AZtvo/edit
 */

var SPREADSHEET_ID = '1hnyzcH5dcOd08HeyacJDABwhe-tW5L5xv3gFt3AZtvo';

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
