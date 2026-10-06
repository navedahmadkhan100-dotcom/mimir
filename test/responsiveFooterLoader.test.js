import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
test('privacy notice appears after workspace and before SEO links',()=>{
  assert.ok(html.indexOf('class="privacy-note"')>html.indexOf('id="evaluate"'));
  assert.ok(html.indexOf('class="privacy-note"')>html.indexOf('class="results-column"'));
  assert.ok(html.indexOf('class="privacy-note"')<html.indexOf('class="seo-link-row"'));
});
test('shell adapts to full viewport and expands with results',()=>{
  assert.match(css,/\.shell\{display:flex!important;flex-direction:column!important;min-height:100dvh!important;height:auto!important;/);
  assert.match(css,/\.shell > \.privacy-note\{[^}]*margin: auto 8px 0!important;/);
});
test('ring is contained inside evaluation control and no external loading panel',()=>{
  assert.match(html,/id="evaluateBtn"[^]*?class="evaluate-inner-spinner" aria-hidden="true"/);
  assert.match(css,/\.evaluate-button \.evaluate-inner-spinner\{[^}]*inset:9px;/);
  assert.match(css,/\.evaluate-button\.is-loading::after\{display:none!important;/);
  assert.match(js,/button\.classList\.toggle\('is-loading', loading\)/);
  assert.match(html,/id="evaluateBtnText">Find<br>the<br>Worthiness/);
});
