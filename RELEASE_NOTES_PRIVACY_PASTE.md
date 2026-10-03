# Mimir v4.3.3 — pasted-CV privacy firewall fix

- Fixed a false-positive where `Location: [LOCATION_REDACTED]` could re-trigger the address detector during the second-pass privacy scan.
- `possibleEmployer` is no longer a hard-blocking leak signal because employer detection is heuristic and can misclassify capitalised CV headings. Obvious employer lines are still pseudonymised before transmission.
- Direct identifiers (name, email, phone, profile URLs, address/location, clearance, IDs, etc.) remain hard-blocking if residual data is detected.
- Privacy rules version bumped to `privacy-firewall-2.3.0`.
