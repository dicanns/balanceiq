// The built-in reasons for a credit note, in both languages. A credit note keeps
// the reason as text, and the reason field offers the labels of the screen's
// language, so a note saved from the English screen holds the English label.
// Anything that depends on the reason reads it through these helpers, never by
// comparing the stored text to the French wording.

// A chain's remittance deduction (promotions, unsaleables, listing fees) is not a
// return of a product line: it is booked against Sales returns and allowances.
export const REMITTANCE_DEDUCTION_REASON = 'Déduction sur remise (chaîne)';
export const OTHER_REASON = 'Autre';

export const CREDIT_NOTE_REASONS = [
  'Article brisé / endommagé',
  'Erreur de facturation',
  'Retour de marchandise',
  'Ajustement de prix',
  REMITTANCE_DEDUCTION_REASON,
  OTHER_REASON,
];

export const CREDIT_NOTE_REASON_EN = {
  'Article brisé / endommagé': 'Damaged item',
  'Erreur de facturation': 'Billing error',
  'Retour de marchandise': 'Goods returned',
  'Ajustement de prix': 'Price adjustment',
  [REMITTANCE_DEDUCTION_REASON]: 'Remittance deduction (chain)',
  [OTHER_REASON]: 'Other',
};

const key = (s) => String(s ?? '').trim().toLowerCase();
const BY_TEXT = new Map();
for (const fr of CREDIT_NOTE_REASONS) {
  BY_TEXT.set(key(fr), fr);
  BY_TEXT.set(key(CREDIT_NOTE_REASON_EN[fr]), fr);
}

// The built-in reason a stored text stands for, whichever language it was saved
// in; a reason the operator typed themselves comes back unchanged.
export function canonicalCreditNoteReason(raison) {
  return BY_TEXT.get(key(raison)) || raison;
}

export function creditNoteReasonLabel(raison, isEn) {
  const fr = canonicalCreditNoteReason(raison);
  return isEn ? (CREDIT_NOTE_REASON_EN[fr] || fr) : fr;
}

export function isRemittanceDeductionReason(raison) {
  return canonicalCreditNoteReason(raison) === REMITTANCE_DEDUCTION_REASON;
}
