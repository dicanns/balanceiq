// The bill inbox's edge function: the pure decisions (no network, no database).
import { describe, it, expect } from 'vitest';
import * as core from '../../../supabase/functions/inbox/core.js';

const bytes = (n, fill = 1) => new Uint8Array(n).fill(fill);
const att = (o) => ({ filename: 'a.pdf', mimeType: 'application/pdf', disposition: 'attachment', content: bytes(1000), ...o });
const hdr = (value, key = 'authentication-results') => ({ key, value });

describe('INBOX-001 sealing', () => {
  it('round-trips 1 MB of random bytes and refuses another key', async () => {
    const data = new Uint8Array(1024 * 1024);
    for (let i = 0; i < data.length; i += 65536) crypto.getRandomValues(data.subarray(i, i + 65536));
    const key = await core.sealKeyFrom('one');
    const sealed = await core.sealBytes(key, data);
    const back = await core.unsealBytes(key, sealed);
    expect(back.length).toBe(data.length);
    expect(Buffer.compare(Buffer.from(back), Buffer.from(data))).toBe(0);
    await expect(core.unsealBytes(await core.sealKeyFrom('two'), sealed)).rejects.toBeTruthy();
  });

  it('base64 in slices matches the plain encoding, including odd lengths', () => {
    for (const n of [0, 1, 2, 3, 0x8000, 0x8001, 100000]) {
      const d = crypto.getRandomValues(new Uint8Array(Math.min(n, 65536))).slice(0, n);
      const b64 = core.bytesToB64(d);
      expect(b64).toBe(Buffer.from(d).toString('base64'));
      expect(Buffer.compare(Buffer.from(core.b64ToBytes(b64)), Buffer.from(d))).toBe(0);
    }
  });

  it('seals JSON, and two sealings never look alike', async () => {
    const key = await core.sealKeyFrom('k');
    const a = await core.sealJson(key, { note: 'secret invoice' });
    expect(a).not.toContain('secret');
    expect(await core.unsealJson(key, a)).toEqual({ note: 'secret invoice' });
    expect(await core.sealJson(key, { x: 1 })).not.toBe(await core.sealJson(key, { x: 1 }));
  });

  it('compares secrets without accepting a prefix, a different length or nothing', () => {
    expect(core.constantTimeEqual('abc123', 'abc123')).toBe(true);
    expect(core.constantTimeEqual('abc123', 'abc124')).toBe(false);
    expect(core.constantTimeEqual('abc', 'abc123')).toBe(false);
    expect(core.constantTimeEqual('', '')).toBe(false);
    expect(core.constantTimeEqual(undefined, 'x')).toBe(false);
  });
});

