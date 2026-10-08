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



const JD_CATEGORIES = new Set(['skill','experience','depth','certification','education','language','domain','location','work_authorization','behavioral','responsibility','methodology','other']);
const JD_PRIORITIES = new Set(['dealbreaker','critical','required','standard','nice_to_have']);
const JD_STRICTNESS = new Set(['exact_required','equivalent_allowed','functional_allowed','transferable_allowed','not_applicable']);
const JD_LOGIC = new Set(['single','any_of','all_of']);
const JD_HINTS = new Set(['score','gate','verify','exclude']);
const JD_TYPES = new Set(['capability','exact_technology','preferred_technology','counted_experience','minimum_duration','credential','lifecycle','role_context','methodology','factual_gate','behavioral','compound']);
const JD_LIFECYCLE = new Set(['not_applicable','partial','end_to_end']);
const JD_INTEL_CATEGORIES = new Set(['technical','functional_domain','operational_delivery','behavioral','eligibility']);
const JD_IMPORTANCE = new Set(['decisive','high','medium','supporting','optional']);
const JD_TIERS = new Set(['P1','P2','P3','none']);
const JD_RESPONSIBILITY = new Set(['own','lead','execute','coordinate','support','knowledge','unspecified']);
const JD_DIM_IMPORTANCE = new Set(['decisive','high','medium','supporting']);

function nullableNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// Reconstructs Mimir's authoritative nested JD from the flatter provider-safe
// transport contract. This function is structural only: it does not invent
// requirements, importance, ownership, scale, or weights.
export function normalizeJdTransport(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const intelligence = source.intelligence && typeof source.intelligence === 'object' ? source.intelligence : {};
  // Always normalize provider output, even when Gemini happened to emit Mimir's
  // authoritative nested shape. Schema-free transport must never rely on every
  // optional/default field being present or perfectly enumerated by the model.
  const dims = arrayOf(source.evaluation_dimensions).length
    ? arrayOf(source.evaluation_dimensions)
    : arrayOf(source.requirements).flatMap((item) =>
        arrayOf(item?.evaluation_dimensions).map((d) => ({ ...d, requirement_id:item?.id }))
      );
  const requirements = arrayOf(source.requirements).map((item, index) => {
    const r = item && typeof item === 'object' ? item : {};
    const requirementId = String(r.id || `R${index + 1}`);
    const evaluation_dimensions = dims
      .filter((d) => String(d?.requirement_id || '') === requirementId && DIMENSIONS.has(d?.dimension))
      .map((d) => ({
        dimension:d.dimension,
        importance:enumOr(d.importance, JD_DIM_IMPORTANCE, 'medium'),
        critical:Boolean(d.critical),
        description:String(d.description || ''),
      }))
      .slice(0,9);
    return {
      id:requirementId,
      text:String(r.text || ''),
      category:enumOr(r.category, JD_CATEGORIES, 'other'),
      priority:enumOr(r.priority, JD_PRIORITIES, 'standard'),
      priority_basis:String(r.priority_basis || ''),
      assessment_hint:enumOr(r.assessment_hint, JD_HINTS, 'score'),
      strictness:enumOr(r.strictness, JD_STRICTNESS, 'equivalent_allowed'),
      requirement_logic:enumOr(r.requirement_logic, JD_LOGIC, 'single'),
      requirement_type:enumOr(r.requirement_type, JD_TYPES, 'capability'),
      target_concepts:arrayOf(r.target_concepts).map(String).slice(0,8),
      alternatives:arrayOf(r.alternatives).map(String).slice(0,8),
      minimum_years:nullableNumber(r.minimum_years),
      minimum_count:nullableInteger(r.minimum_count),
      count_unit:String(r.count_unit || ''),
      required_role_context:arrayOf(r.required_role_context).map(String).slice(0,4),
      lifecycle_scope:enumOr(r.lifecycle_scope, JD_LIFECYCLE, 'not_applicable'),
      deployment_model:enumOr(r.deployment_model, DEPLOYMENTS, 'not_applicable'),
      exact_credential:String(r.exact_credential || ''),
      version_constraint:String(r.version_constraint || ''),
      capability_name:String(r.capability_name || r.text || ''),
      intelligence_category:enumOr(r.intelligence_category, JD_INTEL_CATEGORIES, 'technical'),
      importance:enumOr(r.importance, JD_IMPORTANCE, 'medium'),
      importance_reason:String(r.importance_reason || r.priority_basis || ''),
      explicit_tier:enumOr(r.explicit_tier, JD_TIERS, 'none'),
      capability_group:String(r.capability_group || r.capability_name || requirementId),
      responsibility_level:enumOr(r.responsibility_level, JD_RESPONSIBILITY, 'unspecified'),
      evidence_equivalents:arrayOf(r.evidence_equivalents).map(String).slice(0,4),
      partial_evidence:arrayOf(r.partial_evidence).map(String).slice(0,3),
      non_equivalents:arrayOf(r.non_equivalents).map(String).slice(0,3),
      pathway_ids:arrayOf(r.pathway_ids).map(String).slice(0,4),
      evaluation_dimensions,
    };
  }).slice(0,24);

  return {
    role_title:String(source.role_title || ''),
    role_summary:String(source.role_summary || ''),
    intelligence:{
      role_intent:String(source.role_intent || intelligence.role_intent || source.role_summary || ''),
      role_family:String(source.role_family || intelligence.role_family || 'unspecified'),
      role_focus:String(source.role_focus || intelligence.role_focus || ''),
      ambiguities:arrayOf(source.ambiguities).length
        ? arrayOf(source.ambiguities).map(String).slice(0,8)
        : arrayOf(intelligence.ambiguities).map(String).slice(0,8),
      pathways:(arrayOf(source.pathways).length ? arrayOf(source.pathways) : arrayOf(intelligence.pathways)).map((p) => ({
        id:String(p?.id || ''), label:String(p?.label || ''), explanation:String(p?.explanation || ''),
      })).filter((p) => p.id).slice(0,4),
    },
    requirements,
  };
}

export function normalizeEvaluationTransport(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const flatDimensions = arrayOf(source.dimension_support || source.dimensions);
  const flatInstances = arrayOf(source.qualifying_instances || source.instances);
  const flatPaths = arrayOf(source.inference_paths || source.paths);
  const evidence = arrayOf(source.evidence).map((item, index) => {
    const e = item && typeof item === 'object' ? item : {};
    const inferredSource = e.visual_asset_id || e.visual_observation ? 'visual' : 'text';
    return {
      // Intentionally rebuild the allowed evidence shape instead of spreading
      // provider fields. Schema-free transport may add commentary keys; those
      // must never create a local AJV failure.
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

