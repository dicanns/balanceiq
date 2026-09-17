/**
 * PREMIG-001  a database behind this build is copied aside before it is opened
 * PREMIG-002  a database already current is left alone
 * PREMIG-003  only the last few copies are kept
 *
 * Migrations ran at the first open, and the daily backup - an export through
 * the open database - came three seconds later. A migration that went wrong had
 * no same-day copy to fall back on.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const { preMigrationSnapshot, latestSchemaVersion } = require('../../../db/database.js');

let dir, backups;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'biq-premig-'));
  backups = path.join(dir, 'Backups');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function fileAtVersion(v) {
  const db = new Database(path.join(dir, 'balanceiq.db'));
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS t (x)`);
  db.prepare(`INSERT INTO t VALUES (?)`).run('kept');
  db.pragma(`user_version = ${v}`);
  db.close();
}

describe('PREMIG-001 behind this build', () => {
  it('copies the file and its write-ahead log before anything opens it', () => {
    fileAtVersion(3);
    const r = preMigrationSnapshot(dir, backups);
    expect(r).toMatchObject({ taken: true, onDisk: 3, latest: latestSchemaVersion() });
    const copies = fs.readdirSync(backups).filter(f => f.startsWith('pre-migration-v3-to-v') && f.endsWith('.db'));
    expect(copies).toHaveLength(1);
    const copy = new Database(path.join(backups, copies[0]), { readonly: true });
    expect(copy.pragma('user_version', { simple: true })).toBe(3);
    expect(copy.prepare(`SELECT x FROM t`).get().x).toBe('kept');
    copy.close();
  });
});

describe('PREMIG-002 already current', () => {
  it('takes no copy', () => {
    fileAtVersion(latestSchemaVersion());
    expect(preMigrationSnapshot(dir, backups)).toMatchObject({ taken: false, reason: 'up_to_date' });
    expect(fs.existsSync(backups)).toBe(false);
    expect(preMigrationSnapshot(path.join(dir, 'nowhere'), backups)).toMatchObject({ taken: false, reason: 'no_database' });
  });
});

describe('PREMIG-003 keeps the last few', () => {
  it('prunes older copies beyond the limit', () => {
    fileAtVersion(1);
    fs.mkdirSync(backups, { recursive: true });
    for (const stamp of ['2026-01-01T00-00-00-000Z', '2026-02-01T00-00-00-000Z', '2026-03-01T00-00-00-000Z']) {
      fs.writeFileSync(path.join(backups, `pre-migration-v1-to-v2-${stamp}.db`), 'x');
    }
    preMigrationSnapshot(dir, backups, 2);
    const left = fs.readdirSync(backups).filter(f => f.endsWith('.db')).sort();
    expect(left).toHaveLength(2);
    expect(left[0]).not.toMatch(/2026-01-01/);
  });
});
