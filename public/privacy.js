(function () {
  const RULES = [
    ['emails', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL_REDACTED]'],
    ['profiles', /\b(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com\/(?:in|pub)\/|github\.com\/|gitlab\.com\/|bitbucket\.org\/|stackoverflow\.com\/users\/)[^\s<>()]+/gi, '[PROFILE_REDACTED]'],
    ['urls', /\b(?:https?:\/\/|www\.)[^\s<>()]+/gi, '[URL_REDACTED]'],
    ['phones', /(?<!\w)\+?\d[\d \t().-]{7,}\d(?!\w)/g, '[PHONE_REDACTED]'],
    ['dob', /\b(?:date\s*of\s*birth|d\.?o\.?b\.?|born)\s*[:\-]?\s*[^\n|,;]+/gi, 'Date of Birth: [DOB_REDACTED]'],
    ['nationality', /\b(?:nationality|citizenship)\s*[:\-]?\s*[^\n|,;]+/gi, 'Nationality: [NATIONALITY_REDACTED]'],
    ['gender', /\b(?:gender|sex)\s*[:\-]?\s*[^\n|,;]+/gi, 'Gender: [GENDER_REDACTED]'],
    ['maritalStatus', /\b(?:marital\s*status|civil\s*status)\s*[:\-]?\s*[^\n|,;]+/gi, 'Marital Status: [MARITAL_STATUS_REDACTED]'],
    ['addresses', /\b(?:home\s+address|residential\s+address|postal\s+address|correspondence\s+address|address|location)\s*[:\-]?\s*[^\n]+/gi, 'Location: [LOCATION_REDACTED]'],
    ['locations', /\b(?:GIR\s?0AA|(?:[A-PR-UWYZ][0-9][0-9A-HJKSTUW]?|[A-PR-UWYZ][A-HK-Y][0-9][0-9ABEHMNPRV-Y]?)[ ]?[0-9][ABD-HJLNP-UW-Z]{2})\b/gi, '[LOCATION_REDACTED]'],
    ['clearances', /\b(?:(?:current|active|valid|held|holds?|holding|eligible\s+for)?\s*)?(?:developed\s+vetting|security\s+check|security\s+cleared|dv\s+cleared|sc\s+cleared|bpSS\s+(?:cleared|completed)|ctc\s+cleared|nato\s+(?:secret|confidential)|ukic\s+clearance)\b(?:\s*(?:until|to|expiry|expires?)\s*[:\-]?\s*[^\n,;]+)?/gi, '[CLEARANCE_REDACTED]'],
    ['identifiers', /\b(?:national\s+insurance|ni\s*(?:number|no\.?|#)|passport\s*(?:number|no\.?|#)|driving\s+licen[cs]e\s*(?:number|no\.?|#)|national\s+id|tax\s+id|utr)\s*[:#\-]?\s*[A-Z0-9 -]{5,}\b/gi, '[IDENTIFIER_REDACTED]'],
    ['socialHandles', /\b(?:skype|teams|telegram|twitter|x|instagram)\s*(?:id|handle|profile)?\s*[:\-]?\s*@?[A-Z0-9._-]{3,}/gi, '[PROFILE_REDACTED]'],
    ['references', /\b(?:references?|referees?)\s*[:\-]\s*[^\n]+/gi, 'References: [REFERENCE_DETAILS_REDACTED]'],
  ];

  const TITLE_HINTS = ['engineer','developer','architect','consultant','manager','recruiter','analyst','administrator','admin','specialist','lead','head','director','officer','scientist','designer','product','project','program','support','technician','intern','student','professional','profile','summary','curriculum','resume','cv'];
  const SECTION_HINTS = /^(experience|work experience|employment|career history|professional experience|work history|projects|education|skills|certifications|summary|profile)\b/i;
  const DATE_RANGE_RE = /\b(?:19|20)\d{2}\b.*(?:\b(?:19|20)\d{2}\b|present|current|now)|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(?:19|20)\d{2}\b/i;

  function looksLikeName(line) {
    const clean = String(line).trim().replace(/[|•·]/g, ' ');
    if (!clean || clean.length > 60 || /\d|@|https?:|www\./i.test(clean)) return false;
    if (TITLE_HINTS.some((hint) => clean.toLowerCase().includes(hint))) return false;
    const words = clean.split(/\s+/).filter(Boolean);
    return words.length >= 2 && words.length <= 5 && words.every((w) => /^[A-Za-zÀ-ÖØ-öø-ÿ'’-]{2,}\.?$/.test(w));
  }

  function looksLikeJobTitle(line) {
    const lower = String(line || '').toLowerCase();
    return TITLE_HINTS.some((hint) => lower.includes(hint));
  }
  function looksLikeEmployerLine(line) {
    const text = String(line || '').trim();
    if (!text || text.length > 100 || SECTION_HINTS.test(text) || looksLikeJobTitle(text)) return false;
    // A date range is chronology evidence, never an employer name.
    if (DATE_RANGE_RE.test(text) || /^\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i.test(text) && /\b(?:19|20)\d{2}\b/.test(text)) return false;
    if (/\b(university|college|school|institute|academy|certification|certificate)\b/i.test(text)) return false;
    if (/\b(?:ltd|limited|llc|inc\.?|corp\.?|corporation|gmbh|ag|plc|pte|pvt|private|solutions|technologies|technology|systems|consulting|group|bank|services|software)\b/i.test(text)) return true;
    const words = text.split(/\s+/);
    const capitalized = words.filter((w) => /^[A-Z][A-Za-z&.-]+$/.test(w));
    return words.length <= 7 && capitalized.length >= 2;
  }
  function findEmployerCandidates(lines) {
    let inCareer = false;
    const candidates = [];
    const startYearNear = (index) => {
      const neighborhood = [lines[index-1] || '', lines[index] || '', lines[index+1] || ''].join(' ');
      const years = [...neighborhood.matchAll(/\b((?:19|20)\d{2})\b/g)].map((m) => Number(m[1]));
      return years.length ? Math.min(...years) : Number.MAX_SAFE_INTEGER;
    };
    for (let i=0; i<lines.length; i+=1) {
      const trimmed = String(lines[i] || '').trim();
      if (/^(experience|work experience|employment|career history|professional experience|work history)\b/i.test(trimmed)) { inCareer = true; continue; }
      if (inCareer && /^(education|skills|certifications|certificates|languages|interests|references|projects)\b/i.test(trimmed)) inCareer = false;
      if (!inCareer) continue;
      const nearDate = DATE_RANGE_RE.test(trimmed) || DATE_RANGE_RE.test(lines[i-1] || '') || DATE_RANGE_RE.test(lines[i+1] || '');
      if (!nearDate || !looksLikeEmployerLine(trimmed)) continue;
      const normalized = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (normalized) candidates.push({ lineIndex:i, original:trimmed, normalized, startYear:startYearNear(i) });
    }
    for (let i=0; i<lines.length; i+=1) {
      const line = String(lines[i] || '').trim();
      const atMatch = line.match(/(?:@|\bat\b)\s+([^–—\n(]{2,80})/i);
      if (!atMatch) continue;
      const original = atMatch[1].trim().replace(/[,:;\-]+$/, '').trim();
      if (!original) continue;
      const normalized = original.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (normalized) candidates.push({ lineIndex:i, original, normalized, startYear:startYearNear(i) });
    }
    const seen = new Set();
    return candidates.filter((item) => { const key = `${item.lineIndex}|${item.normalized}`; if (seen.has(key)) return false; seen.add(key); return true; });
  }
  function maskEmployers(text, report) {
    const lines = String(text || '').split('\n');
    const candidates = findEmployerCandidates(lines);
    const ordered = [...candidates].sort((a,b) => a.startYear-b.startYear || a.lineIndex-b.lineIndex);
    const map = new Map(); let index = 0;
    for (const item of ordered) if (!map.has(item.normalized)) map.set(item.normalized, `Employer ${++index}`);
    for (const item of candidates) lines[item.lineIndex] = lines[item.lineIndex].replace(item.original, map.get(item.normalized));
    report.employers = (report.employers || 0) + map.size;
    return lines.join('\n');
  }

  function mask(text, kind='cv') {
    let value = String(text || '').replace(/\r\n/g, '\n');
    const report = {};
    for (const [key, re, replacement] of RULES) {
      let count = 0;
      value = value.replace(re, (m) => {
        if (key === 'phones') { const n = m.replace(/\D/g, '').length; if (n < 9 || n > 15) return m; }
        count += 1; return replacement;
      });
      report[key] = count;
    }
    if (kind === 'cv') {
      const lines = value.split('\n');
      for (let i=0; i<Math.min(lines.length, 8); i+=1) {
        if (looksLikeName(lines[i])) { lines[i] = '[NAME_REDACTED]'; report.names = (report.names||0)+1; break; }
      }
      value = lines.join('\n');
      value = maskEmployers(value, report);
    }
    return { maskedText: value, report };
  }
  function leakScan(text) {
    const hits = [];
    // Second-pass leak detection must inspect what remains AFTER redaction,
    // without treating the redaction labels themselves as fresh PII.
    // Example: `Location: [LOCATION_REDACTED]` previously became `Location: `
    // and re-triggered the address rule on pasted CV text.
    let scanText = String(text || '').replace(/\[[A-Z0-9_]+_REDACTED\]/g, '');
    scanText = scanText.replace(
      /^\s*(?:location|address|home\s+address|residential\s+address|postal\s+address|correspondence\s+address|date\s+of\s+birth|d\.?o\.?b\.?|nationality|citizenship|gender|sex|marital\s+status|references?|referees?)\s*[:\-]?\s*$/gim,
      ''
    );

    for (const [key, re] of RULES) {
      re.lastIndex = 0;
      if (re.test(scanText)) hits.push(key);
      re.lastIndex = 0;
    }

    const lines = scanText.split(/\r?\n/);
    if (lines.slice(0, 8).some(looksLikeName)) hits.push('possibleName');

    // Employer detection is heuristic and intentionally NOT a hard-blocking
    // privacy signal. Company names are often legitimate evidence (scope,
    // sector, project context), and the heuristic can mistake capitalised CV
    // headings for employers. Obvious employer lines are still pseudonymised
    // by maskEmployers(); residual heuristic matches must not prevent evaluation.
    return [...new Set(hits)];
  }
  function sensitiveTerms(text) {
    const value = String(text || '');
    const terms = new Set();
    for (const [key, re] of RULES) {
      re.lastIndex = 0;
      for (const match of value.matchAll(new RegExp(re.source, re.flags))) {
        const candidate = String(match[0] || '').trim();
        if (!candidate) continue;
        if (key === 'phones') {
          const digits = candidate.replace(/\D/g, '').length;
          if (digits < 9 || digits > 15) continue;
        }
        terms.add(candidate);
      }
      re.lastIndex = 0;
    }
    const lines = value.split(/\r?\n/);
    for (let i = 0; i < Math.min(lines.length, 8); i += 1) {
      if (looksLikeName(lines[i])) { terms.add(lines[i].trim()); break; }
    }
    for (const employer of findEmployerCandidates(lines)) terms.add(employer.original);
    return [...terms];
  }
  window.MimirPrivacy = { mask, leakScan, sensitiveTerms, rulesVersion: 'privacy-firewall-2.3.0' };
})();
