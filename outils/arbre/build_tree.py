# Génère public/data/tree.js à partir des données extraites du jeu (projet rossicler/enshrouded-skill-tree, GPL-3.0)
import json, re, sys
src, out = sys.argv[1], sys.argv[2]
L = lambda f: json.load(open(f'{src}/{f}', encoding='utf-8'))
g = L('constants_gameSkillData.json')
fr = L('locales_fr_nodes.json')
en = L('locales_en_nodes.json')
pres = L('presentation.json')

def clean(lines):
    out = []
    for l in lines or []:
        l = re.sub(r'<br\s*/?>', '\n', l)
        l = re.sub(r'</?(?!b>|/b>)[a-z][^>]*>', '', l)   # on ne garde que <b>
        l = l.replace('’', "'").replace(' ', ' ').replace('\xa0', ' ')
        out.append(l.strip())
    return [l for l in out if l]

def titlecase(s):
    s = s.strip()
    return s[:1].upper() + s[1:].lower() if s.isupper() else s

types = {}
for t, v in g['types'].items():
    f = fr.get(t, {}); e = en.get(t, {})
    game_fr = f.get('game') or {}
    name_fr = game_fr.get('name') or titlecase(f.get('name', '')) or v.get('name') or t
    desc_fr = clean(game_fr.get('description') or f.get('description') or [])
    desc_en = clean(v.get('description') or (e.get('game') or {}).get('description') or e.get('description') or [])
    vals = {}
    for k, arr in (v.get('gameLevelValues') or {}).items(): vals[k] = arr
    for k, x in (v.get('gameValues') or {}).items(): vals[k] = x
    loc = ((v.get('gameLocaleValues') or {}).get('fr') or {})
    for k, arr in (loc.get('gameLevelValues') or {}).items(): vals[k] = arr
    for k, x in (loc.get('gameValues') or {}).items(): vals[k] = x
    p = pres['types'].get(t, {})
    types[t] = {
        'n': name_fr, 'en': v.get('name') or (e.get('game') or {}).get('name') or e.get('name') or t,
        'c': v.get('cost', p.get('cost', 1)), 'm': v.get('maxLevel') or p.get('maxLevel') or 1,
        'col': p.get('color', 'gold'), 'd': desc_fr or desc_en, 'v': vals,
    }

nodes = []
for nid, n in g['nodes'].items():
    nodes.append([int(nid), n['type'], round(n['position']['x'], 1), round(n['position']['y'], 1),
                  1 if n.get('base') else 0, pres['tiers'].get(nid) or 'medium'])
nodes.sort()
edges = [[int(a), int(b)] for a, b in g['edges']]
LABELS_FR = {'trickster': 'Illusionniste', 'wizard': 'Sorcier', 'healer': 'Guérisseur', 'battlemage': 'Mage de bataille',
             'tank': 'Tank', 'warrior': 'Guerrier', 'barbarian': 'Barbare', 'athlete': 'Athlète', 'survivor': 'Survivant',
             'beastmaster': 'Maître des bêtes', 'ranger': 'Rôdeur', 'assassin': 'Assassin'}
labels = [[LABELS_FR[l['nameKey']], l['angle'], l['distance']] for l in pres['labels']]
used = {n[1] for n in nodes}
types = {k: v for k, v in types.items() if k in used}
data = {'build': g['provenance']['gameBuild'].split('|')[0], 'nodes': nodes, 'edges': edges, 'types': types, 'labels': labels}
missing = [k for k in used if k not in types]
open(out, 'w', encoding='utf-8').write(
    '// Arbre de compétences de la version 1.0 (build ' + data['build'] + '), extrait des fichiers du jeu.\n'
    '// Source : github.com/rossicler/enshrouded-skill-tree (GPL-3.0) — positions, liaisons, coûts, noms et textes officiels FR.\n'
    'window.TREE=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('nœuds', len(nodes), 'liaisons', len(edges), 'types', len(types), 'manquants', missing, 'base', sum(n[4] for n in nodes))
for t in ['DOUBLE_JUMP', 'AIRBORNE', 'ATTR_STR', 'SNEAK_ATTACK']:
    if t in types: print(t, json.dumps(types[t], ensure_ascii=False)[:300])
