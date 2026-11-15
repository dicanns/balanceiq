/**
 * CONN-080  list_ingredients, ingredient_price_history, list_recipes, get_recipe, waste_log
 *
 * The data functions are stubbed: they have their own tests. What is tested is
 * what a tool asks them for and what it hands to the AI.
 */
import { describe, it, expect } from 'vitest';
import { kitchenTools } from '../../connector/tools/kitchen.mjs';
import { checkArguments } from '../../connector/protocol.mjs';
import { expectWellFormed, expectPlainAnswer } from './_conformance.js';

const calls = {};
const ingredients = [
  { id: 1, name_fr: 'Boeuf haché', name_en: 'Ground beef', category: 'protein', default_unit: 'kg', current_unit_price: 10.5, last_price_update: '2026-06-01', supplier_id: 'Meat Co', pack_price_cents: 10500, pack_qty: 10, pack_unit: 'kg', secret_internal: 'x' },
  { id: 2, name_fr: 'Pain', name_en: 'Bun', category: 'bakery', default_unit: 'each', current_unit_price: 0.5, last_price_update: null, supplier_id: '', pack_price_cents: null, pack_qty: null, pack_unit: null },
  { id: 3, name_fr: 'Pain pita', name_en: 'Pita bread', category: 'bakery', default_unit: 'each', current_unit_price: 0.0915, last_price_update: null, supplier_id: '' },
];
const recipes = [
  { id: 10, name_fr: 'Burger maison', name_en: 'House burger', category: 'main', yield_qty: 2, yield_unit: 'portions', sell_price_cents: 1000, secret_internal: 'x' },
  { id: 11, name_fr: 'Sauce', name_en: 'Sauce', category: 'sauce', yield_qty: 0, yield_unit: 'L', sell_price_cents: null },
];
const recipeLines = {
  10: [
    { id: 100, recipe_id: 10, ingredient_id: 1, quantity: 0.4, unit: 'kg', name_fr: 'Boeuf haché', name_en: 'Ground beef', current_unit_price: 10.5, default_unit: 'kg', needs_verify: 0, secret_internal: 'x' },
    { id: 101, recipe_id: 10, ingredient_id: 2, quantity: 2, unit: 'each', name_fr: 'Pain', name_en: 'Bun', current_unit_price: 0.5, default_unit: 'each', needs_verify: 0 },
  ],
  11: [],
};
const history = [
  { id: 1, ingredient_id: 1, supplier_name: 'Meat Co', unit_price: 10.5, quantity: 10, unit: 'kg', invoice_date: '2026-06-01', invoice_ref: 'A1', secret_internal: 'x' },
  { id: 2, ingredient_id: 1, supplier_name: 'Meat Co', unit_price: 9.9, quantity: 10, unit: 'kg', invoice_date: '2026-05-01', invoice_ref: 'A0' },
  { id: 3, ingredient_id: 1, supplier_name: 'Farm Ltd', unit_price: 9.5, quantity: 5, unit: 'kg', invoice_date: '2026-04-01', invoice_ref: '' },
];
const waste = [
  { id: 1, date: '2026-06-03', ingredient_id: 2, category: 'bakery', quantity: 10, unit: 'each', reason: 'expired', shift: 'evening', unit_cost: 0.5, dollar_value: 5, notes: 'private note', secret_internal: 'x' },
  { id: 2, date: '2026-06-02', ingredient_id: null, category: 'other', quantity: 1, unit: 'kg', reason: 'dropped', shift: 'evening', unit_cost: null, dollar_value: null, notes: '' },
  { id: 3, date: '2026-06-01', ingredient_id: 1, category: 'protein', quantity: 0.5, unit: 'kg', reason: 'overcooked', shift: 'day', unit_cost: 10.5, dollar_value: 5.25, notes: '' },
];
const data = {
  ingredientsGetAll: (db) => { calls.ingDb = db; return ingredients; },
  priceHistoryGetForIngredient: (id, limit) => { calls.history = [id, limit]; return history.slice(0, limit); },
  recipesGetAll: () => recipes,
  recipeIngredientsGet: (id) => recipeLines[id] || [],
  wasteGetRange: (from, to) => { calls.waste = [from, to]; return waste; },
};
const ctx = { company: { id: 'co1', name: 'Demo Inc.' }, today: '2026-06-15', lang: 'en', level: 'read', db: { marker: 'db' }, data, kv: () => null };
const tool = (name) => kitchenTools.find((t) => t.name === name);
const run = (name, args = {}) => { expect(checkArguments(tool(name).inputSchema, args)).toBeNull(); const r = tool(name).run(args, ctx); expectPlainAnswer(r); return r; };

