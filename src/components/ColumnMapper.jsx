import React from 'react';

/**
 * The failsafe for every file the app reads column by column.
 *
 * However good the guessing gets, some file will be read wrongly: two date
 * columns, an amount after the balance, no column titles at all. Rather than
 * leave the operator with a wrong import and no recourse, every import screen
 * shows the first rows of the file with a role picker over each column. What
 * the app guessed is filled in; anything wrong is one click from being right.
 *
 * Deliberately has no idea what it is mapping. The caller names the roles, so
 * the same grid serves bank statements, a chart of accounts, a sales forecast
 * and a payout file.
 */
export default function ColumnMapper({
  lines = [],
  roles = [],
  hasHeader = false,
  options = [],
  onRoles,
  onHasHeader,
  labels = {},
  preview = null,
  warnings = [],
  C = {},
  accent = '#f97316',
}) {
  if (!lines.length || !roles.length) return null;

  const text    = C.text    || '#e5e7eb';
  const sub     = C.sub     || '#9ca3af';
  const muted   = C.muted   || '#6b7280';
  const border  = C.border  || '#374151';
  const divider = C.divider || border;
  const setRole = (i, value) => onRoles && onRoles(roles.map((r, j) => (j === i ? value : r)));

  return (
    <div style={{ margin: '10px 0 4px', padding: '10px 12px', background: C.inputBg || 'rgba(148,163,184,0.06)', border: `1px solid ${border}`, borderRadius: 8 }}>
      {labels.title && <div style={{ fontSize: 12, fontWeight: 700, color: text }}>{labels.title}</div>}
      {labels.hint && <div style={{ fontSize: 10.5, color: muted, marginTop: 2, lineHeight: 1.45 }}>{labels.hint}</div>}

      {onHasHeader && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '8px 0', fontSize: 11.5, color: sub, cursor: 'pointer' }}>
          <input type='checkbox' checked={!!hasHeader} onChange={e => onHasHeader(e.target.checked)} style={{ accentColor: accent }} />
          {labels.hasHeader}
        </label>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>
              {roles.map((role, i) => (
                <th key={i} style={{ padding: '2px 4px', textAlign: 'left' }}>
                  <select
                    value={role}
                    onChange={e => setRole(i, e.target.value)}
                    aria-label={`${labels.columnLabel || 'Column'} ${i + 1}`}
                    style={{
                      background: C.inputBg || '#111827', border: `1px solid ${border}`, borderRadius: 5,
                      color: role === 'ignore' ? muted : text, fontSize: 10.5, padding: '2px 4px', outline: 'none',
                    }}
                  >
                    {options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((row, ri) => {
              const isHeaderRow = hasHeader && ri === 0;
              return (
                <tr key={ri} style={{ color: isHeaderRow ? muted : text, fontStyle: isHeaderRow ? 'italic' : 'normal' }}>
                  {roles.map((_, ci) => (
                    <td key={ci} style={{ padding: '2px 6px', borderTop: `1px solid ${divider}`, whiteSpace: 'nowrap', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {row[ci] ?? ''}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {preview && <div style={{ fontSize: 11, color: sub, marginTop: 8 }}>{labels.readsAs ? `${labels.readsAs}: ` : ''}{preview}</div>}
      {warnings.filter(Boolean).map((w, i) => (
        <div key={i} style={{ fontSize: 11, color: '#f59e0b', marginTop: 6 }}>{w}</div>
      ))}
    </div>
  );
}

/** A role per column, from a saved {role: columnIndex} map. */
export function rolesFromMap(map, width, keys) {
  const out = Array.from({ length: width }, () => 'ignore');
  for (const key of keys) {
    const idx = map ? map[key] : undefined;
    if (Number.isInteger(idx) && idx >= 0 && idx < width) out[idx] = key;
  }
  return out;
}

/** The saved {role: columnIndex} map, from a role per column. */
export function mapFromRoles(roles, hasHeader, keys) {
  const map = { hasHeader: !!hasHeader };
  roles.forEach((role, i) => { if (role !== 'ignore' && keys.includes(role)) map[role] = i; });
  return map;
}

/** Column titles to show when the file has none: "Column 1", "Column 2"... */
export function columnTitles(width, word = 'Column') {
  return Array.from({ length: width }, (_, i) => `${word} ${i + 1}`);
}
