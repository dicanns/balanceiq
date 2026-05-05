import React, { useState, useEffect, useCallback } from 'react';
import { generateTaxPeriods } from '../services/onboarding.js';

const PROVINCES = [
  { code: 'QC', fr: 'Québec', en: 'Quebec' },
  { code: 'ON', fr: 'Ontario', en: 'Ontario' },
  { code: 'BC', fr: 'Colombie-Britannique', en: 'British Columbia' },
  { code: 'AB', fr: 'Alberta', en: 'Alberta' },
  { code: 'SK', fr: 'Saskatchewan', en: 'Saskatchewan' },
  { code: 'MB', fr: 'Manitoba', en: 'Manitoba' },
  { code: 'NB', fr: 'Nouveau-Brunswick', en: 'New Brunswick' },
  { code: 'NS', fr: 'Nouvelle-Écosse', en: 'Nova Scotia' },
  { code: 'NL', fr: 'Terre-Neuve-et-Labrador', en: 'Newfoundland and Labrador' },
  { code: 'PE', fr: 'Île-du-Prince-Édouard', en: 'Prince Edward Island' },
];

const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const MONTHS_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const UI = {
  fr: {
    title: 'Profil d\'enregistrement fiscal',
    subtitle: 'Configurez vos informations d\'enregistrement TPS/TVQ pour générer automatiquement vos périodes de déclaration.',
    province: 'Province',
    bn: 'Numéro d\'entreprise fédéral (NE)',
    bnPlaceholder: 'Ex. 123456789 RT0001',
    neq: 'NEQ (Numéro d\'entreprise du Québec)',
    neqPlaceholder: 'Ex. 1234567890',
    fyEndMonth: 'Fin d\'exercice fiscal',
    filingFrequency: 'Fréquence de déclaration',
    monthly: 'Mensuelle',
    quarterly: 'Trimestrielle',
    annual: 'Annuelle',
    firstPeriod: 'Première période (AAAA-MM)',
    firstPeriodPlaceholder: 'Ex. 2025-01',
    save: 'Enregistrer',
    saving: 'Enregistrement…',
    saved: 'Profil enregistré.',
    generatePeriods: 'Générer les périodes',
    generatedInfo: (n) => `${n} période(s) générée(s) et ajoutée(s).`,
    noGenerate: 'Entrez une première période pour générer les déclarations.',
    disclaimer: 'Ces informations sont utilisées pour pré-remplir vos déclarations. Validez avec votre comptable.',
    configured: 'Profil configuré',
    notConfigured: 'Non configuré',
  },
  en: {
    title: 'Tax Registration Profile',
    subtitle: 'Configure your GST/QST registration details to auto-generate your filing periods.',
    province: 'Province',
    bn: 'Federal Business Number (BN)',
    bnPlaceholder: 'e.g. 123456789 RT0001',
    neq: 'NEQ (Quebec Enterprise Number)',
    neqPlaceholder: 'e.g. 1234567890',
    fyEndMonth: 'Fiscal Year End',
    filingFrequency: 'Filing Frequency',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    annual: 'Annual',
    firstPeriod: 'First Period (YYYY-MM)',
    firstPeriodPlaceholder: 'e.g. 2025-01',
    save: 'Save',
    saving: 'Saving…',
    saved: 'Profile saved.',
    generatePeriods: 'Generate Periods',
    generatedInfo: (n) => `${n} period(s) generated and added.`,
    noGenerate: 'Enter a first period to generate filings.',
    disclaimer: 'This information is used to pre-populate your returns. Validate with your accountant.',
    configured: 'Profile configured',
    notConfigured: 'Not configured',
  },
};

const inputStyle = {
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  color: '#1e293b',
  fontSize: 12,
  padding: '7px 10px',
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: "'Satoshi',-apple-system,BlinkMacSystemFont,sans-serif",
  outline: 'none',
};

const labelStyle = {
  fontSize: 11,
  fontWeight: 600,
  color: '#475569',
  marginBottom: 4,
  display: 'block',
};

