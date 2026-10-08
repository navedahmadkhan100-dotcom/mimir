export const CATEGORY_ENUM = [
  'skill','experience','depth','certification','education','language','domain','location',
  'work_authorization','behavioral','responsibility','methodology','other',
];

export const PRIORITY_ENUM = ['dealbreaker','critical','required','standard','nice_to_have'];
export const STRICTNESS_ENUM = ['exact_required','equivalent_allowed','functional_allowed','transferable_allowed','not_applicable'];
export const LOGIC_ENUM = ['single','any_of','all_of'];
export const ASSESSMENT_HINT_ENUM = ['score','gate','verify','exclude'];
export const REQUIREMENT_TYPE_ENUM = [
  'capability','exact_technology','preferred_technology','counted_experience','minimum_duration',
  'credential','lifecycle','role_context','methodology','factual_gate','behavioral','compound',
];
export const LIFECYCLE_SCOPE_ENUM = ['not_applicable','partial','end_to_end'];
export const DEPLOYMENT_MODEL_ENUM = ['not_applicable','saas','paas','iaas','cloud_hosted','on_prem','hybrid','unknown'];
export const RELATION_ENUM = ['direct','canonical','equivalent','implied','functional','transferable','adjacent','none'];
export const SUPPORT_ENUM = [
  'documented','listed','inferred_graph','inferred_behavioral','unsettled','missing','not_assessable','contradicted',
];
export const DEPTH_ENUM = ['led','owned','used','mentioned','unknown'];
export const EVIDENCE_SOURCE_ENUM = ['text','visual'];
export const EVIDENCE_CONTEXT_ENUM = ['role_project','professional_summary','skills_inventory','education','certification','employment_reference','visual','unknown'];
export const ROLE_ALIGNMENT_ENUM = ['exact','equivalent','related','none','unknown'];
export const DIMENSION_ENUM = ['capability','responsibility','context','scale','exactness','lifecycle','duration','count','recency'];
export const DIMENSION_IMPORTANCE_ENUM = ['decisive','high','medium','supporting'];
export const LIFECYCLE_PHASE_ENUM = [
  'discovery','assessment','requirements','blueprint_design','build_config','integration','data_migration',
  'testing','cutover','go_live','hypercare_stabilisation','operations','unknown',
];

const jdPathwaySchema = {
  type: 'object',
  properties: { id:{type:'string'}, label:{type:'string'}, explanation:{type:'string'} },
  required: ['id','label','explanation'], additionalProperties:false,
};
const jdIntelligenceSchema = {
  type:'object',
  properties: {
    role_intent:{type:'string'}, role_family:{type:'string'}, role_focus:{type:'string'},
    ambiguities:{type:'array',items:{type:'string'},maxItems:8}, pathways:{type:'array',items:jdPathwaySchema,maxItems:4},
    weighting_source:{type:'string'}, profile_version:{type:'string'},
  },
  required:['role_intent','role_family','role_focus','ambiguities','pathways'],
  additionalProperties:false,
};

const evaluationDimensionSchema = {
  type:'object',
  properties:{
    dimension:{type:'string',enum:DIMENSION_ENUM},
    importance:{type:'string',enum:DIMENSION_IMPORTANCE_ENUM},
    critical:{type:'boolean'},
    description:{type:'string'},
  },
  required:['dimension','importance','critical','description'],additionalProperties:false,
};

const requirementSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    text: { type: 'string' },
    category: { type: 'string', enum: CATEGORY_ENUM },
    priority: { type: 'string', enum: PRIORITY_ENUM },
    priority_basis: { type: 'string' },
    assessment_hint: { type: 'string', enum: ASSESSMENT_HINT_ENUM },
    strictness: { type: 'string', enum: STRICTNESS_ENUM },
    requirement_logic: { type: 'string', enum: LOGIC_ENUM },
    requirement_type: { type: 'string', enum: REQUIREMENT_TYPE_ENUM },
    target_concepts: { type: 'array', items: { type: 'string' }, maxItems: 8 },
    alternatives: { type: 'array', items: { type: 'string' }, maxItems: 8 },
    minimum_years: { type: ['number','null'] },
    minimum_count: { type: ['integer','null'] },
    count_unit: { type: 'string' },
    required_role_context: { type: 'array', items: { type: 'string' }, maxItems: 4 },
    lifecycle_scope: { type: 'string', enum: LIFECYCLE_SCOPE_ENUM },
    deployment_model: { type: 'string', enum: DEPLOYMENT_MODEL_ENUM },
    exact_credential: { type: 'string' },
    version_constraint: { type: 'string' },
    capability_name:{type:'string'},
    intelligence_category:{type:'string',enum:['technical','functional_domain','operational_delivery','behavioral','eligibility']},
    importance:{type:'string',enum:['decisive','high','medium','supporting','optional']},
    importance_reason:{type:'string'},
    explicit_tier:{type:'string',enum:['P1','P2','P3','none']},
    capability_group:{type:'string'},
    responsibility_level:{type:'string',enum:['own','lead','execute','coordinate','support','knowledge','unspecified']},
    evidence_equivalents:{type:'array',items:{type:'string'},maxItems:4},
    partial_evidence:{type:'array',items:{type:'string'},maxItems:3},
    non_equivalents:{type:'array',items:{type:'string'},maxItems:3},
    pathway_ids:{type:'array',items:{type:'string'},maxItems:4},
    evaluation_dimensions:{type:'array',items:evaluationDimensionSchema,maxItems:6},
  },
  required: [
    'id','text','category','priority','priority_basis','assessment_hint','strictness','requirement_logic',
    'requirement_type','target_concepts','alternatives','minimum_years','minimum_count','count_unit',
    'required_role_context','lifecycle_scope','deployment_model','exact_credential','version_constraint',
  ],
  additionalProperties: false,
};

export const structuredJdSchema = {
  type: 'object',
  properties: {
    role_title: { type: 'string' },
    role_summary: { type: 'string' },
    intelligence:jdIntelligenceSchema,
    requirements: { type: 'array', items: requirementSchema, maxItems: 24 },
  },
  required: ['role_title','role_summary','requirements'],
  additionalProperties: false,
};

const evidenceSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    source_type: { type: 'string', enum: EVIDENCE_SOURCE_ENUM },
    quote: { type: 'string' },
    visual_asset_id: { type: ['string','null'] },
    visual_observation: { type: 'string' },
    source_page: { type: ['integer','null'] },
    source_hint: { type: 'string' },
    skills: { type: 'array', items: { type: 'string' }, maxItems: 10 },
    capabilities: { type: 'array', items: { type: 'string' }, maxItems: 10 },
    depth: { type: 'string', enum: DEPTH_ENUM },
    recency_year: { type: ['integer','null'] },
    duration_months: { type: ['integer','null'] },
    career_context: { type: 'string' },
    project_key: { type: 'string' },
    role_context: { type: 'string' },
    lifecycle_phases: { type: 'array', items: { type: 'string', enum: LIFECYCLE_PHASE_ENUM }, maxItems: 10 },
    evidence_context_type:{type:'string',enum:EVIDENCE_CONTEXT_ENUM},
  },
  required: [
    'id','source_type','quote','visual_asset_id','visual_observation','source_page','source_hint','skills','capabilities',
    'depth','recency_year','duration_months','career_context','project_key','role_context','lifecycle_phases',
  ],
  additionalProperties: false,
};

const pathStepSchema = {
  type: 'object',
  properties: { from: { type: 'string' }, relation: { type: 'string' }, to: { type: 'string' } },
  required: ['from','relation','to'],
  additionalProperties: false,
};

