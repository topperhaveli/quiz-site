(() => {
'use strict';
const $=id=>document.getElementById(id);
try {
 const last=JSON.parse(localStorage.getItem('jvvnl-last-study-v1')||'null');
 if(last&&['practice','accounting'].includes(last.area)) {
  const params=new URLSearchParams();let path;
  if(last.area==='accounting'){path='./accounting-mcq-practice.html';if(/^b\d+$/.test(last.batch||''))params.set('batch',last.batch.slice(1));}
  else {path='./practice.html';if(/^[a-z0-9-]+$/.test(last.subject||''))params.set('subject',last.subject);if(/^(all|original|\d+)$/.test(String(last.batch||'')))params.set('batch',last.batch);if(typeof last.topic==='string'&&last.topic!=='all'&&last.topic.length<180)params.set('topic',last.topic);}
  if(typeof last.questionId==='string'&&/^[a-zA-Z0-9-]+$/.test(last.questionId))params.set('question',last.questionId);
  $('resumeStudyTitle').textContent=String(last.title||'Your last practice').slice(0,100);
  $('resumeStudyDetail').textContent='Return to the last question you opened. Answers and bookmarks stay in this browser.';
  $('resumeStudyLink').textContent='Continue practice →';$('resumeStudyLink').href=path+'?'+params;
 }
} catch(e) { /* The rest of the library remains usable without local storage. */ }
fetch('./notes-sync.json?v=c43250823b24',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('No sync metadata');return r.json()}).then(meta=>{
 if(!Array.isArray(meta.batches)||!meta.batches.length)return;
 const latest=[...meta.batches].sort((a,b)=>b.batch-a.batch)[0];
 if(!Number.isInteger(latest.batch)||!Number.isInteger(latest.questions))return;
 $('latestBatchTitle').textContent='Notes Batch '+latest.batch+' · '+latest.subject;
 $('latestBatchDetail').textContent=latest.questions+' questions · '+latest.chapters+' · source answers and explanations retained.';
 const params=new URLSearchParams({batch:String(latest.batch)});
 let path='./subject-practice.html';
 if(latest.subject==='Accounting')path='./accounting-mcq-practice.html';else{const slug={'Auditing':'auditing','GST':'gst-taxation','Income Tax':'income-tax','Costing':'cost-accounting-practice','Computer':'computer-awareness'}[latest.subject];if(!slug)return;params.set('subject',slug)}
 $('latestBatchLink').href=path+'?'+params;$('latestBatchLink').textContent='Practise Batch '+latest.batch+' →';
 const coverage=meta.subject_counts||{},labels=['Accounting','Costing','Income Tax','GST','Auditing','Computer'];let total=0;
 $('notesCoverageRows').replaceChildren();labels.forEach(label=>{const n=Number(coverage[label]||0);if(!Number.isInteger(n)||n<0)return;total+=n;const row=document.createElement('div'),name=document.createElement('span'),count=document.createElement('b');name.textContent=label;count.textContent=String(n);row.append(name,count);$('notesCoverageRows').append(row)});$('notesCoverageTitle').textContent=total.toLocaleString('en-IN')+' notes MCQs';
}).catch(()=>{});
})();
