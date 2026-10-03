# Mimir v4.2 — Reference Architecture

```text
                         JOB DESCRIPTION
                               │
                               ▼
                    Browser Document Engine
                               │
                       structured text/visuals
                               │
                               │
CANDIDATE CV                   │
PDF / DOCX / TXT               │
      │                        │
      ▼                        │
Browser Document Intelligence │
      │                        │
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
visual PII / QR / metadata / sensitive identity hints
      │
      ▼
Leak check — fail closed
      │
      ▼
Lambda-safe payload budget
      │
      └───────────────────────┬─────────────────────────
                              ▼
                         AWS LAMBDA API
                              │
                         AI Gateway
                              │
                    semantic extraction
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
```

## Frontend boundary

The frontend owns document handling because raw candidate files do not need to reach Mimir's API. It performs:

- PDF/DOCX/TXT extraction;
- page provenance tagging;
- chart/graph/diagram detection;
- visual OCR/privacy scrubbing;
- candidate PII/sensitive-attribute masking;
- leak re-scan;
- visual resizing/compression;
- AWS Lambda payload budgeting;
- browser-local JD structure cache;
- browser-local anonymized Evidence Intelligence observations.

## Backend boundary

Lambda receives prepared evidence, not the original CV file. The backend owns:

- defense-in-depth text masking;
- AI secret/API call;
- schema validation;
- requirement claims;
- semantic evidence interpretation;
- entailment and inference boundaries;
- Odin adversarial verification;
- policy/substitution rules;
- deterministic scoring;
- evidence graph and score lineage;
- governance/audit packet;
- semantic PDF/DOCX exports.

## Serverless constraints deliberately handled

- Lambda is stateless. Browser-local Evidence Intelligence remains the persistence layer until a future enterprise database is added.
- In-memory `express-rate-limit` is disabled by default in Lambda because separate execution environments do not form a global rate limiter.
- Lambda synchronous request/response payloads are bounded. Browser payload budgeting prevents oversized evaluation requests.
- Pixel-perfect screenshot export is disabled in AWS mode to avoid uploading large screenshots; structured PDF/DOCX exports remain available.
- The frontend and backend are physically separate deployment units.

## Scoring authority

```text
AI semantic interpretation
        ↓
Evidence state / relationship
        ↓
Odin + policy authority cap
        ↓
Deterministic JavaScript
        ↓
Numerical score
```

AI never directly assigns Mimir's final candidate score.

## Future enterprise persistence

A future PostgreSQL/Supabase/Aurora layer can persist organization-scoped evidence intelligence, policies, evaluations and governance data. It is intentionally not required for the ₹0 launch architecture.
