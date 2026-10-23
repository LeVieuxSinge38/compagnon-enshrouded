import json,re,sys
d=json.load(open('wiki_prod.json',encoding='utf-8'))
def templates(t):
    out=[];i=0
    while True:
        i=t.find('{{Crafting',i)
        if i<0: break
        depth=0;j=i
        while j<len(t):
            if t.startswith('{{',j): depth+=1;j+=2;continue
            if t.startswith('}}',j):
                depth-=1;j+=2
                if depth==0: break
                continue
            j+=1
        out.append(t[i+2:j-2]);i=j
    return out
rec={};fr={};bad=0
for name,t in d.items():
    if not t: continue
    f=re.findall(r'\[\[fr:([^\]]+)\]\]',t,re.I)
    if f: fr[name]=f[0].replace('_',' ').strip()
    for tp in templates(t):
        body=re.sub(r'<!--.*?-->','',tp,flags=re.S)
        body=re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]*)\]\]',r'\1',body)
        fields={}
        for part in re.split(r'\n?\s*\|',body)[1:]:
            if '=' in part:
                k,v=part.split('=',1); fields[k.strip().lower()]=v.strip()
        ing=fields.get('ingredients','')
        ings=[]
        for x in re.split(r',\s*(?![^()]*\))',ing):
            m=re.match(r'\s*(.+?)\s*:\s*(\d+)\s*$',x)
            if m: ings.append([m.group(1).strip(),int(m.group(2))])
        if not ings: bad+=1; continue
        st=[s.strip() for k in ('workshop','crafter') for s in re.split(r',|<br\s*/?>',fields.get(k,'')) if s.strip()]
        q=re.match(r'\d+',fields.get('crafted quantity','1') or '1'); q=int(q.group()) if q else 1
        v=[q,ings,st]
        if v not in rec.setdefault(name,[]): rec[name].append(v)
print(len(rec),'products',sum(len(v) for v in rec.values()),'variants','bad',bad,'fr',len(fr))
for k in ['Bronze Bars','Charcoal','Copper Bars','Tin Bars','Fabric','Linen','Glass']: print(k,rec.get(k))
json.dump(rec,open('rec_wiki.json','w',encoding='utf-8'),ensure_ascii=False)
json.dump(fr,open('fr_prod.json','w',encoding='utf-8'),ensure_ascii=False)
