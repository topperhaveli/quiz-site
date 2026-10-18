#!/usr/bin/env python3
"""Prepare consolidated Costing/Auditing data without touching source banks."""
import copy,json,pathlib
from import_notes_mcq import content_signature
ROOT=pathlib.Path(__file__).resolve().parents[1];DOCS=ROOT/'docs'
def inline(path,marker):return json.JSONDecoder().raw_decode(path.read_text().split(marker,1)[1].lstrip())[0]
def build():
 original=inline(DOCS/'question-bank.js','=');bank=copy.deepcopy(original)
 cost_slugs={'cost-accounting-pyq','advanced-cost-accounting','cost-accounting-practice'};audit_slugs={'auditing','cost-management-audit'}
 for q in bank['questions']:
  old_subject=q['subject'];members={old_subject,*q.get('secondarySubjects',[])};q['legacySubject']=old_subject
  if old_subject in cost_slugs:q['subject']='cost-accounting';q['subjectName']='Cost Accounting'
  if members&audit_slugs:q['subject']='auditing';q['subjectName']='Auditing';q['legacySubjects']=list(members);q['secondarySubjects']=[s for s in q.get('secondarySubjects',[]) if s not in audit_slugs]
  q['sourceBank']='notes' if 'batchNumber' in q else 'shared'
 cost=inline(DOCS/'cost-accounting.html','const QUESTIONS=')
 for q in cost:
  bank['questions'].append({'id':f"cost-deep-{q['id']:04d}",'sourceNumber':q['id'],'subject':'cost-accounting','subjectName':'Cost Accounting','topic':q['chapterId']+' · '+q['chapterName'],'question':q['questionText'],'options':[o['text'] for o in q['options']],'answer':ord(q['correctAnswer'])-65,'explanation':q['explanation'],'source':str(q.get('sourceTag',''))+' · Cost Accounting 700-question bank','sourceBank':'deep-cost','sourcePage':q.get('sourcePage'),'warnings':q.get('warnings',[]),'answerVerification':'Source answer retained; see source review warnings','legacyProgress':{'storageKey':'jvvnl_cost_quiz_v1','questionId':str(q['id']),'optionFormat':'letter'}})
 # Normalize the remaining independent sources, retaining their stable legacy references.
 for q in bank['questions']:
  if q['subject']=='computer-applications':q['subject']='computer-awareness';q['subjectName']='Computer Awareness & Applications'
 sources=[('management-accounting-deep-bank.json','management-accounting','Management Accounting','deep-management','jvvnl-deep-study-management-accounting-v1'),('computer-awareness-deep-bank.json','computer-awareness','Computer Awareness & Applications','deep-computer','jvvnl-deep-study-computer-awareness-v1'),('gst-question-bank.json','gst-taxation','GST','deep-gst','jvvnl-deep-study-gst-v1'),('income-tax-deep-bank.js','income-tax','Income Tax','deep-income-tax','jvvnl-deep-study-income-tax-v1')]
 for filename,slug,label,prefix,storage in sources:
  text=(DOCS/filename).read_text();rows=json.loads(text) if filename.endswith('.json') else json.JSONDecoder().raw_decode(text.split('=',1)[1].lstrip())[0]
  for q in rows:
   legacy=str(q.get('id',q.get('number')));number=q.get('number',q.get('id'));ident=prefix+'-'+legacy
   opts={o['key']:o['text'] for o in q['options']}
   bank['questions'].append({'id':ident,'sourceNumber':number,'subject':slug,'subjectName':label,'topic':q.get('module','')+' · '+q.get('moduleTitle',q.get('topic','')),'question':q.get('question',q.get('stem','')),'options':[opts[k] for k in 'ABCD'],'answer':ord(q['answer'])-65,'explanation':q['explanation'],'source':str(q.get('source','Source compilation'))+' · '+label+' deep bank','sourceBank':prefix,'auditStatus':q.get('auditStatus'),'auditNote':q.get('auditNote',q.get('reviewNote','')),'sourceReviewStatus':q.get('reviewStatus',q.get('auditStatus','Source key not independently verified')),'sourceRecord':q,'legacyProgress':{'storageKey':storage,'questionId':legacy,'optionFormat':'letter'}})
 accounting=inline(DOCS/'accounting-mcq-practice.html','const questions=')
 for q in accounting:
  bank['questions'].append({'id':q['id'],'sourceNumber':q['number'],'subject':'accounting','subjectName':'Accounting','topic':q['chapter'],'question':q['question'],'options':[q['options'][k] for k in 'ABCD'],'answer':ord(q['answer'])-65,'explanation':q['explanation'],'source':'Accounting Notes Batch '+q['batch'][1:],'sourceBank':'notes','batchNumber':int(q['batch'][1:]),'legacyProgress':{'storageKey':'jvvnl-accounting-notes-progress-v1','questionId':q['id'],'optionFormat':'letter'}})
 for accounting_row in accounting:
  target=next(q for q in bank['questions'] if q['id']==accounting_row['id'])
  for key in ['revision','revisionChanged','revisionHistory','contentSignature']:
   if key in accounting_row:target[key]=accounting_row[key]
 sections=[];seen=set()
 for section in bank['sections']:
  section=copy.deepcopy(section);slug=section['slug'];slug='cost-accounting' if slug in cost_slugs else 'auditing' if slug in audit_slugs else 'computer-awareness' if slug=='computer-applications' else slug
  if slug in seen:continue
  seen.add(slug);section['slug']=slug
  if slug=='cost-accounting':section['name']='Cost Accounting'
  if slug=='auditing':section['name']='Auditing'
  if slug=='computer-awareness':section['name']='Computer Awareness & Applications'
  section['count']=sum(q['subject']==slug or slug in q.get('secondarySubjects',[]) for q in bank['questions']);sections.append(section)
 sections.append({'slug':'accounting','name':'Accounting','count':len(accounting)})
 for row in bank['questions']:
  row['contentSignature']=content_signature(row)
 bank['sections']=sections;bank['totalCount']=bank['totalValid']=len(bank['questions']);bank['consolidationVersion']=1
 assert len({q['id'] for q in bank['questions']})==len(bank['questions'])
 original_by_id={q['id']:q for q in original['questions']}
 for q in bank['questions']:
  if q['id'] not in original_by_id:continue
  old=original_by_id[q['id']]
  for k in ['question','options','answer','explanation']:assert old[k]==q[k],(q['id'],k)
 # Keep the single consolidated subject entry/count current after partial imports.
 home=(DOCS/'index.html').read_text()
 import re
 for slug,title,label in [('cost-accounting','Cost Accounting','Costing'),('auditing','Auditing &amp; Cost Audit','Auditing')]:
  count=sum(q['subject']==slug for q in bank['questions'])
  def card(m):
   c=m[0]
   if '<h3>'+title+'</h3>' not in c and '<h3>'+title.replace('&amp;','&')+'</h3>' not in c:return c
   c=re.sub(r'<p>.*?</p>','<p>All '+label+' questions in one place. Filter by source, chapter, notes batch or PYQ inside the same screen.</p>',c,count=1,flags=re.S)
   start=c.index('<div class="cardfoot">')
   return c[:start]+f'<div class="cardfoot"><span>{count:,} question records · all sources</span><a class="cardlink" href="./subject-practice.html?subject={slug}">Open {label} →</a></div></article>'
  home=re.sub(r'<article\b.*?</article>',card,home,flags=re.S)
 # Replace split bank navigation with one destination for each syllabus subject.
 cards=[('Management Accounting','management-accounting','Management Accounting'),('Computer Awareness & Applications','computer-awareness','Computer Awareness &amp; Applications'),('Accounting MCQ Practice','accounting','Accounting')]
 for oldtitle,slug,title in cards:
  count=sum(q['subject']==slug for q in bank['questions'])
  def single(m):
   c=m[0]
   if '<h3>'+oldtitle+'</h3>' not in c and '<h3>'+title+'</h3>' not in c:return c
   c=re.sub(r'<h3>.*?</h3>','<h3>'+title+'</h3>',c,count=1)
   c=re.sub(r'<p>.*?</p>','<p>All '+title+' questions in one place. Filter by chapter, source, notes batch or PYQ inside the same screen.</p>',c,count=1,flags=re.S)
   start=c.index('<div class="cardfoot">')
   return c[:start]+f'<div class="cardfoot"><span>{count:,} question records · all sources</span><a class="cardlink" href="./subject-practice.html?subject={slug}">Open subject →</a></div></article>'
  home=re.sub(r'<article\b.*?</article>',single,home,flags=re.S)
 def newcard(slug,title):
  count=sum(q['subject']==slug for q in bank['questions'])
  return f'<article class="subject available" data-category="commerce"><div class="subjecttop"><div class="subjecticon">📘</div><span class="status ready">All sources together</span></div><h3>{title}</h3><p>All {title} questions in one place. Filter by chapter, source or batch without changing pages.</p><div class="cardfoot"><span>{count:,} question records · all sources</span><a class="cardlink" href="./subject-practice.html?subject={slug}">Open subject →</a></div></article>'
 def split(m):
  c=m[0]
  if '<h3>Financial &amp; Corporate Accounting</h3>' in c or '<h3>Financial & Corporate Accounting</h3>' in c:return newcard('corporate-accounting','Corporate Accounting')+newcard('financial-accounting','Advanced Financial Accounting')
  if '<h3>Income Tax &amp; GST</h3>' in c or '<h3>Income Tax & GST</h3>' in c:return newcard('income-tax','Income Tax')+newcard('gst-taxation','GST')
  for slug,title in [('corporate-accounting','Corporate Accounting'),('financial-accounting','Advanced Financial Accounting'),('income-tax','Income Tax'),('gst-taxation','GST')]:
   if '<h3>'+title+'</h3>' in c:return newcard(slug,title)
  return c
 home=re.sub(r'<article\b.*?</article>',split,home,flags=re.S)
 home=re.sub(r'\d[\d,]* shared practice questions',f"{len(bank['questions']):,} question records",home)
 home=re.sub(r'\d[\d,]* question records</div>',f"{len(bank['questions']):,} question records</div>",home)
 home=home.replace('The shared practice total counts consolidated records once; a question can be available under more than one subject. Accounting Notes and other deep banks are separate, so their totals are not a site-wide unique-question sum.','All question sources now open inside their subject page. Counts include source records; independently sourced questions may overlap. Law and source-reader notes are listed separately.')
 (DOCS/'index.html').write_text(home)
 (DOCS/'consolidated-bank.js').write_text('window.JVVNL_CONSOLIDATED_BANK = '+json.dumps(bank,ensure_ascii=False,separators=(',',':'))+';\n')
 summary={'total':len(bank['questions']),'costing':sum(q['subject']=='cost-accounting' for q in bank['questions']),'auditing':sum(q['subject']=='auditing' for q in bank['questions']),'sourceRecordsUnchanged':len(original['questions']),'costDeepAdded':len(cost)}
 print(json.dumps(summary,indent=2));return bank
if __name__=='__main__':build()