describe('CONN-080 kitchen tools', () => {
  it('are well formed', () => {
    expectWellFormed(kitchenTools);
    expect(kitchenTools.map((t) => t.name)).toEqual(['list_ingredients', 'ingredient_price_history', 'list_recipes', 'get_recipe', 'waste_log']);
  });

  it('list_ingredients names what is stored and nothing more', () => {
    const r = run('list_ingredients');
    expect(calls.ingDb).toEqual({ marker: 'db' });
    expect(r).toEqual({
      count: 3, truncated: false,
      ingredients: [
        { name: 'Bun', category: 'bakery', unit: 'each', unit_price: 0.5, price_updated: null, pack_price: null, pack_size: null, pack_unit: null, supplier: null },
        { name: 'Ground beef', category: 'protein', unit: 'kg', unit_price: 10.5, price_updated: '2026-06-01', pack_price: 105, pack_size: 10, pack_unit: 'kg', supplier: 'Meat Co' },
        { name: 'Pita bread', category: 'bakery', unit: 'each', unit_price: 0.0915, price_updated: null, pack_price: null, pack_size: null, pack_unit: null, supplier: null },
      ],
    });
    expect(JSON.stringify(r)).not.toContain('secret_internal');
  });

  it('list_ingredients searches in either language and cuts the list', () => {
    expect(run('list_ingredients', { search: 'pain' }).ingredients.map((i) => i.name)).toEqual(['Bun', 'Pita bread']);
    expect(run('list_ingredients', { search: 'GROUND' }).count).toBe(1);
    const cut = run('list_ingredients', { limit: 1 });
    expect([cut.count, cut.ingredients.length, cut.truncated]).toEqual([3, 1, true]);
    expect(checkArguments(tool('list_ingredients').inputSchema, { limit: 'many' })).not.toBeNull();
  });

  it('ingredient_price_history lists past prices, newest first', () => {
    const r = run('ingredient_price_history', { ingredient: 'beef' });
    expect(calls.history[0]).toBe(1);
    expect(r).toEqual({
      ingredient: 'Ground beef', unit: 'kg', current_price: 10.5, truncated: false,
      history: [
        { date: '2026-06-01', price: 10.5, unit: 'kg', supplier: 'Meat Co' },
        { date: '2026-05-01', price: 9.9, unit: 'kg', supplier: 'Meat Co' },
        { date: '2026-04-01', price: 9.5, unit: 'kg', supplier: 'Farm Ltd' },
      ],
    });
    expect(JSON.stringify(r)).not.toContain('secret_internal');
  });

  it('ingredient_price_history says when the history is cut, and checks its arguments', () => {
    const cut = run('ingredient_price_history', { ingredient: 'beef', limit: 2 });
    expect([cut.history.length, cut.truncated]).toEqual([2, true]);
    expect(checkArguments(tool('ingredient_price_history').inputSchema, {})).not.toBeNull();
  });

  it('ingredient_price_history explains when the name matches none or several', () => {
    expect(() => run('ingredient_price_history', { ingredient: 'truffle' })).toThrow(/No ingredient matches "truffle".*Bun/);
    expect(() => run('ingredient_price_history', { ingredient: 'pa' })).toThrow(/Several ingredients match "pa": Bun, Pita bread/);
    // an exact name (either language) wins over a longer one that contains it
    expect(run('ingredient_price_history', { ingredient: 'pain' }).ingredient).toBe('Bun');
  });

  it('list_recipes costs each recipe with the app helpers', () => {
    const r = run('list_recipes');
    expect(r).toEqual({
      count: 2, truncated: false,
      recipes: [
        { name: 'House burger', category: 'main', yield: { quantity: 2, unit: 'portions' }, total_cost: 5.2, cost_per_serving: 2.6, selling_price: 10, food_cost_pct: 26 },
        // no yield means no cost per serving, no price means no food cost percentage
        { name: 'Sauce', category: 'sauce', yield: { quantity: 0, unit: 'L' }, total_cost: 0, cost_per_serving: null, selling_price: null, food_cost_pct: null },
      ],
    });
    expect(JSON.stringify(r)).not.toContain('secret_internal');
  });

  it('list_recipes searches and cuts the list', () => {
    expect(run('list_recipes', { search: 'burger' }).recipes.map((x) => x.name)).toEqual(['House burger']);
    const cut = run('list_recipes', { limit: 1 });
    expect([cut.count, cut.recipes.length, cut.truncated]).toEqual([2, 1, true]);
  });

  it('get_recipe gives the lines and the totals', () => {
    const r = run('get_recipe', { recipe: 'house' });
    expect(r).toEqual({
      name: 'House burger', category: 'main', yield: { quantity: 2, unit: 'portions' },
      total_cost: 5.2, cost_per_serving: 2.6, selling_price: 10, food_cost_pct: 26,
      ingredients: [
        { ingredient: 'Ground beef', quantity: 0.4, unit: 'kg', unit_price: 10.5, price_unit: 'kg', line_cost: 4.2 },
        { ingredient: 'Bun', quantity: 2, unit: 'each', unit_price: 0.5, price_unit: 'each', line_cost: 1 },
      ],
    });
    expect(JSON.stringify(r)).not.toContain('secret_internal');
  });

  it('get_recipe refuses an unknown or ambiguous name', () => {
    expect(() => run('get_recipe', { recipe: 'pizza' })).toThrow(/No recipe matches "pizza"/);
    expect(() => run('get_recipe', { recipe: 'e' })).toThrow(/Several recipes match/);
    expect(checkArguments(tool('get_recipe').inputSchema, {})).not.toBeNull();
  });

  it('waste_log lists entries with the cost when stored, and totals only those', () => {
    const r = run('waste_log', { from: '2026-06-01', to: '2026-06-30' });
    expect(calls.waste).toEqual(['2026-06-01', '2026-06-30']);
    expect(r).toEqual({
      from: '2026-06-01', to: '2026-06-30', count: 3, total_cost: 10.25, entries_without_cost: 1, truncated: false,
      entries: [
        { date: '2026-06-03', item: 'Bun', quantity: 10, unit: 'each', reason: 'expired', cost: 5 },
        { date: '2026-06-02', item: 'other', quantity: 1, unit: 'kg', reason: 'dropped', cost: null },
        { date: '2026-06-01', item: 'Ground beef', quantity: 0.5, unit: 'kg', reason: 'overcooked', cost: 5.25 },
      ],
    });
    const text = JSON.stringify(r);
    expect(text).not.toContain('secret_internal');
    expect(text).not.toContain('private note');
  });

  it('waste_log cuts the list, checks its arguments and refuses a backwards period', () => {
    const cut = run('waste_log', { from: '2026-06-01', to: '2026-06-30', limit: 2 });
    expect([cut.count, cut.entries.length, cut.truncated, cut.total_cost]).toEqual([3, 2, true, 10.25]);
    expect(checkArguments(tool('waste_log').inputSchema, { from: '2026-06-01' })).not.toBeNull();
    expect(checkArguments(tool('waste_log').inputSchema, { from: 'June', to: '2026-06-30' })).not.toBeNull();
    expect(() => run('waste_log', { from: '2026-07-01', to: '2026-06-01' })).toThrow(/ends before it starts/);
  });
});
