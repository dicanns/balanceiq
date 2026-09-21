/**
 * DROP-001  a dropped bill gets its path from the preload, not from File.path
 *
 * Electron 44 removed File.path in the renderer. The drop zone read it, got
 * nothing, and did nothing, with no message.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(__dirname, '../../../..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

describe('DROP-001 the dropped file path', () => {
  it('comes from webUtils in the preload, and the drop zone says so when it cannot', () => {
    const preload = read('preload.js');
    expect(preload).toMatch(/const \{ contextBridge, ipcRenderer, webUtils \} = require\('electron'\)/);
    expect(preload).toMatch(/pathOfFile:\s+\(file\)\s+=> \{ try \{ return webUtils\.getPathForFile\(file\)/);
    const bills = read('src/components/BillsTab.jsx');
    expect(bills).toMatch(/window\.api\?\.supplierBills\?\.pathOfFile\?\.\(file\) \|\| file\.path \|\| null/);
    expect(bills).toMatch(/else setError\(T\.errDropNoPath\)/);
    expect((bills.match(/\berrDropNoPath:/g) || []).length).toBe(2);
  });
});
