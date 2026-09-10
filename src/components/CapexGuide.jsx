import React, { useState, useEffect } from 'react';
import { CAPEX_REVIEW_THRESHOLD } from '../utils/calculations.js';

// Expense or asset: the one accounting decision a new owner is asked to make at
// the moment of purchase, with no training and no way to tell they got it wrong.
// Getting it wrong is silent - the income statement is off, the balance sheet is
// missing the thing, and the CCA schedule never starts - and it is expensive to
// unpick a year later.
//
// This is deliberately a decision aid rather than a rate table. The rates come
// from cca_class_rates so the guide cannot drift from what the app will actually
// compute, and every judgement call ends by pointing at the accountant rather
// than pretending the answer is mechanical.

const UI = {
  fr: {
    title: 'Dépense ou immobilisation ?',
    subtitle: 'Le test rapide, puis les cas courants.',
    testTitle: 'Trois questions',
    q1: 'Est-ce que ce sera encore utile dans un an ?',
    q2: (amt) => `Est-ce que ça a coûté plus de ${amt} ?`,
    q3: 'Est-ce un bien que vous possédez, et non un service ou un abonnement ?',
    testYes: 'Trois fois oui : c\'est une immobilisation. Elle va au bilan et se déduit sur plusieurs années par la DPA.',
    testNo: 'Un seul non : c\'est une dépense de l\'année. Passez-la en charge et n\'y pensez plus.',
    expenseTitle: 'Dépense de l\'année',
    assetTitle: 'Immobilisation (DPA)',
    repairTitle: 'Réparation ou amélioration ?',
    repairBody: 'C\'est le cas le plus glissant. Remettre une chose dans l\'état où elle était est une réparation, donc une dépense. La rendre meilleure, plus grande ou plus durable qu\'avant est une amélioration, donc une immobilisation.',
    repairEx: 'Remplacer le moteur d\'un mélangeur : réparation. Remplacer le mélangeur par un plus gros : immobilisation.',
    taxTitle: 'Ce qui ne change pas',
    taxBody: 'La TPS et la TVQ payées sont réclamables en entier l\'année de l\'achat dans les deux cas. Choisir l\'immobilisation ne retarde jamais votre crédit de taxes, seulement la déduction au revenu.',
    howTitle: 'Si c\'est une immobilisation',
    how1: 'Catégorisez la ligne bancaire vers un compte d\'actif (1500 à 1580), pas vers une charge.',
    how2: 'Inscrivez le bien dans Immobilisations avec sa catégorie DPA. L\'app calcule l\'amortissement, règle de la demi-année comprise.',
    classesTitle: 'Catégories disponibles dans l\'app',
    disclaimer: 'Guide général. La catégorie exacte, le montant de DPA à réclamer une année donnée (vous n\'êtes pas obligé de tout réclamer) et les cas limites sont à valider avec votre comptable.',
    close: 'Fermer',
    ex: [
      ['Abonnement logiciel mensuel', 'Ordinateur, portable, serveur', '50'],
      ['Papeterie, fournitures', 'Mobilier, étagères, bureau', '8'],
      ['Réparation d\'un équipement', 'Machinerie de production', '43'],
      ['Essence, entretien du véhicule', 'Véhicule', '10'],
      ['Loyer mensuel', 'Aménagement du local loué', '13'],
      ['Petits outils sous 500 $', 'Bâtiment', '1'],
    ],
  },
  en: {
    title: 'Expense or capital asset?',
    subtitle: 'The quick test, then the common cases.',
    testTitle: 'Three questions',
    q1: 'Will it still be useful a year from now?',
    q2: (amt) => `Did it cost more than ${amt}?`,
    q3: 'Is it a thing you own, rather than a service or a subscription?',
    testYes: 'Three yeses: it is a capital asset. It goes on the balance sheet and comes off over several years through CCA.',
    testNo: 'Any no: it is an expense this year. Book it and forget it.',
    expenseTitle: 'Expense this year',
    assetTitle: 'Capital asset (CCA)',
    repairTitle: 'Repair or improvement?',
    repairBody: 'This is the slippery one. Putting something back the way it was is a repair, so an expense. Making it better, bigger or longer-lasting than it was is an improvement, so a capital asset.',
    repairEx: 'Replacing the motor in a mixer: repair. Replacing the mixer with a larger one: capital.',
    taxTitle: 'What does not change',
    taxBody: 'The GST and QST you paid are fully claimable in the year of purchase either way. Choosing capital never delays your tax credit, only the income deduction.',
    howTitle: 'If it is capital',
    how1: 'Categorize the bank line to an asset account (1500 to 1580), not to an expense.',
    how2: 'Record the item under Fixed Assets with its CCA class. The app computes the depreciation, half-year rule included.',
    classesTitle: 'Classes available in the app',
    disclaimer: 'General guidance. The exact class, how much CCA to claim in a given year (you are not obliged to claim it all) and the borderline cases are for your accountant to confirm.',
    close: 'Close',
    ex: [
      ['Monthly software subscription', 'Computer, laptop, server', '50'],
      ['Stationery, supplies', 'Furniture, shelving, desk', '8'],
      ['Repairing a piece of equipment', 'Production machinery', '43'],
      ['Fuel, vehicle servicing', 'Vehicle', '10'],
      ['Monthly rent', 'Fit-out of a leased space', '13'],
      ['Small tools under $500', 'Building', '1'],
    ],
  },
};

