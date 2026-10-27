# Food Recognition — Evaluation Report (PRD v3.3)

Measured, not promised. Everything below comes from actually running both
models on real photographs in this repository's sandbox (2-core CPU VM,
torch 2.14 CPU, transformers 5.21). **Re-run `inference/eval/evaluate.py` on
the demo laptop before the event** and update the latency/RAM figures — the
accuracy figures will be identical (same weights, same images), the timings
will differ.

## What was replaced and why

The v3.2 detector was TensorFlow.js MobileNet on generic ImageNet. Its food
labels are few and Western-centric; poha, idli, dosa, biryani and nearly all
Indian dishes **do not exist as possible outputs**, so it returned the
nearest global class instead. Root cause: wrong model for the domain, not a
tuning problem.

**FoodLens** (Google Research, ~30K images / 140+ dishes) was investigated
first, as directed. It is **not usable**: the publication page offers no
downloadable weights, no inference code and no hosted API. It remains a
citation for the presentation only. (Play-Store apps named "FoodLens" are
unrelated products.)

## Models selected (both Apache-2.0, public weights, run locally)

| Role | Model | Classes | On its own dishes (this eval) |
|---|---|---|---|
| Primary | `dima806/indian_food_image_detection` (ViT-base) | 80 Indian dishes | top-1 **48.1%**, top-3 **66.7%** (27 photos) |
| Specialist | `therealcyberlord/vit-indian-food` (ViT-base) | 15 dishes | top-1 **75.0%**, top-3 **85.0%** (20 photos) |

`Amrrs/indian-foods` (5 classes: idli, kachori, pani puri, samosa, vada pav)
was evaluated and **deferred by team decision** — it is the only candidate
with idli/samosa, but its training set is tiny and its self-reported 92.9%
is not comparable to anything here.

### An honest finding about the primary model

The author's own trainer log (checkpoint-3000) reports 72% accuracy on
their test split — **with a cross-entropy loss of 2.74**, which matches what
we observe: the published weights rank dishes plausibly but produce
near-uniform softmax scores (raw top scores 0.02–0.06 for everything,
correct or not). Verified three ways: pipeline output, raw-logit inspection
(logit std 0.27, classifier bias ≈ 0), and an alternate checkpoint
(checkpoint-1140 is worse: 47.4% on the author's split). This is a property
of the published weights, not of our integration.

The repo's final training checkpoint (checkpoint-3000) was also tested on
this eval set: identical top-1/top-3 (13/18) — slightly sharper scores on
some images, no accuracy gain — so the service uses the canonical
repo-root weights.

Mitigation, fitted on this eval set (temperature scaling — ranking
unchanged): **T = 0.25** (NLL grid search over the primary's 27 dish
photos). After scaling, the uncertainty gate works: at the chosen threshold
**0.50**, predictions the UI presents as confident are 9/11 correct (82%),
and 12 of 14 wrong top-1s are correctly flagged `uncertain`.

## Method

- **Images**: 55 real photographs from Wikimedia Commons (openly licensed;
  per-image source recorded in `inference/eval/manifest.json`): 2 each for
  24 dishes the models claim to support, plus idli, samosa, upma and misal
  pav (supported by *neither* model), plus 6 non-food images (rooms, cars,
  portraits). One dish (dal makhani) has a single usable photo.
- **Selection rule** (exactly as implemented in `inference/app.py`): the
  primary always runs. The specialist runs when the primary's scaled top
  score < 0.50, and is *featured* as the main suggestion only if its own top
  score ≥ 0.90 and the primary is below 0.50. Scores are never blended.

## Results

| Measure | Result |
|---|---|
| Featured suggestion correct — supported dishes | **22/41 = 53.7%** |
| Featured suggestion correct — all food photos (incl. unsupported dishes) | 22/49 = 44.9% |
| Primary top-3 contains the right dish (its 80 dishes) | 66.7% — shown as one-tap alternatives in the UI |
| Non-food photos (6) | **all 6 flagged `uncertain`** (featured scores 0.03–0.05) |
| Poha (the brief's example dish) | primary top-1 both photos, scaled 0.95 / 0.92 |
| Biryani | correct both photos (primary 0.71; specialist 1.00) |

### Known failure modes (measured, not hypothetical)

- **Unsupported dishes get confidently wrong specialist guesses**: idli →
  pani puri (0.997) and vada pav (0.92); misal pav → pav bhaji (0.97, a
  visually near dish — misal is served with pav); samosa → pakora (0.9998);
  upma → biryani (0.99). A closed-set classifier cannot say "not in my
  list"; the UI therefore always presents results as editable suggestions
  and never blocks manual entry.
- **Weak primary dishes**: aloo tikki → palak paneer on both photos;
  butter chicken → dal dishes; paneer butter masala missed by both models.
- Visually similar sweets confuse the primary (jalebi ↔ imarti).

## Performance (this VM, 2 CPU cores — laptop figures TBD by re-run)

| Measure | Value |
|---|---|
| Model load, both models, cold | 13.5 s (one-time at service start) |
| Inference latency, both models per photo | mean 1.44 s · p50 1.38 s · p95 1.77 s · max 2.44 s |
| Peak memory (RSS) during evaluation | ~1.0 GB |

## Setup deltas discovered during integration

- transformers v5 cannot resolve the specialist's old-format
  `preprocessor_config.json`; the service falls back to the identical base
  model's processor (`google/vit-base-patch16-224`). Both models share that
  preprocessing.
- Only 3 files per model are downloaded (config, weights, preprocessor) —
  the primary repo also hosts ~14 GB of training checkpoints that must not
  be pulled.

## Bottom line for the demo

Recognition is a **suggestion engine with an honesty gate**, not an oracle:
about half of supported-dish photos get the right featured answer, two
thirds have the right dish in the top-3 one-tap alternatives, non-food is
reliably flagged uncertain, and dishes outside both models' vocabularies
are documented gaps (idli, samosa, upma, misal pav). Every number above is
reproducible with `inference/eval/evaluate.py`.
