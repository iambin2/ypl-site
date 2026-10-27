"""YPL Figures: digits, hyphen and D drawn in the YPL wordmark's construction, built as a real web font.

Grid (y down, cap 100, same as public/brand/ypl-wordmark.svg): stems S, outer bars B, middle bar M ending at 56,
the band cut 56-64, outer bowl corners R=18 with concentric inner corners (r = R - S), counters W - 2S wide,
slanted 12deg, at the wordmark's own weights (S28 B24 M14). The site uses it for big figures only
(tokens.css --font-fig); everything else stays SUIT. Output: public/fonts/ypl-figures.woff2.
Usage: python scripts/build-figures.py
"""
import math, sys, os
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path

CAP, UPM, SCALE = 100, 1000, 7.22  # cap 100 units -> SUIT's cap height 722
T = math.tan(math.radians(12))


def glyphs(S, B, M, W=88, R=18, flag=16):
    r = max(R - S, 0)
    il, ir, mt = S, W - S, 56 - M
    a = lambda rr, sweep, x, y: f"A{rr} {rr} 0 0 {sweep} {x} {y}" if rr else f"L{x} {y}"
    # a corner helper: from the current point, round the inner corner with radius r ending at (x, y)
    up_open = f"M0 {R} A{R} {R} 0 0 1 {R} 0 H{W-R} A{R} {R} 0 0 1 {W} {R} V56 H{ir} V{B+r} {a(r,0,ir-r,B)} H{il+r} {a(r,0,il,B+r)} V56 H0 Z"
    low_open = f"M0 64 H{il} V{100-B-r} {a(r,0,il+r,100-B)} H{ir-r} {a(r,0,ir,100-B-r)} V64 H{W} V{100-R} A{R} {R} 0 0 1 {W-R} 100 H{R} A{R} {R} 0 0 1 0 {100-R} Z"
    low_hook = f"M{ir} 64 H{W} V{100-R} A{R} {R} 0 0 1 {W-R} 100 H0 V{100-B} H{ir-r} {a(r,0,ir,100-B-r)} Z"
    up_box = f"M0 {R} A{R} {R} 0 0 1 {R} 0 H{W-R} A{R} {R} 0 0 1 {W} {R} V56 H0 Z M{il} {B+r} V{mt} H{ir} V{B+r} {a(r,0,ir-r,B)} H{il+r} {a(r,0,il,B+r)} Z"
    up_seven = f"M0 0 H{W-R} A{R} {R} 0 0 1 {W} {R} V56 H{ir} V{B+r} {a(r,0,ir-r,B)} H0 Z"
    stem_r = f"M{ir} 64 H{W} V100 H{ir} Z"
    w1 = S + flag
    # the 8 is two rounded loops: the corners at its waist round like its outer corners, where the 0 stays square,
    # so it reads as an 8 at 28px instead of a B or a 日 (2026-10-27). A narrowed waist read as the Korean 요.
    k = R
    up_eight = (f"M0 {R} A{R} {R} 0 0 1 {R} 0 H{W-R} A{R} {R} 0 0 1 {W} {R} V{56-k} A{k} {k} 0 0 1 {W-k} 56 H{k} A{k} {k} 0 0 1 0 {56-k} Z "
                f"M{il} {B+r} V{mt} H{ir} V{B+r} {a(r,0,ir-r,B)} H{il+r} {a(r,0,il,B+r)} Z")
    low_eight = (f"M0 {64+k} A{k} {k} 0 0 1 {k} 64 H{il} V{100-B-r} {a(r,0,il+r,100-B)} H{ir-r} {a(r,0,ir,100-B-r)} V64 H{W-k} "
                 f"A{k} {k} 0 0 1 {W} {64+k} V{100-R} A{R} {R} 0 0 1 {W-R} 100 H{R} A{R} {R} 0 0 1 0 {100-R} Z")
    return {
        "zero": (W, up_open + " " + low_open),
        # 1 is a stem with a short flag and no foot: the old full-width foot under a flag as long made it read as a J
        # or an I at 28px (2026-10-27); its narrow width keeps it apart from the 7's full top bar
        "one": (w1, f"M0 0 H{w1} V56 H{flag} V{B} H0 Z M{flag} 64 H{w1} V100 H{flag} Z"),
        "two": (W, f"M0 0 H{W-R} A{R} {R} 0 0 1 {W} {R} V56 H0 V{mt} H{ir} V{B+r} {a(r,0,ir-r,B)} H0 Z M0 64 H{il} V{100-B} H{W} V100 H0 Z"),
        "three": (W, f"M0 0 H{W-R} A{R} {R} 0 0 1 {W} {R} V56 H{max(il-8, 12)} V{mt} H{ir} V{B+r} {a(r,0,ir-r,B)} H0 Z " + low_hook),
        "four": (W, f"M0 0 H{il} V{mt} H{ir} V0 H{W} V56 H0 Z " + stem_r),
        "five": (W, f"M0 0 H{W} V{B} H{il} V{mt} H{W} V56 H0 Z " + low_hook),
        "six": (W, f"M0 {R} A{R} {R} 0 0 1 {R} 0 H{W} V{B} H{il+r} {a(r,0,il,B+r)} V{mt} H{W} V56 H0 Z " + low_open),
        "seven": (W, up_seven + " " + stem_r),
        "eight": (W, up_eight + " " + low_eight),
        "nine": (W, up_box + " " + low_hook),
        "D": (W, f"M0 0 H{W-R} A{R} {R} 0 0 1 {W} {R} V56 H{ir} V{B+r} {a(r,0,ir-r,B)} H{il} V56 H0 Z "
                 f"M0 64 H{il} V{100-B} H{ir-r} {a(r,0,ir,100-B-r)} V64 H{W} V{100-R} A{R} {R} 0 0 1 {W-R} 100 H0 Z"),
        "hyphen": (36, f"M0 {mt} H36 V56 H0 Z"),
    }


