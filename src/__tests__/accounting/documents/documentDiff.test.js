/**
 * DOC-020  diffDocuments finds what changed by object identity
 */
import { describe, it, expect } from 'vitest';
import { diffDocuments } from '../../../utils/documentDiff.mjs';

const a = { id: 'a', n: 1 };
const b = { id: 'b', n: 2 };
const c = { id: 'c', n: 3 };

describe('DOC-020 diffDocuments', () => {
  it('reports nothing for an unchanged list', () => {
    expect(diffDocuments([a, b], [a, b])).toEqual({ upserts: [], deletes: [], order: null, errors: [] });
  });

  it('reports nothing for a copy of the same list', () => {
    expect(diffDocuments([a, b], [...[a, b]]).upserts).toEqual([]);
  });

  it('reports one changed document as one upsert', () => {
    const b2 = { ...b, n: 9 };
    const r = diffDocuments([a, b, c], [a, b2, c]);
    expect(r.upserts).toEqual([b2]);
    expect(r.deletes).toEqual([]);
    expect(r.order).toBeNull();
  });

  it('reports a new document as an upsert with the order', () => {
    const d = { id: 'd' };
    const r = diffDocuments([a], [a, d]);
    expect(r.upserts).toEqual([d]);
    expect(r.order).toEqual(['a', 'd']);
  });

  it('reports a removal as a delete with the order', () => {
    const r = diffDocuments([a, b, c], [a, c]);
    expect(r.upserts).toEqual([]);
    expect(r.deletes).toEqual(['b']);
    expect(r.order).toEqual(['a', 'c']);
  });

  it('reports a reorder alone as order only', () => {
    const r = diffDocuments([a, b, c], [c, a, b]);
    expect(r.upserts).toEqual([]);
    expect(r.deletes).toEqual([]);
    expect(r.order).toEqual(['c', 'a', 'b']);
  });

  it('treats numeric and string ids alike', () => {
    const n = { id: 5 };
    expect(diffDocuments([n], [n]).deletes).toEqual([]);
    expect(diffDocuments([n], []).deletes).toEqual(['5']);
  });

  it('reports a document without an id as an error and does not drop it silently', () => {
    const bad = { numero: 'x' };
    const r = diffDocuments([a], [a, bad]);
    expect(r.errors).toEqual([{ code: 'missing_id', index: 1 }]);
    expect(r.upserts).toEqual([]);
  });

  it('reports a duplicate id as an error', () => {
    const r = diffDocuments([a], [a, { id: 'a', n: 7 }]);
    expect(r.errors).toEqual([{ code: 'duplicate_id', index: 1, id: 'a' }]);
  });

  it('handles empty and missing lists', () => {
    expect(diffDocuments(undefined, [a]).upserts).toEqual([a]);
    expect(diffDocuments([a], null).deletes).toEqual(['a']);
  });
});
