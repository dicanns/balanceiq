import { useState, useCallback } from 'react';

const STYLES = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: '#08090E',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    fontFamily: "'DM Sans', system-ui, sans-serif",
    padding: '16px',
  },
  card: {
    background: '#111218',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '16px',
    padding: '32px',
    width: '100%',
    maxWidth: '480px',
    color: '#E8E8EC',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '28px',
  },
  logoBadge: {
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #f97316, #ea580c)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '13px',
    fontWeight: '700',
    color: '#fff',
    fontFamily: "'DM Mono', monospace",
    letterSpacing: '0.5px',
  },
  logoText: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#E8E8EC',
    letterSpacing: '-0.3px',
  },
  progressRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '28px',
  },
  progressLabel: {
    fontSize: '12px',
    color: '#6B7080',
    marginLeft: 'auto',
    fontFamily: "'DM Mono', monospace",
  },
  dot: (state) => ({
    width: state === 'current' ? '20px' : '8px',
    height: '8px',
    borderRadius: '4px',
    background: state === 'current'
      ? '#F97316'
      : state === 'done'
        ? 'rgba(249,115,22,0.4)'
        : 'rgba(255,255,255,0.12)',
    transition: 'all 0.2s ease',
  }),
  stepTitle: {
    fontSize: '22px',
    fontWeight: '700',
    color: '#E8E8EC',
    marginBottom: '6px',
    letterSpacing: '-0.4px',
  },
  stepDesc: {
    fontSize: '14px',
    color: '#6B7080',
    marginBottom: '24px',
    lineHeight: '1.5',
  },
  btnPrimary: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    background: 'linear-gradient(135deg, #f97316, #ea580c)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '11px 20px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: "'DM Sans', system-ui, sans-serif",
    width: '100%',
    marginTop: '8px',
  },
  btnSecondary: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255,255,255,0.05)',
    color: '#E8E8EC',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    padding: '9px 16px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    fontFamily: "'DM Sans', system-ui, sans-serif",
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: '20px',
    gap: '12px',
  },
  label: {
    display: 'block',
    fontSize: '12px',
    fontWeight: '600',
    color: '#6B7080',
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
    marginBottom: '6px',
  },
  input: {
    width: '100%',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    padding: '10px 12px',
    color: '#E8E8EC',
    fontSize: '14px',
    fontFamily: "'DM Sans', system-ui, sans-serif",
    outline: 'none',
    boxSizing: 'border-box',
  },
  fieldGroup: {
    marginBottom: '16px',
  },
};

const RESTAURANT_TYPES = [
  { key: 'qsr',      icon: '🍔', labelFr: 'Restaurant / QSR',    labelEn: 'Restaurant / QSR' },
  { key: 'cafe',     icon: '☕', labelFr: 'Café / Boulangerie',   labelEn: 'Café / Bakery' },
  { key: 'bar',      icon: '🍺', labelFr: 'Bar',                  labelEn: 'Bar' },
  { key: 'salon',    icon: '💇', labelFr: 'Salon / Spa',          labelEn: 'Salon / Spa' },
  { key: 'retail',   icon: '🛍️', labelFr: 'Commerce (Détail)',    labelEn: 'Retail' },
  { key: 'other',    icon: '🍽️', labelFr: 'Autre',                labelEn: 'Other' },
];

