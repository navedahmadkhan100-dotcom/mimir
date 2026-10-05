import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadPrivacy() {
  const window = {};
  const context = vm.createContext({ window, console });
  vm.runInContext(fs.readFileSync(new URL('../public/privacy.js', import.meta.url), 'utf8'), context);
  return window.MimirPrivacy;
}

test('browser practical privacy removes direct identity/contact PII while retaining employer evidence', () => {
  const privacy = loadPrivacy();
  const raw = `John Smith\nLondon SW1A 1AA\njohn.smith@example.com\nlinkedin.com/in/john-smith\nActive SC Cleared until 2028\n\nProfessional Experience\nSenior Architect\nExample Technologies Ltd\nJan 2021 - Present\nDesigned Intune architecture.`;
  const result = privacy.mask(raw, 'cv');
  assert.match(result.maskedText, /\[NAME_REDACTED\]/);
  assert.match(result.maskedText, /\[LOCATION_REDACTED\]/);
  assert.match(result.maskedText, /\[EMAIL_REDACTED\]/);
  assert.match(result.maskedText, /\[PROFILE_REDACTED\]/);
  assert.match(result.maskedText, /\[CLEARANCE_REDACTED\]/);
  assert.match(result.maskedText, /Example Technologies Ltd/);
  assert.deepEqual(Array.from(privacy.leakScan(result.maskedText)), []);
});
