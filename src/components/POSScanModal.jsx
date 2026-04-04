import React, { useState, useRef, useCallback, useEffect } from 'react';
import pdfjsWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.js?url';

// ── Image preprocessing for Tesseract (grayscale + contrast binarization) ───
function preprocessCanvasForOCR(srcCanvas) {
  const canvas = document.createElement('canvas');
  canvas.width = srcCanvas.width;
  canvas.height = srcCanvas.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(srcCanvas, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Find min/max luminance for contrast stretching
  let min = 255, max = 0;
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (lum < min) min = lum;
    if (lum >max) max = lum;
  }
  const range = max - min || 1;

  for (let i = 0; i< data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const normalized = ((lum - min) / range) * 255;
    // Adaptive threshold: binarize
    const val = normalized >128 ? 255 : 0;
    data[i] = val; data[i + 1] = val; data[i + 2] = val;
    // keep alpha
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// ── Render PDF first page to canvas ─────────────────────────────────────────
async function renderPDFToCanvas(base64Data) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.js');
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

  const binaryStr = atob(base64Data);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i< binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

  const pdf = await pdfjsLib.getDocument({ data: bytes, disableWorker: true }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2.0 }); // 2x for better OCR accuracy

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

// ── Decode base64 image to canvas ────────────────────────────────────────────
function imageBase64ToCanvas(base64Data, mimeType) {
  return new Promise((resolve, reject) =>{
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext('2d').drawImage(img, 0, 0);
      resolve(canvas);
    };
    img.onerror = reject;
    img.src = `data:${mimeType};base64,${base64Data}`;
  });
}

// ── Seed templates ───────────────────────────────────────────────────────────
const SEED_TEMPLATES = [
  {
    id: 'seed-maitre-d',
    pos_system: "Maitre D'",
    pos_version: '',
    language: 'fr',
    is_community: 0,
    uploaded: 0,
    patterns: JSON.stringify([
      { field: 'ventes_avant_taxes', label_regex: '(VENTES\\s+NETTES?|NET\\s+SALES?|Ventes?\\s+avant\\s+taxes?|SALES\\s+BEFORE\\s+TAX)', value_regex: '\\$?[\\d,]+\\.\\d{2}', position_hint: 'after_label_same_line', confidence_weight: 1.0 },
      { field: 'tps', label_regex: '(T\\.?P\\.?S\\.?|G\\.?S\\.?T\\.?|TPS|GST)(?!\\s+sur)', value_regex: '\\$?[\\d,]+\\.\\d{2}', position_hint: 'after_label_same_line', confidence_weight: 1.0 },
      { field: 'tvq', label_regex: '(T\\.?V\\.?Q\\.?|Q\\.?S\\.?T\\.?|TVQ|QST)(?!\\s+sur)', value_regex: '\\$?[\\d,]+\\.\\d{2}', position_hint: 'after_label_same_line', confidence_weight: 1.0 },
      { field: 'interac', label_regex: '(INTERAC|D[ée]bit\\s+direct|DEBIT\\s+DIRECT|DEBIT)', value_regex: '\\$?[\\d,]+\\.\\d{2}', position_hint: 'after_label_same_line', confidence_weight: 0.9 },
      { field: 'livraisons', label_regex: '(LIVRAISON|DELIVERY|DOORDASH|UBER\\s*EATS?|SKIP)', value_regex: '\\$?[\\d,]+\\.\\d{2}', position_hint: 'after_label_same_line', confidence_weight: 0.7 },
      { field: 'nb_transactions', label_regex: '(NB\\.?\\s*TRANS|TRANSACTIONS?|# TRANS)', value_regex: '\\d+', position_hint: 'after_label_same_line', confidence_weight: 0.8 },
    ]),
    metadata: JSON.stringify({ header_pattern: 'RAPPORT', footer_pattern: 'FIN' }),
  },
  {
    id: 'seed-square',
    pos_system: 'Square',
    pos_version: '',
    language: 'fr',
    is_community: 0,
    uploaded: 0,
    patterns: JSON.stringify([
      { field: 'ventes_avant_taxes', label_regex: '(Gross\\s+Sales?|Total\\s+Sales?|Net\\s+Sales?|VENTES\\s+BRUTES?)', value_regex: '\\$?[\\d,]+\\.\\d{2}', position_hint: 'after_label_same_line', confidence_weight: 1.0 },
      { field: 'tps', label_regex: '(GST|TPS|Tax\\s+1)', value_regex: '\\$?[\\d,]+\\.\\d{2}', position_hint: 'after_label_same_line', confidence_weight: 1.0 },
      { field: 'tvq', label_regex: '(QST|TVQ|Tax\\s+2|PST)', value_regex: '\\$?[\\d,]+\\.\\d{2}', position_hint: 'after_label_same_line', confidence_weight: 1.0 },
      { field: 'interac', label_regex: '(Debit|Interac|INTERAC)', value_regex: '\\$?[\\d,]+\\.\\d{2}', position_hint: 'after_label_same_line', confidence_weight: 0.9 },
      { field: 'especes', label_regex: '(Cash|Espèces?|CASH)', value_regex: '\\$?[\\d,]+\\.\\d{2}', position_hint: 'after_label_same_line', confidence_weight: 0.85 },
      { field: 'livraisons', label_regex: '(Delivery|Doordash|Uber|Skip)', value_regex: '\\$?[\\d,]+\\.\\d{2}', position_hint: 'after_label_same_line', confidence_weight: 0.7 },
      { field: 'nb_transactions', label_regex: '(Transactions?|Orders?|# Transactions?)', value_regex: '\\d+', position_hint: 'after_label_same_line', confidence_weight: 0.8 },
    ]),
    metadata: JSON.stringify({ header_pattern: 'Square', footer_pattern: '' }),
  },
  {
    id: 'seed-lightspeed',
    pos_system: 'Lightspeed',
    pos_version: '',
    language: 'fr',
    is_community: 0,
    uploaded: 0,
    patterns: JSON.stringify([
      { field: 'ventes_avant_taxes', label_regex: '(Net\\s+Sales?|Subtotal|Total\\s+before\\s+tax|Sous-total)', value_regex: '\\$?[\\d,]+\\.\\d{2}', position_hint: 'after_label_same_line', confidence_weight: 1.0 },
      { field: 'tps', label_regex: '(GST|TPS|Tax\\s+GST)', value_regex: '\\$?[\\d,]+\\.\\d{2}', position_hint: 'after_label_same_line', confidence_weight: 1.0 },
      { field: 'tvq', label_regex: '(QST|TVQ|Tax\\s+QST)', value_regex: '\\$?[\\d,]+\\.\\d{2}', position_hint: 'after_label_same_line', confidence_weight: 1.0 },
      { field: 'interac', label_regex: '(Debit|Interac|Card)', value_regex: '\\$?[\\d,]+\\.\\d{2}', position_hint: 'after_label_same_line', confidence_weight: 0.9 },
      { field: 'especes', label_regex: '(Cash|Espèces?)', value_regex: '\\$?[\\d,]+\\.\\d{2}', position_hint: 'after_label_same_line', confidence_weight: 0.85 },
      { field: 'nb_transactions', label_regex: '(Transactions?|Receipts?)', value_regex: '\\d+', position_hint: 'after_label_same_line', confidence_weight: 0.8 },
    ]),
    metadata: JSON.stringify({ header_pattern: 'Lightspeed', footer_pattern: '' }),
  },
];

