import test from 'node:test';
import assert from 'node:assert/strict';
import { providerSafeJdSchema } from '../src/schemas.js';
import { normalizeJdTransport } from '../src/transportNormalize.js';

test('provider-safe JD schema keeps evaluation dimensions flat', () => {
  assert.ok(providerSafeJdSchema.properties.evaluation_dimensions);
  assert.equal(providerSafeJdSchema.properties.requirements.items.properties.evaluation_dimensions, undefined);
  assert.equal(providerSafeJdSchema.properties.requirements.maxItems, 24);
});

test('flat JD transport reconstructs authoritative nested intelligence without changing semantics', () => {
  const flat = {
    role_title:'Senior AI Architect',
    role_summary:'Own enterprise AI architecture.',
    role_intent:'Establish secure reusable AI foundations.',
    role_family:'AI architecture',
    role_focus:'platforms and data',
    ambiguities:[],
    pathways:[],
    requirements:[{
      id:'R1',
      text:'Define and own AI architecture strategy and roadmap',
      category:'responsibility',
      priority:'critical',
      priority_basis:'Core role outcome',
      assessment_hint:'score',
      strictness:'equivalent_allowed',
      requirement_logic:'single',
      requirement_type:'capability',
      target_concepts:['AI architecture strategy'],
      alternatives:[],
      minimum_years:null,
      minimum_count:null,
      count_unit:'',
      required_role_context:[],
      lifecycle_scope:'not_applicable',
      deployment_model:'not_applicable',
      exact_credential:'',
      version_constraint:'',
      capability_name:'AI architecture strategy ownership',
      intelligence_category:'operational_delivery',
      importance:'decisive',
      importance_reason:'Primary mandate',
      explicit_tier:'none',
      capability_group:'ai-architecture-strategy',
      responsibility_level:'own',
      evidence_equivalents:['defined platform roadmap'],
      partial_evidence:['contributed to architecture'],
      non_equivalents:['used AI tools'],
      pathway_ids:[],
    }],
    evaluation_dimensions:[
      {requirement_id:'R1',dimension:'capability',importance:'decisive',critical:true,description:'Can define AI architecture strategy'},
      {requirement_id:'R1',dimension:'responsibility',importance:'decisive',critical:true,description:'Must own/define the strategy'},
    ],
  };

  const jd = normalizeJdTransport(flat);
  assert.equal(jd.intelligence.role_intent, flat.role_intent);
  assert.equal(jd.requirements[0].responsibility_level, 'own');
  assert.deepEqual(jd.requirements[0].evaluation_dimensions.map((d)=>d.dimension), ['capability','responsibility']);
  assert.equal(jd.requirements[0].evaluation_dimensions[1].critical, true);
});
