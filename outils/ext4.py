import re,json,sys
t=open(sys.argv[1],encoding='utf-8').read()
d=json.JSONDecoder();out={}
for m in re.finditer(r'\{"slug":"',t):
    try: o,_=d.raw_decode(t,m.start())
    except Exception: continue
    if 'usedToMake' in o or 'biomes' in o: out[o['slug']]=o
print(len(out))
keys={}
for o in out.values():
    for k in o: keys[k]=keys.get(k,0)+1
print(keys)
json.dump(list(out.values()),open(sys.argv[2],'w',encoding='utf-8'),ensure_ascii=False)
from collections import Counter
print(Counter(b for o in out.values() for b in (o.get('biomes') or [])))
print(Counter(o.get('type') for o in out.values()))
print(sum(1 for o in out.values() if o.get('craftingRecipe')))
