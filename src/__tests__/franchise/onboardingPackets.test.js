/**
 * ONBOARDING-001  packetGenerator.js — pure functions
 * ONBOARDING-002  DB round-trips — franchise_onboarding_packets + franchise_location_onboarding
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { runMigrations } = require('../../db/migrations.js');
import {
  onboardingPacketSave,
  onboardingPacketList,
  onboardingPacketGet,
  onboardingPacketDelete,
  onboardingPacketApply,
  locationOnboardingGet,
} from '../../db/database.js';
import {
  buildPacketDefaults,
  parseChecklist,
  parseRequiredDocs,
  validatePacket,
  REPORTING_CADENCES,
  buildLocationOnboarding,
  DEFAULT_CHECKLIST,
  DEFAULT_REQUIRED_DOCS,
} from '../../services/packetGenerator.js';

// ── ONBOARDING-001  Pure function tests ───────────────────────────────────────

describe('ONBOARDING-001-A buildPacketDefaults', () => {
  it('returns an object with all required keys', () => {
    const d = buildPacketDefaults('org-1');
    expect(d).toHaveProperty('packetName');
    expect(d).toHaveProperty('setupChecklistJson');
    expect(d).toHaveProperty('requiredDocsListJson');
    expect(d).toHaveProperty('reportingCadence');
    expect(d).toHaveProperty('franchisorOrgId');
  });

  it('sets franchisorOrgId from argument', () => {
    expect(buildPacketDefaults('org-abc').franchisorOrgId).toBe('org-abc');
  });

  it('defaults reportingCadence to monthly', () => {
    expect(buildPacketDefaults().reportingCadence).toBe('monthly');
  });

  it('setupChecklistJson is valid JSON with items', () => {
    const d = buildPacketDefaults();
    const cl = JSON.parse(d.setupChecklistJson);
    expect(Array.isArray(cl)).toBe(true);
    expect(cl.length).toBeGreaterThan(0);
  });

  it('requiredDocsListJson is valid JSON with items', () => {
    const d = buildPacketDefaults();
    const docs = JSON.parse(d.requiredDocsListJson);
    expect(Array.isArray(docs)).toBe(true);
    expect(docs.length).toBeGreaterThan(0);
  });
});

describe('ONBOARDING-001-B parseChecklist', () => {
  it('parses valid JSON checklist', () => {
    const items = [{ key: 'a', labelFr: 'A', labelEn: 'A', done: false }];
    expect(parseChecklist(JSON.stringify(items))).toEqual(items);
  });

  it('returns [] for null/undefined input', () => {
    expect(parseChecklist(null)).toEqual([]);
    expect(parseChecklist(undefined)).toEqual([]);
    expect(parseChecklist('')).toEqual([]);
  });

  it('returns [] for malformed JSON', () => {
    expect(parseChecklist('not-json')).toEqual([]);
  });

  it('returns [] for JSON that is not an array', () => {
    expect(parseChecklist(JSON.stringify({ a: 1 }))).toEqual([]);
  });
});

describe('ONBOARDING-001-C parseRequiredDocs', () => {
  it('parses valid docs JSON', () => {
    const docs = [{ key: 'x', labelFr: 'X', labelEn: 'X' }];
    expect(parseRequiredDocs(JSON.stringify(docs))).toEqual(docs);
  });

  it('returns [] for empty/null input', () => {
    expect(parseRequiredDocs(null)).toEqual([]);
  });
});

describe('ONBOARDING-001-D validatePacket', () => {
  it('returns no errors for a valid packet', () => {
    const errors = validatePacket({ packetName: 'Standard', reportingCadence: 'monthly' });
    expect(errors).toHaveLength(0);
  });

  it('returns error when packetName is missing', () => {
    const errors = validatePacket({ packetName: '', reportingCadence: 'monthly' });
    expect(errors.some(e => e.includes('packetName'))).toBe(true);
  });

  it('returns error when packetName is blank whitespace', () => {
    const errors = validatePacket({ packetName: '   ', reportingCadence: 'monthly' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('returns error for unknown reporting cadence', () => {
    const errors = validatePacket({ packetName: 'Test', reportingCadence: 'hourly' });
    expect(errors.some(e => e.includes('reportingCadence'))).toBe(true);
  });

  it('accepts all valid cadences', () => {
    for (const c of REPORTING_CADENCES) {
      expect(validatePacket({ packetName: 'X', reportingCadence: c })).toHaveLength(0);
    }
  });
});

describe('ONBOARDING-001-E buildLocationOnboarding', () => {
  it('copies checklistJson and cadence from packet', () => {
    const packet = { id: 5, setupChecklistJson: '[{"key":"a"}]', reportingCadence: 'weekly' };
    const result = buildLocationOnboarding(packet, { locationId: 3, royaltyRate: 6, adRate: 2 });
    expect(result.checklistJson).toBe('[{"key":"a"}]');
    expect(result.reportingCadence).toBe('weekly');
    expect(result.royaltyRate).toBe(6);
    expect(result.adRate).toBe(2);
    expect(result.packetId).toBe(5);
    expect(result.locationId).toBe(3);
  });

  it('allows null royalty overrides', () => {
    const packet = { id: 1, setupChecklistJson: '[]', reportingCadence: 'monthly' };
    const result = buildLocationOnboarding(packet, { locationId: 1 });
    expect(result.royaltyRate).toBeNull();
    expect(result.adRate).toBeNull();
  });
});

describe('ONBOARDING-001-F DEFAULT_CHECKLIST and DEFAULT_REQUIRED_DOCS', () => {
  it('DEFAULT_CHECKLIST has expected keys', () => {
    const keys = DEFAULT_CHECKLIST.map(i => i.key);
    expect(keys).toContain('pos_setup');
    expect(keys).toContain('training_done');
  });

  it('DEFAULT_REQUIRED_DOCS has expected keys', () => {
    const keys = DEFAULT_REQUIRED_DOCS.map(d => d.key);
    expect(keys).toContain('franchise_agreement');
    expect(keys).toContain('health_permit');
  });

  it('each checklist item has labelFr and labelEn', () => {
    for (const item of DEFAULT_CHECKLIST) {
      expect(typeof item.labelFr).toBe('string');
      expect(typeof item.labelEn).toBe('string');
    }
  });
});

// ── ONBOARDING-002  DB round-trip tests ───────────────────────────────────────

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

const samplePacket = {
  franchisorOrgId:     'org-test',
  packetName:          'Standard QSR',
  setupChecklistJson:  JSON.stringify([{ key: 'a', labelFr: 'A', labelEn: 'A', done: false }]),
  requiredDocsListJson: JSON.stringify([{ key: 'b', labelFr: 'B', labelEn: 'B' }]),
  reportingCadence:    'monthly',
};

describe('ONBOARDING-002 packet creation', () => {
  let db;
  beforeEach(() => { db = makeDb(); });

  it('packet stored with all template references', () => {
    const saved = onboardingPacketSave(samplePacket, db);
    expect(saved.id).toBeTruthy();
    expect(saved.packet_name).toBe('Standard QSR');
    expect(saved.reporting_cadence).toBe('monthly');
    expect(saved.franchisor_org_id).toBe('org-test');
  });

  it('packet is retrievable by id', () => {
    const saved = onboardingPacketSave(samplePacket, db);
    const fetched = onboardingPacketGet(saved.id, db);
    expect(fetched.packet_name).toBe('Standard QSR');
  });

  it('list returns all packets', () => {
    onboardingPacketSave(samplePacket, db);
    onboardingPacketSave({ ...samplePacket, packetName: 'Premium' }, db);
    expect(onboardingPacketList(db)).toHaveLength(2);
  });

  it('packet can be updated', () => {
    const saved = onboardingPacketSave(samplePacket, db);
    const updated = onboardingPacketSave({ ...samplePacket, id: saved.id, packetName: 'Updated' }, db);
    expect(updated.packet_name).toBe('Updated');
    expect(onboardingPacketList(db)).toHaveLength(1);
  });

  it('packet can be deleted', () => {
    const saved = onboardingPacketSave(samplePacket, db);
    onboardingPacketDelete(saved.id, db);
    expect(onboardingPacketList(db)).toHaveLength(0);
    expect(onboardingPacketGet(saved.id, db)).toBeNull();
  });

  it('stores setup_checklist_json correctly', () => {
    const saved = onboardingPacketSave(samplePacket, db);
    const cl = parseChecklist(saved.setup_checklist_json);
    expect(cl).toHaveLength(1);
    expect(cl[0].key).toBe('a');
  });
});

describe('ONBOARDING-002 packet application to new location', () => {
  let db;
  beforeEach(() => { db = makeDb(); });

  it('applying packet creates location-level checklist instances', () => {
    const pkt = onboardingPacketSave(samplePacket, db);
    const state = onboardingPacketApply(pkt.id, 10, null, null, db);
    const cl = parseChecklist(state.checklist_json);
    expect(cl).toHaveLength(1);
    expect(cl[0].key).toBe('a');
  });

  it('applying packet sets royalty profile', () => {
    const pkt = onboardingPacketSave(samplePacket, db);
    const state = onboardingPacketApply(pkt.id, 10, 5.5, 2.0, db);
    expect(state.royalty_rate).toBeCloseTo(5.5, 2);
    expect(state.ad_rate).toBeCloseTo(2.0, 2);
  });

  it('applying packet sets reporting cadence', () => {
    const pkt = onboardingPacketSave({ ...samplePacket, reportingCadence: 'weekly' }, db);
    const state = onboardingPacketApply(pkt.id, 11, null, null, db);
    expect(state.reporting_cadence).toBe('weekly');
  });

  it('locationOnboardingGet returns applied state', () => {
    const pkt = onboardingPacketSave(samplePacket, db);
    onboardingPacketApply(pkt.id, 20, 6, 1, db);
    const state = locationOnboardingGet(20, db);
    expect(state).not.toBeNull();
    expect(state.packet_id).toBe(pkt.id);
    expect(state.royalty_rate).toBeCloseTo(6, 2);
  });

  it('locationOnboardingGet returns null when no packet applied', () => {
    expect(locationOnboardingGet(99, makeDb())).toBeNull();
  });

  it('re-applying overwrites previous state (upsert)', () => {
    const pkt1 = onboardingPacketSave(samplePacket, db);
    const pkt2 = onboardingPacketSave({ ...samplePacket, packetName: 'Premium', reportingCadence: 'daily' }, db);
    onboardingPacketApply(pkt1.id, 30, 5, 1, db);
    onboardingPacketApply(pkt2.id, 30, 7, 2, db);
    const state = locationOnboardingGet(30, db);
    expect(state.packet_id).toBe(pkt2.id);
    expect(state.reporting_cadence).toBe('daily');
    expect(state.royalty_rate).toBeCloseTo(7, 2);
  });

  it('applying non-existent packet throws', () => {
    expect(() => onboardingPacketApply(9999, 1, null, null, db)).toThrow();
  });

  it('deleting packet also removes location onboarding rows', () => {
    const pkt = onboardingPacketSave(samplePacket, db);
    onboardingPacketApply(pkt.id, 40, null, null, db);
    expect(locationOnboardingGet(40, db)).not.toBeNull();
    onboardingPacketDelete(pkt.id, db);
    expect(locationOnboardingGet(40, db)).toBeNull();
  });

  it('schema is v34 after migration', () => {
    expect(db.pragma('user_version', { simple: true })).toBe(34);
  });

  it('both tables are included in backup', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
    expect(tables).toContain('franchise_onboarding_packets');
    expect(tables).toContain('franchise_location_onboarding');
  });
});
