(()=>{'use strict';
const SUPA_URL='https://jvvnl-quiz-api.crypticfiles40.workers.dev';
const SUPA_KEY='sb_publishable_D90wb1cJD2X6PjgIIa645Q_fofHiSku';
const sb=window.supabase.createClient(SUPA_URL,SUPA_KEY);
const app=document.getElementById('app');
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const md=s=>esc(s||'').replace(/\*\*(.+?)\*\*/g,'<b>$1</b>');
let S={session:null,profile:null,subjects:null,config:{free_question_count:50,free_mock_per_subject:true,paid_validity_days:120},qcache:{}};
const isPaid=()=>!!(S.profile&&(S.profile.is_admin||(S.profile.is_paid&&(!S.profile.paid_until||new Date(S.profile.paid_until).getTime()>Date.now()))));
const activePlan=u=>!!(u&&u.is_paid&&(!u.paid_until||new Date(u.paid_until).getTime()>Date.now()));
const planStatus=u=>{
  if(!u.is_paid)return{t:'FREE',c:'free'};
  if(!u.paid_until)return{t:'LIFETIME',c:'paid'};
  const d=Math.ceil((new Date(u.paid_until).getTime()-Date.now())/86400000);
  if(d<0)return{t:'EXPIRED',c:'warn'};
  return{t:'PAID · '+d+'d',c:'paid'}};
const planChip=()=>{
  const p=S.profile;if(!p)return '';
  if(p.is_admin)return '<span class="badge paid">ADMIN ACCESS</span>';
  if(!p.is_paid)return '';
  if(!p.paid_until)return '<span class="badge paid">LIFETIME ACCESS</span>';
  const d=Math.ceil((new Date(p.paid_until).getTime()-Date.now())/86400000);
  if(d<0)return '<span class="badge warn">Plan khatam ho gaya</span>';
  return `<span class="badge ${d<=7?'warn':'paid'}">${d} din bache</span>`;};
const isAdmin=()=>!!(S.profile&&S.profile.is_admin);

async function fetchProfile(){const{data}=await sb.from('profiles').select('*').eq('id',S.session.user.id).single();S.profile=data;
  document.getElementById('navAdmin').classList.toggle('hidden',!isAdmin());
  const b=document.getElementById('userBadge');
  b.innerHTML=isAdmin()?'<span class="badge warn">ADMIN</span>':(isPaid()?'<span class="badge paid">PAID</span>':'<span class="badge free">FREE</span>');}
async function fetchSubjects(){if(!S.subjects){const{data}=await sb.from('subjects').select('*').order('sort');S.subjects=data||[];}
  const{data:cfg}=await sb.from('app_config').select('*');
  (cfg||[]).forEach(r=>{try{S.config[r.key]=JSON.parse(r.value)}catch(e){S.config[r.key]=r.value}});}
async function fetchQuestions(slug){if(S.qcache[slug])return S.qcache[slug];
  const{data,error}=await sb.from('questions').select('*').eq('subject_slug',slug).order('ord');
  if(error){console.warn(error);return[];} S.qcache[slug]=data||[]; return S.qcache[slug];}
async function fetchAttempts(){const{data}=await sb.from('attempts').select('question_id,subject_slug,chosen,correct,mode,created_at').eq('user_id',S.session.user.id);
  return data||[];}

async function importLegacy(){if(localStorage.getItem('portal_imported_v1'))return;
  try{const saved=JSON.parse(localStorage.getItem('jvvnl-source-bank-progress-v1')||'null');
    const ans=saved&&saved.answers&&typeof saved.answers==='object'?saved.answers:{};
    const ids=Object.keys(ans);let n=0;
    if(ids.length){const{data:qs}=await sb.from('questions').select('id,subject_slug,answer').in('id',ids.slice(0,10000));
      const byId={};(qs||[]).forEach(q=>byId[q.id]=q);
      const rows=ids.filter(id=>byId[id]!==undefined&&Number.isInteger(Number(ans[id]))).map(id=>({user_id:S.session.user.id,question_id:id,subject_slug:byId[id].subject_slug,chosen:Number(ans[id]),correct:Number(ans[id])===byId[id].answer,mode:'practice'}));
      for(let i=0;i<rows.length;i+=500){await sb.from('attempts').upsert(rows.slice(i,i+500),{onConflict:'user_id,question_id',ignoreDuplicates:true});n+=Math.min(500,rows.length-i);}
      if(n>0)localStorage.setItem('portal_import_note',n+' saved answers imported from the old site.');}
  }catch(e){console.warn('import failed',e);}
  localStorage.setItem('portal_imported_v1','1');}

function nav(active){document.getElementById('navbar').classList.remove('hidden');
  document.querySelectorAll('.navbar a').forEach(a=>a.classList.toggle('on',a.dataset.nav===active));
  document.getElementById('logoutBtn').classList.remove('hidden');}
function setApp(html){app.innerHTML=html;}
const subjName=slug=>((S.subjects||[]).find(s=>s.slug===slug)||{}).name||slug;

function vLogin(){document.getElementById('navbar').classList.add('hidden');document.getElementById('logoutBtn').classList.add('hidden');document.getElementById('userBadge').innerHTML='';
  setApp(`<div class="card center"><h2>JVVNL Quiz Portal</h2><p class="muted">Login for your personal dashboard, saved progress on every phone, and full question banks.</p></div>
  <div class="card"><div class="row"><button class="chipbtn on" id="tabIn" type="button">Login</button><button class="chipbtn" id="tabUp" type="button">New account</button></div>
  <div id="nameRow" class="hidden"><label>Your name</label><input id="fName" autocomplete="name"></div>
  <label>Email</label><input id="fEmail" type="email" autocomplete="email">
  <label>Password</label><input id="fPass" type="password" autocomplete="current-password">
  <button class="btn primary block" id="goBtn" type="button">Login</button>
  <p class="center mt"><a href="#" id="forgotL">Forgot password?</a></p>
  <div class="notice hidden" id="authMsg"></div></div>
  <p class="muted center mt">Free account: practice sets + 1 free mock per subject + basic dashboard.<br>Paid: all 6,400+ questions, unlimited mocks, weak-topic analysis, rank.</p>`);
  let mode='in';
  const tab=m=>{mode=m;document.getElementById('tabIn').classList.toggle('on',m==='in');document.getElementById('tabUp').classList.toggle('on',m==='up');
    document.getElementById('nameRow').classList.toggle('hidden',m==='in');document.getElementById('goBtn').textContent=m==='in'?'Login':'Create account';};
  document.getElementById('tabIn').onclick=()=>tab('in');document.getElementById('tabUp').onclick=()=>tab('up');
  document.getElementById('forgotL').onclick=async(e)=>{e.preventDefault();
    const email=document.getElementById('fEmail').value.trim(),msg=document.getElementById('authMsg');
    if(!email){msg.textContent='Pehle apna email upar daalo.';msg.classList.remove('hidden');return;}
    const{error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:'https://topperhaveli.github.io/quiz-site/portal.html?r='+Date.now()});
    msg.classList.remove('hidden');
    if(error){msg.textContent=error.message;}else{msg.textContent='Reset link bhej diya. Email kholo, link dabao, naya password set karo.';msg.classList.add('ok');}};
  document.getElementById('goBtn').onclick=async()=>{
    const email=document.getElementById('fEmail').value.trim(),pass=document.getElementById('fPass').value,msg=document.getElementById('authMsg');
    msg.classList.add('hidden');
    if(!email||pass.length<6){msg.textContent='Email aur 6+ character password daalo.';msg.classList.remove('hidden');return;}
    document.getElementById('goBtn').disabled=true;
    try{
      if(mode==='up'){const{error}=await sb.auth.signUp({email,password:pass,options:{data:{display_name:document.getElementById('fName').value.trim()}}});
        if(error)throw error;
        msg.innerHTML='Account ban gaya. Agar confirmation email aaye to link khol lena, phir login karna.';msg.classList.remove('hidden');msg.classList.add('ok');
        const{data:ses}=await sb.auth.getSession();if(ses&&ses.session){location.hash='#/home';return;}}
      else{const{error}=await sb.auth.signInWithPassword({email,password:pass});if(error)throw error;location.hash='#/home';return;}
    }catch(e){msg.textContent=e.message||'Login failed';msg.classList.remove('hidden');}
    document.getElementById('goBtn').disabled=false;};}

async function vHome(){nav('home');await fetchSubjects();
  const paid=isPaid();
  const note=localStorage.getItem('portal_import_note');if(note)localStorage.removeItem('portal_import_note');
  const{data:openMocks}=await sb.from('mock_attempts').select('id,subject_slug,started_at').eq('user_id',S.session.user.id).eq('status','in_progress').order('started_at',{ascending:false}).limit(1);
  setApp(`${note?`<div class="notice ok">${esc(note)}</div>`:''}
  ${openMocks&&openMocks.length?`<div class="card"><h3>Paused mock</h3><p class="muted">${esc(subjName(openMocks[0].subject_slug))} - chalu hai</p><a class="btn primary block" href="#/mockrun/${openMocks[0].id}">Resume mock</a></div>`:''}
  <div class="card"><div class="row"><h2 style="flex:1;margin:0">Subjects</h2>${planChip()}</div><p class="muted">${paid?'Full access: saare questions aur unlimited mocks.':'Free access: har subject me pehle '+S.config.free_question_count+' questions + 1 free mock.'}</p></div>
  <div id="subjList">${S.subjects.map(s=>`<div class="subj" data-slug="${s.slug}"><div class="nm"><b>${esc(s.name)}</b><span class="muted">${paid?'Full bank':'Free: '+s.free_question_count+' Q'}</span></div>${paid?'<span class="badge paid">PAID</span>':'<span class="badge free">FREE</span>'}</div>`).join('')}</div>
  ${!paid?`<div class="card center"><h3>${S.profile&&S.profile.is_paid?'Plan khatam ho gaya':'Unlock full access'}</h3><p class="muted">Saare 6,400+ questions, unlimited mocks, weak-topic analysis, rank. ${S.profile&&S.profile.is_paid?'Renew ke liye':'Full access ke liye'} Topper Haveli admin se contact karo.</p></div>`:''}`);
  document.querySelectorAll('.subj').forEach(d=>d.onclick=()=>{location.hash='#/subject/'+d.dataset.slug;});}

async function vSubject(slug){nav('home');await fetchSubjects();
  setApp(`<div class="card"><h2>${esc(subjName(slug))}</h2><p class="muted">Kya karna hai?</p>
  <a class="btn primary block" href="#/practice/${slug}">Practice</a>
  <a class="btn block" href="#/mocksetup/${slug}">Mock test</a></div>`);}

async function vPractice(slug){nav('home');
  setApp('<div class="card center muted">Questions load ho rahe hain…</div>');
  const qs=await fetchQuestions(slug);
  const atts=await fetchAttempts();
  const amap={};atts.forEach(a=>amap[a.question_id]=a);
  if(!qs.length){setApp('<div class="card center"><h3>No access</h3><p class="muted">Is subject ke questions abhi locked hain.</p><a class="btn block" href="#/home">Back</a></div>');return;}
  const sources=[...new Set(qs.map(q=>q.source).filter(Boolean))];
  let idx=0,filter='all',src='all';
  const filtered=()=>qs.filter(q=>(src==='all'||q.source===src)&&(filter==='all'||(filter==='unanswered'&&amap[q.id]===undefined)||(filter==='wrong'&&amap[q.id]&&!amap[q.id].correct)||(filter==='correct'&&amap[q.id]&&amap[q.id].correct)));
  function render(){const list=filtered();if(idx>=list.length)idx=Math.max(0,list.length-1);
    const q=list[idx];
    const srcOpts=['<option value="all">All sources/chapters</option>'].concat(sources.map(s=>`<option ${s===src?'selected':''} value="${esc(s)}">${esc(s)}</option>`)).join('');
    if(!q){setApp(`<div class="card"><div class="row"><a class="chipbtn" href="#/subject/${slug}">&lsaquo; Back</a></div>
      <div class="row mt"><select id="fSrc">${srcOpts}</select></div>
      <div class="row mt">${['all','unanswered','wrong','correct'].map(f=>`<button class="chipbtn ${f===filter?'on':''}" data-f="${f}" type="button">${f}</button>`).join('')}</div>
      <p class="center muted mt">Is filter me koi question nahi.</p></div>`);wire(list);return;}
    const a=amap[q.id],done=a!==undefined;
    setApp(`<div class="card"><div class="row"><a class="chipbtn" href="#/subject/${slug}">&lsaquo; Back</a><span class="muted">${idx+1} / ${list.length}</span><span class="sp"></span><span class="muted">${esc(subjName(slug))}</span></div>
    <div class="row mt"><select id="fSrc">${srcOpts}</select></div>
    <div class="row mt">${['all','unanswered','wrong','correct'].map(f=>`<button class="chipbtn ${f===filter?'on':''}" data-f="${f}" type="button">${f}</button>`).join('')}</div></div>
    <div class="card"><p class="muted">${esc(q.source||'')}</p><p class="qtext">${esc(q.question)}</p>
    ${q.options.map((o,i)=>`<button class="opt ${done&&i===q.answer?'right':''} ${done&&i===a.chosen&&i!==q.answer?'wrong':''}" data-i="${i}" type="button" ${done?'disabled':''}>${String.fromCharCode(65+i)}. ${esc(o)}</button>`).join('')}
    ${done?`<div class="expl"><b>Answer: ${String.fromCharCode(65+q.answer)}</b>${q.explanation?'<br>'+md(q.explanation):''}</div>`:''}
    <div class="row mt"><button class="btn" id="prevB" type="button" ${idx===0?'disabled':''}>&lsaquo; Prev</button><span class="sp"></span><button class="btn" id="nextB" type="button" ${idx>=list.length-1?'disabled':''}>Next &rsaquo;</button></div></div>`);
    wire(list,q);}
  function wire(list,q){document.getElementById('fSrc').onchange=e=>{src=e.target.value;idx=0;render();};
    document.querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>{filter=b.dataset.f;idx=0;render();});
    if(q){document.querySelectorAll('.opt').forEach(b=>b.onclick=async()=>{const i=Number(b.dataset.i);
      const row={user_id:S.session.user.id,question_id:q.id,subject_slug:slug,chosen:i,correct:i===q.answer,mode:'practice'};
      amap[q.id]={...row};render();
      sb.from('attempts').upsert(row,{onConflict:'user_id,question_id'}).then(r=>{if(r.error)console.warn(r.error)});});
    document.getElementById('prevB').onclick=()=>{if(idx>0){idx--;render();}};
    document.getElementById('nextB').onclick=()=>{if(idx<list.length-1){idx++;render();}};}}
  render();}

