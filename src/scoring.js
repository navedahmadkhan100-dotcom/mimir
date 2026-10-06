import { evidenceSupportsConcept } from './ontology.js';
import { deriveAdaptiveWeights, JD_INTELLIGENCE_VERSION } from './jdIntelligence.js';

export const SCORING_VERSION = '4.6.0-jd-adaptive-evidence-lineage';

export const RELATION_BASE = Object.freeze({
  direct:100, canonical:98, equivalent:96, implied:90, functional:86, transferable:70, adjacent:45, none:0,
});
export const SUPPORT_ADJUSTMENT = Object.freeze({
  documented:0, listed:-8, inferred_graph:-6, inferred_behavioral:-10, unsettled:-15,
  missing:0, not_assessable:0, contradicted:0,
});
export const DEPTH_ADJUSTMENT = Object.freeze({ led:4, owned:2, used:0, mentioned:-10, unknown:0 });
export const DEPTH_SCORE = Object.freeze({ led:100, owned:92, used:80, mentioned:55, unknown:70 });
export const PRIORITY_WEIGHTS = Object.freeze({ dealbreaker:5, critical:5, required:4, standard:3, nice_to_have:0 });

const GENERIC_BEHAVIORAL_RE=/\b(?:communication skills|interpersonal skills|team player|self[-\s]?motivated|punctual(?:ity)?|reliab(?:le|ility)|attention to detail|positive attitude|collaboration skills|people skills|adaptability)\b/i;
const WORK_AUTH_RE=/\b(?:work authori[sz]ation|right to work|eligible to work|visa|sponsorship|security clearance|clearance required|sc\s+clear(?:ed|ance)|dv\s+clear(?:ed|ance)|bpss|developed\s+vetting|ctc\s+clear(?:ed|ance))\b/i;
const LOCATION_GATE_RE=/\b(?:must be based|must reside|onsite|on-site|hybrid.*days|relocation required|within commuting distance)\b/i;
const LANGUAGE_LEVEL_RE=/\b(?:A1|A2|B1|B2|C1|C2|CEFR|native|fluent|business fluent|professional working proficiency)\b/i;

const E2E_GROUPS = [
  ['discovery','assessment','requirements','blueprint_design'],
  ['build_config','integration','data_migration'],
  ['testing'],
  ['cutover','go_live'],
];

function clamp(v,min=0,max=100){ return Math.max(min,Math.min(max,v)); }

export function recencyAdjustment(recencyYear,referenceYear){
  if (recencyYear===null || recencyYear===undefined || recencyYear==='') return 0;
  const year=Number(recencyYear); if (!Number.isFinite(year)) return 0;
  const diff=Math.max(0,referenceYear-year); if (diff<=2) return 0; if (diff<=4) return -3; if (diff<=7) return -7; return -12;
}

export function effectiveAssessmentMode(req){
  if ((req.priority || 'standard')==='nice_to_have') return 'exclude';
  if (req.assessment_hint === 'exclude') return 'exclude';
  if (req.assessment_hint === 'gate' || req.intelligence_category === 'eligibility') return 'gate';
  if (req.assessment_hint === 'verify' && ['behavioral','factual_gate'].includes(req.requirement_type)) return req.requirement_type === 'behavioral' ? 'verify' : 'gate';
  const text=req.text || ''; const category=req.category || 'other';
  if (req.requirement_type==='factual_gate') return 'gate';
  if (category==='work_authorization' || WORK_AUTH_RE.test(text)) return 'gate';
  if (category==='location' || LOCATION_GATE_RE.test(text)) return 'gate';
  if (category==='language' && LANGUAGE_LEVEL_RE.test(text)) return 'gate';
  if (req.requirement_type==='behavioral' || category==='behavioral' || req.intelligence_category==='behavioral' || GENERIC_BEHAVIORAL_RE.test(text)) return 'verify';
  if ((category==='certification' || category==='education') && req.priority==='dealbreaker') return 'gate';
  return 'score';
}

