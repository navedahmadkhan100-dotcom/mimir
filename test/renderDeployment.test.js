import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const renderYaml = fs.readFileSync(new URL('../render.yaml', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('Render Blueprint uses one Node web service with health check', () => {
  assert.match(renderYaml, /type:\s*web/);
  assert.match(renderYaml, /runtime:\s*node/);
  assert.match(renderYaml, /buildCommand:\s*npm install/);
  assert.match(renderYaml, /startCommand:\s*npm start/);
  assert.match(renderYaml, /healthCheckPath:\s*\/api\/health/);
});

test('Render fullstack package contains required runtime dependencies', () => {
  assert.equal(pkg.version, '4.6.0');
  for (const dependency of ['express', '@google/genai', 'sharp']) {
    assert.ok(pkg.dependencies[dependency], `missing ${dependency}`);
  }
});
