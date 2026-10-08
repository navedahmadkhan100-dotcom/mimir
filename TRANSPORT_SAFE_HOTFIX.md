# Mimir v1.0 — Transport-Safe Gemini Hotfix

This build fixes the CV-evaluation `400 Request contains an invalid argument` without reducing Mimir's intelligence model.

## What changed

- JD Understanding remains on Gemini Interactions structured output because that smaller schema is working.
- CV Evaluation no longer sends Mimir's deep evidence graph schema to Google's provider-side schema parser.
- Primary CV transport uses `generateContent` JSON MIME mode with the same Brain v2.1 semantic instruction.
- If Google rejects that transport with `INVALID_ARGUMENT`, Mimir automatically switches once to schema-free Interactions using the same model, prompt and visual assets.
- The full Mimir evidence schema is still enforced locally with AJV before deterministic scoring.
- No scoring dimensions, evidence rules, ownership/scale reasoning, Odin checks, or UI behavior were removed.
- Render logs now expose the provider status/reason/message more clearly if a future API contract issue occurs.

The fallback is intentionally limited to provider `400/INVALID_ARGUMENT`; timeouts, quotas and other errors are not blindly retried.