function evidenceSortValue(e,referenceYear){
  const depthRank={led:5,owned:4,used:3,mentioned:2,unknown:1}[e.depth]||0;
  const hasYear=e.recency_year!==null && e.recency_year!==undefined && e.recency_year!=='';
  const year=hasYear?Number(e.recency_year):NaN; const recency=Number.isFinite(year)?Math.max(0,100-Math.max(0,referenceYear-year)):50;
  return [depthRank,recency,Number(e.duration_months)||0,String(e.id||'')];
}
function selectBestEvidence(ids,map,referenceYear){
  const items=[...new Set(ids||[])].map((id)=>map.get(id)).filter(Boolean);
  items.sort((a,b)=>{const av=evidenceSortValue(a,referenceYear),bv=evidenceSortValue(b,referenceYear);for(let i=0;i<3;i+=1)if(bv[i]!==av[i])return bv[i]-av[i];return av[3].localeCompare(bv[3]);});
  return items[0]||null;
}
function knownDurationMonths(ids,map){
  return [...new Set(ids||[])].map((id)=>map.get(id)).filter(Boolean).reduce((sum,e)=>{const v=Number(e.duration_months);return Number.isFinite(v)&&v>0?sum+v:sum;},0);
}
function hasE2ECoverage(phases=[]){
  const set=new Set(phases); return E2E_GROUPS.every((group)=>group.some((p)=>set.has(p)));
}
function lifecycleCoveragePercent(phases=[]){
  const set=new Set(phases); const groups=E2E_GROUPS.filter((group)=>group.some((p)=>set.has(p))).length;
  return Math.round((groups/E2E_GROUPS.length)*100);
}

function instanceWeight(req,instance,evidenceMap){
  const evidences=(instance.evidence_ids||[]).map((id)=>evidenceMap.get(id)).filter(Boolean); if(!evidences.length) return 0;
  let weight=1;
  if ((req.required_role_context||[]).length) {
    if (['exact','equivalent'].includes(instance.role_alignment)) weight*=1;
    else if (instance.role_alignment==='related') weight*=0.5;
    else return 0;
  }
  if (req.deployment_model && !['not_applicable','unknown'].includes(req.deployment_model)) {
    const explicit=instance.deployment_model===req.deployment_model;
    const canonical=evidences.some((e)=>evidenceSupportsConcept(e,req.deployment_model,'canonical'));
    if (!explicit && !canonical) return 0;
  }
  if (req.lifecycle_scope==='end_to_end') {
    if (hasE2ECoverage(instance.lifecycle_phases||[])) weight*=1;
    else {
      const coverage=lifecycleCoveragePercent(instance.lifecycle_phases||[]);
      if (coverage<50) return 0;
      weight*=0.5;
    }
  }
  return weight;
}

function countConstraintCap(req,match,evidenceMap){
  const minimum=Number(req.minimum_count); if(!Number.isInteger(minimum)||minimum<=0) return { cap:100, verified:0, required:null };
  const byProject=new Map();
  for(const instance of match?.qualifying_instances||[]){
    const key=String(instance.project_key||'').trim(); if(!key) continue;
    const w=instanceWeight(req,instance,evidenceMap); if(w<=0) continue;
    byProject.set(key,Math.max(byProject.get(key)||0,w));
  }
  const verified=[...byProject.values()].reduce((a,b)=>a+b,0);
  if (verified>=minimum) return { cap:100, verified, required:minimum };
  if (req.priority==='dealbreaker') return { cap:clamp(Math.round((verified/minimum)*100)), verified, required:minimum };
  if (verified<=0) return { cap:(match?.evidence_ids||[]).length?35:0, verified, required:minimum };
  return { cap:clamp(Math.round(40+60*(verified/minimum))), verified, required:minimum };
}

function lifecycleCap(req,match){
  if(req.lifecycle_scope!=='end_to_end') return { cap:100, coverage:null };
  const phases=new Set([...(match?.lifecycle_phases||[])]);
  for(const i of match?.qualifying_instances||[]) for(const p of i.lifecycle_phases||[]) phases.add(p);
  const coverage=lifecycleCoveragePercent([...phases]);
  if (hasE2ECoverage([...phases])) return { cap:100, coverage };
  if (coverage>=75) return { cap:85, coverage };
  if (coverage>=50) return { cap:65, coverage };
  if (coverage>0) return { cap:45, coverage };
  return { cap:(match?.evidence_ids||[]).length?35:0, coverage:0 };
}

function allOfConstraintCap(req, match, evidenceMap) {
  const targets = [...new Set((req.target_concepts || []).map(x => String(x).trim()).filter(Boolean))];
  if (req.requirement_logic !== 'all_of' || targets.length < 2) return { cap:100, matched:targets.length, required:targets.length };
  const items=[...new Set(match?.evidence_ids || [])].map(id => evidenceMap.get(id)).filter(Boolean);
  const satisfied=targets.filter(target=>items.some(e=>evidenceSupportsConcept(e,target,'equivalent')));
  const fraction=satisfied.length / targets.length;
  return {cap:satisfied.length===targets.length ? 100 : Math.round(10+75*fraction), matched:satisfied.length, required:targets.length,
    missing:targets.filter(target=>!satisfied.includes(target))};
}

