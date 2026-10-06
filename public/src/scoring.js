export const SCORING_VERSION = '2.0.0-capability-evidence';

export const RELATION_BASE = Object.freeze({
  direct: 100,
  equivalent: 96,
  implied: 90,
  functional: 86,
  transferable: 70,
  adjacent: 45,
  none: 0,
});

export const SUPPORT_ADJUSTMENT = Object.freeze({
  documented: 0,
  listed: -8,
  inferred_graph: -6,
  inferred_behavioral: -10,
  unsettled: -15,
  missing: 0,
  not_assessable: 0,
  contradicted: 0,
});

export const DEPTH_ADJUSTMENT = Object.freeze({
  led: 4,
  owned: 2,
  used: 0,
  mentioned: -10,
  unknown: 0,
});

export const DEPTH_SCORE = Object.freeze({
  led: 100,
  owned: 92,
  used: 80,
  mentioned: 55,
  unknown: 70,
});

export const PRIORITY_WEIGHTS = Object.freeze({
  dealbreaker: 5,
  critical: 5,
  required: 4,
  standard: 3,
  nice_to_have: 0,
});

const GENERIC_BEHAVIORAL_RE = /\b(?:excellent|strong|good|effective)?\s*(?:written\s+and\s+verbal\s+)?communication|\bteam\s*player\b|\binterpersonal\b|\bself[-\s]?motivated\b|\bproactive\b|\badaptab|\battention to detail\b|\bwork(?:ing)? independently\b|\bcollaborative\b|\bcollaboration skills\b|\bpeople skills\b|\bpositive attitude\b/i;
const WORK_AUTH_RE = /\b(?:work authori[sz]ation|right to work|eligible to work|visa|sponsorship|security clearance|clearance required)\b/i;
const LOCATION_GATE_RE = /\b(?:must be based|must reside|onsite|on-site|hybrid.*days|relocation required|within commuting distance)\b/i;
const LANGUAGE_LEVEL_RE = /\b(?:A1|A2|B1|B2|C1|C2|CEFR|native|fluent|business fluent|professional working proficiency)\b/i;

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

export function recencyAdjustment(recencyYear, referenceYear) {
  if (recencyYear === null || recencyYear === undefined || recencyYear === '') return 0; // unknown is neutral
  const year = Number(recencyYear);
  if (!Number.isFinite(year)) return 0; // unknown is neutral; never assume old evidence
  const diffYears = Math.max(0, referenceYear - year);
  if (diffYears <= 2) return 0;
  if (diffYears <= 4) return -3;
  if (diffYears <= 7) return -7;
  return -12;
}

export function effectiveAssessmentMode(req) {
  if ((req.priority || 'standard') === 'nice_to_have') return 'exclude';
  const text = req.text || '';
  const category = req.category || 'other';

  if (category === 'work_authorization' || WORK_AUTH_RE.test(text)) return 'gate';
  if (category === 'location' || LOCATION_GATE_RE.test(text)) return 'gate';
  if (category === 'language' && LANGUAGE_LEVEL_RE.test(text)) return 'gate';
  if (category === 'behavioral' || GENERIC_BEHAVIORAL_RE.test(text)) return 'verify';
  if ((category === 'certification' || category === 'education') && req.priority === 'dealbreaker') return 'gate';

  return 'score';
}

function evidenceSortValue(evidence, referenceYear) {
  const depthRank = { led: 5, owned: 4, used: 3, mentioned: 2, unknown: 1 }[evidence.depth] || 0;
  const hasYear = evidence.recency_year !== null && evidence.recency_year !== undefined && evidence.recency_year !== '';
  const year = hasYear ? Number(evidence.recency_year) : NaN;
  const recencyRank = Number.isFinite(year) ? Math.max(0, 100 - Math.max(0, referenceYear - year)) : 50;
  const duration = Number(evidence.duration_months) || 0;
  return [depthRank, recencyRank, duration, String(evidence.id || '')];
}

