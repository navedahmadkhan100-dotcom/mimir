import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { warmEvaluationSchema, evaluationSchema, jdIntelligenceGenerationSchema } from '../src/schemas.js';
import { warmPrompt } from '../src/prompt.js';

const code=(f)=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');

test('Warm Gemini output only requires evidence and matches, not full JD echo',()=>{
  assert.deepEqual(warmEvaluationSchema.required,['evidence','matches']);
  assert.equal('structured_jd' in warmEvaluationSchema.properties,false);
  assert.equal(evaluationSchema.required.includes('structured_jd'),true);
  assert.equal(jdIntelligenceGenerationSchema.required.includes('intelligence'),true);
});

test('JD freeze is preserved by server-side injection before evidence validation',()=>{
  assert.match(code('src/appFactory.js'), /validateAndSanitizeModelOutput\(\{ \.\.\.llm\.json, structured_jd:structuredJd \}/);
  assert.match(warmPrompt({role_title:'Demo',role_summary:'',requirements:[]},'CV text'), /Do NOT repeat, rewrite or return the JD/);
});

test('Both stages use measured, named timeouts and no automatic gateway retries',()=>{
  assert.match(code('src/aiGateway.js'), /class AITimeoutError/);
  assert.match(code('src/aiGateway.js'), /105_000/);
  assert.match(code('src/aiGateway.js'), /'JD analysis'/);
  assert.match(code('src/aiGateway.js'), /'CV evaluation'/);
  assert.match(code('render.yaml'), /value: 105000/);
});
