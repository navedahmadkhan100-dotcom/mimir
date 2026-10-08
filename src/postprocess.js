import Ajv from 'ajv';
import { evaluationSchema, structuredJdSchema } from './schemas.js';
import { quoteExistsInMaskedCv } from './mask.js';
import { reconcileRelation, conceptSurfaceForms } from './ontology.js';
import { normalizeStructuredJd } from './requirementRules.js';
import { normalizeJdIntelligence } from './jdIntelligence.js';

const ajv = new Ajv({ allErrors: true, strict: false });
const validateEvaluation = ajv.compile(evaluationSchema);
const validateStructuredJdSchema = ajv.compile(structuredJdSchema);

export function upgradeStructuredJd(value) {
  if (!value || typeof value !== 'object') return value;
  const upgraded = normalizeStructuredJd({
    role_title: value.role_title || '',
    role_summary: value.role_summary || '',
    intelligence:value.intelligence || {},
    requirements: (value.requirements || []).map((r) => ({
      requirement_type: 'capability', minimum_count: null, count_unit: '', required_role_context: [],
      lifecycle_scope: 'not_applicable', deployment_model: 'not_applicable', exact_credential: '', version_constraint: '',
      ...r,
    })),
  });
  return normalizeJdIntelligence(upgraded);
}

export function validateStructuredJd(value) {
  const upgraded = upgradeStructuredJd(value);
  const ok = validateStructuredJdSchema(upgraded);
  if (!ok) return { ok:false, error:ajv.errorsText(validateStructuredJdSchema.errors,{ separator:'; ' }), value:upgraded };
  return { ok:true, value:upgraded };
}

function canonicalizeColdStructure(result) {
  const normalizedJd = upgradeStructuredJd(result.structured_jd || { role_title:'', role_summary:'', requirements:[] });
  const oldToNew = new Map();
  const requirements = (normalizedJd.requirements || []).map((req,index) => {
    const nextId = `R${index+1}`; oldToNew.set(req.id,nextId); return { ...req, id:nextId };
  });
  const matches = (result.matches || []).map((match) => ({ ...match, requirement_id:oldToNew.get(match.requirement_id) || match.requirement_id }));
  return { ...result, structured_jd:{ ...normalizedJd, requirements }, matches };
}

function forceCachedJd(result, cachedJd) {
  const upgraded = upgradeStructuredJd(cachedJd);
  const allowed = new Set((upgraded.requirements || []).map((r) => r.id));
  return { ...result, structured_jd:upgraded, matches:(result.matches || []).filter((m) => allowed.has(m.requirement_id)) };
}

function pageForTextQuote(maskedCv, quote) {
  const q = String(quote || '').replace(/\s+/g, ' ').trim();
  if (!q) return null;
  const source = String(maskedCv || '');
  const matches = [...source.matchAll(/\[PAGE\s+(\d+)\]\s*/gi)];
  if (!matches.length) return null;
  for (let i = 0; i < matches.length; i += 1) {
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : source.length;
    const pageText = source.slice(start, end).replace(/\s+/g, ' ').trim();
    if (pageText.includes(q)) return Number(matches[i][1]);
  }
  return null;
}

