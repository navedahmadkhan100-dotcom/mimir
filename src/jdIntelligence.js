/**
 * Mimir JD Intelligence Core v4.6.
 * Model-proposed semantic priorities are treated as bounded annotations;
 * ALL numeric weights are computed here, deterministically, from a frozen JD.
 */
export const JD_INTELLIGENCE_VERSION = '5.0.0-dimension-aware-jd-intelligence';

export const INTELLIGENCE_CATEGORIES = Object.freeze([
  'technical', 'functional_domain', 'operational_delivery', 'behavioral', 'eligibility',
]);

const PRIORITY_FACTOR = { dealbreaker: 1.55, critical: 1.4, required: 1.15, standard: 1, nice_to_have: 0 };
const IMPORTANCE_FACTOR = { decisive: 2.1, high: 1.5, medium: 1, supporting: 0.65, optional: 0 };
const TIER_FACTOR = { P1: 1.85, P2: 1, P3: 0.58, none: 1 };
const round = (v, d = 2) => Number(v.toFixed(d));

function categoryFor(req = {}) {
  if (INTELLIGENCE_CATEGORIES.includes(req.intelligence_category)) return req.intelligence_category;
  if (['location', 'work_authorization', 'language'].includes(req.category) || req.requirement_type === 'factual_gate') return 'eligibility';
  if (req.category === 'behavioral' || req.requirement_type === 'behavioral') return 'behavioral';
  if (['responsibility', 'experience'].includes(req.category) || ['lifecycle', 'role_context'].includes(req.requirement_type)) return 'operational_delivery';
  if (['domain', 'methodology'].includes(req.category)) return 'functional_domain';
  return 'technical';
}

function priorityFor(req = {}) {
  if (['decisive', 'high', 'medium', 'supporting', 'optional'].includes(req.importance)) return req.importance;
  if (req.priority === 'dealbreaker' || req.priority === 'critical') return 'high';
  if (req.priority === 'nice_to_have') return 'optional';
  if (req.priority === 'required') return 'medium';
  return 'supporting';
}

const safeStr = (v, max = 120) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);

export function normalizeJdIntelligence(jd = {}) {
  const src = jd.intelligence || {};
  const paths = Array.isArray(src.pathways) ? src.pathways.slice(0, 6).filter((p) => p && typeof p.id === 'string' && p.id) : [];
  const ids = new Set(paths.map((p) => p.id));
  return {
    ...jd,
    intelligence: {
      role_intent: safeStr(src.role_intent || jd.role_summary, 800),
      role_family: safeStr(src.role_family || 'unspecified', 120),
      role_focus: safeStr(src.role_focus || '', 400),
      ambiguities: (Array.isArray(src.ambiguities) ? src.ambiguities : []).slice(0, 15).map((x) => safeStr(x, 300)).filter(Boolean),
      pathways: paths.map((p) => ({ id: safeStr(p.id, 32), label: safeStr(p.label, 100), explanation: safeStr(p.explanation, 350) })),
      weighting_source: 'derived_from_jd_semantics_not_client_confirmed',
      profile_version: JD_INTELLIGENCE_VERSION,
    },
    requirements: (jd.requirements || []).map((req) => ({
      ...req,
      capability_name: safeStr(req.capability_name || req.text, 220),
      intelligence_category: categoryFor(req),
      importance: priorityFor(req),
      importance_reason: safeStr(req.importance_reason || req.priority_basis, 350),
      explicit_tier: ['P1','P2','P3'].includes(req.explicit_tier) ? req.explicit_tier : 'none',
      capability_group: safeStr(req.capability_group || req.capability_name || req.id, 140).toLowerCase(),
      responsibility_level: ['own','lead','execute','coordinate','support','knowledge','unspecified'].includes(req.responsibility_level) ? req.responsibility_level : 'unspecified',
      evidence_equivalents: (Array.isArray(req.evidence_equivalents) ? req.evidence_equivalents : []).slice(0, 8).map((x) => safeStr(x, 200)).filter(Boolean),
      partial_evidence: (Array.isArray(req.partial_evidence) ? req.partial_evidence : []).slice(0, 5).map((x) => safeStr(x, 200)).filter(Boolean),
      non_equivalents: (Array.isArray(req.non_equivalents) ? req.non_equivalents : []).slice(0, 5).map((x) => safeStr(x, 200)).filter(Boolean),
      pathway_ids: (Array.isArray(req.pathway_ids) ? req.pathway_ids : []).filter((x) => ids.has(x)).slice(0, 6),
      evaluation_dimensions:(Array.isArray(req.evaluation_dimensions)?req.evaluation_dimensions:[]).slice(0,8).map((d)=>({
        dimension:['capability','responsibility','context','scale','exactness','lifecycle','duration','count'].includes(d?.dimension)?d.dimension:'capability',
        importance:['decisive','high','medium','supporting'].includes(d?.importance)?d.importance:'medium',
        critical:Boolean(d?.critical),description:safeStr(d?.description,220),
      })),
    })),
  };
}

