/**
 * E2E-GUARD-001  afterEach guards app.close() so crash-on-launch never kills CI
 * E2E-GUARD-002  beforeEach wraps launch in try/catch and surfaces stderr
 * E2E-GUARD-003  afterAll calls are guarded in every describe block
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const spec = readFileSync(join(process.cwd(), 'tests/e2e/app.spec.js'), 'utf8');

// ── E2E-GUARD-001 ─────────────────────────────────────────────────────────────

describe('E2E-GUARD-001: afterEach close is guarded', () => {
  it('no bare "await app.close()" in afterEach blocks', () => {
    // A bare afterEach close crashes CI when beforeEach launch failed
    // Valid: inside if(app && ...) block or try/catch
    const afterEachBlocks = spec.match(/test\.afterEach\([\s\S]*?\}\);/g) || [];
    for (const block of afterEachBlocks) {
      if (block.includes('app.close()')) {
        expect(block).toMatch(/if\s*\(app/);
      }
    }
  });

  it('afterEach wraps close in try/catch', () => {
    const afterEachBlocks = spec.match(/test\.afterEach\([\s\S]*?\}\);/g) || [];
    for (const block of afterEachBlocks) {
      if (block.includes('app.close()')) {
        expect(block).toContain('try');
      }
    }
  });
});

// ── E2E-GUARD-002 ─────────────────────────────────────────────────────────────

describe('E2E-GUARD-002: beforeEach launch is wrapped in try/catch', () => {
  it('beforeEach that calls launchApp has try/catch', () => {
    const beforeEachBlocks = spec.match(/test\.beforeEach\([\s\S]*?\}\);/g) || [];
    for (const block of beforeEachBlocks) {
      if (block.includes('launchApp')) {
        expect(block).toContain('try');
        expect(block).toContain('catch');
      }
    }
  });

  it('launch error exposes stderr or message', () => {
    expect(spec).toMatch(/stderr|message.*launch|launch.*failed/i);
  });
});

// ── E2E-GUARD-003 ─────────────────────────────────────────────────────────────

describe('E2E-GUARD-003: afterAll close is guarded in every describe block', () => {
  it('no bare "await app.close()" in afterAll blocks', () => {
    const afterAllBlocks = spec.match(/test\.afterAll\([\s\S]*?\}\);/g) || [];
    for (const block of afterAllBlocks) {
      if (block.includes('app.close()')) {
        expect(block).toMatch(/if\s*\(app/);
      }
    }
  });

  it('SMOKE-001/002/003 labels are present', () => {
    expect(spec).toContain('SMOKE-001');
    expect(spec).toContain('SMOKE-002');
    expect(spec).toContain('SMOKE-003');
  });
});
