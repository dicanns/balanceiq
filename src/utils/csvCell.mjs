// One CSV cell, safe to open in a spreadsheet. A text cell that starts with = + - or @
// would run as a formula (CSV injection), so it gets a leading apostrophe. A plain
// number (including a negative amount) is left alone so money columns stay numeric.
// Tabs and line breaks become spaces; double quotes are doubled.
import { cell } from './csvSafe.mjs';

// One rule for what a cell may hold (csvSafe); here every cell is also quoted.
export function csvCell(v) {
  return `"${cell(v).replace(/"/g, '""')}"`;
}

export function csvRow(cells) {
  return cells.map(csvCell).join(',');
}
