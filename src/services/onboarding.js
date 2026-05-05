// Pure functions for onboarding setup — no DB calls, no Electron dependencies.

function pad(n) {
  return String(n).padStart(2, '0');
}

// Last calendar day of a given year/month (1-indexed month).
function lastDayOf(year, month) {
  const d = new Date(year, month, 0); // day 0 of next month = last day of this month
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Generate tax filing periods for a fiscal year.
 * Pure function — no I/O.
 *
 * @param {object} opts
 * @param {number} opts.fiscalYearEndMonth - 1-12, month the fiscal year ends
 * @param {string} opts.filingFrequency    - 'monthly' | 'quarterly' | 'annual'
 * @param {number} opts.fiscalYear         - the calendar year in which the FY ends
 * @returns {Array<{periodStart: string, periodEnd: string, periodLabel: string}>}
 *
 * Examples (fiscalYear=2025):
 *   fiscalYearEndMonth=12, quarterly → 4 periods: Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec
 *   fiscalYearEndMonth=6,  quarterly → 4 periods: Jul-Sep 2024, Oct-Dec 2024, Jan-Mar 2025, Apr-Jun 2025
 */
export function generateTaxPeriods({ fiscalYearEndMonth, filingFrequency, fiscalYear }) {
  // FY end = last day of fiscalYearEndMonth in fiscalYear
  // FY start = first day of the month after fiscalYearEndMonth in (fiscalYear - 1),
  //            UNLESS fiscalYearEndMonth = 12, in which case FY = Jan 1 - Dec 31 of fiscalYear.
  let startMonth, startYear;
  if (fiscalYearEndMonth === 12) {
    startMonth = 1;
    startYear = fiscalYear;
  } else {
    startMonth = fiscalYearEndMonth + 1;
    startYear = fiscalYear - 1;
  }

  const periods = [];

  if (filingFrequency === 'annual') {
    periods.push({
      periodStart: `${startYear}-${pad(startMonth)}-01`,
      periodEnd: lastDayOf(fiscalYear, fiscalYearEndMonth),
      periodLabel: `Annuel / Annual ${fiscalYear}`,
    });
    return periods;
  }

  const monthsPerPeriod = filingFrequency === 'monthly' ? 1 : 3;
  const numPeriods = filingFrequency === 'monthly' ? 12 : 4;

  let curYear = startYear;
  let curMonth = startMonth;

  for (let i = 0; i < numPeriods; i++) {
    const pStart = `${curYear}-${pad(curMonth)}-01`;

    let endMonthRaw = curMonth + monthsPerPeriod - 1;
    let endYear = curYear;
    while (endMonthRaw > 12) { endMonthRaw -= 12; endYear++; }

    const pEnd = lastDayOf(endYear, endMonthRaw);
    const label = filingFrequency === 'monthly'
      ? `M${pad(i + 1)} ${curYear}-${pad(curMonth)}`
      : `Q${i + 1} ${curYear}-${pad(curMonth)}`;

    periods.push({ periodStart: pStart, periodEnd: pEnd, periodLabel: label });

    let nextMonth = curMonth + monthsPerPeriod;
    let nextYear = curYear;
    while (nextMonth > 12) { nextMonth -= 12; nextYear++; }
    curMonth = nextMonth;
    curYear = nextYear;
  }

  return periods;
}
