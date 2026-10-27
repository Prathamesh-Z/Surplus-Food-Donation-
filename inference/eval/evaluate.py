"""
Evaluation + benchmark for the recognition feature (PRD v3.3).

Uses the SAME Classifier code as the service (../models.py) over
eval/images (Wikimedia Commons photos, see manifest.json), and reports:
  - per-model top-1 / top-3 on the dishes that model actually supports
  - temperature fit for the primary's flat scores (NLL grid search)
  - featured-suggestion accuracy under the service's selection rule
  - behaviour on unsupported dishes and non-food images
  - latency (both models) and peak memory — re-run on the demo laptop

Usage:  python eval/evaluate.py     (writes eval/results.json)
"""
import json
import statistics
import sys
import time
from pathlib import Path

import psutil
import torch
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent.parent))
from models import Classifier  # noqa: E402

HERE = Path(__file__).parent
IMAGES = sorted((HERE / "images").glob("*.jpg"))
FEATURED_MIN = 0.90
TRIGGER = 0.60


def expected_of(path):
    return path.stem.rsplit("_", 1)[0]


def main():
    if not IMAGES:
        raise SystemExit("No eval images — run eval/fetch_eval_images.py first.")
    proc = psutil.Process()
    t0 = time.time()
    primary = Classifier("dima806/indian_food_image_detection")  # raw, T=1
    specialist = Classifier("therealcyberlord/vit-indian-food")
    load_s = time.time() - t0
    print(f"Model load (both): {load_s:.1f}s")

    p_labels = set(primary.id2label.values())
    s_labels = set(specialist.id2label.values())
    label2id = {v: k for k, v in primary.id2label.items()}

    rows, lat = [], []
    peak_mb = 0
    for path in IMAGES:
        img = Image.open(path).convert("RGB")
        t = time.time()
        p_top = primary.top_k(img, 3)
        s_top = specialist.top_k(img, 3)
        lat.append((time.time() - t) * 1000)
        peak_mb = max(peak_mb, proc.memory_info().rss / 1e6)
        # primary raw logits for temperature fitting
        inputs = primary.processor(img, return_tensors="pt")
        with torch.no_grad():
            logits = primary.model(**inputs).logits[0].tolist()
        rows.append({
            "file": path.name, "expected": expected_of(path),
            "primary_top": p_top, "specialist_top": s_top,
            "primary_logits": [round(x, 3) for x in logits],
        })

    # ── Temperature fit on the primary's own dishes (NLL grid search) ──
    fit_rows = [r for r in rows if r["expected"] in p_labels]
    best = None
    for t_int in range(5, 105, 5):
        T = t_int / 100
        nll = 0.0
        for r in fit_rows:
            lg = torch.tensor(r["primary_logits"]) / T
            nll += float(torch.nn.functional.cross_entropy(
                lg.unsqueeze(0), torch.tensor([label2id[r["expected"]]])))
        nll /= len(fit_rows)
        if best is None or nll < best[1]:
            best = (T, nll)
    temperature = best[0]
    print(f"Fitted primary temperature: T={temperature} (mean NLL {best[1]:.3f} on {len(fit_rows)} images)")

    def scaled_top(r, T):
        probs = torch.softmax(torch.tensor(r["primary_logits"]) / T, dim=-1)
        top = torch.topk(probs, 3)
        return [{"label": primary.id2label[i.item()], "score": round(float(p), 4)}
                for p, i in zip(top.values, top.indices)]

    for r in rows:
        r["primary_top_scaled"] = scaled_top(r, temperature)
        del r["primary_logits"]

    def stats(subset, key):
        if not subset:
            return {"n": 0}
        t1 = sum(1 for r in subset if r[key][0]["label"] == r["expected"])
        t3 = sum(1 for r in subset if r["expected"] in [x["label"] for x in r[key]])
        return {"n": len(subset), "top1": t1, "top3": t3,
                "top1_pct": round(100 * t1 / len(subset), 1),
                "top3_pct": round(100 * t3 / len(subset), 1)}

    food = [r for r in rows if not r["expected"].upper().startswith("NONFOOD")]
    p_rows = [r for r in food if r["expected"] in p_labels]
    s_rows = [r for r in food if r["expected"] in s_labels]
    unsup = [r for r in food if r["expected"] not in p_labels and r["expected"] not in s_labels]
    nonfood = [r for r in rows if r["expected"].upper().startswith("NONFOOD")]

    # ── Featured rule (same as app.py): specialist featured only ≥ FEATURED_MIN
    def featured(r):
        p = r["primary_top_scaled"][0]
        if p["score"] < TRIGGER and r["specialist_top"][0]["score"] >= FEATURED_MIN:
            return {"source": "specialist", **r["specialist_top"][0]}
        return {"source": "primary", **p}

    for r in rows:
        r["featured"] = featured(r)
    feat_food = [r for r in food]
    feat_correct = sum(1 for r in feat_food if r["featured"]["label"] == r["expected"])
    feat_supported = [r for r in feat_food if r["expected"] in p_labels or r["expected"] in s_labels]
    feat_sup_correct = sum(1 for r in feat_supported if r["featured"]["label"] == r["expected"])

    # ── Uncertainty calibration on scaled primary scores (its own dishes) ──
    calib = {}
    for th in (0.3, 0.4, 0.5, 0.6, 0.7):
        kept = [r for r in p_rows if r["primary_top_scaled"][0]["score"] >= th]
        kept_correct = sum(1 for r in kept if r["primary_top_scaled"][0]["label"] == r["expected"])
        wrong_flagged = sum(1 for r in p_rows
                            if r["primary_top_scaled"][0]["label"] != r["expected"]
                            and r["primary_top_scaled"][0]["score"] < th)
        calib[str(th)] = {"kept": len(kept), "kept_correct": kept_correct,
                          "wrong_flagged_uncertain": wrong_flagged, "of_wrong": len(p_rows) - sum(
                              1 for r in p_rows if r["primary_top_scaled"][0]["label"] == r["expected"])}

    summary = {
        "images": len(rows),
        "primary_temperature_fitted": temperature,
        "primary_on_its_dishes_raw": stats(p_rows, "primary_top"),
        "primary_on_its_dishes_scaled": stats(p_rows, "primary_top_scaled"),
        "specialist_on_its_dishes": stats(s_rows, "specialist_top"),
        "featured_rule": {
            "on_supported_dishes": {"n": len(feat_supported), "correct": feat_sup_correct,
                                    "pct": round(100 * feat_sup_correct / max(1, len(feat_supported)), 1)},
            "on_all_food": {"n": len(feat_food), "correct": feat_correct,
                            "pct": round(100 * feat_correct / max(1, len(feat_food)), 1)},
        },
        "uncertainty_calibration_scaled": calib,
        "unsupported_dishes": [
            {"expected": r["expected"], "featured": r["featured"],
             "primary_top1": r["primary_top_scaled"][0], "specialist_top1": r["specialist_top"][0]}
            for r in unsup],
        "nonfood": [
            {"expected": r["expected"], "featured": r["featured"],
             "primary_top1": r["primary_top_scaled"][0], "specialist_top1": r["specialist_top"][0]}
            for r in nonfood],
        "latency_ms_both_models": {
            "mean": round(statistics.mean(lat), 1), "p50": round(statistics.median(lat), 1),
            "p95": round(sorted(lat)[int(0.95 * len(lat)) - 1], 1), "max": round(max(lat), 1)},
        "model_load_seconds_both": round(load_s, 1),
        "peak_rss_mb": round(peak_mb),
    }
    (HERE / "results.json").write_text(json.dumps({"summary": summary, "rows": rows}, indent=2))
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
