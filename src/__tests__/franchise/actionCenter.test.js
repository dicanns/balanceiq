/**
 * ACTION-CENTER-001  actionCenter.js — buildActionItems pure function
 */
import { describe, it, expect } from 'vitest';
import { buildActionItems, actionItemCount, ACTION_TYPES } from '../../services/actionCenter.js';

const LOCATIONS = [
  { id: 1, nom: 'Montréal Centre' },
  { id: 2, nom: 'Québec Ouest' },
  { id: 3, nom: 'Laval Nord' },
];

const makeException = (overrides = {}) => ({
  id: 1,
  location_id: 1,
  exception_type: 'overdue_payment',
  period: '2026-05',
  severity: 'warning',
  description_fr: 'Redevance en retard de 20 jour(s)',
  description_en: 'Royalty overdue by 20 day(s)',
  amount_at_risk: 750,
  days_overdue: 20,
  acknowledged_at: null,
  resolved_at: null,
  ...overrides,
});

const makeScore = (overrides = {}) => ({
  id: 10,
  location_id: 2,
  period: '2026-05',
  total_score: 45,
  close_on_time: 0.5,
  deposit_reconciled: 0.3,
  royalty_data_complete: 0.4,
  documents_complete: 0.5,
  no_anomalies: 0.6,
  month_end_ready: 0.4,
  ...overrides,
});

// ── ACTION-CENTER-001 ─────────────────────────────────────────────────────────

describe('ACTION-CENTER-001 ACTION_TYPES', () => {
  it('has ROYALTY_EXCEPTION', () => {
    expect(ACTION_TYPES.ROYALTY_EXCEPTION).toBe('royalty_exception');
  });

  it('has LOW_SCORE', () => {
    expect(ACTION_TYPES.LOW_SCORE).toBe('low_score');
  });

  it('has NO_SCORE', () => {
    expect(ACTION_TYPES.NO_SCORE).toBe('no_score');
  });
});

describe('ACTION-CENTER-001 buildActionItems — empty inputs', () => {
  it('returns empty array when all inputs are empty', () => {
    expect(buildActionItems({ exceptions: [], networkScores: [], locations: [] })).toHaveLength(0);
  });

  it('returns empty when all exceptions are resolved', () => {
    const ex = makeException({ resolved_at: '2026-05-01T00:00:00Z' });
    expect(buildActionItems({ exceptions: [ex], networkScores: [], locations: LOCATIONS })).toHaveLength(0);
  });

  it('returns empty when all scores are above threshold', () => {
    const score = makeScore({ total_score: 75 });
    expect(buildActionItems({ exceptions: [], networkScores: [score], locations: LOCATIONS })).toHaveLength(0);
  });

  it('returns empty when score equals threshold exactly', () => {
    const score = makeScore({ total_score: 60 });
    expect(buildActionItems({ exceptions: [], networkScores: [score], locations: LOCATIONS, scoreThreshold: 60 })).toHaveLength(0);
  });
});

describe('ACTION-CENTER-001 buildActionItems — royalty exceptions', () => {
  it('maps unresolved exception to action item', () => {
    const items = buildActionItems({ exceptions: [makeException()], locations: LOCATIONS });
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe(ACTION_TYPES.ROYALTY_EXCEPTION);
  });

  it('uses location name from locations array', () => {
    const items = buildActionItems({ exceptions: [makeException({ location_id: 1 })], locations: LOCATIONS });
    expect(items[0].locName).toBe('Montréal Centre');
  });

  it('falls back to Location N when location not found', () => {
    const items = buildActionItems({ exceptions: [makeException({ location_id: 99 })], locations: LOCATIONS });
    expect(items[0].locName).toContain('99');
  });

  it('marks acknowledged exception correctly', () => {
    const ex = makeException({ acknowledged_at: '2026-05-01T00:00:00Z' });
    const items = buildActionItems({ exceptions: [ex], locations: LOCATIONS });
    expect(items[0].acknowledged).toBe(true);
  });

  it('sets navigateTo to exceptions', () => {
    const items = buildActionItems({ exceptions: [makeException()], locations: LOCATIONS });
    expect(items[0].navigateTo).toBe('exceptions');
  });

  it('includes amount_at_risk in body', () => {
    const items = buildActionItems({ exceptions: [makeException({ amount_at_risk: 500 })], locations: LOCATIONS });
    expect(items[0].bodyFr).toContain('500');
    expect(items[0].bodyEn).toContain('500');
  });
});

