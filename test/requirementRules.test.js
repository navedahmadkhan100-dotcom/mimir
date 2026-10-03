import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRequirementSemantics } from '../src/requirementRules.js';

const base = {
  id:'R1', text:'', category:'experience', priority:'required', priority_basis:'JD', assessment_hint:'score',
  strictness:'functional_allowed', requirement_logic:'single', requirement_type:'capability', target_concepts:[], alternatives:[],
  minimum_years:null, minimum_count:null, count_unit:'', required_role_context:[], lifecycle_scope:'not_applicable', deployment_model:'not_applicable', exact_credential:'', version_constraint:'',
};

test('deterministically compiles count, SaaS, E2E and role context from JD wording', () => {
  const r=normalizeRequirementSemantics({ ...base, text:'Done 3-4 SaaS End to End implementation as Oracle ERP Program Manager' });
  assert.equal(r.requirement_type,'counted_experience');
  assert.equal(r.minimum_count,3);
  assert.equal(r.count_unit,'implementation');
  assert.equal(r.deployment_model,'saas');
  assert.equal(r.lifecycle_scope,'end_to_end');
  assert.match(r.required_role_context[0],/Program Manager/i);
});
