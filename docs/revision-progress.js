(() => {
'use strict';
window.JVVNL_REVISIONS={
 archive(state,q,selected,signature,reason){state.revisionAttempts=state.revisionAttempts||[];state.revisionAttempts.push({questionId:q.id,selected,contentSignature:signature||null,revision:q.revisionHistory?.find(r=>r.contentSignature===signature)?.revision||'original-or-unversioned',questionSnapshot:q.revisionHistory?.find(r=>r.contentSignature===signature)||(!signature?q.revisionHistory?.[0]:null)||null,reason,archivedAt:new Date().toISOString()})},
 migrate(state,bank){state.answerSignatures=state.answerSignatures||{};let count=0;const map=new Map(bank.questions.map(q=>[q.id,q]));Object.keys(state.answers).forEach(id=>{const q=map.get(id);if(!q)return;const signature=state.answerSignatures[id];if((signature&&signature!==q.contentSignature)||(!signature&&q.revisionChanged)){this.archive(state,q,state.answers[id],signature,'Question content revised');delete state.answers[id];delete state.answerSignatures[id];count++}else state.answerSignatures[id]=q.contentSignature});return count},
 stamp(state,bank){state.answerSignatures=state.answerSignatures||{};bank.questions.forEach(q=>{if(state.answers[q.id]!==undefined)state.answerSignatures[q.id]=q.contentSignature;else delete state.answerSignatures[q.id]})},
 importAnswer(state,q,selected,signature){if((signature&&signature!==q.contentSignature)||(!signature&&q.revisionChanged)){this.archive(state,q,selected,signature,'Imported backup refers to old or unversioned revised content');return false}state.answers[q.id]=selected;state.answerSignatures=state.answerSignatures||{};state.answerSignatures[q.id]=q.contentSignature;return true}
};
})();
