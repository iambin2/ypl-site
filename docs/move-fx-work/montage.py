import sys, os, glob
from PIL import Image
src, dst, per = sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 3
os.makedirs(dst, exist_ok=True)
files = sorted(glob.glob(os.path.join(src, "*.jpg")))
for k in range(0, len(files), per):
    ims = [Image.open(f) for f in files[k:k + per]]
    W = max(i.width for i in ims); H = sum(i.height for i in ims)
    out = Image.new("RGB", (W, H))
    y = 0
    for i in ims: out.paste(i, (0, y)); y += i.height
    out.save(os.path.join(dst, f"m{k // per:03d}.jpg"), quality=85)
print(len(files))
