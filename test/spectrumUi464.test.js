import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
test('the circular evaluation control contains only the requested action label',()=>{
 const m=html.match(/<button id="evaluateBtn"[\s\S]*?<\/button>/);
 assert.ok(m,'evaluate button exists');
 assert.match(m[0],/Find the<br>Worthiness/);
 assert.doesNotMatch(m[0],/evaluate-heart|evaluate-symbol|button-arrow|<svg|✦/);
 assert.match(app,/loading \? 'Cancel' : 'Find the<br>Worthiness'/);
 assert.match(app,/if \(state\.isEvaluating\) cancelEvaluation\(\)/);
});
test('loading uses two-beat transform motion, no audio/video and reduced-motion guard',()=>{
 assert.match(css,/@keyframes mimirSpectrumBeat/);
 assert.match(css,/@keyframes mimirSpectrumRipple/);
 assert.match(css,/\.evaluate-button\.is-loading\{animation:mimirSpectrumBeat/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.doesNotMatch(html,/audio|<video/);
});
test('full product name receives the continuous text gradient',()=>{
 assert.match(css,/\.hero h1\{[\s\S]*?background:linear-gradient\(97deg/);
 assert.match(css,/\.hero h1 \.hero-name,\.hero h1 \.hero-tagline\{/);
});
test('result sections include responsive readable padding and type',()=>{
 assert.match(css,/\.results :is\(\.architecture-panel,\.evidence-panel,\.score-panel,\.signal-panel,\.compact-card\)/);
 assert.match(css,/\.results \.evidence-row-grid\{gap:clamp/);
 assert.match(css,/font-family:"Manrope"/);
});
