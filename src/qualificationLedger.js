/**
 * Mimir Qualification Ledger v6.
 *
 * The final candidate score is a weighted average of independently assessable
 * JD qualifications.  Broad semantic buckets (technical / functional /
 * operational / behavioural) are deliberately NOT used as scoring weights.
 */
export const QUALIFICATION_LEDGER_VERSION = '6.0.0-qualification-ledger';

const PRIORITY_FACTOR = Object.freeze({
  dealbreaker: 1.75,
  critical: 1.50,
  required: 1.20,
  standard: 1.00,
  nice_to_have: 0,
});
const IMPORTANCE_FACTOR = Object.freeze({
  decisive: 1.45,
  high: 1.20,
  medium: 1.00,
  supporting: 0.78,
  optional: 0,
});
const TIER_FACTOR = Object.freeze({ P1: 1.40, P2: 1.00, P3: 0.65, none: 1.00 });

const GENERIC_BEHAVIORAL_RE=/\b(?:communication skills|interpersonal skills|team player|self[-\s]?motivated|punctual(?:ity)?|reliab(?:le|ility)|attention to detail|positive attitude|collaboration skills|people skills|adaptability)\b/i;
const STAKEHOLDER_RESP_RE=/\b(?:collaborat(?:e|ed|ing)\s+with|partner(?:ed|ing)?\s+with|liais(?:e|ed|ing)\s+with|work(?:ed|ing)?\s+closely\s+with|stakeholder\s+management|manage(?:d|ment)?\s+(?:key\s+)?stakeholders?)\b/i;
const WORK_AUTH_RE=/\b(?:work authori[sz]ation|right to work|eligible to work|visa|sponsorship|security clearance|clearance required|sc\s+clear(?:ed|ance)|dv\s+clear(?:ed|ance)|bpss|developed\s+vetting|ctc\s+clear(?:ed|ance))\b/i;
const LOCATION_GATE_RE=/\b(?:must be based|must reside|onsite|on-site|hybrid.*days|relocation required|within commuting distance)\b/i;
const LANGUAGE_LEVEL_RE=/\b(?:A1|A2|B1|B2|C1|C2|CEFR|native|fluent|business fluent|professional working proficiency)\b/i;

