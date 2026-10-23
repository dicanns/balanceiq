// Invoice statuses and payment kinds that more than one screen has to agree on.
// Shared by the renderer and the main process (require(esm)), so a status added
// here is closed everywhere at once instead of in whichever lists were found.

// An invoice written off as a bad debt: the customer was never going to pay, the
// unpaid balance became an expense, and the GST/QST on it was taken back.
export const WRITTEN_OFF = 'Radiée';

// Statuses with nothing left to collect: no aging, no reminders, not offered
// for a payment or a credit note.
export const CLOSED_INVOICE_STATUSES = ['Payée', 'Créditée', WRITTEN_OFF, 'Annulée', 'Brouillon'];

// A row in an invoice's paiements is money received unless it is a credit note
// applied to it (fromCredit) or the bad-debt write-off (badDebt). Both settle
// the balance; neither came through the bank.
export function isCashPayment(p) {
  return !!p && !p.fromCredit && !p.badDebt;
}
