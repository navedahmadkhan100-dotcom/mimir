import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { maskCandidateText } from '../src/mask.js';

const SAMPLE = `Senior technology delivery leader with extensive experience.\n\nTechnical Proficiencies\n\nProfessional Experience\nProject Management / Service Delivery at INFOMATRIX SOLUTIONS \t January 2025–Present\nCoordinate distributed teams throughout testing activities and work with teams and vendors.\nMonitor supplier commitments to identify constraints and address emerging issues.\nOracle Financials Cloud Project Manager (Contract) at SKECHERS USA, INC. – UK \t August 2023 – December 2024\nTest Manager (Contract) at ARUP \t September 2021–December 2022\n`;

test('ordinary address verbs do not trigger address masking', () => {
  const result = maskCandidateText(SAMPLE);
  assert.equal(result.report.addresses, 0);
  assert.match(result.maskedText, /address emerging issues/i);
});

test('section heading is not treated as candidate name', () => {
  const result = maskCandidateText(SAMPLE);
  assert.match(result.maskedText, /Technical Proficiencies/);
  assert.doesNotMatch(result.maskedText, /\[NAME_REDACTED\]/);
});

test('ordinary Teams language is not treated as a social handle', () => {
  const result = maskCandidateText(SAMPLE);
  assert.equal(result.report.socialHandles, 0);
  assert.match(result.maskedText, /teams throughout/i);
  assert.match(result.maskedText, /teams and vendors/i);
});

test('practical privacy retains employer/job-history evidence and preserves role dates', () => {
  const result = maskCandidateText(SAMPLE);
  assert.match(result.maskedText, /INFOMATRIX SOLUTIONS/);
  assert.match(result.maskedText, /SKECHERS USA, INC\./);
  assert.match(result.maskedText, /\bARUP\b/);
  assert.match(result.maskedText, /January 2025–Present/);
  assert.match(result.maskedText, /August 2023\s+–\s+December 2024/);
  assert.match(result.maskedText, /September 2021–December 2022/);
});