async function vMockSetup(slug){nav('home');await fetchSubjects();
  const paid=isPaid();
  const{count}=await sb.from('mock_attempts').select('id',{count:'exact',head:true}).eq('user_id',S.session.user.id).eq('subject_slug',slug);
  const freeLeft=S.config.free_mock_per_subject?(count<1):false;
  if(!paid&&!freeLeft){setApp(`<div class="card center"><h3>Free mock used</h3><p class="muted">${esc(subjName(slug))} ka free mock ho chuka. Paid me unlimited mocks milte hain.</p><a class="btn block" href="#/subject/${slug}">Back</a></div>`);return;}
  const qs=await fetchQuestions(slug);
  const maxN=qs.length;
  setApp(`<div class="card"><h2>Mock - ${esc(subjName(slug))}</h2>
  <p class="muted">${paid?'Paid: apni pasand ka size.':'FREE mock: 25 questions, 25 minutes.'} Available: ${maxN} questions.</p>
  ${paid?`<label>Questions</label><select id="mCount">${[25,50,100].filter(n=>n<=maxN).map(n=>`<option value="${n}">${n} questions (${n} min)</option>`).join('')}</select>`:''}
  <button class="btn primary block" id="startM" type="button">Start mock</button>
  <a class="btn block" href="#/subject/${slug}">Back</a></div>`);
  document.getElementById('startM').onclick=async()=>{
    const N=paid?Number(document.getElementById('mCount').value):25;
    const ids=qs.map(q=>q.id);
    for(let i=ids.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];}
    const pick=ids.slice(0,Math.min(N,ids.length));
    const endsAt=Date.now()+pick.length*60*1000;
    const{data,error}=await sb.from('mock_attempts').insert({user_id:S.session.user.id,subject_slug:slug,config:{question_ids:pick},state:{answers:{},idx:0,ends_at:endsAt},total:pick.length}).select('id').single();
    if(error){alert(error.message);return;}
    location.hash='#/mockrun/'+data.id;};}

