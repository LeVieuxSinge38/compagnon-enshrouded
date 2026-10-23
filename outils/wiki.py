import json,sys,urllib.request,urllib.parse,time
titles=json.load(open(sys.argv[1],encoding='utf-8'))
res={}
for i in range(0,len(titles),50):
    batch=titles[i:i+50]
    q=urllib.parse.urlencode({'action':'query','prop':'revisions','rvprop':'content','rvslots':'main','titles':'|'.join(batch),'format':'json','formatversion':'2','redirects':'1'})
    req=urllib.request.Request('https://enshrouded.wiki.gg/api.php?'+q,headers={'User-Agent':'enshrouded-personal-helper/1.0'})
    d=json.load(urllib.request.urlopen(req,timeout=60))
    redir={r['to']:r['from'] for r in d['query'].get('redirects',[])}
    norm={n['to']:n['from'] for n in d['query'].get('normalized',[])}
    for p in d['query']['pages']:
        t=p['title']; src=redir.get(t,t); src=norm.get(src,src)
        if 'revisions' in p: res[src]=p['revisions'][0]['slots']['main']['content']
        else: res[src]=None
    time.sleep(1)
    print(i,len(res),file=sys.stderr)
json.dump(res,open(sys.argv[2],'w',encoding='utf-8'),ensure_ascii=False)
