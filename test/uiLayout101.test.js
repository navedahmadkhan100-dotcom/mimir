import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
test('header title left, Mimir icon center, engine values right',()=>{
  const header=html.match(/<header class="hero[^]*?<\/header>/)?.[0]||'';
  assert.ok(header.indexOf('class="hero-left"')<header.indexOf('class="hero-center"'));
  assert.ok(header.indexOf('class="hero-center"')<header.indexOf('class="hero-right"'));
  assert.match(header,/Capability over keywords<\/span><span>Proof over guesswork<\/span><span>Explainable candidate intelligence/);
  assert.match(css,/\.hero-three-way\{display:grid;grid-template-columns:/);
});
test('persistent CV document status with correct empty-state copy',()=>{
  assert.match(html,/id="cvDocumentIntel"[^]*?No text or visuals detected yet\. Parse the CV first/);
  assert.match(app,/if \(kind === 'cv'\)/);
  assert.match(css,/\.cv-card>#cvDocumentIntel\{display:flex/);
});
test('deleted loading prose no longer referenced during evaluation',()=>{
  assert.doesNotMatch(app,/loadingCopy/);
  assert.match(app,/button\.classList\.toggle\('is-loading', loading\)/);
});
test('input cards share row height, circular connector has no vertical offset',()=>{
  assert.match(css,/\.input-stack>\.input-card\{align-self:stretch/);
  assert.match(css,/\.evaluation-bridge\{align-self:stretch/);
});