function selectBestEvidence(evidenceIds, evidenceMap, referenceYear) {
  const items = [...new Set(evidenceIds || [])].map((id) => evidenceMap.get(id)).filter(Boolean);
  items.sort((a, b) => {
    const av = evidenceSortValue(a, referenceYear);
    const bv = evidenceSortValue(b, referenceYear);
    for (let i = 0; i < 3; i += 1) {
      if (bv[i] !== av[i]) return bv[i] - av[i];
    }
    return av[3].localeCompare(bv[3]);
  });
  return items[0] || null;
}

function knownDurationMonths(evidenceIds, evidenceMap) {
  return [...new Set(evidenceIds || [])]
    .map((id) => evidenceMap.get(id))
    .filter(Boolean)
    .reduce((sum, evidence) => {
      const value = Number(evidence.duration_months);
      return Number.isFinite(value) && value > 0 ? sum + value : sum;
    }, 0);
}

function requirementCredit(req, match, selectedEvidence, evidenceMap, referenceYear) {
  const relation = match?.relation || 'none';
  const support = match?.support_state || 'missing';
  if (support === 'missing' || support === 'contradicted' || relation === 'none') return 0;
  if (!selectedEvidence && !['not_assessable'].includes(support)) return 0;

  let value = RELATION_BASE[relation] ?? 0;
  value += SUPPORT_ADJUSTMENT[support] ?? 0;
  if (selectedEvidence) {
    value += DEPTH_ADJUSTMENT[selectedEvidence.depth] ?? 0;
    value += recencyAdjustment(selectedEvidence.recency_year, referenceYear);
  }

  // If a named tool/credential itself is explicitly required, related tools may still be useful
  // evidence, but cannot be treated as full satisfaction.
  if (req.strictness === 'exact_required' && !['direct', 'equivalent'].includes(relation)) {
    value = Math.min(value, 45);
  }

  // Explicit years matter when the CV provides enough dated evidence to evaluate them.
  const minimumYears = Number(req.minimum_years);
  if (Number.isFinite(minimumYears) && minimumYears > 0) {
    const months = knownDurationMonths(match?.evidence_ids || [], evidenceMap);
    if (months > 0 && months < minimumYears * 12) {
      const ratioCap = Math.max(35, Math.round((months / (minimumYears * 12)) * 100));
      value = Math.min(value, ratioCap);
    }
  }

  return clamp(Math.round(value));
}

function gateState(match) {
  if (!match || match.support_state === 'contradicted') return 'failed';
  if (['direct', 'equivalent'].includes(match.relation)
      && ['documented', 'listed'].includes(match.support_state)) return 'passed';
  return 'verify';
}

function displayState(mode, match, credit) {
  if (mode === 'gate') {
    const state = gateState(match);
    return state === 'passed' ? 'Verified' : state === 'failed' ? 'Conflict' : 'Verify';
  }
  if (mode === 'verify') {
    if (match?.support_state === 'contradicted') return 'Conflict';
    if (match?.evidence_ids?.length) return 'Supported signal';
    return 'Verify in interview';
  }
  if (mode === 'exclude') return 'Optional';
  if (match?.support_state === 'not_assessable') return 'Not assessed';
  if (credit >= 90) return 'Strong evidence';
  if (credit >= 75) return 'Good evidence';
  if (credit >= 55) return 'Partial evidence';
  if (credit > 0) return 'Weak evidence';
  return 'No evidence';
}

function componentForRequirement(req) {
  if (['experience', 'responsibility'].includes(req.category)) return 'experience';
  if (req.category === 'depth') return 'depth';
  return 'skills';
}

