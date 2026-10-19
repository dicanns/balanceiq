// Money moving between two of the operator's own accounts appears on two
// statements: a card payment is on the bank statement and on the card's. It has
// to be recorded exactly once. Recorded on both sides it is counted twice;
// marked as a transfer on both, it is recorded nowhere, the reconciliations
// still balance, and only the ledger is wrong, with nothing on screen to say so.
//
// The rule, decided here rather than remembered:
//   - a card or line of credit is paid from the bank: the BANK statement
//     records it, the card's statement marks it as a transfer;
//   - money moves between two bank accounts: the account it LEFT records it,
//     the account it arrived in marks it as a transfer.
// A move with an account that is not in BalanceIQ (a personal account, another
// bank) is not a transfer at all and is left to the operator.
//
// Shared by the categorize screen, to show the decision, and by the main
// process, which applies it whatever the screen sent.

const OWED = new Set(['credit_card', 'line_of_credit']);

/**
 * lineAccount: the bank_accounts row the statement line belongs to.
 * accounts:    every bank_accounts row ({ coa_account_id, account_type }).
 * Returns { transfer: true|false, kind } when the rule decides, else null.
 */
export function transferRule({ lineAccount, targetCoaId, amount, accounts }) {
  if (!lineAccount || targetCoaId == null || targetCoaId === '') return null;
  const target = Number(targetCoaId);
  const lineOwed = OWED.has(lineAccount.account_type);
  const others = (accounts || []).filter(a => a && a.coa_account_id != null);
  const targetIsOwed = others.some(a => Number(a.coa_account_id) === target && OWED.has(a.account_type));
  const targetIsBank = others.some(a => Number(a.coa_account_id) === target && !OWED.has(a.account_type));
  const ownCoa = Number(lineAccount.coa_account_id);

  if (!lineOwed) {
    if (targetIsOwed) return { transfer: false, kind: 'card_payment_bank_side' };
    if (targetIsBank && target !== ownCoa) {
      return Number(amount) < 0
        ? { transfer: false, kind: 'own_transfer_out' }
        : { transfer: true, kind: 'own_transfer_in' };
    }
    return null;
  }
  // A card's own statement: a payment from a bank account in BalanceIQ, or a
  // line set to the card's own account, is the bank statement's to record.
  if (targetIsBank || target === ownCoa || targetIsOwed) return { transfer: true, kind: 'card_payment_card_side' };
  return null;
}
