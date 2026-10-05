import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';

import { sha256, normalizeForHash, stableStringify } from './hash.js';
import { maskCandidateText, maskJdText, collectCandidateSensitiveTerms } from './mask.js';
import { structureJdPrompt, warmPrompt, PROMPT_VERSION, JD_STRUCTURE_PROMPT_VERSION } from './prompt.js';
import { MODEL_ID } from './gemini.js';
import { AIGateway, AI_GATEWAY_VERSION } from './aiGateway.js';
import { validateAndSanitizeModelOutput, validateStructuredJd } from './postprocess.js';
import { computeDeterministicScore, SCORING_VERSION } from './scoring.js';
import { runOdinReview, applyOdinToClaims, buildVerificationQuestions, ODIN_VERSION } from './odin.js';
import { buildClaimModel, CLAIM_MODEL_VERSION } from './claimModel.js';
import { analyzeEvidenceSemantics, EVIDENCE_SEMANTICS_VERSION } from './evidenceSemantics.js';
import { assessClaims, ENTAILMENT_VERSION } from './entailment.js';
import { buildPolicyDecisions, POLICY_VERSION } from './policyEngine.js';
import { buildEvidenceIntelligenceRecord, EVIDENCE_INTELLIGENCE_VERSION } from './evidenceIntelligence.js';
import { buildGovernancePacket, GOVERNANCE_VERSION } from './governance.js';
import { buildEvidenceGraph, EVIDENCE_GRAPH_VERSION } from './evidenceGraph.js';
import { auditStructuredJd, JD_AUDIT_VERSION } from './jdAudit.js';
import { buildDocx, buildPdf } from './reports.js';
import {
  SECURITY_VERSION,
  assertEvaluationTextLimits,
  decodePreparedVisualAssets,
  assertExportReport,
  isAllowedOrigin,
} from './security.js';

function safeFilename(value = 'report') {
  return String(value)
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'report';
}

function parseStructuredJd(value) {
  if (!value) return null;
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    const validation = validateStructuredJd(parsed);
    if (!validation.ok) throw new Error(validation.error);
    return validation.value;
  } catch (error) {
    throw new Error(`Cached JD structure is invalid: ${error.message}`);
  }
}

function canonicalizeStructuredJd(value) {
  const validation = validateStructuredJd(value);
  if (!validation.ok) throw new Error(`JD structure is invalid: ${validation.error}`);
  return {
    ...validation.value,
    requirements: (validation.value.requirements || []).map((requirement, index) => ({
      ...requirement,
      id: `R${index + 1}`,
    })),
  };
}

