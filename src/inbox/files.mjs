// Keeps the files of an inbox message on the computer, under <baseDir>/inbox/<itemId>/.
// Plain Node (fs, path) so it can be tested without Electron. Nothing here trusts a
// name or a type that came from an email: names are rebuilt, bytes are checked.
import fs from 'node:fs';
import path from 'node:path';

const ID_RE = /^[0-9a-f-]{36}$/;
const EXT_BY_TYPE = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

// The first bytes must say the same thing as the declared type.
function bytesMatch(type, buf) {
  if (type === 'application/pdf') return buf.length >= 4 && buf.toString('latin1', 0, 4) === '%PDF';
  if (type === 'image/png') return buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if (type === 'image/jpeg') return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (type === 'image/webp') return buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP';
  return false;
}

// A plain file name: no folders (either slash style), only letters, digits, space,
// dot, dash, underscore; the extension always comes from the type.
function safeName(name, ext) {
  let base = String(name == null ? '' : name).split(/[\\/]/).pop();
  base = base.replace(/\.[A-Za-z0-9]{1,5}$/, '');
  base = base.replace(/[^A-Za-z0-9 ._-]/g, '_').replace(/\.{2,}/g, '.').replace(/^[ .]+|[ .]+$/g, '');
  base = base.slice(0, 80 - (ext.length + 1)).replace(/[ .]+$/, '');
  if (!base || /^[_.\- ]+$/.test(base)) base = 'document';
  return `${base}.${ext}`;
}

function uniqueName(name, taken) {
  if (!taken.has(name.toLowerCase())) return name;
  const dot = name.lastIndexOf('.');
  const stem = name.slice(0, dot);
  const ext = name.slice(dot);
  for (let n = 2; ; n++) {
    const tail = ` (${n})${ext}`;
    const candidate = stem.slice(0, 80 - tail.length) + tail;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

export function saveInboxFiles(baseDir, itemId, attachments) {
  if (!ID_RE.test(String(itemId))) throw new Error('inbox: bad item id');
  const dir = path.join(baseDir, 'inbox', String(itemId));
  const files = [];
  let rejected = 0;
  const taken = new Set();
  for (const a of Array.isArray(attachments) ? attachments : []) {
    const type = a && String(a.type || '').toLowerCase();
    const ext = EXT_BY_TYPE[type];
    let buf = null;
    if (ext && typeof a.data_base64 === 'string') {
      try { buf = Buffer.from(a.data_base64, 'base64'); } catch (_) { buf = null; }
    }
    if (!ext || !buf || !bytesMatch(type, buf)) { rejected++; continue; }
    const name = uniqueName(safeName(a.name, ext), taken);
    taken.add(name.toLowerCase());
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), buf);
    files.push({ name, type, size: buf.length, path: `inbox/${itemId}/${name}` });
  }
  return { files, rejected };
}

export function removeInboxFiles(baseDir, itemId) {
  if (!ID_RE.test(String(itemId))) return;
  fs.rmSync(path.join(baseDir, 'inbox', String(itemId)), { recursive: true, force: true });
}

// The absolute path of a stored file, or null when the path would leave <baseDir>/inbox.
export function inboxFilePath(baseDir, relPath) {
  if (typeof relPath !== 'string' || !relPath || relPath.includes('\0')) return null;
  if (path.isAbsolute(relPath) || /^[A-Za-z]:/.test(relPath) || relPath.startsWith('\\')) return null;
  const root = path.resolve(baseDir, 'inbox');
  const full = path.resolve(baseDir, relPath);
  return full.startsWith(root + path.sep) ? full : null;
}
