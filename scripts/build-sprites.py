"""Build public/sprites/pokemon/*.webp from PokeOS HOME-style 3D renders.

Showdown's pokedex.json only lists which species and formes exist; every image
comes from PokeOS. Files are named base-forme (Showdown ids), the scheme
spriteUrlForSlug() in src/services/teamBuilderCore.js reads.

    python scripts/build-sprites.py            # fetch only what is missing
    python scripts/build-sprites.py --force    # refetch everything
"""
import io, json, re, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "public" / "sprites" / "pokemon"
DEX = "https://play.pokemonshowdown.com/data/pokedex.json"
SITEMAP = "https://s3.pokeos.com/pokeos-uploads/sitemap/pokemon.xml"
RENDER = "https://s3.pokeos.com/pokeos-uploads/assets/pokemon/home/render/{}.png"
SIZE = 512
SKIP_FORMES = re.compile(r"(Gmax|Totem|Eternamax|Tera|Stellar|Starter|Cap)$")
# Showdown forme -> PokeOS page slug where the words do not line up.
OVERRIDES = {
    "tatsugiri-curlymega": "978-mega",
    "meowstic-mmega": "678-mega",  # PokeOS has one Mega Meowstic render
    "meowstic-fmega": "678-mega",
    "alcremie": "869-vanilla-cream-strawberry-sweet",
    "darmanitan-galar": "555-regional-g-standard",
    "greninja-bond": "658-battle-bond",
    "groudon-primal": "383-mega",
    "kyogre-primal": "382-mega",
    "maushold": "925-family-of-three",
    "maushold-four": "925-family-of-four",
    "necrozma-dawnwings": "800-dawn",
    "necrozma-duskmane": "800-dusk",
    "rockruff-dusk": "744-own-tempo",
    "terapagos-terastal": "1024-tera",
    "unown": "201-a",
    "vivillon-pokeball": "666-poke-ball",
    **{f"pikachu-{cap}": f"25-{cap}-cap" for cap in ("alola", "hoenn", "kalos", "original", "partner", "sinnoh", "unova", "world")},
}
ALIASES = {"a": "alola", "g": "galar", "h": "hisui", "p": "paldea", "female": "f", "male": "m"}

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 ypl-site sprite build"})
    with urllib.request.urlopen(req, timeout=60) as res:
        return res.read()

def to_id(text):
    return re.sub(r"[^a-z0-9]", "", text.lower())

def words(text, aliases=False):
    out = []
    for word in re.split(r"[-\s]+", text):
        word = to_id(word)
        if aliases:
            if word in ("regional", "mask"): continue
            word = ALIASES.get(word, word)
        if word: out.append(word)
    return tuple(sorted(out))

def plan():
    dex = json.loads(get(DEX))
    pages = set(re.findall(r"<loc>https://www\.pokeos\.com/pokedex/([0-9a-z-]+)</loc>", get(SITEMAP).decode()))
    by_num = {}
    for page in pages:
        num, _, suffix = page.partition("-")
        if suffix: by_num.setdefault(int(num), {})[words(suffix, aliases=True)] = page
    jobs, missing = {}, []
    for record in dex.values():
        num, forme = record.get("num", 0), record.get("forme", "")
        if num <= 0 or record.get("isNonstandard") in ("CAP", "Custom") or SKIP_FORMES.search(forme):
            continue
        base = to_id(record.get("baseSpecies") or record["name"])
        slug = f"{base}-{to_id(forme)}" if forme else base
        page = OVERRIDES.get(slug)
        if not page and not forme:
            page = str(num) if str(num) in pages else by_num.get(num, {}).get(words(record.get("baseForme", "")))
        if not page and forme:
            page = by_num.get(num, {}).get(words(forme))
        if page: jobs[slug] = page
        else: missing.append(record["name"])
    return jobs, missing

def fetch(item):
    slug, page = item
    # Default formes have a suffixed page but an unsuffixed render (487-altered -> 487.png).
    for name in dict.fromkeys([page, page.split("-")[0]]):
        try:
            image = Image.open(io.BytesIO(get(RENDER.format(name)))).convert("RGBA")
            break
        except Exception as error:
            failure = f"{page}: {error}"
    else:
        return slug, failure
    image.thumbnail((SIZE, SIZE), Image.LANCZOS)
    image.save(OUT / f"{slug}.webp", "WEBP", quality=82, method=6)
    return slug, None

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    jobs, missing = plan()
    todo = [item for item in jobs.items() if "--force" in sys.argv or not (OUT / f"{item[0]}.webp").exists()]
    with ThreadPoolExecutor(8) as pool:
        failed = [f"{slug} ({error})" for slug, error in pool.map(fetch, todo) if error]
    print(f"{len(jobs)} mapped, {len(todo) - len(failed)} written, {len(failed)} failed")
    if failed: print("failed:", ", ".join(failed))
    if missing: print("no PokeOS page:", ", ".join(sorted(missing)))

if __name__ == "__main__":
    main()
