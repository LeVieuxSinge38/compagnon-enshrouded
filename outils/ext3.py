import json,sys,re
t=open(sys.argv[1],encoding='utf-8').read()
d=json.JSONDecoder(); out={}
for m in re.finditer(r'\{"id":"',t):
    try:
        o,_=d.raw_decode(t,m.start())
        if 'unlockCost' in o: out[o['id']]=o
    except Exception: pass
print(len(out))
keys=set();[keys.update(o) for o in out.values()];print(keys)
json.dump(list(out.values()),open(sys.argv[2],'w',encoding='utf-8'),ensure_ascii=False,indent=0)
