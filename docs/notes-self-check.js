(() => {
'use strict';
const form=document.getElementById('quizform'),result=document.getElementById('result');if(!form||!result)return;
result.hidden=true;
const key='jvvnl-notes-self-check-'+location.pathname.split('/').pop()+'-v1';let saved={};
try{const state=JSON.parse(localStorage.getItem(key)||'{}');if(state&&typeof state==='object')saved=state}catch(e){}
const inputs=[...form.querySelectorAll('input[type="radio"]')];
inputs.forEach(input=>{input.checked=saved[input.name]===input.value});
function save(){const data={};inputs.forEach(input=>{if(input.checked)data[input.name]=input.value});try{localStorage.setItem(key,JSON.stringify(data))}catch(e){}result.replaceChildren();result.hidden=true}
let checkedBefore=null;
form.addEventListener('pointerdown',event=>{const input=event.target.closest('input[type="radio"]')||event.target.closest('label')?.querySelector('input[type="radio"]');checkedBefore=input?.checked?input:null});
form.addEventListener('keydown',event=>{if(event.key===' '&&event.target.matches('input[type="radio"]'))checkedBefore=event.target.checked?event.target:null});
form.addEventListener('click',event=>{if(!event.target.matches('input[type="radio"]'))return;if(checkedBefore===event.target)event.target.checked=false;checkedBefore=null;save()});
form.addEventListener('change',save);
form.addEventListener('click',event=>{if(event.target.closest('button[onclick]'))result.hidden=false});
const clear=document.createElement('button');clear.type='button';clear.className='btn';clear.textContent='Clear answers / retry';clear.style.margin='8px';clear.onclick=()=>{inputs.forEach(input=>input.checked=false);save()};form.after(clear);
const note=document.createElement('p');note.className='muted';note.textContent='Answers saved on this device. Tap a selected option again to deselect it.';clear.after(note);
})();
