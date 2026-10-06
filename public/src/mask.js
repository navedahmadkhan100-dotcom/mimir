const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>()]+/gi;
const LINKEDIN_RE = /\b(?:linkedin\.com\/[^\s<>()]+|github\.com\/[^\s<>()]+)\b/gi;
const PHONE_RE = /(?<!\w)\+?\d[\d \t().-]{6,}\d(?!\w)/g;
const DOB_RE = /\b(?:date\s*of\s*birth|dob|born)\s*[:\-]?\s*[^\n|,;]+/gi;
const NATIONALITY_RE = /\b(?:nationality|citizenship)\s*[:\-]?\s*[^\n|,;]+/gi;
const GENDER_RE = /\b(?:gender|sex)\s*[:\-]?\s*[^\n|,;]+/gi;
const MARITAL_RE = /\b(?:marital\s*status)\s*[:\-]?\s*[^\n|,;]+/gi;
const ADDRESS_RE = /\b(?:home\s+address|residential\s+address|postal\s+address|address)\s*[:\-]?\s*[^\n]+/gi;
const HONORIFIC_RE = /\b(?:mr|mrs|ms|miss|dr)\.?\s+(?=[A-Z][a-z])/g;

const TITLE_HINTS = [
  'engineer', 'developer', 'architect', 'consultant', 'manager', 'recruiter', 'analyst',
  'administrator', 'admin', 'specialist', 'lead', 'head', 'director', 'officer', 'scientist',
  'designer', 'product', 'project', 'program', 'support', 'technician', 'intern', 'student',
  'professional', 'profile', 'summary', 'curriculum', 'resume', 'cv',
];

const SECTION_HINTS = /^(experience|work experience|employment|career history|professional experience|work history|projects|education|skills|certifications|summary|profile)\b/i;
const DATE_RANGE_RE = /\b(?:19|20)\d{2}\b.*(?:\b(?:19|20)\d{2}\b|present|current|now)|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(?:19|20)\d{2}\b/i;

function looksLikeName(line) {
  const clean = line.trim().replace(/[|•·]/g, ' ');
  if (!clean || clean.length > 60 || /\d|@|https?:|www\./i.test(clean)) return false;
  if (TITLE_HINTS.some((hint) => clean.toLowerCase().includes(hint))) return false;
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) return false;
  return words.every((word) => /^[A-Za-zÀ-ÖØ-öø-ÿ'’-]{2,}$/.test(word.replace(/\.$/, '')));
}

function looksLikeJobTitle(line) {
  const lower = line.toLowerCase();
  return TITLE_HINTS.some((hint) => lower.includes(hint));
}

function looksLikeEmployerLine(line) {
  const text = line.trim();
  if (!text || text.length > 100) return false;
  if (SECTION_HINTS.test(text) || looksLikeJobTitle(text)) return false;
  if (/\b(university|college|school|institute|academy|certification|certificate)\b/i.test(text)) return false;
  if (/\b(?:ltd|limited|llc|inc\.?|corp\.?|corporation|gmbh|ag|plc|pte|pvt|private|solutions|technologies|technology|systems|consulting|group|bank|services|software)\b/i.test(text)) return true;
  const words = text.split(/\s+/);
  const capitalized = words.filter((w) => /^[A-Z][A-Za-z&.-]+$/.test(w));
  return words.length <= 7 && capitalized.length >= 2;
}

function maskEmployers(text, report) {
  const lines = text.split('\n');
  let inCareer = false;
  const candidates = [];

  const startYearNear = (index) => {
    const neighborhood = [lines[index - 1] || '', lines[index] || '', lines[index + 1] || ''].join(' ');
    const years = [...neighborhood.matchAll(/\b((?:19|20)\d{2})\b/g)].map((m) => Number(m[1]));
    return years.length ? Math.min(...years) : Number.MAX_SAFE_INTEGER;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (/^(experience|work experience|employment|career history|professional experience|work history)\b/i.test(trimmed)) {
      inCareer = true;
      continue;
    }
    if (inCareer && /^(education|skills|certifications|certificates|languages|interests|references|projects)\b/i.test(trimmed)) {
      inCareer = false;
    }
    if (!inCareer) continue;

    const nearDate = DATE_RANGE_RE.test(trimmed)
      || DATE_RANGE_RE.test(lines[i - 1] || '')
      || DATE_RANGE_RE.test(lines[i + 1] || '');

    if (!nearDate || !looksLikeEmployerLine(trimmed)) continue;

    const normalized = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!normalized) continue;
    candidates.push({ lineIndex: i, original: trimmed, normalized, startYear: startYearNear(i) });
  }

  // Assign identifiers by chronological start year, not by CV display order.
  const ordered = [...candidates].sort((a, b) => a.startYear - b.startYear || a.lineIndex - b.lineIndex);
  const employerMap = new Map();
  let employerIndex = 0;
  for (const item of ordered) {
    if (!employerMap.has(item.normalized)) {
      employerIndex += 1;
      employerMap.set(item.normalized, `Employer ${employerIndex}`);
    }
  }

  for (const item of candidates) {
    lines[item.lineIndex] = lines[item.lineIndex].replace(item.original, employerMap.get(item.normalized));
  }

  report.employers = (report.employers || 0) + employerMap.size;
  return lines.join('\n');
}

