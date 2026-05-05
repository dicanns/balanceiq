import React, { useState } from 'react';

export const LAW25_SECTIONS = [
  {
    id: 'law25',
    titleFr: 'Loi 25 — Protection des renseignements personnels',
    titleEn: 'Law 25 — Personal Information Protection',
    icon: '🔒',
    bodyFr: [
      'BalanceIQ est conforme à la Loi modernisant des dispositions législatives en matière de protection des renseignements personnels (Loi 25, Québec).',
      'Résidence des données : les données opérationnelles (fermetures, P&L, inventaire) sont stockées localement sur votre appareil (SQLite). Les données infonuagiques optionnelles (facturation, documents réseau, authentification) sont hébergées sur des serveurs Supabase situés à Montréal (Québec), au Canada.',
      'Immuabilité du journal d\'audit : chaque modification comptable est enregistrée de façon permanente dans le journal d\'audit intégré. Ces entrées ne peuvent être supprimées.',
      'Consentement : la synchronisation infonuagique est optionnelle. Aucune donnée personnelle n\'est transmise sans configuration explicite dans Paramètres → Intégrations.',
    ],
    bodyEn: [
      'BalanceIQ complies with the Act to modernize legislative provisions as regards the protection of personal information (Law 25, Quebec).',
      'Data residency: operational data (close sessions, P&L, inventory) is stored locally on your device (SQLite). Optional cloud data (invoicing, network documents, authentication) is hosted on Supabase servers located in Montreal, Quebec, Canada.',
      'Audit log immutability: every accounting modification is permanently recorded in the built-in audit log. These entries cannot be deleted.',
      'Consent: cloud sync is optional. No personal data is transmitted without explicit configuration in Settings → Integrations.',
    ],
  },
  {
    id: 'data-residency',
    titleFr: 'Hébergement des données',
    titleEn: 'Data Hosting',
    icon: '🗄️',
    bodyFr: [
      'Données locales uniquement (sur votre appareil) :',
      '- Quotidien, P&L mensuel, inventaire, fermetures de caisse',
      '- Grand livre, plan comptable, banque, bilan',
      '- Coffre-fort de pièces justificatives',
      '- Journal d\'audit, instantanés, sauvegardes locales',
      '',
      'Données infonuagiques (Supabase Montréal, optionnel) :',
      '- Facturation et encaissements (si synchronisation activée)',
      '- Documents réseau partagés avec le franchiseur',
      '- Authentification et gestion des accès',
    ],
    bodyEn: [
      'Local-only data (on your device):',
      '- Daily tab, monthly P&L, inventory, close sessions',
      '- General ledger, chart of accounts, bank, balance sheet',
      '- Vault of supporting documents',
      '- Audit log, snapshots, local backups',
      '',
      'Cloud data (Supabase Montreal, optional):',
      '- Invoicing and payments (if sync enabled)',
      '- Network documents shared with franchisor',
      '- Authentication and access management',
    ],
  },
  {
    id: 'retention',
    titleFr: 'Politique de conservation des documents',
    titleEn: 'Document Retention Policy',
    icon: '📁',
    bodyFr: [
      'Coffre-fort de pièces justificatives : conservé de façon permanente pendant la durée de vie du profil. L\'ARC recommande 6 ans; BalanceIQ ne supprime aucun document automatiquement.',
      'Journal d\'audit : conservé de façon permanente. Non modifiable.',
      'Instantanés de bilan : 12 derniers mois conservés automatiquement. Les instantanés plus anciens sont archivés lors de la génération du dossier de fin d\'année.',
      'Sauvegardes locales : gérées par votre système d\'exploitation. BalanceIQ recommande de conserver au moins 3 sauvegardes mensuelles.',
      'Période de prescription fiscale CRA/ARC : 6 ans à compter de la date de la déclaration. Conservez tous les documents justificatifs de CTI/RTI pendant cette période.',
    ],
    bodyEn: [
      'Vault supporting documents: retained permanently for the lifetime of the profile. CRA recommends 6 years; BalanceIQ does not auto-delete any document.',
      'Audit log: retained permanently. Not editable.',
      'Balance sheet snapshots: last 12 months retained automatically. Older snapshots are archived during year-end package generation.',
      'Local backups: managed by your operating system. BalanceIQ recommends keeping at least 3 monthly backups.',
      'CRA tax limitation period: 6 years from the date of filing. Retain all ITC/ITR supporting documents for this period.',
    ],
  },
  {
    id: 'audit-policy',
    titleFr: 'Politique d\'audit et de corrections',
    titleEn: 'Audit and Correction Policies',
    icon: '📋',
    bodyFr: [
      'Toute correction apportée à une entrée comptable enregistrée est tracée : qui a modifié, quand, et quelle valeur a été remplacée.',
      'Les entrées de grand livre approuvées ne peuvent pas être supprimées — elles sont inversées (écriture de contrepartie) et une nouvelle entrée corrigée est créée. La piste d\'audit reste complète.',
      'Les fermetures de caisse approuvées requièrent une autorisation de gestion pour être rouvertes. Toute réouverture est enregistrée dans le journal de fermeture.',
      'La politique d\'identité locale (NIP gestionnaire) est configurable dans Configuration → Politique de fermeture.',
    ],
    bodyEn: [
      'Any correction made to a recorded accounting entry is traced: who modified it, when, and what value was replaced.',
      'Approved general ledger entries cannot be deleted — they are reversed (contra entry) and a new corrected entry is created. The audit trail remains complete.',
      'Approved close sessions require management authorization to reopen. Every reopening is recorded in the close log.',
      'The local identity policy (manager PIN) is configurable in Settings → Close Policy.',
    ],
  },
];

