import { unionRelevantEvidenceIds } from './evidenceRelevance.js';
import { evidenceSupportsConcept } from './ontology.js';

export const DIMENSION_ENGINE_VERSION = '5.1.0-evidence-stable-dimensions';

export const DIMENSION_ENUM = Object.freeze([
  'capability','responsibility','context','scale','exactness','lifecycle','duration','count','recency',
]);

const IMPORTANCE_WEIGHT = Object.freeze({ decisive:4, high:3, medium:2, supporting:1 });
const RELATION_POINTS = Object.freeze({ direct:100, canonical:98, equivalent:95, implied:82, functional:79, transferable:62, adjacent:35, none:0 });
const STATE_FACTOR = Object.freeze({ documented:1, listed:.68, inferred_graph:.82, inferred_behavioral:.65, unsettled:.55, missing:0, not_assessable:0, contradicted:0 });
const ACTION_LEVEL_REQUIRED = Object.freeze({ own:5, lead:5, execute:4, coordinate:3, support:2, knowledge:0, unspecified:0 });
const SCALE_REQ_RE=/\b(?:enterprise[-\s]?wide|organisation[-\s]?wide|organization[-\s]?wide|global(?:ly)?|large[-\s]?scale|multi[-\s]?(?:country|region|site|tenant)|at\s+scale|across\s+\d+\s+(?:countries|regions|sites|tenants)|\d{2,}[,+]?\s*(?:users?|devices?|endpoints?|servers?|sites?|employees?|fte|tenants?|applications?|workloads?|countries?|regions?|teams?))\b/i;
const OWN_RE=/\b(?:own(?:ed|ership)?|accountable|final\s+authority|responsible\s+for|define\s+and\s+own)\b/i;
const LEAD_RE=/\b(?:lead|led|leadership|architect|design|govern)\b/i;
const EXEC_RE=/\b(?:implement|build|develop|deploy|configure|engineer|execute)\b/i;
const COORD_RE=/\b(?:coordinate|collaborate|partner|liaise|facilitate|manage\s+stakeholder)\b/i;
const RECENCY_REQ_RE=/\b(?:recent|recently|current|currently|latest|up[-\s]?to[-\s]?date|within\s+the\s+last\s+\d+\s+years?|past\s+\d+\s+years?)\b/i;

function clamp(v,min=0,max=100){ return Math.max(min,Math.min(max,v)); }
function round(v,d=2){ return Number(Number(v||0).toFixed(d)); }
function uniq(items=[]){ return [...new Set(items.filter(Boolean))]; }

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

export function deriveRequirementDimensions(req={}) {
  const fromModel=(req.evaluation_dimensions||[]).filter(d=>DIMENSION_ENUM.includes(d.dimension) && (d.dimension!=='scale' || SCALE_REQ_RE.test(String(req.text||'')))).map(d=>({
    dimension:d.dimension,
    importance:['decisive','high','medium','supporting'].includes(d.importance)?d.importance:'medium',
    critical:Boolean(d.critical),
    description:String(d.description||''),
    source:'jd_model',
  }));
  const byName=new Map(fromModel.map(d=>[d.dimension,d]));
  const add=(dimension,importance='medium',critical=false,description='')=>{
    if (!byName.has(dimension)) byName.set(dimension,{dimension,importance,critical,description,source:'deterministic_fallback'});
  };

  add('capability','decisive',true,'Core professional capability required by this JD requirement.');
  const level=inferResponsibilityLevel(req);
  if (level !== 'unspecified' && level !== 'knowledge') add('responsibility', ['own','lead'].includes(level)?'decisive':'high', ['own','lead'].includes(level), `Required responsibility level: ${level}.`);
  if ((req.required_role_context||[]).length || !['not_applicable','unknown',undefined,null,''].includes(req.deployment_model) || req.category==='domain') add('context','high',false,'Required role/domain/deployment context.');
  if (SCALE_REQ_RE.test(String(req.text||''))) add('scale','medium',false,'Scale explicitly signalled by the JD.');
  if (req.strictness==='exact_required' || ['exact_technology','credential','methodology'].includes(req.requirement_type)) add('exactness','decisive',true,'Exact technology/method/credential requirement.');
  if (req.lifecycle_scope==='end_to_end') add('lifecycle','high',true,'End-to-end lifecycle coverage required.');
  if (Number(req.minimum_years)>0) add('duration','high',true,`Minimum ${req.minimum_years} years required.`);
  if (Number(req.minimum_count)>0) add('count','high',true,`Minimum ${req.minimum_count} distinct ${req.count_unit||'instances'} required.`);
  if (RECENCY_REQ_RE.test(String(req.text||''))) add('recency','high',false,'The JD explicitly asks for recent/current experience.');
  return [...byName.values()];
}

function modelDimensionScore(match={}, name) {
  const rows=(match.dimension_support||[]).filter(d=>d.dimension===name);
  let best=null;
  for(const d of rows){
    const base=RELATION_POINTS[d.relation]??0; const factor=STATE_FACTOR[d.support_state]??0;
    const score=Math.round(base*factor);
    if(!best || score>best.score) best={score,relation:d.relation,support_state:d.support_state,evidence_ids:d.evidence_ids||[],reason:d.reason||''};
  }
  return best;
}