let mockTimer=null;
async function vMockRun(id){nav('home');
  const{data:m,error}=await sb.from('mock_attempts').select('*').eq('id',id).eq('user_id',S.session.user.id).single();
  if(error||!m){setApp('<div class="card center muted">Mock nahi mila.</div>');return;}
  const ids=m.config.question_ids;
  const{data:qs}=await sb.from('questions').select('*').in('id',ids);
  const byId={};(qs||[]).forEach(q=>byId[q.id]=q);
  const list=ids.map(i=>byId[i]).filter(Boolean);
  if(m.status==='completed'){renderResult(m,list);return;}
  let st=m.state||{answers:{},idx:0,ends_at:Date.now()+list.length*60*1000};
  st.answers=st.answers||{};st.idx=st.idx||0;
  if(!st.ends_at){st.ends_at=Date.now()+list.length*60*1000;}
  const save=()=>sb.from('mock_attempts').update({state:st}).eq('id',m.id).then(()=>{});
  function tick(){const left=Math.max(0,st.ends_at-Date.now());
    const t=document.getElementById('mTimer');
    if(t){const mm=Math.floor(left/60000),ss=Math.floor(left%60000/1000);t.textContent=mm+':'+String(ss).padStart(2,'0');t.classList.toggle('low',left<120000);}
    if(left<=0){finish();}}
  function render(){const q=list[st.idx];if(!q){setApp('<div class="card center muted">Questions load nahi hue.</div>');return;}
    const sel=st.answers[q.id];
    const answered=Object.keys(st.answers).length;
    setApp(`<div class="card"><div class="row"><span class="muted">Mock · ${esc(subjName(m.subject_slug))}</span><span class="sp"></span><span class="timer" id="mTimer"></span></div>
    <div class="row mt"><span class="muted">Q ${st.idx+1} / ${list.length} · answered ${answered}</span></div></div>
    <div class="card"><p class="muted">${esc(q.source||'')}</p><p class="qtext">${esc(q.question)}</p>
    ${q.options.map((o,i)=>`<button class="opt ${sel===i?'sel':''}" data-i="${i}" type="button">${String.fromCharCode(65+i)}. ${esc(o)}</button>`).join('')}
    <div class="row mt"><button class="btn" id="mPrev" type="button" ${st.idx===0?'disabled':''}>&lsaquo; Prev</button><span class="sp"></span><button class="btn" id="mNext" type="button" ${st.idx>=list.length-1?'disabled':''}>Next &rsaquo;</button></div>
    <button class="btn primary block" id="mFinish" type="button">Submit mock</button></div>`);
    tick();
    document.querySelectorAll('.opt').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.i);
      if(st.answers[q.id]===i)delete st.answers[q.id];else st.answers[q.id]=i;save();render();});
    document.getElementById('mPrev').onclick=()=>{if(st.idx>0){st.idx--;save();render();}};
    document.getElementById('mNext').onclick=()=>{if(st.idx<list.length-1){st.idx++;save();render();}};
    document.getElementById('mFinish').onclick=()=>{if(confirm('Submit mock? ('+Object.keys(st.answers).length+'/'+list.length+' answered)'))finish();};}
  async function finish(){if(mockTimer){clearInterval(mockTimer);mockTimer=null;}
    let score=0;const rows=[];
    list.forEach(q=>{const c=st.answers[q.id];if(c!==undefined){const ok=c===q.answer;if(ok)score++;
      rows.push({user_id:S.session.user.id,question_id:q.id,subject_slug:m.subject_slug,chosen:c,correct:ok,mode:'mock'});}});
    for(let i=0;i<rows.length;i+=500)await sb.from('attempts').upsert(rows.slice(i,i+500),{onConflict:'user_id,question_id'});
    await sb.from('mock_attempts').update({status:'completed',score,total:list.length,state:st,completed_at:new Date().toISOString()}).eq('id',m.id);
    renderResult({...m,status:'completed',score,total:list.length},list);}
  function renderResult(mm){const pct=mm.total?Math.round(100*mm.score/mm.total):0;
    setApp(`<div class="card center"><h2>Mock result</h2>
    <div class="grid2 mt"><div class="stat"><b>${mm.score}/${mm.total}</b><span>Score</span></div><div class="stat"><b>${pct}%</b><span>Accuracy</span></div></div>
    <a class="btn block" href="#/mockreview/${mm.id}">Review answers</a><a class="btn block" href="#/dashboard">Dashboard</a><a class="btn block" href="#/home">Home</a></div>`);}
  if(mockTimer)clearInterval(mockTimer);
  mockTimer=setInterval(tick,1000);render();}

