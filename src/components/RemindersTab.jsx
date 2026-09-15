import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  dueReminders, fillReminderTemplate, REMINDER_VARIABLES, DEFAULT_REMINDER_TEXT,
} from '../services/invoiceReminders.js';

// Invoicing > Reminders. Reminder emails for overdue invoices.
//
// Nothing is ever sent without a click on Send. "Find reminders due" shows exactly
// what would go out; the old "Check now" sent immediately, and sent an overdue
// invoice's earlier reminders one per click.

const UI = {
  en: {
    title: 'Payment reminders',
    how: 'Reminders are emails about overdue invoices. Nothing is sent automatically: Find reminders due shows what would be sent, and nothing goes out until you press Send. Each invoice gets only its most recent due reminder. Choose which reminders each client gets in the client\'s profile.',
    proGate: 'Payment reminders are available with BalanceIQ Pro.',
    upgrade: 'See Pro',
    tabReminders: 'Reminders',
    tabHistory: 'History',
    days: (n) => `${n} days after due`,
    untitled: '(no subject)',
    add: '+ Add a reminder',
    edit: 'Edit',
    remove: 'Delete',
    confirmRemove: 'Delete this reminder? Clients who chose it will no longer get it.',
    daysAfter: 'Days after the due date',
    subjectFr: 'Subject (French)',
    subjectEn: 'Subject (English)',
    bodyFr: 'Message (French)',
    bodyEn: 'Message (English)',
    attach: 'Attach the invoice PDF',
    vars: 'These are filled in when sending:',
    blankUsesDefault: 'Left blank, a standard reminder text is used.',
    save: 'Save',
    cancel: 'Cancel',
    none: 'No reminders yet.',
    find: 'Find reminders due',
    finding: 'Looking…',
    noneDue: 'No reminders are due.',
    dueTitle: (n) => `${n} reminder${n === 1 ? '' : 's'} due`,
    colClient: 'Client', colInvoice: 'Invoice', colReminder: 'Reminder', colOverdue: 'Overdue', colDue: 'Balance due',
    overdueDays: (n) => `${n} d`,
    noEmail: 'no email on file',
    skippedNote: (n) => `${n} earlier reminder${n === 1 ? '' : 's'} passed will be skipped`,
    send: (n) => `Send ${n} reminder${n === 1 ? '' : 's'}`,
    sending: (a, b) => `Sending ${a} of ${b}…`,
    noKey: 'Add your Resend key in Settings > Integrations to send reminders by email.',
    result: (s, f) => `${s} sent${f ? `, ${f} failed` : ''}.`,
    failedFor: (who, why) => `${who}: ${why}`,
    close: 'Close',
    historyEmpty: 'No reminders sent yet.',
    status: { sent: 'Sent', skipped: 'Skipped (a later reminder was sent)', failed: 'Failed', no_api: 'Not sent (no Resend key)' },
    invoice: 'Invoice',
  },
  fr: {
    title: 'Rappels de paiement',
    how: 'Les rappels sont des courriels au sujet de factures en retard. Rien n\'est envoyé automatiquement : Trouver les rappels dus montre ce qui serait envoyé, et rien ne part avant que vous appuyiez sur Envoyer. Chaque facture reçoit seulement son rappel dû le plus récent. Choisissez les rappels de chaque client dans sa fiche.',
    proGate: 'Les rappels de paiement sont disponibles avec BalanceIQ Pro.',
    upgrade: 'Voir Pro',
    tabReminders: 'Rappels',
    tabHistory: 'Historique',
    days: (n) => `${n} jours après l'échéance`,
    untitled: '(sans objet)',
    add: '+ Ajouter un rappel',
    edit: 'Modifier',
    remove: 'Supprimer',
    confirmRemove: 'Supprimer ce rappel ? Les clients qui l\'ont choisi ne le recevront plus.',
    daysAfter: 'Jours après l\'échéance',
    subjectFr: 'Objet (français)',
    subjectEn: 'Objet (anglais)',
    bodyFr: 'Message (français)',
    bodyEn: 'Message (anglais)',
    attach: 'Joindre la facture en PDF',
    vars: 'Ces balises sont remplies à l\'envoi :',
    blankUsesDefault: 'Laissé vide, un texte de rappel standard est utilisé.',
    save: 'Enregistrer',
    cancel: 'Annuler',
    none: 'Aucun rappel pour le moment.',
    find: 'Trouver les rappels dus',
    finding: 'Recherche…',
    noneDue: 'Aucun rappel n\'est dû.',
    dueTitle: (n) => `${n} rappel${n === 1 ? '' : 's'} dû${n === 1 ? '' : 's'}`,
    colClient: 'Client', colInvoice: 'Facture', colReminder: 'Rappel', colOverdue: 'Retard', colDue: 'Solde dû',
    overdueDays: (n) => `${n} j`,
    noEmail: 'aucun courriel au dossier',
    skippedNote: (n) => `${n} rappel${n === 1 ? '' : 's'} antérieur${n === 1 ? '' : 's'} sera${n === 1 ? '' : 'ont'} ignoré${n === 1 ? '' : 's'}`,
    send: (n) => `Envoyer ${n} rappel${n === 1 ? '' : 's'}`,
    sending: (a, b) => `Envoi ${a} de ${b}…`,
    noKey: 'Ajoutez votre clé Resend dans Réglages > Intégrations pour envoyer les rappels par courriel.',
    result: (s, f) => `${s} envoyé${s === 1 ? '' : 's'}${f ? `, ${f} en échec` : ''}.`,
    failedFor: (who, why) => `${who} : ${why}`,
    close: 'Fermer',
    historyEmpty: 'Aucun rappel envoyé.',
    status: { sent: 'Envoyé', skipped: 'Ignoré (un rappel plus récent a été envoyé)', failed: 'Échec', no_api: 'Non envoyé (pas de clé Resend)' },
    invoice: 'Facture',
  },
};

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const blankStep = () => ({ days_after_due: 7, subject_fr: '', subject_en: '', body_fr: '', body_en: '', attach_pdf: 1 });

