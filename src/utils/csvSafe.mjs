// Free text that goes into a CSV / import file opened by a spreadsheet or an
// accounting package. One place, so every export treats it the same way:
// no tabs or line breaks inside a field, and nothing a spreadsheet would run as a
// formula. Use these for TEXT only; format numbers yourself (a negative amount
// must stay a number).

// Tabs and line breaks become one space.
export function flat(v) {
  return String(v == null ? '' : v).replace(/[\t\r\n]+/g, ' ');
}

// A field starting with = + - @ gets a leading apostrophe so it stays text.
// A plain number, negative included, is data and stays a number; anything else
// that opens with a formula character is text a spreadsheet must not run.
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

export function cell(v) {
  const t = flat(v);
  return /^[=+\-@]/.test(t) && !PLAIN_NUMBER.test(t) ? "'" + t : t;
}

// A text field ready for a comma-separated line: neutralized, then quoted
// (quotes doubled) when it holds a comma, a quote or leading/trailing space.
export function csvField(v) {
  const t = cell(v);
  return /[",]|^\s|\s$/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}
