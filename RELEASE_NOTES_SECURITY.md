# Mimir v4.4.0 — Security-Hardened Architecture

This release follows the full-system audit after v4.3.6.

Major changes:
- freezes JD structure before candidate CV reaches the AI on first evaluation;
- adds prompt-injection boundaries;
- adds CSP, browser-origin controls, no-store API headers and route-specific rate limits;
- pins reviewed security-sensitive dependencies;
- upgrades Mammoth and pins Tesseract;
- adds strict text/visual/export/resource limits and DOCX zip-bomb protections;
- aligns browser/server payload budgets and compresses prepared visual evidence;
- adds AI timeout handling;
- hardens API errors and unknown routes;
- adds 13 security/architecture regression checks, bringing the suite to 52 passing tests.

See SECURITY_AUDIT.md for residual risks and the required live smoke-test gate.
