import React, { useState, useEffect } from 'react';

const DEFAULTS = {
  blind_close_mode: 'off',
  variance_per_register_cents: 100,
  variance_store_cents: 200,
  missing_required_checklist_rule: 'inform',
  missing_pos_evidence_rule: 'inform',
  missing_delivery_reconciliation_rule: 'inform',
  manager_signoff_required: 0,
  approver_identity_method: 'typed_name',
  denomination_mode: 'total_only',
  shift_mode_enabled: 0,
  shift_signoff_required: 0,
};

export default function ClosePolicySettings({ T, t, onPolicySaved }) {
  const [policy, setPolicy] = useState(DEFAULTS);
  const [msg, setMsg] = useState(null);
  const [varRegStr, setVarRegStr] = useState('1.00');
  const [varStoreStr, setVarStoreStr] = useState('2.00');

  useEffect(() => {
    window.api?.closeAssurance?.policy.get(null).then(p => {
      if (p) {
        const merged = { ...DEFAULTS, ...p };
        setPolicy(merged);
        setVarRegStr((merged.variance_per_register_cents / 100).toFixed(2));
        setVarStoreStr((merged.variance_store_cents / 100).toFixed(2));
      }
    }).catch(() => {});
  }, []);

  const set = (key, val) => setPolicy(p => ({ ...p, [key]: val }));

  async function save() {
    try {
      const saved = await window.api.closeAssurance.policy.save(policy);
      setMsg({ ok: true });
      onPolicySaved?.(saved);
      setTimeout(() => setMsg(null), 2500);
    } catch (e) {
      setMsg({ err: e.message });
    }
  }

  const selStyle = {
    width: '100%',
    background: t.inputBg,
    border: `1px solid ${t.inputBorder}`,
    borderRadius: 5,
    color: t.text,
    fontSize: 12,
    padding: '5px 7px',
    outline: 'none',
  };

  const numStyle = {
    background: t.inputBg,
    border: `1px solid ${t.inputBorder}`,
    borderRadius: 5,
    color: t.text,
    fontSize: 12,
    padding: '5px 7px',
    outline: 'none',
    width: 80,
    textAlign: 'right',
    fontFamily: "'Satoshi',-apple-system,BlinkMacSystemFont,sans-serif",
    fontVariantNumeric: 'tabular-nums',
  };

  const cardStyle = {
    background: t.card,
    border: `1px solid ${t.cardBorder}`,
    borderRadius: 9,
    padding: 11,
  };

  const sectionTitle = {
    fontSize: 11,
    fontWeight: 700,
    color: t.textSub,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  };

  function RuleSelect({ label, hint, field }) {
    return (
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: t.text, marginBottom: 2 }}>{label}</div>
        {hint && <div style={{ fontSize: 10.5, color: t.textMuted, marginBottom: 4 }}>{hint}</div>}
        <select value={policy[field]} onChange={e => set(field, e.target.value)} style={selStyle}>
          <option value="inform">{T.cpRuleInform}</option>
          <option value="require_reason">{T.cpRuleRequireReason}</option>
          <option value="block">{T.cpRuleBlock}</option>
        </select>
      </div>
    );
  }

  function Toggle({ label, field }) {
    const on = !!policy[field];
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: t.text }}>{label}</span>
        <button
          onClick={() => set(field, on ? 0 : 1)}
          style={{
            width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', flexShrink: 0,
            background: on ? '#f97316' : t.inputBorder, position: 'relative', transition: 'background 0.2s',
          }}
        >
          <span style={{
            position: 'absolute', top: 2, left: on ? 18 : 2,
            width: 16, height: 16, borderRadius: '50%', background: '#fff',
            transition: 'left 0.2s', display: 'block',
          }} />
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Blind close mode */}
      <div style={cardStyle}>
        <div style={sectionTitle}>{T.cpBlindCloseMode}</div>
        <div style={{ fontSize: 10.5, color: t.textMuted, marginBottom: 6 }}>{T.cpBlindCloseModeHint}</div>
        <select value={policy.blind_close_mode} onChange={e => set('blind_close_mode', e.target.value)} style={selStyle}>
          <option value="off">{T.cpBlindOff}</option>
          <option value="register_blind">{T.cpBlindRegister}</option>
          <option value="manager_reveal">{T.cpBlindManager}</option>
        </select>
      </div>

      {/* Variance thresholds */}
      <div style={cardStyle}>
        <div style={sectionTitle}>{T.cpVarianceThresholds}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: t.text }}>{T.cpPerRegister}</div>
              <div style={{ fontSize: 10.5, color: t.textMuted }}>{T.cpPerRegisterHint}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 12, color: t.textSub }}>$</span>
              <input
                type="number" min="0" step="0.25"
                value={varRegStr}
                onChange={e => setVarRegStr(e.target.value)}
                onBlur={() => {
                  const cents = Math.round(parseFloat(varRegStr || '0') * 100);
                  const safe = isNaN(cents) ? 0 : Math.max(0, cents);
                  set('variance_per_register_cents', safe);
                  setVarRegStr((safe / 100).toFixed(2));
                }}
                style={numStyle}
              />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: t.text }}>{T.cpStoreWide}</div>
              <div style={{ fontSize: 10.5, color: t.textMuted }}>{T.cpStoreWideHint}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 12, color: t.textSub }}>$</span>
              <input
                type="number" min="0" step="0.25"
                value={varStoreStr}
                onChange={e => setVarStoreStr(e.target.value)}
                onBlur={() => {
                  const cents = Math.round(parseFloat(varStoreStr || '0') * 100);
                  const safe = isNaN(cents) ? 0 : Math.max(0, cents);
                  set('variance_store_cents', safe);
                  setVarStoreStr((safe / 100).toFixed(2));
                }}
                style={numStyle}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Exception rules */}
      <div style={cardStyle}>
        <div style={sectionTitle}>{T.cpExceptionRules}</div>
        <RuleSelect label={T.cpMissingChecklist} hint={T.cpMissingChecklistHint} field="missing_required_checklist_rule" />
        <RuleSelect label={T.cpMissingPOS} hint={T.cpMissingPOSHint} field="missing_pos_evidence_rule" />
        <RuleSelect label={T.cpMissingDelivery} hint={null} field="missing_delivery_reconciliation_rule" />
      </div>

      {/* Denomination mode */}
      <div style={cardStyle}>
        <div style={sectionTitle}>{T.cpDenominationMode}</div>
        <div style={{ fontSize: 10.5, color: t.textMuted, marginBottom: 6 }}>{T.cpDenominationModeHint}</div>
        <select value={policy.denomination_mode} onChange={e => set('denomination_mode', e.target.value)} style={selStyle}>
          <option value="total_only">{T.cpDenomTotal}</option>
          <option value="denominations_optional">{T.cpDenomOptional}</option>
          <option value="denominations_required">{T.cpDenomRequired}</option>
        </select>
      </div>

      {/* Signoff & shift */}
      <div style={cardStyle}>
        <div style={sectionTitle}>{T.cpSignoff}</div>
        <Toggle label={T.cpManagerSignoff} field="manager_signoff_required" />
        {!!policy.manager_signoff_required && (
          <div style={{ marginBottom: 8, paddingLeft: 4 }}>
            <div style={{ fontSize: 11.5, color: t.text, marginBottom: 4 }}>{T.cpApproverMethod}</div>
            <select value={policy.approver_identity_method} onChange={e => set('approver_identity_method', e.target.value)} style={selStyle}>
              <option value="typed_name">{T.cpMethodTypedName}</option>
              <option value="pin">{T.cpMethodPIN}</option>
              <option value="cloud_user">{T.cpMethodCloud}</option>
            </select>
            {policy.approver_identity_method === 'cloud_user' && (
              <div style={{ marginTop: 6, fontSize: 11, color: '#f97316', background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.25)', borderRadius: 6, padding: '6px 9px' }}>
                {T.cpCloudUserNotice}
              </div>
            )}
          </div>
        )}
        <Toggle label={T.cpShiftMode} field="shift_mode_enabled" />
        {!!policy.shift_mode_enabled && (
          <div style={{ paddingLeft: 4 }}>
            <Toggle label={T.cpShiftSignoff} field="shift_signoff_required" />
          </div>
        )}
      </div>

      {/* Save row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={save}
          style={{
            padding: '9px 22px', borderRadius: 7, border: 'none', cursor: 'pointer',
            fontWeight: 700, fontSize: 13,
            background: 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff',
          }}
        >
          {T.save}
        </button>
        {msg?.ok && <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 600 }}>{T.saved}</span>}
        {msg?.err && <span style={{ fontSize: 12, color: '#ef4444' }}>{msg.err}</span>}
      </div>
    </div>
  );
}
