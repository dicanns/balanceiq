// ── FEATURE FLAGS ──
// CURRENT_PLAN controls which features are active.
// Will be dynamic (from license/cloud) in a future phase.
// For now everything is FREE tier.

export const CURRENT_PLAN = 'free';

export const PLAN_FEATURES = {
  free: {
    // Core operations (always available)
    clientDatabase: true,
    categoriesProducts: true,
    invoiceFlow: true,
    creditNotes: true,
    singlePaymentRecord: true,
    basicAging: true,
    pdfPrint: true,
    mailtoEmail: true,
    singleCsvExport: true,
    // Pro features (locked on free)
    bulkEncaissement: false,
    autoApplyPayments: false,
    detailedAging: false,
    bulkEmailStatements: false,
    recurringInvoices: false,
    directEmailSend: false,
    excelExport: false,
    depositTracking: false,
    customTemplates: false,
    cloudBackup: false,
    // Franchise features (hidden in restaurant mode)
    royaltyAutoCalc: false,
    autoGenerateRoyaltyInvoices: false,
    multiLocationReconciliation: false,
  },
  pro: {
    clientDatabase: true,
    categoriesProducts: true,
    invoiceFlow: true,
    creditNotes: true,
    singlePaymentRecord: true,
    basicAging: true,
    pdfPrint: true,
    mailtoEmail: true,
    singleCsvExport: true,
    bulkEncaissement: true,
    autoApplyPayments: true,
    detailedAging: true,
    bulkEmailStatements: true,
    recurringInvoices: true,
    directEmailSend: true,
    excelExport: true,
    depositTracking: true,
    customTemplates: true,
    cloudBackup: true,
    royaltyAutoCalc: false,
    autoGenerateRoyaltyInvoices: false,
    multiLocationReconciliation: false,
  },
  franchise: {
    clientDatabase: true,
    categoriesProducts: true,
    invoiceFlow: true,
    creditNotes: true,
    singlePaymentRecord: true,
    basicAging: true,
    pdfPrint: true,
    mailtoEmail: true,
    singleCsvExport: true,
    bulkEncaissement: true,
    autoApplyPayments: true,
    detailedAging: true,
    bulkEmailStatements: true,
    recurringInvoices: true,
    directEmailSend: true,
    excelExport: true,
    depositTracking: true,
    customTemplates: true,
    cloudBackup: true,
    royaltyAutoCalc: true,
    autoGenerateRoyaltyInvoices: true,
    multiLocationReconciliation: true,
  },
};

// Returns true if the current plan includes this feature
export function canUse(featureName) {
  return PLAN_FEATURES[CURRENT_PLAN]?.[featureName] === true;
}

// Tracks which upgrade prompts have already been shown this session
const _shownThisSession = new Set();

// Call this to check whether to show an upgrade prompt.
// Returns true the first time per feature per session, false after that.
export function shouldShowUpgradePrompt(featureName) {
  if (canUse(featureName)) return false;
  if (_shownThisSession.has(featureName)) return false;
  _shownThisSession.add(featureName);
  return true;
}

// Reset for testing
export function _resetSessionPrompts() {
  _shownThisSession.clear();
}