async function vMockReview(id){nav('home');
  const{data:m}=await sb.from('mock_attempts').select('*').eq('id',id).eq('user_id',S.session.user.id).single();
  if(!m){setApp('<div class="card center muted">Nahi mila.</div>');return;}
  const{data:qs}=await sb.from('questions').select('*').in('id',m.config.question_ids);
  const byId={};(qs||[]).forEach(q=>byId[q.id]=q);
  const ans=(m.state&&m.state.answers)||{};
  setApp(`<div class="card"><div class="row"><a class="chipbtn" href="#/dashboard">&lsaquo; Dashboard</a><span class="sp"></span><span class="muted">Score ${m.score}/${m.total}</span></div></div>`+
    m.config.question_ids.map((qid,n)=>{const q=byId[qid];if(!q)return'';const c=ans[qid];
    return `<div class="card"><p class="muted">Q${n+1} · ${esc(q.source||'')}</p><p class="qtext">${esc(q.question)}</p>
    ${q.options.map((o,i)=>`<button class="opt ${i===q.answer?'right':''} ${c===i&&i!==q.answer?'wrong':''}" disabled type="button">${String.fromCharCode(65+i)}. ${esc(o)}</button>`).join('')}
    ${q.explanation?`<div class="expl">${md(q.explanation)}</div>`:''}</div>`;}).join(''));}

