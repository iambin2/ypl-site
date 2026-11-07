# before and after side by side: python pair.py before_dir after_dir out_dir [per=3]
# each row is one move, its before sheet on the left and its after sheet on the right, with both white-out numbers
import sys, os
from PIL import Image, ImageDraw
b, a, out = sys.argv[1:4]
per = int(sys.argv[4]) if len(sys.argv) > 4 else 3
os.makedirs(out, exist_ok=True)
white = lambda d: dict(l.strip().split('\t') for l in open(d + '/white.tsv') if '\t' in l) if os.path.exists(d + '/white.tsv') else {}
wb, wa = white(b), white(a)
names = sorted(f for f in os.listdir(a) if f.endswith('.jpg') and os.path.exists(b + '/' + f))
for k in range(0, len(names), per):
    rows = []
    for f in names[k:k + per]:
        ib, ia = Image.open(b + '/' + f), Image.open(a + '/' + f)
        ib, ia = [i.resize((i.width // 2, i.height // 2)) for i in (ib, ia)]
        r = Image.new('RGB', (ib.width + ia.width + 6, max(ib.height, ia.height)), (255, 255, 255))
        r.paste(ib, (0, 0)); r.paste(ia, (ib.width + 6, 0))
        m = f.split('_')[0]
        ImageDraw.Draw(r).text((ib.width - 90, 2), f'before w{wb.get(m, "?")}', fill=(255, 200, 0))
        ImageDraw.Draw(r).text((r.width - 90, 2), f'after w{wa.get(m, "?")}', fill=(0, 255, 120))
        rows.append(r)
    o = Image.new('RGB', (max(r.width for r in rows), sum(r.height for r in rows) + 4 * len(rows)), (40, 40, 40)); y = 0
    for r in rows: o.paste(r, (0, y)); y += r.height + 4
    o.save(f'{out}/p{k // per:03d}.jpg', quality=85)
print(len(names), 'moves')
