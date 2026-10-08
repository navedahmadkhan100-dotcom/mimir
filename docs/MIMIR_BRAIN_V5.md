# Mimir Brain — Dimension Evidence Architecture

The public product label remains **Mimir v1.0**. Internally, the JD/evidence intelligence policy uses versioned 5.0 modules so scoring behavior can be audited independently from UI releases.

## Core pipeline

1. **JD Intelligence** — identify role intent, atomic capabilities, importance, AND/OR logic, candidate pathways, responsibility level and only the dimensions actually required by the JD.
2. **Evidence extraction** — extract verbatim CV evidence with provenance, project/role context, source type, actions, scale, recency and lifecycle signals.
3. **Capability cross-linking** — a verified CV quote may support more than one relevant requirement. Evidence is not trapped under the first requirement that cited it.
4. **Dimension entailment** — capability, responsibility, context, scale, exactness, lifecycle, duration, count and recency are evaluated independently.
5. **Deterministic scoring** — JavaScript combines dimension support using fixed importance multipliers and applies hard caps only to genuinely critical missing dimensions.
6. **Bidirectional Odin** — challenges both unsupported positive claims and false negatives where verified evidence was overlooked.
7. **Human governance** — ambiguous facts and behavioral/eligibility conditions remain verification items; Mimir does not auto-reject.

## Why dimensions matter

A sentence such as “own end-to-end implementation” is not one binary keyword match. It contains at least capability, responsibility and lifecycle dimensions. A candidate can prove implementation capability but not ownership, or ownership but only part of the lifecycle. Mimir scores those differences explicitly.

## Evidence authority

Mimir distinguishes evidence context. Role/project evidence and employment references can carry full responsibility authority. Professional summaries are useful but weaker if uncorroborated. Skills inventories can establish that a technology is listed but cannot independently prove architecture ownership. Visual evidence can support documented exposure but cannot prove authorship on its own.

## Important safety rules

- No numeric score comes from Gemini.
- No arbitrary company-prestige or title-prestige bonus.
- Generic reliability, punctuality and attention-to-detail claims do not create zero-score CV penalties.
- Missing CV evidence means “not established from this CV”, not “candidate definitely cannot do it”.
- Explicit mandatory skills, exact credentials, counts, durations and lifecycle conditions remain strict when the JD truly requires them.
- Multiple bullets from one role do not multiply the duration of that role.
- “Recent” experience is assessed only when the JD explicitly asks for recency.

## Permanent regression cases

The automated test suite contains cases based on real failure patterns observed during Mimir development:

- **Marco** — direct AI architecture ownership must not be lost between evidence extraction and scoring; related ownership evidence can corroborate multiple architecture requirements.
- **Jose** — UAT oversight must not be treated as proof of scenario authoring/prioritization/country review, while explicit cutover oversight must not be classified as no evidence.
- **Robotics** — reliability/punctuality remain interview/reference verification rather than score dilution.
- Skills-list-only ownership, duplicated-duration inflation and stale “recent” experience are also protected by regression tests.

## Validation status

Automated tests validate deterministic logic and integration contracts. They do not prove that a live LLM will extract every CV/JD perfectly. Production quality should be measured on a recruiter-reviewed benchmark at requirement/dimension level, not only by comparing final scores.
