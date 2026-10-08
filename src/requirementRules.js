const COUNT_RE = /\b(?:at\s+least\s+)?(\d+)\s*(?:[-–]\s*(\d+))?\s+((?:[A-Za-z][A-Za-z0-9/+.-]*\s+){0,6})(implementations?|migrations?|programmes?|programs?|projects?|rollouts?|deployments?)\b/i;
const YEAR_RE = /\b(\d+(?:\.\d+)?)\s*\+?\s*years?\b/i;
const END_TO_END_RE = /\b(?:end[-\s]?to[-\s]?end|e2e)\b/i;
const CERT_RE = /\b(?:certified|certification|certificate)\b/i;
const PREFERRED_RE = /\b(?:preferred|desirable|nice\s+to\s+have|bonus)\b/i;
const MANDATORY_RE = /\b(?:mandatory|must\s+have|required|essential|no\s+substitute)\b/i;
const METHODOLOGY_RE = /\b(?:methodology|framework)\b/i;
const ROLE_CONTEXT_RE = /\bas\s+(?:an?\s+)?([A-Za-z][A-Za-z /&-]{2,60}?(?:manager|architect|lead|consultant|engineer|developer|analyst|director|owner))\b/i;
const CLEARANCE_RE = /\b(?:sc\s+clear(?:ed|ance)|dv\s+clear(?:ed|ance)|bpss|ctc\s+clear(?:ed|ance)|developed\s+vetting|security\s+clearance|nato\s+(?:secret|confidential)|ukic\s+clearance)\b/i;
const STAKEHOLDER_RESP_RE = /\b(?:collaborat(?:e|ed|ing)\s+with|partner(?:ed|ing)?\s+with|liais(?:e|ed|ing)\s+with|work(?:ed|ing)?\s+closely\s+with|stakeholder\s+management|manage(?:d|ment)?\s+(?:key\s+)?stakeholders?)\b/i;
const FACTUAL_GATE_RE = /\b(?:right\s+to\s+work|work\s+authori[sz]ation|visa\s+(?:status|requirement)|sponsorship|must\s+be\s+based|must\s+reside|relocation\s+required)\b/i;

function inferCountUnit(text) {
  const match = text.match(COUNT_RE);
  if (!match) return '';
  const unit = match[4].toLowerCase();
  return unit.endsWith('s') ? unit.slice(0, -1) : unit;
}

function inferDeployment(text, current = 'not_applicable') {
  if (/\bsaas\b|software\s+as\s+a\s+service/i.test(text)) return 'saas';
  if (/\bpaas\b|platform\s+as\s+a\s+service/i.test(text)) return 'paas';
  if (/\biaas\b|infrastructure\s+as\s+a\s+service/i.test(text)) return 'iaas';
  if (/\bhybrid\b/i.test(text)) return 'hybrid';
  if (/\bon[-\s]?prem/i.test(text)) return 'on_prem';
  return current || 'not_applicable';
}

export function normalizeRequirementSemantics(input) {
  const req = structuredClone(input);
  const text = String(req.text || '');
  let count = text.match(COUNT_RE);
  if (count && /\b(?:years?|months?|experience)\b/i.test(count[3] || '')) count = null;
  const years = text.match(YEAR_RE);
  const role = text.match(ROLE_CONTEXT_RE);

  if (CLEARANCE_RE.test(text) || FACTUAL_GATE_RE.test(text)) {
    req.requirement_type = 'factual_gate';
    req.assessment_hint = 'gate';
  } else if (count) {
    req.requirement_type = 'counted_experience';
    req.minimum_count = Number(count[1]);
    req.count_unit = req.count_unit || inferCountUnit(text);
  } else if (req.category === 'certification' || CERT_RE.test(text)) {
    req.requirement_type = 'credential';
    req.exact_credential = req.exact_credential || (req.target_concepts || []).join(' / ');
  } else if (req.category === 'behavioral' && STAKEHOLDER_RESP_RE.test(text)) {
    // A concrete cross-functional stakeholder responsibility is CV-assessable;
    // do not demote it to a generic soft-skill verification item just because
    // the provider labelled it behavioural.
    req.category = 'responsibility';
    req.requirement_type = 'capability';
    if (!req.responsibility_level || req.responsibility_level === 'unspecified') req.responsibility_level = 'coordinate';
  } else if (req.category === 'behavioral') {
    req.requirement_type = 'behavioral';
  } else if (req.category === 'methodology' || METHODOLOGY_RE.test(text)) {
    req.requirement_type = 'methodology';
  } else if (years) {
    req.requirement_type = 'minimum_duration';
    if (!Number.isFinite(Number(req.minimum_years))) req.minimum_years = Number(years[1]);
  } else if (req.requirement_logic === 'any_of') {
    req.requirement_type = 'capability';
  } else if (PREFERRED_RE.test(text)) {
    req.requirement_type = 'preferred_technology';
  } else if (req.strictness === 'exact_required') {
    req.requirement_type = 'exact_technology';
  } else {
    req.requirement_type = req.requirement_type || 'capability';
  }

  if (END_TO_END_RE.test(text)) req.lifecycle_scope = 'end_to_end';
  if (role && !(req.required_role_context || []).length) req.required_role_context = [role[1].trim()];
  req.deployment_model = inferDeployment(text, req.deployment_model);

  if (MANDATORY_RE.test(text) && req.priority === 'standard') req.priority = 'required';
  if (PREFERRED_RE.test(text)) req.priority = 'nice_to_have';

  req.minimum_count = Number.isInteger(req.minimum_count) ? req.minimum_count : null;
  req.count_unit = req.count_unit || '';
  req.required_role_context = Array.isArray(req.required_role_context) ? req.required_role_context : [];
  req.lifecycle_scope = req.lifecycle_scope || 'not_applicable';
  req.deployment_model = req.deployment_model || 'not_applicable';
  req.exact_credential = req.exact_credential || '';
  req.version_constraint = req.version_constraint || '';
  req.requirement_type = req.requirement_type || 'capability';
  return req;
}

export function normalizeStructuredJd(structuredJd) {
  return {
    ...structuredJd,
    requirements: (structuredJd.requirements || []).map(normalizeRequirementSemantics),
  };
}
