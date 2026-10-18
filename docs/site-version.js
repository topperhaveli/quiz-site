(() => {
'use strict';
const release=document.documentElement.dataset.siteVersion;
function versioned(url,version){url.searchParams.set('v',version);return url.href}
function localPage(url){return url.origin===location.origin&&url.pathname.startsWith(new URL('./',location.href).pathname)&&(!/\.[a-z0-9]+$/i.test(url.pathname)||url.pathname.endsWith('.html'))}
document.addEventListener('click',event=>{const link=event.target.closest('a[href]');if(!link||link.getAttribute('href').startsWith('#'))return;try{const url=new URL(link.href,location.href);if(localPage(url))link.href=versioned(url,release)}catch(e){}},true);
async function check(){try{const response=await fetch('./site-release.json?check='+Date.now(),{cache:'no-store'});if(!response.ok)return;const current=await response.json();if(!/^[a-f0-9]{12}$/.test(current.version)||current.version===release)return;const url=new URL(location.href);if(url.searchParams.get('v')===current.version)return;location.replace(versioned(url,current.version))}catch(e){}}
window.addEventListener('pageshow',check);
})();