function requirementCredit(req,match,selected,evidenceMap,referenceYear){
  const relation=match?.relation||'none'; const support=match?.support_state||'missing';
  if (support==='missing'||support==='contradicted'||relation==='none') return { credit:0, constraints:{} };
  if (!selected && !(match?.qualifying_instances||[]).length && support!=='not_assessable') return { credit:0, constraints:{} };

  let value=RELATION_BASE[relation]??0; value+=SUPPORT_ADJUSTMENT[support]??0;
  if(selected){value+=DEPTH_ADJUSTMENT[selected.depth]??0; value+=recencyAdjustment(selected.recency_year,referenceYear);}

  const type=req.requirement_type||'capability';
  if (['exact_technology','methodology'].includes(type) || req.strictness==='exact_required') {
    if(!['direct','canonical','equivalent'].includes(relation)) value=Math.min(value,45);
  }
  if (type==='credential') {
    if(!['direct','canonical','equivalent'].includes(relation)) value=Math.min(value,20);
    else if (support==='listed' || support==='documented') value=Math.max(value,96);
  }

  const minimumYears=Number(req.minimum_years); let durationCap=null;
  if(Number.isFinite(minimumYears)&&minimumYears>0){
    const months=knownDurationMonths(match?.evidence_ids||[],evidenceMap);
    if(months>0 && months<minimumYears*12){durationCap=Math.max(35,Math.round((months/(minimumYears*12))*100)); value=Math.min(value,durationCap);}
  }

  const countInfo=countConstraintCap(req,match,evidenceMap); if(countInfo.required!==null) value=Math.min(value,countInfo.cap);
  const lifeInfo=lifecycleCap(req,match); if(req.lifecycle_scope==='end_to_end') value=Math.min(value,lifeInfo.cap);
  const conjunction=allOfConstraintCap(req,match,evidenceMap);
  if (req.requirement_logic==='all_of') value=Math.min(value,conjunction.cap);

  return { credit:clamp(Math.round(value)), constraints:{ count:countInfo, lifecycle:lifeInfo, durationCap, allOf:conjunction } };
}

function gateState(match){
  if(match?.support_state==='contradicted') return 'failed';
  if (!match || !match.evidence_ids?.length) return 'verify';
  if(['direct','canonical','equivalent'].includes(match.relation)&&['documented','listed'].includes(match.support_state)) return 'passed';
  return 'verify';
}
function displayState(mode,match,credit){
  if(mode==='gate'){const s=gateState(match);return s==='passed'?'Verified':s==='failed'?'Conflict':'Verify';}
  if(mode==='verify'){if(match?.support_state==='contradicted')return'Conflict';if(match?.evidence_ids?.length)return'Supported signal';return'Verify in interview';}
  if(mode==='exclude') return 'Optional'; if(match?.support_state==='not_assessable')return'Not assessed';
  if(credit>=90)return'Strong evidence';if(credit>=75)return'Good evidence';if(credit>=55)return'Partial evidence';if(credit>0)return'Weak evidence';return'No evidence';
}
function componentForRequirement(req){if(['experience','responsibility'].includes(req.category)||['counted_experience','minimum_duration','role_context','lifecycle'].includes(req.requirement_type))return'experience';if(req.category==='depth')return'depth';return'skills';}

function selectedPathwayAndWeights(structuredJd, matchMap, evidenceMap, policyMap, referenceYear) {
  if (structuredJd.intelligence?.profile_version !== JD_INTELLIGENCE_VERSION) return { adaptive:null, pathwayResults:[], path:null };
  const pathways = structuredJd.intelligence.pathways || [];
  if (!pathways.length) return { adaptive:deriveAdaptiveWeights(structuredJd, effectiveAssessmentMode), pathwayResults:[], path:null };
  const pathwayResults = pathways.map((path) => {
    const adaptive = deriveAdaptiveWeights(structuredJd, effectiveAssessmentMode, path.id);
    let earned=0;
    for (const req of structuredJd.requirements || []) {
      const w=adaptive.weightsByRequirement[req.id] || 0;
      if (!w) continue;
      const match=matchMap.get(req.id);
      const evidence=selectBestEvidence(match?.evidence_ids || [], evidenceMap, referenceYear);
      const credit=requirementCredit(req,match,evidence,evidenceMap,referenceYear).credit;
      const cap=policyMap.get(req.id)?.credit_cap ?? 100;
      earned += w * Math.min(credit,cap) / 100;
    }
    return { id:path.id,label:path.label,score:Math.round(earned),adaptive };
  });
  // Candidate picks the best admissible JD pathway, never a blend of mutually exclusive routes.
  const winner = [...pathwayResults].sort((a,b)=> b.score-a.score || a.id.localeCompare(b.id))[0];
  return { adaptive:winner.adaptive, pathwayResults:pathwayResults.map(({adaptive,...rest})=>rest),path:winner.id };
}