const sectionStyle = {
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  marginBottom: 10,
  overflow: 'hidden',
};

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '11px 14px',
  cursor: 'pointer',
  background: '#f8fafc',
  userSelect: 'none',
};

const bodyStyle = {
  padding: '12px 16px',
  borderTop: '1px solid #e2e8f0',
  background: '#fff',
};

export default function SettingsAboutPanel({ lang }) {
  const fr = lang !== 'en';
  const [open, setOpen] = useState({ law25: true });

  function toggle(id) {
    setOpen(o => ({ ...o, [id]: !o[id] }));
  }

  return (
    <div style={{ maxWidth: 680, padding: '4px 0' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
        {fr ? 'Conformité légale et confidentialité' : 'Legal Compliance and Privacy'}
      </div>
      <div style={{ fontSize: 11, color: '#475569', marginBottom: 16, lineHeight: 1.5 }}>
        {fr
          ? 'Comment BalanceIQ protège vos données et respecte vos obligations légales au Canada.'
          : 'How BalanceIQ protects your data and meets your legal obligations in Canada.'}
      </div>

      {LAW25_SECTIONS.map(s => {
        const title = fr ? s.titleFr : s.titleEn;
        const body = fr ? s.bodyFr : s.bodyEn;
        const isOpen = open[s.id];

        return (
          <div key={s.id} style={sectionStyle}>
            <div style={headerStyle} onClick={() => toggle(s.id)}>
              <span style={{ fontSize: 18 }}>{s.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', flex: 1 }}>{title}</span>
              <span style={{ fontSize: 14, color: '#94a3b8', fontWeight: 700 }}>
                {isOpen ? '−' : '+'}
              </span>
            </div>

            {isOpen && (
              <div style={bodyStyle}>
                {body.map((line, i) => (
                  line === ''
                    ? <div key={i} style={{ height: 8 }} />
                    : <div key={i} style={{
                        fontSize: 11,
                        color: line.startsWith('-') ? '#475569' : '#334155',
                        lineHeight: 1.65,
                        paddingLeft: line.startsWith('-') ? 12 : 0,
                        marginBottom: 4,
                      }}>
                        {line}
                      </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div style={{
        marginTop: 16,
        padding: '10px 14px',
        borderRadius: 8,
        background: 'rgba(249,115,22,0.04)',
        border: '1px solid rgba(249,115,22,0.15)',
        fontSize: 10,
        color: '#64748b',
        lineHeight: 1.6,
      }}>
        {fr
          ? 'Cette page est à titre informatif. Pour toute question relative à la conformité fiscale ou juridique, consultez votre comptable ou conseiller juridique.'
          : 'This page is for informational purposes. For questions about tax or legal compliance, consult your accountant or legal advisor.'}
      </div>
    </div>
  );
}
