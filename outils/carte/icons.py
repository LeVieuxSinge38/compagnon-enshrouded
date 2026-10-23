# Télécharge l'icône de chaque matériau depuis le wiki (API imageinfo, vignettes 64 px)
import json, re, sys, time, urllib.request, urllib.parse, os
names = json.load(open(sys.argv[1], encoding='utf-8'))
out = sys.argv[2]; os.makedirs(out, exist_ok=True)
UA = {'User-Agent': 'enshrouded-personal-helper/1.0'}
slug = lambda n: re.sub(r'[^a-z0-9]+', '-', n.lower()).strip('-')
found = {}
for i in range(0, len(names), 50):
    batch = names[i:i + 50]
    q = urllib.parse.urlencode({'action': 'query', 'titles': '|'.join('File:' + n + '.png' for n in batch), 'prop': 'imageinfo',
                                'iiprop': 'url', 'iiurlwidth': 64, 'format': 'json', 'formatversion': 2})
    d = json.load(urllib.request.urlopen(urllib.request.Request('https://enshrouded.wiki.gg/api.php?' + q, headers=UA), timeout=60))
    norm = {x['to']: x['from'] for x in d['query'].get('normalized', [])}
    for p in d['query']['pages']:
        if 'imageinfo' not in p: continue
        title = norm.get(p['title'], p['title'])
        name = title[5:-4].replace('_', ' ')
        ii = p['imageinfo'][0]
        url = ii.get('thumburl') or ii['url']
        f = slug(name) + '.png'
        req = urllib.request.Request(url, headers=UA)
        open(os.path.join(out, f), 'wb').write(urllib.request.urlopen(req, timeout=60).read())
        found[name] = f
        time.sleep(0.15)
    time.sleep(1)
json.dump(found, open(os.path.join(out, '_index.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print('icônes', len(found), '/', len(names))
