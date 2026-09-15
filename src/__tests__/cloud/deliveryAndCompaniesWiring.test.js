import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const APP = read('src/App.jsx');
const MAIN = read('main.js');
const PRELOAD = read('preload.js');
const between = (s, a, b) => s.slice(s.indexOf(a), s.indexOf(b, s.indexOf(a) + a.length));
const MODAL = between(APP, 'function EmailComposeModal(', '\n// ── DIRECT EMAIL HELPER');
const FE = between(APP, 'function FactureEditor(', '\nfunction EncaissementEditor(');

describe('DELIVWIRE invoice emails are tracked', () => {
  it('DELIVWIRE-001 the email window reports the Resend id and the view link', () => {
    expect(MODAL).toMatch(/onSuccess\(to\.trim\(\),\{direct:true,emailId:r\.id\|\|null,viewToken:/);
    expect(MODAL).toMatch(/onSuccess\(to\.trim\(\),\{direct:false\}\)/);
    expect(MODAL).toMatch(/escapeHtml\(view\.viewUrl\)/);
  });

  it('DELIVWIRE-002 the invoice records the send after its own save and shows the timeline', () => {
    expect(FE).toMatch(/setTimeout\(\(\)=>recordInvoiceEmail\(to,meta\),0\)/);
    expect(FE).toMatch(/window\.api\.invoiceView\.create\(/);
    expect(FE).toMatch(/<InvoiceDeliveryTimeline /);
  });

  it('DELIVWIRE-003 the app polls delivery and Today receives delivery items', () => {
    expect(APP).toMatch(/needsStatusCheck\(e,now\)/);
    expect(APP).toMatch(/window\.api\.invoiceView\.status\(/);
    expect(APP).toMatch(/emailItems:emailWorklistItems\(facFactures/);
    expect(read('src/services/todayWorklist.js')).toMatch(/for \(const it of emailItems \|\| \[\]\) items\.push\(it\)/);
  });

  it('DELIVWIRE-004 main process and preload expose status and view links', () => {
    expect(MAIN).toMatch(/ipcMain\.handle\('email:status'/);
    expect(MAIN).toMatch(/api\.resend\.com\/emails\/\$\{encodeURIComponent\(id\)\}/);
    expect(MAIN).toMatch(/ipcMain\.handle\('invoiceView:create'/);
    expect(MAIN).toMatch(/randomBytes\(24\)\.toString\('hex'\)/);
    expect(MAIN).toMatch(/https:\/\/balanceiq\.ca\/invoice\.html/);
    for (const k of ["'email:status'", "'invoiceView:create'", "'invoiceView:status'"]) expect(PRELOAD).toContain(k);
  });

  it('DELIVWIRE-005 the public page counts a view only when its script says the invoice is on screen', () => {
    const fn = read('supabase/functions/invoice-view/index.ts');
    const getBlock = between(fn, "if (req.method === 'GET' && !action)", "// ── Client: the invoice is on screen");
    expect(getBlock).not.toMatch(/record_invoice_view/);
    expect(fn).toMatch(/action === 'seen'[\s\S]*rpc\('record_invoice_view'/);
    expect(fn).toMatch(/action === 'create'[\s\S]*requireOrgMember/);
    expect(fn).toMatch(/action === 'status'[\s\S]*requireOrgMember/);
    const sql = read('supabase/migrations/20260915000002_invoice_view_links.sql');
    expect(sql).toMatch(/REVOKE ALL ON public\.invoice_view_links FROM anon, authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.record_invoice_view\(TEXT\) FROM PUBLIC, anon, authenticated/);
  });
});

describe('COMPWIRE companies are kept apart', () => {
  it('COMPWIRE-001 the database, backups and vault follow the active company', () => {
    const setAt = MAIN.indexOf('setDataDir(COMPANY_DATA_DIR)');
    expect(setAt).toBeGreaterThan(-1);
    expect(MAIN).toMatch(/const BACKUP_DIR = \(\) => path\.join\(COMPANY_DATA_DIR, 'Backups'\)/);
    expect(MAIN).toMatch(/companies\.vaultDirFor\(/);
    expect(read('src/db/database.js')).toMatch(/const dbPath = path\.join\(getDataDir\(\), 'balanceiq\.db'\)/);
  });

  it('COMPWIRE-002 each additional company gets its own window storage and a restart on switch', () => {
    expect(MAIN).toMatch(/partition: companies\.partitionFor\(ACTIVE_COMPANY\)/);
    expect(MAIN).toMatch(/app\.relaunch\(\); app\.quit\(\);/);
    for (const k of ['companies:list', 'companies:create', 'companies:switch', 'companies:bindOrg']) {
      expect(MAIN).toContain(`'${k}'`);
      expect(PRELOAD).toContain(`'${k}'`);
    }
  });

  it('COMPWIRE-003 an additional company without its own plan opens on the gate', () => {
    expect(APP).toMatch(/companyAccess\(\{isPrimary:false,cloudChecked,signedIn:!!cloudUser,plan:activePlan/);
    expect(APP).toMatch(/<CompanyPlanGate /);
    expect(APP).toMatch(/finally\{setCloudChecked\(true\);\}/);
    expect(APP).toMatch(/window\.api\.companies\.bindOrg\(\{orgId\}\)/);
    expect(APP).toMatch(/configSubTab==="companies"&&<CompaniesPanel /);
  });
});
