// How one register's drawer is explained on the daily tab.
//
// The payment terminal total is what the terminal collected, card tips included
// (it is the batch that reaches the bank). A tip left on a card is handed to the
// employee in cash from the drawer, so it is cash that left the drawer:
//
//   card sales    = terminal total - card tips
//   cash sales    = POS total - deliveries - card sales
//   expected cash = float + cash sales - card tips paid out
//
// which is the same amount as float + POS total - deliveries - terminal total.
// Entering the tips changes no total: it shows where the cash went, and lets the
// tab say so when a shortage is really tips left out of the terminal total.

const toCents = (v) => Math.round((Number(v) || 0) * 100);

// A shortage within this many dollars of the card tips is flagged as probably
// the tips; smaller tip totals are not flagged, they sit inside normal variance.
export const TIPS_HINT_TOLERANCE = 5;
export const TIPS_HINT_MINIMUM = 10;

// The tips to explain a drawer with: the amount typed on the count side, or the
// one the POS reported when nothing was typed.
export function cardTipsOf(cash) {
  if (!cash) return 0;
  const typed = Number(cash.pmtTips);
  if (cash.pmtTips != null && Number.isFinite(typed)) return typed;
  const pos = Number(cash.posTips);
  return Number.isFinite(pos) && pos > 0 ? pos : 0;
}

// cash: one register of the daily close. effectiveFloat: dollars.
// Amounts come back in dollars, computed in cents. Fields are null until the
// POS total and the terminal total are both entered.
export function registerCashBreakdown(cash, effectiveFloat = 0) {
  const c = cash || {};
  const tipsEntered = c.pmtTips != null && Number.isFinite(Number(c.pmtTips));
  const tipsCents = tipsEntered ? toCents(c.pmtTips) : 0;
  const out = {
    tipsEntered, cardTips: tipsCents / 100,
    cardSales: null, cashSales: null, expectedCash: null, cashVariance: null,
    tipsOverTerminal: false, shortageLooksLikeTips: false,
  };
  if (c.interac != null) {
    const termCents = toCents(c.interac);
    out.cardSales = (termCents - tipsCents) / 100;
    out.tipsOverTerminal = tipsCents > termCents;
  }
  if (c.posVentes == null || c.interac == null) return out;

  const posCents = toCents(c.posVentes) + toCents(c.posTPS) + toCents(c.posTVQ) - toCents(c.posLivraisons);
  const termCents = toCents(c.interac);
  const cashSalesCents = posCents - (termCents - tipsCents);
  const expectedCents = toCents(effectiveFloat) + cashSalesCents - tipsCents;
  out.cashSales = cashSalesCents / 100;
  out.expectedCash = expectedCents / 100;
  if (c.finalCash == null) return out;

  const varianceCents = toCents(c.finalCash) + toCents(c.deposits) - expectedCents;
  out.cashVariance = varianceCents / 100;
  const hintTips = toCents(cardTipsOf(c));
  out.shortageLooksLikeTips = hintTips >= TIPS_HINT_MINIMUM * 100
    && varianceCents < 0
    && Math.abs(varianceCents + hintTips) <= TIPS_HINT_TOLERANCE * 100;
  return out;
}
