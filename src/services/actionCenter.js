// Pure aggregation functions for the franchisor action center.
// Reads from royalty_exceptions and network_compliance_score data passed in.
// No DB calls, no Electron dependencies.

export const ACTION_TYPES = {
  ROYALTY_EXCEPTION: 'royalty_exception',
  LOW_SCORE:         'low_score',
  NO_SCORE:          'no_score',
};

const SEV_RANK = { critical: 0, warning: 1, info: 2 };

/**
 * Build a prioritized list of action items for the franchisor.
 *
 * @param {object} opts
 * @param {object[]}  opts.exceptions    - rows from royalty_exceptions (unresolved)
 * @param {object[]}  opts.networkScores - rows from network_compliance_score for a given period
 * @param {{ id, nom }[]} opts.locations
 * @param {number}    [opts.scoreThreshold=60] - scores below this generate an action item
 * @param {string}    [opts.period] - current period (YYYY-MM), used for no_score detection
 */
export function buildActionItems({
  exceptions = [],
  networkScores = [],
  locations = [],
  scoreThreshold = 60,
  period = '',
}) {
  const items = [];
  const locName = (id) => locations.find(l => l.id === id)?.nom || `Location ${id}`;

  // Royalty exceptions → action items
  for (const ex of exceptions) {
    if (ex.resolved_at) continue;
    items.push({
      id:           `rex-${ex.id}`,
      type:         ACTION_TYPES.ROYALTY_EXCEPTION,
      locationId:   ex.location_id,
      locName:      locName(ex.location_id),
      severity:     ex.severity,
      titleFr:      ex.description_fr || 'Exception redevance',
      titleEn:      ex.description_en || 'Royalty exception',
      bodyFr:       `Période: ${ex.period}${ex.amount_at_risk ? ` — ${parseFloat(ex.amount_at_risk).toFixed(2)} $` : ''}`,
      bodyEn:       `Period: ${ex.period}${ex.amount_at_risk ? ` — $${parseFloat(ex.amount_at_risk).toFixed(2)}` : ''}`,
      acknowledged: !!ex.acknowledged_at,
      exceptionId:  ex.id,
      navigateTo:   'exceptions',
    });
  }

  // Network scores below threshold → action items
  const scoredLocIds = new Set(networkScores.map(s => s.location_id));
  for (const score of networkScores) {
    if (score.total_score >= scoreThreshold) continue;
    const severity = score.total_score < 40 ? 'critical' : 'warning';
    items.push({
      id:           `score-${score.location_id}-${score.period}`,
      type:         ACTION_TYPES.LOW_SCORE,
      locationId:   score.location_id,
      locName:      locName(score.location_id),
      severity,
      titleFr:      'Score de conformité insuffisant',
      titleEn:      'Low compliance score',
      bodyFr:       `${Math.round(score.total_score)}/100 — ${score.period}`,
      bodyEn:       `${Math.round(score.total_score)}/100 — ${score.period}`,
      acknowledged: false,
      navigateTo:   'standards',
    });
  }

  // Locations with no score recorded for the period → info items
  if (period) {
    for (const loc of locations) {
      if (scoredLocIds.has(loc.id)) continue;
      items.push({
        id:           `noscore-${loc.id}-${period}`,
        type:         ACTION_TYPES.NO_SCORE,
        locationId:   loc.id,
        locName:      loc.nom || `Location ${loc.id}`,
        severity:     'info',
        titleFr:      'Score non évalué',
        titleEn:      'Score not evaluated',
        bodyFr:       `Aucun score enregistré pour ${period}`,
        bodyEn:       `No score recorded for ${period}`,
        acknowledged: false,
        navigateTo:   'standards',
      });
    }
  }

  // Sort: critical → warning → info; within same severity, unacknowledged first
  return items.sort((a, b) => {
    const sevDiff = (SEV_RANK[a.severity] ?? 1) - (SEV_RANK[b.severity] ?? 1);
    if (sevDiff !== 0) return sevDiff;
    return (a.acknowledged ? 1 : 0) - (b.acknowledged ? 1 : 0);
  });
}

export function actionItemCount(items) {
  const active = items.filter(i => !i.acknowledged);
  return {
    total:    active.length,
    critical: active.filter(i => i.severity === 'critical').length,
    warning:  active.filter(i => i.severity === 'warning').length,
  };
}
