import { conceptSurfaceForms } from './ontology.js';

function pageForTextQuote(maskedCv, quote) {
  const q=String(quote||'').replace(/\s+/g,' ').trim(); if(!q) return null;
  const source=String(maskedCv||''); const matches=[...source.matchAll(/\[PAGE\s+(\d+)\]\s*/gi)];
  if(!matches.length) return null;
  for(let i=0;i<matches.length;i++){
    const start=matches[i].index+matches[i][0].length; const end=i+1<matches.length?matches[i+1].index:source.length;
    const pageText=source.slice(start,end).replace(/\s+/g,' ').trim();
    if(pageText.includes(q)) return Number(matches[i][1]);
  }
  return null;
}

const RECOVERY_ACTION_RE = /\b(?:own(?:ed|s|ing)?|accountable|responsible\s+for|lead|led|headed|directed|architect(?:ed|ing)?|design(?:ed|ing)?|define(?:d|s|ing)?|establish(?:ed|es|ing)?|govern(?:ed|s|ing)?|orchestrate(?:d|s|ing)?|implement(?:ed|s|ing)?|build|built|develop(?:ed|s|ing)?|deploy(?:ed|s|ing)?|integrat(?:e|ed|es|ing)|deliver(?:ed|s|ing)?|scale(?:d|s|ing)?|manage(?:d|s|ing)?)\b/i;
const RECOVERY_OWNERSHIP_RE = /\b(?:own(?:ed|s|ing)?|ownership|accountable|responsible\s+for|led|headed|directed|architect(?:ed|ing)?|design(?:ed|ing)?|define(?:d|s|ing)?|establish(?:ed|es|ing)?|govern(?:ed|s|ing)?|orchestrate(?:d|s|ing)?)\b/i;
const EXPLICIT_SCALE_RE = /\b(?:enterprise[-\s]?wide|organisation[-\s]?wide|organization[-\s]?wide|global(?:ly)?|large[-\s]?scale|at\s+scale|multi[-\s]?(?:country|region|site|tenant)|international\s+24\/7|\d{2,}[,+]?\s*(?:users?|devices?|endpoints?|servers?|sites?|employees?|fte|tenants?|applications?|workloads?|countries?|regions?|teams?))\b/i;
const RECOVERY_STOP = new Set('a an and are as at be been being by for from has have in into is it its of on or that the their this to using with within across candidate required requirement role roles strong experience senior'.split(/\s+/));

