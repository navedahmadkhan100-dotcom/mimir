import { unionRelevantEvidenceIds, relevantEvidence } from './evidenceRelevance.js';
import { evidenceSupportsConcept, strongestOntologyRelation, RELATION_RANK } from './ontology.js';

export const DIMENSION_ENGINE_VERSION = '6.0.0-qualification-evidence-dimensions';

export const DIMENSION_ENUM = Object.freeze([
  'capability','responsibility','context','scale','exactness','lifecycle','duration','count','recency',
]);

const IMPORTANCE_WEIGHT = Object.freeze({ decisive:4, high:3, medium:2, supporting:1 });
const RELATION_POINTS = Object.freeze({ direct:100, canonical:98, equivalent:95, implied:84, functional:80, transferable:62, adjacent:35, none:0 });
const ACTION_LEVEL_REQUIRED = Object.freeze({ own:5, lead:5, execute:4, coordinate:3, support:2, knowledge:0, unspecified:0 });
const SCALE_REQ_RE=/\b(?:enterprise[-\s]?wide|organisation[-\s]?wide|organization[-\s]?wide|global(?:ly)?|large[-\s]?scale|multi[-\s]?(?:country|region|site|tenant)|at\s+scale|across\s+\d+\s+(?:countries|regions|sites|tenants)|\d{2,}(?:,\d{3})*\+?\s*(?:(?:enterprise|global|international)\s+)?(?:users?|devices?|endpoints?|servers?|sites?|employees?|fte|tenants?|applications?|workloads?|countries?|regions?|teams?))\b/i;
const OWN_RE=/\b(?:own(?:ed|ership)?|accountable|final\s+authority|responsible\s+for|define\s+and\s+own)\b/i;
const LEAD_RE=/\b(?:lead|led|leadership|architect|design|govern|drive|direct|head(?:ed)?)\b/i;
const EXEC_RE=/\b(?:implement|build|develop|deploy|configure|engineer|execute|write|author|create|migrate|test|validate)\b/i;
const COORD_RE=/\b(?:coordinate|collaborate|partner|liaise|facilitate|manage\s+stakeholder)\b/i;
const RECENCY_REQ_RE=/\b(?:recent|recently|current|currently|latest|up[-\s]?to[-\s]?date|within\s+the\s+last\s+\d+\s+years?|past\s+\d+\s+years?)\b/i;

const AUTHOR_REQ_RE=/\b(?:write|writing|wrote|author|draft|document|produce|create)\b/i;
const AUTHOR_EVID_RE=/\b(?:wrote|written|writing|authored|drafted|documented|produced|created|developed)\b/i;
const DESIGN_REQ_RE=/\b(?:design|architect|define\s+(?:the\s+)?(?:architecture|strategy|roadmap)|blueprint)\b/i;
const DESIGN_EVID_RE=/\b(?:designed|architected|defined|blueprinted|established\s+(?:the\s+)?architecture)\b/i;
const BUILD_REQ_RE=/\b(?:build|implement|configure|develop|deploy|migrate|engineer)\b/i;
const BUILD_EVID_RE=/\b(?:built|implemented|configured|developed|deployed|migrated|engineered|designed|architected|established)\b/i;
const TEST_REQ_RE=/\b(?:testing|tested|validate|validation)\b/i;
const TEST_EVID_RE=/\b(?:tested|testing|validated|validation|qa|quality\s+assurance)\b/i;

function clamp(v,min=0,max=100){ return Math.max(min,Math.min(max,v)); }
function round(v,d=2){ return Number(Number(v||0).toFixed(d)); }
function uniq(items=[]){ return [...new Set(items.filter(Boolean))]; }
function textOf(e={}){ return `${e.quote||''} ${e.visual_observation||''}`.trim(); }

const SOURCE_AUTHORITY = Object.freeze({
  role_project:{capability:100,responsibility:100,scale:100,recency:100},
  employment_reference:{capability:100,responsibility:100,scale:100,recency:100},
  certification:{capability:96,responsibility:45,scale:55,recency:95},
  education:{capability:90,responsibility:50,scale:50,recency:90},
  professional_summary:{capability:90,responsibility:82,scale:82,recency:90},
  skills_inventory:{capability:72,responsibility:35,scale:40,recency:70},
  visual:{capability:70,responsibility:0,scale:65,recency:70},
  unknown:{capability:100,responsibility:100,scale:100,recency:100},
});

