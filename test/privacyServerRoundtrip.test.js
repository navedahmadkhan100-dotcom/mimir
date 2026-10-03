import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { maskCandidateText, collectCandidateSensitiveTerms } from '../src/mask.js';

function loadPrivacy() {
  const window = {};
  const context = vm.createContext({ window, console });
  vm.runInContext(fs.readFileSync(new URL('../public/privacy.js', import.meta.url), 'utf8'), context);
  return window.MimirPrivacy;
}

const CEIPAL_STYLE_CV = fs.readFileSync(new URL('./fixtures/ceipal-oracle-cv.txt', import.meta.url), 'utf8');

test('browser-redacted CEIPAL CV passes server privacy defense-in-depth without self-blocking', () => {
  const privacy = loadPrivacy();
  const browser = privacy.mask(CEIPAL_STYLE_CV, 'cv');
  assert.deepEqual(Array.from(privacy.leakScan(browser.maskedText)), []);
  assert.match(browser.maskedText, /Employer \d+/);

  const server = maskCandidateText(browser.maskedText);
  const residual = collectCandidateSensitiveTerms(server.maskedText);

  assert.deepEqual(residual, []);
  assert.equal(server.maskedText, browser.maskedText);
});

test('server never classifies Mimir Employer N placeholders as candidate-sensitive terms', () => {
  const prepared = `Professional Experience\nProject Manager at Employer 7\tJanuary 2025–Present\nTest Manager at Employer 3\tSeptember 2021–December 2022`;
  assert.deepEqual(collectCandidateSensitiveTerms(prepared), []);
  assert.equal(maskCandidateText(prepared).maskedText, prepared);
});
