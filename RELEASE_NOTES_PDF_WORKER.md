# Mimir v4.3.2 — PDF Worker Fix

- Configures PDF.js v4 `GlobalWorkerOptions.workerSrc` before any PDF parsing.
- Removes redundant direct PDF.js module script from `index.html`; the document client owns the import and worker configuration.
- Fixes browser error: `No "GlobalWorkerOptions.workerSrc" specified.`
