# Génère public/data/map.js : lieux de la carte du wiki (Map:Embervale/Main) et, pour chaque ressource,
# les lieux où elle se trouve (description du lieu « Has [[Salt]] veins », « Grows [[Tomato]] »… ou lieu cité dans le texte « où trouver »).
import json, re, sys, os
D, R = sys.argv[1], sys.argv[2]
main = json.load(open(os.path.join(D, 'Main.json'), encoding='utf-8'))
icons = json.load(open(os.path.join(D, 'icons', '_index.json'), encoding='utf-8'))
mats = json.loads(re.search(r'window\.MATERIALS=(.*);\s*$', open(os.path.join(R, 'public/data/materials.js'), encoding='utf-8').read(), re.S).group(1))

GROUP_FR = {'Ancient_Spire': 'Flèche ancienne', 'Flame_Shrine': 'Sanctuaire de la Flamme', 'Sun_Temple': 'Temple du soleil',
            'Night_Sanctum': 'Sanctuaire nocturne', 'Ancient_Vault': 'Caveau ancien', 'Ancient_Obelisk': 'Obélisque ancien',
            'Elixir_Well': "Puits d'élixir", 'Shroud_Root': 'Racine de Brume', 'Balefire': 'Feu de joie', 'Hollow_Halls': 'Salles creuses',
            'Gem_Forge': 'Forge de gemmes', 'Village': 'Village', 'Camp': 'Camp', 'Farm': 'Ferme', 'Mine': 'Mine',
            'Enemy_Camp': 'Camp ennemi', 'Shroud_Lair': 'Repaire de Brume', 'Hidden_Temple': 'Temple caché', 'Tomb': 'Tombeau',
            'Cave_Passage': 'Grotte'}
link = re.compile(r'\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]')
markers, by_mat = [], {}
names = {m['n'] for m in mats}
lower = {n.lower(): n for n in names}
def mat_of(n):
    n = n.strip(); l = n.lower()
    if l in lower: return lower[l]
    for suf in (' ore', ' veins', ' vein'):            # « [[Copper]] veins » -> Copper Ore
        if l + suf in lower: return lower[l + suf]
    if l.endswith('s') and l[:-1] in lower: return lower[l[:-1]]
    return None
for g, arr in main['markers'].items():
    for m in arr:
        idx = len(markers)
        desc = m.get('description') or ''
        markers.append([m['id'], m.get('name') or m['id'], g, round(m['x']), round(m['y']), re.sub(r'\[\[(?:[^\]|]*\|)?([^\]]*)\]\]', r'\1', desc)])
        for l in link.findall(desc):
            mn = mat_of(l)
            if mn: by_mat.setdefault(mn, set()).add(idx)
# Lieux cités dans les textes « où trouver » (ex. « Egerton Salt Mines », « Rose Shell Burrow »)
for m in mats:
    text = (m.get('oe') or '') + ' ' + (m.get('o') or '')
    for i, mk in enumerate(markers):
        nm = mk[1]
        if len(nm) > 6 and nm not in ('Cave Passage', 'Mine', 'Farm', 'Village') and nm in text:
            by_mat.setdefault(m['n'], set()).add(i)
data = {'size': 10240, 'groups': GROUP_FR, 'markers': markers,
        'byMat': {k: sorted(v) for k, v in sorted(by_mat.items())},
        'icons': {k: v for k, v in icons.items()}}
open(os.path.join(R, 'public/data/map.js'), 'w', encoding='utf-8').write(
    '// Carte de Valdebraise : lieux (wiki Enshrouded, Map:Embervale) et ressources qu\'on y trouve ; icônes des ressources.\n'
    'window.MAP=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('lieux', len(markers), 'ressources avec points', len(by_mat))
for k in ['Salt', 'Copper Ore', 'Iron Ore', 'Tin Ore', 'Tomato', 'Saffron', 'Flintstone', 'Coal', 'Silver Ore', 'Amber']:
    print(k, [markers[i][1] for i in sorted(by_mat.get(k, []))][:6], len(by_mat.get(k, [])))
