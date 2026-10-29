/**
 * CHQPRT-001  the amount in words, English
 * CHQPRT-002  the amount in words, French, with its agreement rules
 * CHQPRT-003  the amount box and the date boxes
 * CHQPRT-004  the page: cheque in the chosen third, stubs in the others, the nudge applied
 *
 * A printed cheque is a legal instrument: the amount in words governs when it and
 * the figure disagree, so the words must be right in both languages, and nothing
 * may be added in front of or after either amount.
 */
import { describe, it, expect } from 'vitest';
import { amountInWords, amountFigure, dateDigits, buildChequesHtml } from '../../../utils/chequePrint.mjs';

describe('CHQPRT-001 English', () => {
  it.each([
    [0, 'Zero and 00/100'],
    [123456, 'One thousand two hundred thirty-four and 56/100'],
    [2100, 'Twenty-one and 00/100'],
    [10000000, 'One hundred thousand and 00/100'],
    [100000100, 'One million one and 00/100'],
    [99, 'Zero and 99/100'],
  ])('%i cents', (cents, words) => expect(amountInWords(cents, 'en')).toBe(words));
});

describe('CHQPRT-002 French', () => {
  it.each([
    [2100, 'Vingt et un et 00/100'],
    [7100, 'Soixante et onze et 00/100'],
    [7700, 'Soixante-dix-sept et 00/100'],
    [8000, 'Quatre-vingts et 00/100'],
    [8100, 'Quatre-vingt-un et 00/100'],
    [9100, 'Quatre-vingt-onze et 00/100'],
    [20000, 'Deux cents et 00/100'],
    [20100, 'Deux cent un et 00/100'],
    [100000, 'Mille et 00/100'],
    [108000, 'Mille quatre-vingts et 00/100'],
    [123456, 'Mille deux cent trente-quatre et 56/100'],
    [8000000, 'Quatre-vingt mille et 00/100'],
    [20000000, 'Deux cent mille et 00/100'],
    [200000000, 'Deux millions et 00/100'],
    [20000000000, 'Deux cents millions et 00/100'],
  ])('%i cents', (cents, words) => expect(amountInWords(cents, 'fr')).toBe(words));
});

describe('CHQPRT-003 figures and dates', () => {
  it('guards the figure and groups thousands', () => {
    expect(amountFigure(123456)).toBe('**1,234.56');
    expect(amountFigure(500)).toBe('**5.00');
  });
  it('fills the date boxes in the stock\'s order', () => {
    expect(dateDigits('2026-11-05', 'YYYYMMDD').join('')).toBe('20261105');
    expect(dateDigits('2026-11-05', 'DDMMYYYY').join('')).toBe('05112026');
    expect(dateDigits('2026-11-05', 'MMDDYYYY').join('')).toBe('11052026');
    expect(dateDigits('', 'YYYYMMDD')).toEqual([]);
  });
});

describe('CHQPRT-004 the page', () => {
  const ch = { cheque_number: '1043', cheque_date: '2026-11-05', party_name: 'Sample <Landlord> Inc.', amount_cents: 114975, memo: 'Rent November' };
  it('one page per cheque, the payee escaped, words and figure present', () => {
    const html = buildChequesHtml([ch, { ...ch, cheque_number: '1044' }], { position: 'top' }, { labels: { cheque: 'Cheque' } });
    expect((html.match(/class="page"/g) || []).length).toBe(2);
    expect(html).toContain('Sample &lt;Landlord&gt; Inc.');
    expect(html).toContain('Mille cent quarante-neuf et 75/100');
    expect(html).toContain('**1,149.75');
    expect(html).toContain('@page { size: letter; margin: 0 }');
  });
  it('the calibration nudge moves the whole sheet', () => {
    const html = buildChequesHtml([ch], { position: 'middle', offsetXmm: 2, offsetYmm: -1.5, wordsLang: 'en' });
    expect(html).toContain('left:2mm;top:-1.5mm');
    expect(html).toContain('One thousand one hundred forty-nine and 75/100');
  });
  it('the stubs carry the details in the other two thirds', () => {
    const html = buildChequesHtml([ch], { position: 'bottom' }, { labels: { cheque: 'Cheque', payee: 'Pay to' } });
    expect((html.match(/Cheque 1043/g) || []).length).toBe(2);
  });
});
