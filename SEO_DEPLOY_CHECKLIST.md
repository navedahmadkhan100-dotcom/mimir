# SEO Deployment Checklist — Mimir v4.5.0

## After GitHub/Render deployment
1. Confirm `https://mimir.co.in/api/health` reports `4.5.0`.
2. Open `https://mimir.co.in/robots.txt`.
3. Open `https://mimir.co.in/sitemap.xml`.
4. Open `https://mimir.co.in/cv-evaluator/` and `https://mimir.co.in/how-mimir-works/`.
5. Confirm a nonsense URL such as `/this-page-does-not-exist` returns HTTP 404.

## Google Search Console — required manual step
1. Go to Google Search Console.
2. Add a **Domain property** for `mimir.co.in`.
3. Google will provide a TXT DNS record. Add that TXT record in GoDaddy DNS and verify.
4. In Search Console → Sitemaps, submit: `https://mimir.co.in/sitemap.xml`.
5. Use URL Inspection and request indexing for:
   - `https://mimir.co.in/`
   - `https://mimir.co.in/cv-evaluator/`
   - `https://mimir.co.in/how-mimir-works/`
   - `https://mimir.co.in/evidence-based-recruitment/`
6. Monitor Pages/Indexing, Core Web Vitals and Search performance queries.

## Ranking work after indexing
- Publish genuinely useful recruiter-led articles/case studies regularly rather than mass-producing generic AI pages.
- Earn relevant links from recruitment/HR-tech sites, LinkedIn articles, product directories and technical/recruitment communities.
- Use Search Console query data to expand pages that already receive impressions.
- Build branded mentions using the exact phrase `Mimir — Find the Worthy` and category phrase `AI CV Evaluator for Recruiters`.
- Do not buy bulk backlinks or create hundreds of thin keyword pages.