// ── Field display config ──────────────────────────────────────────────────────
const FIELD_KEYS = ['ventes_avant_taxes', 'tps', 'tvq', 'interac', 'especes', 'livraisons', 'nb_transactions'];

function getFieldLabel(fieldKey, T) {
  const map = {
    ventes_avant_taxes: T.scanFieldVentes,
    tps: T.scanFieldTps,
    tvq: T.scanFieldTvq,
    interac: T.scanFieldInterac,
    especes: T.scanFieldCash,
    livraisons: T.scanFieldLivraisons,
    nb_transactions: T.scanFieldTransactions,
  };
  return map[fieldKey] || fieldKey;
}

// ── Template scoring engine ───────────────────────────────────────────────────
function scoreTemplate(ocrText, template) {
  const patterns = JSON.parse(template.patterns || '[]');
  if (!patterns.length) return 0;
  const upperText = ocrText.toUpperCase();
  let hits = 0;
  for (const p of patterns) {
    try {
      if (new RegExp(p.label_regex, 'i').test(upperText)) hits++;
    } catch (_) { /* bad regex — skip */ }
  }
  return hits / patterns.length;
}

function findBestTemplate(ocrText, templates) {
  let best = null, bestScore = 0;
  for (const tpl of templates) {
    const score = scoreTemplate(ocrText, tpl);
    if (score > bestScore) { best = tpl; bestScore = score; }
  }
  return { template: bestScore >= 0.5 ? best : null, score: bestScore };
}

// ── Value extraction with a matched template ──────────────────────────────────
function extractWithTemplate(ocrText, template) {
  const patterns = JSON.parse(template.patterns || '[]');
  const result = {};
  for (const p of patterns) {
    try {
      const labelRe = new RegExp(p.label_regex, 'ig');
      const valueRe = new RegExp(p.value_regex, 'g');
      const labelMatch = labelRe.exec(ocrText);
      if (!labelMatch) continue;
      const afterLabel = ocrText.slice(labelMatch.index + labelMatch[0].length, labelMatch.index + labelMatch[0].length + 120);
      const valueMatch = valueRe.exec(afterLabel);
      if (valueMatch) {
        const raw = valueMatch[0].replace(/[$,\s]/g, '');
        const num = parseFloat(raw);
        if (!isNaN(num)) {
          const conf = p.confidence_weight >= 1.0 ? 'high' : p.confidence_weight >= 0.8 ? 'medium' : 'low';
          result[p.field] = { value: num, confidence: conf, rawLabel: labelMatch[0].trim() };
        }
      }
    } catch (_) { /* skip bad pattern */ }
  }
  return result;
}

// ── Parse raw OCR lines for mapping UI ──────────────────────────────────────
function parseOCRLines(text) {
  // Extract lines that contain a dollar amount or number
  const lines = text.split('\n').map((l, i) => ({ idx: i, raw: l.trim() })).filter(l => l.raw.length > 1);
  const moneyRe = /\$?[\d,]+\.\d{2}/;
  const numRe = /\b\d+\b/;
  return lines.map(l => ({
    ...l,
    hasValue: moneyRe.test(l.raw) || (numRe.test(l.raw) && l.raw.length< 40),
    extractedValue: (() =>{
      const m = moneyRe.exec(l.raw);
      if (m) return parseFloat(m[0].replace(/[$,]/g, ''));
      const n = numRe.exec(l.raw);
      return n ? parseFloat(n[0]) : null;
    })(),
  })).filter(l => l.hasValue);
}

// ── Confidence badge component ────────────────────────────────────────────────
function ConfBadge({ conf, T }) {
  const map = {
    high: { bg: 'rgba(34,197,94,0.12)', color: '#16a34a', text: T.scanHighConf },
    medium: { bg: 'rgba(249,115,22,0.12)', color: '#ea580c', text: T.scanMedConf },
    low: { bg: 'rgba(239,68,68,0.12)', color: '#dc2626', text: T.scanLowConf },
  };
  const s = map[conf] || map.low;
  return (<span style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: s.bg, color: s.color }}>{s.text}</span>);
}

