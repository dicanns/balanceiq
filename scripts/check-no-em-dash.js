// CLAUDE.md rule 4, enforced: no em dash (U+2014) in any text file the
// repository tracks. Prints each offender with its line, then fails.
const { execSync } = require('child_process');
const fs = require('fs');

const TEXT = /\.(js|jsx|cjs|mjs|ts|tsx|md|html|css|json|yml|yaml|sql|txt|sh|toml)$/i;
const files = execSync('git ls-files -z', { encoding: 'utf8' })
  .split('\0')
  .filter(f => f && TEXT.test(f) && f !== 'package-lock.json');

let bad = 0;
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  if (!text.includes('\u2014')) continue;
  text.split('\n').forEach((line, i) => {
    if (!line.includes('\u2014')) return;
    bad++;
    if (bad <= 40) console.log(`${f}:${i + 1}: ${line.trim().slice(0, 100)}`);
  });
}
if (bad) {
  console.error(`\n${bad} em dash(es) found. Use a hyphen.`);
  process.exit(1);
}
console.log(`OK: no em dash in ${files.length} tracked text files`);
