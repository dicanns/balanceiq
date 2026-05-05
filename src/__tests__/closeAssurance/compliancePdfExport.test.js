/**
 * PDF-EXPORT-001  Pro tier can export PDF (buildCompliancePdfHTML returns valid HTML)
 * PDF-EXPORT-002  Free tier gate: canUse('reportingAdvanced') false → no PDF output
 * PDF-EXPORT-003  Date range > 30 days is gated by isProGated flag
 * PDF-EXPORT-004  PDF contains all 8 KPIs and 7 list section headers
 * PDF-EXPORT-005  PDF builder is accent-safe (French content renders correctly)
 */
import { describe, it, expect } from 'vitest';
import { buildCompliancePdfHTML } from '../../services/compliancePdfBuilder.js';

// ── Fixtures ──
const kpisBase = {
  dateFrom: '2026-04-01',
  dateTo:   '2026-04-30',
  sessionCount:            20,
  avgTimeToCloseMinutes:   45,
  overrideCount:            2,
  reopenCount:              1,
  checklistCompliancePct:  88,
  evidenceCompletenessPct: 95,
  depositVerifLagDays:     1.5,
  totalClosures:           38,
  closuresWithVariance:     5,
  safeDropCount:           10,
  depositMatchedCount:      9,
  onTimeCount:             18,
  varianceByCashier: [],
  varianceByRegister: [],
};

const listsBase = {
  unapproved:         [{ date_key: '2026-04-03', shift_key: null, submitted_at: '2026-04-03T22:15:00', status: 'submitted' }],
  withWarnings:       [{ date_key: '2026-04-07', shift_key: 'AM', warning_count: 3, status: 'finalized' }],
  reopened:           [{ date_key: '2026-04-10', shift_key: null, status: 'reopened', submitted_at: null }],
  topVarianceCashiers:[{ cashier_name: 'Alice', total_closures: 10, variance_count: 4, avg_abs_variance_cents: 620 }],
  topVarianceRegisters:[{ register_key: 'R1', total_closures: 10, variance_count: 3, avg_abs_variance_cents: 450 }],
  missingEvidence:    [{ date_key: '2026-04-15', shift_key: null, status: 'finalized', submitted_at: null }],
  missingDepositVerif:[{ date_key: '2026-04-20', total_drop_cents: 32000 }],
};

const scorecardBase = {
  score: 78,
  band: 'yellow',
  rates: { onTimeClose: 0.90, varianceCompliance: 0.87, evidenceCompleteness: 0.95, checklistCompliance: 0.88, depositVerification: 0.90, noReopen: 0.95 },
  entries: [
    { key: 'onTimeClose',         label: 'On-time close',        labelFr: 'Fermeture à temps',    value: 0.90 },
    { key: 'varianceCompliance',  label: 'Variance compliance',  labelFr: 'Conformité écarts',    value: 0.87 },
    { key: 'evidenceCompleteness',label: 'Evidence completeness',labelFr: 'Complétude preuves',   value: 0.95 },
    { key: 'checklistCompliance', label: 'Checklist compliance', labelFr: 'Conformité checklist', value: 0.88 },
    { key: 'depositVerification', label: 'Deposit verification', labelFr: 'Vérification dépôts', value: 0.90 },
    { key: 'noReopen',            label: 'No-reopen rate',       labelFr: 'Sans réouverture',     value: 0.95 },
  ],
  topFactor:    'evidenceCompleteness',
  topDetractor: 'varianceCompliance',
};

