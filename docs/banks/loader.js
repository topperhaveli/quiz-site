// Per-subject question-bank loader: loads banks/<slug>.js on demand and caches it.
(function(){
 window.JVVNL_BANK_LOADER={
  cache:{},
  loadSubject:function(slug){
   var self=this;
   if(self.cache[slug])return self.cache[slug];
   self.cache[slug]=new Promise(function(resolve,reject){
    if(window.JVVNL_BANKS&&window.JVVNL_BANKS[slug]){resolve(window.JVVNL_BANKS[slug]);return;}
    var s=document.createElement('script');
    s.src='./banks/'+slug+'.js'+(document.documentElement.dataset.siteVersion?('?v='+document.documentElement.dataset.siteVersion):'');
    s.onload=function(){if(window.JVVNL_BANKS&&window.JVVNL_BANKS[slug]){resolve(window.JVVNL_BANKS[slug]);}else{reject(new Error('bank missing: '+slug));}};
    s.onerror=function(){reject(new Error('bank load failed: '+slug));};
    document.head.appendChild(s);
   });
   return self.cache[slug];
  }
 };
})();
