/**
 * SHEET-001  a workbook written by the app reads back with the same values
 * SHEET-002  cells are read as plain values: rich text, formulas, dates, holes
 * SHEET-003  CSV with quotes, doubled quotes, semicolons and a BOM
 * SHEET-004  the xlsx package and the dead updater are gone
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { workbookBuffer, readSheetRows, cellValue, parseCsv, autoWidths } from '../../utils/spreadsheet.js';

const ROOT = path.resolve(__dirname, '../../..');

describe('SHEET-001 round trip', () => {
  it('writes three sheets with a styled header and reads the first back', async () => {
    const buf = await workbookBuffer([
      { name: 'Journal', rows: [['Date', 'Client', 'Montant'], ['2026-08-04', 'Acme', 114.98]], header: true },
      { name: 'Sommaire', rows: [['Feuille', 'Lignes'], ['Journal', 1]], widths: [30, 12] },
    ]);
    const rows = await readSheetRows(buf);
    expect(rows).toEqual([['Date', 'Client', 'Montant'], ['2026-08-04', 'Acme', 114.98]]);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
    expect(wb.worksheets.map(w => w.name)).toEqual(['Journal', 'Sommaire']);
    expect(wb.worksheets[0].getRow(1).getCell(1).font.bold).toBe(true);
    expect(wb.worksheets[0].getRow(1).getCell(1).fill.fgColor.argb).toBe('FFEA580C');
    expect(wb.worksheets[1].getColumn(1).width).toBe(30);
    expect(autoWidths([['ab', 'x'], ['abcdefghijklmnop', 'y']])).toEqual([18, 12]);
  });
});

describe('SHEET-002 plain values', () => {
  it('flattens what exceljs hands back, keeping holes in place', async () => {
    expect(cellValue({ richText: [{ text: 'Chez ' }, { text: 'Martin' }] })).toBe('Chez Martin');
    expect(cellValue({ formula: 'A1*2', result: 42 })).toBe(42);
    expect(cellValue({ text: 'site', hyperlink: 'https://balanceiq.ca' })).toBe('site');
    expect(cellValue(new Date(Date.UTC(2026, 7, 4)))).toBe('2026-08-04');
    expect(cellValue(null)).toBe('');
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('S');
    ws.getCell('A1').value = 'h1'; ws.getCell('C1').value = 'h3';
    ws.getCell('A2').value = 1; ws.getCell('C2').value = 3;
    const rows = await readSheetRows(await wb.xlsx.writeBuffer());
    expect(rows).toEqual([['h1', '', 'h3'], [1, '', 3]]);
  });
});

describe('SHEET-003 CSV', () => {
  it('parses the shapes exports produce', () => {
    expect(parseCsv('\uFEFFa,b\r\n"x, y","say ""hi"""\n\n1,2\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"'], ['1', '2']]);
    expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('SHEET-004 what is gone', () => {
  it('no xlsx import, no electron-updater', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.dependencies.xlsx).toBeUndefined();
    expect(pkg.dependencies['electron-updater']).toBeUndefined();
    expect(pkg.dependencies.exceljs).toBeDefined();
    const src = ['src/App.jsx', 'src/components/PrevisionsTab.jsx', 'main.js'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
    expect(src).not.toMatch(/from ['"]xlsx['"]|XLSX\.|electron-updater|autoUpdater/);
  });
});
