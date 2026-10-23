import re,json,sys
h=open(sys.argv[1],encoding='utf-8').read()
# collect next flight pushes
chunks=re.findall(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)',h,re.S)
txt=''.join(json.loads('"'+c+'"') for c in chunks)
open(sys.argv[2],'w',encoding='utf-8').write(txt)
print(len(txt))
i=txt.find('"unlockCost"'); print(txt[i-400:i+800])
