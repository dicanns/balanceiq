/**
 * BILLDOC-001  the file a bill was read from is filed in the Vault on save
 * BILLDOC-002  filing the document never touches the ledger
 * BILLDOC-003  the row opens the document, and delete removes the file
 *
 * supplier_bills.vault_document_id existed and nothing ever wrote it: the reader
 * parsed the PDF and discarded it. The bill and the statement line proved
 * payment; the document itself, which is what an auditor asks for, was gone.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../../..');
const BILLS = fs.readFileSync(path.join(ROOT, 'src/components/BillsTab.jsx'), 'utf8');
const MAIN = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
const PRELOAD = fs.readFileSync(path.join(ROOT, 'preload.js'), 'utf8');

describe('BILLDOC-001 filed on save', () => {
  it('keeps the file path from the read and attaches it under the saved bill', () => {
    expect(BILLS).toMatch(/setRead\(prev => \(prev \? \{ \.\.\.prev, filePath: r\.filePath \|\| null \} : prev\)\);/);
    expect(BILLS).toMatch(/vault\.attach\(\{ entity_type: 'supplier_bill', entity_id: savedId, src_path: read\.filePath/);
    expect(BILLS).toMatch(/supplierBills\.setDocument\(savedId, att\.doc\.id\)/);
  });
});

describe('BILLDOC-002 no ledger side effect', () => {
  it('uses a dedicated call rather than the update that reposts', () => {
    expect(PRELOAD).toMatch(/setDocument:\(id, docId\)\s+=> ipcRenderer\.invoke\('supplier:bill:setDocument', id, docId\)/);
    expect(MAIN).toMatch(/ipcMain\.handle\('supplier:bill:setDocument', \(_e, id, docId\) => supplierBillSetDocument\(id, docId\)\);/);
  });
});

describe('BILLDOC-003 open and remove', () => {
  it('the row opens the document; deleting the bill unlinks the file inside the Vault only', () => {
    expect(BILLS).toMatch(/vault\.openById\(b\.vault_document_id\)/);
    expect(MAIN).toMatch(/for \(const rel of r\.documents \|\| \[\]\) \{\s*try \{\s*const abs = resolveVaultPath\(rel\);/);
  });
});
