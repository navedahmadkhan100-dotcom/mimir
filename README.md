# Mimir — Find the Worthy v4.4.3

## Evidence-Based Intelligent Engine · Text-First Document Pipeline · Background Visual Evidence

Mimir evaluates CV evidence against a job description while keeping numerical scoring deterministic. The official browser client prepares CV/JD documents locally, including text and approved technical visuals such as charts, graphs and architecture diagrams.

### Core architecture
- Browser-side PDF/DOCX/TXT text preparation; text becomes usable before visual analysis finishes
- Practical non-blocking PII redaction: direct identifiers are masked; ambiguous heuristics become warnings
- Sanitized text + sanitized visual evidence; diagrams/charts prepare asynchronously and never freeze CV readiness
- JD structure frozen before candidate-controlled CV content reaches the evaluator
- Gemini as semantic engine, not numerical scorer
- Claim Model, Evidence Semantics, Entailment, Evidence Boundaries
- Odin adversarial verification
- Capability / policy engine
- Server-verified evidence provenance
- Deterministic JavaScript scoring
- Evidence Graph + point-level score lineage
- Verification questions + governance packet
- Browser-local anonymized Evidence Intelligence

### Render deployment
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/api/health`

Required environment variable:
- `GEMINI_API_KEY`

Recommended environment variables:
- `AI_PROVIDER=gemini`
- `SCORING_REFERENCE_YEAR=2026`
- `MIMIR_DEPLOYMENT=render`
- `ALLOWED_ORIGINS=https://mimir.co.in,https://www.mimir.co.in`
- `AI_TIMEOUT_MS=75000`

Never commit a real `.env` file or API key.

## Validation and security

See:
- `SECURITY_AUDIT.md`
- `BUILD_VALIDATION_SECURITY.txt`
- `RELEASE_NOTES_SECURITY.md`

This build is security-hardened, not claimed to be unhackable or independently penetration-tested. PII redaction intentionally favors evaluation continuity over aggressive heuristic blocking: obvious direct identifiers are redacted, but ambiguous names/locations/company context will not stop an evaluation.

## v4.4.3 document behavior

- CV/JD text is extracted and PII-redacted first.
- The textarea becomes ready immediately after text extraction.
- Diagram/chart detection and preparation continues in the background.
- Native-text PDF visuals use PDF text coordinates for direct PII masking instead of OCR.
- OCR is lazy-loaded only for scanned/image-only PDF pages and DOCX embedded images.
- OCR has a bounded timeout; a slow visual can be withheld without blocking the candidate evaluation.
- If Evaluate is clicked while visuals are still preparing, Mimir waits at most 8 seconds, then continues with text plus any visual evidence already ready.
