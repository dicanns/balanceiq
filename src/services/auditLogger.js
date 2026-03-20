// ── AUDIT LOGGER SERVICE ──────────────────────────────────────────────────────
// Central service for writing to the append-only audit_log table.
// RULES:
//   - Only INSERTs — never update or delete audit entries
//   - Financial field corrections ALWAYS require a reason
//   - All text displayed to the user is in French
// ─────────────────────────────────────────────────────────────────────────────

// Financial fields that require a reason when corrected after initial save.
// Keyed by module for quick lookup.
export const FINANCIAL_FIELDS = {
  daily: new Set([
    'posVentes','posTPS','posTVQ','posLivraisons',
    'float','interac','livraisons','deposits','finalCash',
    'hamEnd','hotEnd','hamReceived','hotReceived',
  ]),
  pl: new Set([
    // any supplier amount or expense amount — checked by prefix in isFinancialField()
    '__pl_supplier__','__pl_expense__','revenueOverride',
  ]),
  invoice: new Set([
    'montant','prixUnitaire','qte','remise','total','tps','tvq',
  ]),
  payment: new Set(['amount','date']),
  encaisse: new Set(['amount','montant','physicalCount']),
};

// Returns true if the given field in the given module is a financial field
export function isFinancialField(module, fieldName) {
  const set = FINANCIAL_FIELDS[module];
  if (!set) return false;
  if (set.has(fieldName)) return true;
  // P&L: any field starting with "supplier_" or "expense_" is financial
  if (module === 'pl' && (fieldName.startsWith('supplier_') || fieldName.startsWith('expense_'))) {
    return true;
  }
  return false;
}

// ── Core dispatcher ───────────────────────────────────────────────────────────

