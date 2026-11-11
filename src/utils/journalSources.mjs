// Which journal entries may be reversed or corrected from the Journal itself.
// An entry written by a document (an invoice, a bill, a bank line, a cheque) is
// undone from that document, so the two never disagree. An entry typed by hand
// has no document, whatever label it was given; and the opening balances taken
// from the bookkeeper's statements are their own source, undone only here.
export const JOURNAL_OWNED_SOURCES = ['manual', 'opening_adjustment'];

export function reversibleInJournal(entry) {
  if (!entry) return false;
  const type = entry.source_type || '';
  return !type || JOURNAL_OWNED_SOURCES.includes(type) || entry.source_id == null || entry.source_id === '';
}
