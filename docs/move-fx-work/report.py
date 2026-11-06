import json, html, os
D = os.path.dirname(os.path.abspath(__file__)) + '/'
r = json.load(open(D + 'recipes.json'))

def load(f):
    out = {}
    for l in open(D + f, encoding='utf8'):
        if l.strip():
            i, s, rep, note = l.rstrip('\n').split('\t'); out[int(i)] = (int(s), note)
    return out

before, after = load('scores.tsv'), load('final.tsv')
names = json.load(open(D + 'ko_names.json', encoding='utf8'))
rows = []
for i, x in enumerate(r):
    b, bn = before[i]; a, an = after.get(i, (b, bn))
    rows.append(dict(i=i, rep=x['rep'], recipe=x['r'], n=x['n'], ks=x['ks'], b=b, bn=bn, a=a, an=an))
rows.sort(key=lambda x: (-x['b'], -x['n'], x['i']))
for k, x in enumerate(rows): x['rank'] = k + 1
top = 22
TOP_MIN = min(x['b'] for x in rows[:top])
nm = lambda k: names.get(k, k)

def tr(x):
    tag = '상위 10%' if x['rank'] <= top else ''
    moves = ', '.join(nm(k) for k in x['ks'][:6]) + (f' 외 {x["n"] - 6}' if x['n'] > 6 else '')
    up = x['a'] - x['b']
    reach = 'reach' if x['a'] >= TOP_MIN else ''
    return f'''<tr class="{'top' if tag else ''}"><td class="num">{x["rank"]}</td><td><b>{html.escape(nm(x["rep"]))}</b><span class="sub">{html.escape(moves)}</span></td><td class="num">{x["n"]}</td>
<td class="num b">{x["b"]}</td><td class="num a {reach}">{x["a"]}</td><td class="num d">{'+' if up > 0 else ''}{up if up else '0'}</td><td>{html.escape(x["recipe"])}</td></tr>'''

wavg = lambda key: sum(x[key] * x['n'] for x in rows) / sum(x['n'] for x in rows)
bottom = [x for x in rows if x['rank'] > top]
reached = sum(1 for x in bottom if x['a'] >= TOP_MIN)
stats = dict(n=len(rows), moves=sum(x['n'] for x in rows), bavg=wavg('b'), aavg=wavg('a'), top=top, topmin=TOP_MIN, reached=reached, bottom=len(bottom),
             bbot=sum(x['b'] for x in bottom) / len(bottom), abot=sum(x['a'] for x in bottom) / len(bottom))
page = open(D + 'report_tpl.html', encoding='utf8').read()
for k, v in stats.items(): page = page.replace('{{' + k + '}}', f'{v:.0f}' if isinstance(v, float) else str(v))
page = page.replace('{{rows}}', '\n'.join(tr(x) for x in rows))
open(D + '../move-fx-ranking.html', 'w', encoding='utf8').write(page)
print(stats)