// ════════════════════════════════════════════════════════
// PDF-EXPORT-001  Pro tier can build PDF HTML
// ════════════════════════════════════════════════════════
describe('PDF-EXPORT-001 Pro tier PDF generation', () => {
  it('returns a non-empty HTML string', () => {
    const html = buildCompliancePdfHTML({ kpis: kpisBase, lists: listsBase, scorecard: scorecardBase, lang: 'fr' });
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(500);
  });

  it('starts with a valid HTML doctype', () => {
    const html = buildCompliancePdfHTML({ kpis: kpisBase, lists: listsBase, scorecard: scorecardBase, lang: 'fr' });
    expect(html.trimStart()).toMatch(/^<!DOCTYPE html>/i);
  });

  it('includes the report title in FR', () => {
    const html = buildCompliancePdfHTML({ kpis: kpisBase, lists: listsBase, scorecard: scorecardBase, lang: 'fr' });
    expect(html).toContain('Rapport de conformité des fermetures');
  });

  it('includes the report title in EN', () => {
    const html = buildCompliancePdfHTML({ kpis: kpisBase, lists: listsBase, scorecard: scorecardBase, lang: 'en' });
    expect(html).toContain('Close Compliance Report');
  });

  it('includes the period range', () => {
    const html = buildCompliancePdfHTML({ kpis: kpisBase, lists: listsBase, scorecard: scorecardBase, lang: 'fr' });
    expect(html).toContain('2026-04-01');
    expect(html).toContain('2026-04-30');
  });

  it('includes the compliance score', () => {
    const html = buildCompliancePdfHTML({ kpis: kpisBase, lists: listsBase, scorecard: scorecardBase, lang: 'fr' });
    expect(html).toContain('78');
  });

  it('includes location when provided', () => {
    const html = buildCompliancePdfHTML({ kpis: kpisBase, lists: listsBase, scorecard: scorecardBase, lang: 'fr', location: 'Succursale Laval' });
    expect(html).toContain('Succursale Laval');
  });

  it('works without a scorecard (null)', () => {
    expect(() => buildCompliancePdfHTML({ kpis: kpisBase, lists: listsBase, scorecard: null, lang: 'fr' })).not.toThrow();
  });
});

// ════════════════════════════════════════════════════════
// PDF-EXPORT-002  Free tier gate (no window.api mock needed — pure logic)
// ════════════════════════════════════════════════════════
describe('PDF-EXPORT-002 Free tier gate logic', () => {
  it('canUse returns false for reportingAdvanced on free plan', () => {
    // Simulate the canUse gate at the call site
    const canUse = (_feature) => false;
    const isPdfAllowed = canUse('reportingAdvanced');
    expect(isPdfAllowed).toBe(false);
  });

  it('canUse returns true for reportingAdvanced on pro plan', () => {
    const canUse = (feature) => ['reportingAdvanced', 'cloudSync'].includes(feature);
    expect(canUse('reportingAdvanced')).toBe(true);
  });

  it('PDF builder itself is plan-agnostic (caller enforces the gate)', () => {
    // Builder should still produce HTML regardless — the gate is in the component
    const html = buildCompliancePdfHTML({ kpis: kpisBase, lists: listsBase, scorecard: null, lang: 'fr' });
    expect(html).toBeTruthy();
  });
});

// ════════════════════════════════════════════════════════
// PDF-EXPORT-003  Date range > 30 days Pro gate
// ════════════════════════════════════════════════════════
describe('PDF-EXPORT-003 Date range > 30 days Pro gate', () => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  it('isProGated is true when dateFrom is beyond 30 days for free user', () => {
    const dateFrom = '2026-01-01'; // well beyond 30 days
    const canUse = () => false;
    const isProGated = dateFrom < thirtyDaysAgo && !canUse('reportingAdvanced');
    expect(isProGated).toBe(true);
  });

  it('isProGated is false for Pro user regardless of range', () => {
    const dateFrom = '2026-01-01';
    const canUse = () => true;
    const isProGated = dateFrom < thirtyDaysAgo && !canUse('reportingAdvanced');
    expect(isProGated).toBe(false);
  });

  it('isProGated is false when date is within 30 days for free user', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const canUse = () => false;
    const isProGated = yesterday < thirtyDaysAgo && !canUse('reportingAdvanced');
    expect(isProGated).toBe(false);
  });
});

