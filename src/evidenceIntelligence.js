export const EVIDENCE_INTELLIGENCE_VERSION = '4.0.0-observation-schema';

export function buildEvidenceIntelligenceRecord({ auditId, structuredJd, claimAssessments = [], evidenceSemantics = [], policyDecisions = [] }) {
  const reqMap = new Map((structuredJd.requirements || []).map((r) => [r.id,r]));
  const semMap = new Map(evidenceSemantics.map((s) => [s.evidence_id,s]));
  const policyMap = new Map(policyDecisions.map((p) => [p.requirement_id,p]));
  const observations = [];

  for (const claim of claimAssessments) {
    const req = reqMap.get(claim.requirement_id) || {};
    for (const evidenceId of claim.evidence_ids || []) {
      const sem = semMap.get(evidenceId); if (!sem) continue;
      observations.push({
        requirement_id:claim.requirement_id,
        requirement_type:req.requirement_type || 'other',
        strictness:req.strictness || 'not_applicable',
        relation:claim.relation || 'none',
        final_state:claim.state,
        source_type:sem.source_type,
        action_type:sem.strongest_action?.type || 'unknown',
        action_level:Number(sem.strongest_action?.level || 0),
        ownership:sem.ownership,
        has_scale:Boolean(sem.scale?.length),
        maximum_conclusion:sem.maximum_conclusion,
        policy_decision:policyMap.get(claim.requirement_id)?.decision || 'normal_credit',
      });
    }
  }

  return {
    schema_version:EVIDENCE_INTELLIGENCE_VERSION,
    evaluation_ref:String(auditId || ''),
    contains_candidate_identity:false,
    contains_verbatim_cv_quotes:false,
    observations,
  };
}