// ── Main component ────────────────────────────────────────────────────────────
export default function POSScanModal({ isOpen, onClose, onApply, caisseIndex, date, T, t, apiConfig, cloudUser, canUseCloud }) {
  const [step, setStep] = useState('idle'); // idle | processing | confirm | mapping | sharing | history
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [error, setError] = useState(null);

  // OCR results
  const [ocrText, setOcrText] = useState('');
  const [ocrLines, setOcrLines] = useState([]);
  const [matchedTemplate, setMatchedTemplate] = useState(null);
  const [matchScore, setMatchScore] = useState(0);
  const [scanEngine, setScanEngine] = useState('tesseract');

  // Extracted fields: { fieldKey: { value, confidence, rawLabel } }
  const [extractedFields, setExtractedFields] = useState({});
  // Per-row field assignment overrides in confirm panel: rowId → fieldKey
  const [rowAssignments, setRowAssignments] = useState({});
  // Editable values in confirm panel: rowId → number string
  const [rowValues, setRowValues] = useState({});
  // Unmatched values from cloud OCR
  const [unmatchedValues, setUnmatchedValues] = useState([]);

  // Mapping UI state
  const [posSystemName, setPosSystemName] = useState('');
  const [selectedLine, setSelectedLine] = useState(null); // idx of selected left line
  const [lineFieldAssignments, setLineFieldAssignments] = useState({}); // lineIdx → fieldKey
  const [lineValueOverrides, setLineValueOverrides] = useState({}); // fieldKey → value

  // Templates
  const [templates, setTemplates] = useState([]);

  // Sharing
  const [savedTemplateData, setSavedTemplateData] = useState(null);
  const [shareStatus, setShareStatus] = useState(null); // null | 'uploading' | 'done' | 'error'

  // Scan history
  const [historyEntries, setHistoryEntries] = useState([]);

  // Stored preprocessed PNG for Tesseract supplement after cloud OCR
  const [supplementPng, setSupplementPng] = useState(null);

  const isProCloud = canUseCloud;

  // ── Load templates on open ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    loadTemplates();
  }, [isOpen]);

  async function loadTemplates() {
    try {
      const dbTemplates = await window.api.posScan.templates.getAll();
      // Merge DB templates with seeds (DB entries override seeds with same id)
      const merged = [...SEED_TEMPLATES];
      for (const t of dbTemplates) {
        const idx = merged.findIndex(s => s.id === t.id);
        if (idx >= 0) merged[idx] = t;
        else merged.push(t);
      }
      setTemplates(merged);
    } catch (_) {
      setTemplates(SEED_TEMPLATES);
    }
  }

  // ── Reset state on close ────────────────────────────────────────────────────
  function handleClose() {
    setStep('idle');
    setProgress(0);
    setError(null);
    setOcrText('');
    setOcrLines([]);
    setMatchedTemplate(null);
    setExtractedFields({});
    setRowAssignments({});
    setRowValues({});
    setUnmatchedValues([]);
    setPosSystemName('');
    setSelectedLine(null);
    setLineFieldAssignments({});
    setLineValueOverrides({});
    setSavedTemplateData(null);
    setShareStatus(null);
    onClose();
  }

  // ── Main scan flow ──────────────────────────────────────────────────────────
  async function handleScan() {
    setError(null);
    setStep('processing');
    setProgress(5);
    setProgressLabel(T.scanProcessing);

    try {
      // 1. Open file picker
      const fileResult = await window.api.posScan.selectFile();
      if (!fileResult) { setStep('idle'); return; }

      const { base64, mimeType } = fileResult;
      setProgress(10);

      // 2. Prepare image for OCR
      let canvas;
      if (mimeType === 'application/pdf') {
        setProgressLabel(T.scanProcessing);
        canvas = await renderPDFToCanvas(base64);
      } else {
        canvas = await imageBase64ToCanvas(base64, mimeType);
      }
      setProgress(25);

      // Convert canvas to PNG base64 for cloud OCR (Claude Haiku needs image, not PDF)
      const canvasPngBase64 = canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');

      let rawText = '';
      let engine = 'tesseract';
      let cloudFields = null;

      // 3. Choose OCR engine
      if (isProCloud) {
        try {
          setProgressLabel(T.scanEngineCloud + '…');
          // Always send as PNG image (rendered from PDF if needed) — Claude Haiku is image-only
          const result = await runCloudOCR(canvasPngBase64, 'image/png');
          if (result && result.fields) {
            cloudFields = result;
            engine = 'claude-haiku';
            setScanEngine('claude-haiku');
          } else {
            throw new Error(result?.error || 'no_data');
          }
        } catch (cloudErr) {
          // Fall back to Tesseract
          console.warn('Cloud OCR failed, falling back to Tesseract:', cloudErr.message);
          setError(T.scanErrorCloud);
          setTimeout(() => setError(null), 3000);
        }
      }

      // Always preprocess and store PNG so cloud results can be supplemented with Tesseract later
      const preprocessed = preprocessCanvasForOCR(canvas);
      const preprocessedPng = preprocessed.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
      setSupplementPng(preprocessedPng);

      if (!cloudFields) {
        // Tesseract path — run in main process via IPC (avoids Web Worker CDN issues in Electron)
        setProgressLabel('Tesseract OCR…');
        setProgress(40);
        rawText = await window.api.posScan.runOCR(preprocessedPng);
        setScanEngine('tesseract');
        setProgress(85);
      }

      setProgress(90);

      // 4. Match template or parse cloud result
      if (cloudFields) {
        // Cloud OCR gave structured data directly
        const fields = {};
        for (const [k, v] of Object.entries(cloudFields.fields || {})) {
          if (v && v.value != null) fields[k] = v;
        }
        setExtractedFields(fields);
        setUnmatchedValues(cloudFields.unmatched_values || []);
        setPosSystemName(cloudFields.pos_system || '');
        const matchedTpl = templates.find(t2 => t2.pos_system === cloudFields.pos_system) || null;
        setMatchedTemplate(matchedTpl);
        setMatchScore(matchedTpl ? 1.0 : 0);
        // Init row state
        initRowState(fields, cloudFields.unmatched_values || []);
        setOcrText('');
        setStep('confirm');
      } else {
        // Tesseract path — match template
        setOcrText(rawText);
        const { template, score } = findBestTemplate(rawText, templates);
        setMatchedTemplate(template);
        setMatchScore(score);

        if (template) {
          const fields = extractWithTemplate(rawText, template);
          setExtractedFields(fields);
          setPosSystemName(template.pos_system || '');
          initRowState(fields, []);
          setStep('confirm');
        } else {
          // Unknown format — go to mapping UI
          const lines = parseOCRLines(rawText);
          setOcrLines(lines);
          setStep('mapping');
        }
      }

      setProgress(100);

      // Log to history (use local vars — React state not yet flushed at this point)
      try {
        const _tplId = cloudFields
          ? (templates.find(t2 => t2.pos_system === cloudFields.pos_system)?.id || null)
          : (findBestTemplate(rawText, templates).template?.id || null);
        const _fields = cloudFields
          ? Object.fromEntries(Object.entries(cloudFields.fields || {}).filter(([,v]) => v?.value != null).map(([k,v]) => [k, v.value]))
          : (findBestTemplate(rawText, templates).template ? Object.fromEntries(Object.entries(extractWithTemplate(rawText, findBestTemplate(rawText, templates).template)).map(([k,v]) => [k, v.value])) : {});
        await window.api.posScan.history.save({
          date_key: date || new Date().toISOString().slice(0, 10),
          caisse_index: caisseIndex || 0,
          template_id: _tplId,
          raw_text: rawText.slice(0, 5000),
          extracted_values: JSON.stringify(_fields),
          applied_values: '{}',
          corrections_made: 0,
          scan_source: mimeType === 'application/pdf' ? 'pdf' : 'image',
          ocr_engine: engine,
        });
      } catch (_) { /* non-critical */ }

    } catch (err) {
      console.error('POS scan error:', err);
      setError(T.scanErrorOCR + ': ' + (err?.message ?? String(err)));
      setStep('idle');
    }
  }

  function initRowState(fields, unmatched) {
    const assignments = {};
    const values = {};
    for (const [k, v] of Object.entries(fields)) {
      assignments[k] = k; // default: field assigned to itself
      values[k] = String(v.value ?? '');
    }
    for (const u of unmatched) {
      const key = 'unmatched_' + u.label.replace(/\s+/g, '_');
      assignments[key] = '';
      values[key] = String(u.value ?? '');
    }
    setRowAssignments(assignments);
    setRowValues(values);
  }

  // ── Cloud OCR via Supabase edge function ────────────────────────────────────
  async function runCloudOCR(base64, mimeType) {
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = await import('../services/supabase.js');
    const { supabase } = await import('../services/supabase.js');
    const { data: sd } = await supabase.auth.getSession();
    const authToken = sd?.session?.access_token || SUPABASE_ANON_KEY;

    const orgId = apiConfig?.cloudOrgId || null;

    const res = await fetch(`${SUPABASE_URL}/functions/v1/pos-scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ image: base64, imageType: mimeType, orgId }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  // ── Supplement cloud OCR with Tesseract for missing fields ──────────────────
  async function handleSupplementWithTesseract() {
    if (!supplementPng) return;
    setError(null);
    setStep('processing');
    setProgress(20);
    setProgressLabel('Tesseract OCR…');
    try {
      const rawText = await window.api.posScan.runOCR(supplementPng);
      setProgress(80);
      // Try to extract fields from Tesseract text
      const { template } = findBestTemplate(rawText, templates);
      const tessFields = template ? extractWithTemplate(rawText, template) : {};
      // Merge: only fill in fields missing from cloud results
      const merged = { ...extractedFields };
      for (const [k, v] of Object.entries(tessFields)) {
        if (!merged[k] || merged[k].value == null) {
          merged[k] = { ...v, confidence: 'low' };
        }
      }
      setExtractedFields(merged);
      // If no template matched, show mapping UI with the Tesseract lines
      if (!template) {
        setOcrText(rawText);
        setOcrLines(parseOCRLines(rawText));
        setStep('mapping');
      } else {
        initRowState(merged, unmatchedValues);
        setStep('confirm');
      }
    } catch (err) {
      setError(String(err?.message ?? err));
      setStep('confirm');
    }
  }

  // ── Build final applied values from confirm panel ────────────────────────────
  function buildAppliedValues() {
    const result = {};
    for (const [rowId, fieldKey] of Object.entries(rowAssignments)) {
      if (!fieldKey || fieldKey === '') continue;
      const raw = rowValues[rowId];
      const num = parseFloat(String(raw).replace(/[$,\s]/g, ''));
      if (!isNaN(num)) result[fieldKey] = num;
    }
    return result;
  }

  // ── Apply from confirm panel ────────────────────────────────────────────────
  async function handleApplyConfirm() {
    const applied = buildAppliedValues();
    const original = {};
    for (const [k, v] of Object.entries(extractedFields)) original[k] = v.value;
    const corrections = Object.keys(applied).filter(k => applied[k] !== original[k]).length;

    try {
      await window.api.posScan.history.save({
        date_key: date || new Date().toISOString().slice(0, 10),
        caisse_index: caisseIndex || 0,
        template_id: matchedTemplate?.id || null,
        raw_text: '',
        extracted_values: JSON.stringify(original),
        applied_values: JSON.stringify(applied),
        corrections_made: corrections,
        scan_source: 'confirm',
        ocr_engine: scanEngine,
      });
    } catch (_) { /* non-critical */ }

    onApply(applied);
    handleClose();
  }

  // ── Apply from mapping UI ────────────────────────────────────────────────────
  async function handleApplyMapping(andSave) {
    const applied = { ...lineValueOverrides };

    if (andSave && posSystemName.trim()) {
      // Build template from line assignments
      const patterns = [];
      for (const [lineIdx, fieldKey] of Object.entries(lineFieldAssignments)) {
        if (!fieldKey || fieldKey === 'skip') continue;
        const line = ocrLines[parseInt(lineIdx)];
        if (!line) continue;
        // Build a regex from the label portion (words before the number)
        const labelPart = line.raw.replace(/\$?[\d,]+\.\d{2}.*$/, '').replace(/\d+\s*$/, '').trim();
        const escapedLabel = labelPart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        patterns.push({
          field: fieldKey,
          label_regex: escapedLabel || labelPart,
          value_regex: '\\$?[\\d,]+\\.\\d{2}',
          position_hint: 'after_label_same_line',
          confidence_weight: 0.9,
        });
      }

      if (patterns.length > 0) {
        const newTpl = {
          id: 'user-' + Date.now(),
          pos_system: posSystemName.trim(),
          pos_version: '',
          language: 'fr',
          patterns: JSON.stringify(patterns),
          metadata: JSON.stringify({}),
          is_community: 0,
          uploaded: 0,
        };
        try {
          await window.api.posScan.templates.save(newTpl);
          setSavedTemplateData(newTpl);
          await loadTemplates();
        } catch (_) { /* non-critical */ }

        try {
          await window.api.posScan.history.save({
            date_key: date || new Date().toISOString().slice(0, 10),
            caisse_index: caisseIndex || 0,
            template_id: newTpl.id,
            raw_text: '',
            extracted_values: JSON.stringify(lineValueOverrides),
            applied_values: JSON.stringify(applied),
            corrections_made: 0,
            scan_source: 'mapping',
            ocr_engine: scanEngine,
          });
        } catch (_) { /* non-critical */ }
      }
    }

    onApply(applied);
    if (andSave && posSystemName.trim() && savedTemplateData === null) {
      // Will show share prompt after saving (set in above block)
      // If savedTemplateData was set, show sharing step
    }
    // Community sharing only available to Pro users (spec table: "Upload | No | Yes | Yes")
    if (andSave && posSystemName.trim() && isProCloud) {
      setStep('sharing');
    } else {
      handleClose();
    }
  }

  // ── Assign a line in mapping UI to a field ──────────────────────────────────
  function assignLine(lineIdx, fieldKey) {
    setLineFieldAssignments(prev => ({ ...prev, [lineIdx]: fieldKey }));
    if (fieldKey && fieldKey !== 'skip') {
      const line = ocrLines[lineIdx];
      if (line?.extractedValue != null) {
        setLineValueOverrides(prev => ({ ...prev, [fieldKey]: line.extractedValue }));
      }
    }
    setSelectedLine(null);
  }

  // ── Community sharing ────────────────────────────────────────────────────────
  async function handleShare() {
    if (!cloudUser) { setError(T.scanNotSignedIn); return; }
    const tplToShare = savedTemplateData;
    if (!tplToShare) return;
    setShareStatus('uploading');
    try {
      const { supabase, SUPABASE_URL } = await import('../services/supabase.js');
      const { data: sd } = await supabase.auth.getSession();
      if (!sd?.session) { setShareStatus('error'); return; }

      await fetch(`${SUPABASE_URL}/rest/v1/pos_scan_community_templates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sd.session.access_token}`,
          'apikey': (await import('../services/supabase.js')).SUPABASE_ANON_KEY,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          pos_system: tplToShare.pos_system,
          pos_version: tplToShare.pos_version || '',
          language: tplToShare.language || 'fr',
          patterns: JSON.parse(tplToShare.patterns),
          metadata: JSON.parse(tplToShare.metadata || '{}'),
          submitted_by: sd.session.user.id,
          region: 'QC',
        }),
      });
      await window.api.posScan.templates.markUploaded(tplToShare.id);
      setShareStatus('done');
    } catch (_) {
      setShareStatus('error');
    }
  }

  // ── Scan history panel ────────────────────────────────────────────────────────
  async function handleShowHistory() {
    try {
      const entries = await window.api.posScan.history.getRecent(30);
      setHistoryEntries(entries);
      setStep('history');
    } catch (_) {
      setHistoryEntries([]);
      setStep('history');
    }
  }

  if (!isOpen) return null;

  // ── Overlay / modal styles ────────────────────────────────────────────────────
  const overlay = {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'rgba(0,0,0,0.65)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 16,
  };
  const modal = {
    background: t.bg || '#1a1c24',
    border: `1px solid ${t.border || 'rgba(255,255,255,0.1)'}`,
    borderRadius: 12,
    padding: 0,
    width: step === 'mapping' ? 820 : 520,
    maxWidth: '98vw',
    maxHeight: '90vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
  };
  const header = {
    padding: '16px 20px 14px',
    borderBottom: `1px solid ${t.innerBorder || 'rgba(255,255,255,0.08)'}`,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  };
  const body = {
    padding: '18px 20px',
    overflowY: 'auto',
    flex: 1,
  };
  const footer = {
    padding: '14px 20px',
    borderTop: `1px solid ${t.innerBorder || 'rgba(255,255,255,0.08)'}`,
    display: 'flex', justifyContent: 'flex-end', gap: 8,
  };
  const btnPrimary = {
    background: 'linear-gradient(135deg,#f97316,#ea580c)',
    color: '#fff',
    border: 'none',
    borderRadius: 7,
    padding: '8px 18px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  };
  const btnSecondary = {
    background: t.inputBg || 'rgba(255,255,255,0.07)',
    color: t.text || '#f1f1f1',
    border: `1px solid ${t.inputBorder || 'rgba(255,255,255,0.15)'}`,
    borderRadius: 7,
    padding: '8px 18px',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  };
  const inputStyle = {
    background: t.inputBg || 'rgba(255,255,255,0.07)',
    border: `1px solid ${t.inputBorder || 'rgba(255,255,255,0.15)'}`,
    borderRadius: 6,
    color: t.text || '#f1f1f1',
    fontSize: 12,
    padding: '5px 9px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  };

  // ── Render: idle ─────────────────────────────────────────────────────────────
  if (step === 'idle') {
    return (<div style={overlay} onClick={handleClose}><div style={modal} onClick={e =>e.stopPropagation()}><div style={header}><div><div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{T.scanButton}</div><div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{T.scanHelper}</div></div><button onClick={handleClose} style={{ background: 'none', border: 'none', color: t.textMuted, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}></button></div><div style={body}>{error &&<div style={{ marginBottom: 12, padding:'8px 12px', borderRadius: 6, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: 12 }}>{error}</div>}<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '20px 0' }}><div style={{ width: 64, height: 64, borderRadius: 14, background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}></div><div style={{ textAlign:'center' }}><div style={{ fontSize: 13, color: t.text, fontWeight: 600, marginBottom: 6 }}>{T.scanButton}</div><div style={{ fontSize: 11, color: t.textMuted, lineHeight: 1.5 }}>{T.scanHelper}</div>{isProCloud && (<div style={{ marginTop: 8, fontSize: 10, color: '#f97316', fontWeight: 500 }}>{T.scanEngineCloud}</div>)}</div><button onClick={handleScan} style={{ ...btnPrimary, padding:'10px 28px', fontSize: 14 }}>{T.scanButton}</button><div style={{ fontSize: 10, color: t.textDim || t.textMuted }}>PDF · PNG · JPG · JPEG</div></div></div><div style={{ ...footer, justifyContent:'space-between' }}><button onClick={handleShowHistory} style={{ ...btnSecondary, fontSize: 11, padding: '6px 12px'}}>{T.scanHistory}</button><button onClick={handleClose} style={btnSecondary}>{T.scanCancel}</button></div></div></div>);
 }

 // ── Render: processing ───────────────────────────────────────────────────────
 if (step ==='processing') {
    return (<div style={overlay}><div style={{ ...modal, width: 380 }}><div style={{ ...body, textAlign: 'center', padding: '40px 20px'}}><div style={{ fontSize: 32, marginBottom: 16 }}></div><div style={{ fontSize: 14, fontWeight: 600, color: t.text, marginBottom: 8 }}>{T.scanProcessing}</div><div style={{ height: 6, background:'rgba(255,255,255,0.08)', borderRadius: 3, margin: '12px 0', overflow: 'hidden' }}><div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg,#f97316,#ea580c)', borderRadius: 3, transition: 'width 0.3s' }} /></div><div style={{ fontSize: 10, color: t.textMuted }}>{progressLabel}</div></div></div></div>);
  }

  // ── Render: confirm panel ────────────────────────────────────────────────────
  if (step === 'confirm') {
    const allRows = [
      ...Object.entries(extractedFields).map(([k, v]) => ({ id: k, rawLabel: v.rawLabel || k, value: v.value, confidence: v.confidence, isUnmatched: false })),
      ...unmatchedValues.map(u => ({ id: 'unmatched_' + u.label, rawLabel: u.label, value: u.value, confidence: 'low', isUnmatched: true })),
    ];

    return (<div style={overlay} onClick={handleClose}><div style={modal} onClick={e =>e.stopPropagation()}><div style={header}><div><div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{matchedTemplate ? T.scanMatchedAs(posSystemName || matchedTemplate.pos_system) : T.scanDetected}</div>{matchedTemplate && (<div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>{T.scanMatchScore(Math.round(matchScore * 100))}
                  {' · '}<span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: matchedTemplate.is_community ? 'rgba(139,92,246,0.15)' : 'rgba(249,115,22,0.1)', color: matchedTemplate.is_community ? '#8b5cf6' : '#f97316' }}>{matchedTemplate.is_community ? T.scanCommunityLabel : T.scanLocalLabel}</span></div>)}</div><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{isProCloud && (<span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, background: scanEngine === 'claude-haiku' ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.07)', color: scanEngine === 'claude-haiku' ? '#8b5cf6' : t.textMuted, fontWeight: 600 }}>{scanEngine === 'claude-haiku' ? ' ' + T.scanEngineCloud : T.scanEngineLocal}</span>)}<button onClick={handleClose} style={{ background: 'none', border: 'none', color: t.textMuted, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}></button></div></div><div style={body}>{error &&<div style={{ marginBottom: 12, padding:'8px 12px', borderRadius: 6, background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)', color: '#f97316', fontSize: 11 }}>{error}</div>}<table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}><thead><tr><th style={{ textAlign: 'left', color: t.textMuted, fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, padding: '0 0 8px', borderBottom: `1px solid ${t.innerBorder || 'rgba(255,255,255,0.08)'}` }}>{T.scanColLabel}</th><th style={{ textAlign: 'right', color: t.textMuted, fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, padding: '0 8px 8px', borderBottom: `1px solid ${t.innerBorder || 'rgba(255,255,255,0.08)'}` }}>{T.scanColValue}</th><th style={{ textAlign: 'left', color: t.textMuted, fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, padding: '0 0 8px 8px', borderBottom: `1px solid ${t.innerBorder || 'rgba(255,255,255,0.08)'}` }}>{T.scanColField}</th><th style={{ textAlign: 'center', color: t.textMuted, fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, padding: '0 0 8px 8px', borderBottom: `1px solid ${t.innerBorder || 'rgba(255,255,255,0.08)'}` }}></th></tr></thead><tbody>{allRows.map((row) => (<tr key={row.id} style={{ borderBottom: `1px solid rgba(255,255,255,0.04)` }}><td style={{ padding: '7px 0', color: t.text, fontSize: 11 }}>{row.rawLabel}</td><td style={{ padding: '7px 8px', textAlign: 'right' }}><input
                        type="number"
                        value={rowValues[row.id] ?? String(row.value ?? '')}
                        onChange={e =>setRowValues(prev => ({ ...prev, [row.id]: e.target.value }))}
                        style={{ ...inputStyle, width: 90, textAlign: 'right', fontFamily: "'Satoshi',-apple-system,BlinkMacSystemFont,sans-serif" }}
                        step="0.01"
                      /></td><td style={{ padding: '7px 0 7px 8px' }}><select
                        value={rowAssignments[row.id] || ''}
                        onChange={e =>setRowAssignments(prev => ({ ...prev, [row.id]: e.target.value }))}
                        style={{ ...inputStyle, width: 'auto', fontSize: 11 }}
                      ><option value="">— {T.scanSkipField} —</option>{FIELD_KEYS.map(fk => (<option key={fk} value={fk}>{getFieldLabel(fk, T)}</option>))}</select></td><td style={{ padding: '7px 0 7px 8px', textAlign: 'center' }}><ConfBadge conf={row.confidence} T={T} /></td></tr>))}</tbody></table>{allRows.length === 0 && (<div style={{ textAlign: 'center', padding: '20px 0', color: t.textMuted, fontSize: 12 }}>{T.scanUnknown}</div>)}
            {matchedTemplate?.is_community === 1 && (<div style={{ marginTop: 12, textAlign: 'center' }}><button
                  onClick={async () =>{
                    try {
                      const { supabase, SUPABASE_URL } = await import('../services/supabase.js');
                      const { data: sd } = await supabase.auth.getSession();
                      if (!sd?.session) return;
                      await fetch(`${SUPABASE_URL}/rest/v1/rpc/flag_community_template`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sd.session.access_token}`, 'apikey': (await import('../services/supabase.js')).SUPABASE_ANON_KEY },
                        body: JSON.stringify({ template_id: matchedTemplate.id }),
                      });
                    } catch (_) { /* non-critical */ }
                  }}
                  style={{ background: 'none', border: 'none', color: t.textDim || t.textMuted, fontSize: 10, cursor: 'pointer', textDecoration: 'underline'}}
 >
 {T.scanFlagBad}</button></div>)}</div>{scanEngine ==='claude-haiku' && supplementPng && FIELD_KEYS.some(k => !extractedFields[k]) && (<div style={{ padding: '8px 20px', borderTop: `1px solid ${t.innerBorder || 'rgba(255,255,255,0.06)'}`, background: 'rgba(249,115,22,0.04)' }}><button
                onClick={handleSupplementWithTesseract}
                style={{ background: 'none', border: '1px solid rgba(249,115,22,0.3)', color: '#f97316', borderRadius: 6, padding: '5px 12px', fontSize: 11, cursor: 'pointer', width: '100%'}}
 >{T.scanSupplementTesseract}</button></div>)}<div style={footer}><button onClick={handleClose} style={btnSecondary}>{T.scanCancel}</button><button onClick={handleApplyConfirm} style={btnPrimary} disabled={allRows.length === 0}>{T.scanApply}</button></div></div></div>);
 }

 // ── Render: mapping UI ────────────────────────────────────────────────────────
 if (step ==='mapping') {
    const fieldOptions = FIELD_KEYS.map(fk => ({ key: fk, label: getFieldLabel(fk, T) }));
    const assignedFields = new Set(Object.values(lineFieldAssignments).filter(v => v && v !== 'skip'));

    return (<div style={overlay} onClick={handleClose}><div style={modal} onClick={e =>e.stopPropagation()}><div style={header}><div><div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{T.scanUnknown}</div><div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{T.scanNameYourPOS}</div></div><button onClick={handleClose} style={{ background: 'none', border: 'none', color: t.textMuted, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}></button></div><div style={{ ...body, padding: 0 }}>{/* POS system name */}<div style={{ padding:'12px 20px', borderBottom: `1px solid ${t.innerBorder || 'rgba(255,255,255,0.08)'}` }}><label style={{ fontSize: 11, fontWeight: 600, color: t.textMuted, display: 'block', marginBottom: 5 }}>{T.scanPosSystem}</label><input
                type="text"
                value={posSystemName}
                onChange={e =>setPosSystemName(e.target.value)}
                placeholder={T.scanPosSystemHint}
                style={{ ...inputStyle, maxWidth: 320 }}
                list="pos-systems"
              /><datalist id="pos-systems">{["Maitre D'", 'Veloce', 'Lightspeed', 'Square', 'Clover', 'Shopify', 'Auphan', 'TouchBistro', 'Toast'].map(n => (<option key={n} value={n} />))}</datalist></div>{/* Two-panel layout */}<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', height: 380, overflow: 'hidden' }}>{/* Left: detected text */}<div style={{ borderRight: `1px solid ${t.innerBorder || 'rgba(255,255,255,0.08)'}`, overflow: 'auto', padding: 16 }}><div style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>{T.scanDetectedText}</div><div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{ocrLines.map(line => {
                    const isAssigned = Object.keys(lineFieldAssignments).includes(String(line.idx));
                    const assignedTo = lineFieldAssignments[line.idx];
                    const isSelected = selectedLine === line.idx;
                    return (<div
                        key={line.idx}
                        onClick={() =>setSelectedLine(isSelected ? null : line.idx)}
                        style={{
                          padding: '5px 8px',
                          borderRadius: 5,
                          cursor: 'pointer',
                          fontSize: 11,
                          fontFamily: "'Satoshi',-apple-system,BlinkMacSystemFont,sans-serif",
                          background: isSelected ? 'rgba(249,115,22,0.15)' : isAssigned && assignedTo !== 'skip' ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.04)',
                          border: isSelected ? '1px solid rgba(249,115,22,0.4)' : isAssigned && assignedTo !== 'skip' ? '1px solid rgba(34,197,94,0.2)' : '1px solid transparent',
                          color: isAssigned && assignedTo !== 'skip' ? '#86efac' : t.text,
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}
                      ><span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{line.raw}</span>{isAssigned && assignedTo !== 'skip' && (<span style={{ fontSize: 9, color: '#86efac', marginLeft: 6, whiteSpace: 'nowrap' }}>→ {getFieldLabel(assignedTo, T)}</span>)}
                        {isSelected && line.extractedValue != null && (<span style={{ fontSize: 9, color: '#f97316', marginLeft: 6, fontWeight: 700 }}>{line.extractedValue}</span>)}</div>);
                  })}
                  {ocrLines.length === 0 && (<div style={{ color: t.textMuted, fontSize: 11 }}>Aucune valeur détectée</div>)}</div></div>{/* Right: caisse fields */}<div style={{ overflow: 'auto', padding: 16 }}><div style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>{T.scanCaisseFields}</div>{selectedLine !== null && (<div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 6, background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)', fontSize: 11, color: '#f97316' }}>←<b>«{ocrLines.find(l => l.idx === selectedLine)?.raw?.slice(0, 30)}…»</b>— {T.scanSelectField}</div>)}<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{fieldOptions.map(({ key, label }) => {
                    const assigned = assignedFields.has(key);
                    const value = lineValueOverrides[key];
                    return (<div
                        key={key}
                        onClick={() =>selectedLine !== null ? assignLine(selectedLine, key) : undefined}
                        style={{
                          padding: '8px 10px',
                          borderRadius: 6,
                          border: `1px solid ${assigned ? 'rgba(34,197,94,0.3)' : selectedLine !== null ? 'rgba(249,115,22,0.3)' : t.inputBorder || 'rgba(255,255,255,0.1)'}`,
                          background: assigned ? 'rgba(34,197,94,0.07)' : selectedLine !== null ? 'rgba(249,115,22,0.05)' : 'rgba(255,255,255,0.03)',
                          cursor: selectedLine !== null ? 'pointer' : 'default',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}
                      ><span style={{ fontSize: 11, color: assigned ? '#86efac' : t.text, fontWeight: assigned ? 600 : 400 }}>{label}</span><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{assigned && value != null && (<span style={{ fontSize: 11, fontFamily: "'Satoshi',-apple-system,BlinkMacSystemFont,sans-serif", color: '#86efac', fontWeight: 700 }}>{key === 'nb_transactions' ? value : `$${Number(value).toFixed(2)}`}</span>)}
                          {assigned &&<span style={{ fontSize: 9, color: '#86efac' }}></span>}</div></div>);
                  })}
                  {selectedLine !== null && (<button
                      onClick={() =>assignLine(selectedLine, 'skip')}
                      style={{ ...btnSecondary, fontSize: 11, padding: '6px 10px', textAlign: 'left' }}
                    >
                      ⊘ {T.scanSkipField}</button>)}</div></div></div></div><div style={footer}><button onClick={handleClose} style={btnSecondary}>{T.scanCancel}</button><button onClick={() =>handleApplyMapping(false)} style={btnSecondary}>
              {T.scanApply}</button><button
              onClick={() =>handleApplyMapping(true)}
              disabled={!posSystemName.trim() || Object.keys(lineValueOverrides).length === 0}
              style={{ ...btnPrimary, opacity: (!posSystemName.trim() || Object.keys(lineValueOverrides).length === 0) ? 0.5 : 1 }}
            >
               {T.scanApplySave}</button></div></div></div>);
  }

  // ── Render: community sharing ─────────────────────────────────────────────────
  if (step === 'sharing') {
    return (<div style={overlay}><div style={{ ...modal, width: 440 }}><div style={header}><div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{shareStatus === 'done' ? '' + T.scanSaved : T.scanSaved}</div><button onClick={handleClose} style={{ background: 'none', border: 'none', color: t.textMuted, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}></button></div><div style={body}>{shareStatus === null && (<><div style={{ fontSize: 13, color: t.text, lineHeight: 1.6, marginBottom: 20 }}>{T.scanSharePrompt}</div><div style={{ fontSize: 11, color: t.textMuted, padding: '8px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: `1px solid ${t.innerBorder || 'rgba(255,255,255,0.08)'}` }}>ℹ Seule la structure du format est partagée — aucune donnée financière n'est envoyée.</div></>)}
            {shareStatus === 'uploading' && (<div style={{ textAlign: 'center', padding: '20px 0' }}><div style={{ fontSize: 24, marginBottom: 12 }}>⏳</div><div style={{ fontSize: 12, color: t.textMuted }}>{T.scanUploadingTemplate}</div></div>)}
            {shareStatus === 'done' && (<div style={{ textAlign: 'center', padding: '20px 0'}}><div style={{ fontSize: 32, marginBottom: 12 }}></div><div style={{ fontSize: 13, color: t.text, lineHeight: 1.6 }}>{T.scanShareThanks}</div></div>)}
 {shareStatus ==='error' && (<div style={{ textAlign: 'center', padding: '20px 0'}}><div style={{ fontSize: 24, marginBottom: 12 }}></div><div style={{ fontSize: 12, color:'#f97316' }}>{T.scanUploadError}</div></div>)}</div><div style={footer}>{shareStatus === null && (<><button onClick={handleClose} style={btnSecondary}>{T.scanShareNo}</button><button onClick={handleShare} style={btnPrimary}>{T.scanShareYes}</button></>)}
            {(shareStatus === 'done' || shareStatus === 'error') && (<button onClick={handleClose} style={btnPrimary}>OK</button>)}</div></div></div>);
  }

  // ── Render: scan history ──────────────────────────────────────────────────────
  if (step === 'history') {
 return (<div style={overlay} onClick={handleClose}><div style={modal} onClick={e =>e.stopPropagation()}><div style={header}><div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{T.scanHistory}</div><button onClick={handleClose} style={{ background:'none', border: 'none', color: t.textMuted, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}></button></div><div style={body}>{historyEntries.length === 0 ? (<div style={{ textAlign:'center', padding: '30px 0', color: t.textMuted, fontSize: 12 }}>{T.scanHistoryEmpty}</div>) : (<table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}><thead><tr>{[T.scanHistoryDate, T.scanHistoryPOS, T.scanHistoryEngine, T.scanHistoryCorrections].map(h => (<th key={h} style={{ textAlign: 'left', color: t.textMuted, fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, padding: '0 8px 8px 0', borderBottom: `1px solid ${t.innerBorder || 'rgba(255,255,255,0.08)'}` }}>{h}</th>))}</tr></thead><tbody>{historyEntries.map(entry => {
                    let tplName = '—';
                    const tpl = templates.find(t2 => t2.id === entry.template_id);
                    if (tpl) tplName = tpl.pos_system;
                    return (<tr key={entry.id} style={{ borderBottom: `1px solid rgba(255,255,255,0.04)` }}><td style={{ padding: '6px 8px 6px 0', color: t.text }}>{entry.date_key}</td><td style={{ padding: '6px 8px 6px 0', color: t.text }}>{tplName}</td><td style={{ padding: '6px 8px 6px 0', color: t.textMuted }}><span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: entry.ocr_engine === 'claude-haiku' ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.07)', color: entry.ocr_engine === 'claude-haiku' ? '#8b5cf6' : t.textMuted }}>{entry.ocr_engine === 'claude-haiku' ? ' cloud' : 'local'}</span></td><td style={{ padding: '6px 0 6px 0', color: entry.corrections_made >0 ? '#f97316': t.textMuted }}>
 {entry.corrections_made > 0 ? `${entry.corrections_made} ` :'—'}</td></tr>);
                  })}</tbody></table>)}</div><div style={footer}><button onClick={() =>setStep('idle')} style={btnSecondary}>← {T.scanButton}</button><button onClick={handleClose} style={btnPrimary}>{T.scanCloseHistory}</button></div></div></div>
    );
  }

  return null;
}
