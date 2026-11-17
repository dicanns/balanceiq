import React, { useCallback, useEffect, useState } from 'react';
import { inboxApi } from '../services/billInbox.js';

// "Receive bills by email" for Supplier bills: a private address the owner forwards
// supplier invoices to. This screen shows the address, who may send to it, and what
// has arrived. A message becomes an ordinary unsaved bill form through onReadFile
// or onReadText; nothing is recorded until the owner checks and saves it there.

const MAX_SENDERS = 10;
const C = { text: '#e2e8f0', sub: '#94a3b8', muted: '#64748b', border: '#2d3148', card: '#161822', sunk: '#0f1119' };

const T = {
  fr: {
    title: 'Recevoir les factures par courriel',
    how: 'Transférez un courriel contenant une facture fournisseur à une adresse privée. Il attend en ligne, scellé, jusqu\'à la prochaine ouverture de BalanceIQ sur cet ordinateur, puis il est téléchargé et effacé en ligne. Seules les adresses de la liste peuvent écrire à cette adresse. Rien n\'est inscrit tant que la facture n\'est pas vérifiée et enregistrée ici.',
    turnOn: 'Activer',
    proOnly: 'La réception de factures par courriel fait partie du forfait Pro.',
    upgrade: 'Voir le forfait Pro',
    signIn: 'Connectez-vous au compte BalanceIQ pour activer la réception par courriel.',
    address: 'Votre adresse',
    copy: 'Copier',
    copied: 'Copié',
    settings: 'Réglages',
    senders: 'Adresses autorisées à écrire',
    sendersHelp: 'Seuls les courriels envoyés de ces adresses sont acceptés.',
    senderPlaceholder: 'nom@exemple.com',
    add: 'Ajouter',
    remove: 'Retirer',
    limit: `Maximum ${MAX_SENDERS} adresses.`,
    invalidSender: 'Cela ne ressemble pas à une adresse courriel.',
    newAddress: 'Nouvelle adresse',
    newAddressAsk: 'L\'ancienne adresse cessera de fonctionner. Créer une nouvelle adresse?',
    newAddressYes: 'Oui, nouvelle adresse',
    turnOff: 'Désactiver',
    turnOffAsk: 'Les messages en attente en ligne seront effacés. Désactiver la réception?',
    turnOffYes: 'Oui, désactiver',
    cancel: 'Annuler',
    checkNow: 'Vérifier maintenant',
    checking: 'Vérification...',
    lastCheck: 'Dernière vérification',
    neverChecked: 'Pas encore vérifié depuis l\'ouverture',
    arrived: (n) => (n === 1 ? '1 nouveau message reçu.' : `${n} nouveaux messages reçus.`),
    nothingNew: 'Rien de nouveau.',
    waitingOnline: (n) => (n === 1 ? '1 message attend en ligne.' : `${n} messages attendent en ligne.`),
    inbox: 'Boîte de réception',
    from: 'De',
    subject: 'Objet',
    noSubject: '(sans objet)',
    skipped: (n) => (n === 1 ? '1 pièce jointe n\'a pas été gardée.' : `${n} pièces jointes n\'ont pas été gardées.`),
    readFile: 'Lire comme facture',
    readText: 'Utiliser le texte du message',
    dismiss: 'Écarter',
    errSignedOut: 'Connectez-vous au compte BalanceIQ, puis réessayez.',
    errPlan: 'La réception de factures par courriel fait partie du forfait Pro.',
    errUnreachable: 'Impossible de joindre BalanceIQ en ligne. Vérifiez la connexion Internet et réessayez.',
    errStore: 'Impossible d\'enregistrer un message sur cet ordinateur. Il reste en ligne et sera repris à la prochaine vérification.',
  },
  en: {
    title: 'Receive bills by email',
    how: 'Forward an email holding a supplier invoice to a private address. It waits online, sealed, until BalanceIQ is next open on this computer, then it is brought down and erased online. Only addresses on the list can send to it. Nothing is recorded until the bill is checked and saved here.',
    turnOn: 'Turn on',
    proOnly: 'Receiving bills by email is part of the Pro plan.',
    upgrade: 'See the Pro plan',
    signIn: 'Sign in to your BalanceIQ account to turn on email receiving.',
    address: 'Your address',
    copy: 'Copy',
    copied: 'Copied',
    settings: 'Settings',
    senders: 'Addresses allowed to send',
    sendersHelp: 'Only emails sent from these addresses are accepted.',
    senderPlaceholder: 'name@example.com',
    add: 'Add',
    remove: 'Remove',
    limit: `At most ${MAX_SENDERS} addresses.`,
    invalidSender: 'That does not look like an email address.',
    newAddress: 'New address',
    newAddressAsk: 'The old address will stop working. Create a new address?',
    newAddressYes: 'Yes, new address',
    turnOff: 'Turn off',
    turnOffAsk: 'Messages waiting online will be erased. Turn off email receiving?',
    turnOffYes: 'Yes, turn off',
    cancel: 'Cancel',
    checkNow: 'Check now',
    checking: 'Checking...',
    lastCheck: 'Last checked',
    neverChecked: 'Not checked yet since BalanceIQ opened',
    arrived: (n) => (n === 1 ? '1 new message arrived.' : `${n} new messages arrived.`),
    nothingNew: 'Nothing new.',
    waitingOnline: (n) => (n === 1 ? '1 message is waiting online.' : `${n} messages are waiting online.`),
    inbox: 'Inbox',
    from: 'From',
    subject: 'Subject',
    noSubject: '(no subject)',
    skipped: (n) => (n === 1 ? '1 attachment was not kept.' : `${n} attachments were not kept.`),
    readFile: 'Read as a bill',
    readText: 'Use the message text',
    dismiss: 'Dismiss',
    errSignedOut: 'Sign in to your BalanceIQ account, then try again.',
    errPlan: 'Receiving bills by email is part of the Pro plan.',
    errUnreachable: 'Could not reach BalanceIQ online. Check the internet connection and try again.',
    errStore: 'A message could not be saved on this computer. It stays online and will be picked up at the next check.',
  },
};

