import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const APP = read('src/App.jsx');
const WIZARD = read('src/components/OnboardingWizard.jsx');
const GATE = read('src/components/CompanyPlanGate.jsx');
const MAIN = read('main.js');
const I18N = read('src/i18n/translations.js');

describe('NEWCO language on a new company', () => {
  it('NEWCO-001 the setup wizard has a FR / EN switch on every step', () => {
    expect(WIZARD).toMatch(/function LangSwitch\(\{ lang, onChange \}\)/);
    expect(WIZARD).toMatch(/\{onLangChange && <LangSwitch lang=\{lang\} onChange=\{onLangChange\} \/>\}/);
    expect(APP).toMatch(/<OnboardingWizard lang=\{lang\} onLangChange=\{setLangTo\}/);
  });

  it('NEWCO-002 step 2 offers a real language choice, not a fixed label', () => {
    const info = WIZARD.slice(WIZARD.indexOf('function StepInfo('), WIZARD.indexOf('// Step 3'));
    expect(info).toMatch(/\[\['fr', 'Français'\], \['en', 'English'\]\]\.map/);
    expect(info).toMatch(/onClick=\{\(\) => onLangChange && onLangChange\(code\)\}/);
    expect(WIZARD).toMatch(/onBack=\{back\} onLangChange=\{onLangChange\} \/>/);
  });

  it('NEWCO-003 the company plan screen has the same switch', () => {
    expect(GATE).toMatch(/onLangChange = null/);
    expect(GATE).toMatch(/onClick=\{\(\) => onLangChange\(code\)\}/);
    expect(APP).toMatch(/<CompanyPlanGate lang=\{lang\} onLangChange=\{setLangTo\}/);
  });

  it('NEWCO-004 with no language chosen yet, the Mac\'s own language is used', () => {
    expect(MAIN).toMatch(/osLang: String\(app\.getLocale\(\) \|\| ''\)\.toLowerCase\(\)\.startsWith\('fr'\) \? 'fr' : 'en'/);
    expect(APP).toMatch(/else if\(cur\?\.osLang==="en"\|\|cur\?\.osLang==="fr"\)setLang\(cur\.osLang\);/);
  });
});

describe('NEWCO creating a BalanceIQ account', () => {
  it('NEWCO-005 sign-up asks for the password twice and blocks a mismatch', () => {
    expect(APP).toMatch(/placeholder=\{T\.cfgCloudPasswordConfirm\} type="password"/);
    expect(APP).toMatch(/if\(form\.password!==form\.password2\)\{setMsg\(\{ok:false,text:T\.cfgCloudPasswordMismatch\}\);return;\}/);
    expect(APP).toMatch(/disabled=\{loading\|\|!form\.email\|\|!form\.password\|\|form\.password!==form\.password2\|\|!form\.fullName\}/);
    expect(I18N.match(/cfgCloudPasswordConfirm:/g)).toHaveLength(2);
    expect(I18N.match(/cfgCloudPasswordMismatch:/g)).toHaveLength(2);
  });
});
