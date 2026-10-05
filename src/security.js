import { timingSafeEqual } from 'node:crypto';

export const SECURITY_VERSION = '4.4.1-security-boundaries-practical-pii';
export const MAX_JD_CHARS = 150_000;
export const MAX_CV_CHARS = 250_000;
export const MAX_STRUCTURED_JD_BYTES = 1_000_000;
export const MAX_VISUAL_ASSETS = 12;
export const MAX_VISUAL_DECODED_BYTES = 3_200_000;
export const MAX_SINGLE_VISUAL_BYTES = 900_000;
export const MAX_EXPORT_REPORT_BYTES = 2_500_000;
export const MAX_EXPORT_ROWS = 300;
export const MAX_EXPORT_CLAIMS = 500;
export const MAX_EXPORT_CHALLENGES = 500;
export const MAX_EXPORT_QUESTIONS = 300;

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

export function byteLengthJson(value) {
  return Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');
}

export function assertEvaluationTextLimits({ jdText = '', cvText = '', structuredJd = null } = {}) {
  if (String(jdText).length > MAX_JD_CHARS) throw new Error(`Job description exceeds the ${MAX_JD_CHARS.toLocaleString()} character safety limit.`);
  if (String(cvText).length > MAX_CV_CHARS) throw new Error(`Candidate CV exceeds the ${MAX_CV_CHARS.toLocaleString()} character safety limit.`);
  if (structuredJd && byteLengthJson(structuredJd) > MAX_STRUCTURED_JD_BYTES) throw new Error('Cached JD structure is too large. Recreate the JD structure from the original job description.');
}

function hasMagic(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
  if (mimeType === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  if (mimeType === 'image/webp') return buffer.subarray(0,4).toString('ascii') === 'RIFF' && buffer.subarray(8,12).toString('ascii') === 'WEBP';
  return false;
}

export function decodePreparedVisualAssets({ jdVisualAssets = [], cvVisualAssets = [] } = {}) {
  const incoming = [
    ...(Array.isArray(jdVisualAssets) ? jdVisualAssets.map((asset) => ({ ...asset, documentKind:'JD' })) : []),
    ...(Array.isArray(cvVisualAssets) ? cvVisualAssets.map((asset) => ({ ...asset, documentKind:'CV' })) : []),
  ];
  if (incoming.length > MAX_VISUAL_ASSETS) throw new Error(`Too many visual assets. Maximum ${MAX_VISUAL_ASSETS} prepared visuals are accepted per evaluation.`);

  let totalBytes = 0;
  return incoming.map((asset, index) => {
    const mimeType = String(asset?.mimeType || 'image/jpeg').toLowerCase();
    if (!ALLOWED_IMAGE_TYPES.has(mimeType)) throw new Error('Unsupported prepared visual type. Only JPEG, PNG and WebP are accepted.');
    const base64 = String(asset?.base64 || '').replace(/\s+/g, '');
    if (!base64 || base64.length > 1_250_000 || !BASE64_RE.test(base64)) throw new Error('Prepared visual payload is invalid or too large.');
    const buffer = Buffer.from(base64, 'base64');
    if (!buffer.length || buffer.length > MAX_SINGLE_VISUAL_BYTES) throw new Error(`Prepared visual exceeds the ${MAX_SINGLE_VISUAL_BYTES.toLocaleString()} byte per-image safety limit.`);
    if (!hasMagic(buffer, mimeType)) throw new Error('Prepared visual content does not match its declared image type.');
    totalBytes += buffer.length;
    if (totalBytes > MAX_VISUAL_DECODED_BYTES) throw new Error('Prepared visual evidence exceeds the total visual safety budget.');

    const sourcePage = asset?.sourcePage == null ? null : Number(asset.sourcePage);
    if (sourcePage != null && (!Number.isInteger(sourcePage) || sourcePage < 1 || sourcePage > 500)) throw new Error('Prepared visual has an invalid source page.');
    const prefix = asset.documentKind === 'JD' ? 'JD' : 'CV';
    const id = String(asset?.id || `${prefix}-V${index + 1}`).slice(0, 40);
    return {
      id,
      buffer,
      mimeType,
      sourcePage,
      sourceHint: String(asset?.sourceHint || '').slice(0, 500),
      nearbyText: String(asset?.nearbyText || '').slice(0, 5_000),
      origin: String(asset?.origin || 'browser-prepared').slice(0, 100),
      documentKind: asset.documentKind,
      base64,
    };
  });
}

export function assertExportReport(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) throw new Error('A valid Mimir report is required.');
  if (typeof report.auditId !== 'string' || !/^MIMIR-[A-Z0-9-]{6,80}$/i.test(report.auditId)) throw new Error('A valid Mimir report is required.');
  if (!Array.isArray(report.breakdownTable)) throw new Error('A valid Mimir report is required.');
  if (report.breakdownTable.length > MAX_EXPORT_ROWS) throw new Error('Report contains too many proof-matrix rows to export safely.');
  if ((report.claimAssessments?.length || 0) > MAX_EXPORT_CLAIMS) throw new Error('Report contains too many claim assessments to export safely.');
  if ((report.odinChallenges?.length || 0) > MAX_EXPORT_CHALLENGES) throw new Error('Report contains too many Odin challenges to export safely.');
  if ((report.nextBestVerificationQuestions?.length || 0) > MAX_EXPORT_QUESTIONS) throw new Error('Report contains too many verification questions to export safely.');
  if (byteLengthJson(report) > MAX_EXPORT_REPORT_BYTES) throw new Error('Report is too large to export safely.');
  return report;
}

export function ownOrigin(req) {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return host ? `${proto}://${host}` : '';
}

export function isAllowedOrigin(origin, req, allowedOrigins) {
  if (!origin) return true; // CLI/server clients do not send Origin; rate limiting remains the protection there.
  if (allowedOrigins.has(origin)) return true;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return origin === ownOrigin(req);
}

export function safeEqualString(a, b) {
  const aa = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (aa.length !== bb.length) return false;
  return timingSafeEqual(aa, bb);
}
