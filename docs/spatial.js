(()=>{'use strict';
// preview only: keep navigation inside the spatial preview pages
const map={'index.html':'spatial-index.html','subject-practice.html':'spatial-subject-practice.html'};
document.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(!a)return;try{const u=new URL(a.href,location.href);if(u.origin!==location.origin)return;const f=u.pathname.split('/').pop()||'index.html';if(map[f]){u.pathname=u.pathname.replace(/[^/]*$/,map[f]);a.href=u.href}}catch(_){}},true);
// subtle 3D tilt on mouse/pen only (skipped on touch for performance)
if(!matchMedia('(hover:hover) and (pointer:fine)').matches||matchMedia('(prefers-reduced-motion:reduce)').matches)return;
let raf=0;
document.addEventListener('pointermove',e=>{const c=e.target.closest&&e.target.closest('.subject');document.querySelectorAll('.subject.sp-tilt').forEach(x=>{if(x!==c){x.classList.remove('sp-tilt');x.style.removeProperty('--rx');x.style.removeProperty('--ry')}});if(!c)return;cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{const r=c.getBoundingClientRect(),px=(e.clientX-r.left)/r.width-.5,py=(e.clientY-r.top)/r.height-.5;c.classList.add('sp-tilt');c.style.setProperty('--ry',(px*8).toFixed(2)+'deg');c.style.setProperty('--rx',(-py*8).toFixed(2)+'deg')})},{passive:true});
})();
