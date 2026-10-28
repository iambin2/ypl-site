"""SUIT Variable, cut into unicode-range slices so a visit downloads only the glyphs it shows.

The source stays public/fonts/SUIT-Variable.woff2 (v2.0.5, OFL; the labs and the OG card still read it).
Slice 0 holds every non-Hangul glyph (all Latin kerning stays inside one file) plus each Hangul syllable
that appears anywhere in src/ or index.html: the UI copy, the legacy records and the Pokemon names.
That covers practically every screen, so it is the one file index.html preloads.
The other syllables go into contiguous slices across U+AC00-D7A3, fetched only when a page shows one.
SUIT has no Hangul kerning, so splitting Hangul changes no rendering; every slice keeps the same metrics,
the wght axis and all layout features, and gains the HVAR table the source lacks (advances without outlines).

Slice ranges overlap slice 0 on purpose. CSS Fonts 4 checks the last defined @font-face first, and slice 0
is written last, so its syllables never fetch another slice and the rest stay short spans.

Writes public/fonts/suit/suit-<n>.<hash>.woff2 (old ones removed), the @font-face block between the
suit-slices markers in src/styles/tokens.css, and the preload in index.html.
The deploy workflow reruns it before every build, so production never needs a manual run; the committed
output only serves local dev (new syllables still render there, from a lazily fetched slice).
Usage: npm run font:slices  (pip install -r scripts/requirements-fonts.txt; pinned for identical bytes)
"""
import glob, hashlib, io, os, re
from fontTools.ttLib import TTFont
from fontTools import subset
from fontTools.varLib.hvar import add_HVAR

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, "public/fonts/SUIT-Variable.woff2")
OUT_DIR = os.path.join(ROOT, "public/fonts/suit")
TOKENS = os.path.join(ROOT, "src/styles/tokens.css")
INDEX = os.path.join(ROOT, "index.html")
REST_SLICES = 8
HANGUL = range(0xAC00, 0xD7A4)


def corpus():
    paths = [p for p in glob.glob(os.path.join(ROOT, "src/**/*.*"), recursive=True)
             if p.endswith((".js", ".jsx", ".mjs", ".json", ".css"))] + [INDEX]
    return {ord(c) for p in paths for c in open(p, encoding="utf-8", errors="ignore").read()}


def build(unicodes):
    font = TTFont(SOURCE, recalcTimestamp=False)  # same input, same bytes, same hashed name
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.notdef_outline = True
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=unicodes)
    subsetter.subset(font)
    # SUIT ships without HVAR, so a browser finds each glyph's advance at a weight by running the glyph's whole outline
    # variation: the first layout of a screen with new words cost hundreds of ms on a phone. HVAR holds the advances.
    add_HVAR(font)
    out = io.BytesIO()
    font.save(out)
    return out.getvalue()


def runs(cps, universe):
    """Ranges over the font's own codepoints: a gap the font has no glyph for does not break a run."""
    order = {c: i for i, c in enumerate(sorted(universe))}
    out = []
    for c in sorted(cps):
        if out and order[c] == order[out[-1][1]] + 1:
            out[-1][1] = c
        else:
            out.append([c, c])
    return out


def fmt(ranges):
    return ", ".join(f"U+{a:X}" if a == b else f"U+{a:X}-{b:X}" for a, b in ranges)


def main():
    cmap = TTFont(SOURCE).getBestCmap()
    hangul = sorted(c for c in cmap if c in HANGUL)
    used = corpus()
    core = sorted(c for c in cmap if c not in HANGUL or c in used)
    rest = [c for c in hangul if c not in used]

    size = -(-len(rest) // REST_SLICES)
    groups = [rest[i:i + size] for i in range(0, len(rest), size)]
    slices = []  # (cps, unicode-range), slice 0 last
    for i, group in enumerate(groups):
        lo = HANGUL.start if i == 0 else group[0]
        hi = groups[i + 1][0] - 1 if i + 1 < len(groups) else HANGUL.stop - 1
        slices.append((group, fmt([(lo, hi)])))
    slices.append((core, fmt(runs(core, cmap))))

    os.makedirs(OUT_DIR, exist_ok=True)
    for old in glob.glob(os.path.join(OUT_DIR, "suit-*.woff2")):
        os.remove(old)
    rules, names = [], []
    for n, (cps, urange) in enumerate([slices[-1]] + slices[:-1]):
        data = build(cps)
        name = f"suit-{n}.{hashlib.sha256(data).hexdigest()[:8]}.woff2"
        with open(os.path.join(OUT_DIR, name), "wb") as f:
            f.write(data)
        names.append(name)
        print(f"{name}: {len(cps)} codepoints, {len(data):,} bytes")
        rules.append(
            f'@font-face {{\n  font-family: "SUIT Variable";\n  src: url("/fonts/suit/{name}") format("woff2");\n'
            f"  font-weight: 100 900; font-style: normal; font-display: swap;\n  unicode-range: {urange};\n}}"
        )
    # slice 0 is written last so it is checked first (see the docstring)
    block = "\n".join(rules[1:] + rules[:1])

    css = open(TOKENS, encoding="utf-8").read()
    start, end = "/* suit-slices:start (scripts/build-suit-slices.py) */\n", "/* suit-slices:end */"
    assert start in css and end in css, "tokens.css is missing the suit-slices markers"
    css = css[:css.index(start) + len(start)] + block + "\n" + css[css.index(end):]
    open(TOKENS, "w", encoding="utf-8", newline="").write(css)

    html = open(INDEX, encoding="utf-8").read()
    html, count = re.subn(r'href="/fonts/suit/suit-0\.[0-9a-f]+\.woff2"', f'href="/fonts/suit/{names[0]}"', html)
    assert count == 1, "index.html has no slice-0 preload to update"
    open(INDEX, "w", encoding="utf-8", newline="").write(html)


if __name__ == "__main__":
    main()
