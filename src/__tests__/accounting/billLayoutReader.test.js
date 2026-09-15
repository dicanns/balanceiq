import { describe, it, expect } from 'vitest';
import {
  parseBillDocument, parseBillText, buildLines, tokensFromItems, findLineItems,
} from '../../utils/billParser.js';
import { anchorForPick, rememberBill, findTemplate, supplierKey } from '../../utils/billTemplates.js';

// A supplier invoice laid out like a real wholesale bill: letterhead top left,
// invoice number and date top right, buyer blocks, a stacked table header, and a
// footer where weights, the remit-to name, registration numbers and totals share
// lines. Every name and figure is invented. Coordinates are PDF points, top-left.
const it9 = (str, x, y, w) => ({ str, x, y, w, h: 9, page: 1 });

const LETTERHEAD = [
  it9('INVOICE / FACTURE', 412, 66, 140),
  it9('Les Aliments Exemple Inc', 30, 84, 105),
  it9('123 Rue Fictive', 30, 96, 60),
  it9('Laval, QC H0H 0H0', 30, 107, 75),
  it9('450-555-0100', 30, 119, 55),
  it9('Invoice No./No. de Facture:', 362, 93, 118),
  it9('SX104512', 496, 93, 55),
  it9('Invoice Date/Date de la Facture:', 362, 106, 128),
  it9('03/09/2026', 505, 106, 46),
  it9('Page: 1', 425, 130, 28),
];
const BLOCKS = [
  it9('Sold To/Vendu A:', 30, 179, 63),
  it9('ACME BUYER INC.', 57, 190, 70),
  it9('10 BLVD EXAMPLE', 57, 213, 70),
  it9('Shipped To/Expédiez A:', 313, 180, 86),
  it9('BUYER WAREHOUSE LTD', 337, 190, 90),
  it9('Ship Date/Date de Livraison:', 32, 260, 105),
  it9('03/09/2026', 151, 260, 42),
  it9('Due Date/Date Due:', 32, 273, 75),
  it9('03/10/2026', 152, 273, 42),
  it9('Terms/Conditions:', 32, 285, 68),
  it9('Net 30 DAYS', 152, 285, 47),
  it9('P.O. Number/No. de Commande:', 313, 260, 122),
  it9('5521', 461, 260, 18),
  it9('Our Order No./Notre # Commande:', 313, 298, 131),
  it9('SO100200', 461, 298, 40),
];
const TABLE = [
  it9('Qtée.', 411, 318, 18),
  it9('Comm.', 410, 328, 22), it9('Livré', 455, 328, 17), it9('Prix', 493, 328, 14), it9('Montant', 539, 328, 30),
  it9('No.Item', 30, 338, 28), it9('Description', 72, 338, 40), it9('Format', 219, 338, 24), it9('Unit', 341, 338, 16),
  it9('Order', 412, 337, 20), it9('Shipped', 448, 338, 28), it9('Price', 491, 338, 18), it9('Amount', 541, 338, 28),
  it9('71234', 30, 359, 24), it9('EXAMPLE SAUCE', 72, 359, 70), it9('6X500ML', 219, 359, 30),
  it9('HS# 1234567890', 272, 359, 55), it9('Case', 342, 359, 18),
  it9('24', 428, 359, 9), it9('24', 467, 359, 9), it9('12.50', 491, 359, 20), it9('300.00', 545, 359, 25),
];
const FOOTER = [
  it9('Total Cases / Caisses Total:', 31, 676, 98), it9('24', 151, 676, 9),
  it9('Total Weight / Poids Total (kg):', 216, 676, 114), it9('80', 387, 677, 9),
  it9('Total Weight / Poids Total (Lbs):', 216, 692, 117), it9('176', 387, 692, 13),
  it9('PLEASE REMIT TO / SVP PAYER A:', 36, 711, 165), it9('Subtotal/Sous-total:', 401, 710, 80), it9('300.00', 535, 710, 26),
  it9('LES ALIMENTS EXEMPLE INC.', 36, 720, 155), it9('Discount/Escompte:', 408, 724, 73), it9('0.00', 545, 724, 16),
  it9('Administration fee will be charged on all overdue accounts.', 30, 737, 190),
  it9('TPS:', 278, 747, 14), it9('123456789 RT', 321, 747, 46), it9('Tax/Taxe:', 433, 747, 35), it9('0.00', 545, 747, 16),
  it9('TVQ:', 278, 760, 15), it9('1234567890 TQ0001', 321, 760, 66), it9('Total CAD:', 427, 761, 42), it9('300.00', 533, 761, 27),
];

// The order a generator might store them in: footer and table before the letterhead.
const SCRAMBLED = [...FOOTER, ...TABLE, ...BLOCKS, ...LETTERHEAD];

describe('BILLREAD layout', () => {
  it('BILLREAD-001 lines are rebuilt from position, whatever order the text arrives in', () => {
    const a = buildLines(tokensFromItems(SCRAMBLED)).map(l => l.text);
    const b = buildLines(tokensFromItems([...SCRAMBLED].reverse())).map(l => l.text);
    expect(a).toEqual(b);
    expect(a[0]).toBe('INVOICE / FACTURE');
    expect(a).toContain('TVQ: 1234567890 TQ0001 Total CAD: 300.00');
  });
});

