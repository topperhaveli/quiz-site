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
})();
