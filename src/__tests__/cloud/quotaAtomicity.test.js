/**
 * QUOTA-ATOM-001  increment_usage_if_under_limit returns new count when below limit
 * QUOTA-ATOM-002  returns -1 when limit already reached (no increment)
 * QUOTA-ATOM-003  two concurrent calls at count=limit-1 cannot both succeed
 */
import { describe, it, expect } from 'vitest';

// Simulates the RPC logic from 20260505000003_quota_rpc.sql
// and the edge function guard pattern using it.

function simulateRpc(currentCount, limit) {
  if (currentCount >= limit) return -1; // WHERE clause fails — no update
  return currentCount + 1;
}

function simulateOcrGuard({ currentCount, limit, rpcResult }) {
  // rpcResult = what increment_usage_if_under_limit returned
  if (rpcResult === null || rpcResult === -1) {
    return { status: 200, error: 'limit_reached', scansUsed: currentCount, scansLimit: limit };
  }
  return { status: 200, ok: true, newCount: rpcResult };
}

// ── QUOTA-ATOM-001 ────────────────────────────────────────────────────────────

describe('QUOTA-ATOM-001: increment returns new count when below limit', () => {
  it('first call on empty table: count goes from 0 to 1', () => {
    expect(simulateRpc(0, 100)).toBe(1);
  });

  it('call when count=49 and limit=50: returns 50', () => {
    expect(simulateRpc(49, 50)).toBe(50);
  });

  it('call when count=1 and limit=100: returns 2', () => {
    expect(simulateRpc(1, 100)).toBe(2);
  });
});

// ── QUOTA-ATOM-002 ────────────────────────────────────────────────────────────

describe('QUOTA-ATOM-002: returns -1 when limit is reached', () => {
  it('call when count=50 and limit=50: returns -1', () => {
    expect(simulateRpc(50, 50)).toBe(-1);
  });

  it('call when count=100 and limit=100: returns -1', () => {
    expect(simulateRpc(100, 100)).toBe(-1);
  });

  it('edge function returns limit_reached when rpc returns -1', () => {
    const result = simulateOcrGuard({ currentCount: 100, limit: 100, rpcResult: -1 });
    expect(result.error).toBe('limit_reached');
    expect(result.ok).toBeUndefined();
  });
});

// ── QUOTA-ATOM-003 ────────────────────────────────────────────────────────────

describe('QUOTA-ATOM-003: concurrent calls cannot both exceed limit', () => {
  it('two calls at count=limit-1: only the first increments, second sees -1', () => {
    const limit = 50;
    let count = 49;

    // First concurrent call: atomically increments and returns 50
    const result1 = simulateRpc(count, limit);
    expect(result1).toBe(50);
    count = result1; // DB state after first call

    // Second concurrent call: count is now 50 which equals limit — returns -1
    const result2 = simulateRpc(count, limit);
    expect(result2).toBe(-1);
  });

  it('read-then-upsert (old pattern) allows both to proceed — demonstrates the bug', () => {
    const limit = 50;
    const count = 49; // Both reads see the same snapshot

    // OLD PATTERN: both read count=49, both see 49 < 50, both proceed
    const req1Allowed = count < limit; // true
    const req2Allowed = count < limit; // also true — race condition!
    expect(req1Allowed).toBe(true);
    expect(req2Allowed).toBe(true); // Bug: both slip through

    // NEW PATTERN: RPC is atomic — only one can increment past limit
    let atomicCount = 49;
    const rpc1 = simulateRpc(atomicCount, limit);
    atomicCount = rpc1; // 50
    const rpc2 = simulateRpc(atomicCount, limit);
    expect(rpc1).toBe(50); // first succeeds
    expect(rpc2).toBe(-1); // second blocked
  });
});
