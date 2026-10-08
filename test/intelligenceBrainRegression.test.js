import test from 'node:test';
import assert from 'node:assert/strict';

import { computeDeterministicScore, effectiveAssessmentMode } from '../src/scoring.js';
import { analyzeEvidenceSemantics } from '../src/evidenceSemantics.js';
import { runOdinReview, applyOdinToClaims } from '../src/odin.js';

function jd(requirements) {
  return { role_title:'Regression role', role_summary:'Regression fixture', requirements };
}

function baseReq(id, text, overrides={}) {
  return {
    id, text,
    category:'skill', priority:'required', priority_basis:'required', assessment_hint:'score',
    strictness:'functional_allowed', requirement_logic:'single', requirement_type:'capability',
    target_concepts:[], alternatives:[], minimum_years:null, minimum_count:null, count_unit:'',
    required_role_context:[], lifecycle_scope:'not_applicable', deployment_model:'not_applicable',
    exact_credential:'', version_constraint:'', intelligence_category:'technical',
    ...overrides,
  };
}

function evidence(id, quote, overrides={}) {
  return {
    id, quote, source_type:'text', source_page:1, source_hint:'Professional Experience',
    skills:[], capabilities:[], depth:'owned', recency_year:2026, duration_months:null,
    career_context:'Professional role', role_context:'', ...overrides,
  };
}

function match(requirement_id, evidence_ids, overrides={}) {
  return {
    requirement_id, evidence_ids, relation:'direct', support_state:'documented',
    reason:'Documented direct evidence.', inference_path:[], lifecycle_phases:[], qualifying_instances:[],
    ...overrides,
  };
}

test('Marco regression: direct AI architecture ownership is not lost between evidence and scoring', () => {
  const requirements=[
    baseReq('R1','Define and own AI architecture strategy and roadmap',{
      capability_name:'AI architecture strategy and roadmap',
      target_concepts:['AI architecture','architecture roadmap'],
      responsibility_level:'own', importance:'decisive',
      evaluation_dimensions:[
        {dimension:'capability',importance:'decisive',critical:true,description:'AI architecture strategy capability'},
        {dimension:'responsibility',importance:'decisive',critical:true,description:'Own architecture strategy'},
      ],
    }),
    baseReq('R2','Design and govern AI platforms, data architecture, and integration patterns',{
      capability_name:'AI platform and data architecture governance',
      target_concepts:['AI platforms','data architecture','integration patterns'],
      responsibility_level:'lead', importance:'decisive',
      evaluation_dimensions:[
        {dimension:'capability',importance:'decisive',critical:true,description:'AI platform/data architecture capability'},
        {dimension:'responsibility',importance:'decisive',critical:true,description:'Design/govern responsibility'},
      ],
    }),
    baseReq('R3','Build enterprise data foundations and governance frameworks',{
      capability_name:'Enterprise data foundations and governance',
      target_concepts:['data foundations','data governance'],
      responsibility_level:'execute', intelligence_category:'functional_domain', importance:'high',
      evaluation_dimensions:[
        {dimension:'capability',importance:'decisive',critical:true,description:'Data foundations/governance capability'},
        {dimension:'responsibility',importance:'high',critical:false,description:'Build responsibility'},
        {dimension:'scale',importance:'medium',critical:false,description:'Enterprise scale'},
      ],
    }),
  ];
  const ev=[
    evidence('E1','Owned overall technical architecture and advisory for AI and digital projects; connected enterprise constraints with delivery architecture.',{
      skills:['AI architecture'], capabilities:['AI architecture','AI platform architecture','data architecture','integration patterns'], depth:'led',
    }),
    evidence('E2','Designed AI solutions and established architecture governance and quality standards; owned MLOps with model serving, monitoring and CI/CD for AI workloads.',{
      skills:['MLOps','model serving'], capabilities:['AI platforms','architecture governance','data architecture','integration patterns'], depth:'owned',
    }),
    evidence('E3','Designed data-quality, access, retrieval, model-serving, evaluation and observability patterns for AI workloads.',{
      skills:['data quality','model serving'], capabilities:['data foundations','data governance'], depth:'owned',
    }),
  ];
  const matches=[
    match('R1',['E1']),
    // Deliberately omit E1 here. Cross-requirement evidence relevance must still recover its ownership signal for R2.
    match('R2',['E2']),
    match('R3',['E3']),
  ];
  const semantics=analyzeEvidenceSemantics(ev);
  const result=computeDeterministicScore({evidence:ev,matches},jd(requirements),{referenceYear:2026,evidenceSemantics:semantics});
  const rows=Object.fromEntries(result.breakdownTable.map(r=>[r.requirement_id,r]));
  assert.ok(rows.R1.calculation.result >= 95, `R1 should preserve direct ownership evidence, got ${rows.R1.calculation.result}`);
  assert.ok(rows.R2.calculation.result >= 90, `R2 should cross-link relevant architecture ownership evidence, got ${rows.R2.calculation.result}`);
  assert.ok(rows.R3.calculation.result >= 70 && rows.R3.calculation.result <= 90, `R3 should retain capability credit while allowing scale uncertainty, got ${rows.R3.calculation.result}`);
  assert.ok(result.finalScore >= 85, `Marco-like profile should remain a strong fit, got ${result.finalScore}`);
});