function sourceAuthorityCap(evidenceIds=[], evidence=[], dimension='capability') {
  const map=new Map((evidence||[]).map(e=>[e.id,e]));
  const contexts=[...new Set((evidenceIds||[]).map(id=>map.get(id)?.evidence_context_type).filter(Boolean))];
  if(!contexts.length || contexts.includes('unknown')) return 100;
  return Math.max(...contexts.map(c=>SOURCE_AUTHORITY[c]?.[dimension] ?? 100));
}

function inferResponsibilityLevel(req={}) {
  if (req.responsibility_level && req.responsibility_level !== 'unspecified') return req.responsibility_level;
  const text=String(req.text||'');
  if (OWN_RE.test(text)) return 'own';
  if (LEAD_RE.test(text)) return 'lead';
  if (EXEC_RE.test(text)) return 'execute';
  if (COORD_RE.test(text)) return 'coordinate';
  return 'unspecified';
}

/**
 * Dimensions are activated deterministically from the JD.  Gemini may annotate
 * importance, but it cannot invent a scale/duration/count/recency requirement.
 */
export function deriveRequirementDimensions(req={}) {
  const modelByName=new Map((req.evaluation_dimensions||[]).filter(d=>DIMENSION_ENUM.includes(d?.dimension)).map(d=>[d.dimension,d]));
  const rows=[];
  const add=(dimension,importance='medium',critical=false,description='')=>{
    const model=modelByName.get(dimension);
    rows.push({
      dimension,
      importance:model && ['decisive','high','medium','supporting'].includes(model.importance) ? model.importance : importance,
      critical: critical || Boolean(model?.critical && ['capability','responsibility','exactness','lifecycle','duration','count'].includes(dimension)),
      description:String(model?.description || description || ''),
      source:model?'jd_model_bounded':'deterministic_jd',
    });
  };

  add('capability','decisive',true,'The qualification itself must be evidenced.');
  const level=inferResponsibilityLevel(req);
  if (level !== 'unspecified' && level !== 'knowledge') add('responsibility', ['own','lead'].includes(level)?'decisive':'high', ['own','lead'].includes(level), `Required responsibility level: ${level}.`);
  if ((req.required_role_context||[]).length || !['not_applicable','unknown',undefined,null,''].includes(req.deployment_model) || req.category==='domain') add('context','high',false,'Required role/domain/deployment context.');
  if (SCALE_REQ_RE.test(String(req.text||''))) add('scale','medium',false,'The JD explicitly requires magnitude or organisational scale.');
  if (req.strictness==='exact_required' || ['exact_technology','credential','methodology'].includes(req.requirement_type)) add('exactness','decisive',true,'The JD explicitly requires an exact technology, method or credential.');
  if (req.lifecycle_scope==='end_to_end') add('lifecycle','high',true,'End-to-end lifecycle coverage is explicit.');
  if (Number(req.minimum_years)>0) add('duration','high',true,`Minimum ${req.minimum_years} years required.`);
  if (Number(req.minimum_count)>0) add('count','high',true,`Minimum ${req.minimum_count} distinct ${req.count_unit||'instances'} required.`);
  if (RECENCY_REQ_RE.test(String(req.text||''))) add('recency','high',false,'The JD explicitly asks for recent/current experience.');
  return rows;
}

function relevantBundle(req,match,evidence){
  const ids=unionRelevantEvidenceIds(req,match,evidence,{threshold:.34,limit:12});
  const map=new Map((evidence||[]).map(e=>[e.id,e]));
  return { ids, items:ids.map(id=>map.get(id)).filter(Boolean) };
}

function actionCompatibilityCap(req={}, items=[]) {
  const requirement=String(req.text||'');
  const combined=items.map(textOf).join(' ');
  if (!combined) return 100;
  if (AUTHOR_REQ_RE.test(requirement) && !AUTHOR_EVID_RE.test(combined)) return 55;
  if (DESIGN_REQ_RE.test(requirement) && !DESIGN_EVID_RE.test(combined)) return 70;
  if (BUILD_REQ_RE.test(requirement) && !BUILD_EVID_RE.test(combined)) return 68;
  if (TEST_REQ_RE.test(requirement) && !TEST_EVID_RE.test(combined)) return 60;
  return 100;
}

