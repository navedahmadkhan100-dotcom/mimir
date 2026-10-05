# Mimir — Find the Worthy v4.4.1

## Evidence-Based Intelligent Engine · Render Security-Hardened · Practical PII

Mimir evaluates CV evidence against a job description while keeping numerical scoring deterministic. The official browser client prepares CV/JD documents locally, including text and approved technical visuals such as charts, graphs and architecture diagrams.

### Core architecture
- Browser-side PDF/DOCX/TXT preparation
- Practical non-blocking PII redaction: direct identifiers are masked; ambiguous heuristics become warnings
- Sanitized text + sanitized visual evidence
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