async function _log(entry) {
  try {
    await window.api.audit.log(entry);
  } catch (err) {
    // Never let audit failures crash the app — log to console only
    console.error('[AuditLogger] Failed to write entry:', err, entry);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * logCreate — called when any record is created for the first time.
 * @param {string} module      — 'daily' | 'invoice' | 'client' | etc.
 * @param {string} recordType  — e.g. 'facture' | 'soumission' | 'client' | 'caisse'
 * @param {string} recordId    — unique ID of the record
 * @param {object} newData     — full initial data snapshot
 */
export async function logCreate(module, recordType, recordId, newData) {
  await _log({
    module,
    action: 'create',
    recordType,
    recordId: String(recordId),
    newValue: typeof newData === 'string' ? newData : JSON.stringify(newData),
  });
}

/**
 * logUpdate — called when a non-financial field changes (no reason required).
 * @param {string} module
 * @param {string} recordType
 * @param {string} recordId
 * @param {string} fieldName
 * @param {*}      oldValue
 * @param {*}      newValue
 * @param {string} [reason]   — optional for non-financial fields
 */
export async function logUpdate(module, recordType, recordId, fieldName, oldValue, newValue, reason) {
  await _log({
    module,
    action: 'update',
    recordType,
    recordId: String(recordId),
    fieldName,
    oldValue: oldValue != null ? String(oldValue) : null,
    newValue: newValue != null ? String(newValue) : null,
    reason: reason ?? null,
  });
}

/**
 * logVoid — called when a record is cancelled/voided (NOT deleted).
 * Reason is REQUIRED.
 * @param {string} module
 * @param {string} recordType
 * @param {string} recordId
 * @param {string} reason
 */
export async function logVoid(module, recordType, recordId, reason) {
  await _log({
    module,
    action: 'void',
    recordType,
    recordId: String(recordId),
    reason: reason ?? '',
  });
}

/**
 * logCorrection — called when a financial field is changed after initial save.
 * Reason is ALWAYS required.
 * @param {string} module
 * @param {string} recordType
 * @param {string} recordId
 * @param {string} fieldName
 * @param {*}      oldValue
 * @param {*}      newValue
 * @param {string} reason     — REQUIRED
 */
export async function logCorrection(module, recordType, recordId, fieldName, oldValue, newValue, reason) {
  await _log({
    module,
    action: 'correct',
    recordType,
    recordId: String(recordId),
    fieldName,
    oldValue: oldValue != null ? String(oldValue) : null,
    newValue: newValue != null ? String(newValue) : null,
    reason: reason ?? '',
  });
}

/**
 * logRestore — called when data is restored from a JSON backup.
 * @param {string} restoreDate  — ISO date string of the backup file
 * @param {number} recordCount  — number of records restored
 */
export async function logRestore(restoreDate, recordCount) {
  await _log({
    module: 'config',
    action: 'restore',
    recordType: 'backup',
    recordId: restoreDate,
    newValue: String(recordCount),
    metadata: JSON.stringify({ restoreDate, recordCount }),
  });
}

// ── Correction dialog helper ──────────────────────────────────────────────────
// Shows the "Correction financière" dialog and returns the entered reason,
// or null if the user cancelled.

let _modalRoot = null;

function _getModalRoot() {
  if (!_modalRoot) {
    _modalRoot = document.createElement('div');
    _modalRoot.id = 'audit-modal-root';
    document.body.appendChild(_modalRoot);
  }
  return _modalRoot;
}

/**
 * promptCorrectionReason — shows a modal dialog asking the user to enter a
 * reason for a financial correction. Returns a Promise that resolves with
 * the entered reason string (never empty), or null if cancelled.
 *
 * @param {string} [fieldLabel] — optional human-readable field name for the message
 * @returns {Promise<string|null>}
 */
export function promptCorrectionReason(fieldLabel, lang = 'fr') {
  const isEN = lang === 'en';
  return new Promise((resolve) => {
    const root = _getModalRoot();
    root.innerHTML = '';

    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.7);
      display:flex;align-items:center;justify-content:center;
      z-index:9999;font-family:inherit;
    `;

    const box = document.createElement('div');
    box.style.cssText = `
      background:#1a1d27;border:1px solid #374151;border-radius:12px;
      padding:28px 32px;width:440px;max-width:90vw;
      box-shadow:0 20px 60px rgba(0,0,0,0.6);
    `;

    const title = document.createElement('h3');
    title.style.cssText = 'margin:0 0 8px;color:#f59e0b;font-size:1rem;font-weight:600;';
    title.textContent = isEN ? 'Financial correction' : 'Correction financière';

    const body = document.createElement('p');
    body.style.cssText = 'margin:0 0 16px;color:#9ca3af;font-size:0.875rem;line-height:1.5;';
    if (isEN) {
      body.textContent = fieldLabel
        ? `You are modifying the field "${fieldLabel}" which has already been saved. Please provide a reason:`
        : 'You are modifying a field that has already been saved. Please provide a reason:';
    } else {
      body.textContent = fieldLabel
        ? `Vous modifiez le champ « ${fieldLabel} » déjà enregistré. Veuillez indiquer la raison :`
        : 'Vous modifiez un champ déjà enregistré. Veuillez indiquer la raison :';
    }

    const input = document.createElement('textarea');
    input.rows = 3;
    input.placeholder = isEN ? 'Reason for correction…' : 'Raison de la correction…';
    input.style.cssText = `
      width:100%;box-sizing:border-box;padding:10px 12px;
      background:#0c0e14;border:1px solid #374151;border-radius:8px;
      color:#f9fafb;font-size:0.9rem;font-family:inherit;resize:vertical;
      outline:none;
    `;
    input.addEventListener('focus', () => { input.style.borderColor = '#f97316'; });
    input.addEventListener('blur',  () => { input.style.borderColor = '#374151'; });

    const errMsg = document.createElement('p');
    errMsg.style.cssText = 'margin:6px 0 0;color:#ef4444;font-size:0.8rem;min-height:1.2em;';

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;justify-content:flex-end;gap:10px;margin-top:18px;';

    const btnCancel = document.createElement('button');
    btnCancel.textContent = isEN ? 'Cancel' : 'Annuler';
    btnCancel.style.cssText = `
      padding:8px 18px;border-radius:8px;border:1px solid #374151;
      background:transparent;color:#9ca3af;font-size:0.875rem;cursor:pointer;
    `;

    const btnSave = document.createElement('button');
    btnSave.textContent = isEN ? 'Save' : 'Sauvegarder';
    btnSave.style.cssText = `
      padding:8px 18px;border-radius:8px;border:none;
      background:linear-gradient(135deg,#f97316,#ea580c);
      color:#fff;font-size:0.875rem;font-weight:600;cursor:pointer;
    `;

    function cleanup(result) {
      root.innerHTML = '';
      resolve(result);
    }

    btnCancel.addEventListener('click', () => cleanup(null));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(null); });

    btnSave.addEventListener('click', () => {
      const val = input.value.trim();
      if (!val) {
        errMsg.textContent = isEN ? 'A reason is required.' : 'La raison est obligatoire.';
        input.style.borderColor = '#ef4444';
        input.focus();
        return;
      }
      cleanup(val);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        btnSave.click();
      }
      if (e.key === 'Escape') cleanup(null);
    });

    btnRow.append(btnCancel, btnSave);
    box.append(title, body, input, errMsg, btnRow);
    overlay.appendChild(box);
    root.appendChild(overlay);

    // Auto-focus after paint
    requestAnimationFrame(() => input.focus());
  });
}
