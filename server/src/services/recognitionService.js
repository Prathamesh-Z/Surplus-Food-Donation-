/**
 * Food recognition proxy (PRD v3.3).
 *
 * Sends the uploaded image to the local Python inference service and shapes
 * its answer for the client. The service returns a FEATURED suggestion (from
 * exactly one model, labelled) plus each model's own top-3 — scores are kept
 * per model and never blended here either. If the service is down or the
 * model is not loaded, this throws a 503 with an explicit message: there is
 * deliberately NO fake or client-side fallback prediction.
 */
import { config } from '../lib/config.js';
import { enrichPrediction, DESCRIPTION_FALLBACK } from '../data/dishInfo.js';

/** Magic-byte sniffing — do not trust the client-declared MIME type alone. */
export function sniffImageType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  )
    return 'image/png';
  if (
    buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'image/webp';
  return null;
}

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function recognizeFood(buffer, filename = 'photo.jpg') {
  const type = sniffImageType(buffer);
  if (!type || !ALLOWED.has(type)) {
    const err = new Error('Only JPEG, PNG or WebP images are supported.');
    err.status = 400;
    throw err;
  }

  const form = new FormData();
  form.append('file', new Blob([buffer], { type }), filename);

  let res;
  try {
    res = await fetch(`${config.inferenceUrl}/predict`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    const err = new Error(
      'Food recognition service is not running. Start the inference service (see README) and try again.'
    );
    err.status = 503;
    throw err;
  }

  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json())?.error ?? '';
    } catch { /* keep generic */ }
    const err = new Error(
      res.status === 503
        ? `Recognition model unavailable. ${detail}`.trim()
        : `Recognition failed (${res.status}). ${detail}`.trim()
    );
    err.status = res.status === 503 ? 503 : 502;
    throw err;
  }

  const data = await res.json();
  const featured = data.featured ? enrichPrediction(data.featured) : null;
  const primaryTop = (data.primary?.top ?? []).map(enrichPrediction);
  const specialistTop = (data.specialist?.top ?? [])
    .map(enrichPrediction)
    .filter((p) => p.label !== featured?.label);

  return {
    success: true,
    food_name: featured?.name ?? null,
    description: featured?.description ?? DESCRIPTION_FALLBACK,
    category: featured?.category ?? null,
    categoryNote: featured?.categoryNote ?? null,
    confidence: featured?.score ?? null,
    source: data.featured?.source ?? null,
    uncertain: Boolean(data.uncertain),
    alternatives: primaryTop.filter((p) => p.label !== featured?.label).slice(0, 2),
    specialist: data.specialist
      ? { model: data.specialist.model, top: specialistTop }
      : null,
    primary_model: data.primary?.model ?? null,
    latency_ms: data.latency_ms ?? null,
  };
}