function relevantSemantics(req,match,evidence,evidenceSemantics){
  const semMap=new Map((evidenceSemantics||[]).map(s=>[s.evidence_id,s]));
  const ids=unionRelevantEvidenceIds(req,match,evidence,{threshold:.34,limit:10});
  return { ids, semantics:ids.map(id=>semMap.get(id)).filter(Boolean) };
}

function responsibilityScore(req,match,evidence,evidenceSemantics){
  const level=inferResponsibilityLevel(req); if(level==='unspecified') return null;
  if(level==='knowledge') return (match.evidence_ids||[]).length?100:0;
  const {ids,semantics}=relevantSemantics(req,match,evidence,evidenceSemantics);
  let best=0; let why='No relevant action evidence establishes the required responsibility level.';
  for(const s of semantics){
    const action=Number(s.strongest_action?.level||0); const ownership=s.ownership||'unestablished';
    let score=0;
    if(level==='own'){
      if(ownership==='direct' && action>=5) score=100;
      else if(ownership==='shared' && action>=5) score=82;
      else if(ownership==='direct' && action>=4) score=74;
      else if(ownership==='contextual') score=42;
    } else if(level==='lead'){
      if(ownership==='direct' && action>=5) score=100;
      else if(ownership==='shared' && action>=5) score=90;
      else if(action>=4) score=76;
      else if(action>=3) score=58;
    } else if(level==='execute'){
      if(action>=4) score=100; else if(action===3) score=75; else if(action===2) score=48; else if(action===1) score=25;
    } else if(level==='coordinate'){
      if(action>=5 || ownership==='shared') score=100; else if(action>=3) score=88; else if(action===2) score=70; else if(action===1) score=45;
    } else if(level==='support'){
      if(action>=2) score=100; else if(action===1) score=70;
    }
    const sourceCap=SOURCE_AUTHORITY[s.evidence_context_type||'unknown']?.responsibility ?? 100;
    score=Math.min(score,sourceCap);
    if(score>best){best=score;why=`${level} requirement assessed from ${s.strongest_action?.type||'unknown'} action with ${ownership} ownership (${s.evidence_context_type||'unknown'} evidence).`;}
  }
  const model=modelDimensionScore(match,'responsibility');
  if(model){
    const modelCap=sourceAuthorityCap(model.evidence_ids||[],evidence,'responsibility');
    const modelScore=Math.min(model.score,modelCap);
    if(modelScore>best){best=modelScore;why=model.reason||why;}
  }
  return { score:best,evidence_ids:ids,reason:why,required_level:level };
}

function capabilityScore(req={},match={},evidence=[]){
  const model=modelDimensionScore(match,'capability');
  let score=model?.score ?? Math.round((RELATION_POINTS[match.relation]??0)*(STATE_FACTOR[match.support_state]??0));
  let reason=model?.reason || match.reason || 'Capability score derived from evidence relationship and support state.';
  if(req.requirement_logic==='all_of'){
    const targets=[...new Set((req.target_concepts||[]).filter(Boolean))];
    if(targets.length>1){
      const evMap=new Map((evidence||[]).map(e=>[e.id,e]));
      const items=(match.evidence_ids||[]).map(id=>evMap.get(id)).filter(Boolean);
      const matched=targets.filter(t=>items.some(e=>evidenceSupportsConcept(e,t,'equivalent')));
      const coverage=matched.length/targets.length;
      const coverageCap=Math.round(10+90*coverage);
      score=Math.min(score,coverageCap);
      reason += ` ALL-of coverage ${matched.length}/${targets.length}.`;
    }
  }
  const ids=model?.evidence_ids||match.evidence_ids||[];
  score=Math.min(score,sourceAuthorityCap(ids,evidence,'capability'));
  return {score,evidence_ids:ids,reason};
}

function contextScore(req,match={}){
  const model=modelDimensionScore(match,'context'); if(model) return {score:model.score,evidence_ids:model.evidence_ids,reason:model.reason};
  let scores=[];
  if((req.required_role_context||[]).length){
    for(const i of match.qualifying_instances||[]) scores.push({exact:100,equivalent:92,related:62,none:0,unknown:35}[i.role_alignment]??35);
  }
  if(req.deployment_model && !['not_applicable','unknown'].includes(req.deployment_model)){
    for(const i of match.qualifying_instances||[]) scores.push(i.deployment_model===req.deployment_model?100:i.deployment_model==='unknown'?35:20);
  }
  if(!scores.length) return {score:(match.evidence_ids||[]).length?85:0,evidence_ids:match.evidence_ids||[],reason:'Context inferred from the same documented work evidence.'};
  return {score:Math.max(...scores),evidence_ids:match.evidence_ids||[],reason:'Context assessed from role/deployment alignment.'};
}

