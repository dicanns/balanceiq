// The main process talks to the operator too: dialogs, file pickers, the
// restore flow, mail errors. They were French only. One table, picked by the
// language the app runs in; CommonJS so main.js can require it.
const STRINGS = {
  fr: {
    restoreTitle: 'Restaurer depuis backup',
    restoreInvalid: "Fichier invalide - vérifier que c'est un backup BalanceIQ",
    restoreConfirmTitle: 'Restaurer backup',
    restoreConfirmMessage: 'Ceci va remplacer toutes vos données actuelles. Êtes-vous sûr?',
    restoreDone: 'Données restaurées avec succès',
    cancel: 'Annuler',
    restore: 'Restaurer',
    mailBadResponse: 'Réponse invalide du serveur courriel.',
    mailNetwork: 'Erreur réseau - courriel.',
    pickInvoice: 'Sélectionner une facture',
    pickPosReport: 'Sélectionner un rapport POS',
    pickDocument: 'Sélectionner un document',
  },
  en: {
    restoreTitle: 'Restore from backup',
    restoreInvalid: 'Invalid file - check that it is a BalanceIQ backup',
    restoreConfirmTitle: 'Restore backup',
    restoreConfirmMessage: 'This will replace all your current data. Are you sure?',
    restoreDone: 'Data restored successfully',
    cancel: 'Cancel',
    restore: 'Restore',
    mailBadResponse: 'Invalid response from the mail server.',
    mailNetwork: 'Network error - email.',
    pickInvoice: 'Select an invoice',
    pickPosReport: 'Select a POS report',
    pickDocument: 'Select a document',
  },
};

// resolveLang: () => 'fr' | 'en' | null; the fallback is French, as the app's.
function createMainStrings(resolveLang) {
  return (key) => {
    let lang = null;
    try { lang = resolveLang(); } catch (_) { lang = null; }
    const table = STRINGS[lang === 'en' ? 'en' : 'fr'];
    return table[key] ?? STRINGS.fr[key] ?? key;
  };
}

module.exports = { STRINGS, createMainStrings };
