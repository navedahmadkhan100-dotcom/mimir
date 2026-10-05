(function () {
  const GLOBAL_RULES = [
    ['emails', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL_REDACTED]'],
    ['profiles', /\b(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com\/(?:in|pub)\/|github\.com\/|gitlab\.com\/|bitbucket\.org\/|stackoverflow\.com\/users\/)[^\s<>()]+/gi, '[PROFILE_REDACTED]'],
    ['urls', /\b(?:https?:\/\/|www\.)[^\s<>()]+/gi, '[URL_REDACTED]'],
    ['phones', /(?<!\w)\+?\d[\d \t().-]{7,}\d(?!\w)/g, '[PHONE_REDACTED]'],
    ['dob', /\b(?:date\s*of\s*birth|d\.?o\.?b\.?|born)\s*[:\-]?\s*[^\n|,;]+/gi, 'Date of Birth: [DOB_REDACTED]'],
    ['nationality', /\b(?:nationality|citizenship)\s*[:\-]?\s*[^\n|,;]+/gi, 'Nationality: [NATIONALITY_REDACTED]'],
    ['gender', /\b(?:gender|sex)\s*[:\-]?\s*[^\n|,;]+/gi, 'Gender: [GENDER_REDACTED]'],
    ['maritalStatus', /\b(?:marital\s*status|civil\s*status)\s*[:\-]?\s*[^\n|,;]+/gi, 'Marital Status: [MARITAL_STATUS_REDACTED]'],
    ['clearances', /\b(?:(?:current|active|valid|held|holds?|holding|eligible\s+for)?\s*)?(?:developed\s+vetting|security\s+check|security\s+cleared|dv\s+cleared|sc\s+cleared|bpSS\s+(?:cleared|completed)|ctc\s+cleared|nato\s+(?:secret|confidential)|ukic\s+clearance)\b(?:\s*(?:until|to|expiry|expires?)\s*[:\-]?\s*[^\n,;]+)?/gi, '[CLEARANCE_REDACTED]'],
    ['identifiers', /\b(?:national\s+insurance|ni\s*(?:number|no\.?|#)|passport\s*(?:number|no\.?|#)|driving\s+licen[cs]e\s*(?:number|no\.?|#)|national\s+id|tax\s+id|utr|employee\s+id|payroll\s+id)\s*[:#\-]?\s*[A-Z0-9 -]{5,}\b/gi, '[IDENTIFIER_REDACTED]'],
    ['socialHandles', /\b(?:skype|teams|telegram|twitter|instagram|x)\s*(?:(?:id|handle|profile)\s*[:\-]?\s*|[:\-]\s*)@?[A-Z0-9._-]{3,}\b/gi, '[PROFILE_REDACTED]'],
    ['references', /\b(?:references?|referees?)\s*[:\-]\s*[^\n]+/gi, 'References: [REFERENCE_DETAILS_REDACTED]'],
  ];

  const UK_POSTCODE_RE = /\b(?:GIR\s?0AA|(?:[A-PR-UWYZ][0-9][0-9A-HJKSTUW]?|[A-PR-UWYZ][A-HK-Y][0-9][0-9ABEHMNPRV-Y]?)[ ]?[0-9][ABD-HJLNP-UW-Z]{2})\b/gi;
  const ADDRESS_LABEL_RE = /^(?:[ \t]*(?:home\s+address|residential\s+address|postal\s+address|correspondence\s+address|address|location)\b[ \t]*(?::|\-)[ \t]*[^\n]+|[ \t]*(?:based\s+in|located\s+in)\b[ \t]+[^\n]+)$/i;
  const NAME_LABEL_RE = /^[ \t]*(?:candidate\s+name|full\s+name|name)\s*[:\-][ \t]*[^\n]+$/i;
  const HEADER_LOCATION_LINE_RE = /^[A-Za-zÀ-ÖØ-öø-ÿ .’'\-]{2,50},\s*(?:UK|United Kingdom|England|Scotland|Wales|Northern Ireland|Ireland|India|Germany|France|Spain|Portugal|Italy|Netherlands|Belgium|Switzerland|Poland|Romania|Denmark|Finland|Sweden|Norway|Austria|Czech(?: Republic|ia)?|Bulgaria)$/i;
  const HONORIFIC_RE = /\b(?:mr|mrs|ms|miss|dr)\.?\s+(?=[A-Z][a-z])/g;
  const TITLE_HINTS = ['engineer','developer','architect','consultant','manager','recruiter','analyst','administrator','admin','specialist','lead','head','director','officer','scientist','designer','product','project','program','support','technician','intern','student','professional','profile','summary','curriculum','resume','cv'];
  const SECTION_HINTS = /^(experience|work experience|employment|career history|professional experience|work history|projects|education|skills|technical skills|technical proficiencies|technical proficiency|core competencies|competencies|certifications|summary|profile|professional summary|career summary|additional experience)\b/i;

  function looksLikeName(line) {
    const clean = String(line || '').trim().replace(/[|•·]/g, ' ');
    if (!clean || clean.length > 60 || /\d|@|https?:|www\./i.test(clean)) return false;
    if (SECTION_HINTS.test(clean)) return false;
    if (TITLE_HINTS.some((hint) => clean.toLowerCase().includes(hint))) return false;
    const words = clean.split(/\s+/).filter(Boolean);
    return words.length >= 2 && words.length <= 5 && words.every((w) => /^[A-Za-zÀ-ÖØ-öø-ÿ'’-]{2,}\.?$/.test(w));
  }

  function replaceCount(text, regex, replacement, report, key) {
    let count = 0;
    const next = text.replace(regex, (match) => {
      if (key === 'phones') {
        const digits = match.replace(/\D/g, '').length;
        if (digits < 9 || digits > 15) return match;
      }
      count += 1;
      return replacement;
    });
    report[key] = (report[key] || 0) + count;
    return next;
  }

  function headerFooterIndexes(lines) {
    const set = new Set();
    for (let i = 0; i < Math.min(lines.length, 10); i += 1) set.add(i);
    for (let i = Math.max(0, lines.length - 8); i < lines.length; i += 1) set.add(i);
    return [...set].sort((a, b) => a - b);
  }

  function maskHeaderFooterIdentity(text, report) {
    const lines = String(text || '').split('\n');
    const indexes = headerFooterIndexes(lines);

    // Candidate-name heuristics only run in the true header: before the first
    // recognised CV section. This avoids treating employer/company lines as a
    // name on short CVs and keeps redaction idempotent across browser + server.
    let headerEnd = Math.min(lines.length, 8);
    for (let i = 0; i < headerEnd; i += 1) {
      if (SECTION_HINTS.test(String(lines[i] || '').trim())) { headerEnd = i; break; }
    }
    let nameMasked = false;
    for (let i = 0; i < headerEnd; i += 1) {
      const trimmed = String(lines[i] || '').trim();
      if (!trimmed) continue;
      if (NAME_LABEL_RE.test(trimmed)) {
        lines[i] = 'Name: [NAME_REDACTED]';
        report.names = (report.names || 0) + 1;
        nameMasked = true;
        break;
      }
      if (!nameMasked && looksLikeName(trimmed)) {
        lines[i] = '[NAME_REDACTED]';
        report.names = (report.names || 0) + 1;
        nameMasked = true;
        break;
      }
    }

    // Explicit address/location labels may appear in the header or footer.
    for (const i of indexes) {
      const trimmed = String(lines[i] || '').trim();
      if (!trimmed) continue;
      if (ADDRESS_LABEL_RE.test(trimmed) || (i < 10 && HEADER_LOCATION_LINE_RE.test(trimmed))) {
        lines[i] = 'Location: [LOCATION_REDACTED]';
        report.addresses = (report.addresses || 0) + 1;
      }
    }

    return lines.join('\n');
  }

  function mask(text, kind = 'cv') {
    let value = String(text || '').replace(/\r\n/g, '\n');
    const report = {};

    for (const [key, regex, replacement] of GLOBAL_RULES) {
      value = replaceCount(value, regex, replacement, report, key);
    }

    if (kind === 'cv') {
      value = replaceCount(value, UK_POSTCODE_RE, '[LOCATION_REDACTED]', report, 'locations');
      value = value.replace(HONORIFIC_RE, '');
      value = maskHeaderFooterIdentity(value, report);
    }

    // Keep a stable field for older UI/report code. Employers are intentionally
    // not pseudonymised in Practical PII mode because they are job-history evidence.
    report.employers = 0;

    return { maskedText: value, report };
  }

  function directResidualScan(text) {
    const scanText = String(text || '').replace(/\[[A-Z0-9_]+_REDACTED\]/g, '');
    const hits = [];
    const directRules = GLOBAL_RULES.filter(([key]) => ['emails','profiles','urls','phones','identifiers'].includes(key));
    for (const [key, regex] of directRules) {
      regex.lastIndex = 0;
      if (regex.test(scanText)) hits.push(key);
      regex.lastIndex = 0;
    }
    return [...new Set(hits)];
  }

  function sensitiveTerms(text) {
    const value = String(text || '').replace(/\r\n/g, '\n');
    const terms = new Set();
    for (const [key, regex] of GLOBAL_RULES) {
      for (const match of value.matchAll(new RegExp(regex.source, regex.flags))) {
        const candidate = String(match[0] || '').trim();
        if (!candidate) continue;
        if (key === 'phones') {
          const digits = candidate.replace(/\D/g, '').length;
          if (digits < 9 || digits > 15) continue;
        }
        terms.add(candidate);
      }
    }
    for (const match of value.matchAll(new RegExp(UK_POSTCODE_RE.source, UK_POSTCODE_RE.flags))) terms.add(String(match[0] || '').trim());

    const lines = value.split('\n');
    let headerEnd = Math.min(lines.length, 8);
    for (let i = 0; i < headerEnd; i += 1) {
      if (SECTION_HINTS.test(String(lines[i] || '').trim())) { headerEnd = i; break; }
    }
    for (let i = 0; i < headerEnd; i += 1) {
      const trimmed = String(lines[i] || '').trim();
      if (trimmed && (looksLikeName(trimmed) || NAME_LABEL_RE.test(trimmed))) terms.add(trimmed);
    }
    for (const i of headerFooterIndexes(lines)) {
      const trimmed = String(lines[i] || '').trim();
      if (trimmed && (ADDRESS_LABEL_RE.test(trimmed) || (i < 10 && HEADER_LOCATION_LINE_RE.test(trimmed)))) terms.add(trimmed);
    }
    return [...terms].filter(Boolean);
  }

  window.MimirPrivacy = {
    mask,
    leakScan: directResidualScan,
    sensitiveTerms,
    rulesVersion: 'privacy-firewall-2.6.0-practical-nonblocking',
    mode: 'practical',
  };
})();
