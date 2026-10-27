"""
One-time model download for the inference service (PRD v3.3).

Downloads ONLY the files inference needs (config, weights, preprocessor) —
the primary repo also hosts multi-GB training checkpoints that must not be
pulled. Files land in the Hugging Face cache (HF_HOME or ~/.cache/huggingface).

Usage:  python download_models.py
"""
from huggingface_hub import snapshot_download

FILES = ["config.json", "model.safetensors", "preprocessor_config.json"]

for repo in ("dima806/indian_food_image_detection", "therealcyberlord/vit-indian-food"):
    print(f"Downloading {repo} …")
    path = snapshot_download(repo_id=repo, allow_patterns=FILES)
    print(f"  → {path}")
print("Done. Both models are cached for offline use.")
