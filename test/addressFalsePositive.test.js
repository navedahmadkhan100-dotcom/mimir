import test from 'node:test';
import assert from 'node:assert/strict';
import { maskCandidateText } from '../src/mask.js';

const sample = `Professional Experience\nProject Manager\nMonitor resource requirements and supplier commitments to identify constraints and address emerging issues.\nManaged schedules, addressing emerging variances and delivery risks.\n`;

test('address verbs are not treated as postal address PII', () => {
  const result = maskCandidateText(sample);
  assert.equal(result.report.addresses, 0);
  assert.match(result.maskedText, /address emerging issues/i);
  assert.match(result.maskedText, /addressing emerging variances/i);
});

test('explicit address/location fields are still redacted', () => {
  const sample2 = `Address: 10 Downing Street, London\nLocation: Manchester, UK\nSenior Engineer`;
  const result = maskCandidateText(sample2);
  assert.equal(result.report.addresses, 2);
  assert.doesNotMatch(result.maskedText, /Downing Street|Manchester/i);
});
