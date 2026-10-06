# Mimir — Find the Worthy v4.6.4

**Evidence-Based Intelligent Engine — JD Intelligence Core**

This is the upgraded version of the **user-supplied Mimir v4.5.0 SEO Growth Foundation**. The existing Render fullstack project, identity masking, browser-based PDF/DOCX parsing, evidence graph, deterministic scoring, Odin, reports, API endpoint, SEO pages and configuration have been retained. The JD understanding pipeline is expanded.

## What changed

- **Analyze a JD without a CV**: `✧ Understand this JD` compiles a role profile using Gemini and shows a preview of role intent, inferred importance by capability category, responsibilities, conditional sourcing pathways and JD ambiguities.
- **JD-first, frozen before CV evaluation**: Gemini's JD-only generation now has a structured semantic schema; a CV never appears in that stage.
- **Role-specific weights**: JavaScript computes normalized weights from semantic priority, explicit P1/P2/P3 and distinct capability groups. Identical job titles do NOT share fixed percentages. Gemini does not output percentages.
- **Technical / Functional-domain / Operational-delivery / Behavioral / Eligibility**: generic traits are for verification, and eligibility/physical checks stay separate from CV capability scoring.
- **True alternatives and pathways**: preserve mandatory vs preferred, AND/OR options, and tiered candidate paths, such as Pensions BA Tier 1/Tier 2.
- **Evidence quality**: a recovered exact phrase or shared action is a conservative signal, not full proof of the JD responsibility.
- **Audit and reports**: evaluation response includes `jdIntelligence`, `adaptiveWeighting`, normalized requirement weights, and JD ambiguity flags. PDF/DOCX structured exports include JD intent and derived category weights.
- **Local caching**: the browser reuses the structured JD across CV evaluations, invalidating previous-version JD structures. Old saved JD text remains usable.

The scope of the upgrade is **JD interpretation and its integration with candidate evaluation**. It does not train a new model, introduce a server-side database, add automated hiring decisions, or change existing single-CV input into multi-CV upload.

## How to deploy on existing GitHub + Render (step-by-step)

1. Extract the ZIP. Open the `Mimir-v4.6.4-GitHub-Ready` folder.
2. Open your **existing** Mimir GitHub repository. Do not create a second repository if you want to update the existing deployment.
3. Upload the **contents** of this folder to the repository, replacing old matching files while retaining the repository's other unrelated settings. If GitHub web upload is awkward, use GitHub Desktop to commit these files.
4. Confirm Render is connected to that repository and branch. Its `render.yaml` still uses `npm install` and `npm start`, on Node 22.
5. Keep `GEMINI_API_KEY` in **Render → Environment**, not in client code or GitHub. Existing `AI_PROVIDER=gemini` remains.
6. Deploy the new commit. Verify `/api/health` shows version `4.6.4` and `jdIntelligenceVersion` beginning `4.6.0`.
7. Open your site in a private browser tab to avoid cached HTML/JS. Paste a JD, click **Understand this JD**. Confirm role intent and adaptive weights are displayed without requiring a CV.
8. Upload a CV and click **Find the Worthiness**. Confirm the new score panel still includes quote-backed evidence, claims, Odin and the JD Intelligence panel.
9. Use a second CV against the same JD: Mimir should reuse the locally cached JD profile and perform only a fresh candidate evaluation. Inspect Network requests to confirm.
10. Test at least the 12 JDs supplied in `benchmarks/jd-intelligence-benchmark-v0.1.json`; have a recruiter review any inferred weights and ambiguities before relying on them.

### Local run

```bash
npm install
cp .env.example .env      # add GEMINI_API_KEY; never commit .env
npm run check
npm test
npm start
```

Open `http://localhost:3000`. Node 22.13 or later is required.

## New API

`POST /api/jd/analyze` with JSON:

```json
{
  "jdText": "Senior Azure DevOps Engineer ...",
  "jdVisualAssets": [],
  "privacy": { "clientPrepared": true }
}
```

Returns `structuredJd`, `jdIntelligence`, `jdAudit`, `jdHash`, `analysisMeta`. It does NOT accept or process candidate CV data.

`POST /api/evaluate` retains the existing request format and adds `jdIntelligence` and `adaptiveWeighting` to its response. The first new JD needs one Gemini JD compilation plus one candidate evaluation; subsequent candidate evaluations reuse the compiled local JD.

## Limitations

This release's weights are **inferred**, not hiring-manager-confirmed. No empirical calibration against actual placement outcomes has been completed. Gemini can still misclassify a role or omit relevant evidence; the correct response is human review and further benchmarking, not automatic rejection. Real API execution must be verified on your own Render instance with a valid GEMINI_API_KEY. See `docs/JD_INTELLIGENCE_V4_6.md` for detailed design and safety boundaries.


## GitHub-ready package (v4.6.4)

This slim upload preserves the full application, backend, SEO pages, benchmark, and automated tests, but excludes visual previews, historical release notes and validation logs. Extract the ZIP **before uploading**; upload the files and folders inside it, not the ZIP itself. On an existing repository, GitHub uploading these files does **not** delete older files; obsolete documentation already in your repo can be deleted separately if desired. Keep your `GEMINI_API_KEY` only in Render environment variables.
