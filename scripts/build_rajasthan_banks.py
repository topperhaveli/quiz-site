#!/usr/bin/env python3
"""Build the four Rajasthan subject banks from the source banks, with a
frozen topic layout (scripts/rajasthan-topics.json).

Distribution model (paid Rajasthan content, user-approved 2026-10-20):
- The FULL banks are paid content. They live in the portal database only and
  are never published to the public repo or Pages site.
- The public docs/banks/rajasthan-*.js files contain only the free sample:
  rajasthan-gk: first 50 PYQs (frozen order);
  other three subjects: first 30 MCQs + first 20 PYQs (frozen order).
  Question ids are identical to the full-bank ids (subset, never renumbered).
- Source bank JSONs are private build inputs (not in the repo). Point
  RAJA_BANK_SRC at the directory holding rajasthan-gk-pyq-bank.json and
  rajasthan-gk-deep-bank.json (defaults to docs/ for legacy clones).
- `python3 build_rajasthan_banks.py` writes the public sample banks and
  syncs docs/banks/index.js counts.
- `python3 build_rajasthan_banks.py --full OUTDIR` writes the FULL banks to
  OUTDIR/banks/ for a private portal import handoff. Never point OUTDIR at a
  published directory.

Guarantees:
- Pre-2018 PYQ modules are excluded (rule from the user's own instruction,
  relayed via main: only exams held 2018+).
- Subject/topic assignment is an explicit frozen map: rebuilding can never
  silently reclassify or drop a question. New source questions fail the build
  until they are added to assignments in scripts/rajasthan-topics.json.
- docs/banks/index.js section counts and totalCount stay in sync with the
  bank files actually served.
Does not touch any other subject bank or page.
"""
import json, os, pathlib, sys
from import_notes_mcq import content_signature
ROOT = pathlib.Path(__file__).resolve().parents[1]; DOCS = ROOT/'docs'
SRC = pathlib.Path(os.environ.get('RAJA_BANK_SRC', str(DOCS)))
CFG = json.loads((ROOT/'scripts/rajasthan-topics.json').read_text())
# Frozen per-question assignments live with the private source banks.
ASSIGNMENTS = json.loads((SRC/'rajasthan-assignments.json').read_text())
SAMPLE = {'rajasthan-gk': {'pyq': 50, 'mcq': 0},
          'rajasthan-history': {'mcq': 30, 'pyq': 20},
          'rajasthan-geography': {'mcq': 30, 'pyq': 20},
          'rajasthan-art-culture': {'mcq': 30, 'pyq': 20}}

def transform(q, slug, prefix, storage):
    legacy = str(q.get('id', q.get('number')))
    number = q.get('number', q.get('id'))
    opts = {o['key']: o['text'] for o in q['options']}
    subject_name = CFG['subjects'][slug]['name']
    return {'id': prefix+'-'+legacy, 'sourceNumber': number, 'subject': slug,
            'subjectName': subject_name, 'topic': None,
            'question': q.get('question', q.get('stem', '')),
            'options': [opts[k] for k in 'ABCD'], 'answer': ord(q['answer'])-65,
            'explanation': q['explanation'],
            'source': str(q.get('source', 'Source compilation'))+' · '+subject_name+' deep bank',
            'sourceBank': prefix, 'auditStatus': q.get('auditStatus'),
            'auditNote': q.get('auditNote', q.get('reviewNote', '')),
            'sourceReviewStatus': q.get('reviewStatus', q.get('auditStatus', 'Source key not independently verified')),
            'sourceRecord': q,
            'legacyProgress': {'storageKey': storage, 'questionId': legacy, 'optionFormat': 'letter'}}

