import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');

test('legacy evidence spinner lives inside the Find the Worthiness button', () => {
  const buttonStart = html.indexOf('id="evaluateBtn"');
  const buttonEnd = html.indexOf('</button>', buttonStart);
  const buttonHtml = html.slice(buttonStart, buttonEnd);
  assert.match(buttonHtml, /evaluate-inner-spinner/);
  assert.match(css, /#ff4f93/);
  assert.match(css, /#d946ef/);
  assert.match(css, /#4f8cff/);
  assert.match(css, /@keyframes mimirEvidenceSpinner/);
  assert.match(css, /\.evaluate-button\.is-loading \.evaluate-inner-spinner/);
});