// Step 1
function StepType({ lang, companyInfo, saveCompanyInfo, onNext }) {
  const [selected, setSelected] = useState(companyInfo.restaurantType || null);

  const handleSelect = useCallback((key) => {
    setSelected(key);
    saveCompanyInfo({ ...companyInfo, restaurantType: key });
    setTimeout(() => onNext(), 300);
  }, [companyInfo, saveCompanyInfo, onNext]);

  return (
    <div>
      <div style={STYLES.stepTitle}>
        {lang === 'fr' ? 'Quel type de restaurant?' : 'What type of restaurant?'}
      </div>
      <div style={STYLES.stepDesc}>
        {lang === 'fr'
          ? 'Cela aide à pré-configurer vos catégories et étiquettes.'
          : 'This helps pre-configure categories and labels.'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        {RESTAURANT_TYPES.map((t) => {
          const isSelected = selected === t.key;
          return (
            <button
              key={t.key}
              onClick={() => handleSelect(t.key)}
              style={{
                background: isSelected
                  ? 'linear-gradient(135deg, rgba(249,115,22,0.18), rgba(234,88,12,0.12))'
                  : 'rgba(255,255,255,0.03)',
                border: isSelected
                  ? '1px solid rgba(249,115,22,0.5)'
                  : '1px solid rgba(255,255,255,0.08)',
                borderRadius: '10px',
                padding: '14px 12px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: '6px',
                transition: 'all 0.15s ease',
                fontFamily: "'DM Sans', system-ui, sans-serif",
              }}
            >
              <span style={{ fontSize: '22px', lineHeight: 1 }}>{t.icon}</span>
              <span style={{ fontSize: '13px', fontWeight: '500', color: isSelected ? '#F97316' : '#E8E8EC', textAlign: 'left', lineHeight: '1.3' }}>
                {lang === 'fr' ? t.labelFr : t.labelEn}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Step 2
function StepInfo({ lang, companyInfo, saveCompanyInfo, onNext, onBack }) {
  const [nom, setNom] = useState(companyInfo.nom || '');
  const [ville, setVille] = useState(companyInfo.ville || '');

  const handleContinue = useCallback(() => {
    saveCompanyInfo({ ...companyInfo, nom: nom.trim(), ville: ville.trim() });
    onNext();
  }, [companyInfo, nom, ville, saveCompanyInfo, onNext]);

  return (
    <div>
      <div style={STYLES.stepTitle}>
        {lang === 'fr' ? 'Informations de base' : 'Basic information'}
      </div>
      <div style={STYLES.stepDesc}>
        {lang === 'fr'
          ? 'Ces informations apparaîtront sur vos rapports et factures.'
          : 'This information will appear on your reports and invoices.'}
      </div>

      <div style={STYLES.fieldGroup}>
        <label style={STYLES.label}>
          {lang === 'fr' ? 'Nom du restaurant' : 'Restaurant name'}
        </label>
        <input
          style={STYLES.input}
          type="text"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder={lang === 'fr' ? 'Ex: Chez Martin' : 'e.g. Martin\'s Grill'}
        />
      </div>

      <div style={STYLES.fieldGroup}>
        <label style={STYLES.label}>
          {lang === 'fr' ? 'Ville' : 'City'}
        </label>
        <input
          style={STYLES.input}
          type="text"
          value={ville}
          onChange={(e) => setVille(e.target.value)}
          placeholder={lang === 'fr' ? 'Ex: Montréal, QC' : 'e.g. Montreal, QC'}
        />
      </div>

      <div style={STYLES.fieldGroup}>
        <label style={STYLES.label}>
          {lang === 'fr' ? 'Langue de l\'interface' : 'Interface language'}
        </label>
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '8px',
          padding: '10px 12px',
          fontSize: '14px',
          color: '#6B7080',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <span style={{ fontSize: '16px' }}>{lang === 'fr' ? '🇫🇷' : '🇬🇧'}</span>
          <span>{lang === 'fr' ? 'Français' : 'English'}</span>
          <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#444', fontFamily: "'DM Mono', monospace" }}>
            {lang === 'fr' ? 'Modifiable dans Config' : 'Change in Config'}
          </span>
        </div>
      </div>

      <div style={STYLES.footer}>
        <button style={STYLES.btnSecondary} onClick={onBack}>
          ← {lang === 'fr' ? 'Retour' : 'Back'}
        </button>
        <button
          style={{ ...STYLES.btnPrimary, width: 'auto', flex: 1 }}
          onClick={handleContinue}
          disabled={!nom.trim()}
        >
          {lang === 'fr' ? 'Continuer' : 'Continue'} →
        </button>
      </div>
    </div>
  );
}

// Step 3
function StepRegisters({ lang, roster, saveRoster, onNext, onBack }) {
  const currentCount = roster && roster.length > 0 ? roster.length : null;
  const [count, setCount] = useState(currentCount);

  const handleSelect = useCallback((n) => {
    setCount(n);
    const newRoster = Array.from({ length: n }, (_, i) => `Caisse ${i + 1}`);
    saveRoster(newRoster);
  }, [saveRoster]);

  return (
    <div>
      <div style={STYLES.stepTitle}>
        {lang === 'fr' ? 'Vos caisses' : 'Your registers'}
      </div>
      <div style={STYLES.stepDesc}>
        {lang === 'fr'
          ? 'La plupart des restaurants ont 1–2 caisses.'
          : 'Most restaurants have 1–2 registers.'}
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        {[1, 2, 3, 4, 5].map((n) => {
          const isSelected = count === n;
          return (
            <button
              key={n}
              onClick={() => handleSelect(n)}
              style={{
                flex: 1,
                aspectRatio: '1',
                background: isSelected
                  ? 'linear-gradient(135deg, #f97316, #ea580c)'
                  : 'rgba(255,255,255,0.04)',
                border: isSelected
                  ? '1px solid transparent'
                  : '1px solid rgba(255,255,255,0.08)',
                borderRadius: '10px',
                color: isSelected ? '#fff' : '#E8E8EC',
                fontSize: '22px',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px 0',
                fontFamily: "'DM Mono', monospace",
                transition: 'all 0.15s ease',
              }}
            >
              {n}
            </button>
          );
        })}
      </div>

      {count && (
        <div style={{
          background: 'rgba(34,197,94,0.08)',
          border: '1px solid rgba(34,197,94,0.2)',
          borderRadius: '8px',
          padding: '12px 14px',
          fontSize: '13px',
          color: '#22C55E',
          marginBottom: '4px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <span>✓</span>
          <span>
            {lang === 'fr'
              ? `${count} caisse${count > 1 ? 's' : ''} configurée${count > 1 ? 's' : ''}`
              : `${count} register${count > 1 ? 's' : ''} configured`}
            {' — '}
            {Array.from({ length: count }, (_, i) => `Caisse ${i + 1}`).join(', ')}
          </span>
        </div>
      )}

      <div style={STYLES.footer}>
        <button style={STYLES.btnSecondary} onClick={onBack}>
          ← {lang === 'fr' ? 'Retour' : 'Back'}
        </button>
        <button
          style={{ ...STYLES.btnPrimary, width: 'auto', flex: 1, opacity: count ? 1 : 0.4, cursor: count ? 'pointer' : 'not-allowed' }}
          onClick={onNext}
          disabled={!count}
        >
          {lang === 'fr' ? 'Continuer' : 'Continue'} →
        </button>
      </div>
    </div>
  );
}

// Step 4
function StepDemo({ lang, onNext, onBack }) {
  return (
    <div>
      <div style={STYLES.stepTitle}>
        {lang === 'fr' ? 'Votre premier jour équilibré' : 'Your first balanced day'}
      </div>
      <div style={STYLES.stepDesc}>
        {lang === 'fr'
          ? 'Chaque jour, vous entrerez les lectures POS et le comptage manuel — BalanceIQ détecte automatiquement tout écart.'
          : 'Each day, enter POS readings and your manual count — BalanceIQ automatically flags any discrepancy.'}
      </div>

      {/* Demo card */}
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '20px',
      }}>
        <div style={{ fontSize: '12px', fontWeight: '600', color: '#6B7080', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '16px' }}>
          {lang === 'fr' ? 'Caisse 1 — Exemple' : 'Register 1 — Example'}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#6B7080' }}>
              {lang === 'fr' ? 'Total POS' : 'POS Total'}
            </span>
            <span style={{ fontSize: '16px', fontWeight: '600', color: '#E8E8EC', fontFamily: "'DM Mono', monospace" }}>
              $1,247.50
            </span>
          </div>
          <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#6B7080' }}>
              {lang === 'fr' ? 'Comptage manuel' : 'Manual count'}
            </span>
            <span style={{ fontSize: '16px', fontWeight: '600', color: '#E8E8EC', fontFamily: "'DM Mono', monospace" }}>
              $1,247.50
            </span>
          </div>
          <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#6B7080' }}>
              {lang === 'fr' ? 'Statut' : 'Status'}
            </span>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(34,197,94,0.12)',
              border: '1px solid rgba(34,197,94,0.25)',
              borderRadius: '20px',
              padding: '4px 12px',
            }}>
              <span style={{ fontSize: '12px', color: '#22C55E' }}>✓</span>
              <span style={{ fontSize: '12px', fontWeight: '600', color: '#22C55E' }}>
                {lang === 'fr' ? 'Balancé' : 'Balanced'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div style={{
        background: 'rgba(249,115,22,0.08)',
        border: '1px solid rgba(249,115,22,0.2)',
        borderRadius: '10px',
        padding: '14px 16px',
        fontSize: '13px',
        color: '#F97316',
        lineHeight: '1.5',
        marginBottom: '4px',
      }}>
        <span style={{ fontWeight: '600', display: 'block', marginBottom: '4px' }}>
          {lang === 'fr' ? 'Voilà!' : 'There you go!'}
        </span>
        {lang === 'fr'
          ? 'BalanceIQ signale automatiquement les écarts entre votre caisse et votre POS.'
          : 'BalanceIQ automatically flags discrepancies between your drawer and your POS.'}
      </div>

      <div style={STYLES.footer}>
        <button style={STYLES.btnSecondary} onClick={onBack}>
          ← {lang === 'fr' ? 'Retour' : 'Back'}
        </button>
        <button
          style={{ ...STYLES.btnPrimary, width: 'auto', flex: 1 }}
          onClick={onNext}
        >
          {lang === 'fr' ? 'Continuer' : 'Continue'} →
        </button>
      </div>
    </div>
  );
}

// Step 5
function StepReady({ lang, onBack, onComplete }) {
  const steps = [
    {
      icon: '👤',
      textFr: 'Ajouter vos caissiers',
      textEn: 'Add your cashiers',
      whereFr: 'Config → Caissiers',
      whereEn: 'Config → Cashiers',
    },
    {
      icon: '📂',
      textFr: 'Configurer vos catégories de dépenses',
      textEn: 'Set up expense categories',
      whereFr: 'Config → P&L',
      whereEn: 'Config → P&L',
    },
    {
      icon: '🧾',
      textFr: 'Entrer votre première facture fournisseur',
      textEn: 'Enter your first supplier invoice',
      whereFr: 'Onglet P&L',
      whereEn: 'P&L tab',
    },
    {
      icon: '📅',
      textFr: 'Essayer une fermeture de journée',
      textEn: 'Try a daily close-out',
      whereFr: 'Onglet Journalier',
      whereEn: 'Daily tab',
    },
  ];

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: '8px' }}>
        <div style={{ fontSize: '40px', marginBottom: '8px' }}>🎉</div>
        <div style={STYLES.stepTitle}>
          {lang === 'fr' ? 'Vous êtes prêt!' : "You're ready!"}
        </div>
        <div style={STYLES.stepDesc}>
          {lang === 'fr'
            ? 'Voici vos prochaines étapes suggérées :'
            : 'Here are your suggested next steps:'}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
        {steps.map((s, i) => (
          <div
            key={i}
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '10px',
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'rgba(255,255,255,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
              flexShrink: 0,
            }}>
              {s.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: '500', color: '#E8E8EC', marginBottom: '2px' }}>
                {lang === 'fr' ? s.textFr : s.textEn}
              </div>
              <div style={{ fontSize: '11px', color: '#6B7080', fontFamily: "'DM Mono', monospace" }}>
                {lang === 'fr' ? s.whereFr : s.whereEn}
              </div>
            </div>
            <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.1)', flexShrink: 0 }} />
          </div>
        ))}
      </div>

      <button
        style={{ ...STYLES.btnPrimary, fontSize: '15px', padding: '13px 20px' }}
        onClick={onComplete}
      >
        {lang === 'fr' ? '🚀 Commencer' : '🚀 Get started'}
      </button>

      <div style={{ marginTop: '12px', textAlign: 'center' }}>
        <button style={{ ...STYLES.btnSecondary, background: 'none', border: 'none', color: '#6B7080', fontSize: '12px' }} onClick={onBack}>
          ← {lang === 'fr' ? 'Retour' : 'Back'}
        </button>
      </div>
    </div>
  );
}