function verifyEvidenceProvenance(result, maskedCv, cvVisualAssets = []) {
  const verifiedEvidence=[]; const validEvidenceIds=new Set();
  const visualMap=new Map((cvVisualAssets || []).map((asset) => [asset.id,asset]));
  for (const evidence of result.evidence || []) {
    if (evidence.source_type === 'visual') {
      const asset=visualMap.get(evidence.visual_asset_id);
      if (!asset || !String(evidence.visual_observation || '').trim()) continue;
      verifiedEvidence.push({ ...evidence, quote:'', visual_asset_id:asset.id, source_page:asset.sourcePage ?? null, source_hint:asset.sourceHint || '' });
      validEvidenceIds.add(evidence.id); continue;
    }
    if (evidence.source_type === 'text' && quoteExistsInMaskedCv(evidence.quote,maskedCv)) {
      const sourcePage = pageForTextQuote(maskedCv, evidence.quote);
      verifiedEvidence.push({ ...evidence, visual_asset_id:null, visual_observation:'', source_page:sourcePage, source_hint:sourcePage ? `PDF page ${sourcePage}` : '' });
      validEvidenceIds.add(evidence.id);
    }
  }
  const matches=(result.matches || []).map((match) => {
    const ids=(match.evidence_ids || []).filter((id) => validEvidenceIds.has(id));
    const instances=(match.qualifying_instances || []).map((instance) => ({
      ...instance,
      evidence_ids:(instance.evidence_ids || []).filter((id) => validEvidenceIds.has(id)),
    })).filter((instance) => instance.evidence_ids.length > 0);
    if (ids.length || instances.length || ['not_assessable','missing','contradicted'].includes(match.support_state)) {
      return { ...match, evidence_ids:ids, qualifying_instances:instances };
    }
    return { ...match, evidence_ids:[], relation:'none', support_state:'missing', inference_path:[], lifecycle_phases:[], qualifying_instances:[],
      reason:'No server-verified text quote or approved visual evidence remained after evidence validation.' };
  });
  return { ...result, evidence:verifiedEvidence, matches };
}

function snippetAround(text, needle) {
  const lower=text.toLowerCase(); const i=lower.indexOf(needle.toLowerCase()); if (i < 0) return '';
  let start=Math.max(0,i-180); let end=Math.min(text.length,i+needle.length+220);
  const leftBreak=Math.max(text.lastIndexOf('\n',i),text.lastIndexOf('.',i)); if (leftBreak >= start) start=leftBreak+1;
  const nextNl=text.indexOf('\n',i+needle.length); const nextDot=text.indexOf('.',i+needle.length);
  const candidates=[nextNl,nextDot].filter((x) => x >= 0); if (candidates.length) end=Math.min(end,Math.min(...candidates)+1);
  return text.slice(start,end).trim();
}

function augmentExplicitEvidence(result, maskedCv) {
  let counter=1;
  const existingIds=new Set((result.evidence || []).map((e) => e.id));
  while (existingIds.has(`D${counter}`)) counter += 1;
  const evidence=[...(result.evidence || [])];
  const matches=(result.matches || []).map((match) => {
    if ((match.evidence_ids || []).length > 0 || (match.qualifying_instances || []).length > 0) return match;
    const req=(result.structured_jd?.requirements || []).find((r) => r.id === match.requirement_id);
    if (!req || ['behavioral','factual_gate'].includes(req.requirement_type)) return match;
    const targets=[...(req.target_concepts || []), ...(req.alternatives || [])].filter(Boolean);
    for (const target of targets) {
      for (const surface of conceptSurfaceForms(target)) {
        const quote=snippetAround(maskedCv,surface);
        if (!quote || !quoteExistsInMaskedCv(quote,maskedCv)) continue;
        const id=`D${counter++}`;
        evidence.push({
          id, source_type:'text', quote, visual_asset_id:null, visual_observation:'', source_page:pageForTextQuote(maskedCv, quote), source_hint:'deterministic explicit-evidence scan',
          skills:[surface], capabilities:[], depth:'mentioned', recency_year:null, duration_months:null,
          career_context:'Explicit CV mention recovered deterministically.', project_key:'', role_context:'', lifecycle_phases:[],
        });
        return { ...match, evidence_ids:[id], relation:'transferable', support_state:'unsettled', recovery_only:true, inference_path:[],
          reason:'Conservative quote recovery: terminology appears in the CV, but the full responsibility, scope and ownership still require semantic verification.' };
      }
    }
    return match;
  });
  return { ...result, evidence, matches };
}

