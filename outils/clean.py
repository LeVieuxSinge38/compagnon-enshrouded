import re
def clean(s):
    if not s: return ''
    s=re.sub(r'<ref[^>]*/>','',s); s=re.sub(r'<ref[^>]*>.*?</ref>','',s,flags=re.S)
    s=re.sub(r'<gallery.*?</gallery>','',s,flags=re.S)
    s=re.sub(r'\[\[(?:File|Image|Fichier):[^\]]*(\[\[[^\]]*\]\][^\]]*)*\]\]','',s)
    s=re.sub(r'\{\{MapLink\s*\|[^}]*?\|[^|}]*\|\s*([^|}]*?)\s*(\|[^}]*)?\}\}',r'\1',s)
    s=re.sub(r'\{\{item\+icon(?:right)?\|([^|}]*)(?:\|[^}]*)?\}\}',lambda m:re.sub(r'\s*\(\d+\)\s*$','',m.group(1)).strip(),s)
    s=re.sub(r'\{\{quest\+the\|([^|}]*)\}\}',r'\1',s)
    s=re.sub(r'\{\{Key\|([^}]*)\}\}',r'[\1]',s)
    s=re.sub(r'\{\{[^{}]*\}\}','',s); s=re.sub(r'\{\{[^{}]*\}\}','',s)
    s=re.sub(r'\[\[:?c:[^|\]]*\|([^\]]*)\]\]',r'\1',s)
    s=re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]*)\]\]',r'\1',s)
    s=re.sub(r'\[https?://\S+ ([^\]]*)\]',r'\1',s)
    s=re.sub(r"'''?",'',s); s=re.sub(r'<br\s*/?>',' ',s); s=re.sub(r'<[^>]+>','',s)
    s=re.sub(r'\{\|.*?\|\}',lambda m:table(m.group(0)),s,flags=re.S)
    s=re.sub(r'[ \t]+',' ',s); s=re.sub(r'\n{2,}','\n',s)
    return s.strip()
def table(t):
    out=[]
    for row in re.split(r'\n\|-',t)[1:]:
        cells=[c.strip() for c in re.split(r'\|\||\n\|',row) if c.strip() and not c.strip().startswith('}')]
        cells=[c.lstrip('|').strip() for c in cells]
        if cells: out.append(' — '.join(c for c in cells if c and c!='?'))
    return '\n'.join('• '+o for o in out)
