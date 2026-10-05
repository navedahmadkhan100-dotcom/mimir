import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../public/document-client.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('visual preparation is text-first, background, and OCR is scan-only for native PDFs', () => {
  const recognizes = [...source.matchAll(/worker\.recognize\(/g)].length;
  assert.equal(recognizes, 1, 'scrubCanvas should contain one OCR recognition pass');
  assert.match(source, /async function extractText\(/);
  assert.match(source, /async function prepareVisuals\(/);
  assert.match(source, /scrubNativePdfText/);
  assert.match(source, /pageText\.trim\(\)\.length >= 40/);
  assert.match(source, /OCR_TIMEOUT_MS = 4500/);
  assert.match(source, /scale:1\.15/);
});

test('CV text readiness does not await visual preparation and evaluation has a bounded visual wait', () => {
  assert.match(app, /const data = await window\.MimirDocumentClient\.extractText\(file, kind\)/);
  assert.match(app, /startVisualPreparation\(file, kind, data\);/);
  assert.doesNotMatch(app, /await startVisualPreparation\(file, kind, data\)/);
  assert.match(app, /waitForVisualPreparation\(\{ includeJd: !cachedStructure, maxWaitMs: 8000 \}\)/);
  assert.match(app, /continuing with text and any visual evidence already ready/i);
});