// Recovery across requirements: a validated quote relevant to R2 is still eligible
// for R5, e.g. a BMS line containing both UAT and cutover. This is deliberately
// a low-credit contextual signal, NOT proof of the whole requirement.
const SHARED_ACTIONS = ['cutover','uat','migration','go-live','deployment','integration','disaster recovery','testing','audit','configuration','governance'];
function recoverSharedEvidence(result) {
  const matches=(result.matches||[]).map(match=>{
    if ((match.evidence_ids||[]).length || (match.qualifying_instances||[]).length) return match;
    const req=(result.structured_jd?.requirements||[]).find(r=>r.id===match.requirement_id);
    if (!req || ['behavioral','factual_gate'].includes(req.requirement_type)) return match;
    const terms=SHARED_ACTIONS.filter(t=>String(req.text||'').toLowerCase().includes(t));
    if (!terms.length) return match;
    const shared=(result.evidence||[]).filter(e=> e.source_type==='text' &&
      terms.some(term=>new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/-/g,'[-\\s]?')}\\b`,'i').test(e.quote||'')));
    if (!shared.length) return match;
    return {...match,evidence_ids:shared.slice(0,3).map(e=>e.id),relation:'transferable',support_state:'unsettled',recovery_only:true,
      reason:'A verified quote contains related work terminology. Partial contextual evidence only; task-specific ownership and scope are not established.'};
  });
  return {...result,matches};
}

function ensureOneMatchPerRequirement(result) {
  const first=new Map(); for (const m of result.matches || []) if (!first.has(m.requirement_id)) first.set(m.requirement_id,m);
  const matches=(result.structured_jd?.requirements || []).map((req) => first.get(req.id) || ({
    requirement_id:req.id, evidence_ids:[], relation:'none',
    support_state:req.requirement_type === 'behavioral' ? 'not_assessable' : 'missing',
    reason:req.requirement_type === 'behavioral' ? 'This behavioural requirement is not reliably established from CV wording alone.' : 'No quote-backed evidence was returned for this requirement.',
    inference_path:[], lifecycle_phases:[], qualifying_instances:[],
  }));
  return { ...result, matches };
}

function reconcileWithOntology(result) {
  const reqMap=new Map((result.structured_jd?.requirements || []).map((r) => [r.id,r]));
  const evidenceMap=new Map((result.evidence || []).map((e) => [e.id,e]));
  const matches=(result.matches || []).map((match) => {
    const req=reqMap.get(match.requirement_id);
    if (!req || !match.evidence_ids?.length || match.recovery_only) return { ...match, reconciled_by_ontology:false };
    const items=match.evidence_ids.map((id) => evidenceMap.get(id)).filter(Boolean);
    const reconciled=reconcileRelation(req,items,match.relation,match.inference_path);
    return { ...match, relation:reconciled.relation, inference_path:reconciled.inferencePath, reconciled_by_ontology:reconciled.reconciledByOntology };
  });
  return { ...result, matches };
}

export function validateAndSanitizeModelOutput(raw, maskedCv, cachedJd=null, cvVisualAssets=[]) {
  if (!validateEvaluation(raw)) {
    const details=ajv.errorsText(validateEvaluation.errors,{ separator:'; ' });
    throw new Error(`Gemini JSON failed schema validation: ${details}`);
  }
  let result=structuredClone(raw);
  result.evidence=(result.evidence||[]).map(e=>({...e,evidence_context_type:e.evidence_context_type|| (e.source_type==='visual'?'visual':'unknown')}));
  result.matches=(result.matches||[]).map(m=>({...m,dimension_support:Array.isArray(m.dimension_support)?m.dimension_support:[]}));
  result=cachedJd ? forceCachedJd(result,cachedJd) : canonicalizeColdStructure(result);
  result=verifyEvidenceProvenance(result,maskedCv,cvVisualAssets);
  result=ensureOneMatchPerRequirement(result);
  result=augmentExplicitEvidence(result,maskedCv);
  result=recoverSharedEvidence(result);
  result=reconcileWithOntology(result);
  return result;
}
