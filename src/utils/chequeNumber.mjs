// Cheque numbers as banks print them in statement descriptions, and the rules a
// cheque and a statement line must meet to be the same money. Shared by the main
// process (automatic matching on import) and the Banking screen (suggestions), so
// the two cannot disagree about what "the same cheque" means.

export const CHEQUE_ISSUED = 'issued';
export const CHEQUE_RECEIVED = 'received';

// "CHEQUE 000123", "CHQ#00123-4567", "Chèque no 123", "CHECK 123", "CHK 45".
// A bare "Mobile Cheque Deposit" carries no number and gives none.
const NUMBER_RE = /\b(?:CH[EÈÉ]QUE|CHQ|CHECK|CHK)\s*(?:NO\.?|N[O°º]|NUM(?:[EÉ]RO)?\.?|#)?\s*[:.]?\s*#?\s*(\d{1,10})\b/iu;

export function chequeNumberFromDescription(description) {
  const m = String(description || '').match(NUMBER_RE);
  return m ? normalizeChequeNumber(m[1]) : null;
}

// Leading zeros are padding: the bank's "000123" is the cheque the owner wrote as "123".
export function normalizeChequeNumber(n) {
  const s = String(n ?? '').trim().replace(/^0+(?=\d)/, '');
  return s || null;
}

// A cheque written is money out of the account, one received is money in.
export function chequeDirectionForAmount(amount) {
  return Number(amount) < 0 ? CHEQUE_ISSUED : CHEQUE_RECEIVED;
}