export default function CapexGuide({ lang = 'fr', onClose }) {
  const L = UI[lang] || UI.fr;
  const [classes, setClasses] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const list = await window.api?.cca?.classes();
        if (Array.isArray(list)) setClasses(list);
      } catch (_) { /* the guide still reads without them */ }
    })();
  }, []);

  const amt = CAPEX_REVIEW_THRESHOLD.toLocaleString(lang === 'en' ? 'en-CA' : 'fr-CA',
    { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });

  const C = { text: '#e2e8f0', sub: '#94a3b8', muted: '#64748b', border: '#2d3148', card: '#161822' };
  const h = { fontSize: 12, fontWeight: 700, color: '#f97316', textTransform: 'uppercase', letterSpacing: '.5px', margin: '18px 0 7px' };
  const p = { fontSize: 12.5, color: C.sub, lineHeight: 1.55, margin: 0 };
  const td = { padding: '6px 9px', fontSize: 12, borderBottom: `1px solid ${C.border}`, verticalAlign: 'top' };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 16px', overflowY: 'auto',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#0f1119', border: `1px solid ${C.border}`, borderRadius: 10,
        padding: '20px 24px', maxWidth: 640, width: '100%', color: C.text,
      }}>
        <div style={{ fontSize: 17, fontWeight: 700 }}>{L.title}</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{L.subtitle}</div>

        <div style={h}>{L.testTitle}</div>
        <ol style={{ ...p, paddingLeft: 18, margin: 0 }}>
          <li style={{ marginBottom: 3 }}>{L.q1}</li>
          <li style={{ marginBottom: 3 }}>{L.q2(amt)}</li>
          <li>{L.q3}</li>
        </ol>
        <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ ...p, color: '#93c5fd', background: 'rgba(96,165,250,0.07)', border: '1px solid rgba(96,165,250,0.22)', borderRadius: 5, padding: '7px 10px' }}>{L.testYes}</div>
          <div style={{ ...p, color: '#86efac', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 5, padding: '7px 10px' }}>{L.testNo}</div>
        </div>

        <div style={h}>{lang === 'en' ? 'Common cases' : 'Cas courants'}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={{ ...td, textAlign: 'left', color: '#86efac', fontSize: 11 }}>{L.expenseTitle}</th>
            <th style={{ ...td, textAlign: 'left', color: '#93c5fd', fontSize: 11 }}>{L.assetTitle}</th>
          </tr></thead>
          <tbody>
            {L.ex.map(([expense, asset, cls], i) => (
              <tr key={i}>
                <td style={{ ...td, color: C.sub }}>{expense}</td>
                <td style={{ ...td, color: C.sub }}>
                  {asset}
                  <span style={{ marginLeft: 6, fontSize: 10, color: '#f97316', background: 'rgba(249,115,22,0.1)', borderRadius: 3, padding: '1px 5px' }}>
                    {lang === 'en' ? `class ${cls}` : `cat. ${cls}`}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={h}>{L.repairTitle}</div>
        <p style={p}>{L.repairBody}</p>
        <p style={{ ...p, marginTop: 5, fontStyle: 'italic', color: C.muted }}>{L.repairEx}</p>

        <div style={h}>{L.taxTitle}</div>
        <p style={p}>{L.taxBody}</p>

        <div style={h}>{L.howTitle}</div>
        <ol style={{ ...p, paddingLeft: 18, margin: 0 }}>
          <li style={{ marginBottom: 3 }}>{L.how1}</li>
          <li>{L.how2}</li>
        </ol>

        {classes.length > 0 && (
          <>
            <div style={h}>{L.classesTitle}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {classes.map(c => (
                <span key={c.class} style={{
                  fontSize: 11, color: C.sub, background: C.card,
                  border: `1px solid ${C.border}`, borderRadius: 5, padding: '4px 8px',
                }}>
                  <strong style={{ color: C.text }}>{lang === 'en' ? `Class ${c.class}` : `Cat. ${c.class}`}</strong>
                  {' · '}{lang === 'en' ? (c.description_en || c.description_fr) : (c.description_fr || c.description_en)}
                </span>
              ))}
            </div>
          </>
        )}

        <div style={{
          marginTop: 18, fontSize: 11, color: '#a1791f', background: 'rgba(251,191,36,0.07)',
          border: '1px solid rgba(251,191,36,0.2)', borderRadius: 5, padding: '8px 11px', lineHeight: 1.5,
        }}>{L.disclaimer}</div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose} style={{
            padding: '6px 18px', borderRadius: 6, border: 'none',
            background: 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff',
            fontWeight: 700, fontSize: 12, cursor: 'pointer',
          }}>{L.close}</button>
        </div>
      </div>
    </div>
  );
}