export function computeDeterministicScore(llmResponse, structuredJd, options = {}) {
  const referenceYear = Number(options.referenceYear);
  if (!Number.isInteger(referenceYear)) {
    throw new Error('A fixed integer referenceYear is required for deterministic scoring.');
  }

  const matchMap = new Map((llmResponse.matches || []).map((match) => [match.requirement_id, match]));
  const evidenceMap = new Map((llmResponse.evidence || []).map((evidence) => [evidence.id, evidence]));

  let totalWeight = 0;
  let earned = 0;
  let hasDealbreaker = false;
  const breakdownTable = [];
  const gateChecks = [];
  const verificationItems = [];
  const componentAccumulator = {
    skills: { total: 0, earned: 0 },
    experience: { total: 0, earned: 0 },
  };
  let depthWeighted = 0;
  let depthWeight = 0;

  for (const req of structuredJd.requirements || []) {
    const match = matchMap.get(req.id) || {
      requirement_id: req.id,
      evidence_ids: [],
      relation: 'none',
      support_state: effectiveAssessmentMode(req) === 'verify' ? 'not_assessable' : 'missing',
      reason: 'No evidence assessment was returned.',
      inference_path: [],
    };
    const mode = effectiveAssessmentMode(req);
    const weight = PRIORITY_WEIGHTS[req.priority || 'standard'] ?? PRIORITY_WEIGHTS.standard;
    const selected = selectBestEvidence(match.evidence_ids, evidenceMap, referenceYear);
    const credit = mode === 'score'
      ? requirementCredit(req, match, selected, evidenceMap, referenceYear)
      : null;

    if (mode === 'score' && weight > 0) {
      totalWeight += weight;
      earned += weight * credit;
      const component = componentForRequirement(req);
      if (component === 'skills' || component === 'experience') {
        componentAccumulator[component].total += weight;
        componentAccumulator[component].earned += weight * credit;
      }
      if (selected) {
        depthWeight += weight;
        depthWeighted += weight * (DEPTH_SCORE[selected.depth] ?? DEPTH_SCORE.unknown);
      }
      if (req.priority === 'dealbreaker' && credit < 50) hasDealbreaker = true;
    }

    if (mode === 'gate') {
      const status = gateState(match);
      gateChecks.push({
        requirement_id: req.id,
        requirement_text: req.text,
        status,
        reason: match.reason,
      });
      if (req.priority === 'dealbreaker' && status !== 'passed') hasDealbreaker = true;
    }

    if (mode === 'verify') {
      verificationItems.push({
        requirement_id: req.id,
        requirement_text: req.text,
        status: match.evidence_ids?.length ? 'supported' : 'verify',
        reason: match.reason,
      });
    }

    breakdownTable.push({
      requirement_id: req.id,
      requirement_text: req.text,
      category: req.category,
      priority: req.priority,
      assessment_mode: mode,
      relation: match.relation,
      support_state: match.support_state,
      status_label: displayState(mode, match, credit),
      matched_quote: selected?.quote || '',
      selected_evidence_id: selected?.id || null,
      depth: selected?.depth || null,
      recency_year: selected?.recency_year ?? null,
      reason: match.reason,
      inference_path: match.inference_path || [],
      calculation: mode === 'score' ? {
        result: credit,
        relation_base: RELATION_BASE[match.relation] ?? 0,
        support_adjustment: SUPPORT_ADJUSTMENT[match.support_state] ?? 0,
        depth_adjustment: selected ? (DEPTH_ADJUSTMENT[selected.depth] ?? 0) : 0,
        recency_adjustment: selected ? recencyAdjustment(selected.recency_year, referenceYear) : 0,
        priority_weight: weight,
      } : null,
    });
  }

  const finalScore = totalWeight > 0 ? Math.round(earned / totalWeight) : 0;
  const skills = componentAccumulator.skills.total > 0
    ? Math.round(componentAccumulator.skills.earned / componentAccumulator.skills.total)
    : 0;
  const experience = componentAccumulator.experience.total > 0
    ? Math.round(componentAccumulator.experience.earned / componentAccumulator.experience.total)
    : 0;
  const depth = depthWeight > 0 ? Math.round(depthWeighted / depthWeight) : 0;

  let verdict = 'Low evidence';
  if (finalScore >= 80) verdict = 'Strong fit';
  else if (finalScore >= 65) verdict = 'Good fit';
  else if (finalScore >= 50) verdict = 'Potential';
  else if (finalScore >= 35) verdict = 'Partial fit';

  return {
    finalScore,
    verdict,
    hasDealbreaker,
    componentBreakdown: { experience, skills, depth },
    breakdownTable,
    gateChecks,
    verificationItems,
    scoringMeta: {
      scoringVersion: SCORING_VERSION,
      referenceYear,
      scoreBearingRequirements: breakdownTable.filter((row) => row.assessment_mode === 'score').length,
      verificationRequirements: verificationItems.length,
      gateRequirements: gateChecks.length,
    },
  };
}