export function createMimirApp(options = {}) {
  const deployment = String(options.deployment || process.env.MIMIR_DEPLOYMENT || 'server');
  const isLambda = deployment === 'aws-lambda' || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
  const serveFrontend = options.serveFrontend ?? !isLambda;
  const REFERENCE_YEAR = Number(process.env.SCORING_REFERENCE_YEAR || 2026);
  if (!Number.isInteger(REFERENCE_YEAR)) throw new Error('SCORING_REFERENCE_YEAR must be an integer.');

  const app = express();
  app.disable('x-powered-by');
  // Render terminates TLS in front of the Node process. Trust exactly one proxy hop so req.ip
  // and rate limiting use the real client address rather than the Render proxy address.
  app.set('trust proxy', 1);

  // Browser-origin policy. Render serves the official frontend and API from the
  // same service; configured custom origins are also allowed for controlled moves.
  const allowedOrigins = new Set(
    String(process.env.ALLOWED_ORIGINS || 'https://mimir.co.in,https://www.mimir.co.in')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && isAllowedOrigin(origin, req, allowedOrigins)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    if (req.method === 'OPTIONS') {
      if (origin && !isAllowedOrigin(origin, req, allowedOrigins)) return res.sendStatus(403);
      return res.sendStatus(204);
    }
    return next();
  });

  app.use(helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        scriptSrc: ["'self'", 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net'],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net', 'https://tessdata.projectnaptha.com'],
        workerSrc: ["'self'", 'blob:', 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net'],
      },
    },
  }));
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    next();
  });

  // Keep API bodies well below the memory envelope of a free Render instance. Official
  // Mimir clients already target a 4.7 MB evaluation payload.
  app.use(express.json({ limit: '6mb' }));
  app.use(express.urlencoded({ extended: false, limit: '256kb', parameterLimit: 200 }));

  // Static assets are not expensive API operations and should not consume evaluation quotas.
  if (serveFrontend) app.use(express.static(path.resolve(process.cwd(), 'public'), {
    etag: true,
    maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
    setHeaders(res, filePath) {
      if (filePath.endsWith('index.html') || filePath.endsWith('config.js')) res.setHeader('Cache-Control', 'no-cache');
    },
  }));

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: (req) => req.path === '/health',
  });
  const evaluationLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many evaluations from this network. Please wait a minute and retry.' },
  });
  const exportLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many report exports. Please wait a minute and retry.' },
  });

  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, private, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    const origin = req.headers.origin;
    const fetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
    if (fetchSite === 'cross-site') return res.status(403).json({ error: 'Cross-site API requests are not allowed.' });
    if (origin && !isAllowedOrigin(origin, req, allowedOrigins)) return res.status(403).json({ error: 'Origin is not allowed.' });
    return next();
  });
  app.use('/api', apiLimiter);
  app.use('/api/evaluate', evaluationLimiter);
  app.use('/api/export', exportLimiter);


  const extractor = () => new AIGateway(process.env);

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      app: 'Mimir — Find the Worthy',
      version: '4.4.1',
      architecture: 'Document Intelligence + Claim Entailment + Evidence Boundaries + Odin + Evidence Policy + Deterministic Score Lineage + Verification Intelligence',
      model: MODEL_ID,
      promptVersion: PROMPT_VERSION,
      jdStructurePromptVersion: JD_STRUCTURE_PROMPT_VERSION,
      scoringVersion: SCORING_VERSION,
      claimModelVersion: CLAIM_MODEL_VERSION,
      evidenceSemanticsVersion: EVIDENCE_SEMANTICS_VERSION,
      entailmentVersion: ENTAILMENT_VERSION,
      odinVersion: ODIN_VERSION,
      policyVersion: POLICY_VERSION,
      evidenceIntelligenceVersion: EVIDENCE_INTELLIGENCE_VERSION,
      governanceVersion: GOVERNANCE_VERSION,
      aiGatewayVersion: AI_GATEWAY_VERSION,
      evidenceGraphVersion: EVIDENCE_GRAPH_VERSION,
      jdAuditVersion: JD_AUDIT_VERSION,
      securityVersion: SECURITY_VERSION,
      referenceYear: REFERENCE_YEAR,
      persistence: 'browser-local-only',
      deployment,
      lambda: isLambda,
      lambdaPayloadGuard: isLambda ? '4.7MB browser target / 5MB server parser limit / 6MB AWS hard limit' : null,
    });
  });

  // v4 has no raw-document extraction API. Both JD and CV document preparation
  // occur in the browser; the backend accepts prepared evidence only.
  app.post('/api/extract', (_req, res) => res.status(410).json({
    error: 'Raw document upload is disabled. Use browser document intelligence and send prepared text/visual evidence to /api/evaluate.',
  }));

  app.post('/api/evaluate', async (req, res) => {
    try {
      const cachedStructuredJd = parseStructuredJd(req.body.structuredJd);
      const jdRaw = String(req.body.jdText || '').trim();
      const cvRaw = String(req.body.cvText || '').trim();
      if (!req.body?.privacy?.clientPrepared) return res.status(400).json({ error: 'Client privacy preparation is required.' });

      assertEvaluationTextLimits({ jdText: jdRaw, cvText: cvRaw, structuredJd: cachedStructuredJd });
      const decodedVisuals = decodePreparedVisualAssets({
        jdVisualAssets: cachedStructuredJd ? [] : req.body.jdVisualAssets,
        cvVisualAssets: req.body.cvVisualAssets,
      }).map((asset) => ({ ...asset, hash: sha256(asset.base64) }));
      const jdVisualAssets = decodedVisuals.filter((asset) => asset.documentKind === 'JD');
      const cvVisualAssets = decodedVisuals.filter((asset) => asset.documentKind === 'CV');
      const visualAssets = decodedVisuals;
      if (!cachedStructuredJd && !jdRaw) return res.status(400).json({ error: 'Job description is required.' });
      if (!cvRaw && !cvVisualAssets.length) return res.status(400).json({ error: 'Candidate CV is required.' });

      // Practical PII mode: browser performs basic redaction and the server repeats
      // deterministic masking as defense in depth. Residual detections are audit
      // warnings only; heuristic privacy guesses must never stop an evaluation.
      const cvMasked = maskCandidateText(cvRaw);
      const residualSensitiveTerms = collectCandidateSensitiveTerms(cvMasked.maskedText);
      const jdMasked = jdRaw ? maskJdText(jdRaw) : { maskedText: '', report: {} };

      const jdVisualSignature = jdVisualAssets.map((asset) => asset.hash).join('|');
      const cvVisualSignature = cvVisualAssets.map((asset) => asset.hash).join('|');
      const normalizedCv = normalizeForHash(cvMasked.maskedText);
      const maskedCvHash = sha256(`${normalizedCv}|visual:${cvVisualSignature}`);

      const jdHash = cachedStructuredJd
        ? String(req.body.jdHash || sha256(stableStringify(cachedStructuredJd)))
        : sha256(`${normalizeForHash(jdMasked.maskedText)}|visual:${jdVisualSignature}`);

      // Security boundary: freeze the JD before the candidate CV is ever shown to the model.
      // This prevents candidate-controlled prompt injection from rewriting first-run job requirements.
      const gateway = extractor();
      let jdStructureRun = null;
      let structuredJd = cachedStructuredJd;
      if (!structuredJd) {
        jdStructureRun = await gateway.structureJd(structureJdPrompt(jdMasked.maskedText), jdVisualAssets);
        structuredJd = canonicalizeStructuredJd(jdStructureRun.json);
      }

      const prompt = warmPrompt(structuredJd, cvMasked.maskedText);
      const llm = await gateway.evaluate(prompt, cvVisualAssets);
      const sanitized = validateAndSanitizeModelOutput(llm.json, cvMasked.maskedText, structuredJd, cvVisualAssets);
      const jdAudit = auditStructuredJd(structuredJd);

      // Mimir Evidence Intelligence pipeline. The model extracts semantics; deterministic code decides what the evidence is permitted to establish.
      const claimModel = buildClaimModel(structuredJd);
      const evidenceSemantics = analyzeEvidenceSemantics(sanitized.evidence);
      const preOdinClaims = assessClaims({ claimModel, structuredJd, matches:sanitized.matches, evidenceSemantics });
      const odinChallenges = runOdinReview(sanitized, preOdinClaims, evidenceSemantics);
      const claimAssessments = applyOdinToClaims(preOdinClaims, odinChallenges);
      const policyDecisions = buildPolicyDecisions({ structuredJd, matches:sanitized.matches, claimAssessments, evidence:sanitized.evidence });
      const evidenceGraph = buildEvidenceGraph({ structuredJd, evidence:sanitized.evidence, matches:sanitized.matches, claimAssessments, evidenceSemantics });
      const score = computeDeterministicScore(sanitized, structuredJd, {
        referenceYear: REFERENCE_YEAR,
        policyDecisions,
        claimAssessments,
      });
      const nextBestVerificationQuestions = buildVerificationQuestions(sanitized, odinChallenges, claimAssessments);

      const evaluationHash = sha256(stableStringify({
        jdHash,
        maskedCvHash,
        structuredJd,
        visualAssetHashes: visualAssets.map((asset) => asset.hash),
        model: MODEL_ID,
        promptVersion: PROMPT_VERSION,
        jdStructurePromptVersion: JD_STRUCTURE_PROMPT_VERSION,
        scoringVersion: SCORING_VERSION,
        claimModelVersion: CLAIM_MODEL_VERSION,
        evidenceSemanticsVersion: EVIDENCE_SEMANTICS_VERSION,
        entailmentVersion: ENTAILMENT_VERSION,
        odinVersion: ODIN_VERSION,
        policyVersion: POLICY_VERSION,
        aiGatewayVersion: AI_GATEWAY_VERSION,
        evidenceGraphVersion: EVIDENCE_GRAPH_VERSION,
        jdAuditVersion: JD_AUDIT_VERSION,
        securityVersion: SECURITY_VERSION,
        referenceYear: REFERENCE_YEAR,
      }));
      const auditId = `MIMIR-${evaluationHash.slice(0, 12).toUpperCase()}`;
      const audit = {
        jdHash,
        maskedCvHash,
        evaluationHash,
        model: MODEL_ID,
        promptVersion: PROMPT_VERSION,
        jdStructurePromptVersion: JD_STRUCTURE_PROMPT_VERSION,
        scoringVersion: SCORING_VERSION,
        claimModelVersion: CLAIM_MODEL_VERSION,
        evidenceSemanticsVersion: EVIDENCE_SEMANTICS_VERSION,
        entailmentVersion: ENTAILMENT_VERSION,
        odinVersion: ODIN_VERSION,
        policyVersion: POLICY_VERSION,
        evidenceIntelligenceVersion: EVIDENCE_INTELLIGENCE_VERSION,
        governanceVersion: GOVERNANCE_VERSION,
        aiGatewayVersion: AI_GATEWAY_VERSION,
        evidenceGraphVersion: EVIDENCE_GRAPH_VERSION,
        jdAuditVersion: JD_AUDIT_VERSION,
        securityVersion: SECURITY_VERSION,
        scoringReferenceYear: REFERENCE_YEAR,
        generatedAt: new Date().toISOString(),
        aiProvider: llm.provider || 'gemini',
        geminiInteractionId: llm.interactionId,
        jdStructureInteractionId: jdStructureRun?.interactionId || null,
        usage: { jdStructure: jdStructureRun?.usage || null, evaluation: llm.usage || null },
        rawCandidateStored: false,
        serverDatabaseUsed: false,
        modelStoreEnabled: false,
        warmStructuredJdUsed: Boolean(cachedStructuredJd),
        jdStructuredBeforeCandidate: true,
        multimodalInputUsed: visualAssets.length > 0,
        visualPrivacyGate: 'browser-side extraction + privacy scrub; unsafe assets withheld before transmission',
        clientPrivacyFirewallVersion: req.body.privacy?.firewallVersion || 'unknown',
        clientDocumentEngineVersion: req.body.privacy?.documentEngineVersion || 'unknown',
        payloadBudgetVisualsWithheld: Number(req.body.privacy?.payloadBudgetVisualsWithheld || 0),
        privacyMode: req.body.privacy?.mode || 'practical',
        clientPrivacyWarnings: Array.isArray(req.body.privacy?.warnings) ? req.body.privacy.warnings.slice(0, 20) : [],
        serverPrivacyWarnings: residualSensitiveTerms.slice(0, 20),
        requestContentLength: Number(req.headers['content-length'] || 0) || null,
      };
      const evidenceIntelligence = buildEvidenceIntelligenceRecord({ auditId, structuredJd, claimAssessments, evidenceSemantics, policyDecisions });
      const governance = buildGovernancePacket({ audit, claimAssessments, odinChallenges, policyDecisions });

      const packet = {
        auditId,
        finalScore: score.finalScore,
        verdict: score.verdict,
        hasDealbreaker: score.hasDealbreaker,
        componentBreakdown: score.componentBreakdown,
        breakdownTable: score.breakdownTable,
        gateChecks: score.gateChecks,
        verificationItems: score.verificationItems,
        claimModel,
        evidenceSemantics,
        evidenceGraph,
        jdAudit,
        claimAssessments,
        policyDecisions,
        odinChallenges,
        nextBestVerificationQuestions,
        constraintChecks: score.constraintChecks,
        structuredJd,
        evidence: sanitized.evidence,
        evidenceIntelligence,
        governance,
        jdHash,
        documentIntelligence: {
          jd: req.body.jdDocumentIntelligence || {},
          cv: req.body.cvDocumentIntelligence || {},
          visualAssetsSent: visualAssets.length,
          jdVisualAssetsSent: jdVisualAssets.length,
          cvVisualAssetsSent: cvVisualAssets.length,
        },
        audit,
        scoringMeta: score.scoringMeta,
        maskingReport: { jd: jdMasked.report, cv: cvMasked.report },
        privacyWarnings: { client: audit.clientPrivacyWarnings, server: audit.serverPrivacyWarnings },
      };

      return res.json(packet);
    } catch (error) {
      console.error('[Mimir evaluation error]', error?.stack || error?.message || error);
      const message = error?.message || 'Evaluation failed.';
      const clientError = /required|invalid|unsupported|unable to extract|schema|document|visual|too large|exceeds|too many|safety|payload/i.test(message);
      return res.status(clientError ? 400 : 500).json({ error: message });
    }
  });

  app.post('/api/export/pdf', async (req, res) => {
    try {
      const report = assertExportReport(req.body?.report);
      const buffer = await buildPdf(report);
      const name = safeFilename(report.structuredJd?.role_title || 'mimir-report');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${name}-Mimir.pdf"`);
      return res.send(buffer);
    } catch (error) {
      console.error('[Mimir PDF export error]', error);
      return res.status(/valid|too many|too large/i.test(error?.message || '') ? 400 : 500).json({ error: /valid|too many|too large/i.test(error?.message || '') ? error.message : 'Unable to create PDF report.' });
    }
  });

  app.post('/api/export/docx', async (req, res) => {
    try {
      const report = assertExportReport(req.body?.report);
      const buffer = await buildDocx(report);
      const name = safeFilename(report.structuredJd?.role_title || 'mimir-report');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${name}-Mimir.docx"`);
      return res.send(buffer);
    } catch (error) {
      console.error('[Mimir DOCX export error]', error);
      return res.status(/valid|too many|too large/i.test(error?.message || '') ? 400 : 500).json({ error: /valid|too many|too large/i.test(error?.message || '') ? error.message : 'Unable to create DOCX report.' });
    }
  });

  // Unknown API routes must never fall through to the SPA HTML shell.
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));

  if (serveFrontend) {
    app.use((_req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'public', 'index.html'));
    });
  } else {
    app.use((_req, res) => res.status(404).json({ error: 'Route not found.' }));
  }

  // JSON-only error boundary: do not expose Express/Node stack traces or HTML parser errors.
  app.use((error, _req, res, _next) => {
    if (error?.type === 'entity.too.large' || error?.status === 413) {
      return res.status(413).json({ error: 'Request payload is too large.' });
    }
    if (error instanceof SyntaxError && error?.status === 400 && 'body' in error) {
      return res.status(400).json({ error: 'Request body contains invalid JSON.' });
    }
    console.error('[Mimir unhandled request error]', error?.message || error);
    return res.status(500).json({ error: 'Unexpected server error.' });
  });

  return app;
}
