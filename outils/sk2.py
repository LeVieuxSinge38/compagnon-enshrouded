import json,re,sys
sys.path.insert(0,sys.argv[1]); from clean import clean
d=json.load(open('sk1.json',encoding='utf-8'))
w=json.load(open('wiki_skill.json',encoding='utf-8')); w.update({k:v for k,v in json.load(open('wiki_skill2.json',encoding='utf-8')).items() if v})
pd={o['title']:o for o in json.load(open('skills.json',encoding='utf-8'))}
# old->new renames: drop old if new present
skills={}
for r in d['rows']:
    n=r['name']
    s=skills.setdefault(n,dict(name=n,tree=r['tree'],arch=[],cost=r['cost'],desc=r['desc']))
    for a in r['arch']:
        if a not in s['arch']: s['arch'].append(a)
for n,g in d['nav'].items():
    if n in skills or not w.get(n): continue
    skills[n]=dict(name=n,tree=None,arch=list(g),cost=None,desc='')
treeOf={'Assassin':'Ranger','Ranger':'Ranger','Beastmaster':'Ranger','Survivor':'Ranger','Trickster':'Mage','Wizard':'Mage','Healer':'Mage','Battlemage':'Mage','Tank':'Warrior','Guardian':'Warrior','Warrior':'Warrior','Barbarian':'Warrior','Athlete':'Warrior','Core':'Core'}
out=[]
for n,s in skills.items():
    raw=w.get(n) or ''
    desc=None;cost=s['cost'];fr=None;ranks=1
    if raw:
        m=re.search(r'==\s*Description\s*==\s*\n(.*?)(?=\n\{\{Skills|\n==|\Z)',raw,re.S)
        if m: desc=m.group(1)
        else:
            m=re.search(r'\|\s*description\s*=\s*(.*)',raw); desc=m.group(1) if m else None
        m=re.search(r'\|\s*(?:Unlock )?Cost\s*=\s*([^\n]*)',raw); 
        if m: cost=m.group(1).strip()
        f=re.findall(r'\[\[fr:([^\]]+)\]\]',raw,re.I); fr=f[0].replace('_',' ') if f else None
    desc=clean(desc or s['desc'])
    rk=re.search(r'At maximum rank \((\d+)\)',desc)
    if rk: ranks=int(rk.group(1))
    cm=re.match(r'(\d+)',str(cost or '')); costn=int(cm.group(1)) if cm else None
    if 'per level' in str(cost): ranks=max(ranks,3)
    tree=s['tree'] or treeOf.get(s['arch'][0])
    out.append(dict(name=n,fr=fr,tree=tree,arch=s['arch'],cost=costn,ranks=ranks,desc=desc,id=(pd.get(n) or {}).get('id')))
print(len(out))
json.dump(out,open('skills_final_en.json','w',encoding='utf-8'),ensure_ascii=False,indent=0)
