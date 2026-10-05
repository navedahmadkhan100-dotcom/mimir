import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../public/document-client.js', import.meta.url), 'utf8');

test('visual preparation reuses OCR worker and avoids second OCR pass', () => {
  const recognizes = [...source.matchAll(/worker\.recognize\(/g)].length;
  assert.equal(recognizes, 1, 'scrubCanvas should contain one OCR recognition pass');
  assert.match(source, /let ocrWorker = null/);
  assert.match(source, /pageSensitive\.length > 0 \|\| pageText\.trim\(\)\.length < 40/);
  assert.match(source, /scale:1\.20/);
});