describe('INBOX-002 routes and addresses', () => {
  it('finds the route behind any gateway prefix', () => {
    expect(core.routeOf('/functions/v1/inbox/receive')).toBe('/receive');
    expect(core.routeOf('/inbox/new-address/')).toBe('/new-address');
    expect(core.routeOf('/inbox')).toBe('/');
    expect(core.routeOf('/receive')).toBe('/receive');
  });

  it('makes a company code of the agreed shape, and not the same twice', () => {
    const seen = new Set();
    for (let i = 0; i < 200; i++) {
      const p = core.newAddressCode();
      expect(p).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{12}$/);
      seen.add(p);
    }
    expect(seen.size).toBe(200);
  });

  it('builds the address from the code and reads the code back, in both accepted forms', () => {
    expect(core.addressFor('abcdefghjkmn')).toBe('bills+abcdefghjkmn@in.balanceiq.ca');
    expect(core.codeOf('bills+abcdefghjkmn')).toBe('abcdefghjkmn');
    expect(core.codeOf('BILLS+ABCDEFGHJKMN')).toBe('abcdefghjkmn');
    expect(core.codeOf('bills-abcdefghjkmn')).toBe('abcdefghjkmn');
    expect(core.codeOf(core.addressParts(core.addressFor('abcdefghjkmn')).local)).toBe('abcdefghjkmn');
    for (const bad of ['bills', 'bills+', 'bills+short', 'bills+abcdefghjkmn1', 'bills+abcdefghjkm0', 'other+abcdefghjkmn', 'abcdefghjkmn', '', null]) {
      expect(core.codeOf(bad), String(bad)).toBeNull();
    }
  });

  it('splits and lowercases an address, with or without a display name', () => {
    expect(core.addressParts('  Bob@Supplier.COM ')).toEqual({ address: 'bob@supplier.com', local: 'bob', domain: 'supplier.com' });
    expect(core.addressParts('"Bob, Ltd" <Bob@Supplier.com>').address).toBe('bob@supplier.com');
    expect(core.addressParts('not an address')).toBeNull();
    expect(core.addressParts('a@b')).toBeNull();
    expect(core.addressParts(42)).toBeNull();
  });

  it('refuses an address with a newline or other control character', () => {
    expect(core.addressParts('bob@supplier.com\nBcc: evil@x.com')).toBeNull();
    expect(core.addressParts('bob@supplier.com\r\n')).toBeNull();
    expect(core.addressParts('bob\u0000@supplier.com')).toBeNull();
  });

  it('cleans a sender list: trims, lowercases, drops repeats', () => {
    expect(core.cleanSenders([' A@B.com', 'a@b.com', 'c@d.ca'])).toEqual({ senders: ['a@b.com', 'c@d.ca'] });
    expect(core.cleanSenders([])).toEqual({ senders: [] });
  });

  it('refuses a bad sender list: an invalid entry, 11 entries, not a list', () => {
    expect(core.cleanSenders(['a@b.com', 'nope'])).toEqual({ error: 'invalid_sender' });
    expect(core.cleanSenders(['a@b.com\n'])).toEqual({ error: 'invalid_sender' });
    const eleven = Array.from({ length: 11 }, (_, i) => `u${i}@x.com`);
    expect(core.cleanSenders(eleven)).toEqual({ error: 'invalid_sender' });
    expect(core.cleanSenders(eleven.slice(0, 10)).senders).toHaveLength(10);
    expect(core.cleanSenders('a@b.com')).toEqual({ error: 'invalid_sender' });
    // Repeats do not count toward the limit.
    expect(core.cleanSenders([...eleven.slice(0, 10), 'U0@x.com']).senders).toHaveLength(10);
  });
});

