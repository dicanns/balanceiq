// ── CATALOG ──────────────────────────────────────────────────────────────────
// Products & services is the one list of things you sell, and every item in it
// belongs to a category. An item added from inside an invoice lands in that same
// list, with a category, exactly as if it had been created on the Products screen,
// so it is in the picker next time and in the reports and accounting export.

const norm = (s) => String(s || '').trim().toLowerCase();

/**
 * Adds one item to the catalog, creating or reusing its category.
 * draft: { description, categorieId | '__new__', newCategory, prixUnitaire, uniteMesure, tps, tvq }
 * Returns { error } or { product, produits, categories, categoriesChanged }.
 */
export function addCatalogItem({ categories = [], produits = [], draft = {}, genCode = null, now = Date.now() } = {}) {
  const description = String(draft.description || '').trim();
  if (!description) return { error: 'description_required' };

  let nextCategories = categories;
  let categorieId = draft.categorieId;

  if (!categorieId || categorieId === '__new__') {
    const nom = String(draft.newCategory || '').trim();
    if (!nom) return { error: 'category_required' };
    // Typing the name of a category that already exists reuses it rather than
    // creating a twin, and brings it back if it had been switched off.
    const existing = categories.find(c => norm(c.nom) === norm(nom));
    if (existing) {
      categorieId = existing.id;
      if (existing.actif === false) {
        nextCategories = categories.map(c => (c.id === existing.id ? { ...c, actif: true } : c));
      }
    } else {
      const category = { id: `${now}c`, nom, compteRevenu: '', compteEscompte: '', description: '', actif: true };
      nextCategories = [...categories, category];
      categorieId = category.id;
    }
  } else if (!categories.some(c => c.id === categorieId)) {
    return { error: 'category_required' };
  }

  const product = {
    id: String(now),
    code: (typeof genCode === 'function' ? genCode(produits) : '') || '',
    description,
    categorieId,
    prixUnitaire: String(draft.prixUnitaire ?? '').trim(),
    uniteMesure: draft.uniteMesure || 'unité',
    tps: draft.tps !== false,
    tvq: draft.tvq !== false,
    notes: '',
    actif: true,
  };

  return {
    product,
    produits: [...produits, product],
    categories: nextCategories,
    categoriesChanged: nextCategories !== categories,
  };
}
