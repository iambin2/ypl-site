# python sb.py "Protect" "Aqua Ring" ...: finds each move's showcase video (AGi-M "Move: X | Pokemon Scarlet Violet", else the first hit)
# and prints its storyboard sheets (3x3 frames of 320x180, about a second apart) to open in the browser. Cached in sb.json.
import json, os, subprocess, sys
D = os.path.dirname(os.path.abspath(__file__)) + '/'
cache = json.load(open(D + 'sb.json', encoding='utf8')) if os.path.exists(D + 'sb.json') else {}
yt = lambda *a: subprocess.run([sys.executable, '-m', 'yt_dlp', *a], capture_output=True, text=True, encoding='utf8', errors='replace').stdout
js = sys.argv[1:2] == ['--js']; names = sys.argv[2:] if js else sys.argv[1:]
for name in names:
    if name not in cache:
        pick = None
        for q in (f'ytsearch10:"Move: {name}" Pokemon Scarlet Violet AGi-M', f'ytsearch10:{name} Pokemon move animation Scarlet Violet'):
            hits = [l.split(' | ', 2) for l in yt(q, '--flat-playlist', '--print', '%(id)s | %(channel)s | %(title)s').splitlines() if l.count(' | ') >= 2]
            pick = next((h for h in hits if f'move: {name.lower()} |' in h[2].lower()), None) or next((h for h in hits if f' {name.lower()} ' in f' {h[2].lower()} '.replace('-', ' ')), None)
            if pick: break
        if not pick: print(name, 'NOT FOUND'); continue
        d = json.loads(yt('-J', f'https://www.youtube.com/watch?v={pick[0]}'))
        sb = next(f for f in d['formats'] if f['format_id'] == 'sb0')
        cache[name] = {'id': pick[0], 'title': pick[2], 'sheets': [x['url'] for x in sb['fragments']]}
        json.dump(cache, open(D + 'sb.json', 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    v = cache[name]
    if not js: print(name, '|', v['title']); [print(' ', u) for u in v['sheets'][:6]]
if js:
    import re
    out = {}
    for n in names:
        if n not in cache: continue
        m = re.match(r'https://i.ytimg.com/sb/([^/]+)/storyboard3_(L\d)/M\d+\.jpg\?sqp=([^&]+)&sigh=(.+)', cache[n]['sheets'][0])
        out[n] = [m[1], len(cache[n]['sheets']), m[2], m[3], m[4]]
    print('Object.assign(window.SBX ||= {}, ' + json.dumps(out) + ');')
# python sb.py --js "Move" ...: one compact line for the browser (SBX[name] = [video id, sheets, level, sqp, sigh]; window.grid expands it)
