import React, { useState, useEffect, useCallback, useRef } from 'react';
import ColumnMapper, { rolesFromMap, mapFromRoles } from './ColumnMapper.jsx';
import { balanceCheck } from '../utils/statementPdf.mjs';
import { parseCsvLines, looksLikeHeader, inferColumns, normalizeStatementDate, detectNumericDateOrder, parseStatementAmount } from '../utils/importParse.mjs';
import { looksLikeCapitalPurchase } from '../utils/calculations.js';
import CapexGuide from './CapexGuide.jsx';

// ── i18n ─────────────────────────────────────────────────────────────────────
const UI = {
  fr: {
    tabComptes:       'Comptes',
    tabTransactions:  'Transactions',
    tabRapprochements:'Rapprochements',
    tabRegles:        'Règles appris',
    addAccount:       '+ Ajouter un compte',
    editAccount:      'Modifier',
    archiveAccount:   'Archiver',
    noAccounts:       'Aucun compte bancaire. Ajoutez-en un pour commencer.',
    importStatement:  'Importer un relevé',
    accountName:      'Nom du compte *',
    accountType:      'Type *',
    coaAccount:       'Compte GL (COA) *',
    openingBalance:   'Solde d\'ouverture ($) *',
    openingBalanceOwed:'Solde d\'ouverture dû ($) *',
    openingHintOwed:  'Ce que vous deviez sur cette carte la veille de la première transaction importée.',
    openingDate:      'Date d\'ouverture *',
    save:             'Enregistrer',
    cancel:           'Annuler',
    typeBank:         'Compte bancaire',
    typeCC:           'Carte de crédit',
    typeLOC:          'Marge de crédit',
    lastReconciled:   'Dernier rapprochement',
    never:            'Jamais',
    importTitle:      'Importer un relevé bancaire',
    importBtn:        'Importer',
    importing:        'Importation…',
    importResultExtra:(r, money) => `${r.closingFromFile ? ' Solde final lu dans le fichier.' : ''}${r.openingSet ? ` Solde d'ouverture défini à ${money} au ${r.openingSet.date}, d'après le fichier.` : ''}${r.openingDateMoved ? ` Date d'ouverture ramenée au ${r.openingDateMoved.to}, la veille de la première transaction.` : ''}`,
    importResult:     (r) => `${r.rowCount} transactions importées - ${r.autoMatched} auto, ${r.suggested} suggestions, ${r.unmatched} non appariées${r.duplicateRows ? `, ${r.duplicateRows} doublons ignorés` : ''}.`,
    importDupe:       'Ce relevé a déjà été importé (fichier identique).',
    errors: {
      ERR_STATEMENT_DUPLICATE:          'Ce relevé a déjà été importé (fichier identique).',
      ERR_STATEMENT_PERIOD_EXISTS:      'Un relevé couvrant cette période est déjà importé pour ce compte. Importer celui-ci doublerait le mois.',
      ERR_PERIOD_CLOSED_REVERSE:        "La période comptable du solde d'ouverture est fermée: son écriture ne peut plus être corrigée. Rouvrez la période, puis réessayez.",
      ERR_BANK_ACCOUNT_NOT_FOUND:       'Compte bancaire introuvable.',
      ERR_NO_TRANSACTIONS:              'Aucune transaction trouvée dans le fichier.',
      ERR_CSV_DATE:                     'Une date du fichier est illisible. Vérifiez que c\'est bien le relevé exporté par la banque, sans modification.',
      ERR_CSV_NO_AMOUNTS:               'Aucun montant n\'a pu être lu dans ce fichier. Rien n\'a été importé.',
      ERR_CSV_NO_COLUMNS:               'Impossible de reconnaître les colonnes de ce fichier: aucune date trouvée. Exportez le relevé en CSV depuis votre institution, sans le modifier.',
      ERR_STATEMENT_NOT_FOUND:          'Relevé introuvable.',
      ERR_STATEMENT_ALREADY_RECONCILED: 'Ce relevé est déjà réconcilié.',
      ERR_RECONCILE_VARIANCE:           (ecart) => `Écart de ${Number(ecart).toFixed(2)} $ - réconciliez toutes les transactions avant de clôturer.`,
      ERR_NO_OPENING_BALANCE:           'Ce compte n\'a aucun solde d\'ouverture à comptabiliser.',
      ERR_MISSING_COA:                  'Compte du plan comptable manquant (3400 ou le compte GL lié).',
      ERR_STATEMENT_RECONCILED_LOCKED:  'Ce relevé est réconcilié. Rouvrez le rapprochement avant de le supprimer.',
      ERR_STATEMENT_HAS_MATCHED_TX:     'Ce relevé contient des transactions déjà appariées ou réconciliées. Désappariez-les avant de supprimer.',
      ERR_STATEMENT_BALANCE_INVALID:    'Montant invalide.',
      GENERIC:                          "Erreur lors de l'importation.",
    },

    colMapTitle:      'Correspondance des colonnes',
    periodStart:      'Début de période',
    importedStatements: 'Relevés importés :',
    viewingAccount:   'Compte affiché',
    recOverview:      'État des rapprochements',
    recNever:         'Jamais rapproché',
    recLastClosed:    (d) => `Dernier rapprochement : ${d}`,
    recNothingOpen:   'Aucun relevé en attente',
    recOpenPeriod:    (a, b) => `${a} au ${b}`,
    recReady:         'Prêt à clôturer',
    recBlockedBalance:'Solde du relevé non défini',
    recBlockedLines:  (n) => `${n} ligne${n === 1 ? '' : 's'} à catégoriser`,
    recBlockedVar:    (v) => `Écart de ${v}`,
    recOpen:          'Ouvrir',
    recAllDone:       'Tous les comptes sont à jour.',
    closeBlockedWhy:  'Pourquoi ce bouton est inactif',
    lineCount:        (n) => `${n} transaction${n === 1 ? '' : 's'}`,
    periodEnd:        'Fin de période',
    endingBalance:    'Solde final ($)',
    endingBalanceOwed:'Solde dû sur le relevé ($)',
    mapTitle:         'Colonnes du fichier',
    mapHint:          'Si une colonne est mal lue, changez-la ici. Votre choix est retenu pour ce compte.',
    mapHasHeader:     'La première ligne contient les titres de colonnes',
    roleColumn:       'Colonne',
    pdfReading:       'Lecture du relevé PDF…',
    pdfTitle:         'Relevé lu depuis le PDF',
    pdfPeriod:        'Période',
    pdfOpening:       'Solde précédent',
    pdfClosing:       'Nouveau solde',
    pdfLines:         (n) => `${n} ligne${n > 1 ? 's' : ''}`,
    pdfHint:          "Chaque ligne du relevé, telle que lue. Décochez une ligne qui n'est pas une transaction; corrigez une colonne mal lue avec le menu au-dessus.",
    pdfCheckOk:       'Le solde précédent plus les lignes donne exactement le nouveau solde.',
    pdfCheckOff:      (gap) => `Les lignes ne donnent pas le nouveau solde: il manque ${gap}. Une ligne a probablement été mal lue ou décochée.`,
    pdfCheckSides:    (fc, pc, fp, pp) => `Achats trouvés ${fc} (le relevé indique ${pc}) · paiements trouvés ${fp} (le relevé indique ${pp}).`,
    pdfCheckNone:     "Ce PDF n'indique pas ses soldes, la vérification n'est pas possible. Vérifiez les lignes vous-même.",
    pdfOverlap:       (a, b, rec) => `Un relevé du ${a} au ${b} est déjà importé${rec ? ' et rapproché' : ''} pour ce compte. Importer celui-ci doublerait ce mois.`,
    pdfAlready:       (n) => `${n} de ces lignes sont déjà dans les livres (même date, même montant).`,
    pdfForce:         "Importer quand même",
    pdfInclude:       'Importer la ligne',
    pdfNoText:        "Ce PDF est une image numérisée, sans texte à lire. Téléchargez le relevé depuis le site de votre institution, ou exportez-le en CSV.",
    pdfNoLines:       "Aucune ligne de transaction trouvée dans ce PDF. Si c'est bien un relevé, exportez-le en CSV depuis votre institution.",
    pdfFailed:        (e) => `Le PDF n'a pas pu être lu (${e}).`,
    openingFromFile:  (file, typed) => `Le premier relevé indique ${file} avant sa première ligne; le solde d'ouverture du compte indique ${typed}. C'est la cause la plus probable de l'écart.`,
    openingUseFile:   (v) => `Utiliser ${v}`,
    mapReadsAs:       'Première ligne lue comme',
    mapNeedDate:      'Indiquez quelle colonne contient la date.',
    mapNeedAmount:    'Indiquez la colonne des montants (ou Débit et Crédit).',
    mapAuto:          'Fichier lu automatiquement (OFX/QFX): aucun réglage nécessaire.',
    roleIgnore:       'Ignorer',
    roleDate:         'Date',
    roleDesc:         'Description',
    roleAmount:       'Montant (signé)',
    roleDebit:        'Débit / achat',
    roleCredit:       'Crédit / paiement',
    roleBalance:      'Solde',
    balanceNotSet:    'Non défini',
    setBalance:       'Définir le solde du relevé',
    balanceNotSetHint:'Ce relevé n\'a pas de solde final: un fichier CSV n\'en contient pas. Saisissez celui inscrit sur le relevé pour pouvoir rapprocher.',
    stmtBalanceOwed:  'Solde dû (relevé)',
    biqBalanceOwed:   'Solde dû (BalanceIQ)',
    openingAfterFirst:(d1, d2) => `Le solde d'ouverture du compte est daté du ${d1}, après la première transaction (${d2}). Corrigez la date et le montant dans Comptes, sinon le rapprochement ne peut pas tomber juste.`,
    saveBalance:      'Enregistrer',
    allStatuses:      'Tous les statuts',
    statusUnmatched:  'Non appariés',
    statusMatched:    'Appariés',
    statusSuggested:  'Suggestions',
    statusManual:     'Manuels',
    categorize:       'Catégoriser',
    payBill:          'Payer une facture',
    payBillTitle:     'Cette transaction paie quelle facture fournisseur ?',
    payBillHint:      'La facture comptabilise la dépense; cette ligne ne règle que ce que vous devez (2010). Ne catégorisez pas la même ligne à un compte de dépense, sinon la dépense compterait deux fois. Cochez plusieurs factures si un seul paiement les couvre toutes.',
    payBillNone:      'Aucune facture fournisseur impayée.',
    payBillSelected:  (sel, total) => `Sélectionné : ${sel} sur ${total}`,
    payBillLink:      'Lier',
    billMatchTitle:   'Une facture fournisseur impayée correspond à ce montant',
    billMatchBody:    (n) => `${n} : cette facture comptabilise déjà la dépense et les taxes. Liez cette ligne à la facture au lieu de la catégoriser, sinon la dépense compterait deux fois.`,
    billMatchLink:    'Lier à la facture',
    billMatchIgnore:  'Non, ce n\'est pas cette facture',
    match:            'Apparier',
    unmatch:          'Désapparier',
    selectCoa:        'Sélectionner un compte GL…',
    selectAccount:    '- Sélectionner un compte -',
    notes:            'Notes',
    saveCategorize:   'Enregistrer',
    transferLabel:    'Virement entre mes propres comptes',
    transferHint:     'Un paiement de carte de crédit, ou de l\'argent déplacé entre deux de vos comptes. La ligne reste rapprochée, mais l\'écriture vient de l\'autre relevé - la comptabiliser ici la compterait deux fois.',
    previewTitle:     (name) => `Rapprochement - ${name}`,
    stmtBalance:      'Solde au relevé',
    biqBalance:       'Solde BalanceIQ',
    ecart:            'Écart',
    closeRec:         'Clôturer le rapprochement',
    reopenRec:        'Rouvrir',
    reopenReason:     'Raison de la réouverture *',
    noStatements:     'Aucun relevé importé pour ce compte.',
    noTransactions:   'Aucune transaction.',
    selectAccountFirst: 'Sélectionnez un compte pour voir les transactions.',
    selectAccountRec:   'Sélectionnez un compte.',
    unreconciledCount:(n) => `${n} transaction(s) non réconciliée(s)`,
    rulePattern:      'Description normalisée',
    ruleAccount:      'Compte GL assigné',
    ruleCount:        'Confirmations',
    ruleLastUsed:     'Dernière utilisation',
    ruleDelete:       'Supprimer',
    noRules:          'Aucune règle apprise.',
    confirmArchive:   'Archiver ce compte?',
    deleteRule:       'Supprimer cette règle?',
    reconciled:       'Réconcilié',
    open:             'En cours',
    ecartOk:          'Équilibré',
    suggestedCoa:     (name) => `Suggestion: ${name}`,
    confirm:          'Confirmer',
    fileLabel:        'Fichier (CSV, OFX, QFX, QBO)',
    optional:         'facultatif',
    openingBalance2:  'ex: 12 345.67',
    viewTransactions: 'Transactions',
    loading:          'Chargement…',
    colDate:          'Date',
    colDesc:          'Description',
    colAmount:        'Montant',
    colStatus:        'Statut',
    colCoa:           'Compte GL',
    colActions:       'Actions',
    colPeriod:        'Période',
    colEndBal:        'Solde final',
    colStatut:        'Statut',
    badgeMatched:     'Apparié',
    badgeSuggested:   'Suggestion',
    badgeManual:      'Manuel',
    badgeUnmatched:   'Non apparié',
    autoLabel:        '✓ auto',
    etransferBadge:   'Virement Interac',
    etransferMatch:   'Matcher',
    etransferSender:  'Expéditeur',
    etransferHintIn:  'Enregistrez le paiement sur la facture dans Facturation après avoir catégorisé cette transaction.',
    etransferHintOut: 'Enregistrez ce paiement sur la facture fournisseur correspondante après avoir catégorisé cette transaction.',
    etransferBtnIn:   'Catégoriser vers Comptes clients (1100)',
    etransferBtnOut:  'Catégoriser vers Comptes fournisseurs (2010)',
    etransferDirIn:   'Reçu',
    etransferDirOut:  'Envoyé',
    etransferNoAccount: (n) => `Compte ${n} introuvable dans le plan comptable.`,
    taxCaptureTitle:  'Taxes payées (CTI/RTI)',
    taxCaptureHint:   'Optionnel. Saisir la TPS et la TVQ réellement payées, telles qu\'inscrites sur la facture. La dépense est alors comptabilisée hors taxes.',
    taxInflowNote:    'Aucune taxe à saisir sur un encaissement : la TPS/TVQ sur les ventes est déjà comptabilisée à la facturation.',
    taxAutoFillHint:  'Calculer suppose que la totalité du montant est taxable aux taux du Québec. Sinon, saisir les montants exacts de la facture.',
    taxAutoFill:      'Calculer',
    taxRestricted:    (pct, tps, tvq) => `Ce compte est limité à ${pct} % : ${tps} de TPS et ${tvq} de TVQ seront réclamés. Le reste fait partie de la dépense.`,
    taxRestrictedWhy: 'Saisissez les montants complets de la facture. La limite est appliquée automatiquement.',
    capexTitle:       'Est-ce un achat en immobilisation ?',
    capexBody:        (amt) => `${amt} sur ce compte passe en dépense complète cette année. Un bien durable (ordinateur, équipement, mobilier) va plutôt au bilan et se déduit sur plusieurs années par l'amortissement fiscal (DPA).`,
    capexHow:         'Si c\'est le cas : choisissez plutôt un compte d\'actif (1500-1580), puis inscrivez le bien dans Immobilisations avec sa catégorie DPA. La TPS/TVQ reste réclamable en entier cette année.',
    capexDismiss:     'Non, c\'est une dépense',
    capexLearn:       'Comment savoir ?',
    taxTps:           'TPS payée ($)',
    taxTvq:           'TVQ payée ($)',
    matchExact:       (n) => `Description exacte (${n}× utilisé)`,
    matchPartial:     'Description partielle correspondante',
    searchCoa:        'Chercher par numéro ou nom…',
    openingBtn:       'Solde d\'ouverture au GL',
    openingTitle:     'Comptabiliser le solde d\'ouverture de ce compte au grand livre',
    openingAlready:   'Le solde d\'ouverture de ce compte est déjà comptabilisé.',
    openingDone:      (v) => `Solde d'ouverture comptabilisé : ${Number(v).toFixed(2)} $.`,
    backfillBtn:      'Comptabiliser les manquants',
    backfillTitle:    'Créer les écritures pour les transactions catégorisées sans écriture',
    backfillDone:     (p, sk, o, rd) => `${p} écriture(s) créée(s). ${sk} ignorée(s) (comptes de contrôle).${o ? ` ${o} orpheline(s) annulée(s).` : ''}${rd ? ` ${rd} annulation(s) redatée(s).` : ''}`,
    done:             'Terminé',
    deleteStmt:       "Supprimer l'import",
    confirmDeleteStmt:(a, b, n) => `Supprimer l'import du ${a} au ${b}?\n\nSes ${n} lignes sont retirées des livres, et tout ce que vous avez fait avec elles est annulé (catégories, factures payées).\n\nÀ utiliser seulement pour refaire un import raté. Pour terminer un mois, utilisez Clôturer dans Rapprochements.`,
    deleteStmtDone:   (n, e) => `Import supprimé - ${n} transaction(s) retirée(s)${e ? `, ${e} écriture(s) annulée(s)` : ''}.`,
    stmtOlder:        (n) => `+ ${n} relevé(s) plus ancien(s)`,
    stmtFewer:        'Masquer les anciens',
    stmtClosed:       'Clôturé',
    acctUpToDate:     (d) => `\u2713 À jour jusqu'au ${d}`,
    acctToImport:     (a, b, more) => `Relevé à importer : ${a} \u2192 ${b}${more ? ` (+ ${more} autre${more > 1 ? 's' : ''})` : ''}`,
    acctInProgress:   (a, b, why) => `${a} \u2192 ${b} en cours : ${why}`,
    acctReady:        (a, b) => `${a} \u2192 ${b} prêt à clôturer`,
    acctNoStatements: 'Aucun relevé importé',
    acctSummary:      (n, t) => `${n} compte${n > 1 ? 's' : ''} sur ${t} à jour`,
    acctGoReconcile:  'Rapprocher',
    openingOwed:      'dû',
    openingDateFix:   (d) => `Mettre la date d'ouverture au ${d}`,
    openingBalanceLbl:'Solde d\'ouverture',
  },
  en: {
    tabComptes:       'Accounts',
    tabTransactions:  'Transactions',
    tabRapprochements:'Reconciliations',
    tabRegles:        'Learned Rules',
    addAccount:       '+ Add Account',
    editAccount:      'Edit',
    archiveAccount:   'Archive',
    noAccounts:       'No bank accounts yet. Add one to get started.',
    importStatement:  'Import Statement',
    accountName:      'Account Name *',
    accountType:      'Type *',
    coaAccount:       'GL Account (COA) *',
    openingBalance:   'Opening Balance ($) *',
    openingBalanceOwed:'Opening balance owed ($) *',
    openingHintOwed:  'What you owed on this card the day before the first imported transaction.',
    openingDate:      'Opening Date *',
    save:             'Save',
    cancel:           'Cancel',
    typeBank:         'Bank Account',
    typeCC:           'Credit Card',
    typeLOC:          'Line of Credit',
    lastReconciled:   'Last reconciled',
    never:            'Never',
    importTitle:      'Import Bank Statement',
    importBtn:        'Import',
    importing:        'Importing…',
    importResultExtra:(r, money) => `${r.closingFromFile ? ' Closing balance read from the file.' : ''}${r.openingSet ? ` Opening balance set to ${money} as of ${r.openingSet.date}, from the file.` : ''}${r.openingDateMoved ? ` Opening date moved to ${r.openingDateMoved.to}, the day before the first transaction.` : ''}`,
    importResult:     (r) => `${r.rowCount} transactions imported - ${r.autoMatched} auto-matched, ${r.suggested} suggested, ${r.unmatched} unmatched${r.duplicateRows ? `, ${r.duplicateRows} duplicates skipped` : ''}.`,
    importDupe:       'This statement appears to be already imported (identical file).',
    errors: {
      ERR_STATEMENT_DUPLICATE:          'This statement has already been imported (identical file).',
      ERR_STATEMENT_PERIOD_EXISTS:      'A statement covering this period is already imported for this account. Importing this one would double the month.',
      ERR_PERIOD_CLOSED_REVERSE:        "The accounting period of the opening balance is closed, so its entry can no longer be corrected. Reopen the period, then try again.",
      ERR_BANK_ACCOUNT_NOT_FOUND:       'Bank account not found.',
      ERR_NO_TRANSACTIONS:              'No transactions found in the file.',
      ERR_CSV_DATE:                     'A date in the file could not be read. Check that it is the statement exactly as the bank exported it.',
      ERR_CSV_NO_AMOUNTS:               'No amount could be read from this file. Nothing was imported.',
      ERR_CSV_NO_COLUMNS:               'The columns in this file could not be recognized: no date found. Export the statement as CSV from your institution without editing it.',
      ERR_STATEMENT_NOT_FOUND:          'Statement not found.',
      ERR_STATEMENT_ALREADY_RECONCILED: 'This statement is already reconciled.',
      ERR_RECONCILE_VARIANCE:           (ecart) => `Variance of $${Number(ecart).toFixed(2)} - reconcile all transactions before closing.`,
      ERR_NO_OPENING_BALANCE:           'This account has no opening balance to post.',
      ERR_MISSING_COA:                  'Chart of accounts entry missing (3400, or the account\'s own GL account).',
      ERR_STATEMENT_RECONCILED_LOCKED:  'This statement is reconciled. Reopen the reconciliation before deleting it.',
      ERR_STATEMENT_HAS_MATCHED_TX:     'This statement has transactions that are already matched or reconciled. Unmatch them before deleting.',
      ERR_STATEMENT_BALANCE_INVALID:    'Invalid amount.',
      GENERIC:                          'Import error.',
    },

    colMapTitle:      'Column Mapping',
    periodStart:      'Period Start',
    importedStatements: 'Imported statements:',
    viewingAccount:   'Showing',
    recOverview:      'Reconciliation status',
    recNever:         'Never reconciled',
    recLastClosed:    (d) => `Last reconciled: ${d}`,
    recNothingOpen:   'No statement waiting',
    recOpenPeriod:    (a, b) => `${a} to ${b}`,
    recReady:         'Ready to close',
    recBlockedBalance:'Statement balance not set',
    recBlockedLines:  (n) => `${n} line${n === 1 ? '' : 's'} to categorize`,
    recBlockedVar:    (v) => `Variance of ${v}`,
    recOpen:          'Open',
    recAllDone:       'Every account is up to date.',
    closeBlockedWhy:  'Why this button is inactive',
    lineCount:        (n) => `${n} transaction${n === 1 ? '' : 's'}`,
    periodEnd:        'Period End',
    endingBalance:    'Ending Balance ($)',
    endingBalanceOwed:'Balance owed on the statement ($)',
    mapTitle:         'Columns in this file',
    mapHint:          'If a column is read wrongly, change it here. Your choice is remembered for this account.',
    mapHasHeader:     'The first line holds column titles',
    roleColumn:       'Column',
    pdfReading:       'Reading the statement PDF…',
    pdfTitle:         'Statement read from the PDF',
    pdfPeriod:        'Period',
    pdfOpening:       'Previous balance',
    pdfClosing:       'New balance',
    pdfLines:         (n) => `${n} line${n > 1 ? 's' : ''}`,
    pdfHint:          'Every line of the statement as it was read. Untick a line that is not a transaction; correct a misread column with the menu above it.',
    pdfCheckOk:       'The previous balance plus the lines comes to exactly the new balance.',
    pdfCheckOff:      (gap) => `The lines do not reach the new balance: ${gap} is missing. A line was probably misread or unticked.`,
    pdfCheckSides:    (fc, pc, fp, pp) => `Purchases found ${fc} (statement says ${pc}) · payments found ${fp} (statement says ${pp}).`,
    pdfCheckNone:     'This PDF does not print its balances, so it cannot be checked. Look the lines over yourself.',
    pdfOverlap:       (a, b, rec) => `A statement for ${a} to ${b} is already imported${rec ? ' and reconciled' : ''} for this account. Importing this one would double that month.`,
    pdfAlready:       (n) => `${n} of these lines are already in the books (same date, same amount).`,
    pdfForce:         'Import anyway',
    pdfInclude:       'Import line',
    pdfNoText:        'This PDF is a scanned image with no text to read. Download the statement from your institution\'s website, or export it as CSV.',
    pdfNoLines:       'No transaction lines were found in this PDF. If it is a statement, export it as CSV from your institution.',
    pdfFailed:        (e) => `The PDF could not be read (${e}).`,
    openingFromFile:  (file, typed) => `The first statement shows ${file} before its first line; this account's opening balance says ${typed}. That is the likeliest cause of the difference.`,
    openingUseFile:   (v) => `Use ${v}`,
    mapReadsAs:       'First line reads as',
    mapNeedDate:      'Say which column holds the date.',
    mapNeedAmount:    'Say which column holds the amounts (or Charge and Payment).',
    mapAuto:          'This file is read automatically (OFX/QFX): nothing to set.',
    roleIgnore:       'Ignore',
    roleDate:         'Date',
    roleDesc:         'Description',
    roleAmount:       'Amount (signed)',
    roleDebit:        'Charge / debit',
    roleCredit:       'Payment / credit',
    roleBalance:      'Balance',
    balanceNotSet:    'Not set',
    setBalance:       'Set the statement balance',
    balanceNotSetHint:'This statement has no closing balance: a CSV file does not carry one. Enter the one printed on the statement so it can be reconciled.',
    stmtBalanceOwed:  'Balance owed (statement)',
    biqBalanceOwed:   'Balance owed (BalanceIQ)',
    openingAfterFirst:(d1, d2) => `The account's opening balance is dated ${d1}, after the first transaction (${d2}). Fix the date and amount under Accounts, or the reconciliation cannot come out right.`,
    saveBalance:      'Save',
    allStatuses:      'All statuses',
    statusUnmatched:  'Unmatched',
    statusMatched:    'Matched',
    statusSuggested:  'Suggested',
    statusManual:     'Manual',
    categorize:       'Categorize',
    payBill:          'Pay a bill',
    payBillTitle:     'Which supplier bill does this transaction pay?',
    payBillHint:      'The bill books the expense; this line only settles what you owe (2010). Do not categorize this line to an expense account as well, or the expense is counted twice. Tick several bills if one payment covered them all.',
    payBillNone:      'No unpaid supplier bills.',
    payBillSelected:  (sel, total) => `Selected ${sel} of ${total}`,
    payBillLink:      'Link',
    billMatchTitle:   'An unpaid supplier bill matches this amount',
    billMatchBody:    (n) => `${n}: that bill already books the expense and the tax. Link this line to the bill instead of categorizing it, or the expense is counted twice.`,
    billMatchLink:    'Link to the bill',
    billMatchIgnore:  'No, not that bill',
    match:            'Match',
    unmatch:          'Unmatch',
    selectCoa:        'Select a GL account…',
    selectAccount:    '- Select an account -',
    notes:            'Notes',
    saveCategorize:   'Save',
    transferLabel:    'Transfer between my own accounts',
    transferHint:     'A credit card payment, or money moved between two of your accounts. The line still reconciles, but the entry comes from the other statement - recording it here would count it twice.',
    previewTitle:     (name) => `Reconciliation - ${name}`,
    stmtBalance:      'Statement Balance',
    biqBalance:       'BalanceIQ Balance',
    ecart:            'Difference',
    closeRec:         'Close Reconciliation',
    reopenRec:        'Reopen',
    reopenReason:     'Reason for reopening *',
    noStatements:     'No statements imported for this account.',
    noTransactions:   'No transactions.',
    selectAccountFirst: 'Select an account to view transactions.',
    selectAccountRec:   'Select an account.',
    unreconciledCount:(n) => `${n} unreconciled transaction(s)`,
    rulePattern:      'Normalized Description',
    ruleAccount:      'Assigned GL Account',
    ruleCount:        'Confirmations',
    ruleLastUsed:     'Last Used',
    ruleDelete:       'Delete',
    noRules:          'No learned rules yet.',
    confirmArchive:   'Archive this account?',
    deleteRule:       'Delete this rule?',
    reconciled:       'Reconciled',
    open:             'In progress',
    ecartOk:          'Balanced',
    suggestedCoa:     (name) => `Suggestion: ${name}`,
    confirm:          'Confirm',
    fileLabel:        'File (CSV, OFX, QFX, QBO)',
    optional:         'optional',
    openingBalance2:  'e.g. 12,345.67',
    viewTransactions: 'Transactions',
    loading:          'Loading…',
    colDate:          'Date',
    colDesc:          'Description',
    colAmount:        'Amount',
    colStatus:        'Status',
    colCoa:           'GL Account',
    colActions:       'Actions',
    colPeriod:        'Period',
    colEndBal:        'Ending Balance',
    colStatut:        'Status',
    badgeMatched:     'Matched',
    badgeSuggested:   'Suggested',
    badgeManual:      'Manual',
    badgeUnmatched:   'Unmatched',
    autoLabel:        '✓ auto',
    etransferBadge:   'Interac E-Transfer',
    etransferMatch:   'Match',
    etransferSender:  'Sender',
    etransferHintIn:  'After categorizing this transaction, record the payment on the invoice in Facturation.',
    etransferHintOut: 'After categorizing this transaction, record this payment against the matching supplier bill.',
    etransferBtnIn:   'Categorize to Accounts Receivable (1100)',
    etransferBtnOut:  'Categorize to Accounts Payable (2010)',
    etransferDirIn:   'Received',
    etransferDirOut:  'Sent',
    etransferNoAccount: (n) => `Account ${n} not found in the chart of accounts.`,
    taxCaptureTitle:  'Tax paid (ITC/ITR)',
    taxCaptureHint:   'Optional. Enter the GST and QST actually paid, as shown on the invoice. The expense is then recorded net of tax.',
    taxInflowNote:    'No tax to capture on a receipt: sales GST/QST was already recorded when the invoice was raised.',
    taxAutoFillHint:  'Calculate assumes the entire amount is taxable at Quebec rates. Otherwise enter the exact amounts from the invoice.',
    taxAutoFill:      'Calculate',
    taxRestricted:    (pct, tps, tvq) => `This account is limited to ${pct}%: ${tps} GST and ${tvq} QST will be claimed. The rest is part of the expense.`,
    taxRestrictedWhy: 'Enter the full amounts from the invoice. The limit is applied for you.',
    capexTitle:       'Is this a capital purchase?',
    capexBody:        (amt) => `${amt} on this account is deducted in full this year. Something lasting - a computer, equipment, furniture - belongs on the balance sheet instead and is deducted over several years through capital cost allowance (CCA).`,
    capexHow:         'If it is: pick an asset account (1500-1580) instead, then record the item under Fixed Assets with its CCA class. The GST/QST stays fully claimable this year either way.',
    capexDismiss:     'No, this is an expense',
    capexLearn:       'How do I tell?',
    taxTps:           'GST paid ($)',
    taxTvq:           'QST paid ($)',
    matchExact:       (n) => `Exact description (used ${n}×)`,
    matchPartial:     'Partial description match',
    searchCoa:        'Search by number or name…',
    openingBtn:       'Post opening balance',
    openingTitle:     'Post this account\'s opening balance to the general ledger',
    openingAlready:   'This account\'s opening balance is already posted.',
    openingDone:      (v) => `Opening balance posted: $${Number(v).toFixed(2)}.`,
    backfillBtn:      'Post missing entries',
    backfillTitle:    'Create ledger entries for categorized transactions that have none',
    backfillDone:     (p, sk, o, rd) => `${p} entr${p === 1 ? 'y' : 'ies'} created. ${sk} skipped (control accounts).${o ? ` ${o} orphaned reversed.` : ''}${rd ? ` ${rd} reversal(s) re-dated.` : ''}`,
    done:             'Done',
    deleteStmt:       'Delete import',
    confirmDeleteStmt:(a, b, n) => `Delete the import from ${a} to ${b}?\n\nIts ${n} lines are taken out of the books, and everything done with them is undone (categories, bills paid).\n\nOnly for redoing an import that went wrong. To finish a month, use Close under Reconciliations.`,
    deleteStmtDone:   (n, e) => `Import deleted - ${n} transaction(s) removed${e ? `, ${e} ledger entr${e > 1 ? 'ies' : 'y'} reversed` : ''}.`,
    stmtOlder:        (n) => `+ ${n} older statement${n > 1 ? 's' : ''}`,
    stmtFewer:        'Hide older',
    stmtClosed:       'Closed',
    acctUpToDate:     (d) => `\u2713 Up to date through ${d}`,
    acctToImport:     (a, b, more) => `Statement to import: ${a} \u2192 ${b}${more ? ` (+ ${more} more)` : ''}`,
    acctInProgress:   (a, b, why) => `${a} \u2192 ${b} in progress: ${why}`,
    acctReady:        (a, b) => `${a} \u2192 ${b} ready to close`,
    acctNoStatements: 'No statement imported yet',
    acctSummary:      (n, t) => `${n} of ${t} account${t > 1 ? 's' : ''} up to date`,
    acctGoReconcile:  'Reconcile',
    openingOwed:      'owed',
    openingDateFix:   (d) => `Set the opening date to ${d}`,
    openingBalanceLbl:'Opening balance',
  },
};