function maskPhoneNumbers(text, report) {
  let count = 0;
  const next = text.replace(PHONE_RE, (candidate) => {
    const digits = candidate.replace(/\D/g, '');
    // Eight-digit strings such as "2020 - 2024" are date ranges, not phones.
    if (digits.length < 9 || digits.length > 15) return candidate;
    count += 1;
    return '[PHONE_REDACTED]';
  });
  report.phones = (report.phones || 0) + count;
  return next;
}

function replaceCount(text, regex, replacement, report, key) {
  let count = 0;
  const next = text.replace(regex, () => {
    count += 1;
    return replacement;
  });
  report[key] = (report[key] || 0) + count;
  return next;
}

export function maskCandidateText(input = '') {
  let text = String(input).replace(/\r\n/g, '\n');
  const existing = (pattern) => (text.match(pattern) || []).length;
  const report = {
    names: existing(/\[NAME_REDACTED\]/g),
    phones: existing(/\[PHONE_REDACTED\]/g),
    emails: existing(/\[EMAIL_REDACTED\]/g),
    profiles: existing(/\[PROFILE_REDACTED\]/g),
    dob: existing(/\[DOB_REDACTED\]/g),
    nationality: existing(/\[NATIONALITY_REDACTED\]/g),
    gender: existing(/\[GENDER_REDACTED\]/g),
    maritalStatus: existing(/\[MARITAL_STATUS_REDACTED\]/g),
    addresses: existing(/\[ADDRESS_REDACTED\]/g),
    employers: new Set((text.match(/\bEmployer\s+\d+\b/g) || [])).size,
  };

  text = replaceCount(text, EMAIL_RE, '[EMAIL_REDACTED]', report, 'emails');
  text = replaceCount(text, LINKEDIN_RE, '[PROFILE_REDACTED]', report, 'profiles');
  text = replaceCount(text, URL_RE, '[PROFILE_REDACTED]', report, 'profiles');
  text = maskPhoneNumbers(text, report);
  text = replaceCount(text, DOB_RE, 'Date of Birth: [DOB_REDACTED]', report, 'dob');
  text = replaceCount(text, NATIONALITY_RE, 'Nationality: [NATIONALITY_REDACTED]', report, 'nationality');
  text = replaceCount(text, GENDER_RE, 'Gender: [GENDER_REDACTED]', report, 'gender');
  text = replaceCount(text, MARITAL_RE, 'Marital Status: [MARITAL_STATUS_REDACTED]', report, 'maritalStatus');
  text = replaceCount(text, ADDRESS_RE, 'Address: [ADDRESS_REDACTED]', report, 'addresses');
  text = text.replace(HONORIFIC_RE, '');

  const lines = text.split('\n');
  for (let i = 0; i < Math.min(lines.length, 6); i += 1) {
    if (looksLikeName(lines[i])) {
      lines[i] = '[NAME_REDACTED]';
      report.names += 1;
      break;
    }
  }
  text = lines.join('\n');

  text = maskEmployers(text, report);

  return {
    maskedText: text,
    report,
  };
}

export function normalizeQuote(text = '') {
  return String(text).replace(/\s+/g, ' ').trim();
}

export function quoteExistsInMaskedCv(quote, maskedCv) {
  const q = normalizeQuote(quote);
  const cv = normalizeQuote(maskedCv);
  return Boolean(q) && cv.includes(q);
}

export function maskJdText(input = '') {
  let text = String(input).replace(/\r\n/g, '\n');
  const report = { phones: 0, emails: 0, profiles: 0 };
  text = replaceCount(text, EMAIL_RE, '[EMAIL_REDACTED]', report, 'emails');
  text = replaceCount(text, LINKEDIN_RE, '[PROFILE_REDACTED]', report, 'profiles');
  text = replaceCount(text, URL_RE, '[PROFILE_REDACTED]', report, 'profiles');
  text = maskPhoneNumbers(text, report);
  return { maskedText: text, report };
}
