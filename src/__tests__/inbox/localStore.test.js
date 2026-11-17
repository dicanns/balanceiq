/**
 * INBOX-LOCAL  bill inbox store on the computer: table functions and file handling
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'module';
import { saveInboxFiles, removeInboxFiles, inboxFilePath } from '../../inbox/files.mjs';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const { MIGRATIONS } = require('../../db/migrations.js');
const dbMod = require('../../db/database.js');

const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';

function makeDb() {
  const db = new Database(':memory:');
  MIGRATIONS.find(m => m.version === 53).up(db);
  return db;
}
const b64 = (bytes) => Buffer.from(bytes).toString('base64');
const PDF = b64('%PDF-1.4 test');
const PNG = b64([0x89, 0x50, 0x4e, 0x47, 1, 2]);
const JPG = b64([0xff, 0xd8, 0xff, 0xe0, 1]);
const WEBP = b64(Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 0, 0, 0]), Buffer.from('WEBP'), Buffer.from('x')]));

describe('migration 53', () => {
  it('is restoreSafe and can run twice', () => {
    const db = makeDb();
    const m = MIGRATIONS.find(x => x.version === 53);
    expect(m.restoreSafe).toBe(true);
    expect(() => m.up(db)).not.toThrow();
  });
});

describe('inbox table functions', () => {
  let db;
  beforeEach(() => { db = makeDb(); });

  it('adds once, a second add changes nothing', () => {
    const item = { id: ID1, received_at: '2026-11-16T10:00:00Z', from: 'a@b.ca', subject: 'Bill', note: 'hi', skipped: 1, files: [{ name: 'x.pdf', type: 'application/pdf', size: 3, path: 'inbox/x/x.pdf' }] };
    expect(dbMod.inboxItemAdd(item, db)).toEqual({ ok: true, added: true });
    expect(dbMod.inboxItemAdd({ ...item, subject: 'Changed' }, db)).toEqual({ ok: true, added: false });
    const got = dbMod.inboxItemGet(ID1, db);
    expect(got).toMatchObject({ from_address: 'a@b.ca', subject: 'Bill', note: 'hi', skipped: 1, status: 'waiting', bill_id: null, handled_at: null });
    expect(got.files).toEqual(item.files);
  });

  it('lists oldest first, waiting only by default, and counts', () => {
    dbMod.inboxItemAdd({ id: ID2, received_at: '2026-11-16T12:00:00Z', from: 'a@b.ca' }, db);
    dbMod.inboxItemAdd({ id: ID1, received_at: '2026-11-16T09:00:00Z', from: 'a@b.ca' }, db);
    expect(dbMod.inboxItemsList({}, db).map(i => i.id)).toEqual([ID1, ID2]);
    expect(dbMod.inboxItemsList({ limit: 1 }, db)).toHaveLength(1);
    expect(dbMod.inboxWaitingCount(db)).toBe(2);
    dbMod.inboxItemMark(ID1, 'dismissed', {}, db);
    expect(dbMod.inboxWaitingCount(db)).toBe(1);
    expect(dbMod.inboxItemsList({}, db).map(i => i.id)).toEqual([ID2]);
    expect(dbMod.inboxItemsList({ status: 'dismissed' }, db).map(i => i.id)).toEqual([ID1]);
  });

  it('marks filed with a bill id, then back to waiting clears it', () => {
    dbMod.inboxItemAdd({ id: ID1, received_at: '2026-11-16T09:00:00Z' }, db);
    expect(dbMod.inboxItemMark(ID1, 'filed', { billId: 42 }, db)).toEqual({ ok: true });
    let got = dbMod.inboxItemGet(ID1, db);
    expect(got).toMatchObject({ status: 'filed', bill_id: 42 });
    expect(got.handled_at).toBeTruthy();
    expect(dbMod.inboxItemMark(ID1, 'waiting', {}, db)).toEqual({ ok: true });
    got = dbMod.inboxItemGet(ID1, db);
    expect(got).toMatchObject({ status: 'waiting', bill_id: null, handled_at: null });
  });

  it('refuses an unknown status without throwing, and a missing id gives null', () => {
    dbMod.inboxItemAdd({ id: ID1, received_at: '2026-11-16T09:00:00Z' }, db);
    expect(dbMod.inboxItemMark(ID1, 'bogus', {}, db)).toEqual({ ok: false });
    expect(dbMod.inboxItemGet(ID1, db).status).toBe('waiting');
    expect(dbMod.inboxItemGet('nope', db)).toBeNull();
    expect(dbMod.inboxItemMark('nope', 'filed', {}, db)).toEqual({ ok: false });
  });
});

describe('inbox files', () => {
  let base;
  beforeEach(() => { base = fs.mkdtempSync(path.join(os.tmpdir(), 'biq-inbox-')); });
  afterEach(() => { fs.rmSync(base, { recursive: true, force: true }); });

  it('writes each type under the item folder with a relative path', () => {
    const r = saveInboxFiles(base, ID1, [
      { name: 'a.pdf', type: 'application/pdf', data_base64: PDF },
      { name: 'b.png', type: 'image/png', data_base64: PNG },
      { name: 'c.jpeg', type: 'image/jpeg', data_base64: JPG },
      { name: 'd.webp', type: 'image/webp', data_base64: WEBP },
    ]);
    expect(r.rejected).toBe(0);
    expect(r.files.map(f => f.name)).toEqual(['a.pdf', 'b.png', 'c.jpg', 'd.webp']);
    expect(r.files[0]).toMatchObject({ type: 'application/pdf', size: 13, path: `inbox/${ID1}/a.pdf` });
    expect(fs.readFileSync(path.join(base, r.files[0].path)).toString()).toBe('%PDF-1.4 test');
  });

  it('turns traversal and odd names into plain file names inside the folder', () => {
    const r = saveInboxFiles(base, ID1, [
      { name: '../../etc/passwd.pdf', type: 'application/pdf', data_base64: PDF },
      { name: 'C:\\x\\y.pdf', type: 'application/pdf', data_base64: PDF },
      { name: '', type: 'application/pdf', data_base64: PDF },
      { name: '...', type: 'image/png', data_base64: PNG },
      { name: 'x'.repeat(200) + '.pdf', type: 'application/pdf', data_base64: PDF },
      { name: 'weird<>:"|?*.exe', type: 'application/pdf', data_base64: PDF },
    ]);
    expect(r.files.map(f => f.name).slice(0, 4)).toEqual(['passwd.pdf', 'y.pdf', 'document.pdf', 'document.png']);
    for (const f of r.files) {
      expect(f.name).toMatch(/^[A-Za-z0-9 ._-]{1,80}$/);
      expect(path.dirname(path.join(base, f.path))).toBe(path.join(base, 'inbox', ID1));
    }
    expect(fs.existsSync(path.join(base, 'etc'))).toBe(false);
  });

  it('never gives two files the same name', () => {
    const r = saveInboxFiles(base, ID1, [
      { name: 'bill.pdf', type: 'application/pdf', data_base64: PDF },
      { name: 'bill.pdf', type: 'application/pdf', data_base64: PDF },
      { name: 'BILL.pdf', type: 'application/pdf', data_base64: PDF },
    ]);
    expect(r.files.map(f => f.name)).toEqual(['bill.pdf', 'bill (2).pdf', 'BILL (3).pdf']);
  });

  it('rejects wrong bytes, unknown types and bad ids', () => {
    const r = saveInboxFiles(base, ID1, [
      { name: 'a.pdf', type: 'application/pdf', data_base64: PNG },
      { name: 'b.png', type: 'image/png', data_base64: PDF },
      { name: 'c.webp', type: 'image/webp', data_base64: b64('RIFFxxxxWAVE') },
      { name: 'd.exe', type: 'application/x-msdownload', data_base64: PDF },
      { name: 'e.pdf', type: 'application/pdf' },
    ]);
    expect(r).toEqual({ files: [], rejected: 5 });
    expect(fs.existsSync(path.join(base, 'inbox', ID1))).toBe(false);
    expect(() => saveInboxFiles(base, '../evil', [])).toThrow();
  });

  it('inboxFilePath refuses paths outside the inbox folder', () => {
    expect(inboxFilePath(base, `inbox/${ID1}/a.pdf`)).toBe(path.join(base, 'inbox', ID1, 'a.pdf'));
    expect(inboxFilePath(base, '../x.pdf')).toBeNull();
    expect(inboxFilePath(base, `inbox/../../x.pdf`)).toBeNull();
    expect(inboxFilePath(base, 'other/a.pdf')).toBeNull();
    expect(inboxFilePath(base, '/etc/passwd')).toBeNull();
    expect(inboxFilePath(base, 'C:\\x\\y.pdf')).toBeNull();
    expect(inboxFilePath(base, 'inbox')).toBeNull();
    expect(inboxFilePath(base, '')).toBeNull();
  });

  it('removeInboxFiles deletes the folder and is safe when absent', () => {
    saveInboxFiles(base, ID1, [{ name: 'a.pdf', type: 'application/pdf', data_base64: PDF }]);
    removeInboxFiles(base, ID1);
    expect(fs.existsSync(path.join(base, 'inbox', ID1))).toBe(false);
    expect(() => removeInboxFiles(base, ID2)).not.toThrow();
    expect(() => removeInboxFiles(path.join(base, 'missing'), ID2)).not.toThrow();
  });
});
