import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileRelation, strongestOntologyRelation } from '../src/ontology.js';

const req = { target_concepts: ['Azure'], alternatives: [], strictness: 'functional_allowed' };
const evidence = [{ id: 'E1', skills: ['AKS'], capabilities: [] }];

test('AKS deterministically implies Azure exposure', () => {
  const result = strongestOntologyRelation(req, evidence);
  assert.equal(result.relation, 'implied');
});

test('ontology can strengthen an overly literal model relation', () => {
  const result = reconcileRelation(req, evidence, 'adjacent', []);
  assert.equal(result.relation, 'implied');
  assert.equal(result.reconciledByOntology, true);
});

test('official alias is equivalent rather than unrelated', () => {
  const result = strongestOntologyRelation(
    { target_concepts: ['Azure Active Directory'], alternatives: [] },
    [{ skills: ['Entra ID'], capabilities: [] }],
  );
  assert.equal(result.relation, 'equivalent');
});
