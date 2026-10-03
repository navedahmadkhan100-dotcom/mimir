import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileRelation, strongestOntologyRelation, relationBetween } from '../src/ontology.js';

const req = { target_concepts: ['Azure'], alternatives: [], strictness: 'functional_allowed', deployment_model: 'not_applicable' };
const evidence = [{ id: 'E1', skills: ['AKS'], capabilities: [] }];

test('AKS deterministically maps to Azure and Kubernetes through canonical product knowledge', () => {
  const result = strongestOntologyRelation(req, evidence);
  assert.equal(result.relation, 'canonical');
  assert.equal(relationBetween('AKS', 'Kubernetes'), 'canonical');
});

test('ontology can strengthen an overly literal model relation', () => {
  const result = reconcileRelation(req, evidence, 'adjacent', []);
  assert.equal(result.relation, 'canonical');
  assert.equal(result.reconciledByOntology, true);
});

test('official alias/rebrand is equivalent rather than unrelated', () => {
  const result = strongestOntologyRelation(
    { target_concepts: ['Azure Active Directory'], alternatives: [], deployment_model: 'not_applicable' },
    [{ skills: ['Entra ID'], capabilities: [] }],
  );
  assert.equal(result.relation, 'equivalent');
});

test('Oracle Fusion Financials canonically proves SaaS without requiring the literal SaaS keyword', () => {
  assert.equal(relationBetween('Oracle Fusion Financials Cloud', 'SaaS'), 'canonical');
  assert.equal(relationBetween('Oracle EBS R12', 'SaaS'), 'none');
  assert.equal(relationBetween('OCI', 'SaaS'), 'none');
});
