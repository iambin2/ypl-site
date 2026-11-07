import sys, os, json
from PIL import Image
src, dst, start = sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 0
r = json.load(open('recipes.json')); idx = {x['rep']: i for i, x in enumerate(r)}
os.makedirs(dst, exist_ok=True)
fs = sorted((f for f in os.listdir(src) if f.endswith('.jpg')), key=lambda f: idx.get(f.split('_')[0], 999))
done = set(open(dst + '/done.txt').read().split()) if os.path.exists(dst + '/done.txt') else set()
fs = [f for f in fs if f not in done]
out = []
for k in range(0, len(fs), 4):
    group = fs[k:k + 4]
    if len(group) < 4 and len(sys.argv) < 5: break
    ims = [Image.open(src + '/' + f) for f in group]; ims = [i.resize((i.width * 3 // 4, i.height * 3 // 4)) for i in ims]
    o = Image.new('RGB', (max(i.width for i in ims), sum(i.height for i in ims))); y = 0
    for i in ims: o.paste(i, (0, y)); y += i.height
    name = f'{dst}/g{len(done) // 4 + k // 4:03d}.jpg'; o.save(name, quality=85); out.append(name)
    done.update(group)
open(dst + '/done.txt', 'w').write('\n'.join(done))
print('\n'.join(out))
