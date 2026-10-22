/**
 * Google Sheets: выделяет каналы в ячейках календаря жирным и цветом.
 * Нужен, если календарь залит из 4_calendar.csv (в smm_plan.xlsx это уже сделано).
 *
 * Расширения → Apps Script → вставить этот файл → запустить boldChannels.
 * Заголовок канала — любая строка ячейки, которая не начинается с «•».
 */
const COLORS = {
  'Neuronium': '#7B2CBF',
  'Dataist': '#1A56B8',
  'Andre AIT': '#0B7A75',
  'Landao': '#C2185B',
  'Antropolis': '#D35400',
};
const FIRST_COL = 4; // Web; первые три колонки — #, День, Дата

function boldChannels() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const rows = sheet.getLastRow() - 1;
  const cols = sheet.getLastColumn() - FIRST_COL + 1;
  if (rows < 1 || cols < 1) return;
  const range = sheet.getRange(2, FIRST_COL, rows, cols);
  const values = range.getDisplayValues();
  range.setRichTextValues(values.map(row => row.map(styleCell)));
}

function styleCell(text) {
  const builder = SpreadsheetApp.newRichTextValue().setText(text);
  let pos = 0;
  for (const line of text.split('\n')) {
    if (line && !line.startsWith('•')) {
      const brand = Object.keys(COLORS).find(b => line.startsWith(b)) || 'Dataist';
      const style = SpreadsheetApp.newTextStyle().setBold(true).setForegroundColor(COLORS[brand]).build();
      builder.setTextStyle(pos, pos + line.length, style);
    }
    pos += line.length + 1;
  }
  return builder.build();
}
