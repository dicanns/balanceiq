import { describe, it, expect } from 'vitest';
import { flat, cell, csvField } from '../../utils/csvSafe.mjs';

describe('CSV-001 free text in exports', () => {
  it('prefixes formula starters and flattens tabs and line breaks', () => {
    expect(cell('=HYPERLINK("x")')).toBe("'=HYPERLINK(\"x\")");
    expect(cell('+1')).toBe("'+1");
    // A plain number, negative included, stays a number; text opening with a
    // formula character does not.
    expect(cell('-2')).toBe('-2');
    expect(cell('-12.50')).toBe('-12.50');
    expect(cell('-2+3')).toBe("'-2+3");
    expect(cell('-cmd')).toBe("'-cmd");
    expect(cell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(cell('Rent')).toBe('Rent');
    expect(flat('a\tb\r\nc')).toBe('a b c');
    expect(cell(null)).toBe('');
  });
  it('quotes a field that holds a comma or a quote', () => {
    expect(csvField('Repas, représentation')).toBe('"Repas, représentation"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('=1+1')).toBe("'=1+1");
    expect(csvField(5)).toBe('5');
  });
});
