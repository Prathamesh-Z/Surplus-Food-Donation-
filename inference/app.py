"""
Food Waste Saver — Indian food recognition inference service (PRD v3.3).

Two verified open models, run locally on CPU, Apache-2.0:
  - PRIMARY:    dima806/indian_food_image_detection  (ViT, 80 Indian dishes)
  - SPECIALIST: therealcyberlord/vit-indian-food     (ViT, 15 dishes — covers
                dosa / pav bhaji / vada pav / dhokla / chole bhature, which the
                primary model does not have)

Design rules (from the replacement brief + team decisions 2026-10-27):
  - Real inference on the actual uploaded image. No mocks, no canned answers.
  - Scores from the two models are NEVER blended — they are not comparable.
    The specialist runs when the primary is not confident; it is FEATURED
    (presented as the main suggestion) only at a high score bar, and every
    result is labelled with the model that produced it.
  - The primary's published weights produce unusually flat softmax scores,
    so its scores are temperature-scaled (temperature fitted on the eval
    set — docs/RECOGNITION_EVAL.md). Ranking is unchanged by scaling.
  - Below UNCERTAIN_THRESHOLD the featured result is flagged `uncertain`
    so the UI asks for a clearer photo instead of presenting a guess as fact.
  - Models load once at startup. If the primary model cannot load, /health
    reports it and /predict returns an explicit 503 — never a fake prediction.

Run:  uvicorn app:app --host 127.0.0.1 --port 8001
Env:  HF_HOME, PRIMARY_MODEL, SPECIALIST_MODEL, PRIMARY_TEMPERATURE,
      UNCERTAIN_THRESHOLD, SPECIALIST_TRIGGER, SPECIALIST_FEATURED_MIN
"""

import io
import os
import time

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image

from models import (
    PRIMARY_MODEL_ID,
    PRIMARY_TEMPERATURE,
    SPECIALIST_MODEL_ID,
    load_classifier,
)

# Calibrated on the evaluation set — see docs/RECOGNITION_EVAL.md.
UNCERTAIN_THRESHOLD = float(os.environ.get("UNCERTAIN_THRESHOLD", "0.50"))
SPECIALIST_TRIGGER = float(os.environ.get("SPECIALIST_TRIGGER", "0.50"))
SPECIALIST_FEATURED_MIN = float(os.environ.get("SPECIALIST_FEATURED_MIN", "0.90"))

MAX_BYTES = 5 * 1024 * 1024  # matches the app's listing-photo limit (FR-04)

app = FastAPI(title="Food Waste Saver — food recognition")

_state = {
    "primary": None,
    "specialist": None,
    "errors": {},
    "load_seconds": None,
}


@app.on_event("startup")
def _startup():
    started = time.time()
    primary, err = load_classifier(PRIMARY_MODEL_ID, temperature=PRIMARY_TEMPERATURE)
    _state["primary"] = primary
    if err:
        _state["errors"]["primary"] = err
    specialist, err = load_classifier(SPECIALIST_MODEL_ID)
    _state["specialist"] = specialist
    if err:
        _state["errors"]["specialist"] = err
    _state["load_seconds"] = round(time.time() - started, 2)


@app.get("/health")
def health():
    return {
        "status": "ok" if _state["primary"] is not None else "degraded",
        "primary_loaded": _state["primary"] is not None,
        "specialist_loaded": _state["specialist"] is not None,
        "errors": _state["errors"],
        "load_seconds": _state["load_seconds"],
        "primary_temperature": PRIMARY_TEMPERATURE,
        "uncertain_threshold": UNCERTAIN_THRESHOLD,
        "specialist_trigger": SPECIALIST_TRIGGER,
        "specialist_featured_min": SPECIALIST_FEATURED_MIN,
    }


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    if _state["primary"] is None:
        return JSONResponse(
            status_code=503,
            content={
                "error": "Primary recognition model is not loaded. "
                "Run inference/download_models.py and restart the service.",
                "detail": _state["errors"].get("primary"),
            },
        )

    raw = await file.read()
    if len(raw) == 0 or len(raw) > MAX_BYTES:
        return JSONResponse(
            status_code=400,
            content={"error": f"Image must be between 1 byte and {MAX_BYTES} bytes."},
        )
    try:
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception:  # noqa: BLE001
        return JSONResponse(
            status_code=400,
            content={"error": "Uploaded file is not a readable image."},
        )

    started = time.time()
    primary_top = _state["primary"].top_k(image, k=3)
    top = primary_top[0]

    specialist_top = None
    specialist_ran = False
    if top["score"] < SPECIALIST_TRIGGER and _state["specialist"] is not None:
        specialist_ran = True
        specialist_top = _state["specialist"].top_k(image, k=3)

    # Featured suggestion: the specialist only when it clears its high bar
    # (it is confidently wrong outside its 15 dishes — see the eval report);
    # otherwise the primary's top pick. Each keeps its own model's score.
    if specialist_ran and specialist_top and specialist_top[0]["score"] >= SPECIALIST_FEATURED_MIN:
        featured = {"source": "specialist", **specialist_top[0]}
        uncertain = False
    else:
        featured = {"source": "primary", **top}
        uncertain = top["score"] < UNCERTAIN_THRESHOLD

    return {
        "featured": featured,
        "primary": {"model": PRIMARY_MODEL_ID, "top": primary_top},
        "specialist": (
            {"model": SPECIALIST_MODEL_ID, "top": specialist_top}
            if specialist_ran
            else None
        ),
        "specialist_ran": specialist_ran,
        "uncertain": uncertain,
        "latency_ms": round((time.time() - started) * 1000),
    }
