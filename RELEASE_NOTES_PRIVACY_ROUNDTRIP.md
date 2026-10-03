# Mimir v4.3.6 — Privacy Round-trip Fix

Fixes a server-side privacy false positive where already-safe browser pseudonyms such as `Employer 7` were re-detected as employer PII by the backend defense-in-depth scan, causing evaluation to be blocked after the browser privacy firewall had already passed.

Changes:
- `Employer N` pseudonyms are now terminal safe placeholders in both browser and server privacy logic.
- Server redaction is idempotent for browser-prepared employer placeholders.
- Added an end-to-end browser → server privacy regression using the full CEIPAL-style Oracle CV that reproduced the live failure.
- Privacy rules version bumped to `privacy-firewall-2.5.0`.
