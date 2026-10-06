# JD Intelligence Core v4.6 — Design and Limits

## One role interpretation, reused across candidates

```
JD file or pasted text (browser text + approved visuals)
    -> browser-prepared JD-only request
    -> server privacy recheck
    -> Gemini strict JD intelligence JSON (no CV present)
    -> normalized JD capability graph
    -> deterministic adaptive weighting (JavaScript)
    -> cached in browser local storage (versioned)
    -> CV evidence extraction with cached JD
    -> provenance validation + conservative cross-requirement recovery
    -> claim entailment + Odin + policy caps
    -> JavaScript scoring + source-backed audit + reports
```

## Schema

The strict JD-only JSON requires existing fields plus:

- `intelligence.role_intent`, `role_family`, `role_focus`, `ambiguities`, `pathways[]`;
- each requirement's `capability_name`, `intelligence_category`, `importance`, `importance_reason`, `explicit_tier`, `capability_group`, `responsibility_level`, `evidence_equivalents[]`, `partial_evidence[]`, `non_equivalents[]`, and `pathway_ids[]`;
- the original v4.5 requirement fields (`priority`, `strictness`, `requirement_logic`, exact technology, project counts, minimum years etc.) remain active.

Versions of legacy cached structures are excluded in the browser. Existing saved JD **text** is retained. The backend remains tolerant when older structured objects are passed directly: it normalizes missing intelligence fields using conservative categories and importance, rather than silently trusting client-provided numeric scores.

## Deterministic weighting rules

1. Exclude preferred/non-scored and generic behavioral/eligibility requirements from the numeric CV fit denominator. Show them as optional, gates or interview verification.
2. Group repeated JD responsibilities under `capability_group`; use the maximum weight in each group, then divide group weight between its rows. Duplication cannot multiply importance.
3. Combine `priority` (dealbreaker/critical/required...), `importance` (decisive/high/medium/supporting/optional), and explicit `P1/P2/P3` with documented JS multipliers. Inferred importance is not synonymous with mandatory status.
4. Normalize the total of scored capability groups to 100. Hence a technical-intensive job can legitimately yield approximately 90% technical weighting while a migration PM may emphasize operational delivery.
5. For alternative candidate pathways, recompute valid weights for each and select the highest evidenced eligible pathway. Do not combine two alternative requirements as simultaneous penalties.
6. Track selected pathway, category weights, scores, requirement weights, and score lineage in the audit.

### Source fidelity

The JD's wording is the source of truth. Explicit AND vs OR, mandatory vs preferred and named client requirements must not be converted into unrelated generic skills. Ambiguous BPNM/BPMN wording and contradictory Python/C# stack logic should be flagged for human clarification.

## Evidence safeguards

- A verified source quote can support multiple legitimate requirements.
- Raw terminology recovered deterministically is capped as a weak/contextual hint until semantic support is established; word presence alone does not prove ownership, authorship, or task completeness.
- UAT oversight ≠ authored country-level scenarios; cutover coordination ≠ owned end-to-end operational cutover.
- Generic trait absence is `not assessed`, not a negative personality judgment.
- Missing CV mention for a physical/onsite/legal condition is `verify`, NOT an automatic failure. Explicit contradictory evidence can be flagged as a conflict.
- Gemini never returns or controls final numeric candidate score.

## Operations and security

The existing privacy firewall, CSP, origin policy, rate limits, no-store API responses, size caps, no raw CV uploads and browser-only local caching are retained. JD-only calls have the same 30/min evaluation rate limiter.

No raw candidate data is stored server-side. The local browser cache may hold JD source text and structured JDs; clear browser storage for confidential JDs when required by organizational policy.

API timeouts and Gemini free-tier quotas still apply. New JDs require an extra JD-only Gemini compilation once, but reused JDs should not call Gemini again for interpretation.

## Benchmark status

`benchmarks/jd-intelligence-benchmark-v0.1.json` contains 12 expert-proposed role interpretations from our conversation. These are hypotheses, not ground truth. `test/jdIntelligence.test.js` covers dynamic weights, explicit priorities, duplicate suppression, branching paths, generic behavioral gates, reproducibility, ambiguous JDs and schema requirements.

The existing 50-CV benchmarking plan remains necessary for measuring real-world semantic recall, false negatives, false positives and overall score calibration.