function scaleScore(req,match,evidence,evidenceSemantics){
  const model=modelDimensionScore(match,'scale');
  const {ids,semantics}=relevantSemantics(req,match,evidence,evidenceSemantics);
  const direct=semantics.some(s=>(s.scale||[]).length>0);
  let score=Math.max(direct?100:0,model?.score||0);
  const sourceIds=direct?ids:(model?.evidence_ids||ids);
  score=Math.min(score,sourceAuthorityCap(sourceIds,evidence,'scale'));
  return {score,evidence_ids:ids,reason:direct?'Relevant evidence contains an explicit scale signal.':(model?.reason||'No concrete scale signal established.')};
}

function exactnessScore(match={}){
  const model=modelDimensionScore(match,'exactness'); if(model) return {score:model.score,evidence_ids:model.evidence_ids,reason:model.reason};
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
  for(const id of new Set(match.evidence_ids||[])){
    const e=evMap.get(id); if(!e) continue;
    const m=Number(e.duration_months); if(!Number.isFinite(m)||m<=0) continue;
    const stable=String(e.project_key||'').trim();
    const contextual=[e.career_context,e.role_context].filter(Boolean).join('|').trim();
    const key=stable || contextual || `evidence:${id}`;
    groups.set(key,Math.max(groups.get(key)||0,m));
  }
  const months=[...groups.values()].reduce((a,b)=>a+b,0);
  if(!months) return {score:(match.evidence_ids||[]).length?65:0,evidence_ids:match.evidence_ids||[],reason:'Relevant experience exists, but duration is not quantified.'};
  return {score:clamp(Math.round(100*months/(Number(req.minimum_years)*12))),evidence_ids:match.evidence_ids||[],reason:`${months} de-duplicated months of quantified evidence against ${req.minimum_years} years required.`};
}

function recencyScore(req,match,evidence,referenceYear){
  const ids=unionRelevantEvidenceIds(req,match,evidence,{threshold:.34,limit:10});
  const map=new Map((evidence||[]).map(e=>[e.id,e]));
  const years=ids.map(id=>Number(map.get(id)?.recency_year)).filter(Number.isFinite);
  if(!years.length || !Number.isInteger(referenceYear)) return {score:65,evidence_ids:ids,reason:'Relevant evidence exists, but recency is not dated precisely.'};
  const latest=Math.max(...years); const age=Math.max(0,referenceYear-latest);
  let score=age<=2?100:age<=4?82:age<=6?58:30;
  const explicit=String(req.text||'').match(/(?:within\s+the\s+last|past)\s+(\d+)\s+years?/i);
  if(explicit){ const maxAge=Number(explicit[1]); score=age<=maxAge?100:Math.max(20,Math.round(100*maxAge/Math.max(age,1))); }
  score=Math.min(score,sourceAuthorityCap(ids,evidence,'recency'));
  return {score,evidence_ids:ids,reason:`Latest relevant dated evidence is ${latest} (${age} years from reference year ${referenceYear}).`};
}

function countScore(req,match={}){
  const distinct=new Set((match.qualifying_instances||[]).map(i=>i.project_key).filter(Boolean));
  const n=distinct.size, required=Number(req.minimum_count)||1;
  return {score:clamp(Math.round(100*n/required)),evidence_ids:match.evidence_ids||[],reason:`${n} distinct qualifying instances against ${required} required.`};
}

export function evaluateRequirementDimensions({req,match,evidence=[],evidenceSemantics=[],referenceYear=null}){
  const dimensions=deriveRequirementDimensions(req); const rows=[];
  for(const d of dimensions){
    let r;
    if(d.dimension==='capability') r=capabilityScore(req,match,evidence);
    else if(d.dimension==='responsibility') r=responsibilityScore(req,match,evidence,evidenceSemantics) || {score:0,evidence_ids:[],reason:'Responsibility not established.'};
    else if(d.dimension==='context') r=contextScore(req,match);
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
  let raw=total?rows.reduce((n,r)=>n+r.score*(IMPORTANCE_WEIGHT[r.importance]||1),0)/total:0;
  let cap=100; const capReasons=[];
  for(const r of rows){
    if(!r.critical) continue;
    if(r.dimension==='capability' && r.score<40){cap=Math.min(cap,40);capReasons.push('Critical capability dimension is not established.');}
    if(r.dimension==='responsibility' && r.score<50){cap=Math.min(cap,60);capReasons.push('Required ownership/leadership responsibility is not established.');}
    if(r.dimension==='exactness' && r.score<50){const exactCap=req.requirement_type==='credential'?20:45;cap=Math.min(cap,exactCap);capReasons.push('Exact requirement is not established.');}
    if(r.dimension==='lifecycle' && r.score<50){cap=Math.min(cap,65);capReasons.push('Required end-to-end lifecycle coverage is incomplete.');}
    if(r.dimension==='duration' && r.score<50){cap=Math.min(cap,65);capReasons.push('Minimum duration is materially below the requirement or unproven.');}
    if(r.dimension==='count' && r.score<50){cap=Math.min(cap,65);capReasons.push('Required number of distinct instances is materially below the requirement.');}
  }
  const credit=Math.round(Math.min(raw,cap));
  return {credit,raw_credit:round(raw),cap,cap_reasons:uniq(capReasons),dimensions:rows,dimension_version:DIMENSION_ENGINE_VERSION};
}