const qualifyingInstanceSchema = {
  type: 'object',
  properties: {
    project_key: { type: 'string' },
    evidence_ids: { type: 'array', items: { type: 'string' }, maxItems: 10 },
    role_alignment: { type: 'string', enum: ROLE_ALIGNMENT_ENUM },
    deployment_model: { type: 'string', enum: DEPLOYMENT_MODEL_ENUM },
    lifecycle_phases: { type: 'array', items: { type: 'string', enum: LIFECYCLE_PHASE_ENUM }, maxItems: 10 },
    evidence_context_type:{type:'string',enum:EVIDENCE_CONTEXT_ENUM},
    reason: { type: 'string' },
  },
  required: ['project_key','evidence_ids','role_alignment','deployment_model','lifecycle_phases','reason'],
  additionalProperties: false,
};


const dimensionSupportSchema = {
  type:'object',
  properties:{
    dimension:{type:'string',enum:DIMENSION_ENUM},
    evidence_ids:{type:'array',items:{type:'string'}},
    relation:{type:'string',enum:RELATION_ENUM},
    support_state:{type:'string',enum:SUPPORT_ENUM},
    reason:{type:'string'},
  },
  required:['dimension','evidence_ids','relation','support_state','reason'],additionalProperties:false,
};

const matchSchema = {
  type: 'object',
  properties: {
    requirement_id: { type: 'string' },
    evidence_ids: { type: 'array', items: { type: 'string' }, maxItems: 10 },
    relation: { type: 'string', enum: RELATION_ENUM },
    support_state: { type: 'string', enum: SUPPORT_ENUM },
    reason: { type: 'string' },
    inference_path: { type: 'array', items: pathStepSchema, maxItems: 4 },
    lifecycle_phases: { type: 'array', items: { type: 'string', enum: LIFECYCLE_PHASE_ENUM }, maxItems: 10 },
    evidence_context_type:{type:'string',enum:EVIDENCE_CONTEXT_ENUM},
    qualifying_instances: { type: 'array', items: qualifyingInstanceSchema, maxItems: 12 },
    dimension_support:{type:'array',items:dimensionSupportSchema,maxItems:6},
  },
  required: ['requirement_id','evidence_ids','relation','support_state','reason','inference_path','lifecycle_phases','qualifying_instances'],
  additionalProperties: false,
};

export const evaluationSchema = {
  type: 'object',
  properties: {
    structured_jd: structuredJdSchema,
    evidence: { type: 'array', items: evidenceSchema, maxItems: 48 },
    matches: { type: 'array', items: matchSchema, maxItems: 24 },
  },
  required: ['structured_jd','evidence','matches'],
  additionalProperties: false,
};

// Candidate interactions return ONLY evidence and matches. The server injects the
// previously compiled, authoritative JD before any validation or scoring. This
// prevents large duplicated JD JSON responses and candidate-driven JD rewrites.
export const warmEvaluationSchema = {
  type: 'object',
  properties: {
    evidence: evaluationSchema.properties.evidence,
    matches: evaluationSchema.properties.matches,
  },
  required: ['evidence','matches'],
  additionalProperties: false,
};


