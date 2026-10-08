import { unionRelevantEvidenceIds } from './evidenceRelevance.js';
export const ODIN_VERSION = '5.0.0-bidirectional-adversarial-verifier';

const OWNERSHIP_REQ_RE = /\b(architect(?:ed|ure)?|design(?:ed|ing)?|led|leadership|owned|ownership|responsible\s+for|strategy|strategic)\b/i;
const WEAK_ACTION_RE = /\b(exposure\s+to|familiar\s+with|worked\s+(?:with|alongside)|assisted|supported|participated|involved|knowledge\s+of)\b/i;
const STRONG_ACTION_RE = /\b(designed|architected|led|owned|implemented|built|migrated|deployed|configured|administered|developed|created|delivered)\b/i;

function evidenceText(e) { return `${e.quote || ''} ${e.visual_observation || ''}`.trim(); }

export function runOdinReview(result, claimAssessments = [], evidenceSemantics = []) {
  const reqMap = new Map((result.structured_jd?.requirements || []).map((r) => [r.id, r]));
  const evidenceMap = new Map((result.evidence || []).map((e) => [e.id, e]));
  const claimMap = new Map(claimAssessments.map((c) => [c.requirement_id,c]));
  const semMap = new Map(evidenceSemantics.map((s) => [s.evidence_id,s]));
  const challenges = [];

  for (const match of result.matches || []) {
    const req = reqMap.get(match.requirement_id);
    if (!req) continue;
    const relevantIds = unionRelevantEvidenceIds(req, match, [...evidenceMap.values()], { threshold:.34, limit:10 });
    const evidence = relevantIds.map((id) => evidenceMap.get(id)).filter(Boolean);
    const semantics = relevantIds.map((id) => semMap.get(id)).filter(Boolean);
    const combined = evidence.map(evidenceText).join(' ');
    const ownershipRequired = OWNERSHIP_REQ_RE.test(req.text || '') || (req.required_role_context || []).some((x) => OWNERSHIP_REQ_RE.test(x));
    const visualOnly = evidence.length > 0 && evidence.every((e) => e.source_type === 'visual');
    const weakOnly = WEAK_ACTION_RE.test(combined) && !STRONG_ACTION_RE.test(combined);
    const claim = claimMap.get(req.id);

    if (ownershipRequired && visualOnly) {
      challenges.push({ requirement_id:req.id, severity:'high', code:'VISUAL_OWNERSHIP_NOT_PROVEN',
        challenge:'The requirement needs ownership/design evidence, but the supporting evidence is visual-only. A diagram can document an architecture without proving the candidate authored or owned it.',
        recommended_state:'contextual' });
    }
    if (ownershipRequired && weakOnly) {
      challenges.push({ requirement_id:req.id, severity:'high', code:'WEAK_ACTION_OVERREACH',
        challenge:'The CV wording indicates exposure/support/participation, not the ownership or design action required by the JD.',
        recommended_state:'contextual' });
    }
    if (req.strictness === 'exact_required' && !['direct','canonical','equivalent','none'].includes(match.relation)) {
      challenges.push({ requirement_id:req.id, severity:'high', code:'EXACT_REQUIREMENT_SUBSTITUTION',
        challenge:`The JD marks this requirement exact, but the relationship is ${match.relation}. Related capability cannot be treated as exact proof.`,
        recommended_state:'contextual' });
    }
    if (semantics.some((s) => s.prohibited_inferences?.includes('candidate_authorship_from_visual_alone')) && ownershipRequired) {
      challenges.push({ requirement_id:req.id, severity:'medium', code:'VISUAL_AUTHORSHIP_BOUNDARY',
        challenge:'The visual may support documented exposure to the depicted technology, but candidate authorship/ownership is outside the evidence boundary.',
        recommended_state:'contextual' });
    }
    const hasDirectOwnership = semantics.some((s) => ['direct','shared'].includes(s.ownership) && Number(s.strongest_action?.level||0) >= 5);
    const hasScale = semantics.some((s) => (s.scale||[]).length > 0);
    if (claim?.not_established?.some((x)=>/ownership|design responsibility/i.test(x)) && hasDirectOwnership) {
      challenges.push({ requirement_id:req.id, severity:'high', code:'FALSE_NEGATIVE_OWNERSHIP', direction:'upgrade',
        challenge:'Claim review says ownership/design is missing, but relevant CV evidence contains direct/shared ownership or leadership language.',
        recommended_state:['direct','canonical','equivalent'].includes(match.relation)?'supported':'partially_supported' });
    }
    if (claim?.not_established?.some((x)=>/scale/i.test(x)) && hasScale) {
      challenges.push({ requirement_id:req.id, severity:'medium', code:'FALSE_NEGATIVE_SCALE', direction:'upgrade',
        challenge:'Claim review says scale is missing, but relevant CV evidence contains an explicit enterprise/global/numeric scale signal.',
        recommended_state:claim.state==='not_evidenced'?'partially_supported':claim.state });
    }
    if (claim?.state === 'not_evidenced' && relevantIds.length && ['direct','canonical','equivalent'].includes(match.relation)) {
      challenges.push({ requirement_id:req.id, severity:'high', code:'FALSE_NEGATIVE_EVIDENCE', direction:'upgrade',
        challenge:'Verified direct/equivalent evidence exists for a claim marked not evidenced.', recommended_state:'supported' });
    }
    if (claim?.not_established?.length) {
      challenges.push({ requirement_id:req.id, severity:'medium', code:'CLAIM_DIMENSION_GAP', direction:'review',
        challenge:`Claim-level review found unresolved dimensions: ${claim.not_established.join('; ')}`,
        recommended_state:claim.state });
    }
  }

  const dedup = new Map();
  for (const c of challenges) dedup.set(`${c.requirement_id}:${c.code}`,c);
  return [...dedup.values()];
}

