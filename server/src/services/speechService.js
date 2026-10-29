/**
 * Voice-search transcription proxy (PRD v3.8).
 *
 * Sends a short recorded audio clip to the local Python inference
 * service, which transcribes it with Whisper on-device. Deliberately
 * the same honesty rules as food recognition: if the service is down
 * or the speech model is not loaded, this throws a 503 with an
 * explicit message — no fake transcript, no silent cloud fallback on
 * the server (the CLIENT may offer the browser recognizer as a
 * clearly-separate fallback; that is a UI decision, labelled as such).
 */
import { config } from '../lib/config.js';

let testTransport = null;
/** Test hook: stub the inference call without a running Python service. */
export function __setSpeechTransportForTests(fn) {
  testTransport = fn;
}

export async function transcribeAudio(buffer, { filename = 'voice.webm', language } = {}) {
  if (testTransport) return testTransport(buffer, { filename, language });

  const form = new FormData();
  form.append('file', new Blob([buffer]), filename);
  if (language) form.append('language', language);

  let res;
  try {
    res = await fetch(`${config.inferenceUrl}/transcribe`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    const err = new Error(
      'Speech service is not running. Start the inference service (see README) and try again.'
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
        ? `Speech model unavailable. ${detail}`.trim()
        : `Transcription failed (${res.status}). ${detail}`.trim()
    );
    err.status = res.status === 503 ? 503 : 502;
    throw err;
  }

  const data = await res.json();
  return {
    text: data.text ?? '',
    language: data.language ?? null,
    latency_ms: data.latency_ms ?? null,
  };
}