async function vDashboard(){nav('dashboard');await fetchSubjects();
  setApp('<div class="card center muted">Dashboard load ho raha hai…</div>');
  const atts=await fetchAttempts();
  const paid=isPaid();
  const per={};atts.forEach(a=>{per[a.subject_slug]=per[a.subject_slug]||{n:0,c:0};per[a.subject_slug].n++;if(a.correct)per[a.subject_slug].c++;});
  const totalA=atts.length,totalC=atts.filter(a=>a.correct).length;
  const days=[...new Set(atts.map(a=>(a.created_at||'').slice(0,10)))].sort().reverse();
  let streak=0;const today=new Date();for(let i=0;;i++){const d=new Date(today.getTime()-i*86400000).toISOString().slice(0,10);
    if(days.includes(d)){streak++;}else if(i===0){continue;}else break;}
  const{data:mocks}=await sb.from('mock_attempts').select('id,subject_slug,score,total,completed_at,status').eq('user_id',S.session.user.id).eq('status','completed').order('completed_at',{ascending:false}).limit(10);
  let paidHtml='';
  if(paid){
    const{data:lb}=await sb.rpc('leaderboard');
    let rankHtml='<div class="stat"><b>-</b><span>Rank (answer to enter)</span></div>';
    if(lb&&lb.length){const sorted=[...lb].sort((a,b)=>b.pct-a.pct||b.correct-a.correct);
      const pos=sorted.findIndex(r=>r.user_id===S.session.user.id);
      if(pos>=0)rankHtml=`<div class="stat"><b>#${pos+1} <span class="muted">of ${sorted.length}</span></b><span>All-time rank</span></div>`;}
    const{data:wj}=await sb.from('attempts').select('correct, questions(source)').eq('user_id',S.session.user.id).limit(5000);
    const bySrc={};(wj||[]).forEach(r=>{const s=(r.questions&&r.questions.source)||'Other';bySrc[s]=bySrc[s]||{n:0,c:0};bySrc[s].n++;if(r.correct)bySrc[s].c++;});
    const weak=Object.entries(bySrc).filter(([,v])=>v.n>=5).map(([k,v])=>({k,pct:Math.round(100*v.c/v.n),n:v.n})).sort((a,b)=>a.pct-b.pct).slice(0,5);
    paidHtml=`<div class="card"><h3>Weak topics (paid)</h3>${weak.length?weak.map(w=>`<div class="row"><span style="flex:1">${esc(w.k)}</span><span class="badge ${w.pct<50?'warn':'free'}">${w.pct}%</span><span class="muted">${w.n} Q</span></div>`).join(''):'<p class="muted">Thodi aur practice karo, phir analysis dikhega.</p>'}</div>
    <div class="card"><h3>Rank (paid)</h3><div class="grid2">${rankHtml}<div class="stat"><b>${totalA}</b><span>Total answered</span></div></div></div>`;}
  setApp(`<div class="card"><div class="row"><h2 style="flex:1;margin:0">Dashboard</h2>${planChip()}</div>
    <div class="grid2 mt"><div class="stat"><b>${totalC}/${totalA}</b><span>Correct</span></div><div class="stat"><b>${totalA?Math.round(100*totalC/totalA):0}%</b><span>Accuracy</span></div>
    <div class="stat"><b>${streak}</b><span>Day streak</span></div><div class="stat"><b>${(mocks||[]).length}</b><span>Mocks done</span></div></div></div>
  <div class="card"><h3>Subject-wise</h3>${S.subjects.filter(s=>per[s.slug]).map(s=>`<div class="row"><span style="flex:1">${esc(s.name)}</span><span class="muted">${per[s.slug].c}/${per[s.slug].n} · ${Math.round(100*per[s.slug].c/per[s.slug].n)}%</span></div>`).join('')||'<p class="muted">Abhi koi practice nahi.</p>'}</div>
  ${paidHtml}
  <div class="card"><h3>Mock history</h3>${(mocks||[]).map(mk=>`<div class="row"><span style="flex:1">${esc(subjName(mk.subject_slug))}</span><span class="muted">${(mk.completed_at||'').slice(0,10)}</span><a href="#/mockreview/${mk.id}"><span class="badge paid">${mk.score}/${mk.total}</span></a></div>`).join('')||'<p class="muted">Koi mock nahi.</p>'}</div>
  ${!paid?'<div class="card center"><p class="muted">Paid me: weak-topic analysis, rank, unlimited mocks, saare questions.</p></div>':''}`);}

function fmtAgo(iso){if(!iso)return 'kabhi nahi';
  const d=(Date.now()-new Date(iso).getTime())/86400000;
  if(d<1/24)return 'abhi abhi'; if(d<1)return Math.floor(d*24)+'h pehle';
  if(d<2)return 'kal'; if(d<30)return Math.floor(d)+' din pehle';
  return new Date(iso).toLocaleDateString('en-IN',{day:'numeric',month:'short'});}
function avatar(name,email){const t=(name||email||'?').trim();const init=t.split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();
  let h=0;for(const c of t)h=(h*31+c.charCodeAt(0))%360;
  return `<span class="avatar" style="background:hsl(${h},55%,42%)">${esc(init)}</span>`;}
