// ── INVOICE DUE DATE ─────────────────────────────────────────────────────────
// The due date is the invoice date plus the client's payment terms. It used to be
// filled in once and then left alone, so moving the invoice date left a stale due
// date behind. It now follows the invoice date and the client, except when the
// operator has typed a due date by hand on this invoice: that choice is theirs.

export function shouldRecalcDueDate({ clientChanged = false, dateChanged = false, dueDateTyped = false, hasDueDate = false } = {}) {
  if (!hasDueDate) return true;
  if (clientChanged) return true;           // new client, new terms
  return dateChanged && !dueDateTyped;
}
