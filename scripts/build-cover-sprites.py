"""Build public/sprites/cover/*.webp, the home cover wall's sprites, from public/sprites/pokemon.

The wall (src/components/home/glassCover.js) shows a cell of at most 104 CSS px
at up to 2x, or 64 px at 3x on a phone, so 208 px is enough; the 512 px
originals cost twice the bytes on a first visit. The roster is read from
glassCover.js, so rerun this after changing it.

    python scripts/build-cover-sprites.py
"""
import re
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC, OUT, SIZE = ROOT / "public/sprites/pokemon", ROOT / "public/sprites/cover", 208

js = (ROOT / "src/components/home/glassCover.js").read_text(encoding="utf8")
roster = " ".join(re.findall(r'"([a-z0-9 -]+)"', js.split("const ROSTER")[1].split(".split")[0])).split()
OUT.mkdir(exist_ok=True)
for old in OUT.glob("*.webp"):
    if old.stem not in roster: old.unlink()
for name in roster:
    img = Image.open(SRC / f"{name}.webp").convert("RGBA").resize((SIZE, SIZE), Image.LANCZOS)
    img.save(OUT / f"{name}.webp", "WEBP", quality=75, alpha_quality=100, method=6)
print(f"{len(roster)} sprites -> {OUT}")
