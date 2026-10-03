export const JD_AUDIT_VERSION = '4.0.0-requirement-audit';

const MUST_RE=/\b(?:mandatory|must|required|essential|deal[-\s]?breaker)\b/i;
const PREFERRED_RE=/\b(?:preferred|desirable|nice\s+to\s+have|bonus)\b/i;

export function auditStructuredJd(structuredJd = {}) {
  const issues=[];
  const seen=new Map();
  for (const req of structuredJd.requirements || []) {
    const normalized=String(req.text||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    if (seen.has(normalized)) issues.push({ requirement_id:req.id, severity:'medium', code:'DUPLICATE_REQUIREMENT', message:`Likely duplicate of ${seen.get(normalized)}.` });
    else seen.set(normalized,req.id);

    if (MUST_RE.test(req.text||'') && PREFERRED_RE.test(req.text||'')) {
      issues.push({ requirement_id:req.id, severity:'high', code:'PRIORITY_CONTRADICTION', message:'Requirement wording mixes mandatory and preferred language.' });
    }
    if (req.requirement_type === 'compound') {
      issues.push({ requirement_id:req.id, severity:'medium', code:'COMPOUND_REQUIREMENT', message:'Compound requirement may hide multiple independently verifiable claims.' });
    }
    if (req.strictness === 'exact_required' && req.requirement_logic === 'any_of') {
      issues.push({ requirement_id:req.id, severity:'low', code:'EXACT_ANY_OF', message:'Exact-required + any-of is valid only when every listed alternative is explicitly acceptable.' });
    }
    if (Number(req.minimum_count) > 8) {
      issues.push({ requirement_id:req.id, severity:'low', code:'HIGH_COUNT_THRESHOLD', message:'High distinct-project count should be confirmed with the hiring manager.' });
    }
    if (Number(req.minimum_years) > 15) {
      issues.push({ requirement_id:req.id, severity:'low', code:'HIGH_DURATION_THRESHOLD', message:'Very high duration threshold may exclude capable candidates; confirm business necessity.' });
    }
  }
  return {
    version:JD_AUDIT_VERSION,
    role_title:structuredJd.role_title || '',
    requirement_count:(structuredJd.requirements || []).length,
    issue_count:issues.length,
    issues,
  };
}
