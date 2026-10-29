# Food Recognition Inference Service (PRD v3.3)

Local Python service that powers **Detect food** on the Post Surplus Food page.
It replaces the old on-device MobileNet (generic ImageNet — it had no Indian
dishes at all) with two verified Indian-food classifiers.

| Role | Model | Classes | Licence |
|---|---|---|---|
| Primary | `dima806/indian_food_image_detection` (ViT) | 80 Indian dishes | Apache-2.0 |
| Specialist | `therealcyberlord/vit-indian-food` (ViT) | 15 dishes — dosa, pav bhaji, vada pav, dhokla, chole bhature… | Apache-2.0 |

Behaviour:
- `POST /predict` (multipart field `file`) → primary top-3. The specialist
  runs **only** when the primary's top score is below `SPECIALIST_TRIGGER`
  (0.60); its scores are returned in a separate field and are **never blended**
  with the primary's — scores from different models are not comparable.
- Below `UNCERTAIN_THRESHOLD` (0.35, calibrated — see
  `../docs/RECOGNITION_EVAL.md`) the result is flagged `uncertain` and the UI
  asks for a clearer photo instead of presenting a guess as fact.
- Dish names/descriptions come from a curated map on the server
  (`server/src/data/dishInfo.js`), never from the classifier.
- Models load once at startup. If the primary model is not loaded, `/predict`
  returns an explicit 503 — there is no fake fallback prediction.
- Known gaps (documented honestly): **idli, samosa, upma and misal pav are in
  neither model** and will normally return `uncertain`. Amrrs/indian-foods
  (5 classes incl. idli + samosa) was evaluated and deferred by team decision.

## Setup (one time, needs Python 3.10+)

```powershell
python -m venv inference\.venv
inference\.venv\Scripts\pip install torch --index-url https://download.pytorch.org/whl/cpu
inference\.venv\Scripts\pip install -r inference\requirements.txt
inference\.venv\Scripts\python inference\download_models.py
```

`start.bat` does all of this automatically on first run. Downloads are ~2 GB
in total (PyTorch CPU + two ~340 MB models); models are cached for offline
use afterwards (`inference/.hf-cache` when started via our scripts, else the
default Hugging Face cache).

## Run

```powershell
inference\.venv\Scripts\python -m uvicorn app:app --app-dir inference --host 127.0.0.1 --port 8001
```

Health check: <http://127.0.0.1:8001/health> — `primary_loaded` must be true.

## Voice search (PRD v3.8)

The same service transcribes Browse voice search locally with
faster-whisper (`Systran/faster-whisper-small`, CPU int8) at
`POST /transcribe` — no audio leaves the machine. `/health` reports
`whisper_loaded`. `download_models.py` fetches the model files;
`WHISPER_MODEL` env can override the model size. Audio is decoded with
PyAV in `speech.py` (16 kHz mono) rather than faster-whisper's own
decoder, whose kwargs newer PyAV versions reject.

The Express server proxies `POST /api/listings/recognize` to this service
(`INFERENCE_URL`, default `http://127.0.0.1:8001`).

## Evaluation & benchmark

```powershell
inference\.venv\Scripts\python inference\eval\fetch_eval_images.py   :: one time
inference\.venv\Scripts\python inference\eval\evaluate.py            :: accuracy + latency + RAM
```

Run `evaluate.py` **on the demo laptop** before the event and keep its
`results.json` — the report in `docs/RECOGNITION_EVAL.md` records the numbers.
