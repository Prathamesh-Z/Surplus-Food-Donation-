"""
Fetch the evaluation image set from Wikimedia Commons (openly licensed).

For each dish we take up to N real photographs returned by Commons search.
A manifest (eval/manifest.json) records the source page of every image so
licences/attribution can be checked. Images are gitignored — they are test
fixtures, not project assets.

Usage:  python eval/fetch_eval_images.py
"""
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

OUT = Path(__file__).parent / "images"
OUT.mkdir(parents=True, exist_ok=True)
API = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "FoodWasteSaver-Eval/1.0 (hackathon project; contact: team HA040)"}

# expected_label -> Commons search phrase. Labels use the model vocabulary;
# UNSUPPORTED_* dishes exist in NO model and test graceful uncertainty.
DISHES = {
    # primary-model dishes
    "poha": "poha dish",
    "biryani": "biryani",
    "gulab_jamun": "gulab jamun",
    "jalebi": "jalebi",
    "kachori": "kachori",
    "butter_chicken": "butter chicken",
    "chana_masala": "chana masala",
    "paneer_butter_masala": "paneer butter masala",
    "dal_makhani": "dal makhani",
    "modak": "modak sweet",
    "aloo_tikki": "aloo tikki",
    "lassi": "lassi drink",
    "chapati": "chapati",
    "naan": "naan bread",
    # specialist-model dishes
    "dosa": "masala dosa",
    "pavbhaji": "pav bhaji",
    "vadapav": "vada pav",
    "dhokla": "dhokla",
    "cholebhature": "chole bhature",
    "panipuri": "pani puri",
    "dabeli": "dabeli",
    # in NO model — must come back uncertain, not confidently wrong
    "UNSUPPORTED_idli": "idli sambar",
    "UNSUPPORTED_samosa": "samosa",
    "UNSUPPORTED_upma": "upma",
    "UNSUPPORTED_misal": "misal pav",
    # non-food
    "NONFOOD_desk": "office desk",
    "NONFOOD_car": "car street",
    "NONFOOD_dog": "dog portrait",
}
PER_DISH = 2


def search_images(phrase, limit=8):
    params = {
        "action": "query", "format": "json", "generator": "search",
        "gsrsearch": f"filetype:bitmap {phrase}", "gsrnamespace": 6,
        "gsrlimit": limit, "prop": "imageinfo",
        "iiprop": "url|size|mime", "iiurlwidth": 800,
    }
    url = f"{API}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.load(r)
    pages = (data.get("query") or {}).get("pages") or {}
    out = []
    for page in pages.values():
        for info in page.get("imageinfo", []):
            if info.get("mime") == "image/jpeg" and info.get("width", 0) >= 400:
                out.append({
                    "thumb": info.get("thumburl") or info.get("url"),
                    "page": f"https://commons.wikimedia.org/wiki/{urllib.parse.quote(page.get('title', ''))}",
                })
    return out


def main():
    manifest = []
    for label, phrase in DISHES.items():
        try:
            hits = search_images(phrase)
        except Exception as exc:  # noqa: BLE001
            print(f"{label}: search failed ({exc})")
            continue
        taken = 0
        for hit in hits:
            if taken >= PER_DISH:
                break
            slug = re.sub(r"[^a-z0-9_]", "", label.lower())
            dest = OUT / f"{slug}_{taken + 1}.jpg"
            try:
                req = urllib.request.Request(hit["thumb"], headers=UA)
                with urllib.request.urlopen(req, timeout=30) as r:
                    dest.write_bytes(r.read())
                manifest.append({"file": dest.name, "expected": label, "source": hit["page"]})
                taken += 1
                print(f"{label}: {dest.name}  <- {hit['page']}")
            except Exception as exc:  # noqa: BLE001
                print(f"{label}: download failed ({exc})")
            time.sleep(0.3)
        if taken == 0:
            print(f"{label}: NO IMAGE FOUND")
    (Path(__file__).parent / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"\n{len(manifest)} images saved; manifest written.")


if __name__ == "__main__":
    main()
