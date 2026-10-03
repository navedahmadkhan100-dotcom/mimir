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

test('pasted CV does not self-trigger location leak and date ranges are preserved', () => {
  const privacy = loadPrivacy();
  const raw = `John Smith\nLocation: London SW1A 1AA\njohn@example.com\n\nProfessional Experience\nSenior Architect\nExample Technologies Ltd\nJan 2021 - Present\nDesigned Intune architecture.`;
  const result = privacy.mask(raw, 'cv');
  assert.match(result.maskedText, /Location: \[LOCATION_REDACTED\]/);
  assert.match(result.maskedText, /Employer 1/);
  assert.match(result.maskedText, /Jan 2021 - Present/);
  assert.deepEqual(Array.from(privacy.leakScan(result.maskedText)), []);
});
