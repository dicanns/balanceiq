// Helpers for HTML that is generated in the renderer and loaded into print / PDF windows.
// Every user-controlled value must go through one of these before it is interpolated.

export function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

export const DEFAULT_ACCENT = '#f97316';

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGB_RE = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+|1\.0+)\s*)?\)$/;

// A colour that is safe inside CSS: strict hex or rgb()/rgba() only, else the fallback.
export function safeColor(value, fallback = DEFAULT_ACCENT) {
  const v = String(value ?? '').trim();
  return HEX_RE.test(v) || RGB_RE.test(v) ? v : fallback;
}

// An image source that is safe inside src="...": a raster/svg data URL or an https URL, else empty.
// The result is attribute-escaped.
export function safeImgSrc(value) {
  const v = String(value ?? '').trim();
  if (/^data:image\/(?:png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=\s]+$/i.test(v) || /^https:\/\/[^\s"'<>]+$/i.test(v)) return escapeHtml(v);
  return '';
}

// Plain text from an import: no control characters, no angle brackets.
export function stripMarkup(value) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
}
