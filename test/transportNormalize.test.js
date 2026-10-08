import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEvaluationTransport } from '../src/transportNormalize.js';

test('transport normalizer preserves semantic claims and only fills structure', () => {
  const raw = {
    evidence: [{
      id:'E7', quote:'Owned overall technical architecture', source_type:'text', depth:'owned',
      skills:['AI architecture'], capabilities:['architecture ownership'], project_key:'colenio', role_context:'VP Architecture'
    }],
    matches: [{
      requirement_id:'R2', evidence_ids:['E7'], relation:'direct', support_state:'documented',
      reason:'Direct ownership evidence', dimension_support:[{
        dimension:'responsibility', evidence_ids:['E7'], relation:'direct', support_state:'documented', reason:'Owned architecture'
      }]
    }]
  };
  const out = normalizeEvaluationTransport(raw);
  assert.equal(out.evidence[0].quote, 'Owned overall technical architecture');
  assert.equal(out.evidence[0].depth, 'owned');
  assert.equal(out.matches[0].support_state, 'documented');
  assert.equal(out.matches[0].dimension_support[0].dimension, 'responsibility');
  assert.deepEqual(out.matches[0].qualifying_instances, []);
  assert.deepEqual(out.matches[0].inference_path, []);
  assert.equal(out.evidence[0].visual_asset_id, null);
  assert.equal(out.evidence[0].recency_year, null);
});

test('transport normalizer defaults malformed enum values conservatively', () => {
  const out = normalizeEvaluationTransport({
    evidence:[{quote:'Python', source_type:'weird', depth:'superhuman'}],
    matches:[{requirement_id:'R1', relation:'magic', support_state:'certain'}]
  });
  assert.equal(out.evidence[0].source_type, 'text');
  assert.equal(out.evidence[0].depth, 'unknown');
  assert.equal(out.matches[0].relation, 'none');
  assert.equal(out.matches[0].support_state, 'missing');
});

test('schema-free normalization strips unexpected provider keys instead of failing local validation', () => {
  const out = normalizeEvaluationTransport({
    evidence:[{id:'E1',quote:'Designed AI architecture.',source_type:'text',depth:'owned',model_comment:'extra'}],
    matches:[{requirement_id:'R1',evidence_ids:['E1'],relation:'direct',support_state:'documented',reason:'direct',unexpected:true}],
    extra_top_level:'ignored',
  });
  assert.equal(Object.hasOwn(out.evidence[0],'model_comment'),false);
  assert.equal(Object.hasOwn(out.matches[0],'unexpected'),false);
  assert.deepEqual(Object.keys(out).sort(),['evidence','matches']);
});
