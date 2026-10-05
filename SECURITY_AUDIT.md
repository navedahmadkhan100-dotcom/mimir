# v4.4.1 Privacy-mode note

Mimir now uses **Practical PII mode**. Direct identifiers are deterministically redacted, but heuristic residual detections no longer block evaluation. This reduces false positives and improves availability, but it also means Mimir does **not** claim perfect de-identification of every possible name/location or contextual identifier. The raw CV file still remains browser-local; the server repeats direct-identifier masking before model evaluation.

# Mimir v4.4.0 Security & Architecture Audit

Date: 2026-10-04

## Scope

Static architecture/code review and deterministic regression testing of the Render full-stack build: browser document processing, privacy firewall, multimodal evidence preparation, API boundaries, Gemini gateway, evidence provenance, JD compilation, claim/entailment/Odin/policy/scoring pipeline, exports, browser storage, HTTP security controls, payload/resource limits and dependency manifest.

## Security changes in v4.4.0

- First-run JD compilation is isolated from candidate CV content. The JD is frozen before candidate-controlled text is shown to the AI evaluator.
- Explicit prompt-injection guard in the model system instruction and prompts; JD/CV text is marked untrusted document content.
- Evidence quotations are server-verified against the masked CV; unsupported text evidence is discarded.
- Visual evidence must reference an approved, browser-prepared visual asset.
- Content Security Policy and Permissions Policy enabled through Helmet.
- API responses use `no-store`; unknown `/api/*` paths return JSON 404 rather than SPA HTML.
- Browser-origin checks and `Sec-Fetch-Site` protection added.
- Render proxy is explicitly trusted for client-IP rate limiting.
- Separate rate limits for API, evaluation and export routes.
- `express-rate-limit` pinned to 8.7.0, avoiding the 2026 IPv4-mapped IPv6 DoS-vulnerable releases.
- AJV pinned to 8.20.0.
- Mammoth browser parser upgraded to 1.13.0 (post-CVE-2025-11849 fix).
- Tesseract browser runtime pinned to 7.0.0.
- Strict request, CV/JD text, visual count/size/type/magic-byte and export limits.
- DOCX zip-bomb preflight limits and PDF page limits.
- Browser JPEG visual compression is bounded to 800 KiB per prepared asset; browser/server payload limits are aligned.
- Model calls have a bounded timeout.
- API key patterns were scanned; no obvious live key is present in source/configuration.
- Dynamic model-controlled result text is HTML-escaped before insertion into the UI.

## Architecture checks

- Browser remains the official privacy boundary for document extraction and candidate redaction.
- Raw PDF/DOCX/TXT files are not accepted by the server (`/api/extract` returns 410).
- Server performs a second redaction/leak check before invoking the AI.
- Text and approved visual evidence retain provenance.
- AI does not calculate the final numerical score.
- Deterministic JavaScript performs scoring after claim entailment, Odin and policy decisions.
- Evidence Intelligence remains browser-local and does not learn CV quotations/candidate identity.

## Validation results

- Automated deterministic/regression/security tests: **52 / 52 passed**.
- JavaScript syntax validation: **passed for all runtime frontend/backend modules**.
- Core benchmark on this environment:
  - 10 requirements: ~0.72 ms average CPU
  - 25 requirements: ~0.46 ms average CPU
  - 50 requirements: ~0.74 ms average CPU
  - 100 requirements: ~2.51 ms average CPU
- Privacy regex stress test on 500,000 characters: ~12 ms masking + ~12 ms leak scan on this environment.

## Residual risks / not claims

This release is hardened; it is **not "unhackable"** and it is not an independent penetration-test certification.

1. **Public API / quota abuse** — `/api/evaluate` is intentionally public. Origin/CORS checks only constrain browsers; a scripted client can omit `Origin`. Per-IP rate limiting mitigates casual abuse, not a distributed attacker. Before broad public promotion, add a bot challenge (for example Turnstile or equivalent) or authentication.
2. **Third-party browser supply chain** — PDF.js, Mammoth, JSZip, Tesseract and html2canvas are loaded from pinned third-party CDNs. CSP limits allowed sources but a compromised allowed CDN asset could execute in the browser. Stronger future posture: self-host vendor assets and/or use integrity verification where supported.
3. **Visual non-text identity** — OCR redaction handles text PII in selected visuals, and raster-only pages are conservatively gated, but the product does not yet implement a dedicated local face detector. Do not claim that every possible photograph/non-text identity marker is guaranteed removed.
4. **Heuristic privacy detection** — candidate redaction uses rules/entity heuristics. False positives and false negatives remain possible. The server re-masks text before AI use, but if the browser missed PII, it has already crossed the browser/server network boundary. Therefore absolute "PII can never reach the server" claims are not justified without stronger client-side detection and independent testing.
5. **Dependency lock/audit** — direct critical dependencies are pinned, but this package does not currently include a newly generated `package-lock.json`. A real `npm install`/`npm audit` could not be completed in this sandbox because external package installation timed out. Generate and commit a lockfile in a normal networked environment.
6. **Live runtime testing** — no live Render penetration test and no real Gemini call were performed in this audit. A deployed staging smoke test is still required for PDF/DOCX/visual/OCR/CSP behavior and one real evaluation/export cycle.

## Release gate recommendation

Before connecting the production domain, deploy v4.4.0 to the current Render service and perform these smoke tests on the random Render URL:

1. pasted CEIPAL CV + normal JD;
2. PDF CV with text only;
3. DOCX CV;
4. CV with a technical diagram/chart;
5. CV containing name/email/phone/LinkedIn/location/SC or BPSS wording;
6. malicious CV text containing instructions such as "ignore previous instructions";
7. strong match, weak match and exact-tool non-substitution cases;
8. PDF, DOCX and JSON exports;
9. repeat same JD with a second CV to confirm cached/frozen JD path;
10. browser console + Render logs checked for CSP, OCR, payload or server errors.

Only after those pass should `mimir.co.in` be pointed at the service.