test('Odin regression: false ownership gap is challenged when another relevant CV quote proves ownership', () => {
  const requirement=baseReq('R2','Design and govern AI platforms, data architecture, and integration patterns',{
    capability_name:'AI platform and data architecture governance',
    target_concepts:['AI platforms','data architecture','integration patterns'], responsibility_level:'lead',
  });
  const ev=[
    evidence('E1','Owned overall technical architecture for AI and digital projects, including data architecture and enterprise integration patterns.',{capabilities:['AI platforms','data architecture','integration patterns'],depth:'led'}),
    evidence('E2','Design data-quality, retrieval and model-serving patterns for AI workloads.',{capabilities:['AI platforms','data architecture'],depth:'owned'}),
  ];
  const m=match('R2',['E2']);
  const claims=[{claim_id:'C-R2',requirement_id:'R2',state:'contextual',not_established:['required ownership/design responsibility is not established'],uncertainty_reasons:[],human_verification_recommended:true}];
  const result={structured_jd:jd([requirement]),evidence:ev,matches:[m]};
  const challenges=runOdinReview(result,claims,analyzeEvidenceSemantics(ev));
  assert.ok(challenges.some(c=>c.code==='FALSE_NEGATIVE_OWNERSHIP'), 'Odin should flag the false ownership negative');
  const repaired=applyOdinToClaims(claims,challenges)[0];
  assert.ok(['partially_supported','supported'].includes(repaired.state), `Odin should repair false-negative state, got ${repaired.state}`);
});

test('Jose regression: UAT oversight does not prove scenario writing, prioritization and country review', () => {
  const r=baseReq('R2','UAT scenarios writing, prioritization and country review',{
    capability_name:'UAT scenario design and prioritization',
    target_concepts:['UAT','scenario writing','prioritization','country review'],
    requirement_logic:'all_of', intelligence_category:'functional_domain', importance:'high',
  });
  const e=evidence('E1','Oversaw UAT, defect management, and cutover activities, ensuring system readiness and a smooth transition to go-live.',{
    skills:['UAT','defect management','cutover'], capabilities:['UAT','system readiness'], depth:'led', recency_year:2025,
  });
  const result=computeDeterministicScore({evidence:[e],matches:[match('R2',['E1'])]},jd([r]),{referenceYear:2026});
  assert.ok(result.finalScore <= 55, `UAT oversight alone must not receive full scenario-authoring credit, got ${result.finalScore}`);
});

test('Jose regression: documented cutover oversight receives meaningful evidence credit for cutover support', () => {
  const r=baseReq('R5','Support and provide functional input for cutover planning from Operations standpoint',{
    capability_name:'Operational cutover planning support', target_concepts:['cutover planning','operational readiness'],
    responsibility_level:'support', intelligence_category:'operational_delivery', importance:'high',
  });
  const e=evidence('E1','Oversaw UAT, defect management, and cutover activities, ensuring system readiness, compliance, and a smooth transition to go-live.',{
    skills:['UAT','cutover'], capabilities:['cutover planning','system readiness','operational readiness'], depth:'led', recency_year:2025,
  });
  const result=computeDeterministicScore({evidence:[e],matches:[match('R5',['E1'],{relation:'functional'})]},jd([r]),{referenceYear:2026});
  assert.ok(result.finalScore >= 75, `explicit cutover evidence must not be treated as no evidence, got ${result.finalScore}`);
});