describe('BILLREAD wholesale invoice', () => {
  const parsed = parseBillDocument({ items: SCRAMBLED });
  const v = (k) => parsed.fields[k]?.value;

  it('BILLREAD-002 supplier is the letterhead company, not a table heading or the buyer', () => {
    expect(v('supplier')).toBe('Les Aliments Exemple Inc');
  });

  it('BILLREAD-003 invoice number comes from its label, not the tariff code', () => {
    expect(v('invoiceNumber')).toBe('SX104512');
  });

  it('BILLREAD-004 bill date and due date are read day first', () => {
    expect(v('billDate')).toBe('2026-09-03');
    expect(v('dueDate')).toBe('2026-10-03');
  });

  it('BILLREAD-005 the total is the invoice total, never a weight', () => {
    expect(v('amount')).toBe(300);
    expect(v('subtotal')).toBe(300);
  });

  it('BILLREAD-006 registration numbers are not read as tax paid; a zero tax line means tax-free', () => {
    expect(parsed.taxFree).toBe(true);
    expect(v('tps')).toBe(0);
    expect(v('tvq')).toBe(0);
    expect(v('qstNumber')).toBe('1234567890TQ0001');
  });

  it('BILLREAD-007 the item row is read under its column headings', () => {
    expect(parsed.lineItems).toEqual([
      expect.objectContaining({ description: 'EXAMPLE SAUCE', quantity: 24, unitPrice: 12.5, amount: 300 }),
    ]);
    expect(v('quantity')).toBe(24);
    expect(v('unitCost')).toBe(12.5);
  });

  it('BILLREAD-008 a consistent bill raises no warnings', () => {
    expect(parsed.warnings).toEqual([]);
    expect(parsed.looksLikeInvoice).toBe(true);
  });

  it('BILLREAD-009 quantity times price that does not match the amount is flagged', () => {
    const items = TABLE.map(i => (i.str === '12.50' ? { ...i, str: '11.50' } : i));
    const r = parseBillDocument({ items: [...LETTERHEAD, ...items, ...FOOTER] });
    expect(r.warnings.map(w => w.code)).toContain('line_math');
  });

  it('BILLREAD-010 no table, no line items', () => {
    expect(findLineItems(buildLines(tokensFromItems([...LETTERHEAD, ...FOOTER])))).toEqual([]);
  });
});

describe('BILLREAD plain text', () => {
  const TEXT = [
    'Boulangerie Exemple Ltée',
    'Facture no: F-2031',
    'Date: 2026-03-15',
    'Sous-total  100,00',
    'T.P.S. (5%)  5,00',
    'T.V.Q. (9,975%)  9,98',
    'Total à payer  114,98 $',
    'TPS 123456789 RT0001',
    'TVQ 1234567890 TQ0001',
  ].join('\n');
  const r = parseBillText(TEXT);
  const v = (k) => r.fields[k]?.value;

  it('BILLREAD-011 a taxable text invoice still reads end to end', () => {
    expect(v('supplier')).toBe('Boulangerie Exemple Ltée');
    expect(v('invoiceNumber')).toBe('F-2031');
    expect(v('billDate')).toBe('2026-03-15');
    expect(v('subtotal')).toBe(100);
    expect(v('tps')).toBe(5);
    expect(v('tvq')).toBe(9.98);
    expect(v('amount')).toBe(114.98);
    expect(v('gstNumber')).toBe('123456789RT0001');
    expect(r.taxFree).toBe(false);
    expect(r.warnings).toEqual([]);
  });
});

describe('BILLREAD remembered supplier layouts', () => {
  // The same supplier's layout with an invoice number label the general rules
  // do not know.
  const withReference = (ref) => [
    ...LETTERHEAD.filter(i => !/Invoice No|SX104512/.test(i.str)),
    it9('Référence:', 362, 93, 44), it9(ref, 430, 93, 40),
    ...BLOCKS, ...TABLE, ...FOOTER,
  ];

  it('BILLREAD-012 an unknown label is not guessed', () => {
    expect(parseBillDocument({ items: withReference('RX550021') }).fields.invoiceNumber).toBeNull();
  });

  it('BILLREAD-013 one correction teaches the next bill from that supplier', () => {
    const first = parseBillDocument({ items: withReference('RX550021') });
    const li = first.lines.findIndex(l => l.text.includes('RX550021'));
    const ti = first.lines[li].tokens.findIndex(t => t.str === 'RX550021');
    const anchor = anchorForPick(first.lines, li, ti);
    expect(anchor).toEqual({ label: 'Référence:', where: 'right' });

    const templates = rememberBill({}, {
      read: first.fields,
      saved: { supplier_name: 'Les Aliments Exemple Inc', coa_account_id: '12' },
      picks: { invoiceNumber: anchor },
    });

    const nextRead = parseBillDocument({ items: withReference('RX550099') });
    const template = findTemplate(templates, nextRead.fields);
    expect(template).not.toBeNull();
    expect(template.coaAccountId).toBe(12);

    const next = parseBillDocument({ items: withReference('RX550099') }, { template });
    expect(next.fields.invoiceNumber).toMatchObject({ value: 'RX550099', learned: true });
    expect(next.fields.amount.value).toBe(300);
  });

  it('BILLREAD-014 a supplier is known by registration number first, name second', () => {
    expect(supplierKey({ gstNumber: '123456789RT0001', supplier: 'X' })).toBe('gst:123456789RT0001');
    expect(supplierKey({ qstNumber: '1234567890TQ0001' })).toBe('qst:1234567890TQ0001');
    expect(supplierKey({ supplier: 'Les Aliments Exemple Inc.' })).toBe('name:les aliments exemple inc');
    expect(supplierKey({})).toBeNull();
  });
});