export default function QuebecTaxWizard({ lang, locationId = null }) {
  const fr = lang !== 'en';
  const T = UI[fr ? 'fr' : 'en'];
  const months = fr ? MONTHS_FR : MONTHS_EN;

  const [form, setForm] = useState({
    provinceCode: 'QC',
    businessNumber: '',
    neq: '',
    fiscalYearEndMonth: 12,
    filingFrequency: 'quarterly',
    firstFilingPeriod: '',
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [existing, setExisting] = useState(null);

  const load = useCallback(async () => {
    if (!window.api?.tax?.registration) return;
    const row = await window.api.tax.registration.get(locationId);
    if (row) {
      setExisting(row);
      setForm({
        provinceCode: row.province_code || 'QC',
        businessNumber: row.business_number || '',
        neq: row.neq || '',
        fiscalYearEndMonth: row.fiscal_year_end_month || 12,
        filingFrequency: row.filing_frequency || 'quarterly',
        firstFilingPeriod: row.first_filing_period || '',
      });
    }
  }, [locationId]);

  useEffect(() => { load(); }, [load]);

  function set(field, val) {
    setForm(f => ({ ...f, [field]: val }));
    setMsg(null);
  }

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    try {
      const saved = await window.api.tax.registration.save({
        locationId,
        provinceCode: form.provinceCode,
        businessNumber: form.businessNumber || null,
        neq: form.neq || null,
        fiscalYearEndMonth: Number(form.fiscalYearEndMonth),
        fiscalYearEndDay: 31,
        filingFrequency: form.filingFrequency,
        firstFilingPeriod: form.firstFilingPeriod || null,
      });
      setExisting(saved);
      setMsg({ type: 'ok', text: T.saved });
    } finally {
      setSaving(false);
    }
  }

  async function handleGeneratePeriods() {
    if (!form.firstFilingPeriod || !window.api?.tax?.period?.save) {
      setMsg({ type: 'warn', text: T.noGenerate });
      return;
    }
    const [fyStr] = form.firstFilingPeriod.split('-');
    const fy = parseInt(fyStr, 10);
    if (!fy || fy < 2020 || fy > 2099) {
      setMsg({ type: 'warn', text: T.noGenerate });
      return;
    }

    const periods = generateTaxPeriods({
      fiscalYearEndMonth: Number(form.fiscalYearEndMonth),
      filingFrequency: form.filingFrequency,
      fiscalYear: fy + (Number(form.fiscalYearEndMonth) === 12 ? 0 : 1),
    });

    let count = 0;
    for (const p of periods) {
      await window.api.tax.period.save({
        periodStart: p.periodStart.slice(0, 7),
        periodEnd: p.periodEnd.slice(0, 7),
        periodType: form.filingFrequency,
        note: p.periodLabel,
      });
      count++;
    }
    setMsg({ type: 'ok', text: T.generatedInfo(count) });
  }

  return (
    <div style={{ maxWidth: 560 }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
          {T.title}
          {existing && (
            <span style={{
              marginLeft: 10, fontSize: 10, fontWeight: 700,
              color: '#16a34a', background: 'rgba(22,163,74,0.1)',
              padding: '2px 8px', borderRadius: 10,
            }}>
              {T.configured}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.5 }}>{T.subtitle}</div>
      </div>

      {/* Form grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px', marginBottom: 18 }}>
        {/* Province */}
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>{T.province}</label>
          <select value={form.provinceCode} onChange={e => set('provinceCode', e.target.value)} style={inputStyle}>
            {PROVINCES.map(p => (
              <option key={p.code} value={p.code}>{p.code} — {fr ? p.fr : p.en}</option>
            ))}
          </select>
        </div>

        {/* Business Number */}
        <div>
          <label style={labelStyle}>{T.bn}</label>
          <input
            type="text"
            value={form.businessNumber}
            onChange={e => set('businessNumber', e.target.value)}
            placeholder={T.bnPlaceholder}
            style={inputStyle}
          />
        </div>

        {/* NEQ — only for QC */}
        {form.provinceCode === 'QC' && (
          <div>
            <label style={labelStyle}>{T.neq}</label>
            <input
              type="text"
              value={form.neq}
              onChange={e => set('neq', e.target.value)}
              placeholder={T.neqPlaceholder}
              style={inputStyle}
            />
          </div>
        )}

        {/* Fiscal Year End Month */}
        <div>
          <label style={labelStyle}>{T.fyEndMonth}</label>
          <select value={form.fiscalYearEndMonth} onChange={e => set('fiscalYearEndMonth', Number(e.target.value))} style={inputStyle}>
            {months.map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>

        {/* Filing Frequency */}
        <div>
          <label style={labelStyle}>{T.filingFrequency}</label>
          <select value={form.filingFrequency} onChange={e => set('filingFrequency', e.target.value)} style={inputStyle}>
            <option value="monthly">{T.monthly}</option>
            <option value="quarterly">{T.quarterly}</option>
            <option value="annual">{T.annual}</option>
          </select>
        </div>

        {/* First Filing Period */}
        <div>
          <label style={labelStyle}>{T.firstPeriod}</label>
          <input
            type="text"
            value={form.firstFilingPeriod}
            onChange={e => set('firstFilingPeriod', e.target.value)}
            placeholder={T.firstPeriodPlaceholder}
            style={inputStyle}
          />
        </div>
      </div>

      {/* Disclaimer */}
      <div style={{
        fontSize: 10, color: '#64748b', fontStyle: 'italic',
        padding: '8px 12px', borderRadius: 6,
        background: 'rgba(249,115,22,0.04)',
        border: '1px solid rgba(249,115,22,0.15)',
        marginBottom: 16,
      }}>
        {T.disclaimer}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '8px 18px',
            borderRadius: 6,
            background: '#f97316',
            color: '#fff',
            fontWeight: 700,
            fontSize: 12,
            border: 'none',
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.6 : 1,
            fontFamily: "'Satoshi',-apple-system,BlinkMacSystemFont,sans-serif",
          }}
        >
          {saving ? T.saving : T.save}
        </button>

        {existing && (
          <button
            onClick={handleGeneratePeriods}
            style={{
              padding: '8px 18px',
              borderRadius: 6,
              background: 'rgba(22,163,74,0.08)',
              color: '#16a34a',
              fontWeight: 700,
              fontSize: 12,
              border: '1px solid rgba(22,163,74,0.3)',
              cursor: 'pointer',
              fontFamily: "'Satoshi',-apple-system,BlinkMacSystemFont,sans-serif",
            }}
          >
            {T.generatePeriods}
          </button>
        )}

        {msg && (
          <span style={{
            fontSize: 11, fontWeight: 600,
            color: msg.type === 'ok' ? '#16a34a' : '#b45309',
          }}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
