"""
Local speech-to-text for voice search (PRD v3.8).

Uses faster-whisper (OpenAI Whisper weights, CTranslate2 runtime) on CPU
— fully local, like the food-recognition models. This replaces any
dependence on a browser vendor's cloud recognizer: Chrome's
SpeechRecognition sends audio to Google's servers and fails with a
generic "network" error on many real networks, even with internet up.

Model: WHISPER_MODEL env, default "small" (multilingual, ~244 MB) —
chosen because it handles English, Hindi and Marathi food names far
better than "tiny"/"base" while staying practical on a laptop CPU with
int8 quantization. Short search utterances transcribe in about 1–3 s.
"""

import io
import os

WHISPER_MODEL_ID = os.environ.get("WHISPER_MODEL", "small")
SUPPORTED_HINTS = {"en", "mr", "hi"}


def _decode_to_array(audio_bytes):
    """Decode any container (webm/opus from a browser, wav, mp4…) to the
    16 kHz mono float32 array Whisper expects.

    We decode with PyAV ourselves instead of letting faster-whisper do
    it: its decode_audio() passes kwargs that newer PyAV versions reject
    (metadata_errors), which broke transcription outright. The
    AudioResampler API used here is stable across PyAV versions.
    """
    import av
    import numpy as np

    resampler = av.AudioResampler(format="s16", layout="mono", rate=16000)
    chunks = []
    with av.open(io.BytesIO(audio_bytes)) as container:
        stream = next((s for s in container.streams if s.type == "audio"), None)
        if stream is None:
            raise ValueError("No audio stream in the uploaded file.")
        for frame in container.decode(stream):
            for out in resampler.resample(frame):
                chunks.append(out.to_ndarray().reshape(-1))
    if not chunks:
        raise ValueError("Audio contained no decodable samples.")
    pcm = np.concatenate(chunks).astype(np.float32) / 32768.0
    return pcm


class SpeechToText:
    def __init__(self, model_id):
        from faster_whisper import WhisperModel

        self.model_id = model_id
        self.model = WhisperModel(model_id, device="cpu", compute_type="int8")

    def transcribe_bytes(self, audio_bytes, language=None):
        """Transcribe raw audio bytes in any common container."""
        hint = language if language in SUPPORTED_HINTS else None
        segments, info = self.model.transcribe(
            _decode_to_array(audio_bytes),
            language=hint,
            beam_size=1,
            without_timestamps=True,
        )
        text = "".join(segment.text for segment in segments).strip()
        return {
            "text": text,
            "language": info.language,
            "language_probability": round(float(info.language_probability), 3),
        }


def load_speech_to_text(model_id=WHISPER_MODEL_ID):
    """Returns (SpeechToText | None, error | None) — never raises."""
    try:
        return SpeechToText(model_id), None
    except Exception as exc:  # noqa: BLE001
        return None, f"{type(exc).__name__}: {exc}"
