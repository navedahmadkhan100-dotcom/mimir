# Mimir — Find the Worthy v1.0

**Evidence-Based Intelligent Engine · Qualification Ledger Architecture**

This build keeps the current Mimir v1.0 interface while replacing broad technical / functional / operational percentage scoring with direct qualification-level scoring.

## Brain architecture

1. **JD Qualification Compiler** — Gemini reads the JD once and extracts independent, recruiter-verifiable qualifications. Repeated wording is de-duplicated; AND/OR, pathways, mandatory/preferred items, gates and verification items are preserved.
2. **Qualification Ledger** — deterministic JavaScript assigns a score share directly to each score-bearing qualification. Broad semantic categories never control the candidate score.
3. **CV Evidence Matcher** — Gemini retrieves verbatim, provenance-aware evidence against the frozen JD. It never outputs a candidate score.
4. **Local evidence reconciliation** — Mimir verifies text quotes against the masked CV, prefers text evidence over rendered-page evidence, and can reuse a verified quote across every genuinely relevant qualification.
5. **Dimension scoring** — capability, responsibility, context, scale, exactness, lifecycle, duration, count and recency are activated only when the JD actually requires them.
6. **Odin consistency audit** — Odin challenges both over-crediting and false negatives before deterministic scoring is finalised.

## Important scoring rules

- `enterprise integration` is context; it is **not** automatically a quantitative scale requirement.
- Exact technology/version/credential constraints remain exact when the JD says so.
- Oversight does not prove execution; support does not prove ownership.
- Role/project and employment-reference evidence outrank a skills list for ownership/depth conclusions.
- Generic reliability, punctuality, communication and attention-to-detail are interview verification rather than silent CV-score penalties.
- Concrete stakeholder responsibilities such as collaborating with Product, Data and IT remain score-bearing when the CV can evidence them.
- Repeated JD wording cannot inflate a capability's score share.
- Multiple bullets from the same role/project cannot multiply duration or counted-project evidence.

## Transport reliability and speed

Mimir does **not** send its deep internal JD/CV schemas to Google. Normal requests use Gemini 3.5 Flash-Lite with compact stage-specific prompts and schema-free JSON transport. Mimir reconstructs and validates the full internal structures locally.

The normal warm path is one Gemini call per CV. Cross-endpoint fallbacks are used only for provider-format/transport failures. Text-rich documents send only a bounded set of useful visual pages; scanned/image-heavy documents retain visual analysis.

## Regression suite

The suite contains Marco, Jose, Robotics, AND/OR, exact-tool, credentials, counted-project, lifecycle, privacy, transport and UI regressions. Run:

```bash
npm install
npm run check
npm test
npm start
```

## Render deployment

Keep `GEMINI_API_KEY` only in **Render → Environment**. After deployment, hard-refresh the browser. Old structured JD profiles are intentionally invalidated and recompiled once under the Qualification Ledger profile, then cached locally again.

## Important limitation

No external AI service can be guaranteed never to experience an outage, quota error or network failure. This build removes the known provider-schema `INVALID_ARGUMENT` failure class, strips malformed provider extras locally, and has compatibility fallbacks. Mimir never turns missing evidence into proof that a candidate lacks a capability, and it never auto-rejects.

See `docs/MIMIR_BRAIN_V5.md` for implementation notes (the filename is retained for repository compatibility; the document describes the current Qualification Ledger brain).
