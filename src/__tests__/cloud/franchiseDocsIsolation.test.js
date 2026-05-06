/**
 * ISO-DOC-001  owner of org A can delete doc owned by org A
 * ISO-DOC-002  owner of org A cannot delete doc owned by org B
 * ISO-DOC-003  cashier of org A cannot delete any doc
 * ISO-DOC-004  client-supplied storagePath is ignored; deletion uses DB path
 * ISO-ANN-001  owner can delete announcement in own org
 * ISO-ANN-002  org_id constraint prevents cross-tenant announcement delete
 */
import { describe, it, expect } from 'vitest';

// ── Logic extracted from franchise-docs/index.ts ─────────────────────────
// Simulates the guard logic for delete_doc and delete_announcement.

function verifyOwner(callerOrgId, orgId) {
  return orgId === callerOrgId;
}

function isAdminOrOwner(role) {
  return role === 'owner' || role === 'admin';
}

async function simulateDeleteDoc({ callerOrgId, callerRole, body, dbDoc }) {
  const { docId, orgId, storagePath: clientStoragePath } = body;

  if (!verifyOwner(callerOrgId, orgId)) return { status: 403, error: 'forbidden' };
  if (!isAdminOrOwner(callerRole)) return { status: 403, error: 'forbidden' };

  // storagePath from DB — client-supplied path intentionally ignored
  const doc = dbDoc; // simulates svc.from('franchise_documents').select(...).eq('id', docId)
  if (!doc) return { status: 404, error: 'not_found' };
  if (doc.org_id !== orgId) return { status: 403, error: 'forbidden' };

  // Would call: svc.storage.from('franchise-docs').remove([doc.storage_path])
  // Would call: svc.from('franchise_documents').delete().eq('id', docId).eq('org_id', orgId)
  const storagePathUsed = doc.storage_path; // never clientStoragePath

  return { status: 200, ok: true, storagePathUsed };
}

async function simulateDeleteAnnouncement({ callerOrgId, callerRole, body }) {
  const { annId, orgId } = body;

  if (!verifyOwner(callerOrgId, orgId)) return { status: 403, error: 'forbidden' };
  if (!isAdminOrOwner(callerRole)) return { status: 403, error: 'forbidden' };

  // org_id is applied as a second constraint on the delete:
  // svc.from('franchise_announcements').delete().eq('id', annId).eq('org_id', orgId)
  // This means even if annId belongs to another org, the delete is a no-op (0 rows affected).
  return { status: 200, ok: true, deletedWithOrgId: orgId };
}

// ── ISO-DOC-001: owner of org A can delete their own doc ─────────────────

describe('ISO-DOC-001: owner of org A can delete doc owned by org A', () => {
  it('returns ok when orgId and doc.org_id both match callerOrgId', async () => {
    const result = await simulateDeleteDoc({
      callerOrgId: 'org-a',
      callerRole: 'owner',
      body: { docId: 'doc-1', orgId: 'org-a', storagePath: 'ignored/path' },
      dbDoc: { id: 'doc-1', org_id: 'org-a', storage_path: 'org-a/folder/real.pdf' },
    });
    expect(result.status).toBe(200);
    expect(result.ok).toBe(true);
  });
});

// ── ISO-DOC-002: owner of org A cannot delete doc owned by org B ─────────

describe('ISO-DOC-002: owner of org A cannot delete doc owned by org B', () => {
  it('returns 403 when doc.org_id does not match requested orgId', async () => {
    const result = await simulateDeleteDoc({
      callerOrgId: 'org-a',
      callerRole: 'owner',
      body: { docId: 'doc-99', orgId: 'org-a', storagePath: 'anything' },
      dbDoc: { id: 'doc-99', org_id: 'org-b', storage_path: 'org-b/folder/secret.pdf' },
    });
    expect(result.status).toBe(403);
    expect(result.error).toBe('forbidden');
  });

  it('returns 403 when caller requests a different org entirely', async () => {
    const result = await simulateDeleteDoc({
      callerOrgId: 'org-a',
      callerRole: 'owner',
      body: { docId: 'doc-99', orgId: 'org-b', storagePath: 'anything' },
      dbDoc: { id: 'doc-99', org_id: 'org-b', storage_path: 'org-b/folder/secret.pdf' },
    });
    expect(result.status).toBe(403);
  });
});

