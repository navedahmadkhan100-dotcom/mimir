import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import path from 'node:path';

import { sha256, normalizeForHash, stableStringify } from './hash.js';
import { maskCandidateText, maskJdText } from './mask.js';
import { extractTextFromUpload } from './extractText.js';
import { coldPrompt, warmPrompt, PROMPT_VERSION } from './prompt.js';
import { GeminiExtractor, MODEL_ID } from './gemini.js';
import { validateAndSanitizeModelOutput, validateStructuredJd } from './postprocess.js';
import { computeDeterministicScore, SCORING_VERSION } from './scoring.js';
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
    return parsed;
  } catch (error) {
    throw new Error(`Cached JD structure is invalid: ${error.message}`);
  }
}

export function createMimirApp() {
  const REFERENCE_YEAR = Number(process.env.SCORING_REFERENCE_YEAR || 2026);
  if (!Number.isInteger(REFERENCE_YEAR)) throw new Error('SCORING_REFERENCE_YEAR must be an integer.');

  const app = express();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024, files: 2 },
  });

  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(express.json({ limit: '4mb' }));
  app.use(express.urlencoded({ extended: true, limit: '4mb' }));
  app.use(rateLimit({
    windowMs: 60 * 1000,
    limit: 80,
    standardHeaders: true,
    legacyHeaders: false,
  }));
  app.use(express.static(path.resolve(process.cwd(), 'public')));

  const extractor = () => new GeminiExtractor(process.env.GEMINI_API_KEY || process.env.CV_GEMINI_KEY);

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      app: 'Mimir — Find the Worthy',
      version: '2.1.0',
      architecture: 'Evidence Graph',
      model: MODEL_ID,
      promptVersion: PROMPT_VERSION,
      scoringVersion: SCORING_VERSION,
      referenceYear: REFERENCE_YEAR,
      persistence: 'browser-local-only',
    });
  });

  app.post('/api/extract', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
      const rawText = (await extractTextFromUpload(req.file)).trim();
      if (!rawText) return res.status(400).json({ error: 'No readable text was found in this file.' });

      const kind = String(req.body?.kind || 'jd').toLowerCase();
      if (kind === 'cv') {
        const masked = maskCandidateText(rawText);
        return res.json({
          text: masked.maskedText,
          maskingReport: masked.report,
          redacted: true,
          filename: req.file.originalname,
        });
      }

      return res.json({
        text: rawText,
        maskingReport: null,
        redacted: false,
        filename: req.file.originalname,
      });
    } catch (error) {
      return res.status(400).json({ error: error?.message || 'Unable to extract text from this file.' });
    }
  });

  app.post('/api/evaluate', upload.fields([
    { name: 'jdFile', maxCount: 1 },
    { name: 'cvFile', maxCount: 1 },
  ]), async (req, res) => {
    try {
      const cachedStructuredJd = parseStructuredJd(req.body.structuredJd);
      const jdFromFile = await extractTextFromUpload(req.files?.jdFile?.[0]);
      const cvFromFile = await extractTextFromUpload(req.files?.cvFile?.[0]);
      const jdRaw = (jdFromFile || req.body.jdText || '').trim();
      const cvRaw = (cvFromFile || req.body.cvText || '').trim();

      if (!cachedStructuredJd && !jdRaw) return res.status(400).json({ error: 'Job description is required.' });
      if (!cvRaw) return res.status(400).json({ error: 'Candidate CV is required.' });

      const cvMasked = maskCandidateText(cvRaw);
      const jdMasked = jdRaw ? maskJdText(jdRaw) : { maskedText: '', report: {} };
      const normalizedCv = normalizeForHash(cvMasked.maskedText);
      const maskedCvHash = sha256(normalizedCv);

      const jdHash = cachedStructuredJd
        ? String(req.body.jdHash || sha256(stableStringify(cachedStructuredJd)))
        : sha256(normalizeForHash(jdMasked.maskedText));

      const prompt = cachedStructuredJd
        ? warmPrompt(cachedStructuredJd, cvMasked.maskedText)
        : coldPrompt(jdMasked.maskedText, cvMasked.maskedText);

      const llm = await extractor().evaluate(prompt);
      const sanitized = validateAndSanitizeModelOutput(llm.json, cvMasked.maskedText, cachedStructuredJd);
      const structuredJd = cachedStructuredJd || sanitized.structured_jd;
      const score = computeDeterministicScore(sanitized, structuredJd, { referenceYear: REFERENCE_YEAR });

      const evaluationHash = sha256(stableStringify({
        jdHash,
        maskedCvHash,
        structuredJd,
        model: MODEL_ID,
        promptVersion: PROMPT_VERSION,
        scoringVersion: SCORING_VERSION,
        referenceYear: REFERENCE_YEAR,
      }));
      const auditId = `MIMIR-${evaluationHash.slice(0, 12).toUpperCase()}`;

      const packet = {
        auditId,
        finalScore: score.finalScore,
        verdict: score.verdict,
        hasDealbreaker: score.hasDealbreaker,
        componentBreakdown: score.componentBreakdown,
        breakdownTable: score.breakdownTable,
        gateChecks: score.gateChecks,
        verificationItems: score.verificationItems,
        structuredJd,
        evidence: sanitized.evidence,
        jdHash,
        audit: {
          jdHash,
          maskedCvHash,
          evaluationHash,
          model: MODEL_ID,
          promptVersion: PROMPT_VERSION,
          scoringVersion: SCORING_VERSION,
          scoringReferenceYear: REFERENCE_YEAR,
          generatedAt: new Date().toISOString(),
          geminiInteractionId: llm.interactionId,
          usage: llm.usage,
          rawCandidateStored: false,
          serverDatabaseUsed: false,
          modelStoreEnabled: false,
          warmStructuredJdUsed: Boolean(cachedStructuredJd),
        },
        scoringMeta: score.scoringMeta,
        maskingReport: { jd: jdMasked.report, cv: cvMasked.report },
      };

      return res.json(packet);
    } catch (error) {
      console.error('[Mimir evaluation error]', error?.stack || error?.message || error);
      const message = error?.message || 'Evaluation failed.';
      const clientError = /required|invalid|unsupported|unable to extract|schema/i.test(message);
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

  app.use((_req, res) => {
    res.sendFile(path.resolve(process.cwd(), 'public', 'index.html'));
  });

  return app;
}
