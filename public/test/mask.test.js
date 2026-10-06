import test from 'node:test';
import assert from 'node:assert/strict';
import { maskCandidateText } from '../src/mask.js';

test('masks phone/email without destroying employment year ranges', () => {
  const input = `Jane Example\njane@example.com\n+91 98765 43210\nExperience\nSoftware Engineer\nExample Systems Ltd\n2020 - 2024\nBuilt APIs.`;
  const result = maskCandidateText(input);
  assert.match(result.maskedText, /2020 - 2024/);
  assert.match(result.maskedText, /\[EMAIL_REDACTED\]/);
  assert.match(result.maskedText, /\[PHONE_REDACTED\]/);
});


test('redaction is transparent and idempotent across extract then evaluate', () => {
  const input = `Jane Example\njane@example.com\n+44 7700 900123\nExperience\nSenior Engineer\nExample Systems Ltd\n2022 - 2025\nLed platform work.`;
  const first = maskCandidateText(input);
  const second = maskCandidateText(first.maskedText);
  assert.equal(second.maskedText, first.maskedText);
  assert.ok(second.report.names >= 1);
  assert.ok(second.report.emails >= 1);
  assert.ok(second.report.phones >= 1);
});
