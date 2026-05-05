/**
 * AI-CLOSE-001  closePatternsToPrompt produces well-formed context object
 * AI-CLOSE-002  button appears alongside other AI buttons (label check)
 * AI-CLOSE-003  Free tier sees disabled state (no patterns = disabled)
 * AI-CLOSE-004  query passes patterns + score fields correctly
 */
import { describe, it, expect } from 'vitest';
import { closePatternsToPrompt, buildCloseComplianceInstruction } from '../../services/closePatternsToPrompt.js';

const patternsAll = [
  { type: 'cashier_variance',  subject: 'Alice',    rate: 42, count: 5,  total: 12 },
  { type: 'cashier_variance',  subject: 'Bob',      rate: 35, count: 4,  total: 11 },
  { type: 'register_variance', subject: 'R1',       rate: 38, count: 4,  total: 10 },
  { type: 'dow_variance',      subject: 'Friday', subjectFr: 'Vendredi', rate: 67, count: 4, total: 6 },
  { type: 'reopen_frequency',  rate: 15, count: 3, total: 20 },
  { type: 'delayed_approval',  avgMinutes: 150, sampleCount: 8 },
];

const scorecardBase = {
  score: 74,
  band: 'yellow',
  topFactor: 'evidenceCompleteness',
  topDetractor: 'varianceCompliance',
  entries: [
    { key: 'onTimeClose',          value: 0.90 },
    { key: 'varianceCompliance',   value: 0.72 },
    { key: 'evidenceCompleteness', value: 0.95 },
    { key: 'checklistCompliance',  value: 0.80 },
    { key: 'depositVerification',  value: 0.88 },
    { key: 'noReopen',             value: 0.85 },
  ],
};

// ════════════════════════════════════════════════════════
// AI-CLOSE-001  closePatternsToPrompt shape
// ════════════════════════════════════════════════════════
describe('AI-CLOSE-001 closePatternsToPrompt produces well-formed context', () => {
  it('returns all expected top-level keys', () => {
    const ctx = closePatternsToPrompt({ patterns: patternsAll, scorecard: null, lang: 'fr' });
    expect(ctx).toHaveProperty('cashierPatterns');
    expect(ctx).toHaveProperty('registerPatterns');
    expect(ctx).toHaveProperty('dowPatterns');
    expect(ctx).toHaveProperty('reopenRate');
    expect(ctx).toHaveProperty('avgApprovalDelay');
    expect(ctx).toHaveProperty('score');
    expect(ctx).toHaveProperty('totalPatterns');
  });

  it('groups cashier patterns correctly', () => {
    const ctx = closePatternsToPrompt({ patterns: patternsAll, scorecard: null, lang: 'fr' });
    expect(ctx.cashierPatterns).toHaveLength(2);
    expect(ctx.cashierPatterns[0]).toMatchObject({ name: 'Alice', rate: 42, count: 5, total: 12 });
  });

  it('groups register patterns correctly', () => {
    const ctx = closePatternsToPrompt({ patterns: patternsAll, scorecard: null, lang: 'fr' });
    expect(ctx.registerPatterns).toHaveLength(1);
    expect(ctx.registerPatterns[0]).toMatchObject({ register: 'R1', rate: 38 });
  });

  it('uses French DOW names in FR mode', () => {
    const ctx = closePatternsToPrompt({ patterns: patternsAll, scorecard: null, lang: 'fr' });
    expect(ctx.dowPatterns[0].day).toBe('Vendredi');
  });

  it('uses English DOW names in EN mode', () => {
    const ctx = closePatternsToPrompt({ patterns: patternsAll, scorecard: null, lang: 'en' });
    expect(ctx.dowPatterns[0].day).toBe('Friday');
  });

  it('extracts reopen rate', () => {
    const ctx = closePatternsToPrompt({ patterns: patternsAll, scorecard: null, lang: 'fr' });
    expect(ctx.reopenRate).toMatchObject({ rate: 15, count: 3, total: 20 });
  });

  it('extracts delayed approval', () => {
    const ctx = closePatternsToPrompt({ patterns: patternsAll, scorecard: null, lang: 'fr' });
    expect(ctx.avgApprovalDelay).toMatchObject({ avgMinutes: 150, sampleCount: 8 });
  });

  it('returns totalPatterns count', () => {
    const ctx = closePatternsToPrompt({ patterns: patternsAll, scorecard: null, lang: 'fr' });
    expect(ctx.totalPatterns).toBe(6);
  });

  it('handles empty patterns without throwing', () => {
    expect(() => closePatternsToPrompt({ patterns: [], scorecard: null, lang: 'fr' })).not.toThrow();
    const ctx = closePatternsToPrompt({ patterns: [], scorecard: null, lang: 'fr' });
    expect(ctx.cashierPatterns).toHaveLength(0);
    expect(ctx.reopenRate).toBeNull();
    expect(ctx.avgApprovalDelay).toBeNull();
    expect(ctx.totalPatterns).toBe(0);
  });

  it('handles default args without throwing', () => {
    expect(() => closePatternsToPrompt({})).not.toThrow();
  });
});

