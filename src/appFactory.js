import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';

import { sha256, normalizeForHash, stableStringify } from './hash.js';
import { maskCandidateText, maskJdText, collectCandidateSensitiveTerms } from './mask.js';
import { coldPrompt, warmPrompt, PROMPT_VERSION } from './prompt.js';
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

export function createMimirApp(options = {}) {
  const deployment = String(options.deployment || process.env.MIMIR_DEPLOYMENT || 'server');
  const isLambda = deployment === 'aws-lambda' || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
  const serveFrontend = options.serveFrontend ?? !isLambda;
  const REFERENCE_YEAR = Number(process.env.SCORING_REFERENCE_YEAR || 2026);
  if (!Number.isInteger(REFERENCE_YEAR)) throw new Error('SCORING_REFERENCE_YEAR must be an integer.');

  const app = express();
  app.disable('x-powered-by');

  // Split-deployment CORS: the static frontend lives on Netlify while the API
  // runs on AWS Lambda. Restrict browser access to Mimir origins.
  const allowedOrigins = new Set(
    String(process.env.ALLOWED_ORIGINS || 'https://mimir.co.in,https://www.mimir.co.in')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (allowedOrigins.has(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  });
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  // Lambda synchronous invocations have a hard 6 MB payload ceiling. The browser
  // keeps evaluation payloads below 4.7 MB; the lower Express limit is defense in depth.
  app.use(express.json({ limit: isLambda ? '5mb' : '20mb' }));
  app.use(express.urlencoded({ extended: true, limit: isLambda ? '5mb' : '4mb' }));
  // The default express-rate-limit memory store is per-process and therefore not a
  // trustworthy global limiter on Lambda. Keep it for local/container deployments only.
  if (!isLambda || String(process.env.ENABLE_LAMBDA_MEMORY_RATE_LIMIT || '').toLowerCase() === 'true') {
    app.use(rateLimit({
      windowMs: 60 * 1000,
      limit: 80,
      standardHeaders: true,
      legacyHeaders: false,
    }));
  }
  if (serveFrontend) app.use(express.static(path.resolve(process.cwd(), 'public')));

  const extractor = () => new AIGateway(process.env);

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      app: 'Mimir — Find the Worthy',
      version: '4.3.0',
      architecture: 'Document Intelligence + Claim Entailment + Evidence Boundaries + Odin + Evidence Policy + Deterministic Score Lineage + Verification Intelligence',
      model: MODEL_ID,
      promptVersion: PROMPT_VERSION,
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

      const decodeAssets = (items = [], prefix = 'CV') => (Array.isArray(items) ? items : []).slice(0, 8).map((asset, index) => ({
        id: String(asset.id || `${prefix}-V${index + 1}`),
        buffer: Buffer.from(String(asset.base64 || ''), 'base64'),
        mimeType: String(asset.mimeType || 'image/jpeg'),
        sourcePage: asset.sourcePage || null,
        sourceHint: String(asset.sourceHint || ''),
        nearbyText: String(asset.nearbyText || ''),
        origin: String(asset.origin || 'browser-prepared'),
        hash: sha256(String(asset.base64 || '')),
      })).filter((asset) => asset.buffer.length > 0);
      const jdVisualAssets = cachedStructuredJd ? [] : decodeAssets(req.body.jdVisualAssets, 'JD');
      const cvVisualAssets = decodeAssets(req.body.cvVisualAssets, 'CV');
      const visualAssets = [...jdVisualAssets, ...cvVisualAssets];
      if (!cachedStructuredJd && !jdRaw) return res.status(400).json({ error: 'Job description is required.' });
      if (!cvRaw && !cvVisualAssets.length) return res.status(400).json({ error: 'Candidate CV is required.' });

      // Defense in depth only: browser is the privacy boundary; server re-masks received text and blocks residual direct identifiers.
      const cvMasked = maskCandidateText(cvRaw);
      const residualSensitiveTerms = collectCandidateSensitiveTerms(cvMasked.maskedText);
      if (residualSensitiveTerms.length) {
        return res.status(400).json({ error: 'Privacy firewall blocked evaluation because candidate-sensitive data may remain after redaction.' });
      }
      const jdMasked = jdRaw ? maskJdText(jdRaw) : { maskedText: '', report: {} };

      const jdVisualSignature = jdVisualAssets.map((asset) => asset.hash).join('|');
      const cvVisualSignature = cvVisualAssets.map((asset) => asset.hash).join('|');
      const normalizedCv = normalizeForHash(cvMasked.maskedText);
      const maskedCvHash = sha256(`${normalizedCv}|visual:${cvVisualSignature}`);

      const jdHash = cachedStructuredJd
        ? String(req.body.jdHash || sha256(stableStringify(cachedStructuredJd)))
        : sha256(`${normalizeForHash(jdMasked.maskedText)}|visual:${jdVisualSignature}`);

      const prompt = cachedStructuredJd
        ? warmPrompt(cachedStructuredJd, cvMasked.maskedText)
        : coldPrompt(jdMasked.maskedText, cvMasked.maskedText);

      const llm = await extractor().evaluate(prompt, visualAssets);
      const sanitized = validateAndSanitizeModelOutput(llm.json, cvMasked.maskedText, cachedStructuredJd, cvVisualAssets);
      const structuredJd = cachedStructuredJd || sanitized.structured_jd;
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
        scoringVersion: SCORING_VERSION,
        claimModelVersion: CLAIM_MODEL_VERSION,
        evidenceSemanticsVersion: EVIDENCE_SEMANTICS_VERSION,
        entailmentVersion: ENTAILMENT_VERSION,
        odinVersion: ODIN_VERSION,
        policyVersion: POLICY_VERSION,
        aiGatewayVersion: AI_GATEWAY_VERSION,
        evidenceGraphVersion: EVIDENCE_GRAPH_VERSION,
        jdAuditVersion: JD_AUDIT_VERSION,
        referenceYear: REFERENCE_YEAR,
      }));
      const auditId = `MIMIR-${evaluationHash.slice(0, 12).toUpperCase()}`;
      const audit = {
        jdHash,
        maskedCvHash,
        evaluationHash,
        model: MODEL_ID,
        promptVersion: PROMPT_VERSION,
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
        scoringReferenceYear: REFERENCE_YEAR,
        generatedAt: new Date().toISOString(),
        aiProvider: llm.provider || 'gemini',
        geminiInteractionId: llm.interactionId,
        usage: llm.usage,
        rawCandidateStored: false,
        serverDatabaseUsed: false,
        modelStoreEnabled: false,
        warmStructuredJdUsed: Boolean(cachedStructuredJd),
        multimodalInputUsed: visualAssets.length > 0,
        visualPrivacyGate: 'browser-side extraction + privacy scrub; unsafe assets withheld before transmission',
        clientPrivacyFirewallVersion: req.body.privacy?.firewallVersion || 'unknown',
        clientDocumentEngineVersion: req.body.privacy?.documentEngineVersion || 'unknown',
        payloadBudgetVisualsWithheld: Number(req.body.privacy?.payloadBudgetVisualsWithheld || 0),
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
      };

      return res.json(packet);
    } catch (error) {
      console.error('[Mimir evaluation error]', error?.stack || error?.message || error);
      const message = error?.message || 'Evaluation failed.';
      const clientError = /required|invalid|unsupported|unable to extract|schema|document|visual/i.test(message);
      return res.status(clientError ? 400 : 500).json({ error: message });
    }
  });

  app.post('/api/export/pdf', async (req, res) => {
    try {
      const report = req.body?.report;
      if (!report?.auditId || !Array.isArray(report?.breakdownTable)) {
        return res.status(400).json({ error: 'A valid Mimir report is required.' });
      }
      const buffer = await buildPdf(report);
      const name = safeFilename(report.structuredJd?.role_title || 'mimir-report');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${name}-Mimir.pdf"`);
      return res.send(buffer);
    } catch (error) {
      console.error('[Mimir PDF export error]', error);
      return res.status(500).json({ error: 'Unable to create PDF report.' });
    }
  });

  app.post('/api/export/docx', async (req, res) => {
    try {
      const report = req.body?.report;
      if (!report?.auditId || !Array.isArray(report?.breakdownTable)) {
        return res.status(400).json({ error: 'A valid Mimir report is required.' });
      }
      const buffer = await buildDocx(report);
      const name = safeFilename(report.structuredJd?.role_title || 'mimir-report');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${name}-Mimir.docx"`);
      return res.send(buffer);
    } catch (error) {
      console.error('[Mimir DOCX export error]', error);
      return res.status(500).json({ error: 'Unable to create DOCX report.' });
    }
  });

  if (serveFrontend) {
    app.use((_req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'public', 'index.html'));
    });
  } else {
    app.use((_req, res) => res.status(404).json({ error: 'API route not found.' }));
  }

  return app;
}
