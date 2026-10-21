(()=>{'use strict';
const SUPA_URL='https://jvvnl-quiz-api.crypticfiles40.workers.dev';
const SUPA_KEY='sb_publishable_D90wb1cJD2X6PjgIIa645Q_fofHiSku';
const sb=window.supabase.createClient(SUPA_URL,SUPA_KEY);
const app=document.getElementById('app');
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const md=s=>esc(s||'').replace(/\*\*(.+?)\*\*/g,'<b>$1</b>');
let S={session:null,profile:null,subjects:null,config:{free_question_count:50,free_mock_per_subject:true,paid_validity_days:120},qcache:{}};
const isPaid=()=>!!(S.profile&&(S.profile.is_admin||(S.profile.is_paid&&(S.profile.access_scope||'all')==='all'&&(!S.profile.paid_until||new Date(S.profile.paid_until).getTime()>Date.now()))));
const isScoped=()=>!!(S.profile&&!S.profile.is_admin&&activePlan(S.profile)&&S.profile.access_scope==='sections');
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
const NOT_PYQ=/original|notes|batch|bank|uploaded|unlabel|not detected|practice question/i;
const isPYQ=q=>!!q&&!NOT_PYQ.test(q.source||'')&&/(?:^|[^\d])(?:19|20)\d\d(?!\d)/.test(q.source||'');
const qType=q=>isPYQ(q)?'PYQ':'Practice';
const qLabel=q=>{if(!isPYQ(q))return 'Practice';const s=String(q.source||'');if(NOT_PYQ.test(s))return 'PYQ';
  const y=s.match(/(?:^|[^\d])((?:19|20)\d\d)(?!\d)/);if(!y||+y[1]<2000)return 'PYQ';
  let ex=s.replace(/[,\s(]*(?:\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s*)?(?:^|(?<=[^\d]))(?:19|20)\d\d(?!\d)\)?/,'').replace(/[,\s\u00b7|-]+$/,'').trim();
  ex=ex.split(/\s*\|\s*|\s+Also from/i)[0].trim();
  if(!ex||ex.length>34)return 'PYQ';return ex+' '+y[1];};
const isAdmin=()=>!!(S.profile&&S.profile.is_admin);

async function fetchProfile(){const{data}=await sb.from('profiles').select('*').eq('id',S.session.user.id).single();{const o=S.profile;if(o&&data&&(o.is_paid!==data.is_paid||o.paid_until!==data.paid_until||o.access_scope!==data.access_scope))S.qcache={};}S.profile=data;
  document.getElementById('navAdmin').classList.toggle('hidden',!isAdmin());['navAdmin2','sAdminLbl'].forEach(i=>{const e=document.getElementById(i);if(e)e.classList.toggle('hidden',!isAdmin());});
  const b=document.getElementById('userBadge');
  b.innerHTML=isAdmin()?'<span class="badge warn">ADMIN</span>':(isPaid()?'<span class="badge paid">PAID</span>':(isScoped()?'<span class="badge paid">PLAN &middot; SECTIONS</span>':'<span class="badge free">FREE</span>'));}
async function fetchSubjects(){if(S.subjects&&S.cfgDone)return;
  if(!S._subjP)S._subjP=Promise.all([sb.from('subjects').select('*').order('sort'),sb.from('app_config').select('*')]).then(([a,b])=>{S.subjects=a.data||[];(b.data||[]).forEach(r=>{try{S.config[r.key]=JSON.parse(r.value)}catch(e){S.config[r.key]=r.value}});S.cfgDone=true;S._subjP=null;}).catch(e=>{S._subjP=null;throw e;});
  await S._subjP;}
async function fetchQuestions(slug){if(S.qcache[slug])return S.qcache[slug];
  const{data,error}=await sb.from('questions').select('*').eq('subject_slug',slug).order('ord');
  if(error){console.warn(error);return[];} S.qcache[slug]=data||[]; return S.qcache[slug];}
async function fetchAttemptsLite(){const{data}=await sb.from('attempts').select('subject_slug,correct,created_at').eq('user_id',S.session.user.id).limit(10000);return data||[];}
async function fetchAttempts(){const{data}=await sb.from('attempts').select('question_id,subject_slug,chosen,correct,mode,created_at').eq('user_id',S.session.user.id);
  return data||[];}

async function importLegacy(){if(localStorage.getItem('portal_imported_v1'))return;
  try{const saved=JSON.parse(localStorage.getItem('jvvnl-source-bank-progress-v1')||'null');
    const ans=saved&&saved.answers&&typeof saved.answers==='object'?saved.answers:{};
    const ids=Object.keys(ans);let n=0;
    if(ids.length){const{data:qs}=await sb.from('questions').select('id,subject_slug,answer').in('id',ids.slice(0,10000));
      const byId={};(qs||[]).forEach(q=>byId[q.id]=q);
      const rows=ids.filter(id=>byId[id]!==undefined&&Number.isInteger(Number(ans[id]))).map(id=>({user_id:S.session.user.id,question_id:id,subject_slug:byId[id].subject_slug,chosen:Number(ans[id]),correct:Number(ans[id])===byId[id].answer,mode:'practice'}));
      for(let i=0;i<rows.length;i+=500){const r=await sb.from('attempts').upsert(rows.slice(i,i+500),{onConflict:'user_id,question_id',ignoreDuplicates:true});if(r.error)throw r.error;n+=Math.min(500,rows.length-i);}
      if(n>0)localStorage.setItem('portal_import_note',n+' saved answers imported from the old site.');}
    localStorage.setItem('portal_imported_v1','1');
  }catch(e){console.warn('import failed, will retry next login',e);}}

function nav(active){document.getElementById('navbar').classList.remove('hidden');
  document.body.classList.add('authed');document.querySelectorAll('[data-nav]').forEach(a=>a.classList.toggle('on',a.dataset.nav===active));
  document.getElementById('logoutBtn').classList.remove('hidden');}
function setApp(html){app.innerHTML=html;}
async function fetchNotes(){if(S.notes)return S.notes;const{data}=await sb.from('notes').select('id,title,subject_slug,kind,ch,sort,size_bytes,path,is_free').order('sort');S.notes=data||[];return S.notes;}
const fmtSize=b=>b>=1048576?(b/1048576).toFixed(1)+' MB':Math.max(1,Math.round(b/1024))+' KB';
const hasFull=slug=>isPaid()||(S.access||[]).includes(slug);
const canNote=n=>n.is_free||isPaid()||(S.access||[]).includes('notes');
const noteRow=n=>{const ok=canNote(n);return `<div class="srow nrow" data-id="${n.id}"><span class="itile t-acc">${svg(ok?'file':'lock')}</span><div class="nm"><b>${esc(n.title)}</b><span class="sub">PDF &middot; ${fmtSize(n.size_bytes)}${n.kind==='volume'?' &middot; Full volume':''}</span></div><span class="tpill ${n.is_free?'t-good':'t-acc'}">${n.is_free?'FREE':'PAID'}</span>${ok?`<button class="btn primary sm nopen" type="button" data-id="${n.id}">Open</button>`:`<span class="btn sm" aria-disabled="true">Locked</span>`}${isAdmin()?`<button class="btn sm nflip" type="button" data-id="${n.id}">${n.is_free?'Make paid':'Make free'}</button>`:''}</div>`;};
async function openNote(id,dl){const n=(S.notes||[]).find(x=>x.id==id);if(!n)return;if(!canNote(n)){alert('Yeh note paid students ke liye hai. Full access ke liye Topper Haveli admin se contact karo.');return;}
  const w=dl?null:window.open('','_blank');
  const{data,error}=await sb.storage.from('notes').createSignedUrl(n.path,600,dl?{download:n.title.replace(/[^\w\- ]+/g,'')+'.pdf'}:undefined);
  if(error||!data){if(w)w.close();alert('File abhi nahi khul rahi. Thodi der baad try karo.');return;}
  if(dl){location.href=data.signedUrl;}else if(w){w.location.href=data.signedUrl;}else{location.href=data.signedUrl;}}
function bindNotes(root){root.querySelectorAll('.nopen').forEach(b=>b.onclick=e=>{e.stopPropagation();openNote(b.dataset.id);});
  root.querySelectorAll('.nflip').forEach(b=>b.onclick=async e=>{e.stopPropagation();const n=S.notes.find(x=>x.id==b.dataset.id);const{error}=await sb.from('notes').update({is_free:!n.is_free}).eq('id',n.id);if(error){alert(error.message);return;}n.is_free=!n.is_free;const row=b.closest('.nrow');row.outerHTML=noteRow(n);bindNotes(document.getElementById('nlist')||app);});}
async function vNotes(slug){nav('notes');setApp('<div class="card center muted">Notes load ho rahe hain…</div>');
  await fetchSubjects();const all=await fetchNotes();
  const groups=[...(S.subjects||[]).filter(s=>all.some(n=>n.subject_slug===s.slug)).map(s=>({slug:s.slug,name:s.name})),{slug:'law',name:'Business Law'},{slug:'books',name:'Full Books'}];
  const gOf=n=>n.kind==='volume'&&!n.subject_slug?'books':(n.subject_slug||'law');
  const cur=slug&&groups.some(g=>g.slug===slug)?slug:'all';
  const list=all.filter(n=>cur==='all'||gOf(n)===cur||(cur!=='books'&&n.kind==='volume'&&n.subject_slug===cur));
  const nf=all.filter(n=>n.is_free).length;
  setApp(`<div class="crumb"><a href="#/home">Dashboard</a> &rsaquo; Study Notes</div><h1 class="h1 sm">Study Notes</h1><p class="lead">Study notes (PDF), chapter-wise and as full volumes. ${nf} free, rest for paid students.</p>
  <div class="row nchips"><a class="chipbtn ${cur==='all'?'on':''}" href="#/notes">All (${all.length})</a>${groups.map(g=>`<a class="chipbtn ${cur===g.slug?'on':''}" href="#/notes/${g.slug}">${esc(g.name)}</a>`).join('')}</div>
  <div id="nlist" class="mt">${list.map(noteRow).join('')||'<div class="empty">Is section me abhi notes nahi hain.</div>'}</div>`);
  bindNotes(document.getElementById('nlist'));}
const subjName=slug=>((S.subjects||[]).find(s=>s.slug===slug)||{}).name||slug;

function vLogin(){document.body.classList.remove('authed');document.getElementById('navbar').classList.add('hidden');document.getElementById('logoutBtn').classList.add('hidden');document.getElementById('userBadge').innerHTML='';
  setApp(`<div class="card center"><h2>Topper Haveli</h2><p class="muted">Login for your personal dashboard, saved progress on every phone, and full question banks.</p></div>
  <div class="card"><div class="row"><button class="chipbtn on" id="tabIn" type="button">Login</button><button class="chipbtn" id="tabUp" type="button">New account</button></div>
  <div id="nameRow" class="hidden"><label>Your name</label><input id="fName" autocomplete="name"></div>
  <label>Email</label><input id="fEmail" type="email" autocomplete="email">
  <label>Password</label><input id="fPass" type="password" autocomplete="current-password">
  <button class="btn primary block" id="goBtn" type="button">Login</button>
  <p class="center mt"><a href="#" id="forgotL">Forgot password?</a></p>
  <div class="notice hidden" id="authMsg"></div></div>
  <p class="muted center mt">Free account: practice sets + 1 free mock per subject + basic dashboard.<br>Paid: full question banks, unlimited mocks, weak-topic analysis, rank.</p>`);
  let mode='in';
  const tab=m=>{mode=m;document.getElementById('tabIn').classList.toggle('on',m==='in');document.getElementById('tabUp').classList.toggle('on',m==='up');
    document.getElementById('nameRow').classList.toggle('hidden',m==='in');document.getElementById('goBtn').textContent=m==='in'?'Login':'Create account';document.getElementById('fPass').setAttribute('autocomplete',m==='in'?'current-password':'new-password');};
  document.getElementById('tabIn').onclick=()=>tab('in');document.getElementById('tabUp').onclick=()=>tab('up');
  document.getElementById('forgotL').onclick=async(e)=>{e.preventDefault();
    const email=document.getElementById('fEmail').value.trim(),msg=document.getElementById('authMsg');
    if(!email){msg.textContent='Pehle apna email upar daalo.';msg.classList.remove('hidden');return;}
    const{error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:'https://topperhaveli.github.io/quiz-site/portal.html?r='+Date.now()});
    msg.classList.remove('hidden');
    if(error){msg.textContent=error.message;}else{msg.textContent='Reset link bhej diya. Email kholo, link dabao, naya password set karo.';msg.classList.add('ok');}};
  document.getElementById('goBtn').onclick=async()=>{
    const email=document.getElementById('fEmail').value.trim(),pass=document.getElementById('fPass').value,msg=document.getElementById('authMsg');
    msg.classList.add('hidden');msg.classList.remove('ok');
    if(!email||pass.length<6){msg.textContent='Email aur 6+ character password daalo.';msg.classList.remove('hidden');return;}
    document.getElementById('goBtn').disabled=true;
    try{
      if(mode==='up'){const{error}=await sb.auth.signUp({email,password:pass,options:{data:{display_name:document.getElementById('fName').value.trim()}}});
        if(error)throw error;
        msg.innerHTML='Account ban gaya. Agar confirmation email aaye to link khol lena, phir login karna.';msg.classList.remove('hidden');msg.classList.add('ok');
        const{data:ses}=await sb.auth.getSession();if(ses&&ses.session){location.hash='#/home';return;}}
      else{const{error}=await sb.auth.signInWithPassword({email,password:pass});if(error)throw error;location.hash='#/home';return;}
    }catch(e){const m0=String(e.message||''),mm=/invalid login/i.test(m0)?'Email ya password galat hai.':/already registered/i.test(m0)?'Ye email pehle se registered hai. Login karo.':/email not confirmed/i.test(m0)?'Pehle email ka confirmation link kholo.':/rate limit|too many/i.test(m0)?'Bahut try ho gaye. Thodi der baad dobara karo.':/network|fetch/i.test(m0)?'Internet check karo aur dobara try karo.':(m0||'Login nahi hua. Dobara try karo.');msg.textContent=mm;msg.classList.remove('hidden','ok');}
    document.getElementById('goBtn').disabled=false;};}

const IC={
 hour:'<path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9"/>',
 check:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 12.5l2.5 2.5 5-5.5"/>',
 chart:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
 target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/>',
 book:'<path d="M4 5h6a2 2 0 012 2v12a2 2 0 00-2-2H4zM20 5h-6a2 2 0 00-2 2v12a2 2 0 012-2h6z"/>',
 file:'<path d="M7 3h7l5 5v13H7zM14 3v5h5"/>',
 clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
 arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
 fire:'<path d="M12 3c1 4 5 5 5 10a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z"/>',
 grad:'<path d="M2 9l10-5 10 5-10 5zM6 11v5c3 2.5 9 2.5 12 0v-5"/>',
 trophy:'<path d="M8 4h8v5a4 4 0 01-8 0zM8 6H4v1a3 3 0 003 3M16 6h4v1a3 3 0 01-3 3M12 13v4M9 20h6"/>',
 lock:'<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
 list:'<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>'};
const svg=(k,c)=>`<svg class="ic ${c||''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${IC[k]}</svg>`;
const tier=p=>p>=90?['Mastered','t-good','g']:p>=80?['Proficient','t-acc','']:p>=70?['Needs Review','t-mid','m']:['Action Required','t-bad','r'];
async function loadStats(){
  const mP=sb.from('mock_attempts').select('id,subject_slug,score,total,completed_at,status').eq('user_id',S.session.user.id).eq('status','completed').order('completed_at',{ascending:false}).limit(20);
  const atts=await fetchAttemptsLite();
  const per={};atts.forEach(a=>{per[a.subject_slug]=per[a.subject_slug]||{n:0,c:0};per[a.subject_slug].n++;if(a.correct)per[a.subject_slug].c++;});
  const totalA=atts.length,totalC=atts.filter(a=>a.correct).length;
  const days=[...new Set(atts.map(a=>(a.created_at||'').slice(0,10)))];
  let streak=0;const today=new Date();for(let i=0;;i++){const d=new Date(today.getTime()-i*86400000).toISOString().slice(0,10);
    if(days.includes(d)){streak++;}else if(i===0){continue;}else break;}
  const{data:mocks}=await mP;
  const last=[...atts].filter(a=>a.created_at).sort((x,y)=>(y.created_at>x.created_at?1:-1))[0];
  const ms=(mocks||[]).filter(m=>m.total);
  const avg=ms.length?Math.round(ms.reduce((a,m)=>a+100*m.score/m.total,0)/ms.length):null;
  return{atts,per,totalA,totalC,acc:totalA?Math.round(100*totalC/totalA):null,streak,mocks:mocks||[],last,avg};}
function masteryRows(st,limit){const rows=(S.subjects||[]).filter(s=>st.per[s.slug]).map(s=>({s,p:Math.round(100*st.per[s.slug].c/st.per[s.slug].n),n:st.per[s.slug].n})).sort((a,b)=>b.n-a.n).slice(0,limit||99);
  return rows.map(r=>{const t=tier(r.p);return `<div class="mrow"><div class="mtop"><span class="mname">${esc(r.s.name)}</span><span class="tpill ${t[1]}">${t[0]}</span><b>${r.p}%</b></div><div class="pbar"><i class="${t[2]}" style="width:${r.p}%"></i></div></div>`}).join('');}
function trajectory(mocks){const ms=[...(mocks||[])].reverse().filter(m=>m.total).slice(-8);
  if(ms.length<2)return `<div class="empty">${ms.length?'Ek aur mock do, phir trend line dikhegi.':'Mock tests do, score trend yahan dikhega.'}</div>`;
  const W=520,H=230,L=40,R=16,T=18,B=30,n=ms.length,x=i=>L+i*(W-L-R)/(n-1),y=v=>T+(H-T-B)*(1-v/100);
  const pts=ms.map((m,i)=>[x(i),y(100*m.score/m.total),Math.round(100*m.score/m.total)]);
  const d=pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  const grid=[100,70,40].map(v=>`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="#e1d9d0" stroke-dasharray="${v==100?'0':'3 4'}"/><text x="${L-8}" y="${y(v)+4}" text-anchor="end" font-size="11" fill="#78706a">${v}%</text>`).join('');
  const mx=pts.reduce((a,p)=>p[2]>a[2]?p:a,pts[0]);
  return `<svg viewBox="0 0 ${W} ${H}" class="traj" role="img" aria-label="Mock score trend"><defs><linearGradient id="tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c2652a" stop-opacity=".22"/><stop offset="1" stop-color="#c2652a" stop-opacity="0"/></linearGradient></defs>${grid}<path d="${d} L${pts[n-1][0]} ${H-B} L${pts[0][0]} ${H-B}Z" fill="url(#tg)"/><path d="${d}" fill="none" stroke="#c2652a" stroke-width="2.5" stroke-linejoin="round"/>${pts.map((p,i)=>`<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="#fff" stroke="#c2652a" stroke-width="2"/><text x="${p[0]}" y="${H-10}" text-anchor="middle" font-size="11" fill="${i==n-1?'#c2652a':'#78706a'}" font-weight="${i==n-1?700:500}">M${i+1}</text>`).join('')}<g transform="translate(${Math.min(Math.max(mx[0],40),W-50)},${mx[1]-26})"><rect x="-30" y="-12" width="60" height="20" rx="6" fill="#c2652a"/><text y="2" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">${mx[2]}% best</text></g></svg>`;}
function analyticsBlock(st){const nm=st.mocks.length;
  return `<div class="sechead"><div><h2 class="h2">Performance &amp; Progress Analytics</h2><p class="sub">Real numbers from your practice answers and mock tests.</p></div></div>
  <div class="stats4">
   <div class="scard"><div class="slab">QUESTIONS SOLVED<span class="itile t-acc">${svg('hour')}</span></div><div class="sval">${st.totalA}<small>Q</small></div><div class="ssub">${st.totalC} correct</div></div>
   <div class="scard"><div class="slab">MOCK TESTS DONE<span class="itile t-mid">${svg('check')}</span></div><div class="sval">${nm}<small>mocks</small></div><div class="ssub">${nm?'Last: '+esc(subjName(st.mocks[0].subject_slug)):'Take your first mock'}</div></div>
   <div class="scard"><div class="slab">AVERAGE MOCK SCORE<span class="itile t-gold">${svg('chart')}</span></div><div class="sval">${st.avg!=null?st.avg+'%':'-'}</div><div class="ssub ${st.avg>=70?'good':''}">${st.avg!=null?(st.avg>=70?'Above 70% mark':'Aim for 70%+'):'No mock yet'}</div></div>
   <div class="scard"><div class="slab">CURRENT ACCURACY<span class="itile t-bad">${svg('target')}</span></div><div class="sval">${st.acc!=null?st.acc+'%':'-'}</div><div class="ssub">${st.streak?st.streak+'-day streak':'Start a streak today'}</div></div>
  </div>
  <div class="two"><div class="card pad"><h3 class="h3">Score Trajectory</h3><p class="sub">Last ${Math.min(8,st.mocks.length)||8} mock tests</p>${trajectory(st.mocks)}</div>
   <div class="card pad"><h3 class="h3">Subject-Wise Accuracy &amp; Mastery</h3><p class="sub">From your practice answers</p>${masteryRows(st)||'<div class="empty">Practice karo, subject-wise accuracy yahan dikhegi.</div>'}</div></div>`;}
function mocksList(mocks){return (mocks||[]).slice(0,4).map(mk=>{const p=mk.total?Math.round(100*mk.score/mk.total):0,t=tier(p);return `<a class="mcard b-${t[2]||'o'}" href="#/mockreview/${mk.id}"><div class="mtop"><b>${esc(subjName(mk.subject_slug))}</b><span class="tpill ${t[1]}">${mk.score}/${mk.total}</span></div><div class="sub">${(mk.completed_at||'').slice(0,10)} &middot; ${p}% &middot; View review &rsaquo;</div></a>`}).join('')||'<div class="empty">Abhi koi mock complete nahi hua.</div>';}

const COURSES=[
 {id:'accounting',name:'Accounting',icon:'file',slugs:['accounting','financial-accounting','corporate-accounting','cost-accounting','management-accounting','auditing','income-tax','gst-taxation']},
 {id:'rajasthan',name:'Rajasthan',icon:'target',slugs:['rajasthan-gk','rajasthan-history','rajasthan-geography','rajasthan-art-culture']},
 {id:'maths-reasoning',name:'Maths & Reasoning',icon:'target',slugs:['mathematics','reasoning']},
 {id:'computer',name:'Computer',icon:'list',slugs:['computer-awareness']},
 {id:'india-gk',name:'India GK',icon:'book',slugs:['general-knowledge','general-science']},
 {id:'language',name:'Language',icon:'book',slugs:['hindi','english']}];
const courseSubjects=c=>c.slugs.map(sl=>(S.subjects||[]).find(x=>x.slug===sl)).filter(Boolean);
async function vCourse(id){nav('home');await fetchSubjects();const c=COURSES.find(x=>x.id===id);
  if(!c){location.hash='#/home';return;}
  const st=await loadStats().catch(()=>({per:{}}));const subs=courseSubjects(c);
  setApp(`<div class="crumb"><a href="#/home">Dashboard</a> &rsaquo; Courses &rsaquo; ${esc(c.name)}</div><h1 class="h1 sm">${esc(c.name)}</h1>
  <div>${subs.map(s=>{const p=(st.per||{})[s.slug];const full=hasFull(s.slug);return `<a class="srow" style="text-decoration:none;color:inherit" href="#/subject/${s.slug}"><span class="itile t-acc">${svg('file')}</span><div class="nm"><b>${esc(s.name)}</b><span class="sub">${p?p.n+' solved &middot; '+Math.round(100*p.c/p.n)+'% accuracy':(full?'Full bank':'Free preview: '+s.free_question_count+' Q')}</span></div><span class="tpill ${full?'t-acc':'t-good'}">${full?'FULL':'FREE PREVIEW'}</span><span class="go">&rsaquo;</span></a>`;}).join('')}</div>
  <a class="btn block mt" href="#/notes">Study Notes</a><a class="btn block mt" href="#/home">Back to dashboard</a>`);}
async function vHome(){nav('home');await fetchSubjects();
  const paid=isPaid();
  const note=localStorage.getItem('portal_import_note');if(note)localStorage.removeItem('portal_import_note');
  const omP=sb.from('mock_attempts').select('id,subject_slug,started_at,state,config').eq('user_id',S.session.user.id).eq('status','in_progress').order('started_at',{ascending:false}).limit(1);
  let st;try{st=await loadStats();}catch(e){st={atts:[],per:{},totalA:0,totalC:0,acc:null,streak:0,mocks:[],last:null,avg:null};}
  const{data:openMocks}=await omP;
  const nm=((S.profile&&S.profile.display_name)||'').trim().split(/\s+/)[0];
  const lastSubj=st.last&&(S.subjects||[]).find(s=>s.slug===st.last.subject_slug);
  const om=openMocks&&openMocks[0];
  let resume;
  if(om){const tot=((om.config||{}).question_ids||[]).length,ans=Object.keys(((om.state||{}).answers)||{}).length;
    resume=`<div class="pillbtn">RESUME PAUSED MOCK</div><h2 class="rtitle">${esc(subjName(om.subject_slug))}</h2><p class="rsub">Mock chalu hai - wahin se aage badho.</p><div class="rbar"><span>Mock Progress</span><b>${tot?Math.round(100*ans/tot):0}%</b></div><div class="pbar"><i style="width:${tot?Math.round(100*ans/tot):0}%"></i></div><div class="rfoot"><span class="rmeta">${svg('check','g')} ${ans} of ${tot} answered</span><a class="btn primary" href="#/mockrun/${om.id}">Resume Mock ${svg('arrow')}</a></div>`;}
  else if(lastSubj){const n=(st.per[lastSubj.slug]||{}).n||0,avail=Math.max(n,(S.qcache[lastSubj.slug]||[]).length||(paid?0:lastSubj.free_question_count)||n);
    resume=`<div class="pillbtn">RESUME LAST PRACTICE</div><span class="rtime">${svg('clock')} ${fmtAgo(st.last.created_at)}</span><h2 class="rtitle">${esc(lastSubj.name)}</h2><p class="rsub">${n} questions solved in this subject.</p><div class="rbar"><span>Subject Progress</span><b>${avail?Math.round(100*n/avail):0}%</b></div><div class="pbar"><i style="width:${avail?Math.min(100,Math.round(100*n/avail)):0}%"></i></div><div class="rfoot"><span class="rmeta">${svg('check','g')} ${n} of ${avail||'-'} questions done</span><a class="btn primary" href="#/subject/${lastSubj.slug}">Continue Learning ${svg('arrow')}</a></div>`;}
  else{const f=(S.subjects||[])[0];
    resume=`<div class="pillbtn">START HERE</div><h2 class="rtitle">${f?esc(f.name):'Pehla subject chuno'}</h2><p class="rsub">Pehla sawal solve karke apni journey shuru karo.</p><div class="rfoot"><span class="rmeta">${svg('book','g')} ${(S.subjects||[]).length} subjects available</span>${f?`<a class="btn primary" href="#/subject/${f.slug}">Start Learning ${svg('arrow')}</a>`:''}</div>`;}
  let annHtml='';
  try{const[{data:anns},{data:myD}]=await Promise.all([
      sb.from('announcements').select('id,title,body,pinned,created_at').order('pinned',{ascending:false}).order('created_at',{ascending:false}).limit(4),
      sb.from('doubts').select('id,status,reply,replied_at,created_at').eq('user_id',S.session.user.id).order('created_at',{ascending:false}).limit(20)]);
    const seen=Number(localStorage.getItem('th_doubt_seen')||0);
    const newReplies=(myD||[]).filter(d=>d.reply&&new Date(d.replied_at||d.created_at).getTime()>seen).length;
    const openN=(myD||[]).filter(d=>d.status!=='answered'&&!d.reply).length;
    annHtml=((anns&&anns.length)?`<div class="card pad annc"><h3 class="h3">${svg('book')} Notice Board</h3>${anns.map(a=>`<div class="annrow"><b>${a.pinned?'<span class="badge warn">PINNED</span> ':''}${esc(a.title)}</b>${a.body?`<p class="muted small" style="margin:3px 0 0;white-space:pre-wrap">${esc(a.body)}</p>`:''}<span class="muted small">${new Date(a.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</span></div>`).join('')}</div>`:'')+
      '';
  }catch(e){}
  const mr=masteryRows(st,4);
  const mockTo=lastSubj?'#/mocksetup/'+lastSubj.slug:((S.subjects||[])[0]?'#/mocksetup/'+S.subjects[0].slug:'#/home');
  setApp(`${note?`<div class="notice ok">${esc(note)}</div>`:''}${annHtml}
  <div class="hero"><div class="herol"><span class="semi">${svg('grad')} TOPPER HAVELI &middot; JVVNL JA</span>
   <h1 class="h1">Welcome back${nm?', '+esc(nm):''}!</h1>
   <p class="lead">${st.totalA?`You have solved <b>${st.totalA} questions</b> at <b>${st.acc}% accuracy</b>${st.streak?` and you are on a <b>${st.streak}-day</b> streak`:''}.`:'Solve your first question today and start your <b>study streak</b>.'}</p></div>
   <div class="hchips">${st.streak?`<span class="hchip c1">${svg('fire')} ${st.streak} Day Streak</span>`:''}${st.acc!=null?`<span class="hchip c3">${svg('target')} ${st.acc}% Accuracy</span>`:''}<span class="hchip c2">${svg('trophy')} ${paid?'Full Access':(isScoped()?'Selected Sections':'Free Plan')}</span></div></div>
  <div class="two wide"><div class="card pad resume">${resume}</div>
   <div class="card pad"><div class="mastery">${mr||'<div class="empty">Subject mastery yahan dikhega, jaise hi tum practice shuru karoge.</div>'}</div><div class="rfoot"><span class="rmeta">${paid?'Unlimited mocks':'1 free mock per subject'}</span><a class="btn dark" href="${mockTo}">Start a Mock ${svg('arrow')}</a></div></div></div>
  ${analyticsBlock(st)}
  <div class="two wide2"><div>   <div class="sechead"><h2 class="h2s">${svg('book','o')} Courses</h2><span class="sub">${COURSES.length} courses</span></div>
   <div id="courseList">${COURSES.map(c=>{const subs=courseSubjects(c);if(!subs.length)return '';const solved=subs.reduce((n,x)=>n+((st.per[x.slug]||{}).n||0),0);const full=subs.filter(x=>hasFull(x.slug)).length;
     return `<a class="srow course" style="text-decoration:none;color:inherit" href="#/course/${c.id}"><span class="itile t-acc">${svg(c.icon)}</span><div class="nm"><b>${esc(c.name)}</b><span class="sub">${subs.length} ${subs.length>1?'subjects':'subject'}${solved?' &middot; '+solved+' solved':''}</span></div><span class="tpill ${full===subs.length?'t-acc':'t-good'}">${full===subs.length?'FULL ACCESS':'OPEN'}</span><span class="go">&rsaquo;</span></a>`;}).join('')}</div>
   ${!paid?(isScoped()?`<div class="card pad unlock"><h3 class="h3">Selected sections ka plan active hai</h3><p class="sub">Baaki courses ke liye Topper Haveli admin se contact karo.</p></div>`:`<div class="card pad unlock"><h3 class="h3">${S.profile&&S.profile.is_paid?'Plan khatam ho gaya':'Unlock full access'}</h3><p class="sub">All question banks, unlimited mocks, weak-topic analysis and rank. ${S.profile&&S.profile.is_paid?'Renew ke liye':'Full access ke liye'} Topper Haveli admin se contact karo.</p></div>`):''}</div>
   <div><div id="notesHome"></div><div class="sechead"><h2 class="h2s">${svg('clock','o')} Recent Mock Tests</h2><span class="sub">${st.mocks.length} done</span></div>${mocksList(st.mocks)}</div></div>`);
  document.querySelectorAll('.subj').forEach(d=>d.onclick=()=>{location.hash='#/subject/'+d.dataset.slug;});
  fetchNotes().then(all=>{const box=document.getElementById('notesHome');if(!box||!all.length)return;const pick=all.filter(n=>n.is_free).slice(0,3);
    box.innerHTML=`<div class="sechead"><h2 class="h2s">${svg('book','o')} Study Notes</h2><a class="sub" href="#/notes">View all ${all.length} &rsaquo;</a></div>${pick.map(noteRow).join('')}`;bindNotes(box);}).catch(()=>{});}

async function vSubject(slug){nav('home');await fetchSubjects();
  const[qs,allN]=await Promise.all([fetchQuestions(slug),fetchNotes().catch(()=>[])]);const nP=qs.filter(isPYQ).length,nM=qs.length-nP;const paid=hasFull(slug);
  const nN=allN.filter(n=>n.subject_slug===slug).length;
  const card=(ic,t,sub,cnt,href,btn,dis)=>`<div class="card pad scrd ${dis?'dis':''}"><span class="itile t-acc">${svg(ic)}</span><h3 class="h3">${t}</h3><p class="sub">${sub}</p>${cnt?`<div class="cnt">${cnt}<small> questions</small></div>`:''}${dis?`<span class="btn" aria-disabled="true">${btn}</span>`:`<a class="btn primary" href="${href}">${btn} ${svg('arrow')}</a>`}</div>`;
  setApp(`<div class="crumb"><a href="#/home">Dashboard</a> &rsaquo; ${esc(subjName(slug))}</div><h1 class="h1 sm">${esc(subjName(slug))}</h1><p class="lead">Choose how you want to study. MCQ, previous-year questions and notes are kept separate.</p>
  <div class="trio">
   ${card('list','MCQ Practice','Topic-wise practice questions with explanations.',nM,'#/practice/'+slug+'/Practice',nM?'Start MCQs':(paid?'MCQs abhi add nahi hue':'Not in your plan'),!nM)}
   ${card('file','Previous Year Questions','Real exam questions from 2018 onwards.',nP,'#/practice/'+slug+'/PYQ',nP?'Start PYQs':(paid?'PYQs abhi add nahi hue':'Not in your plan'),!nP)}
   ${card('book','Study Notes','Short notes and revision material (PDF).',nN?nN+'<small> files</small>':null,'#/notes/'+slug,nN?'Open Notes':'Coming soon',!nN).replace('<small> questions</small>','')}
   ${card('clock','Mock Test',paid?'Timed test, choose your size.':'1 free timed mock for this subject.',null,'#/mocksetup/'+slug,'Start Mock')}
  </div>`);}

async function vPractice(slug,initSrc){nav('home');
  setApp('<div class="card center muted">Questions load ho rahe hain…</div>');
  const qs=await fetchQuestions(slug);
  const atts=await fetchAttempts();
  const amap={};atts.forEach(a=>amap[a.question_id]=a);
  if(!qs.length){setApp('<div class="card center"><h3>No access</h3><p class="muted">Is subject ke questions abhi locked hain.</p><a class="btn block" href="#/home">Back</a></div>');return;}
  const sources=[...new Set(qs.map(qType))];
  let idx=0,filter='all',src=(initSrc&&sources.includes(initSrc))?initSrc:'all';
  {const l0=qs.filter(q=>src==='all'||qType(q)===src);const f=l0.findIndex(q=>amap[q.id]===undefined);if(f>0)idx=f;}
  const filtered=()=>qs.filter(q=>(src==='all'||qType(q)===src)&&(filter==='all'||(filter==='unanswered'&&amap[q.id]===undefined)||(filter==='wrong'&&amap[q.id]&&!amap[q.id].correct)||(filter==='correct'&&amap[q.id]&&amap[q.id].correct)));
  function render(){const sy=window.scrollY;requestAnimationFrame(()=>{});const list=filtered();if(idx>=list.length)idx=Math.max(0,list.length-1);
    const q=list[idx];
    const srcOpts=['<option value="all">All questions</option>'].concat(sources.map(s=>`<option ${s===src?'selected':''} value="${esc(s)}">${esc(s)}</option>`)).join('');
    if(!q){setApp(`<div class="card"><div class="row"><a class="chipbtn" href="#/subject/${slug}">&lsaquo; Back</a></div>
      <div class="row mt"><select id="fSrc">${srcOpts}</select></div>
      <div class="row mt">${['all','unanswered','wrong','correct'].map(f=>`<button class="chipbtn ${f===filter?'on':''}" data-f="${f}" type="button">${f}</button>`).join('')}</div>
      <p class="center muted mt">Is filter me koi question nahi.</p></div>`);wire(list);return;}
    const a=amap[q.id],done=a!==undefined;
    setApp(`<div class="card"><div class="row"><a class="chipbtn" href="#/subject/${slug}">&lsaquo; Back</a><span class="muted">${idx+1} / ${list.length}</span><span class="sp"></span><span class="muted">${esc(subjName(slug))}</span></div>
    <div class="row mt"><select id="fSrc">${srcOpts}</select></div>
    <div class="row mt">${['all','unanswered','wrong','correct'].map(f=>`<button class="chipbtn ${f===filter?'on':''}" data-f="${f}" type="button">${f}</button>`).join('')}</div></div>
    <div class="card"><p><span class="badge ${isPYQ(q)?'paid':'free'}">${esc(qLabel(q))}</span></p><p class="qtext">${esc(q.question)}</p>
    ${q.options.map((o,i)=>`<button class="opt ${done&&i===q.answer?'right':''} ${done&&i===a.chosen&&i!==q.answer?'wrong':''}" data-i="${i}" type="button" ${done?'disabled':''}>${String.fromCharCode(65+i)}. ${esc(o)}</button>`).join('')}
    ${done?`<div class="expl"><b>Answer: ${String.fromCharCode(65+q.answer)}</b>${q.explanation?'<br>'+md(q.explanation):''}</div>`:''}
    <div class="row mt"><button class="btn" id="prevB" type="button" ${idx===0?'disabled':''}>&lsaquo; Prev</button><span class="sp"></span><button class="btn" id="nextB" type="button" ${idx>=list.length-1?'disabled':''}>Next &rsaquo;</button></div>
    </div>`);
    wire(list,q);if(window.__keepScroll){window.scrollTo(0,sy);window.__keepScroll=0;}}
  function wire(list,q){document.getElementById('fSrc').onchange=e=>{src=e.target.value;idx=0;render();};
    document.querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>{filter=b.dataset.f;idx=0;render();});
    if(q){document.querySelectorAll('.opt').forEach(b=>b.onclick=async()=>{const i=Number(b.dataset.i);
      const row={user_id:S.session.user.id,question_id:q.id,subject_slug:slug,chosen:i,correct:i===q.answer,mode:'practice'};
      amap[q.id]={...row};window.__keepScroll=1;render();
      sb.from('attempts').upsert(row,{onConflict:'user_id,question_id'}).then(r=>{if(r.error)console.warn(r.error)});});
    document.getElementById('prevB').onclick=()=>{if(idx>0){idx--;render();}};
    document.getElementById('nextB').onclick=()=>{if(idx<list.length-1){idx++;render();}};}}
  render();}

async function vMockSetup(slug){nav('home');await fetchSubjects();
  const paid=hasFull(slug);
  const{count}=await sb.from('mock_attempts').select('id',{count:'exact',head:true}).eq('user_id',S.session.user.id).eq('subject_slug',slug);
  const freeLeft=S.config.free_mock_per_subject?(count<1):false;
  if(!paid&&!freeLeft){setApp(`<div class="card center"><h3>Free mock used</h3><p class="muted">${esc(subjName(slug))} ka free mock ho chuka. Paid me unlimited mocks milte hain.</p><a class="btn block" href="#/subject/${slug}">Back</a></div>`);return;}
  const qs=await fetchQuestions(slug);
  const maxN=qs.length;
  setApp(`<div class="card"><h2>Mock - ${esc(subjName(slug))}</h2>
  <p class="muted">${paid?'Paid: apni pasand ka size.':`FREE mock: ${Math.min(25,maxN)} questions, ${Math.min(25,maxN)} minutes.`} Available: ${maxN} questions.</p>
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
  if(list.length<ids.length){setApp(`<div class="card center"><h2>Access change hua hai</h2><p class="muted">Is mock ke ${ids.length} me se ${ids.length-list.length} questions abhi tumhare plan me khule nahi hain, isliye mock ko chhota karke nahi chalaya ja raha. Tumhara progress save hai. Plan wapas active hone par ye mock wahin se chalega.</p><a class="btn block" href="#/home">Home</a></div>`);return;}
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
    <div class="card"><p><span class="badge ${isPYQ(q)?'paid':'free'}">${esc(qLabel(q))}</span></p><p class="qtext">${esc(q.question)}</p>
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
    let saveErr=null;
    for(let i=0;i<rows.length;i+=500){const r=await sb.from('attempts').upsert(rows.slice(i,i+500),{onConflict:'user_id,question_id'});if(r.error)saveErr=r.error;}
    const done=await sb.from('mock_attempts').update({status:'completed',score,total:list.length,state:st,completed_at:new Date().toISOString()}).eq('id',m.id);
    if(done.error)saveErr=done.error;
    if(saveErr){console.warn(saveErr);alert('Result save nahi hua (network/server). Internet check karke dobara Submit dabao - tumhare answers safe hain.');return;}
    renderResult({...m,status:'completed',score,total:list.length},list);}
  function renderResult(mm){const pct=mm.total?Math.round(100*mm.score/mm.total):0;
    setApp(`<div class="card center"><div class="lbl">Mock result</div><h2 style="font-size:40px;margin:6px 0">${pct}%</h2><p class="muted">${pct>=75?'Bahut badhiya!':pct>=50?'Achha prayas, aur practice karo.':'Weak topics dobara practice karo.'}</p><div class="pbar"><i class="${pct>=75?'g':pct<50?'r':''}" style="width:${pct}%"></i></div>
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
    return `<div class="card"><p class="muted">Q${n+1} · ${esc(qLabel(q))}</p><p class="qtext">${esc(q.question)}</p>
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
    const{data:wj}=await sb.from('attempts').select('correct, questions(id,source)').eq('user_id',S.session.user.id).limit(5000);
    const bySrc={};(wj||[]).forEach(r=>{const s=r.questions?qType(r.questions):'Practice';bySrc[s]=bySrc[s]||{n:0,c:0};bySrc[s].n++;if(r.correct)bySrc[s].c++;});
    const weak=Object.entries(bySrc).filter(([,v])=>v.n>=5).map(([k,v])=>({k,pct:Math.round(100*v.c/v.n),n:v.n})).sort((a,b)=>a.pct-b.pct).slice(0,5);
    paidHtml=`<div class="card"><h3>Weak topics (paid)</h3>${weak.length?weak.map(w=>`<div class="row"><span style="flex:1">${esc(w.k)}</span><span class="badge ${w.pct<50?'warn':'free'}">${w.pct}%</span><span class="muted">${w.n} Q</span></div>`).join(''):'<p class="muted">Thodi aur practice karo, phir analysis dikhega.</p>'}</div>
    <div class="card"><h3>Rank (paid)</h3><div class="grid2">${rankHtml}<div class="stat"><b>${totalA}</b><span>Total answered</span></div></div></div>`;}
  const st=await loadStats();
  setApp(`<div class="crumb">Dashboard &rsaquo; Analytics</div><h1 class="h1 sm">Analytics</h1>${analyticsBlock(st)}
  ${paidHtml}
  <div class="card pad"><h3 class="h3">Mock history</h3>${(mocks||[]).map(mk=>`<a class="row" style="min-height:44px;text-decoration:none;color:inherit" href="#/mockreview/${mk.id}"><span style="flex:1">${esc(subjName(mk.subject_slug))}</span><span class="muted">${(mk.completed_at||'').slice(0,10)}</span><span class="badge paid">${mk.score}/${mk.total} &rsaquo;</span></a>`).join('')||'<p class="muted">Koi mock nahi.</p>'}</div>
  ${!paid?'<div class="card center"><p class="muted">Paid me: weak-topic analysis, rank, unlimited mocks, saare questions.</p></div>':''}`);}

async function vDoubts(){nav('home');
  setApp('<div class="card center muted">Doubts load ho rahe hain…</div>');
  const{data,error}=await sb.from('doubts').select('id,subject_slug,question_id,body,status,reply,replied_at,created_at').eq('user_id',S.session.user.id).order('created_at',{ascending:false}).limit(60);
  if(error){setApp(`<div class="card center"><p class="muted">${esc(error.message)}</p><a class="btn block" href="#/home">Back</a></div>`);return;}
  localStorage.setItem('th_doubt_seen',String(Date.now()));
  setApp(`<div class="crumb">Home &rsaquo; Doubts</div><h1 class="h1 sm">My Doubts</h1>
  ${(data||[]).map(d=>`<div class="card"><p class="muted small">${esc(subjName(d.subject_slug))} · ${fmtAgo(d.created_at)}</p><p style="white-space:pre-wrap">${esc(d.body)}</p>
   ${d.reply?`<div class="expl"><b>Answer</b><br><span style="white-space:pre-wrap">${esc(d.reply)}</span></div>`:'<p class="muted small">Jawab ka intezar hai.</p>'}</div>`).join('')||'<div class="card center muted">Abhi koi doubt nahi. Practice me kisi question ke neeche "Doubt poochho" dabao.</div>'}
  <a class="btn block" href="#/home">Back</a>`);}

function trendHtml(mocks){const ms=[...(mocks||[])].reverse().filter(m=>m.total);if(ms.length<2)return '';
  const W=300,H=110,pts=ms.map((m,i)=>[10+i*(280/(ms.length-1)),100-90*m.score/m.total]);
  const d=pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  return `<div class="card"><h3>Mock score trend</h3><svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" role="img" aria-label="Mock score trend"><path d="${d} L${pts[pts.length-1][0]} 105 L10 105Z" fill="var(--acc)" opacity=".12"/><path d="${d}" fill="none" stroke="var(--acc)" stroke-width="3" stroke-linejoin="round"/>${pts.map(p=>`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5" fill="var(--acc)"/>`).join('')}</svg><p class="muted">Last ${ms.length} mocks</p></div>`;}
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
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">${grid}${bars(seriesA,'#c2652a',0)}${bars(seriesB,'#e08850',bw/2)}${labels}</svg>
  <div class="row" style="gap:14px;justify-content:center"><span class="legend"><i style="background:#c2652a"></i>Signups</span><span class="legend"><i style="background:#e08850"></i>Answers</span></div>`;}

async function vAdmin(openId){nav('admin');
  if(!isAdmin()){setApp('<div class="card center muted">Admin only.</div>');return;}
  setApp('<div class="card center muted">Admin dashboard load ho raha hai…</div>');
  const[{data:ov,error:e1},{data:students,error:e2},{data:usage}]=await Promise.all([
    sb.rpc('admin_overview'),sb.rpc('admin_students'),sb.rpc('admin_subject_usage')]);
  await fetchSubjects();
  if(e1||e2){setApp(`<div class="card center"><h3>Load nahi hua</h3><p class="muted">${esc((e1||e2).message)}</p></div>`);return;}
  const defDays=S.config.paid_validity_days||120;
  let q='',filter='all',sel=new Set(),detailId=null;
  let ops={anns:[],doubts:[],hard:[],batches:[],members:[]};
  async function loadOps(){
    const[a,d,h]=await Promise.all([
      sb.from('announcements').select('id,title,body,pinned,expires_at,created_at,batch_id').order('created_at',{ascending:false}).limit(20),
      sb.from('doubts').select('id,user_id,subject_slug,question_id,body,status,reply,created_at').order('created_at',{ascending:false}).limit(40),
      sb.rpc('admin_hardest_questions',{p_min:5})]);
    const[bb,bm]=await Promise.all([sb.from('batches').select('id,name,subjects').order('created_at'),sb.from('batch_members').select('batch_id,user_id')]);
    ops.batches=bb.data||[];ops.members=bm.data||[];
    ops.anns=a.data||[];ops.doubts=d.data||[];ops.hard=h.data||[];}
  await loadOps();
  const uname=id=>{const u=students.find(x=>x.id===id);return u?(u.display_name||u.email||'student'):'student';};
  function csvStudents(list){
    const cell=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
    const rows=[['Name','Email','Plan','Valid till','Answers','Correct','Mocks','Last active','Joined']].concat(list.map(u=>[u.display_name||'',u.email||'',planStatus(u).t,u.paid_until?new Date(u.paid_until).toISOString().slice(0,10):'',u.answers,u.correct,u.mocks,u.last_active?new Date(u.last_active).toISOString().slice(0,10):'',u.created_at?new Date(u.created_at).toISOString().slice(0,10):'']));
    const blob=new Blob(['\ufeff'+rows.map(r=>r.map(cell).join(',')).join('\n')],{type:'text/csv'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='topper-haveli-students.csv';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500);}

  function filteredStudents(){
    const t=q.trim().toLowerCase();
    return students.filter(u=>{
      if(filter==='paid'&&!activePlan(u))return false;
      if(filter==='free'&&activePlan(u))return false;
      if(filter==='expiring'&&!(activePlan(u)&&u.paid_until&&new Date(u.paid_until).getTime()-Date.now()<15*86400000))return false;
      if(filter==='expired'&&!(u.is_paid&&u.paid_until&&new Date(u.paid_until).getTime()<=Date.now()))return false;
      if(filter==='inactive'&&!(!u.last_active||Date.now()-new Date(u.last_active).getTime()>7*86400000))return false;
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
      <div class="uright"><span class="badge ${st.c}">${st.t}</span><a class="chipbtn smallbtn" href="#/admin/student/${u.id}" target="_blank" rel="noopener" title="Open in new tab">&#8599; Tab</a>
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
      <div class="row mt" style="flex-wrap:wrap">${[['all','Sab'],['paid','Paid'],['free','Free'],['expiring','Expiring <15d'],['expired','Expired'],['inactive','Inactive 7d+']].map(f=>`<button class="chipbtn ${filter===f[0]?'on':''}" data-f="${f[0]}" type="button">${f[1]}</button>`).join('')}</div>
      <div class="row mt"><button class="chipbtn" id="csvB" type="button">Export CSV (${list.length})</button></div>
      <div class="mt">${list.map(rowHtml).join('')||'<p class="muted center">Koi student nahi mila.</p>'}</div>
    </div>
    <div class="card"><div class="row"><h3 style="flex:1">Doubts inbox</h3><span class="badge ${ops.doubts.some(d=>!d.reply)?'warn':'free'}">${ops.doubts.filter(d=>!d.reply).length} open</span></div>
      ${ops.doubts.filter(d=>!d.reply).slice(0,10).map(d=>`<div class="planbox" data-doubt="${d.id}"><p class="muted small" style="margin:0">${esc(uname(d.user_id))} · ${esc(subjName(d.subject_slug))} · ${fmtAgo(d.created_at)}</p><p style="white-space:pre-wrap;margin:4px 0">${esc(d.body)}</p>
        <textarea rows="2" placeholder="Jawab likho" data-dreply="${d.id}"></textarea><div class="row mt"><button class="chipbtn on" data-dsend="${d.id}" type="button">Jawab bhejo</button></div></div>`).join('')||'<p class="muted">Koi open doubt nahi.</p>'}
    </div>
    <div class="card"><h3>Batches</h3><p class="muted small">Batch ko jo subjects doge, wo us batch ke students ke liye poore khulenge (individual access ke upar). Koi student apne aap batch me nahi jata. Student detail se add karo.</p>
      ${ops.batches.map(b=>`<div class="planbox"><div class="row"><b style="flex:1">${esc(b.name)}</b><span class="muted small">${ops.members.filter(m=>m.batch_id===b.id).length} students</span><button class="chipbtn" data-bdel="${b.id}" type="button">Hatao</button></div><p class="muted small" style="margin:4px 0 0">${(b.subjects||[]).map(x=>esc(subjName(x))).join(', ')||'Koi subject nahi'}</p></div>`).join('')||'<p class="muted">Abhi koi batch nahi.</p>'}
      <input id="bName" placeholder="Naya batch ka naam" maxlength="60">
      <div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px">${S.subjects.map(x=>`<label class="chipbtn" style="cursor:pointer"><input type="checkbox" data-bsub="${x.slug}" style="margin-right:6px">${esc(x.name)}</label>`).join('')}</div>
      <div class="row mt" style="gap:8px"><button class="btn primary" id="bAdd" type="button">Batch banao</button><span class="muted small" id="bMsg"></span></div>
    </div>
    <div class="card"><h3>Notice board</h3><p class="muted small">Yahan likha notice saare students ke home par dikhta hai. Post karne se pehle ek baar padh lo.</p>
      <input id="anTitle" placeholder="Title" maxlength="120"><textarea id="anBody" rows="2" placeholder="Detail (optional)" maxlength="600"></textarea>
      <div class="row mt" style="gap:8px;flex-wrap:wrap"><label class="chipbtn" style="cursor:pointer"><input type="checkbox" id="anPin" style="margin-right:6px">Pin</label><select id="anBatch" style="width:auto"><option value="">Sab students</option>${ops.batches.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select><input id="anDays" type="number" min="1" placeholder="Din baad hatao" style="width:130px;padding:7px;margin:0"><button class="btn primary" id="anPost" type="button">Post</button></div>
      <div class="notice hidden" id="anMsg"></div>
      ${ops.anns.map(a=>`<div class="row" style="padding:7px 0;border-bottom:1px solid var(--line);gap:8px"><span style="flex:1"><b>${a.pinned?'<span class="badge warn">PINNED</span> ':''}${a.batch_id?'<span class="badge">'+esc((ops.batches.find(b=>b.id===a.batch_id)||{name:'batch'}).name)+'</span> ':''}${esc(a.title)}</b><br><span class="muted small">${new Date(a.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}${a.expires_at?' · till '+new Date(a.expires_at).toLocaleDateString('en-IN',{day:'numeric',month:'short'}):''}</span></span><button class="chipbtn" data-andel="${a.id}" type="button">Hatao</button></div>`).join('')}
    </div>
    <div class="card"><h3>Sabse mushkil questions</h3><p class="muted small">Kam se kam 5 attempts wale questions, sabse kam accuracy pehle. Class me discuss karne ke liye.</p>
      ${ops.hard.map(h=>`<div style="padding:7px 0;border-bottom:1px solid var(--line)"><div class="row"><span class="muted small" style="flex:1">${esc(subjName(h.subject_slug))}</span><span class="badge ${h.pct<40?'warn':''}">${h.pct}% · ${h.n} attempts</span></div><div class="small">${esc(h.q)}</div></div>`).join('')||'<p class="muted">Abhi kaafi attempts nahi hain.</p>'}
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
    document.getElementById('aRefresh').onclick=async()=>{setApp('<div class="card center muted">Refreshing…</div>');await refreshStudents();await loadOps();render();};
    document.getElementById('bAdd').onclick=async()=>{const m=document.getElementById('bMsg');const name=document.getElementById('bName').value.trim();if(!name){m.textContent='Naam likho.';return;}
      const subjects=[...document.querySelectorAll('[data-bsub]')].filter(c=>c.checked).map(c=>c.dataset.bsub);
      const{error}=await sb.from('batches').insert({name,subjects});if(error){m.textContent=error.message;return;}await loadOps();render();};
    document.querySelectorAll('[data-bdel]').forEach(b=>b.onclick=async()=>{if(!confirm('Batch hatayein? Students ka apna access nahi badlega, sirf batch se mila access hatega.'))return;await sb.from('batches').delete().eq('id',b.dataset.bdel);await loadOps();render();});
    document.getElementById('csvB').onclick=()=>csvStudents(filteredStudents());
    document.querySelectorAll('[data-dsend]').forEach(b=>b.onclick=async()=>{const id=b.dataset.dsend;const t=document.querySelector('[data-dreply="'+id+'"]').value.trim();if(!t)return;
      const{error}=await sb.from('doubts').update({reply:t,status:'answered',replied_at:new Date().toISOString()}).eq('id',id);if(error){alert(error.message);return;}await loadOps();render();});
    document.querySelectorAll('[data-andel]').forEach(b=>b.onclick=async()=>{if(!confirm('Ye notice hata dein?'))return;await sb.from('announcements').delete().eq('id',b.dataset.andel);await loadOps();render();});
    document.getElementById('anPost').onclick=async()=>{const m=document.getElementById('anMsg');const title=document.getElementById('anTitle').value.trim();if(!title){m.textContent='Title likho.';m.classList.remove('hidden');return;}
      const days=Number(document.getElementById('anDays').value)||0;
      const{error}=await sb.from('announcements').insert({title,body:document.getElementById('anBody').value.trim(),pinned:document.getElementById('anPin').checked,batch_id:document.getElementById('anBatch').value||null,expires_at:days?new Date(Date.now()+days*86400000).toISOString():null});
      if(error){m.textContent=error.message;m.classList.remove('hidden');return;}await loadOps();render();};
    document.getElementById('aSearch').oninput=e=>{q=e.target.value;render();const el=document.getElementById('aSearch');el.focus();el.setSelectionRange(el.value.length,el.value.length);};
    document.querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>{filter=b.dataset.f;sel.clear();render();});
    document.querySelectorAll('[data-chk]').forEach(c=>c.onchange=e=>{e.stopPropagation();const id=c.dataset.chk;c.checked?sel.add(id):sel.delete(id);
      const bb=document.getElementById('bulkBar');bb.classList.toggle('hidden',!sel.size);bb.querySelector('span').textContent=sel.size+' selected';});
    document.querySelectorAll('.urow').forEach(r=>r.onclick=e=>{if(e.target.dataset.chk||e.target.closest('a'))return;detailId=r.dataset.uid;renderDetail();});
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
    const{data:accRow}=await sb.from('student_access').select('subjects').eq('user_id',detailId).maybeSingle();
    const granted=new Set((accRow&&accRow.subjects)||[]);
    const{data:scRow}=await sb.from('profiles').select('access_scope').eq('id',detailId).maybeSingle();const scopeNow=(scRow&&scRow.access_scope)||'all';
    const accTokens=[['Rajasthan',[['rajasthan-gk','Rajasthan GK'],['rajasthan-geography','Rajasthan Geography'],['rajasthan-history','Rajasthan History'],['rajasthan-art-culture','Rajasthan Art & Culture']]],['Subjects',(S.subjects||[]).filter(x=>!/^rajasthan-/.test(x.slug)).map(x=>[x.slug,x.name])],['Notes',[['notes','All Study Notes (PDFs)']]]];
    const u=d.profile,acc=d.answers?Math.round(100*d.correct/d.answers):0;
    const nm=s=>subjName(s);
    setApp(`
    <div class="card"><div class="row"><button class="chipbtn" id="backB" type="button">&lsaquo; Back</button><span class="sp"></span></div>
      <div class="row" style="gap:12px;align-items:center">${avatar(u.display_name,u.email)}<h2 style="margin:0">${esc(u.display_name||'(naam nahi)')}</h2></div>
      <p class="muted">${esc(u.email||'')}<br>Joined ${new Date(u.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short'})} · Last active ${fmtAgo(d.last_active)}</p>
      <p class="mt"><span class="badge ${planStatus(u).c}">${planStatus(u).t}</span>
        ${u.is_paid&&u.paid_until?`<span class="muted small"> valid till ${new Date(u.paid_until).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</span>`:''}
        ${u.trial_used?'<span class="badge">trial used</span>':''}</p>
      <div class="planbox" id="accBox"><p style="margin:0 0 4px"><b>Plan scope</b></p><p class="muted small" style="margin:0 0 6px">Ye sirf PAID plan wale student par lagta hai. Plan ki validity wahi rehti hai.</p><select id="scopeSel" style="width:100%;margin-bottom:10px"><option value="all"${scopeNow==='all'?' selected':''}>ALL courses (plan me sab kuch)</option><option value="sections"${scopeNow==='sections'?' selected':''}>Sirf neeche tick kiye sections + batch</option></select><button class="chipbtn" id="scopeSave" type="button">Scope save</button> <span class="muted small" id="scopeMsg"></span><p style="margin:12px 0 4px"><b>Section access</b></p><p class="muted small" style="margin:0 0 8px">Tick kiye sections is student ke liye poore khulte hain. Agar student ka PAID plan nahi hai, to ye access permanent hai (koi expiry nahi) jab tak tum untick na karo. PAID plan + &quot;Sirf sections&quot; me ye access plan ki expiry par band ho jaata hai.</p>
        ${accTokens.map(g=>`<p class="muted small" style="margin:8px 0 4px">${g[0]}</p><div class="row" style="flex-wrap:wrap;gap:8px">${g[1].map(t=>`<label class="chipbtn ${granted.has(t[0])?'on':''}" style="cursor:pointer;display:inline-flex;gap:6px;align-items:center"><input type="checkbox" data-acc="${t[0]}" ${granted.has(t[0])?'checked':''} style="width:auto;margin:0"> ${esc(t[1])}</label>`).join('')}</div>`).join('')}
        <div class="row" style="gap:8px;margin-top:10px"><button class="btn primary" id="accSave" type="button">Save access</button><span class="muted small" id="accMsg"></span></div></div>
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
    <div class="card"><h3>Batches</h3>${ops.batches.length?`<div class="row" style="flex-wrap:wrap;gap:8px">${ops.batches.map(b=>`<label class="chipbtn ${ops.members.some(m=>m.batch_id===b.id&&m.user_id===u.id)?'on':''}" style="cursor:pointer"><input type="checkbox" data-bm="${b.id}" ${ops.members.some(m=>m.batch_id===b.id&&m.user_id===u.id)?'checked':''} style="margin-right:6px">${esc(b.name)}</label>`).join('')}</div><div class="row mt" style="gap:8px"><button class="btn primary" id="bmSave" type="button">Save batches</button><span class="muted small" id="bmMsg"></span></div>`:'<p class="muted small">Pehle upar Admin page par batch banao.</p>'}</div>
    <div class="card"><h3>Private note</h3><p class="muted small">Sirf admin ko dikhta hai (batch, parent ka number, follow-up).</p><textarea id="snT" rows="3" maxlength="1000" placeholder="Note likho"></textarea><div class="row mt" style="gap:8px"><button class="btn primary" id="snSave" type="button">Save note</button><span class="muted small" id="snMsg"></span></div></div>
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
    document.getElementById('scopeSave').onclick=async()=>{const m=document.getElementById('scopeMsg');m.textContent='Saving...';const v=document.getElementById('scopeSel').value;const{error}=await sb.rpc('admin_set_scope',{p_id:detailId,p_scope:v});m.textContent=error?('Error: '+error.message):(v==='all'?'Saved: ALL courses':'Saved: sirf selected sections');};
    document.querySelectorAll('[data-acc]').forEach(c=>c.onchange=()=>c.closest('label').classList.toggle('on',c.checked));
    document.getElementById('accSave').onclick=async()=>{const subs=[...document.querySelectorAll('[data-acc]')].filter(c=>c.checked).map(c=>c.dataset.acc);const m=document.getElementById('accMsg');m.textContent='Saving...';
      const{error}=await sb.rpc('admin_set_access',{p_id:detailId,p_subjects:subs});m.textContent=error?('Error: '+error.message):('Saved ('+subs.length+' sections)');};
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
    sb.from('student_notes').select('note').eq('user_id',u.id).maybeSingle().then(({data:n})=>{const t=document.getElementById('snT');if(t&&n)t.value=n.note||'';});
    {const bs=document.getElementById('bmSave');if(bs)bs.onclick=async()=>{const m=document.getElementById('bmMsg');
      for(const c of document.querySelectorAll('[data-bm]')){const has=ops.members.some(x=>x.batch_id===c.dataset.bm&&x.user_id===u.id);
        if(c.checked&&!has){const{error}=await sb.from('batch_members').insert({batch_id:c.dataset.bm,user_id:u.id});if(error){m.textContent=error.message;return;}}
        if(!c.checked&&has){const{error}=await sb.from('batch_members').delete().eq('batch_id',c.dataset.bm).eq('user_id',u.id);if(error){m.textContent=error.message;return;}}}
      await loadOps();m.textContent='Saved.';};}
    document.getElementById('snSave').onclick=async()=>{const m=document.getElementById('snMsg');const{error}=await sb.from('student_notes').upsert({user_id:u.id,note:document.getElementById('snT').value,updated_at:new Date().toISOString()});m.textContent=error?error.message:'Saved.';};
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
  if(openId){detailId=openId;renderDetail();}else render();
}

async function route(){const h=location.hash||'#/home';
  if(h.indexOf('type=recovery')>=0){S.recovery=true;vReset();return;}
  const{data}=await sb.auth.getSession();S.session=data.session;
  if(S.recovery){vReset();return;}
  if(!S.session){vLogin();return;}
  {const fresh=Date.now()-(S.entAt||0)<20000;await Promise.all([(S.profile&&fresh)?0:fetchProfile(),fetchSubjects(),importLegacy(),(S.accessOk&&fresh)?0:sb.rpc('my_access').then(r=>{const a=Array.isArray(r.data)?r.data:[];if(JSON.stringify(a)!==JSON.stringify(S.access||[]))S.qcache={};S.access=a;S.accessOk=!r.error;}).catch(()=>{S.access=[];})]);if(!fresh)S.entAt=Date.now();}
  const parts=h.split('/');const view=parts[1],arg=parts[2];
  if(view==='home')return vHome();
  if(view==='subject')return vSubject(arg);
  if(view==='practice')return vPractice(arg,parts[3]);
  if(view==='mocksetup')return vMockSetup(arg);
  if(view==='mockrun')return vMockRun(arg);
  if(view==='mockreview')return vMockReview(arg);
  if(view==='notes')return vNotes(arg);
  if(view==='doubts')return vDoubts();
  if(view==='course')return vCourse(arg);
  if(view==='dashboard')return vDashboard();
  if(view==='admin')return vAdmin(arg==='student'?parts[3]:null);
  return vHome();}
document.getElementById('logoutBtn').onclick=async()=>{await sb.auth.signOut();S.profile=null;S.qcache={};S.access=null;S.accessOk=false;S.notes=null;S.subjects=null;location.hash='#/login';route();};
window.addEventListener('hashchange',route);
setInterval(async()=>{try{
  if(!S.session||document.hidden)return;
  const sig=()=>JSON.stringify([S.profile&&[S.profile.is_paid,S.profile.paid_until,S.profile.access_scope,S.profile.is_admin],S.access||[]]);
  const before=sig();
  await fetchProfile();
  const r=await sb.rpc('my_access');if(!r.error){S.access=Array.isArray(r.data)?r.data:[];S.accessOk=true;}
  S.entAt=Date.now();
  if(sig()!==before){S.qcache={};const v=(location.hash||'#/home').split('/')[1];
    if(['home','subject','mocksetup','notes','course','dashboard'].includes(v))route();}
}catch(e){}},20000);
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
    S.recovery=false;await sb.auth.signOut();S.profile=null;S.qcache={};S.access=null;S.accessOk=false;S.notes=null;setTimeout(()=>{location.hash='#/login';route();},1200);};}
sb.auth.onAuthStateChange((e,s)=>{if(e==='SIGNED_IN'||e==='SIGNED_OUT')S.qcache={};S.session=s;if(e==='PASSWORD_RECOVERY'){S.recovery=true;vReset();}});
route();
})();
