#!/usr/bin/env python3
"""Import one Notes MCQ subject from a local, approved batch export.

Usage: python3 scripts/import_notes_mcq.py /path/to/export.json --subject accounting
Supported subjects: accounting, costing, income-tax, gst, auditing.
The export stays local. This script does not deploy or change any repository remotely.
Existing IDs and answer order are retained; source text is refreshed from the export.
Run the UI checks and review the diff before committing the generated files.
"""
import argparse, collections, hashlib, html, json, pathlib, re
ROOT = pathlib.Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'
MAP = {'costing': ('cost-accounting-practice', 'Cost Accounting Concepts (Practice)'),
       'income-tax': ('income-tax', 'Income Tax'), 'gst': ('gst-taxation', 'GST & Taxation'),
       'auditing': ('auditing', 'Auditing'), 'computer': ('computer-applications', 'Computer Awareness & Applications')}
def subject_of(batch, q):
    chapter = q.get('chapter', '')
    if re.match(r'Chapter IT\d', chapter): return 'income-tax'
    subject = batch['subject'].lower()
    if subject == 'accounting': return 'accounting'
    if subject.startswith('costing'): return 'costing'
    if 'income tax' in subject: return 'income-tax'
    if subject == 'gst': return 'gst'
    if 'audit' in subject: return 'auditing'
    if 'computer' in subject: return 'computer'
    raise ValueError('Unmapped subject: '+batch['subject'])
def memberships(q): return [q['subject'], *q.get('secondarySubjects', [])]
def is_pyq(q): return str(q['id']).lower().startswith('pyq-') or 'pyq' in q['subject'].lower() or bool(re.search(r'\bpyq\b',q.get('source',''),re.I))
def normalize(text): return re.sub(r'[^a-z0-9]', '', text.lower())
def fingerprint(q, values): return (normalize(q), tuple(sorted(normalize(v) for v in values)))
def replace_json(text, marker, data):
    prefix, rest = text.split(marker, 1)
    _, end = json.JSONDecoder().raw_decode(rest.lstrip())
    # The inline Accounting array must not allow text to close its script tag.
    encoded = json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
    return prefix+marker+encoded+rest.lstrip()[end:]
def write_sync_metadata():
    shared,_=json.JSONDecoder().raw_decode((DOCS/'question-bank.js').read_text().split('=',1)[1].lstrip())
    accounting,_=json.JSONDecoder().raw_decode((DOCS/'accounting-mcq-practice.html').read_text().split('const questions=',1)[1].lstrip())
    batches={};subjects=collections.Counter()
    for q in accounting:
        num=int(q['batch'][1:]);entry=batches.setdefault(num,{'batch':num,'subject':'Accounting','questions':0,'chapters':set()});entry['questions']+=1;entry['chapters'].add(q['chapter']);subjects['Accounting']+=1
    labelmap={'cost-accounting-practice':'Costing','income-tax':'Income Tax','gst-taxation':'GST','auditing':'Auditing','computer-applications':'Computer'}
    for q in shared['questions']:
        if 'batchNumber' not in q:continue
        label=labelmap[q['subject']];num=q['batchNumber'];entry=batches.setdefault(num,{'batch':num,'subject':label,'questions':0,'chapters':set()});entry['questions']+=1;entry['chapters'].add(q.get('topic',''));subjects[label]+=1
        if entry['subject']!=label:entry['subject']='Costing + Income Tax'
    rows=[]
    for num,row in sorted(batches.items()):
        rows.append({**row,'chapters':' / '.join(sorted(row['chapters']))})
    data={'version':1,'notes_total':sum(subjects.values()),'shared_practice_total':len(shared['questions']),'accounting_notes_total':len(accounting),'subject_counts':dict(subjects),'batches':rows}
    (DOCS/'notes-sync.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')

