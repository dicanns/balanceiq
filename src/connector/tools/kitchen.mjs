// Ingredients, recipe costs and food waste.

import { calcRecipeCost, calcRecipeCostPerServing, calcFoodCostPct } from '../../utils/calculations.js';
import { ToolError, round2, dollars, dateArg, limitArg, clampLimit, capped, nameMatches } from './shared.mjs';

// Unit prices are often a fraction of a cent (a slice, a gram), so they keep four decimals.
const price4 = (n) => (n == null || n === '' || !Number.isFinite(Number(n)) ? null : Math.round(Number(n) * 10000) / 10000);
const pct1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

// The name in the language of the app, falling back to the other one.
const nameOf = (row, ctx) => (ctx.lang === 'fr' ? row.name_fr || row.name_en : row.name_en || row.name_fr) || '';
const matchesRow = (row, wanted) => nameMatches(row.name_fr, wanted) || nameMatches(row.name_en, wanted);

// One row to look up by part of its name: an exact name wins, else it must be the only match.
function findOne(rows, wanted, what, ctx) {
  const w = String(wanted || '').trim().toLowerCase();
  const exact = rows.filter((r) => [r.name_fr, r.name_en].some((n) => String(n || '').trim().toLowerCase() === w));
  const hits = exact.length === 1 ? exact : rows.filter((r) => matchesRow(r, wanted));
  if (hits.length === 1) return hits[0];
  const list = (hits.length ? hits : rows).slice(0, 15).map((r) => nameOf(r, ctx)).join(', ');
  if (!hits.length) throw new ToolError(`No ${what} matches "${wanted}". Known: ${list || 'none'}.`);
  throw new ToolError(`Several ${what}s match "${wanted}": ${list}. Give more of the name.`);
}

// What a recipe line costs: quantity times the ingredient's current unit price, as the Recipes tab does.
const lineCost = (l) => calcRecipeCost([{ quantity: Number(l.quantity) || 0, unitPrice: Number(l.current_unit_price) || 0 }]);

function recipeFigures(recipe, lines) {
  const total = calcRecipeCost(lines.map((l) => ({ quantity: Number(l.quantity) || 0, unitPrice: Number(l.current_unit_price) || 0 })));
  const perServing = calcRecipeCostPerServing(total, Number(recipe.yield_qty));
  const sell = Number(recipe.sell_price_cents) > 0 ? dollars(recipe.sell_price_cents) : null;
  const foodPct = sell != null && perServing != null ? calcFoodCostPct(perServing, sell) : null;
  return {
    yield: { quantity: Number(recipe.yield_qty) || 0, unit: recipe.yield_unit || '' },
    total_cost: round2(total),
    cost_per_serving: perServing == null ? null : round2(perServing),
    selling_price: sell,
    food_cost_pct: pct1(foodPct),
  };
}