// The cloud's own error words are never shown.
function errorText(L, code) {
  if (!code) return '';
  if (code === 'signed_out') return L.errSignedOut;
  if (code === 'plan') return L.errPlan;
  if (code === 'store_failed') return L.errStore;
  if (code === 'invalid_sender') return L.invalidSender;
  return L.errUnreachable;
}

const fmtDate = (iso, lang) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try { return d.toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA', { dateStyle: 'medium', timeStyle: 'short' }); } catch (_) { return d.toLocaleString(); }
};

const fmtSize = (n) => {
  const b = Number(n) || 0;
  if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(b / 1024))} KB`;
};

export default function BillsInbox({ lang = 'fr', allowed = true, signedIn = true, onUpgrade, onReadFile, onReadText, api = inboxApi }) {
  const L = T[lang] || T.fr;
  const [status, setStatus] = useState(null);
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [lastAt, setLastAt] = useState(null);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [copied, setCopied] = useState(false);
  const [senderText, setSenderText] = useState('');

  const loadItems = useCallback(async () => {
    try {
      const list = window.api?.inbox?.list ? await window.api.inbox.list() : [];
      setItems(Array.isArray(list) ? list : []);
    } catch (_) { /* keep what is shown */ }
  }, []);

  const loadStatus = useCallback(async () => {
    if (!allowed || !signedIn) return;
    const r = await api.status();
    if (r && r.ok) { setStatus(r.status); setError(''); } else if (r) setError(errorText(L, r.error));
  }, [api, allowed, signedIn, L]);

  useEffect(() => {
    loadItems();
    if (!window.api?.inbox?.onChanged) return undefined;
    return window.api.inbox.onChanged(loadItems);
  }, [loadItems]);

  useEffect(() => { loadStatus(); }, [loadStatus]);
  useEffect(() => { try { setLastAt(api.lastCheck ? api.lastCheck() : null); } catch (_) { /* none yet */ } }, [api]);

  const run = async (fn) => {
    setBusy(true); setError(''); setNote('');
    try { return await fn(); } catch (_) { setError(L.errUnreachable); return null; } finally { setBusy(false); }
  };

  const turnOn = () => run(async () => {
    const r = await api.enable();
    if (r && r.ok) { setStatus(r.status); api.check().then((c) => setLastAt(c.at)); } else setError(errorText(L, r && r.error));
  });
  const turnOff = () => run(async () => {
    const r = await api.disable();
    setConfirm(null);
    if (r && r.ok) { setStatus(r.status); setOpen(false); } else setError(errorText(L, r && r.error));
  });
  const newAddr = () => run(async () => {
    const r = await api.newAddress();
    setConfirm(null);
    if (r && r.ok) setStatus(r.status); else setError(errorText(L, r && r.error));
  });
  const saveSenders = (list) => run(async () => {
    const r = await api.setSenders(list);
    if (r && r.ok) { setStatus(r.status); setSenderText(''); } else setError(errorText(L, r && r.error));
  });
  const checkNow = () => run(async () => {
    const r = await api.check();
    setLastAt(r.at);
    if (r.error) setError(errorText(L, r.error));
    else setNote(r.pulled ? L.arrived(r.pulled) : L.nothingNew);
    loadItems();
    loadStatus();
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(status.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (_) { /* the address is shown and can be selected */ }
  };

  const addSender = () => {
    const v = senderText.trim();
    if (!v) return;
    const list = status?.senders || [];
    if (list.some((s) => s.toLowerCase() === v.toLowerCase())) { setSenderText(''); return; }
    saveSenders([...list, v]);
  };
  const removeSender = (s) => saveSenders((status?.senders || []).filter((x) => x !== s));

  const dismiss = async (it) => {
    try { await window.api.inbox.mark(it.id, 'dismissed'); } catch (_) { /* it stays listed */ }
    loadItems();
  };

  const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px', marginBottom: 14 };
  const small = { fontSize: 11.5, color: C.muted, lineHeight: 1.5 };
  const btn = (primary, danger) => ({
    padding: '5px 12px', borderRadius: 6, fontSize: 11.5, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
    border: primary ? 'none' : `1px solid ${danger ? '#ef4444' : C.border}`,
    background: primary ? 'linear-gradient(135deg,#f97316,#ea580c)' : 'transparent', color: primary ? '#fff' : (danger ? '#fca5a5' : C.sub),
  });
  const errorLine = error ? <div role="alert" style={{ fontSize: 11.5, color: '#ef4444', marginTop: 8 }}>{error}</div> : null;
  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{L.title}</span>
      <span style={{ fontSize: 9, fontWeight: 700, color: '#f97316', background: 'rgba(249,115,22,0.1)', padding: '1px 6px', borderRadius: 6 }}>Pro</span>
    </div>
  );

  // Messages already brought down stay usable even if the plan or sign-in changes.
  const itemList = items.length > 0 && (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 6 }}>{L.inbox}</div>
      {items.map((it) => {
        const files = Array.isArray(it.files) ? it.files : [];
        return (
          <div key={it.id} style={{ ...card, marginBottom: 8 }}>
            <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.5 }}>
              <span style={{ color: C.muted }}>{L.from}: </span>{it.from_address || ''}
              <span style={{ color: C.muted }}>{'  '}{fmtDate(it.received_at, lang)}</span>
            </div>
            <div style={{ fontSize: 12.5, color: C.text, fontWeight: 600, marginTop: 2 }}>
              <span style={{ color: C.muted, fontWeight: 400 }}>{L.subject}: </span>{it.subject || L.noSubject}
            </div>
            {it.note ? <div style={{ fontSize: 12, color: C.sub, marginTop: 6, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{it.note}</div> : null}
            {it.skipped > 0 && <div style={{ ...small, marginTop: 6 }}>{L.skipped(it.skipped)}</div>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              {files.map((f, i) => (
                <button key={f.path || i} type="button" style={btn(true)} onClick={() => onReadFile?.(it, f)}>
                  {L.readFile}: {f.name} ({fmtSize(f.size)})
                </button>
              ))}
              {files.length === 0 && it.note && (
                <button type="button" style={btn(true)} onClick={() => onReadText?.(it)}>{L.readText}</button>
              )}
              <button type="button" style={btn(false)} onClick={() => dismiss(it)}>{L.dismiss}</button>
            </div>
          </div>
        );
      })}
    </div>
  );

  let top;
  if (!allowed) {
    top = (
      <div style={card}>
        {header}
        <div style={{ ...small, marginTop: 4 }}>{L.how}</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginTop: 10 }}>{L.proOnly}</div>
        {onUpgrade && <div style={{ marginTop: 10 }}><button type="button" style={btn(true)} onClick={onUpgrade}>{L.upgrade}</button></div>}
      </div>
    );
  } else if (!signedIn) {
    top = (
      <div style={card}>
        {header}
        <div style={{ ...small, marginTop: 4 }}>{L.how}</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginTop: 10 }}>{L.signIn}</div>
      </div>
    );
  } else if (!status || !status.enabled) {
    top = (
      <div style={card}>
        {header}
        <div style={{ ...small, marginTop: 4 }}>{L.how}</div>
        <div style={{ marginTop: 10 }}><button type="button" style={btn(true)} disabled={busy} onClick={turnOn}>{L.turnOn}</button></div>
        {errorLine}
      </div>
    );
  } else {
    const senders = status.senders || [];
    top = (
      <div style={card}>
        {header}
        <div style={{ fontSize: 11, color: C.muted, marginTop: 10 }}>{L.address}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 3 }}>
          <code style={{ fontSize: 12.5, color: C.text, background: C.sunk, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', userSelect: 'all' }}>{status.address}</code>
          <button type="button" style={btn(false)} onClick={copy}>{copied ? L.copied : L.copy}</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          <button type="button" style={btn(false)} disabled={busy} onClick={checkNow}>{busy ? L.checking : L.checkNow}</button>
          <span style={small}>{lastAt ? `${L.lastCheck}: ${fmtDate(lastAt, lang)}` : L.neverChecked}</span>
        </div>
        {note && <div role="status" style={{ ...small, color: C.sub, marginTop: 6 }}>{note}</div>}
        {status.waiting > 0 && <div style={{ ...small, marginTop: 4 }}>{L.waitingOnline(status.waiting)}</div>}
        {errorLine}

        <div style={{ marginTop: 12 }}>
          <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
            style={{ ...btn(false), border: 'none', padding: '2px 0', color: C.sub }}>
            {open ? '- ' : '+ '}{L.settings}
          </button>
        </div>
        {open && (
          <div style={{ marginTop: 8, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
            <div style={{ ...small, marginBottom: 10 }}>{L.how}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{L.senders}</div>
            <div style={small}>{L.sendersHelp}</div>
            <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
              {senders.map((s) => (
                <li key={s} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: C.text, padding: '3px 0' }}>
                  <span>{s}</span>
                  <button type="button" style={btn(false)} disabled={busy} onClick={() => removeSender(s)} aria-label={`${L.remove} ${s}`}>{L.remove}</button>
                </li>
              ))}
            </ul>
            {senders.length < MAX_SENDERS ? (
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <input type="email" value={senderText} placeholder={L.senderPlaceholder} aria-label={L.senders}
                  onChange={(e) => setSenderText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSender(); } }}
                  style={{ flex: '1 1 200px', maxWidth: 280, background: C.sunk, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 12.5, padding: '5px 8px' }} />
                <button type="button" style={btn(true)} disabled={busy || !senderText.trim()} onClick={addSender}>{L.add}</button>
              </div>
            ) : <div style={{ ...small, marginTop: 8 }}>{L.limit}</div>}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              {confirm !== 'new' && <button type="button" style={btn(false)} disabled={busy} onClick={() => setConfirm('new')}>{L.newAddress}</button>}
              {confirm !== 'off' && <button type="button" style={btn(false, true)} disabled={busy} onClick={() => setConfirm('off')}>{L.turnOff}</button>}
            </div>
            {confirm && (
              <div role="alertdialog" aria-label={confirm === 'new' ? L.newAddress : L.turnOff}
                style={{ marginTop: 10, padding: '10px 12px', border: '1px solid #ef4444', borderRadius: 8, background: 'rgba(239,68,68,0.08)' }}>
                <div style={{ fontSize: 12, color: '#fca5a5', lineHeight: 1.5 }}>{confirm === 'new' ? L.newAddressAsk : L.turnOffAsk}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button type="button" style={btn(false, true)} disabled={busy} onClick={confirm === 'new' ? newAddr : turnOff}>
                    {confirm === 'new' ? L.newAddressYes : L.turnOffYes}
                  </button>
                  <button type="button" style={btn(false)} onClick={() => setConfirm(null)}>{L.cancel}</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // What arrived comes first: it is the part to act on.
  return <div>{itemList}{top}</div>;
}