def build(name, weight, S, B, M, gap, out):
    defs = glyphs(S, B, M)
    order = [".notdef", "space"] + list(defs)
    cmap = {ord(str(i)): n for i, n in enumerate(["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"])}
    cmap.update({ord("D"): "D", ord("-"): "hyphen", 0x2212: "hyphen", ord(" "): "space"})
    fb = FontBuilder(UPM, isTTF=False)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    lsb = gap / 2 * SCALE
    over = CAP * T * SCALE  # how far the top leans right
    charstrings, metrics = {}, {}
    for n in order:
        # the advance goes into the charstring too: browsers read it from there for CFF fonts
        g = gap * (0.4 if n == "hyphen" else 1)  # the hyphen sits close to its neighbours
        adv = round(defs[n][0] * SCALE + g * SCALE + over / 2) if n in defs else 280
        pen = T2CharStringPen(adv, None)
        if n in defs:
            tp = TransformPen(pen, (SCALE, 0, -SCALE * T, -SCALE, CAP * T * SCALE + g / 2 * SCALE, CAP * SCALE))
            parse_path(defs[n][1], tp)
        charstrings[n] = pen.getCharString()
        metrics[n] = (adv, 0)
    fb.setupCFF(f"YPLFigures-{name}", {"FullName": f"YPL Figures {name}"}, charstrings, {})
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=988, descent=-260)
    fb.setupNameTable({"familyName": "YPL Figures", "styleName": name})
    fb.setupOS2(sTypoAscender=988, sTypoDescender=-260, usWinAscent=988, usWinDescent=260, sCapHeight=722, sxHeight=461, usWeightClass=weight)
    fb.setupPost()
    fb.font.flavor = "woff2"
    path = os.path.join(out, f"ypl-figures-{name.lower()}.woff2")
    fb.save(path)
    return path, {k: v[1] for k, v in defs.items()}


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "public", "fonts")
    path, _ = build("Heavy", 800, 28, 24, 14, 12, out)
    final = os.path.join(out, "ypl-figures.woff2")
    os.replace(path, final)
    print(final, os.path.getsize(final), "bytes")
