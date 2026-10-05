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
  assert.match(source, /OCR_TIMEOUT_MS = 3200/);
  assert.match(source, /scale:1\.15/);
});

test('CV text readiness does not await visual preparation and evaluation has a bounded visual wait', () => {
  assert.match(app, /const data = await window\.MimirDocumentClient\.extractText\(file, kind\)/);
  assert.match(app, /startVisualPreparation\(file, kind, data\);/);
  assert.doesNotMatch(app, /await startVisualPreparation\(file, kind, data\)/);
  assert.match(app, /waitForVisualPreparation\(\{ includeJd: !cachedStructure, maxWaitMs: 6000 \}\)/);
  assert.match(app, /continuing with .*CV visuals already ready rather than dropping the entire visual channel/i);
});


test('DOCX visual fidelity uses Word relationship order, detects up to eight visuals, and bypasses OCR on the normal fast path', () => {
  assert.match(source, /MAX_DOCX_VISUALS = 8/);
  assert.match(source, /async function docxVisualCandidates\(zip\)/);
  assert.match(source, /word\/_rels\/document\.xml\.rels/);
  assert.match(source, /DOCX visuals are discovered in document order/);
  assert.match(source, /DOCX technical visuals use a no-OCR fast path/);
  const docxStart = source.indexOf('async function prepareDocxVisuals');
  const docxEnd = source.indexOf('async function extractText', docxStart);
  const docxBlock = source.slice(docxStart, docxEnd);
  assert.doesNotMatch(docxBlock, /getTesseract|scrubCanvas|worker\.recognize/);
  assert.match(docxBlock, /entry\.async\('blob'\)/);
  assert.doesNotMatch(source, /words\.length < 4/);
});


test('UI reports detected DOCX visuals immediately instead of waiting for first prepared asset', () => {
  assert.match(app, /\$\{detectedVisuals\} visuals detected · preparing/);
  assert.match(app, /being prepared on the fast path/);
});