export default function RemindersTab({
  factures = [], clients = [], companyInfo = {}, apiConfig = {}, isPro = false, showUpgradePrompt,
  lang = 'fr', t = {}, invoiceBalance, buildInvoiceHtml,
}) {
  const L = UI[lang] || UI.fr;
  const en = lang === 'en';
  const money = (v) => (Number(v) || 0).toLocaleString(en ? 'en-CA' : 'fr-CA', { style: 'currency', currency: 'CAD' });

  const [tab, setTab] = useState('reminders');
  const [ladderId, setLadderId] = useState(null);
  const [steps, setSteps] = useState([]);
  const [log, setLog] = useState([]);
  const [editing, setEditing] = useState(null); // step id | 'new' | null
  const [form, setForm] = useState(blankStep());
  const [due, setDue] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);

  const loadSteps = useCallback(async () => {
    try {
      const ladders = await window.api.reminders.ladder.list();
      const ladder = (ladders || []).find(l => l.is_default) || (ladders || [])[0];
      setLadderId(ladder?.id ?? null);
      setSteps([...(ladder?.steps || [])].sort((a, b) => a.days_after_due - b.days_after_due));
    } catch (_) { setSteps([]); }
  }, []);
  const loadLog = useCallback(async () => {
    try { setLog((await window.api.reminders.log.list({ limit: 5000 })) || []); } catch (_) { setLog([]); }
  }, []);
  useEffect(() => { if (isPro && window.api?.reminders) { loadSteps(); loadLog(); } }, [isPro, loadSteps, loadLog]);

  const byInvoice = useMemo(() => new Map((factures || []).map(f => [String(f.id), f])), [factures]);
  const stepLabel = (id) => { const s = steps.find(x => Number(x.id) === Number(id)); return s ? L.days(s.days_after_due) : `#${id}`; };
  const subjectOf = (s) => (en ? (s.subject_en || s.subject_fr) : (s.subject_fr || s.subject_en)) || L.untitled;

  const card = { background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 9, padding: 12 };
  const input = { background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 5, color: t.inputText, fontSize: 12, padding: '5px 8px', outline: 'none', width: '100%', boxSizing: 'border-box' };
  const lbl = { fontSize: 10, color: t.textMuted, marginBottom: 2, display: 'block' };
  const btn = (primary) => ({
    padding: '5px 12px', borderRadius: 6, fontSize: 11.5, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
    border: primary ? 'none' : `1px solid ${t.cardBorder}`,
    background: primary ? 'linear-gradient(135deg,#f97316,#ea580c)' : t.section, color: primary ? '#fff' : t.textSub,
  });

  if (!isPro) {
    return (
      <div style={{ ...card, textAlign: 'center', padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#f97316', marginBottom: 6 }}>{L.title}</div>
        <div style={{ fontSize: 11.5, color: t.textMuted, marginBottom: 12 }}>{L.proGate}</div>
        <button type="button" style={btn(true)} onClick={() => showUpgradePrompt && showUpgradePrompt('customTemplates')}>{L.upgrade}</button>
      </div>
    );
  }

  const saveStep = async () => {
    const data = {
      daysAfterDue: Math.max(1, parseInt(form.days_after_due, 10) || 1),
      subjectFr: form.subject_fr || null, subjectEn: form.subject_en || null,
      bodyFr: form.body_fr || null, bodyEn: form.body_en || null,
      attachPdf: form.attach_pdf ? 1 : 0,
    };
    setBusy(true);
    try {
      if (editing === 'new') await window.api.reminders.step.create({ ...data, ladderId });
      else await window.api.reminders.step.update(editing, data);
      setEditing(null); setForm(blankStep()); await loadSteps();
    } finally { setBusy(false); }
  };
  const removeStep = async (s) => {
    if (!window.confirm(L.confirmRemove)) return;
    await window.api.reminders.step.delete(s.id);
    await loadSteps();
  };

  const findDue = async () => {
    setBusy(true); setResult(null);
    try {
      const fresh = (await window.api.reminders.log.list({ limit: 5000 })) || [];
      setLog(fresh);
      const items = dueReminders({ factures, clients, steps, log: fresh, today: localToday(), invoiceBalance });
      setDue(items);
      setSelected(new Set(items.filter(i => i.canSend).map(i => i.invoiceId)));
    } finally { setBusy(false); }
  };

  const send = async () => {
    if (!apiConfig?.resendKey) { setResult({ error: L.noKey }); return; }
    const chosen = (due || []).filter(i => i.canSend && selected.has(i.invoiceId));
    if (!chosen.length) return;
    setBusy(true);
    let sent = 0;
    const failed = [];
    for (let n = 0; n < chosen.length; n++) {
      const item = chosen[n];
      setProgress(L.sending(n + 1, chosen.length));
      const fac = byInvoice.get(String(item.invoiceId));
      const client = clients.find(c => c.id === item.clientId);
      const docLang = client?.langue === 'English' ? 'en' : 'fr';
      const docMoney = (v) => (Number(v) || 0).toLocaleString(docLang === 'en' ? 'en-CA' : 'fr-CA', { style: 'currency', currency: 'CAD' });
      const vars = {
        clientName: client?.contact || client?.entreprise || '',
        invoiceNumber: item.invoiceNumber,
        amountDue: docMoney(item.amountDue),
        daysOverdue: item.daysOverdue,
        companyName: companyInfo?.nom || '',
      };
      const s = item.step;
      const defaults = DEFAULT_REMINDER_TEXT[docLang];
      const subject = fillReminderTemplate((docLang === 'en' ? (s.subject_en || s.subject_fr) : (s.subject_fr || s.subject_en)) || defaults.subject, vars);
      const body = fillReminderTemplate((docLang === 'en' ? (s.body_en || s.body_fr) : (s.body_fr || s.body_en)) || defaults.body, vars);
      const html = `<div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.6;color:#1a1a1a;white-space:pre-wrap;max-width:600px">${esc(body)}</div>`;

      const attachments = [];
      if (s.attach_pdf && fac && typeof buildInvoiceHtml === 'function' && window.api?.pdf?.toPDF) {
        try {
          const pdf = await window.api.pdf.toPDF(buildInvoiceHtml(fac, client));
          if (pdf?.data) attachments.push({ filename: `${docLang === 'en' ? 'Invoice' : 'Facture'}-${item.invoiceNumber || item.invoiceId}.pdf`, content: pdf.data });
        } catch (_) { /* the reminder still goes, without the PDF */ }
      }

      let r = null;
      try {
        r = await window.api.email.sendResend({ apiKey: apiConfig.resendKey, from: apiConfig.resendFrom || 'noreply@balanceiq.ca', to: item.email, subject, html, attachments });
      } catch (e) { r = { error: String(e?.message || e) }; }

      if (r?.success) {
        sent++;
        await window.api.reminders.log.create({ invoiceId: item.invoiceId, stepId: s.id, sentTo: item.email, status: 'sent' });
        for (const skippedId of item.skippedStepIds) {
          await window.api.reminders.log.create({ invoiceId: item.invoiceId, stepId: skippedId, sentTo: item.email, status: 'skipped' });
        }
      } else {
        failed.push({ who: `${item.invoiceNumber} (${item.clientName})`, why: r?.error || 'unknown error' });
        await window.api.reminders.log.create({ invoiceId: item.invoiceId, stepId: s.id, sentTo: item.email, status: 'failed' });
      }
    }
    setProgress(null);
    setBusy(false);
    setDue(null);
    setResult({ sent, failed });
    loadLog();
  };

  const chosenCount = (due || []).filter(i => i.canSend && selected.has(i.invoiceId)).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: t.text }}>{L.title}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {[['reminders', L.tabReminders], ['history', L.tabHistory]].map(([k, label]) => (
            <button key={k} type="button" onClick={() => setTab(k)} style={{
              fontSize: 11, padding: '3px 10px', borderRadius: 5, border: `1px solid ${t.cardBorder}`, fontWeight: 600, cursor: 'pointer',
              background: tab === k ? 'rgba(249,115,22,0.08)' : t.section, color: tab === k ? '#f97316' : t.textSub,
            }}>{label}</button>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: t.textMuted, lineHeight: 1.5 }}>{L.how}</div>

      {tab === 'reminders' && (
        <>
          <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" style={btn(true)} disabled={busy || !steps.length} onClick={findDue}>{busy && !progress ? L.finding : L.find}</button>
              {progress && <span style={{ fontSize: 11.5, color: '#f97316', fontWeight: 600 }}>{progress}</span>}
            </div>

            {result?.error && <div style={{ fontSize: 11.5, color: '#ef4444' }}>{result.error}</div>}
            {result && !result.error && (
              <div style={{ fontSize: 11.5, color: result.failed.length ? '#f59e0b' : '#22c55e' }}>
                {L.result(result.sent, result.failed.length)}
                {result.failed.map((f, i) => <div key={i} style={{ color: '#ef4444' }}>{L.failedFor(f.who, f.why)}</div>)}
              </div>
            )}

            {due && due.length === 0 && <div style={{ fontSize: 11.5, color: '#22c55e' }}>{L.noneDue}</div>}
            {due && due.length > 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: t.text }}>{L.dueTitle(due.length)}</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                    <thead><tr>
                      {['', L.colClient, L.colInvoice, L.colReminder, L.colOverdue, L.colDue].map((h, i) => (
                        <th key={i} style={{ textAlign: i >= 4 ? 'right' : 'left', fontSize: 10, color: t.textMuted, fontWeight: 600, padding: '4px 6px', borderBottom: `1px solid ${t.divider}` }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {due.map(item => (
                        <tr key={item.invoiceId} style={{ opacity: item.canSend ? 1 : 0.55 }}>
                          <td style={{ padding: '5px 6px' }}>
                            <input type="checkbox" disabled={!item.canSend} checked={item.canSend && selected.has(item.invoiceId)} style={{ accentColor: '#f97316' }}
                              onChange={() => setSelected(prev => { const n = new Set(prev); if (n.has(item.invoiceId)) n.delete(item.invoiceId); else n.add(item.invoiceId); return n; })} />
                          </td>
                          <td style={{ padding: '5px 6px', fontSize: 11.5, color: t.text }}>
                            {item.clientName}
                            <div style={{ fontSize: 10.5, color: item.canSend ? t.textMuted : '#ef4444' }}>{item.canSend ? item.email : L.noEmail}</div>
                          </td>
                          <td style={{ padding: '5px 6px', fontSize: 11.5, color: t.text }}>{item.invoiceNumber}</td>
                          <td style={{ padding: '5px 6px', fontSize: 11.5, color: t.textSub }}>
                            {L.days(item.step.days_after_due)}
                            {item.skippedStepIds.length > 0 && <div style={{ fontSize: 10.5, color: t.textMuted }}>{L.skippedNote(item.skippedStepIds.length)}</div>}
                          </td>
                          <td style={{ padding: '5px 6px', fontSize: 11.5, color: t.textSub, textAlign: 'right' }}>{L.overdueDays(item.daysOverdue)}</td>
                          <td style={{ padding: '5px 6px', fontSize: 11.5, color: t.text, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(item.amountDue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" style={btn(true)} disabled={busy || !chosenCount} onClick={send}>{L.send(chosenCount)}</button>
                  <button type="button" style={btn(false)} disabled={busy} onClick={() => setDue(null)}>{L.cancel}</button>
                </div>
              </>
            )}
          </div>

          <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {steps.length === 0 && editing !== 'new' && <div style={{ fontSize: 11.5, color: t.textMuted }}>{L.none}</div>}
            {steps.map(s => (editing === s.id ? null : (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: `1px solid ${t.divider}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: t.text }}>{L.days(s.days_after_due)}</div>
                  <div style={{ fontSize: 11, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subjectOf(s)}</div>
                </div>
                <button type="button" style={btn(false)} onClick={() => { setEditing(s.id); setForm({ ...blankStep(), ...s }); }}>{L.edit}</button>
                <button type="button" style={{ ...btn(false), color: '#ef4444' }} onClick={() => removeStep(s)}>{L.remove}</button>
              </div>
            )))}

            {editing !== null && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: t.section, border: '1px solid rgba(249,115,22,0.2)', borderRadius: 7, padding: 10 }}>
                <div style={{ maxWidth: 160 }}><span style={lbl}>{L.daysAfter}</span>
                  <input type="number" min="1" style={input} value={form.days_after_due} onFocus={e => e.target.select()}
                    onChange={e => setForm(f => ({ ...f, days_after_due: e.target.value }))} /></div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 6 }}>
                  <div><span style={lbl}>{L.subjectFr}</span><input style={input} value={form.subject_fr || ''} onChange={e => setForm(f => ({ ...f, subject_fr: e.target.value }))} /></div>
                  <div><span style={lbl}>{L.subjectEn}</span><input style={input} value={form.subject_en || ''} onChange={e => setForm(f => ({ ...f, subject_en: e.target.value }))} /></div>
                  <div><span style={lbl}>{L.bodyFr}</span><textarea rows={5} style={input} value={form.body_fr || ''} onChange={e => setForm(f => ({ ...f, body_fr: e.target.value }))} /></div>
                  <div><span style={lbl}>{L.bodyEn}</span><textarea rows={5} style={input} value={form.body_en || ''} onChange={e => setForm(f => ({ ...f, body_en: e.target.value }))} /></div>
                </div>
                <div style={{ fontSize: 10.5, color: t.textMuted }}>{L.vars} {REMINDER_VARIABLES.join(' ')} · {L.blankUsesDefault}</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: t.textSub }}>
                  <input type="checkbox" checked={!!form.attach_pdf} onChange={e => setForm(f => ({ ...f, attach_pdf: e.target.checked ? 1 : 0 }))} style={{ accentColor: '#f97316' }} />
                  {L.attach}
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" style={btn(true)} disabled={busy} onClick={saveStep}>{L.save}</button>
                  <button type="button" style={btn(false)} onClick={() => { setEditing(null); setForm(blankStep()); }}>{L.cancel}</button>
                </div>
              </div>
            )}
            {editing === null && ladderId != null && (
              <button type="button" style={{ ...btn(false), alignSelf: 'flex-start' }} onClick={() => { setEditing('new'); setForm(blankStep()); }}>{L.add}</button>
            )}
          </div>
        </>
      )}

      {tab === 'history' && (
        <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {log.length === 0 && <div style={{ fontSize: 11.5, color: t.textMuted, textAlign: 'center', padding: 12 }}>{L.historyEmpty}</div>}
          {log.map(l => {
            const f = byInvoice.get(String(l.invoice_id));
            const tone = l.status === 'sent' ? '#22c55e' : l.status === 'failed' ? '#ef4444' : t.textMuted;
            return (
              <div key={l.id} style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', alignItems: 'baseline', fontSize: 11.5, padding: '5px 0', borderBottom: `1px solid ${t.divider}` }}>
                <span style={{ color: t.text, fontWeight: 600 }}>{L.invoice} {f?.numero || l.invoice_id}</span>
                <span style={{ color: t.textSub }}>{stepLabel(l.step_id)}</span>
                <span style={{ color: t.textMuted }}>{l.sent_to || ''}</span>
                <span style={{ color: tone, fontWeight: 600 }}>{L.status[l.status] || l.status}</span>
                <span style={{ color: t.textMuted, marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{String(l.sent_at || '').slice(0, 16)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
