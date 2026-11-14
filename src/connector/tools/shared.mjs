// What every connector tool is given, and the conventions its answers follow.
//
// A tool is { name, title: { en, fr }, description, inputSchema, readOnly, run(args, ctx) }.
//   name         snake_case, a verb or a question the owner would ask
//   title        what a person sees in their AI app and in BalanceIQ's activity line
//   description  written for the AI, in English: what it answers and when to use it
//   run          returns a plain object; throws ToolError for a message the reader should see
//
// ctx:
//   company  { id, name }
//   today    'YYYY-MM-DD' on this computer
//   lang     'en' | 'fr' (the language BalanceIQ is used in)
//   level    the access level of the caller (access.mjs)
//   db       pass it as the `_db` argument of data functions. In the app it is
//            undefined and each function uses the company's open books; tests
//            put their own database here.
//   data     the functions of src/db/database.js (call them with ctx.db)
//   kv(key)  a stored setting or list, parsed; null if absent. Keys that hold
//            credentials or the lock are never readable.
//
// Answers: money in dollars as numbers with two decimals, dates as YYYY-MM-DD,
// keys in English snake_case, lists capped with `truncated: true` when cut.
// A tool never returns a raw table row or a whole stored object: it names what
// it returns, so nothing private rides along by accident.

export { ToolError } from '../protocol.mjs';

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const dollars = (cents) => round2((Number(cents) || 0) / 100);

export const DATE_PATTERN = '^\\d{4}-\\d{2}-\\d{2}$';
export const dateArg = (description) => ({ type: 'string', pattern: DATE_PATTERN, description: `${description} (YYYY-MM-DD)` });
export const limitArg = (max, standard) => ({ type: 'integer', description: `Maximum rows to return (default ${standard}, at most ${max})` });
export const clampLimit = (value, max, standard) => Math.max(1, Math.min(max, Number.isInteger(value) ? value : standard));

export const NO_ARGS = { type: 'object', additionalProperties: false, properties: {} };

/** A list cut to a limit, saying so. */
export function capped(rows, limit) {
  return rows.length > limit ? { rows: rows.slice(0, limit), truncated: true } : { rows, truncated: false };
}

const contains = (text, part) => String(text || '').toLowerCase().includes(String(part || '').trim().toLowerCase());
export const nameMatches = (name, wanted) => !wanted || !String(wanted).trim() || contains(name, wanted);
