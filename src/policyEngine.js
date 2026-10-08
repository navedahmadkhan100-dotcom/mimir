import { RELATION_RANK } from './ontology.js';

export const POLICY_VERSION = '5.0.0-boundary-only-policy';

const NON_EQUIVALENT = [
  ['microsoft configuration manager','microsoft intune'],
  ['aws','azure'], ['azure','google cloud platform'], ['aws','google cloud platform'],
  ['react','angular'], ['terraform','ansible'], ['java','kotlin'],
  ['oracle e-business suite','oracle fusion cloud erp'],
];

function norm(v=''){ return String(v).toLowerCase().replace(/\s+/g,' ').trim(); }
function isNonEquivalent(a,b){
  const x=norm(a), y=norm(b);
  return NON_EQUIVALENT.some(([p,q]) => (x.includes(p)&&y.includes(q)) || (x.includes(q)&&y.includes(p)));
}

/**
 * Policy is intentionally narrow. It enforces hard factual/exact boundaries only.
 * Partial/contextual evidence is scored by the dimension engine instead of being
 * flattened into a coarse 55/80 cap. This prevents valid ownership/capability
 * evidence from being destroyed by a generic claim-state label.
 */
export function buildPolicyDecisions({ structuredJd, matches = [], claimAssessments = [], evidence = [] }) {
  const matchMap = new Map(matches.map((m) => [m.requirement_id,m]));
  const claimMap = new Map(claimAssessments.map((c) => [c.requirement_id,c]));
  const evMap = new Map(evidence.map((e) => [e.id,e]));

  return (structuredJd.requirements || []).map((req) => {
    const match = matchMap.get(req.id) || { relation:'none', evidence_ids:[] };
    const claim = claimMap.get(req.id);
    const reasons = [];
    let creditCap = 100;

    if (claim?.state === 'contradicted') {
      creditCap = 0;
      reasons.push('Verified evidence contradicts the requirement.');
    } else if (claim?.state === 'not_evidenced' && !(match.evidence_ids || []).length && !(match.qualifying_instances || []).length) {
      creditCap = 0;
      reasons.push('No verified evidence is available for this requirement.');
    }

    if (req.strictness === 'exact_required' && (RELATION_RANK[match.relation] || 0) < RELATION_RANK.equivalent) {
      creditCap = Math.min(creditCap, 45);
      reasons.push('JD requires the exact concept; semantic substitutes cannot fully satisfy it.');
    }

    const targets = [...(req.target_concepts || []), ...(req.alternatives || [])];
    const sources = (match.evidence_ids || []).flatMap((id) => {
      const e = evMap.get(id); return e ? [...(e.skills || []), ...(e.capabilities || [])] : [];
    });
    if (req.strictness === 'exact_required' && sources.some((s) => targets.some((t) => isNonEquivalent(s,t)))) {
      creditCap = Math.min(creditCap, 45);
      reasons.push('A related concept is explicitly non-equivalent to the exact JD requirement.');
    }

    return {
      requirement_id:req.id,
      claim_state:claim?.state || 'not_evidenced',
      credit_cap:creditCap,
      decision:creditCap === 0 ? 'do_not_credit' : creditCap < 100 ? 'credit_with_boundary' : 'normal_credit',
      reasons,
      jd_specific_policy:true,
      dimension_scoring_authoritative:true,
    };
  });
}
