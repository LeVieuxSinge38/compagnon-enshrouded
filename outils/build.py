import json,re,sys
S,P=sys.argv[1],sys.argv[2]; W=S+'/web/'
L=lambda f:json.load(open(f,encoding='utf-8'))
# ---------- skills
sk=L(W+'skills_final_en.json'); fr=L(S+'/fr_skills.json')
sk.append(dict(name='Felling Axe Specialization',fr=None,tree='Core',arch=['Core'],cost=3,ranks=1,desc='Unlocks Special Abilities of Felling Axes. Press [R] to unleash a powerful Special Ability after generating enough Focus.'))
out=[]
for s in sk:
    f=fr.get(s['name'])
    if not f: print('NO FR',s['name'])
    frn=s['fr']
    if frn: frn=frn[0].upper()+frn[1:]
    out.append(dict(n=s['name'],fr=frn or s['name'],t=s['tree'],a=s['arch'],c=s['cost'] or 1,r=s['ranks'],en=s['desc'],d=f[0] if f else s['desc'],tags=(f[1] if f else '').split(),p=f[2] if f else 1))
# fix duplicate FR names
from collections import Counter
cnt=Counter(o['fr'] for o in out)
for o in out:
    if cnt[o['fr']]>1: o['fr']=o['fr']+' ('+o['n']+')'
open(P+'/data/skills.js','w',encoding='utf-8').write('// Compétences — source : enshrouded.wiki.gg (16/10/2026), traduction FR\nwindow.SKILLS='+json.dumps(out,ensure_ascii=False,separators=(',',':'))+';\n')
print('skills',len(out))
# ---------- materials + recipes
m=L(W+'mat2.json'); fm=L(S+'/fr_mats.json')
drop={'Electric Nerve','Poison Sack','Fish Bones','Fish Teeth','Old Books','Raw Fatty Meat'}
for k in drop:
    if k in fm: fm[k][1]=''
fm['Wolfsbane'][1]='Nécessaire pour la Flamme niveau 8.'
fm['Goo'][1]='Nécessaire pour la Flamme niveau 4.'
fm['Raw Fatty Meat'][1]='Sur les animaux sauvages.'
recipes={}
def addr(prod,qty,ings,st,time=None):
    if prod in recipes: return
    recipes[prod]=[qty,[[i['name'],i['qty']] for i in ings],st]
mats=[]
for x in m:
    f=fm.get(x['name'],['',''])
    c=x['craft']
    if c:
        st=([c['workshop']] if c.get('workshop') else [])+[s for s in (c.get('crafter') or []) if 'Assistant' not in s]
        addr(x['name'],c.get('outputQty') or 1,c['ingredients'],st)
    for u in x['used']:
        addr(u['p'],u['q'],u['i'],[s for s in u['s'] if 'Assistant' not in s])
    frn=f[0] or (x['fr'] or '').strip()
    mats.append(dict(n=x['name'],fr=frn or None,ty=x['type'],ra=x['rarity'],lv=x['level'],b=x['biomes'],d=x['desc'],o=f[1],oe=x['obtain']))
extra=[('Wood Logs','Bûches de bois','Abats n\'importe quel arbre avec une hache (partout, surtout Hautes pâtures et Revelwood). Ressource de base pour presque tout.',['Springlands']),
('Algae','Algues','Se récolte dans l\'eau du Bassin des eaux voilées.',['Veilwater Basin']),('Algae Buds','Bourgeons d\'algue','Se récolte dans l\'eau du Bassin des eaux voilées.',['Veilwater Basin']),
('Banana','Banane','Se récolte dans le Bassin des eaux voilées.',['Veilwater Basin']),('Raw Rice','Riz cru','Se récolte dans le Bassin des eaux voilées.',['Veilwater Basin']),
('Raw Taro','Taro cru','Se récolte dans le Bassin des eaux voilées.',['Veilwater Basin']),('Ginger','Gingembre','Se récolte dans le Bassin des eaux voilées.',['Veilwater Basin']),
('Plantain','Plantain','Se récolte dans le Bassin des eaux voilées.',['Veilwater Basin']),('Shiitake Mushroom','Shiitaké','Se récolte dans le Bassin des eaux voilées.',['Veilwater Basin']),
('Chanterelle','Girolle','Se récolte dans les Sommets d\'Albaneve.',['Albaneve Summits']),('Yucca Fruit','Fruit de yucca','Se récolte dans les Regs exaltés.',['Kindlewastes'])]
have={x['n'] for x in mats}
for n,f,o,b in extra:
    if n not in have: mats.append(dict(n=n,fr=f,ty='Materials',ra='Common',lv=None,b=b,d='',o=o,oe=''))
mats.sort(key=lambda x:(x['fr'] or x['n']).lower())
open(P+'/data/materials.js','w',encoding='utf-8').write('// Matériaux — source : enshrouded.wiki.gg + pindrop.gg (16/10/2026)\nwindow.MATERIALS='+json.dumps(mats,ensure_ascii=False,separators=(',',':'))+';\n')
open(P+'/data/recipes.js','w',encoding='utf-8').write('// Recettes : produit -> [quantité produite, [[ingrédient, qté]], [stations]]\nwindow.RECIPES='+json.dumps(recipes,ensure_ascii=False,separators=(',',':'))+';\n')
print('mats',len(mats),'recipes',len(recipes))
