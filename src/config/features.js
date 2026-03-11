// ── FEATURE FLAGS ──
// CURRENT_PLAN is a runtime-mutable variable.
// Call setPlan('pro') from App when apiConfig.plan changes.

let _activePlan = 'free';
export function setPlan(plan) { if(PLAN_FEATURES[plan]) _activePlan = plan; }
export function getActivePlan() { return _activePlan; }
// Keep CURRENT_PLAN as a getter alias for backward-compat display in JSX
export const CURRENT_PLAN = 'free'; // static fallback — use getActivePlan() for live value

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
    posIntegration: false,
    ocrScanning: false,
    aiAnalysis: false,
    // Franchise features (hidden in restaurant mode)
    royaltyAutoCalc: false,
    autoGenerateRoyaltyInvoices: false,
    multiLocationReconciliation: false,
    franchiseeScorecards: false,
    consolidatedAging: false,
    whiteLabel: false,
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
    posIntegration: true,
    ocrScanning: true,
    aiAnalysis: true,
    royaltyAutoCalc: false,
    autoGenerateRoyaltyInvoices: false,
    multiLocationReconciliation: false,
    franchiseeScorecards: false,
    consolidatedAging: false,
    whiteLabel: false,
  },
  // Franchisee in a franchisor network — cloud sync included, Pro features locked
  // Set server-side when franchisee accepts a franchise invitation
  network: {
    clientDatabase: true,
    categoriesProducts: true,
    invoiceFlow: true,
    creditNotes: true,
    singlePaymentRecord: true,
    basicAging: true,
    pdfPrint: true,
    mailtoEmail: true,
    singleCsvExport: true,
    cloudBackup: true,        // ← cloud sync included (paid by franchisor)
    bulkEncaissement: false,
    autoApplyPayments: false,
    detailedAging: false,
    bulkEmailStatements: false,
    recurringInvoices: false,
    directEmailSend: false,
    excelExport: false,
    depositTracking: false,
    customTemplates: false,
    posIntegration: false,
    ocrScanning: false,
    aiAnalysis: false,
    royaltyAutoCalc: false,
    autoGenerateRoyaltyInvoices: false,
    multiLocationReconciliation: false,
    franchiseeScorecards: false,
    consolidatedAging: false,
    whiteLabel: false,
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
    posIntegration: true,
    ocrScanning: true,
    aiAnalysis: true,
    royaltyAutoCalc: true,
    autoGenerateRoyaltyInvoices: true,
    multiLocationReconciliation: true,
    franchiseeScorecards: true,
    consolidatedAging: true,
    whiteLabel: true,
  },
};

// Returns true if the current plan includes this feature
export function canUse(featureName) {
  return PLAN_FEATURES[_activePlan]?.[featureName] === true;
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
