// Generated invoices (recurring, interest, deposit schedule, royalties, opening
// receivables, the missing-entries backfill) are committed one at a time through
// invoices.commit: the ledger step and the save are one transaction, so an invoice
// that the ledger refuses is simply not created. These helpers are the shared part.

// Commit one invoice with its ledger posting. Never throws. Returns the commit result
// ({ ok:true, doc, entryId }) or { ok:false, error, detail }.
export async function commitInvoicePosted(api, doc, post, order) {
  let r;
  try { r = await api.invoices.commit({ doc, ledger: 'post', post, order }); }
  catch (e) { r = { ok: false, error: String(e?.message || e) }; }
  if (r && r.ok) return r;
  return { ok: false, error: (r && r.error) || 'post_failed', detail: (r && r.detail) || '' };
}

// Short reason shown beside an invoice that was not created.
export function failureReason(res, closedLabel) {
  const text = String(res?.detail || res?.error || '');
  return /PERIOD_CLOSED/.test(text) ? closedLabel : text;
}

// "F-0012 (closed period), F-0013 (reason)" for a list of { numero, res }.
export function describeNotCreated(failures, closedLabel) {
  return (failures || []).map((f) => `${f.numero} (${failureReason(f.res, closedLabel)})`).join(', ');
}
