import test from 'node:test';
import assert from 'node:assert/strict';
import { maskCandidateText } from '../src/mask.js';

test('candidate masking removes common direct identifiers', () => {
  const input = 'John Smith\nEmail: john.smith@example.com\nPhone: +44 7700 900123\nLinkedIn: https://linkedin.com/in/johnsmith';
  const out = maskCandidateText(input).maskedText;
  assert.doesNotMatch(out, /john\.smith@example\.com/i);
  assert.doesNotMatch(out, /7700 900123/);
  assert.doesNotMatch(out, /linkedin\.com\/in\/johnsmith/i);
});

test('candidate masking removes UK clearance and identity identifiers from scoring text', () => {
  const input = 'Jane Doe\nLocation: London SW1A 1AA\nSC Cleared until 2028\nNI Number: QQ 12 34 56 C\nGitHub: https://github.com/janedoe';
  const result = maskCandidateText(input);
  assert.doesNotMatch(result.maskedText, /SC Cleared/i);
  assert.doesNotMatch(result.maskedText, /SW1A 1AA/i);
  assert.doesNotMatch(result.maskedText, /github\.com\/janedoe/i);
  assert.ok(result.report.clearances >= 1);
});
