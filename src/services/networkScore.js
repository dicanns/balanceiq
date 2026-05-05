// Pure scoring functions for the franchise network standards engine.
// No DB calls, no Electron dependencies.

export const SCORE_WEIGHTS = {
  closeOnTime:          0.20,
  depositReconciled:    0.15,
  royaltyDataComplete:  0.20,
  documentsComplete:    0.15,
  noAnomalies:          0.15,
  monthEndReady:        0.15,
};

// Each component value must be in [0, 1]. Returns a total score in [0, 100].
export function computeNetworkScore(components) {
  let total = 0;
  for (const [key, weight] of Object.entries(SCORE_WEIGHTS)) {
    const val = typeof components[key] === 'number' ? components[key] : 0;
    total += Math.min(1, Math.max(0, val)) * weight;
  }
  return Math.round(total * 100);
}

export function scoreGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

export function scoreColor(score) {
  if (score >= 90) return '#22c55e';
  if (score >= 75) return '#84cc16';
  if (score >= 60) return '#f59e0b';
  if (score >= 40) return '#f97316';
  return '#ef4444';
}

// Label maps for UI rendering (FR / EN).
export const COMPONENT_LABELS = {
  fr: {
    closeOnTime:         'Fermeture à l\'heure',
    depositReconciled:   'Dépôts réconciliés',
    royaltyDataComplete: 'Données redevances',
    documentsComplete:   'Documents complets',
    noAnomalies:         'Sans anomalies',
    monthEndReady:       'Fin de mois prête',
  },
  en: {
    closeOnTime:         'On-time close',
    depositReconciled:   'Deposits reconciled',
    royaltyDataComplete: 'Royalty data',
    documentsComplete:   'Documents complete',
    noAnomalies:         'No anomalies',
    monthEndReady:       'Month-end ready',
  },
};
