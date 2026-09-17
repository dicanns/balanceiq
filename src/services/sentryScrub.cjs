// What leaves the machine for Sentry: never an email address, an API key, a
// token, or the operator's home folder. Shared by the main process and the
// renderer so both scrub the same way. CommonJS so main.js can require it.
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const SECRET = /\b(sk_(?:live|test)_[A-Za-z0-9]+|rk_(?:live|test)_[A-Za-z0-9]+|re_[A-Za-z0-9_]{8,}|whsec_[A-Za-z0-9]+|sbp_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g;
const HOME = /(\/Users\/|\/home\/|[A-Z]:\\Users\\)[^/\\\s]+/g;

function scrubString(s) {
  return String(s).replace(SECRET, '[secret]').replace(EMAIL, '[email]').replace(HOME, '$1[user]');
}

function scrubDeep(value, depth = 0) {
  if (depth > 8) return value;
  if (typeof value === 'string') return scrubString(value);
  if (Array.isArray(value)) return value.map(v => scrubDeep(v, depth + 1));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = scrubDeep(v, depth + 1);
    return out;
  }
  return value;
}

function scrubEvent(event) {
  if (!event || typeof event !== 'object') return event;
  delete event.user;
  if (event.request) { delete event.request.cookies; delete event.request.headers; }
  return scrubDeep(event);
}

function scrubBreadcrumb(crumb) {
  if (!crumb || typeof crumb !== 'object') return crumb;
  return scrubDeep(crumb);
}

module.exports = { scrubString, scrubEvent, scrubBreadcrumb };