function safe(v='',max=180){ return String(v||'').replace(/\s+/g,' ').trim().slice(0,max); }
function key(v=''){ return safe(v,180).toLowerCase().replace(/[^a-z0-9+#./-]+/g,' ').replace(/\s+/g,' ').trim(); }
function round(v,d=2){ return Number(Number(v||0).toFixed(d)); }

export function qualificationAssessmentMode(req={}) {
  if ((req.priority || 'standard') === 'nice_to_have') return 'exclude';
  if (req.assessment_hint === 'exclude') return 'exclude';
  const text = String(req.text || '');
  if (req.assessment_hint === 'gate' || req.requirement_type === 'factual_gate' ||
      ['location','work_authorization','language'].includes(req.category) ||
      WORK_AUTH_RE.test(text) || LOCATION_GATE_RE.test(text) ||
      (req.category === 'language' && LANGUAGE_LEVEL_RE.test(text))) return 'gate';
  // Specific stakeholder delivery is a CV-assessable responsibility, not the
  // same thing as a generic soft-skill claim such as "good communication".
  if (STAKEHOLDER_RESP_RE.test(text) && !GENERIC_BEHAVIORAL_RE.test(text)) return 'score';
  if (req.assessment_hint === 'verify' || req.requirement_type === 'behavioral' ||
      req.category === 'behavioral' || GENERIC_BEHAVIORAL_RE.test(text)) return 'verify';
  return 'score';
}

export function qualificationType(req={}) {
  if (qualificationAssessmentMode(req) === 'gate') return 'eligibility_gate';
  if (qualificationAssessmentMode(req) === 'verify') return 'verification';
  if (req.requirement_type === 'credential') return 'credential';
  if (req.requirement_type === 'minimum_duration') return 'minimum_duration';
  if (req.requirement_type === 'counted_experience') return 'counted_experience';
  if (req.requirement_type === 'exact_technology') return 'exact_capability';
  if (req.requirement_type === 'methodology') return 'methodology';
  if (req.requirement_type === 'lifecycle') return 'lifecycle';
  if (req.requirement_type === 'role_context') return 'role_context';
  if (req.category === 'responsibility' || STAKEHOLDER_RESP_RE.test(String(req.text || ''))) return 'responsibility';
  return 'capability';
}

function rawStrength(req={}) {
  const p = PRIORITY_FACTOR[req.priority] ?? 1;
  const i = IMPORTANCE_FACTOR[req.importance] ?? 1;
  const t = TIER_FACTOR[req.explicit_tier] ?? 1;
  return p * i * t;
}

/**
 * Build deterministic qualification weights.
 * Duplicate/rephrased requirements sharing capability_group receive one group
 * budget, split across the rows, so repetition cannot inflate a score.
 */
export function deriveQualificationWeights(structuredJd={}, selectedPathway=null) {
  const requirements = structuredJd.requirements || [];
  const eligible = requirements.filter((req) => {
    if (qualificationAssessmentMode(req) !== 'score') return false;
    if (!req.pathway_ids?.length) return true;
    return Boolean(selectedPathway && req.pathway_ids.includes(selectedPathway));
  });

  const groups = new Map();
  for (const req of eligible) {
    const groupKey = key(req.capability_group || req.capability_name || req.text || req.id) || req.id;
    const strength = rawStrength(req);
    if (strength <= 0) continue;
    const existing = groups.get(groupKey) || {
      id: groupKey,
      label: safe(req.capability_name || req.text || req.id, 220),
      strength: 0,
      requirements: [],
      importance: req.importance || 'medium',
      priority: req.priority || 'standard',
      type: qualificationType(req),
    };
    existing.strength = Math.max(existing.strength, strength);
    existing.requirements.push(req.id);
    // Keep the strongest visible descriptors for recruiter inspection.
    if ((IMPORTANCE_FACTOR[req.importance] ?? 1) > (IMPORTANCE_FACTOR[existing.importance] ?? 1)) existing.importance=req.importance;
    if ((PRIORITY_FACTOR[req.priority] ?? 1) > (PRIORITY_FACTOR[existing.priority] ?? 1)) existing.priority=req.priority;
    groups.set(groupKey, existing);
  }

  const totalRaw = [...groups.values()].reduce((n,g)=>n+g.strength,0);
  const weightsByRequirement = Object.fromEntries(requirements.map(r=>[r.id,0]));
  const qualificationGroups=[];
  for (const g of groups.values()) {
    const groupShare = totalRaw ? 100 * g.strength / totalRaw : 0;
    const rowShare = g.requirements.length ? groupShare / g.requirements.length : 0;
    for (const id of g.requirements) weightsByRequirement[id]=rowShare;
    qualificationGroups.push({
      id:g.id,label:g.label,type:g.type,priority:g.priority,importance:g.importance,
      requirement_ids:[...g.requirements],share_percent:round(groupShare,2),
    });
  }
  qualificationGroups.sort((a,b)=>b.share_percent-a.share_percent || a.label.localeCompare(b.label));

  return {
    policy_version:QUALIFICATION_LEDGER_VERSION,
    weighting_source:'qualification_ledger_not_category_percentages',
    selected_pathway:selectedPathway,
    weightsByRequirement:Object.fromEntries(Object.entries(weightsByRequirement).map(([id,v])=>[id,round(v,6)])),
    qualificationGroups,
    roleEmphasis:qualificationGroups.slice(0,8).map(g=>g.label),
    distinct_scored_qualifications:groups.size,
    score_bearing_requirements:eligible.length,
    // Kept as an empty compatibility field so older UI/report code does not
    // accidentally resurrect the retired category-percentage model.
    categoryWeights:{},
  };
}

export function buildQualificationLedger(structuredJd={}, selectedPathway=null) {
  const weights=deriveQualificationWeights(structuredJd,selectedPathway);
  const entries=(structuredJd.requirements||[]).map(req=>({
    id:req.id,
    qualification:req.capability_name || req.text,
    type:qualificationType(req),
    priority:req.priority || 'standard',
    importance:req.importance || 'medium',
    assessment_mode:qualificationAssessmentMode(req),
    responsibility_level:req.responsibility_level || 'unspecified',
    logic:req.requirement_logic || 'single',
    exactness:req.strictness || 'equivalent_allowed',
    dimensions:(req.evaluation_dimensions||[]).map(d=>d.dimension),
    pathway_ids:req.pathway_ids||[],
    weight_percent:weights.weightsByRequirement[req.id]||0,
  }));
  return { version:QUALIFICATION_LEDGER_VERSION, ...weights, entries };
}