export function applyOdinToClaims(claimAssessments = [], challenges = []) {
  const rank = { contradicted:0, not_evidenced:1, ambiguous:2, contextual:3, partially_supported:4, supported:5, not_assessable:2 };
  const byReq = new Map();
  for (const c of challenges) {
    if (!byReq.has(c.requirement_id)) byReq.set(c.requirement_id,[]);
    byReq.get(c.requirement_id).push(c);
  }
  return claimAssessments.map((claim) => {
    let state = claim.state;
    const relevant = byReq.get(claim.requirement_id) || [];
    // First apply conservative downgrades.
    for (const c of relevant) {
      if (c.direction === 'upgrade') continue;
      const next = c.recommended_state;
      if (next && (rank[next] ?? 99) < (rank[state] ?? 99)) state = next;
    }
    // Then permit evidence-backed false-negative repairs. These are deterministic
    // challenge codes generated only when relevant verified evidence exists.
    for (const c of relevant) {
      if (c.direction !== 'upgrade') continue;
      const next = c.recommended_state;
      if (next && (rank[next] ?? -1) > (rank[state] ?? -1)) state = next;
    }
    return { ...claim, pre_odin_state:claim.state, state, odin_challenge_codes:relevant.map((c)=>c.code) };
  });
}

export function buildVerificationQuestions(result, challenges = [], claimAssessments = []) {
  const reqMap = new Map((result.structured_jd?.requirements || []).map((r) => [r.id, r]));
  const matchMap = new Map((result.matches || []).map((m) => [m.requirement_id,m]));
  const challengeMap = new Map();
  for (const c of challenges) {
    if (!challengeMap.has(c.requirement_id)) challengeMap.set(c.requirement_id,[]);
    challengeMap.get(c.requirement_id).push(c);
  }
  const questions=[];
  for (const claim of claimAssessments) {
    if (!claim.human_verification_recommended && !challengeMap.has(claim.requirement_id)) continue;
    const req=reqMap.get(claim.requirement_id); if(!req) continue;
    const match=matchMap.get(claim.requirement_id) || {};
    const gaps=[...(claim.not_established||[]), ...(claim.uncertainty_reasons||[])];
    const firstGap=gaps[0] || 'the required capability is not fully established by the CV';
    const q = `The CV evidence for “${req.text}” leaves this unresolved: ${firstGap}. Can you describe a specific project where you personally performed this work, your exact responsibility, scope, and outcome?`;
    questions.push({
      id:`VQ-${req.id}`,
      requirement_id:req.id,
      priority:req.priority,
      claim_state:claim.state,
      question:q,
      why:firstGap,
      evidence_ids:[...(match.evidence_ids||[])],
      expected_resolution:['verified_supported','verified_not_supported','still_uncertain'],
    });
  }
  return questions.slice(0,8);
}