// Main wizard
export default function OnboardingWizard({
  lang = 'fr',
  companyInfo = {},
  saveCompanyInfo,
  roster = [],
  saveRoster,
  expenseItems = [],
  saveExpItems,
  onComplete,
}) {
  const [step, setStep] = useState(0); // 0-indexed

  const totalSteps = 5;

  const next = useCallback(() => setStep((s) => Math.min(s + 1, totalSteps - 1)), []);
  const back = useCallback(() => setStep((s) => Math.max(s - 1, 0)), []);

  const handleComplete = useCallback(async () => {
    if (onComplete) await onComplete();
  }, [onComplete]);

  return (
    <div style={STYLES.overlay}>
      <div style={STYLES.card}>
        {/* Logo */}
        <div style={STYLES.logo}>
          <div style={STYLES.logoBadge}>BIQ</div>
          <span style={STYLES.logoText}>BalanceIQ</span>
        </div>

        {/* Progress */}
        <div style={STYLES.progressRow}>
          {Array.from({ length: totalSteps }, (_, i) => {
            const state = i < step ? 'done' : i === step ? 'current' : 'future';
            return <div key={i} style={STYLES.dot(state)} />;
          })}
          <span style={STYLES.progressLabel}>
            {lang === 'fr' ? `Étape ${step + 1} / ${totalSteps}` : `Step ${step + 1} of ${totalSteps}`}
          </span>
        </div>

        {/* Steps */}
        {step === 0 && (
          <StepType
            lang={lang}
            companyInfo={companyInfo}
            saveCompanyInfo={saveCompanyInfo}
            onNext={next}
          />
        )}
        {step === 1 && (
          <StepInfo
            lang={lang}
            companyInfo={companyInfo}
            saveCompanyInfo={saveCompanyInfo}
            onNext={next}
            onBack={back}
          />
        )}
        {step === 2 && (
          <StepRegisters
            lang={lang}
            roster={roster}
            saveRoster={saveRoster}
            onNext={next}
            onBack={back}
          />
        )}
        {step === 3 && (
          <StepDemo
            lang={lang}
            onNext={next}
            onBack={back}
          />
        )}
        {step === 4 && (
          <StepReady
            lang={lang}
            onBack={back}
            onComplete={handleComplete}
          />
        )}
      </div>
    </div>
  );
}
