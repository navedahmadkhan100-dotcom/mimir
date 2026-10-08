import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeJdIntelligence, deriveAdaptiveWeights, jdIntelligenceSummary, JD_INTELLIGENCE_VERSION } from '../src/jdIntelligence.js';
import { computeDeterministicScore, effectiveAssessmentMode } from '../src/scoring.js';
import { jdIntelligenceGenerationSchema } from '../src/schemas.js';

const mk = (id, category='technical', data={}) => ({
  id,text:`Test ${id}`,category:'skill',priority:'required',assessment_hint:'score',requirement_type:'capability',
  strictness:'equivalent_allowed',requirement_logic:'single',target_concepts:[],alternatives:[],minimum_years:null,
  intelligence_category:category,importance:'high',capability_name:`capability ${id}`,capability_group:`group ${id}`,
  ...data,
});
const make = (rs, data={}) => normalizeJdIntelligence({role_title:'Benchmark Role',role_summary:'Test role',
  intelligence:{role_intent:'Deliver business outcome',role_family:'IT',role_focus:'Execution',ambiguities:[],pathways:[],...data},
  requirements:rs});
const weight = (jd,path=null)=>deriveAdaptiveWeights(jd,effectiveAssessmentMode,path);

function sumWeights(w){ return Object.values(w.weightsByRequirement).reduce((a,b)=>a+b,0); }

test('JD-only schema still requires semantic responsibility and importance fields',()=>{
  assert.ok(jdIntelligenceGenerationSchema.required.includes('intelligence'));
  assert.ok(jdIntelligenceGenerationSchema.properties.requirements.items.required.includes('responsibility_level'));
});

test('qualification ledger retires technical/functional/operational percentage scoring',()=>{
  const rs=[...Array.from({length:9},(_,i)=>mk(`T${i}`)),mk('delivery','operational_delivery',{importance:'medium'})];
  const w=weight(make(rs));
  assert.deepEqual(w.categoryWeights,{});
  assert.ok(Math.abs(sumWeights(w)-100)<.01);
  assert.equal(w.distinct_scored_qualifications,10);
  assert.ok(w.roleEmphasis.length>0);
});

test('decisive delivery qualifications outweigh supporting tool mentions without category buckets',()=>{
  const rs=[mk('Sybase','technical',{importance:'supporting'}),mk('SQL','technical',{importance:'supporting'}),
    ...Array.from({length:6},(_,i)=>mk(`program${i}`,'operational_delivery',{importance:'high'})),
    mk('investment domain','functional_domain',{importance:'medium'})];
  const w=weight(make(rs));
  const deliveryTotal=Array.from({length:6},(_,i)=>w.weightsByRequirement[`program${i}`]).reduce((a,b)=>a+b,0);
  const toolTotal=w.weightsByRequirement.Sybase+w.weightsByRequirement.SQL;
  assert.ok(deliveryTotal>toolTotal*3,JSON.stringify(w.weightsByRequirement));
  assert.deepEqual(w.categoryWeights,{});
});

test('repeating the same capability cannot inflate its total weight',()=>{
  const one=make([mk('terraform'),mk('go-live','operational_delivery')]);
  const duplicate=make([mk('terraform'),mk('terraform copy','technical',{capability_group:'group terraform'}),mk('go-live','operational_delivery')]);
  const a=weight(one),b=weight(duplicate);
  const oneTerraform=a.weightsByRequirement.terraform;
  const duplicateTerraform=b.weightsByRequirement.terraform+b.weightsByRequirement['terraform copy'];
  assert.ok(Math.abs(oneTerraform-duplicateTerraform)<1e-6);
  assert.ok(Math.abs(b.weightsByRequirement.terraform-b.weightsByRequirement['terraform copy'])<1e-6);
});

test('explicit P1 vs P3 skills have meaningfully different weights',()=>{
  const jd=make([mk('Agents','technical',{explicit_tier:'P1'}),mk('LlamaIndex','technical',{explicit_tier:'P3'})]);
  const w=weight(jd);
  assert.ok(w.weightsByRequirement.Agents>2*w.weightsByRequirement.LlamaIndex);
});

test('specific stakeholder collaboration remains a score-bearing senior responsibility while generic soft skills are verification-only',()=>{
  const stakeholder=mk('Stakeholders','behavioral',{text:'Collaborate with product, data, and IT stakeholders',category:'behavioral',requirement_type:'behavioral',assessment_hint:'verify',capability_group:'stakeholder alignment'});
  const generic=mk('Communication','behavioral',{text:'Strong communication skills',category:'behavioral',requirement_type:'behavioral',assessment_hint:'verify'});
  const w=weight(make([stakeholder,generic,mk('AI architecture')]));
  assert.equal(effectiveAssessmentMode(stakeholder),'score');
  assert.equal(effectiveAssessmentMode(generic),'verify');
  assert.ok(w.weightsByRequirement.Stakeholders>0);
  assert.equal(w.weightsByRequirement.Communication,0);
});