/** Score weights calculated from distinct capability groups, not keyword counts.
 * The caller controls which requirements are CV-assessable: gates, generic traits,
 * and explicitly preferred skills are NOT silently treated as failed CV evidence.
 */
export function deriveAdaptiveWeights(jd = {}, assessMode = () => 'score', selectedPathway = null) {
  const rs = jd.requirements || [];
  const eligible = rs.filter((r) => assessMode(r) === 'score' && (!r.pathway_ids?.length || (selectedPathway && r.pathway_ids.includes(selectedPathway))));
  const groups = new Map();
  for (const r of eligible) {
    const cat = categoryFor(r);
    const tier = TIER_FACTOR[r.explicit_tier] ?? 1;
    const value = (PRIORITY_FACTOR[r.priority] ?? 1) * (IMPORTANCE_FACTOR[priorityFor(r)] ?? 1) * tier;
    if (value <= 0) continue;
    const key = `${cat}:${safeStr(r.capability_group || r.capability_name || r.id).toLowerCase()}`;
    const group = groups.get(key) || { category:cat, strength:0, items:[] };
    group.strength = Math.max(group.strength, value); // duplicate bullets do not increase importance
    group.items.push(r.id);
    groups.set(key, group);
  }
  const sum = [...groups.values()].reduce((n, g) => n + g.strength, 0);
  const weightsByRequirement = Object.fromEntries(rs.map((r) => [r.id, 0]));
  const categoryWeights = Object.fromEntries(INTELLIGENCE_CATEGORIES.map((c) => [c, 0]));
  for (const g of groups.values()) {
    const portion = sum ? 100 * g.strength / sum : 0;
    categoryWeights[g.category] += portion;
    const split = portion / g.items.length;
    for (const id of g.items) weightsByRequirement[id] = split;
  }
  const requirementWeights = Object.fromEntries(Object.entries(weightsByRequirement).map(([id, w]) => [id, round(w, 6)]));
  return {
    policy_version: JD_INTELLIGENCE_VERSION,
    weighting_source: 'deterministic_from_jd_importance_and_capability_groups',
    selected_pathway: selectedPathway,
    weightsByRequirement: requirementWeights,
    categoryWeights: Object.fromEntries(Object.entries(categoryWeights).map(([k, v]) => [k, round(v)])),
    distinct_scored_capabilities: groups.size,
    score_bearing_requirements: eligible.length,
    unrounded_total: round(sum ? 100 : 0),
  };
}

export function jdIntelligenceSummary(jd = {}, assessMode = () => 'score') {
  const normalized = normalizeJdIntelligence(jd);
  const pathways = normalized.intelligence.pathways;
  const defaultPath = pathways.length ? pathways[0].id : null;
  const weights = deriveAdaptiveWeights(normalized, assessMode, defaultPath);
  return {
    version: JD_INTELLIGENCE_VERSION,
    ...normalized.intelligence,
    category_weights: weights.categoryWeights,
    preview_pathway: defaultPath,
    pathway_weights: pathways.map(p => ({id:p.id,label:p.label,category_weights:deriveAdaptiveWeights(normalized,assessMode,p.id).categoryWeights})),
    requirements: normalized.requirements.map((r) => ({
      id:r.id, capability:r.capability_name, category:r.intelligence_category, importance:r.importance,
      priority:r.priority, tier:r.explicit_tier, responsibility_level:r.responsibility_level,
      assessment_mode:assessMode(r), weight_percent:weights.weightsByRequirement[r.id],
      importance_reason:r.importance_reason, evidence_equivalents:r.evidence_equivalents,
      partial_evidence:r.partial_evidence, non_equivalents:r.non_equivalents,
      pathway_ids:r.pathway_ids, evaluation_dimensions:r.evaluation_dimensions,
    })),
  };
}