export function computeDeterministicScore(llmResponse,structuredJd,options={}){
  const referenceYear=Number(options.referenceYear); if(!Number.isInteger(referenceYear))throw new Error('A fixed integer referenceYear is required for deterministic scoring.');
  const matchMap=new Map((llmResponse.matches||[]).map((m)=>[m.requirement_id,m])); const evidenceMap=new Map((llmResponse.evidence||[]).map((e)=>[e.id,e]));
  const policyMap=new Map((options.policyDecisions||[]).map((p)=>[p.requirement_id,p]));
  const claimMap=new Map((options.claimAssessments||[]).map((c)=>[c.requirement_id,c]));
  const paths=selectedPathwayAndWeights(structuredJd,matchMap,evidenceMap,policyMap,referenceYear);
  let totalWeight=0,earned=0,hasDealbreaker=false; const breakdownTable=[],gateChecks=[],verificationItems=[],constraintChecks=[];
  const componentAccumulator={skills:{total:0,earned:0},experience:{total:0,earned:0}}; let depthWeighted=0,depthWeight=0;

  for(const req of structuredJd.requirements||[]){
    const match=matchMap.get(req.id)||{requirement_id:req.id,evidence_ids:[],relation:'none',support_state:effectiveAssessmentMode(req)==='verify'?'not_assessable':'missing',reason:'No evidence assessment was returned.',inference_path:[],lifecycle_phases:[],qualifying_instances:[]};
    const inOtherPath = Boolean(paths.adaptive && req.pathway_ids?.length && !req.pathway_ids.includes(paths.path));
    const mode=inOtherPath ? 'exclude' : effectiveAssessmentMode(req);
    const weight=paths.adaptive ? (paths.adaptive.weightsByRequirement[req.id] || 0) : (PRIORITY_WEIGHTS[req.priority||'standard']??3); const selected=selectBestEvidence(match.evidence_ids,evidenceMap,referenceYear);
    const result=mode==='score'?requirementCredit(req,match,selected,evidenceMap,referenceYear):{credit:null,constraints:{}};
    const policy=policyMap.get(req.id); const claim=claimMap.get(req.id);
    const prePolicyCredit=result.credit;
    if(mode==='score' && Number.isFinite(result.credit) && policy && Number.isFinite(policy.credit_cap)) result.credit=Math.min(result.credit,policy.credit_cap);
    const credit=result.credit;
    if(mode==='score'&&weight>0){
      totalWeight+=weight; earned+=weight*credit; const component=componentForRequirement(req);
      if(componentAccumulator[component]){componentAccumulator[component].total+=weight;componentAccumulator[component].earned+=weight*credit;}
      if(selected){depthWeight+=weight;depthWeighted+=weight*(DEPTH_SCORE[selected.depth]??70);} if(req.priority==='dealbreaker'&&credit<50)hasDealbreaker=true;
    }
    if(result.constraints?.count && result.constraints.count.required!==null){constraintChecks.push({requirement_id:req.id,type:'count',required:result.constraints.count.required,verified:Number(result.constraints.count.verified.toFixed(2)),status:result.constraints.count.verified>=result.constraints.count.required?'met':'below'});}
    if(req.lifecycle_scope==='end_to_end'){constraintChecks.push({requirement_id:req.id,type:'lifecycle',required:'end_to_end',verified:`${result.constraints.lifecycle?.coverage??0}% phase coverage`,status:(result.constraints.lifecycle?.cap??0)===100?'met':'partial'});}
    if(mode==='gate'){const status=gateState(match);gateChecks.push({requirement_id:req.id,requirement_text:req.text,status,reason:match.reason});if(req.priority==='dealbreaker'&&status!=='passed')hasDealbreaker=true;}
    if(mode==='verify')verificationItems.push({requirement_id:req.id,requirement_text:req.text,status:match.evidence_ids?.length?'supported':'verify',reason:match.reason});
    breakdownTable.push({
      requirement_id:req.id,requirement_text:req.text,requirement_type:req.requirement_type,category:req.category,priority:req.priority,assessment_mode:mode,
      intelligence_category:req.intelligence_category || null, capability_name:req.capability_name || null, importance:req.importance || null, importance_reason:req.importance_reason || '',
      weight_percent:paths.adaptive ? Number(weight.toFixed(2)) : null, pathway_ids:req.pathway_ids || [],
      relation:match.relation,support_state:match.support_state,status_label:displayState(mode,match,credit),matched_quote:selected?.quote||'',visual_observation:selected?.visual_observation||'',
      evidence_source_type:selected?.source_type||null,visual_asset_id:selected?.visual_asset_id||null,source_page:selected?.source_page??null,source_hint:selected?.source_hint||'',selected_evidence_id:selected?.id||null,
      depth:selected?.depth||null,recency_year:selected?.recency_year??null,reason:match.reason,inference_path:match.inference_path||[],qualifying_instances:match.qualifying_instances||[],
      constraints:result.constraints,claim_state:claim?.state||null,policy_decision:policy?.decision||null,policy_reasons:policy?.reasons||[],
      calculation:mode==='score'?{result:credit,pre_policy_result:prePolicyCredit,policy_cap:policy?.credit_cap??100,relation_base:RELATION_BASE[match.relation]??0,support_adjustment:SUPPORT_ADJUSTMENT[match.support_state]??0,depth_adjustment:selected?(DEPTH_ADJUSTMENT[selected.depth]??0):0,recency_adjustment:selected?recencyAdjustment(selected.recency_year,referenceYear):0,priority_weight:weight}:null,
      score_lineage:mode==='score'?{
        requirement_id:req.id,claim_id:claim?.claim_id||`C-${req.id}`,evidence_ids:[...(match.evidence_ids||[])],selected_evidence_id:selected?.id||null,
        relation:match.relation,support_state:match.support_state,claim_state:claim?.state||null,base_points:RELATION_BASE[match.relation]??0,
        adjustments:{support:SUPPORT_ADJUSTMENT[match.support_state]??0,depth:selected?(DEPTH_ADJUSTMENT[selected.depth]??0):0,recency:selected?recencyAdjustment(selected.recency_year,referenceYear):0},
        factual_constraints:result.constraints,policy_cap:policy?.credit_cap??100,credit_before_policy:prePolicyCredit,credit_after_policy:credit,
        priority_weight:weight,weighted_points:Number(((credit||0)*weight/100).toFixed(4)),formula:`credit=min(base + adjustments + constraints, policy cap); weighted=${weight} × credit/100`,
      }:null,
    });
  }

  const finalScore=totalWeight>0?Math.round(earned/totalWeight):0;
  for (const row of breakdownTable) {
    if (!row.score_lineage || row.assessment_mode !== 'score' || totalWeight <= 0) continue;
    row.score_lineage.final_score_points = Number((((row.calculation?.result || 0) * (row.calculation?.priority_weight || 0)) / totalWeight).toFixed(2));
    row.score_lineage.formula = `final contribution = (${row.calculation?.priority_weight || 0} × ${row.calculation?.result || 0}) / ${totalWeight}`;
  }
  const skills=componentAccumulator.skills.total>0?Math.round(componentAccumulator.skills.earned/componentAccumulator.skills.total):0;
  const experience=componentAccumulator.experience.total>0?Math.round(componentAccumulator.experience.earned/componentAccumulator.experience.total):0;
  const depth=depthWeight>0?Math.round(depthWeighted/depthWeight):0;
  let verdict='Low evidence';if(finalScore>=80)verdict='Strong fit';else if(finalScore>=65)verdict='Good fit';else if(finalScore>=50)verdict='Potential';else if(finalScore>=35)verdict='Partial fit';
  const categoryScore = {};
  if (paths.adaptive) for (const cat of Object.keys(paths.adaptive.categoryWeights)) {
    const entries=breakdownTable.filter(r => r.intelligence_category===cat && r.assessment_mode==='score' && r.weight_percent>0);
    const weightSum=entries.reduce((n,r)=>n+(r.calculation?.priority_weight||0),0);
    categoryScore[cat]=weightSum ? Math.round(entries.reduce((n,r)=>n+(r.calculation?.priority_weight||0)*(r.calculation?.result||0),0)/weightSum) : null;
  }
  return {finalScore,verdict,hasDealbreaker,componentBreakdown:{experience,skills,depth},breakdownTable,gateChecks,verificationItems,constraintChecks,
    adaptiveWeighting:paths.adaptive ? { ...paths.adaptive, selected_pathway:paths.path, pathway_scores:paths.pathwayResults, category_scores:categoryScore } : null,
    scoringMeta:{scoringVersion:SCORING_VERSION,referenceYear,scoreBearingRequirements:breakdownTable.filter((r)=>r.assessment_mode==='score').length,verificationRequirements:verificationItems.length,gateRequirements:gateChecks.length,constraintChecks:constraintChecks.length}};
}