function capabilityScore(req={},match={},evidence=[]){
  const {ids,items}=relevantBundle(req,match,evidence);
  if(!items.length) return {score:0,evidence_ids:[],reason:'No verified evidence is relevant to this qualification.'};

  const graph=strongestOntologyRelation(req,items);
  const modelRelation=match?.relation || 'none';
  const relation=(RELATION_RANK[graph.relation]||0) > (RELATION_RANK[modelRelation]||0) ? graph.relation : modelRelation;
  let score=RELATION_POINTS[relation]??0;

  // If the provider under-labelled a verified relevant passage as "none", use
  // deterministic relevance as a conservative backstop rather than turning the
  // qualification into zero evidence.
  if(score===0){
    const rels=relevantEvidence(req,items,{threshold:.34,limit:12});
    const top=rels[0]?.relevance||0;
    if(top>=.8) score=84;
    else if(top>=.55) score=74;
    else if(top>=.34) score=60;
  }

  if(req.requirement_logic==='all_of'){
    const targets=[...new Set([...(req.target_concepts||[]),...(req.alternatives||[])].filter(Boolean))];
    if(targets.length>1){
      const matched=targets.filter(t=>items.some(e=>evidenceSupportsConcept(e,t,'equivalent')));
      const coverage=matched.length/targets.length;
      score=Math.min(score,Math.round(15+85*coverage));
    }
  }

  score=Math.min(score,sourceAuthorityCap(ids,evidence,'capability'));
  score=Math.min(score,actionCompatibilityCap(req,items));
  return {score,evidence_ids:ids,reason:`Qualification capability derived from verified evidence relevance and ${relation||'none'} semantic relationship.`};
}

function responsibilityScore(req,match,evidence,evidenceSemantics){
  const level=inferResponsibilityLevel(req); if(level==='unspecified') return null;
  if(level==='knowledge') return {score:(match?.evidence_ids||[]).length?100:0,evidence_ids:match?.evidence_ids||[],reason:'Knowledge requirement.'};
  const {ids}=relevantBundle(req,match,evidence);
  const semMap=new Map((evidenceSemantics||[]).map(s=>[s.evidence_id,s]));
  const evMap=new Map((evidence||[]).map(e=>[e.id,e]));
  let best=0; let why=`Required ${level} responsibility is not established.`;
  for(const id of ids){
    const s=semMap.get(id); if(!s) continue;
    const action=Number(s.strongest_action?.level||0); const ownership=s.ownership||'unestablished';
    const raw=textOf(evMap.get(id));
    let score=0;
    if(level==='own'){
      if(ownership==='direct' && action>=5) score=100;
      else if(ownership==='shared' && action>=5) score=84;
      else if(ownership==='direct' && action>=4) score=74;
      else if(ownership==='contextual') score=42;
    } else if(level==='lead'){
      if(ownership==='direct' && action>=5) score=100;
      else if(ownership==='shared' && action>=5) score=90;
      else if(action>=6) score=88;
      else if(action>=4) score=72;
      else if(action>=3) score=58;
    } else if(level==='execute'){
      const concrete=BUILD_EVID_RE.test(raw)||AUTHOR_EVID_RE.test(raw)||TEST_EVID_RE.test(raw)||DESIGN_EVID_RE.test(raw);
      if(concrete && action>=4) score=100;
      else if(concrete && action>=3) score=82;
      else if(action>=5) score=60; // oversight/leadership alone is not proof of execution
      else if(action===3) score=65;
      else if(action===2) score=45;
    } else if(level==='coordinate'){
      if(action>=5 || ownership==='shared') score=100;
      else if(action>=3) score=88;
      else if(action===2) score=70;
      else if(action===1) score=45;
    } else if(level==='support'){
      if(action>=2) score=100; else if(action===1) score=70;
    }
    const sourceCap=SOURCE_AUTHORITY[s.evidence_context_type||'unknown']?.responsibility ?? 100;
    score=Math.min(score,sourceCap);
    if(score>best){best=score;why=`${level} responsibility assessed from ${s.strongest_action?.type||'unknown'} action with ${ownership} ownership.`;}
  }
  return {score:best,evidence_ids:ids,reason:why,required_level:level};
}

