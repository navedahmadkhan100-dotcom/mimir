import test from 'node:test';
import assert from 'node:assert/strict';

import { buildClaimModel } from '../src/claimModel.js';
import { analyzeEvidenceSemantics } from '../src/evidenceSemantics.js';
import { assessClaims } from '../src/entailment.js';
import { runOdinReview, applyOdinToClaims, buildVerificationQuestions } from '../src/odin.js';
import { buildPolicyDecisions } from '../src/policyEngine.js';
import { computeDeterministicScore } from '../src/scoring.js';
import { buildEvidenceIntelligenceRecord } from '../src/evidenceIntelligence.js';
import { buildEvidenceGraph } from '../src/evidenceGraph.js';
import { auditStructuredJd } from '../src/jdAudit.js';

const requirement = {
  id:'R1', text:'Design and own Microsoft Intune architecture for enterprise endpoint management',
  category:'skill', priority:'required', priority_basis:'required', assessment_hint:'score',
  strictness:'exact_required', requirement_logic:'single', requirement_type:'exact_technology',
  target_concepts:['Microsoft Intune'], alternatives:[], minimum_years:null, minimum_count:null,
  count_unit:'', required_role_context:[], lifecycle_scope:'not_applicable', deployment_model:'not_applicable',
  exact_credential:'', version_constraint:'',
};
const jd = { role_title:'Endpoint Architect', role_summary:'Test', requirements:[requirement] };

function resultWithEvidence(evidence, matchOverrides={}) {
  return {
    structured_jd:jd,
    evidence:[evidence],
    matches:[{
      requirement_id:'R1', evidence_ids:[evidence.id], relation:'direct', support_state:'documented',
      reason:'Matched.', inference_path:[], lifecycle_phases:[], qualifying_instances:[], ...matchOverrides,
    }],
  };
}

test('weak participation cannot entail architecture ownership', () => {
  const evidence = {
    id:'E1', source_type:'text', quote:'Worked alongside the Intune architecture team and supported endpoint issues.',
    visual_asset_id:null, visual_observation:'', source_page:null, source_hint:'', skills:['Microsoft Intune'], capabilities:['endpoint management'],
    depth:'used', recency_year:2026, duration_months:null, career_context:'Role', project_key:'P1', role_context:'', lifecycle_phases:[],
  };
  const result = resultWithEvidence(evidence);
  const claimModel = buildClaimModel(jd);
  const semantics = analyzeEvidenceSemantics(result.evidence);
  const pre = assessClaims({ claimModel, structuredJd:jd, matches:result.matches, evidenceSemantics:semantics });
  assert.equal(pre[0].state, 'contextual');
  assert.match(pre[0].not_established.join(' '), /ownership/i);

  const odin = runOdinReview(result, pre, semantics);
  assert.ok(odin.some((x) => x.code === 'WEAK_ACTION_OVERREACH'));
  const claims = applyOdinToClaims(pre, odin);
  const policies = buildPolicyDecisions({ structuredJd:jd, matches:result.matches, claimAssessments:claims, evidence:result.evidence });
  assert.ok(policies[0].credit_cap <= 55);

  const score = computeDeterministicScore(result, jd, { referenceYear:2026, policyDecisions:policies, claimAssessments:claims });
  assert.ok(score.finalScore <= 55);
  assert.equal(score.breakdownTable[0].score_lineage.policy_cap, policies[0].credit_cap);
});

test('visual-only architecture cannot prove candidate authorship', () => {
  const evidence = {
    id:'E2', source_type:'visual', quote:'', visual_asset_id:'CV-V1', visual_observation:'Architecture diagram shows Intune, Entra ID and Autopilot.',
    source_page:2, source_hint:'PDF page 2', skills:['Microsoft Intune'], capabilities:['endpoint management'],
    depth:'owned', recency_year:2026, duration_months:null, career_context:'', project_key:'P1', role_context:'', lifecycle_phases:[],
  };
  const result = resultWithEvidence(evidence);
  const claimModel = buildClaimModel(jd);
  const semantics = analyzeEvidenceSemantics(result.evidence);
  assert.equal(semantics[0].ownership, 'unestablished');
  assert.ok(semantics[0].prohibited_inferences.includes('candidate_authorship_from_visual_alone'));
  const pre = assessClaims({ claimModel, structuredJd:jd, matches:result.matches, evidenceSemantics:semantics });
  const odin = runOdinReview(result, pre, semantics);
  assert.ok(odin.some((x) => x.code === 'VISUAL_OWNERSHIP_NOT_PROVEN'));
});

test('strong explicit design ownership can remain supported', () => {
  const evidence = {
    id:'E3', source_type:'text', quote:'Designed and owned the Microsoft Intune architecture for 18,000 enterprise endpoints.',
    visual_asset_id:null, visual_observation:'', source_page:null, source_hint:'', skills:['Microsoft Intune'], capabilities:['endpoint management'],
    depth:'led', recency_year:2026, duration_months:24, career_context:'Role', project_key:'P1', role_context:'Architect', lifecycle_phases:['blueprint_design','build_config'],
  };
  const result = resultWithEvidence(evidence);
  const claimModel = buildClaimModel(jd);
  const semantics = analyzeEvidenceSemantics(result.evidence);
  const pre = assessClaims({ claimModel, structuredJd:jd, matches:result.matches, evidenceSemantics:semantics });
  assert.equal(pre[0].state, 'supported');
  assert.equal(semantics[0].ownership, 'direct');
  assert.ok(semantics[0].scale.length > 0);
});