def collect():
    sources = [('rajasthan-gk-deep-bank.json', 'deep-rajasthan', 'mcq', 'topperhaveli-rajasthan-gk-deep-v1'),
               ('rajasthan-gk-pyq-bank.json', 'pyq-rajasthan', 'pyq', 'topperhaveli-rajasthan-gk-pyq-v1')]
    drop_modules = set(CFG['drops']['pyqModules'])
    banks = {slug: [] for slug in CFG['subjects']}
    unassigned = []
    for filename, prefix, kind, storage in sources:
        for q in json.loads((SRC/filename).read_text()):
            if q.get('module') in drop_modules:
                continue
            legacy = str(q.get('id', q.get('number')))
            ident = prefix+'-'+legacy
            target = ASSIGNMENTS.get(ident)
            if not target:
                unassigned.append(ident); continue
            slug, topic_id = target
            row = transform(q, slug, prefix, storage)
            row['topic'] = CFG['subjects'][slug]['topics'][topic_id]
            row['contentSignature'] = content_signature(row)
            row['kind'] = kind
            row['topicId'] = topic_id
            banks[slug].append(row)
    if unassigned:
        print('UNASSIGNED source questions (add to rajasthan-assignments.json in RAJA_BANK_SRC):')
        for i in unassigned: print(' ', i)
        sys.exit(1)
    for slug, subj in CFG['subjects'].items():
        qs = banks[slug]
        frozen = subj.get('order')
        if frozen:
            pos = {qid: i for i, qid in enumerate(frozen)}
            missing = [q['id'] for q in qs if q['id'] not in pos]
            if missing:
                print('NOT IN FROZEN ORDER for', slug, missing); sys.exit(1)
            qs.sort(key=lambda q: pos[q['id']])
    return banks

def bank_obj(slug, qs, full_count):
    subj = CFG['subjects'][slug]
    order = [t for t in subj['topicOrder'] if any(q['topic'] == t for q in qs)]
    return {'slug': slug, 'name': subj['name'], 'count': len(qs),
            'fullCount': full_count, 'topicOrder': order, 'questions': qs}

def write_bank(path, slug, bank):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("window.JVVNL_BANKS=window.JVVNL_BANKS||{};JVVNL_BANKS['%s']=" % slug
        + json.dumps(bank, ensure_ascii=False, indent=1)+';\n')

def filename_for(slug):
    return 'rajasthan-gk.js' if slug == 'rajasthan-gk' else 'rajasthan-%s.js' % slug.split('-', 1)[1]

def sample_of(slug, qs):
    want = SAMPLE[slug]
    picked = [q for q in qs if q['kind'] == 'mcq'][:want['mcq']]
    picked += [q for q in qs if q['kind'] == 'pyq'][:want['pyq']]
    return picked

def build_public():
    banks = collect()
    for slug, qs in banks.items():
        sample = sample_of(slug, qs)
        # Public serving artifact: drop the embedded duplicate of the source
        # record. Nothing on the site reads it; the full record stays in the
        # portal database and the private full-bank staging output.
        for q in sample:
            q.pop('sourceRecord', None)
        write_bank(DOCS/'banks'/filename_for(slug), slug, bank_obj(slug, sample, len(qs)))
        print(slug, 'public sample', len(sample), 'of full', len(qs))
    idx_path = DOCS/'banks'/'index.js'
    idx = json.JSONDecoder().raw_decode(idx_path.read_text().split('=', 1)[1].lstrip())[0]
    # Sync every section count with the bank file actually served (commerce
    # sections had stale counts including 78 dropped pre-2018 questions).
    for s in idx['sections']:
        bf = DOCS/'banks'/(s['slug']+'.js')
        if bf.exists():
            s['count'] = len(json.JSONDecoder().raw_decode(bf.read_text().split(']=',1)[1].lstrip().rstrip().rstrip(';'))[0]['questions'])
    idx['totalCount'] = sum(s['count'] for s in idx['sections'])
    idx_path.write_text('window.JVVNL_BANK_INDEX='
        + json.dumps(idx, ensure_ascii=False, separators=(',', ':'))+';\n')
    print('totalCount', idx['totalCount'])

def build_full(outdir):
    banks = collect()
    outdir = pathlib.Path(outdir).resolve()
    if str(outdir).startswith(str(DOCS)) or str(DOCS).startswith(str(outdir)):
        print('refusing to write full banks into/near the published docs tree'); sys.exit(1)
    for slug, qs in banks.items():
        write_bank(outdir/'banks'/filename_for(slug), slug, bank_obj(slug, qs, len(qs)))
        print(slug, 'full', len(qs), '->', outdir/'banks'/filename_for(slug))

if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--full':
        build_full(sys.argv[2])
    else:
        build_public()
