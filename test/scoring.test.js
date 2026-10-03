import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDeterministicScore, effectiveAssessmentMode, recencyAdjustment } from '../src/scoring.js';

const baseEvidence = {
  id: 'E1',
  quote: 'Built services in .NET 8 and ASP.NET Core.',
  skills: ['.NET 8', 'ASP.NET Core'],
  capabilities: ['backend development'],
  depth: 'used',
  recency_year: null,
  duration_months: null,
  career_context: 'Role',
};

function jd(requirements) {
  return { role_title: 'Test Role', role_summary: 'Test', requirements };
}

function req(overrides = {}) {
  return {
    id: 'R1',
    text: 'Strong .NET experience',
    category: 'skill',
    priority: 'required',
    priority_basis: 'required',
    assessment_hint: 'score',
    strictness: 'functional_allowed',
    requirement_logic: 'single',
    target_concepts: ['.NET'],
    alternatives: [],
    minimum_years: null,
    ...overrides,
  };
}

function match(overrides = {}) {
  return {
    requirement_id: 'R1',
    evidence_ids: ['E1'],
    relation: 'direct',
    support_state: 'documented',
    reason: 'Direct evidence.',
    inference_path: [],
    ...overrides,
  };
}

test('unknown recency is neutral instead of a 40% penalty', () => {
  assert.equal(recencyAdjustment(null, 2026), 0);
  const result = computeDeterministicScore({ evidence: [baseEvidence], matches: [match()] }, jd([req()]), { referenceYear: 2026 });
  assert.equal(result.finalScore, 100);
  assert.equal(result.componentBreakdown.skills, 100);
});

test('generic communication requirement is interview verification, not a zero-score failure', () => {
  const communication = req({
    id: 'R1', text: 'Strong communication skills in English', category: 'behavioral', target_concepts: ['communication'], strictness: 'not_applicable',
  });
  const technical = req({ id: 'R2', text: 'Strong .NET experience' });
  const result = computeDeterministicScore({
    evidence: [{ ...baseEvidence, id: 'E2' }],
    matches: [
      { requirement_id: 'R1', evidence_ids: [], relation: 'none', support_state: 'not_assessable', reason: 'Verify in interview.', inference_path: [] },
      { ...match(), requirement_id: 'R2', evidence_ids: ['E2'] },
    ],
  }, jd([communication, technical]), { referenceYear: 2026 });
  assert.equal(effectiveAssessmentMode(communication), 'verify');
  assert.equal(result.finalScore, 100);
  assert.equal(result.verificationItems.length, 1);
});

test('functional tool substitute receives strong capability credit when exact tool is not mandatory', () => {
  const r = req({ text: 'Build CI/CD pipelines using Jenkins or equivalent', target_concepts: ['CI/CD'], alternatives: ['Jenkins'], strictness: 'functional_allowed' });
  const e = { ...baseEvidence, quote: 'Designed GitLab CI pipelines for build, test and deployment.', skills: ['GitLab CI'], capabilities: ['CI/CD'], depth: 'owned' };
  const m = match({ relation: 'functional', support_state: 'documented', reason: 'Same CI/CD capability.' });
  const result = computeDeterministicScore({ evidence: [e], matches: [m] }, jd([r]), { referenceYear: 2026 });
  assert.equal(result.finalScore, 88);
});

test('exact-required tools cap substitutes even if functionally related', () => {
  const r = req({ text: '5+ years Jenkins mandatory', target_concepts: ['Jenkins'], strictness: 'exact_required', priority: 'dealbreaker' });
  const e = { ...baseEvidence, quote: 'Designed GitLab CI pipelines.', skills: ['GitLab CI'], capabilities: ['CI/CD'], depth: 'owned' };
  const result = computeDeterministicScore({ evidence: [e], matches: [match({ relation: 'functional' })] }, jd([r]), { referenceYear: 2026 });
  assert.equal(result.finalScore, 45);
  assert.equal(result.hasDealbreaker, true);
});

test('explicit language level remains a verification gate rather than generic soft-skill exclusion', () => {
  const language = req({ id: 'R1', text: 'English C1 required with strong communication skills', category: 'language', target_concepts: ['English C1'], strictness: 'exact_required' });
  assert.equal(effectiveAssessmentMode(language), 'gate');
});