// Provider-safe evaluation schema: semantically complete but intentionally flat.
// Gemini sees this shallow contract; Mimir reconstructs the authoritative nested
// evaluationSchema locally before validation/scoring. This avoids provider-side
// INVALID_ARGUMENT failures from deeply nested response schemas without weakening
// the evidence model.
export const providerSafeEvaluationSchema = {
  type:'object',
  properties:{
    evidence:{
      type:'array', maxItems:48, items:{
        type:'object', additionalProperties:false,
        properties:{
          id:{type:'string'}, source_type:{type:'string',enum:EVIDENCE_SOURCE_ENUM}, quote:{type:'string'},
          visual_asset_id:{type:['string','null']}, visual_observation:{type:'string'}, source_page:{type:['integer','null']}, source_hint:{type:'string'},
          skills:{type:'array',items:{type:'string'},maxItems:10}, capabilities:{type:'array',items:{type:'string'},maxItems:10},
          depth:{type:'string',enum:DEPTH_ENUM}, recency_year:{type:['integer','null']}, duration_months:{type:['integer','null']},
          career_context:{type:'string'}, project_key:{type:'string'}, role_context:{type:'string'},
          lifecycle_phases:{type:'array',items:{type:'string',enum:LIFECYCLE_PHASE_ENUM},maxItems:10},
          evidence_context_type:{type:'string',enum:EVIDENCE_CONTEXT_ENUM},
        },
        required:['id','source_type','quote','visual_asset_id','visual_observation','source_page','source_hint','skills','capabilities','depth','recency_year','duration_months','career_context','project_key','role_context','lifecycle_phases','evidence_context_type'],
      },
    },
    matches:{
      type:'array', maxItems:24, items:{
        type:'object', additionalProperties:false,
        properties:{
          requirement_id:{type:'string'}, evidence_ids:{type:'array',items:{type:'string'},maxItems:10},
          relation:{type:'string',enum:RELATION_ENUM}, support_state:{type:'string',enum:SUPPORT_ENUM}, reason:{type:'string'},
          lifecycle_phases:{type:'array',items:{type:'string',enum:LIFECYCLE_PHASE_ENUM},maxItems:10},
          evidence_context_type:{type:'string',enum:EVIDENCE_CONTEXT_ENUM},
        },
        required:['requirement_id','evidence_ids','relation','support_state','reason','lifecycle_phases','evidence_context_type'],
      },
    },
    dimension_support:{
      type:'array', maxItems:144, items:{
        type:'object', additionalProperties:false,
        properties:{
          requirement_id:{type:'string'}, dimension:{type:'string',enum:DIMENSION_ENUM}, evidence_ids:{type:'array',items:{type:'string'},maxItems:10},
          relation:{type:'string',enum:RELATION_ENUM}, support_state:{type:'string',enum:SUPPORT_ENUM}, reason:{type:'string'},
        },
        required:['requirement_id','dimension','evidence_ids','relation','support_state','reason'],
      },
    },
    qualifying_instances:{
      type:'array', maxItems:96, items:{
        type:'object', additionalProperties:false,
        properties:{
          requirement_id:{type:'string'}, project_key:{type:'string'}, evidence_ids:{type:'array',items:{type:'string'},maxItems:10},
          role_alignment:{type:'string',enum:ROLE_ALIGNMENT_ENUM}, deployment_model:{type:'string',enum:DEPLOYMENT_MODEL_ENUM},
          lifecycle_phases:{type:'array',items:{type:'string',enum:LIFECYCLE_PHASE_ENUM},maxItems:10},
          evidence_context_type:{type:'string',enum:EVIDENCE_CONTEXT_ENUM}, reason:{type:'string'},
        },
        required:['requirement_id','project_key','evidence_ids','role_alignment','deployment_model','lifecycle_phases','evidence_context_type','reason'],
      },
    },
    inference_paths:{
      type:'array', maxItems:96, items:{
        type:'object', additionalProperties:false,
        properties:{ requirement_id:{type:'string'}, from:{type:'string'}, relation:{type:'string'}, to:{type:'string'} },
        required:['requirement_id','from','relation','to'],
      },
    },
  },
  required:['evidence','matches','dimension_support','qualifying_instances','inference_paths'],
  additionalProperties:false,
};

// New JD-only AI requests REQUIRE the semantic fields. Warm evaluation/cached
// legacy objects continue to use the backward-compatible structuredJdSchema.
export const jdIntelligenceGenerationSchema = structuredClone(structuredJdSchema);
jdIntelligenceGenerationSchema.required = [...jdIntelligenceGenerationSchema.required, 'intelligence'];
jdIntelligenceGenerationSchema.properties.requirements.items.required = [
  ...jdIntelligenceGenerationSchema.properties.requirements.items.required,
  'capability_name', 'intelligence_category', 'importance', 'importance_reason',
  'explicit_tier', 'capability_group', 'responsibility_level',
  'evidence_equivalents', 'partial_evidence', 'non_equivalents', 'pathway_ids', 'evaluation_dimensions',
];


