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

test('practical mode redacts normal CV header PII without blocking on employer/location context', () => {
  const privacy = loadPrivacy();
  const raw = `John Smith\nLocation: London\njohn.smith@example.com\n+44 7700 900123\nlinkedin.com/in/johnsmith\n\nProfessional Experience\nProject Manager at SKECHERS USA, INC. – UK\nAddress emerging delivery issues and coordinate teams.\nJan 2022 - Present`;
  const browser = privacy.mask(raw, 'cv');
  assert.match(browser.maskedText, /\[NAME_REDACTED\]/);
  assert.match(browser.maskedText, /Location: \[LOCATION_REDACTED\]/);
  assert.match(browser.maskedText, /\[EMAIL_REDACTED\]/);
  assert.match(browser.maskedText, /\[PHONE_REDACTED\]/);
  assert.match(browser.maskedText, /\[PROFILE_REDACTED\]/);
  assert.match(browser.maskedText, /SKECHERS USA, INC\./);
  assert.match(browser.maskedText, /Address emerging delivery issues/);
  assert.deepEqual(Array.from(privacy.leakScan(browser.maskedText)), []);

  const server = maskCandidateText(browser.maskedText);
  assert.equal(server.maskedText, browser.maskedText);
  assert.deepEqual(collectCandidateSensitiveTerms(server.maskedText), []);
});

test('privacy heuristics are warning-only and evaluation code has no PII residual hard-stop', () => {
  const appJs = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const appFactory = fs.readFileSync(new URL('../src/appFactory.js', import.meta.url), 'utf8');
  assert.doesNotMatch(appJs, /Privacy firewall blocked evaluation|Privacy firewall blocked transmission/);
  assert.doesNotMatch(appFactory, /candidate-sensitive data may remain after redaction/);
  assert.match(appFactory, /serverPrivacyWarnings/);
  assert.match(appJs, /privacyWarnings/);
});


test('practical mode redacts clear city-country header location without treating work geography as PII', () => {
  const privacy = loadPrivacy();
  const raw = `Jane Doe\nManchester, UK\njane@example.com\n\nExperience\nProject Manager at Global Company\nLed rollout across 19 countries in Europe.`;
  const result = privacy.mask(raw, 'cv');
  assert.match(result.maskedText, /Location: \[LOCATION_REDACTED\]/);
  assert.match(result.maskedText, /Global Company/);
  assert.match(result.maskedText, /19 countries in Europe/);
});
