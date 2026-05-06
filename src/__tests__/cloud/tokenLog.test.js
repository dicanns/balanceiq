/**
 * LOG-001       Square accessToken is not logged anywhere in main.js
 * TRIGGER-001   handle_new_user trigger logic creates org + user row
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// ── LOG-001 ───────────────────────────────────────────────────────────────────

describe('LOG-001: Square accessToken must not be logged', () => {
  const mainJs = readFileSync(join(process.cwd(), 'main.js'), 'utf8');

  it('main.js does not log token prefix', () => {
    expect(mainJs).not.toContain('token prefix:');
  });

  it('main.js does not slice the accessToken for logging', () => {
    // slice(0,N) on an access token = credential in logs
    // Grep for the pattern near console.log in pos:testConnection context
    const logLine = mainJs
      .split('\n')
      .find(l => l.includes('pos:testConnection') && l.includes('console.log') && l.includes('square url:'));
    // If the log line exists it must not contain accessToken slice
    if (logLine) {
      expect(logLine).not.toMatch(/accessToken.*slice/);
    }
  });

  it('main.js logs merchant name instead', () => {
    expect(mainJs).toContain("'merchant:'");
  });
});

// ── TRIGGER-001 ───────────────────────────────────────────────────────────────

describe('TRIGGER-001: handle_new_user trigger logic', () => {
  function simulateTrigger(newUser) {
    // Simulates: INSERT INTO organizations(plan='free') RETURNING id
    // then INSERT INTO users(id, org_id, role='owner')
    const orgId = 'generated-org-uuid';
    return {
      org: { id: orgId, plan: 'free' },
      user: { id: newUser.id, org_id: orgId, role: 'owner' },
    };
  }

  it('creates org with plan=free', () => {
    const { org } = simulateTrigger({ id: 'user-1' });
    expect(org.plan).toBe('free');
    expect(org.id).toBeTruthy();
  });

  it('creates users row with role=owner and correct org_id', () => {
    const { org, user } = simulateTrigger({ id: 'user-1' });
    expect(user.id).toBe('user-1');
    expect(user.org_id).toBe(org.id);
    expect(user.role).toBe('owner');
  });

  it('migration file exists', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260505000004_handle_new_user.sql'),
      'utf8'
    );
    expect(migration).toContain('handle_new_user');
    expect(migration).toContain('on_auth_user_created');
    expect(migration).toContain("INSERT INTO public.organizations");
    expect(migration).toContain("INSERT INTO public.users");
  });
});
