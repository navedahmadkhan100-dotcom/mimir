import { RELATION_RANK } from './ontology.js';

export const POLICY_VERSION = '4.0.0-evidence-policy';

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

export function buildPolicyDecisions({ structuredJd, matches = [], claimAssessments = [], evidence = [] }) {
  const matchMap = new Map(matches.map((m) => [m.requirement_id,m]));
  const claimMap = new Map(claimAssessments.map((c) => [c.requirement_id,c]));
  const evMap = new Map(evidence.map((e) => [e.id,e]));

  return (structuredJd.requirements || []).map((req) => {
    const match = matchMap.get(req.id) || { relation:'none', evidence_ids:[] };
    const claim = claimMap.get(req.id);
    const reasons = [];
    let creditCap = 100;

    if (claim?.state === 'partially_supported') { creditCap = Math.min(creditCap, 80); reasons.push('Claim is only partially supported.'); }
    if (claim?.state === 'contextual') { creditCap = Math.min(creditCap, 55); reasons.push('Evidence is contextual; full capability is not established.'); }
    if (claim?.state === 'ambiguous') { creditCap = Math.min(creditCap, 45); reasons.push('Evidence remains ambiguous.'); }
    if (claim?.state === 'not_evidenced') { creditCap = 0; reasons.push('Requirement is not evidenced.'); }
    if (claim?.state === 'contradicted') { creditCap = 0; reasons.push('Evidence contradicts the requirement.'); }

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
    };
  });
}
