#!/usr/bin/env python3
"""Refresh local JS/data hashes and page release IDs before every publication."""
from pathlib import Path
import hashlib,json,re,html
ROOT=Path(__file__).resolve().parents[1];DOCS=ROOT/'docs'
def dequery(s):return re.sub(r'([?&](?:amp;)?v=)[a-zA-Z0-9_-]+',r'\g<1>VERSION',s)
def main():
 # Version data fetched by external controllers before hashing their consumers.
 for p in DOCS.glob('*.js'):
  if p.name=='site-version.js':continue
  s=p.read_text()
  def dataref(m):
   quote,path=m[1],m[2];target=DOCS/path.removeprefix('./')
   if not target.is_file():return m[0]
   return quote+path+'?v='+hashlib.sha256(target.read_bytes()).hexdigest()[:12]+quote
  s=re.sub(r"([\"'])(\./[^\"'?]+\.json)(?:\?v=[a-zA-Z0-9_-]+)?\1",dataref,s)
  p.write_text(s)
 pages={p:p.read_text() for p in DOCS.glob('*.html')}
 for p,s in pages.items():
  if 'site-version.js' not in s:s=s.replace('</body>','<script src="./site-version.js"></script></body>')
  s=re.sub(r' data-site-version="[^"]*"','',s);pages[p]=s
 digest=hashlib.sha256()
 for p in sorted(DOCS.iterdir()):
  if p.suffix not in {'.html','.js','.json'} or p.name=='site-release.json':continue
  s=pages.get(p,p.read_text());digest.update(p.name.encode());digest.update(dequery(s).encode())
 version=digest.hexdigest()[:12]
 for p,s in pages.items():
  s=re.sub(r'<html\b',f'<html data-site-version="{version}"',s,count=1)
  # Quoted relative asset references include fetch() and script src.
  def asset(m):
   quote,path=m[1],m[2];target=DOCS/path.removeprefix('./')
   if not target.is_file():return m[0]
   tag=hashlib.sha256(target.read_bytes()).hexdigest()[:12]
   return quote+path+'?v='+tag+quote
  s=re.sub(r'''(["'])(\./[^"'?]+\.(?:js|json))(?:\?v=[a-zA-Z0-9_-]+)?\1''',asset,s)
  def page_link(m):
   raw=m[1];url=html.unescape(raw);parts=url.split('#',1);pathquery=parts[0];path,sep,query=pathquery.partition('?')
   target=DOCS/path.removeprefix('./')
   if path not in ['./','./index.html'] and not target.is_file():return m[0]
   params=[x for x in query.split('&') if x and not x.startswith('v=')];params.append('v='+version)
   return 'href="'+html.escape(path+'?'+'&'.join(params)+('#'+parts[1] if len(parts)>1 else ''),quote=True)+'"'
  s=re.sub(r'href="(\./[^"#]*(?:\.html(?:[?#][^"]*)?)?|\./)"',page_link,s)
  p.write_text(s)
 (DOCS/'site-release.json').write_text(json.dumps({'version':version})+'\n')
 print(version)
 return version
if __name__=='__main__':main()
