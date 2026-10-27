"""
Shared model loading + inference for the recognition service (PRD v3.3).

Both models are ViT-base-patch16-224 fine-tunes (Apache-2.0):
  PRIMARY    dima806/indian_food_image_detection — 80 Indian dishes.
             The author's own trainer log reports 72% top-1 on their test
             split, but the published weights produce unusually flat
             softmax scores (eval cross-entropy 2.74). We therefore apply
             temperature scaling fitted on our evaluation set (see
             docs/RECOGNITION_EVAL.md) so the reported confidence separates
             correct from incorrect predictions instead of sitting at
             0.02–0.06 for everything.
  SPECIALIST therealcyberlord/vit-indian-food — 15 dishes; sharp and
             accurate inside its vocabulary, confidently wrong outside it,
             so it is only ever FEATURED at a high score bar and always
             labelled with its model name. Scores are never blended.

The specialist repo's preprocessor_config.json predates the
`image_processor_type` key transformers v5 requires; both processors fall
back to the identical base model's processor when needed.
"""

import os

import torch

PRIMARY_MODEL_ID = os.environ.get("PRIMARY_MODEL", "dima806/indian_food_image_detection")
SPECIALIST_MODEL_ID = os.environ.get("SPECIALIST_MODEL", "therealcyberlord/vit-indian-food")
BASE_PROCESSOR = "google/vit-base-patch16-224"

# Temperature fitted on the eval set (docs/RECOGNITION_EVAL.md); 1.0 = raw.
PRIMARY_TEMPERATURE = float(os.environ.get("PRIMARY_TEMPERATURE", "0.25"))


class Classifier:
    def __init__(self, model_id, temperature=1.0):
        from transformers import AutoImageProcessor, AutoModelForImageClassification

        self.model_id = model_id
        self.temperature = temperature
        try:
            self.processor = AutoImageProcessor.from_pretrained(model_id)
        except Exception:  # noqa: BLE001 — older preprocessor format
            self.processor = AutoImageProcessor.from_pretrained(BASE_PROCESSOR)
        self.model = AutoModelForImageClassification.from_pretrained(model_id)
        self.model.eval()
        self.id2label = self.model.config.id2label

    def top_k(self, image, k=3):
        inputs = self.processor(image, return_tensors="pt")
        with torch.no_grad():
            logits = self.model(**inputs).logits[0]
        probs = torch.softmax(logits / self.temperature, dim=-1)
        top = torch.topk(probs, k)
        return [
            {"label": self.id2label[i.item()], "score": round(float(p), 4)}
            for p, i in zip(top.values, top.indices)
        ]


def load_classifier(model_id, temperature=1.0):
    """Returns (Classifier, error_or_None) — never raises."""
    try:
        return Classifier(model_id, temperature), None
    except Exception as exc:  # noqa: BLE001
        return None, f"{type(exc).__name__}: {exc}"
