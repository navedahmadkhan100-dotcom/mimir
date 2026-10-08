import { unionRelevantEvidenceIds } from './evidenceRelevance.js';
export const ENTAILMENT_VERSION = '5.0.0-crosslinked-dimension-entailment';

const STATE_RANK = Object.freeze({
  contradicted:0, not_evidenced:1, ambiguous:2, contextual:3, partially_supported:4, supported:5, not_assessable:2,
});
const OWNERSHIP_RE = /\b(?:architect(?:ed|ure)?|design(?:ed|ing)?|led|leadership|owned|ownership|responsible\s+for|strategy|strategic)\b/i;
const SCALE_RE = /\b(?:enterprise[-\s]?wide|organisation[-\s]?wide|organization[-\s]?wide|global(?:ly)?|multi[-\s]?(?:country|region|site|tenant)|large[-\s]?scale|at\s+scale|across\s+\d+\s+(?:countries|regions|sites|tenants)|\d{2,}[,+]?\s*(?:users?|devices?|endpoints?|servers?|sites?|employees?|fte|tenants?|applications?|workloads?|countries?|regions?|teams?))\b/i;

function baseState(match = {}) {
  if (match.support_state === 'contradicted') return 'contradicted';
  if (match.support_state === 'not_assessable') return 'not_assessable';
  if (!match.evidence_ids?.length && !match.qualifying_instances?.length) return 'not_evidenced';
  if (['documented','listed'].includes(match.support_state) && ['direct','canonical','equivalent'].includes(match.relation)) return 'supported';
  if (['documented','listed','inferred_graph'].includes(match.support_state) && ['implied','functional'].includes(match.relation)) return 'partially_supported';
  if (match.support_state === 'unsettled' || ['transferable','adjacent'].includes(match.relation)) return 'contextual';
  if (match.evidence_ids?.length) return 'ambiguous';
  return 'not_evidenced';
}

function downgrade(current, next) {
  return (STATE_RANK[next] ?? 99) < (STATE_RANK[current] ?? 99) ? next : current;
}

export function assessClaims({ claimModel, structuredJd, matches = [], evidenceSemantics = [], evidence = [] }) {
  const reqMap = new Map((structuredJd.requirements || []).map((r) => [r.id, r]));
  const matchMap = new Map(matches.map((m) => [m.requirement_id, m]));
  const semMap = new Map(evidenceSemantics.map((s) => [s.evidence_id, s]));

  return (claimModel.claims || []).map((claim) => {
    const req = reqMap.get(claim.requirement_id) || {};
    const match = matchMap.get(claim.requirement_id) || { evidence_ids:[], relation:'none', support_state:'missing', qualifying_instances:[] };
    const relevantIds = unionRelevantEvidenceIds(req, match, evidence, { threshold:.34, limit:10 });
    const semantics = relevantIds.map((id) => semMap.get(id)).filter(Boolean);
    let state = baseState(match);
    const established = [];
    const notEstablished = [];
    const uncertainty = [];

    if (match.evidence_ids?.length) established.push('source-backed evidence exists');
    if (relevantIds.some((id)=>!(match.evidence_ids||[]).includes(id))) established.push('corroborating evidence exists elsewhere in the CV');
    if (['direct','canonical','equivalent'].includes(match.relation)) established.push(`relationship is ${match.relation}`);
    else if (match.relation && match.relation !== 'none') uncertainty.push(`relationship is ${match.relation}, not exact equivalence`);

    const ownershipRequired = claim.ownership_required || OWNERSHIP_RE.test(req.text || '');
    if (ownershipRequired) {
      if (semantics.some((s) => ['direct','shared'].includes(s.ownership) && (s.strongest_action?.level || 0) >= 5)) established.push('ownership/leadership action is evidenced');
      else {
        notEstablished.push('required ownership/design responsibility is not established');
        state = downgrade(state, semantics.length ? 'contextual' : 'not_evidenced');
      }
    }

    if (claim.scale_required || SCALE_RE.test(req.text || '')) {
      if (semantics.some((s) => s.scale?.length)) established.push('required scale signal is evidenced');
      else {
        notEstablished.push('required scale is not established');
        state = downgrade(state, 'partially_supported');
      }
    }

    if (req.strictness === 'exact_required' || ['exact_technology','credential','methodology'].includes(req.requirement_type)) {
      if (!['direct','canonical','equivalent'].includes(match.relation)) {
        notEstablished.push('exact requirement is not established by a substitute/adjacent relationship');
        state = downgrade(state, match.evidence_ids?.length ? 'contextual' : 'not_evidenced');
      }
    }

    if (req.lifecycle_scope === 'end_to_end') {
      const phases = new Set([...(match.lifecycle_phases || [])]);
      for (const i of match.qualifying_instances || []) for (const p of i.lifecycle_phases || []) phases.add(p);
      const phaseCount = [...phases].filter((p) => p && p !== 'unknown').length;
      if (phaseCount >= 4) established.push('multi-phase lifecycle evidence exists');
      else {
        notEstablished.push('end-to-end lifecycle coverage is not fully established');
        state = downgrade(state, phaseCount ? 'partially_supported' : 'not_evidenced');
      }
    }

    if (Number(req.minimum_count) > 0) {
      const count = new Set((match.qualifying_instances || []).map((i) => i.project_key).filter(Boolean)).size;
      if (count >= req.minimum_count) established.push(`${count} distinct qualifying instances identified`);
      else {
        notEstablished.push(`only ${count} of ${req.minimum_count} required distinct instances established`);
        state = downgrade(state, count ? 'partially_supported' : 'not_evidenced');
      }
    }

    const visualOnly = semantics.length > 0 && semantics.every((s) => s.source_type === 'visual');
    if (visualOnly && ownershipRequired) {
      uncertainty.push('visual evidence alone cannot establish candidate authorship/ownership');
      state = downgrade(state, 'contextual');
    }

    const whatWouldChange = [];
    for (const gap of notEstablished) {
      if (/ownership|design responsibility/i.test(gap)) whatWouldChange.push('Explicit project evidence showing the candidate personally designed, owned, led, or made the relevant decisions.');
      else if (/scale/i.test(gap)) whatWouldChange.push('A concrete scale indicator such as users, endpoints, sites, countries, workloads, or enterprise scope.');
      else if (/exact requirement/i.test(gap)) whatWouldChange.push('Direct evidence of the exact required technology, method, or credential rather than a related substitute.');
      else if (/lifecycle/i.test(gap)) whatWouldChange.push('Evidence covering the missing delivery phases, especially build/testing/cutover/go-live where required.');
      else if (/distinct instances/i.test(gap)) whatWouldChange.push('Additional distinct projects with their own dated/project context and qualifying evidence.');
    }
    if (!whatWouldChange.length && ['ambiguous','contextual','partially_supported','not_assessable'].includes(state)) {
      whatWouldChange.push('A specific project example stating the candidate’s personal action, ownership, scope, and outcome.');
    }

    return {
      claim_id: claim.claim_id,
      requirement_id: claim.requirement_id,
      statement: claim.statement,
      state,
      evidence_ids: [...new Set([...(match.evidence_ids || []), ...relevantIds])],
      relation: match.relation || 'none',
      established,
      not_established: notEstablished,
      uncertainty_reasons: uncertainty,
      maximum_conclusion: semantics.map((s) => s.maximum_conclusion).sort().pop() || 'no_evidence',
      what_would_change: [...new Set(whatWouldChange)],
      human_verification_recommended: ['ambiguous','contextual','partially_supported','not_assessable'].includes(state),
    };
  });
}
