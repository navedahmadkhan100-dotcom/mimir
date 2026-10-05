# Mimir v4.4.4 — Text-First, Visual-Fidelity Reference Architecture

```text
                         JOB DESCRIPTION
                               │
                               ▼
                    Browser Document Engine
                     text + approved visuals
                               │
                               ▼
                     JD privacy preparation
                               │
                               ▼
                     JD STRUCTURE FREEZE
                   (candidate CV not present)
                               │
                               │
CANDIDATE CV                   │
PDF / DOCX / TXT               │
      │                        │
      ▼                        │
Browser Document Intelligence │
      │                        │
      ├─ TEXT FIRST → redact → ready immediately
      └─ VISUALS → background preparation
 ┌────┴─────┐                  │
 ▼          ▼                  │
TEXT      VISUAL               │
           charts / graphs     │
           architecture        │
           diagrams            │
 └────┬─────┘                  │
      ▼                        │
Candidate Privacy Firewall     │
      │                        │
name / email / phone / location / postcode
LinkedIn / GitHub / IDs / references / clearance
visual text PII / metadata / sensitive identity hints
      │
      ▼
Direct-PII masking + warning scan
      │
      ▼
Bounded sanitized payload
(visual timeout/failure never blocks text evaluation)
      │
      └───────────────────────┬─────────────────────────
                              ▼
                         RENDER WEB API
                              │
                    server privacy re-check
                              │
                         AI Gateway
                              │
                    candidate evaluation
                     against frozen JD
                              │
                              ▼
                         Claim Model
                              │
                         Evidence Graph
                              │
                    Evidence Semantics
                              │
                         Entailment
                              │
                    Evidence Boundaries
                              │
                         ODIN REVIEW
                              │
                    Final Evidence State
                              │
                    Capability / Policy
                              │
                  Deterministic JS Scoring
                              │
                         Score Lineage
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
               Established          Uncertain
               capability              │
                                       ▼
                              Verification Questions
                                       │
                                  Human Review
                                       │
                                       ▼
                              Evidence Intelligence
                           (browser-local, anonymized)
```

## Browser boundary

The official Mimir client performs document preparation before transmission:

- PDF/DOCX/TXT extraction and page provenance;
- chart/graph/architecture-diagram detection;
- OCR-based direct-PII scrubbing on visuals where OCR completes;
- candidate identity/sensitive-attribute masking in text;
- practical non-blocking visual privacy: OCR failure is recorded but does not delete technical evidence;
- bounded visual resizing/compression;
- browser-local saved-JD structure cache;
- browser-local anonymized Evidence Intelligence.

The server does not accept raw document uploads.

## Backend boundary

The Render service receives prepared evidence and owns:

- defense-in-depth privacy masking;
- first-run JD-only structure compilation;
- frozen-JD candidate evaluation;
- Gemini secret/API orchestration with timeout;
- schema validation and evidence provenance validation;
- Claim Model, Evidence Semantics, Entailment and Evidence Boundaries;
- Odin adversarial review and policy authority caps;
- deterministic scoring and score lineage;
- governance/audit packet;
- bounded PDF/DOCX report generation.

## Security boundary

- CSP + security headers through Helmet;
- same-origin/allowed-origin browser policy;
- proxy-aware route-specific rate limiting;
- no-store API responses;
- strict request/text/visual/export limits;
- DOCX expansion and PDF page safety limits;
- HTML escaping for model-controlled UI text;
- pinned reviewed direct dependencies;
- candidate CV cannot participate in first-pass JD compilation.

## Scoring authority

```text
AI semantic interpretation
        ↓
server-verified evidence provenance
        ↓
Entailment + Odin + policy authority cap
        ↓
Deterministic JavaScript
        ↓
Numerical score
```

AI never directly assigns Mimir's final candidate score.

## Important residual boundaries

See `SECURITY_AUDIT.md`. In particular, the public evaluation API still needs a bot challenge/authentication for stronger quota-abuse resistance, and visual non-text identity such as faces is not yet guaranteed to be detected locally.