function contextScore(req,match,evidence){
  const {ids}=relevantBundle(req,match,evidence);
  let scores=[];
  if((req.required_role_context||[]).length){
    for(const i of match?.qualifying_instances||[]) scores.push({exact:100,equivalent:92,related:62,none:0,unknown:35}[i.role_alignment]??35);
  }
  if(req.deployment_model && !['not_applicable','unknown'].includes(req.deployment_model)){
    for(const i of match?.qualifying_instances||[]) scores.push(i.deployment_model===req.deployment_model?100:i.deployment_model==='unknown'?35:20);
  }
  if(!scores.length) return {score:ids.length?85:0,evidence_ids:ids,reason:'Context is supported by the same verified role/project evidence.'};
  return {score:Math.max(...scores),evidence_ids:ids,reason:'Context assessed from explicit role/deployment alignment.'};
}

function scaleScore(req,match,evidence,evidenceSemantics){
  const {ids}=relevantBundle(req,match,evidence);
  const semMap=new Map((evidenceSemantics||[]).map(s=>[s.evidence_id,s]));
  const direct=ids.some(id=>(semMap.get(id)?.scale||[]).length>0);
  let score=direct?100:0;
  score=Math.min(score,sourceAuthorityCap(ids,evidence,'scale'));
  return {score,evidence_ids:ids,reason:direct?'Verified evidence contains an explicit magnitude/organisational scale signal.':'No explicit scale signal established.'};
}

function exactnessScore(match={}){
  const map={direct:100,canonical:98,equivalent:95,implied:65,functional:45,transferable:30,adjacent:10,none:0};
  return {score:map[match.relation]??0,evidence_ids:match.evidence_ids||[],reason:`Exactness derived from ${match.relation||'none'} relationship.`};
}

function lifecycleScore(match={}){
  const phases=new Set([...(match.lifecycle_phases||[])]); for(const i of match.qualifying_instances||[]) for(const p of i.lifecycle_phases||[]) phases.add(p);
  const groups=[['discovery','assessment','requirements','blueprint_design'],['build_config','integration','data_migration'],['testing'],['cutover','go_live'],['hypercare_stabilisation','operations']];
  const covered=groups.filter(g=>g.some(p=>phases.has(p))).length; const score=Math.round(100*covered/groups.length);
  return {score,evidence_ids:match.evidence_ids||[],reason:`${covered}/${groups.length} lifecycle capability groups are evidenced.`,phases:[...phases]};
}

function durationScore(req,match,evidence){
  const evMap=new Map((evidence||[]).map(e=>[e.id,e]));
  const groups=new Map();
  for(const id of new Set(unionRelevantEvidenceIds(req,match,evidence,{threshold:.34,limit:15}))){
    const e=evMap.get(id); if(!e) continue;
    const m=Number(e.duration_months); if(!Number.isFinite(m)||m<=0) continue;
    const stable=String(e.project_key||'').trim(); const contextual=[e.career_context,e.role_context].filter(Boolean).join('|').trim();
    const k=stable||contextual||`evidence:${id}`; groups.set(k,Math.max(groups.get(k)||0,m));
  }
  const months=[...groups.values()].reduce((a,b)=>a+b,0);
  if(!months) return {score:(match.evidence_ids||[]).length?65:0,evidence_ids:match.evidence_ids||[],reason:'Relevant experience exists, but duration is not quantified.'};
  return {score:clamp(Math.round(100*months/(Number(req.minimum_years)*12))),evidence_ids:match.evidence_ids||[],reason:`${months} de-duplicated months against ${req.minimum_years} years required.`};
}

