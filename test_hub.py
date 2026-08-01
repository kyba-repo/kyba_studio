import urllib.request, re
req = urllib.request.Request('https://ollama.com/library?sort=popular', headers={'User-Agent': 'Mozilla/5.0'})
html = urllib.request.urlopen(req).read().decode('utf-8')
blocks = re.findall(r'<a href=\"/library/[^\"]+\"[^>]*>[\s\S]*?</a>', html)
capabilities = set()
for b in blocks:
    matches = re.findall(r'<span[^>]*bg-indigo-50[^>]*>([\s\S]*?)</span>', b)
    for m in matches: capabilities.add(m.strip())
print('Capabilities bg-indigo-50:', capabilities)

all_tags = set()
for b in blocks:
    matches = re.findall(r'<span[^>]*inline-flex[^>]*>([\s\S]*?)</span>', b)
    for m in matches: 
        text = re.sub(r'<[^>]+>', '', m).strip()
        if text: all_tags.add(text)
print('All tags:', all_tags)
