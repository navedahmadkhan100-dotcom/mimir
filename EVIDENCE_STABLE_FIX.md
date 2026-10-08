# Mimir v1.0 — Evidence-Stable Brain v2.3

This release fixes a scoring regression introduced by the transport-safe CV evaluation path.

## What was wrong

A provider-safe/schema-free evaluation could return evidence as rendered-page visual observations even when the same words existed in the server-masked CV text. Mimir's evidence policy correctly prevents visual-only evidence from proving candidate ownership/authorship, so direct text-backed capabilities could be under-scored.

The dimension engine could also interpret generic `enterprise` wording as a quantitative scale requirement even where the JD did not ask for global/large-scale/numeric scope.

## Fixes

- Flat provider-safe CV structured-output contract; full authoritative schema remains enforced locally.
- Text-first evidence provenance instructions.
- Deterministic masked-CV text recovery when the model cites only a rendered page for text that is actually present in the CV.
- Recovered quotes remain verbatim and server-verifiable; visual observations never become ownership evidence themselves.
- `enterprise systems` / `enterprise data` no longer automatically create a scale dimension.
- Explicit scale is still evaluated when the JD actually says enterprise-wide, global, large-scale, multi-site/country, at scale, or gives a numeric magnitude.
- JD compiler is instructed to keep independently fail-able capabilities atomic, including enterprise integration vs engineering standardisation/reuse.
- Old JD caches are invalidated once for the new intelligence version.

## Regression coverage

Includes a Marco-style regression fixture where Gemini returns visual-only evidence despite direct ownership text existing in the masked CV. Mimir must recover verified text evidence before claim entailment/scoring and cannot collapse the requirement score because of the transport choice.
