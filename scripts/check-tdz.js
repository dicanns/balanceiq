#!/usr/bin/env node
/**
 * Temporal dead zone check.
 *
 * v1.60.0 shipped a `const tabs = [...]` whose array literal read `SECTIONS`,
 * declared forty lines further down the same function. It builds clean, every
 * test passes, and the app throws "Cannot access 'Nd' before initialization" on
 * the first render - a white screen, instantly, for every user.
 *
 * ESLint's no-use-before-define finds this, along with 130 harmless cases: a
 * useCallback referenced inside a useEffect is written before it is defined and
 * is completely fine, because the reference is evaluated later. A rule that
 * cannot tell those apart is not a gate anyone will keep.
 *
 * So this checks only what actually crashes: an initializer that reads a
 * later-declared binding *during the same synchronous evaluation* - that is, a
 * reference not sitting inside a nested function body. Sibling declarations in
 * one block, which is where the bug lives, and nothing else.
 */
const fs = require('fs');
const path = require('path');
const espree = require('espree');

const ROOT = path.join(__dirname, '..');
const TARGETS = [
  'src/App.jsx',
  ...fs.readdirSync(path.join(ROOT, 'src/components'))
    .filter(f => f.endsWith('.jsx')).map(f => `src/components/${f}`),
  ...fs.readdirSync(path.join(ROOT, 'src/utils'))
    .filter(f => f.endsWith('.js')).map(f => `src/utils/${f}`),
];

const FN_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

function walk(node, visit, parent = null) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, parent);
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    const child = node[key];
    if (Array.isArray(child)) child.forEach(c => c && typeof c.type === 'string' && walk(c, visit, node));
    else if (child && typeof child.type === 'string') walk(child, visit, node);
  }
}

// Names bound by a declarator's id, including destructuring.
function boundNames(id, out = []) {
  if (!id) return out;
  if (id.type === 'Identifier') out.push(id.name);
  else if (id.type === 'ObjectPattern') id.properties.forEach(p => boundNames(p.value || p.argument, out));
  else if (id.type === 'ArrayPattern') id.elements.forEach(e => e && boundNames(e, out));
  else if (id.type === 'AssignmentPattern') boundNames(id.left, out);
  else if (id.type === 'RestElement') boundNames(id.argument, out);
  return out;
}

// Identifiers an expression reads immediately, skipping anything inside a
// nested function - those run later, which is exactly the safe case.
function eagerRefs(node, out = new Set()) {
  if (!node || typeof node.type !== 'string') return out;
  if (FN_TYPES.has(node.type)) return out;
  if (node.type === 'Identifier') { out.add(node.name); return out; }
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    // `a.b` reads `a`, not `b`; `{ a: 1 }` declares a key, not a reference.
    if (node.type === 'MemberExpression' && key === 'property' && !node.computed) continue;
    if (node.type === 'Property' && key === 'key' && !node.computed) continue;
    const child = node[key];
    if (Array.isArray(child)) child.forEach(c => eagerRefs(c, out));
    else eagerRefs(child, out);
  }
  return out;
}

const findings = [];

for (const rel of TARGETS) {
  const file = path.join(ROOT, rel);
  const code = fs.readFileSync(file, 'utf8');
  let ast;
  try {
    ast = espree.parse(code, {
      ecmaVersion: 2022, sourceType: 'module', loc: true,
      ecmaFeatures: { jsx: true },
    });
  } catch (e) {
    console.error(`check:tdz - could not parse ${rel}: ${e.message}`);
    process.exitCode = 1;
    continue;
  }

  // Every block that can hold sibling const declarations.
  walk(ast, (node) => {
    const body = node.type === 'BlockStatement' || node.type === 'Program' ? node.body : null;
    if (!body) return;

    // name -> index of the statement that declares it, for this block only.
    const declaredAt = new Map();
    body.forEach((stmt, i) => {
      if (stmt.type !== 'VariableDeclaration' || stmt.kind === 'var') return;
      stmt.declarations.forEach(d => boundNames(d.id).forEach(n => {
        if (!declaredAt.has(n)) declaredAt.set(n, i);
      }));
    });

    body.forEach((stmt, i) => {
      if (stmt.type !== 'VariableDeclaration' || stmt.kind === 'var') return;
      stmt.declarations.forEach(d => {
        if (!d.init) return;
        const own = new Set(boundNames(d.id));
        for (const name of eagerRefs(d.init)) {
          if (own.has(name)) continue;                 // self-reference in a recursive arrow
          const at = declaredAt.get(name);
          if (at === undefined || at <= i) continue;   // not here, or already initialized
          findings.push({
            file: rel,
            line: d.init.loc.start.line,
            name,
            declaredLine: body[at].loc.start.line,
            holder: boundNames(d.id)[0] || '(pattern)',
          });
        }
      });
    });
  });
}

if (findings.length) {
  console.error('check:tdz - a value is read before it is initialized:\n');
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  '${f.holder}' reads '${f.name}', declared at line ${f.declaredLine}`);
  }
  console.error('\nThis throws "Cannot access X before initialization" on the first render.');
  console.error('Move the declaration above the one that reads it.\n');
  process.exit(1);
}

console.log(`OK: no temporal dead zone reads in ${TARGETS.length} files`);
