import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const styles=fs.readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
const code=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');

test('JD and CV uploads are parallel, with the CV privacy explanation after upload',()=>{
  assert.ok(html.indexOf('id="jdDropzone"')<html.indexOf('id="cvDropzone"'));
  assert.ok(html.indexOf('id="cvDropzone"')<html.indexOf('id="cvTransparency"'));
  assert.ok(html.includes('jd-card')&&html.includes('cv-card')&&html.includes('jd-command-row'));
});
test('Find the Worthiness stays in central connecting bridge and remains cancelable',()=>{
  assert.match(html,/<div class="evaluation-bridge">[\s\S]*?id="evaluateBtn"[\s\S]*?<\/div>/);
  assert.match(styles,/\.evaluation-bridge\{grid-column:2;grid-row:1/);
  assert.match(styles,/\.evaluate-button\.cancel-mode/);
  assert.match(code,/if \(state\.isEvaluating\) cancelEvaluation\(\)/);
});
test('JD intelligence accordion has an accessible state, animated opening, and scroll-safe layout',()=>{
  assert.match(html,/id="jdIntelligenceToggle"[^>]*aria-expanded="false"/);
  assert.match(html,/id="jdIntelligenceBody"[^>]*aria-hidden="true"/);
  assert.match(styles,/\.jd-insight-panel\.is-expanded \.jd-insight-reveal\{grid-template-rows:1fr/);
  assert.match(styles,/height:auto!important;min-height:100vh!important;overflow-y:auto!important/);
  assert.match(code,/content\.inert = !open/);
  assert.match(code,/setJdInsightExpanded\(true\)/);
});
