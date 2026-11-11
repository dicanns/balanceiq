// What changed between two copies of a document list. Updates are immutable in the
// screen, so a document that did not change is the very same object in both lists
// and is recognised by identity, without comparing contents.
//
// Returns { upserts, deletes, order, errors }:
//   upserts - documents that are new or are a different object than before
//   deletes - ids that were in the previous list and are not in the next
//   order   - the full list of ids in display order, or null when the order is unchanged
//   errors  - documents without a usable id (they cannot be stored, never dropped silently)
export function diffDocuments(prevList, nextList) {
  const prev = Array.isArray(prevList) ? prevList : [];
  const next = Array.isArray(nextList) ? nextList : [];
  const hasId = (d) => d && typeof d === 'object' && d.id !== undefined && d.id !== null && d.id !== '';
  const errors = [];
  const prevById = new Map();
  for (const d of prev) if (hasId(d)) prevById.set(String(d.id), d);

  const upserts = [];
  const nextIds = [];
  const seen = new Set();
  next.forEach((d, index) => {
    if (!hasId(d)) { errors.push({ code: 'missing_id', index }); return; }
    const id = String(d.id);
    if (seen.has(id)) { errors.push({ code: 'duplicate_id', index, id }); return; }
    seen.add(id);
    nextIds.push(id);
    if (prevById.get(id) !== d) upserts.push(d);
  });
  const deletes = [...prevById.keys()].filter((id) => !seen.has(id));

  const prevIds = prev.filter(hasId).map((d) => String(d.id));
  const survivorsBefore = prevIds.filter((id) => seen.has(id));
  const survivorsAfter = nextIds.filter((id) => prevById.has(id));
  const sameSequence = survivorsBefore.length === survivorsAfter.length && survivorsBefore.every((id, i) => survivorsAfter[i] === id);
  // The order is sent when it changed, and whenever a document was added or removed.
  const reordered = !sameSequence || nextIds.length !== survivorsAfter.length || deletes.length > 0;
  return { upserts, deletes, order: reordered ? nextIds : null, errors };
}