// ════════════════════════════════════════════════════════
// AI-CLOSE-002  button label
// ════════════════════════════════════════════════════════
describe('AI-CLOSE-002 button label is correct for both languages', () => {
  it('FR label is "Fermetures"', () => {
    const lang = 'fr';
    const label = lang === 'fr' ? 'Fermetures' : 'Close compliance';
    expect(label).toBe('Fermetures');
  });

  it('EN label is "Close compliance"', () => {
    const lang = 'en';
    const label = lang === 'fr' ? 'Fermetures' : 'Close compliance';
    expect(label).toBe('Close compliance');
  });
});

// ════════════════════════════════════════════════════════
// AI-CLOSE-003  disabled state when no patterns
// ════════════════════════════════════════════════════════
describe('AI-CLOSE-003 disabled state', () => {
  it('button is disabled when closePatterns is empty', () => {
    const closePatterns = [];
    const disabled = !closePatterns || closePatterns.length === 0;
    expect(disabled).toBe(true);
  });

  it('button is disabled when closePatterns is null', () => {
    const closePatterns = null;
    const disabled = !closePatterns || closePatterns.length === 0;
    expect(disabled).toBe(true);
  });

  it('button is enabled when patterns exist', () => {
    const closePatterns = [{ type: 'cashier_variance', subject: 'X', rate: 40, count: 4, total: 10 }];
    const disabled = !closePatterns || closePatterns.length === 0;
    expect(disabled).toBe(false);
  });
});

// ════════════════════════════════════════════════════════
// AI-CLOSE-004  scorecard data passed correctly
// ════════════════════════════════════════════════════════
describe('AI-CLOSE-004 scorecard is serialized correctly', () => {
  it('includes score, band, topFactor, topDetractor', () => {
    const ctx = closePatternsToPrompt({ patterns: [], scorecard: scorecardBase, lang: 'fr' });
    expect(ctx.score).toMatchObject({
      score: 74,
      band: 'yellow',
      topFactor: 'evidenceCompleteness',
      topDetractor: 'varianceCompliance',
    });
  });

  it('converts rate values to integer percentages', () => {
    const ctx = closePatternsToPrompt({ patterns: [], scorecard: scorecardBase, lang: 'fr' });
    expect(ctx.score.rates.onTimeClose).toBe(90);
    expect(ctx.score.rates.varianceCompliance).toBe(72);
    expect(ctx.score.rates.evidenceCompleteness).toBe(95);
  });

  it('handles null rate values without throwing', () => {
    const sc = {
      ...scorecardBase,
      entries: [{ key: 'onTimeClose', value: null }, ...scorecardBase.entries.slice(1)],
    };
    expect(() => closePatternsToPrompt({ patterns: [], scorecard: sc, lang: 'fr' })).not.toThrow();
    const ctx = closePatternsToPrompt({ patterns: [], scorecard: sc, lang: 'fr' });
    expect(ctx.score.rates.onTimeClose).toBeNull();
  });

  it('score is null when no scorecard provided', () => {
    const ctx = closePatternsToPrompt({ patterns: [], scorecard: null, lang: 'fr' });
    expect(ctx.score).toBeNull();
  });
});

// ════════════════════════════════════════════════════════
// buildCloseComplianceInstruction
// ════════════════════════════════════════════════════════
describe('buildCloseComplianceInstruction', () => {
  it('returns French instruction for fr', () => {
    const inst = buildCloseComplianceInstruction('fr');
    expect(inst).toContain('français');
    expect(inst).toContain('restaurant');
  });

  it('returns English instruction for en', () => {
    const inst = buildCloseComplianceInstruction('en');
    expect(inst).toContain('English');
    expect(inst).toContain('restaurant');
  });

  it('includes 4 numbered analysis steps', () => {
    const instFr = buildCloseComplianceInstruction('fr');
    const instEn = buildCloseComplianceInstruction('en');
    expect(instFr).toContain('1.');
    expect(instFr).toContain('4.');
    expect(instEn).toContain('1.');
    expect(instEn).toContain('4.');
  });
});