// Provider-safe JD transport schema.
// The authoritative JD contract remains structuredJdSchema and is validated locally.
// This schema intentionally avoids nesting evaluation_dimensions inside each requirement;
// Gemini returns them as one flat array keyed by requirement_id, then Mimir reconstructs
// the authoritative structure before any weighting/scoring logic runs.
export const providerSafeJdSchema = {
  type:'object',
  properties:{
    role_title:{type:'string'},
    role_summary:{type:'string'},
    role_intent:{type:'string'},
    role_family:{type:'string'},
    role_focus:{type:'string'},
    ambiguities:{type:'array',items:{type:'string'},maxItems:8},
    pathways:{type:'array',maxItems:4,items:{
      type:'object',additionalProperties:false,
      properties:{id:{type:'string'},label:{type:'string'},explanation:{type:'string'}},
      required:['id','label','explanation'],
    }},
    requirements:{type:'array',maxItems:24,items:{
      type:'object',additionalProperties:false,
      properties:{
        id:{type:'string'},text:{type:'string'},
        category:{type:'string',enum:CATEGORY_ENUM},
        priority:{type:'string',enum:PRIORITY_ENUM},
        priority_basis:{type:'string'},
        assessment_hint:{type:'string',enum:ASSESSMENT_HINT_ENUM},
        strictness:{type:'string',enum:STRICTNESS_ENUM},
        requirement_logic:{type:'string',enum:LOGIC_ENUM},
        requirement_type:{type:'string',enum:REQUIREMENT_TYPE_ENUM},
        target_concepts:{type:'array',items:{type:'string'},maxItems:8},
        alternatives:{type:'array',items:{type:'string'},maxItems:8},
        minimum_years:{type:['number','null']},
        minimum_count:{type:['integer','null']},
        count_unit:{type:'string'},
        required_role_context:{type:'array',items:{type:'string'},maxItems:4},
        lifecycle_scope:{type:'string',enum:LIFECYCLE_SCOPE_ENUM},
        deployment_model:{type:'string',enum:DEPLOYMENT_MODEL_ENUM},
        exact_credential:{type:'string'},
        version_constraint:{type:'string'},
        capability_name:{type:'string'},
        intelligence_category:{type:'string',enum:['technical','functional_domain','operational_delivery','behavioral','eligibility']},
        importance:{type:'string',enum:['decisive','high','medium','supporting','optional']},
        importance_reason:{type:'string'},
        explicit_tier:{type:'string',enum:['P1','P2','P3','none']},
        capability_group:{type:'string'},
        responsibility_level:{type:'string',enum:['own','lead','execute','coordinate','support','knowledge','unspecified']},
        evidence_equivalents:{type:'array',items:{type:'string'},maxItems:4},
        partial_evidence:{type:'array',items:{type:'string'},maxItems:3},
        non_equivalents:{type:'array',items:{type:'string'},maxItems:3},
        pathway_ids:{type:'array',items:{type:'string'},maxItems:4},
      },
      required:[
        'id','text','category','priority','priority_basis','assessment_hint','strictness','requirement_logic',
        'requirement_type','target_concepts','alternatives','minimum_years','minimum_count','count_unit',
        'required_role_context','lifecycle_scope','deployment_model','exact_credential','version_constraint',
        'capability_name','intelligence_category','importance','importance_reason','explicit_tier',
        'capability_group','responsibility_level','evidence_equivalents','partial_evidence','non_equivalents','pathway_ids'
      ],
    }},
    evaluation_dimensions:{type:'array',maxItems:144,items:{
      type:'object',additionalProperties:false,
      properties:{
        requirement_id:{type:'string'},
        dimension:{type:'string',enum:DIMENSION_ENUM},
        importance:{type:'string',enum:DIMENSION_IMPORTANCE_ENUM},
        critical:{type:'boolean'},
        description:{type:'string'},
      },
      required:['requirement_id','dimension','importance','critical','description'],
    }},
  },
  required:['role_title','role_summary','role_intent','role_family','role_focus','ambiguities','pathways','requirements','evaluation_dimensions'],
  additionalProperties:false,
};
