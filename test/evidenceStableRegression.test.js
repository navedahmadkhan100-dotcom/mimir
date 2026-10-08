import test from 'node:test';
import assert from 'node:assert/strict';

import { recoverTextFirstEvidence } from '../src/textEvidenceRecovery.js';
import { analyzeEvidenceSemantics } from '../src/evidenceSemantics.js';
import { computeDeterministicScore } from '../src/scoring.js';
import { deriveRequirementDimensions } from '../src/dimensionEngine.js';
import { normalizeEvaluationTransport } from '../src/transportNormalize.js';

function req(id,text,overrides={}) {
  return {
    id,text,category:'skill',priority:'required',priority_basis:'required',assessment_hint:'score',
    strictness:'functional_allowed',requirement_logic:'single',requirement_type:'capability',
    target_concepts:[],alternatives:[],minimum_years:null,minimum_count:null,count_unit:'',required_role_context:[],
    lifecycle_scope:'not_applicable',deployment_model:'not_applicable',exact_credential:'',version_constraint:'',
    capability_name:text,intelligence_category:'technical',importance:'high',importance_reason:'Core role capability',
    explicit_tier:'none',capability_group:id,responsibility_level:'unspecified',evidence_equivalents:[],partial_evidence:[],non_equivalents:[],pathway_ids:[],evaluation_dimensions:[],
    ...overrides,
  };
}
function jd(requirements){ return {role_title:'Senior AI Architect',role_summary:'Enterprise AI architecture leadership',requirements}; }

test('Marco transport regression: visual-only model citation is replaced by exact masked CV text before scoring', () => {
  const structuredJd=jd([
    req('R1','Define and own AI architecture strategy and roadmap',{
      capability_name:'AI architecture strategy and roadmap',target_concepts:['AI architecture','architecture roadmap'],evidence_equivalents:['platform roadmap'],
      responsibility_level:'own',importance:'decisive',
      evaluation_dimensions:[
        {dimension:'capability',importance:'decisive',critical:true,description:'AI architecture strategy capability'},
        {dimension:'responsibility',importance:'decisive',critical:true,description:'Own architecture strategy'},
      ],
    }),
  ]);
  const maskedCv=`[PAGE 2]\n03 / CONTRIBUTION TO ENTERPRISE AI ARCHITECTURE\nDefine AI architecture strategy, reference patterns, platform roadmap and decision rules across use cases, data foundations and enterprise systems.\n[PAGE 3]\n04 / PROFESSIONAL EXPERIENCE\nVice President & Director of Architecture and Development\n- Owned overall technical architecture and advisory for AI and digital projects in insurance and public sector; connected enterprise constraints with delivery architecture.\n- Designed AI solutions and established architecture governance and quality standards.`;
  const raw={
    structured_jd:structuredJd,
    evidence:[{
      id:'V1',source_type:'visual',quote:'',visual_asset_id:'CV-V2',visual_observation:'Section detailing AI architecture strategy and platform roadmap definition.',source_page:2,source_hint:'page 2',
      skills:[],capabilities:['AI architecture'],depth:'unknown',recency_year:null,duration_months:null,career_context:'',project_key:'',role_context:'',lifecycle_phases:[],evidence_context_type:'visual',
    }],
    matches:[{requirement_id:'R1',evidence_ids:['V1'],relation:'direct',support_state:'missing',reason:'Candidate explicitly defines AI architecture strategy, reference patterns, and platform roadmap.',lifecycle_phases:[],evidence_context_type:'visual'}],
    dimension_support:[
      {requirement_id:'R1',dimension:'capability',evidence_ids:['V1'],relation:'direct',support_state:'missing',reason:'Visual page shows the architecture strategy section.'},
      {requirement_id:'R1',dimension:'responsibility',evidence_ids:['V1'],relation:'direct',support_state:'missing',reason:'Visual alone does not prove ownership.'},
    ],
    qualifying_instances:[],inference_paths:[],
  };
  // Reconstruct the nested shape normally produced by transport normalization.
  raw.matches[0].dimension_support=raw.dimension_support.map(({requirement_id,...d})=>d);
  raw.matches[0].qualifying_instances=[]; raw.matches[0].inference_path=[];
  const sanitized=recoverTextFirstEvidence(raw,maskedCv);
  const r1=sanitized.matches.find(m=>m.requirement_id==='R1');
  const textEvidence=(r1.evidence_ids||[]).map(id=>sanitized.evidence.find(e=>e.id===id)).filter(e=>e?.source_type==='text');
  assert.ok(textEvidence.length>=1,'verified text evidence should be recovered when rendered-page text was cited');
  assert.ok(textEvidence.some(e=>/Owned overall technical architecture/i.test(e.quote)),'role/project ownership text should be recovered across the CV');
  const semantics=analyzeEvidenceSemantics(sanitized.evidence);
  const score=computeDeterministicScore(sanitized,sanitized.structured_jd,{referenceYear:2026,evidenceSemantics:semantics});
  assert.ok(score.finalScore>=90,`visual transport choice must not collapse direct text-backed ownership, got ${score.finalScore}`);
});

test('enterprise system wording does not create an invented quantitative scale dimension', () => {
  const r=req('R5','Enable integration across enterprise systems and engineering standardization',{
    capability_name:'Enterprise system integration',target_concepts:['enterprise system integration'],responsibility_level:'execute',
    evaluation_dimensions:[
      {dimension:'capability',importance:'decisive',critical:true,description:'Integration capability'},
      {dimension:'scale',importance:'high',critical:false,description:'Enterprise scale'},
    ],
  });
  const dims=deriveRequirementDimensions(r);
  assert.ok(!dims.some(d=>d.dimension==='scale'),'the word enterprise alone is context, not proof that numeric/global scale is a separate requirement');
});

test('flat provider transport reconstructs nested dimensions and instances locally', () => {
  const normalized=normalizeEvaluationTransport({
    evidence:[],
    matches:[{requirement_id:'R1',evidence_ids:[],relation:'none',support_state:'missing',reason:'',lifecycle_phases:[],evidence_context_type:'unknown'}],
    dimension_support:[{requirement_id:'R1',dimension:'capability',evidence_ids:[],relation:'none',support_state:'missing',reason:'not found'}],
    qualifying_instances:[{requirement_id:'R1',project_key:'P1',evidence_ids:['E1'],role_alignment:'exact',deployment_model:'saas',lifecycle_phases:['build_config'],evidence_context_type:'role_project',reason:'instance'}],
    inference_paths:[{requirement_id:'R1',from:'A',relation:'direct',to:'B'}],
  });
  assert.equal(normalized.matches[0].dimension_support[0].dimension,'capability');
  assert.equal(normalized.matches[0].qualifying_instances[0].project_key,'P1');
  assert.equal(normalized.matches[0].inference_path[0].from,'A');
});
