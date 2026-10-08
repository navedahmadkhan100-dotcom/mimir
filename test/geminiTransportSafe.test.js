import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const gemini = readFileSync(new URL('../src/gemini.js', import.meta.url), 'utf8');
const prompt = readFileSync(new URL('../src/prompt.js', import.meta.url), 'utf8');

test('candidate evaluation never sends Mimir internal schemas to Gemini', () => {
  const evalStart = gemini.indexOf('async evaluate(');
  assert.ok(evalStart > 0);
  const evalCode = gemini.slice(evalStart);
  assert.match(evalCode, /this\.interactionJson/);
  assert.match(evalCode, /this\.generateJson/);
  assert.doesNotMatch(evalCode, /providerSafeEvaluationSchema|warmEvaluationSchema|evaluationSchema/);
  assert.doesNotMatch(evalCode, /schema\s*:/);
  assert.match(evalCode, /generateContent-json-local-validation-fallback/);
  assert.match(evalCode, /generateContent-plain-json-local-validation-fallback/);
});

test('JD compilation uses schema-free provider transport and local reconstruction', () => {
  const jdStart = gemini.indexOf('async structureJd(');
  const evalStart = gemini.indexOf('async evaluate(');
  assert.ok(jdStart > 0 && evalStart > jdStart);
  const jdCode = gemini.slice(jdStart, evalStart);
  assert.match(jdCode, /normalizeJdTransport/);
  assert.doesNotMatch(jdCode, /providerSafeJdSchema|jdIntelligenceGenerationSchema/);
  assert.doesNotMatch(jdCode, /schema\s*:/);
  assert.match(jdCode, /generateContent-json-local-validation-fallback/);
  assert.match(jdCode, /generateContent-plain-json-local-validation-fallback/);
});

test('compact prompts preserve the qualification-ledger evidence contract', () => {
  assert.match(prompt, /evaluation_dimensions as a flat array/i);
  assert.match(prompt, /capability_name/);
  assert.match(prompt, /responsibility_level/);
  assert.match(prompt, /Never invent scale/i);
  assert.match(prompt, /dimension_support/);
  assert.match(prompt, /qualifying_instances/);
  assert.match(prompt, /ownership/i);
  assert.match(prompt, /Scale/i);
});


test('Interactions primary path uses current schema-free response_format instead of deprecated response_mime_type', () => {
  assert.match(gemini, /response_format:\{type:'text',mime_type:'application\/json'\}/);
  assert.doesNotMatch(gemini, /response_mime_type\s*:/);
});
