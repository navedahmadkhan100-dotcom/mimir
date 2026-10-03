export const CLAIM_MODEL_VERSION = '4.0.0-claim-model';

const ACTION_PATTERNS = [
  ['architect', /\b(?:architect(?:ed|ing|ure)?|solution\s+design|technical\s+design)\b/i],
  ['design', /\b(?:design(?:ed|ing)?|blueprint(?:ed|ing)?)\b/i],
  ['lead', /\b(?:lead|led|leadership|headed|managed|owned|ownership|responsible\s+for)\b/i],
  ['implement', /\b(?:implement(?:ed|ation|ing)?|deploy(?:ed|ment|ing)?|roll(?:ed)?\s*out|build|built|configured?)\b/i],
  ['migrate', /\b(?:migrat(?:e|ed|ion|ing)|transition(?:ed|ing)?|moderni[sz](?:e|ed|ation|ing))\b/i],
  ['administer', /\b(?:administer(?:ed|ing)?|administration|operat(?:e|ed|ing|ions)|maintain(?:ed|ing)?)\b/i],
  ['support', /\b(?:support(?:ed|ing)?|troubleshoot(?:ed|ing)?|incident|service\s+desk)\b/i],
  ['develop', /\b(?:develop(?:ed|ment|ing)?|cod(?:e|ed|ing)|program(?:med|ming)?)\b/i],
  ['test', /\b(?:test(?:ed|ing)?|qa|quality\s+assurance|validation)\b/i],
  ['consult', /\b(?:consult(?:ed|ing|ant)?|advis(?:e|ed|ing|ory))\b/i],
];

const SCALE_RE = /\b(?:enterprise|global|multi[-\s]?country|multi[-\s]?region|large[-\s]?scale|\d{3,}[,+]?\s*(?:users?|devices?|endpoints?|servers?|sites?|employees?|tenants?|applications?|workloads?))\b/i;
const OWNERSHIP_RE = /\b(?:owned|ownership|responsible\s+for|accountable|led|lead|headed|architected|designed|decision[-\s]?making)\b/i;

function uniq(values = []) { return [...new Set(values.filter(Boolean))]; }

export function inferRequiredActions(text = '') {
  const actions = [];
  for (const [name, re] of ACTION_PATTERNS) if (re.test(String(text))) actions.push(name);
  return uniq(actions);
}

function claimStatement(req) {
  const concepts = [...(req.target_concepts || []), ...(req.alternatives || [])].filter(Boolean);
  const conceptText = concepts.length ? concepts.join(req.requirement_logic === 'all_of' ? ' + ' : ' / ') : req.text;
  if (req.requirement_type === 'minimum_duration' || Number(req.minimum_years) > 0) {
    return `Candidate establishes at least ${req.minimum_years} years of relevant ${conceptText} experience.`;
  }
  if (req.requirement_type === 'counted_experience' || Number(req.minimum_count) > 0) {
    return `Candidate establishes at least ${req.minimum_count} distinct qualifying ${req.count_unit || 'project'} instances for ${conceptText}.`;
  }
  if (req.requirement_type === 'credential') return `Candidate holds the required credential: ${req.exact_credential || conceptText}.`;
  if (req.requirement_type === 'factual_gate') return `Candidate satisfies the factual requirement: ${req.text}.`;
  if (req.requirement_type === 'behavioral') return `Candidate demonstrates the behavioural requirement: ${req.text}.`;
  return `Candidate establishes the required capability: ${req.text}.`;
}

export function buildClaimModel(structuredJd = {}) {
  const claims = (structuredJd.requirements || []).map((req) => {
    const text = String(req.text || '');
    const requiredActions = inferRequiredActions(text);
    const ownershipRequired = OWNERSHIP_RE.test(text) || requiredActions.some((a) => ['architect','design','lead'].includes(a));
    const scaleRequired = SCALE_RE.test(text);
    const dimensions = {
      technology: (req.target_concepts || []).length > 0 || (req.alternatives || []).length > 0,
      duration: Number(req.minimum_years) > 0,
      count: Number(req.minimum_count) > 0,
      lifecycle: req.lifecycle_scope === 'end_to_end',
      roleContext: (req.required_role_context || []).length > 0,
      deploymentModel: !['not_applicable','unknown',undefined,null,''].includes(req.deployment_model),
      credential: req.requirement_type === 'credential' || Boolean(req.exact_credential),
      ownership: ownershipRequired,
      scale: scaleRequired,
      actions: requiredActions,
    };
    return {
      claim_id: `C-${req.id}`,
      requirement_id: req.id,
      statement: claimStatement(req),
      requirement_text: req.text,
      requirement_type: req.requirement_type,
      priority: req.priority,
      strictness: req.strictness,
      target_concepts: [...(req.target_concepts || [])],
      alternatives: [...(req.alternatives || [])],
      required_actions: requiredActions,
      ownership_required: ownershipRequired,
      scale_required: scaleRequired,
      dimensions,
    };
  });
  return { version: CLAIM_MODEL_VERSION, claims };
}
