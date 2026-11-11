// Request body size cap. Call BEFORE any auth or database work so an oversized
// body is refused cheaply. Content-Length is checked first (nothing is read);
// the text length is checked as well because the header can be absent.
export const MAX_AI_BODY_BYTES = 15_000_000; // a resized photo as base64, plus a little

export async function readCappedJson(
  req: Request,
  maxBytes: number = MAX_AI_BODY_BYTES,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; error: 'too_large' | 'invalid_json' }> {
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > maxBytes) return { ok: false, error: 'too_large' };
  let text: string;
  try { text = await req.text(); } catch { return { ok: false, error: 'invalid_json' }; }
  if (text.length > maxBytes) return { ok: false, error: 'too_large' };
  try {
    const parsed = JSON.parse(text);
    return { ok: true, body: parsed && typeof parsed === 'object' ? parsed : {} };
  } catch {
    return { ok: false, error: 'invalid_json' };
  }
}

// Monthly cap on charges one organization may submit through pre-authorized debit.
export const PAD_MONTHLY_CHARGE_CAP = 200;
// Cloud POS photo scans per organization per month.
export const POS_SCAN_MONTHLY_LIMIT = 300;
