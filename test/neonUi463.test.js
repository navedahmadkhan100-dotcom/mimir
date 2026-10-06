import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const styles=fs.readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
test('Mimir name, original creator reference and neon action exist',()=>{
 assert.match(html,/class="hero-name">MIMIR/);assert.match(html,/Designed by <strong>Naved <em>Khan<\/em>/);
 assert.match(html,/class="designer-role">Senior IT Recruiter/);assert.match(styles,/#00c6ff 0%,#195dff/);
});
test('loading keeps the cancelable evaluation button and adds heartbeat motion',()=>{
 assert.match(app,/button\.classList\.toggle\('is-loading', loading\)/);
 assert.match(app,/button\.setAttribute\('aria-label', loading \? 'Cancel evaluation'/);
 assert.match(styles,/@keyframes mimirHeartbeat/);assert.match(styles,/prefers-reduced-motion:reduce/);
 assert.doesNotMatch(html,/class="loader-rune"/); // loading remains in the circular action
});
test('evidence report separates requirement, quote and interpretation',()=>{
 assert.match(app,/evidence-row-top/);assert.match(app,/What the role requires/);
 assert.match(app,/CV evidence /);assert.match(app,/Mimir’s interpretation/);
 assert.match(styles,/evidence-row-grid\{display:grid/);
 assert.match(html,/id="odinList"/);
});
