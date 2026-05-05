/**
 * closePatternsToPrompt.js — Serialize close exception patterns + scorecard
 * into a structured AI prompt context object.
 * Pure function, no React, no IPC.
 */

/**
 * @param {object} opts
 * @param {Array}       opts.patterns  - runExceptionAnalytics() output
 * @param {object|null} opts.scorecard - computeCloseScore() output or null
 * @param {string}      opts.lang      - 'fr' | 'en'
 * @returns {object} contextData ready to pass as queryType='close_compliance'
 */
export function closePatternsToPrompt({ patterns = [], scorecard = null, lang = 'fr' }) {
  const cashierPatterns = patterns
    .filter(p => p.type === 'cashier_variance')
    .map(p => ({ name: p.subject, rate: p.rate, count: p.count, total: p.total }));

  const registerPatterns = patterns
    .filter(p => p.type === 'register_variance')
    .map(p => ({ register: p.subject, rate: p.rate, count: p.count, total: p.total }));

  const dowPatterns = patterns
    .filter(p => p.type === 'dow_variance')
    .map(p => ({ day: lang === 'fr' ? p.subjectFr : p.subject, rate: p.rate, count: p.count, total: p.total }));

  const reopenPattern = patterns.find(p => p.type === 'reopen_frequency') || null;
  const delayPattern  = patterns.find(p => p.type === 'delayed_approval')  || null;

  const scoreSummary = scorecard ? {
    score:        scorecard.score,
    band:         scorecard.band,
    topFactor:    scorecard.topFactor    || null,
    topDetractor: scorecard.topDetractor || null,
    rates: Object.fromEntries(
      scorecard.entries.map(e => [e.key, e.value != null ? Math.round(e.value * 100) : null])
    ),
  } : null;

  return {
    cashierPatterns,
    registerPatterns,
    dowPatterns,
    reopenRate:       reopenPattern ? { rate: reopenPattern.rate, count: reopenPattern.count, total: reopenPattern.total } : null,
    avgApprovalDelay: delayPattern  ? { avgMinutes: delayPattern.avgMinutes, sampleCount: delayPattern.sampleCount } : null,
    score:            scoreSummary,
    totalPatterns:    patterns.length,
  };
}

/**
 * Build the system-level prompt instruction string for close_compliance queries.
 * The edge function receives this as part of contextData and uses it to frame
 * the Claude call.
 */
export function buildCloseComplianceInstruction(lang) {
  if (lang === 'en') {
    return (
      'You are analyzing close compliance for a restaurant. ' +
      'Using the provided pattern data and compliance score, provide a concise analysis in English:\n' +
      '1. Overall close health (one sentence)\n' +
      '2. Top 2 strengths\n' +
      '3. Top 2 areas to address\n' +
      '4. One concrete action recommendation\n' +
      'Be specific, reference the actual data, and keep the tone professional but approachable.'
    );
  }
  return (
    'Vous analysez la conformité des fermetures pour un restaurant. ' +
    'En utilisant les données de motifs et le score de conformité fournis, rédigez une analyse concise en français:\n' +
    '1. État général des fermetures (une phrase)\n' +
    '2. Les 2 principaux points forts\n' +
    '3. Les 2 principaux points à améliorer\n' +
    '4. Une recommandation concrète\n' +
    'Soyez précis, référencez les données réelles, et gardez un ton professionnel mais accessible.'
  );
}