function statCard(v,l,sub){return `<div class="statcard"><div class="statv">${v}</div><div class="statl">${l}</div>${sub?`<div class="statsub">${sub}</div>`:''}</div>`;}
function barChart(seriesA,seriesB){
  const W=340,H=150,PL=26,PB=22,PT=10,n=seriesA.length;
  const max=Math.max(1,...seriesA.map(x=>x.n),...seriesB.map(x=>x.n));
  const bw=(W-PL-6)/n;
  const bars=(arr,color,dx)=>arr.map((d,i)=>{
    const h=Math.max(d.n>0?2:0,(H-PT-PB)*d.n/max);
    const x=PL+i*bw+dx,y=H-PB-h;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw/2-2).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${color}"><title>${d.day}: ${d.n}</title></rect>`;}).join('');
  const labels=seriesA.map((d,i)=>i%4===1?`<text x="${(PL+i*bw+bw/2).toFixed(1)}" y="${H-8}" font-size="9" fill="var(--dim)" text-anchor="middle">${d.day.slice(8)}/${d.day.slice(5,7)}</text>`:'').join('');
  const grid=[0.25,0.5,0.75,1].map(f=>{const y=H-PB-(H-PT-PB)*f;
    return `<line x1="${PL}" y1="${y}" x2="${W-4}" y2="${y}" stroke="var(--line)" stroke-width="0.5"/><text x="${PL-4}" y="${y+3}" font-size="8" fill="var(--dim)" text-anchor="end">${Math.round(max*f)}</text>`;}).join('');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">${grid}${bars(seriesA,'#6d8dff',0)}${bars(seriesB,'#3ecf8e',bw/2)}${labels}</svg>
  <div class="row" style="gap:14px;justify-content:center"><span class="legend"><i style="background:#6d8dff"></i>Signups</span><span class="legend"><i style="background:#3ecf8e"></i>Answers</span></div>`;}

async function vAdmin(){nav('admin');
  if(!isAdmin()){setApp('<div class="card center muted">Admin only.</div>');return;}
  setApp('<div class="card center muted">Admin dashboard load ho raha hai…</div>');
  const[{data:ov,error:e1},{data:students,error:e2},{data:usage}]=await Promise.all([
    sb.rpc('admin_overview'),sb.rpc('admin_students'),sb.rpc('admin_subject_usage')]);
  await fetchSubjects();
  if(e1||e2){setApp(`<div class="card center"><h3>Load nahi hua</h3><p class="muted">${esc((e1||e2).message)}</p></div>`);return;}
  const defDays=S.config.paid_validity_days||120;
  let q='',filter='all',sel=new Set(),detailId=null;

  function filteredStudents(){
    const t=q.trim().toLowerCase();
    return students.filter(u=>{
      if(filter==='paid'&&!activePlan(u))return false;
      if(filter==='free'&&activePlan(u))return false;
      if(filter==='expiring'&&!(activePlan(u)&&u.paid_until&&new Date(u.paid_until).getTime()-Date.now()<15*86400000))return false;
      if(filter==='expired'&&!(u.is_paid&&u.paid_until&&new Date(u.paid_until).getTime()<=Date.now()))return false;
      if(t&&!(u.email||'').toLowerCase().includes(t)&&!(u.display_name||'').toLowerCase().includes(t))return false;
      return true;});}

  function rowHtml(u){
    const chk=sel.has(u.id)?'checked':'';
    const acc=u.answers?Math.round(100*u.correct/u.answers)+'%':'-';
    const st=planStatus(u);
    const expiring=activePlan(u)&&u.paid_until&&new Date(u.paid_until).getTime()-Date.now()<15*86400000;
    return `<div class="urow" data-uid="${u.id}">
      <input type="checkbox" class="uchk" data-chk="${u.id}" ${chk}>
      ${avatar(u.display_name,u.email)}
      <div class="umain"><b>${esc(u.display_name||'(naam nahi)')}</b> ${u.is_admin?'<span class="badge warn">ADMIN</span>':''}<br>
      <span class="muted">${esc(u.email||'')}</span><br>
      <span class="muted">${u.answers} ans · ${acc} · ${u.mocks} mocks · ${fmtAgo(u.last_active)}</span></div>
      <div class="uright"><span class="badge ${st.c}">${st.t}</span>
      ${(expiring||st.t==='EXPIRED')?`<button class="chipbtn smallbtn" data-renew="${u.id}" type="button">&#8635;+30d</button>`:''}</div></div>`;}

  function render(){
    const list=filteredStudents();
    setApp(`
    <div class="card"><div class="row"><h2 style="flex:1">Admin Dashboard</h2><button class="chipbtn" id="aRefresh" type="button">Refresh</button></div><p class="muted">${ov.total} students · ${new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'short'})}</p></div>
    <div class="statgrid">
      ${statCard(ov.total,'Students','+'+(ov.signups[ov.signups.length-1]||{n:0}).n+' aaj')}
      ${statCard(ov.paid,'Paid',Math.round(100*ov.paid/Math.max(1,ov.total))+'%')}
      ${statCard(ov.free,'Free')}
      ${statCard(ov.expired||0,'Expired')}
      ${statCard(ov.active_today,'Active 24h')}
      ${statCard(ov.active_7d,'Active 7d')}
      ${statCard(ov.mocks_done,'Mocks done',(ov.activity[ov.activity.length-1]||{n:0}).n+' ans aaj')}
    </div>
    <div class="card"><h3>Last 14 days</h3>${barChart(ov.signups,ov.activity)}</div>
    <div class="card"><h3>Students</h3>
      <input id="aSearch" type="search" placeholder="Naam ya email se dhundo…" value="${esc(q)}">
      <div class="row mt" style="flex-wrap:wrap">${[['all','Sab'],['paid','Paid'],['free','Free'],['expiring','Expiring <15d'],['expired','Expired']].map(f=>`<button class="chipbtn ${filter===f[0]?'on':''}" data-f="${f[0]}" type="button">${f[1]}</button>`).join('')}</div>
      <div class="mt">${list.map(rowHtml).join('')||'<p class="muted center">Koi student nahi mila.</p>'}</div>
    </div>
    <div class="card"><h3>Subject-wise usage</h3>
      ${(usage||[]).map(u=>`<div class="row" style="padding:7px 0;border-bottom:1px solid var(--line)"><span style="flex:1">${esc(u.name)}</span><span class="muted">${u.answers} ans · ${u.users} users · ${u.mocks} mocks</span></div>`).join('')}
    </div>
    <div class="card"><h3>Free preview settings</h3>
      <p class="muted">Har subject me free users ko kitne questions milte hain.</p>
      ${S.subjects.map(s=>`<div class="row"><span style="flex:1">${esc(s.name)}</span><input type="number" data-free="${s.slug}" value="${s.free_question_count}" style="width:90px;padding:6px"></div>`).join('')}
      <div class="row mt"><span style="flex:1">Paid validity (din)</span><input type="number" id="validDays" value="${defDays}" style="width:90px;padding:6px"></div>
      <button class="btn primary block mt" id="saveCfg" type="button">Save settings</button>
      <div class="notice hidden" id="cfgMsg"></div>
    </div>
    <div class="bulkbar ${sel.size?'':'hidden'}" id="bulkBar">
      <span>${sel.size} selected</span>
      <select id="bulkPlan" style="width:auto"><option value="30">30d</option><option value="90">90d</option><option value="180">180d</option><option value="365">365d</option><option value="life">Lifetime</option></select>
      <button class="chipbtn on" id="bulkApply" type="button">Plan do</button>
      <button class="chipbtn" id="bulkRevoke" type="button">Revoke</button>
      <button class="chipbtn" id="bulkClear" type="button">✕</button>
    </div>`);
    wire();
  }

  function wire(){
    document.getElementById('aRefresh').onclick=async()=>{setApp('<div class="card center muted">Refreshing…</div>');await refreshStudents();render();};
    document.getElementById('aSearch').oninput=e=>{q=e.target.value;render();const el=document.getElementById('aSearch');el.focus();el.setSelectionRange(el.value.length,el.value.length);};
    document.querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>{filter=b.dataset.f;sel.clear();render();});
    document.querySelectorAll('[data-chk]').forEach(c=>c.onchange=e=>{e.stopPropagation();const id=c.dataset.chk;c.checked?sel.add(id):sel.delete(id);
      const bb=document.getElementById('bulkBar');bb.classList.toggle('hidden',!sel.size);bb.querySelector('span').textContent=sel.size+' selected';});
    document.querySelectorAll('.urow').forEach(r=>r.onclick=e=>{if(e.target.dataset.chk)return;detailId=r.dataset.uid;renderDetail();});
    const bb=document.getElementById('bulkBar');
    document.getElementById('bulkClear').onclick=()=>{sel.clear();render();};
    document.getElementById('bulkApply').onclick=async()=>{
      const v=document.getElementById('bulkPlan').value;
      const{error}=await sb.rpc('admin_grant_plan',{p_ids:[...sel],p_days:v==='life'?null:Number(v),p_kind:'plan'});
      if(error){alert(error.message);return;}
      await refreshStudents();sel.clear();render();};
    document.getElementById('bulkRevoke').onclick=async()=>{
      if(!confirm(sel.size+' students ka paid access revoke karein?'))return;
      await sb.rpc('admin_revoke',{p_ids:[...sel]});await refreshStudents();sel.clear();render();};
    document.querySelectorAll('[data-renew]').forEach(b=>b.onclick=async e=>{e.stopPropagation();
      await sb.rpc('admin_grant_plan',{p_ids:[b.dataset.renew],p_days:30,p_kind:'renew'});
      await refreshStudents();render();});
    document.querySelectorAll('[data-free]').forEach(()=>{});
    document.getElementById('saveCfg').onclick=async()=>{
      const msg=document.getElementById('cfgMsg');msg.classList.add('hidden');msg.classList.remove('ok');
      for(const inp of document.querySelectorAll('[data-free]')){
        const{error}=await sb.rpc('admin_set_free_count',{p_slug:inp.dataset.free,p_count:Number(inp.value)||0});
        if(error){msg.textContent=error.message;msg.classList.remove('hidden');return;}}
      const vd=Number(document.getElementById('validDays').value)||120;
      await sb.from('app_config').upsert({key:'paid_validity_days',value:String(vd)});
      S.config.paid_validity_days=vd;S.subjects=null;await fetchSubjects();
      msg.textContent='Saved. Settings update ho gaye.';msg.classList.remove('hidden');msg.classList.add('ok');};
  }

  async function refreshStudents(){
    const{data}=await sb.rpc('admin_students');
    if(data){students.length=0;data.forEach(u=>students.push(u));}
    const{data:o2}=await sb.rpc('admin_overview');if(o2)Object.assign(ov,o2);}

  async function renderDetail(){
    setApp('<div class="card center muted">Student details load ho rahe hain…</div>');
    const{data:d,error}=await sb.rpc('admin_student_detail',{p_id:detailId});
    if(error||!d||!d.profile){setApp('<div class="card center"><p class="muted">Load nahi hua.</p><button class="btn block" id="backB">Back</button></div>');document.getElementById('backB').onclick=render;return;}
    const u=d.profile,acc=d.answers?Math.round(100*d.correct/d.answers):0;
    const nm=s=>subjName(s);
    setApp(`
    <div class="card"><div class="row"><button class="chipbtn" id="backB" type="button">&lsaquo; Back</button><span class="sp"></span></div>
      <div class="row" style="gap:12px;align-items:center">${avatar(u.display_name,u.email)}<h2 style="margin:0">${esc(u.display_name||'(naam nahi)')}</h2></div>
      <p class="muted">${esc(u.email||'')}<br>Joined ${new Date(u.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short'})} · Last active ${fmtAgo(d.last_active)}</p>
      <p class="mt"><span class="badge ${planStatus(u).c}">${planStatus(u).t}</span>
        ${u.is_paid&&u.paid_until?`<span class="muted small"> valid till ${new Date(u.paid_until).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</span>`:''}
        ${u.trial_used?'<span class="badge">trial used</span>':''}</p>
      <div class="planbox">
        <p class="muted small" style="margin:0 0 6px">Plan do (ek tap):</p>
        <div class="row" style="flex-wrap:wrap;gap:8px">
          ${[['30','30 din'],['90','90 din'],['180','180 din'],['365','1 saal'],['life','Lifetime']].map(x=>`<button class="chipbtn" data-plan="${x[0]}" type="button">${x[1]}</button>`).join('')}
          ${u.trial_used?'':[['3','Trial 3d'],['7','Trial 7d']].map(x=>`<button class="chipbtn" data-trial="${x[0]}" type="button">${x[1]}</button>`).join('')}
        </div>
        <div class="row" style="gap:8px;align-items:center">
          <input id="pCustom" type="number" min="1" placeholder="Custom din" style="width:110px;padding:7px;margin:0">
          <button class="chipbtn" id="pCustomGo" type="button">Custom do</button>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <input id="pAmt" placeholder="Amount (e.g. 199)" style="width:110px;padding:7px;margin:0">
          <input id="pMode" placeholder="Mode (cash/UPI)" style="width:130px;padding:7px;margin:0">
          <input id="pNote" placeholder="Note (optional)" style="flex:1;min-width:120px;padding:7px;margin:0">
        </div>
        <p class="muted small" style="margin:8px 0 6px">Adjust:</p>
        <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap">
          <input id="pAdj" type="number" placeholder="Din (+/-)" style="width:100px;padding:7px;margin:0">
          <button class="chipbtn" id="pAdjGo" type="button">Apply</button>
          <button class="chipbtn" id="pRevoke" type="button" style="border-color:var(--bad);color:var(--bad)">Revoke access</button>
        </div>
      </div>
      <div class="notice hidden" id="dMsg"></div></div>
    <div class="card"><h3>Plan history</h3><div id="pHist" class="muted small">Load ho raha hai…</div></div>
    <div class="statgrid">
      ${statCard(d.answers,'Answers')}
      ${statCard(acc+'%','Accuracy')}
      ${statCard(d.mocks,'Mocks')}
      ${statCard(fmtAgo(d.last_active),'Last active')}
    </div>
    <div class="card"><h3>Subject-wise</h3>
      ${(d.by_subject||[]).map(b=>{const p=b.n?Math.round(100*b.ok/b.n):0;
        return `<div style="padding:7px 0;border-bottom:1px solid var(--line)"><div class="row"><span style="flex:1">${esc(nm(b.subject_slug))}</span><span class="muted">${b.ok}/${b.n} · ${p}%</span></div>
        <div class="barbg"><div class="barfill ${p<50?'warn':''}" style="width:${p}%"></div></div></div>`;}).join('')||'<p class="muted">Abhi koi practice nahi.</p>'}
    </div>
    <div class="card"><h3>Weak topics</h3>
      ${(d.weak||[]).map(w=>`<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)"><span style="flex:1">${esc(w.source)}</span><span class="badge warn">${w.pct}%</span><span class="muted">${w.n}Q</span></div>`).join('')||'<p class="muted">Koi weak topic nahi (ya data kam hai).</p>'}
    </div>
    <div class="card"><h3>Recent mocks</h3>
      ${(d.recent_mocks||[]).map(m=>`<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)"><span style="flex:1">${esc(nm(m.subject_slug))}</span><span class="badge">${m.score}/${m.total}</span><span class="muted">${new Date(m.completed_at).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</span></div>`).join('')||'<p class="muted">Koi mock nahi diya abhi tak.</p>'}
    </div>`);
    document.getElementById('backB').onclick=()=>{detailId=null;render();};
    const msg=document.getElementById('dMsg');
    const note=(t,ok)=>{msg.textContent=t;msg.classList.remove('hidden');msg.classList.toggle('ok',!!ok);};
    const payFields=()=>({p_amount:document.getElementById('pAmt').value.trim()||null,
      p_mode:document.getElementById('pMode').value.trim()||null,
      p_note:document.getElementById('pNote').value.trim()||null});
    const grant=async(days,kind)=>{
      const{error}=await sb.rpc('admin_grant_plan',{p_ids:[u.id],p_days:days,p_kind:kind,...payFields()});
      if(error){note(error.message);return;}
      note(kind==='trial'?'Trial shuru ho gaya.':(days?days+' din ka plan lag gaya.':'Lifetime access de diya.'),true);
      renderDetail();refreshStudents();};
    document.querySelectorAll('[data-plan]').forEach(b=>b.onclick=()=>grant(b.dataset.plan==='life'?null:Number(b.dataset.plan),'plan'));
    document.querySelectorAll('[data-trial]').forEach(b=>b.onclick=()=>grant(Number(b.dataset.trial),'trial'));
    document.getElementById('pCustomGo').onclick=()=>{
      const n=Number(document.getElementById('pCustom').value);
      if(!n||n<1){note('Custom din daalo pehle.');return;}grant(n,'plan');};
    document.getElementById('pAdjGo').onclick=async()=>{
      const n=Number(document.getElementById('pAdj').value);
      if(!n){note('Din daalo (+ extend, - reduce).');return;}
      const{error}=await sb.rpc('admin_adjust_days',{p_ids:[u.id],p_days:n});
      if(error){note(error.message);return;}
      note((n>0?'+':'')+n+' din adjust ho gaya.',true);renderDetail();refreshStudents();};
    document.getElementById('pRevoke').onclick=async()=>{
      if(!confirm('Is student ka paid access revoke karein?'))return;
      const{error}=await sb.rpc('admin_revoke',{p_ids:[u.id]});
      if(error){note(error.message);return;}
      note('Access revoke ho gaya (free pe aa gaya).',true);renderDetail();refreshStudents();};
    sb.rpc('admin_plan_history',{p_id:u.id}).then(({data:hist})=>{
      const el=document.getElementById('pHist');if(!el)return;
      if(!hist||!hist.length){el.textContent='Abhi koi plan event nahi.';return;}
      const al={plan:'Plan',trial:'Trial',extend:'Extend',reduce:'Reduce',revoke:'Revoke',renew:'Renew'};
      el.classList.remove('muted');
      el.innerHTML=hist.map(h=>`<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line);gap:8px;flex-wrap:wrap">
        <span class="badge">${al[h.action]||h.action}</span>
        ${h.days?`<span class="muted small">${h.days>0?'+':''}${h.days}d</span>`:''}
        ${h.to_until?`<span class="muted small">→ ${new Date(h.to_until).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</span>`:''}
        ${h.amount?`<span class="muted small">₹${esc(h.amount)}${h.mode?' · '+esc(h.mode):''}</span>`:''}
        ${h.note?`<span class="muted small">${esc(h.note)}</span>`:''}
        <span class="sp"></span><span class="muted small">${new Date(h.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</span>
      </div>`).join('');});
  }
  render();
}

async function route(){const h=location.hash||'#/home';
  if(h.indexOf('type=recovery')>=0){S.recovery=true;vReset();return;}
  const{data}=await sb.auth.getSession();S.session=data.session;
  if(S.recovery){vReset();return;}
  if(!S.session){vLogin();return;}
  if(!S.profile)await fetchProfile();
  if(!S.subjects)await fetchSubjects();
  await importLegacy();
  const parts=h.split('/');const view=parts[1],arg=parts[2];
  if(view==='home')return vHome();
  if(view==='subject')return vSubject(arg);
  if(view==='practice')return vPractice(arg);
  if(view==='mocksetup')return vMockSetup(arg);
  if(view==='mockrun')return vMockRun(arg);
  if(view==='mockreview')return vMockReview(arg);
  if(view==='dashboard')return vDashboard();
  if(view==='admin')return vAdmin();
  return vHome();}
document.getElementById('logoutBtn').onclick=async()=>{await sb.auth.signOut();S.profile=null;S.qcache={};S.subjects=null;location.hash='#/login';route();};
window.addEventListener('hashchange',route);
function vReset(){document.getElementById('navbar').classList.add('hidden');document.getElementById('logoutBtn').classList.add('hidden');
  setApp(`<div class="card center"><h2>Naya password set karo</h2></div>
  <div class="card"><label>New password (6+ characters)</label><input id="fNewPass" type="password" autocomplete="new-password">
  <button class="btn primary block" id="resetBtn" type="button">Save password</button>
  <div class="notice hidden" id="resetMsg"></div></div>`);
  document.getElementById('resetBtn').onclick=async()=>{
    const pass=document.getElementById('fNewPass').value,msg=document.getElementById('resetMsg');
    if(pass.length<6){msg.textContent='6+ characters ka password daalo.';msg.classList.remove('hidden');return;}
    const{error}=await sb.auth.updateUser({password:pass});
    msg.classList.remove('hidden');
    if(error){msg.textContent=error.message;return;}
    msg.textContent='Password set ho gaya. Ab login karo.';msg.classList.add('ok');
    S.recovery=false;await sb.auth.signOut();S.profile=null;S.qcache={};setTimeout(()=>{location.hash='#/login';route();},1200);};}
sb.auth.onAuthStateChange((e,s)=>{if(e==='SIGNED_IN'||e==='SIGNED_OUT')S.qcache={};S.session=s;if(e==='PASSWORD_RECOVERY'){S.recovery=true;vReset();}});
route();
})();
