import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const gemini = readFileSync(new URL('../src/gemini.js', import.meta.url), 'utf8');
const prompt = readFileSync(new URL('../src/prompt.js', import.meta.url), 'utf8');

test('CV evaluation uses a shallow provider schema, never the deep authoritative schema', () => {
  const evalStart = gemini.indexOf('async evaluate(');
  assert.ok(evalStart > 0);
  const evalCode = gemini.slice(evalStart);
  assert.match(evalCode, /this\.client\.interactions\.create/);
  assert.match(evalCode, /schema:\s*providerSafeEvaluationSchema/);
  assert.match(evalCode, /interactions-flat-structured-ajv/);
  assert.doesNotMatch(evalCode, /schema:\s*warmEvaluationSchema/);
  assert.match(evalCode, /this\.client\.models\.generateContent/);
  assert.match(evalCode, /responseMimeType:\s*'application\/json'/);
  assert.match(evalCode, /interactions-prompt-json-local-ajv-fallback/);
});

test('JD compilation keeps structured output and evaluation contract remains rich', () => {
  assert.match(gemini, /jdIntelligenceGenerationSchema/);
  assert.match(gemini, /interactions\.create/);
  assert.match(prompt, /dimension_support/);
  assert.match(prompt, /qualifying_instances/);
  assert.match(prompt, /Capability and responsibility are independent/);
  assert.match(prompt, /Scale is separate from capability/);
});
