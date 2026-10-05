# Mimir v4.5.0 — SEO Growth Foundation

This release keeps the v4.4.5 evaluation engine and fast DOCX visual pipeline intact. It adds search-engine discovery infrastructure without turning the evaluator homepage into a long marketing page.

## Added
- Search-focused homepage title, description, canonical URL, Open Graph and Twitter metadata.
- WebSite + WebApplication/SoftwareApplication JSON-LD.
- Crawlable favicon, logo, social preview image and web manifest.
- `robots.txt`, `sitemap.xml`, `llms.txt`.
- Dedicated crawlable pages for CV evaluator, AI CV screening, CV–JD matching, how Mimir works, evidence-based recruitment, GDPR/recruitment AI, EU AI Act/recruitment AI, privacy/data handling and About Mimir.
- Breadcrumb structured data on SEO pages.
- Quiet internal links from the evaluator footer to the topical pages.
- Canonical 301 redirect from `www.mimir.co.in` to `mimir.co.in`.
- `X-Robots-Tag: noindex, nofollow` on API responses.
- Real 404 responses for unknown public URLs to avoid soft-404 indexing.

## Not changed
- Evidence Graph
- Claim Model / entailment
- Evidence Boundaries
- Odin
- Deterministic scoring
- PII behavior
- PDF/DOCX extraction and v4.4.5 fast visual path

SEO can improve discoverability but no code change can guarantee a Google position. Authority, links, search demand, content usefulness and time still matter.