function recencyScore(req,match,evidence,referenceYear){
  const ids=unionRelevantEvidenceIds(req,match,evidence,{threshold:.34,limit:10});
  const map=new Map((evidence||[]).map(e=>[e.id,e])); const years=ids.map(id=>Number(map.get(id)?.recency_year)).filter(Number.isFinite);
  if(!years.length || !Number.isInteger(referenceYear)) return {score:65,evidence_ids:ids,reason:'Relevant evidence exists, but recency is not dated precisely.'};
  const latest=Math.max(...years), age=Math.max(0,referenceYear-latest); let score=age<=2?100:age<=4?82:age<=6?58:30;
  const explicit=String(req.text||'').match(/(?:within\s+the\s+last|past)\s+(\d+)\s+years?/i); if(explicit){const maxAge=Number(explicit[1]);score=age<=maxAge?100:Math.max(20,Math.round(100*maxAge/Math.max(age,1)));}
  score=Math.min(score,sourceAuthorityCap(ids,evidence,'recency'));
  return {score,evidence_ids:ids,reason:`Latest relevant dated evidence is ${latest} (${age} years from ${referenceYear}).`};
}

function countScore(req,match={}){
  const distinct=new Set((match.qualifying_instances||[]).map(i=>i.project_key).filter(Boolean)); const n=distinct.size, required=Number(req.minimum_count)||1;
  return {score:clamp(Math.round(100*n/required)),evidence_ids:match.evidence_ids||[],reason:`${n} distinct qualifying instances against ${required} required.`};
}

export function evaluateRequirementDimensions({req,match={},evidence=[],evidenceSemantics=[],referenceYear=null}){
  const dimensions=deriveRequirementDimensions(req); const rows=[];
  for(const d of dimensions){
    let r;
    if(d.dimension==='capability') r=capabilityScore(req,match,evidence);
    else if(d.dimension==='responsibility') r=responsibilityScore(req,match,evidence,evidenceSemantics)||{score:0,evidence_ids:[],reason:'Responsibility not established.'};
    else if(d.dimension==='context') r=contextScore(req,match,evidence);
    else if(d.dimension==='scale') r=scaleScore(req,match,evidence,evidenceSemantics);
    else if(d.dimension==='exactness') r=exactnessScore(match);
    else if(d.dimension==='lifecycle') r=lifecycleScore(match);
    else if(d.dimension==='duration') r=durationScore(req,match,evidence);
    else if(d.dimension==='count') r=countScore(req,match);
    else if(d.dimension==='recency') r=recencyScore(req,match,evidence,referenceYear);
    else r={score:0,evidence_ids:[],reason:'Unsupported dimension.'};
    rows.push({...d,score:clamp(r.score||0),evidence_ids:uniq(r.evidence_ids||[]),reason:r.reason||'',details:r});
  }
  const total=rows.reduce((n,r)=>n+(IMPORTANCE_WEIGHT[r.importance]||1),0);
  const raw=total?rows.reduce((n,r)=>n+r.score*(IMPORTANCE_WEIGHT[r.importance]||1),0)/total:0;
  let cap=100; const capReasons=[];
  for(const r of rows){
    if(!r.critical) continue;
    if(r.dimension==='capability' && r.score<40){cap=Math.min(cap,40);capReasons.push('Critical capability is not established.');}
    if(r.dimension==='responsibility' && r.score<50){cap=Math.min(cap,60);capReasons.push('Required ownership/leadership responsibility is not established.');}
    if(r.dimension==='exactness' && r.score<50){const exactCap=req.requirement_type==='credential'?20:45;cap=Math.min(cap,exactCap);capReasons.push('Exact requirement is not established.');}
    if(r.dimension==='lifecycle' && r.score<50){cap=Math.min(cap,65);capReasons.push('Required end-to-end lifecycle coverage is incomplete.');}
    if(r.dimension==='duration' && r.score<50){cap=Math.min(cap,65);capReasons.push('Minimum duration is materially below the requirement or unproven.');}
    if(r.dimension==='count' && r.score<50){cap=Math.min(cap,65);capReasons.push('Required number of distinct instances is materially below the requirement.');}
  }
  const credit=Math.round(Math.min(raw,cap));
  return {credit,raw_credit:round(raw),cap,cap_reasons:uniq(capReasons),dimensions:rows,dimension_version:DIMENSION_ENGINE_VERSION};
}