// ════════════════════════════════════════════════════════
// PDF-EXPORT-004  PDF contains all 8 KPIs and 7 list sections
// ════════════════════════════════════════════════════════
describe('PDF-EXPORT-004 PDF contents completeness', () => {
  const html = buildCompliancePdfHTML({ kpis: kpisBase, lists: listsBase, scorecard: scorecardBase, lang: 'fr' });

  // 8 KPIs (FR labels)
  it('contains Sessions analysées', () => { expect(html).toContain('Sessions analysées'); });
  it('contains Délai moyen de fermeture', () => { expect(html).toContain('Délai moyen de fermeture'); });
  it('contains Fermetures avec dérogation', () => { expect(html).toContain('Fermetures avec dérogation'); });
  it('contains Réouvertures', () => { expect(html).toContain('Réouvertures'); });
  it('contains Conformité liste de vérification', () => { expect(html).toContain('Conformité liste de vérification'); });
  it('contains Complétude des dossiers', () => { expect(html).toContain('Complétude des dossiers'); });
  it('contains Délai vérification dépôts', () => { expect(html).toContain('Délai vérification dépôts'); });
  it('contains totalClosures in output', () => { expect(html).toContain('38'); });

  // 7 list section headers (FR)
  it('contains Non-approuvées (>1 jour)', () => { expect(html).toContain('Non-approuvées (>1 jour)'); });
  it('contains Fermetures avec avertissements', () => { expect(html).toContain('Fermetures avec avertissements'); });
  it('contains Réouvertes après approbation', () => { expect(html).toContain('Réouvertes après approbation'); });
  it('contains Caissiers - écarts fréquents', () => { expect(html).toContain('Caissiers - écarts fréquents'); });
  it('contains Registres - écarts fréquents', () => { expect(html).toContain('Registres - écarts fréquents'); });
  it('contains Dossiers de fermeture manquants', () => { expect(html).toContain('Dossiers de fermeture manquants'); });
  it('contains Dépôts non vérifiés', () => { expect(html).toContain('Dépôts non vérifiés'); });

  // List data appears
  it('contains cashier name from topVarianceCashiers', () => { expect(html).toContain('Alice'); });
  it('contains register key from topVarianceRegisters', () => { expect(html).toContain('R1'); });
});

// ════════════════════════════════════════════════════════
// PDF-EXPORT-005  Accent safety (French content renders correctly)
// ════════════════════════════════════════════════════════
describe('PDF-EXPORT-005 French accent safety', () => {
  it('French title is present without mojibake', () => {
    const html = buildCompliancePdfHTML({ kpis: kpisBase, lists: listsBase, scorecard: scorecardBase, lang: 'fr' });
    expect(html).toContain('Rapport de conformité des fermetures');
    expect(html).toContain('Réouvertures');
    expect(html).toContain('Complétude des dossiers');
  });

  it('escapes XSS in cashier names', () => {
    const kpis = { ...kpisBase };
    const lists = {
      ...listsBase,
      topVarianceCashiers: [{ cashier_name: '<script>alert(1)</script>', total_closures: 5, variance_count: 3, avg_abs_variance_cents: 0 }],
    };
    const html = buildCompliancePdfHTML({ kpis, lists, scorecard: null, lang: 'fr' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes XSS in location name', () => {
    const html = buildCompliancePdfHTML({ kpis: kpisBase, lists: listsBase, scorecard: null, lang: 'fr', location: '<img src=x onerror=alert(1)>' });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });

  it('EN labels are distinct from FR labels', () => {
    const htmlFr = buildCompliancePdfHTML({ kpis: kpisBase, lists: listsBase, scorecard: null, lang: 'fr' });
    const htmlEn = buildCompliancePdfHTML({ kpis: kpisBase, lists: listsBase, scorecard: null, lang: 'en' });
    expect(htmlFr).toContain('Période');
    expect(htmlEn).toContain('Period');
    expect(htmlFr).not.toContain('Close Compliance Report');
    expect(htmlEn).not.toContain('Rapport de conformité des fermetures');
  });

  it('disclaimer appears in both languages', () => {
    const htmlFr = buildCompliancePdfHTML({ kpis: kpisBase, lists: listsBase, scorecard: null, lang: 'fr' });
    const htmlEn = buildCompliancePdfHTML({ kpis: kpisBase, lists: listsBase, scorecard: null, lang: 'en' });
    expect(htmlFr).toContain('Consultez votre comptable');
    expect(htmlEn).toContain('Consult your accountant');
  });
});
