// Structural normalization for Gemini JSON-mode candidate evaluation.
// This file deliberately contains no scoring or semantic inference.

// Gemini transport normalization is intentionally structural, not semantic.
// The provider is asked for JSON mode instead of the full deeply nested schema;
// Mimir then restores harmless empty/default fields before AJV validates the
// authoritative contract. No evidence, ownership, dates, scale or capability
// facts are invented here.
const RELATIONS = new Set(['direct','canonical','equivalent','implied','functional','transferable','adjacent','none']);
const SUPPORT_STATES = new Set(['documented','listed','inferred_graph','inferred_behavioral','unsettled','missing','not_assessable','contradicted']);
const DEPTHS = new Set(['led','owned','used','mentioned','unknown']);
const SOURCE_TYPES = new Set(['text','visual']);
const EVIDENCE_CONTEXTS = new Set(['role_project','professional_summary','skills_inventory','education','certification','employment_reference','visual','unknown']);
const ROLE_ALIGNMENTS = new Set(['exact','equivalent','related','none','unknown']);
const DEPLOYMENTS = new Set(['not_applicable','saas','paas','iaas','cloud_hosted','on_prem','hybrid','unknown']);
const DIMENSIONS = new Set(['capability','responsibility','context','scale','exactness','lifecycle','duration','count','recency']);
const LIFECYCLE_PHASES = new Set(['discovery','assessment','requirements','blueprint_design','build_config','integration','data_migration','testing','cutover','go_live','hypercare_stabilisation','operations','unknown']);

function arrayOf(value) { return Array.isArray(value) ? value : []; }
function nullableInteger(value) { return Number.isInteger(value) ? value : null; }
function enumOr(value, allowed, fallback) { return allowed.has(value) ? value : fallback; }

export function normalizeEvaluationTransport(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const flatDimensions = arrayOf(source.dimension_support || source.dimensions);
  const flatInstances = arrayOf(source.qualifying_instances || source.instances);
  const flatPaths = arrayOf(source.inference_paths || source.paths);
  const evidence = arrayOf(source.evidence).map((item, index) => {
    const e = item && typeof item === 'object' ? item : {};
    const inferredSource = e.visual_asset_id || e.visual_observation ? 'visual' : 'text';
    return {
      ...e,
      id: String(e.id || `E${index + 1}`),
      source_type: enumOr(e.source_type, SOURCE_TYPES, inferredSource),
      quote: String(e.quote || ''),
      visual_asset_id: e.visual_asset_id == null ? null : String(e.visual_asset_id),
      visual_observation: String(e.visual_observation || ''),
      source_page: nullableInteger(e.source_page),
      source_hint: String(e.source_hint || ''),
      skills: arrayOf(e.skills).map(String).slice(0,10),
      capabilities: arrayOf(e.capabilities).map(String).slice(0,10),
      depth: enumOr(e.depth, DEPTHS, 'unknown'),
      recency_year: nullableInteger(e.recency_year),
      duration_months: nullableInteger(e.duration_months),
      career_context: String(e.career_context || ''),
      project_key: String(e.project_key || ''),
      role_context: String(e.role_context || ''),
      lifecycle_phases: arrayOf(e.lifecycle_phases).filter((v) => LIFECYCLE_PHASES.has(v)).slice(0,10),
      evidence_context_type: enumOr(e.evidence_context_type, EVIDENCE_CONTEXTS, inferredSource === 'visual' ? 'visual' : 'unknown'),
    };
  });

  const matches = arrayOf(source.matches).map((item) => {
    const m = item && typeof item === 'object' ? item : {};
    const requirementId = String(m.requirement_id || '');
    const nestedInstances = arrayOf(m.qualifying_instances);
    const instanceSource = nestedInstances.length ? nestedInstances : flatInstances.filter((item) => String(item?.requirement_id || '') === requirementId);
    const qualifying_instances = instanceSource.map((item) => {
      const q = item && typeof item === 'object' ? item : {};
      return {
        project_key: String(q.project_key || ''),
        evidence_ids: arrayOf(q.evidence_ids).map(String).slice(0,10),
        role_alignment: enumOr(q.role_alignment, ROLE_ALIGNMENTS, 'unknown'),
        deployment_model: enumOr(q.deployment_model, DEPLOYMENTS, 'unknown'),
        lifecycle_phases: arrayOf(q.lifecycle_phases).filter((v) => LIFECYCLE_PHASES.has(v)).slice(0,10),
        evidence_context_type: enumOr(q.evidence_context_type, EVIDENCE_CONTEXTS, 'unknown'),
        reason: String(q.reason || ''),
      };
    }).slice(0,12);

    const nestedDimensions = arrayOf(m.dimension_support);
    const dimensionSource = nestedDimensions.length ? nestedDimensions : flatDimensions.filter((item) => String(item?.requirement_id || '') === requirementId);
    const dimension_support = dimensionSource.filter((item) => DIMENSIONS.has(item?.dimension)).map((item) => {
      const d = item && typeof item === 'object' ? item : {};
      return {
        dimension: d.dimension,
        evidence_ids: arrayOf(d.evidence_ids).map(String).slice(0,10),
        relation: enumOr(d.relation, RELATIONS, 'none'),
        support_state: enumOr(d.support_state, SUPPORT_STATES, 'unsettled'),
        reason: String(d.reason || ''),
      };
    }).slice(0,9);

    const nestedPaths = arrayOf(m.inference_path);
    const pathSource = nestedPaths.length ? nestedPaths : flatPaths.filter((item) => String(item?.requirement_id || '') === requirementId);
    const inference_path = pathSource.map((step) => ({
      from: String(step?.from || ''), relation: String(step?.relation || ''), to: String(step?.to || ''),
    })).filter((step) => step.from || step.to).slice(0,4);

    return {
      requirement_id: requirementId,
      evidence_ids: arrayOf(m.evidence_ids).map(String).slice(0,10),
      relation: enumOr(m.relation, RELATIONS, 'none'),
      support_state: enumOr(m.support_state, SUPPORT_STATES, 'missing'),
      reason: String(m.reason || ''),
      inference_path,
      lifecycle_phases: arrayOf(m.lifecycle_phases).filter((v) => LIFECYCLE_PHASES.has(v)).slice(0,10),
      evidence_context_type: enumOr(m.evidence_context_type, EVIDENCE_CONTEXTS, 'unknown'),
      qualifying_instances,
      dimension_support,
    };
  }).slice(0,24);

  return { evidence:evidence.slice(0,48), matches };
}

