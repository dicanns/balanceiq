import React, { useCallback, useEffect, useRef, useState } from 'react';

// Settings > AI assistant. Lets the owner's own AI assistant read this company's books
// through a fixed list of questions. Off until turned on. Read only for now.
// The access key is held in component state only and is never written to disk.

export const UI = {
  en: {
    title: 'AI assistant',
    intro: 'Let your own AI assistant read this company\'s books by asking BalanceIQ a fixed list of questions. It uses your own AI subscription: BalanceIQ charges nothing for it and sends nothing anywhere by itself.',
    privacy: 'What your assistant reads is sent by your assistant to the AI company you chose, as part of your conversation. It is off until you turn it on.',
    canTitle: 'What your assistant can do today',
    can1: 'Read your invoices and see who owes you',
    can2: 'Read the bills you have to pay',
    can3: 'Read your bank balances',
    can4: 'Read your profit and loss',
    can5: 'Run the books check',
    can6: 'Change nothing: it can only read',
    neverTitle: 'What it can never do',
    never1: 'See your sign-in or your passwords',
    never2: 'Change your subscription',
    never3: 'Read the stored keys for your till or other services',
    never4: 'Change BalanceIQ itself',
    turnOn: (n) => `Turn on for ${n || 'this company'}`,
    working: 'Please wait…',
    unsupported: 'This version of BalanceIQ does not have this feature yet.',
    statusReady: 'Connected and ready',
    statusPortInUse: 'Turned on, but not reachable: another program on this computer is using the connector\'s address. Restart BalanceIQ.',
    statusFailed: 'Turned on, but it could not start. Restart BalanceIQ and try again.',
    access: 'Access: read only',
    keyCreated: (d) => `Key created ${d}`,
    questions: (n) => `Questions available: ${n}`,
    lastUsed: (d, tool) => `Last used: ${d}${tool ? ` - ${tool}` : ''}`,
    notUsed: 'Not used yet',
    keyTitle: 'Your access key',
    keyNote: 'It is shown only this once; BalanceIQ does not keep it.',
    copy: 'Copy',
    copied: 'Copied',
    howTitle: 'How to connect',
    claudeCode: 'Claude Code',
    otherApps: 'Cursor, VS Code, Gemini CLI and other apps that accept an address',
    address: 'Address',
    header: 'Header',
    reachNote: 'BalanceIQ must be open, with this company, for the assistant to reach it. The Claude and ChatGPT chat apps cannot reach a program on your computer yet; that is coming.',
    hideKey: 'Done, hide the key',
    newKey: 'Create a new key',
    turnOff: 'Turn off',
    confirmNewKey: 'Create a new key? The current key stops working at once, and every assistant using it must be given the new one.',
    confirmOff: 'Turn off? Your assistants lose access immediately.',
    failed: 'That did not work. Please try again.',
  },
  fr: {
    title: 'Assistant IA',
    intro: 'Laissez votre propre assistant IA lire les livres de cette entreprise en posant à BalanceIQ une liste fixe de questions. Il utilise votre propre abonnement IA : BalanceIQ ne facture rien pour cela et n\'envoie rien nulle part de lui-même.',
    privacy: 'Ce que votre assistant lit est transmis par votre assistant à l\'entreprise d\'IA que vous avez choisie, dans le cadre de votre conversation. La fonction est désactivée tant que vous ne l\'activez pas.',
    canTitle: 'Ce que votre assistant peut faire aujourd\'hui',
    can1: 'Lire vos factures et voir qui vous doit de l\'argent',
    can2: 'Lire les factures que vous avez à payer',
    can3: 'Lire les soldes de vos comptes bancaires',
    can4: 'Lire votre état des résultats',
    can5: 'Faire la vérification des livres',
    can6: 'Ne rien modifier : il peut seulement lire',
    neverTitle: 'Ce qu\'il ne peut jamais faire',
    never1: 'Voir votre connexion ou vos mots de passe',
    never2: 'Modifier votre abonnement',
    never3: 'Lire les clés enregistrées de votre caisse ou d\'autres services',
    never4: 'Modifier BalanceIQ lui-même',
    turnOn: (n) => `Activer pour ${n || 'cette entreprise'}`,
    working: 'Veuillez patienter…',
    unsupported: 'Cette version de BalanceIQ n\'offre pas encore cette fonction.',
    statusReady: 'Connecté et prêt',
    statusPortInUse: 'Activé, mais inaccessible : un autre programme sur cet ordinateur utilise l\'adresse du connecteur. Redémarrez BalanceIQ.',
    statusFailed: 'Activé, mais le démarrage a échoué. Redémarrez BalanceIQ et réessayez.',
    access: 'Accès : lecture seule',
    keyCreated: (d) => `Clé créée le ${d}`,
    questions: (n) => `Questions disponibles : ${n}`,
    lastUsed: (d, tool) => `Dernière utilisation : ${d}${tool ? ` - ${tool}` : ''}`,
    notUsed: 'Pas encore utilisé',
    keyTitle: 'Votre clé d\'accès',
    keyNote: 'Elle n\'est affichée qu\'une seule fois; BalanceIQ ne la conserve pas.',
    copy: 'Copier',
    copied: 'Copié',
    howTitle: 'Comment se connecter',
    claudeCode: 'Claude Code',
    otherApps: 'Cursor, VS Code, Gemini CLI et les autres applications qui acceptent une adresse',
    address: 'Adresse',
    header: 'En-tête',
    reachNote: 'BalanceIQ doit être ouvert, avec cette entreprise, pour que l\'assistant puisse l\'atteindre. Les applications de clavardage Claude et ChatGPT ne peuvent pas encore joindre un programme sur votre ordinateur; cela s\'en vient.',
    hideKey: 'Terminé, masquer la clé',
    newKey: 'Créer une nouvelle clé',
    turnOff: 'Désactiver',
    confirmNewKey: 'Créer une nouvelle clé ? La clé actuelle cesse de fonctionner immédiatement, et chaque assistant qui l\'utilise devra recevoir la nouvelle.',
    confirmOff: 'Désactiver ? Vos assistants perdent l\'accès immédiatement.',
    failed: 'Cela n\'a pas fonctionné. Veuillez réessayer.',
  },
};