const listIngredients = {
  name: 'list_ingredients',
  title: { en: 'List ingredients', fr: 'Lister les ingrédients' },
  description: 'The ingredients the business buys, with the current price per unit, the case or pack price and size when they are stored, and the supplier. Use it for "what does X cost" or "which ingredients do I have". Search by part of the name.',
  inputSchema: { type: 'object', additionalProperties: false, properties: { search: { type: 'string', description: 'Part of the ingredient name' }, limit: limitArg(500, 100) } },
  run(args, ctx) {
    const all = (ctx.data.ingredientsGetAll(ctx.db) || [])
      .filter((i) => matchesRow(i, args.search))
      .map((i) => ({
        name: nameOf(i, ctx),
        category: i.category || null,
        unit: i.default_unit || null,
        unit_price: price4(i.current_unit_price),
        price_updated: i.last_price_update || null,
        pack_price: Number(i.pack_price_cents) > 0 ? dollars(i.pack_price_cents) : null,
        pack_size: Number(i.pack_qty) > 0 ? Number(i.pack_qty) : null,
        pack_unit: Number(i.pack_qty) > 0 ? i.pack_unit || null : null,
        supplier: i.supplier_id || null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const { rows, truncated } = capped(all, clampLimit(args.limit, 500, 100));
    return { count: all.length, truncated, ingredients: rows };
  },
};

const ingredientPriceHistory = {
  name: 'ingredient_price_history',
  title: { en: 'Ingredient price history', fr: 'Historique de prix d\'un ingrédient' },
  description: 'What one ingredient cost on past supplier invoices, newest first: date, price per unit and supplier. Use it to see whether a price went up. Give part of the ingredient name; it must match exactly one ingredient.',
  inputSchema: {
    type: 'object', additionalProperties: false, required: ['ingredient'],
    properties: { ingredient: { type: 'string', description: 'Part of the ingredient name' }, limit: limitArg(100, 20) },
  },
  run(args, ctx) {
    const ing = findOne(ctx.data.ingredientsGetAll(ctx.db) || [], args.ingredient, 'ingredient', ctx);
    const limit = clampLimit(args.limit, 100, 20);
    // One more than asked, to know whether the history goes further back.
    const got = (ctx.data.priceHistoryGetForIngredient(ing.id, limit + 1) || []).map((h) => ({
      date: h.invoice_date || null,
      price: price4(h.unit_price),
      unit: h.unit || null,
      supplier: h.supplier_name || null,
    }));
    const { rows, truncated } = capped(got, limit);
    return { ingredient: nameOf(ing, ctx), unit: ing.default_unit || null, current_price: price4(ing.current_unit_price), truncated, history: rows };
  },
};

const listRecipes = {
  name: 'list_recipes',
  title: { en: 'List recipes', fr: 'Lister les recettes' },
  description: 'Recipes with their cost to make, cost per serving and, when a selling price is stored, the price and food cost percentage. Costs use the ingredients\' current prices. Use get_recipe for the ingredient lines of one recipe.',
  inputSchema: { type: 'object', additionalProperties: false, properties: { search: { type: 'string', description: 'Part of the recipe name' }, limit: limitArg(200, 100) } },
  run(args, ctx) {
    const all = (ctx.data.recipesGetAll(ctx.db) || [])
      .filter((r) => matchesRow(r, args.search))
      .map((r) => ({ name: nameOf(r, ctx), category: r.category || null, ...recipeFigures(r, ctx.data.recipeIngredientsGet(r.id, ctx.db) || []) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const { rows, truncated } = capped(all, clampLimit(args.limit, 200, 100));
    return { count: all.length, truncated, recipes: rows };
  },
};

const getRecipe = {
  name: 'get_recipe',
  title: { en: 'Open a recipe', fr: 'Ouvrir une recette' },
  description: 'One recipe in full: each ingredient line with its quantity, unit and cost, then the total cost, cost per serving, selling price and food cost percentage when stored. Give part of the recipe name; it must match exactly one recipe.',
  inputSchema: { type: 'object', additionalProperties: false, required: ['recipe'], properties: { recipe: { type: 'string', description: 'Part of the recipe name' } } },
  run(args, ctx) {
    const rec = findOne(ctx.data.recipesGetAll(ctx.db) || [], args.recipe, 'recipe', ctx);
    const lines = ctx.data.recipeIngredientsGet(rec.id, ctx.db) || [];
    return {
      name: nameOf(rec, ctx),
      category: rec.category || null,
      ...recipeFigures(rec, lines),
      ingredients: lines.map((l) => ({
        ingredient: nameOf(l, ctx),
        quantity: Number(l.quantity) || 0,
        unit: l.unit || null,
        unit_price: price4(l.current_unit_price),
        price_unit: l.default_unit || null,
        line_cost: round2(lineCost(l)),
      })),
    };
  },
};

const wasteLog = {
  name: 'waste_log',
  title: { en: 'Food waste log', fr: 'Registre des pertes' },
  description: 'Food waste recorded between two dates, newest first: date, item, quantity, unit, reason and the cost when it was stored, with the total cost of the entries that have one. Use it for "how much did we throw away".',
  inputSchema: {
    type: 'object', additionalProperties: false, required: ['from', 'to'],
    properties: { from: dateArg('First day of the period'), to: dateArg('Last day of the period'), limit: limitArg(500, 100) },
  },
  run(args, ctx) {
    if (args.from > args.to) throw new ToolError('The period ends before it starts.');
    const names = new Map((ctx.data.ingredientsGetAll(ctx.db) || []).map((i) => [i.id, nameOf(i, ctx)]));
    const entries = (ctx.data.wasteGetRange(args.from, args.to) || []).map((w) => ({
      date: w.date || null,
      item: names.get(w.ingredient_id) || w.category || '',
      quantity: Number(w.quantity) || 0,
      unit: w.unit || null,
      reason: w.reason || null,
      cost: w.dollar_value == null ? null : round2(w.dollar_value),
    }));
    const costed = entries.filter((e) => e.cost != null);
    const { rows, truncated } = capped(entries, clampLimit(args.limit, 500, 100));
    return {
      from: args.from,
      to: args.to,
      count: entries.length,
      total_cost: costed.length ? round2(costed.reduce((s, e) => s + e.cost, 0)) : null,
      entries_without_cost: entries.length - costed.length,
      truncated,
      entries: rows,
    };
  },
};

export const kitchenTools = [listIngredients, ingredientPriceHistory, listRecipes, getRecipe, wasteLog];
