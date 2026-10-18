(() => {
'use strict';
const url=new URL(location.href),name=url.pathname.split('/').pop(),subject=url.searchParams.get('subject');
const aliases={'cost-accounting-practice':['cost-accounting','legacy-cost-core'],'cost-accounting-pyq':['cost-accounting','legacy-cost-pyq'],'advanced-cost-accounting':['cost-accounting','legacy-cost-advanced'],'cost-management-audit':['auditing','legacy-cost-audit'],'auditing':['auditing','all'],'cost-accounting':['cost-accounting','all'],'management-accounting':['management-accounting','all'],'computer-applications':['computer-awareness','shared'],'computer-awareness':['computer-awareness','all'],'income-tax':['income-tax','all'],'gst-taxation':['gst-taxation','all'],'corporate-accounting':['corporate-accounting','all'],'financial-accounting':['financial-accounting','all'],'accounting':['accounting','all']};
const pages={'management-accounting-question-bank.html':['management-accounting','deep-management'],'computer-awareness-question-bank.html':['computer-awareness','deep-computer'],'gst-question-bank.html':['gst-taxation','deep-gst'],'income-tax-question-bank.html':['income-tax','deep-income-tax'],'accounting-mcq-practice.html':['accounting','all']};
let route=pages[name]||null;
if(name==='cost-accounting.html')route=['cost-accounting','deep-cost'];
else if(name==='auditing.html')route=['auditing','all'];
else if(name==='practice.html'&&aliases[subject])route=aliases[subject];
if(!route)return;
const target=new URL('./subject-practice.html',location.href);target.search=url.search;target.searchParams.set('subject',route[0]);if(!target.searchParams.has('source'))target.searchParams.set('source',route[1]);target.hash=url.hash;location.replace(target.href);
})();
