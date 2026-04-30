import React, { useState, useMemo, useEffect } from 'react';

export const DENOMINATIONS = [
  { code: 'bill_100',     cents: 10000, labelFr: '100 $',  labelEn: '$100',   group: 'bills' },
  { code: 'bill_50',      cents: 5000,  labelFr: '50 $',   labelEn: '$50',    group: 'bills' },
  { code: 'bill_20',      cents: 2000,  labelFr: '20 $',   labelEn: '$20',    group: 'bills' },
  { code: 'bill_10',      cents: 1000,  labelFr: '10 $',   labelEn: '$10',    group: 'bills' },
  { code: 'bill_5',       cents: 500,   labelFr: '5 $',    labelEn: '$5',     group: 'bills' },
  { code: 'coin_toonie',  cents: 200,   labelFr: '2 $',    labelEn: '$2',     group: 'coins' },
  { code: 'coin_loonie',  cents: 100,   labelFr: '1 $',    labelEn: '$1',     group: 'coins' },
  { code: 'coin_quarter', cents: 25,    labelFr: '0,25 $', labelEn: '$0.25',  group: 'coins' },
  { code: 'coin_dime',    cents: 10,    labelFr: '0,10 $', labelEn: '$0.10',  group: 'coins' },
  { code: 'coin_nickel',  cents: 5,     labelFr: '0,05 $', labelEn: '$0.05',  group: 'coins' },
  { code: 'roll_toonie',  cents: 5000,  labelFr: 'Rouleau 2 $',    labelEn: '$2 roll',    group: 'rolls' },
  { code: 'roll_loonie',  cents: 2500,  labelFr: 'Rouleau 1 $',    labelEn: '$1 roll',    group: 'rolls' },
  { code: 'roll_quarter', cents: 1000,  labelFr: 'Rouleau 0,25 $', labelEn: '$0.25 roll', group: 'rolls' },
  { code: 'roll_dime',    cents: 500,   labelFr: 'Rouleau 0,10 $', labelEn: '$0.10 roll', group: 'rolls' },
  { code: 'roll_nickel',  cents: 200,   labelFr: 'Rouleau 0,05 $', labelEn: '$0.05 roll', group: 'rolls' },
];

export function sumDenominations(quantities) {
  let totalCents = 0;
  for (const d of DENOMINATIONS) {
    const qty = parseInt(quantities[d.code] ?? 0, 10) || 0;
    totalCents += qty * d.cents;
  }
  return totalCents;
}

export function buildDenominationRows(quantities) {
  return DENOMINATIONS.map(d => {
    const qty = parseInt(quantities[d.code] ?? 0, 10) || 0;
    return {
      denomination_code: d.code,
      unit_value_cents: d.cents,
      quantity: qty,
      total_value_cents: qty * d.cents,
    };
  });
}

export default function DenominationCounter({ lang = 'fr', t = {}, onChange }) {
  const fr = lang !== 'en';
  const [quantities, setQuantities] = useState({});

  const totalCents = useMemo(() => sumDenominations(quantities), [quantities]);
  const totalDollars = totalCents / 100;

  useEffect(() => {
    onChange?.(totalDollars, buildDenominationRows(quantities));
  }, [totalCents]);

  function setQty(code, val) {
    const n = Math.max(0, parseInt(val, 10) || 0);
    setQuantities(prev => ({ ...prev, [code]: n }));
  }

  const fmt = v => new Intl.NumberFormat(fr ? 'fr-CA' : 'en-CA', { style: 'currency', currency: 'CAD' }).format(v);

  const groupLabels = {
    bills: { fr: 'Billets', en: 'Bills' },
    coins: { fr: 'Pièces', en: 'Coins' },
    rolls: { fr: 'Rouleaux', en: 'Rolls' },
  };

  const inputStyle = {
    width: 64, padding: '4px 6px', borderRadius: 5, border: `1px solid ${t.inputBorder ?? '#374151'}`,
    background: t.inputBg ?? '#111827', color: t.text ?? '#f9fafb',
    fontSize: 12, textAlign: 'right', outline: 'none', fontVariantNumeric: 'tabular-nums',
  };

  const groups = ['bills', 'coins', 'rolls'];

  return (
    <div style={{ marginTop: 8 }}>
      {groups.map(group => {
        const denoms = DENOMINATIONS.filter(d => d.group === group);
        const groupTotal = denoms.reduce((s, d) => s + (parseInt(quantities[d.code] ?? 0, 10) || 0) * d.cents, 0);
        return (
          <div key={group} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: '#6b7280' }}>
                {fr ? groupLabels[group].fr : groupLabels[group].en}
              </span>
              <span style={{ fontSize: 10, color: '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>
                {fmt(groupTotal / 100)}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '3px 8px', alignItems: 'center' }}>
              {denoms.map(d => {
                const qty = quantities[d.code] ?? 0;
                const lineTotal = (parseInt(qty, 10) || 0) * d.cents;
                return (
                  <React.Fragment key={d.code}>
                    <span style={{ fontSize: 12, color: t.text ?? '#d1d5db' }}>
                      {fr ? d.labelFr : d.labelEn}
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={qty || ''}
                      placeholder="0"
                      onChange={e => setQty(d.code, e.target.value)}
                      style={inputStyle}
                    />
                    <span style={{ fontSize: 11, color: lineTotal > 0 ? '#4ade80' : '#6b7280', fontVariantNumeric: 'tabular-nums', minWidth: 60, textAlign: 'right' }}>
                      {lineTotal > 0 ? fmt(lineTotal / 100) : '—'}
                    </span>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        );
      })}
      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af' }}>
          {fr ? 'Total comptage' : 'Count total'}
        </span>
        <span style={{ fontSize: 15, fontWeight: 800, color: totalCents > 0 ? '#4ade80' : '#6b7280', fontVariantNumeric: 'tabular-nums' }}>
          {fmt(totalDollars)}
        </span>
      </div>
    </div>
  );
}