test('Robotics regression: reliability and punctuality remain interview verification and do not dilute technical CV score', () => {
  const behavioral=baseReq('R6','Reliable, punctual, and task-focused in a performance-driven environment',{
    category:'behavioral', requirement_type:'behavioral', intelligence_category:'behavioral', assessment_hint:'verify', target_concepts:['reliability','punctuality'],
  });
  const technical=baseReq('R2','Comfortable using VR headsets for extended periods',{
    capability_name:'VR headset use', target_concepts:['VR headset'], intelligence_category:'technical', importance:'high',
  });
  assert.equal(effectiveAssessmentMode(behavioral),'verify');
  const e=evidence('E1','Designed and developed immersive VR experiences and interactive XR environments using head-mounted displays.',{
    skills:['VR','XR'], capabilities:['VR headset','immersive VR'], depth:'used',
  });
  const result=computeDeterministicScore({
    evidence:[e],
    matches:[
      match('R2',['E1']),
      match('R6',[],{relation:'none',support_state:'not_assessable',reason:'Verify through interview/reference rather than CV silence.'}),
    ],
  },jd([technical,behavioral]),{referenceYear:2026});
  assert.equal(result.finalScore,100);
  assert.equal(result.verificationItems.length,1);
  assert.equal(result.verificationItems[0].requirement_id,'R6');
});

test('skills inventory alone cannot prove architecture ownership at the same authority as role/project evidence', () => {
  const r=baseReq('R1','Own enterprise AI architecture strategy',{
    capability_name:'AI architecture strategy',target_concepts:['AI architecture'],responsibility_level:'own',
    evaluation_dimensions:[
      {dimension:'capability',importance:'decisive',critical:true,description:'AI architecture capability'},
      {dimension:'responsibility',importance:'decisive',critical:true,description:'Architecture ownership'},
    ],
  });
  const e=evidence('E1','AI architecture strategy, platform roadmap, governance, MLOps.',{
    capabilities:['AI architecture'],skills:['AI architecture'],depth:'mentioned',evidence_context_type:'skills_inventory',
  });
  const result=computeDeterministicScore({evidence:[e],matches:[match('R1',['E1'])]},jd([r]),{referenceYear:2026});
  assert.ok(result.finalScore <= 55, `skills inventory must not establish ownership, got ${result.finalScore}`);
});

test('duration evidence is de-duplicated across multiple bullets from the same role/project', () => {
  const r=baseReq('R1','5+ years of enterprise architecture experience',{
    minimum_years:5,requirement_type:'minimum_duration',target_concepts:['enterprise architecture'],
  });
  const ev=[1,2,3].map(n=>evidence(`E${n}`,`Enterprise architecture responsibility bullet ${n}.`,{
    capabilities:['enterprise architecture'],duration_months:24,project_key:'Same Employer | Same Role | 2024-2026',evidence_context_type:'role_project',
  }));
  const result=computeDeterministicScore({evidence:ev,matches:[match('R1',ev.map(e=>e.id))]},jd([r]),{referenceYear:2026});
  const duration=result.breakdownTable[0].dimension_breakdown.find(d=>d.dimension==='duration');
  assert.ok(duration.score <= 45, `three bullets from one 24-month role must not become 72 months, got duration score ${duration.score}`);
});

test('explicit recent hands-on requirement creates a recency dimension rather than silently treating old evidence as current', () => {
  const r=baseReq('R1','Recent hands-on experience in both Java and Golang',{
    target_concepts:['Java','Golang'],requirement_logic:'all_of',
  });
  const ev=[
    evidence('E1','Developed production services in Java and Golang.',{skills:['Java','Golang'],capabilities:['Java','Golang'],depth:'used',recency_year:2019,evidence_context_type:'role_project'}),
  ];
  const result=computeDeterministicScore({evidence:ev,matches:[match('R1',['E1'])]},jd([r]),{referenceYear:2026});
  const recency=result.breakdownTable[0].dimension_breakdown.find(d=>d.dimension==='recency');
  assert.ok(recency, 'recent requirement should produce a recency dimension');
  assert.ok(recency.score <= 30, `2019 evidence should not count as recent in 2026, got ${recency.score}`);
  assert.ok(result.finalScore < 90, 'old evidence should reduce the final requirement credit when recency is explicit');
});