// The one-line command that connects Claude Code to this connector.
export function connectCommand(url, key) {
  return `claude mcp add --transport http balanceiq ${url} --header "Authorization: Bearer ${key}"`;
}

const REFRESH_MS = 10000;

export default function AiConnectorSettings({ lang = 'fr', t = {} }) {
  const L = UI[lang] || UI.fr;
  const locale = lang === 'en' ? 'en-CA' : 'fr-CA';
  const api = typeof window !== 'undefined' ? window.api?.connector : null;
  const [status, setStatus] = useState(null);
  const [key, setKey] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const copyTimer = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const s = await window.api?.connector?.status();
      // null: the connector could not be loaded in this install.
      setStatus(s || false);
    } catch (_) { /* keep the last status */ }
  }, []);

  useEffect(() => {
    if (!api) return undefined;
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [api, refresh]);

  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  const run = async (fn, withKey) => {
    setBusy(true); setError('');
    try {
      const r = await fn();
      if (!r?.ok) { setError(L.failed); }
      else {
        if (r.status) setStatus(r.status);
        setKey(withKey && r.key ? r.key : null);
      }
    } catch (_) { setError(L.failed); }
    setBusy(false);
    refresh();
  };

  const enable = () => run(() => window.api.connector.enable(), true);
  const newKey = () => { if (window.confirm(L.confirmNewKey)) run(() => window.api.connector.newKey(), true); };
  const disable = () => { if (window.confirm(L.confirmOff)) run(() => window.api.connector.disable(), false); };

  const copy = async (id, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(''), 2000);
    } catch (_) { setError(L.failed); }
  };

  const fmt = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleString(locale);
  };

  const card = { background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 9, padding: '14px 16px' };
  const btn = (primary) => ({
    padding: '5px 12px', borderRadius: 6, fontSize: 11.5, fontWeight: 700, cursor: busy ? 'default' : 'pointer',
    opacity: busy ? 0.6 : 1,
    border: primary ? 'none' : `1px solid ${t.cardBorder}`,
    background: primary ? 'linear-gradient(135deg,#f97316,#ea580c)' : t.section, color: primary ? '#fff' : t.textSub,
  });
  const mono = {
    background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 5, color: t.inputText,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11.5, padding: '6px 9px',
    outline: 'none', flex: '1 1 260px', minWidth: 0, boxSizing: 'border-box',
  };
  const small = { fontSize: 11.5, color: t.textMuted, lineHeight: 1.5 };
  const list = (title, items) => (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: t.text, marginBottom: 3 }}>{title}</div>
      <ul style={{ margin: 0, paddingLeft: 18, color: t.textSub, fontSize: 12, lineHeight: 1.6 }}>
        {items.map((s, i) => <li key={i}>{s}</li>)}
      </ul>
    </div>
  );
  const copyRow = (id, label, value) => (
    <div style={{ marginTop: 8 }}>
      {label && <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 3 }}>{label}</div>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input readOnly value={value} style={mono} onFocus={e => e.target.select()} />
        <button type="button" style={btn(false)} onClick={() => copy(id, value)}>{copied === id ? L.copied : L.copy}</button>
      </div>
    </div>
  );

  if (!api || status === false) {
    return (
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{L.title}</div>
        <div style={{ ...small, marginTop: 4 }}>{L.unsupported}</div>
      </div>
    );
  }

  const enabled = !!status?.enabled;
  const running = !!status?.running;
  const dot = running ? '#22c55e' : '#f59e0b';
  const statusText = running ? L.statusReady : (status?.error === 'port_in_use' ? L.statusPortInUse : L.statusFailed);
  const created = fmt(status?.keyCreatedAt);
  const last = fmt(status?.lastCallAt);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{L.title}</div>
        <div style={{ ...small, marginTop: 4 }}>{L.intro}</div>
        <div style={{ ...small, marginTop: 6 }}>{L.privacy}</div>

        {!enabled && (
          <>
            {list(L.canTitle, [L.can1, L.can2, L.can3, L.can4, L.can5, L.can6])}
            {list(L.neverTitle, [L.never1, L.never2, L.never3, L.never4])}
            <div style={{ marginTop: 14 }}>
              <button type="button" style={btn(true)} disabled={busy || !status} onClick={enable}>
                {busy ? L.working : L.turnOn(status?.companyName)}
              </button>
            </div>
          </>
        )}

        {enabled && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: dot, marginTop: 4, flex: '0 0 auto' }} />
              <div style={{ fontSize: 12.5, fontWeight: 600, color: t.text, lineHeight: 1.5 }}>{statusText}</div>
            </div>
            <div style={{ ...small, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div>{L.access}</div>
              {created && <div>{L.keyCreated(created)}</div>}
              <div>{L.questions(status?.toolCount ?? 0)}</div>
              <div>{last ? L.lastUsed(last, status?.lastTool) : L.notUsed}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <button type="button" style={btn(false)} disabled={busy} onClick={newKey}>{L.newKey}</button>
              <button type="button" style={btn(false)} disabled={busy} onClick={disable}>{L.turnOff}</button>
            </div>
          </div>
        )}

        {error && <div style={{ fontSize: 11.5, color: '#ef4444', marginTop: 8 }}>{error}</div>}
      </div>

      {key && (
        <div style={{ ...card, border: '1px solid #f97316', background: 'rgba(249,115,22,0.07)' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: t.text }}>{L.keyTitle}</div>
          <div style={{ ...small, marginTop: 2 }}>{L.keyNote}</div>
          {copyRow('key', '', key)}

          <div style={{ fontSize: 12.5, fontWeight: 700, color: t.text, marginTop: 14 }}>{L.howTitle}</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: t.textSub, marginTop: 8 }}>{L.claudeCode}</div>
          {copyRow('cmd', '', connectCommand(status?.url || '', key))}

          <div style={{ fontSize: 12, fontWeight: 600, color: t.textSub, marginTop: 14 }}>{L.otherApps}</div>
          {copyRow('addr', L.address, status?.url || '')}
          {copyRow('hdr', L.header, `Authorization: Bearer ${key}`)}

          <div style={{ ...small, marginTop: 12 }}>{L.reachNote}</div>
          <div style={{ marginTop: 10 }}>
            <button type="button" style={btn(true)} onClick={() => setKey(null)}>{L.hideKey}</button>
          </div>
        </div>
      )}
    </div>
  );
}
