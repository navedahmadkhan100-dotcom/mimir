# Mimir — Find the Worthy v1.0

**Evidence-Based Intelligent Engine · Dimension Evidence Architecture**

This build keeps the latest Mimir v1.0 interface while upgrading the intelligence pipeline that sits between JD understanding, CV evidence and deterministic scoring.

## What changed in the brain

- **JD-first role understanding** remains mandatory. Candidate data cannot influence first-pass JD compilation.
- **Atomic requirements and compound logic**: Gemini is instructed to split independently fail-able capabilities, preserve AND/OR logic, and use `all_of` when a compound requirement genuinely requires every sub-capability.
- **Dimension-level evaluation**: capability, responsibility, context, scale, exactness, lifecycle, duration, count and explicit recency are assessed independently instead of collapsing a requirement into one coarse label.
- **Cross-requirement evidence reuse**: a verified ownership or architecture quote can corroborate every relevant requirement rather than being trapped under one requirement.
- **Evidence authority**: role/project records and employment references carry more authority than a skills inventory for ownership/leadership conclusions.
- **Bidirectional Odin**: Odin now detects both over-claiming and false negatives such as “ownership not established” when a relevant quote explicitly says the candidate owned the architecture.
- **Boundary-only policy caps**: generic labels such as `contextual` no longer impose an unexplained 55% ceiling. Hard caps are reserved for real boundaries such as missing exact mandatory technology/credential, missing ownership when ownership is critical, or incomplete E2E lifecycle.
- **Duration de-duplication**: multiple bullets from the same role/project cannot multiply years of experience.
- **Recency awareness**: “recent/current hands-on” becomes a scored dimension only when the JD asks for it.
- **Browser cache invalidation**: old v4.6 JD profiles are not reused with the new brain. Saved raw JD text remains available and is re-analysed.

## Permanent regression cases

The suite includes Marco/Jose/Robotics-derived tests plus exact technology, certification, counted-project, lifecycle, alternative-stack, privacy and UI regressions.

Run:

```bash
npm install
npm run check
npm test
npm start
```

## Render deployment

Keep `GEMINI_API_KEY` only in **Render → Environment**. Existing Render configuration remains compatible. After deployment, hard-refresh the browser. Previously structured JDs will be recompiled once under the new JD profile version and then cached locally again.

## Important limitation

No CV evaluator can infer facts that are absent from a CV with certainty. Mimir reports evidence strength and uncertainty; it does not convert missing evidence into proof of inability and it does not auto-reject. The strongest next validation step is a recruiter-reviewed benchmark at requirement/dimension level.

See `docs/MIMIR_BRAIN_V5.md` for the architecture.
