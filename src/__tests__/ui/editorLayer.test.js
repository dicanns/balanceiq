/**
 * LAYER-001  an editor opens over the list instead of replacing it
 * LAYER-002  it sits below the modals it launches
 * LAYER-003  the Back buttons stand down inside it, and only there
 * LAYER-004  closing still happens after save and delete
 *
 * Phase 4 of the navigation rebuild. Every document editor was an early return
 * from FacturationTab, so opening an invoice discarded the list, the sub-tab, the
 * customer you came through and your scroll position, and the only way out was
 * one of two Back buttons that did not say where they went. The editor is now a
 * layer portaled over the list, which stays mounted underneath: closing it puts
 * you exactly where you were because you never left.
 *
 * The risks are all quiet ones. A layer stacked above the PDF preview would open
 * that preview invisibly behind it. Removing onBack would break the editors that
 * call it to close themselves after saving. And Escape bound carelessly closes a
 * half-typed invoice when all the user wanted was to dismiss an autocomplete.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = readFileSync(join(SRC, 'App.jsx'), 'utf8');

const tabStart = APP.indexOf('function FacturationTab({');
const TAB = APP.slice(tabStart, APP.indexOf('\n}\n', tabStart));
const layerStart = APP.indexOf('function EditorLayer({');
const LAYER = APP.slice(layerStart, APP.indexOf('\n}\n', layerStart));

const EDITORS = ['SoumissionEditor', 'CommandeEditor', 'FactureEditor', 'EncaissementEditor', 'NoteDeCreditEditor'];

describe('LAYER-001 an editor opens over the list', () => {
  it('no editor is an early return any more', () => {
    for (const name of EDITORS) {
      expect(TAB, `${name} still replaces the tab`).not.toMatch(new RegExp(`return<${name}\\b`));
    }
  });

  it('each document type assigns the layer instead', () => {
    expect((TAB.match(/editorEl=</g) || []).length).toBe(6);   // five editors, proforma reuses FactureEditor
  });

  it('the layer is portaled to the body, so it scrolls on its own', () => {
    expect(APP).toContain("import { createPortal } from 'react-dom';");
    expect(TAB).toMatch(/createPortal\(\s*<EditorLayer/);
    expect(TAB).toContain('document.body');
  });

  it('the list renders whether or not a document is open', () => {
    // Mounted as the first child of the list's own root, so the list underneath
    // keeps its sub-tab, its selected customer and its scroll position.
    expect(TAB).toContain('gap:0}}>{editorLayer}{/* Sub-nav */}');
  });

  it('the main list never assumed a closed document, so keeping it mounted is safe', () => {
    const main = TAB.slice(TAB.indexOf('{editorLayer}'));
    expect(main).not.toContain('activeDoc');
  });

  it('the layer is titled with the document, the same label as the breadcrumb', () => {
    expect(TAB).toMatch(/<EditorLayer title=\{_docLabel\}/);
  });
});

describe('LAYER-002 it sits below the modals it launches', () => {
  const modalZ = [...APP.matchAll(/position:\s*["']fixed["'],\s*inset:0,[^}]*?zIndex:\s*(\d+)/g)]
    .map(m => Number(m[1]))
    .filter(z => z !== 900);

  it('finds the existing modal overlays', () => {
    expect(modalZ.length).toBeGreaterThan(3);
  });

  it('is under every one of them', () => {
    const layerZ = Number(/zIndex:(\d+)/.exec(LAYER)[1]);
    expect(layerZ).toBe(900);
    expect(Math.min(...modalZ)).toBeGreaterThan(layerZ);
  });
});

describe('LAYER-003 the Back buttons stand down inside the layer only', () => {
  it('every editor accepts showBack', () => {
    for (const name of EDITORS) {
      expect(APP).toContain(`function ${name}({showBack,`);
    }
  });

  it('every Back-button cluster is guarded, and none is left bare', () => {
    expect((APP.match(/\{showBack!==false&&\(onBackToClient\?<>/g) || []).length).toBe(6);
    expect(APP).not.toMatch(/[^(]onBackToClient\?<><button onClick=\{onBackToList\}/);
  });

  it('the layer turns them off', () => {
    expect((TAB.match(/showBack=\{false\}/g) || []).length).toBe(6);
  });

  it('anywhere else an editor is used, the default still shows them', () => {
    // showBack!==false rather than showBack===true: an editor rendered without
    // the prop keeps its buttons, so nothing outside the layer changes.
    expect(APP).toContain('showBack!==false&&(');
  });
});

describe('LAYER-004 closing still works the way editors expect', () => {
  it('onBack stays wired to close, because editors call it after saving', () => {
    expect((TAB.match(/showBack=\{false\} onBack=\{closeDoc\}/g) || []).length).toBe(6);
    expect((APP.match(/onBack\(\)/g) || []).length).toBeGreaterThan(0);
  });

  it('the close button and Escape both close it', () => {
    expect(LAYER).toMatch(/<button onClick=\{onClose\}/);
    expect(LAYER).toContain('e.key!=="Escape"');
  });

  it('Escape in a field is left alone, so a half-typed value is not lost', () => {
    for (const tag of ['input', 'textarea', 'select']) {
      expect(LAYER).toContain(`tag==="${tag}"`);
    }
    expect(LAYER).toContain('isContentEditable');
  });

  it('a click on the backdrop does not close it', () => {
    // An editor has no unsaved-changes guard, so a stray click would lose work.
    const backdrop = /<div aria-hidden="true"[^>]*\/>/.exec(LAYER)[0];
    expect(backdrop).not.toContain('onClick');
  });

  it('focus moves into the layer and comes back when it closes', () => {
    expect(LAYER).toContain('sheetRef.current?.focus()');
    expect(LAYER).toContain('prev?.focus?.()');
  });

  it('it is announced as a dialog', () => {
    expect(LAYER).toContain('role="dialog"');
    expect(LAYER).toContain('aria-modal="true"');
  });

  it('respects reduced motion', () => {
    expect(LAYER).toContain('prefers-reduced-motion');
  });
});
