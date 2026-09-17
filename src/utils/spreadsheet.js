// Spreadsheets in and out, through exceljs. The xlsx package it replaces had
// prototype-pollution and ReDoS advisories with no fix, and the note that called
// it export-only was wrong: the forecast import parsed files people hand it.
import ExcelJS from 'exceljs';

const HEADER_FILL = 'FFEA580C';

export function autoWidths(rows) {
  if (!rows.length) return [];
  const n = Math.max(...rows.map(r => r.length));
  return Array.from({ length: n }, (_, ci) =>
    Math.min(60, Math.max(10, ...rows.map(r => String(r[ci] == null ? '' : r[ci]).length)) + 2));
}

// sheets: [{ name, rows: [[header...], [row...]], header: true, widths: [n] }]
export async function workbookBuffer(sheets) {
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) {
    const ws = wb.addWorksheet(String(s.name || 'Sheet').slice(0, 31));
    const rows = s.rows || [];
    ws.addRows(rows);
    if (s.header && rows.length) {
      const head = ws.getRow(1);
      head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      head.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }; });
    }
    ws.columns = (s.widths || autoWidths(rows)).map(width => ({ width }));
  }
  return wb.xlsx.writeBuffer();
}

export async function downloadWorkbook(sheets, filename) {
  const buf = await workbookBuffer(sheets);
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// A cell as a plain value: rich text flattened, a formula by its result, a
// date as YYYY-MM-DD, anything unknown as empty.
export function cellValue(v) {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map(t => t.text).join('');
    if ('result' in v) return cellValue(v.result);
    if ('text' in v) return cellValue(v.text);
    if ('hyperlink' in v) return String(v.hyperlink);
    return '';
  }
  return v;
}

// The first sheet as arrays of plain values, header row first. Empty rows are
// dropped; holes in a row stay in place so columns keep their meaning.
export async function readSheetRows(buffer, { csv = false } = {}) {
  if (csv) return parseCsv(typeof buffer === 'string' ? buffer : new TextDecoder('utf-8').decode(buffer));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const out = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const vals = Array.from(row.values.slice(1), cellValue);
    if (vals.some(v => v !== '')) out.push(vals);
  });
  return out;
}

// Quotes, doubled quotes, a comma or a semicolon as the separator, CRLF, BOM.
export function parseCsv(text) {
  const src = String(text).replace(/^\uFEFF/, '');
  const first = src.split('\n')[0] || '';
  const delim = first.split(';').length > first.split(',').length ? ';' : ',';
  const rows = []; let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c !== ''));
}