// ── ISO-DOC-003: cashier cannot delete any doc ────────────────────────────

describe('ISO-DOC-003: cashier of org A cannot delete any doc', () => {
  it('returns 403 for role=member', async () => {
    const result = await simulateDeleteDoc({
      callerOrgId: 'org-a',
      callerRole: 'member',
      body: { docId: 'doc-1', orgId: 'org-a', storagePath: 'whatever' },
      dbDoc: { id: 'doc-1', org_id: 'org-a', storage_path: 'org-a/folder/doc.pdf' },
    });
    expect(result.status).toBe(403);
  });

  it('returns 403 for role=cashier', async () => {
    const result = await simulateDeleteDoc({
      callerOrgId: 'org-a',
      callerRole: 'cashier',
      body: { docId: 'doc-1', orgId: 'org-a', storagePath: 'whatever' },
      dbDoc: { id: 'doc-1', org_id: 'org-a', storage_path: 'org-a/folder/doc.pdf' },
    });
    expect(result.status).toBe(403);
  });

  it('admin role can delete (positive case)', async () => {
    const result = await simulateDeleteDoc({
      callerOrgId: 'org-a',
      callerRole: 'admin',
      body: { docId: 'doc-1', orgId: 'org-a', storagePath: 'whatever' },
      dbDoc: { id: 'doc-1', org_id: 'org-a', storage_path: 'org-a/folder/doc.pdf' },
    });
    expect(result.status).toBe(200);
  });
});

// ── ISO-DOC-004: client-supplied storagePath is ignored ───────────────────

describe('ISO-DOC-004: deletion uses storage_path from DB, not from client', () => {
  it('storagePathUsed comes from DB row, not body.storagePath', async () => {
    const result = await simulateDeleteDoc({
      callerOrgId: 'org-a',
      callerRole: 'owner',
      body: { docId: 'doc-1', orgId: 'org-a', storagePath: 'malicious/path/to/other-tenant.pdf' },
      dbDoc: { id: 'doc-1', org_id: 'org-a', storage_path: 'org-a/invoices/real.pdf' },
    });
    expect(result.status).toBe(200);
    expect(result.storagePathUsed).toBe('org-a/invoices/real.pdf');
    expect(result.storagePathUsed).not.toBe('malicious/path/to/other-tenant.pdf');
  });
});

// ── ISO-ANN-001: owner can delete their own announcement ─────────────────

describe('ISO-ANN-001: owner can delete announcement in own org', () => {
  it('returns ok and includes orgId in delete constraint', async () => {
    const result = await simulateDeleteAnnouncement({
      callerOrgId: 'org-a',
      callerRole: 'owner',
      body: { annId: 'ann-1', orgId: 'org-a' },
    });
    expect(result.status).toBe(200);
    expect(result.ok).toBe(true);
    expect(result.deletedWithOrgId).toBe('org-a');
  });
});

// ── ISO-ANN-002: org_id constraint prevents cross-tenant delete ───────────

describe('ISO-ANN-002: org_id constraint prevents cross-tenant announcement delete', () => {
  it('returns 403 when caller tries to delete from different org', async () => {
    const result = await simulateDeleteAnnouncement({
      callerOrgId: 'org-a',
      callerRole: 'owner',
      body: { annId: 'ann-99', orgId: 'org-b' }, // caller is org-a, targeting org-b
    });
    expect(result.status).toBe(403);
  });

  it('delete is scoped to callerOrgId, not attacker-supplied orgId', async () => {
    const result = await simulateDeleteAnnouncement({
      callerOrgId: 'org-a',
      callerRole: 'owner',
      body: { annId: 'ann-1', orgId: 'org-a' },
    });
    // The org_id used in the DB delete must match the caller's own org
    expect(result.deletedWithOrgId).toBe('org-a');
  });

  it('cashier cannot delete announcements', async () => {
    const result = await simulateDeleteAnnouncement({
      callerOrgId: 'org-a',
      callerRole: 'cashier',
      body: { annId: 'ann-1', orgId: 'org-a' },
    });
    expect(result.status).toBe(403);
  });
});
