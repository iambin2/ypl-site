"""Build public/cries/<dex number>.m4a from PokeOS's HOME cries.

PokeOS keeps one cry a species (Ogg Vorbis, by national dex number); Safari does not
play every Ogg, so each is re-encoded once to mono AAC. src/pages/battle/cries.js reads
them by the number in the Pokédex data.

    pip install av pillow
    python scripts/build-cries.py            # fetch only what is missing
    python scripts/build-cries.py --force    # refetch everything
"""
import io, sys, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import av

OUT = Path(__file__).resolve().parent.parent / "public" / "cries"
CRY = "https://s3.pokeos.com/pokeos-uploads/assets/pokemon/home/cries/{}.ogg"
LAST = 1025
# a form that cries differently in the games, which PokeOS does not keep: PokeAPI's set by its form number
# (its 964 is PokeOS's 964 sample for sample, so these are the same HOME cries), saved by the form's id
FORMS = {"palafinhero": "https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/10256.ogg"}

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 ypl-site cry build"})
    with urllib.request.urlopen(req, timeout=60) as res:
        return res.read()

def encode(ogg, path):
    src = av.open(io.BytesIO(ogg))
    out = av.open(str(path), "w", format="ipod")
    stream = out.add_stream("aac", rate=44100)
    stream.bit_rate = 64000
    stream.layout = "mono"
    resample = av.AudioResampler(format="fltp", layout="mono", rate=44100)
    for frame in src.decode(audio=0):
        for f in resample.resample(frame):
            for p in stream.encode(f): out.mux(p)
    for f in resample.resample(None):
        for p in stream.encode(f): out.mux(p)
    for p in stream.encode(None): out.mux(p)
    out.close()

def one(num, force):
    path = OUT / f"{num}.m4a"
    if path.exists() and not force: return "kept"
    try: ogg = get(FORMS.get(num) or CRY.format(num))
    except urllib.error.HTTPError as err: return f"missing {err.code}"
    encode(ogg, path)
    return "made"

def main():
    force = "--force" in sys.argv
    OUT.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(8) as pool:
        results = list(pool.map(lambda n: (n, one(n, force)), [*range(1, LAST + 1), *FORMS]))
    for n, r in results:
        if r.startswith("missing"): print(n, r)
    print({k: sum(1 for _, r in results if r.startswith(k)) for k in ("made", "kept", "missing")})

if __name__ == "__main__":
    main()
