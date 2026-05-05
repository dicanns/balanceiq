/**
 * NETWORK-SCORE-001  networkScore.js — pure function correctness
 * NETWORK-SCORE-002  networkScoreSave / networkScoreGet / networkScoreList DB round-trips
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { runMigrations } = require('../../db/migrations.js');
const {
  computeNetworkScore,
  scoreGrade,
  scoreColor,
  SCORE_WEIGHTS,
  COMPONENT_LABELS,
} = await import('../../services/networkScore.js');

function makeDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL DEFAULT 'test',
      module TEXT NOT NULL, action TEXT NOT NULL,
      record_type TEXT NOT NULL, record_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS forecast_products (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT DEFAULT '');
    CREATE TABLE IF NOT EXISTS ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_fr TEXT NOT NULL, name_en TEXT DEFAULT '', category TEXT DEFAULT 'other'
    );
    CREATE TABLE IF NOT EXISTS checklist_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title_fr TEXT NOT NULL, title_en TEXT NOT NULL,
      required INTEGER DEFAULT 0, frequency TEXT DEFAULT 'daily',
      category TEXT DEFAULT 'custom', sort_order INTEGER DEFAULT 0, active INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS checklist_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL, date TEXT NOT NULL,
      completed INTEGER DEFAULT 0, completed_by TEXT,
      UNIQUE(template_id, date)
    );
  `);
  db.pragma('user_version = 7');
  runMigrations(db);
  return db;
}

// ── NETWORK-SCORE-001: Pure functions ─────────────────────────────────────────

describe('NETWORK-SCORE-001 SCORE_WEIGHTS', () => {
  it('sum of all weights equals 1.0', () => {
    const sum = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1.0)).toBeLessThan(0.0001);
  });

  it('has exactly 6 components', () => {
    expect(Object.keys(SCORE_WEIGHTS)).toHaveLength(6);
  });

  it('contains expected component keys', () => {
    expect(SCORE_WEIGHTS).toHaveProperty('closeOnTime');
    expect(SCORE_WEIGHTS).toHaveProperty('depositReconciled');
    expect(SCORE_WEIGHTS).toHaveProperty('royaltyDataComplete');
    expect(SCORE_WEIGHTS).toHaveProperty('documentsComplete');
    expect(SCORE_WEIGHTS).toHaveProperty('noAnomalies');
    expect(SCORE_WEIGHTS).toHaveProperty('monthEndReady');
  });
});

describe('NETWORK-SCORE-001 computeNetworkScore', () => {
  it('returns 0 when all components are 0', () => {
    expect(computeNetworkScore({
      closeOnTime: 0, depositReconciled: 0, royaltyDataComplete: 0,
      documentsComplete: 0, noAnomalies: 0, monthEndReady: 0,
    })).toBe(0);
  });

  it('returns 100 when all components are 1', () => {
    expect(computeNetworkScore({
      closeOnTime: 1, depositReconciled: 1, royaltyDataComplete: 1,
      documentsComplete: 1, noAnomalies: 1, monthEndReady: 1,
    })).toBe(100);
  });

  it('clamps component values above 1 to 1', () => {
    expect(computeNetworkScore({
      closeOnTime: 2, depositReconciled: 1, royaltyDataComplete: 1,
      documentsComplete: 1, noAnomalies: 1, monthEndReady: 1,
    })).toBe(100);
  });

  it('clamps component values below 0 to 0', () => {
    expect(computeNetworkScore({
      closeOnTime: -1, depositReconciled: 0, royaltyDataComplete: 0,
      documentsComplete: 0, noAnomalies: 0, monthEndReady: 0,
    })).toBe(0);
  });

  it('treats missing components as 0', () => {
    expect(computeNetworkScore({})).toBe(0);
  });

  it('returns expected weighted total for partial components', () => {
    // Only closeOnTime = 1 (weight 0.20) and royaltyDataComplete = 1 (weight 0.20) => 40
    const score = computeNetworkScore({
      closeOnTime: 1, royaltyDataComplete: 1,
    });
    expect(score).toBe(40);
  });

  it('returns integer (rounded)', () => {
    const score = computeNetworkScore({ closeOnTime: 0.5 });
    expect(Number.isInteger(score)).toBe(true);
  });
});

describe('NETWORK-SCORE-001 scoreGrade', () => {
  it('returns A for score >= 90', () => {
    expect(scoreGrade(90)).toBe('A');
    expect(scoreGrade(100)).toBe('A');
  });

  it('returns B for 75-89', () => {
    expect(scoreGrade(75)).toBe('B');
    expect(scoreGrade(89)).toBe('B');
  });

  it('returns C for 60-74', () => {
    expect(scoreGrade(60)).toBe('C');
    expect(scoreGrade(74)).toBe('C');
  });

  it('returns D for 40-59', () => {
    expect(scoreGrade(40)).toBe('D');
    expect(scoreGrade(59)).toBe('D');
  });

  it('returns F for score < 40', () => {
    expect(scoreGrade(39)).toBe('F');
    expect(scoreGrade(0)).toBe('F');
  });
});

describe('NETWORK-SCORE-001 scoreColor', () => {
  it('returns green for score >= 90', () => {
    expect(scoreColor(90)).toBe('#22c55e');
  });

  it('returns yellow-green for 75-89', () => {
    expect(scoreColor(75)).toBe('#84cc16');
  });

  it('returns amber for 60-74', () => {
    expect(scoreColor(60)).toBe('#f59e0b');
  });

  it('returns orange for 40-59', () => {
    expect(scoreColor(40)).toBe('#f97316');
  });

  it('returns red for score < 40', () => {
    expect(scoreColor(39)).toBe('#ef4444');
  });
});

describe('NETWORK-SCORE-001 COMPONENT_LABELS', () => {
  it('has FR and EN entries', () => {
    expect(COMPONENT_LABELS).toHaveProperty('fr');
    expect(COMPONENT_LABELS).toHaveProperty('en');
  });

  it('FR has a label for every SCORE_WEIGHTS key', () => {
    for (const key of Object.keys(SCORE_WEIGHTS)) {
      expect(typeof COMPONENT_LABELS.fr[key]).toBe('string');
    }
  });

  it('EN has a label for every SCORE_WEIGHTS key', () => {
    for (const key of Object.keys(SCORE_WEIGHTS)) {
      expect(typeof COMPONENT_LABELS.en[key]).toBe('string');
    }
  });
});

// ── NETWORK-SCORE-002: DB round-trips ─────────────────────────────────────────

describe('NETWORK-SCORE-002 network_compliance_score table', () => {
  let db;
  beforeEach(() => { db = makeDb(); });

  it('table exists after migration v30', () => {
    const tbl = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='network_compliance_score'").get();
    expect(tbl).toBeTruthy();
  });

  it('schema version is at least 30', () => {
    expect(db.pragma('user_version', { simple: true })).toBeGreaterThanOrEqual(30);
  });
});

describe('NETWORK-SCORE-002 networkScoreSave / networkScoreGet / networkScoreList', () => {
  const { networkScoreSave, networkScoreGet, networkScoreList } = require('../../db/database.js');
  let db;
  beforeEach(() => { db = makeDb(); });

  it('saves and retrieves a score', () => {
    networkScoreSave({ locationId: 1, period: '2026-05', closeOnTime: 0.9, depositReconciled: 0.8, royaltyDataComplete: 1, documentsComplete: 0.7, noAnomalies: 1, monthEndReady: 0.5, totalScore: 82 }, db);
    const row = networkScoreGet(1, '2026-05', db);
    expect(row).toBeTruthy();
    expect(row.location_id).toBe(1);
    expect(row.period).toBe('2026-05');
    expect(row.total_score).toBe(82);
    expect(row.close_on_time).toBe(0.9);
  });

  it('upserts: saving twice for same location+period overwrites', () => {
    networkScoreSave({ locationId: 1, period: '2026-05', totalScore: 60 }, db);
    networkScoreSave({ locationId: 1, period: '2026-05', totalScore: 90 }, db);
    const rows = db.prepare("SELECT * FROM network_compliance_score WHERE location_id=1 AND period='2026-05'").all();
    expect(rows).toHaveLength(1);
    expect(rows[0].total_score).toBe(90);
  });

  it('networkScoreGet returns null when no record exists', () => {
    const row = networkScoreGet(99, '2026-05', db);
    expect(row).toBeNull();
  });

  it('networkScoreList returns all scores for a period sorted by total_score DESC', () => {
    networkScoreSave({ locationId: 1, period: '2026-05', totalScore: 55 }, db);
    networkScoreSave({ locationId: 2, period: '2026-05', totalScore: 90 }, db);
    networkScoreSave({ locationId: 3, period: '2026-05', totalScore: 75 }, db);
    const rows = networkScoreList('2026-05', db);
    expect(rows).toHaveLength(3);
    expect(rows[0].total_score).toBe(90);
    expect(rows[1].total_score).toBe(75);
    expect(rows[2].total_score).toBe(55);
  });

  it('networkScoreList returns empty array for period with no records', () => {
    const rows = networkScoreList('2020-01', db);
    expect(rows).toHaveLength(0);
  });

  it('scores for different periods are independent', () => {
    networkScoreSave({ locationId: 1, period: '2026-04', totalScore: 70 }, db);
    networkScoreSave({ locationId: 1, period: '2026-05', totalScore: 85 }, db);
    expect(networkScoreGet(1, '2026-04', db).total_score).toBe(70);
    expect(networkScoreGet(1, '2026-05', db).total_score).toBe(85);
  });

  it('saved row has computed_at timestamp', () => {
    networkScoreSave({ locationId: 1, period: '2026-05', totalScore: 80 }, db);
    const row = networkScoreGet(1, '2026-05', db);
    expect(typeof row.computed_at).toBe('string');
    expect(row.computed_at.length).toBeGreaterThan(0);
  });
});
