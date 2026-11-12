# Busca só título, link e data das fontes. Não copia o texto das matérias.
import re,json,urllib.request,xml.etree.ElementTree as ET,html
from email.utils import parsedate_to_datetime
FEEDS={"leaky":"https://www.the-leaky-cauldron.org/feed/","mn":"https://www.mugglenet.com/feed/","fz":"https://www.harrypotterfanzone.com/feed/","hp":"https://www.hogwartsprofessor.com/feed/"}
YT="https://www.youtube.com/feeds/videos.xml?channel_id=UCkhfuyQUD5GNulpQRJOqrGg"
UA={"User-Agent":"Mozilla/5.0 (compatible; CaldeiraoApp/1.0)"}
def get(u):return urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=30).read()
limpa=lambda t:re.sub(r"[<>]","",html.unescape(t or "")).strip()[:200]
news=[]
for k,u in FEEDS.items():
    try:
        r=ET.fromstring(get(u))
        for it in r.findall(".//item")[:8]:
            link=(it.findtext("link") or "").strip()
            if not link.startswith("https://"):continue
            try:d=parsedate_to_datetime(it.findtext("pubDate")).date().isoformat()
            except Exception:d=""
            news.append({"f":k,"t":limpa(it.findtext("title")),"u":link,"d":d})
    except Exception as e:print("falhou",k,e)
ns={"a":"http://www.w3.org/2005/Atom","yt":"http://www.youtube.com/xml/schemas/2015"}
papo=[];vids=[]
try:
    r=ET.fromstring(get(YT))
    for e in r.findall("a:entry",ns):
        v=e.findtext("yt:videoId",namespaces=ns) or ""
        if not re.fullmatch(r"[\w-]{11}",v):continue
        if "/shorts/" in (e.find("a:link",ns).get("href") or ""):continue
        t=limpa(e.findtext("a:title",namespaces=ns));d=(e.findtext("a:published",namespaces=ns) or "")[:10]
        vids.append({"f":"caco","t":t,"v":v,"d":d})
        if re.search(r"papo\s*furado",t,re.I):papo.append({"id":v,"q":t,"d":d})
except Exception as e:print("falhou youtube",e)
news=sorted(news+vids[:6],key=lambda x:x["d"],reverse=True)[:40]
json.dump(news,open("data/news.json","w"),ensure_ascii=False,indent=1)
json.dump(papo,open("data/papo.json","w"),ensure_ascii=False,indent=1)
print(len(news),len(papo))