const fmt = (n) => {
  const v = parseFloat(n) || 0;
  return (v < 0 ? '-' : '') + '$ ' + Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

const fmtDate = (d) => d ? d.slice(0, 10) : '-';

// ── BanqueTab ─────────────────────────────────────────────────────────────────
export default function BanqueTab({ lang = 'fr', t: theme }) {
  // The tab previously hardcoded a dark palette, so every label rendered
  // near-white on a light background in light mode. Derive colours from the
  // app theme instead, falling back to the original dark values.
  const C = {
    text:    theme?.text          ?? C.text,
    sub:     theme?.textSub       ?? C.sub,
    muted:   theme?.textMuted     ?? C.muted,
    panel:   theme?.section       ?? '#1e293b',
    border:  theme?.cardBorder    ?? '#1e293b',
    divider: theme?.divider       ?? '#0f172a',
    inputBg: theme?.inputBg       ?? '#0f172a',
    card:    theme?.card          ?? '#0f1724',
  };

  // Themed styles must live in component scope - C is not visible at module level.
  const btnSmall = { background: C.panel, color: C.sub, border: 'none', borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontSize: 12 };
  const th       = { textAlign: 'left', padding: '8px 10px', fontWeight: 600, fontSize: 12, color: C.sub };
  const kpiLabel = { fontSize: 11, color: C.muted, marginBottom: 2 };
  const kpiVal   = { fontSize: 16, fontWeight: 700, color: C.text };
  // Modals follow the theme too - a fixed dark panel under themed near-black
  // text is unreadable in light mode.
  const inputStyle = { background: C.inputBg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 10px', fontSize: 12 };
  const inputFull  = { ...inputStyle, width: '100%', boxSizing: 'border-box', padding: '6px 10px' };
  const pickerStyles = { inputFull, labelMuted: C.muted, panel: C.card, border: C.border, hi: 'rgba(167,139,250,0.18)' };
  const td          = { padding: '7px 10px', verticalAlign: 'middle', color: C.text };
  const selectStyle = { background: C.card, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 10px', fontSize: 12 };

  // Learned-match reasons are stored as codes so they translate.
  const matchReason = (raw) => {
    const v = String(raw || '');
    if (v.startsWith('MATCH_EXACT')) return T.matchExact(v.split('|')[1] || '');
    if (v.startsWith('MATCH_PARTIAL')) return T.matchPartial;
    return v;
  };

  const T = UI[lang] || UI.fr;

  // Main-process errors cross IPC as strings, so they are thrown as stable codes
  // (ERR_*) and translated here. Falls back to the raw text for anything unmapped.
  const tErr = (e, ...args) => {
    const raw = typeof e === 'string' ? e : (e?.message || '');
    const code = Object.keys(T.errors).find(k => raw.includes(k));
    if (!code) return raw || T.errors.GENERIC;
    const v = T.errors[code];
    return typeof v === 'function' ? v(...args) : v;
  };

  // Chart-of-accounts rows carry both names; show the one matching the UI language.
  const coaName = (row, prefix = '') => {
    const en = prefix ? row?.[`${prefix}name_en`] : row?.name_en;
    const fr = prefix ? row?.[`${prefix}name_fr`] : row?.name_fr;
    return (lang === 'en' && en) ? en : (fr || en || '');
  };
  const bankAvailable = !!window.api?.bank;

  // ALL hooks must be called unconditionally before any early return (Rules of Hooks)
  const [subTab, setSubTab] = useState('comptes');

  const [accounts, setAccounts]         = useState([]);
  const [coaList, setCoaList]           = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);

  const [showAccountModal, setShowAccountModal]   = useState(false);
  const [editingAccount, setEditingAccount]       = useState(null);
  const [accountForm, setAccountForm]             = useState({ name:'', account_type:'bank', coa_account_id:'', opening_balance:'0', opening_date: new Date().toISOString().slice(0,10) });

  const [showImportModal, setShowImportModal]     = useState(false);
  const [importAccountId, setImportAccountId]     = useState(null);
  const [importFile, setImportFile]               = useState(null);
  const [mapLines, setMapLines]                   = useState([]);      // first lines of the chosen file, as fields
  const [mapRoles, setMapRoles]                   = useState([]);      // one role per column
  const [mapHasHeader, setMapHasHeader]           = useState(false);
  // A statement PDF, read and waiting to be looked over.
  const [pdfInfo, setPdfInfo]                     = useState(null);   // { statement, sourceHash, check }
  const [pdfRoles, setPdfRoles]                   = useState([]);
  const [pdfIncluded, setPdfIncluded]             = useState([]);
  const [pdfBusy, setPdfBusy]                     = useState(false);
  const [pdfError, setPdfError]                   = useState('');
  const [pdfForce, setPdfForce]                   = useState(false);
  const [importPeriodStart, setImportPeriodStart] = useState('');
  const [importPeriodEnd, setImportPeriodEnd]     = useState('');
  const [importEndBal, setImportEndBal]           = useState('');
  const [importing, setImporting]                 = useState(false);
  const [importMsg, setImportMsg]                 = useState('');
  const [importOk, setImportOk]                   = useState(null); // null | true | false

  const [transactions, setTransactions]           = useState([]);
  const [txFilter, setTxFilter]                   = useState('all');
  const [txDateFrom, setTxDateFrom]               = useState('');
  const [txDateTo, setTxDateTo]                   = useState('');

  const [categorizingTx, setCategorizingTx]       = useState(null);
  const [payingTx, setPayingTx]                   = useState(null);
  const [payableBills, setPayableBills]           = useState([]);
  const [payPicked, setPayPicked]                 = useState([]);
  const [payError, setPayError]                   = useState('');
  const [editingBalanceId, setEditingBalanceId]   = useState(null);
  const [balanceDraft, setBalanceDraft]           = useState('');
  const [billMatches, setBillMatches]             = useState([]);
  const [billMatchDismissed, setBillMatchDismissed] = useState(false);
  const [categorizeCoaId, setCategorizeCoaId]     = useState('');
  const [categorizeNotes, setCategorizeNotes]     = useState('');
  const [catTransfer, setCatTransfer]             = useState(false);
  const [capexDismissed, setCapexDismissed]       = useState(false);
  const [capexGuideOpen, setCapexGuideOpen]       = useState(false);
  const [catTps, setCatTps]                       = useState('');
  const [catTvq, setCatTvq]                       = useState('');

  const [statements, setStatements]               = useState([]);
  const [showOlderStmts, setShowOlderStmts]       = useState(false);
  const [recStatus, setRecStatus]                 = useState([]);
  const [recPreview, setRecPreview]               = useState(null);
  const [recLoading, setRecLoading]               = useState(false);

  const [learnedRules, setLearnedRules]           = useState([]);

  const [showReopenModal, setShowReopenModal]     = useState(null);
  const [reopenReason, setReopenReason]           = useState('');

  const fileInputRef = useRef(null);

  // ── Data loading ────────────────────────────────────────────────────────────
  const loadAccounts = useCallback(async () => {
    if (!window.api?.bank) return;
    try {
      const rows = await window.api.bank.accounts.list();
      setAccounts(rows || []);
    } catch (_) {}
  }, []);

  const loadCoa = useCallback(async () => {
    if (!window.api?.coa) return;
    try {
      const rows = await window.api.coa.list();
      setCoaList((rows || []).filter(a => !a.is_archived));
    } catch (_) {}
  }, []);

  const loadTransactions = useCallback(async () => {
    if (!window.api?.bank || !selectedAccount) return;
    try {
      const rows = await window.api.bank.transactions.list(selectedAccount.id, {
        statusFilter: txFilter !== 'all' ? txFilter : undefined,
        dateFrom: txDateFrom || undefined,
        dateTo:   txDateTo   || undefined,
      });
      setTransactions(rows || []);
    } catch (_) {}
  }, [selectedAccount, txFilter, txDateFrom, txDateTo]);

  // Every account's standing, so a forgotten account is visible without picking
  // it from a dropdown first.
  const loadRecStatus = useCallback(async () => {
    try { setRecStatus(await window.api?.bank?.reconcile?.status?.() || []); }
    catch (_) { setRecStatus([]); }
  }, []);

  const loadStatements = useCallback(async () => {
    if (!window.api?.bank || !selectedAccount) return;
    try {
      const rows = await window.api.bank.statement.list(selectedAccount.id);
      setStatements(rows || []);
    } catch (_) {}
  }, [selectedAccount]);

  const loadLearnedRules = useCallback(async () => {
    if (!window.api?.bank) return;
    try {
      const rows = await window.api.bank.learned.list();
      setLearnedRules(rows || []);
    } catch (_) {}
  }, []);

  const loadRecPreview = useCallback(async () => {
    if (!window.api?.bank || !selectedAccount) return;
    setRecLoading(true);
    try {
      const p = await window.api.bank.reconcile.preview(selectedAccount.id);
      setRecPreview(p);
    } catch (e) {
      setRecPreview(null);
    } finally {
      setRecLoading(false);
    }
  }, [selectedAccount]);

  useEffect(() => { loadAccounts(); loadCoa(); loadLearnedRules(); }, []);
  useEffect(() => { if (subTab === 'transactions') { loadTransactions(); loadStatements(); loadRecPreview(); } }, [subTab, selectedAccount, txFilter, txDateFrom, txDateTo]);
  useEffect(() => { if (subTab === 'rapprochements') { loadStatements(); loadRecPreview(); loadRecStatus(); } }, [subTab, selectedAccount]);
  // The Accounts tab says where each account stands, so it needs the same status.
  useEffect(() => { if (subTab === 'comptes') loadRecStatus(); }, [subTab, accounts]);
  useEffect(() => { if (subTab === 'regles') loadLearnedRules(); }, [subTab]);

  // Guard AFTER all hooks - React Rules of Hooks require hooks before any early return
  if (!bankAvailable) {
    return (
      <div style={{ padding: 32, color: C.muted, textAlign: 'center' }}>
        <p style={{ fontSize: 14 }}>🔄 {lang === 'en' ? 'Please restart the app to load the Bank module.' : 'Veuillez redémarrer l\'application pour charger le module Banque.'}</p>
      </div>
    );
  }

  // ── Account CRUD ────────────────────────────────────────────────────────────
  const openNewAccount = () => {
    setEditingAccount(null);
    setAccountForm({ name:'', account_type:'bank', coa_account_id:'', opening_balance:'0', opening_date: new Date().toISOString().slice(0,10) });
    setShowAccountModal(true);
  };

  const openEditAccount = (acc) => {
    setEditingAccount(acc);
    setAccountForm({ name: acc.name, account_type: acc.account_type, coa_account_id: String(acc.coa_account_id), opening_balance: String(toShown(acc.opening_balance, acc)), opening_date: acc.opening_date });
    setShowAccountModal(true);
  };

  const saveAccount = async () => {
    const fields = {
      name: accountForm.name.trim(),
      account_type: accountForm.account_type,
      coa_account_id: parseInt(accountForm.coa_account_id, 10),
      // A card's opening balance is entered as what was owed; stored signed.
      opening_balance: toStored(parseFloat(accountForm.opening_balance) || 0, { account_type: accountForm.account_type }) || 0,
      opening_date: accountForm.opening_date,
    };
    if (!fields.name || !fields.coa_account_id || !fields.opening_date) return;
    try {
      if (editingAccount) {
        await window.api.bank.accounts.update(editingAccount.id, fields);
      } else {
        await window.api.bank.accounts.create(fields);
      }
      setShowAccountModal(false);
      loadAccounts();
      loadRecPreview();
    } catch (e) { alert(tErr(e)); }
  };

  const archiveAccount = async (id) => {
    if (!window.confirm(T.confirmArchive)) return;
    try {
      await window.api.bank.accounts.archive(id);
      if (selectedAccount?.id === id) setSelectedAccount(null);
      loadAccounts();
    } catch (_) {}
  };

  // ── Import ──────────────────────────────────────────────────────────────────
  const openImport = (acc) => {
    setImportAccountId(acc.id);
    setImportFile(null);
    setImportPeriodStart('');
    setImportPeriodEnd('');
    setImportEndBal('');
    setImportMsg('');
    setMapLines([]); setMapRoles([]); setMapHasHeader(false);
    setPdfInfo(null); setPdfError(''); setPdfForce(false);
    setShowImportModal(true);
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    setImportMsg(''); setImportOk(null); setImportFile(null);
  };

  // The failsafe: whatever the file looks like, the operator can say which
  // column is which. The app's guess fills it in first, and a saved answer for
  // this account fills it in instead when there is one.
  const ROLE_KEYS = ['date', 'description', 'amount', 'debit', 'credit', 'balance'];
  const roleOptions = [
    { key: 'ignore', label: T.roleIgnore }, { key: 'date', label: T.roleDate },
    { key: 'description', label: T.roleDesc }, { key: 'amount', label: T.roleAmount },
    { key: 'debit', label: T.roleDebit }, { key: 'credit', label: T.roleCredit },
    { key: 'balance', label: T.roleBalance },
  ];

  const prepareMapping = async (file, accountId) => {
    setMapLines([]); setMapRoles([]); setMapHasHeader(false);
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (['ofx', 'qfx', 'qbo'].includes(ext)) return;
    try {
      const text = await file.text();
      const { rows } = parseCsvLines(text);
      if (!rows.length) return;
      const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
      const acc = accounts.find(a => a.id === accountId);
      let saved = null;
      try { saved = acc?.csv_column_map ? JSON.parse(acc.csv_column_map) : null; } catch (_) { saved = null; }
      const header = saved && typeof saved.hasHeader === 'boolean' ? saved.hasHeader : looksLikeHeader(rows[0]);
      const data = header ? rows.slice(1) : rows;
      const guess = saved ? null : inferColumns(data.length ? data : rows);
      setMapLines(rows.slice(0, header ? 6 : 5));
      setMapHasHeader(header);
      setMapRoles(saved ? rolesFromMap(saved, width, ROLE_KEYS) : rolesFromMap({
        date: guess.dateIdx, description: guess.descIdx, amount: guess.amtIdx,
        debit: guess.debitIdx, credit: guess.creditIdx, balance: guess.balIdx,
      }, width, ROLE_KEYS));
    } catch (_) { /* the import itself will report anything unreadable */ }
  };

  // The first data row as the app will store it, so a wrong column is obvious
  // before anything is imported.
  const mapPreview = () => {
    if (!mapLines.length || !mapRoles.length) return null;
    const data = mapHasHeader ? mapLines.slice(1) : mapLines;
    if (!data.length) return null;
    const idx = (role) => mapRoles.indexOf(role);
    const row = data[0];
    const order = detectNumericDateOrder(data.map(r => r[idx('date')]));
    const date = idx('date') >= 0 ? normalizeStatementDate(row[idx('date')], order) : null;
    const desc = idx('description') >= 0 ? (row[idx('description')] || '') : '';
    let amount = null;
    if (idx('amount') >= 0) amount = parseStatementAmount(row[idx('amount')]);
    else if (idx('debit') >= 0 || idx('credit') >= 0) {
      const d = idx('debit') >= 0 ? Math.abs(parseStatementAmount(row[idx('debit')]) || 0) : 0;
      const c = idx('credit') >= 0 ? Math.abs(parseStatementAmount(row[idx('credit')]) || 0) : 0;
      amount = c - d;
    }
    return { date, desc, amount };
  };
  const mapReady = () => mapLines.length === 0
    || (mapRoles.includes('date') && (mapRoles.includes('amount') || mapRoles.includes('debit') || mapRoles.includes('credit')));

  const isPdfFile = (f) => !!f && /\.pdf$/i.test(f.name || '');

  const readPdfFile = async (file, accountId) => {
    setPdfInfo(null); setPdfError(''); setPdfForce(false); setPdfBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const r = await window.api.bank.statement.readPdf(bytes, accountId);
      if (!r?.ok) {
        const e = String(r?.error || '');
        setPdfError(e === 'pdf_has_no_text' ? T.pdfNoText : e === 'pdf_no_lines' ? T.pdfNoLines : T.pdfFailed(e));
        return;
      }
      setPdfInfo(r);
      setPdfIncluded(r.statement.rows.map(() => true));
      setPdfRoles(r.statement.columns.map(c => (c === 'postDate' ? 'ignore' : c)));
    } catch (e) {
      setPdfError(T.pdfFailed(String(e?.message || e)));
    } finally {
      setPdfBusy(false);
    }
  };

  // The lines as they will be imported: what the grid says each column is,
  // only the ticked lines, amounts as the statement prints them.
  const pdfRows = () => {
    if (!pdfInfo) return [];
    const st = pdfInfo.statement;
    const at = (cells, role) => { const i = pdfRoles.indexOf(role); return i >= 0 ? cells[i] : ''; };
    const num = (v) => (v === '' || v == null ? null : Number(v));
    return st.table.map((cells, i) => {
      if (!pdfIncluded[i]) return null;
      const date = at(cells, 'date');
      let amount = num(at(cells, 'amount'));
      if (amount == null && (pdfRoles.includes('debit') || pdfRoles.includes('credit'))) {
        const d = num(at(cells, 'debit')), c = num(at(cells, 'credit'));
        if (d != null || c != null) amount = (c || 0) - (d || 0);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || amount == null || !Number.isFinite(amount)) return null;
      const row = st.rows[i] || {};
      const note = [row.note, st.cardholders.length > 1 ? row.cardholder : ''].filter(Boolean).join(' \u00b7 ');
      return { date, description: at(cells, 'description'), amount, note };
    }).filter(Boolean);
  };
  const pdfCheckNow = () => {
    if (!pdfInfo) return null;
    const st = pdfInfo.statement;
    return balanceCheck(st.opening, st.closing, pdfRows().map(r => r.amount));
  };
  const pdfReady = () => {
    if (!pdfInfo) return false;
    const rows = pdfRows();
    if (!rows.length) return false;
    const chk = pdfCheckNow();
    const blocked = chk?.ok === false || !!pdfInfo.check?.overlap;
    return !blocked || pdfForce;
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    setImportMsg('');
    setImportOk(null);
    try {
      let result;
      if (isPdfFile(importFile)) {
        const st = pdfInfo.statement;
        const rows = pdfRows();
        const dir = balanceCheck(st.opening, st.closing, rows.map(r => r.amount)).direction;
        result = await window.api.bank.statement.import({
          bankAccountId: importAccountId,
          fileName: importFile.name,
          fileType: 'pdf',
          periodStart: importPeriodStart || undefined,
          periodEnd:   importPeriodEnd   || undefined,
          endingBalance: importEndBal ? toStored(parseFloat(importEndBal), accounts.find(a => a.id === importAccountId)) : undefined,
          pdfStatement: {
            rows: rows.map(r => ({ ...r, amount: r.amount * dir })),
            opening: st.opening, closing: st.closing,
            periodStart: st.period.start, periodEnd: st.period.end,
            sourceHash: pdfInfo.sourceHash,
          },
          allowOverlap: pdfForce,
        });
      } else {
      const text = await importFile.text();
      const ext  = importFile.name.split('.').pop().toLowerCase();
      result = await window.api.bank.statement.import({
        bankAccountId: importAccountId,
        fileText: text,
        fileName: importFile.name,
        fileType: ext,
        periodStart: importPeriodStart || undefined,
        periodEnd:   importPeriodEnd   || undefined,
        endingBalance: importEndBal ? toStored(parseFloat(importEndBal), accounts.find(a => a.id === importAccountId)) : undefined,
        columnMap: mapLines.length ? mapFromRoles(mapRoles, mapHasHeader, ROLE_KEYS) : undefined,
      });
      }
      const acc = accounts.find(a => a.id === importAccountId);
      setImportMsg(T.importResult(result) + T.importResultExtra(result, result.openingSet ? fmt(toShown(result.openingSet.balance, acc)) : ''));
      setImportOk(true);
      loadAccounts();
      if (selectedAccount?.id === importAccountId) { loadTransactions(); loadStatements(); loadRecPreview(); }
    } catch (e) {
      setImportMsg(tErr(e));
      setImportOk(false);
    } finally {
      setImporting(false);
    }
  };

  // ── Categorize ──────────────────────────────────────────────────────────────
  // A statement line that pays a supplier bill settles the payable instead of
  // booking an expense, so the bill stays the only place the expense is recorded.
  // Every unpaid bill is offered, because one payment often covers several of
  // them; the bill that matches the line on its own is ticked for you.
  const openPayBill = async (tx) => {
    setPayingTx(tx); setPayableBills([]); setPayPicked([]); setPayError('');
    try {
      const bills = await window.api.supplierBills.list({ paid: 0 });
      const list = Array.isArray(bills) ? bills : [];
      setPayableBills(list);
      const cents = Math.round(Math.abs(Number(tx.amount) || 0) * 100);
      const exact = list.filter(b => Math.round((Number(b.amount) || 0) * 100) === cents);
      if (exact.length === 1) setPayPicked([exact[0].id]);
    } catch (_) { setPayableBills([]); }
  };

  const togglePayBill = (id) =>
    setPayPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));

  // The mistake happens in the Categorize dialog, so the warning belongs there -
  // not only in the link dialog, which the careful user already chose. A money-out
  // line with an unpaid bill for the same amount is almost certainly that bill's
  // payment, and categorizing it to an expense account would book the expense a
  // second time. A courtesy, never a block: the operator may know better.
  useEffect(() => {
    setBillMatchDismissed(false);
    setBillMatches([]);
    const tx = categorizingTx;
    if (!tx || Number(tx.amount) >= 0) return undefined;
    let alive = true;
    (async () => {
      try {
        const bills = await window.api.supplierBills.list({ paid: 0 });
        const cents = Math.round(Math.abs(Number(tx.amount) || 0) * 100);
        const same = (bills || []).filter(b => Math.round((Number(b.amount) || 0) * 100) === cents);
        if (alive) setBillMatches(same);
      } catch (_) { /* the warning is a courtesy: never stand in the way */ }
    })();
    return () => { alive = false; };
  }, [categorizingTx]);

  const linkBillsToTx = async () => {
    if (!payingTx || !payPicked.length) return;
    try {
      const r = await window.api.supplierBills.payByBankTx(payingTx.id, payPicked);
      if (r?.ok === false) { setPayError(String(r.error || '')); return; }
      setPayingTx(null); setPayPicked([]);
      await loadTransactions();
    } catch (e) { setPayError(String(e?.message ?? e)); }
  };

  // The chosen bills have to add up to the line before anything can be linked,
  // so the running total is the check the operator reads before committing.
  const paySelectedCents = payableBills
    .filter(b => payPicked.includes(b.id))
    .reduce((n, b) => n + Math.round((Number(b.amount) || 0) * 100), 0);
  const payTxCents = payingTx ? Math.round(Math.abs(Number(payingTx.amount) || 0) * 100) : 0;
  const payTotalsAgree = !!payingTx && paySelectedCents > 0 && paySelectedCents === payTxCents;

  const openCategorize = (tx) => {
    const etSender = detectEtransfer(tx.description || '');
    setCategorizingTx({ ...tx, etSender });
    // Whatever the row already carries wins; only an uncategorized e-transfer
    // falls back to the receivable/payable default implied by its direction.
    if (tx.coa_account_id) {
      setCategorizeCoaId(String(tx.coa_account_id));
    } else if (etSender) {
      const fallback = findCoa(etransferTarget(tx));
      setCategorizeCoaId(fallback?.id ? String(fallback.id) : '');
    } else {
      setCategorizeCoaId('');
    }
    setCategorizeNotes(tx.notes || '');
  };

  const saveCategorize = async () => {
    if (!categorizingTx || !categorizeCoaId) return;
    try {
      await window.api.bank.transactions.categorize(
        categorizingTx.id, parseInt(categorizeCoaId, 10), categorizeNotes,
        { tpsPaid: parseFloat(catTps) || 0, tvqPaid: parseFloat(catTvq) || 0, isTransfer: catTransfer },
      );
      setCategorizingTx(null);
      loadTransactions();
      loadRecPreview();
    } catch (_) {}
  };

  const unmatch = async (txId) => {
    try {
      await window.api.bank.transactions.unmatch(txId);
      loadTransactions();
    } catch (_) {}
  };

  // ── Reconciliation ──────────────────────────────────────────────────────────
  const closeReconciliation = async (stmtId) => {
    if (!selectedAccount) return;
    try {
      const result = await window.api.bank.reconcile.close(selectedAccount.id, stmtId);
      if (result.success) { loadStatements(); loadRecPreview(); loadRecStatus(); }
      else alert(result.errorCode ? tErr(result.errorCode, result.ecart) : (result.message || T.errors.GENERIC));
    } catch (_) {}
  };

  const reopenReconciliation = async () => {
    if (!showReopenModal || !reopenReason.trim()) return;
    try {
      await window.api.bank.reconcile.reopen(selectedAccount.id, showReopenModal.id, reopenReason.trim());
      setShowReopenModal(null);
      setReopenReason('');
      loadStatements();
      loadRecPreview();
    } catch (_) {}
  };

  const deleteLearnedRule = async (id) => {
    if (!window.confirm(T.deleteRule)) return;
    try {
      await window.api.bank.learned.delete(id);
      loadLearnedRules();
    } catch (_) {}
  };

  // ── E-transfer detection ──────────────────────────────────────────────────────
  const detectEtransfer = (description = '') => {
    const up = description.toUpperCase();
    if (!up.includes('INTERAC') && !up.includes('E-TFR') && !up.includes('ETFR')) return null;
    const patterns = [/VIREMENT INTERAC\s+(.+?)(?:\s+\d|$)/i, /INTERAC\s+(.+?)(?:\s+\d|$)/i, /E-TFR\s+(.+?)(?:\s+\d|$)/i];
    for (const p of patterns) { const m = description.match(p); if (m?.[1]) return m[1].trim(); }
    return '-';
  };

  // An e-transfer RECEIVED is a customer settling what they owe us -> Accounts
  // receivable (1100, asset). An e-transfer SENT is us paying someone -> Accounts
  // payable (2010, liability). Posting an outgoing payment to AR would inflate
  // money owed TO us by the amount we just paid OUT, in the wrong direction.
  const etransferTarget = (tx) => (Number(tx?.amount) >= 0
    ? { num: '1100', fr: 'clients',      en: 'receivable' }
    : { num: '2010', fr: 'fournisseurs', en: 'payable' });

  // NOTE: the accounts state is coaList. This previously read a non-existent
  // `coa`, which threw a ReferenceError before the try/catch and made the
  // Interac categorize button silently do nothing.
  const findCoa = (t) =>
    coaList.find(a => a.account_number === t.num)
    || coaList.find(a => (a.name_fr || '').toLowerCase().includes(t.fr))
    || coaList.find(a => (a.name_en || '').toLowerCase().includes(t.en));

  // Remove a bad import (wrong date range / wrong account) so the same file can
  // be imported again - the stored file hash goes with the statement.
  // The opening balance lived only on the account record, so the ledger started
  // from zero and the balance sheet understated cash by the whole figure.
  const postOpening = async (acc) => {
    try {
      const r = await window.api.bank.accounts.postOpening(acc.id);
      if (r?.alreadyPosted) alert(T.openingAlready);
      else if (r?.ok) alert(T.openingDone(acc.opening_balance));
      else alert(tErr(r?.error || ''));
      loadAccounts();
    } catch (e) { alert(tErr(e)); }
  };

  // Rows categorized before posting existed have a category but no ledger entry.
  const postMissing = async (acc) => {
    try {
      const r = await window.api.bank.accounts.postMissing(acc.id);
      alert(T.backfillDone(r?.posted ?? 0, r?.skipped ?? 0, r?.orphansReversed ?? 0, r?.redated ?? 0));
      loadTransactions();
    } catch (e) { alert(tErr(e)); }
  };

  // A card's statement says what is owed as a positive number; the books keep it
  // negative. One place converts, both ways.
  const owedAccount = (acc) => !!acc && (acc.account_type === 'credit_card' || acc.account_type === 'line_of_credit');
  const toStored = (entered, acc) => (owedAccount(acc) ? -Math.abs(Number(entered)) : Number(entered));
  const toShown = (stored, acc) => (owedAccount(acc) ? -Number(stored || 0) : Number(stored || 0));

  // A statement from before this was tracked reads zero with no source; that is
  // the same as unset, and saying so is what gets it corrected.
  const balanceUnset = (stmt) => stmt.ending_balance_source === 'none'
    || (!stmt.ending_balance_source && Number(stmt.ending_balance) === 0);

  const startEditBalance = (stmt) => {
    setEditingBalanceId(stmt.id);
    const shown = toShown(stmt.ending_balance, selectedAccount);
    setBalanceDraft(balanceUnset(stmt) ? '' : String(shown));
  };
  const saveBalance = async (stmt) => {
    const entered = parseFloat(balanceDraft);
    if (!Number.isFinite(entered)) { alert(T.errors.ERR_STATEMENT_BALANCE_INVALID); return; }
    try {
      await window.api.bank.statement.update(stmt.id, { ending_balance: toStored(entered, selectedAccount) });
      setEditingBalanceId(null); setBalanceDraft('');
      loadStatements(); loadRecPreview(); loadRecStatus();
    } catch (e) { alert(tErr(e)); }
  };

  // What stands between a statement and a close, in the operator's words.
  const closeBlockers = (stmt) => {
    const out = [];
    if (!recPreview) return out;
    if (balanceUnset(stmt)) out.push(T.recBlockedBalance);
    if (recPreview.unreconciledCount > 0) out.push(T.recBlockedLines(recPreview.unreconciledCount));
    if (Math.abs(recPreview.ecart) > 0.02) out.push(T.recBlockedVar(fmt(Math.abs(recPreview.ecart))));
    return out;
  };

  const deleteStatement = async (stmt) => {
    if (!window.confirm(T.confirmDeleteStmt(fmtDate(stmt.period_start), fmtDate(stmt.period_end), stmt.line_count ?? '?'))) return;
    try {
      const r = await window.api.bank.statement.delete(stmt.id);
      alert(T.deleteStmtDone(r?.removedTransactions ?? 0, r?.reversedEntries ?? 0));
      loadStatements();
      loadTransactions();
      loadRecPreview();
    } catch (e) { alert(tErr(e)); }
  };

  // Pre-select the best account we know of when the modal opens: an existing
  // categorization or learned suggestion beats the generic direction default,
  // which would otherwise overwrite a correct answer with AR/AP.

  React.useEffect(() => {
    setCapexDismissed(false);
    setCatTransfer(!!categorizingTx?.is_transfer);
    if (!categorizingTx) { setCatTps(''); setCatTvq(''); return; }
    setCatTps(categorizingTx.tps_paid ? String(categorizingTx.tps_paid) : '');
    setCatTvq(categorizingTx.tvq_paid ? String(categorizingTx.tvq_paid) : '');
  }, [categorizingTx]);


  // ── Status badge ─────────────────────────────────────────────────────────────
  const StatusBadge = ({ status }) => {
    const color = status === 'matched' ? '#22c55e' : status === 'suggested' ? '#f59e0b' : status === 'manual' ? '#a78bfa' : '#ef4444';
    const label = status === 'matched' ? T.badgeMatched : status === 'suggested' ? T.badgeSuggested : status === 'manual' ? T.badgeManual : T.badgeUnmatched;
    return <span style={{ background: color + '22', color, border: `1px solid ${color}44`, borderRadius: 4, padding: '1px 7px', fontSize: 11, fontWeight: 600 }}>{label}</span>;
  };

  // ── Account type label ────────────────────────────────────────────────────────
  const typeLabel = (t) => t === 'credit_card' ? T.typeCC : t === 'line_of_credit' ? T.typeLOC : T.typeBank;

  // ── Render ────────────────────────────────────────────────────────────────────
  const SUB_TABS = [
    { key: 'comptes',        label: T.tabComptes },
    { key: 'transactions',   label: T.tabTransactions },
    { key: 'rapprochements', label: T.tabRapprochements },
    { key: 'regles',         label: T.tabRegles },
  ];

  return (
    <div style={{ padding: '18px 20px', color: C.text, fontFamily: 'inherit' }}>
      {/* Sub-tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: `1px solid ${C.border}`, paddingBottom: 0 }}>
        {SUB_TABS.map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)} style={{
            background: 'none', border: 'none', borderBottom: subTab === t.key ? '2px solid #f97316' : '2px solid transparent',
            color: subTab === t.key ? '#f97316' : C.sub, cursor: 'pointer', padding: '6px 14px', fontWeight: 600, fontSize: 13,
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── COMPTES ─────────────────────────────────────────────────────────── */}
      {subTab === 'comptes' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, color: C.text }}>🏦 {T.tabComptes}</h3>
              {recStatus.length > 0 && (() => {
                const done = recStatus.filter(r => r.state === 'up_to_date').length;
                return (
                  <div style={{ fontSize: 12, marginTop: 3, color: done === recStatus.length ? '#22c55e' : C.sub }}>
                    {T.acctSummary(done, recStatus.length)}
                  </div>
                );
              })()}
            </div>
            <button onClick={openNewAccount} style={btnStyle('#f97316')}>{T.addAccount}</button>
          </div>

          {accounts.length === 0 ? (
            <p style={{ color: C.muted, textAlign: 'center', marginTop: 40 }}>{T.noAccounts}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {accounts.map(acc => (
                <div key={acc.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{acc.name}</div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                      {typeLabel(acc.account_type)} · {acc.account_number} {coaName(acc, 'coa_')}
                    </div>
                    {(() => {
                      // Where this account stands on its statements, without a trip
                      // to Reconciliations.
                      const st = recStatus.find(r => r.accountId === acc.id);
                      if (!st) return null;
                      const why = st.blockers?.includes('balance_not_set') ? T.recBlockedBalance
                        : st.blockers?.includes('lines_not_counted') ? T.recBlockedLines(st.notCounted)
                        : st.blockers?.includes('variance') ? T.recBlockedVar(fmt(Math.abs(st.ecart))) : '';
                      const line = st.state === 'up_to_date' ? { text: T.acctUpToDate(fmtDate(st.lastReconciledEnd || st.lastStatementEnd)), color: '#22c55e' }
                        : st.state === 'to_import' ? { text: T.acctToImport(fmtDate(st.due[0].periodStart), fmtDate(st.due[0].periodEnd), st.due.length - 1), color: '#f59e0b' }
                        : st.state === 'ready' ? { text: T.acctReady(fmtDate(st.next.periodStart), fmtDate(st.next.periodEnd)), color: '#22c55e', go: true }
                        : st.state === 'in_progress' ? { text: T.acctInProgress(fmtDate(st.next.periodStart), fmtDate(st.next.periodEnd), why), color: '#f59e0b', go: true }
                        : { text: T.acctNoStatements, color: C.muted };
                      return (
                        <div style={{ fontSize: 12, fontWeight: 600, color: line.color, marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span>{line.text}</span>
                          {line.go && (
                            <button onClick={() => { setSelectedAccount(acc); setSubTab('rapprochements'); }}
                              style={{ ...btnSmall, fontSize: 11, padding: '2px 8px' }}>{T.acctGoReconcile}</button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, color: C.sub }}>{T.openingBalanceLbl}: {fmt(toShown(Number(acc.opening_balance) || 0, acc))}{owedAccount(acc) ? ` ${T.openingOwed}` : ''} · {fmtDate(acc.opening_date)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => postOpening(acc)} style={{ ...btnSmall, marginRight: 6 }} title={T.openingTitle}>{T.openingBtn}</button>
                    <button onClick={() => postMissing(acc)} style={{ ...btnSmall, marginRight: 6 }} title={T.backfillTitle}>{T.backfillBtn}</button>
                    <button onClick={() => { setSelectedAccount(acc); openImport(acc); }} style={btnStyle('#0ea5e9', 12)}>{T.importStatement}</button>
                    <button onClick={() => { setSelectedAccount(acc); setSubTab('transactions'); }} style={btnStyle(C.muted, 12)}>{T.viewTransactions}</button>
                    <button onClick={() => openEditAccount(acc)} style={btnSmall}>{T.editAccount}</button>
                    <button onClick={() => archiveAccount(acc.id)} style={btnSmallDanger}>{T.archiveAccount}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TRANSACTIONS ─────────────────────────────────────────────────────── */}
      {subTab === 'transactions' && (
        <div>
          {/* Which account this list belongs to, said plainly: the tab keeps the
              last account chosen, and a dropdown alone did not make that clear. */}
          {selectedAccount && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <span style={{ fontSize: 10.5, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em' }}>{T.viewingAccount}</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{selectedAccount.name}</span>
              <span style={{ fontSize: 11.5, color: C.muted }}>{typeLabel(selectedAccount.account_type)}</span>
              {recPreview && (
                <span style={{ fontSize: 12, color: C.sub }}>
                  · {recPreview.owedView ? T.biqBalanceOwed : T.biqBalance}: <strong style={{ color: C.text }}>{fmt(toShown(recPreview.biqBalance, selectedAccount))}</strong>
                </span>
              )}
              {transactions.length > 0 && <span style={{ fontSize: 11.5, color: C.muted }}>· {T.lineCount(transactions.length)}</span>}
            </div>
          )}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              <select value={selectedAccount?.id || ''} onChange={e => {
                const acc = accounts.find(a => a.id === parseInt(e.target.value, 10));
                setSelectedAccount(acc || null);
              }} style={selectStyle}>
                <option value=''>{T.selectAccount}</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <select value={txFilter} onChange={e => setTxFilter(e.target.value)} style={selectStyle}>
                <option value='all'>{T.allStatuses}</option>
                <option value='unmatched'>{T.statusUnmatched}</option>
                <option value='suggested'>{T.statusSuggested}</option>
                <option value='matched'>{T.statusMatched}</option>
                <option value='manual'>{T.statusManual}</option>
              </select>
              <input type='date' value={txDateFrom} onChange={e => setTxDateFrom(e.target.value)} style={inputStyle} />
              <input type='date' value={txDateTo}   onChange={e => setTxDateTo(e.target.value)}   style={inputStyle} />
            </div>
            {/* Each import can be taken back from here, where its lines are seen,
                not only from Reconciliations. A reconciled statement stays. */}
            {selectedAccount && statements.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 11.5, color: C.muted }}>
                <span>{T.importedStatements}</span>
                {(() => {
                  // Every open statement, and the last one closed for context.
                  // A year of closed months would otherwise fill the page.
                  const byEnd = [...statements].sort((a, b) => String(b.period_end).localeCompare(String(a.period_end)));
                  const lastClosed = byEnd.find(st => st.reconciled);
                  const shown = showOlderStmts ? byEnd : byEnd.filter(st => !st.reconciled || st === lastClosed);
                  const foldable = byEnd.filter(st => st.reconciled && st !== lastClosed).length;
                  return (
                    <>
                      {shown.map(st => (
                        <span key={st.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 8px', border: `1px solid ${st.reconciled ? C.border : 'rgba(245,158,11,0.5)'}`, borderRadius: 12 }}>
                          {fmtDate(st.period_start)} {'\u2192'} {fmtDate(st.period_end)}{st.line_count != null ? ` \u00b7 ${st.line_count}` : ''}
                          {st.reconciled
                            ? <span style={{ color: '#22c55e' }}>{'\u2713'} {T.stmtClosed}</span>
                            : (
                              <button onClick={() => deleteStatement(st)} title={T.deleteStmt}
                                style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 11, padding: 0, textDecoration: 'underline' }}>{T.deleteStmt}</button>
                            )}
                        </span>
                      ))}
                      {foldable > 0 && (
                        <button onClick={() => setShowOlderStmts(v => !v)}
                          style={{ background: 'none', border: 'none', color: C.sub, cursor: 'pointer', fontSize: 11.5, padding: 0, textDecoration: 'underline' }}>
                          {showOlderStmts ? T.stmtFewer : T.stmtOlder(foldable)}
                        </button>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>

          {!selectedAccount ? (
            <p style={{ color: C.muted, textAlign: 'center', marginTop: 40 }}>{T.selectAccountFirst}</p>
          ) : transactions.length === 0 ? (
            <p style={{ color: C.muted, textAlign: 'center', marginTop: 40 }}>{T.noTransactions}</p>
          ) : (
            <div style={{ overflowX: 'auto', background: C.inputBg, borderRadius: 8, padding: '0 0 4px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}`, color: C.muted }}>
                    <th style={{ ...th, whiteSpace: 'nowrap', width: 90 }}>{T.colDate}</th>
                    <th style={th}>{T.colDesc}</th>
                    <th style={{ ...th, textAlign: 'right', width: 100 }}>{T.colAmount}</th>
                    <th style={{ ...th, width: 160 }}>{T.colStatus}</th>
                    <th style={{ ...th, width: 90, textAlign: 'center' }}>{T.colActions}</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map(tx => {
                    const etSender = detectEtransfer(tx.description);
                    return (
                    <tr key={tx.id} style={{ borderBottom: `1px solid ${C.divider}` }}>
                      <td style={{ ...td, whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDate(tx.transaction_date)}</td>
                      <td style={{ ...td, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 0 }} title={tx.description}>
                        {tx.description}
                        {etSender && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: '#a78bfa', background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.25)', borderRadius: 3, padding: '1px 5px' }}>{T.etransferBadge}</span>}
                      </td>
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', color: tx.amount < 0 ? '#f87171' : '#86efac', fontWeight: 600 }}>{fmt(tx.amount)}</td>
                      <td style={td}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <StatusBadge status={tx.match_status} />
                          {tx.account_number && (
                            <span style={{ fontSize: 10, color: C.muted }}>{tx.account_number} {coaName(tx, 'coa_')}</span>
                          )}
                          {tx.match_status === 'suggested' && tx.match_reason && (
                            <span style={{ fontSize: 9, color: C.muted, fontStyle: 'italic' }}>{matchReason(tx.match_reason)}</span>
                          )}
                        </div>
                      </td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                          {tx.match_status !== 'matched' && (
                            <button onClick={() => openCategorize(tx)} style={btnSmall}>{T.categorize}</button>
                          )}
                          {tx.amount < 0 && tx.match_status !== 'matched' && (
                            <button onClick={() => openPayBill(tx)} style={btnSmall}>{T.payBill}</button>
                          )}
                          {(tx.match_status === 'matched' || tx.match_status === 'manual' || tx.match_status === 'suggested') && (
                            <button onClick={() => unmatch(tx.id)} style={btnSmallDanger}>{T.unmatch}</button>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── RAPPROCHEMENTS ────────────────────────────────────────────────────── */}
      {subTab === 'rapprochements' && (
        <div>
          {/* Where every account stands, before anything is chosen. */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 8 }}>{T.recOverview}</div>
            {recStatus.length === 0 ? (
              <div style={{ fontSize: 12, color: C.muted }}>{T.noAccounts}</div>
            ) : recStatus.every(a => !a.next) ? (
              <div style={{ fontSize: 12, color: '#22c55e' }}>{T.recAllDone}</div>
            ) : recStatus.map(a => {
              const why = a.blockers.includes('balance_not_set') ? T.recBlockedBalance
                : a.blockers.includes('lines_not_counted') ? T.recBlockedLines(a.notCounted)
                : a.blockers.includes('variance') ? T.recBlockedVar(fmt(Math.abs(a.ecart)))
                : T.recReady;
              return (
                <div key={a.accountId} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '5px 0', borderTop: `1px solid ${C.divider}` }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text, minWidth: 120 }}>{a.name}</span>
                  <span style={{ fontSize: 11, color: C.muted }}>{a.lastReconciledEnd ? T.recLastClosed(fmtDate(a.lastReconciledEnd)) : T.recNever}</span>
                  <span style={{ fontSize: 11.5, color: a.next ? C.text : C.muted }}>
                    {a.next ? T.recOpenPeriod(fmtDate(a.next.periodStart), fmtDate(a.next.periodEnd)) : T.recNothingOpen}
                  </span>
                  {a.next && <span style={{ fontSize: 11, color: a.canClose ? '#22c55e' : '#f59e0b' }}>{why}</span>}
                  {a.next && (
                    <button onClick={() => { const acc = accounts.find(x => x.id === a.accountId); if (acc) setSelectedAccount(acc); }}
                      style={{ ...btnSmall, marginLeft: 'auto' }}>{T.recOpen}</button>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 15, color: C.text, flex: 1 }}>✅ {T.tabRapprochements}</h3>
            <select value={selectedAccount?.id || ''} onChange={e => {
              const acc = accounts.find(a => a.id === parseInt(e.target.value, 10));
              setSelectedAccount(acc || null);
            }} style={selectStyle}>
              <option value=''>{T.selectAccount}</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          {!selectedAccount ? (
            <p style={{ color: C.muted, textAlign: 'center', marginTop: 40 }}>{T.selectAccountRec}</p>
          ) : (
            <>
              {/* Preview card */}
              {recLoading ? (
                <p style={{ color: C.muted }}>{T.loading}</p>
              ) : recPreview && (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '16px 20px', marginBottom: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: C.text }}>{T.previewTitle(selectedAccount.name)}</div>
                  <div style={{ display: 'flex', gap: 24 }}>
                    <div><div style={kpiLabel}>{recPreview.owedView ? T.stmtBalanceOwed : T.stmtBalance}</div>
                      <div style={kpiVal}>{recPreview.balanceUnset ? T.balanceNotSet : fmt(toShown(recPreview.statementBalance, selectedAccount))}</div></div>
                    <div><div style={kpiLabel}>{recPreview.owedView ? T.biqBalanceOwed : T.biqBalance}</div>
                      <div style={kpiVal}>{fmt(toShown(recPreview.biqBalance, selectedAccount))}</div></div>
                    <div>
                      <div style={kpiLabel}>{T.ecart}</div>
                      <div style={{ ...kpiVal, color: Math.abs(recPreview.ecart) <= 0.02 ? '#22c55e' : '#f87171' }}>
                        {fmt(recPreview.ecart)}
                      </div>
                    </div>
                    {recPreview.unreconciledCount > 0 && (
                      <div style={{ marginLeft: 'auto', alignSelf: 'center', color: '#f59e0b', fontSize: 13 }}>
                        {T.unreconciledCount(recPreview.unreconciledCount)}
                      </div>
                    )}
                  </div>
                  {recPreview.balanceUnset && (
                    <div style={{ marginTop: 10, fontSize: 11.5, color: '#f59e0b', lineHeight: 1.5 }}>{T.balanceNotSetHint}</div>
                  )}
                  {recPreview.openingMismatch && selectedAccount && (
                    <div style={{ marginTop: 6, fontSize: 11.5, color: '#f59e0b', lineHeight: 1.5, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span>{T.openingFromFile(fmt(toShown(recPreview.fileOpening, selectedAccount)), fmt(toShown(Number(selectedAccount.opening_balance) || 0, selectedAccount)))}</span>
                      <button
                        onClick={async () => {
                          try {
                            await window.api.bank.accounts.update(selectedAccount.id, { opening_balance: recPreview.fileOpening });
                            await loadAccounts();
                            loadRecPreview();
                          } catch (_) {}
                        }}
                        style={{ ...btnStyle('#f97316'), padding: '3px 10px', fontSize: 11.5 }}>
                        {T.openingUseFile(fmt(toShown(recPreview.fileOpening, selectedAccount)))}
                      </button>
                    </div>
                  )}
                  {recPreview.openingDateAfterFirstLine && selectedAccount && (() => {
                    const dayBefore = new Date(Date.parse(recPreview.firstLineDate + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
                    return (
                      <div style={{ marginTop: 6, fontSize: 11.5, color: '#f59e0b', lineHeight: 1.5, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span>{T.openingAfterFirst(fmtDate(recPreview.openingDate), fmtDate(recPreview.firstLineDate))}</span>
                        <button
                          onClick={async () => {
                            try {
                              await window.api.bank.accounts.update(selectedAccount.id, { opening_date: dayBefore });
                              await loadAccounts();
                              loadRecPreview();
                            } catch (e) { alert(tErr(e)); }
                          }}
                          style={{ ...btnStyle('#f97316'), padding: '3px 10px', fontSize: 11.5 }}>
                          {T.openingDateFix(fmtDate(dayBefore))}
                        </button>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Statements list */}
              {statements.length === 0 ? (
                <p style={{ color: C.muted, textAlign: 'center', marginTop: 20 }}>{T.noStatements}</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}`, color: C.muted }}>
                      <th style={th}>{T.colPeriod}</th>
                      <th style={{ ...th, textAlign: 'right' }}>{T.colEndBal}</th>
                      <th style={th}>{T.colStatut}</th>
                      <th style={th}>{T.colActions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statements.map(stmt => (
                      <tr key={stmt.id} style={{ borderBottom: `1px solid ${C.divider}` }}>
                        <td style={td}>{fmtDate(stmt.period_start)} → {fmtDate(stmt.period_end)}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>
                          {editingBalanceId === stmt.id ? (
                            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                              <input autoFocus type='number' step='0.01' value={balanceDraft}
                                onChange={e => setBalanceDraft(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') saveBalance(stmt); if (e.key === 'Escape') setEditingBalanceId(null); }}
                                style={{ ...inputStyle, width: 120, textAlign: 'right' }} />
                              <button onClick={() => saveBalance(stmt)} style={btnStyle('#22c55e', 11)}>{T.saveBalance}</button>
                            </span>
                          ) : stmt.reconciled ? (
                            fmt(toShown(stmt.ending_balance, selectedAccount))
                          ) : (
                            <button onClick={() => startEditBalance(stmt)} title={T.setBalance}
                              style={{ background: 'none', border: 'none', color: balanceUnset(stmt) ? '#f59e0b' : C.text, cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: 0 }}>
                              {balanceUnset(stmt) ? T.balanceNotSet : fmt(toShown(stmt.ending_balance, selectedAccount))} &#9998;
                            </button>
                          )}
                        </td>
                        <td style={td}>
                          {stmt.reconciled
                            ? <span style={{ color: '#22c55e', fontWeight: 600 }}>✓ {T.reconciled}</span>
                            : <span style={{ color: '#f59e0b' }}>{T.open}</span>}
                        </td>
                        <td style={td}>
                          {!stmt.reconciled && (() => {
                            const why = closeBlockers(stmt);
                            return why.length === 0 ? (
                              <button onClick={() => closeReconciliation(stmt.id)} style={btnStyle('#22c55e', 12)}>{T.closeRec}</button>
                            ) : (
                              // Shown, not hidden: a missing button explains nothing.
                              <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
                                <button disabled title={T.closeBlockedWhy} style={{ ...btnStyle('#22c55e', 12), opacity: 0.4, cursor: 'default' }}>{T.closeRec}</button>
                                <span style={{ fontSize: 10.5, color: '#f59e0b' }}>{why.join(' · ')}</span>
                              </span>
                            );
                          })()}
                          {!!stmt.reconciled && (
                            <button onClick={() => { setShowReopenModal(stmt); setReopenReason(''); }} style={btnSmall}>{T.reopenRec}</button>
                          )}
                          {!stmt.reconciled && (
                            <button onClick={() => deleteStatement(stmt)} style={{ ...btnSmall, marginLeft: 6, color: '#f87171', border: '1px solid rgba(248,113,113,0.3)' }}>{T.deleteStmt}</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      )}

      {/* ── RÈGLES ─────────────────────────────────────────────────────────────── */}
      {subTab === 'regles' && (
        <div>
          <h3 style={{ margin: '0 0 14px', fontSize: 15, color: C.text }}>🧠 {T.tabRegles}</h3>
          {learnedRules.length === 0 ? (
            <p style={{ color: C.muted, textAlign: 'center', marginTop: 40 }}>{T.noRules}</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}`, color: C.muted }}>
                  <th style={th}>{T.rulePattern}</th>
                  <th style={th}>{T.ruleAccount}</th>
                  <th style={{ ...th, textAlign: 'center' }}>{T.ruleCount}</th>
                  <th style={th}>{T.ruleLastUsed}</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {learnedRules.map(rule => (
                  <tr key={rule.id} style={{ borderBottom: `1px solid ${C.divider}` }}>
                    <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>{rule.description_pattern}</td>
                    <td style={td}>{rule.account_number} {coaName(rule, 'coa_')}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <span style={{ color: rule.match_count >= 3 ? '#22c55e' : '#f59e0b', fontWeight: 700 }}>{rule.match_count}</span>
                      {rule.match_count >= 3 && <span style={{ color: '#22c55e', marginLeft: 4, fontSize: 11 }}>{T.autoLabel}</span>}
                    </td>
                    <td style={{ ...td, color: C.muted, fontSize: 12 }}>{fmtDate(rule.last_used_at)}</td>
                    <td style={td}>
                      <button onClick={() => deleteLearnedRule(rule.id)} style={btnSmallDanger}>{T.ruleDelete}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── PAY A SUPPLIER BILL ───────────────────────────────────────────────── */}
      {payingTx && (
        <ModalOverlay surface={C.card} edge={C.border} onClose={() => { setPayingTx(null); setPayError(''); }}>
          <h3 style={{ margin: '0 0 8px', color: C.text }}>{T.payBillTitle}</h3>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 12, lineHeight: 1.5 }}>{T.payBillHint}</div>
          <div style={{ fontSize: 12, color: C.sub, marginBottom: 10 }}>
            {fmtDate(payingTx.transaction_date)} · {payingTx.description} · <strong>{fmt(payingTx.amount)}</strong>
          </div>
          {payableBills.length === 0 ? (
            <p style={{ color: C.muted, fontSize: 12 }}>{T.payBillNone}</p>
          ) : (
            <>
              {payableBills.map(b => (
                <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: `1px solid ${C.divider}`, cursor: 'pointer' }}>
                  <input type="checkbox" checked={payPicked.includes(b.id)} onChange={() => togglePayBill(b.id)}
                    style={{ accentColor: '#f97316' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: C.text, fontWeight: 600 }}>{b.supplier_name}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{b.bill_date || ''} {b.invoice_number || ''}</div>
                  </div>
                  <div style={{ fontSize: 12.5, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{fmt(b.amount)}</div>
                </label>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                <span style={{ flex: 1, fontSize: 11.5, color: payTotalsAgree ? '#22c55e' : C.muted, fontVariantNumeric: 'tabular-nums' }}>
                  {T.payBillSelected(fmt(paySelectedCents / 100), fmt(Math.abs(payingTx.amount)))}
                </span>
                <button onClick={linkBillsToTx} disabled={!payTotalsAgree} style={{
                  ...btnSmall, opacity: payTotalsAgree ? 1 : 0.45, cursor: payTotalsAgree ? 'pointer' : 'default',
                }}>{T.payBillLink}</button>
              </div>
            </>
          )}
          {payError && <div style={{ marginTop: 8, fontSize: 11.5, color: '#f87171' }}>{payError}</div>}
        </ModalOverlay>
      )}

      {/* ── ACCOUNT MODAL ─────────────────────────────────────────────────────── */}
      {showAccountModal && (
        <ModalOverlay surface={C.card} edge={C.border} onClose={() => setShowAccountModal(false)}>
          <h3 style={{ margin: '0 0 16px', color: C.text }}>{editingAccount ? T.editAccount : T.addAccount}</h3>
          <label style={labelStyle}>{T.accountName}</label>
          <input style={inputFull} value={accountForm.name} onChange={e => setAccountForm(f => ({ ...f, name: e.target.value }))} />
          <label style={labelStyle}>{T.accountType}</label>
          <select style={inputFull} value={accountForm.account_type} onChange={e => setAccountForm(f => ({ ...f, account_type: e.target.value }))}>
            <option value='bank'>{T.typeBank}</option>
            <option value='credit_card'>{T.typeCC}</option>
            <option value='line_of_credit'>{T.typeLOC}</option>
          </select>
          <label style={labelStyle}>{T.coaAccount}</label>
          <CoaPicker
            accounts={coaList.filter(a => ['asset','liability'].includes(a.type))}
            value={accountForm.coa_account_id}
            onChange={v => setAccountForm(f => ({ ...f, coa_account_id: v }))}
            placeholder={T.searchCoa}
            nameOf={coaName}
            styles={pickerStyles}
          />
          <label style={labelStyle}>{owedAccount({ account_type: accountForm.account_type }) ? T.openingBalanceOwed : T.openingBalance}</label>
          <input style={inputFull} type='number' step='0.01' value={accountForm.opening_balance} onChange={e => setAccountForm(f => ({ ...f, opening_balance: e.target.value }))} />
          {owedAccount({ account_type: accountForm.account_type }) && (
            <div style={{ fontSize: 10.5, color: C.muted, marginTop: 3 }}>{T.openingHintOwed}</div>
          )}
          <label style={labelStyle}>{T.openingDate}</label>
          <input style={inputFull} type='date' value={accountForm.opening_date} onChange={e => setAccountForm(f => ({ ...f, opening_date: e.target.value }))} />
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button onClick={saveAccount} style={btnStyle('#f97316')}>{T.save}</button>
            <button onClick={() => setShowAccountModal(false)} style={btnStyle('#374151')}>{T.cancel}</button>
          </div>
        </ModalOverlay>
      )}

      {/* ── IMPORT MODAL ─────────────────────────────────────────────────────── */}
      {showImportModal && (
        <ModalOverlay surface={C.card} edge={C.border} onClose={() => setShowImportModal(false)}>
          <h3 style={{ margin: '0 0 16px', color: C.text }}>{T.importTitle}</h3>
          <label style={labelStyle}>{T.fileLabel}</label>
          <input ref={fileInputRef} type='file' accept='.csv,.ofx,.qfx,.qbo,.pdf'
            onChange={e => {
              const f = e.target.files?.[0] || null;
              setImportFile(f);
              setMapLines([]); setMapRoles([]); setPdfInfo(null); setPdfError('');
              if (f && isPdfFile(f)) readPdfFile(f, importAccountId);
              else if (f) prepareMapping(f, importAccountId);
            }}
            style={{ ...inputFull, padding: '6px 0', color: C.sub, background: 'none', border: 'none' }} />
          {importFile && mapLines.length === 0 && !isPdfFile(importFile) && (
            <div style={{ fontSize: 11, color: C.muted, margin: '6px 0 2px' }}>{T.mapAuto}</div>
          )}
          {(() => {
            const p = mapPreview();
            return (
              <ColumnMapper
                lines={mapLines} roles={mapRoles} hasHeader={mapHasHeader}
                options={roleOptions} onRoles={setMapRoles} onHasHeader={setMapHasHeader}
                labels={{ title: T.mapTitle, hint: T.mapHint, hasHeader: T.mapHasHeader, readsAs: T.mapReadsAs, columnLabel: T.roleColumn }}
                warnings={[
                  !mapRoles.includes('date') ? T.mapNeedDate : null,
                  mapRoles.includes('date') && !mapReady() ? T.mapNeedAmount : null,
                ]}
                C={{ text: C.text, sub: C.sub, muted: C.muted, border: C.border, divider: C.divider, inputBg: C.inputBg }}
                preview={p && (
                  <>
                    <strong style={{ color: p.date ? C.text : '#f87171' }}>{p.date || '?'}</strong>
                    {' \u00b7 '}<span style={{ color: C.text }}>{p.desc || '-'}</span>
                    {' \u00b7 '}<strong style={{ color: p.amount == null ? '#f87171' : (p.amount < 0 ? '#f87171' : '#86efac') }}>{p.amount == null ? '?' : fmt(p.amount)}</strong>
                  </>
                )}
              />
            );
          })()}
          {pdfBusy && <div style={{ fontSize: 12, color: C.sub, margin: '8px 0' }}>{T.pdfReading}</div>}
          {pdfError && <div style={{ fontSize: 12, color: '#fca5a5', margin: '8px 0', lineHeight: 1.5 }}>{pdfError}</div>}
          {pdfInfo && (() => {
            const st = pdfInfo.statement;
            const chk = pdfCheckNow();
            const money = (v) => (v == null ? '-' : fmt(v));
            const rowsNow = pdfRows();
            return (
              <div style={{ margin: '10px 0 4px' }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>{T.pdfTitle}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 11.5, color: C.sub, margin: '4px 0 2px' }}>
                  <span>{T.pdfPeriod}: <strong style={{ color: C.text }}>{st.period.start ? fmtDate(st.period.start) : '?'} {'\u2192'} {st.period.end ? fmtDate(st.period.end) : '?'}</strong></span>
                  <span>{T.pdfOpening}: <strong style={{ color: C.text }}>{money(st.opening)}</strong></span>
                  <span>{T.pdfClosing}: <strong style={{ color: C.text }}>{money(st.closing)}</strong></span>
                  <span>{T.pdfLines(rowsNow.length)}</span>
                </div>
                <div style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.5, color: chk?.ok ? '#86efac' : chk?.ok === false ? '#f87171' : '#f59e0b' }}>
                  {chk?.ok ? T.pdfCheckOk : chk?.ok === false ? T.pdfCheckOff(fmt(Math.abs(chk.gap))) : T.pdfCheckNone}
                </div>
                {chk?.ok === false && st.printed.purchases != null && st.printed.payments != null && (
                  <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>
                    {T.pdfCheckSides(fmt(st.found.purchases), fmt(st.printed.purchases), fmt(st.found.payments), fmt(st.printed.payments))}
                  </div>
                )}
                {pdfInfo.check?.overlap && (
                  <div style={{ fontSize: 11.5, color: '#f87171', marginTop: 6, lineHeight: 1.5 }}>
                    {T.pdfOverlap(fmtDate(pdfInfo.check.overlap.periodStart), fmtDate(pdfInfo.check.overlap.periodEnd), pdfInfo.check.overlap.reconciled)}
                  </div>
                )}
                {pdfInfo.check?.alreadyInBooks > 0 && (
                  <div style={{ fontSize: 11.5, color: '#f59e0b', marginTop: 4 }}>{T.pdfAlready(pdfInfo.check.alreadyInBooks)}</div>
                )}
                <ColumnMapper
                  lines={st.table} roles={pdfRoles} hasHeader={false}
                  options={roleOptions} onRoles={setPdfRoles}
                  included={pdfIncluded} onIncluded={setPdfIncluded} maxHeight={260}
                  labels={{ title: null, hint: T.pdfHint, columnLabel: T.roleColumn, includeLabel: T.pdfInclude }}
                  C={{ text: C.text, sub: C.sub, muted: C.muted, border: C.border, divider: C.divider, inputBg: C.inputBg }}
                  warnings={[!pdfRoles.includes('date') ? T.mapNeedDate : null,
                    pdfRoles.includes('date') && !(pdfRoles.includes('amount') || pdfRoles.includes('debit') || pdfRoles.includes('credit')) ? T.mapNeedAmount : null]}
                />
                {(chk?.ok === false || pdfInfo.check?.overlap) && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 11.5, color: C.sub, cursor: 'pointer' }}>
                    <input type='checkbox' checked={pdfForce} onChange={e => setPdfForce(e.target.checked)} style={{ accentColor: '#f97316' }} />
                    {T.pdfForce}
                  </label>
                )}
              </div>
            );
          })()}
          <label style={labelStyle}>{T.periodStart} ({T.optional})</label>
          <input style={inputFull} type='date' value={importPeriodStart} onChange={e => setImportPeriodStart(e.target.value)} />
          <label style={labelStyle}>{T.periodEnd} ({T.optional})</label>
          <input style={inputFull} type='date' value={importPeriodEnd} onChange={e => setImportPeriodEnd(e.target.value)} />
          <label style={labelStyle}>{owedAccount(accounts.find(a => a.id === importAccountId)) ? T.endingBalanceOwed : T.endingBalance} ({T.optional})</label>
          <input style={inputFull} type='number' step='0.01' placeholder={T.openingBalance2} value={importEndBal} onChange={e => setImportEndBal(e.target.value)} />
          {importMsg && (
            <div style={{ marginTop: 10, padding: '8px 12px', background: importOk === false ? '#450a0a' : '#052e16', borderRadius: 6, fontSize: 13, color: importOk === false ? '#fca5a5' : '#86efac' }}>
              {importMsg}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            {importOk === true ? (
              <button onClick={closeImportModal} style={btnStyle('#22c55e')}>{T.done}</button>
            ) : (
              <>
                <button onClick={handleImport} disabled={!importFile || importing || !mapReady() || (isPdfFile(importFile) && !pdfReady())} style={btnStyle('#f97316')}>{importing ? T.importing : T.importBtn}</button>
                <button onClick={closeImportModal} style={btnStyle('#374151')}>{T.cancel}</button>
              </>
            )}
          </div>
        </ModalOverlay>
      )}

      {/* ── CATEGORIZE MODAL ─────────────────────────────────────────────────── */}
      {categorizingTx && (
        <ModalOverlay surface={C.card} edge={C.border} onClose={() => setCategorizingTx(null)}>
          <h3 style={{ margin: '0 0 10px', color: C.text }}>{T.categorize}</h3>
          <div style={{ fontSize: 13, color: C.sub, marginBottom: 14 }}>
            <strong style={{ color: C.text }}>{categorizingTx.description}</strong><br />
            {fmtDate(categorizingTx.transaction_date)} · <span style={{ color: categorizingTx.amount < 0 ? '#f87171' : '#86efac', fontWeight: 700 }}>{fmt(categorizingTx.amount)}</span>
          </div>
          {coaName(categorizingTx, 'coa_') && (
            <div style={{ marginBottom: 10, fontSize: 12, color: '#f59e0b' }}>{T.suggestedCoa(coaName(categorizingTx, 'coa_'))}</div>
          )}
          {billMatches.length > 0 && !billMatchDismissed && (
            <div style={{ marginBottom: 12, background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.35)',
              borderRadius: 6, padding: '10px 12px', fontSize: 11.5, color: '#fdba74', lineHeight: 1.5 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{T.billMatchTitle}</div>
              <div style={{ color: C.muted }}>{T.billMatchBody(billMatches.map(b => b.supplier_name).join(', '))}</div>
              <div style={{ display: 'flex', gap: 7, marginTop: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => { const tx = categorizingTx; setCategorizingTx(null); openPayBill(tx); }}
                  style={{ ...btnSmall, fontSize: 11 }}>{T.billMatchLink}</button>
                <button type="button" onClick={() => setBillMatchDismissed(true)}
                  style={{ ...btnSmall, fontSize: 11 }}>{T.billMatchIgnore}</button>
              </div>
            </div>
          )}
          {categorizingTx.etSender && (
            <div style={{ marginBottom: 12, padding: '6px 10px', background: 'rgba(167,139,250,0.07)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: 6 }}>
              <span style={{ fontSize: 11, color: C.sub }}>{T.etransferSender}: </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#a78bfa' }}>{categorizingTx.etSender}</span>
              <span style={{ marginLeft: 8, fontSize: 11, color: C.sub }}>
                ({Number(categorizingTx.amount) >= 0 ? T.etransferDirIn : T.etransferDirOut})
              </span>
            </div>
          )}
          <label style={labelStyle}>{T.selectCoa}</label>
          <CoaPicker
            accounts={coaList}
            value={categorizeCoaId}
            onChange={setCategorizeCoaId}
            placeholder={T.searchCoa}
            nameOf={coaName}
            styles={pickerStyles}
          />
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '12px 0 4px', cursor: 'pointer' }}>
            <input type="checkbox" checked={catTransfer} onChange={e => setCatTransfer(e.target.checked)}
              style={{ accentColor: '#f97316', marginTop: 3 }} />
            <span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>{T.transferLabel}</span>
              <span style={{ display: 'block', fontSize: 10.5, color: C.muted, lineHeight: 1.45, marginTop: 2 }}>{T.transferHint}</span>
            </span>
          </label>

          <label style={labelStyle}>{T.notes}</label>
          <input style={inputFull} value={categorizeNotes} onChange={e => setCategorizeNotes(e.target.value)} />

          {(() => {
            // A laptop categorized to IT expenses is written off in full this
            // year instead of being capitalized and deducted through CCA, and
            // nothing used to say a word about it. Only the accounts a capital
            // purchase actually hides in are watched: flagging every large
            // expense would fire on rent and payroll and be ignored within a week.
            const chosen = coaList.find(a => String(a.id) === String(categorizeCoaId));
            if (catTransfer || capexDismissed || !looksLikeCapitalPurchase(categorizingTx.amount, chosen)) return null;
            const amt = Math.abs(Number(categorizingTx.amount) || 0).toLocaleString(
              lang === 'en' ? 'en-CA' : 'fr-CA', { style: 'currency', currency: 'CAD' });
            return (
              <div style={{ marginTop: 14, background: 'rgba(96,165,250,0.07)', border: '1px solid rgba(96,165,250,0.3)',
                borderRadius: 6, padding: '10px 12px', fontSize: 11.5, color: '#93c5fd', lineHeight: 1.5 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>{T.capexTitle}</div>
                <div style={{ color: C.muted }}>{T.capexBody(amt)}</div>
                <div style={{ color: C.muted, marginTop: 5 }}>{T.capexHow}</div>
                <div style={{ display: 'flex', gap: 7, marginTop: 7, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => setCapexGuideOpen(true)}
                    style={{ ...btnSmall, fontSize: 11 }}>{T.capexLearn}</button>
                  <button type="button" onClick={() => setCapexDismissed(true)}
                    style={{ ...btnSmall, fontSize: 11 }}>{T.capexDismiss}</button>
                </div>
              </div>
            );
          })()}

          {/* Input tax credits are tax PAID, so this only applies to money going
              out. On a receipt the sales tax was already recorded when the
              invoice was raised, and capturing it again would double-count. */}
          {Number(categorizingTx.amount) < 0 && !catTransfer ? (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>{T.taxCaptureTitle}</label>
              <button
                type="button"
                onClick={() => {
                  const gross = Math.abs(Number(categorizingTx.amount) || 0);
                  const net = gross / 1.14975;
                  setCatTps((net * 0.05).toFixed(2));
                  setCatTvq((net * 0.09975).toFixed(2));
                }}
                style={{ ...btnSmall, fontSize: 11 }}
              >{T.taxAutoFill}</button>
            </div>
            <div style={{ fontSize: 10.5, color: C.muted, margin: '4px 0 2px' }}>{T.taxCaptureHint}</div>
            <div style={{ fontSize: 10, color: C.muted, fontStyle: 'italic', margin: '0 0 8px' }}>{T.taxAutoFillHint}</div>
            {(() => {
              // A restricted account claims only part of the tax paid. Showing the
              // claimable figure here means nobody has to know the rule, or do the
              // arithmetic, to get the filing right.
              const chosen = coaList.find(a => String(a.id) === String(categorizeCoaId));
              const pct = chosen?.itc_pct == null ? 100 : Number(chosen.itc_pct);
              if (pct === 100) return null;
              const money = (v) => ((parseFloat(v) || 0) * pct / 100).toLocaleString(
                lang === 'en' ? 'en-CA' : 'fr-CA', { style: 'currency', currency: 'CAD' });
              return (
                <div style={{ fontSize: 10.5, color: '#a1791f', background: 'rgba(251,191,36,0.08)',
                  border: '1px solid rgba(251,191,36,0.25)', borderRadius: 5, padding: '6px 9px', margin: '0 0 8px', lineHeight: 1.45 }}>
                  {T.taxRestricted(pct, money(catTps), money(catTvq))}
                  <div style={{ marginTop: 3, opacity: 0.85 }}>{T.taxRestrictedWhy}</div>
                </div>
              );
            })()}
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>{T.taxTps}</div>
                <input style={inputFull} type="number" step="0.01" min="0" placeholder="0.00"
                  value={catTps} onChange={e => setCatTps(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>{T.taxTvq}</div>
                <input style={inputFull} type="number" step="0.01" min="0" placeholder="0.00"
                  value={catTvq} onChange={e => setCatTvq(e.target.value)} />
              </div>
            </div>
          </div>
          ) : (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}`, fontSize: 11, color: C.muted }}>
              {T.taxInflowNote}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={saveCategorize} disabled={!categorizeCoaId} style={btnStyle('#f97316')}>{T.saveCategorize}</button>
            <button onClick={() => setCategorizingTx(null)} style={btnStyle('#374151')}>{T.cancel}</button>
          </div>
        </ModalOverlay>
      )}

      {/* ── E-TRANSFER MATCH MODAL ──────────────────────────────────────────── */}

      {/* ── REOPEN MODAL ─────────────────────────────────────────────────────── */}
      {showReopenModal && (
        <ModalOverlay surface={C.card} edge={C.border} onClose={() => setShowReopenModal(null)}>
          <h3 style={{ margin: '0 0 14px', color: C.text }}>{T.reopenRec}</h3>
          <label style={labelStyle}>{T.reopenReason}</label>
          <input style={inputFull} value={reopenReason} onChange={e => setReopenReason(e.target.value)} />
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={reopenReconciliation} disabled={!reopenReason.trim()} style={btnStyle('#f97316')}>{T.confirm}</button>
            <button onClick={() => setShowReopenModal(null)} style={btnStyle('#374151')}>{T.cancel}</button>
          </div>
        </ModalOverlay>
      )}

      {capexGuideOpen && <CapexGuide lang={lang} onClose={() => setCapexGuideOpen(false)} />}
    </div>
  );
}


// ── CoaPicker ─────────────────────────────────────────────────────────────────
// Type-ahead account picker. Matches on account number AND name in both
// languages, so "6110", "hydro" and "electricity" all find the same account.
function CoaPicker({ accounts, value, onChange, placeholder, nameOf, styles }) {
  const { inputFull, labelMuted, panel, border, hi } = styles;
  const [query, setQuery]   = React.useState('');
  const [open, setOpen]     = React.useState(false);
  const [active, setActive] = React.useState(0);
  const boxRef = React.useRef(null);

  const selected = accounts.find(a => String(a.id) === String(value)) || null;

  React.useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const q = query.trim().toLowerCase();
  const matches = !q ? accounts : accounts.filter(a =>
    String(a.account_number).toLowerCase().includes(q)
    || (a.name_fr || '').toLowerCase().includes(q)
    || (a.name_en || '').toLowerCase().includes(q)
  );

  const commit = (acc) => {
    onChange(acc ? String(acc.id) : '');
    setQuery(''); setOpen(false); setActive(0);
  };

  const onKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, matches.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter')  { e.preventDefault(); if (matches[active]) commit(matches[active]); }
    else if (e.key === 'Escape') { setOpen(false); setQuery(''); }
  };

  const display = open ? query : (selected ? `${selected.account_number} - ${nameOf(selected)}` : '');

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input
        style={inputFull}
        value={display}
        placeholder={placeholder}
        onChange={e => { setQuery(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {selected && !open && (
        <button
          type="button"
          onClick={() => commit(null)}
          aria-label="Clear"
          style={{ position: 'absolute', right: 8, top: 6, background: 'none', border: 'none',
                   color: labelMuted, cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: 2 }}
        >x</button>
      )}
      {open && (
        <div style={{ position: 'absolute', zIndex: 30, left: 0, right: 0, top: '100%', marginTop: 4,
                      maxHeight: 240, overflowY: 'auto', background: panel,
                      border: `1px solid ${border}`, borderRadius: 6,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.28)' }}>
          {matches.length === 0 ? (
            <div style={{ padding: '9px 12px', fontSize: 12.5, color: labelMuted }}>-</div>
          ) : matches.map((a, i) => (
            <div
              key={a.id}
              onMouseDown={e => { e.preventDefault(); commit(a); }}
              onMouseEnter={() => setActive(i)}
              style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                       display: 'flex', gap: 10, alignItems: 'baseline',
                       background: i === active ? hi : 'transparent' }}
            >
              <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, opacity: 0.75, minWidth: 38 }}>
                {a.account_number}
              </span>
              <span>{nameOf(a)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── ModalOverlay ──────────────────────────────────────────────────────────────
function ModalOverlay({ children, onClose, surface = '#0f1724', edge = '#1e293b' }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: surface, border: `1px solid ${edge}`, borderRadius: 10, padding: '24px 28px', minWidth: 360, maxWidth: 520, width: '90vw', maxHeight: '85vh', overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const btnStyle = (bg, fontSize = 13) => ({
  background: bg, color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px',
  cursor: 'pointer', fontWeight: 600, fontSize,
});
const btnSmallDanger= { background: '#450a0a', color: '#fca5a5', border: 'none', borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontSize: 12 };

const labelStyle    = { display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 };

