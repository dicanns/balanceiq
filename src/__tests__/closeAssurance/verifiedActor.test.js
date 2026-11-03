/**
 * VACT-001  a PIN or signed-in approval needs the token its verification issued
 * VACT-002  the actor recorded is the verified one, whatever the screen sent
 * VACT-003  a typed name needs no token; tokens expire
 *
 * The identity picker runs in the screen and the verification in the main
 * process. Without a token, a screen could record "approved by the manager,
 * verified by PIN" with no PIN ever typed.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createActorRegistry } = require('../../services/identityCore.js');

describe('VACT-001 verified methods need the token', () => {
  it('refuses a PIN or cloud approval without one', () => {
    const r = createActorRegistry();
    expect(() => r.trust({ actor_name: 'Boss', approval_method: 'pin' })).toThrow('identity_not_verified');
    expect(() => r.trust({ actor_name: 'x@y.z', approval_method: 'cloud_user' })).toThrow('identity_not_verified');
    expect(() => r.trust({ actor_name: 'Boss', approval_method: 'pin', actor_token: 'made-up' })).toThrow('identity_not_verified');
  });
});

describe('VACT-002 the token wins', () => {
  it('replaces the sent actor with the verified one', () => {
    const r = createActorRegistry();
    const token = r.issue({ name: 'Marie', role: 'manager', identity_method: 'pin' });
    const o = r.trust({ id: 7, to: 'approved', actor_name: 'Someone Else', actor_role: 'owner', approval_method: 'cloud_user', actor_token: token });
    expect(o).toEqual({ id: 7, to: 'approved', actor_name: 'Marie', actor_role: 'manager', approval_method: 'pin' });
  });
});

describe('VACT-003 typed names and expiry', () => {
  it('a typed name passes through untouched', () => {
    const r = createActorRegistry();
    expect(r.trust({ actor_name: 'Paul', approval_method: 'typed_name' })).toEqual({ actor_name: 'Paul', approval_method: 'typed_name' });
  });
  it('an expired token is as good as none', () => {
    let t = 1000;
    const r = createActorRegistry({ ttlMs: 50, now: () => t });
    const token = r.issue({ name: 'Marie', role: 'manager', identity_method: 'pin' });
    t += 100;
    expect(() => r.trust({ approval_method: 'pin', actor_token: token })).toThrow('identity_not_verified');
  });
});
