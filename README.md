# Mimir — Find the Worthy v4.3 (Render Fullstack)

This release repackages the v4.2 Evidence Intelligence architecture as one Render web service.

## Preserved architecture
- Browser-side PDF/DOCX/TXT preparation
- Client-side candidate privacy firewall and leak checks
- Sanitized text + sanitized visual evidence (charts, graphs, architecture diagrams)
- Gemini as replaceable semantic engine, not numerical scorer
- Claim Model, Evidence Semantics, Entailment, Evidence Boundaries
- Odin adversarial verification
- Capability / policy engine
- Deterministic JavaScript scoring
- Evidence Graph, score lineage, verification questions, governance packet
- Browser-local Evidence Intelligence

## Render deployment
Build command: `npm install`
Start command: `npm start`
Health check: `/api/health`

Required environment variable:
`GEMINI_API_KEY`

Recommended environment variables:
- `AI_PROVIDER=gemini`
- `SCORING_REFERENCE_YEAR=2026`
- `MIMIR_DEPLOYMENT=render`
- `ALLOWED_ORIGINS=https://mimir.co.in,https://www.mimir.co.in`

Do not commit a real `.env` file or API key.