describe('ACTION-CENTER-001 buildActionItems — network scores', () => {
  it('maps score below threshold to action item', () => {
    const items = buildActionItems({ networkScores: [makeScore({ total_score: 45 })], locations: LOCATIONS });
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe(ACTION_TYPES.LOW_SCORE);
  });

  it('severity is critical when score < 40', () => {
    const items = buildActionItems({ networkScores: [makeScore({ total_score: 35 })], locations: LOCATIONS });
    expect(items[0].severity).toBe('critical');
  });

  it('severity is warning when score is 40-59', () => {
    const items = buildActionItems({ networkScores: [makeScore({ total_score: 55 })], locations: LOCATIONS });
    expect(items[0].severity).toBe('warning');
  });

  it('sets navigateTo to standards', () => {
    const items = buildActionItems({ networkScores: [makeScore({ total_score: 45 })], locations: LOCATIONS });
    expect(items[0].navigateTo).toBe('standards');
  });

  it('score body includes total_score and period', () => {
    const items = buildActionItems({ networkScores: [makeScore({ total_score: 45, period: '2026-05' })], locations: LOCATIONS });
    expect(items[0].bodyEn).toContain('45');
    expect(items[0].bodyEn).toContain('2026-05');
  });
});

describe('ACTION-CENTER-001 buildActionItems — no_score items', () => {
  it('generates no_score item for location with no score in period', () => {
    const items = buildActionItems({ locations: LOCATIONS, period: '2026-05' });
    expect(items.some(i => i.type === ACTION_TYPES.NO_SCORE)).toBe(true);
    expect(items.filter(i => i.type === ACTION_TYPES.NO_SCORE)).toHaveLength(3);
  });

  it('no_score items have info severity', () => {
    const items = buildActionItems({ locations: LOCATIONS, period: '2026-05' });
    items.filter(i => i.type === ACTION_TYPES.NO_SCORE)
      .forEach(i => expect(i.severity).toBe('info'));
  });

  it('does not generate no_score when no period provided', () => {
    const items = buildActionItems({ locations: LOCATIONS, period: '' });
    expect(items.filter(i => i.type === ACTION_TYPES.NO_SCORE)).toHaveLength(0);
  });

  it('skips no_score for location that already has a score', () => {
    const items = buildActionItems({
      networkScores: [makeScore({ location_id: 2, total_score: 80 })],
      locations: LOCATIONS,
      period: '2026-05',
    });
    const noScore = items.filter(i => i.type === ACTION_TYPES.NO_SCORE);
    expect(noScore.some(i => i.locationId === 2)).toBe(false);
    expect(noScore).toHaveLength(2); // locs 1 and 3
  });
});

describe('ACTION-CENTER-001 buildActionItems — sort order', () => {
  it('critical items sort before warning', () => {
    const items = buildActionItems({
      exceptions: [makeException({ severity: 'warning', id: 1 })],
      networkScores: [makeScore({ total_score: 30, location_id: 2 })], // critical
      locations: LOCATIONS,
    });
    expect(items[0].severity).toBe('critical');
    expect(items[1].severity).toBe('warning');
  });

  it('unacknowledged items sort before acknowledged within same severity', () => {
    const ackedEx  = makeException({ id: 1, acknowledged_at: '2026-05-01T00:00:00Z', location_id: 1 });
    const freshEx  = makeException({ id: 2, acknowledged_at: null, location_id: 2 });
    const items = buildActionItems({ exceptions: [ackedEx, freshEx], locations: LOCATIONS });
    expect(items[0].acknowledged).toBe(false);
    expect(items[1].acknowledged).toBe(true);
  });
});

describe('ACTION-CENTER-001 actionItemCount', () => {
  it('returns total, critical, warning counts (excluding acknowledged)', () => {
    const items = [
      { severity: 'critical', acknowledged: false },
      { severity: 'critical', acknowledged: true },
      { severity: 'warning',  acknowledged: false },
      { severity: 'info',     acknowledged: false },
    ];
    const counts = actionItemCount(items);
    expect(counts.total).toBe(3); // excludes acked critical
    expect(counts.critical).toBe(1);
    expect(counts.warning).toBe(1);
  });

  it('returns zeros for empty array', () => {
    const counts = actionItemCount([]);
    expect(counts.total).toBe(0);
    expect(counts.critical).toBe(0);
  });
});