test('counted experience does not let broad experience substitute for a 3-project minimum', () => {
  const counted = req({
    text: 'Done 3-4 SaaS end to end implementations as Oracle ERP Program Manager',
    category: 'experience', priority: 'required', requirement_type: 'counted_experience',
    minimum_count: 3, count_unit: 'implementation', required_role_context: ['Oracle ERP Program Manager'],
    lifecycle_scope: 'end_to_end', deployment_model: 'saas', target_concepts: ['Oracle ERP'],
  });
  const e = { ...baseEvidence, id: 'E9', quote: 'Led Oracle Fusion Financials implementation from requirements through go-live.', skills: ['Oracle Fusion Financials'], capabilities: ['Oracle ERP'], depth: 'led', project_key: 'Employer 1 | 2024 | Fusion Financials', lifecycle_phases: ['requirements','blueprint_design','build_config','testing','cutover','go_live'] };
  const m = match({ evidence_ids:['E9'], relation:'canonical', support_state:'documented', qualifying_instances:[{ project_key:e.project_key, evidence_ids:['E9'], role_alignment:'exact', deployment_model:'saas', lifecycle_phases:e.lifecycle_phases, reason:'One qualifying implementation.' }], lifecycle_phases:e.lifecycle_phases });
  const result = computeDeterministicScore({ evidence:[e], matches:[m] }, jd([counted]), { referenceYear:2026 });
  assert.ok(result.finalScore >= 55 && result.finalScore <= 65, `expected one-of-three implementation evidence to cap near 60, got ${result.finalScore}`);
  assert.equal(result.constraintChecks[0].verified, 1);
});

test('three distinct qualifying SaaS E2E projects satisfy a three-project count', () => {
  const counted = req({ text:'3 SaaS end-to-end implementations as Oracle ERP Program Manager', category:'experience', priority:'required', requirement_type:'counted_experience', minimum_count:3, count_unit:'implementation', required_role_context:['Oracle ERP Program Manager'], lifecycle_scope:'end_to_end', deployment_model:'saas', target_concepts:['Oracle ERP'] });
  const phases=['requirements','blueprint_design','build_config','testing','cutover','go_live'];
  const evidence=[1,2,3].map((n)=>({ ...baseEvidence, id:`E${n}`, quote:`Oracle Fusion Financials implementation ${n}.`, skills:['Oracle Fusion Financials'], capabilities:['Oracle ERP'], depth:'led', project_key:`Project ${n}`, lifecycle_phases:phases }));
  const instances=evidence.map((e)=>({ project_key:e.project_key,evidence_ids:[e.id],role_alignment:'exact',deployment_model:'saas',lifecycle_phases:phases,reason:'Qualifying.' }));
  const m=match({ evidence_ids:evidence.map((e)=>e.id), relation:'canonical', support_state:'documented', qualifying_instances:instances, lifecycle_phases:phases });
  const result=computeDeterministicScore({ evidence,matches:[m] }, jd([counted]), { referenceYear:2026 });
  assert.ok(result.finalScore >= 95);
});

test('wrong certification track cannot receive functional-equivalent credit', () => {
  const credential=req({ text:'Oracle Cloud Certified in any Fin/SCM Module', category:'certification', priority:'required', requirement_type:'credential', strictness:'exact_required', target_concepts:['Oracle Fusion Financials Certification'], exact_credential:'Oracle Fusion Financials/SCM module certification' });
  const e={ ...baseEvidence, quote:'Oracle Cloud Associate Architect', skills:['Oracle Cloud Infrastructure'], capabilities:['cloud architecture'], depth:'mentioned' };
  const result=computeDeterministicScore({ evidence:[e], matches:[match({relation:'transferable',support_state:'listed'})] }, jd([credential]), { referenceYear:2026 });
  assert.ok(result.finalScore <= 20);
});

test('end-to-end claim requires lifecycle coverage instead of the phrase alone', () => {
  const life=req({ text:'End-to-end ERP implementation', category:'experience', priority:'required', requirement_type:'lifecycle', lifecycle_scope:'end_to_end', target_concepts:['ERP implementation'] });
  const e={ ...baseEvidence, quote:'Led SIT and UAT testing.', skills:['Oracle Fusion'], capabilities:['testing'], depth:'led', lifecycle_phases:['testing'] };
  const result=computeDeterministicScore({ evidence:[e], matches:[match({relation:'transferable',support_state:'documented',lifecycle_phases:['testing']})] }, jd([life]), { referenceYear:2026 });
  assert.ok(result.finalScore <= 45);
});
