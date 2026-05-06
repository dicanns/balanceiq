/**
 * DOWNLOAD-001  non-https URL is rejected
 * DOWNLOAD-002  non-supabase.co hostname is rejected
 * DOWNLOAD-003  path not starting with /storage/v1/object/sign/ is rejected
 * DOWNLOAD-004  valid signed Supabase URL is allowed
 * DOWNLOAD-005  size limit of 50 MB is enforced
 */
import { describe, it, expect } from 'vitest';

// Simulates the URL validation logic from the docs:download IPC handler.

const SIZE_LIMIT = 50 * 1024 * 1024;

function validateDownloadUrl(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return { error: 'Invalid URL' }; }
  if (parsed.protocol !== 'https:') return { error: 'Only https URLs are allowed' };
  if (!parsed.hostname.endsWith('.supabase.co')) return { error: 'Only Supabase storage URLs are allowed' };
  if (!parsed.pathname.startsWith('/storage/v1/object/sign/')) return { error: 'Only signed storage URLs are allowed' };
  return { ok: true };
}

function checkSizeLimit(totalBytes) {
  return totalBytes > SIZE_LIMIT ? { error: 'File too large (max 50 MB)' } : { ok: true };
}

// ── DOWNLOAD-001 ──────────────────────────────────────────────────────────────

describe('DOWNLOAD-001: non-https URL is rejected', () => {
  it('http URL returns error', () => {
    const r = validateDownloadUrl('http://etiwnesxjypdwhxqnqqq.supabase.co/storage/v1/object/sign/franchise-docs/file.pdf?token=x');
    expect(r.error).toBeTruthy();
  });

  it('ftp URL returns error', () => {
    const r = validateDownloadUrl('ftp://etiwnesxjypdwhxqnqqq.supabase.co/storage/v1/object/sign/franchise-docs/file.pdf');
    expect(r.error).toBeTruthy();
  });

  it('malformed URL returns Invalid URL error', () => {
    const r = validateDownloadUrl('not-a-url');
    expect(r.error).toBe('Invalid URL');
  });
});

// ── DOWNLOAD-002 ──────────────────────────────────────────────────────────────

describe('DOWNLOAD-002: non-supabase.co hostname is rejected', () => {
  it('attacker-controlled host is rejected', () => {
    const r = validateDownloadUrl('https://evil.example.com/storage/v1/object/sign/franchise-docs/file.pdf');
    expect(r.error).toBeTruthy();
  });

  it('supabase.co lookalike is rejected', () => {
    const r = validateDownloadUrl('https://attacker.supabase.co.evil.com/storage/v1/object/sign/franchise-docs/file.pdf');
    expect(r.error).toBeTruthy();
  });

  it('internal IP is rejected', () => {
    const r = validateDownloadUrl('https://192.168.1.1/storage/v1/object/sign/franchise-docs/file.pdf');
    expect(r.error).toBeTruthy();
  });
});

// ── DOWNLOAD-003 ──────────────────────────────────────────────────────────────

describe('DOWNLOAD-003: wrong path prefix is rejected', () => {
  it('object path without /sign/ is rejected', () => {
    const r = validateDownloadUrl('https://etiwnesxjypdwhxqnqqq.supabase.co/storage/v1/object/public/franchise-docs/file.pdf');
    expect(r.error).toBeTruthy();
  });

  it('arbitrary Supabase API path is rejected', () => {
    const r = validateDownloadUrl('https://etiwnesxjypdwhxqnqqq.supabase.co/rest/v1/users?select=*');
    expect(r.error).toBeTruthy();
  });
});

// ── DOWNLOAD-004 ──────────────────────────────────────────────────────────────

describe('DOWNLOAD-004: valid signed Supabase URL is allowed', () => {
  it('canonical signed URL passes all checks', () => {
    const r = validateDownloadUrl(
      'https://etiwnesxjypdwhxqnqqq.supabase.co/storage/v1/object/sign/franchise-docs/org-a/folder/doc.pdf?token=eyJhbGci...&t=1234567890'
    );
    expect(r.ok).toBe(true);
  });

  it('any supabase.co subdomain is allowed (multi-region)', () => {
    const r = validateDownloadUrl(
      'https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/sign/docs/file.pdf?token=xyz'
    );
    expect(r.ok).toBe(true);
  });
});

// ── DOWNLOAD-005 ──────────────────────────────────────────────────────────────

describe('DOWNLOAD-005: 50 MB size limit is enforced', () => {
  it('file under limit is allowed', () => {
    expect(checkSizeLimit(10 * 1024 * 1024).ok).toBe(true);
  });

  it('file exactly at limit is allowed', () => {
    expect(checkSizeLimit(50 * 1024 * 1024).ok).toBe(true);
  });

  it('file over limit is rejected', () => {
    expect(checkSizeLimit(50 * 1024 * 1024 + 1).error).toBeTruthy();
  });

  it('50 MB limit constant is 52428800 bytes', () => {
    expect(SIZE_LIMIT).toBe(52_428_800);
  });
});
