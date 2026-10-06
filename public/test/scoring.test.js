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
