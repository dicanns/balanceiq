// The main process talks to the operator too: dialogs, file pickers, the
// restore flow, mail errors. They were French only. One table, picked by the
// language the app runs in; CommonJS so main.js can require it.
const STRINGS = {
  fr: {
    restoreTitle: 'Restaurer depuis backup',
    restoreInvalid: "Fichier invalide - vérifier que c'est un backup BalanceIQ",
    restoreConfirmTitle: 'Restaurer backup',
    restoreConfirmMessage: 'Les données de cette entreprise seront remplacées par celles du fichier de sauvegarde.',
    restoreDone: 'Données restaurées avec succès',
    restoreCompany: 'Entreprise :',
    restoreBackupOf: 'Sauvegarde du',
    restoreSafetyCopy: "Une copie des données actuelles est d'abord enregistrée dans le dossier Backups.",
    restoreSafetyCopyFailed: "La copie de sécurité des données actuelles a échoué; rien n'a été restauré.",
    restoreAnyway: 'Restaurer quand même',
    restoreOtherCompany: 'Ce fichier est une sauvegarde de « {backup} », et vous êtes dans « {current} ». Les données de « {current} » seraient remplacées par celles de « {backup} ».',
    restoreNewer: "Cette sauvegarde vient d'une version plus récente de BalanceIQ. Mettez l'application à jour, puis restaurez.",
    restoreTooOld: "Cette sauvegarde vient d'une version plus ancienne qui n'enregistrait pas la structure de la base; elle ne peut pas être restaurée dans cette version.",
    restoreErrUnbalanced: "La sauvegarde contient une écriture déséquilibrée; rien n'a été restauré.",
    restoreErrOrphans: "La sauvegarde est incomplète (des lignes pointent vers des données absentes); rien n'a été restauré.",
    restoreFailed: "La restauration a échoué; rien n'a été modifié.",
    backupExportTitle: 'Enregistrer une sauvegarde',
    backupExportFailed: "La sauvegarde n'a pas pu être enregistrée.",
    ledgerClosedPeriod: "Ce document n'a pas été inscrit au grand livre : sa date tombe dans une période fermée. Changez la date ou rouvrez la période, puis enregistrez-le de nouveau.",
    ledgerPostFailed: "Ce document n'a pas pu être inscrit au grand livre. Il existe, mais pas dans les livres. Enregistrez-le de nouveau; si le message revient, notez le détail ci-dessous.",
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
    restoreConfirmMessage: "This company's data will be replaced by the data in the backup file.",
    restoreDone: 'Data restored successfully',
    restoreCompany: 'Company:',
    restoreBackupOf: 'Backup from',
    restoreSafetyCopy: 'A copy of the current data is saved in the Backups folder first.',
    restoreSafetyCopyFailed: 'The safety copy of the current data failed; nothing was restored.',
    restoreAnyway: 'Restore anyway',
    restoreOtherCompany: 'This file is a backup of "{backup}", and you are in "{current}". The data of "{current}" would be replaced by that of "{backup}".',
    restoreNewer: 'This backup comes from a newer version of BalanceIQ. Update the app, then restore.',
    restoreTooOld: 'This backup comes from an older version that did not record the database structure; it cannot be restored in this version.',
    restoreErrUnbalanced: 'The backup holds an entry that does not balance; nothing was restored.',
    restoreErrOrphans: 'The backup is incomplete (lines point at data that is missing); nothing was restored.',
    restoreFailed: 'The restore failed; nothing was changed.',
    backupExportTitle: 'Save a backup',
    backupExportFailed: 'The backup could not be saved.',
    ledgerClosedPeriod: 'This document was not recorded in the ledger: its date falls in a closed period. Change the date or reopen the period, then save it again.',
    ledgerPostFailed: 'This document could not be recorded in the ledger. It exists, but not in the books. Save it again; if this message comes back, note the detail below.',
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
