# Mimir v4.4.3 — Text-First / Non-Blocking Visuals

- Fixes the CV upload state getting stuck on “Reading CV”.
- Splits document preparation into two phases: text first, visuals in the background.
- CV/JD text and practical PII redaction become ready before diagram/chart analysis finishes.
- Native-text PDF visuals redact direct PII using PDF text coordinates; no Tesseract OCR is needed for normal selectable-text pages.
- OCR is lazy-loaded only when needed for scanned/image-only pages or DOCX embedded images.
- OCR and PDF operator inspection have bounded timeouts so visual processing cannot hang indefinitely.
- Evaluation waits at most 8 seconds for in-progress visuals and then continues with text + any visual evidence already ready.
- Visual processing errors are downgraded to visual-only warnings; they no longer make the whole CV unusable.
- Adds cache-busting query versions for Mimir frontend assets so Render deployments do not keep stale browser JavaScript.
- No Claim Model, Entailment, Odin, Policy, Evidence Graph, deterministic scoring, score-lineage, governance, or prompt-injection protections were removed.
- Full regression suite: 57/57 passing; JavaScript syntax checks passing.

# Mimir v4.4.1 — Practical PII / Non-Blocking Evaluation

- Keeps the v4.4 security hardening, prompt-injection isolation, rate limiting, payload validation and deterministic scoring architecture.
- Replaces aggressive PII hard-stops with practical redaction.
- Redacts obvious header/contact PII: candidate name in the true CV header, email, phone, LinkedIn/GitHub/profile URLs, labelled location/address, UK postcodes, explicit identifiers, clearance labels and reference contact lines.
- Employer/company names are retained as professional evidence.
- Ordinary phrases such as “address emerging issues” are never treated as postal addresses.
- Browser and server residual PII detections are warnings only and do not stop evaluation.
- Server repeats deterministic masking before Gemini as defense in depth.
- Visuals with unresolved direct PII can still be withheld locally without blocking the text evaluation.
- Exact CEIPAL-style browser→server round-trip tested.

# Mimir v4.4.0 — Render Security-Hardened

Full-system security and architecture hardening release. See `RELEASE_NOTES_SECURITY.md` and `SECURITY_AUDIT.md`.

# Mimir v4.3 — Render Fullstack

- Recombined v4.2 split frontend/backend into a single Render deployment.
- No intelligence features removed.
- Same-origin frontend/API eliminates split-host CORS/deployment complexity.
- Browser-side document preparation and privacy boundary remain unchanged.
- Visual evidence remains supported.
- Removed AWS Lambda adapter/deployment files and Lambda-only dependency.
- Render Free may spin down after idle time; this is accepted for the current zero-budget launch.


## v4.4.2 — Fast document preparation
- Reuses one Tesseract OCR worker per document instead of creating a new worker for every visual.
- Removes the second full OCR verification pass in Practical PII mode.
- PDF technical-visual pages with a native text layer and no direct PII skip OCR entirely.
- PDF visual render scale reduced from 1.35 to 1.20 before final adaptive compression.
- Visual evidence remains enabled; OCR failures still withhold unsafe visual assets rather than sending them.
