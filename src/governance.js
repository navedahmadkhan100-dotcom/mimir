export const GOVERNANCE_VERSION = '4.0.0-governance';

export function buildGovernancePacket({ audit, claimAssessments = [], odinChallenges = [], policyDecisions = [] }) {
  const uncertaintyCount = claimAssessments.filter((c) => ['partially_supported','contextual','ambiguous','not_assessable'].includes(c.state)).length;
  const unsupportedCount = claimAssessments.filter((c) => ['not_evidenced','contradicted'].includes(c.state)).length;
  return {
    governance_version:GOVERNANCE_VERSION,
    intended_use:'human-assisted recruitment evidence evaluation',
    automated_final_decision:false,
    automated_rejection_permitted:false,
    human_oversight_required:true,
    decision_authority:'human recruiter / authorized hiring decision-maker',
    traceability:{
      model_version:audit.model,
      prompt_version:audit.promptVersion,
      scoring_version:audit.scoringVersion,
      policy_version:audit.policyVersion,
      claim_model_version:audit.claimModelVersion,
      entailment_version:audit.entailmentVersion,
      evidence_semantics_version:audit.evidenceSemanticsVersion,
      odin_version:audit.odinVersion,
      ai_gateway_version:audit.aiGatewayVersion,
      evidence_graph_version:audit.evidenceGraphVersion,
      jd_audit_version:audit.jdAuditVersion,
      jd_hash:audit.jdHash,
      masked_cv_hash:audit.maskedCvHash,
      evaluation_hash:audit.evaluationHash,
    },
    risk_summary:{
      uncertainty_count:uncertaintyCount,
      unsupported_or_contradicted_count:unsupportedCount,
      odin_challenge_count:odinChallenges.length,
      bounded_policy_count:policyDecisions.filter((p) => p.credit_cap < 100).length,
    },
    privacy:{
      candidate_identity_required_for_scoring:false,
      client_privacy_boundary:true,
      server_defense_in_depth_masking:true,
      raw_candidate_stored:false,
    },
  };
}
