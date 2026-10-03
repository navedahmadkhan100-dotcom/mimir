import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, '..');
const repoRoot = path.resolve(backendRoot, '..');

function read(rel) { return fs.readFileSync(path.resolve(repoRoot, rel), 'utf8'); }

test('AWS SAM template deploys backend as Lambda Function URL', () => {
  const template = read('template.yaml');
  assert.match(template, /CodeUri:\s+backend\//);
  assert.match(template, /Runtime:\s+nodejs22\.x/);
  assert.match(template, /Handler:\s+lambda\.handler/);
  assert.match(template, /FunctionUrlConfig:/);
  assert.match(template, /AuthType:\s+NONE/);
  assert.match(template, /MIMIR_DEPLOYMENT:\s+aws-lambda/);
});

test('backend package contains Lambda adapter and excludes retired server document parsers', () => {
  const pkg = JSON.parse(read('backend/package.json'));
  assert.equal(pkg.version, '4.2.0');
  assert.ok(pkg.dependencies['@codegenie/serverless-express']);
  for (const retired of ['mammoth','unpdf','jszip','sharp','tesseract.js','pdf-to-img']) {
    assert.equal(pkg.dependencies[retired], undefined);
  }
});

test('frontend is configured for Lambda-safe payload budgeting', () => {
  const app = read('frontend/public/app.js');
  const doc = read('frontend/public/document-client.js');
  const config = read('frontend/public/config.js');
  assert.match(app, /MIMIR_MAX_API_PAYLOAD_BYTES/);
  assert.match(app, /fitEvaluationPayload/);
  assert.match(doc, /MAX_VISUAL_EDGE = 1280/);
  assert.match(doc, /browser-document-intelligence-2\.3\.0-lambda-safe/);
  assert.match(config, /maxApiPayloadBytes:\s*4700000/);
  assert.match(config, /serverUiExport:\s*false/);
});

test('Netlify build injects the Lambda API URL instead of hardcoding a provider hostname', () => {
  const netlify = read('netlify.toml');
  const writer = read('frontend/scripts/write-public-config.mjs');
  assert.match(netlify, /base = "frontend"/);
  assert.match(writer, /MIMIR_API_BASE/);
  assert.doesNotMatch(writer, /northflank/i);
  assert.doesNotMatch(writer, /onrender/i);
});
