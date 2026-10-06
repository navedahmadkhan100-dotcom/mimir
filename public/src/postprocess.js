import Ajv from 'ajv';
import { evaluationSchema, structuredJdSchema } from './schemas.js';
import { quoteExistsInMaskedCv } from './mask.js';
import { reconcileRelation } from './ontology.js';

const ajv = new Ajv({ allErrors: true, strict: false });
const validateEvaluation = ajv.compile(evaluationSchema);
const validateStructuredJdSchema = ajv.compile(structuredJdSchema);

export function validateStructuredJd(value) {
  const ok = validateStructuredJdSchema(value);
  if (!ok) return { ok: false, error: ajv.errorsText(validateStructuredJdSchema.errors, { separator: '; ' }) };
  return { ok: true };
}

function canonicalizeColdStructure(result) {
  const oldToNew = new Map();
  const requirements = (result.structured_jd?.requirements || []).map((req, index) => {
    const nextId = `R${index + 1}`;
    oldToNew.set(req.id, nextId);
    return { ...req, id: nextId };
  });

  const matches = (result.matches || []).map((match) => ({
    ...match,
    requirement_id: oldToNew.get(match.requirement_id) || match.requirement_id,
  }));

  return {
    ...result,
    structured_jd: { ...result.structured_jd, requirements },
    matches,
  };
}

function forceCachedJd(result, cachedJd) {
  const allowed = new Set((cachedJd.requirements || []).map((r) => r.id));
  return {
    ...result,
    structured_jd: cachedJd,
    matches: (result.matches || []).filter((match) => allowed.has(match.requirement_id)),
  };
}

function verifyEvidenceQuotes(result, maskedCv) {
  const verifiedEvidence = [];
  const validEvidenceIds = new Set();

  for (const evidence of result.evidence || []) {
    if (quoteExistsInMaskedCv(evidence.quote, maskedCv)) {
      verifiedEvidence.push(evidence);
      validEvidenceIds.add(evidence.id);
    }
  }

  const matches = (result.matches || []).map((match) => {
    const ids = (match.evidence_ids || []).filter((id) => validEvidenceIds.has(id));
    if (ids.length || ['not_assessable', 'missing', 'contradicted'].includes(match.support_state)) {
      return { ...match, evidence_ids: ids };
    }
    return {
      ...match,
      evidence_ids: [],
      relation: 'none',
      support_state: 'missing',
      inference_path: [],
      reason: 'No server-verified verbatim quote remained after evidence validation.',
    };
  });

  return { ...result, evidence: verifiedEvidence, matches };
}

function ensureOneMatchPerRequirement(result) {
  const first = new Map();
  for (const match of result.matches || []) {
    if (!first.has(match.requirement_id)) first.set(match.requirement_id, match);
  }

  const matches = (result.structured_jd?.requirements || []).map((req) => (
    first.get(req.id) || {
      requirement_id: req.id,
      evidence_ids: [],
      relation: 'none',
      support_state: req.category === 'behavioral' ? 'not_assessable' : 'missing',
      reason: req.category === 'behavioral'
        ? 'This behavioural requirement is not reliably established from CV wording alone.'
        : 'No quote-backed evidence was returned for this requirement.',
      inference_path: [],
    }
  ));

  return { ...result, matches };
}

function reconcileWithOntology(result) {
  const reqMap = new Map((result.structured_jd?.requirements || []).map((req) => [req.id, req]));
  const evidenceMap = new Map((result.evidence || []).map((evidence) => [evidence.id, evidence]));

  const matches = (result.matches || []).map((match) => {
    const req = reqMap.get(match.requirement_id);
    if (!req || !match.evidence_ids?.length) return { ...match, reconciled_by_ontology: false };
    const evidenceItems = match.evidence_ids.map((id) => evidenceMap.get(id)).filter(Boolean);
    const reconciled = reconcileRelation(req, evidenceItems, match.relation, match.inference_path);
    return {
      ...match,
      relation: reconciled.relation,
      inference_path: reconciled.inferencePath,
      reconciled_by_ontology: reconciled.reconciledByOntology,
    };
  });

  return { ...result, matches };
}

export function validateAndSanitizeModelOutput(raw, maskedCv, cachedJd = null) {
  if (!validateEvaluation(raw)) {
    const details = ajv.errorsText(validateEvaluation.errors, { separator: '; ' });
    throw new Error(`Gemini JSON failed schema validation: ${details}`);
  }

  let result = structuredClone(raw);
  result = cachedJd ? forceCachedJd(result, cachedJd) : canonicalizeColdStructure(result);
  result = verifyEvidenceQuotes(result, maskedCv);
  result = ensureOneMatchPerRequirement(result);
  result = reconcileWithOntology(result);
  return result;
}