def content_signature(row):
    options=row['options'];options=[options[k] for k in 'ABCD'] if isinstance(options,dict) else options
    answer=row.get('answer');answer=ord(answer)-65 if isinstance(answer,str) else answer
    clean=lambda text:re.sub(r'\s+',' ',str(text)).strip()
    payload=[clean(row['question']),[clean(v) for v in options],answer,clean(row['explanation'])]
    return hashlib.sha256(json.dumps(payload,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
def attach_revision(previous,row,batch,question,correction_ids=(),expand_r2=False,expand_r1=False):
    marker=batch.get('revision')
    if not marker:
        assert not question.get('revision') and 'changed' not in question,('Question revision requires batch revision',row['id'])
        if previous:
            assert content_signature(previous)==content_signature(row),('Existing content changed without revision',row['id'])
            for key in ['revision','revisionChanged','revisionHistory','contentSignature']:
                if key in previous:row[key]=previous[key]
        row['contentSignature']=content_signature(row)
        return row
    if marker=='R2' and expand_r2:
        assert type(question.get('changed')) is bool,('Missing boolean changed',row['id'])
        if previous is not None:
            assert question.get('revision')==previous.get('revision') and question['changed'] is False,('R2 core must retain its revision and be unchanged',row['id'])
            assert content_signature(previous)==content_signature(row),('R2 expansion modified core',row['id'])
            for key in ['revision','revisionChanged','revisionHistory','contentSignature']:
                if key in previous:row[key]=previous[key]
        else:
            assert question.get('revision')=='R2' and question['changed'] is True,('New R2 row flags',row['id'])
            row.update(revision='R2',revisionChanged=True,revisionHistory=[],contentSignature=content_signature(row))
        return row
    marker=question.get('revision') or marker
    assert marker in ('R1','R2','R3'),('Unknown revision marker',row['id'])
    assert type(question.get('changed')) is bool,('Missing boolean changed',row['id'])
    if previous is None and expand_r1:
        assert question['changed'] is True,('New R1 row must be changed:true',row['id'])
        row.update(revision='R1',revisionChanged=True,revisionHistory=[],contentSignature=content_signature(row))
        return row
    assert previous is not None,('Revision must reference existing ID',row['id'])
    if previous.get('revision')==marker and content_signature(previous)!=content_signature(row) and row['id'] in correction_ids:
        history=list(previous.get('revisionHistory',[]))
        baseline=next((v for v in history if v.get('revision')=='original'),previous)
        changed=content_signature(baseline)!=content_signature(row)
        assert question['changed']==changed,('Correction flag disagrees with original baseline',row['id'])
        if not history:
            history.append({'revision':'original','contentSignature':content_signature(previous),'question':previous['question'],'options':previous['options'],'answer':previous['answer'],'explanation':previous['explanation']})
        history.append({'revision':marker,'contentSignature':content_signature(previous),'question':previous['question'],'options':previous['options'],'answer':previous['answer'],'explanation':previous['explanation']})
        row.update(revision=marker,revisionChanged=changed,contentSignature=content_signature(row),revisionHistory=history)
        return row
    if previous.get('revision')==marker:
        assert content_signature(previous)==content_signature(row),('Same revision changed again',row['id'])
        for key in ['revision','revisionChanged','revisionHistory','contentSignature']:row[key]=previous[key]
        return row
    changed=content_signature(previous)!=content_signature(row)
    assert question['changed']==changed,('changed flag disagrees with published content',row['id'])
    row['revision']=marker;row['revisionChanged']=changed;row['contentSignature']=content_signature(row)
    history=list(previous.get('revisionHistory',[]))
    if changed:
        history.append({'revision':previous.get('revision','original'),'contentSignature':content_signature(previous),'question':previous['question'],'options':previous['options'],'answer':previous['answer'],'explanation':previous['explanation']})
    row['revisionHistory']=history
    return row

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('export',type=pathlib.Path);ap.add_argument('--subject',choices=['accounting',*MAP],required=True)
    ap.add_argument('--correct-ids',nargs='*',default=[],help='Explicit reviewed same-revision correction IDs; all other changed R1 rows are rejected')
    ap.add_argument('--expand-r2',action='store_true',help='Explicit append-only R2 expansion; every core ID and content must remain unchanged')
    ap.add_argument('--expand-r1',action='store_true',help='Explicit full-core R1 replacement plus contiguous new appended IDs')
    args=ap.parse_args();
    assert not (args.expand_r1 and args.expand_r2), 'Choose one expansion mode'; source=json.loads(args.export.read_text())
    rows=[];batch_counts=collections.Counter()
    for b in source['batches']:
        assert len(b['questions'])==b['question_count'], ('source count',b['batch'])
        for q in b['questions']:
            assert q['batch']==b['batch'] and set(q['options'])==set('ABCD')
            assert q['correct'] in 'ABCD' and all(str(v).strip() for v in q['options'].values())
            assert q['question'].strip() and q['explanation'].strip()
            if subject_of(b,q)==args.subject:
                rows.append((b,q));batch_counts[b['batch']]+=1
    assert rows, 'No source questions for selected subject'
    assert len({(q['batch'],q['q_no']) for _,q in rows})==len(rows), 'Duplicate batch/question IDs'
    assert len({fingerprint(q['question'],q['options'].values()) for _,q in rows})==len(rows), 'Duplicate source records'
    # A revision batch must contain every existing row for this subject/batch.
    if any(b.get('revision') for b,q in rows):
        if args.subject=='accounting':
            published,_=json.JSONDecoder().raw_decode((DOCS/'accounting-mcq-practice.html').read_text().split('const questions=',1)[1].lstrip())
        else:
            published=json.JSONDecoder().raw_decode((DOCS/'question-bank.js').read_text().split('=',1)[1].lstrip())[0]['questions']
        for number in {b['batch'] for b,q in rows if b.get('revision')}:
            current={q['id'] for q in published if (q.get('batch')==f'b{number}' if args.subject=='accounting' else q.get('batchNumber')==number and q['subject']==MAP[args.subject][0])}
            supplied={f"b{number}-q{q['q_no']}" if args.subject=='accounting' else f"notes-b{number:03d}-q{q['q_no']:03d}" for b,q in rows if b['batch']==number}
            if args.expand_r2 or args.expand_r1:
                expected='R2' if args.expand_r2 else 'R1'
                assert args.subject!='accounting' and all(b.get('revision')==expected for b,q in rows), 'Expansion requires matching shared-bank revision export'
                assert current and current<supplied,('R2 must retain all core IDs and add new ones',number)
                all_published={int(q['id'].rsplit('q',1)[1]) for q in published if q.get('batchNumber')==number}
                universe=all_published|{int(ident.rsplit('q',1)[1]) for ident in supplied}
                assert universe==set(range(1,max(universe)+1)),('Expansion must keep batch numbering globally contiguous',number)
            else:
                assert current==supplied,('Incomplete revision batch or new IDs',number,current-supplied,supplied-current)
    home=(DOCS/'index.html').read_text()
    if args.subject=='accounting':
        path=DOCS/'accounting-mcq-practice.html';text=path.read_text()
        old,_=json.JSONDecoder().raw_decode(text.split('const questions=',1)[1].lstrip());byid={q['id']:q for q in old};new=[]
        for b,q in rows:
            ident=f"b{q['batch']}-q{q['q_no']}"
            row={'id':ident,'batch':f"b{q['batch']}",'number':q['q_no'],'chapter':q['tag'],
                 'question':q['question'],'options':q['options'],'answer':q['correct'],'explanation':q['explanation']}
            row=attach_revision(byid.get(ident),row,b,q,args.correct_ids,args.expand_r2,args.expand_r1)
            new.append(row)
        # Do not remove an older imported batch when a later export is partial.
        newids={q['id'] for q in new};new= [q for q in old if q['id'] not in newids]+new
        text=replace_json(text,'const questions=',new)
        counts=collections.Counter(q['batch'] for q in new)
        opts='<option value="all">All batches</option>'+''.join(f'<option value="{key}">Batch {key[1:]} · {counts[key]} questions</option>' for key in sorted(counts,key=lambda k:int(k[1:])))
        text=re.sub(r'(<select id="batch"[^>]*>).*?(</select>)',lambda m:m[1]+opts+m[2],text,flags=re.S)
        text=re.sub(r'const batchOf=q=>.*?;',"const batchOf=q=>q.batch;",text)
        text=re.sub(r'Accounting batches [^<]*',f'Accounting batches 1-{max(int(k[1:]) for k in counts)} · answers and explanations retained from the supplied PDFs',text,count=1)
        text=re.sub(r'(id="totalChip">)\d+ source questions',lambda m:m[1]+str(len(new))+' source questions',text)
        text=text.replace('from the three supplied PDFs','from the supplied PDFs')
        path.write_text(text)
        def accounting_card(m):
            card=m[0]
            if '<h3>Accounting MCQ Practice</h3>' not in card:return card
            card=re.sub(r'\d+ questions',f'{len(new)} questions',card)
            card=re.sub(r'\d+ batches',f'{len(counts)} batches',card)
            card=card.replace('data-category="accounting"','data-category="commerce"')
            card=card.replace('Three uploaded Accounting MCQ batches',f'Accounting MCQ batches 1-{max(int(k[1:]) for k in counts)}')
            return card
        home=re.sub(r'<article\b.*?</article>',accounting_card,home,flags=re.S)
        summary={'subject':args.subject,'total':len(new),'source_rows':len(rows),'added':len(new)-len(old),'batch_counts':dict(batch_counts)}
    else:
        path=DOCS/'question-bank.js';text=path.read_text();bank,_=json.JSONDecoder().raw_decode(text.split('=',1)[1].lstrip())
        slug,name=MAP[args.subject];old=bank['questions'];byid={q['id']:q for q in old};new=[]
        oldprints={fingerprint(q['question'],q['options']):q['id'] for q in old}
        for b,q in rows:
            ident=f"notes-b{q['batch']:03d}-q{q['q_no']:03d}"
            collision=oldprints.get(fingerprint(q['question'],q['options'].values()))
            assert not collision or collision==ident, ('Duplicate existing record',ident,collision)
            row={'id':ident,'sourceNumber':q['q_no'],'subject':slug,'subjectName':name,'topic':q['tag'],
                 'question':q['question'],'options':[q['options'][letter] for letter in 'ABCD'],'answer':ord(q['correct'])-65,
                 'explanation':q['explanation'],'source':f"Original practice from JVVNL JA Notes MCQ - {b['subject']} Batch {q['batch']}",
                 'sourceVersion':f"Notes MCQ Batch {q['batch']}",'batchNumber':q['batch'],'chapter':q['chapter'],
                 'answerVerification':'Source answer retained; not independently verified'}
            row=attach_revision(byid.get(ident),row,b,q,args.correct_ids,args.expand_r2,args.expand_r1)
            new.append(row)
        replacements={q['id']:q for q in new};merged=[replacements.pop(q['id'],q) for q in old]+list(replacements.values());bank['questions']=merged
        assert len({q['id'] for q in merged})==len(merged)
        for sec in bank['sections']:
            sec['count']=sum(sec['slug'] in memberships(q) for q in merged)
            note_count=sum(q['subject']==sec['slug'] and 'batchNumber' in q for q in merged)
            if note_count:sec['notesPracticeCount']=note_count
        total=len(merged);bank['totalCount']=bank['totalValid']=total
        bank['notesPracticeCount']=sum('batchNumber' in q for q in merged)
        path.write_text('window.JVVNL_BANK = '+json.dumps(bank,ensure_ascii=False,separators=(',',':'))+';\n')
        # Derive all public counts from actual records, never from raw source totals.
        counts=collections.Counter(slug for q in merged for slug in memberships(q));notes=collections.Counter(q['subject'] for q in merged if 'batchNumber' in q)
        home=re.sub(r'\d[\d,]* (?:shared )?practice questions',f'{total:,} shared practice questions',home)
        def update_card(m):
            card=m[0]
            if '<h3>Auditing &amp; Cost Audit</h3>' in card or '<h3>Auditing & Cost Audit</h3>' in card:
                card=re.sub(r'<p>Auditing questions.*?</p>',f'<p>Auditing questions in one place, with answers and explanations. {counts["auditing"]-notes["auditing"]} existing unique questions plus {notes["auditing"]} chapter-wise original practice MCQs from the notes batches.</p>',card)
                card=re.sub(r'\d+ Auditing MCQs · \d+ new notes practice',f'{counts["auditing"]} Auditing MCQs · {notes["auditing"]} new notes practice',card)
                pyqs=sum('auditing' in memberships(q) and is_pyq(q) for q in merged)
                card=re.sub(r'\d+ PYQs',f'{pyqs} PYQs',card,count=1)
                card=re.sub(r'(>PYQs \()\d+(\) →)',lambda m:m[1]+str(pyqs)+m[2],card)
            if '<h3>Income Tax &amp; GST</h3>' in card or '<h3>Income Tax & GST</h3>' in card:
                card=re.sub(r'\d+ unique GST MCQs',f'{counts["gst-taxation"]} unique GST MCQs',card)
                card=re.sub(r'\d+ unique Income Tax MCQs',f'{counts["income-tax"]} unique Income Tax MCQs',card)
                card=re.sub(r'\s*<a class="cardlink" data-notes-tax="true"[^>]*>.*?</a>','',card)
                additions=''
                for taxslug,label in [('gst-taxation','GST'),('income-tax','Income Tax')]:
                    if notes[taxslug]:additions+=f' <a class="cardlink" data-notes-tax="true" href="./practice.html?subject={taxslug}">{label} practice ({counts[taxslug]}) →</a>'
                card=card.replace('</div></article>',additions+'</div></article>')
            if '<h3>Cost Accounting</h3>' in card and notes['cost-accounting-practice']:
                card=re.sub(r'<p>.*?</p>',f'<p>700-MCQ deep bank plus {counts["cost-accounting-practice"]} original practice questions, including {notes["cost-accounting-practice"]} notes-based MCQs. Existing cost-accounting PYQs remain separate.</p>',card,count=1)
                card=re.sub(r'\s*<a class="cardlink" data-notes-cost="true"[^>]*>.*?</a>','',card)
                card=card.replace('</div></article>',f' <a class="cardlink" data-notes-cost="true" href="./practice.html?subject=cost-accounting-practice&amp;type=core">Notes MCQ ({counts["cost-accounting-practice"]}) →</a></div></article>')
            return card
        home=re.sub(r'<article\b.*?</article>',update_card,home,flags=re.S)
        practice=DOCS/'practice.html';s=practice.read_text()
        s=re.sub(r'The practice bank contains .*?source labels distinguish original practice from exam questions\.',f'The practice bank contains {total:,} questions, including {bank["notesPracticeCount"]} chapter-wise original practice MCQs from the notes batches. Repeated questions from earlier imports are consolidated; source labels distinguish original practice from exam questions.',s)
        s=re.sub(r'(id="totalCount">)[\d,]+',lambda m:m[1]+f'{total:,}',s)
        s=re.sub(r'(id="sideAnswered">0 / )[\d,]+',lambda m:m[1]+f'{total:,}',s)
        version=hashlib.sha256(path.read_bytes()).hexdigest()[:12]
        s=re.sub(r'src="\./question-bank\.js(?:\?v=[^"]*)?"',f'src="./question-bank.js?v={version}"',s);practice.write_text(s)
        summary={'subject':args.subject,'source_rows':len(rows),'added':len(merged)-len(old),'shared_total':total,'subject_total':counts[slug],'batch_counts':dict(batch_counts)}
    (DOCS/'index.html').write_text(home)
    write_sync_metadata()
    from build_subject_banks import build as build_subject_banks
    build_subject_banks()
    from version_site import main as version_site
    version_site()
    print(json.dumps(summary,indent=2))
if __name__=='__main__':main()