test('verification questions are generated for uncertainty', () => {
  const evidence = {
    id:'E4', source_type:'text', quote:'Supported Microsoft Intune in an enterprise environment.',
    visual_asset_id:null, visual_observation:'', source_page:null, source_hint:'', skills:['Microsoft Intune'], capabilities:['endpoint management'],
    depth:'used', recency_year:2026, duration_months:null, career_context:'Role', project_key:'P1', role_context:'', lifecycle_phases:[],
  };
  const result = resultWithEvidence(evidence);
  const claimModel = buildClaimModel(jd);
  const semantics = analyzeEvidenceSemantics(result.evidence);
  const pre = assessClaims({ claimModel, structuredJd:jd, matches:result.matches, evidenceSemantics:semantics });
  const odin = runOdinReview(result, pre, semantics);
  const claims = applyOdinToClaims(pre, odin);
  const qs = buildVerificationQuestions(result, odin, claims);
  assert.equal(qs.length, 1);
  assert.match(qs[0].question, /specific project/i);
});

test('evidence intelligence record contains patterns but not CV quotes', () => {
  const evidence = {
    id:'E5', source_type:'text', quote:'Designed Intune architecture.', visual_asset_id:null, visual_observation:'', source_page:null, source_hint:'',
    skills:['Microsoft Intune'], capabilities:['endpoint management'], depth:'led', recency_year:2026, duration_months:null, career_context:'Role', project_key:'P1', role_context:'', lifecycle_phases:[],
  };
  const result = resultWithEvidence(evidence);
  const claimModel = buildClaimModel(jd);
  const semantics = analyzeEvidenceSemantics(result.evidence);
  const claims = assessClaims({ claimModel, structuredJd:jd, matches:result.matches, evidenceSemantics:semantics });
  const policies = buildPolicyDecisions({ structuredJd:jd, matches:result.matches, claimAssessments:claims, evidence:result.evidence });
  const record = buildEvidenceIntelligenceRecord({ auditId:'MIMIR-TEST', structuredJd:jd, claimAssessments:claims, evidenceSemantics:semantics, policyDecisions:policies });
  const json = JSON.stringify(record);
  assert.equal(record.contains_candidate_identity, false);
  assert.equal(record.contains_verbatim_cv_quotes, false);
  assert.doesNotMatch(json, /Designed Intune architecture\./);
});


test('evidence graph preserves claim-to-evidence provenance without storing CV quotes in nodes', () => {
  const structuredJd = { requirements:[{ id:'R1', text:'Intune architecture', target_concepts:['Microsoft Intune'], alternatives:[] }] };
  const evidence = [{ id:'E1', source_type:'text', quote:'Designed Intune architecture.', skills:['Microsoft Intune'], capabilities:[], source_page:2 }];
  const matches = [{ requirement_id:'R1', evidence_ids:['E1'], relation:'direct', support_state:'documented' }];
  const claims = [{ requirement_id:'R1', claim_id:'C-R1', state:'supported' }];
  const semantics = [{ evidence_id:'E1', source_type:'text', strongest_action:{type:'design',level:6}, ownership:'direct', maximum_conclusion:'architecture_or_strategy' }];
  const graph = buildEvidenceGraph({ structuredJd, evidence, matches, claimAssessments:claims, evidenceSemantics:semantics });
  assert.ok(graph.edges.some((e) => e.from === 'E1' && e.relation === 'SUPPORTS_CLAIM' && e.to === 'C-R1'));
  assert.equal(graph.nodes.find((n) => n.id === 'E1').quote, undefined);
  assert.equal(graph.nodes.find((n) => n.id === 'E1').source_page, 2);
});

test('JD audit flags internally conflicting priority wording', () => {
  const audit = auditStructuredJd({ requirements:[{ id:'R1', text:'Intune is mandatory but preferred for this role', requirement_type:'capability', strictness:'normal', requirement_logic:'all_of' }] });
  assert.ok(audit.issues.some((i) => i.code === 'PRIORITY_CONTRADICTION'));
});

test('evidence policy prevents contextual evidence receiving full scoring authority', () => {
  const structuredJd = { requirements:[{ id:'R1', text:'Design Intune architecture', requirement_type:'capability', strictness:'exact_required', weight:10, target_concepts:['Microsoft Intune'], alternatives:[], importance:'must_have', minimum_years:null, minimum_count:null, lifecycle_scope:'not_applicable' }] };
  const matches = [{ requirement_id:'R1', evidence_ids:['E1'], relation:'adjacent', support_state:'documented', inference_path:[], lifecycle_phases:[], qualifying_instances:[] }];
  const claimAssessments = [{ requirement_id:'R1', state:'contextual' }];
  const decisions = buildPolicyDecisions({ structuredJd, matches, claimAssessments, evidence:[] });
  assert.ok(decisions[0].credit_cap <= 55);
});
