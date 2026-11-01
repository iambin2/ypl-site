"""Freesentation, cut into unicode-range slices so a visit downloads only the glyphs it shows.

The sources stay public/fonts/freesentation/Freesentation-*.woff2 (v1.002, OFL). Each weight gets two slices:
core holds the Hangul of the repo's copy and game data plus CJK punctuation, so it is the file a screen normally needs;
rest holds the other Hangul and comes only when a page shows one (a nickname in a board post, say).
Latin and digits come from Albert Sans (public/fonts/albert-sans-latin-wght.woff2), first in --font, one variable file.

Rest's range covers all of Hangul and overlaps core on purpose. CSS Fonts 4 checks the last defined @font-face first,
and core is written last, so its syllables never fetch rest.

Writes public/fonts/freesentation/slices/<weight>-<core|rest>.<hash>.woff2 (old ones removed), the @font-face block
between the font-slices markers in src/styles/tokens.css, and the preloads between the markers in index.html.
The deploy workflow reruns it before every build, so production never needs a manual run; the committed output only
serves local dev (new syllables still render there, from rest).
Usage: npm run font:slices  (pip install -r scripts/requirements-fonts.txt; pinned for identical bytes)
"""
import glob, hashlib, io, os
from fontTools.ttLib import TTFont
from fontTools import subset

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCES = {400: "4Regular", 600: "6SemiBold", 700: "7Bold"}
SOURCE_DIR = os.path.join(ROOT, "public/fonts/freesentation")
OUT_DIR = os.path.join(SOURCE_DIR, "slices")
TOKENS = os.path.join(ROOT, "src/styles/tokens.css")
INDEX = os.path.join(ROOT, "index.html")
PRELOAD = (400, 600, 700)  # body, labels and headlines: the first screen shows all three
HANGUL = range(0xAC00, 0xD7A4)
PUNCTUATION = (range(0x3000, 0x3100), range(0xFF00, 0xFFF0))


def corpus():
    """Characters of the copy and the game data."""
    paths = [p for p in glob.glob(os.path.join(ROOT, "src/**/*.*"), recursive=True)
             if p.endswith((".js", ".jsx", ".mjs", ".json", ".css"))] + [INDEX]
    return {ord(c) for p in paths for c in open(p, encoding="utf-8", errors="ignore").read()}


def build(source, unicodes):
    font = TTFont(source, recalcTimestamp=False)  # same input, same bytes, same hashed name
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.notdef_outline = True
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=unicodes)
    subsetter.subset(font)
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


def splice(path, start, end, block):
    text = open(path, encoding="utf-8").read()
    assert start in text and end in text, f"{path} is missing the {start} markers"
    text = text[:text.index(start) + len(start)] + block + text[text.index(end):]
    open(path, "w", encoding="utf-8", newline="").write(text)


def face(weight, name, urange):
    return (f'@font-face {{\n  font-family: "Freesentation";\n  src: url("/fonts/freesentation/slices/{name}") format("woff2");\n'
            f"  font-weight: {weight}; font-style: normal; font-display: swap;\n  unicode-range: {urange};\n}}")


def main():
    used = corpus()
    os.makedirs(OUT_DIR, exist_ok=True)
    for old in glob.glob(os.path.join(OUT_DIR, "*.woff2")):
        os.remove(old)
    rest_rules, core_rules, preloads = [], [], []
    for weight, stem in SOURCES.items():
        source = os.path.join(SOURCE_DIR, f"Freesentation-{stem}.woff2")
        cmap = TTFont(source).getBestCmap()
        hangul = [c for c in cmap if c in HANGUL]
        punctuation = [c for c in cmap if any(c in r for r in PUNCTUATION)]
        core = sorted(set(punctuation) | {c for c in hangul if c in used})
        rest = sorted(c for c in hangul if c not in used)
        for tag, cps, rules, urange in (("rest", rest, rest_rules, fmt([(HANGUL.start, HANGUL.stop - 1)])), ("core", core, core_rules, fmt(runs(core, cmap)))):
            data = build(source, cps)
            name = f"{weight}-{tag}.{hashlib.sha256(data).hexdigest()[:8]}.woff2"
            with open(os.path.join(OUT_DIR, name), "wb") as f:
                f.write(data)
            print(f"{name}: {len(cps)} codepoints, {len(data):,} bytes")
            rules.append(face(weight, name, urange))
            if tag == "core" and weight in PRELOAD:
                preloads.append(f'    <link rel="preload" href="/fonts/freesentation/slices/{name}" as="font" type="font/woff2" crossorigin />\n')
    # core is written last so it is checked first (see the docstring)
    splice(TOKENS, "/* font-slices:start (scripts/build-font-slices.py) */\n", "/* font-slices:end */", "\n".join(rest_rules + core_rules) + "\n")
    splice(INDEX, "<!-- font-preloads:start -->\n", "    <!-- font-preloads:end -->", "".join(preloads))


if __name__ == "__main__":
    main()
