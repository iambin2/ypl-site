# python add.py move=score ... [--note "what changed"]: appends the new score lines to final.tsv (the last line per recipe wins)
import json, sys, os
D = os.path.dirname(os.path.abspath(__file__)) + '/'
args = sys.argv[1:]; note = 'rescored'
if '--note' in args: k = args.index('--note'); note = args[k + 1]; args = args[:k] + args[k + 2:]
r = json.load(open(D + 'recipes.json')); idx = {x['rep']: i for i, x in enumerate(r)}
with open(D + 'final.tsv', 'a', encoding='utf8') as f:
    for part in args:
        k, s = part.split('='); f.write(f"{idx[k]}\t{s}\t{k}\t{note}\n")
