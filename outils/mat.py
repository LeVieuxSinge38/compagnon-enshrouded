import json,re,sys
sys.path.insert(0,sys.argv[1]); from clean import clean
m=json.load(open('materials.json',encoding='utf-8')); w=json.load(open('wiki_mat.json',encoding='utf-8'))
out=[];tot=0
for o in m:
    t=o['wikiUrl'].split('/wiki/')[1].replace('_',' ')
    raw=(w.get(t) or "").replace("{{PAGENAME}}",o["name"]).replace("{{SUBPAGENAME}}",o["name"]); raw=re.sub(r"[[(?:fr|FR|Category|C):[^]]*]]","",raw) if False else raw
    fr=re.findall(r'\[\[fr:([^\]]+)\]\]',raw,re.I)
    sec=''
    mm=re.search(r'==\s*(Obtaining|Source|Sources|Location|Locations|How to obtain|Obtaining\s*\w*)\s*==\s*\n(.*?)(?=\n==[^=]|\Z)',raw,re.S|re.I)
    if mm: sec=clean(re.sub(r'\[\[(?:fr|FR|Category|C|c):[^\]]*\]\]','',mm.group(2)))
    craft=None
    cm=re.search(r'\{\{Crafting(.*?)\}\}',raw,re.S)
    if cm:
        f=dict((k.strip(),v.strip()) for k,v in re.findall(r'\|\s*([^=|]+?)\s*=\s*([^|]*)',cm.group(1)))
        craft=f
    tot+=len(sec)
    out.append(dict(slug=o['slug'],name=o['name'],fr=fr[0].replace('_',' ') if fr else None,type=o['type'],rarity=o['rarity'],level=o['level'],biomes=o['biomes'],desc=o['description'],obtain=sec,craft=o['craftingRecipe'],wikicraft=craft,used=[dict(p=u['product'],q=u['productQty'],i=u['ingredients'],s=u['stations']) for u in o['usedToMake']]))
print(tot, sum(1 for x in out if x['obtain']), sum(1 for x in out if x['craft']))
json.dump(out,open('mat2.json','w',encoding='utf-8'),ensure_ascii=False)
for x in out[:300:25]: print(x['name'],'|',x['fr'],'|',x['obtain'][:300].replace('\n',' / '),'|',x['craft'])
