import re,json
page=open('skills_page.txt',encoding='utf-8').read()
tpl=open('tpl_skills.txt',encoding='utf-8').read()
rows=[];tree=None;arch=None
for line in page.split('\n'):
    m=re.match(r'^==\s*(\w+) Skill Tree',line)
    if m: tree=m.group(1); continue
    if line.startswith('== Core'): tree='Core'; arch=['Core']; continue
    m=re.match(r'^=+\s*([\w/]+) Skills\s*=+',line)
    if m: arch=m.group(1).split('/'); continue
    if line.startswith('== Skill Tree Calc'): tree=None
    if tree and line.startswith('|') and not line.startswith('|-') and not line.startswith('|}') and '||' in line:
        cells=[c.strip() for c in line.lstrip('|').split('||')]
        name=re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]*)\]\]',r'\1',cells[1]).strip()
        rows.append(dict(name=name,tree=tree,arch=arch,cost=cells[2],desc=cells[3]))
# rows with 3-line format (Felling Axe Specialization)
print(len(rows))
nav={}
for g,l in re.findall(r'\| group\d+ = (\w+)\s*\n\| list\d+ = (.*)',tpl):
    for n in re.findall(r'\[\[([^\]|]+)',l): nav.setdefault(n.strip(),[]).append(g)
print(len(nav))
names={r['name'] for r in rows}
print('in nav not page:',sorted(set(nav)-names))
print('in page not nav:',sorted(names-set(nav)))
json.dump({'rows':rows,'nav':nav},open('sk1.json','w',encoding='utf-8'),ensure_ascii=False)