function recoveryTokens(value='') {
  return [...new Set(String(value).toLowerCase().replace(/[^a-z0-9+#./-]+/g,' ').split(/\s+/).filter(t => t.length >= 2 && !RECOVERY_STOP.has(t)))];
}
function recoveryConcepts(req={}) {
  return [...new Set([req.capability_name, req.text, ...(req.target_concepts||[]), ...(req.alternatives||[]), ...(req.evidence_equivalents||[])].filter(Boolean).map(String))];
}
function sectionContextAt(source, index) {
  const before=String(source||'').slice(0,Math.max(0,index)).toLowerCase();
  const anchors=[
    ['employment_reference', Math.max(before.lastIndexOf('employment reference'),before.lastIndexOf('arbeitszeugnis'),before.lastIndexOf('\nzeugnis'))],
    ['education', Math.max(before.lastIndexOf('education'),before.lastIndexOf('academic background'))],
    ['skills_inventory', Math.max(before.lastIndexOf('appendix:'),before.lastIndexOf('technical skills'),before.lastIndexOf('core skills'),before.lastIndexOf('skills &'))],
    ['role_project', Math.max(before.lastIndexOf('professional experience'),before.lastIndexOf('employment history'),before.lastIndexOf('work experience'),before.lastIndexOf('career history'))],
    ['professional_summary', Math.max(before.lastIndexOf('professional profile'),before.lastIndexOf('professional summary'),before.lastIndexOf('my value'),before.lastIndexOf('contribution to'))],
  ].filter(([,pos])=>pos>=0).sort((a,b)=>b[1]-a[1]);
  return anchors[0]?.[0] || 'professional_summary';
}
function recoveryDepth(quote='') {
  if (/\b(?:owned|ownership|accountable|responsible\s+for)\b/i.test(quote)) return 'owned';
  if (/\b(?:led|lead|headed|directed|architected|design(?:ed|ing)?|define(?:d|s|ing)?|establish(?:ed|es|ing)?|govern(?:ed|s|ing)?|orchestrate(?:d|s|ing)?)\b/i.test(quote)) return 'led';
  if (/\b(?:implemented|built|developed|deployed|integrated|delivered|scaled|operated)\b/i.test(quote)) return 'used';
  return 'mentioned';
}
function textWindows(source='') {
  const raw=String(source).split(/\r?\n/);
  const pages=[]; let current=[];
  for(const line of raw){
    const text=line.trim();
    if(/^\[PAGE\s+\d+\]$/i.test(text)){ if(current.length) pages.push(current); current=[]; continue; }
    if(text) current.push(text);
  }
  if(current.length) pages.push(current);
  const out=[]; const seen=new Set(); let searchFrom=0;
  for(const lines of pages){
    for(let i=0;i<lines.length;i++){
      for(let width=1;width<=3;width++){
        const chunk=lines.slice(i,i+width).join(' ').replace(/\s+/g,' ').trim();
        if(chunk.length<25 || chunk.length>650 || seen.has(chunk)) continue;
        const pos=String(source).indexOf(lines[i],searchFrom); const index=pos>=0?pos:String(source).indexOf(lines[i]);
        seen.add(chunk); out.push({quote:chunk,index:Math.max(0,index)});
      }
      const next=String(source).indexOf(lines[i],searchFrom); if(next>=0) searchFrom=next+lines[i].length;
    }
  }
  return out;
}
function textRecoveryScore(req, quote, contextType, hintText='') {
  const concepts=recoveryConcepts(req); const q=String(quote||'').toLowerCase();
  let exact=0;
  for(const concept of concepts){
    const forms=conceptSurfaceForms(concept);
    if(forms.some(f=>f && q.includes(String(f).toLowerCase()))) exact=Math.max(exact,3.5);
  }
  const reqTokens=new Set(recoveryTokens(concepts.join(' '))); const quoteTokens=new Set(recoveryTokens(quote));
  let overlap=0; for(const t of reqTokens) if(quoteTokens.has(t)) overlap++;
  const hintTokens=new Set(recoveryTokens(hintText)); let hintOverlap=0; for(const t of hintTokens) if(quoteTokens.has(t)) hintOverlap++;
  // Model reasoning/visual observations are retrieval hints only. They can help
  // locate the underlying CV sentence, but never become evidence themselves.
  let score=exact + Math.min(4,overlap*0.85) + Math.min(2.2,hintOverlap*0.35);
  if(RECOVERY_ACTION_RE.test(quote)) score+=0.8;
  if(['role_project','employment_reference'].includes(contextType)) score+=1.1;
  else if(contextType==='professional_summary') score+=0.35;
  return score;
}
function matchedRecoveryCapabilities(req, quote) {
  const q=String(quote||'').toLowerCase(); const found=[];
  for(const concept of recoveryConcepts(req)){
    if(conceptSurfaceForms(concept).some(f=>f && q.includes(String(f).toLowerCase()))) found.push(concept);
  }
  if(found.length) return [...new Set(found)].slice(0,10);
  const reqTokens=new Set(recoveryTokens(recoveryConcepts(req).join(' '))); const qTokens=new Set(recoveryTokens(quote));
  const common=[...reqTokens].filter(t=>qTokens.has(t));
  return common.length>=2 ? [req.capability_name || req.text].filter(Boolean) : [];
}

// A rendered CV page often contains the same selectable text that is already in
// maskedCv. If Gemini cites only the rendered page, ownership becomes impossible
// to prove by policy. Recover the exact masked text deterministically before claim
// entailment/scoring. This never invents evidence: every recovered quote is copied
// verbatim from the server-masked CV.
export function recoverTextFirstEvidence(result, maskedCv) {
  const source=String(maskedCv||''); if(!source.trim()) return result;
  const windows=textWindows(source); if(!windows.length) return result;
  const reqMap=new Map((result.structured_jd?.requirements||[]).map(r=>[r.id,r]));
  const evidence=[...(result.evidence||[])]; const evidenceMap=new Map(evidence.map(e=>[e.id,e]));
  let counter=1; const ids=new Set(evidence.map(e=>e.id)); while(ids.has(`T${counter}`)) counter++;

  const matches=(result.matches||[]).map(match=>{
    const req=reqMap.get(match.requirement_id); if(!req) return match;
    const referenced=(match.evidence_ids||[]).map(id=>evidenceMap.get(id)).filter(Boolean);
    const hasText=referenced.some(e=>e.source_type==='text' && String(e.quote||'').trim());
    if(hasText) return match;
    const visualHints=referenced.filter(e=>e.source_type==='visual').map(e=>e.visual_observation||'').join(' ');
    const hintText=[match.reason,visualHints,...(match.inference_path||[]).flatMap(p=>[p.from,p.to])].filter(Boolean).join(' ');
    const ranked=windows.map(w=>{
      const context=sectionContextAt(source,w.index); return {...w,context,score:textRecoveryScore(req,w.quote,context,hintText)};
    }).filter(x=>x.score>=3.4).sort((a,b)=>b.score-a.score || ({role_project:4,employment_reference:4,professional_summary:3,certification:2,education:2,skills_inventory:1}[b.context]||0)-({role_project:4,employment_reference:4,professional_summary:3,certification:2,education:2,skills_inventory:1}[a.context]||0));
    const candidates=[];
    for(const item of ranked){
      const caps=matchedRecoveryCapabilities(req,item.quote); if(!caps.length) continue;
      if(candidates.some(x=>x.quote.includes(item.quote) || item.quote.includes(x.quote))) continue;
      candidates.push({...item,capabilities:caps});
    }
    // Preserve source diversity: one excellent profile statement must not crowd
    // out a slightly less lexically similar role/project quote that proves action
    // and ownership. Take the best candidate per evidence context first.
    const bestByContext=new Map();
    for(const item of candidates) if(!bestByContext.has(item.context)) bestByContext.set(item.context,item);
    const selected=[...bestByContext.values()].sort((a,b)=>b.score-a.score).slice(0,3);
    for(const item of candidates){
      if(selected.length>=3) break;
      if(selected.some(x=>x.quote===item.quote)) continue;
      selected.push(item);
    }
    if(!selected.length) return match;

    const recoveredIds=[];
    for(const item of selected){
      const id=`T${counter++}`; ids.add(id); recoveredIds.push(id);
      const ev={
        id,source_type:'text',quote:item.quote,visual_asset_id:null,visual_observation:'',source_page:pageForTextQuote(source,item.quote),
        source_hint:'deterministic text-first recovery',skills:[],capabilities:item.capabilities,depth:recoveryDepth(item.quote),recency_year:null,duration_months:null,
        career_context:item.context==='role_project'?'Professional experience evidence recovered from masked CV text.':'CV text evidence recovered from masked document.',
        project_key:'',role_context:'',lifecycle_phases:[],evidence_context_type:item.context,
      };
      evidence.push(ev); evidenceMap.set(id,ev);
    }
    const strongContext=selected.some(x=>['role_project','employment_reference'].includes(x.context));
    let supportState=match.support_state;
    if(['missing','unsettled'].includes(supportState) && ['direct','canonical','equivalent','implied','functional'].includes(match.relation)) supportState=strongContext?'documented':'listed';
    const allIds=[...new Set([...recoveredIds,...(match.evidence_ids||[])])].slice(0,10);
    const dimension_support=(match.dimension_support||[]).map(d=>{
      const current=(d.evidence_ids||[]).map(id=>evidenceMap.get(id)).filter(Boolean);
      if(current.some(e=>e.source_type==='text')) return d;
      let candidates=recoveredIds;
      if(d.dimension==='responsibility') candidates=recoveredIds.filter(id=>RECOVERY_OWNERSHIP_RE.test(evidenceMap.get(id)?.quote||''));
      if(d.dimension==='scale') candidates=recoveredIds.filter(id=>EXPLICIT_SCALE_RE.test(evidenceMap.get(id)?.quote||''));
      if(!candidates.length) return d;
      const nextState=['missing','unsettled'].includes(d.support_state)?(strongContext?'documented':'listed'):d.support_state;
      return {...d,evidence_ids:[...new Set([...candidates,...(d.evidence_ids||[])])].slice(0,10),support_state:nextState,reason:d.reason||'Supported by verified masked CV text recovered from the same candidate document.'};
    });
    return {...match,evidence_ids:allIds,support_state:supportState,dimension_support,evidence_context_type:strongContext?'role_project':(selected[0]?.context||match.evidence_context_type)};
  });
  return {...result,evidence,matches};
}