describe('INBOX-003 who really sent it', () => {
  it('passes on dmarc=pass', () => {
    expect(core.authVerdict([hdr('mx.cloudflare.net; dmarc=pass header.from=supplier.com')], 'bob@supplier.com')).toBe(true);
  });

  it('passes on a DKIM signature of the From domain, or of a parent of it', () => {
    expect(core.authVerdict([hdr('mx.cloudflare.net; dkim=pass header.d=supplier.com')], 'bob@supplier.com')).toBe(true);
    expect(core.authVerdict([hdr('mx.cloudflare.net; dkim=pass header.d=supplier.com')], 'bob@mail.supplier.com')).toBe(true);
  });

  it('refuses a DKIM signature of another domain, a child, or a bare suffix', () => {
    expect(core.authVerdict([hdr('mx.cloudflare.net; dkim=pass header.d=evil.com')], 'bob@supplier.com')).toBe(false);
    expect(core.authVerdict([hdr('mx.cloudflare.net; dkim=pass header.d=mail.supplier.com')], 'bob@supplier.com')).toBe(false);
    expect(core.authVerdict([hdr('mx.cloudflare.net; dkim=pass header.d=com')], 'bob@supplier.com')).toBe(false);
    expect(core.authVerdict([hdr('mx.cloudflare.net; dkim=pass header.d=notsupplier.com')], 'bob@supplier.com')).toBe(false);
  });

  it('does not mix a passing signature of one domain with a failing check of the other', () => {
    expect(core.authVerdict([hdr('mx.cloudflare.net; dkim=pass header.d=evil.com; dkim=fail header.d=supplier.com')], 'bob@supplier.com')).toBe(false);
  });

  it('passes on SPF only when the envelope domain is the From domain', () => {
    expect(core.authVerdict([hdr('mx.cloudflare.net; spf=pass smtp.mailfrom=bounce@supplier.com')], 'bob@supplier.com')).toBe(true);
    expect(core.authVerdict([hdr('mx.cloudflare.net; spf=pass smtp.mailfrom=bounce@evil.com')], 'bob@supplier.com')).toBe(false);
  });

  it('refuses failures and missing headers', () => {
    expect(core.authVerdict([hdr('mx.cloudflare.net; dmarc=fail; spf=softfail; dkim=none')], 'bob@supplier.com')).toBe(false);
    expect(core.authVerdict([], 'bob@supplier.com')).toBe(false);
    expect(core.authVerdict(undefined, 'bob@supplier.com')).toBe(false);
    expect(core.authVerdict([hdr('mx.cloudflare.net; dmarc=pass')], 'garbage')).toBe(false);
  });

  it('looks only at the first authentication-results header, never a forged one below it', () => {
    const real = hdr('mx.cloudflare.net; dmarc=fail; dkim=none; spf=fail');
    const forged = hdr('mx.cloudflare.net; dmarc=pass header.from=supplier.com');
    expect(core.authVerdict([hdr('x', 'received'), real, forged], 'bob@supplier.com')).toBe(false);
    expect(core.authVerdict([forged, real], 'bob@supplier.com')).toBe(true);
  });

  it('trusts only the verdict of our own receiving server', () => {
    expect(core.authVerdict([hdr('mx.evil.net; dmarc=pass')], 'bob@supplier.com')).toBe(false);
    expect(core.authVerdict([hdr('dmarc=pass; mx.cloudflare.net')], 'bob@supplier.com')).toBe(false);
    expect(core.authVerdict([hdr('mx.cloudflare.net.evil.net; dmarc=pass')], 'bob@supplier.com')).toBe(false);
    expect(core.authVerdict([{ key: 'arc-authentication-results', value: 'i=1; mx.cloudflare.net; dmarc=pass' }], 'bob@supplier.com')).toBe(false);
    expect(core.authVerdict([hdr('mx.cloudflare.net 1; dmarc=pass')], 'bob@supplier.com')).toBe(true);
  });

  it('ignores a pass written inside a comment', () => {
    expect(core.authVerdict([hdr('mx.cloudflare.net; dmarc=fail (was dmarc=pass before)')], 'bob@supplier.com')).toBe(false);
  });
});

describe('INBOX-004 limits', () => {
  it('counts only today, and starts over when the day changes', () => {
    expect(core.dayCount({ count_day: '2026-11-16', count_today: 7 }, '2026-11-16')).toBe(7);
    expect(core.dayCount({ count_day: '2026-11-15', count_today: 39 }, '2026-11-16')).toBe(0);
    expect(core.dayCount(null, '2026-11-16')).toBe(0);
    expect(core.todayKey(new Date('2026-11-16T23:59:59Z'))).toBe('2026-11-16');
  });

  it('refuses at the waiting cap and at the daily cap, not before', () => {
    const today = '2026-11-16';
    const row = (n) => ({ count_day: today, count_today: n });
    expect(core.capVerdict({ waiting: core.MAX_WAITING - 1, row: row(0), today })).toBeNull();
    expect(core.capVerdict({ waiting: core.MAX_WAITING, row: row(0), today })).toBe('full');
    expect(core.capVerdict({ waiting: 0, row: row(core.MAX_PER_DAY - 1), today })).toBeNull();
    expect(core.capVerdict({ waiting: 0, row: row(core.MAX_PER_DAY), today })).toBe('full');
    expect(core.capVerdict({ waiting: 0, row: { count_day: '2026-11-15', count_today: 99 }, today })).toBeNull();
  });
});

