import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SYSTEM_INSTRUCTION, JD_SYSTEM_INSTRUCTION, EVALUATION_SYSTEM_INSTRUCTION } from '../src/prompt.js';
import { jdIntelligenceGenerationSchema, warmEvaluationSchema } from '../src/schemas.js';

test('live stage-specific instructions are substantially smaller than legacy all-purpose instruction', () => {
  assert.ok(JD_SYSTEM_INSTRUCTION.length < SYSTEM_INSTRUCTION.length * 0.4);
  assert.ok(EVALUATION_SYSTEM_INSTRUCTION.length < SYSTEM_INSTRUCTION.length * 0.4);
  assert.match(JD_SYSTEM_INSTRUCTION, /AND versus OR|AND versus OR|AND vs OR|Preserve true AND/);
  assert.match(EVALUATION_SYSTEM_INSTRUCTION, /dimension_support/);
});

test('structured-output arrays are bounded to avoid runaway JSON generation', () => {
  assert.equal(jdIntelligenceGenerationSchema.properties.requirements.maxItems, 24);
  assert.equal(warmEvaluationSchema.properties.evidence.maxItems, 48);
  assert.equal(warmEvaluationSchema.properties.matches.maxItems, 24);
});

test('Gemini adapter uses separate output budgets and avoids deprecated sampling controls', () => {
  const src = fs.readFileSync(new URL('../src/gemini.js', import.meta.url), 'utf8');
  assert.match(src, /system_instruction:\s*JD_SYSTEM_INSTRUCTION/);
  assert.match(src, /max_output_tokens:\s*9000/);
  assert.match(src, /systemInstruction:\s*EVALUATION_SYSTEM_INSTRUCTION/);
  assert.match(src, /maxOutputTokens:\s*14000/);
  assert.doesNotMatch(src, /temperature\s*:/);
  assert.doesNotMatch(src, /top_p\s*:/);
  assert.doesNotMatch(src, /top_k\s*:/);
  assert.match(src, /store:\s*false/);
});

test('text-rich visual inputs use a bounded model visual budget', () => {
  const src = fs.readFileSync(new URL('../src/appFactory.js', import.meta.url), 'utf8');
  assert.match(src, /chars < 700/);
  assert.match(src, /kind === 'JD' \? 2 : 4/);
  assert.match(src, /modelCvVisualAssets/);
});
