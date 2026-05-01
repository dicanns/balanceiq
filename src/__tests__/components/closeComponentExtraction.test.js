/**
 * EXTRACT-001  each close component file exists
 * EXTRACT-002  App.jsx close-related logic is significantly reduced
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const root = resolve(import.meta.dirname, '../../../');
const src  = (rel) => resolve(root, 'src', rel);

// ── EXTRACT-001: component files exist ───────────────────────────────────────

describe('EXTRACT-001 each close component file exists', () => {
  const components = [
    'components/RegisterCloseCard.jsx',
    'components/CloseSummaryPanel.jsx',
    'components/CloseReviewModal.jsx',
    'components/DenominationCounter.jsx',
    'components/CloseEvidencePanel.jsx',
    'components/CloseApprovalPanel.jsx',
    'components/ShiftHandoff.jsx',
  ];

  components.forEach(rel => {
    it(`${rel} exists`, () => {
      expect(existsSync(src(rel))).toBe(true);
    });
  });

  it('all 7 close components are distinct files', () => {
    const existing = components.filter(rel => existsSync(src(rel)));
    expect(existing).toHaveLength(7);
  });
});

// ── EXTRACT-002: App.jsx close-related logic is significantly reduced ─────────

describe('EXTRACT-002 App.jsx close-related logic is significantly reduced', () => {
  const appContent = readFileSync(src('App.jsx'), 'utf8');
  const lines = appContent.split('\n');

  it('close-related code in App.jsx is under 200 lines', () => {
    const closePattern = /closePolicy|closeSession|CloseApproval|CloseReview|CloseEvidence|ShiftHandoff|CloseSummary|closeAssurance|openCloseReview|showCloseReview|closeReviewData|currentShiftKey|sessionsForDay|shiftFloatOverride|shiftIsFinal|activeCloseSession/;
    const closeLines = lines.filter(line => closePattern.test(line)).length;
    expect(closeLines).toBeLessThan(200);
  });

  it('CloseSummaryPanel is imported in App.jsx', () => {
    expect(appContent).toMatch(/import CloseSummaryPanel/);
  });

  it('CloseSummaryPanel is rendered in App.jsx', () => {
    expect(appContent).toMatch(/<CloseSummaryPanel/);
  });

  it('CloseApprovalPanel is imported in App.jsx', () => {
    expect(appContent).toMatch(/import CloseApprovalPanel/);
  });

  it('ShiftHandoff is imported in App.jsx', () => {
    expect(appContent).toMatch(/import ShiftHandoff/);
  });

  it('CloseReviewModal is imported in App.jsx', () => {
    expect(appContent).toMatch(/import CloseReviewModal/);
  });
});

// ── EXTRACT-003: service files are ESM ───────────────────────────────────────

describe('EXTRACT-003 close service files use ESM exports', () => {
  const services = [
    'services/registerVariance.js',
    'services/shiftKeys.js',
    'services/closePacketGenerator.js',
    'services/closeReopenGuard.js',
  ];

  services.forEach(rel => {
    it(`${rel} uses export keyword (not module.exports)`, () => {
      const content = readFileSync(src(rel), 'utf8');
      expect(content).toMatch(/^export\s/m);
      expect(content).not.toMatch(/module\.exports/);
    });
  });
});
