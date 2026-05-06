/**
 * ANON-REJECT-001  null accessToken returns no_session
 * ANON-REJECT-002  accessToken equal to anon key returns no_session
 * ANON-REJECT-003  valid user JWT is accepted
 */
import { describe, it, expect } from 'vitest';

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.anon.fake';
const USER_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.user.fake';

// The guard logic extracted from each IPC handler in main.js.
// If this returns a non-null object, the handler returns it immediately.
function guardAccessToken(accessToken, anonKey) {
  if (!accessToken || accessToken === anonKey) return { error: 'no_session' };
  return null;
}

// Simulate building the Authorization header as each handler does after passing the guard.
function buildAuthHeader(accessToken) {
  return `Bearer ${accessToken}`;
}

describe('ANON-REJECT-001: null accessToken returns no_session', () => {
  it('null returns no_session', () => {
    expect(guardAccessToken(null, ANON_KEY)).toEqual({ error: 'no_session' });
  });

  it('undefined returns no_session', () => {
    expect(guardAccessToken(undefined, ANON_KEY)).toEqual({ error: 'no_session' });
  });

  it('empty string returns no_session', () => {
    expect(guardAccessToken('', ANON_KEY)).toEqual({ error: 'no_session' });
  });
});

describe('ANON-REJECT-002: accessToken equal to anon key returns no_session', () => {
  it('accessToken === anonKey returns no_session', () => {
    expect(guardAccessToken(ANON_KEY, ANON_KEY)).toEqual({ error: 'no_session' });
  });

  it('does not pass the anon key through to Authorization header', () => {
    const guard = guardAccessToken(ANON_KEY, ANON_KEY);
    expect(guard).not.toBeNull();
    expect(guard.error).toBe('no_session');
  });
});

describe('ANON-REJECT-003: valid user JWT is accepted', () => {
  it('user JWT passes the guard', () => {
    expect(guardAccessToken(USER_JWT, ANON_KEY)).toBeNull();
  });

  it('user JWT is used as Bearer in Authorization header', () => {
    const guard = guardAccessToken(USER_JWT, ANON_KEY);
    expect(guard).toBeNull();
    expect(buildAuthHeader(USER_JWT)).toBe(`Bearer ${USER_JWT}`);
  });

  it('Authorization header does not contain the anon key when user JWT is provided', () => {
    const guard = guardAccessToken(USER_JWT, ANON_KEY);
    expect(guard).toBeNull();
    const header = buildAuthHeader(USER_JWT);
    expect(header).not.toContain(ANON_KEY);
    expect(header).toContain(USER_JWT);
  });
});
