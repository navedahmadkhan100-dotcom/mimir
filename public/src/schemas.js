export const CATEGORY_ENUM = [
  'skill',
  'experience',
  'depth',
  'certification',
  'education',
  'language',
  'domain',
  'location',
  'work_authorization',
  'behavioral',
  'responsibility',
  'methodology',
  'other',
];

export const PRIORITY_ENUM = ['dealbreaker', 'critical', 'required', 'standard', 'nice_to_have'];
export const STRICTNESS_ENUM = [
  'exact_required',
  'equivalent_allowed',
  'functional_allowed',
  'transferable_allowed',
  'not_applicable',
];
export const LOGIC_ENUM = ['single', 'any_of', 'all_of'];
export const ASSESSMENT_HINT_ENUM = ['score', 'gate', 'verify', 'exclude'];
export const RELATION_ENUM = ['direct', 'equivalent', 'implied', 'functional', 'transferable', 'adjacent', 'none'];
export const SUPPORT_ENUM = [
  'documented',
  'listed',
  'inferred_graph',
  'inferred_behavioral',
  'unsettled',
  'missing',
  'not_assessable',
  'contradicted',
];
export const DEPTH_ENUM = ['led', 'owned', 'used', 'mentioned', 'unknown'];

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
    target_concepts: { type: 'array', items: { type: 'string' } },
    alternatives: { type: 'array', items: { type: 'string' } },
    minimum_years: { type: ['number', 'null'] },
  },
  required: [
    'id', 'text', 'category', 'priority', 'priority_basis', 'assessment_hint',
    'strictness', 'requirement_logic', 'target_concepts', 'alternatives', 'minimum_years',
  ],
  additionalProperties: false,
};

export const structuredJdSchema = {
  type: 'object',
  properties: {
    role_title: { type: 'string' },
    role_summary: { type: 'string' },
    requirements: { type: 'array', items: requirementSchema },
  },
  required: ['role_title', 'role_summary', 'requirements'],
  additionalProperties: false,
};

const evidenceSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    quote: { type: 'string' },
    skills: { type: 'array', items: { type: 'string' } },
    capabilities: { type: 'array', items: { type: 'string' } },
    depth: { type: 'string', enum: DEPTH_ENUM },
    recency_year: { type: ['integer', 'null'] },
    duration_months: { type: ['integer', 'null'] },
    career_context: { type: 'string' },
  },
  required: ['id', 'quote', 'skills', 'capabilities', 'depth', 'recency_year', 'duration_months', 'career_context'],
  additionalProperties: false,
};

const pathStepSchema = {
  type: 'object',
  properties: {
    from: { type: 'string' },
    relation: { type: 'string' },
    to: { type: 'string' },
  },
  required: ['from', 'relation', 'to'],
  additionalProperties: false,
};

const matchSchema = {
  type: 'object',
  properties: {
    requirement_id: { type: 'string' },
    evidence_ids: { type: 'array', items: { type: 'string' } },
    relation: { type: 'string', enum: RELATION_ENUM },
    support_state: { type: 'string', enum: SUPPORT_ENUM },
    reason: { type: 'string' },
    inference_path: { type: 'array', items: pathStepSchema },
  },
  required: ['requirement_id', 'evidence_ids', 'relation', 'support_state', 'reason', 'inference_path'],
  additionalProperties: false,
};

export const evaluationSchema = {
  type: 'object',
  properties: {
    structured_jd: structuredJdSchema,
    evidence: { type: 'array', items: evidenceSchema },
    matches: { type: 'array', items: matchSchema },
  },
  required: ['structured_jd', 'evidence', 'matches'],
  additionalProperties: false,
};