test('generic reliability and location eligibility do not generate zero-scored capability requirements',()=>{
  const jd=make([mk('Reliability','behavioral',{requirement_type:'behavioral'}),
    mk('onsite','eligibility',{requirement_type:'factual_gate',assessment_hint:'gate'}),mk('Java')]);
  const w=weight(jd);
  assert.equal(w.weightsByRequirement.Reliability,0);
  assert.equal(w.weightsByRequirement.onsite,0);
  assert.equal(w.weightsByRequirement.Java,100);
  const result=computeDeterministicScore({evidence:[],matches:[]},jd,{referenceYear:2026});
  assert.equal(result.gateChecks[0].status,'verify');
  assert.equal(result.hasDealbreaker,false);
});

test('Pensions Tier 1 and Tier 2 candidate routes remain separate',()=>{
  const jd=make([mk('BA','functional_domain',{importance:'decisive'}),
    mk('Pensions','functional_domain',{pathway_ids:['tier1']}),
    mk('Regulated bank BA','functional_domain',{pathway_ids:['tier2']})],
    { pathways:[{id:'tier1',label:'Pensions specialist',explanation:'Pensions track'},
                {id:'tier2',label:'Regulated BA',explanation:'No pensions mandatory'}] });
  const tier1=weight(jd,'tier1'),tier2=weight(jd,'tier2');
  assert.equal(tier1.weightsByRequirement.Pensions>0,true);
  assert.equal(tier1.weightsByRequirement['Regulated bank BA'],0);
  assert.equal(tier2.weightsByRequirement.Pensions,0);
  assert.equal(tier2.weightsByRequirement['Regulated bank BA']>0,true);
  assert.equal(jdIntelligenceSummary(jd,effectiveAssessmentMode).pathway_weights.length,2);
});

test('qualification weights normalize to 100% and are deterministic across repeated calls',()=>{
  const jd=make([mk('RHEL'),mk('LinuxONE'),mk('service launch','operational_delivery'),mk('handover','operational_delivery')]);
  const a=weight(jd),b=weight(structuredClone(jd));
  assert.deepEqual(a,b);
  assert.ok(Math.abs(sumWeights(a)-100)<.01);
  assert.deepEqual(a.categoryWeights,{});
  assert.equal(jd.intelligence.profile_version,JD_INTELLIGENCE_VERSION);
});

test('priority and assessment mode are separate: a critical onsite gate is not score-bearing',()=>{
  const req=mk('Bournemouth 5-days onsite','eligibility',{priority:'dealbreaker',assessment_hint:'gate',text:'Bournemouth 5 days onsite required'});
  assert.equal(effectiveAssessmentMode(req),'gate');
  const w=weight(make([req,mk('BPNM 2.0','functional_domain')]));
  assert.equal(w.weightsByRequirement['Bournemouth 5-days onsite'],0);
  assert.equal(w.weightsByRequirement['BPNM 2.0'],100);
  assert.deepEqual(w.categoryWeights,{});
});

test('JD ambiguity in alternate stacks is preserved, not silently corrected',()=>{
  const jd=make([mk('C#'),mk('Python')],{ambiguities:['Full-stack description says Python OR C#, but backend section separately requires C#.']});
  assert.match(jdIntelligenceSummary(jd,effectiveAssessmentMode).ambiguities[0],/Python OR C#/);
});

test('Java AND Golang both required; Java alone cannot receive full credit',()=>{
  const jd=make([mk('JavaGo','technical',{requirement_logic:'all_of',target_concepts:['Java','Go']})]);
  const evidence=[{id:'E1',skills:['Java'],capabilities:[],depth:'led',recency_year:2026,quote:'Led Java services.'}];
  const result=computeDeterministicScore({evidence,matches:[{requirement_id:'JavaGo',evidence_ids:['E1'],relation:'direct',support_state:'documented',reason:'Java shown',qualifying_instances:[]}]},jd,{referenceYear:2026});
  assert.ok(result.finalScore<75,`Java-only score should be capped: ${result.finalScore}`);
  assert.deepEqual(result.breakdownTable[0].constraints.allOf.missing,['Go']);
});

test('Java AND Golang can be fully covered by two distinct verified evidence records',()=>{
  const jd=make([mk('JavaGo','technical',{requirement_logic:'all_of',target_concepts:['Java','Go']})]);
  const evidence=[{id:'E1',skills:['Java'],capabilities:[],depth:'led',recency_year:2026,quote:'Led Java services.'},
    {id:'E2',skills:['Golang'],capabilities:[],depth:'used',recency_year:2025,quote:'Built Golang backend services.'}];
  const result=computeDeterministicScore({evidence,matches:[{requirement_id:'JavaGo',evidence_ids:['E1','E2'],relation:'direct',support_state:'documented',reason:'Both languages',qualifying_instances:[]}]},jd,{referenceYear:2026});
  assert.equal(result.breakdownTable[0].constraints.allOf.matched,2);
  assert.equal(result.finalScore,100);
});
