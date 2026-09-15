import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { shouldRecalcDueDate } from '../../utils/invoiceDueDate.js';
import { addCatalogItem } from '../../utils/catalog.js';

const APP = fs.readFileSync(path.resolve(__dirname, '../../App.jsx'), 'utf8');
const between = (start, end) => {
  const a = APP.indexOf(start);
  return APP.slice(a, APP.indexOf(end, a + start.length));
};
const FACTURE_EDITOR = between('function FactureEditor(', '\nfunction EncaissementEditor(');
const PAYMENT_EDITOR = between('function EncaissementEditor(', '\nfunction ');
const CLIENT_PROFILE = between('function ClientProfile(', '\nfunction ClientsSection(');

describe('INVFIX due date follows the invoice date', () => {
  it('INVFIX-001 a blank due date is always filled', () => {
    expect(shouldRecalcDueDate({ hasDueDate: false })).toBe(true);
  });

  it('INVFIX-002 moving the invoice date moves the due date', () => {
    expect(shouldRecalcDueDate({ hasDueDate: true, dateChanged: true })).toBe(true);
  });

  it('INVFIX-003 a due date typed by hand survives a date change', () => {
    expect(shouldRecalcDueDate({ hasDueDate: true, dateChanged: true, dueDateTyped: true })).toBe(false);
  });

  it('INVFIX-004 a different client brings new terms, even over a typed date', () => {
    expect(shouldRecalcDueDate({ hasDueDate: true, clientChanged: true, dueDateTyped: true })).toBe(true);
  });

  it('INVFIX-005 nothing changed, nothing recalculated', () => {
    expect(shouldRecalcDueDate({ hasDueDate: true })).toBe(false);
  });

  it('INVFIX-006 the invoice editor marks a hand-typed due date', () => {
    expect(FACTURE_EDITOR).toMatch(/shouldRecalcDueDate\(/);
    expect(FACTURE_EDITOR).toMatch(/onChange=\{e=>\{dueDateTyped\.current=true;upd\(\{dateEcheance:/);
  });
});

describe('INVFIX quantity and price fields', () => {
  it('INVFIX-007 every line quantity and unit price selects its contents on focus', () => {
    for (const field of ['quantite', 'prixUnitaire']) {
      const all = APP.split(`value={l.${field}}`).length - 1;
      const selecting = APP.split(`value={l.${field}} onFocus={e=>e.target.select()}`).length - 1;
      expect(all).toBeGreaterThan(0);
      expect(selecting).toBe(all);
    }
  });
});

describe('INVFIX catalog items from an invoice', () => {
  const categories = [
    { id: 'c1', nom: 'Sauces', actif: true },
    { id: 'c2', nom: 'Services', actif: false },
  ];
  const produits = [{ id: 'p1', code: 'P001', description: 'Existing item', categorieId: 'c1' }];
  const genCode = (list) => `P${String(list.length + 1).padStart(3, '0')}`;

  it('INVFIX-008 adds a product to an existing category', () => {
    const r = addCatalogItem({ categories, produits, genCode, now: 1000,
      draft: { description: ' Test sauce ', categorieId: 'c1', prixUnitaire: '12.50', uniteMesure: 'caisse', tps: false, tvq: false } });
    expect(r.error).toBeUndefined();
    expect(r.product).toMatchObject({ id: '1000', code: 'P002', description: 'Test sauce', categorieId: 'c1', prixUnitaire: '12.50', tps: false, tvq: false, actif: true });
    expect(r.produits).toHaveLength(2);
    expect(r.categoriesChanged).toBe(false);
  });

  it('INVFIX-009 creates the category when a new name is given', () => {
    const r = addCatalogItem({ categories, produits, now: 2000,
      draft: { description: 'Consulting hour', categorieId: '__new__', newCategory: 'Consulting' } });
    expect(r.categoriesChanged).toBe(true);
    expect(r.categories).toHaveLength(3);
    const created = r.categories.find(c => c.nom === 'Consulting');
    expect(created.actif).toBe(true);
    expect(r.product.categorieId).toBe(created.id);
  });

  it('INVFIX-010 a new name matching an existing category reuses it and switches it back on', () => {
    const r = addCatalogItem({ categories, produits, now: 3000,
      draft: { description: 'Setup', categorieId: '__new__', newCategory: '  services ' } });
    expect(r.categories).toHaveLength(2);
    expect(r.product.categorieId).toBe('c2');
    expect(r.categories.find(c => c.id === 'c2').actif).toBe(true);
  });

  it('INVFIX-011 refuses an item with no description or no category', () => {
    expect(addCatalogItem({ categories, produits, draft: { description: '  ', categorieId: 'c1' } }).error).toBe('description_required');
    expect(addCatalogItem({ categories, produits, draft: { description: 'X', categorieId: '__new__', newCategory: '' } }).error).toBe('category_required');
    expect(addCatalogItem({ categories, produits, draft: { description: 'X', categorieId: 'missing' } }).error).toBe('category_required');
  });

  it('INVFIX-012 the invoice line picker offers a new item and saves it to the catalog', () => {
    expect(APP).toMatch(/import QuickProductModal from '\.\/components\/QuickProductModal\.jsx'/);
    expect(FACTURE_EDITOR).toMatch(/<option value="__new__">/);
    expect(FACTURE_EDITOR).toMatch(/if\(pid==="__new__"\)\{setQuickProductFor\(lid\);return;\}/);
    expect(FACTURE_EDITOR).toMatch(/<QuickProductModal [^>]*saveProduits=\{saveProduits\}/);
    const editors = APP.match(/editorEl=<FactureEditor [^\n]*/g) || [];
    expect(editors.length).toBeGreaterThan(0);
    for (const e of editors) expect(e).toMatch(/saveProduits=\{saveProduits\}/);
  });
});

describe('INVFIX deposits after an invoice is sent', () => {
  it('INVFIX-013 a sent invoice can record a deposit through the normal payment path', () => {
    expect(FACTURE_EDITOR).toMatch(/onEnregistrerPaiement\(\{\.\.\.form,id:savedId,numero:savedNumero\},\{deposit:true\}\)/);
    expect(APP).toMatch(/initialDeposit=\{!!activeDoc\.doc\?\.isDeposit\}/);
  });

  it('INVFIX-014 the payment keeps the deposit flag and still posts to the ledger', () => {
    expect(PAYMENT_EDITOR).toMatch(/isDeposit:!!initialDeposit/);
    expect(PAYMENT_EDITOR).toMatch(/\.\.\.\(form\.isDeposit\?\{isDeposit:true\}:\{\}\)/);
    expect(PAYMENT_EDITOR).toMatch(/ledger\?\.paymentPost/);
  });

  it('INVFIX-015 deposits are badged on the invoice and in the client profile', () => {
    expect(FACTURE_EDITOR).toMatch(/p\.isDeposit&&<span/);
    expect(CLIENT_PROFILE).toMatch(/p\.isDeposit&&<span/);
  });
});