describe('INBOX-005 what is kept', () => {
  it('keeps a PDF and reports its size', () => {
    const { kept, skipped } = core.pickAttachments([att({ content: bytes(1234) })]);
    expect(skipped).toBe(0);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ name: 'a.pdf', type: 'application/pdf', size: 1234 });
  });

  it('keeps x.pdf sent as application/octet-stream, as a PDF', () => {
    const { kept } = core.pickAttachments([att({ filename: 'x.pdf', mimeType: 'application/octet-stream' })]);
    expect(kept[0].type).toBe('application/pdf');
  });

  it('ignores a small inline picture without counting it, but keeps a large inline one', () => {
    const logo = att({ filename: 'logo.png', mimeType: 'image/png', disposition: 'inline', contentId: '<c1>', content: bytes(5 * 1024) });
    expect(core.pickAttachments([logo])).toEqual({ kept: [], skipped: 0 });
    const photo = { ...logo, content: bytes(200 * 1024) };
    expect(core.pickAttachments([photo]).kept).toHaveLength(1);
  });

  it('counts other file kinds as skipped', () => {
    const { kept, skipped } = core.pickAttachments([att({ filename: 'a.docx', mimeType: 'application/vnd.openxmlformats' }), att()]);
    expect(kept).toHaveLength(1);
    expect(skipped).toBe(1);
  });

  it('takes at most 4 files', () => {
    const { kept, skipped } = core.pickAttachments(Array.from({ length: 6 }, (_, i) => att({ filename: `f${i}.pdf` })));
    expect(kept.map((k) => k.name)).toEqual(['f0.pdf', 'f1.pdf', 'f2.pdf', 'f3.pdf']);
    expect(skipped).toBe(2);
  });

  it('stops at the total size cap, and a later small file may still fit', () => {
    const big = (n) => att({ filename: n, content: bytes(3 * 1024 * 1024) });
    const { kept, skipped } = core.pickAttachments([big('a.pdf'), big('b.pdf'), att({ filename: 'c.pdf', content: bytes(1000) })]);
    expect(kept.map((k) => k.name)).toEqual(['a.pdf', 'c.pdf']);
    expect(skipped).toBe(1);
    expect(core.pickAttachments([att({ content: bytes(core.MAX_ATTACHMENT_BYTES + 1) })])).toMatchObject({ kept: [], skipped: 1 });
  });

  it('cleans a hostile file name and names a nameless one', () => {
    const { kept } = core.pickAttachments([att({ filename: '../../etc/pass\nwd.pdf' }), att({ filename: '', mimeType: 'image/png' })]);
    expect(kept[0].name).not.toMatch(/[\\/\n]/);
    expect(kept[1].name).toBe('attachment.png');
  });

  it('accepts an ArrayBuffer as content', () => {
    const { kept } = core.pickAttachments([att({ content: bytes(50).buffer })]);
    expect(kept[0].size).toBe(50);
  });
});

describe('INBOX-006 the note', () => {
  it('uses the plain text, trimmed and cut', () => {
    expect(core.noteOf({ text: '  Please pay this.\r\nThanks  ' })).toBe('Please pay this.\nThanks');
    expect(core.noteOf({ text: 'x'.repeat(core.MAX_NOTE_CHARS + 500) })).toHaveLength(core.MAX_NOTE_CHARS);
  });

  it('falls back to the HTML body without tags, scripts or styles', () => {
    const html = '<style>p{}</style><p>Invoice &amp; note</p><script>alert(1)</script><div>Line two<br>Line three</div>';
    const note = core.noteOf({ text: '   ', html });
    expect(note).toContain('Invoice & note');
    expect(note).toContain('Line three');
    expect(note).not.toMatch(/alert|<|p\{\}/);
  });

  it('gives an empty note for nothing, and a safe subject', () => {
    expect(core.noteOf({})).toBe('');
    expect(core.subjectOf({ subject: 'Bill\r\nBcc: x ' + 'y'.repeat(400) })).toHaveLength(core.MAX_SUBJECT_CHARS);
    expect(core.subjectOf({ subject: 'a\nb' })).toBe('a b');
  });
});

describe('INBOX-007 the agreed constants', () => {
  it('match the contract', () => {
    expect(core.INBOX_DOMAIN).toBe('in.balanceiq.ca');
    expect([core.MAX_MESSAGE_BYTES, core.MAX_ATTACHMENT_BYTES, core.MAX_ATTACHMENTS, core.MAX_NOTE_CHARS]).toEqual([8388608, 5242880, 4, 8000]);
    expect([core.MAX_SUBJECT_CHARS, core.MAX_SENDERS, core.MAX_WAITING, core.MAX_PER_DAY, core.KEEP_DAYS]).toEqual([300, 10, 15, 40, 14]);
    expect(core.ATTACHMENT_TYPES.jpg).toBe('image/jpeg');
    expect(core.RELAY_PLANS).toContain('pro');
  });
});
