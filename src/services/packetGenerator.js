// Pure helpers for franchise onboarding packet creation and validation.
// No DB calls, no Electron dependencies.

export const DEFAULT_CHECKLIST = [
  { key: 'pos_setup',      labelFr: 'Configuration du PDV',         labelEn: 'POS setup',              done: false },
  { key: 'bank_account',   labelFr: 'Compte bancaire ouvert',       labelEn: 'Bank account opened',    done: false },
  { key: 'royalty_client', labelFr: 'Client redevance créé',        labelEn: 'Royalty client created', done: false },
  { key: 'close_policy',   labelFr: 'Politique de fermeture reçue', labelEn: 'Close policy received',  done: false },
  { key: 'training_done',  labelFr: 'Formation complétée',          labelEn: 'Training completed',     done: false },
  { key: 'docs_uploaded',  labelFr: 'Documents téléversés',         labelEn: 'Documents uploaded',     done: false },
];

export const DEFAULT_REQUIRED_DOCS = [
  { key: 'franchise_agreement', labelFr: 'Contrat de franchise',    labelEn: 'Franchise agreement'    },
  { key: 'insurance_cert',      labelFr: 'Certificat d\'assurance', labelEn: 'Insurance certificate'  },
  { key: 'municipal_permit',    labelFr: 'Permis municipal',        labelEn: 'Municipal permit'       },
  { key: 'health_permit',       labelFr: 'Permis de santé',         labelEn: 'Health permit'          },
];

export const REPORTING_CADENCES = ['daily', 'weekly', 'monthly'];

export const REPORTING_CADENCE_LABELS = {
  fr: { daily: 'Quotidien', weekly: 'Hebdomadaire', monthly: 'Mensuel' },
  en: { daily: 'Daily',     weekly: 'Weekly',        monthly: 'Monthly'  },
};

/**
 * Returns a blank packet with defaults pre-filled.
 * @param {string} orgId
 */
export function buildPacketDefaults(orgId = '') {
  return {
    franchisorOrgId:          orgId,
    packetName:               '',
    setupChecklistJson:       JSON.stringify(DEFAULT_CHECKLIST),
    requiredDocsListJson:     JSON.stringify(DEFAULT_REQUIRED_DOCS),
    openingChartTemplateId:   null,
    royaltyProfileTemplateId: null,
    closeChecklistTemplateId: null,
    reportingCadence:         'monthly',
  };
}

/** Safely parse a checklist JSON string; returns [] on failure. */
export function parseChecklist(json) {
  try {
    const parsed = JSON.parse(json || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

/** Safely parse a required-docs JSON string; returns [] on failure. */
export function parseRequiredDocs(json) {
  try {
    const parsed = JSON.parse(json || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

/**
 * Validate a packet object.
 * @returns {string[]} array of error messages (empty = valid)
 */
export function validatePacket(packet) {
  const errors = [];
  if (!packet?.packetName?.trim()) errors.push('packetName required');
  if (packet?.reportingCadence && !REPORTING_CADENCES.includes(packet.reportingCadence)) {
    errors.push(`invalid reportingCadence: ${packet.reportingCadence}`);
  }
  return errors;
}

/**
 * Given a packet and optional royalty overrides, produce the location-level
 * onboarding record that should be persisted.
 *
 * Pure — callers do the actual DB write.
 */
export function buildLocationOnboarding(packet, { locationId, royaltyRate = null, adRate = null } = {}) {
  return {
    locationId,
    packetId:         packet.id,
    checklistJson:    packet.setupChecklistJson,
    royaltyRate:      royaltyRate,
    adRate:           adRate,
    reportingCadence: packet.reportingCadence,
  };
}
