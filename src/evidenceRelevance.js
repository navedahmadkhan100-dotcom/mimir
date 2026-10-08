import { evidenceSupportsConcept } from './ontology.js';

export const EVIDENCE_RELEVANCE_VERSION = '5.0.0-capability-crosslink';

const STOP = new Set(`a an and are as at be been being by can for from has have in into is it its of on or our should that the their them they this to using with within across ability abilities experience experienced expertise strong good excellent knowledge understanding work working role roles responsibility responsibilities required requirement candidate candidates senior lead leader leadership own owned ownership define defined defining design designed designing govern governed governance platform platforms architecture architectures architect architectural system systems solution solutions technical technology technologies enterprise business data ai`.split(/\s+/));

function norm(v='') { return String(v).toLowerCase().replace(/[^a-z0-9+#./-]+/g,' ').replace(/\s+/g,' ').trim(); }
function stem(t='') {
  let s=t.toLowerCase();
  for (const suffix of ['ing','ments','ment','ations','ation','ions','ion','ies','ed','es','s']) {
    if (s.length > suffix.length + 3 && s.endsWith(suffix)) { s=s.slice(0,-suffix.length); break; }
  }
  return s;
}
function tokens(v='') { return [...new Set(norm(v).split(' ').map(stem).filter(t=>t.length>=3 && !STOP.has(t)))]; }
function overlapScore(a,b) {
  const A=new Set(tokens(a)), B=new Set(tokens(b)); if(!A.size||!B.size) return 0;
  let common=0; for(const x of A) if(B.has(x)) common++;
  return common / Math.max(2, Math.min(A.size,B.size));
}

function evidenceText(e={}) { return [e.quote,e.visual_observation,e.career_context,e.role_context,...(e.skills||[]),...(e.capabilities||[])].filter(Boolean).join(' '); }
function requirementText(req={}) { return [req.capability_name,req.text,...(req.target_concepts||[]),...(req.alternatives||[]),...(req.evidence_equivalents||[])].filter(Boolean).join(' '); }

export function evidenceRelevanceScore(req={}, evidence={}) {
  const concepts=[req.capability_name,...(req.target_concepts||[]),...(req.alternatives||[]),...(req.evidence_equivalents||[])].filter(Boolean);
  for (const c of concepts) {
    if (evidenceSupportsConcept(evidence,c,'transferable')) return 1;
    const cNorm=norm(c); const eNorm=norm(evidenceText(evidence));
    if (cNorm.length>=5 && eNorm.includes(cNorm)) return 1;
  }
  const score=overlapScore(requirementText(req), evidenceText(evidence));
  // Two meaningful capability terms are usually enough to cross-link evidence,
  // but a one-token generic overlap should not establish relevance.
  return Math.min(0.95, score);
}

export function relevantEvidence(req={}, evidenceItems=[], { threshold=0.34, limit=8 }={}) {
  return (evidenceItems||[])
    .map(e=>({ evidence:e, relevance:evidenceRelevanceScore(req,e) }))
    .filter(x=>x.relevance>=threshold)
    .sort((a,b)=>b.relevance-a.relevance || String(a.evidence.id||'').localeCompare(String(b.evidence.id||'')))
    .slice(0,limit);
}

export function unionRelevantEvidenceIds(req={}, match={}, evidenceItems=[], options={}) {
  const ids=new Set(match.evidence_ids||[]);
  for(const {evidence} of relevantEvidence(req,evidenceItems,options)) ids.add(evidence.id);
  return [...ids];
}
