import re,json,urllib.request,xml.etree.ElementTree as ET
URL="https://www.youtube.com/feeds/videos.xml?channel_id=UCkhfuyQUD5GNulpQRJOqrGg"
ns={"a":"http://www.w3.org/2005/Atom","yt":"http://www.youtube.com/xml/schemas/2015"}
root=ET.fromstring(urllib.request.urlopen(URL,timeout=30).read())
out=[]
for e in root.findall("a:entry",ns):
    vid=e.find("yt:videoId",ns).text
    if not re.fullmatch(r"[\w-]{11}",vid or ""):continue
    if "/shorts/" in (e.find("a:link",ns).get("href") or ""):continue
    out.append({"id":vid,"t":re.sub(r"[<>]","",e.find("a:title",ns).text or "")[:200],"p":e.find("a:published",ns).text[:10]})
    if len(out)==5:break
json.dump(out,open("data/videos.json","w"),ensure_ascii=False,indent=1)
print(len(out))
